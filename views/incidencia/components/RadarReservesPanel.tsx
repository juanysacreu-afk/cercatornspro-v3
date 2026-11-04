import React, { useState, useMemo, useEffect } from 'react';
import { 
  Radio, Phone, Clock, ShieldCheck, ShieldAlert, AlertTriangle, 
  User, Train, Coffee, Timer, ChevronRight, Info, Sparkles, Filter, CheckCircle2, ChevronDown, ChevronUp
} from 'lucide-react';
import GlassPanel from '../../../components/common/GlassPanel';
import { getTravelTime, resolveStationId, resolveStationName, formatFgcTime, getFgcMinutes } from '../../../utils/stations';
import { fetchActiveReserveDrivers, ActiveReserveDriver } from '../../../utils/reliefWatchdogService';
import { auditLabourCompliance, LabourComplianceResult } from '../../../utils/labourComplianceEngine';
import { feedback } from '../../../utils/feedback';
import type { EnrichedShift, RestingResult, ExtensibleResult } from '../../../types';

export interface RadarResourceItem {
  id: string;
  sourceType: 'reserva' | 'viatger' | 'descans' | 'extensible';
  sourceLabel: string;
  driverName: string;
  nomina: string;
  shortTorn: string;
  fullTornId: string;
  currentStation: string;
  currentStationName: string;
  etaMinutes: number;
  phones: string[];
  iniciTorn: string;
  finalTorn: string;
  audit: LabourComplianceResult;
  extraDetails?: string;
}

interface RadarReservesPanelProps {
  targetStationCode: string;
  targetTimeStr?: string;
  circId?: string;
  passengerResults?: EnrichedShift[];
  restingResults?: RestingResult[];
  extensibleResults?: ExtensibleResult[];
  isPrivacyMode?: boolean;
}

export const RadarReservesPanel: React.FC<RadarReservesPanelProps> = ({
  targetStationCode,
  targetTimeStr = '--:--',
  circId,
  passengerResults = [],
  restingResults = [],
  extensibleResults = [],
  isPrivacyMode = false
}) => {
  const [activeReserves, setActiveReserves] = useState<ActiveReserveDriver[]>([]);
  const [loadingReserves, setLoadingReserves] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'immediate' | 'reserva' | 'viatger' | 'descans'>('all');
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  const cleanTargetSt = resolveStationId(targetStationCode);
  const targetStationName = resolveStationName(cleanTargetSt);

  // Fetch reserves for target station
  useEffect(() => {
    let isMounted = true;
    setLoadingReserves(true);
    fetchActiveReserveDrivers(cleanTargetSt, targetTimeStr)
      .then(res => {
        if (isMounted) {
          setActiveReserves(res);
          setLoadingReserves(false);
        }
      })
      .catch(err => {
        console.error('[RadarReserves] Error fetching reserves:', err);
        if (isMounted) setLoadingReserves(false);
      });

    return () => { isMounted = false; };
  }, [cleanTargetSt, targetTimeStr]);

  // Aggregate all proximity resources
  const radarItems = useMemo(() => {
    const list: RadarResourceItem[] = [];

    // 1. Reserves
    activeReserves.forEach(r => {
      const rSt = resolveStationId(r.dependencia);
      const isHere = r.isExactStation || rSt === cleanTargetSt;
      const eta = isHere ? 0 : getTravelTime(rSt, cleanTargetSt);
      const mockShift: any = {
        id: r.shiftId,
        inici_torn: r.iniciTorn,
        final_torn: r.finalTorn,
        dependencia: r.dependencia
      };
      const audit = auditLabourCompliance(mockShift);

      list.push({
        id: `RES-${r.shiftId}`,
        sourceType: 'reserva',
        sourceLabel: isHere ? 'Reserva a Destacament' : 'Reserva de Línia',
        driverName: r.driverName,
        nomina: r.nomina,
        shortTorn: r.shortTorn,
        fullTornId: r.shiftId,
        currentStation: rSt,
        currentStationName: r.dependenciaName || resolveStationName(rSt),
        etaMinutes: eta,
        phones: r.phones,
        iniciTorn: r.iniciTorn,
        finalTorn: r.finalTorn,
        audit,
        extraDetails: `Guàrdia operativa ${r.iniciTorn} — ${r.finalTorn}`
      });
    });

    // 2. Viatgers
    passengerResults.forEach(p => {
      const vCirc = p.fullCirculations?.find((c: any) => c?.codi === 'Viatger');
      const vDrop = vCirc?.machinistFinal || vCirc?.final || p.dependencia;
      const vDropCode = resolveStationId(vDrop);
      const isHere = vDropCode === cleanTargetSt;
      const eta = isHere ? 0 : getTravelTime(vDropCode, cleanTargetSt);
      const audit = auditLabourCompliance(p);

      list.push({
        id: `VIATGER-${p.id}`,
        sourceType: 'viatger',
        sourceLabel: 'Maquinista de Viatger',
        driverName: p.drivers?.[0] ? `${p.drivers[0].cognoms}, ${p.drivers[0].nom}` : p.id,
        nomina: p.drivers?.[0]?.nomina || '',
        shortTorn: p.id,
        fullTornId: p.id,
        currentStation: vDropCode,
        currentStationName: resolveStationName(vDropCode),
        etaMinutes: eta,
        phones: p.drivers?.[0]?.phones || [],
        iniciTorn: p.inici_torn,
        finalTorn: p.final_torn,
        audit,
        extraDetails: vCirc ? `Viatger al tren ${vCirc.id || vCirc.codi}` : 'Viatger en trànsit'
      });
    });

    // 3. Descansos
    restingResults.forEach(r => {
      const restSt = resolveStationId(r.restSeg?.codi || r.dependencia);
      const isHere = restSt === cleanTargetSt;
      const eta = isHere ? 0 : getTravelTime(restSt, cleanTargetSt);
      const audit = auditLabourCompliance(r);

      list.push({
        id: `DESCANS-${r.id}`,
        sourceType: 'descans',
        sourceLabel: 'En temps de Descans',
        driverName: r.drivers?.[0] ? `${r.drivers[0].cognoms}, ${r.drivers[0].nom}` : r.id,
        nomina: r.drivers?.[0]?.nomina || '',
        shortTorn: r.id,
        fullTornId: r.id,
        currentStation: restSt,
        currentStationName: resolveStationName(restSt),
        etaMinutes: eta,
        phones: r.drivers?.[0]?.phones || [],
        iniciTorn: r.inici_torn,
        finalTorn: r.final_torn,
        audit,
        extraDetails: `${r.availableTime || 0} minuts útils de pausa`
      });
    });

    // 4. Extensibles
    extensibleResults.forEach(e => {
      const extSt = resolveStationId(e.dependencia);
      const isHere = extSt === cleanTargetSt;
      const eta = isHere ? 0 : getTravelTime(extSt, cleanTargetSt);
      const audit = auditLabourCompliance(e, 0, e.extData?.extraNeeded || 0);

      list.push({
        id: `EXT-${e.id}`,
        sourceType: 'extensible',
        sourceLabel: 'Torn Extensible (+45m)',
        driverName: e.drivers?.[0] ? `${e.drivers[0].cognoms}, ${e.drivers[0].nom}` : e.id,
        nomina: e.drivers?.[0]?.nomina || '',
        shortTorn: e.id,
        fullTornId: e.id,
        currentStation: extSt,
        currentStationName: resolveStationName(extSt),
        etaMinutes: eta,
        phones: e.drivers?.[0]?.phones || [],
        iniciTorn: e.inici_torn,
        finalTorn: e.final_torn,
        audit,
        extraDetails: `Final torn ${e.final_torn} (marge útil)`
      });
    });

    // Deduplicate by driver (nomina, driverName, or shortTorn)
    const uniqueList: RadarResourceItem[] = [];
    const seenDriverKeys = new Set<string>();

    for (const item of list) {
      const key = item.nomina 
        ? `NOM-${item.nomina}` 
        : item.driverName && item.driverName !== item.shortTorn 
        ? `NAME-${item.driverName.toLowerCase().trim()}`
        : `TORN-${item.shortTorn}`;

      if (!seenDriverKeys.has(key)) {
        seenDriverKeys.add(key);
        uniqueList.push(item);
      }
    }

    // Sort strictly by ETA minutes ascending, then compliant first
    uniqueList.sort((a, b) => {
      if (a.etaMinutes !== b.etaMinutes) return a.etaMinutes - b.etaMinutes;
      if (a.audit.score === 'compliant' && b.audit.score !== 'compliant') return -1;
      if (a.audit.score !== 'compliant' && b.audit.score === 'compliant') return 1;
      return a.shortTorn.localeCompare(b.shortTorn);
    });

    return uniqueList;
  }, [activeReserves, passengerResults, restingResults, extensibleResults, cleanTargetSt]);

  // Filtered radar items
  const filteredItems = useMemo(() => {
    if (filterType === 'immediate') return radarItems.filter(i => i.etaMinutes <= 10);
    if (filterType === 'reserva') return radarItems.filter(i => i.sourceType === 'reserva');
    if (filterType === 'viatger') return radarItems.filter(i => i.sourceType === 'viatger');
    if (filterType === 'descans') return radarItems.filter(i => i.sourceType === 'descans' || i.sourceType === 'extensible');
    return radarItems;
  }, [radarItems, filterType]);

  const immediateCount = radarItems.filter(i => i.etaMinutes <= 10).length;
  const reserveCount = radarItems.filter(i => i.sourceType === 'reserva').length;
  const viatgerCount = radarItems.filter(i => i.sourceType === 'viatger').length;
  const descansCount = radarItems.filter(i => i.sourceType === 'descans' || i.sourceType === 'extensible').length;

  return (
    <div className="space-y-4">
      {/* ── Header Card ── */}
      <GlassPanel className="p-5 sm:p-6 border-l-4 border-l-fgc-green relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-fgc-green/15 text-fgc-green flex items-center justify-center shrink-0 shadow-inner">
              <Radio size={24} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-gray-900 dark:text-white uppercase tracking-wider">
                  Radar de Reserves i Proximitat
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-fgc-green/20 text-fgc-grey dark:text-fgc-green uppercase">
                  ETA a {targetStationName} ({cleanTargetSt})
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Calcula el temps de resposta en minuts dels recursos disponibles davant una incidència al tren {circId || 'afectat'}.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <div className="text-right">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Recursos a l'abast</span>
              <span className="text-lg font-black text-gray-900 dark:text-white leading-tight">
                {radarItems.length} agents
              </span>
            </div>
          </div>
        </div>

        {/* ── Filter Pills ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-4 mt-2 border-t border-gray-100 dark:border-white/5 no-scrollbar">
          <button
            onClick={() => { feedback.click(); setFilterType('all'); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${
              filterType === 'all'
                ? 'bg-fgc-grey dark:bg-white text-white dark:text-fgc-grey shadow-md'
                : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            <span>Tots</span>
            <span className="opacity-70 text-[10px]">({radarItems.length})</span>
          </button>

          <button
            onClick={() => { feedback.click(); setFilterType('immediate'); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${
              filterType === 'immediate'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
            }`}
          >
            <Sparkles size={12} />
            <span>Immediats ≤ 10 min</span>
            <span className="opacity-80 text-[10px]">({immediateCount})</span>
          </button>

          <button
            onClick={() => { feedback.click(); setFilterType('reserva'); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${
              filterType === 'reserva'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20'
            }`}
          >
            <ShieldCheck size={12} />
            <span>Reserves</span>
            <span className="opacity-80 text-[10px]">({reserveCount})</span>
          </button>

          <button
            onClick={() => { feedback.click(); setFilterType('viatger'); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${
              filterType === 'viatger'
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20'
            }`}
          >
            <Train size={12} />
            <span>Viatgers</span>
            <span className="opacity-80 text-[10px]">({viatgerCount})</span>
          </button>

          <button
            onClick={() => { feedback.click(); setFilterType('descans'); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${
              filterType === 'descans'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
            }`}
          >
            <Coffee size={12} />
            <span>Descansos / Ext.</span>
            <span className="opacity-80 text-[10px]">({descansCount})</span>
          </button>
        </div>
      </GlassPanel>

      {/* ── Radar List ── */}
      {filteredItems.length === 0 ? (
        <div className="bg-gray-50/50 dark:bg-black/20 rounded-2xl p-8 text-center border border-dashed border-gray-200 dark:border-white/10">
          <Radio size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-gray-400 dark:text-gray-500 font-bold text-xs">
            Cap recurs disponible amb aquest filtre per a {targetStationName}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5">
          {filteredItems.map(item => {
            const isImmediate = item.etaMinutes === 0;
            const isVeryClose = item.etaMinutes > 0 && item.etaMinutes <= 10;
            const isAuditOpen = selectedAuditId === item.id;

            return (
              <div
                key={item.id}
                className={`bg-white dark:bg-gray-800 rounded-2xl p-3.5 sm:p-4 border transition-all hover:shadow-md flex flex-col gap-3 ${
                  isImmediate
                    ? 'border-emerald-300 dark:border-emerald-500/40 shadow-emerald-500/5 bg-gradient-to-r from-emerald-500/[0.04] to-transparent'
                    : 'border-gray-100 dark:border-white/5'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left: ETA badge + Driver Info */}
                  <div className="flex items-center gap-3">
                    {/* ETA Pill */}
                    <div className={`h-11 px-3 rounded-xl flex flex-col items-center justify-center font-black shrink-0 ${
                      isImmediate
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                        : isVeryClose
                        ? 'bg-amber-500 text-black shadow-sm'
                        : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300'
                    }`}>
                      <span className="text-[11px] uppercase tracking-tighter leading-none">
                        {isImmediate ? '⚡ 0 MIN' : `+${item.etaMinutes}m`}
                      </span>
                      <span className="text-[8px] font-bold opacity-80 uppercase tracking-widest mt-0.5">
                        {isImmediate ? 'IMMEDIAT' : 'ETA'}
                      </span>
                    </div>

                    {/* Driver details */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-black bg-gray-100 dark:bg-white/10 px-2 py-0.5 rounded text-gray-800 dark:text-gray-200">
                          {item.shortTorn}
                        </span>
                        <p className="text-sm font-black text-gray-900 dark:text-white truncate">
                          {item.driverName}
                        </p>
                        {item.nomina && (
                          <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase">
                            #{item.nomina}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500 dark:text-gray-400 flex-wrap">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                          {item.sourceLabel}
                        </span>
                        <span>·</span>
                        <span>
                          {isImmediate
                            ? `Al destacament de ${item.currentStationName}`
                            : `Des de ${item.currentStationName} (${item.currentStation})`}
                        </span>
                        {item.extraDetails && (
                          <>
                            <span>·</span>
                            <span className="italic">{item.extraDetails}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Labour Audit Badge + Phone Button */}
                  <div className="flex items-center gap-2 justify-between sm:justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-white/5">
                    {/* Compliance Badge button */}
                    <button
                      onClick={() => {
                        feedback.click();
                        setSelectedAuditId(isAuditOpen ? null : item.id);
                      }}
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 ${item.audit.badgeClass}`}
                      title="Veure auditoria de conveni laboral ferroviari FGC"
                    >
                      {item.audit.score === 'compliant' ? (
                        <ShieldCheck size={13} className="text-emerald-500 shrink-0" />
                      ) : item.audit.score === 'violation' ? (
                        <ShieldAlert size={13} className="text-red-500 shrink-0 animate-pulse" />
                      ) : (
                        <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                      )}
                      <span>{item.audit.label}</span>
                      {isAuditOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>

                    {/* Direct Call Button */}
                    {item.phones && item.phones.length > 0 ? (
                      <div className="flex gap-1">
                        {item.phones.slice(0, 2).map((p, idx) => (
                          <a
                            key={idx}
                            href={isPrivacyMode ? undefined : `tel:${p}`}
                            onClick={() => feedback.click()}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-fgc-grey dark:bg-black text-white hover:bg-fgc-green hover:text-black transition-all text-xs font-black shadow-sm ${
                              isPrivacyMode ? 'cursor-default pointer-events-none' : ''
                            }`}
                            title={`Trucar a ${item.driverName}`}
                          >
                            <Phone size={12} />
                            <span>{isPrivacyMode ? '*** ** ** **' : p}</span>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-gray-400 italic">Sense telèfon</span>
                    )}
                  </div>
                </div>

                {/* ── Labour Compliance Accordion Breakdown (Proposta 7) ── */}
                {isAuditOpen && (
                  <div className="mt-2 pt-3 border-t border-gray-100 dark:border-white/10 bg-gray-50/70 dark:bg-black/30 p-3 rounded-xl space-y-2 text-xs animate-fade-up-premium">
                    <div className="flex items-center justify-between">
                      <span className="font-black uppercase tracking-wider text-[10px] text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                        <ShieldCheck size={12} className="text-fgc-green" />
                        Auditoria de Seguretat Laboral (Conveni FGC BV)
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                        item.audit.score === 'compliant' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      }`}>
                        {item.audit.recommendation}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                      {/* Metric 1 */}
                      <div className="bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-100 dark:border-white/5">
                        <span className="text-[9px] font-bold text-gray-400 block uppercase">Conducció Continuada</span>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="font-mono font-black text-xs text-gray-800 dark:text-gray-200">
                            {Math.floor(item.audit.continuousDrivingMin / 60)}h {item.audit.continuousDrivingMin % 60}m
                          </span>
                          <span className="text-[9px] text-gray-400">Màx 5h 30m</span>
                        </div>
                      </div>

                      {/* Metric 2 */}
                      <div className="bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-100 dark:border-white/5">
                        <span className="text-[9px] font-bold text-gray-400 block uppercase">Descans Computable</span>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="font-mono font-black text-xs text-gray-800 dark:text-gray-200">
                            {item.audit.restBreakMin} minuts
                          </span>
                          <span className="text-[9px] text-gray-400">Mín 30 min</span>
                        </div>
                      </div>

                      {/* Metric 3 */}
                      <div className="bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-100 dark:border-white/5">
                        <span className="text-[9px] font-bold text-gray-400 block uppercase">Jornada + Perllongament</span>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="font-mono font-black text-xs text-gray-800 dark:text-gray-200">
                            {Math.floor(item.audit.totalShiftMin / 60)}h {item.audit.totalShiftMin % 60}m
                          </span>
                          <span className="text-[9px] text-gray-400">Màx 8h 45m (+45')</span>
                        </div>
                      </div>
                    </div>

                    {item.audit.violations.length > 0 && (
                      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 p-2.5 rounded-lg space-y-1">
                        {item.audit.violations.map((v, i) => (
                          <p key={i} className="text-red-600 dark:text-red-400 font-bold text-[11px] flex items-center gap-1.5">
                            <ShieldAlert size={12} className="shrink-0" />
                            <span>{v}</span>
                          </p>
                        ))}
                      </div>
                    )}

                    {item.audit.warnings.length > 0 && (
                      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 p-2.5 rounded-lg space-y-1">
                        {item.audit.warnings.map((w, i) => (
                          <p key={i} className="text-amber-700 dark:text-amber-400 font-medium text-[11px] flex items-center gap-1.5">
                            <AlertTriangle size={12} className="shrink-0" />
                            <span>{w}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RadarReservesPanel;
