import React, { useState } from 'react';
import { ZoomIn, ZoomOut, Move, Activity, RotateCcw } from 'lucide-react';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import {
    MASTER_STATION_ORDER,
    LINIA_STATIONS,
    getLiniaColorHex,
    mainLiniaForFilter,
    getFgcMinutes,
    formatFgcTime,
    LINE_COLORS,
} from '../utils/stations';
import GlassPanel from './common/GlassPanel';
import { feedback } from '../utils/feedback';

interface MallaVisualizerProps {
    circs: any[];
}

const MallaVisualizer: React.FC<MallaVisualizerProps> = ({ circs }) => {
    const [lineFilter, setLineFilter] = useState('Tots');

    const filtered = circs.filter(c => {
        if (lineFilter === 'Tots') return true;
        return mainLiniaForFilter(c.linia) === lineFilter;
    });

    // Build station set: include ALL stations from each line that has visible circulations
    const foundStations = new Set<string>();
    const visibleLines = new Set<string>();
    filtered.forEach(c => {
        const ml = mainLiniaForFilter(c.linia);
        visibleLines.add(ml);
        if (c.originId && MASTER_STATION_ORDER.includes(c.originId)) foundStations.add(c.originId);
        if (c.destId && MASTER_STATION_ORDER.includes(c.destId)) foundStations.add(c.destId);
    });
    visibleLines.forEach(line => {
        const stations = LINIA_STATIONS[line];
        if (stations) stations.forEach(s => foundStations.add(s));
    });

    const sortedStations = MASTER_STATION_ORDER.filter(s => foundStations.has(s)).reverse();
    if (sortedStations.length === 0) return (
        <GlassPanel className="flex items-center justify-center min-h-[400px]">
            <div className="text-gray-400 font-bold text-sm uppercase flex items-center gap-3">
                <Activity className="animate-pulse" />
                No hi ha circulacions disponibles per mostrar.
            </div>
        </GlassPanel>
    );

    const timeScale = 4;
    const startTime = 240; // 4:00 AM
    const hoursToShow = 22;
    const width = hoursToShow * 60 * timeScale;
    const height = Math.max(600, sortedStations.length * 50);

    // Group by unit/torn
    const groups: Record<string, any[]> = {};
    filtered.forEach(c => {
        const oid = c.originId;
        const did = c.destId;
        if (!oid || !did || !foundStations.has(oid) || !foundStations.has(did)) return;
        if (oid === did) return;
        const y1 = sortedStations.indexOf(oid) * 50;
        const y2 = sortedStations.indexOf(did) * 50;
        const uId = c.train && c.train !== '---' ? c.train : `TORN-${c.torn}`;
        if (!groups[uId]) groups[uId] = [];
        groups[uId].push({ ...c, y1, y2 });
    });

    const terminalOvershoots: Record<string, number> = { 'PC': 40, 'NA': -40, 'PN': -40, 'TB': -40, 'RE': -40, 'SR': 40 };

    return (
        <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-700">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-white/5 p-1.5 rounded-2xl border border-gray-200 dark:border-white/10 overflow-x-auto no-scrollbar">
                    {['Tots', 'S1', 'S2', 'L6', 'L7', 'L12'].map(ln => (
                        <button
                            key={ln}
                            onClick={() => {
                                feedback.click();
                                setLineFilter(ln);
                            }}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${lineFilter === ln ? 'bg-white dark:bg-gray-700 text-fgc-grey dark:text-white shadow-md scale-105' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                        >
                            {ln}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest shrink-0">
                    <span className="flex items-center gap-1.5 bg-white/50 dark:bg-white/5 px-3 py-1.5 rounded-full border border-gray-100 dark:border-white/5">{filtered.length} circulacions</span>
                    <span className="flex items-center gap-1.5 bg-white/50 dark:bg-white/5 px-3 py-1.5 rounded-full border border-gray-100 dark:border-white/5">{Object.keys(groups).length} unitats</span>
                </div>
            </div>

            <div className="flex-1 bg-white dark:bg-gray-950 rounded-[40px] border border-gray-100 dark:border-white/5 overflow-hidden shadow-2xl relative">
                <TransformWrapper initialScale={0.5} minScale={0.1} maxScale={4} centerOnInit={false}>
                    {({ zoomIn, zoomOut, resetTransform }) => (
                        <>
                            <div className="absolute top-6 right-6 z-10 flex flex-col gap-3">
                                <button onClick={() => zoomIn()} className="p-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-white/5 text-fgc-grey dark:text-white hover:scale-110 active:scale-90 transition-all"><ZoomIn size={18} /></button>
                                <button onClick={() => zoomOut()} className="p-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-white/5 text-fgc-grey dark:text-white hover:scale-110 active:scale-90 transition-all"><ZoomOut size={18} /></button>
                                <button onClick={() => resetTransform()} className="p-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-white/5 text-fgc-grey dark:text-white hover:scale-110 active:scale-90 transition-all"><RotateCcw size={18} /></button>
                            </div>
                            <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                                <div className="relative p-24 select-none">
                                    <svg width={width} height={height} className="overflow-visible">
                                        {/* Time grid */}
                                        {Array.from({ length: hoursToShow * 4 + 1 }).map((_, i) => {
                                            const m = i * 15;
                                            const x = m * timeScale;
                                            const isHour = i % 4 === 0;
                                            return (
                                                <g key={i}>
                                                    <line x1={x} y1={-20} x2={x} y2={height + 20} stroke="currentColor" strokeDasharray={isHour ? "" : "2,2"} className={isHour ? 'text-gray-200 dark:text-white/10' : 'text-gray-100 dark:text-white/5'} />
                                                    {isHour && (
                                                        <text x={x} y={-35} className="text-[11px] font-black fill-gray-400 dark:fill-gray-500 uppercase tracking-tighter" textAnchor="middle">
                                                            {formatFgcTime(startTime + m)}
                                                        </text>
                                                    )}
                                                </g>
                                            );
                                        })}

                                        {/* Station axes */}
                                        {sortedStations.map((st, i) => {
                                            const y = i * 50;
                                            return (
                                                <g key={st}>
                                                    <line x1={-20} y1={y} x2={width + 20} y2={y} stroke="currentColor" className="text-gray-100 dark:text-white/5" />
                                                    <text x={-40} y={y + 4} className="text-[12px] font-black fill-fgc-grey dark:fill-gray-400 uppercase tracking-tight" textAnchor="end">{st}</text>
                                                </g>
                                            );
                                        })}

                                        {/* Circulation lines */}
                                        {Object.entries(groups).map(([uId, trips]) => {
                                            const sorted = trips.sort((a, b) => (getFgcMinutes(a.sortida) || 0) - (getFgcMinutes(b.sortida) || 0));
                                            return (
                                                <g key={uId}>
                                                    {/* Transitions/Loops between consecutive trips */}
                                                    {sorted.map((c, i) => {
                                                        const next = sorted[i + 1];
                                                        if (!next) return null;
                                                        const endM = getFgcMinutes(c.arribada);
                                                        const nextStartM = getFgcMinutes(next.sortida);
                                                        if (endM === null || nextStartM === null) return null;
                                                        if (nextStartM - endM > 60 || nextStartM < endM) return null;

                                                        const x2 = (endM - startTime) * timeScale;
                                                        const nx1 = (nextStartM - startTime) * timeScale;
                                                        const color = getLiniaColorHex(c.linia);
                                                        const ny1 = next.y1;

                                                        const yDir = terminalOvershoots[c.destId];
                                                        if (yDir !== undefined && c.destId === next.originId) {
                                                            return (
                                                                <path
                                                                    key={`loop-${uId}-${i}`}
                                                                    d={`M ${x2} ${c.y2} C ${x2 + 15} ${c.y2 + yDir}, ${nx1 - 15} ${ny1 + yDir}, ${nx1} ${ny1}`}
                                                                    fill="none" stroke={color} strokeWidth={2.5} strokeDasharray="6,4" className="opacity-40"
                                                                />
                                                            );
                                                        } else {
                                                            return (
                                                                <path
                                                                    key={`trans-${uId}-${i}`}
                                                                    d={`M ${x2} ${c.y2} C ${x2 + (nx1 - x2) / 2} ${c.y2}, ${x2 + (nx1 - x2) / 2} ${ny1}, ${nx1} ${ny1}`}
                                                                    fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="5,3" className="opacity-25"
                                                                />
                                                            );
                                                        }
                                                    })}

                                                    {/* Main circulation lines */}
                                                    {sorted.map((c, i) => {
                                                        const sM = getFgcMinutes(c.sortida);
                                                        const eM = getFgcMinutes(c.arribada);
                                                        if (sM === null || eM === null) return null;
                                                        const x1 = (sM - startTime) * timeScale;
                                                        const x2 = (eM - startTime) * timeScale;
                                                        const color = getLiniaColorHex(c.linia);
                                                        const isManiobra = (c.linia || '').toUpperCase().startsWith('M') && c.linia !== 'ML6' && c.linia !== 'ML7';

                                                        return (
                                                            <g key={`trip-${uId}-${i}`} className="group cursor-pointer">
                                                                <line
                                                                    x1={x1} y1={c.y1} x2={x2} y2={c.y2}
                                                                    stroke={color}
                                                                    strokeWidth={isManiobra ? 3 : 5}
                                                                    strokeDasharray={isManiobra ? "6,3" : ""}
                                                                    className="transition-all duration-300 group-hover:stroke-fgc-green group-hover:[stroke-width:10px] drop-shadow-md"
                                                                />
                                                                <circle cx={x1} cy={c.y1} r={isManiobra ? 3.5 : 5} fill={color} className="transition-all duration-300 group-hover:r-[8px] group-hover:fill-fgc-green shadow-sm" />
                                                                <circle cx={x2} cy={c.y2} r={isManiobra ? 3.5 : 5} fill={color} className="transition-all duration-300 group-hover:r-[8px] group-hover:fill-fgc-green shadow-sm" />

                                                                {/* Hover tooltip */}
                                                                <g className="opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50 translate-y-2 group-hover:translate-y-0">
                                                                    <rect x={Math.min(x1, x2)} y={Math.min(c.y1, c.y2) - 85} width={220} height={70} rx={18} className="fill-fgc-grey/95 dark:fill-black/95 shadow-2xl backdrop-blur-xl border border-white/10" />
                                                                    <text x={Math.min(x1, x2) + 16} y={Math.min(c.y1, c.y2) - 62} className="fill-white text-[12px] font-black uppercase tracking-tight">{c.id} — {c.torn}</text>
                                                                    <text x={Math.min(x1, x2) + 16} y={Math.min(c.y1, c.y2) - 44} className="fill-white/70 text-[10px] font-bold uppercase tracking-widest">{c.sortida} → {c.arribada}</text>
                                                                    <text x={Math.min(x1, x2) + 16} y={Math.min(c.y1, c.y2) - 26} className="text-[10px] font-black uppercase tracking-widest" fill={color}>{c.linia} · {c.originId} → {c.destId}</text>
                                                                </g>
                                                            </g>
                                                        );
                                                    })}
                                                </g>
                                            );
                                        })}
                                    </svg>
                                </div>
                            </TransformComponent>
                        </>
                    )}
                </TransformWrapper>
            </div>
            {/* Legend */}
            <GlassPanel className="flex flex-wrap items-center gap-x-8 gap-y-4 px-8 py-6">
                {Object.entries(LINE_COLORS).filter(([k]) => k !== 'M').map(([key, config]) => (
                    <div key={key} className="flex items-center gap-3 group cursor-default">
                        <div className="w-4 h-4 rounded-full shadow-lg shadow-black/5" style={{ backgroundColor: config.hex }} />
                        <span className="text-[11px] font-black uppercase text-gray-500 dark:text-gray-400 tracking-widest group-hover:text-fgc-grey dark:group-hover:text-white transition-colors">
                            {config.label}
                        </span>
                    </div>
                ))}
                <div className="flex items-center gap-3 group cursor-default">
                    <div className="w-8 h-1 rounded-full border-t-2 border-dashed border-gray-400" />
                    <span className="text-[11px] font-black uppercase text-gray-500 dark:text-gray-400 tracking-widest group-hover:text-fgc-grey dark:group-hover:text-white transition-colors">
                        {LINE_COLORS['M'].label}
                    </span>
                </div>
                <div className="flex-1 min-w-[40px]" />
                <div className="flex items-center gap-6 text-[10px] font-black text-gray-300 dark:text-gray-600 uppercase tracking-[0.15em] italic">
                    <div className="flex items-center gap-2 hover:text-gray-400 transition-colors"><Move size={14} /> Arrossega</div>
                    <div className="flex items-center gap-2 hover:text-gray-400 transition-colors"><ZoomIn size={14} /> Zoom</div>
                    <div className="flex items-center gap-2 hover:text-gray-400 transition-colors"><Activity size={14} /> Detalls</div>
                </div>
            </GlassPanel>
        </div>
    );
};

export default MallaVisualizer;
