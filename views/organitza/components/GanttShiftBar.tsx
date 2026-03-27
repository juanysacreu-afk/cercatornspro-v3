import React, { useMemo, useRef, useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import type { GanttBar } from '../hooks/useGanttData';
import { getFgcMinutes } from '../../../utils/stations';

// ── Shift-time colour palette (V3) ─────────────────────────────────────────
// Determined by inici_torn (startMin in FGC minutes, base=04:00)
// • Matí   (04:00–11:59) → sky-blue
// • Tarda  (12:00–20:59) → orange/amber
// • Nit    (21:00–04:00) → indigo
function getShiftTimePalette(startMin: number): {
    assigned: string;       // bg class for assigned bars
    assignedBorder: string; // border class
} {
    // startMin is in absolute FGC minutes (e.g. 04:00 = 240)
    const hour = Math.floor(startMin / 60) % 24;

    if (hour >= 4 && hour < 12) {
        // Matí → emerald (same as before — this is the dominant "good" state)
        return {
            assigned: 'bg-gradient-to-r from-emerald-400/90 to-emerald-500/90 dark:from-emerald-500/80 dark:to-emerald-600/80',
            assignedBorder: 'border-emerald-500/50',
        };
    } else if (hour >= 12 && hour < 21) {
        // Tarda → teal/cyan (intermediate between emerald and indigo)
        return {
            assigned: 'bg-gradient-to-r from-teal-400/90 to-cyan-500/90 dark:from-teal-500/80 dark:to-cyan-600/80',
            assignedBorder: 'border-teal-500/50',
        };
    } else {
        // Nit → indigo/violet
        return {
            assigned: 'bg-gradient-to-r from-indigo-500/90 to-violet-600/90 dark:from-indigo-600/80 dark:to-violet-700/80',
            assignedBorder: 'border-indigo-400/50',
        };
    }
}

// ── Props ──────────────────────────────────────────────────────────────────
interface ShiftBarProps {
    bar: GanttBar;
    toPercent: (min: number) => number;
    onClick: (bar: GanttBar, e: React.MouseEvent) => void;
    onContextMenu: (bar: GanttBar, e: React.MouseEvent) => void;
    isSelected: boolean;
    // F2 – drag-and-drop
    isDragSource?: boolean;
    isDragTarget?: boolean;
    onDragStart?: (bar: GanttBar) => void;
    onDragEnd?: () => void;
    onDrop?: (target: GanttBar) => void;
}

export const GanttShiftBar: React.FC<ShiftBarProps> = ({
    bar, toPercent, onClick, onContextMenu, isSelected,
    isDragSource = false, isDragTarget = false,
    onDragStart, onDragEnd, onDrop,
}) => {
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const [isLongPressing, setIsLongPressing] = useState(false);

    const handleTouchStart = (e: React.TouchEvent) => {
        setIsLongPressing(true);
        const touch = e.touches[0];
        const clientX = touch.clientX;
        const clientY = touch.clientY;

        longPressTimer.current = setTimeout(() => {
            setIsLongPressing(false);
            // Create a pseudo-mouse event for the context menu handler
            const pseudoEvent = {
                preventDefault: () => { },
                stopPropagation: () => { },
                clientX,
                clientY,
            } as unknown as React.MouseEvent;

            onContextMenu(bar, pseudoEvent);
        }, 600); // 600ms for long press
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
        setIsLongPressing(false);
    };

    const handleTouchMove = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
        setIsLongPressing(false);
    };

    useEffect(() => {
        return () => {
            if (longPressTimer.current) clearTimeout(longPressTimer.current);
        };
    }, []);
    const startLeft = toPercent(bar.startMin);
    const endRight = toPercent(bar.endMin);
    const width = endRight - startLeft;

    // Filter bars out of view
    if (startLeft > 100 || endRight < 0) return null;
    const renderLeft = Math.max(0, startLeft);
    const renderWidth = Math.min(100 - renderLeft, width - (renderLeft > startLeft ? renderLeft - startLeft : 0));

    const absCode = (bar.absType || '').toUpperCase();
    const isAbsent = absCode.includes('DIS') || absCode.includes('DES') || absCode.includes('VAC') || absCode.includes('FOR');

    // ── Colour resolution ─────────────────────────────────────────────────
    const palette = getShiftTimePalette(bar.startMin);
    let bgStyle: React.CSSProperties = {};

    // Selection ring
    const selectedRing = isSelected ? 'border-white dark:border-white ring-2 ring-indigo-500 z-30' : '';

    // Drag states
    const dragSourceFx = isDragSource ? 'opacity-50 scale-y-90' : '';
    const dragTargetFx = isDragTarget ? 'ring-2 ring-fgc-green ring-offset-1 brightness-110 z-30' : '';

    let baseBgClass: string;
    let borderClass: string;

    if (bar.coveringShiftId) {
        baseBgClass = 'bg-gradient-to-r from-purple-500/90 to-purple-600/90 dark:from-purple-600/80 dark:to-purple-700/80';
        borderClass = selectedRing || 'border-purple-500/50';
    } else if (!bar.isAssigned) {
        baseBgClass = 'bg-gradient-to-r from-gray-300/70 to-gray-400/70 dark:from-gray-600/60 dark:to-gray-700/60';
        borderClass = selectedRing || 'border-gray-400/50 dark:border-gray-500/50 border-dashed';
    } else if (isAbsent) {
        baseBgClass = 'bg-gradient-to-r from-amber-400/80 to-amber-500/80 dark:from-amber-500/70 dark:to-amber-600/70';
        borderClass = selectedRing || 'border-amber-500/50';
    } else {
        // V3: use shift-time colour palette for normal assigned bars
        baseBgClass = palette.assigned;
        borderClass = selectedRing || palette.assignedBorder;
    }

    // Partial Coverage Styling (from EXTRA shifts)
    const isCoveredByExtra = !!bar.coveringDriverName;
    if (bar.isAssigned && !isAbsent && !bar.incidentStartTime && typeof bar.coveringExtraStartMin === 'number' && typeof bar.coveringExtraEndMin === 'number') {
        const cStart = Math.max(bar.startMin, bar.coveringExtraStartMin);
        const cEnd = Math.min(bar.endMin, bar.coveringExtraEndMin);

        // Apply gradient only if there's an intersection and it doesn't cover the whole bar
        if (cStart < cEnd && (cStart > bar.startMin || cEnd < bar.endMin)) {
            const splitStart = ((cStart - bar.startMin) / (bar.endMin - bar.startMin)) * 100;
            const splitEnd = ((cEnd - bar.startMin) / (bar.endMin - bar.startMin)) * 100;

            const grayColor = 'rgba(156, 163, 175, 0.5)'; // Unassigned look
            // Use purple if it's a cover, otherwise palette color
            let coveredColor = bar.coveringExtraShiftId ? 'rgba(147, 51, 234, 0.9)' : 'rgba(16, 185, 129, 0.9)'; // purple-600 vs emerald

            if (!bar.coveringExtraShiftId) {
                const hour = Math.floor(bar.startMin / 60) % 24;
                if (hour >= 12 && hour < 21) coveredColor = 'rgba(20, 184, 166, 0.9)'; // teal-500
                else if (hour >= 21 || hour < 4) coveredColor = 'rgba(99, 102, 241, 0.9)'; // indigo
            }

            bgStyle = {
                background: `linear-gradient(90deg, 
                    ${grayColor} 0%, ${grayColor} ${splitStart}%, 
                    ${coveredColor} ${splitStart}%, ${coveredColor} ${splitEnd}%, 
                    ${grayColor} ${splitEnd}%, ${grayColor} 100%)`
            };
            baseBgClass = ''; // Clear base background to avoid clash
        }
    }

    // V3 Enhancement: If explicitly covered by extra, use purple base if not already gradient
    if (isCoveredByExtra && Object.keys(bgStyle).length === 0) {
        baseBgClass = 'bg-gradient-to-r from-purple-500/90 to-purple-600/90 dark:from-purple-600/80 dark:to-purple-700/80';
        borderClass = selectedRing || 'border-purple-500/50';
    }

    // Incident Styling
    if (bar.incidentStartTime && bar.isAssigned && !isAbsent) {
        if (bar.incidentStartTime === '00:00') {
            baseBgClass = 'bg-gradient-to-r from-red-500/90 to-red-600/90 dark:from-red-600/80 dark:to-red-700/80';
            borderClass = selectedRing || 'border-red-500/50';
        } else {
            const incidentMin = getFgcMinutes(bar.incidentStartTime);
            if (incidentMin && incidentMin > bar.startMin && incidentMin < bar.endMin) {
                const splitPercent = ((incidentMin - bar.startMin) / (bar.endMin - bar.startMin)) * 100;
                
                // Determine the "OK" color based on the shift time
                const hour = Math.floor(bar.startMin / 60) % 24;
                let okColor = 'rgba(16, 185, 129, 0.9)'; // emerald (matí)
                if (hour >= 12 && hour < 21) okColor = 'rgba(20, 184, 166, 0.9)'; // teal (tarda)
                else if (hour >= 21 || hour < 4) okColor = 'rgba(99, 102, 241, 0.9)'; // indigo (nit)

                bgStyle = {
                    background: `linear-gradient(90deg,
                        ${okColor} 0%, ${okColor} ${splitPercent}%,
                        ${bar.coveringDriverName ? 'rgba(147, 51, 234, 0.9)' : 'rgba(245, 158, 11, 0.9)'} ${splitPercent}%, 
                        ${bar.coveringDriverName ? 'rgba(147, 51, 234, 0.9)' : 'rgba(245, 158, 11, 0.9)'} 100%)`
                };
                borderClass = selectedRing || (bar.coveringDriverName ? 'border-purple-500/50' : 'border-amber-500/50');
                
                // Save it for labels
                (bar as any)._splitPercent = splitPercent;
            } else if (incidentMin && incidentMin <= bar.startMin) {
                if (bar.coveringDriverName) {
                    baseBgClass = 'bg-gradient-to-r from-purple-500/90 to-purple-600/90 dark:from-purple-600/80 dark:to-purple-700/80';
                    borderClass = selectedRing || 'border-purple-500/50';
                } else {
                    baseBgClass = 'bg-gradient-to-r from-amber-400/80 to-amber-500/80 dark:from-amber-500/70 dark:to-amber-600/70';
                    borderClass = selectedRing || 'border-amber-500/50';
                }
            }
        }
    }


    // F2 – draggable only for EXTRA or reserve bars
    const isDraggable = bar.dependencia === 'EXTRA' || /^QR/i.test(bar.shortId);

    return (
        <div
            className={`absolute h-7 rounded-md border ${Object.keys(bgStyle).length === 0 ? baseBgClass : ''} ${borderClass} cursor-pointer transition-all duration-300 ${isLongPressing ? 'scale-95 brightness-75' : 'hover:scale-y-110'} hover:z-20 hover:shadow-lg ${dragSourceFx} ${dragTargetFx}`}
            style={{
                left: `${renderLeft}%`,
                width: `${Math.max(renderWidth, 0.3)}%`,
                top: '2px',
                ...bgStyle,
            }}
            onClick={(e) => onClick(bar, e)}
            onContextMenu={(e) => onContextMenu(bar, e)}
            // Mobile Long Press
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchMove}
            // F2 – HTML5 Drag and Drop
            draggable={isDraggable}
            onDragStart={(e) => {
                if (!isDraggable) return;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', bar.shiftId);
                onDragStart?.(bar);
            }}
            onDragEnd={() => onDragEnd?.()}
            onDragOver={(e) => {
                if (isDragTarget) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                }
            }}
            onDrop={(e) => {
                e.preventDefault();
                if (isDragTarget) onDrop?.(bar);
            }}
        >
            {/* Internal circulation segments */}
            {width > 3 && bar.circulations.filter(c => c.type === 'circ').map((seg, i) => {
                const segStartLeft = ((seg.startMin - bar.startMin) / (bar.endMin - bar.startMin)) * 100;
                const segEndRight = ((seg.endMin - bar.startMin) / (bar.endMin - bar.startMin)) * 100;
                const segWidth = segEndRight - segStartLeft;
                return (
                    <div
                        key={i}
                        className="absolute top-0 bottom-0 bg-white/15 dark:bg-white/10 border-l border-white/20"
                        style={{ left: `${segStartLeft}%`, width: `${segWidth}%` }}
                    />
                );
            })}

            {/* Label inside bar */}
            {renderWidth > 2.5 && (
                <div className="absolute inset-0 flex flex-col items-start justify-center px-1.5 text-white select-none drop-shadow-sm leading-tight">
                        {(bar as any)._splitPercent ? (
                            <div className="absolute inset-0 overflow-hidden">
                                {/* Fixed ID layer (always at start) */}
                                <div className="absolute left-1.5 inset-y-0 flex items-center z-20">
                                    <span className="text-[9px] sm:text-[11px] font-black tracking-tight text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)] pr-1.5">{bar.shortId}</span>
                                    {bar.hasComments && (
                                        <div className="bg-white/95 text-indigo-700 rounded-full p-[2px] shadow-sm transform scale-90">
                                            <MessageSquare size={8} strokeWidth={3} />
                                        </div>
                                    )}
                                </div>
                                
                                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                                    {/* Layer 1: Titular Name (Always starts after ID, full width allowed) */}
                                    <div className="absolute inset-y-0 left-0 flex items-center pr-2" style={{ width: '100%' }}>
                                        <div className="pl-[2.3rem] min-w-0 flex items-center h-full"> {/* Exact space for ID */}
                                            {bar.originalDriverName && (
                                                <span className="text-[8px] font-bold text-white drop-shadow-md truncate leading-none">
                                                    {(() => {
                                                        const parts = bar.originalDriverName.split(',');
                                                        const surname = parts[0]?.trim() || '';
                                                        const name = parts[1]?.trim().split(' ')[0] || '';
                                                        return name ? `${name} ${surname}` : surname;
                                                    })()}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Layer 2: Covering Name (Starts at split point, covers Layer 1 if it overlaps) */}
                                    {(bar as any)._splitPercent > 0 && (
                                        <div 
                                            className={`absolute inset-y-0 h-full flex items-center gap-1 pl-1.5 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.2)] ${bar.coveringDriverName || !bar.isAssigned ? (bar.coveringExtraShiftId ? 'bg-purple-600' : 'bg-amber-600') : ''}`}
                                            style={{ 
                                                left: `${(bar as any)._splitPercent}%`,
                                                width: `${100 - (bar as any)._splitPercent}%` 
                                            }}
                                        >
                                            <span className="text-[7px] text-white/50 shrink-0">➔</span>
                                            {bar.coveringDriverName ? (
                                                <span className={`text-[8px] font-black text-white px-1.5 py-[2px] rounded-sm truncate leading-none border border-white/20 shadow-sm tracking-tight ${bar.coveringExtraShiftId ? 'bg-purple-500/50' : 'bg-amber-500/50'}`}>
                                                    {bar.coveringDriverName.split(',')[1]?.trim().split(' ')[0] || ''} {bar.coveringDriverName.split(',')[0]?.trim() || ''}
                                                </span>
                                            ) : (
                                                <span className="text-[7.5px] font-black text-white/95 uppercase tracking-tighter truncate drop-shadow-sm">
                                                    {bar.absType || 'DESCUBERT'}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 w-full pr-1 overflow-hidden">
                                <span className="text-[9px] sm:text-[11px] font-black tracking-tight shrink-0">{bar.shortId}</span>
                                {bar.hasComments && (
                                    <div className="relative flex items-center justify-center ml-0.5">
                                        <div className="absolute inset-0 bg-white/60 rounded-full blur-[2px]" />
                                        <div className="bg-white text-indigo-600 rounded-full p-[2px] shadow-sm border border-indigo-100 z-10">
                                            <MessageSquare size={8} strokeWidth={3} className="fill-indigo-100" />
                                        </div>
                                    </div>
                                )}
                                {bar.coveringDriverName ? (
                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                        <span className="text-[7px] text-white/50">➔</span>
                                        <span className="text-[7.5px] font-bold text-white bg-purple-600/90 px-1.5 py-[2px] rounded-md truncate leading-none border border-purple-400/50 shadow-sm tracking-wide">
                                            ↺ {bar.coveringExtraShiftId ? `${bar.coveringExtraShiftId} - ` : ''}
                                            {(() => {
                                                const parts = bar.coveringDriverName.split(',');
                                                const surname = parts[0]?.trim() || '';
                                                const name = parts[1]?.trim().split(' ')[0] || '';
                                                return name ? `${name} ${surname}` : surname;
                                            })()}
                                        </span>
                                    </div>
                                ) : (
                                    bar.driverName && renderWidth > 6 && (
                                        <span className="text-[7.5px] font-medium text-white/90 px-1 truncate leading-none">
                                            {(() => {
                                                const parts = bar.driverName.split(',');
                                                const surname = parts[0]?.trim();
                                                const name = parts[1]?.trim().split(' ')[0] || '';
                                                return name ? `${name} ${surname}` : surname;
                                            })()}
                                        </span>
                                    )
                                )}
                                {/* F2 – drag handle indicator */}
                                {isDraggable && (
                                    <span className="ml-auto text-[8px] opacity-50 select-none">⠿</span>
                                )}
                            </div>
                        )}
                    {bar.coveringShiftId && (
                        <span className="text-[7.5px] font-medium opacity-90 -mt-[1px] truncate max-w-full">
                            Cobreix {bar.coveringShiftId}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

export default GanttShiftBar;
