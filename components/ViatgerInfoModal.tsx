import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, User, Clock, ArrowRight, Phone, Search, 
  Shield, CheckCircle2, Info, Users, ChevronDown,
  ShieldAlert, Zap, AlertTriangle
} from 'lucide-react';
import { feedback } from '../utils/feedback';
import { resolveStationName } from '../utils/stations';
import { getLiniaColor } from '../utils/fgc';
import { logLopdAccess } from '../utils/auditLogger';
import { 
  evaluatePassengerRelief, 
  getCirculationLiveDelay,
  ActiveReserveDriver 
} from '../utils/reliefWatchdogService';

export interface ViatgerPassengerItem {
  shiftId: string;
  shortTorn: string;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  sortida?: string;
  arribada?: string;
  inici_torn?: string;
  final_torn?: string;
  dependencia?: string;
  isPartial?: boolean;
  driverName?: string;
  driverNom?: string;
  driverCognoms?: string;
  nomina?: string;
  tipus_torn?: string;
  observacions?: string;
  phones?: string[];
  abs_parc_c?: string;
  dta?: string;
  dpa?: string;

  // Relief Watchdog fields
  nextCirc?: {
    codi: string;
    cicle?: string;
    sortida: string;
    arribada?: string;
    inici: string;
    iniciName: string;
    final?: string;
    scheduledMarginMin: number | null;
  };
  reliefAlert?: {
    isCompromised: boolean;
    severity: 'critical' | 'warning';
    delayMin: number;
    delaySec: number;
    estimatedArrival: string;
    realMarginMin: number;
    message: string;
    availableReserves: ActiveReserveDriver[];
  };
}

interface ViatgerInfoModalProps {
  circ: any;
  passengers: ViatgerPassengerItem[];
  onClose: () => void;
  onSelectTurn?: (turnId: string) => void;
  isPrivacyMode?: boolean;
}

export const ViatgerInfoModal: React.FC<ViatgerInfoModalProps> = ({
  circ,
  passengers,
  onClose,
  onSelectTurn,
  isPrivacyMode = false
}) => {
  // Swipe down to dismiss states and refs for mobile
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Relief Watchdog: live evaluation state
  const [evaluatedPassengers, setEvaluatedPassengers] = useState<ViatgerPassengerItem[]>(passengers);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  useEffect(() => {
    setEvaluatedPassengers(passengers);
  }, [passengers]);

  useEffect(() => {
    let isMounted = true;
    const runEvaluation = async () => {
      setIsEvaluating(true);
      try {
        const circId = (circ?.codi || circ?.id || '').trim().toUpperCase();
        const live = await getCirculationLiveDelay(circId);
        const enriched = await Promise.all(
          passengers.map(p => evaluatePassengerRelief(p, live.delaySec, live.delayMin))
        );
        if (isMounted) {
          setEvaluatedPassengers(enriched);
        }
      } catch (err) {
        console.warn('[ViatgerInfoModal] Error evaluating relief watchdog:', err);
      } finally {
        if (isMounted) setIsEvaluating(false);
      }
    };
    runEvaluation();
    return () => {
      isMounted = false;
    };
  }, [passengers, circ]);

  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const currentTranslateY = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDragInitiated = useRef(false);

  // Tanca amb animació suau cap avall
  const triggerClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTranslateY(window.innerHeight || 800);
    feedback.click();
    setTimeout(() => {
      onClose();
    }, 220);
  };

  // Tanca amb la tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        triggerClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (typeof document === 'undefined') return null;

  const circStart = (circ?.inici || '').trim().toUpperCase();
  const circEnd = (circ?.final || '').trim().toUpperCase();
  const circStartName = resolveStationName(circStart, circ?.linia);
  const circEndName = resolveStationName(circEnd, circ?.linia);

  // Touch gesture handlers per lliscar cap avall (swipe down to dismiss)
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const target = e.target as HTMLElement;
    const isHandleZone = target.closest('.drag-handle-zone') !== null;
    const isScrollAtTop = scrollContainerRef.current ? scrollContainerRef.current.scrollTop <= 2 : true;

    if (isHandleZone || isScrollAtTop) {
      touchStartY.current = touch.clientY;
      touchStartTime.current = Date.now();
      isDragInitiated.current = true;
      setIsDragging(true);
    } else {
      isDragInitiated.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragInitiated.current) return;

    const touch = e.touches[0];
    const deltaY = touch.clientY - touchStartY.current;

    // Si el contingut té scroll i està més avall, no arrosseguem la finestra
    if (scrollContainerRef.current && scrollContainerRef.current.scrollTop > 2) {
      touchStartY.current = touch.clientY;
      return;
    }

    if (deltaY > 0) {
      currentTranslateY.current = deltaY;
      setTranslateY(deltaY);
    } else {
      currentTranslateY.current = 0;
      setTranslateY(0);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragInitiated.current) return;
    isDragInitiated.current = false;
    setIsDragging(false);

    const deltaY = currentTranslateY.current;
    const duration = Date.now() - touchStartTime.current;
    const velocity = duration > 0 ? deltaY / duration : 0;

    // Si ha arrossegat més de 85px o amb velocitat ràpida cap avall, tanquem
    if (deltaY > 85 || (deltaY > 35 && velocity > 0.35)) {
      triggerClose();
    } else {
      currentTranslateY.current = 0;
      setTranslateY(0);
    }
  };

  const handlePhoneClick = (nomina?: string, phone?: string) => {
    if (!phone) return;
    if (nomina) {
      logLopdAccess('CALL_DISPATCH', nomina, { 
        context: 'viatger_modal', 
        phone_called: phone,
        circ: circ?.codi
      });
    }
  };

  const handleSelectTurn = (turnId: string) => {
    triggerClose();
    if (onSelectTurn && turnId) {
      onSelectTurn(turnId);
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md transition-opacity duration-200"
      style={{
        opacity: isClosing ? 0 : Math.max(0, 1 - translateY / 500)
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          triggerClose();
        }
      }}
    >
      <div 
        className="w-full sm:max-w-xl bg-[#181a1b] text-white rounded-t-[32px] sm:rounded-[32px] border-t sm:border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] touch-pan-y"
        role="dialog"
        aria-modal="true"
        aria-labelledby="viatger-modal-title"
        style={{
          transform: `translateY(${translateY}px)`,
          transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)',
          willChange: 'transform'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Zona de tirador superior per a mòbil amb gest de lliscar cap avall */}
        <div className="drag-handle-zone w-full pt-3 pb-2 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing shrink-0 select-none touch-none bg-black/20 sm:hidden">
          <div className="w-16 h-1.5 bg-white/40 hover:bg-white/60 active:bg-fgc-green rounded-full transition-colors shadow-sm" />
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1.5 flex items-center gap-1">
            <ChevronDown size={12} className="text-gray-400 animate-bounce" />
            Deslisa cap avall per tancar
          </span>
        </div>

        {/* Capçalera del modal */}
        <div className="drag-handle-zone p-4 sm:p-6 border-b border-white/10 bg-black/30 flex items-start justify-between gap-4 shrink-0 select-none">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-orange-500/20 text-orange-400 border border-orange-500/30">
                <Users size={12} className="shrink-0" />
                Maquinista de Viatger
              </span>
              {passengers.length > 1 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-gray-300">
                  {passengers.length} detectats
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <h2 id="viatger-modal-title" className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white flex items-center gap-2">
                <span>{circ?.codi || 'Circulació'}</span>
                {circ?.linia && (
                  <span className={`px-2 py-0.5 rounded text-xs font-black text-white ${getLiniaColor(circ.linia)} shadow-sm`}>
                    {circ.linia}
                  </span>
                )}
              </h2>
              {(circ?.sortida || circ?.arribada) && (
                <span className="text-xs font-bold text-gray-400 flex items-center gap-1">
                  <Clock size={12} className="text-fgc-green" />
                  {circ.sortida || '--:--'} — {circ.arribada || '--:--'}
                </span>
              )}
            </div>

            {(circStart || circEnd) && (
              <p className="text-xs text-gray-400 font-medium truncate flex items-center gap-1.5">
                <span className="font-bold text-gray-300">{circStartName}</span>
                <ArrowRight size={12} className="text-fgc-green shrink-0" />
                <span className="font-bold text-gray-300">{circEndName}</span>
              </p>
            )}
          </div>

          <button
            onClick={() => triggerClose()}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-all active:scale-95 shrink-0"
            aria-label="Tancar finestra"
          >
            <X size={18} />
          </button>
        </div>

        {/* Llista de viatgers amb scroll independent */}
        <div 
          ref={scrollContainerRef}
          className="p-4 sm:p-6 overflow-y-auto space-y-4 divide-y divide-white/5 overscroll-contain"
        >
          {evaluatedPassengers && evaluatedPassengers.length > 0 ? (
            evaluatedPassengers.map((p, idx) => {
              const pStart = (p.from || '').trim().toUpperCase();
              const pEnd = (p.to || '').trim().toUpperCase();
              const isFull = circStart && circEnd && pStart === circStart && pEnd === circEnd;

              // Mostra SEMPRE el nom real del maquinista
              const driverFullName = (p.driverCognoms && p.driverNom)
                ? `${p.driverCognoms}, ${p.driverNom}`
                : (p.driverName && !p.driverName.startsWith('Q') ? p.driverName : '');

              const displayDriverName = driverFullName
                || (p.driverName && p.driverName !== p.shiftId ? p.driverName : '')
                || (p.nomina ? `Maquinista (Nòmina #${p.nomina})` : 'Sense assignar');

              return (
                <div key={idx} className={`${idx > 0 ? 'pt-4' : ''} space-y-3.5`}>
                  {/* Targeta del torn i cobertura */}
                  <div className="bg-white/5 dark:bg-black/40 rounded-2xl p-4 border border-white/10 space-y-3 shadow-inner">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="px-3 py-1.5 bg-fgc-green text-emerald-950 rounded-xl font-black text-sm tracking-tight shadow-sm flex items-center gap-1.5">
                          <span>TORN {p.shortTorn || p.shiftId}</span>
                        </div>
                        {p.tipus_torn && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase">
                            {p.tipus_torn}
                          </span>
                        )}
                        {p.abs_parc_c === 'S' && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-600 text-white">ABS</span>}
                        {p.dta === 'S' && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-600 text-white">DTA</span>}
                        {p.dpa === 'S' && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-600 text-white">DPA</span>}
                      </div>

                      {/* Badge cobertura */}
                      <div className="flex items-center gap-2">
                        {p.reliefAlert?.isCompromised && (
                          <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 animate-pulse ${
                            p.reliefAlert.severity === 'critical'
                              ? 'bg-red-500 text-white'
                              : 'bg-amber-500 text-black'
                          }`}>
                            <ShieldAlert size={12} />
                            {p.reliefAlert.severity === 'critical' ? 'Relleu Fallit' : 'Relleu en Risc'}
                          </span>
                        )}
                        {isFull ? (
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                            <CheckCircle2 size={12} className="text-blue-400" />
                            Trajecte complet
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <Info size={12} className="text-amber-400" />
                            Tram parcial
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dades del Maquinista (NOM SEMPRE VISIBLE) */}
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-fgc-green/20 border border-fgc-green/40 text-fgc-green flex items-center justify-center shrink-0 shadow-sm">
                        <User size={24} strokeWidth={2.5} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-base sm:text-lg font-black text-white uppercase tracking-tight leading-snug">
                          {displayDriverName}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-[10px] font-black uppercase text-gray-300 bg-white/10 px-2 py-0.5 rounded border border-white/10">
                            NÒMINA #{p.nomina || '---'}
                          </span>
                          {(p.inici_torn || p.final_torn) && (
                            <span className="text-[10px] font-bold text-gray-300 flex items-center gap-1">
                              <Clock size={11} className="text-fgc-green" />
                              Jornada: {p.inici_torn || '--:--'} — {p.final_torn || '--:--'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Tram com a viatger */}
                    <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-1.5">
                      <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1">
                        <span>Tram assignat de viatger</span>
                        {(p.sortida || p.arribada) && (
                          <span className="text-fgc-green font-mono font-bold">
                            ({p.sortida || '--:--'} — {p.arribada || '--:--'})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                        <div className="flex flex-col">
                          <span className="text-white font-black">{p.fromName || resolveStationName(p.from)}</span>
                          <span className="text-[9px] text-gray-400 font-mono">({p.from})</span>
                        </div>
                        <ArrowRight size={14} className="text-fgc-green shrink-0 mx-1" />
                        <div className="flex flex-col">
                          <span className="text-white font-black">{p.toName || resolveStationName(p.to)}</span>
                          <span className="text-[9px] text-gray-400 font-mono">({p.to})</span>
                        </div>
                      </div>
                    </div>

                    {/* Proper tren a rellevar / conduir (Relief Mission) */}
                    {p.nextCirc ? (
                      <div className="p-3 bg-blue-950/20 rounded-xl border border-blue-500/20 space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-blue-400">
                          <span className="flex items-center gap-1.5">
                            <Zap size={12} className="text-blue-400" />
                            Proper tren a conduir (Relleu)
                          </span>
                          <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                            Tren {p.nextCirc.codi} {p.nextCirc.cicle ? `(${p.nextCirc.cicle})` : ''}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs text-gray-200 pt-0.5">
                          <div>
                            <span className="text-gray-400 text-[10px] block">Estació:</span>
                            <span className="font-bold text-white truncate block">{p.nextCirc.iniciName}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 text-[10px] block">Sortida tren:</span>
                            <span className="font-mono font-bold text-fgc-green">{p.nextCirc.sortida}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-gray-400 text-[10px] block">Marge teòric:</span>
                            <span className="font-mono font-bold text-blue-400">{p.nextCirc.scheduledMarginMin ?? '--'} min</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 bg-black/20 rounded-xl border border-white/5 text-[11px] text-gray-400 italic">
                        ℹ️ Retirada o tancament de jornada (no té cap circulació posterior programada).
                      </div>
                    )}

                    {/* ALERTA DE RELLEU EN RISC (Relief Watchdog) */}
                    {p.reliefAlert?.isCompromised && (
                      <div className={`p-3.5 rounded-2xl border ${
                        p.reliefAlert.severity === 'critical'
                          ? 'bg-red-950/40 border-red-500/40 text-red-200 ring-2 ring-red-500/30'
                          : 'bg-amber-950/40 border-amber-500/40 text-amber-200 ring-2 ring-amber-500/30'
                      } space-y-3 animate-fade-up-premium`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <ShieldAlert size={18} className={p.reliefAlert.severity === 'critical' ? 'text-red-400' : 'text-amber-400'} />
                            <span className="text-xs font-black uppercase tracking-wider">
                              {p.reliefAlert.severity === 'critical' ? '⚠️ Relleu Críticament Compromès' : '⚠️ Relleu en Risc per Retard'}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            p.reliefAlert.severity === 'critical' ? 'bg-red-500 text-white' : 'bg-amber-500 text-black'
                          }`}>
                            {p.reliefAlert.severity === 'critical' ? 'INVIABLE' : 'RISC TIGHT'}
                          </span>
                        </div>

                        <p className="text-xs leading-relaxed font-medium">
                          {p.reliefAlert.message}
                        </p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-black/40 p-2.5 rounded-xl border border-white/5">
                          <div>
                            <span className="text-gray-400 block text-[10px]">Demora tren:</span>
                            <span className="font-bold text-red-400">+{p.reliefAlert.delayMin} min</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block text-[10px]">Arribada estimada:</span>
                            <span className="font-bold text-white font-mono">{p.reliefAlert.estimatedArrival}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block text-[10px]">Sortida relleu:</span>
                            <span className="font-bold text-white font-mono">{p.nextCirc?.sortida || '--:--'}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block text-[10px]">Marge real restant:</span>
                            <span className={`font-black font-mono ${p.reliefAlert.realMarginMin <= 0 ? 'text-red-400' : 'text-amber-400'}`}>
                              {p.reliefAlert.realMarginMin} min
                            </span>
                          </div>
                        </div>

                        {/* Reserves disponibles a l'estació de relleu */}
                        {p.reliefAlert.availableReserves && p.reliefAlert.availableReserves.length > 0 ? (
                          <div className="pt-2 border-t border-white/10 space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-black uppercase text-gray-300">
                              <span>Reserves Operatives a {p.nextCirc?.iniciName}</span>
                              <span className="text-fgc-green">{p.reliefAlert.availableReserves.length} disponibles</span>
                            </div>
                            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                              {p.reliefAlert.availableReserves.map((res, rIdx) => (
                                <div key={rIdx} className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10 text-xs">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-[#97BE14] text-black">
                                        {res.shortTorn}
                                      </span>
                                      <span className="font-bold text-white truncate">{res.driverName}</span>
                                    </div>
                                    <span className="text-[10px] text-gray-400 block">
                                      Guàrdia: {res.iniciTorn} — {res.finalTorn} ({res.dependenciaName})
                                    </span>
                                  </div>
                                  {res.phones && res.phones.length > 0 && (
                                    <a
                                      href={`tel:${res.phones[0]}`}
                                      onClick={() => handlePhoneClick(res.nomina, res.phones[0])}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm shrink-0 ml-2 active:scale-95 transition-all"
                                      title={`Trucar a la reserva ${res.driverName}`}
                                    >
                                      <Phone size={11} />
                                      <span>Trucar</span>
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px] text-gray-400 italic pt-1">
                            Sense reserves directes a {p.nextCirc?.iniciName || 'la capçalera'}. Contacteu amb el CSO per a suport.
                          </div>
                        )}
                      </div>
                    )}

                    {p.observacions && (
                      <div className="text-xs text-gray-300 italic bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                        <span className="font-bold text-gray-400 not-italic mr-1.5">Obs:</span>
                        {p.observacions}
                      </div>
                    )}

                    {/* Botons d'acció: Trucar + Cercar torn */}
                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      {/* Botons de telèfon */}
                      {p.phones && p.phones.length > 0 ? (
                        p.phones.map((phone, phIdx) => (
                          <a
                            key={phIdx}
                            href={`tel:${phone}`}
                            onClick={() => handlePhoneClick(p.nomina, phone)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95"
                          >
                            <Phone size={14} />
                            <span>{phone}</span>
                          </a>
                        ))
                      ) : (
                        <div className="text-[11px] text-gray-500 italic px-2 py-1">
                          Sense telèfon registrat
                        </div>
                      )}

                      {/* Botó directe per cercar el torn */}
                      <button
                        onClick={() => handleSelectTurn(p.shortTorn || p.shiftId)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-fgc-green hover:text-emerald-950 text-white rounded-xl text-xs font-black border border-white/10 transition-all active:scale-95 ml-auto"
                      >
                        <Search size={14} />
                        <span>Veure Torn {p.shortTorn || p.shiftId}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">No s'ha trobat informació de viatgers per a aquesta circulació.</p>
            </div>
          )}
        </div>

        {/* Peu del modal */}
        <div className="p-4 bg-black/40 border-t border-white/10 flex items-center justify-between text-[11px] text-gray-400 shrink-0">
          <span className="flex items-center gap-1.5 truncate">
            <Shield size={12} className="text-fgc-green shrink-0" />
            <span>Dades d'assignació d'operacions FGC</span>
          </span>
          <button
            onClick={() => triggerClose()}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all active:scale-95 shrink-0 ml-2"
          >
            Tancar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ViatgerInfoModal;
