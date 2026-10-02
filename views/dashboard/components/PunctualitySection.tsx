import React, { useState, useMemo } from 'react';
import { 
  Clock, RefreshCw, AlertTriangle, CheckCircle2, TrendingUp, 
  Train, ChevronRight, ChevronDown, ChevronUp, Filter, Activity, Timer, Search, ArrowUpRight, BarChart3, X
} from 'lucide-react';
import GlassPanel from '../../../components/common/GlassPanel';
import { usePunctualityData, DelayedCirculation } from '../hooks/usePunctualityData';
import { feedback } from '../../../utils/feedback';

const LINE_COLORS: Record<string, string> = {
  'S1': '#E46608',
  'S2': '#80B134',
  'L6': '#7C73B4',
  'L7': '#9D4900',
  'L12': '#C3BDE0',
};

const getRateColor = (rate: number) => {
  if (rate >= 95) return 'text-emerald-500 dark:text-emerald-400';
  if (rate >= 85) return 'text-amber-500 dark:text-amber-400';
  return 'text-red-500 dark:text-red-400';
};

const getRateBg = (rate: number) => {
  if (rate >= 95) return 'bg-emerald-500';
  if (rate >= 85) return 'bg-amber-500';
  return 'bg-red-500';
};

interface PunctualitySectionProps {
  onNavigateToSearch?: (type: string, query: string) => void;
}

export const PunctualitySection: React.FC<PunctualitySectionProps> = ({ onNavigateToSearch }) => {
  const { stats, loading, isRefreshing, lastRefreshLabel, refresh } = usePunctualityData();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [selectedLineFilter, setSelectedLineFilter] = useState<string>('Tots');
  const [selectedHourFilter, setSelectedHourFilter] = useState<number | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');

  const handleRefresh = () => {
    feedback.click();
    refresh();
  };

  const handleCircClick = (circId: string) => {
    if (onNavigateToSearch) {
      feedback.click();
      onNavigateToSearch('circulacio', circId);
    }
  };

  // Filtrar circulacions amb retard
  const filteredDelays = useMemo(() => {
    if (!stats?.recentDelays) return [];

    // 1. Filtre per franja horària seleccionada (si n'hi ha)
    let list = stats.recentDelays;
    if (selectedHourFilter !== null) {
      list = list.filter(circ => circ.hour === selectedHourFilter);
    } else {
      // Si no hi ha franja concreta, desdupliquem per circulacioId per mostrar l'últim pas
      const seen = new Set<string>();
      const dedup: DelayedCirculation[] = [];
      list.forEach(circ => {
        if (!seen.has(circ.circulacioId)) {
          seen.add(circ.circulacioId);
          dedup.push(circ);
        }
      });
      list = dedup;
    }

    // 2. Filtre per línia i text de cerca
    const filtered = list.filter(circ => {
      const matchLine = selectedLineFilter === 'Tots' || circ.linia.toUpperCase() === selectedLineFilter.toUpperCase();
      const matchSearch = !searchFilter.trim() || 
        circ.circulacioId.toUpperCase().includes(searchFilter.toUpperCase().trim()) ||
        (circ.ut && circ.ut.toUpperCase().includes(searchFilter.toUpperCase().trim())) ||
        circ.estacioNom.toUpperCase().includes(searchFilter.toUpperCase().trim());
      return matchLine && matchSearch;
    });

    // 3. Ordenar per major retard primer
    return filtered.sort((a, b) => b.diferenciaSegons - a.diferenciaSegons);
  }, [stats?.recentDelays, selectedHourFilter, selectedLineFilter, searchFilter]);

  if (loading && !stats) {
    return (
      <GlassPanel className="p-6 space-y-4 animate-pulse">
        <div className="flex justify-between items-center">
          <div className="h-6 w-56 bg-gray-200 dark:bg-white/10 rounded-xl" />
          <div className="h-6 w-28 bg-gray-200 dark:bg-white/10 rounded-full" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-gray-200/50 dark:bg-white/5 rounded-2xl" />
          ))}
        </div>
        <div className="h-44 bg-gray-200/40 dark:bg-white/5 rounded-2xl" />
      </GlassPanel>
    );
  }

  if (!stats) return null;

  return (
    <GlassPanel className="p-3.5 sm:p-4 lg:p-3 xl:p-4 flex flex-col gap-2.5 sm:gap-3 animate-fade-up-premium">
      {/* ── Capçalera Secció ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-gray-100 dark:border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-fgc-green/15 text-fgc-green flex items-center justify-center shrink-0">
            <Clock size={16} strokeWidth={2.5} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-[#4D5358] dark:text-white uppercase tracking-wider">
                Puntualitat del Servei (GIP)
              </h2>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-fgc-green/10 text-fgc-green border border-fgc-green/20">
                <span className="w-1.5 h-1.5 rounded-full bg-fgc-green animate-pulse" />
                En directe
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 font-medium">
              Criteri oficial FGC: pas en hora &lt; 4 minuts (≤ 239s de retard)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <span className="text-[10px] sm:text-[11px] text-gray-400 dark:text-gray-500 font-medium">
            Actualitzat {lastRefreshLabel}
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/60 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/10 text-xs font-semibold text-[#4D5358] dark:text-gray-300 hover:bg-fgc-green/10 hover:text-fgc-green transition-all active:scale-95 disabled:opacity-50"
            title="Refrescar puntualitat ara"
          >
            <RefreshCw size={12} className={isRefreshing ? 'animate-spin text-fgc-green' : ''} />
            <span>Actualitzar</span>
          </button>
          <button
            onClick={() => {
              feedback.click();
              setIsExpanded(prev => !prev);
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/60 dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/10 text-xs font-semibold text-[#4D5358] dark:text-gray-300 hover:bg-fgc-green/10 hover:text-fgc-green transition-all active:scale-95"
            title={isExpanded ? 'Plegar detalls de puntualitat' : 'Expandir detalls de puntualitat'}
          >
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span>{isExpanded ? 'Contraure' : 'Expandir'}</span>
          </button>
        </div>
      </div>

      {/* ── KPIs Principals ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* KPI 1: Índex Global */}
        <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white/50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/5 flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Índex Global
            </span>
            <div className={`p-1 rounded-lg ${stats.globalRate >= 95 ? 'bg-emerald-500/10 text-emerald-500' : stats.globalRate >= 85 ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/10 text-red-500'}`}>
              <TrendingUp size={14} />
            </div>
          </div>
          <div className="my-1">
            <div className={`text-2xl sm:text-3xl font-black tabular-nums tracking-tight ${getRateColor(stats.globalRate)}`}>
              {stats.globalRate}%
            </div>
            <div className="w-full bg-gray-100 dark:bg-white/10 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-700 ${getRateBg(stats.globalRate)}`}
                style={{ width: `${Math.min(100, stats.globalRate)}%` }}
              />
            </div>
          </div>
          <div className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 truncate">
            <span className="font-bold text-[#4D5358] dark:text-gray-200">{stats.onTimeCount.toLocaleString('ca-ES')}</span> de {stats.totalPassages.toLocaleString('ca-ES')} passos en hora
          </div>
        </div>

        {/* KPI 2: Passos Totals */}
        <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white/50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/5 flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Passos Registrats
            </span>
            <div className="p-1 rounded-lg bg-blue-500/10 text-blue-500">
              <Activity size={14} />
            </div>
          </div>
          <div className="my-1">
            <div className="text-2xl sm:text-3xl font-black text-[#4D5358] dark:text-white tabular-nums tracking-tight">
              {stats.totalPassages.toLocaleString('ca-ES')}
            </div>
            <div className="text-[11px] sm:text-xs text-blue-600 dark:text-blue-400 font-bold mt-1">
              Validats per GeoTren avui
            </div>
          </div>
          <div className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400">
            Detectats a la xarxa BV07
          </div>
        </div>

        {/* KPI 3: Passos amb Retard */}
        <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white/50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/5 flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Passos amb Retard
            </span>
            <div className={`p-1 rounded-lg ${stats.delayedCount > 0 ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
              <AlertTriangle size={14} />
            </div>
          </div>
          <div className="my-1">
            <div className={`text-2xl sm:text-3xl font-black tabular-nums tracking-tight ${stats.delayedCount > 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500'}`}>
              {stats.delayedCount.toLocaleString('ca-ES')}
            </div>
            <div className="text-[11px] sm:text-xs text-red-600 dark:text-red-400 font-bold mt-1">
              {stats.totalPassages > 0 ? ((stats.delayedCount / stats.totalPassages) * 100).toFixed(1) : 0}% dels passos totals
            </div>
          </div>
          <div className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400">
            Desviació &gt; 239 segons (+4 min)
          </div>
        </div>

        {/* KPI 4: Retard Mitjà */}
        <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white/50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/5 flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Retard Mitjà
            </span>
            <div className="p-1 rounded-lg bg-amber-500/10 text-amber-500">
              <Timer size={14} />
            </div>
          </div>
          <div className="my-1">
            <div className="text-2xl sm:text-3xl font-black text-[#4D5358] dark:text-white tabular-nums tracking-tight">
              {stats.avgDelayFormatted}
            </div>
            <div className="text-[11px] sm:text-xs text-amber-600 dark:text-amber-400 font-bold mt-1">
              Circulacions afectades
            </div>
          </div>
          <div className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400">
            Mitjana de temps acumulat
          </div>
        </div>
      </div>

      {/* ── Botó per expandir/plegar informació detallada ────────────────── */}
      <button
        onClick={() => {
          feedback.click();
          setIsExpanded(prev => !prev);
        }}
        className="w-full py-1.5 flex items-center justify-center gap-1.5 text-xs font-bold text-gray-500 hover:text-fgc-green dark:text-gray-400 dark:hover:text-fgc-green transition-colors border-t border-gray-100 dark:border-white/5 pt-1.5 group cursor-pointer"
      >
        <span>
          {isExpanded
            ? 'Plegar informació detallada'
            : 'Expandir informació detallada (línies, evolució horària i retards)'}
        </span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-300 group-hover:text-fgc-green ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* ── Seccions expandibles ─────────────────────────────── */}
      {isExpanded && (
        <div className="flex flex-col gap-6 pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
          {/* ── Desglossament per Línia Oficial ─────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 size={16} className="text-fgc-green" />
                <h3 className="text-xs sm:text-sm font-bold text-[#4D5358] dark:text-white uppercase tracking-wider">
                  Puntualitat per Línia
                </h3>
              </div>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            Clica sobre una línia per filtrar els retards
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {stats.lineStats.map(line => {
            const isSelected = selectedLineFilter.toUpperCase() === line.linia.toUpperCase();
            const color = LINE_COLORS[line.linia] || '#4D5358';
            return (
              <button
                key={line.linia}
                onClick={() => {
                  feedback.click();
                  setSelectedLineFilter(isSelected ? 'Tots' : line.linia);
                }}
                className={`p-3.5 rounded-2xl text-left border transition-all duration-200 relative overflow-hidden group ${
                  isSelected 
                    ? 'border-fgc-green bg-fgc-green/10 ring-2 ring-fgc-green/40 shadow-md' 
                    : 'border-gray-200/60 dark:border-white/5 bg-white/40 dark:bg-white/[0.02] hover:bg-white/80 dark:hover:bg-white/[0.06] hover:scale-[1.01]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div 
                    className="px-2.5 py-0.5 rounded-lg text-xs font-black text-white shadow-sm"
                    style={{ backgroundColor: color }}
                  >
                    {line.linia}
                  </div>
                  <span className={`text-sm font-black tabular-nums ${getRateColor(line.rate)}`}>
                    {line.rate}%
                  </span>
                </div>

                <div className="w-full bg-gray-100 dark:bg-white/10 h-1.5 rounded-full overflow-hidden mb-2">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${getRateBg(line.rate)}`}
                    style={{ width: `${Math.min(100, line.rate)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                  <span>{line.onTime} / {line.total}</span>
                  {line.delayed > 0 ? (
                    <span className="font-bold text-red-500 dark:text-red-400">
                      +{line.delayed} retards
                    </span>
                  ) : (
                    <span className="font-bold text-emerald-500 dark:text-emerald-400">
                      En hora
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Evolució Horària (Histograma de Franges) ─────────────── */}
      {stats.hourlyStats.length > 0 && (
        <div className="space-y-3 p-4 rounded-2xl bg-white/40 dark:bg-white/[0.02] border border-gray-100 dark:border-white/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <TrendingUp size={16} className="text-fgc-green" />
              <h3 className="text-xs sm:text-sm font-bold text-[#4D5358] dark:text-white uppercase tracking-wider">
                Evolució Horària de la Puntualitat
              </h3>
              <span className="text-[11px] text-gray-400 dark:text-gray-500 font-normal">
                · Clica una hora per veure els retards
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-500">
              {selectedHourFilter !== null && (
                <button
                  type="button"
                  onClick={() => {
                    feedback.click();
                    setSelectedHourFilter(null);
                  }}
                  className="flex items-center gap-1 text-[11px] font-bold text-fgc-green hover:underline cursor-pointer mr-2"
                >
                  <span>Mostrar totes les hores</span>
                  <X size={12} />
                </button>
              )}
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> ≥95%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> 85-94%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" /> &lt;85%
              </span>
            </div>
          </div>

          <div className="pt-4 pb-1">
            <div className="grid grid-flow-col auto-cols-fr gap-2 sm:gap-3 items-end h-32 w-full">
              {stats.hourlyStats.map(item => {
                const barHeight = Math.max(12, Math.round(item.rate));
                const isSelectedHour = selectedHourFilter === item.hour;
                return (
                  <button
                    key={item.hour}
                    type="button"
                    onClick={() => {
                      feedback.click();
                      setSelectedHourFilter(prev => prev === item.hour ? null : item.hour);
                    }}
                    className={`flex flex-col items-center h-full justify-end group relative p-1 rounded-2xl transition-all duration-200 cursor-pointer ${
                      isSelectedHour
                        ? 'bg-fgc-green/15 ring-2 ring-fgc-green shadow-sm scale-[1.03]'
                        : 'hover:bg-white/60 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    {/* Tooltip flotant */}
                    <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none z-30">
                      <div className="bg-gray-900 border border-gray-700 text-white text-[10px] py-1.5 px-2.5 rounded-xl shadow-xl whitespace-nowrap text-center">
                        <div className="font-bold text-fgc-green">{item.label}</div>
                        <div>{item.rate}% en hora</div>
                        <div className="text-gray-400">{item.onTime} de {item.total} passos</div>
                        {item.delayed > 0 && <div className="text-red-400 font-bold">+{item.delayed} retards</div>}
                        <div className="text-[9px] text-gray-300 mt-1 font-semibold">
                          {isSelectedHour ? '✓ Franja seleccionada (clic per desseleccionar)' : '👆 Clic per filtrar retards'}
                        </div>
                      </div>
                    </div>

                    {/* Percentatge sobre la barra */}
                    <span className={`text-[10px] sm:text-[11px] font-bold mb-1 tabular-nums ${
                      isSelectedHour ? 'text-fgc-green font-black scale-105' : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {Math.round(item.rate)}%
                    </span>

                    {/* Barra gràfica */}
                    <div className={`w-full rounded-xl h-20 flex items-end p-1 transition-colors ${
                      isSelectedHour ? 'bg-fgc-green/20' : 'bg-gray-100 dark:bg-white/10'
                    }`}>
                      <div
                        className={`w-full rounded-lg transition-all duration-500 ${getRateBg(item.rate)}`}
                        style={{ height: `${barHeight}%` }}
                      />
                    </div>

                    {/* Etiqueta hora */}
                    <span className={`text-[10px] sm:text-xs font-bold mt-1.5 ${
                      isSelectedHour ? 'text-fgc-green font-black underline' : 'text-[#4D5358] dark:text-gray-300'
                    }`}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Circulacions Actives amb Retard ──────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <AlertTriangle size={16} className="text-amber-500" />
            <h3 className="text-xs sm:text-sm font-bold text-[#4D5358] dark:text-white uppercase tracking-wider">
              Circulacions amb Retard Registrat
            </h3>
            {filteredDelays.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400">
                {filteredDelays.length}
              </span>
            )}
            {selectedHourFilter !== null && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                <Clock size={12} />
                <span>Franja {selectedHourFilter.toString().padStart(2, '0')}:00h - {selectedHourFilter.toString().padStart(2, '0')}:59h</span>
                <button
                  type="button"
                  onClick={() => {
                    feedback.click();
                    setSelectedHourFilter(null);
                  }}
                  className="hover:bg-amber-500/20 rounded-full p-0.5 text-amber-700 dark:text-amber-300 cursor-pointer"
                  title="Treure filtre de franja"
                >
                  <X size={11} />
                </button>
              </span>
            )}
          </div>

          {/* Filtres per línia i cerca */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200/50 dark:border-white/5 text-xs">
              {['Tots', 'S1', 'S2', 'L6', 'L7', 'L12'].map(line => (
                <button
                  key={line}
                  onClick={() => {
                    feedback.click();
                    setSelectedLineFilter(line);
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all text-xs ${
                    selectedLineFilter === line
                      ? 'bg-white dark:bg-white/10 text-[#4D5358] dark:text-white shadow-xs'
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                  }`}
                >
                  {line}
                </button>
              ))}
            </div>

            <div className="relative">
              <input
                type="text"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder="Cercar tren, UT o estació..."
                className="w-36 sm:w-48 pl-7 pr-3 py-1 text-xs rounded-xl bg-white/60 dark:bg-white/5 border border-gray-200/60 dark:border-white/10 text-[#4D5358] dark:text-white placeholder-gray-400 focus:outline-hidden focus:ring-1 focus:ring-fgc-green"
              />
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Llistat de circulacions */}
        {filteredDelays.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
            {filteredDelays.map(circ => {
              const lineColor = LINE_COLORS[circ.linia] || '#4D5358';
              return (
                <div
                  key={`${circ.circulacioId}-${circ.estacioCodi}`}
                  onClick={() => handleCircClick(circ.circulacioId)}
                  className="flex items-center justify-between p-3 rounded-2xl border border-red-200/60 dark:border-red-500/20 bg-red-50/40 dark:bg-red-500/[0.04] hover:bg-red-50/80 dark:hover:bg-red-500/[0.08] transition-all cursor-pointer group shadow-2xs hover:scale-[1.01]"
                  title={`Clic per obrir la circulació ${circ.circulacioId}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div 
                      className="shrink-0 w-8 h-8 rounded-xl text-white font-black text-xs flex items-center justify-center shadow-xs"
                      style={{ backgroundColor: lineColor }}
                    >
                      {circ.linia || 'FGC'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-sm text-[#4D5358] dark:text-white">
                          {circ.circulacioId}
                        </span>
                        {circ.ut && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-gray-500 dark:text-gray-400 bg-white/60 dark:bg-white/10 px-1.5 py-0.5 rounded-md">
                            <Train size={10} />
                            {circ.ut}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        {circ.estacioNom} · {circ.horaTeorica ? `${circ.horaTeorica} → ` : ''}{circ.horaReal}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2 pl-2">
                    <span className="px-2 py-1 rounded-xl text-xs font-black bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 border border-red-200 dark:border-red-500/30 tabular-nums">
                      {circ.delayFormatted}
                    </span>
                    <ArrowUpRight size={14} className="text-gray-300 group-hover:text-fgc-green group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center rounded-2xl bg-white/30 dark:bg-white/[0.01] border border-gray-100 dark:border-white/5">
            <CheckCircle2 size={32} className="text-emerald-500 mb-2 opacity-80" />
            <p className="text-sm font-bold text-[#4D5358] dark:text-white">
              {selectedHourFilter !== null ? `Franja ${selectedHourFilter.toString().padStart(2, '0')}h sense retards` : 'Servei en Hora'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {selectedHourFilter !== null
                ? `No es van registrar retards superiors a 4 minuts durant la franja de les ${selectedHourFilter.toString().padStart(2, '0')}:00h.`
                : selectedLineFilter === 'Tots' 
                  ? 'No hi ha retards detectats o totes les circulacions compleixen el criteri oficial FGC.'
                  : `Cap circulació amb retard registrada a la línia ${selectedLineFilter}.`}
            </p>
          </div>
        )}
      </div>
        </div>
      )}
    </GlassPanel>
  );
};

export default PunctualitySection;
