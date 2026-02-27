// telegram.ts
// Proxy segur: cap credencial no s'exposa al bundle del client.
// Totes les crides van a l'Edge Function `telegram-proxy` a Supabase,
// que guarda el bot token i el chat ID com a secrets de servidor.

const PROXY_URL = 'https://hcpjthnhockfbefclycr.supabase.co/functions/v1/telegram-proxy';

type AllowedAction = 'sendMessage' | 'deleteMessage' | 'sendDocument' | 'getChatMemberCount' | 'getUpdates';

async function callProxy(action: AllowedAction, payload: Record<string, unknown>): Promise<any> {
    const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
    });
    return res.json();
}

/**
 * Envia un missatge de text al grup de Telegram.
 */
export async function sendTelegramMessage(
    text: string,
    chatId?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        const payload: Record<string, unknown> = {
            text,
            parse_mode: 'HTML',
        };
        if (chatId) payload.chat_id = chatId;

        const data = await callProxy('sendMessage', payload);

        if (data.ok) return { success: true, data: data.result };
        console.error('Telegram API Error:', data.description);
        return { success: false, error: data.description };
    } catch (error: any) {
        console.error('Error enviant missatge a Telegram:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Rep els darrers updates (missatges) del bot.
 */
export async function getTelegramUpdates(
    offset?: number
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
        const payload: Record<string, unknown> = {
            allowed_updates: ['message'],
        };
        if (offset) payload.offset = offset;

        const data = await callProxy('getUpdates', payload);

        if (data.ok) return { success: true, data: data.result };
        console.error('Telegram API Error:', data.description);
        return { success: false, error: data.description };
    } catch (error: any) {
        console.error('Error rebent missatges de Telegram:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Obté el nombre de membres d'un grup de Telegram.
 */
export async function getTelegramMemberCount(
    chatId?: string
): Promise<{ success: boolean; data?: number; error?: string }> {
    try {
        const payload: Record<string, unknown> = {};
        if (chatId) payload.chat_id = chatId;

        const data = await callProxy('getChatMemberCount', payload);

        if (data.ok) return { success: true, data: data.result };
        console.error('Telegram API Error:', data.description);
        return { success: false, error: data.description };
    } catch (error: any) {
        console.error('Error obtenint membres de Telegram:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Elimina un missatge del grup de Telegram.
 */
export async function deleteTelegramMessage(
    messageId: string | number,
    chatId?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const payload: Record<string, unknown> = { message_id: messageId };
        if (chatId) payload.chat_id = chatId;

        const data = await callProxy('deleteMessage', payload);

        if (data.ok) return { success: true };
        console.error('Telegram API Error eliminant:', data.description);
        return { success: false, error: data.description };
    } catch (error: any) {
        console.error('Error eliminant missatge de Telegram:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Envia un fitxer al grup de Telegram.
 * Nota: sendDocument requereix FormData; el proxy rep JSON,
 * de manera que primer pugem el fitxer com a base64 i el proxy l'envia.
 */
export async function sendTelegramFile(
    file: File,
    caption?: string,
    chatId?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        // Convert file to base64 to send through the JSON proxy
        const buffer = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

        const payload: Record<string, unknown> = {
            document_base64: base64,
            file_name: file.name,
            mime_type: file.type,
        };
        if (chatId) payload.chat_id = chatId;
        if (caption) {
            payload.caption = caption;
            payload.parse_mode = 'HTML';
        }

        const data = await callProxy('sendDocument', payload);

        if (data.ok) return { success: true, data: data.result };
        console.error('Telegram API Error (File):', data.description);
        return { success: false, error: data.description };
    } catch (error: any) {
        console.error('Error enviant fitxer a Telegram:', error);
        return { success: false, error: error.message };
    }
}
