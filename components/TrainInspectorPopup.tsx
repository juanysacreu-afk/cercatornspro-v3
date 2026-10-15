import React, { useState, useEffect, useMemo } from 'react';
import { X, User, ArrowRight, Phone, Activity, Clock, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getFgcServiceDate, pollAndRecordGipPassages } from '../utils/gipRecorder';
import { normalizeCircId, formatDelayMinSec, normalizeTimeDiffSec } from '../utils/stations';
import type { LivePersonnel, GipRegistrePas } from '../types';

interface TrainInspectorPopupProps {
    train: LivePersonnel;
    onClose: () => void;
    onOpenRoute: (trainId: string) => void;
    isPrivacyMode?: boolean;
}

const TrainInspectorPopup: React.FC<TrainInspectorPopupProps> = ({ train, onClose, onOpenRoute, isPrivacyMode = true }) => {
    if (!train) return null;
    const isWorking = train.type === 'TRAIN';
    const liniaColor = train.color;
    const punct = train.punctuality;

    const [liveUt, setLiveUt] = useState<string | null>(train.ut || null);
    const [passages, setPassages] = useState<GipRegistrePas[]>([]);
    const [showPassages, setShowPassages] = useState<boolean>(true);

    const circCandidateIds = useMemo(() => {
        const id = train.id || '';
        const list = new Set<string>();
        if (id) {
            list.add(id.toUpperCase());
            list.add(normalizeCircId(id));
            const digits = id.replace(/\D/g, '');
            if (digits) {
                list.add(digits.padStart(3, '0'));
                list.add(parseInt(digits, 10).toString());
            }
        }
        return Array.from(list);
    }, [train.id]);

    useEffect(() => {
        if (train.ut) {
            setLiveUt(train.ut);
        }
        if (circCandidateIds.length === 0) return;

        let isMounted = true;
        const fetchGipPassages = async () => {
            try {
                pollAndRecordGipPassages().catch(() => {});
                const serviceDate = getFgcServiceDate();
                const { data } = await supabase
                    .from('gip_registre_pas')
                    .select('*')
                    .eq('data_servei', serviceDate)
                    .in('circulacio_id', circCandidateIds)
                    .order('id', { ascending: true });

                if (isMounted && data && data.length > 0) {
                    setPassages(data as GipRegistrePas[]);
                    if (!train.ut && data[0]?.ut) {
                        setLiveUt(data[0].ut);
                    }
                }
            } catch (err) {
                console.warn('[TrainInspectorPopup] Error carregant passos GIP:', err);
            }
        };

        fetchGipPassages();
        return () => {
            isMounted = false;
        };
    }, [circCandidateIds, train.ut]);

    const activeUt = train.ut || liveUt;
    const isSynced = train.isGeoTrenSynced || passages.length > 0;

    return (
        <div className="z-[300] animate-in zoom-in-95 fade-in duration-300 pointer-events-auto my-auto">
            <div
                className="w-80 sm:w-88 max-h-[calc(100dvh-32px)] flex flex-col overflow-hidden rounded-[28px] relative group"
                style={{
                    background: 'rgba(15, 15, 20, 0.98)',
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '28px',
                    WebkitMaskImage: '-webkit-radial-gradient(white, black)',
                    contain: 'paint',
                    isolation: 'isolate',
                    transform: 'translateZ(0)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), inset 0 0 0 1px rgba(255, 255, 255, 0.1)'
                }}
            >
                {/* Animated Glow Background strictly clipped to 28px border */}
                <div className="absolute inset-0 overflow-hidden rounded-[28px] pointer-events-none z-0">
                    <div
                        className="absolute -top-10 -right-10 w-36 h-36 rounded-full blur-[40px] transition-all duration-700 opacity-40 pointer-events-none"
                        style={{ backgroundColor: liniaColor }}
                    />
                </div>

                {/* Header (Pinned at top with seamless corner clipping) */}
                <div className="p-5 border-b border-white/10 flex justify-between items-start shrink-0 relative z-[10] bg-black/40 backdrop-blur-md rounded-t-[27px] overflow-hidden">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Inspector d'Unitat</span>
                            {isSynced && (
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
                        {activeUt && (
                            <p className="text-sm font-black text-white/90 font-mono mt-0.5 flex items-center gap-1.5">
                                <span className="text-fgc-green">UT</span> {activeUt}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onClose();
                        }}
                        className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-all transition-colors relative z-[10] shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
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
                                            href={isPrivacyMode ? undefined : `tel:${phone}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (isPrivacyMode) e.preventDefault();
                                            }}
                                            className={`inline-flex items-center gap-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-md text-[9px] font-black transition-all active:scale-95 ${isPrivacyMode ? 'cursor-default' : ''}`}
                                            title={isPrivacyMode ? 'Telèfon protegit per mode privacitat' : `Trucar a ${train.driver}: ${phone}`}
                                        >
                                            <Phone size={10} />
                                            <span>{isPrivacyMode ? '*** ** ** **' : phone}</span>
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

                    {/* GIP Passages Section (Real Recorded Passages) */}
                    {passages.length > 0 && (
                        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                            <button
                                onClick={() => setShowPassages(!showPassages)}
                                className="w-full flex items-center justify-between text-[9px] font-black uppercase text-gray-300 hover:text-white transition-colors"
                            >
                                <span className="flex items-center gap-1.5">
                                    <Clock size={11} className="text-fgc-green" />
                                    Registre de Pas GIP ({passages.length} estacions)
                                </span>
                                {showPassages ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>

                            {showPassages && (
                                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                                    {passages.map((p, pIdx) => {
                                        const diff = normalizeTimeDiffSec(p.diferencia_segons);
                                        const isAdvanced = diff < 0;
                                        const isLate = diff > 180;
                                        const isAmber = diff > 180 && diff <= 300;
                                        const isRed = diff > 300;
                                        const diffColor = isAdvanced
                                            ? 'text-blue-400'
                                            : isRed
                                            ? 'text-red-400'
                                            : isAmber
                                            ? 'text-amber-400'
                                            : 'text-emerald-400';

                                        return (
                                            <div
                                                key={pIdx}
                                                className="flex items-center justify-between text-[10px] py-1 px-2 rounded-lg bg-black/20 border border-white/5 font-mono"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="font-black text-white">{p.estacio_codi}</span>
                                                    <span className="text-[9px] text-gray-400">Teòric: {p.hora_teorica?.substring(0, 5) || '--:--'}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-gray-200">Real: {p.hora_real?.substring(0, 5) || '--:--'}</span>
                                                    <span className={`font-black text-[9px] ${diffColor}`}>
                                                        {diff === 0 ? '0s' : `${diff > 0 ? '+' : ''}${formatDelayMinSec(diff)}`}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

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

