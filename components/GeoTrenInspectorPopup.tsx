import React from 'react';
import { X, Train, ArrowRight, Activity, Clock, Users, MapPin, Info, AlertTriangle, Timer, User, Phone, Compass, UserX } from 'lucide-react';
import { getLiniaColorHex, LINIA_STATIONS, resolveStationId } from '../utils/stations';
import type { GeoTrenEnhanced } from '../views/incidencia/hooks/useLiveMapData';
import { decodeGeotrenUt } from '../views/incidencia/utils/decodeUt';
import { decodeGeotrenCirculation } from '../views/incidencia/utils/decodeCirculation';
import { getPunctualityInfo } from '../utils/delayNotifications';

interface GeoTrenInspectorPopupProps {
    gt: GeoTrenEnhanced;
    onClose: () => void;
    onOpenRoute?: (circulacioId: string) => void;
}

const GeoTrenInspectorPopup: React.FC<GeoTrenInspectorPopupProps> = ({ gt, onClose, onOpenRoute }) => {
    if (!gt) return null;

    const liniaColor = getLiniaColorHex(gt.lin);
    const decodedUt = decodeGeotrenUt(gt.ut, gt.tipus_unitat);
    const punct = gt.punctuality || getPunctualityInfo((gt as any).delaySec ?? (gt.delayMin * 60));


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
        <div className="z-[300] animate-in zoom-in-95 fade-in duration-300 pointer-events-auto my-auto">
            <div
                className="w-80 sm:w-88 max-h-[calc(100dvh-32px)] flex flex-col overflow-hidden relative group"
                style={{
                    background: 'rgba(15, 15, 20, 0.98)',
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '28px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), inset 0 0 0 1px rgba(255, 255, 255, 0.1)'
                }}
            >
                {/* Header Decoration */}
                <div
                    className="absolute -top-12 -right-12 w-40 h-40 blur-[60px] transition-all duration-700 opacity-50 pointer-events-none"
                    style={{ backgroundColor: liniaColor }}
                />

                {/* Header (Pinned at top) */}
                <div className="p-5 border-b border-white/10 flex justify-between items-start shrink-0 relative z-[10] bg-black/30 backdrop-blur-md">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em]">GeoTren Real-time</span>
                            <span className={`px-2 py-0.5 rounded-[4px] text-[8px] font-black text-white uppercase `} style={{ backgroundColor: liniaColor }}>
                                {gt.lin}
                            </span>
                        </div>
                        <h3 className="text-3xl font-black text-white font-mono tracking-tighter flex items-center gap-2">
                            UT {decodedUt || gt.tipus_unitat}
                            <span
                                className="w-2.5 h-2.5 rounded-full animate-pulse shadow-md"
                                style={{ backgroundColor: punct.colorHex, boxShadow: `0 0 10px ${punct.colorHex}cc` }}
                            />
                        </h3>
                        {(() => {
                            // Decode circulation ID for S1, S2, L6, L7, and L12
                            const supportedLines = ['S1', 'S2', 'L6', 'L7', 'L12'];
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

                <div className="p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                    {/* Targeta Maquinista Assignat (Unificació Maquinista / Convoy) */}
                    <div className="bg-white/10 p-4 rounded-2xl border border-white/10 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${gt.isDriverAssigned ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-gray-400 border border-white/10'}`}>
                                    {gt.isDriverAssigned ? <User size={18} /> : <UserX size={18} />}
                                </div>
                                <div>
                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
                                        Maquinista Assignat
                                    </p>
                                    <p className="text-xs font-black text-white uppercase leading-tight">
                                        {gt.driver || 'Sense assignar'}
                                    </p>
                                </div>
                            </div>
                            {gt.torn && gt.torn !== '---' && (
                                <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider">
                                    Torn {gt.torn}
                                </span>
                            )}
                        </div>

                        {gt.isDriverAssigned && (
                            <div className="pt-2 border-t border-white/5 flex flex-col gap-2">
                                <div className="flex items-center justify-between text-[9px] font-bold text-gray-300">
                                    {gt.shiftStart && gt.shiftEnd ? (
                                        <span>Horari: <strong className="text-white font-mono">{gt.shiftStart} - {gt.shiftEnd}</strong> {gt.shiftDep ? `(${gt.shiftDep})` : ''}</span>
                                    ) : (
                                        <span>Servei en curs</span>
                                    )}
                                </div>

                                {/* Botons de trucada directa */}
                                {gt.phones && gt.phones.length > 0 ? (
                                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                                        {gt.phones.map((phone, pIdx) => (
                                            <a
                                                key={pIdx}
                                                href={`tel:${phone}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all active:scale-95"
                                                title={`Trucar directament a ${gt.driver}: ${phone}`}
                                            >
                                                <Phone size={12} />
                                                <span>{phone}</span>
                                            </a>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[9px] font-bold text-gray-500 italic">Sense telèfon registrat</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Direction & Status */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/10 p-3 rounded-2xl border border-white/10">
                            <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1 flex items-center gap-1">
                                <Activity size={10} /> {gt.speedKmh !== undefined && gt.speedKmh > 0 ? `Cinemàtica (${gt.speedKmh} km/h)` : 'Estat de Marxa'}
                            </p>
                            <p className="text-xs font-black text-white uppercase">
                                {gt.fusionState === 'EN_ANDANA' ? 'Aturat a andana' : gt.fusionState === 'APROXIMANT' ? 'Arribant a andana' : (gt.dir === 'A' ? 'Ascendent' : 'Descendent')}
                            </p>
                            {gt.distanceToTrackMeters !== undefined && (
                                <p className="text-[8px] font-mono text-gray-400 mt-0.5">
                                    Via FGC · Snap ±{gt.distanceToTrackMeters}m
                                </p>
                            )}
                        </div>
                        <div className={`p-3 rounded-2xl border ${punct.bgClass} ${punct.borderClass}`}>
                            <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1 flex items-center gap-1">
                                <Clock size={10} /> Puntualitat
                            </p>
                            <p className={`text-xs font-black uppercase ${punct.textClass}`}>
                                {punct.label}
                            </p>
                        </div>
                    </div>

                    {/* Delay + ETA row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className={`p-3 rounded-2xl border ${punct.bgClass} ${punct.borderClass}`}>
                            <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1 flex items-center gap-1">
                                <AlertTriangle size={10} /> Desviació Marxa
                            </p>
                            <p className={`text-sm font-black ${punct.textClass}`}>
                                {(() => {
                                    const sec = punct.delaySec;
                                    if (sec < -20) {
                                        const absSec = Math.abs(sec);
                                        const m = Math.floor(absSec / 60);
                                        const s = absSec % 60;
                                        return m > 0 ? `-${m}m ${s}s (avançat)` : `-${s}s (avançat)`;
                                    }
                                    if (sec <= 0) return '0 min (en hora)';
                                    const m = Math.floor(sec / 60);
                                    const s = sec % 60;
                                    return s > 0 ? `+${m}m ${s}s` : `+${m} min`;
                                })()}
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


                    {onOpenRoute && (gt.circulacioId || (gt.id && decodeGeotrenCirculation(gt.id)?.fullName)) && (
                        <button
                            onClick={() => {
                                const code = gt.circulacioId || decodeGeotrenCirculation(gt.id)?.fullName;
                                if (code) onOpenRoute(code);
                            }}
                            className="w-full bg-fgc-green hover:bg-fgc-green/90 text-fgc-grey font-black py-3 rounded-2xl text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 mt-2"
                        >
                            <Compass size={14} />
                            Obrir Detalls Ruta ({gt.circulacioId || decodeGeotrenCirculation(gt.id)?.fullName})
                        </button>
                    )}

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
