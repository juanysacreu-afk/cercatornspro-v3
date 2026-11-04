import { supabase } from '../supabaseClient';
import { 
  getFgcMinutes, 
  resolveStationName, 
  resolveStationId, 
  normalizeCircId, 
  normalizeTimeDiffSec, 
  getShortTornId,
  isReserveShift 
} from './stations';
import { fetchLiveGeoTrenTrains, findTrainInGeoTren } from './geotrenApi';
import { decryptPhoneArray } from './crypto';
import { getFgcServiceDate } from './gipRecorder';
import type { ViatgerPassengerItem } from '../components/ViatgerInfoModal';

export interface ActiveReserveDriver {
  shiftId: string;
  shortTorn: string;
  driverName: string;
  driverNom?: string;
  driverCognoms?: string;
  nomina: string;
  dependencia: string;
  dependenciaName: string;
  iniciTorn: string;
  finalTorn: string;
  phones: string[];
  isExactStation: boolean;
}

export interface CompromisedReliefAlert {
  id: string;
  shiftId: string;
  shortTorn: string;
  driverName: string;
  nomina: string;
  phones: string[];
  travelCircId: string;
  travelFrom: string;
  travelFromName: string;
  travelTo: string;
  travelToName: string;
  travelScheduledArrival: string;
  travelArrivalMin: number;
  currentDelayMin: number;
  currentDelaySec: number;
  estimatedArrival: string;
  reliefCircId: string;
  reliefStation: string;
  reliefStationName: string;
  reliefScheduledDeparture: string;
  reliefDepartureMin: number;
  reliefCicle?: string;
  scheduledMarginMin: number;
  realMarginMin: number;
  severity: 'critical' | 'warning';
  statusMessage: string;
  availableReserves: ActiveReserveDriver[];
}

/**
 * Normalizes station code to primary BV depot/terminal code for reserve matching
 */
export const normalizeReserveStation = (code: string): string => {
  const clean = (code || '').trim().toUpperCase();
  if (clean === 'PC' || clean === 'PR' || clean === 'GR') return 'PC';
  if (clean === 'SR' || clean === 'S0' || clean === 'SG' || clean === 'MN' || clean === 'BN' || clean === 'TT') return 'SR';
  if (clean.startsWith('NA') || clean === 'N1' || clean === 'N2' || clean === 'N3') return 'NA';
  if (clean.startsWith('PN') || clean === 'P1' || clean === 'P2' || clean === 'P3' || clean === 'CT') return 'PN';
  if (clean === 'RB' || clean === 'RC' || clean === 'COR' || clean === 'SC') return 'RC';
  if (clean === 'RE' || clean === 'VR' || clean === 'TB') return 'RE';
  return clean;
};

/**
 * Cache for reserves to avoid repetitive database hits across components
 */
let reservesCache: { timestamp: number; data: ActiveReserveDriver[] } | null = null;
const RESERVES_CACHE_TTL_MS = 60000; // 1 minute

/**
 * Fetches all available operational reserve drivers currently on duty
 */
export async function fetchActiveReserveDrivers(
  targetStationCode?: string,
  targetTimeStr?: string,
  forceRefresh = false
): Promise<ActiveReserveDriver[]> {
  const now = Date.now();
  let allReserves: ActiveReserveDriver[] = [];

  if (!forceRefresh && reservesCache && now - reservesCache.timestamp < RESERVES_CACHE_TTL_MS) {
    allReserves = reservesCache.data;
  } else {
    try {
      // 1. Query shifts that are reserves (QR..., RS..., or no commercial circulations)
      const { data: shiftsData } = await supabase
        .from('shifts')
        .select('id, inici_torn, final_torn, dependencia, circulations, servei')
        .or('id.ilike.QR%,dependencia.not.is.null')
        .range(0, 1000);

      const candidateReserveShifts = (shiftsData || []).filter(s => isReserveShift(s));

      if (candidateReserveShifts.length > 0) {
        const shiftIds = candidateReserveShifts.map(s => s.id);
        const shortIds = candidateReserveShifts.map(s => getShortTornId(s.id));
        const allLookups = Array.from(new Set([...shiftIds, ...shortIds]));

        // 2. Fetch driver assignments for these shifts
        const { data: assignments } = await supabase
          .from('daily_assignments')
          .select('torn, nom, cognoms, empleat_id, hora_inici, hora_fi')
          .in('torn', allLookups);

        const empIds = Array.from(new Set((assignments || []).map(a => a.empleat_id).filter(Boolean)));
        const phoneMap: Record<string, string[]> = {};

        if (empIds.length > 0) {
          const { data: phones } = await supabase
            .from('phonebook')
            .select('nomina, phones')
            .in('nomina', empIds);

          if (phones) {
            await Promise.all(phones.map(async p => {
              const dec = await decryptPhoneArray(p.phones);
              phoneMap[String(p.nomina)] = dec.filter(Boolean);
            }));
          }
        }

        allReserves = candidateReserveShifts.map(s => {
          const shortId = getShortTornId(s.id);
          const assign = (assignments || []).find(a => a.torn === s.id || a.torn === shortId);
          const dep = (s.dependencia || 'PC').trim().toUpperCase();

          return {
            shiftId: s.id,
            shortTorn: shortId,
            driverName: assign ? `${assign.cognoms}, ${assign.nom}` : shortId,
            driverNom: assign?.nom,
            driverCognoms: assign?.cognoms,
            nomina: assign?.empleat_id || '',
            dependencia: dep,
            dependenciaName: resolveStationName(dep),
            iniciTorn: assign?.hora_inici || s.inici_torn || '--:--',
            finalTorn: assign?.hora_fi || s.final_torn || '--:--',
            phones: assign?.empleat_id ? (phoneMap[String(assign.empleat_id)] || []) : [],
            isExactStation: false
          };
        });

        reservesCache = { timestamp: now, data: allReserves };
      }
    } catch (err) {
      console.warn('[ReliefWatchdog] Error loading reserves:', err);
    }
  }

  // Filter and sort reserves
  let filtered = [...allReserves];

  // Filter by time window if specified
  if (targetTimeStr) {
    const targetMin = getFgcMinutes(targetTimeStr);
    if (targetMin !== null) {
      filtered = filtered.filter(r => {
        const startMin = getFgcMinutes(r.iniciTorn);
        let endMin = getFgcMinutes(r.finalTorn);
        if (startMin === null || endMin === null) return true;
        if (endMin < startMin) endMin += 1440; // overnight shift
        let evalMin = targetMin;
        if (evalMin < startMin && evalMin + 1440 <= endMin) evalMin += 1440;
        return evalMin >= (startMin - 15) && evalMin <= (endMin + 15);
      });
    }
  }

  // Prioritize reserves at the target station
  if (targetStationCode) {
    const targetNorm = normalizeReserveStation(targetStationCode);
    filtered.forEach(r => {
      const rNorm = normalizeReserveStation(r.dependencia);
      r.isExactStation = (rNorm === targetNorm);
    });

    // Sort exact station matches first
    filtered.sort((a, b) => {
      if (a.isExactStation && !b.isExactStation) return -1;
      if (!a.isExactStation && b.isExactStation) return 1;
      return a.shortTorn.localeCompare(b.shortTorn);
    });
  }

  return filtered;
}

/**
 * Gets live delay and tracking status for a circulation
 */
export async function getCirculationLiveDelay(
  circId: string,
  targetDate?: string
): Promise<{ delaySec: number; delayMin: number; lastStation: string; isLive: boolean }> {
  const cleanId = (circId || '').trim().toUpperCase();
  if (!cleanId) return { delaySec: 0, delayMin: 0, lastStation: '', isLive: false };

  try {
    // 1. Check live GeoTren telemetry
    const liveTrains = await fetchLiveGeoTrenTrains().catch(() => []);
    const matchingTrain = findTrainInGeoTren(liveTrains, [cleanId, normalizeCircId(cleanId)]);
    if (matchingTrain) {
      const isParked = !!matchingTrain.estacionat_a;
      const lastSt = matchingTrain.estacionat_a || matchingTrain.properes_parades?.[0] || '';
      // If train has retard property in seconds
      const rawRetard = (matchingTrain as any).retard;
      if (typeof rawRetard === 'number') {
        const dSec = Math.max(0, rawRetard);
        return {
          delaySec: dSec,
          delayMin: Math.round(dSec / 60),
          lastStation: lastSt,
          isLive: true
        };
      }
    }

    // 2. Fallback to today's GIP passages
    const sDate = targetDate || getFgcServiceDate();
    const candidateIds = [cleanId, normalizeCircId(cleanId)];
    const digits = cleanId.replace(/\D/g, '');
    if (digits) {
      candidateIds.push(digits.padStart(3, '0'));
      candidateIds.push(parseInt(digits, 10).toString());
    }

    const { data: gipRecords } = await supabase
      .from('gip_registre_pas')
      .select('estacio_codi, diferencia_segons, hora_teorica, hora_real')
      .eq('data_servei', sDate)
      .in('circulacio_id', candidateIds)
      .order('id', { ascending: false })
      .limit(1);

    if (gipRecords && gipRecords.length > 0) {
      const rec = gipRecords[0];
      const diffSec = normalizeTimeDiffSec(rec.diferencia_segons);
      const dSec = Math.max(0, diffSec);
      return {
        delaySec: dSec,
        delayMin: Math.round(dSec / 60),
        lastStation: rec.estacio_codi || '',
        isLive: true
      };
    }
  } catch (err) {
    console.warn('[ReliefWatchdog] Error fetching live delay for circ ' + cleanId, err);
  }

  return { delaySec: 0, delayMin: 0, lastStation: '', isLive: false };
}

/**
 * Evaluates a single passenger's relief connection
 */
export async function evaluatePassengerRelief(
  passenger: ViatgerPassengerItem,
  circDelaySec?: number,
  circDelayMin?: number
): Promise<ViatgerPassengerItem> {
  if (!passenger.nextCirc) {
    return passenger;
  }

  const travelCirc = passenger.nextCirc ? passenger : null;
  const nextCirc = passenger.nextCirc;
  const schedMargin = nextCirc.scheduledMarginMin ?? 0;

  // If delay is provided directly use it, otherwise fetch
  let delaySec = circDelaySec;
  let delayMin = circDelayMin;

  if (delaySec === undefined) {
    const travelId = (passenger as any).travelCircId || passenger.from;
    const live = await getCirculationLiveDelay(travelId);
    delaySec = live.delaySec;
    delayMin = live.delayMin;
  } else if (delayMin === undefined) {
    delayMin = Math.round(delaySec / 60);
  }

  const effectiveDelayMin = delayMin || 0;
  const realMargin = schedMargin - effectiveDelayMin;

  // Format estimated arrival
  let estArrival = passenger.arribada || '--:--';
  if (passenger.arribada && effectiveDelayMin > 0) {
    const arrMin = getFgcMinutes(passenger.arribada);
    if (arrMin !== null) {
      const newTotal = arrMin + effectiveDelayMin;
      const h = Math.floor(newTotal / 60) % 24;
      const m = Math.floor(newTotal % 60);
      estArrival = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
  }

  // User Rule: Only alert if the subsequent circulation will depart with MORE than 3 minutes of delay.
  // Next circulation departure delay = arrival time of driver - scheduled departure = delayMin - schedMargin.
  const projectedDepartureDelayMin = effectiveDelayMin - schedMargin;
  const isCompromised = projectedDepartureDelayMin > 3;
  const isCritical = projectedDepartureDelayMin >= 5;
  const isWarning = isCompromised && !isCritical;

  let availableReserves: ActiveReserveDriver[] = [];
  if (isCompromised) {
    availableReserves = await fetchActiveReserveDrivers(
      nextCirc.inici,
      nextCirc.sortida
    );
  }

  let message = '';
  if (isCompromised) {
    message = `Sortida compromesa! El tren ${nextCirc.codi} sortirà amb +${projectedDepartureDelayMin} min de retard a ${nextCirc.iniciName} (arribada maquinista: ${estArrival}, sortida teòrica: ${nextCirc.sortida}).`;
  }

  return {
    ...passenger,
    reliefAlert: {
      isCompromised,
      severity: isCritical ? 'critical' : 'warning',
      delayMin: effectiveDelayMin,
      delaySec: delaySec || 0,
      estimatedArrival: estArrival,
      realMarginMin: realMargin,
      message,
      availableReserves
    }
  };
}

/**
 * Global Relief Watchdog: Scans all viatgers today to find compromised relief connections
 */
export async function fetchGlobalCompromisedReliefs(
  servei?: string
): Promise<CompromisedReliefAlert[]> {
  try {
    let q = supabase
      .from('shifts')
      .select('id, circulations, inici_torn, final_torn, dependencia, servei')
      .contains('circulations', JSON.stringify([{ codi: 'Viatger' }]));

    if (servei && servei !== 'Tots') {
      const normalized = (servei === '000' || servei === '0') ? ['0', '000'] : [servei];
      q = q.in('servei', normalized);
    }

    const { data: shifts } = await q;
    if (!shifts || shifts.length === 0) return [];

    // Extract all candidate travel circulations
    const candidates: Array<{
      shiftId: string;
      travelCircId: string;
      from: string;
      to: string;
      sortida: string;
      arribada: string;
      nextCirc: any;
    }> = [];

    shifts.forEach(s => {
      if (!s.circulations) return;
      const circs = s.circulations as any[];
      circs.forEach((c, idx) => {
        if (c.codi === 'Viatger' && c.observacions) {
          const parts = c.observacions.split('-');
          if (parts.length >= 1) {
            const travelId = parts[0]?.trim().toUpperCase();
            const from = (parts[1] || '??').trim().toUpperCase();
            const to = (parts[2] || '??').trim().toUpperCase();

            // Find next driving circ
            let nextCirc: any = null;
            for (let j = idx + 1; j < circs.length; j++) {
              const cand = circs[j];
              const cCode = (cand.codi || '').trim();
              if (cCode && cCode !== '-' && cCode !== 'Viatger' && cCode !== 'RESERVA') {
                nextCirc = cand;
                break;
              }
            }

            if (travelId && nextCirc) {
              candidates.push({
                shiftId: s.id,
                travelCircId: travelId,
                from,
                to,
                sortida: c.sortida || '',
                arribada: c.arribada || '',
                nextCirc
              });
            }
          }
        }
      });
    });

    if (candidates.length === 0) return [];

    // Get live GeoTren trains
    const liveTrains = await fetchLiveGeoTrenTrains().catch(() => []);

    // Get today's GIP passages for all candidate travel trains
    const uniqueTravelIds = Array.from(new Set(candidates.map(c => c.travelCircId)));
    const todayDate = getFgcServiceDate();

    const { data: gipPassages } = await supabase
      .from('gip_registre_pas')
      .select('circulacio_id, diferencia_segons, estacio_codi')
      .eq('data_servei', todayDate)
      .in('circulacio_id', uniqueTravelIds)
      .order('id', { ascending: false });

    const delayMap = new Map<string, number>();
    if (gipPassages) {
      gipPassages.forEach(g => {
        const cid = g.circulacio_id?.trim().toUpperCase();
        if (cid && !delayMap.has(cid)) {
          const diffSec = normalizeTimeDiffSec(g.diferencia_segons);
          delayMap.set(cid, Math.max(0, diffSec));
        }
      });
    }

    // Check live GeoTren trains
    liveTrains.forEach(lt => {
      const cCode = lt.circCode?.trim().toUpperCase();
      if (cCode && uniqueTravelIds.includes(cCode)) {
        const raw = (lt as any).retard;
        if (typeof raw === 'number' && raw > 0) {
          delayMap.set(cCode, raw);
        }
      }
    });

    // Fetch assignments and phones for candidate shifts
    const shiftLookups = candidates.map(c => c.shiftId);
    const shortLookups = candidates.map(c => getShortTornId(c.shiftId));
    const allLookups = Array.from(new Set([...shiftLookups, ...shortLookups]));

    const { data: assignments } = await supabase
      .from('daily_assignments')
      .select('torn, nom, cognoms, empleat_id')
      .in('torn', allLookups);

    const empIds = Array.from(new Set((assignments || []).map(a => a.empleat_id).filter(Boolean)));
    const phoneMap: Record<string, string[]> = {};
    if (empIds.length > 0) {
      const { data: phones } = await supabase
        .from('phonebook')
        .select('nomina, phones')
        .in('nomina', empIds);
      if (phones) {
        await Promise.all(phones.map(async p => {
          const dec = await decryptPhoneArray(p.phones);
          phoneMap[String(p.nomina)] = dec.filter(Boolean);
        }));
      }
    }

    const alerts: CompromisedReliefAlert[] = [];

    for (const cand of candidates) {
      const delaySec = delayMap.get(cand.travelCircId) || 0;
      const delayMin = Math.round(delaySec / 60);

      const vArrMin = getFgcMinutes(cand.arribada);
      const nextDepMin = getFgcMinutes(cand.nextCirc.sortida);

      if (vArrMin === null || nextDepMin === null) continue;

      const schedMargin = nextDepMin >= vArrMin ? (nextDepMin - vArrMin) : (nextDepMin + 1440 - vArrMin);
      const departureDelayMin = delayMin - schedMargin;
      const realMargin = schedMargin - delayMin;

      // User Rule: Only alert if the next circulation departs with MORE than 3 minutes of delay
      if (departureDelayMin <= 3) {
        continue;
      }

      const isCritical = departureDelayMin >= 5;
      const isWarning = !isCritical;

      if (isCritical || isWarning) {
        const shortTorn = getShortTornId(cand.shiftId);
        const assign = (assignments || []).find(a => a.torn === cand.shiftId || a.torn === shortTorn);
        const driverName = assign ? `${assign.cognoms}, ${assign.nom}` : shortTorn;
        const nomina = assign?.empleat_id || '';
        const phones = nomina ? (phoneMap[String(nomina)] || []) : [];

        const nextInici = (cand.nextCirc.inici || cand.to).trim().toUpperCase();
        const nextIniciName = resolveStationName(nextInici);

        // Fetch active reserves for that station
        const availableReserves = await fetchActiveReserveDrivers(nextInici, cand.nextCirc.sortida);

        // Calculate estimated arrival
        let estArrival = cand.arribada;
        if (cand.arribada && delayMin > 0) {
          const newTotal = vArrMin + delayMin;
          const h = Math.floor(newTotal / 60) % 24;
          const m = Math.floor(newTotal % 60);
          estArrival = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        }

        const alertId = `RELIEF-${cand.shiftId}-${cand.travelCircId}-${cand.nextCirc.codi}`;
        const statusMessage = `El tren ${cand.nextCirc.codi} sortirà amb +${departureDelayMin} min de retard a ${nextIniciName} perquè l'agent #nom té arribada estimada a les ${estArrival} (sortida prevista: ${cand.nextCirc.sortida}).`;

        alerts.push({
          id: alertId,
          shiftId: cand.shiftId,
          shortTorn,
          driverName,
          nomina,
          phones,
          travelCircId: cand.travelCircId,
          travelFrom: cand.from,
          travelFromName: resolveStationName(cand.from),
          travelTo: cand.to,
          travelToName: resolveStationName(cand.to),
          travelScheduledArrival: cand.arribada,
          travelArrivalMin: vArrMin,
          currentDelayMin: delayMin,
          currentDelaySec: delaySec,
          estimatedArrival: estArrival,
          reliefCircId: (cand.nextCirc.codi || '').trim().toUpperCase(),
          reliefStation: nextInici,
          reliefStationName: nextIniciName,
          reliefScheduledDeparture: cand.nextCirc.sortida || '--:--',
          reliefDepartureMin: nextDepMin,
          reliefCicle: cand.nextCirc.cicle,
          scheduledMarginMin: schedMargin,
          realMarginMin: realMargin,
          severity: isCritical ? 'critical' : 'warning',
          statusMessage: statusMessage.replace('#nom', driverName),
          availableReserves
        });
      }
    }

    return alerts;
  } catch (err) {
    console.error('[ReliefWatchdog] Exception calculating global compromised reliefs:', err);
    return [];
  }
}
