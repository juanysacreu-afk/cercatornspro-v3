
import React, { useState, useEffect, useRef } from 'react';
import { SearchType, Shift, Circulation, DailyAssignment, PhonebookEntry, Assignment } from '../types';
import { Search, User, Train, MapPin, Hash, ArrowRight, Loader2, Info, Phone, Clock, FileText, ChevronDown, ChevronUp, Map as MapIcon, Navigation, Coffee, Footprints, Circle, LayoutGrid, Timer, X, BookOpen, CalendarDays, Filter, AlertTriangle, Wrench } from 'lucide-react';
import { supabase } from '../supabaseClient';

// Funció auxiliar per recuperar tots els registres d'una taula (superant el límit de 1000 de Supabase)
async function fetchAllFromSupabase(table: string, queryBuilder: any) {
  let allData: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await queryBuilder.range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData = [...allData, ...data];
      page++;
      if (data.length < pageSize) hasMore = false;
    }
  }
  return allData;
}

export const CercarView: React.FC = () => {
  const [searchType, setSearchType] = useState<SearchType>(SearchType.Torn);
  const [selectedServei, setSelectedServei] = useState<string>('0');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [expandedItinerari, setExpandedItinerari] = useState<string | null>(null);
  const [nowMin, setNowMin] = useState<number>(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [availableCycles, setAvailableCycles] = useState<string[]>([]);
  const [allStations, setAllStations] = useState<string[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [brokenTrains, setBrokenTrains] = useState<Set<string>>(new Set());
  
  const getCurrentTimeStr = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  };

  const [startTime, setStartTime] = useState<string>(getCurrentTimeStr());
  const [endTime, setEndTime] = useState<string>('23:59');
  
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      setNowMin(getFgcMinutes(timeStr));
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchBrokenTrains = async () => {
    const { data } = await supabase
      .from('train_status')
      .select('train_number')
      .eq('is_broken', true);
    
    if (data) {
      setBrokenTrains(new Set(data.map(s => s.train_number)));
    }
  };

  useEffect(() => {
    fetchBrokenTrains();
  }, [results]);

  useEffect(() => {
    if (searchType === SearchType.Estacio) {
      setStartTime(getCurrentTimeStr());
    }
  }, [searchType]);

  useEffect(() => {
    const fetchData = async () => {
      if (searchType === SearchType.Cicle) {
        setLoading(true);
        // Recuperem tots els shifts per no perdre cicles de trens que estiguin més enllà del registre 1000
        const shiftsData = await fetchAllFromSupabase('shifts', supabase.from('shifts').select('circulations').eq('servei', selectedServei));
        const cyclesSet = new Set<string>();
        
        if (shiftsData) {
          shiftsData.forEach(s => {
            (s.circulations as any[])?.forEach(c => {
              const cicle = typeof c === 'object' ? c.cicle : null;
              if (cicle) cyclesSet.add(cicle as string);
            });
          });
        }
        
        setAvailableCycles(Array.from(cyclesSet).sort());
        setLoading(false);
      }
      
      if (searchType === SearchType.Estacio) {
        // Obtenim totes les estacions sense límit de 1000 per no perdre estacions de la cua del dia
        const data = await fetchAllFromSupabase('circulations', supabase.from('circulations').select('estacions, inici, final'));
        if (data) {
          const stations = new Set<string>();
          data.forEach(c => {
            if (c.inici) stations.add(c.inici.trim());
            if (c.final) stations.add(c.final.trim());
            (c.estacions as any[])?.forEach(st => {
              if (st.nom) stations.add(st.nom.trim());
            });
          });
          setAllStations(Array.from(stations).sort());
        }
      }
    };
    fetchData();
  }, [searchType, selectedServei]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filterButtons = [
    { id: SearchType.Torn, label: 'Torn', icon: <Hash size={16} /> },
    { id: SearchType.Maquinista, label: 'Maquinista', icon: <User size={16} /> },
    { id: SearchType.Circulacio, label: 'Circulació', icon: <Train size={16} /> },
    { id: SearchType.Estacio, label: 'Estació', icon: <MapPin size={16} /> },
    { id: SearchType.Cicle, label: 'Cicle', icon: <Hash size={16} /> },
  ];

  const serveiTypes = ['0', '100', '400', '500'];

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

  function calculateGap(from: string, to: string) {
    if (!from || !to) return 0;
    const start = getFgcMinutes(from);
    const end = getFgcMinutes(to);
    return end - start;
  }

  const checkIfActive = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return false;
    const start = getFgcMinutes(startStr);
    const end = getFgcMinutes(endStr);
    return nowMin >= start && nowMin < end;
  };

  const getStatusColor = (codi: string) => {
    const c = (codi || '').toUpperCase().trim();
    if (c === 'PC') return 'bg-blue-400'; 
    if (c === 'SR') return 'bg-purple-600';
    if (c === 'RE') return 'bg-purple-300';
    if (c === 'RB') return 'bg-pink-500';
    if (c === 'NA') return 'bg-orange-500';
    if (c === 'PN') return 'bg-[#00B140]';
    if (c === 'TB') return 'bg-[#a67c52]'; 
    if (c === 'Viatger') return 'bg-blue-500';
    return 'bg-gray-200';
  };

  const getLiniaColor = (linia: string) => {
    const l = linia?.toUpperCase().trim() || '';
    if (l === 'L6') return 'bg-purple-600';
    if (l === 'L7') return 'bg-[#8B4513]';
    if (l === 'L12') return 'bg-purple-300';
    if (l === 'S1') return 'bg-orange-500';
    if (l === 'S2') return 'bg-[#00B140]';
    return 'bg-fgc-grey';
  };

  const getShiftCurrentStatus = (turn: any) => {
    const start = getFgcMinutes(turn.inici_torn);
    const end = getFgcMinutes(turn.final_torn);
    
    if (nowMin < start) return { label: 'No ha iniciat', color: 'bg-gray-200 text-gray-500' };
    if (nowMin >= end) return { label: 'Finalitzat', color: 'bg-fgc-grey text-white' };
    
    const circs = turn.fullCirculations || [];
    for (const circ of circs) {
      if (checkIfActive(circ.sortida, circ.arribada)) {
        return { label: `LIVE: ${circ.codi}`, color: 'bg-red-500 text-white animate-pulse shadow-lg' };
      }
    }
    
    let gapDuration = 0, gapEnd = end;
    if (circs.length === 0) { 
      gapDuration = end - start; gapEnd = end; 
    } else {
      const firstStart = getFgcMinutes(circs[0].sortida);
      if (nowMin < firstStart) { 
        gapDuration = firstStart - start; gapEnd = firstStart; 
      } else {
        for (let i = 0; i < circs.length; i++) {
          const currentEnd = getFgcMinutes(circs[i].arribada);
          const nextStart = circs[i+1] ? getFgcMinutes(circs[i+1].sortida) : end;
          if (nowMin >= currentEnd && nowMin < nextStart) { 
            gapDuration = nextStart - currentEnd; gapEnd = nextStart; break; 
          }
        }
      }
    }
    
    const remaining = gapEnd - nowMin;
    if (gapDuration >= 15) return { label: `Descans: ${remaining} min`, color: 'bg-fgc-green text-fgc-grey shadow-sm' };
    else return { label: `Temps: ${remaining} min`, color: 'bg-yellow-400 text-fgc-grey shadow-sm' };
  };

  const getTrainPhone = (train: string) => {
    if (!train) return null;
    const parts = train.split('.');
    if (parts.length < 2) return null;
    const serie = parts[0];
    const unit = parseInt(parts[1], 10);
    if (isNaN(unit)) return null;
    const unitStr = parts[1].padStart(2, '0');
    if (serie === '112') return `692${(unit + 50).toString().padStart(2, '0')}`;
    if (serie === '113') return `694${unitStr}`;
    if (serie === '114') return `694${(unit + 50).toString().padStart(2, '0')}`;
    if (serie === '115') return `697${unitStr}`;
    return null;
  };

  const ShiftTimeline = ({ turn }: { turn: any }) => {
    const [selectedSeg, setSelectedSeg] = useState<any>(null);
    const startMin = getFgcMinutes(turn.inici_torn);
    const endMin = getFgcMinutes(turn.final_torn);
    const totalDuration = endMin - startMin;
    if (totalDuration <= 0) return null;
    
    const segments: any[] = [];
    let currentPos = startMin;
    const circulations = turn.fullCirculations || [];
    
    circulations.forEach((circ: any, index: number) => {
      const circStart = getFgcMinutes(circ.sortida);
      const circEnd = getFgcMinutes(circ.arribada);
      if (circStart > currentPos) {
        const locationCode = index === 0 ? (circ.machinistInici || turn.dependencia || '') : (circulations[index - 1].machinistFinal || '');
        segments.push({ start: currentPos, end: circStart, type: 'gap', codi: locationCode || 'DESCANS', color: getStatusColor(locationCode) });
      }
      segments.push({ start: circStart, end: circEnd, type: 'circ', codi: circ.codi, realCodi: circ.realCodi, color: 'bg-gray-300', linia: circ.linia, train: circ.train });
      currentPos = Math.max(currentPos, circEnd);
    });
    
    if (currentPos < endMin) {
      const lastLoc = circulations.length > 0 ? circulations[circulations.length - 1].machinistFinal : turn.dependencia;
      segments.push({ start: currentPos, end: endMin, type: 'gap', codi: lastLoc || 'FINAL', color: getStatusColor(lastLoc) });
    }
    
    const showMarker = nowMin >= startMin && nowMin <= endMin;
    const progressPct = Math.max(0, Math.min(100, ((nowMin - startMin) / totalDuration) * 100));
    
    return (
      <div className="space-y-4 mb-10 p-2 relative">
        <div className="flex items-center justify-between relative h-8">
          <div className="flex items-center gap-3"><LayoutGrid size={16} className="text-gray-400" /><h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estades a dependencies</h4></div>
          <div className="absolute left-1/2 -translate-x-1/2">{showMarker && (<div className="text-[10px] font-black text-red-500 uppercase tracking-widest bg-red-50 px-4 py-1.5 rounded-full border border-red-100 flex items-center gap-1.5 shadow-sm"><span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />Progrés: {Math.round(progressPct)}%</div>)}</div>
        </div>
        <div className="relative">
          <div className="relative h-16 w-full bg-gray-50/50 rounded-[28px] flex items-center px-1 shadow-inner border border-gray-100/50">
            {segments.map((seg, i) => {
              const widthPct = ((seg.end - seg.start) / totalDuration) * 100;
              const isSelected = selectedSeg?.start === seg.start && selectedSeg?.end === seg.end;
              const isCurrent = nowMin >= seg.start && nowMin < seg.end;
              const isGap = seg.type === 'gap';
              const segmentLabel = `${seg.codi} (${formatFgcTime(seg.start)} - ${formatFgcTime(seg.end)})`;
              const isBroken = seg.type === 'circ' && seg.train && brokenTrains.has(seg.train);
              
              return (
                <button 
                  key={i} 
                  onClick={() => setSelectedSeg(seg)} 
                  title={segmentLabel}
                  style={{ width: `${widthPct}%` }} 
                  className={`h-8 relative transition-all mx-0.5 outline-none flex items-center justify-center group/seg ${isBroken ? 'bg-red-600' : seg.color} ${isGap ? 'rounded-xl' : 'rounded-none'} ${isSelected ? 'brightness-110 scale-y-110 z-10 shadow-lg ring-2 ring-white/50' : 'hover:brightness-110 hover:z-20'} ${isCurrent ? 'ring-2 ring-red-500 shadow-lg' : ''}`}
                >
                  {widthPct > 5 && (<span className={`text-[9px] font-black pointer-events-none truncate px-1 ${seg.type === 'circ' ? (isBroken ? 'text-white' : 'text-gray-600') : 'text-white'}`}>{seg.codi}</span>)}
                  {isCurrent && (
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-600 rounded-full border border-white shadow-sm z-40" />
                  )}
                  {isBroken && <AlertTriangle size={8} className="absolute -bottom-2 text-red-600 animate-bounce" />}
                </button>
              );
            })}
          </div>
        </div>

        {selectedSeg && (
          <div className={`mt-4 p-5 rounded-2xl border animate-in fade-in slide-in-from-top-2 duration-300 flex items-center justify-between shadow-xl ${selectedSeg.type === 'circ' && selectedSeg.train && brokenTrains.has(selectedSeg.train) ? 'bg-red-600 text-white' : (selectedSeg.color + ' ' + (selectedSeg.type === 'circ' ? 'text-black border-gray-300 shadow-gray-200' : 'text-white border-white/20'))}`}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner border ${selectedSeg.type === 'circ' ? `${getLiniaColor(selectedSeg.linia)} border-white/20` : 'bg-white/20 border-white/20 backdrop-blur-sm'}`}>
                {selectedSeg.type === 'circ' ? (
                  <Train size={24} className="text-white" />
                ) : (
                  <Coffee size={24} className="text-white" />
                )}
              </div>
              <div>
                <p className={`text-[10px] font-black uppercase tracking-widest ${selectedSeg.type === 'circ' ? (selectedSeg.train && brokenTrains.has(selectedSeg.train) ? 'text-white/60' : 'text-gray-500') : 'text-white/60'}`}>{selectedSeg.type === 'circ' ? 'CIRCULACIÓ' : 'DESCANS / ESTADA'}</p>
                <p className="text-xl font-black flex items-center gap-2">
                  {selectedSeg.codi}
                  {selectedSeg.type === 'circ' && selectedSeg.train && brokenTrains.has(selectedSeg.train) && (
                    <span className="bg-white text-red-600 px-2 py-0.5 rounded-lg text-[10px] flex items-center gap-1 border border-red-100 shadow-sm animate-pulse">
                      <Wrench size={10} /> AVARIA
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="text-right flex flex-col items-end">
              <p className={`text-[10px] font-black uppercase tracking-widest ${selectedSeg.type === 'circ' ? (selectedSeg.train && brokenTrains.has(selectedSeg.train) ? 'text-white/60' : 'text-gray-500') : 'text-white/60'}`}>DURADA I HORARI</p>
              <p className="text-xl font-black">{selectedSeg.end - selectedSeg.start} min</p>
              <p className={`text-[10px] font-bold ${selectedSeg.type === 'circ' ? (selectedSeg.train && brokenTrains.has(selectedSeg.train) ? 'text-white/80' : 'text-gray-400') : 'text-white/80'}`}>{formatFgcTime(selectedSeg.start)} — {formatFgcTime(selectedSeg.end)}</p>
            </div>
            <button onClick={() => setSelectedSeg(null)} className={`ml-4 p-2 rounded-full transition-colors ${selectedSeg.type === 'circ' && !(selectedSeg.train && brokenTrains.has(selectedSeg.train)) ? 'hover:bg-gray-200 text-gray-400' : 'hover:bg-white/10 text-white/80'}`}>
              <X size={18} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const TimeGapRow = ({ from, to }: { from: string; to: string }) => {
    const minutes = calculateGap(from, to);
    if (minutes <= 0) return null;
    const isRest = minutes >= 15;
    const isActiveGap = nowMin >= getFgcMinutes(from) && nowMin < getFgcMinutes(to);
    
    return (
      <div className="px-8 py-2 flex justify-center items-center gap-4 animate-in fade-in duration-500 relative">
        <div className={`flex items-center gap-2 px-6 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider border transition-all ${
          isActiveGap 
            ? isRest 
              ? 'bg-fgc-green border-fgc-green/30 text-fgc-grey shadow-sm scale-105' 
              : 'bg-yellow-400 border-yellow-500/30 text-fgc-grey shadow-sm scale-105'
            : isRest 
              ? 'bg-fgc-green/15 text-fgc-grey border-fgc-green/30' 
              : 'bg-gray-50 text-gray-400 border-gray-100'
        }`}>
          {isActiveGap && <span className="w-1.5 h-1.5 rounded-full bg-fgc-grey animate-pulse shadow-sm" />}
          <span>{isRest ? 'Descans:' : ''} {minutes} min</span>
        </div>
      </div>
    );
  };

  const getShortTornId = (id: string) => {
    const trimmed = id.trim();
    if (trimmed.startsWith('Q') && !trimmed.startsWith('QR') && trimmed.length === 5) return trimmed[0] + trimmed.slice(2);
    return trimmed;
  };

  const fetchFullTurnData = async (turnIds: string[]) => {
    if (!turnIds.length) return [];
    // Paginem la consulta de shifts si n'hi ha molts (tot i que per servei rarament superen els 1000)
    const allServiceShifts = await fetchAllFromSupabase('shifts', supabase.from('shifts').select('id, circulations').eq('servei', selectedServei));
    
    const cycleMap = new Map<string, string>();
    allServiceShifts?.forEach(s => {
      (s.circulations as any[])?.forEach(c => {
        const codi = typeof c === 'string' ? c : c.codi;
        const cicle = typeof c === 'object' ? c.cicle : null;
        if (codi && cicle && codi !== 'Viatger') cycleMap.set(codi as string, cicle as string);
      });
    });

    const { data: shifts } = await supabase.from('shifts').select('*').in('id', turnIds).eq('servei', selectedServei);
    if (!shifts || shifts.length === 0) return [];

    const shortIdsToQuery = shifts.map(s => getShortTornId(s.id as string));
    const { data: dailyAssig } = await supabase.from('daily_assignments').select('*').in('torn', shortIdsToQuery);
    const employeeIds = dailyAssig?.map(d => d.empleat_id).filter(Boolean) || [];
    const { data: phones } = await supabase.from('phonebook').select('*').in('nomina', employeeIds as string[]);
    
    const allCircIds = new Set<string>();
    shifts.forEach(s => { 
      (s.circulations as any[])?.forEach(c => { 
        const codi = typeof c === 'string' ? c : c.codi; 
        if (codi === 'Viatger' && c.observacions) allCircIds.add(c.observacions.split('-')[0]); 
        if (codi && codi !== 'Viatger') allCircIds.add(codi as string); 
      }); 
    });

    // Consultem circulacions per IDs, evitant límits de 1000 si la llista és molt llarga
    const circDetails = await fetchAllFromSupabase('circulations', supabase.from('circulations').select('*').in('id', Array.from(allCircIds)));
    const { data: trainAssig } = await supabase.from('assignments').select('*');
    
    return shifts.map(shift => {
      const shortId = getShortTornId(shift.id as string);
      const assignment = dailyAssig?.find(d => d.torn === shortId);
      const driverPhone = phones?.find(p => p.nomina === assignment?.empleat_id);
      const fullCirculations = (shift.circulations as any[])?.map((cRef: any) => {
        const isViatger = cRef.codi === 'Viatger';
        const obsParts = isViatger && cRef.observacions ? cRef.observacions.split('-') : [];
        const realCodiId = isViatger && obsParts.length > 0 ? obsParts[0] : cRef.codi;
        
        const detail = circDetails?.find(cd => cd.id === realCodiId);
        let machinistInici = cRef.inici || detail?.inici;
        let machinistFinal = cRef.final || detail?.final;
        if (isViatger && obsParts.length >= 3) {
          machinistInici = obsParts[1];
          machinistFinal = obsParts[2];
        }
        let cCicle = typeof cRef === 'object' ? cRef.cicle : null;
        if (isViatger && !cCicle && realCodiId) cCicle = cycleMap.get(realCodiId);
        const cycleInfo = cCicle ? trainAssig?.find(ta => ta.cycle_id === cCicle) : null;
        return { ...detail, ...(typeof cRef === 'object' ? cRef : {}), id: cRef.codi, realCodi: isViatger ? realCodiId : null, codi: cRef.codi, machinistInici, machinistFinal, cicle: cCicle, train: cycleInfo?.train_number, linia: detail?.linia || cRef.linia };
      }).sort((a: any, b: any) => getFgcMinutes(a.sortida || '00:00') - getFgcMinutes(b.sortida || '00:00'));
      return { ...shift, driver: { nom: assignment?.nom || 'No assignat', nomina: assignment?.empleat_id || '---', phones: driverPhone?.phones || [], observacions: assignment?.observacions || '' }, fullCirculations };
    });
  };

  const handleInputChange = async (val: string) => {
    setQuery(val);
    if (!val || val.length < 1) {
      if (searchType === SearchType.Cicle) { setSuggestions(availableCycles.slice(0, 12)); setShowSuggestions(true); } else { setSuggestions([]); setShowSuggestions(false); }
      return;
    }
    if (searchType === SearchType.Torn) {
      const { data } = await supabase.from('shifts').select('id').eq('servei', selectedServei).ilike('id', `%${val}%`).limit(8);
      if (data) { setSuggestions((data as any[]).map(item => item.id as string)); setShowSuggestions(true); }
    } else if (searchType === SearchType.Maquinista) {
      const { data } = await supabase.from('daily_assignments').select('nom, empleat_id').or(`nom.ilike.%${val}%,empleat_id.ilike.%${val}%`).limit(8);
      if (data) { const unique = Array.from(new Set((data as any[]).map(d => `${d.nom} (${d.empleat_id})`))) as string[]; setSuggestions(unique); setShowSuggestions(true); }
    } else if (searchType === SearchType.Circulacio) {
      const { data } = await supabase.from('circulations').select('id').ilike('id', `%${val}%`).limit(8);
      if (data) { setSuggestions((data as any[]).map(item => item.id as string)); setShowSuggestions(true); }
    } else if (searchType === SearchType.Cicle) {
      const filtered = availableCycles.filter(c => c.toLowerCase().includes(val.toLowerCase())).slice(0, 12);
      setSuggestions(filtered); setShowSuggestions(true);
    } else { setSuggestions([]); setShowSuggestions(false); }
  };

  const executeSearch = async (overrideQuery?: string) => {
    let searchVal = overrideQuery || query;
    if (!searchVal && searchType !== SearchType.Cicle && searchType !== SearchType.Estacio) { setResults([]); return; }
    setLoading(true); setShowSuggestions(false);
    try {
      if (searchType === SearchType.Cicle) {
        // Obtenim tots els shifts per assegurar-nos de trobar el cicle encara que estigui al final de la llista
        const allShifts = await fetchAllFromSupabase('shifts', supabase.from('shifts').select('*').eq('servei', selectedServei));
        const cycleAssignments = await supabase.from('assignments').select('*').eq('cycle_id', searchVal).single();
        
        if (allShifts) {
          const flattenedCircs: any[] = [];
          const allCodiSet = new Set<string>();
          allShifts.forEach(shift => { (shift.circulations as any[])?.forEach(c => { const codi = typeof c === 'string' ? c : c.codi; if (c.cicle === searchVal) { flattenedCircs.push({ ...c, shift_id: shift.id, codi }); if (codi) allCodiSet.add(codi as string); } }); });
          
          // Paginem la consulta de circulacions per si n'hi ha moltes vinculades
          const details = await fetchAllFromSupabase('circulations', supabase.from('circulations').select('*').in('id', Array.from(allCodiSet)));
          
          const enrichedCircs = flattenedCircs.map(fc => { const detail = details?.find(d => d.id === fc.codi); return { ...detail, ...fc }; });
          enrichedCircs.sort((a, b) => getFgcMinutes(a.sortida || '00:00') - getFgcMinutes(b.sortida || '00:00'));
          setResults([{ type: 'cycle_summary', cycle_id: searchVal, train: cycleAssignments.data?.train_number || 'S/A', circulations: enrichedCircs }]);
        }
      } else if (searchType === SearchType.Estacio) {
        if (!selectedStation) { setLoading(false); return; }
        
        // Estratègia optimitzada per estació:
        // 1. Busquem tots els torns del servei seleccionat
        const allShifts = await fetchAllFromSupabase('shifts', supabase.from('shifts').select('id, circulations').eq('servei', selectedServei));
        const circIdsInService = new Set<string>();
        const cycleMap = new Map<string, string>();
        
        allShifts?.forEach(s => {
          (s.circulations as any[])?.forEach(c => {
            const codi = typeof c === 'string' ? c : c.codi;
            if (codi && codi !== 'Viatger') circIdsInService.add(codi as string);
            if (c.cicle) cycleMap.set(codi as string, c.cicle as string);
          });
        });

        // 2. Recuperem les dades d'aquestes circulacions concretes (sense límit de 1000)
        const allCircs = await fetchAllFromSupabase('circulations', supabase.from('circulations').select('*').in('id', Array.from(circIdsInService)));
        
        const matchingCircs: any[] = [];
        const startMinRange = getFgcMinutes(startTime);
        const endMinRange = getFgcMinutes(endTime);
        const targetStation = selectedStation.trim().toUpperCase();

        allCircs.forEach(c => {
          let stopTime: string | null = null;
          // Comprovem inici, final o parades intermèdies amb trim per evitar fallos amb espais
          if (c.inici?.trim().toUpperCase() === targetStation) stopTime = c.sortida as string; 
          else if (c.final?.trim().toUpperCase() === targetStation) stopTime = c.arribada as string;
          else { 
            const stop = (c.estacions as any[])?.find(st => st.nom?.trim().toUpperCase() === targetStation); 
            if (stop) stopTime = stop.hora || stop.arribada || stop.sortida; 
          }

          if (stopTime) { 
            const stopMin = getFgcMinutes(stopTime); 
            if (stopMin >= startMinRange && stopMin <= endMinRange) matchingCircs.push({ ...c, stopTimeAtStation: stopTime }); 
          }
        });

        const { data: trainAssig } = await supabase.from('assignments').select('*');
        const enrichedMatching = await Promise.all(matchingCircs.map(async mc => {
          const shift = allShifts?.find(s => (s.circulations as any[])?.some(cRef => (typeof cRef === 'string' ? cRef : cRef.codi) === mc.id));
          const shortId = shift ? getShortTornId(shift.id as string) : null;
          const { data: assig } = shortId ? await supabase.from('daily_assignments').select('*').eq('torn', shortId).single() : { data: null };
          const { data: phone } = assig?.empleat_id ? await supabase.from('phonebook').select('*').eq('nomina', assig.empleat_id).single() : { data: null };
          const cCicle = cycleMap.get(mc.id as string);
          const cycleInfo = cCicle ? trainAssig?.find(ta => ta.cycle_id === cCicle) : null;
          return { ...mc, shift_id: shift?.id || '---', driver: { nom: assig?.nom || 'No assignat', nomina: assig?.empleat_id || '---', phones: phone?.phones || [] }, cicle: cCicle, train: cycleInfo?.train_number };
        }));

        setResults([{ type: 'station_summary', station: selectedStation, circulations: enrichedMatching.sort((a, b) => getFgcMinutes(a.stopTimeAtStation) - getFgcMinutes(b.stopTimeAtStation)) }]);
      } else {
        let turnIds: string[] = [];
        switch (searchType) {
          case SearchType.Torn:
            const { data: s } = await supabase.from('shifts').select('id').eq('servei', selectedServei).ilike('id', `%${searchVal}%`);
            turnIds = s?.map(x => x.id as string) || [];
            break;
          case SearchType.Maquinista:
            const nominaMatch = searchVal.match(/\((\d+)\)$/);
            const filterVal = nominaMatch ? nominaMatch[1] : searchVal;
            const { data: m } = await supabase.from('daily_assignments').select('torn').or(`nom.ilike.%${filterVal}%,empleat_id.ilike.%${filterVal}%`);
            const shortTorns = Array.from(new Set(m?.map(x => x.torn) || []));
            const { data: allS } = await supabase.from('shifts').select('id').eq('servei', selectedServei);
            turnIds = allS?.filter(shift => shortTorns.includes(getShortTornId(shift.id as string))).map(x => x.id as string) || [];
            break;
          case SearchType.Circulacio:
            const { data: c } = await supabase.from('shifts').select('id, circulations').eq('servei', selectedServei);
            turnIds = c?.filter(turn => (turn.circulations as any[])?.some((circ: any) => (typeof circ === 'string' ? circ : circ.codi)?.toLowerCase().includes(searchVal.toLowerCase()))).map(turn => turn.id as string) || [];
            break;
        }
        const fullData = await fetchFullTurnData(turnIds);
        setResults(fullData);
      }
    } catch (error) { console.error("Error cercant dades:", error); } finally { setLoading(false); }
  };

  const handleSuggestionClick = (id: string) => { setQuery(id); setShowSuggestions(false); executeSearch(id); };
  useEffect(() => { if (query || (searchType === SearchType.Estacio && selectedStation)) executeSearch(); }, [selectedServei]);
  const toggleItinerari = (id: string) => { setExpandedItinerari(expandedItinerari === id ? null : id); };

  const CirculationHeader = () => (
    <div className="hidden md:grid grid-cols-[1fr_1.2fr_1.8fr_1.8fr_1.2fr] items-center gap-4 px-4 py-3 border-b border-gray-100 bg-gray-50/80 sticky top-0 z-10">
      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">Codi / Línia</div>
      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Cicle / Unitat</div>
      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Sortida (Estació i Via)</div>
      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Arribada (Estació i Via)</div>
      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-right px-4">Estat / Detalls</div>
    </div>
  );

  const CirculationRow = ({ circ, itemKey }: { circ: any; itemKey: string }) => {
    const isViatger = circ.codi === 'Viatger';
    const trainPhone = getTrainPhone(circ.train);
    const isActive = checkIfActive(circ.sortida, circ.arribada);
    const isBroken = circ.train && brokenTrains.has(circ.train);

    return (
      <div className={`p-2 sm:p-4 grid grid-cols-[1fr_1.2fr_1.8fr_1.8fr_1.2fr] items-center gap-2 sm:gap-4 w-full relative transition-colors ${isActive ? 'bg-red-50/30' : isBroken ? 'bg-red-50/20 shadow-inner' : ''}`}>
        {/* COL 1: Codi / Línia */}
        <div className="flex items-center gap-2 overflow-visible px-1">
            <div className={`px-2.5 py-1.5 ${getLiniaColor(circ.linia)} text-white rounded-lg font-black text-xs sm:text-sm shadow-sm flex items-center justify-center min-w-[58px]`}>{circ.codi}</div>
            <span className={`px-2 py-1 ${getLiniaColor(circ.linia)} text-white rounded-md font-black text-[9px] sm:text-[11px] shadow-sm flex-shrink-0`}>{circ.linia || '??'}</span>
        </div>
        
        {/* COL 2: Cicle / Unitat */}
        <div className="flex justify-center">
            {circ.cicle ? (
              <div className={`text-[10px] sm:text-sm font-black px-3 py-1.5 rounded-lg border shadow-sm flex items-center justify-center gap-2 transition-all w-full max-w-[150px] ${isBroken ? 'bg-red-600 text-white border-red-700 animate-pulse' : 'text-black bg-fgc-green/20 border-fgc-green/30'}`}>
                <span className="shrink-0">{circ.cicle}</span>
                {circ.train && (
                  <div className={`flex items-center gap-1.5 pl-2 border-l ${isBroken ? 'border-white/30' : 'border-fgc-green/40'}`}>
                    <a href={trainPhone ? `tel:${trainPhone}` : '#'} className={`${isBroken ? 'text-white' : 'text-fgc-grey'} hover:text-blue-700 transition-colors flex items-center gap-1 ${!trainPhone && 'pointer-events-none'}`}>
                      <Phone size={10} className="opacity-50" />
                      <span className="text-[10px] sm:text-xs">{circ.train}</span>
                    </a>
                  </div>
                )}
              </div>
            ) : (<span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest italic opacity-40">Sense assignar</span>)}
        </div>

        {/* COL 3: Sortida (Hora + Via + Estació) */}
        <div className="flex items-center gap-2 sm:gap-4 justify-center min-w-0">
            <div className={`text-base sm:text-2xl font-black tabular-nums w-14 sm:w-16 text-center ${isActive || isBroken ? 'text-red-600' : 'text-fgc-grey'}`}>{circ.sortida || '--:--'}</div>
            <div className="bg-fgc-green/20 text-fgc-grey border border-fgc-green/30 px-2 py-0.5 rounded text-[10px] font-black shadow-sm shrink-0">V{circ.via_inici || '?'}</div>
            <span className="text-[10px] sm:text-xs font-bold text-gray-400 truncate max-w-[100px] hidden sm:block">{circ.machinistInici || circ.inici || '---'}</span>
        </div>

        {/* COL 4: Arribada (Hora + Via + Estació) */}
        <div className="flex items-center gap-2 sm:gap-4 justify-center min-w-0">
            <span className="text-[10px] sm:text-xs font-bold text-gray-400 truncate max-w-[100px] text-right hidden sm:block">{circ.machinistFinal || circ.final || '---'}</span>
            <div className="bg-fgc-grey/10 text-fgc-grey border border-gray-200 px-2 py-0.5 rounded text-[10px] font-black shadow-sm shrink-0">V{circ.via_final || '?'}</div>
            <div className={`text-base sm:text-2xl font-black tabular-nums w-14 sm:w-16 text-center ${isActive || isBroken ? 'text-red-600' : 'text-fgc-grey'}`}>{circ.arribada || '--:--'}</div>
        </div>

        {/* COL 5: Estat / Detalls */}
        <div className="flex justify-end items-center gap-2 sm:gap-3 px-1 sm:px-4">
          {isBroken && (
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-[9px] font-black text-white bg-red-600 px-2 py-1 rounded-full border border-red-700 animate-pulse flex items-center gap-1 shadow-md">
                <AlertTriangle size={10} /> AVARIA
              </span>
            </div>
          )}
          {isActive && <span className="hidden xl:inline text-[9px] font-black text-red-500 animate-pulse bg-red-50 px-2.5 py-1 rounded-full border border-red-100 shadow-sm">ACTIU</span>}
          <button onClick={() => toggleItinerari(itemKey)} className={`p-2 sm:p-3 rounded-xl shadow-md hover:shadow-xl transition-all active:scale-95 border-b-2 border-black/5 flex items-center gap-2 shrink-0 ${isActive ? 'bg-red-600 text-white border-red-700' : isBroken ? 'bg-red-600 text-white border-red-700' : 'bg-fgc-green text-fgc-grey border-fgc-green'}`}>
            <BookOpen size={16} /><span className="hidden lg:inline text-[10px] font-black uppercase tracking-tighter">Itinerari</span>
          </button>
        </div>
      </div>
    );
  };

  const StationRow = ({ circ, itemKey }: { circ: any; itemKey: string }) => {
    const trainPhone = getTrainPhone(circ.train);
    const isActive = checkIfActive(circ.sortida, circ.arribada);
    const isBroken = circ.train && brokenTrains.has(circ.train);

    return (
      <div className={`p-2 sm:p-4 grid grid-cols-[1fr_1.2fr_1.8fr_1fr_1.2fr] items-center gap-2 sm:gap-4 w-full relative transition-colors ${isActive ? 'bg-red-50/40 shadow-inner' : isBroken ? 'bg-red-50/20' : ''}`}>
        {/* COL 1: Codi / Línia */}
        <div className="flex justify-start items-center gap-2 shrink-0 px-1">
          <div className={`px-2.5 py-1.5 ${getLiniaColor(circ.linia)} text-white rounded-lg font-black text-xs sm:text-sm shadow-sm flex items-center justify-center min-w-[58px]`}>{circ.id}</div>
          <span className={`px-2 py-1 ${getLiniaColor(circ.linia)} text-white rounded-md font-black text-[9px] sm:text-[11px] shadow-sm`}>{circ.linia || '??'}</span>
        </div>

        {/* COL 2: Cicle / Unitat */}
        <div className="flex justify-center shrink-0">
          {circ.cicle ? (
            <div className={`text-[10px] sm:text-sm font-black px-3 py-1.5 rounded-lg border shadow-sm flex items-center gap-2 w-full max-w-[140px] ${isBroken ? 'bg-red-600 text-white border-red-700 animate-pulse' : 'text-black bg-fgc-green/20 border-fgc-green/30'}`}>
              <span>{circ.cicle}</span>
              {circ.train && (
                <div className={`flex items-center gap-1.5 ml-1 pl-1.5 border-l ${isBroken ? 'border-white/30' : 'border-fgc-green/40'}`}>
                  <a href={trainPhone ? `tel:${trainPhone}` : '#'} className={`${isBroken ? 'text-white' : 'text-fgc-grey'} hover:text-blue-700 transition-colors flex items-center`}>
                    <Phone size={8} className="opacity-50" />
                    <span className="text-[10px] ml-0.5">{circ.train}</span>
                  </a>
                </div>
              )}
            </div>
          ) : (<span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest italic opacity-40">Sense assignar</span>)}
        </div>

        {/* COL 3: Maquinista */}
        <div className="flex flex-col items-start px-2 min-w-0">
          <span className={`text-sm sm:text-lg font-black leading-tight truncate w-full ${isActive ? 'text-red-700' : isBroken ? 'text-red-600' : 'text-fgc-grey'}`}>{circ.driver?.nom}</span>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[9px] font-black text-fgc-green uppercase tracking-widest">Torn {circ.shift_id}</span>
            <div className="flex gap-1.5">{circ.driver?.phones?.map((p: string, i: number) => (<a key={i} href={`tel:${p}`} className="text-blue-500 hover:text-blue-700 flex items-center p-1 bg-blue-50 rounded-md transition-colors"><Phone size={10} /></a>))}</div>
          </div>
        </div>

        {/* COL 4: Hora a l'estació */}
        <div className="flex justify-center shrink-0">
          <div className={`px-4 py-2 rounded-xl border transition-all tabular-nums ${isActive ? 'bg-red-600 text-white border-red-700 animate-pulse shadow-md scale-105' : isBroken ? 'bg-red-600 text-white border-red-700 shadow-sm' : 'bg-fgc-green/10 border-fgc-green/20'}`}>
            <span className={`text-base sm:text-2xl font-black ${isActive || isBroken ? 'text-white' : 'text-fgc-grey'}`}>{circ.stopTimeAtStation || '--:--'}</span>
          </div>
        </div>

        {/* COL 5: Detalls */}
        <div className="flex justify-end pr-1 sm:pr-4 items-center gap-2 shrink-0">
          {isBroken && <span className="hidden lg:inline text-[9px] font-black text-red-600 animate-pulse flex items-center gap-1 bg-red-50 px-2 py-1 rounded-full border border-red-100"><Wrench size={10} /> AVARIA</span>}
          <button onClick={() => toggleItinerari(itemKey)} className={`p-2 sm:p-3 rounded-xl shadow-md hover:shadow-xl transition-all active:scale-95 border-b-2 border-black/5 flex items-center gap-2 ${isActive || isBroken ? 'bg-red-600 text-white border-red-700' : 'bg-fgc-green text-fgc-grey'}`}>
            <BookOpen size={16} /><span className="hidden lg:inline text-[10px] font-black uppercase tracking-tighter">Itinerari</span>
          </button>
        </div>
      </div>
    );
  };

  const ItineraryPoint = ({ point, isFirst, isLast, nextPoint }: { point: any; isFirst?: boolean; isLast?: boolean; nextPoint?: any }) => {
    const pTime = point.hora || point.sortida || point.arribada;
    const pMin = getFgcMinutes(pTime);
    const isNow = pTime && nowMin === pMin;
    let isTransit = false; if (nextPoint && pTime && nextPoint.hora) { const nextMin = getFgcMinutes(nextPoint.hora); if (nowMin > pMin && nowMin < nextMin) { isTransit = true; } }
    return (
      <React.Fragment>
        <div className="relative flex items-center gap-4 sm:gap-8 py-4 group/point"><div className={`absolute left-[-30px] sm:left-[-50px] top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 sm:w-8 h-8 bg-white border-4 ${isFirst ? 'border-fgc-green' : isLast ? 'border-red-50' : 'border-gray-300'} rounded-full z-10`}>{isNow && <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]" />}</div><div className="w-16 sm:w-24 flex-shrink-0"><p className={`text-base sm:text-xl font-black ${isNow ? 'text-red-500' : 'text-fgc-grey'}`}>{pTime || '--:--'}</p>{isNow && <p className="text-[10px] font-black text-red-500">ARA</p>}</div><div className={`flex-1 p-2 sm:p-3 rounded-xl border transition-all ${isFirst ? 'bg-fgc-green/5 border-fgc-green/20' : isLast ? 'bg-red-50/50 border-red-100' : 'border-transparent group-hover/point:bg-gray-50'}`}><h5 className={`text-sm sm:text-lg ${isNow ? 'font-black text-red-600' : 'font-bold text-fgc-grey'}`}>{point.nom} {point.via && <span className="opacity-40 ml-1">(V{point.via})</span>}</h5></div></div>
        {isTransit && (<div className="relative h-12 flex items-center"><div className="absolute left-[-30px] sm:left-[-50px] top-0 bottom-0 flex flex-col items-center justify-center w-6 h-6 sm:w-8 h-8 z-20"><div className="w-3 h-3 bg-red-500 rounded-full animate-bounce shadow-[0_0_12px_rgba(239,68,68,1)] border-2 border-white" /></div><div className="pl-16 sm:pl-24 text-[10px] font-black text-red-500 uppercase tracking-widest animate-pulse">EN TRAJECTE...</div></div>)}
      </React.Fragment>
    );
  };

  const filteredCyclesList = availableCycles.filter(c => c.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div><h1 className="text-2xl sm:text-3xl font-black text-fgc-grey tracking-tight">Cerca de Servei</h1><p className="text-sm sm:text-base text-gray-500 font-medium">Informació de torns, circulacions i unitats de tren.</p></div>
        <div className="flex flex-col gap-2"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Filtre de Servei</span><div className="inline-flex bg-white p-1 rounded-2xl shadow-sm border border-gray-100">{serveiTypes.map(s => (<button key={s} onClick={() => setSelectedServei(s)} className={`px-3 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-black transition-all ${selectedServei === s ? 'bg-fgc-grey text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}>S-{s}</button>))}</div></div>
      </header>
      <div className="bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-8 shadow-sm border border-gray-100">
        <div className="flex flex-wrap gap-2 sm:gap-3 mb-6 sm:mb-8">{filterButtons.map((btn) => (<button key={btn.id} onClick={() => { setSearchType(btn.id); setResults([]); setQuery(''); setSuggestions([]); setShowSuggestions(false); }} className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-black transition-all ${searchType === btn.id ? 'bg-fgc-green text-fgc-grey shadow-xl shadow-fgc-green/20' : 'bg-gray-100 text-gray-400 hover:bg-gray-50'}`}>{btn.icon}{btn.label}</button>))}</div>
        
        {searchType === SearchType.Estacio ? (
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-end gap-6">
              <div className="flex-1 space-y-2"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Selecciona Estació</label><div className="relative"><MapPin className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" size={24} /><select value={selectedStation} onChange={(e) => setSelectedStation(e.target.value)} className="w-full bg-gray-50 border-none rounded-[24px] sm:rounded-[32px] py-4 sm:py-6 pl-16 pr-8 focus:ring-4 focus:ring-fgc-green/20 outline-none text-lg sm:text-2xl font-bold appearance-none cursor-pointer"><option value="">Tria una estació...</option>{allStations.map(st => <option key={st} value={st}>{st}</option>)}</select><ChevronDown className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={24} /></div></div>
              <div className="flex-1 flex flex-row gap-4 items-end">
                <div className="flex-1 space-y-2 relative">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 flex items-center gap-2">
                    De les
                    <button 
                      onClick={() => setStartTime(getCurrentTimeStr())} 
                      title="Hora actual"
                      className="text-fgc-green hover:text-fgc-grey transition-colors flex items-center"
                    >
                      <Clock size={12} />
                    </button>
                  </label>
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full bg-gray-50 border-none rounded-[24px] sm:rounded-[32px] py-4 sm:py-6 px-6 focus:ring-4 focus:ring-fgc-green/20 outline-none text-lg sm:text-2xl font-bold cursor-pointer" />
                </div>
                <div className="flex-1 space-y-2 relative">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 flex items-center gap-2">
                    A les
                    <button 
                      onClick={() => setEndTime(getCurrentTimeStr())} 
                      title="Hora actual"
                      className="text-fgc-green hover:text-fgc-grey transition-colors flex items-center"
                    >
                      <Clock size={12} />
                    </button>
                  </label>
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full bg-gray-50 border-none rounded-[24px] sm:rounded-[32px] py-4 sm:py-6 px-6 focus:ring-4 focus:ring-fgc-green/20 outline-none text-lg sm:text-2xl font-bold cursor-pointer" />
                </div>
              </div>
              <button onClick={() => executeSearch()} className="bg-fgc-green text-fgc-grey h-[60px] sm:h-[76px] px-8 sm:px-12 rounded-[24px] sm:rounded-[32px] text-lg sm:text-xl font-black shadow-xl shadow-fgc-green/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 shrink-0"><Search size={22} />CERCAR</button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-4" ref={suggestionsRef}>
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-gray-400">{loading ? <Loader2 className="animate-spin" size={24} /> : <Search size={24} />}</div>
                <input type="text" placeholder={`Cerca per ${searchType.toUpperCase()}...`} className="w-full bg-gray-50 border-none rounded-[24px] sm:rounded-[32px] py-4 sm:py-6 pl-14 sm:pl-16 pr-6 sm:pr-8 focus:ring-4 focus:ring-fgc-green/20 outline-none text-lg sm:text-2xl font-bold transition-all placeholder:text-gray-300" value={query} onChange={(e) => handleInputChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && executeSearch()} onFocus={() => setShowSuggestions(true)} />
                {showSuggestions && suggestions.length > 0 && (<div className="absolute top-full left-2 right-2 mt-2 bg-white rounded-[24px] shadow-2xl border border-gray-100 z-[200] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">{suggestions.map((id, sIdx) => (<button key={sIdx} onClick={() => handleSuggestionClick(id)} className="w-full text-left px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-xl font-bold text-fgc-grey hover:bg-gray-50 hover:text-fgc-green transition-colors flex items-center justify-between group"><span>{id}</span><ArrowRight size={18} className="opacity-0 group-hover:opacity-100 transition-opacity" /></button>))}</div>)}
              </div>
              <button onClick={() => executeSearch()} className="bg-fgc-green text-fgc-grey h-[60px] sm:h-[76px] px-8 sm:px-10 rounded-[24px] sm:rounded-[32px] text-lg sm:text-xl font-black shadow-xl shadow-fgc-green/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3"><Search size={22} />CERCAR</button>
            </div>
            {searchType === SearchType.Cicle && availableCycles.length > 0 && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-500 pt-4 border-t border-gray-50">
                <div className="flex items-center gap-3 mb-6 px-2"><Filter size={16} className="text-fgc-green" /><h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Selecció ràpida de Cicle (S-{selectedServei})</h3></div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar p-1">{filteredCyclesList.map(c => (<button key={c} onClick={() => handleSuggestionClick(c)} className={`py-4 px-3 rounded-2xl font-black text-sm transition-all border-b-4 active:scale-95 flex flex-col items-center justify-center gap-1 group/btn ${query === c ? 'bg-fgc-green text-fgc-grey border-fgc-green shadow-lg scale-105 z-10' : 'bg-white text-fgc-grey border-gray-200 hover:border-fgc-green/30 hover:bg-gray-50 shadow-sm'}`}><span className={`text-[9px] font-black uppercase tracking-tighter opacity-40 group-hover/btn:opacity-60 ${query === c ? 'text-fgc-grey' : 'text-gray-400'}`}>CICLE</span>{c}</button>))}{filteredCyclesList.length === 0 && (<div className="col-span-full py-8 text-center text-gray-300 italic font-medium">No s'han trobat cicles per a "{query}"</div>)}</div>
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="space-y-12 sm:space-y-16 mt-8">
        {results.length > 0 ? (
          results.map((group, idx) => {
            if (group.type === 'cycle_summary' || group.type === 'station_summary') {
              const isStationGroup = group.type === 'station_summary';
              return (
                <div key={idx} className="bg-white p-4 sm:p-10 rounded-[40px] sm:rounded-[56px] border border-gray-100 shadow-sm animate-in fade-in slide-in-from-bottom-12 duration-700">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-8 mb-6 sm:mb-12">
                    <div className="flex items-center gap-4 sm:gap-6">
                      <div className={`min-w-[3.5rem] min-h-[3.5rem] sm:min-w-[5rem] sm:min-h-[5rem] px-2 ${isStationGroup ? 'bg-fgc-green text-fgc-grey' : 'bg-fgc-grey text-white'} rounded-2xl sm:rounded-[28px] flex items-center justify-center text-base sm:text-2xl font-black shadow-lg`}><span className="truncate">{isStationGroup ? <MapPin size={28} /> : group.cycle_id}</span></div>
                      <div className="min-w-0">
                        <h2 className="text-lg sm:text-3xl font-black text-fgc-grey tracking-tighter uppercase truncate">{isStationGroup ? `Circulacions a ${group.station}` : 'Cronograma de Cicle'}</h2>
                        <div className="flex items-center gap-2 mt-0.5 sm:mt-1">{isStationGroup ? <Clock size={14} className="text-fgc-green" /> : <Train size={14} className="text-fgc-green" />}<p className="text-sm sm:text-lg font-bold text-gray-500">{isStationGroup ? `Franja: ${startTime} - ${endTime}` : `Unitat: ${group.train}`}</p></div>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-100 rounded-[32px] overflow-hidden bg-white shadow-sm">
                    <CirculationHeader />
                    <div className="grid grid-cols-1 divide-y divide-gray-100">
                      {group.circulations.map((circ: any, cIdx: number) => {
                        const itemKey = `group-${idx}-${cIdx}`; 
                        const isActive = checkIfActive((circ.sortida || circ.stopTimeAtStation) as string, (circ.arribada || circ.stopTimeAtStation) as string);
                        const itineraryPoints = [{ nom: circ.inici, hora: circ.sortida, via: circ.via_inici }, ...(circ.estacions?.map((st: any) => ({ nom: st.nom, hora: st.hora || st.sortida || st.arribada, via: st.via })) || []), { nom: circ.final, hora: circ.arribada, via: circ.via_final }];
                        return (
                          <div key={cIdx} className={`flex flex-col transition-all hover:bg-gray-50/50 relative ${isActive ? 'ring-2 ring-inset ring-red-600 z-10' : ''}`}>
                            <div className="w-full">
                              {isStationGroup ? <StationRow circ={circ} itemKey={itemKey} /> : <CirculationRow circ={circ} itemKey={itemKey} />}
                              {expandedItinerari === itemKey && (
                                <div className="p-4 sm:p-10 bg-white border-t border-gray-100 animate-in slide-in-from-top-4 duration-500 overflow-hidden">
                                  <div className="relative flex flex-col pl-8 sm:pl-16 pr-2 sm:pr-6 py-4 space-y-0">
                                    <div className="absolute left-[15px] sm:left-[29px] top-10 bottom-10 w-0.5 sm:w-1 bg-gray-100 rounded-full" />
                                    {itineraryPoints.map((point, pIdx) => (<ItineraryPoint key={pIdx} point={point} isFirst={pIdx === 0} isLast={pIdx === itineraryPoints.length - 1} nextPoint={itineraryPoints[pIdx + 1]}/>))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            }
            const currentStatus = getShiftCurrentStatus(group);
            return (
              <div key={idx} className="flex flex-col gap-1 group animate-in fade-in slide-in-from-bottom-12 duration-700">
                <div className="bg-white p-6 sm:p-10 rounded-t-[32px] sm:rounded-t-[48px] border-x border-t border-gray-100 shadow-sm transition-all group-hover:shadow-md">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 flex-1">
                      <div className="flex flex-col gap-1">
                        <h2 className="text-xl sm:text-3xl font-black text-fgc-grey tracking-tighter uppercase whitespace-nowrap overflow-hidden text-ellipsis leading-tight">Torn {group.id}</h2>
                        <div className="flex items-center gap-2">
                           <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-500 rounded-lg text-[10px] font-black uppercase tracking-tighter border border-gray-200/50">
                             <Timer size={12} /> {group.duracio}
                           </div>
                           <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-500 rounded-lg text-[10px] font-black uppercase tracking-tighter border border-gray-200/50">
                             <MapPin size={12} /> {group.dependencia}
                           </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 text-base sm:text-xl font-black text-fgc-green bg-fgc-green/5 px-4 py-2 rounded-xl border border-fgc-green/10 whitespace-nowrap">
                        <Clock size={20} />
                        <span>{group.inici_torn}</span>
                        <span className="opacity-30 mx-1">—</span>
                        <span>{group.final_torn}</span>
                      </div>
                      <div className={`px-5 py-2.5 rounded-2xl text-[10px] sm:text-xs font-black shadow-md border-b-4 border-black/10 transition-all ${currentStatus.color} whitespace-nowrap inline-block text-center`}>
                        {currentStatus.label}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-fgc-green p-6 sm:p-10 border-x border-fgc-green/20 shadow-sm">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 sm:gap-10">
                    <div className="flex items-center gap-6 sm:gap-8">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white/40 rounded-full flex items-center justify-center text-fgc-grey border-2 border-white/60 shadow-inner shrink-0"><User size={28} strokeWidth={2.5} /></div>
                      <div className="space-y-1"><h3 className="text-xl sm:text-2xl font-black text-fgc-grey tracking-tight leading-tight">{group.driver.nom}</h3><div className="inline-flex items-center bg-fgc-grey text-white px-2.5 py-0.5 rounded-lg font-black text-[9px] sm:text-[10px] tracking-widest uppercase">Nómina: {group.driver.nomina}</div></div>
                    </div>
                    <div className="flex flex-col md:items-end gap-4 w-full md:w-auto">
                      <div className="flex flex-wrap gap-2 sm:gap-3">{group.driver.phones?.map((p: string, i: number) => (<a key={i} href={`tel:${p}`} className="flex items-center gap-2.5 bg-fgc-grey text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-black hover:bg-fgc-dark transition-all shadow-xl active:scale-95 group/tel"><Phone size={14} className="group-hover/tel:rotate-12 transition-transform" />{p}</a>))}</div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white p-4 sm:p-10 rounded-b-[32px] sm:rounded-b-[48px] border-x border-b border-gray-100 shadow-sm overflow-hidden">
                  <ShiftTimeline turn={group} />
                  <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8 w-full">
                    <div className="h-px bg-gray-100 flex-1" />
                    <div className="flex items-center gap-2"><Train size={14} className="text-gray-300" /><h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Full de Servei</h4></div>
                    <div className="h-px bg-gray-100 flex-1" />
                  </div>

                  <div className="border border-gray-100 rounded-[32px] overflow-hidden bg-white shadow-sm mb-4">
                    <CirculationHeader />
                    <div className="flex flex-col divide-y divide-gray-100">
                      {group.fullCirculations?.[0] && (<TimeGapRow from={group.inici_torn as string} to={group.fullCirculations[0].sortida as string} />)}
                      {group.fullCirculations?.map((circ: any, cIdx: number) => {
                        const shiftItemKey = `${idx}-${cIdx}`; 
                        const isActive = checkIfActive(circ.sortida as string, circ.arribada as string);
                        const itineraryPoints = [{ nom: circ.inici, hora: circ.sortida, via: circ.via_inici }, ...(circ.estacions?.map((st: any) => ({ nom: st.nom, hora: st.hora || st.sortida || st.arribada, via: st.via })) || []), { nom: circ.final, hora: circ.arribada, via: circ.via_final }];
                        return (
                          <React.Fragment key={cIdx}>
                            <div className={`flex flex-col transition-all overflow-hidden relative ${isActive ? 'ring-2 ring-inset ring-red-600 z-10' : circ.codi === 'Viatger' ? 'bg-blue-50/10' : ''}`}>
                              <CirculationRow circ={circ} itemKey={shiftItemKey} />
                              {expandedItinerari === shiftItemKey && (
                                <div className="p-4 sm:p-10 bg-white border-t border-gray-100 animate-in slide-in-from-top-4 duration-500 overflow-hidden">
                                  <div className="relative flex flex-col pl-8 sm:pl-16 pr-2 sm:pr-6 py-4 space-y-0">
                                    <div className="absolute left-[15px] sm:left-[29px] top-10 bottom-10 w-0.5 sm:w-1 bg-gray-100 rounded-full" />
                                    {itineraryPoints.map((point, pIdx) => (<ItineraryPoint key={pIdx} point={point} isFirst={pIdx === 0} isLast={pIdx === itineraryPoints.length - 1} nextPoint={itineraryPoints[pIdx + 1]}/>))}
                                  </div>
                                </div>
                              )}
                            </div>
                            {cIdx < group.fullCirculations.length - 1 ? (<TimeGapRow from={circ.arribada as string} to={group.fullCirculations[cIdx + 1].sortida as string} />) : (<TimeGapRow from={circ.arribada as string} to={group.final_torn as string} />)}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (query.length >= 1 || (searchType === SearchType.Estacio && selectedStation)) && !loading ? (
          <div className="bg-white rounded-[32px] sm:rounded-[56px] py-20 sm:py-32 text-center text-gray-400 flex flex-col items-center gap-6 sm:gap-8 shadow-sm border border-gray-100"><div className="w-24 h-24 sm:w-32 sm:h-32 bg-gray-50 rounded-full flex items-center justify-center text-gray-100"><Search size={48} /></div><div className="space-y-2"><p className="text-xl sm:text-2xl font-black text-fgc-grey uppercase tracking-tighter">No s'han trobat dades</p><p className="text-sm sm:text-base text-gray-400 font-medium">Revisa els paràmetres per a S-{selectedServei}.</p></div></div>
        ) : !loading && (
          <div className="text-center py-24 sm:py-40 opacity-10 flex flex-col items-center"><Train size={80} className="text-fgc-grey mb-8" /><p className="text-lg sm:text-2xl font-black uppercase tracking-[0.4em] text-fgc-grey">Consulta de Torns Activa</p></div>
        )}
      </div>
    </div>
  );
};

export default CercarView;