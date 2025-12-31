
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Train, ArrowRight, Save, Loader2, Trash2, X, Hash, Filter, Link as LinkIcon, CheckCircle2, List, LayoutGrid, Info, Wrench, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';
import { Assignment } from '../types.ts';

// Configuració de la flota segons requeriment: 61 unitats totals
const FLEET_CONFIG = [
  { serie: '112', count: 22 },
  { serie: '113', count: 19 },
  { serie: '114', count: 5 },
  { serie: '115', count: 15 },
];

const CiclesView: React.FC = () => {
  const [newCycleId, setNewCycleId] = useState('');
  const [newTrainId, setNewTrainId] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [brokenTrains, setBrokenTrains] = useState<Set<string>>(new Set());
  const [availableShiftsCycles, setAvailableShiftsCycles] = useState<string[]>([]);
  const [showCycleSuggestions, setShowCycleSuggestions] = useState(false);
  const [showTrainSuggestions, setShowTrainSuggestions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterPending, setFilterPending] = useState(true);
  const [activeFleetSerie, setActiveFleetSerie] = useState('112');
  
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
      const { data: assigData } = await supabase
        .from('assignments')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (assigData) setAssignments(assigData);

      const { data: statusData } = await supabase
        .from('train_status')
        .select('train_number')
        .eq('is_broken', true);
      
      if (statusData) {
        setBrokenTrains(new Set(statusData.map(s => s.train_number)));
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

  const handleToggleBroken = async (trainNum: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    
    const newBroken = new Set(brokenTrains);
    if (newStatus) newBroken.add(trainNum);
    else newBroken.delete(trainNum);
    setBrokenTrains(newBroken);

    try {
      const { error } = await supabase
        .from('train_status')
        .upsert({ 
          train_number: trainNum, 
          is_broken: newStatus,
          updated_at: new Date().toISOString()
        });
      
      if (error) throw error;
    } catch (e) {
      console.error("Error actualitzant estat d'avaria:", e);
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black text-fgc-grey tracking-tight">Gestió de Cicles</h1>
        <p className="text-gray-500 font-medium">Assignació d'unitats de tren i control d'estat de la flota.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 sticky top-24 space-y-8">
            <div>
              <h3 className="text-lg font-black text-fgc-grey mb-6 uppercase tracking-tight">Nova Assignació</h3>
              <div className="space-y-6">
                {/* ID Cicle Autocomplete */}
                <div className="relative" ref={cycleSuggestionsRef}>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-1">ID Cicle</label>
                  <div className="relative">
                    <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                      type="text" 
                      className="w-full bg-gray-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-4 focus:ring-fgc-green/20 outline-none font-black text-lg transition-all"
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
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                      {filteredCyclesSuggestions.map(c => (
                        <button 
                          key={c}
                          className="w-full text-left px-6 py-4 hover:bg-fgc-green/10 font-black text-fgc-grey transition-colors flex items-center justify-between group border-b border-gray-50 last:border-0"
                          onClick={() => { setNewCycleId(c); setShowCycleSuggestions(false); }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-gray-300">#</span>
                            {c}
                            {assignedCycleIds.has(c) && <CheckCircle2 size={12} className="text-blue-500" />}
                          </div>
                          <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-fgc-green" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Unitat de Tren Autocomplete */}
                <div className="relative" ref={trainSuggestionsRef}>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-1">Unitat de Tren</label>
                  <div className="relative">
                    <Train className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                      type="text" 
                      className={`w-full bg-gray-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-4 focus:ring-fgc-green/20 outline-none font-black text-lg transition-all ${brokenTrains.has(newTrainId) ? 'text-red-600' : ''}`}
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
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                      {filteredTrainSuggestions.map(t => (
                        <button 
                          key={t}
                          className="w-full text-left px-6 py-4 hover:bg-fgc-green/10 font-black text-fgc-grey transition-colors flex items-center justify-between group border-b border-gray-50 last:border-0"
                          onClick={() => { setNewTrainId(t); setShowTrainSuggestions(false); }}
                        >
                          <div className="flex items-center gap-3">
                            <Train size={14} className="text-gray-300" />
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

            <div className="pt-8 border-t border-gray-100">
              <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-2">
                  <Filter size={14} className="text-fgc-green" />
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Cicles Disponibles</h3>
                </div>
                <button 
                  onClick={() => setFilterPending(!filterPending)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase transition-all border ${
                    filterPending ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-gray-100 text-gray-400 border-gray-200'
                  }`}
                >
                  {filterPending ? 'Pendents' : 'Tots'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar p-1">
                {availableShiftsCycles.filter(c => !filterPending || !assignedCycleIds.has(c)).map(c => {
                  const isAssigned = assignedCycleIds.has(c);
                  return (
                    <button
                      key={c}
                      onClick={() => { setNewCycleId(c); setShowCycleSuggestions(false); }}
                      className={`py-3 px-2 rounded-xl text-xs font-black border transition-all relative ${
                        newCycleId === c 
                        ? 'bg-fgc-green text-fgc-grey border-fgc-green shadow-sm' 
                        : isAssigned ? 'bg-blue-50 text-blue-500 border-blue-100 opacity-60' : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-white'
                      }`}
                    >
                      {c}
                      {isAssigned && <CheckCircle2 size={10} className="absolute -top-1.5 -right-1.5 text-blue-500 bg-white rounded-full shadow-sm" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-8 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <LinkIcon size={18} className="text-fgc-green" />
                <h3 className="font-black text-fgc-grey uppercase tracking-tight">Assignacions Actives</h3>
              </div>
              <div className="bg-fgc-grey text-white px-3 py-1 rounded-full text-[10px] font-black">{assignments.length} EN SERVEI</div>
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
                        className={`group p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${isBroken ? 'bg-red-50 border-red-200 shadow-lg' : 'bg-gray-50/50 border-gray-100 hover:bg-white hover:shadow-lg'}`}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`h-12 w-fit min-w-[3.5rem] px-3 rounded-xl flex items-center justify-center font-black text-sm shadow-md whitespace-nowrap ${isBroken ? 'bg-red-600 text-white' : 'bg-fgc-grey text-white'}`}>
                            {cycle.cycle_id}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-[9px] font-black uppercase tracking-widest leading-none mb-1 ${isBroken ? 'text-red-400' : 'text-gray-400'}`}>UNITAT</p>
                            <p className={`text-lg font-black leading-tight truncate ${isBroken ? 'text-red-700' : 'text-fgc-grey'}`}>
                              {cycle.train_number}
                            </p>
                            {isBroken && <span className="text-[8px] font-black text-red-500 uppercase flex items-center gap-1 mt-0.5"><AlertTriangle size={8} /> AVARIAT</span>}
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDelete(cycle.cycle_id)}
                          className={`p-2.5 rounded-xl transition-all sm:opacity-0 sm:group-hover:opacity-100 shrink-0 ${isBroken ? 'text-red-400 hover:bg-red-100' : 'text-gray-300 hover:text-red-500 hover:bg-red-50'}`}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-20 text-center space-y-4 flex flex-col items-center opacity-30">
                  <Train size={64} className="text-gray-200" />
                  <p className="text-gray-400 font-black uppercase tracking-[0.2em]">Sense assignacions</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-8 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <LayoutGrid size={18} className="text-fgc-green" />
                <h3 className="font-black text-fgc-grey uppercase tracking-tight">Estat de la Flota per Sèries</h3>
              </div>
              <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-100">
                {FLEET_CONFIG.map((config) => (
                  <button
                    key={config.serie}
                    onClick={() => setActiveFleetSerie(config.serie)}
                    className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${
                      activeFleetSerie === config.serie ? 'bg-fgc-grey text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    S-{config.serie}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-8">
              <div className="flex flex-wrap items-center gap-6 mb-8 px-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-fgc-green rounded-full shadow-sm shadow-fgc-green/40" />
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Disponible</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-gray-300 rounded-full" />
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">En Servei</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full shadow-sm shadow-red-500/40" />
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Avariat</span>
                </div>
                <div className="ml-auto flex items-center gap-1.5 text-blue-500">
                  <Info size={14} />
                  <span className="text-[10px] font-black uppercase tracking-tighter">Clica la clau per marcar avaria</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {getTrainsBySerie(
                  activeFleetSerie, 
                  FLEET_CONFIG.find(c => c.serie === activeFleetSerie)?.count || 0
                ).map(trainNum => {
                  const isOccupied = assignedTrainNumbers.has(trainNum);
                  const isBroken = brokenTrains.has(trainNum);
                  
                  return (
                    <div key={trainNum} className="relative group">
                      <button
                        disabled={isOccupied || isBroken}
                        onClick={() => {
                          setNewTrainId(trainNum);
                          setShowTrainSuggestions(false);
                        }}
                        className={`w-full p-4 rounded-2xl border transition-all text-center flex flex-col items-center gap-1.5 ${
                          isBroken
                            ? 'bg-red-50 text-red-600 border-red-200 ring-1 ring-red-100'
                            : isOccupied 
                              ? 'bg-gray-50 text-gray-300 border-gray-100 opacity-60 cursor-not-allowed' 
                              : 'bg-white text-fgc-grey border-gray-100 hover:border-fgc-green hover:shadow-xl hover:scale-105 active:scale-95'
                        }`}
                      >
                        {isBroken ? <AlertTriangle size={20} className="text-red-500" /> : <Train size={20} className={isOccupied ? 'text-gray-200' : 'text-fgc-green'} />}
                        <span className="text-base font-black tracking-tight">{trainNum}</span>
                        {!isOccupied && !isBroken && <div className="h-1.5 w-8 bg-fgc-green rounded-full mt-1" />}
                        {isOccupied && <span className="text-[8px] font-black uppercase opacity-60">{assignments.find(a => a.train_number === trainNum)?.cycle_id}</span>}
                        {isBroken && <span className="text-[8px] font-black uppercase text-red-400">FORA DE SERVEI</span>}
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleBroken(trainNum, isBroken);
                        }}
                        className={`absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 transition-all z-20 ${
                          isBroken 
                            ? 'bg-red-600 text-white border-white scale-110' 
                            : 'bg-white text-gray-400 border-gray-100 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:border-red-500 hover:scale-110'
                        }`}
                      >
                        <Wrench size={14} />
                      </button>
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
