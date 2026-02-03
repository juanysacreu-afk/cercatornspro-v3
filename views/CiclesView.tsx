import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Train, ArrowRight, Save, Loader2, Trash2, X, Hash, Filter, Link as LinkIcon, CheckCircle2, List, LayoutGrid, Info, Wrench, AlertTriangle, Camera, FileText, Brush, MapPin, ArrowUpRight, ArrowDownLeft, Plus } from 'lucide-react';
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
  'RB': { total: 19, label: 'Rubí (COR)' },
  'NA': { total: 14, label: 'Terrassa' },
  'PN': { total: 12, label: 'Sabadell' },
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
    if (brokenTrains.has(newTrainId)) {
      alert("No es pot assignar una unitat avariada a un cicle de servei.");
      return;
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

      {activeView === 'FLEET' ? (
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
                  {getTrainsBySerie(activeFleetSerie, FLEET_CONFIG.find(c => c.serie === activeFleetSerie)?.count || 0).map(trainNum => {
                    const isOccupied = assignedTrainNumbers.has(trainNum);
                    const isBroken = brokenTrains.has(trainNum);
                    const needsImages = imageTrains.has(trainNum);
                    const needsRecords = recordTrains.has(trainNum);
                    const needsCleaning = cleaningTrains.has(trainNum);
                    return (
                      <div key={trainNum} className="relative group p-4 rounded-[24px] border bg-white dark:bg-gray-800 text-fgc-grey dark:text-gray-300 border-gray-100 dark:border-white/5 text-center flex flex-col items-center gap-1.5 transition-all hover:scale-105">
                        {isBroken ? <AlertTriangle size={20} className="text-red-500" /> : <Train size={20} className={isOccupied ? 'text-gray-300' : 'text-fgc-green'} />}
                        <span className="text-base font-black">{trainNum}</span>
                        <div className="flex gap-1.5">
                          {needsImages && <Camera size={12} className="text-blue-500" />}
                          {needsRecords && <FileText size={12} className="text-yellow-500" />}
                          {needsCleaning && <Brush size={12} className="text-orange-500" />}
                        </div>
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all pointer-events-none group-hover:pointer-events-auto bg-black/5 dark:bg-black/40 rounded-[24px] flex items-center justify-center gap-1">
                          <button onClick={() => handleToggleStatus(trainNum, 'is_broken', isBroken)} className={`p-1.5 rounded-full border transition-all ${isBroken ? 'bg-red-500 text-white' : 'bg-white text-gray-400'}`}><Wrench size={10} /></button>
                          <button onClick={() => handleToggleStatus(trainNum, 'needs_images', needsImages)} className={`p-1.5 rounded-full border transition-all ${needsImages ? 'bg-blue-500 text-white' : 'bg-white text-gray-400'}`}><Camera size={10} /></button>
                          <button onClick={() => handleToggleStatus(trainNum, 'needs_records', needsRecords)} className={`p-1.5 rounded-full border transition-all ${needsRecords ? 'bg-yellow-500 text-white' : 'bg-white text-gray-400'}`}><FileText size={10} /></button>
                          <button onClick={() => handleToggleStatus(trainNum, 'needs_cleaning', needsCleaning)} className={`p-1.5 rounded-full border transition-all ${needsCleaning ? 'bg-orange-500 text-white' : 'bg-white text-gray-400'}`}><Brush size={10} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
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
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(v => <option key={v} value={v}>Via {v}</option>)}
                        </select>
                      </div>
                      <button onClick={() => { const u = (document.getElementById('park-unit-id') as HTMLInputElement).value; const t = (document.getElementById('park-unit-track') as HTMLSelectElement).value; handleAddParkedUnit(u, selectedDepot, t); (document.getElementById('park-unit-id') as HTMLInputElement).value = ''; }} disabled={depotSyncing} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/10 transition-all flex items-center justify-center gap-2">
                        {depotSyncing ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}AFEGIR
                      </button>
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {parkedUnits.filter(u => u.depot_id === selectedDepot).map((unit, idx) => (
                      <div key={idx} className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600"><Train size={20} /></div>
                            <div><p className="text-xl font-black text-fgc-grey dark:text-white">{unit.unit_number}</p><p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Via {unit.track}</p></div>
                          </div>
                          <button onClick={() => handleRemoveParkedUnit(unit.unit_number)} className="p-2 text-gray-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CiclesView;