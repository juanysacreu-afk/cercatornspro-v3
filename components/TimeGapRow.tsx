
import React from 'react';
import { calculateGap, getFgcMinutes } from '../utils/time';

interface TimeGapRowProps {
    from: string;
    to: string;
    nowMin: number;
    id?: string;
}

export const TimeGapRow: React.FC<TimeGapRowProps> = ({ from, to, nowMin, id }) => {
    const minutes = calculateGap(from, to);
    if (minutes <= 0) return null;
    const isRest = minutes >= 15;
    const isActiveGap = nowMin >= getFgcMinutes(from) && nowMin < getFgcMinutes(to);

    return (
        <div id={id} className="px-8 py-2 flex justify-center items-center gap-4 animate-in fade-in duration-500 relative scroll-mt-24">
            <div className={`flex items-center gap-2 px-6 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider border transition-all ${isActiveGap
                    ? isRest
                        ? 'bg-fgc-green border-fgc-green/30 text-fgc-grey shadow-sm scale-105 ring-2 ring-fgc-grey/20'
                        : 'bg-yellow-400 border-yellow-500/30 text-fgc-grey shadow-sm scale-105 ring-2 ring-yellow-500/20'
                    : isRest
                        ? 'bg-fgc-green/15 text-fgc-grey dark:text-gray-300 border-fgc-green/30 dark:border-fgc-green/20'
                        : 'bg-gray-50 dark:bg-white/5 text-gray-400 dark:text-gray-500 border-gray-100 dark:border-white/5'
                }`}>
                {isActiveGap && <span className="w-1.5 h-1.5 rounded-full bg-fgc-grey dark:bg-black animate-pulse shadow-sm" />}
                <span>{isRest ? 'Descans:' : 'Temps:'} {minutes} min</span>
            </div>
        </div>
    );
};
