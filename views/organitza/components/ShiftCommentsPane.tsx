import React, { useState, useEffect, useRef } from 'react';
import { X, Send, MessageSquare, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { GanttBar } from '../hooks/useGanttData';
import { playSendSound } from '../../../utils/sounds';

interface ShiftCommentsPaneProps {
    bar: GanttBar;
    selectedService: string;
    onClose: () => void;
}

interface ShiftComment {
    id: string;
    shift_id: string;
    date: string;
    content: string;
    author_name: string;
    created_at: string;
}

export const ShiftCommentsPane: React.FC<ShiftCommentsPaneProps> = ({ bar, selectedService, onClose }) => {
    const [comments, setComments] = useState<ShiftComment[]>([]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Get current user profile
    const userProfileStr = localStorage.getItem('user_profile');
    const userProfile = userProfileStr ? JSON.parse(userProfileStr) : null;
    const authorName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() || 'Usuari' : 'Usuari';

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        const fetchComments = async () => {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('shift_comments')
                .select('*')
                .eq('shift_id', bar.shiftId)
                .eq('date', selectedService)
                .order('created_at', { ascending: true });

            if (!error && data) {
                setComments(data);
            }
            setIsLoading(false);
            setTimeout(scrollToBottom, 100);
        };

        fetchComments();

        // Realtime subscription
        const subscription = supabase
            .channel(`comments_${bar.shiftId}_${selectedService}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'shift_comments',
                    filter: `shift_id=eq.${bar.shiftId}&date=eq.${selectedService}`
                },
                (payload) => {
                    const newComment = payload.new as ShiftComment;
                    setComments((prev) => {
                        if (prev.find(c => c.id === newComment.id)) return prev;
                        return [...prev, newComment];
                    });
                    setTimeout(scrollToBottom, 50);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [bar.shiftId, selectedService]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        const text = inputText.trim();
        if (!text) return;

        setInputText('');

        const newComment = {
            shift_id: bar.shiftId,
            date: selectedService,
            content: text,
            author_name: authorName,
        };

        const { error } = await supabase.from('shift_comments').insert([newComment]);
        if (!error) {
            playSendSound();
        } else {
            console.error('Error sending comment:', error);
            setInputText(text); // revert on error
        }
    };

    // Helper formatting
    const formatTime = (isoString: string) => {
        return new Date(isoString).toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
    };

    const formatMins = (totalMins: number): string => {
        const totalSecs = Math.round(totalMins * 60);
        const h = Math.floor(totalSecs / 3600) % 24;
        const m = Math.floor((totalSecs % 3600) / 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    return (
        <div
            className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 h-[65vh] sm:h-[480px] w-full sm:w-[360px] z-[999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 sm:rounded-3xl rounded-t-3xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] flex flex-col animate-in slide-in-from-bottom-10 zoom-in-95 duration-300 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20 flex items-center justify-between shrink-0">
                <div>
                    <div className="flex items-center gap-2">
                        <MessageSquare size={18} className="text-fgc-green" />
                        <h3 className="font-black text-lg text-gray-900 dark:text-white uppercase tracking-tight">
                            Comentaris
                        </h3>
                    </div>
                    <p className="text-xs font-bold text-gray-500 mt-0.5">
                        Torn {bar.shortId} · {bar.dependencia}
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-all active:scale-95"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Shift Context Info */}
            <div className="px-5 py-3 border-b border-gray-100 dark:border-white/5 bg-white dark:bg-gray-900 shrink-0 shadow-sm z-10">
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500">Horari:</span>
                        <span className="font-bold text-gray-900 dark:text-white">
                            {formatMins(bar.startMin)} - {formatMins(bar.endMin)}
                        </span>
                    </div>
                    {bar.driverName && (
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500">Agent:</span>
                            <span className="font-bold text-fgc-green bg-fgc-green/10 px-2 py-0.5 rounded-md">
                                {bar.driverName}
                            </span>
                        </div>
                    )}
                    {bar.incidentStartTime && (
                        <div className="flex justify-between items-center text-xs bg-amber-500/10 rounded-md px-2 py-1 mt-1">
                            <span className="text-amber-600 dark:text-amber-500 font-bold flex items-center gap-1"><AlertTriangle size={12} /> Indisposició</span>
                            <span className="font-black text-amber-600 dark:text-amber-400">
                                a les {bar.incidentStartTime}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/30 dark:bg-black/10">
                {isLoading ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                        <Loader2 size={24} className="animate-spin text-fgc-green" />
                        <span className="text-xs font-medium">Carregant comentaris...</span>
                    </div>
                ) : comments.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center px-4">
                        <MessageSquare size={32} className="opacity-20 mb-3" />
                        <p className="text-sm font-medium">Cap comentari per aquest torn.</p>
                        <p className="text-xs opacity-70 mt-1">Afegeix una nota rellevant per a l'equip CCO.</p>
                    </div>
                ) : (
                    comments.map((comment, index) => {
                        const isMe = comment.author_name === authorName;
                        const showName = index === 0 || comments[index - 1].author_name !== comment.author_name;

                        return (
                            <div key={comment.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2`}>
                                {showName && (
                                    <span className={`text-[10px] font-bold text-gray-400 mb-1 ${isMe ? 'mr-2' : 'ml-2'}`}>
                                        {isMe ? 'Tu' : comment.author_name}
                                    </span>
                                )}
                                <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] text-[13px] relative shadow-sm ${isMe
                                    ? 'bg-fgc-green text-gray-900 rounded-tr-sm'
                                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-white/5 rounded-tl-sm'
                                    }`}>
                                    <p className="leading-snug break-words whitespace-pre-wrap">{comment.content}</p>
                                    <span className={`text-[9px] mt-1 block text-right opacity-60 font-medium ${isMe ? 'text-gray-800' : 'text-gray-400'}`}>
                                        {formatTime(comment.created_at)}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <div className="p-4 bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-white/5 shrink-0">
                <form onSubmit={handleSend} className="flex gap-2 relative">
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Afegeix un comentari..."
                        className="flex-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-fgc-green focus:ring-1 focus:ring-fgc-green transition-all"
                    />
                    <button
                        type="submit"
                        disabled={!inputText.trim()}
                        className="p-3 bg-fgc-green text-white rounded-xl hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all shadow-md shrink-0 flex items-center justify-center"
                    >
                        <Send size={18} className={inputText.trim() ? "translate-x-0.5 -translate-y-0.5" : ""} />
                    </button>
                </form>
            </div>
        </div>
    );
};
