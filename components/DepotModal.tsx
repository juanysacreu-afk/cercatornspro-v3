import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';

export type DepotVariant = 'generic' | 'can_roca' | 'reina_elisenda' | 'reina_elisenda_station' | 'ca_n_oriach' | 'rubi';

interface DepotModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    depotId: string;
    tracks: number[];
    parkedUnits: any[];
    onParkedUnitsChange: () => Promise<void>;
    isSyncing: boolean;
    setSyncing: (s: boolean) => void;
    variant?: DepotVariant;
}

const DepotModal: React.FC<DepotModalProps> = ({
    isOpen, onClose, title, depotId, tracks, parkedUnits, onParkedUnitsChange, isSyncing, setSyncing, variant = 'generic'
}) => {
    if (!isOpen) return null;

    const [inputUnit, setInputUnit] = useState('');
    const [selectedTrack, setSelectedTrack] = useState(tracks[0]);

    const handleAddUnit = async () => {
        if (!inputUnit) return;
        setSyncing(true);
        await supabase.from('parked_units').upsert({
            unit_number: inputUnit.toUpperCase(),
            depot_id: depotId,
            track: selectedTrack.toString(),
            updated_at: new Date().toISOString()
        });
        setInputUnit('');
        await onParkedUnitsChange();
        setSyncing(false);
    };

    const handleRemoveUnit = async (unitNumber: string) => {
        setSyncing(true);
        await supabase.from('parked_units').delete().eq('unit_number', unitNumber);
        await onParkedUnitsChange();
        setSyncing(false);
    };

    const unitsInDepot = parkedUnits.filter(u => u.depot_id === depotId);

    // Renderer for visual tracks logic
    const renderSVGContent = () => {
        const unitsOnTrack = (t: number) => unitsInDepot.filter(u => u.track == t.toString());

        const renderStraightTracks = (trackList: number[], startY: number = 40, spacing: number = 60) => {
            return trackList.map((track, i) => {
                const y = startY + i * spacing;
                return (
                    <g key={track} className="group">
                        <text x="40" y={y + 5} fill="#666" fontSize="12" fontWeight="black" textAnchor="end" className="group-hover:fill-white transition-colors">Via {track}</text>
                        <line x1="60" y1={y} x2="95%" y2={y} stroke="#333" strokeWidth="6" strokeLinecap="round" className="group-hover:stroke-[#444] transition-colors" />
                        {unitsOnTrack(track).map((u, idx) => (
                            <g key={u.unit_number} transform={`translate(${120 + idx * 100}, ${y})`} className="cursor-pointer hover:scale-110 transition-transform">
                                <rect x="-40" y="-14" width="80" height="28" rx="6" fill="#3b82f6" stroke="white" strokeWidth="2" className="shadow-lg" />
                                <text x="0" y="5" textAnchor="middle" fill="white" fontSize="11" fontWeight="black">{u.unit_number}</text>
                            </g>
                        ))}
                    </g>
                );
            });
        };

        if (variant === 'can_roca') {
            const y1 = 60, y2 = 120, y3 = 220, y4 = 280;
            const platTop = <rect x="80" y="20" width="800" height="20" fill="#2a2a2a" rx="4" />;
            const platMid = <rect x="80" y="150" width="800" height="40" fill="#2a2a2a" rx="4" />;
            const platBot = <rect x="80" y="320" width="800" height="20" fill="#2a2a2a" rx="4" />;

            return (
                <>
                    {platTop}
                    {platMid}
                    {platBot}
                    <path d="M 20 90 L 80 90 L 120 60 L 900 60" fill="none" stroke="#444" strokeWidth="4" />
                    <path d="M 80 90 L 120 120 L 900 120" fill="none" stroke="#444" strokeWidth="4" />
                    <path d="M 20 250 L 80 250 L 120 220 L 900 220" fill="none" stroke="#444" strokeWidth="4" />
                    <path d="M 80 250 L 120 280 L 900 280" fill="none" stroke="#444" strokeWidth="4" />
                    {[1, 2, 3, 4].map(t => {
                        const y = t === 1 ? 60 : t === 2 ? 120 : t === 3 ? 220 : 280;
                        return (
                            <g key={t}>
                                <text x="880" y={y + 5} fill="#666" fontSize="12" fontWeight="black" textAnchor="end">Via {t}</text>
                                {unitsOnTrack(t).map((u, idx) => (
                                    <g key={u.unit_number} transform={`translate(${160 + idx * 100}, ${y})`}>
                                        <rect x="-40" y="-14" width="80" height="28" rx="6" fill="#3b82f6" stroke="white" strokeWidth="2" className="shadow-lg" />
                                        <text x="0" y="5" textAnchor="middle" fill="white" fontSize="11" fontWeight="black">{u.unit_number}</text>
                                    </g>
                                ))}
                            </g>
                        );
                    })}
                </>
            );
        }

        if (variant === 'reina_elisenda_station') {
            const y2 = 80, y1 = 180, xStart = 60, xS2 = 220, xPStart = 320, xPEnd = 600, xS3 = 680, xEnd = 890;
            return (
                <g>
                    <line x1={xStart} y1={y2} x2={xEnd} y2={y2} stroke="#333" strokeWidth="6" strokeLinecap="round" />
                    <line x1={xStart} y1={y1} x2={xEnd} y2={y1} stroke="#333" strokeWidth="6" strokeLinecap="round" />
                    <rect x={xPStart} y={y2 - 35} width={xPEnd - xPStart} height={20} fill="#2a2a2a" rx="4" />
                    <text x={xPStart + (xPEnd - xPStart) / 2} y={y2 - 45} textAnchor="middle" fill="#555" fontSize="8" fontWeight="black" className="uppercase tracking-widest">Andana Superior</text>
                    <rect x={xPStart} y={y1 + 15} width={xPEnd - xPStart} height={20} fill="#2a2a2a" rx="4" />
                    <text x={xPStart + (xPEnd - xPStart) / 2} y={y1 + 50} textAnchor="middle" fill="#555" fontSize="8" fontWeight="black" className="uppercase tracking-widest">Andana Inferior</text>
                    <path d={`M ${xS2 - 20} ${y2} L ${xS2 + 20} ${y1}`} stroke="#444" strokeWidth="4" strokeLinecap="round" />
                    <path d={`M ${xS3 - 20} ${y1} L ${xS3 + 20} ${y2}`} stroke="#444" strokeWidth="4" strokeLinecap="round" />
                    {[1, 2].map(t => {
                        const y = t === 1 ? y1 : y2;
                        return (
                            <g key={t}>
                                <text x={xStart - 10} y={y + 5} fill="#666" fontSize="12" fontWeight="black" textAnchor="end">Via {t}</text>
                            </g>
                        );
                    })}
                </g>
            );
        }

        if (variant === 'reina_elisenda') {
            const y2 = 100, y1 = 180, xStart = 60, xEnd = 800;
            return (
                <g>
                    {[1, 2].map(t => {
                        const y = t === 1 ? y1 : y2;
                        return (
                            <g key={t}>
                                <text x={xStart - 20} y={y + 5} fill="#666" fontSize="12" fontWeight="black" textAnchor="end">Via {t}</text>
                                <line x1={xStart} y1={y} x2={xEnd} y2={y} stroke="#333" strokeWidth="6" strokeLinecap="round" />
                                <line x1={xEnd + 5} y1={y - 12} x2={xEnd + 5} y2={y + 12} stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />
                                {unitsOnTrack(t).map((u, idx) => (
                                    <g key={u.unit_number} transform={`translate(${xStart + 100 + idx * 100}, ${y})`} className="cursor-pointer hover:scale-110 transition-transform">
                                        <rect x="-40" y="-14" width="80" height="28" rx="6" fill="#3b82f6" stroke="white" strokeWidth="2" className="shadow-lg" />
                                        <text x="0" y="5" textAnchor="middle" fill="white" fontSize="11" fontWeight="black">{u.unit_number}</text>
                                    </g>
                                ))}
                            </g>
                        );
                    })}
                </g>
            );
        }

        if (variant === 'ca_n_oriach') return renderStraightTracks([1, 2, 3], 60, 80);
        if (variant === 'rubi') return renderStraightTracks([4, 6, 8, 10], 60, 80);
        return renderStraightTracks(tracks);
    };

    const getHeight = () => {
        if (variant === 'can_roca') return 400;
        if (variant === 'reina_elisenda') return 250;
        if (variant === 'reina_elisenda_station') return 280;
        if (variant === 'ca_n_oriach') return 350;
        if (variant === 'rubi') return 400;
        return 60 + tracks.length * 60;
    };

    return createPortal(
        <div className="fixed inset-0 z-[10003] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#1e1e1e] border border-white/10 rounded-3xl w-[90vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
                <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/20">
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">{title}</h2>
                        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">Esquema de vies i ocupació</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="text-white" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 relative scrollbar-hide">
                    <div className="bg-[#121212] rounded-2xl border border-white/5 p-8 relative overflow-hidden min-h-[300px] flex items-center justify-center">
                        <svg
                            width="100%"
                            height={getHeight()}
                            viewBox={`0 0 950 ${getHeight()}`}
                            className="w-full select-none"
                            preserveAspectRatio="xMidYMid meet"
                        >
                            {renderSVGContent()}
                        </svg>
                    </div>

                    <div className="mt-8 border-t border-white/5 pt-8">
                        <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-4">Gestió d'Unitats al Dipòsit</h3>
                        <div className="flex bg-white/5 p-2 rounded-2xl w-fit items-center gap-2 mb-6 border border-white/10">
                            <input
                                value={inputUnit}
                                onChange={e => setInputUnit(e.target.value)}
                                placeholder="NÚMERO UNITAT"
                                className="bg-transparent border-none px-4 py-2 text-sm font-black text-white uppercase focus:ring-0 outline-none w-48 placeholder-white/20"
                            />
                            <div className="w-px h-8 bg-white/10 mx-2"></div>
                            <select
                                value={selectedTrack}
                                onChange={e => setSelectedTrack(Number(e.target.value))}
                                className="bg-transparent border-none px-4 py-2 text-sm font-bold text-blue-400 focus:ring-0 outline-none cursor-pointer"
                            >
                                {tracks.map(t => <option key={t} value={t} className="bg-[#121212] text-white">Via {t}</option>)}
                            </select>
                            <div className="w-px h-8 bg-white/10 mx-2"></div>
                            <button
                                onClick={handleAddUnit}
                                disabled={isSyncing || !inputUnit}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg hover:shadow-blue-500/20"
                            >
                                {isSyncing ? <Loader2 className="animate-spin" size={14} /> : 'AFEGIR'}
                            </button>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            {unitsInDepot.map(u => (
                                <div key={u.unit_number} className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 px-4 py-3 rounded-xl hover:bg-blue-500/20 transition-all group">
                                    <div className="flex flex-col">
                                        <span className="text-white font-black text-xs block">{u.unit_number}</span>
                                        <span className="text-[8px] text-blue-400 uppercase font-bold tracking-widest">Via {u.track}</span>
                                    </div>
                                    <button onClick={() => handleRemoveUnit(u.unit_number)} className="p-1 rounded-full hover:bg-red-500/20 text-blue-500/40 hover:text-red-500 transition-colors">
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                            {unitsInDepot.length === 0 && (
                                <p className="text-gray-500 text-xs italic">No hi ha unitats estacionades en aquest dipòsit.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default DepotModal;
