import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Clock, AlertCircle, Phone, Zap, User, Train, X, Scissors, ArrowDownToLine, ArrowUpToLine, ArrowLeftToLine, ArrowRightToLine, Coffee, Layers, Trash2, FastForward, RefreshCw, Activity, ZoomIn, ZoomOut, Maximize, TrendingUp, Move, Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import GlassPanel from '../../components/common/GlassPanel';
import TrainInspectorPopup from '../../components/TrainInspectorPopup';
import GeoTrenInspectorPopup from '../../components/GeoTrenInspectorPopup';
import DepotModal from '../../components/DepotModal';
import ListPersonnelRow from './ListPersonnelRow';
import { MAP_STATIONS, MAP_SEGMENTS, MAP_CROSSOVERS } from './mapConstants';
import { getFullPath, getConnectivityIslands } from './mapUtils';
import { resolveStationId, isServiceVisible, getLiniaColorHex, formatFgcTime, mainLiniaForFilter, LINE_COLORS } from '../../utils/stations';
import { LivePersonnel, IncidenciaMode } from '../../types';

interface IncidentMapProps {
    liveData: LivePersonnel[];
    parkedUnits: any[];
    onParkedUnitsChange: () => Promise<void>;
    selectedTrain: LivePersonnel | null;
    setSelectedTrain: (train: LivePersonnel | null) => void;
    openDiagram: string | null;
    setOpenDiagram: (id: string | null) => void;
    isRealTime: boolean;
    setIsRealTime: (val: boolean) => void;
    customTime: string;
    setCustomTime: (val: string) => void;
    isPaused: boolean;
    setIsPaused: (val: boolean) => void;
    isGeoTrenEnabled: boolean;
    setIsGeoTrenEnabled: (val: boolean) => void;
    geoTrenData: any[];
    mapTransform: { scale: number; posX: number; posY: number };
    setMapTransform: (val: { scale: number; posX: number; posY: number }) => void;
    selectedCutStations: Set<string>;
    setSelectedCutStations: React.Dispatch<React.SetStateAction<Set<string>>>;
    selectedCutSegments: Set<string>;
    setSelectedCutSegments: React.Dispatch<React.SetStateAction<Set<string>>>;
    dividedPersonnel: any;
    selectedRestLocation: string | null;
    setSelectedRestLocation: (val: string | null) => void;
    groupedRestPersonnel: Record<string, any[]>;
    isPrivacyMode: boolean;
    depotSyncing: boolean;
    setDepotSyncing: (val: boolean) => void;
    setAltServiceIsland: (val: string | null) => void;
    manualOverrides: Record<string, string>;
    setManualOverrides: (val: Record<string, string>) => void;
    openMenuId: string | null;
    setOpenMenuId: (val: string | null) => void;
    selectedServei: string;
    theoryCircsLocal: any[];
    setTheoryCircsLocal: (val: any[]) => void;
    allShifts: any[];
    setAllShifts: (val: any[]) => void;
    setRealMallaCircs: (val: any[]) => void;
    setIsRealMallaOpen: (val: boolean) => void;
    setQuery: (val: string) => void;
    handleSearchCirculation: () => void;
    loading: boolean;
    setLoading: (val: boolean) => void;
}

const IncidentMap: React.FC<IncidentMapProps> = ({
    liveData, parkedUnits, onParkedUnitsChange, selectedTrain, setSelectedTrain,
    openDiagram, setOpenDiagram, isRealTime, setIsRealTime, customTime, setCustomTime,
    isPaused, setIsPaused, isGeoTrenEnabled, setIsGeoTrenEnabled, geoTrenData,
    mapTransform, setMapTransform, selectedCutStations, setSelectedCutStations,
    selectedCutSegments, setSelectedCutSegments, dividedPersonnel, selectedRestLocation,
    setSelectedRestLocation, groupedRestPersonnel, isPrivacyMode, depotSyncing,
    setDepotSyncing, setAltServiceIsland, manualOverrides, setManualOverrides,
    openMenuId, setOpenMenuId, selectedServei, theoryCircsLocal, setTheoryCircsLocal,
    allShifts, setAllShifts, setRealMallaCircs, setIsRealMallaOpen, setQuery,
    handleSearchCirculation, setLoading
}) => {

    const [hoveredTrain, setHoveredTrain] = useState<string | null>(null);
    const [selectedGeoTren, setSelectedGeoTren] = useState<any | null>(null);
    const positionHistoryRef = useRef<Record<string, Array<{ x: number; y: number; time: number }>>>({});

    // Helper functions for map interaction
    const toggleStationCut = (id: string) => {
        setSelectedCutStations(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleTrackCut = (from: string, to: string, track: 1 | 2) => {
        const id = `${from}-${to}-V${track}`;
        const reverseId = `${to}-${from}-V${track}`;
        setSelectedCutSegments(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else if (next.has(reverseId)) next.delete(reverseId);
            else next.add(id);
            return next;
        });
    };

    const clearAllCuts = () => {
        setSelectedCutStations(new Set());
        setSelectedCutSegments(new Set());
        setAltServiceIsland(null);
    };

    // Update position history
    useEffect(() => {
        const now = Date.now();
        liveData.forEach(p => {
            if (!positionHistoryRef.current[p.id]) {
                positionHistoryRef.current[p.id] = [];
            }
            const history = positionHistoryRef.current[p.id];
            // Avoid duplicate points
            if (history.length === 0 || history[history.length - 1].x !== p.x || history[history.length - 1].y !== p.y) {
                history.push({ x: p.x, y: p.y, time: now });
                // Keep last 120 points (approx 2 minutes at 1s updates)
                if (history.length > 120) history.shift();
            }
        });

        // Clean up old trains
        const activeIds = new Set(liveData.map(p => p.id));
        Object.keys(positionHistoryRef.current).forEach(id => {
            if (!activeIds.has(id)) {
                delete positionHistoryRef.current[id];
            }
        });
    }, [liveData]);


    const trains = liveData.filter(p => p.type === 'TRAIN' && isServiceVisible(p.servei, selectedServei));
    const resting = liveData.filter(p => p.type === 'REST');

    return (
        <GlassPanel className="p-4 sm:p-6 relative flex flex-col">
            {/* Zoom Controls */}
            <div className="flex flex-col sm:flex-row md:items-center justify-between gap-6 mb-6">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none">Esquema Interactiu BV</h3>
                        <div className={`flex items-center gap-2 px-2 py-0.5 rounded-lg border transition-all ${isRealTime ? 'bg-fgc-green/10 border-fgc-green/20 text-fgc-green' : 'bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-400'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${isRealTime ? 'bg-fgc-green' : 'bg-gray-400'}`}></div>
                            <span className="text-[8px] font-bold uppercase tracking-widest">{isRealTime ? 'En Temps Real' : 'Tall Manual'}</span>
                        </div>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 flex items-center gap-1"><Clock size={10} /> Estat malla: <span className="text-fgc-grey dark:text-white font-bold">{customTime || '--:--'}</span></p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap items-center gap-3 bg-gray-50 dark:bg-black/20 p-2 rounded-[24px] border border-gray-100 dark:border-white/5">
                        <button
                            onClick={async () => {
                                setLoading(true);

                                // 1. Load ALL circulations from DB using pagination to bypass 1000-row server limit
                                let theory = theoryCircsLocal;
                                if (theory.length === 0 || theory.length === 1000) {
                                    let allCircs: any[] = [];
                                    let from = 0;
                                    const batchSize = 1000;
                                    while (true) {
                                        const { data: batch } = await supabase.from('circulations').select('*').range(from, from + batchSize - 1);
                                        if (!batch || batch.length === 0) break;
                                        allCircs = allCircs.concat(batch);
                                        if (batch.length < batchSize) break; // last page
                                        from += batchSize;
                                    }
                                    if (allCircs.length > 0) {
                                        theory = allCircs;
                                        setTheoryCircsLocal(allCircs);
                                    }
                                }

                                // 2. Load ALL shifts
                                let shifts = allShifts;
                                if (!shifts || shifts.length === 0) {
                                    const { data } = await supabase.from('shifts').select('*');
                                    if (data) {
                                        shifts = data;
                                        setAllShifts(data);
                                    }
                                }
                                setLoading(false);

                                if (theory.length === 0) {
                                    setRealMallaCircs([]);
                                    setIsRealMallaOpen(true);
                                    return;
                                }

                                // 3. Build set of circulation IDs for selected servei
                                const visibleShifts = (shifts || []); // Show all shifts on map regardless of service filter
                                const circIdInServei = new Set<string>();
                                const circToShift: Record<string, { torn: string; train: string }> = {};
                                visibleShifts.forEach(shift => {
                                    const shiftCircs = Array.isArray(shift.circulations) ? shift.circulations : [];
                                    shiftCircs.forEach((cRef: any) => {
                                        const codi = typeof cRef === 'string' ? cRef : cRef?.codi;
                                        if (!codi || codi === '-' || codi === 'Viatger' || codi === 'VIATGER') return;
                                        circIdInServei.add(codi);
                                        if (!circToShift[codi]) {
                                            circToShift[codi] = { torn: shift.id, train: shift.train || '---' };
                                        }
                                    });
                                });

                                // 4. Process ALL circulations, filtered by service
                                const res: any[] = [];
                                theory.forEach(tc => {
                                    // If a servei filter is active, only include circs referenced by that service's shifts
                                    if (selectedServei !== 'Tots' && !circIdInServei.has(tc.id)) return;

                                    const originId = resolveStationId(tc.inici || '', tc.linia || '');
                                    const destId = resolveStationId(tc.final || '', tc.linia || '');
                                    // Normalise L66 → L6
                                    const normLinia = tc.linia === 'L66' ? 'L6' : tc.linia;
                                    const shiftInfo = circToShift[tc.id] || { torn: '---', train: '---' };
                                    res.push({
                                        ...tc,
                                        linia: normLinia,
                                        liniaOriginal: tc.linia,
                                        torn: shiftInfo.torn,
                                        train: shiftInfo.train,
                                        route: `${originId} → ${destId}`,
                                        originId,
                                        destId,
                                    });
                                });
                                setRealMallaCircs(res);
                                setIsRealMallaOpen(true);
                            }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all bg-orange-500 text-white shadow-md hover:bg-orange-600`}
                            title="Veure la malla real teòrica del servei seleccionat"
                        >
                            <TrendingUp size={14} /> Malla Real
                        </button>
                        <div className="w-px h-6 bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block"></div>
                        <button onClick={() => setIsGeoTrenEnabled(!isGeoTrenEnabled)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${isGeoTrenEnabled ? 'bg-blue-500 text-white shadow-md' : 'text-gray-400 hover:text-fgc-grey'}`} title="Activar posicionament real GPS (GeoTren)"><Activity size={14} className={isGeoTrenEnabled ? 'animate-pulse' : ''} /> GeoTren</button>
                        <div className="w-px h-6 bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block"></div>
                        <button onClick={() => { setIsRealTime(true); setIsPaused(false); setIsGeoTrenEnabled(false); }} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${isRealTime && !isGeoTrenEnabled ? 'bg-fgc-grey dark:bg-fgc-green text-white dark:text-fgc-grey shadow-md' : 'text-gray-400 hover:text-fgc-grey'}`}>Live</button>
                        <button onClick={() => setIsPaused(!isPaused)} className={`p-2 rounded-xl text-xs font-bold transition-all ${isPaused ? 'bg-orange-500 text-white shadow-md' : 'bg-white dark:bg-white/5 text-gray-400 hover:text-fgc-grey'}`}>{isPaused ? <FastForward size={14} fill="currentColor" /> : <span className="flex gap-1"><div className="w-1 h-3 bg-current rounded-full" /><div className="w-1 h-3 bg-current rounded-full" /></span>}</button>
                        <input type="time" value={customTime} onChange={(e) => { setCustomTime(e.target.value); setIsRealTime(false); }} className="bg-white dark:bg-gray-800 border-none rounded-lg px-3 py-1.5 text-xs font-bold text-fgc-grey dark:text-white focus:ring-2 focus:ring-fgc-green/30 outline-none" />
                        <button onClick={() => { setIsRealTime(true); setIsPaused(false); }} className="p-2 hover:bg-gray-200 dark:hover:bg-white/10 rounded-lg text-gray-400" title="Tornar a l'hora actual"><RefreshCw size={14} /></button>
                    </div>
                </div>
            </div>

            {(selectedCutStations.size > 0 || selectedCutSegments.size > 0) && (<button onClick={clearAllCuts} className="text-[10px] font-bold text-red-500 uppercase flex items-center gap-2 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 rounded-xl hover:scale-105 transition-all shadow-sm border border-red-100 dark:border-red-900/40 animate-in fade-in zoom-in-95 self-start mb-4"><Trash2 size={14} /> Anul·lar Talls ({selectedCutStations.size + selectedCutSegments.size})</button>)}

            <div className="w-full h-[350px] sm:h-[400px] md:h-[420px] lg:h-[450px] bg-gray-50/30 dark:bg-black/20 rounded-3xl overflow-hidden border border-black/5 dark:border-white/5 relative">
                <TransformWrapper
                    initialScale={1}
                    minScale={0.5}
                    maxScale={4}
                    centerOnInit={false}
                    limitToBounds={false}
                    doubleClick={{ disabled: true }}
                    onTransformed={(_ref, state) => {
                        setMapTransform({ scale: state.scale, posX: state.positionX, posY: state.positionY });
                    }}
                >
                    {({ zoomIn, zoomOut, resetTransform }) => (
                        <>
                            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-white dark:bg-fgc-grey p-2 rounded-2xl shadow-xl border border-gray-100 dark:border-white/10">
                                <button onClick={() => zoomIn(0.25)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl text-fgc-grey dark:text-white transition-colors"><ZoomIn size={18} /></button>
                                <button onClick={() => zoomOut(0.25)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl text-fgc-grey dark:text-white transition-colors"><ZoomOut size={18} /></button>
                                <button onClick={() => resetTransform()} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl text-fgc-grey dark:text-white transition-colors"><Maximize size={18} /></button>
                            </div>
                            <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full">
                                <div className="w-full h-full flex items-center justify-center min-w-[1000px]">
                                    <svg viewBox="-40 -30 790 250" className="w-full h-full overflow-visible">
                                        <g className="opacity-40">
                                            <line x1="-35" y1="84" x2="0" y2="84" stroke="#4D5358" strokeWidth="2" strokeLinecap="round" />
                                            <path d="M 0 84 L 12 96" stroke="#4D5358" strokeWidth="2" fill="none" />
                                            <line x1="-35" y1="92" x2="5" y2="92" stroke="#4D5358" strokeWidth="2" fill="none" />
                                            <line x1="-35" y1="100" x2="20" y2="100" stroke="#4D5358" strokeWidth="2" strokeLinecap="round" />
                                            <line x1="-35" y1="108" x2="5" y2="108" stroke="#4D5358" strokeWidth="2" strokeLinecap="round" />
                                            <path d="M 5 108 L 9 104" stroke="#4D5358" strokeWidth="2" fill="none" />
                                            <line x1="-35" y1="116" x2="0" y2="116" stroke="#4D5358" strokeWidth="2" strokeLinecap="round" />
                                            <path d="M 0 116 L 12 104" stroke="#4D5358" strokeWidth="2" fill="none" />
                                            <rect x="-38" y="83" width="3" height="2" fill="#ef4444" />
                                            <rect x="-38" y="91" width="3" height="2" fill="#ef4444" />
                                            <rect x="-38" y="99" width="3" height="2" fill="#ef4444" />
                                            <rect x="-38" y="107" width="3" height="2" fill="#ef4444" />
                                            <rect x="-38" y="115" width="3" height="2" fill="#ef4444" />
                                        </g>
                                        {MAP_SEGMENTS.map((seg, i) => {
                                            const s1 = MAP_STATIONS.find(s => s.id === (seg as any).from)!;
                                            const s2 = MAP_STATIONS.find(s => s.id === (seg as any).to)!;
                                            if (!s1 || !s2) return null;

                                            const isV1Blocked = selectedCutSegments.has(`${s1.id}-${s2.id}-V1`) || selectedCutSegments.has(`${s2.id}-${s1.id}-V1`);
                                            const isV2Blocked = selectedCutSegments.has(`${s1.id}-${s2.id}-V2`) || selectedCutSegments.has(`${s2.id}-${s1.id}-V2`);

                                            const dx = s2.x - s1.x;
                                            const dy = s2.y - s1.y;
                                            const len = Math.sqrt(dx * dx + dy * dy);
                                            const nx = -dy / len;
                                            const ny = dx / len;
                                            const offset = 4;

                                            return (
                                                <g key={`seg-${i}`}>
                                                    <line
                                                        x1={s1.x + nx * offset} y1={s1.y + ny * offset}
                                                        x2={s2.x + nx * offset} y2={s2.y + ny * offset}
                                                        stroke={isV2Blocked ? "#ef4444" : "#4D5358"} strokeWidth="4" strokeLinecap="round"
                                                        className={`cursor-pointer transition-all duration-300 ${isV2Blocked ? 'opacity-100' : 'opacity-40 hover:opacity-100 hover:stroke-blue-400'}`}
                                                        onClick={() => toggleTrackCut(s1.id, s2.id, 2)}
                                                        style={{ pointerEvents: 'auto' }}
                                                    />
                                                    <line
                                                        x1={s1.x - nx * offset} y1={s1.y - ny * offset}
                                                        x2={s2.x - nx * offset} y2={s2.y - ny * offset}
                                                        stroke={isV1Blocked ? "#ef4444" : "#4D5358"} strokeWidth="4" strokeLinecap="round"
                                                        className={`cursor-pointer transition-all duration-300 ${isV1Blocked ? 'opacity-100' : 'opacity-40 hover:opacity-100 hover:stroke-blue-400'}`}
                                                        onClick={() => toggleTrackCut(s1.id, s2.id, 1)}
                                                        style={{ pointerEvents: 'auto' }}
                                                    />
                                                </g>
                                            );
                                        })}
                                        {MAP_STATIONS.map(st => {
                                            const isCut = selectedCutStations.has(st.id);
                                            const restHere = groupedRestPersonnel[st.id] || [];
                                            const count = restHere.length;
                                            const isUpper = st.y < 100;
                                            return (
                                                <g key={st.id} className="group">
                                                    <rect
                                                        x={st.x - ((st as any).type === 'depot' ? 6 : 3)} y={st.y - 11} width={(st as any).type === 'depot' ? "12" : "6"} height="22" rx="3"
                                                        fill={(st as any).type === 'depot' ? "#f3f4f6" : "white"} stroke={isCut ? "#ef4444" : "#4D5358"} strokeWidth="1.5"
                                                        onClick={() => {
                                                            const diagramMap: Record<string, string> = {
                                                                'PC': 'PC', 'PR': 'PR', 'GR': 'GR', 'PM': 'PM', 'BN': 'BN', 'TB': 'TB', 'SR': 'SR',
                                                                'RE': 'RE_ST', 'DRE': 'RE_DEPOT', 'COR': 'RB_DEPOT', 'DNA': 'NA_DEPOT', 'DPN': 'PN_DEPOT'
                                                            };
                                                            if (diagramMap[st.id]) setOpenDiagram(diagramMap[st.id]);
                                                        }}
                                                        className={`transition-all duration-300 ${['PC', 'PR', 'GR', 'PM', 'BN', 'TB', 'SR', 'RE', 'DRE', 'COR', 'DNA', 'DPN'].includes(st.id) ? 'cursor-pointer hover:stroke-blue-500' : ''}`}
                                                        style={{ pointerEvents: 'auto' }}
                                                    />
                                                    {count > 0 && !isCut && (
                                                        <g onClick={() => setSelectedRestLocation(selectedRestLocation === st.id ? null : st.id)} className="cursor-pointer transition-colors" style={{ pointerEvents: 'auto' }}>
                                                            <circle cx={st.x} cy={st.y + (isUpper ? 32 : 44)} r={7} fill="#3b82f6" className="shadow-md" stroke="white" strokeWidth="1.5" />
                                                            <text x={st.x} y={st.y + (isUpper ? 34.5 : 46.5)} textAnchor="middle" fill="white" className="text-[7px] font-bold pointer-events-none">{count}</text>
                                                        </g>
                                                    )}
                                                    <text
                                                        x={st.x + ((st as any).labelXOffset || 0)} y={st.y + (isUpper ? -16 : 28) + ((st as any).labelYOffset || 0)}
                                                        textAnchor="middle"
                                                        onClick={() => toggleStationCut(st.id)}
                                                        className={`text-[9px] font-bold select-none cursor-pointer transition-colors duration-300 hover:underline ${isCut ? 'fill-red-500' : (st as any).type === 'depot' && st.id !== 'PC' ? 'fill-blue-500 dark:fill-blue-400' : 'fill-gray-400 dark:fill-gray-500 hover:fill-fgc-grey'}`}
                                                        style={{ pointerEvents: 'auto' }}
                                                    >
                                                        {(st as any).type === 'depot' && st.id !== 'PC' ? ((st as any).label || st.id) : st.id}
                                                    </text>
                                                </g>
                                            );
                                        })}
                                        {MAP_CROSSOVERS.map((cross, i) => {
                                            const s1 = MAP_STATIONS.find(s => s.id === (cross as any).from)!;
                                            const s2 = MAP_STATIONS.find(s => s.id === (cross as any).to)!;
                                            if (!s1 || !s2) return null;

                                            const cx = s1.x + (s2.x - s1.x) * (cross as any).pos;
                                            const cy = s1.y + (s2.y - s1.y) * (cross as any).pos;
                                            const dx = s2.x - s1.x;
                                            const dy = s2.y - s1.y;
                                            const len = Math.sqrt(dx * dx + dy * dy);
                                            const nx = -dy / len;
                                            const ny = dx / len;
                                            const offset = 4;
                                            const span = 6;
                                            const vx = dx / len * span;
                                            const vy = dy / len * span;

                                            return (
                                                <g key={`cross-${i}`} className="opacity-40">
                                                    {((cross as any).type === 'X' || (cross as any).type === '/') && (
                                                        <line
                                                            x1={cx - vx + nx * offset} y1={cy - vy + ny * offset}
                                                            x2={cx + vx - nx * offset} y2={cy + vy - ny * offset}
                                                            stroke="#4D5358" strokeWidth="2" strokeLinecap="round"
                                                        />
                                                    )}
                                                    {((cross as any).type === 'X' || (cross as any).type === '\\') && (
                                                        <line
                                                            x1={cx - vx - nx * offset} y1={cy - vy - ny * offset}
                                                            x2={cx + vx + nx * offset} y2={cy + vy + ny * offset}
                                                            stroke="#4D5358" strokeWidth="2" strokeLinecap="round"
                                                        />
                                                    )}
                                                </g>
                                            );
                                        })}

                                        {!isGeoTrenEnabled && trains.map((p, idx) => {
                                            const offset = (p as any).visualOffset || 0;
                                            let isAffected = false;
                                            let effectiveCutStations = new Set(selectedCutStations);
                                            if (selectedCutStations.size === 2) {
                                                const [s1, s2] = Array.from(selectedCutStations);
                                                const path = getFullPath(s1, s2);
                                                path.forEach(s => effectiveCutStations.add(s));
                                            }

                                            if (effectiveCutStations.has(p.stationId.toUpperCase())) isAffected = true;

                                            if ((p as any).isMoving && (p as any).nextStationId) {
                                                const st = p.stationId.toUpperCase();
                                                const next = (p as any).nextStationId.toUpperCase();
                                                const segIdV1 = `${st}-${next}-V1`;
                                                const segIdV2 = `${st}-${next}-V2`;
                                                const segIdV1Rev = `${next}-${st}-V1`;
                                                const segIdV2Rev = `${next}-${st}-V2`;
                                                if (selectedCutSegments.has(segIdV1) || selectedCutSegments.has(segIdV2) || selectedCutSegments.has(segIdV1Rev) || selectedCutSegments.has(segIdV2Rev)) {
                                                    isAffected = true;
                                                }
                                            }

                                            const numId = parseInt(p.id.replace(/\D/g, ''));
                                            const isAsc = numId % 2 !== 0;
                                            const trackOffset = isAsc ? 6 : -6;
                                            const labelWidth = Math.max(20, p.id.length * 5.5 + 4);

                                            let finalX = p.x;
                                            let finalY = p.y;
                                            let useStandardOffset = true;

                                            if (p.stationId === 'PC') {
                                                const targetViaStr = (p.final === 'PC' ? p.via_final : p.via_inici) || '';
                                                const viaMatch = targetViaStr.match(/(\d+)/);
                                                if (viaMatch) {
                                                    const via = parseInt(viaMatch[1]);
                                                    if (via >= 1 && via <= 5) {
                                                        finalX = -30;
                                                        const yCoords = [84, 92, 100, 108, 116];
                                                        finalY = yCoords[via - 1];
                                                        useStandardOffset = false;
                                                    }
                                                }
                                            }

                                            const isMoving = !!(p as any).isMoving;
                                            const nextStation = (p as any).nextStationId;
                                            const isHovered = hoveredTrain === p.id;
                                            const trailPoints = positionHistoryRef.current[p.id] || [];
                                            let arrowAngle = 0;
                                            if (isMoving && nextStation) {
                                                const nextCoords = MAP_STATIONS.find(s => s.id === nextStation);
                                                if (nextCoords) {
                                                    const dx = nextCoords.x - finalX;
                                                    const dy = nextCoords.y - finalY;
                                                    arrowAngle = Math.atan2(dy, dx) * (180 / Math.PI);
                                                }
                                            }

                                            const baseTransform = useStandardOffset ? { transform: `translate(${offset * 4}px, ${trackOffset}px)` } : {};
                                            const counterScale = mapTransform.scale > 1.5 ? 1 / mapTransform.scale : 1;
                                            const effectiveX = useStandardOffset ? finalX + offset * 4 : finalX;
                                            const effectiveY = useStandardOffset ? finalY + trackOffset : finalY;
                                            const rotationTransform = isMoving && nextStation ? `rotate(${arrowAngle})` : '';
                                            const scaleTransform = counterScale < 1 ? `scale(${counterScale})` : '';

                                            return (
                                                <g
                                                    key={`${p.id}-${p.torn}-${idx}`}
                                                    className="transition-all duration-1000 ease-linear cursor-pointer"
                                                    onClick={() => setSelectedTrain(p)}
                                                    onMouseEnter={() => setHoveredTrain(p.id)}
                                                    onMouseLeave={() => setHoveredTrain(null)}
                                                    style={{
                                                        pointerEvents: 'auto',
                                                        transform: `translate(${effectiveX}px, ${effectiveY}px) ${scaleTransform}`,
                                                        transformOrigin: '0 0'
                                                    }}
                                                >
                                                    {isHovered && trailPoints.length > 1 && trailPoints.slice(0, -1).map((pt, ti) => {
                                                        const opacity = 0.15 + (ti / trailPoints.length) * 0.35;
                                                        const r = 1.5 + (ti / trailPoints.length) * 1.5;
                                                        // Trail points are in absolute coordinates, so we need to offset back relative to the translated group
                                                        return (
                                                            <circle key={`trail-${p.id}-${ti}`} cx={pt.x - effectiveX} cy={pt.y - effectiveY} r={r} fill={p.color} opacity={opacity} />
                                                        );
                                                    })}
                                                    {isHovered && trailPoints.length > 1 && (
                                                        <polyline
                                                            points={trailPoints.map(pt => `${pt.x - effectiveX},${pt.y - effectiveY}`).join(' ')}
                                                            fill="none" stroke={p.color} strokeWidth="1" strokeDasharray="3,2" opacity={0.3}
                                                        />
                                                    )}
                                                    {isMoving && (
                                                        <circle cx={0} cy={0} r={9} fill="none" stroke={p.color} strokeWidth="1.5" opacity={0.6} style={{ animation: 'train-pulse-ring 2s ease-out infinite', filter: `drop-shadow(0 0 4px ${p.color})` }} />
                                                    )}
                                                    <circle cx={0} cy={0} r={5.5} fill={p.color} className={`${isAffected ? "stroke-red-500 stroke-2" : "stroke-white dark:stroke-black stroke-[1.5]"} hover:stroke-fgc-green transition-all`} style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))' }}>
                                                        <title>{p.id} - Torn {p.torn} (Via {isAsc ? '1' : '2'}){isMoving ? ' ▶ EN MOVIMENT' : ''}</title>
                                                    </circle>
                                                    {isMoving && (
                                                        <g style={{ transform: `rotate(${arrowAngle}deg)` }}>
                                                            <polygon points="10,0 7,-2.5 7,2.5" fill={p.color} stroke="white" strokeWidth="0.5" />
                                                        </g>
                                                    )}
                                                    <g className="drop-shadow-md">
                                                        <rect x={-(labelWidth / 2)} y={-16} width={labelWidth} height={12} rx={3} fill={p.color} />
                                                        <text x={0} y={-10} textAnchor="middle" dominantBaseline="middle" className="text-[8px] font-bold fill-white uppercase tracking-tighter">{p.id}</text>
                                                        {isMoving && (<circle cx={labelWidth / 2 - 2} cy={-10} r={1.5} fill="#22c55e"><animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" /></circle>)}
                                                    </g>
                                                </g>
                                            );
                                        })}
                                        {(() => {
                                            if (!isGeoTrenEnabled) return null;
                                            return (geoTrenData as import('./hooks/useLiveMapData').GeoTrenEnhanced[])
                                                .map((gt, idx) => {
                                                    const mainLinia = mainLiniaForFilter(gt.lin);
                                                    const color = getLiniaColorHex(mainLinia);
                                                    const utLabel = (gt as any).tipus_unitat || '???';

                                                    // Use pre-computed mapX/mapY from hook
                                                    const x = gt.mapX;
                                                    const y = gt.mapY;
                                                    if (x === 0 && y === 0) return null;

                                                    // Direction offset
                                                    const isAsc = (gt as any).dir === 'A' || (gt as any).dir === 'ASC';
                                                    const yOffset = isAsc ? 7 : -7;

                                                    const hasDelay = gt.delayMin > 1;
                                                    const isHovered = hoveredTrain === `geotren-${gt.id}`;

                                                    return (
                                                        <g
                                                            key={`geotren-${gt.id}-${idx}`}
                                                            className="cursor-pointer group/gt"
                                                            style={{
                                                                // Smooth CSS transition for position changes
                                                                transition: 'transform 1.5s cubic-bezier(0.4, 0, 0.2, 1)',
                                                                transform: `translate(${x}px, ${y + yOffset}px)`,
                                                                transformOrigin: '0 0'
                                                            }}
                                                            onMouseEnter={() => setHoveredTrain(`geotren-${gt.id}`)}
                                                            onMouseLeave={() => setHoveredTrain(null)}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setSelectedGeoTren(gt);
                                                            }}
                                                        >
                                                            {/* Breadcrumb trail — only on hover */}
                                                            {isHovered && gt.trail.length > 1 && gt.trail.slice(0, -1).map((pt, ti) => {
                                                                const opacity = 0.12 + (ti / gt.trail.length) * 0.3;
                                                                const r = 1.2 + (ti / gt.trail.length) * 2;
                                                                return (
                                                                    <circle
                                                                        key={`gt-trail-${gt.id}-${ti}`}
                                                                        cx={pt.x - x}
                                                                        cy={pt.y - (y + yOffset)}
                                                                        r={r}
                                                                        fill={color}
                                                                        opacity={opacity}
                                                                    />
                                                                );
                                                            })}
                                                            {isHovered && gt.trail.length > 1 && (
                                                                <polyline
                                                                    points={gt.trail.map(pt => `${pt.x - x},${pt.y - (y + yOffset)}`).join(' ')}
                                                                    fill="none"
                                                                    stroke={color}
                                                                    strokeWidth="1"
                                                                    strokeDasharray="2,2"
                                                                    opacity={0.35}
                                                                />
                                                            )}

                                                            {/* Movement pulse ring */}
                                                            {gt.isMoving && (
                                                                <circle
                                                                    cx={0} cy={0} r={12}
                                                                    fill="none"
                                                                    stroke={color}
                                                                    strokeWidth="1.5"
                                                                    opacity={0.5}
                                                                    style={{ animation: 'train-pulse-ring 2.5s ease-out infinite' }}
                                                                />
                                                            )}

                                                            {/* Main dot */}
                                                            <circle
                                                                cx={0} cy={0} r={8}
                                                                fill={color}
                                                                stroke="white"
                                                                strokeWidth="2.5"
                                                                className="drop-shadow-md group-hover/gt:r-10 transition-all"
                                                                style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
                                                            />

                                                            {/* Direction arrow */}
                                                            {gt.nextStMapId && gt.isMoving && (() => {
                                                                const nextSt = MAP_STATIONS.find(s => s.id === gt.nextStMapId);
                                                                if (!nextSt) return null;
                                                                const dx = nextSt.x - x;
                                                                const dy = (nextSt.y + yOffset) - (y + yOffset);
                                                                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                                                                return (
                                                                    <g style={{ transform: `rotate(${angle}deg)` }}>
                                                                        <polygon points="13,0 10,-2.5 10,2.5" fill={color} stroke="white" strokeWidth="0.5" />
                                                                    </g>
                                                                );
                                                            })()}

                                                            {/* Label */}
                                                            <rect x={-12} y={-22} width={24} height={12} rx={4} fill="rgba(0,0,0,0.75)" />
                                                            <text
                                                                x={0} y={-13}
                                                                textAnchor="middle"
                                                                className="text-[8px] font-bold fill-white pointer-events-none"
                                                            >
                                                                {utLabel}
                                                            </text>

                                                            {/* Delay badge */}
                                                            {hasDelay && (
                                                                <>
                                                                    <circle cx={9} cy={-18} r={5} fill="#ef4444" stroke="white" strokeWidth="1" />
                                                                    <text x={9} y={-15} textAnchor="middle" className="text-[5px] font-black fill-white pointer-events-none">
                                                                        +{gt.delayMin}'
                                                                    </text>
                                                                </>
                                                            )}
                                                        </g>
                                                    );
                                                });
                                        })()}

                                        {/* Parked Units */}
                                        {/* Parked Units - REMOVED PER USER REQUEST (Blue dots superimposing) */}
                                        {/* 
                                        {parkedUnits.map((u, i) => {
                                            const st = MAP_STATIONS.find(s => s.id === u.depot_id);
                                            if (!st) return null;
                                            let px = st.x;
                                            let py = st.y;
                                            if (u.depot_id === 'PC') {
                                                const trackIdx = parseInt(u.track) - 1;
                                                const ys = [84, 92, 100, 108, 116];
                                                px = -25;
                                                py = ys[trackIdx] || 100;
                                            } else {
                                                px += 6; py -= 6;
                                            }
                                            return (
                                                <g key={`main-parked-${u.unit_number}-${i}`}>
                                                    <circle cx={px} cy={py} r={2.5} fill="#3b82f6" stroke="white" strokeWidth="0.5" className="animate-pulse" />
                                                    <text x={px} y={py - 4} textAnchor="middle" className="text-[4px] font-bold fill-blue-500 uppercase">{u.unit_number}</text>
                                                </g>
                                            );
                                        })} 
                                        */}
                                    </svg>
                                </div>
                            </TransformComponent>
                        </>
                    )}
                </TransformWrapper>
                {/* Mini-map removed as per user request */}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4 px-2 mt-6 pt-6 border-t border-gray-100 dark:border-white/5">
                {Object.entries(LINE_COLORS).filter(([k]) => k !== 'M').map(([key, config]) => (
                    <div key={key} className="flex items-center gap-3 group cursor-default">
                        <div className="w-3.5 h-3.5 rounded-full shadow-lg shadow-black/5" style={{ backgroundColor: config.hex }} />
                        <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 tracking-widest group-hover:text-fgc-grey dark:group-hover:text-white transition-colors">
                            {config.label}
                        </span>
                    </div>
                ))}
                <div className="flex items-center gap-3 group cursor-default">
                    <div className="w-8 h-1 rounded-full border-t-2 border-dashed border-gray-200 dark:border-white/10" />
                    <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 tracking-widest group-hover:text-fgc-grey dark:group-hover:text-white transition-colors">
                        Maniobres
                    </span>
                </div>
                <div className="flex-1 min-w-[40px]" />
                <div className="flex items-center gap-6 text-[9px] font-bold text-gray-300 dark:text-gray-600 uppercase tracking-[0.15em] italic">
                    <div className="flex items-center gap-2"><Move size={12} /> Arrossega</div>
                    <div className="flex items-center gap-2"><ZoomIn size={12} /> Zoom</div>
                    <div className="flex items-center gap-2"><Activity size={12} /> Detalls</div>
                </div>
            </div>

            {/* Portal-based Modals for whole-screen coverage */}
            {typeof document !== 'undefined' && createPortal(
                <>
                    {selectedTrain && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setSelectedTrain(null)}>
                            <div onClick={(e) => e.stopPropagation()} className="max-w-full">
                                <TrainInspectorPopup
                                    train={selectedTrain}
                                    onClose={() => setSelectedTrain(null)}
                                    onOpenRoute={(trainId) => {
                                        if (setQuery && handleSearchCirculation) {
                                            setQuery(trainId);
                                            handleSearchCirculation();
                                            setSelectedTrain(null);
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {selectedGeoTren && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setSelectedGeoTren(null)}>
                            <div onClick={(e) => e.stopPropagation()} className="max-w-full">
                                <GeoTrenInspectorPopup
                                    gt={selectedGeoTren}
                                    onClose={() => setSelectedGeoTren(null)}
                                />
                            </div>
                        </div>
                    )}
                </>,
                document.body
            )}

            {/* Modals and Overlays */}
            {/* RE Diagram (Reina Elisenda - DIPÒSIT) */}
            <DepotModal
                isOpen={openDiagram === 'RE_DEPOT'}
                onClose={() => setOpenDiagram(null)}
                title="Dipòsit Reina Elisenda"
                depotId="RE"
                tracks={[1, 2]}
                variant="reina_elisenda"
                parkedUnits={parkedUnits}
                onParkedUnitsChange={onParkedUnitsChange}
                isSyncing={depotSyncing}
                setSyncing={setDepotSyncing}
            />

            {/* RB Diagram (Rubí COR) */}
            <DepotModal
                isOpen={openDiagram === 'RB_DEPOT'}
                onClose={() => setOpenDiagram(null)}
                title="Centre d'Operacions de Rubí (COR)"
                depotId="RB"
                tracks={[4, 6, 8, 10]}
                variant="rubi"
                parkedUnits={parkedUnits}
                onParkedUnitsChange={onParkedUnitsChange}
                isSyncing={depotSyncing}
                setSyncing={setDepotSyncing}
            />

            {/* NA Diagram (Terrassa) */}
            <DepotModal
                isOpen={openDiagram === 'NA_DEPOT'}
                onClose={() => setOpenDiagram(null)}
                title="Estació i Dipòsit Terrassa Nacions Unides"
                depotId="NA"
                tracks={[1, 2, 3, 4]}
                variant="can_roca"
                parkedUnits={parkedUnits}
                onParkedUnitsChange={onParkedUnitsChange}
                isSyncing={depotSyncing}
                setSyncing={setDepotSyncing}
            />

            {/* PN Diagram (Sabadell) */}
            <DepotModal
                isOpen={openDiagram === 'PN_DEPOT'}
                onClose={() => setOpenDiagram(null)}
                title="Estació i Dipòsit Sabadell Parc del Nord"
                depotId="PN"
                tracks={[1, 2, 3]}
                variant="ca_n_oriach"
                parkedUnits={parkedUnits}
                onParkedUnitsChange={onParkedUnitsChange}
                isSyncing={depotSyncing}
                setSyncing={setDepotSyncing}
            />

            {/* Modal Diagrama SR (Sarrià) */}
            {openDiagram === 'SR' && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-[#121212] p-8 rounded-[40px] border border-white/10 shadow-2xl max-w-4xl w-full relative overflow-hidden ring-1 ring-white/20">
                        <button onClick={() => setOpenDiagram(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full">
                            <X size={20} />
                        </button>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse ring-4 ring-blue-500/20" />
                            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Esquema de Vies - Sarrià</h2>
                        </div>

                        <div className="bg-black/60 rounded-3xl p-8 border border-white/5 relative">
                            <svg viewBox="0 0 800 350" className="w-full h-auto">
                                <line x1="50" y1="230" x2="750" y2="230" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="50" y="245" fill="#4D5358" className="text-[12px] font-bold opacity-60">V1</text>
                                <line x1="50" y1="300" x2="750" y2="300" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="50" y="315" fill="#4D5358" className="text-[12px] font-bold opacity-60">V2</text>
                                <line x1="50" y1="160" x2="620" y2="160" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="160" y="152" fill="#4D5358" className="text-[10px] font-bold opacity-60">V4 (L12)</text>
                                <line x1="280" y1="100" x2="350" y2="100" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="290" y="92" fill="#4D5358" className="text-[12px] font-bold opacity-60">V6</text>
                                <line x1="180" y1="40" x2="250" y2="40" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="190" y="32" fill="#4D5358" className="text-[12px] font-bold opacity-60">V8</text>
                                <line x1="120" y1="300" x2="200" y2="230" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
                                <line x1="350" y1="100" x2="410" y2="160" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 2" />
                                <line x1="250" y1="40" x2="310" y2="100" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 2" />
                                <line x1="280" y1="230" x2="340" y2="160" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
                                <line x1="560" y1="160" x2="620" y2="230" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
                                <line x1="640" y1="265" x2="750" y2="265" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="680" y="260" fill="#4D5358" className="text-[12px] font-bold opacity-60">V0</text>
                                <line x1="580" y1="230" x2="640" y2="265" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
                                <line x1="580" y1="300" x2="640" y2="265" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
                                <line x1="700" y1="160" x2="780" y2="80" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                                <text x="760" y="70" fill="#fbbf24" className="text-[10px] font-bold uppercase">RE (L12)</text>
                                <rect x="350" y="250" width="180" height="20" fill="#4D5358" rx="2" />
                                <text x="440" y="263" textAnchor="middle" fill="#999" className="text-[8px] font-bold uppercase">Andana S1/S2</text>
                                <rect x="350" y="180" width="180" height="20" fill="#4D5358" rx="2" />
                                <text x="440" y="193" textAnchor="middle" fill="#999" className="text-[8px] font-bold uppercase">Andana L12</text>
                                <text x="60" y="275" textAnchor="middle" fill="#666" className="text-[9px] font-bold uppercase tracking-widest">← Tres Torres</text>
                                <text x="700" y="330" textAnchor="middle" fill="#666" className="text-[9px] font-bold uppercase tracking-widest">Peu Funicular →</text>
                                <text x="440" y="330" textAnchor="middle" fill="#AAA" className="text-[12px] font-bold uppercase tracking-[0.4em]">SARRIÀ</text>
                                {liveData.filter(p => (p.stationId === 'SR' || p.stationId === 'S0') && p.type === 'TRAIN').map((p, idx) => {
                                    const numId = parseInt(p.id.replace(/\D/g, ''));
                                    const isMSR = p.linia === 'MSR' || p.stationId === 'S0';
                                    const isL12 = p.linia === 'L12';
                                    const isV1 = numId % 2 !== 0;

                                    let trainY = isV1 ? 300 : 230;
                                    let cxValue = 440;

                                    if (isL12) {
                                        trainY = 160;
                                    }

                                    if (isMSR) {
                                        trainY = 265;
                                        cxValue = 695;
                                    } else {
                                        if (p.x < 228) {
                                            const dist = 230 - p.x;
                                            const progress = Math.min(1, dist / 30);
                                            cxValue = 440 - (progress * 380);
                                        } else if (p.x > 232) {
                                            const dist = p.x - 230;
                                            const progress = Math.min(1, dist / 30);
                                            cxValue = 440 + (progress * 300);
                                        }
                                    }

                                    return (
                                        <g key={`sr-train-${p.id}`} className="transition-all duration-1000 ease-linear">
                                            <circle cx={cxValue} cy={trainY} r={12} fill={p.color} stroke="white" strokeWidth="3" className="drop-shadow-lg" />
                                            <text x={cxValue} y={trainY - 18} textAnchor="middle" className="text-[12px] font-bold fill-white drop-shadow-md">{p.id}</text>
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                        <div className="mt-8 flex justify-end">
                            <button onClick={() => setOpenDiagram(null)} className="px-12 py-5 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border border-white/10 hover:border-white/20 shadow-xl ring-1 ring-white/5">Tancar Esquema</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Diagrama TB (Av. Tibidabo) */}
            {openDiagram === 'TB' && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-[#121212] p-8 rounded-[40px] border border-white/10 shadow-2xl max-w-4xl w-full relative overflow-hidden ring-1 ring-white/20">
                        <button onClick={() => setOpenDiagram(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full">
                            <X size={20} />
                        </button>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-3 h-3 rounded-full bg-blue-600 animate-pulse ring-4 ring-blue-600/20" />
                            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Esquema de Vies - Av. Tibidabo</h2>
                        </div>
                        <div className="bg-black/60 rounded-3xl p-8 border border-white/5 relative">
                            <svg viewBox="0 0 600 200" className="w-full h-auto">
                                <line x1="30" y1="70" x2="100" y2="70" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="35" y="62" fill="#4D5358" className="text-[10px] font-bold opacity-60">V2</text>
                                <line x1="30" y1="130" x2="550" y2="130" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="35" y="145" fill="#4D5358" className="text-[10px] font-bold opacity-60">V1</text>
                                <line x1="100" y1="70" x2="180" y2="130" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                                <text x="135" y="95" fill="#fbbf24" className="text-[8px] font-bold uppercase">VA</text>
                                <rect x="280" y="95" width="240" height="15" fill="#4D5358" rx="2" />
                                <text x="400" y="106" textAnchor="middle" fill="#999" className="text-[7px] font-bold uppercase tracking-widest">Andana 1</text>
                                <rect x="280" y="150" width="240" height="15" fill="#4D5358" rx="2" />
                                <text x="400" y="161" textAnchor="middle" fill="#999" className="text-[7px] font-bold uppercase tracking-widest">Andana 2</text>
                                <text x="400" y="135" textAnchor="middle" fill="#999" className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40">Av. Tibidabo</text>
                                <line x1="550" y1="120" x2="550" y2="140" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" />
                                <text x="40" y="110" textAnchor="middle" fill="#666" className="text-[10px] font-bold uppercase tracking-widest">← El Putxet</text>
                                {liveData.filter(p => p.stationId === 'TB' && p.type === 'TRAIN').map((p, idx) => {
                                    const numId = parseInt(p.id.replace(/\D/g, ''));
                                    const trainY = 130;
                                    let cxValue = 510;
                                    if (p.x < 118) {
                                        const progress = Math.min(1, (120 - p.x) / 10);
                                        cxValue = 510 - (progress * 350);
                                    }
                                    return (
                                        <g key={`tb-train-${p.id}`} className="transition-all duration-1000 ease-linear">
                                            <circle cx={cxValue} cy={trainY} r={10} fill={p.color} stroke="white" strokeWidth="3" className="drop-shadow-lg" />
                                            <text x={cxValue} y={trainY - 15} textAnchor="middle" className="text-[11px] font-bold fill-white drop-shadow-md">{p.id}</text>
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                        <div className="mt-8 flex justify-end">
                            <button onClick={() => setOpenDiagram(null)} className="px-10 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border border-white/10 hover:border-white/20 shadow-xl">Tancar Esquema</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Diagrama BN (La Bonanova) */}
            {openDiagram === 'BN' && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-[#121212] p-8 rounded-[40px] border border-white/10 shadow-2xl max-w-4xl w-full relative overflow-hidden ring-1 ring-white/20">
                        <button onClick={() => setOpenDiagram(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full">
                            <X size={20} />
                        </button>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse ring-4 ring-blue-500/20" />
                            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Esquema de Vies - La Bonanova</h2>
                        </div>
                        <div className="bg-black/60 rounded-3xl p-8 border border-white/5 relative">
                            <svg viewBox="0 0 600 200" className="w-full h-auto">
                                <line x1="50" y1="60" x2="550" y2="60" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="50" y="55" fill="#4D5358" className="text-[12px] font-bold opacity-60">V2</text>
                                <line x1="50" y1="140" x2="550" y2="140" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="50" y="155" fill="#4D5358" className="text-[12px] font-bold opacity-60">V1</text>
                                <rect x="350" y="35" width="160" height="15" fill="#4D5358" rx="2" />
                                <rect x="350" y="150" width="160" height="15" fill="#4D5358" rx="2" />
                                <text x="430" y="105" textAnchor="middle" fill="#999" className="text-[10px] font-bold uppercase">La Bonanova</text>
                                <line x1="120" y1="140" x2="180" y2="60" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                                <line x1="200" y1="60" x2="260" y2="140" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                                <text x="40" y="100" textAnchor="middle" fill="#666" className="text-[10px] font-bold uppercase tracking-widest">← Muntaner</text>
                                <text x="560" y="100" textAnchor="middle" fill="#666" className="text-[10px] font-bold uppercase tracking-widest">Sarrià →</text>
                                {liveData.filter(p => p.stationId === 'BN' && p.type === 'TRAIN').map((p, idx) => {
                                    const numId = parseInt(p.id.replace(/\D/g, ''));
                                    const isAsc = numId % 2 !== 0;
                                    const trainY = isAsc ? 140 : 60;
                                    let cxValue = 430;
                                    return (
                                        <g key={`bn-train-${p.id}`} className="transition-all duration-1000 ease-linear">
                                            <circle cx={cxValue} cy={trainY} r={10} fill={p.color} stroke="white" strokeWidth="3" className="drop-shadow-lg" />
                                            <text x={cxValue} y={trainY - 15} textAnchor="middle" className="text-[11px] font-bold fill-white drop-shadow-md">{p.id}</text>
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                        <div className="mt-8 flex justify-end">
                            <button onClick={() => setOpenDiagram(null)} className="px-10 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border border-white/10 hover:border-white/20 shadow-xl">Tancar Esquema</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Diagrama PM (Pl. Molina) */}
            {openDiagram === 'PM' && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-[#121212] p-8 rounded-[40px] border border-white/10 shadow-2xl max-w-4xl w-full relative overflow-hidden ring-1 ring-white/20">
                        <button onClick={() => setOpenDiagram(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full">
                            <X size={20} />
                        </button>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-3 h-3 rounded-full bg-orange-500 animate-pulse ring-4 ring-orange-500/20" />
                            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Esquema de Vies - Pl. Molina</h2>
                        </div>
                        <div className="bg-black/60 rounded-3xl p-8 border border-white/5 relative">
                            <svg viewBox="0 0 600 200" className="w-full h-auto">
                                <line x1="50" y1="60" x2="550" y2="60" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="30" y="55" fill="#4D5358" className="text-[10px] font-bold opacity-60">V4 (L7 GR)</text>
                                <text x="300" y="55" textAnchor="middle" fill="#4D5358" className="text-[12px] font-bold opacity-60">V2</text>
                                <line x1="50" y1="140" x2="550" y2="140" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="30" y="158" fill="#4D5358" className="text-[10px] font-bold opacity-60">V3 (L7 GR)</text>
                                <text x="300" y="170" textAnchor="middle" fill="#4D5358" className="text-[12px] font-bold opacity-60">V1</text>
                                <rect x="230" y="35" width="140" height="15" fill="#4D5358" rx="2" />
                                <rect x="230" y="150" width="140" height="15" fill="#4D5358" rx="2" />
                                <text x="300" y="105" textAnchor="middle" fill="#666" className="text-[10px] font-bold uppercase">Pl. Molina</text>
                                <line x1="120" y1="140" x2="180" y2="60" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                                <line x1="420" y1="60" x2="480" y2="140" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                                <text x="40" y="100" textAnchor="middle" fill="#666" className="text-[10px] font-bold uppercase tracking-widest">← Gràcia</text>
                                <text x="560" y="100" textAnchor="middle" fill="#666" className="text-[10px] font-bold uppercase tracking-widest">Pàdua →</text>
                                {liveData.filter(p => p.stationId === 'PM' && p.type === 'TRAIN').map((p, idx) => {
                                    const numId = parseInt(p.id.replace(/\D/g, ''));
                                    const isAsc = numId % 2 !== 0;
                                    const trainY = isAsc ? 140 : 60;
                                    let cxValue = 300;
                                    if (p.x > 102) {
                                        const progress = Math.min(1, (p.x - 100) / 30);
                                        cxValue = 300 + (progress * 250);
                                    } else if (p.x < 98) {
                                        const progress = Math.min(1, (100 - p.x) / 30);
                                        cxValue = 300 - (progress * 250);
                                    }
                                    return (
                                        <g key={`pm-train-${p.id}`} className="transition-all duration-1000 ease-linear">
                                            <circle cx={cxValue} cy={trainY} r={10} fill={p.color} stroke="white" strokeWidth="3" className="drop-shadow-lg" />
                                            <text x={cxValue} y={trainY - 15} textAnchor="middle" className="text-[11px] font-bold fill-white drop-shadow-md">{p.id}</text>
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                        <div className="mt-8 flex justify-end">
                            <button onClick={() => setOpenDiagram(null)} className="px-10 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border border-white/10 hover:border-white/20 shadow-xl">Tancar Esquema</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Diagrama GR (Gràcia) */}
            {openDiagram === 'GR' && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-[#121212] p-8 rounded-[40px] border border-white/10 shadow-2xl max-w-5xl w-full relative overflow-hidden ring-1 ring-white/20">
                        <button onClick={() => setOpenDiagram(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full">
                            <X size={20} />
                        </button>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-3 h-3 rounded-full bg-fgc-green animate-pulse ring-4 ring-fgc-green/20" />
                            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Esquema de Vies - Gràcia</h2>
                        </div>
                        <div className="bg-black/60 rounded-3xl p-8 border border-white/5 relative">
                            <svg viewBox="0 0 800 350" className="w-full h-auto">
                                <line x1="260" y1="60" x2="550" y2="60" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="270" y="52" fill="#4D5358" className="text-[10px] font-bold opacity-60">V4 (L7)</text>
                                <line x1="50" y1="120" x2="750" y2="120" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="60" y="112" fill="#4D5358" className="text-[10px] font-bold opacity-60">V2</text>
                                <line x1="50" y1="180" x2="750" y2="180" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="60" y="195" fill="#4D5358" className="text-[10px] font-bold opacity-60">V1</text>
                                <line x1="260" y1="240" x2="550" y2="240" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="270" y="255" fill="#4D5358" className="text-[10px] font-bold opacity-60">V3 (L7)</text>
                                <rect x="280" y="82.5" width="240" height="15" fill="#4D5358" rx="2" />
                                <text x="400" y="93" textAnchor="middle" fill="#999" className="text-[8px] font-bold uppercase">Andana V4-V2</text>
                                <rect x="280" y="202.5" width="240" height="15" fill="#4D5358" rx="2" />
                                <text x="400" y="213" textAnchor="middle" fill="#999" className="text-[8px] font-bold uppercase">Andana V1-V3</text>
                                <line x1="80" y1="120" x2="120" y2="180" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                                <line x1="140" y1="180" x2="180" y2="120" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                                <line x1="220" y1="120" x2="260" y2="60" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                                <line x1="220" y1="180" x2="260" y2="240" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                                <line x1="550" y1="60" x2="590" y2="0" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                                <text x="600" y="20" fill="#fbbf24" className="text-[10px] font-bold uppercase tracking-widest">L7 Molina</text>
                                <line x1="550" y1="240" x2="590" y2="300" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                                <text x="40" y="150" textAnchor="middle" fill="#666" className="text-[10px] font-bold uppercase tracking-widest">← PC</text>
                                <text x="760" y="150" textAnchor="middle" fill="#666" className="text-[10px] font-bold uppercase tracking-widest">Sarrià →</text>
                                {liveData.filter(p => p.stationId === 'GR' && p.type === 'TRAIN').map((p, idx) => {
                                    const numId = parseInt(p.id.replace(/\D/g, ''));
                                    const isAsc = numId % 2 !== 0;

                                    let trainY = isAsc ? 180 : 120;
                                    if (p.linia === 'L7') trainY = isAsc ? 240 : 60;

                                    let cxValue = 350;
                                    if (p.x > 82) {
                                        const progress = Math.min(1, (p.x - 80) / 30);
                                        cxValue = 350 + (progress * 350);
                                    } else if (p.x < 78) {
                                        const progress = Math.min(1, (80 - p.x) / 30);
                                        cxValue = 350 - (progress * 300);
                                    }

                                    return (
                                        <g key={`gr-train-${p.id}`} className="transition-all duration-1000 ease-linear">
                                            <circle cx={cxValue} cy={trainY} r={10} fill={p.color} stroke="white" strokeWidth="3" className="drop-shadow-lg" />
                                            <text x={cxValue} y={trainY - 15} textAnchor="middle" className="text-[11px] font-bold fill-white drop-shadow-md">{p.id}</text>
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                        <div className="mt-8 flex justify-end">
                            <button onClick={() => setOpenDiagram(null)} className="px-10 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border border-white/10 hover:border-white/20 shadow-xl">Tancar Esquema</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Diagrama PR (Provença) */}
            {openDiagram === 'PR' && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-[#121212] p-8 rounded-[40px] border border-white/10 shadow-2xl max-w-4xl w-full relative overflow-hidden ring-1 ring-white/20">
                        <button onClick={() => setOpenDiagram(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full">
                            <X size={20} />
                        </button>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse ring-4 ring-blue-500/20" />
                            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Esquema de Vies - Provença</h2>
                        </div>
                        <div className="bg-black/60 rounded-3xl p-8 border border-white/5 relative">
                            <svg viewBox="0 0 600 200" className="w-full h-auto">
                                <line x1="50" y1="60" x2="550" y2="60" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="30" y="65" fill="#4D5358" className="text-[12px] font-bold opacity-60">V2</text>
                                <line x1="50" y1="140" x2="550" y2="140" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="30" y="145" fill="#4D5358" className="text-[12px] font-bold opacity-60">V1</text>
                                <rect x="200" y="35" width="200" height="15" fill="#4D5358" rx="2" />
                                <rect x="200" y="150" width="200" height="15" fill="#4D5358" rx="2" />
                                <text x="300" y="25" textAnchor="middle" fill="#666" className="text-[9px] font-bold uppercase">Andana V2</text>
                                <text x="300" y="180" textAnchor="middle" fill="#666" className="text-[9px] font-bold uppercase">Andana V1</text>
                                <line x1="120" y1="60" x2="180" y2="140" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                                <text x="40" y="100" textAnchor="middle" fill="#666" className="text-[10px] font-bold uppercase tracking-widest">← PC</text>
                                <text x="560" y="100" textAnchor="middle" fill="#666" className="text-[10px] font-bold uppercase tracking-widest">Gràcia →</text>
                                {liveData.filter(p => p.stationId === 'PR' && p.type === 'TRAIN').map((p, idx) => {
                                    const numId = parseInt(p.id.replace(/\D/g, ''));
                                    const isAsc = numId % 2 !== 0;
                                    const trainY = isAsc ? 140 : 60;

                                    let cxValue = 300;
                                    if (p.x > 52) {
                                        const progress = Math.min(1, (p.x - 50) / 30);
                                        cxValue = 300 + (progress * 250);
                                    } else if (p.x < 48) {
                                        const progress = Math.min(1, (50 - p.x) / 30);
                                        cxValue = 300 - (progress * 250);
                                    }

                                    return (
                                        <g key={`pr-train-${p.id}`} className="transition-all duration-1000 ease-linear">
                                            <circle cx={cxValue} cy={trainY} r={10} fill={p.color} stroke="white" strokeWidth="3" className="drop-shadow-lg" />
                                            <text x={cxValue} y={trainY - 15} textAnchor="middle" className="text-[11px] font-bold fill-white drop-shadow-md">{p.id}</text>
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                        <div className="mt-8 flex justify-end">
                            <button onClick={() => setOpenDiagram(null)} className="px-10 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border border-white/10 hover:border-white/20 shadow-xl">Tancar Esquema</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Diagrama PC */}
            {openDiagram === 'PC' && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-[#121212] p-8 rounded-[40px] border border-white/10 shadow-2xl max-w-4xl w-full relative overflow-hidden ring-1 ring-white/20">
                        <button onClick={() => setOpenDiagram(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full">
                            <X size={20} />
                        </button>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse ring-4 ring-red-500/20" />
                            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Esquema de Vies - Pl. Catalunya</h2>
                        </div>
                        <div className="bg-black/60 rounded-3xl p-8 border border-white/5 relative">
                            <svg viewBox="0 0 600 320" className="w-full h-auto">
                                <line x1="105" y1="50" x2="105" y2="70" stroke="#ef4444" strokeWidth="5" />
                                <line x1="105" y1="100" x2="105" y2="120" stroke="#ef4444" strokeWidth="5" />
                                <line x1="105" y1="150" x2="105" y2="170" stroke="#ef4444" strokeWidth="5" />
                                <line x1="105" y1="200" x2="105" y2="220" stroke="#ef4444" strokeWidth="5" />
                                <line x1="105" y1="260" x2="105" y2="280" stroke="#ef4444" strokeWidth="5" />
                                <line x1="550" y1="60" x2="105" y2="60" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="70" y="65" fill="#4D5358" className="text-[14px] font-bold opacity-60">V1</text>
                                <line x1="550" y1="110" x2="105" y2="110" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="70" y="115" fill="#4D5358" className="text-[14px] font-bold opacity-60">V2</text>
                                <line x1="210" y1="60" x2="160" y2="110" stroke="#fbbf24" strokeWidth="2.5" />
                                <line x1="160" y1="60" x2="210" y2="110" stroke="#fbbf24" strokeWidth="2.5" />
                                <line x1="430" y1="110" x2="480" y2="60" stroke="#fbbf24" strokeWidth="2" />
                                <path d="M 340 110 L 290 160 L 105 160" fill="none" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="70" y="165" fill="#4D5358" className="text-[14px] font-bold opacity-60">V3</text>
                                <path d="M 410 110 L 310 210 L 105 210" fill="none" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="70" y="215" fill="#4D5358" className="text-[14px] font-bold opacity-60">V4</text>
                                <path d="M 230 210 L 170 270 L 105 270" fill="none" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                                <text x="70" y="275" fill="#4D5358" className="text-[14px] font-bold opacity-60">V5</text>
                                <text x="480" y="40" fill="#666" className="text-[9px] uppercase font-bold tracking-widest text-right">Provença →</text>
                                {liveData.filter(p => p.stationId === 'PC' && p.type === 'TRAIN').map((p, idx) => {
                                    const isStationed = p.x <= 20.5;
                                    let cxValue = 125;
                                    if (!isStationed) {
                                        const progress = Math.min(1, Math.max(0, (p.x - 20) / 30));
                                        cxValue = 125 + progress * 425;
                                    }
                                    const trackMap: Record<string, { y: number, label: string }> = {
                                        "1": { y: 60, label: "V1" },
                                        "2": { y: 110, label: "V2" },
                                        "3": { y: 160, label: "V3" },
                                        "4": { y: 210, label: "V4" },
                                        "5": { y: 270, label: "V5" },
                                        "V1": { y: 60, label: "V1" },
                                        "V2": { y: 110, label: "V2" },
                                        "V3": { y: 160, label: "V3" },
                                        "V4": { y: 210, label: "V4" },
                                        "V5": { y: 270, label: "V5" }
                                    };

                                    let targetVia = p.final === 'PC' ? p.via_final : p.via_inici;
                                    let trackInfo = targetVia ? trackMap[targetVia.trim().toUpperCase()] : null;
                                    if (!trackInfo) {
                                        const fallbackTracks = [
                                            { y: 60, label: "V1" }, { y: 110, label: "V2" }, { y: 160, label: "V3" }, { y: 210, label: "V4" }, { y: 270, label: "V5" }
                                        ];
                                        trackInfo = fallbackTracks[idx % 5];
                                    }

                                    const Y_V1 = 60;
                                    const Y_V2 = 110;
                                    const Y_V3 = 160;
                                    const Y_V4 = 210;
                                    const Y_V5 = 270;

                                    let trainY = trackInfo.y;
                                    const trackLabel = trackInfo.label;

                                    if (!isStationed) {
                                        const numId = parseInt(p.id.replace(/\D/g, ''));
                                        const isAsc = numId % 2 !== 0;

                                        if (isAsc) {
                                            if (trackLabel === "V5") {
                                                if (cxValue >= 170 && cxValue <= 230) {
                                                    const pV5 = (cxValue - 170) / 60;
                                                    trainY = Y_V5 - (pV5 * (Y_V5 - Y_V4));
                                                } else if (cxValue > 230) trainY = Y_V4;
                                            }
                                            if (trackLabel === "V4" || (trackLabel === "V5" && cxValue > 230)) {
                                                if (cxValue >= 310 && cxValue <= 410) {
                                                    const pV4 = (cxValue - 310) / 100;
                                                    trainY = Y_V4 - (pV4 * (Y_V4 - Y_V2));
                                                } else if (cxValue > 410) trainY = Y_V2;
                                            }
                                            if (trackLabel === "V3") {
                                                if (cxValue >= 290 && cxValue <= 340) {
                                                    const pV3 = (cxValue - 290) / 50;
                                                    trainY = Y_V3 - (pV3 * (Y_V3 - Y_V2));
                                                } else if (cxValue > 340) trainY = Y_V2;
                                            }
                                            if (trackLabel === "V1") trainY = Y_V1;
                                            if (trackLabel === "V2" && cxValue < 410) trainY = Y_V2;

                                            if (cxValue >= 160 && cxValue <= 210) {
                                                const pCross = (cxValue - 160) / 50;
                                                if (trackLabel === "V1") {
                                                    trainY = Y_V1 + (pCross * (Y_V2 - Y_V1));
                                                } else {
                                                    trainY = Y_V2 - (pCross * (Y_V2 - Y_V1));
                                                }
                                            } else if (cxValue > 210) {
                                                trainY = (trackLabel === "V1") ? Y_V2 : Y_V1;
                                            }
                                        } else {
                                            trainY = Y_V1;

                                            if (trackLabel !== "V1") {
                                                if (cxValue >= 430 && cxValue <= 480) {
                                                    const pGate = (480 - cxValue) / 50;
                                                    trainY = Y_V1 + (pGate * (Y_V2 - Y_V1));
                                                } else if (cxValue < 430) {
                                                    trainY = Y_V2;
                                                }
                                            }

                                            if (cxValue >= 160 && cxValue <= 210) {
                                                const pCross = (210 - cxValue) / 50;
                                                if (trackLabel === "V1") {
                                                    trainY = Y_V2 - (pCross * (Y_V2 - Y_V1));
                                                } else {
                                                    trainY = Y_V1 + (pCross * (Y_V2 - Y_V1));
                                                }
                                            } else if (cxValue < 160) {
                                                if (trackLabel === "V1") trainY = Y_V1;
                                                else {
                                                    trainY = Y_V2;
                                                    if (trackLabel === "V3" && cxValue < 340) {
                                                        const pV3 = (340 - cxValue) / 50;
                                                        trainY = Y_V2 + (Math.min(1, pV3) * (Y_V3 - Y_V2));
                                                    }
                                                    if ((trackLabel === "V4" || trackLabel === "V5") && cxValue < 410) {
                                                        const pV4 = (410 - cxValue) / 100;
                                                        trainY = Y_V2 + (Math.min(1, pV4) * (Y_V4 - Y_V2));
                                                        if (trackLabel === "V5" && cxValue < 230) {
                                                            const pV5 = (230 - cxValue) / 60;
                                                            trainY = Y_V4 + (Math.min(1, pV5) * (Y_V5 - Y_V4));
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    } else if (trackLabel === "V1") { trainY = Y_V1; }
                                    else if (trackLabel === "V2") { trainY = Y_V2; }
                                    else if (trackLabel === "V3") { trainY = Y_V3; }
                                    else if (trackLabel === "V4") { trainY = Y_V4; }
                                    else if (trackLabel === "V5") { trainY = Y_V5; }

                                    return (
                                        <g key={`pc-train-${p.id}`} className="animate-in fade-in zoom-in duration-500">
                                            <circle cx={cxValue} cy={trainY} r={8} fill={p.color} stroke="white" strokeWidth="2" className="drop-shadow-lg" />
                                            <text x={cxValue} y={trainY - 12} textAnchor="middle" className="text-[10px] font-bold fill-white drop-shadow-md">{p.id}</text>
                                        </g>
                                    );
                                })}

                                {parkedUnits.filter(u => u.depot_id === 'PC').map((u, i) => {
                                    const trackMap: Record<string, number> = { "1": 60, "2": 110, "3": 160, "4": 210, "5": 270 };
                                    const trainY = trackMap[u.track] || 60;
                                    return (
                                        <g key={`parked-pc-${u.unit_number}-${i}`} className="animate-in fade-in zoom-in duration-500">
                                            <circle cx={135} cy={trainY} r={8} fill="#3b82f6" stroke="white" strokeWidth="2" className="drop-shadow-lg" />
                                            <text x={135} y={trainY - 12} textAnchor="middle" className="text-[9px] font-bold fill-blue-400 drop-shadow-md">{u.unit_number}</text>
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                        <div className="mt-8 border-t border-white/5 pt-8">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.2em]">Gestió de Dipòsit (Unitats Estacionades)</h3>
                                <div className="flex gap-2">
                                    <input
                                        id="pc-unit-input"
                                        type="text"
                                        placeholder="Unitat (ex: 112.10)"
                                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-white focus:ring-2 focus:ring-blue-500/50 outline-none w-40 uppercase"
                                    />
                                    <select
                                        id="pc-via-select"
                                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-white focus:ring-2 focus:ring-blue-500/50 outline-none w-24"
                                    >
                                        {[1, 2, 3, 4, 5].map(v => <option key={v} value={v} className="bg-[#121212]">Via {v}</option>)}
                                    </select>
                                    <button
                                        onClick={async () => {
                                            const unitInput = document.getElementById('pc-unit-input') as HTMLInputElement;
                                            const viaSelect = document.getElementById('pc-via-select') as HTMLSelectElement;
                                            if (unitInput.value) {
                                                setDepotSyncing(true);
                                                await supabase.from('parked_units').upsert({
                                                    unit_number: unitInput.value.toUpperCase(),
                                                    depot_id: 'PC',
                                                    track: viaSelect.value,
                                                    updated_at: new Date().toISOString()
                                                });
                                                unitInput.value = '';
                                                setDepotSyncing(false);
                                            }
                                        }}
                                        disabled={depotSyncing}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-50"
                                    >
                                        {depotSyncing ? <Loader2 className="animate-spin" size={14} /> : 'Afegir'}
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                {parkedUnits.filter(u => u.depot_id === 'PC').map((u, i) => (
                                    <div key={i} className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-xl group">
                                        <div className="flex flex-col">
                                            <span className="text-blue-500 font-bold text-xs">{u.unit_number}</span>
                                            <span className="text-[8px] font-bold text-blue-400 uppercase tracking-widest">Via {u.track}</span>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                setDepotSyncing(true);
                                                await supabase.from('parked_units').delete().eq('unit_number', u.unit_number);
                                                setDepotSyncing(false);
                                            }}
                                            className="text-blue-500/40 hover:text-red-500 transition-colors"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="mt-8 flex justify-end">
                            <button onClick={() => setOpenDiagram(null)} className="px-10 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border border-white/10 hover:border-white/20 shadow-xl">Tancar Esquema</button>
                        </div>
                    </div>
                </div>
            )}


            {selectedRestLocation && groupedRestPersonnel[selectedRestLocation] && (
                <div className="absolute top-0 right-0 h-full w-full sm:w-80 bg-white/95 dark:bg-black/90 backdrop-blur-md border-l border-gray-100 dark:border-white/10 z-[100] p-6 shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto">
                    <div className="flex items-center justify-between mb-8 border-b border-gray-100 dark:border-white/5 pb-4"><div className="flex items-center gap-3"><div className="p-2 bg-blue-500 rounded-lg text-white"><Coffee size={20} /></div><div><h4 className="text-sm font-bold text-fgc-grey dark:text-white uppercase tracking-tight">Personal en Descans</h4><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{MAP_STATIONS.find(s => s.id === selectedRestLocation)?.id || selectedRestLocation}</p></div></div><button onClick={() => setSelectedRestLocation(null)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"><X size={20} /></button></div>
                    <div className="space-y-3">{groupedRestPersonnel[selectedRestLocation].map((p, idx) => (<div key={idx} className="bg-white dark:bg-white/5 p-4 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all group"><div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><span className="bg-fgc-grey dark:bg-black text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">{p.torn}</span>{p.phones && p.phones.length > 0 && (<a href={isPrivacyMode ? undefined : `tel:${p.phones[0]}`} className={`text-blue-500 hover:scale-110 transition-transform ${isPrivacyMode ? 'cursor-default' : ''}`}><Phone size={14} /></a>)}</div><span className="text-[9px] font-bold text-fgc-green uppercase tracking-widest">{p.horaPas}</span></div><p className="text-xs font-bold text-fgc-grey dark:text-gray-200 uppercase truncate">{p.driver}</p>{p.phones && p.phones.length > 0 && (<p className="text-[9px] font-bold text-gray-400 mt-1">{isPrivacyMode ? '*** ** ** **' : p.phones[0]}</p>)}</div>))}</div>
                </div>
            )}

            {
                (selectedCutStations.size > 0 || selectedCutSegments.size > 0) && dividedPersonnel && (
                    <div className="mt-6 space-y-8 animate-in fade-in slide-in-from-top-4">
                        <div className="flex items-center gap-4 border-b-4 border-red-500/20 pb-4"><div className="p-3 bg-red-500 rounded-2xl text-white shadow-lg shadow-red-500/20"><Scissors size={24} /></div><div><h4 className="text-[12px] font-bold text-red-500 uppercase tracking-[0.2em] leading-none">ANÀLISI DE TALL OPERATIU</h4><p className="text-xl font-bold text-fgc-grey dark:text-white uppercase mt-1">Multi-talls actius: {selectedCutStations.size} estacions, {selectedCutSegments.size} trams</p></div></div>
                        <div className="flex flex-col gap-6">
                            {[
                                { id: 'AFFECTED', label: 'Zona de Tall / Atrapats', Icon: AlertCircle, color: 'red', iconClass: "text-red-500" },
                                { id: 'BCN', label: 'Costat Barcelona', Icon: ArrowDownToLine, color: 'blue', iconClass: "text-blue-500" },
                                { id: 'VALLES', label: 'Costat Vallès', Icon: ArrowUpToLine, color: 'green', iconClass: "text-fgc-green", unifiedOnly: true },
                                { id: 'S1', label: 'Costat Terrassa', Icon: ArrowUpToLine, color: 'orange', iconClass: "text-orange-500", splitOnly: true },
                                { id: 'S2', label: 'Costat Sabadell', Icon: ArrowRightToLine, color: 'green', iconClass: "text-fgc-green", splitOnly: true },
                                { id: 'L6', label: 'Costat Elisenda', Icon: ArrowUpToLine, color: 'purple', iconClass: "text-purple-500" },
                                { id: 'L7', label: 'Costat Tibidabo', Icon: ArrowLeftToLine, color: 'amber', iconClass: "text-amber-700" },
                                { id: 'ISOLATED', label: 'Zones Aïllades', Icon: Layers, color: 'gray', iconClass: "text-gray-500" },
                            ].map((col) => {
                                const bucket = dividedPersonnel[col.id];
                                const items = (bucket?.list || []); // Show all in cut analysis
                                const vallesUnified = dividedPersonnel.VALLES.isUnified;
                                if (col.unifiedOnly && !vallesUnified) return null;
                                if (col.splitOnly && vallesUnified) return null;
                                if (items.length === 0 && col.id !== 'AFFECTED') return null;
                                const trainsCount = items.filter((i: any) => i.type === 'TRAIN').length;
                                const isRed = col.color === 'red';
                                return (
                                    <div key={col.id} className={`${isRed ? 'bg-red-50/50 dark:bg-red-950/20 border-2 border-red-500/30 ring-4 ring-red-500/10' : 'glass-card border border-gray-100 dark:border-white/10'} rounded-[32px] p-6 transition-all hover:translate-y-[-4px] group relative overflow-hidden`}>
                                        <div className="absolute top-0 left-0 w-full h-1 bg-fgc-green/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
                                            <div className="flex items-center gap-2">
                                                <col.Icon size={18} className={col.iconClass} />
                                                <h5 className={`font-bold uppercase text-xs sm:text-sm tracking-widest ${isRed ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>{col.label}</h5>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:ml-auto">
                                                <div className="flex items-center gap-1.5 bg-fgc-grey dark:bg-black text-white px-3 py-1 rounded-xl text-[10px] sm:text-xs font-bold" title="Trens Actius"><Train size={10} /> {trainsCount} <span className="hidden sm:inline opacity-60">TRENS</span></div>
                                                <div className="flex items-center gap-1.5 bg-fgc-green text-fgc-grey px-3 py-1 rounded-xl text-[10px] sm:text-xs font-bold" title="Maquinistes a la zona"><User size={10} /> {items.length} <span className="hidden sm:inline opacity-60">MAQUINISTES</span></div>
                                                {items.length > 0 && (
                                                    <button
                                                        onClick={() => { setAltServiceIsland(col.id); setIsPaused(true); }}
                                                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded-xl text-[10px] sm:text-xs font-bold shadow-md hover:scale-105 active:scale-95 transition-all"
                                                    >
                                                        <Zap size={10} /> SERVEI ALTERNATIU
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className={`bg-white dark:bg-black/20 rounded-2xl border ${isRed ? 'border-red-200 dark:border-red-900/50' : 'border-gray-100 dark:border-white/10'} divide-y ${isRed ? 'divide-red-100 dark:divide-red-900/30' : 'divide-gray-50 dark:divide-white/5'}`}>
                                            {items
                                                .sort((a: any, b: any) => (a.type === 'TRAIN' ? 0 : 1) - (b.type === 'TRAIN' ? 0 : 1))
                                                .map((t: LivePersonnel) => {
                                                    const islands = getConnectivityIslands(selectedCutStations, selectedCutSegments);
                                                    const currentStation = t.stationId.toUpperCase();
                                                    const startStation = t.shiftDep?.toUpperCase();
                                                    let isDisplaced = false;

                                                    if (startStation) {
                                                        const startIsland = Object.entries(islands).find(([key, stations]) => stations.has(startStation))?.[0];
                                                        const currentIsland = Object.entries(islands).find(([key, stations]) => stations.has(currentStation))?.[0];
                                                        if (startIsland && currentIsland && startIsland !== currentIsland) {
                                                            isDisplaced = true;
                                                        }
                                                    }

                                                    return (
                                                        <ListPersonnelRow
                                                            key={`${t.torn}-${t.id}`}
                                                            item={t}
                                                            variant={isRed ? 'affected' : 'normal'}
                                                            isDisplaced={isDisplaced}
                                                            manualOverrides={manualOverrides}
                                                            setManualOverrides={setManualOverrides}
                                                            openMenuId={openMenuId}
                                                            setOpenMenuId={setOpenMenuId}
                                                            dividedPersonnel={dividedPersonnel}
                                                            isPrivacyMode={isPrivacyMode}
                                                        />
                                                    );
                                                })
                                            }
                                            {items.length === 0 && <p className="text-center py-10 text-[10px] font-bold text-gray-300 dark:text-gray-700 uppercase tracking-widest italic">Cap presència en aquesta banda</p>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )
            }
        </GlassPanel>
    );
};
export default IncidentMap;
