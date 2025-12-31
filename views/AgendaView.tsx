
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, User, Phone, Hash, Loader2, ArrowRight, X, UserCircle, CalendarDays } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';
import { PhonebookEntry, DailyAssignment } from '../types.ts';

export const AgendaView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [allAgents, setAllAgents] = useState<PhonebookEntry[]>([]);
  const [assignments, setAssignments] = useState<DailyAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  useEffect(() => {
    fetchData();
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Carreguem tot en paral·lel per fer filtratge local instantani (molt més ràpid)
      const [pbResponse, assigResponse] = await Promise.all([
        supabase.from('phonebook').select('*'),
        supabase.from('daily_assignments').select('*')
      ]);

      if (pbResponse.data) {
        // Ordenat per nom inicialment
        const sorted = (pbResponse.data as PhonebookEntry[]).sort((a, b) => 
          a.nom.localeCompare(b.nom)
        );
        setAllAgents(sorted);
      }
      if (assigResponse.data) {
        setAssignments(assigResponse.data as DailyAssignment[]);
      }
    } catch (e) {
      console.error("Error carregant agenda:", e);
    } finally {
      setLoading(false);
    }
  };

  // Filtratge local de suggeriments (instantani)
  const suggestions = useMemo(() => {
    if (!query || query.length < 1) return [];
    const lowerQuery = query.toLowerCase();
    return allAgents.filter(a => {
      const fullName = `${a.nom} ${a.cognom1 || ''} ${a.cognom2 || ''}`.toLowerCase();
      return fullName.includes(lowerQuery) || a.nomina.includes(query);
    }).slice(0, 6);
  }, [query, allAgents]);

  // Filtratge local de la llista principal (instantani)
  const filteredAgents = useMemo(() => {
    let list = allAgents;
    
    // Si hi ha una lletra seleccionada, filtrem primer per lletra (si no hi ha cerca activa)
    if (selectedLetter && !query) {
      list = list.filter(a => a.nom.toUpperCase().startsWith(selectedLetter));
    }

    // Si hi ha una cerca activa, ignorem la lletra i cerquem a tota la base de dades local
    if (query) {
      const lowerQuery = query.toLowerCase();
      list = list.filter(a => {
        const fullName = `${a.nom} ${a.cognom1 || ''} ${a.cognom2 || ''}`.toLowerCase();
        return fullName.includes(lowerQuery) || a.nomina.includes(query);
      });
    }

    return list;
  }, [allAgents, selectedLetter, query]);

  const handleSuggestionClick = (agent: PhonebookEntry) => {
    // Usem la nòmina com a cerca perquè és única i ens assegura que el filtre el trobi
    setQuery(agent.nomina);
    setSelectedLetter(null);
    setShowSuggestions(false);
  };

  const getAgentShift = (nomina: string) => {
    return assignments.find(a => a.empleat_id === nomina);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-black text-fgc-grey tracking-tight uppercase">Agenda de Personal</h1>
        <p className="text-gray-500 font-medium">Directori del servei amb dades de contacte i torns actius.</p>
      </header>

      {/* Buscador i Autocomplete (Local i Ràpid) */}
      <div className="relative max-w-2xl mx-auto" ref={searchRef}>
        <div className="relative group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-fgc-green transition-colors" size={24} />
          <input 
            type="text" 
            placeholder="Cerca per nom, cognoms o nòmina..." 
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (selectedLetter) setSelectedLetter(null);
            }}
            onFocus={() => setShowSuggestions(true)}
            className="w-full bg-white border-none rounded-[28px] py-6 pl-16 pr-12 focus:ring-4 focus:ring-fgc-green/20 outline-none text-xl font-bold shadow-xl shadow-fgc-grey/5 transition-all placeholder:text-gray-300"
          />
          {query && (
            <button 
              onClick={() => { setQuery(''); }}
              className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-500 transition-colors"
            >
              <X size={24} />
            </button>
          )}
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-4 right-4 mt-3 bg-white rounded-[32px] shadow-2xl border border-gray-100 z-[100] overflow-hidden animate-in slide-in-from-top-2 duration-300">
            {suggestions.map((agent) => (
              <button 
                key={agent.nomina}
                onClick={() => handleSuggestionClick(agent)}
                className="w-full text-left px-8 py-5 hover:bg-fgc-green/10 transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-fgc-grey text-white rounded-full flex items-center justify-center font-black text-xs">
                    {agent.nom.charAt(0)}
                  </div>
                  <div>
                    <p className="font-black text-fgc-grey uppercase leading-none">{agent.nom} {agent.cognom1} {agent.cognom2}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Nòmina: {agent.nomina}</p>
                  </div>
                </div>
                <ArrowRight size={18} className="opacity-0 group-hover:opacity-100 transition-all text-fgc-green" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filtre Alfabètic */}
      <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
          <button 
            onClick={() => { setSelectedLetter(null); setQuery(''); }}
            className={`px-4 h-10 rounded-xl font-black text-sm transition-all flex items-center justify-center border ${
              selectedLetter === null && !query ? 'bg-fgc-grey text-white border-fgc-grey shadow-md' : 'bg-gray-50 text-gray-400 border-gray-100 hover:border-fgc-green hover:text-fgc-green'
            }`}
          >
            Tots
          </button>
          {alphabet.map(letter => (
            <button 
              key={letter}
              onClick={() => { setSelectedLetter(letter); setQuery(''); }}
              className={`w-10 h-10 rounded-xl font-black text-sm transition-all flex items-center justify-center border ${
                selectedLetter === letter ? 'bg-fgc-green text-fgc-grey border-fgc-green shadow-lg' : 'bg-gray-50 text-gray-400 border-gray-100 hover:border-fgc-green hover:text-fgc-green'
              }`}
            >
              {letter}
            </button>
          ))}
        </div>
      </div>

      {/* Llistat d'Agents */}
      {loading ? (
        <div className="py-40 flex flex-col items-center gap-4 text-gray-300">
          <Loader2 className="animate-spin text-fgc-green" size={48} />
          <p className="font-black uppercase tracking-widest text-xs">Precarregant dades...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
          {filteredAgents.length > 0 ? (
            filteredAgents.map(agent => {
              const shift = getAgentShift(agent.nomina);
              return (
                <div key={agent.nomina} className="bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm hover:shadow-xl hover:border-fgc-green/30 transition-all group relative overflow-hidden flex flex-col h-full">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-fgc-green/5 -mr-8 -mt-8 rounded-full blur-2xl group-hover:bg-fgc-green/10 transition-colors" />
                  
                  <div className="flex items-center gap-5 mb-8 relative z-10">
                    <div className="w-16 h-16 bg-fgc-grey text-white rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg shrink-0">
                      {agent.nom.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xl font-black text-fgc-grey leading-tight uppercase truncate">{agent.nom} {agent.cognom1} {agent.cognom2}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Hash size={12} className="text-gray-400" />
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{agent.nomina}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-6 relative z-10">
                    {/* Telèfons */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-1">
                        <Phone size={12} className="text-fgc-green" />
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Contacte</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {agent.phones && agent.phones.length > 0 ? (
                          agent.phones.map((p, idx) => (
                            <a 
                              key={idx} 
                              href={`tel:${p}`} 
                              className="flex items-center gap-2.5 bg-gray-50 text-fgc-grey px-4 py-2 rounded-xl text-sm font-black hover:bg-fgc-green transition-all shadow-sm border border-gray-100"
                            >
                              <Phone size={14} />
                              {p}
                            </a>
                          ))
                        ) : (
                          <span className="text-xs font-bold text-gray-300 italic px-1">Sense telèfons</span>
                        )}
                      </div>
                    </div>

                    {/* Torn Assignat */}
                    <div className="pt-6 border-t border-gray-100 space-y-3">
                      <div className="flex items-center gap-2 px-1">
                        <CalendarDays size={12} className="text-blue-500" />
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Assignació Diària</span>
                      </div>
                      {shift ? (
                        <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100 flex items-center justify-between group/shift">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-10 bg-fgc-grey text-white rounded-lg flex items-center justify-center font-black text-sm shadow-md">
                              {shift.torn}
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-blue-600 uppercase tracking-tighter leading-none mb-1">Horari</p>
                              <p className="text-base font-black text-fgc-grey leading-none">
                                {shift.hora_inici} — {shift.hora_fi}
                              </p>
                            </div>
                          </div>
                          <div className="p-2 bg-white rounded-lg opacity-0 group-hover/shift:opacity-100 transition-opacity shadow-sm">
                            <ArrowRight size={14} className="text-blue-500" />
                          </div>
                        </div>
                      ) : (
                        <div className="bg-gray-50/50 rounded-2xl p-4 border border-dashed border-gray-200 text-center">
                          <p className="text-xs font-bold text-gray-300 italic">Sense torn assignat avui</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-40 text-center space-y-6 opacity-30">
              <UserCircle size={80} className="mx-auto text-gray-200" />
              <div className="space-y-2">
                <p className="text-2xl font-black uppercase tracking-[0.2em] text-fgc-grey">No s'han trobat agents</p>
                <p className="text-sm font-bold">Prova amb una altra cerca o filtre alfabètic.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AgendaView;
