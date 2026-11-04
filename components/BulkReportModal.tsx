import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Package, Download, CheckCircle2, Clock, 
  ShieldCheck, Loader2, FileSpreadsheet, FileText, 
  Users, Sparkles, AlertCircle 
} from 'lucide-react';
import { feedback } from '../utils/feedback';
import { FGC_ICON_BASE64 } from '../utils/fgcLogoBase64';
import { getFgcServiceDate } from '../utils/gipRecorder';
import { exportDailyClosureZip } from '../utils/bulkReportExport';

interface BulkReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string;
}

export const BulkReportModal: React.FC<BulkReportModalProps> = ({
  isOpen,
  onClose,
  defaultDate
}) => {
  const getYesterdayDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  const todayDate = getFgcServiceDate();
  const yesterdayDate = getYesterdayDate();

  const [selectedDate, setSelectedDate] = useState<string>(defaultDate || yesterdayDate);
  const [includeGlobalReport, setIncludeGlobalReport] = useState<boolean>(true);
  const [includeGlobalCsv, setIncludeGlobalCsv] = useState<boolean>(true);
  const [includeAgentReports, setIncludeAgentReports] = useState<boolean>(true);
  const [includeAgentSummaryCsv, setIncludeAgentSummaryCsv] = useState<boolean>(true);

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ percent: number; message: string }>({ percent: 0, message: '' });
  const [completedResult, setCompletedResult] = useState<{ totalAgents: number; fileName: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Escolta tecla Escape per tancar
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExporting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExporting, onClose]);

  // Reset estat en obrir
  useEffect(() => {
    if (isOpen) {
      if (defaultDate) setSelectedDate(defaultDate);
      setCompletedResult(null);
      setErrorMsg(null);
      setProgress({ percent: 0, message: '' });
      setIsExporting(false);
    }
  }, [isOpen, defaultDate]);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    feedback.click();
    setIsExporting(true);
    setCompletedResult(null);
    setErrorMsg(null);
    setProgress({ percent: 2, message: 'Iniciant procés de tancament...' });

    try {
      const result = await exportDailyClosureZip({
        serviceDate: selectedDate,
        includeGlobalReport,
        includeGlobalCsv,
        includeAgentReports,
        includeAgentSummaryCsv,
        onProgress: (p) => setProgress(p)
      });

      if (result.success) {
        feedback.success();
        setCompletedResult({
          totalAgents: result.totalAgents,
          fileName: result.fileName
        });
      } else {
        setErrorMsg('No s\'ha pogut generar el paquet ZIP. Revisa la connexió a la base de dades.');
      }
    } catch (err: any) {
      console.error('[BulkReportModal] Error inesperat:', err);
      setErrorMsg(err?.message || 'Error inesperat generant el paquet.');
    } finally {
      setIsExporting(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100001] flex items-center justify-center p-2.5 sm:p-4 overflow-hidden"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
        onClick={() => { if (!isExporting) onClose(); }}
      />

      {/* Modal Card */}
      <div
        className="relative z-10 bg-white dark:bg-[#1E2124] border border-gray-100 dark:border-white/10 rounded-[28px] sm:rounded-[32px] shadow-2xl max-w-lg w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow ambient */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-fgc-green/10 blur-[80px] pointer-events-none -mr-20 -mt-20" />

        {/* Header */}
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
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/15 text-blue-500 font-mono">
                  DESCARREGA EN LOT
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-[#4D5358] dark:text-white uppercase tracking-tight">
                Tancament de Jornada (.ZIP)
              </h2>
            </div>
          </div>
          {!isExporting && (
            <button
              onClick={() => {
                feedback.click();
                onClose();
              }}
              className="w-9 h-9 rounded-2xl flex items-center justify-center bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors active:scale-95"
              title="Tancar finestra"
              aria-label="Tancar finestra"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1 overscroll-contain relative z-10 custom-scrollbar">
          {/* Selector de data */}
          <div>
            <label className="block text-xs font-bold text-[#4D5358] dark:text-gray-300 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Clock size={14} className="text-fgc-green" />
              Selecciona la data de tancament:
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => {
                  feedback.click();
                  setSelectedDate(yesterdayDate);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedDate === yesterdayDate
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
                }`}
              >
                Ahir ({yesterdayDate})
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() => {
                  feedback.click();
                  setSelectedDate(todayDate);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedDate === todayDate
                    ? 'bg-fgc-green text-[#4D5358] shadow-xs'
                    : 'bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
                }`}
              >
                Avui ({todayDate})
              </button>

              <div className="flex-1 min-w-[160px]">
                <input
                  type="date"
                  disabled={isExporting}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-3.5 py-1.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-xs font-bold text-[#4D5358] dark:text-white focus:outline-none focus:ring-2 focus:ring-fgc-green transition-all"
                />
              </div>
            </div>
          </div>

          {/* Contingut del paquet ZIP */}
          <div className="p-4 rounded-2xl bg-gray-50/80 dark:bg-white/5 border border-gray-200/60 dark:border-white/10 space-y-3">
            <div className="text-[10px] font-black uppercase text-gray-400 dark:text-gray-500 tracking-wider">
              Documents a incloure en el fitxer comprimit
            </div>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                disabled={isExporting}
                checked={includeGlobalReport}
                onChange={(e) => setIncludeGlobalReport(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-fgc-green focus:ring-fgc-green border-gray-300"
              />
              <div className="text-xs">
                <span className="font-bold text-[#4D5358] dark:text-gray-200 flex items-center gap-1.5">
                  <FileText size={14} className="text-fgc-green" />
                  Informe Executiu Global CSO (A4 Oficial)
                </span>
                <span className="text-gray-400 text-[11px] block mt-0.5">
                  Resum de la xarxa, ràtio de puntualitat global, avaries i signatures CSO.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                disabled={isExporting}
                checked={includeGlobalCsv}
                onChange={(e) => setIncludeGlobalCsv(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-600 border-gray-300"
              />
              <div className="text-xs">
                <span className="font-bold text-[#4D5358] dark:text-gray-200 flex items-center gap-1.5">
                  <FileSpreadsheet size={14} className="text-blue-500" />
                  Full de dades complet en Excel (.CSV amb BOM UTF-8)
                </span>
                <span className="text-gray-400 text-[11px] block mt-0.5">
                  Tots els passos GIP, línies, retards desglossats i taula d'assignacions.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                disabled={isExporting}
                checked={includeAgentReports}
                onChange={(e) => setIncludeAgentReports(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-fgc-green focus:ring-fgc-green border-gray-300"
              />
              <div className="text-xs">
                <span className="font-bold text-[#4D5358] dark:text-gray-200 flex items-center gap-1.5">
                  <Users size={14} className="text-purple-500" />
                  Dossier individual de cada maquinista (HTML/A4)
                </span>
                <span className="text-gray-400 text-[11px] block mt-0.5">
                  Carpeta amb l'informe oficial de cada agent que ha tingut torn assignat.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                disabled={isExporting}
                checked={includeAgentSummaryCsv}
                onChange={(e) => setIncludeAgentSummaryCsv(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-600 border-gray-300"
              />
              <div className="text-xs">
                <span className="font-bold text-[#4D5358] dark:text-gray-200 flex items-center gap-1.5">
                  <FileSpreadsheet size={14} className="text-emerald-500" />
                  Taula resum de puntualitat de tota la plantilla (.CSV)
                </span>
                <span className="text-gray-400 text-[11px] block mt-0.5">
                  Nòmines, horaris, circulacions realitzades i compliment horari.
                </span>
              </div>
            </label>
          </div>

          {/* Badge de consum 0 MB a Supabase */}
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[11px] leading-relaxed">
            <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong>Consum zero a Supabase (0 MB en Storage):</strong> Tot el paquet es genera de forma efímera en la memòria RAM del navegador i es descarrega directament al teu disc dur.
            </div>
          </div>

          {/* Barra de progrés quan està exportant */}
          {isExporting && (
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-200/60 dark:border-white/10 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[#4D5358] dark:text-white flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-fgc-green" />
                  {progress.message || 'Processant informes...'}
                </span>
                <span className="font-mono text-fgc-green font-black">{progress.percent}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-fgc-green h-2 rounded-full transition-all duration-200 ease-out"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Missatge d'èxit */}
          {completedResult && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 space-y-1 animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-2 font-black text-xs uppercase">
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                Paquet generat i descarregat amb èxit!
              </div>
              <div className="text-[11px] opacity-90 pl-6">
                S'ha descarregat <strong>{completedResult.fileName}</strong> amb els informes de {completedResult.totalAgents} agents a la teva carpeta de Descàrregues.
              </div>
            </div>
          )}

          {/* Missatge d'error */}
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Botó d'acció */}
          <div className="pt-1">
            <button
              disabled={isExporting}
              onClick={handleStartExport}
              className="w-full flex items-center justify-center gap-2.5 p-4 rounded-2xl bg-fgc-green hover:bg-[#86aa12] active:scale-95 text-[#4D5358] font-black text-sm shadow-lg shadow-fgc-green/20 transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {isExporting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Generant Paquet ZIP...</span>
                </>
              ) : (
                <>
                  <Package size={18} />
                  <span>Generar i Descarregar .ZIP ({selectedDate})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-gray-50/80 dark:bg-white/[0.02] border-t border-gray-100 dark:border-white/5 flex items-center justify-between text-[11px] text-gray-400 shrink-0 relative z-20">
          <div className="flex items-center gap-1.5 min-w-0">
            <Sparkles size={13} className="text-fgc-green shrink-0" />
            <span className="truncate">Format segur A4 autònom i UTF-8 BOM compatible amb Excel</span>
          </div>
          {!isExporting && (
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
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default BulkReportModal;
