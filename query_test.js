const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1];
const supabaseKey = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1];
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('shifts').select('id, servei, circulations').limit(5);
  if (error) console.error(error);
  else {
    data.forEach(d => {
      console.log('Shift:', d.id, 'Servei:', d.servei);
      console.log('First circ:', JSON.stringify((d.circulations || [])[0]));
    });
  }
}
test();
