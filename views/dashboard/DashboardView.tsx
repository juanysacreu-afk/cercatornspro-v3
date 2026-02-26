import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
    Activity, AlertTriangle, Train, Users, Shield, RefreshCcw,
    Clock, Zap, Gauge, TrendingUp, Radio, MapPin, Info,
    Download, Timer, Maximize2
} from 'lucide-react';
import GlassPanel from '../../components/common/GlassPanel';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { useDashboardData } from './hooks/useDashboardData';
import { feedback } from '../../utils/feedback';
import { useToast } from '../../components/ToastProvider';
import { exportDashboardCSV } from '../../utils/export';

// ── Sub-components (C1 extractions) ────────────────────
import { KpiCard } from './components/KpiCard';
import { AlertRow } from './components/AlertRow';
import { ReserveCard } from './components/ReserveCard';
import { CoverageBarChart } from './components/CoverageBarChart';
import { WeatherWidget } from '../../components/common/WeatherWidget';
import { MonitorView } from './MonitorView';

// ── V1 – Live clock that ticks every second ────────────
const LiveClock: React.FC = () => {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const id = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    const hh = time.getHours().toString().padStart(2, '0');
    const mm = time.getMinutes().toString().padStart(2, '0');
    const ss = time.getSeconds().toString().padStart(2, '0');
    // Pulse the seconds digit
    return (
        <div className="flex items-center gap-1 font-mono text-2xl sm:text-3xl font-black text-[#4D5358] dark:text-white select-none tabular-nums">
            <span>{hh}</span>
            <span className="text-fgc-green animate-pulse">:</span>
            <span>{mm}</span>
            <span className="text-gray-400 dark:text-gray-500 text-lg sm:text-xl">:<span className="transition-all duration-200">{ss}</span></span>
        </div>
    );
};

// ── F2 – Upcoming uncovered shifts widget ──────────────
interface UpcomingAlert {
    id: string;
    title: string;
    subtitle: string;
    startsInMin: number;
    tornId?: string;
}

const UpcomingCoveragePanel: React.FC<{
    upcomingAlerts: UpcomingAlert[];
    onNavigate?: (type: string, query: string) => void;
}> = ({ upcomingAlerts, onNavigate }) => {
    if (upcomingAlerts.length === 0) return null;

    return (
        <GlassPanel className="p-4 sm:p-5 flex flex-col gap-3 border-l-4 border-l-amber-400 animate-in slide-in-from-right-4 duration-500">
            <div className="flex items-center gap-2">
                <Timer size={16} className="text-amber-500" />
                <h2 className="text-sm font-bold text-[#4D5358] dark:text-white uppercase tracking-wider">
                    Pròximes cobertures
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                    {upcomingAlerts.length}
                </span>
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                {upcomingAlerts.map(a => (
                    <div
                        key={a.id}
                        onClick={() => { if (a.tornId && onNavigate) { feedback.click(); onNavigate('torn', a.tornId); } }}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl border border-amber-200/60 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/[0.05] transition-all ${a.tornId ? 'cursor-pointer hover:shadow-md hover:scale-[1.01]' : ''}`}
                    >
                        <div className="shrink-0 flex flex-col items-center justify-center w-10 h-10 rounded-xl bg-amber-400/20 text-amber-600 dark:text-amber-400">
                            <span className="text-xs font-black leading-tight">{Math.round(a.startsInMin)}</span>
                            <span className="text-[8px] font-bold opacity-70">min</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-[#4D5358] dark:text-white truncate">{a.title.replace('SENSE MAQUINISTA', '').trim()}</div>
                            <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{a.subtitle.split('|').slice(1).join('|').trim()}</div>
                        </div>
                    </div>
                ))}
            </div>
        </GlassPanel>
    );
};

// ── F5 – Export moved to utils/export.ts ─────────────────

interface DashboardProps {
    onNavigateToSearch?: (type: string, query: string) => void;
    isMonitorMode?: boolean;
    setIsMonitorMode?: (val: boolean) => void;
}

// ── Main Dashboard ─────────────────────────────────────
const DashboardViewComponent: React.FC<DashboardProps> = ({ onNavigateToSearch, isMonitorMode, setIsMonitorMode }) => {
    const { showToast } = useToast();

    // Wire threshold alerts to the toast system
    const handleThresholdAlert = useCallback((msg: string) => {
        showToast(msg, 'error');
        feedback.deepClick();
    }, [showToast]);

    const {
        loading, kpis, alerts, criticalAlerts, warningAlerts, upcomingAlerts,
        reserves, lineStatuses, lastRefresh, lastRefreshLabel,
        nowMin, serviceToday, refresh, sparklines
    } = useDashboardData(handleThresholdAlert);

    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        feedback.click();
        setIsRefreshing(true);
        await refresh();
        setTimeout(() => setIsRefreshing(false), 600);
    };

    // F5 – export handler (delegates to utils/export.ts)
    const handleExportCSV = useCallback(() => {
        feedback.deepClick();
        exportDashboardCSV(kpis, alerts, reserves);
    }, [kpis, alerts, reserves]);

    const formattedDate = useMemo(() => {
        return new Date().toLocaleDateString('ca-ES', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    }, []);

    if (loading) {
        return (
            <div className="space-y-6 p-4 sm:p-8 animate-in fade-in duration-700">
                <div className="flex items-center gap-4">
                    <div className="h-8 w-48 bg-gray-200 dark:bg-white/10 rounded-2xl animate-pulse" />
                    <div className="h-6 w-24 bg-gray-200 dark:bg-white/10 rounded-full animate-pulse" />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-36 bg-gray-200/40 dark:bg-white/5 rounded-3xl animate-pulse" />
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 h-64 bg-gray-200/40 dark:bg-white/5 rounded-3xl animate-pulse" />
                    <div className="h-64 bg-gray-200/40 dark:bg-white/5 rounded-3xl animate-pulse" />
                </div>
            </div>
        );
    }

    if (isMonitorMode && setIsMonitorMode) {
        return (
            <MonitorView
                kpis={kpis}
                criticalAlerts={criticalAlerts}
                warningAlerts={warningAlerts}
                lastRefreshLabel={lastRefreshLabel}
                onClose={() => setIsMonitorMode(false)}
            />
        );
    }

    return (
        <div className="flex flex-col lg:h-[calc(100vh-110px)] space-y-6 sm:space-y-8 p-4 sm:p-8 animate-in fade-in duration-700">

            {/* Header */}
            <header className="flex-none flex flex-col sm:flex-row sm:items-end justify-between gap-4 animate-fade-up-premium stagger-1">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-[#4D5358] dark:text-white tracking-tight uppercase title-glow flex items-center gap-3">
                        <Zap className="text-fgc-green" size={28} strokeWidth={2.5} />
                        CCO — Supervisió Operativa
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium tracking-tight mt-1 capitalize">
                        Servei {serviceToday.padStart(3, '0')} · {formattedDate}
                    </p>
                    {/* V4 – "Actualitzat fa Xs" */}
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider mt-0.5 flex items-center gap-1.5">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-fgc-green animate-pulse" />
                        Actualitzat {lastRefreshLabel}
                    </p>
                </div>

                {/* V1 – Live clock + actions */}
                <div className="flex flex-col sm:flex-row items-center sm:items-end gap-3 sm:gap-4 w-full sm:w-auto">
                    <div className="flex items-center justify-center sm:justify-between w-full sm:w-auto gap-4">
                        <WeatherWidget />
                        <div className="hidden sm:block">
                            <LiveClock />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 w-full sm:w-auto justify-center sm:justify-end no-scrollbar">
                        {/* F5 – Export button */}
                        <button
                            onClick={handleExportCSV}
                            className="flex-none flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/60 dark:bg-white/[0.04] border border-gray-100 dark:border-white/5 text-xs font-semibold text-[#4D5358] dark:text-gray-300 hover:bg-fgc-green/10 transition-all active:scale-95"
                            title="Exportar resum operacional (CSV)"
                        >
                            <Download size={14} />
                            <span>Exportar</span>
                        </button>
                        {/* N4 - Monitor Mode */}
                        {setIsMonitorMode && (
                            <button
                                onClick={() => setIsMonitorMode(true)}
                                className="flex-none flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/60 dark:bg-white/[0.04] border border-gray-100 dark:border-white/5 text-xs font-semibold text-[#4D5358] dark:text-gray-300 hover:bg-fgc-green/10 transition-all active:scale-95 group"
                                title="Desplegar Monitor CCO"
                            >
                                <Maximize2 size={14} className="group-hover:text-fgc-green transition-colors" />
                                <span>Monitor</span>
                            </button>
                        )}
                        <button
                            onClick={handleRefresh}
                            className="flex-none flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/60 dark:bg-white/[0.04] border border-gray-100 dark:border-white/5 text-xs font-semibold text-[#4D5358] dark:text-gray-300 hover:bg-fgc-green/10 transition-all active:scale-95"
                        >
                            <RefreshCcw size={14} className={`${isRefreshing ? 'animate-spin' : ''}`} />
                            <span>Actualitzar</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* F2 – Upcoming uncovered shifts widget (only shows when relevant) */}
            {upcomingAlerts.length > 0 && (
                <UpcomingCoveragePanel
                    upcomingAlerts={upcomingAlerts as any}
                    onNavigate={onNavigateToSearch}
                />
            )}

            {/* KPI Cards Row */}
            <div className="flex-none grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    label="Servei Cobert"
                    value={`${kpis.serviceCoverage}%`}
                    subtitle={`${kpis.activeTrains} de ${kpis.scheduledTrains} trens actius`}
                    icon={<Gauge size={22} strokeWidth={2.5} />}
                    color={kpis.serviceCoverage > 85 ? '#10B981' : kpis.serviceCoverage > 60 ? '#F59E0B' : '#EF4444'}
                    pulse={kpis.serviceCoverage < 80}
                    progress={kpis.serviceCoverage}
                    sparklineData={sparklines.coverage}
                    infoText="Percentatge de circulacions actives teòriques cobertes en aquest precís instant."
                    className="animate-fade-up-premium stagger-2"
                />
                <KpiCard
                    label="Planificació Diària"
                    value={`${kpis.planningCoverage}%`}
                    subtitle={kpis.assignedPersonnel < kpis.totalPersonnel
                        ? `${kpis.totalPersonnel - kpis.assignedPersonnel} torns sense cobrir`
                        : "Tot el servei planificat"}
                    icon={<Users size={22} strokeWidth={2.5} />}
                    color={kpis.planningCoverage === 100 ? "#6366F1" : "#EF4444"}
                    pulse={kpis.planningCoverage < 100}
                    sparklineData={sparklines.planning}
                    infoText="Indica quants dels torns planificats per avui s'han cobert respecte al total requerit de personal."
                    className="animate-fade-up-premium stagger-3"
                />
                <KpiCard
                    label="Reserves"
                    value={`${kpis.reserveAvailable}/${kpis.reserveTotal}`}
                    subtitle="maquinistes lliures"
                    icon={<Shield size={22} strokeWidth={2.5} />}
                    color="#A8D017"
                    pulse={kpis.reserveAvailable === 0}
                    sparklineData={sparklines.reserve}
                    infoText="Número de maquinistes de recanvi lliures als seus corresponents destacaments."
                    className="animate-fade-up-premium stagger-4"
                />
                <KpiCard
                    label="Flota Operativa"
                    value={kpis.availableTrainUnits}
                    subtitle={`${kpis.brokenTrainUnits} avariats`}
                    icon={<Train size={22} strokeWidth={2.5} />}
                    color="#1B79C9"
                    pulse={kpis.brokenTrainUnits > 3}
                    sparklineData={sparklines.fleet}
                    infoText="Número d'unitats de tren disponibles per al servei, un cop restats els que tenen avaria."
                    className="animate-fade-up-premium stagger-5"
                />
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-5">

                {/* Coverage Bar Chart */}
                <GlassPanel className="lg:col-span-4 p-6 flex flex-col gap-5 animate-fade-up-premium stagger-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Radio size={18} className="text-fgc-green" />
                            <h2 className="text-base font-bold text-[#4D5358] dark:text-white uppercase tracking-wider">Cobertura de Xarxa</h2>
                        </div>
                        <div className="group relative">
                            <Info size={16} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-help" />
                            <div className="pointer-events-none absolute bottom-full -right-2 w-56 mb-2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                                <div className="bg-gray-900 border border-gray-700 text-white text-[11px] p-2.5 rounded-xl shadow-xl">
                                    Gràfic interactiu: passa el cursor sobre les barres per veure els torns actius de cada línia.
                                </div>
                                <div className="w-2 h-2 bg-gray-900 border-b border-r border-gray-700 transform rotate-45 absolute -bottom-1 right-3" />
                            </div>
                        </div>
                    </div>
                    {/* V2 – Interactive chart with tooltips */}
                    <CoverageBarChart lineStatuses={lineStatuses} />
                </GlassPanel>

                {/* Alerts Panel */}
                <GlassPanel className="lg:col-span-5 p-6 flex flex-col overflow-hidden gap-4 animate-fade-up-premium stagger-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <AlertTriangle size={18} className="text-amber-500" />
                            <h2 className="text-base font-bold text-[#4D5358] dark:text-white uppercase tracking-wider">
                                Atenció Requerida
                            </h2>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="group relative">
                                <Info size={16} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-help" />
                                <div className="pointer-events-none absolute bottom-full right-0 w-64 mb-2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                                    <div className="bg-gray-900 border border-gray-700 text-white text-[11px] p-2.5 rounded-xl shadow-xl">
                                        Alertes detectades al sistema. Es reactualitzen en temps real via Supabase Realtime.
                                    </div>
                                    <div className="w-2 h-2 bg-gray-900 border-b border-r border-gray-700 transform rotate-45 absolute -bottom-1 right-3" />
                                </div>
                            </div>
                            {alerts.length > 0 && (
                                <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${criticalAlerts.length > 0
                                    ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                                    }`}>
                                    <Zap size={12} />
                                    {alerts.length}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar space-y-2">
                        {criticalAlerts.map(a => <AlertRow key={a.id} alert={a} onNavigate={onNavigateToSearch} />)}
                        {warningAlerts.map(a => <AlertRow key={a.id} alert={a} onNavigate={onNavigateToSearch} />)}

                        {alerts.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                                <Activity size={32} className="mb-2 opacity-40" />
                                <p className="text-sm font-medium">Tot correcte</p>
                                <p className="text-xs">Cap alerta activa</p>
                            </div>
                        )}
                    </div>
                </GlassPanel>

                {/* Reserves Panel */}
                <GlassPanel className="lg:col-span-3 p-6 flex flex-col overflow-hidden gap-4 animate-fade-up-premium stagger-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <MapPin size={18} className="text-fgc-green" />
                            <h2 className="text-base font-bold text-[#4D5358] dark:text-white uppercase tracking-wider">Reserves</h2>
                        </div>
                        <div className="group relative">
                            <Info size={16} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-help" />
                            <div className="pointer-events-none absolute bottom-full right-0 w-56 mb-2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                                <div className="bg-gray-900 border border-gray-700 text-white text-[11px] p-2.5 rounded-xl shadow-xl">
                                    Clica sobre una estació per veure el detall dels maquinistes de reserva actius i l'historial d'assignacions del dia.
                                </div>
                                <div className="w-2 h-2 bg-gray-900 border-b border-r border-gray-700 transform rotate-45 absolute -bottom-1 right-3" />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar space-y-2">
                        {/* F4 – ReserveCard with expanded history */}
                        {reserves.map(r => <ReserveCard key={r.station} slot={r} />)}
                        {reserves.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                                <Shield size={32} className="mb-2 opacity-40" />
                                <p className="text-sm font-medium">Sense reserves</p>
                                <p className="text-xs">Cap maquinista de reserva actiu</p>
                            </div>
                        )}
                    </div>

                    <div className="flex-none pt-3 border-t border-gray-100 dark:border-white/5">
                        <div className="text-xs text-gray-400 dark:text-gray-500 flex justify-between">
                            <span>Disponibilitat reserves</span>
                            <span className="font-bold text-[#4D5358] dark:text-white">{kpis.reserveAvailable} de {kpis.reserveTotal}</span>
                        </div>
                    </div>
                </GlassPanel>
            </div>
        </div>
    );
};

// ── Wrapped export with ErrorBoundary ──────────────────
const DashboardView: React.FC<DashboardProps> = (props) => (
    <ErrorBoundary sectionName="CCO — Supervisió Operativa">
        <DashboardViewComponent {...props} />
    </ErrorBoundary>
);

export default DashboardView;
