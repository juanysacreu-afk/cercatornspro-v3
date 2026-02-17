import React from 'react';
import { Phone, ArrowRight } from 'lucide-react';

interface CompactViatgerRowProps {
    torn: any;
    viatgerCirc: any;
    colorClass: string;
    label?: React.ReactNode;
    isPrivacyMode: boolean;
}

const CompactViatgerRow: React.FC<CompactViatgerRowProps> = ({
    torn,
    viatgerCirc,
    colorClass,
    label,
    isPrivacyMode
}) => {
    const isBlue = colorClass.includes('blue');
    const isPurple = colorClass.includes('purple');
    const bgClass = isBlue ? 'bg-blue-50 dark:bg-blue-950/20' : (isPurple ? 'bg-purple-50 dark:bg-purple-950/20' : 'bg-fgc-grey/10 dark:bg-black');
    const textClass = isBlue ? 'text-blue-600' : (isPurple ? 'text-purple-600' : 'text-fgc-grey dark:text-gray-300');
    const btnBg = isBlue ? 'bg-blue-500 hover:bg-blue-600' : (isPurple ? 'bg-purple-500 hover:bg-purple-600' : 'bg-fgc-grey hover:bg-fgc-dark');
    const arrowColor = isBlue ? 'text-blue-300' : (isPurple ? 'text-purple-300' : 'text-gray-300');

    return (
        <div className={`bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all flex items-center gap-4 border-l-4 ${colorClass}`}>
            <div className={`h-10 min-w-[2.5rem] px-2 ${bgClass} ${textClass} rounded-xl flex items-center justify-center font-black text-xs shadow-sm shrink-0 whitespace-nowrap`}>{torn.id}</div>
            <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-6">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-fgc-grey dark:text-gray-200 truncate">{torn.drivers?.[0]?.cognoms}, {torn.drivers?.[0]?.nom}</p>
                        {label}
                    </div>
                    <p className="text-[8px] font-black text-gray-300 dark:text-gray-600 uppercase tracking-widest whitespace-nowrap">Nom. {torn.drivers?.[0]?.nomina} {torn.drivers?.[0]?.tipus_torn ? `(${torn.drivers?.[0].tipus_torn})` : ''}</p>
                </div>
                <div className={`flex items-center gap-3 shrink-0 ${textClass}`}>
                    <div className={`flex items-center gap-1.5 ${bgClass} px-3 py-1 rounded-lg border border-opacity-50 transition-colors`}>
                        <span className={`text-[10px] font-black uppercase whitespace-nowrap`}>{viatgerCirc?.machinistInici || '--'}</span>
                        <ArrowRight size={10} className={arrowColor} />
                        <span className={`text-[10px] font-black uppercase whitespace-nowrap`}>{viatgerCirc?.machinistFinal || '--'}</span>
                    </div>
                    <div className="text-[10px] font-bold text-gray-400 dark:text-gray-600 min-w-[70px] whitespace-nowrap">{torn.inici_torn} - {torn.final_torn}</div>
                </div>
            </div>
            <div className="flex gap-1 shrink-0">{torn.drivers?.[0]?.phones?.map((p: string, i: number) => (<a key={i} href={isPrivacyMode ? undefined : `tel:${p}`} className={`w-8 h-8 ${btnBg} text-white rounded-lg flex items-center justify-center transition-all shadow-sm ${isPrivacyMode ? 'cursor-default' : ''}`}><Phone size={12} /></a>))}</div>
        </div>
    );
};

export default CompactViatgerRow;
