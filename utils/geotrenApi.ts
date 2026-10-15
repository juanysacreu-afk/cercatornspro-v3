import { decodeGeotrenCirculation } from '../views/incidencia/utils/decodeCirculation';
import { decodeGeotrenUt } from '../views/incidencia/utils/decodeUt';
import { resolveStationId, normalizeCircId } from './stations';

export interface NormalizedGeoTrenTrain {
  id: string;
  lin: string;
  nc?: string;
  dir: string;
  origen?: string;
  desti?: string;
  lat: number | null;
  lon: number | null;
  estacionat_a: string | null;
  properes_parades: string[]; // Resolved station codes, e.g. ['PF', 'VL', 'LP']
  raw_properes_parades: string;
  en_hora: boolean;
  tipus_unitat?: string;
  ut?: string;
  decodedUt?: string;
  circCode?: string; // e.g. 'F093', 'A032'
  geo_point_2d?: { lat: number; lon: number } | null;
}

const DIRECT_GEOTREN_URL = 'https://geotren.fgc.cat/tracker/trens.geojson';
const FALLBACK_GEOTREN_URL = 'https://dadesobertes.fgc.cat/api/v2/catalog/datasets/posicionament-dels-trens/exports/json';

let trainsCache: NormalizedGeoTrenTrain[] = [];
let lastFetchTime = 0;
const CACHE_TTL_MS = 2500; // 2.5s cache to collapse rapid concurrent calls across components

/**
 * Fetches real-time train positions directly from GeoTren with sub-second latency,
 * falling back to dadesobertes if needed.
 */
export async function fetchLiveGeoTrenTrains(forceRefresh = false): Promise<NormalizedGeoTrenTrain[]> {
  const now = Date.now();
  if (!forceRefresh && trainsCache.length > 0 && now - lastFetchTime < CACHE_TTL_MS) {
    return trainsCache;
  }

  // 1. Try Direct GeoTren GeoJSON (CORS enabled, sub-second latency, uncached)
  try {
    const res = await fetch(DIRECT_GEOTREN_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.features && Array.isArray(data.features)) {
        const trains = data.features.map((f: any) => {
          const p = f.properties || {};
          const coords = f.geometry?.coordinates;
          const properesList: string[] = Array.isArray(p.properes_parades)
            ? p.properes_parades.map((x: any) => resolveStationId(x.parada || x || '', p.lin || ''))
            : [];

          const decodedCirc = decodeGeotrenCirculation(p.id);
          const circCode = decodedCirc?.fullName?.toUpperCase() || '';
          const decodedUt = decodeGeotrenUt(p.ut, p.tipus_unitat) || p.ut || '';

          const lat = coords && coords.length >= 2 ? coords[1] : null;
          const lon = coords && coords.length >= 2 ? coords[0] : null;

          return {
            id: p.id || '',
            lin: p.lin || '',
            nc: p.nc || '',
            dir: p.dir || '',
            origen: p.origen || '',
            desti: p.desti || '',
            estacionat_a: p.estacionat_a ? resolveStationId(p.estacionat_a, p.lin || '') : null,
            properes_parades: properesList,
            raw_properes_parades: JSON.stringify(p.properes_parades || []),
            en_hora: p.en_hora === true || p.en_hora === 'True',
            tipus_unitat: p.tipus_unitat || '',
            ut: p.ut || '',
            decodedUt,
            circCode,
            lat,
            lon,
            geo_point_2d: (lat !== null && lon !== null) ? { lat, lon } : null
          } as NormalizedGeoTrenTrain;
        });

        trainsCache = trains;
        lastFetchTime = now;
        return trains;
      }
    }
  } catch (err) {
    console.warn('[geotrenApi] Direct feed error, trying fallback:', (err as Error).message);
  }

  // 2. Fallback to OpenData API
  try {
    const res = await fetch(FALLBACK_GEOTREN_URL, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const rawList = await res.json();
      if (Array.isArray(rawList)) {
        const trains = rawList.map((p: any) => {
          let properesList: string[] = [];
          if (p.properes_parades) {
            const matches = [...p.properes_parades.matchAll(/"parada":\s*"([^"]+)"/g)];
            properesList = matches.map((m: any) => resolveStationId(m[1].trim(), p.lin || ''));
          }

          const decodedCirc = decodeGeotrenCirculation(p.id);
          const circCode = decodedCirc?.fullName?.toUpperCase() || '';
          const decodedUt = decodeGeotrenUt(p.ut, p.tipus_unitat) || p.ut || '';

          const lat = p.geo_point_2d?.lat ?? null;
          const lon = p.geo_point_2d?.lon ?? null;

          return {
            id: p.id || '',
            lin: p.lin || '',
            nc: p.nc || '',
            dir: p.dir || '',
            origen: p.origen || '',
            desti: p.desti || '',
            estacionat_a: p.estacionat_a ? resolveStationId(p.estacionat_a, p.lin || '') : null,
            properes_parades: properesList,
            raw_properes_parades: p.properes_parades || '',
            en_hora: p.en_hora === true || p.en_hora === 'True',
            tipus_unitat: p.tipus_unitat || '',
            ut: p.ut || '',
            decodedUt,
            circCode,
            lat,
            lon,
            geo_point_2d: (lat !== null && lon !== null) ? { lat, lon } : null
          } as NormalizedGeoTrenTrain;
        });

        trainsCache = trains;
        lastFetchTime = now;
        return trains;
      }
    }
  } catch (err) {
    console.error('[geotrenApi] All GeoTren endpoints failed:', err);
  }

  return trainsCache;
}

/**
 * Searches a train in a GeoTren list matching multiple candidate identifiers
 * (e.g. ['A032', '032', '32'])
 */
export function findTrainInGeoTren(trains: NormalizedGeoTrenTrain[], candidateIds: string[]): NormalizedGeoTrenTrain | null {
  if (!candidateIds || candidateIds.length === 0 || trains.length === 0) return null;

  const searchSet = new Set(candidateIds.map(c => c.trim().toUpperCase()));
  const searchNormalized = new Set(candidateIds.map(c => normalizeCircId(c.trim().toUpperCase())));
  const searchDigits = new Set(
    candidateIds
      .map(c => c.replace(/\D/g, ''))
      .filter(Boolean)
      .flatMap(d => [d, d.padStart(3, '0'), parseInt(d, 10).toString()])
  );

  for (const t of trains) {
    if (!t.circCode) continue;
    const circCode = t.circCode.toUpperCase();
    if (searchSet.has(circCode) || searchNormalized.has(normalizeCircId(circCode))) {
      return t;
    }
    const digits = circCode.replace(/\D/g, '');
    if (digits && searchDigits.has(digits)) {
      return t;
    }
  }

  return null;
}
