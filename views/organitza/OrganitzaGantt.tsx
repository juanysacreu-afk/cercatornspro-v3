import React, { useRef, useMemo, useState, useCallback } from 'react';
import { Loader2, GanttChart, Users, AlertTriangle, RefreshCcw, Layers, GitBranch } from 'lucide-react';
import GlassPanel from '../../components/common/GlassPanel';
import { useGanttData, GANTT_START_MIN, GANTT_TOTAL_MINUTES, GanttBar, GanttGroup } from './hooks/useGanttData';

// ── Helper: position as % ──────────────────────────────
const toPercent = (minutes: number): number => {
    const offset = minutes - GANTT_START_MIN;
    return Math.max(0, Math.min(100, (offset / GANTT_TOTAL_MINUTES) * 100));
};

const formatTime = (min: number): string => {
    let m = min;
    if (m >= 24 * 60) m -= 24 * 60;
    return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
};

// ── Tooltip State ──────────────────────────────────────
interface TooltipState {
    bar: GanttBar;
    x: number;
    y: number;
}

// ── Hour Header ────────────────────────────────────────
const HourHeader: React.FC = () => {
    const hours = [];
    for (let h = 4; h < 28; h++) {
        hours.push(h);
    }
    return (
        <div className="relative h-8 border-b border-gray-200 dark:border-white/10">
            {hours.map(h => {
                const left = toPercent(h * 60);
                const displayH = h >= 24 ? h - 24 : h;
                return (
                    <React.Fragment key={h}>
                        <div
                            className="absolute top-0 bottom-0 border-l border-gray-200/50 dark:border-white/5"
                            style={{ left: `${left}%` }}
                        />
                        <span
                            className="absolute top-1 text-[9px] sm:text-[10px] font-mono text-gray-400 dark:text-gray-500 -translate-x-1/2 select-none"
                            style={{ left: `${left}%` }}
                        >
                            {displayH.toString().padStart(2, '0')}
                        </span>
                    </React.Fragment>
                );
            })}
        </div>
    );
};

// ── Now Marker ─────────────────────────────────────────
const NowMarker: React.FC<{ nowMin: number }> = ({ nowMin }) => {
    const left = toPercent(nowMin);
    if (left <= 0 || left >= 100) return null;
    return (
        <div className="absolute top-0 bottom-0 z-30 pointer-events-none" style={{ left: `${left}%` }}>
            <div className="w-0.5 h-full bg-red-500 dark:bg-red-400 opacity-80" />
            <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 rounded-full bg-red-500 dark:bg-red-400 border-2 border-white dark:border-fgc-grey shadow-lg" />
        </div>
    );
};

// ── Single Bar ─────────────────────────────────────────
const ShiftBar: React.FC<{
    bar: GanttBar;
    onHover: (bar: GanttBar, e: React.MouseEvent) => void;
    onLeave: () => void;
}> = ({ bar, onHover, onLeave }) => {
    const left = toPercent(bar.startMin);
    const width = toPercent(bar.endMin) - left;

    const absCode = (bar.absType || '').toUpperCase();
    const isAbsent = absCode.includes('DIS') || absCode.includes('DES') || absCode.includes('VAC') || absCode.includes('FOR');

    let bgClass = 'bg-gradient-to-r from-emerald-400/90 to-emerald-500/90 dark:from-emerald-500/80 dark:to-emerald-600/80';
    let borderClass = 'border-emerald-500/50';

    if (!bar.isAssigned) {
        bgClass = 'bg-gradient-to-r from-gray-300/70 to-gray-400/70 dark:from-gray-600/60 dark:to-gray-700/60';
        borderClass = 'border-gray-400/50 dark:border-gray-500/50 border-dashed';
    } else if (isAbsent) {
        bgClass = 'bg-gradient-to-r from-amber-400/80 to-amber-500/80 dark:from-amber-500/70 dark:to-amber-600/70';
        borderClass = 'border-amber-500/50';
    }

    return (
        <div
            className={`absolute h-7 rounded-md border ${bgClass} ${borderClass} cursor-pointer transition-all duration-200 hover:scale-y-125 hover:z-20 hover:shadow-lg`}
            style={{
                left: `${left}%`,
                width: `${Math.max(width, 0.3)}%`,
                top: '2px'
            }}
            onMouseEnter={(e) => onHover(bar, e)}
            onMouseLeave={onLeave}
        >
            {/* Internal circulation segments */}
            {width > 3 && bar.circulations.filter(c => c.type === 'circ').map((seg, i) => {
                const segLeft = ((seg.startMin - bar.startMin) / (bar.endMin - bar.startMin)) * 100;
                const segWidth = ((seg.endMin - seg.startMin) / (bar.endMin - bar.startMin)) * 100;
                return (
                    <div
                        key={i}
                        className="absolute top-0 bottom-0 bg-white/15 dark:bg-white/10 border-l border-white/20"
                        style={{ left: `${segLeft}%`, width: `${segWidth}%` }}
                    />
                );
            })}

            {/* Label inside bar */}
            {width > 2.5 && (
                <span className="absolute inset-0 flex items-center px-1.5 text-[9px] sm:text-[10px] font-bold text-white truncate select-none drop-shadow-sm">
                    {bar.shortId}
                </span>
            )}
        </div>
    );
};

// ── Group Row ──────────────────────────────────────────
const GroupSection: React.FC<{
    group: GanttGroup;
    nowMin: number;
    onBarHover: (bar: GanttBar, e: React.MouseEvent) => void;
    onBarLeave: () => void;
}> = ({ group, nowMin, onBarHover, onBarLeave }) => {
    // Stacking: assign bars to "lanes" to avoid overlaps
    const lanes = useMemo(() => {
        const result: GanttBar[][] = [];
        const sorted = [...group.bars].sort((a, b) => a.startMin - b.startMin);
        sorted.forEach(bar => {
            let placed = false;
            for (const lane of result) {
                const lastBar = lane[lane.length - 1];
                if (bar.startMin >= lastBar.endMin) {
                    lane.push(bar);
                    placed = true;
                    break;
                }
            }
            if (!placed) result.push([bar]);
        });
        return result;
    }, [group.bars]);

    return (
        <div className="mb-3">
            {/* Group label */}
            <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-[10px] sm:text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    {group.label}
                </span>
                <span className="text-[9px] text-gray-400 dark:text-gray-500 font-mono">
                    {group.bars.length} torns
                </span>
            </div>

            {/* Timeline rows */}
            <div className="relative bg-white/30 dark:bg-white/[.03] rounded-lg border border-gray-100/50 dark:border-white/5 overflow-hidden">
                {/* Grid lines every hour */}
                {Array.from({ length: 24 }, (_, i) => {
                    const left = toPercent((i + 4) * 60);
                    return (
                        <div
                            key={i}
                            className="absolute top-0 bottom-0 border-l border-gray-100/40 dark:border-white/[.03]"
                            style={{ left: `${left}%` }}
                        />
                    );
                })}

                <NowMarker nowMin={nowMin} />

                {/* Lanes */}
                {lanes.map((lane, laneIdx) => (
                    <div key={laneIdx} className="relative" style={{ height: '32px' }}>
                        {lane.map(bar => (
                            <ShiftBar
                                key={bar.shiftId}
                                bar={bar}
                                onHover={onBarHover}
                                onLeave={onBarLeave}
                            />
                        ))}
                    </div>
                ))}

                {lanes.length === 0 && (
                    <div className="h-8 flex items-center justify-center text-[10px] text-gray-400 dark:text-gray-500 italic">
                        Cap torn programat
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Main Component ─────────────────────────────────────
const OrganitzaGantt: React.FC = () => {
    const { loading, groups, stats, groupBy, setGroupBy, nowMin, serviceToday, refresh } = useGanttData();
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleBarHover = useCallback((bar: GanttBar, e: React.MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setTooltip({
            bar,
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
    }, []);

    const handleBarLeave = useCallback(() => setTooltip(null), []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="animate-spin text-fgc-green" size={32} />
                <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">Carregant malla de servei...</p>
            </div>
        );
    }

    return (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700" ref={containerRef}>
            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <GlassPanel className="p-3 sm:p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <GanttChart size={14} className="text-fgc-green" />
                        <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Total Torns</span>
                    </div>
                    <span className="text-xl sm:text-2xl font-black text-gray-800 dark:text-white">{stats.total}</span>
                </GlassPanel>

                <GlassPanel className="p-3 sm:p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Users size={14} className="text-emerald-500" />
                        <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Assignats</span>
                    </div>
                    <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">{stats.assigned}</span>
                </GlassPanel>

                <GlassPanel className="p-3 sm:p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle size={14} className="text-gray-400" />
                        <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Sense Cobrir</span>
                    </div>
                    <span className={`text-xl sm:text-2xl font-black ${stats.unassigned > 0 ? 'text-red-500' : 'text-gray-300 dark:text-gray-600'}`}>
                        {stats.unassigned}
                    </span>
                </GlassPanel>

                <GlassPanel className="p-3 sm:p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle size={14} className="text-amber-500" />
                        <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">DIS/DES</span>
                    </div>
                    <span className={`text-xl sm:text-2xl font-black ${stats.conflicts > 0 ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600'}`}>
                        {stats.conflicts}
                    </span>
                </GlassPanel>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between">
                <div className="flex bg-white/20 dark:bg-black/20 p-1 rounded-xl backdrop-blur-md border border-white/20 shadow-inner">
                    <button
                        onClick={() => setGroupBy('dependencia')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${groupBy === 'dependencia' ? 'bg-fgc-grey dark:bg-fgc-green dark:text-[#4D5358] text-white shadow' : 'text-gray-400 hover:bg-white/10'}`}
                    >
                        <Layers size={12} />
                        Dependència
                    </button>
                    <button
                        onClick={() => setGroupBy('linia')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${groupBy === 'linia' ? 'bg-fgc-grey dark:bg-fgc-green dark:text-[#4D5358] text-white shadow' : 'text-gray-400 hover:bg-white/10'}`}
                    >
                        <GitBranch size={12} />
                        Línia
                    </button>
                </div>

                <button
                    onClick={refresh}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold text-gray-400 hover:text-fgc-green hover:bg-white/10 dark:hover:bg-white/5 transition-all"
                >
                    <RefreshCcw size={12} />
                    Actualitzar
                </button>
            </div>

            {/* Timeline Container */}
            <GlassPanel className="p-3 sm:p-4 overflow-x-auto">
                <div className="min-w-[700px]">
                    {/* Hour ruler */}
                    <HourHeader />

                    {/* Groups */}
                    <div className="mt-2 space-y-1">
                        {groups.map(group => (
                            <GroupSection
                                key={group.code}
                                group={group}
                                nowMin={nowMin}
                                onBarHover={handleBarHover}
                                onBarLeave={handleBarLeave}
                            />
                        ))}
                    </div>

                    {groups.length === 0 && (
                        <div className="py-12 text-center">
                            <GanttChart className="mx-auto mb-3 text-gray-300 dark:text-gray-600" size={40} />
                            <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">
                                Cap torn trobat per al servei {serviceToday}
                            </p>
                        </div>
                    )}
                </div>
            </GlassPanel>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-center gap-4 text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 font-medium">
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-2.5 rounded-sm bg-gradient-to-r from-emerald-400 to-emerald-500" /> Cobert
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-2.5 rounded-sm bg-gradient-to-r from-gray-300 to-gray-400 border border-dashed border-gray-400/50" /> Sense assignar
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-2.5 rounded-sm bg-gradient-to-r from-amber-400 to-amber-500" /> DIS / DES / Absent
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block w-0.5 h-3 bg-red-500" /> Ara
                </span>
            </div>

            {/* Tooltip */}
            {tooltip && (
                <div
                    className="fixed z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150"
                    style={{
                        left: `${tooltip.x + (containerRef.current?.getBoundingClientRect().left || 0)}px`,
                        top: `${tooltip.y + (containerRef.current?.getBoundingClientRect().top || 0) - 90}px`
                    }}
                >
                    <div className="bg-fgc-grey/95 dark:bg-black/90 backdrop-blur-xl text-white rounded-xl px-3.5 py-2.5 shadow-2xl border border-white/10 min-w-[180px]">
                        <div className="flex items-center justify-between gap-3 mb-1">
                            <span className="font-black text-sm tracking-tight">{tooltip.bar.shortId}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${tooltip.bar.isAssigned ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                {tooltip.bar.isAssigned ? 'ASSIGNAT' : 'SENSE COBRIR'}
                            </span>
                        </div>
                        <p className="text-[10px] text-gray-300 font-medium">
                            {formatTime(tooltip.bar.startMin)} → {formatTime(tooltip.bar.endMin)} · {tooltip.bar.dependencia}
                        </p>
                        {tooltip.bar.driverName && (
                            <p className="text-[10px] text-fgc-green font-bold mt-1 truncate max-w-[220px]">
                                🧑‍✈️ {tooltip.bar.driverName}
                            </p>
                        )}
                        {tooltip.bar.absType && (
                            <p className="text-[10px] text-amber-400 font-bold mt-0.5">
                                ⚠️ {tooltip.bar.absType}
                            </p>
                        )}
                        {tooltip.bar.circulations.filter(c => c.type === 'circ').length > 0 && (
                            <p className="text-[9px] text-gray-400 mt-1">
                                {tooltip.bar.circulations.filter(c => c.type === 'circ').length} circulacions
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrganitzaGantt;
