import { createClient } from "@supabase/supabase-js";

const supabaseUrl = 'https://hcpjthnhockfbefclycr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjcGp0aG5ob2NrZmJlZmNseWNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3Nzc0MjgsImV4cCI6MjA4MDM1MzQyOH0.fj1G4Nc8Vxk5OrZuWQhDLLVgjvcQHz5rNdYkHBiAEok';

const supabase = createClient(supabaseUrl, supabaseKey);

const getMatchId = (id) => {
    const s = id.trim().toUpperCase();
    if (s.length === 5 && s.startsWith('Q') && !isNaN(parseInt(s[1])) && !s.startsWith('QR')) {
        return s[0] + s.slice(2);
    }
    return s;
};

async function main() {
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: assignments } = await supabase.from('daily_assignments').select('*').eq('data_servei', todayStr);
    const { data: rawShifts } = await supabase.from('shifts').select('*').eq('servei', '0');

    const usedAssignmentIds = new Set();
    const processedShifts = rawShifts.map(shift => {
        const shortId = getMatchId(shift.id);

        // Priority 1: Explicit Cover
        let isCoveredByExtra = false;
        let assignment = assignments.find(a => {
            if (usedAssignmentIds.has(a.id) || !a.observacions) return false;
            const obs = a.observacions.toUpperCase();
            return obs.includes(`COBREIX ${shortId}`) ||
                obs.includes(`COBREIX ${shift.id.toUpperCase()}`) ||
                obs.includes(`COBREIX: ${shortId}`) ||
                (obs.includes(shortId) && obs.includes('COBREIX'));
        });

        if (assignment) {
            isCoveredByExtra = true;
        } else {
            // Priority 2: Exact Match
            assignment = assignments.find(a => {
                if (usedAssignmentIds.has(a.id)) return false;
                const aTorn = getMatchId((a.torn || '').toUpperCase());
                if (aTorn !== shortId) return false;
                const obs = (a.observacions || '').toUpperCase();
                if (obs.includes('COBREIX') && !obs.includes(shortId)) return false;
                return true;
            });
        }

        if (assignment) {
            usedAssignmentIds.add(assignment.id);
        }

        return {
            id: shift.id,
            shortId,
            driver: assignment ? assignment.cognoms : 'UNASSIGNED'
        };
    });

    console.log("Check Q0004:");
    console.log(processedShifts.find(s => s.id === 'Q0004'));

    console.log("Check QRS2:");
    console.log(processedShifts.find(s => s.id === 'QRS2'));
}
main();
