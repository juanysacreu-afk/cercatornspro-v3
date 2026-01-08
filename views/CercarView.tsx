import React, { useState, useEffect, useRef } from 'react';
import { SearchType, Shift, Circulation, DailyAssignment, PhonebookEntry, Assignment } from '../types.ts';
import { Search, User, Train, MapPin, Hash, ArrowRight, Loader2, Info, Phone, Clock, FileText, ChevronDown, ChevronUp, Map as MapIcon, Navigation, Coffee, Footprints, Circle, LayoutGrid, Timer, X, BookOpen, CalendarDays, Filter, AlertTriangle, Wrench, Users, UserCheck, Camera, Brush } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';

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

const ItineraryPoint: React.FC<{ point: any; isFirst?: boolean; isLast?: boolean; nextPoint?: any; nowMin: number }> = ({ point, isFirst, isLast, nextPoint, nowMin }) => {
  const pTime = point.hora || point.sortida || point.arribada;
  const pMin = getFgcMinutes(pTime);
  const isNow = pTime && nowMin === pMin;
  
  let isTransit = false;
  if (nextPoint && pTime && nextPoint.hora) {
    const nextMin = getFgcMinutes(nextPoint.hora);
    // Verificació de trànsit evitant tokens conflictius en una sola línia
    if (nowMin > pMin) {
      if (nowMin < nextMin) {
        isTransit = true;
      }
    }
  }

  return (
    <React.Fragment>
      <div className="relative flex items-center gap-4 sm:gap-8 py-4 group/point">
        <div className={`absolute left-[-30px] sm:left-[-50px] top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 sm:w-8 h-8 bg-white dark:bg-gray-800 border-4 ${isFirst ? 'border-fgc-green' : isLast ? 'border-red-50 dark:border-red-900/30' : 'border-gray-300 dark:border-gray-700'} rounded-full z-10`}>
          {isNow && <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]" />}
        </div>
        <div className="w-16 sm:w-24 flex-shrink-0">
          <p className={`text-base sm:text-xl font-black ${isNow ? 'text-red-500' : 'text-fgc-grey dark:text-gray-200'}`}>{pTime || '--:--'}</p>
          {isNow && <p className="text-[10px] font-black text-red-500">ARA</p>}
        </div>
        <div className={`flex-1 p-2 sm:p-3 rounded-xl border transition-all ${isFirst ? 'bg-fgc-green/5 dark:bg-fgc-green/10 border-fgc-green/20 dark:border-fgc-green/20' : isLast ? 'bg-red-50/50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30' : 'border-transparent group-hover/point:bg-gray-50 dark:group-hover/point:bg-white/5'}`}>
          <h5 className={`text-sm sm:text-lg ${isNow ? 'font-black text-red-600' : 'font-bold text-fgc-grey dark:text-gray-300'}`}>{point.nom} {point.via && <span className="opacity-40 dark:opacity-50 ml-1">(V{point.via})</span>}</h5>
        </div>
      </div>
      {isTransit && (
        <div className="relative h-12 flex items-center">
          <div className="absolute left-[-30px] sm:left-[-50px] top-0 bottom-0 flex flex-col items-center justify-center w-6 h-6 sm:w-8 h-8 z-20">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-bounce shadow-[0_0_12px_rgba(239,68,68,1)] border-2 border-white dark:border-gray-800" />
          </div>
          <div className="pl-16 sm:pl-24 text-[10px] font-black text-red-500 uppercase tracking-widest animate-pulse">EN TRAJECTE...</div>
        </div>
      )}
    </React.Fragment>
  );
};

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
  const [trainStatuses, setTrainStatuses] = useState<Record<string, any>>({});
  
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

  const fetchTrainStatuses = async () => {
    const { data } = await supabase
      .from('train_status')
      .select('*')
      .or('is_broken.eq.true,needs_images.eq.true,needs_records.eq.true,needs_cleaning.eq.true');
    
    if (data) {
      const statusMap: Record<string, any> = {};
      data.forEach(s => {
        statusMap[s.train_number] = s;
      });
      setTrainStatuses(statusMap);
    }
  };

  useEffect(() => {
    fetchTrainStatuses();
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
        let q = supabase.from('shifts').select('circulations');
        if (selectedServei !== 'Tots') q = q.eq('servei', selectedServei);
        
        const shiftsData = await fetchAllFromSupabase('shifts', q);
        const cyclesSet = new Set<string>();
        
        if (shiftsData) {
          shiftsData.forEach(s => {
            (s.circulations as any[])?.forEach(c => {
              const cicle = typeof c === 'object' ? c.cicle : null;
              if (cicle) cyclesSet.add(cicle as string);
            });
          });
        }
        
        setAvailableCycles(Array.from(cyclesSet).sort((a, b) => {
          return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        }));
        setLoading(false);
      }
      
      if (searchType === SearchType.Estacio) {
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
    if (c === 'Viatger') return 'bg-sky-500';
    return 'bg-gray-200 dark:bg-gray-700';
  };

  const getLiniaColor = (linia: string) => {
    const l = linia?.toUpperCase().trim() || '';
    if (l === 'L6') return 'bg-purple-600';
    if (l === 'L7') return 'bg-[#8B4513]';
    if (l === 'L12') return 'bg-purple-300';
    if (l === 'S1') return 'bg-orange-500';
    if (l === 'S2') return 'bg-[#00B140]';
    return 'bg-fgc-grey dark:bg-gray-800';
  };

  const getShiftCurrentStatus = (turn: any, shiftIdx: number) => {
    const start = getFgcMinutes(turn.inici_torn);
    const end = getFgcMinutes(turn.final_torn);
    
    if (nowMin < start) return { label: 'No ha iniciat', color: 'bg-gray-200 dark:bg-gray-800 text-gray-500', targetId: null };
    if (nowMin >= end) return { label: 'Finalitzat', color: 'bg-fgc-grey dark:bg-black text-white', targetId: null };
    
    const circs = turn.fullCirculations || [];
    for (let i = 0; i < circs.length; i++) {
      if (checkIfActive(circs[i].sortida, circs[i].arribada)) {
        return { 
          label: `LIVE: ${circs[i].codi}`, 
          color: 'bg-red-500 text-white animate-pulse shadow-lg',
          targetId: `circ-row-${shiftIdx}-${i}`
        };
      }
    }
    
    if (circs.length === 0) {
      return { label: `Temps: ${end - nowMin} min`, color: 'bg-yellow-400 text-fgc-grey shadow-sm', targetId: null };
    }

    const firstStart = getFgcMinutes(circs[0].sortida);
    if (nowMin < firstStart) {
      const remaining = firstStart - nowMin;
      return { 
        label: `${(firstStart - start) >= 15 ? 'Descans' : 'Temps'}: ${remaining} min`, 
        color: (firstStart - start) >= 15 ? 'bg-fgc-green text-fgc-grey shadow-sm' : 'bg-yellow-400 text-fgc-grey shadow-sm',
        targetId: `gap-pre-${shiftIdx}`
      };
    }

    for (let i = 0; i < circs.length; i++) {
      const currentEnd = getFgcMinutes(circs[i].arribada);
      const nextStart = circs[i+1] ? getFgcMinutes(circs[i+1].sortida) : end;
      if (nowMin >= currentEnd && nowMin < nextStart) {
        const gapDuration = nextStart - currentEnd;
        const remaining = nextStart - nowMin;
        return { 
          label: `${gapDuration >= 15 ? 'Descans' : 'Temps'}: ${remaining} min`, 
          color: gapDuration >= 15 ? 'bg-fgc-green text-fgc-grey shadow-sm' : 'bg-yellow-400 text-fgc-grey shadow-sm',
          targetId: `gap-row-${shiftIdx}-${i}`
        };
      }
    }
    
    return { label: 'En servei', color: 'bg-fgc-green text-fgc-grey shadow-sm', targetId: null };
  };

  const isDriverWorkingNow = (obs: string) => {
    if (!obs) return false;
    const timeMatch = obs.match(/(\d{2}:\d{2})\s*[-–—a]\s*(\d{2}:\d{2})/i);
    if (timeMatch) {
      const start = getFgcMinutes(timeMatch[1]);
      const end = getFgcMinutes(timeMatch[2]);
      if (start > end) {
        return nowMin >= start || nowMin < end;
      }
      return nowMin >= start && nowMin < end;
    }
    return false;
  };

  const scrollToElement = (id: string | null) => {
    if (!id) return;
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-4', 'ring-blue-400/50', 'z-50');
      setTimeout(() => {
        element.classList.remove('ring-4', 'ring-blue-400/50', 'z-50');
      }, 2000);
    }
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
      segments.push({ start: circStart, end: circEnd, type: 'circ', codi: circ.codi, realCodi: circ.realCodi, color: 'bg-gray-300 dark:bg-gray-700', linia: circ.linia, train: circ.train });
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
          <div className="flex items-center gap-3"><LayoutGrid size={16} className="text-gray-400 dark:text-gray-500" /><h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Estades a dependencies</h4></div>
          <div className="absolute left-1/2 -translate-x-1/2">{showMarker && (<div className="text-[10px] font-black text-red-500 uppercase tracking-widest bg-red-50 dark:bg-red-950/30 px-4 py-1.5 rounded-full border border-red-100 dark:border-red-900 flex items-center gap-1.5 shadow-sm"><span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />Progrés: {Math.round(progressPct)}%</div>)}</div>
        </div>
        <div className="relative">
          <div className="relative h-16 w-full bg-gray-50/50 dark:bg-black/20 rounded-[28px] flex items-center px-1 shadow-inner border border-gray-100/50 dark:border-white/5">
            {segments.map((seg, i) => {
              const widthPct = ((seg.end - seg.start) / totalDuration) * 100;
              const isSelected = selectedSeg?.start === seg.start && selectedSeg?.end === seg.end;
              const isCurrent = nowMin >= seg.start && nowMin < seg.end;
              const isGap = seg.type === 'gap';
              const segmentLabel = `${seg.codi} (${formatFgcTime(seg.start)} - ${formatFgcTime(seg.end)})`;
              const status = seg.train ? trainStatuses[seg.train] : null;
              const isBroken = status?.is_broken;
              
              return (
                <button 
                  key={i} 
                  onClick={() => setSelectedSeg(seg)} 
                  title={segmentLabel}
                  style={{ width: `${widthPct}%` }} 
                  className={`h-8 relative transition-all mx-0.5 outline-none flex items-center justify-center group/seg ${isBroken ? 'bg-red-600' : seg.color} ${isGap ? 'rounded-xl' : 'rounded-none'} ${isSelected ? 'brightness-110 scale-y-110 z-10 shadow-lg ring-2 ring-white/50 dark:ring-white/20' : 'hover:brightness-110 hover:z-20'} ${isCurrent ? 'ring-2 ring-red-500 shadow-lg' : ''}`}
                >
                  {widthPct > 5 && (<span className={`text-[9px] font-black pointer-events-none truncate px-1 ${seg.type === 'circ' ? (isBroken ? 'text-white' : 'text-gray-600 dark:text-gray-300') : 'text-white'}`}>{seg.codi === 'Viatger' ? seg.realCodi : seg.codi}</span>)}
                  {isCurrent && (
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-600 rounded-full border border-white dark:border-gray-900 shadow-sm z-40" />
                  )}
                  {isBroken && <AlertTriangle size={8} className="absolute -bottom-2 text-red-600 animate-bounce" />}
                </button>
              );
            })}
          </div>
        </div>

        {selectedSeg && (
          <div className={`mt-4 p-5 rounded-2xl border animate-in fade-in slide-in-from-top-2 duration-300 flex items-center justify-between shadow-xl ${selectedSeg.type === 'circ' && selectedSeg.train && trainStatuses[selectedSeg.train]?.is_broken ? 'bg-red-600 text-white' : (selectedSeg.color + ' ' + (selectedSeg.type === 'circ' ? 'text-black dark:text-gray-200 border-gray-300 dark:border-gray-700 shadow-gray-200 dark:shadow-black' : 'text-white border-white/20'))}`}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner border ${selectedSeg.type === 'circ' ? `${getLiniaColor(selectedSeg.linia)} border-white/20` : 'bg-white/20 border-white/20 backdrop-blur-sm'}`}>
                {selectedSeg.type === 'circ' ? (
                  <Train size={24} className="text-white" />
                ) : (
                  <Coffee size={24} className="text-white" />
                )}
              </div>
              <div>
                <p className={`text-[10px] font-black uppercase tracking-widest ${selectedSeg.type === 'circ' ? (selectedSeg.train && trainStatuses[selectedSeg.train]?.is_broken ? 'text-white/60' : 'text-gray-500 dark:text-gray-400') : 'text-white/60'}`}>{selectedSeg.type === 'circ' ? 'CIRCULACIÓ' : 'DESCANS / ESTADA'}</p>
                <p className="text-xl font-black flex items-center gap-2">
                  {selectedSeg.codi === 'Viatger' ? `Viatger (${selectedSeg.realCodi})` : selectedSeg.codi}
                  {selectedSeg.type === 'circ' && selectedSeg.train && trainStatuses[selectedSeg.train]?.is_broken && (
                    <span className="bg-white text-red-600 px-2 py-0.5 rounded-lg text-[10px] flex items-center gap-1 border border-red-100 shadow-sm animate-pulse">
                      <Wrench size={10} /> AVARIA
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="text-right flex flex-col items-end">
              <p className={`text-[10px] font-black uppercase tracking-widest ${selectedSeg.type === 'circ' ? (selectedSeg.train && trainStatuses[selectedSeg.train]?.is_broken ? 'text-white/60' : 'text-gray-500 dark:text-gray-400') : 'text-white/60'}`}>DURADA I HORARI</p>
              <p className="text-xl font-black">{selectedSeg.end - selectedSeg.start} min</p>
              <p className={`text-[10px] font-bold ${selectedSeg.type === 'circ' ? (selectedSeg.train && trainStatuses[selectedSeg.train]?.is_broken ? 'text-white/80' : 'text-gray-400 dark:text-gray-500') : 'text-white/80'}`}>{formatFgcTime(selectedSeg.start)} — {formatFgcTime(selectedSeg.end)}</p>
            </div>
            <button onClick={() => setSelectedSeg(null)} className={`ml-4 p-2 rounded-full transition-colors ${selectedSeg.type === 'circ' && !(selectedSeg.train && trainStatuses[selectedSeg.train]?.is_broken) ? 'hover:bg-gray-200 dark:hover:bg-white/10 text-gray-400 dark:text-gray-500' : 'hover:bg-white/10 text-white/80'}`}>
              <X size={18} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const TimeGapRow = ({ from, to, id }: { from: string; to: string; id?: string }) => {
    const minutes = calculateGap(from, to);
    if (minutes <= 0) return null;
    const isRest = minutes >= 15;
    const isActiveGap = nowMin >= getFgcMinutes(from) && nowMin < getFgcMinutes(to);
    
    return (
      <div id={id} className="px-8 py-2 flex justify-center items-center gap-4 animate-in fade-in duration-500 relative scroll-mt-24">
        <div className={`flex items-center gap-2 px-6 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider border transition-all ${
          isActiveGap 
            ? isRest 
              ? 'bg-fgc-green border-fgc-green/30 text-fgc-grey shadow-sm scale-105 ring-2 ring-fgc-grey/20' 
              : 'bg-yellow-400 border-yellow-500/30 text-fgc-grey shadow-sm scale-105 ring-2 ring-yellow-500/20'
            : isRest 
              ? 'bg-fgc-green/15 text-fgc-grey dark:text-gray-300 border-fgc-green/30 dark:border-fgc-green/20' 
              : 'bg-gray-50 dark:bg-white/5 text-gray-400 dark:text-gray-500 border-gray-100 dark:border-white/5'
        }`}>
          {isActiveGap && <span className="w-1.5 h-1.5 rounded-full bg-fgc-grey dark:bg-black animate-pulse shadow-sm" />}
          <span>{isRest ? 'Descans:' : 'Temps:'} {minutes} min</span>
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
    
    const { data: shifts, error: shiftError } = await supabase.from('shifts').select('*').in('id', turnIds);
    if (!shifts || shifts.length === 0) return [];

    const shortIdsToQuery = shifts.map(s => getShortTornId(s.id as string));
    const { data: dailyAssig } = await supabase.from('daily_assignments').select('*').in('torn', shortIdsToQuery);
    
    const employeeIds = dailyAssig?.map(d => d.empleat_id).filter(Boolean) || [];
    const { data: phones } = await supabase.from('phonebook').select('*').in('nomina', employeeIds as string[]);
    
    const allCircIds = new Set<string>();
    const viatgerRealIds = new Set<string>();
    
    shifts.forEach(s => { 
      (s.circulations as any[])?.forEach(c => { 
        const codi = typeof c === 'string' ? c : c.codi; 
        if (codi === 'Viatger' && c.observacions) {
          const rCodi = c.observacions.split('-')[0];
          allCircIds.add(rCodi);
          viatgerRealIds.add(rCodi);
        }
        if (codi && codi !== 'Viatger') allCircIds.add(codi as string); 
      }); 
    });

    const circDetails = await fetchAllFromSupabase('circulations', supabase.from('circulations').select('*').in('id', Array.from(allCircIds)));
    const { data: trainAssig } = await supabase.from('assignments').select('*');
    
    let viatgerCycleMap: Record<string, {cicle: string, train: string}> = {};
    if (viatgerRealIds.size > 0) {
      const { data: helperShifts } = await supabase.from('shifts').select('circulations').eq('servei', selectedServei);
      helperShifts?.forEach(hs => {
        (hs.circulations as any[])?.forEach(hc => {
          const hCodi = typeof hc === 'object' ? hc.codi : hc;
          if (hCodi && hCodi !== 'Viatger' && viatgerRealIds.has(hCodi)) {
            if (hc.cicle) {
              const tAssig = trainAssig?.find(ta => ta.cycle_id === hc.cicle);
              viatgerCycleMap[hCodi] = { 
                cicle: hc.cicle, 
                train: tAssig?.train_number || '' 
              };
            }
          }
        });
      });
    }
    
    return shifts.map(shift => {
      const shortId = getShortTornId(shift.id as string);
      const assignments = dailyAssig?.filter(d => d.torn === shortId) || [];
      
      const drivers = assignments.map(assig => {
        const phoneData = phones?.find(p => p.nomina === assig.empleat_id);
        return {
          nom: assig.nom || 'No assignat',
          cognoms: assig.cognoms || '',
          nomina: assig.empleat_id || '---',
          phones: phoneData?.phones || [],
          observacions: assig.observacions || '',
          abs_parc_c: assig.abs_parc_c,
          dta: assig.dta,
          dpa: assig.dpa,
          tipus_torn: assig.tipus_torn
        };
      });

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
        
        let cCicle = (typeof cRef === 'object' ? cRef.cicle : null) || (isViatger ? viatgerCycleMap[realCodiId]?.cicle : null);
        let cTrain = isViatger ? viatgerCycleMap[realCodiId]?.train : null;
        
        const cycleInfo = cCicle ? trainAssig?.find(ta => ta.cycle_id === cCicle) : null;
        
        return { 
          ...detail, 
          ...(typeof cRef === 'object' ? cRef : {}), 
          id: cRef.codi, 
          realCodi: isViatger ? realCodiId : null, 
          codi: cRef.codi, 
          machinistInici, 
          machinistFinal, 
          cicle: cCicle, 
          train: cTrain || cycleInfo?.train_number, 
          linia: detail?.linia || cRef.linia 
        };
      }).sort((a: any, b: any) => getFgcMinutes(a.sortida || '00:00') - getFgcMinutes(b.sortida || '00:00'));

      return { 
        ...shift, 
        drivers: drivers.length > 0 ? drivers : [{ nom: 'No assignat', cognoms: '', nomina: '---', phones: [], observacions: '' }], 
        fullCirculations 
      };
    });
  };

  const handleInputChange = async (val: string) => {
    setQuery(val);
    if (!val || val.length < 1) {
      if (searchType === SearchType.Cicle) { setSuggestions(availableCycles.slice(0, 12)); setShowSuggestions(true); } else { setSuggestions([]); setShowSuggestions(false); }
      return;
    }
    if (searchType === SearchType.Torn) {
      let q = supabase.from('shifts').select('id').ilike('id', `%${val}%`);
      if (selectedServei !== 'Tots') q = q.eq('servei', selectedServei);
      const { data } = await q.limit(8);
      if (data) { setSuggestions((data as any[]).map(item => item.id as string)); setShowSuggestions(true); }
    } else if (searchType === SearchType.Maquinista) {
      const { data } = await supabase.from('daily_assignments')
        .select('nom, cognoms, empleat_id')
        .or(`nom.ilike.%${val}%,cognoms.ilike.%${val}%,empleat_id.ilike.%${val}%`)
        .limit(8);
      if (data) { 
        const unique = Array.from(new Set((data as any[]).map(d => `${d.cognoms || ''}, ${d.nom || ''} (${d.empleat_id})`))) as string[]; 
        setSuggestions(unique); setShowSuggestions(true); 
      }
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
        let q = supabase.from('shifts').select('*');
        if (selectedServei !== 'Tots') q = q.eq('servei', selectedServei);
        const allShifts = await fetchAllFromSupabase('shifts', q);
        const cycleAssignments = await supabase.from('assignments').select('*').eq('cycle_id', searchVal).single();
        if (allShifts) {
          const flattenedCircs: any[] = [];
          const allCodiSet = new Set<string>();
          allShifts.forEach(shift => { (shift.circulations as any[])?.forEach(c => { const codi = typeof c === 'string' ? c : c.codi; if (c.cicle === searchVal) { flattenedCircs.push({ ...c, shift_id: shift.id, codi }); if (codi) allCodiSet.add(codi as string); } }); });
          const details = await fetchAllFromSupabase('circulations', supabase.from('circulations').select('*').in('id', Array.from(allCodiSet)));
          const enrichedCircs = flattenedCircs.map(fc => { const detail = details?.find(d => d.id === fc.codi); return { ...detail, ...fc }; });
          enrichedCircs.sort((a, b) => getFgcMinutes(a.sortida || '00:00') - getFgcMinutes(b.sortida || '00:00'));
          setResults([{ type: 'cycle_summary', cycle_id: searchVal, train: cycleAssignments.data?.train_number || 'S/A', circulations: enrichedCircs }]);
        }
      } else if (searchType === SearchType.Estacio) {
        if (!selectedStation) { setLoading(false); return; }
        let q = supabase.from('shifts').select('id, circulations');
        if (selectedServei !== 'Tots') q = q.eq('servei', selectedServei);
        const allShifts = await fetchAllFromSupabase('shifts', q);
        const circIdsInService = new Set<string>();
        allShifts?.forEach(s => { (s.circulations as any[])?.forEach(c => { const codi = typeof c === 'string' ? c : c.codi; if (codi && codi !== 'Viatger') circIdsInService.add(codi as string); }); });
        const allCircs = await fetchAllFromSupabase('circulations', supabase.from('circulations').select('*').in('id', Array.from(circIdsInService)));
        const matchingCircs: any[] = [];
        const startMinRange = getFgcMinutes(startTime);
        const endMinRange = getFgcMinutes(endTime);
        const targetStation = selectedStation.trim().toUpperCase();
        allCircs.forEach(c => {
          let stopTime: string | null = null;
          if (c.inici?.trim().toUpperCase() === targetStation) stopTime = c.sortida as string; 
          else if (c.final?.trim().toUpperCase() === targetStation) stopTime = c.arribada as string;
          else { const stop = (c.estacions as any[])?.find(st => st.nom?.trim().toUpperCase() === targetStation); if (stop) stopTime = stop.hora || stop.arribada || stop.sortida; }
          if (stopTime) { const stopMin = getFgcMinutes(stopTime); if (stopMin >= startMinRange && stopMin <= endMinRange) matchingCircs.push({ ...c, stopTimeAtStation: stopTime }); }
        });
        const { data: trainAssig } = await supabase.from('assignments').select('*');
        const enrichedMatching = await Promise.all(matchingCircs.map(async mc => {
          const shift = allShifts?.find(s => (s.circulations as any[])?.some(cRef => (typeof cRef === 'string' ? cRef : cRef.codi) === mc.id));
          const shortId = shift ? getShortTornId(shift.id as string) : null;
          const { data: assignments } = shortId ? await supabase.from('daily_assignments').select('*').eq('torn', shortId) : { data: [] };
          const employeeIds = assignments?.map(a => a.empleat_id).filter(Boolean) || [];
          const { data: phones } = employeeIds.length > 0 ? await supabase.from('phonebook').select('*').in('nomina', employeeIds) : { data: [] };
          const drivers = (assignments || []).map(assig => {
            const pData = phones?.find(p => p.nomina === assig.empleat_id);
            return { nom: assig.nom || 'No assignat', cognoms: assig.cognoms || '', nomina: assig.empleat_id || '---', phones: pData?.phones || [], observacions: assig.observacions || '', abs_parc_c: assig.abs_parc_c, dta: assig.dta, dpa: assig.dpa, tipus_torn: assig.tipus_torn };
          });
          const cRef = shift?.circulations.find((cr: any) => (typeof cr === 'string' ? cr : cr.codi) === mc.id);
          const cCicle = typeof cRef === 'object' ? cRef.cicle : null;
          const cycleInfo = cCicle ? trainAssig?.find(ta => ta.cycle_id === cCicle) : null;
          const fullTurnEnriched = shift ? (await fetchFullTurnData([shift.id]))[0] : null;
          return { ...mc, shift_id: shift?.id || '---', drivers: drivers.length > 0 ? drivers : [{ nom: 'No assignat', cognoms: '', nomina: '---', phones: [] }], cicle: cCicle, train: cycleInfo?.train_number, fullTurn: fullTurnEnriched, realCodi: cRef?.codi === 'Viatger' ? mc.id : null };
        }));
        setResults([{ type: 'station_summary', station: selectedStation, circulations: enrichedMatching.sort((a, b) => getFgcMinutes(a.stopTimeAtStation) - getFgcMinutes(b.stopTimeAtStation)) }]);
      } else {
        let turnIds: string[] = [];
        switch (searchType) {
          case SearchType.Torn:
            let qt = supabase.from('shifts').select('id').ilike('id', `%${searchVal}%`);
            if (selectedServei !== 'Tots') qt = qt.eq('servei', selectedServei);
            const { data: s } = await qt;
            turnIds = s?.map(x => x.id as string) || [];
            break;
          case SearchType.Maquinista:
            const nominaMatch = searchVal.match(/\((\d+)\)$/);
            const filterVal = nominaMatch ? nominaMatch[1] : searchVal;
            const { data: m } = await supabase.from('daily_assignments').select('torn').or(`nom.ilike.%${filterVal}%,cognoms.ilike.%${filterVal}%,empleat_id.ilike.%${filterVal}%`);
            const shortTorns = Array.from(new Set(m?.map(x => x.torn?.trim()) || []));
            let qm = supabase.from('shifts').select('id');
            if (selectedServei !== 'Tots') qm = qm.eq('servei', selectedServei);
            const { data: matchingShifts } = await qm;
            turnIds = matchingShifts?.filter(shift => shortTorns.includes(getShortTornId(shift.id as string))).map(x => x.id as string) || [];
            break;
          case SearchType.Circulacio:
            let qc = supabase.from('shifts').select('id, circulations');
            if (selectedServei !== 'Tots') qc = qc.eq('servei', selectedServei);
            const { data: c } = await qc;
            turnIds = c?.filter(turn => (turn.circulations as any[])?.some((circ: any) => (typeof circ === 'string' ? circ : circ.codi)?.toLowerCase().includes(searchVal.toLowerCase()))).map(turn => turn.id as string) || [];
            break;
        }
        if (turnIds.length > 0) setResults(await fetchFullTurnData(turnIds)); else setResults([]);
      }
    } catch (error) { console.error("Error cercant dades:", error); } finally { setLoading(false); }
  };

  const handleSuggestionClick = (id: string) => { setQuery(id); setShowSuggestions(false); executeSearch(id); };
  const toggleItinerari = (id: string) => { setExpandedItinerari(expandedItinerari === id ? null : id); };

  const CirculationHeader = () => (
    <div className="hidden md:grid grid-cols-[1fr_1.2fr_1.8fr_1.8fr_1.2fr] items-center gap-4 px-4 py-3 border-b border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-black/40 sticky top-0 z-10">
      <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-2">Codi / Línia</div>
      <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center">Cicle / Unitat</div>
      <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center">Sortida (Estació i Via)</div>
      <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center">Arribada (Estació i Via)</div>
      <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right px-4">Estat / Detalls</div>
    </div>
  );

  const CirculationRow = ({ circ, itemKey }: { circ: any; itemKey: string }) => {
    const trainPhone = getTrainPhone(circ.train);
    const isActive = checkIfActive(circ.sortida, circ.arribada);
    const status = circ.train ? trainStatuses[circ.train] : null;
    const isBroken = status?.is_broken;
    const needsImages = status?.needs_images;
    const needsRecords = status?.needs_records;
    const needsCleaning = status?.needs_cleaning;
    const isViatger = circ.codi === 'Viatger';

    return (
      <div id={`circ-row-${itemKey}`} className={`p-2 sm:p-4 grid grid-cols-[auto_1fr_1fr_auto] md:grid-cols-[1fr_1.2fr_1.8fr_1.8fr_1.2fr] items-center gap-2 sm:gap-4 w-full relative transition-all scroll-mt-24 ${isActive ? 'bg-red-50/30 dark:bg-red-950/20' : isBroken ? 'bg-red-50/20 dark:bg-red-950/10 shadow-inner' : ''}`}>
        <div className="flex items-center gap-2 overflow-visible px-1">
            <div className={`px-2.5 py-1.5 ${isViatger ? 'bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800' : getLiniaColor(circ.linia)} rounded-lg font-black text-xs sm:text-sm shadow-sm flex items-center justify-center min-w-[62px]`}>
              {isViatger ? (
                <div className="flex flex-col items-center justify-center leading-none py-0.5">
                  <span className="text-[7.5px] font-black text-sky-600 dark:text-sky-400 tracking-tighter uppercase mb-0.5">VIATGER</span>
                  <span className="text-[11px] font-black text-sky-800 dark:text-sky-100">{circ.realCodi || '---'}</span>
                </div>
              ) : (
                <span className="text-white">{circ.codi}</span>
              )}
            </div>
            <span className={`hidden md:flex px-2 py-1 ${getLiniaColor(circ.linia)} text-white rounded-md font-black text-[9px] sm:text-[11px] shadow-sm flex-shrink-0`}>{circ.linia || '??'}</span>
            {circ.train && trainPhone && (
              <a href={`tel:${trainPhone}`} onClick={(e) => e.stopPropagation()} className={`md:hidden p-2 rounded-lg border shadow-sm transition-all active:scale-90 ${isBroken ? 'bg-red-600 text-white border-red-700' : 'bg-fgc-green/20 dark:bg-fgc-green/10 text-fgc-grey dark:text-fgc-green border-fgc-green/30 dark:border-fgc-green/20'}`}>
                <Phone size={14} />
              </a>
            )}
        </div>
        <div className="hidden md:flex justify-center">
            {circ.cicle ? (
              <div className={`text-[10px] sm:text-sm font-black px-3 py-1.5 rounded-lg border shadow-sm flex items-center justify-center gap-2 transition-all w-full max-w-[150px] ${isBroken ? 'bg-red-600 text-white border-red-700 animate-pulse' : isViatger ? 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800' : 'text-black dark:text-gray-200 bg-fgc-green/20 dark:bg-fgc-green/10 border-fgc-green/30 dark:border-fgc-green/20'}`}>
                <div className="flex flex-col items-center">
                  {isViatger && <span className="text-[7px] opacity-60 leading-none mb-0.5 uppercase">Cicle Viatger</span>}
                  <span className="shrink-0">{circ.cicle}</span>
                </div>
                {circ.train && (
                  <div className={`flex items-center gap-1.5 pl-2 border-l ${isBroken ? 'border-white/30' : isViatger ? 'border-sky-200 dark:border-sky-800' : 'border-fgc-green/40 dark:border-fgc-green/20'}`}>
                    <a href={trainPhone ? `tel:${trainPhone}` : '#'} className={`${isBroken ? 'text-white' : isViatger ? 'text-sky-600 dark:text-sky-400' : 'text-fgc-grey dark:text-gray-300'} hover:text-blue-700 transition-colors flex items-center gap-1 ${!trainPhone && 'pointer-events-none'}`}>
                      <Phone size={10} className="opacity-50" />
                      <span className="text-[10px] sm:text-xs">{circ.train}</span>
                    </a>
                  </div>
                )}
              </div>
            ) : (<span className="text-[10px] text-gray-300 dark:text-gray-600 font-bold uppercase tracking-widest italic opacity-40">Sense assignar</span>)}
        </div>
        <div className="flex items-center gap-2 sm:gap-4 justify-center min-w-0">
            <div className={`text-base sm:text-2xl font-black tabular-nums w-14 sm:w-16 text-center ${isActive || isBroken ? 'text-red-600' : 'text-fgc-grey dark:text-gray-200'}`}>{circ.sortida || '--:--'}</div>
            <div className="bg-fgc-green/20 dark:bg-fgc-green/10 text-fgc-grey dark:text-fgc-green border border-fgc-green/30 dark:border-fgc-green/20 px-2 py-0.5 rounded text-[10px] font-black shadow-sm shrink-0">V{circ.via_inici || '?'}</div>
            <span className="text-[10px] sm:text-xs font-bold text-gray-400 dark:text-gray-500 truncate max-w-[100px] hidden md:block">{circ.machinistInici || circ.inici || '---'}</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 justify-center min-w-0">
            <span className="text-[10px] sm:text-xs font-bold text-gray-400 dark:text-gray-500 truncate max-w-[100px] text-right hidden md:block">{circ.machinistFinal || circ.final || '---'}</span>
            <div className="bg-fgc-grey/10 dark:bg-white/5 text-fgc-grey dark:text-gray-400 border border-gray-200 dark:border-white/10 px-2 py-0.5 rounded text-[10px] font-black shadow-sm shrink-0">V{circ.via_final || '?'}</div>
            <div className={`text-base sm:text-2xl font-black tabular-nums w-14 sm:w-16 text-center ${isActive || isBroken ? 'text-red-600' : 'text-fgc-grey dark:text-gray-200'}`}>{circ.arribada || '--:--'}</div>
        </div>
        <div className="flex justify-end items-center gap-2 sm:gap-3 px-1 sm:px-4">
          {needsImages && <Camera size={16} className="text-blue-500 animate-pulse drop-shadow-sm" />}
          {needsRecords && <FileText size={16} className="text-yellow-500 animate-pulse drop-shadow-sm" />}
          {needsCleaning && <Brush size={16} className="text-orange-500 animate-pulse drop-shadow-sm" />}
          {isBroken && <AlertTriangle size={16} className="text-red-600 animate-pulse drop-shadow-sm" />}
          {isActive && <span className="hidden xl:inline text-[9px] font-black text-red-500 animate-pulse bg-red-50 dark:bg-red-950/40 px-2.5 py-1 rounded-full border border-red-100 dark:border-red-900 shadow-sm">ACTIU</span>}
          <button onClick={() => toggleItinerari(itemKey)} className={`p-2 sm:p-3 rounded-xl shadow-md hover:shadow-xl transition-all active:scale-95 border-b-2 border-black/5 flex items-center gap-2 shrink-0 ${isActive ? 'bg-red-600 text-white border-red-700' : isBroken ? 'bg-red-600 text-white border-red-700' : 'bg-fgc-green text-fgc-grey border-fgc-green'}`}>
            < BookOpen size={16} /><span className="hidden lg:inline text-[10px] font-black uppercase tracking-tighter">Itinerari</span>
          </button>
        </div>
      </div>
    );
  };

  const StationRow = ({ circ, itemKey }: { circ: any; itemKey: string }) => {
    const trainPhone = getTrainPhone(circ.train);
    const isActive = checkIfActive(circ.sortida, circ.arribada);
    const status = circ.train ? trainStatuses[circ.train] : null;
    const isBroken = status?.is_broken;
    const needsImages = status?.needs_images;
    const needsRecords = status?.needs_records;
    const needsCleaning = status?.needs_cleaning;
    const shiftStatus = circ.fullTurn ? getShiftCurrentStatus(circ.fullTurn, 0) : null;
    const isViatger = circ.id === 'Viatger';

    return (
      <div id={`station-row-${itemKey}`} className={`p-2 sm:p-4 grid grid-cols-[auto_1fr_auto_auto] md:grid-cols-[1fr_1.2fr_1.8fr_1fr_1.2fr] items-center gap-2 sm:gap-4 w-full relative transition-all scroll-mt-24 ${isActive ? 'bg-red-50/40 dark:bg-red-950/20 shadow-inner' : isBroken ? 'bg-red-50/20 dark:bg-red-950/10' : ''}`}>
        <div className="flex justify-start items-center gap-2 shrink-0 px-1">
          <div className={`px-2.5 py-1.5 ${isViatger ? 'bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800' : getLiniaColor(circ.linia)} rounded-lg font-black text-xs sm:text-sm shadow-sm flex items-center justify-center min-w-[62px]`}>
            {isViatger ? (
              <div className="flex flex-col items-center justify-center leading-none py-0.5">
                <span className="text-[7.5px] font-black text-sky-600 dark:text-sky-400 tracking-tighter uppercase mb-0.5">VIATGER</span>
                <span className="text-[11px] font-black text-sky-800 dark:text-sky-100">{circ.realCodi || '---'}</span>
              </div>
            ) : (
              <span className="text-white">{circ.id}</span>
            )}
          </div>
          <span className={`hidden md:flex px-2 py-1 ${getLiniaColor(circ.linia)} text-white rounded-md font-black text-[9px] sm:text-[11px] shadow-sm`}>{circ.linia || '??'}</span>
          {circ.train && trainPhone && (
            <a href={`tel:${trainPhone}`} onClick={(e) => e.stopPropagation()} className={`md:hidden p-2 rounded-lg border shadow-sm transition-all active:scale-90 ${isBroken ? 'bg-red-600 text-white border-red-700' : 'bg-fgc-green/20 dark:bg-fgc-green/10 text-fgc-grey dark:text-fgc-green border-fgc-green/30 dark:border-fgc-green/20'}`}>
              <Phone size={14} />
            </a>
          )}
        </div>
        <div className="hidden md:flex justify-center shrink-0">
          {circ.cicle ? (
            <div className={`text-[10px] sm:text-sm font-black px-3 py-1.5 rounded-lg border shadow-sm flex items-center gap-2 w-full max-w-[140px] ${isBroken ? 'bg-red-600 text-white border-red-700 animate-pulse' : isViatger ? 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800' : 'text-black dark:text-gray-200 bg-fgc-green/20 dark:bg-fgc-green/10 border-fgc-green/30 dark:border-fgc-green/20'}`}>
              <div className="flex flex-col items-center">
                {isViatger && <span className="text-[7px] opacity-60 leading-none mb-0.5 uppercase">Cicle Viatger</span>}
                <span>{circ.cicle}</span>
              </div>
              {circ.train && (
                <div className={`flex items-center gap-1.5 ml-1 pl-1.5 border-l ${isBroken ? 'border-white/30' : isViatger ? 'border-sky-200 dark:border-sky-800' : 'border-fgc-green/40 dark:border-fgc-green/20'}`}>
                  <a href={trainPhone ? `tel:${trainPhone}` : '#'} className={`${isBroken ? 'text-white' : isViatger ? 'text-sky-600 dark:text-sky-400' : 'text-fgc-grey dark:text-gray-300'} hover:text-blue-700 transition-colors flex items-center`}>
                    <Phone size={8} className="opacity-50" />
                    <span className="text-[10px] ml-0.5">{circ.train}</span>
                  </a>
                </div>
              )}
            </div>
          ) : (<span className="text-[10px] text-gray-300 dark:text-gray-600 font-bold uppercase tracking-widest italic opacity-40">Sense assignar</span>)}
        </div>
        <div className="flex flex-col items-start px-2 min-w-0 gap-2">
          {circ.drivers.map((driver: any, dIdx: number) => (
            <div key={dIdx} className="flex items-center gap-2">
                <span className={`text-sm sm:text-lg font-black leading-tight truncate w-full ${isActive ? 'text-red-700 dark:text-red-400' : isBroken ? 'text-red-600' : 'text-fgc-grey dark:text-gray-200'}`}>
                  {driver.cognoms || ''}, {driver.nom || ''}
                </span>
                {driver.tipus_torn && (
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border shrink-0 ${
                    driver.tipus_torn === 'Reducció' 
                      ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800' 
                      : 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
                  }`}>
                    {driver.tipus_torn === 'Reducció' ? 'REDUCCIÓ' : 'TORN'}
                  </span>
                )}
              </div>
          ))}
        </div>
        <div className="flex justify-center shrink-0">
          <div className={`px-4 py-2 rounded-xl border transition-all tabular-nums ${isActive ? 'bg-red-600 text-white border-red-700 animate-pulse shadow-md scale-105' : isBroken ? 'bg-red-600 text-white border-red-700 shadow-sm' : 'bg-fgc-green/10 dark:bg-fgc-green/5 border-fgc-green/20 dark:border-fgc-green/10'}`}>
            <span className={`text-base sm:text-2xl font-black ${isActive || isBroken ? 'text-white' : 'text-fgc-grey dark:text-gray-200'}`}>{circ.stopTimeAtStation || '--:--'}</span>
          </div>
        </div>
        <div className="flex justify-end pr-1 sm:pr-4 items-center gap-2 shrink-0">
          {needsImages && <Camera size={14} className="text-blue-500 animate-pulse" />}
          {needsRecords && <FileText size={14} className="text-yellow-500 animate-pulse" />}
          {needsCleaning && <Brush size={14} className="text-orange-500 animate-pulse" />}
          {isBroken && <AlertTriangle size={14} className="text-red-600 animate-pulse" />}
          <button onClick={() => toggleItinerari(itemKey)} className={`p-2 sm:p-3 rounded-xl shadow-md hover:shadow-xl transition-all active:scale-95 border-b-2 border-black/5 flex items-center gap-2 ${isActive || isBroken ? 'bg-red-600 text-white border-red-700' : 'bg-fgc-green text-fgc-grey'}`}>
            <BookOpen size={16} /><span className="hidden lg:inline text-[10px] font-black uppercase tracking-tighter">Itinerari</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div><h1 className="text-2xl sm:text-3xl font-black text-fgc-grey dark:text-white tracking-tight">Cerca de Servei</h1><p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 font-medium">Informació de torns, circulacions i unitats de tren.</p></div>
        <div className="flex flex-col gap-2"><span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">Filtre de Servei</span><div className="inline-flex bg-white dark:bg-gray-900 p-1 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">{['Tots', ...serveiTypes].map(s => (<button key={s} onClick={() => setSelectedServei(s)} className={`px-3 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-black transition-all ${selectedServei === s ? 'bg-fgc-grey dark:bg-fgc-green dark:text-fgc-grey text-white shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'}`}>{s === 'Tots' ? 'Tots' : `S-${s}`}</button>))}</div></div>
      </header>

      <div className="bg-white dark:bg-gray-900 rounded-[32px] sm:rounded-[40px] p-6 sm:p-8 shadow-sm border border-gray-100 dark:border-white/5">
        <div className="flex flex-wrap gap-2 sm:gap-3 mb-6 sm:mb-8">{filterButtons.map((btn) => (<button key={btn.id} onClick={() => { setSearchType(btn.id); setResults([]); setQuery(''); setSuggestions([]); setShowSuggestions(false); }} className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-black transition-all ${searchType === btn.id ? 'bg-fgc-green text-fgc-grey shadow-xl shadow-fgc-green/20' : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/10'}`}>{btn.icon}{btn.label}</button>))}</div>
        
        {searchType === SearchType.Estacio ? (
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-end gap-6">
              <div className="flex-1 space-y-2"><label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-4">Selecciona Estació</label><div className="relative"><MapPin className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={24} /><select value={selectedStation} onChange={(e) => setSelectedStation(e.target.value)} className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[24px] sm:rounded-[32px] py-4 sm:py-6 pl-16 pr-8 focus:ring-4 focus:ring-fgc-green/20 outline-none text-lg sm:text-2xl font-bold appearance-none cursor-pointer dark:text-white"><option value="" className="dark:bg-gray-900">Tria una estació...</option>{allStations.map(st => <option key={st} value={st} className="dark:bg-gray-900">{st}</option>)}</select><ChevronDown className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" size={24} /></div></div>
              <div className="flex-1 flex flex-row gap-4 items-end">
                <div className="flex-1 space-y-2 relative"><label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-4 flex items-center gap-2">De les<button onClick={() => setStartTime(getCurrentTimeStr())} className="text-fgc-green"><Clock size={12} /></button></label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[24px] sm:rounded-[32px] py-4 sm:py-6 px-6 focus:ring-4 focus:ring-fgc-green/20 outline-none text-lg sm:text-2xl font-bold dark:text-white" /></div>
                <div className="flex-1 space-y-2 relative"><label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-4 flex items-center gap-2">A les<button onClick={() => setEndTime(getCurrentTimeStr())} className="text-fgc-green"><Clock size={12} /></button></label><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[24px] sm:rounded-[32px] py-4 sm:py-6 px-6 focus:ring-4 focus:ring-fgc-green/20 outline-none text-lg sm:text-2xl font-bold dark:text-white" /></div>
              </div>
              <button onClick={() => executeSearch()} className="bg-fgc-green text-fgc-grey h-[60px] sm:h-[76px] px-8 sm:px-12 rounded-[24px] sm:rounded-[32px] text-lg sm:text-xl font-black shadow-xl shadow-fgc-green/20 hover:scale-105 active:scale-95 flex items-center justify-center gap-3 shrink-0"><Search size={22} />CERCAR</button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-4" ref={suggestionsRef}>
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">{loading ? <Loader2 className="animate-spin" size={24} /> : <Search size={24} />}</div>
                <input type="text" placeholder={`Cerca per ${searchType.toUpperCase()}...`} className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[24px] sm:rounded-[32px] py-4 sm:py-6 pl-14 sm:pl-16 pr-6 sm:pr-8 focus:ring-4 focus:ring-fgc-green/20 outline-none text-lg sm:text-2xl font-bold placeholder:text-gray-300 dark:text-white dark:placeholder:text-gray-600" value={query} onChange={(e) => handleInputChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && executeSearch()} onFocus={() => query.length >= 1 && setShowSuggestions(true)} />
                {showSuggestions && suggestions.length > 0 && (<div className="absolute top-full left-2 right-2 mt-2 bg-white dark:bg-gray-800 rounded-[24px] shadow-2xl border border-gray-100 dark:border-white/10 z-[200] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">{suggestions.map((id, sIdx) => (<button key={sIdx} onClick={() => handleSuggestionClick(id)} className="w-full text-left px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-xl font-bold text-fgc-grey dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-fgc-green transition-colors flex items-center justify-between group"><span>{id}</span><ArrowRight size={18} className="opacity-0 group-hover:opacity-100 transition-all scale-110" /></button>))}</div>)}
              </div>
              <button onClick={() => executeSearch()} className="bg-fgc-green text-fgc-grey h-[60px] sm:h-[76px] px-8 sm:px-10 rounded-[24px] sm:rounded-[32px] text-lg sm:text-xl font-black shadow-xl shadow-fgc-green/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3"><Search size={22} />CERCAR</button>
            </div>

            {searchType === SearchType.Cicle && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-500">
                <div className="flex items-center gap-2 mb-4 px-2">
                  <LayoutGrid size={16} className="text-fgc-green" />
                  <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Selecció ràpida de Cicle (S-{selectedServei})</h3>
                </div>
                <div className="bg-gray-50/50 dark:bg-black/20 p-4 sm:p-6 rounded-[28px] border border-gray-100 dark:border-white/5">
                  {loading ? (
                    <div className="py-10 flex flex-col items-center justify-center gap-3 opacity-30">
                      <Loader2 size={32} className="animate-spin" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Carregant cicles...</p>
                    </div>
                  ) : availableCycles.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar p-1">
                      {availableCycles.map((c) => (
                        <button
                          key={c}
                          onClick={() => { setQuery(c); executeSearch(c); }}
                          className={`py-3 px-2 rounded-xl text-sm font-black border transition-all ${
                            query === c 
                            ? 'bg-fgc-green text-fgc-grey border-fgc-green shadow-lg scale-105' 
                            : 'bg-white dark:bg-gray-800 text-fgc-grey dark:text-gray-200 border-gray-100 dark:border-white/5 hover:border-fgc-green hover:shadow-md hover:scale-105 active:scale-95'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="py-10 text-center opacity-30">
                      <p className="text-xs font-bold italic">No hi ha cicles disponibles per aquest servei.</p>
                    </div>
                  )}
                </div>
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
                <div key={idx} className="bg-white dark:bg-gray-900 p-4 sm:p-10 rounded-[40px] sm:rounded-[56px] border border-gray-100 dark:border-white/5 shadow-sm animate-in fade-in slide-in-from-bottom-12 duration-700">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-8 mb-6 sm:mb-12">
                    <div className="flex items-center gap-4 sm:gap-6">
                      <div className={`min-w-[3.5rem] min-h-[3.5rem] sm:min-w-[5rem] sm:min-h-[5rem] px-2 ${isStationGroup ? 'bg-fgc-green text-fgc-grey' : 'bg-fgc-grey dark:bg-black text-white'} rounded-2xl sm:rounded-[28px] flex items-center justify-center text-base sm:text-2xl font-black shadow-lg`}><span className="truncate">{isStationGroup ? <MapPin size={28} /> : group.cycle_id}</span></div>
                      <div className="min-w-0">
                        <h2 className="text-lg sm:text-3xl font-black text-fgc-grey dark:text-white tracking-tighter uppercase truncate">{isStationGroup ? `Circulacions a ${group.station}` : 'Cronograma de Cicle'}</h2>
                        <div className="flex items-center gap-2 mt-0.5 sm:mt-1">{isStationGroup ? <Clock size={14} className="text-fgc-green" /> : <Train size={14} className="text-fgc-green" />}<p className="text-sm sm:text-lg font-bold text-gray-500 dark:text-gray-400">{isStationGroup ? `Franja: ${startTime} - ${endTime}` : `Unitat: ${group.train}`}</p></div>
                      </div>
                    </div>
                  </div>
                  <div className="border border-gray-100 dark:border-white/5 rounded-[32px] overflow-hidden bg-white dark:bg-black/20 shadow-sm">
                    <CirculationHeader />
                    <div className="grid grid-cols-1 divide-y divide-gray-100 dark:divide-white/5">
                      {group.circulations.map((circ: any, cIdx: number) => {
                        const itemKey = `${idx}-${cIdx}`; 
                        const isActive = checkIfActive((circ.sortida || circ.stopTimeAtStation) as string, (circ.arribada || circ.stopTimeAtStation) as string);
                        const itineraryPoints = [{ nom: circ.inici, hora: circ.sortida, via: circ.via_inici }, ...(circ.estacions?.map((st: any) => ({ nom: st.nom, hora: st.hora || st.sortida || st.arribada, via: st.via })) || []), { nom: circ.final, hora: circ.arribada, via: circ.via_final }];
                        return (
                          <div key={cIdx} className={`flex flex-col transition-all hover:bg-gray-50/50 dark:hover:bg-white/5 relative ${isActive ? 'ring-2 ring-inset ring-red-600 z-10' : ''}`}>
                            <div className="w-full">
                              {isStationGroup ? <StationRow circ={circ} itemKey={itemKey} /> : <CirculationRow circ={circ} itemKey={itemKey} />}
                              {expandedItinerari === itemKey && (
                                <div className="p-4 sm:p-10 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-white/5 animate-in slide-in-from-top-4 duration-500 overflow-hidden">
                                  <div className="relative flex flex-col pl-8 sm:pl-16 pr-2 sm:pr-6 py-4 space-y-0">
                                    <div className="absolute left-[15px] sm:left-[29px] top-10 bottom-10 w-0.5 sm:w-1 bg-gray-100 dark:bg-gray-800 rounded-full" />
                                    {itineraryPoints.map((point, pIdx) => (<ItineraryPoint key={pIdx} point={point} isFirst={pIdx === 0} isLast={pIdx === itineraryPoints.length - 1} nextPoint={itineraryPoints[pIdx + 1]} nowMin={nowMin}/>))}
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
            const currentStatus = getShiftCurrentStatus(group, idx);
            return (
              <div key={idx} className="flex flex-col gap-1 group animate-in fade-in slide-in-from-bottom-12 duration-700">
                <div className="bg-white dark:bg-gray-900 p-6 sm:p-10 rounded-t-[32px] sm:rounded-t-[48px] border-x border-t border-gray-100 dark:border-white/5 shadow-sm">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 flex-1">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                          <h2 className="text-xl sm:text-3xl font-black text-fgc-grey dark:text-white tracking-tighter uppercase leading-tight">Torn {group.id}</h2>
                          {group.drivers.length > 1 && (
                            <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase flex items-center gap-1"><Users size={10} /> Compartit ({group.drivers.length})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                           <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-white/5 text-gray-500 rounded-lg text-[10px] font-black uppercase border border-gray-200/50"><Timer size={12} /> {group.duracio}</div>
                           <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-white/5 text-gray-500 rounded-lg text-[10px] font-black uppercase border border-gray-200/50"><MapPin size={12} /> {group.dependencia}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 text-base sm:text-xl font-black text-fgc-green bg-fgc-green/5 px-4 py-2 rounded-xl border border-fgc-green/10 whitespace-nowrap">
                        <Clock size={20} /><span>{group.inici_torn}</span><span className="opacity-30 mx-1">—</span><span>{group.final_torn}</span>
                      </div>
                      <button 
                        onClick={() => scrollToElement(currentStatus.targetId)} 
                        className={`px-5 py-2.5 rounded-2xl text-[10px] sm:text-xs font-black shadow-md border-b-4 border-black/10 transition-all ${currentStatus.color}`}
                      >
                        {currentStatus.label}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="bg-fgc-green divide-y divide-white/20 border-x border-fgc-green/20 shadow-sm overflow-hidden">
                  {group.drivers.map((driver: any, dIdx: number) => {
                    const isWorking = group.drivers.length > 1 && isDriverWorkingNow(driver.observacions);
                    return (
                      <div key={dIdx} className="p-6 sm:p-10 transition-colors hover:bg-white/5 relative">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 sm:gap-10">
                          <div className="flex items-center gap-6 sm:gap-8 w-full md:w-auto">
                            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white/40 dark:bg-black/20 rounded-full flex items-center justify-center text-fgc-grey border-2 border-white/60 shrink-0">
                              {group.drivers.length > 1 ? <span className="font-black text-lg">{dIdx + 1}</span> : <User size={28} strokeWidth={2.5} />}
                            </div>
                            <div className="space-y-1 min-w-0 flex-1 md:flex-none">
                              <div className="flex items-center gap-3">
                                <h3 className="text-xl sm:text-2xl font-black text-fgc-grey tracking-tight leading-tight uppercase truncate">{driver.cognoms}, {driver.nom}</h3>
                                {driver.tipus_torn && (
                                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase shadow-sm border ${
                                    driver.tipus_torn === 'Reducció' 
                                      ? 'bg-purple-600 text-white border-purple-700' 
                                      : 'bg-blue-600 text-white border-blue-700'
                                  }`}>
                                    {driver.tipus_torn}
                                  </span>
                                )}
                                {isWorking && (
                                  <div className="bg-fgc-grey text-white px-3 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-1.5 shadow-sm animate-bounce">
                                    <div className="w-1.5 h-1.5 bg-fgc-green rounded-full animate-pulse" />
                                    TREBALLANT
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2 items-center"><div className="inline-flex items-center bg-fgc-grey text-white px-2.5 py-0.5 rounded-lg font-black text-[9px] sm:text-[10px] tracking-widest uppercase">Nómina: {driver.nomina}</div>{driver.abs_parc_c === 'S' && <span className="bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded">ABS</span>}{driver.dta === 'S' && <span className="bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded">DTA</span>}{driver.dpa === 'S' && <span className="bg-purple-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded">DPA</span>}</div>
                              {driver.observacions && (<div className="flex items-start gap-2 bg-black/10 dark:bg-black/20 px-3 py-2 rounded-xl border border-black/5 max-w-lg mt-2"><Info size={14} className="text-fgc-grey dark:text-gray-300 mt-0.5 shrink-0" /><p className="text-[11px] sm:text-xs font-bold text-fgc-grey dark:text-gray-200 leading-snug italic">{driver.observacions}</p></div>)}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:gap-3 w-full md:w-auto">{driver.phones?.map((p: string, i: number) => (
                            <a key={i} href={`tel:${p}`} className="flex-1 md:flex-none flex items-center justify-center gap-2.5 bg-fgc-grey text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-black hover:bg-fgc-dark transition-all active:scale-95"><Phone size={14} />{p}</a>
                          ))}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="bg-white dark:bg-gray-900 p-4 sm:p-10 rounded-b-[32px] sm:rounded-b-[48px] border-x border-b border-gray-100 dark:border-white/5 shadow-sm overflow-hidden">
                  <ShiftTimeline turn={group} />
                  <div className="border border-gray-100 dark:border-white/5 rounded-[32px] overflow-hidden bg-white dark:bg-black/20 shadow-sm mb-4">
                    <CirculationHeader />
                    <div className="flex flex-col divide-y divide-gray-100 dark:divide-white/5">
                      {group.fullCirculations?.[0] && (
                        <TimeGapRow 
                          from={group.inici_torn} 
                          to={group.fullCirculations[0].sortida} 
                          id={`gap-pre-${idx}`}
                        />
                      )}
                      
                      {group.fullCirculations?.map((circ: any, cIdx: number) => {
                        const shiftItemKey = `${idx}-${cIdx}`; 
                        const isActive = checkIfActive(circ.sortida as string, circ.arribada as string);
                        const itineraryPoints = [{ nom: circ.inici, hora: circ.sortida, via: circ.via_inici }, ...(circ.estacions?.map((st: any) => ({ nom: st.nom, hora: st.hora || st.sortida || st.arribada, via: st.via })) || []), { nom: circ.final, hora: circ.arribada, via: circ.via_final }];
                        const nextCirc = group.fullCirculations?.[cIdx + 1];
                        
                        return (
                          <React.Fragment key={cIdx}>
                            <div id={`circ-row-${shiftItemKey}`} className={`flex flex-col relative scroll-mt-24 ${isActive ? 'ring-2 ring-inset ring-red-600 z-10' : ''}`}>
                              <CirculationRow circ={circ} itemKey={shiftItemKey} />
                              {expandedItinerari === shiftItemKey && (
                                <div className="p-4 sm:p-10 bg-white dark:bg-gray-900 border-t border-gray-100 animate-in slide-in-from-top-4 duration-500 overflow-hidden">
                                  <div className="relative flex flex-col pl-8 sm:pl-16 pr-2 sm:pr-6 py-4 space-y-0">
                                    <div className="absolute left-[15px] sm:left-[29px] top-10 bottom-10 w-0.5 sm:w-1 bg-gray-100 dark:bg-gray-800 rounded-full" />
                                    {itineraryPoints.map((point, pIdx) => (<ItineraryPoint key={pIdx} point={point} isFirst={pIdx === 0} isLast={pIdx === itineraryPoints.length - 1} nextPoint={itineraryPoints[pIdx + 1]} nowMin={nowMin}/>))}
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            <TimeGapRow 
                              from={circ.arribada} 
                              to={nextCirc ? nextCirc.sortida : group.final_torn} 
                              id={`gap-row-${idx}-${cIdx}`}
                            />
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : !loading && (query.length >= 1 || (searchType === SearchType.Estacio && selectedStation)) ? (
          <div className="bg-white dark:bg-gray-900 rounded-[32px] py-20 text-center text-gray-400 flex flex-col items-center gap-6"><div className="w-24 h-24 bg-gray-50 dark:bg-black/20 rounded-full flex items-center justify-center text-gray-100"><Search size={48} /></div><div className="space-y-2"><p className="text-xl font-black text-fgc-grey uppercase">No s'han trobat dades</p><p className="text-sm font-medium">Revisa els paràmetres de cerca.</p></div></div>
        ) : !loading && (
          <div className="text-center py-24 opacity-10 flex flex-col items-center"><Train size={80} className="text-fgc-grey mb-8" /><p className="text-lg font-black uppercase tracking-[0.4em] text-fgc-grey">Consulta de Torns Activa</p></div>
        )}
      </div>
    </div>
  );
};

export default CercarView;