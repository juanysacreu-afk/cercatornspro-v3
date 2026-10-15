import { MAP_SEGMENTS, MAP_STATIONS } from './mapConstants';
import { STATION_GEO_MAP } from '../../utils/stationGeoData';

export const getFullPath = (start: string, end: string): string[] => {
    if (start === end) return [start];

    const graph: Record<string, string[]> = {};
    MAP_SEGMENTS.forEach(seg => {
        if (!graph[seg.from]) graph[seg.from] = [];
        if (!graph[seg.to]) graph[seg.to] = [];
        if (!graph[seg.from].includes(seg.to)) graph[seg.from].push(seg.to);
        if (!graph[seg.to].includes(seg.from)) graph[seg.to].push(seg.from);
    });

    const queue: { node: string, path: string[] }[] = [{ node: start, path: [start] }];
    const visited = new Set<string>([start]);

    while (queue.length > 0) {
        const { node, path } = queue.shift()!;
        if (node === end) return path;

        const neighbors = graph[node] || [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push({ node: neighbor, path: [...path, neighbor] });
            }
        }
    }
    return [start];
};

export const getConnectivityIslands = (selectedCutStations: Set<string>, selectedCutSegments: Set<string>) => {
    const graph: Record<string, string[]> = {};
    MAP_STATIONS.forEach(s => graph[s.id] = []);
    MAP_SEGMENTS.forEach(seg => {
        const isV1Blocked = selectedCutSegments.has(`${seg.from}-${seg.to}-V1`) || selectedCutSegments.has(`${seg.to}-${seg.from}-V1`);
        const isV2Blocked = selectedCutSegments.has(`${seg.from}-${seg.to}-V2`) || selectedCutSegments.has(`${seg.to}-${seg.from}-V2`);
        const isSegmentBlocked = isV1Blocked && isV2Blocked; // Only impassable if both tracks are cut

        const isFromBlocked = selectedCutStations.has(seg.from);
        const isToBlocked = selectedCutStations.has(seg.to);
        if (!isSegmentBlocked && !isFromBlocked && !isToBlocked) {
            graph[seg.from].push(seg.to);
            graph[seg.to].push(seg.from);
        }
    });
    const getReachable = (startNode: string) => {
        if (selectedCutStations.has(startNode)) return new Set<string>();
        const visited = new Set<string>();
        const queue = [startNode];
        while (queue.length > 0) {
            const node = queue.shift()!;
            if (!visited.has(node)) {
                visited.add(node);
                (graph[node] || []).forEach(neighbor => {
                    if (!visited.has(neighbor)) queue.push(neighbor);
                });
            }
        }
        return visited;
    };
    return { BCN: getReachable('PC'), S1: getReachable('NA'), S2: getReachable('PN'), L6: getReachable('RE'), L7: getReachable('TB') };
};

/**
 * Translates a geographic location within a segment to map coordinates (x, y).
 */
export const getMapPositionForPk = (segment: string, percentage: number): { x: number, y: number } | null => {
    // Mapping PK segments to map station IDs
    // Standard segments in the map:
    // PC -> PR -> GR -> SG -> MN -> BN -> TT -> SR -> PF -> VL -> LP -> LF -> LF -> VD -> SC
    // GR -> PM -> PD -> EP -> TB
    // SR -> RE
    // SC -> MS -> HG -> RB -> FN -> TR -> VP -> EN -> NA
    // SC -> VO -> SJ -> BT -> UN -> SQ -> CF -> PJ -> CT -> NO -> PN

    // For simplicity, we define the main anchors of the segments
    const segmentAnchors: Record<string, { start: string, end: string }> = {
        'PC/RE': { start: 'PC', end: 'RE' },
        'GR/TB': { start: 'GR', end: 'TB' },
        'SR/LP': { start: 'SR', end: 'LP' },
        'LP/TR': { start: 'LP', end: 'TR' },
        'LP/NA': { start: 'LP', end: 'NA' },
        'SC/PN': { start: 'SC', end: 'PN' },
        'BT/UN': { start: 'BT', end: 'UN' }
    };

    const anchor = segmentAnchors[segment];
    if (!anchor) return null;

    const path = getFullPath(anchor.start, anchor.end);
    if (path.length < 2) return null;

    // Find the segment between two stations in the path that contains the percentage
    // This is an approximation since map stations are evenly spaced
    const segmentCount = path.length - 1;
    const exactIndex = percentage * segmentCount;
    const startIndex = Math.floor(exactIndex);
    const endIndex = Math.min(startIndex + 1, path.length - 1);

    const startStation = MAP_STATIONS.find(s => s.id === path[startIndex]);
    const endStation = MAP_STATIONS.find(s => s.id === path[endIndex]);

    if (!startStation || !endStation) return null;

    const segmentPct = exactIndex - startIndex;

    return {
        x: startStation.x + (endStation.x - startStation.x) * segmentPct,
        y: startStation.y + (endStation.y - startStation.y) * segmentPct
    };
};


// ─────────────────────────────────────────────────────────────────────────────
// Track-network helpers: keep trains and their trails ON the drawn rail lines
// ─────────────────────────────────────────────────────────────────────────────

type MapPt = { x: number; y: number };

const MAP_STATION_BY_ID = new Map(MAP_STATIONS.map(s => [s.id, s]));

interface NetworkSnap {
    seg: { from: string; to: string };
    t: number;
    dist: number;
}

/** Projects a map point onto the closest drawn segment of the track network. */
const snapPointToNetwork = (p: MapPt): NetworkSnap | null => {
    let best: NetworkSnap | null = null;
    for (const seg of MAP_SEGMENTS) {
        const a = MAP_STATION_BY_ID.get(seg.from);
        const b = MAP_STATION_BY_ID.get(seg.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const dist = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
        if (!best || dist < best.dist) best = { seg, t, dist };
    }
    return best;
};

/**
 * Returns the intermediate waypoints (station nodes) that a train must cross to get
 * from `from` to `to` following the drawn tracks, instead of cutting through empty
 * space in a straight diagonal. The returned list excludes `from` and `to` themselves.
 */
export const routeAlongTracks = (from: MapPt, to: MapPt): MapPt[] => {
    const sa = snapPointToNetwork(from);
    const sb = snapPointToNetwork(to);
    if (!sa || !sb) return [];
    // Same drawn segment (or both nearly together): a straight line IS the track.
    if (sa.seg === sb.seg) return [];

    let bestPath: string[] | null = null;
    let bestLen = Infinity;
    for (const endA of [sa.seg.from, sa.seg.to]) {
        for (const endB of [sb.seg.from, sb.seg.to]) {
            const ids = getFullPath(endA, endB);
            if (ids.length === 1 && endA !== endB) continue; // unreachable
            const nodes = ids.map(id => MAP_STATION_BY_ID.get(id)).filter(Boolean) as MapPt[];
            if (nodes.length === 0) continue;
            let len = Math.hypot(from.x - nodes[0].x, from.y - nodes[0].y)
                + Math.hypot(to.x - nodes[nodes.length - 1].x, to.y - nodes[nodes.length - 1].y);
            for (let i = 0; i < nodes.length - 1; i++) {
                len += Math.hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].y - nodes[i].y);
            }
            if (len < bestLen) { bestLen = len; bestPath = ids; }
        }
    }
    if (!bestPath) return [];
    const pts: MapPt[] = [];
    for (const id of bestPath) {
        const st = MAP_STATION_BY_ID.get(id);
        if (!st) continue;
        const prev = pts[pts.length - 1] ?? from;
        if (Math.hypot(st.x - prev.x, st.y - prev.y) < 0.5) continue;
        pts.push({ x: st.x, y: st.y });
    }
    // Drop a trailing waypoint that coincides with the destination
    const lastPt = pts[pts.length - 1];
    if (lastPt && Math.hypot(lastPt.x - to.x, lastPt.y - to.y) < 0.5) pts.pop();
    return pts;
};

/**
 * Places a GPS position on the drawn map network.
 * Candidate edges are the map segments whose both stations have GPS coordinates; the edge
 * touching `preferredStationId` (the train's next stop) wins unless clearly worse.
 * Returns null if the GPS point is far from any known edge.
 */
export const projectGpsOntoMap = (
    lat: number,
    lon: number,
    preferredStationId?: string | null
): { x: number; y: number; fromId: string; toId: string; t: number } | null => {
    const lat0 = lat * Math.PI / 180;
    const kx = 111.32 * Math.cos(lat0);
    const ky = 110.57;
    const px = lon * kx;
    const py = lat * ky;

    let best: { dist: number; fromId: string; toId: string; t: number } | null = null;
    let bestPref: typeof best = null;

    for (const seg of MAP_SEGMENTS) {
        const ga = STATION_GEO_MAP.get(seg.from);
        const gb = STATION_GEO_MAP.get(seg.to);
        if (!ga || !gb) continue;
        const ax = ga.lon * kx, ay = ga.lat * ky;
        const bx = gb.lon * kx, by = gb.lat * ky;
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        let t = len2 > 1e-9 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const dist = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); // km
        const cand = { dist, fromId: seg.from, toId: seg.to, t };
        if (!best || dist < best.dist) best = cand;
        if (preferredStationId && (seg.from === preferredStationId || seg.to === preferredStationId)) {
            if (!bestPref || dist < bestPref.dist) bestPref = cand;
        }
    }
    if (!best) return null;
    // Long curvy edges deviate from the straight line; give the next-stop edge a 0.5 km tolerance.
    const chosen = bestPref && bestPref.dist <= best.dist + 0.5 ? bestPref : best;
    if (chosen.dist > 2) return null;

    const a = MAP_STATION_BY_ID.get(chosen.fromId);
    const b = MAP_STATION_BY_ID.get(chosen.toId);
    if (!a || !b) return null;
    return {
        x: a.x + chosen.t * (b.x - a.x),
        y: a.y + chosen.t * (b.y - a.y),
        fromId: chosen.fromId,
        toId: chosen.toId,
        t: chosen.t
    };
};

/** Point at `frac` (0..1) of the way from `from` to `to`, walking along the drawn tracks. */
export const pointAlongTracks = (from: MapPt, to: MapPt, frac: number): MapPt => {
    const poly = [from, ...routeAlongTracks(from, to), to];
    const lens: number[] = [];
    let total = 0;
    for (let i = 0; i < poly.length - 1; i++) {
        const l = Math.hypot(poly[i + 1].x - poly[i].x, poly[i + 1].y - poly[i].y);
        lens.push(l);
        total += l;
    }
    if (total === 0) return { x: from.x, y: from.y };
    let remaining = Math.max(0, Math.min(1, frac)) * total;
    for (let i = 0; i < lens.length; i++) {
        if (remaining <= lens[i] || i === lens.length - 1) {
            const k = lens[i] > 0 ? remaining / lens[i] : 0;
            return {
                x: poly[i].x + k * (poly[i + 1].x - poly[i].x),
                y: poly[i].y + k * (poly[i + 1].y - poly[i].y)
            };
        }
        remaining -= lens[i];
    }
    return { x: to.x, y: to.y };
};
