import { MAP_SEGMENTS, MAP_STATIONS } from './mapConstants';

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

