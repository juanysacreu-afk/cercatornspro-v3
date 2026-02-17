import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../supabaseClient';
import { getServiceToday } from '../../../utils/serviceCalendar';
import { getFgcMinutes, getShortTornId, isServiceVisible } from '../../../utils/stations';

// ── Types ──────────────────────────────────────────────
export interface DashboardKPIs {
    serviceCoverage: number;       // 0-100 %
    activeTrains: number;
    scheduledTrains: number;
    totalPersonnel: number;
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
        serviceCoverage: 0, activeTrains: 0, scheduledTrains: 0,
        totalPersonnel: 0, activePersonnel: 0, reserveAvailable: 0,
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
            // Parallel fetch of all data sources
            const [shiftsRes, assignmentsRes, parkedRes, brokenRes] = await Promise.all([
                supabase.from('shifts').select('id, servei, inici_torn, final_torn, dependencia, circulations'),
                supabase.from('daily_assignments').select('*'),
                supabase.from('parked_units').select('*'),
                supabase.from('fleet_status').select('*')
            ]);

            const shifts = (shiftsRes.data || []).filter(s => isServiceVisible(s.servei, serviceToday));
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
                const eMin = getFgcMinutes(s.final_torn);
                return sMin !== null && eMin !== null && currentMin >= sMin && currentMin <= eMin;
            });

            // ── Circulations (scheduled vs active) ──
            const allScheduledCircIds = new Set<string>();
            const activeCircIds = new Set<string>();

            shifts.forEach(s => {
                ((s.circulations as any[]) || []).forEach(c => {
                    const codi = typeof c === 'string' ? c : c?.codi;
                    if (codi && codi !== 'Viatger') allScheduledCircIds.add(codi);
                });
            });

            activeShifts.forEach(s => {
                ((s.circulations as any[]) || []).forEach(c => {
                    const codi = typeof c === 'string' ? c : c?.codi;
                    if (codi && codi !== 'Viatger') {
                        // Check if this circulation is currently running
                        const sortida = typeof c === 'object' ? getFgcMinutes(c.sortida || c.inici || '') : null;
                        const arribada = typeof c === 'object' ? getFgcMinutes(c.arribada || c.final || '') : null;
                        if (sortida !== null && arribada !== null && currentMin >= sortida && currentMin <= arribada) {
                            activeCircIds.add(codi);
                        }
                    }
                });
            });

            const scheduledTrains = allScheduledCircIds.size;
            const activeTrains = activeCircIds.size;
            const coverage = scheduledTrains > 0 ? Math.round((activeTrains / scheduledTrains) * 100) : 100;

            // ── Personnel ──
            const assignedTorns = new Set(assignments.map(a => a.torn));
            const activeAssignments = assignments.filter(a => {
                const shift = shifts.find(s => getShortTornId(s.id) === a.torn);
                if (!shift) return false;
                const sMin = getFgcMinutes(shift.inici_torn);
                const eMin = getFgcMinutes(shift.final_torn);
                return sMin !== null && eMin !== null && currentMin >= sMin && currentMin <= eMin;
            });

            // ── Reserves ──
            const RESERVE_STATIONS: Record<string, string> = {
                'PC': 'Pl. Catalunya', 'SR': 'Sarrià', 'RB': 'Rubí',
                'RE': 'Reina Elisenda', 'NA': 'Nació', 'PN': 'Pont de la Potència'
            };
            const reserveSlots: ReserveSlot[] = [];

            Object.entries(RESERVE_STATIONS).forEach(([code, label]) => {
                const reserveShifts = activeShifts.filter(s => {
                    const dep = (s.dependencia || '').toUpperCase();
                    const isReserve = ((s.circulations as any[]) || []).length === 0 ||
                        ((s.circulations as any[]) || []).every((c: any) =>
                            typeof c === 'object' && (!c.codi || c.codi === 'Reserva')
                        );
                    return dep.includes(code) && isReserve;
                });

                const personnel = reserveShifts.map(rs => {
                    const shortId = getShortTornId(rs.id);
                    const assig = assignments.find(a => a.torn === shortId);
                    return {
                        nom: assig?.nom || 'Sense assignar',
                        cognoms: assig?.cognoms || '',
                        torn: rs.id
                    };
                });

                if (personnel.length > 0) {
                    reserveSlots.push({ station: code, stationLabel: label, count: personnel.length, personnel });
                }
            });

            // ── Fleet ──
            const brokenTrains = fleetStatus.filter((f: any) => f.status === 'broken' || f.is_broken === true);
            const totalFleet = 85; // FGC fleet size constant
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

            // Missing assignments: shifts without a corresponding daily_assignment
            activeShifts.forEach(s => {
                const shortId = getShortTornId(s.id);
                const hasAssignment = assignments.some(a => a.torn === shortId);
                if (!hasAssignment) {
                    alertList.push({
                        id: `missing-${s.id}`,
                        type: 'missing',
                        severity: 'critical',
                        title: `Torn ${s.id} sense maquinista`,
                        subtitle: `Dep: ${s.dependencia} | ${s.inici_torn}-${s.final_torn}`,
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
            setKpis({
                serviceCoverage: coverage,
                activeTrains,
                scheduledTrains,
                totalPersonnel: assignments.length,
                activePersonnel: activeAssignments.length,
                reserveAvailable: reserveSlots.reduce((sum, r) => sum + r.count, 0),
                availableTrainUnits: totalFleet - brokenCount - parkedUnits.length,
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
