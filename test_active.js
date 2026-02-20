import { createClient } from '@supabase/supabase-js';

const getFgcMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return null;
    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseFloat(parts[1]);
    const s = parts[2] ? parseFloat(parts[2]) : 0;
    if (isNaN(h) || isNaN(m)) return null;
    let total = h * 60 + m + (s / 60);
    if (h < 4) total += 24 * 60;
    return total;
};

const supabaseUrl = 'https://hcpjthnhockfbefclycr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjcGp0aG5ob2NrZmJlZmNseWNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3Nzc0MjgsImV4cCI6MjA4MDM1MzQyOH0.fj1G4Nc8Vxk5OrZuWQhDLLVgjvcQHz5rNdYkHBiAEok';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const { data: shifts } = await supabase.from('shifts').select('id, servei, circulations');
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();
    console.log("Current time minutes:", currentMin);

    let activeCount = 0;
    shifts.forEach(s => {
        if (s.servei === '100') {
            (s.circulations || []).forEach(c => {
                if (c && c.sortida && c.arribada) {
                    const start = typeof c.sortida === 'string' ? getFgcMinutes(c.sortida) : null;
                    let end = typeof c.arribada === 'string' ? getFgcMinutes(c.arribada) : null;
                    if (start !== null && end !== null) {
                        if (end < start) end += 1440;
                        if (currentMin >= start && currentMin <= end) {
                            activeCount++;
                        }
                    }
                }
            });
        }
    });
    console.log("Total active circulations across all DB right now:", activeCount);
}
test();
