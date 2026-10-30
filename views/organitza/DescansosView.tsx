import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Coffee, Clock, ArrowRight, Search, RefreshCcw, User, UserX, Phone,
  Train, AlertCircle, ArrowUpRight, ArrowDownLeft, ChevronRight,
  Sparkles, CheckCircle2, Shield, Eye, Flame, MapPin, Zap
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { db } from '../../utils/offlineDb';
import GlassPanel from '../../components/common/GlassPanel';
import { getShortTornId, getFgcMinutes, formatFgcTime, isServiceVisible } from '../../utils/stations';
import { feedback } from '../../utils/feedback';

export type DependencyCode = 'PC' | 'SR' | 'NA' | 'PN' | 'RB';

export interface DependencyMeta {
  code: DependencyCode;
  name: string;
  fullName: string;
  phone: string;
  lines?: string;
  colorHex: string;
  tailwindBg: string;
  tailwindText: string;
  tailwindBorder: string;
  badgeBg: string;
}

export const DEPENDENCY_CONFIG: Record<DependencyCode, DependencyMeta> = {
  PC: {
    code: 'PC',
    name: 'Pl. Catalunya',
    fullName: 'Barcelona - Pl. Catalunya',
    phone: '91013',
    lines: 'L6 · L7 · S1 · S2',
    colorHex: '#3b82f6',
    tailwindBg: 'bg-blue-500/10 dark:bg-blue-500/20',
    tailwindText: 'text-blue-600 dark:text-blue-400',
    tailwindBorder: 'border-blue-500/30',
    badgeBg: 'bg-blue-500'
  },
  SR: {
    code: 'SR',
    name: 'Sarrià',
    fullName: 'Sarrià',
    phone: '93636',
    lines: 'L6 · L12 · S1 · S2',
    colorHex: '#9333ea',
    tailwindBg: 'bg-purple-500/10 dark:bg-purple-500/20',
    tailwindText: 'text-purple-600 dark:text-purple-400',
    tailwindBorder: 'border-purple-500/30',
    badgeBg: 'bg-purple-600'
  },
  NA: {
    code: 'NA',
    name: 'Nacions Unides',
    fullName: 'Terrassa Nacions Unides',
    phone: '91446',
    lines: 'S1',
    colorHex: '#f97316',
    tailwindBg: 'bg-orange-500/10 dark:bg-orange-500/20',
    tailwindText: 'text-orange-600 dark:text-orange-400',
    tailwindBorder: 'border-orange-500/30',
    badgeBg: 'bg-orange-500'
  },
  PN: {
    code: 'PN',
    name: 'Parc del Nord',
    fullName: 'Sabadell Parc del Nord',
    phone: '91387',
    lines: 'S2',
    colorHex: '#84cc16',
    tailwindBg: 'bg-lime-500/10 dark:bg-lime-500/20',
    tailwindText: 'text-lime-600 dark:text-lime-400',
    tailwindBorder: 'border-lime-500/30',
    badgeBg: 'bg-lime-600'
  },
  RB: {
    code: 'RB',
    name: 'Rubí',
    fullName: 'Rubí Centre / Dipòsit',
    phone: '93295',
    lines: 'S1',
    colorHex: '#ec4899',
    tailwindBg: 'bg-pink-500/10 dark:bg-pink-500/20',
    tailwindText: 'text-pink-600 dark:text-pink-400',
    tailwindBorder: 'border-pink-500/30',
    badgeBg: 'bg-pink-600'
  }
};

export const normalizeDependency = (codeOrName: string | null | undefined): DependencyCode | null => {
  if (!codeOrName) return null;
  const clean = codeOrName.trim().toUpperCase();
  if (clean === 'PC' || clean.includes('CATALUNYA') || clean === 'TB' || clean.includes('TIBIDABO')) return 'PC';
  if (clean === 'SR' || clean === 'RE' || clean.includes('SARRIA') || clean.includes('SARRIÀ') || clean.includes('ELISENDA')) return 'SR';
  if (clean === 'NA' || clean === 'DNA' || clean === 'N2' || clean === 'N3' || clean.includes('NACIONS') || clean === 'TR' || clean.includes('RAMBLA')) return 'NA';
  if (clean === 'PN' || clean === 'DPN' || clean === 'P1' || clean === 'P2' || clean === 'P3' || clean.includes('PARC DEL NORD')) return 'PN';
  if (clean === 'RB' || clean === 'RC' || clean === 'COR' || clean.includes('RUBI') || clean.includes('RUBÍ')) return 'RB';
  return null;
};

/**
 * Deducció heurística d'origen i destí per codi de circulació FGC (Metro del Vallès).
 * Utilitzat com a fallback immediat si una circulació no és a circulationsv2.
 */
export const deduceCirculationEndpoints = (codi: string): { inici: string; final: string; linia: string } | null => {
  if (!codi) return null;
  const clean = codi.trim().toUpperCase();
  const letter = clean.charAt(0);
  const num = parseInt(clean.slice(1), 10);
  if (isNaN(num)) return null;

  // En FGC, els números senars són sentit ascendent (des de PC cap a l'exterior)
  // Els parells són sentit descendent (cap a Barcelona - Pl. Catalunya)
  const isAscendent = num % 2 !== 0;

  switch (letter) {
    case 'F': // Linia S2 (Pl. Catalunya <-> Sabadell Parc del Nord)
      return {
        linia: 'S2',
        inici: isAscendent ? 'PC' : 'PN',
        final: isAscendent ? 'PN' : 'PC'
      };
    case 'D': // Linia S1 (Pl. Catalunya <-> Terrassa Nacions Unides)
      return {
        linia: 'S1',
        inici: isAscendent ? 'PC' : 'NA',
        final: isAscendent ? 'NA' : 'PC'
      };
    case 'A': // Linia L6 (Pl. Catalunya <-> Sarrià)
      return {
        linia: 'L6',
        inici: isAscendent ? 'PC' : 'SR',
        final: isAscendent ? 'SR' : 'PC'
      };
    case 'B': // Linia L7 (Pl. Catalunya <-> Av. Tibidabo)
      return {
        linia: 'L7',
        inici: isAscendent ? 'PC' : 'TB',
        final: isAscendent ? 'TB' : 'PC'
      };
    case 'L': // Linia L12 (Sarrià <-> Reina Elisenda)
      return {
        linia: 'L12',
        inici: isAscendent ? 'SR' : 'RE',
        final: isAscendent ? 'RE' : 'SR'
      };
    default:
      return null;
  }
};

export interface RestSlot {
  id: string; // unique key
  shiftId: string;
  torn: string;
  driverName: string | null;
  driverNomina: string | null;
  driverPhone: string | null;
  dependencia: DependencyCode;
  startMin: number;
  endMin: number;
  durationMin: number;
  startTimeStr: string;
  endTimeStr: string;
  prevCirc?: {
    codi: string;
    linia?: string;
    inici?: string;
    final?: string;
    arribada?: string;
  } | null;
  nextCirc?: {
    codi: string;
    linia?: string;
    sortida?: string;
    inici?: string;
    final?: string;
  } | null;
  isReserve?: boolean;
}

export interface UpcomingEntry {
  id: string;
  shiftId: string;
  torn: string;
  driverName: string | null;
  driverPhone: string | null;
  dependencia: DependencyCode;
  arrivalMin: number;
  arrivalTimeStr: string;
  circCodi: string;
  circLinia?: string;
  circInici?: string;
  plannedRestMin: number;
  nextDepartureTimeStr?: string;
}

export interface DescansosViewProps {
  selectedServei: string;
  onSelectServei?: (s: string) => void;
  isPrivacyMode: boolean;
  onNavigateToSearch?: (type: string, query: string) => void;
}

export const DescansosView: React.FC<DescansosViewProps> = ({
  selectedServei,
  onSelectServei,
  isPrivacyMode,
  onNavigateToSearch
}) => {
  const [selectedDep, setSelectedDep] = useState<'Tots' | DependencyCode>('Tots');
  const [nowMin, setNowMin] = useState<number>(() => {
    const d = new Date();
    const h = d.getHours();
    const m = d.getMinutes();
    return (h < 4 ? h + 24 : h) * 60 + m;
  });
  const [targetMin, setTargetMin] = useState<number>(() => {
    const d = new Date();
    const h = d.getHours();
    const m = d.getMinutes();
    return (h < 4 ? h + 24 : h) * 60 + m;
  });
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [minGapThreshold, setMinGapThreshold] = useState<number>(10); // minuts de descans
  const [subTabMap, setSubTabMap] = useState<Record<DependencyCode, 'actius' | 'sortides' | 'entrades'>>({
    PC: 'actius',
    SR: 'actius',
    NA: 'actius',
    PN: 'actius',
    RB: 'actius'
  });

  const [loading, setLoading] = useState(true);
  const [rawShifts, setRawShifts] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [phonesMap, setPhonesMap] = useState<Map<string, string>>(new Map());
  const [circMap, setCircMap] = useState<Map<string, { inici: string; final: string; linia: string }>>(new Map());

  // Rellotge en temps real (actualització cada 15 segons)
  useEffect(() => {
    const updateClock = () => {
      const d = new Date();
      const h = d.getHours();
      const m = d.getMinutes();
      const current = (h < 4 ? h + 24 : h) * 60 + m;
      setNowMin(current);
      if (isLiveMode) {
        setTargetMin(current);
      }
    };
    updateClock();
    const interval = setInterval(updateClock, 15000);
    return () => clearInterval(interval);
  }, [isLiveMode]);

  // Càrrega de dades (torns, assignacions diàries, circulacions i telèfons)
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Descarregar shifts del servei actiu (des de Dexie o Supabase)
      let shifts: any[] = [];
      try {
        const local = await db.shifts.toArray();
        if (local && local.length > 0) {
          shifts = local;
        }
      } catch (_) {}

      if (shifts.length === 0) {
        const { data: remoteShifts } = await supabase
          .from('shifts')
          .select('id, servei, inici_torn, final_torn, dependencia, circulations');
        if (remoteShifts) shifts = remoteShifts;
      }

      // Filtrar per servei
      const filteredShifts = shifts.filter(s =>
        selectedServei === 'Tots' || isServiceVisible(s.servei, selectedServei)
      );
      setRawShifts(filteredShifts);

      // 2. Assignacions diàries del dia d'avui
      let daList: any[] = [];
      try {
        const localDa = await db.daily_assignments.toArray();
        if (localDa && localDa.length > 0) {
          daList = localDa;
        }
      } catch (_) {}

      if (daList.length === 0) {
        const { data: remoteDa } = await supabase
          .from('daily_assignments')
          .select('torn, nom, cognoms, empleat_id, observacions, data_servei')
          .eq('data_servei', todayStr);
        if (remoteDa) daList = remoteDa;
      }
      setAssignments(daList);

      // 3. Telèfons
      const { data: pbData } = await supabase
        .from('phonebook')
        .select('nomina, phones');
      const pMap = new Map<string, string>();
      if (pbData) {
        pbData.forEach((row: any) => {
          if (row.nomina && Array.isArray(row.phones) && row.phones.length > 0) {
            const primary = row.phones.find((p: string) => {
              const clean = p.replace(/\s+/g, '');
              return clean.startsWith('6') || clean.startsWith('7');
            }) || row.phones[0];
            pMap.set(String(row.nomina).trim().replace(/^0+/, ''), primary);
          }
        });
      }
      setPhonesMap(pMap);

      // 4. Mapa complet d'orígens i destins de circulacions (circulationsv2)
      const cMap = new Map<string, { inici: string; final: string; linia: string }>();

      // Primer comprovem si Dexie ja té el catàleg complet sincronitzat (>= 3000 elements)
      try {
        const localCircs = await db.circulations.toArray();
        if (localCircs && localCircs.length >= 3000) {
          localCircs.forEach((c: any) => {
            if (c.id) {
              cMap.set(c.id.toUpperCase(), {
                inici: c.inici || '',
                final: c.final || '',
                linia: c.linia || ''
              });
            }
          });
        }
      } catch (_) {}

      // Si falta el catàleg a Dexie o és incomplet, consultar circulationsv2 en paral·lel
      if (cMap.size < 3000) {
        try {
          const pages = await Promise.all([
            supabase.from('circulationsv2').select('id, inici, final, linia').range(0, 999),
            supabase.from('circulationsv2').select('id, inici, final, linia').range(1000, 1999),
            supabase.from('circulationsv2').select('id, inici, final, linia').range(2000, 2999),
            supabase.from('circulationsv2').select('id, inici, final, linia').range(3000, 3999),
            supabase.from('circulationsv2').select('id, inici, final, linia').range(4000, 4999),
            supabase.from('circulationsv2').select('id, inici, final, linia').range(5000, 5999)
          ]);
          const allV2 = pages.flatMap(p => p.data || []);
          if (allV2.length > 0) {
            allV2.forEach((c: any) => {
              if (c.id) {
                cMap.set(c.id.toUpperCase(), {
                  inici: c.inici || '',
                  final: c.final || '',
                  linia: c.linia || ''
                });
              }
            });
            // Persistir a Dexie per a càrregues instantànies posteriors
            db.circulations.bulkPut(allV2).catch(() => {});
          }
        } catch (v2Err) {
          console.warn('Error fetching circulationsv2:', v2Err);
        }
      }
      setCircMap(cMap);

    } catch (err) {
      console.error('Error loading Descansos data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedServei]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Index d'assignacions per torn per a cerca instantània
  const assignmentsByTorn = useMemo(() => {
    const map = new Map<string, any>();
    assignments.forEach(a => {
      if (a.torn) {
        const short = getShortTornId(a.torn).toUpperCase();
        map.set(short, a);
        map.set(a.torn.toUpperCase(), a);
      }
    });
    return map;
  }, [assignments]);

  // Processar tots els slots de descans i reserves
  const allRestSlots = useMemo(() => {
    const slots: RestSlot[] = [];

    rawShifts.forEach(shift => {
      const startMin = getFgcMinutes(shift.inici_torn);
      const endMin = getFgcMinutes(shift.final_torn);
      if (startMin === null || endMin === null) return;

      const shortTorn = getShortTornId(shift.id);
      const da = assignmentsByTorn.get(shortTorn.toUpperCase()) || assignmentsByTorn.get(shift.id.toUpperCase());

      let driverName: string | null = null;
      let driverNomina: string | null = null;
      let driverPhone: string | null = null;

      if (da) {
        const n = (da.nom || '').trim();
        const c = (da.cognoms || '').trim();
        driverName = c && n ? `${c}, ${n}` : (c || n || null);
        driverNomina = da.empleat_id ? String(da.empleat_id).trim() : null;
        if (driverNomina) {
          const cleanNom = driverNomina.replace(/^0+/, '');
          driverPhone = phonesMap.get(cleanNom) || null;
        }
      }

      // Extreure circulacions ordenades
      const circList: any[] = [];
      if (Array.isArray(shift.circulations)) {
        shift.circulations.forEach((c: any) => {
          const codi = typeof c === 'string' ? c : (c?.codi || c?.id);
          if (!codi || codi === '-') return;
          const isViatger = codi.toUpperCase() === 'VIATGER';
          let vInici = '';
          let vFinal = '';
          if (isViatger && c?.observacions) {
            const parts = String(c.observacions).split('-');
            if (parts.length >= 3) {
              vInici = parts[1];
              vFinal = parts[2];
            }
          }
          const sMin = getFgcMinutes(c.sortida);
          const eMin = getFgcMinutes(c.arribada);
          if (sMin !== null && eMin !== null) {
            const meta = circMap.get(codi.toUpperCase()) || deduceCirculationEndpoints(codi.toUpperCase());
            circList.push({
              codi: codi.toUpperCase(),
              cicle: c.cicle || '',
              sortidaMin: sMin,
              arribadaMin: eMin,
              sortidaStr: c.sortida,
              arribadaStr: c.arribada,
              inici: vInici || meta?.inici || c.inici || '',
              final: vFinal || meta?.final || c.final || '',
              linia: meta?.linia || c.linia || '',
              isViatger
            });
          }
        });
      }

      circList.sort((a, b) => a.sortidaMin - b.sortidaMin);

      // Cas 1: Torn de Reserva (sense circulacions programades)
      if (circList.length === 0) {
        const dep = normalizeDependency(shift.dependencia);
        if (dep) {
          slots.push({
            id: `res-${shift.id}`,
            shiftId: shift.id,
            torn: shortTorn,
            driverName,
            driverNomina,
            driverPhone,
            dependencia: dep,
            startMin,
            endMin,
            durationMin: endMin - startMin,
            startTimeStr: shift.inici_torn,
            endTimeStr: shift.final_torn,
            isReserve: true
          });
        }
        return;
      }

      // Cas 2: Buit inicial (abans del primer tren)
      const firstCirc = circList[0];
      if (firstCirc.sortidaMin > startMin) {
        const gap = firstCirc.sortidaMin - startMin;
        if (gap >= minGapThreshold) {
          const depFromFirst = normalizeDependency(firstCirc.inici);
          const dep = depFromFirst || normalizeDependency(shift.dependencia);
          if (dep) {
            slots.push({
              id: `${shift.id}-gap-init`,
              shiftId: shift.id,
              torn: shortTorn,
              driverName,
              driverNomina,
              driverPhone,
              dependencia: dep,
              startMin,
              endMin: firstCirc.sortidaMin,
              durationMin: gap,
              startTimeStr: shift.inici_torn,
              endTimeStr: firstCirc.sortidaStr,
              nextCirc: {
                codi: firstCirc.codi,
                linia: firstCirc.linia,
                sortida: firstCirc.sortidaStr,
                inici: firstCirc.inici,
                final: firstCirc.final
              }
            });
          }
        }
      }

      // Cas 3: Buits intermedis entre circulacions
      for (let i = 0; i < circList.length - 1; i++) {
        const cur = circList[i];
        const next = circList[i + 1];
        if (next.sortidaMin > cur.arribadaMin) {
          const gap = next.sortidaMin - cur.arribadaMin;
          if (gap >= minGapThreshold) {
            // Ubicació real del descans:
            // 1. Estació d'arribada del tren que s'acaba de finalitzar (cur.final)
            // 2. Estació de sortida del proper tren que s'agafarà (next.inici)
            // 3. Fallback: dependència base del torn
            const depFromCur = normalizeDependency(cur.final);
            const depFromNext = normalizeDependency(next.inici);
            const dep = depFromCur || depFromNext || normalizeDependency(shift.dependencia);
            if (dep) {
              slots.push({
                id: `${shift.id}-gap-${i}`,
                shiftId: shift.id,
                torn: shortTorn,
                driverName,
                driverNomina,
                driverPhone,
                dependencia: dep,
                startMin: cur.arribadaMin,
                endMin: next.sortidaMin,
                durationMin: gap,
                startTimeStr: cur.arribadaStr,
                endTimeStr: next.sortidaStr,
                prevCirc: {
                  codi: cur.codi,
                  linia: cur.linia,
                  inici: cur.inici,
                  final: cur.final,
                  arribada: cur.arribadaStr
                },
                nextCirc: {
                  codi: next.codi,
                  linia: next.linia,
                  sortida: next.sortidaStr,
                  inici: next.inici,
                  final: next.final
                }
              });
            }
          }
        }
      }

      // Cas 4: Buit final (després de l'últim tren abans de finalitzar torn)
      const lastCirc = circList[circList.length - 1];
      if (endMin > lastCirc.arribadaMin) {
        const gap = endMin - lastCirc.arribadaMin;
        if (gap >= minGapThreshold) {
          const depFromLast = normalizeDependency(lastCirc.final);
          const dep = depFromLast || normalizeDependency(shift.dependencia);
          if (dep) {
            slots.push({
              id: `${shift.id}-gap-final`,
              shiftId: shift.id,
              torn: shortTorn,
              driverName,
              driverNomina,
              driverPhone,
              dependencia: dep,
              startMin: lastCirc.arribadaMin,
              endMin,
              durationMin: gap,
              startTimeStr: lastCirc.arribadaStr,
              endTimeStr: shift.final_torn,
              prevCirc: {
                codi: lastCirc.codi,
                linia: lastCirc.linia,
                inici: lastCirc.inici,
                final: lastCirc.final,
                arribada: lastCirc.arribadaStr
              }
            });
          }
        }
      }
    });

    return slots;
  }, [rawShifts, assignmentsByTorn, circMap, phonesMap, minGapThreshold]);

  // Càlcul de properes entrades a descans (< 45 min des de l'hora objectiu)
  const allUpcomingEntries = useMemo(() => {
    const entries: UpcomingEntry[] = [];

    rawShifts.forEach(shift => {
      const circList: any[] = [];
      if (Array.isArray(shift.circulations)) {
        shift.circulations.forEach((c: any) => {
          const codi = typeof c === 'string' ? c : (c?.codi || c?.id);
          if (!codi || codi === '-') return;
          const isViatger = codi.toUpperCase() === 'VIATGER';
          let vInici = '';
          let vFinal = '';
          if (isViatger && c?.observacions) {
            const parts = String(c.observacions).split('-');
            if (parts.length >= 3) {
              vInici = parts[1];
              vFinal = parts[2];
            }
          }
          const sMin = getFgcMinutes(c.sortida);
          const eMin = getFgcMinutes(c.arribada);
          if (sMin !== null && eMin !== null) {
            const meta = circMap.get(codi.toUpperCase()) || deduceCirculationEndpoints(codi.toUpperCase());
            circList.push({
              codi: codi.toUpperCase(),
              sortidaMin: sMin,
              arribadaMin: eMin,
              arribadaStr: c.arribada,
              sortidaStr: c.sortida,
              final: vFinal || meta?.final || c.final || '',
              inici: vInici || meta?.inici || c.inici || '',
              linia: meta?.linia || c.linia || ''
            });
          }
        });
      }

      if (circList.length === 0) return;
      circList.sort((a, b) => a.sortidaMin - b.sortidaMin);

      const shortTorn = getShortTornId(shift.id);
      const da = assignmentsByTorn.get(shortTorn.toUpperCase()) || assignmentsByTorn.get(shift.id.toUpperCase());

      let driverName: string | null = null;
      let driverPhone: string | null = null;
      if (da) {
        const n = (da.nom || '').trim();
        const c = (da.cognoms || '').trim();
        driverName = c && n ? `${c}, ${n}` : (c || n || null);
        if (da.empleat_id) {
          const cleanNom = String(da.empleat_id).trim().replace(/^0+/, '');
          driverPhone = phonesMap.get(cleanNom) || null;
        }
      }

      circList.forEach((circ, idx) => {
        // Comprovar si aquesta circulació arriba en els propers 45 minuts
        if (circ.arribadaMin > targetMin && circ.arribadaMin <= targetMin + 45) {
          const dep = normalizeDependency(circ.final);
          if (dep) {
            // Verificar si després d'arribar té descans (interval fins a la següent circulació o final de torn)
            const nextCirc = circList[idx + 1];
            const shiftEndMin = getFgcMinutes(shift.final_torn) || (circ.arribadaMin + 30);
            const nextStartMin = nextCirc ? nextCirc.sortidaMin : shiftEndMin;
            const plannedRest = nextStartMin - circ.arribadaMin;

            if (plannedRest >= minGapThreshold) {
              entries.push({
                id: `entry-${shift.id}-${circ.codi}`,
                shiftId: shift.id,
                torn: shortTorn,
                driverName,
                driverPhone,
                dependencia: dep,
                arrivalMin: circ.arribadaMin,
                arrivalTimeStr: circ.arribadaStr,
                circCodi: circ.codi,
                circLinia: circ.linia,
                circInici: circ.inici,
                plannedRestMin: plannedRest,
                nextDepartureTimeStr: nextCirc?.sortidaStr
              });
            }
          }
        }
      });
    });

    entries.sort((a, b) => a.arrivalMin - b.arrivalMin);
    return entries;
  }, [rawShifts, assignmentsByTorn, circMap, phonesMap, targetMin, minGapThreshold]);

  // Agrupació de dades per dependència segons l'hora objectiu
  const dependencyData = useMemo(() => {
    const deps: DependencyCode[] = ['PC', 'SR', 'NA', 'PN', 'RB'];
    const result: Record<DependencyCode, {
      activeSlots: RestSlot[];
      upcomingDepartures: RestSlot[];
      upcomingEntries: UpcomingEntry[];
    }> = {
      PC: { activeSlots: [], upcomingDepartures: [], upcomingEntries: [] },
      SR: { activeSlots: [], upcomingDepartures: [], upcomingEntries: [] },
      NA: { activeSlots: [], upcomingDepartures: [], upcomingEntries: [] },
      PN: { activeSlots: [], upcomingDepartures: [], upcomingEntries: [] },
      RB: { activeSlots: [], upcomingDepartures: [], upcomingEntries: [] }
    };

    allRestSlots.forEach(slot => {
      // Filtrar per text si l'usuari ha escrit alguna cerca
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = slot.driverName?.toLowerCase().includes(q);
        const matchTorn = slot.torn?.toLowerCase().includes(q);
        const matchShift = slot.shiftId?.toLowerCase().includes(q);
        if (!matchName && !matchTorn && !matchShift) return;
      }

      // Està actiu ara a l'hora objectiu?
      if (slot.startMin <= targetMin && targetMin < slot.endMin) {
        result[slot.dependencia].activeSlots.push(slot);

        // És propera sortida? (li queden <= 20 minuts de descans)
        const rem = slot.endMin - targetMin;
        if (rem <= 20 && !slot.isReserve) {
          result[slot.dependencia].upcomingDepartures.push(slot);
        }
      }
    });

    // Ordenar actius pel temps restant (els que marxen abans primer)
    deps.forEach(d => {
      result[d].activeSlots.sort((a, b) => (a.endMin - targetMin) - (b.endMin - targetMin));
      result[d].upcomingDepartures.sort((a, b) => (a.endMin - targetMin) - (b.endMin - targetMin));
    });

    // Afegir properes entrades
    allUpcomingEntries.forEach(entry => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = entry.driverName?.toLowerCase().includes(q);
        const matchTorn = entry.torn?.toLowerCase().includes(q);
        const matchShift = entry.shiftId?.toLowerCase().includes(q);
        if (!matchName && !matchTorn && !matchShift) return;
      }
      result[entry.dependencia].upcomingEntries.push(entry);
    });

    return result;
  }, [allRestSlots, allUpcomingEntries, targetMin, searchQuery]);

  // Canvi de temps simulat
  const adjustTargetTime = (deltaMins: number) => {
    feedback.click();
    setIsLiveMode(false);
    setTargetMin(prev => Math.max(0, prev + deltaMins));
  };

  const resetToLiveTime = () => {
    feedback.click();
    setIsLiveMode(true);
    setTargetMin(nowMin);
  };

  const handleTimeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      const parsed = getFgcMinutes(val);
      if (parsed !== null) {
        setIsLiveMode(false);
        setTargetMin(parsed);
      }
    }
  };

  const serveiOptions = ['Tots', '100', '0', '400', '500'];

  const displayedDeps: DependencyCode[] = selectedDep === 'Tots'
    ? ['PC', 'SR', 'NA', 'PN', 'RB']
    : [selectedDep];

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500">
      {/* ── BARRA SUPERIOR DE CONTROL I FILTRES ──────────────────────────────── */}
      <GlassPanel className="p-4 sm:p-6 !rounded-[28px] sm:!rounded-[36px] space-y-4">
        {/* Fila 1: Títol d'estat i rellotge interactiu */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-fgc-green/20 text-fgc-green flex items-center justify-center border border-fgc-green/30 shrink-0 shadow-sm">
              <Coffee size={20} className="stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-[#4D5358] dark:text-white uppercase tracking-tight flex items-center gap-2">
                Descansos a Dependències
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 font-bold">
                  PC · SR · NA · PN · RB
                </span>
              </h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Supervisió de maquinistes en descans actiu, properes sortides a tren i entrades previstes.
              </p>
            </div>
          </div>

          {/* Controlador Temporal (Directe vs Simulat) */}
          <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
              isLiveMode
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isLiveMode ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="text-xs font-bold uppercase tracking-wider font-mono">
                {isLiveMode ? 'En Directe' : 'Simulant'}: {formatFgcTime(targetMin)}
              </span>
            </div>

            {!isLiveMode && (
              <button
                type="button"
                onClick={resetToLiveTime}
                className="px-3 py-1.5 rounded-xl bg-fgc-green text-[#4D5358] text-xs font-black uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-xs flex items-center gap-1.5"
                title="Tornar al temps real en directe"
              >
                <Zap size={13} className="fill-current" />
                Hora Actual
              </button>
            )}

            <div className="flex items-center gap-1 bg-gray-100/80 dark:bg-white/5 p-1 rounded-xl border border-gray-200/60 dark:border-white/10">
              <button
                type="button"
                onClick={() => adjustTargetTime(-15)}
                className="px-2 py-1 text-[11px] font-bold text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-white/10 rounded-lg transition-all"
                title="Retrocedir 15 minuts"
              >
                -15m
              </button>
              <input
                type="time"
                value={formatFgcTime(targetMin).slice(0, 5)}
                onChange={handleTimeInputChange}
                className="bg-white dark:bg-black/40 text-xs font-bold font-mono px-2 py-0.5 rounded-lg border border-gray-200 dark:border-white/10 text-[#4D5358] dark:text-white focus:outline-none focus:ring-1 focus:ring-fgc-green"
                title="Selecciona hora concreta de consulta"
              />
              <button
                type="button"
                onClick={() => adjustTargetTime(15)}
                className="px-2 py-1 text-[11px] font-bold text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-white/10 rounded-lg transition-all"
                title="Avançar 15 minuts"
              >
                +15m
              </button>
            </div>

            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-xl bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-all active:scale-95 shrink-0"
              title="Refrescar dades"
            >
              <RefreshCcw size={15} className={loading ? 'animate-spin text-fgc-green' : ''} />
            </button>
          </div>
        </div>

        {/* Fila 2: Filtre de Dependència i Cerca */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-white/5">
          {/* Tabs Dependències amb comptadors */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            <button
              type="button"
              onClick={() => { feedback.click(); setSelectedDep('Tots'); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all whitespace-nowrap flex items-center gap-1.5 ${
                selectedDep === 'Tots'
                  ? 'bg-fgc-grey dark:bg-white text-white dark:text-gray-900 shadow-sm'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
              }`}
            >
              <span>Totes</span>
              <span className="px-1.5 py-0.2 rounded-md bg-white/20 dark:bg-black/20 text-[10px] font-mono">
                {Object.values(dependencyData).reduce((acc, d) => acc + d.activeSlots.length, 0)}
              </span>
            </button>

            {(['PC', 'SR', 'NA', 'PN', 'RB'] as DependencyCode[]).map(dep => {
              const count = dependencyData[dep].activeSlots.length;
              const hasUpcoming = dependencyData[dep].upcomingDepartures.length > 0 || dependencyData[dep].upcomingEntries.length > 0;
              const isSelected = selectedDep === dep;
              return (
                <button
                  key={dep}
                  type="button"
                  onClick={() => { feedback.click(); setSelectedDep(dep); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-fgc-grey dark:bg-white text-white dark:text-gray-900 shadow-sm'
                      : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${DEPENDENCY_CONFIG[dep].badgeBg}`} />
                  <span>{dep}</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold ${
                    isSelected
                      ? 'bg-white/20 dark:bg-black/20 text-current'
                      : count > 0 ? 'bg-fgc-green/20 text-fgc-green' : 'bg-gray-200 dark:bg-white/10 text-gray-400'
                  }`}>
                    {count}
                  </span>
                  {hasUpcoming && !isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse -ml-0.5" title="Té properes entrades o sortides" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Cerca per text i filtre mínim de descans */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cerca maquinista o torn..."
                className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-xl text-xs font-bold uppercase tracking-wider text-[#4D5358] dark:text-white placeholder:text-gray-400 placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-fgc-green"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                feedback.click();
                setMinGapThreshold(prev => (prev === 10 ? 0 : 10));
              }}
              className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all whitespace-nowrap border ${
                minGapThreshold === 0
                  ? 'bg-fgc-green/20 text-fgc-green border-fgc-green/30'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-400 border-gray-200 dark:border-white/10 hover:text-gray-600'
              }`}
              title="Veure tots els talls o només descansos de més de 10 minuts"
            >
              {minGapThreshold === 0 ? 'Tots buits' : 'Descans ≥10m'}
            </button>
          </div>
        </div>
      </GlassPanel>

      {/* ── GRAELLA O COLUMNES DE DEPENDÈNCIES ───────────────────────────────── */}
      <div className={`grid gap-6 ${selectedDep === 'Tots' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
        {displayedDeps.map(dep => {
          const cfg = DEPENDENCY_CONFIG[dep];
          const data = dependencyData[dep];
          const currentSubTab = subTabMap[dep];

          return (
            <GlassPanel
              key={dep}
              className={`p-6 sm:p-7 !rounded-[32px] sm:!rounded-[40px] space-y-5 border-t-4 transition-all ${
                cfg.tailwindBorder
              }`}
            >
              {/* Capçalera de la Dependència */}
              <div className="space-y-3.5 pb-3 border-b border-gray-100 dark:border-white/5">
                <div className="flex items-center gap-3 min-w-0">
                  <a
                    href={`tel:${cfg.phone}`}
                    className={`relative w-11 h-11 rounded-2xl ${cfg.tailwindBg} ${cfg.tailwindText} flex items-center justify-center font-black text-base border ${cfg.tailwindBorder} shadow-sm shrink-0 hover:scale-105 active:scale-95 transition-all group cursor-pointer`}
                    title={`Trucar al menjador de ${cfg.name} (Ext. ${cfg.phone})`}
                    aria-label={`Trucar al menjador de ${cfg.name} al telèfon ${cfg.phone}`}
                  >
                    <span>{dep}</span>
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs ring-2 ring-white dark:ring-[#1E232A] group-hover:scale-110 transition-transform">
                      <Phone size={8} />
                    </span>
                  </a>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base sm:text-lg font-black text-[#4D5358] dark:text-white uppercase tracking-tight truncate">
                      {cfg.fullName}
                    </h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate flex items-center gap-1.5">
                      <span>Menjador i descans operatiu</span>
                      <span className="text-gray-300 dark:text-gray-600">·</span>
                      <a
                        href={`tel:${cfg.phone}`}
                        className="font-mono text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 hover:underline"
                        title={`Trucar al menjador (${cfg.phone})`}
                      >
                        <Phone size={10} /> Ext. {cfg.phone}
                      </a>
                    </p>
                  </div>
                </div>

                {/* Sub-selector d'estat de la dependència: Barra segmentada responsive */}
                <div className="grid grid-cols-3 gap-1 bg-gray-100/70 dark:bg-white/5 p-1 rounded-2xl border border-gray-200/60 dark:border-white/10 w-full">
                  <button
                    type="button"
                    onClick={() => {
                      feedback.click();
                      setSubTabMap(prev => ({ ...prev, [dep]: 'actius' }));
                    }}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-1.5 min-w-0 ${
                      currentSubTab === 'actius'
                        ? 'bg-white dark:bg-white/20 text-[#4D5358] dark:text-white shadow-xs'
                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                    }`}
                  >
                    <span className="truncate">Descansant</span>
                    <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-black shrink-0 ${
                      currentSubTab === 'actius'
                        ? 'bg-fgc-green/20 text-fgc-green'
                        : 'bg-gray-200/80 dark:bg-white/10 text-gray-500 dark:text-gray-400'
                    }`}>
                      {data.activeSlots.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      feedback.click();
                      setSubTabMap(prev => ({ ...prev, [dep]: 'sortides' }));
                    }}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-1.5 min-w-0 ${
                      currentSubTab === 'sortides'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                    }`}
                  >
                    <span className="truncate">Sortides</span>
                    <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-black shrink-0 ${
                      currentSubTab === 'sortides'
                        ? 'bg-black/20 text-white'
                        : data.upcomingDepartures.length > 0
                        ? 'bg-amber-500/20 text-amber-500'
                        : 'bg-gray-200/80 dark:bg-white/10 text-gray-500 dark:text-gray-400'
                    }`}>
                      {data.upcomingDepartures.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      feedback.click();
                      setSubTabMap(prev => ({ ...prev, [dep]: 'entrades' }));
                    }}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-1.5 min-w-0 ${
                      currentSubTab === 'entrades'
                        ? 'bg-blue-500 text-white shadow-xs'
                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                    }`}
                  >
                    <span className="truncate">Entrades</span>
                    <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-black shrink-0 ${
                      currentSubTab === 'entrades'
                        ? 'bg-black/20 text-white'
                        : data.upcomingEntries.length > 0
                        ? 'bg-blue-500/20 text-blue-500'
                        : 'bg-gray-200/80 dark:bg-white/10 text-gray-500 dark:text-gray-400'
                    }`}>
                      {data.upcomingEntries.length}
                    </span>
                  </button>
                </div>
              </div>

              {/* ── CONTINGUT SEGONS SUB-PESTANYA ──────────────────────────── */}

              {/* 1. DESCANSANT ARA MATEIX */}
              {currentSubTab === 'actius' && (
                <div className="space-y-3">
                  {data.activeSlots.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-gray-50/50 dark:bg-black/10 border border-dashed border-gray-200 dark:border-white/5 space-y-2">
                      <Coffee size={24} className="mx-auto text-gray-300 dark:text-gray-600" />
                      <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">
                        Cap maquinista de descans ara mateix a {cfg.name}
                      </p>
                      {data.upcomingEntries.length > 0 && (
                        <p className="text-[11px] text-blue-500 font-semibold">
                          Hi ha {data.upcomingEntries.length} propera entrada prevista en menys de 45 minuts.
                        </p>
                      )}
                    </div>
                  ) : (
                    data.activeSlots.map(slot => {
                      const elapsedMin = Math.max(0, targetMin - slot.startMin);
                      const remMin = Math.max(0, slot.endMin - targetMin);
                      const progressPct = Math.min(100, Math.max(0, Math.round((elapsedMin / Math.max(1, slot.durationMin)) * 100)));
                      const isFinishingSoon = remMin <= 15 && !slot.isReserve;

                      return (
                        <div
                          key={slot.id}
                          className={`p-4 rounded-2xl border transition-all hover:scale-[1.01] ${
                            isFinishingSoon
                              ? 'bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/30 ring-2 ring-amber-500/10 shadow-sm'
                              : 'bg-white/80 dark:bg-white/5 border-gray-200/70 dark:border-white/10 shadow-xs'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            {/* Dades del Maquinista */}
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                slot.isReserve
                                  ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                                  : 'bg-fgc-green/15 text-fgc-green'
                              }`}>
                                {slot.isReserve ? <Shield size={16} /> : <Coffee size={16} />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs sm:text-sm font-black text-[#4D5358] dark:text-white uppercase tracking-tight truncate max-w-[200px] sm:max-w-none">
                                    {slot.driverName || 'Sense assignar'}
                                  </span>
                                  <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 shrink-0 whitespace-nowrap">
                                    Torn {slot.torn}
                                  </span>
                                  {slot.isReserve && (
                                    <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-600 dark:text-purple-300 shrink-0 whitespace-nowrap">
                                      Reserva
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 dark:text-gray-500 mt-0.5">
                                  <span>{slot.startTimeStr} → {slot.endTimeStr} ({slot.durationMin} min)</span>
                                </div>
                              </div>
                            </div>

                            {/* Badge Temps Restant i Botons d'Acció */}
                            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                              <span className={`px-2.5 py-1 rounded-xl text-xs font-black font-mono flex items-center gap-1.5 ${
                                isFinishingSoon
                                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 animate-pulse'
                                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              }`}>
                                <Clock size={12} />
                                {slot.isReserve ? 'Torn complet' : `Resten ${remMin}m`}
                              </span>

                              {/* Botó Cercar Torn */}
                              {onNavigateToSearch && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    feedback.click();
                                    onNavigateToSearch('torn', slot.torn);
                                  }}
                                  className="p-1.5 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-fgc-green hover:text-[#4D5358] text-gray-500 dark:text-gray-300 transition-all active:scale-95 shadow-xs"
                                  title={`Consultar torn ${slot.torn} a Cercar`}
                                  aria-label={`Consultar torn ${slot.torn}`}
                                >
                                  <ArrowRight size={13} />
                                </button>
                              )}

                              {/* Trucada maquinista */}
                              {slot.driverPhone && (
                                <a
                                  href={isPrivacyMode ? undefined : `tel:${slot.driverPhone.replace(/\s+/g, '')}`}
                                  onClick={e => {
                                    if (isPrivacyMode) e.preventDefault();
                                  }}
                                  className={`p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-all ${
                                    isPrivacyMode ? 'cursor-default opacity-40' : 'active:scale-95'
                                  }`}
                                  title={isPrivacyMode ? 'Telèfon protegit' : `Trucar: ${slot.driverPhone}`}
                                >
                                  <Phone size={13} />
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Barra de Progrés del descans */}
                          {!slot.isReserve && (
                            <div className="mt-3 space-y-1">
                              <div className="w-full h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-500 rounded-full ${
                                    isFinishingSoon ? 'bg-amber-500' : 'bg-fgc-green'
                                  }`}
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Context de Procedència i Destí */}
                          {(slot.prevCirc || slot.nextCirc) && (
                            <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-white/5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold">
                              {slot.prevCirc ? (
                                <span className="text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                  <span>Arribat amb</span>
                                  <span className="font-mono text-gray-600 dark:text-gray-300">{slot.prevCirc.codi}</span>
                                  <span>a les {slot.prevCirc.arribada}</span>
                                </span>
                              ) : (
                                <span className="text-gray-400 dark:text-gray-500">Inici de torn a dependència</span>
                              )}

                              {slot.nextCirc && (
                                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 ml-auto">
                                  <span>Sortirà amb</span>
                                  <span className="font-mono font-black">{slot.nextCirc.codi}</span>
                                  <span>a les {slot.nextCirc.sortida}</span>
                                  {slot.nextCirc.final && <span>→ {slot.nextCirc.final}</span>}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* 2. PROPERES SORTIDES (< 20 MIN) */}
              {currentSubTab === 'sortides' && (
                <div className="space-y-3">
                  {data.upcomingDepartures.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-gray-50/50 dark:bg-black/10 border border-dashed border-gray-200 dark:border-white/5 space-y-2">
                      <Clock size={24} className="mx-auto text-gray-300 dark:text-gray-600" />
                      <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">
                        Cap sortida imminent de descans a {cfg.name} (&lt; 20 min)
                      </p>
                    </div>
                  ) : (
                    data.upcomingDepartures.map(slot => {
                      const remMin = Math.max(0, slot.endMin - targetMin);

                      return (
                        <div
                          key={`dep-${slot.id}`}
                          className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2.5 shadow-xs"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="px-2 py-0.5 rounded-lg bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0">
                                <ArrowUpRight size={12} />
                                Surt en {remMin}m
                              </span>
                              <span className="text-xs font-black text-[#4D5358] dark:text-white uppercase truncate">
                                {slot.driverName || 'Sense assignar'}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-gray-500 shrink-0 whitespace-nowrap">
                                ({slot.torn})
                              </span>
                            </div>

                            {slot.nextCirc && (
                              <div className="flex items-center gap-1.5 text-xs font-black text-amber-800 dark:text-amber-200">
                                <Train size={13} />
                                <span className="font-mono">{slot.nextCirc.codi}</span>
                                <span>a les {slot.nextCirc.sortida}</span>
                                {slot.nextCirc.final && <span className="text-[10px] font-bold">({slot.nextCirc.final})</span>}
                              </div>
                            )}
                          </div>

                          <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 font-medium">
                            El descans acaba a les <span className="font-bold font-mono">{slot.endTimeStr}</span>. L'agent ha d'acudir a la via per a la presa de servei.
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* 3. PROPERES ENTRADES (< 45 MIN) */}
              {currentSubTab === 'entrades' && (
                <div className="space-y-3">
                  {data.upcomingEntries.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-gray-50/50 dark:bg-black/10 border border-dashed border-gray-200 dark:border-white/5 space-y-2">
                      <Train size={24} className="mx-auto text-gray-300 dark:text-gray-600" />
                      <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">
                        Cap entrada prevista a descans a {cfg.name} (&lt; 45 min)
                      </p>
                    </div>
                  ) : (
                    data.upcomingEntries.map(entry => {
                      const minutesUntilArrival = Math.max(0, entry.arrivalMin - targetMin);

                      return (
                        <div
                          key={entry.id}
                          className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 space-y-2 shadow-xs"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="px-2 py-0.5 rounded-lg bg-blue-500 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0">
                                <ArrowDownLeft size={12} />
                                Arriba en {minutesUntilArrival}m
                              </span>
                              <span className="text-xs font-black text-[#4D5358] dark:text-white uppercase truncate">
                                {entry.driverName || 'Sense assignar'}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-gray-500 shrink-0 whitespace-nowrap">
                                ({entry.torn})
                              </span>
                            </div>

                            <span className="text-xs font-black text-blue-700 dark:text-blue-300 font-mono">
                              Arribada: {entry.arrivalTimeStr}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-gray-600 dark:text-gray-300 pt-1">
                            <span className="flex items-center gap-1.5">
                              <Train size={12} className="text-blue-500" />
                              <span>Conduint tren</span>
                              <span className="font-mono font-black">{entry.circCodi}</span>
                              {entry.circInici && <span>des de {entry.circInici}</span>}
                            </span>

                            <span className="text-emerald-600 dark:text-emerald-400">
                              Descans programat: {entry.plannedRestMin} min
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </GlassPanel>
          );
        })}
      </div>
    </div>
  );
};

export default DescansosView;
