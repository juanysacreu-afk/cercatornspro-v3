import React from 'react';
import { X, Train, ArrowRight, Activity, Clock, Users, MapPin, Info, AlertTriangle, Timer } from 'lucide-react';
import { getLiniaColorHex, LINIA_STATIONS, resolveStationId } from '../utils/stations';
import type { GeoTrenEnhanced } from '../views/incidencia/hooks/useLiveMapData';
import { decodeGeotrenUt } from '../views/incidencia/utils/decodeUt';
import { decodeGeotrenCirculation } from '../views/incidencia/utils/decodeCirculation';

interface GeoTrenInspectorPopupProps {
    gt: GeoTrenEnhanced;
    onClose: () => void;
}

const GeoTrenInspectorPopup: React.FC<GeoTrenInspectorPopupProps> = ({ gt, onClose }) => {
    if (!gt) return null;

    const liniaColor = getLiniaColorHex(gt.lin);
    const isPunctual = (gt as any).en_hora === 'True';
    const hasDelay = gt.delayMin > 1;
    const decodedUt = decodeGeotrenUt(gt.ut, gt.tipus_unitat);


    // Extract next stops
    let nextStops: any[] = [];
    if ((gt as any).properes_parades && typeof (gt as any).properes_parades === 'string') {
        try {
            const parts = (gt as any).properes_parades.split(';');
            nextStops = parts.map((p: string) => JSON.parse(p));
        } catch (e) { }
    } else if (Array.isArray((gt as any).properes_parades)) {
        nextStops = (gt as any).properes_parades;
    }

    // Capacity calculation
    const coaches = [
        { name: 'M1', val: (gt as any).ocupacio_m1_percent },
        { name: 'RI', val: (gt as any).ocupacio_ri_percent },
        { name: 'MI', val: (gt as any).ocupacio_mi_percent },
        { name: 'M2', val: (gt as any).ocupacio_m2_percent }
    ].filter(c => c.val !== null);

    const avgOccupation = coaches.length > 0
        ? Math.round(coaches.reduce((acc, c) => acc + (parseFloat(c.val) || 0), 0) / coaches.length)
        : null;

    // Progress calculation
    const stationList = LINIA_STATIONS[gt.lin] || [];
    let progress = 0;
    if (stationList.length > 0) {
        const originId = resolveStationId((gt as any).origen, gt.lin);
        const destId = resolveStationId((gt as any).desti, gt.lin);
        const originIdx = stationList.indexOf(originId);
        const destIdx = stationList.indexOf(destId);

        if (originIdx !== -1 && destIdx !== -1 && originIdx !== destIdx) {
            let currentIdx = -1;
            if (gt.estacionat_a) {
                currentIdx = stationList.indexOf(resolveStationId(gt.estacionat_a, gt.lin));
            } else if (nextStops.length > 0) {
                const nextId = resolveStationId(nextStops[0].parada, gt.lin);
                const nextIdx = stationList.indexOf(nextId);
                if (nextIdx !== -1) {
                    currentIdx = (gt as any).dir === 'A' ? nextIdx + 0.5 : nextIdx - 0.5;
                }
            }

            if (currentIdx !== -1) {
                const totalDist = Math.abs(destIdx - originIdx);
                const currentDist = Math.abs(currentIdx - originIdx);
                progress = Math.max(0, Math.min(100, (currentDist / totalDist) * 100));
            }
        }
    }

    return (
        <div className="z-[300] animate-in zoom-in-95 fade-in duration-300 pointer-events-auto">
            <div
                className="w-80 overflow-hidden relative group"
                style={{
                    background: 'rgba(15, 15, 20, 0.98)',
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '32px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), inset 0 0 0 1px rgba(255, 255, 255, 0.1)'
                }}
            >
                {/* Header Decoration */}
                <div
                    className="absolute -top-12 -right-12 w-40 h-40 blur-[60px] transition-all duration-700 opacity-50"
                    style={{ backgroundColor: liniaColor }}
                />

                {/* Header */}
                <div className="p-6 border-b border-white/10 flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em]">GeoTren Real-time</span>
                            <span className={`px-2 py-0.5 rounded-[4px] text-[8px] font-black text-white uppercase `} style={{ backgroundColor: liniaColor }}>
                                {gt.lin}
                            </span>
                        </div>
                        <h3 className="text-3xl font-black text-white font-mono tracking-tighter flex items-center gap-2">
                            UT {decodedUt || gt.tipus_unitat}
                            <span className={`w-2 h-2 rounded-full ${isPunctual ? 'bg-fgc-green' : 'bg-red-500'} animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]`} />
                        </h3>
                        {(() => {
                            // Decode circulation ID for S1, S2, L6, and L7
                            const supportedLines = ['S1', 'S2', 'L6', 'L7'];
                            if (supportedLines.includes(gt.lin) && gt.id) {
                                const decodedCirc = decodeGeotrenCirculation(gt.id);
                                if (decodedCirc) {
                                    const numPadded = decodedCirc.number.padStart(3, '0');
                                    return (
                                        <div className="text-3xl font-black text-white font-mono tracking-tighter mt-1 opacity-90">
                                            {decodedCirc.direction}{numPadded}
                                        </div>
                                    );
                                }
                            }
                            return null;
                        })()}
                    </div>
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onClose();
                        }}
                        className="p-2 hover:bg-white/10 rounded-full text-gray-300 hover:text-white transition-all relative z-[10]"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Direction & Status */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/10 p-3 rounded-2xl border border-white/10">
                            <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1 flex items-center gap-1">
                                <Activity size={10} /> Direcció
                            </p>
                            <p className="text-xs font-black text-white uppercase">{gt.dir === 'A' ? 'Ascendent' : 'Descendent'}</p>
                        </div>
                        <div className="bg-white/10 p-3 rounded-2xl border border-white/10">
                            <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1 flex items-center gap-1">
                                <Clock size={10} /> Estat
                            </p>
                            <p className={`text-xs font-black uppercase ${isPunctual ? 'text-fgc-green' : 'text-red-500'}`}>
                                {isPunctual ? 'Puntual' : 'Amb retard'}
                            </p>
                        </div>
                    </div>

                    {/* Delay + ETA row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className={`p-3 rounded-2xl border ${hasDelay ? 'bg-red-500/15 border-red-500/30' : 'bg-white/5 border-white/10'}`}>
                            <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1 flex items-center gap-1">
                                <AlertTriangle size={10} /> Retard
                            </p>
                            <p className={`text-sm font-black ${hasDelay ? 'text-red-400' : 'text-fgc-green'}`}>
                                {hasDelay ? `+${gt.delayMin} min` : 'Cap retard'}
                            </p>
                        </div>
                        <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                            <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1 flex items-center gap-1">
                                <Timer size={10} /> ETA Pròx. Parada
                            </p>
                            <p className="text-sm font-black text-white">
                                {gt.etaNextMin !== null ? `~${gt.etaNextMin} min` : '—'}
                            </p>
                        </div>
                    </div>

                    {/* Route Progress */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase text-gray-400 tracking-widest px-1">
                            <span>{gt.origen}</span>
                            <ArrowRight size={12} className="opacity-50" />
                            <span>{gt.desti}</span>
                        </div>
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-[2px] border border-white/5">
                            <div
                                className="h-full rounded-full transition-all duration-1000 origin-left"
                                style={{
                                    width: `${progress}%`,
                                    background: `linear-gradient(90deg, #3b82f6, ${liniaColor})`,
                                    boxShadow: `0 0 10px ${liniaColor}66`
                                }}
                            />
                        </div>
                    </div>

                    {/* Occupation */}
                    <div className="bg-white/10 p-4 rounded-2xl border border-white/10 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Users size={14} className="text-gray-300" />
                                <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Ocupació</span>
                            </div>
                            {avgOccupation !== null && (
                                <span className="text-xs font-black text-white">{avgOccupation}%</span>
                            )}
                        </div>

                        {coaches.length > 0 ? (
                            <div className="grid grid-cols-4 gap-1.5">
                                {coaches.map((c: any) => (
                                    <div key={c.name} className="space-y-1">
                                        <div className="h-4 bg-white/5 rounded-[4px] relative overflow-hidden">
                                            <div
                                                className="absolute bottom-0 left-0 w-full bg-fgc-green/50 transition-all duration-1000"
                                                style={{ height: `${c.val}%` }}
                                            />
                                        </div>
                                        <p className="text-[7px] font-black text-center text-gray-500">{c.name}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-[9px] font-bold text-gray-500 italic text-center">No hi ha dades d'ocupació en temps real</p>
                        )}
                    </div>

                    {/* Next Stops */}
                    {nextStops.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 px-1">
                                <MapPin size={12} className="text-gray-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Properes Parades</span>
                            </div>
                            <div className="space-y-1.5 pl-1">
                                {nextStops.slice(0, 3).map((s: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-gray-200">{s.parada}</span>
                                        {s.hora_prevista && (
                                            <span className="text-[10px] font-black text-gray-500">{s.hora_prevista}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Technical Info */}
                    <div className="pt-4 border-t border-white/10 space-y-1">
                        <div className="flex items-center gap-2 opacity-40">
                            <Info size={10} className="text-gray-400" />
                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">ID SIRTRAN: {gt.id.split('|')[0]}</span>
                        </div>
                        {gt.ut && (
                            <div className="flex items-center gap-2 opacity-40">
                                <Info size={10} className="text-gray-400" />
                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">UT HEX: {gt.ut}</span>
                            </div>
                        )}
                    </div>


                    <button
                        onClick={onClose}
                        className="w-full bg-white/10 hover:bg-white/20 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-white transition-all border border-white/5 shadow-lg active:scale-95 mt-2"
                    >
                        Tancar Detalls
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GeoTrenInspectorPopup;
