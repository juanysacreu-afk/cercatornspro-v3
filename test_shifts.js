import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hcpjthnhockfbefclycr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjcGp0aG5ob2NrZmJlZmNseWNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3Nzc0MjgsImV4cCI6MjA4MDM1MzQyOH0.fj1G4Nc8Vxk5OrZuWQhDLLVgjvcQHz5rNdYkHBiAEok';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const { data: shifts } = await supabase.from('shifts').select('id, servei, circulations');
    let s1Count = 0;
    let l6Count = 0;
    let s2Count = 0;
    let l12Count = 0;
    shifts.forEach(s => {
        (s.circulations || []).forEach(c => {
            const codi = typeof c === 'object' ? (c.codi || '') : c;
            let cLiniaRaw = typeof c === 'object' ? (c.linia || '') : '';
            if (!cLiniaRaw && codi) cLiniaRaw = codi;
            const u = cLiniaRaw.toUpperCase();
            if (u.startsWith('A') || u === 'L6') l6Count++;
            if (u.startsWith('L') && !u.startsWith('LP')) l12Count++;
            if (u.startsWith('D') || u === 'S1') s1Count++;
            if (u.startsWith('F') || u === 'S2') s2Count++;
        });
    });
    console.log({ l6Count, l12Count, s1Count, s2Count });
}
test();
