import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hcpjthnhockfbefclycr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjcGp0aG5ob2NrZmJlZmNseWNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3Nzc0MjgsImV4cCI6MjA4MDM1MzQyOH0.fj1G4Nc8Vxk5OrZuWQhDLLVgjvcQHz5rNdYkHBiAEok';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const { data: shifts } = await supabase.from('shifts').select('id, servei, circulations');
    console.log("From shifts table circulations object:");
    if (shifts && shifts.length) {
        const valid = shifts.find(s => s.servei === '100' && s.circulations && s.circulations.some(c => c.codi && c.codi.match(/^[A-Z0-9]{3,}$/)));
        if (valid) {
            console.log('ID:', valid.id, 'servei:', valid.servei);
            console.log(valid.circulations.slice(0, 10));
        } else {
            console.log("No valid circulations found.");
        }
    }
}
test();
