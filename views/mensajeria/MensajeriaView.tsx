import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Hash, MoreVertical, MessageCircle, AlertTriangle, Paperclip, CheckCircle, Trash2, Smile, Pin, PinOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassPanel from '../../components/common/GlassPanel';
import { sendTelegramMessage, getTelegramMemberCount, deleteTelegramMessage, sendTelegramFile } from '../../src/lib/telegram';
import { supabase } from '../../supabaseClient';
import { playSendSound, playReceiveSound, requestNotificationPermission, showLocalNotification } from '../../utils/sounds';
import ConfirmModal from '../../components/common/ConfirmModal';

// ── Types ───────────────────────────────────────────────
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

// reactions: { "👍": ["user@email", ...], ... }
interface Message {
    id: string;
    text: string;
    sender_name: string;
    sender_id: string;
    is_alert: boolean;
    created_at: string;
    reactions?: Record<string, string[]>;
    pinned?: boolean;
}

interface TypingUser {
    id: string;
    sender_name: string;
    typing_at: string;
}

// ── Available quick-reactions ──────────────────────────
const QUICK_REACTIONS = ['👍', '✅', '🚨', '⚠️', '👀', '❌'];

// ── Typing indicator debounce (ms) ────────────────────
const TYPING_DEBOUNCE_MS = 600;
const TYPING_TTL_MS = 4000; // remove "is typing" after 4s

// ── Component ─────────────────────────────────────────
const MensajeriaView: React.FC<MensajeriaViewProps> = ({ currentProfile }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [memberCount, setMemberCount] = useState<number | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
    // msgId -> true means the emoji picker is open for that message
    const [openPickerFor, setOpenPickerFor] = useState<string | null>(null);
    const [modalConfig, setModalConfig] = useState<{
        message: string;
        onConfirm: () => void;
        danger?: boolean;
    } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cleanTypingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const currentUserId = currentProfile.id || 'current-user-id';
    const myEmail = currentProfile.email?.toLowerCase() ?? '';
    const myName = `${currentProfile.firstName} ${currentProfile.lastName}`;

    // ── Scroll helpers ─────────────────────────────────
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages]);

    // ── Notification permission ───────────────────────
    useEffect(() => { requestNotificationPermission(); }, []);

    // ── Click-outside: close menu & emoji picker ──────
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsMenuOpen(false);
            }
            // Close emoji picker if clicking outside any picker
            const target = e.target as HTMLElement;
            if (!target.closest('[data-emoji-picker]') && !target.closest('[data-emoji-trigger]')) {
                setOpenPickerFor(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // ── Initial data fetch + Realtime subscriptions ───
    useEffect(() => {
        const fetchInitialData = async () => {
            const { success: mcSuccess, data: mcData } = await getTelegramMemberCount();
            setMemberCount(mcSuccess && mcData ? mcData : 0);

            const { data, error } = await supabase
                .from('telegram_messages')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (data && !error) {
                // Return them in chronological order
                setMessages((data as Message[]).reverse());
            }
        };

        fetchInitialData();

        // ── Realtime: message inserts / deletes / reaction updates ──
        const msgSub = supabase.channel('telegram_messages_changes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telegram_messages' }, payload => {
                const newMsg = payload.new as Message;
                if (newMsg.sender_id !== currentUserId && newMsg.sender_id !== myEmail) {
                    playReceiveSound();
                    showLocalNotification(`Missatge de ${newMsg.sender_name}`, newMsg.text);
                }
                setMessages(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'telegram_messages' }, payload => {
                const updated = payload.new as Message;
                setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, reactions: updated.reactions } : m));
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'telegram_messages' }, payload => {
                setMessages(prev => prev.filter(m => m.id !== payload.old.id));
            })
            .subscribe();

        // ── Realtime: typing presence ──────────────────────────────
        const presenceSub = supabase.channel('chat_presence_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_presence' }, () => {
                // Re-fetch current typers on any change
                supabase
                    .from('chat_presence')
                    .select('*')
                    .gte('typing_at', new Date(Date.now() - TYPING_TTL_MS).toISOString())
                    .then(({ data }) => {
                        if (data) {
                            setTypingUsers((data as TypingUser[]).filter(u => u.id !== myEmail && u.id !== currentUserId));
                        }
                    });
            })
            .subscribe();

        // Clean stale typing entries every 2s
        cleanTypingRef.current = setInterval(() => {
            setTypingUsers(prev =>
                prev.filter(u => Date.now() - new Date(u.typing_at).getTime() < TYPING_TTL_MS)
            );
        }, 2000);

        return () => {
            msgSub.unsubscribe();
            presenceSub.unsubscribe();
            if (cleanTypingRef.current) clearInterval(cleanTypingRef.current);
        };
    }, []);


    // ── Typing presence: broadcast when typing ────────
    const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputText(e.target.value);

        // Debounce: only upsert once per burst
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(async () => {
            if (e.target.value.trim()) {
                await supabase.from('chat_presence').upsert([{
                    id: myEmail || currentUserId,
                    sender_name: myName,
                    typing_at: new Date().toISOString()
                }], { onConflict: 'id' });
            } else {
                // Clear presence when input is empty
                await supabase.from('chat_presence').delete().eq('id', myEmail || currentUserId);
            }
        }, TYPING_DEBOUNCE_MS);
    };

    const clearTypingPresence = useCallback(async () => {
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        await supabase.from('chat_presence').delete().eq('id', myEmail || currentUserId);
    }, [myEmail, currentUserId]);

    // ── Reactions ─────────────────────────────────────
    const handleReaction = async (msgId: string, emoji: string) => {
        setOpenPickerFor(null);
        const msg = messages.find(m => m.id === msgId);
        if (!msg) return;

        const me = myEmail || currentUserId;
        const current: Record<string, string[]> = { ...(msg.reactions ?? {}) };
        const reactors = current[emoji] ?? [];

        // Toggle: add or remove my reaction
        if (reactors.includes(me)) {
            current[emoji] = reactors.filter(r => r !== me);
            if (current[emoji].length === 0) delete current[emoji];
        } else {
            current[emoji] = [...reactors, me];
        }

        // Optimistic update
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: current } : m));

        // Persist
        await supabase.from('telegram_messages').update({ reactions: current }).eq('id', msgId);
    };

    // ── Clear history ─────────────────────────────────
    const handleClearHistory = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(false);
        setModalConfig({
            message: 'Estàs segur que vols esborrar tot l\'historial local de missatges? (No s\'esborraran de Telegram)',
            danger: true,
            onConfirm: async () => {
                const { error } = await supabase.from('telegram_messages').delete().not('id', 'is', null);
                if (!error) setMessages([]);
                setModalConfig(null);
            }
        });
    };

    const handleClearPastHistory = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(false);
        setModalConfig({
            message: 'Estàs segur que vols esborrar tot l\'historial passat i deixar només els missatges del dia en curs?',
            danger: true,
            onConfirm: async () => {
                const now = new Date();
                const serviceStart = new Date(now);
                serviceStart.setHours(3, 0, 0, 0);
                if (now.getHours() < 3) {
                    serviceStart.setDate(serviceStart.getDate() - 1);
                }

                const { error } = await supabase
                    .from('telegram_messages')
                    .delete()
                    .lt('created_at', serviceStart.toISOString());

                if (!error) {
                    setMessages(prev => prev.filter(m => new Date(m.created_at) >= serviceStart));
                } else {
                    alert('Error al esborrar l\'historial passat.');
                }
                setModalConfig(null);
            }
        });
    };

    // ── File upload ───────────────────────────────────
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (fileInputRef.current) fileInputRef.current.value = '';

        const caption = `👤 <b>${myName}</b>\n📎 Ha compartit un fitxer: <b>${file.name}</b>`;
        const { success, data, error } = await sendTelegramFile(file, caption);

        if (success && data) {
            playSendSound();
            const newMessage: Message = {
                id: data.message_id.toString(),
                text: `📎 Fitxer enviat: ${file.name}`,
                sender_name: myName,
                sender_id: myEmail || currentUserId,
                is_alert: false,
                created_at: new Date().toISOString()
            };
            setMessages(prev => [...prev, newMessage]);
            await supabase.from('telegram_messages').upsert([newMessage], { onConflict: 'id' });
        } else {
            alert(`Error al compartir l'arxiu: ${error || 'Error desconegut'}`);
        }
    };

    // ── Send message ──────────────────────────────────
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        const textToSent = inputText.trim();
        if (!textToSent) return;

        setInputText('');
        await clearTypingPresence();

        const isAlert = textToSent.startsWith('!');
        const formattedTelegramMsg = `👤 <b>${myName}</b>\n💬 ${textToSent}`;
        const { success, data, error } = await sendTelegramMessage(formattedTelegramMsg);

        if (success && data) {
            playSendSound();
            const newMessage: Message = {
                id: data.message_id.toString(),
                text: textToSent,
                sender_name: myName,
                sender_id: myEmail || currentUserId,
                is_alert: isAlert,
                created_at: new Date().toISOString()
            };
            setMessages(prev => prev.find(m => m.id === newMessage.id) ? prev : [...prev, newMessage]);
            await supabase.from('telegram_messages').upsert([newMessage], { onConflict: 'id' });
        } else {
            alert(`Error en enviar el missatge a Telegram: ${error || 'Desconegut'}`);
            setInputText(textToSent);
        }
    };

    // ── Delete message ────────────────────────────────
    const handleDeleteMessage = async (msgId: string) => {
        setMessages(prev => prev.filter(m => m.id !== msgId));
        await supabase.from('telegram_messages').delete().eq('id', msgId);
        await deleteTelegramMessage(msgId);
    };

    // ── Pin message ───────────────────────────────────
    const handleTogglePin = async (msgId: string, currentPinned: boolean) => {
        const newPinned = !currentPinned;

        // Optimistic 
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, pinned: newPinned } : m));

        const { error } = await supabase.from('telegram_messages').update({ pinned: newPinned }).eq('id', msgId);
        if (error) {
            // Revert on error
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, pinned: currentPinned } : m));
            alert('Error al fixar el missatge.');
        }
    };

    // ── Time format ───────────────────────────────────
    const formatTime = (isoString: string) => {
        return new Date(isoString).toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
    };

    // ── Typing indicator string ───────────────────────
    const typingLabel = (() => {
        if (typingUsers.length === 0) return null;
        if (typingUsers.length === 1) return `${typingUsers[0].sender_name.split(' ')[0]} està escrivint...`;
        if (typingUsers.length === 2) return `${typingUsers[0].sender_name.split(' ')[0]} i ${typingUsers[1].sender_name.split(' ')[0]} estan escrivint...`;
        return `${typingUsers.length} persones estan escrivint...`;
    })();

    // ── Render ────────────────────────────────────────
    return (
        <div className="h-full flex flex-col md:flex-row gap-4 md:gap-6">
            {/* Sidebar */}
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
                {/* Emoji legend in sidebar */}
                <div className="p-4 border-t border-gray-100 dark:border-white/5">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Reaccions ràpides</p>
                    <div className="flex gap-2 flex-wrap">
                        {QUICK_REACTIONS.map(e => (
                            <span key={e} className="text-lg cursor-default select-none" title={e}>{e}</span>
                        ))}
                    </div>
                </div>
            </GlassPanel>

            {/* Main chat panel */}
            <GlassPanel className="flex-1 flex flex-col overflow-hidden bg-white/90 dark:bg-gray-950/90 border border-gray-100 dark:border-white/5 shadow-xl relative w-full">
                {/* Header */}
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
                                    onClick={(e) => handleClearPastHistory(e)}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-50 dark:hover:bg-amber-500/10 text-left transition-colors group"
                                >
                                    <Trash2 size={16} className="text-amber-400 group-hover:text-amber-500" />
                                    <span className="text-sm font-bold text-amber-600 dark:text-amber-500">Esborrar fins avui</span>
                                </button>
                                <div className="h-px bg-gray-100 dark:border-white/5 my-1 mx-2" />
                                <button
                                    onClick={(e) => handleClearHistory(e)}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-500/10 text-left transition-colors group"
                                >
                                    <Trash2 size={16} className="text-red-400 group-hover:text-red-500" />
                                    <span className="text-sm font-bold text-red-500">Esborrar Historial</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Pinned Messages Banner */}
                {messages.filter(m => m.pinned).length > 0 && (
                    <div className="bg-amber-50/90 dark:bg-amber-500/10 border-b border-amber-200/50 dark:border-amber-500/20 px-4 py-2.5 flex items-start gap-3 backdrop-blur-md z-10 w-full overflow-x-auto no-scrollbar shadow-sm">
                        <Pin className="text-amber-500 mt-1 shrink-0" size={16} fill="currentColor" />
                        <div className="flex flex-col gap-2 flex-1 min-w-0">
                            {messages.filter(m => m.pinned).map(pinnedMsg => (
                                <div key={pinnedMsg.id} className="flex justify-between items-center bg-white/50 dark:bg-black/20 rounded-lg p-2 gap-4 border border-amber-100/50 dark:border-white/5">
                                    <div className="flex-1 min-w-0 bg-transparent" onClick={() => {
                                        // Optional: Scroll to message
                                    }}>
                                        <p className="text-[10px] font-bold text-amber-600/80 dark:text-amber-400 uppercase tracking-widest leading-none mb-1">
                                            {pinnedMsg.sender_name}
                                        </p>
                                        <p className="text-sm font-medium text-gray-800 dark:text-amber-100 truncate">
                                            {pinnedMsg.text}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleTogglePin(pinnedMsg.id, true)}
                                        className="text-amber-500/50 hover:text-amber-600 bg-amber-500/10 hover:bg-amber-500/20 p-1.5 rounded-lg transition-colors shrink-0"
                                        title="Desfixar"
                                    >
                                        <PinOff size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 bg-gradient-to-b from-transparent to-black/[0.02] dark:to-white/[0.01]">
                    {messages.map((msg, index) => {
                        const hasEmail = Boolean(currentProfile.email);
                        const isMe = (hasEmail && msg.sender_id.toLowerCase() === myEmail) || msg.sender_id === currentUserId;
                        const showName = index === 0 || messages[index - 1].sender_id !== msg.sender_id;
                        const canDelete = currentProfile.email === 'mlopezj@fgc.cat' || isMe;
                        const reactionEntries = Object.entries(msg.reactions ?? {}).filter(([, users]) => users.length > 0);
                        const isPickerOpen = openPickerFor === msg.id;

                        // Alert-style message
                        if (msg.is_alert && !isMe) {
                            return (
                                <div key={msg.id} className="flex justify-center my-4">
                                    <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-2xl px-5 py-3 max-w-lg text-center shadow-sm">
                                        <p className="text-[11px] font-black uppercase text-orange-600 dark:text-orange-400 tracking-wider mb-1 flex justify-center items-center gap-1">
                                            <AlertTriangle size={12} /> ALERTA DE SISTEMA
                                        </p>
                                        <p className="text-sm text-gray-800 dark:text-orange-200 whitespace-pre-wrap">{msg.text}</p>
                                        <span className="text-[10px] text-orange-400/80 mt-2 block">{formatTime(msg.created_at)}</span>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 group/msg relative`}>
                                {showName && !isMe && (
                                    <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 ml-2">{msg.sender_name}</span>
                                )}
                                {showName && isMe && (
                                    <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 mr-2">Tu</span>
                                )}

                                <div className={`flex items-end gap-1 md:gap-2 w-full max-w-[85%] md:max-w-[75%] ${isMe ? 'flex-row-reverse self-end' : 'flex-row'}`}>
                                    {/* Delete button */}
                                    {canDelete && (
                                        <button
                                            onClick={() => handleDeleteMessage(msg.id)}
                                            className="opacity-0 group-hover/msg:opacity-100 p-1.5 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full transition-all flex-shrink-0 mb-1"
                                            title="Esborrar missatge"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    )}

                                    {/* Bubble + reactions wrapper */}
                                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                                        {/* Bubble */}
                                        <div className={`relative px-3 py-2 md:px-4 md:py-2.5 rounded-2xl shadow-sm ${isMe
                                            ? 'bg-fgc-green text-gray-900 rounded-tr-sm'
                                            : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-white/5 rounded-tl-sm'
                                            }`}>
                                            <p className="text-[14px] md:text-[15px] leading-snug break-words whitespace-pre-wrap">{msg.text}</p>
                                            <div className={`text-[10px] mt-1 flex items-center justify-end gap-1 ${isMe ? 'text-gray-900/60' : 'text-gray-400'}`}>
                                                {msg.pinned && <Pin size={10} className="mr-0.5 text-amber-500" fill="currentColor" />}
                                                {formatTime(msg.created_at)}
                                                {isMe && <CheckCircle size={10} className="opacity-70" />}
                                            </div>
                                        </div>

                                        {/* Existing reactions row */}
                                        {reactionEntries.length > 0 && (
                                            <div className={`flex flex-wrap gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                {reactionEntries.map(([emoji, users]) => {
                                                    const iReacted = users.includes(myEmail || currentUserId);
                                                    return (
                                                        <button
                                                            key={emoji}
                                                            onClick={() => handleReaction(msg.id, emoji)}
                                                            title={users.join(', ')}
                                                            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-all active:scale-95
                                                                ${iReacted
                                                                    ? 'bg-fgc-green/20 border-fgc-green/40 text-fgc-green font-bold'
                                                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-fgc-green/40'
                                                                }`}
                                                        >
                                                            <span>{emoji}</span>
                                                            <span className="font-bold tabular-nums">{users.length}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Action buttons wrapper (hover) */}
                                    <div className="relative flex-shrink-0 flex items-center mb-1 self-center gap-1">
                                        {/* Pin/Unpin */}
                                        <button
                                            onClick={() => handleTogglePin(msg.id, !!msg.pinned)}
                                            className={`opacity-0 group-hover/msg:opacity-100 p-1.5 rounded-full transition-all ${msg.pinned ? 'text-amber-500 hover:bg-amber-500/10' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-500/10'}`}
                                            title={msg.pinned ? "Desfixar" : "Fixar missatge"}
                                        >
                                            {msg.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                                        </button>

                                        {/* Emoji trigger button (shown on hover) */}
                                        <button
                                            data-emoji-trigger
                                            onClick={() => setOpenPickerFor(isPickerOpen ? null : msg.id)}
                                            className="opacity-0 group-hover/msg:opacity-100 p-1.5 text-gray-400 hover:text-fgc-green hover:bg-fgc-green/10 rounded-full transition-all"
                                            title="Afegir reacció"
                                        >
                                            <Smile size={15} />
                                        </button>

                                        {/* Emoji picker popup */}
                                        {isPickerOpen && (
                                            <div
                                                data-emoji-picker
                                                className={`absolute bottom-full mb-2 z-50 bg-white dark:bg-gray-900 border border-gray-100 dark:border-white/10 rounded-2xl shadow-2xl p-2 flex gap-1 animate-modal-premium
                                                    ${isMe ? 'right-0' : 'left-0'}`}
                                            >
                                                {QUICK_REACTIONS.map(emoji => (
                                                    <button
                                                        key={emoji}
                                                        onClick={() => handleReaction(msg.id, emoji)}
                                                        className="text-xl w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-all hover:scale-125 active:scale-95"
                                                        title={emoji}
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    <div ref={messagesEndRef} />
                </div>

                {/* ── Typing indicator ──────────────────────────── */}
                <div className={`px-5 transition-all duration-300 overflow-hidden ${typingLabel ? 'h-7 opacity-100' : 'h-0 opacity-0'}`}>
                    <div className="flex items-center gap-2">
                        {/* Animated dots */}
                        <div className="flex gap-0.5 items-end h-4">
                            {[0, 1, 2].map(i => (
                                <span
                                    key={i}
                                    className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500"
                                    style={{
                                        animation: 'typing-bounce 1.2s ease-in-out infinite',
                                        animationDelay: `${i * 0.2}s`
                                    }}
                                />
                            ))}
                        </div>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium italic">
                            {typingLabel}
                        </span>
                    </div>
                </div>

                {/* Input bar */}
                <div className="p-3 md:p-4 bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-white/5">
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
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
                            onChange={handleInputChange}
                            onBlur={clearTypingPresence}
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

            {/* Custom Confirm Modal */}
            {modalConfig && (
                <ConfirmModal
                    message={modalConfig.message}
                    danger={modalConfig.danger}
                    onConfirm={modalConfig.onConfirm}
                    onCancel={() => setModalConfig(null)}
                    confirmLabel="Eliminar"
                    cancelLabel="Cancelar"
                />
            )}
        </div>
    );
};

export default MensajeriaView;
