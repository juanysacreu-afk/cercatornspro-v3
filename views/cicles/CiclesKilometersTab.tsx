import React, { useState } from 'react';
import { Gauge, Loader2, Save, History, Trash2 } from 'lucide-react';
import GlassPanel from '../../components/common/GlassPanel';
import { useToast } from '../../components/ToastProvider';

interface CiclesKilometersTabProps {
    allFleetTrains: string[];
    unitKilometers: any[];
    saving: boolean;
    handleSaveKilometers: (unit: string, date: string, km: number) => Promise<boolean>;
    handleDeleteKilometerRecord: (id: string) => Promise<void>;
    setSelectedUnitDetail: (unit: string | null) => void;
}

const CiclesKilometersTab: React.FC<CiclesKilometersTabProps> = ({
    allFleetTrains,
    unitKilometers,
    saving,
    handleSaveKilometers,
    handleDeleteKilometerRecord,
    setSelectedUnitDetail
}) => {
    const { showToast } = useToast();
    const [newTrainId, setNewTrainId] = useState('');
    const [kmFilterSerie, setKmFilterSerie] = useState<string>('ALL');

    return (
        <div className="animate-in fade-in slide-in-from-right-8 duration-700 space-y-8 pb-20">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                    <GlassPanel className="p-8 sticky top-24 space-y-6">
                        <h3 className="text-lg font-black text-fgc-grey dark:text-white uppercase flex items-center gap-2">
                            <Gauge size={20} className="text-fgc-green" /> Registrar Kilòmetres
                        </h3>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Seleccionar Unitat</label>
                                <select
                                    className="w-full bg-gray-50 dark:bg-black/20 rounded-2xl p-4 font-black outline-none focus:ring-2 focus:ring-fgc-green/50 appearance-none cursor-pointer"
                                    value={newTrainId}
                                    onChange={(e) => setNewTrainId(e.target.value)}
                                >
                                    <option value="">Selecciona...</option>
                                    {allFleetTrains.map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Data de Lectura</label>
                                <input
                                    type="date"
                                    className="w-full bg-gray-50 dark:bg-black/20 rounded-2xl p-4 font-black outline-none focus:ring-2 focus:ring-fgc-green/50"
                                    defaultValue={new Date().toISOString().split('T')[0]}
                                    id="km-date"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Kilòmetres Totals</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        className="w-full bg-gray-50 dark:bg-black/20 rounded-2xl p-4 pl-12 font-black outline-none focus:ring-2 focus:ring-fgc-green/50"
                                        placeholder="0.00"
                                        id="km-value"
                                    />
                                    <Gauge size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                </div>
                            </div>

                            <button
                                onClick={async () => {
                                    const date = (document.getElementById('km-date') as HTMLInputElement).value;
                                    const kmVal = (document.getElementById('km-value') as HTMLInputElement).value;
                                    const km = parseFloat(kmVal);

                                    if (!newTrainId || !date || !kmVal) {
                                        showToast('Dades incompletes', 'error');
                                        return;
                                    }

                                    const success = await handleSaveKilometers(newTrainId, date, km);
                                    if (success) {
                                        (document.getElementById('km-value') as HTMLInputElement).value = '';
                                        setNewTrainId('');
                                    }
                                }}
                                disabled={saving || !newTrainId}
                                className="w-full bg-fgc-green text-fgc-grey p-5 rounded-2xl font-black text-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-4 shadow-xl shadow-fgc-green/20"
                            >
                                {saving ? <Loader2 className="animate-spin" /> : <Save />} ACTUALITZAR KM
                            </button >
                        </div >
                    </GlassPanel >
                </div >

                <div className="lg:col-span-2 space-y-8">
                    {/* Mileage Chart */}
                    <GlassPanel className="p-8">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                            <h3 className="text-lg font-black text-fgc-grey dark:text-white uppercase flex items-center gap-2">
                                <History size={20} className="text-blue-500" /> Visió General de Flota
                            </h3>
                            <div className="flex bg-gray-100 dark:bg-black/40 p-1 rounded-xl border border-gray-200/50 dark:border-white/5">
                                {['ALL', '112', '113', '114', '115'].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setKmFilterSerie(s)}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black transition-all ${kmFilterSerie === s ? 'bg-white dark:bg-gray-800 text-fgc-grey dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        {s === 'ALL' ? 'TOTES' : `S-${s}`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="relative h-[350px] mt-10 flex items-end justify-between gap-1 px-2 border-b border-gray-100 dark:border-white/5 pb-1">
                            {(() => {
                                // Get latest KM for each unit
                                const filteredTrains = kmFilterSerie === 'ALL'
                                    ? allFleetTrains
                                    : allFleetTrains.filter(t => t.startsWith(kmFilterSerie));

                                const latestKm = filteredTrains.map(t => {
                                    const recs = unitKilometers.filter(k => k.unit_number === t);
                                    const km = recs.length > 0 ? parseFloat(recs[0].kilometers) : 0;
                                    return { unit: t, km };
                                }).sort((a, b) => b.km - a.km);

                                const maxKm = Math.max(...latestKm.map(x => x.km)) || 1;

                                // Show all filtered units
                                return latestKm.map((item, idx) => {
                                    const height = (item.km / maxKm) * 100;
                                    const isHigh = idx < latestKm.length * 0.15; // Top 15%
                                    const isLow = idx > latestKm.length * 0.85; // Bottom 15%

                                    return (
                                        <div key={item.unit} onClick={() => setSelectedUnitDetail(item.unit)} className="flex-1 flex flex-col items-center group relative h-full justify-end cursor-pointer">
                                            <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-all z-20 pointer-events-none">
                                                <div className="bg-fgc-grey dark:bg-gray-800 text-white p-2 rounded-lg text-[9px] font-black shadow-xl border border-white/10 whitespace-nowrap">
                                                    {item.unit}: {item.km.toLocaleString()} km
                                                    <div className="text-[7px] text-gray-400 mt-0.5">Cliqueu per a històric</div>
                                                </div>
                                            </div>
                                            <div
                                                className={`w-full rounded-t-sm transition-all duration-500 hover:scale-x-110 shadow-sm ${item.km === 0 ? 'bg-gray-100 dark:bg-white/5 h-[2px]' : isHigh ? 'bg-fgc-green' : isLow ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-700'}`}
                                                style={{ height: item.km === 0 ? '2px' : `${height}%` }}
                                            />
                                            {idx % 5 === 0 && (
                                                <span className="absolute top-full mt-2 text-[8px] font-black text-gray-400 rotate-45 origin-left">{item.unit}</span>
                                            )}
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                        <div className="mt-16 bg-gray-50/50 dark:bg-black/20 rounded-2xl p-6 border border-dashed border-gray-200 dark:border-white/10 text-center">
                            <p className="text-xs font-bold text-gray-400 italic">Distribució de kilòmetres per unitat ({kmFilterSerie === 'ALL' ? 'Tota la flota' : `Serie ${kmFilterSerie}`}). Les barres verdes indiquen les unitats amb més desgast.</p>
                        </div>
                    </GlassPanel>

                    {/* Recent Records Table */}
                    <GlassPanel className="overflow-hidden">
                        <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/20 flex items-center justify-between">
                            <h3 className="font-black flex items-center gap-2">
                                <History size={18} /> ÚLTIMS REGISTRES
                            </h3>
                        </div>
                        <div className="p-0">
                            {unitKilometers.length > 0 ? (
                                <div className="divide-y divide-gray-100 dark:divide-white/5">
                                    {unitKilometers.slice(0, 10).map((rec, idx) => (
                                        <div key={idx} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-gray-100 dark:bg-black rounded-xl flex items-center justify-center font-black text-xs text-fgc-grey dark:text-gray-300 shadow-sm border border-gray-200/50 dark:border-white/5">{rec.unit_number}</div>
                                                <div>
                                                    <p className="text-sm font-black text-fgc-grey dark:text-white">{parseFloat(rec.kilometers).toLocaleString()} <span className="text-[10px] text-gray-400">KM</span></p>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{new Date(rec.date).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (window.confirm("Eliminar aquest registre?")) {
                                                        handleDeleteKilometerRecord(rec.id);
                                                    }
                                                }}
                                                className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-12 text-center text-gray-400 font-bold uppercase italic tracking-widest text-xs">No hi ha registres de kilòmetres.</div>
                            )}
                        </div>
                    </GlassPanel>
                </div>
            </div >
        </div >
    );
};

export default CiclesKilometersTab;
