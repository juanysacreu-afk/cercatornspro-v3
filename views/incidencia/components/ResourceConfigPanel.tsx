import React from 'react';
import { Settings2, Plus, Minus, Power, Activity, Train, User, Zap } from 'lucide-react';
import { LINE_COLORS, mainLiniaForFilter } from '../../../utils/stations';
import GlassPanel from '../../../components/common/GlassPanel';

interface ResourceConfigPanelProps {
    lineCounts: Record<string, number>;
    lineHeadways: Record<string, number | null>;
    enabledLines: Record<string, boolean>;
    normalLines: Record<string, boolean>;
    shuttlePlan: any[];
    physicalTrainsCount: number;
    allDriversCount: number;
    totalRequiredTrains: number;
    totalRequiredDrivers: number;
    updateCount: (linia: string, delta: number) => void;
    updateHeadway: (linia: string, delta: number) => void;
    toggleLine: (linia: string) => void;
    toggleNormal: (linia: string) => void;
    autoRecalculateHeadways: () => void;
    handleGenerateCirculations: () => void;
    generating: boolean;
    canSupportS1: boolean;
    canSupportS2: boolean;
    canSupportL6: boolean;
    canSupportL7Full: boolean;
    canSupportL12: boolean;
}

const ResourceConfigPanel: React.FC<ResourceConfigPanelProps> = ({
    lineCounts,
    lineHeadways,
    enabledLines,
    normalLines,
    shuttlePlan,
    physicalTrainsCount,
    allDriversCount,
    totalRequiredTrains,
    totalRequiredDrivers,
    updateCount,
    updateHeadway,
    toggleLine,
    toggleNormal,
    autoRecalculateHeadways,
    handleGenerateCirculations,
    generating,
    canSupportS1,
    canSupportS2,
    canSupportL6,
    canSupportL7Full,
    canSupportL12
}) => {
    const LINE_OPTIONS = [
        { id: 'S1', label: 'Llançadora Terrassa (S1)', can: canSupportS1 },
        { id: 'S2', label: 'Llançadora Sabadell (S2)', can: canSupportS2 },
        { id: 'L6', label: 'Urbà Sarrià (L6)', can: canSupportL6 },
        { id: 'L7', label: "Urbà Av. Tibidabo (L7)", can: canSupportL7Full },
        { id: 'L12', label: 'Llançadora Reina Elisenda (L12)', can: canSupportL12 },
    ];

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-700">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Configuration */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-white dark:bg-gray-900 rounded-[32px] p-8 border border-gray-100 dark:border-white/5 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-[80px] rounded-full -mr-20 -mt-20 group-hover:bg-blue-500/10 transition-colors duration-700" />
                        <div className="relative">
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-blue-500/10 rounded-2xl">
                                        <Settings2 size={20} className="text-blue-500" />
                                    </div>
                                    <h4 className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">Paràmetres de la Segregació</h4>
                                </div>
                                <button
                                    onClick={autoRecalculateHeadways}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-2xl text-[10px] font-bold uppercase transition-all border border-blue-200/50 dark:border-blue-500/20"
                                >
                                    <Activity size={14} />
                                    <span>Càlcul Auto-Freq</span>
                                </button>
                            </div>

                            <div className="divide-y divide-gray-100 dark:divide-white/5">
                                {LINE_OPTIONS.map((opt) => (
                                    <div key={opt.id} className={`py-6 flex items-center justify-between gap-6 transition-opacity ${!opt.can ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
                                        <div className="flex items-center gap-4 min-w-[200px]">
                                            <button
                                                onClick={() => toggleLine(opt.id)}
                                                className={`p-3 rounded-2xl transition-all ${enabledLines[opt.id] ? 'bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 scale-110' : 'bg-gray-50 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600'}`}
                                            >
                                                <Power size={18} className={enabledLines[opt.id] ? 'text-green-500' : ''} />
                                            </button>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[11px] font-bold text-[#4D5358] dark:text-white uppercase tracking-wider">{opt.label}</span>
                                                <div className="flex items-center gap-4">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: LINE_COLORS[opt.id]?.hex }} />
                                                        <span className="text-[9px] font-bold text-gray-400 uppercase">{opt.id}</span>
                                                    </div>
                                                    {enabledLines[opt.id] && (
                                                        <button
                                                            onClick={() => toggleNormal(opt.id)}
                                                            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-[8px] font-heavy uppercase transition-all border ${normalLines[opt.id]
                                                                    ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                                                                    : 'bg-transparent text-gray-400 border-gray-100 dark:border-white/10 hover:border-gray-300'
                                                                }`}
                                                        >
                                                            <Zap size={10} className={normalLines[opt.id] ? 'fill-current' : ''} />
                                                            <span>Servei Gràfic</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex-1 flex items-center justify-end gap-12">
                                            <div className="flex flex-col items-center gap-2">
                                                <span className="text-[8px] font-heavy text-gray-400 uppercase tracking-widest">Unitats</span>
                                                <div className="flex items-center bg-gray-50 dark:bg-black/20 rounded-2xl p-1.5 border border-gray-200 dark:border-white/10">
                                                    <button onClick={() => updateCount(opt.id, -1)} className="p-1.5 hover:bg-white dark:hover:bg-gray-800 rounded-xl text-gray-400 hover:text-red-500 transition-all"><Minus size={14} /></button>
                                                    <span className="w-10 text-center text-xs font-bold text-[#4D5358] dark:text-white">{lineCounts[opt.id] || 0}</span>
                                                    <button onClick={() => updateCount(opt.id, 1)} className="p-1.5 hover:bg-white dark:hover:bg-gray-800 rounded-xl text-gray-400 hover:text-green-500 transition-all"><Plus size={14} /></button>
                                                </div>
                                            </div>

                                            <div className="flex flex-col items-center gap-2">
                                                <span className="text-[8px] font-heavy text-gray-400 uppercase tracking-widest">Freqüència</span>
                                                <div className="flex items-center bg-gray-50 dark:bg-black/20 rounded-2xl p-1.5 border border-gray-200 dark:border-white/10">
                                                    <button onClick={() => updateHeadway(opt.id, -1)} className="p-1.5 hover:bg-white dark:hover:bg-gray-800 rounded-xl text-gray-400 hover:text-blue-500 transition-all"><Minus size={14} /></button>
                                                    <span className="w-10 text-center text-xs font-bold text-[#4D5358] dark:text-white">{lineHeadways[opt.id] || '--'}'</span>
                                                    <button onClick={() => updateHeadway(opt.id, 1)} className="p-1.5 hover:bg-white dark:hover:bg-gray-800 rounded-xl text-gray-400 hover:text-blue-500 transition-all"><Plus size={14} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 pt-8 border-t border-gray-100 dark:border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em]">
                                    <div className="flex items-center gap-2"><Train size={14} className="text-blue-500" /> <span>{physicalTrainsCount} UNITATS APP</span></div>
                                    <div className="flex items-center gap-2"><User size={14} className="text-orange-500" /> <span>{allDriversCount} MAQUINISTES</span></div>
                                </div>
                                <button
                                    onClick={handleGenerateCirculations}
                                    disabled={generating}
                                    className={`group relative overflow-hidden px-8 py-3.5 rounded-[20px] transition-all transform active:scale-95 ${generating
                                            ? 'bg-gray-100 dark:bg-white/5 text-gray-400 cursor-not-allowed'
                                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-500/20'
                                        }`}
                                >
                                    <div className="relative z-10 flex items-center gap-3">
                                        {generating ? (
                                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <Zap size={16} className="text-blue-200 group-hover:scale-110 transition-transform" />
                                        )}
                                        <span className="text-[11px] font-bold uppercase tracking-widest">{generating ? 'Calculant...' : 'Generar Pla de Transport'}</span>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Summary */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-[#4D5358] dark:bg-black rounded-[32px] p-8 text-white border border-white/5 shadow-2xl relative overflow-hidden h-full">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-[40px] rounded-full -mr-10 -mt-10" />
                        <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-[0.2em] mb-8">Resum de Recursos</h4>

                        <div className="space-y-8">
                            <div className="flex items-center justify-between group">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[9px] font-heavy text-white/40 uppercase tracking-widest">Unitats Requerides</span>
                                    <span className="text-4xl font-light tracking-tight">{totalRequiredTrains}</span>
                                </div>
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${totalRequiredTrains > physicalTrainsCount ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-white/20'}`}>
                                    <Train size={24} />
                                </div>
                            </div>

                            <div className="flex items-center justify-between group">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[9px] font-heavy text-white/40 uppercase tracking-widest">Maquinistes Requerits</span>
                                    <span className="text-4xl font-light tracking-tight">{totalRequiredDrivers}</span>
                                </div>
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${totalRequiredDrivers > allDriversCount ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-white/20'}`}>
                                    <User size={24} />
                                </div>
                            </div>

                            <div className="pt-8 border-t border-white/10">
                                <div className="flex items-center gap-2 mb-4 text-[9px] font-heavy text-white/40 uppercase tracking-widest">Composició Estimada</div>
                                <div className="space-y-3">
                                    {shuttlePlan.length === 0 ? (
                                        <div className="text-[10px] text-white/30 italic">No s'han assignat recursos encara.</div>
                                    ) : shuttlePlan.map((s, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5 group cursor-default">
                                            <div className="flex items-center gap-3">
                                                <div className="w-7 h-7 rounded-xl flex items-center justify-center bg-white/5 text-[9px] font-bold group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                                    {s.train.id.split('.').pop()}
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[9px] font-bold text-white/90">{s.route}</span>
                                                    <span className="text-[8px] font-bold text-white/30 uppercase">{s.driver.driver} · {s.driver.torn}</span>
                                                </div>
                                            </div>
                                            <div className={`text-[8px] font-bold px-2 py-0.5 rounded-lg ${s.priority === 'ALTA' ? 'bg-red-500/20 text-red-400' : s.priority === 'MITJA' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                                {s.priority}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResourceConfigPanel;
