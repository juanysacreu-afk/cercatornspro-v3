import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Calendar,
  Train,
  TrainFront,
  User,
  UserX,
  Clock,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Phone,
  RefreshCcw,
  X,
  Layers,
  MapPin,
  Sparkles,
  ChevronsDownUp,
  ChevronsUpDown
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { db } from '../utils/offlineDb';
import { decryptAgentRows } from '../utils/crypto';
import GlassPanel from './common/GlassPanel';
import {
  resolveStationId,
  normalizeTimeDiffSec,
  getShortTornId
} from '../utils/stations';
import { getLiniaColor, getTrainPhone } from '../utils/fgc';
import { STATION_GEO_MAP } from '../utils/stationGeoData';
import { getFgcMinutes } from '../utils/time';
import { getFgcServiceDate } from '../utils/gipRecorder';
import {
  getServiceForDateAsync,
  calendarCodeToFilterCode
} from '../utils/serviceCalendar';
import { getPunctualityInfo } from '../utils/delayNotifications';
import { feedback } from '../utils/feedback';
import { GipRegistrePas, AgentPerformanceHistory } from '../types';

export type HistorySearchMode = 'unitat' | 'circulacio' | 'maquinista';

interface CircStopItem {
  code: string;
  nom: string;
  horaTeorica: string;
  horaReal: string | null;
  diferenciaSegons: number | null;
  estat: 'en_hora' | 'retard' | 'avanc' | 'pendent';
}

interface DriverSummary {
  empleatId: string;
  nom: string;
  cognoms: string;
  fullName: string;
  torn: string;
  dependencia?: string;
  horaInici?: string;
  horaFi?: string;
  phones?: string[];
  circulations: Array<{
    codi: string;
    linia?: string;
    inici?: string;
    final?: string;
    sortida?: string;
    arribada?: string;
    cicle?: string;
    ut?: string | null;
  }>;
  puntualitatPct?: number | null;
}

interface BuiltCirculationHistory {
  id: string;
  linia: string;
  inici: string;
  final: string;
  sortida: string;
  arribada: string;
  sortMin: number;
  uts: string[];
  primaryUt: string | null;
  drivers: Array<{
    empleatId?: string;
    fullName: string | null;
    torn: string | null;
    phones?: string[];
  }>;
  stops: CircStopItem[];
  recordedStopsCount: number;
  onTimeStopsCount: number;
  maxDelaySec: number;
  punctualityPct: number | null;
}

interface GipHistoryPanelProps {
  isPrivacyMode?: boolean;
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

const formatTimeToHHMMSS = (timeStr: string | null | undefined): string => {
  if (!timeStr) return '--:--:--';
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

const normalizeUtFormat = (rawUt: string | null | undefined): string => {
  if (!rawUt) return '';
  const clean = String(rawUt).trim().toUpperCase().replace(/^UT\s*/i, '').trim();
  if (!clean) return '';
  if (!clean.includes('.') && /^\d{5}$/.test(clean)) {
    return `${clean.slice(0, 3)}.${clean.slice(3)}`;
  }
  return clean;
};

const normalizeId = (id: any): string => {
  if (!id) return '';
  return String(id).trim().replace(/^0+/, '');
};

export const GipHistoryPanel: React.FC<GipHistoryPanelProps> = ({
  isPrivacyMode,
  onNavigateToSearch
}) => {
  const todayServiceDate = useMemo(() => getFgcServiceDate(), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayServiceDate);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const [searchMode, setSearchMode] = useState<HistorySearchMode>('unitat');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [lineFilter, setLineFilter] = useState<string>('Tots');

  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [selectedCircId, setSelectedCircId] = useState<string | null>(null);
  const [selectedDriverKey, setSelectedDriverKey] = useState<string | null>(null);

  const [expandedCircIds, setExpandedCircIds] = useState<Set<string>>(new Set());
  const [expandAllStops, setExpandAllStops] = useState<boolean>(true);

  // Raw data for selectedDate
  const [loadingDay, setLoadingDay] = useState<boolean>(false);
  const [dayPassages, setDayPassages] = useState<GipRegistrePas[]>([]);
  const [dayPerfRecords, setDayPerfRecords] = useState<AgentPerformanceHistory[]>([]);
  const [dayServiceCode, setDayServiceCode] = useState<string>('0');
  const [shiftsList, setShiftsList] = useState<any[]>([]);
  const [cycleToTrainMap, setCycleToTrainMap] = useState<Map<string, string>>(new Map());
  const [phonebookMap, setPhonebookMap] = useState<Map<string, string[]>>(new Map());
  const [todayAssignments, setTodayAssignments] = useState<any[]>([]);
  const [theoCircsMap, setTheoCircsMap] = useState<Map<string, any>>(new Map());
  const [loadingTheo, setLoadingTheo] = useState<boolean>(false);

  // Recent 7 dates for quick selector pills
  const recentDates = useMemo(() => {
    const list: Array<{ dateStr: string; label: string; shortLabel: string }> = [];
    const base = new Date(todayServiceDate + 'T12:00:00');
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const dayName = d.toLocaleDateString('ca-ES', { weekday: 'short' }).replace('.', '');
      const label = i === 0 ? 'Avui' : i === 1 ? 'Ahir' : `${dayName} ${dd}/${mm}`;
      list.push({ dateStr, label, shortLabel: `${dd}/${mm}` });
    }
    return list;
  }, [todayServiceDate]);

  // Load static reference tables once (shifts, assignments, phonebook)
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        // 1. Shifts (local Dexie first, fallback Supabase)
        let loadedShifts: any[] = [];
        try {
          loadedShifts = await db.shifts.toArray();
        } catch (_) {}
        if (!loadedShifts || loadedShifts.length === 0) {
          const { data: remoteShifts } = await supabase.from('shifts').select('*');
          if (remoteShifts) loadedShifts = remoteShifts;
        }
        if (isMounted && loadedShifts.length > 0) {
          setShiftsList(loadedShifts);
        }

        // 2. Assignments (cycle -> train_number)
        const { data: dbAssig } = await supabase.from('assignments').select('cycle_id, train_number');
        if (isMounted && dbAssig) {
          const m = new Map<string, string>();
          dbAssig.forEach((a: any) => {
            if (a.cycle_id && a.train_number) {
              m.set(String(a.cycle_id).trim().toUpperCase(), normalizeUtFormat(a.train_number));
            }
          });
          setCycleToTrainMap(m);
        }

        // 3. Phonebook / Agents phones
        const { data: rawAgentsData } = await supabase.from('agents').select('nomina, phone');
        const agentsData = await decryptAgentRows(rawAgentsData);
        if (isMounted && agentsData) {
          const pm = new Map<string, string[]>();
          agentsData.forEach((a: any) => {
            if (a.nomina && a.phone) {
              pm.set(normalizeId(a.nomina), [String(a.phone)]);
            }
          });
          setPhonebookMap(pm);
        }
      } catch (err) {
        console.warn('[GipHistoryPanel] Error carregant dades base:', err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Load all real GIP passages + agent performance history for selectedDate
  const loadDayData = async (targetDate: string) => {
    setLoadingDay(true);
    try {
      const dateObj = new Date(targetDate + 'T12:00:00');
      const rawService = await getServiceForDateAsync(dateObj);
      const filterService = calendarCodeToFilterCode(rawService);
      setDayServiceCode(filterService);

      // 1. Get exact count of gip_registre_pas for targetDate
      const { count } = await supabase
        .from('gip_registre_pas')
        .select('*', { count: 'exact', head: true })
        .eq('data_servei', targetDate);

      const totalRows = count || 0;
      const pageSize = 1000;
      const pages = Math.max(1, Math.ceil(totalRows / pageSize));

      const pagePromises = [];
      for (let i = 0; i < pages; i++) {
        pagePromises.push(
          supabase
            .from('gip_registre_pas')
            .select('*')
            .eq('data_servei', targetDate)
            .order('id', { ascending: true })
            .range(i * pageSize, (i + 1) * pageSize - 1)
        );
      }

      const [pageResults, perfRes, dailyAssigRes] = await Promise.all([
        Promise.all(pagePromises),
        supabase
          .from('agent_performance_history')
          .select('*')
          .eq('data_servei', targetDate)
          .order('cognoms', { ascending: true }),
        targetDate === todayServiceDate
          ? supabase.from('daily_assignments').select('*').order('cognoms', { ascending: true })
          : Promise.resolve({ data: [] as any[] })
      ]);

      const allPassages: GipRegistrePas[] = pageResults.flatMap(r => (r.data as GipRegistrePas[]) || []);
      setDayPassages(allPassages);
      setDayPerfRecords((perfRes.data as AgentPerformanceHistory[]) || []);
      setTodayAssignments(dailyAssigRes.data || []);
    } catch (err) {
      console.error('[GipHistoryPanel] Error carregant dades del dia:', err);
    } finally {
      setLoadingDay(false);
    }
  };

  useEffect(() => {
    loadDayData(selectedDate);
  }, [selectedDate]);

  // Index shifts for the selected day's service code
  const dayShiftsMap = useMemo(() => {
    const byShortTorn = new Map<string, any>();
    const circToShift = new Map<string, { torn: string; shift: any; cicle?: string }>();

    const matchingShifts = shiftsList.filter(s => {
      if (!s.servei) return true;
      if (dayServiceCode === '0') return s.servei === '0' || s.servei === '000';
      return s.servei === dayServiceCode;
    });

    const listToUse = matchingShifts.length > 0 ? matchingShifts : shiftsList;

    listToUse.forEach(s => {
      const shortTorn = getShortTornId(s.id);
      const formattedTorn = shortTorn.startsWith('Q') ? shortTorn : `Q${shortTorn}`;
      byShortTorn.set(shortTorn.toUpperCase(), s);
      byShortTorn.set(formattedTorn.toUpperCase(), s);
      byShortTorn.set(String(s.id).trim().toUpperCase(), s);

      if (Array.isArray(s.circulations)) {
        s.circulations.forEach((c: any) => {
          const codi = typeof c === 'string' ? c : (c?.codi || c?.realCodi || c?.id);
          if (codi && String(codi).toUpperCase() !== 'VIATGER') {
            const cleanCodi = String(codi).trim().toUpperCase();
            if (!circToShift.has(cleanCodi)) {
              circToShift.set(cleanCodi, {
                torn: formattedTorn,
                shift: s,
                cicle: typeof c === 'object' ? c?.cicle : undefined
              });
            }
          }
        });
      }
    });

    return { byShortTorn, circToShift };
  }, [shiftsList, dayServiceCode]);

  // Group passages by Circulation and by Unit
  const { passagesByCirc, passagesByUt, availableUnits, availableCircs } = useMemo(() => {
    const byCirc = new Map<string, GipRegistrePas[]>();
    const byUt = new Map<string, GipRegistrePas[]>();
    const utCircSet = new Map<string, Set<string>>();
    const circMetaMap = new Map<string, { id: string; linia: string; ut: string; count: number; firstTime: string }>();

    dayPassages.forEach(p => {
      const circId = (p.circulacio_id || '').trim().toUpperCase();
      if (!circId) return;

      const normUt = normalizeUtFormat(p.ut);
      const passageWithNormUt: GipRegistrePas = { ...p, ut: normUt || p.ut };

      if (!byCirc.has(circId)) byCirc.set(circId, []);
      byCirc.get(circId)!.push(passageWithNormUt);

      if (normUt) {
        if (!byUt.has(normUt)) byUt.set(normUt, []);
        byUt.get(normUt)!.push(passageWithNormUt);

        if (!utCircSet.has(normUt)) utCircSet.set(normUt, new Set());
        utCircSet.get(normUt)!.add(circId);
      }

      const existingMeta = circMetaMap.get(circId);
      const t = p.hora_teorica || p.hora_real || '';
      if (!existingMeta) {
        circMetaMap.set(circId, {
          id: circId,
          linia: p.linia || (circId.startsWith('F') ? 'S2' : circId.startsWith('D') ? 'S1' : circId.startsWith('A') ? 'L6' : circId.startsWith('B') ? 'L7' : circId.startsWith('L') ? 'L12' : ''),
          ut: normUt,
          count: 1,
          firstTime: t
        });
      } else {
        existingMeta.count += 1;
        if (!existingMeta.ut && normUt) existingMeta.ut = normUt;
        if (!existingMeta.linia && p.linia) existingMeta.linia = p.linia;
      }
    });

    const unitsList = Array.from(utCircSet.entries())
      .map(([ut, circs]) => ({
        ut,
        circCount: circs.size,
        passagesCount: byUt.get(ut)?.length || 0
      }))
      .sort((a, b) => a.ut.localeCompare(b.ut, undefined, { numeric: true }));

    const circsList = Array.from(circMetaMap.values()).sort((a, b) =>
      a.id.localeCompare(b.id, undefined, { numeric: true })
    );

    return {
      passagesByCirc: byCirc,
      passagesByUt: byUt,
      availableUnits: unitsList,
      availableCircs: circsList
    };
  }, [dayPassages]);

  // Build unified Drivers List and Circ -> Driver map for selectedDate
  const { driversList, circToDriversMap } = useMemo(() => {
    const driversMap = new Map<string, DriverSummary>();
    const tornToDriver = new Map<string, DriverSummary>();
    const circDrivers = new Map<string, Array<{ empleatId?: string; fullName: string | null; torn: string | null; phones?: string[] }>>();

    const registerDriverForCirc = (
      circCode: string,
      info: { empleatId?: string; fullName: string | null; torn: string | null; phones?: string[] }
    ) => {
      const clean = circCode.trim().toUpperCase();
      if (!clean || clean === 'VIATGER') return;
      if (!circDrivers.has(clean)) circDrivers.set(clean, []);
      const arr = circDrivers.get(clean)!;
      const exists = arr.some(
        d => (d.empleatId && d.empleatId === info.empleatId) || (d.fullName && d.fullName === info.fullName && d.torn === info.torn)
      );
      if (!exists) arr.push(info);
    };

    // 1. Process agent_performance_history records
    dayPerfRecords.forEach(r => {
      const empId = normalizeId(r.empleat_id);
      const nom = (r.nom || '').trim();
      const cognoms = (r.cognoms || '').trim();
      const fullName = cognoms && nom ? `${cognoms}, ${nom}` : cognoms || nom || `Agent #${empId}`;
      const rawTorn = (r.torn || '').trim().toUpperCase();
      const shortTorn = getShortTornId(rawTorn);
      const formattedTorn = shortTorn ? (shortTorn.startsWith('Q') ? shortTorn : `Q${shortTorn}`) : rawTorn;
      const phones = phonebookMap.get(empId) || [];

      const shiftObj = dayShiftsMap.byShortTorn.get(shortTorn) || dayShiftsMap.byShortTorn.get(rawTorn);

      const rawCircs = Array.isArray(r.detall_circulacions) && r.detall_circulacions.length > 0
        ? r.detall_circulacions
        : (shiftObj?.circulations || []);

      const builtCircRefs: DriverSummary['circulations'] = [];
      rawCircs.forEach((c: any) => {
        const codi = typeof c === 'string' ? c : (c?.codi || c?.realCodi || c?.id);
        if (!codi || String(codi).trim().toUpperCase() === 'VIATGER') return;
        const cleanCodi = String(codi).trim().toUpperCase();
        const cPassages = passagesByCirc.get(cleanCodi) || [];
        const realUt = cPassages.find(p => p.ut)?.ut;
        const cicle = typeof c === 'object' ? c?.cicle : undefined;
        const fallbackUt = cicle ? cycleToTrainMap.get(String(cicle).trim().toUpperCase()) : undefined;
        const savedUt = typeof c === 'object' ? normalizeUtFormat(c?.ut || c?.train) : '';
        const resolvedUt = normalizeUtFormat(realUt || savedUt || fallbackUt) || null;

        builtCircRefs.push({
          codi: cleanCodi,
          linia: (typeof c === 'object' && c?.linia) || cPassages[0]?.linia || undefined,
          inici: typeof c === 'object' ? c?.inici : undefined,
          final: typeof c === 'object' ? c?.final : undefined,
          sortida: typeof c === 'object' ? c?.sortida : undefined,
          arribada: typeof c === 'object' ? c?.arribada : undefined,
          cicle,
          ut: resolvedUt
        });

        registerDriverForCirc(cleanCodi, {
          empleatId: empId,
          fullName,
          torn: formattedTorn,
          phones
        });
      });

      const key = empId || `${formattedTorn}_${fullName}`;
      const existing = driversMap.get(key);
      if (!existing || builtCircRefs.length >= existing.circulations.length) {
        const summary: DriverSummary = {
          empleatId: empId,
          nom,
          cognoms,
          fullName,
          torn: formattedTorn,
          dependencia: r.dependencia || shiftObj?.dependencia,
          horaInici: r.hora_inici || shiftObj?.inici_torn,
          horaFi: r.hora_fi || shiftObj?.final_torn,
          phones,
          circulations: builtCircRefs,
          puntualitatPct: r.puntualitat_percentatge
        };
        driversMap.set(key, summary);
        if (shortTorn) tornToDriver.set(shortTorn.toUpperCase(), summary);
        if (formattedTorn) tornToDriver.set(formattedTorn.toUpperCase(), summary);
      }
    });

    // 2. Merge today's daily_assignments if on todayServiceDate and not already in driversMap
    todayAssignments.forEach(da => {
      const empId = normalizeId(da.empleat_id);
      const rawTorn = (da.torn || '').trim().toUpperCase();
      if (!rawTorn || ['FOR', 'DIS', 'DES', 'VAC', 'DAG', 'ABS', 'LLIB', 'AJN', 'S/N', 'S/A'].some(p => rawTorn.startsWith(p))) {
        return;
      }
      const shortTorn = getShortTornId(rawTorn);
      const formattedTorn = shortTorn.startsWith('Q') ? shortTorn : `Q${shortTorn}`;
      const shiftObj = dayShiftsMap.byShortTorn.get(shortTorn) || dayShiftsMap.byShortTorn.get(rawTorn);
      const nom = (da.nom || '').trim();
      const cognoms = (da.cognoms || '').trim();
      const fullName = cognoms && nom ? `${cognoms}, ${nom}` : cognoms || nom || `Agent #${empId}`;
      const phones = phonebookMap.get(empId) || [];

      const builtCircRefs: DriverSummary['circulations'] = [];
      if (shiftObj && Array.isArray(shiftObj.circulations)) {
        shiftObj.circulations.forEach((c: any) => {
          const codi = typeof c === 'string' ? c : (c?.codi || c?.realCodi || c?.id);
          if (!codi || String(codi).trim().toUpperCase() === 'VIATGER') return;
          const cleanCodi = String(codi).trim().toUpperCase();
          const cPassages = passagesByCirc.get(cleanCodi) || [];
          const realUt = cPassages.find(p => p.ut)?.ut;
          const cicle = typeof c === 'object' ? c?.cicle : undefined;
          const fallbackUt = cicle ? cycleToTrainMap.get(String(cicle).trim().toUpperCase()) : undefined;
          const resolvedUt = normalizeUtFormat(realUt || fallbackUt) || null;

          builtCircRefs.push({
            codi: cleanCodi,
            linia: (typeof c === 'object' && c?.linia) || cPassages[0]?.linia || undefined,
            inici: typeof c === 'object' ? c?.inici : undefined,
            final: typeof c === 'object' ? c?.final : undefined,
            sortida: typeof c === 'object' ? c?.sortida : undefined,
            arribada: typeof c === 'object' ? c?.arribada : undefined,
            cicle,
            ut: resolvedUt
          });

          registerDriverForCirc(cleanCodi, {
            empleatId: empId,
            fullName,
            torn: formattedTorn,
            phones
          });
        });
      }

      const key = empId || `${formattedTorn}_${fullName}`;
      if (!driversMap.has(key) && builtCircRefs.length > 0) {
        const summary: DriverSummary = {
          empleatId: empId,
          nom,
          cognoms,
          fullName,
          torn: formattedTorn,
          dependencia: shiftObj?.dependencia,
          horaInici: da.hora_inici || shiftObj?.inici_torn,
          horaFi: da.hora_fi || shiftObj?.final_torn,
          phones,
          circulations: builtCircRefs,
          puntualitatPct: null
        };
        driversMap.set(key, summary);
        tornToDriver.set(shortTorn.toUpperCase(), summary);
        tornToDriver.set(formattedTorn.toUpperCase(), summary);
      }
    });

    // 3. Fallback: for any circulation in dayShiftsMap.circToShift not yet in circDrivers, link via shift/torn
    dayShiftsMap.circToShift.forEach((val, circCode) => {
      if (!circDrivers.has(circCode)) {
        const shortT = getShortTornId(val.torn).toUpperCase();
        const matchedDriver = tornToDriver.get(shortT) || tornToDriver.get(val.torn.toUpperCase());
        if (matchedDriver) {
          registerDriverForCirc(circCode, {
            empleatId: matchedDriver.empleatId,
            fullName: matchedDriver.fullName,
            torn: matchedDriver.torn,
            phones: matchedDriver.phones
          });
        } else {
          registerDriverForCirc(circCode, {
            fullName: null,
            torn: val.torn
          });
        }
      }
    });

    const sortedDrivers = Array.from(driversMap.values())
      .filter(d => d.circulations.length > 0)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    return {
      driversList: sortedDrivers,
      circToDriversMap: circDrivers
    };
  }, [dayPerfRecords, todayAssignments, dayShiftsMap, passagesByCirc, cycleToTrainMap, phonebookMap]);

  // Automatically select first item or keep valid selection when date/mode changes
  useEffect(() => {
    if (searchMode === 'unitat') {
      if (selectedUnit && availableUnits.some(u => u.ut === selectedUnit)) return;
      setSelectedUnit(availableUnits[0]?.ut || null);
    } else if (searchMode === 'circulacio') {
      if (selectedCircId && availableCircs.some(c => c.id === selectedCircId)) return;
      setSelectedCircId(availableCircs[0]?.id || null);
    } else if (searchMode === 'maquinista') {
      if (selectedDriverKey && driversList.some(d => (d.empleatId || d.torn) === selectedDriverKey)) return;
      const first = driversList[0];
      setSelectedDriverKey(first ? (first.empleatId || first.torn) : null);
    }
  }, [searchMode, availableUnits, availableCircs, driversList]);

  // Determine which circulation IDs are currently active in view so we can fetch their theoretical stops
  const activeViewCircIds = useMemo(() => {
    const ids = new Set<string>();
    if (searchMode === 'unitat' && selectedUnit) {
      const passages = passagesByUt.get(selectedUnit) || [];
      passages.forEach(p => {
        if (p.circulacio_id) ids.add(p.circulacio_id.trim().toUpperCase());
      });
    } else if (searchMode === 'circulacio' && selectedCircId) {
      ids.add(selectedCircId.trim().toUpperCase());
    } else if (searchMode === 'maquinista' && selectedDriverKey) {
      const driver = driversList.find(d => (d.empleatId || d.torn) === selectedDriverKey);
      driver?.circulations.forEach(c => {
        if (c.codi) ids.add(c.codi.trim().toUpperCase());
      });
    }
    return Array.from(ids);
  }, [searchMode, selectedUnit, selectedCircId, selectedDriverKey, passagesByUt, driversList]);

  // Fetch theoretical circulation definitions for activeViewCircIds
  useEffect(() => {
    const missing = activeViewCircIds.filter(id => !theoCircsMap.has(id));
    if (missing.length === 0) return;

    let isMounted = true;
    setLoadingTheo(true);
    (async () => {
      try {
        const newEntries = new Map<string, any>();

        const { data: v2Rows } = await supabase
          .from('circulationsv2')
          .select('id, linia, inici, sortida, final, arribada, estacions, servei, driver_shift')
          .in('id', missing);

        if (v2Rows && v2Rows.length > 0) {
          missing.forEach(cid => {
            const matches = v2Rows.filter((r: any) => r.id?.toUpperCase() === cid);
            if (matches.length > 0) {
              const best =
                matches.find(
                  (r: any) =>
                    r.servei === dayServiceCode ||
                    (dayServiceCode === '0' && (r.servei === '0' || r.servei === '000'))
                ) || matches[0];
              newEntries.set(cid, best);
            }
          });
        }

        const stillMissing = missing.filter(id => !newEntries.has(id));
        if (stillMissing.length > 0) {
          const { data: legacyRows } = await supabase
            .from('circulations')
            .select('id, linia, inici, sortida, final, arribada, estacions')
            .in('id', stillMissing);
          if (legacyRows) {
            legacyRows.forEach((r: any) => {
              if (r.id) newEntries.set(r.id.toUpperCase(), r);
            });
          }
        }

        if (isMounted && newEntries.size > 0) {
          setTheoCircsMap(prev => {
            const next = new Map(prev);
            newEntries.forEach((v, k) => next.set(k, v));
            return next;
          });
        }
      } catch (err) {
        console.warn('[GipHistoryPanel] Error carregant itineraris teòrics:', err);
      } finally {
        if (isMounted) setLoadingTheo(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [activeViewCircIds, dayServiceCode]);

  // Helper to build a complete BuiltCirculationHistory object for any circId
  const buildCirculationDetail = (
    circId: string,
    fallbackMeta?: { linia?: string; inici?: string; final?: string; sortida?: string; arribada?: string; ut?: string | null }
  ): BuiltCirculationHistory => {
    const cleanId = circId.trim().toUpperCase();
    const theo = theoCircsMap.get(cleanId);
    const realPassages = passagesByCirc.get(cleanId) || [];

    const line =
      theo?.linia ||
      fallbackMeta?.linia ||
      realPassages.find(p => p.linia)?.linia ||
      (cleanId.startsWith('F')
        ? 'S2'
        : cleanId.startsWith('D')
        ? 'S1'
        : cleanId.startsWith('A')
        ? 'L6'
        : cleanId.startsWith('B')
        ? 'L7'
        : cleanId.startsWith('L')
        ? 'L12'
        : 'FGC');

    // Map real passages by station code
    const realByStation = new Map<string, GipRegistrePas>();
    const utsSet = new Set<string>();
    realPassages.forEach(rp => {
      const stCode = resolveStationId(rp.estacio_codi || rp.estacio_nom || '', line);
      if (stCode) {
        realByStation.set(stCode, rp);
      }
      const normUt = normalizeUtFormat(rp.ut);
      if (normUt) utsSet.add(normUt);
    });

    if (utsSet.size === 0 && fallbackMeta?.ut) {
      const normFallback = normalizeUtFormat(fallbackMeta.ut);
      if (normFallback) utsSet.add(normFallback);
    }
    if (utsSet.size === 0) {
      const shiftRef = dayShiftsMap.circToShift.get(cleanId);
      if (shiftRef?.cicle) {
        const cycleUt = cycleToTrainMap.get(shiftRef.cicle.trim().toUpperCase());
        if (cycleUt) utsSet.add(cycleUt);
      }
    }

    // Build ordered stops
    const stopsList: Array<{ code: string; nom: string; horaTeorica: string }> = [];
    const includedCodes = new Set<string>();

    if (theo) {
      if (theo.inici && theo.sortida) {
        const code = resolveStationId(theo.inici, line);
        stopsList.push({
          code,
          nom: resolveStationName(code, line) || theo.inici,
          horaTeorica: formatTimeToHHMMSS(theo.sortida)
        });
        includedCodes.add(code);
      }

      if (Array.isArray(theo.estacions)) {
        theo.estacions.forEach((st: any) => {
          const h = st.sortida || st.hora || st.arribada;
          const nameOrCode = st.nom || st.codi;
          if (nameOrCode && h) {
            const code = resolveStationId(nameOrCode, line);
            if (!includedCodes.has(code)) {
              stopsList.push({
                code,
                nom: resolveStationName(code, line) || st.nom || st.codi || code,
                horaTeorica: formatTimeToHHMMSS(h)
              });
              includedCodes.add(code);
            }
          }
        });
      }

      if (theo.final && theo.arribada) {
        const code = resolveStationId(theo.final, line);
        if (!includedCodes.has(code)) {
          stopsList.push({
            code,
            nom: resolveStationName(code, line) || theo.final,
            horaTeorica: formatTimeToHHMMSS(theo.arribada)
          });
          includedCodes.add(code);
        }
      }
    }

    // Add any real recorded stops not present in theoretical stopsList
    const extraRealPassages = realPassages
      .filter(rp => {
        const code = resolveStationId(rp.estacio_codi || rp.estacio_nom || '', line);
        return code && !includedCodes.has(code);
      })
      .sort((a, b) => {
        const mA = getFgcMinutes(a.hora_teorica || a.hora_real) ?? 9999;
        const mB = getFgcMinutes(b.hora_teorica || b.hora_real) ?? 9999;
        return mA - mB;
      });

    extraRealPassages.forEach(rp => {
      const code = resolveStationId(rp.estacio_codi || rp.estacio_nom || '', line);
      if (code && !includedCodes.has(code)) {
        stopsList.push({
          code,
          nom: resolveStationName(rp.estacio_nom || code, line),
          horaTeorica: formatTimeToHHMMSS(rp.hora_teorica || rp.hora_real)
        });
        includedCodes.add(code);
      }
    });

    const computedStops: CircStopItem[] = stopsList.map(st => {
      const recorded = realByStation.get(st.code);
      if (recorded) {
        const diffSec = normalizeTimeDiffSec(recorded.diferencia_segons);
        let estat: 'en_hora' | 'retard' | 'avanc' = recorded.estat;
        if (diffSec > 240) estat = 'retard';
        else if (diffSec < -20) estat = 'avanc';
        else estat = 'en_hora';

        return {
          code: st.code,
          nom: st.nom,
          horaTeorica: st.horaTeorica,
          horaReal: formatTimeToHHMMSS(recorded.hora_real),
          diferenciaSegons: diffSec,
          estat
        };
      }

      return {
        code: st.code,
        nom: st.nom,
        horaTeorica: st.horaTeorica,
        horaReal: null,
        diferenciaSegons: null,
        estat: 'pendent'
      };
    });

    const recordedStops = computedStops.filter(s => s.horaReal !== null);
    const onTimeStops = recordedStops.filter(s => (s.diferenciaSegons ?? 0) <= 180);
    const maxDelaySec =
      recordedStops.length > 0
        ? Math.max(0, ...recordedStops.map(s => s.diferenciaSegons ?? 0))
        : 0;
    const punctualityPct =
      recordedStops.length > 0
        ? Math.round((onTimeStops.length / recordedStops.length) * 1000) / 10
        : null;

    const iniciName =
      (theo?.inici && resolveStationName(theo.inici, line)) ||
      (fallbackMeta?.inici && resolveStationName(fallbackMeta.inici, line)) ||
      computedStops[0]?.nom ||
      '--';
    const finalName =
      (theo?.final && resolveStationName(theo.final, line)) ||
      (fallbackMeta?.final && resolveStationName(fallbackMeta.final, line)) ||
      computedStops[computedStops.length - 1]?.nom ||
      '--';

    const sortidaTime = formatTimeToHHMMSS(
      theo?.sortida || fallbackMeta?.sortida || computedStops[0]?.horaTeorica || realPassages[0]?.hora_real
    );
    const arribadaTime = formatTimeToHHMMSS(
      theo?.arribada ||
        fallbackMeta?.arribada ||
        computedStops[computedStops.length - 1]?.horaTeorica ||
        realPassages[realPassages.length - 1]?.hora_real
    );

    const sortMin = getFgcMinutes(sortidaTime) ?? getFgcMinutes(realPassages[0]?.hora_real) ?? 9999;

    let drivers = circToDriversMap.get(cleanId) || [];
    if (drivers.length === 0 && theo?.driver_shift) {
      const shortT = getShortTornId(theo.driver_shift);
      drivers = [{ fullName: null, torn: shortT.startsWith('Q') ? shortT : `Q${shortT}` }];
    }

    const utsArray = Array.from(utsSet);

    return {
      id: cleanId,
      linia: line,
      inici: iniciName,
      final: finalName,
      sortida: sortidaTime,
      arribada: arribadaTime,
      sortMin,
      uts: utsArray,
      primaryUt: utsArray[0] || null,
      drivers,
      stops: computedStops,
      recordedStopsCount: recordedStops.length,
      onTimeStopsCount: onTimeStops.length,
      maxDelaySec,
      punctualityPct
    };
  };

  // Daily global punctuality rate for selected historical day
  const dayPunctualityPct = useMemo(() => {
    if (dayPassages.length === 0) return null;
    const onTime = dayPassages.filter(p => normalizeTimeDiffSec(p.diferencia_segons) <= 239).length;
    return Number(((onTime / dayPassages.length) * 100).toFixed(1));
  }, [dayPassages]);

  // Filtered pills / options based on searchQuery
  const filteredUnits = useMemo(() => {
    const q = searchQuery.trim().toUpperCase().replace(/^UT\s*/i, '');
    if (!q) return availableUnits;
    const qNoDot = q.replace(/\./g, '');
    return availableUnits.filter(
      u => u.ut.toUpperCase().includes(q) || u.ut.replace(/\./g, '').includes(qNoDot)
    );
  }, [availableUnits, searchQuery]);

  const filteredCircs = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    return availableCircs.filter(c => {
      const lineOk = lineFilter === 'Tots' || c.linia === lineFilter;
      const queryOk = !q || c.id.includes(q) || (c.ut && c.ut.includes(q));
      return lineOk && queryOk;
    });
  }, [availableCircs, lineFilter, searchQuery]);

  const filteredDrivers = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    if (!q) return driversList;
    return driversList.filter(
      d =>
        d.fullName.toUpperCase().includes(q) ||
        d.empleatId.toUpperCase().includes(q) ||
        d.torn.toUpperCase().includes(q) ||
        d.circulations.some(c => c.codi.includes(q) || (c.ut && c.ut.includes(q)))
    );
  }, [driversList, searchQuery]);

  // Built results for current mode
  const unitCirculationsResult = useMemo(() => {
    if (searchMode !== 'unitat' || !selectedUnit) return [];
    const passages = passagesByUt.get(selectedUnit) || [];
    const circIds = Array.from(new Set(passages.map(p => p.circulacio_id.trim().toUpperCase())));
    return circIds
      .map(cid => buildCirculationDetail(cid, { ut: selectedUnit }))
      .sort((a, b) => a.sortMin - b.sortMin);
  }, [searchMode, selectedUnit, passagesByUt, theoCircsMap, circToDriversMap]);

  const singleCirculationResult = useMemo(() => {
    if (searchMode !== 'circulacio' || !selectedCircId) return null;
    return buildCirculationDetail(selectedCircId);
  }, [searchMode, selectedCircId, passagesByCirc, theoCircsMap, circToDriversMap]);

  const driverResult = useMemo(() => {
    if (searchMode !== 'maquinista' || !selectedDriverKey) return null;
    const driver = driversList.find(d => (d.empleatId || d.torn) === selectedDriverKey);
    if (!driver) return null;

    const builtCircs = driver.circulations
      .map(c =>
        buildCirculationDetail(c.codi, {
          linia: c.linia,
          inici: c.inici,
          final: c.final,
          sortida: c.sortida,
          arribada: c.arribada,
          ut: c.ut
        })
      )
      .sort((a, b) => a.sortMin - b.sortMin);

    return {
      driver,
      circulations: builtCircs
    };
  }, [searchMode, selectedDriverKey, driversList, passagesByCirc, theoCircsMap, circToDriversMap]);

  // Keep expandedCircIds synced when expandAllStops is toggled or results change
  useEffect(() => {
    if (expandAllStops) {
      if (searchMode === 'unitat') {
        setExpandedCircIds(new Set(unitCirculationsResult.map(c => c.id)));
      } else if (searchMode === 'maquinista' && driverResult) {
        setExpandedCircIds(new Set(driverResult.circulations.map(c => c.id)));
      }
    } else {
      setExpandedCircIds(new Set());
    }
  }, [expandAllStops, searchMode, selectedUnit, selectedDriverKey, unitCirculationsResult.length, driverResult?.circulations.length]);

  const toggleCircExpanded = (circId: string) => {
    feedback.click();
    setExpandedCircIds(prev => {
      const next = new Set(prev);
      if (next.has(circId)) next.delete(circId);
      else next.add(circId);
      return next;
    });
  };

  const handleSearchFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim().toUpperCase();
    if (!q) return;
    feedback.click();

    if (searchMode === 'unitat') {
      const norm = normalizeUtFormat(q);
      const exact = availableUnits.find(u => u.ut === norm) || filteredUnits[0];
      if (exact) setSelectedUnit(exact.ut);
      else setSelectedUnit(norm);
    } else if (searchMode === 'circulacio') {
      const exact = availableCircs.find(c => c.id === q) || filteredCircs[0];
      if (exact) setSelectedCircId(exact.id);
      else setSelectedCircId(q);
    } else if (searchMode === 'maquinista') {
      if (filteredDrivers.length > 0) {
        const first = filteredDrivers[0];
        setSelectedDriverKey(first.empleatId || first.torn);
      }
    }
  };

  const shiftDateByDays = (delta: number) => {
    feedback.click();
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const nextDate = `${yyyy}-${mm}-${dd}`;
    if (nextDate <= todayServiceDate) {
      setSelectedDate(nextDate);
    }
  };

  const renderDeviationBadge = (
    rawDiffSec: number | null,
    estat: 'en_hora' | 'retard' | 'avanc' | 'pendent'
  ) => {
    if (rawDiffSec === null || estat === 'pendent') {
      return (
        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest italic">
          Sense registre
        </span>
      );
    }

    const diffSec = normalizeTimeDiffSec(rawDiffSec);
    const punct = getPunctualityInfo(diffSec);
    const absSec = Math.abs(diffSec);
    const m = Math.floor(absSec / 60);
    const s = absSec % 60;
    const timeFormatted = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    let labelText = '';
    if (punct.category === 'AVANCAT') {
      labelText = `-${timeFormatted} Avanç`;
    } else if (diffSec === 0) {
      labelText = `00:00 En hora`;
    } else if (punct.category === 'EN_HORA') {
      labelText = `+${timeFormatted} En hora`;
    } else if (punct.category === 'AMBAR') {
      labelText = `+${timeFormatted} Moderat (3-4m)`;
    } else {
      labelText = `+${timeFormatted} Retard`;
    }

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-black font-mono border ${punct.badgeClass}`}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: punct.colorHex }}
        />
        {labelText}
      </span>
    );
  };

  const renderStopsTable = (stops: CircStopItem[]) => (
    <div className="space-y-1.5 pt-3 border-t border-gray-100 dark:border-white/10">
      <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-1.5 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
        <span className="col-span-5">Estació</span>
        <span className="col-span-2 text-center font-mono">H. Teòrica</span>
        <span className="col-span-2 text-center font-mono">H. Real (GeoTren)</span>
        <span className="col-span-3 text-right">Desviació / Estat</span>
      </div>
      {stops.map((stop, idx) => {
        const isPassed = stop.horaReal !== null;
        return (
          <div
            key={stop.code + idx}
            className={`flex flex-col sm:grid sm:grid-cols-12 gap-2 sm:gap-3 p-2.5 sm:px-4 sm:py-2.5 rounded-xl transition-all border ${
              isPassed
                ? 'bg-white/80 dark:bg-white/5 border-gray-100 dark:border-white/5'
                : 'bg-gray-50/40 dark:bg-black/20 border-dashed border-gray-200/50 dark:border-white/5 opacity-55'
            }`}
          >
            <div className="sm:col-span-5 flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {(() => {
                  if (!isPassed || stop.diferenciaSegons === null) {
                    return <div className="w-2 h-2 rounded-full shrink-0 bg-gray-300 dark:bg-gray-600" />;
                  }
                  const p = getPunctualityInfo(stop.diferenciaSegons);
                  return (
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: p.colorHex }}
                    />
                  );
                })()}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono font-black text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-[#4D5358] dark:text-gray-200 shrink-0">
                    {stop.code}
                  </span>
                  <span className="font-bold text-xs sm:text-sm text-[#4D5358] dark:text-white uppercase truncate">
                    {stop.nom}
                  </span>
                </div>
              </div>
              <div className="sm:hidden">
                {renderDeviationBadge(stop.diferenciaSegons, stop.estat)}
              </div>
            </div>

            <div className="sm:col-span-2 flex items-center justify-between sm:justify-center text-xs font-mono">
              <span className="sm:hidden text-[9px] font-bold uppercase text-gray-400">Teòric:</span>
              <span className="font-bold text-gray-500 dark:text-gray-400">{stop.horaTeorica}</span>
            </div>

            <div className="sm:col-span-2 flex items-center justify-between sm:justify-center text-xs font-mono">
              <span className="sm:hidden text-[9px] font-bold uppercase text-gray-400">Real:</span>
              <span
                className={`font-black ${
                  stop.horaReal ? 'text-[#4D5358] dark:text-white' : 'text-gray-400 italic'
                }`}
              >
                {stop.horaReal || '--:--:--'}
              </span>
            </div>

            <div className="hidden sm:flex sm:col-span-3 items-center justify-end">
              {renderDeviationBadge(stop.diferenciaSegons, stop.estat)}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderCirculationExpandableCard = (
    circ: BuiltCirculationHistory,
    options: { showUnitBadge: boolean; showDriverBadge: boolean }
  ) => {
    const isExpanded = expandedCircIds.has(circ.id);
    const utPhone = circ.primaryUt ? getTrainPhone(circ.primaryUt) : null;

    return (
      <GlassPanel
        key={circ.id}
        className="p-4 sm:p-6 !rounded-[28px] space-y-3 border border-gray-100 dark:border-white/10 transition-all"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                feedback.click();
                if (onNavigateToSearch) {
                  onNavigateToSearch('circulacio', circ.id);
                }
              }}
              title={`Obrir circulació ${circ.id} a Cercar`}
              className="min-w-[3.5rem] min-h-[3.5rem] bg-fgc-grey dark:bg-black text-white rounded-2xl flex flex-col items-center justify-center shadow-md px-2.5 transition-all hover:scale-105 active:scale-95 hover:ring-2 hover:ring-fgc-green/60 cursor-pointer group shrink-0"
            >
              <TrainFront size={17} className="mb-0.5 text-fgc-green" />
              <span className="text-sm font-black tracking-tighter leading-none">{circ.id}</span>
            </button>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base sm:text-lg font-black text-[#4D5358] dark:text-white uppercase tracking-tight">
                  Circulació {circ.id}
                </span>
                {circ.linia && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold text-white ${getLiniaColor(
                      circ.linia
                    )}`}
                  >
                    {circ.linia}
                  </span>
                )}

                {options.showUnitBadge && circ.primaryUt && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-black font-mono bg-gray-100 dark:bg-white/10 text-[#4D5358] dark:text-gray-200 border border-gray-200 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => {
                        feedback.click();
                        setSearchMode('unitat');
                        setSearchQuery('');
                        setSelectedUnit(circ.primaryUt);
                      }}
                      className="inline-flex items-center gap-1 hover:text-fgc-green transition-colors"
                      title={`Veure totes les circulacions de la UT ${circ.primaryUt} aquest dia`}
                    >
                      <Train size={12} className="text-fgc-green shrink-0" />
                      <span>UT {circ.primaryUt}</span>
                    </button>
                    {utPhone && (
                      <a
                        href={`tel:${utPhone}`}
                        onClick={e => e.stopPropagation()}
                        className="inline-flex items-center justify-center p-1 -mr-1 rounded bg-fgc-green text-[#4D5358] hover:brightness-110"
                        title={`Trucar a la UT ${circ.primaryUt} (${utPhone})`}
                      >
                        <Phone size={10} className="stroke-[2.5]" />
                      </a>
                    )}
                  </div>
                )}

                {options.showDriverBadge &&
                  circ.drivers.map((drv, dIdx) => (
                    <div
                      key={dIdx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-white/90 dark:bg-white/10 text-[#4D5358] dark:text-gray-200 border border-gray-200 dark:border-white/10"
                    >
                      {drv.fullName ? (
                        <button
                          type="button"
                          onClick={() => {
                            feedback.click();
                            setSearchMode('maquinista');
                            setSearchQuery('');
                            if (drv.empleatId || drv.torn) {
                              setSelectedDriverKey(drv.empleatId || drv.torn || null);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 hover:text-fgc-green transition-colors text-left"
                          title="Veure totes les circulacions d'aquest maquinista aquest dia"
                        >
                          <User size={12} className="text-fgc-green shrink-0" />
                          <span className="uppercase tracking-tight truncate max-w-[200px] sm:max-w-none">
                            {drv.fullName}
                          </span>
                          {drv.torn && (
                            <span className="text-[10px] font-mono font-black text-gray-400">
                              ({drv.torn})
                            </span>
                          )}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-400 font-mono text-[11px]">
                          <UserX size={12} />
                          Torn {drv.torn || 'S/A'}
                        </span>
                      )}
                      {!isPrivacyMode && drv.phones && drv.phones[0] && (
                        <a
                          href={`tel:${drv.phones[0]}`}
                          onClick={e => e.stopPropagation()}
                          className="p-1 rounded bg-fgc-green/20 text-fgc-green hover:bg-fgc-green hover:text-[#4D5358] transition-colors"
                          title={`Trucar a ${drv.fullName}`}
                        >
                          <Phone size={10} />
                        </a>
                      )}
                    </div>
                  ))}
              </div>

              <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase flex-wrap">
                <span>{circ.inici}</span>
                <ArrowRight size={12} className="opacity-50" />
                <span>{circ.final}</span>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="font-mono text-[11px] text-[#4D5358] dark:text-gray-300">
                  {circ.sortida.slice(0, 5)} → {circ.arribada.slice(0, 5)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between lg:justify-end gap-2.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-100 dark:border-white/5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-xl bg-gray-100 dark:bg-white/5 text-[11px] font-mono font-bold text-gray-600 dark:text-gray-300">
                {circ.recordedStopsCount}/{circ.stops.length} parades
              </span>
              {circ.punctualityPct !== null && (
                <span
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-mono font-black border ${
                    circ.punctualityPct >= 95
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : circ.punctualityPct >= 80
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                  }`}
                >
                  {circ.punctualityPct}% punt.
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => toggleCircExpanded(circ.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 text-xs font-bold text-[#4D5358] dark:text-white transition-all"
            >
              <span>{isExpanded ? 'Ocultar estacions' : 'Veure hores de pas'}</span>
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {isExpanded && renderStopsTable(circ.stops)}
      </GlassPanel>
    );
  };

  const formattedSelectedDateLong = useMemo(() => {
    try {
      const d = new Date(selectedDate + 'T12:00:00');
      return d.toLocaleDateString('ca-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* 1. Barra de Calendari i Resum del Dia Seleccionat */}
      <GlassPanel className="p-5 sm:p-7 !rounded-[32px] space-y-5 border border-fgc-green/30">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-fgc-green text-[#4D5358]">
                Arxiu Reals GeoTren · GIP
              </span>
              <span className="text-xs font-mono font-bold text-gray-400">
                Servei {dayServiceCode === '0' ? '000 (Laborable)' : dayServiceCode}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-[#4D5358] dark:text-white uppercase tracking-tight capitalize">
              {formattedSelectedDateLong}
            </h2>
          </div>

          {/* Controls del Calendari */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => shiftDateByDays(-1)}
              className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 text-[#4D5358] dark:text-white transition-all"
              title="Dia anterior"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="relative">
              <input
                ref={dateInputRef}
                type="date"
                value={selectedDate}
                max={todayServiceDate}
                onChange={e => {
                  if (e.target.value) {
                    feedback.click();
                    setSelectedDate(e.target.value);
                  }
                }}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => {
                  dateInputRef.current?.showPicker?.();
                  dateInputRef.current?.focus();
                }}
                className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-fgc-grey dark:bg-white text-white dark:text-[#4D5358] font-mono font-black text-xs sm:text-sm shadow-md hover:brightness-110 transition-all"
              >
                <Calendar size={15} className="text-fgc-green dark:text-[#4D5358]" />
                <span>{selectedDate}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => shiftDateByDays(1)}
              disabled={selectedDate >= todayServiceDate}
              className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 text-[#4D5358] dark:text-white disabled:opacity-30 transition-all"
              title="Dia següent"
            >
              <ChevronRight size={16} />
            </button>

            <button
              type="button"
              onClick={() => loadDayData(selectedDate)}
              disabled={loadingDay}
              className="p-2.5 rounded-xl bg-fgc-green/15 text-fgc-green hover:bg-fgc-green/25 border border-fgc-green/30 transition-all"
              title="Recarregar dades d'aquest dia"
            >
              <RefreshCcw size={15} className={loadingDay ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Píndoles ràpides d'últims dies + estadístiques del dia */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-white/5">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            {recentDates.map(d => {
              const isSelected = selectedDate === d.dateStr;
              return (
                <button
                  key={d.dateStr}
                  type="button"
                  onClick={() => {
                    feedback.click();
                    setSelectedDate(d.dateStr);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                    isSelected
                      ? 'bg-fgc-green text-[#4D5358] border-fgc-green font-black shadow-sm'
                      : 'bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400 border-gray-200/60 dark:border-white/10 hover:border-fgc-green/40'
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
            {dayPunctualityPct !== null && (
              <span className={`px-2.5 py-1 rounded-xl font-black border ${
                dayPunctualityPct >= 95 
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                  : dayPunctualityPct >= 85 
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' 
                  : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
              }`}>
                Puntualitat: {dayPunctualityPct}%
              </span>
            )}
            <span className="px-2.5 py-1 rounded-xl bg-fgc-green/10 text-fgc-green border border-fgc-green/20 font-bold">
              {dayPassages.length.toLocaleString('ca-ES')} passos GeoTren
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 font-bold">
              {availableUnits.length} UTs
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 font-bold">
              {availableCircs.length} Circulacions
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 font-bold">
              {driversList.length} Maquinistes
            </span>
          </div>
        </div>
      </GlassPanel>

      {/* 2. Selector de Mode de Cerca (Per Unitat / Per Circulació / Per Maquinista) + Buscador */}
      <GlassPanel className="p-5 sm:p-7 !rounded-[32px] space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => {
              feedback.click();
              setSearchMode('unitat');
              setSearchQuery('');
            }}
            className={`flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider transition-all border ${
              searchMode === 'unitat'
                ? 'bg-fgc-green text-[#4D5358] border-fgc-green shadow-lg shadow-fgc-green/20 scale-[1.01]'
                : 'bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-gray-200/60 dark:border-white/10 hover:border-fgc-green/40'
            }`}
          >
            <Train size={17} />
            <span>Per Unitat ({availableUnits.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              feedback.click();
              setSearchMode('circulacio');
              setSearchQuery('');
            }}
            className={`flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider transition-all border ${
              searchMode === 'circulacio'
                ? 'bg-fgc-green text-[#4D5358] border-fgc-green shadow-lg shadow-fgc-green/20 scale-[1.01]'
                : 'bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-gray-200/60 dark:border-white/10 hover:border-fgc-green/40'
            }`}
          >
            <TrainFront size={17} />
            <span>Per Circulació ({availableCircs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              feedback.click();
              setSearchMode('maquinista');
              setSearchQuery('');
            }}
            className={`flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider transition-all border ${
              searchMode === 'maquinista'
                ? 'bg-fgc-green text-[#4D5358] border-fgc-green shadow-lg shadow-fgc-green/20 scale-[1.01]'
                : 'bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-gray-200/60 dark:border-white/10 hover:border-fgc-green/40'
            }`}
          >
            <User size={17} />
            <span>Per Maquinista ({driversList.length})</span>
          </button>
        </div>

        {/* Barra de cerca adaptada al mode */}
        <form onSubmit={handleSearchFormSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={
                searchMode === 'unitat'
                  ? 'Cerca per número d’unitat (ex: 113.08, 115.06, 112.14)...'
                  : searchMode === 'circulacio'
                  ? 'Cerca per número de circulació (ex: D202, F197, A131)...'
                  : 'Cerca per nom, cognoms, nòmina o torn (ex: Garcia, 62286, Q0220)...'
              }
              className="w-full pl-11 pr-10 py-3.5 bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-2xl text-sm font-bold uppercase tracking-wider text-[#4D5358] dark:text-white focus:outline-none focus:ring-2 focus:ring-fgc-green transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-6 py-3.5 bg-fgc-green text-[#4D5358] rounded-2xl font-black uppercase text-xs tracking-wider shadow-lg shadow-fgc-green/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Search size={15} />
            Cercar a l'Històric
          </button>
        </form>

        {/* Píndoles ràpides de selecció segons el mode */}
        {searchMode === 'unitat' && (
          <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-white/5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
              Unitats registrades el {selectedDate} ({filteredUnits.length}):
            </span>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto no-scrollbar pt-1">
              {filteredUnits.map(u => {
                const isSelected = selectedUnit === u.ut;
                return (
                  <button
                    key={u.ut}
                    type="button"
                    onClick={() => {
                      feedback.click();
                      setSelectedUnit(u.ut);
                    }}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all ${
                      isSelected
                        ? 'bg-fgc-green text-[#4D5358] border-fgc-green font-black shadow-md scale-105'
                        : 'bg-white dark:bg-black/30 text-gray-700 dark:text-gray-200 border-gray-200/70 dark:border-white/10 hover:border-fgc-green/50'
                    }`}
                  >
                    <Train size={12} className={isSelected ? 'text-[#4D5358]' : 'text-fgc-green'} />
                    <span>UT {u.ut}</span>
                    <span className="text-[10px] opacity-70">({u.circCount} circ.)</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {searchMode === 'circulacio' && (
          <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-white/5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Circulacions registrades el {selectedDate} ({filteredCircs.length}):
              </span>
              <div className="flex items-center gap-1.5">
                {['Tots', 'S1', 'S2', 'L6', 'L7', 'L12'].map(l => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLineFilter(l)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                      lineFilter === l
                        ? 'bg-fgc-grey dark:bg-white text-white dark:text-gray-900'
                        : 'bg-gray-100 dark:bg-white/5 text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto no-scrollbar pt-1">
              {filteredCircs.map(c => {
                const isSelected = selectedCircId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      feedback.click();
                      setSelectedCircId(c.id);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      isSelected
                        ? 'bg-fgc-green text-[#4D5358] border-fgc-green font-black shadow-md scale-105'
                        : 'bg-white dark:bg-black/30 text-gray-700 dark:text-gray-200 border-gray-200/70 dark:border-white/10 hover:border-fgc-green/50'
                    }`}
                  >
                    <span className="font-mono font-black">{c.id}</span>
                    {c.linia && (
                      <span className={`px-1.5 py-0.2 rounded text-[9px] text-white ${getLiniaColor(c.linia)}`}>
                        {c.linia}
                      </span>
                    )}
                    {c.ut && <span className="text-[10px] font-mono opacity-75">UT {c.ut}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {searchMode === 'maquinista' && (
          <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-white/5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
              Maquinistes amb servei registrat el {selectedDate} ({filteredDrivers.length}):
            </span>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto no-scrollbar pt-1">
              {filteredDrivers.map(d => {
                const dKey = d.empleatId || d.torn;
                const isSelected = selectedDriverKey === dKey;
                return (
                  <button
                    key={dKey}
                    type="button"
                    onClick={() => {
                      feedback.click();
                      setSelectedDriverKey(dKey);
                    }}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      isSelected
                        ? 'bg-fgc-green text-[#4D5358] border-fgc-green font-black shadow-md scale-[1.02]'
                        : 'bg-white dark:bg-black/30 text-gray-700 dark:text-gray-200 border-gray-200/70 dark:border-white/10 hover:border-fgc-green/50'
                    }`}
                  >
                    <User size={12} className={isSelected ? 'text-[#4D5358]' : 'text-fgc-green'} />
                    <span className="truncate max-w-[180px] uppercase">{d.fullName}</span>
                    <span className="font-mono text-[10px] opacity-75">({d.torn})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </GlassPanel>

      {/* 3. Resultats segons el mode seleccionat */}
      {loadingDay ? (
        <GlassPanel className="p-16 text-center space-y-4 !rounded-[32px]">
          <RefreshCcw size={36} className="mx-auto animate-spin text-fgc-green" />
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
            Carregant registres històrics de GeoTren per al dia {selectedDate}...
          </p>
        </GlassPanel>
      ) : dayPassages.length === 0 ? (
        <GlassPanel className="p-12 text-center space-y-3 !rounded-[32px]">
          <AlertCircle size={36} className="mx-auto text-amber-500 opacity-75" />
          <h3 className="text-base font-black text-[#4D5358] dark:text-white uppercase">
            Sense registres GIP per al dia {selectedDate}
          </h3>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            No hi ha passos reals de GeoTren emmagatzemats a la base de dades per a aquesta data. Prova de seleccionar un altre dia al calendari.
          </p>
        </GlassPanel>
      ) : (
        <>
          {/* MODE A: PER UNITAT */}
          {searchMode === 'unitat' && selectedUnit && (
            <div className="space-y-4">
              <GlassPanel className="p-6 sm:p-7 !rounded-[32px] border border-fgc-green/30">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-fgc-grey dark:bg-black text-fgc-green flex flex-col items-center justify-center font-mono font-black shadow-lg shrink-0">
                      <Train size={20} />
                      <span className="text-[11px] leading-none mt-0.5">{selectedUnit}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-xl sm:text-2xl font-black text-[#4D5358] dark:text-white uppercase">
                          Unitat UT {selectedUnit}
                        </h3>
                        {getTrainPhone(selectedUnit) && (
                          <a
                            href={`tel:${getTrainPhone(selectedUnit)}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-fgc-green text-[#4D5358] text-xs font-black font-mono hover:brightness-110 transition-all"
                          >
                            <Phone size={12} />
                            <span>Trucar ({getTrainPhone(selectedUnit)})</span>
                          </a>
                        )}
                        <span className="px-2.5 py-1 rounded-xl bg-gray-100 dark:bg-white/10 text-xs font-mono font-bold text-gray-600 dark:text-gray-300">
                          {selectedDate}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-bold mt-1">
                        {unitCirculationsResult.length} circulacions realitzades ·{' '}
                        {unitCirculationsResult.reduce((acc, c) => acc + c.recordedStopsCount, 0)} passos per estació registrats
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      feedback.click();
                      setExpandAllStops(!expandAllStops);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 text-xs font-black uppercase text-[#4D5358] dark:text-white transition-all self-start md:self-auto"
                  >
                    {expandAllStops ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
                    <span>{expandAllStops ? 'Plegar totes les estacions' : 'Desplegar totes les estacions'}</span>
                  </button>
                </div>
              </GlassPanel>

              {unitCirculationsResult.length > 0 ? (
                <div className="space-y-4">
                  {unitCirculationsResult.map(circ =>
                    renderCirculationExpandableCard(circ, {
                      showUnitBadge: false,
                      showDriverBadge: true
                    })
                  )}
                </div>
              ) : (
                <GlassPanel className="p-10 text-center !rounded-[28px]">
                  <p className="text-xs font-bold text-gray-400 uppercase">
                    No s'han trobat circulacions per a la unitat {selectedUnit} el dia {selectedDate}.
                  </p>
                </GlassPanel>
              )}
            </div>
          )}

          {/* MODE B: PER CIRCULACIÓ */}
          {searchMode === 'circulacio' && singleCirculationResult && (
            <div className="space-y-4">
              <GlassPanel className="p-6 sm:p-8 !rounded-[32px] space-y-5 border border-fgc-green/30">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        feedback.click();
                        if (onNavigateToSearch) {
                          onNavigateToSearch('circulacio', singleCirculationResult.id);
                        }
                      }}
                      className="min-w-[4rem] min-h-[4rem] bg-fgc-grey dark:bg-black text-white rounded-2xl flex flex-col items-center justify-center shadow-lg px-3 transition-all hover:scale-105 cursor-pointer shrink-0"
                    >
                      <TrainFront size={20} className="mb-0.5 text-fgc-green" />
                      <span className="text-base font-black tracking-tighter leading-none">
                        {singleCirculationResult.id}
                      </span>
                    </button>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-xl sm:text-2xl font-black text-[#4D5358] dark:text-white uppercase">
                          Circulació {singleCirculationResult.id}
                        </h3>
                        {singleCirculationResult.linia && (
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold text-white ${getLiniaColor(
                              singleCirculationResult.linia
                            )}`}
                          >
                            {singleCirculationResult.linia}
                          </span>
                        )}
                        {singleCirculationResult.primaryUt && (
                          <button
                            type="button"
                            onClick={() => {
                              feedback.click();
                              setSearchMode('unitat');
                              setSearchQuery('');
                              setSelectedUnit(singleCirculationResult.primaryUt);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-black font-mono bg-gray-100 dark:bg-white/10 text-[#4D5358] dark:text-gray-200 border border-gray-200 dark:border-white/10 hover:border-fgc-green"
                            title="Veure totes les circulacions d'aquesta unitat"
                          >
                            <Train size={12} className="text-fgc-green" />
                            <span>UT {singleCirculationResult.primaryUt}</span>
                          </button>
                        )}
                        {singleCirculationResult.drivers.map((drv, idx) => (
                          <div
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-white/90 dark:bg-white/10 text-[#4D5358] dark:text-gray-200 border border-gray-200 dark:border-white/10"
                          >
                            {drv.fullName ? (
                              <button
                                type="button"
                                onClick={() => {
                                  feedback.click();
                                  setSearchMode('maquinista');
                                  setSearchQuery('');
                                  if (drv.empleatId || drv.torn) {
                                    setSelectedDriverKey(drv.empleatId || drv.torn || null);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 hover:text-fgc-green"
                              >
                                <User size={12} className="text-fgc-green" />
                                <span className="uppercase">{drv.fullName}</span>
                                {drv.torn && (
                                  <span className="text-[10px] font-mono text-gray-400">
                                    ({drv.torn})
                                  </span>
                                )}
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-gray-400 font-mono text-xs">
                                <UserX size={12} />
                                Torn {drv.torn || 'S/A'}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-gray-500 dark:text-gray-400 uppercase">
                        <span>{singleCirculationResult.inici}</span>
                        <ArrowRight size={13} className="opacity-50" />
                        <span>{singleCirculationResult.final}</span>
                        <span className="text-gray-300 dark:text-gray-600">·</span>
                        <span className="font-mono text-xs">
                          {singleCirculationResult.sortida.slice(0, 5)} →{' '}
                          {singleCirculationResult.arribada.slice(0, 5)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start md:self-auto">
                    <span className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-white/10 text-xs font-mono font-bold text-gray-600 dark:text-gray-300">
                      {singleCirculationResult.recordedStopsCount}/{singleCirculationResult.stops.length} parades registrades
                    </span>
                  </div>
                </div>

                {renderStopsTable(singleCirculationResult.stops)}
              </GlassPanel>
            </div>
          )}

          {/* MODE C: PER MAQUINISTA */}
          {searchMode === 'maquinista' && (
            <>
              {driverResult ? (
                <div className="space-y-4">
                  <GlassPanel className="p-6 sm:p-7 !rounded-[32px] border border-fgc-green/30">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-xl shadow-lg shrink-0">
                          {driverResult.driver.cognoms?.charAt(0) || driverResult.driver.nom?.charAt(0) || 'M'}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-lg sm:text-2xl font-black text-[#4D5358] dark:text-white uppercase">
                              {driverResult.driver.fullName}
                            </h3>
                            {driverResult.driver.empleatId && (
                              <span className="text-xs font-mono font-bold text-gray-400">
                                #{driverResult.driver.empleatId}
                              </span>
                            )}
                            <span className="px-2.5 py-0.5 rounded-lg bg-fgc-green/20 text-fgc-green font-mono font-black text-xs border border-fgc-green/30">
                              Torn {driverResult.driver.torn}
                            </span>
                            {driverResult.driver.dependencia && (
                              <span className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 font-bold text-[11px] uppercase">
                                {driverResult.driver.dependencia}
                              </span>
                            )}
                            {!isPrivacyMode &&
                              driverResult.driver.phones &&
                              driverResult.driver.phones[0] && (
                                <a
                                  href={`tel:${driverResult.driver.phones[0]}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-fgc-green text-[#4D5358] text-xs font-black font-mono"
                                >
                                  <Phone size={11} />
                                  <span>{driverResult.driver.phones[0]}</span>
                                </a>
                              )}
                          </div>

                          <div className="flex items-center gap-3 flex-wrap text-xs font-bold text-gray-500 dark:text-gray-400">
                            {driverResult.driver.horaInici && driverResult.driver.horaFi && (
                              <span className="font-mono">
                                Horari: {driverResult.driver.horaInici} → {driverResult.driver.horaFi}
                              </span>
                            )}
                            <span>·</span>
                            <span>{driverResult.circulations.length} circulacions</span>
                            <span>·</span>
                            <span>
                              Trens utilitzats:{' '}
                              {Array.from(
                                new Set(
                                  driverResult.circulations
                                    .map(c => c.primaryUt)
                                    .filter(Boolean)
                                )
                              ).join(', ') || 'S/D'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          feedback.click();
                          setExpandAllStops(!expandAllStops);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 text-xs font-black uppercase text-[#4D5358] dark:text-white transition-all self-start md:self-auto"
                      >
                        {expandAllStops ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
                        <span>
                          {expandAllStops ? 'Plegar totes les estacions' : 'Desplegar totes les estacions'}
                        </span>
                      </button>
                    </div>
                  </GlassPanel>

                  <div className="space-y-4">
                    {driverResult.circulations.map(circ =>
                      renderCirculationExpandableCard(circ, {
                        showUnitBadge: true,
                        showDriverBadge: false
                      })
                    )}
                  </div>
                </div>
              ) : (
                <GlassPanel className="p-10 text-center !rounded-[28px]">
                  <p className="text-xs font-bold text-gray-400 uppercase">
                    Selecciona o cerca un maquinista per consultar totes les seves circulacions, trens i hores de pas del dia {selectedDate}.
                  </p>
                </GlassPanel>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default GipHistoryPanel;
