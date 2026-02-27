import React from 'react';
import { Scissors, AlertCircle, ArrowDownToLine, ArrowUpToLine, ArrowLeftToLine, ArrowRightToLine, Layers, Train, User, Zap } from 'lucide-react';
import { LivePersonnel } from '../../types';
import ListPersonnelRow from './ListPersonnelRow';
import { getConnectivityIslands } from './mapUtils';

interface CutAnalysisPanelProps {
    dividedPersonnel: any;
    selectedCutStations: Set<string>;
    selectedCutSegments: Set<string>;
    setAltServiceIsland: (val: string | null) => void;
    setIsPaused: (val: boolean) => void;
    manualOverrides: Record<string, string>;
    setManualOverrides: (val: Record<string, string>) => void;
    openMenuId: string | null;
    setOpenMenuId: (val: string | null) => void;
    isPrivacyMode: boolean;
}

type ColumnDef = {
    id: string;
    label: string;
    Icon: React.ComponentType<{ size?: number; className?: string }>;
    color: string;
    iconClass: string;
    unifiedOnly?: boolean;
    splitOnly?: boolean;
};

const COLUMNS: ColumnDef[] = [
    { id: 'AFFECTED', label: 'Zona de Tall / Atrapats', Icon: AlertCircle, color: 'red', iconClass: 'text-red-500' },
    { id: 'BCN', label: 'Costat Barcelona', Icon: ArrowDownToLine, color: 'blue', iconClass: 'text-blue-500' },
    { id: 'VALLES', label: 'Costat Vallès', Icon: ArrowUpToLine, color: 'green', iconClass: 'text-fgc-green', unifiedOnly: true },
    { id: 'S1', label: 'Costat Terrassa', Icon: ArrowUpToLine, color: 'orange', iconClass: 'text-orange-500', splitOnly: true },
    { id: 'S2', label: 'Costat Sabadell', Icon: ArrowRightToLine, color: 'green', iconClass: 'text-fgc-green', splitOnly: true },
    { id: 'L6', label: 'Costat Elisenda', Icon: ArrowUpToLine, color: 'purple', iconClass: 'text-purple-500' },
    { id: 'L7', label: 'Costat Tibidabo', Icon: ArrowLeftToLine, color: 'amber', iconClass: 'text-amber-700' },
    { id: 'ISOLATED', label: 'Zones Aïllades', Icon: Layers, color: 'gray', iconClass: 'text-gray-500' },
];


const CutAnalysisPanel: React.FC<CutAnalysisPanelProps> = ({
    dividedPersonnel,
    selectedCutStations,
    selectedCutSegments,
    setAltServiceIsland,
    setIsPaused,
    manualOverrides,
    setManualOverrides,
    openMenuId,
    setOpenMenuId,
    isPrivacyMode,
}) => {
    if (!dividedPersonnel) return null;
    const vallesUnified = dividedPersonnel.VALLES?.isUnified;

    return (
        <div className="mt-6 space-y-8 animate-in fade-in slide-in-from-top-4">
            {/* Header */}
            <div className="flex items-center gap-4 border-b-4 border-red-500/20 pb-4">
                <div className="p-3 bg-red-500 rounded-2xl text-white shadow-lg shadow-red-500/20">
                    <Scissors size={24} />
                </div>
                <div>
                    <h4 className="text-[12px] font-bold text-red-500 uppercase tracking-[0.2em] leading-none">ANÀLISI DE TALL OPERATIU</h4>
                    <p className="text-xl font-bold text-fgc-grey dark:text-white uppercase mt-1">
                        Multi-talls actius: {selectedCutStations.size} estacions, {selectedCutSegments.size} trams
                    </p>
                </div>
            </div>

            {/* Zone buckets */}
            <div className="flex flex-col gap-6">
                {COLUMNS.map((col) => {
                    const bucket = dividedPersonnel[col.id];
                    const items: LivePersonnel[] = bucket?.list || [];
                    if (col.unifiedOnly && !vallesUnified) return null;
                    if (col.splitOnly && vallesUnified) return null;
                    if (items.length === 0 && col.id !== 'AFFECTED') return null;

                    const trainsCount = items.filter((i) => i.type === 'TRAIN').length;
                    const isRed = col.color === 'red';

                    return (
                        <div
                            key={col.id}
                            className={`${isRed ? 'bg-red-50/50 dark:bg-red-950/20 border-2 border-red-500/30 ring-4 ring-red-500/10' : 'glass-card border border-gray-100 dark:border-white/10'} rounded-[32px] p-6 transition-all hover:translate-y-[-4px] group relative overflow-hidden`}
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-fgc-green/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
                                <div className="flex items-center gap-2">
                                    <col.Icon size={18} className={col.iconClass} />
                                    <h5 className={`font-bold uppercase text-xs sm:text-sm tracking-widest ${isRed ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>{col.label}</h5>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:ml-auto">
                                    <div className="flex items-center gap-1.5 bg-fgc-grey dark:bg-black text-white px-3 py-1 rounded-xl text-[10px] sm:text-xs font-bold" title="Trens Actius">
                                        <Train size={10} /> {trainsCount} <span className="hidden sm:inline opacity-60">TRENS</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 bg-fgc-green text-fgc-grey px-3 py-1 rounded-xl text-[10px] sm:text-xs font-bold" title="Maquinistes a la zona">
                                        <User size={10} /> {items.length} <span className="hidden sm:inline opacity-60">MAQUINISTES</span>
                                    </div>
                                    {items.length > 0 && (
                                        <button
                                            onClick={() => { setAltServiceIsland(col.id); setIsPaused(true); }}
                                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded-xl text-[10px] sm:text-xs font-bold shadow-md hover:scale-105 active:scale-95 transition-all"
                                        >
                                            <Zap size={10} /> SERVEI ALTERNATIU
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className={`bg-white dark:bg-black/20 rounded-2xl border ${isRed ? 'border-red-200 dark:border-red-900/50' : 'border-gray-100 dark:border-white/10'} divide-y ${isRed ? 'divide-red-100 dark:divide-red-900/30' : 'divide-gray-50 dark:divide-white/5'}`}>
                                {items
                                    .sort((a, b) => (a.type === 'TRAIN' ? 0 : 1) - (b.type === 'TRAIN' ? 0 : 1))
                                    .map((t) => {
                                        const islands = getConnectivityIslands(selectedCutStations, selectedCutSegments);
                                        const currentStation = t.stationId.toUpperCase();
                                        const startStation = (t as any).shiftDep?.toUpperCase();
                                        let isDisplaced = false;
                                        if (startStation) {
                                            const startIsland = Object.entries(islands).find(([, stations]) => stations.has(startStation))?.[0];
                                            const currentIsland = Object.entries(islands).find(([, stations]) => stations.has(currentStation))?.[0];
                                            if (startIsland && currentIsland && startIsland !== currentIsland) isDisplaced = true;
                                        }
                                        return (
                                            <ListPersonnelRow
                                                key={`${t.torn}-${t.id}`}
                                                item={t}
                                                variant={isRed ? 'affected' : 'normal'}
                                                isDisplaced={isDisplaced}
                                                manualOverrides={manualOverrides}
                                                setManualOverrides={setManualOverrides}
                                                openMenuId={openMenuId}
                                                setOpenMenuId={setOpenMenuId}
                                                dividedPersonnel={dividedPersonnel}
                                                isPrivacyMode={isPrivacyMode}
                                            />
                                        );
                                    })}
                                {items.length === 0 && (
                                    <p className="text-center py-10 text-[10px] font-bold text-gray-300 dark:text-gray-700 uppercase tracking-widest italic">
                                        Cap presència en aquesta banda
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CutAnalysisPanel;
