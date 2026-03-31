import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, MessageSquare, AlertTriangle, Loader2, Trash2, Clock } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { GanttBar } from '../hooks/useGanttData';
import { playSendSound } from '../../../utils/sounds';
import { feedback } from '../../../utils/feedback';

interface ShiftCommentsPaneProps {
    bar: GanttBar;
    selectedService: string;
    clientX: number;
    clientY: number;
    onUpdateIncidentTime: (assignmentId: number, time: string) => Promise<void>;
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

export const ShiftCommentsPane: React.FC<ShiftCommentsPaneProps> = ({ bar, selectedService, clientX, clientY, onUpdateIncidentTime, onClose }) => {
    const [comments, setComments] = useState<ShiftComment[]>([]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isMobile, setIsMobile] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Get current user profile
    const userProfileStr = localStorage.getItem('user_profile');
    const userProfile = userProfileStr ? JSON.parse(userProfileStr) : null;
    const authorName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() || 'Usuari' : 'Usuari';

    const scrollToBottom = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({
                top: scrollContainerRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
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
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'shift_comments'
                },
                (payload) => {
                    const deletedId = (payload.old as { id: string }).id;
                    setComments((prev) => prev.filter(c => c.id !== deletedId));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [bar.shiftId, selectedService]);

    const handleDelete = async (commentId: string) => {
        // Optimistic delete
        setComments(prev => prev.filter(c => c.id !== commentId));
        const { error } = await supabase.from('shift_comments').delete().eq('id', commentId);
        if (error) {
            console.error('Error deleting comment:', error);
        }
    };

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

    if (typeof document === 'undefined') return null;

    return createPortal(
        <>
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9000] animate-in fade-in duration-300"
                onClick={onClose}
            />
            <div
                className="fixed z-[9001] bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden"
                style={{
                    top: isMobile ? '50%' : `min(${Math.max(10, clientY - 150)}px, calc(100vh - 490px))`,
                    left: isMobile ? '50%' : `min(${clientX + 20}px, calc(100vw - 380px))`,
                    transform: isMobile ? 'translate(-50%, -50%)' : 'none',
                    width: isMobile ? 'min(400px, 92vw)' : '360px',
                    height: isMobile ? 'min(640px, 80vh)' : '480px',
                }}
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
                    {/* COMPARTIT: show both drivers with time split */}
                    {bar.sharedFirstDriverName && bar.sharedSecondDriverName ? (
                        <div className="flex flex-col gap-1">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-sky-500 font-semibold text-[10px]">
                                    {bar.sharedFirstStartMin != null ? formatMins(bar.sharedFirstStartMin) : formatMins(bar.startMin)} → {bar.sharedFirstEndMin != null ? formatMins(bar.sharedFirstEndMin) : '?'}
                                </span>
                                <span className="font-bold text-sky-600 bg-sky-500/10 px-2 py-0.5 rounded-md text-[11px]">
                                    {bar.sharedFirstDriverName}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-fgc-green font-semibold text-[10px]">
                                    {bar.sharedSecondStartMin != null ? formatMins(bar.sharedSecondStartMin) : '?'} → {bar.sharedSecondEndMin != null ? formatMins(bar.sharedSecondEndMin) : formatMins(bar.endMin)}
                                </span>
                                <span className="font-bold text-fgc-green bg-fgc-green/10 px-2 py-0.5 rounded-md text-[11px]">
                                    {bar.sharedSecondDriverName}
                                </span>
                            </div>
                        </div>
                    ) : bar.driverName ? (
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500">Agent:</span>
                            <span className="font-bold text-fgc-green bg-fgc-green/10 px-2 py-0.5 rounded-md">
                                {bar.driverName}
                            </span>
                        </div>
                    ) : null}
                    {bar.incidentStartTime && (
                        <button 
                            onClick={async () => {
                                feedback.click();
                                // This prop call should now trigger the Custom Modal in the parent (OrganitzaGantt)
                                if (bar.incidentStartTime) {
                                    await onUpdateIncidentTime(bar.assignmentId!, bar.incidentStartTime);
                                }
                            }}
                            className="flex justify-between items-center text-xs bg-amber-500/10 hover:bg-amber-500/20 rounded-md px-2 py-1.5 mt-1 border border-amber-500/20 transition-all group w-full"
                        >
                            <span className="text-amber-600 dark:text-amber-500 font-bold flex items-center gap-1">
                                <AlertTriangle size={12} /> Indisposició
                            </span>
                            <div className="flex items-center gap-1.5">
                                <span className="font-black text-amber-600 dark:text-amber-400">
                                    {bar.incidentStartTime}
                                </span>
                                <Clock size={10} className="text-amber-500/50 group-hover:text-amber-500 transition-colors" />
                            </div>
                        </button>
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/30 dark:bg-black/10">
                {isLoading ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                        <Loader2 size={24} className="animate-spin text-fgc-green" />
                        <span className="text-xs font-medium">Carregant comentaris...</span>
                    </div>
                ) : comments.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center px-4">
                        <MessageSquare size={32} className="opacity-20 mb-3" />
                        <p className="text-sm font-medium">Cap comentari per aquest torn.</p>
                        <p className="text-xs opacity-70 mt-1">Afegeix una nota rellevant per a l'equip CSO.</p>
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
                                <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] text-[13px] relative shadow-sm group ${isMe
                                    ? 'bg-fgc-green text-gray-900 rounded-tr-sm'
                                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-white/5 rounded-tl-sm'
                                    }`}>
                                    {isMe && (
                                        <button
                                            onClick={() => handleDelete(comment.id)}
                                            className="absolute -left-8 top-1/2 -translate-y-1/2 p-2 text-red-500 opacity-0 group-hover:opacity-100 dark:bg-gray-800/80 rounded-full shadow-sm hover:bg-red-50 dark:hover:bg-red-500/20 transition-all z-10"
                                            title="Esborrar comentari"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                    <p className="leading-snug break-words whitespace-pre-wrap">{comment.content}</p>
                                    <span className={`text-[9px] mt-1 block text-right opacity-60 font-medium ${isMe ? 'text-gray-800' : 'text-gray-400'}`}>
                                        {formatTime(comment.created_at)}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
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
        </>,
        document.body
    );
};
