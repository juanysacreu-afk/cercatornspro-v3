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
import { interpolateOnTrack, getRemainingRailKm, getTrackArcDistanceKm, snapToTrack } from './trackGeometry';

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
    { id: 'PC', name: 'Plaça Catalunya', lat: 41.385684, lon: 2.169515, pk: 0.000, pkSegment: 'PC/RE', distToNext: 1.220, declivToNext: 29 },
    { id: 'PR', name: 'Provença', lat: 41.39284054461246, lon: 2.158057764172554, pk: 1.220, pkSegment: 'PC/RE', distToNext: 0.830, declivToNext: 38 },
    { id: 'GR', name: 'Gràcia', lat: 41.399772122369974, lon: 2.1519875898957253, pk: 2.050, pkSegment: 'PC/RE', distToNext: 0.560, declivToNext: 24 },
    { id: 'SG', name: 'Sant Gervasi', lat: 41.40115960666528, lon: 2.146838754415512, pk: 2.610, pkSegment: 'PC/RE', distToNext: 0.470, declivToNext: 36 },
    { id: 'MN', name: 'Muntaner', lat: 41.39841327951267, lon: 2.1421167254447937, pk: 3.080, pkSegment: 'PC/RE', distToNext: 0.530, declivToNext: 11 },
    { id: 'BN', name: 'La Bonanova', lat: 41.397815711638636, lon: 2.13643379509449, pk: 3.610, pkSegment: 'PC/RE', distToNext: 0.470, declivToNext: 25 },
    { id: 'TT', name: 'Les Tres Torres', lat: 41.39780036996682, lon: 2.131182700395584, pk: 4.080, pkSegment: 'PC/RE', distToNext: 0.530, declivToNext: 40 },
    { id: 'SR', name: 'Sarrià', lat: 41.39849954411812, lon: 2.1255748718976974, pk: 4.610, pkSegment: 'PC/RE', distToNext: 0.550, declivToNext: 6 },
    { id: 'RE', name: 'Reina Elisenda', lat: 41.39910817160831, lon: 2.119360528886318, pk: 5.160, pkSegment: 'PC/RE' },

    // ── Segment GR/TB (Gràcia → Av.Tibidabo) ───────────────────────────────
    // GR is shared with PC/RE but PK resets to 0 at GR for this branch
    { id: 'PM', name: 'Pl. Molina', lat: 41.40137789948557, lon: 2.1475492045283318, pk: 0.600, pkSegment: 'GR/TB', distToNext: 0.410, declivToNext: 25 },
    { id: 'PD', name: 'Pàdua', lat: 41.403358848160295, lon: 2.142944857478142, pk: 1.010, pkSegment: 'GR/TB', distToNext: 0.400, declivToNext: 46 },
    { id: 'EP', name: 'El Putxet', lat: 41.405802949296096, lon: 2.1391217038035393, pk: 1.410, pkSegment: 'GR/TB', distToNext: 0.450, declivToNext: 40 },
    { id: 'TB', name: 'Av. Tibidabo', lat: 41.41000993758941, lon: 2.1370570734143257, pk: 1.860, pkSegment: 'GR/TB' },

    // ── Segment SR/LP (Sarrià → Les Planes, via Vallvidrera) ───────────────
    // PK resets at SR (0.000 not listed explicitly, SR itself is on PC/RE)
    // The PDF shows VL and LP with SR/LP reference
    { id: 'PF', name: 'Peu del Funicular', lat: 41.40906621789071, lon: 2.1114349365234375, pk: 3.110, pkSegment: 'SR/LP', distToNext: 0.650, declivToNext: 37 },
    { id: 'VL', name: 'Baixador de Vallvidrera', lat: 41.42009453571699, lon: 2.0969365909695625, pk: 3.760, pkSegment: 'SR/LP', distToNext: 0.950, declivToNext: -18 },
    { id: 'LP', name: 'Les Planes', lat: 41.42739677045619, lon: 2.091561108827591, pk: 4.710, pkSegment: 'SR/LP' },

    // ── Segment LP/TR (Les Planes → Terrassa Rambla) ────────────────────────
    { id: 'LF', name: 'La Floresta', lat: 41.444889027011854, lon: 2.0731329917907715, pk: 2.850, pkSegment: 'LP/TR', distToNext: 1.690, declivToNext: -26 },
    { id: 'VD', name: 'Valldoreix', lat: 41.45787220385147, lon: 2.0682255551218987, pk: 4.540, pkSegment: 'LP/TR', distToNext: 1.450, declivToNext: -25 },
    { id: 'SC', name: 'Sant Cugat Centre', lat: 41.467851890381816, lon: 2.078401856124401, pk: 5.990, pkSegment: 'LP/TR', distToNext: 1.520, declivToNext: -5 },
    { id: 'MS', name: 'Mira-sol', lat: 41.4693142929502, lon: 2.061460353434086, pk: 7.510, pkSegment: 'LP/TR', distToNext: 1.540, declivToNext: -7 },
    { id: 'HG', name: 'Hospital General', lat: 41.47616260098431, lon: 2.0465093851089478, pk: 9.050, pkSegment: 'LP/TR', distToNext: 1.840, declivToNext: -5 },
    { id: 'RB', name: 'Rubí Centre', lat: 41.48628815932077, lon: 2.0313579216599464, pk: 10.890, pkSegment: 'LP/TR', distToNext: 4.920, declivToNext: 20 },
    { id: 'FN', name: 'Les Fonts', lat: 41.52846982344765, lon: 2.033582143485546, pk: 15.810, pkSegment: 'LP/TR', distToNext: 4.340, declivToNext: 26 },
    { id: 'TR', name: 'Terrassa Rambla', lat: 41.55974646958262, lon: 2.0075251534581184, pk: 20.150, pkSegment: 'LP/TR', distToNext: 1.520, declivToNext: 9 },

    // ── Segment LP/NA (continuation from TR → Terrassa Nacions Unides) ─────
    { id: 'VP', name: 'Vallparadís Universitat', lat: 41.5633785382763, lon: 2.01901338994503, pk: 21.670, pkSegment: 'LP/NA', distToNext: 0.915, declivToNext: 40 },
    { id: 'EN', name: 'Terrassa Estació del Nord', lat: 41.570166, lon: 2.015349, pk: 22.585, pkSegment: 'LP/NA', distToNext: 1.267, declivToNext: 38 },
    { id: 'NA', name: 'Terrassa Nacions Unides', lat: 41.580123100787944, lon: 2.0134012028574944, pk: 23.852, pkSegment: 'LP/NA' },

    // ── Segment SC/PN (Sant Cugat → Sabadell Parc del Nord) ────────────────
    // PK resets at SC (0.000) for this branch direction
    { id: 'VO', name: 'Volpelleres', lat: 41.48125772891728, lon: 2.0727162435650826, pk: 1.532, pkSegment: 'SC/PN', distToNext: 1.198, declivToNext: 15 },
    { id: 'SJ', name: 'Sant Joan', lat: 41.49043744300665, lon: 2.0769598335027695, pk: 2.730, pkSegment: 'SC/PN', distToNext: 1.670, declivToNext: 7 },
    { id: 'BT', name: 'Bellaterra', lat: 41.50092888935837, lon: 2.0904506742954254, pk: 4.400, pkSegment: 'SC/PN', distToNext: 1.300, declivToNext: -38 },
    // UN has its own sub-segment BT/UN (pk=1.300 within BT/UN)
    { id: 'UN', name: 'Universitat Autònoma', lat: 41.50283749795864, lon: 2.1027063578367233, pk: 5.700, pkSegment: 'SC/PN', distToNext: 3.900, declivToNext: 30 },
    // Note: UN pk=5.700 is approximated as BT(4.400) + 1.300(BT/UN distance)
    { id: 'SQ', name: 'Sant Quirze', lat: 41.53008672303255, lon: 2.0885851979255676, pk: 7.760, pkSegment: 'SC/PN', distToNext: 1.721, declivToNext: -38 },
    { id: 'CF', name: 'Can Feu | Gràcia', lat: 41.54264957436718, lon: 2.1008844673633575, pk: 9.481, pkSegment: 'SC/PN', distToNext: 1.128, declivToNext: -38 },
    { id: 'PJ', name: 'Sabadell Plaça Major', lat: 41.54730813610192, lon: 2.108660191297531, pk: 10.609, pkSegment: 'SC/PN', distToNext: 1.147, declivToNext: 38 },
    { id: 'CT', name: 'La Creu Alta', lat: 41.55495407433468, lon: 2.100384905934334, pk: 11.756, pkSegment: 'SC/PN', distToNext: 0.779, declivToNext: 38 },
    { id: 'NO', name: 'Sabadell Nord', lat: 41.56196191026595, lon: 2.0962321758270264, pk: 12.535, pkSegment: 'SC/PN', distToNext: 1.380, declivToNext: 30 },
    { id: 'PN', name: 'Sabadell Parc del Nord', lat: 41.57129121543971, lon: 2.0894988253712654, pk: 13.918, pkSegment: 'SC/PN' },
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
    fromSt: StationGeoData, toSt: StationGeoData,
    lineCode?: string
): number {
    return interpolateOnTrack(trainLat, trainLon, fromSt.lat, fromSt.lon, toSt.lat, toSt.lon, lineCode);
}

/**
 * Estimate ETA in minutes using a fixed average speed with kinematic adjustments.
 * Kept as a fast fallback when PK data is not available.
 */
export function estimateEta(
    remainingKm: number,
    avgSpeedKmh = 60,
    knownDelayMin = 0,
    fusionState: 'EN_ANDANA' | 'APROXIMANT' | 'EN_MARXA' = 'EN_MARXA',
    intermediateStopsCount = 0
): number {
    const pureTravelSec = (remainingKm / Math.max(10, avgSpeedKmh)) * 3600;

    // Kinematic adjustment (acceleration + deceleration losses)
    let kinematicLossSec = 0;
    let dwellLossSec = intermediateStopsCount * 25;

    if (fusionState === 'EN_ANDANA') {
        dwellLossSec += 15; // remaining dwell at origin platform
        kinematicLossSec += 20; // full acceleration from 0 + deceleration into destination
    } else if (fusionState === 'APROXIMANT') {
        kinematicLossSec += 12; // final braking into target station
    } else {
        kinematicLossSec += 12; // deceleration into target station from cruise speed
    }

    if (intermediateStopsCount > 0) {
        kinematicLossSec += intermediateStopsCount * 20;
    }

    const totalSec = pureTravelSec + kinematicLossSec + dwellLossSec;
    return Math.max(0, Math.round(totalSec / 60 + knownDelayMin));
}

/**
 * Estimate ETA in minutes using the REAL speed limits of the segment (PK-weighted average),
 * adjusted for realistic acceleration/braking curves and dwell times.
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
 * @param fusionState Current sensor-fusion state ('EN_ANDANA' | 'APROXIMANT' | 'EN_MARXA')
 * @param intermediateStopsCount Count of intermediate stops before target
 */
export function estimateEtaByPk(
    fromSt: StationGeoData,
    toSt: StationGeoData,
    trainLat: number,
    trainLon: number,
    isAscending: boolean,
    isContravia = false,
    knownDelayMin = 0,
    fusionState: 'EN_ANDANA' | 'APROXIMANT' | 'EN_MARXA' = 'EN_MARXA',
    intermediateStopsCount = 0
): number {
    // Only valid when both stations share the same PK segment
    if (fromSt.pkSegment !== toSt.pkSegment) {
        // Cross-segment: fall back to railway track curve distance + max segment speed
        const distKm = getRemainingRailKm(trainLat, trainLon, toSt.lat, toSt.lon);
        return estimateEta(distKm, 60, knownDelayMin, fusionState, intermediateStopsCount);
    }

    // PK of the train inferred from GPS interpolation along track within the segment
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

    // Remaining distance along railway track curve (arc length, avoids straight line distortion)
    const remainingKm = getRemainingRailKm(trainLat, trainLon, toSt.lat, toSt.lon);
    const pureTravelSec = (remainingKm / Math.max(10, avgSpeed)) * 3600;

    // Kinematics and dwell loss calculations
    let kinematicLossSec = 0;
    let dwellLossSec = intermediateStopsCount * 25;

    if (fusionState === 'EN_ANDANA') {
        dwellLossSec += 15; // remaining dwell at origin
        kinematicLossSec += (avgSpeed >= 80 ? 25 : 18); // acc from 0 + dec at dest
    } else if (fusionState === 'APROXIMANT') {
        kinematicLossSec += 12; // final braking into target station
    } else {
        kinematicLossSec += (avgSpeed >= 80 ? 14 : 9); // dec from cruise into dest
    }

    if (intermediateStopsCount > 0) {
        kinematicLossSec += intermediateStopsCount * (avgSpeed >= 80 ? 25 : 18);
    }

    const totalSec = pureTravelSec + kinematicLossSec + dwellLossSec;
    return Math.max(0, Math.round(totalSec / 60 + knownDelayMin));
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

/**
 * All active station coordinates defined officially in FGC GeoTren client (https://geotren.fgc.cat/js/geotren.min.js).
 * Includes both Barcelona-Vallès (BV) and Llobregat-Anoia (LA) networks.
 */
export const GEOTREN_OFFICIAL_STATIONS: Record<string, { name: string; lat: number; lon: number; network: 'BV' | 'LA' }> = {
    'PC': { name: 'Pl. Catalunya', lat: 41.385684, lon: 2.169515, network: 'BV' },
    'PR': { name: 'Provença', lat: 41.39284054461246, lon: 2.158057764172554, network: 'BV' },
    'GR': { name: 'Gràcia', lat: 41.399772122369974, lon: 2.1519875898957253, network: 'BV' },
    'SG': { name: 'Sant Gervasi', lat: 41.40115960666528, lon: 2.146838754415512, network: 'BV' },
    'MN': { name: 'Muntaner', lat: 41.39841327951267, lon: 2.1421167254447937, network: 'BV' },
    'BN': { name: 'La Bonanova', lat: 41.397815711638636, lon: 2.13643379509449, network: 'BV' },
    'TT': { name: 'Les Tres Torres', lat: 41.39780036996682, lon: 2.131182700395584, network: 'BV' },
    'SR': { name: 'Sarrià', lat: 41.39849954411812, lon: 2.1255748718976974, network: 'BV' },
    'RE': { name: 'Reina Elisenda', lat: 41.39910817160831, lon: 2.119360528886318, network: 'BV' },
    'PM': { name: 'Pl. Molina', lat: 41.40137789948557, lon: 2.1475492045283318, network: 'BV' },
    'PD': { name: 'Pàdua', lat: 41.403358848160295, lon: 2.142944857478142, network: 'BV' },
    'EP': { name: 'El Putxet', lat: 41.405802949296096, lon: 2.1391217038035393, network: 'BV' },
    'TB': { name: 'Av. Tibidabo', lat: 41.41000993758941, lon: 2.1370570734143257, network: 'BV' },
    'PF': { name: 'Peu del Funicular', lat: 41.40906621789071, lon: 2.1114349365234375, network: 'BV' },
    'VL': { name: 'Baixador de Vallvidrera', lat: 41.42009453571699, lon: 2.0969365909695625, network: 'BV' },
    'LP': { name: 'Les Planes', lat: 41.42739677045619, lon: 2.091561108827591, network: 'BV' },
    'LF': { name: 'La Floresta', lat: 41.444889027011854, lon: 2.0731329917907715, network: 'BV' },
    'VD': { name: 'Valldoreix', lat: 41.45787220385147, lon: 2.0682255551218987, network: 'BV' },
    'SC': { name: 'Sant Cugat', lat: 41.467851890381816, lon: 2.078401856124401, network: 'BV' },
    'MS': { name: 'Mira-sol', lat: 41.4693142929502, lon: 2.061460353434086, network: 'BV' },
    'HG': { name: 'Hospital General', lat: 41.47616260098431, lon: 2.0465093851089478, network: 'BV' },
    'RB': { name: 'Rubí', lat: 41.48628815932077, lon: 2.0313579216599464, network: 'BV' },
    'FN': { name: 'Les Fonts', lat: 41.52846982344765, lon: 2.033582143485546, network: 'BV' },
    'TR': { name: 'Terrassa-Rambla', lat: 41.55974646958262, lon: 2.0075251534581184, network: 'BV' },
    'SJ': { name: 'Sant Joan', lat: 41.49043744300665, lon: 2.0769598335027695, network: 'BV' },
    'BT': { name: 'Bellaterra', lat: 41.50092888935837, lon: 2.0904506742954254, network: 'BV' },
    'UN': { name: 'Universitat Autònoma', lat: 41.50283749795864, lon: 2.1027063578367233, network: 'BV' },
    'SQ': { name: 'Sant Quirze', lat: 41.53008672303255, lon: 2.0885851979255676, network: 'BV' },
    'CF': { name: 'Can Feu | Gràcia', lat: 41.54264957436718, lon: 2.1008844673633575, network: 'BV' },
    'PJ': { name: 'Sabadell P.Major', lat: 41.54730813610192, lon: 2.108660191297531, network: 'BV' },
    'VO': { name: 'Volpelleres', lat: 41.48125772891728, lon: 2.0727162435650826, network: 'BV' },
    'VP': { name: 'Vallparadis Universitat', lat: 41.5633785382763, lon: 2.01901338994503, network: 'BV' },
    'EN': { name: 'Terrassa Estació del Nord', lat: 41.570166, lon: 2.015349, network: 'BV' },
    'NA': { name: 'Terrassa Nacions Unides', lat: 41.580123100787944, lon: 2.0134012028574944, network: 'BV' },
    'CT': { name: 'La Creu Alta', lat: 41.55495407433468, lon: 2.100384905934334, network: 'BV' },
    'NO': { name: 'Sabadell Nord', lat: 41.56196191026595, lon: 2.0962321758270264, network: 'BV' },
    'PN': { name: 'Sabadell Parc N.', lat: 41.57129121543971, lon: 2.0894988253712654, network: 'BV' },
    'PE': { name: 'Pl. Espanya', lat: 41.37451810409889, lon: 2.1484675258398056, network: 'LA' },
    'MG': { name: 'Magòria', lat: 41.36807172253963, lon: 2.1395907551050186, network: 'LA' },
    'IC': { name: 'Ildefons Cerdà', lat: 41.361153373572385, lon: 2.1301721781492233, network: 'LA' },
    'EU': { name: 'Europa | Fira', lat: 41.35722558606671, lon: 2.12457574903965, network: 'LA' },
    'GO': { name: 'Gornal', lat: 41.35510531778874, lon: 2.117231860756874, network: 'LA' },
    'SP': { name: 'Sant Josep', lat: 41.360987539566885, lon: 2.1103429421782494, network: 'LA' },
    'LH': { name: 'L´Hospitalet', lat: 41.35798081271976, lon: 2.102489434182644, network: 'LA' },
    'AL': { name: 'Almeda', lat: 41.353083134083256, lon: 2.0847097411751747, network: 'LA' },
    'CO': { name: 'Cornellà Riera', lat: 41.351595461384846, lon: 2.0707934349775314, network: 'LA' },
    'BO': { name: 'Sant Boi', lat: 41.34859811669659, lon: 2.043052688241005, network: 'LA' },
    'ML': { name: 'Molí Nou', lat: 41.35810664103389, lon: 2.034914866089821, network: 'LA' },
    'QC': { name: 'Quatre Camins', lat: 41.40672307837789, lon: 2.00174767524004, network: 'LA' },
    'MO': { name: 'Monistrol de M.', lat: 41.61033319379176, lon: 1.8491195887327194, network: 'LA' },
    'MP': { name: 'Monistrol Vila', lat: 41.6153192693718, lon: 1.8429923160618777, network: 'LA' },
    'MM': { name: 'Montserrat Monestir', lat: 41.59227842605783, lon: 1.8365905079702394, network: 'LA' },
};
