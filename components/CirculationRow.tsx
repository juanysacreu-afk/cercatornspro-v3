
import React from 'react';
import { Phone, AlertTriangle, Camera, FileText, Brush, BookOpen, Settings, Radio } from 'lucide-react';
import { checkIfActive } from '../utils/time';

interface CirculationRowProps {
    circ: any;
    itemKey: string;
    nowMin: number;
    trainStatuses: Record<string, any>;
    getTrainPhone: (train: string) => string | null;
    getLiniaColor: (linia: string) => string;
    openUnitMenu: (circ: any, cycleId: string) => void;
    toggleItinerari: (id: string) => void;
    isPrivacyMode: boolean;
}

export const CirculationRow: React.FC<CirculationRowProps> = ({
    circ,
    itemKey,
    nowMin,
    trainStatuses,
    getTrainPhone,
    getLiniaColor,
    openUnitMenu,
    toggleItinerari,
    isPrivacyMode
}) => {
    const trainPhone = getTrainPhone(circ.train);
    const isActive = checkIfActive(circ.sortida, circ.arribada, nowMin);
    const status = circ.train ? trainStatuses[circ.train] : null;
    const isBroken = status?.is_broken;
    const needsImages = status?.needs_images;
    const needsRecords = status?.needs_records;
    const needsCleaning = status?.needs_cleaning;
    const isViatger = circ.codi === 'Viatger';

    return (
        <div id={`circ-row-${itemKey}`} className={`p-2 sm:p-4 grid grid-cols-[auto_1fr_1fr_auto] md:grid-cols-[1fr_1.2fr_1.8fr_1.8fr_1.2fr] items-center gap-2 sm:gap-4 w-full relative transition-all scroll-mt-24 ${isActive ? 'bg-red-50/30 dark:bg-red-950/20' : isBroken ? 'bg-red-50/20 dark:bg-red-950/10 shadow-inner' : ''}`}>
            <div className="flex items-center gap-2 overflow-visible px-1">
                <button
                    onClick={() => circ.cicle && openUnitMenu(circ, circ.cicle)}
                    className={`px-2.5 py-1.5 ${isViatger ? 'bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800' : getLiniaColor(circ.linia)} rounded-lg font-black text-xs sm:text-sm shadow-sm flex items-center justify-center min-w-[62px] hover:scale-105 active:scale-95 transition-transform group relative`}
                    title="Gestionar Unitat"
                >
                    {isViatger ? (
                        <div className="flex flex-col items-center justify-center leading-none py-0.5">
                            <span className="text-[7.5px] font-black text-sky-600 dark:text-sky-400 tracking-tighter uppercase mb-0.5">VIATGER</span>
                            <span className="text-[11px] font-black text-sky-800 dark:text-sky-100">{circ.realCodi || '---'}</span>
                        </div>
                    ) : (
                        <span className="text-white">{circ.codi}</span>
                    )}
                    {circ.cicle && <div className="absolute -top-1 -right-1 bg-white dark:bg-black rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"><Settings size={8} className="text-fgc-grey dark:text-gray-400" /></div>}
                </button>
                <span className={`hidden md:flex px-2 py-1 ${getLiniaColor(circ.linia)} text-white rounded-md font-black text-[9px] sm:text-[11px] shadow-sm flex-shrink-0`}>{circ.linia || '??'}</span>
                {circ.train && trainPhone && (
                    <a href={isPrivacyMode ? undefined : `tel:${trainPhone}`} onClick={(e) => e.stopPropagation()} className={`md:hidden p-2 rounded-lg border shadow-sm transition-all active:scale-90 ${isBroken ? 'bg-red-600 text-white border-red-700' : 'bg-fgc-green/20 dark:bg-fgc-green/10 text-fgc-green border-fgc-green/30 dark:border-fgc-green/20'} ${isPrivacyMode ? 'cursor-default' : ''}`}>
                        <Radio size={14} />
                    </a>
                )}
            </div>
            <div className="hidden md:flex justify-center">
                {circ.cicle ? (
                    <div className={`text-[10px] sm:text-sm font-black px-3 py-1.5 rounded-lg border shadow-sm flex items-center justify-center gap-2 transition-all w-full max-w-[150px] ${isBroken ? 'bg-red-600 text-white border-red-700 animate-pulse' : isViatger ? 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800' : 'text-black dark:text-gray-200 bg-fgc-green/20 dark:bg-fgc-green/10 border-fgc-green/30 dark:border-fgc-green/20'}`}>
                        <div className="flex flex-col items-center">
                            {isViatger && <span className="text-[7px] opacity-60 leading-none mb-0.5 uppercase">Cicle Viatger</span>}
                            <span className="shrink-0">{circ.cicle}</span>
                        </div>
                        {circ.train && (
                            <div className={`flex items-center gap-1.5 pl-2 border-l ${isBroken ? 'border-white/30' : isViatger ? 'border-sky-200 dark:border-sky-800' : 'border-fgc-green/40 dark:border-fgc-green/20'}`}>
                                <a href={trainPhone ? (isPrivacyMode ? undefined : `tel:${trainPhone}`) : '#'} className={`${isBroken ? 'text-white' : isViatger ? 'text-sky-600 dark:text-sky-400' : 'text-fgc-green dark:text-fgc-green'} hover:text-blue-700 transition-colors flex items-center gap-1 ${(!trainPhone || isPrivacyMode) && 'pointer-events-none'}`}>
                                    <Radio size={10} className="opacity-80" />
                                    <span className="text-[10px] sm:text-xs">{circ.train}</span>
                                </a>
                            </div>
                        )}
                    </div>
                ) : (<span className="text-[10px] text-gray-300 dark:text-gray-600 font-bold uppercase tracking-widest italic opacity-40">Sense assignar</span>)}
            </div>
            <div className="flex items-center gap-2 sm:gap-4 justify-center min-w-0">
                <div className={`text-base sm:text-2xl font-black tabular-nums w-14 sm:w-16 text-center ${isActive || isBroken ? 'text-red-600' : 'text-fgc-grey dark:text-gray-200'}`}>{circ.sortida || '--:--'}</div>
                <div className="bg-fgc-green/20 dark:bg-fgc-green/10 text-fgc-grey dark:text-fgc-green border border-fgc-green/30 dark:border-fgc-green/20 px-2 py-0.5 rounded text-[10px] font-black shadow-sm shrink-0">V{circ.via_inici || '?'}</div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-400 dark:text-gray-500 truncate max-w-[100px] hidden md:block">{circ.machinistInici || circ.inici || '---'}</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 justify-center min-w-0">
                <span className="text-[10px] sm:text-xs font-bold text-gray-400 dark:text-gray-500 truncate max-w-[100px] text-right hidden md:block">{circ.machinistFinal || circ.final || '---'}</span>
                <div className="bg-fgc-grey/10 dark:bg-white/5 text-fgc-grey dark:text-gray-400 border border-gray-200 dark:border-white/10 px-2 py-0.5 rounded text-[10px] font-black shadow-sm shrink-0">V{circ.via_final || '?'}</div>
                <div className={`text-base sm:text-2xl font-black tabular-nums w-14 sm:w-16 text-center ${isActive || isBroken ? 'text-red-600' : 'text-fgc-grey dark:text-gray-200'}`}>{circ.arribada || '--:--'}</div>
            </div>
            <div className="flex justify-end items-center gap-2 sm:gap-3 px-1 sm:px-4">
                {needsImages && <Camera size={16} className="text-blue-500 animate-pulse drop-shadow-sm" />}
                {needsRecords && <FileText size={16} className="text-yellow-500 animate-pulse drop-shadow-sm" />}
                {needsCleaning && <Brush size={16} className="text-orange-500 animate-pulse drop-shadow-sm" />}
                {isBroken && <AlertTriangle size={16} className="text-red-600 animate-pulse drop-shadow-sm" />}
                {isActive && <span className="hidden xl:inline text-[9px] font-black text-red-500 animate-pulse bg-red-50 dark:bg-red-950/40 px-2.5 py-1 rounded-full border border-red-100 dark:border-red-900 shadow-sm">ACTIU</span>}
                <button onClick={() => toggleItinerari(itemKey)} className={`p-2 sm:p-3 rounded-xl shadow-md hover:shadow-xl transition-all active:scale-95 border-b-2 border-black/5 flex items-center justify-center shrink-0 ${isActive ? 'bg-red-600 text-white border-red-700' : isBroken ? 'bg-red-600 text-white border-red-700' : 'bg-fgc-green text-fgc-grey border-fgc-green'}`} title="Llibre d'itineraris">
                    <BookOpen size={16} />
                </button>
            </div>
        </div>
    );
};
