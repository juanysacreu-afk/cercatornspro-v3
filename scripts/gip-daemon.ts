/**
 * GIP Background Daemon (Opció A - Servei en segon pla 24/7)
 *
 * Execució autònoma:
 * npx tsx scripts/gip-daemon.ts
 * o amb PM2: pm2 start "npx tsx scripts/gip-daemon.ts" --name "gip-daemon"
 */

import { pollAndRecordGipPassages, getFgcServiceDate } from '../utils/gipRecorder';
import { supabase } from '../supabaseClient';

console.log('====================================================');
console.log('🚀 FGC GIP Daemon - Enregistrament de Pas en Segon Pla (24/7)');
console.log(`📅 Data de servei actual: ${getFgcServiceDate()}`);
console.log('⏱️ Freqüència de sondeig: 10 segons');
console.log('====================================================');

let totalRecordedToday = 0;
let lastServiceDate = getFgcServiceDate();

const runCycle = async () => {
  const currentServiceDate = getFgcServiceDate();

  // Canvi de jornada FGC (04:00 AM): purgar dades de serveis antics
  if (currentServiceDate !== lastServiceDate) {
    console.log(`🔄 Nou dia de servei detectat: ${currentServiceDate}. Purgant registres antics...`);
    try {
      await supabase.rpc('purge_old_gip_registre_pas');
    } catch (e) {
      console.warn('Avís en purgar registres antics:', e);
    }
    lastServiceDate = currentServiceDate;
    totalRecordedToday = 0;
  }

  try {
    const inserted = await pollAndRecordGipPassages();
    if (inserted > 0) {
      totalRecordedToday += inserted;
      const nowStr = new Date().toLocaleTimeString('ca-ES');
      console.log(`[${nowStr}] 🚆 +${inserted} nous passos registrats (Total acumulats avui: ${totalRecordedToday})`);
    }
  } catch (err) {
    console.error('⚠️ Error en cicle GIP Daemon:', err);
  }
};

// Primer cicle immediat
runCycle();

// Cicle cada 10 segons
const interval = setInterval(runCycle, 10000);

process.on('SIGINT', () => {
  console.log('\n🛑 Aturant GIP Daemon...');
  clearInterval(interval);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Rebut SIGTERM, aturant GIP Daemon...');
  clearInterval(interval);
  process.exit(0);
});
