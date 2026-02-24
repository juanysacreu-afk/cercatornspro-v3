import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { getServiceToday } from '../../../utils/serviceCalendar';
import { getFgcMinutes, getShortTornId, isServiceVisible, resolveStationId, mainLiniaForFilter } from '../../../utils/stations';

// ── Types ──────────────────────────────────────────────
export interface DashboardKPIs {
    serviceCoverage: number;
    planningCoverage: number;
    activeTrains: number;
    scheduledTrains: number;
    totalPersonnel: number;
    assignedPersonnel: number;
    activePersonnel: number;
    reserveAvailable: number;
    availableTrainUnits: number;
    brokenTrainUnits: number;
    totalTrainUnits: number;
}

export interface PersonnelAlert {
    id: string;
    type: 'missing' | 'conflict' | 'broken_assigned' | 'late' | 'upcoming';
    severity: 'critical' | 'warning' | 'info';
    title: string;
    subtitle: string;
    tornId?: string;
    nomina?: string;
    startsInMin?: number; // F2: minutes until shift starts
}

export interface ReserveSlot {
    station: string;
    stationLabel: string;
    count: number;
    personnel: { nom: string; cognoms: string; torn: string; isActive?: boolean; isBusy?: boolean }[];
    // F4 – assignment history
    assignmentHistory?: Record<string, string[]>;
    previousAssignments?: { nom: string; cognoms: string; torn: string }[];
}

export interface LineStatus {
    linia: string;
    color: string;
    activeCirculations: number;
    totalCirculations: number;
    coveragePercent: number;
    shifts?: string[]; // V2 – shift IDs on this line
}

// ── Hook ───────────────────────────────────────────────
export function useDashboardData() {
    const [loading, setLoading] = useState(true);
    const [kpis, setKpis] = useState<DashboardKPIs>({
        serviceCoverage: 0, planningCoverage: 0, activeTrains: 0, scheduledTrains: 0,
        totalPersonnel: 0, assignedPersonnel: 0, activePersonnel: 0, reserveAvailable: 0,
        availableTrainUnits: 0, brokenTrainUnits: 0, totalTrainUnits: 0
    });
    const [alerts, setAlerts] = useState<PersonnelAlert[]>([]);
    const [reserves, setReserves] = useState<ReserveSlot[]>([]);
    const [lineStatuses, setLineStatuses] = useState<LineStatus[]>([]);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    // V4 – seconds since refresh
    const [secondsSinceRefresh, setSecondsSinceRefresh] = useState(0);
    const [nowMin, setNowMin] = useState(0);
    const serviceToday = getServiceToday();
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const realtimeConnectedRef = useRef(false);

    // Live clock
    useEffect(() => {
        const tick = () => {
            const now = new Date();
            const h = now.getHours();
            const m = now.getMinutes();
            setNowMin((h < 4 ? h + 24 : h) * 60 + m);
        };
        tick();
        const id = setInterval(tick, 30000);
        return () => clearInterval(id);
    }, []);

    // V4 – "Actualitzat fa Xs" — ticks every second
    useEffect(() => {
        const id = setInterval(() => {
            setSecondsSinceRefresh(prev => prev + 1);
        }, 1000);
        return () => clearInterval(id);
    }, []);

    // Reset counter when data refreshes
    useEffect(() => {
        setSecondsSinceRefresh(0);
    }, [lastRefresh]);

    const fetchData = useCallback(async () => {
        try {
            // Independent fetches to prevent one failure from crashing the entire dashboard
            let shiftsRes: { data: any[] | null } = { data: [] };
            try {
                const res = await supabase.from('shifts').select('id, servei, inici_torn, final_torn, dependencia, circulations');
                if (res.error) console.error('[Dashboard] Error fetching shifts:', res.error);
                else shiftsRes = res;
            } catch (e) { console.error('[Dashboard] Unexpected error fetching shifts:', e); }

            let assignmentsRes: { data: any[] | null } = { data: [] };
            try {
                const res = await supabase.from('daily_assignments').select('*');
                if (res.error) console.error('[Dashboard] Error fetching assignments:', res.error);
                else assignmentsRes = res;
            } catch (e) { console.error('[Dashboard] Unexpected error fetching assignments:', e); }

            let parkedRes: { data: any[] | null } = { data: [] };
            try {
                const res = await supabase.from('parked_units').select('*');
                if (res.error) console.error('[Dashboard] Error fetching parked_units:', res.error);
                else parkedRes = res;
            } catch (e) { console.error('[Dashboard] Unexpected error fetching parked_units:', e); }

            let brokenRes: { data: any[] | null } = { data: [] };
            try {
                const res = await supabase.from('train_status').select('*');
                if (res.error) console.error('[Dashboard] Error fetching train_status:', res.error);
                else brokenRes = res;
            } catch (e) { console.error('[Dashboard] Unexpected error fetching train_status:', e); }

            let circsRes: { data: any[] | null } = { data: [] };
            try {
                const res = await supabase.from('circulations').select('id, codi, sortida, arribada');
                if (res.error) console.warn('[Dashboard] Optional circulations fetch failed:', res.error);
                else circsRes = res;
            } catch (e) { console.warn('Failed to fetch circulations', e); }

            // C2 – build circMap once (no re-creation on each render)
            const circMap = new Map<string, { start: number; end: number }>();
            (circsRes.data || []).forEach((c: any) => {
                const s = getFgcMinutes(c.sortida);
                const e = getFgcMinutes(c.arribada);
                if (s !== null && e !== null) {
                    circMap.set(c.id, { start: s, end: e });
                    circMap.set(c.codi, { start: s, end: e });
                }
            });

            const shifts = (shiftsRes.data || []).filter(s =>
                isServiceVisible(s.servei, serviceToday) ||
                (s.id && s.id.toUpperCase().startsWith('QR'))
            );
            const assignments = assignmentsRes.data || [];
            const fleetStatus = brokenRes.data || [];

            const now = new Date();
            const h = now.getHours();
            const m = now.getMinutes();
            const currentMin = (h < 4 ? h + 24 : h) * 60 + m;

            // ── Active Shifts ──
            const activeShifts = shifts.filter(s => {
                const sMin = getFgcMinutes(s.inici_torn);
                let eMin = getFgcMinutes(s.final_torn);
                if (sMin !== null && eMin !== null) {
                    if (eMin < sMin) eMin += 1440;
                    return currentMin >= sMin && currentMin <= eMin;
                }
                return false;
            });

            const assignedTornsGlobal = new Set(assignments.map((a: any) => a.torn));
            const currentActiveCircIds = new Set<string>();
            const currentScheduledCircIds = new Set<string>();

            // C2 – memoized helper for circulation time resolution
            const resolveCircTimes = (c: any): { start: number | null; end: number | null } => {
                if (typeof c === 'object' && c.sortida && c.arribada) {
                    return { start: getFgcMinutes(c.sortida), end: getFgcMinutes(c.arribada) };
                }
                if (typeof c === 'string' && circMap.has(c)) {
                    const t = circMap.get(c)!;
                    return { start: t.start, end: t.end };
                }
                if (typeof c === 'object' && c.id && circMap.has(c.id)) {
                    const t = circMap.get(c.id)!;
                    return { start: t.start, end: t.end };
                }
                return { start: null, end: null };
            };

            shifts.forEach(s => {
                const shiftHasDriver = assignedTornsGlobal.has(getShortTornId(s.id)) || assignedTornsGlobal.has(s.id);
                ((s.circulations as any[]) || []).forEach(c => {
                    const codi = typeof c === 'string' ? c : c?.codi;
                    if (!codi || codi === 'Viatger') return;
                    const { start, end } = resolveCircTimes(c);
                    if (start !== null && end !== null) {
                        const adjEnd = end < start ? end + 1440 : end;
                        if (currentMin >= start && currentMin <= adjEnd) {
                            currentScheduledCircIds.add(codi);
                            if (shiftHasDriver) currentActiveCircIds.add(codi);
                        }
                    }
                });
            });

            const scheduledNow = currentScheduledCircIds.size;
            const activeNow = currentActiveCircIds.size;
            const coverage = scheduledNow > 0 ? Math.round((activeNow / scheduledNow) * 100) : 100;

            // ── Personnel ──
            const activeAssignments = assignments.filter((a: any) => {
                let start = getFgcMinutes(a.hora_inici);
                let end = getFgcMinutes(a.hora_fi);
                if (start === null || end === null) {
                    const shift = shifts.find(s => getShortTornId(s.id) === a.torn || s.id === a.torn);
                    if (shift) {
                        start = getFgcMinutes(shift.inici_torn);
                        end = getFgcMinutes(shift.final_torn);
                    }
                }
                if (start !== null && end !== null) {
                    if (end < start) end += 1440;
                    return currentMin >= start && currentMin <= end;
                }
                return false;
            });

            // ── Reserves ──
            const RESERVE_STATIONS: Record<string, string> = {
                'PC': 'Pl. Catalunya', 'SR': 'Sarrià', 'RB': 'Rubí',
                'NA': 'Nacions Unides', 'NO': 'Sabadell', 'EN': 'Terrassa',
                'XX': 'Sense Ubicació'
            };
            const reserveSlotsMap = new Map<string, { label: string; personnel: any[] }>();
            Object.entries(RESERVE_STATIONS).forEach(([k, v]) => reserveSlotsMap.set(k, { label: v, personnel: [] }));

            // F4 – track ALL reserve assignments of the day (not just active)
            const allReserveAssignments: any[] = [];
            assignments.forEach((a: any) => {
                const tornId = a.torn.toUpperCase();
                if (tornId.startsWith('QR')) allReserveAssignments.push(a);
            });

            activeAssignments.forEach((a: any) => {
                const tornId = a.torn.toUpperCase();
                if (!tornId.startsWith('QR')) return;
                const shiftMeta = shifts.find(s => getShortTornId(s.id) === a.torn || s.id === a.torn);
                let stationCode = shiftMeta?.dependencia ? resolveStationId(shiftMeta.dependencia) : '';
                if (!stationCode || !RESERVE_STATIONS[stationCode]) {
                    if (tornId.startsWith('QRP')) stationCode = 'PC';
                    else if (tornId.startsWith('QRS')) stationCode = 'SR';
                    else if (tornId.startsWith('QRR')) stationCode = 'RB';
                    else if (tornId.startsWith('QRN')) stationCode = 'NA';
                    else if (tornId.startsWith('QRF')) stationCode = 'NO';
                    else if (tornId.startsWith('QRT')) stationCode = 'EN';
                    else stationCode = 'XX';
                }
                if (reserveSlotsMap.has(stationCode)) {
                    const isBusy = !!(a.observacions && a.observacions.toUpperCase().includes('COBREIX'));
                    reserveSlotsMap.get(stationCode)?.personnel.push({
                        nom: a.nom,
                        cognoms: a.cognoms,
                        torn: a.torn,
                        isActive: true,
                        isBusy
                    });
                }
            });

            const reserveSlots: ReserveSlot[] = [];
            reserveSlotsMap.forEach((val, key) => {
                if (val.personnel.length > 0 && key !== 'XX') {
                    // F4 – build previous (non-active) reserve assignments for the station
                    const previousAssignments = allReserveAssignments
                        .filter(a => {
                            const activeNames = val.personnel.map(p => p.torn);
                            return !activeNames.includes(a.torn);
                        })
                        .map(a => ({ nom: a.nom, cognoms: a.cognoms, torn: a.torn }))
                        .slice(0, 5); // max 5

                    reserveSlots.push({
                        station: key,
                        stationLabel: val.label,
                        count: val.personnel.filter(p => !p.isBusy).length,
                        personnel: val.personnel,
                        previousAssignments: previousAssignments.length > 0 ? previousAssignments : undefined
                    });
                }
            });

            // ── Fleet ──
            const brokenTrains = fleetStatus.filter((f: any) => f.is_broken === true);
            const totalFleet = 61;
            const brokenCount = brokenTrains.length;

            // ── Line Statuses ──
            const LINE_DEFS: { linia: string; color: string }[] = [
                { linia: 'L6', color: '#7C73B4' },
                { linia: 'L7', color: '#9D4900' },
                { linia: 'L12', color: '#C3BDE0' },
                { linia: 'S1', color: '#E46608' },
                { linia: 'S2', color: '#80B134' },
            ];

            const lineStats: LineStatus[] = LINE_DEFS.map(({ linia, color }) => {
                let total = 0;
                let active = 0;
                const shiftIdsOnLine: string[] = [];

                shifts.forEach(s => {
                    ((s.circulations as any[]) || []).forEach(c => {
                        const codi = typeof c === 'object' ? (c.codi || '') : c;
                        let cLiniaRaw = typeof c === 'object' ? (c.linia || '') : '';
                        if (!cLiniaRaw && codi) cLiniaRaw = codi;
                        const cLinia = mainLiniaForFilter(cLiniaRaw);
                        if (cLinia === linia.toUpperCase() && codi !== 'Viatger') {
                            total++;
                            const { start, end } = resolveCircTimes(c);
                            if (start !== null && end !== null) {
                                const adjEnd = end < start ? end + 1440 : end;
                                if (currentMin >= start && currentMin <= adjEnd) {
                                    active++;
                                    // V2 – collect shift IDs for tooltip
                                    const shortId = getShortTornId(s.id);
                                    if (!shiftIdsOnLine.includes(shortId)) shiftIdsOnLine.push(shortId);
                                }
                            }
                        }
                    });
                });

                return {
                    linia, color,
                    activeCirculations: active,
                    totalCirculations: total,
                    coveragePercent: total > 0 ? Math.round((active / total) * 100) : 0,
                    shifts: shiftIdsOnLine // V2
                };
            }).filter(ls => ls.totalCirculations > 0);

            // ── Alerts (C2: computed inline, no redundant filters) ──
            const alertList: PersonnelAlert[] = [];

            shifts.forEach(s => {
                const shortId = getShortTornId(s.id);
                // Check if assigned to driver directly OR if another driver's observation covers it
                const explicitCover = assignments.find((a: any) => {
                    if (!a.observacions) return false;
                    const obs = a.observacions.toUpperCase();
                    return obs.includes(`COBREIX ${shortId}`) || obs.includes(`COBREIX ${s.id.toUpperCase()}`);
                });

                const assignment = assignments.find((a: any) => a.torn === shortId || a.torn === s.id);

                // A shift is NOT missing if it has a driver OR an explicit cover
                const hasRealAssignment = !!assignment || !!explicitCover;
                const isManuallyUncovered = assignment?.incident_start_time === '00:00';

                if (!hasRealAssignment || isManuallyUncovered) {
                    const sMin = getFgcMinutes(s.inici_torn);
                    const eMinRaw = getFgcMinutes(s.final_torn);
                    const eMin = eMinRaw !== null && sMin !== null && eMinRaw < sMin ? eMinRaw + 1440 : eMinRaw;
                    const isActive = sMin !== null && eMin !== null && currentMin >= sMin && currentMin <= eMin;
                    const minutesUntilStart = sMin !== null ? sMin - currentMin : null;
                    // F2 – upcoming: starts in next 2 hours
                    const isUpcoming = minutesUntilStart !== null && minutesUntilStart > 0 && minutesUntilStart <= 120;

                    alertList.push({
                        id: `missing-${s.id}`,
                        type: isUpcoming ? 'upcoming' : 'missing',
                        severity: isActive ? 'critical' : (isUpcoming ? 'warning' : 'info'),
                        title: `Torn ${s.id} SENSE MAQUINISTA`,
                        subtitle: `${isManuallyUncovered ? '⚠️ MARCAT COM DESCOBERT' : (isActive ? '🔴 ACTIU ARA' : (isUpcoming ? `🟠 COMENÇA EN ${Math.round(minutesUntilStart!)}min` : '⚪ PROGRAMAT'))} | Dep: ${s.dependencia} | ${s.inici_torn}-${s.final_torn}`,
                        tornId: s.id,
                        startsInMin: minutesUntilStart ?? undefined
                    });
                }
            });

            // Indispositions and Reserve Warnings
            assignments.forEach((a: any) => {
                const absType = (a.abs_parc_c || '').toUpperCase();
                const isManuallyIndisposed = a.incident_start_time && a.incident_start_time !== '00:00';
                const hasAbsenceCode = absType.includes('DIS') || absType.includes('DES') || absType.includes('VAC');
                const tornId = a.torn.toUpperCase();

                if (isManuallyIndisposed || hasAbsenceCode) {
                    alertList.push({
                        id: `conflict-${a.id}`,
                        type: 'conflict',
                        severity: 'warning',
                        title: `${a.cognoms}, ${a.nom} — ${isManuallyIndisposed ? 'INDISPOSICIÓ' : absType}`,
                        subtitle: `Torn: ${a.torn} ${isManuallyIndisposed ? `| Des de les ${a.incident_start_time}` : ''}`,
                        tornId: a.torn,
                        nomina: a.empleat_id
                    });
                }

                // Reserve exhaustion warning: if a reserve shift (QR*) is covering another shift
                if (tornId.startsWith('QR') && a.observacions && a.observacions.toUpperCase().includes('COBREIX')) {
                    const match = a.observacions.toUpperCase().match(/COBREIX\s+([A-Z0-9]+)/);
                    const target = match ? match[1] : 'altre torn';
                    alertList.push({
                        id: `reserve-exhausted-${a.id}`,
                        type: 'conflict',
                        severity: 'info',
                        title: `RESERVA OCUPADA: ${tornId}`,
                        subtitle: `${a.cognoms} ha sortit per cobrir ${target}`,
                        tornId: a.torn
                    });
                }
            });

            // C2 – sort once
            alertList.sort((a, b) => {
                const order = { critical: 0, warning: 1, info: 2 };
                return order[a.severity] - order[b.severity];
            });

            // ── KPIs ──
            const totalShiftsToday = shifts.length;
            const assignedShiftsTodayCount = shifts.filter(s => {
                const shortId = getShortTornId(s.id);
                const hasDriver = assignments.some((a: any) => a.torn === shortId || a.torn === s.id);
                const isCovered = assignments.some((a: any) => {
                    if (!a.observacions) return false;
                    const obs = a.observacions.toUpperCase();
                    return obs.includes(`COBREIX ${shortId}`) || obs.includes(`COBREIX ${s.id.toUpperCase()}`);
                });
                return hasDriver || isCovered;
            }).length;
            const planningCov = totalShiftsToday > 0 ? Math.round((assignedShiftsTodayCount / totalShiftsToday) * 100) : 100;

            setKpis({
                serviceCoverage: coverage,
                planningCoverage: planningCov,
                activeTrains: activeNow,
                scheduledTrains: scheduledNow,
                totalPersonnel: totalShiftsToday,
                assignedPersonnel: assignedShiftsTodayCount,
                activePersonnel: activeAssignments.length,
                reserveAvailable: reserveSlots.reduce((sum, r) => sum + r.count, 0),
                availableTrainUnits: totalFleet - brokenCount,
                brokenTrainUnits: brokenCount,
                totalTrainUnits: totalFleet
            });
            setAlerts(alertList);
            setReserves(reserveSlots);
            setLineStatuses(lineStats);
            setLastRefresh(new Date());
        } catch (err) {
            console.error('[Dashboard] Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    }, [serviceToday]);

    // Initial fetch + manual auto-refresh every 60s (F1 Realtime handles frequent updates)
    useEffect(() => {
        fetchData();
        intervalRef.current = setInterval(fetchData, 60000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [fetchData]);

    // F1 – Supabase Realtime subscription
    useEffect(() => {
        if (realtimeConnectedRef.current) return;
        realtimeConnectedRef.current = true;

        const channel = supabase
            .channel('dashboard-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'daily_assignments' },
                (payload) => {
                    console.log('[Dashboard] Realtime: daily_assignments changed', payload.eventType);
                    fetchData();
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'train_status' },
                (payload) => {
                    console.log('[Dashboard] Realtime: train_status changed', payload.eventType);
                    fetchData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            realtimeConnectedRef.current = false;
        };
    }, [fetchData]);

    // C2 – derived alert counts, memoized
    const criticalAlerts = useMemo(() => alerts.filter(a => a.severity === 'critical'), [alerts]);
    const warningAlerts = useMemo(() => alerts.filter(a => a.severity !== 'critical'), [alerts]);
    // F2 – alerts for upcoming unassigned shifts (next 2h)
    const upcomingAlerts = useMemo(() =>
        alerts.filter(a => a.type === 'upcoming' && a.startsInMin !== undefined && a.startsInMin > 0),
        [alerts]
    );

    // V4 – human readable "fa Xs / Xmin"
    const lastRefreshLabel = useMemo(() => {
        if (secondsSinceRefresh < 10) return 'ara mateix';
        if (secondsSinceRefresh < 60) return `fa ${secondsSinceRefresh}s`;
        const mins = Math.floor(secondsSinceRefresh / 60);
        return `fa ${mins}min`;
    }, [secondsSinceRefresh]);

    return {
        loading, kpis, alerts, criticalAlerts, warningAlerts, upcomingAlerts,
        reserves, lineStatuses, lastRefresh, lastRefreshLabel,
        nowMin, serviceToday, refresh: fetchData
    };
}
