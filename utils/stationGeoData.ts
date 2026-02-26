/**
 * FGC Station Geo Data — Single source of truth
 *
 * Data sources:
 *  - GPS coordinates: dadesobertes.fgc.cat/api/v2/catalog/datasets/gtfs_stops
 *  - Kilometric points (PK): "Punts Quilomètrics.pdf" (Itinerari BV07, Dec 2022 / March 2023)
 *  - Distance between stations: same PDF (km)
 *  - Declivity: same PDF (‰, ascending direction)
 *  - Speed limits: "Velocitats màximes i limitacions.pdf" (Itinerari BV07, Dec 2022 / March 2023)
 *    → see utils/speedLimits.ts for the full speed-limit tables
 *
 * PK coordinates are NOT contiguous across the whole network.
 * Each segment has its own PK origin (0.000):
 *   PC/RE  → consecutive from Pl.Catalunya to Reina Elisenda
 *   GR/TB  → starts at 0 from Gràcia towards Av.Tibidabo
 *   SR/LP  → starts at 0 from Sarrià towards Les Planes  (VL & LP only)
 *   LP/TR  → starts at 0 from Les Planes towards Terrassa Rambla
 *   LP/NA  → continues LP/TR PK from TR to NA  (TR=20.150, VP=21.670, EN=22.585, NA=23.852)
 *   SC/PN  → starts at 0 from Sant Cugat towards Sabadell Parc del Nord
 *   BT/UN  → Universitat Autònoma has its own sub-PK inside SC/PN segment (BT→UN = 1.300km)
 */
import { avgSpeedKmhBetweenPks } from './speedLimits';

export interface StationGeoData {
    /** Short code used in GeoTren API (origen/desti/properes_parades/estacionat_a) */
    id: string;
    /** Human-readable name */
    name: string;
    /** GPS latitude (WGS-84) from FGC GTFS stops */
    lat: number;
    /** GPS longitude (WGS-84) from FGC GTFS stops */
    lon: number;
    /** PK within its segment (km) */
    pk: number;
    /** Which PK segment this station belongs to */
    pkSegment: PkSegment;
    /** Distance to NEXT station in the same direction (km) — undefined for terminal stations */
    distToNext?: number;
    /** Declivity to next station in ‰ (ascending), + = uphill, - = downhill */
    declivToNext?: number;
}

export type PkSegment =
    | 'PC/RE'
    | 'GR/TB'
    | 'SR/LP'
    | 'LP/TR'
    | 'LP/NA'
    | 'SC/PN'
    | 'BT/UN';

/**
 * All FGC Barcelona-Vallès metropolitan line stations with GPS + PK data.
 *
 * Station ordering within each segment is ASCENDING (lowest PK → highest PK).
 */
export const STATION_GEO_DATA: StationGeoData[] = [
    // ── Segment PC/RE (Pl.Catalunya → Reina Elisenda) ──────────────────────
    { id: 'PC', name: 'Plaça Catalunya', lat: 41.38563194, lon: 2.168720219, pk: 0.000, pkSegment: 'PC/RE', distToNext: 1.220, declivToNext: 29 },
    { id: 'PR', name: 'Provença', lat: 41.39281434, lon: 2.158030869, pk: 1.220, pkSegment: 'PC/RE', distToNext: 0.830, declivToNext: 38 },
    { id: 'GR', name: 'Gràcia', lat: 41.39943, lon: 2.15196, pk: 2.050, pkSegment: 'PC/RE', distToNext: 0.560, declivToNext: 24 },
    { id: 'SG', name: 'Sant Gervasi', lat: 41.40106608, lon: 2.147133783, pk: 2.610, pkSegment: 'PC/RE', distToNext: 0.470, declivToNext: 36 },
    { id: 'MN', name: 'Muntaner', lat: 41.39852644, lon: 2.142346041, pk: 3.080, pkSegment: 'PC/RE', distToNext: 0.530, declivToNext: 11 },
    { id: 'BN', name: 'La Bonanova', lat: 41.39781569, lon: 2.136433966, pk: 3.610, pkSegment: 'PC/RE', distToNext: 0.470, declivToNext: 25 },
    { id: 'TT', name: 'Les Tres Torres', lat: 41.39780042, lon: 2.130811822, pk: 4.080, pkSegment: 'PC/RE', distToNext: 0.530, declivToNext: 40 },
    { id: 'SR', name: 'Sarrià', lat: 41.39849938, lon: 2.125574875, pk: 4.610, pkSegment: 'PC/RE', distToNext: 0.550, declivToNext: 6 },
    { id: 'RE', name: 'Reina Elisenda', lat: 41.40028, lon: 2.119350, pk: 5.160, pkSegment: 'PC/RE' },

    // ── Segment GR/TB (Gràcia → Av.Tibidabo) ───────────────────────────────
    // GR is shared with PC/RE but PK resets to 0 at GR for this branch
    { id: 'PM', name: 'Pl. Molina', lat: 41.40262, lon: 2.14866, pk: 0.600, pkSegment: 'GR/TB', distToNext: 0.410, declivToNext: 25 },
    { id: 'PD', name: 'Pàdua', lat: 41.40351065, lon: 2.142759094, pk: 1.010, pkSegment: 'GR/TB', distToNext: 0.400, declivToNext: 46 },
    { id: 'EP', name: 'El Putxet', lat: 41.40582569, lon: 2.139151477, pk: 1.410, pkSegment: 'GR/TB', distToNext: 0.450, declivToNext: 40 },
    { id: 'TB', name: 'Av. Tibidabo', lat: 41.40964799, lon: 2.137162791, pk: 1.860, pkSegment: 'GR/TB' },

    // ── Segment SR/LP (Sarrià → Les Planes, via Vallvidrera) ───────────────
    // PK resets at SR (0.000 not listed explicitly, SR itself is on PC/RE)
    // The PDF shows VL and LP with SR/LP reference
    { id: 'PF', name: 'Peu del Funicular', lat: 41.40921616, lon: 2.111181541, pk: 3.110, pkSegment: 'SR/LP', distToNext: 0.650, declivToNext: 37 },
    { id: 'VL', name: 'Baixador de Vallvidrera', lat: 41.42009441, lon: 2.096936777, pk: 3.760, pkSegment: 'SR/LP', distToNext: 0.950, declivToNext: -18 },
    { id: 'LP', name: 'Les Planes', lat: 41.43282, lon: 2.08386, pk: 4.710, pkSegment: 'SR/LP' },

    // ── Segment LP/TR (Les Planes → Terrassa Rambla) ────────────────────────
    { id: 'LF', name: 'La Floresta', lat: 41.44487408, lon: 2.073166144, pk: 2.850, pkSegment: 'LP/TR', distToNext: 1.690, declivToNext: -26 },
    { id: 'VD', name: 'Valldoreix', lat: 41.45861, lon: 2.067450, pk: 4.540, pkSegment: 'LP/TR', distToNext: 1.450, declivToNext: -25 },
    { id: 'SC', name: 'Sant Cugat Centre', lat: 41.46791038, lon: 2.078203288, pk: 5.990, pkSegment: 'LP/TR', distToNext: 1.520, declivToNext: -5 },
    { id: 'MS', name: 'Mira-sol', lat: 41.47620923, lon: 2.046514894, pk: 7.510, pkSegment: 'LP/TR', distToNext: 1.540, declivToNext: -7 },
    { id: 'HG', name: 'Hospital General', lat: 41.47620923, lon: 2.046514894, pk: 9.050, pkSegment: 'LP/TR', distToNext: 1.840, declivToNext: -5 },
    { id: 'RB', name: 'Rubí Centre', lat: 41.48628798, lon: 2.031357969, pk: 10.890, pkSegment: 'LP/TR', distToNext: 4.920, declivToNext: 20 },
    { id: 'FN', name: 'Les Fonts', lat: 41.52846982, lon: 2.033582202, pk: 15.810, pkSegment: 'LP/TR', distToNext: 4.340, declivToNext: 26 },
    { id: 'TR', name: 'Terrassa Rambla', lat: 41.55974631, lon: 2.007525272, pk: 20.150, pkSegment: 'LP/TR', distToNext: 1.520, declivToNext: 9 },

    // ── Segment LP/NA (continuation from TR → Terrassa Nacions Unides) ─────
    { id: 'VP', name: 'Vallparadís Universitat', lat: 41.5633063, lon: 2.0190489, pk: 21.670, pkSegment: 'LP/NA', distToNext: 0.915, declivToNext: 40 },
    { id: 'EN', name: 'Terrassa Estació del Nord', lat: 41.5701675, lon: 2.015487, pk: 22.585, pkSegment: 'LP/NA', distToNext: 1.267, declivToNext: 38 },
    { id: 'NA', name: 'Terrassa Nacions Unides', lat: 41.5801339, lon: 2.0134592, pk: 23.852, pkSegment: 'LP/NA' },

    // ── Segment SC/PN (Sant Cugat → Sabadell Parc del Nord) ────────────────
    // PK resets at SC (0.000) for this branch direction
    { id: 'VO', name: 'Volpelleres', lat: 41.481248, lon: 2.072928, pk: 1.532, pkSegment: 'SC/PN', distToNext: 1.198, declivToNext: 15 },
    { id: 'SJ', name: 'Sant Joan', lat: 41.49015388, lon: 2.076498641, pk: 2.730, pkSegment: 'SC/PN', distToNext: 1.670, declivToNext: 7 },
    { id: 'BT', name: 'Bellaterra', lat: 41.50197, lon: 2.09094, pk: 4.400, pkSegment: 'SC/PN', distToNext: 1.300, declivToNext: -38 },
    // UN has its own sub-segment BT/UN (pk=1.300 within BT/UN)
    { id: 'UN', name: 'Universitat Autònoma', lat: 41.50285282, lon: 2.102510441, pk: 5.700, pkSegment: 'SC/PN', distToNext: 3.900, declivToNext: 30 },
    // Note: UN pk=5.700 is approximated as BT(4.400) + 1.300(BT/UN distance)
    { id: 'SQ', name: 'Sant Quirze', lat: 41.52999155, lon: 2.088722533, pk: 7.760, pkSegment: 'SC/PN', distToNext: 1.721, declivToNext: -38 },
    { id: 'CF', name: 'Can Feu | Gràcia', lat: 41.54120, lon: 2.08000, pk: 9.481, pkSegment: 'SC/PN', distToNext: 1.128, declivToNext: -38 },
    { id: 'PJ', name: 'Sabadell Plaça Major', lat: 41.54844, lon: 2.07100, pk: 10.609, pkSegment: 'SC/PN', distToNext: 1.147, declivToNext: 38 },
    { id: 'CT', name: 'La Creu Alta', lat: 41.55550, lon: 2.06680, pk: 11.756, pkSegment: 'SC/PN', distToNext: 0.779, declivToNext: 38 },
    { id: 'NO', name: 'Sabadell Nord', lat: 41.56110, lon: 2.06250, pk: 12.535, pkSegment: 'SC/PN', distToNext: 1.380, declivToNext: 30 },
    { id: 'PN', name: 'Sabadell Parc del Nord', lat: 41.57190, lon: 2.05930, pk: 13.918, pkSegment: 'SC/PN' },
];

/** Quick lookup map by station ID */
export const STATION_GEO_MAP = new Map<string, StationGeoData>(
    STATION_GEO_DATA.map(s => [s.id, s])
);

/**
 * Haversine distance in km between two GPS points
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate the interpolation factor (0.0 … 1.0) of a train between fromStation and toStation
 * using the GPS coordinates of the train and both stations.
 *
 * Returns 0.0 if the train is at fromStation, 1.0 if at toStation.
 */
export function interpolateBetweenStations(
    trainLat: number, trainLon: number,
    fromSt: StationGeoData, toSt: StationGeoData
): number {
    const totalDist = haversineKm(fromSt.lat, fromSt.lon, toSt.lat, toSt.lon);
    if (totalDist < 0.01) return 0;
    const distFromOrigin = haversineKm(fromSt.lat, fromSt.lon, trainLat, trainLon);
    return Math.max(0, Math.min(1, distFromOrigin / totalDist));
}

/**
 * Estimate ETA in minutes using a fixed average speed.
 * Kept as a fast fallback when PK data is not available.
 */
export function estimateEta(
    remainingKm: number,
    avgSpeedKmh = 60,
    knownDelayMin = 0
): number {
    const travelMin = (remainingKm / avgSpeedKmh) * 60;
    return Math.max(0, Math.round(travelMin + knownDelayMin));
}

/**
 * Estimate ETA in minutes using the REAL speed limits of the segment (PK-weighted average).
 *
 * This is the preferred method when both GPS coords and station PK data are available.
 *
 * @param fromSt      Station the train is currently between (or coming from)
 * @param toSt        Target next station
 * @param trainLat    Train GPS latitude
 * @param trainLon    Train GPS longitude
 * @param isAscending true = heading toward higher PK (toward Terrassa/Sabadell/Tibidabo/RE)
 * @param isContravia true = running on contravia track
 * @param knownDelayMin Official delay from GeoTren API (minutes, positive = late)
 */
export function estimateEtaByPk(
    fromSt: StationGeoData,
    toSt: StationGeoData,
    trainLat: number,
    trainLon: number,
    isAscending: boolean,
    isContravia = false,
    knownDelayMin = 0
): number {
    // Only valid when both stations share the same PK segment
    if (fromSt.pkSegment !== toSt.pkSegment) {
        // Cross-segment: fall back to haversine + max segment speed
        const distKm = haversineKm(trainLat, trainLon, toSt.lat, toSt.lon);
        return estimateEta(distKm, 60, knownDelayMin);
    }

    // PK of the train inferred from GPS interpolation within the segment
    const t = interpolateBetweenStations(trainLat, trainLon, fromSt, toSt);
    const trainPk = fromSt.pk + t * (toSt.pk - fromSt.pk);
    const pkFrom = trainPk;
    const pkTo = toSt.pk;

    // Weighted average speed along the remaining PK range
    const avgSpeed = avgSpeedKmhBetweenPks(
        fromSt.pkSegment,
        pkFrom,
        pkTo,
        isAscending,
        isContravia,
        30  // integration steps
    );

    // Remaining distance by GPS (more reliable than PK delta alone)
    const remainingKm = haversineKm(trainLat, trainLon, toSt.lat, toSt.lon);
    const travelMin = (remainingKm / avgSpeed) * 60;
    return Math.max(0, Math.round(travelMin + knownDelayMin));
}

/**
 * Given a train GPS position and its origin/destination station IDs,
 * return the interpolation factor (0-1) representing how far along the journey it is,
 * and the remaining km to the destination.
 */
export function getTrainProgress(
    trainLat: number,
    trainLon: number,
    fromId: string,
    toId: string
): { factor: number; remainingKm: number; travelledKm: number } | null {
    const fromSt = STATION_GEO_MAP.get(fromId);
    const toSt = STATION_GEO_MAP.get(toId);
    if (!fromSt || !toSt) return null;

    const factor = interpolateBetweenStations(trainLat, trainLon, fromSt, toSt);
    const totalKm = haversineKm(fromSt.lat, fromSt.lon, toSt.lat, toSt.lon);
    const travelledKm = factor * totalKm;
    const remainingKm = totalKm - travelledKm;

    return { factor, remainingKm, travelledKm };
}
