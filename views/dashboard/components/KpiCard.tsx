import React from 'react';
import { Info } from 'lucide-react';

// ── Inline Sparkline SVG ───────────────────────────────────────────────────
// Renders a mini trend chart as an SVG polyline from an array of values.
// Data is normalised to the viewBox height. No external lib required.
const Sparkline: React.FC<{ data: number[]; color: string; height?: number }> = ({
    data,
    color,
    height = 28,
}) => {
    if (!data || data.length < 2) return null;
    const width = 64;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pad = 3;

    const points = data
        .map((v, i) => {
            const x = pad + (i / (data.length - 1)) * (width - pad * 2);
            const y = pad + ((1 - (v - min) / range) * (height - pad * 2));
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

    // Area fill (semi-transparent)
    const firstX = pad;
    const lastX = (width - pad).toFixed(1);
    const bottomY = height - pad;
    const areaPoints = `${firstX},${bottomY} ${points} ${lastX},${bottomY}`;

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="shrink-0 opacity-70"
            aria-hidden="true"
        >
            <polygon points={areaPoints} fill={color} fillOpacity="0.12" />
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* Last point dot */}
            {(() => {
                const lastPair = points.split(' ').pop()!.split(',');
                return (
                    <circle
                        cx={lastPair[0]}
                        cy={lastPair[1]}
                        r="2.5"
                        fill={color}
                    />
                );
            })()}
        </svg>
    );
};

// ── KpiCard (C1 extraction) ────────────────────────────────────────────────
export const KpiCard: React.FC<{
    label: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactNode;
    color: string;
    pulse?: boolean;
    trend?: 'up' | 'down' | 'neutral';
    infoText?: string;
    progress?: number;
    /** Historical samples for the sparkline (last N readings, newest last) */
    sparklineData?: number[];
    className?: string;
}> = ({ label, value, subtitle, icon, color, pulse, trend, infoText, progress, sparklineData, className = '' }) => (
    <div className={`relative rounded-3xl p-5 sm:p-6 transition-all duration-500 hover:scale-[1.02] hover:shadow-xl
        bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/5
        shadow-[0_4px_24px_0_rgba(31,38,135,0.06)] dark:shadow-[0_4px_24px_0_rgba(0,0,0,0.25)] flex flex-col justify-between ${className}`}
    >
        {/* Accent Glow */}
        <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
            <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-3xl opacity-20" style={{ backgroundColor: color }} />
        </div>

        <div className="relative z-10 flex items-start justify-between mb-3">
            <div className="p-2.5 rounded-2xl" style={{ backgroundColor: color + '18' }}>
                <span style={{ color }}>{icon}</span>
            </div>

            <div className="flex items-center gap-2">
                {pulse && (
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                    </span>
                )}
                {trend && trend !== 'neutral' && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${trend === 'up' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'}`}>
                        {trend === 'up' ? '↑' : '↓'}
                    </span>
                )}
                {infoText && (
                    <div className="group relative">
                        <Info size={16} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-help" />
                        <div className="pointer-events-none absolute bottom-full -right-2 w-64 mb-3 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0 z-[100]">
                            <div className="bg-gray-900/95 dark:bg-gray-800/95 border border-gray-700 dark:border-gray-600 text-white text-[11px] p-3 rounded-xl shadow-2xl backdrop-blur-md">
                                {infoText}
                            </div>
                            <div className="w-2.5 h-2.5 bg-gray-900/95 dark:bg-gray-800/95 border-b border-r border-gray-700 dark:border-gray-600 transform rotate-45 absolute -bottom-1.5 right-4"></div>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {progress !== undefined ? (
            <div className="relative z-10 flex flex-col justify-end mt-1 sm:mt-2 lg:mt-auto mb-0.5">
                <div className="flex flex-col xl:flex-row items-start xl:items-center gap-3 sm:gap-4 lg:gap-6">
                    <div className="relative w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] lg:w-[100px] lg:h-[100px] 2xl:w-[120px] 2xl:h-[120px] shrink-0 transition-all duration-500">
                        <svg className="w-full h-full transform -rotate-90 drop-shadow-sm" viewBox="0 0 36 36">
                            <path
                                className="text-black/5 dark:text-white/5"
                                strokeWidth="3"
                                stroke="currentColor"
                                fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                            <path
                                strokeDasharray={`${progress}, 100`}
                                strokeWidth="3"
                                strokeLinecap="round"
                                stroke={color}
                                fill="none"
                                className="transition-all duration-1000 ease-out"
                                style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.15))' }}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-xl sm:text-2xl lg:text-3xl 2xl:text-[34px] font-black leading-none tracking-tighter translate-y-[2px]" style={{ color }}>
                                {progress}<span className="text-[10px] sm:text-sm lg:text-base 2xl:text-lg tracking-normal font-bold opacity-70 ml-[2px]">%</span>
                            </span>
                        </div>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm lg:text-base font-bold text-[#4D5358] dark:text-white leading-tight uppercase tracking-wide transition-all truncate" title={label}>{label}</div>
                        {subtitle && <div className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 mt-1 lg:mt-1.5 leading-snug transition-all truncate" title={subtitle}>{subtitle}</div>}
                        {/* Sparkline below the label for progress cards */}
                        {sparklineData && sparklineData.length >= 2 && (
                            <div className="mt-2">
                                <Sparkline data={sparklineData} color={color} height={24} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        ) : (
            <div className="relative z-10 mt-auto">
                <div className="flex flex-row items-end justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="text-3xl sm:text-4xl font-black tracking-tight text-[#4D5358] dark:text-white mt-1 lg:mt-4 transition-all duration-500 truncate" style={{ color }}>{value}</div>
                        <div className="text-sm lg:text-sm 2xl:text-lg font-bold text-[#4D5358] dark:text-gray-300 mt-1 lg:mt-3 uppercase tracking-wide transition-all truncate" title={label}>{label}</div>
                        {subtitle && <div className="text-[10px] sm:text-xs lg:text-sm 2xl:text-base text-gray-400 dark:text-gray-500 mt-0.5 lg:mt-1.5 font-medium transition-all truncate" title={subtitle}>{subtitle}</div>}
                    </div>
                    {/* Sparkline aligned right for value cards - hidden on very small screens if it doesn't fit */}
                    {sparklineData && sparklineData.length >= 2 && (
                        <div className="flex-none pb-1">
                            <Sparkline data={sparklineData} color={color} height={28} />
                        </div>
                    )}
                </div>
            </div>
        )}
    </div>
);

export default KpiCard;
