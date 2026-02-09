
import React from 'react';
import { Phone, Users, Camera, FileText, Brush, AlertTriangle, BookOpen, Settings, Radio } from 'lucide-react';
import { checkIfActive } from '../utils/time';
import { MarqueeText } from './MarqueeText';

interface StationRowProps {
    circ: any;
    itemKey: string;
    nowMin: number;
    trainStatuses: Record<string, any>;
    getTrainPhone: (train: string) => string | null;
    getLiniaColor: (linia: string) => string;
    openUnitMenu: (circ: any, cycleId: string) => void;
    toggleItinerari: (id: string) => void;
    getShiftCurrentStatus: (turn: any, shiftIdx: number) => any;
    isPrivacyMode: boolean;
}

export const StationRow: React.FC<StationRowProps> = ({
    circ,
    itemKey,
    nowMin,
    trainStatuses,
    getTrainPhone,
    getLiniaColor,
    openUnitMenu,
    toggleItinerari,
    getShiftCurrentStatus,
    isPrivacyMode
}) => {
    const trainPhone = getTrainPhone(circ.train);
    const isActive = checkIfActive(circ.sortida, circ.arribada, nowMin);
    const status = circ.train ? trainStatuses[circ.train] : null;
    const isBroken = status?.is_broken;
    const needsImages = status?.needs_images;
    const needsRecords = status?.needs_records;
    const needsCleaning = status?.needs_cleaning;
    const isViatger = circ.id === 'Viatger';

    return (
        <div id={`station-row-${itemKey}`} className={`p-2.5 sm:p-4 grid grid-cols-[auto_1fr_auto_auto] md:grid-cols-[1fr_1.2fr_1.8fr_1fr_1.2fr] items-center gap-2 sm:gap-4 w-full relative transition-all scroll-mt-24 ${isActive ? 'bg-red-50/40 dark:bg-red-950/20 shadow-inner' : isBroken ? 'bg-red-50/20 dark:bg-red-950/10' : ''}`}>
            {/* Torn i Linia (Mòbil: Agrupats a l'esquerra) */}
            <div className="flex flex-col justify-center items-center gap-1.5 shrink-0">
                <button
                    onClick={() => circ.cicle && openUnitMenu(circ, circ.cicle)}
                    className={`px-2 py-1 sm:px-2.5 sm:py-1.5 ${isViatger ? 'bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800' : getLiniaColor(circ.linia)} rounded-lg font-black text-[10px] sm:text-sm shadow-sm flex items-center justify-center min-w-[54px] sm:min-w-[62px] hover:scale-105 active:scale-95 transition-transform group relative`}
                    title="Gestionar Unitat"
                >
                    {isViatger ? (
                        <div className="flex flex-col items-center justify-center leading-none">
                            <span className="text-[6.5px] sm:text-[7.5px] font-black text-sky-600 dark:text-sky-400 tracking-tighter uppercase mb-0.5">VIATGER</span>
                            <span className="text-[9px] sm:text-[11px] font-black text-sky-800 dark:text-sky-100">{circ.realCodi || '---'}</span>
                        </div>
                    ) : (
                        <span className="text-white">{circ.id}</span>
                    )}
                    {circ.cicle && <div className="absolute -top-1 -right-1 bg-white dark:bg-black rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"><Settings size={8} className="text-fgc-grey dark:text-gray-400" /></div>}
                </button>
                <div className="flex items-center gap-1">
                    <span className={`px-1.5 py-0.5 bg-gray-100 dark:bg-white/10 ${getLiniaColor(circ.linia)} text-white rounded-md font-black text-[8px] sm:text-[11px] shadow-sm`}>{circ.linia || '??'}</span>
                    {circ.viaAtStation && (
                        <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 text-fgc-grey dark:text-gray-300 rounded-md font-black text-[8px] sm:text-[11px] shadow-sm border border-gray-300/50 dark:border-white/10 uppercase">V{circ.viaAtStation}</span>
                    )}
                </div>

                {/* Telèfon mòbil (opcional) */}
                {circ.train && trainPhone && (
                    <a href={isPrivacyMode ? undefined : `tel:${trainPhone}`} onClick={(e) => e.stopPropagation()} className={`md:hidden p-1.5 rounded-lg border shadow-sm transition-all active:scale-90 ${isBroken ? 'bg-red-600 text-white border-red-700' : 'bg-fgc-green/20 dark:bg-fgc-green/10 text-fgc-green border-fgc-green/30 dark:border-fgc-green/20'} ${isPrivacyMode ? 'cursor-default' : ''}`}>
                        <Radio size={12} />
                    </a>
                )}
            </div>

            {/* Cicle i Unitat (Només Escritori) */}
            <div className="hidden md:flex justify-center shrink-0">
                {circ.cicle ? (
                    <div className={`text-[10px] sm:text-sm font-black px-3 py-1.5 rounded-lg border shadow-sm flex items-center gap-2 w-full max-w-[140px] ${isBroken ? 'bg-red-600 text-white border-red-700 animate-pulse' : isViatger ? 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800' : 'text-black dark:text-gray-200 bg-fgc-green/20 dark:bg-fgc-green/10 border-fgc-green/30 dark:border-fgc-green/20'}`}>
                        <div className="flex flex-col items-center">
                            {isViatger && <span className="text-[7px] opacity-60 leading-none mb-0.5 uppercase">Cicle Viatger</span>}
                            <span>{circ.cicle}</span>
                        </div>
                        {circ.train && (
                            <div className={`flex items-center gap-1.5 ml-1 pl-1.5 border-l ${isBroken ? 'border-white/30' : isViatger ? 'border-sky-200 dark:border-sky-800' : 'border-fgc-green/40 dark:border-fgc-green/20'}`}>
                                <a href={trainPhone ? (isPrivacyMode ? undefined : `tel:${trainPhone}`) : '#'} className={`${isBroken ? 'text-white' : isViatger ? 'text-sky-600 dark:text-sky-400' : 'text-fgc-green dark:text-fgc-green'} hover:text-blue-700 transition-colors flex items-center ${isPrivacyMode ? 'cursor-default' : ''}`}>
                                    <Radio size={8} className="opacity-80" />
                                    <span className="text-[10px] ml-0.5">{circ.train}</span>
                                </a>
                            </div>
                        )}
                    </div>
                ) : (<span className="text-[10px] text-gray-300 dark:text-gray-600 font-bold uppercase tracking-widest italic opacity-40">Sense assignar</span>)}
            </div>

            {/* Info Maquinista (El centre, s'adapta) */}
            <div className="flex flex-col items-start min-w-0 gap-1 sm:gap-2 pr-2 font-black">
                {circ.drivers.map((driver: any, dIdx: number) => (
                    <div key={dIdx} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 w-full min-w-0">
                        <MarqueeText
                            text={`${driver.cognoms || ''}, ${driver.nom || ''}`}
                            className={`text-xs sm:text-lg font-black leading-tight ${isActive ? 'text-red-700 dark:text-red-400' : isBroken ? 'text-red-600' : 'text-fgc-grey dark:text-gray-200'}`}
                        />
                        {driver.tipus_torn && (
                            <span className={`px-1.5 py-0.5 rounded-[4px] text-[7px] sm:text-[8px] font-black uppercase border self-start sm:self-auto shrink-0 ${driver.tipus_torn === 'Reducció'
                                ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800'
                                : 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
                                }`}>
                                {driver.tipus_torn === 'Reducció' ? 'RED' : 'TORN'}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {/* Hora */}
            <div className="flex justify-center items-center shrink-0">
                <div className={`px-2 py-1.5 sm:px-4 sm:py-2 rounded-xl border transition-all tabular-nums ${isActive ? 'bg-red-600 text-white border-red-700 animate-pulse shadow-md' : isBroken ? 'bg-red-600 text-white border-red-700 shadow-sm' : 'bg-fgc-green/10 dark:bg-fgc-green/5 border-fgc-green/20 dark:border-fgc-green/10'}`}>
                    <span className={`text-xs sm:text-2xl font-black ${isActive || isBroken ? 'text-white' : 'text-fgc-grey dark:text-gray-200'}`}>
                        {(circ.stopTimeAtStation || '--:--').substring(0, 5)}
                    </span>
                </div>
            </div>

            {/* Estat / Detalls */}
            <div className="flex items-center justify-end gap-1.5 sm:gap-3 shrink-0">
                <div className="flex items-center gap-1 sm:gap-1.5">
                    {needsImages && <Camera size={14} className="text-blue-500 animate-pulse drop-shadow-sm" />}
                    {needsRecords && <FileText size={14} className="text-yellow-500 animate-pulse drop-shadow-sm" />}
                    {needsCleaning && <Brush size={14} className="text-orange-500 animate-pulse drop-shadow-sm" />}
                    {isBroken && <AlertTriangle size={14} className="text-red-600 animate-pulse drop-shadow-sm" />}
                </div>
                <button onClick={() => toggleItinerari(itemKey)} className={`p-2 sm:p-3 rounded-xl shadow-md hover:shadow-xl transition-all active:scale-95 border-b-2 border-black/5 flex items-center gap-2 ${isActive || isBroken ? 'bg-red-600 text-white border-red-700' : 'bg-fgc-green text-fgc-grey'}`}>
                    <BookOpen size={16} />
                    <span className="hidden lg:inline text-[10px] font-black uppercase tracking-tighter">Itinerari</span>
                </button>
            </div>
        </div>
    );
};
