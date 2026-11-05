import React, { useState } from 'react';
import { 
  ShieldAlert, AlertTriangle, ArrowRight, Phone, Clock, 
  ChevronDown, ChevronUp, User, Train, Users, Sparkles 
} from 'lucide-react';
import { CompromisedReliefAlert } from '../utils/reliefWatchdogService';
import { formatDelayMinutes } from '../utils/accordionPredictor';
import { feedback } from '../utils/feedback';
import GlassPanel from './common/GlassPanel';

interface ReliefWatchdogBannerProps {
  alerts: CompromisedReliefAlert[];
  onNavigateToSearch?: (type: string, query: string) => void;
  compact?: boolean;
}

export const ReliefWatchdogBanner: React.FC<ReliefWatchdogBannerProps> = ({
  alerts,
  onNavigateToSearch,
  compact = false
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(!compact);

  if (!alerts || alerts.length === 0) {
    return null;
  }

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;

  const handleCircClick = (circId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onNavigateToSearch && circId) {
      feedback.click();
      onNavigateToSearch('circulacio', circId);
    }
  };

  const handleTurnClick = (turnId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onNavigateToSearch && turnId) {
      feedback.click();
      onNavigateToSearch('torn', turnId);
    }
  };

  return (
    <GlassPanel className={`overflow-hidden border-l-4 transition-all duration-300 animate-fade-up-premium ${
      criticalCount > 0 
        ? 'border-l-red-500 bg-red-500/[0.04] dark:bg-red-500/[0.07] border-red-200/50 dark:border-red-500/30' 
        : 'border-l-amber-500 bg-amber-500/[0.04] dark:bg-amber-500/[0.07] border-amber-200/50 dark:border-amber-500/30'
    } p-3.5 sm:p-4 rounded-2xl`}>
      {/* ── Header ── */}
      <div 
        onClick={() => {
          feedback.click();
          setIsExpanded(!isExpanded);
        }}
        className="flex items-center justify-between gap-3 cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            criticalCount > 0 
              ? 'bg-red-500/20 text-red-500 dark:bg-red-500/30 dark:text-red-400' 
              : 'bg-amber-500/20 text-amber-500 dark:bg-amber-500/30 dark:text-amber-400'
          }`}>
            <ShieldAlert size={18} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white flex items-center gap-1.5">
                <span>Vigilant de Relleus</span>
                <span className="text-[10px] font-bold text-gray-400 font-mono tracking-normal">
                  (Relief Watchdog)
                </span>
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                criticalCount > 0 
                  ? 'bg-red-500 text-white animate-pulse' 
                  : 'bg-amber-500 text-black'
              }`}>
                {criticalCount > 0 ? `${criticalCount} CRÍTICS` : `${warningCount} EN RISC`}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
              Maquinistes fent viatger amb retard que comprometen la sortida del seu proper tren de relleu.
            </p>
          </div>
        </div>

        <button 
          type="button" 
          aria-label={isExpanded ? 'Plegar detalls' : 'Desplegar detalls'}
          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-gray-400 transition-colors"
        >
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* ── Collapsible Content ── */}
      {isExpanded && (
        <div className="mt-3.5 pt-3 border-t border-gray-200/50 dark:border-white/10 space-y-2.5">
          {alerts.map((alt) => {
            const isCritical = alt.severity === 'critical';
            const topReserve = alt.availableReserves?.[0];

            return (
              <div 
                key={alt.id}
                className={`p-3 rounded-xl border transition-all ${
                  isCritical 
                    ? 'bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-500/30' 
                    : 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-500/30'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* Left Column: Conflict Info */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                        <User size={13} className="text-[#97BE14]" />
                        <span className="truncate">{alt.driverName}</span>
                      </span>
                      <button
                        onClick={(e) => handleTurnClick(alt.shortTorn, e)}
                        className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-800 dark:text-gray-200 hover:border-[#97BE14] transition-colors"
                        title="Veure torn"
                      >
                        Torn {alt.shortTorn}
                      </button>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${
                        isCritical 
                          ? 'bg-red-500 text-white' 
                          : 'bg-amber-500 text-black'
                      }`}>
                        {isCritical ? 'Relleu Impossible' : 'Marge Mínim'}
                      </span>
                    </div>

                    {/* Trajectory comparison */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                      <span>Viatja a</span>
                      <button
                        onClick={(e) => handleCircClick(alt.travelCircId, e)}
                        className="font-mono font-black text-blue-600 dark:text-blue-400 hover:underline px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40"
                        title="Veure tren viatger"
                      >
                        {alt.travelCircId}
                      </button>
                      <span className="text-red-500 font-bold font-mono">
                        (+{formatDelayMinutes(alt.currentDelaySec || (alt.currentDelayMin * 60))} demora)
                      </span>
                      <ArrowRight size={12} className="text-gray-400 mx-0.5" />
                      <span>Relleva tren</span>
                      <button
                        onClick={(e) => handleCircClick(alt.reliefCircId, e)}
                        className="font-mono font-black text-[#97BE14] hover:underline px-1.5 py-0.5 rounded bg-[#97BE14]/10"
                        title="Veure tren relleu"
                      >
                        {alt.reliefCircId}
                      </button>
                      <span>a</span>
                      <span className="font-bold text-gray-900 dark:text-white">
                        {alt.reliefStationName}
                      </span>
                      <span className="font-mono text-gray-500">
                        ({alt.reliefScheduledDeparture})
                      </span>
                    </div>

                    {/* Timing calculations */}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                      <span>Marge programat: <strong className="text-gray-700 dark:text-gray-300 font-mono">{formatDelayMinutes(alt.scheduledMarginMin * 60)}</strong></span>
                      <span>•</span>
                      <span>Arribada estimada: <strong className="text-red-500 font-mono">{alt.estimatedArrival}</strong></span>
                      <span>•</span>
                      <span>Marge real restant: <strong className={`font-mono ${alt.realMarginMin <= 0 ? 'text-red-500 font-black' : 'text-amber-500 font-black'}`}>{formatDelayMinutes(Math.max(0, alt.realMarginMin * 60))}</strong></span>
                    </div>
                  </div>

                  {/* Right Column: Active Reserve Quick Action */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    {topReserve ? (
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-white/80 dark:bg-black/40 border border-gray-200 dark:border-white/10 shadow-xs">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-[#97BE14] text-black">
                              {topReserve.shortTorn}
                            </span>
                            <span className="text-xs font-bold text-gray-900 dark:text-white truncate max-w-[120px]">
                              {topReserve.driverName}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 block">
                            Reserva {topReserve.dependencia} ({topReserve.iniciTorn}–{topReserve.finalTorn})
                          </span>
                        </div>

                        {topReserve.phones && topReserve.phones.length > 0 && (
                          <a
                            href={`tel:${topReserve.phones[0]}`}
                            onClick={(e) => e.stopPropagation()}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm active:scale-95 transition-all ml-1 shrink-0"
                            title={`Trucar a la reserva ${topReserve.driverName}`}
                          >
                            <Phone size={12} />
                            <span>Trucar</span>
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] text-gray-400 italic px-2 py-1">
                        Sense reserves directes a {alt.reliefStation}
                      </div>
                    )}

                    <button
                      onClick={(e) => handleCircClick(alt.travelCircId, e)}
                      className="px-3 py-2 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-[#97BE14] hover:text-black font-bold text-xs text-gray-800 dark:text-gray-200 transition-all active:scale-95 text-center"
                    >
                      Veure Detall
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
};

export default ReliefWatchdogBanner;
