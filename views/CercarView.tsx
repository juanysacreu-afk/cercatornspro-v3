import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SearchType } from '../types.ts';
import { Search, User, Train, MapPin, Map as MapIcon, Hash, ArrowRight, Loader2, Info, Phone, Clock, FileText, ChevronDown, LayoutGrid, Timer, X, BookOpen, AlertTriangle, Users, Camera, Brush, Save, Check, Share2, Zap, ArrowUp, ArrowDown, RefreshCcw, Milestone, TrendingUp, TrainFront, Activity } from 'lucide-react';

import { decodeGeotrenUt } from '../views/incidencia/utils/decodeUt';
import { decodeGeotrenCirculation } from '../views/incidencia/utils/decodeCirculation';

import { supabase } from '../supabaseClient.ts';

import { getFgcMinutes, checkIfActive, calculateGap } from '../utils/time';
import { getFgcServiceDate } from '../utils/gipRecorder';
import { fetchAllFromSupabase } from '../utils/supabase';
import { getStatusColor, getLiniaColor, getShortTornId, getCandidateShiftIds, getTrainPhone, ALL_STATIONS, STATION_CODE_MAP, getCirculationParity, ALL_FLEET_UNITS } from '../utils/fgc';
import { resolveStationId } from '../utils/stations';
import { fetchFullTurns, fetchPassengerInfo } from '../utils/queries';
import { syncOfflineData } from '../utils/offlineSync';
import { offlineFetchFullTurns, offlineSearchTurnIds, offlineSearchMaquinistaTurnIds, offlineSearchCirculationTurnIds } from '../utils/offlineQueries';
import { ItineraryPoint } from '../components/ItineraryPoint';
import { ShiftTimeline } from '../components/ShiftTimeline';
import { TimeGapRow } from '../components/TimeGapRow';
import { CirculationHeader } from '../components/CirculationHeader';
import { CirculationRow } from '../components/CirculationRow';
import { StationRow } from '../components/StationRow';
import { MarqueeText } from '../components/MarqueeText';
import { useServiceToday } from '../utils/useServiceToday';
import { feedback } from '../utils/feedback';
import { useToast } from '../components/ToastProvider';
import GlassPanel from '../components/common/GlassPanel';
import { Skeleton, CardSkeleton, ListSkeleton } from '../components/common/Skeleton';
import { PK_SEGMENTS, PkSegment, findPkLocation, findStationPk, PkLocationResult } from '../utils/pkUtils';
import { getMapPositionForPk } from './incidencia/mapUtils.ts';
import { PkSegmentMap } from '../components/PkSegmentMap';
import { STATION_GEO_DATA, STATION_GEO_MAP, haversineKm, StationGeoData } from '../utils/stationGeoData';



const GEOTREN_API = 'https://dadesobertes.fgc.cat/api/v2/catalog/datasets/posicionament-dels-trens/exports/json';
const BV_LINES = new Set(['S1', 'S2', 'L6', 'L66', 'L7', 'L12', 'MS1', 'MS2', 'ML6', 'ML7', 'ES2']);
const VALID_UNIT_RE = /^\d{3}\.\d{2}$/;

const resolveStationName = (codeOrName: string, linia: string = ''): string => {
  if (!codeOrName) return '';
  const trimmed = codeOrName.trim();
  const code = resolveStationId(trimmed, linia);
  const geo = STATION_GEO_MAP.get(code);
  if (geo?.name) return geo.name;
  return trimmed;
};

const normalizeStr = (str: string) =>
  (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const formatMinsToHHMM = (mins: number) => {
  const rounded = Math.round(mins);
  let h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h >= 24) h %= 24;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const formatTimeToHHMMSS = (timeStr: string | null | undefined): string => {
  if (!timeStr) return '---';
  const clean = timeStr.trim();
  const parts = clean.split(':');
  if (parts.length >= 2) {
    const h = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const s = parts[2] && parts[2].trim() !== '' ? parts[2].trim().padStart(2, '0') : '00';
    return `${h}:${m}:${s}`;
  }
  return clean;
};

const fetchNextCircsForPk = async (loc: PkLocationResult, nowMins: number) => {
  if (!loc.prevStation || !loc.nextStation) return { nextAsc: null, nextDesc: null };
  const prevName = (STATION_CODE_MAP[loc.prevStation.name] || loc.prevStation.name).trim().toUpperCase();
  const nextName = (STATION_CODE_MAP[loc.nextStation.name] || loc.nextStation.name).trim().toUpperCase();

  const { data: matchedCircs } = await supabase.from('circulations')
    .select('id, inici, final, estacions, sortida, arribada')
    .or(`inici.ilike.${prevName},final.ilike.${prevName},estacions.cs.[{"nom":"${prevName}"}]`);

  if (!matchedCircs) return { nextAsc: null, nextDesc: null };

  let bestAscMins = Infinity;
  let bestDescMins = Infinity;
  let nextAsc: any = null;
  let nextDesc: any = null;

  matchedCircs.forEach(c => {
    let timePrev: string | null = null;
    let timeNext: string | null = null;

    if (c.inici?.trim().toUpperCase() === prevName) timePrev = c.sortida;
    else if (c.final?.trim().toUpperCase() === prevName) timePrev = c.arribada;
    else {
      const st = (c.estacions as any[])?.find(s => s.nom?.trim().toUpperCase() === prevName);
      if (st) timePrev = st.hora || st.sortida || st.arribada;
    }

    if (c.inici?.trim().toUpperCase() === nextName) timeNext = c.sortida;
    else if (c.final?.trim().toUpperCase() === nextName) timeNext = c.arribada;
    else {
      const st = (c.estacions as any[])?.find(s => s.nom?.trim().toUpperCase() === nextName);
      if (st) timeNext = st.hora || st.sortida || st.arribada;
    }

    if (timePrev && timeNext) {
      const minPrev = getFgcMinutes(timePrev);
      const minNext = getFgcMinutes(timeNext);
      
      if (minPrev <= minNext) {
        // Ascending
        const pkMins = minPrev + loc.percentage * (minNext - minPrev);
        if (pkMins >= nowMins && pkMins < bestAscMins) {
          bestAscMins = pkMins;
          nextAsc = { id: c.id, time: formatMinsToHHMM(pkMins) };
        }
      } else {
        // Descending
        const pkMins = minNext + (1 - loc.percentage) * (minPrev - minNext);
        if (pkMins >= nowMins && pkMins < bestDescMins) {
          bestDescMins = pkMins;
          nextDesc = { id: c.id, time: formatMinsToHHMM(pkMins) };
        }
      }
    }
  });

  return { nextAsc, nextDesc };
};

const CercarViewComponent: React.FC<{
  isPrivacyMode: boolean,
  externalSearch?: { type: string, query: string } | null,
  onExternalSearchHandled?: () => void,
  onLookOnMap?: (loc: { lat: number, lon: number, label: string, x?: number, y?: number }) => void
}> = ({ isPrivacyMode, externalSearch, onExternalSearchHandled, onLookOnMap }) => {

  const [searchType, setSearchType] = useState<SearchType | 'general'>(
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'general' : SearchType.Torn
  );
  const { showToast } = useToast();
  const todayService = useServiceToday();
  const [selectedServei, setSelectedServei] = useState<string>(todayService);

  // Sync selectedServei when todayService resolves from Supabase (only if user hasn't manually changed it)
  const hasManuallySwitched = React.useRef(false);
  const originalTodayService = React.useRef(todayService);
  React.useEffect(() => {
    if (!hasManuallySwitched.current && todayService !== originalTodayService.current) {
      setSelectedServei(todayService);
      originalTodayService.current = todayService;
    }
  }, [todayService]);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [passengerInfoMap, setPassengerInfoMap] = useState<Record<string, any[]>>({});
  const [expandedItinerari, setExpandedItinerari] = useState<string | null>(null);
  const [nowMin, setNowMin] = useState<number>(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [availableCycles, setAvailableCycles] = useState<string[]>([]);
  const [allStations, setAllStations] = useState<string[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [trainStatuses, setTrainStatuses] = useState<Record<string, any>>({});
  const [selectedVia, setSelectedVia] = useState<string>('Tot');
  const [stationDirectionFilter, setStationDirectionFilter] = useState<'all' | 'asc' | 'desc'>('all');
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // PK Search states
  const [selectedPkSegment, setSelectedPkSegment] = useState<PkSegment>('PC/RE');
  const [pkMapTarget, setPkMapTarget] = useState<PkLocationResult | null>(null);

  // Unit auto-refresh states (15s polling)
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const activeSearchedUnitRef = useRef<string>('');

  // Puntualitat GIP per torn
  const [shiftPunctualityMap, setShiftPunctualityMap] = useState<Record<string, { total: number; onTime: number; delayed: number; rate: number | null }>>({});

  useEffect(() => {
    const handleOnline = () => setIsOfflineMode(false);
    const handleOffline = () => setIsOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    await syncOfflineData((msg) => setSyncMsg(msg));
    setTimeout(() => {
      setSyncing(false);
      setSyncMsg('');
      showToast('Catxé actualitzada per a mode offline', 'success');
    }, 2000);
  };

  // Estat per al nou menú de gestió d'unitat
  const [editingCirc, setEditingCirc] = useState<{ circ: any, cycleId: string } | null>(null);
  const [editUnitNumber, setEditUnitNumber] = useState('');
  const [isSavingUnit, setIsSavingUnit] = useState(false);
  const [tempStatus, setTempStatus] = useState({ is_broken: false, needs_images: false, needs_records: false, needs_cleaning: false });

  useEffect(() => {
    if (externalSearch && onExternalSearchHandled) {
      const { type, query: q } = externalSearch;

      // Map external type to internal SearchType enum if possible
      let internalSearchType = SearchType.Torn;
      if (type === 'maquinista') internalSearchType = SearchType.Maquinista;
      if (type === 'circulacio') internalSearchType = SearchType.Circulacio;
      if (type === 'estacio') {
        internalSearchType = SearchType.Estacio;
        setSelectedStation(q);
      } else {
        setQuery(q);
      }

      setSearchType(internalSearchType);

      // Trigger search with explicit values to bypass async state update delay
      executeSearch(q, internalSearchType);

      onExternalSearchHandled();
    }
  }, [externalSearch]);

  const getCurrentTimeStr = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  };

  const getTimePlusMinutes = (minutes: number) => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + minutes);
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  };

  const [startTime, setStartTime] = useState<string>(getCurrentTimeStr());
  const [endTime, setEndTime] = useState<string>(getTimePlusMinutes(15));

  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      setNowMin(getFgcMinutes(timeStr));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
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

  // ── Puntualitat del torn/maquinista segons circulacions ja realitzades/iniciades ──
  const fetchShiftPunctualities = React.useCallback(async () => {
    if (!results || results.length === 0) return;

    // Filtrar torns que ja han començat o finalitzat (nowMin >= start)
    const activeOrFinishedShifts = results.filter((r: any) => {
      if (!r.inici_torn) return false;
      const start = getFgcMinutes(r.inici_torn);
      return start !== null && nowMin >= start;
    });

    if (activeOrFinishedShifts.length === 0) return;

    // Recollir codis de circulacions del torn que ja han començat
    const allCircIds = new Set<string>();
    activeOrFinishedShifts.forEach((s: any) => {
      const circs = s.fullCirculations || s.circulations || [];
      circs.forEach((c: any) => {
        const codi = typeof c === 'string' ? c : c.codi;
        if (!codi || codi === 'Viatger') return;
        const cStart = getFgcMinutes(c.sortida);
        if (cStart === null || nowMin >= cStart) {
          allCircIds.add(codi);
        }
      });
    });

    if (allCircIds.size === 0) return;

    try {
      const serviceDate = getFgcServiceDate();
      const { data: passages } = await supabase
        .from('gip_registre_pas')
        .select('circulacio_id, estat, diferencia_segons')
        .eq('data_servei', serviceDate)
        .in('circulacio_id', Array.from(allCircIds));

      if (!passages) return;

      const newMap: Record<string, { total: number; onTime: number; delayed: number; rate: number | null }> = {};

      activeOrFinishedShifts.forEach((s: any) => {
        const performedCircs = new Set(
          (s.fullCirculations || s.circulations || [])
            .filter((c: any) => {
              const codi = typeof c === 'string' ? c : c.codi;
              if (!codi || codi === 'Viatger') return false;
              const cStart = getFgcMinutes(c.sortida);
              return cStart === null || nowMin >= cStart;
            })
            .map((c: any) => (typeof c === 'string' ? c : c.codi))
        );

        const sPassages = passages.filter((p: any) => performedCircs.has(p.circulacio_id));
        const total = sPassages.length;
        const onTime = sPassages.filter((p: any) => p.estat === 'en_hora' || p.estat === 'avanc').length;
        const delayed = total - onTime;
        const rate = total > 0 ? Number(((onTime / total) * 100).toFixed(1)) : null;

        newMap[s.id] = { total, onTime, delayed, rate };
      });

      setShiftPunctualityMap(prev => ({ ...prev, ...newMap }));
    } catch (err) {
      console.warn('[CercarView] Error calculant puntualitat del torn:', err);
    }
  }, [results, nowMin]);

  useEffect(() => {
    fetchShiftPunctualities();
  }, [fetchShiftPunctualities]);

  const getPunctualityBadge = (p: { total: number; onTime: number; rate: number | null } | undefined) => {
    if (!p || p.rate === null || p.total === 0) {
      return {
        rate: null,
        total: p?.total || 0,
        onTime: p?.onTime || 0,
        text: '--%',
        badgeClass: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-white/5 dark:text-gray-400 dark:border-white/10'
      };
    }
    const r = p.rate;
    let badgeClass = '';
    if (r >= 95) {
      badgeClass = 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
    } else if (r >= 85) {
      badgeClass = 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
    } else {
      badgeClass = 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20';
    }
    return {
      rate: r,
      total: p.total,
      onTime: p.onTime,
      text: `${r}%`,
      badgeClass
    };
  };

  // Realtime Subscriptions for Assignments
  useEffect(() => {
    const channel = supabase.channel('cercar-assignments-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assignments' },
        (payload) => {
          console.log('[Cercar] Realtime: assignments changed', payload.eventType);
          // If we are currently viewing cycle results, refresh them
          if (searchType === SearchType.Cicle && query) {
            executeSearch(query, SearchType.Cicle);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [searchType, query]);

  useEffect(() => {
    if (searchType === SearchType.Estacio) {
      setStartTime(getCurrentTimeStr());
      setEndTime(getTimePlusMinutes(15));
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
      showToast('Canvis desats correctament', 'success');
    } catch (e) {
      console.error("Error desant canvis d'unitat:", e);
      showToast('Error al desar els canvis', 'error');
    } finally {
      setIsSavingUnit(false);
    }
  };

  const filterButtonsRow1 = [
    { id: SearchType.Torn, label: 'Torn', icon: <Hash size={16} /> },
    { id: SearchType.Maquinista, label: 'Maquinista', icon: <User size={16} /> },
    { id: SearchType.Circulacio, label: 'Circulació', icon: <Train size={16} /> },
  ];
  const filterButtonsRow2 = [
    { id: SearchType.Estacio, label: 'Estació', icon: <MapPin size={16} /> },
    { id: SearchType.Cicle, label: 'Cicle', icon: <RefreshCcw size={16} /> },
    { id: SearchType.PK, label: 'PK', icon: <Milestone size={18} /> },
    { id: SearchType.Unitat, label: 'Unitat', icon: <TrainFront size={16} /> },
  ];
  // For desktop, combine all in one flat list
  const filterButtons = [...filterButtonsRow1, ...filterButtonsRow2];


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
          color: 'bg-red-500 text-white live-pulse shadow-lg scale-105',
          targetId: `circ-row-${shiftIdx}-${i}`
        };
      }
    }

    if (circs.length === 0) {
      return { label: `Temps: ${end - nowMin} min`, color: 'bg-yellow-400 text-[#4D5358] shadow-sm', targetId: null };
    }

    const firstStart = getFgcMinutes(circs[0].sortida);
    if (nowMin < firstStart) {
      const remaining = firstStart - nowMin;
      const totalGap = firstStart - start;
      const isDescans = totalGap >= 15;
      return {
        label: `${isDescans ? 'Descans' : 'Temps'}: Resten ${Math.round(remaining)} min de ${Math.round(totalGap)}`,
        color: isDescans ? 'bg-fgc-green text-[#4D5358] shadow-sm' : 'bg-yellow-400 text-[#4D5358] shadow-sm',
        targetId: `gap-pre-${shiftIdx}`
      };
    }

    for (let i = 0; i < circs.length; i++) {
      const currentEnd = getFgcMinutes(circs[i].arribada);
      const nextStart = circs[i + 1] ? getFgcMinutes(circs[i + 1].sortida) : end;
      if (nowMin >= currentEnd && nowMin < nextStart) {
        const gapDuration = nextStart - currentEnd;
        const remaining = nextStart - nowMin;
        const isDescans = gapDuration >= 15;
        return {
          label: `${isDescans ? 'Descans' : 'Temps'}: Resten ${Math.round(remaining)} min de ${Math.round(gapDuration)}`,
          color: isDescans ? 'bg-fgc-green text-[#4D5358] shadow-sm' : 'bg-yellow-400 text-[#4D5358] shadow-sm',
          targetId: `gap-row-${shiftIdx}-${i}`
        };
      }
    }

    return { label: 'En servei', color: 'bg-fgc-green text-[#4D5358] shadow-sm', targetId: null };
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

  const handleCycleClick = (cycleId: string) => {
    feedback.click();
    setSearchType(SearchType.Cicle);
    setQuery(cycleId);
    executeSearch(cycleId, SearchType.Cicle);
    scrollToElement('search-container');
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
      if (searchType === SearchType.Cicle) { 
        setSuggestions(availableCycles.slice(0, 12)); 
        setShowSuggestions(true); 
      } else if (searchType === SearchType.Unitat) {
        setSuggestions(ALL_FLEET_UNITS.slice(0, 10));
        setShowSuggestions(true);
      } else { 
        setSuggestions([]); 
        setShowSuggestions(false); 
      }
      return;
    }

    // For general search on mobile, predict the type
    let st = searchType;
    if (st === 'general') {
      if (val.match(/\((\d+)\)/) || /[a-zA-Z]/.test(val) && !val.match(/^Q/i)) {
        // looks like maquinista (has parens or letters that aren't starting with Q)
        // checking if it looks like circulation (pure numbers mostly, 3-5 digits typically)
        if (/^\d{3,5}$/.test(val) && !val.includes('(')) st = SearchType.Circulacio;
        else st = SearchType.Maquinista;
      } else if (/^\d{3}\.\d{1,2}$/.test(val)) {
        st = SearchType.Unitat;
      } else if (/^\d+$/.test(val) || /^Q/i.test(val)) {
        st = SearchType.Torn;
      }
    }

    if (st === SearchType.Torn || (st as any) === 'general') {
      let q = supabase.from('shifts').select('id');
      if (selectedServei !== 'Tots') q = q.eq('servei', selectedServei);
      const candidates = getCandidateShiftIds(val, selectedServei);
      const orFilters = [
        ...candidates.map(c => `id.eq.${c}`),
        `id.ilike.%${val}%`
      ];
      q = q.or(orFilters.join(','));
      const { data } = await q.limit(8);
      if (data && data.length > 0) { 
        setSuggestions(Array.from(new Set((data as any[]).map(item => item.id as string)))); 
        setShowSuggestions(true); 
      }

      // PK or Station suggestions in general
      const isPk = /^\d+([.,]\d*)?$/.test(val.replace(',', '.'));
      if (isPk) {
        // No specific suggestions for raw numbers (PK), just let them enter
      } else {
        const stations = ALL_STATIONS.filter(s => normalizeStr(s).includes(normalizeStr(val))).slice(0, 5);
        if (stations.length > 0) {
          setSuggestions(prev => Array.from(new Set([...prev, ...stations])));
          setShowSuggestions(true);
        }
      }
    } else if (st === SearchType.Maquinista) {
      const { data } = await supabase.from('daily_assignments').select('nom, cognoms, empleat_id').or(`nom.ilike.%${val}%,cognoms.ilike.%${val}%,empleat_id.ilike.%${val}%`).limit(8);
      if (data) { const unique = Array.from(new Set((data as any[]).map(d => `${d.cognoms || ''}, ${d.nom || ''} (${d.empleat_id})`))) as string[]; setSuggestions(unique); setShowSuggestions(true); }
    } else if (st === SearchType.Circulacio) {
      const sCode = (selectedServei && selectedServei !== 'Tots') ? (selectedServei === '0' ? '000' : selectedServei) : undefined;
      let qCirc = supabase.from('circulationsv2').select('id').ilike('id', `%${val}%`);
      if (sCode) qCirc = qCirc.eq('servei', sCode);
      const { data } = await qCirc.limit(8);
      if (data && data.length > 0) { 
        setSuggestions(Array.from(new Set((data as any[]).map(item => item.id as string)))); 
        setShowSuggestions(true); 
      } else {
        const { data: legacyData } = await supabase.from('circulations').select('id').ilike('id', `%${val}%`).limit(8);
        if (legacyData) { setSuggestions(Array.from(new Set((legacyData as any[]).map(item => item.id as string)))); setShowSuggestions(true); }
      }
    } else if (st === SearchType.Cicle) {
      const filtered = availableCycles.filter(c => normalizeStr(c).includes(normalizeStr(val))).slice(0, 12);
      setSuggestions(filtered); setShowSuggestions(true);
    } else if (st === SearchType.PK) {
      // If not looking like a number, suggest stations
      if (!/^\d+([.,]\d*)?$/.test(val.replace(',', '.'))) {
        const filtered = ALL_STATIONS.filter(s => normalizeStr(s).includes(normalizeStr(val))).slice(0, 10);
        setSuggestions(filtered); setShowSuggestions(true);
      } else {
        setSuggestions([]); setShowSuggestions(false);
      }
    } else if (st === SearchType.Unitat) {
      const cleanVal = val.trim().toLowerCase();
      const cleanValNoDot = cleanVal.replace('.', '');

      const filtered = ALL_FLEET_UNITS.filter(unit => {
        const u = unit.toLowerCase();
        const uNoDot = u.replace('.', '');
        const [, num] = u.split('.');

        // Coincidència directa o començant per (ex: "113", "113.04", "113.")
        if (u.includes(cleanVal) || uNoDot.startsWith(cleanValNoDot)) return true;

        // Coincidència pel número de cua de la unitat (ex: "04" o "4")
        if (num === cleanVal.padStart(2, '0') || num.endsWith(cleanVal)) return true;

        return false;
      }).slice(0, 10);

      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    }
  };

  const executeSearch = async (overrideQuery?: string, overrideType?: SearchType, isSilent?: boolean) => {
    let searchVal = overrideQuery || query;
    const currentType = overrideType || searchType;
    if (!searchVal && currentType !== SearchType.Cicle && currentType !== SearchType.Estacio && currentType !== SearchType.PK) { setResults([]); return; }

    if (currentType === SearchType.Unitat && searchVal) {
      activeSearchedUnitRef.current = searchVal;
    }

    if (!isSilent) {
      setLoading(true); setResults([]); setShowSuggestions(false); setPassengerInfoMap({});
      feedback.click();
    } else {
      setIsAutoRefreshing(true);
    }
    try {
      let newResults: any[] = [];
      if (currentType === SearchType.Cicle) {
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
              const codi = typeof c === 'object' ? c.codi : null;
              if (c.cicle === searchVal) {
                flattenedCircs.push({ ...c, shift_id: shift.id, codi });
                if (codi && codi !== 'Viatger') allCodiSet.add(codi as string);
              }
            });
          });
          const sCode = (selectedServei && selectedServei !== 'Tots') ? (selectedServei === '0' ? '000' : selectedServei) : undefined;
          let qDetails = supabase.from('circulationsv2').select('*').in('id', Array.from(allCodiSet));
          if (sCode) qDetails = qDetails.eq('servei', sCode);
          let details = await fetchAllFromSupabase('circulationsv2', qDetails);
          if (!details || details.length === 0) {
            details = await fetchAllFromSupabase('circulations', supabase.from('circulations').select('*').in('id', Array.from(allCodiSet)));
          }
          const enrichedCircs = flattenedCircs.map(fc => { const detail = details?.find(d => d.id === fc.codi); return { ...detail, ...fc }; });
          enrichedCircs.sort((a, b) => getFgcMinutes(a.sortida || '00:00') - getFgcMinutes(b.sortida || '00:00'));
          newResults = [{ type: 'cycle_summary', cycle_id: searchVal, train: cycleAssigRes.data?.train_number || 'S/A', circulations: enrichedCircs }];
        }
      } else if (currentType === SearchType.Estacio) {
        if (!selectedStation && !overrideQuery) { setLoading(false); return; }
        const stationToSearch = overrideQuery || selectedStation;
        const stationCode = STATION_CODE_MAP[stationToSearch] || stationToSearch;
        const targetStation = stationCode.trim().toUpperCase();

        // Optimizació: Filtrar circulacions per estació directament en la base de dades
        // Cerca pel codi (ex: 'PC') o pel nom en JSON
        const sCode = (selectedServei && selectedServei !== 'Tots') ? (selectedServei === '0' ? '000' : selectedServei) : undefined;
        let qCircs = supabase.from('circulationsv2').select('*');
        if (sCode) qCircs = qCircs.eq('servei', sCode);
        qCircs = qCircs.or(`inici.ilike.${targetStation},final.ilike.${targetStation},estacions.cs.[{"codi":"${targetStation}"}]`);

        let { data: matchedCircsRaw } = await qCircs;
        let matchedCircs = matchedCircsRaw;

        if ((!matchedCircs || matchedCircs.length === 0) && (!sCode || sCode === '000')) {
          const { data: legacyCircs } = await supabase.from('circulations')
            .select('*')
            .or(`inici.ilike.${targetStation},final.ilike.${targetStation},estacions.cs.[{"nom":"${targetStation}"}]`);
          matchedCircs = legacyCircs;
        }

        if (!matchedCircs || matchedCircs.length === 0) { setResults([]); return; }

        matchedCircs = matchedCircs.map((c: any) => ({
          ...c,
          estacions: Array.isArray(c.estacions) ? c.estacions.map((st: any) => ({
            ...st,
            nom: st.nom || st.codi,
            codi: st.codi || st.nom,
            hora: st.hora || st.sortida || st.arribada,
            sortida: st.sortida || st.hora,
            arribada: st.arribada || st.hora,
            via: st.via || st.via_sortida || st.via_arribada || ''
          })) : []
        }));

        const startMinRange = getFgcMinutes(startTime);
        const endMinRange = getFgcMinutes(endTime);
        const matchingCircs: any[] = [];

        matchedCircs.forEach(c => {
          let stopTime: string | null = null;
          let stopVia: string | null = null;
          if (c.inici?.trim().toUpperCase() === targetStation) {
            stopTime = c.sortida as string;
            stopVia = c.via_inici;
          } else if (c.final?.trim().toUpperCase() === targetStation) {
            stopTime = c.arribada as string;
            stopVia = c.via_final;
          } else {
            const stop = (c.estacions as any[])?.find(st => {
              const stName = st.nom?.trim().toUpperCase();
              return stName === targetStation;
            });
            if (stop) {
              stopTime = stop.hora || stop.arribada || stop.sortida;
              stopVia = stop.via;
            }
          }
          if (stopTime) {
            const stopMin = getFgcMinutes(stopTime);
            if (stopMin >= startMinRange && stopMin <= endMinRange) {
              matchingCircs.push({ ...c, stopTimeAtStation: stopTime, viaAtStation: stopVia });
            }
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

        newResults = [{
          type: 'station_summary',
          station: overrideQuery || selectedStation,
          stationCode: stationCode,
          circulations: (finalResults as any[]).sort((a, b) => getFgcMinutes(a.stopTimeAtStation) - getFgcMinutes(b.stopTimeAtStation))
        }];
      } else if (currentType === SearchType.PK) {
        const valToSearch = overrideQuery || query;

        const isPk = /^\d+([.,]\d+)?$/.test(valToSearch.replace(',', '.'));

        if (isPk) {
          const pk = parseFloat(valToSearch.replace(',', '.'));
          const location = findPkLocation(selectedPkSegment, pk);
          if (location) {
            const nextCircs = await fetchNextCircsForPk(location, nowMin);
            newResults = [{ type: 'pk_location', ...location, ...nextCircs }];
          }
        } else {
          // Assume station search within PK
          const station = findStationPk(valToSearch);
          if (station) {
            const location = findPkLocation(station.pkSegment, station.pk);
            if (location) {
              const nextCircs = await fetchNextCircsForPk(location, nowMin);
              newResults = [{ type: 'pk_location', ...location, ...nextCircs }];
            }
          }

        }
      } else if (currentType === SearchType.Unitat) {
        const unitQuery = (overrideQuery || query).trim();
        if (!unitQuery) { setLoading(false); setIsAutoRefreshing(false); return; }

        try {
          // 1. Fetch real-time GeoTren data
          const resp = await fetch(GEOTREN_API);
          if (!resp.ok) throw new Error('No s\'ha pogut connectar amb l\'API de GeoTren');
          const rawData: any[] = await resp.json();
          const geoTrenData = rawData.filter(gt => BV_LINES.has((gt.lin || '').toUpperCase()));

          // 2. Decode all units and find matches
          const normalizedQuery = unitQuery.replace(/\s/g, '').toLowerCase();
          const matchingTrains: any[] = [];

          geoTrenData.forEach(gt => {
            const decodedUt = decodeGeotrenUt(gt.ut, gt.tipus_unitat);
            if (!decodedUt) return;
            const normalizedUt = decodedUt.replace(/\s/g, '').toLowerCase();

            // Match by full unit (113.04), by series (113), by partial (04), or by number without dot (11304)
            const matches = normalizedUt === normalizedQuery
              || normalizedUt.startsWith(normalizedQuery)
              || normalizedUt.endsWith(normalizedQuery)
              || normalizedUt.replace('.', '') === normalizedQuery.replace('.', '')
              || normalizedUt.split('.')[1] === normalizedQuery.padStart(2, '0');

            if (matches) {
              const decodedCirc = decodeGeotrenCirculation(gt.id);

              // Parse next stops
              let nextStops: any[] = [];
              if (gt.properes_parades && typeof gt.properes_parades === 'string') {
                try { nextStops = gt.properes_parades.split(';').map((p: string) => JSON.parse(p)); } catch (_) {}
              } else if (Array.isArray(gt.properes_parades)) {
                nextStops = gt.properes_parades;
              }

              // Occupation
              const coaches = [
                { name: 'M1', val: gt.ocupacio_m1_percent },
                { name: 'RI', val: gt.ocupacio_ri_percent },
                { name: 'MI', val: gt.ocupacio_mi_percent },
                { name: 'M2', val: gt.ocupacio_m2_percent }
              ].filter(c => c.val !== null && c.val !== undefined);
              const avgOccupation = coaches.length > 0
                ? Math.round(coaches.reduce((acc: number, c: any) => acc + (parseFloat(c.val) || 0), 0) / coaches.length)
                : null;

              matchingTrains.push({
                raw: gt,
                decodedUt,
                decodedCirc,
                nextStops,
                coaches,
                avgOccupation,
                isPunctual: gt.en_hora === 'True',
                delaySeconds: typeof gt.retard === 'number' ? gt.retard : 0,
              });
            }
          });

          if (matchingTrains.length === 0) {
            newResults = [];
          } else {
            // 3. For each match, find the associated cycle + shift + driver from Supabase
            let qShifts = supabase.from('shifts').select('*');
            if (selectedServei !== 'Tots') qShifts = qShifts.eq('servei', selectedServei);
            const allShiftsData = await fetchAllFromSupabase('shifts', qShifts);

            // Build circulation -> cycle map
            const circToCicle: Record<string, string> = {};
            const circToShiftId: Record<string, string> = {};
            allShiftsData?.forEach((shift: any) => {
              (shift.circulations as any[])?.forEach((cRef: any) => {
                const codi = (typeof cRef === 'string' ? cRef : cRef?.codi)?.toUpperCase();
                if (codi && cRef?.cicle) {
                  circToCicle[codi] = cRef.cicle;
                  circToShiftId[codi] = shift.id;
                }
              });
            });

            const enrichedResults = await Promise.all(matchingTrains.map(async (train) => {
              const circCode = train.decodedCirc?.fullName?.toUpperCase() || null;
              const matchedCycleId = circCode ? circToCicle[circCode] : null;
              const matchedShiftId = circCode ? circToShiftId[circCode] : null;

              // Find all circulations in this cycle + their order
              let cycleCirculations: any[] = [];
              let nextCirculation: any = null;
              let assignedTrain: string | null = null;
              let shiftData: any = null;
              let driverData: any = null;

              if (matchedCycleId) {
                // Get assignment (unit in DB)
                const { data: assignData } = await supabase.from('assignments')
                  .select('train_number').eq('cycle_id', matchedCycleId).single();
                assignedTrain = assignData?.train_number || null;

                // Get all circs in this cycle
                allShiftsData?.forEach((shift: any) => {
                  (shift.circulations as any[])?.forEach((cRef: any) => {
                    if (cRef?.cicle === matchedCycleId) {
                      cycleCirculations.push({
                        codi: typeof cRef === 'string' ? cRef : cRef.codi,
                        sortida: cRef.sortida,
                        arribada: cRef.arribada,
                        inici: cRef.inici,
                        final: cRef.final,
                        linia: cRef.linia,
                        cicle: cRef.cicle,
                        shift_id: shift.id,
                      });
                    }
                  });
                });

                // Enrich with real circulation details (inici/final often missing from shift refs)
                const cycleCircIds = cycleCirculations.map((c: any) => c.codi).filter(Boolean);
                let circDetails: any[] = [];
                if (cycleCircIds.length > 0) {
                  const { data } = await supabase.from('circulations')
                    .select('id, inici, final, linia, sortida, arribada, estacions').in('id', cycleCircIds);
                  if (data) {
                    circDetails = data;
                    const detailMap = new Map(circDetails.map((d: any) => [d.id, d]));
                    cycleCirculations = cycleCirculations.map((cc: any) => {
                      const detail = detailMap.get(cc.codi);
                      if (detail) {
                        return {
                          ...cc,
                          inici: cc.inici || detail.inici,
                          final: cc.final || detail.final,
                          linia: cc.linia || detail.linia,
                          sortida: cc.sortida || detail.sortida,
                          arribada: cc.arribada || detail.arribada,
                          estacions: detail.estacions || cc.estacions,
                        };
                      }
                      return cc;
                    });
                  }
                }

                cycleCirculations.sort((a: any, b: any) => getFgcMinutes(a.sortida || '00:00') - getFgcMinutes(b.sortida || '00:00'));

                // Find current and next
                const currentIdx = cycleCirculations.findIndex((c: any) => c.codi?.toUpperCase() === circCode);
                if (currentIdx !== -1 && currentIdx < cycleCirculations.length - 1) {
                  nextCirculation = cycleCirculations[currentIdx + 1];
                }
              }

              if (matchedShiftId) {
                // Get full shift data
                shiftData = allShiftsData?.find((s: any) => s.id === matchedShiftId);

                // Get driver
                const shortTorn = getShortTornId(matchedShiftId);
                const { data: driverAssignment } = await supabase.from('daily_assignments')
                  .select('*').eq('torn', shortTorn).limit(1);
                if (driverAssignment && driverAssignment.length > 0) {
                  const da = driverAssignment[0];
                  const { data: phoneData } = await supabase.from('phonebook')
                    .select('phones').eq('nomina', da.empleat_id).single();
                  driverData = { ...da, phones: phoneData?.phones || [] };
                }
              }

              // Fetch current circulation detail (with full estacions) for exact timetable comparison
              let currentCircDetail: any = null;
              if (circCode) {
                const { data: directDetail } = await supabase.from('circulations')
                  .select('id, inici, final, linia, sortida, arribada, estacions')
                  .eq('id', circCode)
                  .maybeSingle();
                currentCircDetail = directDetail;
              }

              // ── Schedule Comparison (Oficial Supabase vs Dades Obertes GeoTren) ──
              const gt = train.raw;
              const officialStops: Array<{ nom: string; code: string; hora: string; rawHora?: string }> = [];

              if (currentCircDetail) {
                if (currentCircDetail.inici && currentCircDetail.sortida) {
                  officialStops.push({
                    nom: currentCircDetail.inici,
                    code: resolveStationId(currentCircDetail.inici, gt.lin),
                    hora: formatTimeToHHMMSS(currentCircDetail.sortida),
                    rawHora: currentCircDetail.sortida
                  });
                }
                if (Array.isArray(currentCircDetail.estacions)) {
                  currentCircDetail.estacions.forEach((st: any) => {
                    const h = st.sortida || st.hora || st.arribada;
                    if (st.nom && h) {
                      officialStops.push({
                        nom: st.nom,
                        code: resolveStationId(st.nom, gt.lin),
                        hora: formatTimeToHHMMSS(h),
                        rawHora: h
                      });
                    }
                  });
                }
                if (currentCircDetail.final && currentCircDetail.arribada) {
                  officialStops.push({
                    nom: currentCircDetail.final,
                    code: resolveStationId(currentCircDetail.final, gt.lin),
                    hora: formatTimeToHHMMSS(currentCircDetail.arribada),
                    rawHora: currentCircDetail.arribada
                  });
                }
              }

              // Fallback to shift circulation if circulations table had no stops
              if (officialStops.length === 0 && shiftData) {
                const sc = (shiftData.circulations as any[])?.find((c: any) => (typeof c === 'string' ? c : c.codi)?.toUpperCase() === circCode);
                if (sc && typeof sc === 'object') {
                  if (sc.inici && sc.sortida) {
                    officialStops.push({ nom: sc.inici, code: resolveStationId(sc.inici, gt.lin), hora: formatTimeToHHMMSS(sc.sortida), rawHora: sc.sortida });
                  }
                  if (sc.final && sc.arribada) {
                    officialStops.push({ nom: sc.final, code: resolveStationId(sc.final, gt.lin), hora: formatTimeToHHMMSS(sc.arribada), rawHora: sc.arribada });
                  }
                }
              }

              // ── Location Resolution (Estacionat vs En Trajecte) ──
              // 1. Direct check from SIRTRAN estacionat_a
              let exactStationCode = gt.estacionat_a && gt.estacionat_a.trim() !== '' ? resolveStationId(gt.estacionat_a.trim(), gt.lin) : null;
              let isAtStation = Boolean(exactStationCode);

              // 2. High-precision GPS check: if train is <= 120m from a station platform, it is stopped/at station
              const trainLat: number | undefined = gt.geo_point_2d?.lat;
              const trainLon: number | undefined = gt.geo_point_2d?.lon;

              if (!isAtStation && trainLat && trainLon) {
                let nearestStation: StationGeoData | null = null;
                let minDistanceMeters = Infinity;

                for (const st of STATION_GEO_DATA) {
                  const dMeters = haversineKm(trainLat, trainLon, st.lat, st.lon) * 1000;
                  if (dMeters < minDistanceMeters) {
                    minDistanceMeters = dMeters;
                    nearestStation = st;
                  }
                }

                if (nearestStation && minDistanceMeters <= 120) {
                  exactStationCode = nearestStation.id;
                  isAtStation = true;
                }
              }

              const stationFullName = exactStationCode ? resolveStationName(exactStationCode, gt.lin) : null;
              const nextStopRaw = (train.nextStops && train.nextStops.length > 0) ? train.nextStops[0].parada : null;
              const nextStopCode = nextStopRaw ? resolveStationId(nextStopRaw, gt.lin) : (gt.desti ? resolveStationId(gt.desti, gt.lin) : '');
              const nextStopFullName = nextStopRaw ? resolveStationName(nextStopRaw, gt.lin) : (gt.desti ? resolveStationName(gt.desti, gt.lin) : '');

              // Adaptació per pantalla:
              // Mòbil: "En [Sigla]" o "Cap a [Sigla]"
              // Pantalles grans: "Estacionat a [Nom]" o "En trajecte cap a [Nom]"
              const mobileLocationText = isAtStation
                ? `En ${exactStationCode || stationFullName || 'estació'}`
                : `Cap a ${nextStopCode || nextStopFullName || 'destí'}`;

              const desktopLocationText = isAtStation
                ? `Estacionat a ${stationFullName || exactStationCode || 'estació'}`
                : (nextStopFullName || nextStopCode
                    ? `En trajecte cap a ${nextStopFullName || nextStopCode}`
                    : 'En circulació');

              const locationDisplayText = desktopLocationText;

              // Reference station for theoretical timetable comparison
              let refStationName = exactStationCode || nextStopRaw || gt.desti || null;
              let refStationCode = refStationName ? resolveStationId(refStationName, gt.lin) : null;
              let estimatedTime: string | null = (!isAtStation && train.nextStops && train.nextStops.length > 0 && train.nextStops[0].hora_prevista)
                ? train.nextStops[0].hora_prevista.substring(0, 5)
                : null;

              let matchedStop = refStationCode ? officialStops.find(s => s.code === refStationCode) : null;
              if (!matchedStop && refStationName) {
                const normRef = normalizeStr(refStationName);
                matchedStop = officialStops.find(s => {
                  const normNom = normalizeStr(s.nom);
                  return normNom.includes(normRef) || normRef.includes(normNom);
                });
              }

              const officialTime: string | null = matchedStop ? formatTimeToHHMMSS(matchedStop.hora) : null;
              const comparisonStationName: string = matchedStop ? matchedStop.nom : (refStationName ? resolveStationName(refStationName, gt.lin) : 'Trajecte');

              // Compute diff in minutes
              let diffMinutes = 0;
              if (officialTime && estimatedTime) {
                diffMinutes = getFgcMinutes(estimatedTime) - getFgcMinutes(officialTime);
              } else if (typeof train.delaySeconds === 'number' && train.delaySeconds > 0) {
                diffMinutes = Math.round(train.delaySeconds / 60);
              }

              // Comparació en viu amb el rellotge de l'ordinador (retard si l'hora teòrica ja ha passat)
              const officialMins = officialTime ? getFgcMinutes(officialTime) : null;
              const currentClockMins = typeof nowMin === 'number' && nowMin > 0 ? nowMin : (getFgcMinutes(getCurrentTimeStr()) || 0);

              if (officialMins !== null && currentClockMins > officialMins) {
                const liveClockDelayMin = Math.max(0, Math.floor(currentClockMins - officialMins));
                if (liveClockDelayMin > diffMinutes) {
                  diffMinutes = liveClockDelayMin;
                }
              }

              if (officialTime && !estimatedTime) {
                estimatedTime = diffMinutes === 0
                  ? officialTime
                  : formatTimeToHHMMSS(formatMinsToHHMM(getFgcMinutes(officialTime) + diffMinutes));
              }

              let timeStatus: 'retard' | 'avanc' | 'puntual' = 'puntual';
              let timeStatusLabel = 'En hora (Puntual)';

              if (diffMinutes >= 4) {
                timeStatus = 'retard';
                timeStatusLabel = `+${diffMinutes} min retard`;
              } else if (diffMinutes > 0) {
                timeStatus = 'puntual';
                timeStatusLabel = 'En hora';
              } else if (diffMinutes < 0) {
                timeStatus = 'avanc';
                timeStatusLabel = `${Math.abs(diffMinutes)} min avanç`;
              } else {
                timeStatus = 'puntual';
                timeStatusLabel = 'En hora (Puntual)';
              }

              const scheduleComparison = {
                exactStation: stationFullName,
                isAtStation,
                locationDisplayText,
                mobileLocationText,
                desktopLocationText,
                stationFullName,
                nextStopFullName,
                comparisonStationName,
                officialTime,
                estimatedTime,
                departureExactTime: matchedStop?.rawHora || officialTime,
                diffMinutes,
                timeStatus,
                timeStatusLabel,
              };

              // Enriquir pròximes parades amb codi, nom complet i hora teòrica oficial de pas
              let enrichedNextStops = (train.nextStops || []).map((s: any) => {
                const sRaw = s.parada || '';
                const sCode = resolveStationId(sRaw, gt.lin) || sRaw;
                const sName = resolveStationName(sRaw, gt.lin) || sRaw;

                let matched = officialStops.find(os => os.code === sCode);
                if (!matched && sRaw) {
                  const normRaw = normalizeStr(sRaw);
                  matched = officialStops.find(os => {
                    const normNom = normalizeStr(os.nom);
                    return normNom.includes(normRaw) || normRaw.includes(normNom);
                  });
                }

                const horaTeorica = matched?.hora ? formatTimeToHHMMSS(matched.hora) : (s.hora_prevista ? formatTimeToHHMMSS(s.hora_prevista) : null);

                return {
                  ...s,
                  parada: sRaw,
                  code: sCode,
                  nom: sName,
                  horaTeorica,
                };
              });

              // Si GeoTren no retorna parades o en té poques, i tenim horari oficial de la circulació,
              // completar amb les pròximes parades oficials a partir de la posició actual
              if (enrichedNextStops.length < 5 && officialStops.length > 0) {
                const currentStationCode = exactStationCode || (train.nextStops?.[0]?.parada ? resolveStationId(train.nextStops[0].parada, gt.lin) : null);
                let startIdx = 0;
                if (currentStationCode) {
                  const foundIdx = officialStops.findIndex(os => os.code === currentStationCode);
                  if (foundIdx !== -1) {
                    startIdx = isAtStation ? Math.min(foundIdx + 1, officialStops.length) : foundIdx;
                  }
                }

                const upcomingFromOfficial = officialStops.slice(startIdx).map(os => ({
                  parada: os.code,
                  code: os.code,
                  nom: resolveStationName(os.code, gt.lin) || os.nom,
                  horaTeorica: formatTimeToHHMMSS(os.hora),
                }));

                if (enrichedNextStops.length === 0) {
                  enrichedNextStops = upcomingFromOfficial;
                } else {
                  const existingCodes = new Set(enrichedNextStops.map((st: any) => st.code));
                  for (const st of upcomingFromOfficial) {
                    if (!existingCodes.has(st.code)) {
                      enrichedNextStops.push(st);
                      existingCodes.add(st.code);
                    }
                  }
                }
              }

              return {
                type: 'unit_result',
                ...train,
                nextStops: enrichedNextStops,
                officialStops,
                circCode,
                currentCircDetail,
                scheduleComparison,
                matchedCycleId,
                matchedShiftId,
                cycleCirculations,
                nextCirculation,
                assignedTrain,
                shiftData,
                driverData,
              };
            }));

            newResults = enrichedResults;
          }
        } catch (err) {
          console.error('[Unitat] Error fetching GeoTren:', err);
          if (!isSilent) newResults = [];
          else return;
        }
      } else {

        let turnIds: string[] = [];

        if (currentType === 'general') {
          if (isOfflineMode) {
            const [tIds, mIds, cIds] = await Promise.all([
              offlineSearchTurnIds(searchVal, selectedServei),
              offlineSearchMaquinistaTurnIds(searchVal, selectedServei),
              offlineSearchCirculationTurnIds(searchVal, selectedServei)
            ]);
            turnIds = Array.from(new Set([...tIds, ...mIds, ...cIds]));
            if (turnIds.length > 0) newResults = await offlineFetchFullTurns(turnIds.slice(0, 50), selectedServei === 'Tots' ? undefined : selectedServei); else newResults = [];
          } else {
            // 1. Torn
            let qt = supabase.from('shifts').select('id');
            if (selectedServei !== 'Tots') qt = qt.eq('servei', selectedServei);
            const candidates = getCandidateShiftIds(searchVal, selectedServei);
            const orFilters = [
              ...candidates.map(c => `id.eq.${c}`),
              `id.ilike.%${searchVal}%`
            ];
            qt = qt.or(orFilters.join(','));

            // 2. Maq
            const nominaMatch = searchVal.match(/\((\d+)\)/);
            const filterVal = nominaMatch ? nominaMatch[1] : searchVal.trim();
            let qAssignments = supabase.from('daily_assignments').select('torn');
            if (nominaMatch) qAssignments = qAssignments.eq('empleat_id', filterVal);
            else qAssignments = qAssignments.or(`nom.ilike.%${filterVal}%,cognoms.ilike.%${filterVal}%,empleat_id.ilike.%${filterVal}%`);

            // 3. Circ
            let qc = supabase.from('shifts').select('id, circulations');
            if (selectedServei !== 'Tots') qc = qc.eq('servei', selectedServei);

            const [resT, resM, c] = await Promise.all([qt, qAssignments, fetchAllFromSupabase('shifts', qc)]);

            const shortTorns = Array.from(new Set(resM.data?.map(x => x.torn?.trim().toUpperCase()) || []));
            const simplifyId = (id: string) => id.replace(/^Q/i, '').replace(/^0+/, '');
            const targetShortTornSimples = shortTorns.map(storn => simplifyId(storn));

            let qm = supabase.from('shifts').select('id');
            if (selectedServei !== 'Tots') qm = qm.eq('servei', selectedServei);
            const { data: matchingShifts } = await qm;

            const tIds = resT.data?.map(x => x.id as string) || [];
            const mIds = matchingShifts?.filter(shift => {
              const shiftId = shift.id as string;
              const simpleShiftId = simplifyId(getShortTornId(shiftId));
              return targetShortTornSimples.includes(simpleShiftId) || shortTorns.includes(getShortTornId(shiftId).toUpperCase());
            }).map(x => x.id as string) || [];
            const cIds = c?.filter(turn => (turn.circulations as any[])?.some((circ: any) => (typeof circ === 'string' ? circ : circ.codi)?.toLowerCase().includes(searchVal.toLowerCase()))).map(turn => turn.id as string) || [];

            turnIds = Array.from(new Set([...tIds, ...mIds, ...cIds]));
            if (turnIds.length > 0) newResults = await fetchFullTurnData(turnIds); else newResults = [];

            // 4. PK / Station detection in General Search
            const isPk = /^\d+([.,]\d+)?$/.test(searchVal.replace(',', '.'));
            if (isPk) {
              const pkValue = parseFloat(searchVal.replace(',', '.'));
              const loc = findPkLocation(selectedPkSegment, pkValue);
              if (loc) newResults = [{ type: 'pk_location', ...loc }, ...newResults];
            } else {
              const station = findStationPk(searchVal);
              if (station) {
                const loc = findPkLocation(station.pkSegment, station.pk);
                if (loc) newResults = [{ type: 'pk_location', ...loc }, ...newResults];
              }
            }
          }
        } else {
          let st = currentType as SearchType;
          if (isOfflineMode) {
            switch (st) {
              case SearchType.Torn:
                turnIds = await offlineSearchTurnIds(searchVal, selectedServei);
                break;
              case SearchType.Maquinista:
                turnIds = await offlineSearchMaquinistaTurnIds(searchVal, selectedServei);
                break;
              case SearchType.Circulacio:
                turnIds = await offlineSearchCirculationTurnIds(searchVal, selectedServei);
                break;
            }
            if (turnIds.length > 0) newResults = await offlineFetchFullTurns(turnIds.slice(0, 50), selectedServei === 'Tots' ? undefined : selectedServei); else newResults = [];
          } else {
            switch (st) {
              case SearchType.Torn: {
                let qt = supabase.from('shifts').select('id');
                if (selectedServei !== 'Tots') qt = qt.eq('servei', selectedServei);
                const candidates = getCandidateShiftIds(searchVal, selectedServei);
                const orFilters = [
                  ...candidates.map(c => `id.eq.${c}`),
                  `id.ilike.%${searchVal}%`
                ];
                qt = qt.or(orFilters.join(','));
                const { data: s } = await qt;
                turnIds = s?.map(x => x.id as string) || [];
                break;
              }
              case SearchType.Maquinista:
                const nominaMatch = searchVal.match(/\((\d+)\)/); // More flexible regex
                const filterVal = nominaMatch ? nominaMatch[1] : searchVal.trim();

                let qAssignments = supabase.from('daily_assignments').select('torn');
                if (nominaMatch) {
                  qAssignments = qAssignments.eq('empleat_id', filterVal);
                } else {
                  qAssignments = qAssignments.or(`nom.ilike.%${filterVal}%,cognoms.ilike.%${filterVal}%,empleat_id.ilike.%${filterVal}%`);
                }

                const { data: m } = await qAssignments;
                const shortTorns = Array.from(new Set(m?.map(x => x.torn?.trim().toUpperCase()) || []));

                let qm = supabase.from('shifts').select('id');
                if (selectedServei !== 'Tots') qm = qm.eq('servei', selectedServei);
                const { data: matchingShifts } = await qm;

                const simplifyId = (id: string) => id.replace(/^Q/i, '').replace(/^0+/, '');
                const targetShortTornSimples = shortTorns.map(st => simplifyId(st));

                turnIds = matchingShifts?.filter(shift => {
                  const shiftId = shift.id as string;
                  const simpleShiftId = simplifyId(getShortTornId(shiftId));
                  return targetShortTornSimples.includes(simpleShiftId) || shortTorns.includes(getShortTornId(shiftId).toUpperCase());
                }).map(x => x.id as string) || [];
                break;
              case SearchType.Circulacio:
                let qc = supabase.from('shifts').select('id, circulations');
                if (selectedServei !== 'Tots') qc = qc.eq('servei', selectedServei);
                const c = await fetchAllFromSupabase('shifts', qc);
                turnIds = c?.filter(turn => (turn.circulations as any[])?.some((circ: any) => (typeof circ === 'string' ? circ : circ.codi)?.toLowerCase().includes(searchVal.toLowerCase()))).map(turn => turn.id as string) || [];
                break;
            }
            if (turnIds.length > 0) newResults = await fetchFullTurnData(turnIds); else newResults = [];
          }
        }
      }

      setResults(newResults);

      // --- FETCH PASSENGER INFO ---
      if (newResults.length > 0) {
        const circIds = new Set<string>();
        newResults.forEach(r => {
          if (r.circulations) { // Cycle / Station
            r.circulations.forEach((c: any) => c.codi && c.codi !== 'Viatger' && circIds.add(c.codi));
          } else if (r.fullCirculations) { // Turn
            r.fullCirculations.forEach((c: any) => c.codi && c.codi !== 'Viatger' && circIds.add(c.codi));
          }
        });

        if (circIds.size > 0) {
          const pInfo = await fetchPassengerInfo(Array.from(circIds), selectedServei === 'Tots' ? undefined : selectedServei);
          setPassengerInfoMap(pInfo);
        }
      }

    } catch (error) {
      console.error("Error cercant dades:", error);
    } finally {
      setLoading(false);
      setIsAutoRefreshing(false);
    }
  };

  const executeSearchRef = useRef(executeSearch);
  useEffect(() => {
    executeSearchRef.current = executeSearch;
  });

  // ── Auto-refresh per a Cerca per Unitat cada 10 segons ─────────────
  useEffect(() => {
    if (searchType !== SearchType.Unitat || results.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const targetQuery = activeSearchedUnitRef.current || query;
      if (targetQuery && targetQuery.trim()) {
        executeSearchRef.current(targetQuery, SearchType.Unitat, true);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [searchType, results.length > 0, query]);

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-8 animate-in fade-in duration-700 max-w-7xl mx-auto w-full">
      <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 animate-in fade-in slide-in-from-top-4 duration-700 parallax-slow">
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#4D5358] dark:text-white tracking-tight title-glow uppercase">Cerca de Servei</h1>
              {isOfflineMode && <span className="bg-red-500/20 text-red-500 text-xs px-2 py-1 rounded-full animate-pulse border border-red-500/30">Línia Caiguda: Offline</span>}
            </div>
            <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 font-medium mt-1">
              {syncing ? syncMsg || "Sincronitzant..." : "Informació de torns, circulacions i unitats de tren."}
            </p>
          </div>
          <button onClick={handleSync} disabled={syncing || isOfflineMode} className={`hidden md:flex self-start items-center gap-2 px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all border ${isOfflineMode ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-white/5 bg-gray-100 dark:bg-white/5 text-gray-400' : 'border-fgc-green/50 text-fgc-green hover:bg-fgc-green hover:text-[#4D5358] bg-fgc-green/10 group shadow-sm shadow-fgc-green/10'}`}>
            <Save size={16} className={syncing ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'} />
            {syncing ? 'Baixant...' : 'Baixar Catxé per a Offline'}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">Filtre de Servei</span>
          <div className="flex overflow-x-auto w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] -mx-4 px-4 md:mx-0 md:px-0">
            <div className="inline-flex glass-card p-1 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 pb-0">
              {['Tots', ...serveiTypes].map(s => (<button key={s} onClick={() => { feedback.deepClick(); setSelectedServei(s); }} className={`px-3 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex-shrink-0 ${selectedServei === s ? 'bg-fgc-grey dark:bg-fgc-green dark:text-[#4D5358] text-white shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'}`}>{s === 'Tots' ? 'Tots' : `S-${s}`}</button>))}
            </div>
          </div>
        </div>
      </header>

      <GlassPanel className="p-6 sm:p-8 relative z-30">
        <div className="absolute inset-0 rounded-[32px] sm:rounded-[40px] overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-64 h-64 bg-fgc-green/5 blur-3xl -mr-32 -mt-32" />
        </div>
        {/* Mobile: two rows of 3. Desktop: single flex row */}
        <div className="md:hidden flex flex-col gap-2 mb-6">
          <div className="grid grid-cols-3 gap-2">
            {filterButtonsRow1.map((btn) => (
              <button key={btn.id} onClick={() => { feedback.click(); setSearchType(btn.id); setResults([]); setQuery(''); setSuggestions([]); setShowSuggestions(false); }} className={`flex items-center justify-center gap-1 px-1 py-2.5 rounded-xl text-[12px] font-bold transition-all ${searchType === btn.id ? 'bg-fgc-green text-[#4D5358] shadow-xl shadow-fgc-green/20' : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/10'}`}>
                <span className="shrink-0">{btn.icon}</span>
                <span className="truncate">{btn.label}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {filterButtonsRow2.map((btn) => (
              <button key={btn.id} onClick={() => { feedback.click(); setSearchType(btn.id); setResults([]); setQuery(''); setSuggestions([]); setShowSuggestions(false); }} className={`flex items-center justify-center gap-1 px-1 py-2.5 rounded-xl text-[12px] font-bold transition-all ${searchType === btn.id ? 'bg-fgc-green text-[#4D5358] shadow-xl shadow-fgc-green/20' : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/10'}`}>
                <span className="shrink-0">{btn.icon}</span>
                <span className="truncate">{btn.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="hidden md:flex md:flex-wrap gap-2 sm:gap-3 mb-6 sm:mb-8">
          {filterButtons.map((btn) => (
            <button key={btn.id} onClick={() => { feedback.click(); setSearchType(btn.id); setResults([]); setQuery(''); setSuggestions([]); setShowSuggestions(false); }} className={`flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all ${searchType === btn.id ? 'bg-fgc-green text-[#4D5358] shadow-xl shadow-fgc-green/20' : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/10'}`}>
              <span className="shrink-0">{btn.icon}</span>
              <span className="truncate">{btn.label}</span>
            </button>
          ))}
        </div>
        <div className="md:hidden w-full mb-6">
          <button onClick={handleSync} disabled={syncing || isOfflineMode} className={`w-full flex justify-center items-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold transition-all border ${isOfflineMode ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-white/5 bg-gray-100 dark:bg-white/5 text-gray-400' : 'border-fgc-green/50 text-fgc-green hover:bg-fgc-green hover:text-[#4D5358] bg-fgc-green/10 group shadow-sm shadow-fgc-green/10'}`}>
            <Save size={18} className={syncing ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'} />
            {syncing ? 'Baixant...' : 'Baixar dades Offline'}
          </button>
        </div>

        {searchType === SearchType.Estacio ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-6">
              <div className="flex-1 space-y-2">
                <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-4">Selecciona Estació</label>
                <div className="relative">
                  <MapPin className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={24} />
                  <select
                    value={selectedStation}
                    onChange={(e) => { setSelectedStation(e.target.value); if (e.target.value) executeSearch(e.target.value, SearchType.Estacio); }}
                    className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[24px] sm:rounded-[32px] py-4 sm:py-6 pl-16 pr-12 focus:ring-4 focus:ring-fgc-green/20 outline-none text-lg sm:text-2xl font-bold appearance-none cursor-pointer dark:text-white transition-all shadow-inner"
                  >
                    <option value="" className="dark:bg-fgc-grey">Tria una estació...</option>
                    {allStations.map(st => <option key={st} value={st} className="dark:bg-fgc-grey">{st}</option>)}
                  </select>
                  <ChevronDown className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" size={24} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-4 flex items-center gap-2">
                    De les<button onClick={() => setStartTime(getCurrentTimeStr())} className="text-fgc-green"><Clock size={12} /></button>
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[20px] sm:rounded-[32px] py-4 sm:py-6 px-2 sm:px-8 focus:ring-4 focus:ring-fgc-green/20 outline-none text-base sm:text-2xl font-bold dark:text-white text-center appearance-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-4 flex items-center gap-2">
                    A les<button onClick={() => setEndTime(getTimePlusMinutes(15))} className="text-fgc-green"><Clock size={12} /></button>
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[20px] sm:rounded-[32px] py-4 sm:py-6 px-2 sm:px-8 focus:ring-4 focus:ring-fgc-green/20 outline-none text-base sm:text-2xl font-bold dark:text-white text-center appearance-none"
                  />
                </div>
              </div>

              <button
                onClick={() => executeSearch()}
                className="bg-fgc-green text-[#4D5358] h-[60px] sm:h-[76px] w-full rounded-[20px] sm:rounded-[32px] text-lg sm:text-xl font-bold shadow-xl shadow-fgc-green/20 hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-3 transition-all mt-2"
              >
                <Search size={22} />CERCAR
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-4" ref={suggestionsRef}>
              <div className="relative flex-1 group">
                <div className="absolute inset-y-0 left-6 z-20 flex items-center pointer-events-none text-gray-400 dark:text-gray-500 bg-transparent">
                  {loading ? <Loader2 className="animate-spin" size={24} /> : <Search size={24} />}
                </div>
                <input
                  type="text"
                  name="search-query"
                  autoComplete="off"
                  data-1p-ignore="true"
                  placeholder={searchType === 'general' ? 'Cerca torn, maquinista o circulació...' : searchType === SearchType.Unitat ? 'Cerca per unitat (ex: 113.04, 112, 07...)' : `Cerca per ${searchType.toUpperCase()}...`}
                  className="relative z-10 w-full bg-gray-50 dark:bg-black/20 border-none rounded-[24px] sm:rounded-[32px] py-4 sm:py-6 pl-14 sm:pl-16 pr-14 sm:pr-16 focus:ring-4 focus:ring-fgc-green/20 outline-none text-lg sm:text-2xl font-bold placeholder:text-gray-300 dark:text-white dark:placeholder:text-gray-600 transition-all shadow-inner"
                  value={query}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
                  onFocus={(e) => {
                    e.target.select();
                    if (query.length >= 1) {
                      setShowSuggestions(true);
                    } else if (searchType === SearchType.Cicle) {
                      setSuggestions(availableCycles.slice(0, 12));
                      setShowSuggestions(true);
                    } else if (searchType === SearchType.Unitat) {
                      setSuggestions(ALL_FLEET_UNITS.slice(0, 10));
                      setShowSuggestions(true);
                    }
                  }}
                />
                {query && (
                  <button
                    onClick={() => {
                      setQuery('');
                      setResults([]);
                      setSuggestions([]);
                      setShowSuggestions(false);
                      feedback.click();
                    }}
                    className="absolute inset-y-0 right-6 z-20 flex items-center text-gray-400 dark:text-gray-500 hover:text-fgc-green transition-colors"
                  >
                    <X size={24} />
                  </button>
                )}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-2 right-2 mt-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-[24px] shadow-2xl border border-gray-100 dark:border-white/10 z-[200] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    {suggestions.map((id, sIdx) => (
                      <button
                        key={sIdx}
                        onClick={() => handleSuggestionClick(id)}
                        className="w-full text-left px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-xl font-bold text-[#4D5358] dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-fgc-green transition-colors flex items-center justify-between group"
                      >
                        <span>{id}</span>
                        <ArrowRight size={18} className="opacity-0 group-hover:opacity-100 transition-all scale-110" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => executeSearch()} className="bg-fgc-green text-[#4D5358] h-[60px] sm:h-[76px] px-8 sm:px-10 rounded-[24px] sm:rounded-[32px] text-lg sm:text-xl font-bold shadow-xl shadow-fgc-green/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3"><Search size={22} />CERCAR</button>
            </div>

            {searchType === SearchType.PK && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-500 space-y-4">
                <div className="flex items-center gap-2 mb-2 px-2">
                  <MapPin size={16} className="text-fgc-green" />
                  <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Tram PK o Estació</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Tram de Línia</label>
                    <div className="flex flex-wrap gap-2">
                      {PK_SEGMENTS.map(seg => (
                        <button
                          key={seg}
                          onClick={() => {
                            setSelectedPkSegment(seg);
                            if (query) executeSearch(query, SearchType.PK);
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${selectedPkSegment === seg ? 'bg-fgc-green text-[#4D5358] border-fgc-green shadow-lg' : 'bg-white dark:bg-black/20 text-gray-400 border-gray-100 dark:border-white/5 hover:border-fgc-green'}`}
                        >
                          {seg}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {searchType === SearchType.Cicle && (

              <div className="animate-in fade-in slide-in-from-top-2 duration-500">
                <div className="flex items-center gap-2 mb-4 px-2">
                  <LayoutGrid size={16} className="text-fgc-green" />
                  <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Selecció ràpida de Cicle (S-{selectedServei})</h3>
                </div>
                <div className="bg-gray-50/50 dark:bg-black/20 p-4 sm:p-6 rounded-[28px] border border-gray-100 dark:border-white/5">
                  {loading ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 p-1">
                      {[...Array(16)].map((_, i) => (
                        <div key={i} className="skeleton-item h-12 w-full" />
                      ))}
                    </div>
                  ) : availableCycles.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar p-1">
                      {availableCycles.map((c) => (
                        <button
                          key={c}
                          onClick={() => { setQuery(c); executeSearch(c); }}
                          className={`py-3 px-2 rounded-xl text-sm font-bold border transition-all ${query === c ? 'bg-fgc-green text-[#4D5358] border-fgc-green shadow-lg scale-105' : 'bg-white dark:bg-gray-800 text-[#4D5358] dark:text-gray-200 border-gray-100 dark:border-white/5 hover:border-fgc-green hover:shadow-md hover:scale-105 active:scale-95'}`}
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
      </GlassPanel>

      <div className="space-y-12 sm:space-y-16 mt-8">
        {loading ? (
          <div className="space-y-12 animate-in fade-in duration-500">
            <CardSkeleton />
            <ListSkeleton items={5} />
          </div>
        ) : results.length > 0 ? (
          results.map((group, idx) => {
            if (group.type === 'cycle_summary' || group.type === 'station_summary') {
              const isStationGroup = group.type === 'station_summary';
              return (
                <GlassPanel key={idx} className="p-4 sm:p-10 !rounded-[40px] sm:!rounded-[56px] animate-in fade-in slide-in-from-bottom-12 duration-700 relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-fgc-green/5 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-8 mb-6 sm:mb-12">
                    <div className="flex items-center gap-4 sm:gap-6">
                      <div className={`min-w-[3.5rem] min-h-[3.5rem] sm:min-w-[5rem] sm:min-h-[5rem] px-2 ${isStationGroup ? 'bg-fgc-green text-[#4D5358]' : 'bg-fgc-grey dark:bg-black text-white'} rounded-2xl sm:rounded-[28px] flex items-center justify-center text-base sm:text-2xl font-bold shadow-lg`}><span className="truncate">{isStationGroup ? <MapPin size={28} /> : group.cycle_id}</span></div>
                      <div className="min-w-0">
                        <h2 className="text-lg sm:text-3xl font-bold text-[#4D5358] dark:text-white tracking-tighter uppercase truncate">{isStationGroup ? `Circulacions a ${group.station}` : 'Cronograma de Cicle'}</h2>
                        <div className="flex items-center gap-2 mt-0.5 sm:mt-1">{isStationGroup ? <Clock size={14} className="text-fgc-green" /> : <Train size={14} className="text-fgc-green" />}<p className="text-sm sm:text-lg font-bold text-gray-500 dark:text-gray-400">{isStationGroup ? `Franja: ${startTime} - ${endTime}` : `Unitat: ${group.train}`}</p></div>
                      </div>
                    </div>
                  </div>
                  {isStationGroup && group.stationCode && (
                    <div className="mb-8 mx-auto w-full max-w-4xl aspect-[16/9] rounded-[32px] overflow-hidden border-[8px] border-gray-900 bg-black relative shadow-2xl">
                      <iframe
                        src={`https://geotren.fgc.cat/isic/${group.stationCode.toLowerCase()}`}
                        className="w-[555%] sm:w-[222.22%] h-[555%] sm:h-[222.22%] border-0 origin-top-left scale-[0.18] sm:scale-[0.45]"
                        title={`Informació estació ${group.station}`}
                        allow="geolocation"
                      />
                    </div>
                  )}
                  <div className="border border-gray-100 dark:border-white/5 rounded-[32px] overflow-hidden bg-white dark:bg-black/20 shadow-sm">
                    {isStationGroup && (
                      <div className="flex flex-col sm:flex-row flex-wrap items-center justify-between gap-3 p-3 sm:p-4 bg-gray-50/50 dark:bg-black/40 border-b border-gray-100 dark:border-white/5">
                        {/* Filtre de Sentit (Ascendent / Descendent) */}
                        <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-center sm:justify-start">
                          <span className="hidden sm:inline text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mr-1">Sentit:</span>
                          <div className="inline-flex p-1 bg-gray-200/50 dark:bg-white/5 rounded-2xl gap-1">
                            {(() => {
                              const ascCount = group.circulations.filter((c: any) => {
                                const circCode = (c.id === 'Viatger' ? c.realCodi : c.id) || c.realCodi || c.codi || c.id;
                                return getCirculationParity(circCode) === 'asc';
                              }).length;
                              const descCount = group.circulations.filter((c: any) => {
                                const circCode = (c.id === 'Viatger' ? c.realCodi : c.id) || c.realCodi || c.codi || c.id;
                                return getCirculationParity(circCode) === 'desc';
                              }).length;
                              return (
                                <>
                                  <button
                                    onClick={() => { feedback.click(); setStationDirectionFilter('all'); }}
                                    className={`px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all ${
                                      stationDirectionFilter === 'all'
                                        ? 'bg-white dark:bg-gray-800 text-fgc-grey dark:text-white shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                                  >
                                    Tots ({group.circulations.length})
                                  </button>
                                  <button
                                    onClick={() => { feedback.click(); setStationDirectionFilter('asc'); }}
                                    className={`px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 ${
                                      stationDirectionFilter === 'asc'
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
                                    }`}
                                    title="Circulacions ascendents (impars)"
                                  >
                                    <ArrowUp size={12} className="stroke-[3]" /> Ascendents ({ascCount})
                                  </button>
                                  <button
                                    onClick={() => { feedback.click(); setStationDirectionFilter('desc'); }}
                                    className={`px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 ${
                                      stationDirectionFilter === 'desc'
                                        ? 'bg-amber-600 text-white shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400'
                                    }`}
                                    title="Circulacions descendents (pars)"
                                  >
                                    <ArrowDown size={12} className="stroke-[3]" /> Descendents ({descCount})
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Filtre per Via (només si és PC) */}
                        {group.stationCode === 'PC' && (
                          <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-center sm:justify-end">
                            <span className="hidden sm:inline text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mr-1">Via:</span>
                            {['Tot', 'V1', 'V2', 'V3', 'V4', 'V5'].map(via => (
                              <button
                                key={via}
                                onClick={() => {
                                  feedback.click();
                                  setSelectedVia(via);
                                }}
                                className={`px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold transition-all ${selectedVia === via
                                  ? 'bg-fgc-green text-[#4D5358] shadow-md scale-105'
                                  : 'bg-white dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-white/5 hover:bg-gray-100'
                                  }`}
                              >
                                {via}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <CirculationHeader isStationView={isStationGroup} />
                    <div className="grid grid-cols-1 divide-y divide-gray-100 dark:divide-white/5">
                      {(() => {
                        const filteredCircs = group.circulations.filter((c: any) => {
                          if (selectedVia !== 'Tot' && (!c.viaAtStation || !c.viaAtStation.includes(selectedVia.replace('V', '')))) {
                            return false;
                          }
                          if (isStationGroup && stationDirectionFilter !== 'all') {
                            const circCode = (c.id === 'Viatger' ? c.realCodi : c.id) || c.realCodi || c.codi || c.id;
                            const parity = getCirculationParity(circCode);
                            if (parity && parity !== stationDirectionFilter) {
                              return false;
                            }
                          }
                          return true;
                        });

                        if (filteredCircs.length === 0) {
                          return (
                            <div className="py-12 px-4 text-center">
                              <p className="text-gray-400 dark:text-gray-500 font-bold text-sm sm:text-base">
                                No s'han trobat circulacions {stationDirectionFilter === 'asc' ? 'ascendents (impars)' : stationDirectionFilter === 'desc' ? 'descendents (pars)' : ''} {selectedVia !== 'Tot' ? `a la via ${selectedVia}` : ''} en aquesta franja horària.
                              </p>
                              {stationDirectionFilter !== 'all' && (
                                <button
                                  onClick={() => setStationDirectionFilter('all')}
                                  className="mt-3 px-4 py-2 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-bold transition-all"
                                >
                                  Mostra tots els sentits
                                </button>
                              )}
                            </div>
                          );
                        }

                        return filteredCircs.map((circ: any, cIdx: number) => {
                          const itemKey = `${idx}-${cIdx}`;
                          // ... resto del mapa ...
                          const isActive = checkIfActive((circ.sortida || circ.stopTimeAtStation) as string, (circ.arribada || circ.stopTimeAtStation) as string, nowMin);
                          return (
                            <div key={cIdx} className={`flex flex-col transition-all hover:bg-gray-50/50 dark:hover:bg-white/5 relative ${isActive ? 'ring-2 ring-inset ring-red-600 z-10' : ''}`}>
                              {isStationGroup ? (
                                <StationRow circ={circ} itemKey={itemKey} nowMin={nowMin} trainStatuses={trainStatuses} getTrainPhone={getTrainPhone} getLiniaColor={getLiniaColor} getShiftCurrentStatus={getShiftCurrentStatus} openUnitMenu={openUnitMenu} toggleItinerari={toggleItinerari} isPrivacyMode={isPrivacyMode} onCycleClick={handleCycleClick} />
                              ) : (
                                <CirculationRow circ={circ} itemKey={itemKey} nowMin={nowMin} trainStatuses={trainStatuses} getTrainPhone={getTrainPhone} getLiniaColor={getLiniaColor} openUnitMenu={openUnitMenu} toggleItinerari={toggleItinerari} isPrivacyMode={isPrivacyMode} onCycleClick={handleCycleClick} />
                              )}
                              {expandedItinerari === itemKey && (
                                <div className="p-4 sm:p-10 bg-white dark:bg-fgc-grey border-t border-gray-100 dark:border-white/5 animate-in slide-in-from-top-4 duration-500 overflow-hidden">
                                  <div className="relative flex flex-col pl-8 sm:pl-16 pr-2 sm:pr-6 py-4 space-y-0">
                                    <div className="absolute left-[15px] sm:left-[29px] top-10 bottom-10 w-0.5 sm:w-1 bg-gray-100 dark:bg-gray-800 rounded-full" />
                                    {[{ nom: circ.inici, hora: circ.sortida, via: circ.via_inici }, ...(circ.estacions?.map((st: any) => ({ nom: st.nom, hora: st.hora || st.sortida || st.arribada, via: st.via })) || []), { nom: circ.final, hora: circ.arribada, via: circ.via_final }].map((point, pIdx, arr) => (
                                      <ItineraryPoint key={pIdx} point={point} isFirst={pIdx === 0} isLast={pIdx === arr.length - 1} nextPoint={arr[pIdx + 1]} nowMin={nowMin} />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </GlassPanel>
              );
            }

            if (group.type === 'pk_location') {
              const loc = group as PkLocationResult & { nextAsc?: { id: string, time: string }, nextDesc?: { id: string, time: string } };
              return (
                <GlassPanel key={idx} className="p-8 sm:p-10 !rounded-[40px] animate-in fade-in slide-in-from-bottom-12 duration-700 relative overflow-hidden group">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                      <div className="p-4 bg-fgc-green rounded-2xl text-[#4D5358] shadow-lg"><MapPin size={24} /></div>
                      <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-[#4D5358] dark:text-white uppercase tracking-tight">Punt Kilomètric {loc.pk.toFixed(3)}</h2>
                        <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">{loc.segment}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setPkMapTarget(loc)}
                      className="flex items-center gap-2 px-6 py-3 bg-fgc-green text-[#4D5358] rounded-2xl font-bold shadow-lg hover:scale-105 active:scale-95 transition-all"
                    >
                      <MapIcon size={20} />
                      VEURE AL MAPA
                    </button>
                  </div>


                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
                    <div className="space-y-4">
                      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] ml-1">Posició i Entorn</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                          <span className="text-xs font-bold text-gray-400">ESTACIÓ ANTERIOR</span>
                          <span className="text-sm font-bold text-[#4D5358] dark:text-white uppercase">{loc.prevStation?.name || '---'}</span>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                          <span className="text-xs font-bold text-gray-400">ESTACIÓ POSTERIOR</span>
                          <span className="text-sm font-bold text-[#4D5358] dark:text-white uppercase">{loc.nextStation?.name || '---'}</span>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                          <span className="text-xs font-bold text-gray-400">COORDENADES GPS</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-[#4D5358] dark:text-gray-300">{loc.lat.toFixed(6)}, {loc.lon.toFixed(6)}</span>
                            <a
                              href={`https://www.google.com/maps?q=${loc.lat},${loc.lon}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center p-1.5 bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400 hover:bg-blue-500 hover:text-white rounded-lg transition-colors group"
                              title="Obrir a Google Maps"
                            >
                              <MapPin size={14} className="group-hover:scale-110 transition-transform" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col justify-center p-8 bg-fgc-green/10 rounded-[32px] border-2 border-dashed border-fgc-green/30 relative overflow-hidden">
                      <div className="text-[10px] font-bold text-fgc-green uppercase tracking-[0.3em] mb-6 text-center">Progrés en Tram</div>

                      <div className="relative mb-2">
                        <div className="flex justify-between items-end mb-2 px-1">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-extrabold text-[#4D5358] dark:text-gray-200 uppercase tracking-tighter">{loc.prevStation?.name || '---'}</span>
                            <span className="text-[14px] font-black text-fgc-green leading-none">
                              {loc.prevStation ? Math.round(Math.abs(loc.pk - loc.prevStation.pk) * 1000) : 0} <small className="text-[9px] opacity-70">m</small>
                            </span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] font-extrabold text-[#4D5358] dark:text-gray-200 uppercase tracking-tighter">{loc.nextStation?.name || '---'}</span>
                            <span className="text-[14px] font-black text-fgc-green leading-none text-right">
                              {loc.nextStation ? Math.round(Math.abs(loc.nextStation.pk - loc.pk) * 1000) : 0} <small className="text-[9px] opacity-70">m</small>
                            </span>
                          </div>
                        </div>

                        <div className="w-full h-5 bg-white dark:bg-black/40 rounded-full overflow-hidden p-1 shadow-inner ring-1 ring-fgc-green/20">
                          <div
                            className="h-full bg-fgc-green rounded-full shadow-sm relative transition-all duration-1000"
                            style={{ width: `${loc.percentage * 100}%` }}
                          >
                            <div className="absolute right-0 top-0 bottom-0 w-4 bg-white/30 blur-sm" />
                          </div>
                        </div>
                      </div>

                      <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 text-center uppercase tracking-tight mt-4">
                        Posició al <span className="text-fgc-green text-sm">{(loc.percentage * 100).toFixed(1)}%</span> del trajecte
                      </p>
                    </div>
                  </div>

                  <div className="mt-10 pt-10 border-t border-gray-100 dark:border-white/5">
                    <div className="flex items-center gap-3 mb-6">
                      <Train className="text-fgc-green" size={20} />
                      <h3 className="text-sm font-bold text-[#4D5358] dark:text-white uppercase tracking-tight">Pròximes Circulacions</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Sentit Ascendent</span>
                        <div className="text-2xl font-bold text-[#4D5358] dark:text-white flex items-center justify-between">
                          <span>{loc.nextAsc ? loc.nextAsc.id : '---'}</span>
                          {loc.nextAsc && <span className="text-sm font-medium text-gray-400">{loc.nextAsc.time}</span>}
                        </div>
                      </div>

                      <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Sentit Descendent</span>
                        <div className="text-2xl font-bold text-[#4D5358] dark:text-white flex items-center justify-between">
                          <span>{loc.nextDesc ? loc.nextDesc.id : '---'}</span>
                          {loc.nextDesc && <span className="text-sm font-medium text-gray-400">{loc.nextDesc.time}</span>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-10 pt-10 border-t border-gray-100 dark:border-white/5">
                    <div className="flex items-center gap-3 mb-6">
                      <Zap className="text-fgc-green" size={20} />
                      <h3 className="text-sm font-bold text-[#4D5358] dark:text-white uppercase tracking-tight">Velocitats i Limitacions</h3>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Màxima Tram</span>
                        <div className="text-2xl font-bold text-[#4D5358] dark:text-white">{loc.speedInfo?.maxSpeed} <span className="text-xs text-gray-400">km/h</span></div>
                      </div>

                      <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Inclinació (Pendent)</span>
                        <div className="text-2xl font-bold text-[#4D5358] dark:text-white flex items-center gap-1">
                          {loc.declivity !== undefined ? (
                            <>
                              {loc.declivity > 0 ? <ArrowUp size={18} className="text-red-500" /> : loc.declivity < 0 ? <ArrowDown size={18} className="text-green-500" /> : null}
                              {Math.abs(loc.declivity)} <span className="text-xs text-gray-400">‰</span>
                            </>
                          ) : '---'}
                        </div>
                      </div>

                      <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">ASC Normal</span>
                          <ArrowUp size={12} className="text-blue-500" />
                        </div>
                        <div className="text-2xl font-bold text-[#4D5358] dark:text-white">{loc.speedInfo?.ascNormal} <span className="text-xs text-gray-400">km/h</span></div>
                      </div>

                      <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">DESC Normal</span>
                          <ArrowDown size={12} className="text-orange-500" />
                        </div>
                        <div className="text-2xl font-bold text-[#4D5358] dark:text-white">{loc.speedInfo?.descNormal} <span className="text-xs text-gray-400">km/h</span></div>
                      </div>

                      <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Contravia (A/D)</span>
                        <div className="flex items-center gap-4">
                          <div className="text-lg font-bold text-[#4D5358] dark:text-white">{loc.speedInfo?.ascContravia} <span className="text-[10px] text-gray-400 font-normal">A</span></div>
                          <div className="w-px h-4 bg-gray-200 dark:bg-white/10" />
                          <div className="text-lg font-bold text-[#4D5358] dark:text-white">{loc.speedInfo?.descContravia} <span className="text-[10px] text-gray-400 font-normal">D</span></div>
                        </div>
                      </div>
                    </div>

                    {loc.speedInfo?.notes && (
                      <div className="mt-6 flex flex-col gap-2">
                        {loc.speedInfo.notes.map((noteObj: any, idx: number) => (
                          <div key={idx} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${noteObj.text ? 'bg-amber-500/5 border-amber-500/10' : 'bg-gray-50/50 dark:bg-white/5 border-gray-100 dark:border-white/5'}`}>
                            {noteObj.text ? (
                              <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                            ) : (
                              <Info size={14} className="text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
                            )}
                            <p className={`text-xs ${noteObj.text ? 'font-medium text-amber-700 dark:text-amber-400/80 italic' : 'text-gray-500 dark:text-gray-400'}`}>
                              <span className="font-bold mr-1">{noteObj.label}:</span>
                              {noteObj.text || 'Sense limitacions addicionals'}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </GlassPanel>
              )
            }

            if (group.type === 'unit_result') {
              const u = group;
              const gt = u.raw;
              const delayMin = Math.round(u.delaySeconds / 60);
              const trainPhone = getTrainPhone(u.decodedUt);

              // Gestió de temps: compte enrere (si està estacionat) o retard acumulat (si és tard, tant estacionat com en trajecte)
              let departureCountdown: string | null = null;
              let isCountdownInAdvance = false;
              let liveDelayBadge: string | null = null;
              let liveDelaySec = 0;

              const isAtStation = Boolean(u.scheduleComparison?.isAtStation);
              const depTimeStr = isAtStation
                ? (u.scheduleComparison?.departureExactTime || u.scheduleComparison?.estimatedTime || u.scheduleComparison?.officialTime)
                : (u.scheduleComparison?.estimatedTime || u.scheduleComparison?.officialTime || u.scheduleComparison?.departureExactTime);
              const theoreticalTimeStr = u.scheduleComparison?.officialTime;

              if (depTimeStr) {
                const targetMins = getFgcMinutes(depTimeStr);
                const theoreticalMins = theoreticalTimeStr ? getFgcMinutes(theoreticalTimeStr) : targetMins;
                if (targetMins !== null && typeof nowMin === 'number') {
                  const isAlreadyEstimated = depTimeStr === u.scheduleComparison?.estimatedTime;
                  const delayToAdd = (!isAlreadyEstimated && (u.scheduleComparison?.diffMinutes || 0) > 0) ? u.scheduleComparison.diffMinutes : 0;
                  const totalTargetMins = targetMins + delayToAdd;
                  const diffSec = Math.round((totalTargetMins - nowMin) * 60);

                  if (isAtStation && diffSec > 0 && diffSec < 24 * 3600) {
                    // Estacionat i encara no és l'hora de sortida: compte enrere
                    // Si l'hora actual d'estacionament és anterior a la teòrica (o està en avanç), es mostra en blau
                    isCountdownInAdvance = (theoreticalMins !== null && nowMin < theoreticalMins) || u.scheduleComparison?.timeStatus === 'avanc';

                    const m = Math.floor(diffSec / 60);
                    const s = diffSec % 60;
                    if (diffSec >= 3600) {
                      const h = Math.floor(diffSec / 3600);
                      const remM = Math.floor((diffSec % 3600) / 60);
                      departureCountdown = `-${h}:${remM.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                    } else {
                      departureCountdown = `-${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                    }
                  } else if (diffSec < 0 && Math.abs(diffSec) < 24 * 3600) {
                    // L'hora prevista/teòrica ja ha passat (sigui estacionat o en trajecte): retard acumulat (+)
                    liveDelaySec = Math.abs(diffSec);
                    const m = Math.floor(liveDelaySec / 60);
                    const s = liveDelaySec % 60;
                    if (liveDelaySec >= 3600) {
                      const h = Math.floor(liveDelaySec / 3600);
                      const remM = Math.floor((liveDelaySec % 3600) / 60);
                      liveDelayBadge = `+${h}:${remM.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                    } else {
                      liveDelayBadge = `+${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                    }
                  }
                }
              }

              // Llindar oficial de tolerància FGC:
              // - Fins a 3 min i 59 segons (<= 239s): Retard lleu -> Groc, text "En hora"
              // - Superior a 3 min i 59 segons (> 239s): Retard greu -> Vermell, text "Retard" (+X min retard)
              const hasLiveDelay = Boolean(liveDelayBadge);
              const totalDelaySeconds = liveDelaySec > 0
                ? liveDelaySec
                : (typeof u.delaySeconds === 'number' && u.delaySeconds > 0
                    ? u.delaySeconds
                    : ((u.scheduleComparison?.diffMinutes || 0) > 0 ? (u.scheduleComparison.diffMinutes * 60) : 0));

              const isSevereDelay = totalDelaySeconds > 239;
              const isMildDelay = totalDelaySeconds > 0 && !isSevereDelay;

              let effectiveDelayMin = delayMin;
              if (hasLiveDelay && depTimeStr && typeof nowMin === 'number') {
                const targetM = getFgcMinutes(depTimeStr);
                if (targetM !== null && nowMin > targetM) {
                  effectiveDelayMin = Math.max(1, Math.round(nowMin - targetM));
                }
              } else if (u.scheduleComparison?.diffMinutes) {
                effectiveDelayMin = Math.max(1, Math.abs(u.scheduleComparison.diffMinutes));
              }

              const headerStatusText = isSevereDelay
                ? `+${effectiveDelayMin} min retard`
                : (isMildDelay ? 'En hora' : (u.scheduleComparison?.timeStatusLabel || (u.isPunctual ? 'En hora (Puntual)' : `Retard +${effectiveDelayMin} min`)));

              const horarisStatusText = isSevereDelay
                ? 'Retard'
                : 'En hora';

              return (
                <GlassPanel key={idx} className="p-6 sm:p-10 !rounded-[40px] sm:!rounded-[56px] animate-in fade-in slide-in-from-bottom-12 duration-700 relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-fgc-green/5 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                  {/* Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div className="flex items-center gap-5">
                      <div className="min-w-[4.5rem] min-h-[4.5rem] bg-fgc-grey dark:bg-black text-white rounded-[28px] flex flex-col items-center justify-center shadow-lg px-3">
                        <TrainFront size={22} className="mb-0.5" />
                        <span className="text-lg font-black tracking-tighter leading-none">{u.decodedUt}</span>
                      </div>
                      <div>
                        <h2 className="text-2xl sm:text-3xl font-bold text-[#4D5358] dark:text-white tracking-tighter uppercase">Unitat {u.decodedUt}</h2>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                            isSevereDelay ? 'bg-red-500/20 text-red-500' :
                            isMildDelay ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' :
                            u.scheduleComparison?.timeStatus === 'avanc' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-fgc-green/20 text-fgc-green'
                          }`}>
                            <span className={`w-2 h-2 rounded-full ${
                              isSevereDelay ? 'bg-red-500' :
                              isMildDelay ? 'bg-yellow-500 dark:bg-yellow-400' :
                              u.scheduleComparison?.timeStatus === 'avanc' ? 'bg-blue-400' :
                              'bg-fgc-green'
                            } animate-pulse`} />
                            {headerStatusText}
                          </span>
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{gt.lin} · {gt.dir === 'A' ? 'Ascendent' : 'Descendent'}</span>
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 shadow-sm shrink-0" title="Actualització en viu cada 10s">
                            <RefreshCcw size={11} className={isAutoRefreshing ? "animate-spin text-fgc-green" : "text-gray-400"} />
                          </span>
                        </div>
                      </div>
                    </div>
                    {trainPhone && (
                      <a href={`tel:${trainPhone}`} className="flex items-center gap-2 px-5 py-3 bg-fgc-grey text-white rounded-2xl text-sm font-bold hover:bg-fgc-dark transition-all active:scale-95 shadow-lg">
                        <Phone size={16} />
                        {trainPhone}
                      </a>
                    )}
                  </div>

                  {/* Grid principal */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Columna izquierda: Circulació actual + Pròxima */}
                    <div className="space-y-4">
                      {/* Circulació actual */}
                      <div className="bg-gray-50 dark:bg-white/5 p-5 rounded-[24px] border border-gray-100 dark:border-white/5 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Activity size={12} className="text-red-500" />
                            Circulació Actual
                          </span>
                          <span className="px-2.5 py-1 bg-red-500 text-white text-[9px] font-black uppercase rounded-lg animate-pulse shadow-md">LIVE</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-3xl font-black text-[#4D5358] dark:text-white tracking-tighter font-mono">
                            {u.decodedCirc ? u.decodedCirc.fullName : gt.id?.split('|')[0] || '---'}
                          </span>
                          {u.decodedCirc && (
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold text-white ${getLiniaColor(u.decodedCirc.line)}`}>{u.decodedCirc.line}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-500 dark:text-gray-400">
                          <span className="uppercase">{resolveStationName(gt.origen) || gt.origen || '---'}</span>
                          <ArrowRight size={14} className="opacity-50 shrink-0" />
                          <span className="uppercase">{resolveStationName(gt.desti) || gt.desti || '---'}</span>
                        </div>

                        {/* Estació en la que està o en trajecte */}
                        <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white dark:bg-black/30 border border-gray-200/60 dark:border-white/10">
                          <div className={`p-1.5 rounded-xl shrink-0 ${u.scheduleComparison?.isAtStation ? "bg-fgc-green/20 text-fgc-green" : "bg-blue-500/20 text-blue-400"}`}>
                            <MapPin size={16} />
                          </div>
                          <div className="flex items-center min-w-0 flex-1">
                            {/* Versió Mòbil: "En [Sigla]" o "Cap a [Sigla]" */}
                            <span className="sm:hidden text-xs sm:text-sm font-black text-[#4D5358] dark:text-white uppercase tracking-tight font-mono">
                              {u.scheduleComparison?.mobileLocationText || u.scheduleComparison?.locationDisplayText || 'En circulació'}
                            </span>

                            {/* Versió Pantalles Grans: "Estacionat a [Nom]" o "En trajecte cap a [Nom]" */}
                            <span className="hidden sm:inline text-xs sm:text-sm font-black text-[#4D5358] dark:text-white uppercase tracking-tight truncate">
                              {u.scheduleComparison?.desktopLocationText || u.scheduleComparison?.locationDisplayText || 'En circulació'}
                            </span>
                          </div>
                          {u.scheduleComparison?.isAtStation ? (
                            <span className="px-2.5 py-1 rounded-md text-[9px] font-black uppercase bg-fgc-green/20 text-fgc-green border border-fgc-green/30 shrink-0">
                              Estacionat
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-md text-[9px] font-black uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
                              En trajecte
                            </span>
                          )}
                        </div>

                        {/* Horaris Teòric i Real (sense títol redundant) */}
                        <div className="p-3 rounded-2xl bg-white dark:bg-black/30 border border-gray-200/60 dark:border-white/10 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                              <Clock size={12} />
                              Horaris
                            </span>
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wide shrink-0 ${
                              isSevereDelay ? 'bg-red-500 text-white shadow-sm' :
                              isMildDelay ? 'bg-yellow-400 text-[#4D5358] shadow-sm' :
                              u.scheduleComparison?.timeStatus === 'avanc' ? 'bg-blue-600 text-white shadow-sm' :
                              'bg-fgc-green text-[#4D5358] shadow-sm'
                            }`}>
                              {horarisStatusText}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 dark:border-white/5">
                            <div>
                              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider block">
                                Teòric
                              </span>
                              <span className="text-base sm:text-lg font-black font-mono text-[#4D5358] dark:text-gray-200">
                                {formatTimeToHHMMSS(u.scheduleComparison?.officialTime) || '---'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider block">
                                Real / Previst
                              </span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-base sm:text-lg font-black font-mono ${
                                  u.scheduleComparison?.timeStatus === 'avanc' ? 'text-blue-400' :
                                  (isSevereDelay || isMildDelay) ? 'text-[#4D5358] dark:text-gray-200' :
                                  'text-fgc-green'
                                }`}>
                                  {formatTimeToHHMMSS(u.scheduleComparison?.estimatedTime) || '---'}
                                </span>
                                {departureCountdown && (
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-black font-mono shrink-0 ${
                                    isCountdownInAdvance
                                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                      : 'bg-fgc-green/20 text-fgc-green border border-fgc-green/30'
                                  }`} title="Compte enrere per a la sortida">
                                    <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isCountdownInAdvance ? 'bg-blue-400' : 'bg-fgc-green'}`} />
                                    {departureCountdown}
                                  </span>
                                )}
                                {liveDelayBadge && (
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-black font-mono shrink-0 shadow-sm ${
                                    isSevereDelay
                                      ? 'bg-red-500/20 text-red-500 border border-red-500/30'
                                      : 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30'
                                  }`} title={isSevereDelay ? "Retard acumulat" : "Retard lleu (En hora)"}>
                                    <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                                      isSevereDelay ? 'bg-red-500' : 'bg-yellow-500 dark:bg-yellow-400'
                                    }`} />
                                    {liveDelayBadge}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Pròxima circulació */}
                      <div className={`p-5 rounded-[24px] border space-y-3 ${u.nextCirculation ? 'bg-blue-50/50 dark:bg-blue-500/5 border-blue-100 dark:border-blue-500/10' : 'bg-gray-50 dark:bg-white/5 border-gray-100 dark:border-white/5'}`}>
                        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                          <Clock size={12} className="text-blue-500" />
                          Pròxima Circulació
                        </span>
                        {u.nextCirculation ? (
                          <>
                            <div className="flex items-center gap-4">
                              <span className="text-2xl font-black text-[#4D5358] dark:text-white tracking-tighter font-mono">{u.nextCirculation.codi}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-gray-500">
                              <span className="flex items-center gap-1.5 uppercase">{resolveStationName(u.nextCirculation.inici, u.linia) || u.nextCirculation.inici || '---'} <ArrowRight size={12} className="opacity-50" /> {resolveStationName(u.nextCirculation.final, u.linia) || u.nextCirculation.final || '---'}</span>
                              <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400"><Clock size={12} />{u.nextCirculation.sortida} — {u.nextCirculation.arribada}</span>
                            </div>
                          </>
                        ) : (
                          <p className="text-sm font-bold text-gray-400 italic">Última circulació del cicle</p>
                        )}
                      </div>
                    </div>

                    {/* Columna derecha: Torn / Cicle / Maquinista */}
                    <div className="space-y-4">
                      {/* Cicle i Torn */}
                      <div className="bg-gray-50 dark:bg-white/5 p-5 rounded-[24px] border border-gray-100 dark:border-white/5 space-y-4">
                        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Assignació</span>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Cicle</span>
                            {u.matchedCycleId ? (
                              <button onClick={() => handleCycleClick(u.matchedCycleId)} className="text-xl font-black text-fgc-green hover:underline cursor-pointer tracking-tight">{u.matchedCycleId}</button>
                            ) : (
                              <span className="text-xl font-bold text-gray-300 dark:text-gray-600">---</span>
                            )}
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Torn</span>
                            <span className="text-xl font-black text-[#4D5358] dark:text-white tracking-tight">{u.matchedShiftId || '---'}</span>
                          </div>
                        </div>
                        {u.shiftData && (
                          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-gray-500 pt-2 border-t border-gray-100 dark:border-white/5">
                            <Clock size={14} className="text-fgc-green" />
                            <span>{u.shiftData.inici_torn} — {u.shiftData.final_torn}</span>
                            <span className="text-gray-300 dark:text-gray-600">·</span>
                            <span>{u.shiftData.duracio}</span>
                            <span className="text-gray-300 dark:text-gray-600">·</span>
                            <MapPin size={12} />
                            <span className="uppercase">{u.shiftData.dependencia}</span>
                          </div>
                        )}
                      </div>

                      {/* Maquinista */}
                      <div className={`p-5 rounded-[24px] border space-y-3 ${u.driverData ? 'bg-fgc-green/10 border-fgc-green/20' : 'bg-gray-50 dark:bg-white/5 border-gray-100 dark:border-white/5'}`}>
                        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                          <User size={12} />
                          Maquinista
                        </span>
                        {u.driverData ? (
                          <div className="space-y-2">
                            <p className="text-lg font-bold text-[#4D5358] dark:text-white uppercase tracking-tight">
                              {u.driverData.cognoms}, {u.driverData.nom}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2.5 py-0.5 bg-fgc-grey text-white rounded-lg text-[10px] font-bold uppercase tracking-widest">
                                Nòmina: {u.driverData.empleat_id}
                              </span>
                              {u.driverData.observacions && (
                                <span className="text-[10px] font-bold text-gray-500 italic truncate max-w-[200px]">{u.driverData.observacions}</span>
                              )}
                            </div>
                            {u.driverData.phones?.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {u.driverData.phones.map((p: string, i: number) => (
                                  <a key={i} href={isPrivacyMode ? undefined : `tel:${p}`} className={`flex items-center gap-2 bg-fgc-grey text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-fgc-dark transition-all active:scale-95 ${isPrivacyMode ? 'cursor-default' : ''}`}>
                                    <Phone size={12} />
                                    {isPrivacyMode ? '*** ** ** **' : p}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm font-bold text-gray-400 italic">Sense maquinista assignat</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ocupació + Pròximes parades */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    {/* Ocupació */}
                    <div className="bg-gray-50 dark:bg-white/5 p-5 rounded-[24px] border border-gray-100 dark:border-white/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                          <Users size={12} /> Ocupació
                        </span>
                        {u.avgOccupation !== null && <span className="text-sm font-black text-[#4D5358] dark:text-white">{u.avgOccupation}%</span>}
                      </div>
                      {u.coaches.length > 0 ? (
                        <div className="grid grid-cols-4 gap-2">
                          {u.coaches.map((c: any) => (
                            <div key={c.name} className="space-y-1">
                              <div className="h-12 bg-white dark:bg-black/20 rounded-xl relative overflow-hidden border border-gray-100 dark:border-white/5">
                                <div className="absolute bottom-0 left-0 w-full bg-fgc-green/40 transition-all duration-1000" style={{ height: `${c.val}%` }} />
                                <div className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-[#4D5358] dark:text-white">{Math.round(c.val)}%</div>
                              </div>
                              <p className="text-[9px] font-bold text-center text-gray-400 uppercase">{c.name}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs font-bold text-gray-400 italic text-center py-2">Sense dades d'ocupació</p>
                      )}
                    </div>

                    {/* Pròximes parades */}
                    <div className="bg-gray-50 dark:bg-white/5 p-5 rounded-[24px] border border-gray-100 dark:border-white/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                          <MapPin size={12} /> Pròximes Parades
                        </span>
                        <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest font-mono">
                          H. Teòrica
                        </span>
                      </div>
                      {u.nextStops && u.nextStops.length > 0 ? (
                        <div className="space-y-1.5">
                          {u.nextStops.slice(0, 5).map((s: any, i: number) => {
                            const stCode = s.code || resolveStationId(s.parada, gt.lin) || s.parada;
                            const stName = s.nom || resolveStationName(s.parada, gt.lin) || s.parada;

                            let timeDisplay = s.horaTeorica;
                            if (!timeDisplay && u.officialStops) {
                              const matched = u.officialStops.find((os: any) => os.code === stCode);
                              if (matched?.hora) timeDisplay = formatTimeToHHMMSS(matched.hora);
                            }
                            if (!timeDisplay && s.hora_prevista) {
                              timeDisplay = formatTimeToHHMMSS(s.hora_prevista);
                            }

                            return (
                              <div key={i} className="flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-white/60 dark:hover:bg-white/5 transition-colors">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <div className={`w-2 h-2 rounded-full shrink-0 ${i === 0 ? 'bg-fgc-green animate-pulse' : 'bg-gray-300 dark:bg-gray-600'}`} />
                                  
                                  {/* Vista telèfon: sigles de l'estació */}
                                  <span className="sm:hidden font-mono font-black text-sm text-[#4D5358] dark:text-white uppercase tracking-tight">
                                    {stCode}
                                  </span>

                                  {/* Vista pantalla gran: nom complet de l'estació */}
                                  <span className="hidden sm:inline font-bold text-sm text-[#4D5358] dark:text-white uppercase truncate">
                                    {stName}
                                  </span>
                                </div>

                                {/* Hora teòrica de pas */}
                                <span className="text-xs font-black font-mono text-gray-500 dark:text-gray-400 shrink-0 ml-2">
                                  {timeDisplay || '---'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs font-bold text-gray-400 italic text-center py-2">Sense dades de parades</p>
                      )}
                    </div>
                  </div>

                  {/* Cicle cronograma (mini) */}
                  {u.cycleCirculations.length > 1 && (
                    <div className="mt-6 pt-6 border-t border-gray-100 dark:border-white/5">
                      <div className="flex items-center gap-2 mb-4">
                        <RefreshCcw size={14} className="text-fgc-green" />
                        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">
                          Cronograma del Cicle {u.matchedCycleId}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {u.cycleCirculations.map((cc: any, ci: number) => {
                          const isCurrent = cc.codi?.toUpperCase() === u.circCode;
                          const isPast = getFgcMinutes(cc.arribada || '00:00') < nowMin && !isCurrent;
                          return (
                            <div key={ci} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                              isCurrent
                                ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20 scale-105'
                                : isPast
                                  ? 'bg-gray-100 dark:bg-white/5 text-gray-300 dark:text-gray-600 border-gray-100 dark:border-white/5 line-through'
                                  : 'bg-white dark:bg-white/5 text-[#4D5358] dark:text-gray-200 border-gray-100 dark:border-white/10'
                            }`}>
                              <span className="font-mono font-black">{cc.codi}</span>
                              <span className="text-[9px] opacity-70">{cc.sortida}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Footer técnico */}
                  <div className="mt-6 pt-4 border-t border-gray-100 dark:border-white/5 flex flex-wrap items-center gap-4 text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                    <div className="flex items-center gap-1.5 opacity-60">
                      <Info size={10} />
                      Font: GeoTren Dades Obertes FGC
                    </div>
                    <div className="flex items-center gap-1.5 text-fgc-green">
                      <RefreshCcw size={10} className={isAutoRefreshing ? "animate-spin" : ""} />
                      <span>Actualització automàtica cada 10s</span>
                    </div>
                    {gt.ut && (
                      <div className="opacity-40">
                        UT HEX: {gt.ut}
                      </div>
                    )}
                    <div className="opacity-40">
                      ID SIRTRAN: {gt.id?.split('|')[0]}
                    </div>
                  </div>
                </GlassPanel>
              );
            }

            const currentStatus = getShiftCurrentStatus(group, idx);
            const shiftStartMin = getFgcMinutes(group.inici_torn);
            const isShiftStartedOrFinished = shiftStartMin !== null && nowMin >= shiftStartMin;
            const shiftPunctuality = isShiftStartedOrFinished ? getPunctualityBadge(shiftPunctualityMap[group.id]) : null;

            return (
              <div key={idx} className="flex flex-col gap-1 group animate-in fade-in slide-in-from-bottom-12 duration-700">
                <GlassPanel className="p-6 sm:p-10 !rounded-t-[32px] sm:!rounded-t-[48px] !rounded-b-none relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-fgc-green/30 to-transparent shimmer" />
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 flex-1">
                      <div className="w-full sm:w-auto flex items-center justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-3">
                            <h2 className="text-xl sm:text-3xl font-bold text-[#4D5358] dark:text-white tracking-tighter uppercase leading-tight">Torn {group.id}</h2>
                            {group.drivers.length > 1 && (
                              <div className="flex gap-2">
                                <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase flex items-center gap-1"><Users size={10} /> Compartit ({group.drivers.length})</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-white/5 text-gray-500 rounded-lg text-[10px] font-bold uppercase border border-gray-200/50"><Timer size={12} /> {group.duracio}</div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-white/5 text-gray-500 rounded-lg text-[10px] font-bold uppercase border border-gray-200/50"><MapPin size={12} /> {group.dependencia}</div>
                          </div>
                        </div>

                        {/* Mòbil (< lg): Puntualitat a la dreta del torn amb text a sobre de la píndola */}
                        {shiftPunctuality && (
                          <div 
                            className="flex flex-col items-center lg:hidden flex-shrink-0"
                            title="Percentatge de puntualitat oficial FGC de les circulacions realitzades en aquest torn avui"
                          >
                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-0.5">
                              Puntualitat
                            </span>
                            <div className={`px-2.5 py-0.5 rounded-xl text-sm font-black tabular-nums border shadow-2xs ${shiftPunctuality.badgeClass}`}>
                              {shiftPunctuality.text}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5 text-base sm:text-xl font-bold text-fgc-green bg-fgc-green/5 px-4 py-2 rounded-xl border border-fgc-green/10 whitespace-nowrap">
                        <Clock size={20} /><span>{group.inici_torn}</span><span className="opacity-30 mx-1">—</span><span>{group.final_torn}</span>
                      </div>
                      <button onClick={() => scrollToElement(currentStatus.targetId)} className={`px-5 py-2.5 rounded-2xl text-[10px] sm:text-xs font-bold shadow-md border-b-4 border-black/10 transition-all ${currentStatus.color}`}>{currentStatus.label}</button>
                    </div>

                    {/* DRETA (Desktop >= lg): Indicador de puntualitat complet */}
                    {shiftPunctuality && (
                      <div 
                        className="hidden lg:flex items-center gap-3 self-center bg-gray-50/80 dark:bg-white/[0.03] px-3.5 py-2 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-2xs flex-shrink-0"
                        title="Percentatge de puntualitat oficial FGC de les circulacions realitzades en aquest torn avui"
                      >
                        <div className="flex flex-col text-right">
                          <span className="text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider">
                            Puntualitat
                          </span>
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                            {shiftPunctuality.total > 0 ? `${shiftPunctuality.onTime}/${shiftPunctuality.total} passos` : 'Sense registres'}
                          </span>
                        </div>
                        <div className={`px-2.5 py-1 rounded-xl text-base sm:text-xl font-black tabular-nums border shadow-2xs ${shiftPunctuality.badgeClass}`}>
                          {shiftPunctuality.text}
                        </div>
                      </div>
                    )}
                  </div>
                </GlassPanel>
                <div className="bg-fgc-green divide-y divide-white/20 border-x border-fgc-green/20 shadow-sm overflow-hidden">
                  {group.drivers.map((driver: any, dIdx: number) => {
                    const isWorking = group.drivers.length > 1 && isDriverWorkingNow(driver.observacions);
                    return (
                      <div key={dIdx} className={`p-6 sm:p-10 transition-all relative ${driver.isCovering ? 'bg-emerald-950 text-white shadow-[inset_0_0_40px_rgba(0,0,0,0.2)]' : 'hover:bg-white/5'}`}>
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 sm:gap-10">
                          <div className="flex items-center gap-6 sm:gap-8 w-full md:w-auto">
                            <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center border-2 shrink-0 transition-colors ${driver.isCovering ? 'bg-fgc-green text-emerald-950 border-fgc-green shadow-lg shadow-fgc-green/20' : 'bg-white/40 dark:bg-black/20 text-[#4D5358] border-white/60'}`}>{driver.isCovering ? <RefreshCcw size={26} strokeWidth={2.5} /> : group.drivers.length > 1 ? <span className="font-bold text-lg">{dIdx + 1}</span> : <User size={28} strokeWidth={2.5} />}</div>
                            <div className="space-y-1 min-w-0 flex-1 md:flex-none">
                              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                <MarqueeText text={`${driver.cognoms}, ${driver.nom}`} className={`text-xl sm:text-2xl font-bold tracking-tight leading-tight uppercase ${driver.isCovering ? 'text-white' : 'text-[#4D5358]'}`} />
                                {driver.tipus_torn && (<span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase shadow-sm border ${driver.tipus_torn === 'Reducció' ? 'bg-purple-600 text-white border-purple-700' : 'bg-blue-600 text-white border-blue-700'}`}>{driver.tipus_torn}</span>)}
                                {driver.isCovering && (<span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase shadow-lg bg-amber-500 text-white border-amber-400 flex items-center gap-1.5 animate-pulse-subtle"><RefreshCcw size={10} strokeWidth={3} />COBREIX DES DE {driver.torn}</span>)}
                                {isWorking && (<div className="bg-fgc-grey text-white px-3 py-1 rounded-full text-[9px] font-bold uppercase flex items-center gap-1.5 shadow-sm animate-bounce"><div className="w-1.5 h-1.5 bg-fgc-green rounded-full animate-pulse" />TREBALLANT</div>)}
                              </div>
                              <div className="flex flex-wrap gap-2 items-center"><div className={`inline-flex items-center px-2.5 py-0.5 rounded-lg font-bold text-[9px] sm:text-[10px] tracking-widest uppercase ${driver.isCovering ? 'bg-white/10 text-emerald-50 border border-white/10' : 'bg-fgc-grey text-white'}`}>Nómina: {driver.nomina}</div>{driver.abs_parc_c === 'S' && <span className="bg-red-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">ABS</span>}{driver.dta === 'S' && <span className="bg-blue-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">DTA</span>}{driver.dpa === 'S' && <span className="bg-purple-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">DPA</span>}</div>
                              {driver.observacions && (<div className={`flex items-start gap-2 px-3 py-2 rounded-xl border max-w-lg mt-2 ${driver.isCovering ? 'bg-white/5 border-white/10 shadow-inner' : 'bg-black/10 dark:bg-black/20 border-black/5'}`}><Info size={14} className={`${driver.isCovering ? 'text-emerald-400' : 'text-[#4D5358] dark:text-gray-300'} mt-0.5 shrink-0`} /><p className={`text-[11px] sm:text-xs font-bold ${driver.isCovering ? 'text-emerald-50/80' : 'text-[#4D5358] dark:text-gray-200'} leading-snug italic`}>{driver.observacions}</p></div>)}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:gap-3 w-full md:w-auto">{driver.phones?.map((p: string, i: number) => (<a key={i} href={isPrivacyMode ? undefined : `tel:${p}`} className={`flex-1 md:flex-none flex items-center justify-center gap-2.5 bg-fgc-grey text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-bold hover:bg-fgc-dark transition-all active:scale-95 ${isPrivacyMode ? 'cursor-default' : ''}`}><Phone size={14} />{isPrivacyMode ? '*** ** ** **' : p}</a>))}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <GlassPanel className="p-4 sm:p-10 !rounded-b-[32px] sm:!rounded-b-[48px] !rounded-t-none overflow-hidden relative">
                  <ShiftTimeline turn={group} nowMin={nowMin} trainStatuses={trainStatuses} getLiniaColor={getLiniaColor} openUnitMenu={openUnitMenu} getStatusColor={getStatusColor} />
                  <div className="border border-gray-100 dark:border-white/5 rounded-[32px] overflow-hidden bg-white dark:bg-black/20 shadow-sm mb-4">
                    <CirculationHeader />
                    <div className="flex flex-col divide-y divide-gray-100 dark:divide-white/5">
                      {group.fullCirculations?.[0] && (<TimeGapRow from={group.inici_torn} to={group.fullCirculations[0].sortida} id={`gap-pre-${idx}`} nowMin={nowMin} />)}
                      {group.fullCirculations?.map((circ: any, cIdx: number) => {
                        const shiftItemKey = `${idx}-${cIdx}`;
                        const isActive = checkIfActive(circ.sortida as string, circ.arribada as string, nowMin);
                        return (
                          <React.Fragment key={cIdx}>
                            <div id={`circ-row-${shiftItemKey}`} className={`flex flex-col relative scroll-mt-24 ${isActive ? 'ring-2 ring-inset ring-red-600 z-10' : ''}`}>
                              <CirculationRow circ={circ} itemKey={shiftItemKey} nowMin={nowMin} trainStatuses={trainStatuses} getTrainPhone={getTrainPhone} getLiniaColor={getLiniaColor} openUnitMenu={openUnitMenu} toggleItinerari={toggleItinerari} isPrivacyMode={isPrivacyMode} passengerInfo={passengerInfoMap[circ.codi] || []} onCycleClick={handleCycleClick} />
                              {expandedItinerari === shiftItemKey && (
                                <div className="p-4 sm:p-10 bg-white dark:bg-fgc-grey border-t border-gray-100 dark:border-white/5 animate-in slide-in-from-top-4 duration-500 overflow-hidden">
                                  <div className="relative flex flex-col pl-8 sm:pl-16 pr-2 sm:pr-6 py-4 space-y-0">
                                    <div className="absolute left-[15px] sm:left-[29px] top-10 bottom-10 w-0.5 sm:w-1 bg-gray-100 dark:bg-gray-800 rounded-full" />
                                    {[{ nom: circ.inici, hora: circ.sortida, via: circ.via_inici }, ...(circ.estacions?.map((st: any) => ({ nom: st.nom, hora: st.hora || st.sortida || st.arribada, via: st.via })) || []), { nom: circ.final, hora: circ.arribada, via: circ.via_final }].map((point, pIdx, arr) => (
                                      <ItineraryPoint key={pIdx} point={point} isFirst={pIdx === 0} isLast={pIdx === arr.length - 1} nextPoint={arr[pIdx + 1]} nowMin={nowMin} />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            <TimeGapRow from={circ.arribada} to={group.fullCirculations?.[cIdx + 1]?.sortida || group.final_torn} id={`gap-row-${idx}-${cIdx}`} nowMin={nowMin} />
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                </GlassPanel>
              </div>
            );
          })
        ) : !loading && (query.length >= 1 || (searchType === SearchType.Estacio && selectedStation)) ? (
          <div className="bg-white dark:bg-fgc-grey rounded-[32px] py-20 text-center text-gray-400 flex flex-col items-center gap-6"><div className="w-24 h-24 bg-gray-50 dark:bg-black/20 rounded-full flex items-center justify-center text-gray-100"><Search size={48} /></div><div className="space-y-2"><p className="text-xl font-bold text-[#4D5358] uppercase">No s'han trobat dades</p><p className="text-sm font-medium">Revisa els paràmetres de cerca.</p></div></div>
        ) : !loading && (
          <div className="text-center py-24 opacity-10 flex flex-col items-center"><Train size={80} className="text-[#4D5358] mb-8" /><p className="text-lg font-bold uppercase tracking-[0.4em] text-[#4D5358]">Consulta de Torns Activa</p></div>
        )
        }
      </div>

      {
        editingCirc && createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-fgc-grey/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white dark:bg-fgc-grey w-full rounded-[48px] shadow-2xl border border-white/20 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 max-w-md">
              <div className="p-8 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-fgc-green rounded-2xl text-[#4D5358] shadow-lg"><Train size={24} /></div>
                  <div><h3 className="text-xl font-bold text-[#4D5358] dark:text-white uppercase tracking-tight">Gestió d'Unitat</h3><p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Circulació {editingCirc.circ.codi} • Cicle {editingCirc.cycleId}</p></div>
                </div>
                <button onClick={() => setEditingCirc(null)} className="p-2 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 rounded-full transition-colors"><X size={24} /></button>
              </div>
              <div className="p-8 space-y-8">
                <div className="space-y-2"><label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">Assignar Unitat de Tren</label><div className="relative"><Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} /><input type="text" value={editUnitNumber} onChange={(e) => setEditUnitNumber(e.target.value)} placeholder="Ex: 112.01, 113.12..." className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-4 focus:ring-fgc-green/20 outline-none font-bold text-lg transition-all dark:text-white" /></div></div>
                <div className="space-y-4"><label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">Estat de la Flota</label><div className="grid grid-cols-2 gap-3">{[{ id: 'is_broken', label: 'AVARIAT', icon: <AlertTriangle size={16} />, color: 'red' }, { id: 'needs_images', label: 'IMATGES', icon: <Camera size={16} />, color: 'blue' }, { id: 'needs_records', label: 'REGISTRES', icon: <FileText size={16} />, color: 'yellow' }, { id: 'needs_cleaning', label: 'NETEJA', icon: <Brush size={16} />, color: 'orange' },].map((st) => (<button key={st.id} onClick={() => setTempStatus(prev => ({ ...prev, [st.id]: !prev[st.id as keyof typeof prev] }))} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all font-bold text-[11px] ${tempStatus[st.id as keyof typeof tempStatus] ? `bg-${st.color}-50 dark:bg-${st.color}-900/20 border-${st.color}-500 text-${st.color}-600 dark:text-${st.color}-400 shadow-sm` : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-white/5 text-gray-400 dark:text-gray-500 grayscale'}`}>{st.icon}{st.label}{tempStatus[st.id as keyof typeof tempStatus] && <Check size={14} />}</button>))}</div></div>
                <button onClick={saveUnitChanges} disabled={isSavingUnit} className="w-full bg-fgc-green text-[#4D5358] py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-xl shadow-fgc-green/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all">{isSavingUnit ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}DESAR CANVIS</button>
              </div>
            </div>
          </div>,
          document.body
        )
      }
      {pkMapTarget && createPortal(
        <PkSegmentMap result={pkMapTarget} onClose={() => setPkMapTarget(null)} />,
        document.body
      )}
    </div>
  );
};



export const CercarView = React.memo(CercarViewComponent);
export default CercarView;