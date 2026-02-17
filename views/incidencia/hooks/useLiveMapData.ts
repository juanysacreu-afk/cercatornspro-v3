import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../supabaseClient';
import {
    getFgcMinutes, formatFgcTime, isServiceVisible, resolveStationId,
    getLiniaColorHex, getShortTornId
} from '../../../utils/stations';
import { MAP_STATIONS } from '../mapConstants';
import { getFullPath } from '../mapUtils';
import type { LivePersonnel, IncidenciaMode } from '../../../types';

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
    const [geoTrenData, setGeoTrenData] = useState<any[]>([]);
    const [displayMin, setDisplayMin] = useState<number>(0);
    const [allShifts, setAllShifts] = useState<any[]>([]); // Cache shifts

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

    // GeoTren Data
    const fetchGeoTrenData = async () => {
        try {
            const resp = await fetch('https://dadesobertes.fgc.cat/api/v2/catalog/datasets/posicionament-dels-trens/exports/json');
            if (!resp.ok) return;
            const data = await resp.json();
            setGeoTrenData(data);
        } catch (err) {
            console.error('GeoTren fetch error:', err);
        }
    };

    useEffect(() => {
        if (isGeoTrenEnabled && !isPaused) {
            fetchGeoTrenData();
            const interval = setInterval(fetchGeoTrenData, 5000); // More frequent GPS updates
            return () => clearInterval(interval);
        }
    }, [isGeoTrenEnabled, isPaused]);

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
                setLoading(false);
                return;
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

                    // Fallback for object circulations
                    if (!circ && typeof cRef === 'object' && cRef.sortida && cRef.arribada) {
                        circ = {
                            id: codi,
                            linia: codi.startsWith('F') ? 'F' : (cRef.linia || 'S/L'),
                            inici: cRef.inici || '?',
                            final: cRef.final || '?',
                            sortida: cRef.sortida,
                            arribada: cRef.arribada,
                            estacions: []
                        };
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

    return {
        liveData, loading, geoTrenData, displayMin, allShifts, setAllShifts
    };
};
