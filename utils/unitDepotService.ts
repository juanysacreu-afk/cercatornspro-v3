import { supabase } from '../supabaseClient';
import { getFgcMinutes } from './stations';
import type { Assignment } from '../types';

export type DepotId = 'NA' | 'PN' | 'RE' | 'SR' | 'PC' | 'RB';

export interface DepotTrackConfig {
  id: string;
  label: string;
  capacity: number;
}

export interface DepotSectionConfig {
  name: string;
  tracks: DepotTrackConfig[];
}

export interface DepotConfig {
  id: DepotId;
  label: string;
  totalCapacity: number;
  sections: DepotSectionConfig[];
}

/**
 * Full layout of FGC BV train depots and tracks with official capacities
 */
export const OFFICIAL_DEPOT_CONFIGS: Record<DepotId, DepotConfig> = {
  'PC': {
    id: 'PC',
    label: 'Plaça Catalunya',
    totalCapacity: 5,
    sections: [
      {
        name: 'Estació',
        tracks: [
          { id: '1', label: 'Via 1', capacity: 1 },
          { id: '2', label: 'Via 2', capacity: 1 },
          { id: '3', label: 'Via 3', capacity: 1 },
          { id: '4', label: 'Via 4', capacity: 1 },
          { id: '5', label: 'Via 5', capacity: 1 }
        ]
      }
    ]
  },
  'RE': {
    id: 'RE',
    label: 'Reina Elisenda',
    totalCapacity: 6,
    sections: [
      {
        name: 'Depòsit',
        tracks: [
          { id: '1', label: 'Via 1', capacity: 3 },
          { id: '2', label: 'Via 2', capacity: 3 }
        ]
      }
    ]
  },
  'NA': {
    id: 'NA',
    label: 'Terrassa (Can Roca / Nacions Unides)',
    totalCapacity: 15,
    sections: [
      {
        name: 'Depòsit Can Roca',
        tracks: [
          { id: 'D1', label: 'Via 1 (Dep.)', capacity: 2 },
          { id: 'D2', label: 'Via 2 (Dep.)', capacity: 2 },
          { id: 'D3', label: 'Via 3 (Dep.)', capacity: 2 },
          { id: 'D4', label: 'Via 4 (Dep.)', capacity: 2 }
        ]
      },
      {
        name: 'Zona Maniobres',
        tracks: [
          { id: 'M1', label: 'Via 1 (Man.)', capacity: 2 },
          { id: 'M2', label: 'Via 2 (Man.)', capacity: 1 }
        ]
      },
      {
        name: 'Estació Nacions Unides',
        tracks: [
          { id: 'E1', label: 'Via 1 (Est.)', capacity: 2 },
          { id: 'E2', label: 'Via 2 (Est.)', capacity: 2 }
        ]
      }
    ]
  },
  'PN': {
    id: 'PN',
    label: 'Sabadell (Ca n\'Oriac / Parc del Nord)',
    totalCapacity: 12,
    sections: [
      {
        name: 'Depòsit Ca n\'Oriac',
        tracks: [
          { id: '1A', label: 'Via 1A', capacity: 2 },
          { id: '2B', label: 'Via 2B', capacity: 2 },
          { id: '1B', label: 'Via 1B', capacity: 1 },
          { id: '0A', label: 'Via 0A', capacity: 1 },
          { id: '0B', label: 'Via 0B', capacity: 1 },
          { id: '2A', label: 'Via 2A', capacity: 1 }
        ]
      },
      {
        name: 'Estació Parc del Nord',
        tracks: [
          { id: 'E1', label: 'Via 1', capacity: 2 },
          { id: 'E2', label: 'Via 2', capacity: 2 }
        ]
      }
    ]
  },
  'SR': {
    id: 'SR',
    label: 'Sarrià',
    totalCapacity: 5,
    sections: [
      {
        name: 'Estació i Vies de Cua',
        tracks: [
          { id: '1', label: 'Via 1', capacity: 1 },
          { id: '2', label: 'Via 2', capacity: 1 },
          { id: '3', label: 'Via 3', capacity: 1 },
          { id: '4', label: 'Via 4', capacity: 1 },
          { id: '0', label: 'Via 0 (Cua Man.)', capacity: 1 }
        ]
      }
    ]
  },
  'RB': {
    id: 'RB',
    label: 'Rubí (COR)',
    totalCapacity: 28,
    sections: [
      {
        name: 'Platja de Vies',
        tracks: [
          { id: '4', label: 'Via 4', capacity: 6 },
          { id: '6', label: 'Via 6', capacity: 6 },
          { id: '8', label: 'Via 8', capacity: 3 },
          { id: '10', label: 'Via 10', capacity: 2 }
        ]
      },
      {
        name: 'Taller',
        tracks: [
          { id: '1', label: 'Via 1 (Torn)', capacity: 2 },
          { id: '9', label: 'Via 9', capacity: 1 },
          { id: '11', label: 'Via 11', capacity: 1 },
          { id: '13', label: 'Via 13', capacity: 1 },
          { id: '15', label: 'Via 15', capacity: 1 },
          { id: '17', label: 'Via 17', capacity: 1 },
          { id: '19', label: 'Via 19', capacity: 1 }
        ]
      },
      {
        name: 'IF (Instal·lacions Fixes)',
        tracks: [
          { id: '21', label: 'Via 21', capacity: 1 },
          { id: '23', label: 'Via 23', capacity: 1 },
          { id: '25', label: 'Via 25', capacity: 1 }
        ]
      }
    ]
  }
};

/**
 * Maps any station code, terminal or depot code to the official depot ID
 */
export const mapStationToDepot = (stationCode: string): DepotId => {
  if (!stationCode) return 'RB';
  const clean = stationCode.trim().toUpperCase();

  // Rubí / COR
  if (clean === 'RB' || clean === 'COR' || clean.startsWith('RB')) return 'RB';

  // Reina Elisenda / Vies RE
  if (clean === 'VR' || clean === 'RE' || clean === 'DRE') return 'RE';

  // Terrassa (Nacions Unides, Can Roca, N1, N2, N3, DNA)
  if (
    clean === 'NA' || clean === 'N1' || clean === 'N2' || clean === 'N3' ||
    clean === 'DNA' || clean.startsWith('NA') || /^N\d/.test(clean)
  ) return 'NA';

  // Sabadell (Parc del Nord, Ca n'Oriac, P1, P2, P3, DPN)
  if (
    clean === 'PN' || clean === 'P1' || clean === 'P2' || clean === 'P3' ||
    clean === 'DPN' || clean.startsWith('PN') || /^P\d/.test(clean)
  ) return 'PN';

  // Plaça Catalunya
  if (clean === 'PC') return 'PC';

  // Sarrià
  if (clean === 'SR' || clean === 'S0' || clean.startsWith('SR') || clean === 'SAR') return 'SR';

  // Av. Tibidabo: 114s retire to RE or PC
  if (clean === 'TB') return 'RE';

  return 'RB';
};

export interface CycleCirculationItem {
  codi: string;
  sortida: string;
  arribada: string;
  inici: string;
  final: string;
  linia?: string;
  sortidaMin: number;
  arribadaMin: number;
}

export interface DecodedCycleInfo {
  cycleId: string;
  startDepot: DepotId;
  endDepot: DepotId;
  circulations: CycleCirculationItem[];
  firstCirc?: CycleCirculationItem;
  lastCirc?: CycleCirculationItem;
}

/**
 * Decodes start and destination depot for an FGC cycle based on letters and circulations
 * E.g. RBVR1 -> Starts at VR (RE), Ends at RB (RB)
 * E.g. N1RB1 -> Starts at RB, Ends at N1 (NA)
 */
export const decodeCycleDepots = (
  cycleId: string,
  circulations: CycleCirculationItem[] = []
): { startDepot: DepotId; endDepot: DepotId } => {
  const clean = (cycleId || '').trim().toUpperCase();

  let startDepot: DepotId = 'RB';
  let endDepot: DepotId = 'RB';

  // Check from circulations first (ground truth)
  if (circulations.length > 0) {
    const first = circulations[0];
    const last = circulations[circulations.length - 1];
    if (first?.inici) startDepot = mapStationToDepot(first.inici);
    if (last?.final) endDepot = mapStationToDepot(last.final);
  } else {
    // Decode from code letters: [DEST(2)][ORIG(2)][NUM]
    // Examples: RBVR1 -> Dest: RB, Orig: VR
    //           VRRB1 -> Dest: VR, Orig: RB
    //           N1RB1 -> Dest: N1 (NA), Orig: RB
    //           P1RB1 -> Dest: P1 (PN), Orig: RB
    if (clean.length >= 4) {
      const destPrefix = clean.substring(0, 2);
      const origPrefix = clean.substring(2, 4);
      endDepot = mapStationToDepot(destPrefix);
      startDepot = mapStationToDepot(origPrefix);
    }
  }

  return { startDepot, endDepot };
};

/**
 * Fetches all shifts and circulations to build an authoritative cycle circulation map
 */
export const fetchFullCycleCirculationsMap = async (
  servei?: string
): Promise<Record<string, DecodedCycleInfo>> => {
  try {
    let qShifts = supabase.from('shifts').select('id, circulations, servei');
    if (servei && servei !== 'Tots') {
      const sFilter = (servei === '000' || servei === '0') ? ['0', '000'] : [servei];
      qShifts = qShifts.in('servei', sFilter);
    }

    let qCircs = supabase.from('circulationsv2').select('id, inici, final, linia, sortida, arribada, servei');
    if (servei && servei !== 'Tots') {
      const sFilter = (servei === '000' || servei === '0') ? '000' : servei;
      qCircs = qCircs.eq('servei', sFilter);
    }

    const [shiftsRes, circsRes] = await Promise.all([qShifts, qCircs]);

    const circDetailsMap = new Map<string, { inici: string; final: string; linia: string; sortida: string; arribada: string }>();
    if (circsRes.data) {
      circsRes.data.forEach((c: any) => {
        if (c.id) {
          circDetailsMap.set(c.id.trim().toUpperCase(), {
            inici: c.inici || '',
            final: c.final || '',
            linia: c.linia || '',
            sortida: c.sortida || '',
            arribada: c.arribada || ''
          });
        }
      });
    }

    const rawCycleCircs: Record<string, CycleCirculationItem[]> = {};

    if (shiftsRes.data) {
      shiftsRes.data.forEach((s: any) => {
        if (!s.circulations) return;
        (s.circulations as any[]).forEach((c: any) => {
          const cicle = (c.cicle || '').trim().toUpperCase();
          const codi = (c.codi || '').trim().toUpperCase();
          if (!cicle || !codi || codi === '-' || codi === 'VIATGER' || codi === 'RESERVA') return;

          const meta = circDetailsMap.get(codi);
          const sortidaStr = c.sortida || meta?.sortida || '';
          const arribadaStr = c.arribada || meta?.arribada || '';
          const sortidaMin = getFgcMinutes(sortidaStr) ?? 0;
          const arribadaMin = getFgcMinutes(arribadaStr) ?? sortidaMin;

          if (!rawCycleCircs[cicle]) rawCycleCircs[cicle] = [];

          // Avoid duplicate circulations across multiple shifts sharing the train
          if (!rawCycleCircs[cicle].some(item => item.codi === codi)) {
            rawCycleCircs[cicle].push({
              codi,
              sortida: sortidaStr,
              arribada: arribadaStr,
              inici: c.inici || meta?.inici || '',
              final: c.final || meta?.final || '',
              linia: c.linia || meta?.linia || '',
              sortidaMin,
              arribadaMin
            });
          }
        });
      });
    }

    const result: Record<string, DecodedCycleInfo> = {};

    Object.entries(rawCycleCircs).forEach(([cicle, circList]) => {
      // Sort chronologically by sortidaMin
      circList.sort((a, b) => a.sortidaMin - b.sortidaMin);

      const firstCirc = circList[0];
      const lastCirc = circList[circList.length - 1];
      const { startDepot, endDepot } = decodeCycleDepots(cicle, circList);

      result[cicle] = {
        cycleId: cicle,
        startDepot,
        endDepot,
        circulations: circList,
        firstCirc,
        lastCirc
      };
    });

    return result;
  } catch (err) {
    console.error('Error fetching cycle circulations map:', err);
    return {};
  }
};

export type UnitOperationalStatus = 
  | 'CIRCULATING'
  | 'WAITING_NEXT'
  | 'BEFORE_CYCLE'
  | 'CYCLE_FINISHED'
  | 'UNASSIGNED_SPARE'
  | 'MAINTENANCE';

export interface UnitCalculatedPlacement {
  unitNumber: string;
  cycleId?: string;
  status: UnitOperationalStatus;
  statusLabel: string;
  depotId: DepotId | null; // null if actively circulating or waiting on line
  depotName?: string;
  trackId?: string;
  trackLabel?: string;
  reason: string;
  currentStation?: string;
  currentCirculation?: string;
  nextCirculation?: string;
  nextTime?: string;
}

export interface AutoPlacementResult {
  timestamp: string;
  mode: 'current_time' | 'end_of_service' | 'REAL_TIME' | 'END_OF_SERVICE';
  totalUnits: number;
  circulatingCount: number;
  waitingCount: number;
  parkedCount: number;
  placements: UnitCalculatedPlacement[];
  depotBreakdown: Record<DepotId, {
    label: string;
    capacity: number;
    units: UnitCalculatedPlacement[];
    occupiedCount: number;
    tracks: Record<string, { label: string; capacity: number; units: string[] }>;
  }>;
  parkedUnitsToUpsert: Array<{
    unit_number: string;
    depot_id: string;
    track: string;
    updated_at: string;
  }>;
}

export type CalculateDepotPlacementsResult = AutoPlacementResult;

/**
 * Core algorithm: Calculates where every unit in the fleet should be placed
 */
export const calculateFleetDepotPlacements = (params: {
  allFleetTrains: string[];
  assignments: Assignment[];
  cyclesMap?: Record<string, DecodedCycleInfo>;
  cycleCirculationsMap?: Record<string, DecodedCycleInfo>;
  brokenTrains: Set<string>;
  cleaningTrains: Set<string>;
  imageTrains: Set<string>;
  recordTrains: Set<string>;
  currentTimeMin?: number;
  mode?: 'current_time' | 'end_of_service' | 'REAL_TIME' | 'END_OF_SERVICE';
}): AutoPlacementResult => {
  const {
    allFleetTrains,
    assignments,
    brokenTrains,
    cleaningTrains,
    imageTrains,
    recordTrains,
    currentTimeMin,
    mode = 'end_of_service'
  } = params;

  const cyclesMap = params.cyclesMap || params.cycleCirculationsMap || {};

  const currentFgcNow = getFgcMinutes(new Date().toTimeString().slice(0, 5)) ?? 0;
  const nowMin = currentTimeMin !== undefined ? currentTimeMin : currentFgcNow;
  const isEndOfService = mode === 'end_of_service' || mode === 'END_OF_SERVICE';

  // Unit to cycle mapping
  const unitToCycleMap = new Map<string, string>();
  assignments.forEach(a => {
    if (a.train_number && a.cycle_id) {
      unitToCycleMap.set(a.train_number.trim(), a.cycle_id.trim().toUpperCase());
    }
  });

  const calculatedUnits: UnitCalculatedPlacement[] = [];

  // 1. Process each unit to determine its state and target depot
  allFleetTrains.forEach(unit => {
    const isBroken = brokenTrains.has(unit);
    const isCleaning = cleaningTrains.has(unit);
    const isImages = imageTrains.has(unit);
    const isRecords = recordTrains.has(unit);
    const isMaint = isBroken || isCleaning || isImages || isRecords;

    const cycleId = unitToCycleMap.get(unit);

    if (isMaint) {
      calculatedUnits.push({
        unitNumber: unit,
        cycleId,
        status: 'MAINTENANCE',
        statusLabel: isBroken ? 'Avariat' : isCleaning ? 'Neteja' : 'Revisió',
        depotId: 'RB',
        reason: isBroken ? 'Unitat avariada al Taller de Rubí (COR)' : 'Manteniment/Neteja a Rubí (COR)'
      });
      return;
    }

    if (!cycleId) {
      // Unassigned spare unit
      calculatedUnits.push({
        unitNumber: unit,
        status: 'UNASSIGNED_SPARE',
        statusLabel: 'Reserva Disponible',
        depotId: 'RB',
        reason: 'Sense cicle assignat. Estacionada a Platja de Vies de Rubí (COR)'
      });
      return;
    }

    const cycleInfo = cyclesMap[cycleId];

    if (!cycleInfo || !cycleInfo.circulations || cycleInfo.circulations.length === 0) {
      // Fallback: decode from cycle name
      const { endDepot } = decodeCycleDepots(cycleId);
      calculatedUnits.push({
        unitNumber: unit,
        cycleId,
        status: 'CYCLE_FINISHED',
        statusLabel: 'Cicle Finalitzat',
        depotId: endDepot,
        reason: `Final de servei del cicle ${cycleId} a ${OFFICIAL_DEPOT_CONFIGS[endDepot]?.label || endDepot}`
      });
      return;
    }

    const circs = cycleInfo.circulations;
    const firstCirc = circs[0];
    const lastCirc = circs[circs.length - 1];

    if (isEndOfService) {
      // End of service mode: all trains with cycles are parked at their final withdrawal depot
      const finalDepot = cycleInfo.endDepot;
      calculatedUnits.push({
        unitNumber: unit,
        cycleId,
        status: 'CYCLE_FINISHED',
        statusLabel: 'Retirat a Dipòsit',
        depotId: finalDepot,
        currentStation: lastCirc.final,
        currentCirculation: lastCirc.codi,
        reason: `Finalitzat servei del cicle ${cycleId} a ${lastCirc.final} (${lastCirc.arribada}). Retirat a dipòsit ${finalDepot}.`
      });
      return;
    }

    // Current time mode: evaluate real-time circulation progress
    if (nowMin < firstCirc.sortidaMin) {
      // Before start of cycle
      const startDepot = cycleInfo.startDepot;
      calculatedUnits.push({
        unitNumber: unit,
        cycleId,
        status: 'BEFORE_CYCLE',
        statusLabel: 'Pendent d\'Inici',
        depotId: startDepot,
        nextCirculation: firstCirc.codi,
        nextTime: firstCirc.sortida,
        reason: `Pendent d'iniciar cicle ${cycleId}. Primer tren: ${firstCirc.codi} a les ${firstCirc.sortida} des de ${firstCirc.inici}.`
      });
      return;
    }

    if (nowMin >= lastCirc.arribadaMin) {
      // After last circulation
      const endDepot = cycleInfo.endDepot;
      calculatedUnits.push({
        unitNumber: unit,
        cycleId,
        status: 'CYCLE_FINISHED',
        statusLabel: 'Finalitzat',
        depotId: endDepot,
        currentStation: lastCirc.final,
        reason: `Cicle ${cycleId} finalitzat a ${lastCirc.final} a les ${lastCirc.arribada}. Estacionat a dipòsit ${endDepot}.`
      });
      return;
    }

    // Between first and last: find active or waiting
    const activeCirc = circs.find(c => nowMin >= c.sortidaMin && nowMin <= c.arribadaMin);
    if (activeCirc) {
      calculatedUnits.push({
        unitNumber: unit,
        cycleId,
        status: 'CIRCULATING',
        statusLabel: 'En Circulació',
        depotId: null, // Active on track
        currentCirculation: activeCirc.codi,
        currentStation: `${activeCirc.inici} → ${activeCirc.final}`,
        nextTime: activeCirc.arribada,
        reason: `Circulant amb tren ${activeCirc.codi} (${activeCirc.inici} → ${activeCirc.final}). Arribada: ${activeCirc.arribada}.`
      });
      return;
    }

    // In turnaround dwell between circulations
    const nextCircIdx = circs.findIndex(c => c.sortidaMin > nowMin);
    if (nextCircIdx > 0) {
      const prevCirc = circs[nextCircIdx - 1];
      const nextCirc = circs[nextCircIdx];
      const dwellMinutes = nextCirc.sortidaMin - prevCirc.arribadaMin;

      // If dwell is very long (> 120 mins) at a depot station, can consider parked
      const isDepotStation = ['RB', 'NA', 'PN', 'RE', 'SR', 'PC'].includes(prevCirc.final);
      if (dwellMinutes >= 120 && isDepotStation) {
        const dId = mapStationToDepot(prevCirc.final);
        calculatedUnits.push({
          unitNumber: unit,
          cycleId,
          status: 'WAITING_NEXT',
          statusLabel: 'Estacionat Temporal',
          depotId: dId,
          currentStation: prevCirc.final,
          nextCirculation: nextCirc.codi,
          nextTime: nextCirc.sortida,
          reason: `Estacionat a ${prevCirc.final} (${dwellMinutes} min de marge). Proper tren: ${nextCirc.codi} a les ${nextCirc.sortida}.`
        });
      } else {
        // Dwell on platform/station
        calculatedUnits.push({
          unitNumber: unit,
          cycleId,
          status: 'WAITING_NEXT',
          statusLabel: 'Esperant a Estació',
          depotId: null,
          currentStation: prevCirc.final,
          nextCirculation: nextCirc.codi,
          nextTime: nextCirc.sortida,
          reason: `A estació ${prevCirc.final}. Propera sortida: ${nextCirc.codi} a les ${nextCirc.sortida}.`
        });
      }
      return;
    }

    // Fallback: cycle finished
    calculatedUnits.push({
      unitNumber: unit,
      cycleId,
      status: 'CYCLE_FINISHED',
      statusLabel: 'Finalitzat',
      depotId: cycleInfo.endDepot,
      reason: `Cicle ${cycleId} completat.`
    });
  });

  // 2. Track allocation within each depot respecting capacities
  const depotBreakdown: Record<DepotId, {
    label: string;
    capacity: number;
    units: UnitCalculatedPlacement[];
    occupiedCount: number;
    tracks: Record<string, { label: string; capacity: number; units: string[] }>;
  }> = {
    'PC': { label: 'Plaça Catalunya', capacity: 5, units: [], occupiedCount: 0, tracks: {} },
    'RE': { label: 'Reina Elisenda', capacity: 6, units: [], occupiedCount: 0, tracks: {} },
    'NA': { label: 'Terrassa (Can Roca)', capacity: 15, units: [], occupiedCount: 0, tracks: {} },
    'PN': { label: 'Sabadell (Ca n\'Oriac)', capacity: 12, units: [], occupiedCount: 0, tracks: {} },
    'SR': { label: 'Sarrià', capacity: 5, units: [], occupiedCount: 0, tracks: {} },
    'RB': { label: 'Rubí (COR)', capacity: 28, units: [], occupiedCount: 0, tracks: {} }
  };

  // Initialize track slots
  (Object.keys(OFFICIAL_DEPOT_CONFIGS) as DepotId[]).forEach(dId => {
    const cfg = OFFICIAL_DEPOT_CONFIGS[dId];
    cfg.sections.forEach(sec => {
      sec.tracks.forEach(tr => {
        depotBreakdown[dId].tracks[tr.id] = {
          label: tr.label,
          capacity: tr.capacity,
          units: []
        };
      });
    });
  });

  const parkedUnitsToUpsert: Array<{
    unit_number: string;
    depot_id: string;
    track: string;
    updated_at: string;
  }> = [];

  const nowIso = new Date().toISOString();

  // Group units by target depot
  (Object.keys(OFFICIAL_DEPOT_CONFIGS) as DepotId[]).forEach(dId => {
    const unitsForDepot = calculatedUnits.filter(u => u.depotId === dId);
    depotBreakdown[dId].units = unitsForDepot;
    depotBreakdown[dId].occupiedCount = unitsForDepot.length;

    // Track allocation logic
    const depotConfig = OFFICIAL_DEPOT_CONFIGS[dId];
    const allTracksInDepot: DepotTrackConfig[] = [];
    depotConfig.sections.forEach(s => allTracksInDepot.push(...s.tracks));

    let trackIdx = 0;

    unitsForDepot.forEach(u => {
      // Find track with available capacity
      let assignedTrack: DepotTrackConfig | null = null;

      // Special handling for Rubí: Maintenance units go to Taller or IF
      if (dId === 'RB' && u.status === 'MAINTENANCE') {
        const tallerTracks = allTracksInDepot.filter(t => ['1', '9', '11', '13', '15', '17', '19', '21', '23', '25'].includes(t.id));
        assignedTrack = tallerTracks.find(t => depotBreakdown[dId].tracks[t.id].units.length < t.capacity) || tallerTracks[0];
      } else if (dId === 'RB') {
        // Operational units go to Platja de Vies (4, 6, 8, 10)
        const platjaTracks = allTracksInDepot.filter(t => ['4', '6', '8', '10'].includes(t.id));
        assignedTrack = platjaTracks.find(t => depotBreakdown[dId].tracks[t.id].units.length < t.capacity) || platjaTracks[0];
      } else {
        // Find first track with space
        assignedTrack = allTracksInDepot.find(t => depotBreakdown[dId].tracks[t.id].units.length < t.capacity) || null;
      }

      // Fallback if all full: assign round-robin
      if (!assignedTrack) {
        assignedTrack = allTracksInDepot[trackIdx % allTracksInDepot.length];
        trackIdx++;
      }

      const trackId = assignedTrack.id;
      const trackLabel = assignedTrack.label;

      u.trackId = trackId;
      u.trackLabel = trackLabel;
      u.depotName = depotConfig.label;

      depotBreakdown[dId].tracks[trackId].units.push(u.unitNumber);

      parkedUnitsToUpsert.push({
        unit_number: u.unitNumber,
        depot_id: dId,
        track: trackId,
        updated_at: nowIso
      });
    });
  });

  const circulatingCount = calculatedUnits.filter(u => u.status === 'CIRCULATING').length;
  const waitingCount = calculatedUnits.filter(u => u.status === 'WAITING_NEXT' && u.depotId === null).length;
  const parkedCount = parkedUnitsToUpsert.length;

  return {
    timestamp: new Date().toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' }),
    mode,
    totalUnits: allFleetTrains.length,
    circulatingCount,
    waitingCount,
    parkedCount,
    placements: calculatedUnits,
    depotBreakdown,
    parkedUnitsToUpsert
  };
};

/**
 * Saves the automated placements into Supabase `parked_units`
 */
export const applyAutomatedDepotPlacements = async (
  parkedUnitsToUpsert: Array<{ unit_number: string; depot_id: string; track: string; updated_at: string }>
): Promise<{ success: boolean; error?: string; count: number }> => {
  try {
    if (!parkedUnitsToUpsert || parkedUnitsToUpsert.length === 0) {
      return { success: true, count: 0 };
    }

    // 1. Delete all existing parked_units
    const { error: delError } = await supabase.from('parked_units').delete().neq('unit_number', '');
    if (delError) {
      console.error('Error clearing parked_units:', delError);
      return { success: false, error: delError.message, count: 0 };
    }

    // 2. Insert new placements in chunks of 50
    const chunkSize = 50;
    for (let i = 0; i < parkedUnitsToUpsert.length; i += chunkSize) {
      const chunk = parkedUnitsToUpsert.slice(i, i + chunkSize);
      const { error: insError } = await supabase.from('parked_units').insert(chunk);
      if (insError) {
        console.error('Error inserting parked_units chunk:', insError);
        return { success: false, error: insError.message, count: 0 };
      }
    }

    return { success: true, count: parkedUnitsToUpsert.length };
  } catch (err: any) {
    console.error('Exception applying automated depot placements:', err);
    return { success: false, error: err?.message || 'Error desconegut', count: 0 };
  }
};
