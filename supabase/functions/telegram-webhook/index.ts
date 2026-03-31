import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Supabase details
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')

const supabase = createClient(supabaseUrl!, supabaseServiceKey!)

// Helper to normalize shift IDs (e.g., Q0004 -> Q004)
const getShortId = (id: string) => {
  const s = id.trim().toUpperCase();
  if (s.startsWith('Q') && s.length === 5) {
    return 'Q' + s.substring(2);
  }
  return s;
};

function escapeHTML(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface DailyAssignment {
  torn: string;
  nom: string;
  cognoms: string;
  observacions?: string;
  data_servei?: string;
}

// Prompt constants for matching (used to identify contexts during replies)
const PROMPT_PK = 'Indica el PK';
const PROMPT_CLIMA = 'Indica una estacio';
const PROMPT_TORN = 'Indica el torn';
const PROMPT_QUI = 'saber qui la porta';
const PROMPT_TREN = 'estat i posicio';
const PROMPT_SERVEI = 'codi de circulacio';

async function sendTelegramMessage(chatId: string | number, text: string, replyMarkup?: any) {
  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN not found');
    return;
  }
  try {
    const body: any = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    };
    if (replyMarkup) body.reply_markup = replyMarkup;

    console.log(`Sending message to ${chatId}: ${text.substring(0, 50)}...`);
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram API error:', data);
    }

    if (data.ok && data.result) {
      await supabase.from('telegram_messages').upsert([{
        id: `bot-${data.result.message_id}`,
        text: text.replace(/<[^>]*>/g, ''),
        sender_name: '🤖 BOT NEXUS',
        sender_id: 'bot',
        is_alert: false,
        created_at: new Date(data.result.date * 1000).toISOString()
      }], { onConflict: 'id' });
    }
  } catch (e) {
    console.error('Error sending message:', e);
  }
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  if (!botToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text })
    });
  } catch (e) {
    console.error('Error answering callback:', e);
  }
}

// Technical info segments
const SEG_LABELS: Record<string, string> = {
  'PCRE': 'PC/RE', 'GRTB': 'GR/TB', 'SRLP': 'SR/LP',
  'LPTR': 'LP/TR', 'LPNA': 'LP/NA', 'SCPN': 'SC/PN', 'BTUN': 'BT/UN'
};

function getPkInfoText(pk: number, segKey: string): string {
  const segLabel = SEG_LABELS[segKey] || segKey;
  let speed = 'Desconeguda';
  let detail = '';

  if (segKey === 'PCRE') {
    speed = pk < 4.61 ? '60 km/h' : '45 km/h';
    if (pk < 0.22) detail = '⚠️ Sortida Pl.Catalunya: màx 25 km/h';
    else if (pk > 4.31 && pk < 4.62) detail = '⚠️ Sarrià: màx 30 km/h';
    else if (pk > 4.98) detail = '⚠️ Reina Elisenda: màx 30 km/h';
  } else if (segKey === 'GRTB') {
    speed = '60 km/h';
    if (pk > 0.43 && pk < 0.64) detail = '⚠️ Pl.Molina: màx 40 km/h';
    else if (pk > 1.75) detail = '⚠️ Av.Tibidabo: màx 20 km/h';
  } else if (segKey === 'SRLP') {
    speed = '60 km/h';
    if (pk < 0.45) detail = '⚠️ Sortida Sarrià: màx 45 km/h';
    else if (pk > 3.73 && pk < 3.83) detail = '⚠️ Baixador Vallvidrera: màx 60 km/h';
  } else if (segKey === 'LPTR') {
    speed = '90 km/h';
    if (pk < 0.71) detail = '⚠️ Sortida Les Planes: màx 60 km/h';
    else if (pk > 5.61 && pk < 6.29) detail = '⚠️ Sant Cugat Centre: màx 55 km/h';
    else if (pk > 9.95 && pk < 11.0) detail = '⚠️ Rubí Centre: màx 60 km/h';
    else if (pk > 19.86 && pk < 20.15) detail = '⚠️ Terrassa-Rambla: màx 60 km/h';
  } else if (segKey === 'LPNA') {
    speed = '60 km/h';
    if (pk > 23.66 && pk < 23.85) detail = '⚠️ Nacions Unides: màx 30 km/h';
  } else if (segKey === 'SCPN') {
    speed = '90 km/h';
    if (pk > 8.66 && pk < 9.69) detail = '⚠️ Can Feu | Gràcia: màx 60 km/h';
    else if (pk > 13.91) detail = '⚠️ Sabadell Parc del Nord: màx 45 km/h';
  } else if (segKey === 'BTUN') {
    speed = '80 km/h';
    if (pk < 1.3) detail = '⚠️ Tram Bellaterra: màx 60 km/h';
  }

  let t = `<b>📏 PK ${pk.toFixed(3)} — Tram ${segLabel}:</b>\n\n`;
  t += `🚀 <b>V.Màx:</b> ${speed}\n`;
  if (detail) t += `${detail}\n`;
  t += `\n<i>Dades basades en l'Itinerari BV07 (Març 2023).</i>`;
  return t;
}

// --- GEOTREN LOGIC ---
const SERIES_MAP: Record<string, string> = {
  '5fd': '112', '4fd': '113', '3fd': '114', '2fd': '115'
};
const SUFFIX_TO_UNIT: Record<string, number> = {
  '0275': 1, '0276': 2, '0277': 3, '0270': 4, '0271': 5, '0272': 6, '0273': 7, '027c': 8, '027d': 9,
  '0374': 10, '0375': 11, '0376': 12, '0377': 13, '0370': 14, '0371': 15, '0372': 16, '0373': 17, '037c': 18, '037d': 19,
  '0074': 20, '0075': 21, '0076': 22, '0077': 23, '0070': 24, '0071': 25, '0072': 26, '0073': 27, '007c': 28, '007d': 29,
  '0174': 30, '0175': 31, '0176': 32, '0177': 33, '0170': 34, '0171': 35, '0172': 36, '0173': 37, '017c': 38, '017d': 39,
  '0274': 40
};
const FLEET_MAX: Record<string, number> = {
  '112': 22, '113': 19, '114': 5, '115': 15
};
const VALID_PREFIXES = new Set(['1f2cc', '1c2cc']);

function decodeGeotrenUt(hexUt?: string | null, tipusUnitat?: string | null): string | null {
  if (!hexUt || hexUt === 'None' || hexUt.length < 5) return tipusUnitat || null;
  
  // If it's already formatted as a UT (e.g. "113.19"), return it
  if (hexUt.includes('.') && hexUt.length >= 6) return hexUt;

  const hex = hexUt.toLowerCase();
  const prefix = hex.substring(0, 5);
  if (!VALID_PREFIXES.has(prefix) || hex.length < 12) return tipusUnitat || null;
  
  const seriesHex = hex.substring(5, 8);
  const series = SERIES_MAP[seriesHex] || tipusUnitat;
  if (!series) return null;
  
  const suffix = hex.substring(8, 12);
  const unitNumber = SUFFIX_TO_UNIT[suffix];
  
  if (unitNumber === undefined) return series;
  
  const max = FLEET_MAX[series];
  if (max && unitNumber > max) return series;
  
  return `${series}.${unitNumber.toString().padStart(2, '0')}`;
}

function normalizeUT(ut: string): string {
  const parts = ut.split('.');
  if (parts.length === 2) {
      return `${parts[0]}.${parts[1].padStart(2, '0')}`;
  }
  return ut;
}

async function fetchGeotrenData(rawUt: string) {
  const targetUt = normalizeUT(rawUt);
  try {
      const url = 'https://dadesobertes.fgc.cat/api/v2/catalog/datasets/posicionament-dels-trens/exports/json?limit=-1';
      console.log(`[Geotren] Fetching data for unit ${targetUt}...`);
      const res = await fetch(url);
      if (!res.ok) {
          console.error(`[Geotren] API fetch failed with status ${res.status}`);
          return null;
      }
      const data = await res.json();
      
      // Exhaustive list of BCN-Valles lines (matching frontend useLiveMapData.ts)
      const bvLines = new Set(['S1', 'S2', 'L6', 'L66', 'L7', 'L12', 'MS1', 'MS2', 'ML6', 'ML7', 'ES2']);
      
      let bestMatch = null;
      for (const train of data) {
          const linia = (train.lin || '').toUpperCase().trim();
          if (linia && !bvLines.has(linia)) continue;
          
          const decodedUt = decodeGeotrenUt(train.ut, train.tipus_unitat);
          
          // Case 1: Exact match (e.g. "112.01")
          if (decodedUt === targetUt) {
              console.log(`[Geotren] Exact match found for ${targetUt}`);
              return train;
          }
          
          // Case 2: Partial match (e.g. API returns 112 and user searched 112.01)
          // We keep the first match in the correct line but prioritize exact matches.
          if (!bestMatch && decodedUt && targetUt.startsWith(decodedUt)) {
               bestMatch = train;
          }
      }
      
      if (bestMatch) {
          console.log(`[Geotren] Partial/series match found for ${targetUt} as ${decodeGeotrenUt(bestMatch.ut, bestMatch.tipus_unitat)}`);
      } else {
          console.warn(`[Geotren] No train found in API matching ${targetUt}`);
      }
      return bestMatch;
  } catch (e) {
      console.error('[Geotren] Exception in fetchGeotrenData', e);
      return null;
  }
}

function getFgcMinutes(time: string) {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Returns the currently active circulation ID for a given cycle_id
 * by scanning the shifts table and checking the times.
 */
async function getActiveCirculationId(cycleId: string): Promise<string | null> {
    const { data: shifts } = await supabase.from('shifts').select('*');
    if (!shifts) return null;
    
    // Get current time in Spain
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
    const timeParts = formatter.format(now).split(':');
    const nowMin = parseInt(timeParts[0], 10) * 60 + parseInt(timeParts[1], 10);
    
    for (const shift of shifts) {
        if (!shift.circulations) continue;
        for (const circ of shift.circulations as any[]) {
            if (circ.cicle?.toUpperCase() === cycleId.toUpperCase()) {
                const s = getFgcMinutes(circ.sortida);
                const e = getFgcMinutes(circ.arribada);
                
                // Normal case
                if (s <= e) {
                   if (nowMin >= s - 1 && nowMin <= e + 1) return circ.codi;
                } else { 
                   // Overnight case (starts late, ends after midnight)
                   if (nowMin >= s - 1 || nowMin <= e + 1) return circ.codi;
                }
            }
        }
    }
    return null;
}
function parseGeotrenPosition(train: any): string {
  const serviceCode = train.num_tren || train.numTren || '';
  let text = `📍 <b>Posició (GPS):</b> ${train.lin} (Destí: ${train.desti || '?'})\n`;
  if (serviceCode) {
      text += `📄 <b>Servei:</b> ${serviceCode}\n`;
  }
  if (train.estacionat_a) {
      text += `🛑 <b>Estacionat a:</b> ${train.estacionat_a}\n`;
  } else {
      let nextStops: any[] = [];
      if (typeof train.properes_parades === 'string') {
          try {
              const cleanStr = train.properes_parades.replace(/;$/, '');
              nextStops = cleanStr.split(';').map((p: string) => JSON.parse(p));
          } catch (_) {
              // Fallback for simple string if JSON parse fails
              text += `🏃‍♂️ <b>En moviment:</b> ${train.properes_parades}\n`;
              return text;
          }
      } else if (Array.isArray(train.properes_parades)) {
          nextStops = train.properes_parades;
      }

      if (nextStops.length > 0) {
          const nextStop = nextStops[0];
          text += `🏃‍♂️ <b>Propera parada:</b> ${nextStop.parada}\n`;
          if (nextStop.hora_prevista) {
              text += `⏱️ <b>ETA Parada:</b> ${nextStop.hora_prevista.substring(0, 5)}\n`;
          }
      } else {
          text += `🏃‍♂️ <b>En moviment</b>\n`;
      }
  }

  // Delay logic
  let hasDelayInfo = false;
  if (typeof train.retard === 'number') {
      const delayMin = Math.round(train.retard / 60);
      if (delayMin > 0) {
          text += `⚠️ <b>Retard:</b> +${delayMin} min\n`;
      } else {
          text += `✅ <b>En hora</b>\n`;
      }
      hasDelayInfo = true;
  } 
  
  if (!hasDelayInfo && (train.demora && train.demora > 0)) {
      const demoraMin = Math.round(train.demora / 60);
      text += `⚠️ <b>Demora:</b> +${demoraMin} min\n`;
      hasDelayInfo = true;
  } 
  
  if (!hasDelayInfo && (train.en_hora === 'True' || train.en_hora === true)) {
      text += `✅ <b>En hora</b>\n`;
  }
  
  return text;
}

// Common logic functions for bot operations
async function handleEstat(chatId: string | number, todayStr: string) {
  const { data: assignments } = await supabase.from('daily_assignments').select('torn, observacions').eq('data_servei', todayStr);
  const { data: broken } = await supabase.from('train_status').select('train_number').eq('is_broken', true);
  const freeQR = assignments?.filter((a: any) => a.torn?.startsWith('QR') && !a.observacions?.toUpperCase().includes('COBREIX')).length || 0;
  let text = `<b>📊 Estat Operativa (${todayStr}):</b>\n\n`;
  text += `👥 <b>Personal:</b> ${assignments?.length || 0} agents assignats.\n`;
  text += `🛡️ <b>Reserves:</b> ${freeQR} agents lliures.\n`;
  text += `🚆 <b>Material:</b> ${broken?.length || 0} trens amb avaria.\n`;
  await sendTelegramMessage(chatId, text);
}

async function handleReserves(chatId: string | number, todayStr: string) {
  const { data: assignments } = await supabase.from('daily_assignments').select('*').eq('data_servei', todayStr).ilike('torn', 'QR%');
  if (!assignments || assignments.length === 0) {
    await sendTelegramMessage(chatId, "📭 No hi ha torns de reserva avui.");
  } else {
    const free = assignments.filter((a: any) => !a.observacions?.toUpperCase().includes('COBREIX'));
    const busy = assignments.filter((a: any) => a.observacions?.toUpperCase().includes('COBREIX'));
    let text = `<b>🛡️ Reserves (${todayStr}):</b>\n\n✅ <b>Lliures:</b>\n`;
    free.forEach((f: any) => text += `• ${f.torn}: ${f.cognoms}\n`);
    if (busy.length > 0) {
      text += `\n⚠️ <b>Ocupats:</b>\n`;
      busy.forEach((b: any) => text += `• ${b.torn}: ${b.cognoms}\n`);
    }
    await sendTelegramMessage(chatId, text);
  }
}

async function handleDisponibles(chatId: string | number, todayStr: string) {
  const { data: assignments } = await supabase.from('daily_assignments').select('*').eq('data_servei', todayStr).ilike('torn', 'QR%');
  const free = assignments?.filter((a: any) => !a.observacions?.toUpperCase().includes('COBREIX')) || [];

  if (free.length === 0) {
    await sendTelegramMessage(chatId, "📭 No hi ha agents de reserva disponibles ara mateix.");
  } else {
    let text = `<b>👨‍✈️ Agents Disponibles Ara:</b>\n\n`;
    free.forEach((a: any) => text += `• <b>${a.torn}</b>: ${a.cognoms}, ${a.nom}\n`);
    text += `\n<i>Llista basada en torns de reserva (QR) no ocupats.</i>`;
    await sendTelegramMessage(chatId, text, {
      inline_keyboard: [[{ text: '🔄 Actualitzar', callback_data: 'menu__disponibles' }]]
    });
  }
}

async function handleTornsMenu(chatId: string | number) {
  const msg = "<b>📋 Selecciona els torns a consultar:</b>\n\nSense comptar reserves (QR).";
  const keyboard = {
    inline_keyboard: [
      [{ text: '🌅 Matí (Imparells)', callback_data: 'menu__torns_mati' }],
      [{ text: '🌇 Tarda (Parells)', callback_data: 'menu__torns_tarda' }],
      [{ text: "🔙 Tornar a l'Ajuda", callback_data: 'menu__back' }]
    ]
  };
  await sendTelegramMessage(chatId, msg, keyboard);
}

async function handleTornsList(chatId: string | number, todayStr: string, mode: 'mati' | 'tarda') {
  const { data: assignments } = await supabase.from('daily_assignments').select('*').eq('data_servei', todayStr);
  
  if (!assignments || assignments.length === 0) {
    await sendTelegramMessage(chatId, "📭 No hi ha assignacions per avui.");
    return;
  }

  const nonReserves = assignments.filter((a: any) => !(a.torn && a.torn.toUpperCase().startsWith('QR')));
  const filtered = nonReserves.filter((a: any) => {
    if (!a.torn) return false;
    const match = a.torn.match(/\d+/);
    if (!match) return false;
    const num = parseInt(match[0], 10);
    const isEven = num % 2 === 0;
    return mode === 'mati' ? !isEven : isEven;
  });

  filtered.sort((a: any, b: any) => a.torn?.localeCompare(b.torn || '') || 0);

  if (filtered.length === 0) {
    await sendTelegramMessage(chatId, `📭 No hi ha torns de ${mode} assignats avui (sense reserves).`);
    return;
  }

  let text = `<b>📋 Torns de ${mode === 'mati' ? 'Matí 🌅' : 'Tarda 🌇'} (${todayStr}):</b>\n\n`;
  filtered.forEach((a: any) => {
    const isCovered = a.observacions?.toUpperCase().includes('COBREIX');
    text += `• <b>${a.torn}</b>: ${a.cognoms}, ${a.nom}${isCovered ? ' (📝 Substitució)' : ''}\n`;
  });

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔄 Actualitzar', callback_data: `menu__torns_${mode}` }],
      [{ text: '🔙 Tornar', callback_data: 'menu__torns' }]
    ]
  };

  if (text.length > 4000) {
    const chunks = text.match(/[\s\S]{1,3900}(?=\n|$)/g) || [text];
    for (const chunk of chunks) {
      await sendTelegramMessage(chatId, chunk);
    }
    await sendTelegramMessage(chatId, "Opcions:", keyboard);
  } else {
    await sendTelegramMessage(chatId, text, keyboard);
  }
}

async function handleHelp(chatId: string | number) {
  const helpMsg = `<b>🤖 Assistent NEXUS</b>\n\nBenvolgut supervisor. Selecciona una opció ràpida des dels botons inferiors:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '📊 Estat Operativa', callback_data: 'menu__estat' }],
      [{ text: '🛡️ Reserves Avui', callback_data: 'menu__reserves' }, { text: '📋 Tots els Torns', callback_data: 'menu__torns' }],
      [{ text: '👤 Qui porta la UT?', callback_data: 'menu__qui_prompt' }, { text: '🚆 Estat Tren', callback_data: 'menu__tren_prompt' }],
      [{ text: '📋 Consulta Torn', callback_data: 'menu__torn_prompt' }, { text: '🎫 Detall Servei', callback_data: 'menu__servei_prompt' }],
      [{ text: '📏 Info PK', callback_data: 'menu__pk_prompt' }, { text: '🌤️ Clima', callback_data: 'menu__clima_prompt' }],
      [{ text: '⌨️ Llista de Comandes', callback_data: 'menu__all_commands' }]
    ]
  };
  await sendTelegramMessage(chatId, helpMsg, keyboard);
}

async function handleCommand(command: string, args: string[], chatId: number, todayStr: string, spainTime: Date) {
  if (command === '/ajuda' || command === '/start') {
    await handleHelp(chatId);
  } else if (command === '/torn') {
    const target = args[0];
    if (!target) {
      await sendTelegramMessage(chatId, "❌ Indica un torn. Ex: <code>/torn Q004</code>");
    } else {
      const shortSearch = getShortId(target);
      const { data: assignments } = await supabase.from('daily_assignments').select('*').eq('data_servei', todayStr);
      const typedAssignments = (assignments as DailyAssignment[]) || [];
      const direct = typedAssignments.find(a => getShortId(a.torn) === shortSearch);
      const cover = typedAssignments.find(a => a.observacions?.toUpperCase().includes(`COBREIX ${shortSearch}`));
      if (direct || cover) {
        let text = `<b>📋 Info Torn ${shortSearch}:</b>\n\n`;
        if (direct) {
          text += `👤 <b>Assignat:</b> ${direct.nom} ${direct.cognoms}\n`;
          if (direct.observacions) text += `📝 <b>Obs:</b> ${direct.observacions}\n`;
        }
        if (cover) text += `↺ <b>Cobert per:</b> ${cover.nom} ${cover.cognoms} (torn ${cover.torn})\n`;
        await sendTelegramMessage(chatId, text);
      } else {
        await sendTelegramMessage(chatId, `⚠️ El torn <b>${shortSearch}</b> no té agent assignat avui.`);
      }
    }
  } else if (command === '/reserves') {
    await handleReserves(chatId, todayStr);
  } else if (command === '/disponibles') {
    await handleDisponibles(chatId, todayStr);
  } else if (command === '/estat') {
    await handleEstat(chatId, todayStr);
  } else if (command === '/qui') {
    const ut = args[0]?.trim();
    if (!ut) {
      await sendTelegramMessage(chatId, '❌ Indica una UT. Ex: <code>/qui 112.01</code>');
    } else {
      try {
        let msg = `🚆 <b>Buscant qui porta la UT ${ut}...</b>\n\n`;
        
        // 1. Try Geotren first (most accurate for live position)
        const geotrenTrain = await fetchGeotrenData(ut);
        const geoServiceId = geotrenTrain?.num_tren || geotrenTrain?.numTren;
        
        // 2. Try internal assignments mapping
        const { data: realTime } = await supabase.from('assignments').select('cycle_id, train_number, created_at').eq('train_number', ut).order('created_at', { ascending: false }).limit(1).single();
        
        let cycleId = realTime?.cycle_id?.toUpperCase();
        
        // Final service ID to search for
        let searchId = geoServiceId;
        
        // If we don't have Geotren service ID but we have a cycle ID, try to resolve it
        if (!searchId && cycleId) {
            console.log(`[qui] Resolving cycle ${cycleId} to active circulation...`);
            searchId = await getActiveCirculationId(cycleId);
            if (!searchId) searchId = cycleId; // Fallback to cycle itself if not resolved
        }
        
        if (geotrenTrain) {
             msg = `🚆 <b>UT ${ut} (Temps Real):</b>\n\n`;
             msg += parseGeotrenPosition(geotrenTrain);
             msg += `\n`;
        }

        if (searchId) {
          // Find shift for this circulation
          const { data: shiftData } = await supabase.from('shifts').select('*').contains('circulations', JSON.stringify([{ codi: searchId }]));
          
          if (shiftData && shiftData.length > 0) {
            const shiftId = getShortId(shiftData[0].id);
            // Find who has this shift today
            const { data: daily } = await supabase.from('daily_assignments').select('*').eq('data_servei', todayStr);
            const typedAssignments = (daily as DailyAssignment[]) || [];
            const direct = typedAssignments.find(a => getShortId(a.torn) === shiftId);
            const cover = typedAssignments.find(a => a.observacions?.toUpperCase().includes(`COBREIX ${shiftId}`));
            
            if (!geotrenTrain) msg = `🚆 <b>UT ${ut}:</b>\n\n`;
            msg += `📄 <b>Servei:</b> ${searchId}\n`;
            msg += `📋 <b>Torn:</b> ${shiftId}\n`;
            if (direct) msg += `👤 <b>Maquinista:</b> ${direct.nom} ${direct.cognoms}\n`;
            if (cover) msg += `↺ <b>Cobert per:</b> ${cover.nom} ${cover.cognoms} (torn ${cover.torn})\n`;
            
            if (!direct && !cover) {
              msg += `⚠️ El torn <b>${shiftId}</b> no té agent assignat ara mateix.`;
            }
          } else {
            msg += `📍 Està realitzant el servei <b>${searchId}</b>, però no hem trobat el torn associat al sistema.`;
          }
        } else if (!geotrenTrain) {
          // Fallback: search in daily_assignments comments
          const { data: obsSearch } = await supabase.from('daily_assignments').select('*').eq('data_servei', todayStr).ilike('observacions', `%${ut}%`);
          if (obsSearch && obsSearch.length > 0) {
            const typedObs = obsSearch as DailyAssignment[];
            msg = `🚆 <b>UT ${ut} (Segons observacions):</b>\n\n`;
            typedObs.forEach(a => {
              msg += `👤 <b>${a.torn}</b>: ${a.nom} ${a.cognoms}\n📝 <i>${a.observacions}</i>\n\n`;
            });
          } else {
            msg = `⚠️ <b>UT ${ut}:</b> No es pot determinar l'agent. No hi ha dades de posicionament actives ni assignacions per aquesta unitat.\n\n<i>Prova a cercar per <code>/torn</code> si coneixes quin torn la porta.</i>`;
          }
        } else {
          msg += `<i>No s'han trobat assignacions de personal vinculades a aquesta unitat ara mateix.</i>`;
        }
        await sendTelegramMessage(chatId, msg);
      } catch (err: any) {
        console.error('Error in /qui:', err);
        await sendTelegramMessage(chatId, `❌ Error consultant qui porta la UT ${ut}.`);
      }
    }
  } else if (command === '/tren') {
    const ut = args[0]?.trim();
    if (!ut) {
      await sendTelegramMessage(chatId, '❌ Indica una UT. Ex: <code>/tren 112.01</code>');
      return;
    }

    try {
      // 1. Status and Location
      const { data: train } = await supabase.from('train_status').select('*').eq('train_number', ut).single();
      const { data: parked } = await supabase.from('parked_units').select('*').eq('unit_number', ut).single();
      
      // 2. Real-time driver/service mapping
      const { data: realTime } = await supabase.from('assignments').select('cycle_id').eq('train_number', ut).order('created_at', { ascending: false }).limit(1).single();
      const initialCycle = realTime?.cycle_id?.toUpperCase();

      // 3. Geotren real data
      const geotrenTrain = await fetchGeotrenData(ut);
      const geoServiceId = geotrenTrain?.num_tren || geotrenTrain?.numTren;

      // 4. Resolve the active circulation if we only have the cycle
      let searchId = geoServiceId;
      if (!searchId && initialCycle) {
          searchId = await getActiveCirculationId(initialCycle);
          if (!searchId) searchId = initialCycle;
      }

      if (train || parked || realTime || geotrenTrain) {
        let t = `<b>🚆 Info Unitat ${ut}:</b>\n\n`;
        
        // Operational status
        if (train) {
          t += `🔧 <b>Estat:</b> ${train.is_broken ? '🔴 AVARIADA' : '🟢 OK'}\n`;
          if (train.broken_notes) t += `📝 <b>Notes:</b> ${escapeHTML(train.broken_notes)}\n`;
          t += `🧽 <b>Neteja:</b> ${train.needs_cleaning ? '🟠 Pendent' : '🟢 OK'}\n`;
        } else {
          t += `🔧 <b>Estat:</b> ⚪ Sense dades de taller\n`;
        }

        t += '\n';

        // Location and GPS
        if (geotrenTrain) {
          t += parseGeotrenPosition(geotrenTrain);
        } else if (searchId) {
          t += `📍 <b>Posició:</b> En servei (Circulació <b>${searchId}</b>) <i>(Sense posicionament GPS en temps real)</i>\n`;
        } else if (parked) {
          t += `📍 <b>Posició:</b> Estacionada a ${parked.depot_id} (Via ${parked.track})\n`;
        } else {
          t += `📍 <b>Posició:</b> Desconeguda / No monitoritzada\n`;
        }

        // Driver / Service info
        if (searchId) {
          if (geotrenTrain) t += `📄 <b>Servei Teòric:</b> ${searchId}\n`;
          if (initialCycle && initialCycle !== searchId) t += `📋 <b>Cicle:</b> ${initialCycle}\n`;

          const { data: shiftData } = await supabase.from('shifts').select('id').contains('circulations', JSON.stringify([{ codi: searchId }]));
          if (shiftData && shiftData.length > 0) {
            const shiftId = getShortId(shiftData[0].id);
            const { data: daily } = await supabase.from('daily_assignments').select('*').eq('data_servei', todayStr);
            const typedDaily = (daily as DailyAssignment[]) || [];
            const agent = typedDaily.find(a => getShortId(a.torn) === shiftId) || typedDaily.find(a => a.observacions?.toUpperCase().includes(`COBREIX ${shiftId}`));
            if (agent) t += `👤 <b>Maquinista:</b> ${agent.nom} ${agent.cognoms} (${agent.torn})\n`;
          }
        }
        
        await sendTelegramMessage(chatId, t);
      } else {
        await sendTelegramMessage(chatId, `⚠️ UT ${ut} no trobada.`);
      }
    } catch (err: any) {
      console.error('Exception in /tren handler:', err);
      await sendTelegramMessage(chatId, `❌ Error consultant UT ${ut}.`);
    }
  } else if (command === '/servei') {
    const input = args[0]?.trim();
    if (!input) {
      await sendTelegramMessage(chatId, "❌ Indica un codi de circulació. Ex: <code>/servei B107</code>");
    } else {
      const searchId = input.toUpperCase();
      const { data: circs } = await supabase.from('circulations').select('*').or(`id.eq.${searchId},id.ilike.%${searchId}`).limit(1);
      if (!circs || circs.length === 0) {
        await sendTelegramMessage(chatId, `⚠️ No s'ha trobat la circulació <b>${searchId}</b> al catàleg.`);
      } else {
        const circ = circs[0];
        const { data: shiftData } = await supabase.from('shifts').select('*').contains('circulations', JSON.stringify([{ codi: circ.id }]));
        if (!shiftData || shiftData.length === 0) {
          await sendTelegramMessage(chatId, `⚠️ No s'ha trobat cap torn amb la circulació <b>${circ.id}</b>.`);
        } else {
          const shift = shiftData[0];
          const tornId = getShortId(shift.id);
          const { data: assignments } = await supabase.from('daily_assignments').select('*').eq('data_servei', todayStr);
          const typedAssignments = (assignments as DailyAssignment[]) || [];
          const direct = typedAssignments.find(a => getShortId(a.torn) === tornId);
          const cover = typedAssignments.find(a => a.observacions?.toUpperCase().includes(`COBREIX ${tornId}`));
          const mainDriver = direct ? `${direct.nom} ${direct.cognoms}` : 'Sense assignar';
          const coverDriver = cover ? ` (Cobreix: ${cover.nom} ${cover.cognoms} del torn ${cover.torn})` : '';
          const nowTime = spainTime.toTimeString().substring(0, 8); 
          let currentPos = "Dada no disponible";
          if (circ.estacions && Array.isArray(circ.estacions)) {
            const stations = circ.estacions;
            for (let i = 0; i < stations.length; i++) {
              if (stations[i].hora > nowTime) {
                if (i === 0) currentPos = `Propera sortida de <b>${stations[i].nom}</b>`;
                else currentPos = `Entre <b>${stations[i - 1].nom}</b> i <b>${stations[i].nom}</b>`;
                break;
              }
              if (i === stations.length - 1) currentPos = `Arribada final a <b>${stations[i].nom}</b>`;
            }
          }
          let msg = `<b>🎫 Circulació ${circ.id}</b>\n\n`;
          msg += `👤 <b>Maquinista:</b> ${mainDriver}${coverDriver}\n`;
          msg += `📋 <b>Torn:</b> ${tornId}\n`;
          msg += `\n🏁 <b>Destí:</b> ${circ.final || '?'}\n`;
          msg += `⌚ <b>Arribada:</b> ${circ.arribada || '--:--'}\n`;
          msg += `📍 <b>Posició est.:</b> ${currentPos}\n`;
          msg += `\n<i>Nota: La posició és una estimació basada en l'horari teòric.</i>`;
          await sendTelegramMessage(chatId, msg);
        }
      }
    }
  } else if (command === '/pk') {
    const pkVal = parseFloat(args[0]);
    if (isNaN(pkVal)) {
      await sendTelegramMessage(chatId, "❌ Indica un PK numèric. Ex: <code>/pk 4.5</code>");
    } else {
      const keyboard = {
        inline_keyboard: [
          [{ text: 'PC/RE', callback_data: `pk__${pkVal}__PCRE` }, { text: 'GR/TB', callback_data: `pk__${pkVal}__GRTB` }],
          [{ text: 'SR/LP', callback_data: `pk__${pkVal}__SRLP` }, { text: 'LP/TR', callback_data: `pk__${pkVal}__LPTR` }],
          [{ text: 'LP/NA', callback_data: `pk__${pkVal}__LPNA` }, { text: 'SC/PN', callback_data: `pk__${pkVal}__SCPN` }],
          [{ text: 'BT/UN', callback_data: `pk__${pkVal}__BTUN` }]
        ]
      };
      await sendTelegramMessage(chatId, `<b>📏 PK ${pkVal.toFixed(3)} — Selecciona el tram:</b>`, keyboard);
    }
  } else if (command === '/clima') {
    await handleClima(chatId, args);
  }
}

const METEO_STATIONS: Record<string, { name: string; lat: number; lon: number }> = {
  'PC': { name: 'Plaça Catalunya', lat: 41.3875, lon: 2.1696 },
  'GR': { name: 'Gràcia', lat: 41.3984, lon: 2.1562 },
  'SA': { name: 'Sarrià', lat: 41.3974, lon: 2.1233 },
  'RE': { name: 'Reina Elisenda', lat: 41.3965, lon: 2.1095 },
  'TB': { name: 'Av. Tibidabo', lat: 41.4152, lon: 2.1326 },
  'LP': { name: 'Les Planes', lat: 41.4399, lon: 2.0769 },
  'SC': { name: 'Sant Cugat del Vallès', lat: 41.4716, lon: 2.0783 },
  'BT': { name: 'Bellaterra', lat: 41.4980, lon: 2.0820 },
  'UN': { name: 'Universitat Autònoma', lat: 41.5006, lon: 2.0952 },
  'RB': { name: 'Rubí', lat: 41.4870, lon: 2.0335 },
  'TR': { name: 'Terrassa Rambla', lat: 41.5605, lon: 2.0073 },
  'NA': { name: 'Nacions Unides (Terrassa)', lat: 41.5648, lon: 2.0102 },
  'PN': { name: 'Sabadell Parc del Nord', lat: 41.5494, lon: 2.1065 },
  'SM': { name: 'Sabadell Plaça Major', lat: 41.5443, lon: 2.1076 },
  'SS': { name: 'Sabadell Sud', lat: 41.5296, lon: 2.1048 },
  'CF': { name: 'Cerdanyola del Vallès', lat: 41.5197, lon: 2.1014 },
  'MV': { name: 'Mira-sol', lat: 41.4866, lon: 2.0698 }
};

const METEO_ALIASES: Record<string, string> = {
  'BARCELONA': 'PC', 'SANT CUGAT': 'SC', 'UAB': 'UN'
};

function isStationCode(code: string): boolean {
  const u = code.trim().toUpperCase();
  return !!METEO_STATIONS[u] || !!METEO_ALIASES[u];
}

async function handleClima(chatId: number, args: string[]) {
  const inputRaw = args.join(' ').trim();
  const inputUpper = inputRaw.toUpperCase();
  let stationKey = METEO_STATIONS[inputUpper] ? inputUpper : (METEO_ALIASES[inputUpper] || null);

  if (!inputRaw || inputRaw === '') {
    const validCodes = Object.entries(METEO_STATIONS).map(([k, v]) => `<code>${k}</code> ${v.name}`).join('\n');
    await sendTelegramMessage(chatId, `<b>🌤️ Usa: <code>/clima [codi]</code></b>\n\n<b>Estacions:</b>\n${validCodes}`);
  } else if (!stationKey) {
    await sendTelegramMessage(chatId, `❌ Estació "<b>${inputRaw}</b>" no trobada.`);
  } else {
    const st = METEO_STATIONS[stationKey];
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${st.lat}&longitude=${st.lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Europe%2FBerlin`);
      const data = await res.json();
      if (data.current) {
        const temp = data.current.temperature_2m;
        const wind = data.current.wind_speed_10m;
        const code = data.current.weather_code;
        // Simple weather code to emoji mapping
        let emoji = '☁️';
        if (code === 0) emoji = '☀️';
        else if (code <= 3) emoji = '🌤️';
        else if (code >= 51 && code <= 67) emoji = '🌧️';
        else if (code >= 71 && code <= 77) emoji = '❄️';
        else if (code >= 95) emoji = '⛈️';

        const msg = `<b>🌤️ Clima a ${st.name}:</b>\n\n` +
                    `🌡️ <b>Temp:</b> ${temp}°C\n` +
                    `💨 <b>Vent:</b> ${wind} km/h\n` +
                    `🌈 <b>Estat:</b> ${emoji} (Codi: ${code})`;
        await sendTelegramMessage(chatId, msg);
      } else {
        await sendTelegramMessage(chatId, `❌ No s'han pogut carregar les dades per <b>${st.name}</b>.`);
      }
    } catch (e) {
      console.error('Error fetching weather:', e);
      await sendTelegramMessage(chatId, "❌ Error de connexió amb el servei meteorològic.");
    }
  }
}

serve(async (req: Request) => {
  try {
    const update = await req.json();
    console.log('Update received:', JSON.stringify(update));

    const now = new Date();
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now);
    const spainTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));

    if (update.callback_query) {
      const cqId = update.callback_query.id;
      const cqChatId = update.callback_query.message?.chat?.id;
      const cqData: string = update.callback_query.data || '';
      console.log(`Callback Query from ${cqChatId}: ${cqData}`);
      await answerCallbackQuery(cqId);

      if (cqChatId) {
        if (cqData.startsWith('pk__')) {
          const parts = cqData.split('__');
          if (parts.length === 3) {
            const pk = parseFloat(parts[1]);
            const segKey = parts[2];
            if (!isNaN(pk)) await sendTelegramMessage(cqChatId, getPkInfoText(pk, segKey));
          }
        } else if (cqData === 'menu__estat') await handleEstat(cqChatId, todayStr);
        else if (cqData === 'menu__reserves') await handleReserves(cqChatId, todayStr);
        else if (cqData === 'menu__torns') await handleTornsMenu(cqChatId);
        else if (cqData === 'menu__torns_mati') await handleTornsList(cqChatId, todayStr, 'mati');
        else if (cqData === 'menu__torns_tarda') await handleTornsList(cqChatId, todayStr, 'tarda');
        else if (cqData === 'menu__back') await handleHelp(cqChatId);
        else if (cqData === 'menu__disponibles') await handleDisponibles(cqChatId, todayStr);
        else if (cqData === 'menu__pk_prompt') {
          const keyboard = {
            inline_keyboard: [
              [{ text: 'PC/RE', callback_data: 'pkz__PCRE' }, { text: 'GR/TB', callback_data: 'pkz__GRTB' }],
              [{ text: 'SR/LP', callback_data: 'pkz__SRLP' }, { text: 'LP/TR', callback_data: 'pkz__LPTR' }],
              [{ text: 'LP/NA', callback_data: 'pkz__LPNA' }, { text: 'SC/PN', callback_data: 'pkz__SCPN' }],
              [{ text: 'BT/UN', callback_data: 'pkz__BTUN' }],
              [{ text: "🔙 Tornar", callback_data: 'menu__back' }]
            ]
          };
          await sendTelegramMessage(cqChatId, `📏 ${PROMPT_PK}:`, keyboard);
        } else if (cqData.startsWith('pkz__')) {
          const segKey = cqData.split('__')[1];
          const segLabel = SEG_LABELS[segKey] || segKey;
          await sendTelegramMessage(cqChatId, `📏 ${PROMPT_PK} per <b>${segLabel}</b>:`, { force_reply: true, selective: true });
        } else if (cqData === 'menu__clima_prompt') {
          await sendTelegramMessage(cqChatId, `🌤️ ${PROMPT_CLIMA}. <b>Example:</b> SC`, { force_reply: true, selective: true });
        } else if (cqData === 'menu__torn_prompt') {
          await sendTelegramMessage(cqChatId, `📋 ${PROMPT_TORN} (ex: Q004):`, { force_reply: true, selective: true });
        } else if (cqData === 'menu__qui_prompt') {
          await sendTelegramMessage(cqChatId, `👤 Indica la <b>UT</b> per ${PROMPT_QUI} (ex: 112.01):`, { force_reply: true, selective: true });
        } else if (cqData === 'menu__tren_prompt') {
          await sendTelegramMessage(cqChatId, `🚆 Indica la <b>UT</b> per conèixer ${PROMPT_TREN} (ex: 115.01):`, { force_reply: true, selective: true });
        } else if (cqData === 'menu__servei_prompt') {
          await sendTelegramMessage(cqChatId, `🎫 ${PROMPT_SERVEI} (ex: B107):`, { force_reply: true, selective: true });
        } else if (cqData === 'menu__all_commands') {
          const listMsg = `<b>⌨️ Comandes Disponibles:</b>\n\n` +
            `• <code>/torn [torn]</code> - Qui porta un torn\n` +
            `• <code>/qui [UT]</code> - Qui porta una unitat ara\n` +
            `• <code>/tren [UT]</code> - Estat i posició d'un tren\n` +
            `• <code>/servei [ID]</code> - Detall circulació y agent\n` +
            `• <code>/pk [valor]</code> - Info tècnica PK\n` +
            `• <code>/clima [estació]</code> - Clima xarxa\n` +
            `• <code>/reserves</code> - Agents en reserva avui\n` +
            `• <code>/estat</code> - Resum operativa actual`;
          
          const keyboard = {
            inline_keyboard: [
              [{ text: '📊 Estat Operativa', callback_data: 'menu__estat' }],
              [{ text: '🛡️ Reserves Avui', callback_data: 'menu__reserves' }, { text: '📋 Tots els Torns', callback_data: 'menu__torns' }],
              [{ text: '👤 Qui porta la UT?', callback_data: 'menu__qui_prompt' }, { text: '🚆 Estat Tren', callback_data: 'menu__tren_prompt' }],
              [{ text: '📋 Consulta Torn', callback_data: 'menu__torn_prompt' }, { text: '🎫 Detall Servei', callback_data: 'menu__servei_prompt' }],
              [{ text: '📏 Info PK', callback_data: 'menu__pk_prompt' }, { text: '🌤️ Clima', callback_data: 'menu__clima_prompt' }],
              [{ text: "🔙 Tornar", callback_data: 'menu__back' }]
            ]
          };
          await sendTelegramMessage(cqChatId, listMsg, keyboard);
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (update.message && update.message.from && !update.message.from.is_bot) {
      const chatId = update.message.chat.id;
      const msgText: string = (update.message.text || '').trim();
      const replyToMsg = update.message.reply_to_message;

      console.log(`Message from ${chatId}: "${msgText}"`);

      if (replyToMsg && replyToMsg.text) {
        const rt = replyToMsg.text;
        const rtLower = rt.toLowerCase();
        console.log(`Processing reply. Prompt: "${rt.substring(0, 40)}...", Input: "${msgText}"`);
        
        if (rtLower.includes(PROMPT_PK.toLowerCase())) {
          const segKey = Object.keys(SEG_LABELS).find(k => rtLower.includes(SEG_LABELS[k].toLowerCase())) || 'PCRE';
          const pkVal = parseFloat(msgText.replace(',', '.'));
          if (!isNaN(pkVal)) await sendTelegramMessage(chatId, getPkInfoText(pkVal, segKey));
          else await sendTelegramMessage(chatId, "❌ El valor del PK ha de ser numèric.");
        } else if (rtLower.includes(PROMPT_CLIMA.toLowerCase())) {
          await handleCommand('/clima', [msgText], chatId, todayStr, spainTime);
        } else if (rtLower.includes(PROMPT_TORN.toLowerCase())) {
          await handleCommand('/torn', [msgText], chatId, todayStr, spainTime);
        } else if (rtLower.includes(PROMPT_QUI.toLowerCase())) {
          await handleCommand('/qui', [msgText], chatId, todayStr, spainTime);
        } else if (rtLower.includes(PROMPT_TREN.toLowerCase())) {
          await handleCommand('/tren', [msgText], chatId, todayStr, spainTime);
        } else if (rtLower.includes(PROMPT_SERVEI.toLowerCase())) {
          await handleCommand('/servei', [msgText], chatId, todayStr, spainTime);
        } else {
          console.log(`Reply prompt not recognized: "${rt}"`);
          await sendTelegramMessage(chatId, "⚠️ No he pogut identificar el context d'aquesta resposta. Torna a seleccionar l'opció al menú.");
        }
      } else if (msgText.startsWith('/')) {
        const parts = msgText.trim().split(/\s+/);
        const command = parts[0].split('@')[0].toLowerCase();
        await handleCommand(command, parts.slice(1), chatId, todayStr, spainTime);
      } else {
        // Smart "naked" input parsing (when no command or reply context is used)
        const utRegex = /^\d{3}\.?\d{2}$/;
        const tornRegex = /^Q\d{3}$/i;
        const serveiRegex = /^[BFS]\d{3,4}$/i;

        if (utRegex.test(msgText)) {
          // If it matches a UT, normalize to XXX.YY and run /tren (most common use case)
          let normalizedUT = msgText;
          if (!msgText.includes('.') && msgText.length === 5) {
            normalizedUT = msgText.substring(0, 3) + '.' + msgText.substring(3);
          }
          await handleCommand('/tren', [normalizedUT], chatId, todayStr, spainTime);
        } else if (tornRegex.test(msgText)) {
          await handleCommand('/torn', [msgText.toUpperCase()], chatId, todayStr, spainTime);
        } else if (serveiRegex.test(msgText)) {
          await handleCommand('/servei', [msgText.toUpperCase()], chatId, todayStr, spainTime);
        } else if (msgText.length >= 2 && msgText.length <= 4 && isStationCode(msgText)) {
           // Maybe it's a station code for climate?
           await handleCommand('/clima', [msgText.toUpperCase()], chatId, todayStr, spainTime);
        }
      }
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('Fatal error in serve:', error);
    return new Response(JSON.stringify({ error: error.message || 'unknown' }), { status: 500 });
  }
});

