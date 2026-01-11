import React, { useState, useEffect, useRef } from 'react';
import { SearchType } from '../types.ts';
import { Search, User, Train, MapPin, Hash, ArrowRight, Loader2, Info, Phone, Clock, FileText, ChevronDown, LayoutGrid, Timer, X, BookOpen, AlertTriangle, Users, Camera, Brush, Save, Check } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';

// Importación de utilidades y componentes extraídos
import { getFgcMinutes, checkIfActive, calculateGap } from '../utils/time';
import { fetchAllFromSupabase } from '../utils/supabase';
import { getStatusColor, getLiniaColor, getShortTornId, getTrainPhone, ALL_STATIONS } from '../utils/fgc';
import { fetchFullTurns } from '../utils/queries';
import { ItineraryPoint } from '../components/ItineraryPoint';
import { ShiftTimeline } from '../components/ShiftTimeline';
import { TimeGapRow } from '../components/TimeGapRow';
import { CirculationHeader } from '../components/CirculationHeader';
import { CirculationRow } from '../components/CirculationRow';
import { StationRow } from '../components/StationRow';

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

  // Estat per al nou menú de gestió d'unitat
  const [editingCirc, setEditingCirc] = useState<{ circ: any, cycleId: string } | null>(null);
  const [editUnitNumber, setEditUnitNumber] = useState('');
  const [isSavingUnit, setIsSavingUnit] = useState(false);
  const [tempStatus, setTempStatus] = useState({ is_broken: false, needs_images: false, needs_records: false, needs_cleaning: false });

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
      .select('*');

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
        setAllStations(ALL_STATIONS);
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

  const openUnitMenu = (circ: any, cycleId: string) => {
    if (!cycleId) return;
    const currentTrain = circ.train || '';
    setEditUnitNumber(currentTrain);
    const status = trainStatuses[currentTrain] || { is_broken: false, needs_images: false, needs_records: false, needs_cleaning: false };
    setTempStatus({
      is_broken: status.is_broken || false,
      needs_images: status.needs_images || false,
      needs_records: status.needs_records || false,
      needs_cleaning: status.needs_cleaning || false
    });
    setEditingCirc({ circ, cycleId });
  };

  const saveUnitChanges = async () => {
    if (!editingCirc) return;
    setIsSavingUnit(true);
    try {
      const trainNum = editUnitNumber.trim();
      if (trainNum) {
        await supabase.from('assignments').upsert({
          cycle_id: editingCirc.cycleId,
          train_number: trainNum
        });
        await supabase.from('train_status').upsert({
          train_number: trainNum,
          ...tempStatus,
          updated_at: new Date().toISOString()
        }, { onConflict: 'train_number' });
      }
      await fetchTrainStatuses();
      executeSearch();
      setEditingCirc(null);
    } catch (e) {
      console.error("Error desant canvis d'unitat:", e);
    } finally {
      setIsSavingUnit(false);
    }
  };

  const filterButtons = [
    { id: SearchType.Torn, label: 'Torn', icon: <Hash size={16} /> },
    { id: SearchType.Maquinista, label: 'Maquinista', icon: <User size={16} /> },
    { id: SearchType.Circulacio, label: 'Circulació', icon: <Train size={16} /> },
    { id: SearchType.Estacio, label: 'Estació', icon: <MapPin size={16} /> },
    { id: SearchType.Cicle, label: 'Cicle', icon: <Hash size={16} /> },
  ];

  const serveiTypes = ['0', '100', '400', '500'];

  const getShiftCurrentStatus = (turn: any, shiftIdx: number) => {
    const start = getFgcMinutes(turn.inici_torn);
    const end = getFgcMinutes(turn.final_torn);

    if (nowMin < start) return { label: 'No ha iniciat', color: 'bg-gray-200 dark:bg-gray-800 text-gray-500', targetId: null };
    if (nowMin >= end) return { label: 'Finalitzat', color: 'bg-fgc-grey dark:bg-black text-white', targetId: null };

    const circs = turn.fullCirculations || [];
    for (let i = 0; i < circs.length; i++) {
      if (checkIfActive(circs[i].sortida, circs[i].arribada, nowMin)) {
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
      const nextStart = circs[i + 1] ? getFgcMinutes(circs[i + 1].sortida) : end;
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

  const handleSuggestionClick = (id: string) => { setQuery(id); setShowSuggestions(false); executeSearch(id); };
  const toggleItinerari = (id: string) => { setExpandedItinerari(expandedItinerari === id ? null : id); };

  // Helper local para usar la utilidad optimizada
  const fetchFullTurnData = async (turnIds: string[]) => {
    return fetchFullTurns(turnIds, selectedServei === 'Tots' ? undefined : selectedServei);
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
      const { data } = await supabase.from('daily_assignments').select('nom, cognoms, empleat_id').or(`nom.ilike.%${val}%,cognoms.ilike.%${val}%,empleat_id.ilike.%${val}%`).limit(8);
      if (data) { const unique = Array.from(new Set((data as any[]).map(d => `${d.cognoms || ''}, ${d.nom || ''} (${d.empleat_id})`))) as string[]; setSuggestions(unique); setShowSuggestions(true); }
    } else if (searchType === SearchType.Circulacio) {
      const { data } = await supabase.from('circulations').select('id').ilike('id', `%${val}%`).limit(8);
      if (data) { setSuggestions((data as any[]).map(item => item.id as string)); setShowSuggestions(true); }
    } else if (searchType === SearchType.Cicle) {
      const filtered = availableCycles.filter(c => c.toLowerCase().includes(val.toLowerCase())).slice(0, 12);
      setSuggestions(filtered); setShowSuggestions(true);
    }
  };

  const executeSearch = async (overrideQuery?: string) => {
    let searchVal = overrideQuery || query;
    if (!searchVal && searchType !== SearchType.Cicle && searchType !== SearchType.Estacio) { setResults([]); return; }
    setLoading(true); setShowSuggestions(false);
    try {
      if (searchType === SearchType.Cicle) {
        let q = supabase.from('shifts').select('*');
        if (selectedServei !== 'Tots') q = q.eq('servei', selectedServei);
        const [allShifts, cycleAssigRes] = await Promise.all([
          fetchAllFromSupabase('shifts', q),
          supabase.from('assignments').select('*').eq('cycle_id', searchVal).single()
        ]);
        if (allShifts) {
          const flattenedCircs: any[] = [];
          const allCodiSet = new Set<string>();
          allShifts.forEach(shift => {
            (shift.circulations as any[])?.forEach(c => {
              const codi = typeof c === 'string' ? c : c.codi;
              if (c.cicle === searchVal) {
                flattenedCircs.push({ ...c, shift_id: shift.id, codi });
                if (codi && codi !== 'Viatger') allCodiSet.add(codi as string);
              }
            });
          });
          const details = await fetchAllFromSupabase('circulations', supabase.from('circulations').select('*').in('id', Array.from(allCodiSet)));
          const enrichedCircs = flattenedCircs.map(fc => { const detail = details?.find(d => d.id === fc.codi); return { ...detail, ...fc }; });
          enrichedCircs.sort((a, b) => getFgcMinutes(a.sortida || '00:00') - getFgcMinutes(b.sortida || '00:00'));
          setResults([{ type: 'cycle_summary', cycle_id: searchVal, train: cycleAssigRes.data?.train_number || 'S/A', circulations: enrichedCircs }]);
        }
      } else if (searchType === SearchType.Estacio) {
        if (!selectedStation) { setLoading(false); return; }
        const targetStation = selectedStation.trim().toUpperCase();

        // Optimizació: Filtrar circulacions per estació directament en la base de dades
        const { data: matchedCircs } = await supabase.from('circulations')
          .select('*')
          .or(`inici.ilike.${targetStation},final.ilike.${targetStation},estacions.cs.[{"nom":"${selectedStation}"}]`);

        if (!matchedCircs || matchedCircs.length === 0) { setResults([]); return; }

        const startMinRange = getFgcMinutes(startTime);
        const endMinRange = getFgcMinutes(endTime);
        const matchingCircs: any[] = [];

        matchedCircs.forEach(c => {
          let stopTime: string | null = null;
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

        if (matchingCircs.length === 0) { setResults([]); return; }

        // Trobar els shifts que contenen aquestes circulacions
        const circIds = matchingCircs.map(mc => mc.id);
        let qShifts = supabase.from('shifts').select('*');
        if (selectedServei !== 'Tots') qShifts = qShifts.eq('servei', selectedServei);

        // Com que les circulacions estan en un JSONB array, les busquem per servei i filtrem en JS (és molt més ràpid si el servei està filtrat)
        const allShifts = await fetchAllFromSupabase('shifts', qShifts);
        const matchedShiftIds = new Set<string>();
        allShifts.forEach(s => {
          if ((s.circulations as any[])?.some(cRef => circIds.includes(typeof cRef === 'string' ? cRef : cRef.codi))) {
            matchedShiftIds.add(s.id);
          }
        });

        // Enriquir dades d'una sola vegada
        const enrichedShifts = await fetchFullTurnData(Array.from(matchedShiftIds));

        const finalResults = matchingCircs.map(mc => {
          const shift = enrichedShifts.find(s => s.fullCirculations.some((fc: any) => fc.codi === mc.id || fc.realCodi === mc.id));
          if (!shift) return null;
          const cRef = shift.fullCirculations.find((fc: any) => fc.codi === mc.id || fc.realCodi === mc.id);
          return {
            ...mc,
            shift_id: shift.id,
            drivers: shift.drivers,
            cicle: cRef?.cicle,
            train: cRef?.train,
            fullTurn: shift,
            realCodi: cRef?.realCodi
          };
        }).filter(Boolean);

        setResults([{
          type: 'station_summary',
          station: selectedStation,
          circulations: (finalResults as any[]).sort((a, b) => getFgcMinutes(a.stopTimeAtStation) - getFgcMinutes(b.stopTimeAtStation))
        }]);
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
            const c = await fetchAllFromSupabase('shifts', qc);
            turnIds = c?.filter(turn => (turn.circulations as any[])?.some((circ: any) => (typeof circ === 'string' ? circ : circ.codi)?.toLowerCase().includes(searchVal.toLowerCase()))).map(turn => turn.id as string) || [];
            break;
        }
        if (turnIds.length > 0) setResults(await fetchFullTurnData(turnIds)); else setResults([]);
      }
    } catch (error) { console.error("Error cercant dades:", error); } finally { setLoading(false); }
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
                          className={`py-3 px-2 rounded-xl text-sm font-black border transition-all ${query === c ? 'bg-fgc-green text-fgc-grey border-fgc-green shadow-lg scale-105' : 'bg-white dark:bg-gray-800 text-fgc-grey dark:text-gray-200 border-gray-100 dark:border-white/5 hover:border-fgc-green hover:shadow-md hover:scale-105 active:scale-95'}`}
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
                        const isActive = checkIfActive((circ.sortida || circ.stopTimeAtStation) as string, (circ.arribada || circ.stopTimeAtStation) as string, nowMin);
                        const itineraryPoints = [{ nom: circ.inici, hora: circ.sortida, via: circ.via_inici }, ...(circ.estacions?.map((st: any) => ({ nom: st.nom, hora: st.hora || st.sortida || st.arribada, via: st.via })) || []), { nom: circ.final, hora: circ.arribada, via: circ.via_final }];
                        return (
                          <div key={cIdx} className={`flex flex-col transition-all hover:bg-gray-50/50 dark:hover:bg-white/5 relative ${isActive ? 'ring-2 ring-inset ring-red-600 z-10' : ''}`}>
                            <div className="w-full">
                              {isStationGroup ? (
                                <StationRow
                                  circ={circ}
                                  itemKey={itemKey}
                                  nowMin={nowMin}
                                  trainStatuses={trainStatuses}
                                  getTrainPhone={getTrainPhone}
                                  getLiniaColor={getLiniaColor}
                                  getShiftCurrentStatus={getShiftCurrentStatus}
                                  openUnitMenu={openUnitMenu}
                                  toggleItinerari={toggleItinerari}
                                />
                              ) : (
                                <CirculationRow
                                  circ={circ}
                                  itemKey={itemKey}
                                  nowMin={nowMin}
                                  trainStatuses={trainStatuses}
                                  getTrainPhone={getTrainPhone}
                                  getLiniaColor={getLiniaColor}
                                  openUnitMenu={openUnitMenu}
                                  toggleItinerari={toggleItinerari}
                                />
                              )}
                              {expandedItinerari === itemKey && (
                                <div className="p-4 sm:p-10 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-white/5 animate-in slide-in-from-top-4 duration-500 overflow-hidden">
                                  <div className="relative flex flex-col pl-8 sm:pl-16 pr-2 sm:pr-6 py-4 space-y-0">
                                    <div className="absolute left-[15px] sm:left-[29px] top-10 bottom-10 w-0.5 sm:w-1 bg-gray-100 dark:bg-gray-800 rounded-full" />
                                    {itineraryPoints.map((point, pIdx) => (<ItineraryPoint key={pIdx} point={point} isFirst={pIdx === 0} isLast={pIdx === itineraryPoints.length - 1} nextPoint={itineraryPoints[pIdx + 1]} nowMin={nowMin} />))}
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
                      <button onClick={() => scrollToElement(currentStatus.targetId)} className={`px-5 py-2.5 rounded-2xl text-[10px] sm:text-xs font-black shadow-md border-b-4 border-black/10 transition-all ${currentStatus.color}`}>{currentStatus.label}</button>
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
                            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white/40 dark:bg-black/20 rounded-full flex items-center justify-center text-fgc-grey border-2 border-white/60 shrink-0">{group.drivers.length > 1 ? <span className="font-black text-lg">{dIdx + 1}</span> : <User size={28} strokeWidth={2.5} />}</div>
                            <div className="space-y-1 min-w-0 flex-1 md:flex-none">
                              <div className="flex items-center gap-3">
                                <h3 className="text-xl sm:text-2xl font-black text-fgc-grey tracking-tight leading-tight uppercase truncate">{driver.cognoms}, {driver.nom}</h3>
                                {driver.tipus_torn && (<span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase shadow-sm border ${driver.tipus_torn === 'Reducció' ? 'bg-purple-600 text-white border-purple-700' : 'bg-blue-600 text-white border-blue-700'}`}>{driver.tipus_torn}</span>)}
                                {isWorking && (<div className="bg-fgc-grey text-white px-3 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-1.5 shadow-sm animate-bounce"><div className="w-1.5 h-1.5 bg-fgc-green rounded-full animate-pulse" />TREBALLANT</div>)}
                              </div>
                              <div className="flex flex-wrap gap-2 items-center"><div className="inline-flex items-center bg-fgc-grey text-white px-2.5 py-0.5 rounded-lg font-black text-[9px] sm:text-[10px] tracking-widest uppercase">Nómina: {driver.nomina}</div>{driver.abs_parc_c === 'S' && <span className="bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded">ABS</span>}{driver.dta === 'S' && <span className="bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded">DTA</span>}{driver.dpa === 'S' && <span className="bg-purple-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded">DPA</span>}</div>
                              {driver.observacions && (<div className="flex items-start gap-2 bg-black/10 dark:bg-black/20 px-3 py-2 rounded-xl border border-black/5 max-w-lg mt-2"><Info size={14} className="text-fgc-grey dark:text-gray-300 mt-0.5 shrink-0" /><p className="text-[11px] sm:text-xs font-bold text-fgc-grey dark:text-gray-200 leading-snug italic">{driver.observacions}</p></div>)}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:gap-3 w-full md:w-auto">{driver.phones?.map((p: string, i: number) => (<a key={i} href={`tel:${p}`} className="flex-1 md:flex-none flex items-center justify-center gap-2.5 bg-fgc-grey text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-black hover:bg-fgc-dark transition-all active:scale-95"><Phone size={14} />{p}</a>))}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="bg-white dark:bg-gray-900 p-4 sm:p-10 rounded-b-[32px] sm:rounded-b-[48px] border-x border-b border-gray-100 dark:border-white/5 shadow-sm overflow-hidden">
                  <ShiftTimeline turn={group} nowMin={nowMin} trainStatuses={trainStatuses} getLiniaColor={getLiniaColor} openUnitMenu={openUnitMenu} />
                  <div className="border border-gray-100 dark:border-white/5 rounded-[32px] overflow-hidden bg-white dark:bg-black/20 shadow-sm mb-4">
                    <CirculationHeader />
                    <div className="flex flex-col divide-y divide-gray-100 dark:divide-white/5">
                      {group.fullCirculations?.[0] && (<TimeGapRow from={group.inici_torn} to={group.fullCirculations[0].sortida} id={`gap-pre-${idx}`} nowMin={nowMin} />)}
                      {group.fullCirculations?.map((circ: any, cIdx: number) => {
                        const shiftItemKey = `${idx}-${cIdx}`;
                        const isActive = checkIfActive(circ.sortida as string, circ.arribada as string, nowMin);
                        const itineraryPoints = [{ nom: circ.inici, hora: circ.sortida, via: circ.via_inici }, ...(circ.estacions?.map((st: any) => ({ nom: st.nom, hora: st.hora || st.sortida || st.arribada, via: st.via })) || []), { nom: circ.final, hora: circ.arribada, via: circ.via_final }];
                        const nextCirc = group.fullCirculations?.[cIdx + 1];
                        return (
                          <React.Fragment key={cIdx}>
                            <div id={`circ-row-${shiftItemKey}`} className={`flex flex-col relative scroll-mt-24 ${isActive ? 'ring-2 ring-inset ring-red-600 z-10' : ''}`}>
                              <CirculationRow circ={circ} itemKey={shiftItemKey} nowMin={nowMin} trainStatuses={trainStatuses} getTrainPhone={getTrainPhone} getLiniaColor={getLiniaColor} openUnitMenu={openUnitMenu} toggleItinerari={toggleItinerari} />
                              {expandedItinerari === shiftItemKey && (
                                <div className="p-4 sm:p-10 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-white/5 animate-in slide-in-from-top-4 duration-500 overflow-hidden">
                                  <div className="relative flex flex-col pl-8 sm:pl-16 pr-2 sm:pr-6 py-4 space-y-0">
                                    <div className="absolute left-[15px] sm:left-[29px] top-10 bottom-10 w-0.5 sm:w-1 bg-gray-100 dark:bg-gray-800 rounded-full" />
                                    {itineraryPoints.map((point, pIdx) => (<ItineraryPoint key={pIdx} point={point} isFirst={pIdx === 0} isLast={pIdx === itineraryPoints.length - 1} nextPoint={itineraryPoints[pIdx + 1]} nowMin={nowMin} />))}
                                  </div>
                                </div>
                              )}
                            </div>
                            <TimeGapRow from={circ.arribada} to={nextCirc ? nextCirc.sortida : group.final_torn} id={`gap-row-${idx}-${cIdx}`} nowMin={nowMin} />
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

      {editingCirc && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-fgc-grey/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white dark:bg-gray-900 w-full max-md rounded-[48px] shadow-2xl border border-white/20 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 max-w-md">
            <div className="p-8 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-fgc-green rounded-2xl text-fgc-grey shadow-lg"><Train size={24} /></div>
                <div><h3 className="text-xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Gestió d'Unitat</h3><p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Circulació {editingCirc.circ.codi} • Cicle {editingCirc.cycleId}</p></div>
              </div>
              <button onClick={() => setEditingCirc(null)} className="p-2 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 rounded-full transition-colors"><X size={24} /></button>
            </div>
            <div className="p-8 space-y-8">
              <div className="space-y-2"><label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">Assignar Unitat de Tren</label><div className="relative"><Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} /><input type="text" value={editUnitNumber} onChange={(e) => setEditUnitNumber(e.target.value)} placeholder="Ex: 112.01, 113.12..." className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-4 focus:ring-fgc-green/20 outline-none font-black text-lg transition-all dark:text-white" /></div></div>
              <div className="space-y-4"><label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">Estat de la Flota</label><div className="grid grid-cols-2 gap-3">{[{ id: 'is_broken', label: 'AVARIAT', icon: <AlertTriangle size={16} />, color: 'red' }, { id: 'needs_images', label: 'IMATGES', icon: <Camera size={16} />, color: 'blue' }, { id: 'needs_records', label: 'REGISTRES', icon: <FileText size={16} />, color: 'yellow' }, { id: 'needs_cleaning', label: 'NETEJA', icon: <Brush size={16} />, color: 'orange' },].map((st) => (<button key={st.id} onClick={() => setTempStatus(prev => ({ ...prev, [st.id]: !prev[st.id as keyof typeof prev] }))} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all font-black text-[11px] ${tempStatus[st.id as keyof typeof tempStatus] ? `bg-${st.color}-50 dark:bg-${st.color}-900/20 border-${st.color}-500 text-${st.color}-600 dark:text-${st.color}-400 shadow-sm` : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-white/5 text-gray-400 dark:text-gray-500 grayscale'}`}>{st.icon}{st.label}{tempStatus[st.id as keyof typeof tempStatus] && <Check size={14} />}</button>))}</div></div>
              <button onClick={saveUnitChanges} disabled={isSavingUnit} className="w-full bg-fgc-green text-fgc-grey py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-fgc-green/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all">{isSavingUnit ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}DESAR CANVIS</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CercarView;