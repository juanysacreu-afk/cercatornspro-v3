import React, { useState } from 'react';
import { 
  AlertTriangle, GitMerge, ArrowRight, Zap, ShieldAlert, 
  ChevronDown, ChevronUp, Clock, Info, CheckCircle2, Train, Sparkles 
} from 'lucide-react';
import { TrunkConflictAlert } from '../types';
import { feedback } from '../utils/feedback';
import GlassPanel from './common/GlassPanel';

interface PredictiveConflictBannerProps {
  conflicts: TrunkConflictAlert[];
  onNavigateToSearch?: (type: string, query: string) => void;
  compact?: boolean;
}

export const PredictiveConflictBanner: React.FC<PredictiveConflictBannerProps> = ({
  conflicts,
  onNavigateToSearch,
  compact = false
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(!compact);

  if (conflicts.length === 0) {
    return null;
  }

  const criticalCount = conflicts.filter(c => c.severity === 'critical').length;
  const warningCount = conflicts.filter(c => c.severity === 'warning').length;

  const handleCircClick = (circId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onNavigateToSearch && circId) {
      feedback.click();
      onNavigateToSearch('circulacio', circId);
    }
  };

  return (
    <GlassPanel className={`overflow-hidden border-l-4 transition-all duration-300 animate-fade-up-premium ${
      criticalCount > 0 
        ? 'border-l-red-500 bg-red-500/[0.03] dark:bg-red-500/[0.05] border-red-200/40 dark:border-red-500/20' 
        : 'border-l-amber-500 bg-amber-500/[0.03] dark:bg-amber-500/[0.05] border-amber-200/40 dark:border-amber-500/20'
    } p-3 sm:p-4 rounded-2xl`}>
      {/* ── Header ── */}
      <div 
        onClick={() => {
          feedback.click();
          setIsExpanded(!isExpanded);
        }}
        className="flex items-center justify-between gap-3 cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            criticalCount > 0 
              ? 'bg-red-500/15 text-red-500 dark:bg-red-500/20 dark:text-red-400' 
              : 'bg-amber-500/15 text-amber-500 dark:bg-amber-500/20 dark:text-amber-400'
          }`}>
            <GitMerge size={17} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-widest text-red-600 dark:text-red-400 flex items-center gap-1">
                <Sparkles size={11} />
                Predicció de Retards i Tronc Comú
              </span>
              <span className={`px-2 py-0.2 rounded-full text-[10px] font-black font-mono ${
                criticalCount > 0
                  ? 'bg-red-500 text-white'
                  : 'bg-amber-500 text-white'
              }`}>
                {conflicts.length} {conflicts.length === 1 ? 'conflicte imminent' : 'conflictes imminents'}
              </span>
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-[#4D5358] dark:text-white">
              {conflicts.length === 1 
                ? conflicts[0].title 
                : `${conflicts[0].title} (+${conflicts.length - 1} més)`}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors"
            title={isExpanded ? 'Plegar detalls' : 'Desplegar detalls'}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* ── Expanded Conflict Cards ── */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-200/50 dark:border-white/5 space-y-2.5">
          {conflicts.map((conflict) => {
            const isCrit = conflict.severity === 'critical';
            return (
              <div 
                key={conflict.id}
                className={`p-3 rounded-xl border transition-all ${
                  isCrit
                    ? 'bg-red-50/70 dark:bg-red-950/20 border-red-200 dark:border-red-500/20'
                    : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-500/20'
                }`}
              >
                {/* Top Row: Title + Badges */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black tracking-wide uppercase ${
                      isCrit 
                        ? 'bg-red-500 text-white' 
                        : 'bg-amber-500 text-white'
                    }`}>
                      {conflict.title}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {conflict.type === 'accordion_trunk' && 'Efecte Acordió · Tronc Comú'}
                      {conflict.type === 'junction_convergence' && 'Convergència de Bifurcació'}
                      {conflict.type === 'terminal_congestion' && 'Saturació Capçalera'}
                    </span>
                  </div>

                  <span className={`self-start sm:self-auto text-[11px] font-black px-2 py-0.5 rounded-md ${
                    isCrit 
                      ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' 
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                  }`}>
                    Impacte estimat: +{Math.round(conflict.estimatedImpactSec / 60)}m
                  </span>
                </div>

                {/* Conflict Actor Pills */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Causant:</span>
                    <button
                      type="button"
                      onClick={(e) => handleCircClick(conflict.leadingCircId, e)}
                      className="font-mono font-black text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
                    >
                      <span>{conflict.leadingCircId}</span>
                      <span className="text-[10px] px-1 py-0.2 rounded bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300">
                        {conflict.leadingLine}
                      </span>
                    </button>
                    <span className="text-[11px] font-mono text-gray-500">
                      (+{Math.round(conflict.leadingDelaySec / 60)}m a {conflict.leadingStation})
                    </span>
                  </div>

                  <ArrowRight size={13} className="text-gray-400 shrink-0" />

                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Afectat:</span>
                    <button
                      type="button"
                      onClick={(e) => handleCircClick(conflict.trailingCircId, e)}
                      className="font-mono font-black text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                    >
                      <span>{conflict.trailingCircId}</span>
                      <span className="text-[10px] px-1 py-0.2 rounded bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300">
                        {conflict.trailingLine}
                      </span>
                    </button>
                    <span className="text-[11px] text-gray-500">
                      a {conflict.trailingStation}
                    </span>
                  </div>
                </div>

                {/* Reason Explanation */}
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                  {conflict.reason}
                </p>

                {/* Operational Recommendation */}
                {conflict.recommendation && (
                  <div className="mt-2 flex items-start gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    <Info size={13} className="shrink-0 mt-0.5 text-blue-400" />
                    <span><strong>Consell Operatiu:</strong> {conflict.recommendation}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
};

export default PredictiveConflictBanner;
