import React, { useState } from 'react';
import { Send, Hash, MoreVertical, MessageCircle, AlertTriangle, Paperclip, CheckCircle } from 'lucide-react';
import GlassPanel from '../../components/common/GlassPanel';
import { sendTelegramMessage } from '../../src/lib/telegram';

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

const DUMMY_MESSAGES: Message[] = [
    {
        id: '1',
        text: '⚠️ S1 interrompuda entre Sant Cugat i Terrassa per avaria d\'agulles a Rubí. Bus alternatiu en marxa.',
        sender_name: 'Marcos Lopez',
        sender_id: 'current-user-id', // Simulando que lo envió el bot / auto
        is_alert: true,
        created_at: new Date(Date.now() - 3600000).toISOString() // hace 1 hora
    },
    {
        id: '2',
        text: 'Entesos. He avisat a les estacions de la línia S1 afectades per megafonia.',
        sender_name: 'Laura Sanchez',
        sender_id: 'other',
        is_alert: false,
        created_at: new Date(Date.now() - 3500000).toISOString()
    },
    {
        id: '3',
        text: 'Tècnics ja treballant en la incidència. Temps estimat de resolució: 45 minuts.',
        sender_name: 'Manteniment',
        sender_id: 'bot',
        is_alert: false,
        created_at: new Date(Date.now() - 3000000).toISOString()
    }
];

const MensajeriaView: React.FC<MensajeriaViewProps> = ({ currentProfile }) => {
    const [messages, setMessages] = useState<Message[]>(DUMMY_MESSAGES);
    const [inputText, setInputText] = useState('');

    const currentUserId = currentProfile.id || 'current-user-id';

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

        const newMessage: Message = {
            id: Date.now().toString(),
            text: visualText,
            sender_name: `${currentProfile.firstName} ${currentProfile.lastName}`,
            sender_id: currentUserId,
            is_alert: isAlert,
            created_at: new Date().toISOString()
        };

        setMessages((prev) => [...prev, newMessage]);

        // Actually send to Telegram API
        const { success, error } = await sendTelegramMessage(formattedTelegramMsg);

        if (!success) {
            console.error("Failed to send to Telegram", error);
            // Optionally could show a toast or remove the message
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
                            <span>12 membres</span>
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
