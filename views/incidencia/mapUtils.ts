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
