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

  // Rubí / COR / SC
  if (clean === 'RB' || clean === 'COR' || clean.startsWith('RB') || clean === 'SC') return 'RB';

  // Reina Elisenda / Vies RE (VR, RE, DRE, R1, R2, TB)
  if (clean === 'VR' || clean === 'RE' || clean === 'DRE' || clean === 'R1' || clean === 'R2' || clean === 'TB') return 'RE';

  // Terrassa (Nacions Unides, Can Roca, N1, N2, N3, DNA)
  if (
    clean === 'NA' || clean === 'N1' || clean === 'N2' || clean === 'N3' ||
    clean === 'DNA' || clean.startsWith('NA') || /^N\d/.test(clean)
  ) return 'NA';

  // Sabadell (Parc del Nord, Ca n'Oriac, P1, P2, P3, DPN, CT)
  if (
    clean === 'PN' || clean === 'P1' || clean === 'P2' || clean === 'P3' ||
    clean === 'DPN' || clean === 'CT' || clean.startsWith('PN') || /^P\d/.test(clean)
  ) return 'PN';

  // Plaça Catalunya
  if (clean === 'PC') return 'PC';

  // Sarrià
  if (clean === 'SR' || clean === 'S0' || clean.startsWith('SR') || clean === 'SAR') return 'SR';

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
 * E.g. P3N11 -> Starts at N1 (NA), Ends at P3 (PN)
 */
export const decodeCycleDepots = (
  cycleId: string,
  circulations: CycleCirculationItem[] = []
): { startDepot: DepotId; endDepot: DepotId } => {
  const clean = (cycleId || '').trim().toUpperCase();

  let startDepot: DepotId | null = null;
  let endDepot: DepotId | null = null;

  // 1. Check from circulations first (ground truth)
  if (circulations.length > 0) {
    const first = circulations[0];
    const last = circulations[circulations.length - 1];
    if (first?.inici) startDepot = mapStationToDepot(first.inici);
    if (last?.final) endDepot = mapStationToDepot(last.final);
  }

  // 2. Fallback to cycle code letters if either was not determined
  // In FGC BV: [DEST(2)][ORIG(2)][NUM]
  // Examples:
  // P3N11 -> Dest: P3 (PN), Orig: N1 (NA)
  // N2P11 -> Dest: N2 (NA), Orig: P1 (PN)
  // PCVR1 -> Dest: PC (PC), Orig: VR (RE)
  // VRRB1 -> Dest: VR (RE), Orig: RB (RB)
  // N1RB1 -> Dest: N1 (NA), Orig: RB (RB)
  // P1RB1 -> Dest: P1 (PN), Orig: RB (RB)
  if (clean.length >= 4) {
    const destPrefix = clean.substring(0, 2);
    const origPrefix = clean.substring(2, 4);
    if (!endDepot) endDepot = mapStationToDepot(destPrefix);
    if (!startDepot) startDepot = mapStationToDepot(origPrefix);
  }

  return {
    startDepot: startDepot || 'RB',
    endDepot: endDepot || 'RB'
  };
};

export interface FetchCyclesDataResult {
  cyclesMap: Record<string, DecodedCycleInfo>;
  gipUnitToCycleMap: Map<string, string>;
  gipUnitLastCircMap: Map<string, { codi: string; time: string; final: string }>;
}

/**
 * Fetches all shifts, circulations and GIP passages to build an authoritative cycle circulation map
 */
export const fetchFullCycleCirculationsMap = async (
  servei?: string,
  targetDate?: string
): Promise<FetchCyclesDataResult> => {
  try {
    // 1. Load circulations with high range to fetch all ~1,665 circulations
    let allCircsData: any[] = [];
    const { data: cData } = await supabase
      .from('circulations')
      .select('id, inici, final, linia, sortida, arribada')
      .range(0, 2500);

    if (cData && cData.length > 0) {
      allCircsData = cData;
    } else {
      // Fallback to circulationsv2 if circulations is empty
      let qV2 = supabase.from('circulationsv2').select('id, inici, final, linia, sortida, arribada, servei');
      if (servei && servei !== 'Tots') {
        const sFilter = (servei === '000' || servei === '0') ? '000' : servei;
        qV2 = qV2.eq('servei', sFilter);
      }
      const { data: v2Data } = await qV2.range(0, 2500);
      if (v2Data) allCircsData = v2Data;
    }

    const circDetailsMap = new Map<string, { inici: string; final: string; linia: string; sortida: string; arribada: string }>();
    allCircsData.forEach((c: any) => {
      if (c.id) {
        circDetailsMap.set(c.id.trim().toUpperCase(), {
          inici: (c.inici || '').trim(),
          final: (c.final || '').trim(),
          linia: (c.linia || '').trim(),
          sortida: (c.sortida || '').trim(),
          arribada: (c.arribada || '').trim()
        });
      }
    });

    // 2. Load shifts
    let qShifts = supabase.from('shifts').select('id, circulations, servei');
    if (servei && servei !== 'Tots') {
      const sFilter = (servei === '000' || servei === '0') ? ['0', '000'] : [servei];
      qShifts = qShifts.in('servei', sFilter);
    }
    const { data: shiftsData } = await qShifts.range(0, 1000);

    // 3. Group by cycle
    const rawCycleCircs: Record<string, CycleCirculationItem[]> = {};
    const circToCycleMap = new Map<string, string>();

    if (shiftsData) {
      shiftsData.forEach((s: any) => {
        if (!s.circulations) return;
        (s.circulations as any[]).forEach((c: any) => {
          const cicle = (c.cicle || '').trim().toUpperCase();
          const codi = (c.codi || '').trim().toUpperCase();
          if (!cicle || !codi || codi === '-' || codi === 'VIATGER' || codi === 'RESERVA') return;

          circToCycleMap.set(codi, cicle);

          const meta = circDetailsMap.get(codi);
          const sortidaStr = c.sortida || meta?.sortida || '';
          const arribadaStr = c.arribada || meta?.arribada || '';
          const sortidaMin = getFgcMinutes(sortidaStr) ?? 0;
          const arribadaMin = getFgcMinutes(arribadaStr) ?? sortidaMin;

          if (!rawCycleCircs[cicle]) rawCycleCircs[cicle] = [];

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

    const cyclesMap: Record<string, DecodedCycleInfo> = {};
    Object.entries(rawCycleCircs).forEach(([cicle, circList]) => {
      // Sort chronologically by sortidaMin (accounting for midnight via getFgcMinutes)
      circList.sort((a, b) => a.sortidaMin - b.sortidaMin);

      const firstCirc = circList[0];
      const lastCirc = circList[circList.length - 1];
      const { startDepot, endDepot } = decodeCycleDepots(cicle, circList);

      cyclesMap[cicle] = {
        cycleId: cicle,
        startDepot,
        endDepot,
        circulations: circList,
        firstCirc,
        lastCirc
      };
    });

    // 4. Fetch GIP passages to identify which unit actually performed each cycle/circulation
    const gipUnitToCycleMap = new Map<string, string>();
    const gipUnitLastCircMap = new Map<string, { codi: string; time: string; final: string }>();

    try {
      const todayDate = targetDate || new Date().toISOString().slice(0, 10);
      const { data: gipPassages } = await supabase
        .from('gip_registre_pas')
        .select('circulacio_id, ut, hora_teorica, data_servei')
        .eq('data_servei', todayDate)
        .not('ut', 'is', null)
        .neq('ut', '')
        .range(0, 3000);

      if (gipPassages && gipPassages.length > 0) {
        gipPassages.forEach((gp: any) => {
          const ut = (gp.ut || '').trim();
          const circId = (gp.circulacio_id || '').trim().toUpperCase();
          if (!ut || !circId) return;

          const matchedCycle = circToCycleMap.get(circId);
          if (matchedCycle && !gipUnitToCycleMap.has(ut)) {
            gipUnitToCycleMap.set(ut, matchedCycle);
          }

          const circMeta = circDetailsMap.get(circId);
          const circTime = gp.hora_teorica || circMeta?.arribada || '';
          const currentLast = gipUnitLastCircMap.get(ut);
          const circMins = getFgcMinutes(circTime) ?? 0;
          const currentLastMins = currentLast ? (getFgcMinutes(currentLast.time) ?? 0) : -1;

          if (!currentLast || circMins > currentLastMins) {
            gipUnitLastCircMap.set(ut, {
              codi: circId,
              time: circTime,
              final: circMeta?.final || ''
            });
          }
        });
      }
    } catch (gipErr) {
      console.warn('Could not fetch GIP passages for depot auto-placement:', gipErr);
    }

    return {
      cyclesMap,
      gipUnitToCycleMap,
      gipUnitLastCircMap
    };
  } catch (err) {
    console.error('Error fetching cycle circulations map:', err);
    return {
      cyclesMap: {},
      gipUnitToCycleMap: new Map(),
      gipUnitLastCircMap: new Map()
    };
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
 * Core algorithm: Calculates where every unit in the fleet should be placed.
 * Fills all depots (NA, PN, RE, SR, PC, RB) according to circulation final terminals and cycle logic.
 */
export const calculateFleetDepotPlacements = (params: {
  allFleetTrains: string[];
  assignments: Assignment[];
  cyclesMap?: Record<string, DecodedCycleInfo>;
  cycleCirculationsMap?: Record<string, DecodedCycleInfo>;
  gipUnitsMap?: Map<string, string>;
  gipUnitToCycleMap?: Map<string, string>;
  gipUnitLastCircMap?: Map<string, { codi: string; time: string; final: string }>;
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
  const gipUnitToCycle = params.gipUnitsMap || params.gipUnitToCycleMap || new Map<string, string>();
  const gipUnitLastCirc = params.gipUnitLastCircMap || new Map<string, { codi: string; time: string; final: string }>();

  const currentFgcNow = getFgcMinutes(new Date().toTimeString().slice(0, 5)) ?? 0;
  const nowMin = currentTimeMin !== undefined ? currentTimeMin : currentFgcNow;
  const isEndOfService = mode === 'end_of_service' || mode === 'END_OF_SERVICE';

  // 1. Identify maintenance units (always stationed at Rubí Taller or IF)
  const maintUnits = new Set<string>();
  allFleetTrains.forEach(u => {
    if (brokenTrains.has(u) || cleaningTrains.has(u) || imageTrains.has(u) || recordTrains.has(u)) {
      maintUnits.add(u);
    }
  });

  // 2. Build complete Unit -> Cycle mapping combining:
  //    A) Manual supervisor assignments (top priority)
  //    B) Real GIP passages today
  //    C) Intelligent pairing for remaining active cycles to available fleet units
  const unitToCycleMap = new Map<string, string>();
  const usedCycles = new Set<string>();

  // A) Manual assignments
  assignments.forEach(a => {
    if (a.train_number && a.cycle_id) {
      const u = a.train_number.trim();
      const c = a.cycle_id.trim().toUpperCase();
      if (!maintUnits.has(u) && cyclesMap[c]) {
        unitToCycleMap.set(u, c);
        usedCycles.add(c);
      }
    }
  });

  // B) GIP recorded units today
  gipUnitToCycle.forEach((cicle, ut) => {
    if (!maintUnits.has(ut) && !unitToCycleMap.has(ut) && cyclesMap[cicle] && !usedCycles.has(cicle)) {
      unitToCycleMap.set(ut, cicle);
      usedCycles.add(cicle);
    }
  });

  // C) Pair remaining active cycles to available fleet units
  const remainingActiveCycles = Object.keys(cyclesMap).filter(c => !usedCycles.has(c));
  const availableTrains = allFleetTrains.filter(t => !maintUnits.has(t) && !unitToCycleMap.has(t));

  const unassigned114 = availableTrains.filter(t => t.startsWith('114'));
  const unassignedOther = availableTrains.filter(t => !t.startsWith('114'));

  const cycles114 = remainingActiveCycles.filter(c => c.startsWith('VR') || c.startsWith('PCVR') || c.startsWith('VRPC'));
  const cyclesOther = remainingActiveCycles.filter(c => !cycles114.includes(c));

  // Pair 114s to Tibidabo / L7 cycles
  cycles114.forEach(c => {
    const train = unassigned114.shift();
    if (train) {
      unitToCycleMap.set(train, c);
      usedCycles.add(c);
    }
  });

  // Pair other available trains to remaining cycles
  const remainingCyclesToPair = [...cyclesOther, ...cycles114.filter(c => !usedCycles.has(c))];
  const allAvailableToPair = [...unassignedOther, ...unassigned114];

  remainingCyclesToPair.forEach(c => {
    const train = allAvailableToPair.shift();
    if (train) {
      unitToCycleMap.set(train, c);
      usedCycles.add(c);
    }
  });

  const calculatedUnits: UnitCalculatedPlacement[] = [];

  // 3. Process every unit in the fleet to determine its stabling depot and operational status
  allFleetTrains.forEach(unit => {
    const isBroken = brokenTrains.has(unit);
    const isCleaning = cleaningTrains.has(unit);
    const isImages = imageTrains.has(unit);
    const isRecords = recordTrains.has(unit);
    const isMaint = isBroken || isCleaning || isImages || isRecords;

    if (isMaint) {
      calculatedUnits.push({
        unitNumber: unit,
        status: 'MAINTENANCE',
        statusLabel: isBroken ? 'Avariat' : isCleaning ? 'Neteja' : 'Revisió',
        depotId: 'RB',
        reason: isBroken ? 'Avariat al Taller de Rubí (COR)' : 'Manteniment/Neteja a Rubí (COR)'
      });
      return;
    }

    const cycleId = unitToCycleMap.get(unit);

    if (!cycleId || !cyclesMap[cycleId]) {
      // Spare reserve unit stationed at Rubí Platja de Vies
      calculatedUnits.push({
        unitNumber: unit,
        status: 'UNASSIGNED_SPARE',
        statusLabel: 'Reserva Material',
        depotId: 'RB',
        reason: 'Unitat de reserva disponible. Estacionada a Platja de Vies de Rubí (COR)'
      });
      return;
    }

    const cycleInfo = cyclesMap[cycleId];
    const circs = cycleInfo.circulations || [];
    const firstCirc = circs[0] || cycleInfo.firstCirc;
    const lastCirc = circs[circs.length - 1] || cycleInfo.lastCirc;

    // Determine destination depot based on the final station where the circulation terminates
    const gipLast = gipUnitLastCirc.get(unit);
    const finalStation = lastCirc?.final || gipLast?.final || '';
    const finalDepot = finalStation ? mapStationToDepot(finalStation) : cycleInfo.endDepot;

    // MODE: END_OF_SERVICE (Tancament de servei / Nocturn)
    if (isEndOfService) {
      calculatedUnits.push({
        unitNumber: unit,
        cycleId,
        status: 'CYCLE_FINISHED',
        statusLabel: 'Retirat a Dipòsit',
        depotId: finalDepot,
        currentStation: finalStation || finalDepot,
        currentCirculation: lastCirc?.codi || gipLast?.codi,
        reason: `Finalitzat servei del cicle ${cycleId} a ${finalStation || finalDepot} (${lastCirc?.arribada || 'final de dia'}). Retirat al dipòsit ${finalDepot}.`
      });
      return;
    }

    // MODE: REAL_TIME (Segons l'hora actual)
    if (firstCirc && nowMin < firstCirc.sortidaMin) {
      // Not yet started: parked at origin depot
      calculatedUnits.push({
        unitNumber: unit,
        cycleId,
        status: 'BEFORE_CYCLE',
        statusLabel: 'Pendent d\'Inici',
        depotId: cycleInfo.startDepot,
        nextCirculation: firstCirc.codi,
        nextTime: firstCirc.sortida,
        reason: `Pendent d'iniciar cicle ${cycleId}. Primer tren: ${firstCirc.codi} a les ${firstCirc.sortida} des de ${firstCirc.inici}.`
      });
      return;
    }

    if (lastCirc && nowMin >= lastCirc.arribadaMin) {
      // Finished all circulations for the day: parked at final depot!
      calculatedUnits.push({
        unitNumber: unit,
        cycleId,
        status: 'CYCLE_FINISHED',
        statusLabel: 'Finalitzat',
        depotId: finalDepot,
        currentStation: finalStation,
        reason: `Cicle ${cycleId} finalitzat a ${finalStation} a les ${lastCirc.arribada}. Estacionat a dipòsit ${finalDepot}.`
      });
      return;
    }

    // Active circulation right now
    const activeCirc = circs.find(c => nowMin >= c.sortidaMin && nowMin <= c.arribadaMin);
    if (activeCirc) {
      calculatedUnits.push({
        unitNumber: unit,
        cycleId,
        status: 'CIRCULATING',
        statusLabel: 'En Circulació',
        depotId: null, // Active on track between stations
        currentCirculation: activeCirc.codi,
        currentStation: `${activeCirc.inici} → ${activeCirc.final}`,
        nextTime: activeCirc.arribada,
        reason: `Circulant amb tren ${activeCirc.codi} (${activeCirc.inici} → ${activeCirc.final}). Arribada: ${activeCirc.arribada}.`
      });
      return;
    }

    // Turnaround dwell between circulations
    const nextCircIdx = circs.findIndex(c => c.sortidaMin > nowMin);
    if (nextCircIdx > 0) {
      const prevCirc = circs[nextCircIdx - 1];
      const nextCirc = circs[nextCircIdx];
      const dwellMinutes = nextCirc.sortidaMin - prevCirc.arribadaMin;
      const isDepotStation = ['RB', 'NA', 'PN', 'RE', 'SR', 'PC'].includes(prevCirc.final);

      if (dwellMinutes >= 90 && isDepotStation) {
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

    // Default fallback
    calculatedUnits.push({
      unitNumber: unit,
      cycleId,
      status: 'CYCLE_FINISHED',
      statusLabel: 'Finalitzat',
      depotId: finalDepot,
      reason: `Cicle ${cycleId} completat. Estacionat a dipòsit ${finalDepot}.`
    });
  });

  // 4. Capacity Balancing & Overflow Management
  // Official capacities: PC: 5, RE: 6, SR: 5, NA: 15, PN: 12, RB: 28
  // Pl. Catalunya (PC) has exactly 5 tracks. Excess trains are transferred to Sarrià (SR) or Rubí (RB)
  const pcUnits = calculatedUnits.filter(u => u.depotId === 'PC');
  if (pcUnits.length > 5) {
    const excess = pcUnits.slice(5);
    excess.forEach(u => {
      const currentSrCount = calculatedUnits.filter(x => x.depotId === 'SR').length;
      if (currentSrCount < 5) {
        u.depotId = 'SR';
        u.reason += ' (Reubicat a Sarrià per límit de capacitat a Plaça Catalunya: màx. 5 vies)';
      } else {
        u.depotId = 'RB';
        u.reason += ' (Reubicat a Rubí per límit de capacitat a Plaça Catalunya: màx. 5 vies)';
      }
    });
  }

  // 5. Track allocation within each depot respecting individual track capacities
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

  // Group units by target depot and allocate to specific tracks
  (Object.keys(OFFICIAL_DEPOT_CONFIGS) as DepotId[]).forEach(dId => {
    const unitsForDepot = calculatedUnits.filter(u => u.depotId === dId);
    depotBreakdown[dId].units = unitsForDepot;
    depotBreakdown[dId].occupiedCount = unitsForDepot.length;

    const depotConfig = OFFICIAL_DEPOT_CONFIGS[dId];
    const allTracksInDepot: DepotTrackConfig[] = [];
    depotConfig.sections.forEach(s => allTracksInDepot.push(...s.tracks));

    let trackIdx = 0;

    unitsForDepot.forEach(u => {
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

      // Fallback if full: assign round-robin
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
