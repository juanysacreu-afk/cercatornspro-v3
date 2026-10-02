import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DailyAssignment, AgentPerformanceHistory } from '../types.ts';
import { Search, Phone, User, Loader2, Clock, CheckCircle2, Info, Filter, UserCircle, ChevronDown, Mail, Users, RefreshCw, X, Activity, ArrowRight, Database } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';
import { feedback } from '../utils/feedback';
import { useServiceToday } from '../utils/useServiceToday';
import { useToast } from '../components/ToastProvider';
import { getDailyPerformanceSummary, syncAllAgentsPerformance } from '../utils/agentPerformanceService';
import ErrorBoundary from '../components/common/ErrorBoundary';
import AgentDetailModal from '../components/AgentDetailModal';

type DisDesFilterType = 'ALL' | 'SERVEI' | 'DIS' | 'DES' | 'DIS_DES' | 'FOR' | 'VAC' | 'DAG' | 'AJN';

const normalizeId = (id: any) => {
  if (!id) return '';
  return String(id).trim().replace(/^0+/, '');
};

const filterLabels: Record<DisDesFilterType, string> = {
  ALL: 'Tots',
  SERVEI: 'SERVEI',
  DIS: 'DIS',
  DES: 'DES',
  DIS_DES: 'DIS + DES',
  FOR: 'FOR',
  VAC: 'VAC',
  DAG: 'DAG',
  AJN: 'AJN'
};

interface AgentsViewProps {
  isPrivacyMode: boolean;
  onNavigateToSearch?: (type: string, query: string) => void;
}

const MemoizedMaquinistaCard = React.memo(({ 
  maquinista, 
  contact, 
  perf,
  isAssigned, 
  isFOR, 
  isDIS, 
  isDES, 
  isPrivacyMode,
  onNavigateToSearch,
  onSelect
}: {
  maquinista: any;
  contact: { phones: string[]; email: string | null };
  perf?: AgentPerformanceHistory;
  isAssigned: boolean;
  isFOR: boolean;
  isDIS: boolean;
  isDES: boolean;
  isPrivacyMode: boolean;
  onNavigateToSearch?: (type: string, query: string) => void;
  onSelect: () => void;
}) => {
  const { phones = [], email } = contact;
  return (
    <div
      onClick={onSelect}
      className={`bg-white dark:bg-gray-800 rounded-[28px] p-5 border transition-all flex flex-col h-full gap-4 group cursor-pointer hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99] duration-300 relative ${
        isAssigned ? 'border-blue-200 dark:border-blue-500/20 bg-blue-50/10 dark:bg-blue-500/5 hover:border-blue-400' :
        isFOR ? 'border-yellow-200 dark:border-yellow-500/20 bg-yellow-50/10 dark:bg-yellow-500/5 hover:border-yellow-400' :
        isDIS ? 'border-orange-200 dark:border-orange-500/20 bg-orange-50/10 dark:bg-orange-500/5 hover:border-orange-400' :
        isDES ? 'border-fgc-green/30 dark:border-fgc-green/20 bg-fgc-green/10 dark:bg-fgc-green/5 hover:border-fgc-green/50' :
        'border-gray-100 dark:border-white/5 hover:border-fgc-green/40'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-xl shadow-md shrink-0 transition-transform group-hover:scale-105 ${
          isAssigned ? 'bg-blue-600 text-white' :
          isFOR ? 'bg-yellow-500 text-white' :
          isDIS ? 'bg-orange-500 text-white' :
          isDES ? 'bg-fgc-green text-[#4D5358]' :
          'bg-fgc-grey dark:bg-black text-white'
        }`}>
          {maquinista.cognoms?.charAt(0) || maquinista.nom?.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-[#4D5358] dark:text-white leading-tight uppercase truncate group-hover:text-fgc-green transition-colors">
              {maquinista.cognoms}, {maquinista.nom}
            </h3>
            {maquinista.tipus_torn && (
              <span className={`px-2 py-0.5 rounded text-[7px] font-bold uppercase border shrink-0 ${
                maquinista.tipus_torn === 'Reducció'
                  ? 'bg-purple-600 text-white border-purple-700'
                  : 'bg-blue-600 text-white border-blue-700'
              }`}>
                {maquinista.tipus_torn === 'Reducció' ? 'RED' : 'TORN'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">#{maquinista.empleat_id}</span>
            <div 
              onClick={(e) => {
                e.stopPropagation();
                if (isAssigned && onNavigateToSearch && maquinista.torn && maquinista.torn !== 'S/A') {
                  feedback.click();
                  onNavigateToSearch('torn', maquinista.torn);
                }
              }}
              title={isAssigned && onNavigateToSearch ? `Veure detall del torn ${maquinista.torn}` : undefined}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                isAssigned ? 'bg-blue-600 text-white cursor-pointer hover:bg-blue-700 hover:scale-105 active:scale-95 shadow-sm' :
                isFOR ? 'bg-yellow-500 text-white' :
                isDIS ? 'bg-orange-500 text-white' :
                isDES ? 'bg-fgc-green text-[#4D5358]' :
                'bg-gray-100 dark:bg-black text-gray-400 dark:text-gray-600'
              }`}
            >
              {maquinista.torn}
            </div>
            {perf && perf.puntualitat_percentatge !== null ? (
              <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-black border shrink-0 ${
                perf.puntualitat_percentatge >= 95 ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800' :
                perf.puntualitat_percentatge >= 85 ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800' :
                'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800'
              }`}>
                {perf.puntualitat_percentatge}% Punt.
              </span>
            ) : isAssigned && perf?.estat_torn === 'NO_INICIAT' ? (
              <span className="px-2 py-0.5 rounded text-[8px] font-mono font-bold text-gray-400 bg-gray-50 border border-gray-200 dark:bg-white/5 dark:text-gray-500 dark:border-white/10 shrink-0">
                --% Punt.
              </span>
            ) : null}
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
            {maquinista.abs_parc_c === 'S' && <span className="bg-red-50 text-red-600 text-[8px] font-bold px-1.5 py-0.5 rounded border border-red-100">ABS</span>}
            {maquinista.dta === 'S' && <span className="bg-blue-50 text-blue-600 text-[8px] font-bold px-1.5 py-0.5 rounded border border-blue-100">DTA</span>}
            {maquinista.dpa === 'S' && <span className="bg-purple-50 text-purple-600 text-[8px] font-bold px-1.5 py-0.5 rounded border border-purple-100">DPA</span>}
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
        {phones.length > 0 || email ? (
          <>
            {phones.map((p: any, idx: number) => (
              <a
                key={`phone-${idx}`}
                href={isPrivacyMode ? undefined : `tel:${p}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isPrivacyMode) e.preventDefault();
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all shadow-sm ${
                  isAssigned ? 'bg-blue-600 text-white hover:bg-blue-700' :
                  isFOR ? 'bg-yellow-500 text-white hover:bg-yellow-600' :
                  isDIS ? 'bg-orange-500 text-white hover:bg-orange-600' :
                  isDES ? 'bg-fgc-green text-[#4D5358] hover:brightness-110' :
                  'bg-fgc-grey dark:bg-black text-white hover:bg-fgc-dark'
                } ${isPrivacyMode ? 'cursor-default' : ''}`}
              >
                <Phone size={12} />
                {isPrivacyMode ? '*** ** ** **' : p}
              </a>
            ))}
            {email && (
              <a
                href={`mailto:${email}`}
                onClick={(e) => e.stopPropagation()}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all shadow-sm ${
                  isAssigned ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-600/20' :
                  isFOR ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20' :
                  isDIS ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/20' :
                  isDES ? 'bg-fgc-green/20 text-green-800 dark:text-fgc-green border border-fgc-green/20' :
                  'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-white/5'
                }`}
                title={email}
              >
                <Mail size={12} />
                {email.length > 20 ? 'Email' : email}
              </a>
            )}
          </>
        ) : (
          <span className="text-[10px] font-bold text-gray-300 dark:text-gray-700 italic">Sense contacte</span>
        )}
      </div>

      {/* Botó indicador de Fitxa i Puntualitat */}
      <div className="pt-2 border-t border-gray-100/60 dark:border-white/5 flex items-center justify-between text-[11px] font-bold text-gray-400 group-hover:text-fgc-green transition-colors">
        <span className="flex items-center gap-1.5">
          <Activity size={12} className="text-fgc-green" />
          Fitxa i puntualitat
        </span>
        <ArrowRight size={13} className="opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
      </div>
    </div>
  );
});

const AgentsViewComponent: React.FC<AgentsViewProps> = ({ isPrivacyMode, onNavigateToSearch }) => {
  const [maquinistaQuery, setMaquinistaQuery] = useState('');
  const [allAssignments, setAllAssignments] = useState<DailyAssignment[]>([]);
  const [allAgents, setAllAgents] = useState<any[]>([]);
  const [contacts, setContacts] = useState<Record<string, { phones: string[], email: string | null }>>({});
  const [dailyPerfMap, setDailyPerfMap] = useState<Record<string, AgentPerformanceHistory>>({});
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);
  const [disDesFilter, setDisDesFilter] = useState<DisDesFilterType>('ALL');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [loadingMaquinistes, setLoadingMaquinistes] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<{ maquinista: any; contact: { phones: string[]; email: string | null } } | null>(null);

  const todayService = useServiceToday();
  const { showToast } = useToast();
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchMaquinistes = async () => {
    setLoadingMaquinistes(true);
    try {
      const [assigRes, contactsRes, perfRes] = await Promise.all([
        supabase.from('daily_assignments').select('*').order('cognoms', { ascending: true }),
        supabase.from('agents').select('nomina, name, surname, phone, email, area').eq('area', 'bv'),
        getDailyPerformanceSummary()
      ]);

      if (assigRes.data) setAllAssignments(assigRes.data);
      if (perfRes) setDailyPerfMap(perfRes);
      if (contactsRes.data) {
        setAllAgents(contactsRes.data);
        const contactMap: Record<string, { phones: string[], email: string | null }> = {};

        contactsRes.data.forEach((a: any) => {
          const nominaStr = String(a.nomina || '').trim();
          if (!nominaStr) return;

          let phones: string[] = [];
          if (a.phone) {
            phones = [String(a.phone)];
          }

          contactMap[normalizeId(nominaStr)] = {
            phones,
            email: a.email || null
          };
        });
        setContacts(contactMap);
      }

      // Sincronització automàtica en segon pla de la puntualitat de tots els agents actius
      if (assigRes.data && assigRes.data.length > 0) {
        syncAllAgentsPerformance(assigRes.data, todayService).then(res => {
          if (res.success && res.perfMap) {
            setDailyPerfMap(prev => ({
              ...prev,
              ...res.perfMap
            }));
          }
        });
      }
    } catch (e) {
      console.error('[AgentsView] Error carregant agents:', e);
    } finally {
      setLoadingMaquinistes(false);
    }
  };

  const handleSyncAllPerformance = async () => {
    setIsSyncingHistory(true);
    feedback.click();
    try {
      const res = await syncAllAgentsPerformance(allAssignments, todayService);
      if (res.success) {
        if (res.perfMap) {
          setDailyPerfMap(prev => ({ ...prev, ...res.perfMap }));
        }
        showToast(`S'ha sincronitzat i desat l'històric de ${res.savedCount} agents a Supabase!`, 'success');
      } else {
        showToast("Error desant l'històric a Supabase.", 'error');
      }
    } catch (err) {
      showToast("Error de connexió en sincronitzar l'històric.", 'error');
    } finally {
      setIsSyncingHistory(false);
    }
  };

  useEffect(() => {
    fetchMaquinistes();
  }, []);

  const filteredMaquinistes = useMemo(() => {
    const bvAgentIds = new Set(allAgents.map(a => normalizeId(a.nomina)));
    let baseList = allAssignments.filter(a => bvAgentIds.has(normalizeId(a.empleat_id)));

    // Si el filtre és 'ALL', afegim els agents que NO estan a daily_assignments
    if (disDesFilter === 'ALL') {
      const assignedIds = new Set(allAssignments.map(a => normalizeId(a.empleat_id)));
      const unassignedAgents = allAgents
        .filter(agent => !assignedIds.has(normalizeId(agent.nomina)))
        .map(agent => ({
          id: -1 * parseInt(agent.nomina || '0', 10),
          empleat_id: agent.nomina,
          nom: agent.name || '',
          cognoms: agent.surname || '',
          torn: 'S/A',
          hora_inici: '--:--',
          hora_fi: '--:--',
          tipus_torn: '',
          observacions: '',
          is_unassigned: true,
          created_at: new Date().toISOString(),
          rango_horario_extra: ''
        }));
      baseList = [...baseList, ...unassignedAgents];
    }

    return baseList.filter(maquinista => {
      const searchStr = maquinistaQuery.toLowerCase().trim();
      const queryMatch = !searchStr ||
        (maquinista.nom || '').toLowerCase().includes(searchStr) ||
        (maquinista.cognoms || '').toLowerCase().includes(searchStr) ||
        (maquinista.empleat_id || '').includes(searchStr) ||
        (maquinista.torn || '').toLowerCase().includes(searchStr);

      if (!queryMatch) return false;
      if (disDesFilter === 'ALL') return true;
      if (disDesFilter === 'DIS') return maquinista.torn.startsWith('DIS');
      if (disDesFilter === 'DES') return maquinista.torn.startsWith('DES');
      if (disDesFilter === 'DIS_DES') return maquinista.torn.startsWith('DIS') || maquinista.torn.startsWith('DES');
      if (disDesFilter === 'FOR') return maquinista.torn.startsWith('FOR');
      if (disDesFilter === 'VAC') return maquinista.torn.startsWith('VAC');
      if (disDesFilter === 'DAG') return maquinista.torn.startsWith('DAG');
      if (disDesFilter === 'AJN') return maquinista.torn.startsWith('AJN');

      if (disDesFilter === 'SERVEI') {
        return !maquinista.torn.startsWith('FOR') &&
          !maquinista.torn.startsWith('DIS') &&
          !maquinista.torn.startsWith('DES') &&
          !['VAC', 'DAG', 'ABS', 'LLIB'].some(p => maquinista.torn.startsWith(p)) &&
          maquinista.torn !== 'S/A';
      }

      return true;
    }).sort((a, b) => (a.cognoms || '').localeCompare(b.cognoms || ''));
  }, [allAssignments, allAgents, maquinistaQuery, disDesFilter]);

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-8 animate-in fade-in duration-700 max-w-7xl mx-auto w-full">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#4D5358] dark:text-white tracking-tight title-glow uppercase flex items-center gap-3">
            <Users className="text-fgc-green" size={28} strokeWidth={2.5} />
            Agents
          </h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 font-medium">
            Llistat, cerca i contacte directe del personal de conducció.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            onClick={handleSyncAllPerformance}
            disabled={isSyncingHistory || loadingMaquinistes}
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-fgc-green/10 hover:bg-fgc-green/20 border border-fgc-green/30 text-xs font-bold text-fgc-green dark:text-fgc-green transition-all active:scale-95 disabled:opacity-50"
            title="Sincronitza i actualitza el rendiment i puntualitat de tots els maquinistes d'avui a Supabase"
          >
            <Database size={14} className={isSyncingHistory ? 'animate-spin' : ''} />
            <span>{isSyncingHistory ? 'Sincronitzant...' : 'Sincronitzar històric'}</span>
          </button>
          <div className="px-3 py-1.5 rounded-xl bg-white/60 dark:bg-white/[0.04] border border-gray-100 dark:border-white/5 text-xs font-bold text-gray-500 dark:text-gray-400">
            {filteredMaquinistes.length} agents
          </div>
          <button
            onClick={() => {
              feedback.click();
              fetchMaquinistes();
            }}
            disabled={loadingMaquinistes}
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/60 dark:bg-white/[0.04] border border-gray-100 dark:border-white/5 text-xs font-semibold text-[#4D5358] dark:text-gray-300 hover:bg-fgc-green/10 transition-all active:scale-95 disabled:opacity-50"
            title="Refrescar llistat d'agents"
          >
            <RefreshCw size={14} className={loadingMaquinistes ? 'animate-spin text-fgc-green' : ''} />
            <span className="hidden sm:inline">Actualitzar</span>
          </button>
        </div>
      </header>

      <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-700 ease-out-expo">
        <div className="bg-white dark:bg-fgc-grey rounded-[40px] p-6 sm:p-10 border border-gray-100 dark:border-white/5 shadow-sm space-y-8 transition-colors">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={20} />
              <input
                type="text"
                placeholder="Cerca per nom, cognoms o nòmina..."
                value={maquinistaQuery}
                onChange={(e) => setMaquinistaQuery(e.target.value)}
                className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[24px] py-4 pl-14 pr-12 focus:ring-4 focus:ring-fgc-green/20 outline-none font-bold text-lg transition-all dark:text-white dark:placeholder:text-gray-600 shadow-inner"
              />
              {maquinistaQuery && (
                <button
                  onClick={() => setMaquinistaQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                className="h-full flex items-center justify-between gap-3 px-6 py-4 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-[24px] font-bold text-sm text-[#4D5358] dark:text-gray-200 transition-all hover:bg-gray-100 dark:hover:bg-white/10 min-w-[180px] shadow-sm"
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
                      className={`w-full flex items-center justify-between px-6 py-4 text-sm font-bold transition-colors hover:bg-gray-50 dark:hover:bg-white/5 ${
                        disDesFilter === option ? 'text-fgc-green' : 'text-[#4D5358] dark:text-gray-200'
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
                <p className="font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest text-[10px]">Recuperant llistat...</p>
              </div>
            ) : filteredMaquinistes.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMaquinistes.map((maquinista) => {
                  const contact = contacts[normalizeId(maquinista.empleat_id)] || { phones: [], email: null };
                  const isFOR = maquinista.torn.startsWith('FOR');
                  const isDIS = maquinista.torn.startsWith('DIS');
                  const isDES = maquinista.torn.startsWith('DES');
                  const isAssigned = !isFOR && !isDIS && !isDES && !['VAC', 'DAG', 'ABS', 'LLIB', 'AJN', 'S/N', 'S/A'].some((p: string) => maquinista.torn.startsWith(p));

                  const empId = normalizeId(maquinista.empleat_id);
                  const perf = dailyPerfMap[empId] || dailyPerfMap[String(maquinista.empleat_id || '').trim()];

                  return (
                    <MemoizedMaquinistaCard
                      key={maquinista.empleat_id}
                      maquinista={maquinista}
                      contact={contact}
                      perf={perf}
                      isAssigned={isAssigned}
                      isFOR={isFOR}
                      isDIS={isDIS}
                      isDES={isDES}
                      isPrivacyMode={isPrivacyMode}
                      onNavigateToSearch={onNavigateToSearch}
                      onSelect={() => {
                        feedback.click();
                        setSelectedAgent({ maquinista, contact });
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="py-20 text-center space-y-4 opacity-40 transition-colors">
                <UserCircle size={60} className="mx-auto text-gray-200 dark:text-gray-800" />
                <p className="font-bold text-[#4D5358] dark:text-gray-400 uppercase tracking-[0.2em] text-[10px]">No s'ha trobat personal per a la cerca actual</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL DETALL DASHBOARD DE L'AGENT */}
      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent.maquinista}
          contact={selectedAgent.contact}
          isPrivacyMode={isPrivacyMode}
          onClose={async () => {
            setSelectedAgent(null);
            const updated = await getDailyPerformanceSummary();
            setDailyPerfMap(updated);
          }}
          onNavigateToSearch={onNavigateToSearch}
        />
      )}
    </div>
  );
};

export const AgentsView: React.FC<AgentsViewProps> = (props) => (
  <ErrorBoundary sectionName="Agents">
    <AgentsViewComponent {...props} />
  </ErrorBoundary>
);

export default AgentsView;
