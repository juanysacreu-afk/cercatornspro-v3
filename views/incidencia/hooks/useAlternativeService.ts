import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import {
    resolveStationId, isServiceVisible, mainLiniaForFilter,
    LINIA_STATIONS, getFgcMinutes, formatFgcTime
} from '../../../utils/stations';
import { getFullPath } from '../mapUtils';
import type { LivePersonnel, ParkedUnit } from '../../../types';

interface UseAlternativeServiceProps {
    islandId: string;
    islandStations: Set<string>;
    physicalTrains: LivePersonnel[];
    allDrivers: LivePersonnel[];
    selectedServei: string;
    allShifts: any[];
    displayMin: number;
    parkedUnits: ParkedUnit[];
    selectedCutSegments: Set<string>;
    showToast: (msg: string, type?: string) => void;
    canSupportS1: boolean;
    canSupportS2: boolean;
    canSupportL6: boolean;
    canSupportL7Full: boolean;
    canSupportL7Local: boolean;
    canSupportL12: boolean;
}

// ── NORMATIVA LABORAL BV — Línia Barcelona-Vallès ──────────────────────────────
const TURNAROUND_TERM = 6; // minutes at each terminus for cab maneuver
const N_LABORAL = {
    CAB_CHANGE: 3,          // Canvi de cabina (totes les estacions)
    HANDOVER: 7,            // Relevo (Rubí, Sarrià)
    MAX_DRIVE: 120,         // Màx. conducció continuada sense pausa (2h)
    MIN_BREAK: 10,          // Descans mínim obligatori després de MAX_DRIVE
    MAIN_BREAK: 35,         // Descans principal ("àpat") per torn sencer
    MAIN_BREAK_PARTIAL: 15, // Descans principal per torn parcial (6h)
    MIN_TOTAL_REST: 90,     // Suma mínima descansos torn sencer
    MIN_TOTAL_REST_PARTIAL_6: 45, // Suma mínima desc. torn parcial 6h
    NON_COMPUTE_THRESHOLD: 15, // Períodes < 15 min no computen com a descans
    DEADHEAD_REST_FACTOR: 0.5, // Viatje en via morta ≥15 min: 50% descans
    PASSENGER_REST_FACTOR: 0.66, // Com a viatger ≥15 min: 66% descans
    SETUP: {
        'PC': { withStartup: 7, withoutStartup: 7 }, // General
        'NA': { withStartup: 23, withoutStartup: 18 }, // Cocheras Terrassa N.U.
        'PN': { withStartup: 19, withoutStartup: 14 }, // Cocheras Sabadell P.N.
        'RB': { withStartup: 7, withoutStartup: 7 }, // Rubí estació
        'COR': { withStartup: 23, withoutStartup: 18 }, // Rubí COR
        'RE': { withStartup: 30, withoutStartup: 30 }, // Reina Elisenda
        'SR': { withStartup: 7, withoutStartup: 7 }, // Sarrià
        'SC': { withStartup: 7, withoutStartup: 7 }, // Sant Cugat
        'GR': { withStartup: 7, withoutStartup: 7 }, // Gràcia
        'TB': { withStartup: 7, withoutStartup: 7 }, // Terrassa
    } as Record<string, { withStartup: number; withoutStartup: number }>,
    TRAIN_CHANGE: {
        'DEFAULT': 6,
        'COR': 30,  // Rubí COR
        'RE': 10,  // Reina Elisenda
        'GR': 3,   // Gràcia (a partir de les 00:00h)
    } as Record<string, number>,
    WALK: {
        'RB-COR': 12, 'COR-RB': 12,
        'NA-TNU': 11, 'TNU-NA': 11,
        'PN-SPN': 6, 'SPN-PN': 6,
        'RE-ZM': 10, 'ZM-RE': 10,  // Reina Elisenda <-> Zona Maniobres
        'SR-V0': 10, 'V0-SR': 10,  // Sarrià Via 0
    } as Record<string, number>,
};

const ASCENDING_ORIGIN_STATIONS = new Set(['PC', 'PR']);
const DESCENDING_ORIGIN_STATIONS = new Set(['TB', 'NA', 'PN', 'TR', 'EN', 'RE', 'DNA', 'DPN', 'DRE', 'COR']);

export const useAlternativeService = ({
    islandId,
    islandStations,
    physicalTrains,
    allDrivers,
    selectedServei,
    allShifts,
    displayMin,
    parkedUnits,
    selectedCutSegments,
    showToast,
    canSupportS1,
    canSupportS2,
    canSupportL6,
    canSupportL7Full,
    canSupportL7Local,
    canSupportL12
}: UseAlternativeServiceProps) => {
    const [lineCounts, setLineCounts] = useState<Record<string, number>>({
        S1: 0, S2: 0, L6: 0, L7: 0, L12: 0
    });
    const [lineHeadways, setLineHeadways] = useState<Record<string, number | null>>({
        S1: 15, S2: 15, L6: 15, L7: 15, L12: 15
    });
    const [enabledLines, setEnabledLines] = useState<Record<string, boolean>>({
        S1: true, S2: true, L6: true, L7: true, L12: true
    });
    const [normalLines, setNormalLines] = useState<Record<string, boolean>>({
        S1: false, S2: false, L6: false, L7: false, L12: false
    });
    const [generatedCircs, setGeneratedCircs] = useState<any[]>([]);
    const [generating, setGenerating] = useState(false);
    const [isInitializedFor, setIsInitializedFor] = useState<string | null>(null);

    // Initial calculation for reasonable defaults
    useEffect(() => {
        if (isInitializedFor === islandId) return;

        const initial = { S1: 0, S2: 0, L6: 0, L7: 0, L12: 0 };
        let avTrains = physicalTrains.length;
        let avDrivers = allDrivers.length;

        const tryInc = (linia: string) => {
            if (avTrains > 0 && avDrivers > 0) {
                initial[linia as keyof typeof initial]++;
                avTrains--;
                avDrivers--;
                return true;
            }
            return false;
        };

        if (enabledLines.L12 && canSupportL12) {
            if (avTrains > 0 && avDrivers > 0) tryInc("L12");
        }

        if (enabledLines.L7 && (canSupportL7Full || canSupportL7Local)) {
            const l7TrainsInIsland = physicalTrains.filter(t => t.linia === 'L7' || t.linia === '300').length;
            for (let i = 0; i < l7TrainsInIsland; i++) {
                if (avTrains > 0 && avDrivers > 0) tryInc("L7");
            }
        }

        if (enabledLines.L6 && canSupportL6) {
            const l6TrainsInIsland = physicalTrains.filter(t => t.linia === 'L6').length;
            for (let i = 0; i < l6TrainsInIsland; i++) {
                if (avTrains > 0 && avDrivers > 0) tryInc("L6");
            }
        }

        let cycle = 0;
        while (avTrains > 0 && avDrivers > 0 && cycle < 30) {
            let changed = false;
            if (canSupportS1 && canSupportS2 && enabledLines.S1 && enabledLines.S2) {
                if (avTrains >= 2 && avDrivers >= 2) {
                    tryInc("S1");
                    tryInc("S2");
                    changed = true;
                }
            } else if (canSupportS1 && enabledLines.S1) {
                if (tryInc("S1")) changed = true;
            } else if (canSupportS2 && enabledLines.S2) {
                if (tryInc("S2")) changed = true;
            }
            if (!changed) break;
            cycle++;
        }

        if (Object.values(initial).reduce((a, b) => a + b, 0) === 0 && avTrains > 0 && avDrivers > 0) {
            if (canSupportS1 && enabledLines.S1) initial.S1 = 1;
            else if (canSupportS2 && enabledLines.S2) initial.S2 = 1;
            else if ((canSupportL7Full || canSupportL7Local) && enabledLines.L7) initial.L7 = 1;
            else if (canSupportL6 && enabledLines.L6) initial.L6 = 1;
            else if (canSupportL12 && enabledLines.L12) initial.L12 = 1;
        }

        setLineCounts(initial);
        setIsInitializedFor(islandId);
    }, [islandId, physicalTrains.length, allDrivers.length, isInitializedFor]);

    const updateCount = (linia: string, delta: number) => {
        setLineCounts(prev => {
            let updates: Record<string, number> = { [linia]: Math.max(0, prev[linia] + delta) };
            if ((linia === 'S1' || linia === 'S2') && canSupportS1 && canSupportS2 && enabledLines.S1 && enabledLines.S2) {
                const val = updates[linia];
                updates = { S1: val, S2: val };
            }
            const nextState = { ...prev, ...updates };
            const total = Object.values(nextState).reduce((sum, v) => sum + v, 0);
            if (total > physicalTrains.length || total > allDrivers.length) {
                return prev;
            }
            return nextState;
        });
    };

    const updateHeadway = (linia: string, delta: number) => {
        setLineHeadways(prev => ({
            ...prev,
            [linia]: Math.max(1, (prev[linia] || 15) + delta)
        }));
    };

    const toggleLine = (linia: string) => {
        setEnabledLines(prev => {
            const next = !prev[linia];
            if (!next) {
                setLineCounts(c => ({ ...c, [linia]: 0 }));
            }
            return { ...prev, [linia]: next };
        });
    };

    const toggleNormal = (linia: string) => {
        setNormalLines(prev => ({ ...prev, [linia]: !prev[linia] }));
    };

    const shuttlePlan = useMemo(() => {
        const availableTrains = [...physicalTrains];
        if (parkedUnits && parkedUnits.length > 0) {
            const relevantDepots = new Set(['PC', 'RE', 'COR', 'NA', 'PN', 'RB', 'SC', 'GR'].filter(d => islandStations.has(d)));
            parkedUnits.forEach(u => {
                if (relevantDepots.has(u.depot_id)) {
                    if (!availableTrains.some(t => t.id === u.unit_number.toString())) {
                        availableTrains.push({
                            type: 'TRAIN',
                            id: u.unit_number.toString(),
                            linia: 'S/L',
                            stationId: u.depot_id,
                            color: '#9ca3af',
                            driver: 'SENSE MAQUINISTA',
                            torn: '---',
                            shiftStart: '--:--', shiftEnd: '--:--',
                            shiftStartMin: 0, shiftEndMin: 0,
                            shiftDep: u.depot_id,
                            servei: '0',
                            phones: [],
                            inici: u.depot_id, final: u.depot_id,
                            via_inici: u.track.toString(), via_final: u.track.toString(),
                            horaPas: '--:--',
                            x: 0, y: 0,
                            isMoving: false
                        } as any);
                    }
                }
            });
        }

        const availableDrivers = [...allDrivers];
        const formedServices: any[] = [];

        const tryAssign = (route: string, priority: string, liniaCode: string) => {
            if (availableTrains.length > 0 && availableDrivers.length > 0) {
                const train = availableTrains.shift();
                const driver = availableDrivers.shift();
                formedServices.push({ train, driver, route, priority, liniaCode });
                return true;
            }
            return false;
        }

        const getRouteForLinia = (linia: string) => {
            switch (linia) {
                case 'L12': return "L12 (Shuttle SR-RE)";
                case 'L7': return canSupportL7Full ? "L7 (Shuttle PC-TB)" : "L7 (Shuttle GR-TB)";
                case 'S1': return "S1 (Llançadora Terrassa)";
                case 'S2': return "S2 (Llançadora Sabadell)";
                case 'L6': return "L6 (Reforç Urbà)";
                default: return "Llançadora Local";
            }
        };

        const priorityGroups = [
            { lines: ['S1', 'S2'], priority: 'ALTA' },
            { lines: ['L7'], priority: 'MITJA' },
            { lines: ['L6', 'L12'], priority: 'BAIXA' }
        ];

        priorityGroups.forEach(group => {
            let anyRemaining = true;
            const assignedInGroup = group.lines.map(() => 0);
            while (anyRemaining) {
                anyRemaining = false;
                group.lines.forEach((linia, idx) => {
                    if (assignedInGroup[idx] < (lineCounts[linia] || 0)) {
                        const route = getRouteForLinia(linia);
                        if (tryAssign(route, group.priority, linia)) {
                            assignedInGroup[idx]++;
                            anyRemaining = true;
                        }
                    }
                });
            }
        });

        return formedServices;
    }, [lineCounts, physicalTrains, allDrivers, canSupportL7Full, islandStations, parkedUnits]);

    const handleGenerateCirculations = async () => {
        setGenerating(true);

        // Helpers internos (pueden sacarse a utils si se prefiere)
        const getDirection = (iniciFinal: string, circId: string, isManeuverArg = false, isViatgerArg = false): string => {
            if (isManeuverArg) return 'MANIOBRA';
            if (isViatgerArg) return 'VIATGER';
            const origin = resolveStationId(iniciFinal || '');
            if (ASCENDING_ORIGIN_STATIONS.has(origin)) return 'ASCENDENT';
            if (DESCENDING_ORIGIN_STATIONS.has(origin)) return 'DESCENDENT';
            const num = parseInt(circId.replace(/\D/g, '') || '1');
            return num % 2 !== 0 ? 'ASCENDENT' : 'DESCENDENT';
        };

        const getTrainChangeTime = (station: string, timeMin: number): number => {
            if (station === 'GR' && timeMin >= 1440) return N_LABORAL.TRAIN_CHANGE['GR'];
            return N_LABORAL.TRAIN_CHANGE[station] ?? N_LABORAL.TRAIN_CHANGE['DEFAULT'];
        };

        const getSetupTime = (depot: string, hasStartup = true): number => {
            const entry = N_LABORAL.SETUP[depot];
            if (!entry) return 7;
            return hasStartup ? entry.withStartup : entry.withoutStartup;
        };

        const getWalkTime = (from: string, to: string): number => {
            const key = `${from}-${to}`;
            return N_LABORAL.WALK[key] ?? 0;
        };

        const getEndpoints = (lineStations: string[]) => {
            const present = lineStations.filter(s => islandStations.has(s));
            if (present.length < 2) return null;
            const indices = present.map(s => lineStations.indexOf(s));
            const minIdx = Math.min(...indices);
            const maxIdx = Math.max(...indices);
            return { start: lineStations[minIdx], end: lineStations[maxIdx], length: maxIdx - minIdx };
        };

        try {
            let theoryCircs: any[] = [];
            let fromIdx = 0;
            while (true) {
                const { data: batch } = await supabase.from('circulations').select('*').range(fromIdx, fromIdx + 999);
                if (!batch || batch.length === 0) break;
                theoryCircs = theoryCircs.concat(batch);
                if (batch.length < 1000) break;
                fromIdx += 1000;
            }
            if (theoryCircs.length === 0) {
                showToast("No s'han pogut carregar circulacions teòriques", "error");
                return;
            }

            const liniaPrefixes: Record<string, string> = { 'S1': 'D', 'S2': 'F', 'L6': 'A', 'L7': 'B', 'L12': 'L' };
            const liniaStationsRef = LINIA_STATIONS;

            const circIdToService: Record<string, string> = {};
            const circIdToShiftId: Record<string, string> = {};
            allShifts.forEach(s => {
                (s.circulations as any[] || []).forEach(cRef => {
                    const codi = (typeof cRef === 'string' ? cRef : cRef?.codi)?.toUpperCase().trim() || '';
                    if (codi) {
                        circIdToService[codi] = (s.servei || '').toString();
                        circIdToShiftId[codi] = s.id;
                    }
                });
            });

            const plan: any[] = [];
            const resourcesByLinia: Record<string, any[]> = {};

            // Store initial assignments from shuttle plan to place drivers correctly
            const initialStationsMap: Record<string, string> = {};
            shuttlePlan.forEach(s => {
                if (!resourcesByLinia[s.liniaCode]) resourcesByLinia[s.liniaCode] = [];
                resourcesByLinia[s.liniaCode].push(s);
                if (s.driver && s.train) {
                    initialStationsMap[s.driver.torn] = s.train.stationId || 'PC';
                }
            });

            let driverPool: any[] = allDrivers.map(d => {
                const shiftNum = parseInt(d.torn?.replace(/\D/g, '') || '0');
                let homeStation = 'PC';
                if (shiftNum >= 100 && shiftNum < 200) homeStation = 'SR';
                else if (shiftNum >= 200 && shiftNum < 300) homeStation = 'RB';
                else if (shiftNum >= 300 && shiftNum < 400) homeStation = 'NA';
                else if (shiftNum >= 400 && shiftNum < 500) homeStation = 'PN';

                const startMin = getFgcMinutes(d.shiftStart) || displayMin;
                const endMin = getFgcMinutes(d.shiftEnd) || 1620;
                const extensionLimit = startMin + 525;
                const setupTime = getSetupTime(homeStation, false);
                const effectiveAvailAt = startMin < displayMin ? displayMin : startMin + setupTime;
                const alreadyDriven = Math.max(0, displayMin - startMin);
                const contDriveAtStart = Math.min(N_LABORAL.MAX_DRIVE, Math.floor(alreadyDriven * 0.5));
                const shiftHoursElapsed = (displayMin - startMin) / 60;
                const mainBreakLikelyTaken = shiftHoursElapsed > 3.5;

                return {
                    ...d,
                    currentStation: initialStationsMap[d.torn] || d.stationId || homeStation,
                    availableAt: effectiveAvailAt,
                    activeShiftEnd: endMin,
                    shiftExtensionLimit: extensionLimit,
                    activeShiftStart: startMin,
                    activeShiftDep: homeStation,
                    setupTime,
                    tripCount: 0,
                    contDrive: contDriveAtStart,
                    mainBreakTaken: mainBreakLikelyTaken,
                    accumulatedRest: 0,
                    lastArrival: displayMin,
                    currentTrain: null
                };
            }).sort((a, b) => a.activeShiftEnd - b.activeShiftEnd);

            const LINE_ORDER = ['S1', 'S2', 'L7', 'L6', 'L12'];
            let lastManeuverNum = 799;
            (theoryCircs as any[]).forEach(c => {
                if (c.id.startsWith('V') || c.id.startsWith('T') || c.id.startsWith('X')) {
                    const n = parseInt(c.id.replace(/\D/g, ''));
                    if (n >= 800 && n <= 999 && n > lastManeuverNum) lastManeuverNum = n;
                }
            });

            const shiftsToIncludeNorm = new Set<string>();
            LINE_ORDER.forEach(liniaCode => {
                if (!normalLines[liniaCode] || !enabledLines[liniaCode]) return;
                (theoryCircs as any[]).forEach(c => {
                    if (c.linia === liniaCode) {
                        const sId = circIdToShiftId[c.id.toUpperCase().trim()];
                        if (sId) shiftsToIncludeNorm.add(sId);
                    }
                });
            });

            shiftsToIncludeNorm.forEach(shiftId => {
                const shift = allShifts.find(s => s.id === shiftId);
                if (!shift || !isServiceVisible(shift.servei, selectedServei)) return;
                const shiftService = (shift.servei || '').toString();
                const assignedD = driverPool.find(dp => dp.torn === shift.id);

                (shift.circulations as any[]).forEach(cRef => {
                    const codi = (typeof cRef === 'string' ? cRef : cRef?.codi) || '';
                    if (!codi) return;
                    let circ = (theoryCircs as any[]).find(tc => tc.id === codi);
                    if (!circ && codi === 'VIATGER' && typeof cRef === 'object') {
                        circ = { ...cRef, id: 'VIATGER', linia: 'V' };
                    }
                    if (!circ) return;
                    const mStart = getFgcMinutes(circ.sortida);
                    const mEnd = getFgcMinutes(circ.arribada);
                    if (mStart === null || mStart < displayMin) return;
                    const hasTouch = [circ.inici, circ.final, ...(circ.estacions?.map((s: any) => s.nom) || [])].some(st => islandStations.has(st));
                    if (!hasTouch) return;
                    const isManeuver = circ.id.startsWith('V') || circ.id.startsWith('T') || circ.id.startsWith('X');
                    const isViatger = circ.id === 'VIATGER';
                    plan.push({
                        id: circ.id, servei: shiftService, linia: circ.linia || '---', train: 'TREN GRÀFIC',
                        driver: assignedD ? assignedD.driver : 'SENSE MAQUINISTA (NORMAL)', torn: shift.id,
                        isManeuver, isViatger, shiftStart: assignedD?.shiftStart || '--:--', shiftEnd: assignedD?.shiftEnd || '--:--',
                        sortida: circ.sortida, arribada: circ.arribada, route: (circ as any).route || `${circ.inici} → ${circ.final}`,
                        direction: getDirection(circ.inici, circ.id, isManeuver, isViatger),
                        startTimeMinutes: mStart, numValue: parseInt(circ.id.replace(/\D/g, '') || '0') || 900,
                        isNormal: true, delay: 0, prevId: 'GRÀFIC', nextId: 'GRÀFIC'
                    });
                    if (assignedD && mEnd !== null) {
                        assignedD.availableAt = Math.max(assignedD.availableAt, mEnd + 2);
                        assignedD.currentStation = circ.final;
                        assignedD.tripCount++;
                    }
                });
            });

            const lineContexts: Record<string, any> = {};
            LINE_ORDER.forEach(liniaCode => {
                if (!enabledLines[liniaCode] || normalLines[liniaCode]) return;
                const count = lineCounts[liniaCode];
                if (count === 0) return;
                const eps = getEndpoints(liniaStationsRef[liniaCode]);
                if (!eps) return;

                const prefix = liniaPrefixes[liniaCode];
                const areaTheory = (theoryCircs as any[]).filter(c => mainLiniaForFilter(c.linia) === liniaCode);
                let maxAscStartedNum = 0, maxDescStartedNum = 0;
                let maxAscTime = 0, maxDescTime = 0;

                areaTheory.forEach(c => {
                    const shiftServ = circIdToService[c.id.toUpperCase().trim()] || '';
                    if (!isServiceVisible(shiftServ, selectedServei)) return;
                    const n = parseInt(c.id.replace(/\D/g, '')) || 0;
                    const isAsc = n % 2 !== 0;
                    const m = getFgcMinutes(c.sortida);
                    if (m !== null) {
                        if (m <= displayMin) {
                            if (isAsc && n > maxAscStartedNum) maxAscStartedNum = n;
                            else if (!isAsc && n > maxDescStartedNum) maxDescStartedNum = n;
                        }
                        const isManeuver = c.id.startsWith('V') || c.id.startsWith('T') || c.id.startsWith('X');
                        if (!isManeuver) {
                            if (isAsc && m > maxAscTime) maxAscTime = m;
                            if (!isAsc && m > maxDescTime) maxDescTime = m;
                        }
                    }
                });

                if (maxAscTime === 0 && maxDescTime === 0) { maxAscTime = 1620; maxDescTime = 1620; }
                const maxLineTime = Math.max(maxAscTime, maxDescTime);

                let totalTravelMins = 0;
                let countValid = 0;
                areaTheory.forEach(c => {
                    const stops = [c.inici, ...(c.estacions?.map((s: any) => s.nom) || []), c.final].map(s => resolveStationId(s));
                    const idx1 = stops.indexOf(eps.start);
                    const idx2 = stops.indexOf(eps.end);
                    if (idx1 !== -1 && idx2 !== -1) {
                        const times = [c.sortida, ...(c.estacions?.map((s: any) => s.hora || s.sortida) || []), c.arribada];
                        const t1 = getFgcMinutes(times[idx1]);
                        const t2 = getFgcMinutes(times[idx2]);
                        if (t1 !== null && t2 !== null) {
                            const diff = Math.abs(t2 - t1);
                            if (diff > 2 && diff < 60) { totalTravelMins += diff; countValid++; }
                        }
                    }
                });

                let refTravelTime = 15;
                if (countValid > 0) refTravelTime = Math.ceil(totalTravelMins / countValid);
                else {
                    const sample = areaTheory.filter(c => {
                        const stops = [c.inici, ...(c.estacions?.map((s: any) => s.nom) || []), c.final].map(s => resolveStationId(s));
                        return stops.includes(eps.start) && stops.includes(eps.end);
                    }).sort((a, b) => (getFgcMinutes(b.sortida) || 0) - (getFgcMinutes(a.sortida) || 0))[0];
                    if (sample) {
                        const stops = [sample.inici, ...(sample.estacions?.map((s: any) => s.nom) || []), sample.arribada];
                        const times = [sample.sortida, ...(sample.estacions?.map((s: any) => s.hora || s.sortida) || []), sample.arribada];
                        const t1 = getFgcMinutes(times[stops.indexOf(eps.start)]), t2 = getFgcMinutes(times[stops.indexOf(eps.end)]);
                        if (t1 !== null && t2 !== null) refTravelTime = Math.abs(t2 - t1);
                    } else {
                        refTravelTime = Math.max(8, (getFullPath(eps.start, eps.end).length - 1) * 3);
                    }
                }

                const shuttlePath = getFullPath(eps.start, eps.end);
                let vuPenalty = 0;
                for (let i = 0; i < shuttlePath.length - 1; i++) {
                    const u = shuttlePath[i], v = shuttlePath[i + 1];
                    if ((selectedCutSegments.has(`${u}-${v}-V1`) || selectedCutSegments.has(`${v}-${u}-V1`)) !== (selectedCutSegments.has(`${u}-${v}-V2`) || selectedCutSegments.has(`${v}-${u}-V2`))) vuPenalty += 5;
                }
                refTravelTime += vuPenalty;

                const branchUnits = (resourcesByLinia[liniaCode] || []).map(u => ({
                    ...u, currentDriverId: u.driver ? u.driver.torn : null, availableAt: displayMin, currentStation: u.train.stationId || 'PC'
                }));

                const numUnits = Math.max(1, branchUnits.length);
                const clampedTravel = Math.min(60, Math.max(5, refTravelTime));
                const fullCyclePhysics = 2 * (clampedTravel + TURNAROUND_TERM);
                const physicsHeadway = fullCyclePhysics / numUnits;

                let totalDriverTripCapacity = 0;
                driverPool.forEach(d => {
                    const shiftEndLimit = Math.max(d.activeShiftEnd, d.shiftExtensionLimit || 0);
                    const driverWindowStart = Math.max(displayMin, d.availableAt);
                    const driverWindowEnd = shiftEndLimit;
                    const rawWindow = Math.max(0, driverWindowEnd - driverWindowStart);
                    if (rawWindow <= 0) return;
                    const hoursFromShiftStart = (driverWindowStart - d.activeShiftStart) / 60;
                    const requiresMainBreakInWindow = !d.mainBreakTaken && hoursFromShiftStart < 5.5 && rawWindow > 30;
                    const breakDeduction = requiresMainBreakInWindow ? N_LABORAL.MAIN_BREAK : 0;
                    const continuousBreaks = d.contDrive > N_LABORAL.MAX_DRIVE - clampedTravel ? N_LABORAL.MIN_BREAK : 0;
                    const effectiveWorkTime = Math.max(0, rawWindow - breakDeduction - continuousBreaks);
                    const tripsThisDriver = Math.floor(effectiveWorkTime / (clampedTravel + TURNAROUND_TERM));
                    totalDriverTripCapacity += tripsThisDriver;
                });

                const serviceWindow = Math.max(0, maxLineTime - displayMin);
                const physicsSlots = numUnits * Math.floor(serviceWindow / (clampedTravel + TURNAROUND_TERM));
                let optimalHeadway: number;
                if (totalDriverTripCapacity === 0) optimalHeadway = physicsHeadway;
                else if (totalDriverTripCapacity >= physicsSlots * 0.9) optimalHeadway = physicsHeadway;
                else {
                    const driverHeadway = (numUnits * serviceWindow) / totalDriverTripCapacity;
                    optimalHeadway = Math.max(physicsHeadway, driverHeadway);
                }
                const headway = Math.max(5, Math.round(optimalHeadway));

                lineContexts[liniaCode] = {
                    eps, prefix, refTravelTime: clampedTravel, headway, physicsHeadway,
                    maxLineTime, maxAscTime, maxDescTime, nextAscNum: maxAscStartedNum + 2, nextDescNum: maxDescStartedNum + 2,
                    branchUnits, nextStartTimeAsc: displayMin + 2, nextStartTimeDesc: displayMin + 2 + Math.floor(headway / 2)
                };
            });

            const tripSlots: any[] = [];
            Object.entries(lineContexts).forEach(([liniaCode, ctx]) => {
                const numUnits = Math.max(1, ctx.branchUnits.length);
                const fullCycleTime = 2 * (ctx.refTravelTime + TURNAROUND_TERM);
                const trueStagger = fullCycleTime / numUnits;
                ctx.branchUnits.forEach((u: any, uIdx: number) => {
                    const staggerOffset = Math.round(uIdx * trueStagger);
                    let currentTime = ctx.nextStartTimeAsc + staggerOffset;
                    let currentStation = ctx.eps.start;
                    let goingToEnd = true;
                    while (currentTime < ctx.maxLineTime) {
                        const origin = currentStation;
                        const dest = goingToEnd ? ctx.eps.end : ctx.eps.start;
                        const isTechnical = goingToEnd ? currentTime >= ctx.maxAscTime : currentTime >= ctx.maxDescTime;
                        tripSlots.push({ liniaCode, isAsc: goingToEnd, idealStartTime: currentTime, origin, dest, unitIdx: uIdx, isTechnical });
                        currentTime += ctx.refTravelTime + TURNAROUND_TERM;
                        currentStation = dest;
                        goingToEnd = !goingToEnd;
                    }
                });
            });

            if (canSupportS1 && canSupportS2) {
                const s1Count = tripSlots.filter(s => s.liniaCode === 'S1').length;
                const s2Count = tripSlots.filter(s => s.liniaCode === 'S2').length;
                const target = Math.min(s1Count, s2Count);
                let cS1 = 0, cS2 = 0;
                const filtered = [];
                for (const s of tripSlots) {
                    if (s.liniaCode === 'S1') { if (cS1 < target) { filtered.push(s); cS1++; } }
                    else if (s.liniaCode === 'S2') { if (cS2 < target) { filtered.push(s); cS2++; } }
                    else filtered.push(s);
                }
                tripSlots.length = 0; tripSlots.push(...filtered);
            }

            tripSlots.sort((a, b) => a.idealStartTime - b.idealStartTime);
            tripSlots.forEach(slot => {
                const ctx = lineContexts[slot.liniaCode];
                const unitObj = ctx.branchUnits[slot.unitIdx];
                if (!unitObj) return;
                const startTime = slot.idealStartTime;
                const endTime = startTime + ctx.refTravelTime;
                const selectedCandidate = driverPool.map(d => {
                    const isAtStation = d.currentStation === slot.origin;
                    const isSameUnit = unitObj.currentDriverId === d.torn;
                    let techTime = 0;
                    if (isSameUnit) techTime = N_LABORAL.CAB_CHANGE;
                    else if (isAtStation) techTime = getTrainChangeTime(slot.origin, startTime);
                    else {
                        const walkLookup = getWalkTime(d.currentStation, slot.origin);
                        if (walkLookup > 0) techTime = walkLookup + getTrainChangeTime(slot.origin, startTime);
                        else {
                            const pathLen = getFullPath(d.currentStation, slot.origin).length;
                            techTime = Math.max(10, (pathLen - 1) * 4);
                        }
                    }
                    const drivingLimitMet = (d.contDrive || 0) + ctx.refTravelTime > N_LABORAL.MAX_DRIVE;
                    const hoursInShift = (startTime - d.activeShiftStart) / 60;
                    const inMainBreakWindow = hoursInShift >= 2.5 && hoursInShift <= 5.5;
                    const needsMainBreak = !d.mainBreakTaken && inMainBreakWindow;
                    let driverReadyAt = d.availableAt + techTime;
                    if (drivingLimitMet) driverReadyAt += N_LABORAL.MIN_BREAK;
                    if (needsMainBreak) driverReadyAt += N_LABORAL.MAIN_BREAK;
                    const driverCanMakeIt = driverReadyAt <= startTime + 2;
                    const canPerform = isAtStation || d.tripCount === 0;
                    const retPathLen = getFullPath(slot.dest, d.activeShiftDep || 'PC').length;
                    const returnDuration = Math.max(getWalkTime(slot.dest, d.activeShiftDep || ''), (retPathLen - 1) * 3);
                    const shiftEndLimit = Math.max(d.activeShiftEnd, d.shiftExtensionLimit || 0);
                    const isValid = driverCanMakeIt && canPerform && endTime + returnDuration <= shiftEndLimit;
                    return { driver: d, isValid, isAtStation, isSameUnit, needsMainBreak, drivingLimitMet };
                }).filter(c => c.isValid).sort((a, b) => {
                    // 1. Prioritize rotation (use fresh drivers or those with fewer trips)
                    if ((a.driver.tripCount || 0) !== (b.driver.tripCount || 0)) {
                        return (a.driver.tripCount || 0) - (b.driver.tripCount || 0);
                    }
                    // 2. Prioritize those who finish earlier (to ensure they complete their work window)
                    if (a.driver.activeShiftEnd !== b.driver.activeShiftEnd) {
                        return a.driver.activeShiftEnd - b.driver.activeShiftEnd;
                    }
                    // 3. Prefer staying with the same unit if trip counts are equal (efficiency)
                    if (a.isSameUnit !== b.isSameUnit) return a.isSameUnit ? -1 : 1;
                    // 4. Being at the station
                    if (a.isAtStation !== b.isAtStation) return a.isAtStation ? -1 : 1;
                    // 5. Final tie-break on availability
                    return (a.driver.availableAt || 0) - (b.driver.availableAt || 0);
                })[0];

                const selectedDriver = selectedCandidate?.driver || null;
                const activeDriver = selectedDriver || { driver: 'SENSE MAQUINISTA (AVÍS)', torn: '---' };
                const tripNum = slot.isAsc ? ctx.nextAscNum : ctx.nextDescNum;
                if (slot.isAsc) ctx.nextAscNum += 2; else ctx.nextDescNum += 2;

                plan.push({
                    id: `${ctx.prefix}A${tripNum.toString().padStart(3, '0')}`, delay: 0, servei: (activeDriver as any).servei, linia: slot.liniaCode,
                    train: unitObj.train.id, driver: activeDriver.driver || (activeDriver as any).driverName, torn: activeDriver.torn,
                    shiftStart: activeDriver.shiftStart || '--:--', shiftEnd: activeDriver.shiftEnd || '--:--', sortida: formatFgcTime(startTime),
                    arribada: formatFgcTime(endTime), route: `${slot.origin} → ${slot.dest}`,
                    direction: getDirection(slot.origin, `${ctx.prefix}${tripNum}`), startTimeMinutes: startTime, numValue: tripNum
                });

                unitObj.availableAt = endTime;
                unitObj.currentStation = slot.dest;
                if (selectedDriver) {
                    unitObj.currentDriverId = selectedDriver.torn;
                    selectedDriver.currentStation = slot.dest;
                    selectedDriver.availableAt = endTime;
                    selectedDriver.tripCount = (selectedDriver.tripCount || 0) + 1;
                    if (selectedCandidate!.drivingLimitMet) selectedDriver.contDrive = 0;
                    selectedDriver.contDrive = (selectedDriver.contDrive || 0) + ctx.refTravelTime;
                    if (selectedCandidate!.needsMainBreak) {
                        selectedDriver.mainBreakTaken = true;
                        selectedDriver.contDrive = 0;
                        selectedDriver.accumulatedRest = (selectedDriver.accumulatedRest || 0) + N_LABORAL.MAIN_BREAK;
                    }
                    if (TURNAROUND_TERM >= N_LABORAL.NON_COMPUTE_THRESHOLD) selectedDriver.accumulatedRest = (selectedDriver.accumulatedRest || 0) + TURNAROUND_TERM;
                } else unitObj.currentDriverId = '---';

                if (slot.liniaCode === 'L6' && slot.isAsc && slot.dest === 'SR') {
                    lastManeuverNum++; if (lastManeuverNum > 999) lastManeuverNum = 801; if (lastManeuverNum % 2 === 0) lastManeuverNum++; if (lastManeuverNum > 999) lastManeuverNum = 801;
                    const m1Start = endTime + 2;
                    const m1End = m1Start + 3;
                    plan.push({
                        id: `VA${lastManeuverNum}`, servei: (activeDriver as any).servei, linia: 'L6', train: unitObj.train.id,
                        driver: activeDriver.driver || (activeDriver as any).driverName, torn: activeDriver.torn,
                        sortida: formatFgcTime(m1Start), arribada: formatFgcTime(m1End),
                        route: 'SR Via 1 → SR Via 0', direction: 'MANIOBRA', startTimeMinutes: m1Start, numValue: lastManeuverNum
                    });
                    lastManeuverNum++; if (lastManeuverNum > 999) lastManeuverNum = 801; if (lastManeuverNum % 2 !== 0) lastManeuverNum++; if (lastManeuverNum > 999) lastManeuverNum = 802;
                    const m2Start = m1End + 4;
                    const m2End = m2Start + 3;
                    plan.push({
                        id: `VA${lastManeuverNum}`, servei: (activeDriver as any).servei, linia: 'L6', train: unitObj.train.id,
                        driver: activeDriver.driver || (activeDriver as any).driverName, torn: activeDriver.torn,
                        sortida: formatFgcTime(m2Start), arribada: formatFgcTime(m2End),
                        route: 'SR Via 0 → SR Via 2', direction: 'MANIOBRA', startTimeMinutes: m2Start, numValue: lastManeuverNum
                    });
                    if (selectedDriver) { selectedDriver.availableAt = m2End; selectedDriver.currentStation = 'SR'; }
                    unitObj.availableAt = m2End; unitObj.currentStation = 'SR';
                }

                if (slot.liniaCode === 'S1' && slot.dest === 'NA') {
                    lastManeuverNum++; if (lastManeuverNum > 999) lastManeuverNum = 801; if (lastManeuverNum % 2 === 0) lastManeuverNum++; if (lastManeuverNum > 999) lastManeuverNum = 801;
                    const m1Start = endTime + 2;
                    const m1End = m1Start + 3;
                    plan.push({
                        id: `TA${lastManeuverNum}`, servei: (activeDriver as any).servei, linia: 'S1', train: unitObj.train.id,
                        driver: activeDriver.driver || (activeDriver as any).driverName, torn: activeDriver.torn,
                        sortida: formatFgcTime(m1Start), arribada: formatFgcTime(m1End),
                        route: 'NA Via 1 → Zona Maniobres', direction: 'MANIOBRA', startTimeMinutes: m1Start, numValue: lastManeuverNum
                    });
                    lastManeuverNum++; if (lastManeuverNum > 999) lastManeuverNum = 801; if (lastManeuverNum % 2 !== 0) lastManeuverNum++; if (lastManeuverNum > 999) lastManeuverNum = 802;
                    const m2Start = m1End + 4;
                    const m2End = m2Start + 3;
                    plan.push({
                        id: `TA${lastManeuverNum}`, servei: (activeDriver as any).servei, linia: 'S1', train: unitObj.train.id,
                        driver: activeDriver.driver || (activeDriver as any).driverName, torn: activeDriver.torn,
                        sortida: formatFgcTime(m2Start), arribada: formatFgcTime(m2End),
                        route: 'Zona Maniobres → NA Via 2', direction: 'MANIOBRA', startTimeMinutes: m2Start, numValue: lastManeuverNum
                    });
                    if (selectedDriver) { selectedDriver.availableAt = m2End; selectedDriver.currentStation = 'NA'; }
                    unitObj.availableAt = m2End; unitObj.currentStation = 'NA';
                } else if (slot.liniaCode === 'S1' && (slot.dest === 'TR' || slot.dest === 'EN')) {
                    lastManeuverNum++; if (lastManeuverNum > 999) lastManeuverNum = 801;
                    const mStart = endTime + 2;
                    const mEnd = mStart + 4;
                    plan.push({
                        id: `TA${lastManeuverNum}`, servei: (activeDriver as any).servei, linia: 'S1', train: unitObj.train.id,
                        driver: activeDriver.driver || (activeDriver as any).driverName, torn: activeDriver.torn,
                        sortida: formatFgcTime(mStart), arribada: formatFgcTime(mEnd),
                        route: `${slot.dest} → ${slot.dest}`, direction: 'MANIOBRA', startTimeMinutes: mStart, numValue: lastManeuverNum
                    });
                    if (selectedDriver) selectedDriver.availableAt = mEnd;
                    unitObj.availableAt = mEnd;
                }
            });

            Object.entries(lineContexts).forEach(([liniaCode, ctx]) => {
                const islandDepots = ['PC', 'RE', 'COR', 'NA', 'PN', 'RB', 'SC', 'GR'].filter(d => islandStations.has(d));
                ctx.branchUnits.forEach((u: any) => {
                    const lastTrip = plan.filter(p => p.train === u.train.id).sort((a, b) => b.startTimeMinutes - a.startTimeMinutes)[0];
                    const fromStation = lastTrip ? lastTrip.route.split(' → ')[1] : u.train.stationId;
                    const arrival = lastTrip ? getFgcMinutes(lastTrip.arribada) || displayMin : displayMin;
                    let targetDepot = '', minDistance = 999;
                    islandDepots.forEach(dep => {
                        const path = getFullPath(fromStation, dep);
                        if (path.length > 0 && path.length < minDistance) { minDistance = path.length; targetDepot = dep; }
                    });
                    if (targetDepot && fromStation !== targetDepot) {
                        const rStart = Math.max(arrival + 5, ctx.maxLineTime);
                        const rTravel = Math.max(5, (minDistance - 1) * 3);
                        const rEnd = rStart + rTravel;
                        let assignedDriver = 'MAQUINISTA DE RETIR', assignedTorn = '---', sStart = '--:--', sEnd = '--:--';
                        if (lastTrip && lastTrip.torn) {
                            const shiftNum = parseInt(lastTrip.torn.replace(/\D/g, '') || '0');
                            let homeStation = 'PC';
                            if (shiftNum >= 100 && shiftNum < 200) homeStation = 'SR';
                            else if (shiftNum >= 200 && shiftNum < 300) homeStation = 'RB';
                            else if (shiftNum >= 300 && shiftNum < 400) homeStation = 'NA';
                            else if (shiftNum >= 400 && shiftNum < 500) homeStation = 'PN';
                            const limit = Math.max(getFgcMinutes(lastTrip.shiftEnd) || 1620, (getFgcMinutes(lastTrip.shiftStart) || 0) + 525);
                            if (targetDepot === homeStation && rEnd <= limit) { assignedDriver = lastTrip.driver; assignedTorn = lastTrip.torn; sStart = lastTrip.shiftStart; sEnd = lastTrip.shiftEnd; }
                        }
                        let retireId = `V${u.train.id.replace(/\./g, '')}`;
                        if (liniaCode === 'S1') {
                            lastManeuverNum++; if (lastManeuverNum > 999) lastManeuverNum = 801;
                            if (lastManeuverNum % 2 === 0) lastManeuverNum++; if (lastManeuverNum > 999) lastManeuverNum = 801;
                            retireId = `TA${lastManeuverNum}`;
                        }
                        plan.push({
                            id: retireId, linia: liniaCode, train: u.train.id, driver: assignedDriver, torn: assignedTorn,
                            shiftStart: sStart, shiftEnd: sEnd, sortida: formatFgcTime(rStart), arribada: formatFgcTime(rEnd),
                            route: `${fromStation} → ${targetDepot}`, direction: getDirection(fromStation, retireId),
                            isRetirement: true, startTimeMinutes: rStart, numValue: 999
                        });
                    }
                });
            });

            const sortedPlan = plan.sort((a, b) => a.startTimeMinutes - b.startTimeMinutes || a.numValue - b.numValue);
            const unitSequences: Record<string, any[]> = {};
            sortedPlan.forEach(trip => { if (!unitSequences[trip.train]) unitSequences[trip.train] = []; unitSequences[trip.train].push(trip); });
            Object.values(unitSequences).forEach(trips => {
                for (let i = 0; i < trips.length; i++) {
                    trips[i].prevId = i === 0 ? 'En circulació' : trips[i - 1].id;
                    trips[i].nextId = i === trips.length - 1 ? 'Final de servei' : trips[i + 1].id;
                }
            });
            setGeneratedCircs(sortedPlan);
        } catch (e) {
            console.error(e);
            showToast("Error generant circulacions", "error");
        } finally {
            setGenerating(false);
        }
    };

    const autoRecalculateHeadways = async () => {
        let theoryCircs: any[] = [];
        let fromIdx2 = 0;
        while (true) {
            const { data: batch } = await supabase.from('circulations').select('*').range(fromIdx2, fromIdx2 + 999);
            if (!batch || batch.length === 0) break;
            theoryCircs = theoryCircs.concat(batch);
            if (batch.length < 1000) break;
            fromIdx2 += 1000;
        }
        if (theoryCircs.length === 0) return;
        const liniaStationsRef = LINIA_STATIONS;

        Object.entries(lineCounts).forEach(([linia, count]) => {
            if (count === 0 || !enabledLines[linia]) return;
            const lineStops = liniaStationsRef[linia];
            if (!lineStops) return;
            const islandLineStops = lineStops.filter(s => islandStations.has(s));
            if (islandLineStops.length < 2) return;
            const start = islandLineStops[0];
            const end = islandLineStops[islandLineStops.length - 1];
            const sample = (theoryCircs as any[])
                .filter(c => c.linia === linia && getFgcMinutes(c.sortida) <= displayMin)
                .sort((a, b) => getFgcMinutes(b.sortida) - getFgcMinutes(a.sortida))[0]
                || (theoryCircs as any[]).find(c => c.linia === linia);

            if (sample) {
                const stops = [sample.inici, ...(sample.estacions?.map((s: any) => s.nom) || []), sample.final];
                const times = [sample.sortida, ...(sample.estacions?.map((s: any) => s.hora || s.sortida) || []), sample.arribada];
                const idx1 = stops.indexOf(start), idx2 = stops.indexOf(end);
                if (idx1 !== -1 && idx2 !== -1) {
                    const duration = Math.abs(getFgcMinutes(times[idx1]) - getFgcMinutes(times[idx2]));
                    const optimal = Math.round((duration * 2 + 6) / count);
                    setLineHeadways(h => ({ ...h, [linia]: Math.max(1, optimal) }));
                }
            }
        });
    };

    return {
        lineCounts,
        lineHeadways,
        enabledLines,
        normalLines,
        generatedCircs,
        generating,
        shuttlePlan,
        updateCount,
        updateHeadway,
        toggleLine,
        toggleNormal,
        handleGenerateCirculations,
        autoRecalculateHeadways
    };
};
