import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Train, ArrowRight, Save, Loader2, Trash2, X, Hash, Filter, Link as LinkIcon, CheckCircle2, List, LayoutGrid, Info, Wrench, AlertTriangle, Camera, FileText, Brush, MapPin, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';
import { Assignment } from '../types.ts';

// Configuració de la flota segons requeriment: 61 unitats totals
const FLEET_CONFIG = [
  { serie: '112', count: 22 },
  { serie: '113', count: 19 },
  { serie: '114', count: 5 },
  { serie: '115', count: 15 },
];

type OriginStation = 'ALL' | 'PC' | 'RE' | 'RB' | 'NA' | 'PN';
type FilterMode = 'SORTIDA' | 'RETIR';

const CiclesView: React.FC = () => {
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
  
  // Estats de filtre
  const [filterMode, setFilterMode] = useState<FilterMode>('SORTIDA');
  const [selectedOrigin, setSelectedOrigin] = useState<OriginStation>('ALL');
  
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

  /**
   * Lògica de Sortida: analitza les lletres a partir del 3r caràcter (índex 2).
   */
  const getCycleOrigin = (cycleId: string): OriginStation | null => {
    const code = (cycleId || '').toUpperCase();
    if (code.length < 3) return null;
    
    // Agafem el suffix a partir de la 3a posició
    const suffix = code.substring(2);
    
    if (suffix.startsWith('PC')) return 'PC';
    if (suffix.startsWith('RB')) return 'RB';
    if (suffix.startsWith('RE') || suffix.startsWith('VR')) return 'RE';
    if (suffix.startsWith('N')) return 'NA';
    if (suffix.startsWith('P')) return 'PN';
    
    return null;
  };

  /**
   * Lògica de Retir: analitza les lletres a l'inici de l'ID del cicle.
   */
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
      
      if (error) {
        if (error.code === '42703') {
          alert(`ERROR DE BASE DE DADES:\nLa columna '${field}' no existeix a la taula 'train_status'.`);
        } else {
          alert(`Error al guardar: ${error.message || 'Error desconegut'}`);
        }
        throw error;
      }
    } catch (e: any) {
      console.error(`Error detallat actualitzant ${field}:`, e.message || e);
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
      <header>
        <h1 className="text-3xl font-black text-fgc-grey dark:text-white tracking-tight uppercase">Gestió de Cicles</h1>
        <p className="text-gray-500 dark:text-gray-400 font-medium">Assignació d'unitats de tren i control d'estat de la flota.</p>
      </header>

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
                  
                  {brokenTrains.has(newTrainId) && (
                    <p className="text-[10px] text-red-500 font-black uppercase mt-2 ml-1 flex items-center gap-1">
                      <AlertTriangle size={12} /> Unitat fora de servei per avaria
                    </p>
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
                <button 
                  onClick={() => setFilterPending(!filterPending)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase transition-all border ${
                    filterPending ? 'bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-900/50' : 'bg-gray-100 dark:bg-black/20 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/5'
                  }`}
                >
                  {filterPending ? 'Pendents' : 'Tots'}
                </button>
              </div>

              {/* Selector de Mode de Filtre */}
              <div className="bg-gray-50 dark:bg-black/40 p-1 rounded-2xl border border-gray-100 dark:border-white/5 flex gap-1 shadow-inner">
                <button
                  onClick={() => { setFilterMode('SORTIDA'); setSelectedOrigin('ALL'); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black transition-all ${
                    filterMode === 'SORTIDA' 
                    ? 'bg-white dark:bg-gray-800 text-fgc-grey dark:text-white shadow-md' 
                    : 'text-gray-400 dark:text-gray-500 hover:bg-white/50 dark:hover:bg-white/5'
                  }`}
                >
                  <ArrowUpRight size={14} className={filterMode === 'SORTIDA' ? 'text-fgc-green' : ''} />
                  PER SORTIDA
                </button>
                <button
                  onClick={() => { setFilterMode('RETIR'); setSelectedOrigin('ALL'); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black transition-all ${
                    filterMode === 'RETIR' 
                    ? 'bg-white dark:bg-gray-800 text-fgc-grey dark:text-white shadow-md' 
                    : 'text-gray-400 dark:text-gray-500 hover:bg-white/50 dark:hover:bg-white/5'
                  }`}
                >
                  <ArrowDownLeft size={14} className={filterMode === 'RETIR' ? 'text-blue-500' : ''} />
                  PER RETIR
                </button>
              </div>

              {/* Selector d'Estació */}
              <div className="bg-gray-50 dark:bg-black/40 p-1 rounded-xl border border-gray-100 dark:border-white/5 grid grid-cols-6 gap-1">
                {(['ALL', 'PC', 'RE', 'RB', 'NA', 'PN'] as OriginStation[]).map((origin) => (
                  <button
                    key={origin}
                    onClick={() => setSelectedOrigin(origin)}
                    className={`py-2 rounded-lg text-[9px] font-black transition-all ${
                      selectedOrigin === origin 
                      ? 'bg-fgc-grey dark:bg-fgc-green dark:text-fgc-grey text-white shadow-md' 
                      : 'text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-white/5'
                    }`}
                  >
                    {origin === 'ALL' ? 'TOTS' : origin}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-2 custom-scrollbar p-1">
                {availableCyclesByOrigin.map(c => {
                  const isAssigned = assignedCycleIds.has(c);
                  return (
                    <button
                      key={c}
                      onClick={() => { setNewCycleId(c); setShowCycleSuggestions(false); }}
                      className={`py-4 px-2 rounded-xl text-sm font-black border transition-all relative flex flex-col items-center justify-center gap-1 ${
                        newCycleId === c 
                        ? 'bg-fgc-green text-fgc-grey border-fgc-green shadow-sm scale-[1.03]' 
                        : isAssigned 
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 border-blue-100 dark:border-blue-900/40 opacity-80' 
                          : 'bg-white dark:bg-gray-800 text-fgc-grey dark:text-gray-200 border-gray-100 dark:border-white/5 hover:border-fgc-green hover:shadow-md'
                      }`}
                    >
                      <span>{c}</span>
                      {isAssigned && <CheckCircle2 size={10} className="absolute -top-1.5 -right-1.5 text-blue-500 bg-white dark:bg-gray-900 rounded-full shadow-sm" />}
                    </button>
                  );
                })}
                {availableCyclesByOrigin.length === 0 && (
                  <div className="col-span-3 py-10 text-center opacity-30 italic text-[10px] font-bold uppercase tracking-widest">Cap cicle pendent</div>
                )}
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
              <div className="bg-fgc-grey dark:bg-black text-white px-3 py-1 rounded-full text-[10px] font-black">{assignments.length} EN SERVEI</div>
            </div>
            
            <div className="p-6 sm:p-8">
              {loading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-4 text-gray-300">
                  <Loader2 className="animate-spin text-fgc-green" size={40} />
                  <p className="text-xs font-black uppercase tracking-widest">Carregant dades...</p>
                </div>
              ) : assignments.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {assignments.map((cycle) => {
                    const isBroken = brokenTrains.has(cycle.train_number);
                    return (
                      <div 
                        key={cycle.cycle_id} 
                        className={`group p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${isBroken ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 shadow-lg' : 'bg-gray-50/50 dark:bg-black/20 border-gray-100 dark:border-white/5 hover:bg-white dark:hover:bg-white/5 hover:shadow-lg'}`}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`h-12 w-fit min-w-[3.5rem] px-3 rounded-xl flex items-center justify-center font-black text-sm shadow-md whitespace-nowrap flex-col gap-0.5 ${isBroken ? 'bg-red-600 text-white' : 'bg-fgc-grey dark:bg-black text-white'}`}>
                            {cycle.cycle_id}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-[9px] font-black uppercase tracking-widest leading-none mb-1 ${isBroken ? 'text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>UNITAT</p>
                            <p className={`text-lg font-black leading-tight truncate ${isBroken ? 'text-red-700 dark:text-red-400' : 'text-fgc-grey dark:text-gray-200'}`}>
                              {cycle.train_number}
                            </p>
                            {isBroken && <span className="text-[8px] font-black text-red-500 uppercase flex items-center gap-1 mt-0.5"><AlertTriangle size={8} /> AVARIAT</span>}
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDelete(cycle.cycle_id)}
                          className={`p-2.5 rounded-xl transition-all sm:opacity-0 sm:group-hover:opacity-100 shrink-0 ${isBroken ? 'text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40' : 'text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20'}`}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-20 text-center space-y-4 flex flex-col items-center opacity-30">
                  <Train size={64} className="text-gray-200 dark:text-gray-800" />
                  <p className="text-gray-400 dark:text-gray-600 font-black uppercase tracking-[0.2em]">Sense assignacions</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-[40px] shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden transition-colors">
            <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <LayoutGrid size={18} className="text-fgc-green" />
                <h3 className="font-black text-fgc-grey dark:text-white uppercase tracking-tight">Estat de la Flota per Sèries</h3>
              </div>
              <div className="flex bg-white dark:bg-black p-1 rounded-xl shadow-sm border border-gray-100 dark:border-white/10">
                {FLEET_CONFIG.map((config) => (
                  <button
                    key={config.serie}
                    onClick={() => setActiveFleetSerie(config.serie)}
                    className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${
                      activeFleetSerie === config.serie ? 'bg-fgc-grey dark:bg-fgc-green dark:text-fgc-grey text-white shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}
                  >
                    S-{config.serie}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-8">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6 mb-8 px-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-fgc-green rounded-full shadow-sm shadow-fgc-green/40" />
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Disponible</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full shadow-sm shadow-red-500/40" />
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Avariat</span>
                </div>
                <div className="flex items-center gap-2">
                  <Camera size={14} className="text-blue-500" />
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Imatges</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-yellow-500" />
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Registres</span>
                </div>
                <div className="flex items-center gap-2">
                  <Brush size={14} className="text-orange-500" />
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Neteja</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                {getTrainsBySerie(
                  activeFleetSerie, 
                  FLEET_CONFIG.find(c => c.serie === activeFleetSerie)?.count || 0
                ).map(trainNum => {
                  const isOccupied = assignedTrainNumbers.has(trainNum);
                  const isBroken = brokenTrains.has(trainNum);
                  const needsImages = imageTrains.has(trainNum);
                  const needsRecords = recordTrains.has(trainNum);
                  const needsCleaning = cleaningTrains.has(trainNum);
                  const currentCycle = assignments.find(a => a.train_number === trainNum)?.cycle_id;
                  
                  return (
                    <div key={trainNum} className="relative group">
                      <div
                        className={`w-full p-4 pb-6 rounded-[24px] border transition-all text-center flex flex-col items-center gap-1.5 relative overflow-hidden ${
                          isBroken
                            ? 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900 ring-1 ring-red-100 dark:ring-red-900/50'
                            : isOccupied 
                              ? 'bg-gray-50 dark:bg-black/20 text-gray-400 dark:text-gray-500 border-gray-100 dark:border-white/5 opacity-80' 
                              : 'bg-white dark:bg-gray-800 text-fgc-grey dark:text-gray-300 border-gray-100 dark:border-white/5 hover:border-fgc-green hover:shadow-xl hover:scale-105 transition-transform'
                        }`}
                      >
                        {isBroken ? <AlertTriangle size={20} className="text-red-500" /> : <Train size={20} className={isOccupied ? 'text-gray-300 dark:text-gray-600' : 'text-fgc-green'} />}
                        <span className="text-base font-black tracking-tight">{trainNum}</span>
                        
                        {/* Indicadors actius */}
                        <div className="flex gap-1.5 mt-1">
                           {needsImages && <Camera size={12} className="text-blue-500 fill-blue-500/10" />}
                           {needsRecords && <FileText size={12} className="text-yellow-500 fill-yellow-500/10" />}
                           {needsCleaning && <Brush size={12} className="text-orange-500 fill-orange-500/10" />}
                        </div>

                        {isOccupied && (
                          <div className="flex items-center gap-1 mt-1 opacity-40 dark:opacity-30">
                            <span className="text-[10px] font-black uppercase">{currentCycle}</span>
                          </div>
                        )}
                        {isBroken && <span className="text-[8px] font-black uppercase text-red-400 mt-1">FORA DE SERVEI</span>}
                      </div>

                      {/* Controls de manteniment (flotants en hover) */}
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-30 group-hover:pointer-events-auto">
                        <button
                          onClick={() => handleToggleStatus(trainNum, 'is_broken', isBroken)}
                          className={`pointer-events-auto absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full flex items-center justify-center shadow-lg border-2 transition-all ${
                            isBroken ? 'bg-red-600 text-white border-white dark:border-gray-800' : 'bg-white dark:bg-gray-700 text-gray-300 hover:text-red-500 hover:border-red-500 border-gray-100 dark:border-white/10'
                          }`}
                          title="Marcar Avaria"
                        >
                          <Wrench size={12} />
                        </button>

                        <button
                          onClick={() => handleToggleStatus(trainNum, 'needs_images', needsImages)}
                          className={`pointer-events-auto absolute -top-1.5 -left-1.5 w-7 h-7 rounded-full flex items-center justify-center shadow-lg border-2 transition-all ${
                            needsImages ? 'bg-blue-600 text-white border-white dark:border-gray-800' : 'bg-white dark:bg-gray-700 text-gray-300 hover:text-blue-500 hover:border-blue-500 border-gray-100 dark:border-white/10'
                          }`}
                          title="Extraure Imatges"
                        >
                          <Camera size={12} />
                        </button>

                        <button
                          onClick={() => handleToggleStatus(trainNum, 'needs_records', needsRecords)}
                          className={`pointer-events-auto absolute -bottom-1.5 -left-1.5 w-7 h-7 rounded-full flex items-center justify-center shadow-lg border-2 transition-all ${
                            needsRecords ? 'bg-yellow-500 text-white border-white dark:border-gray-800' : 'bg-white dark:bg-gray-700 text-gray-300 hover:text-yellow-500 hover:border-yellow-500 border-gray-100 dark:border-white/10'
                          }`}
                          title="Extraure Registres"
                        >
                          <FileText size={12} />
                        </button>

                        <button
                          onClick={() => handleToggleStatus(trainNum, 'needs_cleaning', needsCleaning)}
                          className={`pointer-events-auto absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full flex items-center justify-center shadow-lg border-2 transition-all ${
                            needsCleaning ? 'bg-orange-500 text-white border-white dark:border-gray-800' : 'bg-white dark:bg-gray-700 text-gray-300 hover:text-orange-500 hover:border-orange-500 border-gray-100 dark:border-white/10'
                          }`}
                          title="Neteja"
                        >
                          <Brush size={12} />
                        </button>
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
  );
};

export default CiclesView;