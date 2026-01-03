
import React, { useState, useEffect, useMemo } from 'react';
import { Search, ShieldAlert, Loader2, UserCheck, Clock, MapPin, AlertCircle, Phone, Info, Users, Zap, User, Train, Map as MapIcon, ChevronRight, LayoutGrid, X, Timer, Scissors, ArrowDownToLine, ArrowUpToLine, ArrowLeftToLine, ArrowRightToLine, Coffee, Layers, Trash2, Repeat, Rewind, FastForward, CheckCircle2 } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';
import { DailyAssignment, Shift, Circulation } from '../types.ts';

const RESERVAS_CONFIG = [
  { id: 'QRS1', loc: 'SR', start: '06:00', end: '14:00' },
  { id: 'QRS2', loc: 'SR', start: '14:00', end: '22:00' },
  { id: 'QRS0', loc: 'SR', start: '22:00', end: '06:00' },
  { id: 'QRP0', loc: 'PC', start: '22:00', end: '06:00' },
  { id: 'QRN0', loc: 'NA', start: '22:00', end: '06:00' },
  { id: 'QRF0', loc: 'PN', start: '22:00', end: '06:00' },
  { id: 'QRR0', loc: 'RB', start: '22:00', end: '06:00' },
  { id: 'QRR4', loc: 'RB', start: '21:50', end: '05:50' },
  { id: 'QRR1', loc: 'RB', start: '06:00', end: '14:00' },
  { id: 'QRR2', loc: 'RB', start: '14:00', end: '22:00' },
];

type IncidenciaMode = 'INIT' | 'MAQUINISTA' | 'LINIA';

interface LivePersonnel {
  type: 'TRAIN' | 'REST';
  id: string; 
  linia: string;
  stationId: string;
  color: string;
  driver?: string;
  torn?: string;
  phones?: string[];
  inici?: string;
  final?: string;
  horaPas?: string;
  x: number;
  y: number;
  visualOffset?: number;
}

const PATHS = {
  TRUNK: ['PC', 'PR', 'GR', 'SG', 'MN', 'BN', 'TT', 'SR', 'PF', 'VL', 'LP', 'LF', 'VD', 'SC'],
  L7: ['GR', 'PM', 'PD', 'EP', 'TB'],
  L6: ['SR', 'RE'],
  S1: ['SC', 'MS', 'HG', 'RB', 'FN', 'TR', 'VP', 'EN', 'NA'],
  S2: ['SC', 'VO', 'SJ', 'BT', 'UN', 'SQ', 'CF', 'PJ', 'CT', 'NO', 'PN']
};

const resolveStationId = (name: string, linia: string) => {
    const n = name?.toUpperCase().trim();
    const l = linia?.toUpperCase().trim() || '';
    const isS1 = l === 'S1' || l === '400' || l === 'S-400' || l === '4';
    if ((n === 'LF' || n === 'LES FONTS') && isS1) return 'FN';
    if (n === 'LES FONTS') return 'FN';
    if (n === 'LA FLORESTA') return 'LF';
    return n;
};

const getFullPath = (start: string, end: string): string[] => {
  if (start === end) return [start];
  const findPathInfo = (node: string, preferredKey?: string) => {
    if (preferredKey && PATHS[preferredKey as keyof typeof PATHS].includes(node)) {
      const p = PATHS[preferredKey as keyof typeof PATHS];
      return { key: preferredKey, idx: p.indexOf(node), path: p };
    }
    for (const [key, p] of Object.entries(PATHS)) {
      const idx = p.indexOf(node);
      if (idx !== -1) return { key, idx, path: p };
    }
    return null;
  };
  const p1raw = findPathInfo(start);
  const p2raw = findPathInfo(end);
  if (!p1raw || !p2raw) return [start, end];
  const p1 = findPathInfo(start, p2raw.key) || p1raw;
  const p2 = findPathInfo(end, p1.key) || p2raw;
  if (p1.key === p2.key) {
    const isForward = p1.idx < p2.idx;
    const slice = p1.path.slice(Math.min(p1.idx, p2.idx), Math.max(p1.idx, p2.idx) + 1);
    return isForward ? slice : [...slice].reverse();
  }
  const junctions: Record<string, string> = { L7: 'GR', L6: 'SR', S1: 'SC', S2: 'SC', TRUNK: '' };
  if (p1.key === 'TRUNK') {
    const junction = junctions[p2.key];
    return [...getFullPath(start, junction), ...getFullPath(junction, end).slice(1)];
  }
  if (p2.key === 'TRUNK') {
    const junction = junctions[p1.key];
    return [...getFullPath(start, junction), ...getFullPath(junction, end).slice(1)];
  }
  const junction1 = junctions[p1.key];
  const junction2 = junctions[p2.key];
  return [...getFullPath(start, junction1), ...getFullPath(junction1, junction2).slice(1), ...getFullPath(junction2, end).slice(1)];
};

const MAP_STATIONS = [
  { id: 'PC', label: 'PC', x: 20, y: 100 }, { id: 'PR', label: 'PR', x: 50, y: 100 }, { id: 'GR', label: 'GR', x: 80, y: 100 }, { id: 'SG', label: 'SG', x: 110, y: 100 }, { id: 'MN', label: 'MN', x: 140, y: 100 }, { id: 'BN', label: 'BN', x: 170, y: 100 }, { id: 'TT', label: 'TT', x: 200, y: 100 }, { id: 'SR', label: 'SR', x: 230, y: 100 }, { id: 'PF', label: 'PF', x: 260, y: 100 }, { id: 'VL', label: 'VL', x: 290, y: 100 }, { id: 'LP', label: 'LP', x: 320, y: 100 }, { id: 'LF', label: 'LF', x: 350, y: 100 }, { id: 'VD', label: 'VD', x: 380, y: 100 }, { id: 'SC', label: 'SC', x: 410, y: 100 }, { id: 'PM', label: 'PM', x: 100, y: 160 }, { id: 'PD', label: 'PD', x: 130, y: 160 }, { id: 'EP', label: 'EP', x: 160, y: 160 }, { id: 'TB', label: 'TB', x: 190, y: 160 }, { id: 'RE', label: 'RE', x: 230, y: 40 }, { id: 'MS', label: 'MS', x: 440, y: 40 }, { id: 'HG', label: 'HG', x: 470, y: 40 }, { id: 'RB', label: 'RB', x: 500, y: 40 }, { id: 'FN', label: 'FN', x: 530, y: 40 }, { id: 'TR', label: 'TR', x: 560, y: 40 }, { id: 'VP', label: 'VP', x: 590, y: 40 }, { id: 'EN', label: 'EN', x: 620, y: 40 }, { id: 'NA', label: 'NA', x: 650, y: 40 }, { id: 'VO', label: 'VO', x: 440, y: 160 }, { id: 'SJ', label: 'SJ', x: 470, y: 160 }, { id: 'BT', label: 'BT', x: 500, y: 160 }, { id: 'UN', label: 'UN', x: 530, y: 160 }, { id: 'SQ', label: 'SQ', x: 560, y: 160 }, { id: 'CF', label: 'CF', x: 590, y: 160 }, { id: 'PJ', label: 'PJ', x: 620, y: 160 }, { id: 'CT', label: 'CT', x: 650, y: 160 }, { id: 'NO', label: 'NO', x: 680, y: 160 }, { id: 'PN', label: 'PN', x: 710, y: 160 },
];

const MAP_SEGMENTS = [
  { from: 'PC', to: 'PR' }, { from: 'PR', to: 'GR' }, { from: 'GR', to: 'SG' }, { from: 'SG', to: 'MN' }, { from: 'MN', to: 'BN' }, { from: 'BN', to: 'TT' }, { from: 'TT', to: 'SR' }, { from: 'SR', to: 'PF' }, { from: 'PF', to: 'VL' }, { from: 'VL', to: 'LP' }, { from: 'LP', to: 'LF' }, { from: 'LF', to: 'VD' }, { from: 'VD', to: 'SC' }, { from: 'GR', to: 'PM' }, { from: 'PM', to: 'PD' }, { from: 'PD', to: 'EP' }, { from: 'EP', to: 'TB' }, { from: 'SR', to: 'RE' }, { from: 'SC', to: 'MS' }, { from: 'MS', to: 'HG' }, { from: 'HG', to: 'RB' }, { from: 'RB', to: 'FN' }, { from: 'FN', to: 'TR' }, { from: 'TR', to: 'VP' }, { from: 'VP', to: 'EN' }, { from: 'EN', to: 'NA' }, { from: 'SC', to: 'VO' }, { from: 'VO', to: 'SJ' }, { from: 'SJ', to: 'BT' }, { from: 'BT', to: 'UN' }, { from: 'UN', to: 'SQ' }, { from: 'SQ', to: 'CF' }, { from: 'CF', to: 'PJ' }, { from: 'PJ', to: 'CT' }, { from: 'CT', to: 'NO' }, { from: 'NO', to: 'PN' },
];

export const IncidenciaView: React.FC = () => {
  const [mode, setMode] = useState<IncidenciaMode>('INIT');
  const [selectedServei, setSelectedServei] = useState<string>('0');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  
  const [isRealTime, setIsRealTime] = useState(true);
  const [customTime, setCustomTime] = useState('');
  const [displayMin, setDisplayMin] = useState<number>(0);
  const [liveData, setLiveData] = useState<LivePersonnel[]>([]);
  
  const [originalShift, setOriginalShift] = useState<any>(null);
  const [selectedCircId, setSelectedCircId] = useState<string>('');
  const [selectedStation, setSelectedStation] = useState<string>('');
  
  const [selectedCutStations, setSelectedCutStations] = useState<Set<string>>(new Set());
  const [selectedCutSegments, setSelectedCutSegments] = useState<Set<string>>(new Set());
  
  const [selectedRestLocation, setSelectedRestLocation] = useState<string | null>(null);
  
  // Estats per als resultats avançats (estil Circulació Descoberta)
  const [passengerResults, setPassengerResults] = useState<any[]>([]);
  const [adjacentPassengerResults, setAdjacentPassengerResults] = useState<{anterior: any[], posterior: any[]}>({anterior: [], posterior: []});
  const [restingDriversResults, setRestingDriversResults] = useState<any[]>([]);
  const [extensibleDriversResults, setExtensibleDriversResults] = useState<any[]>([]);
  const [reserveExtensionResults, setReserveExtensionResults] = useState<any[]>([]);

  const serveiTypes = ['0', '100', '400', '500'];

  function getFgcMinutes(timeStr: string) {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const [h, m] = timeStr.split(':').map(Number);
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

  useEffect(() => {
    if (isRealTime) {
      const updateTime = () => {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        setCustomTime(timeStr);
        setDisplayMin(getFgcMinutes(timeStr));
      };
      updateTime();
      const interval = setInterval(updateTime, 60000);
      return () => clearInterval(interval);
    }
  }, [isRealTime]);

  const getShortTornId = (id: string) => {
    const trimmed = id.trim();
    if (trimmed.startsWith('Q') && !trimmed.startsWith('QR') && trimmed.length === 5) return trimmed[0] + trimmed.slice(2);
    return trimmed;
  };

  const fetchFullTurnData = async (turnId: string) => {
    const { data: shift } = await supabase.from('shifts').select('*').eq('id', turnId).single();
    if (!shift) return null;
    const shortId = getShortTornId(shift.id as string);
    const { data: assignments } = await supabase.from('daily_assignments').select('*').eq('torn', shortId);
    const primary = assignments?.[0] || null;
    const { data: phoneData } = primary?.empleat_id ? await supabase.from('phonebook').select('*').eq('nomina', primary.empleat_id).single() : { data: null };
    
    const circs = (shift.circulations as any[]) || [];
    const circIds = circs.map((c: any) => (typeof c === 'string' ? c : c.codi) === 'Viatger' && c.observacions ? c.observacions.split('-')[0] : (typeof c === 'string' ? c : c.codi));
    const { data: details } = await supabase.from('circulations').select('*').in('id', circIds);
    const { data: trainAssig } = await supabase.from('assignments').select('*');

    const fullCircs = circs.map((c: any) => {
      const codi = typeof c === 'string' ? c : c.codi;
      const isViatger = codi === 'Viatger';
      const obsParts = isViatger && c.observacions ? c.observacions.split('-') : [];
      const realCodiId = isViatger && obsParts.length > 0 ? obsParts[0] : codi;
      const d = details?.find(det => det.id === realCodiId);
      let mInici = c.inici || d?.inici;
      let mFinal = c.final || d?.final;
      if (isViatger && obsParts.length >= 3) { mInici = obsParts[1]; mFinal = obsParts[2]; }
      const cycleInfo = c.cicle ? trainAssig?.find(ta => ta.cycle_id === c.cicle) : null;
      return { ...d, ...c, codi, machinistInici: mInici, machinistFinal: mFinal, train: cycleInfo?.train_number, realCodi: isViatger ? realCodiId : null };
    }).sort((a: any, b: any) => getFgcMinutes(a.sortida || '00:00') - getFgcMinutes(b.sortida || '00:00'));

    return { 
      ...shift, 
      driver: { nom: primary?.nom || 'No assignat', cognoms: primary?.cognoms || '', nomina: primary?.empleat_id || '---', phones: phoneData?.phones || [], tipus_torn: primary?.tipus_torn },
      fullCirculations: fullCircs 
    };
  };

  const getSegments = (turn: any) => {
    if (!turn) return [];
    const startMin = getFgcMinutes(turn.inici_torn);
    const endMin = getFgcMinutes(turn.final_torn);
    const segments: any[] = [];
    let currentPos = startMin;
    const circs = turn.fullCirculations || [];
    circs.forEach((circ: any, index: number) => {
      const cStart = getFgcMinutes(circ.sortida);
      const cEnd = getFgcMinutes(circ.arribada);
      if (cStart > currentPos) {
        let loc = index === 0 ? (circ.machinistInici || turn.dependencia || '') : (circs[index - 1].machinistFinal || '');
        segments.push({ start: currentPos, end: cStart, type: 'gap', codi: (loc || '').trim().toUpperCase() || 'DESCANS' });
      }
      segments.push({ start: cStart, end: cEnd, type: 'circ', codi: circ.codi, train: circ.train });
      currentPos = Math.max(currentPos, cEnd);
    });
    if (currentPos < endMin) {
      const lastLoc = circs.length > 0 ? circs[circs.length - 1].machinistFinal : turn.dependencia;
      segments.push({ start: currentPos, end: endMin, type: 'gap', codi: (lastLoc || '').trim().toUpperCase() || 'FINAL' });
    }
    return segments;
  };

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true); setOriginalShift(null); setPassengerResults([]); setAdjacentPassengerResults({anterior: [], posterior: []}); setRestingDriversResults([]); setExtensibleDriversResults([]); setReserveExtensionResults([]);
    try {
      const { data: shifts } = await supabase.from('shifts').select('*').eq('servei', selectedServei);
      const target = shifts?.find(s => (s.circulations as any[]).some(c => (typeof c === 'string' ? c : c.codi).toUpperCase() === query.toUpperCase()));
      if (target) {
        const enriched = await fetchFullTurnData(target.id);
        setOriginalShift(enriched);
        setSelectedCircId(query.toUpperCase());
        setSelectedStation(enriched?.fullCirculations.find((c: any) => c.codi.toUpperCase() === query.toUpperCase())?.inici || '');
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const calculateRelief = async () => {
    if (!selectedCircId || !selectedStation || !originalShift) return;
    setCalculating(true);
    
    // Neteja previa
    setPassengerResults([]); setAdjacentPassengerResults({anterior: [], posterior: []}); setRestingDriversResults([]); setExtensibleDriversResults([]); setReserveExtensionResults([]);

    try {
      const { data: allShifts } = await supabase.from('shifts').select('id, circulations, inici_torn, final_torn, duracio, dependencia').eq('servei', selectedServei);
      if (!allShifts) return;

      const { data: targetCircDetail } = await supabase.from('circulations').select('*').eq('id', selectedCircId).single();
      if (!targetCircDetail) return;

      const reliefTimeStr = targetCircDetail.inici === selectedStation ? targetCircDetail.sortida : (targetCircDetail.estacions?.find((s: any) => s.nom === selectedStation)?.hora || targetCircDetail.arribada);
      const reliefMin = getFgcMinutes(reliefTimeStr);
      const sortidaMin = getFgcMinutes(targetCircDetail.sortida);
      const arribadaMin = getFgcMinutes(targetCircDetail.arribada);

      // 1. Viatgers Directes i Adjacents
      const passengerIds: string[] = [];
      const anteriorShifts: string[] = [];
      const posteriorShifts: string[] = [];

      const { data: sameLineCircs } = await supabase.from('circulations').select('id, sortida').eq('linia', targetCircDetail.linia).eq('final', targetCircDetail.final);
      const sorted = sameLineCircs?.sort((a, b) => getFgcMinutes(a.sortida) - getFgcMinutes(b.sortida)) || [];
      const currIdx = sorted.findIndex(c => c.id === targetCircDetail.id);
      const antId = currIdx > 0 ? sorted[currIdx - 1].id : null;
      const postId = currIdx < sorted.length - 1 ? sorted[currIdx + 1].id : null;

      allShifts.forEach(s => {
        (s.circulations as any[]).forEach(c => {
          if (c.codi === 'Viatger' && c.observacions) {
            const obsCode = c.observacions.split('-')[0].toUpperCase();
            if (obsCode === selectedCircId) passengerIds.push(s.id);
            if (antId && obsCode === antId) anteriorShifts.push(s.id);
            if (postId && obsCode === postId) posteriorShifts.push(s.id);
          }
        });
      });

      const [resPass, resAnt, resPost] = await Promise.all([
        Promise.all(passengerIds.map(id => fetchFullTurnData(id))),
        Promise.all(anteriorShifts.map(id => fetchFullTurnData(id))),
        Promise.all(posteriorShifts.map(id => fetchFullTurnData(id)))
      ]);

      setPassengerResults(resPass.filter(Boolean));
      setAdjacentPassengerResults({
        anterior: resAnt.filter(Boolean).map(t => ({ ...t, adjacentCode: antId })),
        posterior: resPost.filter(Boolean).map(t => ({ ...t, adjacentCode: postId }))
      });

      // 2. Personal en Descans, Extensibles i Reserves
      const resting: any[] = [];
      const extensible: any[] = [];
      const reserves: any[] = [];

      const enrichedAll = await Promise.all(allShifts.map(s => fetchFullTurnData(s.id)));
      
      enrichedAll.forEach(tData => {
        if (!tData || tData.id === originalShift.id) return;
        const segs = getSegments(tData);
        const [h, m] = (tData.duracio || "00:00").split(':').map(Number);
        const originalDur = h * 60 + m;

        // Descans a l'estació de relleu
        const restAtRelief = segs.find(seg => seg.type === 'gap' && seg.codi.toUpperCase().includes(selectedStation.toUpperCase()) && seg.start <= reliefMin && seg.end > reliefMin);
        if (restAtRelief) resting.push({ ...tData, restSegment: restAtRelief });

        // Extensibles
        if (originalDur < 525) {
          const isAvailableAtRelief = segs.find(seg => seg.type === 'gap' && seg.codi.toUpperCase().includes(selectedStation.toUpperCase()) && seg.start <= reliefMin && seg.end > reliefMin);
          if (isAvailableAtRelief) {
            const hasConflicts = segs.some(seg => seg.type === 'circ' && seg.start >= reliefMin && seg.start < (arribadaMin + 20));
            if (!hasConflicts) {
              const extra = Math.max(0, (arribadaMin + 20) - getFgcMinutes(tData.final_torn));
              if (originalDur + extra <= 525) extensible.push({ ...tData, extData: { extraNeeded: extra, estimatedReturn: (arribadaMin + 20) } });
            }
          }
        }

        // Reserves (SR, RB, PC...)
        const reservePoint = RESERVAS_CONFIG.find(r => selectedStation.toUpperCase().includes(r.loc) && (reliefMin >= getFgcMinutes(r.start) || reliefMin < getFgcMinutes(r.end)));
        if (reservePoint && tData.id.includes(reservePoint.id)) {
            reserves.push({ ...tData, resData: { reservaId: reservePoint.id, loc: reservePoint.loc, interceptTime: reliefTimeStr } });
        }
      });

      setRestingDriversResults(resting);
      setExtensibleDriversResults(extensible);
      setReserveExtensionResults(reserves);

    } catch (e) { console.error(e); } finally { setCalculating(false); }
  };

  const resetAllModeData = () => {
    setMode('INIT'); setQuery(''); setOriginalShift(null); setSelectedCircId(''); setSelectedStation(''); setPassengerResults([]); setAdjacentPassengerResults({anterior: [], posterior: []}); setRestingDriversResults([]); setExtensibleDriversResults([]); setReserveExtensionResults([]);
  };

  const CompactViatgerRow: React.FC<{ torn: any, colorClass: string, label?: React.ReactNode, subLabel?: string }> = ({ torn, colorClass, label, subLabel }) => (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all flex items-center gap-4 border-l-4 ${colorClass}`}>
      <div className="h-10 min-w-[2.5rem] px-2 bg-fgc-grey/10 dark:bg-black text-fgc-grey dark:text-gray-300 rounded-xl flex items-center justify-center font-black text-xs shadow-sm shrink-0">{torn.id}</div>
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2"><p className="text-sm font-black text-fgc-grey dark:text-gray-200 truncate">{torn.driver?.cognoms}, {torn.driver?.nom}</p>{label}</div>
          <p className="text-[8px] font-black text-gray-300 dark:text-gray-600 uppercase tracking-widest truncate">Nom. {torn.driver?.nomina} {subLabel ? `• ${subLabel}` : ''}</p>
        </div>
        <div className="flex items-center gap-3 text-fgc-grey dark:text-gray-300 shrink-0">
          <div className="text-[10px] font-bold text-gray-400 dark:text-gray-600 whitespace-nowrap">{torn.inici_torn} - {torn.final_torn}</div>
        </div>
      </div>
      <div className="flex gap-1 shrink-0">{torn.driver?.phones?.map((p: string, i: number) => (<a key={i} href={`tel:${p}`} className="w-8 h-8 bg-fgc-grey dark:bg-black text-white rounded-lg flex items-center justify-center hover:bg-fgc-green hover:text-fgc-grey transition-all shadow-sm"><Phone size={12} /></a>))}</div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-red-500 rounded-2xl text-white shadow-lg shadow-red-500/20"><ShieldAlert size={28} /></div>
          <div><h1 className="text-3xl font-black text-fgc-grey dark:text-white tracking-tight uppercase">Gestió d'Incidències</h1><p className="text-gray-500 dark:text-gray-400 font-medium">Cerca cobertures ràpides i gestiona talls de servei.</p></div>
        </div>
        {mode !== 'INIT' && (
          <div className="flex flex-col gap-2"><span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">Filtre de Servei</span><div className="inline-flex bg-white dark:bg-gray-900 p-1 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">{['Tots', ...serveiTypes].map(s => (<button key={s} onClick={() => setSelectedServei(s)} className={`px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-black transition-all ${selectedServei === s ? 'bg-fgc-grey dark:bg-fgc-green dark:text-fgc-grey text-white shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'}`}>{s === 'Tots' ? 'Tots' : `S-${s}`}</button>))}</div></div>
        )}
      </header>

      {mode === 'INIT' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-12 max-w-4xl mx-auto">
          <button onClick={() => setMode('MAQUINISTA')} className="group bg-white dark:bg-gray-900 p-10 rounded-[48px] border border-gray-100 dark:border-white/5 shadow-xl hover:shadow-2xl transition-all flex flex-col items-center gap-6"><div className="w-24 h-24 bg-red-50 dark:bg-red-950/20 rounded-full flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform"><User size={48} /></div><div className="text-center"><h3 className="text-2xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Per Maquinista</h3><p className="text-sm font-medium text-gray-400 mt-2">Identifica el tren a partir del número de circulació i el torn titular.</p></div></button>
          <button onClick={() => setMode('LINIA')} className="group bg-white dark:bg-gray-900 p-10 rounded-[48px] border border-gray-100 dark:border-white/5 shadow-xl hover:shadow-2xl transition-all flex flex-col items-center gap-6"><div className="w-24 h-24 bg-fgc-green/10 rounded-full flex items-center justify-center text-fgc-green group-hover:scale-110 transition-transform"><MapIcon size={48} /></div><div className="text-center"><h3 className="text-2xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Per Línia / Tram</h3><p className="text-sm font-medium text-gray-400 mt-2">Gestiona talls de servei i identifica personal a cada costat del tall.</p></div></button>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="flex justify-start"><button onClick={resetAllModeData} className="text-[10px] font-black text-fgc-green hover:underline uppercase tracking-[0.2em] flex items-center gap-2">← Tornar al selector</button></div>
          
          {mode === 'MAQUINISTA' ? (
             <div className="bg-white dark:bg-gray-900 rounded-[32px] p-8 shadow-sm border border-gray-100 dark:border-white/5 transition-colors">
               <div className="max-w-2xl mx-auto space-y-6 text-center">
                 <h3 className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Identifica el Tren</h3>
                 <div className="relative">
                   <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={24} />
                   <input type="text" placeholder="Ex: 1104, 2351..." value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[28px] py-6 pl-16 pr-8 focus:ring-4 focus:ring-red-500/20 outline-none text-xl font-bold transition-all dark:text-white shadow-inner" />
                   <button onClick={handleSearch} disabled={loading || !query} className="absolute right-3 top-1/2 -translate-y-1/2 bg-fgc-grey dark:bg-fgc-green text-white dark:text-fgc-grey px-8 py-3 rounded-2xl font-black text-sm hover:scale-105 transition-all shadow-lg disabled:opacity-50">{loading ? <Loader2 className="animate-spin" size={20} /> : 'BUSCAR'}</button>
                 </div>
               </div>
             </div>
          ) : (
             <div className="max-w-7xl mx-auto"><InteractiveMap /></div>
          )}

          {mode === 'MAQUINISTA' && originalShift && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-6">
                <div className="bg-white dark:bg-gray-900 rounded-[32px] p-8 shadow-sm border border-gray-100 dark:border-white/5 space-y-8">
                  <div className="flex items-center gap-3 border-b border-gray-100 dark:border-white/5 pb-6">
                    <div className="h-12 min-w-[3.5rem] bg-red-600 text-white rounded-xl flex items-center justify-center font-black text-xl shadow-lg">{originalShift.id}</div>
                    <div><h3 className="text-xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Detalls del Torn</h3><p className="text-xs font-bold text-gray-400">{originalShift.driver?.cognoms}, {originalShift.driver?.nom}</p></div>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-3">Punt de Relleu (Circulació)</label>
                      <div className="grid grid-cols-1 gap-2">
                        {originalShift.fullCirculations.map((c: any) => (
                          <button key={c.codi} onClick={() => { setSelectedCircId(c.codi); setSelectedStation(c.inici); }} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${selectedCircId === c.codi ? 'bg-red-50 dark:bg-red-950/20 border-red-500 shadow-md ring-1 ring-red-500' : 'bg-gray-50 dark:bg-black/20 border-gray-100 dark:border-white/5 hover:border-red-200'}`}>
                            <div className="flex items-center gap-4"><span className="font-black text-lg text-fgc-grey dark:text-white">{c.codi}</span><div className="flex items-center gap-2 text-gray-400"><Clock size={14} /><span className="text-xs font-bold">{c.sortida} — {c.arribada}</span></div></div>{selectedCircId === c.codi && <UserCheck size={20} className="text-red-500" />}
                          </button>
                        ))}
                      </div>
                    </div>
                    {selectedCircId && (
                      <div className="animate-in fade-in slide-in-from-top-2">
                        <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-3">Estació de Relleu</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(() => {
                            const tc = originalShift.fullCirculations.find((c: any) => c.codi === selectedCircId);
                            if (!tc) return null;
                            const stations = [tc.inici, ...(tc.estacions?.map((s: any) => s.nom) || []), tc.final];
                            return stations.map((st: string, idx: number) => (
                              <button key={`${st}-${idx}`} onClick={() => setSelectedStation(st)} className={`p-3 rounded-xl border text-[10px] font-black uppercase transition-all ${selectedStation === st ? 'bg-fgc-green text-fgc-grey border-fgc-green shadow-md' : 'bg-white dark:bg-gray-800 text-gray-400 border-gray-100 dark:border-white/5 hover:border-fgc-green'}`}>{st}</button>
                            ));
                          })()}
                        </div>
                      </div>
                    )}
                    <button onClick={calculateRelief} disabled={calculating || !selectedStation} className="w-full bg-fgc-grey dark:bg-white text-white dark:text-fgc-grey py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">{calculating ? <Loader2 size={24} className="animate-spin" /> : <Zap size={24} />}CALCULAR COBERTURA</button>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white dark:bg-gray-900 rounded-[32px] p-8 shadow-sm border border-gray-100 dark:border-white/5 min-h-[600px] space-y-8">
                  <div className="flex items-center justify-between mb-2 border-b border-gray-100 dark:border-white/5 pb-6">
                    <div className="flex items-center gap-3"><Users size={20} className="text-fgc-green" /><h3 className="text-xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Candidats Disponibles</h3></div>
                  </div>

                  {calculating ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-4 opacity-30"><Loader2 size={48} className="animate-spin text-fgc-green" /><p className="text-xs font-black uppercase tracking-widest">Analitzant la malla ferroviària...</p></div>
                  ) : (passengerResults.length > 0 || restingDriversResults.length > 0 || extensibleDriversResults.length > 0 || reserveExtensionResults.length > 0) ? (
                    <div className="space-y-10">
                      {/* Viatgers */}
                      {passengerResults.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 px-2"><Users className="text-blue-500" size={16} /><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Viatgers al tren</h3></div>
                          <div className="flex flex-col gap-2">{passengerResults.map((t, i) => <CompactViatgerRow key={i} torn={t} colorClass="border-l-blue-500" />)}</div>
                        </div>
                      )}
                      
                      {/* Reserves (Interceptables) */}
                      {reserveExtensionResults.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 px-2"><Repeat className="text-indigo-500" size={16} /><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Reserves Disponibles</h3></div>
                          <div className="flex flex-col gap-2">{reserveExtensionResults.map((t, i) => <CompactViatgerRow key={i} torn={t} colorClass="border-l-indigo-500" label={<span className="flex items-center gap-1 text-[8px] text-indigo-500 font-black uppercase tracking-widest"><Repeat size={10} /> Intercepció {t.resData.reservaId}</span>} subLabel={`Disponible a ${t.resData.loc}`} />)}</div>
                        </div>
                      )}

                      {/* Descansos a l'estació */}
                      {restingDriversResults.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 px-2"><Coffee className="text-fgc-green" size={16} /><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">En descans a {selectedStation}</h3></div>
                          <div className="flex flex-col gap-2">{restingDriversResults.map((t, i) => <CompactViatgerRow key={i} torn={t} colorClass="border-l-fgc-green" subLabel={`Descans fins les ${formatFgcTime(t.restSegment.end)}`} />)}</div>
                        </div>
                      )}

                      {/* Extensibles */}
                      {extensibleDriversResults.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 px-2"><Timer className="text-orange-500" size={16} /><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Punt de relleu perllongable</h3></div>
                          <div className="flex flex-col gap-2">{extensibleDriversResults.map((t, i) => <CompactViatgerRow key={i} torn={t} colorClass="border-l-orange-500" subLabel={`Acabaria a les ${formatFgcTime(t.extData.estimatedReturn)}`} />)}</div>
                        </div>
                      )}
                    </div>
                  ) : selectedStation ? (
                    <div className="py-20 text-center space-y-4 opacity-40"><Info size={40} className="mx-auto text-gray-300" /><p className="text-sm font-bold text-gray-500 max-w-[280px] mx-auto">Cap personal detectat en disposició de cobrir el relleu a {selectedStation}.</p></div>
                  ) : (
                    <div className="py-20 text-center space-y-4 opacity-40"><User size={40} className="mx-auto text-gray-200" /><p className="text-sm font-bold text-gray-400 uppercase tracking-widest italic">Selecciona un relleu per analitzar cobertures</p></div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {mode === 'INIT' && !loading && (<div className="py-32 text-center opacity-10 flex flex-col items-center"><ShieldAlert size={100} className="text-fgc-grey mb-8" /><p className="text-xl font-black uppercase tracking-[0.4em] text-fgc-grey">Centre de Gestió Operativa</p></div>)}
    </div>
  );
};

// SVG Animats i auxiliars
const InteractiveMap = () => { /* Esquema replicat de la versió anterior */ return null; }; 

export default IncidenciaView;
