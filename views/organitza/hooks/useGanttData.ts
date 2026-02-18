import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { getServiceToday } from '../../../utils/serviceCalendar';
import { getShortTornId } from '../../../utils/fgc';
import { getFgcMinutes, isServiceVisible } from '../../../utils/stations';

// ── Constants ──────────────────────────────────────────
export const GANTT_START_HOUR = 4;   // FGC day starts at 04:00
export const GANTT_END_HOUR = 28;    // ends at 28:00 (04:00 next day)
export const GANTT_TOTAL_MINUTES = (GANTT_END_HOUR - GANTT_START_HOUR) * 60; // 1440 min = 24h
export const GANTT_START_MIN = GANTT_START_HOUR * 60; // 240

// ── Types ──────────────────────────────────────────────
export interface GanttBar {
    shiftId: string;
    shortId: string;
    dependencia: string;
    startMin: number;
    endMin: number;
    driverName: string | null;
    driverNomina: string | null;
    absType: string | null;      // DIS, DES, VAC, etc.
    isAssigned: boolean;
    circulations: GanttCircSegment[];
}

export interface GanttCircSegment {
    codi: string;
    linia: string;
    startMin: number;
    endMin: number;
    type: 'circ' | 'gap';
}

export interface GanttGroup {
    label: string;
    code: string;
    bars: GanttBar[];
}

export type GanttGroupBy = 'dependencia' | 'linia';

// ── Hook ───────────────────────────────────────────────
export function useGanttData() {
    const [loading, setLoading] = useState(true);
    const [allBars, setAllBars] = useState<GanttBar[]>([]);
    const [groupBy, setGroupBy] = useState<GanttGroupBy>('dependencia');
    const [nowMin, setNowMin] = useState(0);
    const serviceToday = getServiceToday();

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
        setLoading(true);
        try {
            const [shiftsRes, assignRes] = await Promise.all([
                supabase.from('shifts').select('id, servei, inici_torn, final_torn, dependencia, circulations'),
                supabase.from('daily_assignments').select('*')
            ]);

            const shifts = (shiftsRes.data || []).filter(s => isServiceVisible(s.servei, serviceToday));
            const assignments = assignRes.data || [];

            const bars: GanttBar[] = shifts.map(shift => {
                const startMin = getFgcMinutes(shift.inici_torn) ?? 0;
                const endMin = getFgcMinutes(shift.final_torn) ?? 0;
                const shortId = getShortTornId(shift.id);

                // Find assigned driver
                const assignment = assignments.find(a => a.torn === shortId);
                const driverName = assignment ? `${assignment.cognoms}, ${assignment.nom}` : null;
                const absType = assignment?.abs_parc_c || null;

                // Parse circulation segments
                const rawCircs = (shift.circulations as any[]) || [];
                const segments: GanttCircSegment[] = [];
                let currentPos = startMin;

                rawCircs.forEach((c: any) => {
                    const codi = typeof c === 'string' ? c : (c.codi || '');
                    const linia = typeof c === 'object' ? (c.linia || '') : '';
                    const cStart = typeof c === 'object' ? (getFgcMinutes(c.sortida || c.inici || '') ?? currentPos) : currentPos;
                    const cEnd = typeof c === 'object' ? (getFgcMinutes(c.arribada || c.final || '') ?? currentPos) : currentPos;

                    if (codi === 'Viatger') return; // Skip passenger segments

                    // Gap before this circulation
                    if (cStart > currentPos) {
                        segments.push({ codi: 'gap', linia: '', startMin: currentPos, endMin: cStart, type: 'gap' });
                    }

                    if (cStart < cEnd) {
                        segments.push({ codi, linia, startMin: cStart, endMin: cEnd, type: 'circ' });
                    }
                    currentPos = Math.max(currentPos, cEnd);
                });

                // Trailing gap
                if (currentPos < endMin) {
                    segments.push({ codi: 'final', linia: '', startMin: currentPos, endMin: endMin, type: 'gap' });
                }

                return {
                    shiftId: shift.id,
                    shortId,
                    dependencia: (shift.dependencia || 'Altres').toUpperCase(),
                    startMin,
                    endMin,
                    driverName,
                    driverNomina: assignment?.empleat_id || null,
                    absType,
                    isAssigned: !!assignment,
                    circulations: segments
                };
            });

            // Sort by start time within each group
            bars.sort((a, b) => a.startMin - b.startMin);
            setAllBars(bars);
        } catch (err) {
            console.error('[Gantt] Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    }, [serviceToday]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // ── Grouped Bars ──
    const groups: GanttGroup[] = useMemo(() => {
        if (groupBy === 'dependencia') {
            const DEP_ORDER = ['PC', 'SR', 'RB_COR', 'RE', 'RB', 'NA', 'PN', 'TB', 'SB', 'ALTRES'];
            const DEP_LABELS: Record<string, string> = {
                'PC': 'Pl. Catalunya', 'SR': 'Sarrià', 'RB_COR': 'Rubí-COR', 'RE': 'Reina Elisenda',
                'RB': 'Rubí', 'NA': 'Nació', 'PN': 'Pont Potència',
                'TB': 'Tibidabo', 'SB': 'Sabadell', 'ALTRES': 'Altres'
            };

            const map = new Map<string, GanttBar[]>();
            allBars.forEach(bar => {
                let depCode = bar.dependencia;
                if (bar.shortId.startsWith('Q2')) {
                    depCode = 'RB_COR';
                }
                const dep = DEP_ORDER.includes(depCode) ? depCode : 'ALTRES';
                if (!map.has(dep)) map.set(dep, []);
                map.get(dep)!.push(bar);
            });

            return DEP_ORDER
                .filter(dep => map.has(dep))
                .map(dep => ({
                    label: DEP_LABELS[dep] || dep,
                    code: dep,
                    bars: map.get(dep)!
                }));
        }

        // Group by first line in circulations
        const map = new Map<string, GanttBar[]>();
        allBars.forEach(bar => {
            const firstCirc = bar.circulations.find(c => c.type === 'circ');
            const linia = firstCirc?.linia?.toUpperCase() || 'SENSE LÍNIA';
            if (!map.has(linia)) map.set(linia, []);
            map.get(linia)!.push(bar);
        });

        return Array.from(map.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([linia, bars]) => ({
                label: linia,
                code: linia,
                bars
            }));
    }, [allBars, groupBy]);

    // ── Stats ──
    const stats = useMemo(() => {
        const total = allBars.length;
        const assigned = allBars.filter(b => b.isAssigned).length;
        const unassigned = total - assigned;
        const conflicts = allBars.filter(b => {
            const absCode = (b.absType || '').toUpperCase();
            return absCode.includes('DIS') || absCode.includes('DES');
        }).length;
        return { total, assigned, unassigned, conflicts };
    }, [allBars]);

    return {
        loading, groups, stats, groupBy, setGroupBy,
        nowMin, serviceToday, refresh: fetchData
    };
}
