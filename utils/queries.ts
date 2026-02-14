
import { supabase } from '../supabaseClient';
import { getShortTornId } from './fgc';

export async function fetchFullTurns(turnIds: string[], selectedServei?: string) {
    if (!turnIds.length) return [];

    // 1. Fetch shifts and cycle assignments in parallel
    const [shiftsRes, cycleAssigRes] = await Promise.all([
        supabase.from('shifts').select('*').in('id', turnIds),
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

    // 3. Fetch details, daily assignments, and helper shifts for Viatger mapping in parallel
    const queries: any[] = [
        supabase.from('circulations').select('*').in('id', Array.from(allCircIds)),
        supabase.from('daily_assignments').select('*').in('torn', shortIds)
    ];

    // If we have Viatgers, we might need more data to resolve their cycle/train
    if (viatgerRealIds.size > 0 && selectedServei && selectedServei !== 'Tots') {
        queries.push(supabase.from('shifts').select('circulations').eq('servei', selectedServei));
    } else {
        queries.push(Promise.resolve({ data: [] }));
    }

    const [circDetailsRes, dailyRes, helperShiftsRes] = await Promise.all(queries);
    const circDetails = circDetailsRes.data || [];
    const dailyAssignments = dailyRes.data || [];
    const helperShifts = helperShiftsRes.data || [];

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
    const getFgcMinutes = (timeStr: string) => {
        if (!timeStr || !timeStr.includes(':')) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        let total = h * 60 + m;
        if (h < 4) total += 24 * 60;
        return total;
    };

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
        const shift = shifts.find(s => s.id === id);
        const sIdShort = getShortTornId(id);
        const assignments = dailyAssignments.filter((d: any) => d.torn === sIdShort);

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
                realTornId: realTornId
            };
        });

        const fullCirculations = (baseShift.circulations as any[])?.map((cRef: any) => {
            const isViatger = cRef.codi === 'Viatger';
            const obsParts = isViatger && cRef.observacions ? cRef.observacions.split('-') : [];
            const realCodiId = isViatger && obsParts.length > 0 ? obsParts[0] : cRef.codi;

            const detail = circDetails.find((cd: any) => cd.id === realCodiId);
            let machinistInici = cRef.inici || detail?.inici;
            let machinistFinal = cRef.final || detail?.final;
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
                id: cRef.codi,
                realCodi: isViatger ? realCodiId : null,
                codi: cRef.codi,
                machinistInici,
                machinistFinal,
                cicle: cCicle,
                train: cTrain || cycleInfo?.train_number,
                linia: detail?.linia || cRef.linia
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
