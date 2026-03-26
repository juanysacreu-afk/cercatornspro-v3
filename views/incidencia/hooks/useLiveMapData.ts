import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../supabaseClient';
import {
    getFgcMinutes, formatFgcTime, isServiceVisible, resolveStationId,
    getLiniaColorHex, getShortTornId
} from '../../../utils/stations';
import {
    STATION_GEO_MAP, interpolateBetweenStations, estimateEta, estimateEtaByPk, haversineKm
} from '../../../utils/stationGeoData';
import { MAP_STATIONS } from '../mapConstants';
import { getFullPath } from '../mapUtils';
import { decodeGeotrenUt } from '../utils/decodeUt';
import type { LivePersonnel, IncidenciaMode, GeoTrenPoint, Shift } from '../../../types';



// ── GeoTren Enhanced Types ──────────────────────────────────────────────
export interface GeoTrenEnhanced extends GeoTrenPoint {
    /** SVG map x coordinate (interpolated between stations) */
    mapX: number;
    /** SVG map y coordinate (interpolated between stations) */
    mapY: number;
    /** True when moving between stations (not parked) */
    isMoving: boolean;
    /** Resolved next station ID on FGC map */
    nextStMapId: string | null;
    /** Minutes of delay vs. theoretical schedule (positive = late) */
    delayMin: number;
    /** ETA to next stop in minutes (from current real time) */
    etaNextMin: number | null;
    /** Array of past SVG positions for breadcrumb trail */
    trail: Array<{ x: number; y: number; ts: number }>;
}

const GEOTREN_API = 'https://dadesobertes.fgc.cat/api/v2/catalog/datasets/posicionament-dels-trens/exports/json';
const GEOTREN_POLL_INTERVAL = 30000; // 30s as per audit spec
const TRAIL_MAX = 8;               // max breadcrumb points per vehicle

interface UseLiveMapDataProps {
    isRealTime: boolean;
    isPaused: boolean;
    customTime: string;
    selectedServei: string;
    mode: IncidenciaMode;
    manualOverrides: Record<string, string>;
    isGeoTrenEnabled: boolean;
}

export const useLiveMapData = ({
    isRealTime, isPaused, customTime, selectedServei, mode, manualOverrides, isGeoTrenEnabled
}: UseLiveMapDataProps) => {
    const [loading, setLoading] = useState(false);
    const [liveData, setLiveData] = useState<LivePersonnel[]>([]);
    const [displayMin, setDisplayMin] = useState<number>(0);
    const [allShifts, setAllShifts] = useState<Shift[]>([]); // Cache shifts

    // Time management
    useEffect(() => {
        if (isRealTime && !isPaused) {
            const updateTime = () => {
                const now = new Date();
                const h = now.getHours();
                const m = now.getMinutes();
                const s = now.getSeconds();

                // Calculate display minutes with precision (decimal)
                let totalMin = (h < 4 ? h + 24 : h) * 60 + m + (s / 60);
                setDisplayMin(totalMin);
            };
            updateTime();
            const interval = setInterval(updateTime, 1000); // 1-second ticks for smooth transition
            return () => clearInterval(interval);
        }
    }, [isRealTime, isPaused]);

    useEffect(() => {
        if (customTime) {
            const m = getFgcMinutes(customTime);
            if (m !== null) setDisplayMin(m);
        } else if (isRealTime && !isPaused) {
            const now = new Date();
            const h = now.getHours();
            const m = now.getMinutes();
            const s = now.getSeconds();
            let totalMin = (h < 4 ? h + 24 : h) * 60 + m + (s / 60);
            setDisplayMin(totalMin);
        }
    }, [customTime, isRealTime, isPaused, mode]);

    // GeoTren Enhanced Data
    const geoTrenEnhancedRef = useRef<Map<string, GeoTrenEnhanced>>(new Map());
    const [geoTrenData, setGeoTrenData] = useState<GeoTrenEnhanced[]>([]);

    /** Build enhanced GeoTren entry with real GPS interpolation + breadcrumb trail */
    const buildEnhanced = useCallback((raw: GeoTrenPoint): GeoTrenEnhanced => {
        const mainLinia = raw.lin;
        let mapX = 0, mapY = 0;
        let isMoving = false;
        let nextStMapId: string | null = null;

        // GPS coords from SIRTRAN (may be undefined in old API responses)
        const trainLat: number | undefined = (raw as any).geo_point_2d?.lat;
        const trainLon: number | undefined = (raw as any).geo_point_2d?.lon;

        // Resolve current station
        const curStId = raw.estacionat_a ? resolveStationId(raw.estacionat_a, mainLinia) : null;

        // Parse next stops
        let nextStops: Array<{ parada: string; hora_prevista?: string }> = [];
        if (raw.properes_parades && typeof raw.properes_parades === 'string') {
            try {
                nextStops = raw.properes_parades.split(';').map((p: string) => JSON.parse(p));
            } catch (_) { }
        } else if (Array.isArray(raw.properes_parades)) {
            nextStops = raw.properes_parades;
        }

        if (nextStops.length > 0) {
            nextStMapId = resolveStationId(nextStops[0].parada, mainLinia);
        }

        // ── SVG position computation ──────────────────────────────────────
        // Strategy:
        //  1. If train has GPS coords + we know fromStation + toStation:
        //       → interpolate using real GPS distance (most accurate)
        //  2. Else if parked at a station: place exactly on that station
        //  3. Else interpolate 50% between prev and next (fallback)

        // Resolve "from" station:
        //   Priority: estacionat_a → last known parada_passada → origen of journey
        let resolvedFromId: string | null = curStId;
        if (!resolvedFromId && (raw as any).origen) {
            resolvedFromId = resolveStationId((raw as any).origen, mainLinia);
        }

        const fromStMapNode = resolvedFromId ? MAP_STATIONS.find(s => s.id === resolvedFromId) : null;
        const toStMapNode = nextStMapId ? MAP_STATIONS.find(s => s.id === nextStMapId) : null;
        const fromGeo = resolvedFromId ? STATION_GEO_MAP.get(resolvedFromId) : null;
        const toGeo = nextStMapId ? STATION_GEO_MAP.get(nextStMapId) : null;

        if (trainLat && trainLon && fromGeo && toGeo && fromStMapNode && toStMapNode && !raw.estacionat_a) {
            // GPS-based interpolation — most accurate
            const t = interpolateBetweenStations(trainLat, trainLon, fromGeo, toGeo);
            mapX = fromStMapNode.x + t * (toStMapNode.x - fromStMapNode.x);
            mapY = fromStMapNode.y + t * (toStMapNode.y - fromStMapNode.y);
            isMoving = true;
        } else if (raw.estacionat_a && fromStMapNode) {
            // Stopped at a station
            mapX = fromStMapNode.x;
            mapY = fromStMapNode.y;
        } else if (!raw.estacionat_a && fromStMapNode && toStMapNode) {
            // Moving but no GPS — fallback to 50% interpolation
            mapX = (fromStMapNode.x + toStMapNode.x) / 2;
            mapY = (fromStMapNode.y + toStMapNode.y) / 2;
            isMoving = true;
        } else if (toStMapNode) {
            mapX = toStMapNode.x; mapY = toStMapNode.y;
        } else if ((raw as any).origen) {
            const sO = MAP_STATIONS.find(s => s.id === resolveStationId((raw as any).origen, mainLinia));
            if (sO) { mapX = sO.x; mapY = sO.y; }
        }

        // ── ETA and delay computation ─────────────────────────────────────
        let delayMin = 0;
        let etaNextMin: number | null = null;

        if (typeof raw.retard === 'number') {
            delayMin = Math.round(raw.retard / 60); // API returns seconds
        }

        if (nextStMapId && toGeo) {
            if (trainLat && trainLon) {
                // GPS available: remaining distance from train position to next stop
                const remainingKm = haversineKm(trainLat, trainLon, toGeo.lat, toGeo.lon);
                if (fromGeo && fromGeo.pkSegment === toGeo.pkSegment) {
                    // Same PK segment: use PK-weighted speed for more accurate ETA
                    const isAscending = fromGeo.pk < toGeo.pk;
                    try {
                        etaNextMin = estimateEtaByPk(
                            fromGeo, toGeo,
                            trainLat, trainLon,
                            isAscending,
                            false,
                            delayMin
                        );
                    } catch (_) {
                        etaNextMin = estimateEta(remainingKm, 60, delayMin);
                    }
                } else {
                    // Cross-segment or fromGeo unavailable: simple distance/speed
                    etaNextMin = estimateEta(remainingKm, 60, delayMin);
                }
            } else if (nextStops.length > 0 && nextStops[0].hora_prevista) {
                // No GPS: fall back to scheduled arrival time
                const etaFromSchedule = getFgcMinutes(nextStops[0].hora_prevista);
                if (etaFromSchedule !== null) {
                    const now = new Date();
                    const h = now.getHours();
                    const m = now.getMinutes();
                    const nowMin = (h < 4 ? h + 24 : h) * 60 + m;
                    etaNextMin = Math.max(0, etaFromSchedule + delayMin - nowMin);
                }
            }
        }

        // ── Breadcrumb trail ─────────────────────────────────────────────
        const prev = geoTrenEnhancedRef.current.get(raw.id);
        const trail: Array<{ x: number; y: number; ts: number }> = prev?.trail ? [...prev.trail] : [];
        if (mapX !== 0 || mapY !== 0) {
            const last = trail[trail.length - 1];
            if (!last || Math.abs(last.x - mapX) > 0.5 || Math.abs(last.y - mapY) > 0.5) {
                trail.push({ x: mapX, y: mapY, ts: Date.now() });
                if (trail.length > TRAIL_MAX) trail.shift();
            }
        }

        const enhanced: GeoTrenEnhanced = {
            ...raw,
            mapX, mapY, isMoving, nextStMapId, delayMin, etaNextMin, trail
        };
        geoTrenEnhancedRef.current.set(raw.id, enhanced);
        return enhanced;
    }, []);


    const fetchGeoTrenData = useCallback(async () => {
        try {
            const resp = await fetch(GEOTREN_API);
            if (!resp.ok) return;
            const data: GeoTrenPoint[] = await resp.json();
            // Only include Barcelona-Vallès lines (our map only has BV stations)
            const BV_LINES = new Set(['S1', 'S2', 'L6', 'L66', 'L7', 'L12', 'MS1', 'MS2', 'ML6', 'ML7', 'ES2']);
            const bvData = data.filter(gt => BV_LINES.has(gt.lin?.toUpperCase?.() || ''));
            const enhanced = bvData.map(buildEnhanced).filter(gt => gt.mapX !== 0 || gt.mapY !== 0);

            // Deduplicate by decoded unit number
            // Physics: the same physical unit cannot be in two places at once.
            // If the API returns duplicates (stale records), we keep the most likely "live" one.
            const uniqueTrains = new Map<string, GeoTrenEnhanced>();
            enhanced.forEach(gt => {
                const label = decodeGeotrenUt(gt.ut, gt.tipus_unitat);
                // If it's a full unit (e.g. "113.04"), use it as the key for deduplication
                const key = (label && label.includes('.')) ? label : gt.id;

                const existing = uniqueTrains.get(key);
                if (!existing) {
                    uniqueTrains.set(key, gt);
                } else {
                    // Resolution: Prefer moving trains over stationary/stopped ones
                    const existingActive = !existing.estacionat_a || existing.isMoving;
                    const currentActive = !gt.estacionat_a || gt.isMoving;

                    if (currentActive && !existingActive) {
                        uniqueTrains.set(key, gt);
                    }
                    // If both same state, first one wins to avoid jitter
                }
            });

            setGeoTrenData(Array.from(uniqueTrains.values()));
        } catch (err) {
            console.error('[GeoTren] fetch error:', err);
        }
    }, [buildEnhanced]);


    useEffect(() => {
        if (isGeoTrenEnabled && !isPaused) {
            fetchGeoTrenData();
            const interval = setInterval(fetchGeoTrenData, GEOTREN_POLL_INTERVAL);
            return () => clearInterval(interval);
        }
    }, [isGeoTrenEnabled, isPaused, fetchGeoTrenData]);

    // Live Map Data Fetching
    const fetchLiveMapData = async () => {
        if (mode !== 'LINIA') return; // Only fetch in LINIA mode
        setLoading(true);
        try {
            // 1. Fetch shifts if needed
            let shiftsData = allShifts;
            if (!shiftsData || shiftsData.length === 0) {
                const { data } = await supabase.from('shifts').select('*');
                if (data) {
                    shiftsData = data;
                    setAllShifts(data);
                }
            }
            if (!shiftsData) return;

            const visibleShifts = shiftsData.filter(s => isServiceVisible(s.servei, selectedServei));
            const activeShifts = visibleShifts.filter(s => {
                const sMin = getFgcMinutes(s.inici_torn);
                const eMin = getFgcMinutes(s.final_torn);
                return sMin !== null && eMin !== null && displayMin >= sMin && displayMin <= eMin;
            });

            if (activeShifts.length === 0) {
                setLiveData([]);
                setLoading(false);
                return;
            }

            // 2. Identify required circulations
            const requiredCircIds = new Set<string>();
            activeShifts.forEach(s => {
                (s.circulations as any[]).forEach(c => {
                    const codi = typeof c === 'string' ? c : c?.codi;
                    if (codi && codi !== 'VIATGER') requiredCircIds.add(codi.toUpperCase());
                });
            });

            const { data: allDaily } = await supabase.from('daily_assignments').select('*');
            const { data: allPhones } = await supabase.from('phonebook').select('nomina, phones');

            const stationCoords = MAP_STATIONS.reduce((acc, st) => {
                acc[st.id.toUpperCase()] = { x: st.x, y: st.y };
                return acc;
            }, {} as Record<string, { x: number, y: number }>);

            const VALID_STATION_IDS = new Set(MAP_STATIONS.map(s => s.id));
            const currentPersonnel: LivePersonnel[] = [];
            const processedKeys = new Set<string>();

            let circDetailsData: any[] = [];
            if (requiredCircIds.size > 0) {
                const { data } = await supabase.from('circulations').select('*').in('id', Array.from(requiredCircIds));
                if (data) circDetailsData = data;
            }

            if (circDetailsData.length === 0) {
                // Don't bail out - shifts may have inline circulation data (objects with sortida/arribada)
                console.warn(`[GeoTren/LiveMap] 0 circulation records found in DB for IDs: ${Array.from(requiredCircIds).join(', ')}. Will try inline circulation data.`);
            }

            const circDetailsMap = new Map<string, any>(circDetailsData.map((c: any) => [c.id.trim().toUpperCase(), c]));

            // Process active shifts for Trains
            // Process active shifts for Trains
            activeShifts.forEach(shift => {
                const shiftService = (shift.servei || '').toString();
                const validCircs: any[] = [];

                // 1. Gather all valid circulations for this shift
                (shift.circulations as any[]).forEach((cRef: any) => {
                    const rawCodi = (typeof cRef === 'string' ? cRef : cRef?.codi);
                    const codi = rawCodi?.trim().toUpperCase() || '';

                    if (!codi || codi === 'VIATGER') return;
                    // Note: We don't check processedKeys here yet because we need to see the full sequence for this shift
                    // However, if we want to avoid double counting, we should check it before adding to currentPersonnel later.

                    let circ = circDetailsMap.get(codi);

                    // Fallback for object circulations - handle many possible field naming conventions
                    if (!circ && typeof cRef === 'object') {
                        // Try to find departure/arrival time fields with various naming conventions
                        const sortida = cRef.sortida || cRef.hora_inici || cRef.inici_circ;
                        const arribada = cRef.arribada || cRef.hora_final || cRef.final_circ;
                        const estacionsRaw = cRef.estacions || cRef.stops || [];

                        // Use estacions if they have timing info
                        const hasEstacions = Array.isArray(estacionsRaw) && estacionsRaw.length > 0 &&
                            (estacionsRaw[0]?.hora || estacionsRaw[0]?.sortida || estacionsRaw[0]?.arribada);

                        if (sortida || arribada || hasEstacions) {
                            circ = {
                                id: codi,
                                linia: cRef.linia || (codi.startsWith('F') ? 'F' : 'S/L'),
                                inici: cRef.inici || cRef.origen || (estacionsRaw[0]?.nom) || '?',
                                final: cRef.final || cRef.desti || (estacionsRaw[estacionsRaw.length - 1]?.nom) || '?',
                                sortida: sortida || (estacionsRaw[0]?.hora || estacionsRaw[0]?.sortida),
                                arribada: arribada || (estacionsRaw[estacionsRaw.length - 1]?.hora || estacionsRaw[estacionsRaw.length - 1]?.arribada),
                                via_inici: cRef.via_inici,
                                via_final: cRef.via_final,
                                estacions: estacionsRaw
                            };
                        }
                    }

                    if (circ) {
                        let startMin = getFgcMinutes(circ.sortida);
                        let endMin = getFgcMinutes(circ.arribada);
                        const estacions = (circ.estacions as any[]) || [];

                        if (startMin === null && estacions.length > 0) startMin = getFgcMinutes(estacions[0].hora || estacions[0].arribada || estacions[0].sortida);
                        if (endMin === null && estacions.length > 0) endMin = getFgcMinutes(estacions[estacions.length - 1].hora || estacions[estacions.length - 1].arribada || estacions[estacions.length - 1].sortida);

                        if (startMin !== null && endMin !== null) {
                            validCircs.push({ ...circ, startMin, endMin, estacions });
                        }
                    }
                });

                // 2. Sort by start time
                validCircs.sort((a, b) => a.startMin - b.startMin);

                // 3. Find active or waiting circulation
                for (let i = 0; i < validCircs.length; i++) {
                    const currentCirc = validCircs[i];
                    const nextCirc = validCircs[i + 1];

                    // Visibility extends until the start of the next circulation, BUT capped to avoid "ghost trains" (e.g. F085 -> F104 with 1h gap)
                    // If gap is huge, likely another driver/shift took over the unit.
                    const MAX_WAIT = 30; // minutes

                    let effectiveEnd;
                    const endID = resolveStationId(currentCirc.final || (currentCirc.estacions?.[currentCirc.estacions?.length - 1]?.nom), currentCirc.linia);

                    if (nextCirc) {
                        const gap = nextCirc.startMin - currentCirc.endMin;
                        if (gap <= MAX_WAIT) effectiveEnd = nextCirc.startMin; // Bridge short gaps (turn-around)
                        else effectiveEnd = currentCirc.endMin + MAX_WAIT; // Cap long gaps (don't show "waiting" for hours)
                    } else {
                        // End of Shift. Normally ends immediately.
                        effectiveEnd = currentCirc.endMin;

                        // EXCEPTION: Implicit Depot Retirement at Terminus (PN, NA, RE).
                        // We want to show the train moving to the depot for a short while even after shift end.
                        if (['PN', 'NA', 'RE'].includes(endID)) {
                            effectiveEnd = currentCirc.endMin + MAX_WAIT;
                        }
                    }

                    if (displayMin >= currentCirc.startMin && displayMin < effectiveEnd) {
                        if (processedKeys.has(currentCirc.id)) continue; // Already processed by another shift?

                        // Handle implicit depot move cases (where nextCirc is missing or far future)
                        // If we are past endMin, we are "waiting" (or moving to depot).
                        const isWaiting = displayMin > currentCirc.endMin;

                        const stopsWithTimesRaw = (currentCirc.estacions || [])
                            .map((st: any) => ({
                                nom: resolveStationId(st.nom || st.id, currentCirc.linia),
                                min: getFgcMinutes(st.hora || st.arribada || st.sortida)
                            }))
                            .filter((s: any) => s.min !== null && s.nom !== null && VALID_STATION_IDS.has(s.nom));

                        const startID = resolveStationId(currentCirc.inici || (currentCirc.estacions?.[0]?.nom), currentCirc.linia);
                        const endID = resolveStationId(currentCirc.final || (currentCirc.estacions?.[currentCirc.estacions?.length - 1]?.nom), currentCirc.linia);

                        const stopsWithTimes = [
                            { nom: startID, min: currentCirc.startMin },
                            ...stopsWithTimesRaw,
                            { nom: endID, min: currentCirc.endMin }
                        ]
                            .filter(s => VALID_STATION_IDS.has(s.nom))
                            .sort((a: any, b: any) => a.min - b.min);

                        let x = 0, y = 0, currentStationId = stopsWithTimes[0]?.nom;
                        let nextStationId: string | undefined = undefined;
                        let isMoving = false;

                        if (isWaiting) {
                            // Stationary at destination
                            currentStationId = endID;

                            // EXCEPTION: Retirement to depot logic
                            // If next circulation is to a depot OR we are at a terminus and it's the end of the shift/line
                            let isRetiring = false;

                            // 1. Explicit next circulation to depot
                            if (nextCirc) {
                                const nextDest = resolveStationId(nextCirc.final || (nextCirc.estacions?.[nextCirc.estacions?.length - 1]?.nom), nextCirc.linia);
                                const DEPOT_IDS = new Set(['DNA', 'DPN', 'DRE', 'COR']);
                                if (DEPOT_IDS.has(nextDest)) isRetiring = true;
                            }

                            // 2. Implicit retirement at Termini (PN->DPN, NA->DNA, RE->DRE)
                            // If there is NO next circulation (end of shift) OR the next one starts at the depot (implying we moved there),
                            // and we are currently at a station that feeds a depot.
                            if (!nextCirc || (nextCirc && resolveStationId(nextCirc.inici, nextCirc.linia).startsWith('D'))) {
                                if (endID === 'PN') { currentStationId = 'DPN'; isRetiring = true; }
                                else if (endID === 'NA') { currentStationId = 'DNA'; isRetiring = true; }
                                else if (endID === 'RE') { currentStationId = 'DRE'; isRetiring = true; }
                            }

                            if (isRetiring && !['DNA', 'DPN', 'DRE'].includes(currentStationId)) {
                                // If we detected retiring but haven't set the ID yet (e.g. from case 1)
                                const nextDest = nextCirc ? resolveStationId(nextCirc.final || '', nextCirc.linia) : '';
                                const DEPOT_IDS = new Set(['DNA', 'DPN', 'DRE', 'COR']);
                                if (DEPOT_IDS.has(nextDest)) currentStationId = nextDest;
                            }

                            const p = stationCoords[currentStationId] || stationCoords['PC'];
                            x = p.x; y = p.y;
                            isMoving = false;
                        } else if (stopsWithTimes.length > 0) {
                            // Normal moving logic
                            if (stopsWithTimes.length === 1) {
                                const p = stationCoords[currentStationId] || stationCoords['PC'];
                                x = p.x; y = p.y;
                            } else {
                                // Expand with segment points
                                const expandedStops: { nom: string, min: number }[] = [];
                                for (let k = 0; k < stopsWithTimes.length - 1; k++) {
                                    const c = stopsWithTimes[k];
                                    const n = stopsWithTimes[k + 1];
                                    const path = getFullPath(c.nom, n.nom);
                                    if (path.length > 1) {
                                        for (let j = 0; j < path.length - 1; j++) {
                                            const ratio = j / (path.length - 1);
                                            expandedStops.push({ nom: path[j], min: c.min + (n.min - c.min) * ratio });
                                        }
                                    } else expandedStops.push(c);
                                }
                                expandedStops.push(stopsWithTimes[stopsWithTimes.length - 1]);

                                // Find current segment
                                for (let k = 0; k < expandedStops.length - 1; k++) {
                                    const s1 = expandedStops[k];
                                    const s2 = expandedStops[k + 1];
                                    if (displayMin >= s1.min && displayMin <= s2.min) {
                                        currentStationId = s1.nom;
                                        nextStationId = s2.nom;
                                        const p1 = stationCoords[s1.nom] || stationCoords['PC'];
                                        const p2 = stationCoords[s2.nom] || stationCoords['PC'];
                                        if (s1.min === s2.min) {
                                            x = p1.x; y = p1.y;
                                            isMoving = false;
                                        } else {
                                            const progress = (displayMin - s1.min) / (s2.min - s1.min);
                                            x = p1.x + (p2.x - p1.x) * progress;
                                            y = p1.y + (p2.y - p1.y) * progress;
                                            isMoving = progress > 0.01 && progress < 0.99;
                                            if (progress >= 0.99) {
                                                currentStationId = s2.nom;
                                                isMoving = false;
                                                nextStationId = undefined;
                                            }
                                        }
                                        break;
                                    }
                                }
                            }
                        } else {
                            continue;
                        }

                        const shortTorn = getShortTornId(shift.id);
                        const assignment = allDaily?.find(d => d.torn === shortTorn);
                        const driverPhones = allPhones?.find(p => p.nomina === assignment?.empleat_id)?.phones || [];
                        const codiToUse = currentCirc.id;

                        // Info Object Construction
                        const buildInfo = (sx: number, sy: number, sId: string) => ({
                            type: 'TRAIN' as const,
                            id: codiToUse,
                            linia: currentCirc.linia,
                            stationId: sId,
                            color: getLiniaColorHex((codiToUse.startsWith('F') ? 'F' : currentCirc.linia)),
                            driver: assignment ? `${(assignment as any).cognoms}, ${(assignment as any).nom}` : 'Sense assignar',
                            driverName: (assignment as any)?.nom,
                            driverSurname: (assignment as any)?.cognoms,
                            torn: shift?.id || '---',
                            shiftStart: shift.inici_torn,
                            shiftEnd: shift.final_torn,
                            shiftStartMin: getFgcMinutes(shift.inici_torn) || 0,
                            shiftEndMin: getFgcMinutes(shift.final_torn) || 0,
                            shiftDep: resolveStationId(shift.dependencia || '', shiftService),
                            servei: shiftService,
                            phones: driverPhones,
                            inici: currentCirc.inici,
                            final: currentCirc.final,
                            via_inici: currentCirc.via_inici,
                            via_final: currentCirc.via_final,
                            horaPas: formatFgcTime(displayMin),
                            x: sx, y: sy,
                            nextStationId, isMoving,
                            startTimeMin: currentCirc.startMin,
                            endTimeMin: currentCirc.endMin,
                            progress: (currentCirc.startMin !== null && currentCirc.endMin !== null)
                                ? Math.max(0, Math.min(100, ((displayMin - currentCirc.startMin) / (currentCirc.endMin - currentCirc.startMin)) * 100))
                                : 0
                        });

                        if (manualOverrides[codiToUse]) {
                            const overrideStation = manualOverrides[codiToUse];
                            const overrideCoords = stationCoords[overrideStation] || { x: 0, y: 0 };
                            currentPersonnel.push(buildInfo(overrideCoords.x, overrideCoords.y, overrideStation));
                        } else {
                            currentPersonnel.push(buildInfo(x, y, currentStationId));
                        }
                        processedKeys.add(codiToUse);

                        // We found the active state for this shift, break to stop checking other circs
                        break;
                    }
                }
            });

            // Process Resting Personnel
            visibleShifts.forEach(shift => {
                const shiftService = (shift.servei || '').toString();
                const startMin = getFgcMinutes(shift.inici_torn);
                const endMin = getFgcMinutes(shift.final_torn);

                if (startMin !== null && endMin !== null && displayMin >= startMin && displayMin < endMin) {
                    const isWorking = currentPersonnel.some(p => p.torn === shift.id);
                    if (!isWorking) {
                        const shortTorn = getShortTornId(shift.id);
                        const assignment = allDaily?.find(d => d.torn === shortTorn);
                        const rawLoc = (shift.dependencia || '').trim().toUpperCase();
                        const loc = resolveStationId(rawLoc, shiftService);

                        if (loc && stationCoords[loc] && assignment) {
                            const driverPhones = allPhones?.find(p => p.nomina === (assignment as any).empleat_id)?.phones || [];
                            const coords = stationCoords[loc] || { x: 0, y: 0 };
                            currentPersonnel.push({
                                type: 'REST', id: 'DESCANS', linia: 'S/L', stationId: loc, color: '#4D5358',
                                driver: `${(assignment as any).cognoms}, ${(assignment as any).nom}`,
                                driverName: (assignment as any).nom,
                                driverSurname: (assignment as any).cognoms,
                                torn: shift.id,
                                shiftStart: shift.inici_torn,
                                shiftEnd: shift.final_torn,
                                shiftStartMin: getFgcMinutes(shift.inici_torn) || 0,
                                shiftEndMin: getFgcMinutes(shift.final_torn) || 0,
                                shiftDep: resolveStationId(shift.dependencia || '', shiftService),
                                servei: shiftService,
                                phones: driverPhones,
                                inici: loc, final: loc, horaPas: formatFgcTime(displayMin),
                                x: coords.x, y: coords.y
                            });
                        }
                    }
                }
            });

            // Resolve overlaps
            const collisionMap: Record<string, number> = {};
            const offsetData = currentPersonnel.map(p => {
                const key = `${Math.round(p.x)},${Math.round(p.y)}`;
                const count = collisionMap[key] || 0;
                collisionMap[key] = count + 1;
                return { ...p, visualOffset: count };
            });
            setLiveData(offsetData);

        } catch (e) {
            console.error("Error live map:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (mode === 'LINIA') fetchLiveMapData();
    }, [mode, Math.floor(displayMin), selectedServei, manualOverrides]); // Only refetch data when MINUTE changes

    useEffect(() => {
        const channel = supabase.channel('incidencia_map_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, () => {
                if (mode === 'LINIA') fetchLiveMapData();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_assignments' }, () => {
                if (mode === 'LINIA') fetchLiveMapData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [mode, selectedServei]);

    return {
        liveData, loading, geoTrenData, displayMin, allShifts, setAllShifts
    };
};
