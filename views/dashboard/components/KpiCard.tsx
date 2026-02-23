import React from 'react';
import { Info } from 'lucide-react';

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
    className?: string;
}> = ({ label, value, subtitle, icon, color, pulse, trend, infoText, progress, className = '' }) => (
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
                        <div className="pointer-events-none absolute bottom-full -right-2 w-48 mb-2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                            <div className="bg-gray-900 border border-gray-700 text-white text-[11px] p-2 rounded-xl shadow-xl">
                                {infoText}
                            </div>
                            <div className="w-2 h-2 bg-gray-900 border-b border-r border-gray-700 transform rotate-45 absolute -bottom-1 right-3"></div>
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
                        <div className="text-sm sm:text-base lg:text-lg 2xl:text-xl font-bold text-[#4D5358] dark:text-white leading-tight uppercase tracking-wide transition-all">{label}</div>
                        {subtitle && <div className="text-[11px] sm:text-xs lg:text-sm 2xl:text-base font-medium text-gray-500 dark:text-gray-400 mt-1 lg:mt-1.5 leading-snug transition-all">{subtitle}</div>}
                    </div>
                </div>
            </div>
        ) : (
            <div className="relative z-10 mt-auto">
                <div className="text-3xl sm:text-4xl lg:text-5xl 2xl:text-6xl font-black tracking-tight text-[#4D5358] dark:text-white mt-1 lg:mt-4 transition-all duration-500" style={{ color }}>{value}</div>
                <div className="text-sm lg:text-base 2xl:text-lg font-bold text-[#4D5358] dark:text-gray-300 mt-1 lg:mt-3 uppercase tracking-wide transition-all">{label}</div>
                {subtitle && <div className="text-xs lg:text-sm 2xl:text-base text-gray-400 dark:text-gray-500 mt-0.5 lg:mt-1.5 font-medium transition-all">{subtitle}</div>}
            </div>
        )}
    </div>
);

export default KpiCard;
