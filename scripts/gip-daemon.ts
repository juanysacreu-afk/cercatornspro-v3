/**
 * GIP Background Daemon (Opció A - Servei en segon pla 24/7)
 *
 * Execució autònoma:
 * npx tsx scripts/gip-daemon.ts
 * o amb PM2: pm2 start "npx tsx scripts/gip-daemon.ts" --name "gip-daemon"
 */

import { startGipRecorder, pollAndRecordGipPassages, getFgcServiceDate } from '../utils/gipRecorder';

console.log('====================================================');
console.log('🚀 FGC GIP Daemon - Enregistrament de Pas en Segon Pla');
console.log(`📅 Data de servei inicial: ${getFgcServiceDate()}`);
console.log('⏱️ Freqüència: 10 segons');
console.log('====================================================');

startGipRecorder(10000);

// Manté el procés actiu
process.on('SIGINT', () => {
  console.log('\n🛑 Aturant GIP Daemon...');
  process.exit(0);
});
