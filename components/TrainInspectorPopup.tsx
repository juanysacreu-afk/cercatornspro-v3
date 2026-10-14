import React from 'react';
import { X, User, ArrowRight, Phone, Activity, Clock } from 'lucide-react';
import type { LivePersonnel } from '../types';

interface TrainInspectorPopupProps {
    train: LivePersonnel;
    onClose: () => void;
    onOpenRoute: (trainId: string) => void;
}

const TrainInspectorPopup: React.FC<TrainInspectorPopupProps> = ({ train, onClose, onOpenRoute }) => {
    if (!train) return null;
    const isWorking = train.type === 'TRAIN';
    const liniaColor = train.color;
    const punct = train.punctuality;

    return (
        <div className="z-[300] animate-in zoom-in-95 fade-in duration-300 pointer-events-auto">
            <div
                className="w-80 overflow-hidden relative group"
                style={{
                    background: 'rgba(15, 15, 20, 0.98)',
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '32px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), inset 0 0 0 1px rgba(255, 255, 255, 0.1)'
                }}
            >
                {/* Animated Glow Background */}
                <div
                    className="absolute -top-12 -right-12 w-40 h-40 blur-[60px] transition-all duration-700 opacity-50"
                    style={{ backgroundColor: liniaColor }}
                />

                {/* Header */}
                <div className="p-6 border-b border-white/10 flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Inspector d'Unitat</span>
                            {train.isGeoTrenSynced && (
                                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">
                                    GeoTren GPS
                                </span>
                            )}
                        </div>
                        <h3 className="text-3xl font-black text-white font-mono tracking-tighter flex items-center gap-2">
                            {train.id}
                            <span
                                className="w-2.5 h-2.5 rounded-full animate-pulse shadow-md"
                                style={{ backgroundColor: punct ? punct.colorHex : '#22c55e' }}
                            />
                        </h3>
                        {train.ut && (
                            <p className="text-sm font-black text-white/80 font-mono mt-0.5">
                                UT {train.ut}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onClose();
                        }}
                        className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-all transition-colors relative z-[10]"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Operator Info */}
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-fgc-green/30 transition-all shrink-0">
                            <User size={24} className="text-gray-400 group-hover:text-fgc-green transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest leading-none mb-1">Maquinista</p>
                            <p className="text-sm font-black text-white dark:text-gray-200 uppercase truncate">{train.driver}</p>
                            <p className="text-[10px] font-bold text-fgc-green mt-1 tracking-widest uppercase">Torn {train.torn}</p>
                            {/* Direct phone call links */}
                            {train.phones && train.phones.length > 0 && (
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                    {train.phones.map((phone, pIdx) => (
                                        <a
                                            key={pIdx}
                                            href={`tel:${phone}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="inline-flex items-center gap-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-md text-[9px] font-black transition-all active:scale-95"
                                            title={`Trucar a ${train.driver}: ${phone}`}
                                        >
                                            <Phone size={10} />
                                            <span>{phone}</span>
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Route Progress */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-end">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Origen</span>
                                <span className="text-[11px] font-black text-white dark:text-gray-200 uppercase">{train.inici || '---'}</span>
                            </div>
                            <div className="flex-1 flex items-center justify-center px-4">
                                <ArrowRight size={14} className="text-gray-600 animate-pulse" />
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Destinació</span>
                                <span className="text-[11px] font-black text-white dark:text-gray-200 uppercase">{train.final || '---'}</span>
                            </div>
                        </div>

                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-[2px] border border-white/5">
                            <div
                                className="h-full rounded-full transition-all duration-1000 origin-left"
                                style={{
                                    width: `${train.progress || 0}%`,
                                    background: `linear-gradient(90deg, #3b82f6, ${liniaColor})`,
                                    boxShadow: `0 0 10px ${liniaColor}66`
                                }}
                            />
                        </div>
                    </div>

                    {/* Telemetry Footer */}
                    <div className="pt-4 border-t border-white/10 grid grid-cols-2 gap-4">
                        <div className="bg-white/10 p-3 rounded-2xl border border-white/10">
                            <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1 flex items-center gap-1">
                                {train.speedKmh !== undefined && train.speedKmh > 0 ? (
                                    <>
                                        <Activity size={10} /> Cinemàtica
                                    </>
                                ) : (
                                    'Última Estació'
                                )}
                            </p>
                            <p className="text-xs font-black text-white uppercase">
                                {train.speedKmh !== undefined && train.speedKmh > 0 ? `${train.speedKmh} km/h` : train.stationId}
                            </p>
                        </div>
                        <div className={`p-3 rounded-2xl border ${punct ? `${punct.bgClass} ${punct.borderClass}` : 'bg-white/10 border-white/10'}`}>
                            <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-1 flex items-center gap-1">
                                <Clock size={10} /> Puntualitat
                            </p>
                            <p className={`text-[10px] font-black uppercase flex items-center gap-1.5 leading-none ${punct ? punct.textClass : 'text-fgc-green'}`}>
                                <span
                                    className="w-1.5 h-1.5 rounded-full shadow-sm"
                                    style={{ backgroundColor: punct ? punct.colorHex : '#22c55e' }}
                                />
                                {punct ? punct.label : 'PUNTUAL'}
                            </p>
                        </div>
                    </div>

                    {/* Action Button */}
                    <button
                        onClick={() => {
                            onOpenRoute(train.id);
                        }}
                        className="w-full bg-white dark:bg-white/10 hover:bg-fgc-green hover:text-fgc-grey py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border border-white/10 shadow-lg active:scale-95"
                    >
                        Obrir Detalls Ruta
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TrainInspectorPopup;

