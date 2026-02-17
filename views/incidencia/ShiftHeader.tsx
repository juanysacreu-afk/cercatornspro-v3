import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { feedback } from '../../utils/feedback';
import { IncidenciaMode } from '../../types';

interface ShiftHeaderProps {
    mode: IncidenciaMode;
    selectedServei: string;
    onServeiChange: (servei: string) => void;
    serveiTypes: string[];
}

const ShiftHeader: React.FC<ShiftHeaderProps> = ({
    mode,
    selectedServei,
    onServeiChange,
    serveiTypes
}) => {
    return (
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 parallax-slow animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-red-500 rounded-2xl text-white shadow-xl shadow-red-500/20 shrink-0 aspect-square flex items-center justify-center live-pulse">
                    <ShieldAlert size={28} />
                </div>
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-[#4D5358] dark:text-white tracking-tight title-glow uppercase">
                        Gestió d'Incidències
                    </h1>
                    <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 font-medium pb-1 tracking-tight">
                        Anàlisi de talls, cobertures i Pla de Servei Alternatiu.
                    </p>
                </div>
            </div>
            {mode !== 'INIT' && (
                <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">
                        Filtre de Servei
                    </span>
                    <div className="inline-flex glass-card p-1 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">
                        {['Tots', ...serveiTypes].map((s) => (
                            <button
                                key={s}
                                onClick={() => {
                                    feedback.deepClick();
                                    onServeiChange(s);
                                }}
                                className={`px-3 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${selectedServei === s
                                    ? 'bg-fgc-grey dark:bg-fgc-green dark:text-[#4D5358] text-white shadow-lg'
                                    : 'text-gray-400 dark:text-gray-500 hover:bg-white/10'
                                    }`}
                            >
                                {s === 'Tots' ? 'Tots' : `S-${s}`}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </header>
    );
};

export default ShiftHeader;
