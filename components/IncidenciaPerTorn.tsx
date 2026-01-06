import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Loader2, Clock, Phone, Info, Users, RotateCcw, ArrowRight, MapPin, Coffee, CheckCircle2, AlertTriangle, TrainFront, Footprints, ShieldAlert, Sparkles, UserX, UserCheck } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';

interface Props {
  selectedServei: string;
}

// Llista de torns de reserva estàndard per gestionar disponibilitat
const RESERVE_SHIFTS_LIST = [
  'QRS1', 'QRS2', 'QRS0', 
  'QRP0', 
  'QRN0', 
  'QRF0', 
  'QRR1', 'QRR2', 'QRR0', 'QRR4'
];

// Matriu simplificada de temps de viatge entre nodes clau (en minuts)
const TRAVEL_TIMES: Record<string, number> = {
  'PC-SR': 10, 'SR-PC': 10,
  'SR-SC': 15, 'SC-SR': 15,
  'SC-RB': 8, 'RB-SC': 8,
  'RB-TR': 10, 'TR-RB': 10,
  'TR-NA': 5, 'NA-TR': 5,
  'SC-PN': 15, 'PN-SC': 15,
  'PC-SC': 25, 'SC-PC': 25,
  'SR-RE': 5, 'RE-SR': 5,
  'GR-TB': 8, 'TB-GR': 8,
};

const getTravelTime = (from: string, to: string): number => {
  const f = from?.toUpperCase().trim();
  const t = to?.toUpperCase().trim();
  if (!f || !t || f === t) return 0;
  
  // Cerca directa a la matriu
  if (TRAVEL_TIMES[`${f}-${t}`]) return TRAVEL_TIMES[`${f}-${t}`];
  
  // Cerca combinada (simplificada per als nodes principals)
  if ((f === 'PC' && t === 'RB') || (f === 'RB' && t === 'PC')) return 35;
  if ((f === 'PC' && t === 'PN') || (f === 'PN' && t === 'PC')) return 40;
  if ((f === 'PC' && t === 'NA') || (f === 'NA' && t === 'PC')) return 45;
  if ((f === 'SR' && t === 'RB') || (f === 'RB' && t === 'SR')) return 25;
  if ((f === 'SR' && t === 'PN') || (f === 'PN' && t === 'SR')) return 30;
  
  return 20; // Valor per defecte si no es troba la ruta
};

const IncidenciaPerTorn: React.FC<Props> = ({ selectedServei }) => {
  const [uncoveredShiftId, setUncoveredShiftId] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [uncoveredShift, setUncoveredShift] = useState<any>(null);
  const [coveragePlan, setCoveragePlan] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [disabledReserves, setDisabledReserves] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function getFgcMinutes(timeStr: string) {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    let total = h * 60 + m;
    if (h < 4) total += 24 * 60;
    return total;
  }

  function formatFgcTime(totalMinutes: number) {
    let mins = totalMinutes;
    if (mins >= 24 * 60) mins -= 24 * 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  const handleInputChange = async (val: string) => {
    setUncoveredShiftId(val.toUpperCase());
    if (val.length >= 1) {
      let q = supabase.from('shifts').select('id').ilike('id', `%${val}%`);
      if (selectedServei !== 'Tots') q = q.eq('servei', selectedServei);
      const { data } = await q.limit(5);
      if (data) setSuggestions(data.map(x => x.id as string));
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const toggleReserveAvailability = (id: string) => {
    setDisabledReserves(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getShortTornId = (id: string) => {
    const trimmed = id.trim();
    if (trimmed.startsWith('Q') && !trimmed.startsWith('QR') && trimmed.length === 5) return trimmed[0] + trimmed.slice(2);
    return trimmed;
  };

  const fetchFullShift = async (id: string) => {
    const { data: shift } = await supabase.from('shifts').select('*').eq('id', id).single();
    if (!shift) return null;
    
    const { data: details } = await supabase.from('circulations').select('*').in('id', (shift.circulations as any[]).map(c => typeof c === 'string' ? c : c.codi));
    
    return {
      ...shift,
      fullCirculations: (shift.circulations as any[]).map((cRef: any) => {
        const codi = typeof cRef === 'string' ? cRef : cRef.codi;
        const d = details?.find(det => det.id === codi);
        return { ...d, ...cRef, codi };
      }).sort((a: any, b: any) => getFgcMinutes(a.sortida) - getFgcMinutes(b.sortida))
    };
  };

  const calculatePlan = async () => {
    if (!uncoveredShiftId) return;
    setAnalyzing(true);
    setCoveragePlan([]);
    
    try {
      const target = await fetchFullShift(uncoveredShiftId);
      if (!target) return;
      setUncoveredShift(target);

      const { data: otherShiftsRaw } = await supabase.from('shifts').select('*').eq('servei', selectedServei).neq('id', uncoveredShiftId);
      if (!otherShiftsRaw) return;

      // Filtrar torns de reserva que l'usuari ha marcat com a no disponibles
      const filteredShifts = otherShiftsRaw.filter(s => !disabledReserves.has(s.id));

      const allOtherCircIds = new Set<string>();
      filteredShifts.forEach(s => {
        (s.circulations as any[]).forEach(c => {
          const codi = typeof c === 'string' ? c : c.codi;
          if (codi && codi !== 'Viatger') allOtherCircIds.add(codi);
        });
      });
      const { data: allCircDetails } = await supabase.from('circulations').select('*').in('id', Array.from(allOtherCircIds));

      const otherShortIds = filteredShifts.map(s => getShortTornId(s.id));
      const { data: allDaily } = await supabase.from('daily_assignments').select('*').in('torn', otherShortIds);
      const { data: allPhones } = await supabase.from('phonebook').select('nomina, phones');

      const plan = await Promise.all(target.fullCirculations.map(async (circ: any) => {
        if (circ.codi === 'Viatger') return { circ, candidates: [] };

        const cStart = getFgcMinutes(circ.sortida);
        const cEnd = getFgcMinutes(circ.arribada);
        const cInici = circ.inici?.toUpperCase().trim();
        const cFinal = circ.final?.toUpperCase().trim();
        
        const candidates: any[] = [];

        for (const s of filteredShifts) {
          const sIniciTorn = getFgcMinutes(s.inici_torn);
          const sFinalTorn = getFgcMinutes(s.final_torn);
          
          if (sIniciTorn > (cStart - 10) || sFinalTorn < (cEnd + 10)) continue;

          const sCircsRefs = (s.circulations as any[]).sort((a:any, b:any) => {
            const tA = getFgcMinutes(typeof a === 'string' ? a : a.sortida);
            const tB = getFgcMinutes(typeof b === 'string' ? b : b.sortida);
            return tA - tB;
          });

          const sCircsEnriched = sCircsRefs.map((ref: any) => {
            const codi = typeof ref === 'string' ? ref : ref.codi;
            const det = allCircDetails?.find(d => d.id === codi);
            return { ...det, ...ref, codi };
          });
          
          const gaps: { start: number, end: number, fromLoc: string, toLoc: string }[] = [];
          let currentPos = sIniciTorn;
          let currentLoc = s.dependencia?.toUpperCase().trim() || '??';

          sCircsEnriched.forEach((sc: any) => {
            const scStart = getFgcMinutes(sc.sortida);
            const scEnd = getFgcMinutes(sc.arribada);
            if (scStart > currentPos) {
              gaps.push({ start: currentPos, end: scStart, fromLoc: currentLoc, toLoc: sc.inici?.toUpperCase().trim() || currentLoc });
            }
            currentPos = Math.max(currentPos, scEnd);
            currentLoc = sc.final?.toUpperCase().trim() || currentLoc;
          });
          if (sFinalTorn > currentPos) {
            gaps.push({ start: currentPos, end: sFinalTorn, fromLoc: currentLoc, toLoc: s.dependencia?.toUpperCase().trim() || currentLoc });
          }

          const matchingGap = gaps.find(g => g.start <= (cStart - 5) && g.end >= (cEnd + 5));
          
          if (matchingGap) {
            const timeToReachOrigin = getTravelTime(matchingGap.fromLoc, cInici);
            const arrivalAtOrigin = matchingGap.start + timeToReachOrigin;
            const canReachOnTime = arrivalAtOrigin <= (cStart - 5);

            const timeToReturn = getTravelTime(cFinal, matchingGap.toLoc);
            const arrivalAtNextTask = cEnd + timeToReturn;
            const canReturnOnTime = arrivalAtNextTask <= (matchingGap.end - 5);

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
                    needsTravelTo: matchingGap.fromLoc !== cInici,
                    needsTravelBack: cFinal !== matchingGap.toLoc
                  },
                  marginBefore: cStart - arrivalAtOrigin,
                  marginAfter: matchingGap.end - arrivalAtNextTask
                });
              }
            }
          }
        }

        return {
          circ,
          candidates: candidates.sort((a, b) => (b.marginBefore + b.marginAfter) - (a.marginBefore + a.marginAfter))
        };
      }));

      setCoveragePlan(plan);
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzing(false);
    }
  };

  const coverageStats = useMemo(() => {
    if (!coveragePlan.length) return null;
    const realCircs = coveragePlan.filter(p => p.circ.codi !== 'Viatger');
    const total = realCircs.length;
    const covered = realCircs.filter(p => p.candidates.length > 0).length;
    const uncovered = realCircs.filter(p => p.candidates.length === 0);
    return { total, covered, uncovered };
  }, [coveragePlan]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Search Section */}
        <div className="lg:col-span-8 bg-white dark:bg-gray-900 rounded-[32px] p-8 shadow-sm border border-gray-100 dark:border-white/5 transition-colors h-full flex flex-col justify-center">
          <div className="max-w-2xl mx-auto space-y-6 text-center w-full">
            <div className="flex flex-col items-center gap-3">
               <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500"><RotateCcw size={32} /></div>
               <h3 className="text-xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Anàlisi Logística per Torn</h3>
               <p className="text-xs font-bold text-gray-400 dark:text-gray-500 max-w-sm">Cerca un pla de cobertura optimitzat excloent reserves no disponibles.</p>
            </div>
            <div className="relative" ref={containerRef}>
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={24} />
              <input 
                type="text" 
                placeholder="Codi del torn (Ex: Q031)..." 
                value={uncoveredShiftId} 
                onChange={(e) => handleInputChange(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && calculatePlan()}
                className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[28px] py-6 pl-16 pr-8 focus:ring-4 focus:ring-blue-500/20 outline-none text-xl font-bold transition-all dark:text-white shadow-inner" 
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-2 right-2 mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 z-[50] overflow-hidden animate-in slide-in-from-top-2">
                  {suggestions.map(s => (
                    <button key={s} onClick={() => { setUncoveredShiftId(s); setShowSuggestions(false); }} className="w-full text-left px-6 py-4 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-bold transition-colors flex items-center justify-between border-b border-gray-50 dark:border-white/5 last:border-0 dark:text-white">
                      <span>{s}</span>
                      <ArrowRight size={16} className="text-blue-500" />
                    </button>
                  ))}
                </div>
              )}
              <button 
                onClick={calculatePlan} 
                disabled={analyzing || !uncoveredShiftId} 
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50"
              >
                {analyzing ? <Loader2 className="animate-spin" size={20} /> : 'ANALITZAR'}
              </button>
            </div>
          </div>
        </div>

        {/* Reserve Availability Section */}
        <div className="lg:col-span-4 bg-white dark:bg-gray-900 rounded-[32px] p-6 shadow-sm border border-gray-100 dark:border-white/5 transition-colors h-full">
           <div className="flex items-center gap-2 mb-4 px-2">
              <ShieldAlert size={16} className="text-orange-500" />
              <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Disponibilitat de Reserves</h4>
           </div>
           <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
              {RESERVE_SHIFTS_LIST.map(id => {
                const isUnavailable = disabledReserves.has(id);
                return (
                  <button 
                    key={id} 
                    onClick={() => toggleReserveAvailability(id)}
                    className={`flex items-center justify-between p-3 rounded-xl border font-black text-[11px] transition-all ${
                      isUnavailable 
                        ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 text-red-500 opacity-60' 
                        : 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900 text-green-600'
                    }`}
                  >
                    <span>{id}</span>
                    {isUnavailable ? <UserX size={12} /> : <UserCheck size={12} />}
                  </button>
                );
              })}
           </div>
           <p className="mt-4 text-[9px] font-bold text-gray-400 dark:text-gray-500 italic px-2">
             * Els torns en vermell s'exclouran del càlcul de buits de cobertura.
           </p>
        </div>
      </div>

      {analyzing ? (
        <div className="py-32 flex flex-col items-center justify-center gap-6 opacity-30">
          <Loader2 size={64} className="animate-spin text-blue-500" />
          <div className="text-center space-y-1">
            <p className="text-lg font-black uppercase tracking-[0.2em] text-fgc-grey dark:text-white">Processant logística de xarxa</p>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Calculant desplaçaments i enllaços...</p>
          </div>
        </div>
      ) : coveragePlan.length > 0 ? (
        <div className="space-y-8">
          {/* Summary Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-900 rounded-[32px] p-6 border border-gray-100 dark:border-white/5 shadow-sm flex items-center gap-5">
              <div className={`p-4 rounded-2xl ${coverageStats?.uncovered.length ? 'bg-red-500 text-white' : 'bg-fgc-green text-fgc-grey'} shadow-lg`}>
                {coverageStats?.uncovered.length ? <ShieldAlert size={28} /> : <CheckCircle2 size={28} />}
              </div>
              <div>
                <h4 className="text-sm font-black text-fgc-grey dark:text-white uppercase tracking-tight">Estat del Torn {uncoveredShiftId}</h4>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  {coverageStats?.covered} de {coverageStats?.total} circulacions cobertes
                </p>
              </div>
            </div>

            {coverageStats && coverageStats.uncovered.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950/20 rounded-[32px] p-6 border border-red-100 dark:border-red-900/40 shadow-sm flex items-center gap-5 animate-in shake duration-500">
                <div className="p-4 bg-red-600 text-white rounded-2xl shadow-lg">
                  <AlertTriangle size={28} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-red-600 dark:text-red-400 uppercase tracking-tight">Possible supressió de circulació</h4>
                  <p className="text-xs font-bold text-red-500/70 uppercase tracking-widest leading-tight">
                    {coverageStats.uncovered.length} circulacions no tenen candidats viables
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-[32px] p-6 sm:p-8 border border-gray-100 dark:border-white/5 shadow-sm">
             <div className="flex items-center gap-4 border-b border-gray-100 dark:border-white/5 pb-4 mb-8">
                <div className="h-10 min-w-[3rem] bg-blue-600 text-white rounded-xl flex items-center justify-center font-black text-lg shadow-md">{uncoveredShiftId}</div>
                <div>
                  <h4 className="text-sm font-black text-fgc-grey dark:text-white uppercase tracking-tight">Pla de Cobertura amb Logística</h4>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{uncoveredShift?.fullCirculations.length} circulacions analitzades</p>
                </div>
             </div>
             
             <div className="space-y-16">
                {coveragePlan.map((item, idx) => {
                  const isViatger = item.circ.codi === 'Viatger';
                  if (isViatger) return null;

                  return (
                    <div key={idx} className="space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-gray-100 dark:bg-white/5 p-4 rounded-3xl border border-gray-200 dark:border-white/10 relative overflow-hidden">
                         <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><TrainFront size={80} /></div>
                         <div className={`px-4 py-2 bg-fgc-grey text-white rounded-2xl font-black text-lg shadow-sm flex items-center justify-center min-w-[80px]`}>{item.circ.codi}</div>
                         <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                               <p className="text-base font-black text-fgc-grey dark:text-gray-200 uppercase tracking-tight">{item.circ.inici} → {item.circ.final}</p>
                               <span className="bg-fgc-green/20 text-fgc-green px-2 py-0.5 rounded text-[9px] font-black uppercase border border-fgc-green/20">S-{item.circ.linia}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                               <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500"><Clock size={14} className="text-blue-500" /> {item.circ.sortida} — {item.circ.arribada}</div>
                               <div className="flex items-center gap-1.5 text-xs font-bold text-fgc-green"><MapPin size={14} /> Vies: {item.circ.via_inici} / {item.circ.via_final}</div>
                            </div>
                         </div>
                         {item.candidates.length === 0 && (
                           <div className="bg-red-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-red-500/20 border border-red-400">
                             SUPRESSIÓ PROPOSADA
                           </div>
                         )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pl-4 border-l-2 border-dashed border-gray-200 dark:border-white/10">
                         {item.candidates.length > 0 ? (
                           item.candidates.map((cand: any, cIdx: number) => {
                             const isBestOption = cIdx === 0;
                             return (
                               <div key={cIdx} className={`p-5 rounded-[32px] border transition-all group flex flex-col h-full relative overflow-hidden ${isBestOption ? 'bg-white dark:bg-gray-800 border-blue-400 ring-2 ring-blue-500/20 shadow-xl scale-[1.02] z-10' : 'bg-gray-50/50 dark:bg-gray-800/40 border-gray-100 dark:border-white/5 shadow-sm opacity-80 hover:opacity-100'}`}>
                                  {isBestOption && (
                                    <div className="absolute top-0 right-0 bg-blue-600 text-white px-4 py-1.5 rounded-bl-2xl text-[9px] font-black uppercase flex items-center gap-1.5 shadow-md">
                                      <Sparkles size={10} /> Millor Opció
                                    </div>
                                  )}
                                  
                                  <div className="flex items-center justify-between mb-4">
                                     <div className="flex items-center gap-2">
                                        <span className="bg-fgc-grey dark:bg-black text-white text-[10px] font-black px-2.5 py-1 rounded-xl shadow-sm">{cand.shiftId}</span>
                                        {cand.marginBefore + cand.marginAfter > 60 && <span className="bg-fgc-green/10 text-fgc-green text-[9px] font-black px-2 py-1 rounded-lg border border-fgc-green/20">OPTIM</span>}
                                     </div>
                                     <div className="text-right">
                                        <p className="text-[10px] font-black text-blue-500 uppercase leading-none mb-1">Marge Total</p>
                                        <p className="text-lg font-black text-fgc-grey dark:text-gray-200 leading-none">{cand.marginBefore + cand.marginAfter}m</p>
                                     </div>
                                  </div>
                                  
                                  <p className="text-base font-black text-fgc-grey dark:text-gray-200 uppercase truncate leading-tight mb-4">{cand.driver}</p>
                                  
                                  <div className="flex-1 space-y-3 mb-6">
                                     <div className={`p-3 rounded-2xl border transition-colors flex items-start gap-3 ${cand.logistics.needsTravelTo ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/30' : 'bg-gray-50/50 dark:bg-black/20 border-gray-100 dark:border-white/5'}`}>
                                        <div className={`p-1.5 rounded-lg shrink-0 ${cand.logistics.needsTravelTo ? 'bg-orange-500 text-white' : 'bg-fgc-green text-fgc-grey'}`}>
                                           {cand.logistics.needsTravelTo ? <Footprints size={14} /> : <CheckCircle2 size={14} />}
                                        </div>
                                        <div className="min-w-0">
                                           <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter">Inici Cobertura</p>
                                           <p className="text-xs font-bold text-fgc-grey dark:text-gray-300 truncate">
                                              {cand.logistics.needsTravelTo 
                                                ? `Viatger: ${cand.logistics.from} → ${item.circ.inici} (${cand.logistics.travelToOrigin} min)` 
                                                : `Ja es troba a ${item.circ.inici}`}
                                           </p>
                                        </div>
                                     </div>

                                     <div className={`p-3 rounded-2xl border transition-colors flex items-start gap-3 ${cand.logistics.needsTravelBack ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/30' : 'bg-gray-50/50 dark:bg-black/20 border-gray-100 dark:border-white/5'}`}>
                                        <div className={`p-1.5 rounded-lg shrink-0 ${cand.logistics.needsTravelBack ? 'bg-orange-500 text-white' : 'bg-fgc-green text-fgc-grey'}`}>
                                           {cand.logistics.needsTravelBack ? <Footprints size={14} /> : <CheckCircle2 size={14} />}
                                        </div>
                                        <div className="min-w-0">
                                           <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter">Final Cobertura</p>
                                           <p className="text-xs font-bold text-fgc-grey dark:text-gray-300 truncate">
                                              {cand.logistics.needsTravelBack 
                                                ? `Retorn: ${item.circ.final} → ${cand.logistics.to} (${cand.logistics.travelFromEnd} min)` 
                                                : `Finalitza a la seva base: ${item.circ.final}`}
                                           </p>
                                        </div>
                                     </div>
                                  </div>

                                  <div className="flex gap-2 pt-4 border-t border-gray-100 dark:border-white/5 mt-auto">
                                     {cand.phones.map((p: string, i: number) => (
                                       <a key={i} href={`tel:${p}`} className="flex-1 bg-fgc-grey dark:bg-black text-white hover:bg-fgc-green hover:text-fgc-grey transition-all py-3 rounded-2xl flex items-center justify-center gap-2 shadow-sm"><Phone size={14} /><span className="text-xs font-black">{p}</span></a>
                                     ))}
                                  </div>
                               </div>
                             );
                           })
                         ) : (
                           <div className="col-span-full py-10 flex flex-col items-center justify-center gap-3 bg-red-50/30 dark:bg-red-950/10 rounded-[32px] border-2 border-dashed border-red-100 dark:border-red-900/30">
                              <AlertTriangle size={32} className="text-red-400 mb-2" />
                              <p className="text-sm font-black text-red-600 dark:text-red-400 uppercase tracking-widest text-center px-4">Cap buit compatible detectat<br/><span className="text-[10px] font-bold opacity-60">Possible supressió de circulació per falta de cobertura</span></p>
                           </div>
                         )}
                      </div>
                    </div>
                  );
                })}
             </div>
          </div>
        </div>
      ) : uncoveredShiftId && !analyzing ? (
        <div className="py-20 text-center opacity-30 flex flex-col items-center gap-4">
           <Info size={48} className="text-gray-400" />
           <p className="text-sm font-bold text-gray-500 uppercase tracking-widest italic">Introdueix un torn i clica a analitzar</p>
        </div>
      ) : null}
    </div>
  );
};

export default IncidenciaPerTorn;
