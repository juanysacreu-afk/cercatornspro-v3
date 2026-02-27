import React from 'react';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import DepotModal from '../../components/DepotModal';
import { LivePersonnel } from '../../types';

interface StationDiagramModalProps {
    openDiagram: string | null;
    setOpenDiagram: (id: string | null) => void;
    liveData: LivePersonnel[];
    parkedUnits: any[];
    depotSyncing: boolean;
    setDepotSyncing: (val: boolean) => void;
    onParkedUnitsChange: () => Promise<void>;
}

const ModalWrapper: React.FC<{ title: string; accentColor: string; onClose: () => void; children: React.ReactNode }> = ({ title, accentColor, onClose, children }) => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
        <div className="bg-[#121212] p-8 rounded-[40px] border border-white/10 shadow-2xl max-w-4xl w-full relative overflow-hidden ring-1 ring-white/20">
            <button onClick={onClose} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full">
                <X size={20} />
            </button>
            <div className="flex items-center gap-4 mb-8">
                <div className={`w-3 h-3 rounded-full animate-pulse ring-4`} style={{ backgroundColor: accentColor, boxShadow: `0 0 0 4px ${accentColor}33` }} />
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">{title}</h2>
            </div>
            <div className="bg-black/60 rounded-3xl p-8 border border-white/5 relative">
                {children}
            </div>
            <div className="mt-8 flex justify-end">
                <button onClick={onClose} className="px-10 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border border-white/10 hover:border-white/20 shadow-xl">Tancar Esquema</button>
            </div>
        </div>
    </div>
);

const TrainDot: React.FC<{ cx: number; cy: number; color: string; id: string }> = ({ cx, cy, color, id }) => (
    <g className="transition-all duration-1000 ease-linear">
        <circle cx={cx} cy={cy} r={10} fill={color} stroke="white" strokeWidth="3" className="drop-shadow-lg" />
        <text x={cx} y={cy - 15} textAnchor="middle" className="text-[11px] font-bold fill-white drop-shadow-md">{id}</text>
    </g>
);

/* ---- SR (Sarrià) ---- */
const SarriaDiagram: React.FC<{ liveData: LivePersonnel[]; onClose: () => void }> = ({ liveData, onClose }) => (
    <ModalWrapper title="Esquema de Vies - Sarrià" accentColor="#3b82f6" onClose={onClose}>
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
                let trainY = numId % 2 !== 0 ? 300 : 230;
                let cxValue = 440;
                if (isL12) trainY = 160;
                if (isMSR) { trainY = 265; cxValue = 695; }
                else {
                    if (p.x < 228) { const progress = Math.min(1, (230 - p.x) / 30); cxValue = 440 - (progress * 380); }
                    else if (p.x > 232) { const progress = Math.min(1, (p.x - 230) / 30); cxValue = 440 + (progress * 300); }
                }
                return <g key={`sr-train-${p.id}`} className="transition-all duration-1000 ease-linear"><circle cx={cxValue} cy={trainY} r={12} fill={p.color} stroke="white" strokeWidth="3" className="drop-shadow-lg" /><text x={cxValue} y={trainY - 18} textAnchor="middle" className="text-[12px] font-bold fill-white drop-shadow-md">{p.id}</text></g>;
            })}
        </svg>
    </ModalWrapper>
);

/* ---- TB (Av. Tibidabo) ---- */
const TibidaboDiagram: React.FC<{ liveData: LivePersonnel[]; onClose: () => void }> = ({ liveData, onClose }) => (
    <ModalWrapper title="Esquema de Vies - Av. Tibidabo" accentColor="#2563eb" onClose={onClose}>
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
            {liveData.filter(p => p.stationId === 'TB' && p.type === 'TRAIN').map((p) => {
                let cxValue = 510;
                if (p.x < 118) { const progress = Math.min(1, (120 - p.x) / 10); cxValue = 510 - (progress * 350); }
                return <TrainDot key={`tb-train-${p.id}`} cx={cxValue} cy={130} color={p.color} id={p.id} />;
            })}
        </svg>
    </ModalWrapper>
);

/* ---- BN (La Bonanova) ---- */
const BonanovaDiagram: React.FC<{ liveData: LivePersonnel[]; onClose: () => void }> = ({ liveData, onClose }) => (
    <ModalWrapper title="Esquema de Vies - La Bonanova" accentColor="#3b82f6" onClose={onClose}>
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
            {liveData.filter(p => p.stationId === 'BN' && p.type === 'TRAIN').map((p) => {
                const isAsc = parseInt(p.id.replace(/\D/g, '')) % 2 !== 0;
                return <TrainDot key={`bn-train-${p.id}`} cx={430} cy={isAsc ? 140 : 60} color={p.color} id={p.id} />;
            })}
        </svg>
    </ModalWrapper>
);

/* ---- PM (Pl. Molina) ---- */
const MolinaDiagram: React.FC<{ liveData: LivePersonnel[]; onClose: () => void }> = ({ liveData, onClose }) => (
    <ModalWrapper title="Esquema de Vies - Pl. Molina" accentColor="#f97316" onClose={onClose}>
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
            {liveData.filter(p => p.stationId === 'PM' && p.type === 'TRAIN').map((p) => {
                const isAsc = parseInt(p.id.replace(/\D/g, '')) % 2 !== 0;
                let cxValue = 300;
                if (p.x > 102) { cxValue = 300 + (Math.min(1, (p.x - 100) / 30) * 250); }
                else if (p.x < 98) { cxValue = 300 - (Math.min(1, (100 - p.x) / 30) * 250); }
                return <TrainDot key={`pm-train-${p.id}`} cx={cxValue} cy={isAsc ? 140 : 60} color={p.color} id={p.id} />;
            })}
        </svg>
    </ModalWrapper>
);

/* ---- GR (Gràcia) ---- */
const GraciaDiagram: React.FC<{ liveData: LivePersonnel[]; onClose: () => void }> = ({ liveData, onClose }) => (
    <ModalWrapper title="Esquema de Vies - Gràcia" accentColor="#22c55e" onClose={onClose}>
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
            {liveData.filter(p => p.stationId === 'GR' && p.type === 'TRAIN').map((p) => {
                const isAsc = parseInt(p.id.replace(/\D/g, '')) % 2 !== 0;
                let trainY = isAsc ? 180 : 120;
                if (p.linia === 'L7') trainY = isAsc ? 240 : 60;
                let cxValue = 350;
                if (p.x > 82) cxValue = 350 + (Math.min(1, (p.x - 80) / 30) * 350);
                else if (p.x < 78) cxValue = 350 - (Math.min(1, (80 - p.x) / 30) * 300);
                return <TrainDot key={`gr-train-${p.id}`} cx={cxValue} cy={trainY} color={p.color} id={p.id} />;
            })}
        </svg>
    </ModalWrapper>
);

/* ---- PR (Provença) ---- */
const ProvencaDiagram: React.FC<{ liveData: LivePersonnel[]; onClose: () => void }> = ({ liveData, onClose }) => (
    <ModalWrapper title="Esquema de Vies - Provença" accentColor="#3b82f6" onClose={onClose}>
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
            {liveData.filter(p => p.stationId === 'PR' && p.type === 'TRAIN').map((p) => {
                const isAsc = parseInt(p.id.replace(/\D/g, '')) % 2 !== 0;
                let cxValue = 300;
                if (p.x > 52) cxValue = 300 + (Math.min(1, (p.x - 50) / 30) * 250);
                else if (p.x < 48) cxValue = 300 - (Math.min(1, (50 - p.x) / 30) * 250);
                return <TrainDot key={`pr-train-${p.id}`} cx={cxValue} cy={isAsc ? 140 : 60} color={p.color} id={p.id} />;
            })}
        </svg>
    </ModalWrapper>
);

/* ---- PC (Pl. Catalunya) — the most complex one, with depot management ---- */
const PlCatalunyaDiagram: React.FC<{ liveData: LivePersonnel[]; parkedUnits: any[]; depotSyncing: boolean; setDepotSyncing: (v: boolean) => void; onClose: () => void }> = ({
    liveData, parkedUnits, depotSyncing, setDepotSyncing, onClose
}) => {
    const Y_V1 = 60, Y_V2 = 110, Y_V3 = 160, Y_V4 = 210, Y_V5 = 270;
    const trackMap: Record<string, { y: number; label: string }> = {
        "1": { y: Y_V1, label: "V1" }, "2": { y: Y_V2, label: "V2" }, "3": { y: Y_V3, label: "V3" },
        "4": { y: Y_V4, label: "V4" }, "5": { y: Y_V5, label: "V5" },
        "V1": { y: Y_V1, label: "V1" }, "V2": { y: Y_V2, label: "V2" }, "V3": { y: Y_V3, label: "V3" },
        "V4": { y: Y_V4, label: "V4" }, "V5": { y: Y_V5, label: "V5" }
    };
    const fallbackTracks = [{ y: Y_V1, label: "V1" }, { y: Y_V2, label: "V2" }, { y: Y_V3, label: "V3" }, { y: Y_V4, label: "V4" }, { y: Y_V5, label: "V5" }];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#121212] p-8 rounded-[40px] border border-white/10 shadow-2xl max-w-4xl w-full relative overflow-hidden ring-1 ring-white/20">
                <button onClick={onClose} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full"><X size={20} /></button>
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse ring-4 ring-red-500/20" />
                    <h2 className="text-sm font-bold text-white uppercase tracking-widest">Esquema de Vies - Pl. Catalunya</h2>
                </div>
                <div className="bg-black/60 rounded-3xl p-8 border border-white/5 relative">
                    <svg viewBox="0 0 600 320" className="w-full h-auto">
                        {/* Buffer stops */}
                        {[50, 100, 150, 200, 260].map((y, i) => <line key={i} x1="105" y1={y} x2="105" y2={y + 20} stroke="#ef4444" strokeWidth="5" />)}
                        {/* Tracks */}
                        <line x1="550" y1={Y_V1} x2="105" y2={Y_V1} stroke="#4D5358" strokeWidth="3" opacity="0.4" /><text x="70" y="65" fill="#4D5358" className="text-[14px] font-bold opacity-60">V1</text>
                        <line x1="550" y1={Y_V2} x2="105" y2={Y_V2} stroke="#4D5358" strokeWidth="3" opacity="0.4" /><text x="70" y="115" fill="#4D5358" className="text-[14px] font-bold opacity-60">V2</text>
                        {/* Crossovers */}
                        <line x1="210" y1={Y_V1} x2="160" y2={Y_V2} stroke="#fbbf24" strokeWidth="2.5" />
                        <line x1="160" y1={Y_V1} x2="210" y2={Y_V2} stroke="#fbbf24" strokeWidth="2.5" />
                        <line x1="430" y1={Y_V2} x2="480" y2={Y_V1} stroke="#fbbf24" strokeWidth="2" />
                        <path d={`M 340 ${Y_V2} L 290 ${Y_V3} L 105 ${Y_V3}`} fill="none" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                        <text x="70" y="165" fill="#4D5358" className="text-[14px] font-bold opacity-60">V3</text>
                        <path d={`M 410 ${Y_V2} L 310 ${Y_V4} L 105 ${Y_V4}`} fill="none" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                        <text x="70" y="215" fill="#4D5358" className="text-[14px] font-bold opacity-60">V4</text>
                        <path d={`M 230 ${Y_V4} L 170 ${Y_V5} L 105 ${Y_V5}`} fill="none" stroke="#4D5358" strokeWidth="3" opacity="0.4" />
                        <text x="70" y="275" fill="#4D5358" className="text-[14px] font-bold opacity-60">V5</text>
                        <text x="480" y="40" fill="#666" className="text-[9px] uppercase font-bold tracking-widest text-right">Provença →</text>
                        {/* Trains */}
                        {liveData.filter(p => p.stationId === 'PC' && p.type === 'TRAIN').map((p, idx) => {
                            const isStationed = p.x <= 20.5;
                            let cxValue = isStationed ? 125 : 125 + (Math.min(1, Math.max(0, (p.x - 20) / 30)) * 425);
                            let targetVia = p.final === 'PC' ? p.via_final : p.via_inici;
                            let trackInfo = targetVia ? trackMap[targetVia.trim().toUpperCase()] : null;
                            if (!trackInfo) trackInfo = fallbackTracks[idx % 5];
                            const { y: trainY } = trackInfo;
                            return (
                                <g key={`pc-train-${p.id}`} className="animate-in fade-in zoom-in duration-500">
                                    <circle cx={cxValue} cy={trainY} r={8} fill={p.color} stroke="white" strokeWidth="2" className="drop-shadow-lg" />
                                    <text x={cxValue} y={trainY - 12} textAnchor="middle" className="text-[10px] font-bold fill-white drop-shadow-md">{p.id}</text>
                                </g>
                            );
                        })}
                        {/* Parked units */}
                        {parkedUnits.filter(u => u.depot_id === 'PC').map((u, i) => {
                            const y = trackMap[u.track]?.y || Y_V1;
                            return (
                                <g key={`parked-pc-${u.unit_number}-${i}`} className="animate-in fade-in zoom-in duration-500">
                                    <circle cx={135} cy={y} r={8} fill="#3b82f6" stroke="white" strokeWidth="2" className="drop-shadow-lg" />
                                    <text x={135} y={y - 12} textAnchor="middle" className="text-[9px] font-bold fill-blue-400 drop-shadow-md">{u.unit_number}</text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
                {/* Depot management */}
                <div className="mt-8 border-t border-white/5 pt-8">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.2em]">Gestió de Dipòsit (Unitats Estacionades)</h3>
                        <div className="flex gap-2">
                            <input id="pc-unit-input" type="text" placeholder="Unitat (ex: 112.10)"
                                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-white focus:ring-2 focus:ring-blue-500/50 outline-none w-40 uppercase" />
                            <select id="pc-via-select" className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-white focus:ring-2 focus:ring-blue-500/50 outline-none w-24">
                                {[1, 2, 3, 4, 5].map(v => <option key={v} value={v} className="bg-[#121212]">Via {v}</option>)}
                            </select>
                            <button
                                disabled={depotSyncing}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-50"
                                onClick={async () => {
                                    const unitInput = document.getElementById('pc-unit-input') as HTMLInputElement;
                                    const viaSelect = document.getElementById('pc-via-select') as HTMLSelectElement;
                                    if (unitInput.value) {
                                        setDepotSyncing(true);
                                        await supabase.from('parked_units').upsert({ unit_number: unitInput.value.toUpperCase(), depot_id: 'PC', track: viaSelect.value, updated_at: new Date().toISOString() });
                                        unitInput.value = '';
                                        setDepotSyncing(false);
                                    }
                                }}
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
                                <button className="text-blue-500/40 hover:text-red-500 transition-colors"
                                    onClick={async () => { setDepotSyncing(true); await supabase.from('parked_units').delete().eq('unit_number', u.unit_number); setDepotSyncing(false); }}>
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="mt-8 flex justify-end">
                    <button onClick={onClose} className="px-10 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border border-white/10 hover:border-white/20 shadow-xl">Tancar Esquema</button>
                </div>
            </div>
        </div>
    );
};

/* ---- Main dispatcher ---- */
const StationDiagramModal: React.FC<StationDiagramModalProps> = ({
    openDiagram, setOpenDiagram, liveData, parkedUnits, depotSyncing, setDepotSyncing, onParkedUnitsChange
}) => {
    const close = () => setOpenDiagram(null);

    // DepotModal-based diagrams (RE, RB, NA, PN) are handled inside IncidentMap directly via <DepotModal>.
    // This component handles the custom SVG station diagrams.
    if (openDiagram === 'SR') return <SarriaDiagram liveData={liveData} onClose={close} />;
    if (openDiagram === 'TB') return <TibidaboDiagram liveData={liveData} onClose={close} />;
    if (openDiagram === 'BN') return <BonanovaDiagram liveData={liveData} onClose={close} />;
    if (openDiagram === 'PM') return <MolinaDiagram liveData={liveData} onClose={close} />;
    if (openDiagram === 'GR') return <GraciaDiagram liveData={liveData} onClose={close} />;
    if (openDiagram === 'PR') return <ProvencaDiagram liveData={liveData} onClose={close} />;
    if (openDiagram === 'PC') return <PlCatalunyaDiagram liveData={liveData} parkedUnits={parkedUnits} depotSyncing={depotSyncing} setDepotSyncing={setDepotSyncing} onClose={close} />;
    return null;
};

export default StationDiagramModal;
