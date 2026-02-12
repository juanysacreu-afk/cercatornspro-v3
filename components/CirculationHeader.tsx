
import React from 'react';

interface CirculationHeaderProps {
    isStationView?: boolean;
}

export const CirculationHeader: React.FC<CirculationHeaderProps> = ({ isStationView = false }) => (
    <div className="hidden md:grid grid-cols-[1fr_1.2fr_1.8fr_1.2fr_1.2fr] items-center gap-4 px-4 py-3 border-b border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-black/40 sticky top-0 z-10 transition-all">
        <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-2">Codi / Línia</div>
        <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center">Cicle / Unitat</div>
        <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center">{isStationView ? 'Maquinista' : 'Sortida (Estació i Via)'}</div>
        <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center font-bold text-fgc-green">{isStationView ? 'Hora de pas' : 'Arribada (Estació i Via)'}</div>
        <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right px-4">Estat / Detalls</div>
    </div>
);
