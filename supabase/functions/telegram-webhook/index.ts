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

async function sendTelegramMessage(chatId: string | number, text: string, replyMarkup?: any) {
  if (!botToken) return;
  try {
    const body: any = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    };
    if (replyMarkup) body.reply_markup = replyMarkup;

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
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

// Common logic functions for bot operations
async function handleEstat(chatId: string | number, todayStr: string) {
  const { data: assignments } = await supabase.from('daily_assignments').select('torn, observacions').eq('data_servei', todayStr);
  const { data: broken } = await supabase.from('train_status').select('train_number').eq('is_broken', true);
  const freeQR = assignments?.filter(a => a.torn?.startsWith('QR') && !a.observacions?.toUpperCase().includes('COBREIX')).length || 0;
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
    const free = assignments.filter(a => !a.observacions?.toUpperCase().includes('COBREIX'));
    const busy = assignments.filter(a => a.observacions?.toUpperCase().includes('COBREIX'));
    let text = `<b>🛡️ Reserves (${todayStr}):</b>\n\n✅ <b>Lliures:</b>\n`;
    free.forEach(f => text += `• ${f.torn}: ${f.cognoms}\n`);
    if (busy.length > 0) {
      text += `\n⚠️ <b>Ocupats:</b>\n`;
      busy.forEach(b => text += `• ${b.torn}: ${b.cognoms}\n`);
    }
    await sendTelegramMessage(chatId, text);
  }
}

async function handleDisponibles(chatId: string | number, todayStr: string) {
  const { data: assignments } = await supabase.from('daily_assignments').select('*').eq('data_servei', todayStr).ilike('torn', 'QR%');
  const free = assignments?.filter(a => !a.observacions?.toUpperCase().includes('COBREIX')) || [];

  if (free.length === 0) {
    await sendTelegramMessage(chatId, "📭 No hi ha agents de reserva disponibles ara mateix.");
  } else {
    let text = `<b>👨‍✈️ Agents Disponibles Ara:</b>\n\n`;
    free.forEach(a => text += `• <b>${a.torn}</b>: ${a.cognoms}, ${a.nom}\n`);
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
      const direct = assignments?.find(a => getShortId(a.torn) === shortSearch);
      const cover = assignments?.find(a => a.observacions?.toUpperCase().includes(`COBREIX ${shortSearch}`));
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
    const ut = args[0];
    if (!ut) {
      await sendTelegramMessage(chatId, '❌ Indica una UT. Ex: <code>/qui 112.01</code>');
    } else {
      const { data: train } = await supabase.from('train_status').select('*').eq('train_number', ut).single();
      if (train) {
        await sendTelegramMessage(chatId, `🚆 <b>UT ${ut}:</b> No es pot determinar l'agent en temps real sense dades de GPS. Consulta <code>/torn</code> si coneixes el torn.`);
      } else {
        await sendTelegramMessage(chatId, `⚠️ UT ${ut} no trobada.`);
      }
    }
  } else if (command === '/tren') {
    const ut = args[0];
    if (!ut) {
      await sendTelegramMessage(chatId, '❌ Indica una UT. Ex: <code>/tren 112.01</code>');
    } else {
      const { data: train } = await supabase.from('train_status').select('*').eq('train_number', ut).single();
      if (train) {
        let t = `<b>🚆 Info Unitat ${ut}:</b>\n\n`;
        t += `🔧 <b>Estat:</b> ${train.is_broken ? '🔴 AVARIADA' : '🟢 OK'}\n`;
        if (train.broken_notes) t += `📝 <b>Notes:</b> ${train.broken_notes}\n`;
        t += `🧽 <b>Neteja:</b> ${train.needs_cleaning ? '🟠 Pendent' : '🟢 OK'}\n`;
        const { data: parked } = await supabase.from('parked_units').select('*').eq('unit_number', ut).single();
        if (parked) t += `📍 <b>Posició:</b> Estacionada a ${parked.depot_id} (Via ${parked.track})\n`;
        else t += `📍 <b>Posició:</b> En servei (Sense dades de GPS en temps real).\n`;
        await sendTelegramMessage(chatId, t);
      } else await sendTelegramMessage(chatId, `⚠️ UT ${ut} no trobada.`);
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
          const direct = assignments?.find(a => getShortId(a.torn) === tornId);
          const cover = assignments?.find(a => a.observacions?.toUpperCase().includes(`COBREIX ${tornId}`));
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

async function handleClima(chatId: number, args: string[]) {
  const STATIONS: Record<string, { name: string; lat: number; lon: number }> = {
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
  const ALIASES: Record<string, string> = {
    'BARCELONA': 'PC', 'SANT CUGAT': 'SC', 'UAB': 'UN'
  };
  const inputRaw = args.join(' ').trim();
  const inputUpper = inputRaw.toUpperCase();
  let stationKey = STATIONS[inputUpper] ? inputUpper : (ALIASES[inputUpper] || null);

  if (!inputRaw) {
    const validCodes = Object.entries(STATIONS).map(([k, v]) => `<code>${k}</code> ${v.name}`).join('\n');
    await sendTelegramMessage(chatId, `<b>🌤️ Usa: <code>/clima [codi]</code></b>\n\n<b>Estacions:</b>\n${validCodes}`);
  } else if (!stationKey) {
    await sendTelegramMessage(chatId, `❌ Estació "<b>${inputRaw}</b>" no trobada.`);
  } else {
    const st = STATIONS[stationKey];
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${st.lat}&longitude=${st.lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Europe%2FBerlin`);
      const data = await res.json();
      if (data.current) {
        const c = data.current;
        await sendTelegramMessage(chatId, `<b>🌤️ Clima a ${st.name}</b>\n🌡️ <b>Temp:</b> ${Math.round(c.temperature_2m)}°C\n💨 <b>Vent:</b> ${Math.round(c.wind_speed_10m)} km/h`);
      }
    } catch { await sendTelegramMessage(chatId, '❌ Error al consultar el clima.'); }
  }
}

serve(async (req) => {
  try {
    const update = await req.json();
    const now = new Date();
    const spainTime = new Date(now.getTime() + (1 * 60 * 60 * 1000));
    const todayStr = spainTime.toISOString().split('T')[0];

    if (update.callback_query) {
      const cqId = update.callback_query.id;
      const cqChatId = update.callback_query.message?.chat?.id;
      const cqData: string = update.callback_query.data || '';
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
          await sendTelegramMessage(cqChatId, "<b>📏 Selecciona el tram per consultar el PK:</b>", keyboard);
        } else if (cqData.startsWith('pkz__')) {
          const segKey = cqData.split('__')[1];
          const segLabel = SEG_LABELS[segKey] || segKey;
          await sendTelegramMessage(cqChatId, `📏 Indica el PK numèric per <b>${segLabel}</b>:`, { force_reply: true, selective: true });
        } else if (cqData === 'menu__clima_prompt') {
          await sendTelegramMessage(cqChatId, "🌤️ Indica una estació. <b>Exemple:</b> /clima SC", { force_reply: true, selective: true });
        } else if (cqData === 'menu__torn_prompt') {
          await sendTelegramMessage(cqChatId, "📋 Indica el <b>torn</b> a consultar (ex: Q004):", { force_reply: true, selective: true });
        } else if (cqData === 'menu__qui_prompt') {
          await sendTelegramMessage(cqChatId, "👤 Indica la <b>UT</b> per saber qui la porta (ex: 112.01):", { force_reply: true, selective: true });
        } else if (cqData === 'menu__tren_prompt') {
          await sendTelegramMessage(cqChatId, "🚆 Indica la <b>UT</b> per veure estat i posició (ex: 115.01):", { force_reply: true, selective: true });
        } else if (cqData === 'menu__servei_prompt') {
          await sendTelegramMessage(cqChatId, "🎫 Indica el <b>codi de circulació</b> (ex: B107):", { force_reply: true, selective: true });
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
      const msgText: string = update.message.text || '';
      const replyToMsg = update.message.reply_to_message;

      if (replyToMsg && replyToMsg.text) {
        if (replyToMsg.text.includes('Indica el PK numèric')) {
          const segKey = Object.keys(SEG_LABELS).find(k => replyToMsg.text.includes(SEG_LABELS[k])) || 'PCRE';
          const pkVal = parseFloat(msgText.replace(',', '.'));
          if (!isNaN(pkVal)) await sendTelegramMessage(chatId, getPkInfoText(pkVal, segKey));
        } else if (replyToMsg.text.includes('Indica una estació')) {
          await handleCommand('/clima', [msgText], chatId, todayStr, spainTime);
        } else if (replyToMsg.text.includes('Indica el torn a consultar')) {
          await handleCommand('/torn', [msgText], chatId, todayStr, spainTime);
        } else if (replyToMsg.text.includes('Indica la UT per saber qui la porta')) {
          await handleCommand('/qui', [msgText], chatId, todayStr, spainTime);
        } else if (replyToMsg.text.includes('Indica la UT per veure estat i posició')) {
          await handleCommand('/tren', [msgText], chatId, todayStr, spainTime);
        } else if (replyToMsg.text.includes('Indica el codi de circulació')) {
          await handleCommand('/servei', [msgText], chatId, todayStr, spainTime);
        }
      } else if (msgText.startsWith('/')) {
        const parts = msgText.trim().split(/\s+/);
        await handleCommand(parts[0].toLowerCase(), parts.slice(1), chatId, todayStr, spainTime);
      }
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
