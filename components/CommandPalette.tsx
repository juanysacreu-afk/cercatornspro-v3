
import React, { useState, useEffect, useRef } from 'react';
import { Search, Train, User, MapPin, X, ArrowRight, Loader2, Command } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { ALL_STATIONS } from '../utils/fgc';
import { feedback } from '../utils/feedback';

const normalizeStr = (str: string) =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

interface SearchResult {
    id: string;
    type: 'shift' | 'driver' | 'circulation' | 'station';
    title: string;
    subtitle?: string;
    metadata?: any;
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (result: SearchResult) => void;
    triggerRect?: DOMRect | null;
}

const CommandPaletteComponent: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onSelect, triggerRect }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [animating, setAnimating] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Expansion coordinates (Viewport relative)
    const cx = triggerRect ? triggerRect.left + triggerRect.width / 2 : window.innerWidth / 2;
    const cy = triggerRect ? triggerRect.top + triggerRect.height / 2 : window.innerHeight / 2;

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setResults([]);
            setSelectedIndex(0);
            setAnimating(true);

            // Trigger expansion almost immediately
            const timer = setTimeout(() => {
                setIsExpanded(true);
            }, 10);

            // Immediate focus attempt for mobile
            inputRef.current?.focus();

            // Slower focus attempt for when animation ends
            const focusTimer = setTimeout(() => {
                inputRef.current?.focus();
            }, 400);

            return () => {
                clearTimeout(timer);
                clearTimeout(focusTimer);
            };
        } else {
            setIsExpanded(false);
            setAnimating(true);
            const timer = setTimeout(() => {
                setAnimating(false);
            }, 400);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                feedback.haptic(2);
                setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                feedback.haptic(2);
                setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
            }
            if (e.key === 'Enter' && results[selectedIndex]) {
                onSelect(results[selectedIndex]);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, results, selectedIndex, onClose, onSelect]);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.length < 2) {
                setResults([]);
                return;
            }
            setLoading(true);
            try {
                const searchTasks = [
                    supabase.from('shifts').select('id, servei').ilike('id', `%${query}%`).limit(5),
                    supabase.from('daily_assignments').select('nom, cognoms, torn, empleat_id').or(`nom.ilike.%${query}%,cognoms.ilike.%${query}%,empleat_id.ilike.%${query}%`).limit(5),
                    supabase.from('circulations').select('id, inici, final').ilike('id', `%${query}%`).limit(5)
                ];
                const [shiftsRes, driversRes, circRes] = await Promise.all(searchTasks);
                const newResults: SearchResult[] = [];
                const normalizedQuery = normalizeStr(query);

                ALL_STATIONS.filter(s => normalizeStr(s).includes(normalizedQuery)).slice(0, 3).forEach(s => {
                    newResults.push({ id: s, type: 'station', title: s, subtitle: 'Estació de la xarxa' });
                });
                shiftsRes.data?.forEach(s => {
                    newResults.push({ id: s.id, type: 'shift', title: `Torn ${s.id}`, subtitle: `Servei S-${s.servei}` });
                });
                driversRes.data?.forEach(d => {
                    const fullName = `${d.cognoms}, ${d.nom}`;
                    newResults.push({ id: `${fullName} (${d.empleat_id})`, type: 'driver', title: fullName, subtitle: `Torn ${d.torn} (Nom. ${d.empleat_id})`, metadata: { torn: d.torn, nomina: d.empleat_id } });
                });
                circRes.data?.forEach(c => {
                    newResults.push({ id: c.id, type: 'circulation', title: `Circulació ${c.id}`, subtitle: `${c.inici} ➔ ${c.final}` });
                });
                setResults(newResults);
                setSelectedIndex(0);
            } catch (err) {
                console.error('Search error:', err);
            } finally {
                setLoading(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    if (!isOpen && !animating) return null;

    return (
        <div
            className={`fixed inset-0 z-[10001] flex items-start justify-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] transition-all duration-400 ease-[cubic-bezier(0.23,1,0.32,1)] will-change-[clip-path] cursor-default ${isOpen && isExpanded ? 'bg-black/40 backdrop-blur-sm pointer-events-auto' : 'bg-transparent backdrop-blur-0 pointer-events-none'}`}
            style={{
                clipPath: isExpanded
                    ? `circle(150% at ${cx}px ${cy}px)`
                    : `circle(0px at ${cx}px ${cy}px)`
            }}
        >
            {/* Backdrop click area */}
            <div className="absolute inset-0" onClick={onClose} />

            {/* Container */}
            <div
                className={`w-full max-w-2xl bg-white dark:bg-gray-900 rounded-[32px] shadow-2xl overflow-hidden relative transition-all duration-300 ${isOpen && isExpanded ? 'mt-0 sm:mt-[10vh] opacity-100 scale-100' : 'mt-0 opacity-0 scale-90 translate-y-10'}`}
            >
                {/* Header */}
                <div className="relative border-b border-gray-100 dark:border-white/5">
                    <Search className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-400" size={24} />
                    <input
                        ref={inputRef}
                        type="text"
                        autoFocus
                        placeholder="Cerca nòmina, torn, estació..."
                        className="w-full bg-transparent py-7 pl-16 pr-20 text-xl font-bold dark:text-white outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck="false"
                    />
                    <div className="absolute right-7 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        {loading ? <Loader2 className="animate-spin text-fgc-green" size={20} /> : (
                            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors">
                                <X size={20} className="text-gray-400" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Results Container */}
                <div className="max-h-[50vh] overflow-y-auto custom-scrollbar px-3 py-4">
                    {results.length > 0 ? (
                        <div className="space-y-1">
                            {results.map((result, index) => (
                                <button
                                    key={`${result.type}-${result.id}-${index}`}
                                    onClick={() => { feedback.click(); onSelect(result); }}
                                    className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all text-left group ${selectedIndex === index ? 'bg-fgc-green text-fgc-grey shadow-lg shadow-fgc-green/20' : 'hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300'}`}
                                >
                                    <div className="p-3 rounded-xl bg-gray-100 dark:bg-white/10 group-hover:bg-fgc-grey/10 transition-colors">
                                        {result.type === 'shift' && <Command size={18} />}
                                        {result.type === 'driver' && <User size={18} />}
                                        {result.type === 'circulation' && <Train size={18} />}
                                        {result.type === 'station' && <MapPin size={18} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`font-black text-base uppercase tracking-tight ${selectedIndex === index ? 'text-fgc-grey' : ''}`}>{result.title}</p>
                                        <p className={`text-xs font-medium truncate ${selectedIndex === index ? 'text-fgc-grey/70' : 'text-gray-400'}`}>{result.subtitle}</p>
                                    </div>
                                    <ArrowRight size={18} className={`transition-all ${selectedIndex === index ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'}`} />
                                </button>
                            ))}
                        </div>
                    ) : query.length >= 2 ? (
                        <div className="py-20 text-center space-y-4 opacity-40">
                            <Search size={32} className="mx-auto text-gray-300 dark:text-gray-700" />
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest italic">Sense resultats per "{query}"</p>
                        </div>
                    ) : (
                        <div className="py-20 text-center space-y-4 opacity-20">
                            <Command size={40} className="mx-auto text-gray-400" />
                            <p className="text-xs font-black uppercase tracking-[0.4em] text-gray-400">Escriu per cercar...</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-gray-50 dark:bg-black/20 border-t border-gray-100 dark:border-white/5 flex items-center justify-between text-[10px] font-black text-gray-400 uppercase tracking-tighter">
                    <div className="flex items-center gap-4">
                        <span>ESC per tancar</span>
                    </div>
                    <p className="text-gray-300 dark:text-gray-700">Smart Search v3</p>
                </div>
            </div>
        </div>
    );
};

export const CommandPalette = React.memo(CommandPaletteComponent);
export default CommandPalette;
