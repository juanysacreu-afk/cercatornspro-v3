import React, { useState, useMemo } from 'react';
import {
    Activity, AlertTriangle, Train, Users, Shield, RefreshCcw,
    Clock, ChevronRight, Zap, Eye, Gauge, TrendingUp, Radio, MapPin, Info
} from 'lucide-react';
import GlassPanel from '../../components/common/GlassPanel';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { useDashboardData, type PersonnelAlert, type ReserveSlot, type LineStatus } from './hooks/useDashboardData';
import { feedback } from '../../utils/feedback';

// ── Sub-Components ─────────────────────────────────────

const KpiCard: React.FC<{
    label: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactNode;
    color: string;
    pulse?: boolean;
    trend?: 'up' | 'down' | 'neutral';
    infoText?: string;
    progress?: number;
}> = ({ label, value, subtitle, icon, color, pulse, trend, infoText, progress }) => (
    <div className={`relative rounded-3xl p-5 sm:p-6 transition-all duration-500 hover:scale-[1.02] hover:shadow-xl
        bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/5
        shadow-[0_4px_24px_0_rgba(31,38,135,0.06)] dark:shadow-[0_4px_24px_0_rgba(0,0,0,0.25)] flex flex-col justify-between`}
    >
        {/* Accent Glow */}
        <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
            <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-3xl opacity-20" style={{ backgroundColor: color }} />
        </div>

        <div className="relative z-10 flex items-start justify-between mb-3">
            <div className={`p-2.5 rounded-2xl`} style={{ backgroundColor: color + '18' }}>
                <span style={{ color }}>{icon}</span>
            </div>

            <div className="flex items-center gap-2">
                {pulse && (
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                    </span>
                )}
                {trend && trend !== 'neutral' && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${trend === 'up' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'}`}>
                        {trend === 'up' ? '↑' : '↓'}
                    </span>
                )}
                {infoText && (
                    <div className="group relative">
                        <Info size={16} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-help" />
                        <div className="pointer-events-none absolute bottom-full -right-2 w-48 mb-2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                            <div className="bg-gray-900 border border-gray-700 text-white text-[11px] p-2 rounded-xl shadow-xl">
                                {infoText}
                            </div>
                            <div className="w-2 h-2 bg-gray-900 border-b border-r border-gray-700 transform rotate-45 absolute -bottom-1 right-3"></div>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {progress !== undefined ? (
            <div className="relative z-10 flex flex-col justify-end mt-1 sm:mt-2 mb-0.5">
                <div className="flex flex-col 2xl:flex-row items-start 2xl:items-center gap-3 sm:gap-4">
                    <div className="relative w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] 2xl:w-[96px] 2xl:h-[96px] shrink-0">
                        <svg className="w-full h-full transform -rotate-90 drop-shadow-sm" viewBox="0 0 36 36">
                            <path
                                className="text-black/5 dark:text-white/5"
                                strokeWidth="3"
                                stroke="currentColor"
                                fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                            <path
                                strokeDasharray={`${progress}, 100`}
                                strokeWidth="3"
                                strokeLinecap="round"
                                stroke={color}
                                fill="none"
                                className="transition-all duration-1000 ease-out"
                                style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.15))' }}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-xl sm:text-2xl 2xl:text-[28px] font-black leading-none tracking-tighter translate-y-[2px]" style={{ color }}>
                                {progress}<span className="text-[10px] sm:text-sm 2xl:text-base tracking-normal font-bold opacity-70 ml-[2px]">%</span>
                            </span>
                        </div>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm sm:text-base 2xl:text-lg font-bold text-[#4D5358] dark:text-white leading-tight uppercase tracking-wide">{label}</div>
                        {subtitle && <div className="text-[11px] sm:text-xs 2xl:text-sm font-medium text-gray-500 dark:text-gray-400 mt-1 leading-snug">{subtitle}</div>}
                    </div>
                </div>
            </div>
        ) : (
            <div className="relative z-10">
                <div className="text-3xl sm:text-4xl font-black tracking-tight text-[#4D5358] dark:text-white mt-1">{value}</div>
                <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mt-1">{label}</div>
                {subtitle && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</div>}
            </div>
        )}
    </div>
);

const AlertRow: React.FC<{ alert: PersonnelAlert }> = ({ alert }) => {
    const severityStyles = {
        critical: 'border-l-red-500 bg-red-50/60 dark:bg-red-500/[0.06]',
        warning: 'border-l-amber-500 bg-amber-50/60 dark:bg-amber-500/[0.06]',
        info: 'border-l-blue-500 bg-blue-50/60 dark:bg-blue-500/[0.06]'
    };
    const severityIcons = {
        critical: <AlertTriangle size={16} className="text-red-500" />,
        warning: <Clock size={16} className="text-amber-500" />,
        info: <Eye size={16} className="text-blue-500" />
    };
    return (
        <div className={`flex items-center gap-3 p-3.5 rounded-2xl border-l-4 transition-all hover:shadow-md ${severityStyles[alert.severity]}`}>
            <div className="shrink-0">{severityIcons[alert.severity]}</div>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[#4D5358] dark:text-white truncate">{alert.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{alert.subtitle}</div>
            </div>
            <ChevronRight size={14} className="text-gray-300 shrink-0" />
        </div>
    );
};

const ReserveCard: React.FC<{ slot: ReserveSlot }> = ({ slot }) => {
    const stationColors: Record<string, string> = {
        'PC': '#1B79C9', 'SR': '#9C56B4', 'RB': '#E85D8A', 'RE': '#9C56B4',
        'NA': '#F97316', 'PN': '#A8D017'
    };
    const color = stationColors[slot.station] || '#6B7280';
    return (
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/60 dark:bg-white/[0.03] border border-white/20 dark:border-white/5 transition-all hover:shadow-md">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ backgroundColor: color }}>
                {slot.station}
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[#4D5358] dark:text-white">{slot.stationLabel}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {slot.personnel.map(p => `${p.cognoms}`).join(', ')}
                </div>
            </div>
            <div className="shrink-0">
                <span className="text-lg font-black text-[#4D5358] dark:text-white">{slot.count}</span>
            </div>
        </div>
    );
};

const CoverageBarChart: React.FC<{ lineStatuses: any[] }> = ({ lineStatuses }) => {
    // Definir el orden explícito de las líneas requerido (L6, L7, L12, S1, S2)
    const order = ['L6', 'L7', 'L12', 'S1', 'S2'];
    const DEFAULT_COLORS: Record<string, string> = {
        'L6': '#7C73B4', 'L7': '#9D4900', 'L12': '#C3BDE0', 'S1': '#E46608', 'S2': '#80B134'
    };

    // Forzamos a que aparezcan siempre las líneas solicitadas, incluso si el hook
    // no detecta circulaciones activas y las filtra temporalmente.
    const sortedLines = order.map(linia => {
        const found = lineStatuses.find(ls => ls.linia.toUpperCase() === linia.toUpperCase());
        return found || {
            linia,
            color: DEFAULT_COLORS[linia] || '#4D5358',
            activeCirculations: 0,
            totalCirculations: 0,
            coveragePercent: 0
        };
    });

    const maxActive = Math.max(15, ...sortedLines.map(l => l.activeCirculations));

    return (
        <div className="flex items-end justify-between h-[180px] pt-4 pb-2 px-1 sm:px-2 w-full mt-2">
            {sortedLines.map(line => {
                // Height based on active trains mapping to a max ceiling of ~15-30, avoiding 1% heights
                const p = line.activeCirculations > 0 ? Math.min(100, Math.round((line.activeCirculations / maxActive) * 100)) : 0;
                return (
                    <div key={line.linia} className="flex flex-col items-center gap-2 group w-10 sm:w-14">
                        <span className="text-[10px] sm:text-xs font-bold text-gray-400 dark:text-gray-500 tabular-nums text-center leading-tight transition-all duration-300 group-hover:text-[#4D5358] dark:group-hover:text-white group-hover:scale-110">
                            {line.totalCirculations > 0 ? line.activeCirculations : '-'}<br /><span className="opacity-50">/ {line.totalCirculations > 0 ? line.totalCirculations : '-'}</span>
                        </span>
                        <div className="relative w-8 sm:w-10 h-28 bg-gray-100 dark:bg-white/5 rounded-t-xl overflow-hidden shadow-inner flex items-end">
                            <div
                                className="w-full rounded-t-xl transition-all duration-1000 ease-out flex items-start justify-center pt-2 relative overflow-hidden"
                                style={{
                                    height: p > 0 ? `${Math.max(8, p)}%` : '4px', // minimum 8% if there are any trains to show a visible bar
                                    backgroundColor: line.color,
                                    opacity: p > 0 ? 1 : 0.3
                                }}
                            >
                                <div className="absolute top-0 left-0 w-full h-1/4 bg-white/20" />
                            </div>
                        </div>
                        <div
                            className="w-8 sm:w-10 h-6 sm:h-7 rounded-lg flex items-center justify-center text-white font-black text-[10px] sm:text-[11px] shadow-sm transition-transform duration-300 group-hover:-translate-y-1"
                            style={{ backgroundColor: line.color, opacity: p > 0 ? 1 : 0.5 }}
                        >
                            {line.linia}
                        </div>
                    </div>
                )
            })}
        </div>
    );
};

// ── Main Dashboard ─────────────────────────────────────
const DashboardViewComponent: React.FC = () => {
    const {
        loading, kpis, alerts, reserves, lineStatuses,
        lastRefresh, nowMin, serviceToday, refresh
    } = useDashboardData();

    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        feedback.click();
        setIsRefreshing(true);
        await refresh();
        setTimeout(() => setIsRefreshing(false), 600);
    };

    const formattedDate = useMemo(() => {
        return new Date().toLocaleDateString('ca-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }, []);

    const formatTime = (date: Date) =>
        date.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const criticalAlerts = useMemo(() => alerts.filter(a => a.severity === 'critical'), [alerts]);
    const warningAlerts = useMemo(() => alerts.filter(a => a.severity !== 'critical'), [alerts]);

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

    return (
        <div className="flex flex-col lg:h-[calc(100vh-110px)] space-y-6 sm:space-y-8 p-4 sm:p-8 animate-in fade-in duration-700">
            {/* Header */}
            <header className="flex-none flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-[#4D5358] dark:text-white tracking-tight uppercase title-glow flex items-center gap-3">
                        <Zap className="text-fgc-green" size={28} strokeWidth={2.5} />
                        CCO — Supervisió Operativa
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium tracking-tight mt-1 capitalize">
                        Servei {serviceToday.padStart(3, '0')} · {formattedDate}
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider mt-0.5">
                        Última actualització: {formatTime(lastRefresh)}
                    </p>
                </div>
                <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/60 dark:bg-white/[0.04] border border-gray-100 dark:border-white/5 text-sm font-semibold text-[#4D5358] dark:text-gray-300 hover:bg-fgc-green/10 transition-all active:scale-95"
                >
                    <RefreshCcw size={16} className={`${isRefreshing ? 'animate-spin' : ''}`} />
                    Actualitzar
                </button>
            </header>

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
                    infoText="Percentatge de circulacions actives teòriques cobertes en aquest precís instant."
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
                    infoText="Indica quants dels torns planificats per avui s'han cobert respecte al total requerit de personal."
                />
                <KpiCard
                    label="Reserves"
                    value={kpis.reserveAvailable}
                    subtitle="maquinistes disponibles"
                    icon={<Shield size={22} strokeWidth={2.5} />}
                    color="#A8D017"
                    pulse={kpis.reserveAvailable === 0}
                    infoText="Número de maquinistes de recanvi lliures als seus corresponents destacaments, a l'espera de necessitats de servei."
                />
                <KpiCard
                    label="Flota Operativa"
                    value={kpis.availableTrainUnits}
                    subtitle={`${kpis.brokenTrainUnits} avariats`}
                    icon={<Train size={22} strokeWidth={2.5} />}
                    color="#1B79C9"
                    pulse={kpis.brokenTrainUnits > 3}
                    infoText="Número d'unitats de tren de FGC que es troben actualment disponibles per al servei, un cop restats els que tenen avaria en curs."
                />
            </div>

            {/* Main Grid: Bento Layout */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-5">

                {/* Coverage Ring + Line Status */}
                <GlassPanel className="lg:col-span-4 p-6 flex flex-col gap-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Radio size={18} className="text-fgc-green" />
                            <h2 className="text-base font-bold text-[#4D5358] dark:text-white uppercase tracking-wider">Cobertura de Xarxa</h2>
                        </div>
                        <div className="group relative">
                            <Info size={16} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-help" />
                            <div className="pointer-events-none absolute bottom-full -right-2 w-56 mb-2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                                <div className="bg-gray-900 border border-gray-700 text-white text-[11px] p-2.5 rounded-xl shadow-xl">
                                    Aquest gràfic interactiu monotoritza en temps real la quantitat de validacions per cada línia (circulacions en moviment actiu).
                                </div>
                                <div className="w-2 h-2 bg-gray-900 border-b border-r border-gray-700 transform rotate-45 absolute -bottom-1 right-3"></div>
                            </div>
                        </div>
                    </div>

                    <CoverageBarChart lineStatuses={lineStatuses} />
                </GlassPanel>

                {/* Alerts Panel */}
                <GlassPanel className="lg:col-span-5 p-6 flex flex-col overflow-hidden gap-4">
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
                                        Llistat d'alertes detectades al sistema de maquinistes (perfils incomplets principalment, com maquinistes assignats sense nom, o serveis mancats de registres).
                                    </div>
                                    <div className="w-2 h-2 bg-gray-900 border-b border-r border-gray-700 transform rotate-45 absolute -bottom-1 right-3"></div>
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
                        {criticalAlerts.map(a => <AlertRow key={a.id} alert={a} />)}
                        {warningAlerts.map(a => <AlertRow key={a.id} alert={a} />)}
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
                <GlassPanel className="lg:col-span-3 p-6 flex flex-col overflow-hidden gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <MapPin size={18} className="text-fgc-green" />
                            <h2 className="text-base font-bold text-[#4D5358] dark:text-white uppercase tracking-wider">Reserves</h2>
                        </div>
                        <div className="group relative">
                            <Info size={16} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-help" />
                            <div className="pointer-events-none absolute bottom-full right-0 w-56 mb-2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                                <div className="bg-gray-900 border border-gray-700 text-white text-[11px] p-2.5 rounded-xl shadow-xl">
                                    Localització en directe i llistat nominal del personal de reserva classificat per estació d'assignació.
                                </div>
                                <div className="w-2 h-2 bg-gray-900 border-b border-r border-gray-700 transform rotate-45 absolute -bottom-1 right-3"></div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar space-y-2">
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
                            <span>Total reserves</span>
                            <span className="font-bold text-[#4D5358] dark:text-white">{kpis.reserveAvailable}</span>
                        </div>
                    </div>
                </GlassPanel>
            </div>
        </div>
    );
};

// ── Wrapped export with ErrorBoundary ──────────────────
const DashboardView: React.FC = () => (
    <ErrorBoundary sectionName="CCO — Supervisió Operativa">
        <DashboardViewComponent />
    </ErrorBoundary>
);

export default DashboardView;
