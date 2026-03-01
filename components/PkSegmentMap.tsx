import React from 'react';
import { X, Zap, ArrowUp, ArrowDown, Milestone } from 'lucide-react';
import { PkLocationResult } from '../utils/pkUtils';
import { STATION_GEO_DATA } from '../utils/stationGeoData';

interface PkSegmentMapProps {
    result: PkLocationResult;
    onClose: () => void;
}

export const PkSegmentMap: React.FC<PkSegmentMapProps> = ({ result, onClose }) => {
    const { segment, pk, percentage, prevStation, nextStation, exactStation, speedInfo } = result;

    // Get all stations in this segment sorted by pk
    const stations = STATION_GEO_DATA
        .filter(s => s.pkSegment === segment)
        .sort((a, b) => a.pk - b.pk);

    if (stations.length === 0) return null;

    const minPk = stations[0].pk;
    const maxPk = stations[stations.length - 1].pk;
    const range = maxPk - minPk || 1;

    // Convert a PK value to a 0-100% position along the diagram
    const pkToPercent = (p: number) => ((p - minPk) / range) * 100;

    // Determine the position of our searched PK along the linear diagram
    // We know: prevStation.pk -> nextStation.pk bracket, with `percentage` within that bracket
    let markerPercent: number;
    if (exactStation) {
        markerPercent = pkToPercent(exactStation.pk);
    } else if (prevStation && nextStation) {
        markerPercent = pkToPercent(prevStation.pk) + (pkToPercent(nextStation.pk) - pkToPercent(prevStation.pk)) * percentage;
    } else if (prevStation) {
        markerPercent = pkToPercent(prevStation.pk);
    } else if (nextStation) {
        markerPercent = pkToPercent(nextStation.pk);
    } else {
        markerPercent = pkToPercent(pk);
    }

    // Segment color mapping
    const segmentColors: Record<string, string> = {
        'PC/RE': '#e63946',
        'GR/TB': '#f4a261',
        'SR/LP': '#2a9d8f',
        'LP/TR': '#457b9d',
        'LP/NA': '#6a4c93',
        'SC/PN': '#2d6a4f',
        'BT/UN': '#e9c46a',
    };
    const lineColor = segmentColors[segment] || '#4CAF50';

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
            onClick={onClose}
        >
            <div
                className="w-full sm:max-w-2xl bg-white dark:bg-[#1a1d21] rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: lineColor + '22' }}>
                            <Milestone size={20} style={{ color: lineColor }} />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Segment {segment}</p>
                            <h2 className="text-xl font-bold text-[#4D5358] dark:text-white">PK {pk.toFixed(3)}</h2>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-white/10 transition-all"
                    >
                        <X size={18} className="text-gray-500" />
                    </button>
                </div>

                {/* Linear diagram */}
                <div className="px-6 pt-8 pb-4">
                    <div className="relative">
                        {/* Station labels top row (alternating to avoid overlap) */}
                        <div className="relative h-14 mb-2">
                            {stations.map((st, i) => {
                                const leftPc = pkToPercent(st.pk);
                                const above = i % 2 === 0;
                                return (
                                    <div
                                        key={st.id}
                                        className="absolute flex flex-col items-center"
                                        style={{ left: `${leftPc}%`, transform: 'translateX(-50%)' }}
                                    >
                                        {above && (
                                            <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 whitespace-nowrap leading-tight text-center max-w-[64px] truncate">
                                                {st.name.split(' ').slice(0, 2).join('\n')}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* The track line */}
                        <div className="relative h-6 flex items-center">
                            <div className="w-full h-2 rounded-full" style={{ backgroundColor: lineColor + '33' }}>
                                <div className="h-full rounded-full" style={{ backgroundColor: lineColor, width: `${markerPercent}%`, transition: 'width 0.6s ease' }} />
                            </div>

                            {/* Station dots */}
                            {stations.map(st => {
                                const lp = pkToPercent(st.pk);
                                const isHighlighted = exactStation?.id === st.id
                                    || prevStation?.id === st.id
                                    || nextStation?.id === st.id;
                                return (
                                    <div
                                        key={st.id}
                                        className="absolute w-3 h-3 rounded-full border-2 border-white dark:border-[#1a1d21] shadow-sm"
                                        style={{
                                            left: `${lp}%`,
                                            transform: 'translateX(-50%)',
                                            backgroundColor: isHighlighted ? lineColor : '#9ca3af',
                                        }}
                                    />
                                );
                            })}

                            {/* PK Marker */}
                            <div
                                className="absolute flex flex-col items-center z-10"
                                style={{ left: `${markerPercent}%`, transform: 'translateX(-50%)', bottom: 0 }}
                            >
                                <div
                                    className="w-5 h-5 rounded-full border-4 shadow-lg animate-pulse"
                                    style={{ backgroundColor: '#fff', borderColor: lineColor }}
                                />
                            </div>
                        </div>

                        {/* Station labels bottom row */}
                        <div className="relative h-14 mt-2">
                            {stations.map((st, i) => {
                                const leftPc = pkToPercent(st.pk);
                                const below = i % 2 !== 0;
                                return (
                                    <div
                                        key={st.id}
                                        className="absolute flex flex-col items-center"
                                        style={{ left: `${leftPc}%`, transform: 'translateX(-50%)' }}
                                    >
                                        {below && (
                                            <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 whitespace-nowrap leading-tight text-center max-w-[64px] truncate">
                                                {st.name.split(' ').slice(0, 2).join(' ')}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* PK label below marker */}
                        <div
                            className="absolute text-[10px] font-bold whitespace-nowrap"
                            style={{ left: `${markerPercent}%`, transform: 'translateX(-50%)', top: '100%', marginTop: 4, color: lineColor }}
                        >
                            PK {pk.toFixed(3)}
                        </div>
                    </div>
                </div>

                {/* Context & Speed info */}
                <div className="px-6 pb-6 pt-4 space-y-4">
                    {/* Station context */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Estació anterior</span>
                            <span className="text-sm font-bold text-[#4D5358] dark:text-white">{prevStation?.name || '---'}</span>
                            {prevStation && <span className="text-[9px] text-gray-400 block">PK {prevStation.pk.toFixed(3)}</span>}
                        </div>
                        <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Estació posterior</span>
                            <span className="text-sm font-bold text-[#4D5358] dark:text-white">{nextStation?.name || '---'}</span>
                            {nextStation && <span className="text-[9px] text-gray-400 block">PK {nextStation.pk.toFixed(3)}</span>}
                        </div>
                    </div>

                    {/* Speed info */}
                    {speedInfo && (
                        <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                            <div className="flex items-center gap-2 mb-3">
                                <Zap size={14} className="text-fgc-green" />
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Velocitats</span>
                            </div>
                            <div className="grid grid-cols-4 gap-3">
                                <div>
                                    <span className="text-[9px] text-gray-400 uppercase tracking-widest block mb-1">Màx</span>
                                    <span className="text-lg font-bold text-[#4D5358] dark:text-white">{speedInfo.maxSpeed}</span>
                                    <span className="text-[9px] text-gray-400">km/h</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-1 mb-1"><ArrowUp size={10} className="text-blue-500" /><span className="text-[9px] text-gray-400 uppercase">Asc</span></div>
                                    <span className="text-lg font-bold text-[#4D5358] dark:text-white">{speedInfo.ascNormal}</span>
                                    <span className="text-[9px] text-gray-400">km/h</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-1 mb-1"><ArrowDown size={10} className="text-orange-500" /><span className="text-[9px] text-gray-400 uppercase">Des</span></div>
                                    <span className="text-lg font-bold text-[#4D5358] dark:text-white">{speedInfo.descNormal}</span>
                                    <span className="text-[9px] text-gray-400">km/h</span>
                                </div>
                                <div>
                                    <span className="text-[9px] text-gray-400 uppercase tracking-widest block mb-1">CV A/D</span>
                                    <span className="text-base font-bold text-[#4D5358] dark:text-white">{speedInfo.ascContravia}<span className="text-[9px] text-gray-400 font-normal">/{speedInfo.descContravia}</span></span>
                                </div>
                            </div>
                            {speedInfo.notes.length > 0 && (
                                <div className="mt-3 space-y-1">
                                    {speedInfo.notes.map((note, i) => (
                                        <p key={i} className="text-[10px] italic text-amber-600 dark:text-amber-400">⚠ {note.label}{note.text ? `: ${note.text}` : ''}</p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
