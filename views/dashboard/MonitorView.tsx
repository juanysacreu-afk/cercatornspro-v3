import React, { useEffect } from 'react';
import { Maximize2, X, Zap, AlertTriangle, ShieldAlert } from 'lucide-react';
import { KpiCard } from './components/KpiCard';

interface MonitorViewProps {
    kpis: any;
    criticalAlerts: any[];
    warningAlerts: any[];
    lastRefreshLabel: string;
    onClose: () => void;
}

export const MonitorView: React.FC<MonitorViewProps> = ({ kpis, criticalAlerts, warningAlerts, lastRefreshLabel, onClose }) => {
    // N4 - Add escape key listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Live clock for Monitor
    const [time, setTime] = React.useState(new Date());
    useEffect(() => {
        const id = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    const hh = time.getHours().toString().padStart(2, '0');
    const mm = time.getMinutes().toString().padStart(2, '0');
    const ss = time.getSeconds().toString().padStart(2, '0');

    return (
        <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col p-8 overflow-hidden animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-4xl font-black text-white tracking-tight uppercase flex items-center gap-4">
                        <Zap className="text-fgc-green" size={40} strokeWidth={3} />
                        MONITOR CSO
                    </h1>
                    <p className="text-xl text-gray-400 font-bold tracking-widest mt-2 uppercase">
                        Actualitzat {lastRefreshLabel}
                    </p>
                </div>

                <div className="flex items-center gap-8">
                    <div className="font-mono text-6xl font-black tabular-nums tracking-tighter shadow-xl">
                        <span>{hh}</span>
                        <span className="text-fgc-green animate-pulse">:</span>
                        <span>{mm}</span>
                        <span className="text-gray-500 text-4xl">:<span className="transition-all duration-200">{ss}</span></span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-4 bg-white/10 hover:bg-white/20 rounded-full transition-colors group"
                        title="Tancar Monitor (ESC)"
                    >
                        <X size={32} className="text-gray-400 group-hover:text-white" />
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-8 mb-8">
                <div className="bg-[#111] border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden flex flex-col justify-center">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-2xl font-bold text-gray-400 uppercase tracking-widest">Servei Cobert</span>
                        <div className="p-3 bg-fgc-green/20 rounded-2xl">
                            <Zap size={32} className="text-fgc-green" />
                        </div>
                    </div>
                    <div className="text-8xl font-black tracking-tighter" style={{ color: kpis.serviceCoverage > 85 ? '#10B981' : kpis.serviceCoverage > 60 ? '#F59E0B' : '#EF4444' }}>
                        {kpis.serviceCoverage}%
                    </div>
                    <div className="text-2xl text-gray-500 font-medium mt-4">
                        {kpis.activeTrains} de {kpis.scheduledTrains} trens actius
                    </div>
                    {/* Progress bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-4 bg-white/5">
                        <div
                            className="h-full transition-all duration-1000 ease-out"
                            style={{
                                width: `${kpis.serviceCoverage}%`,
                                backgroundColor: kpis.serviceCoverage > 85 ? '#10B981' : kpis.serviceCoverage > 60 ? '#F59E0B' : '#EF4444'
                            }}
                        />
                    </div>
                </div>

                <div className="bg-[#111] border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden flex flex-col justify-center">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-2xl font-bold text-gray-400 uppercase tracking-widest">Planificació Personal</span>
                        <div className="p-3 bg-indigo-500/20 rounded-2xl">
                            <ShieldAlert size={32} className="text-indigo-400" />
                        </div>
                    </div>
                    <div className="text-8xl font-black tracking-tighter" style={{ color: kpis.planningCoverage === 100 ? '#6366F1' : '#EF4444' }}>
                        {kpis.planningCoverage}%
                    </div>
                    <div className="text-2xl text-gray-500 font-medium mt-4">
                        {kpis.assignedPersonnel < kpis.totalPersonnel
                            ? `${kpis.totalPersonnel - kpis.assignedPersonnel} torns sense cobrir`
                            : "Tot el servei planificat"}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-4 bg-white/5">
                        <div
                            className="h-full bg-indigo-500 transition-all duration-1000 ease-out"
                            style={{ width: `${kpis.planningCoverage}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Alerts Log (Large display) */}
            <div className="flex-1 bg-[#111] border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col overflow-hidden">
                <h2 className="text-2xl font-bold text-gray-400 uppercase tracking-widest flex items-center gap-3 mb-6">
                    <AlertTriangle size={24} className="text-amber-500" />
                    Registre Crític
                </h2>

                <div className="flex-1 overflow-y-auto space-y-4 pr-4">
                    {criticalAlerts.length === 0 && warningAlerts.length === 0 && (
                        <div className="h-full flex items-center justify-center">
                            <p className="text-3xl font-bold text-gray-600 uppercase tracking-widest">Cap alerta crítica registrada</p>
                        </div>
                    )}

                    {criticalAlerts.map(a => (
                        <div key={a.id} className="flex flex-col bg-red-950/40 border border-red-500/30 rounded-2xl p-6">
                            <div className="flex items-center gap-4">
                                <span className="bg-red-500 text-white text-sm font-black px-4 py-1.5 rounded-full uppercase tracking-wider">
                                    CRÍTIC
                                </span>
                                <span className="text-3xl font-black text-red-400 tracking-tight">{a.title}</span>
                            </div>
                            <span className="text-xl text-red-200/70 mt-3 font-medium">{a.subtitle}</span>
                        </div>
                    ))}

                    {warningAlerts.map(a => (
                        <div key={a.id} className="flex flex-col bg-amber-950/30 border border-amber-500/30 rounded-2xl p-6">
                            <div className="flex items-center gap-4">
                                <span className="bg-amber-500 text-black text-sm font-black px-4 py-1.5 rounded-full uppercase tracking-wider">
                                    AVÍS
                                </span>
                                <span className="text-3xl font-black text-amber-500 tracking-tight">{a.title}</span>
                            </div>
                            <span className="text-xl text-amber-200/70 mt-3 font-medium">{a.subtitle}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
