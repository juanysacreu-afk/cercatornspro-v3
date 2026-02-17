import React, { useState } from 'react';
import { Bell, Repeat, RotateCcw, Move, Coffee, Phone, MapPin } from 'lucide-react';
import { LivePersonnel } from '../../types';

interface ListPersonnelRowProps {
    item: LivePersonnel;
    variant: 'normal' | 'affected';
    isDisplaced?: boolean;
    manualOverrides: Record<string, string>;
    setManualOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    openMenuId: string | null;
    setOpenMenuId: (id: string | null) => void;
    dividedPersonnel: Record<string, { list: LivePersonnel[], stations: Set<string>, isUnified: boolean, label: string }> | null;
    isPrivacyMode: boolean;
}

const ListPersonnelRow: React.FC<ListPersonnelRowProps> = ({
    item,
    variant,
    isDisplaced,
    manualOverrides,
    setManualOverrides,
    openMenuId,
    setOpenMenuId,
    dividedPersonnel,
    isPrivacyMode
}) => {
    const isRest = item.type === 'REST';

    return (
        <div className={`px-4 py-2.5 flex items-center justify-between transition-all group hover:bg-gray-50 dark:hover:bg-white/5 ${variant === 'affected' ? 'bg-red-50/20' : ''}`}>
            <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
                {isDisplaced && (
                    <div className="flex items-center justify-center p-2 bg-red-500 rounded-xl text-white shadow-lg animate-pulse" title="Maquinista desplaçat de la seva zona d'inici">
                        <Bell size={16} fill="currentColor" />
                    </div>
                )}
                {(!isRest && (variant === 'affected' || manualOverrides[item.id])) && (
                    <div className="relative">
                        <button
                            onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                            className={`p-2 rounded-xl transition-all shadow-sm flex items-center justify-center ${openMenuId === item.id ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-500' : manualOverrides[item.id] ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-[#fff1e6] text-[#f97316] hover:bg-[#ffe2cc]'}`}
                            title={manualOverrides[item.id] ? "Mogut manualment" : "Moure a una altra zona"}
                        >
                            <Repeat size={16} />
                        </button>

                        {openMenuId === item.id && (
                            <div className="absolute left-0 top-full mt-2 w-56 sm:w-64 bg-white dark:bg-fgc-grey rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 z-[300] py-4 animate-in fade-in slide-in-from-top-2">
                                <div className="px-4 pb-3 border-b border-gray-50 dark:border-white/5 mb-2">
                                    <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Moure {item.id} a...</p>
                                </div>
                                <div className="flex flex-col">
                                    {manualOverrides[item.id] && (
                                        <button
                                            onClick={() => {
                                                setManualOverrides(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                                                setOpenMenuId(null);
                                            }}
                                            className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-left group mb-2 mx-2 rounded-xl"
                                        >
                                            <RotateCcw size={14} className="text-red-500" />
                                            <span className="text-xs font-black text-red-600 dark:text-red-400 uppercase">Restaurar Original</span>
                                        </button>
                                    )}
                                    {[
                                        { id: 'BCN', label: 'Costat Pl. Catalunya', target: 'PC' },
                                        { id: 'VALLES', label: 'Costat Vallès (S1 + S2)', target: 'SC' },
                                        { id: 'S1', label: 'Ramal Terrassa S1', target: 'NA' },
                                        { id: 'S2', label: 'Ramal Sabadell S2', target: 'PN' },
                                        { id: 'L6', label: 'Reina Elisenda L12', target: 'RE' },
                                        { id: 'L7', label: 'Ramal Tibidabo', target: 'TB' }
                                    ].map((dest) => {
                                        const island = dividedPersonnel?.[dest.id];
                                        const vallesUnified = dividedPersonnel?.VALLES.isUnified;

                                        // Filtres segons topologia
                                        if (dest.id === 'VALLES' && !vallesUnified) return null;
                                        if ((dest.id === 'S1' || dest.id === 'S2') && vallesUnified) return null;

                                        if (!island || island.stations.size === 0) return null;

                                        // Determinar estació de destí real dins de l'illa si la preferida no hi és
                                        const finalTarget = island.stations.has(dest.target) ? dest.target : Array.from(island.stations)[0];

                                        return (
                                            <button
                                                key={dest.id}
                                                onClick={() => {
                                                    setManualOverrides(prev => ({ ...prev, [item.id]: finalTarget }));
                                                    setOpenMenuId(null);
                                                }}
                                                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left group"
                                            >
                                                <Move size={14} className="text-gray-400 group-hover:text-blue-500" />
                                                <span className="text-xs font-black text-fgc-grey dark:text-gray-200 uppercase">{dest.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
                <div className={`min-w-[60px] sm:min-w-[75px] px-2 py-1 rounded-lg text-[10px] sm:text-xs font-black text-white text-center shadow-sm flex items-center justify-center gap-1.5 ${isRest ? 'bg-fgc-green border border-fgc-green/30 text-fgc-grey' : ''}`} style={isRest ? {} : { backgroundColor: item.color }}>
                    {isRest ? <Coffee size={12} /> : null} {isRest ? 'DES' : item.id}
                </div>
                <div className="bg-fgc-grey dark:bg-black text-white px-2 py-1 rounded text-[9px] sm:text-[10px] font-black min-w-[45px] text-center shrink-0 border border-white/10">{item.torn}</div>
                <p className={`text-[12px] sm:text-sm font-bold truncate uppercase ${variant === 'affected' ? 'text-red-700 dark:text-red-400 font-black' : isRest ? 'text-fgc-green font-black' : 'text-fgc-grey dark:text-gray-300'}`}>{item.driver}</p>
                <div className="hidden md:flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest"><MapPin size={10} className="text-gray-300" /> {item.stationId}</div>
            </div>
            <div className="flex items-center gap-2 pl-4">
                {item.phones && item.phones.length > 0 && (
                    <a href={isPrivacyMode ? undefined : `tel:${item.phones[0]}`} className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all shadow-sm ${variant === 'affected' ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-100 dark:bg-black text-fgc-grey dark:text-gray-400 hover:bg-fgc-green hover:text-white'} ${isPrivacyMode ? 'cursor-default' : ''}`}>
                        <Phone size={12} /> <span className="hidden sm:inline text-[10px] font-black">{isPrivacyMode ? '*** ** ** **' : item.phones[0]}</span>
                    </a>
                )}
            </div>
        </div>
    );
};

export default ListPersonnelRow;
