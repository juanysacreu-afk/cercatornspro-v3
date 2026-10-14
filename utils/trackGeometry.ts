/**
 * Motor de Geometria de Vies i Snap-to-Track de FGC
 * Font oficial: GeoJSON de Ferrocarrils de la Generalitat de Catalunya
 *
 * Projecta la posició GPS del comboi sobre els rails reals (LineString) en lloc
 * d'una línia recta euclidiana (haversine), eliminant distorsions en túnels i corbes.
 */

import { BV_TRACK_BRANCHES, LA_TRACK_BRANCHES, ALL_TRACK_BRANCHES, TrackBranchData } from './trackGeometryData';
import { haversineKm } from './stationGeoData';

export interface SnapResult {
  /** Latitud projectada sobre el raïl */
  lat: number;
  /** Longitud projectada sobre el raïl */
  lon: number;
  /** Distància ortogonal des del GPS original a la via en metres */
  distanceMeters: number;
  /** Identificador de la branca ferroviària */
  branchId: string;
  /** Índex del segment de la polilínia */
  segmentIndex: number;
  /** Factor de projecció [0, 1] dins del segment */
  tSegment: number;
  /** Distància acumulada d'arc des de l'inici de la branca (km) */
  cumulativeKm: number;
}

/**
 * Projecció ortogonal local d'un punt P(lat, lon) sobre el segment A-B
 * Utilitza projecció equirectangular centrada per a precisió submètrica local.
 */
export function projectPointOnSegment(
  pLat: number, pLon: number,
  aLat: number, aLon: number,
  bLat: number, bLon: number
): { lat: number; lon: number; t: number; distanceMeters: number } {
  const midLat = ((aLat + bLat) / 2) * (Math.PI / 180);
  const cosMidLat = Math.cos(midLat);

  const dxAB = (bLon - aLon) * (Math.PI / 180) * cosMidLat;
  const dyAB = (bLat - aLat) * (Math.PI / 180);

  const dxAP = (pLon - aLon) * (Math.PI / 180) * cosMidLat;
  const dyAP = (pLat - aLat) * (Math.PI / 180);

  const abSq = dxAB * dxAB + dyAB * dyAB;
  let t = 0;
  if (abSq > 1e-12) {
    t = (dxAP * dxAB + dyAP * dyAB) / abSq;
    t = Math.max(0, Math.min(1, t));
  }

  const snappedLon = aLon + t * (bLon - aLon);
  const snappedLat = aLat + t * (bLat - aLat);
  const distanceKm = haversineKm(pLat, pLon, snappedLat, snappedLon);

  return {
    lat: snappedLat,
    lon: snappedLon,
    t,
    distanceMeters: distanceKm * 1000
  };
}

/**
 * Selecciona les branques ferroviàries pertinents segons la línia indicada
 */
export function getBranchesForLine(lineCode?: string): TrackBranchData[] {
  if (!lineCode) return BV_TRACK_BRANCHES;
  const clean = lineCode.trim().toUpperCase();

  const matched = ALL_TRACK_BRANCHES.filter(b => b.lines.includes(clean));
  if (matched.length > 0) return matched;

  // Si és S1, S2, L6, L7, L12 o derivats -> BV
  if (clean.startsWith('S') || clean.startsWith('L')) return BV_TRACK_BRANCHES;
  // Si és R5, R6 o similar -> LA
  if (clean.startsWith('R')) return LA_TRACK_BRANCHES;

  return BV_TRACK_BRANCHES;
}

/**
 * Projecta un punt GPS a una branca específica de la xarxa
 */
function snapToSpecificBranch(lat: number, lon: number, branch: TrackBranchData): SnapResult {
  const coords = branch.coordinates;
  const cumul = branch.cumulativeKm;
  let minDistanceMeters = Infinity;
  let bestResult: SnapResult = {
    lat,
    lon,
    distanceMeters: Infinity,
    branchId: branch.id,
    segmentIndex: 0,
    tSegment: 0,
    cumulativeKm: 0
  };

  const count = coords.length;
  for (let i = 0; i < count - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];

    const proj = projectPointOnSegment(lat, lon, a[1], a[0], b[1], b[0]);
    if (proj.distanceMeters < minDistanceMeters) {
      minDistanceMeters = proj.distanceMeters;
      const segLen = (cumul[i + 1] ?? cumul[i]) - cumul[i];
      const cumulativeKm = cumul[i] + proj.t * segLen;

      bestResult = {
        lat: proj.lat,
        lon: proj.lon,
        distanceMeters: proj.distanceMeters,
        branchId: branch.id,
        segmentIndex: i,
        tSegment: proj.t,
        cumulativeKm
      };
    }
  }

  return bestResult;
}

/**
 * Projecta qualsevol coordenada GPS sobre el raïl real més proper (Snap-to-Track)
 *
 * @param lat Latitud GPS
 * @param lon Longitud GPS
 * @param lineCode Línia FGC (opcional per accelerar o discriminar xarxa)
 * @param maxSnapDistanceMeters Distància màxima tolerable en metres (per defecte 2000m)
 */
export function snapToTrack(
  lat: number,
  lon: number,
  lineCode?: string,
  maxSnapDistanceMeters: number = 2500
): SnapResult | null {
  const branches = getBranchesForLine(lineCode);
  let bestResult: SnapResult | null = null;
  let minDistanceMeters = Infinity;

  const BBOX_MARGIN = 0.05; // ~5km de marge per rebuig ràpid

  for (const branch of branches) {
    const [minLon, minLat, maxLon, maxLat] = branch.bbox;
    if (
      lon < minLon - BBOX_MARGIN ||
      lon > maxLon + BBOX_MARGIN ||
      lat < minLat - BBOX_MARGIN ||
      lat > maxLat + BBOX_MARGIN
    ) {
      continue;
    }

    const res = snapToSpecificBranch(lat, lon, branch);
    if (res.distanceMeters < minDistanceMeters) {
      minDistanceMeters = res.distanceMeters;
      bestResult = res;
    }
  }

  if (bestResult && bestResult.distanceMeters <= maxSnapDistanceMeters) {
    return bestResult;
  }

  return bestResult;
}

/**
 * Calcula el factor de progressió t [0.0 ... 1.0] del tren entre dues estacions
 * projectant el trajecte sobre la polilínia real de la via.
 *
 * Si falla la projecció de via, commuta automàticament a haversine rectilini.
 */
export function interpolateOnTrack(
  trainLat: number,
  trainLon: number,
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  lineCode?: string
): number {
  const branches = getBranchesForLine(lineCode);

  for (const branch of branches) {
    const snapFrom = snapToSpecificBranch(fromLat, fromLon, branch);
    const snapTo = snapToSpecificBranch(toLat, toLon, branch);

    // Ambdós extrems d'estació han de coincidir amb la traça de la branca (<450m)
    if (snapFrom.distanceMeters < 450 && snapTo.distanceMeters < 450) {
      const trackDistStations = Math.abs(snapTo.cumulativeKm - snapFrom.cumulativeKm);
      if (trackDistStations >= 0.03) {
        const snapTrain = snapToSpecificBranch(trainLat, trainLon, branch);

        // Si el tren està a menys de 800m de la via
        if (snapTrain.distanceMeters < 800) {
          const isAscending = snapTo.cumulativeKm >= snapFrom.cumulativeKm;
          const trainOffset = isAscending
            ? snapTrain.cumulativeKm - snapFrom.cumulativeKm
            : snapFrom.cumulativeKm - snapTrain.cumulativeKm;

          const t = trainOffset / trackDistStations;
          return Math.max(0, Math.min(1, t));
        }
      }
    }
  }

  // Fallback Haversine rectilini
  const totalDist = haversineKm(fromLat, fromLon, toLat, toLon);
  if (totalDist < 0.01) return 0;
  const distFromOrigin = haversineKm(fromLat, fromLon, trainLat, trainLon);
  return Math.max(0, Math.min(1, distFromOrigin / totalDist));
}

/**
 * Calcula la distància restant en quilòmetres mesurada al llarg de la corba de la via (longitud d'arc)
 * fins a la següent estació objectiu.
 */
export function getRemainingRailKm(
  trainLat: number,
  trainLon: number,
  toLat: number,
  toLon: number,
  lineCode?: string
): number {
  const snapTrain = snapToTrack(trainLat, trainLon, lineCode);
  const snapTo = snapToTrack(toLat, toLon, lineCode);

  if (snapTrain && snapTo && snapTrain.branchId === snapTo.branchId) {
    const railDist = Math.abs(snapTo.cumulativeKm - snapTrain.cumulativeKm);
    if (railDist > 0.01) {
      return railDist;
    }
  }

  // Fallback Haversine
  return haversineKm(trainLat, trainLon, toLat, toLon);
}

/**
 * Retorna la distància de traçat de via entre dos punts qualsevol
 */
export function getTrackArcDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  lineCode?: string
): number {
  const snap1 = snapToTrack(lat1, lon1, lineCode);
  const snap2 = snapToTrack(lat2, lon2, lineCode);

  if (snap1 && snap2 && snap1.branchId === snap2.branchId) {
    const d = Math.abs(snap2.cumulativeKm - snap1.cumulativeKm);
    if (d > 0.01) return d;
  }

  return haversineKm(lat1, lon1, lat2, lon2);
}
