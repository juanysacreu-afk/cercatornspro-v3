import React from 'react';
import { TrendingUp, ZoomIn, ZoomOut, RotateCcw, Move, Activity } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { resolveStationId, mainLiniaForFilter, LINE_COLORS } from '../../../utils/stations';

interface AlternativeServiceGraphProps {
    generatedCircs: any[];
    lineFilters: string[];
    toggleLineFilter: (ln: string) => void;
    displayMin: number;
    islandStations: Set<string>;
    setViewMode: (mode: any) => void;
}

const AlternativeServiceGraph: React.FC<AlternativeServiceGraphProps> = ({
    generatedCircs,
    lineFilters,
    toggleLineFilter,
    displayMin,
    islandStations,
    setViewMode
}) => {
    const masterOrder = [
        'PC', 'PR', 'GR', 'PM', 'PD', 'EP', 'TB',
        'SG', 'MN', 'BN', 'TT', 'SR', 'RE',
        'PF', 'VL', 'LP', 'LF', 'VD', 'SC',
        'MS', 'HG', 'RB', 'FN', 'TR', 'VP', 'EN', 'NA',
        'VO', 'SJ', 'BT', 'UN', 'SQ', 'CF', 'PJ', 'CT', 'NO', 'PN'
    ];

    const liniaStationsMap: Record<string, string[]> = {
        'S1': ['PC', 'PR', 'GR', 'SG', 'MN', 'BN', 'TT', 'SR', 'PF', 'VL', 'LP', 'LF', 'VD', 'SC', 'MS', 'HG', 'RB', 'FN', 'TR', 'VP', 'EN', 'NA'],
        'S2': ['PC', 'PR', 'GR', 'SG', 'MN', 'BN', 'TT', 'SR', 'PF', 'VL', 'LP', 'LF', 'VD', 'SC', 'VO', 'SJ', 'BT', 'UN', 'SQ', 'CF', 'PJ', 'CT', 'NO', 'PN'],
        'L6': ['PC', 'PR', 'GR', 'SG', 'MN', 'BN', 'TT', 'SR'],
        'L7': ['PC', 'PR', 'GR', 'PM', 'PD', 'EP', 'TB'],
        'L12': ['SR', 'RE'],
    };

    const colorMap = (linia: string) => {
        const l = (linia || '').toUpperCase().trim();
        if (l.startsWith('F') || l === 'ES2') return '#22c55e';
        if (l === 'L7' || l === 'ML7' || l === '300') return '#8B4513';
        if (l === 'L6' || l === 'L66' || l === 'ML6' || l === '100') return '#9333ea';
        if (l === 'L12') return '#d8b4fe';
        if (l === 'S1' || l === 'MS1' || l === '400') return '#f97316';
        if (l === 'S2' || l === 'MS2' || l === '500') return '#22c55e';
        if (l.startsWith('M')) return '#6b7280';
        return '#4D5358';
    };

    const filteredCircs = generatedCircs.filter(c => lineFilters.includes('Tots') || lineFilters.includes(mainLiniaForFilter(c.linia)));

    const foundStations = new Set<string>();
    const visibleLines = new Set<string>();
    filteredCircs.forEach(c => {
        const ml = mainLiniaForFilter(c.linia);
        visibleLines.add(ml);
        const routeParts = c.route.split(' → ');
        if (routeParts.length >= 2) {
            const sOrigin = resolveStationId(routeParts[0].trim(), c.linia);
            const sDest = resolveStationId(routeParts[1].trim(), c.linia);
            if (masterOrder.includes(sOrigin)) foundStations.add(sOrigin);
            if (masterOrder.includes(sDest)) foundStations.add(sDest);
        }
    });

    visibleLines.forEach(line => {
        const stations = liniaStationsMap[line];
        if (stations) stations.forEach(s => foundStations.add(s));
    });

    const sortedStations = masterOrder.filter(s => foundStations.has(s)).reverse();

    if (sortedStations.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-gray-400 font-bold text-sm uppercase">
                No hi ha circulacions disponibles per mostrar.
            </div>
        );
    }

    const timeScale = 4;
    const startTime = displayMin;
    const hoursToShow = Math.min(22, Math.ceil((24 * 60 + 240 - displayMin) / 60));
    const width = hoursToShow * 60 * timeScale;
    const height = Math.max(600, sortedStations.length * 50);

    const getFgcMin = (t: string) => {
        if (!t || !t.includes(':')) return null;
        const p = t.split(':');
        const h = parseInt(p[0]), m = parseInt(p[1]);
        if (isNaN(h) || isNaN(m)) return null;
        let total = h * 60 + m;
        if (h < 4) total += 24 * 60;
        return total;
    };

    const formatTime = (totalMins: number) => {
        const totalSecs = Math.round(totalMins * 60);
        const h = Math.floor(totalSecs / 3600) % 24;
        const m = Math.floor((totalSecs % 3600) / 60);
        const s = totalSecs % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const groups: Record<string, any[]> = {};
    filteredCircs.forEach((c, idx) => {
        const routeParts = c.route.split(' → ');
        if (routeParts.length < 2) return;
        const sOrigin = resolveStationId(routeParts[0].trim(), c.linia);
        const sDest = resolveStationId(routeParts[1].trim(), c.linia);
        const y1Index = sortedStations.indexOf(sOrigin);
        const y2Index = sortedStations.indexOf(sDest);
        if (y1Index === -1 || y2Index === -1) return;
        if (y1Index === y2Index) return;

        const uId = c.train && c.train !== 'TREN GRÀFIC' ? c.train : `GRAFIC-${c.torn || idx}`;
        if (!groups[uId]) groups[uId] = [];
        groups[uId].push({ ...c, originId: sOrigin, destId: sDest, y1: y1Index * 50, y2: y2Index * 50 });
    });

    return (
        <div className="space-y-4 animate-in slide-in-from-right duration-500 overflow-hidden flex flex-col" style={{ minHeight: '700px' }}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 px-2">
                    <TrendingUp size={16} className="text-orange-500" />
                    <h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Malla Ferroviària d'Emergència</h4>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        <span>{filteredCircs.length} circulacions</span>
                        <span>{Object.keys(groups).length} unitats</span>
                    </div>
                    <div className="flex items-center bg-gray-100 dark:bg-white/5 p-1 rounded-2xl border border-gray-200 dark:border-white/10">
                        {['Tots', 'S1', 'S2', 'L6', 'L7', 'L12'].map(ln => (
                            <button
                                key={ln}
                                onClick={() => toggleLineFilter(ln)}
                                className={`px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase transition-all ${lineFilters.includes(ln)
                                    ? 'bg-white dark:bg-gray-700 text-[#4D5358] dark:text-white shadow-sm'
                                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                                    }`}
                            >
                                {ln}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => setViewMode('RESOURCES')} className="text-[10px] font-bold text-blue-500 hover:underline ml-4">
                        ← Tornar a recursos
                    </button>
                </div>
            </div>

            <div className="flex-1 bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-white/5 overflow-hidden shadow-inner relative" style={{ minHeight: '550px' }}>
                <TransformWrapper initialScale={0.8} minScale={0.1} maxScale={4} centerOnInit={true}>
                    {({ zoomIn, zoomOut, resetTransform }) => (
                        <>
                            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                                <button onClick={() => zoomIn()} className="p-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-full shadow border border-black/5 text-[#4D5358] dark:text-white"><ZoomIn size={16} /></button>
                                <button onClick={() => zoomOut()} className="p-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-full shadow border border-black/5 text-[#4D5358] dark:text-white"><ZoomOut size={16} /></button>
                                <button onClick={() => resetTransform()} className="p-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-full shadow border border-black/5 text-[#4D5358] dark:text-white"><RotateCcw size={16} /></button>
                            </div>
                            <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                                <div className="relative p-8 select-none">
                                    <svg width={width} height={height} className="overflow-visible">
                                        {/* Time grid */}
                                        {Array.from({ length: Math.floor(hoursToShow * 4) + 1 }).map((_, i) => {
                                            const m = i * 15;
                                            const x = m * timeScale;
                                            const isHour = i % 4 === 0;
                                            return (
                                                <g key={i}>
                                                    <line x1={x} y1={-20} x2={x} y2={height + 20} stroke="currentColor" strokeDasharray={isHour ? "" : "2,2"} className={isHour ? 'text-gray-200 dark:text-white/10' : 'text-gray-100 dark:text-white/5'} />
                                                    {isHour && (
                                                        <text x={x} y={-30} className="text-[10px] font-bold fill-gray-400 dark:fill-gray-500 uppercase" textAnchor="middle">
                                                            {formatTime(startTime + m)}
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
                                                    <text x={-30} y={y + 4} className="text-[11px] font-bold fill-gray-400 dark:fill-gray-400 uppercase" textAnchor="end">{st}</text>
                                                </g>
                                            );
                                        })}

                                        {/* Circulation lines */}
                                        {Object.entries(groups).map(([uId, trips]) => {
                                            const sorted = trips.sort((a, b) => (getFgcMin(a.sortida) || 0) - (getFgcMin(b.sortida) || 0));
                                            return (
                                                <g key={uId}>
                                                    {sorted.map((c, i) => {
                                                        const next = sorted[i + 1];
                                                        if (!next) return null;
                                                        const endM = getFgcMin(c.arribada);
                                                        const nextStartM = getFgcMin(next.sortida);
                                                        if (endM === null || nextStartM === null) return null;
                                                        if (nextStartM - endM > 60 || nextStartM < endM) return null;

                                                        const x2 = (endM - startTime) * timeScale;
                                                        const nx1 = (nextStartM - startTime) * timeScale;
                                                        const color = colorMap(c.linia);
                                                        const ny1 = next.y1;
                                                        const yDir = c.y2 > c.y1 ? 40 : -40;

                                                        if (c.destId === next.originId) {
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

                                                    {sorted.map((c, i) => {
                                                        const sM = getFgcMin(c.sortida);
                                                        const eM = getFgcMin(c.arribada);
                                                        if (sM === null || eM === null) return null;
                                                        const x1 = (sM - startTime) * timeScale;
                                                        const x2 = (eM - startTime) * timeScale;
                                                        const color = colorMap(c.linia);
                                                        const isManiobra = (c.linia || '').toUpperCase().startsWith('M') && c.linia !== 'ML6' && c.linia !== 'ML7';
                                                        const isSenseMaquinista = c.torn === '---';

                                                        return (
                                                            <g key={`trip-${uId}-${i}`} className="group cursor-pointer">
                                                                <line
                                                                    x1={x1} y1={c.y1} x2={x2} y2={c.y2}
                                                                    stroke={color}
                                                                    strokeWidth={isManiobra ? 2 : isSenseMaquinista ? 2.5 : 4}
                                                                    strokeDasharray={isManiobra ? "4,2" : isSenseMaquinista ? "4,2" : ""}
                                                                    className="transition-all group-hover:stroke-blue-500 group-hover:[stroke-width:8px] drop-shadow-sm"
                                                                />
                                                                <circle cx={x1} cy={c.y1} r={4} fill={color} className="transition-all group-hover:r-6" />
                                                                <circle cx={x2} cy={c.y2} r={4} fill={color} className="transition-all group-hover:r-6" />

                                                                <g className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                                    <rect x={Math.min(x1, x2)} y={Math.min(c.y1, c.y2) - 70} width={200} height={60} rx={14} className="fill-gray-900/95 dark:fill-black/95 shadow-2xl" />
                                                                    <text x={Math.min(x1, x2) + 14} y={Math.min(c.y1, c.y2) - 50} className="fill-white text-[11px] font-bold uppercase">{c.id} — {c.torn}</text>
                                                                    <text x={Math.min(x1, x2) + 14} y={Math.min(c.y1, c.y2) - 35} className="fill-white/70 text-[9px] font-bold uppercase">{c.sortida} → {c.arribada}</text>
                                                                    <text x={Math.min(x1, x2) + 14} y={Math.min(c.y1, c.y2) - 20} className="text-[9px] font-bold uppercase" fill={color}>{c.linia} · {c.originId} → {c.destId}</text>
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

            <div className="flex flex-wrap items-center gap-6 px-4 bg-gray-50 dark:bg-black/20 p-4 rounded-[24px] border border-gray-100 dark:border-white/5">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: LINE_COLORS['S1']?.hex || '#f97316' }} />
                    <span className="text-[10px] font-bold uppercase text-gray-500">{LINE_COLORS['S1']?.label || 'S1'}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: LINE_COLORS['S2']?.hex || '#22c55e' }} />
                    <span className="text-[10px] font-bold uppercase text-gray-500">{LINE_COLORS['S2']?.label || 'S2'}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: LINE_COLORS['L6']?.hex || '#9333ea' }} />
                    <span className="text-[10px] font-bold uppercase text-gray-500">{LINE_COLORS['L6']?.label || 'L6'}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: LINE_COLORS['L7']?.hex || '#8B4513' }} />
                    <span className="text-[10px] font-bold uppercase text-gray-500">{LINE_COLORS['L7']?.label || 'L7'}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: LINE_COLORS['L12']?.hex || '#d8b4fe' }} />
                    <span className="text-[10px] font-bold uppercase text-gray-500">{LINE_COLORS['L12']?.label || 'L12'}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-0 border-t-2 border-dashed border-gray-400" />
                    <span className="text-[10px] font-bold uppercase text-gray-500">Maniobres</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-0 border-t-2 border-dashed border-orange-400" />
                    <span className="text-[10px] font-bold uppercase text-orange-400">Sense Maquinista</span>
                </div>
                <div className="flex-1 min-w-[100px]" />
                <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest italic">
                    <div className="flex items-center gap-1"><Move size={12} /> Arrossega</div>
                    <div className="flex items-center gap-1"><ZoomIn size={12} /> Zoom</div>
                    <div className="flex items-center gap-1"><Activity size={12} /> Hover per detalls</div>
                </div>
            </div>
        </div>
    );
};

export default AlternativeServiceGraph;
