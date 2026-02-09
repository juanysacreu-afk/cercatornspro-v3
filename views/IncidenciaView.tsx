import React, { useState, useEffect, useMemo } from 'react';
import { Search, ShieldAlert, Loader2, UserCheck, Clock, MapPin, AlertCircle, Phone, Info, Users, Zap, User, Train, Map as MapIcon, X, Timer, Scissors, ArrowDownToLine, ArrowUpToLine, ArrowLeftToLine, ArrowRightToLine, Coffee, Layers, Trash2, Repeat, Rewind, FastForward, RotateCcw, RefreshCw, LayoutGrid, CheckCircle2, Activity, FilePlus, ArrowRight, Move, Plus, Minus, Bell, Construction, Warehouse, ZoomIn, ZoomOut, Maximize, Wand2 } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';
import { fetchFullTurns } from '../utils/queries.ts';
import { getStatusColor } from '../utils/fgc.ts';
import { getServiceToday } from '../utils/serviceCalendar';
import IncidenciaPerTorn from '../components/IncidenciaPerTorn.tsx';
import DepotModal from '../components/DepotModal.tsx';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

const RESERVAS_DATA = [
  { id: 'QRS1', loc: 'SR', start: '06:00', end: '14:00' },
  { id: 'QRS2', loc: 'SR', start: '14:00', end: '22:00' },
  { id: 'QRS0', loc: 'SR', start: '22:00', end: '06:00' },
  { id: 'QRP0', loc: 'PC', start: '22:00', end: '06:00' },
  { id: 'QRN0', loc: 'NA', start: '22:00', end: '06:00' },
  { id: 'QRF0', loc: 'PR', start: '22:00', end: '06:00' },
  { id: 'QRR0', loc: 'RB', start: '22:00', end: '06:00' },
  { id: 'QRR4', loc: 'RB', start: '21:50', end: '05:50' },
  { id: 'QRR1', loc: 'RB', start: '06:00', end: '14:00' },
  { id: 'QRR2', loc: 'RB', start: '14:00', end: '22:00' },
];

const normalizeStr = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : "";


type IncidenciaMode = 'INIT' | 'MAQUINISTA' | 'LINIA' | 'PER_TORN';

interface LivePersonnel {
  type: 'TRAIN' | 'REST';
  id: string;
  linia: string;
  stationId: string;
  color: string;
  driver?: string;
  driverName?: string;
  driverSurname?: string;
  torn?: string;
  shiftStartMin?: number;
  shiftEndMin?: number;
  shiftDep?: string;
  servei?: string;
  phones?: string[];
  inici?: string;
  final?: string;
  via_inici?: string;
  via_final?: string;
  horaPas?: string;
  x: number;
  y: number;
  visualOffset?: number;
  nextStationId?: string; // New field for segment tracking
  isMoving?: boolean;     // New field
}

interface IncidenciaViewProps {
  showSecretMenu: boolean;
  parkedUnits: any[];
  onParkedUnitsChange: () => Promise<void>;
  isPrivacyMode: boolean;
}

const resolveStationId = (name: string, linia: string = '') => {
  const n = (name || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  if (n.includes('CATALUNYA') || n === 'PC') return 'PC';
  if (n.includes('PROVEN') || n === 'PR') return 'PR';
  if (n.includes('GRACIA') || n === 'GR') return 'GR';
  if (n.includes('GERVASI') || n === 'SG') return 'SG';
  if (n.includes('MUNTANER') || n === 'MN') return 'MN';
  if (n.includes('BONANOVA') || n === 'BN') return 'BN';
  if (n.includes('TRES TORRES') || n === 'TT') return 'TT';
  if (n.includes('SARRIA') || n === 'SR') return 'SR';
  if (n.includes('ELISENDA') || n === 'RE') return 'RE';
  if (n.includes('TIBIDABO') || n === 'TB') return 'TB';
  if (n.includes('CUGAT') || n === 'SC') return 'SC';

  if (n.includes('RUBI') || n.includes('TALLER') || n.includes('COTXERA') || n.includes('MERCADERIES') || n.includes('RAMAL') || n.includes('APARTADOR') || n === 'RB') return 'RB';
  if (n.includes('RAMBLA') || n === 'TR') return 'TR';
  if (n.includes('NACIO') || n.includes('UNIDES') || n === 'NA') return 'NA';
  if (n.includes('FONTS') || n === 'FN') return 'FN';
  if (n.includes('HOSP') || n.includes('GENERAL') || n === 'HG') return 'HG';
  if (n.includes('MIRA') || n === 'MS') return 'MS';
  if (n.includes('VALLPARADIS') || n === 'VP') return 'VP';
  if (n.includes('NORD') && n.includes('ESTACIO') || n === 'EN') return 'EN';

  if (n.includes('VOLPALLERES') || n === 'VO') return 'VO';
  if (n.includes('JOAN') || n === 'SJ') return 'SJ';
  if (n.includes('BELLATERRA') || n === 'BT') return 'BT';
  if (n.includes('AUTONOMA') || n.includes('UAB') || n.includes('UNIVERSITAT') || n === 'UN') return 'UN';
  if (n.includes('QUIRZE') || n === 'SQ') return 'SQ';
  if (n.includes('FEU') || n.includes('CF') || n === 'CF') return 'CF';
  if (n.includes('MAJOR') || n === 'PJ') return 'PJ';
  if (n.includes('CREU') || n === 'CT') return 'CT';
  if (n.includes('SABADELL NORD') || n === 'NO') return 'NO';
  if (n.includes('PARC') || n === 'PN') return 'PN';

  if (n.includes('MOLINA') || n === 'PM') return 'PM';
  if (n.includes('PADUA') || n === 'PD') return 'PD';
  if (n.includes('PUTXET') || n === 'EP') return 'EP';

  if (n.includes('FLORESTA') || n === 'LF') return 'LF';
  if (n.includes('VALLDOREIX') || n === 'VD') return 'VD';
  if (n.includes('PLANES') || n === 'LP') return 'LP';
  if (n.includes('PEU') || n === 'PF') return 'PF';
  if (n.includes('BAIXADOR') || n === 'VL') return 'VL';

  return n.length > 2 ? n.substring(0, 2) : n;
};
const isServiceVisible = (val: string | undefined, f: string) => {
  if (f === 'Tots') return true;
  const s = (val || '').toString();
  if (f === '400' || f === 'S1') return s === '400' || s === 'S1' || s.includes('S1');
  if (f === '500' || f === 'S2') return s === '500' || s === 'S2' || s.includes('S2');
  if (f === '100' || f === 'L6') return s === '100' || s === 'L6' || s.includes('L6');
  if (f === '0' || f === 'L12') return s === '0' || s === 'L12' || s.includes('L12');
  return s === f || s.includes(f) || f.includes(s);
};

const MAP_STATIONS = [
  { id: 'PC', label: 'Pl. Catalunya', x: 20, y: 100, type: 'depot' }, { id: 'PR', label: 'Provença', x: 50, y: 100 }, { id: 'GR', label: 'Gràcia', x: 80, y: 100 }, { id: 'SG', label: 'Sant Gervasi', x: 110, y: 100 }, { id: 'MN', label: 'Muntaner', x: 140, y: 100 }, { id: 'BN', label: 'La Bonanova', x: 170, y: 100 }, { id: 'TT', label: 'Les Tres Torres', x: 200, y: 100 }, { id: 'SR', label: 'Sarrià', x: 230, y: 100 }, { id: 'PF', label: 'Peu del Funicular', x: 260, y: 100 }, { id: 'VL', label: 'B. Vallvidrera', x: 290, y: 100 }, { id: 'LP', label: 'Les Planes', x: 320, y: 100 }, { id: 'LF', label: 'La Floresta', x: 350, y: 100 }, { id: 'VD', label: 'Valldoreix', x: 380, y: 100 }, { id: 'SC', label: 'Sant Cugat', x: 410, y: 100 }, { id: 'PM', label: 'Pl. Molina', x: 100, y: 160 }, { id: 'PD', label: 'Pàdua', x: 130, y: 160 }, { id: 'EP', label: 'El Putxet', x: 160, y: 160 }, { id: 'TB', label: 'Av. Tibidabo', x: 190, y: 160 }, { id: 'RE', label: 'R. Elisenda', x: 260, y: 40 }, { id: 'MS', label: 'Mira-Sol', x: 440, y: 40 }, { id: 'HG', label: 'Hosp. General', x: 470, y: 40 }, { id: 'RB', label: 'Rubí Centre', x: 500, y: 40 }, { id: 'FN', label: 'Les Fonts', x: 530, y: 40 }, { id: 'TR', label: 'Terrassa Rambla', x: 560, y: 40 }, { id: 'VP', label: 'Vallparadís', x: 590, y: 40 }, { id: 'EN', label: 'Estació del Nord', x: 620, y: 40 }, { id: 'NA', label: 'Nacions Unides', x: 650, y: 40 }, { id: 'VO', label: 'Volpalleres', x: 440, y: 160 }, { id: 'SJ', label: 'Sant Joan', x: 470, y: 160 }, { id: 'BT', label: 'Bellaterra', x: 500, y: 160 }, { id: 'UN', label: 'U. Autònoma', x: 530, y: 160 }, { id: 'SQ', label: 'Sant Quirze', x: 560, y: 160 }, { id: 'CF', label: 'Can Feu', x: 590, y: 160 }, { id: 'PJ', label: 'Pl. Major', x: 620, y: 160 }, { id: 'CT', label: 'La Creu Alta', x: 650, y: 160 }, { id: 'NO', label: 'Sabadell Nord', x: 680, y: 160 }, { id: 'PN', label: 'Parc del Nord', x: 710, y: 160 },
  { id: 'DRE', label: 'Dip.RE', x: 290, y: 40, type: 'depot', labelYOffset: -12 },
  { id: 'DNA', label: 'Can Roca', x: 680, y: 40, type: 'depot', labelYOffset: -22 },
  { id: 'DPN', label: 'Ca N\'Oriach', x: 740, y: 160, type: 'depot', labelYOffset: -52, labelXOffset: -25 },
  { id: 'COR', label: 'COR', x: 485, y: 20, type: 'depot' },
];

const MAP_SEGMENTS = [
  { from: 'PC', to: 'PR' }, { from: 'PR', to: 'GR' }, { from: 'GR', to: 'SG' }, { from: 'SG', to: 'MN' }, { from: 'MN', to: 'BN' }, { from: 'BN', to: 'TT' }, { from: 'TT', to: 'SR' }, { from: 'SR', to: 'PF' }, { from: 'PF', to: 'VL' }, { from: 'VL', to: 'LP' }, { from: 'LP', to: 'LF' }, { from: 'LF', to: 'VD' }, { from: 'VD', to: 'SC' }, { from: 'GR', to: 'PM' }, { from: 'PM', to: 'PD' }, { from: 'PM', to: 'PD' }, { from: 'PD', to: 'EP' }, { from: 'EP', to: 'TB' }, { from: 'SR', to: 'RE' }, { from: 'SC', to: 'MS' }, { from: 'MS', to: 'HG' }, { from: 'HG', to: 'RB' }, { from: 'RB', to: 'FN' }, { from: 'FN', to: 'TR' }, { from: 'TR', to: 'VP' }, { from: 'VP', to: 'EN' }, { from: 'EN', to: 'NA' }, { from: 'SC', to: 'VO' }, { from: 'VO', to: 'SJ' }, { from: 'SJ', to: 'BT' }, { from: 'BT', to: 'UN' }, { from: 'UN', to: 'SQ' }, { from: 'SQ', to: 'CF' }, { from: 'CF', to: 'PJ' }, { from: 'PJ', to: 'CT' }, { from: 'CT', to: 'NO' }, { from: 'NO', to: 'PN' },
  { from: 'RE', to: 'DRE' }, { from: 'NA', to: 'DNA' }, { from: 'PN', to: 'DPN' }, { from: 'HG', to: 'COR' }, { from: 'COR', to: 'RB' },
];

const MAP_CROSSOVERS = [
  { from: 'PC', to: 'PR', pos: 0.6, type: '\\' },
  { from: 'PR', to: 'GR', pos: 0.5, type: 'X' },
  { from: 'MN', to: 'BN', pos: 0.4, type: '/' },  // Escape BN Side 1
  { from: 'MN', to: 'BN', pos: 0.6, type: '\\' }, // Escape BN Side 2
  { from: 'GR', to: 'PM', pos: 0.7, type: '/' },  // Aguja PM approach
  { from: 'PM', to: 'PD', pos: 0.3, type: '\\' }, // Aguja PM exit
  { from: 'TT', to: 'SR', pos: 0.7, type: 'X' },
  { from: 'SR', to: 'PF', pos: 0.3, type: '/' },
  { from: 'VD', to: 'SC', pos: 0.7, type: 'X' },
  { from: 'SC', to: 'MS', pos: 0.4, type: '/' },
  { from: 'SC', to: 'VO', pos: 0.4, type: '\\' },
  { from: 'HG', to: 'RB', pos: 0.4, type: 'X' },
  { from: 'RB', to: 'FN', pos: 0.5, type: '/' },
  { from: 'FN', to: 'TR', pos: 0.5, type: 'X' },
  { from: 'EN', to: 'NA', pos: 0.5, type: 'X' },
  { from: 'NO', to: 'PN', pos: 0.5, type: 'X' },
  { from: 'SJ', to: 'BT', pos: 0.5, type: '/' },
  { from: 'PJ', to: 'CT', pos: 0.5, type: '/' },
];

// Capacitats dels dipòsits segons Pla de garatges BV07
const DEPOT_CAPACITIES: Record<string, { u4: number; u3: number; total: number; label: string }> = {
  'PC': { u4: 4, u3: 1, total: 5, label: 'Plaça Catalunya' },
  'RE': { u4: 3, u3: 3, total: 6, label: 'Reina Elisenda' },
  'COR': { u4: 18, u3: 1, total: 19, label: 'COR' },
  'TCOR': { u4: 5, u3: 0, total: 5, label: 'Taller del COR' },
  'NA': { u4: 4, u3: 0, total: 4, label: 'Terrassa Nacions Unides' },
  'DNA': { u4: 10, u3: 0, total: 10, label: 'Dipòsit Terrassa (Can Roca)' },
  'PN': { u4: 4, u3: 0, total: 4, label: 'Sabadell Parc del Nord' },
  'DPN': { u4: 8, u3: 0, total: 8, label: 'Dipòsit Sabadell (Ca N\'Oriach)' },
};

const S1_STATIONS = ['PC', 'PR', 'GR', 'SG', 'MN', 'BN', 'TT', 'SR', 'PF', 'VL', 'LP', 'LF', 'VD', 'SC', 'MS', 'HG', 'RB', 'FN', 'TR', 'VP', 'EN', 'NA'];
const S2_STATIONS = ['PC', 'PR', 'GR', 'SG', 'MN', 'BN', 'TT', 'SR', 'PF', 'VL', 'LP', 'LF', 'VD', 'SC', 'VO', 'SJ', 'BT', 'UN', 'SQ', 'CF', 'PJ', 'CT', 'NO', 'PN'];
const L6_STATIONS = ['PC', 'PR', 'GR', 'SG', 'MN', 'BN', 'TT', 'SR'];
const L7_STATIONS = ['PC', 'PR', 'GR', 'PM', 'PD', 'EP', 'TB'];
const L12_STATIONS = ['SR', 'RE'];

const getFullPath = (start: string, end: string): string[] => {
  if (start === end) return [start];

  const graph: Record<string, string[]> = {};
  MAP_SEGMENTS.forEach(seg => {
    if (!graph[seg.from]) graph[seg.from] = [];
    if (!graph[seg.to]) graph[seg.to] = [];
    if (!graph[seg.from].includes(seg.to)) graph[seg.from].push(seg.to);
    if (!graph[seg.to].includes(seg.from)) graph[seg.to].push(seg.from);
  });

  const queue: { node: string, path: string[] }[] = [{ node: start, path: [start] }];
  const visited = new Set<string>([start]);

  while (queue.length > 0) {
    const { node, path } = queue.shift()!;
    if (node === end) return path;

    const neighbors = graph[node] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ node: neighbor, path: [...path, neighbor] });
      }
    }
  }
  return [start];
  return [start];
};

const CompactViatgerRow: React.FC<{ torn: any, viatgerCirc: any, colorClass: string, label?: React.ReactNode, isPrivacyMode: boolean }> = ({ torn, viatgerCirc, colorClass, label, isPrivacyMode }) => {
  const isBlue = colorClass.includes('blue');
  const isPurple = colorClass.includes('purple');
  const bgClass = isBlue ? 'bg-blue-50 dark:bg-blue-950/20' : (isPurple ? 'bg-purple-50 dark:bg-purple-950/20' : 'bg-fgc-grey/10 dark:bg-black');
  const textClass = isBlue ? 'text-blue-600' : (isPurple ? 'text-purple-600' : 'text-fgc-grey dark:text-gray-300');
  const btnBg = isBlue ? 'bg-blue-500 hover:bg-blue-600' : (isPurple ? 'bg-purple-500 hover:bg-purple-600' : 'bg-fgc-grey hover:bg-fgc-dark');
  const arrowColor = isBlue ? 'text-blue-300' : (isPurple ? 'text-purple-300' : 'text-gray-300');

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all flex items-center gap-4 border-l-4 ${colorClass}`}>
      <div className={`h-10 min-w-[2.5rem] px-2 ${bgClass} ${textClass} rounded-xl flex items-center justify-center font-black text-xs shadow-sm shrink-0 whitespace-nowrap`}>{torn.id}</div>
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-6"><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><p className="text-sm font-black text-fgc-grey dark:text-gray-200 truncate">{torn.drivers[0]?.cognoms}, {torn.drivers[0]?.nom}</p>{label}</div><p className="text-[8px] font-black text-gray-300 dark:text-gray-600 uppercase tracking-widest whitespace-nowrap">Nom. {torn.drivers[0]?.nomina} {torn.drivers[0]?.tipus_torn ? `(${torn.drivers[0].tipus_torn})` : ''}</p></div><div className={`flex items-center gap-3 shrink-0 ${textClass}`}><div className={`flex items-center gap-1.5 ${bgClass} px-3 py-1 rounded-lg border border-opacity-50 transition-colors`}><span className={`text-[10px] font-black uppercase whitespace-nowrap`}>{viatgerCirc?.machinistInici || '--'}</span><ArrowRight size={10} className={arrowColor} /><span className={`text-[10px] font-black uppercase whitespace-nowrap`}>{viatgerCirc?.machinistFinal || '--'}</span></div><div className="text-[10px] font-bold text-gray-400 dark:text-gray-600 min-w-[70px] whitespace-nowrap">{torn.inici_torn} - {torn.final_torn}</div></div></div>
      <div className="flex gap-1 shrink-0">{torn.drivers[0]?.phones?.map((p: string, i: number) => (<a key={i} href={isPrivacyMode ? undefined : `tel:${p}`} className={`w-8 h-8 ${btnBg} text-white rounded-lg flex items-center justify-center transition-all shadow-sm ${isPrivacyMode ? 'cursor-default' : ''}`}><Phone size={12} /></a>))}</div>
    </div>
  );
};

const IncidenciaView: React.FC<IncidenciaViewProps> = ({ showSecretMenu, parkedUnits, onParkedUnitsChange, isPrivacyMode }) => {
  const [mode, setMode] = useState<IncidenciaMode>('INIT');
  const [selectedServei, setSelectedServei] = useState<string>(getServiceToday());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);

  const [isRealTime, setIsRealTime] = useState(true);
  const [customTime, setCustomTime] = useState('');
  const [displayMin, setDisplayMin] = useState<number>(0);
  const [liveData, setLiveData] = useState<LivePersonnel[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [manualOverrides, setManualOverrides] = useState<Record<string, string>>({});
  const [isGeoTrenEnabled, setIsGeoTrenEnabled] = useState(false);
  const [geoTrenData, setGeoTrenData] = useState<any[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);



  const [selectedCutStations, setSelectedCutStations] = useState<Set<string>>(new Set());
  const [selectedCutSegments, setSelectedCutSegments] = useState<Set<string>>(new Set());
  const [selectedRestLocation, setSelectedRestLocation] = useState<string | null>(null);
  const [altServiceIsland, setAltServiceIsland] = useState<string | null>(null);
  const [isPCDiagramOpen, setIsPCDiagramOpen] = useState(false);
  const [isPRDiagramOpen, setIsPRDiagramOpen] = useState(false);
  const [isGRDiagramOpen, setIsGRDiagramOpen] = useState(false);
  const [isPMDiagramOpen, setIsPMDiagramOpen] = useState(false);
  const [isBNDiagramOpen, setIsBNDiagramOpen] = useState(false);
  const [isTBDiagramOpen, setIsTBDiagramOpen] = useState(false);
  const [isSRDiagramOpen, setIsSRDiagramOpen] = useState(false);

  // New Depot Diagrams
  const [isREStationDiagramOpen, setIsREStationDiagramOpen] = useState(false);
  const [isREDiagramOpen, setIsREDiagramOpen] = useState(false);
  const [isRBDiagramOpen, setIsRBDiagramOpen] = useState(false);
  const [isNADiagramOpen, setIsNADiagramOpen] = useState(false);
  const [isPNDiagramOpen, setIsPNDiagramOpen] = useState(false);

  const [depotSyncing, setDepotSyncing] = useState(false);

  const [passengerResults, setPassengerResults] = useState<any[]>([]);
  const [adjacentResults, setAdjacentResults] = useState<{ anterior: any[], posterior: any[] }>({ anterior: [], posterior: [] });
  const [restingResults, setRestingResults] = useState<any[]>([]);
  const [extensibleResults, setExtensibleResults] = useState<any[]>([]);
  const [reserveInterceptResults, setReserveInterceptResults] = useState<any[]>([]);
  const [searchedCircData, setSearchedCircData] = useState<any>(null);
  const [selectedTrain, setSelectedTrain] = useState<LivePersonnel | null>(null);
  const [mainDriverInfo, setMainDriverInfo] = useState<any>(null);

  const serveiTypes = ['0', '100', '400', '500'];

  function getFgcMinutes(timeStr: string | undefined): number | null {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return null;
    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    let total = h * 60 + m;
    if (h < 4) total += 24 * 60;
    return total;
  }

  function formatFgcTime(totalMinutes: number) {
    let mins = totalMinutes;
    if (mins >= 24 * 60) mins -= 24 * 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  const getLiniaColorHex = (linia: string) => {
    const l = linia?.toUpperCase().trim() || '';
    if (l.startsWith('F')) return '#22c55e';
    if (l === 'L7' || l === '300') return '#8B4513';
    if (l === 'L6' || l === '100') return '#9333ea';
    if (l === 'L12') return '#d8b4fe';
    if (l === 'S1' || l === '400') return '#f97316';
    if (l === 'S2' || l === '500') return '#22c55e';
    return '#6b7280';
  };

  useEffect(() => {
    if (isRealTime && !isPaused) {
      const updateTime = () => {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        setCustomTime(timeStr);
        const m = getFgcMinutes(timeStr);
        if (m !== null) setDisplayMin(m);
      };
      updateTime();
      const interval = setInterval(updateTime, 30000);
      return () => clearInterval(interval);
    }
  }, [isRealTime, isPaused]);

  useEffect(() => {
    if (customTime) {
      const m = getFgcMinutes(customTime);
      if (m !== null) setDisplayMin(m);
    } else if (isRealTime && !isPaused) {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const m = getFgcMinutes(timeStr);
      if (m !== null) setDisplayMin(m);
    }
  }, [customTime, isRealTime, isPaused, mode]);

  const fetchGeoTrenData = async () => {
    try {
      const resp = await fetch('https://dadesobertes.fgc.cat/api/v2/catalog/datasets/posicionament-dels-trens/exports/json');
      if (!resp.ok) return;
      const data = await resp.json();
      setGeoTrenData(data);
    } catch (err) {
      console.error('GeoTren fetch error:', err);
    }
  };

  useEffect(() => {
    if (isGeoTrenEnabled && !isPaused) {
      fetchGeoTrenData();
      const interval = setInterval(fetchGeoTrenData, 20000);
      return () => clearInterval(interval);
    }
  }, [isGeoTrenEnabled, isPaused]);

  const fetchLiveMapData = async () => {
    setLoading(true);
    try {
      const displayTime = formatFgcTime(displayMin);

      // Optimizació: En lloc de portar TOTS els shifts i TOTES les circulacions,
      // intentem filtrar per horari o almenys processar de forma més eficient.

      // 1. Cercar shifts que podrien estar actius (aproximació per string o portar-los tots si són pocs)
      const { data: allShifts } = await supabase.from('shifts').select('*');
      if (!allShifts) return;

      const activeShifts = allShifts.filter(s => {
        const sMin = getFgcMinutes(s.inici_torn);
        const eMin = getFgcMinutes(s.final_torn);
        return sMin !== null && eMin !== null && displayMin >= sMin && displayMin <= eMin;
      });

      if (activeShifts.length === 0) {
        setLiveData([]);
        setLoading(false);
        return;
      }

      // 2. Cercar només les circulacions que apareixen en aquests shifts actius
      const requiredCircIds = new Set<string>();
      activeShifts.forEach(s => {
        (s.circulations as any[]).forEach(c => {
          const codi = typeof c === 'string' ? c : c.codi;
          if (codi && codi !== 'VIATGER') requiredCircIds.add(codi.toUpperCase());
        });
      });

      const { data: allDaily } = await supabase.from('daily_assignments').select('*');
      const { data: allPhones } = await supabase.from('phonebook').select('nomina, phones');

      const stationCoords = MAP_STATIONS.reduce((acc, st) => {
        acc[st.id.toUpperCase()] = { x: st.x, y: st.y };
        return acc;
      }, {} as Record<string, { x: number, y: number }>);

      const VALID_STATION_IDS = new Set(MAP_STATIONS.map(s => s.id));

      const currentPersonnel: LivePersonnel[] = [];
      const processedKeys = new Set<string>();

      let circDetailsData: any[] = [];
      if (requiredCircIds.size > 0) {
        const { data } = await supabase.from('circulations').select('*').in('id', Array.from(requiredCircIds));
        if (data) circDetailsData = data;
      }

      if (circDetailsData.length === 0) {
        setLoading(false);
        return;
      }

      const circDetailsMap = new Map<string, any>(circDetailsData.map((c: any) => [c.id.trim().toUpperCase(), c]));

      allShifts.forEach(shift => {
        const shiftService = (shift.servei || '').toString();



        (shift.circulations as any[]).forEach(cRef => {
          const rawCodi = (typeof cRef === 'string' ? cRef : cRef.codi);
          const codi = rawCodi?.trim().toUpperCase() || '';

          if (!codi || codi === 'VIATGER') return;
          if (processedKeys.has(codi)) return;

          let circ = circDetailsMap.get(codi);

          if (!circ && typeof cRef === 'object' && cRef.sortida && cRef.arribada) {
            circ = {
              id: codi,
              linia: codi.startsWith('F') ? 'F' : (cRef.linia || 'S/L'),
              inici: cRef.inici || '?',
              final: cRef.final || '?',
              sortida: cRef.sortida,
              arribada: cRef.arribada,
              estacions: []
            };
          }

          if (!circ) return;

          let startMin = getFgcMinutes(circ.sortida);
          let endMin = getFgcMinutes(circ.arribada);
          const estacions = (circ.estacions as any[]) || [];

          if (startMin === null && estacions.length > 0) startMin = getFgcMinutes(estacions[0].hora || estacions[0].arribada || estacions[0].sortida);
          if (endMin === null && estacions.length > 0) endMin = getFgcMinutes(estacions[estacions.length - 1].hora || estacions[estacions.length - 1].arribada || estacions[estacions.length - 1].sortida);

          if (startMin !== null && endMin !== null && displayMin >= startMin && displayMin <= endMin) {
            const validStops = estacions
              .map((st: any) => ({
                nom: resolveStationId(st.nom || st.id, circ.linia),
                min: getFgcMinutes(st.hora || st.arribada || st.sortida)
              }))
              .filter((s: any) => s.min !== null && s.nom !== null && VALID_STATION_IDS.has(s.nom));

            const startID = resolveStationId(circ.inici || (estacions[0]?.nom), circ.linia);
            const endID = resolveStationId(circ.final || (estacions[estacions.length - 1]?.nom), circ.linia);

            const stopsWithTimes = [
              { nom: startID, min: startMin },
              ...validStops,
              { nom: endID, min: endMin }
            ]
              .filter(s => VALID_STATION_IDS.has(s.nom))
              .sort((a: any, b: any) => a.min - b.min);

            if (stopsWithTimes.length < 1) return;

            let x = 0, y = 0, currentStationId = stopsWithTimes[0].nom;
            let nextStationId: string | undefined = undefined;
            let isMoving = false;

            if (stopsWithTimes.length === 1) {
              const p = stationCoords[currentStationId] || stationCoords['PC'];
              x = p.x; y = p.y;
            } else {
              const expandedStops: { nom: string, min: number }[] = [];
              for (let i = 0; i < stopsWithTimes.length - 1; i++) {
                const current = stopsWithTimes[i];
                const next = stopsWithTimes[i + 1];
                const path = getFullPath(current.nom, next.nom);
                if (path.length > 1) {
                  for (let j = 0; j < path.length - 1; j++) {
                    const ratio = j / (path.length - 1);
                    expandedStops.push({ nom: path[j], min: current.min + (next.min - current.min) * ratio });
                  }
                } else expandedStops.push(current);
              }
              expandedStops.push(stopsWithTimes[stopsWithTimes.length - 1]);

              for (let i = 0; i < expandedStops.length - 1; i++) {
                const s1 = expandedStops[i];
                const s2 = expandedStops[i + 1];
                if (displayMin >= s1.min && displayMin <= s2.min) {
                  currentStationId = s1.nom;
                  nextStationId = s2.nom; // We are between s1 and s2
                  const p1 = stationCoords[s1.nom] || stationCoords['PC'];
                  const p2 = stationCoords[s2.nom] || stationCoords['PC'];
                  if (s1.min === s2.min) {
                    x = p1.x; y = p1.y;
                    isMoving = false;
                  } else {
                    const progress = (displayMin - s1.min) / (s2.min - s1.min);
                    x = p1.x + (p2.x - p1.x) * progress;
                    y = p1.y + (p2.y - p1.y) * progress;
                    // If progress is significant, we are moving
                    isMoving = progress > 0.01 && progress < 0.99;
                    if (progress >= 0.99) {
                      currentStationId = s2.nom;
                      isMoving = false;
                      nextStationId = undefined; // Arrived
                    }
                  }
                  break;
                }
              }
            }

            const shortTorn = getShortTornId(shift.id);
            const assignment = allDaily?.find(d => d.torn === shortTorn);
            const driverPhones = allPhones?.find(p => p.nomina === assignment?.empleat_id)?.phones || [];

            if (manualOverrides[codi]) {
              const overrideStation = manualOverrides[codi];
              const overrideCoords = stationCoords[overrideStation] || { x: 0, y: 0 };
              currentPersonnel.push({
                type: 'TRAIN', id: (circ as any).id as string, linia: (circ as any).linia as string,
                stationId: overrideStation, color: getLiniaColorHex((codi.startsWith('F') ? 'F' : (circ as any).linia) as string),
                driver: assignment ? `${(assignment as any).cognoms}, ${(assignment as any).nom}` : 'Sense assignar',
                driverName: (assignment as any)?.nom, driverSurname: (assignment as any)?.cognoms,
                torn: shift?.id || '---',
                shiftStartMin: getFgcMinutes(shift.inici_torn) || 0,
                shiftEndMin: getFgcMinutes(shift.final_torn) || 0,
                shiftDep: resolveStationId(shift.dependencia || '', shiftService),
                servei: shiftService,
                phones: driverPhones,
                inici: (circ as any).inici,
                final: (circ as any).final,
                via_inici: (circ as any).via_inici,
                via_final: (circ as any).via_final,
                horaPas: formatFgcTime(displayMin), x: overrideCoords.x, y: overrideCoords.y
              });
              processedKeys.add(codi);
              return;
            }

            currentPersonnel.push({
              type: 'TRAIN',
              id: (circ as any).id as string,
              linia: (circ as any).linia as string,
              stationId: currentStationId as string,
              color: getLiniaColorHex((codi.startsWith('F') ? 'F' : (circ as any).linia) as string),
              driver: assignment ? `${(assignment as any).cognoms}, ${(assignment as any).nom}` : 'Sense assignar',
              driverName: (assignment as any)?.nom as string | undefined,
              driverSurname: (assignment as any)?.cognoms as string | undefined,
              torn: shift?.id || '---',
              shiftStartMin: getFgcMinutes(shift.inici_torn) || 0,
              shiftEndMin: getFgcMinutes(shift.final_torn) || 0,
              shiftDep: resolveStationId(shift.dependencia || '', shiftService),
              servei: shiftService,
              phones: driverPhones,
              inici: (circ as any).inici as string | undefined,
              final: (circ as any).final as string | undefined,
              via_inici: (circ as any).via_inici as string | undefined,
              via_final: (circ as any).via_final as string | undefined,
              horaPas: formatFgcTime(displayMin),
              x, y,
              nextStationId,
              isMoving
            });
            processedKeys.add(codi);
          }
        });
      });

      allShifts.forEach(shift => {
        const shiftService = (shift.servei || '').toString();

        const startMin = getFgcMinutes(shift.inici_torn);
        const endMin = getFgcMinutes(shift.final_torn);

        if (startMin !== null && endMin !== null && displayMin >= startMin && displayMin < endMin) {
          const isWorking = currentPersonnel.some(p => p.torn === shift.id);
          if (!isWorking) {
            const shortTorn = getShortTornId(shift.id);
            const assignment = allDaily?.find(d => d.torn === shortTorn);
            const rawLoc = (shift.dependencia || '').trim().toUpperCase();
            const loc = resolveStationId(rawLoc, shiftService);
            if (loc && stationCoords[loc] && assignment) {
              const driverPhones = allPhones?.find(p => p.nomina === (assignment as any).empleat_id)?.phones || [];
              const coords = stationCoords[loc] || { x: 0, y: 0 };
              currentPersonnel.push({
                type: 'REST', id: 'DESCANS', linia: 'S/L', stationId: loc, color: '#53565A',
                driver: `${(assignment as any).cognoms}, ${(assignment as any).nom}`,
                driverName: (assignment as any).nom,
                driverSurname: (assignment as any).cognoms,
                torn: shift.id,
                shiftStartMin: getFgcMinutes(shift.inici_torn) || 0,
                shiftEndMin: getFgcMinutes(shift.final_torn) || 0,
                shiftDep: resolveStationId(shift.dependencia || '', shiftService),
                phones: driverPhones,
                inici: loc, final: loc, horaPas: formatFgcTime(displayMin),
                x: coords.x, y: coords.y
              });
            }
          }
        }
      });

      const collisionMap: Record<string, number> = {};
      const offsetData = currentPersonnel.map(p => {
        const key = `${Math.round(p.x)},${Math.round(p.y)}`;
        const count = collisionMap[key] || 0;
        collisionMap[key] = count + 1;
        return { ...p, visualOffset: count };
      });
      setLiveData(offsetData);
    } catch (e) { console.error("Error live map:", e); } finally { setLoading(false); }
  };

  useEffect(() => { if (mode === 'LINIA') fetchLiveMapData(); }, [mode, displayMin, selectedServei, manualOverrides]);

  const getShortTornId = (id: string) => {
    const trimmed = id.trim();
    if (trimmed.startsWith('Q') && !trimmed.startsWith('QR') && trimmed.length === 5) return trimmed[0] + trimmed.slice(2);
    return trimmed;
  };

  const fetchFullTurnData = async (turnId: string) => {
    const results = await fetchFullTurns([turnId], selectedServei === 'Tots' ? undefined : selectedServei);
    return results[0] || null;
  };

  const getSegments = (turn: any) => {
    if (!turn) return [];
    const startMin = getFgcMinutes(turn.inici_torn);
    const endMin = getFgcMinutes(turn.final_torn);
    if (startMin === null || endMin === null) return [];

    const segments: any[] = [];
    let currentPos = startMin;
    const circs = turn.fullCirculations || [];
    circs.forEach((circ: any, index: number) => {
      const cStart = getFgcMinutes(circ.sortida);
      const cEnd = getFgcMinutes(circ.arribada);
      if (cStart !== null && cEnd !== null) {
        if (cStart > currentPos) {
          let locationCode = index === 0 ? (circ.machinistInici || turn.dependencia || '') : (circs[index - 1].machinistFinal || '');
          segments.push({ start: currentPos, end: cStart, type: 'gap', codi: (locationCode || '').trim().toUpperCase() || 'DESCANS' });
        }
        segments.push({ start: cStart, end: cEnd, type: 'circ', codi: circ.codi, train: circ.train });
        currentPos = Math.max(currentPos, cEnd);
      }
    });
    if (currentPos < endMin) {
      const lastLoc = circs.length > 0 ? circs[circs.length - 1].machinistFinal : turn.dependencia;
      segments.push({ start: currentPos, end: endMin, type: 'gap', codi: (lastLoc || '').trim().toUpperCase() || 'FINAL' });
    }
    return segments;
  };

  const handleSearchCirculation = async () => {
    if (!query) return;
    setLoading(true);
    setMainDriverInfo(null);
    setSearchedCircData(null);
    setPassengerResults([]);
    setAdjacentResults({ anterior: [], posterior: [] });
    setRestingResults([]);
    setExtensibleResults([]);
    setReserveInterceptResults([]);

    try {
      const { data: searchedCirc } = await supabase.from('circulations').select('*').eq('id', query.toUpperCase()).single();
      if (searchedCirc) setSearchedCircData(searchedCirc);

      let queryBuilder = supabase.from('shifts').select('*');
      if (selectedServei !== 'Tots') {
        queryBuilder = queryBuilder.eq('servei', selectedServei);
      }
      const { data: allShifts } = await queryBuilder;
      if (!allShifts) { setLoading(false); return; }

      let mainDriverShiftId = null;
      const passengerShiftIds: string[] = [];
      allShifts.forEach(shift => {
        const circs = (shift.circulations as any[]) || [];
        circs.forEach(c => {
          const codi = typeof c === 'string' ? c : c.codi;
          if (codi && codi.toUpperCase() === query.toUpperCase()) mainDriverShiftId = shift.id;
          else if (codi === 'Viatger' && c.observacions && c.observacions.split('-')[0].toUpperCase() === query.toUpperCase()) passengerShiftIds.push(shift.id);
        });
      });

      if (mainDriverShiftId || passengerShiftIds.length > 0) {
        const turnIdsToFetch = Array.from(new Set([
          ...(mainDriverShiftId ? [mainDriverShiftId] : []),
          ...passengerShiftIds
        ]));
        const enrichedTurnsRaw = await fetchFullTurns(turnIdsToFetch, selectedServei === 'Tots' ? undefined : selectedServei);
        const enrichedTurns = enrichedTurnsRaw.filter(t => t);

        if (mainDriverShiftId) {
          setMainDriverInfo(enrichedTurns.find(t => t.id === mainDriverShiftId));
        }
        setPassengerResults(enrichedTurns.filter(t => passengerShiftIds.includes(t.id)));
      }

      if (searchedCirc) {
        const { data: relatedCircs } = await supabase.from('circulations').select('id, sortida, linia, final').eq('linia', searchedCirc.linia).eq('final', searchedCirc.final);
        if (relatedCircs && relatedCircs.length > 1) {
          const sorted = relatedCircs.sort((a: any, b: any) => (getFgcMinutes(a.sortida) || 0) - (getFgcMinutes(b.sortida) || 0));
          const currentIndex = sorted.findIndex((c: any) => c.id === searchedCirc.id);
          const anteriorId = currentIndex > 0 ? sorted[currentIndex - 1].id : null;
          const posteriorId = currentIndex < sorted.length - 1 ? sorted[currentIndex + 1].id : null;
          const anteriorShifts: string[] = []; const posteriorShifts: string[] = [];
          allShifts.forEach(shift => {
            const circs = (shift.circulations as any[]) || [];
            circs.forEach(c => {
              if (c.codi === 'Viatger' && c.observacions) {
                const obsCode = c.observacions.split('-')[0].toUpperCase();
                if (anteriorId && obsCode === anteriorId) anteriorShifts.push(shift.id);
                if (posteriorId && obsCode === posteriorId) posteriorShifts.push(shift.id);
              }
            });
          });
          const [enrichedAnteriorRaw, enrichedPosteriorRaw] = await Promise.all([
            fetchFullTurns(anteriorShifts, selectedServei === 'Tots' ? undefined : selectedServei),
            fetchFullTurns(posteriorShifts, selectedServei === 'Tots' ? undefined : selectedServei)
          ]);
          const enrichedAnterior = enrichedAnteriorRaw.filter(t => t);
          const enrichedPosterior = enrichedPosteriorRaw.filter(t => t);
          setAdjacentResults({ anterior: enrichedAnterior.map(t => ({ ...t, adjacentCode: anteriorId })), posterior: enrichedPosterior.map(t => ({ ...t, adjacentCode: posteriorId })) });
        }


        if (!searchedCirc) {
          setLoading(false);
          return;
        }

        const depOrigen = searchedCirc.inici;
        const sortidaMin = getFgcMinutes(searchedCirc.sortida) || 0;
        const arribadaMin = getFgcMinutes(searchedCirc.arribada) || 0;
        const enrichedAllRaw = await fetchFullTurns(allShifts.map(s => s.id), selectedServei === 'Tots' ? undefined : selectedServei);
        const enrichedAll = enrichedAllRaw.filter(t => t);

        const itinerary = [
          { nom: searchedCirc.inici, hora: searchedCirc.sortida },
          ...(searchedCirc.estacions || []),
          { nom: searchedCirc.final, hora: searchedCirc.arribada }
        ];
        const itineraryStationNames = Array.from(new Set(itinerary.map((p: any) => p.nom).filter(Boolean)));

        const { data: globalBulkDataRaw } = await supabase
          .from('circulations')
          .select('*')
          .in('inici', itineraryStationNames)
          .gte('sortida', formatFgcTime(Math.max(0, sortidaMin - 20)));

        const globalBulkReturns = (globalBulkDataRaw || [])
          .map(c => ({ ...c, _sMin: getFgcMinutes(c.sortida) || 0 }))
          .sort((a, b) => a._sMin - b._sMin);

        const restingRes: any[] = [];
        const extensibleRes: any[] = [];
        const reserveRes: any[] = [];

        for (const tData of enrichedAll) {
          try {
            if (!tData) continue;
            const segs = getSegments(tData);
            const [h, m] = (tData.duracio || "00:00").split(':').map(Number);
            const originalDurationMin = h * 60 + m;
            const maxExtensionCapacityMinRaw = 525 - originalDurationMin;
            let maxExtensionCapacityMin = maxExtensionCapacityMinRaw;

            const currentRestSeg = segs.find(seg => seg.type === 'gap' && seg.codi.toUpperCase() === depOrigen.toUpperCase() && seg.start <= sortidaMin && seg.end > sortidaMin);
            if (currentRestSeg) {
              const availableTime = currentRestSeg.end - sortidaMin;
              const conflictMinutes = Math.max(0, arribadaMin - currentRestSeg.end);
              const nextCirculation = segs.find(seg => seg.type === 'circ' && seg.start >= currentRestSeg.end);
              const nextCircCode = nextCirculation?.codi;
              let nextOriginStation = null;

              if (nextCircCode) {
                const nc = tData.fullCirculations?.find((c: any) => c.codi === nextCircCode);
                if (nc) {
                  if (nc.codi === 'Viatger') nextOriginStation = nc.final || nc.machinistInici;
                  else nextOriginStation = nc.machinistInici || nc.inici;
                }
              }
              restingRes.push({ ...tData, restSeg: currentRestSeg, availableTime, conflictMinutes, nextCirculation, nextOriginStation });
            }

            if (maxExtensionCapacityMin > 0) {
              const isAtOriginAtDeparture = segs.find(seg => seg.type === 'gap' && seg.codi.toUpperCase() === depOrigen.toUpperCase() && seg.start <= sortidaMin && seg.end > sortidaMin);
              if (isAtOriginAtDeparture) {
                const hasConflictsTotal = segs.some(seg => seg.type === 'circ' && seg.start >= sortidaMin && seg.start < (arribadaMin + (arribadaMin - sortidaMin) + 10));
                if (!hasConflictsTotal) {
                  const shiftFinalMin = getFgcMinutes(tData.final_torn) || 0;
                  const extraNeededTotal = Math.max(0, (arribadaMin + (arribadaMin - sortidaMin) + 10) - shiftFinalMin);
                  if (extraNeededTotal <= maxExtensionCapacityMin) {
                    extensibleRes.push({ ...tData, extData: { extraNeeded: extraNeededTotal, originalDuration: originalDurationMin, estimatedReturn: (arribadaMin + (arribadaMin - sortidaMin) + 10) } });
                  }
                }

                let bestIntercept: any = null;

                for (let i = 0; i < itinerary.length; i++) {
                  const point = itinerary[i];
                  const pointMin = getFgcMinutes(point.hora || point.arribada || point.sortida) || 0;
                  const pointNameRaw = (point.nom || '');
                  const pointNameNorm = normalizeStr(pointNameRaw);

                  const candidates = RESERVAS_DATA.filter(r =>
                    (pointNameNorm === r.loc || pointNameNorm.includes(r.loc) || r.loc.includes(pointNameNorm)) &&
                    isReserveActive(r, pointMin)
                  );

                  for (const reserve of candidates) {
                    let driverTarget = tData.dependencia;
                    const nextCirc = segs.find(s => s.type === 'circ' && s.start >= pointMin);
                    if (nextCirc) {
                      const nc = tData.fullCirculations?.find((c: any) => c.codi === nextCirc.codi);
                      if (nc) driverTarget = nc.machinistInici || nc.inici;
                    }

                    let driverReturnTrain = null;
                    let returnToOriginTimeMin = pointMin + 45;

                    if (driverTarget) {
                      const minDMin = pointMin + 2;
                      const validD = globalBulkReturns.find(c =>
                        c.inici?.trim().toUpperCase() === pointNameRaw.trim().toUpperCase() &&
                        c._sMin >= minDMin &&
                        (normalizeStr(c.final || '').includes(driverTarget) || (c.estacions && c.estacions.some((s: any) => normalizeStr(s.nom || '').includes(driverTarget))))
                      );

                      if (validD) {
                        driverReturnTrain = validD;
                        let arr = getFgcMinutes(validD.arribada) || 0;
                        if (validD.estacions) {
                          const st = validD.estacions.find((s: any) => normalizeStr(s.nom || '').includes(driverTarget));
                          if (st) arr = getFgcMinutes(st.hora || st.arribada) || 0;
                        }
                        returnToOriginTimeMin = arr + 5;
                      }
                    }

                    const hasConflictsPartial = segs.some(seg => seg.type === 'circ' && seg.start >= sortidaMin && seg.start < returnToOriginTimeMin);
                    if (!hasConflictsPartial) {
                      const shiftFinalMin = getFgcMinutes(tData.final_torn) || 0;
                      const extraNeededPartial = Math.max(0, returnToOriginTimeMin - shiftFinalMin);

                      if (extraNeededPartial <= maxExtensionCapacityMin) {
                        const isEndBase = normalizeStr(searchedCirc.final || '').includes(reserve.loc);
                        const reserveFinishTime = arribadaMin + (isEndBase ? 0 : 45) + 7;
                        const reserveEndShift = getFgcMinutes(reserve.end) || 0;
                        const reserveTotalExtra = Math.max(0, reserveFinishTime - reserveEndShift);

                        let reserveStatus = 'ok';
                        let secondaryResInfo: any = null;
                        let primaryReturnCirc: any = null;

                        if (reserveTotalExtra > 45) {
                          reserveStatus = 'relay_needed';
                          for (let j = i + 1; j < itinerary.length; j++) {
                            const relaySt = itinerary[j];
                            const relayMin = getFgcMinutes(relaySt.hora || relaySt.arribada || relaySt.sortida) || 0;
                            const relayNameNorm = normalizeStr(relaySt.nom || '');
                            const relayCandidates = RESERVAS_DATA.filter(r2 =>
                              r2.id !== reserve.id && (relayNameNorm === r2.loc || relayNameNorm.includes(r2.loc)) && isReserveActive(r2, relayMin)
                            );

                            if (relayCandidates.length > 0) {
                              const relayReserve = relayCandidates[0];
                              const minDMin = relayMin + 2;
                              const validReturn = globalBulkReturns.find(c =>
                                c.inici?.trim().toUpperCase() === (relaySt.nom || '').trim().toUpperCase() &&
                                c._sMin >= minDMin &&
                                (normalizeStr(c.final || '').includes(reserve.loc) || (c.estacions && c.estacions.some((s: any) => normalizeStr(s.nom || '').includes(reserve.loc))))
                              );

                              if (validReturn) {
                                let arr = getFgcMinutes(validReturn.arribada) || 0;
                                if (validReturn.estacions) {
                                  const stop = validReturn.estacions.find((s: any) => normalizeStr(s.nom || '').includes(reserve.loc));
                                  if (stop) arr = getFgcMinutes(stop.hora || stop.arribada) || 0;
                                }
                                const primaryExtraWithRelay = Math.max(0, arr + 7 - reserveEndShift);
                                if (primaryExtraWithRelay <= 45) {
                                  const isRelayEndBase = normalizeStr(searchedCirc.final || '').includes(relayReserve.loc);
                                  const relayEndShift = getFgcMinutes(relayReserve.end) || 0;
                                  const relayExtra = Math.max(0, arribadaMin + (isRelayEndBase ? 0 : 45) + 7 - relayEndShift);
                                  if (relayExtra <= 45) {
                                    secondaryResInfo = {
                                      id: relayReserve.id, loc: relayReserve.loc, station: relaySt.nom,
                                      time: formatFgcTime(relayMin), extra: relayExtra,
                                      primaryExtraAfterRelay: primaryExtraWithRelay, returnCirculation: validReturn
                                    };
                                    break;
                                  }
                                }
                              }
                            }
                          }
                        } else if (reserveTotalExtra > 0) {
                          reserveStatus = 'extended';
                        }

                        if (reserveStatus !== 'relay_needed' && !isEndBase) {
                          const minDMin = arribadaMin + 5;
                          primaryReturnCirc = globalBulkReturns.find(c =>
                            c.inici?.trim().toUpperCase() === (searchedCirc.final || '').trim().toUpperCase() &&
                            c._sMin >= minDMin &&
                            (normalizeStr(c.final || '').includes(reserve.loc) || (c.estacions && c.estacions.some((s: any) => normalizeStr(s.nom || '').includes(reserve.loc))))
                          );
                        }

                        if (reserveStatus === 'relay_needed' && !secondaryResInfo) continue;
                        const finalPrimaryExtra = secondaryResInfo ? secondaryResInfo.primaryExtraAfterRelay : reserveTotalExtra;
                        if (!bestIntercept || pointMin < bestIntercept.time) {
                          bestIntercept = {
                            time: pointMin, interceptTime: formatFgcTime(pointMin), name: pointNameRaw,
                            reservaId: reserve.id, extraNeeded: extraNeededPartial, reserveExtraNeeded: finalPrimaryExtra,
                            reserveStatus: reserveStatus, secondaryRes: secondaryResInfo, driverReturnCirc: driverReturnTrain,
                            primaryReturnCirc: primaryReturnCirc, originalDuration: originalDurationMin
                          };
                        }
                      }
                    }
                  }
                }
                if (bestIntercept) {
                  reserveRes.push({ ...tData, resData: { ...bestIntercept, originalDuration: originalDurationMin, interceptTime: formatFgcTime(bestIntercept.time) } });
                }
              }
            }
          } catch (e) {
            console.error("Error processing driver in update loop:", e);
          }
        }

        let finalRestingResults = restingRes;
        try {
          const nextOrigins = new Set<string>();
          restingRes.forEach(r => {
            if (r.nextCirculation) {
              const nextCircFull = r.fullCirculations?.find((c: any) => c.codi === r.nextCirculation.codi);
              if (nextCircFull && nextCircFull.machinistInici) nextOrigins.add(nextCircFull.machinistInici);
            }
          });
          const returnMap: Record<string, any[]> = {};
          if (nextOrigins.size > 0 && searchedCirc) {
            const bufferMin = 2;
            const minDepartureMin = arribadaMin + bufferMin;
            const departureTimeStr = formatFgcTime(minDepartureMin);
            const { data: returnCircs, error: retErr } = await supabase
              .from('circulations')
              .select('id, sortida, arribada, inici, final, linia')
              .eq('inici', searchedCirc.final)
              .gte('sortida', departureTimeStr)
              .order('sortida')
              .limit(50);
            if (!retErr && returnCircs) returnMap[searchedCirc.final] = returnCircs;
          }

          finalRestingResults = restingRes.map(r => {
            if (!r.nextCirculation) return r;
            const nextCircFull = r.fullCirculations?.find((c: any) => c.codi === r.nextCirculation.codi);
            const nextOrigin = nextCircFull?.machinistInici || r.dependencia;
            if (!nextOrigin) return { ...r, returnStatus: 'unknown' };
            if (nextOrigin === searchedCirc.final) return { ...r, returnStatus: 'same_station' };
            const candidateReturns = returnMap[searchedCirc.final] || [];
            const validReturn = candidateReturns.find((c: any) => c.final === nextOrigin);
            if (validReturn) {
              const returnArrMin = getFgcMinutes(validReturn.arribada) || 0;
              const nextStartMin = r.nextCirculation.start;
              if (returnArrMin <= nextStartMin - 1) return { ...r, returnStatus: 'ok', returnCirc: validReturn };
              else return { ...r, returnStatus: 'too_late', returnCirc: validReturn };
            }
            return { ...r, returnStatus: 'no_route' };
          });
        } catch (eReturn) {
          console.error("Error calculating returns:", eReturn);
          finalRestingResults = restingRes;
        }

        setRestingResults(finalRestingResults.sort((a, b) => (b.restSeg.end - b.restSeg.start) - (a.restSeg.end - a.restSeg.start)));
        setExtensibleResults(extensibleRes.sort((a, b) => a.extData.extraNeeded - b.extData.extraNeeded));
        setReserveInterceptResults(reserveRes.sort((a, b) => a.resData.extraNeeded - b.resData.extraNeeded));
      }

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };


  const isReserveActive = (res: any, timeMin: number) => {
    const start = getFgcMinutes(res.start as string | undefined);
    const end = getFgcMinutes(res.end as string | undefined);
    if (start === null || end === null) return false;
    if (start > end) {
      return timeMin >= start || timeMin < end;
    }
    return timeMin >= start && timeMin < end;
  };

  const resetAllModeData = () => {
    setMode('INIT'); setQuery(''); setSearchedCircData(null); setMainDriverInfo(null);
    setPassengerResults([]); setAdjacentResults({ anterior: [], posterior: [] }); setRestingResults([]); setExtensibleResults([]); setReserveInterceptResults([]);
    setSelectedCutStations(new Set()); setSelectedCutSegments(new Set()); setAltServiceIsland(null);
  };

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

  const clearAllCuts = () => { setSelectedCutStations(new Set()); setSelectedCutSegments(new Set()); setAltServiceIsland(null); };

  const getConnectivityIslands = () => {
    const graph: Record<string, string[]> = {};
    MAP_STATIONS.forEach(s => graph[s.id] = []);
    MAP_SEGMENTS.forEach(seg => {
      const isV1Blocked = selectedCutSegments.has(`${seg.from}-${seg.to}-V1`) || selectedCutSegments.has(`${seg.to}-${seg.from}-V1`);
      const isV2Blocked = selectedCutSegments.has(`${seg.from}-${seg.to}-V2`) || selectedCutSegments.has(`${seg.to}-${seg.from}-V2`);
      const isSegmentBlocked = isV1Blocked && isV2Blocked; // Only impassable if both tracks are cut

      const isFromBlocked = selectedCutStations.has(seg.from);
      const isToBlocked = selectedCutStations.has(seg.to);
      if (!isSegmentBlocked && !isFromBlocked && !isToBlocked) {
        graph[seg.from].push(seg.to);
        graph[seg.to].push(seg.from);
      }
    });
    const getReachable = (startNode: string) => {
      if (selectedCutStations.has(startNode)) return new Set<string>();
      const visited = new Set<string>();
      const queue = [startNode];
      while (queue.length > 0) {
        const node = queue.shift()!;
        if (!visited.has(node)) {
          visited.add(node);
          (graph[node] || []).forEach(neighbor => {
            if (!visited.has(neighbor)) queue.push(neighbor);
          });
        }
      }
      return visited;
    };
    return { BCN: getReachable('PC'), S1: getReachable('NA'), S2: getReachable('PN'), L6: getReachable('RE'), L7: getReachable('TB') };
  };

  /* 
    Logic for identifying affected trains:
    1. Single Station: Train is exactly at the station.
    2. Station Range (2 stations selected): Train is at any station in the shortest path between them (inclusive).
    3. Segment: Train is MOVING in the segment defined by the cut.
  */
  const dividedPersonnel = useMemo(() => {
    if (selectedCutStations.size === 0 && selectedCutSegments.size === 0) return null;

    // Calculate Affected Stations Set based on Range logic
    let effectiveCutStations = new Set(selectedCutStations);
    if (selectedCutStations.size === 2) {
      const [s1, s2] = Array.from(selectedCutStations);
      const path = getFullPath(s1, s2);
      if (path.length > 0) {
        path.forEach(s => effectiveCutStations.add(s));
      }
    }

    const islands = getConnectivityIslands();
    const vallesUnified = islands.S1.has('PN') || islands.S2.has('NA');
    const result: Record<string, { list: LivePersonnel[], stations: Set<string>, isUnified: boolean, label: string }> = {
      AFFECTED: { list: [], stations: effectiveCutStations, isUnified: false, label: 'Zona de Tall / Atrapats' },
      BCN: { list: [], stations: islands.BCN, isUnified: false, label: 'Illa Barcelona' },
      S1: { list: [], stations: islands.S1, isUnified: false, label: 'Illa S1 (Terrassa)' },
      S2: { list: [], stations: islands.S2, isUnified: false, label: 'Illa S2 (Sabadell)' },
      VALLES: { list: [], stations: new Set([...Array.from(islands.S1), ...Array.from(islands.S2)]), isUnified: vallesUnified, label: 'Illa Vallès (S1+S2)' },
      L6: { list: [], stations: islands.L6, isUnified: false, label: 'Illa L6' },
      L7: { list: [], stations: islands.L7, isUnified: false, label: 'Illa L7' },
      ISOLATED: { list: [], stations: new Set(), isUnified: false, label: 'Zones Aïllades' }
    };

    liveData.forEach(p => {
      const st = p.stationId.toUpperCase();
      let isAffected = false;

      // 1. Check Stations (Effective Range)
      if (effectiveCutStations.has(st) && !p.isMoving) {
        isAffected = true;
      }

      // 2. Check Segments (Moving Trains)
      if (!isAffected && p.isMoving && p.nextStationId) {
        // Construct segment ID potentially blocked
        // ID format: FROM-TO-VX
        // We check both V1 and V2 for simplicity of "Cut Zone", or match specifically?
        // User request: "appear if I select a section between stations and there are trains in that concrete section"

        // We check if the segment we are on is cut.
        // Since we don't track V1/V2 perfectly in liveData without deep logic, we check if ANY track is cut?
        // Or we rely on the Segment ID check.
        const segIdV1 = `${st}-${p.nextStationId}-V1`;
        const segIdV2 = `${st}-${p.nextStationId}-V2`;
        const segIdV1Rev = `${p.nextStationId}-${st}-V1`;
        const segIdV2Rev = `${p.nextStationId}-${st}-V2`;

        if (selectedCutSegments.has(segIdV1) || selectedCutSegments.has(segIdV2) || selectedCutSegments.has(segIdV1Rev) || selectedCutSegments.has(segIdV2Rev)) {
          isAffected = true;
        }
      }

      // Also catch trains that are STATIONED but the user selected 2 stations including this one (covered by effectiveCutStations)
      if (!isAffected && effectiveCutStations.has(st)) {
        isAffected = true;
      }

      if (isAffected) result.AFFECTED.list.push(p);
      else if (islands.BCN.has(st)) result.BCN.list.push(p);
      else if (vallesUnified && (islands.S1.has(st) || islands.S2.has(st))) result.VALLES.list.push(p);
      else if (islands.S1.has(st)) result.S1.list.push(p);
      else if (islands.S2.has(st)) result.S2.list.push(p);
      else if (islands.L6.has(st)) result.L6.list.push(p);
      else if (islands.L7.has(st)) result.L7.list.push(p);
      else result.ISOLATED.list.push(p);
    });
    return result;
  }, [liveData, selectedCutStations, selectedCutSegments]);

  const groupedRestPersonnel = useMemo(() => {
    const rest = liveData.filter(p => p.type === 'REST' && isServiceVisible(p.servei, selectedServei));
    const grouped: Record<string, LivePersonnel[]> = {};
    rest.forEach(p => { if (!grouped[p.stationId]) grouped[p.stationId] = []; grouped[p.stationId].push(p); });
    return grouped;
  }, [liveData, selectedServei]);

  const CompactRow: React.FC<{ torn: any, color: string, label?: React.ReactNode, sub?: string }> = ({ torn, color, label, sub }) => (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all flex items-center gap-4 border-l-4 ${color}`}>
      <div className="h-10 min-w-[2.5rem] px-2 bg-fgc-grey/10 dark:bg-black text-fgc-grey dark:text-gray-300 rounded-xl flex items-center justify-center font-black text-xs shrink-0">{torn.id}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2"><p className="text-sm font-black text-fgc-grey dark:text-gray-200 truncate uppercase">{torn.drivers[0]?.cognoms}, {torn.drivers[0]?.nom}</p>{label}</div>
        <p className="text-[8px] font-black text-gray-300 dark:text-gray-600 uppercase tracking-widest truncate">Nom. {torn.drivers[0]?.nomina} • {torn.inici_torn}-{torn.final_torn} {sub ? `• ${sub}` : ''}</p>
      </div>
      <div className="flex gap-1 shrink-0">{torn.drivers[0]?.phones?.map((p: string, i: number) => (
        <a key={i} href={isPrivacyMode ? undefined : `tel:${p}`} className={`w-9 h-9 bg-fgc-grey dark:bg-black text-white rounded-xl flex items-center justify-center hover:bg-fgc-green transition-all shadow-sm ${isPrivacyMode ? 'cursor-default' : ''}`}><Phone size={14} /></a>
      ))}</div>
    </div>
  );

  const ListPersonnelRow: React.FC<{ item: LivePersonnel; variant: 'normal' | 'affected'; isDisplaced?: boolean }> = ({ item, variant, isDisplaced }) => {
    const isRest = item.type === 'REST';
    return (
      <div className={`px-4 py-2.5 flex items-center justify-between transition-all group hover:bg-gray-50 dark:hover:bg-white/5 ${variant === 'affected' ? 'bg-red-50/20' : ''}`}>
        <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
          {isDisplaced && (
            <div className="flex items-center justify-center p-2 bg-red-500 rounded-xl text-white shadow-lg animate-pulse" title="Maquinista desplaçat de la seva zona d'inici">
              <Bell size={16} fill="currentColor" />
            </div>
          )}
          {(!isRest && (variant === 'affected' || manualOverrides[item.id])) && (
            <div className="relative">
              <button
                onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                className={`p-2 rounded-xl transition-all shadow-sm flex items-center justify-center ${openMenuId === item.id ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-500' : manualOverrides[item.id] ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-[#fff1e6] text-[#f97316] hover:bg-[#ffe2cc]'}`}
                title={manualOverrides[item.id] ? "Mogut manualment" : "Moure a una altra zona"}
              >
                <Repeat size={16} />
              </button>

              {openMenuId === item.id && (
                <div className="absolute left-0 top-full mt-2 w-56 sm:w-64 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 z-[300] py-4 animate-in fade-in slide-in-from-top-2">
                  <div className="px-4 pb-3 border-b border-gray-50 dark:border-white/5 mb-2">
                    <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Moure {item.id} a...</p>
                  </div>
                  <div className="flex flex-col">
                    {manualOverrides[item.id] && (
                      <button
                        onClick={() => {
                          setManualOverrides(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                          setOpenMenuId(null);
                        }}
                        className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-left group mb-2 mx-2 rounded-xl"
                      >
                        <RotateCcw size={14} className="text-red-500" />
                        <span className="text-xs font-black text-red-600 dark:text-red-400 uppercase">Restaurar Original</span>
                      </button>
                    )}
                    {[
                      { id: 'BCN', label: 'Costat Pl. Catalunya', target: 'PC' },
                      { id: 'VALLES', label: 'Costat Vallès (S1 + S2)', target: 'SC' },
                      { id: 'S1', label: 'Ramal Terrassa S1', target: 'NA' },
                      { id: 'S2', label: 'Ramal Sabadell S2', target: 'PN' },
                      { id: 'L6', label: 'Reina Elisenda L12', target: 'RE' },
                      { id: 'L7', label: 'Ramal Tibidabo', target: 'TB' }
                    ].map((dest) => {
                      const island = dividedPersonnel?.[dest.id];
                      const vallesUnified = dividedPersonnel?.VALLES.isUnified;

                      // Filtres segons topologia
                      if (dest.id === 'VALLES' && !vallesUnified) return null;
                      if ((dest.id === 'S1' || dest.id === 'S2') && vallesUnified) return null;

                      if (!island || island.stations.size === 0) return null;

                      // Determinar estació de destí real dins de l'illa si la preferida no hi és
                      const finalTarget = island.stations.has(dest.target) ? dest.target : Array.from(island.stations)[0];

                      return (
                        <button
                          key={dest.id}
                          onClick={() => {
                            setManualOverrides(prev => ({ ...prev, [item.id]: finalTarget }));
                            setOpenMenuId(null);
                          }}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left group"
                        >
                          <Move size={14} className="text-gray-400 group-hover:text-blue-500" />
                          <span className="text-xs font-black text-fgc-grey dark:text-gray-200 uppercase">{dest.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className={`min-w-[60px] sm:min-w-[75px] px-2 py-1 rounded-lg text-[10px] sm:text-xs font-black text-white text-center shadow-sm flex items-center justify-center gap-1.5 ${isRest ? 'bg-fgc-green border border-fgc-green/30 text-fgc-grey' : ''}`} style={isRest ? {} : { backgroundColor: item.color }}>
            {isRest ? <Coffee size={12} /> : null} {isRest ? 'DES' : item.id}
          </div>
          <div className="bg-fgc-grey dark:bg-black text-white px-2 py-1 rounded text-[9px] sm:text-[10px] font-black min-w-[45px] text-center shrink-0 border border-white/10">{item.torn}</div>
          <p className={`text-[12px] sm:text-sm font-bold truncate uppercase ${variant === 'affected' ? 'text-red-700 dark:text-red-400 font-black' : isRest ? 'text-fgc-green font-black' : 'text-fgc-grey dark:text-gray-300'}`}>{item.driver}</p>
          <div className="hidden md:flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest"><MapPin size={10} className="text-gray-300" /> {item.stationId}</div>
        </div>
        <div className="flex items-center gap-2 pl-4">
          {item.phones && item.phones.length > 0 && (
            <a href={isPrivacyMode ? undefined : `tel:${item.phones[0]}`} className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all shadow-sm ${variant === 'affected' ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-100 dark:bg-black text-fgc-grey dark:text-gray-400 hover:bg-fgc-green hover:text-white'} ${isPrivacyMode ? 'cursor-default' : ''}`}>
              <Phone size={12} /> <span className="hidden sm:inline text-[10px] font-black">{isPrivacyMode ? '*** ** ** **' : item.phones[0]}</span>
            </a>
          )}
        </div>
      </div>
    );
  };

  const AlternativeServiceOverlay = ({ islandId }: { islandId: string }) => {
    const [viewMode, setViewMode] = useState<'RESOURCES' | 'CIRCULATIONS' | 'SHIFTS'>('RESOURCES');
    const [generatedCircs, setGeneratedCircs] = useState<any[]>([]);
    const [generating, setGenerating] = useState(false);

    if (!dividedPersonnel || !dividedPersonnel[islandId]) return null;
    const personnel = (dividedPersonnel[islandId].list || []).filter(p => isServiceVisible(p.servei, selectedServei));
    const islandStations = dividedPersonnel[islandId].stations;
    const physicalTrains = personnel.filter(p => p.type === 'TRAIN');
    const allDrivers = [...personnel];

    // Geographic Branch Detection refined by station sets
    const canSupportS1 = Array.from(islandStations).some(s => S1_STATIONS.includes(s));
    const canSupportS2 = Array.from(islandStations).some(s => S2_STATIONS.includes(s));
    const canSupportL6 = Array.from(islandStations).some(s => L6_STATIONS.includes(s));
    const canSupportL7Full = islandStations.has('PC') && islandStations.has('TB');
    const canSupportL7Local = islandStations.has('GR') && islandStations.has('TB') && !canSupportL7Full;
    const canSupportL12 = islandStations.has('SR') && islandStations.has('RE');

    const [lineCounts, setLineCounts] = useState<Record<string, number>>({
      S1: 0, S2: 0, L6: 0, L7: 0, L12: 0
    });
    const [manualHeadway, setManualHeadway] = useState<number | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);

    // Initial calculation for reasonable defaults
    useEffect(() => {
      if (isInitialized) return;

      const initial = { S1: 0, S2: 0, L6: 0, L7: 0, L12: 0 };
      let avTrains = physicalTrains.length;
      let avDrivers = allDrivers.length;

      const tryInc = (linia: string) => {
        if (avTrains > 0 && avDrivers > 0) {
          initial[linia as keyof typeof initial]++;
          avTrains--;
          avDrivers--;
          return true;
        }
        return false;
      };

      if (canSupportL12) tryInc("L12");

      if (canSupportL7Full || canSupportL7Local) {
        const l7TrainsInIsland = physicalTrains.filter(t => t.linia === 'L7' || t.linia === '300').length;
        let l7Target = l7TrainsInIsland >= 4 ? 3 : Math.max(2, l7TrainsInIsland);
        for (let i = 0; i < l7Target; i++) tryInc("L7");
      }

      let cycle = 0;
      while (avTrains > 0 && avDrivers > 0 && cycle < 30) {
        let changed = false;
        if (canSupportS1 && tryInc("S1")) changed = true;
        if (canSupportS2 && tryInc("S2")) changed = true;
        if (canSupportL6 && tryInc("L6")) changed = true;

        if (!changed) break;
        cycle++;
      }

      // Fallback if nothing assigned but resources available
      if (Object.values(initial).reduce((a, b) => a + b, 0) === 0 && avTrains > 0 && avDrivers > 0) {
        if (canSupportS1) initial.S1 = 1; else initial.S2 = 1;
      }

      setLineCounts(initial);
      setIsInitialized(true);
    }, [islandId, physicalTrains.length, allDrivers.length, isInitialized]);

    const updateCount = (linia: string, delta: number) => {
      setLineCounts(prev => {
        const nextValue = Math.max(0, prev[linia] + delta);
        const totalOther = Object.entries(prev)
          .filter(([k]) => k !== linia)
          .reduce((sum, [_, v]) => sum + v, 0);

        // Block if exceeding total physical trains or total drivers
        if (delta > 0 && (totalOther + nextValue > physicalTrains.length || totalOther + nextValue > allDrivers.length)) {
          return prev;
        }
        return { ...prev, [linia]: nextValue };
      });
    };

    const shuttlePlan = useMemo(() => {
      const availableTrains = [...physicalTrains];
      const availableDrivers = [...allDrivers];
      const formedServices: any[] = [];

      const tryAssign = (route: string, priority: string, liniaCode: string) => {
        if (availableTrains.length > 0 && availableDrivers.length > 0) {
          const train = availableTrains.shift();
          const driver = availableDrivers.shift();
          formedServices.push({ train, driver, route, priority, liniaCode });
          return true;
        }
        return false;
      };

      const getRouteForLinia = (linia: string) => {
        switch (linia) {
          case 'L12': return "L12 (Shuttle SR-RE)";
          case 'L7': return canSupportL7Full ? "L7 (Shuttle PC-TB)" : "L7 (Shuttle GR-TB)";
          case 'S1': return "S1 (Llançadora Terrassa)";
          case 'S2': return "S2 (Llançadora Sabadell)";
          case 'L6': return "L6 (Reforç Urbà)";
          default: return "Llançadora Local";
        }
      };

      // Order: L12, L6, L7, S1, S2
      const LINE_ORDER = ['L12', 'L6', 'L7', 'S1', 'S2'];

      LINE_ORDER.forEach(linia => {
        const count = lineCounts[linia] || 0;
        const route = getRouteForLinia(linia);
        const priority = (linia === 'S1' || linia === 'S2') ? 'ALTA' : 'MITJA';
        for (let i = 0; i < count; i++) {
          tryAssign(route, priority, linia);
        }
      });

      return formedServices;
    }, [lineCounts, physicalTrains, allDrivers, canSupportL7Full]);

    const handleGenerateCirculations = async () => {
      setGenerating(true);
      setViewMode('CIRCULATIONS');

      const REST_STATIONS = ['PC', 'SR', 'RE', 'TB', 'NA', 'PN', 'RB'];

      try {
        const { data: theoryCircs } = await supabase.from('circulations').select('*');
        if (!theoryCircs) return;

        const liniaPrefixes: Record<string, string> = { 'S1': 'D', 'S2': 'F', 'L6': 'A', 'L7': 'B', 'L12': 'L' };
        const liniaStationsRef: Record<string, string[]> = { 'S1': S1_STATIONS, 'S2': S2_STATIONS, 'L6': L6_STATIONS, 'L7': L7_STATIONS, 'L12': L12_STATIONS };

        const getEndpoints = (lineStations: string[]) => {
          const present = lineStations.filter(s => islandStations.has(s));
          if (present.length < 2) return null;
          const indices = present.map(s => lineStations.indexOf(s));
          const minIdx = Math.min(...indices);
          const maxIdx = Math.max(...indices);
          return { start: lineStations[minIdx], end: lineStations[maxIdx], length: maxIdx - minIdx };
        };

        const plan: any[] = [];
        const resourcesByLinia: Record<string, any[]> = {};
        shuttlePlan.forEach(s => {
          if (!resourcesByLinia[s.liniaCode]) resourcesByLinia[s.liniaCode] = [];
          resourcesByLinia[s.liniaCode].push(s);
        });

        const activeSimultaneous = Math.min(physicalTrains.length, allDrivers.length);
        const LINE_ORDER = ['L12', 'L6', 'L7', 'S1', 'S2'];

        // Initialize Driver Pool with current personnel
        let driverPool: any[] = allDrivers.map(d => ({
          ...d,
          currentStation: d.stationId,
          availableAt: displayMin,
          activeShiftEnd: d.shiftEndMin || 1620,
          activeShiftDep: d.shiftDep || d.stationId,
          tripCount: 0
        }));



        const DEPOT_NODES = ['PC', 'RE', 'COR', 'NA', 'PN', 'RB', 'SC', 'GR'];
        const islandDepots = DEPOT_NODES.filter(d => islandStations.has(d));

        for (const liniaCode of LINE_ORDER) {
          const count = lineCounts[liniaCode];
          if (count === 0) continue;

          const eps = getEndpoints(liniaStationsRef[liniaCode]);
          if (!eps) continue;

          const prefix = liniaPrefixes[liniaCode];
          const areaTheory = (theoryCircs as any[]).filter(c => c.linia === liniaCode);

          const lineTheory = (theoryCircs as any[]).filter(c => c.linia === liniaCode);
          let maxAscStartedNum = 0;
          let maxDescStartedNum = 0;
          let maxServiceTime = displayMin + 180; // Default buffer (3h)

          lineTheory.forEach(c => {
            const numPart = c.id.replace(/\D/g, '');
            const n = parseInt(numPart);
            const m = getFgcMinutes(c.sortida);

            // 1. Tracks latest standard started trains (0xx/1xx) for numbering
            if (m !== null && m <= displayMin) {
              if (!isNaN(n) && (numPart[0] === '0' || numPart[0] === '1')) {
                if (n % 2 !== 0) { // ODD = ASC
                  if (n > maxAscStartedNum) maxAscStartedNum = n;
                } else { // EVEN = DESC
                  if (n > maxDescStartedNum) maxDescStartedNum = n;
                }
              }
            }

            // 2. Tracks end of service in the island
            const hasTouch = [c.inici, c.final, ...(c.estacions?.map((s: any) => s.nom) || [])].some(st => islandStations.has(st));
            if (hasTouch && m !== null && m > maxServiceTime) {
              maxServiceTime = m;
            }
          });

          let nextAscNum = maxAscStartedNum + 2;
          let nextDescNum = maxDescStartedNum + 2;

          let refTravelTime = 15;
          const sample = areaTheory
            .filter(c => {
              const stops = [c.inici, ...(c.estacions?.map((s: any) => s.nom) || []), c.final];
              return stops.includes(eps.start) && stops.includes(eps.end);
            })
            .sort((a, b) => (getFgcMinutes(b.sortida) || 0) - (getFgcMinutes(a.sortida) || 0))[0];

          if (sample) {
            const stops = [sample.inici, ...(sample.estacions?.map((s: any) => s.nom) || []), sample.final];
            const times = [sample.sortida, ...(sample.estacions?.map((s: any) => s.hora || s.sortida) || []), sample.arribada];
            const i1 = stops.indexOf(eps.start);
            const i2 = stops.indexOf(eps.end);
            const t1 = getFgcMinutes(times[i1]);
            const t2 = getFgcMinutes(times[i2]);
            if (t1 !== null && t2 !== null) refTravelTime = Math.abs(t2 - t1);
          } else {
            const fullPath = getFullPath(eps.start, eps.end);
            refTravelTime = Math.max(8, (fullPath.length - 1) * 3);
          }

          // NEW: Penalty for Single Track Working (Via Única)
          const shuttlePath = getFullPath(eps.start, eps.end);
          let vuPenalty = 0;
          for (let i = 0; i < shuttlePath.length - 1; i++) {
            const u = shuttlePath[i];
            const v = shuttlePath[i + 1];
            const v1b = selectedCutSegments.has(`${u}-${v}-V1`) || selectedCutSegments.has(`${v}-${u}-V1`);
            const v2b = selectedCutSegments.has(`${u}-${v}-V2`) || selectedCutSegments.has(`${v}-${u}-V2`);
            // Exactly one blocked = Single Track Working
            if ((v1b && !v2b) || (!v1b && v2b)) {
              vuPenalty += 5; // 5 mins extra for wait/shuttle in VU
            }
          }
          refTravelTime += vuPenalty;

          const branchUnits = (resourcesByLinia[liniaCode] || []).map(u => ({
            ...u,
            currentDriverId: u.driver.torn,
            nextAvail: displayMin
          }));
          const numUnits = branchUnits.length;
          if (numUnits === 0) continue;

          const ratio = numUnits / (physicalTrains.length || 1);
          const activeOnThisBranch = Math.max(1, Math.floor(activeSimultaneous * ratio));
          const cycleTime = (refTravelTime * 2) + 12;
          // Use manualHeadway if set, otherwise calculate.
          const headway = manualHeadway || Math.max(10, Math.floor(cycleTime / activeOnThisBranch));

          let nextStartTimeAsc = displayMin + 2;
          let nextStartTimeDesc = displayMin + 2 + Math.floor(headway / 2);

          // We generate trips by alternating directions and units
          let step = 0;
          while (nextStartTimeAsc < maxServiceTime || nextStartTimeDesc < maxServiceTime) {
            const canGoAsc = nextStartTimeAsc < maxServiceTime;
            const canGoDesc = nextStartTimeDesc < maxServiceTime;

            let isAsc = (step % 2 === 0);
            if (isAsc && !canGoAsc) isAsc = false;
            else if (!isAsc && !canGoDesc) isAsc = true;

            let startTime = isAsc ? nextStartTimeAsc : nextStartTimeDesc;
            const originalStart = startTime;
            let endTime = startTime + refTravelTime;
            if (startTime > 1620) break;

            const unitIdx = step % numUnits;
            const unitObj = branchUnits[unitIdx];

            const origin = isAsc ? eps.start : eps.end;
            const dest = isAsc ? eps.end : eps.start;

            const isValidForTrip = (d: any, tEnd: number) => {
              if (!d) return false;
              if (tEnd > d.activeShiftEnd) return false;

              // Calculate specific return time to driver's base
              const returnPath = getFullPath(dest, d.activeShiftDep || 'PC');
              const returnDuration = Math.max(0, (returnPath.length - 1) * 3);

              if (tEnd + returnDuration > d.activeShiftEnd) return false;
              return true;
            };

            // 1. Unified Global Candidate Search: Look at ALL drivers in the pool
            const candidateList = driverPool.map(d => {
              const pathToOrigin = getFullPath(d.currentStation, origin);
              const travelTime = Math.max(0, (pathToOrigin.length - 1) * 3);
              const earliestArrival = Math.max(d.availableAt, displayMin + travelTime);

              const potentialStart = Math.max(startTime, earliestArrival);
              const potentialEnd = potentialStart + refTravelTime;

              return {
                driver: d,
                earliestArrival,
                potentialStart,
                potentialEnd,
                isValid: isValidForTrip(d, potentialEnd)
              };
            }).filter(c => c.isValid);

            let selectedCandidate = candidateList.sort((a, b) => {
              // Priority 1: Fewest trips (Essential for "Distribute among all")
              const countDiff = (a.driver.tripCount || 0) - (b.driver.tripCount || 0);
              if (countDiff !== 0) return countDiff;

              // Priority 2: Minimize delay (Earliest potential start)
              const timeDiff = a.potentialStart - b.potentialStart;
              if (timeDiff !== 0) return timeDiff;

              // Priority 3: Prefer those already at the station to avoid unnecessary travel
              if (a.driver.currentStation === origin && b.driver.currentStation !== origin) return -1;
              if (a.driver.currentStation !== origin && b.driver.currentStation === origin) return 1;

              // Priority 4: Tie-breaker - prefer current driver to minimize swaps if everything else is equal
              if (a.driver.torn === unitObj.currentDriverId) return -1;
              if (b.driver.torn === unitObj.currentDriverId) return 1;

              return 0;
            })[0];

            let selectedDriver = null;
            if (selectedCandidate) {
              // Update trip times based on when the selected driver can actually arrive
              startTime = selectedCandidate.potentialStart;
              endTime = selectedCandidate.potentialEnd;
              selectedDriver = selectedCandidate.driver;

              // Ensure subsequent trips in this direction are pushed back if we delayed this one
              if (isAsc) nextStartTimeAsc = startTime;
              else nextStartTimeDesc = startTime;

              unitObj.currentDriverId = selectedDriver.torn;
            }

            const activeDriver = selectedDriver || { driver: 'SENSE MAQUINISTA', torn: '---' };

            let tripNum = isAsc ? nextAscNum : nextDescNum;
            if (isAsc) nextAscNum += 2; else nextDescNum += 2;

            plan.push({
              id: `${prefix}A${tripNum.toString().padStart(3, '0')}`,
              delay: startTime - originalStart,
              servei: (activeDriver as any).servei,
              linia: liniaCode,
              train: unitObj.train.id,
              driver: activeDriver.driver || (activeDriver as any).driverName,
              torn: activeDriver.torn,
              shiftStart: (activeDriver as any).shiftStartMin !== undefined ? formatFgcTime((activeDriver as any).shiftStartMin) : '---',
              shiftEnd: (activeDriver as any).activeShiftEnd !== undefined ? formatFgcTime((activeDriver as any).activeShiftEnd) : '---',
              sortida: formatFgcTime(startTime),
              arribada: formatFgcTime(endTime),
              route: `${origin} → ${dest}`,
              direction: isAsc ? 'ASCENDENT' : 'DESCENDENT',
              startTimeMinutes: startTime,
              numValue: tripNum
            });

            if (selectedDriver) {
              selectedDriver.currentStation = dest;
              selectedDriver.availableAt = endTime + 4; // Turnaround
              selectedDriver.tripCount = (selectedDriver.tripCount || 0) + 1;
            }

            if (isAsc) nextStartTimeAsc += headway;
            else nextStartTimeDesc += headway;
            step++;
          }

          // --- NEW: Append Retirement (Retiro) Trips based on proximity ---
          branchUnits.forEach(u => {
            const lastTripOfUnit = plan.filter(p => p.train === u.train.id).sort((a, b) => b.startTimeMinutes - a.startTimeMinutes)[0];
            const fromStation = lastTripOfUnit ? lastTripOfUnit.route.split(' → ')[1] : u.train.stationId;
            const arrivalAtFrom = lastTripOfUnit ? getFgcMinutes(lastTripOfUnit.arribada) || displayMin : displayMin;

            // Find nearest depot in the island
            let targetDepot = '';
            let minDistance = 999;

            islandDepots.forEach(dep => {
              const path = getFullPath(fromStation, dep);
              if (path.length > 0 && path.length < minDistance) {
                minDistance = path.length;
                targetDepot = dep;
              }
            });

            if (targetDepot && fromStation !== targetDepot) {
              const startTime = Math.max(arrivalAtFrom + 5, maxServiceTime);
              const travelTime = Math.max(5, (minDistance - 1) * 3);
              plan.push({
                id: `V${u.train.id.replace(/\./g, '')}`,
                linia: liniaCode,
                train: u.train.id,
                driver: 'RETIR A DIPÒSIT',
                torn: '---',
                sortida: formatFgcTime(startTime),
                arribada: formatFgcTime(startTime + travelTime),
                route: `${fromStation} → ${targetDepot}`,
                direction: 'RETIR',
                startTimeMinutes: startTime,
                numValue: 999
              });
            }
          });
        }

        const finalPlan = Array.from(new Map(plan.map(p => [p.id, p])).values());

        // Sorting by time to process sequences
        const sortedByTime = finalPlan.sort((a, b) => a.startTimeMinutes - b.startTimeMinutes);

        // Group by unit to track transitions
        const unitSequences: Record<string, any[]> = {};
        sortedByTime.forEach(trip => {
          if (!unitSequences[trip.train]) unitSequences[trip.train] = [];
          unitSequences[trip.train].push(trip);
        });

        Object.values(unitSequences).forEach(trips => {
          for (let i = 0; i < trips.length; i++) {
            trips[i].prevId = i === 0 ? 'En circulació' : trips[i - 1].id;
            trips[i].nextId = i === trips.length - 1 ? 'Final de servei' : trips[i + 1].id;
          }
        });

        setGeneratedCircs(sortedByTime.sort((a, b) => {
          const lineDiff = LINE_ORDER.indexOf(a.linia) - LINE_ORDER.indexOf(b.linia);
          if (lineDiff !== 0) return lineDiff;
          return a.startTimeMinutes - b.startTimeMinutes || a.numValue - b.numValue;
        }));
      } catch (e) { console.error(e); } finally { setGenerating(false); }
    };

    const islandLabel = dividedPersonnel[islandId].label.replace("Illa ", "");
    const totalAssigned = Object.values(lineCounts).reduce((a, b) => a + b, 0);

    return (
      <div className="fixed bottom-0 left-0 right-0 top-20 sm:top-24 z-40 flex items-start justify-center p-4 sm:p-6 bg-black/40 dark:bg-black/60 backdrop-blur-md animate-in slide-in-from-bottom-8 duration-500 overflow-y-auto">
        <div className="bg-white dark:bg-gray-900 w-full max-w-6xl rounded-[40px] sm:rounded-[56px] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.5)] border border-gray-100 dark:border-white/5 overflow-hidden flex flex-col mb-12 relative animate-in zoom-in-95 duration-500">
          {/* Header */}
          <div className="p-8 border-b border-gray-100 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-gray-50/50 dark:bg-black/20">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-fgc-green rounded-2xl text-fgc-grey shadow-lg"><Activity size={24} /></div>
              <div>
                <h3 className="text-xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Pla de Servei Alternatiu</h3>
                <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{islandLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 bg-white dark:bg-gray-800 px-3 py-2 rounded-xl border border-gray-100 dark:border-white/10 shadow-sm">
                <div className="flex items-center gap-2 mr-2 border-r border-gray-100 dark:border-white/10 pr-3">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Freq.</span>
                  <button
                    onClick={() => {
                      if (!manualHeadway) setManualHeadway(15);
                      else setManualHeadway(Math.max(1, manualHeadway - 1));
                    }}
                    className="w-6 h-6 flex items-center justify-center bg-gray-100 dark:bg-white/5 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 transition-colors"
                  >
                    <Minus size={12} />
                  </button>
                  <div className="flex flex-col items-center w-12">
                    <span className="text-sm font-black text-fgc-grey dark:text-gray-200 leading-none">{manualHeadway || '--'}</span>
                    <span className="text-[8px] font-bold text-gray-400 leading-none">min</span>
                  </div>
                  <button
                    onClick={() => {
                      if (!manualHeadway) setManualHeadway(15);
                      else setManualHeadway(manualHeadway + 1);
                    }}
                    className="w-6 h-6 flex items-center justify-center bg-gray-100 dark:bg-white/5 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 transition-colors"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                <button
                  onClick={async () => {
                    // AUTO CALCULATION LOGIC
                    const { data: theoryCircs } = await supabase.from('circulations').select('*');
                    if (!theoryCircs) return;
                    const liniaStationsRef: Record<string, string[]> = { 'S1': S1_STATIONS, 'S2': S2_STATIONS, 'L6': L6_STATIONS, 'L7': L7_STATIONS, 'L12': L12_STATIONS };

                    let maxTravelTime = 0;
                    let totalUnits = Object.values(lineCounts).reduce((a, b) => a + b, 0);
                    if (totalUnits === 0) return;

                    // Find longest route in island
                    // We iterate over LINES assigned
                    Object.entries(lineCounts).forEach(([linia, count]) => {
                      if (count === 0) return;
                      // Get endpoints for this line within island
                      const lineStops = liniaStationsRef[linia];
                      if (!lineStops) return;
                      const islandLineStops = lineStops.filter(s => islandStations.has(s));
                      if (islandLineStops.length < 2) return;

                      const start = islandLineStops[0];
                      const end = islandLineStops[islandLineStops.length - 1];

                      // Find reference trip time
                      const sample = (theoryCircs as any[])
                        .filter(c => c.linia === linia && getFgcMinutes(c.sortida) <= displayMin)
                        .sort((a, b) => getFgcMinutes(b.sortida) - getFgcMinutes(a.sortida))[0]
                        || (theoryCircs as any[]).find(c => c.linia === linia); // Fallback to any

                      if (sample) {
                        // Calculate time between start and end
                        const stops = [sample.inici, ...(sample.estacions?.map((s: any) => s.nom) || []), sample.final];
                        const times = [sample.sortida, ...(sample.estacions?.map((s: any) => s.hora || s.sortida) || []), sample.arribada];

                        const idx1 = stops.indexOf(start);
                        const idx2 = stops.indexOf(end);

                        if (idx1 !== -1 && idx2 !== -1) {
                          const t1 = getFgcMinutes(times[idx1]);
                          const t2 = getFgcMinutes(times[idx2]);
                          const duration = Math.abs(t2 - t1);
                          if (duration > maxTravelTime) maxTravelTime = duration;
                        }
                      } else {
                        // Fallback generic calculation
                        const dist = Math.abs(islandLineStops.indexOf(start) - islandLineStops.indexOf(end));
                        const duration = dist * 3; // Approx 3 min per station
                        if (duration > maxTravelTime) maxTravelTime = duration;
                      }
                    });

                    if (maxTravelTime > 0) {
                      // Formula: (RoundTrip + Turnaround*2) / Units
                      const roundTrip = maxTravelTime * 2;
                      const turnaround = 6; // 3 min each end
                      const totalLoop = roundTrip + turnaround;
                      const optimalFreq = Math.round((totalLoop / totalUnits) * 10) / 10; // 1 decimal

                      // User requested minute by minute, so lets round to nearest minute or 0.5? 
                      // Input handles integers usually, but exact calc is better. Steps are 1.
                      // Let's round to nearest minute for simplicity in integer input
                      setManualHeadway(Math.max(1, Math.round(optimalFreq)));
                    }
                  }}
                  className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                  title="Calcular freqüència automàtica òptima"
                >
                  <Wand2 size={14} className="group-hover:rotate-12 transition-transform" />
                  <span className="text-[10px] font-black uppercase tracking-wider">AUTO</span>
                </button>
              </div>
              <button
                onClick={handleGenerateCirculations}
                className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-black text-sm transition-all shadow-xl active:scale-95 bg-blue-600 text-white hover:bg-blue-700`}
              >
                <FilePlus size={18} /> GENERAR MALLA
              </button>
              <button
                onClick={async () => {
                  await handleGenerateCirculations();
                  setViewMode('SHIFTS');
                }}
                className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-black text-sm transition-all shadow-xl active:scale-95 bg-purple-600 text-white hover:bg-purple-700`}
              >
                <Users size={18} /> GENERAR TORNS
              </button>
              <button onClick={() => setAltServiceIsland(null)} className="p-3 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 rounded-full transition-colors"><X size={28} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
            {viewMode === 'RESOURCES' ? (
              <>
                <div className="flex items-center justify-between px-2">
                  <h4 className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.3em]">Configuració Manual de Recursos</h4>
                  <div className="flex gap-4">
                    <span className="bg-gray-100 dark:bg-white/5 px-3 py-1 rounded-full text-[10px] font-black text-gray-500 uppercase tracking-widest">{totalAssigned} de {physicalTrains.length} Unitats Disp.</span>
                    <span className="bg-gray-100 dark:bg-white/5 px-3 py-1 rounded-full text-[10px] font-black text-gray-500 uppercase tracking-widest">{totalAssigned} de {allDrivers.length} Maquinistes Disp.</span>
                  </div>
                </div>

                {/* Resource Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                  {/* Total Trens */}
                  <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-[32px] border border-blue-100 dark:border-blue-900/30 flex flex-col items-center justify-center text-center">
                    <Train className="text-blue-500 mb-2" size={32} />
                    <span className="text-4xl font-black text-blue-700 dark:text-blue-400">{physicalTrains.length}</span>
                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest mt-1">Total Trens</span>
                  </div>

                  {/* S1 + S2 */}
                  <div className="bg-orange-50/30 dark:bg-orange-950/10 p-6 rounded-[32px] border border-orange-100 dark:border-orange-900/30 flex flex-col items-center justify-between">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-xs font-black text-orange-600">S1</span>
                      <span className="text-gray-300 text-xs font-black">+</span>
                      <span className="text-xs font-black text-green-600">S2</span>
                    </div>
                    <div className="flex w-full justify-around items-center">
                      {/* S1 */}
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-[8px] font-black text-orange-400 uppercase">S1</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateCount('S1', -1)} className="p-1 hover:bg-orange-100 dark:hover:bg-white/5 rounded-lg text-orange-500 transition-colors"><Minus size={14} /></button>
                          <span className="text-2xl font-black text-fgc-grey dark:text-white leading-none">{lineCounts.S1}</span>
                          <button onClick={() => updateCount('S1', 1)} className="p-1 hover:bg-orange-100 dark:hover:bg-white/5 rounded-lg text-orange-500 transition-colors"><Plus size={14} /></button>
                        </div>
                      </div>
                      <div className="w-px h-8 bg-orange-100 dark:bg-white/10" />
                      {/* S2 */}
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-[8px] font-black text-green-500 uppercase">S2</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateCount('S2', -1)} className="p-1 hover:bg-green-100 dark:hover:bg-white/5 rounded-lg text-green-500 transition-colors"><Minus size={14} /></button>
                          <span className="text-2xl font-black text-fgc-grey dark:text-white leading-none">{lineCounts.S2}</span>
                          <button onClick={() => updateCount('S2', 1)} className="p-1 hover:bg-green-100 dark:hover:bg-white/5 rounded-lg text-green-500 transition-colors"><Plus size={14} /></button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* L6 */}
                  <div className="bg-purple-50/50 dark:bg-purple-900/10 p-6 rounded-[32px] border border-purple-100 dark:border-purple-900/30 flex flex-col items-center justify-between">
                    <span className="text-xs font-black text-purple-600 uppercase mb-4 tracking-widest">L6</span>
                    <div className="flex items-center gap-4">
                      <button onClick={() => updateCount('L6', -1)} className="p-1 hover:bg-purple-100 dark:hover:bg-white/5 rounded-lg text-purple-500 transition-colors"><Minus size={16} /></button>
                      <span className="text-3xl font-black text-fgc-grey dark:text-white leading-none">{lineCounts.L6}</span>
                      <button onClick={() => updateCount('L6', 1)} className="p-1 hover:bg-purple-100 dark:hover:bg-white/5 rounded-lg text-purple-500 transition-colors"><Plus size={16} /></button>
                    </div>
                    <div className="mt-4 bg-purple-100 dark:bg-purple-900/30 w-full h-1 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500" style={{ width: `${(lineCounts.L6 / (physicalTrains.length || 1)) * 100}%` }} />
                    </div>
                  </div>

                  {/* L7 & L12 */}
                  <div className="bg-amber-50/30 dark:bg-amber-950/10 p-6 rounded-[32px] border border-amber-100 dark:border-amber-900/30 flex flex-col items-center justify-between">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-xs font-black text-amber-700">L7</span>
                      <span className="text-gray-300 text-xs font-black">&</span>
                      <span className="text-xs font-black text-purple-400">L12</span>
                    </div>
                    <div className="flex w-full justify-around items-center">
                      {/* L7 */}
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-[8px] font-black text-amber-600 uppercase">L7</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateCount('L7', -1)} className="p-1 hover:bg-amber-100 dark:hover:bg-white/5 rounded-lg text-amber-600 transition-colors"><Minus size={14} /></button>
                          <span className="text-2xl font-black text-fgc-grey dark:text-white leading-none">{lineCounts.L7}</span>
                          <button onClick={() => updateCount('L7', 1)} className="p-1 hover:bg-amber-100 dark:hover:bg-white/5 rounded-lg text-amber-600 transition-colors"><Plus size={14} /></button>
                        </div>
                      </div>
                      <div className="w-px h-8 bg-amber-100 dark:bg-white/10" />
                      {/* L12 */}
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-[8px] font-black text-purple-400 uppercase">L12</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateCount('L12', -1)} className="p-1 hover:bg-purple-100 dark:hover:bg-white/5 rounded-lg text-purple-400 transition-colors"><Minus size={14} /></button>
                          <span className="text-2xl font-black text-fgc-grey dark:text-white leading-none">{lineCounts.L12}</span>
                          <button onClick={() => updateCount('L12', 1)} className="p-1 hover:bg-purple-100 dark:hover:bg-white/5 rounded-lg text-purple-400 transition-colors"><Plus size={14} /></button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Maquinistes */}
                  <div className="bg-green-50 dark:bg-green-900/10 p-6 rounded-[32px] border border-green-100 dark:border-green-900/30 flex flex-col items-center justify-center text-center">
                    <User className="text-green-500 mb-2" size={32} />
                    <span className="text-4xl font-black text-green-700 dark:text-green-400">{allDrivers.length}</span>
                    <span className="text-[10px] font-black text-green-500 uppercase tracking-widest mt-1">Maquinistes</span>
                  </div>
                </div>

                <div className="space-y-4 pt-4">
                  <div className="flex items-center gap-2 px-2"><ShieldAlert size={16} className="text-red-500" /><h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Assignació de Recursos d'Illa (Per ordre de prioritat)</h4></div>
                  <div className="grid grid-cols-1 gap-3">
                    {shuttlePlan.map((s, idx) => (
                      <div key={idx} className="bg-white dark:bg-gray-800 rounded-[32px] p-6 border border-gray-100 dark:border-white/5 shadow-sm flex items-center justify-between gap-6 hover:shadow-xl transition-all group overflow-hidden relative">
                        <div className="flex items-center gap-6 flex-1 min-w-0 z-10">
                          <div className={`h-16 w-16 rounded-2xl flex items-center justify-center font-black text-white shadow-lg shrink-0 text-xl border-4 border-white/20`} style={{ backgroundColor: getLiniaColorHex(s.liniaCode) }}>
                            {s.liniaCode}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <p className="text-xl font-black text-fgc-grey dark:text-white uppercase truncate tracking-tight">{s.route}</p>
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${s.priority === 'ALTA' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-purple-50 text-purple-600 border-purple-100'}`}>Prioritat {s.priority}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                                <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 px-2 py-0.5 rounded-lg text-[10px] uppercase font-black">Unitat: {s.train.id}</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                                <span className="bg-green-50 dark:bg-green-900/20 text-green-600 px-2 py-0.5 rounded-lg text-[10px] uppercase font-black">Personal: {s.driver.driver}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 z-10">
                          {s.driver.phones?.map((p: string, i: number) => (
                            <a key={i} href={isPrivacyMode ? undefined : `tel:${p}`} className={`w-12 h-12 bg-gray-50 dark:bg-black text-fgc-grey dark:text-gray-400 rounded-2xl flex items-center justify-center hover:bg-fgc-green hover:text-white transition-all shadow-md border border-gray-100 dark:border-white/10 ${isPrivacyMode ? 'cursor-default' : ''}`}><Phone size={20} /></a>
                          ))}
                        </div>
                        {/* Background subtle decoration */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none group-hover:opacity-[0.06] transition-opacity">
                          <Train size={200} style={{ color: getLiniaColorHex(s.liniaCode) }} />
                        </div>
                      </div>
                    ))}
                    {shuttlePlan.length === 0 && (
                      <div className="py-20 text-center border-2 border-dashed border-gray-100 dark:border-white/5 rounded-[48px]">
                        <p className="text-gray-300 dark:text-gray-700 font-bold uppercase tracking-widest italic">Assigna unitats a les línies superiors per començar</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : viewMode === 'CIRCULATIONS' ? (
              <div className="space-y-6 animate-in slide-in-from-right duration-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 px-2"><LayoutGrid size={16} className="text-blue-500" /><h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Escaleta de Circulacions d'Emergència</h4></div>
                  <button onClick={() => setViewMode('RESOURCES')} className="text-[10px] font-black text-blue-500 hover:underline">← Tornar a recursos</button>
                </div>
                {generating ? (
                  <div className="py-20 flex flex-col items-center gap-4 opacity-30"><Loader2 className="animate-spin text-blue-500" size={48} /><p className="text-xs font-black uppercase tracking-widest">Sincronitzant malla teòrica...</p></div>
                ) : (
                  <div className="bg-gray-50 dark:bg-black/20 rounded-[32px] overflow-hidden border border-gray-100 dark:border-white/5">
                    <div className="grid grid-cols-8 bg-fgc-grey dark:bg-black text-white p-4 text-[10px] font-black uppercase tracking-widest">
                      <div>Codi</div><div>Tren Anterior</div><div>Torn Maquinista</div><div>Sortida</div><div>Arribada</div><div className="col-span-1">Ruta</div><div>Següent Circulació</div><div>Direcció</div>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-white/5">
                      {generatedCircs.map((c, idx) => (
                        <div key={idx} className="grid grid-cols-8 p-4 items-center hover:bg-white dark:hover:bg-white/5 transition-colors">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getLiniaColorHex(c.linia) }} />
                            <span className="font-black text-lg text-fgc-grey dark:text-white">{c.id}</span>
                          </div>
                          <div className="font-bold text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-tight">{c.prevId}</div>
                          <div className="flex flex-col">
                            <span className="font-black text-xs text-fgc-grey dark:text-white uppercase">{c.torn || '---'}</span>
                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 truncate">{c.driver}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="font-black text-sm text-orange-600 dark:text-orange-400 leading-none">{c.sortida}</span>
                            {c.delay > 0 && <span className="text-[9px] font-black text-red-500 animate-pulse">+{c.delay} min</span>}
                          </div>
                          <div className="font-black text-sm text-blue-600 dark:text-blue-400">{c.arribada}</div>
                          <div className="text-[10px] font-bold text-fgc-grey dark:text-gray-300 truncate">{c.route}</div>
                          <div className="font-bold text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-tight">{c.nextId}</div>
                          <div><span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${c.direction === 'ASCENDENT' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-green-50 text-green-600 border-green-100'}`}>{c.direction}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6 animate-in slide-in-from-right duration-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 px-2"><Users size={16} className="text-purple-500" /><h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Pla d'Assignació per Torn de Maquinista</h4></div>
                  <button onClick={() => setViewMode('RESOURCES')} className="text-[10px] font-black text-blue-500 hover:underline">← Tornar a recursos</button>
                </div>

                {generating ? (
                  <div className="py-20 flex flex-col items-center gap-4 opacity-30"><Loader2 className="animate-spin text-purple-500" size={48} /><p className="text-xs font-black uppercase tracking-widest">Organitzant torns d'emergència...</p></div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {(() => {
                      const groups: Record<string, any> = {};
                      generatedCircs.forEach(c => {
                        if (!c.torn || c.torn === '---') return;

                        let isShiftVisible = false;
                        if (selectedServei === 'Tots') {
                          isShiftVisible = true;
                        } else {
                          const s = (c as any).servei || '';
                          const t = c.linia || '';
                          const f = selectedServei;

                          const check = (val: string) => {
                            if (f === '400' || f === 'S1') return val === '400' || val === 'S1' || val.includes('S1');
                            if (f === '500' || f === 'S2') return val === '500' || val === 'S2' || val.includes('S2');
                            if (f === '100' || f === 'L6') return val === '100' || val === 'L6' || val.includes('L6');
                            if (f === '0' || f === 'L12') return val === '0' || val === 'L12' || val.includes('L12');
                            return val === f || val.includes(f) || f.includes(val);
                          };

                          isShiftVisible = check(s) || check(t);
                        }
                        if (!isShiftVisible) return;
                        if (!groups[c.torn]) {
                          groups[c.torn] = {
                            id: c.torn,
                            driver: c.driver,
                            start: c.shiftStart,
                            end: c.shiftEnd,
                            trips: []
                          };
                        }
                        groups[c.torn].trips.push(c);
                      });

                      return Object.values(groups).sort((a, b) => a.id.localeCompare(b.id)).map((g: any) => (
                        <div key={g.id} className="bg-white dark:bg-gray-800 rounded-[32px] border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden flex flex-col">
                          <div className="p-6 bg-gray-50/50 dark:bg-black/20 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/40 text-purple-600 rounded-2xl flex items-center justify-center font-black text-sm">{g.id}</div>
                              <div>
                                <p className="text-sm font-black text-fgc-grey dark:text-white uppercase truncate">{g.driver}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Horari: {g.start} - {g.end}</p>
                              </div>
                            </div>
                            <span className="text-[10px] font-black bg-purple-50 dark:bg-purple-900/20 text-purple-600 px-3 py-1 rounded-full uppercase">{g.trips.length} SERVEIS</span>
                          </div>
                          <div className="p-4 space-y-2">
                            {g.trips.map((t: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50/50 dark:bg-white/5 border border-gray-100/50 dark:border-white/5">
                                <div className="flex items-center gap-3">
                                  <div className="w-1.5 h-8 rounded-full" style={{ backgroundColor: getLiniaColorHex(t.linia) }} />
                                  <div>
                                    <p className="text-xs font-black text-fgc-grey dark:text-white uppercase">{t.id} - {t.route}</p>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase">Tren: {t.train}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs font-black text-purple-600">{t.sortida} - {t.arribada}</p>
                                  <p className="text-[8px] font-black text-gray-400 uppercase">{t.direction}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-8 border-t border-gray-100 dark:border-white/5 bg-gray-50/30 dark:bg-black/40">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4 p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/20 max-w-2xl">
                <Info size={20} className="text-blue-500 mt-1 shrink-0" />
                <div className="text-[10px] font-bold text-blue-700 dark:text-blue-300 leading-relaxed uppercase tracking-widest">
                  {(() => {
                    const hasVU = MAP_SEGMENTS.some(seg => {
                      if (!islandStations.has(seg.from) || !islandStations.has(seg.to)) return false;
                      const v1b = selectedCutSegments.has(`${seg.from}-${seg.to}-V1`) || selectedCutSegments.has(`${seg.to}-${seg.from}-V1`);
                      const v2b = selectedCutSegments.has(`${seg.from}-${seg.to}-V2`) || selectedCutSegments.has(`${seg.to}-${seg.from}-V2`);
                      return (v1b && !v2b) || (!v1b && v2b);
                    });
                    return (
                      <>
                        Les circulacions es generen amb una cadència de {manualHeadway || '15'} minuts, alternant sentits.
                        {hasVU && <span className="text-orange-600 dark:text-orange-400 block mt-1">⚠️ S'han detectat trams en Via Única: S'ha aplicat un increment de temps de viatge de +5 min per tram afectat.</span>}
                      </>
                    );
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-2 text-right">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Capacitat de zona</span>
                <div className="h-2 w-32 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-fgc-green" style={{ width: `${(totalAssigned / Math.max(1, physicalTrains.length)) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const TrainInspectorPopup = ({ train, onClose }: { train: LivePersonnel, onClose: () => void }) => {
    if (!train) return null;
    const isWorking = train.type === 'TRAIN';
    const liniaColor = train.color;

    return (
      <div className="z-[300] animate-in zoom-in-95 fade-in duration-300 pointer-events-auto">
        <div
          className="w-80 overflow-hidden relative group"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '32px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.05)'
          }}
        >
          {/* Animated Glow Background */}
          <div
            className="absolute -top-10 -right-10 w-32 h-32 blur-[50px] transition-all duration-700 opacity-30"
            style={{ backgroundColor: liniaColor }}
          />

          {/* Header */}
          <div className="p-6 border-b border-white/10 flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-1">Inspector d'Unitat</p>
              <h3 className="text-3xl font-black text-white font-mono tracking-tighter flex items-center gap-2">
                {train.id}
                <span className="w-2 h-2 rounded-full bg-fgc-green animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
              </h3>
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
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-fgc-green/30 transition-all">
                <User size={24} className="text-gray-400 group-hover:text-fgc-green transition-colors" />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest leading-none mb-1">Maquinista</p>
                <p className="text-sm font-black text-white dark:text-gray-200 uppercase">{train.driver}</p>
                <p className="text-[10px] font-bold text-fgc-green mt-1 tracking-widest uppercase">Torn {train.torn}</p>
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
                    width: '65%',
                    background: `linear-gradient(90deg, #3b82f6, ${liniaColor})`,
                    boxShadow: `0 0 10px ${liniaColor}66`
                  }}
                />
              </div>
            </div>

            {/* Telemetry Footer */}
            <div className="pt-4 border-t border-white/10 grid grid-cols-2 gap-4">
              <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Última Estació</p>
                <p className="text-xs font-black text-white dark:text-gray-200 uppercase">{train.stationId}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Estat</p>
                <p className="text-[10px] font-black text-fgc-green uppercase flex items-center gap-1.5 leading-none">
                  <div className="w-1 h-1 rounded-full bg-fgc-green" />
                  PUNTUAL
                </p>
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={() => {
                setQuery(train.id);
                handleSearchCirculation();
                setSelectedTrain(null);
                // Optional: scroll to search results if needed
                window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const renderInteractiveMap = () => {
    const trains = liveData.filter(p => p.type === 'TRAIN' && isServiceVisible(p.servei, selectedServei));
    return (
      <div className="bg-white dark:bg-black/40 rounded-[40px] p-4 sm:p-6 border border-gray-100 dark:border-white/5 relative flex flex-col transition-colors shadow-sm">
        {/* Zoom Controls */}
        <div className="flex flex-col sm:flex-row md:items-center justify-between gap-6 mb-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none">Esquema Interactiu BV</h3>
              <div className={`flex items-center gap-2 px-2 py-0.5 rounded-lg border transition-all ${isRealTime ? 'bg-fgc-green/10 border-fgc-green/20 text-fgc-green' : 'bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-400'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isRealTime ? 'bg-fgc-green' : 'bg-gray-400'}`}></div>
                <span className="text-[8px] font-black uppercase tracking-widest">{isRealTime ? 'En Temps Real' : 'Tall Manual'}</span>
              </div>
            </div>
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 flex items-center gap-1"><Clock size={10} /> Estat malla: <span className="text-fgc-grey dark:text-white font-black">{customTime || '--:--'}</span></p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-gray-50 dark:bg-black/20 p-2 rounded-[24px] border border-gray-100 dark:border-white/5 flex items-center gap-3">
              {/* Zoom Buttons will be injected here by the TransformWrapper render prop context if possible, 
                        or we control them via refs? 
                        react-zoom-pan-pinch provides a hook or standard props. 
                        Better to wrap the whole component or put content inside TransformWrapper.
                        Actually, let's put the wrapper around the SVG container and use the render props for controls location. 
                    */}
            </div>

            <div className="flex flex-wrap items-center gap-3 bg-gray-50 dark:bg-black/20 p-2 rounded-[24px] border border-gray-100 dark:border-white/5">
              <button onClick={() => setIsGeoTrenEnabled(!isGeoTrenEnabled)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${isGeoTrenEnabled ? 'bg-blue-500 text-white shadow-md' : 'text-gray-400 hover:text-fgc-grey'}`} title="Activar posicionament real GPS (GeoTren)"><Activity size={14} className={isGeoTrenEnabled ? 'animate-pulse' : ''} /> GeoTren</button>
              <div className="w-px h-6 bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block"></div>
              <button onClick={() => { setIsRealTime(true); setIsPaused(false); setIsGeoTrenEnabled(false); }} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${isRealTime && !isGeoTrenEnabled ? 'bg-fgc-grey dark:bg-fgc-green text-white dark:text-fgc-grey shadow-md' : 'text-gray-400 hover:text-fgc-grey'}`}>Live</button>
              <button onClick={() => setIsPaused(!isPaused)} className={`p-2 rounded-xl text-xs font-black transition-all ${isPaused ? 'bg-orange-500 text-white shadow-md' : 'bg-white dark:bg-white/5 text-gray-400 hover:text-fgc-grey'}`}>{isPaused ? <FastForward size={14} fill="currentColor" /> : <span className="flex gap-1"><div className="w-1 h-3 bg-current rounded-full" /><div className="w-1 h-3 bg-current rounded-full" /></span>}</button>
              <input type="time" value={customTime} onChange={(e) => { setCustomTime(e.target.value); setIsRealTime(false); }} className="bg-white dark:bg-gray-800 border-none rounded-lg px-3 py-1.5 text-xs font-black text-fgc-grey dark:text-white focus:ring-2 focus:ring-fgc-green/30 outline-none" />
              <button onClick={() => { setIsRealTime(true); setIsPaused(false); }} className="p-2 hover:bg-gray-200 dark:hover:bg-white/10 rounded-lg text-gray-400" title="Tornar a l'hora actual"><RefreshCw size={14} /></button>
            </div>
          </div>
        </div>

        {(selectedCutStations.size > 0 || selectedCutSegments.size > 0) && (<button onClick={clearAllCuts} className="text-[10px] font-black text-red-500 uppercase flex items-center gap-2 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 rounded-xl hover:scale-105 transition-all shadow-sm border border-red-100 dark:border-red-900/40 animate-in fade-in zoom-in-95 self-start mb-4"><Trash2 size={14} /> Anul·lar Talls ({selectedCutStations.size + selectedCutSegments.size})</button>)}

        <div className="w-full h-[500px] bg-gray-50/30 dark:bg-black/20 rounded-3xl overflow-hidden border border-black/5 dark:border-white/5 relative">
          <TransformWrapper
            initialScale={1}
            minScale={0.5}
            maxScale={4}
            centerOnInit={false} // We want to control initial view manually or let it be 0,0
            limitToBounds={false}
            doubleClick={{ disabled: true }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-white dark:bg-gray-900 p-2 rounded-2xl shadow-xl border border-gray-100 dark:border-white/10">
                  <button onClick={() => zoomIn(0.25)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl text-fgc-grey dark:text-white transition-colors"><ZoomIn size={18} /></button>
                  <button onClick={() => zoomOut(0.25)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl text-fgc-grey dark:text-white transition-colors"><ZoomOut size={18} /></button>
                  <button onClick={() => resetTransform()} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl text-fgc-grey dark:text-white transition-colors"><Maximize size={18} /></button>
                </div>
                <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full">
                  <div className="w-full h-full flex items-center justify-center min-w-[1000px]">
                    {/* We set a min-w to ensure SVG isn't squashed and user can pan around */}
                    <svg viewBox="-40 -30 790 250" className="w-full h-full overflow-visible">
                      {/* PC Terminal Tracks Layout (Angular Style) */}
                      <g className="opacity-40">
                        {/* V1 (Top) -> Merges to V2 Main */}
                        <line x1="-35" y1="84" x2="0" y2="84" stroke="#A4A7AB" strokeWidth="2" strokeLinecap="round" />
                        <path d="M 0 84 L 12 96" stroke="#A4A7AB" strokeWidth="2" fill="none" />

                        {/* V2 -> Merges to V2 Main */}
                        <line x1="-35" y1="92" x2="5" y2="92" stroke="#A4A7AB" strokeWidth="2" fill="none" />

                        {/* V3 (Center) */}
                        <line x1="-35" y1="100" x2="20" y2="100" stroke="#A4A7AB" strokeWidth="2" strokeLinecap="round" />

                        {/* V4 -> Merges to V1 Main */}
                        <line x1="-35" y1="108" x2="5" y2="108" stroke="#A4A7AB" strokeWidth="2" strokeLinecap="round" />
                        <path d="M 5 108 L 9 104" stroke="#A4A7AB" strokeWidth="2" fill="none" />

                        {/* V5 (Bottom) -> Merges to V1 Main */}
                        <line x1="-35" y1="116" x2="0" y2="116" stroke="#A4A7AB" strokeWidth="2" strokeLinecap="round" />
                        <path d="M 0 116 L 12 104" stroke="#A4A7AB" strokeWidth="2" fill="none" />

                        {/* Buffers (Topes) */}
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

                        // Calculate normal vector for the offset
                        const dx = s2.x - s1.x;
                        const dy = s2.y - s1.y;
                        const len = Math.sqrt(dx * dx + dy * dy);
                        const nx = -dy / len;
                        const ny = dx / len;
                        const offset = 4; // Distance between tracks

                        return (
                          <g key={`seg-${i}`}>
                            {/* Via 2 (Descendent - Superior/Esquerra) */}
                            <line
                              x1={s1.x + nx * offset} y1={s1.y + ny * offset}
                              x2={s2.x + nx * offset} y2={s2.y + ny * offset}
                              stroke={isV2Blocked ? "#ef4444" : "#A4A7AB"} strokeWidth="4" strokeLinecap="round"
                              className={`cursor-pointer transition-all duration-300 ${isV2Blocked ? 'opacity-100' : 'opacity-40 hover:opacity-100 hover:stroke-blue-400'}`}
                              onClick={() => toggleTrackCut(s1.id, s2.id, 2)}
                              // Pointer events essential for click through zoom
                              style={{ pointerEvents: 'auto' }}
                            />
                            {/* Via 1 (Ascendent - Inferior/Dreta) */}
                            <line
                              x1={s1.x - nx * offset} y1={s1.y - ny * offset}
                              x2={s2.x - nx * offset} y2={s2.y - ny * offset}
                              stroke={isV1Blocked ? "#ef4444" : "#A4A7AB"} strokeWidth="4" strokeLinecap="round"
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
                            {/* Station Marker: Pill shape (rounded rectangle) */}
                            <rect
                              x={st.x - ((st as any).type === 'depot' ? 6 : 3)} y={st.y - 11} width={(st as any).type === 'depot' ? "12" : "6"} height="22" rx="3"
                              fill={(st as any).type === 'depot' ? "#f3f4f6" : "white"} stroke={isCut ? "#ef4444" : "#53565A"} strokeWidth="1.5"
                              onClick={() => {
                                if (st.id === 'PC') setIsPCDiagramOpen(true);
                                if (st.id === 'PR') setIsPRDiagramOpen(true);
                                if (st.id === 'GR') setIsGRDiagramOpen(true);
                                if (st.id === 'PM') setIsPMDiagramOpen(true);
                                if (st.id === 'BN') setIsBNDiagramOpen(true);
                                if (st.id === 'TB') setIsTBDiagramOpen(true);
                                if (st.id === 'SR') setIsSRDiagramOpen(true);
                                if (st.id === 'RE') setIsREStationDiagramOpen(true);

                                // New handlers for Depots - ONLY actual Depot Nodes
                                if (st.id === 'DRE') setIsREDiagramOpen(true);
                                if (st.id === 'COR') setIsRBDiagramOpen(true);
                                if (st.id === 'DNA') setIsNADiagramOpen(true);
                                if (st.id === 'DPN') setIsPNDiagramOpen(true);

                              }}
                              className={`transition-all duration-300 ${['PC', 'PR', 'GR', 'PM', 'BN', 'TB', 'SR', 'RE', 'DRE', 'COR', 'DNA', 'DPN'].includes(st.id) ? 'cursor-pointer hover:stroke-blue-500' : ''}`}
                              style={{ pointerEvents: 'auto' }}
                            />
                            {count > 0 && !isCut && (
                              <g onClick={() => setSelectedRestLocation(selectedRestLocation === st.id ? null : st.id)} className="cursor-pointer transition-colors" style={{ pointerEvents: 'auto' }}>
                                <circle cx={st.x} cy={st.y + (isUpper ? 32 : 44)} r={7} fill="#3b82f6" className="shadow-md" stroke="white" strokeWidth="1.5" />
                                <text x={st.x} y={st.y + (isUpper ? 34.5 : 46.5)} textAnchor="middle" fill="white" className="text-[7px] font-black pointer-events-none">{count}</text>
                              </g>
                            )}
                            {/* Interaction moved to the station name */}
                            <text
                              x={st.x + ((st as any).labelXOffset || 0)} y={st.y + (isUpper ? -16 : 28) + ((st as any).labelYOffset || 0)}
                              textAnchor="middle"
                              onClick={() => toggleStationCut(st.id)}
                              className={`text-[9px] font-black select-none cursor-pointer transition-colors duration-300 hover:underline ${isCut ? 'fill-red-500' : (st as any).type === 'depot' && st.id !== 'PC' ? 'fill-blue-500 dark:fill-blue-400' : 'fill-gray-400 dark:fill-gray-500 hover:fill-fgc-grey'}`}
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

                        // Position on the segment
                        const cx = s1.x + (s2.x - s1.x) * (cross as any).pos;
                        const cy = s1.y + (s2.y - s1.y) * (cross as any).pos;

                        // Segment normal vector
                        const dx = s2.x - s1.x;
                        const dy = s2.y - s1.y;
                        const len = Math.sqrt(dx * dx + dy * dy);
                        const nx = -dy / len;
                        const ny = dx / len;
                        const offset = 4;

                        // Diagonal span
                        const span = 6;
                        const vx = dx / len * span;
                        const vy = dy / len * span;

                        return (
                          <g key={`cross-${i}`} className="opacity-40">
                            {((cross as any).type === 'X' || (cross as any).type === '/') && (
                              <line
                                x1={cx - vx + nx * offset} y1={cy - vy + ny * offset}
                                x2={cx + vx - nx * offset} y2={cy + vy - ny * offset}
                                stroke="#A4A7AB" strokeWidth="2" strokeLinecap="round"
                              />
                            )}
                            {((cross as any).type === 'X' || (cross as any).type === '\\') && (
                              <line
                                x1={cx - vx - nx * offset} y1={cy - vy - ny * offset}
                                x2={cx + vx + nx * offset} y2={cy + vy + ny * offset}
                                stroke="#A4A7AB" strokeWidth="2" strokeLinecap="round"
                              />
                            )}
                          </g>
                        );
                      })}

                      {!isGeoTrenEnabled && trains.map((p, idx) => {
                        const offset = (p as any).visualOffset || 0;
                        // Determine affected status using the same logic as dividedPersonnel
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

                        // Determine track offset based on direction (parity of id)
                        const numId = parseInt(p.id.replace(/\D/g, ''));
                        const isAsc = numId % 2 !== 0; // Odd = Ascendent (V1)
                        const trackOffset = isAsc ? 6 : -6;

                        const labelWidth = Math.max(20, p.id.length * 5.5 + 4);

                        // Special handling for PC Terminal Tracks in Manual Mode
                        let finalX = p.x;
                        let finalY = p.y;
                        let useStandardOffset = true;

                        if (p.stationId === 'PC') {
                          const targetViaStr = (p.final === 'PC' ? p.via_final : p.via_inici) || '';
                          // Extract number from string like "4", "V4", "Via 4"
                          const viaMatch = targetViaStr.match(/(\d+)/);
                          if (viaMatch) {
                            const via = parseInt(viaMatch[1]);
                            if (via >= 1 && via <= 5) {
                              finalX = -30;
                              const yCoords = [84, 92, 100, 108, 116];
                              finalY = yCoords[via - 1];
                              useStandardOffset = false; // Disable standard offset for terminal tracks
                            }
                          }
                        }

                        return (
                          <g
                            key={`${p.id}-${p.torn}-${idx}`}
                            className="transition-all duration-1000 ease-linear cursor-pointer"
                            onClick={() => setSelectedTrain(p)}
                            style={{ pointerEvents: 'auto' }}
                          >
                            <circle
                              cx={finalX} cy={finalY} r={5.5} fill={p.color}
                              className={`${isAffected ? "stroke-red-500 stroke-2" : "stroke-white dark:stroke-black stroke-[1.5]"} hover:stroke-fgc-green transition-all`}
                              style={useStandardOffset ? { transform: `translate(${offset * 4}px, ${trackOffset}px)`, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))' } : { filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))' }}
                            >
                              <title>{p.id} - Torn {p.torn} (Via {isAsc ? '1' : '2'})</title>
                            </circle>

                            {/* New Label Pill Design */}
                            <g className="drop-shadow-md" style={useStandardOffset ? { transform: `translate(${offset * 4}px, ${trackOffset}px)` } : {}}>
                              <rect
                                x={finalX - (labelWidth / 2)}
                                y={finalY - 16}
                                width={labelWidth}
                                height={12}
                                rx={3}
                                fill={p.color}
                              />
                              <text
                                x={finalX}
                                y={finalY - 10}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className="text-[8px] font-black fill-white uppercase tracking-tighter"
                              >
                                {p.id}
                              </text>
                            </g>
                          </g>
                        );
                      })}
                      {(() => {
                        if (!isGeoTrenEnabled) return null;

                        // 1. Pre-calculate positions and identifiers for all GeoTren units
                        const processedGeo = geoTrenData.map((gt, idx) => {
                          const stAt = resolveStationId(gt.estacionat_a || "");
                          let stNext = null;
                          if (!stAt && gt.properes_parades) {
                            try {
                              const stops = gt.properes_parades.split(';');
                              const firstStop = JSON.parse(stops[0]);
                              stNext = resolveStationId(firstStop.parada || "");
                            } catch (e) {
                              const match = gt.properes_parades.match(/"parada":\s*"([^"]+)"/);
                              if (match) stNext = resolveStationId(match[1]);
                            }
                          }

                          let x = 0, y = 0, locKey = "";
                          if (stAt) {
                            const s = MAP_STATIONS.find(st => st.id === stAt);
                            if (s) {
                              x = s.x; y = s.y; locKey = stAt;
                              if (stAt === 'PC' && gt.via) {
                                const via = parseInt(gt.via);
                                if (!isNaN(via) && via >= 1 && via <= 5) {
                                  x = -30;
                                  const yCoords = [84, 92, 100, 108, 116];
                                  y = yCoords[via - 1];
                                }
                              }
                            }
                          } else if (stNext) {
                            const s = MAP_STATIONS.find(st => st.id === stNext);
                            if (s) {
                              x = s.x; y = s.y; locKey = stNext;
                              x += (gt.dir === 'A' ? -15 : 15);
                            }
                          }
                          return { ...gt, x, y, locKey, stAt, stNext, geoIndex: idx };
                        }).filter(u => u.locKey !== "");

                        // 2. Advanced Deduction Logic: Sequential matching by line and direction
                        const inferredMap = new Map<string, string>(); // ut -> circId
                        const lineKeys = ['S1', 'S2', 'L6', 'L7', 'L12'];

                        lineKeys.forEach(line => {
                          ['A', 'B'].forEach(dir => {
                            const isAsc = dir === 'A';

                            // Sort by journey progress: Asc (x increases), Desc (x decreases)
                            const progressSort = (a, b) => isAsc ? (a.x - b.x) : (b.x - a.x);

                            const gtUnits = processedGeo.filter(u => (u.lin === line) && (u.dir === dir))
                              .sort(progressSort);

                            const liveTrains = liveData.filter(p => {
                              if (p.type !== 'TRAIN') return false;
                              if (!p.linia?.toUpperCase().includes(line)) return false;

                              const numPart = p.id.replace(/\D/g, '');
                              const numId = parseInt(numPart);
                              if (isNaN(numId)) return false;

                              // Direction check: Odd = Asc (A), Even = Desc (B)
                              if ((numId % 2 !== 0) !== isAsc) return false;

                              // Special rule for L12: match everything
                              if (line === 'L12') return true;

                              // Passenger rules (A,B,L,D,F + 1-5)
                              const prefix = p.id.charAt(0).toUpperCase();
                              if (!['A', 'B', 'L', 'D', 'F'].includes(prefix)) return false;
                              const firstDigit = numPart.charAt(0);
                              if (!['1', '2', '3', '4', '5'].includes(firstDigit)) return false;

                              return true;
                            }).sort(progressSort);

                            // Robust matching: A Geo unit MUST match a Live train that is at its position or further ahead.
                            // If a Geo unit is PAST a live train's scheduled position, that live train is NOT its match (impossible early).
                            let lIdx = 0;
                            gtUnits.forEach((gu) => {
                              // Special case for L12: just take the next available if positions are weird
                              if (line === 'L12' && liveTrains[lIdx]) {
                                inferredMap.set(gu.ut || `geo-${gu.geoIndex}`, liveTrains[lIdx].id);
                                lIdx++;
                                return;
                              }

                              while (lIdx < liveTrains.length) {
                                const lt = liveTrains[lIdx];
                                // Condition: Geo progress <= Live progress (within a small tolerance of 15 coordinate units)
                                const geoProgress = isAsc ? gu.x : -gu.x;
                                const liveProgress = isAsc ? lt.x : -lt.x;

                                // Not ahead: geoProgress <= liveProgress + tolerance
                                if (geoProgress <= liveProgress + 15) {
                                  inferredMap.set(gu.ut || `geo-${gu.geoIndex}`, lt.id);
                                  lIdx++; // Move to next schedule for next unit
                                  break;
                                }
                                // If geoProgress > liveProgress, it means this Geo unit is AHEAD of this schedule slot.
                                // Since that's impossible per business rules, we skip this schedule slot.
                                lIdx++;
                              }
                            });
                          });
                        });

                        const geoCollisionMap: Record<string, number> = {};

                        return processedGeo.map((gt) => {
                          const { x, y, locKey } = gt;
                          const offsetCount = geoCollisionMap[locKey] || 0;
                          geoCollisionMap[locKey] = offsetCount + 1;
                          const visualOffset = offsetCount * 12;

                          const lineColor = getLiniaColorHex(gt.lin || "");
                          const inferredCircId = inferredMap.get(gt.ut || `geo-${gt.geoIndex}`);
                          const unitLabel = gt.tipus_unitat || (gt.ut && gt.ut.length < 8 ? gt.ut : "???");
                          const trainLabel = inferredCircId || unitLabel;

                          const labelWidth = Math.max(24, trainLabel.length * 5.5 + 4);

                          return (
                            <g key={`gt-${gt.ut || gt.geoIndex}`} className="transition-all duration-1000 ease-linear animate-in fade-in zoom-in duration-500">
                              <g style={{ transform: `translate(${visualOffset}px, ${gt.dir === 'A' ? 6 : -6}px)` }}>
                                <circle cx={x} cy={y} r={4} fill={lineColor} stroke="white" strokeWidth="1.5">
                                  <title>GeoTren: {gt.tipus_unitat} (ID: {gt.ut}) - Lin: {gt.lin} - Dir: {gt.dir}</title>
                                </circle>

                                <g className="drop-shadow-md">
                                  <rect
                                    x={x - (labelWidth / 2)}
                                    y={y - 16}
                                    width={labelWidth}
                                    height={12}
                                    rx={3}
                                    fill={lineColor}
                                  />
                                  <text
                                    x={x}
                                    y={y - 10}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    className="text-[8px] font-black fill-white uppercase tracking-tighter"
                                  >
                                    {trainLabel}
                                  </text>
                                </g>
                              </g>
                            </g>
                          );
                        });
                      })()
                      }
                      {/* Parked Units on Main Map */}
                      {parkedUnits.map((u, i) => {
                        const st = MAP_STATIONS.find(s => s.id === u.depot_id);
                        if (!st) return null;

                        let px = st.x;
                        let py = st.y;

                        // Custom positioning for depots
                        if (u.depot_id === 'PC') {
                          const trackIdx = parseInt(u.track) - 1;
                          const ys = [84, 92, 100, 108, 116];
                          px = -25;
                          py = ys[trackIdx] || 100;
                        } else {
                          // Offset small for others
                          px += 6; py -= 6;
                        }

                        return (
                          <g key={`main-parked-${u.unit_number}-${i}`}>
                            <circle cx={px} cy={py} r={2.5} fill="#3b82f6" stroke="white" strokeWidth="0.5" className="animate-pulse" />
                            <text x={px} y={py - 4} textAnchor="middle" className="text-[4px] font-black fill-blue-500 uppercase">{u.unit_number}</text>
                          </g>
                        );
                      })}

                    </svg>
                  </div>
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        </div>

        {/* Train Inspector Overlay */}
        {selectedTrain && (
          <div
            className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setSelectedTrain(null)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <TrainInspectorPopup train={selectedTrain} onClose={() => setSelectedTrain(null)} />
            </div>
          </div>
        )}

        {/* Modal Diagrama SR (Sarrià) */}
        {isSRDiagramOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#121212] p-8 rounded-[40px] border border-white/10 shadow-2xl max-w-5xl w-full relative overflow-hidden ring-1 ring-white/20">
              <button onClick={() => setIsSRDiagramOpen(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full">
                <X size={20} />
              </button>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse ring-4 ring-blue-500/20" />
                <h2 className="text-sm font-black text-white uppercase tracking-widest">Esquema de Vies Tècnic - Sarrià</h2>
              </div>

              <div className="bg-black/60 rounded-3xl p-8 border border-white/5 relative">
                <svg viewBox="0 0 800 350" className="w-full h-auto">
                  {/* Tracks */}
                  {/* V1 (Main Bottom) */}
                  <line x1="50" y1="300" x2="750" y2="300" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="30" y="305" fill="#A4A7AB" className="text-[12px] font-black opacity-60">V1</text>

                  {/* V2 (Main Middle) */}
                  <line x1="50" y1="230" x2="750" y2="230" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="30" y="235" fill="#A4A7AB" className="text-[12px] font-black opacity-60">V2</text>

                  {/* V4 (Station Top, ends at buffer) */}
                  <line x1="280" y1="160" x2="750" y2="160" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <line x1="270" y1="150" x2="270" y2="170" stroke="#ef4444" strokeWidth="4" />
                  <text x="300" y="150" fill="#A4A7AB" className="text-[12px] font-black opacity-60">V4</text>

                  {/* V6 (Siding top left) */}
                  <line x1="80" y1="100" x2="350" y2="100" stroke="#A4A7AB" strokeWidth="2.5" opacity="0.4" />
                  <line x1="80" y1="90" x2="80" y2="110" stroke="#ef4444" strokeWidth="4" />
                  <text x="100" y="90" fill="#A4A7AB" className="text-[10px] font-black opacity-60">V6</text>

                  {/* V8 (Siding top top left) */}
                  <line x1="80" y1="40" x2="250" y2="40" stroke="#A4A7AB" strokeWidth="2.5" opacity="0.4" />
                  <line x1="80" y1="30" x2="80" y2="50" stroke="#ef4444" strokeWidth="4" />
                  <text x="100" y="30" fill="#A4A7AB" className="text-[10px] font-black opacity-60">V8</text>

                  {/* Needles Left */}
                  {/* Crossover V1-V2 (/) */}
                  <line x1="120" y1="300" x2="200" y2="230" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />

                  {/* Connection V6 -> V4 */}
                  <line x1="350" y1="100" x2="410" y2="160" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 2" />

                  {/* Connection V8 -> V6 */}
                  <line x1="250" y1="40" x2="310" y2="100" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 2" />

                  {/* Needles Center (V2 <-> V4) */}
                  {/* Needle / (V2 to V4) */}
                  <line x1="280" y1="230" x2="340" y2="160" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />

                  {/* Needle \ (V4 to V2) */}
                  <line x1="560" y1="160" x2="620" y2="230" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />

                  {/* Needles Right (V2/V1 to V0) */}
                  {/* V0 Track (Middle Right) */}
                  <line x1="640" y1="265" x2="750" y2="265" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="680" y="260" fill="#A4A7AB" className="text-[12px] font-black opacity-60">V0</text>

                  {/* Needle \ (V2 to V0) */}
                  <line x1="580" y1="230" x2="640" y2="265" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />

                  {/* Needle / (V1 to V0) */}
                  <line x1="580" y1="300" x2="640" y2="265" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />

                  {/* Branch towards L12 (RE) */}
                  <line x1="700" y1="160" x2="780" y2="80" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                  <text x="760" y="70" fill="#fbbf24" className="text-[10px] font-black uppercase">RE (L12)</text>

                  {/* Platforms */}
                  {/* Platform V1-V2 */}
                  <rect x="350" y="250" width="180" height="20" fill="#53565A" rx="2" />
                  <text x="440" y="263" textAnchor="middle" fill="#999" className="text-[8px] font-black uppercase">Andana S1/S2</text>

                  {/* Platform V2-V4 */}
                  <rect x="350" y="180" width="180" height="20" fill="#53565A" rx="2" />
                  <text x="440" y="193" textAnchor="middle" fill="#999" className="text-[8px] font-black uppercase">Andana L12</text>

                  {/* Labels and Directions */}
                  <text x="60" y="275" textAnchor="middle" fill="#666" className="text-[9px] font-black uppercase tracking-widest">← Tres Torres</text>
                  <text x="700" y="330" textAnchor="middle" fill="#666" className="text-[9px] font-black uppercase tracking-widest">Peu Funicular →</text>
                  <text x="440" y="330" textAnchor="middle" fill="#AAA" className="text-[12px] font-black uppercase tracking-[0.4em]">SARRIÀ</text>

                  {/* Real-time trains */}
                  {liveData.filter(p => (p.stationId === 'SR' || p.stationId === 'S0') && p.type === 'TRAIN').map((p, idx) => {
                    const numId = parseInt(p.id.replace(/\D/g, ''));
                    const isMSR = p.linia === 'MSR' || p.stationId === 'S0';
                    const isL12 = p.linia === 'L12';
                    const isV1 = numId % 2 !== 0;

                    let trainY = isV1 ? 300 : 230;
                    let cxValue = 440; // Station center

                    if (isL12) {
                      trainY = 160;
                    }

                    if (isMSR) {
                      trainY = 265; // V0 Track
                      cxValue = 695; // Center of V0
                    } else {
                      // SR is at x=230 in main map
                      if (p.x < 228) { // Coming from Left (TT is 200)
                        const dist = 230 - p.x;
                        const progress = Math.min(1, dist / 30);
                        cxValue = 440 - (progress * 380);
                      } else if (p.x > 232) { // Going Right (PF is 260)
                        const dist = p.x - 230;
                        const progress = Math.min(1, dist / 30);
                        cxValue = 440 + (progress * 300);
                      }
                    }

                    return (
                      <g key={`sr-train-${p.id}`} className="transition-all duration-1000 ease-linear">
                        <circle cx={cxValue} cy={trainY} r={12} fill={p.color} stroke="white" strokeWidth="3" className="drop-shadow-lg" />
                        <text x={cxValue} y={trainY - 18} textAnchor="middle" className="text-[12px] font-black fill-white drop-shadow-md">{p.id}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="mt-8 flex justify-end">
                <button onClick={() => setIsSRDiagramOpen(false)} className="px-12 py-5 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10 hover:border-white/20 shadow-xl ring-1 ring-white/5">Tancar Esquema</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Diagrama TB (Av. Tibidabo) */}
        {isTBDiagramOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#121212] p-8 rounded-[40px] border border-white/10 shadow-2xl max-w-4xl w-full relative overflow-hidden ring-1 ring-white/20">
              <button onClick={() => setIsTBDiagramOpen(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full">
                <X size={20} />
              </button>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-3 h-3 rounded-full bg-blue-600 animate-pulse ring-4 ring-blue-600/20" />
                <h2 className="text-sm font-black text-white uppercase tracking-widest">Esquema de Vies - Av. Tibidabo</h2>
              </div>

              <div className="bg-black/60 rounded-3xl p-8 border border-white/5 relative">
                <svg viewBox="0 0 600 200" className="w-full h-auto">
                  {/* Left side: Two tracks from El Putxet */}
                  {/* V2 (Top) */}
                  <line x1="30" y1="70" x2="100" y2="70" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="35" y="62" fill="#A4A7AB" className="text-[10px] font-black opacity-60">V2</text>

                  {/* V1 (Bottom) */}
                  <line x1="30" y1="130" x2="550" y2="130" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="35" y="145" fill="#A4A7AB" className="text-[10px] font-black opacity-60">V1</text>

                  {/* Merge: V2 joining V1 */}
                  <line x1="100" y1="70" x2="180" y2="130" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                  <text x="135" y="95" fill="#fbbf24" className="text-[8px] font-black uppercase">VA</text>

                  {/* Station area: Single track (V1) with two platforms */}
                  {/* Top Platform */}
                  <rect x="280" y="95" width="240" height="15" fill="#53565A" rx="2" />
                  <text x="400" y="106" textAnchor="middle" fill="#999" className="text-[7px] font-black uppercase tracking-widest">Andana 1</text>

                  {/* Bottom Platform */}
                  <rect x="280" y="150" width="240" height="15" fill="#53565A" rx="2" />
                  <text x="400" y="161" textAnchor="middle" fill="#999" className="text-[7px] font-black uppercase tracking-widest">Andana 2</text>

                  <text x="400" y="135" textAnchor="middle" fill="#999" className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Av. Tibidabo</text>

                  {/* Buffer (Tope) at the end of V1 */}
                  <line x1="550" y1="120" x2="550" y2="140" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" />

                  {/* Direction Label */}
                  <text x="40" y="110" textAnchor="middle" fill="#666" className="text-[10px] font-black uppercase tracking-widest">← El Putxet</text>

                  {/* Real-time trains */}
                  {liveData.filter(p => p.stationId === 'TB' && p.type === 'TRAIN').map((p, idx) => {
                    const numId = parseInt(p.id.replace(/\D/g, ''));
                    const trainY = 130; // Single track at station area

                    let cxValue = 510; // At station area
                    if (p.x < 118) { // Approximation
                      const progress = Math.min(1, (120 - p.x) / 10);
                      cxValue = 510 - (progress * 350);
                    }

                    return (
                      <g key={`tb-train-${p.id}`} className="transition-all duration-1000 ease-linear">
                        <circle cx={cxValue} cy={trainY} r={10} fill={p.color} stroke="white" strokeWidth="3" className="drop-shadow-lg" />
                        <text x={cxValue} y={trainY - 15} textAnchor="middle" className="text-[11px] font-black fill-white drop-shadow-md">{p.id}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="mt-8 flex justify-end">
                <button onClick={() => setIsTBDiagramOpen(false)} className="px-10 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10 hover:border-white/20 shadow-xl">Tancar Esquema</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Diagrama BN (La Bonanova) */}
        {isBNDiagramOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#121212] p-8 rounded-[40px] border border-white/10 shadow-2xl max-w-4xl w-full relative overflow-hidden ring-1 ring-white/20">
              <button onClick={() => setIsBNDiagramOpen(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full">
                <X size={20} />
              </button>
              <div className="flex items-center gap-4 mb-8">
                <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse ring-4 ring-blue-500/20" />
                <h2 className="text-sm font-black text-white uppercase tracking-widest">Esquema de Vies - La Bonanova</h2>
              </div>

              <div className="bg-black/60 rounded-3xl p-8 border border-white/5 relative">
                <svg viewBox="0 0 600 200" className="w-full h-auto">
                  {/* Tracks */}
                  {/* V2 Top Line */}
                  <line x1="50" y1="60" x2="550" y2="60" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="50" y="55" fill="#A4A7AB" className="text-[12px] font-black opacity-60">V2</text>

                  {/* V1 Bottom Line */}
                  <line x1="50" y1="140" x2="550" y2="140" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="50" y="155" fill="#A4A7AB" className="text-[12px] font-black opacity-60">V1</text>

                  {/* Platforms (Andanes) */}
                  <rect x="350" y="35" width="160" height="15" fill="#53565A" rx="2" />
                  <rect x="350" y="150" width="160" height="15" fill="#53565A" rx="2" />
                  <text x="430" y="105" textAnchor="middle" fill="#999" className="text-[10px] font-black uppercase">La Bonanova</text>

                  {/* Needles between Muntaner and La Bonanova */}
                  {/* Needle 1: / position (V1 to V2) */}
                  <line x1="120" y1="140" x2="180" y2="60" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />

                  {/* Needle 2: \ position (V2 to V1) */}
                  <line x1="200" y1="60" x2="260" y2="140" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />

                  {/* Direction Labels */}
                  <text x="40" y="100" textAnchor="middle" fill="#666" className="text-[10px] font-black uppercase tracking-widest">← Muntaner</text>
                  <text x="560" y="100" textAnchor="middle" fill="#666" className="text-[10px] font-black uppercase tracking-widest">Sarrià →</text>

                  {/* Real-time trains in BN Diagram */}
                  {liveData.filter(p => p.stationId === 'BN' && p.type === 'TRAIN').map((p, idx) => {
                    const numId = parseInt(p.id.replace(/\D/g, ''));
                    const isAsc = numId % 2 !== 0;
                    const trainY = isAsc ? 140 : 60;

                    let cxValue = 430; // Station Center
                    if (p.x > 50) { // On main map BN is around 40-50, but let's use map logic
                      // Actually BN is around x=48 on the segments logic? No, let's use center.
                    }

                    return (
                      <g key={`bn-train-${p.id}`} className="transition-all duration-1000 ease-linear">
                        <circle cx={cxValue} cy={trainY} r={10} fill={p.color} stroke="white" strokeWidth="3" className="drop-shadow-lg" />
                        <text x={cxValue} y={trainY - 15} textAnchor="middle" className="text-[11px] font-black fill-white drop-shadow-md">{p.id}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="mt-8 flex justify-end">
                <button onClick={() => setIsBNDiagramOpen(false)} className="px-10 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10 hover:border-white/20 shadow-xl">Tancar Esquema</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Diagrama PM (Pl. Molina) */}
        {isPMDiagramOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#121212] p-8 rounded-[40px] border border-white/10 shadow-2xl max-w-4xl w-full relative overflow-hidden ring-1 ring-white/20">
              <button onClick={() => setIsPMDiagramOpen(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full">
                <X size={20} />
              </button>
              <div className="flex items-center gap-4 mb-8">
                <div className="w-3 h-3 rounded-full bg-orange-500 animate-pulse ring-4 ring-orange-500/20" />
                <h2 className="text-sm font-black text-white uppercase tracking-widest">Esquema de Vies - Pl. Molina</h2>
              </div>

              <div className="bg-black/60 rounded-3xl p-8 border border-white/5 relative">
                <svg viewBox="0 0 600 200" className="w-full h-auto">
                  {/* Tracks */}
                  {/* V2 Top Line */}
                  <line x1="50" y1="60" x2="550" y2="60" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="30" y="55" fill="#A4A7AB" className="text-[10px] font-black opacity-60">V4 (L7 GR)</text>
                  <text x="300" y="55" textAnchor="middle" fill="#A4A7AB" className="text-[12px] font-black opacity-60">V2</text>

                  {/* V1 Bottom Line */}
                  <line x1="50" y1="140" x2="550" y2="140" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="30" y="158" fill="#A4A7AB" className="text-[10px] font-black opacity-60">V3 (L7 GR)</text>
                  <text x="300" y="170" textAnchor="middle" fill="#A4A7AB" className="text-[12px] font-black opacity-60">V1</text>

                  {/* Platforms (Andanes) */}
                  <rect x="230" y="35" width="140" height="15" fill="#53565A" rx="2" />
                  <rect x="230" y="150" width="140" height="15" fill="#53565A" rx="2" />
                  <text x="300" y="105" textAnchor="middle" fill="#666" className="text-[10px] font-black uppercase">Pl. Molina</text>

                  {/* Aguja Left (Towards GR) - / position (V1 to V2) */}
                  <line x1="120" y1="140" x2="180" y2="60" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />

                  {/* Aguja Right (Towards PD) - \ position (V2 to V1) */}
                  <line x1="420" y1="60" x2="480" y2="140" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />

                  {/* Direction Labels */}
                  <text x="40" y="100" textAnchor="middle" fill="#666" className="text-[10px] font-black uppercase tracking-widest">← Gràcia</text>
                  <text x="560" y="100" textAnchor="middle" fill="#666" className="text-[10px] font-black uppercase tracking-widest">Pàdua →</text>

                  {/* Real-time trains in PM Diagram */}
                  {liveData.filter(p => p.stationId === 'PM' && p.type === 'TRAIN').map((p, idx) => {
                    const numId = parseInt(p.id.replace(/\D/g, ''));
                    const isAsc = numId % 2 !== 0;
                    const trainY = isAsc ? 140 : 60;

                    let cxValue = 300;
                    if (p.x > 102) { // Moving towards PD
                      const progress = Math.min(1, (p.x - 100) / 30);
                      cxValue = 300 + (progress * 250);
                    } else if (p.x < 98) { // Moving towards GR
                      const progress = Math.min(1, (100 - p.x) / 30);
                      cxValue = 300 - (progress * 250);
                    }

                    return (
                      <g key={`pm-train-${p.id}`} className="transition-all duration-1000 ease-linear">
                        <circle cx={cxValue} cy={trainY} r={10} fill={p.color} stroke="white" strokeWidth="3" className="drop-shadow-lg" />
                        <text x={cxValue} y={trainY - 15} textAnchor="middle" className="text-[11px] font-black fill-white drop-shadow-md">{p.id}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="mt-8 flex justify-end">
                <button onClick={() => setIsPMDiagramOpen(false)} className="px-10 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10 hover:border-white/20 shadow-xl">Tancar Esquema</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Diagrama GR (Gràcia) */}
        {isGRDiagramOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#121212] p-8 rounded-[40px] border border-white/10 shadow-2xl max-w-5xl w-full relative overflow-hidden ring-1 ring-white/20">
              <button onClick={() => setIsGRDiagramOpen(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full">
                <X size={20} />
              </button>
              <div className="flex items-center gap-4 mb-8">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse ring-4 ring-green-500/20" />
                <h2 className="text-sm font-black text-white uppercase tracking-widest">Esquema de Vies - Gràcia</h2>
              </div>

              <div className="bg-black/60 rounded-3xl p-8 border border-white/5 relative">
                <svg viewBox="0 0 800 350" className="w-full h-auto">
                  {/* Base Lines (Tramos rectos) */}
                  {/* V4 (L7) */}
                  <line x1="260" y1="60" x2="550" y2="60" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="270" y="52" fill="#A4A7AB" className="text-[10px] font-black opacity-60">V4 (L7)</text>

                  {/* V2 (Vallès) */}
                  <line x1="50" y1="120" x2="750" y2="120" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="60" y="112" fill="#A4A7AB" className="text-[10px] font-black opacity-60">V2</text>

                  {/* V1 (Vallès) */}
                  <line x1="50" y1="180" x2="750" y2="180" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="60" y="195" fill="#A4A7AB" className="text-[10px] font-black opacity-60">V1</text>

                  {/* V3 (L7) */}
                  <line x1="260" y1="240" x2="550" y2="240" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="270" y="255" fill="#A4A7AB" className="text-[10px] font-black opacity-60">V3 (L7)</text>

                  {/* Platforms (Andanes) */}
                  {/* Between V4 and V2 */}
                  <rect x="280" y="82.5" width="240" height="15" fill="#53565A" rx="2" />
                  <text x="400" y="93" textAnchor="middle" fill="#999" className="text-[8px] font-black uppercase">Andana V4-V2</text>

                  {/* Between V1 and V3 */}
                  <rect x="280" y="202.5" width="240" height="15" fill="#53565A" rx="2" />
                  <text x="400" y="213" textAnchor="middle" fill="#999" className="text-[8px] font-black uppercase">Andana V1-V3</text>

                  {/* Left Side (PC Side) Manoeuvres */}
                  {/* Needle 1: \ (V2 to V1) */}
                  <line x1="80" y1="120" x2="120" y2="180" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />

                  {/* Needle 2: / (V1 to V2) */}
                  <line x1="140" y1="180" x2="180" y2="120" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />

                  {/* Union V4 from V2 */}
                  <line x1="220" y1="120" x2="260" y2="60" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />

                  {/* Union V3 from V1 */}
                  <line x1="220" y1="180" x2="260" y2="240" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />

                  {/* Right Side Branches (Sarrià / Molina Side) */}
                  <line x1="550" y1="60" x2="590" y2="0" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                  <text x="600" y="20" fill="#fbbf24" className="text-[10px] font-black uppercase tracking-widest">L7 Molina</text>
                  <line x1="550" y1="240" x2="590" y2="300" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />

                  {/* Direction Labels */}
                  <text x="40" y="150" textAnchor="middle" fill="#666" className="text-[10px] font-black uppercase tracking-widest">← PC</text>
                  <text x="760" y="150" textAnchor="middle" fill="#666" className="text-[10px] font-black uppercase tracking-widest">Sarrià →</text>

                  {/* Real-time trains in GR Diagram */}
                  {liveData.filter(p => p.stationId === 'GR' && p.type === 'TRAIN').map((p, idx) => {
                    const numId = parseInt(p.id.replace(/\D/g, ''));
                    const isAsc = numId % 2 !== 0;

                    // Simple logic for track assignment in GR view
                    let trainY = isAsc ? 180 : 120;
                    if (p.linia === 'L7') trainY = isAsc ? 240 : 60;

                    let cxValue = 350; // Station Center
                    if (p.x > 82) { // Moving towards Sarrià
                      const progress = Math.min(1, (p.x - 80) / 30);
                      cxValue = 350 + (progress * 350);
                    } else if (p.x < 78) { // Moving towards PR/PC
                      const progress = Math.min(1, (80 - p.x) / 30);
                      cxValue = 350 - (progress * 300);
                    }

                    return (
                      <g key={`gr-train-${p.id}`} className="transition-all duration-1000 ease-linear">
                        <circle cx={cxValue} cy={trainY} r={10} fill={p.color} stroke="white" strokeWidth="3" className="drop-shadow-lg" />
                        <text x={cxValue} y={trainY - 15} textAnchor="middle" className="text-[11px] font-black fill-white drop-shadow-md">{p.id}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="mt-8 flex justify-end">
                <button onClick={() => setIsGRDiagramOpen(false)} className="px-10 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10 hover:border-white/20 shadow-xl">Tancar Esquema</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Diagrama PR (Provença) */}
        {isPRDiagramOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#121212] p-8 rounded-[40px] border border-white/10 shadow-2xl max-w-4xl w-full relative overflow-hidden ring-1 ring-white/20">
              <button onClick={() => setIsPRDiagramOpen(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full">
                <X size={20} />
              </button>
              <div className="flex items-center gap-4 mb-8">
                <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse ring-4 ring-blue-500/20" />
                <h2 className="text-sm font-black text-white uppercase tracking-widest">Esquema de Vies - Provença</h2>
              </div>

              <div className="bg-black/60 rounded-3xl p-8 border border-white/5 relative">
                <svg viewBox="0 0 600 200" className="w-full h-auto">
                  {/* V2 Top Line */}
                  <line x1="50" y1="60" x2="550" y2="60" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="30" y="65" fill="#A4A7AB" className="text-[12px] font-black opacity-60">V2</text>

                  {/* V1 Bottom Line */}
                  <line x1="50" y1="140" x2="550" y2="140" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="30" y="145" fill="#A4A7AB" className="text-[12px] font-black opacity-60">V1</text>

                  {/* Platforms (Andanes) */}
                  <rect x="200" y="35" width="200" height="15" fill="#53565A" rx="2" />
                  <rect x="200" y="150" width="200" height="15" fill="#53565A" rx="2" />
                  <text x="300" y="25" textAnchor="middle" fill="#666" className="text-[9px] font-black uppercase">Andana V2</text>
                  <text x="300" y="180" textAnchor="middle" fill="#666" className="text-[9px] font-black uppercase">Andana V1</text>

                  {/* Aguja (Crossover) PR side towards PC (Left) */}
                  {/* Diagonal from V2 (top) to V1 (bottom) moving towards PC (Left) */}
                  <line x1="120" y1="60" x2="180" y2="140" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />

                  {/* Direction Labels */}
                  <text x="40" y="100" textAnchor="middle" fill="#666" className="text-[10px] font-black uppercase tracking-widest">← PC</text>
                  <text x="560" y="100" textAnchor="middle" fill="#666" className="text-[10px] font-black uppercase tracking-widest">Gràcia →</text>

                  {/* Real-time trains in PR Diagram */}
                  {liveData.filter(p => p.stationId === 'PR' && p.type === 'TRAIN').map((p, idx) => {
                    const numId = parseInt(p.id.replace(/\D/g, ''));
                    const isAsc = numId % 2 !== 0; // Odd = V1 (Bottom)
                    const trainY = isAsc ? 140 : 60;

                    // Progress within segment logic for PR (PC Left at x=20, GR Right at x=80, PR Center at x=50)
                    let cxValue = 300; // Center if at station
                    if (p.x > 52) { // Moving towards GR (Right)
                      const progress = Math.min(1, (p.x - 50) / 30);
                      cxValue = 300 + (progress * 250); // Move right
                    } else if (p.x < 48) { // Moving towards PC (Left)
                      const progress = Math.min(1, (50 - p.x) / 30);
                      cxValue = 300 - (progress * 250); // Move left
                    }

                    return (
                      <g key={`pr-train-${p.id}`} className="transition-all duration-1000 ease-linear">
                        <circle
                          cx={cxValue}
                          cy={trainY}
                          r={10}
                          fill={p.color}
                          stroke="white"
                          strokeWidth="3"
                          className="drop-shadow-lg"
                        />
                        <text
                          x={cxValue}
                          y={trainY - 15}
                          textAnchor="middle"
                          className="text-[11px] font-black fill-white drop-shadow-md"
                        >
                          {p.id}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="mt-8 flex justify-end">
                <button onClick={() => setIsPRDiagramOpen(false)} className="px-10 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10 hover:border-white/20 shadow-xl">Tancar Esquema</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Diagrama PC */}
        {isPCDiagramOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#121212] p-8 rounded-[40px] border border-white/10 shadow-2xl max-w-4xl w-full relative overflow-hidden ring-1 ring-white/20">
              <button onClick={() => setIsPCDiagramOpen(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full">
                <X size={20} />
              </button>
              <div className="flex items-center gap-4 mb-8">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse ring-4 ring-red-500/20" />
                <h2 className="text-sm font-black text-white uppercase tracking-widest">Esquema de Vies - Pl. Catalunya</h2>
              </div>

              <div className="bg-black/60 rounded-3xl p-8 border border-white/5 relative">
                <svg viewBox="0 0 600 320" className="w-full h-auto">
                  {/* Grid / Reference Lines (Right to Left flow) */}
                  {/* Buffers (Topes) on the Left */}
                  <line x1="105" y1="50" x2="105" y2="70" stroke="#ef4444" strokeWidth="5" />
                  <line x1="105" y1="100" x2="105" y2="120" stroke="#ef4444" strokeWidth="5" />
                  <line x1="105" y1="150" x2="105" y2="170" stroke="#ef4444" strokeWidth="5" />
                  <line x1="105" y1="200" x2="105" y2="220" stroke="#ef4444" strokeWidth="5" />
                  <line x1="105" y1="260" x2="105" y2="280" stroke="#ef4444" strokeWidth="5" />

                  {/* V1 Main */}
                  <line x1="550" y1="60" x2="105" y2="60" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="70" y="65" fill="#A4A7AB" className="text-[14px] font-black opacity-60">V1</text>

                  {/* V2 Main */}
                  <line x1="550" y1="110" x2="105" y2="110" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="70" y="115" fill="#A4A7AB" className="text-[14px] font-black opacity-60">V2</text>

                  {/* Scissors (X) on the Left side - Balanced 50x50 angle */}
                  <line x1="210" y1="60" x2="160" y2="110" stroke="#fbbf24" strokeWidth="2.5" />
                  <line x1="160" y1="60" x2="210" y2="110" stroke="#fbbf24" strokeWidth="2.5" />

                  {/* Switch V2 to V1 on the Right side - Same 50x50 angle */}
                  <line x1="430" y1="110" x2="480" y2="60" stroke="#fbbf24" strokeWidth="2" />

                  {/* V3 Branch from V2 - 50x50 angle */}
                  <path d="M 340 110 L 290 160 L 105 160" fill="none" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="70" y="165" fill="#A4A7AB" className="text-[14px] font-black opacity-60">V3</text>

                  {/* V4 Branch from V2 - 100x100 angle (45deg) */}
                  <path d="M 410 110 L 310 210 L 105 210" fill="none" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="70" y="215" fill="#A4A7AB" className="text-[14px] font-black opacity-60">V4</text>

                  {/* V5 Branch from V4 - 60x60 angle (45deg) */}
                  <path d="M 230 210 L 170 270 L 105 270" fill="none" stroke="#A4A7AB" strokeWidth="3" opacity="0.4" />
                  <text x="70" y="275" fill="#A4A7AB" className="text-[14px] font-black opacity-60">V5</text>

                  {/* Direction Label */}
                  <text x="480" y="40" fill="#666" className="text-[9px] uppercase font-black tracking-widest text-right">Provença →</text>

                  {/* Real-time trains in PC Diagram */}
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

                    // Determine intended track from Supabase data
                    // If stationed, prefer via_inici (departure) or via_final (arrival)
                    // If moving, we use via_inici if it's leaving PC (x > 20)
                    let targetVia = p.final === 'PC' ? p.via_final : p.via_inici;

                    // Fallback to cyclic map if via is unidentified
                    let trackInfo = targetVia ? trackMap[targetVia.trim().toUpperCase()] : null;
                    if (!trackInfo) {
                      const fallbackTracks = [
                        { y: 60, label: "V1" }, { y: 110, label: "V2" }, { y: 160, label: "V3" }, { y: 210, label: "V4" }, { y: 270, label: "V5" }
                      ];
                      trackInfo = fallbackTracks[idx % 5];
                    }

                    // PC Track Geometry Constants
                    const Y_V1 = 60;
                    const Y_V2 = 110;
                    const Y_V3 = 160;
                    const Y_V4 = 210;
                    const Y_V5 = 270;

                    let trainY = trackInfo.y;
                    const trackLabel = trackInfo.label;

                    if (!isStationed) {
                      const numId = parseInt(p.id.replace(/\D/g, ''));
                      const isAsc = numId % 2 !== 0; // Odd = Ascending (Leaves PC)

                      if (isAsc) {
                        // ASCENDING: Leave PC (x: ~125 -> 550)
                        // Step 1: Diagonals for V3, V4, V5 to reach the Y_V2 line (110)
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

                        // Step 2: The SCISSORS CROSSOVER (x: 160 -> 210)
                        // This is where "paths swap names"
                        if (cxValue >= 160 && cxValue <= 210) {
                          const pCross = (cxValue - 160) / 50;
                          if (trackLabel === "V1") {
                            // V1 (Top) crosses to Main V1 (Bottom)
                            trainY = Y_V1 + (pCross * (Y_V2 - Y_V1));
                          } else {
                            // All others (merged on V2 bottom) cross to Main V2 (Top)
                            trainY = Y_V2 - (pCross * (Y_V2 - Y_V1));
                          }
                        } else if (cxValue > 210) {
                          // After scissors, stay on the swapped line
                          trainY = (trackLabel === "V1") ? Y_V2 : Y_V1;
                        }
                      } else {
                        // DESCENDING: Enter PC (x: 550 -> ~125)
                        // Entry point: Everyone enters on V2-Main (Top y=60)
                        trainY = Y_V1;

                        // Crossover 430-480 for those going to V2-V5 (cross to y=110 line)
                        if (trackLabel !== "V1") {
                          if (cxValue >= 430 && cxValue <= 480) {
                            const pGate = (480 - cxValue) / 50;
                            trainY = Y_V1 + (pGate * (Y_V2 - Y_V1));
                          } else if (cxValue < 430) {
                            trainY = Y_V2;
                          }
                        }

                        // Step 2: The SCISSORS CROSSOVER (x: 210 down to 160)
                        if (cxValue >= 160 && cxValue <= 210) {
                          const pCross = (210 - cxValue) / 50;
                          if (trackLabel === "V1") {
                            // If it target is PC-V1 (Top), it must cross from y=110?
                            // Usually, if it wants V1 and just stayed at y=60, it shouldn't cross.
                            // But as the user says "las agujas cruzadas cambian el nombre",
                            // PC-V1(60) connects to Main-V1(110).
                            // So a descending train for V1 must be at y=110 at x=210.
                            // For simplicity, let's assume V1 entry is on y=110 from PR.
                            trainY = Y_V2 - (pCross * (Y_V2 - Y_V1));
                          } else {
                            // Target is V2/V3/V4/V5 (PC-Bottom paths). 
                            // It enters y=60, crosses to y=110 at 430-480 (already handled),
                            // then at scissors it crosses BACK to reach... wait.
                            // PR-V2 (60) -> Scissors -> PC-V2 (110).
                            // So at x=210 it is at y=60, then crosses to y=110.
                            trainY = Y_V1 + (pCross * (Y_V2 - Y_V1));
                          }
                        } else if (cxValue < 160) {
                          // After scissors, target paths
                          if (trackLabel === "V1") trainY = Y_V1;
                          else {
                            trainY = Y_V2;
                            // Diverges from Y_V2 (110)
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
                        <circle
                          cx={cxValue}
                          cy={trainY}
                          r={8}
                          fill={p.color}
                          stroke="white"
                          strokeWidth="2"
                          className="drop-shadow-lg"
                        >
                          <title>{p.id} - {p.driver} (Via {trackLabel})</title>
                        </circle>
                        <text
                          x={cxValue}
                          y={trainY - 12}
                          textAnchor="middle"
                          className="text-[10px] font-black fill-white drop-shadow-md"
                        >
                          {p.id}
                        </text>
                      </g>
                    );
                  })}

                  {/* Parked units in PC Diagram */}
                  {parkedUnits.filter(u => u.depot_id === 'PC').map((u, i) => {
                    const trackMap: Record<string, number> = { "1": 60, "2": 110, "3": 160, "4": 210, "5": 270 };
                    const trainY = trackMap[u.track] || 60;
                    return (
                      <g key={`parked-pc-${u.unit_number}-${i}`} className="animate-in fade-in zoom-in duration-500">
                        <circle cx={135} cy={trainY} r={8} fill="#3b82f6" stroke="white" strokeWidth="2" className="drop-shadow-lg" />
                        <text x={135} y={trainY - 12} textAnchor="middle" className="text-[9px] font-black fill-blue-400 drop-shadow-md">{u.unit_number}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Parked Units Management */}
              <div className="mt-8 border-t border-white/5 pt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">Gestió de Dipòsit (Unitats Estacionades)</h3>
                  <div className="flex gap-2">
                    <input
                      id="pc-unit-input"
                      type="text"
                      placeholder="Unitat (ex: 112.10)"
                      className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-black text-white focus:ring-2 focus:ring-blue-500/50 outline-none w-40 uppercase"
                    />
                    <select
                      id="pc-via-select"
                      className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-black text-white focus:ring-2 focus:ring-blue-500/50 outline-none w-24"
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
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-50"
                    >
                      {depotSyncing ? <Loader2 className="animate-spin" size={14} /> : 'Afegir'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {parkedUnits.filter(u => u.depot_id === 'PC').map((u, i) => (
                    <div key={i} className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-xl group">
                      <div className="flex flex-col">
                        <span className="text-blue-500 font-black text-xs">{u.unit_number}</span>
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
                <button onClick={() => setIsPCDiagramOpen(false)} className="px-10 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10 hover:border-white/20 shadow-xl">Tancar Esquema</button>
              </div>
            </div>
          </div>

        )
        }

        {/* RE Station Diagram */}
        <DepotModal
          isOpen={isREStationDiagramOpen}
          onClose={() => setIsREStationDiagramOpen(false)}
          title="Estació Reina Elisenda"
          depotId="RE_ST"
          tracks={[1, 2]}
          variant="reina_elisenda_station"
          parkedUnits={[]} // No units selectable in station view usually
          onParkedUnitsChange={async () => { }}
          isSyncing={false}
          setSyncing={() => { }}
        />

        {/* RE Diagram (Reina Elisenda - DIPÒSIT) */}
        <DepotModal
          isOpen={isREDiagramOpen}
          onClose={() => setIsREDiagramOpen(false)}
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
          isOpen={isRBDiagramOpen}
          onClose={() => setIsRBDiagramOpen(false)}
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
          isOpen={isNADiagramOpen}
          onClose={() => setIsNADiagramOpen(false)}
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
          isOpen={isPNDiagramOpen}
          onClose={() => setIsPNDiagramOpen(false)}
          title="Estació i Dipòsit Sabadell Parc del Nord"
          depotId="PN"
          tracks={[1, 2, 3]}
          variant="ca_n_oriach"
          parkedUnits={parkedUnits}
          onParkedUnitsChange={onParkedUnitsChange}
          isSyncing={depotSyncing}
          setSyncing={setDepotSyncing}
        />

        {
          selectedRestLocation && groupedRestPersonnel[selectedRestLocation] && (
            <div className="absolute top-0 right-0 h-full w-full sm:w-80 bg-white/95 dark:bg-black/90 backdrop-blur-md border-l border-gray-100 dark:border-white/10 z-[100] p-6 shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto">
              <div className="flex items-center justify-between mb-8 border-b border-gray-100 dark:border-white/5 pb-4"><div className="flex items-center gap-3"><div className="p-2 bg-blue-500 rounded-lg text-white"><Coffee size={20} /></div><div><h4 className="text-sm font-black text-fgc-grey dark:text-white uppercase tracking-tight">Personal en Descans</h4><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{MAP_STATIONS.find(s => s.id === selectedRestLocation)?.id || selectedRestLocation}</p></div></div><button onClick={() => setSelectedRestLocation(null)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"><X size={20} /></button></div>
              <div className="space-y-3">{groupedRestPersonnel[selectedRestLocation].map((p, idx) => (<div key={idx} className="bg-white dark:bg-white/5 p-4 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all group"><div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><span className="bg-fgc-grey dark:bg-black text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">{p.torn}</span>{p.phones && p.phones.length > 0 && (<a href={isPrivacyMode ? undefined : `tel:${p.phones[0]}`} className={`text-blue-500 hover:scale-110 transition-transform ${isPrivacyMode ? 'cursor-default' : ''}`}><Phone size={14} /></a>)}</div><span className="text-[9px] font-black text-fgc-green uppercase tracking-widest">{p.horaPas}</span></div><p className="text-xs font-bold text-fgc-grey dark:text-gray-200 uppercase truncate">{p.driver}</p>{p.phones && p.phones.length > 0 && (<p className="text-[9px] font-bold text-gray-400 mt-1">{isPrivacyMode ? '*** ** ** **' : p.phones[0]}</p>)}</div>))}</div>
            </div>
          )
        }
        {
          (selectedCutStations.size > 0 || selectedCutSegments.size > 0) && dividedPersonnel && (
            <div className="mt-6 space-y-8 animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center gap-4 border-b-4 border-red-500/20 pb-4"><div className="p-3 bg-red-500 rounded-2xl text-white shadow-lg shadow-red-500/20"><Scissors size={24} /></div><div><h4 className="text-[12px] font-black text-red-500 uppercase tracking-[0.2em] leading-none">ANÀLISI DE TALL OPERATIU</h4><p className="text-xl font-black text-fgc-grey dark:text-white uppercase mt-1">Multi-talls actius: {selectedCutStations.size} estacions, {selectedCutSegments.size} trams</p></div></div>
              <div className="flex flex-col gap-6">
                {[
                  { id: 'AFFECTED', label: 'Zona de Tall / Atrapats', Icon: AlertCircle, color: 'red', iconClass: "text-red-500" },
                  { id: 'BCN', label: 'Costat Barcelona', Icon: ArrowDownToLine, color: 'blue', iconClass: "text-blue-500" },
                  { id: 'VALLES', label: 'Costat Vallès', Icon: ArrowUpToLine, color: 'green', iconClass: "text-green-600", unifiedOnly: true },
                  { id: 'S1', label: 'Costat Terrassa', Icon: ArrowUpToLine, color: 'orange', iconClass: "text-orange-500", splitOnly: true },
                  { id: 'S2', label: 'Costat Sabadell', Icon: ArrowRightToLine, color: 'green', iconClass: "text-green-500", splitOnly: true },
                  { id: 'L6', label: 'Costat Elisenda', Icon: ArrowUpToLine, color: 'purple', iconClass: "text-purple-500" },
                  { id: 'L7', label: 'Costat Tibidabo', Icon: ArrowLeftToLine, color: 'amber', iconClass: "text-amber-700" },
                  { id: 'ISOLATED', label: 'Zones Aïllades', Icon: Layers, color: 'gray', iconClass: "text-gray-500" },
                ].map((col) => {
                  const bucket = dividedPersonnel[col.id];
                  const items = (bucket?.list || []).filter(p => isServiceVisible(p.servei, selectedServei));
                  const vallesUnified = dividedPersonnel.VALLES.isUnified;
                  if (col.unifiedOnly && !vallesUnified) return null;
                  if (col.splitOnly && vallesUnified) return null;
                  if (items.length === 0 && col.id !== 'AFFECTED') return null;
                  const trainsCount = items.filter(i => i.type === 'TRAIN').length;
                  const isRed = col.color === 'red';
                  return (
                    <div key={col.id} className={`${isRed ? 'bg-red-50/50 dark:bg-red-950/20 border-2 border-red-500/30 ring-4 ring-red-500/10' : 'glass-card border border-gray-100 dark:border-white/10'} rounded-[32px] p-6 transition-all hover:translate-y-[-4px] group relative overflow-hidden`}>
                      <div className="absolute top-0 left-0 w-full h-1 bg-fgc-green/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
                        <div className="flex items-center gap-2">
                          <col.Icon size={18} className={col.iconClass} />
                          <h5 className={`font-black uppercase text-xs sm:text-sm tracking-widest ${isRed ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>{col.label}</h5>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:ml-auto">
                          <div className="flex items-center gap-1.5 bg-fgc-grey dark:bg-black text-white px-3 py-1 rounded-xl text-[10px] sm:text-xs font-black" title="Trens Actius"><Train size={10} /> {trainsCount} <span className="hidden sm:inline opacity-60">TRENS</span></div>
                          <div className="flex items-center gap-1.5 bg-fgc-green text-fgc-grey px-3 py-1 rounded-xl text-[10px] sm:text-xs font-black" title="Maquinistes a la zona"><User size={10} /> {items.length} <span className="hidden sm:inline opacity-60">MAQUINISTES</span></div>
                          {items.length > 0 && (
                            <button
                              onClick={() => { setAltServiceIsland(col.id); setIsPaused(true); }}
                              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded-xl text-[10px] sm:text-xs font-black shadow-md hover:scale-105 active:scale-95 transition-all"
                            >
                              <Zap size={10} /> SERVEI ALTERNATIU
                            </button>
                          )}
                        </div>
                      </div>
                      <div className={`bg-white dark:bg-black/20 rounded-2xl border ${isRed ? 'border-red-200 dark:border-red-900/50' : 'border-gray-100 dark:border-white/10'} divide-y ${isRed ? 'divide-red-100 dark:divide-red-900/30' : 'divide-gray-50 dark:divide-white/5'}`}>
                        {items
                          .sort((a, b) => (a.type === 'TRAIN' ? 0 : 1) - (b.type === 'TRAIN' ? 0 : 1))
                          .map(t => {
                            const islands = getConnectivityIslands();
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
      </div >
    );
  };

  return (
    <>
      <div className="relative min-h-screen p-4 sm:p-8 space-y-6 animate-in fade-in duration-700 overflow-x-hidden">
        {/* Header con Parallax Suave */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 parallax-slow animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-500 rounded-2xl text-white shadow-xl shadow-red-500/20 shrink-0 aspect-square flex items-center justify-center live-pulse"><ShieldAlert size={28} /></div>
            <div><h1 className="text-2xl sm:text-3xl font-black text-fgc-grey dark:text-white tracking-tight title-glow">Gestió d'Incidències</h1><p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 font-medium pb-1 tracking-tight">Anàlisi de talls, cobertures i Pla de Servei Alternatiu.</p></div>
          </div>
          {mode !== 'INIT' && (
            <div className="flex flex-col gap-2"><span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">Filtre de Servei</span><div className="inline-flex glass-card p-1 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">{['Tots', ...serveiTypes].map(s => (<button key={s} onClick={() => setSelectedServei(s)} className={`px-3 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-black transition-all ${selectedServei === s ? 'bg-fgc-grey dark:bg-fgc-green dark:text-fgc-grey text-white shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-white/10'}`}>{s === 'Tots' ? 'Tots' : `S-${s}`}</button>))}</div></div>
          )}
        </header>

        {mode === 'INIT' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 py-12 max-w-6xl mx-auto">
            <button onClick={() => setMode('MAQUINISTA')} className="group glass-card glass-interactive p-10 rounded-[48px] border border-gray-100 dark:border-white/5 shadow-xl transition-all flex flex-col items-center gap-6"><div className="w-24 h-24 bg-red-50 dark:bg-red-950/20 rounded-full flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform"><User size={48} /></div><div className="text-center"><h3 className="text-2xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Per Circulació</h3><p className="text-sm font-medium text-gray-400 mt-2">Identifica tren i busca cobertura avançada amb intercepció de reserves.</p></div></button>
            <button onClick={() => setMode('LINIA')} className="group glass-card glass-interactive p-10 rounded-[48px] border border-gray-100 dark:border-white/5 shadow-xl transition-all flex flex-col items-center gap-6"><div className="w-24 h-24 bg-fgc-green/10 rounded-full flex items-center justify-center text-fgc-green group-hover:scale-110 transition-transform"><MapIcon size={48} /></div><div className="text-center"><h3 className="text-2xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Per Línia / Tram</h3><p className="text-sm font-medium text-gray-400 mt-2">Gestiona talls de servei i identifica personal a cada costat.</p></div></button>
            <button onClick={() => setMode('PER_TORN')} className="group glass-card glass-interactive p-10 rounded-[48px] border border-gray-100 dark:border-white/5 shadow-xl transition-all flex flex-col items-center gap-6"><div className="w-24 h-24 bg-blue-50 dark:bg-blue-950/20 rounded-full flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform"><RotateCcw size={48} /></div><div className="text-center"><h3 className="text-2xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Per Torn</h3><p className="text-sm font-medium text-gray-400 mt-2">Cobreix totes les circulacions d'un torn descobert utilitzant els buits d'altres.</p></div></button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex justify-start"><button onClick={resetAllModeData} className="text-[10px] font-black text-fgc-green hover:underline uppercase tracking-[0.2em] flex items-center gap-2">← Tornar al selector</button></div>
            {mode === 'MAQUINISTA' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-white dark:bg-gray-900 rounded-[32px] p-8 shadow-sm border border-gray-100 dark:border-white/5 transition-colors">
                  <div className="max-w-2xl mx-auto space-y-6 text-center w-full">
                    <h3 className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Identifica el Tren afectat</h3>
                    <div className="relative">
                      <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={24} />
                      <input type="text" placeholder="Ex: 1104, 2351..." value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearchCirculation()} className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[28px] py-6 pl-16 pr-8 focus:ring-4 focus:ring-red-500/20 outline-none text-xl font-bold transition-all dark:text-white shadow-inner" />
                      <button onClick={handleSearchCirculation} disabled={loading || !query} className="absolute right-3 top-1/2 -translate-y-1/2 bg-fgc-grey dark:bg-fgc-green text-white dark:text-fgc-grey px-8 py-3 rounded-2xl font-black text-sm hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50">{loading ? <Loader2 className="animate-spin" size={20} /> : 'BUSCAR'}</button>
                    </div>
                  </div>
                </div>

                {loading ? (
                  <div className="space-y-10 animate-in fade-in duration-500">
                    <div className="space-y-4">
                      <div className="skeleton-item h-4 w-32 ml-2" />
                      <div className="skeleton-item h-40 w-full rounded-[24px]" />
                    </div>
                    <div className="space-y-4">
                      <div className="skeleton-item h-4 w-48 ml-2" />
                      <div className="grid grid-cols-1 gap-2">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="skeleton-item h-24 w-full rounded-2xl" />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : searchedCircData && (
                  <div className="grid grid-cols-1 gap-8">


                    <div className="space-y-10">
                      {mainDriverInfo && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 px-2"><UserCheck className="text-fgc-green" size={16} /><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Maquinista titular</h3></div>
                          <div className="bg-white dark:bg-gray-800 rounded-[24px] p-5 sm:p-6 border-2 border-fgc-green shadow-lg shadow-fgc-green/5 relative overflow-hidden group transition-colors">
                            <div className="flex flex-col">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-4">
                                  <div className="h-12 min-w-[3.5rem] px-3 bg-fgc-grey dark:bg-black text-white rounded-xl flex items-center justify-center font-black text-xl shadow-md shrink-0 whitespace-nowrap">{mainDriverInfo.id}</div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-xl font-black text-fgc-grey dark:text-white tracking-tight leading-none truncate">{mainDriverInfo.drivers[0]?.cognoms}, {mainDriverInfo.drivers[0]?.nom}</p>
                                      {mainDriverInfo.drivers[0]?.tipus_torn && (
                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border shrink-0 ${mainDriverInfo.drivers[0].tipus_torn === 'Reducció'
                                          ? 'bg-purple-600 text-white border-purple-700'
                                          : 'bg-blue-600 text-white border-blue-700'
                                          }`}>
                                          {mainDriverInfo.drivers[0].tipus_torn}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1"><div className="w-2 h-2 bg-fgc-green rounded-full animate-pulse" /><span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Nom. {mainDriverInfo.drivers[0]?.nomina}</span>{mainDriverInfo.fullCirculations?.find((c: any) => c.codi?.toUpperCase() === searchedCircData.id.toUpperCase())?.train && (<span className="bg-fgc-green/20 dark:bg-fgc-green/10 text-fgc-grey dark:text-fgc-green px-2 py-0.5 rounded text-[9px] font-black uppercase flex items-center gap-1"><Train size={10} /> {mainDriverInfo.fullCirculations.find((c: any) => c.codi?.toUpperCase() === searchedCircData.id.toUpperCase()).train}</span>)}</div>
                                  </div>
                                </div>
                                <div className="flex gap-1">{mainDriverInfo.drivers[0]?.phones?.map((p: string, i: number) => (<a key={i} href={`tel:${p}`} className="flex items-center justify-center gap-2 bg-fgc-grey dark:bg-black text-white px-5 py-2.5 rounded-xl font-black text-xs hover:bg-fgc-dark transition-all shadow-md active:scale-95 whitespace-nowrap"><Phone size={14} /> {p}</a>))}</div>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-3 border-t border-gray-100 dark:border-white/5 transition-colors">
                                <div className="flex items-center gap-2"><span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter">TORN:</span><span className="text-base sm:text-lg font-black text-fgc-grey dark:text-gray-200 whitespace-nowrap">{mainDriverInfo.inici_torn} — {mainDriverInfo.final_torn} <span className="text-xs font-bold text-gray-400 dark:text-gray-500 ml-2">({mainDriverInfo.duracio})</span></span></div>
                                {searchedCircData && (<div className="flex items-center gap-2"><span className="text-[9px] font-black text-fgc-green uppercase tracking-tighter">CIRCULACIÓ:</span><span className="text-base sm:text-lg font-black text-fgc-grey dark:text-gray-200 whitespace-nowrap">{searchedCircData.id} │ {searchedCircData.sortida} — {searchedCircData.arribada} <span className="text-xs font-bold text-gray-400 dark:text-gray-500 ml-1">({(getFgcMinutes(searchedCircData.arribada) || 0) - (getFgcMinutes(searchedCircData.sortida) || 0)} min)</span></span></div>)}
                                {searchedCircData && (<div className="flex items-center gap-2"><span className="text-[9px] font-black text-blue-500 uppercase tracking-tighter">VIES:</span><span className="text-base sm:text-lg font-black text-fgc-grey dark:text-gray-200 whitespace-nowrap">V{searchedCircData.via_inici || '?'} → V{searchedCircData.via_final || '?'}</span></div>)}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="space-y-4">
                        <div className="flex items-center gap-2 px-2"><Users className="text-blue-500" size={16} /><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Maquinistes de viatger ({passengerResults.length})</h3></div>
                        {passengerResults.length > 0 ? (<div className="flex flex-col gap-2">{passengerResults.map((torn, idx) => <CompactViatgerRow key={idx} torn={torn} viatgerCirc={torn.fullCirculations?.find((c: any) => c.codi === 'Viatger' && c.observacions && c.observacions.split('-')[0].toUpperCase() === searchedCircData.id.toUpperCase())} colorClass="border-l-blue-500" isPrivacyMode={isPrivacyMode} />)}</div>) : (<div className="bg-gray-50/50 dark:bg-black/20 rounded-2xl p-6 text-center border border-dashed border-gray-200 dark:border-white/10 transition-colors"><p className="text-gray-400 dark:text-gray-600 font-bold italic text-xs">Cap maquinista de viatger detectat.</p></div>)}
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center gap-2 px-2"><Users className="text-purple-500" size={16} /><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Maquinistes de viatger (Anterior / Posterior)</h3></div>
                        {(adjacentResults.anterior.length > 0 || adjacentResults.posterior.length > 0) ? (<div className="flex flex-col gap-2">
                          {adjacentResults.anterior.map((torn, idx) => <CompactViatgerRow key={`ant-${idx}`} torn={torn} viatgerCirc={torn.fullCirculations?.find((c: any) => c.codi === 'Viatger' && c.observacions && c.observacions.split('-')[0].toUpperCase() === torn.adjacentCode?.toUpperCase())} colorClass="border-l-purple-400" label={<span className="flex items-center gap-1 text-[8px] text-purple-600 font-black uppercase"><Rewind size={10} /> {torn.adjacentCode} (Ant)</span>} isPrivacyMode={isPrivacyMode} />)}
                          {adjacentResults.posterior.map((torn, idx) => <CompactViatgerRow key={`post-${idx}`} torn={torn} viatgerCirc={torn.fullCirculations?.find((c: any) => c.codi === 'Viatger' && c.observacions && c.observacions.split('-')[0].toUpperCase() === torn.adjacentCode?.toUpperCase())} colorClass="border-l-purple-600" label={<span className="flex items-center gap-1 text-[8px] text-purple-600 font-black uppercase"><FastForward size={10} /> {torn.adjacentCode} (Post)</span>} isPrivacyMode={isPrivacyMode} />)}
                        </div>) : (<div className="bg-gray-50/50 dark:bg-black/20 rounded-2xl p-6 text-center border border-dashed border-gray-200 dark:border-white/10 transition-colors"><p className="text-gray-400 dark:text-gray-600 font-bold italic text-xs">Cap viatger en circulacions adjacents.</p></div>)}
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center gap-2 px-2"><Coffee className="text-fgc-green" size={16} /><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Maquinistes en descans ({restingResults.length})</h3></div>
                        {restingResults.length > 0 ? (<div className="flex flex-col gap-2">{restingResults.map((torn, idx) => (<div key={idx} className="bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all flex items-center gap-4 border-l-4 border-l-fgc-green">
                          <div className="h-10 min-w-[2.5rem] px-2 bg-fgc-grey/10 dark:bg-black text-fgc-grey dark:text-gray-300 rounded-xl flex items-center justify-center font-black text-xs shadow-sm shrink-0 whitespace-nowrap">{torn.id}</div>
                          <div className="flex flex-col min-w-[160px] max-w-[220px]">
                            <p className="text-xs sm:text-sm font-black text-fgc-grey dark:text-gray-200 truncate">{torn.drivers[0]?.cognoms}, {torn.drivers[0]?.nom}</p>
                            <span className="flex items-center gap-1 text-[8px] text-fgc-green font-black uppercase tracking-widest mt-0.5"><MapPin size={8} /> {torn.restSeg.codi}</span>
                            <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-0.5">Nom. {torn.drivers[0]?.nomina}</p>
                          </div>

                          <div className="flex-1 px-4 flex flex-col justify-center space-y-1.5 border-l border-gray-100 dark:border-white/5 mx-2">
                            {torn.nextCirculation ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <div className="bg-gray-100 dark:bg-white/10 p-1.5 rounded-lg text-gray-400 dark:text-gray-500"><Train size={12} /></div>
                                  <span className="text-[10px] font-black text-fgc-grey dark:text-gray-300 uppercase leading-none">
                                    SEGÜENT: CIRC. {torn.nextCirculation.codi} <span className="text-gray-400 dark:text-gray-500 ml-1">({formatFgcTime(torn.nextCirculation.start)} - {formatFgcTime(torn.nextCirculation.end)})</span>
                                  </span>
                                </div>
                                <div className="pl-8 space-y-1">
                                  {torn.returnStatus === 'same_station' && (
                                    <p className="text-[9px] font-bold text-fgc-green flex items-center gap-1.5"><CheckCircle2 size={10} /> Ja a l'estació ({torn.fullCirculations?.find((c: any) => c.codi === torn.nextCirculation.codi)?.machinistInici || '?'})</p>
                                  )}
                                  {torn.returnStatus === 'ok' && torn.returnCirc && (
                                    <p className="text-[9px] font-bold text-fgc-green flex items-center gap-1.5"><CheckCircle2 size={10} /> Tornada: {torn.returnCirc.id} ({torn.returnCirc.sortida}-{torn.returnCirc.arribada})</p>
                                  )}
                                  {torn.returnStatus === 'too_late' && torn.returnCirc && (
                                    <p className="text-[9px] font-bold text-red-500 flex items-center gap-1.5"><X size={10} /> Tard amb {torn.returnCirc.id} ({torn.returnCirc.arribada})</p>
                                  )}
                                  {torn.returnStatus === 'no_route' && (
                                    <p className="text-[9px] font-bold text-orange-500 flex items-center gap-1.5"><ShieldAlert size={10} /> No s'ha trobat tren tornada</p>
                                  )}
                                  {torn.returnStatus === 'unknown' && (
                                    <p className="text-[9px] font-bold text-gray-400 flex items-center gap-1.5"><Info size={10} /> Ubicació desc.</p>
                                  )}
                                  <p className="text-[9px] font-medium text-red-500 dark:text-red-400 leading-none pt-0.5">⚠️ Quedarà descoberta si no s'arriba.</p>
                                </div>
                              </>
                            ) : (
                              <div className="flex items-center gap-2 text-gray-300 dark:text-gray-600 italic text-[10px]">
                                <Info size={12} /> Sense assignació posterior confirmada
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <div className="flex items-center gap-1.5 bg-fgc-green/10 dark:bg-fgc-green/5 px-3 py-1 rounded-lg border border-fgc-green/20 dark:border-fgc-green/10 transition-colors">
                              <span className="text-[10px] font-black uppercase text-fgc-grey dark:text-gray-300">{formatFgcTime(torn.restSeg.start)}</span>
                              <ArrowRight size={10} className="text-fgc-green" />
                              <span className="text-[10px] font-black uppercase text-fgc-grey dark:text-gray-300">{formatFgcTime(torn.restSeg.end)}</span>
                            </div>
                            <div className={`text-[10px] font-black px-2 py-0.5 rounded border min-w-[80px] text-center flex items-center justify-center gap-1 ${torn.conflictMinutes > 0 ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30' : 'text-fgc-green bg-fgc-green/5 border-fgc-green/10'}`}>
                              {torn.conflictMinutes > 0 && <ShieldAlert size={10} />}
                              {torn.availableTime} MIN ÚTILS
                            </div>
                            {torn.conflictMinutes > 0 ? (
                              <span className="text-[8px] font-bold text-red-500 dark:text-red-400 uppercase tracking-tight">Solapa {torn.conflictMinutes} min</span>
                            ) : (
                              <span className="text-[8px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-tight">Total: {torn.restSeg.end - torn.restSeg.start} min</span>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">{torn.drivers[0]?.phones?.map((p: string, i: number) => (<a key={i} href={isPrivacyMode ? undefined : `tel:${p}`} className={`w-8 h-8 bg-fgc-grey dark:bg-black text-white rounded-lg flex items-center justify-center hover:bg-fgc-dark transition-all shadow-sm ${isPrivacyMode ? 'cursor-default' : ''}`}><Phone size={12} /></a>))}</div>
                        </div>))}</div>) : (<div className="bg-gray-50/50 dark:bg-black/20 rounded-2xl p-6 text-center border border-dashed border-gray-200 dark:border-white/10 transition-colors"><p className="text-gray-400 dark:text-gray-600 font-bold italic text-xs">Cap maquinista en descans.</p></div>)}
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center gap-2 px-2"><Timer className="text-orange-500" size={16} /><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Torns amb possibilitat de perllongar ({extensibleResults.length})</h3></div>
                        {extensibleResults.length > 0 ? (<div className="flex flex-col gap-2">{extensibleResults.map((torn, idx) => (<div key={idx} className="bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all flex items-center gap-4 border-l-4 border-l-orange-500">
                          <div className="h-10 min-w-[2.5rem] px-2 bg-orange-50 dark:bg-orange-950/20 text-orange-600 rounded-xl flex items-center justify-center font-black text-xs shadow-sm shrink-0 whitespace-nowrap">{torn.id}</div>
                          <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-6"><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><p className="text-sm font-black text-fgc-grey dark:text-gray-200 truncate">{torn.drivers[0]?.cognoms}, {torn.drivers[0]?.nom}</p><span className="flex items-center gap-1 text-[8px] text-orange-500 font-black uppercase tracking-widest"><Timer size={10} /> Extensible</span></div><div className="flex items-center gap-2 mt-0.5"><p className="text-[8px] font-black text-gray-300 dark:text-gray-600 uppercase tracking-widest">Nom. {torn.drivers[0]?.nomina} {torn.drivers[0]?.tipus_torn ? `(${torn.drivers[0].tipus_torn})` : ''}</p><span className="text-[8px] font-bold text-gray-400 dark:text-gray-500 uppercase">Durada: {torn.duracio}</span></div></div><div className="flex items-center gap-3 text-fgc-grey dark:text-gray-300 shrink-0"><div className="flex flex-col items-end"><div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-950/20 px-3 py-1 rounded-lg border border-orange-100 dark:border-orange-900/40 transition-colors"><span className="text-[10px] font-black uppercase text-orange-700 dark:text-orange-400">{formatFgcTime(getFgcMinutes(torn.final_torn))}</span><ArrowRight size={10} className="text-orange-300" /><span className="text-[10px] font-black uppercase text-orange-700 dark:text-orange-400">{formatFgcTime(torn.extData.estimatedReturn)}</span></div><span className="text-[8px] font-black text-orange-400 uppercase tracking-tighter mt-1">Extra: +{torn.extData.extraNeeded} min</span></div><div className="text-[10px] font-black text-white bg-orange-500 px-3 py-1 rounded-lg border border-orange-600 min-w-[100px] text-center shadow-sm">{Math.floor((525 - (torn.extData.originalDuration + torn.extData.extraNeeded)))} MIN MARGE</div></div></div>
                          <div className="flex gap-1 shrink-0">{torn.drivers[0]?.phones?.map((p: string, i: number) => (<a key={i} href={isPrivacyMode ? undefined : `tel:${p}`} className={`w-8 h-8 bg-orange-500 text-white rounded-lg flex items-center justify-center hover:bg-orange-600 transition-all shadow-sm ${isPrivacyMode ? 'cursor-default' : ''}`}><Phone size={12} /></a>))}</div>
                        </div>))}</div>) : (<div className="bg-gray-50/50 dark:bg-black/20 rounded-2xl p-6 text-center border border-dashed border-gray-200 dark:border-white/10 transition-colors"><p className="text-gray-400 dark:text-gray-600 font-bold italic text-xs">Cap torn extensible fins al final.</p></div>)}
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center gap-2 px-2"><Repeat className="text-indigo-500" size={16} /><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Perllongament + Reserva ({reserveInterceptResults.length})</h3></div>
                        {reserveInterceptResults.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {reserveInterceptResults.map((torn, idx) => (
                              <div key={idx} className="bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all flex items-center gap-4 border-l-4 border-l-indigo-500">
                                <div className="h-10 min-w-[2.5rem] px-2 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 rounded-xl flex items-center justify-center font-black text-xs shadow-sm shrink-0 whitespace-nowrap">{torn.id}</div>
                                <div className="flex flex-col min-w-[160px] max-w-[220px]">
                                  <p className="text-xs sm:text-sm font-black text-fgc-grey dark:text-gray-200 truncate">{torn.drivers[0]?.cognoms}, {torn.drivers[0]?.nom}</p>
                                  <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-0.5">Nom. {torn.drivers[0]?.nomina} {torn.drivers[0]?.tipus_torn ? `(${torn.drivers[0].tipus_torn})` : ''}</p>
                                </div>
                                <div className="flex-1 px-4 flex flex-col justify-center space-y-1.5 border-l border-gray-100 dark:border-white/5 mx-2">
                                  <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-indigo-500 font-black uppercase tracking-tight bg-indigo-50 dark:bg-indigo-950/30 px-2 py-0.5 rounded-lg border border-indigo-100 dark:border-indigo-500/10">
                                      <Repeat size={10} />
                                      {torn.resData.reservaId} → Relleu a {torn.resData.name} ({torn.resData.interceptTime})
                                      {torn.resData.secondaryRes && ` + R.2 a ${torn.resData.secondaryRes.station} ({torn.resData.secondaryRes.time})`}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {torn.resData.driverReturnCirc && (<span className="text-[9px] font-bold text-gray-400 bg-gray-50 dark:bg-white/5 px-1.5 py-0.5 rounded flex items-center gap-1 whitespace-nowrap"><ArrowRight size={8} className="text-green-500" /> T. Maq: <span className="text-fgc-grey dark:text-white">{torn.resData.driverReturnCirc.id} ({torn.resData.driverReturnCirc.sortida}-{torn.resData.driverReturnCirc.arribada})</span></span>)}
                                    {torn.resData.primaryReturnCirc && (<span className="text-[9px] font-bold text-gray-400 bg-gray-50 dark:bg-white/5 px-1.5 py-0.5 rounded flex items-center gap-1 whitespace-nowrap"><ArrowRight size={8} className="text-indigo-400" /> T. Res 1: <span className="text-fgc-grey dark:text-white">{torn.resData.primaryReturnCirc.id} ({torn.resData.primaryReturnCirc.sortida}-{torn.resData.primaryReturnCirc.arribada})</span></span>)}
                                    {torn.resData.secondaryRes?.returnCirculation && (<span className="text-[9px] font-bold text-gray-400 bg-gray-50 dark:bg-white/5 px-1.5 py-0.5 rounded flex items-center gap-1 whitespace-nowrap"><ArrowRight size={8} className="text-indigo-400" /> T. Res 2: <span className="text-fgc-grey dark:text-white">{torn.resData.secondaryRes.returnCirculation.id}</span></span>)}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 text-fgc-grey dark:text-gray-300 shrink-0"><div className="flex flex-col items-center"><div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/20 px-3 py-1 rounded-lg border border-indigo-100 dark:border-indigo-900/40 transition-colors"><span className="text-[10px] font-black uppercase text-indigo-700 dark:text-indigo-400">{formatFgcTime(getFgcMinutes(torn.final_torn))}</span><ArrowRight size={10} className="text-indigo-300" /><span className="text-[10px] font-black uppercase text-indigo-700 dark:text-indigo-400">{formatFgcTime((getFgcMinutes(torn.resData.interceptTime) || 0) + 25)}</span></div><span className="text-[8px] font-black text-indigo-400 uppercase tracking-tighter mt-1">Extra Torn: +{torn.resData.extraNeeded} min</span>{torn.resData.reserveExtraNeeded > 0 && <span className="text-[8px] font-black text-pink-500 uppercase tracking-tighter mt-0.5">Extra Res: +{torn.resData.reserveExtraNeeded} min</span>}</div><div className="text-[10px] font-black text-white bg-indigo-500 px-3 py-1 rounded-lg border border-indigo-600 min-w-[100px] text-center shadow-sm">{Math.floor((525 - (torn.resData.originalDuration + torn.resData.extraNeeded)))} MIN MARGE</div></div>
                                <div className="flex gap-1 shrink-0">{torn.drivers[0]?.phones?.map((p: string, i: number) => (<a key={i} href={isPrivacyMode ? undefined : `tel:${p}`} className={`w-8 h-8 bg-indigo-500 text-white rounded-lg flex items-center justify-center hover:bg-blue-600 transition-all shadow-sm ${isPrivacyMode ? 'cursor-default' : ''}`}><Phone size={12} /></a>))}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="bg-gray-50/50 dark:bg-black/20 rounded-2xl p-6 text-center border border-dashed border-gray-200 dark:border-white/10 transition-colors">
                            <p className="text-gray-400 dark:text-gray-600 font-bold italic text-xs">Cap possibilitat d'intercepció amb reserves.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {!passengerResults.length && !adjacentResults.anterior.length && !adjacentResults.posterior.length && !restingResults.length && !extensibleResults.length && !reserveInterceptResults.length && (
                      <div className="py-20 text-center space-y-4 opacity-40">
                        <div className="w-20 h-20 bg-gray-50 dark:bg-black/20 rounded-full flex items-center justify-center mx-auto text-gray-200 dark:text-gray-800"><User size={40} /></div>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest italic">No s'han trobat opcions de cobertura.</p>
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}

            {mode === 'LINIA' && (<div className="w-full">{renderInteractiveMap()}</div>)}
            {mode === 'PER_TORN' && (<IncidenciaPerTorn selectedServei={selectedServei} showSecretMenu={showSecretMenu} isPrivacyMode={isPrivacyMode} />)}

          </div>
        )
        }

      </div>
      {mode === 'INIT' && !loading && (<div className="py-32 text-center opacity-10 flex flex-col items-center"><ShieldAlert size={100} className="text-fgc-grey mb-8" /><p className="text-xl font-black uppercase tracking-[0.4em] text-fgc-grey">Centre de Gestió Operativa</p></div>)}

      {altServiceIsland && <AlternativeServiceOverlay islandId={altServiceIsland} />}
    </>
  );
};

export default IncidenciaView;