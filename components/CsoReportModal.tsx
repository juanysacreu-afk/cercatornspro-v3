import React, { useState, useEffect } from 'react';
import { X, FileText, Printer, Download, Clock, Train, Shield, Activity, Package, Mail, Loader2 } from 'lucide-react';
import { feedback } from '../utils/feedback';
import { generateGlobalReportPrint, generateGlobalReportExcel } from '../utils/officialReports';
import { FGC_ICON_BASE64 } from '../utils/fgcLogoBase64';
import { BulkReportModal } from './BulkReportModal';
import { useToast } from './ToastProvider';
import { supabase } from '../supabaseClient';

interface CsoReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceDate: string;
  stats?: any;
  kpis?: any;
  alerts?: any[];
  reserves?: any[];
  onExportLegacyCSV?: () => void;
}

export const CsoReportModal: React.FC<CsoReportModalProps> = ({
  isOpen,
  onClose,
  serviceDate,
  stats,
  kpis,
  alerts = [],
  reserves = [],
  onExportLegacyCSV
}) => {
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const { showToast } = useToast();

  const handleSendEmail = async () => {
    feedback.click();
    setIsSendingEmail(true);
    showToast("Enviant informe de tancament a mlopezj@fgc.cat...", "info");
    try {
      const { data, error } = await supabase.functions.invoke('daily-closing-report', {
        body: { targetEmail: 'mlopezj@fgc.cat', serviceDate, manual: true }
      });
      if (error) throw error;
      if (data?.emailSent) {
        feedback.success();
        showToast(data.message || "Correu de tancament enviat correctament!", "success");
      } else if (!data?.hasResendKey) {
        showToast("Mètriques generades. Configura RESEND_API_KEY a Supabase per enviar el correu real.", "info");
      } else {
        showToast(data?.message || "Correu processat pel servidor", "info");
      }
    } catch (err: any) {
      console.error("[CsoReportModal] Error enviant correu:", err);
      let detail = err?.message || '';
      try {
        const body = await err?.context?.json?.();
        if (body?.error) detail = body.error;
      } catch { /* sense cos JSON */ }
      showToast(`Error en connectar amb la funció d'enviament${detail ? `: ${detail}` : ''}`, "error");
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const resolvedStats = stats || {
    totalPassages: 0,
    onTimeCount: 0,
    delayedCount: 0,
    globalRate: 100,
    avgDelayFormatted: '0s',
    lineStats: [],
    recentDelays: []
  };

  const handlePrintPDF = () => {
    feedback.click();
    generateGlobalReportPrint({
      serviceDate,
      stats: resolvedStats,
      kpis,
      alerts,
      reserves
    });
    onClose();
  };

  const handleExportExcel = () => {
    feedback.click();
    generateGlobalReportExcel({
      serviceDate,
      stats: resolvedStats,
      kpis,
      alerts,
      reserves
    });
    onClose();
  };

  const handleLegacyCSV = () => {
    feedback.click();
    if (onExportLegacyCSV) onExportLegacyCSV();
    onClose();
  };

  const globalRate = resolvedStats.globalRate ?? 100;
  const rateColor = globalRate >= 95 ? 'text-emerald-500' : globalRate >= 85 ? 'text-amber-500' : 'text-red-500';

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1E2124] border border-gray-100 dark:border-white/10 rounded-[32px] shadow-2xl max-w-lg w-full overflow-hidden relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow ambient */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-fgc-green/10 blur-[80px] pointer-events-none -mr-20 -mt-20" />

        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-white/10 flex items-center justify-between relative z-10 bg-white/50 dark:bg-[#1E2124]/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <img
              src={FGC_ICON_BASE64}
              alt="FGC"
              className="w-10 h-10 object-contain rounded-xl shadow-xs"
            />
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Centre de Supervisió Operativa (CSO)
              </span>
              <h2 className="text-lg font-black text-[#4D5358] dark:text-white leading-tight uppercase">
                Informe Oficial Diari
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-gray-50 dark:bg-white/5 hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 border border-gray-100 dark:border-white/5 transition-all"
            title="Tancar finestra"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 relative z-10">
          {/* Metadata pill & quick summary */}
          <div className="bg-gray-50/70 dark:bg-black/20 rounded-2xl p-4 border border-gray-100 dark:border-white/5 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <Clock size={13} className="text-fgc-green" />
                Data de servei analitzada:
              </span>
              <span className="px-2.5 py-0.5 rounded-lg bg-fgc-green/15 text-fgc-green font-mono font-black text-xs">
                {serviceDate}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-200/50 dark:border-white/5 text-center">
              <div>
                <div className="text-[10px] uppercase font-bold text-gray-400">Puntualitat</div>
                <div className={`text-base font-black font-mono ${rateColor}`}>{globalRate}%</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-gray-400">Passos GIP</div>
                <div className="text-base font-black font-mono text-[#4D5358] dark:text-white">
                  {resolvedStats.totalPassages}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-gray-400">Flota UT</div>
                <div className="text-base font-black font-mono text-blue-600 dark:text-blue-400">
                  {kpis?.availableTrainUnits || 61}
                </div>
              </div>
            </div>
          </div>

          {/* Action options */}
          <div className="space-y-3">
            <div className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
              Selecciona el format d'exportació
            </div>

            {/* Option 1: PDF Oficial */}
            <button
              onClick={handlePrintPDF}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-fgc-green text-[#4D5358] font-bold text-left shadow-lg shadow-fgc-green/20 hover:scale-[1.02] active:scale-[0.98] transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-white/30 text-[#4D5358]">
                  <Printer size={20} />
                </div>
                <div>
                  <div className="text-sm font-black uppercase">Imprimir / PDF Oficial (A4)</div>
                  <div className="text-xs opacity-80 font-medium">Model corporatiu oficial FGC amb capçalera i signatures</div>
                </div>
              </div>
              <span className="text-xs font-black uppercase px-2 py-1 rounded bg-[#4D5358] text-white shrink-0">
                Obrir PDF
              </span>
            </button>

            {/* Option 2: Excel / CSV */}
            <button
              onClick={handleExportExcel}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-left hover:border-blue-500/50 hover:bg-blue-50/20 dark:hover:bg-blue-500/10 transition-all active:scale-[0.98] group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
                  <Download size={20} />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#4D5358] dark:text-white">Resum Executiu en Excel (.csv)</div>
                  <div className="text-xs text-gray-400 font-medium">Full de càlcul complet amb BOM UTF-8 per a Microsoft Excel</div>
                </div>
              </div>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">
                Descarregar
              </span>
            </button>

            {/* Option 3: Paquet ZIP en Lot */}
            <button
              onClick={() => {
                feedback.click();
                setIsBulkModalOpen(true);
              }}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-left hover:border-purple-500/50 hover:bg-purple-50/20 dark:hover:bg-purple-500/10 transition-all active:scale-[0.98] group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400">
                  <Package size={20} />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#4D5358] dark:text-white flex items-center gap-2">
                    <span>Exportar Tancament en Lot (.ZIP)</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400">0 MB NÚVOL</span>
                  </div>
                  <div className="text-xs text-gray-400 font-medium">Informe CSO + Excel + Informes individuals de tots els maquinistes</div>
                </div>
              </div>
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400 shrink-0">
                Configurar .ZIP
              </span>
            </button>

            {/* Option 4: Enviar per Email a mlopezj@fgc.cat */}
            <button
              disabled={isSendingEmail}
              onClick={handleSendEmail}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-left hover:border-emerald-500/50 hover:bg-emerald-50/20 dark:hover:bg-emerald-500/10 transition-all active:scale-[0.98] group disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  {isSendingEmail ? <Loader2 size={20} className="animate-spin" /> : <Mail size={20} />}
                </div>
                <div>
                  <div className="text-sm font-bold text-[#4D5358] dark:text-white flex items-center gap-2">
                    <span>Enviar Tancament per Email</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">FASE 2</span>
                  </div>
                  <div className="text-xs text-gray-400 font-medium">Destinatari: <strong className="text-[#4D5358] dark:text-gray-200">mlopezj@fgc.cat</strong> amb adjunt Excel</div>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                {isSendingEmail ? 'Enviant...' : 'Enviar Ara'}
              </span>
            </button>

            {/* Option 5: Legacy CSV */}
            {onExportLegacyCSV && (
              <button
                onClick={handleLegacyCSV}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-left text-xs font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                <span>Exportar dades operacionals bàsiques (CSV tradicional)</span>
                <Download size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {isBulkModalOpen && (
        <BulkReportModal
          isOpen={isBulkModalOpen}
          onClose={() => setIsBulkModalOpen(false)}
          defaultDate={serviceDate}
        />
      )}
    </div>
  );
};

export default CsoReportModal;
