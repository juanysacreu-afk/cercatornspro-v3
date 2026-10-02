
import React from 'react';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getFgcMinutes } from '../utils/time';
import { formatDelayMinSec, resolveStationId } from '../utils/stations';
import { STATION_GEO_MAP } from '../utils/stationGeoData';
import type { GipRegistrePas } from '../types';

interface ItineraryPointProps {
    point: any;
    isFirst?: boolean;
    isLast?: boolean;
    nextPoint?: any;
    nowMin: number;
    gipPassage?: GipRegistrePas;
}

export const ItineraryPoint: React.FC<ItineraryPointProps> = ({ 
    point, 
    isFirst, 
    isLast, 
    nextPoint, 
    nowMin,
    gipPassage 
}) => {
    const pTime = point.hora || point.sortida || point.arribada;
    const pMin = getFgcMinutes(pTime);
    const isNow = pTime && nowMin === pMin;

    let isTransit = false;
    if (nextPoint && pTime && nextPoint.hora) {
        const nextMin = getFgcMinutes(nextPoint.hora);
        if (nowMin > pMin && nowMin < nextMin) {
            isTransit = true;
        }
    }

    const stationCode = resolveStationId(point.nom || point.codi || '');
    const geoStation = STATION_GEO_MAP.get(stationCode);
    const stationFullName = geoStation?.name;
    const isCodeOnly = point.nom && point.nom.trim().length <= 3;

    return (
        <React.Fragment>
            <div className="relative flex items-center gap-3 sm:gap-6 py-3.5 group/point">
                <div className={`absolute left-[-30px] sm:left-[-50px] top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 bg-white dark:bg-gray-800 border-4 ${isFirst ? 'border-fgc-green' : isLast ? 'border-red-500/80 dark:border-red-600' : 'border-gray-300 dark:border-gray-700'} rounded-full z-10 shadow-sm`}>
                    {isNow && <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]" />}
                </div>
                <div className="w-16 sm:w-20 flex-shrink-0">
                    <p className={`text-sm sm:text-base font-black ${isNow ? 'text-red-500' : 'text-fgc-grey dark:text-gray-200'}`}>{pTime || '--:--'}</p>
                    {isNow && <p className="text-[10px] font-black text-red-500 animate-pulse">ARA</p>}
                </div>
                <div className={`flex-1 p-2.5 sm:p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0 ${isFirst ? 'bg-fgc-green/5 dark:bg-fgc-green/10 border-fgc-green/20 dark:border-fgc-green/20' : isLast ? 'bg-red-50/50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30' : 'border-gray-100 dark:border-white/5 bg-gray-50/40 dark:bg-white/[0.02] group-hover/point:bg-gray-100/60 dark:group-hover/point:bg-white/5'}`}>
                    {/* Station Name & Track */}
                    <div className="flex items-center gap-2 min-w-0">
                        <h5 className={`text-sm sm:text-base truncate ${isNow ? 'font-black text-red-600 dark:text-red-400' : 'font-bold text-fgc-grey dark:text-gray-200'}`}>
                            <span className="font-black">{point.nom}</span>
                            {isCodeOnly && stationFullName && (
                                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium ml-1.5 hidden md:inline">
                                    · {stationFullName}
                                </span>
                            )}
                            {point.via && (
                                <span className="opacity-50 dark:opacity-60 ml-1.5 text-xs sm:text-sm font-semibold">
                                    (V{point.via})
                                </span>
                            )}
                        </h5>
                    </div>

                    {/* GIP Real Time & Delay badge beside station */}
                    {gipPassage && (
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                            {/* Real Time Badge */}
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-white/10 text-xs font-semibold text-gray-700 dark:text-gray-200 font-mono shadow-xs">
                                <Clock size={12} className="text-gray-400 dark:text-gray-400 shrink-0" />
                                <span>Real <strong className="font-bold">{gipPassage.hora_real}</strong></span>
                            </div>

                            {/* Delay / Advance / On-time Badge */}
                            {gipPassage.diferencia_segons >= 60 ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs font-bold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 shadow-xs animate-in fade-in">
                                    <AlertTriangle size={12} className="shrink-0" />
                                    +{formatDelayMinSec(gipPassage.diferencia_segons)} retard
                                </span>
                            ) : gipPassage.diferencia_segons <= -60 ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-xs font-bold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 shadow-xs animate-in fade-in">
                                    -{formatDelayMinSec(Math.abs(gipPassage.diferencia_segons))} avanç
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 shadow-xs animate-in fade-in">
                                    <CheckCircle2 size={12} className="shrink-0" />
                                    En hora {gipPassage.diferencia_segons !== 0 ? `(${gipPassage.diferencia_segons > 0 ? `+${gipPassage.diferencia_segons}s` : `${gipPassage.diferencia_segons}s`})` : ''}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
            {isTransit && (
                <div className="relative h-12 flex items-center">
                    <div className="absolute left-[-30px] sm:left-[-50px] top-0 bottom-0 flex flex-col items-center justify-center w-6 h-6 sm:w-8 sm:h-8 z-20">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-bounce shadow-[0_0_12px_rgba(239,68,68,1)] border-2 border-white dark:border-gray-800" />
                    </div>
                    <div className="pl-16 sm:pl-20 text-[10px] font-black text-red-500 uppercase tracking-widest animate-pulse">EN TRAJECTE...</div>
                </div>
            )}
        </React.Fragment>
    );
};

