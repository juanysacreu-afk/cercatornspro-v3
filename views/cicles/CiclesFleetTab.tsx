import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Loader2, Save, Train, AlertTriangle, Brush, CheckCircle2, Link as LinkIcon, LayoutGrid, Trash2, Camera, FileText, Plus } from 'lucide-react';
import GlassPanel from '../../components/common/GlassPanel';
import ConfirmModal from '../../components/common/ConfirmModal';
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
    const [activeFleetSerie, setActiveFleetSerie] = useState('ALL');
    const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);


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
                <GlassPanel className="p-3 sm:p-4 md:p-5 rounded-[32px] overflow-hidden shadow-sm border border-gray-100 dark:border-white/5 mx-auto w-full">
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
                        {[
                            { id: 'ALL', label: 'Total Flota', shortLabel: 'T. Flota', count: allFleetTrains.length, icon: <Train size={24} strokeWidth={2.5} />, activeBg: 'bg-fgc-grey dark:bg-white', activeText: 'text-white dark:text-fgc-grey', activeRing: 'ring-fgc-grey/20 dark:ring-white/20', inactiveText: 'text-gray-500 dark:text-gray-400', inactiveBg: 'bg-gray-500/5' },
                            { id: 'BROKEN', label: 'Avariades', shortLabel: 'Avaria', count: brokenTrains.size, icon: <AlertTriangle size={24} strokeWidth={2.5} />, activeBg: 'bg-red-500', activeText: 'text-white', activeRing: 'ring-red-500/30', inactiveText: 'text-red-500', inactiveBg: 'bg-red-500/5' },
                            { id: 'OPERATIONAL', label: 'Disponibles', shortLabel: 'Disp.', count: allFleetTrains.length - brokenTrains.size, icon: <CheckCircle2 size={24} strokeWidth={2.5} />, activeBg: 'bg-green-500', activeText: 'text-white', activeRing: 'ring-green-500/30', inactiveText: 'text-green-500', inactiveBg: 'bg-green-500/5' },
                            { id: 'CLEANING', label: 'Neteja', shortLabel: 'Neteja', count: cleaningTrains.size, icon: <Brush size={24} strokeWidth={2.5} />, activeBg: 'bg-orange-500', activeText: 'text-white', activeRing: 'ring-orange-500/30', inactiveText: 'text-orange-500', inactiveBg: 'bg-orange-500/5' },
                            { id: 'ASSIGNED', label: 'Assignades', shortLabel: 'Assig.', count: assignedTrainNumbers.size, icon: <LinkIcon size={24} strokeWidth={2.5} />, activeBg: 'bg-blue-500', activeText: 'text-white', activeRing: 'ring-blue-500/30', inactiveText: 'text-blue-500', inactiveBg: 'bg-blue-500/5' },
                            { id: 'UNASSIGNED', label: 'Lliures', shortLabel: 'Lliures', count: allFleetTrains.length - assignedTrainNumbers.size, icon: <LayoutGrid size={24} strokeWidth={2.5} />, activeBg: 'bg-purple-500', activeText: 'text-white', activeRing: 'ring-purple-500/30', inactiveText: 'text-gray-500 dark:text-gray-400', inactiveBg: 'bg-purple-500/5' }
                        ].map(stat => {
                            const isActive = fleetFilter === stat.id;
                            return (
                                <button
                                    key={stat.id}
                                    onClick={() => setFleetFilter(stat.id as any)}
                                    className={`relative flex flex-col items-center justify-center p-3 sm:p-4 rounded-[20px] transition-all duration-300 w-full hover:scale-105 active:scale-95 border ${isActive ? `${stat.activeBg} ${stat.activeText} shadow-xl ring-4 ring-inset ${stat.activeRing} border-transparent scale-105 z-10` : `${stat.inactiveBg} border-gray-200/50 dark:border-white/5 hover:bg-white dark:hover:bg-white/10`}`}
                                >
                                    <div className={`mb-3 transition-colors ${isActive ? 'text-inherit' : stat.inactiveText}`}>
                                        {stat.icon}
                                    </div>
                                    <span className={`text-[10px] sm:text-xs font-black uppercase tracking-widest text-center w-full px-1 truncate leading-tight ${isActive ? 'text-inherit opacity-90' : 'text-gray-500 dark:text-gray-400'}`}>
                                        <span className="hidden xl:inline">{stat.label}</span>
                                        <span className="xl:hidden">{stat.shortLabel}</span>
                                    </span>
                                    <span className={`text-xl sm:text-2xl font-black mt-1.5 leading-none ${isActive ? 'text-inherit' : 'text-fgc-grey dark:text-white'}`}>
                                        {stat.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </GlassPanel>
                <GlassPanel className="overflow-hidden">
                    <div className="p-6 border-b border-gray-100 dark:border-white/5 flex items-center justify-between"><h3 className="font-black flex items-center gap-2 text-fgc-grey dark:text-white"><LayoutGrid size={18} /> FLOTA <span className="text-sm font-bold text-gray-400 ml-2 hidden sm:inline-block">— {{ ALL: 'TOTAL FLOTA', BROKEN: 'AVARIADES', OPERATIONAL: 'DISPONIBLES', CLEANING: 'NETEJA', RECORDS: 'REGISTRES', IMAGES: 'IMATGES', ASSIGNED: 'ASSIGNADES', UNASSIGNED: 'SENSE ASSIGNAR' }[fleetFilter as string]}</span></h3> <div className="flex gap-2"><button onClick={() => setActiveFleetSerie('ALL')} className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${activeFleetSerie === 'ALL' ? 'bg-fgc-grey text-white' : 'text-gray-400 hover:text-fgc-grey'}`}>Totes</button>{FLEET_CONFIG.map(c => <button key={c.serie} onClick={() => setActiveFleetSerie(c.serie)} className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${activeFleetSerie === c.serie ? 'bg-fgc-grey text-white' : 'text-gray-400 hover:text-fgc-grey'}`}>{c.serie}</button>)}</div></div>
                    <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {(activeFleetSerie === 'ALL' ? allFleetTrains : getTrainsBySerie(activeFleetSerie, FLEET_CONFIG.find(c => c.serie === activeFleetSerie)?.count || 0)).filter(t => fleetFilter === 'BROKEN' ? brokenTrains.has(t) : fleetFilter === 'OPERATIONAL' ? !brokenTrains.has(t) : fleetFilter === 'CLEANING' ? cleaningTrains.has(t) : fleetFilter === 'RECORDS' ? recordTrains.has(t) : fleetFilter === 'IMAGES' ? imageTrains.has(t) : fleetFilter === 'ASSIGNED' ? assignedTrainNumbers.has(t) : fleetFilter === 'UNASSIGNED' ? !assignedTrainNumbers.has(t) : true).map(t => (
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
                    <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/20 flex items-center justify-between"><h3 className="font-black flex items-center gap-2 text-fgc-grey dark:text-white"><LinkIcon size={18} /> ASSIGNACIONS</h3> {assignments.length > 0 && <button onClick={() => setShowDeleteAllConfirm(true)} className="text-[10px] font-black text-red-500 uppercase">Eliminar Tot</button>}</div>
                    {showDeleteAllConfirm && (
                        <ConfirmModal
                            message="Eliminar totes les assignacions d'unitats? Aquesta acció no es pot desfer."
                            confirmLabel="Sí, eliminar tot"
                            onConfirm={() => { setShowDeleteAllConfirm(false); handleDeleteAllAssignments(); }}
                            onCancel={() => setShowDeleteAllConfirm(false)}
                        />
                    )}
                    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {assignments.map(a => <div key={a.cycle_id} className="p-4 rounded-xl border border-gray-100 dark:border-white/5 flex items-center justify-between"><div className="font-black text-sm text-gray-400">{a.cycle_id} <div className="text-lg text-fgc-grey dark:text-white">{a.train_number}</div></div> <button onClick={() => handleDeleteAssignment(a.cycle_id)} className="text-gray-300 hover:text-red-500"><Trash2 size={18} /></button></div>)}
                    </div>
                </GlassPanel>
            </div>
        </div>
    );
};

export default CiclesFleetTab;
