import { supabase } from '../supabaseClient';
import { db } from './offlineDb';

// Optimistic fetch for simple offline mode.
export const syncOfflineData = async (onProgress?: (msg: string) => void) => {
    try {
        if (!navigator.onLine) {
            onProgress?.("Estàs offline, intentant utilitzar dades en memòria catxé.");
            return;
        }

        onProgress?.("Sincronitzant unitats de tren...");

        let assignmentsRows: any[] = [];
        let p = 0;
        while (true) {
            const { data, error } = await supabase.from('assignments').select('*').range(p * 500, (p + 1) * 500 - 1);
            if (error || !data || data.length === 0) break;
            assignmentsRows = [...assignmentsRows, ...data];
            p++;
            if (data.length < 500) break;
        }

        if (assignmentsRows.length > 0) {
            await db.assignments.bulkPut(assignmentsRows);
        }

        onProgress?.("Sincronitzant circulacions...");
        let circRows: any[] = [];
        p = 0;
        while (true) {
            const { data, error } = await supabase.from('circulations').select('*').range(p * 500, (p + 1) * 500 - 1);
            if (error || !data || data.length === 0) break;
            circRows = [...circRows, ...data];
            p++;
            if (data.length < 500) break;
        }

        if (circRows.length > 0) {
            await db.circulations.bulkPut(circRows);
        }

        onProgress?.("Sincronitzant assignacions diàries...");
        let dailyRows: any[] = [];
        p = 0;
        while (true) {
            const { data, error } = await supabase.from('daily_assignments').select('*').range(p * 500, (p + 1) * 500 - 1);
            if (error || !data || data.length === 0) break;
            dailyRows = [...dailyRows, ...data];
            p++;
            if (data.length < 500) break;
        }

        if (dailyRows.length > 0) {
            await db.daily_assignments.bulkPut(dailyRows);
        }

        onProgress?.("Sincronitzant planificador de torns...");
        let shiftRows: any[] = [];
        p = 0;
        while (true) {
            const { data, error } = await supabase.from('shifts').select('*').range(p * 500, (p + 1) * 500 - 1);
            if (error || !data || data.length === 0) break;
            shiftRows = [...shiftRows, ...data];
            p++;
            if (data.length < 500) break;
        }

        if (shiftRows.length > 0) {
            await db.shifts.bulkPut(shiftRows);
        }

        onProgress?.("Sincronització completada amb èxit!");
    } catch (e) {
        console.error("Error durant la sincronització offline:", e);
        onProgress?.("Error de connexió durant la descàrrega.");
    }
};
