import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { OrganizeType, DailyAssignment } from '../types.ts';
import { Search, Phone, User, Loader2, Clock, LayoutGrid, ArrowRight, CheckCircle2, Coffee, Info, Filter, UserCircle, ChevronDown, X, Train, Hash, RefreshCcw } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';
import { fetchFullTurns } from '../utils/queries.ts';
import { getShortTornId } from '../utils/fgc.ts';
import { getServiceToday } from '../utils/serviceCalendar';

type DisDesFilterType = 'ALL' | 'DIS' | 'DES' | 'DIS_DES' | 'FOR' | 'VAC' | 'DAG';

export const OrganitzaView: React.FC<{
  isPrivacyMode: boolean
}> = ({ isPrivacyMode }) => {
  const [organizeType, setOrganizeType] = useState<OrganizeType>(OrganizeType.Comparador);

  const [nowMin, setNowMin] = useState<number>(0);
  const [selectedServei, setSelectedServei] = useState<string>(getServiceToday());

  const [turn1Id, setTurn1Id] = useState('');
  const [turn2Id, setTurn2Id] = useState('');
  const [turn1Data, setTurn1Data] = useState<any>(null);
  const [turn2Data, setTurn2Data] = useState<any>(null);
  const [loadingComparator, setLoadingComparator] = useState(false);

  const [maquinistaQuery, setMaquinistaQuery] = useState('');
  const [allAssignments, setAllAssignments] = useState<DailyAssignment[]>([]);
  const [phonebook, setPhonebook] = useState<Record<string, string[]>>({});
  const [disDesFilter, setDisDesFilter] = useState<DisDesFilterType>('DIS_DES');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [loadingMaquinistes, setLoadingMaquinistes] = useState(false);

  const filterRef = useRef<HTMLDivElement>(null);
  const serveiTypes = ['0', '100', '400', '500'];

  function getFgcMinutes(timeStr: string) {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    let total = h * 60 + m;
    if (h < 4) total += 24 * 60;
    return total;
  }

  function formatFgcTime(totalMinutes: number) {
    let mins = totalMinutes;
    if (mins >= 24 * 60) mins -= 24 * 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  const getStatusColor = (codi: string) => {
    const c = (codi || '').toUpperCase().trim();
    if (c === 'PC') return 'bg-blue-400';
    if (c === 'SR') return 'bg-purple-600';
    if (c === 'RE') return 'bg-purple-300';
    if (c === 'RB') return 'bg-pink-500';
    if (c === 'NA') return 'bg-orange-500';
    if (c === 'PN') return 'bg-[#00B140]';
    if (c === 'TB') return 'bg-[#a67c52]';
    return 'bg-gray-200 dark:bg-gray-700';
  };

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      setNowMin(getFgcMinutes(timeStr));
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (organizeType === OrganizeType.Maquinista) {
      fetchMaquinistes();
    }
  }, [organizeType]);

  const fetchMaquinistes = async () => {
    setLoadingMaquinistes(true);
    try {
      const [assigRes, phoneRes] = await Promise.all([
        supabase.from('daily_assignments').select('*').order('cognoms', { ascending: true }),
        supabase.from('phonebook').select('nomina, phones')
      ]);

      if (assigRes.data) setAllAssignments(assigRes.data);
      if (phoneRes.data) {
        const phoneMap: Record<string, string[]> = {};
        phoneRes.data.forEach((p: any) => {
          phoneMap[p.nomina] = p.phones;
        });
        setPhonebook(phoneMap);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMaquinistes(false);
    }
  };

  const getSegments = useCallback((turn: any) => {
    if (!turn) return [];
    const startMin = getFgcMinutes(turn.inici_torn);
    const endMin = getFgcMinutes(turn.final_torn);
    const segments: any[] = [];
    let currentPos = startMin;
    const circs = turn.fullCirculations || [];
    circs.forEach((circ: any, index: number) => {
      const cStart = getFgcMinutes(circ.sortida);
      const cEnd = getFgcMinutes(circ.arribada);
      if (cStart > currentPos) {
        let locationCode = index === 0 ? (circ.machinistInici || turn.dependencia || '') : (circs[index - 1].machinistFinal || '');
        segments.push({ start: currentPos, end: cStart, type: 'gap', codi: (locationCode || '').trim().toUpperCase() || 'DESCANS' });
      }
      segments.push({ start: cStart, end: cEnd, type: 'circ', codi: circ.codi, train: circ.train });
      currentPos = Math.max(currentPos, cEnd);
    });
    if (currentPos < endMin) {
      const lastLoc = circs.length > 0 ? circs[circs.length - 1].machinistFinal : turn.dependencia;
      segments.push({ start: currentPos, end: endMin, type: 'gap', codi: (lastLoc || '').trim().toUpperCase() || 'FINAL' });
    }
    return segments;
  }, []);

  const calculateCoincidences = useCallback((t1: any, t2: any) => {
    if (!t1 || !t2) return [];
    const segs1 = getSegments(t1).filter(s => s.type === 'gap');
    const segs2 = getSegments(t2).filter(s => s.type === 'gap');
    const coincidences: any[] = [];
    segs1.forEach(s1 => {
      segs2.forEach(s2 => {
        const c1 = s1.codi.toUpperCase(); const c2 = s2.codi.toUpperCase();
        if (c1 === c2 && c1 !== 'DESCANS' && c1 !== 'FINAL' && c1 !== '') {
          const overlapStart = Math.max(s1.start, s2.start); const overlapEnd = Math.min(s1.end, s2.end);
          if (overlapStart < overlapEnd) {
            if (!coincidences.some(c => c.codi === c1 && c.start === overlapStart && c.end === overlapEnd)) {
              coincidences.push({ codi: c1, start: overlapStart, end: overlapEnd, duration: overlapEnd - overlapStart, driver1: t1.drivers[0].nom, driver2: t2.drivers[0].nom, turn1: t1.id, turn2: t2.id });
            }
          }
        }
      });
    });
    return coincidences.sort((a, b) => a.start - b.start);
  }, [getSegments]);

  const fetchFullTurnData = async (turnId: string) => {
    const results = await fetchFullTurns([turnId], selectedServei === '0' ? undefined : selectedServei);
    return results[0] || null;
  };

  const handleCompare = async () => {
    if (!turn1Id || !turn2Id) return;
    setLoadingComparator(true);
    try {
      const [d1, d2] = await Promise.all([fetchFullTurnData(turn1Id), fetchFullTurnData(turn2Id)]);
      setTurn1Data(d1); setTurn2Data(d2);
    } catch (e) { console.error(e); } finally { setLoadingComparator(false); }
  };

  const turn1Segments = useMemo(() => getSegments(turn1Data), [turn1Data, getSegments]);
  const turn2Segments = useMemo(() => getSegments(turn2Data), [turn2Data, getSegments]);

  const gr = useMemo(() => (turn1Data && turn2Data) ? {
    min: Math.min(getFgcMinutes(turn1Data.inici_torn), getFgcMinutes(turn2Data.inici_torn)),
    max: Math.max(getFgcMinutes(turn1Data.final_torn), getFgcMinutes(turn2Data.final_torn))
  } : { min: 0, max: 0 }, [turn1Data, turn2Data]);

  const coincidences = useMemo(() => calculateCoincidences(turn1Data, turn2Data), [turn1Data, turn2Data, calculateCoincidences]);

  const filteredMaquinistes = useMemo(() => {
    return allAssignments.filter(maquinista => {
      const searchStr = maquinistaQuery.toLowerCase();
      const queryMatch = (maquinista.nom || '').toLowerCase().includes(searchStr) ||
        (maquinista.cognoms || '').toLowerCase().includes(searchStr) ||
        maquinista.empleat_id.includes(searchStr);

      if (!queryMatch) return false;
      if (disDesFilter === 'ALL') return true;
      if (disDesFilter === 'DIS') return maquinista.torn.startsWith('DIS');
      if (disDesFilter === 'DES') return maquinista.torn.startsWith('DES');
      if (disDesFilter === 'DIS_DES') return maquinista.torn.startsWith('DIS') || maquinista.torn.startsWith('DES');
      if (disDesFilter === 'FOR') return maquinista.torn.startsWith('FOR');
      if (disDesFilter === 'VAC') return maquinista.torn.startsWith('VAC');
      if (disDesFilter === 'DAG') return maquinista.torn.startsWith('DAG');

      return true;
    });
  }, [allAssignments, maquinistaQuery, disDesFilter]);

  const SimpleTimeline = ({ segments, label, colorMode = 'normal', turnId = '', globalMin, globalMax }: { segments: any[], label: string, colorMode?: 'normal' | 'coincidence', turnId?: string, globalMin: number, globalMax: number }) => {
    if (segments.length === 0 && colorMode !== 'coincidence') return null;
    const total = globalMax - globalMin; if (total <= 0) return null;
    return (
      <div className="space-y-3 relative z-10">
        <div className="flex justify-between items-center px-4">
          <div className="flex items-center gap-2"><span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">{label}</span>{turnId && <span className="bg-fgc-grey dark:bg-black text-white text-[9px] font-black px-2 py-0.5 rounded-md uppercase whitespace-nowrap">Torn {turnId}</span>}</div>
          <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500"><Clock size={12} /><span className="text-[10px] font-bold">{formatFgcTime(globalMin)} — {formatFgcTime(globalMax)}</span></div>
        </div>
        <div className="h-14 bg-gray-100/30 dark:bg-black/30 rounded-[24px] p-1.5 relative border border-gray-100 dark:border-white/5 shadow-inner transition-colors">
          {segments.map((seg, i) => {
            const left = ((seg.start - globalMin) / total) * 100; const width = ((seg.end - seg.start) / total) * 100;
            return (
              <div key={i} style={{ left: `${left}%`, width: `${width}%` }} className={`absolute top-1.5 bottom-1.5 rounded-xl flex items-center justify-center transition-all group cursor-pointer z-10 ${colorMode === 'coincidence' ? 'bg-fgc-green border-2 border-white/40 shadow-sm hover:brightness-105' : seg.type === 'circ' ? 'bg-gray-300 dark:bg-gray-700' : getStatusColor(seg.codi)}`}>
                {width > 4 && <span className={`text-[9px] font-black truncate px-1 ${seg.type === 'circ' ? 'text-gray-600 dark:text-gray-300' : 'text-white'}`}>{seg.codi}</span>}
                <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-fgc-grey dark:bg-black text-white text-[10px] font-bold py-2 px-3 rounded-xl opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 whitespace-nowrap z-[100] pointer-events-none shadow-2xl border border-white/10">
                  <div className="flex flex-col gap-0.5"><span className="text-fgc-green uppercase text-[8px] tracking-widest">{seg.type === 'gap' || colorMode === 'coincidence' ? 'ESTADA' : 'CIRCULACIÓ'}</span><span className="text-base font-black">{seg.codi}</span><span className="opacity-60">{formatFgcTime(seg.start)} — {formatFgcTime(seg.end)} ({seg.end - seg.start} min)</span></div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-fgc-grey dark:border-t-black" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const filterLabels: Record<DisDesFilterType, string> = {
    ALL: 'Tots',
    DIS: 'DIS',
    DES: 'DES',
    DIS_DES: 'DIS + DES',
    FOR: 'FOR',
    VAC: 'VAC',
    DAG: 'DAG'
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div><h1 className="text-2xl sm:text-3xl font-black text-fgc-grey dark:text-white tracking-tight title-glow uppercase">Organització de Torn</h1><p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 font-medium">Anàlisi comparativa i gestió.</p></div>
        <div className="flex bg-white/20 dark:bg-black/20 p-1.5 rounded-[20px] backdrop-blur-md border border-white/20 shadow-inner">
          <button onClick={() => setOrganizeType(OrganizeType.Comparador)} className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-6 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-sm font-black transition-all whitespace-nowrap ${organizeType === OrganizeType.Comparador ? 'bg-fgc-grey dark:bg-fgc-green dark:text-fgc-grey text-white shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-white/10'}`}><RefreshCcw size={16} /><span className="truncate">Comparador</span></button>
          <button onClick={() => setOrganizeType(OrganizeType.Maquinista)} className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-6 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-sm font-black transition-all whitespace-nowrap ${organizeType === OrganizeType.Maquinista ? 'bg-fgc-grey dark:bg-fgc-green dark:text-fgc-grey text-white shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-white/10'}`}><User size={16} /><span className="truncate">Maquinistes</span></button>
        </div>
      </header>

      <div className="relative overflow-hidden min-h-[600px]">
        {organizeType === OrganizeType.Comparador ? (
          <div key="comparador-view" className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-700 ease-out-expo">
            <div className="flex justify-center"><div className="inline-flex bg-white dark:bg-gray-900 p-1 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 transition-colors">{serveiTypes.map(s => (<button key={s} onClick={() => { setSelectedServei(s); setTurn1Data(null); setTurn2Data(null); setTurn1Id(''); setTurn2Id(''); }} className={`px-6 py-2 rounded-xl text-sm font-black transition-all ${selectedServei === s ? 'bg-fgc-grey dark:bg-fgc-green dark:text-fgc-grey text-white shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'}`}>S-{s}</button>))}</div></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <CompareInputSlot label="Primer Torn" value={turn1Id} onChange={setTurn1Id} data={turn1Data} nowMin={nowMin} getSegments={getSegments} onClear={() => { setTurn1Id(''); setTurn1Data(null); }} selectedServei={selectedServei} isPrivacyMode={isPrivacyMode} />
              <CompareInputSlot label="Segon Torn" value={turn2Id} onChange={setTurn2Id} data={turn2Data} nowMin={nowMin} getSegments={getSegments} onClear={() => { setTurn2Id(''); setTurn2Data(null); }} selectedServei={selectedServei} isPrivacyMode={isPrivacyMode} />
            </div>
            <div className="flex justify-center">
              <button
                onClick={handleCompare}
                disabled={!turn1Id || !turn2Id || loadingComparator}
                className="bg-fgc-green text-fgc-grey w-full sm:w-auto px-12 py-4 sm:py-5 rounded-[24px] sm:rounded-[28px] font-black text-base sm:text-lg shadow-xl shadow-fgc-green/20 hover:scale-[1.02] sm:hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:scale-100 group relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                {loadingComparator ? <Loader2 className="animate-spin" size={24} /> : <RefreshCcw size={20} />}
                COMPARAR
              </button>
            </div>
            {(turn1Data && turn2Data) && (
              <div className="glass-card rounded-[48px] p-8 sm:p-14 border border-gray-100 dark:border-white/5 shadow-sm space-y-16 animate-in zoom-in-95 duration-700 overflow-visible transition-all relative">
                <div className="absolute top-0 right-0 w-96 h-96 bg-fgc-green/5 blur-[120px] -mr-48 -mt-48 pointer-events-none" />
                <SimpleTimeline label="CRONOGRAMA TORN A" turnId={turn1Data.id} segments={turn1Segments} globalMin={gr.min} globalMax={gr.max} />
                <SimpleTimeline label="CRONOGRAMA TORN B" turnId={turn2Data.id} segments={turn2Segments} globalMin={gr.min} globalMax={gr.max} />
                <div className="pt-10 border-t border-dashed border-gray-200 dark:border-white/10 overflow-visible transition-colors">
                  <div className="flex items-center justify-between mb-8"><div className="flex items-center gap-4"><div className="p-3 bg-fgc-green rounded-2xl text-fgc-grey shadow-lg shadow-fgc-green/10"><LayoutGrid size={24} /></div><div><h3 className="text-xl font-black text-fgc-grey dark:text-white tracking-tight">Timeline de Coincidències</h3><p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-0.5">Moments en què coincideixen a la mateixa estació</p></div></div><div className="bg-gray-50 dark:bg-black/20 px-5 py-2 rounded-2xl border border-gray-100 dark:border-white/5 flex items-center gap-3 transition-colors"><span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase">Trobades detectades:</span><span className="text-xl font-black text-fgc-green">{coincidences.length}</span></div></div>
                  <SimpleTimeline label="Mapa visual de trobades" segments={coincidences} colorMode="coincidence" globalMin={gr.min} globalMax={gr.max} />
                  {coincidences.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
                      {coincidences.map((c, i) => (
                        <div key={i} className="glass-interactive glass-card rounded-[32px] p-7 border border-gray-100 dark:border-white/5 flex flex-col gap-6 hover:border-fgc-green/30 relative overflow-hidden group">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-fgc-green/10 -mr-8 -mt-8 rounded-full blur-2xl group-hover:bg-fgc-green/20 transition-all duration-700" />
                          <div className="flex items-center justify-between relative z-10"><div className={`px-5 py-2 rounded-2xl font-black text-sm text-white shadow-lg ${getStatusColor(c.codi)}`}>{c.codi}</div><div className="flex items-center gap-2 bg-fgc-green/10 text-fgc-green px-3 py-1.5 rounded-xl font-black text-xs border border-fgc-green/10"><Clock size={14} />{c.duration} min</div></div>
                          <div className="space-y-1 relative z-10"><p className="text-[10px] font-black text-gray-300 dark:text-gray-600 uppercase tracking-widest ml-1">Franja Horària</p><div className="flex items-center gap-3"><span className="text-2xl font-black text-fgc-grey dark:text-gray-200">{formatFgcTime(c.start)}</span><ArrowRight className="text-fgc-green" size={18} /><span className="text-2xl font-black text-fgc-grey dark:text-gray-200">{formatFgcTime(c.end)}</span></div></div>
                          <div className="h-px bg-gray-100 dark:bg-white/5 w-full transition-colors" />
                          <div className="space-y-4 relative z-10">
                            <div className="flex items-center gap-4"><div className="h-10 min-w-[2.5rem] px-2 rounded-xl bg-fgc-grey dark:bg-black text-white flex items-center justify-center font-black text-xs shadow-md">{getShortTornId(c.turn1)}</div><div className="min-w-0"><p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter leading-none">Maquinista A</p><p className="text-sm font-bold text-fgc-grey dark:text-gray-300 truncate">{c.driver1}</p></div></div>
                            <div className="flex items-center gap-4"><div className="h-10 min-w-[2.5rem] px-2 rounded-xl bg-fgc-grey/10 dark:bg-white/5 text-fgc-grey dark:text-gray-400 flex items-center justify-center font-black text-xs border border-fgc-grey/20 dark:border-white/10 transition-colors">{getShortTornId(c.turn2)}</div><div className="min-w-0"><p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter leading-none">Maquinista B</p><p className="text-sm font-bold text-fgc-grey dark:text-gray-300 truncate">{c.driver2}</p></div></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-gray-50/50 dark:bg-black/20 rounded-[40px] p-20 text-center border-2 border-dashed border-gray-100 dark:border-white/5 mt-6 transition-colors"><div className="w-20 h-20 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm"><Coffee className="text-gray-300 dark:text-gray-600" size={32} /></div><p className="text-gray-400 dark:text-gray-500 font-black uppercase tracking-[0.2em] text-sm">Cap coincidència detectada</p></div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div key="maquinistes-view" className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-700 ease-out-expo">
            <div className="bg-white dark:bg-gray-900 rounded-[40px] p-6 sm:p-10 border border-gray-100 dark:border-white/5 shadow-sm space-y-8 transition-colors">
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={20} />
                  <input
                    type="text"
                    placeholder="Cerca per nom, cognoms o nòmina..."
                    value={maquinistaQuery}
                    onChange={(e) => setMaquinistaQuery(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[24px] py-4 pl-14 pr-8 focus:ring-4 focus:ring-fgc-green/20 outline-none font-black text-lg transition-all dark:text-white dark:placeholder:text-gray-600 shadow-inner"
                  />
                </div>

                <div className="relative" ref={filterRef}>
                  <button
                    onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                    className="h-full flex items-center justify-between gap-3 px-6 py-4 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-[24px] font-black text-sm text-fgc-grey dark:text-gray-200 transition-all hover:bg-gray-100 dark:hover:bg-white/10 min-w-[180px] shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Filter size={16} className="text-fgc-green" />
                      <span>Filtre: {filterLabels[disDesFilter]}</span>
                    </div>
                    <ChevronDown size={18} className={`transition-transform duration-300 ${isFilterMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isFilterMenuOpen && (
                    <div className="absolute top-full right-0 mt-3 w-64 bg-white dark:bg-gray-800 rounded-[24px] shadow-2xl border border-gray-100 dark:border-white/10 py-3 z-[100] animate-in fade-in slide-in-from-top-4 duration-200">
                      {(Object.keys(filterLabels) as DisDesFilterType[]).map((option) => (
                        <button
                          key={option}
                          onClick={() => {
                            setDisDesFilter(option);
                            setIsFilterMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-6 py-4 text-sm font-black transition-colors hover:bg-gray-50 dark:hover:bg-white/5 ${disDesFilter === option ? 'text-fgc-green' : 'text-fgc-grey dark:text-gray-200'
                            }`}
                        >
                          {filterLabels[option]}
                          {disDesFilter === option && <CheckCircle2 size={16} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-6 border-t border-dashed border-gray-100 dark:border-white/10 transition-colors">
                {loadingMaquinistes ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="animate-spin text-fgc-green" size={40} />
                    <p className="font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-[10px]">Recuperant llistat...</p>
                  </div>
                ) : filteredMaquinistes.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredMaquinistes.map((maquinista) => {
                      const phones = phonebook[maquinista.empleat_id] || [];
                      const isDis = maquinista.torn.startsWith('DIS');
                      const isDes = maquinista.torn.startsWith('DES');

                      return (
                        <div
                          key={maquinista.empleat_id}
                          className={`bg-white dark:bg-gray-800 rounded-[28px] p-5 border transition-all flex flex-col h-full gap-4 group hover:shadow-xl ${isDis ? 'border-orange-200 dark:border-orange-500/20 bg-orange-50/10 dark:bg-orange-500/5 hover:border-orange-300' :
                            isDes ? 'border-green-200 dark:border-fgc-green/20 bg-green-50/10 dark:bg-fgc-green/5 hover:border-fgc-green/30' :
                              'border-gray-100 dark:border-white/5 hover:border-fgc-green/30'
                            }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shadow-md shrink-0 ${isDis ? 'bg-orange-500 text-white' :
                              isDes ? 'bg-fgc-green text-fgc-grey' :
                                'bg-fgc-grey dark:bg-black text-white'
                              }`}>
                              {maquinista.cognoms?.charAt(0) || maquinista.nom?.charAt(0)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="text-base font-black text-fgc-grey dark:text-white leading-tight uppercase truncate">{maquinista.cognoms}, {maquinista.nom}</h3>
                                {maquinista.tipus_torn && (
                                  <span className={`px-2 py-0.5 rounded text-[7px] font-black uppercase border shrink-0 ${maquinista.tipus_torn === 'Reducció'
                                    ? 'bg-purple-600 text-white border-purple-700'
                                    : 'bg-blue-600 text-white border-blue-700'
                                    }`}>
                                    {maquinista.tipus_torn === 'Reducció' ? 'RED' : 'TORN'}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">#{maquinista.empleat_id}</span>
                                <div className={`px-2 py-0.5 rounded text-[10px] font-black ${isDis ? 'bg-orange-500 text-white' :
                                  isDes ? 'bg-fgc-green text-fgc-grey' :
                                    'bg-gray-100 dark:bg-black text-gray-400 dark:text-gray-600'
                                  }`}>
                                  {maquinista.torn}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 pt-3 border-t border-gray-100/50 dark:border-white/5 transition-colors">
                            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                              <Clock size={12} className="text-fgc-green" />
                              <span className="text-[11px] font-bold">{maquinista.hora_inici} — {maquinista.hora_fi}</span>
                            </div>
                            {(maquinista.abs_parc_c === 'S' || maquinista.dta === 'S' || maquinista.dpa === 'S') && (
                              <div className="flex gap-2">
                                {maquinista.abs_parc_c === 'S' && <span className="bg-red-50 text-red-600 text-[8px] font-black px-1.5 py-0.5 rounded border border-red-100">ABS</span>}
                                {maquinista.dta === 'S' && <span className="bg-blue-50 text-blue-600 text-[8px] font-black px-1.5 py-0.5 rounded border border-blue-100">DTA</span>}
                                {maquinista.dpa === 'S' && <span className="bg-purple-50 text-purple-600 text-[8px] font-black px-1.5 py-0.5 rounded border border-purple-100">DPA</span>}
                              </div>
                            )}
                            {maquinista.observacions && (
                              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                <Info size={12} className="text-fgc-green" />
                                <span className="text-[11px] font-bold truncate">{maquinista.observacions}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2 mt-auto">
                            {phones.length > 0 ? (
                              phones.map((p, idx) => (
                                <a
                                  key={idx}
                                  href={isPrivacyMode ? undefined : `tel:${p}`}
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all shadow-sm ${isDis ? 'bg-orange-500 text-white hover:bg-orange-600' :
                                    isDes ? 'bg-fgc-green text-fgc-grey hover:brightness-110' :
                                      'bg-fgc-grey dark:bg-black text-white hover:bg-fgc-dark'
                                    } ${isPrivacyMode ? 'cursor-default' : ''}`}
                                >
                                  <Phone size={12} />
                                  {isPrivacyMode ? '*** ** ** **' : p}
                                </a>
                              ))
                            ) : (
                              <span className="text-[10px] font-bold text-gray-300 dark:text-gray-700 italic">Sense telèfons</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-20 text-center space-y-4 opacity-40 transition-colors">
                    <UserCircle size={60} className="mx-auto text-gray-200 dark:text-gray-800" />
                    <p className="font-black text-fgc-grey dark:text-gray-400 uppercase tracking-[0.2em] text-[10px]">No s'ha trobat personal per a la cerca actual</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const CompareInputSlot = ({ label, value, onChange, data, onClear, nowMin, getSegments, selectedServei, isPrivacyMode }: { label: string, value: string, onChange: (v: string) => void, data: any, onClear: () => void, nowMin: number, getSegments: (t: any) => any[], selectedServei: string, isPrivacyMode: boolean }) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSug, setShowSug] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setShowSug(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = async (val: string) => {
    onChange(val);
    if (val.length >= 1) {
      let q = supabase.from('shifts').select('id');
      const isNumeric = /^\d+$/.test(val);

      if (isNumeric && selectedServei !== 'Tots') {
        const prefix = selectedServei === '0' ? '0' : selectedServei.charAt(0);
        const numPart = val.padStart(3, '0');
        const constructedId = `Q${prefix}${numPart}`;
        if (selectedServei !== 'Tots') q = q.eq('servei', selectedServei);
        q = q.ilike('id', `%${constructedId}%`);
      } else {
        if (selectedServei !== 'Tots') q = q.eq('servei', selectedServei);
        q = q.ilike('id', `%${val}%`);
      }

      const { data: s } = await q.limit(5);
      if (s) setSuggestions(s.map(x => x.id as string));
      setShowSug(true);
    } else {
      setSuggestions([]);
      setShowSug(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (suggestions.length > 0) {
        onChange(suggestions[0]);
        setShowSug(false);
      }
    }
  };

  const currentActivity = useMemo(() => data ? getSegments(data).find(s => nowMin >= s.start && nowMin < s.end) : null, [data, getSegments, nowMin]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-[32px] p-5 sm:p-8 border border-gray-100 dark:border-white/5 shadow-sm flex flex-col min-h-[240px] sm:min-h-[400px] transition-all relative" ref={containerRef}>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h3 className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">{label}</h3>
        {data && (
          <button onClick={onClear} className="p-2.5 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 rounded-full transition-colors bg-red-50/10">
            <X size={18} />
          </button>
        )}
      </div>

      {data ? (
        <div className="flex-1 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex items-center gap-5 mb-4 sm:mb-6">
            <div className="h-14 sm:h-16 min-w-[3.5rem] sm:min-w-[4rem] px-3 sm:px-4 bg-fgc-grey dark:bg-black text-white rounded-2xl flex items-center justify-center font-black text-xl sm:text-2xl shadow-xl whitespace-nowrap">
              {data.id}
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-black text-fgc-grey dark:text-white leading-tight truncate">
                {data.drivers[0]?.cognoms}, {data.drivers[0]?.nom}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-2 h-2 bg-fgc-green rounded-full animate-pulse" />
                <p className="text-[10px] font-black text-fgc-green uppercase tracking-widest">
                  Actiu ara {data.drivers[0]?.tipus_torn ? `(${data.drivers[0].tipus_torn})` : ''}
                </p>
              </div>
            </div>
          </div>

          <div className="mb-4 sm:mb-6 bg-gray-50/50 dark:bg-black/20 p-5 sm:p-6 rounded-[28px] border border-gray-100 dark:border-white/5 relative overflow-hidden group transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Clock size={48} />
            </div>
            {currentActivity ? (
              <div className="space-y-2 sm:space-y-3 relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Activitat Actual</span>
                  <span className="text-[9px] font-black text-red-500 animate-pulse uppercase">EN VINCLE</span>
                </div>
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm ${currentActivity.type === 'circ' ? 'bg-fgc-grey dark:bg-black text-white' : 'bg-fgc-green text-fgc-grey'}`}>
                    {currentActivity.type === 'circ' ? <Train size={20} /> : <Coffee size={20} />}
                  </div>
                  <div>
                    <p className="text-lg sm:text-xl font-black text-fgc-grey dark:text-white">{currentActivity.codi}</p>
                    {currentActivity.train && (
                      <div className="flex items-center gap-1.5 text-xs font-bold text-fgc-green">
                        <Hash size={12} /> Unitat: {currentActivity.train}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-sm font-bold text-gray-300 dark:text-gray-700 italic">Fora d'horari</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-gray-50/50 dark:bg-black/20 p-3 sm:p-4 rounded-2xl border border-gray-100 dark:border-white/5 transition-colors">
              <p className="text-[9px] font-black text-gray-300 dark:text-gray-600 uppercase tracking-widest mb-1 sm:mb-1.5 flex items-center gap-2">
                <Clock size={10} /> Torn
              </p>
              <p className="text-[12px] sm:text-sm font-black text-fgc-grey dark:text-gray-200 whitespace-nowrap">
                {data.inici_torn} — {data.final_torn}
              </p>
            </div>
            <div className="bg-gray-50/50 dark:bg-black/20 p-3 sm:p-4 rounded-2xl border border-gray-100 dark:border-white/5 transition-colors">
              <p className="text-[9px] font-black text-gray-300 dark:text-gray-600 uppercase tracking-widest mb-1 sm:mb-1.5 flex items-center gap-2">
                <User size={10} /> Nòmina
              </p>
              <p className="text-[12px] sm:text-sm font-black text-fgc-grey dark:text-gray-200 whitespace-nowrap">
                {data.drivers[0]?.nomina}
              </p>
            </div>
            {data.drivers[0]?.phones?.length > 0 && (
              <div className="col-span-2 bg-fgc-green/10 dark:bg-fgc-green/5 p-3 sm:p-4 rounded-2xl border border-fgc-green/20 dark:border-fgc-green/10 transition-colors">
                <p className="text-[9px] font-black text-fgc-green uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Phone size={10} /> Contacte Directe
                </p>
                <div className="flex flex-wrap gap-2">
                  {data.drivers[0].phones.map((p: string, i: number) => (
                    <a
                      key={i}
                      href={isPrivacyMode ? undefined : `tel:${p}`}
                      className={`flex items-center gap-2 bg-white dark:bg-black px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-black text-fgc-grey dark:text-gray-200 shadow-sm hover:bg-fgc-green dark:hover:text-black transition-all whitespace-nowrap ${isPrivacyMode ? 'cursor-default' : ''}`}
                    >
                      <Phone size={12} /> {isPrivacyMode ? '*** ** ** **' : p}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-2 sm:px-4">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-50 dark:bg-black/20 rounded-full flex items-center justify-center mb-4 sm:mb-6 text-gray-300 dark:text-gray-700 transition-colors">
            <Hash size={30} />
          </div>
          <p className="text-xs sm:text-sm text-gray-400 dark:text-gray-500 mb-6 sm:mb-8 max-w-[240px] font-medium leading-relaxed">
            Cerca un codi de torn.
          </p>
          <div className="w-full relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-600" size={18} />
            <input
              type="text"
              placeholder="Ex: Q002, Q004..."
              value={value}
              onChange={(e) => handleInputChange(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              onFocus={() => value.length > 0 && setShowSug(true)}
              className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[20px] sm:rounded-[24px] py-4 sm:py-5 pl-14 pr-8 focus:ring-4 focus:ring-fgc-green/20 outline-none font-black text-lg transition-all placeholder:text-gray-300 dark:text-white dark:placeholder:text-gray-700 shadow-inner"
            />
            {showSug && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-3 bg-white dark:bg-gray-800 rounded-[24px] shadow-2xl border border-gray-100 dark:border-white/10 z-[100] overflow-hidden overflow-y-auto max-h-56 animate-in slide-in-from-top-2 transition-colors">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      onChange(s);
                      setShowSug(false);
                    }}
                    className="w-full text-left px-8 py-4 text-base font-black text-fgc-grey dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-fgc-green transition-all border-b border-gray-50 dark:border-white/5 last:border-0 flex items-center justify-between group"
                  >
                    {s}
                    <ArrowRight className="opacity-0 group-hover:opacity-100 transition-all scale-110" size={16} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganitzaView;