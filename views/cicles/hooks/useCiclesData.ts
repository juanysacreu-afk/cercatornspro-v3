import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../../supabaseClient';
import { Assignment } from '../../../types';
import { useToast } from '../../../components/ToastProvider';

const FLEET_CONFIG = [
    { serie: '112', count: 22 },
    { serie: '113', count: 19 },
    { serie: '114', count: 5 },
    { serie: '115', count: 15 },
];

export const useCiclesData = (parkedUnits: any[], onParkedUnitsChange: () => Promise<void>) => {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [assignments, setAssignments] = useState<Assignment[]>([]);

    // Status Sets
    const [brokenTrains, setBrokenTrains] = useState<Set<string>>(new Set());
    const [imageTrains, setImageTrains] = useState<Set<string>>(new Set());
    const [recordTrains, setRecordTrains] = useState<Set<string>>(new Set());
    const [cleaningTrains, setCleaningTrains] = useState<Set<string>>(new Set());

    // Data Lists
    const [maintenanceAlerts, setMaintenanceAlerts] = useState<any[]>([]);
    const [unitKilometers, setUnitKilometers] = useState<any[]>([]);
    const [availableShiftsCycles, setAvailableShiftsCycles] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]); // Keep local notification system or migrate to ToastProvider fully? Keeping local for now as it's custom.

    // Calculate all fleet trains once
    const allFleetTrains = useMemo(() => {
        const t: string[] = [];
        FLEET_CONFIG.forEach(c => { for (let i = 1; i <= c.count; i++) t.push(`${c.serie}.${i.toString().padStart(2, '0')}`); });
        return t;
    }, []);

    const addNotification = (type: string, title: string, message: string) => {
        const id = Math.random().toString(36).substr(2, 9);
        setNotifications(prev => [...prev, { id, type, title, message }]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);

        // Also show system toast for redundancy/better visibility
        if (type === 'error') showToast(message, 'error');
        else if (type === 'success') showToast(message, 'success');
    };

    const fetchAllData = async () => {
        setLoading(true);
        try {
            const [assigData, statusData, kmRes] = await Promise.all([
                supabase.from('assignments').select('*').order('created_at', { ascending: false }),
                supabase.from('train_status').select('*'),
                supabase.from('unit_kilometers').select('*').order('date', { ascending: false }).order('created_at', { ascending: false })
            ]);

            if (assigData.data) setAssignments(assigData.data);
            if (kmRes.data) setUnitKilometers(kmRes.data);
            if (statusData.data) {
                const broken = new Set<string>();
                const images = new Set<string>();
                const records = new Set<string>();
                const cleaning = new Set<string>();
                const alerts: any[] = [];
                statusData.data.forEach((s: any) => {
                    if (s.is_broken) { broken.add(s.train_number); alerts.push({ unit: s.train_number, type: 'BROKEN', since: s.broken_at || s.updated_at, notes: s.broken_notes }); }
                    if (s.needs_images) { images.add(s.train_number); alerts.push({ unit: s.train_number, type: 'IMAGES', since: s.images_at || s.updated_at, notes: s.images_notes }); }
                    if (s.needs_records) { records.add(s.train_number); alerts.push({ unit: s.train_number, type: 'RECORDS', since: s.records_at || s.updated_at, notes: s.records_notes }); }
                    if (s.needs_cleaning) { cleaning.add(s.train_number); alerts.push({ unit: s.train_number, type: 'CLEANING', since: s.cleaning_at || s.updated_at, notes: s.cleaning_notes }); }
                });
                setBrokenTrains(broken); setImageTrains(images); setRecordTrains(records); setCleaningTrains(cleaning); setMaintenanceAlerts(alerts);
            }
        } catch (e) { console.error("Error loading fleet data:", e); } finally { setLoading(false); }
    };

    const fetchAvailableCycles = async () => {
        const { data } = await supabase.from('shifts').select('circulations');
        if (data) {
            const cycles = new Set<string>();
            data.forEach(s => (s.circulations as any[])?.forEach(c => { if (c.cicle) cycles.add(c.cicle); }));
            setAvailableShiftsCycles(Array.from(cycles).sort());
        }
    };

    // Initial Load
    useEffect(() => {
        fetchAllData();
        fetchAvailableCycles();
    }, []);


    // -- Actions --

    const handleSaveAssignment = async (newCycleId: string, newTrainId: string) => {
        if (!newCycleId || !newTrainId) return;
        if (brokenTrains.has(newTrainId)) { addNotification('error', 'Unitat Avariada', `La unitat ${newTrainId} està avariada.`); return; }
        if (assignments.find(a => a.train_number === newTrainId)) { addNotification('error', 'Unitat Ocupada', `La unitat ${newTrainId} ja està assignada.`); return; }
        if (assignments.find(a => a.cycle_id === newCycleId)) { addNotification('error', 'Cicle Ocupat', `El cicle ${newCycleId} ja té una unitat.`); return; }

        setSaving(true);
        const { error } = await supabase.from('assignments').upsert({ cycle_id: newCycleId, train_number: newTrainId });
        if (!error) {
            await fetchAllData();
            addNotification('success', 'Assignació Guardada', `Unitat ${newTrainId} assignada al cicle ${newCycleId}`);
        } else {
            addNotification('error', 'Error al guardar', error.message);
        }
        setSaving(false);
        return !error; // Return success status
    };

    const handleDeleteAssignment = async (id: string) => {
        if (!id) return;
        const { error } = await supabase.from('assignments').delete().eq('cycle_id', id);
        if (!error) await fetchAllData();
        else addNotification('error', 'Error al eliminar', error.message);
    };

    const handleDeleteAllAssignments = async () => {
        setLoading(true);
        await supabase.from('assignments').delete().neq('cycle_id', '');
        await fetchAllData();
        setLoading(false);
    };

    const handleToggleStatus = async (trainNum: string, field: string, current: boolean) => {
        const dateField = field === 'is_broken' ? 'broken_at' : field === 'needs_cleaning' ? 'cleaning_at' : field === 'needs_images' ? 'images_at' : 'records_at';
        const update: any = {
            train_number: trainNum,
            [field]: !current,
            updated_at: new Date().toISOString()
        };
        if (!current) {
            update[dateField] = new Date().toISOString();
        } else {
            update[dateField] = null;
        }
        const { error } = await supabase.from('train_status').upsert(update, { onConflict: 'train_number' });
        if (!error) await fetchAllData();
        else addNotification('error', 'Error al actualitzar estat', error.message);
    };

    const handleUpdateStatusDate = async (trainNum: string, type: string, newDate: string) => {
        const fieldMap: any = { 'BROKEN': 'broken_at', 'CLEANING': 'cleaning_at', 'IMAGES': 'images_at', 'RECORDS': 'records_at' };
        const dateField = fieldMap[type];
        if (!dateField) return;

        const { error } = await supabase.from('train_status').update({ [dateField]: newDate, updated_at: new Date().toISOString() }).eq('train_number', trainNum);
        if (!error) await fetchAllData();
    };

    const handleUpdateNotes = async (trainNum: string, type: string, notes: string) => {
        const fieldMap: any = { 'BROKEN': 'broken_notes', 'CLEANING': 'cleaning_notes', 'IMAGES': 'images_notes', 'RECORDS': 'records_notes' };
        const notesField = fieldMap[type];
        if (!notesField) return;

        const { error } = await supabase.from('train_status').update({ [notesField]: notes, updated_at: new Date().toISOString() }).eq('train_number', trainNum);
        if (!error) await fetchAllData();
    };

    const handleAddParkedUnit = async (unit: string, depot: string, track: string, capacity: number) => {
        // Validation moved here or keep inside component? Probably best here if we pass parkedUnits
        // Check capacity
        if (parkedUnits.filter(u => u.depot_id === depot && u.track === track).length >= capacity) {
            addNotification('error', 'Via Plena', 'Capacitat màxima assolida.');
            return;
        }
        if (parkedUnits.find(u => u.unit_number === unit)) {
            addNotification('error', 'Unitat Duplicada', 'Ja està estacionada.');
            return;
        }

        const { error } = await supabase.from('parked_units').upsert({ unit_number: unit.toUpperCase(), depot_id: depot, track: track, updated_at: new Date().toISOString() });
        if (!error) await onParkedUnitsChange();
        else addNotification('error', 'Error al estacionar', error.message);
    };

    const handleRemoveParkedUnit = async (unit: string) => {
        const { error } = await supabase.from('parked_units').delete().eq('unit_number', unit);
        if (!error) await onParkedUnitsChange();
        else addNotification('error', 'Error al treure unitat', error.message);
    };

    const handleSaveKilometers = async (unit: string, date: string, km: number) => {
        if (!unit || !date || isNaN(km)) return false;
        setSaving(true);
        const { error } = await supabase.from('unit_kilometers').insert({
            unit_number: unit,
            date: date,
            kilometers: km
        });
        setSaving(false);
        if (!error) {
            addNotification('success', 'Kilòmetres Registrats', `S'ha registrat la lectura per a la unitat ${unit}.`);
            await fetchAllData();
            return true;
        } else {
            addNotification('error', 'Error al guardar KM', error.message);
            return false;
        }
    };

    const handleDeleteKilometerRecord = async (id: string) => {
        const { error } = await supabase.from('unit_kilometers').delete().eq('id', id);
        if (!error) {
            addNotification('success', 'Registre eliminat', 'La lectura s\'ha suprimit correctament.');
            await fetchAllData();
        } else {
            addNotification('error', 'Error al eliminar KM', error.message);
        }
    };

    return {
        // State
        loading, saving,
        assignments,
        brokenTrains, imageTrains, recordTrains, cleaningTrains,
        maintenanceAlerts, unitKilometers, availableShiftsCycles,
        allFleetTrains, notifications, FLEET_CONFIG,

        // Actions
        fetchAllData,
        handleSaveAssignment,
        handleDeleteAssignment,
        handleDeleteAllAssignments,
        handleToggleStatus,
        handleUpdateStatusDate,
        handleUpdateNotes,
        handleAddParkedUnit,
        handleRemoveParkedUnit,
        handleSaveKilometers,
        handleDeleteKilometerRecord
    };
};
