import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, FileText, Printer, Download, Calendar, TrendingUp, 
  Clock, Train, CheckCircle2, AlertTriangle, Shield, Sparkles,
  ChevronRight, CalendarDays, History
} from 'lucide-react';
import { feedback } from '../utils/feedback';
import { FGC_ICON_BASE64 } from '../utils/fgcLogoBase64';
import { getFgcServiceDate } from '../utils/gipRecorder';
import { getAgentPerformanceHistory } from '../utils/agentPerformanceService';
import { isReserveShift } from '../utils/stations';
import { 
  generateAgentReportPrint, 
  generateAgentReportExcel, 
  generateAgentReportDirectly,
  generateAgentGenericReportPrint, 
  generateAgentGenericReportExcel,
  generateAgentGenericReportDirectly 
} from '../utils/officialReports';
import type { AgentPerformanceHistory } from '../types';

export interface AgentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: any;
  shiftData?: any;
  overallPunctuality?: any;
  circulationsList?: any[];
  historyRecords?: AgentPerformanceHistory[];
  contact?: { phones: string[]; email: string | null };
  isPrivacyMode?: boolean;
  initialDate?: string;
}

export const AgentReportModal: React.FC<AgentReportModalProps> = ({
  isOpen,
  onClose,
  agent,
  shiftData,
  overallPunctuality,
  circulationsList = [],
  historyRecords = [],
  contact,
  isPrivacyMode = false,
  initialDate
}) => {
  const todayDate = useMemo(() => getFgcServiceDate(), []);
  const [reportType, setReportType] = useState<'day' | 'generic'>('day');
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || todayDate);
  const [localHistory, setLocalHistory] = useState<AgentPerformanceHistory[]>(historyRecords);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Escolta tecla Escape per tancar
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Carrega l'historial complet si no s'ha passat com a prop
  useEffect(() => {
    if (!isOpen || !agent?.empleat_id) return;
    if (historyRecords && historyRecords.length > 0) {
      setLocalHistory(historyRecords);
      return;
    }

    let isMounted = true;
    setLoadingHistory(true);
    getAgentPerformanceHistory(String(agent.empleat_id), 100)
      .then(records => {
        if (isMounted) {
          setLocalHistory(records || []);
        }
      })
      .catch(err => {
        console.warn('[AgentReportModal] Error carregant historial:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingHistory(false);
      });

    return () => { isMounted = false; };
  }, [isOpen, agent?.empleat_id, historyRecords]);

  // Si canvia la prop initialDate, actualitzar selectedDate
  useEffect(() => {
    if (initialDate) {
      setSelectedDate(initialDate);
    }
  }, [initialDate]);

  if (!isOpen || !agent) return null;

  // Càlcul de mètriques històriques consolidades
  const historicalSummary = () => {
    if (!localHistory || localHistory.length === 0) {
      return {
        totalShifts: 0,
        totalPassages: 0,
        onTimePassages: 0,
        delayedPassages: 0,
        rate: null,
        totalCircs: 0,
        completedCircs: 0,
        firstDate: 'N/D',
        lastDate: 'N/D'
      };
    }

    const sortedAsc = [...localHistory].sort((a, b) => (a.data_servei || '').localeCompare(b.data_servei || ''));
    const totalShifts = localHistory.length;
    const totalPassages = localHistory.reduce((acc, r) => acc + (r.passos_totals || 0), 0);
    const onTimePassages = localHistory.reduce((acc, r) => acc + (r.passos_en_hora || 0), 0);
    const delayedPassages = localHistory.reduce((acc, r) => acc + (r.passos_retard || 0), 0);

    let rate: number | null = null;
    if (totalPassages > 0) {
      rate = Number(((onTimePassages / totalPassages) * 100).toFixed(1));
    } else {
      const validRates = localHistory
        .map(r => r.puntualitat_percentatge !== null ? Number(r.puntualitat_percentatge) : null)
        .filter((r): r is number => r !== null);
      if (validRates.length > 0) {
        rate = Number((validRates.reduce((a, b) => a + b, 0) / validRates.length).toFixed(1));
      }
    }

    const totalCircs = localHistory.reduce((acc, r) => acc + (r.circulacions_totals || (r.detall_circulacions?.length || 0)), 0);
    const completedCircs = localHistory.reduce((acc, r) => acc + (r.circulacions_completades || 0), 0);

    return {
      totalShifts,
      totalPassages,
      onTimePassages,
      delayedPassages,
      rate,
      totalCircs,
      completedCircs,
      firstDate: sortedAsc[0]?.data_servei || 'N/D',
      lastDate: sortedAsc[sortedAsc.length - 1]?.data_servei || 'N/D'
    };
  };

  const historyKpis = historicalSummary();

  // Comprovar si el dia seleccionat coincideix amb avui o amb un registre arxivat
  const isSelectedDateToday = selectedDate === todayDate;
  const matchedHistoricalRecord = localHistory.find(r => r.data_servei === selectedDate);
  const currentShiftId = agent.torn || shiftData?.id || matchedHistoricalRecord?.torn;
  const isReserve = isReserveShift(currentShiftId || shiftData);
  const effectivePassages = (overallPunctuality?.totalPassages && overallPunctuality.totalPassages > 0)
    ? overallPunctuality.totalPassages
    : (matchedHistoricalRecord?.passos_totals ?? 0);
  const effectiveRate = overallPunctuality?.rate !== null && overallPunctuality?.rate !== undefined
    ? overallPunctuality.rate
    : (matchedHistoricalRecord?.puntualitat_percentatge !== null && matchedHistoricalRecord?.puntualitat_percentatge !== undefined
        ? Number(matchedHistoricalRecord.puntualitat_percentatge)
        : null);

  // Quick dates helpers
  const handleSetToday = () => {
    feedback.click();
    setSelectedDate(todayDate);
  };

  const handleSetYesterday = () => {
    feedback.click();
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  // Gestió de generació d'informe per a un dia en concret
  const handleGenerateDayReport = async (format: 'pdf' | 'excel') => {
    feedback.click();
    setIsGenerating(true);
    try {
      await generateAgentReportDirectly(agent, format, selectedDate, contact, isPrivacyMode);
      onClose();
    } catch (e) {
      console.error('[AgentReportModal] Error generant informe diari:', e);
    } finally {
      setIsGenerating(false);
    }
  };

  // Gestió de generació de dossier genèric
  const handleGenerateGenericReport = async (format: 'pdf' | 'excel') => {
    feedback.click();
    setIsGenerating(true);
    try {
      if (localHistory && localHistory.length > 0) {
        const payload = {
          agent,
          historyRecords: localHistory,
          contact,
          isPrivacyMode
        };
        if (format === 'excel') {
          generateAgentGenericReportExcel(payload);
        } else {
          generateAgentGenericReportPrint(payload);
        }
      } else {
        await generateAgentGenericReportDirectly(agent, format, contact, isPrivacyMode);
      }
      onClose();
    } catch (e) {
      console.error('[AgentReportModal] Error generant dossier genèric:', e);
    } finally {
      setIsGenerating(false);
    }
  };

  const genericRateColor = historyKpis.rate === null 
    ? 'text-gray-400' 
    : historyKpis.rate >= 95 
      ? 'text-emerald-500' 
      : historyKpis.rate >= 85 
        ? 'text-amber-500' 
        : 'text-red-500';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100000] flex items-center justify-center p-2.5 sm:p-4 overflow-hidden"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div
        className="relative z-10 bg-white dark:bg-[#1E2124] border border-gray-100 dark:border-white/10 rounded-[28px] sm:rounded-[32px] shadow-2xl max-w-xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-fgc-green/10 blur-[80px] pointer-events-none -mr-20 -mt-20" />

        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-white/10 flex items-center justify-between shrink-0 relative z-20 bg-white/95 dark:bg-[#1E2124]/95 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <img
              src={FGC_ICON_BASE64}
              alt="FGC"
              className="w-10 h-10 object-contain rounded-xl shadow-sm border border-gray-100 dark:border-white/10"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-fgc-green font-mono">
                  FGC Operacions · CSO
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-gray-100 dark:bg-white/10 text-gray-500">
                  #{agent.empleat_id}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-[#4D5358] dark:text-white uppercase tracking-tight">
                {agent.cognoms}, {agent.nom}
              </h2>
            </div>
          </div>
          <button
            onClick={() => {
              feedback.click();
              onClose();
            }}
            className="w-9 h-9 rounded-2xl flex items-center justify-center bg-gray-100 dark:bg-white/5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors active:scale-95"
            title="Tancar finestra"
            aria-label="Tancar finestra"
          >
            <X size={18} />
          </button>
        </div>

        {/* Segmented Mode Selector: Dia en concret vs Genèric */}
        <div className="p-4 sm:p-6 pb-2 shrink-0 bg-white/50 dark:bg-[#1E2124]/50 border-b border-gray-100/50 dark:border-white/5">
          <div className="grid grid-cols-2 gap-2 p-1.5 bg-gray-100 dark:bg-white/5 rounded-2xl border border-gray-200/50 dark:border-white/10">
            <button
              onClick={() => {
                feedback.click();
                setReportType('day');
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-xs transition-all ${
                reportType === 'day'
                  ? 'bg-white dark:bg-[#25292D] text-[#4D5358] dark:text-white shadow-sm border border-gray-200/60 dark:border-white/10'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <CalendarDays size={16} className={reportType === 'day' ? 'text-fgc-green' : 'text-gray-400'} />
              <span>Dia en concret</span>
            </button>

            <button
              onClick={() => {
                feedback.click();
                setReportType('generic');
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-xs transition-all ${
                reportType === 'generic'
                  ? 'bg-white dark:bg-[#25292D] text-[#4D5358] dark:text-white shadow-sm border border-gray-200/60 dark:border-white/10'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <History size={16} className={reportType === 'generic' ? 'text-fgc-green' : 'text-gray-400'} />
              <span>Genèric (Històric)</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 pt-3 space-y-4 sm:space-y-5 flex-1 overflow-y-auto overscroll-contain relative z-10 custom-scrollbar">
          {reportType === 'day' ? (
            /* ── SECCIÓ: DIA EN CONCRET ── */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#4D5358] dark:text-gray-300 uppercase tracking-wide mb-2">
                  Selecciona la data del servei:
                </label>
                
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleSetToday}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isSelectedDateToday
                        ? 'bg-fgc-green text-[#4D5358] shadow-xs'
                        : 'bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    Avui ({todayDate})
                  </button>

                  <button
                    onClick={handleSetYesterday}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      !isSelectedDateToday && matchedHistoricalRecord?.data_servei === selectedDate
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    Ahir
                  </button>

                  <div className="flex-1 min-w-[170px] relative">
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full px-3.5 py-1.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-xs font-bold text-[#4D5358] dark:text-white focus:outline-none focus:ring-2 focus:ring-fgc-green transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Status Preview Card for Selected Day */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-200/60 dark:border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-fgc-green" />
                    <span className="text-xs font-bold text-[#4D5358] dark:text-white">
                      Servei del dia {selectedDate}
                    </span>
                  </div>
                  {isSelectedDateToday ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-fgc-green/20 text-fgc-green">
                      JORNADA EN CURS
                    </span>
                  ) : matchedHistoricalRecord ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-500">
                      REGISTRE ARXIVAT
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-white/10 text-gray-400">
                      RECERCA DIRECTA
                    </span>
                  )}
                </div>

                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  {isReserve ? (
                    <>
                      <div>
                        Torn assignat: <strong className="text-[#4D5358] dark:text-gray-200">{currentShiftId || 'S/A'}</strong> · Horari: <strong className="text-[#4D5358] dark:text-gray-200">{agent.hora_inici || shiftData?.inici_torn || matchedHistoricalRecord?.hora_inici || '--:--'} — {agent.hora_fi || shiftData?.final_torn || matchedHistoricalRecord?.hora_fi || '--:--'}</strong>
                      </div>
                      <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold">
                        <Shield size={14} className="shrink-0" />
                        <span>Torn de Reserva Operativa a Destacament ({shiftData?.dependencia || agent.dependencia || 'SR'}) · Disponibilitat activa</span>
                      </div>
                    </>
                  ) : isSelectedDateToday ? (
                    <>
                      <div>
                        Torn assignat: <strong className="text-[#4D5358] dark:text-gray-200">{agent.torn || 'S/A'}</strong> · Horari: <strong className="text-[#4D5358] dark:text-gray-200">{agent.hora_inici || shiftData?.inici_torn || '--:--'} — {agent.hora_fi || shiftData?.final_torn || '--:--'}</strong>
                      </div>
                      <div>
                        Puntualitat d'avui: <strong className="text-fgc-green">{effectiveRate !== null && effectiveRate !== undefined ? `${effectiveRate}%` : 'En auditoria'}</strong> ({effectivePassages} passos registrats)
                      </div>
                    </>
                  ) : matchedHistoricalRecord ? (
                    <>
                      <div>
                        Torn registrat: <strong className="text-[#4D5358] dark:text-gray-200">{matchedHistoricalRecord.torn}</strong> · Horari: <strong className="text-[#4D5358] dark:text-gray-200">{matchedHistoricalRecord.hora_inici} — {matchedHistoricalRecord.hora_fi}</strong>
                      </div>
                      <div>
                        Puntualitat aconseguida: <strong className={effectiveRate !== null && effectiveRate >= 95 ? 'text-emerald-500' : 'text-amber-500'}>{effectiveRate !== null ? `${effectiveRate}%` : 'N/D'}</strong> ({effectivePassages} passos)
                      </div>
                    </>
                  ) : (
                    <div>
                      Nexus consultarà directament les circulacions programades d'aquest torn i els registres oficials GIP per a aquesta data.
                    </div>
                  )}
                </div>
              </div>

              {/* Botons d'acció per al dia en concret */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  disabled={isGenerating}
                  onClick={() => handleGenerateDayReport('pdf')}
                  className="flex items-center justify-center gap-2.5 p-3.5 rounded-2xl bg-fgc-green hover:bg-[#86aa12] active:scale-95 text-[#4D5358] font-black text-xs shadow-md shadow-fgc-green/20 transition-all disabled:opacity-50"
                >
                  <Printer size={16} />
                  <span>Imprimir / PDF Oficial (A4)</span>
                </button>

                <button
                  disabled={isGenerating}
                  onClick={() => handleGenerateDayReport('excel')}
                  className="flex items-center justify-center gap-2.5 p-3.5 rounded-2xl bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 active:scale-95 text-[#4D5358] dark:text-white font-bold text-xs border border-gray-200 dark:border-white/10 transition-all disabled:opacity-50"
                >
                  <Download size={16} />
                  <span>Exportar a Excel / CSV</span>
                </button>
              </div>
            </div>
          ) : (
            /* ── SECCIÓ: GENÈRIC (HISTÒRIC CONSOLIDAT) ── */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-200/60 dark:border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-[#4D5358] dark:text-white flex items-center gap-2">
                    <TrendingUp size={15} className="text-fgc-green" />
                    Balanç Històric Acumulat
                  </span>
                  <span className="text-[10px] font-mono font-bold text-gray-400">
                    {historyKpis.totalShifts} jornades auditades
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-[#25292D] border border-gray-100 dark:border-white/5">
                    <div className={`text-lg font-black ${genericRateColor}`}>
                      {historyKpis.rate !== null ? `${historyKpis.rate}%` : '--%'}
                    </div>
                    <div className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">
                      Puntualitat Mitjana
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white dark:bg-[#25292D] border border-gray-100 dark:border-white/5">
                    <div className="text-lg font-black text-[#4D5358] dark:text-white">
                      {historyKpis.totalPassages}
                    </div>
                    <div className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">
                      Passos GIP
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white dark:bg-[#25292D] border border-gray-100 dark:border-white/5">
                    <div className="text-lg font-black text-[#4D5358] dark:text-white">
                      {historyKpis.completedCircs}
                    </div>
                    <div className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">
                      Circulacions
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  Aquest informe consolida totes les jornades de l'agent arxivades a Supabase, amb el desglossament de torns, compliment d'horari i caixes de conformitat oficial CSO.
                </div>
              </div>

              {/* Botons d'acció per al dossier genèric */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  disabled={isGenerating || historyKpis.totalShifts === 0}
                  onClick={() => handleGenerateGenericReport('pdf')}
                  className="flex items-center justify-center gap-2.5 p-3.5 rounded-2xl bg-fgc-green hover:bg-[#86aa12] active:scale-95 text-[#4D5358] font-black text-xs shadow-md shadow-fgc-green/20 transition-all disabled:opacity-50"
                >
                  <Printer size={16} />
                  <span>Imprimir Dossier Genèric (A4)</span>
                </button>

                <button
                  disabled={isGenerating || historyKpis.totalShifts === 0}
                  onClick={() => handleGenerateGenericReport('excel')}
                  className="flex items-center justify-center gap-2.5 p-3.5 rounded-2xl bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 active:scale-95 text-[#4D5358] dark:text-white font-bold text-xs border border-gray-200 dark:border-white/10 transition-all disabled:opacity-50"
                >
                  <Download size={16} />
                  <span>Exportar Historial a Excel</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-gray-50/80 dark:bg-white/[0.02] border-t border-gray-100 dark:border-white/5 flex items-center justify-between text-[11px] text-gray-400 shrink-0 relative z-20">
          <div className="flex items-center gap-1.5 min-w-0">
            <Shield size={13} className="text-fgc-green shrink-0" />
            <span className="truncate">Format oficial A4 i taula Excel conforme a RGPD / LOPDGDD</span>
          </div>
          <button
            onClick={() => {
              feedback.click();
              onClose();
            }}
            className="px-3.5 py-1.5 rounded-xl bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-[#4D5358] dark:text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1 shrink-0 ml-2"
          >
            <X size={13} />
            <span>Tancar</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
