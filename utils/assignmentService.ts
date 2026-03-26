import { supabase } from '../supabaseClient';
import { decodeGeotrenUt } from '../views/incidencia/utils/decodeUt';
import { decodeGeotrenCirculation } from '../views/incidencia/utils/decodeCirculation';

const GEOTREN_API = 'https://dadesobertes.fgc.cat/api/v2/catalog/datasets/posicionament-dels-trens/exports/json';

/** Only Barcelona-Vallès lines are relevant for NEXUS (S1/S2/L6/L7/L12 network) */
const BV_LINES = new Set(['S1', 'S2', 'L6', 'L66', 'L7', 'L12', 'MS1', 'MS2', 'ML6', 'ML7', 'ES2']);

/** A valid decoded unit must be in "NNN.NN" format (e.g. "112.07"). Rejects raw tipus_unitat values like "213x2" or series-only "113". */
const VALID_UNIT_RE = /^\d{3}\.\d{2}$/;

export async function resetAssignmentsFromGeoTren(selectedServei: string, allShifts?: any[]) {
    try {
        // 1. Fetch GeoTren Data
        const resp = await fetch(GEOTREN_API);
        if (!resp.ok) throw new Error('No s\'ha pogut connectar amb l\'API de GeoTren');
        const rawData: any[] = await resp.json();

        // 2. Filter to BV lines only — Llobregat-Anoia and other lines must not appear here
        const geoTrenData = rawData.filter(gt => BV_LINES.has((gt.lin || '').toUpperCase()));

        // 3. Clear current assignments
        const { error: deleteError } = await supabase.from('assignments').delete().neq('cycle_id', '');
        if (deleteError) throw deleteError;

        // 4. Get Shifts (to map circulation -> cycle)
        let shifts = allShifts;
        if (!shifts || shifts.length === 0) {
            const { data } = await supabase.from('shifts').select('*');
            shifts = data || [];
        }

        const activeShifts = (selectedServei && selectedServei !== 'Tots' && selectedServei !== '') 
            ? shifts.filter((s: any) => s.servei === selectedServei) 
            : shifts;

        const circToCicle: Record<string, string> = {};
        activeShifts.forEach((shift: any) => {
            const circs = Array.isArray(shift.circulations) ? shift.circulations : [];
            circs.forEach((cRef: any) => {
                const codi = (typeof cRef === 'string' ? cRef : cRef?.codi)?.toUpperCase();
                if (codi && cRef?.cicle) {
                    circToCicle[codi] = cRef.cicle;
                }
            });
        });

        // 5. Map GeoTren Data to Cycles
        const uniqueAssignments = new Map<string, string>(); // cycle_id -> train_number
        let unassignedCount = 0;

        geoTrenData.forEach(gt => {
            if (gt.id) {
                const decodedCirc = decodeGeotrenCirculation(gt.id);
                const decodedUt = decodeGeotrenUt(gt.ut, gt.tipus_unitat);

                // Only accept fully decoded units (NNN.NN format) — reject raw tipos_unitat fallbacks
                if (decodedCirc && decodedUt && VALID_UNIT_RE.test(decodedUt)) {
                    const matchedCicle = circToCicle[decodedCirc.fullName.toUpperCase()];
                    if (matchedCicle) {
                        // Using a Map prevents duplicate cycle_id in the upsert payload
                        uniqueAssignments.set(matchedCicle, decodedUt);
                    } else {
                        unassignedCount++;
                    }
                }
            }
        });

        // 6. Bulk Insert/Upsert
        const upsertPayload = Array.from(uniqueAssignments.entries()).map(([cycle_id, train_number]) => ({
            cycle_id,
            train_number
        }));

        if (upsertPayload.length > 0) {
            const { error: insertError } = await supabase.from('assignments').upsert(upsertPayload, { onConflict: 'cycle_id' });
            if (insertError) throw insertError;
        }

        return { 
            success: true, 
            count: upsertPayload.length,
            unassignedCount,
            shifts // Return managed shifts
        };
    } catch (error) {
        console.error('[AssignmentService] Reset failed:', error);
        throw error;
    }
}
