import { STATION_GEO_DATA, StationGeoData, PkSegment } from './stationGeoData';
import { getDetailedSpeedInfo, DetailedSpeedInfo, PkSegmentKey } from './speedLimits';


export type { PkSegment, StationGeoData };


export interface PkLocationResult {
    pk: number;
    segment: PkSegment;
    lat: number;
    lon: number;
    prevStation: StationGeoData | null;
    nextStation: StationGeoData | null;
    exactStation: StationGeoData | null;
    percentage: number; // 0-1 within the segment between stations
    speedInfo?: DetailedSpeedInfo;
}


/**
 * Gets all stations belonging to a specific PK segment, sorted by PK.
 */
export function getStationsInSegment(segment: PkSegment): StationGeoData[] {
    return STATION_GEO_DATA.filter(s => s.pkSegment === segment).sort((a, b) => a.pk - b.pk);
}

/**
 * Finds the location of a PK within a segment, including surrounding stations and interpolated GPS.
 */
export function findPkLocation(segment: PkSegment, pk: number): PkLocationResult | null {
    const stations = getStationsInSegment(segment);
    if (stations.length === 0) return null;

    // Check if it's exactly one of the stations
    const exact = stations.find(s => Math.abs(s.pk - pk) < 0.001);
    if (exact) {
        return {
            pk,
            segment,
            lat: exact.lat,
            lon: exact.lon,
            prevStation: exact,
            nextStation: exact,
            exactStation: exact,
            percentage: 0,
            speedInfo: getDetailedSpeedInfo(segment as PkSegmentKey, pk)
        };

    }

    // Find the bounding stations
    let prev: StationGeoData | null = null;
    let next: StationGeoData | null = null;

    for (let i = 0; i < stations.length; i++) {
        if (stations[i].pk < pk) {
            prev = stations[i];
        } else if (stations[i].pk > pk && !next) {
            next = stations[i];
            break;
        }
    }

    // Handle out of bounds (before first or after last)
    if (!prev && next) {
        // Extrapolate before first (not recommended but for safety)
        return {
            pk, segment, lat: next.lat, lon: next.lon,
            prevStation: null, nextStation: next, exactStation: null, percentage: 0,
            speedInfo: getDetailedSpeedInfo(segment as PkSegmentKey, pk)
        };

    }
    if (prev && !next) {
        // After last station
        return {
            pk, segment, lat: prev.lat, lon: prev.lon,
            prevStation: prev, nextStation: null, exactStation: null, percentage: 1,
            speedInfo: getDetailedSpeedInfo(segment as PkSegmentKey, pk)
        };

    }

    if (prev && next) {
        const span = next.pk - prev.pk;
        const offset = pk - prev.pk;
        const pct = span === 0 ? 0 : offset / span;

        // Linear interpolation of GPS
        const lat = prev.lat + (next.lat - prev.lat) * pct;
        const lon = prev.lon + (next.lon - prev.lon) * pct;

        return {
            pk, segment, lat, lon,
            prevStation: prev, nextStation: next, exactStation: null, percentage: pct,
            speedInfo: getDetailedSpeedInfo(segment as PkSegmentKey, pk)
        };

    }

    return null;
}

/**
 * Helper to get all available segments
 */
export const PK_SEGMENTS: PkSegment[] = [
    'PC/RE', 'GR/TB', 'SR/LP', 'LP/TR', 'LP/NA', 'SC/PN', 'BT/UN'
];

/**
 * Simplified search by station name or ID that returns PK info
 */
export function findStationPk(query: string): StationGeoData | null {
    const normalized = query.toLowerCase().trim();
    return STATION_GEO_DATA.find(s =>
        s.id.toLowerCase() === normalized ||
        s.name.toLowerCase().includes(normalized)
    ) || null;
}
