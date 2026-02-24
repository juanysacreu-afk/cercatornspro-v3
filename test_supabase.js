import { createClient } from "@supabase/supabase-js";

const supabaseUrl = 'https://hcpjthnhockfbefclycr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjcGp0aG5ob2NrZmJlZmNseWNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3Nzc0MjgsImV4cCI6MjA4MDM1MzQyOH0.fj1G4Nc8Vxk5OrZuWQhDLLVgjvcQHz5rNdYkHBiAEok';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Connecting...");
    const todayStr = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
        .from('daily_assignments')
        .select('*')
        .eq('data_servei', todayStr);

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log("Total assignments today:", data.length);

    const qrs2 = data.filter(d => d.torn.toUpperCase().includes('QRS2'));
    console.log("\nQRS2 Assignments:");
    qrs2.forEach(a => console.log(`ID: ${a.id}, Torn: ${a.torn}, Obs: ${a.observacions}, Hora: ${a.hora_inici}-${a.hora_fi}, Driver: ${a.cognoms}`));

    const q004 = data.filter(d => d.torn.toUpperCase().includes('Q004') || d.torn.toUpperCase().includes('Q0004'));
    console.log("\nQ004/Q0004 Assignments:");
    q004.forEach(a => console.log(`ID: ${a.id}, Torn: ${a.torn}, Obs: ${a.observacions}, Hora: ${a.hora_inici}-${a.hora_fi}, Driver: ${a.cognoms}`));

    const covering = data.filter(d => d.observacions && d.observacions.toUpperCase().includes('Q004'));
    console.log("\nAssignments covering Q004 (via Obs):");
    covering.forEach(a => console.log(`ID: ${a.id}, Torn: ${a.torn}, Obs: ${a.observacions}, Driver: ${a.cognoms}`));
}
main();
