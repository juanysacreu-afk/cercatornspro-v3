import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Supabase details
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(supabaseUrl!, supabaseServiceKey!)

serve(async (req) => {
  try {
    const update = await req.json()

    // Handle incoming messages
    if (update.message && update.message.from && !update.message.from.is_bot) {
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
        // System message or unsupported format, return 200 without saving
        return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: { 'Content-Type': 'application/json' } })
      }

      const senderName = [update.message.from.first_name, update.message.from.last_name].filter(Boolean).join(' ').trim()

      const newMessage = {
        id: update.message.message_id.toString(),
        text: msgText,
        sender_name: senderName || 'Usuari Telegram',
        sender_id: update.message.from.id.toString(),
        is_alert: false,
        created_at: new Date(update.message.date * 1000).toISOString()
      }

      const { error } = await supabase.from('telegram_messages').upsert([newMessage], { onConflict: 'id' })
      if (error) {
        console.error('Error inserting message to Supabase:', error)
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Error processing webhook payload:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
