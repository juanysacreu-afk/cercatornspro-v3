import React, { useRef, useMemo, useState, useCallback } from 'react';
import {
    Loader2, GanttChart, Users, AlertTriangle, RefreshCcw, Layers,
    GitBranch, Filter, Clock, Sunrise, Sunset, Moon, Search, ZoomIn, ZoomOut,
    Download, X
} from 'lucide-react';
import GlassPanel from '../../components/common/GlassPanel';
import {
    useGanttData,
    GANTT_START_MIN, GANTT_TOTAL_MINUTES,
    GanttBar, GanttGroup,
    GanttZoomLevel
} from './hooks/useGanttData';
import { getFgcMinutes } from '../../utils/stations';
import { feedback } from '../../utils/feedback';
import { GanttContextMenu } from './components/GanttContextMenu';
import { GanttShiftBar } from './components/GanttShiftBar';

// ── Helper: position as % ──────────────────────────────
const calculatePercent = (minutes: number, start: number, total: number): number => {
    const offset = minutes - start;
    return (offset / total) * 100;
};

const formatTime = (totalMins: number): string => {
    const totalSecs = Math.round(totalMins * 60);
    const h = Math.floor(totalSecs / 3600) % 24;
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// ── Tooltip State ──────────────────────────────────────
interface TooltipState {
    bar: GanttBar;
    clientX: number;
    clientY: number;
}

// ── Hour Header ────────────────────────────────────────
const HourHeader: React.FC<{ viewRange: { start: number, end: number, total: number }, toPercent: (min: number) => number }> = ({ viewRange, toPercent }) => {
    const hours = useMemo(() => {
        const hArr = [];
        const startH = Math.floor(viewRange.start / 60);
        const endH = Math.ceil(viewRange.end / 60);
        for (let h = startH; h <= endH; h++) {
            hArr.push(h);
        }
        return hArr;
    }, [viewRange]);

    return (
        <div className="relative h-8 border-b border-gray-200 dark:border-white/10">
            {hours.map(h => {
                const left = toPercent(h * 60);
                if (left < 0 || left > 100) return null;
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

// ── Now Marker (V2: with past-time gradient) ───────────
const NowMarker: React.FC<{ nowMin: number, toPercent: (min: number) => number }> = ({ nowMin, toPercent }) => {
    const left = toPercent(nowMin);
    if (left <= 0 || left >= 100) return null;
    return (
        <>
            {/* V2 – semi-transparent gradient over the past time */}
            <div
                className="absolute top-0 bottom-0 z-10 pointer-events-none"
                style={{
                    left: 0,
                    width: `${left}%`,
                    background: 'linear-gradient(to right, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.10) 100%)',
                }}
            />
            {/* Red line */}
            <div className="absolute top-0 bottom-0 z-30 pointer-events-none transition-all duration-500" style={{ left: `${left}%` }}>
                <div className="w-0.5 h-full bg-red-500 dark:bg-red-400 opacity-80" />
                <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 rounded-full bg-red-500 dark:bg-red-400 border-2 border-white dark:border-fgc-grey shadow-lg" />
            </div>
        </>
    );
};

// ── Group Row ──────────────────────────────────────────
// C2 fix: lane algorithm handles midnight-crossing bars correctly
const GroupSection: React.FC<{
    group: GanttGroup;
    viewRange: { start: number, end: number, total: number };
    toPercent: (min: number) => number;
    nowMin: number;
    onBarClick: (bar: GanttBar, e: React.MouseEvent) => void;
    onBarContextMenu: (bar: GanttBar, e: React.MouseEvent) => void;
    selectedBarId: string | null;
    staggerIndex: number; // V4
    // F2 drag-and-drop
    dragSourceBar: GanttBar | null;
    onDragStart: (bar: GanttBar) => void;
    onDragEnd: () => void;
    onDrop: (target: GanttBar) => void;
}> = ({ group, viewRange, toPercent, nowMin, onBarClick, onBarContextMenu, selectedBarId, staggerIndex, dragSourceBar, onDragStart, onDragEnd, onDrop }) => {
    // C2 – Correct lane algorithm: use absolute endMin (already adjusted for midnight crossing in useGanttData)
    const lanes = useMemo(() => {
        const result: GanttBar[][] = [];
        const sorted = [...group.bars].sort((a, b) => a.startMin - b.startMin);
        sorted.forEach(bar => {
            let placed = false;
            for (const lane of result) {
                const lastBar = lane[lane.length - 1];
                // C2 fix: use a small gap tolerance (0.5 min) to avoid visual overlap on adjacent bars
                if (bar.startMin >= lastBar.endMin - 0.5) {
                    lane.push(bar);
                    placed = true;
                    break;
                }
            }
            if (!placed) result.push([bar]);
        });
        return result;
    }, [group.bars]);

    // V4 – stagger animation delay (50ms per group)
    const animStyle: React.CSSProperties = {
        animationDelay: `${staggerIndex * 55}ms`,
        animationFillMode: 'both',
    };

    return (
        <div
            className="mb-3 animate-in slide-in-from-bottom-2 fade-in duration-400"
            style={animStyle}
        >
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
            <div className="relative bg-white/30 dark:bg-white/[.03] rounded-lg border border-gray-100/50 dark:border-white/5 transition-all duration-500 mt-2">
                {/* Grid lines every hour */}
                {Array.from({ length: 32 }, (_, i) => {
                    const left = toPercent(i * 60);
                    if (left < 0 || left > 100) return null;
                    return (
                        <div
                            key={i}
                            className="absolute top-0 bottom-0 border-l border-gray-100/40 dark:border-white/[.03]"
                            style={{ left: `${left}%` }}
                        />
                    );
                })}

                <NowMarker nowMin={nowMin} toPercent={toPercent} />

                {/* Lanes */}
                {lanes.map((lane, laneIdx) => (
                    <div key={laneIdx} className="relative" style={{ height: '32px' }}>
                        {lane.map(bar => {
                            const isDragSource = dragSourceBar?.shiftId === bar.shiftId;
                            // F2 – a bar is a valid drop target if it's uncovered and something is being dragged
                            const isUncovered = !bar.isAssigned || bar.incidentStartTime === '00:00';
                            const isDragTarget = !!dragSourceBar && !isDragSource && isUncovered;

                            return (
                                <GanttShiftBar
                                    key={bar.shiftId}
                                    bar={bar}
                                    toPercent={toPercent}
                                    onClick={onBarClick}
                                    onContextMenu={onBarContextMenu}
                                    isSelected={selectedBarId === bar.shiftId}
                                    isDragSource={isDragSource}
                                    isDragTarget={isDragTarget}
                                    onDragStart={onDragStart}
                                    onDragEnd={onDragEnd}
                                    onDrop={onDrop}
                                />
                            );
                        })}
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

// ── V5 – Sticky mini-legend ────────────────────────────
const GanttLegend: React.FC = () => (
    <div className="sticky bottom-4 flex justify-center pointer-events-none z-40">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3
                        bg-white/80 dark:bg-gray-900/80 backdrop-blur-md
                        border border-gray-200 dark:border-white/10
                        rounded-2xl px-4 py-2 shadow-xl text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium">
            <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-2.5 rounded-sm bg-gradient-to-r from-emerald-400 to-emerald-500" /> Matí Cobert
            </span>
            <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-2.5 rounded-sm bg-gradient-to-r from-amber-400 to-orange-500" /> Tarda Cobert
            </span>
            <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-2.5 rounded-sm bg-gradient-to-r from-indigo-500 to-violet-600" /> Nit Cobert
            </span>
            <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-2.5 rounded-sm bg-gradient-to-r from-gray-300 to-gray-400 border border-dashed border-gray-400/50" /> Sense assignar
            </span>
            <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-2.5 rounded-sm bg-gradient-to-r from-amber-400 to-amber-500" /> Indisposició
            </span>
            <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-2.5 rounded-sm bg-gradient-to-r from-red-500 to-red-600" /> Descobert
            </span>
            <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-2.5 rounded-sm bg-gradient-to-r from-purple-500 to-purple-600" /> Cobertura Extra
            </span>
            <span className="flex items-center gap-1.5">
                <span className="inline-block w-0.5 h-3.5 bg-red-500 rounded" /> Ara
            </span>
        </div>
    </div>
);

// ── F1 Zoom Buttons ─────────────────────────────────────
const ZOOM_OPTIONS: { label: string; value: GanttZoomLevel }[] = [
    { label: 'Tot', value: 'full' },
    { label: '12h', value: '12h' },
    { label: '8h', value: '8h' },
    { label: '4h', value: '4h' },
];

// ── Main Component ─────────────────────────────────────
const OrganitzaGantt: React.FC<{
    onNavigateToSearch?: (type: string, query: string) => void;
    isPrivacyMode?: boolean;
}> = ({ onNavigateToSearch, isPrivacyMode = true }) => {
    const {
        loading, groups, stats, groupBy, setGroupBy,
        filterMode, setFilterMode, timeFilter, setTimeFilter,
        zoomLevel, setZoomLevel,
        viewRange, nowMin, selectedService, setSelectedService,
        availableServices, refresh, updateIncidentTime, assignToShift,
    } = useGanttData();

    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; bar: GanttBar; clickedTime: string } | null>(null);
    const [assigningModeBar, setAssigningModeBar] = useState<GanttBar | null>(null);
    // F2 – drag state
    const [dragSourceBar, setDragSourceBar] = useState<GanttBar | null>(null);
    // F5 – group search
    const [groupSearch, setGroupSearch] = useState('');
    // F3 – export loading
    const [exporting, setExporting] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const ganttBodyRef = useRef<HTMLDivElement>(null);

    // Dynamic Coordinate helper
    const toPercent = useCallback((minutes: number) => {
        return calculatePercent(minutes, viewRange.start, viewRange.total);
    }, [viewRange]);

    // F5 – filtered groups
    const visibleGroups = useMemo(() => {
        if (!groupSearch.trim()) return groups;
        const q = groupSearch.trim().toLowerCase();
        return groups
            .map(g => ({
                ...g,
                bars: g.bars.filter(b =>
                    b.shortId.toLowerCase().includes(q) ||
                    b.driverName?.toLowerCase().includes(q) ||
                    b.dependencia.toLowerCase().includes(q)
                )
            }))
            .filter(g => g.bars.length > 0 || g.label.toLowerCase().includes(q));
    }, [groups, groupSearch]);

    const handleBarClick = useCallback(async (bar: GanttBar, e: React.MouseEvent) => {
        e.stopPropagation();

        if (assigningModeBar && assigningModeBar.assignmentId) {
            feedback.deepClick();
            await assignToShift(assigningModeBar.assignmentId, bar.shortId);
            setAssigningModeBar(null);
            return;
        }

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        if (tooltip?.bar.shiftId === bar.shiftId) {
            setTooltip(null);
            return;
        }

        setTooltip({
            bar,
            clientX: e.clientX - rect.left,
            clientY: e.clientY - rect.top,
        });
    }, [tooltip, assigningModeBar, assignToShift]);

    const handleBackgroundClick = useCallback(() => {
        if (tooltip) setTooltip(null);
        if (assigningModeBar) {
            setAssigningModeBar(null);
            feedback.click();
        }
    }, [tooltip, assigningModeBar]);

    const handleBarContextMenu = useCallback((bar: GanttBar, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        const menuHeight = 180;
        let adjustedY = e.clientY - rect.top;
        if (adjustedY + menuHeight > rect.height) adjustedY -= menuHeight;

        setContextMenu({
            x: e.clientX - rect.left,
            y: adjustedY,
            bar,
            clickedTime: timeStr,
        });
    }, []);

    const handleMarkIncident = async () => {
        if (!contextMenu?.bar.assignmentId) return;
        await updateIncidentTime(contextMenu.bar.assignmentId, contextMenu.clickedTime);
        setContextMenu(null);
    };

    const handleMarkUncovered = async () => {
        if (!contextMenu?.bar.assignmentId) return;
        await updateIncidentTime(contextMenu.bar.assignmentId, '00:00');
        setContextMenu(null);
    };

    const handleClearIncident = async () => {
        if (!contextMenu?.bar.assignmentId) return;
        await updateIncidentTime(contextMenu.bar.assignmentId, null);
        setContextMenu(null);
    };

    const handleViewTurn = () => {
        if (!contextMenu?.bar.shortId) return;
        feedback.deepClick();
        onNavigateToSearch?.('torn', contextMenu.bar.shortId);
        setContextMenu(null);
    };

    // F2 – drag handlers
    const handleDragStart = useCallback((bar: GanttBar) => {
        setDragSourceBar(bar);
        feedback.click();
    }, []);

    const handleDragEnd = useCallback(() => {
        setDragSourceBar(null);
    }, []);

    const handleDrop = useCallback(async (targetBar: GanttBar) => {
        if (!dragSourceBar?.assignmentId) return;
        feedback.deepClick();
        await assignToShift(dragSourceBar.assignmentId, targetBar.shortId);
        setDragSourceBar(null);
    }, [dragSourceBar, assignToShift]);

    // F3 – Export Gantt as PNG using html-to-image / canvas
    const handleExportImage = useCallback(async () => {
        const el = ganttBodyRef.current;
        if (!el || exporting) return;
        setExporting(true);
        try {
            // Dynamically import html2canvas (may not be installed)
            // Fallback: open print dialog
            const html2canvasModule = await import('html2canvas').catch(() => null);
            if (html2canvasModule) {
                const canvas = await html2canvasModule.default(el, {
                    backgroundColor: document.documentElement.classList.contains('dark') ? '#111' : '#fff',
                    scale: 1.5,
                    useCORS: true,
                });
                const link = document.createElement('a');
                link.download = `gantt-${new Date().toISOString().slice(0, 10)}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            } else {
                // Fallback: print
                window.print();
            }
        } catch (e) {
            console.error('[Gantt] Export error:', e);
            window.print();
        } finally {
            setExporting(false);
        }
    }, [exporting]);

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
            className={`space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700 relative ${assigningModeBar ? 'cursor-crosshair' : ''}`}
            ref={containerRef}
            onClick={handleBackgroundClick}
        >
            {/* Assigning Mode Floating Banner */}
            {assigningModeBar && (
                <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[300] bg-indigo-600 text-white px-5 py-3 rounded-2xl shadow-2xl border border-white/20 flex items-center gap-4 animate-in slide-in-from-top-4">
                    <span className="text-xs sm:text-sm font-bold flex items-center gap-2">
                        <GitBranch size={16} />
                        Selecciona a la malla el torn on vols assignar a {assigningModeBar.driverName}...
                    </span>
                    <button
                        onClick={(e) => { e.stopPropagation(); setAssigningModeBar(null); feedback.click(); }}
                        className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold transition-colors"
                    >
                        Cancel·lar
                    </button>
                </div>
            )}

            {/* Drag-mode banner */}
            {dragSourceBar && (
                <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[300] bg-fgc-green text-black px-5 py-3 rounded-2xl shadow-2xl border border-black/10 flex items-center gap-4 animate-in slide-in-from-top-4">
                    <span className="text-xs sm:text-sm font-bold">
                        ⠿ Arrossega «{dragSourceBar.shortId}» sobre un torn descobert per cobrir-lo
                    </span>
                    <button
                        onClick={(e) => { e.stopPropagation(); setDragSourceBar(null); }}
                        className="p-1 bg-black/10 hover:bg-black/20 rounded-lg transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

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
                        <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Indisposició</span>
                    </div>
                    <span className={`text-xl sm:text-2xl font-black ${stats.conflicts > 0 ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600'}`}>
                        {stats.conflicts}
                    </span>
                </GlassPanel>
            </div>

            {/* Controls ──────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>

                {/* Group by */}
                <div className="flex bg-white/20 dark:bg-black/20 p-1 rounded-xl backdrop-blur-md border border-white/20 shadow-inner">
                    <button
                        onClick={() => setGroupBy('dependencia')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${groupBy === 'dependencia' ? 'bg-fgc-grey dark:bg-fgc-green dark:text-[#4D5358] text-white shadow' : 'text-gray-400 hover:bg-white/10'}`}
                    >
                        <Layers size={12} />Dependència
                    </button>
                    <button
                        onClick={() => setGroupBy('horari')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${groupBy === 'horari' ? 'bg-fgc-grey dark:bg-fgc-green dark:text-[#4D5358] text-white shadow' : 'text-gray-400 hover:bg-white/10'}`}
                    >
                        <Clock size={12} />Horari
                    </button>
                </div>

                {/* Service selector */}
                <div className="flex bg-white/20 dark:bg-black/20 p-1 rounded-xl backdrop-blur-md border border-white/20 shadow-inner">
                    {(availableServices.length > 0 ? ['Tots', ...availableServices] : ['Tots', '0', '100', '400', '500']).map(s => (
                        <button
                            key={s}
                            onClick={() => { feedback.click(); setSelectedService(s); refresh(); }}
                            className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${selectedService === s ? 'bg-fgc-grey dark:bg-fgc-green dark:text-[#4D5358] text-white shadow' : 'text-gray-400 hover:bg-white/10'}`}
                        >
                            {s === 'Tots' ? 'Tots' : `S-${s}`}
                        </button>
                    ))}
                </div>

                {/* Filter mode – F4: descoberts highlighted */}
                <div className="flex bg-white/20 dark:bg-black/20 p-1 rounded-xl backdrop-blur-md border border-white/20 shadow-inner">
                    <button
                        onClick={() => setFilterMode('all')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${filterMode === 'all' ? 'bg-indigo-500 text-white shadow' : 'text-gray-400 hover:bg-white/10'}`}
                    >
                        <Filter size={12} />Tots
                    </button>
                    {/* F4 – quick filter for uncovered */}
                    <button
                        onClick={() => setFilterMode(filterMode === 'unassigned' ? 'all' : 'unassigned')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${filterMode === 'unassigned' ? 'bg-red-500 text-white shadow ring-2 ring-red-300 dark:ring-red-700' : 'text-gray-400 hover:bg-white/10'}`}
                        title="Mostra només torns descoberts"
                    >
                        <AlertTriangle size={12} />Descoberts
                        {stats.unassigned > 0 && (
                            <span className="ml-1 bg-red-600 text-white rounded-full px-1.5 py-px text-[9px] font-black">
                                {stats.unassigned}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setFilterMode('conflicts')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${filterMode === 'conflicts' ? 'bg-amber-500 text-white shadow' : 'text-gray-400 hover:bg-white/10'}`}
                    >
                        <AlertTriangle size={12} />Indisposició
                    </button>
                </div>

                {/* Time filters */}
                <div className="flex bg-white/20 dark:bg-black/20 p-1 rounded-xl backdrop-blur-md border border-white/20 shadow-inner">
                    {[
                        { label: 'Tots', value: 'all', icon: null, activeClass: 'bg-fgc-grey dark:bg-white/20 text-white' },
                        { label: 'Matí', value: 'mati', icon: <Sunrise size={12} />, activeClass: 'bg-amber-400 text-black' },
                        { label: 'Tarda', value: 'tarda', icon: <Sunset size={12} />, activeClass: 'bg-orange-500 text-white' },
                        { label: 'Nit', value: 'nit', icon: <Moon size={12} />, activeClass: 'bg-indigo-900 text-white' },
                    ].map(tf => (
                        <button
                            key={tf.value}
                            onClick={() => setTimeFilter(tf.value as any)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${timeFilter === tf.value ? tf.activeClass + ' shadow' : 'text-gray-400 hover:bg-white/10'}`}
                        >
                            {tf.icon}{tf.label}
                        </button>
                    ))}
                </div>

                {/* F1 – Zoom controls */}
                <div className="flex bg-white/20 dark:bg-black/20 p-1 rounded-xl backdrop-blur-md border border-white/20 shadow-inner items-center gap-0.5">
                    <ZoomIn size={12} className="text-gray-400 ml-1 mr-0.5" />
                    {ZOOM_OPTIONS.map(zo => (
                        <button
                            key={zo.value}
                            onClick={() => { feedback.click(); setZoomLevel(zo.value); }}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${zoomLevel === zo.value ? 'bg-fgc-grey dark:bg-fgc-green dark:text-[#4D5358] text-white shadow' : 'text-gray-400 hover:bg-white/10'}`}
                        >
                            {zo.label}
                        </button>
                    ))}
                </div>

                <div className="ml-auto flex items-center gap-2">
                    {/* F5 – Group search */}
                    <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={groupSearch}
                            onChange={e => setGroupSearch(e.target.value)}
                            placeholder="Cerca torns, dependència..."
                            className="pl-8 pr-8 py-1.5 text-[11px] sm:text-xs bg-white/20 dark:bg-white/5 border border-white/30 dark:border-white/10 rounded-xl text-gray-700 dark:text-gray-300 placeholder:text-gray-400 focus:outline-none focus:border-fgc-green/50 focus:ring-1 focus:ring-fgc-green/30 transition-all w-44 sm:w-56"
                            onClick={e => e.stopPropagation()}
                        />
                        {groupSearch && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setGroupSearch(''); }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    {/* F3 – Export */}
                    <button
                        onClick={handleExportImage}
                        disabled={exporting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold text-gray-400 hover:text-fgc-green hover:bg-white/10 dark:hover:bg-white/5 transition-all disabled:opacity-50"
                        title="Exportar Gantt com a imatge"
                    >
                        {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        Exportar
                    </button>

                    {/* Refresh */}
                    <button
                        onClick={refresh}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold text-gray-400 hover:text-fgc-green hover:bg-white/10 dark:hover:bg-white/5 transition-all"
                    >
                        <RefreshCcw size={12} />
                        Actualitzar
                    </button>
                </div>
            </div>

            {/* Timeline Container ───────────────────────────────── */}
            <GlassPanel className="p-3 sm:p-4 overflow-x-auto" ref={ganttBodyRef}>
                <div className="min-w-[700px]">
                    {/* Hour ruler */}
                    <HourHeader viewRange={viewRange} toPercent={toPercent} />

                    {/* Groups – V4 stagger animation via staggerIndex */}
                    <div className="mt-2 space-y-1">
                        {visibleGroups.map((group, idx) => (
                            <GroupSection
                                key={group.code}
                                group={group}
                                viewRange={viewRange}
                                toPercent={toPercent}
                                nowMin={nowMin}
                                onBarClick={handleBarClick}
                                onBarContextMenu={handleBarContextMenu}
                                selectedBarId={tooltip?.bar.shiftId || null}
                                staggerIndex={idx}
                                dragSourceBar={dragSourceBar}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                                onDrop={handleDrop}
                            />
                        ))}
                    </div>

                    {visibleGroups.length === 0 && (
                        <div className="py-12 text-center">
                            <GanttChart className="mx-auto mb-3 text-gray-300 dark:text-gray-600" size={40} />
                            <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">
                                {groupSearch ? `Sense resultats per «${groupSearch}»` : `Cap torn trobat per al servei ${selectedService}`}
                            </p>
                        </div>
                    )}
                </div>
            </GlassPanel>

            {/* V5 – Sticky mini-legend */}
            <GanttLegend />

            {/* Tooltip ─────────────────────────────────────────── */}
            {tooltip && (
                <div
                    className="absolute z-[100] animate-in fade-in zoom-in-95 duration-150"
                    style={{
                        left: `${tooltip.clientX}px`,
                        top: `${tooltip.clientY}px`,
                        transform: 'translate(-50%, -110%)',
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

                        {/* Incident Edit */}
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
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        )}

                        {tooltip.bar.absType && !tooltip.bar.incidentStartTime && (
                            <p className="text-[10px] text-amber-400 font-bold mt-0.5">⚠️ {tooltip.bar.absType}</p>
                        )}

                        {tooltip.bar.circulations.filter(c => c.type === 'circ').length > 0 && (
                            <p className="text-[9px] text-gray-400 mt-2 pt-1 border-t border-white/5">
                                {tooltip.bar.circulations.filter(c => c.type === 'circ').length} circulacions
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Context Menu ────────────────────────────────────── */}
            {contextMenu && (
                <GanttContextMenu
                    {...contextMenu}
                    onClose={() => setContextMenu(null)}
                    onMarkIncident={handleMarkIncident}
                    onMarkUncovered={handleMarkUncovered}
                    onClearIncident={handleClearIncident}
                    onViewTurn={handleViewTurn}
                    onAssignAnother={() => {
                        feedback.click();
                        setAssigningModeBar(contextMenu.bar);
                        setContextMenu(null);
                    }}
                    isPrivacyMode={isPrivacyMode}
                />
            )}
        </div>
    );
};

export default OrganitzaGantt;
