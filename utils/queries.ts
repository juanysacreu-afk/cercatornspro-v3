
import { supabase } from '../supabaseClient';
import { getShortTornId, getFgcMinutes } from './stations';

export async function fetchFullTurns(turnIds: string[], selectedServei?: string) {
    if (!turnIds.length) return [];

    // 1. Fetch shifts and cycle assignments in parallel
    let shiftQuery = supabase.from('shifts').select('*').in('id', turnIds);
    if (selectedServei && selectedServei !== 'Tots') {
        shiftQuery = shiftQuery.eq('servei', selectedServei);
    }

    const [shiftsRes, cycleAssigRes] = await Promise.all([
        shiftQuery,
        supabase.from('assignments').select('*') // Potentially many, maybe refine later if needed
    ]);

    const shifts = shiftsRes.data || [];
    const cycleAssig = cycleAssigRes.data || [];

    // We want to process all turnIds, even those not found in the theoretical 'shifts' table
    // (e.g. ad-hoc turns that only exist in 'daily_assignments')
    const shortIds = turnIds.map(id => getShortTornId(id));

    // 2. Identify all required circulations and daily assignments
    const allCircIds = new Set<string>();
    const viatgerRealIds = new Set<string>();

    shifts.forEach(s => {
        (s.circulations as any[])?.forEach(c => {
            const codi = typeof c === 'string' ? c : c.codi;
            if (codi === 'Viatger' && c.observacions) {
                const rCodi = c.observacions.split('-')[0];
                allCircIds.add(rCodi);
                viatgerRealIds.add(rCodi);
            } else if (codi && codi !== 'Viatger') {
                allCircIds.add(codi);
            }
        });
    });

    // 3. Fetch details from circulationsv2 (with exact service timetables), falling back to legacy circulations
    const sCode = (selectedServei && selectedServei !== 'Tots')
        ? (selectedServei === '0' ? '000' : selectedServei)
        : undefined;

    let circQuery = supabase.from('circulationsv2').select('*').in('id', Array.from(allCircIds));
    if (sCode) {
        circQuery = circQuery.eq('servei', sCode);
    } else {
        const sCodes = Array.from(new Set(shifts.map(s => s.servei === '0' ? '000' : s.servei).filter(Boolean)));
        if (sCodes.length > 0) {
            circQuery = circQuery.in('servei', sCodes);
        }
    }

    const orCondition = shortIds.map(id => `observacions.ilike.*${id}*`).join(',');

    const queries: any[] = [
        circQuery,
        supabase.from('circulations').select('*').in('id', Array.from(allCircIds)),
        supabase.from('daily_assignments').select('*').in('torn', shortIds)
    ];

    // If we have Viatgers, we might need more data to resolve their cycle/train
    if (viatgerRealIds.size > 0 && selectedServei && selectedServei !== 'Tots') {
        queries.push(supabase.from('shifts').select('circulations').eq('servei', selectedServei));
    } else {
        queries.push(Promise.resolve({ data: [] }));
    }

    if (shortIds.length > 0) {
        queries.push(supabase.from('daily_assignments').select('*').or(orCondition));
    } else {
        queries.push(Promise.resolve({ data: [] }));
    }

    const [circv2Res, legacyCircRes, dailyRes, helperShiftsRes, coveringDailyRes] = await Promise.all(queries);

    const normalizeEstacions = (stations: any[]) => {
        if (!Array.isArray(stations)) return [];
        return stations.map(st => ({
            ...st,
            codi: st.codi || st.nom,
            nom: st.nom || st.codi,
            hora: st.hora || st.sortida || st.arribada,
            sortida: st.sortida || st.hora,
            arribada: st.arribada || st.hora,
            via: st.via || st.via_sortida || st.via_arribada || '',
            via_sortida: st.via_sortida || st.via || '',
            via_arribada: st.via_arribada || st.via || ''
        }));
    };

    const circDetailsMap = new Map<string, any>();
    // Legacy fallback first
    (legacyCircRes.data || []).forEach((c: any) => {
        circDetailsMap.set(c.id, {
            ...c,
            estacions: normalizeEstacions(c.estacions)
        });
    });
    // circulationsv2 overrides with exact service data
    (circv2Res.data || []).forEach((c: any) => {
        const enriched = {
            ...c,
            estacions: normalizeEstacions(c.estacions)
        };
        circDetailsMap.set(`${c.servei}_${c.id}`, enriched);
        if (!circDetailsMap.has(c.id) || sCode === c.servei) {
            circDetailsMap.set(c.id, enriched);
        }
    });

    const circDetails = Array.from(circDetailsMap.values());
    const helperShifts = helperShiftsRes.data || [];

    // Combine regular assignments and covering assignments, removing duplicates by ID
    const rawDailyAssignments = [...(dailyRes.data || []), ...(coveringDailyRes.data || [])];
    const dailyAssignmentsMap = new Map();
    rawDailyAssignments.forEach((d: any) => dailyAssignmentsMap.set(d.id, d));
    const dailyAssignments = Array.from(dailyAssignmentsMap.values());

    // 4. Resolve Viatger Cycle Map
    const viatgerCycleMap: Record<string, { cicle: string, train: string }> = {};
    if (viatgerRealIds.size > 0) {
        helperShifts.forEach((hs: any) => {
            (hs.circulations as any[])?.forEach((hc: any) => {
                const hCodi = typeof hc === 'object' ? hc.codi : hc;
                if (hCodi && hCodi !== 'Viatger' && viatgerRealIds.has(hCodi)) {
                    if (hc.cicle) {
                        const tAssig = cycleAssig?.find((ta: any) => ta.cycle_id === hc.cicle);
                        viatgerCycleMap[hCodi] = {
                            cicle: hc.cicle,
                            train: tAssig?.train_number || ''
                        };
                    }
                }
            });
        });
    }

    // 5. Fetch Phones
    const employeeIds = Array.from(new Set(dailyAssignments.map((d: any) => d.empleat_id).filter(Boolean)));
    const phonesRes = employeeIds.length > 0
        ? await supabase.from('agents').select('nomina, phone, email').in('nomina', employeeIds)
        : { data: [] };
    const agents = phonesRes.data || [];

    // 6. Enrichment helpers
    const guessStation = (id: string, obs: string) => {
        const combined = (id + ' ' + obs).toUpperCase();
        if (combined.includes('QN') || combined.includes('NAS')) return 'NA';
        if (combined.includes('QR') || combined.includes('RB')) return 'RB';
        if (combined.includes('QP') || combined.includes('PC')) return 'PC';
        if (combined.includes('QS') || combined.includes('SR')) return 'SR';
        return '';
    };

    // Use turnIds as the base to ensure even virtual shifts are included
    return turnIds.map(id => {
        const shift = shifts.find(s => s.id === id && (!selectedServei || selectedServei === 'Tots' || s.servei === selectedServei)) || shifts.find(s => s.id === id);
        const sIdShort = getShortTornId(id);
        const assignments = dailyAssignments.filter((d: any) => {
            if (d.torn === sIdShort) return true;
            if (d.observacions) {
                const obs = d.observacions.toUpperCase();
                return obs.includes('COBREIX') && obs.includes(sIdShort.toUpperCase());
            }
            return false;
        }).sort((a: any, b: any) => {
            if (a.torn === sIdShort && b.torn !== sIdShort) return -1;
            if (a.torn !== sIdShort && b.torn === sIdShort) return 1;
            return 0;
        });

        const isVirtual = !shift;

        // If no theoretical shift found, create a virtual one
        const baseShift = shift || {
            id,
            servei: selectedServei || '---',
            inici_torn: (assignments[0] as any)?.hora_inici || '',
            final_torn: (assignments[0] as any)?.hora_fi || '',
            dependencia: guessStation(id, (assignments[0] as any)?.observacions || ''),
            circulations: []
        };

        const drivers = assignments.map((assig: any) => {
            const agentData = agents.find((p: any) => p.nomina === assig.empleat_id);
            const phones = agentData?.phone ? (Array.isArray(agentData.phone) ? agentData.phone : [agentData.phone]) : [];

            // Extract turn code from observations if it exists
            const obsTurnMatch = (assig.observacions || '').match(/\b(Q[A-Z0-9]+)\b/);
            const realTornId = obsTurnMatch ? obsTurnMatch[1] : null;

            return {
                nom: assig.nom || 'No assignat',
                cognoms: assig.cognoms || '',
                nomina: assig.empleat_id || '---',
                phones: phones,
                email: agentData?.email || null,
                observacions: assig.observacions || '',
                abs_parc_c: assig.abs_parc_c,
                dta: assig.dta,
                dpa: assig.dpa,
                tipus_torn: assig.tipus_torn,
                realTornId: realTornId,
                torn: assig.torn,
                isCovering: assig.torn !== sIdShort
            };
        });

        const fullCirculations = (baseShift.circulations as any[])?.map((cRef: any) => {
            const isViatger = cRef.codi === 'Viatger';
            const obsParts = isViatger && cRef.observacions ? cRef.observacions.split('-') : [];
            const realCodiId = isViatger && obsParts.length > 0 ? obsParts[0] : cRef.codi;

            const targetServei = baseShift.servei === '0' ? '000' : baseShift.servei;
            const detail = circDetailsMap.get(`${targetServei}_${realCodiId}`)
                || circDetailsMap.get(realCodiId)
                || circDetails.find((cd: any) => cd.id === realCodiId);

            let machinistInici = (typeof cRef === 'object' && cRef.inici && cRef.inici.trim()) || detail?.inici;
            let machinistFinal = (typeof cRef === 'object' && cRef.final && cRef.final.trim()) || detail?.final;
            if (isViatger && obsParts.length >= 3) {
                machinistInici = obsParts[1];
                machinistFinal = obsParts[2];
            }

            let cCicle = (typeof cRef === 'object' ? cRef.cicle : null) || (isViatger ? viatgerCycleMap[realCodiId]?.cicle : null);
            let cTrain = isViatger ? viatgerCycleMap[realCodiId]?.train : null;
            const cycleInfo = cCicle ? cycleAssig.find((ta: any) => ta.cycle_id === cCicle) : null;

            return {
                ...detail,
                ...(typeof cRef === 'object' ? cRef : {}),
                inici: machinistInici,
                final: machinistFinal,
                linia: detail?.linia || (typeof cRef === 'object' ? cRef.linia : undefined),
                sortida: (typeof cRef === 'object' && cRef.sortida && cRef.sortida.trim()) || detail?.sortida,
                arribada: (typeof cRef === 'object' && cRef.arribada && cRef.arribada.trim()) || detail?.arribada,
                estacions: (detail?.estacions && detail.estacions.length > 0) ? detail.estacions : (typeof cRef === 'object' ? cRef.estacions : []),
                id: cRef.codi,
                realCodi: isViatger ? realCodiId : null,
                codi: cRef.codi,
                machinistInici,
                machinistFinal,
                cicle: cCicle,
                train: cTrain || cycleInfo?.train_number,
            };
        }).sort((a: any, b: any) => getFgcMinutes(a.sortida || '00:00') - getFgcMinutes(b.sortida || '00:00'));

        return {
            ...baseShift,
            isVirtual,
            drivers: drivers.length > 0 ? drivers : [{ nom: 'No assignat', cognoms: '', nomina: '---', phones: [], observacions: '' }],
            fullCirculations
        };
    });
}

export async function fetchPassengerInfo(circulationIds: string[], servei?: string) {
    if (!circulationIds.length) return {};

    const uniqueIds = Array.from(new Set(circulationIds));
    const result: Record<string, any[]> = {};

    try {
        let q = supabase.from('shifts')
            .select('id, circulations')
            .contains('circulations', JSON.stringify([{ codi: 'Viatger' }]));

        if (servei && servei !== 'Tots') {
            q = q.eq('servei', servei);
        }

        const { data: likelyPassengerShifts } = await q;

        if (likelyPassengerShifts) {
            likelyPassengerShifts.forEach(s => {
                if (!s.circulations) return;
                (s.circulations as any[]).forEach(c => {
                    if (c.codi === 'Viatger' && c.observacions) {
                        const parts = c.observacions.split('-');
                        if (parts.length >= 1) {
                            const targetCircId = parts[0];
                            if (uniqueIds.includes(targetCircId)) {
                                if (!result[targetCircId]) result[targetCircId] = [];

                                result[targetCircId].push({
                                    shiftId: s.id,
                                    from: parts[1] || '??',
                                    to: parts[2] || '??',
                                    isPartial: false
                                });
                            }
                        }
                    }
                });
            });
        }
    } catch (e) {
        console.error("Exception in fetchPassengerInfo:", e);
        return {};
    }

    // Now we have the raw connections. We need to fetch driver names for these shifts to be useful.
    const shiftsToFetch = new Set<string>();
    Object.values(result).forEach(arr => arr.forEach(p => shiftsToFetch.add(getShortTornId(p.shiftId))));

    if (shiftsToFetch.size > 0) {
        const { data: assignments } = await supabase
            .from('daily_assignments')
            .select('torn, nom, cognoms')
            .in('torn', Array.from(shiftsToFetch));

        if (assignments) {
            Object.values(result).forEach(arr => {
                arr.forEach(p => {
                    const shortId = getShortTornId(p.shiftId);
                    const assign = assignments.find((a: any) => a.torn === shortId);
                    if (assign) {
                        p.driverName = `${assign.cognoms}, ${assign.nom}`;
                    } else {
                        p.driverName = p.shiftId; // Fallback
                    }
                });
            });
        }
    }

    return result;
}
