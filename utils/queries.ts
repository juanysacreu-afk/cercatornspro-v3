
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
    if (!shifts.length) return [];

    const shortIds = shifts.map(s => getShortTornId(s.id));

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
        ? await supabase.from('phonebook').select('*').in('nomina', employeeIds)
        : { data: [] };
    const phones = phonesRes.data || [];

    // 6. Enrich everything
    const getFgcMinutes = (timeStr: string) => {
        if (!timeStr || !timeStr.includes(':')) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        let total = h * 60 + m;
        if (h < 4) total += 24 * 60;
        return total;
    };

    return shifts.map(shift => {
        const sIdShort = getShortTornId(shift.id);
        const assignments = dailyAssignments.filter((d: any) => d.torn === sIdShort);

        const drivers = assignments.map((assig: any) => {
            const pData = phones.find((p: any) => p.nomina === assig.empleat_id);
            return {
                nom: assig.nom || 'No assignat',
                cognoms: assig.cognoms || '',
                nomina: assig.empleat_id || '---',
                phones: pData?.phones || [],
                observacions: assig.observacions || '',
                abs_parc_c: assig.abs_parc_c,
                dta: assig.dta,
                dpa: assig.dpa,
                tipus_torn: assig.tipus_torn
            };
        });

        const fullCirculations = (shift.circulations as any[])?.map((cRef: any) => {
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
            ...shift,
            drivers: drivers.length > 0 ? drivers : [{ nom: 'No assignat', cognoms: '', nomina: '---', phones: [], observacions: '' }],
            fullCirculations
        };
    });
}
