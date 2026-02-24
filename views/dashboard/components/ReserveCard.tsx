import React, { useState } from 'react';
import { ChevronRight, History } from 'lucide-react';
import type { ReserveSlot } from '../hooks/useDashboardData';
import { feedback } from '../../../utils/feedback';

// ── ReserveCard (C1 extraction + F4: expanded history) ─────────────────────
export const ReserveCard: React.FC<{ slot: ReserveSlot }> = ({ slot }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const stationColors: Record<string, string> = {
        'PC': '#1B79C9', 'SR': '#9C56B4', 'RB': '#E85D8A', 'RE': '#9C56B4',
        'NA': '#F97316', 'PN': '#A8D017'
    };
    const color = stationColors[slot.station] || '#6B7280';

    return (
        <div className="flex flex-col gap-2">
            <div
                onClick={() => {
                    if (slot.count > 0) {
                        feedback.click();
                        setIsExpanded(!isExpanded);
                    }
                }}
                className={`flex items-center gap-3 p-3 rounded-2xl bg-white/60 dark:bg-white/[0.03] border border-white/20 dark:border-white/5 transition-all outline-none ${slot.count > 0 ? 'cursor-pointer hover:shadow-md hover:scale-[1.01] active:scale-[0.99] group' : ''}`}
            >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm" style={{ backgroundColor: color }}>
                    {slot.station}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-[#4D5358] dark:text-white leading-tight">{slot.stationLabel}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate opacity-80">
                        {slot.personnel.map(p => `${p.cognoms}`).join(', ')}
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-lg font-black text-[#4D5358] dark:text-white leading-none">{slot.count}</span>
                    {slot.count > 0 && (
                        <ChevronRight
                            size={14}
                            className={`text-gray-300 transition-transform duration-300 ${isExpanded ? 'rotate-90 text-fgc-green' : 'group-hover:translate-x-0.5'}`}
                        />
                    )}
                </div>
            </div>

            {/* F4 – Expanded detail with assignment history */}
            {isExpanded && slot.count > 0 && (
                <div className="grid grid-cols-1 gap-1.5 ml-1 pt-1 animate-in slide-in-from-top-1 duration-300">
                    {/* Header */}
                    <div className="flex items-center gap-1.5 px-3 pb-1">
                        <History size={11} className="text-gray-400" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Reserves actives ara</span>
                    </div>

                    {slot.personnel.map((p, idx) => (
                        <div
                            key={idx}
                            className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-gray-50/50 dark:bg-white/[0.02] border border-gray-100/50 dark:border-white/[0.02]"
                            style={{ animationDelay: `${idx * 40}ms` }}
                        >
                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-bold text-[#4D5358] dark:text-gray-200">
                                    {p.nom} {p.cognoms}
                                </span>
                                {/* F4 – Assignment history row */}
                                {slot.assignmentHistory && slot.assignmentHistory[p.torn] && (
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                        Historial: {slot.assignmentHistory[p.torn].join(' → ')}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="px-2 py-0.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-white/5 shadow-sm">
                                    <span className="text-[10px] font-black text-fgc-green uppercase tracking-wider">
                                        {p.torn}
                                    </span>
                                </div>
                                {p.isBusy && (
                                    <div className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                                        <span className="text-[8px] font-black text-amber-700 dark:text-amber-400 uppercase">Ocupat</span>
                                    </div>
                                )}
                                {/* Status dot */}
                                {p.isActive !== undefined && (
                                    <span className={`w-2 h-2 rounded-full ${p.isBusy ? 'bg-amber-400' : (p.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-300')}`} />
                                )}
                            </div>
                        </div>
                    ))}

                    {/* F4 – Previous assignments section */}
                    {slot.previousAssignments && slot.previousAssignments.length > 0 && (
                        <>
                            <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
                                <History size={11} className="text-gray-300" />
                                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">Assignacions del dia</span>
                            </div>
                            {slot.previousAssignments.map((pa, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between py-2 px-4 rounded-xl bg-gray-50/30 dark:bg-white/[0.01] border border-gray-100/30 dark:border-white/[0.01] opacity-70"
                                >
                                    <span className="text-[11px] text-gray-500 dark:text-gray-500">
                                        {pa.nom} {pa.cognoms}
                                    </span>
                                    <span className="text-[10px] font-bold text-gray-400 font-mono">{pa.torn}</span>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default ReserveCard;
