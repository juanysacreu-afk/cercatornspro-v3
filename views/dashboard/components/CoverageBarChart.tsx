import React, { useState } from 'react';

// ── CoverageBarChart (C1 extraction + V2: interactive tooltip) ─────────────
export const CoverageBarChart: React.FC<{ lineStatuses: any[] }> = ({ lineStatuses }) => {
    const order = ['L6', 'L7', 'L12', 'S1', 'S2'];
    const DEFAULT_COLORS: Record<string, string> = {
        'L6': '#7C73B4', 'L7': '#9D4900', 'L12': '#C3BDE0', 'S1': '#E46608', 'S2': '#80B134'
    };

    // V2 – tooltip state
    const [hoveredLine, setHoveredLine] = useState<string | null>(null);

    const sortedLines = order.map(linia => {
        const found = lineStatuses.find(ls => ls.linia.toUpperCase() === linia.toUpperCase());
        return found || {
            linia,
            color: DEFAULT_COLORS[linia] || '#4D5358',
            activeCirculations: 0,
            totalCirculations: 0,
            coveragePercent: 0,
            // V2 – include shift details if available
            shifts: [] as string[]
        };
    });

    const maxActive = Math.max(15, ...sortedLines.map(l => l.activeCirculations));

    return (
        <div className="relative flex-1 w-full h-full min-h-0 flex flex-col justify-between">
            {/* V2 – Hover tooltip */}
            {hoveredLine && (() => {
                const line = sortedLines.find(l => l.linia === hoveredLine);
                if (!line) return null;
                return (
                    <div className="absolute -top-14 left-1/2 -translate-x-1/2 z-50 animate-in fade-in zoom-in-95 duration-100 pointer-events-none">
                        <div className="bg-gray-900 border border-gray-700 text-white text-[11px] px-3 py-2 rounded-xl shadow-xl whitespace-nowrap">
                            <div className="font-bold text-sm" style={{ color: line.color }}>{line.linia}</div>
                            <div className="text-gray-300">
                                {line.totalCirculations > 0
                                    ? `${line.activeCirculations} actives de ${line.totalCirculations} (${line.coveragePercent}%)`
                                    : 'Sense circulacions detectades'}
                            </div>
                            {line.shifts && line.shifts.length > 0 && (
                                <div className="text-gray-400 text-[10px] mt-1">
                                    {line.shifts.slice(0, 4).join(', ')}{line.shifts.length > 4 ? '...' : ''}
                                </div>
                            )}
                        </div>
                        <div className="w-2 h-2 bg-gray-900 border-b border-r border-gray-700 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2" />
                    </div>
                );
            })()}

            <div className="flex items-stretch justify-between flex-1 w-full h-full min-h-[120px] pt-4 pb-0 px-1 sm:px-2 mt-2 gap-1 sm:gap-2">
                {sortedLines.map(line => {
                    const p = line.activeCirculations > 0 ? Math.min(100, Math.round((line.activeCirculations / maxActive) * 100)) : 0;
                    const isHovered = hoveredLine === line.linia;

                    return (
                        <div
                            key={line.linia}
                            className={`flex flex-col items-center justify-end gap-1.5 sm:gap-2 group flex-1 max-w-[48px] sm:max-w-[56px] h-full cursor-pointer transition-all duration-200 ${isHovered ? 'scale-110' : ''}`}
                            onMouseEnter={() => setHoveredLine(line.linia)}
                            onMouseLeave={() => setHoveredLine(null)}
                        >
                            <span className={`text-[10px] sm:text-xs font-bold tabular-nums text-center leading-tight transition-all duration-300 ${isHovered ? 'text-[#4D5358] dark:text-white scale-110' : 'text-gray-400 dark:text-gray-500'}`}>
                                {line.totalCirculations > 0 ? line.activeCirculations : '-'}<br />
                                <span className="opacity-50">/ {line.totalCirculations > 0 ? line.totalCirculations : '-'}</span>
                            </span>
                                <div className="relative flex-1 w-full min-h-[30px] bg-gray-100 dark:bg-white/5 rounded-t-xl overflow-hidden shadow-inner flex items-end">
                                <div
                                    className="w-full rounded-t-xl transition-all duration-1000 ease-out flex items-start justify-center pt-2 relative overflow-hidden"
                                    style={{
                                        height: p > 0 ? `${Math.max(8, p)}%` : '4px',
                                        backgroundColor: line.color,
                                        opacity: p > 0 ? (isHovered ? 1 : 1) : 0.3,
                                        filter: isHovered ? `drop-shadow(0 0 8px ${line.color}80)` : 'none',
                                    }}
                                >
                                    <div className="absolute top-0 left-0 w-full h-1/4 bg-white/20" />
                                </div>
                            </div>
                            <div
                                className={`w-8 sm:w-10 h-6 sm:h-7 rounded-lg flex items-center justify-center text-white font-black text-[10px] sm:text-[11px] shadow-sm transition-all duration-300 ${isHovered ? '-translate-y-1 shadow-lg' : ''}`}
                                style={{ backgroundColor: line.color, opacity: p > 0 ? 1 : 0.5 }}
                            >
                                {line.linia}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CoverageBarChart;
