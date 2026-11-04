import { NormalizedGeoTrenTrain } from './geotrenApi';
import { GipRegistrePas, TrunkConflictAlert } from '../types';
import { resolveStationId, normalizeTimeDiffSec } from './stations';
import { STATION_GEO_MAP } from './stationGeoData';
import { decodeGeotrenCirculation } from './geotrenDecoders';

/**
 * Common Trunk Stations (Tronc Comú FGC Barcelona-Vallès)
 * Ordered geographically from Sant Cugat (North) to Plaça Catalunya (South).
 */
export const TRUNK_STATIONS = [
  'SC', // Sant Cugat Centre
  'VD', // Valldoreix
  'LF', // La Floresta
  'LP', // Les Planes
  'VL', // Baixador de Vallvidrera
  'PF', // Peu del Funicular
  'SR', // Sarrià
  'TT', // Les Tres Torres
  'BN', // La Bonanova
  'MN', // Muntaner
  'SG', // Sant Gervasi
  'GR', // Gràcia
  'PR', // Provença
  'PC'  // Plaça Catalunya
];

const TRUNK_INDEX_MAP = new Map<string, number>(
  TRUNK_STATIONS.map((code, idx) => [code, idx])
);

/**
 * Llindar mínim de retard per a alertes de coll d'ampolla / efecte acordió al tronc comú.
 * Configurat a 3 minuts i mig (210 segons) a petició expressa de supervisió CSO.
 */
export const BOTTLENECK_DELAY_THRESHOLD_SEC = 210; // 3.5 min (3 min 30 s)

/**
 * Formata segons en minuts amb decimals nets (ex: 210s -> "3.5m", 240s -> "4m")
 */
export function formatDelayMinutes(sec: number): string {
  if (!sec || sec <= 0) return '0m';
  const mins = sec / 60;
  return Number.isInteger(mins) ? `${mins}m` : `${mins.toFixed(1)}m`;
}

/**
 * Returns human-readable name of a station code
 */
export function getStationDisplayName(code: string): string {
  if (!code) return '';
  const geo = STATION_GEO_MAP.get(code);
  if (geo?.name) return geo.name;
  return code;
}

/**
 * Resolves the primary circulation ID for a train (e.g. "F093", "A032", "D235")
 */
export function getCleanCircCode(train: NormalizedGeoTrenTrain): string {
  if (train.circCode && train.circCode.trim() !== '') {
    return train.circCode.trim().toUpperCase();
  }
  const decoded = decodeGeotrenCirculation(train.id);
  if (decoded?.fullName) {
    return decoded.fullName.trim().toUpperCase();
  }
  if (train.id) {
    return train.id.split('|')[0].trim().toUpperCase();
  }
  return 'TREM';
}

/**
 * Resolves the current or next station for a train
 */
export function getTrainCurrentOrNextStation(train: NormalizedGeoTrenTrain): string | null {
  if (train.estacionat_a) {
    return resolveStationId(train.estacionat_a, train.lin);
  }
  if (Array.isArray(train.properes_parades) && train.properes_parades.length > 0) {
    return resolveStationId(train.properes_parades[0], train.lin);
  }
  return null;
}

/**
 * Determines travel direction:
 * 'to_pc' = towards Plaça Catalunya (South / Dir 1)
 * 'to_valles' = towards Vallès / Terrassa / Sabadell (North / Dir 2)
 */
export function getTrainTrunkDirection(train: NormalizedGeoTrenTrain): 'to_pc' | 'to_valles' | null {
  const desti = (train.desti || '').toUpperCase();
  const dir = (train.dir || '').toUpperCase();

  if (desti.includes('CATALUNYA') || desti === 'PC' || dir === '1' || dir === 'B') {
    return 'to_pc';
  }
  if (
    desti.includes('TERRASSA') || desti.includes('SABADELL') || desti.includes('CUGAT') ||
    desti.includes('RUBI') || desti === 'NA' || desti === 'PN' || desti === 'SC' ||
    dir === '2' || dir === 'V'
  ) {
    return 'to_valles';
  }

  // Fallback: check sequence of properes_parades
  if (Array.isArray(train.properes_parades) && train.properes_parades.length >= 2) {
    const idx0 = TRUNK_INDEX_MAP.get(train.properes_parades[0]);
    const idx1 = TRUNK_INDEX_MAP.get(train.properes_parades[1]);
    if (idx0 !== undefined && idx1 !== undefined) {
      return idx1 > idx0 ? 'to_pc' : 'to_valles';
    }
  }

  return null;
}

interface TrainPositionSnapshot {
  train: NormalizedGeoTrenTrain;
  circId: string;
  line: string;
  stationCode: string;
  trunkIndex: number; // Index in TRUNK_STATIONS (0 = SC, 13 = PC)
  direction: 'to_pc' | 'to_valles';
  delaySec: number;
}

/**
 * Predictive Bottleneck & Conflict Detection Engine:
 * Analyzes real-time train positions, directions, and delays across the
 * Barcelona-Vallès common trunk and key junctions (Sant Cugat, Sarrià, Pl. Catalunya).
 */
export function detectTrunkConflicts(
  trains: NormalizedGeoTrenTrain[],
  passagesMap?: Map<string, GipRegistrePas>
): TrunkConflictAlert[] {
  if (!Array.isArray(trains) || trains.length < 2) {
    return [];
  }

  const alerts: TrunkConflictAlert[] = [];
  const now = Date.now();

  // 1. Filter and snapshot trains currently on or approaching the trunk
  const trunkTrains: TrainPositionSnapshot[] = [];

  trains.forEach(t => {
    const stCode = getTrainCurrentOrNextStation(t);
    if (!stCode) return;

    const trunkIdx = TRUNK_INDEX_MAP.get(stCode);
    const direction = getTrainTrunkDirection(t);
    if (trunkIdx === undefined || !direction) return;

    const circId = getCleanCircCode(t);

    // Resolve delay
    let delaySec = 0;
    if (passagesMap && passagesMap.has(circId)) {
      const p = passagesMap.get(circId)!;
      delaySec = normalizeTimeDiffSec(p.diferencia_segons);
    } else if (t.en_hora === false) {
      // Known to be running with delay by GeoTren
      delaySec = 180; // Estimate 3 min if unquantified
    }

    const decoded = decodeGeotrenCirculation(t.id);
    const line = decoded?.line || t.lin || 'S1';

    trunkTrains.push({
      train: t,
      circId,
      line,
      stationCode: stCode,
      trunkIndex: trunkIdx,
      direction,
      delaySec
    });
  });

  // ── RULE 1: Efecte Acordió al Tronc Comú (Sequential Accordion Catch-up) ──
  // Group by direction and sort by progress
  const toPcTrains = trunkTrains
    .filter(t => t.direction === 'to_pc')
    .sort((a, b) => b.trunkIndex - a.trunkIndex); // Higher index = closer to PC (leading)

  const toVallesTrains = trunkTrains
    .filter(t => t.direction === 'to_valles')
    .sort((a, b) => a.trunkIndex - b.trunkIndex); // Lower index = closer to SC (leading)

  const processAccordionGroup = (group: TrainPositionSnapshot[], isToPc: boolean) => {
    for (let i = 0; i < group.length - 1; i++) {
      const lead = group[i];
      const trail = group[i + 1];

      // Station gap in trunk sequence
      const stationGap = isToPc
        ? lead.trunkIndex - trail.trunkIndex
        : trail.trunkIndex - lead.trunkIndex;

      // Condició: el tren capdavanter porta un retard de més de 3 minuts i mig (>= 210s)
      // i el tren posterior es troba a una distància d'1 a 3 estacions en el mateix sentit de via
      if (lead.delaySec >= BOTTLENECK_DELAY_THRESHOLD_SEC && stationGap >= 1 && stationGap <= 3) {
        const bottleneckStationCode = lead.stationCode;
        const bottleneckStationName = getStationDisplayName(bottleneckStationCode);

        const estImpactSec = Math.min(
          lead.delaySec,
          Math.max(60, Math.round(lead.delaySec * (0.8 - stationGap * 0.15)))
        );

        const alertId = `accordion-${bottleneckStationCode}-${lead.circId}-${trail.circId}`;

        // Title formatted strictly as requested: "Posible retraso en [Estació]"
        alerts.push({
          id: alertId,
          type: 'accordion_trunk',
          severity: lead.delaySec >= 300 ? 'critical' : 'warning',
          title: `Posible retraso en ${bottleneckStationName}`,
          stationCode: bottleneckStationCode,
          stationName: bottleneckStationName,
          leadingCircId: lead.circId,
          leadingLine: lead.line,
          leadingDelaySec: lead.delaySec,
          leadingStation: getStationDisplayName(lead.stationCode),
          trailingCircId: trail.circId,
          trailingLine: trail.line,
          trailingStation: getStationDisplayName(trail.stationCode),
          estimatedImpactSec: estImpactSec,
          reason: `Efecte acordió al tronc comú: ${lead.circId} (${lead.line}) circula amb +${formatDelayMinutes(lead.delaySec)} de retard a ${bottleneckStationName}. ${trail.circId} (${trail.line}) s'aproxima a ${stationGap} estacions i trobarà senyals en precaució.`,
          recommendation: `Avisar maquinista de ${trail.circId} de senyals en precaució o modular interval a ${getStationDisplayName(trail.stationCode)}.`,
          timestamp: now
        });
      }
    }
  };

  processAccordionGroup(toPcTrains, true);
  processAccordionGroup(toVallesTrains, false);

  // ── RULE 2: Convergència a Bifurcació Sant Cugat (SC) ──
  // S1 (Terrassa branch) approaching from Mira-sol (MS) or Hospital General (HG)
  // S2 (Sabadell branch) approaching from Volpelleres (VO) or Sant Joan (SJ)
  const s1ApproachingSc = trains.filter(t => {
    const dir = getTrainTrunkDirection(t);
    if (dir !== 'to_pc') return false;
    const decoded = decodeGeotrenCirculation(t.id);
    const line = decoded?.line || t.lin;
    if (line !== 'S1') return false;
    const st = getTrainCurrentOrNextStation(t);
    return st === 'MS' || st === 'HG' || st === 'RB';
  });

  const s2ApproachingSc = trains.filter(t => {
    const dir = getTrainTrunkDirection(t);
    if (dir !== 'to_pc') return false;
    const decoded = decodeGeotrenCirculation(t.id);
    const line = decoded?.line || t.lin;
    if (line !== 'S2') return false;
    const st = getTrainCurrentOrNextStation(t);
    return st === 'VO' || st === 'SJ' || st === 'BT';
  });

  if (s1ApproachingSc.length > 0 && s2ApproachingSc.length > 0) {
    const t1 = s1ApproachingSc[0];
    const t2 = s2ApproachingSc[0];
    const c1Id = getCleanCircCode(t1);
    const c2Id = getCleanCircCode(t2);

    const p1 = passagesMap?.get(c1Id);
    const p2 = passagesMap?.get(c2Id);
    const d1 = p1 ? normalizeTimeDiffSec(p1.diferencia_segons) : (t1.en_hora === false ? 180 : 0);
    const d2 = p2 ? normalizeTimeDiffSec(p2.diferencia_segons) : (t2.en_hora === false ? 180 : 0);

    const hasDelay = d1 >= 90 || d2 >= 90;
    const isBothVeryClose = (getTrainCurrentOrNextStation(t1) === 'MS') && (getTrainCurrentOrNextStation(t2) === 'VO');

    if (hasDelay || isBothVeryClose) {
      const delayedTrain = d1 >= d2 ? { train: t1, id: c1Id, line: 'S1', delay: d1 } : { train: t2, id: c2Id, line: 'S2', delay: d2 };
      const otherTrain = d1 >= d2 ? { train: t2, id: c2Id, line: 'S2' } : { train: t1, id: c1Id, line: 'S1' };
      const scName = getStationDisplayName('SC');

      alerts.push({
        id: `junction-SC-${c1Id}-${c2Id}`,
        type: 'junction_convergence',
        severity: Math.max(d1, d2) >= 240 ? 'critical' : 'warning',
        title: `Posible retraso en ${scName}`,
        stationCode: 'SC',
        stationName: scName,
        leadingCircId: delayedTrain.id,
        leadingLine: delayedTrain.line,
        leadingDelaySec: delayedTrain.delay,
        leadingStation: getStationDisplayName(getTrainCurrentOrNextStation(delayedTrain.train) || 'SC'),
        trailingCircId: otherTrain.id,
        trailingLine: otherTrain.line,
        trailingStation: getStationDisplayName(getTrainCurrentOrNextStation(otherTrain.train) || 'SC'),
        estimatedImpactSec: 120,
        reason: `Convergència simultània a la bifurcació de Sant Cugat entre ${c1Id} (S1) i ${c2Id} (S2). Risc de cisallament i aturada a senyal d'entrada de Sant Cugat.`,
        recommendation: `Prioritzar pas a agulles de Sant Cugat segons full de marxa per evitar bloqueig mutu.`,
        timestamp: now
      });
    }
  }

  // ── RULE 3: Saturació de Capçalera a Plaça Catalunya (PC) ──
  // Tren aturat o arribant a PC amb retard >= 210s (3m 30s) mentre un altre tren ja és entre PR i PC
  const pcTrain = trunkTrains.find(t => t.direction === 'to_pc' && t.stationCode === 'PC' && t.delaySec >= BOTTLENECK_DELAY_THRESHOLD_SEC);
  const prTrain = trunkTrains.find(t => t.direction === 'to_pc' && t.stationCode === 'PR');

  if (pcTrain && prTrain && pcTrain.circId !== prTrain.circId) {
    const pcName = getStationDisplayName('PC');
    alerts.push({
      id: `terminal-PC-${pcTrain.circId}-${prTrain.circId}`,
      type: 'terminal_congestion',
      severity: 'critical',
      title: `Posible retraso en ${pcName}`,
      stationCode: 'PC',
      stationName: pcName,
      leadingCircId: pcTrain.circId,
      leadingLine: pcTrain.line,
      leadingDelaySec: pcTrain.delaySec,
      leadingStation: pcName,
      trailingCircId: prTrain.circId,
      trailingLine: prTrain.line,
      trailingStation: getStationDisplayName('PR'),
      estimatedImpactSec: 180,
      reason: `Saturació a vies de capçalera de Plaça Catalunya: ${pcTrain.circId} (${pcTrain.line}) retarda la maniobra de rotació (+${formatDelayMinutes(pcTrain.delaySec)}). ${prTrain.circId} quedarà retingut a Provença.`,
      recommendation: `Coordinar amb CCO assignació de via alternativa a Plaça Catalunya si està disponible.`,
      timestamp: now
    });
  }

  // Deduplicate: If both a terminal_congestion/junction_convergence and accordion_trunk exist for the same pair, keep the specialized one
  const specializedPairs = new Set(
    alerts.filter(a => a.type !== 'accordion_trunk').map(a => `${a.leadingCircId}-${a.trailingCircId}`)
  );

  const dedupedAlerts = alerts.filter(a => {
    if (a.type === 'accordion_trunk') {
      const pairKey = `${a.leadingCircId}-${a.trailingCircId}`;
      if (specializedPairs.has(pairKey)) return false;
    }
    return true;
  });

  // Sort alerts by severity (critical first) then by estimated impact
  dedupedAlerts.sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    if (sevOrder[a.severity] !== sevOrder[b.severity]) {
      return sevOrder[a.severity] - sevOrder[b.severity];
    }
    return b.estimatedImpactSec - a.estimatedImpactSec;
  });

  return dedupedAlerts;
}
