import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Loader2, Save, Train, AlertTriangle, Brush, CheckCircle2, Link as LinkIcon, LayoutGrid, Trash2, Camera, FileText, Plus } from 'lucide-react';
import GlassPanel from '../../components/common/GlassPanel';
import { Assignment } from '../../types';

interface CiclesFleetTabProps {
    loading: boolean;
    saving: boolean;
    assignments: Assignment[];
    brokenTrains: Set<string>;
    cleaningTrains: Set<string>;
    recordTrains: Set<string>;
    imageTrains: Set<string>;
    availableShiftsCycles: string[];
    allFleetTrains: string[];
    handleSaveAssignment: (newCycleId: string, newTrainId: string) => Promise<boolean>;
    handleDeleteAssignment: (id: string) => Promise<void>;
    handleDeleteAllAssignments: () => Promise<void>;
    setSelectedUnitDetail: (t: string) => void;
    FLEET_CONFIG: { serie: string; count: number }[];
}

const CiclesFleetTab: React.FC<CiclesFleetTabProps> = ({
    loading, saving, assignments, brokenTrains, cleaningTrains, recordTrains, imageTrains,
    availableShiftsCycles, allFleetTrains, handleSaveAssignment, handleDeleteAssignment, handleDeleteAllAssignments,
    setSelectedUnitDetail, FLEET_CONFIG
}) => {
    const [newCycleId, setNewCycleId] = useState('');
    const [newTrainId, setNewTrainId] = useState('');
    const [showCycleSuggestions, setShowCycleSuggestions] = useState(false);
    const [showTrainSuggestions, setShowTrainSuggestions] = useState(false);
    const [fleetFilter, setFleetFilter] = useState<'ALL' | 'BROKEN' | 'OPERATIONAL' | 'CLEANING' | 'RECORDS' | 'IMAGES' | 'ASSIGNED' | 'UNASSIGNED'>('ALL');
    const [activeFleetSerie, setActiveFleetSerie] = useState('112');

    const cycleSuggestionsRef = useRef<HTMLDivElement>(null);
    const trainSuggestionsRef = useRef<HTMLDivElement>(null);

    // Click outside handler for suggestions
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (cycleSuggestionsRef.current && !cycleSuggestionsRef.current.contains(e.target as Node)) setShowCycleSuggestions(false);
            if (trainSuggestionsRef.current && !trainSuggestionsRef.current.contains(e.target as Node)) setShowTrainSuggestions(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const assignedCycleIds = useMemo(() => new Set(assignments.map(a => a.cycle_id)), [assignments]);
    const assignedTrainNumbers = useMemo(() => new Set(assignments.map(a => a.train_number)), [assignments]);

    const filteredCyclesSuggestions = useMemo(() => availableShiftsCycles.filter(c => c.toUpperCase().includes(newCycleId.toUpperCase()) && (!newCycleId || !assignedCycleIds.has(c))).slice(0, 10), [newCycleId, availableShiftsCycles, assignedCycleIds]);
    const filteredTrainSuggestions = useMemo(() => allFleetTrains.filter(t => t.includes(newTrainId) && (!newTrainId || (!assignedTrainNumbers.has(t) && !brokenTrains.has(t)))).slice(0, 10), [newTrainId, allFleetTrains, assignedTrainNumbers, brokenTrains]);

    const availableCyclesByOrigin = useMemo(() => availableShiftsCycles.filter(c => (!assignedCycleIds.has(c))), [availableShiftsCycles, assignedCycleIds]);

    const getTrainsBySerie = (serie: string, count: number) => {
        return Array.from({ length: count }, (_, i) => `${serie}.${(i + 1).toString().padStart(2, '0')}`);
    };

    const onSave = async () => {
        const success = await handleSaveAssignment(newCycleId, newTrainId);
        if (success) {
            setNewCycleId('');
            setNewTrainId('');
        }
    };

    return (
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
                        <button onClick={onSave} disabled={saving || !newCycleId || !newTrainId} className="w-full bg-fgc-green text-fgc-grey p-5 rounded-2xl font-black text-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2">{saving ? <Loader2 className="animate-spin" /> : <Save />} GUARDAR</button>
                    </div>

                    <div className="pt-6 border-t border-gray-100 dark:border-white/5">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Cicles Disponibles ({availableCyclesByOrigin.length})</h4>
                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                            {availableCyclesByOrigin.length > 0 ? (
                                <div className="grid grid-cols-3 gap-2">
                                    {availableCyclesByOrigin.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setNewCycleId(c)}
                                            className="h-10 flex items-center justify-center rounded-xl bg-gray-50 dark:bg-white/5 hover:bg-fgc-green hover:text-white dark:hover:bg-fgc-green dark:hover:text-white transition-all text-xs font-black text-fgc-grey dark:text-gray-300 uppercase border border-gray-100 dark:border-white/5 shadow-sm"
                                            title={c}
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-300 dark:text-gray-600 font-bold text-xs uppercase italic">
                                    No hi ha cicles disponibles
                                </div>
                            )}
                        </div>
                    </div>
                </GlassPanel>
            </div>
            <div className="lg:col-span-2 space-y-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* 1. Total Flota */}
                    <GlassPanel hover onClick={() => setFleetFilter('ALL')} className={`p-5 rounded-3xl flex flex-col justify-between gap-2 transition-all cursor-pointer ${fleetFilter === 'ALL' ? 'ring-2 ring-inset ring-fgc-green bg-fgc-green/5' : ''}`}>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-500/10 text-gray-500"><Train size={18} /></div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Flota</p>
                            <p className="text-2xl font-black text-fgc-grey dark:text-white leading-none mt-1">{allFleetTrains.length}</p>
                        </div>
                    </GlassPanel>

                    {/* 2. Avariades / Disponibles */}
                    <GlassPanel className="p-1 rounded-3xl flex overflow-hidden lg:col-span-1 shadow-sm border border-gray-100 dark:border-white/5">
                        <div onClick={() => setFleetFilter('BROKEN')} className={`flex-1 p-3 flex flex-col items-center justify-center transition-all cursor-pointer rounded-[20px] ${fleetFilter === 'BROKEN' ? 'bg-red-500/10 text-red-500 ring-1 ring-inset ring-red-500/50' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                            <AlertTriangle size={18} className={fleetFilter === 'BROKEN' ? 'text-red-500' : 'text-gray-400'} />
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2 hidden xl:block">Avariades</p>
                            <p className={`text-xl font-black mt-1 leading-none ${fleetFilter === 'BROKEN' ? 'text-red-500' : 'text-fgc-grey dark:text-white'}`}>{brokenTrains.size}</p>
                        </div>
                        <div className="w-[1px] my-4 bg-gray-100 dark:bg-white/5" />
                        <div onClick={() => setFleetFilter('OPERATIONAL')} className={`flex-1 p-3 flex flex-col items-center justify-center transition-all cursor-pointer rounded-[20px] ${fleetFilter === 'OPERATIONAL' ? 'bg-green-500/10 text-green-500 ring-1 ring-inset ring-green-500/50' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                            <CheckCircle2 size={18} className={fleetFilter === 'OPERATIONAL' ? 'text-green-500' : 'text-gray-400'} />
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2 hidden xl:block">Disponibles</p>
                            <p className={`text-xl font-black mt-1 leading-none ${fleetFilter === 'OPERATIONAL' ? 'text-green-500' : 'text-fgc-grey dark:text-white'}`}>{allFleetTrains.length - brokenTrains.size}</p>
                        </div>
                    </GlassPanel>

                    {/* 3. Neteja */}
                    <GlassPanel hover onClick={() => setFleetFilter('CLEANING')} className={`p-5 rounded-3xl flex flex-col justify-between gap-2 transition-all cursor-pointer ${fleetFilter === 'CLEANING' ? 'ring-2 ring-inset ring-orange-500 bg-orange-500/5' : ''}`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${fleetFilter === 'CLEANING' ? 'bg-orange-500/10 text-orange-500' : 'bg-orange-500/10 text-orange-400'}`}><Brush size={18} /></div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Neteja</p>
                            <p className={`text-2xl font-black leading-none mt-1 ${fleetFilter === 'CLEANING' ? 'text-orange-500' : 'text-fgc-grey dark:text-white'}`}>{cleaningTrains.size}</p>
                        </div>
                    </GlassPanel>

                    {/* 4. Assignades / Sense Assignar */}
                    <GlassPanel className="p-1 rounded-3xl flex overflow-hidden lg:col-span-1 shadow-sm border border-gray-100 dark:border-white/5">
                        <div onClick={() => setFleetFilter('ASSIGNED')} className={`flex-1 p-3 flex flex-col items-center justify-center transition-all cursor-pointer rounded-[20px] ${fleetFilter === 'ASSIGNED' ? 'bg-blue-500/10 text-blue-500 ring-1 ring-inset ring-blue-500/50' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                            <LinkIcon size={18} className={fleetFilter === 'ASSIGNED' ? 'text-blue-500' : 'text-gray-400'} />
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2 hidden xl:block">Assignades</p>
                            <p className={`text-xl font-black mt-1 leading-none ${fleetFilter === 'ASSIGNED' ? 'text-blue-500' : 'text-fgc-grey dark:text-white'}`}>{assignedTrainNumbers.size}</p>
                        </div>
                        <div className="w-[1px] my-4 bg-gray-100 dark:bg-white/5" />
                        <div onClick={() => setFleetFilter('UNASSIGNED')} className={`flex-1 p-3 flex flex-col items-center justify-center transition-all cursor-pointer rounded-[20px] ${fleetFilter === 'UNASSIGNED' ? 'bg-gray-500/10 text-gray-500 ring-1 ring-inset ring-gray-500/50' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                            <LayoutGrid size={18} className={fleetFilter === 'UNASSIGNED' ? 'text-gray-500' : 'text-gray-400'} />
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2 hidden xl:block">Lliures</p>
                            <p className={`text-xl font-black mt-1 leading-none ${fleetFilter === 'UNASSIGNED' ? 'text-gray-500' : 'text-fgc-grey dark:text-white'}`}>{allFleetTrains.length - assignedTrainNumbers.size}</p>
                        </div>
                    </GlassPanel>
                </div>
                <GlassPanel className="overflow-hidden">
                    <div className="p-6 border-b border-gray-100 dark:border-white/5 flex items-center justify-between"><h3 className="font-black flex items-center gap-2 text-fgc-grey dark:text-white"><LayoutGrid size={18} /> FLOTA <span className="text-sm font-bold text-gray-400 ml-2 hidden sm:inline-block">— {{ ALL: 'TOTAL FLOTA', BROKEN: 'AVARIADES', OPERATIONAL: 'DISPONIBLES', CLEANING: 'NETEJA', RECORDS: 'REGISTRES', IMAGES: 'IMATGES', ASSIGNED: 'ASSIGNADES', UNASSIGNED: 'SENSE ASSIGNAR' }[fleetFilter as string]}</span></h3> <div className="flex gap-2">{FLEET_CONFIG.map(c => <button key={c.serie} onClick={() => setActiveFleetSerie(c.serie)} className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${activeFleetSerie === c.serie ? 'bg-fgc-grey text-white' : 'text-gray-400 hover:text-fgc-grey'}`}>{c.serie}</button>)}</div></div>
                    <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {getTrainsBySerie(activeFleetSerie, FLEET_CONFIG.find(c => c.serie === activeFleetSerie)?.count || 0).filter(t => fleetFilter === 'BROKEN' ? brokenTrains.has(t) : fleetFilter === 'OPERATIONAL' ? !brokenTrains.has(t) : fleetFilter === 'CLEANING' ? cleaningTrains.has(t) : fleetFilter === 'RECORDS' ? recordTrains.has(t) : fleetFilter === 'IMAGES' ? imageTrains.has(t) : fleetFilter === 'ASSIGNED' ? assignedTrainNumbers.has(t) : fleetFilter === 'UNASSIGNED' ? !assignedTrainNumbers.has(t) : true).map(t => (
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
                <GlassPanel className="overflow-hidden">
                    <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/20 flex items-center justify-between"><h3 className="font-black flex items-center gap-2 text-fgc-grey dark:text-white"><LinkIcon size={18} /> ASSIGNACIONS</h3> {assignments.length > 0 && <button onClick={() => { if (window.confirm("Eliminar tot?")) handleDeleteAllAssignments(); }} className="text-[10px] font-black text-red-500 uppercase">Eliminar Tot</button>}</div>
                    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {assignments.map(a => <div key={a.cycle_id} className="p-4 rounded-xl border border-gray-100 dark:border-white/5 flex items-center justify-between"><div className="font-black text-sm text-gray-400">{a.cycle_id} <div className="text-lg text-fgc-grey dark:text-white">{a.train_number}</div></div> <button onClick={() => handleDeleteAssignment(a.cycle_id)} className="text-gray-300 hover:text-red-500"><Trash2 size={18} /></button></div>)}
                    </div>
                </GlassPanel>
            </div>
        </div>
    );
};

export default CiclesFleetTab;
