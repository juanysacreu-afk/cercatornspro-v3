import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
const chatId = Deno.env.get('TELEGRAM_CHAT_ID')

const supabase = createClient(supabaseUrl!, supabaseServiceKey!)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const currentDate = new Date();
    // Use Intl.DateTimeFormat to reliably parse the hour in Spain timezone.
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      hour12: false
    });
    const hourStr = formatter.format(currentDate);
    const hour = parseInt(hourStr, 10);

    const spainTimeStr = currentDate.toLocaleString('en-US', { timeZone: 'Europe/Madrid' });
    const spainTime = new Date(spainTimeStr);
    
    let effectiveDate = new Date(spainTime);
    if (hour < 3) {
      effectiveDate.setDate(effectiveDate.getDate() - 1);
    }
    
    const y = effectiveDate.getFullYear();
    const m = String(effectiveDate.getMonth() + 1).padStart(2, '0');
    const d = String(effectiveDate.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    let slot = 0;
    let greeting = 'Bon dia';
    if (hour >= 20 || hour < 4) {
      slot = 2;
      greeting = 'Bona nit';
    } else if (hour >= 12 && hour < 20) {
      slot = 1;
      greeting = 'Bona tarda';
    }

    const { data: log } = await supabase
      .from('briefing_logs')
      .select('*')
      .eq('date', todayStr)
      .eq('slot', slot)
      .single();

    if (log) {
      return new Response(JSON.stringify({ ok: true, message: 'Briefing for this slot already sent' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    let weatherInfo = '';
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=41.4716&longitude=2.0783&current=temperature_2m,weather_code&forecast_days=1`);
      const weather = await res.json();
      if (weather.current) {
        const wc = weather.current.weather_code;
        const temp = Math.round(weather.current.temperature_2m);
        const WMO: Record<number, string> = {
          0: 'Cel clar ☀️', 1: 'Principalment clar 🌤️', 2: 'Parcialment nuvolat ⛅', 3: 'Cobert ☁️',
          45: 'Boira 🌫️', 48: 'Boira gelant 🌫️', 51: 'Plugim fi 🌦️', 61: 'Pluja lleu 🌧️',
          63: 'Pluja moderada 🌧️', 65: 'Pluja forta 🌧️', 95: 'Tempesta ⛈️'
        };
        weatherInfo = `${WMO[wc] || 'Temps variable'} con ${temp}°C.`;
      }
    } catch (e) {
      console.error('Weather error:', e);
    }

    const { data: calendar } = await supabase.from('service_calendar').select('service_id').eq('date', todayStr).single();
    let serviceId = calendar?.service_id;
    if (!serviceId) {
      const day = effectiveDate.getDay();
      if (day === 0) serviceId = '500';
      else if (day === 6) serviceId = '400';
      else if (day === 5) serviceId = '100';
      else serviceId = '000';
    }

    const { data: assignments } = await supabase.from('daily_assignments').select('*').eq('data_servei', todayStr);
    const isLoaded = assignments && assignments.length > 0;

    let opStatus = '';
    let isAlert = false;
    if (isLoaded) {
      const uncovered = assignments.filter(a => !a.empleat_id || (a.observacions && a.observacions.toUpperCase().includes('DESCUBIERTO')) || (a.observacions && a.observacions.toUpperCase().includes('FALTA'))).length;
      const indisposed = assignments.filter(a => (a.observacions && a.observacions.toUpperCase().includes('INDISP')) || (a.nom && a.nom.toUpperCase().includes('INDISP'))).length;
      if (uncovered > 0 || indisposed > 0) {
        isAlert = true;
        opStatus = `⚠️ Atenció: Avui hi ha <b>${uncovered}</b> torns descoberts i <b>${indisposed}</b> agents indisposats.`;
      } else {
        opStatus = `✅ Tot en ordre: Tots els torns estan coberts.`;
      }
    } else {
      isAlert = true;
      opStatus = `⚠️ <b>El servei d'avui encara no s'ha carregat.</b> Et recomanem fer-ho ara.`;
    }

    const htmlMsg = `<b>🌟 ${greeting} Equip NEXUS!</b>\n\n` +
      `📅 <b>Data:</b> ${todayStr}\n` +
      `📌 <b>Servei:</b> ${serviceId}\n` +
      `🌤️ <b>Temps:</b> ${weatherInfo}\n\n` +
      `${opStatus}\n\n` +
      `Utilitza el menú inferior per a consultes ràpides sobre el servei.\n\n` +
      `Que tinguis un bon servei! 🚄✨`;

    const rawMsg = `${greeting} Equip NEXUS!\n\n` +
      `📅 Data: ${todayStr}\n` +
      `📌 Servei: ${serviceId}\n` +
      `🌤️ Temps: ${weatherInfo}\n\n` +
      `${opStatus.replace(/<b>|<\/b>/g, '')}\n\n` +
      `Utilitza els botons de Telegram per a consultes ràpides.\n\n` +
      `Que tinguis un bon servei! 🚄✨`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '📊 Estat Operativa', callback_data: 'menu__estat' }],
        [{ text: '🛡️ Reserves Avui', callback_data: 'menu__reserves' }, { text: '📋 Tots els Torns', callback_data: 'menu__torns' }],
        [{ text: '👤 Qui porta la UT?', callback_data: 'menu__qui_prompt' }, { text: '🚆 Estat Tren', callback_data: 'menu__tren_prompt' }],
        [{ text: '📋 Consulta Torn', callback_data: 'menu__torn_prompt' }, { text: '🎫 Detall Servei', callback_data: 'menu__servei_prompt' }],
        [{ text: '📏 Info PK', callback_data: 'menu__pk_prompt' }, { text: '🌤️ Clima', callback_data: 'menu__clima_prompt' }]
      ]
    };

    if (botToken && chatId) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: htmlMsg, parse_mode: 'HTML', reply_markup: keyboard })
      });
    }

    const msgId = `briefing-${todayStr}-${slot}`;
    await supabase.from('telegram_messages').upsert({
      id: msgId,
      text: rawMsg,
      sender_name: '🤖 BOT NEXUS',
      sender_id: 'bot',
      is_alert: isAlert,
      created_at: currentDate.toISOString()
    });

    await supabase.from('briefing_logs').upsert({ date: todayStr, slot: slot });

    return new Response(JSON.stringify({ ok: true, slot }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
})
