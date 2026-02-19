import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../supabaseClient';
import { getServiceToday } from '../../../utils/serviceCalendar';
import { getFgcMinutes, getShortTornId, isServiceVisible, resolveStationId } from '../../../utils/stations';

// ── Types ──────────────────────────────────────────────
export interface DashboardKPIs {
    serviceCoverage: number;       // 0-100 % (Live)
    planningCoverage: number;      // 0-100 % (Daily total)
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
    type: 'missing' | 'conflict' | 'broken_assigned' | 'late';
    severity: 'critical' | 'warning' | 'info';
    title: string;
    subtitle: string;
    tornId?: string;
    nomina?: string;
}

export interface ReserveSlot {
    station: string;
    stationLabel: string;
    count: number;
    personnel: { nom: string; cognoms: string; torn: string }[];
}

export interface LineStatus {
    linia: string;
    color: string;
    activeCirculations: number;
    totalCirculations: number;
    coveragePercent: number;
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
    const [nowMin, setNowMin] = useState(0);
    const serviceToday = getServiceToday();
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    const fetchData = useCallback(async () => {
        try {
            // Independent fetches to prevent one failure from crashing the entire dashboard

            // 1. Shifts (Core)
            let shiftsRes: { data: any[] | null } = { data: [] };
            try {
                const res = await supabase.from('shifts').select('id, servei, inici_torn, final_torn, dependencia, circulations');
                if (res.error) console.error('[Dashboard] Error fetching shifts:', res.error);
                else shiftsRes = res;
            } catch (e) {
                console.error('[Dashboard] Unexpected error fetching shifts:', e);
            }

            // 2. Assignments (Core)
            let assignmentsRes: { data: any[] | null } = { data: [] };
            try {
                const res = await supabase.from('daily_assignments').select('*');
                if (res.error) console.error('[Dashboard] Error fetching assignments:', res.error);
                else assignmentsRes = res;
            } catch (e) {
                console.error('[Dashboard] Unexpected error fetching assignments:', e);
            }

            // 3. Parked Units (Optional)
            let parkedRes: { data: any[] | null } = { data: [] };
            try {
                const res = await supabase.from('parked_units').select('*');
                if (res.error) console.error('[Dashboard] Error fetching parked_units:', res.error);
                else parkedRes = res;
            } catch (e) {
                console.error('[Dashboard] Unexpected error fetching parked_units:', e);
            }

            // 4. Fleet Status (Optional)
            let brokenRes: { data: any[] | null } = { data: [] };
            try {
                const res = await supabase.from('train_status').select('*');
                if (res.error) console.error('[Dashboard] Error fetching train_status:', res.error);
                else brokenRes = res;
            } catch (e) {
                console.error('[Dashboard] Unexpected error fetching train_status:', e);
            }

            // 5. Circulations (Optional lookup)
            let circsRes: { data: any[] | null } = { data: [] };
            try {
                const res = await supabase.from('circulations').select('id, codi, sortida, arribada');
                if (res.error) console.warn('[Dashboard] Optional circulations fetch failed:', res.error);
                else circsRes = res;
            } catch (e) {
                console.warn('Failed to fetch circulations, continuing without extra data', e);
            }

            // Create timestamp lookup map for circulations
            const circMap = new Map<string, { start: number, end: number }>();
            (circsRes.data || []).forEach((c: any) => {
                const s = getFgcMinutes(c.sortida);
                const e = getFgcMinutes(c.arribada);
                if (s !== null && e !== null) {
                    circMap.set(c.id, { start: s, end: e }); // Map by UUID
                    circMap.set(c.codi, { start: s, end: e }); // Map by Code (fallback)
                }
            });

            const shifts = (shiftsRes.data || []).filter(s =>
                isServiceVisible(s.servei, serviceToday) ||
                (s.id && s.id.toUpperCase().startsWith('QR'))
            );
            const assignments = assignmentsRes.data || [];
            const parkedUnits = parkedRes.data || [];
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
                    if (eMin < sMin) eMin += 1440; // Handle overnight shifts
                    return currentMin >= sMin && currentMin <= eMin;
                }
                return false;
            });

            // ── Account for Driver Assignments in Coverage ──
            const assignedTornsGlobal = new Set(assignments.map(a => a.torn));
            const currentActiveCircIds = new Set<string>();
            const currentScheduledCircIds = new Set<string>();

            shifts.forEach(s => {
                const shiftHasDriver = assignedTornsGlobal.has(getShortTornId(s.id)) || assignedTornsGlobal.has(s.id);

                ((s.circulations as any[]) || []).forEach(c => {
                    const codi = typeof c === 'string' ? c : c?.codi;
                    if (codi && codi !== 'Viatger') {
                        // Resolve Start/End times
                        let start: number | null = null;
                        let end: number | null = null;

                        if (typeof c === 'object' && c.sortida && c.arribada) {
                            start = getFgcMinutes(c.sortida);
                            end = getFgcMinutes(c.arribada);
                        } else if (typeof c === 'string' && circMap.has(c)) {
                            const times = circMap.get(c);
                            if (times) { start = times.start; end = times.end; }
                        } else if (typeof c === 'object' && c.id && circMap.has(c.id)) {
                            const times = circMap.get(c.id);
                            if (times) { start = times.start; end = times.end; }
                        }

                        if (start !== null && end !== null) {
                            if (end < start) end += 1440;
                            if (currentMin >= start && currentMin <= end) {
                                currentScheduledCircIds.add(codi);
                                if (shiftHasDriver) {
                                    currentActiveCircIds.add(codi);
                                }
                            }
                        }
                    }
                });
            });

            const scheduledNow = currentScheduledCircIds.size;
            const activeNow = currentActiveCircIds.size;
            const coverage = scheduledNow > 0 ? Math.round((activeNow / scheduledNow) * 100) : 100;

            // Update semantic mapping for UI
            // activeTrains: The number displayed as big number
            // scheduledTrains: The number displayed in subtitle "X de Y"

            // ── Personnel ──
            // ── Personnel ──
            const assignedTorns = new Set(assignments.map(a => a.torn));
            const activeAssignments = assignments.filter(a => {
                // Priority: Use assignment specific times if available, otherwise fallback to shift def
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
            // ── Reserves ──
            const RESERVE_STATIONS: Record<string, string> = {
                'PC': 'Pl. Catalunya', 'SR': 'Sarrià', 'RB': 'Rubí',
                'NA': 'Nacions Unides', 'NO': 'Sabadell', 'EN': 'Terrassa',
                'XX': 'Sense Ubicació'
            };
            const reserveSlotsMap = new Map<string, { label: string, personnel: any[] }>();

            // Initialize map
            Object.entries(RESERVE_STATIONS).forEach(([k, v]) => reserveSlotsMap.set(k, { label: v, personnel: [] }));

            // Iterate ASSIGNMENTS first (Source of Truth for "Who works now")
            activeAssignments.forEach(a => {
                const tornId = a.torn.toUpperCase();
                if (!tornId.startsWith('QR')) return;

                // Find Shift Metadata for location
                const shiftMeta = shifts.find(s => getShortTornId(s.id) === a.torn || s.id === a.torn);
                let stationCode = shiftMeta?.dependencia ? resolveStationId(shiftMeta.dependencia) : '';

                // Fallback: Infer station from ID if metadata missing or unresolved
                // User: QRP=PC, QRS=SR, QRR=RB, QRN=NA (Nacions), QRF=Sabadell (NO or similar), QRT=Terrassa(EN)
                if (!stationCode || !RESERVE_STATIONS[stationCode]) {
                    if (tornId.startsWith('QRP')) stationCode = 'PC';
                    else if (tornId.startsWith('QRS')) stationCode = 'SR';
                    else if (tornId.startsWith('QRR')) stationCode = 'RB';
                    else if (tornId.startsWith('QRN')) stationCode = 'NA';
                    else if (tornId.startsWith('QRF')) stationCode = 'NO'; // Sabadell
                    else if (tornId.startsWith('QRT')) stationCode = 'EN'; // Terrassa (Guessing QRT prefix exists for Terrassa if QRF is Sabadell?)
                    else stationCode = 'XX';
                }

                if (reserveSlotsMap.has(stationCode)) {
                    reserveSlotsMap.get(stationCode)?.personnel.push({
                        nom: a.nom,
                        cognoms: a.cognoms,
                        torn: a.torn
                    });
                } else if (shiftMeta?.dependencia) {
                    // If we resolved a station code but it wasn't in our predefined list, add it dynamically?
                    // For now, only track the main reserve stations as per UI requirements.
                }
            });

            // Convert map to array
            const reserveSlots: ReserveSlot[] = [];
            reserveSlotsMap.forEach((val, key) => {
                if (val.personnel.length > 0 && key !== 'XX') {
                    reserveSlots.push({ station: key, stationLabel: val.label, count: val.personnel.length, personnel: val.personnel });
                }
            });

            // ── Fleet ──
            const brokenTrains = fleetStatus.filter((f: any) => f.is_broken === true);
            const totalFleet = 61; // FGC fleet size constant (22+19+5+15)
            const brokenCount = brokenTrains.length;

            // ── Line Statuses ──
            const LINE_DEFS: { linia: string; color: string }[] = [
                { linia: 'S1', color: '#E8432D' },
                { linia: 'S2', color: '#1B79C9' },
                { linia: 'L6', color: '#9C56B4' },
                { linia: 'L7', color: '#D4881F' },
                { linia: 'L12', color: '#A8D017' },
                { linia: 'S3', color: '#E8432D' },
                { linia: 'S4', color: '#1B79C9' },
                { linia: 'S8', color: '#E8432D' },
                { linia: 'S9', color: '#1B79C9' },
                { linia: 'R5', color: '#1B79C9' },
                { linia: 'R6', color: '#E8432D' },
                { linia: 'R50', color: '#1B79C9' },
                { linia: 'R60', color: '#E8432D' },
                { linia: 'RL1', color: '#00A650' },
                { linia: 'RL2', color: '#FF6600' },
                { linia: 'RL3', color: '#9C56B4' },
                { linia: 'RL4', color: '#FFC726' },
            ];

            const lineStats: LineStatus[] = LINE_DEFS.map(({ linia, color }) => {
                let total = 0;
                let active = 0;
                shifts.forEach(s => {
                    ((s.circulations as any[]) || []).forEach(c => {
                        const cLinia = typeof c === 'object' ? (c.linia || '') : '';
                        const codi = typeof c === 'object' ? (c.codi || '') : c;
                        if (cLinia.toUpperCase() === linia.toUpperCase() && codi !== 'Viatger') {
                            total++;
                            const sortida = typeof c === 'object' ? getFgcMinutes(c.sortida || '') : null;
                            const arribada = typeof c === 'object' ? getFgcMinutes(c.arribada || '') : null;
                            if (sortida !== null && arribada !== null && currentMin >= sortida && currentMin <= arribada) {
                                active++;
                            }
                        }
                    });
                });
                return {
                    linia, color, activeCirculations: active, totalCirculations: total,
                    coveragePercent: total > 0 ? Math.round((active / total) * 100) : 0
                };
            }).filter(ls => ls.totalCirculations > 0);

            // ── Alerts ──
            const alertList: PersonnelAlert[] = [];

            // Missing assignments: Detect ALL uncovered shifts for the day
            shifts.forEach(s => {
                const shortId = getShortTornId(s.id);
                const hasAssignment = assignedTornsGlobal.has(shortId) || assignedTornsGlobal.has(s.id);

                if (!hasAssignment) {
                    const sMin = getFgcMinutes(s.inici_torn);
                    const eMin = getFgcMinutes(s.final_torn);
                    const isActive = sMin !== null && currentMin >= sMin && currentMin <= (eMin! < sMin! ? eMin! + 1440 : eMin!);
                    const isUpcoming = sMin !== null && sMin > currentMin && sMin < currentMin + 120; // Starts in next 2 hours

                    alertList.push({
                        id: `missing-${s.id}`,
                        type: 'missing',
                        severity: isActive ? 'critical' : (isUpcoming ? 'warning' : 'info'),
                        title: `Torn ${s.id} SENSE MAQUINISTA`,
                        subtitle: `${isActive ? '🔴 ACTIU ARA' : (isUpcoming ? '🟠 PROXIMAMENT' : '⚪ PROGRAMAT')} | Dep: ${s.dependencia} | ${s.inici_torn}-${s.final_torn}`,
                        tornId: s.id
                    });
                }
            });

            // DIS/DES personnel conflicts  
            assignments.forEach(a => {
                const absType = (a.abs_parc_c || '').toUpperCase();
                if (absType.includes('DIS') || absType.includes('DES')) {
                    alertList.push({
                        id: `conflict-${a.id}`,
                        type: 'conflict',
                        severity: 'warning',
                        title: `${a.cognoms}, ${a.nom} — ${absType}`,
                        subtitle: `Torn: ${a.torn}`,
                        tornId: a.torn,
                        nomina: a.empleat_id
                    });
                }
            });

            // Sort: critical first
            alertList.sort((a, b) => {
                const order = { critical: 0, warning: 1, info: 2 };
                return order[a.severity] - order[b.severity];
            });

            // ── Set State ──
            const totalShiftsToday = shifts.length;
            const assignedShiftsTodayCount = shifts.filter(s => assignedTornsGlobal.has(getShortTornId(s.id)) || assignedTornsGlobal.has(s.id)).length;
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

    // Initial fetch + auto-refresh every 30s
    useEffect(() => {
        fetchData();
        intervalRef.current = setInterval(fetchData, 30000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [fetchData]);

    return {
        loading, kpis, alerts, reserves, lineStatuses,
        lastRefresh, nowMin, serviceToday, refresh: fetchData
    };
}
