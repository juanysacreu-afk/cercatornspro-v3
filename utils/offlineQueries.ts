import { db } from './offlineDb';
import { getShortTornId, getFgcMinutes } from './stations';

const normalizeStr = (str: string) =>
    (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export async function offlineFetchShifts(servei: string) {
    if (servei !== 'Tots') {
        const shifts = await db.shifts.where('servei').equals(servei).toArray();
        return shifts;
    }
    return await db.shifts.toArray();
}

export async function offlineSearchTurnIds(query: string, servei: string) {
    const isNumeric = /^\d+$/.test(query);
    let constructedId = query;
    if (isNumeric && servei !== 'Tots') {
        const prefix = servei === '0' ? '0' : servei.charAt(0);
        const numPart = query.padStart(3, '0');
        constructedId = `Q${prefix}${numPart}`;
    }

    const all = await offlineFetchShifts(servei);
    return all.filter(s => s.id.toLowerCase().includes(constructedId.toLowerCase())).map(s => s.id);
}

export async function offlineSearchMaquinistaTurnIds(query: string, servei: string) {
    const nominaMatch = query.match(/\((\d+)\)/);
    const filterVal = nominaMatch ? nominaMatch[1] : query.trim();

    let assignments = await db.daily_assignments.toArray();
    if (nominaMatch) {
        assignments = assignments.filter(a => a.empleat_id === filterVal);
    } else {
        const lowerVal = filterVal.toLowerCase();
        assignments = assignments.filter(a =>
            (a.empleat_id && a.empleat_id.toLowerCase().includes(lowerVal)) ||
            (a.nom && a.nom.toLowerCase().includes(lowerVal)) ||
            (a.cognoms && a.cognoms.toLowerCase().includes(lowerVal))
        );
    }

    const shortTorns = Array.from(new Set(assignments.map(a => a.torn?.trim().toUpperCase())));

    // Get full shifts matching servei
    const shifts = await offlineFetchShifts(servei);

    const simplifyId = (id: string) => id.replace(/^Q/i, '').replace(/^0+/, '');
    const targetShortTornSimples = shortTorns.map(st => simplifyId(st));

    const matchingIds = shifts.filter(shift => {
        const simpleShiftId = simplifyId(getShortTornId(shift.id));
        return targetShortTornSimples.includes(simpleShiftId) || shortTorns.includes(getShortTornId(shift.id).toUpperCase());
    }).map(s => s.id);

    return matchingIds;
}

export async function offlineSearchCirculationTurnIds(query: string, servei: string) {
    const shifts = await offlineFetchShifts(servei);
    return shifts.filter(turn =>
        (turn.circulations as any[])?.some((circ: any) =>
            (typeof circ === 'string' ? circ : circ.codi)?.toLowerCase().includes(query.toLowerCase())
        )
    ).map(turn => turn.id);
}

export async function offlineFetchFullTurns(turnIds: string[], selectedServei?: string) {
    if (!turnIds.length) return [];

    const shifts = await Promise.all(turnIds.map(id => db.shifts.get(id)));
    const validShifts = shifts.filter(Boolean) as any[];

    const cycleAssig = await db.assignments.toArray();

    const shortIds = turnIds.map(id => getShortTornId(id));

    const allCircIds = new Set<string>();
    const viatgerRealIds = new Set<string>();

    validShifts.forEach(s => {
        (s.circulations as any[])?.forEach((c: any) => {
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

    const circDetails = await Promise.all(Array.from(allCircIds).map(id => db.circulations.get(id)));
    const validCircs = circDetails.filter(Boolean) as any[];

    // daily assignments
    const dailyAssignments = await Promise.all(shortIds.map(async (st) => {
        return await db.daily_assignments.where('torn').equals(st).toArray();
    })).then(res => res.flat());

    // viatger map
    const viatgerCycleMap: Record<string, { cicle: string, train: string }> = {};
    if (viatgerRealIds.size > 0 && selectedServei && selectedServei !== 'Tots') {
        const hShifts = await offlineFetchShifts(selectedServei);
        hShifts.forEach(hs => {
            (hs.circulations as any[])?.forEach((hc: any) => {
                const hCodi = typeof hc === 'object' ? hc.codi : hc;
                if (hCodi && hCodi !== 'Viatger' && viatgerRealIds.has(hCodi)) {
                    if (hc.cicle) {
                        const tAssig = cycleAssig.find(ta => ta.cycle_id === hc.cicle);
                        viatgerCycleMap[hCodi] = { cicle: hc.cicle, train: tAssig?.train_number || '' };
                    }
                }
            });
        });
    }

    const guessStation = (id: string, obs: string) => {
        const combined = (id + ' ' + obs).toUpperCase();
        if (combined.includes('QN') || combined.includes('NAS')) return 'NA';
        if (combined.includes('QR') || combined.includes('RB')) return 'RB';
        if (combined.includes('QP') || combined.includes('PC')) return 'PC';
        if (combined.includes('QS') || combined.includes('SR')) return 'SR';
        return '';
    };

    return turnIds.map(id => {
        const shift = validShifts.find(s => s.id === id);
        const sIdShort = getShortTornId(id);
        const assignments = dailyAssignments.filter((d: any) => d.torn === sIdShort);

        const isVirtual = !shift;

        const baseShift = shift || {
            id,
            servei: selectedServei || '---',
            inici_torn: (assignments[0] as any)?.hora_inici || '',
            final_torn: (assignments[0] as any)?.hora_fi || '',
            dependencia: guessStation(id, (assignments[0] as any)?.observacions || ''),
            circulations: []
        };

        const drivers = assignments.map((assig: any) => {
            const obsTurnMatch = (assig.observacions || '').match(/\b(Q[A-Z0-9]+)\b/);
            const realTornId = obsTurnMatch ? obsTurnMatch[1] : null;

            return {
                nom: assig.nom || 'No assignat',
                cognoms: assig.cognoms || '',
                nomina: assig.empleat_id || '---',
                phones: [],
                email: null,
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

            const detail = validCircs.find(cd => cd.id === realCodiId);
            let machinistInici = cRef.inici || detail?.inici;
            let machinistFinal = cRef.final || detail?.final;
            if (isViatger && obsParts.length >= 3) {
                machinistInici = obsParts[1];
                machinistFinal = obsParts[2];
            }

            let cCicle = (typeof cRef === 'object' ? cRef.cicle : null) || (isViatger ? viatgerCycleMap[realCodiId]?.cicle : null);
            let cTrain = isViatger ? viatgerCycleMap[realCodiId]?.train : null;
            const cycleInfo = cCicle ? cycleAssig.find(ta => ta.cycle_id === cCicle) : null;

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
