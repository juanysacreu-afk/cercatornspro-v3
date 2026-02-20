const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const env = dotenv.parse(fs.readFileSync('.env', 'utf-8'));
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const { data, error } = await supabase.from('circulations').select('id, codi, linia').limit(20);
    if (error) {
        console.error(error);
    } else {
        console.log("From circulations table:");
        console.log(data.slice(0, 5));
    }

    const { data: shifts } = await supabase.from('shifts').select('id, servei, circulations').limit(5);
    console.log("From shifts table circulations object:");
    if (shifts && shifts.length) {
        console.log(shifts[0].circulations.slice(0, 2));
        if (shifts[1]) console.log(shifts[1].circulations.slice(0, 2));
    }
}
test();
