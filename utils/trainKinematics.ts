import { STATION_GEO_DATA, StationGeoData, haversineKm } from './stationGeoData';
import { resolveStationId } from './stations';

export type StationFusionState = 'EN_ANDANA' | 'APROXIMANT' | 'EN_MARXA';

export interface StationFusionResult {
    state: StationFusionState;
    stationCode: string | null;
    isMoving: boolean;
    speedKmh: number;
    distanceMeters: number | null;
    reason: 'ISIC_CONFIRMED' | 'GPS_STOPPED_AT_PLATFORM' | 'GPS_APPROACHING' | 'RUNNING_INTERSTATION';
}

interface KinematicSample {
    lat: number;
    lon: number;
    timestamp: number;
    speedKmh: number;
}

// In-memory cache of train kinematics over consecutive polls
const kinematicsCache = new Map<string, KinematicSample>();

/**
 * Calculates distance in meters between two coordinates
 */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return haversineKm(lat1, lon1, lat2, lon2) * 1000;
}

/**
 * Tracks train movement across polling cycles and calculates speed in km/h.
 * Discards noisy GPS jumps or stale data (> 120s).
 */
export function recordTrainKinematics(
    trainId: string,
    lat?: number | null,
    lon?: number | null,
    timestampMs: number = Date.now()
): { speedKmh: number; deltaSec: number } {
    if (!lat || !lon) {
        return { speedKmh: 0, deltaSec: 0 };
    }

    const prev = kinematicsCache.get(trainId);
    if (!prev) {
        kinematicsCache.set(trainId, { lat, lon, timestamp: timestampMs, speedKmh: 0 });
        return { speedKmh: 0, deltaSec: 0 };
    }

    const deltaSec = (timestampMs - prev.timestamp) / 1000;

    // Reject micro-intervals (< 1s) to avoid division by zero or jitter
    if (deltaSec < 1) {
        return { speedKmh: prev.speedKmh, deltaSec };
    }

    // If more than 120 seconds passed, consider previous sample stale
    if (deltaSec > 120) {
        kinematicsCache.set(trainId, { lat, lon, timestamp: timestampMs, speedKmh: 0 });
        return { speedKmh: 0, deltaSec };
    }

    const distKm = haversineKm(prev.lat, prev.lon, lat, lon);
    const rawSpeedKmh = (distKm / deltaSec) * 3600;

    // Discard unrealistic GPS teleport jumps (> 130 km/h)
    let speedKmh = rawSpeedKmh > 130 ? prev.speedKmh : rawSpeedKmh;

    // Smooth speed with exponential moving average
    speedKmh = Math.round(0.7 * speedKmh + 0.3 * prev.speedKmh);

    kinematicsCache.set(trainId, { lat, lon, timestamp: timestampMs, speedKmh });
    return { speedKmh, deltaSec };
}

/**
 * Fuses iSIC (interlocking/track circuit) telemetry with GPS kinematics
 * to definitively determine if a train is:
 *  - 'EN_ANDANA': Stopped at the platform
 *  - 'APROXIMANT': Decelerating / entering the station
 *  - 'EN_MARXA': Running in line
 */
export function detectStationFusion(
    rawEstacionatA: string | null | undefined,
    line: string,
    trainLat?: number | null,
    trainLon?: number | null,
    speedKmh: number = 0,
    candidateStationCodes?: string[],
    nextTargetCode?: string | null
): StationFusionResult {
    // ── Priority 1: iSIC Interlocking (Absolute Truth) ─────────────────────────
    if (rawEstacionatA && rawEstacionatA.trim() !== '') {
        const stationCode = resolveStationId(rawEstacionatA.trim(), line);
        return {
            state: 'EN_ANDANA',
            stationCode,
            isMoving: speedKmh > 8, // Usually false, unless rolling out of platform
            speedKmh,
            distanceMeters: 0,
            reason: 'ISIC_CONFIRMED'
        };
    }

    // ── Priority 2: GPS Proximity + Kinematics Fusion ────────────────────────
    if (trainLat && trainLon) {
        // Filter stations: prefer candidate stations on the train's route
        let searchPool = STATION_GEO_DATA;
        if (candidateStationCodes && candidateStationCodes.length > 0) {
            const codeSet = new Set(candidateStationCodes.map(c => c.toUpperCase()));
            searchPool = STATION_GEO_DATA.filter(s => codeSet.has(s.id.toUpperCase()));
            // Fallback to all stations if candidate filter matched nothing
            if (searchPool.length === 0) searchPool = STATION_GEO_DATA;
        }

        let nearestStation: StationGeoData | null = null;
        let minDistanceMeters = Infinity;

        for (const st of searchPool) {
            const d = haversineMeters(trainLat, trainLon, st.lat, st.lon);
            if (d < minDistanceMeters) {
                minDistanceMeters = d;
                nearestStation = st;
            }
        }

        if (nearestStation) {
            const isTargetStation = nextTargetCode
                ? nearestStation.id.toUpperCase() === nextTargetCode.toUpperCase()
                : true;

            // Threshold A: Platform footprint (within 75 meters)
            if (minDistanceMeters <= 75) {
                if (speedKmh <= 7) {
                    // Stopped at platform even if iSIC telemetry has latency
                    return {
                        state: 'EN_ANDANA',
                        stationCode: nearestStation.id,
                        isMoving: false,
                        speedKmh,
                        distanceMeters: Math.round(minDistanceMeters),
                        reason: 'GPS_STOPPED_AT_PLATFORM'
                    };
                } else {
                    // Moving through or pulling into platform
                    return {
                        state: 'APROXIMANT',
                        stationCode: nearestStation.id,
                        isMoving: true,
                        speedKmh,
                        distanceMeters: Math.round(minDistanceMeters),
                        reason: 'GPS_APPROACHING'
                    };
                }
            }

            // Threshold B: Approaching outer perimeter (within 220 meters)
            if (minDistanceMeters <= 220 && isTargetStation) {
                return {
                    state: 'APROXIMANT',
                    stationCode: nearestStation.id,
                    isMoving: speedKmh > 3,
                    speedKmh,
                    distanceMeters: Math.round(minDistanceMeters),
                    reason: 'GPS_APPROACHING'
                };
            }
        }
    }

    // ── Priority 3: Inter-station running ─────────────────────────────────────
    return {
        state: 'EN_MARXA',
        stationCode: null,
        isMoving: true,
        speedKmh,
        distanceMeters: null,
        reason: 'RUNNING_INTERSTATION'
    };
}
