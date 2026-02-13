import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Loader2, Clock, Phone, Info, Users, RotateCcw, ArrowRight, MapPin, Coffee, CheckCircle2, AlertTriangle, TrainFront, Footprints, ShieldAlert, UserX, UserCheck, X, ArrowRightLeft, Target, Zap, ArrowUpRight, History, MessageSquareQuote, Scale } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';
import {
  resolveStationId, getTravelTime, getShortTornId,
  getFgcMinutes as getFgcMinutesRaw, formatFgcTime,
} from '../utils/stations';
import { feedback } from '../utils/feedback';

// Thin wrapper: shared getFgcMinutes returns null for invalid input,
// but this component's callers expect 0
const getFgcMinutes = (t: string): number => getFgcMinutesRaw(t) ?? 0;

interface Props {
  selectedServei: string;
  showSecretMenu: boolean;
  isPrivacyMode: boolean;
}

const RESERVE_SHIFTS_LIST = [
  'QRS1', 'QRS2', 'QRS0',
  'QRP0',
  'QRN0',
  'QRF0',
  'QRR1', 'QRR2', 'QRR0', 'QRR4'
];

// resolveStationId, TRAVEL_TIMES, getTravelTime imported from utils/stations.ts

const IncidenciaPerTorn: React.FC<Props> = ({ selectedServei, showSecretMenu, isPrivacyMode }) => {
  const [uncoveredShiftId, setUncoveredShiftId] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [uncoveredShift, setUncoveredShift] = useState<any>(null);
  const [coveragePlan, setCoveragePlan] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [disabledReserves, setDisabledReserves] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);

  // getFgcMinutes and formatFgcTime imported from utils/stations.ts

  const handleInputChange = async (val: string) => {
    setUncoveredShiftId(val.toUpperCase());
    if (val.length >= 1) {
      let q = supabase.from('shifts').select('id').ilike('id', `%${val}%`);
      const { data } = await q.limit(5);
      if (data) setSuggestions(data.map(x => x.id as string));
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const toggleReserveAvailability = (id: string) => {
    feedback.deepClick();
    setDisabledReserves(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // getShortTornId imported from utils/stations.ts

  const fetchFullShift = async (id: string) => {
    const { data: shift } = await supabase.from('shifts').select('*').eq('id', id).single();
    if (!shift) return null;
    const circs = (shift.circulations as any[]) || [];
    const circIds = circs.map(c => {
      const codi = typeof c === 'string' ? c : c.codi;
      if (codi === 'Viatger' && c.observacions) return c.observacions.split('-')[0];
      return codi;
    });
    const { data: details } = await supabase.from('circulations').select('*').in('id', circIds);
    return {
      ...shift,
      fullCirculations: circs.map((cRef: any) => {
        const codi = typeof cRef === 'string' ? cRef : cRef.codi;
        const isViatger = codi === 'Viatger';
        const realCodi = (isViatger && cRef.observacions) ? cRef.observacions.split('-')[0] : codi;
        const d = details?.find(det => det.id === realCodi);
        return { ...d, ...cRef, codi: realCodi, isViatgerOriginal: isViatger };
      }).sort((a: any, b: any) => getFgcMinutes(a.sortida) - getFgcMinutes(b.sortida))
    };
  };

  const calculatePlan = async () => {
    if (!uncoveredShiftId) return;
    setAnalyzing(true);
    setCoveragePlan([]);
    try {
      const target = await fetchFullShift(uncoveredShiftId);
      if (!target) {
        setAnalyzing(false);
        return;
      }
      setUncoveredShift(target);

      const currentServiceStr = selectedServei === 'Tots' ? (target.servei || '') : selectedServei;

      let shiftsQuery = supabase.from('shifts').select('*').neq('id', uncoveredShiftId);
      if (currentServiceStr && currentServiceStr !== 'Tots') {
        shiftsQuery = shiftsQuery.eq('servei', currentServiceStr);
      }

      const { data: otherShiftsRaw } = await shiftsQuery;
      if (!otherShiftsRaw) {
        setAnalyzing(false);
        return;
      }

      const filteredShifts = otherShiftsRaw.filter(s => !disabledReserves.has(s.id));
      const allOtherCircIds = new Set<string>();
      filteredShifts.forEach(s => {
        (s.circulations as any[])?.forEach(c => {
          const codi = typeof c === 'string' ? c : c.codi;
          if (codi && codi !== 'Viatger') allOtherCircIds.add(codi);
        });
      });

      const { data: allCircDetails } = await supabase.from('circulations').select('*').in('id', Array.from(allOtherCircIds));
      const otherShortIds = filteredShifts.map(s => getShortTornId(s.id));
      const { data: allDaily } = await supabase.from('daily_assignments').select('*').in('torn', otherShortIds);
      const { data: allPhones } = await supabase.from('phonebook').select('nomina, phones');

      const plan = target.fullCirculations.map((circ: any) => {
        const cStart = getFgcMinutes(circ.sortida);
        const cEnd = getFgcMinutes(circ.arribada);
        const cInici = circ.inici;
        const cFinal = circ.final;
        const candidates: any[] = [];

        for (const s of filteredShifts) {
          const sIniciTorn = getFgcMinutes(s.inici_torn);
          const sFinalTorn = getFgcMinutes(s.final_torn);
          if (sIniciTorn > cStart || sFinalTorn < cEnd) continue;

          const sCircsEnriched = (s.circulations as any[] || []).map((ref: any) => {
            const codi = typeof ref === 'string' ? ref : ref.codi;
            const det = allCircDetails?.find(d => d.id === codi);
            return { ...det, ...ref, codi };
          }).sort((a: any, b: any) => getFgcMinutes(a.sortida) - getFgcMinutes(b.sortida));

          const gaps: { start: number, end: number, fromLoc: string, toLoc: string }[] = [];
          let currentPos = sIniciTorn;
          let currentLoc = s.dependencia || '??';

          sCircsEnriched.forEach((sc: any) => {
            const scStart = getFgcMinutes(sc.sortida);
            const scEnd = getFgcMinutes(sc.arribada);
            if (scStart > currentPos) {
              gaps.push({ start: currentPos, end: scStart, fromLoc: currentLoc, toLoc: sc.inici || currentLoc });
            }
            currentPos = Math.max(currentPos, scEnd);
            currentLoc = sc.final || currentLoc;
          });

          if (sFinalTorn > currentPos) {
            gaps.push({ start: currentPos, end: sFinalTorn, fromLoc: currentLoc, toLoc: s.dependencia || currentLoc });
          }

          const matchingGap = gaps.find(g => g.start <= (cStart + 1) && g.end >= (cEnd - 1));
          if (matchingGap) {
            const timeToReachOrigin = getTravelTime(matchingGap.fromLoc, cInici);
            const arrivalAtOrigin = matchingGap.start + timeToReachOrigin;
            const canReachOnTime = arrivalAtOrigin <= (cStart - (timeToReachOrigin > 0 ? 1 : 0));

            const timeToReturn = getTravelTime(cFinal, matchingGap.toLoc);
            const arrivalAtNextTask = cEnd + timeToReturn;
            const canReturnOnTime = arrivalAtNextTask <= (matchingGap.end - (timeToReturn > 0 ? 1 : 0));

            if (canReachOnTime && canReturnOnTime) {
              const assignment = allDaily?.find(d => d.torn === getShortTornId(s.id));
              if (assignment) {
                const phones = allPhones?.find(p => p.nomina === assignment.empleat_id)?.phones || [];
                candidates.push({
                  shiftId: s.id,
                  driver: `${assignment.cognoms}, ${assignment.nom}`,
                  phones,
                  gap: matchingGap,
                  logistics: {
                    from: matchingGap.fromLoc,
                    to: matchingGap.toLoc,
                    travelToOrigin: timeToReachOrigin,
                    travelFromEnd: timeToReturn,
                    needsTravelTo: resolveStationId(matchingGap.fromLoc) !== resolveStationId(cInici),
                    needsTravelBack: resolveStationId(cFinal) !== resolveStationId(matchingGap.toLoc)
                  },
                  marginBefore: cStart - arrivalAtOrigin,
                  marginAfter: matchingGap.end - arrivalAtNextTask
                });
              }
            }
          }
        }
        return { circ, candidates: candidates.sort((a, b) => (b.marginBefore + b.marginAfter) - (a.marginBefore + a.marginAfter)) };
      });
      setCoveragePlan(plan);
    } catch (e) {
      console.error("Error al calcular el pla:", e);
    } finally {
      setAnalyzing(false);
    }
  };

  const coverageStats = useMemo(() => {
    if (!coveragePlan.length) return null;
    const covered = coveragePlan.filter(p => p.candidates.length > 0).length;
    const uncovered = coveragePlan.filter(p => p.candidates.length === 0);
    return { total: coveragePlan.length, covered, uncovered };
  }, [coveragePlan]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-white dark:bg-gray-900 rounded-[32px] p-8 shadow-sm border border-gray-100 dark:border-white/5 transition-colors h-full flex flex-col justify-center">
          <div className="max-w-2xl mx-auto space-y-6 text-center w-full">
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500"><RotateCcw size={32} /></div>
              <h3 className="text-xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Anàlisi Logística</h3>
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 max-w-sm">Detecció automàtica de servei i marges de relleu al segon.</p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 relative">
              <div className="relative flex-1">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={24} />
                <input
                  type="text"
                  placeholder="Torn descobert (Ex: Q031)..."
                  value={uncoveredShiftId}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && calculatePlan()}
                  className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[24px] sm:rounded-[28px] py-5 sm:py-6 pl-14 sm:pl-16 pr-8 focus:ring-4 focus:ring-blue-500/20 outline-none text-lg sm:text-xl font-bold transition-all dark:text-white shadow-inner"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-2 right-2 mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 z-[50] overflow-hidden animate-in slide-in-from-top-2">
                    {suggestions.map(s => (
                      <button key={s} onClick={() => { setUncoveredShiftId(s); setShowSuggestions(false); }} className="w-full text-left px-6 py-4 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-bold transition-colors flex items-center justify-between border-b border-gray-50 dark:border-white/5 last:border-0 dark:text-white"><span>{s}</span><ArrowRight size={16} className="text-blue-500" /></button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => { feedback.deepClick(); calculatePlan(); }}
                disabled={analyzing || !uncoveredShiftId}
                className="bg-blue-600 text-white px-8 py-5 sm:py-3 rounded-[24px] sm:rounded-2xl font-black text-sm sm:text-base hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-blue-500/20 disabled:opacity-50 whitespace-nowrap flex items-center justify-center gap-2"
              >
                {analyzing ? <Loader2 className="animate-spin" size={20} /> : <><RotateCcw size={18} /> ANALITZAR</>}
              </button>
            </div>
          </div>
        </div>
        <div className="lg:col-span-4 bg-white dark:bg-gray-900 rounded-[32px] p-6 shadow-sm border border-gray-100 dark:border-white/5 transition-colors h-full">
          <div className="flex items-center gap-2 mb-4 px-2"><ShieldAlert size={16} className="text-orange-500" /><h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Disponibilitat de Reserves</h4></div>
          <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
            {RESERVE_SHIFTS_LIST.map(id => {
              const isUnavailable = disabledReserves.has(id);
              return (<button key={id} onClick={() => toggleReserveAvailability(id)} className={`flex items-center justify-between p-3 rounded-xl border font-black text-[11px] transition-all ${isUnavailable ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 text-red-500 opacity-60' : 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900 text-green-600'}`}><span>{id}</span>{isUnavailable ? <UserX size={12} /> : <UserCheck size={12} />}</button>);
            })}
          </div>
        </div>
      </div>

      {analyzing ? (
        <div className="py-32 flex flex-col items-center justify-center gap-6 opacity-30"><Loader2 size={64} className="animate-spin text-blue-500" /><div className="text-center space-y-1"><p className="text-lg font-black uppercase tracking-[0.2em] text-fgc-grey dark:text-white">Escanejant xarxa ferroviària</p><p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Calculant relleus optimitzats per marges de 1 min...</p></div></div>
      ) : coveragePlan.length > 0 ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-900 rounded-[32px] p-6 border border-gray-100 dark:border-white/5 shadow-sm flex items-center gap-5">
              <div className={`p-4 rounded-2xl ${coverageStats?.uncovered.length ? 'bg-red-500 text-white' : 'bg-fgc-green text-fgc-grey'} shadow-lg`}>{coverageStats?.uncovered.length ? <ShieldAlert size={28} /> : <CheckCircle2 size={28} />}</div>
              <div><h4 className="text-sm font-black text-fgc-grey dark:text-white uppercase tracking-tight">Estat del Torn {uncoveredShiftId}</h4><p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{coverageStats?.covered} de {coverageStats?.total} trens coberts</p></div>
            </div>
            <div className={`bg-white dark:bg-gray-900 rounded-[32px] p-6 border shadow-sm flex items-center gap-5 transition-all ${coverageStats?.uncovered.length ? 'border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20' : 'border-gray-100 dark:border-white/5'}`}>
              <div className={`p-4 rounded-2xl ${coverageStats?.uncovered.length ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-100 dark:bg-white/5 text-gray-400'} shadow-lg`}><AlertTriangle size={28} /></div>
              <div><h4 className={`text-sm font-black uppercase tracking-tight ${coverageStats?.uncovered.length ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>Riscos detectats</h4><p className={`text-xs font-bold uppercase tracking-widest ${coverageStats?.uncovered.length ? 'text-red-500/70' : 'text-gray-300'}`}>{coverageStats?.uncovered.length || 0} trens sense cobertura directa</p></div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-[32px] p-6 sm:p-8 border border-gray-100 dark:border-white/5 shadow-sm">
            <div className="flex items-center gap-4 border-b border-gray-100 dark:border-white/5 pb-4 mb-8">
              <div className="h-10 min-w-[3rem] bg-blue-600 text-white rounded-xl flex items-center justify-center font-black text-lg shadow-md">{uncoveredShiftId}</div>
              <div><h4 className="text-sm font-black text-fgc-grey dark:text-white uppercase tracking-tight">Pla de Cobertura Logística</h4><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Marges optimitzats (1 min) | Sincronitzat amb Reserves</p></div>
            </div>
            <div className="space-y-16">
              {coveragePlan.map((item, idx) => (
                <div key={idx} className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-gray-100 dark:bg-white/5 p-4 rounded-3xl border border-gray-200 dark:border-white/10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><TrainFront size={80} /></div>
                    <div className={`px-4 py-2 ${item.circ.isViatgerOriginal ? 'bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800' : 'bg-fgc-grey'} text-white rounded-2xl font-black text-lg shadow-sm flex items-center justify-center min-w-[80px]`}>{item.circ.codi}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1"><p className="text-base font-black text-fgc-grey dark:text-gray-200 uppercase tracking-tight">{item.circ.inici} → {item.circ.final}</p><span className="bg-fgc-green/20 text-fgc-green px-2 py-0.5 rounded text-[9px] font-black uppercase border border-fgc-green/20">S-{item.circ.linia}</span></div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><div className="flex items-center gap-1.5 text-xs font-bold text-gray-500"><Clock size={14} className="text-blue-500" /> {item.circ.sortida} — {item.circ.arribada}</div><div className="flex items-center gap-1.5 text-xs font-bold text-fgc-green"><MapPin size={14} /> Vies: {item.circ.via_inici} / {item.circ.via_final}</div></div>
                    </div>
                    {item.candidates.length === 0 && <div className="bg-red-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-red-500/20 border border-red-400">SENSE COBERTURA DIRECTA</div>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pl-4 border-l-2 border-dashed border-gray-200 dark:border-white/10">
                    {item.candidates.length > 0 ? (
                      item.candidates.map((cand: any, cIdx: number) => {
                        const isBestOption = cIdx === 0;
                        const isReserve = cand.shiftId.startsWith('QR');
                        return (
                          <div key={cIdx} className={`p-5 rounded-[32px] border transition-all group flex flex-col h-full relative overflow-hidden ${isBestOption ? 'bg-white dark:bg-gray-800 border-blue-400 ring-2 ring-blue-500/20 shadow-xl scale-[1.02] z-10' : 'bg-gray-50/50 dark:bg-gray-800/40 border-gray-100 dark:border-white/5 shadow-sm opacity-80 hover:opacity-100'}`}>
                            <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><span className={`${isReserve ? 'bg-fgc-green text-fgc-grey' : 'bg-fgc-grey dark:bg-black text-white'} text-[10px] font-black px-2.5 py-1 rounded-xl shadow-sm`}>{cand.shiftId}</span>{isReserve && <span className="bg-fgc-green/10 text-fgc-green text-[9px] font-black px-2 py-1 rounded-lg border border-fgc-green/20">RESERVA</span>}</div><div className="text-right"><p className="text-[10px] font-black text-blue-500 uppercase leading-none mb-1">Marge</p><p className="text-lg font-black text-fgc-grey dark:text-gray-200 leading-none">{cand.marginBefore + cand.marginAfter}m</p></div></div>
                            <p className="text-base font-black text-fgc-grey dark:text-gray-200 uppercase truncate leading-tight mb-4">{cand.driver}</p>
                            <div className="flex-1 space-y-3 mb-6">
                              <div className={`p-3 rounded-2xl border transition-colors flex items-start gap-3 ${cand.logistics.needsTravelTo ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/30' : 'bg-gray-50/50 dark:bg-black/20 border-gray-100 dark:border-white/5'}`}><div className={`p-1.5 rounded-lg shrink-0 ${cand.logistics.needsTravelTo ? 'bg-orange-500 text-white' : 'bg-fgc-green text-fgc-grey'}`}>{cand.logistics.needsTravelTo ? <Footprints size={14} /> : <CheckCircle2 size={14} />}</div><div className="min-w-0"><p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter">Accés al tren</p><p className="text-xs font-bold text-fgc-grey dark:text-gray-300 truncate">{cand.logistics.needsTravelTo ? `Viatger: ${cand.logistics.from} → ${item.circ.inici} (${cand.logistics.travelToOrigin} min)` : `Ja a ${item.circ.inici}`}</p></div></div>
                              <div className={`p-3 rounded-2xl border transition-colors flex items-start gap-3 ${cand.logistics.needsTravelBack ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/30' : 'bg-gray-50/50 dark:bg-black/20 border-gray-100 dark:border-white/5'}`}><div className={`p-1.5 rounded-lg shrink-0 ${cand.logistics.needsTravelBack ? 'bg-orange-500 text-white' : 'bg-fgc-green text-fgc-grey'}`}>{cand.logistics.needsTravelBack ? <Footprints size={14} /> : <CheckCircle2 size={14} />}</div><div className="min-w-0"><p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter">Retorn/Proper</p><p className="text-xs font-bold text-fgc-grey dark:text-gray-300 truncate">{cand.logistics.needsTravelBack ? `Viatger: ${item.circ.final} → ${cand.logistics.to} (${cand.logistics.travelFromEnd} min)` : `Ja a base: ${item.circ.final}`}</p></div></div>
                            </div>
                            <div className="flex gap-2 pt-4 border-t border-gray-100 dark:border-white/5 mt-auto">{cand.phones.map((p: string, i: number) => (
                              <a key={i} href={isPrivacyMode ? undefined : `tel:${p}`} className={`flex-1 bg-fgc-grey dark:bg-black text-white hover:bg-fgc-green hover:text-fgc-grey transition-all py-3 rounded-2xl flex items-center justify-center gap-2 shadow-sm ${isPrivacyMode ? 'cursor-default' : ''}`}>
                                <Phone size={14} />
                                <span className="text-xs font-black">{isPrivacyMode ? '*** ** ** **' : p}</span>
                              </a>
                            ))}</div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="col-span-full py-10 flex flex-col items-center justify-center gap-3 bg-red-50/30 dark:bg-red-950/10 rounded-[32px] border-2 border-dashed border-red-100 dark:border-red-900/30"><AlertTriangle size={32} className="text-red-400 mb-2" /><p className="text-sm font-black text-red-600 dark:text-red-400 uppercase tracking-widest text-center px-4">Cap relleu directe viable</p></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : uncoveredShiftId && !analyzing ? (
        <div className="py-20 text-center opacity-30 flex flex-col items-center gap-4"><Info size={48} className="text-gray-400" /><p className="text-sm font-bold text-gray-500 uppercase tracking-widest italic">Introdueix un torn per calcular cobertures</p></div>
      ) : null}
    </div>
  );
};

export default IncidenciaPerTorn;