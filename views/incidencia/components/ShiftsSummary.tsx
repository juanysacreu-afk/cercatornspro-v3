import React from 'react';
import { Clock, User, Coffee, ShieldAlert, CheckCircle2, AlertCircle, Inbox } from 'lucide-react';

interface ShiftsSummaryProps {
    generatedCircs: any[];
}

const ShiftsSummary: React.FC<ShiftsSummaryProps> = ({ generatedCircs }) => {
    const driversMap: Record<string, any> = {};

    generatedCircs.forEach(c => {
        const tId = c.torn === '---' ? 'UNASSIGNED' : c.torn;
        if (!driversMap[tId]) {
            driversMap[tId] = {
                driver: c.torn === '---' ? 'SENSE MAQUINISTA' : c.driver,
                torn: c.torn === '---' ? '---' : c.torn,
                start: c.shiftStart || '---',
                end: c.shiftEnd || '---',
                trips: [],
                totalMinutes: 0
            };
        }
        driversMap[tId].trips.push(c);
    });

    const driverStats = Object.values(driversMap).map(d => {
        const sorted = d.trips.sort((a: any, b: any) => {
            const getT = (t: string) => {
                const p = t.split(':');
                let min = parseInt(p[0]) * 60 + parseInt(p[1]);
                if (parseInt(p[0]) < 4) min += 24 * 60;
                return min;
            };
            return getT(a.sortida) - getT(b.sortida);
        });
        let totalDrive = 0;
        sorted.forEach((t: any) => {
            const getT = (timeStr: string) => {
                const parts = timeStr.split(':');
                let min = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                if (parseInt(parts[0]) < 4) min += 24 * 60;
                return min;
            };
            const m1 = getT(t.sortida);
            const m2 = getT(t.arribada);
            totalDrive += (m2 - m1);
        });
        return { ...d, totalDrive };
    });

    if (driverStats.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-gray-50 dark:bg-black/20 rounded-[32px] border border-dashed border-gray-200 dark:border-white/10">
                <div className="p-4 bg-gray-100 dark:bg-white/5 rounded-full mb-4">
                    <Inbox size={32} className="text-gray-400" />
                </div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">No s'han assignat torns encara</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom duration-500 pb-12">
            {driverStats.map((d, idx) => {
                const isOverLimit = d.totalDrive > 120; // Example limit for visualization
                return (
                    <div key={idx} className="bg-white dark:bg-gray-900 rounded-[32px] border border-gray-100 dark:border-white/5 shadow-sm p-6 hover:shadow-xl hover:shadow-blue-500/5 transition-all group overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[40px] rounded-full -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-colors" />
                        <div className="relative">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-gray-50 dark:bg-white/5 flex items-center justify-center text-[#4D5358] dark:text-gray-400 group-hover:bg-blue-500 group-hover:text-white transition-all">
                                        <User size={20} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-heavy text-[#4D5358] dark:text-white uppercase tracking-wider truncate max-w-[140px]">{d.driver}</span>
                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{d.torn}</span>
                                    </div>
                                </div>
                                <div className={`p-2 rounded-xl border ${isOverLimit ? 'bg-red-50 border-red-100 text-red-500' : 'bg-green-50 border-green-100 text-green-500'} dark:bg-opacity-10 dark:border-opacity-10`}>
                                    {isOverLimit ? <ShieldAlert size={16} /> : <CheckCircle2 size={16} />}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="flex flex-col gap-1 p-3 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5">
                                    <span className="text-[8px] font-heavy text-gray-400 uppercase tracking-widest">Jornada</span>
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#4D5358] dark:text-white">
                                        <Clock size={12} className="text-blue-500" />
                                        <span>{d.start} - {d.end}</span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1 p-3 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5">
                                    <span className="text-[8px] font-heavy text-gray-400 uppercase tracking-widest">Conducció</span>
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#4D5358] dark:text-white">
                                        <Coffee size={12} className="text-orange-500" />
                                        <span>{Math.floor(d.totalDrive / 60)}h {d.totalDrive % 60}m</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between text-[8px] font-heavy text-gray-400 uppercase tracking-[0.2em]">
                                    <span>Seqüència de Viatges</span>
                                    <span>{d.trips.length} SERVEIS</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {d.trips.map((t: any, tidx: number) => (
                                        <div
                                            key={tidx}
                                            className="px-2.5 py-1.5 rounded-xl bg-gray-50 dark:bg-black/30 border border-gray-100 dark:border-white/5 text-[9px] font-bold text-gray-500 dark:text-gray-400 hover:border-blue-500/30 hover:text-blue-500 transition-all cursor-default"
                                            title={`${t.sortida} - ${t.arribada} | ${t.route}`}
                                        >
                                            {t.id}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {isOverLimit && (
                                <div className="mt-6 p-3 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 flex items-center gap-3">
                                    <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                                    <p className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase">Supera límit de 2h de conducció continuada</p>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ShiftsSummary;
