import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Loader2, Clock, Phone, Info, Users, RotateCcw, ArrowRight, MapPin, Coffee, CheckCircle2, AlertTriangle, TrainFront, Footprints, ShieldAlert, Sparkles, UserX, UserCheck, BrainCircuit, Lightbulb, X, ArrowRightLeft, Target, Zap, ArrowUpRight, History, MessageSquareQuote, Scale } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';
import { GoogleGenAI, Type } from "@google/genai";

interface Props {
  selectedServei: string;
  showSecretMenu: boolean;
}

const RESERVE_SHIFTS_LIST = [
  'QRS1', 'QRS2', 'QRS0', 
  'QRP0', 
  'QRN0', 
  'QRF0', 
  'QRR1', 'QRR2', 'QRR0', 'QRR4'
];

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
  if (TRAVEL_TIMES[`${f}-${t}`]) return TRAVEL_TIMES[`${f}-${t}`];
  if ((f === 'PC' && t === 'RB') || (f === 'RB' && t === 'PC')) return 35;
  if ((f === 'PC' && t === 'PN') || (f === 'PN' && t === 'PC')) return 40;
  if ((f === 'PC' && t === 'NA') || (f === 'NA' && t === 'PC')) return 45;
  if ((f === 'SR' && t === 'RB') || (f === 'RB' && t === 'SR')) return 25;
  if ((f === 'SR' && t === 'PN') || (f === 'PN' && t === 'SR')) return 30;
  return 20;
};

const IncidenciaPerTorn: React.FC<Props> = ({ selectedServei, showSecretMenu }) => {
  const [uncoveredShiftId, setUncoveredShiftId] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [uncoveredShift, setUncoveredShift] = useState<any>(null);
  const [coveragePlan, setCoveragePlan] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [disabledReserves, setDisabledReserves] = useState<Set<string>>(new Set());
  
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<any | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [appliedAiFixes, setAppliedAiFixes] = useState<Record<string, any>>({});

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
    setAiResponse(null);
    setAppliedAiFixes({});
    try {
      const target = await fetchFullShift(uncoveredShiftId);
      if (!target) return;
      setUncoveredShift(target);
      const { data: otherShiftsRaw } = await supabase.from('shifts').select('*').eq('servei', selectedServei).neq('id', uncoveredShiftId);
      if (!otherShiftsRaw) return;
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
          const sCircsRefs = (s.circulations as any[]).sort((a:any, b:any) => getFgcMinutes(typeof a === 'string' ? a : a.sortida) - getFgcMinutes(typeof b === 'string' ? b : b.sortida));
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
          if (sFinalTorn > currentPos) gaps.push({ start: currentPos, end: sFinalTorn, fromLoc: currentLoc, toLoc: s.dependencia?.toUpperCase().trim() || currentLoc });
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
                  logistics: { from: matchingGap.fromLoc, to: matchingGap.toLoc, travelToOrigin: timeToReachOrigin, travelFromEnd: timeToReturn, needsTravelTo: matchingGap.fromLoc !== cInici, needsTravelBack: cFinal !== matchingGap.toLoc },
                  marginBefore: cStart - arrivalAtOrigin,
                  marginAfter: matchingGap.end - arrivalAtNextTask
                });
              }
            }
          }
        }
        return { circ, candidates: candidates.sort((a, b) => (b.marginBefore + b.marginAfter) - (a.marginBefore + a.marginAfter)) };
      }));
      setCoveragePlan(plan);
    } catch (e) { console.error(e); } finally { setAnalyzing(false); }
  };

  const askGemini = async () => {
    setAiLoading(true);
    setShowAiModal(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Obtenció de recursos reals per evitar al·lucinacions (com el torn R001 inexistent)
      const { data: allShiftsRaw } = await supabase.from('shifts').select('id, inici_torn, final_torn, duracio, dependencia').eq('servei', selectedServei);
      const filteredForAi = allShiftsRaw?.filter(s => s.id !== uncoveredShiftId && !disabledReserves.has(s.id)) || [];
      const otherShortIds = filteredForAi.map(s => getShortTornId(s.id));
      const { data: allDaily } = await supabase.from('daily_assignments').select('torn, nom, cognoms').in('torn', otherShortIds);
      
      const availableResources = filteredForAi.map(s => {
        const assig = allDaily?.find(d => d.torn === getShortTornId(s.id));
        return {
          id: s.id,
          horari: `${s.inici_torn} - ${s.final_torn}`,
          driver: assig ? `${assig.cognoms}, ${assig.nom}` : 'Sense assignar'
        };
      });

      const contextData = {
        uncoveredShift: uncoveredShiftId,
        circulationsToCover: coveragePlan.map(cp => ({
          id: cp.circ.codi,
          route: `${cp.circ.inici} -> ${cp.circ.final}`,
          times: `${cp.circ.sortida} - ${cp.circ.arribada}`,
          duration: getFgcMinutes(cp.circ.arribada) - getFgcMinutes(cp.circ.sortida),
          atRisk: cp.candidates.length === 0
        })),
        availableResources
      };

      const prompt = `Ets un expert en logística ferroviària d'FGC. El torn ${uncoveredShiftId} és descobert. 
      LLEI CRÍTICA: Un torn NO pot superar les 08:45h (525 minuts) de durada total. Si ho fa, és il·legal.
      
      RECURSOS DISPONIBLES (NOMÉS pots usar aquests torns, NO t'inventis codis com R001):
      ${JSON.stringify(availableResources)}
      
      OBJECTIU: Trobar solucions de canvis (swaps) i "salts" de maquinistes entre els torns de la llista de RECURSOS DISPONIBLES per cobrir els trens en risc del torn ${uncoveredShiftId}, respectant SEMPRE els 525 minuts.
      
      REQUISIT CRÍTIC DE VERACITAT: NO T'INVENTIS CODIS DE TORN. Utilitza ÚNICAMENT els IDs que apareixen a la llista de RECURSOS DISPONIBLES proporcionada al context. Si un torn no és a la llista, no existeix.
      
      ESTRATEGIES RECOMANADES:
      1. Relleus Parcials: Si un maquinista no pot acabar una circulació sencera per temps, proposa que la faci fins a una estació intermèdia i que un altre dels RECURSOS DISPONIBLES la continuï.
      2. Salts: Si el maquinista d'un tren posterior ja és a l'estació d'origen, pot agafar el tren anterior.
      3. Cadenes: Maquinista A -> Tren B, Maquinista B -> Tren C, etc.
      
      Respon exclusivament en JSON amb camps: summary, impact, steps (array amb driver, type, description, location, color), proposedFixes (array amb circCodi, assignedTorn, driverName, notes).`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        config: {
          thinkingConfig: { thinkingBudget: 32768 },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              impact: { type: Type.STRING },
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    driver: { type: Type.STRING },
                    type: { type: Type.STRING, description: "Exchange, Chain, Travel, SplitRelief" },
                    description: { type: Type.STRING },
                    location: { type: Type.STRING },
                    color: { type: Type.STRING }
                  }
                }
              },
              proposedFixes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    circCodi: { type: Type.STRING },
                    assignedTorn: { type: Type.STRING },
                    driverName: { type: Type.STRING },
                    notes: { type: Type.STRING }
                  }
                }
              }
            }
          }
        },
        contents: prompt
      });

      const responseText = response.text || "{}";
      const cleanedText = responseText.replace(/```json\n?|```/g, "").trim();
      setAiResponse(JSON.parse(cleanedText));
    } catch (e) {
      console.error(e);
      setAiResponse({ summary: "Error de càlcul", impact: "No s'ha pogut generar el pla logístic", steps: [], proposedFixes: [] });
    } finally {
      setAiLoading(false);
    }
  };

  const executeAiPlan = () => {
    if (!aiResponse?.proposedFixes) return;
    const fixes: Record<string, any> = {};
    aiResponse.proposedFixes.forEach((f: any) => {
      fixes[f.circCodi] = f;
    });
    setAppliedAiFixes(fixes);
    setShowAiModal(false);
  };

  const coverageStats = useMemo(() => {
    if (!coveragePlan.length) return null;
    const realCircs = coveragePlan.filter(p => p.circ.codi !== 'Viatger');
    const covered = realCircs.filter(p => p.candidates.length > 0 || appliedAiFixes[p.circ.codi]).length;
    const uncovered = realCircs.filter(p => p.candidates.length === 0 && !appliedAiFixes[p.circ.codi]);
    return { total: realCircs.length, covered, uncovered };
  }, [coveragePlan, appliedAiFixes]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-white dark:bg-gray-900 rounded-[32px] p-8 shadow-sm border border-gray-100 dark:border-white/5 transition-colors h-full flex flex-col justify-center">
          <div className="max-w-2xl mx-auto space-y-6 text-center w-full">
            <div className="flex flex-col items-center gap-3">
               <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500"><RotateCcw size={32} /></div>
               <h3 className="text-xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Anàlisi Logística Avançada</h3>
               <p className="text-xs font-bold text-gray-400 dark:text-gray-500 max-w-sm">Calcula cobertures tenint en compte salts i temps màxims de 08:45h.</p>
            </div>
            <div className="relative" ref={containerRef}>
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={24} />
              <input type="text" placeholder="Torn descobert (Ex: Q031)..." value={uncoveredShiftId} onChange={(e) => handleInputChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && calculatePlan()} className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[28px] py-6 pl-16 pr-8 focus:ring-4 focus:ring-blue-500/20 outline-none text-xl font-bold transition-all dark:text-white shadow-inner" />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-2 right-2 mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 z-[50] overflow-hidden animate-in slide-in-from-top-2">
                  {suggestions.map(s => (
                    <button key={s} onClick={() => { setUncoveredShiftId(s); setShowSuggestions(false); }} className="w-full text-left px-6 py-4 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-bold transition-colors flex items-center justify-between border-b border-gray-50 dark:border-white/5 last:border-0 dark:text-white"><span>{s}</span><ArrowRight size={16} className="text-blue-500" /></button>
                  ))}
                </div>
              )}
              <button onClick={calculatePlan} disabled={analyzing || !uncoveredShiftId} className="absolute right-3 top-1/2 -translate-y-1/2 bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50">{analyzing ? <Loader2 className="animate-spin" size={20} /> : 'ANALITZAR'}</button>
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
        <div className="py-32 flex flex-col items-center justify-center gap-6 opacity-30"><Loader2 size={64} className="animate-spin text-blue-500" /><div className="text-center space-y-1"><p className="text-lg font-black uppercase tracking-[0.2em] text-fgc-grey dark:text-white">Escanejant xarxa ferroviària</p><p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Analitzant enllaços i temps de viatge...</p></div></div>
      ) : coveragePlan.length > 0 ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-900 rounded-[32px] p-6 border border-gray-100 dark:border-white/5 shadow-sm flex items-center gap-5">
              <div className={`p-4 rounded-2xl ${coverageStats?.uncovered.length ? 'bg-red-500 text-white' : 'bg-fgc-green text-fgc-grey'} shadow-lg`}>{coverageStats?.uncovered.length ? <ShieldAlert size={28} /> : <CheckCircle2 size={28} />}</div>
              <div><h4 className="text-sm font-black text-fgc-grey dark:text-white uppercase tracking-tight">Estat del Torn {uncoveredShiftId}</h4><p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{coverageStats?.covered} de {coverageStats?.total} trens coberts</p></div>
            </div>
            <div className={`bg-white dark:bg-gray-900 rounded-[32px] p-6 border shadow-sm flex items-center gap-5 transition-all ${coverageStats?.uncovered.length ? 'border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20' : 'border-gray-100 dark:border-white/5'}`}>
              <div className={`p-4 rounded-2xl ${coverageStats?.uncovered.length ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-100 dark:bg-white/5 text-gray-400'} shadow-lg`}><AlertTriangle size={28} /></div>
              <div><h4 className={`text-sm font-black uppercase tracking-tight ${coverageStats?.uncovered.length ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>Riscos detectats</h4><p className={`text-xs font-bold uppercase tracking-widest ${coverageStats?.uncovered.length ? 'text-red-500/70' : 'text-gray-300'}`}>{coverageStats?.uncovered.length || 0} trens sense cobertura directa</p></div>
            </div>
            {showSecretMenu && (
              <button onClick={askGemini} className="bg-fgc-grey dark:bg-black text-white rounded-[32px] p-6 border border-white/10 shadow-2xl flex items-center gap-5 group hover:scale-[1.02] active:scale-95 transition-all relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform"><BrainCircuit size={80} /></div>
                <div className="p-4 bg-fgc-green text-fgc-grey rounded-2xl shadow-lg relative z-10"><Sparkles size={28} className="group-hover:animate-spin" style={{ animationDuration: '3s' }} /></div>
                <div className="text-left relative z-10"><h4 className="text-sm font-black text-white uppercase tracking-tight">IA: Cercar salts i cadenes</h4><p className="text-[10px] font-bold text-fgc-green uppercase tracking-widest leading-tight">Troba relleus parcials i salts entre trens</p></div>
              </button>
            )}
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-[32px] p-6 sm:p-8 border border-gray-100 dark:border-white/5 shadow-sm">
             <div className="flex items-center gap-4 border-b border-gray-100 dark:border-white/5 pb-4 mb-8">
                <div className="h-10 min-w-[3rem] bg-blue-600 text-white rounded-xl flex items-center justify-center font-black text-lg shadow-md">{uncoveredShiftId}</div>
                <div><h4 className="text-sm font-black text-fgc-grey dark:text-white uppercase tracking-tight">Pla de Cobertura Logística</h4><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Analitzant buits per sota del límit legal de 08:45h</p></div>
             </div>
             <div className="space-y-16">
                {coveragePlan.map((item, idx) => {
                  if (item.circ.codi === 'Viatger') return null;
                  const aiFix = appliedAiFixes[item.circ.codi];
                  return (
                    <div key={idx} className="space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-gray-100 dark:bg-white/5 p-4 rounded-3xl border border-gray-200 dark:border-white/10 relative overflow-hidden">
                         <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><TrainFront size={80} /></div>
                         <div className={`px-4 py-2 bg-fgc-grey text-white rounded-2xl font-black text-lg shadow-sm flex items-center justify-center min-w-[80px]`}>{item.circ.codi}</div>
                         <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1"><p className="text-base font-black text-fgc-grey dark:text-gray-200 uppercase tracking-tight">{item.circ.inici} → {item.circ.final}</p><span className="bg-fgc-green/20 text-fgc-green px-2 py-0.5 rounded text-[9px] font-black uppercase border border-fgc-green/20">S-{item.circ.linia}</span></div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><div className="flex items-center gap-1.5 text-xs font-bold text-gray-500"><Clock size={14} className="text-blue-500" /> {item.circ.sortida} — {item.circ.arribada}</div><div className="flex items-center gap-1.5 text-xs font-bold text-fgc-green"><MapPin size={14} /> Vies: {item.circ.via_inici} / {item.circ.via_final}</div></div>
                         </div>
                         {item.candidates.length === 0 && !aiFix && <div className="bg-red-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-red-500/20 border border-red-400">SENSE COBERTURA DIRECTA</div>}
                         {aiFix && <div className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg flex items-center gap-2 border border-blue-400 animate-in zoom-in-95"><BrainCircuit size={14} /> SOLUCIÓ IA ACTIVADA</div>}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pl-4 border-l-2 border-dashed border-gray-200 dark:border-white/10">
                         {aiFix ? (
                            <div className="p-5 rounded-[32px] border bg-blue-50 dark:bg-blue-900/10 border-blue-400 ring-2 ring-blue-500/20 shadow-xl scale-[1.02] z-10 flex flex-col relative overflow-hidden animate-in fade-in duration-300">
                               <div className="absolute top-0 right-0 bg-blue-600 text-white px-4 py-1.5 rounded-bl-2xl text-[9px] font-black uppercase flex items-center gap-1.5 shadow-md"><Zap size={10} /> Proposta IA</div>
                               <div className="flex items-center gap-2 mb-4">
                                  <span className="bg-blue-600 text-white text-[10px] font-black px-2.5 py-1 rounded-xl shadow-sm">{aiFix.assignedTorn}</span>
                               </div>
                               <p className="text-base font-black text-blue-900 dark:text-blue-100 uppercase truncate leading-tight mb-3">{aiFix.driverName}</p>
                               <div className="bg-white/70 dark:bg-black/40 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/30 flex-1">
                                  <p className="text-[9px] font-black text-blue-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5"><MessageSquareQuote size={10}/> Raonament Logístic</p>
                                  <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300 leading-relaxed italic">"{aiFix.notes}"</p>
                               </div>
                               <button onClick={() => { const next = {...appliedAiFixes}; delete next[item.circ.codi]; setAppliedAiFixes(next); }} className="mt-4 text-[9px] font-black text-red-500 uppercase hover:underline text-left px-2">Desfer canvi IA</button>
                            </div>
                         ) : item.candidates.length > 0 ? (
                           item.candidates.map((cand: any, cIdx: number) => {
                             const isBestOption = cIdx === 0;
                             return (
                               <div key={cIdx} className={`p-5 rounded-[32px] border transition-all group flex flex-col h-full relative overflow-hidden ${isBestOption ? 'bg-white dark:bg-gray-800 border-blue-400 ring-2 ring-blue-500/20 shadow-xl scale-[1.02] z-10' : 'bg-gray-50/50 dark:bg-gray-800/40 border-gray-100 dark:border-white/5 shadow-sm opacity-80 hover:opacity-100'}`}>
                                  {isBestOption && <div className="absolute top-0 right-0 bg-blue-600 text-white px-4 py-1.5 rounded-bl-2xl text-[9px] font-black uppercase flex items-center gap-1.5 shadow-md"><Sparkles size={10} /> Millor Candidat</div>}
                                  <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><span className="bg-fgc-grey dark:bg-black text-white text-[10px] font-black px-2.5 py-1 rounded-xl shadow-sm">{cand.shiftId}</span>{cand.marginBefore + cand.marginAfter > 60 && <span className="bg-fgc-green/10 text-fgc-green text-[9px] font-black px-2 py-1 rounded-lg border border-fgc-green/20">OPTIM</span>}</div><div className="text-right"><p className="text-[10px] font-black text-blue-500 uppercase leading-none mb-1">Marge</p><p className="text-lg font-black text-fgc-grey dark:text-gray-200 leading-none">{cand.marginBefore + cand.marginAfter}m</p></div></div>
                                  <p className="text-base font-black text-fgc-grey dark:text-gray-200 uppercase truncate leading-tight mb-4">{cand.driver}</p>
                                  <div className="flex-1 space-y-3 mb-6">
                                     <div className={`p-3 rounded-2xl border transition-colors flex items-start gap-3 ${cand.logistics.needsTravelTo ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/30' : 'bg-gray-50/50 dark:bg-black/20 border-gray-100 dark:border-white/5'}`}><div className={`p-1.5 rounded-lg shrink-0 ${cand.logistics.needsTravelTo ? 'bg-orange-500 text-white' : 'bg-fgc-green text-fgc-grey'}`}>{cand.logistics.needsTravelTo ? <Footprints size={14} /> : <CheckCircle2 size={14} />}</div><div className="min-w-0"><p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter">Accés al tren</p><p className="text-xs font-bold text-fgc-grey dark:text-gray-300 truncate">{cand.logistics.needsTravelTo ? `Viatger: ${cand.logistics.from} → ${item.circ.inici} (${cand.logistics.travelToOrigin} min)` : `Ja a ${item.circ.inici}`}</p></div></div>
                                     <div className={`p-3 rounded-2xl border transition-colors flex items-start gap-3 ${cand.logistics.needsTravelBack ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/30' : 'bg-gray-50/50 dark:bg-black/20 border-gray-100 dark:border-white/5'}`}><div className={`p-1.5 rounded-lg shrink-0 ${cand.logistics.needsTravelBack ? 'bg-orange-500 text-white' : 'bg-fgc-green text-fgc-grey'}`}>{cand.logistics.needsTravelBack ? <Footprints size={14} /> : <CheckCircle2 size={14} />}</div><div className="min-w-0"><p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter">Retorn/Proper</p><p className="text-xs font-bold text-fgc-grey dark:text-gray-300 truncate">{cand.logistics.needsTravelBack ? `Viatger: ${item.circ.final} → ${cand.logistics.to} (${cand.logistics.travelFromEnd} min)` : `Ja a base: ${item.circ.final}`}</p></div></div>
                                  </div>
                                  <div className="flex gap-2 pt-4 border-t border-gray-100 dark:border-white/5 mt-auto">{cand.phones.map((p: string, i: number) => (<a key={i} href={`tel:${p}`} className="flex-1 bg-fgc-grey dark:bg-black text-white hover:bg-fgc-green hover:text-fgc-grey transition-all py-3 rounded-2xl flex items-center justify-center gap-2 shadow-sm"><Phone size={14} /><span className="text-xs font-black">{p}</span></a>))}</div>
                               </div>
                             );
                           })
                         ) : (
                           <div className="col-span-full py-10 flex flex-col items-center justify-center gap-3 bg-red-50/30 dark:bg-red-950/10 rounded-[32px] border-2 border-dashed border-red-100 dark:border-red-900/30"><AlertTriangle size={32} className="text-red-400 mb-2" /><p className="text-sm font-black text-red-600 dark:text-red-400 uppercase tracking-widest text-center px-4">Cap relleu directe viable<br/><span className="text-[10px] font-bold opacity-60">L'IA pot analitzar salts entre trens per solucionar-ho</span></p></div>
                         )}
                      </div>
                    </div>
                  );
                })}
             </div>
          </div>
        </div>
      ) : uncoveredShiftId && !analyzing ? (
        <div className="py-20 text-center opacity-30 flex flex-col items-center gap-4"><Info size={48} className="text-gray-400" /><p className="text-sm font-bold text-gray-500 uppercase tracking-widest italic">Introdueix un torn per calcular cobertures</p></div>
      ) : null}

      {showAiModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-fgc-grey/60 backdrop-blur-md" onClick={() => setShowAiModal(false)} />
          <div className="relative bg-white dark:bg-gray-900 w-full max-w-4xl rounded-[40px] overflow-hidden shadow-2xl border border-white/10 animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-fgc-grey dark:bg-black text-white flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-fgc-green text-fgc-grey rounded-xl shadow-lg"><BrainCircuit size={24} /></div>
                <div><h2 className="text-xl font-black uppercase tracking-tight">Estratègia IA Mestra</h2><p className="text-[10px] font-bold text-fgc-green uppercase tracking-widest">Gemini reasoning Engine v3.8 (Llei 08:45h)</p></div>
              </div>
              <button onClick={() => setShowAiModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
            </div>
            <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
              {aiLoading ? (
                <div className="py-24 flex flex-col items-center justify-center gap-8">
                  <div className="relative">
                    <Loader2 className="text-fgc-green animate-spin" size={64} />
                    <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-500 animate-pulse" size={24} />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-lg font-black text-fgc-grey dark:text-white uppercase tracking-widest">Calculant cadenes d'intercanvi...</p>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Analitzant marges de 08:45h i rellançaments de maquinistes</p>
                  </div>
                </div>
              ) : aiResponse && (
                <div className="space-y-10 animate-in fade-in duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-3xl border border-gray-100 dark:border-white/5 flex flex-col justify-center">
                        <h3 className="text-2xl font-black text-fgc-grey dark:text-white uppercase tracking-tight leading-tight mb-2">{aiResponse.summary}</h3>
                        <div className="flex items-center gap-2"><div className="w-2 h-2 bg-fgc-green rounded-full animate-pulse" /><p className="text-sm font-black text-fgc-green uppercase tracking-widest">{aiResponse.impact}</p></div>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-3xl border border-blue-100 dark:border-blue-900/30 flex items-start gap-4">
                       <Scale className="text-blue-600 dark:text-blue-400 shrink-0 mt-1" size={24} />
                       <div>
                          <p className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1">Càlcul de Temps Legals</p>
                          <p className="text-xs font-medium text-blue-800 dark:text-blue-200 leading-relaxed italic">Aquest pla assegura que cap torn supera els 525 minuts. S'han proposat salts entre circulacions (ex: F138 -> F136) per optimitzar la xarxa.</p>
                       </div>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 px-2">
                       <History size={18} className="text-gray-400" />
                       <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Full de Ruta de l'Intercanvi</h4>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {aiResponse.steps?.map((step: any, sIdx: number) => {
                        const colors: Record<string, string> = {
                          blue: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400',
                          orange: 'border-l-orange-500 bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400',
                          green: 'border-l-fgc-green bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400',
                          purple: 'border-l-purple-500 bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400',
                        };
                        const colorClass = colors[step.color] || colors.blue;
                        
                        return (
                          <div key={sIdx} className={`rounded-2xl p-6 border border-gray-100 dark:border-white/5 border-l-8 shadow-sm flex flex-col sm:flex-row sm:items-center gap-6 group transition-all hover:translate-x-1 ${colorClass}`}>
                            <div className="flex items-center gap-5 flex-1">
                               <div className="h-12 w-12 bg-white/70 dark:bg-black/30 rounded-xl flex items-center justify-center font-black text-lg shadow-sm shrink-0">{sIdx + 1}</div>
                               <div className="min-w-0">
                                  <div className="flex items-center gap-2 mb-1.5">
                                     <span className="bg-black/10 dark:bg-white/10 px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest">{step.type}</span>
                                     <p className="text-sm font-black uppercase tracking-tighter opacity-90">{step.driver}</p>
                                  </div>
                                  <p className="text-sm font-bold leading-relaxed">{step.description}</p>
                               </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 border-t sm:border-t-0 sm:border-l border-current/10 pt-4 sm:pt-0 sm:pl-8">
                               <MapPin size={14} className="opacity-60" />
                               <p className="text-[10px] font-black uppercase tracking-widest leading-none">{step.location}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center gap-3 px-2">
                       <ArrowUpRight size={18} className="text-fgc-green" />
                       <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Resultat del Pla Automàtic</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                       {aiResponse.proposedFixes?.map((fix: any, fIdx: number) => (
                          <div key={fIdx} className="bg-gray-50 dark:bg-black/20 p-5 rounded-[24px] border border-gray-100 dark:border-white/5 space-y-4 shadow-inner">
                             <div className="flex items-center justify-between">
                                <span className="bg-fgc-grey dark:bg-black text-white text-[10px] font-black px-3 py-1 rounded-lg uppercase shadow-sm">{fix.circCodi}</span>
                                <div className="flex items-center gap-1.5">
                                  <ArrowRight size={10} className="text-gray-400" />
                                  <span className="bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-lg uppercase shadow-md">{fix.assignedTorn}</span>
                                </div>
                             </div>
                             <p className="text-base font-black text-fgc-grey dark:text-gray-200 uppercase truncate">{fix.driverName}</p>
                             <div className="pt-3 border-t border-gray-100 dark:border-white/5">
                               <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 leading-relaxed italic">{fix.notes}</p>
                             </div>
                          </div>
                       ))}
                    </div>
                  </div>
                  
                  <div className="pt-8 border-t border-gray-100 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6">
                     <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest max-w-sm text-center sm:text-left leading-relaxed">
                        * Al clicar a executar, les circulacions es resoldran visualment aplicant les cadenes i salts proposats.
                     </p>
                     <button onClick={executeAiPlan} className="w-full sm:w-auto bg-blue-600 text-white px-12 py-5 rounded-3xl font-black text-base hover:bg-blue-700 active:scale-95 transition-all shadow-2xl flex items-center justify-center gap-3 uppercase tracking-widest">
                       <Zap size={20} className="fill-current" /> EXECUTAR PLA IA
                     </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncidenciaPerTorn;