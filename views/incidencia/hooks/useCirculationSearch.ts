import { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { fetchFullTurns } from '../../../utils/queries';
import { getShortTornId, getFgcMinutes, formatFgcTime, getSegments, getTravelTime, S1_STATIONS, S2_STATIONS, mainLiniaForFilter, resolveStationId } from '../../../utils/stations';
import { feedback } from '../../../utils/feedback';
import { useToast } from '../../../components/ToastProvider';

interface UseCirculationSearchProps {
    selectedServei: string;
}

// Note: RESERVE_MAP is now defined within handleSearchCirculation for better scoping and prefix mapping.

export const useCirculationSearch = ({ selectedServei }: UseCirculationSearchProps) => {
    const { showToast } = useToast();
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);

    // Search Results State
    const [searchedCircData, setSearchedCircData] = useState<any>(null);
    const [mainDriverInfo, setMainDriverInfo] = useState<any>(null);
    const [passengerResults, setPassengerResults] = useState<any[]>([]);
    const [adjacentResults, setAdjacentResults] = useState<{ anterior: any[], posterior: any[] }>({ anterior: [], posterior: [] });
    const [restingResults, setRestingResults] = useState<any[]>([]);
    const [extensibleResults, setExtensibleResults] = useState<any[]>([]);
    const [reserveInterceptResults, setReserveInterceptResults] = useState<any[]>([]);

    const handleSearchCirculation = async () => {
        if (!query) return;
        setLoading(true);
        feedback.click();
        showToast(`Escanejant trànsit per ${query}...`, 'info');

        // Reset results
        setMainDriverInfo(null);
        setSearchedCircData(null);
        setPassengerResults([]);
        setAdjacentResults({ anterior: [], posterior: [] });
        setRestingResults([]);
        setExtensibleResults([]);
        setReserveInterceptResults([]);

        let localMainDriverInfo: any = null;
        try {
            const { data: searchedCirc } = await supabase.from('circulations').select('*').eq('id', query.toUpperCase()).single();
            if (!searchedCirc) {
                showToast(`No s'ha trobat la circulació ${query}`, 'error');
                setLoading(false);
                return;
            }
            setSearchedCircData(searchedCirc);

            // 1. Fetch theoretical shifts and daily assignments
            let theoreticalShiftsQuery = supabase.from('shifts').select('*');
            if (selectedServei === '000') theoreticalShiftsQuery = theoreticalShiftsQuery.in('servei', ['0', '000']);
            else if (selectedServei !== 'Tots') theoreticalShiftsQuery = theoreticalShiftsQuery.eq('servei', selectedServei);

            const [shiftsRes, dailyRes] = await Promise.all([
                theoreticalShiftsQuery,
                supabase.from('daily_assignments').select('torn, observacions')
            ]);

            let allShifts = shiftsRes.data || [];
            const dailyRows = dailyRes.data || [];

            // Helper to map IDs
            const idMap = new Map<string, string>();
            allShifts.forEach(s => {
                const short = getShortTornId(s.id);
                if (!idMap.has(short)) idMap.set(short, s.id);
            });
            dailyRows.forEach(d => {
                if (d.torn) {
                    const short = getShortTornId(d.torn);
                    if (!idMap.has(short)) idMap.set(short, d.torn);
                }
                const obsMatch = (d.observacions || '').match(/\b(Q[A-Z0-9]+)\b/);
                if (obsMatch) {
                    const obsTorn = obsMatch[1];
                    const short = getShortTornId(obsTorn);
                    if (!idMap.has(short)) idMap.set(short, obsTorn);
                }
            });

            const allPossibleTurnIds = Array.from(idMap.values());
            if (allPossibleTurnIds.length === 0) { setLoading(false); return; }

            // Find Main Driver & Passengers
            let mainDriverShiftId = null;
            const passengerShiftIds: string[] = [];
            allShifts.forEach(shift => {
                const circs = (shift.circulations as any[]) || [];
                circs.forEach((c: any) => {
                    const codi = typeof c === 'string' ? c : (c?.codi || '');
                    if (codi && codi.toUpperCase() === query.toUpperCase()) mainDriverShiftId = shift.id;
                    else if (codi === 'Viatger' && c?.observacions && c.observacions.split('-')[0].toUpperCase() === query.toUpperCase()) passengerShiftIds.push(shift.id);
                });
            });

            if (mainDriverShiftId || passengerShiftIds.length > 0) {
                const turnIdsToFetch = Array.from(new Set([
                    ...(mainDriverShiftId ? [mainDriverShiftId] : []),
                    ...passengerShiftIds
                ]));
                const enrichedTurnsRaw = await fetchFullTurns(turnIdsToFetch, selectedServei === 'Tots' ? undefined : selectedServei);
                const enrichedTurns = enrichedTurnsRaw.filter(t => t);

                if (mainDriverShiftId) {
                    localMainDriverInfo = enrichedTurns.find(t => t.id === mainDriverShiftId);
                    setMainDriverInfo(localMainDriverInfo);
                }
                setPassengerResults(enrichedTurns.filter(t => passengerShiftIds.includes(t.id)));
            }

            // Fetch all required circulation details for analysis
            const allRequiredCircIds = new Set<string>();
            allShifts.forEach(s => {
                (s.circulations as any[])?.forEach(c => {
                    const codi = typeof c === 'string' ? c : c.codi;
                    if (codi === 'Viatger' && c.observacions) {
                        allRequiredCircIds.add(c.observacions.split('-')[0]);
                    } else if (codi) {
                        allRequiredCircIds.add(codi);
                    }
                });
            });
            const { data: circDetails } = await supabase.from('circulations').select('*').in('id', Array.from(allRequiredCircIds));
            const circDetailsSafe = circDetails || [];

            // Find Adjacents & Return Candidates
            let allLineCircsSafe: any[] = [];
            if (searchedCirc) {
                // Fetch relevant lines for return trips (Vallès corridor sharing)
                // We include L6 and L12 as they can provide return trips for SR
                const liniaType = mainLiniaForFilter(searchedCirc.linia);
                const relevantLines = (liniaType === 'S1' || liniaType === 'S2') ? ['S1', 'S2', 'S5', 'S6', 'S7', 'L6', 'L12'] : [searchedCirc.linia];
                const { data: lineCircs } = await supabase.from('circulations').select('*').in('linia', relevantLines);
                allLineCircsSafe = lineCircs || [];

                const relatedCircsSafe = allLineCircsSafe.filter(c => c.final === searchedCirc.final);

                if (relatedCircsSafe.length > 1) {
                    const sorted = relatedCircsSafe.sort((a: any, b: any) => (getFgcMinutes(a.sortida) || 0) - (getFgcMinutes(b.sortida) || 0));
                    const currentIndex = sorted.findIndex((c: any) => c.id === searchedCirc.id);
                    const anteriorId = currentIndex > 0 ? sorted[currentIndex - 1].id : null;
                    const posteriorId = currentIndex < sorted.length - 1 ? sorted[currentIndex + 1].id : null;

                    const anteriorShifts: string[] = [];
                    const posteriorShifts: string[] = [];

                    allShifts.forEach(shift => {
                        const circs = (shift.circulations as any[]) || [];
                        circs.forEach((c: any) => {
                            if (c?.codi === 'Viatger' && c?.observacions) {
                                const obsCode = c.observacions.split('-')[0].toUpperCase();
                                if (anteriorId && obsCode === anteriorId) anteriorShifts.push(shift.id);
                                if (posteriorId && obsCode === posteriorId) posteriorShifts.push(shift.id);
                            }
                        });
                    });

                    const [enrichedAnteriorRaw, enrichedPosteriorRaw] = await Promise.all([
                        fetchFullTurns(anteriorShifts, selectedServei === 'Tots' ? undefined : selectedServei),
                        fetchFullTurns(posteriorShifts, selectedServei === 'Tots' ? undefined : selectedServei)
                    ]);
                    const enrichedAnterior = enrichedAnteriorRaw.filter(t => t);
                    const enrichedPosterior = enrichedPosteriorRaw.filter(t => t);
                    setAdjacentResults({
                        anterior: enrichedAnterior.map(t => ({ ...t, adjacentCode: anteriorId })),
                        posterior: enrichedPosterior.map(t => ({ ...t, adjacentCode: posteriorId }))
                    });
                }
            }

            // Find Resting / Extensible / Reserves
            const depOrigen = resolveStationId(searchedCirc.inici);
            const depFinal = resolveStationId(searchedCirc.final);
            const sortidaMin = getFgcMinutes(searchedCirc.sortida) || 0;
            const arribadaMin = getFgcMinutes(searchedCirc.arribada) || 0;
            const linia = searchedCirc.linia || 'S1';

            const getTargetEndStation = (shiftId: string) => {
                const numMatch = shiftId.match(/\d+/);
                if (!numMatch) return null;
                const num = parseInt(numMatch[0], 10);
                if (num >= 0 && num <= 99) return 'PC';
                if (num >= 100 && num <= 199) return 'SR';
                if (num >= 200 && num <= 299) return 'RB';
                if (num >= 300 && num <= 399) return 'NA';
                if (num >= 400 && num <= 499) return 'PN';
                return null;
            };

            // Reserve mapping to stations
            const RESERVE_MAP: Record<string, string> = {
                'QRS': 'SR', 'QRR': 'RB', 'QRN': 'NA', 'QRP': 'PN', 'QRF': 'FN'
            };

            // Helper to find available reserve at a station considering schedule
            const findReserveForStation = (st: string, time: number) => {
                const found = dailyRows.find(d => {
                    const t = (d.torn || '').toUpperCase();
                    const isRes = (t.includes('RES') || t.includes('QR')) &&
                        Object.entries(RESERVE_MAP).some(([prefix, base]) => t.includes(prefix) && base === st);
                    if (!isRes) return false;

                    // STRICT TIME LOGIC
                    // Night: 22:00 (1320) - 06:00 (360) -> Q...0
                    if (t.endsWith('0')) {
                        return time >= 1320 || time < 360;
                    }
                    // Morning: 06:00 (360) - 14:00 (840) -> Q...1
                    if (t.endsWith('1')) {
                        return time >= 360 && time < 840;
                    }
                    // Afternoon: 14:00 (840) - 22:00 (1320) -> Q...2
                    if (t.endsWith('2')) {
                        return time >= 840 && time < 1320;
                    }
                    return false;
                });
                if (found) return found.torn;
                return null;
            };

            // Helper to find robust return circulation using stop times
            const findReturnOption = (fromSt: string, toSt: string, minTime: number) => {
                const fromCode = resolveStationId(fromSt);
                const toCode = resolveStationId(toSt);
                if (fromCode === toCode) return null;

                const candidates = allLineCircsSafe.filter(c => {
                    const stops = (c.estacions as any[]) || [];

                    let fTime = -1;
                    let tTime = -1;

                    // Search From
                    if (resolveStationId(c.inici) === fromCode) fTime = getFgcMinutes(c.sortida) || 0;
                    else {
                        const s = stops.find(st => resolveStationId(st.nom) === fromCode);
                        if (s) fTime = getFgcMinutes(s.hora) || 0;
                    }

                    if (fTime === -1 || fTime < minTime) return false;

                    // Search To
                    if (resolveStationId(c.final) === toCode) tTime = getFgcMinutes(c.arribada) || 0;
                    else {
                        const s = stops.find(st => resolveStationId(st.nom) === toCode);
                        if (s) tTime = getFgcMinutes(s.hora) || 0;
                    }

                    if (tTime === -1 || tTime <= fTime) return false;

                    return true;
                });

                if (candidates.length === 0) return null;

                // Sort by earliest departure from fromCode
                candidates.sort((a, b) => {
                    const getDep = (circ: any) => {
                        if (resolveStationId(circ.inici) === fromCode) return getFgcMinutes(circ.sortida) || 9999;
                        const s = (circ.estacions as any[] || []).find(st => resolveStationId(st.nom) === fromCode);
                        return s ? (getFgcMinutes(s.hora) || 9999) : 9999;
                    };
                    return getDep(a) - getDep(b);
                });

                const best = candidates[0];
                const bestStops = (best.estacions as any[]) || [];

                let startStr = '';
                if (resolveStationId(best.inici) === fromCode) startStr = best.sortida;
                else startStr = bestStops.find(s => resolveStationId(s.nom) === fromCode)?.hora || '';

                let endStr = '';
                if (resolveStationId(best.final) === toCode) endStr = best.arribada;
                else endStr = bestStops.find(s => resolveStationId(s.nom) === toCode)?.hora || '';

                return {
                    id: (best.codi === 'Viatger' || best.id === 'Viatger') ? best.observacions?.split('-')[0] : best.id,
                    start: (startStr || '').substring(0, 5),
                    end: (endStr || '').substring(0, 5)
                };
            };

            // Get path stations for the circulation
            const stationList = linia.includes('S1') ? S1_STATIONS : S2_STATIONS;
            const startIdx = stationList.indexOf(depOrigen);
            const endIdx = stationList.indexOf(depFinal);
            const path = startIdx !== -1 && endIdx !== -1
                ? (startIdx < endIdx ? stationList.slice(startIdx, endIdx + 1) : stationList.slice(endIdx, startIdx + 1).reverse())
                : [depOrigen, depFinal];

            const restingCandidates: string[] = [];
            const extensibleCandidates: string[] = [];
            const reserveCandidates: string[] = [];

            const processedTurnIds = new Set<string>();

            allShifts.forEach(shift => {
                processedTurnIds.add(shift.id);
                const sIniciRaw = getFgcMinutes(shift.inici_torn) || 0;
                const sFiRaw = getFgcMinutes(shift.final_torn) || 0;

                const circs = shift.circulations as any[] || [];
                const isReserva = shift.id.toUpperCase().includes('RES') || shift.id.toUpperCase().includes('V-') || shift.id.toUpperCase().includes('R-');

                const sortedCircs = [...circs].map(c => {
                    const cId = typeof c === 'string' ? c : c.codi;
                    const cData = circDetailsSafe.find(cd => cd.id === (cId === 'Viatger' ? (c.observacions?.split('-')[0]) : cId));
                    return { ...c, data: cData };
                }).filter(c => c.data).sort((a, b) => (getFgcMinutes(a.data.sortida) || 0) - (getFgcMinutes(b.data.sortida) || 0));

                let locationAtTime = shift.dependencia;
                let isResting = false;

                if (sortedCircs.length === 0) {
                    isResting = true;
                    locationAtTime = shift.dependencia;
                } else {
                    for (let i = 0; i <= sortedCircs.length; i++) {
                        const gapStart = i === 0 ? sIniciRaw : (getFgcMinutes(sortedCircs[i - 1].data.arribada) || 0);
                        const gapEnd = i === sortedCircs.length ? sFiRaw : (getFgcMinutes(sortedCircs[i].data.sortida) || 0);

                        let gapLoc = i === 0 ? shift.dependencia : (sortedCircs[i - 1].data.final);

                        // FIX: Check if previous circulation was Viatger with early drop-off
                        if (i > 0) {
                            const prevCirc = sortedCircs[i - 1];
                            if ((prevCirc.codi === 'Viatger' || prevCirc.id === 'Viatger') && prevCirc.observacions) {
                                const parts = prevCirc.observacions.split('-');
                                if (parts.length >= 3) {
                                    gapLoc = parts[2]; // Use actual drop-off station
                                }
                            }
                        }

                        if (sortidaMin >= gapStart && sortidaMin < gapEnd) {
                            locationAtTime = gapLoc;
                            isResting = true;
                            break;
                        }
                    }
                }

                // RESTING: Available at depOrigen at sortidaMin
                if (isResting && locationAtTime === depOrigen) {
                    const isWorkingIncidence = sortedCircs.some(c => c.data.id === searchedCirc.id);
                    if (!isWorkingIncidence) {
                        restingCandidates.push(shift.id);
                        if (isReserva) reserveCandidates.push(shift.id);
                    }
                }

                // EXTENSIBLE / AVAILABLE: 
                // Available at depOrigen AFTER their last circulation finishes, specifically AT the time of incident departure.

                let lastArr = sIniciRaw;
                let finalPos = shift.dependencia;

                if (sortedCircs.length > 0) {
                    const lastCirc = sortedCircs[sortedCircs.length - 1];
                    lastArr = getFgcMinutes(lastCirc.data.arribada) || 0;
                    finalPos = lastCirc.data.final;

                    // SPECIAL HANDLING: If last move is 'Viatger', getting off location is in observacions
                    if ((lastCirc.codi === 'Viatger' || lastCirc.id === 'Viatger') && lastCirc.observacions) {
                        const parts = lastCirc.observacions.split('-');
                        // Format expected: CIRCID-ORIGIN-DEST (e.g., D110-NA-RB) - The driver gets off at DEST (RB)
                        if (parts.length >= 3) {
                            finalPos = parts[2];
                            // Note: We are using the circulation's arrival at final destination as proxy for now, 
                            // ideally we should calculate time at specific drop-off station if different from train end.
                            // But for Viatger usually they take it to a point.
                            // Better: If we can, resolve station code.
                        }
                    }
                }

                // Condition: Finished work (lastArr <= sortidaMin) AND At Origin AND Shift is NOT finished (sortidaMin <= sFiRaw)
                if (finalPos === depOrigen && sortidaMin >= lastArr && sortidaMin <= sFiRaw) {
                    extensibleCandidates.push(shift.id);
                }
            });

            // Handle daily special shifts
            dailyRows.forEach(row => {
                if (!row.torn || processedTurnIds.has(row.torn)) return;
                const timeMatch = (row.observacions || '').match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
                if (timeMatch) {
                    const sFi = getFgcMinutes(timeMatch[2]) || 0;
                    if (sortidaMin >= sFi - 10 && sortidaMin <= sFi) {
                        extensibleCandidates.push(row.torn);
                    }
                }
            });

            const [resResting, resExtensible, resReserve] = await Promise.all([
                fetchFullTurns(restingCandidates, selectedServei === 'Tots' ? undefined : selectedServei),
                fetchFullTurns(extensibleCandidates, selectedServei === 'Tots' ? undefined : selectedServei),
                fetchFullTurns(reserveCandidates, selectedServei === 'Tots' ? undefined : selectedServei)
            ]);


            const processedResting = resResting.map(t => {
                const sInici = getFgcMinutes(t.inici_torn) || 0;
                const sFi = getFgcMinutes(t.final_torn) || 0;
                const realId = t.drivers?.[0]?.realTornId || t.id;
                let restInfo = { codi: depOrigen, start: sInici, end: sFi };
                let nextCirc = null;
                const sCircs = t.fullCirculations || [];

                for (let i = 0; i <= sCircs.length; i++) {
                    const gapStart = i === 0 ? sInici : (getFgcMinutes(sCircs[i - 1].arribada) || 0);
                    const gapEnd = i === sCircs.length ? sFi : (getFgcMinutes(sCircs[i].sortida) || 0);
                    if (sortidaMin >= gapStart && sortidaMin < gapEnd) {
                        restInfo = { codi: depOrigen, start: gapStart, end: gapEnd };
                        if (i < sCircs.length) nextCirc = sCircs[i];
                        break;
                    }
                }

                // Check return feasibility
                let returnStatus = 'unknown';
                let returnCirc = null;

                if (nextCirc) {
                    const nextStart = getFgcMinutes(nextCirc.sortida);
                    const nextOrigin = nextCirc.machinistInici || nextCirc.inici;
                    const searchEndStation = depFinal;
                    const searchArriveTime = arribadaMin;

                    if (searchEndStation === nextOrigin) {
                        returnStatus = 'same_station';
                    } else {
                        const travelTime = getTravelTime(searchEndStation, nextOrigin);
                        const neededArrival = nextStart - 5;

                        if (searchArriveTime + travelTime <= neededArrival) {
                            // Try valid return
                            const okReturn = allLineCircsSafe.filter((c: any) =>
                                c.inici === searchEndStation && c.final === nextOrigin &&
                                (getFgcMinutes(c.sortida) || 0) >= searchArriveTime + 2 &&
                                (getFgcMinutes(c.arribada) || 0) <= nextStart - 2
                            ).sort((a: any, b: any) => (getFgcMinutes(a.sortida) || 0) - (getFgcMinutes(b.sortida) || 0))[0];

                            if (okReturn) {
                                returnStatus = 'ok';
                                returnCirc = okReturn;
                            } else {
                                returnStatus = 'no_route'; // Time ok, but no circ
                            }
                        } else {
                            returnStatus = 'too_late';
                            // Find any return to show
                            const lateReturn = allLineCircsSafe.filter((c: any) =>
                                c.inici === searchEndStation && c.final === nextOrigin &&
                                (getFgcMinutes(c.sortida) || 0) >= searchArriveTime
                            ).sort((a: any, b: any) => (getFgcMinutes(a.sortida) || 0) - (getFgcMinutes(b.sortida) || 0))[0];
                            if (lateReturn) returnCirc = lateReturn;
                        }
                    }
                }

                return {
                    ...t,
                    id: realId,
                    restSeg: restInfo,
                    availableTime: restInfo.end - sortidaMin,
                    conflictMinutes: Math.max(0, arribadaMin - restInfo.end),
                    nextCirculation: nextCirc ? { ...nextCirc, start: getFgcMinutes(nextCirc.sortida), end: getFgcMinutes(nextCirc.arribada) } : null,
                    returnStatus,
                    returnCirc,
                    isEndOfShift: restInfo.end === sFi
                };
            }).filter(t => t.availableTime > 0).sort((a, b) => b.availableTime - a.availableTime);

            setRestingResults(processedResting);

            setExtensibleResults(resExtensible.map(t => {
                const sInici = getFgcMinutes(t.inici_torn) || 0;
                const realId = t.drivers?.[0]?.realTornId || t.id;
                const originalDuration = (getFgcMinutes(t.final_torn) || 0) - sInici;
                const targetStation = getTargetEndStation(t.id) || t.dependencia;
                const returnTime = getTravelTime(depFinal, targetStation);
                return { ...t, id: realId, extData: { originalDuration, extraNeeded: Math.max(0, (arribadaMin + returnTime) - (getFgcMinutes(t.final_torn) || 0)), estimatedReturn: arribadaMin + returnTime } };
            }).filter(t => !restingCandidates.includes(t.id)));

            // Resolve Reserve Intercepts with path analysis
            const allIntercepts: any[] = [];

            // 1. Candidate Source: Resting Drivers or Extensible Drivers at the origin station.
            // (We EXCLUDE the actual driver of the train as they are the ones missing in this scenario)
            const candidateMap = new Map<string, any>();

            // 2. Resting Drivers who are at End of Shift
            processedResting.forEach(t => {
                // Exclude the missing driver (mainDriverShiftId)
                if (t.isEndOfShift && t.id !== mainDriverShiftId) {
                    if (!candidateMap.has(t.id)) candidateMap.set(t.id, t);
                }
            });

            // 3. Extensible Drivers (who finished their duty)
            extensibleResults.forEach(t => {
                // Exclude the missing driver (mainDriverShiftId)
                if (t.id !== mainDriverShiftId) {
                    if (!candidateMap.has(t.id)) candidateMap.set(t.id, t);
                }
            });

            const candidatesForIntercept: any[] = Array.from(candidateMap.values());

            candidatesForIntercept.forEach(t => {
                const sInici = getFgcMinutes(t.inici_torn) || 0;
                const realId = t.drivers?.[0]?.realTornId || t.id;
                const targetStation = getTargetEndStation(t.id) || t.dependencia;

                const interceptOptions: any[] = [];

                // Use robust line detection 
                const liniaType = mainLiniaForFilter(searchedCirc.linia);
                const isTerrassaLine = liniaType === 'S1' || searchedCirc.id.startsWith('D');
                const isSabadellLine = liniaType === 'S2' || searchedCirc.id.startsWith('F');

                const scheduledStops = (searchedCirc.estacions as any[]) || [];

                // Iterate through the path to find potential relief points
                for (let i = 0; i < path.length; i++) {
                    const st = path[i];

                    // Get real scheduled time if available, otherwise estimate
                    const scheduledStop = scheduledStops.find(s => resolveStationId(s.nom) === resolveStationId(st));
                    const arrivalAtSt = scheduledStop ? (getFgcMinutes(scheduledStop.hora) || 0) : (sortidaMin + getTravelTime(depOrigen, st));
                    const interceptDisplayTime = scheduledStop ? (scheduledStop.hora || '').substring(0, 5) : formatFgcTime(arrivalAtSt);

                    const returnHomeTime = getTravelTime(st, targetStation); // Time for original driver to return home from relief point

                    const theoreticalEndMin = getFgcMinutes(t.final_torn) || 0;
                    const absoluteLimitMin = theoreticalEndMin + 45;
                    // We'll calculate the actual arrival after finding the return circs

                    // Filter by Line Logic
                    let allowDirect = true;
                    // For D lines: SR and RB are direct intercept points.
                    // For F lines: SR is a direct intercept point. (SC is handled as travel intercept)
                    if (isTerrassaLine && (st !== 'RB' && st !== 'SR')) allowDirect = false;
                    if (isSabadellLine && (st !== 'SR')) allowDirect = false;

                    if (allowDirect && Object.values(RESERVE_MAP).includes(st)) {
                        const reserveTurnId = findReserveForStation(st, arrivalAtSt);
                        if (reserveTurnId) {
                            const returnStart = arribadaMin + 2;
                            const returnCirc = findReturnOption(depFinal, st, returnStart);

                            const drvReturnStart = arrivalAtSt + 5;
                            const drvReturnCirc = findReturnOption(st, targetStation, drvReturnStart);

                            // PRECISION CALCULATION: Actual arrival + 7 min buffer
                            const arrivalTime = drvReturnCirc ? (getFgcMinutes(drvReturnCirc.end) || 0) : (arrivalAtSt + getTravelTime(st, targetStation));
                            const effectiveEnding = arrivalTime + 7;

                            interceptOptions.push({
                                type: 'direct',
                                station: st,
                                reserveId: reserveTurnId,
                                interceptTime: interceptDisplayTime,
                                reserveBase: st,
                                margin: absoluteLimitMin - effectiveEnding,
                                isOverLimit: effectiveEnding > absoluteLimitMin,
                                actualEndTime: formatFgcTime(effectiveEnding),
                                returnCirc,
                                driverReturnCirc: drvReturnCirc
                            });
                        }
                    }

                    // Option 2: Reserve from RB for relief at SC (Applies to both lines if they stop at SC)
                    if (st === 'SC') {
                        const travelFromRB = getTravelTime('RB', 'SC');
                        const neededAtRB = arrivalAtSt - travelFromRB - 5; // 5 min buffer
                        const reserveTurnId = findReserveForStation('RB', neededAtRB);

                        if (reserveTurnId) {
                            const returnStart = arribadaMin + 2;
                            const returnCirc = findReturnOption(depFinal, 'RB', returnStart);

                            const drvReturnStart = arrivalAtSt + 5;
                            const drvReturnCirc = findReturnOption('SC', targetStation, drvReturnStart);

                            // PRECISION CALCULATION: Actual arrival + 7 min buffer
                            const arrivalTime = drvReturnCirc ? (getFgcMinutes(drvReturnCirc.end) || 0) : (arrivalAtSt + getTravelTime('SC', targetStation));
                            const effectiveEnding = arrivalTime + 7;

                            interceptOptions.push({
                                type: 'travel',
                                station: 'SC',
                                reserveId: reserveTurnId,
                                interceptTime: interceptDisplayTime,
                                reserveBase: 'RB',
                                travelFrom: 'RB',
                                travelTime: travelFromRB,
                                margin: absoluteLimitMin - effectiveEnding,
                                isOverLimit: effectiveEnding > absoluteLimitMin,
                                actualEndTime: formatFgcTime(effectiveEnding),
                                returnCirc,
                                driverReturnCirc: drvReturnCirc
                            });
                        }
                    }
                }

                if (interceptOptions.length > 0) {
                    allIntercepts.push({
                        ...t,
                        id: realId,
                        resOptions: interceptOptions
                    });
                }
            });

            setReserveInterceptResults(allIntercepts);
        } catch (e) {
            console.error(e);
            showToast('Error cercant circulació', 'error');
        } finally {
            setLoading(false);
        }
    };

    return {
        query, setQuery, loading, searchedCircData, mainDriverInfo,
        passengerResults, adjacentResults, restingResults, extensibleResults,
        reserveInterceptResults, handleSearchCirculation,
        setMainDriverInfo, setSearchedCircData,
        setPassengerResults, setAdjacentResults,
        setRestingResults, setExtensibleResults,
        setReserveInterceptResults
    };
};
