import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  X, Phone, Mail, Clock, Train, MapPin, Activity, 
  CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, 
  User, Calendar, ExternalLink, ShieldCheck, Coffee, 
  Sparkles, Navigation, Layers, ChevronDown, ChevronUp,
  Info
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { fetchFullTurns } from '../utils/queries';
import { 
  getFgcMinutes, 
  formatFgcTime, 
  getCandidateShiftIds, 
  getShortTornId, 
  resolveStationId,
  getLiniaColorHex,
  formatDelayMinSec
} from '../utils/stations';
import { getFgcServiceDate } from '../utils/gipRecorder';
import { STATION_GEO_MAP } from '../utils/stationGeoData';
import { useServiceToday } from '../utils/useServiceToday';
import { feedback } from '../utils/feedback';
import { saveAgentPerformanceRecord, getAgentPerformanceHistory } from '../utils/agentPerformanceService';
import type { GipRegistrePas, AgentPerformanceHistory } from '../types';

interface AgentDetailModalProps {
  agent: any;
  contact: { phones: string[]; email: string | null };
  isPrivacyMode: boolean;
  onClose: () => void;
  onNavigateToSearch?: (type: string, query: string) => void;
}

const resolveStationName = (codeOrName: string, linia: string = ''): string => {
  if (!codeOrName) return '';
  const trimmed = codeOrName.trim();
  const code = resolveStationId(trimmed, linia);
  const geo = STATION_GEO_MAP.get(code);
  if (geo?.name) return geo.name;
  return trimmed;
};


export const AgentDetailModal: React.FC<AgentDetailModalProps> = ({
  agent,
  contact,
  isPrivacyMode,
  onClose,
  onNavigateToSearch
}) => {
  const [shiftData, setShiftData] = useState<any | null>(null);
  const [gipPassages, setGipPassages] = useState<GipRegistrePas[]>([]);
  const [loadingShift, setLoadingShift] = useState(true);
  const [loadingGip, setLoadingGip] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('00:00:00');
  const [nowMin, setNowMin] = useState<number>(0);
  const [expandedCircId, setExpandedCircId] = useState<string | null>(null);
  const [historyRecords, setHistoryRecords] = useState<AgentPerformanceHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isHistorySaved, setIsHistorySaved] = useState(false);
  const [showHistorySection, setShowHistorySection] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);
  const lastSavedKeyRef = useRef<string>('');

  const todayService = useServiceToday();

  // Update clock every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      setCurrentTimeStr(timeStr);
      const mins = getFgcMinutes(timeStr);
      if (mins !== null) setNowMin(mins);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard escape listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Load shift and GIP data
  const loadAgentShiftAndGip = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setLoadingShift(true);
      setLoadingGip(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const rawTorn = (agent?.torn || '').trim();
      const obsMatch = (agent.observacions || '').match(/(?:COBREIX\s+|TORN\s+)(Q?\d+[A-Z]?)/i)
        || (agent.observacions || '').match(/\b(Q[A-Z0-9]+)\b/i);
      const obsTorn = obsMatch ? obsMatch[1].toUpperCase() : null;

      const isSpecialNonShift = ['VAC', 'DES', 'DIS', 'DAG', 'AJN', 'S/A'].some(p => rawTorn.toUpperCase().startsWith(p));
      const targetTorn = (!isSpecialNonShift ? rawTorn : (obsTorn || rawTorn));

      let resolvedShift: any = null;

      if (targetTorn && (!isSpecialNonShift || obsTorn)) {
        const cleanTorn = targetTorn.toUpperCase();
        const numMatch = cleanTorn.match(/\d+/);
        const num = numMatch ? numMatch[0] : '';
        const numPadded = num.padStart(3, '0');

        const prefixes = ['1', '0', '4', '5'];
        const candidatePool = Array.from(new Set([
          cleanTorn,
          `Q${cleanTorn}`,
          ...(obsTorn ? [obsTorn, `Q${obsTorn}`] : []),
          ...prefixes.map(p => `Q${p}${numPadded}`),
          ...prefixes.map(p => `Q${p}${num}`),
          `Q${numPadded}`,
          num,
          ...getCandidateShiftIds(cleanTorn, todayService)
        ])).filter(Boolean);

        // 1. Query Supabase shifts table directly with all candidate IDs
        let { data: foundShifts } = await supabase
          .from('shifts')
          .select('*')
          .in('id', candidatePool);

        // Fallback: search by substring if not found directly
        if (!foundShifts || foundShifts.length === 0) {
          if (num) {
            let fallbackQ = supabase.from('shifts').select('*');
            if (todayService && todayService !== 'Tots') {
              fallbackQ = fallbackQ.eq('servei', todayService);
            }
            fallbackQ = fallbackQ.ilike('id', `%${num}%`);
            const { data: ilikeShifts } = await fallbackQ;
            foundShifts = ilikeShifts;
          }
        }

        // Pick best shift from DB (prioritize matching service with circulations)
        const bestDbShift = foundShifts?.find(s => s.servei === todayService && s.circulations?.length > 0)
          || foundShifts?.find(s => s.circulations?.length > 0)
          || foundShifts?.[0];

        if (bestDbShift) {
          // Enrich with fetchFullTurns using ONLY this exact single ID!
          const enrichedList = await fetchFullTurns([bestDbShift.id], bestDbShift.servei || todayService);
          const fullEnriched = enrichedList.find(s => s.id === bestDbShift.id && s.fullCirculations?.length > 0)
            || enrichedList.find(s => s.fullCirculations?.length > 0)
            || enrichedList[0];

          if (fullEnriched) {
            resolvedShift = {
              ...bestDbShift,
              ...fullEnriched,
              fullCirculations: (fullEnriched.fullCirculations && fullEnriched.fullCirculations.length > 0)
                ? fullEnriched.fullCirculations
                : (bestDbShift.circulations || [])
            };
          } else {
            resolvedShift = {
              ...bestDbShift,
              fullCirculations: bestDbShift.circulations || []
            };
          }
        }
      }

      // Fallback: virtual shift representation if not in DB shifts
      if (!resolvedShift) {
        resolvedShift = {
          id: targetTorn || 'S/A',
          servei: todayService,
          inici_torn: agent.hora_inici || '--:--',
          final_torn: agent.hora_fi || '--:--',
          dependencia: agent.dependencia || '',
          fullCirculations: [],
          circulations: []
        };
      }

      setShiftData(resolvedShift);

      // Load GIP passages for all circulations in this shift
      const circCodes: string[] = Array.from(new Set(
        (resolvedShift.fullCirculations || [])
          .map((c: any) => typeof c === 'string' ? c : (c.codi || c.realCodi || c.id))
          .filter((c: string) => c && c !== 'Viatger')
      ));

      if (circCodes.length > 0) {
        const serviceDate = getFgcServiceDate();

        // Query STRICTLY for today's service date!
        const { data: passages, error: gipErr } = await supabase
          .from('gip_registre_pas')
          .select('*')
          .eq('data_servei', serviceDate)
          .in('circulacio_id', circCodes);

        if (!gipErr && passages) {
          setGipPassages(passages as GipRegistrePas[]);
        } else {
          setGipPassages([]);
        }
      } else {
        setGipPassages([]);
      }
    } catch (e) {
      console.error('[AgentDetailModal] Error carregant dades del torn/GIP:', e);
    } finally {
      setLoadingShift(false);
      setLoadingGip(false);
      setIsRefreshing(false);
    }
  }, [agent, todayService]);

  useEffect(() => {
    loadAgentShiftAndGip();
  }, [loadAgentShiftAndGip]);

  // Periodic background refresh every 20 seconds for live data
  useEffect(() => {
    const timer = setInterval(() => {
      loadAgentShiftAndGip(true);
    }, 20000);
    return () => clearInterval(timer);
  }, [loadAgentShiftAndGip]);

  // 1. Live Real-time Status Calculation ("On està en aquest moment si està treballant")
  const liveStatus = useMemo(() => {
    if (!agent) return null;

    const tornCode = (agent.torn || '').trim();
    const isSpecialNonShift = ['VAC', 'DES', 'DIS', 'DAG', 'AJN', 'S/A'].some(p => tornCode.startsWith(p));

    if (isSpecialNonShift) {
      return {
        phase: 'NOT_WORKING' as const,
        title: 'Sense servei actiu avui',
        badgeText: tornCode,
        badgeClass: 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300 border-gray-200 dark:border-white/10',
        description: `L'agent figura en situació de ${tornCode} a la graella de servei diària.`,
        locationText: 'Fora de servei / No programat',
        sublocation: 'Sense circulacions assignades per a la jornada',
        isWorking: false,
        activeCirc: null,
        progress: null
      };
    }

    const shiftStartMin = getFgcMinutes(shiftData?.inici_torn || agent.hora_inici);
    const shiftEndMin = getFgcMinutes(shiftData?.final_torn || agent.hora_fi);

    if (shiftStartMin === null || shiftEndMin === null) {
      return {
        phase: 'UNKNOWN' as const,
        title: 'Horari no especificat',
        badgeText: 'Sense horari',
        badgeClass: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300 border-gray-200',
        description: 'No s\'han pogut determinar les hores d\'inici i finalització del torn.',
        locationText: 'Ubicació no disponible',
        sublocation: 'Sense dades horàries',
        isWorking: false,
        activeCirc: null,
        progress: null
      };
    }

    // A) Upcoming / Before shift start
    if (nowMin < shiftStartMin) {
      const diff = Math.round(shiftStartMin - nowMin);
      const hours = Math.floor(diff / 60);
      const mins = diff % 60;
      const timeStr = hours > 0 ? `${hours}h ${mins}min` : `${mins} min`;
      const depName = resolveStationName(shiftData?.dependencia) || shiftData?.dependencia || 'Estació inicial';

      return {
        phase: 'UPCOMING' as const,
        title: 'Torn pendent d\'iniciar',
        badgeText: 'Pendent d\'inici',
        badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
        description: `El torn comença a les ${shiftData?.inici_torn || agent.hora_inici} (falten ${timeStr}).`,
        locationText: `Previst a dependència: ${depName}`,
        sublocation: `Hora d'inici programada: ${shiftData?.inici_torn || agent.hora_inici}`,
        isWorking: false,
        activeCirc: null,
        progress: 0
      };
    }

    // B) Finished / After shift end
    if (nowMin >= shiftEndMin) {
      const depName = resolveStationName(shiftData?.dependencia) || shiftData?.dependencia || 'Dependència';
      return {
        phase: 'FINISHED' as const,
        title: 'Torn finalitzat',
        badgeText: 'Completat',
        badgeClass: 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-400 border-gray-200 dark:border-white/10',
        description: `La jornada ha finalitzat a les ${shiftData?.final_torn || agent.hora_fi}.`,
        locationText: `Finalitzat a dependència: ${depName}`,
        sublocation: `Hora fi de torn: ${shiftData?.final_torn || agent.hora_fi}`,
        isWorking: false,
        activeCirc: null,
        progress: 100
      };
    }

    // C) Actively Working!
    const circs = (shiftData?.fullCirculations || []).map((c: any) => {
      const sMin = getFgcMinutes(c.sortida);
      const eMin = getFgcMinutes(c.arribada);
      return { ...c, sMin, eMin };
    }).filter((c: any) => c.sMin !== null && c.eMin !== null)
      .sort((a: any, b: any) => a.sMin - b.sMin);

    // C1: In active circulation
    const activeCirc = circs.find((c: any) => nowMin >= c.sMin && nowMin <= c.eMin);

    if (activeCirc) {
      const stops = (activeCirc.estacions || [])
        .map((st: any) => ({
          code: resolveStationId(st.nom || st.id || st.codi, activeCirc.linia),
          nom: resolveStationName(st.nom || st.id || st.codi, activeCirc.linia),
          min: getFgcMinutes(st.hora || st.sortida || st.arribada)
        }))
        .filter((st: any) => st.min !== null)
        .sort((a: any, b: any) => a.min - b.min);

      let locationText = `En trajecte a la línia ${activeCirc.linia || 'FGC'}`;
      let sublocation = `De ${resolveStationName(activeCirc.inici)} a ${resolveStationName(activeCirc.final)}`;
      let nextStopName = resolveStationName(activeCirc.final);
      let nextStopTime = activeCirc.arribada;

      if (stops.length > 0) {
        const passed = stops.filter((st: any) => nowMin >= st.min);
        const upcoming = stops.filter((st: any) => nowMin < st.min);

        if (upcoming.length > 0) {
          const nextStop = upcoming[0];
          const prevStop = passed.length > 0 ? passed[passed.length - 1] : { nom: resolveStationName(activeCirc.inici), min: activeCirc.sMin };
          nextStopName = nextStop.nom;
          nextStopTime = formatFgcTime(nextStop.min);

          if (Math.abs(nowMin - nextStop.min) <= 0.6) {
            locationText = `A l'estació de ${nextStop.nom}`;
            sublocation = `Parada programada a les ${nextStopTime}`;
          } else if (prevStop) {
            locationText = `Entre ${prevStop.nom} i ${nextStop.nom}`;
            sublocation = `Pròxima parada: ${nextStop.nom} a les ${nextStopTime}`;
          }
        } else {
          locationText = `Arribant a ${resolveStationName(activeCirc.final)}`;
          sublocation = `Arribada final prevista a les ${activeCirc.arribada}`;
        }
      }

      const circDuration = activeCirc.eMin - activeCirc.sMin;
      const circProgress = circDuration > 0 
        ? Math.min(100, Math.max(0, ((nowMin - activeCirc.sMin) / circDuration) * 100))
        : 50;

      return {
        phase: 'DRIVING' as const,
        title: 'En servei · Conduint tren ara',
        badgeText: `Tren ${activeCirc.codi}`,
        badgeClass: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 border-emerald-400',
        description: `Conduint la circulació ${activeCirc.codi} (${activeCirc.linia || 'FGC'}) de ${resolveStationName(activeCirc.inici)} cap a ${resolveStationName(activeCirc.final)}.`,
        locationText,
        sublocation,
        isWorking: true,
        activeCirc,
        nextStopName,
        nextStopTime,
        cycle: activeCirc.cicle,
        trainUnit: activeCirc.train,
        progress: circProgress
      };
    }

    // C2: In Break / Rest / Station Waiting between circulations
    const previousCircs = circs.filter((c: any) => nowMin > c.eMin);
    const upcomingCircs = circs.filter((c: any) => nowMin < c.sMin);

    const lastCirc = previousCircs.length > 0 ? previousCircs[previousCircs.length - 1] : null;
    const nextCirc = upcomingCircs.length > 0 ? upcomingCircs[0] : null;

    const restStation = lastCirc 
      ? resolveStationName(lastCirc.final) 
      : (resolveStationName(shiftData?.dependencia) || 'Dependència');

    let sublocation = '';
    if (nextCirc) {
      const waitMin = Math.round(nextCirc.sMin - nowMin);
      sublocation = `Propera circulació: ${nextCirc.codi} a les ${nextCirc.sortida} cap a ${resolveStationName(nextCirc.final)} (${waitMin} minuts)`;
    } else {
      sublocation = `Esperant la finalització del torn a les ${shiftData?.final_torn || agent.hora_fi}.`;
    }

    return {
      phase: 'BREAK' as const,
      title: 'En repòs / descans actiu',
      badgeText: 'Descans',
      badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
      description: `L'agent es troba en pausa reglamentària a ${restStation}.`,
      locationText: `Estacionat a ${restStation}`,
      sublocation,
      isWorking: true,
      activeCirc: null,
      nextCirc,
      lastCirc,
      progress: 50
    };
  }, [agent, shiftData, nowMin]);

  // 2. Individual Circulation Punctuality breakdown
  const circPunctualityList = useMemo(() => {
    if (!shiftData?.fullCirculations) return [];

    return shiftData.fullCirculations.map((c: any) => {
      const codi = (c.codi === 'Viatger' && c.realCodi) ? c.realCodi : (c.codi || c.realCodi);
      const sMin = getFgcMinutes(c.sortida);
      const eMin = getFgcMinutes(c.arribada);

      // Determine real-time status strictly based on scheduled time
      let status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' = 'PENDING';
      if (sMin !== null && eMin !== null) {
        if (nowMin >= eMin) {
          status = 'COMPLETED';
        } else if (nowMin >= sMin && nowMin < eMin) {
          status = 'IN_PROGRESS';
        } else {
          status = 'PENDING';
        }
      }

      // If circulation has not started yet (PENDING), it has NO passages yet today
      const cPassages = status === 'PENDING'
        ? []
        : gipPassages.filter(p => p.circulacio_id === codi || (c.realCodi && p.circulacio_id === c.realCodi) || (c.codi && p.circulacio_id === c.codi));

      const totalStops = cPassages.length;
      const onTimeStops = cPassages.filter(p => p.estat === 'en_hora' || p.estat === 'avanc').length;
      const delayedStops = cPassages.filter(p => p.estat === 'retard');

      const rate = totalStops > 0 ? Number(((onTimeStops / totalStops) * 100).toFixed(1)) : null;

      const maxDelaySec = delayedStops.length > 0 
        ? Math.max(...delayedStops.map(p => p.diferencia_segons || 0)) 
        : 0;

      return {
        circulation: c,
        codi,
        linia: c.linia || (codi?.startsWith('F') ? 'S2' : (codi?.startsWith('D') ? 'S1' : 'FGC')),
        inici: c.inici,
        final: c.final,
        sortida: c.sortida,
        arribada: c.arribada,
        cicle: c.cicle,
        train: c.train,
        status,
        totalStops,
        onTimeStops,
        delayedStopsCount: delayedStops.length,
        delayedStopsList: delayedStops,
        rate,
        maxDelaySec
      };
    });
  }, [shiftData, gipPassages, nowMin]);

  // 3. Shift Global Punctuality Summary
  const overallPunctuality = useMemo(() => {
    const shiftStartMin = getFgcMinutes(shiftData?.inici_torn || agent?.hora_inici);
    const isShiftStarted = shiftStartMin !== null && nowMin >= shiftStartMin;

    // Only circulations that have actually started or completed can contribute to punctuality
    const activeOrCompletedCircs = isShiftStarted 
      ? circPunctualityList.filter(cp => cp.status !== 'PENDING')
      : [];

    const activeOrCompletedCodes = new Set(activeOrCompletedCircs.map(cp => cp.codi));

    const relevantPassages = isShiftStarted 
      ? gipPassages.filter(p => activeOrCompletedCodes.has(p.circulacio_id))
      : [];

    const totalPassages = relevantPassages.length;
    const onTimePassages = relevantPassages.filter(p => p.estat === 'en_hora' || p.estat === 'avanc').length;
    const delayedPassages = relevantPassages.filter(p => p.estat === 'retard');

    const rate = (isShiftStarted && totalPassages > 0)
      ? Number(((onTimePassages / totalPassages) * 100).toFixed(1))
      : null;

    const maxDelaySec = delayedPassages.length > 0 
      ? Math.max(...delayedPassages.map(p => p.diferencia_segons || 0)) 
      : 0;

    const avgDelaySec = delayedPassages.length > 0
      ? Math.round(delayedPassages.reduce((acc, p) => acc + (p.diferencia_segons || 0), 0) / delayedPassages.length)
      : 0;

    const completedCircs = isShiftStarted ? circPunctualityList.filter(cp => cp.status === 'COMPLETED').length : 0;
    const inProgressCircs = isShiftStarted ? circPunctualityList.filter(cp => cp.status === 'IN_PROGRESS').length : 0;
    const pendingCircs = circPunctualityList.length - completedCircs - inProgressCircs;

    return {
      isShiftStarted,
      rate,
      totalPassages,
      onTimePassages,
      delayedCount: delayedPassages.length,
      maxDelaySec,
      avgDelaySec,
      totalCircs: circPunctualityList.length,
      completedCircs,
      inProgressCircs,
      pendingCircs
    };
  }, [circPunctualityList, gipPassages, shiftData, agent, nowMin]);

  // 4. Carrega l'històric de rendiment de Supabase per aquest agent
  const loadAgentHistory = useCallback(async (isSilent = false) => {
    if (!agent?.empleat_id) return;
    if (!isSilent) setLoadingHistory(true);
    try {
      const records = await getAgentPerformanceHistory(agent.empleat_id);
      setHistoryRecords(records);
    } catch (e) {
      console.error('[AgentDetailModal] Error carregant històric:', e);
    } finally {
      if (!isSilent) setLoadingHistory(false);
    }
  }, [agent?.empleat_id]);

  useEffect(() => {
    loadAgentHistory(false);
  }, [loadAgentHistory]);

  // 5. Desa automàticament el rendiment i puntualitat a la taula 'agent_performance_history' de Supabase només quan canvia
  useEffect(() => {
    if (loadingShift || loadingGip || !agent?.empleat_id) return;

    const rawTorn = (agent?.torn || '').trim().toUpperCase();
    const isSpecialNonShift = ['VAC', 'DES', 'DIS', 'DAG', 'AJN', 'S/A'].some(p => rawTorn.startsWith(p));
    if (isSpecialNonShift) return;

    const currentTorn = shiftData?.id || rawTorn;
    if (!currentTorn) return;

    const serviceDate = getFgcServiceDate();

    // Clau única per evitar re-desats innecessaris en bucle
    const saveKey = `${serviceDate}-${agent.empleat_id}-${currentTorn}-${overallPunctuality.rate}-${overallPunctuality.completedCircs}-${overallPunctuality.totalPassages}-${overallPunctuality.delayedCount}`;
    if (lastSavedKeyRef.current === saveKey) return;

    const timeout = setTimeout(() => {
      lastSavedKeyRef.current = saveKey;

      const record: AgentPerformanceHistory = {
        data_servei: serviceDate,
        empleat_id: String(agent.empleat_id).trim(),
        nom: agent.nom || '',
        cognoms: agent.cognoms || '',
        torn: currentTorn,
        servei: shiftData?.servei || todayService || '',
        dependencia: shiftData?.dependencia || agent.dependencia || '',
        hora_inici: shiftData?.inici_torn || agent.hora_inici || '',
        hora_fi: shiftData?.final_torn || agent.hora_fi || '',
        puntualitat_percentatge: overallPunctuality.rate,
        passos_totals: overallPunctuality.totalPassages,
        passos_en_hora: overallPunctuality.onTimePassages,
        passos_retard: overallPunctuality.delayedCount,
        retard_maxim_segons: overallPunctuality.maxDelaySec,
        retard_mitja_segons: overallPunctuality.avgDelaySec,
        circulacions_totals: overallPunctuality.totalCircs,
        circulacions_completades: overallPunctuality.completedCircs,
        circulacions_en_curs: overallPunctuality.inProgressCircs,
        circulacions_pendents: overallPunctuality.pendingCircs,
        detall_circulacions: circPunctualityList.map(c => ({
          codi: c.codi,
          linia: c.linia,
          inici: c.inici,
          final: c.final,
          sortida: c.sortida,
          arribada: c.arribada,
          status: c.status,
          totalStops: c.totalStops,
          onTimeStops: c.onTimeStops,
          delayedStopsCount: c.delayedStopsCount,
          rate: c.rate,
          maxDelaySec: c.maxDelaySec
        })),
        estat_torn: !overallPunctuality.isShiftStarted
          ? 'NO_INICIAT'
          : (overallPunctuality.completedCircs === overallPunctuality.totalCircs && overallPunctuality.totalCircs > 0)
            ? 'COMPLETAT'
            : 'EN_CURS'
      };

      saveAgentPerformanceRecord(record).then(res => {
        if (res.success) {
          setIsHistorySaved(true);
          loadAgentHistory(true);
        }
      });
    }, 1200);

    return () => clearTimeout(timeout);
  }, [
    loadingShift,
    loadingGip,
    agent?.empleat_id,
    agent?.nom,
    agent?.cognoms,
    agent?.torn,
    agent?.dependencia,
    agent?.hora_inici,
    agent?.hora_fi,
    shiftData?.id,
    shiftData?.servei,
    shiftData?.dependencia,
    shiftData?.inici_torn,
    shiftData?.final_torn,
    overallPunctuality.rate,
    overallPunctuality.completedCircs,
    overallPunctuality.totalPassages,
    overallPunctuality.delayedCount,
    overallPunctuality.isShiftStarted,
    todayService,
    loadAgentHistory
  ]);

  const getPunctualityColor = (rate: number | null) => {
    if (rate === null) return 'text-gray-400 bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10';
    if (rate >= 95) return 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30';
    if (rate >= 85) return 'text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/30';
    return 'text-red-700 bg-red-50 dark:bg-red-500/10 dark:text-red-400 border-red-200 dark:border-red-500/30';
  };

  const isAssigned = agent.torn && !['FOR', 'DIS', 'DES', 'VAC', 'DAG', 'AJN', 'S/A'].some((p: string) => agent.torn.startsWith(p));
  const isFOR = agent.torn?.startsWith('FOR');
  const isDIS = agent.torn?.startsWith('DIS');
  const isDES = agent.torn?.startsWith('DES');

  return (
    <div 
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-[#1E2124] border border-gray-100 dark:border-white/10 rounded-[32px] sm:rounded-[40px] shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow ambient accent */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-fgc-green/10 dark:bg-fgc-green/5 blur-[100px] pointer-events-none -mr-32 -mt-32" />

        {/* ── HEADER MODAL ── */}
        <div className="p-6 sm:p-8 border-b border-gray-100 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10 bg-white/50 dark:bg-[#1E2124]/50 backdrop-blur-sm">
          <div className="flex items-start sm:items-center gap-4 sm:gap-6 min-w-0">
            {/* Avatar */}
            <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-[24px] sm:rounded-[28px] flex items-center justify-center font-black text-2xl sm:text-3xl shadow-xl shrink-0 ${
              isAssigned ? 'bg-blue-600 text-white' :
              isFOR ? 'bg-yellow-500 text-white' :
              isDIS ? 'bg-orange-500 text-white' :
              isDES ? 'bg-fgc-green text-[#4D5358]' :
              'bg-fgc-grey dark:bg-black text-white'
            }`}>
              {agent.cognoms?.charAt(0) || agent.nom?.charAt(0) || 'A'}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400">
                  #{agent.empleat_id}
                </span>

                {agent.tipus_torn && (
                  <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase border shrink-0 ${
                    agent.tipus_torn === 'Reducció'
                      ? 'bg-purple-600 text-white border-purple-700'
                      : 'bg-blue-600 text-white border-blue-700'
                  }`}>
                    {agent.tipus_torn === 'Reducció' ? 'REDUCCIÓ' : 'TORN'}
                  </span>
                )}

                {agent.abs_parc_c === 'S' && <span className="bg-red-50 text-red-600 text-[8px] font-bold px-2 py-0.5 rounded border border-red-100">ABS</span>}
                {agent.dta === 'S' && <span className="bg-blue-50 text-blue-600 text-[8px] font-bold px-2 py-0.5 rounded border border-blue-100">DTA</span>}
                {agent.dpa === 'S' && <span className="bg-purple-50 text-purple-600 text-[8px] font-bold px-2 py-0.5 rounded border border-purple-100">DPA</span>}

                {/* Shift pill */}
                <div className={`px-3 py-1 rounded-xl text-xs font-black shadow-sm uppercase ${
                  isAssigned ? 'bg-blue-600 text-white' :
                  isFOR ? 'bg-yellow-500 text-white' :
                  isDIS ? 'bg-orange-500 text-white' :
                  isDES ? 'bg-fgc-green text-[#4D5358]' :
                  'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-300'
                }`}>
                  TORN {agent.torn}
                </div>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-[#4D5358] dark:text-white leading-tight uppercase tracking-tight truncate">
                {agent.cognoms}, {agent.nom}
              </h2>

              <p className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-2">
                <span>Servei d'avui: {shiftData?.servei ? `S-${shiftData.servei}` : `S-${todayService}`}</span>
                <span>•</span>
                <span className="font-mono text-fgc-green">{currentTimeStr}</span>
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 sm:self-start">
            <button
              onClick={() => {
                feedback.click();
                loadAgentShiftAndGip(true);
              }}
              title="Actualitzar dades ara"
              className="p-3 rounded-2xl bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-300 border border-gray-100 dark:border-white/5 transition-all"
            >
              <RefreshCw size={18} className={isRefreshing ? 'animate-spin text-fgc-green' : ''} />
            </button>

            {onNavigateToSearch && agent.torn && (
              <button
                onClick={() => {
                  feedback.click();
                  onClose();
                  onNavigateToSearch('torn', agent.torn);
                }}
                title="Cercar aquest torn a la vista general"
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-fgc-green text-[#4D5358] font-bold text-xs shadow-md shadow-fgc-green/20 hover:scale-105 active:scale-95 transition-all"
              >
                <ExternalLink size={14} />
                <span className="hidden sm:inline">Veure Torn</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-3 rounded-2xl bg-gray-50 dark:bg-white/5 hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 border border-gray-100 dark:border-white/5 transition-all"
              title="Tancar finestra"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── MODAL SCROLLABLE BODY ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 sm:space-y-8 no-scrollbar">

          {/* 1. ON ESTÀ EN AQUEST MOMENT SI ESTÀ TREBALLANT (REAL-TIME STATUS) */}
          {liveStatus && (
            <div className={`rounded-[32px] p-6 sm:p-7 border relative overflow-hidden transition-all ${
              liveStatus.phase === 'DRIVING'
                ? 'bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/40 shadow-xl shadow-emerald-500/5 ring-2 ring-emerald-500/20'
                : liveStatus.phase === 'BREAK'
                  ? 'bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/30'
                  : 'bg-gray-50/70 dark:bg-black/20 border-gray-100 dark:border-white/5'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-2xl ${
                    liveStatus.phase === 'DRIVING' ? 'bg-emerald-500 text-white' :
                    liveStatus.phase === 'BREAK' ? 'bg-amber-500 text-white' :
                    'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-300'
                  }`}>
                    {liveStatus.phase === 'DRIVING' ? <Navigation size={22} className="animate-pulse" /> :
                     liveStatus.phase === 'BREAK' ? <Coffee size={22} /> :
                     <Clock size={22} />}
                  </div>

                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">
                      Ubicació i estat en temps real
                    </span>
                    <h3 className="text-lg sm:text-xl font-black text-[#4D5358] dark:text-white flex items-center gap-2">
                      {liveStatus.title}
                      {liveStatus.phase === 'DRIVING' && (
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                      )}
                    </h3>
                  </div>
                </div>

                <div className={`px-4 py-1.5 rounded-xl font-bold text-xs border self-start sm:self-auto ${liveStatus.badgeClass}`}>
                  {liveStatus.badgeText}
                </div>
              </div>

              {/* Exact position details */}
              <div className="space-y-3 bg-white dark:bg-gray-800/80 rounded-2xl p-4 sm:p-5 border border-gray-100 dark:border-white/5 shadow-sm">
                <div className="flex items-center gap-3">
                  <MapPin className="text-fgc-green shrink-0" size={20} />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-[#4D5358] dark:text-white leading-snug">
                      {liveStatus.locationText}
                    </p>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">
                      {liveStatus.sublocation}
                    </p>
                  </div>
                </div>

                {/* Progress bar if driving */}
                {liveStatus.phase === 'DRIVING' && liveStatus.progress !== null && (
                  <div className="space-y-1.5 pt-2">
                    <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      <span>Progrés del trajecte</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-mono">{Math.round(liveStatus.progress)}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 dark:bg-black/40 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-fgc-green rounded-full transition-all duration-1000"
                        style={{ width: `${liveStatus.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Assigned train unit and cycle tags */}
                {(liveStatus.trainUnit || liveStatus.cycle) && (
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-white/5">
                    {liveStatus.trainUnit && (
                      <span className="px-3 py-1 bg-gray-100 dark:bg-white/10 rounded-xl font-mono font-bold text-xs text-[#4D5358] dark:text-gray-200 flex items-center gap-1.5">
                        <Train size={12} className="text-fgc-green" />
                        UT {liveStatus.trainUnit}
                      </span>
                    )}
                    {liveStatus.cycle && (
                      <span className="px-3 py-1 bg-gray-100 dark:bg-white/10 rounded-xl font-bold text-xs text-gray-600 dark:text-gray-300">
                        Cicle {liveStatus.cycle}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. PUNTUALITAT DEL MAQUINISTA (TOTAL TORN + KPI SUMMARY) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  Rendiment Operatiu
                </span>
                <h3 className="text-xl font-black text-[#4D5358] dark:text-white tracking-tight flex items-center gap-2">
                  <Activity className="text-fgc-green" size={22} />
                  Puntualitat del Torn
                </h3>
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                {isHistorySaved && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-emerald-200 dark:border-emerald-500/20 shadow-xs animate-in fade-in">
                    <CheckCircle2 size={13} />
                    Històric guardat a Supabase
                  </span>
                )}
                {overallPunctuality.isShiftStarted && overallPunctuality.totalPassages > 0 ? (
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">
                    {overallPunctuality.totalPassages} registres oficials GIP
                  </span>
                ) : !overallPunctuality.isShiftStarted ? (
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 rounded-xl border border-blue-200 dark:border-blue-500/20">
                    Inici programat a les {shiftData?.inici_torn || agent.hora_inici}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Bento Grid KPI Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {/* Card 1: Percentatge Puntualitat */}
              <div className="bg-white dark:bg-gray-800 rounded-[28px] p-5 border border-gray-100 dark:border-white/5 shadow-sm flex flex-col justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Puntualitat Total
                </span>
                <div className="my-2">
                  <span className={`text-3xl sm:text-4xl font-black font-mono tracking-tight ${
                    overallPunctuality.rate === null ? 'text-gray-400' :
                    overallPunctuality.rate >= 95 ? 'text-emerald-600 dark:text-emerald-400' :
                    overallPunctuality.rate >= 85 ? 'text-amber-600 dark:text-amber-400' :
                    'text-red-600 dark:text-red-400'
                  }`}>
                    {overallPunctuality.rate !== null ? `${overallPunctuality.rate}%` : '--%'}
                  </span>
                </div>
                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 truncate">
                  {!overallPunctuality.isShiftStarted 
                    ? 'Torn no iniciat'
                    : overallPunctuality.totalPassages > 0 
                      ? `${overallPunctuality.onTimePassages} de ${overallPunctuality.totalPassages} a temps` 
                      : 'Sense dades de pas'}
                </span>
              </div>

              {/* Card 2: Passos amb Retard */}
              <div className="bg-white dark:bg-gray-800 rounded-[28px] p-5 border border-gray-100 dark:border-white/5 shadow-sm flex flex-col justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Passos amb Retard
                </span>
                <div className="my-2">
                  <span className={`text-3xl sm:text-4xl font-black font-mono tracking-tight ${
                    overallPunctuality.delayedCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {overallPunctuality.delayedCount}
                  </span>
                </div>
                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 truncate">
                  {!overallPunctuality.isShiftStarted
                    ? 'Torn pendent d\'inici'
                    : overallPunctuality.delayedCount > 0 
                      ? `Màx: +${formatDelayMinSec(overallPunctuality.maxDelaySec)}` 
                      : '0 retards registrats'}
                </span>
              </div>

              {/* Card 3: Circulacions Completades */}
              <div className="bg-white dark:bg-gray-800 rounded-[28px] p-5 border border-gray-100 dark:border-white/5 shadow-sm flex flex-col justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Circulacions
                </span>
                <div className="my-2">
                  <span className="text-3xl sm:text-4xl font-black font-mono text-[#4D5358] dark:text-white tracking-tight">
                    {overallPunctuality.completedCircs}
                    <span className="text-lg text-gray-400 font-normal">/{overallPunctuality.totalCircs}</span>
                  </span>
                </div>
                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 truncate">
                  {!overallPunctuality.isShiftStarted
                    ? 'Cap circulació iniciada'
                    : overallPunctuality.inProgressCircs > 0
                      ? `${overallPunctuality.inProgressCircs} en curs ara`
                      : 'Completades del torn'}
                </span>
              </div>

              {/* Card 4: Retard Mitjà */}
              <div className="bg-white dark:bg-gray-800 rounded-[28px] p-5 border border-gray-100 dark:border-white/5 shadow-sm flex flex-col justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Retard Mitjà
                </span>
                <div className="my-2">
                  <span className="text-3xl sm:text-4xl font-black font-mono text-[#4D5358] dark:text-white tracking-tight">
                    {overallPunctuality.avgDelaySec > 0 ? `+${formatDelayMinSec(overallPunctuality.avgDelaySec)}` : '0s'}
                  </span>
                </div>
                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 truncate">
                  {!overallPunctuality.isShiftStarted
                    ? 'Servei no iniciat'
                    : overallPunctuality.delayedCount > 0
                      ? 'En punts de control'
                      : 'Servei impecable'}
                </span>
              </div>
            </div>

            {/* Accordion / Card: Històric de Rendiment Guardat a Supabase */}
            <div className="bg-white dark:bg-gray-800 rounded-[28px] border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden transition-all">
              <button
                onClick={() => setShowHistorySection(!showHistorySection)}
                className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm sm:text-base font-black text-[#4D5358] dark:text-white uppercase tracking-tight">
                        Històric de Rendiment de l'Agent
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs font-bold border border-blue-200 dark:border-blue-500/20">
                        {historyRecords.length} {historyRecords.length === 1 ? 'jornada' : 'jornades'} a Supabase
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                      Consulta el registre històric de puntualitat, retards i circulacions guardat a Supabase
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  <span className="text-xs font-bold hidden sm:inline">{showHistorySection ? 'Amagar' : 'Mostrar'}</span>
                  {showHistorySection ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </button>

              {showHistorySection && (
                <div className="p-4 sm:p-6 border-t border-gray-100 dark:border-white/5 space-y-3 bg-gray-50/30 dark:bg-black/10 animate-in slide-in-from-top-2 duration-300">
                  {loadingHistory && historyRecords.length === 0 ? (
                    <div className="py-8 text-center text-gray-400 flex flex-col items-center gap-2">
                      <RefreshCw size={20} className="animate-spin text-fgc-green" />
                      <span className="text-xs font-bold">Carregant històric de Supabase...</span>
                    </div>
                  ) : historyRecords.length === 0 ? (
                    <div className="py-6 text-center text-gray-400">
                      <p className="text-xs font-medium">Encara no hi ha registres d'altres jornades guardats per aquest agent a la base de dades.</p>
                      <p className="text-[11px] text-gray-500 mt-1">El registre d'avui s'està guardant automàticament.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {historyRecords.map((rec) => {
                        const isExpanded = expandedHistoryId === rec.id;
                        const rate = rec.puntualitat_percentatge !== null ? Number(rec.puntualitat_percentatge) : null;
                        return (
                          <div 
                            key={rec.id}
                            className="bg-white dark:bg-[#25282c] border border-gray-100 dark:border-white/5 rounded-2xl p-4 transition-all hover:border-gray-200 dark:hover:border-white/10"
                          >
                            <div 
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                              onClick={() => setExpandedHistoryId(isExpanded ? null : (rec.id || null))}
                            >
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 font-mono text-xs font-bold">
                                  {rec.data_servei}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-sm text-[#4D5358] dark:text-white">
                                      Torn {rec.torn}
                                    </span>
                                    {rec.servei && (
                                      <span className="text-[10px] uppercase font-bold text-gray-400 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5">
                                        {rec.servei}
                                      </span>
                                    )}
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                      rec.estat_torn === 'COMPLETAT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800' :
                                      rec.estat_torn === 'EN_CURS' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800' :
                                      'bg-gray-100 text-gray-600 border-gray-200 dark:bg-white/5 dark:text-gray-400 dark:border-white/10'
                                    }`}>
                                      {rec.estat_torn}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-gray-400 mt-0.5">
                                    {rec.hora_inici} - {rec.hora_fi} · {rec.dependencia || 'FGC'}
                                  </p>
                                </div>
                              </div>

                              {/* Metrics summary */}
                              <div className="flex items-center gap-2.5 flex-wrap sm:justify-end">
                                {/* Rate pill */}
                                <span className={`px-3 py-1 rounded-xl text-xs font-mono font-black border ${
                                  rate === null ? 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-white/5 dark:text-gray-400 dark:border-white/10' :
                                  rate >= 95 ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800' :
                                  rate >= 85 ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800' :
                                  'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800'
                                }`}>
                                  {rate !== null ? `${rate}%` : '--%'}
                                </span>

                                {/* Circulations completed */}
                                <span className="text-xs font-mono text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 px-2.5 py-1 rounded-xl border border-gray-100 dark:border-white/5 font-bold">
                                  {rec.circulacions_completades}/{rec.circulacions_totals} circ.
                                </span>

                                {/* Delay */}
                                {rec.passos_retard > 0 && (
                                  <span className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2 py-1 rounded-xl border border-red-100 dark:border-red-900/40">
                                    {rec.passos_retard} retards (màx: +{formatDelayMinSec(rec.retard_maxim_segons)})
                                  </span>
                                )}

                                <div className="text-gray-400 ml-1">
                                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </div>
                              </div>
                            </div>

                            {/* Expanded Details of the historical day */}
                            {isExpanded && rec.detall_circulacions && rec.detall_circulacions.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/5 space-y-1.5 animate-in fade-in duration-200">
                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-2">
                                  Circulacions realitzades el {rec.data_servei}:
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {rec.detall_circulacions.map((c: any, cIdx: number) => (
                                    <div key={cIdx} className="p-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/5 flex items-center justify-between text-xs">
                                      <div>
                                        <span className="font-mono font-bold text-[#4D5358] dark:text-white mr-2">
                                          {c.codi}
                                        </span>
                                        <span className="text-gray-400">
                                          {c.sortida} → {c.arribada}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        {c.rate !== null ? (
                                          <span className={`font-mono font-bold text-[11px] ${
                                            c.rate >= 95 ? 'text-emerald-600 dark:text-emerald-400' :
                                            c.rate >= 85 ? 'text-amber-600 dark:text-amber-400' :
                                            'text-red-600 dark:text-red-400'
                                          }`}>
                                            {c.rate}%
                                          </span>
                                        ) : (
                                          <span className="text-gray-400 text-[10px]">--</span>
                                        )}
                                        {c.delayedStopsCount > 0 && (
                                          <span className="text-red-500 font-bold text-[10px]">
                                            (+{formatDelayMinSec(c.maxDelaySec)})
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 3. DESGLOSSAMENT DE CIRCULACIONS DEL TORN I PUNTUALITAT PER CIRCULACIÓ */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  Puntualitat per circulació
                </span>
                <h3 className="text-xl font-black text-[#4D5358] dark:text-white tracking-tight flex items-center gap-2">
                  <Train className="text-fgc-green" size={22} />
                  Circulacions del Torn ({circPunctualityList.length})
                </h3>
              </div>
            </div>

            {loadingShift ? (
              <div className="p-12 text-center text-gray-400 font-bold flex flex-col items-center gap-3">
                <RefreshCw size={28} className="animate-spin text-fgc-green" />
                <span>Carregant circulacions i dades de pas...</span>
              </div>
            ) : circPunctualityList.length > 0 ? (
              <div className="space-y-3">
                {circPunctualityList.map((item, idx) => {
                  const isExpanded = expandedCircId === item.codi;
                  const liniaColor = getLiniaColorHex(item.linia);

                  return (
                    <div 
                      key={item.codi || idx}
                      className={`bg-white dark:bg-gray-800 rounded-[24px] sm:rounded-[28px] border transition-all duration-300 overflow-hidden ${
                        item.status === 'IN_PROGRESS' 
                          ? 'border-emerald-500/40 shadow-lg ring-2 ring-emerald-500/10' 
                          : 'border-gray-100 dark:border-white/5 hover:border-fgc-green/30'
                      }`}
                    >
                      {/* Circulation Header Summary Row */}
                      <div 
                        className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none"
                        onClick={() => setExpandedCircId(isExpanded ? null : item.codi)}
                      >
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                          {/* Line badge */}
                          <div 
                            className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm text-white shrink-0 shadow-md"
                            style={{ backgroundColor: liniaColor }}
                          >
                            {item.linia}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-base text-[#4D5358] dark:text-white">
                                {item.codi}
                              </span>

                              {/* Status tag */}
                              {item.status === 'IN_PROGRESS' && (
                                <span className="px-2 py-0.5 rounded-lg bg-emerald-500 text-white text-[9px] font-black uppercase animate-pulse">
                                  En curs
                                </span>
                              )}
                              {item.status === 'COMPLETED' && (
                                <span className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 text-[9px] font-bold uppercase">
                                  Finalitzada
                                </span>
                              )}
                              {item.status === 'PENDING' && (
                                <span className="px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[9px] font-bold uppercase">
                                  Pendent
                                </span>
                              )}

                              {item.train && (
                                <span className="hidden sm:inline font-mono text-[10px] text-gray-400 dark:text-gray-500 font-bold">
                                  UT {item.train}
                                </span>
                              )}
                            </div>

                            {/* Itinerary */}
                            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 mt-0.5">
                              {item.inici || item.final ? (
                                <>
                                  <span className="truncate">{resolveStationName(item.inici) || item.inici || 'Origen'}</span>
                                  <ArrowRight size={12} className="text-fgc-green shrink-0" />
                                  <span className="truncate">{resolveStationName(item.final) || item.final || 'Destinació'}</span>
                                </>
                              ) : item.codi === 'Viatger' ? (
                                <span className="italic text-gray-400">Trasllat com a viatger</span>
                              ) : (
                                <span className="italic text-gray-400">Maniobra o moviment intern</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Punctuality Indicator */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-gray-50 dark:border-white/5">
                          <div className="text-right">
                            <div className="flex items-center gap-1.5 sm:justify-end">
                              <Clock size={12} className="text-fgc-green" />
                              <span className="font-mono text-xs font-bold text-[#4D5358] dark:text-gray-300">
                                {item.sortida} — {item.arribada}
                              </span>
                            </div>

                            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 mt-0.5">
                              {item.totalStops > 0 
                                ? `${item.totalStops} controls GIP` 
                                : item.status === 'PENDING' ? 'Encara no iniciada' : 'Sense dades GIP'}
                            </p>
                          </div>

                          <div className={`px-3 py-1.5 rounded-xl font-mono font-black text-xs border ${getPunctualityColor(item.rate)}`}>
                            {item.rate !== null ? `${item.rate}%` : '--%'}
                          </div>

                          <div className="p-1 text-gray-400">
                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </div>
                        </div>
                      </div>

                      {/* Expandable GIP Passages Detail */}
                      {isExpanded && (
                        <div className="px-4 pb-4 sm:px-6 sm:pb-6 pt-2 border-t border-dashed border-gray-100 dark:border-white/5 space-y-3 bg-gray-50/50 dark:bg-black/10">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">
                              Detall de passos per estació
                            </span>
                            {item.delayedStopsCount > 0 && (
                              <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded-lg border border-red-200 dark:border-red-500/20">
                                {item.delayedStopsCount} incidències de retard
                              </span>
                            )}
                          </div>

                          {item.delayedStopsList.length > 0 ? (
                            <div className="space-y-1.5">
                              {item.delayedStopsList.map((stop: any, sIdx: number) => (
                                <div 
                                  key={sIdx}
                                  className="flex items-center justify-between p-2.5 rounded-xl bg-red-50/70 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-xs font-semibold"
                                >
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle size={14} className="text-red-500 shrink-0" />
                                    <span className="text-[#4D5358] dark:text-gray-200 font-bold">
                                      {resolveStationName(stop.estacio_nom || stop.estacio_codi, item.linia)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 font-mono text-[11px]">
                                    <span className="text-gray-400">Teòric: {stop.hora_teorica}</span>
                                    <span className="text-red-600 dark:text-red-400 font-bold">
                                      +{formatDelayMinSec(stop.diferencia_segons)} retard
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : item.totalStops > 0 ? (
                            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                              <CheckCircle2 size={16} />
                              Tots els passos s'han realitzat amb puntualitat estricta (100% en hora).
                            </div>
                          ) : item.status === 'PENDING' ? (
                            <div className="p-3 rounded-xl bg-gray-100/50 dark:bg-white/5 text-xs font-medium text-gray-400 dark:text-gray-500 text-center">
                              Aquesta circulació encara no ha iniciat el seu trajecte (sortida prevista a les {item.sortida}). Els passos es registraran en temps real un cop en servei.
                            </div>
                          ) : (
                            <div className="p-3 rounded-xl bg-gray-100/50 dark:bg-white/5 text-xs font-medium text-gray-400 dark:text-gray-500 text-center">
                              No hi ha registres de pas capturats per aquesta circulació.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 bg-gray-50 dark:bg-white/5 rounded-3xl text-center border border-dashed border-gray-100 dark:border-white/5">
                <Info size={28} className="mx-auto text-gray-400 mb-2" />
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
                  Aquest agent no té circulacions programades avui ({agent.torn}).
                </p>
              </div>
            )}
          </div>

          {/* 4. DADES DEL TORN I CONTACTE DIRECTE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Fitxa del torn */}
            <div className="bg-white dark:bg-gray-800 rounded-[28px] p-6 border border-gray-100 dark:border-white/5 shadow-sm space-y-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">
                Fitxa Tècnica del Torn
              </span>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-gray-400 dark:text-gray-500">Codi de Torn:</span>
                  <span className="font-bold text-[#4D5358] dark:text-white uppercase font-mono">{agent.torn}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-gray-400 dark:text-gray-500">Horari del Torn:</span>
                  <span className="font-bold text-[#4D5358] dark:text-white font-mono">
                    {agent.hora_inici || shiftData?.inici_torn || '--:--'} — {agent.hora_fi || shiftData?.final_torn || '--:--'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-gray-400 dark:text-gray-500">Dependència:</span>
                  <span className="font-bold text-[#4D5358] dark:text-white">
                    {resolveStationName(shiftData?.dependencia) || shiftData?.dependencia || 'Sense dependència'}
                  </span>
                </div>

                {agent.observacions && (
                  <div className="pt-2 border-t border-gray-100 dark:border-white/5">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">Observacions diàries:</span>
                    <p className="text-xs font-semibold text-[#4D5358] dark:text-gray-300 mt-0.5 italic">
                      {agent.observacions}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Dades de Contacte */}
            <div className="bg-white dark:bg-gray-800 rounded-[28px] p-6 border border-gray-100 dark:border-white/5 shadow-sm space-y-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">
                Contacte Directe de l'Agent
              </span>

              <div className="space-y-3">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">Telèfon(s):</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {contact.phones && contact.phones.length > 0 ? (
                      contact.phones.map((phone, pIdx) => (
                        <a
                          key={pIdx}
                          href={isPrivacyMode ? undefined : `tel:${phone}`}
                          onClick={(e) => isPrivacyMode && e.preventDefault()}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                            isAssigned ? 'bg-blue-600 text-white hover:bg-blue-700' :
                            isFOR ? 'bg-yellow-500 text-white hover:bg-yellow-600' :
                            isDIS ? 'bg-orange-500 text-white hover:bg-orange-600' :
                            isDES ? 'bg-fgc-green text-[#4D5358] hover:brightness-110' :
                            'bg-fgc-grey dark:bg-black text-white hover:bg-fgc-dark'
                          } ${isPrivacyMode ? 'cursor-default' : ''}`}
                        >
                          <Phone size={14} />
                          {isPrivacyMode ? '*** ** ** **' : phone}
                        </a>
                      ))
                    ) : (
                      <span className="text-xs font-bold text-gray-300 dark:text-gray-600 italic">Sense telèfon registrat</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">Correu electrònic:</span>
                  <div className="mt-1">
                    {contact.email ? (
                      <a
                        href={`mailto:${contact.email}`}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:text-fgc-green transition-colors border border-gray-100 dark:border-white/5"
                      >
                        <Mail size={14} />
                        {contact.email}
                      </a>
                    ) : (
                      <span className="text-xs font-bold text-gray-300 dark:text-gray-600 italic">Sense correu registrat</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default AgentDetailModal;
