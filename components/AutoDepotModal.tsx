import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Sparkles,
  Clock,
  Moon,
  Check,
  AlertTriangle,
  RefreshCw,
  Train,
  MapPin,
  ChevronRight,
  Filter,
  Search,
  ShieldCheck,
  Building2,
  Wrench,
  CheckCircle2
} from 'lucide-react';
import {
  DepotId,
  CalculateDepotPlacementsResult,
  UnitCalculatedPlacement,
  calculateFleetDepotPlacements,
  fetchFullCycleCirculationsMap,
  applyAutomatedDepotPlacements,
  OFFICIAL_DEPOT_CONFIGS,
  FetchCyclesDataResult
} from '../utils/unitDepotService';
import type { Assignment } from '../types';

interface AutoDepotModalProps {
  isOpen: boolean;
  onClose: () => void;
  allFleetTrains: string[];
  assignments: Assignment[];
  brokenTrains: Set<string>;
  cleaningTrains: Set<string>;
  imageTrains: Set<string>;
  recordTrains: Set<string>;
  onApplied?: () => Promise<void>;
}

export const AutoDepotModal: React.FC<AutoDepotModalProps> = ({
  isOpen,
  onClose,
  allFleetTrains,
  assignments,
  brokenTrains,
  cleaningTrains,
  imageTrains,
  recordTrains,
  onApplied
}) => {
  const [mode, setMode] = useState<'REAL_TIME' | 'END_OF_SERVICE'>('END_OF_SERVICE');
  const [loading, setLoading] = useState<boolean>(true);
  const [applying, setApplying] = useState<boolean>(false);
  const [selectedDepotFilter, setSelectedDepotFilter] = useState<'ALL' | DepotId>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [calculationResult, setCalculationResult] = useState<CalculateDepotPlacementsResult | null>(null);
  const [cachedData, setCachedData] = useState<FetchCyclesDataResult | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Recalculate placements
  const runCalculation = useCallback(async (forcedMode?: 'REAL_TIME' | 'END_OF_SERVICE', forceRefresh = false) => {
    setLoading(true);
    setFeedbackMsg(null);
    try {
      let data = cachedData;
      if (!data || forceRefresh) {
        data = await fetchFullCycleCirculationsMap();
        setCachedData(data);
      }

      const activeMode = forcedMode || mode;
      const res = calculateFleetDepotPlacements({
        allFleetTrains,
        assignments,
        brokenTrains,
        cleaningTrains,
        imageTrains,
        recordTrains,
        cyclesMap: data.cyclesMap,
        gipUnitToCycleMap: data.gipUnitToCycleMap,
        gipUnitLastCircMap: data.gipUnitLastCircMap,
        mode: activeMode
      });

      setCalculationResult(res);
    } catch (err: any) {
      console.error('Error calculant ubicacions de dipòsit:', err);
      setFeedbackMsg({
        type: 'error',
        text: 'Error en analitzar cicles i circulacions: ' + (err?.message || 'Error desconegut')
      });
    } finally {
      setLoading(false);
    }
  }, [allFleetTrains, assignments, brokenTrains, cleaningTrains, imageTrains, recordTrains, mode, cachedData]);

  // Initial calculation when opened
  useEffect(() => {
    if (isOpen) {
      runCalculation();
    }
  }, [isOpen]);

  // Listen to Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !applying) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, applying, onClose]);

  // Handle Mode Change
  const handleModeChange = (newMode: 'REAL_TIME' | 'END_OF_SERVICE') => {
    setMode(newMode);
    runCalculation(newMode);
  };

  // Handle Apply Placements to Supabase
  const handleApply = async () => {
    if (!calculationResult || calculationResult.parkedUnitsToUpsert.length === 0) {
      setFeedbackMsg({
        type: 'error',
        text: 'No hi ha cap unitat calculada per desar.'
      });
      return;
    }

    setApplying(true);
    setFeedbackMsg(null);
    try {
      const res = await applyAutomatedDepotPlacements(calculationResult.parkedUnitsToUpsert);
      if (res.success) {
        setFeedbackMsg({
          type: 'success',
          text: `S'han assignat i desat correctament ${res.count} unitats als dipòsits oficials!`
        });
        if (onApplied) {
          await onApplied();
        }
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setFeedbackMsg({
          type: 'error',
          text: res.error || 'Error en desar les assignacions a la base de dades.'
        });
      }
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err?.message || 'Excepció durant la persistència.'
      });
    } finally {
      setApplying(false);
    }
  };

  // Filtered unit list for details view
  const filteredPlacements = useMemo(() => {
    if (!calculationResult) return [];
    return calculationResult.placements.filter(p => {
      // Depot filter
      if (selectedDepotFilter !== 'ALL') {
        if (p.depotId !== selectedDepotFilter) return false;
      }

      // Status filter
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'PARKED' && !p.depotId) return false;
        if (statusFilter === 'CIRCULATING' && p.status !== 'CIRCULATING') return false;
        if (statusFilter === 'WAITING' && p.status !== 'WAITING_NEXT') return false;
        if (statusFilter === 'MAINTENANCE' && p.status !== 'MAINTENANCE') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchUnit = p.unitNumber.toLowerCase().includes(q);
        const matchCycle = (p.cycleId || '').toLowerCase().includes(q);
        const matchDepot = (p.depotName || '').toLowerCase().includes(q);
        const matchTrack = (p.trackLabel || '').toLowerCase().includes(q);
        if (!matchUnit && !matchCycle && !matchDepot && !matchTrack) return false;
      }

      return true;
    });
  }, [calculationResult, selectedDepotFilter, statusFilter, searchQuery]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-[#1A1D23] border border-white/10 rounded-[28px] shadow-2xl overflow-hidden text-gray-200"
        onClick={e => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="p-5 sm:p-6 border-b border-white/10 bg-[#222730]/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#97BE14]/20 border border-[#97BE14]/40 flex items-center justify-center text-[#97BE14] shadow-inner">
              <Sparkles size={22} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight uppercase">
                  Auto-Ubicació de Flota a Dipòsits
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#97BE14] text-black">
                  FGC BV
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Càlcul intel·ligent segons codis de cicle, circulacions del servei i retirades de material.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => runCalculation(undefined, true)}
              disabled={loading || applying}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-all disabled:opacity-50"
              title="Recalcular"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin text-[#97BE14]' : ''} />
            </button>
            <button
              onClick={onClose}
              disabled={applying}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-400 hover:text-red-400 transition-all disabled:opacity-50"
              title="Tancar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* MODE SWITCHER & SUMMARY CHIPS */}
        <div className="p-4 sm:p-6 bg-[#16181D] border-b border-white/5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Mode Selector */}
          <div className="flex bg-[#222730] p-1.5 rounded-2xl border border-white/10 max-w-md w-full">
            <button
              onClick={() => handleModeChange('REAL_TIME')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-black transition-all ${
                mode === 'REAL_TIME'
                  ? 'bg-[#97BE14] text-black shadow-md scale-[1.01]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Clock size={14} />
              <span>Hora Actual</span>
            </button>
            <button
              onClick={() => handleModeChange('END_OF_SERVICE')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-black transition-all ${
                mode === 'END_OF_SERVICE'
                  ? 'bg-blue-600 text-white shadow-md scale-[1.01]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Moon size={14} />
              <span>Tancament de Servei</span>
            </button>
          </div>

          {/* KPI Stat Pills */}
          {calculationResult && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-gray-400">Total Flota</span>
                <span className="text-xs font-black text-white">{calculationResult.totalUnits}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-[#97BE14]/10 border border-[#97BE14]/20 flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-[#97BE14]">A Dipòsit</span>
                <span className="text-xs font-black text-[#97BE14]">{calculationResult.parkedCount}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-blue-400">Circulant</span>
                <span className="text-xs font-black text-blue-400">{calculationResult.circulatingCount}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-amber-400">En Espera</span>
                <span className="text-xs font-black text-amber-400">{calculationResult.waitingCount}</span>
              </div>
            </div>
          )}
        </div>

        {/* FEEDBACK BANNER */}
        {feedbackMsg && (
          <div
            className={`px-6 py-3 border-b flex items-center gap-3 text-xs font-bold ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300'
                : 'bg-red-950/50 border-red-500/30 text-red-300'
            }`}
          >
            {feedbackMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* SCROLLABLE MAIN BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-400">
              <RefreshCw size={28} className="animate-spin text-[#97BE14]" />
              <p className="text-xs font-bold uppercase tracking-wider">
                Descodificant cicles i calculant ubicacions...
              </p>
            </div>
          ) : !calculationResult ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              No s'han pogut calcular les posicions dels trens.
            </div>
          ) : (
            <>
              {/* DEPOTS OVERVIEW CARDS (6 DEPOTS) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <Building2 size={14} className="text-[#97BE14]" />
                    <span>Estat d'Ocupació per Dipòsit (Capacitat Total: 71 Vies)</span>
                  </h3>
                  <span className="text-[10px] text-gray-500 font-medium">
                    Fes clic en un dipòsit per filtrar la llista
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  {(Object.keys(OFFICIAL_DEPOT_CONFIGS) as DepotId[]).map(dId => {
                    const data = calculationResult.depotBreakdown[dId];
                    const count = data?.occupiedCount || 0;
                    const cap = data?.capacity || 1;
                    const pct = Math.round((count / cap) * 100);
                    const isSelected = selectedDepotFilter === dId;

                    let barColor = 'bg-[#97BE14]';
                    if (pct > 100) barColor = 'bg-red-500';
                    else if (pct > 80) barColor = 'bg-amber-500';

                    return (
                      <button
                        key={dId}
                        onClick={() => setSelectedDepotFilter(isSelected ? 'ALL' : dId)}
                        className={`p-3.5 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                          isSelected
                            ? 'bg-[#2A313C] border-[#97BE14] shadow-lg shadow-[#97BE14]/10 scale-[1.02]'
                            : 'bg-[#20242C] border-white/5 hover:border-white/20 hover:bg-[#252A34]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-base font-black text-white">{dId}</span>
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                              pct > 100
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : isSelected
                                ? 'bg-[#97BE14] text-black'
                                : 'bg-white/10 text-gray-300'
                            }`}
                          >
                            {count}/{cap}
                          </span>
                        </div>
                        <div className="mt-2 text-[11px] font-bold text-gray-300 truncate">
                          {data?.label || dId}
                        </div>
                        {/* Occupancy Progress */}
                        <div className="mt-2.5 w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full ${barColor} transition-all duration-500`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <div className="mt-1 text-[9px] text-gray-500 font-mono text-right">
                          {pct}% ocupat
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SEARCH & FILTERS BAR */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Cercar unitat (ex. 112.04), cicle..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-[#20242C] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#97BE14]"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'ALL', label: 'Tots els estats' },
                    { id: 'PARKED', label: '🅿️ A dipòsit' },
                    { id: 'CIRCULATING', label: '🟢 Circulant' },
                    { id: 'WAITING', label: '🟡 En espera' },
                    { id: 'MAINTENANCE', label: '🛠️ Taller/IF' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setStatusFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-all ${
                        statusFilter === tab.id
                          ? 'bg-white/20 text-white'
                          : 'bg-white/5 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* DETAILED PLACEMENTS LIST */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-gray-400 px-1">
                  <span>Unitats Filtrades ({filteredPlacements.length})</span>
                  {selectedDepotFilter !== 'ALL' && (
                    <button
                      onClick={() => setSelectedDepotFilter('ALL')}
                      className="text-[11px] text-[#97BE14] hover:underline"
                    >
                      Mostra tots els dipòsits
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {filteredPlacements.map(item => {
                    let statusBg = 'bg-gray-800 text-gray-300 border-gray-700';
                    let statusIcon = <MapPin size={12} />;

                    if (item.status === 'CIRCULATING') {
                      statusBg = 'bg-blue-500/20 text-blue-400 border-blue-500/30';
                      statusIcon = <Train size={12} />;
                    } else if (item.status === 'WAITING_NEXT') {
                      statusBg = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
                      statusIcon = <Clock size={12} />;
                    } else if (item.status === 'MAINTENANCE') {
                      statusBg = 'bg-purple-500/20 text-purple-300 border-purple-500/30';
                      statusIcon = <Wrench size={12} />;
                    } else if (item.depotId) {
                      statusBg = 'bg-[#97BE14]/20 text-[#97BE14] border-[#97BE14]/30';
                      statusIcon = <Check size={12} />;
                    }

                    return (
                      <div
                        key={item.unitNumber}
                        className="p-3 rounded-2xl bg-[#20242C] border border-white/5 hover:border-white/15 transition-all flex flex-col justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-white text-sm bg-black/40 px-2 py-0.5 rounded-lg border border-white/10">
                              {item.unitNumber}
                            </span>
                            {item.cycleId ? (
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                {item.cycleId}
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-500 italic">Sense cicle</span>
                            )}
                          </div>

                          <div
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1.5 ${statusBg}`}
                          >
                            {statusIcon}
                            <span>{item.statusLabel}</span>
                          </div>
                        </div>

                        {/* Destination depot and track */}
                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5">
                          <div className="text-gray-400">
                            {item.depotId ? (
                              <span className="flex items-center gap-1.5 text-gray-200">
                                <span className="font-bold text-[#97BE14]">{item.depotId}</span>
                                <span>·</span>
                                <span className="text-gray-300">{item.trackLabel || `Via ${item.trackId}`}</span>
                              </span>
                            ) : (
                              <span className="text-gray-500 italic">En trajecte / En línia</span>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-500 truncate max-w-[200px]" title={item.reason}>
                            {item.reason}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredPlacements.length === 0 && (
                  <div className="p-12 text-center text-gray-500 text-xs">
                    No s'ha trobat cap unitat amb els filtres seleccionats.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* MODAL FOOTER WITH ACTIONS */}
        <div className="p-4 sm:p-6 bg-[#16181D] border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-gray-400">
            {calculationResult ? (
              <span>
                Es desaran <strong className="text-white">{calculationResult.parkedCount} unitats</strong> a les vies
                dels dipòsits seleccionats.
              </span>
            ) : (
              <span>Carregant ubicacions...</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={applying}
              className="px-5 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 text-xs font-bold transition-all disabled:opacity-50"
            >
              Cancel·lar
            </button>
            <button
              onClick={handleApply}
              disabled={applying || loading || !calculationResult || calculationResult.parkedCount === 0}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#97BE14] hover:bg-[#86aa12] text-black font-black text-xs transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              {applying ? (
                <>
                  <RefreshCw size={15} className="animate-spin text-black" />
                  <span>Desant a Dipòsits...</span>
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  <span>Aplicar i Desar a Dipòsits</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AutoDepotModal;
