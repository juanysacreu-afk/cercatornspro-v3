import React, { useState } from 'react';
import { ZoomIn, ZoomOut, Move, Activity } from 'lucide-react';
import { RotateCcw } from 'lucide-react';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import {
    MASTER_STATION_ORDER,
    LINIA_STATIONS,
    getLiniaColorHex,
    mainLiniaForFilter,
    getFgcMinutes,
    formatFgcTime,
} from '../utils/stations';

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
    if (sortedStations.length === 0) return <div className="flex items-center justify-center h-full text-gray-400 font-bold text-sm uppercase">No hi ha circulacions disponibles per mostrar.</div>;

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
        <div className="h-full flex flex-col space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 bg-gray-100 dark:bg-white/5 p-1 rounded-2xl border border-gray-200 dark:border-white/10">
                    {['Tots', 'S1', 'S2', 'L6', 'L7', 'L12'].map(ln => (
                        <button key={ln} onClick={() => setLineFilter(ln)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${lineFilter === ln ? 'bg-white dark:bg-gray-700 text-fgc-grey dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                            {ln}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    <span>{filtered.length} circulacions</span>
                    <span>{Object.keys(groups).length} unitats</span>
                </div>
            </div>
            <div className="flex-1 bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-white/5 overflow-hidden shadow-inner relative">
                <TransformWrapper initialScale={0.5} minScale={0.1} maxScale={4} centerOnInit={false}>
                    {({ zoomIn, zoomOut, resetTransform }) => (
                        <>
                            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                                <button onClick={() => zoomIn()} className="p-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-full shadow border border-black/5 text-fgc-grey dark:text-white"><ZoomIn size={16} /></button>
                                <button onClick={() => zoomOut()} className="p-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-full shadow border border-black/5 text-fgc-grey dark:text-white"><ZoomOut size={16} /></button>
                                <button onClick={() => resetTransform()} className="p-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-full shadow border border-black/5 text-fgc-grey dark:text-white"><RotateCcw size={16} /></button>
                            </div>
                            <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                                <div className="relative p-20 select-none">
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
                                                        <text x={x} y={-30} className="text-[10px] font-black fill-gray-400 dark:fill-gray-500 uppercase" textAnchor="middle">
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
                                                    <text x={-30} y={y + 4} className="text-[11px] font-black fill-fgc-grey dark:fill-gray-400 uppercase" textAnchor="end">{st}</text>
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
                                                                    fill="none" stroke={color} strokeWidth={2} strokeDasharray="5,3" className="opacity-50"
                                                                />
                                                            );
                                                        } else {
                                                            return (
                                                                <path
                                                                    key={`trans-${uId}-${i}`}
                                                                    d={`M ${x2} ${c.y2} C ${x2 + (nx1 - x2) / 2} ${c.y2}, ${x2 + (nx1 - x2) / 2} ${ny1}, ${nx1} ${ny1}`}
                                                                    fill="none" stroke={color} strokeWidth={1} strokeDasharray="4,2" className="opacity-30"
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
                                                                    strokeWidth={isManiobra ? 2 : 4}
                                                                    strokeDasharray={isManiobra ? "4,2" : ""}
                                                                    className="transition-all group-hover:stroke-blue-500 group-hover:[stroke-width:8px] drop-shadow-sm"
                                                                />
                                                                <circle cx={x1} cy={c.y1} r={4} fill={color} className="transition-all group-hover:r-6" />
                                                                <circle cx={x2} cy={c.y2} r={4} fill={color} className="transition-all group-hover:r-6" />

                                                                {/* Hover tooltip */}
                                                                <g className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                                    <rect x={Math.min(x1, x2)} y={Math.min(c.y1, c.y2) - 70} width={200} height={60} rx={14} className="fill-fgc-grey/95 dark:fill-black/95 shadow-2xl" />
                                                                    <text x={Math.min(x1, x2) + 14} y={Math.min(c.y1, c.y2) - 50} className="fill-white text-[11px] font-black uppercase">{c.id} — {c.torn}</text>
                                                                    <text x={Math.min(x1, x2) + 14} y={Math.min(c.y1, c.y2) - 35} className="fill-white/70 text-[9px] font-bold uppercase">{c.sortida} → {c.arribada}</text>
                                                                    <text x={Math.min(x1, x2) + 14} y={Math.min(c.y1, c.y2) - 20} className="text-[9px] font-black uppercase" fill={color}>{c.linia} · {c.originId} → {c.destId}</text>
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
            <div className="flex flex-wrap items-center gap-6 px-4 bg-gray-50 dark:bg-black/20 p-4 rounded-[24px] border border-gray-100 dark:border-white/5">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: '#f97316' }} /> <span className="text-[10px] font-black uppercase text-gray-500">S1 Terrassa</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: '#22c55e' }} /> <span className="text-[10px] font-black uppercase text-gray-500">S2 Sabadell</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: '#9333ea' }} /> <span className="text-[10px] font-black uppercase text-gray-500">L6</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: '#8B4513' }} /> <span className="text-[10px] font-black uppercase text-gray-500">L7</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: '#d8b4fe' }} /> <span className="text-[10px] font-black uppercase text-gray-500">L12</span></div>
                <div className="flex items-center gap-2"><div className="w-8 h-0 border-t-2 border-dashed border-gray-400" /> <span className="text-[10px] font-black uppercase text-gray-500">Maniobres</span></div>
                <div className="flex-1 min-w-[100px]" />
                <div className="flex items-center gap-4 text-[10px] font-black text-gray-400 uppercase tracking-widest italic">
                    <div className="flex items-center gap-1"><Move size={12} /> Arrossega</div>
                    <div className="flex items-center gap-1"><ZoomIn size={12} /> Zoom</div>
                    <div className="flex items-center gap-1"><Activity size={12} /> Hover per detalls</div>
                </div>
            </div>
        </div>
    );
};

export default MallaVisualizer;
