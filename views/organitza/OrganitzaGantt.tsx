import React, { useRef, useMemo, useState, useCallback } from 'react';
import { Loader2, GanttChart, Users, AlertTriangle, RefreshCcw, Layers, GitBranch, Filter, Clock } from 'lucide-react';
import GlassPanel from '../../components/common/GlassPanel';
import { useGanttData, GANTT_START_MIN, GANTT_TOTAL_MINUTES, GanttBar, GanttGroup, GANTT_START_HOUR, GANTT_END_HOUR } from './hooks/useGanttData';
import { getFgcMinutes } from '../../utils/stations';
import { feedback } from '../../utils/feedback';

// ── Helper: position as % ──────────────────────────────
const toPercent = (minutes: number): number => {
    const offset = minutes - GANTT_START_MIN;
    return Math.max(0, Math.min(100, (offset / GANTT_TOTAL_MINUTES) * 100));
};

const formatTime = (min: number): string => {
    let m = min;
    while (m >= 24 * 60) m -= 24 * 60; // Handle multiple day wraps if needed
    return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
};

// ── Tooltip State ──────────────────────────────────────
interface TooltipState {
    bar: GanttBar;
    clientX: number;
    clientY: number;
}

// ── Hour Header ────────────────────────────────────────
const HourHeader: React.FC = () => {
    const hours = [];
    for (let h = GANTT_START_HOUR; h < GANTT_END_HOUR; h++) {
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

// ── Context Menu ───────────────────────────────────────
interface ContextMenuProps {
    x: number;
    y: number;
    bar: GanttBar;
    clickedTime: string;
    onClose: () => void;
    onMarkIncident: () => void;
    onClearIncident: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, bar, clickedTime, onClose, onMarkIncident, onClearIncident }) => {
    // Add click outside listener
    React.useEffect(() => {
        const handleClickOutside = () => onClose();
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [onClose]);

    return (
        <div
            className="absolute z-[200] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[200px] animate-in fade-in zoom-in-95 duration-100"
            style={{ left: x, top: y }}
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
        >
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 mb-1">
                <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-gray-800 dark:text-gray-200">{bar.shortId}</span>
                    <span className="flex items-center gap-1 text-[10px] sm:text-[10px] font-mono text-gray-500 bg-gray-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
                        <Clock size={10} />
                        {clickedTime}
                    </span>
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">{bar.driverName || 'Sense conductor'}</div>
            </div>
            {!bar.incidentStartTime ? (
                <button
                    onClick={onMarkIncident}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600 flex items-center gap-2"
                >
                    <AlertTriangle size={12} />
                    Marcar Indisposició
                </button>
            ) : (
                <button
                    onClick={onClearIncident}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                >
                    <RefreshCcw size={12} />
                    Esborrar Indisposició
                </button>
            )}
        </div>
    );
};

// ── Single Bar ─────────────────────────────────────────
const ShiftBar: React.FC<{
    bar: GanttBar;
    onClick: (bar: GanttBar, e: React.MouseEvent) => void;
    onContextMenu: (bar: GanttBar, e: React.MouseEvent) => void;
    isSelected: boolean;
}> = ({ bar, onClick, onContextMenu, isSelected }) => {
    const left = toPercent(bar.startMin);
    const width = toPercent(bar.endMin) - left;

    const absCode = (bar.absType || '').toUpperCase();
    const isAbsent = absCode.includes('DIS') || absCode.includes('DES') || absCode.includes('VAC') || absCode.includes('FOR');

    // Default styles
    let bgStyle: React.CSSProperties = {};
    let borderClass = isSelected ? 'border-white dark:border-white ring-2 ring-indigo-500 z-30' : 'border-emerald-500/50';
    let baseBgClass = 'bg-gradient-to-r from-emerald-400/90 to-emerald-500/90 dark:from-emerald-500/80 dark:to-emerald-600/80';

    if (!bar.isAssigned) {
        baseBgClass = 'bg-gradient-to-r from-gray-300/70 to-gray-400/70 dark:from-gray-600/60 dark:to-gray-700/60';
        borderClass = isSelected ? 'border-white dark:border-white ring-2 ring-indigo-500 z-30' : 'border-gray-400/50 dark:border-gray-500/50 border-dashed';
    } else if (isAbsent) {
        baseBgClass = 'bg-gradient-to-r from-amber-400/80 to-amber-500/80 dark:from-amber-500/70 dark:to-amber-600/70';
        borderClass = isSelected ? 'border-white dark:border-white ring-2 ring-indigo-500 z-30' : 'border-amber-500/50';
    }

    // Incident Gradient Logic
    if (bar.incidentStartTime && bar.isAssigned && !isAbsent) {
        const incidentMin = getFgcMinutes(bar.incidentStartTime);
        if (incidentMin && incidentMin > bar.startMin && incidentMin < bar.endMin) {
            const splitPercent = ((incidentMin - bar.startMin) / (bar.endMin - bar.startMin)) * 100;
            // Linear gradient: Green until visible split types, Amber after
            // Using CSS variables or hardcoded colors for simplicity
            bgStyle = {
                background: `linear-gradient(90deg, 
                    rgba(16, 185, 129, 0.9) 0%, rgba(16, 185, 129, 0.9) ${splitPercent}%, 
                    rgba(245, 158, 11, 0.9) ${splitPercent}%, rgba(245, 158, 11, 0.9) 100%)`
            };
            borderClass = isSelected ? 'border-white dark:border-white ring-2 ring-indigo-500 z-30' : 'border-amber-500/50';
        }
    }

    return (
        <div
            className={`absolute h-7 rounded-md border ${Object.keys(bgStyle).length === 0 ? baseBgClass : ''} ${borderClass} cursor-pointer transition-all duration-200 hover:scale-y-110 hover:z-20 hover:shadow-lg`}
            style={{
                left: `${left}%`,
                width: `${Math.max(width, 0.3)}%`,
                top: '2px',
                ...bgStyle
            }}
            onClick={(e) => onClick(bar, e)}
            onContextMenu={(e) => onContextMenu(bar, e)}
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
    onBarClick: (bar: GanttBar, e: React.MouseEvent) => void;
    onBarContextMenu: (bar: GanttBar, e: React.MouseEvent) => void;
    selectedBarId: string | null;
}> = ({ group, nowMin, onBarClick, onBarContextMenu, selectedBarId }) => {
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
                {Array.from({ length: GANTT_END_HOUR - GANTT_START_HOUR }, (_, i) => {
                    const left = toPercent((i + GANTT_START_HOUR) * 60);
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
                                onClick={onBarClick}
                                onContextMenu={onBarContextMenu}
                                isSelected={selectedBarId === bar.shiftId}
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
    const { loading, groups, stats, groupBy, setGroupBy, filterMode, setFilterMode, nowMin, selectedService, setSelectedService, availableServices, refresh, updateIncidentTime } = useGanttData();
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; bar: GanttBar; clickedTime: string } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleBarClick = useCallback((bar: GanttBar, e: React.MouseEvent) => {
        e.stopPropagation(); // Stop propagation to avoid closing immediately if we add a global click listener
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        // Toggle if clicking the same bar
        if (tooltip?.bar.shiftId === bar.shiftId) {
            setTooltip(null);
            return;
        }

        setTooltip({
            bar,
            clientX: e.clientX - rect.left,
            clientY: e.clientY - rect.top
        });
    }, [tooltip]);

    // Close tooltip when clicking background
    const handleBackgroundClick = useCallback(() => {
        if (tooltip) setTooltip(null);
    }, [tooltip]);

    const handleBarContextMenu = useCallback((bar: GanttBar, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        // Use NOW as the default time for incident
        // Convert nowMin (minutes from 4AM) back to HH:MM string
        // Note: nowMin is already calculated in useGanttData, but let's re-calculate perfectly for "now"
        const now = new Date();
        const currentHours = now.getHours();
        const currentMinutes = now.getMinutes();
        const timeStr = `${currentHours.toString().padStart(2, '0')}:${currentMinutes.toString().padStart(2, '0')}`;

        setContextMenu({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            bar,
            clickedTime: timeStr
        });
    }, []);

    const handleMarkIncident = async () => {
        if (!contextMenu?.bar.assignmentId) return;
        await updateIncidentTime(contextMenu.bar.assignmentId, contextMenu.clickedTime);
        setContextMenu(null);
    };

    const handleClearIncident = async () => {
        if (!contextMenu?.bar.assignmentId) return;
        await updateIncidentTime(contextMenu.bar.assignmentId, null);
        setContextMenu(null);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="animate-spin text-fgc-green" size={32} />
                <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">Carregant malla de servei...</p>
            </div>
        );
    }

    return (
        <div
            className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700 relative"
            ref={containerRef}
            onClick={handleBackgroundClick} // Close tooltip on background click
        >
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
            <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
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

                {/* Service Selector */}
                <div className="flex bg-white/20 dark:bg-black/20 p-1 rounded-xl backdrop-blur-md border border-white/20 shadow-inner ml-3">
                    {(availableServices.length > 0 ? ['Tots', ...availableServices] : ['Tots', '0', '100', '400', '500']).map(s => (
                        <button
                            key={s}
                            onClick={() => { feedback.click(); setSelectedService(s); }}
                            className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${selectedService === s ? 'bg-fgc-grey dark:bg-fgc-green dark:text-[#4D5358] text-white shadow' : 'text-gray-400 hover:bg-white/10'}`}
                        >
                            {s === 'Tots' ? 'Tots' : `S-${s}`}
                        </button>
                    ))}
                </div>

                <div className="flex bg-white/20 dark:bg-black/20 p-1 rounded-xl backdrop-blur-md border border-white/20 shadow-inner ml-3">
                    <button
                        onClick={() => setFilterMode('all')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${filterMode === 'all' ? 'bg-indigo-500 text-white shadow' : 'text-gray-400 hover:bg-white/10'}`}
                    >
                        <Filter size={12} />
                        Tots
                    </button>
                    <button
                        onClick={() => setFilterMode('unassigned')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${filterMode === 'unassigned' ? 'bg-red-500 text-white shadow' : 'text-gray-400 hover:bg-white/10'}`}
                    >
                        <AlertTriangle size={12} />
                        Sense Cobrir
                    </button>
                    <button
                        onClick={() => setFilterMode('conflicts')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${filterMode === 'conflicts' ? 'bg-amber-500 text-white shadow' : 'text-gray-400 hover:bg-white/10'}`}
                    >
                        <AlertTriangle size={12} />
                        Conflictes
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
                                onBarClick={handleBarClick}
                                onBarContextMenu={handleBarContextMenu}
                                selectedBarId={tooltip?.bar.shiftId || null}
                            />
                        ))}
                    </div>

                    {groups.length === 0 && (
                        <div className="py-12 text-center">
                            <GanttChart className="mx-auto mb-3 text-gray-300 dark:text-gray-600" size={40} />
                            <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">
                                Cap torn trobat per al servei {selectedService}
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

            {/* Tooltip - Absolute inside the relative container to avoid transform issues */}
            {tooltip && (
                <div
                    className="absolute z-[100] animate-in fade-in zoom-in-95 duration-150"
                    style={{
                        left: `${tooltip.clientX}px`,
                        top: `${tooltip.clientY}px`,
                        transform: 'translate(-50%, -110%)'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="bg-fgc-grey/95 dark:bg-black/90 backdrop-blur-xl text-white rounded-xl px-3.5 py-2.5 shadow-2xl border border-white/10 min-w-[200px]">
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

                        {/* Incident Edit Section */}
                        {tooltip.bar.incidentStartTime && (
                            <div className="mt-2 pt-2 border-t border-white/10">
                                <label className="text-[9px] text-amber-400 font-bold flex items-center gap-1.5 mb-1.5">
                                    <AlertTriangle size={10} />
                                    HORA INDISPOSICIÓ
                                </label>
                                <input
                                    type="time"
                                    className="bg-black/40 border border-amber-500/30 rounded px-2 py-1 text-xs text-white w-full focus:outline-none focus:border-amber-500 font-mono transition-colors"
                                    defaultValue={tooltip.bar.incidentStartTime}
                                    onBlur={(e) => {
                                        if (tooltip.bar.assignmentId && e.target.value !== tooltip.bar.incidentStartTime) {
                                            updateIncidentTime(tooltip.bar.assignmentId, e.target.value);
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.currentTarget.blur();
                                        }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        )}

                        {tooltip.bar.absType && !tooltip.bar.incidentStartTime && (
                            <p className="text-[10px] text-amber-400 font-bold mt-0.5">
                                ⚠️ {tooltip.bar.absType}
                            </p>
                        )}

                        {tooltip.bar.circulations.filter(c => c.type === 'circ').length > 0 && (
                            <p className="text-[9px] text-gray-400 mt-2 pt-1 border-t border-white/5">
                                {tooltip.bar.circulations.filter(c => c.type === 'circ').length} circulacions
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Context Menu */}
            {contextMenu && (
                <ContextMenu
                    {...contextMenu}
                    onClose={() => setContextMenu(null)}
                    onMarkIncident={handleMarkIncident}
                    onClearIncident={handleClearIncident}
                />
            )}
        </div>
    );
};
export default OrganitzaGantt;
