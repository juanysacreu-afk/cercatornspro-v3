import React, { useState, useMemo } from 'react';
import {
    Activity, AlertTriangle, Train, Users, Shield, RefreshCcw,
    Clock, ChevronRight, Zap, Eye, Gauge, TrendingUp, Radio, MapPin
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
}> = ({ label, value, subtitle, icon, color, pulse, trend }) => (
    <div className={`relative overflow-hidden rounded-3xl p-5 sm:p-6 transition-all duration-500 hover:scale-[1.02] hover:shadow-xl
        bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/5
        shadow-[0_4px_24px_0_rgba(31,38,135,0.06)] dark:shadow-[0_4px_24px_0_rgba(0,0,0,0.25)]`}
    >
        {/* Accent Glow */}
        <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-3xl opacity-20" style={{ backgroundColor: color }} />

        <div className="flex items-start justify-between mb-3">
            <div className={`p-2.5 rounded-2xl`} style={{ backgroundColor: color + '18' }}>
                <span style={{ color }}>{icon}</span>
            </div>
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
        </div>
        <div className="text-3xl sm:text-4xl font-black tracking-tight text-[#4D5358] dark:text-white">{value}</div>
        <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mt-1">{label}</div>
        {subtitle && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</div>}
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

const LineStatusBar: React.FC<{ line: LineStatus }> = ({ line }) => (
    <div className="flex items-center gap-3 group">
        <div className="w-12 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm" style={{ backgroundColor: line.color }}>
            {line.linia}
        </div>
        <div className="flex-1">
            <div className="w-full h-2.5 rounded-full bg-gray-200/60 dark:bg-white/5 overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{
                        width: `${line.coveragePercent}%`,
                        backgroundColor: line.coveragePercent > 80 ? '#10B981' : line.coveragePercent > 50 ? '#F59E0B' : '#EF4444'
                    }}
                />
            </div>
        </div>
        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 w-16 text-right tabular-nums">
            {line.activeCirculations}/{line.totalCirculations}
        </span>
    </div>
);

// ── Service Coverage Ring ──────────────────────────────
const CoverageRing: React.FC<{ percent: number }> = ({ percent }) => {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;
    const color = percent > 85 ? '#10B981' : percent > 60 ? '#F59E0B' : '#EF4444';

    return (
        <div className="relative w-36 h-36 mx-auto">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeWidth="8"
                    className="text-gray-200/40 dark:text-white/5" />
                <circle cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="8"
                    strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
                    className="transition-all duration-1000 ease-out" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-[#4D5358] dark:text-white">{percent}%</span>
                <span className="text-xs font-semibold text-gray-400">Cobertura</span>
            </div>
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

    const serviceLabel: Record<string, string> = { '0': '000 Laborable', '100': '100 Divendres', '400': '400 Dissabte', '500': '500 Festiu' };

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
        <div className="space-y-6 sm:space-y-8 p-4 sm:p-8 animate-in fade-in duration-700">
            {/* Header */}
            <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-[#4D5358] dark:text-white tracking-tight uppercase title-glow flex items-center gap-3">
                        <Zap className="text-fgc-green" size={28} strokeWidth={2.5} />
                        CCO — Supervisió Operativa
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium tracking-tight mt-1 capitalize">
                        Servei {serviceLabel[serviceToday] || serviceToday.padStart(3, '0')} · {formattedDate}
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    label="Servei Cobert"
                    value={`${kpis.serviceCoverage}%`}
                    subtitle={`${kpis.activeTrains} de ${kpis.scheduledTrains} trens`}
                    icon={<Gauge size={22} strokeWidth={2.5} />}
                    color={kpis.serviceCoverage > 85 ? '#10B981' : kpis.serviceCoverage > 60 ? '#F59E0B' : '#EF4444'}
                    pulse={kpis.serviceCoverage < 80}
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
                />
                <KpiCard
                    label="Reserves"
                    value={kpis.reserveAvailable}
                    subtitle="maquinistes disponibles"
                    icon={<Shield size={22} strokeWidth={2.5} />}
                    color="#A8D017"
                    pulse={kpis.reserveAvailable === 0}
                />
                <KpiCard
                    label="Flota Operativa"
                    value={kpis.availableTrainUnits}
                    subtitle={`${kpis.brokenTrainUnits} avariats`}
                    icon={<Train size={22} strokeWidth={2.5} />}
                    color="#1B79C9"
                    pulse={kpis.brokenTrainUnits > 3}
                />
            </div>

            {/* Main Grid: Bento Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

                {/* Coverage Ring + Line Status */}
                <GlassPanel className="lg:col-span-4 p-6 space-y-5">
                    <div className="flex items-center gap-2">
                        <Radio size={18} className="text-fgc-green" />
                        <h2 className="text-base font-bold text-[#4D5358] dark:text-white uppercase tracking-wider">Cobertura de Xarxa</h2>
                    </div>

                    <CoverageRing percent={kpis.serviceCoverage} />

                    <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                        {lineStatuses.map(ls => (
                            <LineStatusBar key={ls.linia} line={ls} />
                        ))}
                        {lineStatuses.length === 0 && (
                            <p className="text-sm text-gray-400 text-center py-4">Cap línia configurada pel servei actual</p>
                        )}
                    </div>
                </GlassPanel>

                {/* Alerts Panel */}
                <GlassPanel className="lg:col-span-5 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <AlertTriangle size={18} className="text-amber-500" />
                            <h2 className="text-base font-bold text-[#4D5358] dark:text-white uppercase tracking-wider">
                                Atenció Requerida
                            </h2>
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

                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
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
                <GlassPanel className="lg:col-span-3 p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <MapPin size={18} className="text-fgc-green" />
                        <h2 className="text-base font-bold text-[#4D5358] dark:text-white uppercase tracking-wider">Reserves</h2>
                    </div>

                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                        {reserves.map(r => <ReserveCard key={r.station} slot={r} />)}
                        {reserves.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                                <Shield size={32} className="mb-2 opacity-40" />
                                <p className="text-sm font-medium">Sense reserves</p>
                                <p className="text-xs">Cap maquinista de reserva actiu</p>
                            </div>
                        )}
                    </div>

                    <div className="pt-3 border-t border-gray-100 dark:border-white/5">
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
