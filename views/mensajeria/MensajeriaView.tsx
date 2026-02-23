import React, { useState, useEffect, useRef } from 'react';
import { Send, Hash, MoreVertical, MessageCircle, AlertTriangle, Paperclip, CheckCircle, Trash2 } from 'lucide-react';
import GlassPanel from '../../components/common/GlassPanel';
import { sendTelegramMessage, getTelegramUpdates, getTelegramMemberCount, deleteTelegramMessage, sendTelegramFile } from '../../src/lib/telegram';
import { supabase } from '../../supabaseClient';
import { playSendSound, playReceiveSound, requestNotificationPermission, showLocalNotification } from '../../utils/sounds';

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
    const [memberCount, setMemberCount] = useState<number | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const currentUserId = currentProfile.id || 'current-user-id';
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        requestNotificationPermission();
    }, []);

    // Fetch initial chat data
    useEffect(() => {
        const fetchInitialData = async () => {
            const { success: mcSuccess, data: mcData } = await getTelegramMemberCount();
            if (mcSuccess && mcData) {
                setMemberCount(mcData);
            } else {
                setMemberCount(0);
            }

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

        const subscription = supabase.channel('telegram_messages_changes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telegram_messages' }, payload => {
                const newMsg = payload.new as Message;
                if (newMsg.sender_id !== currentUserId && newMsg.sender_id !== currentProfile.email?.toLowerCase()) {
                    playReceiveSound();
                    showLocalNotification(`Missatge de ${newMsg.sender_name}`, newMsg.text);
                }
                setMessages(prev => {
                    if (prev.find(m => m.id === newMsg.id)) return prev;
                    return [...prev, newMsg];
                });
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'telegram_messages' }, payload => {
                const oldMsg = payload.old;
                setMessages(prev => prev.filter(m => m.id !== oldMsg.id));
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleClearHistory = async () => {
        if (!window.confirm('Estàs segur que vols esborrar tot l\'historial local de missatges? (No s\'esborraran de Telegram)')) return;
        setIsMenuOpen(false);
        const { error } = await supabase.from('telegram_messages').delete().not('id', 'is', null);
        if (!error) {
            setMessages([]);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (fileInputRef.current) fileInputRef.current.value = '';

        const caption = `👤 <b>${currentProfile.firstName} ${currentProfile.lastName}</b>\n📎 Ha compartit un fitxer: <b>${file.name}</b>`;

        const { success, data, error } = await sendTelegramFile(file, caption);

        if (success && data) {
            playSendSound();
            const newMessage: Message = {
                id: data.message_id.toString(),
                text: `📎 Fitxer enviat: ${file.name}`,
                sender_name: `${currentProfile.firstName} ${currentProfile.lastName}`,
                sender_id: currentProfile.email ? currentProfile.email.toLowerCase() : currentUserId,
                is_alert: false,
                created_at: new Date().toISOString()
            };

            setMessages(prev => [...prev, newMessage]);
            await supabase.from('telegram_messages').upsert([newMessage], { onConflict: 'id' });
        } else {
            console.error("Error enviant fitxer Telegram:", error);
            alert(`Error al compartir l'arxiu: ${error || 'Error desconegut'}`);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        const textToSent = inputText.trim();
        if (!textToSent) return;

        setInputText('');
        const isAlert = textToSent.startsWith('!');
        const formattedTelegramMsg = `👤 <b>${currentProfile.firstName} ${currentProfile.lastName}</b>\n💬 ${textToSent}`;

        const { success, data, error } = await sendTelegramMessage(formattedTelegramMsg);

        if (success && data) {
            playSendSound();
            const newMessage: Message = {
                id: data.message_id.toString(),
                text: textToSent,
                sender_name: `${currentProfile.firstName} ${currentProfile.lastName}`,
                sender_id: currentProfile.email ? currentProfile.email.toLowerCase() : currentUserId,
                is_alert: isAlert,
                created_at: new Date().toISOString()
            };

            setMessages((prev) => {
                if (prev.find(m => m.id === newMessage.id)) return prev;
                return [...prev, newMessage];
            });

            await supabase.from('telegram_messages').upsert([newMessage], { onConflict: 'id' });
        } else {
            console.error("Error enviant Telegram:", error);
            alert(`Error en enviar el missatge a Telegram: ${error || 'Desconegut'}`);
            setInputText(textToSent); // Restore input
        }
    };

    const handleDeleteMessage = async (msgId: string) => {
        setMessages(prev => prev.filter(m => m.id !== msgId));
        await supabase.from('telegram_messages').delete().eq('id', msgId);
        await deleteTelegramMessage(msgId);
    };

    const formatTime = (isoString: string) => {
        const d = new Date(isoString);
        return d.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="h-full flex flex-col md:flex-row gap-4 md:gap-6 pb-20 md:pb-6">
            <GlassPanel className="hidden md:flex w-80 flex-shrink-0 flex-col overflow-hidden bg-white/80 dark:bg-gray-950/80 border border-gray-100 dark:border-white/5 shadow-xl animate-slide-left-premium">
                <div className="p-5 border-b border-gray-100 dark:border-white/5">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <MessageCircle className="text-fgc-green" /> Centre de Missatgeria
                    </h2>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-1">Canals Actius</p>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    <div className="px-4 py-3 bg-fgc-green/10 border border-fgc-green/20 rounded-2xl flex items-center gap-4 cursor-pointer">
                        <div className="w-10 h-10 rounded-full bg-fgc-green text-white flex items-center justify-center font-bold text-lg shadow-sm">
                            <Hash size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-gray-900 dark:text-white truncate">Supervisors BV</h3>
                            <p className="text-xs text-gray-500 truncate mt-0.5">Integrat amb Telegram</p>
                        </div>
                        <div className="w-2.5 h-2.5 bg-fgc-green rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></div>
                    </div>
                </div>
            </GlassPanel>

            <GlassPanel className="flex-1 flex flex-col overflow-hidden bg-white/90 dark:bg-gray-950/90 border border-gray-100 dark:border-white/5 shadow-xl relative w-full">
                <div className="p-4 md:p-[22px] border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-white/50 dark:bg-black/20 backdrop-blur-md z-10">
                    <div>
                        <h2 className="text-base md:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Hash className="text-gray-400" size={18} /> Supervisors de Circulació BV
                        </h2>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
                            <span className="flex items-center gap-1"><CheckCircle className="text-fgc-green" size={12} /> Sincronitzat</span>
                            <span className="opacity-50">•</span>
                            <span>{memberCount !== null ? `${memberCount} membres` : 'Carregant...'}</span>
                        </div>
                    </div>
                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className={`p-2 rounded-xl transition-all ${isMenuOpen ? 'bg-fgc-green/10 text-fgc-green' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'}`}
                        >
                            <MoreVertical size={20} />
                        </button>

                        {isMenuOpen && (
                            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 py-2 z-[100] animate-modal-premium">
                                <div className="px-4 py-2 border-b border-gray-100 dark:border-white/5">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Opcions de Canal</p>
                                </div>
                                <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 text-left transition-colors">
                                    <MessageCircle size={16} className="text-fgc-green" />
                                    <div>
                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-200">Informació</p>
                                        <p className="text-[10px] text-gray-400">{memberCount} membres actius</p>
                                    </div>
                                </button>
                                <div className="h-px bg-gray-100 dark:border-white/5 my-1 mx-2" />
                                <button
                                    onClick={handleClearHistory}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-500/10 text-left transition-colors group"
                                >
                                    <Trash2 size={16} className="text-red-400 group-hover:text-red-500" />
                                    <span className="text-sm font-bold text-red-500">Esborrar Historial</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 bg-gradient-to-b from-transparent to-black/[0.02] dark:to-white/[0.01]">
                    {messages.map((msg, index) => {
                        const hasEmail = Boolean(currentProfile.email);
                        const isMe = (hasEmail && msg.sender_id.toLowerCase() === currentProfile.email.toLowerCase()) || msg.sender_id === currentUserId;
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

                        const canDelete = currentProfile.email === 'mlopezj@fgc.cat' || isMe;

                        return (
                            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 group/msg relative`}>
                                {showName && !isMe && (
                                    <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 ml-2">{msg.sender_name}</span>
                                )}
                                {showName && isMe && (
                                    <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 mr-2">Tu</span>
                                )}
                                <div className="flex items-center gap-1 md:gap-2 w-full max-w-[85%] md:max-w-[75%]">
                                    {canDelete && isMe && (
                                        <button
                                            onClick={() => handleDeleteMessage(msg.id)}
                                            className="opacity-100 md:opacity-0 group-hover/msg:opacity-100 p-1.5 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full transition-all flex-shrink-0"
                                            title="Esborrar missatge"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}

                                    <div className={`relative px-3 py-2 md:px-4 md:py-2.5 rounded-2xl shadow-sm w-full ${isMe
                                        ? 'bg-fgc-green text-gray-900 rounded-tr-sm'
                                        : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-white/5 rounded-tl-sm'
                                        }`}>
                                        <p className="text-[14px] md:text-[15px] leading-snug break-words">{msg.text}</p>
                                        <div className={`text-[10px] mt-1 flex items-center justify-end gap-1 ${isMe ? 'text-gray-900/60' : 'text-gray-400'}`}>
                                            {formatTime(msg.created_at)}
                                            {isMe && <CheckCircle size={10} className="opacity-70" />}
                                        </div>
                                    </div>

                                    {canDelete && !isMe && (
                                        <button
                                            onClick={() => handleDeleteMessage(msg.id)}
                                            className="opacity-100 md:opacity-0 group-hover/msg:opacity-100 p-1.5 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full transition-all flex-shrink-0"
                                            title="Esborrar missatge d'un altre"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-3 md:p-4 bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-white/5">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                    />
                    <form onSubmit={handleSendMessage} className="flex gap-1 md:gap-2">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 md:p-3 text-gray-400 hover:text-fgc-green hover:bg-fgc-green/10 rounded-xl transition-colors shrink-0"
                        >
                            <Paperclip size={20} />
                        </button>
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Escriu un missatge..."
                            className="flex-1 min-w-0 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2.5 md:px-4 md:py-3 text-sm md:text-base text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-fgc-green focus:ring-1 focus:ring-fgc-green transition-all"
                        />
                        <button
                            type="submit"
                            disabled={!inputText.trim()}
                            className="p-2 md:p-3 bg-fgc-green text-white rounded-xl hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all flex items-center justify-center shadow-lg shadow-fgc-green/20 shrink-0"
                        >
                            <Send size={20} className={inputText.trim() ? "translate-x-0.5 -translate-y-0.5" : ""} />
                        </button>
                    </form>
                    <div className="text-center mt-2">
                        <span className="text-[10px] text-gray-400">Els missatges s'enviaran automàticament al grup oficial de Supervisors de Circulació BV.</span>
                    </div>
                </div>
            </GlassPanel>
        </div>
    );
};

export default MensajeriaView;
