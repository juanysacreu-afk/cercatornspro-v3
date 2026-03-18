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

  // Filter out reserves (torns starting with QR)
  const nonReserves = assignments.filter((a: any) => !(a.torn && a.torn.toUpperCase().startsWith('QR')));
  
  // Filter mati (odd) or tarda (even)
  const filtered = nonReserves.filter((a: any) => {
    if (!a.torn) return false;
    const match = a.torn.match(/\d+/);
    if (!match) return false;
    const num = parseInt(match[0], 10);
    const isEven = num % 2 === 0;
    return mode === 'mati' ? !isEven : isEven;
  });

  // Sort alphabetically by torn
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

  if (text.length > 4000) {
    const chunks = text.match(/[\s\S]{1,3900}(?=\n|$)/g) || [text];
    for (const chunk of chunks) {
      await sendTelegramMessage(chatId, chunk);
    }
    // Send keyboard in a separate small message if it was split
    await sendTelegramMessage(chatId, "Opcions:", {
      inline_keyboard: [
        [{ text: '🔄 Actualitzar', callback_data: `menu__torns_${mode}` }],
        [{ text: '🔙 Tornar', callback_data: 'menu__torns' }]
      ]
    });
  } else {
    await sendTelegramMessage(chatId, text, {
      inline_keyboard: [
        [{ text: '🔄 Actualitzar', callback_data: `menu__torns_${mode}` }],
        [{ text: '🔙 Tornar', callback_data: 'menu__torns' }]
      ]
    });
  }
}

async function handleHelp(chatId: string | number) {
  const helpMsg = `<b>🤖 Assistent NEXUS</b>\n\nBenvolgut supervisor. Selecciona una opció o utilitza les ordres ràpides:\n\n` +
    `• <code>/torn [torn]</code> - Qui porta un torn\n` +
    `• <code>/qui [UT]</code> - Qui porta una unitat ara\n` +
    `• <code>/tren [UT]</code> - Estat i posició d'un tren\n` +
    `• <code>/servei [ID]</code> - Detall circulació y agent\n` +
    `• <code>/pk [valor]</code> - Info tècnica PK\n` +
    `• <code>/clima [estació]</code> - Clima xarxa`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '📊 Estat Operativa', callback_data: 'menu__estat' }],
      [{ text: '🛡️ Reserves Avui', callback_data: 'menu__reserves' }, { text: '📋 Tots els Torns', callback_data: 'menu__torns' }],
      [{ text: '📏 Info PK', callback_data: 'menu__pk_prompt' }, { text: '🌤️ Clima', callback_data: 'menu__clima_prompt' }]
    ]
  };
  await sendTelegramMessage(chatId, helpMsg, keyboard);
}

serve(async (req) => {
  try {
    const update = await req.json()
    console.log('Update received:', JSON.stringify(update));

    // Calculate today with Barcelona timezone (UTC+1)
    const now = new Date();
    // Simple offset for Spain/Europe
    const spainTime = new Date(now.getTime() + (1 * 60 * 60 * 1000));
    const todayStr = spainTime.toISOString().split('T')[0];

    // ─── CALLBACK QUERIES ─────────────────────────────────────────────────────
    if (update.callback_query) {
      const cqId = update.callback_query.id;
      const cqChatId = update.callback_query.message?.chat?.id;
      const cqData: string = update.callback_query.data || '';

      // Answer immediately
      await answerCallbackQuery(cqId);

      if (cqChatId) {
        if (cqData.startsWith('pk__')) {
          const parts = cqData.split('__');
          if (parts.length === 3) {
            const pk = parseFloat(parts[1]);
            const segKey = parts[2];
            if (!isNaN(pk)) {
              await sendTelegramMessage(cqChatId, getPkInfoText(pk, segKey));
            }
          }
        } else if (cqData === 'menu__estat') {
          await handleEstat(cqChatId, todayStr);
        } else if (cqData === 'menu__reserves') {
          await handleReserves(cqChatId, todayStr);
        } else if (cqData === 'menu__torns') {
          await handleTornsMenu(cqChatId);
        } else if (cqData === 'menu__torns_mati') {
          await handleTornsList(cqChatId, todayStr, 'mati');
        } else if (cqData === 'menu__torns_tarda') {
          await handleTornsList(cqChatId, todayStr, 'tarda');
        } else if (cqData === 'menu__back') {
          await handleHelp(cqChatId);
        } else if (cqData === 'menu__disponibles') {
          await handleDisponibles(cqChatId, todayStr);
        } else if (cqData === 'menu__pk_prompt') {
          const keyboard = {
            inline_keyboard: [
              [{ text: 'PC/RE', callback_data: 'pkz__PCRE' }, { text: 'GR/TB', callback_data: 'pkz__GRTB' }],
              [{ text: 'SR/LP', callback_data: 'pkz__SRLP' }, { text: 'LP/TR', callback_data: 'pkz__LPTR' }],
              [{ text: 'LP/NA', callback_data: 'pkz__LPNA' }, { text: 'SC/PN', callback_data: 'pkz__SCPN' }],
              [{ text: 'BT/UN', callback_data: 'pkz__BTUN' }],
              [{ text: "🔙 Tornar a l'Ajuda", callback_data: 'menu__back' }]
            ]
          };
          await sendTelegramMessage(cqChatId, "<b>📏 Selecciona el tram per consultar el PK:</b>", keyboard);
        } else if (cqData.startsWith('pkz__')) {
          const segKey = cqData.split('__')[1];
          const segLabel = SEG_LABELS[segKey] || segKey;
          await sendTelegramMessage(cqChatId, `📏 Indica el PK numèric per la zona <b>${segLabel}</b> (ex: 4.5):`, {
            force_reply: true,
            selective: true
          });
        } else if (cqData === 'menu__clima_prompt') {
          await sendTelegramMessage(cqChatId, "🌤️ Indica una estació o codi per veure el clima. <b>Exemple:</b> <code>/clima SC</code>");
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ─── MESSAGES ─────────────────────────────────────────────────────────────
    if (update.message && update.message.from && !update.message.from.is_bot) {
      const chatId = update.message.chat.id;
      const msgText: string = update.message.text || update.message.caption || '';

      // Save to database
      const senderName = [update.message.from.first_name, update.message.from.last_name].filter(Boolean).join(' ').trim();
      await supabase.from('telegram_messages').upsert([{
        id: update.message.message_id.toString(),
        text: msgText || '📨 Fitxer/Mèdia',
        sender_name: senderName || 'Usuari Telegram',
        sender_id: update.message.from.id.toString(),
        is_alert: false,
        created_at: new Date(update.message.date * 1000).toISOString()
      }], { onConflict: 'id' });

      // Check for ForceReply
      const replyToMsg = update.message.reply_to_message;
      if (replyToMsg && replyToMsg.text && replyToMsg.text.includes('Indica el PK numèric per la zona')) {
        let segKeyFound = '';
        for (const [key, label] of Object.entries(SEG_LABELS)) {
          if (replyToMsg.text.includes(label)) {
            segKeyFound = key;
            break;
          }
        }
        if (segKeyFound) {
          const pkVal = parseFloat(msgText.replace(',', '.'));
          if (!isNaN(pkVal)) {
            await sendTelegramMessage(chatId, getPkInfoText(pkVal, segKeyFound));
          } else {
            await sendTelegramMessage(chatId, "❌ El valor introduït no és un PK numèric vàlid.");
          }
        }
      } else if (msgText.startsWith('/')) {
        const parts = msgText.trim().split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        // /ajuda
        if (command === '/ajuda' || command === '/start') {
          await handleHelp(chatId);
        }

        // /torn
        else if (command === '/torn') {
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
        }

        // /reserves
        else if (command === '/reserves') {
          await handleReserves(chatId, todayStr);
        }

        // /disponibles (Alias of /reserves but more focused on "Now")
        else if (command === '/disponibles') {
          await handleDisponibles(chatId, todayStr);
        }

        // /estat
        else if (command === '/estat') {
          await handleEstat(chatId, todayStr);
        }

        // /qui [UT]
        else if (command === '/qui') {
          const ut = args[0];
          if (!ut) {
            await sendTelegramMessage(chatId, '❌ Indica una UT. Ex: <code>/qui 112.01</code>');
          } else {
            // Since we don't have live service_id in train_status, we look at current assignments or positions
            const { data: train } = await supabase.from('train_status').select('*').eq('train_number', ut).single();
            if (train) {
              await sendTelegramMessage(chatId, `🚆 <b>UT ${ut}:</b> No es pot determinar l'agent en temps real sense dades de GPS. Consulta <code>/torn</code> si coneixes el torn.`);
            } else {
              await sendTelegramMessage(chatId, `⚠️ UT ${ut} no trobada.`);
            }
          }
        }

        // /tren [UT]
        else if (command === '/tren') {
          const ut = args[0];
          if (!ut) {
            await sendTelegramMessage(chatId, '❌ Indica una UT. Ex: <code>/tren 112.01</code>');
            return;
          }
          const { data: train } = await supabase.from('train_status').select('*').eq('train_number', ut).single();
          if (train) {
            let t = `<b>🚆 Info Unitat ${ut}:</b>\n\n`;
            t += `🔧 <b>Estat:</b> ${train.is_broken ? '🔴 AVARIADA' : '🟢 OK'}\n`;
            if (train.broken_notes) t += `📝 <b>Notes:</b> ${train.broken_notes}\n`;
            t += `🧽 <b>Neteja:</b> ${train.needs_cleaning ? '🟠 Pendent' : '🟢 OK'}\n`;

            // Check if parked
            const { data: parked } = await supabase.from('parked_units').select('*').eq('unit_number', ut).single();
            if (parked) {
              t += `📍 <b>Posició:</b> Estacionada a ${parked.depot_id} (Via ${parked.track})\n`;
            } else {
              t += `📍 <b>Posició:</b> En servei (Sense dades de GPS en temps real).\n`;
            }
            await sendTelegramMessage(chatId, t);
          } else await sendTelegramMessage(chatId, `⚠️ UT ${ut} no trobada.`);
        }

        // /servei [codi_circulacio]
        else if (command === '/servei') {
          const input = args[0]?.trim();
          if (!input) {
            await sendTelegramMessage(chatId, "❌ Indica un codi de circulació. Ex: <code>/servei B107</code>");
          } else {
            const searchId = input.toUpperCase();

            // 1. Search for the circulation in the catalog
            const { data: circs } = await supabase
              .from('circulations')
              .select('*')
              .or(`id.eq.${searchId},id.ilike.%${searchId}`)
              .limit(1);

            if (!circs || circs.length === 0) {
              await sendTelegramMessage(chatId, `⚠️ No s'ha trobat la circulació <b>${searchId}</b> al catàleg.`);
            } else {
              const circ = circs[0];
              const finalCode = circ.id;

              // 2. Find the shift (torn) containing this service
              const { data: shiftData } = await supabase
                .from('shifts')
                .select('*')
                .contains('circulations', JSON.stringify([{ codi: finalCode }]));

              if (!shiftData || shiftData.length === 0) {
                await sendTelegramMessage(chatId, `⚠️ No s'ha trobat cap torn amb la circulació <b>${finalCode}</b>.`);
              } else {
                const shift = shiftData[0];
                const tornId = getShortId(shift.id);

                // 3. Find assigned driver
                const { data: assignments } = await supabase
                  .from('daily_assignments')
                  .select('*')
                  .eq('data_servei', todayStr);

                const direct = assignments?.find(a => getShortId(a.torn) === tornId);
                const cover = assignments?.find(a => a.observacions?.toUpperCase().includes(`COBREIX ${tornId}`));

                const mainDriver = direct ? `${direct.nom} ${direct.cognoms}` : 'Sense assignar';
                const coverDriver = cover ? ` (Cobreix: ${cover.nom} ${cover.cognoms} del torn ${cover.torn})` : '';

                // 4. Estimate position from schedule
                const nowTime = spainTime.toTimeString().substring(0, 8); // "HH:MM:SS"
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

                let msg = `<b>🎫 Circulació ${finalCode}</b>\n\n`;
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
        }

        // /pk [valor]
        else if (command === '/pk') {
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
        }

        // /clima [estació]
        // Accepts: station codes (PC, GR, SA, RE, TB, LP, SC, BT, UN, RB, TR, NA, PN, DN...)
        //          or full/partial names
        else if (command === '/clima') {
          // Full FGC network station map with GPS coords
          const STATIONS: Record<string, { name: string; lat: number; lon: number }> = {
            // Línia PC-RE (L6)
            'PC': { name: 'Plaça Catalunya', lat: 41.3875, lon: 2.1696 },
            'GR': { name: 'Gràcia', lat: 41.3984, lon: 2.1562 },
            'PA': { name: 'Provença / Diagonal', lat: 41.3917, lon: 2.1486 },
            'SA': { name: 'Sarrià', lat: 41.3974, lon: 2.1233 },
            'RE': { name: 'Reina Elisenda', lat: 41.3965, lon: 2.1095 },
            // Línia GR-TB (L7)
            'TB': { name: 'Av. Tibidabo', lat: 41.4152, lon: 2.1326 },
            // Línia SR-LP
            'SR': { name: 'Sarrià (LP)', lat: 41.3974, lon: 2.1233 },
            'BO': { name: 'Bonanova / Tres Torres', lat: 41.4028, lon: 2.1318 },
            'PU': { name: 'Putget', lat: 41.4089, lon: 2.1392 },
            'LS': { name: 'La Floresta', lat: 41.4453, lon: 2.0862 },
            'LP': { name: 'Les Planes', lat: 41.4399, lon: 2.0769 },
            // Línia LP-TR (S1, S5, S55)
            'SC': { name: 'Sant Cugat del Vallès', lat: 41.4716, lon: 2.0783 },
            'MV': { name: 'Mira-sol', lat: 41.4866, lon: 2.0698 },
            'VK': { name: 'Volpelleres', lat: 41.4948, lon: 2.0641 },
            'BT': { name: 'Bellaterra', lat: 41.4980, lon: 2.0820 },
            'UN': { name: 'Universitat Autònoma', lat: 41.5006, lon: 2.0952 },
            'CD': { name: 'Can Domènech', lat: 41.5115, lon: 2.0870 },
            'CF': { name: 'Cerdanyola del Vallès', lat: 41.5197, lon: 2.1014 },
            'SS': { name: 'Sabadell Sud', lat: 41.5296, lon: 2.1048 },
            'SE': { name: 'Sabadell Estació', lat: 41.5396, lon: 2.1085 },
            'SM': { name: 'Sabadell Plaça Major', lat: 41.5443, lon: 2.1076 },
            'PN': { name: 'Sabadell Parc del Nord', lat: 41.5494, lon: 2.1065 },
            // Rubí branch  
            'RB': { name: 'Rubí', lat: 41.4870, lon: 2.0335 },
            'CS': { name: 'Can Canyameres', lat: 41.5041, lon: 2.0255 },
            'CU': { name: 'Can Abellet', lat: 41.5148, lon: 2.0172 },
            // Terrassa
            'TR': { name: 'Terrassa Rambla', lat: 41.5605, lon: 2.0073 },
            'TE': { name: 'Terrassa Estació', lat: 41.5591, lon: 2.0072 },
            'NA': { name: 'Nacions Unides (Terrassa)', lat: 41.5648, lon: 2.0102 },
            'DN': { name: 'Depòsit de Nacions Unides', lat: 41.5662, lon: 2.0120 },
            // Depòsits / cocheras
            'DRE': { name: 'Dipòsit Reina Elisenda', lat: 41.3960, lon: 2.1090 },
            'DPC': { name: 'Dipòsit Pl. Catalunya', lat: 41.3878, lon: 2.1695 },
            'DPN': { name: 'Dipòsit Parc del Nord', lat: 41.5510, lon: 2.1060 },
          };

          // Normalize aliases and full names
          const ALIASES: Record<string, string> = {
            'BARCELONA': 'PC', 'PLAÇA CATALUNYA': 'PC', 'PLACA CATALUNYA': 'PC', 'PLACACATALUNYA': 'PC',
            'GRACIA': 'GR', 'GRÀCIA': 'GR',
            'SARRIA': 'SA', 'SARRIÀ': 'SA',
            'REINA ELISENDA': 'RE', 'REINAELISENDA': 'RE',
            'TIBIDABO': 'TB', 'AV TIBIDABO': 'TB', 'AVINGUDA TIBIDABO': 'TB',
            'LES PLANES': 'LP', 'LESPLANES': 'LP', 'PLANES': 'LP',
            'SANT CUGAT': 'SC', 'SANTCUGAT': 'SC', 'CUGAT': 'SC', 'ST CUGAT': 'SC',
            'BELLATERRA': 'BT',
            'UAB': 'UN', 'UNIVERSITAT AUTONOMA': 'UN', 'UNIVERSITAT AUTÒNOMA': 'UN',
            'RUBI': 'RB', 'RUBÍ': 'RB',
            'TERRASSA': 'TR', 'TERRASSA RAMBLA': 'TR', 'TERRASSARAMBLA': 'TR',
            'NACIONS UNIDES': 'NA', 'NACIONSUNIDES': 'NA',
            'SABADELL': 'SM', 'SABADELL PLACA MAJOR': 'SM', 'SABADELL PLAÇA MAJOR': 'SM',
            'SABADELL SUD': 'SS', 'SABADELLSUD': 'SS',
            'SABADELL NORD': 'PN', 'PARC DEL NORD': 'PN', 'PARCNORD': 'PN',
            'CERDANYOLA': 'CF', 'CERDANYOLA DEL VALLES': 'CF',
            'MIRA-SOL': 'MV', 'MIRASOL': 'MV',
          };

          const inputRaw = args.join(' ').trim();
          const inputUpper = inputRaw.toUpperCase();

          // Look up by code or alias
          let stationKey = STATIONS[inputUpper] ? inputUpper : (ALIASES[inputUpper] || null);

          if (!inputRaw) {
            // No input: list all available stations
            const validCodes = Object.entries(STATIONS).map(([k, v]) => `<code>${k}</code> ${v.name}`).join('\n');
            await sendTelegramMessage(chatId,
              `<b>🌤️ Usa: <code>/clima [codi estació]</code></b>\n\n<b>Estacions disponibles:</b>\n${validCodes}`
            );
          } else if (!stationKey) {
            // Not found
            await sendTelegramMessage(chatId,
              `❌ Estació "<b>${inputRaw}</b>" no trobada.\n\nUsa <code>/clima</code> per veure les estacions disponibles.`
            );
          } else {
            const st = STATIONS[stationKey];
            try {
              const params = [
                `latitude=${st.lat}`,
                `longitude=${st.lon}`,
                `current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day,visibility,precipitation_probability,cloud_cover,pressure_msl`,
                `daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max,wind_speed_10m_max`,
                `timezone=Europe%2FBerlin`,
                `forecast_days=1`
              ].join('&');
              const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
              const data = await res.json();
              if (data.current) {
                const c = data.current;
                const dy = data.daily;
                const wc = c.weather_code;
                const isDay = c.is_day === 1;
                const WMO: Record<number, string> = {
                  0: 'Cel clar', 1: 'Principalment clar', 2: 'Parcialment nuvolat', 3: 'Cobert',
                  45: 'Boira', 48: 'Boira gelant', 51: 'Plugim fi', 61: 'Pluja lleu',
                  63: 'Pluja moderada', 65: 'Pluja forta', 71: 'Neu lleu', 73: 'Neu moderada',
                  75: 'Neu forta', 80: 'Ruixats lleus', 81: 'Ruixats moderats', 82: 'Ruixats violents',
                  95: 'Tempesta', 96: 'Tempesta amb calamarsa', 99: 'Tempesta forta'
                };
                const desc = WMO[wc] || 'Variable';
                let emoji = isDay ? '☀️' : '🌙';
                if (wc >= 1 && wc <= 3) emoji = '⛅';
                else if (wc === 45 || wc === 48) emoji = '🌫️';
                else if (wc >= 51 && wc <= 57) emoji = '🌦️';
                else if (wc >= 61 && wc <= 67) emoji = '🌧️';
                else if (wc >= 71 && wc <= 77) emoji = '❄️';
                else if (wc >= 80 && wc <= 82) emoji = '🌧️';
                else if (wc >= 95) emoji = '⛈️';
                const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
                const windDir = dirs[Math.round((c.wind_direction_10m || 0) / 22.5) % 16];
                const visKm = Math.round((c.visibility || 0) / 100) / 10;
                const uvVal = Math.round(dy.uv_index_max?.[0] ?? 0);
                const uvLabel = uvVal <= 2 ? 'Baix' : uvVal <= 5 ? 'Moderat' : uvVal <= 7 ? 'Alt' : uvVal <= 10 ? 'Molt alt' : 'Extrem';
                const fmt = (iso: string) => { try { return new Date(iso).toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' }); } catch { return '--'; } };
                const alerts: string[] = [];
                if (visKm < 1) alerts.push('⚠️ <b>VISIBILITAT REDUÏDA</b> (&lt;1 km)');
                if ((c.wind_gusts_10m || 0) > 60) alerts.push(`⚠️ <b>RATXES FORTES</b> (${Math.round(c.wind_gusts_10m)} km/h)`);
                if (wc >= 95) alerts.push('⚠️ <b>TEMPESTA ACTIVA</b>');
                let msg = `<b>${emoji} Clima a ${st.name} (${stationKey})</b>\n<i>${desc}</i>\n\n`;
                msg += `🌡️ <b>Temperatura:</b> ${Math.round(c.temperature_2m)} °C <i>(sensació ${Math.round(c.apparent_temperature)} °C)</i>\n`;
                msg += `🔼 <b>Màx/Mín:</b> ${Math.round(dy.temperature_2m_max?.[0] ?? 0)}° / ${Math.round(dy.temperature_2m_min?.[0] ?? 0)}°\n`;
                msg += `\n💧 <b>Humitat:</b> ${c.relative_humidity_2m}%\n`;
                msg += `☁️ <b>Nuvolositat:</b> ${c.cloud_cover}%\n`;
                msg += `👁 <b>Visibilitat:</b> ${visKm} km\n`;
                msg += `🌧️ <b>Prob. precipitació:</b> ${c.precipitation_probability || 0}% <i>(${Math.round((dy.precipitation_sum?.[0] ?? 0) * 10) / 10} mm previstos)</i>\n`;
                msg += `\n💨 <b>Vent:</b> ${Math.round(c.wind_speed_10m)} km/h ${windDir}\n`;
                msg += `💥 <b>Ratxes màx.:</b> ${Math.round(c.wind_gusts_10m || 0)} km/h\n`;
                msg += `🔘 <b>Pressió:</b> ${Math.round(c.pressure_msl)} hPa\n`;
                msg += `\n🌅 <b>Sortida / Posta sol:</b> ${fmt(dy.sunrise?.[0])} / ${fmt(dy.sunset?.[0])}\n`;
                msg += `☀️ <b>Índex UV màx.:</b> ${uvVal} <i>(${uvLabel})</i>\n`;
                if (alerts.length > 0) msg += `\n${alerts.join('\n')}`;
                msg += `\n\n<i>Open-Meteo · temps real</i>`;
                await sendTelegramMessage(chatId, msg);
              } else {
                await sendTelegramMessage(chatId, '❌ Error en obtenir dades de clima.');
              }
            } catch { await sendTelegramMessage(chatId, '❌ Error en consultar el clima.'); }
          }
        }
      }
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
})
