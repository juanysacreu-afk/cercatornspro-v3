import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Clock, Phone, Info, Users, RotateCcw, ArrowRight, MapPin, Coffee, CheckCircle2 } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';

interface Props {
  selectedServei: string;
}

const IncidenciaPerTorn: React.FC<Props> = ({ selectedServei }) => {
  const [uncoveredShiftId, setUncoveredShiftId] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uncoveredShift, setUncoveredShift] = useState<any>(null);
  const [coveragePlan, setCoveragePlan] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
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

      // Agafem tots els torns del servei per buscar buits
      const { data: otherShiftsRaw } = await supabase.from('shifts').select('*').eq('servei', selectedServei).neq('id', uncoveredShiftId);
      if (!otherShiftsRaw) return;

      const otherShortIds = otherShiftsRaw.map(s => getShortTornId(s.id));
      const { data: allDaily } = await supabase.from('daily_assignments').select('*').in('torn', otherShortIds);
      const { data: allPhones } = await supabase.from('phonebook').select('nomina, phones');

      const plan = await Promise.all(target.fullCirculations.map(async (circ: any) => {
        if (circ.codi === 'Viatger') return { circ, candidates: [] };

        const cStart = getFgcMinutes(circ.sortida);
        const cEnd = getFgcMinutes(circ.arribada);
        const candidates: any[] = [];

        for (const s of otherShiftsRaw) {
          const sInici = getFgcMinutes(s.inici_torn);
          const sFinal = getFgcMinutes(s.final_torn);
          
          // Si el torn ni tan sols està actiu durant la circulació, descartat
          if (sInici > cStart || sFinal < cEnd) continue;

          // Calculem els seus buits
          const sCircs = (s.circulations as any[]).sort((a:any, b:any) => getFgcMinutes(typeof a === 'string' ? a : a.sortida) - getFgcMinutes(typeof b === 'string' ? b : b.sortida));
          
          const gaps: { start: number, end: number }[] = [];
          let currentPos = sInici;
          sCircs.forEach((sc: any) => {
            const scStart = getFgcMinutes(typeof sc === 'string' ? sc : sc.sortida);
            const scEnd = getFgcMinutes(typeof sc === 'string' ? sc : sc.arribada);
            if (scStart > currentPos) gaps.push({ start: currentPos, end: scStart });
            currentPos = Math.max(currentPos, scEnd);
          });
          if (sFinal > currentPos) gaps.push({ start: currentPos, end: sFinal });

          // Mirem si algun buit el cobreix totalment (amb un marge de 1 min p.e.)
          const matchingGap = gaps.find(g => g.start <= (cStart - 1) && g.end >= (cEnd + 1));
          
          if (matchingGap) {
            const assignment = allDaily?.find(d => d.torn === getShortTornId(s.id));
            if (assignment) {
              const phones = allPhones?.find(p => p.nomina === assignment.empleat_id)?.phones || [];
              candidates.push({
                shiftId: s.id,
                driver: `${assignment.cognoms}, ${assignment.nom}`,
                phones,
                gap: matchingGap,
                marginBefore: cStart - matchingGap.start,
                marginAfter: matchingGap.end - cEnd
              });
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white dark:bg-gray-900 rounded-[32px] p-8 shadow-sm border border-gray-100 dark:border-white/5 transition-colors">
        <div className="max-w-2xl mx-auto space-y-6 text-center">
          <div className="flex flex-col items-center gap-3">
             <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500"><RotateCcw size={32} /></div>
             <h3 className="text-xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Anàlisi de Cobertura per Torn</h3>
             <p className="text-xs font-bold text-gray-400 dark:text-gray-500 max-w-sm">Introdueix el torn que ha quedat desprotegit per trobar buits de cobertura en la resta de la malla.</p>
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

      {analyzing ? (
        <div className="py-32 flex flex-col items-center justify-center gap-6 opacity-30">
          <Loader2 size={64} className="animate-spin text-blue-500" />
          <div className="text-center space-y-1">
            <p className="text-lg font-black uppercase tracking-[0.2em] text-fgc-grey dark:text-white">Escanejant malla operativa</p>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Buscant buits de cobertura compatibles...</p>
          </div>
        </div>
      ) : coveragePlan.length > 0 ? (
        <div className="space-y-12">
          <div className="bg-white dark:bg-gray-900 rounded-[32px] p-6 border border-gray-100 dark:border-white/5 shadow-sm">
             <div className="flex items-center gap-4 border-b border-gray-100 dark:border-white/5 pb-4 mb-6">
                <div className="h-10 min-w-[3rem] bg-blue-600 text-white rounded-xl flex items-center justify-center font-black text-lg shadow-md">{uncoveredShiftId}</div>
                <div>
                  <h4 className="text-sm font-black text-fgc-grey dark:text-white uppercase tracking-tight">Pla de Cobertura Proposat</h4>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{uncoveredShift?.fullCirculations.length} circulacions a cobrir</p>
                </div>
             </div>
             
             <div className="space-y-10">
                {coveragePlan.map((item, idx) => (
                  <div key={idx} className="space-y-4">
                    <div className="flex items-center gap-3 bg-gray-50 dark:bg-white/5 p-4 rounded-2xl border border-gray-100 dark:border-white/10">
                       <div className={`px-3 py-1 bg-fgc-grey text-white rounded-lg font-black text-sm shadow-sm`}>{item.circ.codi}</div>
                       <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-fgc-grey dark:text-gray-200 uppercase tracking-tight truncate">{item.circ.inici} → {item.circ.final}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                             <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400"><Clock size={10} /> {item.circ.sortida} — {item.circ.arribada}</div>
                             <div className="w-1 h-1 bg-gray-300 rounded-full" />
                             <div className="text-[10px] font-bold text-fgc-green uppercase tracking-widest">Durada: {getFgcMinutes(item.circ.arribada) - getFgcMinutes(item.circ.sortida)} min</div>
                          </div>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pl-4 border-l-2 border-dashed border-gray-100 dark:border-white/10">
                       {item.candidates.length > 0 ? (
                         item.candidates.map((cand: any, cIdx: number) => (
                           <div key={cIdx} className="bg-white dark:bg-gray-800 p-4 rounded-[24px] border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-900 transition-all group relative overflow-hidden">
                              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity"><CheckCircle2 size={32} className="text-blue-500" /></div>
                              <div className="flex items-center justify-between mb-3">
                                 <span className="bg-fgc-grey dark:bg-black text-white text-[10px] font-black px-2 py-0.5 rounded-lg">{cand.shiftId}</span>
                                 <span className="text-[9px] font-black text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">MARGE: {cand.marginBefore + cand.marginAfter}m</span>
                              </div>
                              <p className="text-sm font-black text-fgc-grey dark:text-gray-200 uppercase truncate leading-tight mb-1">{cand.driver}</p>
                              <div className="flex items-center gap-2 mb-4">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Buit: {formatFgcTime(cand.gap.start)} — {formatFgcTime(cand.gap.end)}</span>
                              </div>
                              <div className="flex gap-1.5 pt-3 border-t border-gray-50 dark:border-white/5 transition-colors">
                                 {cand.phones.map((p: string, i: number) => (
                                   <a key={i} href={`tel:${p}`} className="flex-1 bg-gray-50 dark:bg-black text-fgc-grey dark:text-gray-400 hover:bg-fgc-green hover:text-white transition-all p-2 rounded-xl flex items-center justify-center gap-2 shadow-sm"><Phone size={12} /><span className="text-[10px] font-black">{p}</span></a>
                                 ))}
                              </div>
                           </div>
                         ))
                       ) : (
                         <div className="col-span-full py-6 flex items-center justify-center gap-3 bg-red-50/30 dark:bg-red-950/10 rounded-2xl border border-dashed border-red-100 dark:border-red-900/30">
                            <Info size={16} className="text-red-400" />
                            <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest italic">Cap buit compatible detectat per aquesta circulació</p>
                         </div>
                       )}
                    </div>
                  </div>
                ))}
             </div>
          </div>
        </div>
      ) : uncoveredShiftId && !analyzing ? (
        <div className="py-20 text-center opacity-30 flex flex-col items-center gap-4">
           <Info size={48} className="text-gray-400" />
           <p className="text-sm font-bold text-gray-500 uppercase tracking-widest italic">Clica a analitzar per cercar el pla de cobertura</p>
        </div>
      ) : null}
    </div>
  );
};

export default IncidenciaPerTorn;