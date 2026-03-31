import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../../supabaseClient';
import { getServiceToday } from '../../../utils/serviceCalendar';
import { getShortTornId } from '../../../utils/fgc';
import { getFgcMinutes, isServiceVisible } from '../../../utils/stations';

// ── Constants ──────────────────────────────────────────
export const GANTT_START_HOUR = 4;   // FGC day starts at 04:00
export const GANTT_END_HOUR = 30;    // ends at 30:00 (06:00 next day)
export const GANTT_TOTAL_MINUTES = (GANTT_END_HOUR - GANTT_START_HOUR) * 60; // 26h duration
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
    driverPhone: string | null;
    originalDriverName?: string | null;
    originalDriverNomina?: string | null;
    originalDriverPhone?: string | null;
    absType: string | null;      // DIS, DES, VAC, etc.
    incidentStartTime: string | null; // HH:mm format for partial absence
    /** When a turn is COMPARTIT (2 people planned), the minute where person1 ends and person2 begins */
    sharedSplitMin?: number | null;
    /** Name of the first person in a COMPARTIT turn (who covers the first segment) */
    sharedFirstDriverName?: string | null;
    /** Start minute of the first person's segment */
    sharedFirstStartMin?: number | null;
    /** End minute of the first person's segment */
    sharedFirstEndMin?: number | null;
    /** Name of the second person in a COMPARTIT turn (who covers the rest) */
    sharedSecondDriverName?: string | null;
    /** Start minute of the second person's segment */
    sharedSecondStartMin?: number | null;
    /** End minute of the second person's segment */
    sharedSecondEndMin?: number | null;
    isAssigned: boolean;
    assignmentId: number | null;
    circulations: GanttCircSegment[];
    coveringShiftId?: string | null;
    coveringDriverName?: string | null;
    coveringDriverNomina?: string | null;
    coveringExtraShiftId?: string | null;
    coveringExtraStartMin?: number | null;
    coveringExtraEndMin?: number | null;
    isCoveredByExtra?: boolean;
    hasComments?: boolean;
}

export interface GanttCircSegment {
    codi: string;
    linia: string;
    startMin: number;
    endMin: number;
    type: 'circ' | 'gap';
}

export interface AvailableAgent {
    nomina: string;
    name: string;
    surname: string;
    originalTurn: string;
}

export interface GanttGroup {
    label: string;
    code: string;
    bars: GanttBar[];
}

export type GanttGroupBy = 'dependencia' | 'horari';
export type GanttFilterMode = 'all' | 'unassigned' | 'conflicts';
export type GanttTimeFilter = 'all' | 'mati' | 'tarda' | 'nit';

// ── Hook ───────────────────────────────────────────────
// F1 – Zoom levels (hours shown)
export type GanttZoomLevel = 'full' | '12h' | '8h' | '4h';

export function useGanttData() {
    const [loading, setLoading] = useState(true);
    const [allBars, setAllBars] = useState<GanttBar[]>([]);
    const [availableAgents, setAvailableAgents] = useState<AvailableAgent[]>([]);
    const [groupBy, setGroupBy] = useState<GanttGroupBy>('dependencia');
    const [filterMode, setFilterMode] = useState<GanttFilterMode>('all');
    const [timeFilter, setTimeFilter] = useState<GanttTimeFilter>('all');
    const [zoomLevel, setZoomLevel] = useState<GanttZoomLevel>('full'); // F1
    const [nowMin, setNowMin] = useState(0);
    const [selectedService, setSelectedService] = useState<string>(getServiceToday());
    const [availableServices, setAvailableServices] = useState<string[]>([]);
    // C3 – stable ref for selectedService to avoid fetchData re-creation on every service change
    const selectedServiceRef = useRef(selectedService);
    selectedServiceRef.current = selectedService;

    // N1 - Realtime connection tracking
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

    // Load available services once
    useEffect(() => {
        const loadServices = async () => {
            const { data } = await supabase.from('shifts').select('servei');
            if (data) {
                const unique = Array.from(new Set(data.map(d => d.servei).filter(Boolean))).sort();
                setAvailableServices(unique);
            }
        };
        loadServices();
    }, []);

    // C3 – fetchData uses a ref for selectedService so it only gets created once
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const svc = selectedServiceRef.current;

            const [shiftsRes, assignRes, agentsRes, commentsRes] = await Promise.all([
                supabase.from('shifts').select('id, servei, inici_torn, final_torn, dependencia, circulations'),
                supabase.from('daily_assignments')
                    .select('id, torn, cognoms, nom, abs_parc_c, empleat_id, incident_start_time, hora_inici, hora_fi, data_servei, observacions')
                    .eq('data_servei', todayStr),
                supabase.from('agents').select('nomina, phone'),
                supabase.from('shift_comments').select('shift_id').eq('date', svc)
            ]);

            // Reassign local variable to ref value (stable reference)
            const selectedService = svc;

            const rawShifts = shiftsRes.data || [];
            // Filter shifts by selected service (client-side filtering as 'isServiceVisible' logic is complex)
            const shifts = rawShifts.filter(s => isServiceVisible(s.servei, selectedService));
            const assignments = assignRes.data || [];
            const agents = agentsRes.data || [];

            // Map agent phone numbers by nomina
            const agentPhones: Record<string, string> = {};
            agents.forEach(a => {
                const nomina = String(a.nomina || '').trim().replace(/^0+/, '');
                if (nomina && a.phone) agentPhones[nomina] = a.phone;
            });
            const usedAssignmentIds = new Set<number>();
            const assignmentToShiftMap = new Map<number, string>();
            const commentsHashes = new Set((commentsRes.data || []).map(c => c.shift_id));

            // Helper to get short ID based on User's Description:
            // Shift: Q + ServiceDigit + 3Digits (e.g. Q0001)
            // Assignment: Q + 3Digits (e.g. Q001)
            const getMatchId = (id: string) => {
                const s = id.trim().toUpperCase();
                // If it follows pattern Q + Digit + 3 chars
                if (s.length === 5 && s.startsWith('Q') && !isNaN(parseInt(s[1])) && !s.startsWith('QR')) {
                    return s[0] + s.slice(2);
                }
                return s;
            };

            // Process existing shifts
            const shiftBars: GanttBar[] = shifts.map(shift => {
                const startMin = getFgcMinutes(shift.inici_torn) ?? 0;
                let endMin = getFgcMinutes(shift.final_torn) ?? 0;

                // C2 – Handle midnight crossing correctly
                // FGC day goes 04:00 → 30:00 (next-day 06:00)
                // If endMin is before startMin and the shift straddles midnight, add 24h
                if (endMin <= startMin) {
                    endMin += 24 * 60;
                }

                const shortId = getMatchId(shift.id);

                // Find all candidates for this turn (could be 2 for COMPARTIT turns)
                const candidates = assignments.filter(a => !usedAssignmentIds.has(a.id) && getMatchId(a.torn || '') === shortId);

                // ── Detect COMPARTIT (planned split): 2 people on same turn ──
                let sharedSplitMin: number | null = null;
                let sharedFirstDriverName: string | null = null;
                let sharedSecondDriverName: string | null = null;
                let sharedFirstStartMin: number | null = null;
                let sharedFirstEndMin: number | null = null;
                let sharedSecondStartMin: number | null = null;
                let sharedSecondEndMin: number | null = null;

                if (candidates.length >= 2) {
                    // Extract time range from: 1) observacions (e.g. "4:43-7:23h") or 2) nom (e.g. "AITOR * 16:00-21:59")
                    const getTimeRange = (a: typeof candidates[0]): { rangeStart: number; rangeEnd: number } | null => {
                        const timePattern = /(\d{1,2}[:h.]\d{2})\s*[-–]\s*(\d{1,2}[:h.]\d{2})/;
                        // 1. Check observacions
                        if (a.observacions) {
                            const m = a.observacions.match(timePattern);
                            if (m) {
                                const s = getFgcMinutes(m[1].replace(/[h.]/g, ':'));
                                const e = getFgcMinutes(m[2].replace(/[h.]/g, ':'));
                                if (s !== null && e !== null) return { rangeStart: s, rangeEnd: e };
                            }
                        }
                        // 2. Check nom field (e.g. "AITOR * 16:00-21:59")
                        if (a.nom) {
                            const m = a.nom.match(timePattern);
                            if (m) {
                                const s = getFgcMinutes(m[1].replace(/[h.]/g, ':'));
                                const e = getFgcMinutes(m[2].replace(/[h.]/g, ':'));
                                if (s !== null && e !== null) return { rangeStart: s, rangeEnd: e };
                            }
                        }
                        return null;
                    };

                    // Clean name: strip "* HH:MM-HH:MM" suffix from nom if present
                    const cleanNom = (nom: string): string => nom.replace(/\s*\*\s*\d{1,2}[:h.]\d{2}\s*[-–]\s*\d{1,2}[:h.]\d{2}\s*$/, '').trim();

                    // The person with a time range does a PARTIAL segment
                    const partialCandidate = candidates.find(a => getTimeRange(a) !== null);
                    const fullCandidate = candidates.find(a => a.id !== partialCandidate?.id);

                    if (partialCandidate && fullCandidate) {
                        const range = getTimeRange(partialCandidate)!;
                        let rangeStartAdj = range.rangeStart < startMin ? range.rangeStart + 24 * 60 : range.rangeStart;
                        let rangeEndAdj = range.rangeEnd < startMin ? range.rangeEnd + 24 * 60 : range.rangeEnd;

                        // Determine chronological order:
                        // If the partial person's range starts at/near the turn start → they go FIRST, split = their end
                        // If the partial person's range starts later → they go SECOND, split = their start
                        const startsAtTurnBegin = Math.abs(rangeStartAdj - startMin) < 30; // within 30 min of turn start

                        if (startsAtTurnBegin) {
                            // Partial person does the FIRST segment (e.g. Q0005: Melero 4:43→7:23)
                            sharedSplitMin = rangeEndAdj;
                            sharedFirstDriverName = `${partialCandidate.cognoms}, ${cleanNom(partialCandidate.nom)}`;
                            sharedFirstStartMin = rangeStartAdj;
                            sharedFirstEndMin = rangeEndAdj;
                            sharedSecondDriverName = `${fullCandidate.cognoms}, ${cleanNom(fullCandidate.nom)}`;
                            sharedSecondStartMin = startMin;
                            sharedSecondEndMin = endMin;
                        } else {
                            // Partial person does the SECOND segment (e.g. Q0016: Aboy 16:00→21:59)
                            sharedSplitMin = rangeStartAdj;
                            sharedFirstDriverName = `${fullCandidate.cognoms}, ${cleanNom(fullCandidate.nom)}`;
                            sharedFirstStartMin = startMin;
                            sharedFirstEndMin = rangeStartAdj;
                            sharedSecondDriverName = `${partialCandidate.cognoms}, ${cleanNom(partialCandidate.nom)}`;
                            sharedSecondStartMin = rangeStartAdj;
                            sharedSecondEndMin = rangeEndAdj;
                        }

                        // Mark both as used
                        usedAssignmentIds.add(partialCandidate.id);
                        usedAssignmentIds.add(fullCandidate.id);
                    }
                }

                // Original is the one with an incident or the first one found (from remaining candidates)
                let originalAssignment = candidates.find(a => a.incident_start_time || a.abs_parc_c) || candidates[0];

                // Covering is either someone else on the same turn, or someone explicitly covering from another turn
                let coveringAssignment = assignments.find(a => {
                    if (usedAssignmentIds.has(a.id) || !a.observacions) return false;
                    const obs = a.observacions.toUpperCase();
                    const sId = shortId.toUpperCase();
                    const sFull = shift.id.toUpperCase();

                    // Match "Cobreix Q104", "Cobreix Q0104", "Cobrint Q104", etc.
                    return obs.includes(`COBREIX ${sId}`) ||
                           obs.includes(`COBREIX ${sFull}`) ||
                           obs.includes(`COBRINT ${sId}`) ||
                           obs.includes(`COBREIX: ${sId}`) ||
                           (obs.includes(sId) && (obs.includes('COBREIX') || obs.includes('COBRINT') || obs.includes('COBRE')));
                });

                // If no explicit cover found by observations, but there's another unmarked candidate on the SAME turn
                if (!coveringAssignment && candidates.length > 1 && !sharedSplitMin) {
                    coveringAssignment = candidates.find(a => a.id !== originalAssignment?.id && !usedAssignmentIds.has(a.id));
                }

                // Mark covering as used
                if (coveringAssignment) {
                    usedAssignmentIds.add(coveringAssignment.id);
                    assignmentToShiftMap.set(coveringAssignment.id, shortId);
                }

                // Mark original as used
                if (originalAssignment && !usedAssignmentIds.has(originalAssignment.id)) {
                    usedAssignmentIds.add(originalAssignment.id);
                }

                const assignment = coveringAssignment || originalAssignment;
                const isCoveredByExtra = !!coveringAssignment && !!originalAssignment && coveringAssignment.id !== originalAssignment.id;

                // For display: if it's a COMPARTIT, use the second person as the main driverName (they cover the majority)
                const driverName = sharedSplitMin
                    ? sharedSecondDriverName
                    : (assignment ? `${assignment.cognoms}, ${assignment.nom}` : null);
                const driverNomina = assignment?.empleat_id ? String(assignment.empleat_id).trim().replace(/^0+/, '') : null;
                const driverPhone = driverNomina ? agentPhones[driverNomina] : null;

                const originalDriverName = originalAssignment ? `${originalAssignment.cognoms}, ${originalAssignment.nom}` : null;
                const originalDriverNomina = originalAssignment?.empleat_id ? String(originalAssignment.empleat_id).trim().replace(/^0+/, '') : null;
                const originalDriverPhone = originalDriverNomina ? agentPhones[originalDriverNomina] : null;

                const absType = assignment?.abs_parc_c || null;
                const incidentStartTime = originalAssignment?.incident_start_time || assignment?.incident_start_time || null;

                // Parse circulation segments
                const rawCircs = (shift.circulations as any[]) || [];
                const segments: GanttCircSegment[] = [];
                let currentPos = startMin;

                rawCircs.forEach((c: any) => {
                    const codi = typeof c === 'string' ? c : (c.codi || '');
                    const linia = typeof c === 'object' ? (c.linia || '') : '';
                    let cStart = typeof c === 'object' ? (getFgcMinutes(c.sortida || c.inici || '') ?? currentPos) : currentPos;
                    let cEnd = typeof c === 'object' ? (getFgcMinutes(c.arribada || c.final || '') ?? currentPos) : currentPos;

                    if (cStart < currentPos) cStart += 24 * 60;
                    if (cEnd < cStart) cEnd += 24 * 60;

                    if (codi === 'Viatger') return;

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

                let coveringExtraStartMin = null;
                let coveringExtraEndMin = null;
                if (isCoveredByExtra && assignment) {
                    coveringExtraStartMin = getFgcMinutes(assignment.hora_inici) ?? null;
                    coveringExtraEndMin = getFgcMinutes(assignment.hora_fi) ?? null;
                    if (coveringExtraStartMin !== null && coveringExtraEndMin !== null && coveringExtraEndMin <= coveringExtraStartMin) {
                        coveringExtraEndMin += 24 * 60;
                    }
                }

                return {
                    shiftId: shift.id,
                    shortId,
                    dependencia: (shift.dependencia || 'Altres').toUpperCase(),
                    startMin,
                    endMin,
                    driverName,
                    driverNomina,
                    driverPhone,
                    originalDriverName,
                    originalDriverNomina,
                    originalDriverPhone,
                    absType,
                    incidentStartTime,
                    sharedSplitMin,
                    sharedFirstDriverName,
                    sharedFirstStartMin,
                    sharedFirstEndMin,
                    sharedSecondDriverName,
                    sharedSecondStartMin,
                    sharedSecondEndMin,
                    isAssigned: !!assignment || sharedSplitMin !== null,
                    assignmentId: assignment?.id || null,
                    circulations: segments,
                    coveringShiftId: null,
                    coveringDriverName: coveringAssignment ? `${coveringAssignment.cognoms}, ${coveringAssignment.nom}` : null,
                    coveringDriverNomina: coveringAssignment?.empleat_id || null,
                    coveringExtraShiftId: isCoveredByExtra ? assignment?.torn : null,
                    coveringExtraStartMin,
                    coveringExtraEndMin,
                    isCoveredByExtra,
                    hasComments: commentsHashes.has(shift.id.toString())
                };
            });

            // Process "Extra" Assignments (assignments not used yet, or used but is an Extra itself)
            const extraAssignments = assignments.filter(a => {
                const tornCode = (a.torn || '').toUpperCase();
                const EXCLUDED_CODES = ['VAC', 'AJN', 'DAG', 'DES', 'DIS', 'FOR'];

                if (EXCLUDED_CODES.includes(tornCode)) return false;

                // If the torn code contains one of these, or is exactly one of these, skip it.
                // Assuming exact match or substring match is appropriate.
                // e.g. "VAC" -> skip. "Q100" -> keep.
                if (EXCLUDED_CODES.includes(tornCode)) return false;

                // Filter by Service Visibility
                // We infer the service from the assignment torn ID if possible
                // Assuming standard naming convention: Q + ServiceDigit + ... (e.g. Q0xx -> S-0, Q1xx -> S-100)
                // If it doesn't match standard pattern (e.g. QR...), we assume it's visible or relevant.

                let inferredService = '';
                if (tornCode.startsWith('Q') && tornCode.length >= 2) {
                    const digit = tornCode[1];
                    if (digit === '0') inferredService = '0';
                    else if (digit === '1') inferredService = '100';
                    else if (digit === '4') inferredService = '400';
                    else if (digit === '5') inferredService = '500';
                }

                if (inferredService && !isServiceVisible(inferredService, selectedService)) {
                    return false;
                }

                // If the assignment is already assigned to a shift, skip it here.
                if (usedAssignmentIds.has(a.id)) return false;

                // Normal logic for extras
                return true;
            });

            const extraBars: GanttBar[] = extraAssignments.map(assign => {
                let startMin = getFgcMinutes(assign.hora_inici) ?? 0;
                let endMin = getFgcMinutes(assign.hora_fi) ?? 0;
                let shortId = assign.torn;
                let parsedCoverTarget: string | null = null;

                // Priority Logic for Extras: Check Observacions
                if (assign.observacions) {
                    const obs = assign.observacions.toUpperCase();

                    // 1. Look for Cobreix to avoid overriding shortId with the covered shift
                    const coverMatch = obs.match(/COBREIX\s+([A-Z0-9]+)/);
                    if (coverMatch) {
                        parsedCoverTarget = coverMatch[1];
                    }

                    // 2. Look for Shift ID Override (e.g. QRR8)
                    // Matches Q followed by alphanumeric chars. Only override if not already explicitly stated it covers.
                    // If there's an explicit "Cobreix QN02", we don't want QN02 to overwrite shortId.
                    const shiftMatch = obs.match(/\bQ[A-Z0-9]{2,5}\b/);
                    if (shiftMatch && (!parsedCoverTarget || shiftMatch[0] !== parsedCoverTarget)) {
                        shortId = shiftMatch[0];
                    }

                    // 2. Look for Time Range Override (e.g. 06:49-11:37)
                    // Supports HH:MM-HH:MM, space optional
                    const timeMatch = obs.match(/(\d{1,2}[:.]\d{2})\s*-\s*(\d{1,2}[:.]\d{2})/);
                    if (timeMatch) {
                        const tStart = timeMatch[1].replace('.', ':');
                        const tEnd = timeMatch[2].replace('.', ':');
                        const sMin = getFgcMinutes(tStart);
                        const eMin = getFgcMinutes(tEnd);

                        if (sMin !== null && eMin !== null) {
                            startMin = sMin;
                            endMin = eMin;
                        }
                    }
                }

                if (endMin < startMin) endMin += 24 * 60;

                const driverNomina = assign.empleat_id ? String(assign.empleat_id).trim().replace(/^0+/, '') : null;
                const driverPhone = driverNomina ? agentPhones[driverNomina] : null;

                return {
                    shiftId: `extra-${assign.id}`,
                    shortId: shortId,
                    dependencia: 'EXTRA',
                    startMin,
                    endMin,
                    driverName: `${assign.cognoms}, ${assign.nom}`,
                    driverNomina: assign.empleat_id,
                    absType: assign.abs_parc_c,
                    incidentStartTime: assign.incident_start_time,
                    isAssigned: true,
                    assignmentId: assign.id,
                    driverPhone,
                    circulations: [],
                    coveringShiftId: assignmentToShiftMap.get(assign.id) || parsedCoverTarget || null,
                    hasComments: commentsHashes.has(`extra-${assign.id}`)
                };
            });

            const all = [...shiftBars, ...extraBars];
            // Sort by start time within each group
            all.sort((a, b) => a.startMin - b.startMin);
            setAllBars(all);

            // Populate available agents (not working today)
            const EXCLUDED_CODES = ['VAC', 'AJN', 'DAG', 'DES', 'DIS', 'FOR'];
            const available = assignments
                .filter(a => EXCLUDED_CODES.includes((a.torn || '').toUpperCase()))
                .map(a => ({
                    nomina: String(a.empleat_id || '').trim().replace(/^0+/, ''),
                    name: a.nom || '',
                    surname: a.cognoms || '',
                    originalTurn: (a.torn || '').toUpperCase()
                }));
            setAvailableAgents(available);
        } catch (err) {
            console.error('[Gantt] Error fetching data:', err);
        } finally {
            setLoading(false);
        }
        // C3 – no deps needed: selectedService is read via ref, fetchData is stable
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        fetchData();

        // N1 – Supabase Realtime subscription for Gantt updates
        if (realtimeConnectedRef.current) return;
        realtimeConnectedRef.current = true;

        const channel = supabase
            .channel('gantt-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'daily_assignments' },
                (payload) => {
                    console.log('[Gantt] Realtime: daily_assignments changed', payload.eventType);
                    fetchData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            realtimeConnectedRef.current = false;
        };
    }, [fetchData]);

    // ── Grouped Bars ──
    const groups: GanttGroup[] = useMemo(() => {
        let filteredBars = allBars;

        if (filterMode === 'unassigned') {
            filteredBars = allBars.filter(b => !b.isAssigned || b.incidentStartTime === '00:00');
        } else if (filterMode === 'conflicts') {
            filteredBars = allBars.filter(b => {
                const absCode = (b.absType || '').toUpperCase();
                const hasPartialIncident = !!b.incidentStartTime && b.incidentStartTime !== '00:00';
                const hasAbsenceCode = absCode.includes('DIS') || absCode.includes('DES') || absCode.includes('VAC');
                return (hasAbsenceCode || hasPartialIncident) && b.incidentStartTime !== '00:00';
            });
        }

        // Apply Time Filter (Shift-based)
        if (timeFilter !== 'all') {
            filteredBars = filteredBars.filter(b => {
                // Get numeric part of shift ID (e.g., Q0001 -> 1)
                const numMatch = b.shiftId.match(/\d+$/);
                const num = numMatch ? parseInt(numMatch[0], 10) : 0;
                const isEven = num % 2 === 0;
                const isOdd = !isEven;
                const start21 = 21 * 60; // 1260 min

                if (timeFilter === 'mati') return isOdd;
                if (timeFilter === 'tarda') return isEven && b.startMin < start21;
                if (timeFilter === 'nit') return isEven && b.startMin >= start21;
                return true;
            });
        }

        if (groupBy === 'dependencia') {
            const DEP_ORDER = ['PC', 'SR', 'RB_COR', 'RE', 'RB', 'NA', 'PN', 'TB', 'SB', 'EXTRA'];
            const DEP_LABELS: Record<string, string> = {
                'PC': 'Pl. Catalunya', 'SR': 'Sarrià', 'RB_COR': 'Rubí-COR', 'RE': 'Reina Elisenda',
                'RB': 'Rubí', 'NA': 'Terrassa Nacions Unides', 'PN': 'Sabadell Parc del Nord',
                'TB': 'Tibidabo', 'SB': 'Sabadell',
                'EXTRA': 'Torns Extra / Sense Gràfic'
            };

            const map = new Map<string, GanttBar[]>();
            filteredBars.forEach(bar => {
                let depCode = bar.dependencia;
                // Normalize some dependencies
                if (bar.shortId.startsWith('Q2') || depCode === 'ALTRES') {
                    depCode = 'RB_COR';
                }
                const dep = Object.keys(DEP_LABELS).includes(depCode) ? depCode : 'RB_COR';

                if (!map.has(dep)) map.set(dep, []);
                map.get(dep)!.push(bar);
            });

            return Object.keys(DEP_LABELS)
                .filter(dep => map.has(dep))
                .map(dep => ({
                    label: DEP_LABELS[dep],
                    code: dep,
                    bars: map.get(dep)!.sort((a, b) => a.startMin - b.startMin)
                }));
        }

        // Group by Horari (Single group, sorted by time)
        return [{
            label: 'Horari',
            code: 'horari',
            bars: filteredBars.sort((a, b) => a.startMin - b.startMin)
        }];
    }, [allBars, groupBy, filterMode, timeFilter]);

    // ── Stats ──
    const stats = useMemo(() => {
        const total = allBars.length;
        const assigned = allBars.filter(b => b.isAssigned).length;
        const unassigned = allBars.filter(b => !b.isAssigned || b.incidentStartTime === '00:00').length;
        const conflicts = allBars.filter(b => {
            const absCode = (b.absType || '').toUpperCase();
            const hasPartialIncident = !!b.incidentStartTime && b.incidentStartTime !== '00:00';
            const hasAbsenceCode = absCode.includes('DIS') || absCode.includes('DES');
            return (hasAbsenceCode || hasPartialIncident) && b.incidentStartTime !== '00:00';
        }).length;
        return { total, assigned, unassigned, conflicts };
    }, [allBars]);

    const updateIncidentTime = async (assignmentId: number, time: string | null) => {
        if (!assignmentId) return;
        const { error } = await supabase
            .from('daily_assignments')
            .update({ incident_start_time: time }) // Ensure this column exists in DB
            .eq('id', assignmentId);

        if (error) {
            console.error('Error updating incident time:', error);
        } else {
            fetchData(); // Refresh data
        }
    };

    const assignToShift = async (assignmentId: number, targetShiftShortId: string) => {
        if (!assignmentId) return;

        const { data } = await supabase.from('daily_assignments').select('observacions').eq('id', assignmentId).single();
        let existingObs = data?.observacions || '';

        // Remove any existing "Cobreix XXX" tags to avoid duplicates and conflicts
        let cleanObs = existingObs.replace(/Cobreix\s+[A-Z0-9]+/gi, '').replace(/\s*-\s*$/, '').trim();

        const newObs = cleanObs.length > 0 ? `${cleanObs} - Cobreix ${targetShiftShortId}` : `Cobreix ${targetShiftShortId}`;

        const { error } = await supabase
            .from('daily_assignments')
            .update({ observacions: newObs })
            .eq('id', assignmentId);

        if (error) {
            console.error('Error assigning to shift:', error);
        } else {
            fetchData();
        }
    };

    const assignAgentToTurn = async (assignmentId: number, targetShiftShortId: string, agent: AvailableAgent) => {
        if (!assignmentId || !agent.nomina) return;

        // Get the current service date (it should be today's operational date)
        const serviceDate = getServiceToday();

        // 1. Find the agent's registration for today (DES, DIS, etc.)
        const { data: agentRegistration, error: findError } = await supabase
            .from('daily_assignments')
            .select('id, observacions')
            .eq('empleat_id', agent.nomina)
            .eq('data_servei', serviceDate)
            .limit(1)
            .single();

        if (findError || !agentRegistration) {
            console.error('Could not find agent registration for today:', findError);
            throw new Error('No s\'ha trobat el registre de l\'agent per avui');
        }

        // 2. Clear old coverage and set new one
        let existingObs = agentRegistration.observacions || '';
        let cleanObs = existingObs.replace(/Cobreix\s+[A-Z0-9]+/gi, '').replace(/\s*-\s*$/, '').trim();
        const newObs = cleanObs ? `${cleanObs} - Cobreix ${targetShiftShortId}` : `Cobreix ${targetShiftShortId}`;

        // 3. Update the AGENT'S record, not the shift record
        const { error } = await supabase
            .from('daily_assignments')
            .update({
                observacions: newObs
            })
            .eq('id', agentRegistration.id);

        if (error) {
            console.error('Error assigning agent to turn:', error);
            throw error;
        } else {
            fetchData();
        }
    };

    // ── Dynamic View Range (Zoom F1) ──
    const viewRange = useMemo(() => {
        // Time-filter presets take priority
        if (timeFilter === 'mati') return { start: 4 * 60, end: 16 * 60, total: 12 * 60 };
        if (timeFilter === 'tarda') return { start: 12 * 60, end: 24 * 60, total: 12 * 60 };
        if (timeFilter === 'nit') return { start: 20 * 60, end: 32 * 60, total: 12 * 60 };

        // F1 – Manual zoom: centre window around "now" (or 14:00 if before service start)
        if (zoomLevel !== 'full') {
            const zoomHours = zoomLevel === '4h' ? 4 : zoomLevel === '8h' ? 8 : 12;
            const halfH = (zoomHours / 2) * 60;
            const centre = Math.max(GANTT_START_MIN + halfH, Math.min(nowMin, GANTT_START_MIN + GANTT_TOTAL_MINUTES - halfH));
            return { start: centre - halfH, end: centre + halfH, total: zoomHours * 60 };
        }

        return { start: GANTT_START_MIN, end: GANTT_START_MIN + GANTT_TOTAL_MINUTES, total: GANTT_TOTAL_MINUTES };
    }, [timeFilter, zoomLevel, nowMin]);

    return {
        loading, groups, stats, groupBy, setGroupBy, filterMode, setFilterMode,
        timeFilter, setTimeFilter, zoomLevel, setZoomLevel,
        viewRange, nowMin, selectedService, setSelectedService, availableServices,
        availableAgents,
        refresh: fetchData, updateIncidentTime, assignToShift, assignAgentToTurn
    };
}
