// telegram.ts
// Lógica para enviar mensajes interactuando con la API de Telegram.

const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '';
// Aquí definiremos el Chat ID del grupo al que el bot debe enviar mensajes
// Por defecto lo dejaremos pendiente para que se configure dinámicamente o se busque
const DEFAULT_GROUP_CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID || '';

/**
 * Envia un mensaje a Telegram.
 */
export async function sendTelegramMessage(text: string, chatId?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!TELEGRAM_BOT_TOKEN) {
        return { success: false, error: 'Token del bot no configurat' };
    }

    const targetChatId = chatId || DEFAULT_GROUP_CHAT_ID;
    if (!targetChatId) {
        return { success: false, error: 'Siusplau, configura el Chat ID del grup' };
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: targetChatId,
                text: text,
                parse_mode: 'HTML' // Permite enviar formato en negrita, cursiva, etc.
            })
        });

        const data = await response.json();

        if (data.ok) {
            return { success: true, data: data.result };
        } else {
            console.error('Telegram API Error:', data.description);
            return { success: false, error: data.description };
        }
    } catch (error: any) {
        console.error('Error enviando mensaje a Telegram:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Escolta o rep missatges (updates) de Telegram.
 */
export async function getTelegramUpdates(offset?: number): Promise<{ success: boolean; data?: any[]; error?: string }> {
    if (!TELEGRAM_BOT_TOKEN) {
        return { success: false, error: 'Token del bot no configurat' };
    }

    let url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?allowed_updates=["message"]`;
    if (offset) {
        url += `&offset=${offset}`;
    }

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.ok) {
            return { success: true, data: data.result };
        } else {
            console.error('Telegram API Error:', data.description);
            return { success: false, error: data.description };
        }
    } catch (error: any) {
        console.error('Error rebent missatges de Telegram:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Obté el nombre de membres d'un grup de Telegram.
 */
export async function getTelegramMemberCount(chatId?: string): Promise<{ success: boolean; data?: number; error?: string }> {
    if (!TELEGRAM_BOT_TOKEN) {
        return { success: false, error: 'Token del bot no configurat' };
    }

    const targetChatId = chatId || DEFAULT_GROUP_CHAT_ID;
    if (!targetChatId) {
        return { success: false, error: 'Siusplau, configura el Chat ID del grup' };
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChatMemberCount?chat_id=${targetChatId}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.ok) {
            return { success: true, data: data.result };
        } else {
            console.error('Telegram API Error:', data.description);
            return { success: false, error: data.description };
        }
    } catch (error: any) {
        console.error('Error obtenint membres de Telegram:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Elimina un missatge enviat de Telegram.
 */
export async function deleteTelegramMessage(messageId: string | number, chatId?: string): Promise<{ success: boolean; error?: string }> {
    if (!TELEGRAM_BOT_TOKEN) {
        return { success: false, error: 'Token del bot no configurat' };
    }

    const targetChatId = chatId || DEFAULT_GROUP_CHAT_ID;
    if (!targetChatId) {
        return { success: false, error: 'Siusplau, configura el Chat ID del grup' };
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: targetChatId,
                message_id: messageId
            })
        });

        const data = await response.json();

        if (data.ok) {
            return { success: true };
        } else {
            console.error('Telegram API Error eliminant:', data.description);
            return { success: false, error: data.description };
        }
    } catch (error: any) {
        console.error('Error eliminant missatge de Telegram:', error);
        return { success: false, error: error.message };
    }
}
