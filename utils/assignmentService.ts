import { supabase } from '../supabaseClient';
import { decodeGeotrenUt } from '../views/incidencia/utils/decodeUt';
import { decodeGeotrenCirculation } from '../views/incidencia/utils/decodeCirculation';
import { calendarCodeToFilterCode, getServiceToday } from './serviceCalendar';

const GEOTREN_API = 'https://dadesobertes.fgc.cat/api/v2/catalog/datasets/posicionament-dels-trens/exports/json';

/** Only Barcelona-Vallès lines are relevant for NEXUS (S1/S2/L6/L7/L12 network) */
const BV_LINES = new Set(['S1', 'S2', 'L6', 'L66', 'L7', 'L12', 'MS1', 'MS2', 'ML6', 'ML7', 'ES2']);

/** A valid decoded unit must be in "NNN.NN" format (e.g. "112.07"). Rejects raw tipus_unitat values like "213x2" or series-only "113". */
const VALID_UNIT_RE = /^\d{3}\.\d{2}$/;

export async function resetAssignmentsFromGeoTren(selectedServei: string, allShifts?: any[]) {
    try {
        // Normalize calendar codes (e.g. "000", "200", "700") to DB filter codes ("0", "100", "400", "500")
        // The service_calendar table stores fine-grained codes, but shifts.servei uses bucket codes.
        const normalizedServei = calendarCodeToFilterCode(selectedServei);

        // 1. Fetch GeoTren Data
        const resp = await fetch(GEOTREN_API);
        if (!resp.ok) throw new Error('No s\'ha pogut connectar amb l\'API de GeoTren');
        const rawData: any[] = await resp.json();

        // 2. Filter to BV lines only — Llobregat-Anoia and other lines must not appear here
        const geoTrenData = rawData.filter(gt => BV_LINES.has((gt.lin || '').toUpperCase()));

        // 4. Get Shifts (to map circulation -> cycle)
        let shifts = allShifts;
        if (!shifts || shifts.length === 0) {
            const { data } = await supabase.from('shifts').select('*');
            shifts = data || [];
        }

        const activeShifts = (normalizedServei && normalizedServei !== 'Tots' && normalizedServei !== '') 
            ? shifts.filter((s: any) => s.servei === normalizedServei) 
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

        // 6. Bulk Insert/Upsert (només si hem obtingut assignacions vàlides de GeoTren)
        const upsertPayload = Array.from(uniqueAssignments.entries()).map(([cycle_id, train_number]) => ({
            cycle_id,
            train_number
        }));

        if (upsertPayload.length > 0) {
            // Netegem les assignacions anteriors abans d'inserir les actualitzades
            const { error: deleteError } = await supabase.from('assignments').delete().neq('cycle_id', '');
            if (deleteError) throw deleteError;

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

/**
 * Inicia la sincronització automàtica periòdica de les unitats de GeoTren cada 10 minuts
 * mentre l'aplicació està oberta.
 * 
 * @param intervalMs Interval de sincronització (per defecte 10 minuts = 600.000 ms)
 * @param onSync Callback opcional quan la sincronització finalitza amb èxit
 * @returns Funció de neteja per aturar el temporitzador
 */
export function startGeoTrenAutoSync(
    intervalMs: number = 10 * 60 * 1000,
    onSync?: (result: { success: boolean; count: number }) => void
): () => void {
    let timer: any = null;
    let initialTimer: any = null;
    let isRunning = false;

    const runSync = async () => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;
        if (isRunning) return;
        isRunning = true;
        try {
            const serviceKey = getServiceToday();
            const result = await resetAssignmentsFromGeoTren(serviceKey);
            if (result && result.success && result.count > 0) {
                console.log(`[GeoTren Auto-Sync] S'han sincronitzat automàticament ${result.count} unitats amb GeoTren.`);
                if (onSync) {
                    onSync({ success: true, count: result.count });
                }
            }
        } catch (err) {
            console.warn('[GeoTren Auto-Sync] Error en la sincronització automàtica:', err);
        } finally {
            isRunning = false;
        }
    };

    // Sincronització inicial 15 segons després d'arrencar
    initialTimer = setTimeout(() => {
        runSync();
    }, 15000);

    // Interval periòdic cada 10 minuts
    timer = setInterval(() => {
        runSync();
    }, intervalMs);

    return () => {
        if (initialTimer) clearTimeout(initialTimer);
        if (timer) clearInterval(timer);
    };
}

