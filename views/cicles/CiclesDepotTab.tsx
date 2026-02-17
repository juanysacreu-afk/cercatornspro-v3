import React, { useState } from 'react';
import GlassPanel from '../../components/common/GlassPanel';
import DraggableUnit from './train/DraggableUnit';
import DroppableTrack from './depot/DroppableTrack';
import { CheckCircle2 } from 'lucide-react';

// Hardcoded depot layout (could also be extracted if needed globally)
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

const DEPOT_CAPACITIES_LOCAL: Record<string, { total: number; label: string }> = {
    'PC': { total: 5, label: 'Plaça Catalunya' },
    'RE': { total: 6, label: 'Reina Elisenda' },
    'RB': { total: 28, label: 'Rubí (COR)' },
    'NA': { total: 15, label: 'Terrassa' },
    'PN': { total: 12, label: 'Sabadell' },
};

interface CiclesDepotTabProps {
    parkedUnits: any[];
    allFleetTrains: string[];
    brokenTrains: Set<string>;
    imageTrains: Set<string>;
    recordTrains: Set<string>;
    cleaningTrains: Set<string>;
    handleAddParkedUnit: (unit: string, depot: string, track: string, capacity: number) => Promise<void>;
    handleRemoveParkedUnit: (unit: string) => Promise<void>;
}

const CiclesDepotTab: React.FC<CiclesDepotTabProps> = ({
    parkedUnits, allFleetTrains, brokenTrains, imageTrains, recordTrains, cleaningTrains,
    handleAddParkedUnit, handleRemoveParkedUnit
}) => {
    const [selectedDepot, setSelectedDepot] = useState<string>('PC');
    const [depotFleetFilter, setDepotFleetFilter] = useState<string>('ALL');

    return (
        <div className="animate-in fade-in slide-in-from-right-8 duration-700 space-y-8">
            <GlassPanel className="overflow-hidden">
                <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-gray-50/20 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h2 className="text-xl font-black uppercase tracking-tight text-fgc-grey dark:text-white">Dipòsits</h2>
                        <p className="text-sm text-gray-400">Arrossega trens per organitzar-los.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">{Object.keys(DEPOT_CAPACITIES_LOCAL).map(id => <button key={id} onClick={() => setSelectedDepot(id)} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${selectedDepot === id ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 dark:bg-white/5 text-gray-400 hover:text-fgc-grey'}`}>{id}</button>)}</div>
                </div>
                <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-3 flex flex-col gap-6">
                        <div className="flex flex-col gap-4 px-1">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Unitats Lliures</h3>
                                <div className="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-full text-[10px] font-black border border-blue-500/20">
                                    {allFleetTrains.filter(t => !parkedUnits.some(p => p.unit_number === t)).length} disp.
                                </div>
                            </div>

                            <div className="flex bg-white dark:bg-black/20 p-1 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm">
                                {['ALL', '112', '113', '114', '115'].map(serie => (
                                    <button
                                        key={serie}
                                        onClick={() => setDepotFleetFilter(serie)}
                                        className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${depotFleetFilter === serie
                                            ? 'bg-fgc-grey text-white shadow-md scale-[1.02]'
                                            : 'text-gray-400 hover:text-fgc-grey dark:hover:text-white'
                                            }`}
                                    >
                                        {serie === 'ALL' ? 'TOTES' : serie}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="bg-gray-50/50 dark:bg-black/20 rounded-[32px] p-4 border border-gray-100 dark:border-white/5 h-[700px] flex flex-col">
                            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
                                <div className="grid grid-cols-2 gap-2">
                                    {allFleetTrains
                                        .filter(t => !parkedUnits.some(p => p.unit_number === t))
                                        .filter(t => depotFleetFilter === 'ALL' || t.startsWith(depotFleetFilter))
                                        .map(t => (
                                            <div key={t} className="flex justify-center">
                                                <DraggableUnit
                                                    unit={t}
                                                    isBroken={brokenTrains.has(t)}
                                                    needsImages={imageTrains.has(t)}
                                                    needsRecords={recordTrains.has(t)}
                                                    needsCleaning={cleaningTrains.has(t)}
                                                />
                                            </div>
                                        ))}
                                </div>
                                {allFleetTrains.filter(t => !parkedUnits.some(p => p.unit_number === t)).length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center p-10 text-center space-y-4">
                                        <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-sm">
                                            <CheckCircle2 size={24} className="text-gray-300 dark:text-gray-600" />
                                        </div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-relaxed">No hi ha més unitats lliures per estacionar</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="lg:col-span-9 space-y-8">
                        {DEPOT_LAYOUTS[selectedDepot].sections.map((s, idx) => (
                            <div key={idx} className="space-y-4">
                                <div className="flex items-center gap-4"><span className="text-[10px] font-black text-blue-500 uppercase">{s.name}</span><div className="h-px flex-1 bg-gray-100 dark:bg-white/5" /></div>
                                <div className="grid gap-3">{s.tracks.map(tk => <DroppableTrack key={tk.id} track={tk} capacity={tk.capacity} units={parkedUnits.filter(u => u.depot_id === selectedDepot && u.track === tk.id)} onDropUnit={(unit: string, trackId: string) => handleAddParkedUnit(unit, selectedDepot, trackId, tk.capacity)} onRemoveUnit={handleRemoveParkedUnit} brokenTrains={brokenTrains} imageTrains={imageTrains} recordTrains={recordTrains} cleaningTrains={cleaningTrains} />)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </GlassPanel>
        </div>
    );
};

export default CiclesDepotTab;
