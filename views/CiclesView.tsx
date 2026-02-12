import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MapPin,
  Train,
  ArrowRight,
  Trash2,
  Loader2,
  X,
  Camera,
  FileText,
  Brush,
  AlertTriangle,
  CheckCircle2,
  Link as LinkIcon,
  Hash,
  Save,
  Filter,
  LayoutGrid,
  Bell,
  History,
  Gauge,
  Info,
  Clock,
  TrendingUp
} from 'lucide-react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { supabase } from '../supabaseClient.ts';
import { Assignment } from '../types.ts';
import GlassPanel from '../components/common/GlassPanel';
import { Skeleton, CardSkeleton, ListSkeleton } from '../components/common/Skeleton';

const FLEET_CONFIG = [
  { serie: '112', count: 22 },
  { serie: '113', count: 19 },
  { serie: '114', count: 5 },
  { serie: '115', count: 15 },
];

const DEPOT_CAPACITIES_LOCAL: Record<string, { total: number; label: string }> = {
  'PC': { total: 5, label: 'Plaça Catalunya' },
  'RE': { total: 6, label: 'Reina Elisenda' },
  'RB': { total: 28, label: 'Rubí (COR)' },
  'NA': { total: 15, label: 'Terrassa' },
  'PN': { total: 12, label: 'Sabadell' },
};

const DEPOT_LAYOUTS: Record<string, {
  sections: {
    name: string;
    tracks: {
      id: string;
      label: string;
      capacity: number;
    }[];
  }[];
}> = {
  'PC': { sections: [{ name: 'Estació', tracks: [{ id: '1', label: 'Via 1', capacity: 1 }, { id: '2', label: 'Via 2', capacity: 1 }, { id: '3', label: 'Via 3', capacity: 1 }, { id: '4', label: 'Via 4', capacity: 1 }, { id: '5', label: 'Via 5', capacity: 1 }] }] },
  'RE': { sections: [{ name: 'Depòsit', tracks: [{ id: '1', label: 'Via 1', capacity: 3 }, { id: '2', label: 'Via 2', capacity: 3 }] }] },
  'NA': { sections: [{ name: 'Estació', tracks: [{ id: 'E1', label: 'Via 1 (Est.)', capacity: 2 }, { id: 'E2', label: 'Via 2 (Est.)', capacity: 2 }] }, { name: 'Zona Maniobres', tracks: [{ id: 'M1', label: 'Via 1 (Man.)', capacity: 2 }, { id: 'M2', label: 'Via 2 (Man.)', capacity: 1 }] }, { name: 'Depòsit', tracks: [{ id: 'D1', label: 'Via 1 (Dep.)', capacity: 2 }, { id: 'D2', label: 'Via 2 (Dep.)', capacity: 2 }, { id: 'D3', label: 'Via 3 (Dep.)', capacity: 2 }, { id: 'D4', label: 'Via 4 (Dep.)', capacity: 2 }] }] },
  'PN': { sections: [{ name: 'Estació', tracks: [{ id: 'E1', label: 'Via 1', capacity: 2 }, { id: 'E2', label: 'Via 2', capacity: 2 }] }, { name: 'Depòsit', tracks: [{ id: '1A', label: 'Via 1A', capacity: 2 }, { id: '1B', label: 'Via 1B', capacity: 1 }, { id: '0A', label: 'Via 0A', capacity: 1 }, { id: '0B', label: 'Via 0B', capacity: 1 }, { id: '2A', label: 'Via 2A', capacity: 1 }, { id: '2B', label: 'Via 2B', capacity: 2 }] }] },
  'RB': { sections: [{ name: 'Platja de Vies', tracks: [{ id: '4', label: 'Via 4', capacity: 6 }, { id: '6', label: 'Via 6', capacity: 6 }, { id: '8', label: 'Via 8', capacity: 3 }, { id: '10', label: 'Via 10', capacity: 2 }] }, { name: 'Taller', tracks: [{ id: '1', label: 'Via 1 (Torn)', capacity: 2 }, { id: '9', label: 'Via 9', capacity: 1 }, { id: '11', label: 'Via 11', capacity: 1 }, { id: '13', label: 'Via 13', capacity: 1 }, { id: '15', label: 'Via 15', capacity: 1 }, { id: '17', label: 'Via 17', capacity: 1 }, { id: '19', label: 'Via 19', capacity: 1 }] }, { name: 'IF', tracks: [{ id: '21', label: 'Via 21', capacity: 1 }, { id: '23', label: 'Via 23', capacity: 1 }, { id: '25', label: 'Via 25', capacity: 1 }] }] }
};

type OriginStation = 'ALL' | 'PC' | 'RE' | 'RB' | 'NA' | 'PN';
type FilterMode = 'SORTIDA' | 'RETIR';
type ViewMode = 'FLEET' | 'DEPOTS' | 'MAINTENANCE' | 'KILOMETERS';

interface CiclesViewProps {
  parkedUnits: any[];
  onParkedUnitsChange: () => Promise<void>;
}

const DraggableUnit = ({ unit, isBroken, needsImages, needsRecords, needsCleaning }: { unit: string; isBroken: boolean; needsImages: boolean; needsRecords: boolean; needsCleaning: boolean }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'UNIT',
    item: { unit_number: unit },
    collect: (monitor) => ({ isDragging: !!monitor.isDragging() }),
  }));

  return (
    <div
      ref={(el) => { if (el) drag(el); }}
      className={`min-w-[120px] sm:min-w-[140px] p-3 rounded-2xl border flex items-center gap-3 cursor-grab active:cursor-grabbing shadow-md hover:shadow-xl transition-shadow ${isDragging ? 'opacity-40' : 'opacity-100'} ${isBroken
        ? 'bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30'
        : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-white/10'
        }`}
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isBroken ? 'bg-red-500 text-white' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600'}`}>
        {isBroken ? <AlertTriangle size={16} /> : <Train size={16} />}
      </div>
      <div className="min-w-0 font-black">
        <p className={`text-xs truncate ${isBroken ? 'text-red-700 dark:text-red-400' : 'text-fgc-grey dark:text-white'}`}>{unit}</p>
        <div className="flex gap-1 mt-0.5">
          {needsImages && <Camera size={10} className="text-blue-500" />}
          {needsRecords && <FileText size={10} className="text-yellow-500" />}
          {needsCleaning && <Brush size={10} className="text-orange-500" />}
        </div>
      </div>
    </div>
  );
};

const DroppableTrack = ({ track, units, onDropUnit, onRemoveUnit, brokenTrains, imageTrains, recordTrains, cleaningTrains, capacity }: any) => {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: 'UNIT',
    drop: (item: { unit_number: string }) => onDropUnit(item.unit_number, track.id),
    collect: (monitor) => ({ isOver: !!monitor.isOver(), canDrop: !!monitor.canDrop() }),
  }));

  return (
    <div
      ref={(el) => { if (el) drop(el); }}
      className={`relative p-4 rounded-3xl border-2 border-dashed transition-all min-h-[100px] flex items-center gap-4 ${isOver ? 'bg-blue-500/10 border-blue-500 scale-[1.01]' : canDrop ? 'bg-blue-500/5 border-blue-500/30' : 'bg-gray-50/50 dark:bg-black/20 border-gray-100 dark:border-white/5'}`}
    >
      <div className="w-16 h-12 bg-white dark:bg-gray-800 border border-gray-100 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center shadow-sm shrink-0">
        <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter leading-none mb-1">VIA</span>
        <span className="text-sm font-black text-blue-600 leading-none">{track.id}</span>
        <div className={`mt-1 py-0.5 px-2 rounded-full text-[8px] font-black ${units.length >= capacity ? 'bg-red-500 text-white' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'}`}>
          {units.length}/{capacity}
        </div>
      </div>
      <div className="flex-1 flex gap-3 overflow-x-auto py-8 px-4 no-scrollbar">
        {units.length > 0 ? units.map((u: any, i: number) => (
          <div key={i} className="relative group/unit">
            <DraggableUnit
              unit={u.unit_number}
              isBroken={brokenTrains.has(u.unit_number)}
              needsImages={imageTrains.has(u.unit_number)}
              needsRecords={recordTrains.has(u.unit_number)}
              needsCleaning={cleaningTrains.has(u.unit_number)}
            />
            <button onClick={() => onRemoveUnit(u.unit_number)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/unit:opacity-100 transition-all shadow-lg z-10"><X size={10} /></button>
          </div>
        )) : <div className="text-[10px] font-bold text-gray-300 dark:text-gray-700 uppercase tracking-widest italic ml-4">Lliure (Arrossega aquí)</div>}
      </div>
    </div>
  );
};

const CiclesView: React.FC<CiclesViewProps> = ({ parkedUnits, onParkedUnitsChange }) => {
  const [newCycleId, setNewCycleId] = useState('');
  const [newTrainId, setNewTrainId] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [brokenTrains, setBrokenTrains] = useState<Set<string>>(new Set());
  const [imageTrains, setImageTrains] = useState<Set<string>>(new Set());
  const [recordTrains, setRecordTrains] = useState<Set<string>>(new Set());
  const [cleaningTrains, setCleaningTrains] = useState<Set<string>>(new Set());
  const [availableShiftsCycles, setAvailableShiftsCycles] = useState<string[]>([]);
  const [showCycleSuggestions, setShowCycleSuggestions] = useState(false);
  const [showTrainSuggestions, setShowTrainSuggestions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterPending, setFilterPending] = useState(true);
  const [activeFleetSerie, setActiveFleetSerie] = useState('112');
  const [activeView, setActiveView] = useState<ViewMode>('FLEET');
  const [filterMode, setFilterMode] = useState<FilterMode>('SORTIDA');
  const [selectedOrigin, setSelectedOrigin] = useState<OriginStation>('ALL');
  const [selectedDepot, setSelectedDepot] = useState<string>('PC');
  const [depotSyncing, setDepotSyncing] = useState(false);
  const [unitKilometers, setUnitKilometers] = useState<any[]>([]);
  const [unitLocationHistory, setUnitLocationHistory] = useState<any[]>([]);
  const [maintenanceAlerts, setMaintenanceAlerts] = useState<any[]>([]);
  const [fleetFilter, setFleetFilter] = useState<'ALL' | 'BROKEN' | 'CLEANING' | 'RECORDS' | 'IMAGES'>('ALL');
  const [selectedUnitDetail, setSelectedUnitDetail] = useState<string | null>(null);
  const [kmFilterSerie, setKmFilterSerie] = useState<string>('ALL');
  const [notifications, setNotifications] = useState<any[]>([]);

  const cycleSuggestionsRef = useRef<HTMLDivElement>(null);
  const trainSuggestionsRef = useRef<HTMLDivElement>(null);

  const addNotification = (type: string, title: string, message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
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

  useEffect(() => {
    fetchAllData(); fetchAvailableCycles();
    const handleClickOutside = (e: MouseEvent) => {
      if (cycleSuggestionsRef.current && !cycleSuggestionsRef.current.contains(e.target as Node)) setShowCycleSuggestions(false);
      if (trainSuggestionsRef.current && !trainSuggestionsRef.current.contains(e.target as Node)) setShowTrainSuggestions(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getCycleOrigin = (id: string): OriginStation | null => {
    const c = (id || '').toUpperCase();
    if (c.length < 3) return null;
    const s = c.substring(2);
    if (s.startsWith('PC')) return 'PC'; if (s.startsWith('RB')) return 'RB'; if (s.startsWith('RE') || s.startsWith('VR')) return 'RE'; if (s.startsWith('N')) return 'NA'; if (s.startsWith('P')) return 'PN';
    return null;
  };
  const getCycleRetir = (id: string): OriginStation | null => {
    const c = (id || '').toUpperCase();
    if (c.startsWith('PC')) return 'PC'; if (c.startsWith('RB')) return 'RB'; if (c.startsWith('RE') || c.startsWith('VR')) return 'RE'; if (c.startsWith('N')) return 'NA'; if (c.startsWith('P')) return 'PN';
    return null;
  };

  const allFleetTrains = useMemo(() => {
    const t: string[] = []; FLEET_CONFIG.forEach(c => { for (let i = 1; i <= c.count; i++) t.push(`${c.serie}.${i.toString().padStart(2, '0')}`); });
    return t;
  }, []);

  const handleSave = async () => {
    if (!newCycleId || !newTrainId) return;
    if (brokenTrains.has(newTrainId)) { addNotification('error', 'Unitat Avariada', `La unitat ${newTrainId} està avariada.`); return; }
    if (assignments.find(a => a.train_number === newTrainId)) { addNotification('error', 'Unitat Ocupada', `La unitat ${newTrainId} ja està assignada.`); return; }
    if (assignments.find(a => a.cycle_id === newCycleId)) { addNotification('error', 'Cicle Ocupat', `El cicle ${newCycleId} ja té una unitat.`); return; }

    setSaving(true);
    const { error } = await supabase.from('assignments').upsert({ cycle_id: newCycleId, train_number: newTrainId });
    if (!error) { setNewCycleId(''); setNewTrainId(''); await fetchAllData(); }
    setSaving(false);
  };

  const getTrainsBySerie = (serie: string, count: number) => {
    return Array.from({ length: count }, (_, i) => `${serie}.${(i + 1).toString().padStart(2, '0')}`);
  };

  const handleDelete = async (id: string) => { if (!id) return; const { error } = await supabase.from('assignments').delete().eq('cycle_id', id); if (!error) await fetchAllData(); };
  const handleDeleteAll = async () => { if (!window.confirm("Eliminar tot?")) return; setLoading(true); await supabase.from('assignments').delete().neq('cycle_id', ''); await fetchAllData(); setLoading(false); };

  const handleAddParkedUnit = async (unit: string, depot: string, track: string) => {
    const trackDef = DEPOT_LAYOUTS[depot]?.sections.flatMap(s => s.tracks).find(t => t.id === track);
    if (!trackDef) return;
    if (parkedUnits.filter(u => u.depot_id === depot && u.track === track).length >= trackDef.capacity) { addNotification('error', 'Via Plena', 'Capacitat màxima assolida.'); return; }
    if (parkedUnits.find(u => u.unit_number === unit)) { addNotification('error', 'Unitat Duplicada', 'Ja està estacionada.'); return; }

    setDepotSyncing(true);
    const { error } = await supabase.from('parked_units').upsert({ unit_number: unit.toUpperCase(), depot_id: depot, track: track, updated_at: new Date().toISOString() });
    await onParkedUnitsChange(); setDepotSyncing(false);
  };
  const handleRemoveParkedUnit = async (unit: string) => { setDepotSyncing(true); await supabase.from('parked_units').delete().eq('unit_number', unit); await onParkedUnitsChange(); setDepotSyncing(false); };

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

  const assignedCycleIds = new Set(assignments.map(a => a.cycle_id));
  const assignedTrainNumbers = new Set(assignments.map(a => a.train_number));
  const filteredCyclesSuggestions = useMemo(() => availableShiftsCycles.filter(c => c.toUpperCase().includes(newCycleId.toUpperCase()) && (!newCycleId || !assignedCycleIds.has(c))).slice(0, 10), [newCycleId, availableShiftsCycles, assignedCycleIds]);
  const filteredTrainSuggestions = useMemo(() => allFleetTrains.filter(t => t.includes(newTrainId) && (!newTrainId || (!assignedTrainNumbers.has(t) && !brokenTrains.has(t)))).slice(0, 10), [newTrainId, allFleetTrains, assignedTrainNumbers, brokenTrains]);
  const availableCyclesByOrigin = useMemo(() => availableShiftsCycles.filter(c => (!filterPending || !assignedCycleIds.has(c)) && (selectedOrigin === 'ALL' || (filterMode === 'SORTIDA' ? getCycleOrigin(c) : getCycleRetir(c)) === selectedOrigin)), [availableShiftsCycles, assignedCycleIds, filterPending, selectedOrigin, filterMode]);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-700">
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-fgc-grey dark:text-white tracking-tight uppercase">Gestió d'Unitats</h1>
            <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 font-medium tracking-tight">Assignació, estat de flota i dipòsits.</p>
          </div>
          <div className="flex bg-white/50 dark:bg-black/20 p-1 rounded-full border border-gray-100 dark:border-white/5 backdrop-blur-md shadow-sm">
            {[
              { id: 'FLEET', icon: <Train size={18} /> },
              { id: 'DEPOTS', icon: <MapPin size={18} /> },
              { id: 'MAINTENANCE', icon: <Bell size={18} /> },
              { id: 'KILOMETERS', icon: <Gauge size={18} /> }
            ].map(view => (
              <button
                key={view.id}
                onClick={() => setActiveView(view.id as ViewMode)}
                className={`p-2.5 rounded-full transition-all ${activeView === view.id ? 'bg-fgc-grey text-white shadow-lg scale-110' : 'text-gray-400 hover:text-fgc-grey hover:bg-white dark:hover:bg-white/5'}`}
              >
                {view.icon}
              </button>
            ))}
          </div>
        </header>

        <div className="relative overflow-hidden min-h-[600px]">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in">
              <CardSkeleton /> <div className="lg:col-span-2"><ListSkeleton items={6} /></div>
            </div>
          ) : activeView === 'FLEET' ? (
            <div className="animate-in fade-in slide-in-from-right-8 duration-700 grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1">
                <GlassPanel className="p-8 sticky top-24 space-y-8">
                  <h3 className="text-lg font-black text-fgc-grey dark:text-white uppercase">Nova Assignació</h3>
                  <div className="space-y-4">
                    <div className="relative" ref={cycleSuggestionsRef}>
                      <input type="text" className="w-full bg-gray-50 dark:bg-black/20 rounded-2xl p-4 font-black outline-none focus:ring-2 focus:ring-fgc-green/50" placeholder="ID Cicle (ex: C42)" value={newCycleId} onChange={e => { setNewCycleId(e.target.value.toUpperCase()); setShowCycleSuggestions(true); }} onFocus={() => setShowCycleSuggestions(true)} />
                      {showCycleSuggestions && filteredCyclesSuggestions.length > 0 && <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl z-50 overflow-hidden border border-gray-100 dark:border-white/10">{filteredCyclesSuggestions.map(c => <button key={c} className="w-full p-4 text-left hover:bg-fgc-green/10 font-bold" onClick={() => { setNewCycleId(c); setShowCycleSuggestions(false); }}>{c}</button>)}</div>}
                    </div>
                    <div className="relative" ref={trainSuggestionsRef}>
                      <input type="text" className="w-full bg-gray-50 dark:bg-black/20 rounded-2xl p-4 font-black outline-none focus:ring-2 focus:ring-fgc-green/50" placeholder="Unitat (ex: 112.01)" value={newTrainId} onChange={e => { setNewTrainId(e.target.value); setShowTrainSuggestions(true); }} onFocus={() => setShowTrainSuggestions(true)} />
                      {showTrainSuggestions && filteredTrainSuggestions.length > 0 && <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl z-50 overflow-hidden border border-gray-100 dark:border-white/10">{filteredTrainSuggestions.map(t => <button key={t} className="w-full p-4 text-left hover:bg-fgc-green/10 font-bold" onClick={() => { setNewTrainId(t); setShowTrainSuggestions(false); }}>{t}</button>)}</div>}
                    </div>
                    <button onClick={handleSave} disabled={saving || !newCycleId || !newTrainId} className="w-full bg-fgc-green text-fgc-grey p-5 rounded-2xl font-black text-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2">{saving ? <Loader2 className="animate-spin" /> : <Save />} GUARDAR</button>
                  </div>
                  <div className="pt-8 border-t border-gray-100 dark:border-white/10">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase mb-4">Disponibles</h4>
                    <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                      {availableCyclesByOrigin.map(c => <button key={c} onClick={() => setNewCycleId(c)} className={`p-3 rounded-xl text-xs font-black border transition-all ${newCycleId === c ? 'bg-fgc-green text-fgc-grey border-fgc-green' : 'bg-white dark:bg-gray-800 text-fgc-grey dark:text-white border-gray-100 dark:border-white/5'}`}>{c}</button>)}
                    </div>
                  </div>
                </GlassPanel>
              </div>
              <div className="lg:col-span-2 space-y-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { id: 'ALL', label: 'Total Flota', count: allFleetTrains.length, icon: <Train size={18} />, color: 'gray' },
                    { id: 'BROKEN', label: 'Avariades', count: brokenTrains.size, icon: <AlertTriangle size={18} />, color: 'red' },
                    { id: 'CLEANING', label: 'Neteja', count: cleaningTrains.size, icon: <Brush size={18} />, color: 'orange' },
                    { id: 'OPERATIONAL', label: 'Disponibles', count: allFleetTrains.length - brokenTrains.size, icon: <CheckCircle2 size={18} />, color: 'green' }
                  ].map(stat => (
                    <GlassPanel key={stat.id} hover onClick={() => setFleetFilter(stat.id === 'OPERATIONAL' ? 'ALL' : stat.id as any)} className={`p-5 rounded-3xl flex flex-col gap-2 transition-all ${fleetFilter === stat.id || (stat.id === 'OPERATIONAL' && fleetFilter === 'ALL') ? 'ring-2 ring-inset ring-fgc-green bg-fgc-green/5' : ''}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.color === 'red' ? 'bg-red-500/10 text-red-500' : stat.color === 'orange' ? 'bg-orange-500/10 text-orange-500' : stat.color === 'green' ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}`}>{stat.icon}</div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</p>
                      <p className="text-2xl font-black text-fgc-grey dark:text-white">{stat.count}</p>
                    </GlassPanel>
                  ))}
                </div>
                <GlassPanel className="overflow-hidden">
                  <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/20 flex items-center justify-between"><h3 className="font-black flex items-center gap-2"><LinkIcon size={18} /> ASSIGNACIONS</h3> {assignments.length > 0 && <button onClick={handleDeleteAll} className="text-[10px] font-black text-red-500 uppercase">Eliminar Tot</button>}</div>
                  <div className="p-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {assignments.map(a => <div key={a.cycle_id} className="p-4 rounded-xl border border-gray-100 dark:border-white/5 flex items-center justify-between"><div className="font-black text-sm text-gray-400">{a.cycle_id} <div className="text-lg text-fgc-grey dark:text-white">{a.train_number}</div></div> <button onClick={() => handleDelete(a.cycle_id)} className="text-gray-300 hover:text-red-500"><Trash2 size={18} /></button></div>)}
                  </div>
                </GlassPanel>
                <GlassPanel className="overflow-hidden">
                  <div className="p-6 border-b border-gray-100 dark:border-white/5 flex items-center justify-between"><h3 className="font-black flex items-center gap-2"><LayoutGrid size={18} /> FLOTA</h3> <div className="flex gap-2">{FLEET_CONFIG.map(c => <button key={c.serie} onClick={() => setActiveFleetSerie(c.serie)} className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${activeFleetSerie === c.serie ? 'bg-fgc-grey text-white' : 'text-gray-400 hover:text-fgc-grey'}`}>{c.serie}</button>)}</div></div>
                  <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {getTrainsBySerie(activeFleetSerie, FLEET_CONFIG.find(c => c.serie === activeFleetSerie)?.count || 0).filter(t => fleetFilter === 'BROKEN' ? brokenTrains.has(t) : fleetFilter === 'CLEANING' ? cleaningTrains.has(t) : fleetFilter === 'RECORDS' ? recordTrains.has(t) : fleetFilter === 'IMAGES' ? imageTrains.has(t) : true).map(t => (
                      <div key={t} onClick={() => setSelectedUnitDetail(t)} className={`p-4 rounded-2xl border text-center transition-all hover:scale-105 cursor-pointer flex flex-col items-center gap-1 ${brokenTrains.has(t) ? 'bg-red-500/10 border-red-500' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-white/5'}`}>
                        {brokenTrains.has(t) ? <AlertTriangle size={18} className="text-red-500" /> : <Train size={18} className={assignedTrainNumbers.has(t) ? 'text-blue-500' : 'text-fgc-green'} />}
                        <span className="text-sm font-black">{t}</span>
                        <div className="flex gap-1 mt-1 h-3">
                          {imageTrains.has(t) && <Camera size={10} className="text-blue-500" />}
                          {recordTrains.has(t) && <FileText size={10} className="text-yellow-500" />}
                          {cleaningTrains.has(t) && <Brush size={10} className="text-orange-500" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassPanel>
              </div>
            </div>
          ) : activeView === 'DEPOTS' ? (
            <div className="animate-in fade-in slide-in-from-right-8 duration-700 space-y-8">
              <GlassPanel className="overflow-hidden">
                <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-gray-50/20 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div><h2 className="text-xl font-black uppercase tracking-tight">Esquema 2D Dipòsits</h2><p className="text-sm text-gray-400">Arrossega trens per organitzar-los.</p></div>
                  <div className="flex flex-wrap gap-2">{Object.keys(DEPOT_CAPACITIES_LOCAL).map(id => <button key={id} onClick={() => setSelectedDepot(id)} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${selectedDepot === id ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 dark:bg-white/5 text-gray-400 hover:text-fgc-grey'}`}>{id}</button>)}</div>
                </div>
                <div className="p-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
                  <div className="lg:col-span-1 space-y-4">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase">Unitats Lliures</h3>
                    <div className="flex flex-wrap lg:flex-col gap-2 max-h-[400px] overflow-y-auto pr-2">{allFleetTrains.filter(t => !parkedUnits.some(p => p.unit_number === t)).map(t => <DraggableUnit key={t} unit={t} isBroken={brokenTrains.has(t)} needsImages={imageTrains.has(t)} needsRecords={recordTrains.has(t)} needsCleaning={cleaningTrains.has(t)} />)}</div>
                  </div>
                  <div className="lg:col-span-3 space-y-8">
                    {DEPOT_LAYOUTS[selectedDepot].sections.map((s, idx) => (
                      <div key={idx} className="space-y-4">
                        <div className="flex items-center gap-4"><span className="text-[10px] font-black text-blue-500 uppercase">{s.name}</span><div className="h-px flex-1 bg-gray-100 dark:bg-white/5" /></div>
                        <div className="grid gap-3">{s.tracks.map(tk => <DroppableTrack key={tk.id} track={tk} capacity={tk.capacity} units={parkedUnits.filter(u => u.depot_id === selectedDepot && u.track === tk.id)} onDropUnit={handleAddParkedUnit} onRemoveUnit={handleRemoveParkedUnit} brokenTrains={brokenTrains} imageTrains={imageTrains} recordTrains={recordTrains} cleaningTrains={cleaningTrains} />)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </GlassPanel>
            </div>
          ) : activeView === 'MAINTENANCE' ? (
            <div className="animate-in fade-in slide-in-from-right-8 duration-700 grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-6">
                <GlassPanel className="p-8 overflow-hidden">
                  <div className="flex items-center gap-4 mb-8"><div className="p-3 bg-red-500 rounded-2xl text-white"><Bell /></div><h2 className="text-xl font-black uppercase">Manteniment</h2></div>
                  <div className="space-y-4">{maintenanceAlerts.map((a, i) => (
                    <div key={`${a.unit}-${a.type}`} className="flex items-center justify-between p-6 rounded-3xl bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/5">
                      <div className="flex items-center gap-6 flex-1">
                        <div className="text-center font-black shrink-0"><p className="text-[10px] text-gray-400 uppercase">Unitat</p><p className="text-xl">{a.unit}</p></div>
                        <div className="w-px h-8 bg-gray-200 dark:bg-white/10 shrink-0" />
                        <div className="shrink-0">
                          {(() => {
                            const conf = a.type === 'BROKEN' ? { icon: <AlertTriangle size={14} />, label: 'Avaria', color: 'bg-red-500' } :
                              a.type === 'IMAGES' ? { icon: <Camera size={14} />, label: 'Imatges', color: 'bg-blue-600' } :
                                a.type === 'RECORDS' ? { icon: <FileText size={14} />, label: 'Registres', color: 'bg-yellow-500' } :
                                  { icon: <Brush size={14} />, label: 'Neteja', color: 'bg-orange-500' };
                            return (
                              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-black text-white ${conf.color}`}>
                                {conf.icon}
                                <span>{conf.label}</span>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex-1 max-w-md ml-4">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Observacions</p>
                          <input
                            type="text"
                            defaultValue={a.notes || ''}
                            placeholder="Afegir nota..."
                            onBlur={(e) => handleUpdateNotes(a.unit, a.type, e.target.value)}
                            className="w-full bg-transparent text-[11px] font-bold outline-none border-b border-gray-100 dark:border-white/10 focus:border-fgc-green transition-all pb-1"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data Registre</p>
                        <input
                          type="date"
                          value={a.since ? a.since.split('T')[0] : ''}
                          onChange={(e) => handleUpdateStatusDate(a.unit, a.type, new Date(e.target.value).toISOString())}
                          className="bg-transparent text-sm font-black outline-none border-b border-dashed border-gray-300 dark:border-white/10 focus:border-fgc-green transition-colors text-fgc-grey dark:text-gray-300 p-0"
                        />
                      </div>
                    </div>
                  ))}</div>
                </GlassPanel>
              </div>
              <div className="space-y-6">
                <GlassPanel className="p-8"><h3 className="font-black uppercase mb-4">Informació</h3><p className="text-xs text-gray-500">Les alertes es mostren segons l'estat actual registrat a la base de dades en temps real.</p></GlassPanel>
              </div>
            </div>
          ) : activeView === 'KILOMETERS' ? (
            <div className="animate-in fade-in slide-in-from-right-8 duration-700 space-y-8 pb-20">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                  <GlassPanel className="p-8 sticky top-24 space-y-6">
                    <h3 className="text-lg font-black text-fgc-grey dark:text-white uppercase flex items-center gap-2"><Gauge size={20} className="text-fgc-green" /> Registrar Kilòmetres</h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Seleccionar Unitat</label>
                        <select
                          className="w-full bg-gray-50 dark:bg-black/20 rounded-2xl p-4 font-black outline-none focus:ring-2 focus:ring-fgc-green/50 appearance-none cursor-pointer"
                          value={newTrainId}
                          onChange={(e) => setNewTrainId(e.target.value)}
                        >
                          <option value="">Selecciona...</option>
                          {allFleetTrains.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Data de Lectura</label>
                        <input
                          type="date"
                          className="w-full bg-gray-50 dark:bg-black/20 rounded-2xl p-4 font-black outline-none focus:ring-2 focus:ring-fgc-green/50"
                          defaultValue={new Date().toISOString().split('T')[0]}
                          id="km-date"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Kilòmetres Totals</label>
                        <div className="relative">
                          <input
                            type="number"
                            className="w-full bg-gray-50 dark:bg-black/20 rounded-2xl p-4 pl-12 font-black outline-none focus:ring-2 focus:ring-fgc-green/50"
                            placeholder="0.00"
                            id="km-value"
                          />
                          <Gauge size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        </div>
                      </div>

                      <button
                        onClick={async () => {
                          const date = (document.getElementById('km-date') as HTMLInputElement).value;
                          const km = parseFloat((document.getElementById('km-value') as HTMLInputElement).value);
                          if (!newTrainId || !date || isNaN(km)) {
                            addNotification('error', 'Dades Incompletes', 'Si us plau, omple tots els camps correctament.');
                            return;
                          }
                          setSaving(true);
                          const { error } = await supabase.from('unit_kilometers').insert({
                            unit_number: newTrainId,
                            date: date,
                            kilometers: km
                          });
                          if (!error) {
                            addNotification('success', 'Kilòmetres Registrats', `S'ha registrat la lectura per a la unitat ${newTrainId}.`);
                            (document.getElementById('km-value') as HTMLInputElement).value = '';
                            await fetchAllData();
                          } else {
                            addNotification('error', 'Error al guardar', error.message);
                          }
                          setSaving(false);
                        }}
                        disabled={saving || !newTrainId}
                        className="w-full bg-fgc-green text-fgc-grey p-5 rounded-2xl font-black text-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-4 shadow-xl shadow-fgc-green/20"
                      >
                        {saving ? <Loader2 className="animate-spin" /> : <Save />} ACTUALITZAR KM
                      </button >
                    </div >
                  </GlassPanel >
                </div >

                <div className="lg:col-span-2 space-y-8">
                  {/* Mileage Chart */}
                  <GlassPanel className="p-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                      <h3 className="text-lg font-black text-fgc-grey dark:text-white uppercase flex items-center gap-2"><History size={20} className="text-blue-500" /> Visió General de Flota</h3>
                      <div className="flex bg-gray-100 dark:bg-black/40 p-1 rounded-xl border border-gray-200/50 dark:border-white/5">
                        {['ALL', '112', '113', '114', '115'].map(s => (
                          <button
                            key={s}
                            onClick={() => setKmFilterSerie(s)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black transition-all ${kmFilterSerie === s ? 'bg-white dark:bg-gray-800 text-fgc-grey dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                          >
                            {s === 'ALL' ? 'TOTES' : `S-${s}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="relative h-[350px] mt-10 flex items-end justify-between gap-1 px-2 border-b border-gray-100 dark:border-white/5 pb-1">
                      {(() => {
                        // Get latest KM for each unit
                        const filteredTrains = kmFilterSerie === 'ALL'
                          ? allFleetTrains
                          : allFleetTrains.filter(t => t.startsWith(kmFilterSerie));

                        const latestKm = filteredTrains.map(t => {
                          const recs = unitKilometers.filter(k => k.unit_number === t);
                          const km = recs.length > 0 ? parseFloat(recs[0].kilometers) : 0;
                          return { unit: t, km };
                        }).sort((a, b) => b.km - a.km);

                        const maxKm = Math.max(...latestKm.map(x => x.km)) || 1;

                        // Show all filtered units
                        return latestKm.map((item, idx) => {
                          const height = (item.km / maxKm) * 100;
                          const isHigh = idx < latestKm.length * 0.15; // Top 15%
                          const isLow = idx > latestKm.length * 0.85; // Bottom 15%

                          return (
                            <div key={item.unit} onClick={() => setSelectedUnitDetail(item.unit)} className="flex-1 flex flex-col items-center group relative h-full justify-end cursor-pointer">
                              <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-all z-20 pointer-events-none">
                                <div className="bg-fgc-grey dark:bg-gray-800 text-white p-2 rounded-lg text-[9px] font-black shadow-xl border border-white/10 whitespace-nowrap">
                                  {item.unit}: {item.km.toLocaleString()} km
                                  <div className="text-[7px] text-gray-400 mt-0.5">Cliqueu per a històric</div>
                                </div>
                              </div>
                              <div
                                className={`w-full rounded-t-sm transition-all duration-500 hover:scale-x-110 shadow-sm ${item.km === 0 ? 'bg-gray-100 dark:bg-white/5 h-[2px]' : isHigh ? 'bg-fgc-green' : isLow ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-700'}`}
                                style={{ height: item.km === 0 ? '2px' : `${height}%` }}
                              />
                              {idx % 5 === 0 && (
                                <span className="absolute top-full mt-2 text-[8px] font-black text-gray-400 rotate-45 origin-left">{item.unit}</span>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                    <div className="mt-16 bg-gray-50/50 dark:bg-black/20 rounded-2xl p-6 border border-dashed border-gray-200 dark:border-white/10 text-center">
                      <p className="text-xs font-bold text-gray-400 italic">Distribució de kilòmetres per unitat ({kmFilterSerie === 'ALL' ? 'Tota la flota' : `Serie ${kmFilterSerie}`}). Les barres verdes indiquen les unitats amb més desgast.</p>
                    </div>
                  </GlassPanel>

                  {/* Recent Records Table */}
                  <GlassPanel className="overflow-hidden">
                    <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/20 flex items-center justify-between">
                      <h3 className="font-black flex items-center gap-2"><History size={18} /> ÚLTIMS REGISTRES</h3>
                    </div>
                    <div className="p-0">
                      {unitKilometers.length > 0 ? (
                        <div className="divide-y divide-gray-100 dark:divide-white/5">
                          {unitKilometers.slice(0, 10).map((rec, idx) => (
                            <div key={idx} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-gray-100 dark:bg-black rounded-xl flex items-center justify-center font-black text-xs text-fgc-grey dark:text-gray-300 shadow-sm border border-gray-200/50 dark:border-white/5">{rec.unit_number}</div>
                                <div>
                                  <p className="text-sm font-black text-fgc-grey dark:text-white">{parseFloat(rec.kilometers).toLocaleString()} <span className="text-[10px] text-gray-400">KM</span></p>
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{new Date(rec.date).toLocaleDateString()}</p>
                                </div>
                              </div>
                              <button
                                onClick={async () => {
                                  if (!window.confirm("Eliminar aquest registre?")) return;
                                  const { error } = await supabase.from('unit_kilometers').delete().eq('id', rec.id);
                                  if (!error) {
                                    addNotification('success', 'Registre eliminat', 'La lectura s\'ha suprimit correctament.');
                                    await fetchAllData();
                                  }
                                }}
                                className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-12 text-center text-gray-400 font-bold uppercase italic tracking-widest text-xs">No hi ha registres de kilòmetres.</div>
                      )}
                    </div>
                  </GlassPanel>
                </div>
              </div >
            </div >
          ) : null}
        </div >

        {/* Unit Detail Overlay */}
        {
          selectedUnitDetail && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedUnitDetail(null)} />
              <GlassPanel className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto p-0 rounded-[40px]">
                <div className="sticky top-0 z-10 p-6 flex items-center justify-between border-b border-gray-100 dark:border-white/5 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md">
                  <div className="flex items-center gap-4"><div className="p-3 bg-blue-500 rounded-2xl text-white shadow-lg"><Gauge size={24} /></div><div><h2 className="text-2xl font-black uppercase tracking-tight">{selectedUnitDetail}</h2><p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Evolució de Kilòmetres</p></div></div>
                  <button onClick={() => setSelectedUnitDetail(null)} className="p-3 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 rounded-2xl transition-all"><X size={20} /></button>
                </div>
                <div className="p-8 space-y-8">
                  {(() => {
                    const history = unitKilometers
                      .filter(k => k.unit_number === selectedUnitDetail)
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                    const unitSerie = selectedUnitDetail?.split('.')[0];

                    // Get latest readings for all units
                    const allLatestReadingsData = allFleetTrains.map(t => {
                      const recs = unitKilometers.filter(k => k.unit_number === t);
                      const km = recs.length > 0 ? parseFloat(recs[0].kilometers) : 0;
                      return { unit: t, km };
                    }).filter(x => x.km > 0);

                    const fleetAvg = allLatestReadingsData.length > 0
                      ? allLatestReadingsData.reduce((a, b) => a + b.km, 0) / allLatestReadingsData.length
                      : 0;

                    const seriesReadings = allLatestReadingsData.filter(x => x.unit.startsWith(unitSerie));
                    const seriesAvg = seriesReadings.length > 0
                      ? seriesReadings.reduce((a, b) => a + b.km, 0) / seriesReadings.length
                      : 0;

                    const unitKm = history.length > 0 ? parseFloat(history[0].kilometers) : 0;

                    const isAboveFleet = unitKm > fleetAvg;
                    const isBelowFleet = unitKm < fleetAvg;
                    const isAboveSeries = unitKm > seriesAvg;
                    const isBelowSeries = unitKm < seriesAvg;

                    return (
                      <>
                        {/* Summary Card */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-gray-50 dark:bg-black/20 p-6 rounded-[32px] border border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">vs Mitjana Flota</p>
                            <div className="flex items-center gap-3">
                              <span className={`text-lg font-black uppercase ${isAboveFleet ? 'text-orange-500' : isBelowFleet ? 'text-blue-500' : 'text-fgc-green'}`}>
                                {isAboveFleet ? 'Per sobre' : isBelowFleet ? 'Per sota' : 'A la mitjana'}
                              </span>
                              {isAboveFleet ? <TrendingUp size={20} className="text-orange-500" /> : isBelowFleet ? <TrendingUp size={20} className="text-blue-500 rotate-180" /> : <ArrowRight size={20} className="text-fgc-green" />}
                            </div>
                            <p className="text-[9px] font-bold text-gray-400 mt-1">Mitjana: {Math.round(fleetAvg).toLocaleString()} km</p>
                          </div>

                          <div className="bg-gray-50 dark:bg-black/20 p-6 rounded-[32px] border border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">vs Mitjana Sèrie {unitSerie}</p>
                            <div className="flex items-center gap-3">
                              <span className={`text-lg font-black uppercase ${isAboveSeries ? 'text-orange-500' : isBelowSeries ? 'text-blue-500' : 'text-fgc-green'}`}>
                                {isAboveSeries ? 'Per sobre' : isBelowSeries ? 'Per sota' : 'A la mitjana'}
                              </span>
                              {isAboveSeries ? <TrendingUp size={20} className="text-orange-500" /> : isBelowSeries ? <TrendingUp size={20} className="text-blue-500 rotate-180" /> : <ArrowRight size={20} className="text-fgc-green" />}
                            </div>
                            <p className="text-[9px] font-bold text-gray-400 mt-1">Mitjana Sèrie: {Math.round(seriesAvg).toLocaleString()} km</p>
                          </div>

                          <div className="bg-gray-50 dark:bg-black/20 p-6 rounded-[32px] border border-gray-100 dark:border-white/5">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Unitat</p>
                            <p className="text-2xl font-black text-fgc-grey dark:text-white leading-none">{unitKm.toLocaleString()} <span className="text-xs text-gray-400">KM</span></p>
                            <p className="text-[9px] font-bold text-gray-400 mt-2 uppercase tracking-tight">Lectura més recent</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 flex items-center gap-2"><History size={12} /> Llistat de Mesures</h3>
                          <div className="bg-gray-50 dark:bg-black/20 rounded-[32px] border border-gray-100 dark:border-white/5 overflow-hidden">
                            {history.length === 0 ? (
                              <div className="p-12 text-center text-gray-400 text-[10px] font-black uppercase italic">Sense registres</div>
                            ) : (
                              <div className="divide-y divide-gray-100 dark:divide-white/5">
                                {history.map((h, i) => (
                                  <div key={i} className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors">
                                    <div className="flex items-center gap-4">
                                      <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-white/5 flex items-center justify-center text-xs font-black shadow-sm">
                                        {history.length - i}
                                      </div>
                                      <div>
                                        <p className="text-lg font-black">{parseFloat(h.kilometers).toLocaleString()} <span className="text-xs font-bold text-gray-400">km</span></p>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{new Date(h.date).toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      {i < history.length - 1 && (
                                        <div className="px-4 py-2 rounded-xl bg-fgc-green/10 text-fgc-green text-[11px] font-black border border-fgc-green/20">
                                          +{(parseFloat(h.kilometers) - parseFloat(history[i + 1].kilometers)).toLocaleString()} km
                                        </div>
                                      )}
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          if (!window.confirm(`Segur que vols eliminar la mesura de ${parseFloat(h.kilometers).toLocaleString()} km del dia ${new Date(h.date).toLocaleDateString()}?`)) return;
                                          const { error } = await supabase.from('unit_kilometers').delete().eq('id', h.id);
                                          if (!error) {
                                            addNotification('success', 'Mesura eliminada', 'El registre s\'ha esborrat correctament.');
                                            await fetchAllData();
                                          } else {
                                            addNotification('error', 'Error en esborrar', error.message);
                                          }
                                        }}
                                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
                                        title="Eliminar mesura"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </GlassPanel>
            </div>
          )
        }

        {/* Notifications */}
        <div className="fixed bottom-24 right-8 z-[200] space-y-3 pointer-events-none">
          {notifications.map(n => (
            <GlassPanel key={n.id} className={`p-5 min-w-[320px] pointer-events-auto animate-in slide-in-from-right-full duration-500 ${n.type === 'error' ? 'border-red-500 bg-red-500/10' : n.type === 'warning' ? 'border-orange-500 bg-orange-500/10' : 'border-blue-500 bg-blue-500/10'}`}>
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-xl text-white ${n.type === 'error' ? 'bg-red-500' : n.type === 'warning' ? 'bg-orange-500' : 'bg-blue-500'}`}><Info size={16} /></div>
                <div><p className="font-black text-xs uppercase mb-1">{n.title}</p><p className="text-[11px] font-bold opacity-70">{n.message}</p></div>
              </div>
            </GlassPanel>
          ))}
        </div>
      </div>
    </DndProvider>
  );
};

export default CiclesView;