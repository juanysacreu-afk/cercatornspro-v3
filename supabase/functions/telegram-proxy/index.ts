import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const allowedChatId = Deno.env.get('TELEGRAM_CHAT_ID') ?? ''

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type AllowedAction = 'sendMessage' | 'deleteMessage' | 'sendDocument' | 'getChatMemberCount' | 'getUpdates'

const ALLOWED_ACTIONS: AllowedAction[] = [
    'sendMessage',
    'deleteMessage',
    'sendDocument',
    'getChatMemberCount',
    'getUpdates',
]

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: CORS })
    }

    if (!botToken) {
        return new Response(JSON.stringify({ ok: false, description: 'Bot token not configured' }), {
            status: 500,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        })
    }

    try {
        const body = await req.json()
        const { action, payload } = body as {
            action: AllowedAction
            payload: Record<string, unknown>
        }

        if (!ALLOWED_ACTIONS.includes(action)) {
            return new Response(JSON.stringify({ ok: false, description: 'Action not allowed' }), {
                status: 400,
                headers: { ...CORS, 'Content-Type': 'application/json' },
            })
        }

        // Inject server-side chat_id if not provided by client
        if (action !== 'getUpdates' && !payload.chat_id) {
            payload.chat_id = allowedChatId
        }

        const telegramUrl = `https://api.telegram.org/bot${botToken}/${action}`

        let telegramRes: Response

        if (action === 'sendDocument' && payload.document_base64) {
            // Handle base64 file upload — rebuild as multipart/form-data
            const base64 = payload.document_base64 as string
            const mimeType = (payload.mime_type as string) || 'application/octet-stream'
            const fileName = (payload.file_name as string) || 'document'

            const binaryString = atob(base64)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i)
            }

            const formData = new FormData()
            formData.append('chat_id', String(payload.chat_id))
            formData.append('document', new Blob([bytes], { type: mimeType }), fileName)
            if (payload.caption) {
                formData.append('caption', payload.caption as string)
                formData.append('parse_mode', 'HTML')
            }

            telegramRes = await fetch(telegramUrl, { method: 'POST', body: formData })
        } else {
            telegramRes = await fetch(telegramUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
        }

        const data = await telegramRes.json()
        return new Response(JSON.stringify(data), {
            status: telegramRes.status,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        })
    } catch (err) {
        return new Response(JSON.stringify({ ok: false, description: String(err) }), {
            status: 500,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        })
    }
})
