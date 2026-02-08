import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus,
  MapPin,
  Train,
  ArrowRight,
  Trash2,
  Search,
  LayoutGrid,
  Clock,
  Loader2,
  X,
  MoreVertical,
  Wrench,
  Camera,
  FileText,
  Brush,
  AlertTriangle,
  CheckCircle2,
  Link as LinkIcon,
  AlertCircle,
  Info,
  Hash,
  Save,
  Filter,
  List,
  ArrowUpRight,
  ArrowDownLeft
} from 'lucide-react';
import { supabase } from '../supabaseClient.ts';
import { Assignment } from '../types.ts';

// Configuració de la flota segons requeriment: 61 unitats totals
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
  'PC': {
    sections: [{
      name: 'Estació',
      tracks: [
        { id: '1', label: 'Via 1', capacity: 1 },
        { id: '2', label: 'Via 2', capacity: 1 },
        { id: '3', label: 'Via 3', capacity: 1 },
        { id: '4', label: 'Via 4', capacity: 1 },
        { id: '5', label: 'Via 5', capacity: 1 },
      ]
    }]
  },
  'RE': {
    sections: [{
      name: 'Depòsit',
      tracks: [
        { id: '1', label: 'Via 1', capacity: 3 },
        { id: '2', label: 'Via 2', capacity: 3 },
      ]
    }]
  },
  'NA': {
    sections: [
      {
        name: 'Estació',
        tracks: [
          { id: 'E1', label: 'Via 1 (Est.)', capacity: 2 },
          { id: 'E2', label: 'Via 2 (Est.)', capacity: 2 },
        ]
      },
      {
        name: 'Zona Maniobres',
        tracks: [
          { id: 'M1', label: 'Via 1 (Man.)', capacity: 2 },
          { id: 'M2', label: 'Via 2 (Man.)', capacity: 1 },
        ]
      },
      {
        name: 'Depòsit',
        tracks: [
          { id: 'D1', label: 'Via 1 (Dep.)', capacity: 2 },
          { id: 'D2', label: 'Via 2 (Dep.)', capacity: 2 },
          { id: 'D3', label: 'Via 3 (Dep.)', capacity: 2 },
          { id: 'D4', label: 'Via 4 (Dep.)', capacity: 2 },
        ]
      }
    ]
  },
  'PN': {
    sections: [
      {
        name: 'Estació',
        tracks: [
          { id: 'E1', label: 'Via 1', capacity: 2 },
          { id: 'E2', label: 'Via 2', capacity: 2 },
        ]
      },
      {
        name: 'Depòsit',
        tracks: [
          { id: '1A', label: 'Via 1A', capacity: 2 },
          { id: '1B', label: 'Via 1B', capacity: 1 },
          { id: '0A', label: 'Via 0A', capacity: 1 },
          { id: '0B', label: 'Via 0B', capacity: 1 },
          { id: '2A', label: 'Via 2A', capacity: 1 },
          { id: '2B', label: 'Via 2B', capacity: 2 },
        ]
      }
    ]
  },
  'RB': {
    sections: [
      {
        name: 'Platja de Vies',
        tracks: [
          { id: '4', label: 'Via 4', capacity: 6 },
          { id: '6', label: 'Via 6', capacity: 6 },
          { id: '8', label: 'Via 8', capacity: 3 },
          { id: '10', label: 'Via 10', capacity: 2 },
        ]
      },
      {
        name: 'Taller',
        tracks: [
          { id: '1', label: 'Via 1 (Torn)', capacity: 2 },
          { id: '9', label: 'Via 9', capacity: 1 },
          { id: '11', label: 'Via 11', capacity: 1 },
          { id: '13', label: 'Via 13', capacity: 1 },
          { id: '15', label: 'Via 15', capacity: 1 },
          { id: '17', label: 'Via 17', capacity: 1 },
          { id: '19', label: 'Via 19', capacity: 1 },
        ]
      },
      {
        name: 'IF',
        tracks: [
          { id: '21', label: 'Via 21', capacity: 1 },
          { id: '23', label: 'Via 23', capacity: 1 },
          { id: '25', label: 'Via 25', capacity: 1 },
        ]
      }
    ]
  }
};


type OriginStation = 'ALL' | 'PC' | 'RE' | 'RB' | 'NA' | 'PN';
type FilterMode = 'SORTIDA' | 'RETIR';
type ViewMode = 'FLEET' | 'DEPOTS';

interface ParkedUnit {
  unit_number: string;
  depot_id: string;
  track: string;
}

interface CiclesViewProps {
  parkedUnits: any[];
  onParkedUnitsChange: () => Promise<void>;
}

const CiclesView: React.FC<CiclesViewProps> = ({ parkedUnits, onParkedUnitsChange }) => {
  const [newCycleId, setNewCycleId] = useState('');
  const [newTrainId, setNewTrainId] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // Estats de manteniment de la flota
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

  // Estats de filtre
  const [filterMode, setFilterMode] = useState<FilterMode>('SORTIDA');
  const [selectedOrigin, setSelectedOrigin] = useState<OriginStation>('ALL');

  const [selectedDepot, setSelectedDepot] = useState<string>('PC');
  const [depotSyncing, setDepotSyncing] = useState(false);

  // Nou estat per al Dashboard de Flota i Inspector
  const [fleetFilter, setFleetFilter] = useState<'ALL' | 'BROKEN' | 'CLEANING' | 'RECORDS' | 'IMAGES'>('ALL');
  const [selectedUnitDetail, setSelectedUnitDetail] = useState<string | null>(null);

  // Punt 4: Notificacions de Conflicte
  const [notifications, setNotifications] = useState<{ id: string; type: 'error' | 'warning' | 'info'; title: string; message: string }[]>([]);

  const addNotification = (type: 'error' | 'warning' | 'info', title: string, message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const cycleSuggestionsRef = useRef<HTMLDivElement>(null);
  const trainSuggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAllData();
    fetchAvailableCycles();

    const handleClickOutside = (event: MouseEvent) => {
      if (cycleSuggestionsRef.current && !cycleSuggestionsRef.current.contains(event.target as Node)) {
        setShowCycleSuggestions(false);
      }
      if (trainSuggestionsRef.current && !trainSuggestionsRef.current.contains(event.target as Node)) {
        setShowTrainSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [assigData, statusData] = await Promise.all([
        supabase.from('assignments').select('*').order('created_at', { ascending: false }),
        supabase.from('train_status').select('*')
      ]);

      if (assigData.data) setAssignments(assigData.data);
      if (statusData.data) {
        const broken = new Set<string>();
        const images = new Set<string>();
        const records = new Set<string>();
        const cleaning = new Set<string>();

        statusData.data.forEach((s: any) => {
          if (s.is_broken) broken.add(s.train_number);
          if (s.needs_images) images.add(s.train_number);
          if (s.needs_records) records.add(s.train_number);
          if (s.needs_cleaning) cleaning.add(s.train_number);
        });

        setBrokenTrains(broken);
        setImageTrains(images);
        setRecordTrains(records);
        setCleaningTrains(cleaning);
      }
    } catch (e) {
      console.error("Error carregant dades de flota:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableCycles = async () => {
    const { data } = await supabase.from('shifts').select('circulations');
    if (data) {
      const cycles = new Set<string>();
      data.forEach(s => {
        (s.circulations as any[])?.forEach(c => {
          const cicle = typeof c === 'object' ? c.cicle : null;
          if (cicle) cycles.add(cicle as string);
        });
      });
      setAvailableShiftsCycles(Array.from(cycles).sort());
    }
  };

  const getCycleOrigin = (cycleId: string): OriginStation | null => {
    const code = (cycleId || '').toUpperCase();
    if (code.length < 3) return null;
    const suffix = code.substring(2);
    if (suffix.startsWith('PC')) return 'PC';
    if (suffix.startsWith('RB')) return 'RB';
    if (suffix.startsWith('RE') || suffix.startsWith('VR')) return 'RE';
    if (suffix.startsWith('N')) return 'NA';
    if (suffix.startsWith('P')) return 'PN';
    return null;
  };

  const getCycleRetir = (cycleId: string): OriginStation | null => {
    const code = (cycleId || '').toUpperCase();
    if (code.startsWith('PC')) return 'PC';
    if (code.startsWith('RB')) return 'RB';
    if (code.startsWith('RE') || code.startsWith('VR')) return 'RE';
    if (code.startsWith('N')) return 'NA';
    if (code.startsWith('P')) return 'PN';
    return null;
  };

  const allFleetTrains = useMemo(() => {
    const trains: string[] = [];
    FLEET_CONFIG.forEach(config => {
      for (let i = 1; i <= config.count; i++) {
        trains.push(`${config.serie}.${i.toString().padStart(2, '0')}`);
      }
    });
    return trains;
  }, []);

  const handleSave = async () => {
    if (!newCycleId || !newTrainId) return;

    // 1. Check if broken
    if (brokenTrains.has(newTrainId)) {
      addNotification('error', 'Unitat Avariada', `La unitat ${newTrainId} està marcada com avariada i no pot realitzar serveis comercials.`);
      return;
    }

    // 2. Conflict: Train already assigned to another cycle
    const trainBusy = assignments.find(a => a.train_number === newTrainId);
    if (trainBusy) {
      addNotification('error', 'Unitat Ocupada', `La unitat ${newTrainId} ja està assignada al cicle ${trainBusy.cycle_id}.`);
      return;
    }

    // 3. Conflict: Cycle already has a train
    const cycleBusy = assignments.find(a => a.cycle_id === newCycleId);
    if (cycleBusy) {
      addNotification('error', 'Cicle Ocupat', `El cicle ${newCycleId} ja té assignada la unitat ${cycleBusy.train_number}. Allibera el cicle primer.`);
      return;
    }

    // 4. Warning: Train is parked in a depot
    const isParked = parkedUnits.find(u => u.unit_number === newTrainId);
    if (isParked) {
      addNotification('warning', 'Unitat en Dipòsit', `La unitat ${newTrainId} està actualment estacionada a ${DEPOT_CAPACITIES_LOCAL[isParked.depot_id].label} (Via ${isParked.track}). Hauràs de registrar la seva sortida.`);
    }

    setSaving(true);
    const { error } = await supabase
      .from('assignments')
      .upsert({ cycle_id: newCycleId, train_number: newTrainId });
    if (!error) {
      setNewCycleId('');
      setNewTrainId('');
      await fetchAllData();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('assignments')
      .delete()
      .eq('cycle_id', id);
    if (!error) await fetchAllData();
  };

  const handleDeleteAll = async () => {
    if (!window.confirm("Estàs segur que vols eliminar totes les assignacions?")) return;
    setLoading(true);
    const { error } = await supabase.from('assignments').delete().neq('cycle_id', 'PLACEHOLDER_FOR_ALL'); // Delete all rows
    if (error) console.error("Error deleting all assignments:", error);
    await fetchAllData();
    setLoading(false);
  };

  const handleAddParkedUnit = async (unit: string, depot: string, track: string) => {
    if (!unit) return;

    // Check constraints
    const layout = DEPOT_LAYOUTS[depot];
    const trackDef = layout.sections.flatMap(s => s.tracks).find(t => t.id === track);
    if (!trackDef) return;

    // 1. Check Capacity
    const currentCount = parkedUnits.filter(u => u.depot_id === depot && u.track === track).length;
    if (currentCount >= trackDef.capacity) {
      addNotification('error', 'Via Plena', `La via ${trackDef.label} ja ha arribat a la seva capacitat màxima de ${trackDef.capacity} unitats.`);
      return;
    }

    // 2. Check Rubí IF constraint
    if (depot === 'RB' && track === '23') {
      const isV25Occupied = parkedUnits.some(u => u.depot_id === 'RB' && u.track === '25');
      if (isV25Occupied) {
        addNotification('warning', 'Bloqueig de Maniobra', "No es pot estacionar a la Via 23 perquè la Via 25 està ocupada. Físicament la unitat de la V25 bloqueja l'accés a la V23.");
        return;
      }
    }

    // 3. Conflict: Already Parked in another depot/track
    const existingParking = parkedUnits.find(u => u.unit_number === unit);
    if (existingParking) {
      addNotification('error', 'Unitat Duplicada', `La unitat ${unit} ja està estacionada a ${DEPOT_CAPACITIES_LOCAL[existingParking.depot_id].label}, Via ${existingParking.track}. Allibera-la primer.`);
      return;
    }

    // 4. Conflict: Already Assigned to a cycle
    const existingAssignment = assignments.find(a => a.train_number === unit);
    if (existingAssignment) {
      addNotification('warning', 'Unitat en Servei', `Compte: La unitat ${unit} està actualment assignada al cicle ${existingAssignment.cycle_id}. Si l'estaciones, l'hauries de treure del servei actiu.`);
    }

    setDepotSyncing(true);

    const { error } = await supabase
      .from('parked_units')
      .upsert({
        unit_number: unit.toUpperCase(),
        depot_id: depot,
        track: track,
        updated_at: new Date().toISOString()
      });
    if (error) console.error("Error parking unit:", error);
    await onParkedUnitsChange();
    setDepotSyncing(false);
  };

  const handleRemoveParkedUnit = async (unit: string) => {
    setDepotSyncing(true);
    await supabase.from('parked_units').delete().eq('unit_number', unit);
    await onParkedUnitsChange();
    setDepotSyncing(false);
  };

  const handleToggleStatus = async (trainNum: string, field: 'is_broken' | 'needs_images' | 'needs_records' | 'needs_cleaning', currentStatus: boolean) => {
    const newStatus = !currentStatus;
    if (field === 'is_broken') {
      const next = new Set(brokenTrains);
      if (newStatus) next.add(trainNum); else next.delete(trainNum);
      setBrokenTrains(next);
    } else if (field === 'needs_images') {
      const next = new Set(imageTrains);
      if (newStatus) next.add(trainNum); else next.delete(trainNum);
      setImageTrains(next);
    } else if (field === 'needs_records') {
      const next = new Set(recordTrains);
      if (newStatus) next.add(trainNum); else next.delete(trainNum);
      setRecordTrains(next);
    } else if (field === 'needs_cleaning') {
      const next = new Set(cleaningTrains);
      if (newStatus) next.add(trainNum); else next.delete(trainNum);
      setCleaningTrains(next);
    }
    try {
      const { error } = await supabase
        .from('train_status')
        .upsert({
          train_number: trainNum,
          [field]: newStatus,
          updated_at: new Date().toISOString()
        }, { onConflict: 'train_number' });
      if (error) throw error;
    } catch (e: any) {
      console.error(`Error actualitzant ${field}:`, e.message || e);
      fetchAllData();
    }
  };

  const getTrainsBySerie = (serie: string, count: number) => {
    return Array.from({ length: count }, (_, i) => `${serie}.${(i + 1).toString().padStart(2, '0')}`);
  };

  const assignedCycleIds = new Set(assignments.map(a => a.cycle_id));
  const assignedTrainNumbers = new Set(assignments.map(a => a.train_number));

  const filteredCyclesSuggestions = useMemo(() => {
    if (!newCycleId) return availableShiftsCycles.filter(c => !assignedCycleIds.has(c)).slice(0, 10);
    return availableShiftsCycles.filter(c =>
      c.toLowerCase().includes(newCycleId.toLowerCase())
    ).slice(0, 10);
  }, [newCycleId, availableShiftsCycles, assignedCycleIds]);

  const filteredTrainSuggestions = useMemo(() => {
    if (!newTrainId) return allFleetTrains.filter(t => !assignedTrainNumbers.has(t) && !brokenTrains.has(t)).slice(0, 10);
    return allFleetTrains.filter(t =>
      t.toLowerCase().includes(newTrainId.toLowerCase())
    ).slice(0, 10);
  }, [newTrainId, allFleetTrains, assignedTrainNumbers, brokenTrains]);

  const availableCyclesByOrigin = useMemo(() => {
    return availableShiftsCycles.filter(c => {
      const isPending = !filterPending || !assignedCycleIds.has(c);
      if (!isPending) return false;
      if (selectedOrigin === 'ALL') return true;
      const targetStation = filterMode === 'SORTIDA' ? getCycleOrigin(c) : getCycleRetir(c);
      return targetStation === selectedOrigin;
    });
  }, [availableShiftsCycles, assignedCycleIds, filterPending, selectedOrigin, filterMode]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-fgc-grey dark:text-white tracking-tight uppercase">Gestió d'Unitats</h1>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Assignació de material, estat de flota i gestió de dipòsits.</p>
        </div>

        <div className="flex bg-white dark:bg-gray-900 p-1.5 rounded-[24px] shadow-sm border border-gray-100 dark:border-white/5">
          <button
            onClick={() => setActiveView('FLEET')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black transition-all ${activeView === 'FLEET' ? 'bg-fgc-grey dark:bg-fgc-green dark:text-fgc-grey text-white shadow-xl' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}
          >
            <Train size={16} />
            CICLES I FLOTA
          </button>
          <button
            onClick={() => setActiveView('DEPOTS')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black transition-all ${activeView === 'DEPOTS' ? 'bg-fgc-grey dark:bg-fgc-green dark:text-fgc-grey text-white shadow-xl' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}
          >
            <MapPin size={16} />
            GESTIÓ DE DIPÒSITS
          </button>
        </div>
      </header>

      <div className="relative overflow-hidden min-h-[600px]">
        {activeView === 'FLEET' ? (
          <div key="fleet-view" className="animate-in fade-in slide-in-from-right-8 duration-700 ease-out-expo">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1">
                <div className="bg-white dark:bg-gray-900 rounded-[32px] p-8 shadow-sm border border-gray-100 dark:border-white/5 sticky top-24 space-y-8 transition-colors">
                  <div>
                    <h3 className="text-lg font-black text-fgc-grey dark:text-white mb-6 uppercase tracking-tight">Nova Assignació</h3>
                    <div className="space-y-6">
                      <div className="relative" ref={cycleSuggestionsRef}>
                        <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-3 ml-1">ID Cicle</label>
                        <div className="relative">
                          <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} />
                          <input
                            type="text"
                            className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-4 focus:ring-fgc-green/20 outline-none font-black text-lg transition-all dark:text-white dark:placeholder:text-gray-700"
                            placeholder="Ex: C42"
                            value={newCycleId}
                            onChange={(e) => {
                              setNewCycleId(e.target.value.toUpperCase());
                              setShowCycleSuggestions(true);
                            }}
                            onFocus={() => setShowCycleSuggestions(true)}
                          />
                          {newCycleId && (
                            <button onClick={() => setNewCycleId('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-500 transition-colors">
                              <X size={18} />
                            </button>
                          )}
                        </div>
                        {showCycleSuggestions && filteredCyclesSuggestions.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 z-50 overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                            {filteredCyclesSuggestions.map(c => (
                              <button
                                key={c}
                                className="w-full text-left px-6 py-4 hover:bg-fgc-green/10 font-black text-fgc-grey dark:text-gray-200 transition-colors flex items-center justify-between group border-b border-gray-50 dark:border-white/5 last:border-0"
                                onClick={() => { setNewCycleId(c); setShowCycleSuggestions(false); }}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-gray-300 dark:text-gray-600">#</span>
                                  {c}
                                  {assignedCycleIds.has(c) && <CheckCircle2 size={12} className="text-blue-500" />}
                                </div>
                                <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-fgc-green" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="relative" ref={trainSuggestionsRef}>
                        <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-3 ml-1">Unitat de Tren</label>
                        <div className="relative">
                          <Train className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} />
                          <input
                            type="text"
                            className={`w-full bg-gray-50 dark:bg-black/20 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-4 focus:ring-fgc-green/20 outline-none font-black text-lg transition-all dark:text-white dark:placeholder:text-gray-700 ${brokenTrains.has(newTrainId) ? 'text-red-600' : ''}`}
                            placeholder="Ex: 112.01"
                            value={newTrainId}
                            onChange={(e) => {
                              setNewTrainId(e.target.value);
                              setShowTrainSuggestions(true);
                            }}
                            onFocus={() => setShowTrainSuggestions(true)}
                          />
                          {newTrainId && (
                            <button onClick={() => setNewTrainId('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-500 transition-colors">
                              <X size={18} />
                            </button>
                          )}
                        </div>
                        {showTrainSuggestions && filteredTrainSuggestions.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 z-50 overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                            {filteredTrainSuggestions.map(t => (
                              <button
                                key={t}
                                className="w-full text-left px-6 py-4 hover:bg-fgc-green/10 font-black text-fgc-grey dark:text-gray-200 transition-colors flex items-center justify-between group border-b border-gray-50 dark:border-white/5 last:border-0"
                                onClick={() => { setNewTrainId(t); setShowTrainSuggestions(false); }}
                              >
                                <div className="flex items-center gap-3">
                                  <Train size={14} className="text-gray-300 dark:text-gray-600" />
                                  {t}
                                  {assignedTrainNumbers.has(t) && <CheckCircle2 size={12} className="text-blue-500" />}
                                </div>
                                <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-fgc-green" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleSave}
                        disabled={saving || !newCycleId || !newTrainId || brokenTrains.has(newTrainId)}
                        className="w-full bg-fgc-green text-fgc-grey py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-fgc-green/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all"
                      >
                        {saving ? <Loader2 size={22} className="animate-spin" /> : <Save size={22} />}
                        GUARDAR ASSIGNACIÓ
                      </button>
                    </div>
                  </div>
                  <div className="pt-8 border-t border-gray-100 dark:border-white/10 space-y-6">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <Filter size={14} className="text-fgc-green" />
                        <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Cicles Disponibles</h3>
                      </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-black/40 p-1 rounded-2xl border border-gray-100 dark:border-white/5 flex gap-1 shadow-inner">
                      <button onClick={() => { setFilterMode('SORTIDA'); setSelectedOrigin('ALL'); }} className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${filterMode === 'SORTIDA' ? 'bg-white dark:bg-gray-800 text-fgc-grey dark:text-white shadow-md' : 'text-gray-400 dark:text-gray-500'}`}>SORTIDA</button>
                      <button onClick={() => { setFilterMode('RETIR'); setSelectedOrigin('ALL'); }} className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${filterMode === 'RETIR' ? 'bg-white dark:bg-gray-800 text-fgc-grey dark:text-white shadow-md' : 'text-gray-400 dark:text-gray-500'}`}>RETIR</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-2 custom-scrollbar p-1">
                      {availableCyclesByOrigin.map(c => (
                        <button key={c} onClick={() => setNewCycleId(c)} className={`py-4 px-2 rounded-xl text-sm font-black border transition-all ${newCycleId === c ? 'bg-fgc-green text-fgc-grey' : 'bg-white dark:bg-gray-800 text-fgc-grey dark:text-gray-200 border-gray-100 dark:border-white/5'}`}>{c}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-2 space-y-8">
                {/* PUNT 2: DASHBOARD DE DISPONIBILITAT DE FLOTA */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { id: 'ALL', label: 'Total Flota', count: allFleetTrains.length, icon: <Train size={18} />, color: 'gray' },
                    { id: 'BROKEN', label: 'Avariades', count: brokenTrains.size, icon: <AlertTriangle size={18} />, color: 'red' },
                    { id: 'CLEANING', label: 'Neteja', count: cleaningTrains.size, icon: <Brush size={18} />, color: 'orange' },
                    { id: 'OPERATIONAL', label: 'Disponibles', count: allFleetTrains.length - brokenTrains.size, icon: <CheckCircle2 size={18} />, color: 'green' }
                  ].map((stat) => (
                    <button
                      key={stat.id}
                      onClick={() => setFleetFilter(stat.id === 'OPERATIONAL' ? 'ALL' : stat.id as any)}
                      className={`p-5 rounded-[32px] border text-left transition-all hover:scale-[1.02] active:scale-95 flex flex-col gap-3 ${(fleetFilter === stat.id) || (stat.id === 'OPERATIONAL' && fleetFilter === 'ALL')
                        ? 'bg-white dark:bg-gray-900 border-fgc-green shadow-lg shadow-fgc-green/10'
                        : 'bg-white/50 dark:bg-black/20 border-gray-100 dark:border-white/5'
                        }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.color === 'red' ? 'bg-red-500/10 text-red-500' :
                        stat.color === 'orange' ? 'bg-orange-500/10 text-orange-500' :
                          stat.color === 'green' ? 'bg-green-500/10 text-green-500' :
                            'bg-gray-500/10 text-gray-500'
                        }`}>
                        {stat.icon}
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{stat.label}</p>
                        <p className="text-2xl font-black text-fgc-grey dark:text-white leading-none">{stat.count}</p>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="bg-white dark:bg-gray-900 rounded-[40px] shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden transition-colors">
                  <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <LinkIcon size={18} className="text-fgc-green" />
                      <h3 className="font-black text-fgc-grey dark:text-white uppercase tracking-tight">Assignacions Actives</h3>
                    </div>
                    {assignments.length > 0 && (
                      <button onClick={handleDeleteAll} className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">
                        <Trash2 size={14} /> Eliminar Tot
                      </button>
                    )}
                  </div>
                  <div className="p-6 sm:p-8">
                    {loading ? <Loader2 className="animate-spin text-fgc-green mx-auto" size={40} /> : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {assignments.map((cycle) => (
                          <div key={cycle.cycle_id} className="group p-4 rounded-2xl border bg-gray-50/50 dark:bg-black/20 border-gray-100 dark:border-white/5 flex items-center justify-between gap-4">
                            <div>
                              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{cycle.cycle_id}</p>
                              <p className="text-lg font-black text-fgc-grey dark:text-gray-200">{cycle.train_number}</p>
                            </div>
                            <button onClick={() => handleDelete(cycle.cycle_id)} className="text-gray-300 hover:text-red-500"><Trash2 size={18} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-[40px] shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden">
                  <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20 flex items-center justify-between">
                    <div className="flex items-center gap-3"><LayoutGrid size={18} className="text-fgc-green" /><h3 className="font-black text-fgc-grey dark:text-white uppercase">Flota</h3></div>
                    <div className="flex bg-white dark:bg-black p-1 rounded-xl shadow-sm border border-gray-100 dark:border-white/10">
                      {FLEET_CONFIG.map(config => (
                        <button key={config.serie} onClick={() => setActiveFleetSerie(config.serie)} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${activeFleetSerie === config.serie ? 'bg-fgc-grey text-white' : 'text-gray-400'}`}>S-{config.serie}</button>
                      ))}
                    </div>
                  </div>
                  <div className="p-8">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                      {getTrainsBySerie(activeFleetSerie, FLEET_CONFIG.find(c => c.serie === activeFleetSerie)?.count || 0)
                        .filter(t => {
                          if (fleetFilter === 'BROKEN') return brokenTrains.has(t);
                          if (fleetFilter === 'CLEANING') return cleaningTrains.has(t);
                          if (fleetFilter === 'RECORDS') return recordTrains.has(t);
                          if (fleetFilter === 'IMAGES') return imageTrains.has(t);
                          return true;
                        })
                        .map(trainNum => {
                          const isOccupied = assignedTrainNumbers.has(trainNum);
                          const isBroken = brokenTrains.has(trainNum);
                          const needsImages = imageTrains.has(trainNum);
                          const needsRecords = recordTrains.has(trainNum);
                          const needsCleaning = cleaningTrains.has(trainNum);
                          return (
                            <div
                              key={trainNum}
                              onClick={() => setSelectedUnitDetail(trainNum)}
                              className={`relative group p-4 rounded-[24px] border text-center flex flex-col items-center gap-1.5 transition-all hover:scale-105 cursor-pointer ${isBroken ? 'bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/20' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-white/5 text-fgc-grey dark:text-gray-300'
                                }`}
                            >
                              {isBroken ? <AlertTriangle size={20} className="text-red-500" /> : <Train size={20} className={isOccupied ? 'text-blue-500' : 'text-fgc-green'} />}
                              <span className="text-base font-black">{trainNum}</span>
                              <div className="flex gap-1.5 h-3">
                                {needsImages && <Camera size={12} className="text-blue-500" />}
                                {needsRecords && <FileText size={12} className="text-yellow-500" />}
                                {needsCleaning && <Brush size={12} className="text-orange-500" />}
                                {!isBroken && !needsImages && !needsRecords && !needsCleaning && <CheckCircle2 size={12} className="text-green-500 opacity-20" />}
                              </div>

                              {/* Quick Peek on Hover */}
                              <div className="absolute top-2 right-2 flex gap-1 group-hover:opacity-100 opacity-0 transition-opacity">
                                {isOccupied && <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                    {getTrainsBySerie(activeFleetSerie, FLEET_CONFIG.find(c => c.serie === activeFleetSerie)?.count || 0).filter(t => {
                      if (fleetFilter === 'BROKEN') return brokenTrains.has(t);
                      if (fleetFilter === 'CLEANING') return cleaningTrains.has(t);
                      if (fleetFilter === 'RECORDS') return recordTrains.has(t);
                      if (fleetFilter === 'IMAGES') return imageTrains.has(t);
                      return true;
                    }).length === 0 && (
                        <div className="py-20 text-center text-gray-400 font-bold uppercase tracking-widest text-xs italic">
                          Cap unitat amb aquest criteri en aquesta sèrie
                        </div>
                      )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div key="depots-view" className="animate-in fade-in slide-in-from-right-8 duration-700 ease-out-expo space-y-8">
            <div className="bg-white dark:bg-gray-900 rounded-[40px] shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden">
              <div className="p-10 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20 flex flex-col sm:flex-row sm:items-center justify-between gap-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500 rounded-2xl text-white shadow-lg shadow-blue-500/20"><MapPin size={24} /></div>
                  <div><h2 className="text-xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Assignació a Dipòsits</h2><p className="text-sm font-medium text-gray-400">Controla quines unitats estan estacionades i en quina via.</p></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(DEPOT_CAPACITIES_LOCAL).map(depId => (
                    <button key={depId} onClick={() => setSelectedDepot(depId)} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedDepot === depId ? 'bg-blue-600 text-white shadow-lg' : 'bg-white dark:bg-gray-800 text-gray-400 border border-gray-100 dark:border-white/5 hover:border-blue-400'}`}>{depId}</button>
                  ))}
                </div>
              </div>
              <div className="p-10">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
                  <div className="lg:col-span-1 space-y-8">
                    <div className="p-8 bg-gray-50 dark:bg-black/20 rounded-[32px] border border-gray-100 dark:border-white/5 space-y-6">
                      <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Estacionar Unitat</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Codi Unitat</label>
                          <input id="park-unit-id" type="text" placeholder="Ex: 115.01" className="w-full bg-white dark:bg-gray-800 border-none rounded-2xl px-5 py-4 font-black outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Via</label>
                          <select id="park-unit-track" className="w-full bg-white dark:bg-gray-800 border-none rounded-2xl px-5 py-4 font-black outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm">
                            {DEPOT_LAYOUTS[selectedDepot].sections.map(section => (
                              <optgroup key={section.name} label={section.name}>
                                {section.tracks.map(t => (
                                  <option key={t.id} value={t.id}>{t.label} (Cap: {t.capacity})</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        <button
                          onClick={() => {
                            const u = (document.getElementById('park-unit-id') as HTMLInputElement).value;
                            const t = (document.getElementById('park-unit-track') as HTMLSelectElement).value;
                            handleAddParkedUnit(u, selectedDepot, t);
                            (document.getElementById('park-unit-id') as HTMLInputElement).value = '';
                          }}
                          disabled={depotSyncing}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/10 transition-all flex items-center justify-center gap-2"
                        >
                          {depotSyncing ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}AFEGIR UNITAT
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-3 space-y-8">
                    {/* Occupancy Header & Summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-gray-50 dark:bg-black/20 p-5 rounded-3xl border border-gray-100 dark:border-white/5">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Ocupació Total</p>
                        <div className="flex items-end gap-2">
                          <span className="text-2xl font-black text-fgc-grey dark:text-white">{parkedUnits.filter(u => u.depot_id === selectedDepot).length}</span>
                          <span className="text-sm font-bold text-gray-400 mb-1">/ {DEPOT_CAPACITIES_LOCAL[selectedDepot].total} u.</span>
                        </div>
                        <div className="mt-3 h-1.5 w-full bg-gray-200 dark:bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                            style={{ width: `${(parkedUnits.filter(u => u.depot_id === selectedDepot).length / DEPOT_CAPACITIES_LOCAL[selectedDepot].total) * 100}%` }}
                          />
                        </div>
                      </div>

                      <div className="bg-gray-50 dark:bg-black/20 p-5 rounded-3xl border border-gray-100 dark:border-white/5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center text-green-500">
                          <CheckCircle2 size={24} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Operatives</p>
                          <p className="text-xl font-black text-fgc-grey dark:text-white">
                            {parkedUnits.filter(u => u.depot_id === selectedDepot && !brokenTrains.has(u.unit_number)).length}
                          </p>
                        </div>
                      </div>

                      <div className="bg-gray-50 dark:bg-black/20 p-5 rounded-3xl border border-gray-100 dark:border-white/5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500">
                          <AlertTriangle size={24} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Avariades</p>
                          <p className="text-xl font-black text-fgc-grey dark:text-white">
                            {parkedUnits.filter(u => u.depot_id === selectedDepot && brokenTrains.has(u.unit_number)).length}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Track Layout Schematic Grouped by Section */}
                    <div className="space-y-12">
                      {DEPOT_LAYOUTS[selectedDepot].sections.map((section, sIdx) => {
                        return (
                          <div key={sIdx} className="space-y-6">
                            <div className="flex items-center gap-3 px-2">
                              <div className="h-px flex-1 bg-gray-100 dark:bg-white/5" />
                              <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">{section.name}</span>
                              <div className="h-px flex-1 bg-gray-100 dark:bg-white/5" />
                            </div>

                            <div className="space-y-4">
                              {section.tracks.map(track => {
                                const unitsOnTrack = parkedUnits.filter(u => u.depot_id === selectedDepot && u.track === track.id);
                                return (
                                  <div key={track.id} className="relative">
                                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-gray-100 dark:bg-white/5 rounded-full z-0" />
                                    <div className="relative z-10 flex items-center gap-4">
                                      <div className="w-20 h-14 bg-white dark:bg-gray-800 border border-gray-100 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center shadow-sm shrink-0">
                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter leading-none mb-1">VIA</span>
                                        <span className="text-sm font-black text-blue-600 leading-none">{track.id}</span>
                                        <div className={`mt-1.5 px-2 py-0.5 rounded-full text-[8px] font-black ${unitsOnTrack.length >= track.capacity ? 'bg-red-500 text-white' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600'}`}>
                                          {unitsOnTrack.length}/{track.capacity}
                                        </div>
                                      </div>
                                      <div className="flex-1 flex gap-3 overflow-x-auto py-2 pr-4 no-scrollbar min-h-[90px] items-center">
                                        {unitsOnTrack.length > 0 ? (
                                          unitsOnTrack.map((unit, idx) => {
                                            const isBroken = brokenTrains.has(unit.unit_number);
                                            const needsImages = imageTrains.has(unit.unit_number);
                                            const needsRecords = recordTrains.has(unit.unit_number);
                                            const needsCleaning = cleaningTrains.has(unit.unit_number);
                                            return (
                                              <div
                                                key={idx}
                                                className={`min-w-[160px] p-4 rounded-2xl border transition-all group relative flex items-center gap-3 animate-in fade-in slide-in-from-left-4 duration-300 ${isBroken
                                                  ? 'bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30'
                                                  : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-white/10 shadow-md hover:shadow-xl'
                                                  }`}
                                                style={{ animationDelay: `${idx * 100}ms` }}
                                              >
                                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isBroken ? 'bg-red-500 text-white' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600'}`}>
                                                  {isBroken ? <AlertTriangle size={18} /> : <Train size={18} />}
                                                </div>
                                                <div className="min-w-0">
                                                  <p className={`text-sm font-black truncate ${isBroken ? 'text-red-700 dark:text-red-400' : 'text-fgc-grey dark:text-white'}`}>{unit.unit_number}</p>
                                                  <div className="flex gap-1 mt-1">
                                                    {needsImages && <Camera size={10} className="text-blue-500" />}
                                                    {needsRecords && <FileText size={10} className="text-yellow-500" />}
                                                    {needsCleaning && <Brush size={10} className="text-orange-500" />}
                                                  </div>
                                                </div>
                                                <button onClick={() => handleRemoveParkedUnit(unit.unit_number)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:scale-110 active:scale-90 z-20">
                                                  <X size={12} />
                                                </button>
                                              </div>
                                            );
                                          })
                                        ) : (
                                          <div className="text-[10px] font-bold text-gray-300 dark:text-gray-700 uppercase tracking-[0.3em] italic ml-4">Lliure</div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODALS AND TOASTS */}
      {selectedUnitDetail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6" onClick={() => setSelectedUnitDetail(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" />
          <div className="relative bg-white dark:bg-gray-900 w-full max-w-xl rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300 border border-white/10" onClick={(e) => e.stopPropagation()}>
            <div className={`p-10 text-white relative overflow-hidden ${brokenTrains.has(selectedUnitDetail) ? 'bg-red-600' : 'bg-fgc-grey dark:bg-black'}`}>
              <div className="absolute top-0 right-0 p-12 opacity-10"><Train size={180} /></div>
              <div className="relative z-10 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest">Sèrie {selectedUnitDetail.split('.')[0]}</span>
                    {brokenTrains.has(selectedUnitDetail) && <span className="px-3 py-1 bg-red-500 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1"><AlertTriangle size={10} /> Avariada</span>}
                  </div>
                  <h2 className="text-5xl font-black tracking-tighter">{selectedUnitDetail}</h2>
                  <p className="mt-2 text-white/60 font-medium">Unitat de Tracció FGC S-11x</p>
                </div>
                <button onClick={() => setSelectedUnitDetail(null)} className="p-3 hover:bg-white/10 rounded-full transition-colors"><X size={28} /></button>
              </div>
            </div>
            <div className="p-10 space-y-10">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-3xl border border-gray-100 dark:border-white/5">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Assignació Actual</p>
                  <p className="text-xl font-black text-fgc-grey dark:text-white">{assignments.find(a => a.train_number === selectedUnitDetail)?.cycle_id || 'CAP'}</p>
                  <p className="text-[10px] font-bold text-blue-500 mt-1 uppercase">Cicle de Servei</p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-3xl border border-gray-100 dark:border-white/5">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Ubicació (Dipòsit)</p>
                  <p className="text-xl font-black text-fgc-grey dark:text-white">{parkedUnits.find(u => u.unit_number === selectedUnitDetail)?.depot_id || 'EN SERVEI'}</p>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] px-1">Gestió de Material</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'is_broken', label: 'Reportar Averia', icon: <Wrench size={18} />, color: 'red', active: brokenTrains.has(selectedUnitDetail) },
                    { id: 'needs_cleaning', label: 'Petició Neteja', icon: <Brush size={18} />, color: 'orange', active: cleaningTrains.has(selectedUnitDetail) },
                    { id: 'needs_images', label: 'Reportatge Foto', icon: <Camera size={18} />, color: 'blue', active: imageTrains.has(selectedUnitDetail) },
                    { id: 'needs_records', label: 'Llibre Tren', icon: <FileText size={18} />, color: 'yellow', active: recordTrains.has(selectedUnitDetail) }
                  ].map(action => (
                    <button key={action.id} onClick={() => handleToggleStatus(selectedUnitDetail, action.id as any, action.active)} className={`flex items-center justify-between p-5 rounded-3xl border transition-all ${action.active ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-white/10 shadow-md ring-2 ring-fgc-green' : 'bg-gray-50 dark:bg-white/5 border-transparent'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${action.active ? `bg-${action.color}-500 text-white shadow-lg shadow-${action.color}-500/20` : 'text-gray-400'}`}>{action.icon}</div>
                        <span className={`text-xs font-black ${action.active ? 'text-fgc-grey dark:text-white' : 'text-gray-400'}`}>{action.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => setSelectedUnitDetail(null)} className="w-full bg-fgc-grey text-white py-5 rounded-3xl font-black text-xs uppercase hover:bg-black transition-colors">Tancat</button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-4 max-w-sm w-full">
        {notifications.map(n => (
          <div key={n.id} className={`p-6 rounded-[32px] shadow-2xl border backdrop-blur-xl flex items-start gap-4 ${n.type === 'error' ? 'bg-red-500 text-white' : n.type === 'warning' ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'}`}>
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase opacity-80 mb-1">{n.title}</p>
              <p className="text-sm font-bold">{n.message}</p>
            </div>
            <button onClick={() => setNotifications(prev => prev.filter(item => item.id !== n.id))}><X size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CiclesView;