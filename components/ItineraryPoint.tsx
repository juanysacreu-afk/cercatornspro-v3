
import React from 'react';
import { getFgcMinutes } from '../utils/time';

interface ItineraryPointProps {
    point: any;
    isFirst?: boolean;
    isLast?: boolean;
    nextPoint?: any;
    nowMin: number;
}

export const ItineraryPoint: React.FC<ItineraryPointProps> = ({ point, isFirst, isLast, nextPoint, nowMin }) => {
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

    return (
        <React.Fragment>
            <div className="relative flex items-center gap-4 sm:gap-8 py-4 group/point">
                <div className={`absolute left-[-30px] sm:left-[-50px] top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 sm:w-8 h-8 bg-white dark:bg-gray-800 border-4 ${isFirst ? 'border-fgc-green' : isLast ? 'border-red-50 dark:border-red-900/30' : 'border-gray-300 dark:border-gray-700'} rounded-full z-10`}>
                    {isNow && <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]" />}
                </div>
                <div className="w-16 sm:w-24 flex-shrink-0">
                    <p className={`text-base sm:text-xl font-black ${isNow ? 'text-red-500' : 'text-fgc-grey dark:text-gray-200'}`}>{pTime || '--:--'}</p>
                    {isNow && <p className="text-[10px] font-black text-red-500">ARA</p>}
                </div>
                <div className={`flex-1 p-2 sm:p-3 rounded-xl border transition-all ${isFirst ? 'bg-fgc-green/5 dark:bg-fgc-green/10 border-fgc-green/20 dark:border-fgc-green/20' : isLast ? 'bg-red-50/50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30' : 'border-transparent group-hover/point:bg-gray-50 dark:group-hover/point:bg-white/5'}`}>
                    <h5 className={`text-sm sm:text-lg ${isNow ? 'font-black text-red-600' : 'font-bold text-fgc-grey dark:text-gray-300'}`}>{point.nom} {point.via && <span className="opacity-40 dark:opacity-50 ml-1">(V{point.via})</span>}</h5>
                </div>
            </div>
            {isTransit && (
                <div className="relative h-12 flex items-center">
                    <div className="absolute left-[-30px] sm:left-[-50px] top-0 bottom-0 flex flex-col items-center justify-center w-6 h-6 sm:w-8 h-8 z-20">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-bounce shadow-[0_0_12px_rgba(239,68,68,1)] border-2 border-white dark:border-gray-800" />
                    </div>
                    <div className="pl-16 sm:pl-24 text-[10px] font-black text-red-500 uppercase tracking-widest animate-pulse">EN TRAJECTE...</div>
                </div>
            )}
        </React.Fragment>
    );
};
