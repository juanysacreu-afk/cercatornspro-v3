
import React, { useState, useEffect, useRef } from 'react';
import { Search, Train, User, MapPin, X, ArrowRight, Loader2, Command } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { ALL_STATIONS } from '../utils/fgc';

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
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onSelect }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setResults([]);
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;

            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
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
                    // 1. Search Shifts (Torns)
                    supabase.from('shifts').select('id, servei').ilike('id', `%${query}%`).limit(5),
                    // 2. Search Drivers
                    supabase.from('daily_assignments').select('nom, cognoms, torn, empleat_id').or(`nom.ilike.%${query}%,cognoms.ilike.%${query}%,empleat_id.ilike.%${query}%`).limit(5),
                    // 3. Search Circulations
                    supabase.from('circulations').select('id, inici, final').ilike('id', `%${query}%`).limit(5)
                ];

                const [shiftsRes, driversRes, circRes] = await Promise.all(searchTasks);

                const newResults: SearchResult[] = [];
                const normalizedQuery = normalizeStr(query);

                // Stations Local Search
                ALL_STATIONS.filter(s => normalizeStr(s).includes(normalizedQuery)).slice(0, 3).forEach(s => {
                    newResults.push({ id: s, type: 'station', title: s, subtitle: 'Estació de la xarxa' });
                });

                // Shifts
                shiftsRes.data?.forEach(s => {
                    newResults.push({ id: s.id, type: 'shift', title: `Torn ${s.id}`, subtitle: `Servei S-${s.servei}` });
                });

                // Drivers
                driversRes.data?.forEach(d => {
                    const fullName = `${d.cognoms}, ${d.nom}`;
                    const searchId = `${fullName} (${d.empleat_id})`;

                    // Client-side refinement for accent-insensitivity if needed
                    // (though Supabase ilike already filtered some, this ensures parity)
                    newResults.push({
                        id: searchId,
                        type: 'driver',
                        title: fullName,
                        subtitle: `Torn ${d.torn} (Nom. ${d.empleat_id})`,
                        metadata: { torn: d.torn, nomina: d.empleat_id }
                    });
                });

                // Optimization: if no results from DB because of accents, we could fetch a broader set,
                // but for now we focus on local standardization of what we display.

                // Circulations
                circRes.data?.forEach(c => {
                    newResults.push({ id: c.id, type: 'circulation', title: `Circulació ${c.id}`, subtitle: `${c.inici} ➔ ${c.final}` });
                });

                setResults(newResults);
                setSelectedIndex(0);
            } catch (err) {
                console.error('Command Palette Search Error:', err);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    if (!isOpen) return null;

    const getIcon = (type: SearchResult['type']) => {
        switch (type) {
            case 'shift': return <Command size={18} />;
            case 'driver': return <User size={18} />;
            case 'circulation': return <Train size={18} />;
            case 'station': return <MapPin size={18} />;
        }
    };

    return (
        <div className="fixed inset-0 z-[10001] flex items-start justify-center pt-[15vh] px-4">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Palette Overlay */}
            <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-[32px] shadow-2xl border border-gray-100 dark:border-white/10 overflow-hidden relative animate-in zoom-in-95 slide-in-from-top-4 duration-300">
                <div className="relative border-b border-gray-100 dark:border-white/5">
                    <Search className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-400" size={24} />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Cerca qualsevol cosa (Cmd + K)..."
                        className="w-full bg-transparent py-7 pl-16 pr-20 text-xl font-bold dark:text-white outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <div className="absolute right-7 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        {loading ? <Loader2 className="animate-spin text-fgc-green" size={20} /> : (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-white/5 rounded-lg border border-gray-200/50 dark:border-white/5 text-[10px] font-black text-gray-400 uppercase tracking-tighter">
                                ESC tancar
                            </div>
                        )}
                    </div>
                </div>

                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar px-3 py-4">
                    {results.length > 0 ? (
                        <div className="space-y-1">
                            {results.map((result, index) => (
                                <button
                                    key={`${result.type}-${result.id}-${index}`}
                                    onClick={() => onSelect(result)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all text-left group ${selectedIndex === index
                                        ? 'bg-fgc-green text-fgc-grey shadow-lg shadow-fgc-green/20 translate-x-1'
                                        : 'hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300'
                                        }`}
                                >
                                    <div className={`p-3 rounded-xl ${selectedIndex === index ? 'bg-fgc-grey/10' : 'bg-gray-100 dark:bg-white/10'
                                        }`}>
                                        {getIcon(result.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`font-black text-base uppercase tracking-tight ${selectedIndex === index ? 'text-fgc-grey' : ''
                                            }`}>{result.title}</p>
                                        <p className={`text-xs font-medium truncate ${selectedIndex === index ? 'text-fgc-grey/70' : 'text-gray-400'
                                            }`}>{result.subtitle}</p>
                                    </div>
                                    <ArrowRight
                                        size={18}
                                        className={`transition-all ${selectedIndex === index ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
                                            }`}
                                    />
                                </button>
                            ))}
                        </div>
                    ) : query.length >= 2 ? (
                        <div className="py-20 text-center space-y-4 opacity-40">
                            <div className="w-16 h-16 bg-gray-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto text-gray-300 dark:text-gray-700">
                                <Search size={32} />
                            </div>
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest italic">No s'han trobat resultats per "{query}"</p>
                        </div>
                    ) : (
                        <div className="py-24 text-center space-y-4 opacity-20">
                            <div className="w-20 h-20 bg-gray-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto">
                                <Command size={40} className="text-gray-400" />
                            </div>
                            <p className="text-xs font-black uppercase tracking-[0.4em] text-gray-400">Escriu per cercar...</p>
                        </div>
                    )}
                </div>

                {/* Footer info */}
                <div className="p-4 bg-gray-50 dark:bg-black/20 border-t border-gray-100 dark:border-white/5 flex items-center justify-between text-[10px] font-black text-gray-400 uppercase tracking-tighter">
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1"><ArrowRight size={10} className="rotate-90" /> navegar</span>
                        <span className="flex items-center gap-1"><Command size={10} className="rotate-180" /> seleccionar</span>
                    </div>
                    <p className="text-gray-300 dark:text-gray-700">Cercatorns PRO v3 - Smart Search</p>
                </div>
            </div>
        </div>
    );
};

export default CommandPalette;
