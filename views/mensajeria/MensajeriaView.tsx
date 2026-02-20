import React, { useState, useEffect } from 'react';
import { Send, Hash, MoreVertical, MessageCircle, AlertTriangle, Paperclip, CheckCircle } from 'lucide-react';
import GlassPanel from '../../components/common/GlassPanel';
import { sendTelegramMessage, getTelegramUpdates, getTelegramMemberCount } from '../../src/lib/telegram';
import { supabase } from '../../supabaseClient';

interface UserProfile {
    id?: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
}

interface MensajeriaViewProps {
    currentProfile: UserProfile;
}

interface Message {
    id: string;
    text: string;
    sender_name: string;
    sender_id: string;
    is_alert: boolean;
    created_at: string;
}

const MensajeriaView: React.FC<MensajeriaViewProps> = ({ currentProfile }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [memberCount, setMemberCount] = useState<number>(0);

    const currentUserId = currentProfile.id || 'current-user-id';
    const [lastUpdateId, setLastUpdateId] = useState<number | undefined>(undefined);

    // Fetch initial chat data
    useEffect(() => {
        const fetchInitialData = async () => {
            // 1. Get real member count
            const { success: mcSuccess, data: mcData } = await getTelegramMemberCount();
            if (mcSuccess && mcData) {
                setMemberCount(mcData);
            }

            // 2. Load last 24h messages from Supabase
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data, error } = await supabase
                .from('telegram_messages')
                .select('*')
                .gte('created_at', twentyFourHoursAgo)
                .order('created_at', { ascending: true });

            if (data && !error) {
                setMessages(data as Message[]);
            }
        };

        fetchInitialData();

        // 3. Subscribe to real-time incoming messages from other supervisors
        const subscription = supabase.channel('telegram_messages_changes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telegram_messages' }, payload => {
                const newMsg = payload.new as Message;
                setMessages(prev => {
                    if (prev.find(m => m.id === newMsg.id)) return prev;
                    return [...prev, newMsg];
                });
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    // Sistema de validación (Polling) per escoltar missatges nous de Telegram directly
    useEffect(() => {
        let isMounted = true;
        let intervalId: any;

        const pollMessages = async () => {
            const { success, data } = await getTelegramUpdates(lastUpdateId);
            if (success && data && data.length > 0) {
                let maxUpdateId = lastUpdateId || 0;
                const newMsgs: Message[] = [];

                data.forEach(update => {
                    if (update.update_id > maxUpdateId) {
                        maxUpdateId = update.update_id;
                    }

                    if (update.message && update.message.text) {
                        newMsgs.push({
                            id: update.message.message_id.toString(),
                            text: update.message.text,
                            sender_name: update.message.from.first_name + (update.message.from.last_name ? ' ' + update.message.from.last_name : ''),
                            sender_id: update.message.from.id.toString(),
                            is_alert: false,
                            created_at: new Date(update.message.date * 1000).toISOString()
                        });
                    }
                });

                if (newMsgs.length > 0 && isMounted) {
                    // Actualitzem localment
                    setMessages(prev => {
                        const existingIds = new Set(prev.map(m => m.id));
                        const filtered = newMsgs.filter(m => !existingIds.has(m.id));
                        return [...prev, ...filtered];
                    });

                    // Ho desem directament a Supabase per sincronitzar history amb la resta
                    await supabase.from('telegram_messages').upsert(newMsgs, { onConflict: 'id' });
                }

                if (maxUpdateId >= (lastUpdateId || 0) && isMounted) {
                    setLastUpdateId(maxUpdateId + 1);
                }
            }
        };

        intervalId = setInterval(pollMessages, 3000); // 3 Segons
        pollMessages();

        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, [lastUpdateId]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        const textToSent = inputText.trim();
        if (!textToSent) return;

        // Clear input optimistically
        setInputText('');

        const isAlert = textToSent.startsWith('!');
        const visualText = textToSent;

        // We will format the text sent to Telegram to show who sent it
        const formattedTelegramMsg = `👤 <b>${currentProfile.firstName} ${currentProfile.lastName}</b>\n💬 ${visualText}`;

        // Send to Telegram API FIRST to know it was delivered safely (optional, but good practice here)
        const { success, data, error } = await sendTelegramMessage(formattedTelegramMsg);

        if (success && data) {
            // Create the permanent record locally and on DB exactly with the official ID so it doesn't double-poll
            const newMessage: Message = {
                id: data.message_id.toString(),
                text: visualText,
                sender_name: `${currentProfile.firstName} ${currentProfile.lastName}`,
                sender_id: currentUserId,
                is_alert: isAlert,
                created_at: new Date().toISOString()
            };

            setMessages((prev) => {
                if (prev.find(m => m.id === newMessage.id)) return prev;
                return [...prev, newMessage];
            });

            // Store it in the DB to make sure history is synced for other Web clients
            await supabase.from('telegram_messages').upsert([newMessage], { onConflict: 'id' });
        } else {
            console.error("Failed to send to Telegram", error);
        }
    };

    const formatTime = (isoString: string) => {
        const d = new Date(isoString);
        return d.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
    };

    // Group messages logically (just a simple mapping for now)
    return (
        <div className="h-full flex gap-6 pb-6">
            {/* Sidebar: Chats / Canales */}
            <GlassPanel className="w-80 flex-shrink-0 flex flex-col overflow-hidden bg-white/80 dark:bg-gray-950/80 border border-gray-100 dark:border-white/5 shadow-xl">
                <div className="p-5 border-b border-gray-100 dark:border-white/5">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <MessageCircle className="text-fgc-green" /> Centre de Missatgeria
                    </h2>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-1">Canals Actius</p>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {/* Active Channel Configured */}
                    <div className="px-4 py-3 bg-fgc-green/10 border border-fgc-green/20 rounded-2xl flex items-center gap-4 cursor-pointer">
                        <div className="w-10 h-10 rounded-full bg-fgc-green text-white flex items-center justify-center font-bold text-lg shadow-sm">
                            <Hash size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-gray-900 dark:text-white truncate">Supervisors Op.</h3>
                            <p className="text-xs text-gray-500 truncate mt-0.5">Integrat amb Telegram</p>
                        </div>
                        <div className="w-2.5 h-2.5 bg-fgc-green rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></div>
                    </div>

                    <div className="px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl flex items-center gap-4 cursor-pointer transition-colors opacity-60">
                        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center font-bold text-lg shadow-sm">
                            <AlertTriangle size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-gray-900 dark:text-white truncate">Avisos CR</h3>
                            <p className="text-xs text-gray-500 truncate mt-0.5">Alertes automàtiques</p>
                        </div>
                    </div>
                </div>
            </GlassPanel>

            {/* Main Chat Area */}
            <GlassPanel className="flex-1 flex flex-col overflow-hidden bg-white/90 dark:bg-gray-950/90 border border-gray-100 dark:border-white/5 shadow-xl relative">
                <div className="p-[22px] border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-white/50 dark:bg-black/20 backdrop-blur-md z-10">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Hash className="text-gray-400" size={20} /> Grup de Supervisors Operatius
                        </h2>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
                            <span className="flex items-center gap-1"><CheckCircle className="text-fgc-green" size={12} /> Telegram Sincronitzat</span>
                            <span className="opacity-50">•</span>
                            <span>{memberCount > 0 ? `${memberCount} membres` : 'Cargant...'}</span>
                        </div>
                    </div>
                    <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                        <MoreVertical size={20} />
                    </button>
                </div>

                {/* Messages List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-transparent to-black/[0.02] dark:to-white/[0.01]">
                    {messages.map((msg, index) => {
                        const isMe = msg.sender_id === currentUserId;
                        const showName = index === 0 || messages[index - 1].sender_id !== msg.sender_id;

                        if (msg.is_alert && !isMe) {
                            return (
                                <div key={msg.id} className="flex justify-center my-4">
                                    <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-2xl px-5 py-3 max-w-lg text-center shadow-sm">
                                        <p className="text-[11px] font-black uppercase text-orange-600 dark:text-orange-400 tracking-wider mb-1 flex justify-center items-center gap-1">
                                            <AlertTriangle size={12} /> ALERTA DE SISTEMA
                                        </p>
                                        <p className="text-sm text-gray-800 dark:text-orange-200">{msg.text}</p>
                                        <span className="text-[10px] text-orange-400/80 mt-2 block">{formatTime(msg.created_at)}</span>
                                    </div>
                                </div>
                            )
                        }

                        return (
                            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2`}>
                                {showName && !isMe && (
                                    <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 ml-2">{msg.sender_name}</span>
                                )}
                                {showName && isMe && (
                                    <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 mr-2">Tu</span>
                                )}
                                <div className={`relative max-w-[75%] px-4 py-2.5 rounded-2xl shadow-sm ${isMe
                                    ? 'bg-fgc-green text-gray-900 rounded-tr-sm'
                                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-white/5 rounded-tl-sm'
                                    }`}>
                                    <p className="text-[15px] leading-snug">{msg.text}</p>
                                    <div className={`text-[10px] mt-1 flex items-center justify-end gap-1 ${isMe ? 'text-gray-900/60' : 'text-gray-400'}`}>
                                        {formatTime(msg.created_at)}
                                        {isMe && <CheckCircle size={10} className="opacity-70" />}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-white/5">
                    <form onSubmit={handleSendMessage} className="flex gap-2">
                        <button type="button" className="p-3 text-gray-400 hover:text-fgc-green hover:bg-fgc-green/10 rounded-xl transition-colors">
                            <Paperclip size={20} />
                        </button>
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Escriu un missatge al grup de Telegram..."
                            className="flex-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-fgc-green focus:ring-1 focus:ring-fgc-green transition-all"
                        />
                        <button
                            type="submit"
                            disabled={!inputText.trim()}
                            className="p-3 bg-fgc-green text-white rounded-xl hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all flex items-center justify-center shadow-lg shadow-fgc-green/20"
                        >
                            <Send size={20} className={inputText.trim() ? "translate-x-0.5 -translate-y-0.5" : ""} />
                        </button>
                    </form>
                    <div className="text-center mt-2">
                        <span className="text-[10px] text-gray-400">Els missatges s'enviaran automàticament al grup oficial de Supervisors Operatius.</span>
                    </div>
                </div>
            </GlassPanel>
        </div>
    );
};

export default MensajeriaView;
