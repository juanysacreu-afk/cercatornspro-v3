
import React, { useState } from 'react';
import { LayoutGrid, Train, Coffee, AlertTriangle, X, Settings, Wrench } from 'lucide-react';
import { getFgcMinutes, formatFgcTime } from '../utils/time';

interface ShiftTimelineProps {
    turn: any;
    nowMin: number;
    trainStatuses: Record<string, any>;
    getStatusColor: (codi: string) => string;
    getLiniaColor: (linia: string) => string;
    openUnitMenu: (circ: any, cycleId: string) => void;
}

export const ShiftTimeline: React.FC<ShiftTimelineProps> = ({
    turn,
    nowMin,
    trainStatuses,
    getStatusColor,
    getLiniaColor,
    openUnitMenu
}) => {
    const [selectedSeg, setSelectedSeg] = useState<any>(null);
    const startMin = getFgcMinutes(turn.inici_torn);
    const endMin = getFgcMinutes(turn.final_torn);
    const totalDuration = endMin - startMin;
    if (totalDuration <= 0) return null;

    const segments: any[] = [];
    let currentPos = startMin;
    const circulations = turn.fullCirculations || [];

    circulations.forEach((circ: any, index: number) => {
        const circStart = getFgcMinutes(circ.sortida);
        const circEnd = getFgcMinutes(circ.arribada);
        if (circStart > currentPos) {
            const locationCode = index === 0 ? (circ.machinistInici || turn.dependencia || '') : (circulations[index - 1].machinistFinal || '');
            segments.push({ start: currentPos, end: circStart, type: 'gap', codi: locationCode || 'DESCANS', color: getStatusColor(locationCode) });
        }
        segments.push({ start: circStart, end: circEnd, type: 'circ', codi: circ.codi, realCodi: circ.realCodi, color: 'bg-gray-300 dark:bg-gray-700', linia: circ.linia, train: circ.train, cicle: circ.cicle });
        currentPos = Math.max(currentPos, circEnd);
    });

    if (currentPos < endMin) {
        const lastLoc = circulations.length > 0 ? circulations[circulations.length - 1].machinistFinal : turn.dependencia;
        segments.push({ start: currentPos, end: endMin, type: 'gap', codi: lastLoc || 'FINAL', color: getStatusColor(lastLoc) });
    }

    const showMarker = nowMin >= startMin && nowMin <= endMin;
    const progressPct = Math.max(0, Math.min(100, ((nowMin - startMin) / totalDuration) * 100));

    return (
        <div className="space-y-4 mb-10 p-2 relative">
            <div className="flex items-center justify-between relative h-8">
                <div className="flex items-center gap-3"><LayoutGrid size={16} className="text-gray-400 dark:text-gray-500" /><h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Estades a dependencies</h4></div>
                <div className="absolute left-1/2 -translate-x-1/2">{showMarker && (<div className="text-[10px] font-black text-red-500 uppercase tracking-widest bg-red-50 dark:bg-red-950/30 px-4 py-1.5 rounded-full border border-red-100 dark:border-red-900 flex items-center gap-1.5 shadow-sm"><span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />Progrés: {Math.round(progressPct)}%</div>)}</div>
            </div>
            <div className="relative">
                <div className="relative h-16 w-full bg-gray-50/50 dark:bg-black/20 rounded-[28px] flex items-center px-1 shadow-inner border border-gray-100/50 dark:border-white/5">
                    {segments.map((seg, i) => {
                        const widthPct = ((seg.end - seg.start) / totalDuration) * 100;
                        const isSelected = selectedSeg?.start === seg.start && selectedSeg?.end === seg.end;
                        const isCurrent = nowMin >= seg.start && nowMin < seg.end;
                        const isGap = seg.type === 'gap';
                        const segmentLabel = `${seg.codi} (${formatFgcTime(seg.start)} - ${formatFgcTime(seg.end)})`;
                        const status = seg.train ? trainStatuses[seg.train] : null;
                        const isBroken = status?.is_broken;

                        return (
                            <button
                                key={i}
                                onClick={() => setSelectedSeg(seg)}
                                title={segmentLabel}
                                style={{ width: `${widthPct}%` }}
                                className={`h-8 relative transition-all mx-0.5 outline-none flex items-center justify-center group/seg ${isBroken ? 'bg-red-600' : seg.color} ${isGap ? 'rounded-xl' : 'rounded-none'} ${isSelected ? 'brightness-110 scale-y-110 z-10 shadow-lg ring-2 ring-white/50 dark:ring-white/20' : 'hover:brightness-110 hover:z-20'} ${isCurrent ? 'ring-2 ring-red-500 shadow-lg' : ''}`}
                            >
                                {widthPct > 5 && (<span className={`text-[9px] font-black pointer-events-none truncate px-1 ${seg.type === 'circ' ? (isBroken ? 'text-white' : 'text-gray-600 dark:text-gray-300') : 'text-white'}`}>{seg.codi === 'Viatger' ? seg.realCodi : seg.codi}</span>)}
                                {isCurrent && (
                                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-600 rounded-full border border-white dark:border-gray-900 shadow-sm z-40" />
                                )}
                                {isBroken && <AlertTriangle size={8} className="absolute -bottom-2 text-red-600 animate-bounce" />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {selectedSeg && (
                <div className={`mt-4 p-5 rounded-2xl border animate-in fade-in slide-in-from-top-2 duration-300 flex items-center justify-between shadow-xl ${selectedSeg.type === 'circ' && selectedSeg.train && trainStatuses[selectedSeg.train]?.is_broken ? 'bg-red-600 text-white' : (selectedSeg.color + ' ' + (selectedSeg.type === 'circ' ? 'text-black dark:text-gray-200 border-gray-300 dark:border-gray-700 shadow-gray-200 dark:shadow-black' : 'text-white border-white/20'))}`}>
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner border ${selectedSeg.type === 'circ' ? `${getLiniaColor(selectedSeg.linia)} border-white/20` : 'bg-white/20 border-white/20 backdrop-blur-sm'}`}>
                            {selectedSeg.type === 'circ' ? (
                                <Train size={24} className="text-white" />
                            ) : (
                                <Coffee size={24} className="text-white" />
                            )}
                        </div>
                        <div>
                            <p className={`text-[10px] font-black uppercase tracking-widest ${selectedSeg.type === 'circ' ? (selectedSeg.train && trainStatuses[selectedSeg.train]?.is_broken ? 'text-white/60' : 'text-gray-500 dark:text-gray-400') : 'text-white/60'}`}>{selectedSeg.type === 'circ' ? 'CIRCULACIÓ' : 'DESCANS / ESTADA'}</p>
                            <div className="flex items-center gap-2">
                                <p className="text-xl font-black flex items-center gap-2">
                                    {selectedSeg.codi === 'Viatger' ? `Viatger (${selectedSeg.realCodi})` : selectedSeg.codi}
                                </p>
                                {selectedSeg.type === 'circ' && selectedSeg.cicle && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); openUnitMenu(selectedSeg, selectedSeg.cicle); }}
                                        className="bg-white/10 hover:bg-white/20 p-1.5 rounded-lg transition-colors"
                                        title="Gestionar Unitat"
                                    >
                                        <Settings size={14} className="text-white" />
                                    </button>
                                )}
                            </div>
                            {selectedSeg.type === 'circ' && selectedSeg.train && trainStatuses[selectedSeg.train]?.is_broken && (
                                <span className="bg-white text-red-600 px-2 py-0.5 rounded-lg text-[10px] flex items-center gap-1 border border-red-100 shadow-sm animate-pulse mt-1">
                                    <Wrench size={10} /> AVARIA
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                        <p className={`text-[10px] font-black uppercase tracking-widest ${selectedSeg.type === 'circ' ? (selectedSeg.train && trainStatuses[selectedSeg.train]?.is_broken ? 'text-white/60' : 'text-gray-500 dark:text-gray-400') : 'text-white/60'}`}>DURADA I HORARI</p>
                        <p className="text-xl font-black">{selectedSeg.end - selectedSeg.start} min</p>
                        <p className={`text-[10px] font-bold ${selectedSeg.type === 'circ' ? (selectedSeg.train && trainStatuses[selectedSeg.train]?.is_broken ? 'text-white/80' : 'text-gray-400 dark:text-gray-500') : 'text-white/80'}`}>{formatFgcTime(selectedSeg.start)} — {formatFgcTime(selectedSeg.end)}</p>
                    </div>
                    <button onClick={() => setSelectedSeg(null)} className={`ml-4 p-2 rounded-full transition-colors ${selectedSeg.type === 'circ' && !(selectedSeg.train && trainStatuses[selectedSeg.train]?.is_broken) ? 'hover:bg-gray-200 dark:hover:bg-white/10 text-gray-400 dark:text-gray-500' : 'hover:bg-white/10 text-white/80'}`}>
                        <X size={18} />
                    </button>
                </div>
            )}
        </div>
    );
};
