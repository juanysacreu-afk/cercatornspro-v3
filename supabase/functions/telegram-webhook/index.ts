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

async function sendTelegramMessage(chatId: string | number, text: string) {
  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN not found');
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.result) {
        // Save BOT response to database so it appears in the Web App
        const botMsg = {
          id: `bot-${data.result.message_id}`,
          text: text.replace(/<[^>]*>/g, ''), // Strip HTML for the DB view if preferred, or keep it
          sender_name: '🤖 BOT NEXUS',
          sender_id: 'bot',
          is_alert: false,
          created_at: new Date(data.result.date * 1000).toISOString()
        };
        await supabase.from('telegram_messages').upsert([botMsg], { onConflict: 'id' });
      }
    } else {
      const err = await res.text();
      console.error('Error sending message to Telegram:', err);
    }
  } catch (e) {
    console.error('Fetch error sending to Telegram:', e);
  }
}

serve(async (req) => {
  try {
    const update = await req.json()

    if (update.message && update.message.from && !update.message.from.is_bot) {
      const chatId = update.message.chat.id;
      let msgText = ''
      if (update.message.text) {
        msgText = update.message.text
      } else if (update.message.caption) {
        msgText = update.message.caption
      } else if (update.message.document) {
        msgText = `📎 Fitxer enviat: ${update.message.document.file_name || 'Document'}`
      } else if (update.message.photo) {
        msgText = '📷 Imatge enviada'
      } else if (update.message.voice || update.message.audio) {
        msgText = '🎤 Àudio enviat'
      } else if (update.message.sticker) {
        msgText = '📌 Sticker'
      } else if (update.message.video || update.message.video_note) {
        msgText = '📹 Vídeo enviat'
      } else if (update.message.location) {
        msgText = '📍 Ubicació compartida'
      } else if (update.message.poll) {
        msgText = '📊 Enquesta compartida'
      } else {
        return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: { 'Content-Type': 'application/json' } })
      }

      // 1. Save USER message to DB
      const senderName = [update.message.from.first_name, update.message.from.last_name].filter(Boolean).join(' ').trim()
      const newMessage = {
        id: update.message.message_id.toString(),
        text: msgText,
        sender_name: senderName || 'Usuari Telegram',
        sender_id: update.message.from.id.toString(),
        is_alert: false,
        created_at: new Date(update.message.date * 1000).toISOString()
      }
      await supabase.from('telegram_messages').upsert([newMessage], { onConflict: 'id' })

      // 2. Handle Commands
      if (msgText.startsWith('/')) {
        const parts = msgText.split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        const todayStr = new Date().toISOString().split('T')[0];

        if (command === '/ajuda' || command === '/start') {
          const helpMsg = `<b>🤖 Assistent de Consulta CCO</b>\n\nBenvolgut supervisor. Pots utilitzar aquestes ordres:\n\n` +
            `• <code>/torn [torn]</code> - Consulta qui porta un torn\n` +
            `• <code>/reserves</code> - Disponibilitat de reserves\n` +
            `• <code>/estat</code> - Resum ràpid operativa`;
          await sendTelegramMessage(chatId, helpMsg);
        }

        else if (command === '/torn') {
          const target = args[0];
          if (!target) {
            await sendTelegramMessage(chatId, "❌ Indica un torn. Ex: <code>/torn Q004</code>");
          } else {
            const shortSearch = getShortId(target);
            const { data: assignments } = await supabase
              .from('daily_assignments')
              .select('*')
              .eq('data_servei', todayStr);

            const direct = assignments?.find(a => getShortId(a.torn) === shortSearch);
            const cover = assignments?.find(a => a.observacions?.toUpperCase().includes(`COBREIX ${shortSearch}`));

            if (direct || cover) {
              let text = `<b>📋 Info Torn ${shortSearch.toUpperCase()}:</b>\n\n`;
              if (direct) {
                text += `👤 <b>Assignat:</b> ${direct.nom} ${direct.cognoms}\n`;
                if (direct.observacions) text += `📝 <b>Obs:</b> ${direct.observacions}\n`;
              }
              if (cover) {
                text += `↺ <b>Cobert per:</b> ${cover.nom} ${cover.cognoms} (des de torn ${cover.torn})\n`;
              }
              await sendTelegramMessage(chatId, text);
            } else {
              await sendTelegramMessage(chatId, `⚠️ El torn <b>${shortSearch}</b> no té agent assignat.`);
            }
          }
        }

        else if (command === '/reserves') {
          const { data: assignments } = await supabase
            .from('daily_assignments')
            .select('*')
            .eq('data_servei', todayStr)
            .ilike('torn', 'QR%');

          if (!assignments || assignments.length === 0) {
            await sendTelegramMessage(chatId, "📭 No hi ha torns de reserva.");
          } else {
            const free = assignments.filter(a => !a.observacions?.toUpperCase().includes('COBREIX'));
            const busy = assignments.filter(a => a.observacions?.toUpperCase().includes('COBREIX'));

            let text = `<b>🛡️ Reserves:</b>\n\n`;
            text += `✅ <b>LLIURES (${free.length}):</b>\n`;
            free.forEach(f => text += `• ${f.torn}: ${f.cognoms}\n`);

            if (busy.length > 0) {
              text += `\n⚠️ <b>OCUPATS (${busy.length}):</b>\n`;
              busy.forEach(b => {
                const match = b.observacions.toUpperCase().match(/COBREIX\\s+([A-Z0-9]+)/);
                const target = match ? match[1] : 'altre torn';
                text += `• ${b.torn}: ${b.cognoms} → ${target}\n`;
              });
            }
            await sendTelegramMessage(chatId, text);
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Error processing webhook payload:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
