
import React, { useState, useEffect, useMemo } from 'react';
import { Search, ShieldAlert, Loader2, UserCheck, Clock, MapPin, AlertCircle, Phone, Info, Users, Zap, User, Train, Map as MapIcon, ChevronRight, LayoutGrid, X, Timer, Scissors, ArrowDownToLine, ArrowUpToLine, ArrowLeftToLine, ArrowRightToLine, Coffee, Layers, Trash2, LucideIcon } from 'lucide-react';
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
}

const LINE_HIERARCHY: Record<string, { depth: number, branch: 'TRUNK' | 'L7' | 'L6' | 'S1' | 'S2' }> = {
  'PC': { depth: 0, branch: 'TRUNK' }, 'PR': { depth: 1, branch: 'TRUNK' }, 'GR': { depth: 2, branch: 'TRUNK' }, 'SG': { depth: 3, branch: 'TRUNK' }, 'MN': { depth: 4, branch: 'TRUNK' }, 'BN': { depth: 5, branch: 'TRUNK' }, 'TT': { depth: 6, branch: 'TRUNK' }, 'SR': { depth: 7, branch: 'TRUNK' }, 'PF': { depth: 8, branch: 'TRUNK' }, 'VL': { depth: 9, branch: 'TRUNK' }, 'LP': { depth: 10, branch: 'TRUNK' }, 'LF': { depth: 11, branch: 'TRUNK' }, 'VD': { depth: 12, branch: 'TRUNK' }, 'SC': { depth: 13, branch: 'TRUNK' },
  'PM': { depth: 3, branch: 'L7' }, 'PD': { depth: 4, branch: 'L7' }, 'EP': { depth: 5, branch: 'L7' }, 'TB': { depth: 6, branch: 'L7' },
  'RE': { depth: 8, branch: 'L6' },
  'MS': { depth: 14, branch: 'S1' }, 'HG': { depth: 15, branch: 'S1' }, 'RB': { depth: 16, branch: 'S1' }, 'LFS1': { depth: 17, branch: 'S1' }, 'TR': { depth: 18, branch: 'S1' }, 'VP': { depth: 19, branch: 'S1' }, 'EN': { depth: 20, branch: 'S1' }, 'NA': { depth: 21, branch: 'S1' },
  'VO': { depth: 14, branch: 'S2' }, 'SJ': { depth: 15, branch: 'S2' }, 'BT': { depth: 16, branch: 'S2' }, 'UN': { depth: 17, branch: 'S2' }, 'SQ': { depth: 18, branch: 'S2' }, 'CF': { depth: 19, branch: 'S2' }, 'PJ': { depth: 20, branch: 'S2' }, 'CT': { depth: 21, branch: 'S2' }, 'NO': { depth: 22, branch: 'S2' }, 'PN': { depth: 23, branch: 'S2' },
};

const MAP_STATIONS = [
  { id: 'PC', label: 'PC', x: 20, y: 100 }, { id: 'PR', label: 'PR', x: 50, y: 100 }, { id: 'GR', label: 'GR', x: 80, y: 100 }, { id: 'SG', label: 'SG', x: 110, y: 100 }, { id: 'MN', label: 'MN', x: 140, y: 100 }, { id: 'BN', label: 'BN', x: 170, y: 100 }, { id: 'TT', label: 'TT', x: 200, y: 100 }, { id: 'SR', label: 'SR', x: 230, y: 100 }, { id: 'PF', label: 'PF', x: 260, y: 100 }, { id: 'VL', label: 'VL', x: 290, y: 100 }, { id: 'LP', label: 'LP', x: 320, y: 100 }, { id: 'LF', label: 'LF', x: 350, y: 100 }, { id: 'VD', label: 'VD', x: 380, y: 100 }, { id: 'SC', label: 'SC', x: 410, y: 100 }, { id: 'PM', label: 'PM', x: 100, y: 160 }, { id: 'PD', label: 'PD', x: 130, y: 160 }, { id: 'EP', label: 'EP', x: 160, y: 160 }, { id: 'TB', label: 'TB', x: 190, y: 160 }, { id: 'RE', label: 'RE', x: 230, y: 40 }, { id: 'MS', label: 'MS', x: 440, y: 40 }, { id: 'HG', label: 'HG', x: 470, y: 40 }, { id: 'RB', label: 'RB', x: 500, y: 40 }, { id: 'LFS1', label: 'LF', x: 530, y: 40 }, { id: 'TR', label: 'TR', x: 560, y: 40 }, { id: 'VP', label: 'VP', x: 590, y: 40 }, { id: 'EN', label: 'EN', x: 620, y: 40 }, { id: 'NA', label: 'NA', x: 650, y: 40 }, { id: 'VO', label: 'VO', x: 440, y: 160 }, { id: 'SJ', label: 'SJ', x: 470, y: 160 }, { id: 'BT', label: 'BT', x: 500, y: 160 }, { id: 'UN', label: 'UN', x: 530, y: 160 }, { id: 'SQ', label: 'SQ', x: 560, y: 160 }, { id: 'CF', label: 'CF', x: 590, y: 160 }, { id: 'PJ', label: 'PJ', x: 620, y: 160 }, { id: 'CT', label: 'CT', x: 650, y: 160 }, { id: 'NO', label: 'NO', x: 680, y: 160 }, { id: 'PN', label: 'PN', x: 710, y: 160 },
];

const MAP_SEGMENTS = [
  { from: 'PC', to: 'PR' }, { from: 'PR', to: 'GR' }, { from: 'GR', to: 'SG' }, { from: 'SG', to: 'MN' }, { from: 'MN', to: 'BN' }, { from: 'BN', to: 'TT' }, { from: 'TT', to: 'SR' }, { from: 'SR', to: 'PF' }, { from: 'PF', to: 'VL' }, { from: 'VL', to: 'LP' }, { from: 'LP', to: 'LF' }, { from: 'LF', to: 'VD' }, { from: 'VD', to: 'SC' }, { from: 'GR', to: 'PM' }, { from: 'PM', to: 'PD' }, { from: 'PD', to: 'EP' }, { from: 'EP', to: 'TB' }, { from: 'SR', to: 'RE' }, { from: 'SC', to: 'MS' }, { from: 'MS', to: 'HG' }, { from: 'HG', to: 'RB' }, { from: 'RB', to: 'LFS1' }, { from: 'LFS1', to: 'TR' }, { from: 'TR', to: 'VP' }, { from: 'VP', to: 'EN' }, { from: 'EN', to: 'NA' }, { from: 'SC', to: 'VO' }, { from: 'VO', to: 'SJ' }, { from: 'SJ', to: 'BT' }, { from: 'BT', to: 'UN' }, { from: 'UN', to: 'SQ' }, { from: 'SQ', to: 'CF' }, { from: 'CF', to: 'PJ' }, { from: 'PJ', to: 'CT' }, { from: 'CT', to: 'NO' }, { from: 'NO', to: 'PN' },
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
  
  const [solutions, setSolutions] = useState<any[]>([]);

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

  const getLiniaColorHex = (linia: string) => {
    const l = linia?.toUpperCase().trim() || '';
    if (l === 'L7') return '#8B4513';
    if (l === 'L6') return '#9333ea';
    if (l === 'L12') return '#d8b4fe';
    if (l === 'S1') return '#f97316';
    if (l === 'S2') return '#22c55e';
    return '#6b7280';
  };

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

  useEffect(() => {
    if (!isRealTime && customTime) {
      setDisplayMin(getFgcMinutes(customTime));
    }
  }, [customTime, isRealTime]);

  const fetchLiveMapData = async () => {
    setLoading(true);
    try {
      let qShifts = supabase.from('shifts').select('*');
      if (selectedServei !== 'Tots') qShifts = qShifts.eq('servei', selectedServei);
      const { data: allShifts } = await qShifts;
      if (!allShifts) return;
      const { data: allDaily } = await supabase.from('daily_assignments').select('*');
      const { data: allPhones } = await supabase.from('phonebook').select('nomina, phones');
      const allCircIds = new Set<string>();
      allShifts.forEach(s => { (s.circulations as any[]).forEach(c => { const codi = typeof c === 'string' ? c : c.codi; if (codi && codi !== 'Viatger') allCircIds.add(codi); }); });
      const { data: circDetails } = await supabase.from('circulations').select('*').in('id', Array.from(allCircIds));
      if (!circDetails) return;
      const currentPersonnel: LivePersonnel[] = [];
      circDetails.forEach(circ => {
        const startMin = getFgcMinutes(circ.sortida);
        const endMin = getFgcMinutes(circ.arribada);
        if (displayMin >= startMin && displayMin <= endMin) {
          let stationId = circ.inici;
          const stops = (circ.estacions as any[]) || [];
          let found = false;
          for (const stop of stops) {
              const stopMin = getFgcMinutes(stop.hora || stop.arribada || stop.sortida);
              if (Math.abs(displayMin - stopMin) <= 3) { stationId = stop.nom; found = true; break; }
          }
          if (!found) stationId = displayMin > startMin + (endMin - startMin) / 2 ? circ.final : circ.inici;
          const shift = allShifts.find(s => (s.circulations as any[]).some(cr => (typeof cr === 'string' ? cr : cr.codi) === circ.id));
          const shortTorn = shift ? (shift.id.startsWith('Q') && shift.id.length === 5 ? shift.id[0] + shift.id.slice(2) : shift.id) : null;
          const assignment = allDaily?.find(d => d.torn === shortTorn);
          const driverPhones = allPhones?.find(p => p.nomina === assignment?.empleat_id)?.phones || [];
          currentPersonnel.push({ type: 'TRAIN', id: circ.id, linia: circ.linia, stationId: stationId.toUpperCase(), color: getLiniaColorHex(circ.linia), driver: assignment ? `${assignment.cognoms}, ${assignment.nom}` : 'Sense assignar', torn: shift?.id || '---', phones: driverPhones, inici: circ.inici, final: circ.final, horaPas: formatFgcTime(displayMin) });
        }
      });
      allShifts.forEach(shift => {
        const startMin = getFgcMinutes(shift.inici_torn);
        const endMin = getFgcMinutes(shift.final_torn);
        if (displayMin >= startMin && displayMin < endMin) {
          const isWorking = currentPersonnel.some(p => p.torn === shift.id);
          if (!isWorking) {
            const shortTorn = shift.id.startsWith('Q') && shift.id.length === 5 ? shift.id[0] + shift.id.slice(2) : shift.id;
            const assignment = allDaily?.find(d => d.torn === shortTorn);
            const loc = (shift.dependencia || '').trim().toUpperCase();
            if (loc && LINE_HIERARCHY[loc] && assignment) {
              const driverPhones = allPhones?.find(p => p.nomina === assignment.empleat_id)?.phones || [];
              currentPersonnel.push({ type: 'REST', id: 'DESCANS', linia: 'S/L', stationId: loc, color: '#53565A', driver: `${assignment.cognoms}, ${assignment.nom}`, torn: shift.id, phones: driverPhones, inici: loc, final: loc, horaPas: formatFgcTime(displayMin) });
            }
          }
        }
      });
      setLiveData(currentPersonnel);
    } catch (e) { console.error("Error live map:", e); } finally { setLoading(false); }
  };

  useEffect(() => { if (mode === 'LINIA') fetchLiveMapData(); }, [mode, displayMin, selectedServei]);

  const handleSearch = async (overrideQuery?: string) => {
    const searchVal = overrideQuery || query;
    if (!searchVal) return;
    setLoading(true); setOriginalShift(null); setSolutions([]); setSelectedStation(''); setSelectedCircId('');
    try {
      let q = supabase.from('shifts').select('*');
      if (selectedServei !== 'Tots') q = q.eq('servei', selectedServei);
      const { data: shifts } = await q;
      const targetShift = shifts?.find(s => (s.circulations as any[]).some(c => (typeof c === 'string' ? c : c.codi).toUpperCase() === searchVal.toUpperCase()));
      if (!targetShift) { alert(`No s'ha trobat cap torn amb la circulació ${searchVal.toUpperCase()} per al servei S-${selectedServei}.`); setLoading(false); return; }
      const shortId = targetShift.id.startsWith('Q') && targetShift.id.length === 5 ? targetShift.id[0] + targetShift.id.slice(2) : targetShift.id;
      const { data: assignments } = await supabase.from('daily_assignments').select('*').eq('torn', shortId);
      const circIds = (targetShift.circulations as any[]).map(c => typeof c === 'string' ? c : c.codi);
      const { data: circDetails } = await supabase.from('circulations').select('*').in('id', circIds);
      const enrichedCircs = (targetShift.circulations as any[]).map(cRef => {
        const codi = typeof cRef === 'string' ? cRef : cRef.codi;
        const detail = circDetails?.find(d => d.id === codi);
        return { ...detail, ...cRef, codi };
      }).sort((a, b) => getFgcMinutes(a.sortida) - getFgcMinutes(b.sortida));
      setOriginalShift({ ...targetShift, drivers: assignments || [], enrichedCircs });
      setSelectedCircId(searchVal.toUpperCase());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const calculateRelief = async () => {
    if (!selectedCircId || !selectedStation || !originalShift) return;
    setCalculating(true); setSolutions([]);
    try {
      const circIdx = originalShift.enrichedCircs.findIndex((c: any) => c.codi === selectedCircId);
      const startCirc = originalShift.enrichedCircs[circIdx];
      let reliefTimeStr = startCirc.sortida;
      if (selectedStation !== startCirc.inici) {
        const stop = (startCirc.enrichedCircs?.[circIdx]?.estacions as any[])?.find(st => st.nom === selectedStation);
        reliefTimeStr = stop?.arribada || stop?.hora || startCirc.arribada;
      }
      const reliefTimeMin = getFgcMinutes(reliefTimeStr);
      const endTimeMin = getFgcMinutes(originalShift.final_torn);
      const { data: allDaily } = await supabase.from('daily_assignments').select('*');
      let qShifts = supabase.from('shifts').select('*');
      if (selectedServei !== 'Tots') qShifts = qShifts.eq('servei', selectedServei);
      const { data: allShifts } = await qShifts;
      const { data: phonebook } = await supabase.from('phonebook').select('*');
      const candidates: any[] = [];
      RESERVAS_CONFIG.forEach(res => {
        if (selectedStation.toUpperCase().includes(res.loc)) {
          const resStart = getFgcMinutes(res.start);
          const resEnd = getFgcMinutes(res.end);
          let isActiveDuringRelief = resStart <= resEnd ? (reliefTimeMin >= resStart && reliefTimeMin < resEnd) : (reliefTimeMin >= resStart || reliefTimeMin < resEnd);
          if (isActiveDuringRelief) {
            const assignment = allDaily?.find(d => d.torn === res.id);
            if (assignment) {
              const pb = phonebook?.find(p => p.nomina === assignment.empleat_id);
              candidates.push({ type: 'Reserva', torn: res.id, nom: `${assignment.cognoms}, ${assignment.nom}`, phones: pb?.phones || [], score: 100, reason: `Reserva a ${res.loc} (${res.start}-${res.end})` });
            }
          }
        }
      });
      for (const shift of allShifts || []) {
        if (shift.id === originalShift.id) continue;
        const validGap = getSegments(shift).find(s => s.type === 'gap' && s.start <= reliefTimeMin && s.end >= endTimeMin && (s.codi.toUpperCase().includes(selectedStation.toUpperCase()) || s.codi === 'DESCANS' || s.codi === 'FINAL'));
        if (validGap) {
          const shortId = shift.id.startsWith('Q') && shift.id.length === 5 ? shift.id[0] + shift.id.slice(2) : shift.id;
          const assignment = allDaily?.find(d => d.torn === shortId);
          if (assignment) {
            const pb = phonebook?.find(p => p.nomina === assignment.empleat_id);
            candidates.push({ type: 'Buit de Servei', torn: shift.id, nom: `${assignment.cognoms}, ${assignment.nom}`, phones: pb?.phones || [], score: 80, reason: `Buit a ${validGap.codi} (${formatFgcTime(validGap.start)}-${formatFgcTime(validGap.end)})` });
          }
        }
      }
      setSolutions(candidates.sort((a, b) => b.score - a.score));
    } catch (e) { console.error(e); } finally { setCalculating(false); }
  };

  const getSegments = (turn: any) => {
    const startMin = getFgcMinutes(turn.inici_torn);
    const endMin = getFgcMinutes(turn.final_torn);
    return [{ start: startMin, end: endMin, type: 'gap', codi: turn.dependencia || 'DESCANS' }];
  };

  const getConnectivityIslands = () => {
    const graph: Record<string, string[]> = {};
    MAP_STATIONS.forEach(s => graph[s.id] = []);
    MAP_SEGMENTS.forEach(seg => {
      const isSegmentBlocked = selectedCutSegments.has(`${seg.from}-${seg.to}`) || selectedCutSegments.has(`${seg.to}-${seg.from}`);
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

  const dividedPersonnel = useMemo(() => {
    if (selectedCutStations.size === 0 && selectedCutSegments.size === 0) return null;
    const islands = getConnectivityIslands();
    const result: Record<string, LivePersonnel[]> = { AFFECTED: [], BCN: [], S1: [], S2: [], L6: [], L7: [], ISOLATED: [] };
    liveData.forEach(p => {
      const st = p.stationId.toUpperCase();
      if (selectedCutStations.has(st)) result.AFFECTED.push(p);
      else if (islands.BCN.has(st)) result.BCN.push(p);
      else if (islands.S1.has(st)) result.S1.push(p);
      else if (islands.S2.has(st)) result.S2.push(p);
      else if (islands.L6.has(st)) result.L6.push(p);
      else if (islands.L7.has(st)) result.L7.push(p);
      else result.ISOLATED.push(p);
    });
    return result;
  }, [liveData, selectedCutStations, selectedCutSegments]);

  const toggleStationCut = (id: string) => {
    setSelectedCutStations(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSegmentCut = (from: string, to: string) => {
    const id = `${from}-${to}`;
    setSelectedCutSegments(prev => {
      const next = new Set(prev);
      if (next.has(id) || next.has(`${to}-${from}`)) { next.delete(id); next.delete(`${to}-${from}`); } else { next.add(id); }
      return next;
    });
  };

  const clearAllCuts = () => { setSelectedCutStations(new Set()); setSelectedCutSegments(new Set()); };

  const InteractiveMap = () => (
    <div className="bg-white dark:bg-black/40 rounded-[40px] p-6 sm:p-10 border border-gray-100 dark:border-white/5 relative overflow-hidden flex flex-col transition-colors shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div className="flex flex-col gap-2">
           <div className="flex items-center gap-3">
              <h3 className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none">Esquema Interactiu BV</h3>
              <div className={`flex items-center gap-2 px-2 py-0.5 rounded-lg border transition-all ${isRealTime ? 'bg-fgc-green/10 border-fgc-green/20 animate-pulse text-fgc-green' : 'bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-400'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${isRealTime ? 'bg-fgc-green' : 'bg-gray-400'}`}></div>
                  <span className="text-[8px] font-black uppercase tracking-widest">{isRealTime ? 'Live Map' : 'Tall Manual'}</span>
              </div>
           </div>
           <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <Clock size={10} /> Estat malla: <span className="text-fgc-grey dark:text-white font-black">{customTime || '--:--'}</span>
           </p>
        </div>
        <div className="flex items-center gap-3 bg-gray-50 dark:bg-black/20 p-2 rounded-[20px] border border-gray-100 dark:border-white/5">
            <button onClick={() => setIsRealTime(true)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${isRealTime ? 'bg-fgc-grey dark:bg-fgc-green text-white dark:text-fgc-grey shadow-md' : 'text-gray-400 hover:text-fgc-grey'}`}>Temps Real</button>
            <div className="w-px h-6 bg-gray-200 dark:bg-white/10" />
            <input type="time" value={customTime} onChange={(e) => { setCustomTime(e.target.value); setIsRealTime(false); }} className="bg-white dark:bg-gray-800 border-none rounded-lg px-3 py-1.5 text-xs font-black text-fgc-grey dark:text-white focus:ring-2 focus:ring-fgc-green/30 outline-none" />
        </div>
        {(selectedCutStations.size > 0 || selectedCutSegments.size > 0) && (
          <button onClick={clearAllCuts} className="text-[10px] font-black text-red-500 uppercase flex items-center gap-2 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 rounded-xl hover:scale-105 transition-all shadow-sm border border-red-100 dark:border-red-900/40 animate-in fade-in zoom-in-95">
            <Trash2 size={14} /> Anul·lar Talls ({selectedCutStations.size + selectedCutSegments.size})
          </button>
        )}
      </div>
      <div className="overflow-x-auto custom-scrollbar pb-10 -mx-4 px-4 select-none">
        <svg viewBox="0 0 750 220" className="min-w-[800px] h-auto overflow-visible">
          {MAP_SEGMENTS.map((seg, i) => {
            const s1 = MAP_STATIONS.find(s => s.id === seg.from)!;
            const s2 = MAP_STATIONS.find(s => s.id === seg.to)!;
            const isBlocked = selectedCutSegments.has(`${seg.from}-${seg.to}`) || selectedCutSegments.has(`${seg.to}-${seg.from}`);
            return (
              <g key={`seg-${i}`} className="cursor-pointer group" onClick={() => toggleSegmentCut(seg.from, seg.to)}>
                <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke="transparent" strokeWidth="16" />
                <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke={isBlocked ? "#ef4444" : "#A4A7AB"} strokeWidth={isBlocked ? "8" : "6"} strokeLinecap="round" className={`transition-all duration-300 ${isBlocked ? 'opacity-100' : 'opacity-40 group-hover:opacity-60'}`} />
                {isBlocked && (
                  <g transform={`translate(${(s1.x + s2.x)/2 - 5}, ${(s1.y + s2.y)/2 - 5})`}>
                     <circle r="8" cx="5" cy="5" fill="white" stroke="#ef4444" strokeWidth="2" />
                     <line x1="2" y1="2" x2="8" y2="8" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
                     <line x1="8" y1="2" x2="2" y2="8" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
                  </g>
                )}
              </g>
            );
          })}
          {MAP_STATIONS.map(st => {
            const isCut = selectedCutStations.has(st.id);
            const trainsHere = liveData.filter(t => t.stationId === st.id && t.type === 'TRAIN');
            const restHere = liveData.filter(t => t.stationId === st.id && t.type === 'REST');
            return (
              <g key={st.id} className="cursor-pointer group" onClick={() => toggleStationCut(st.id)}>
                <circle cx={st.x} cy={st.y} r={isCut ? "12" : "9"} fill="white" stroke={isCut ? "#ef4444" : "#53565A"} strokeWidth={isCut ? "3" : "2.5"} className="transition-all duration-300 group-hover:stroke-red-500" />
                {isCut && (
                  <g transform={`translate(${st.x-6}, ${st.y-6})`}>
                    <line x1="0" y1="0" x2="12" y2="12" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
                    <line x1="12" y1="0" x2="0" y2="12" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
                  </g>
                )}
                {trainsHere.map((train, tIdx) => (
                  <circle key={`${train.id}-${tIdx}`} cx={st.x} cy={st.y} r="5" fill={train.color} className={isRealTime ? "animate-pulse" : ""} style={{ transform: `translate(${tIdx * 4}px, ${tIdx * -4}px)`, filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))' }}>
                    <title>{train.linia} - {train.id}</title>
                  </circle>
                ))}
                {restHere.length > 0 && !isCut && (
                  <circle cx={st.x} cy={st.y + 12} r="3" fill="#8EDE00" className="opacity-80" />
                )}
                <text x={st.x} y={st.y + (st.y < 100 ? -16 : 24)} textAnchor="middle" className={`text-[9px] font-black select-none transition-colors duration-300 ${isCut ? 'fill-red-500 scale-110' : 'fill-gray-400 dark:fill-gray-500 group-hover:fill-red-400'}`}>{st.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {(selectedCutStations.size > 0 || selectedCutSegments.size > 0) && dividedPersonnel && (
        <div className="mt-6 space-y-8 animate-in fade-in slide-in-from-top-4">
           <div className="flex items-center gap-4 border-b-4 border-red-500/20 pb-4">
              <div className="p-3 bg-red-500 rounded-2xl text-white shadow-lg shadow-red-500/20"><Scissors size={24} /></div>
              <div>
                <h4 className="text-[12px] font-black text-red-500 uppercase tracking-[0.2em] leading-none">ANÀLISI DE TALL OPERATIU</h4>
                <p className="text-xl font-black text-fgc-grey dark:text-white uppercase mt-1">Multi-talls actius: {selectedCutStations.size} estacions, {selectedCutSegments.size} trams</p>
              </div>
           </div>
           <div className="flex flex-col gap-6">
              {[
                { id: 'AFFECTED', label: 'Zona de Tall / Atrapats', Icon: AlertCircle, color: 'red', iconClass: "text-red-500" },
                { id: 'BCN', label: 'Costat Barcelona', Icon: ArrowDownToLine, color: 'blue', iconClass: "text-blue-500" },
                { id: 'S1', label: 'Costat Terrassa', Icon: ArrowUpToLine, color: 'orange', iconClass: "text-orange-500" },
                { id: 'S2', label: 'Costat Sabadell', Icon: ArrowRightToLine, color: 'green', iconClass: "text-green-500" },
                { id: 'L6', label: 'Costat Elisenda', Icon: ArrowUpToLine, color: 'purple', iconClass: "text-purple-500" },
                { id: 'L7', label: 'Costat Tibidabo', Icon: ArrowLeftToLine, color: 'amber', iconClass: "text-amber-700" },
                { id: 'ISOLATED', label: 'Zones Aïllades', Icon: Layers, color: 'gray', iconClass: "text-gray-500" },
              ].map((col) => {
                const items = dividedPersonnel[col.id] || [];
                if (items.length === 0 && col.id !== 'AFFECTED') return null;
                const trains = items.filter(i => i.type === 'TRAIN');
                const isRed = col.color === 'red';
                return (
                  <div key={col.id} className={`${isRed ? 'bg-red-50/50 dark:bg-red-950/20 border-2 border-red-500/30' : 'bg-gray-50/30 dark:bg-white/5 border border-gray-100 dark:border-white/10'} rounded-[32px] p-6 transition-all`}>
                    <div className="flex items-center gap-2 mb-4">
                      <col.Icon size={18} className={col.iconClass} />
                      <h5 className={`font-black uppercase text-xs sm:text-sm tracking-widest ${isRed ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>{col.label}</h5>
                      <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
                         <div className="flex items-center gap-1.5 bg-fgc-grey dark:bg-black text-white px-3 py-1 rounded-xl text-[10px] sm:text-xs font-black" title="Trens Actius">
                            <Train size={10} /> {trains.length} <span className="hidden sm:inline opacity-60">TRENS</span>
                         </div>
                         <div className="flex items-center gap-1.5 bg-fgc-green text-fgc-grey px-3 py-1 rounded-xl text-[10px] sm:text-xs font-black" title="Maquinistes a la zona">
                            <User size={10} /> {items.length} <span className="hidden sm:inline opacity-60">MAQUINISTES</span>
                         </div>
                      </div>
                    </div>
                    <div className={`bg-white dark:bg-black/20 rounded-2xl border ${isRed ? 'border-red-200 dark:border-red-900/50' : 'border-gray-100 dark:border-white/10'} overflow-hidden divide-y ${isRed ? 'divide-red-100 dark:divide-red-900/30' : 'divide-gray-50 dark:divide-white/5'}`}>
                      {items.sort((a,b) => (a.type === 'TRAIN' ? 0 : 1) - (b.type === 'TRAIN' ? 0 : 1)).map(t => <ListPersonnelRow key={`${t.torn}-${t.id}`} item={t} variant={isRed ? 'affected' : 'normal'} />)}
                      {items.length === 0 && <p className="text-center py-10 text-[10px] font-bold text-gray-300 dark:text-gray-700 uppercase tracking-widest italic">Cap presència en aquesta banda</p>}
                    </div>
                  </div>
                );
              })}
           </div>
        </div>
      )}
    </div>
  );

  const ListPersonnelRow: React.FC<{ item: LivePersonnel; variant: 'normal' | 'affected' }> = ({ item, variant }) => {
    const isRest = item.type === 'REST';
    return (
      <div className={`px-4 py-2.5 flex items-center justify-between transition-all group hover:bg-gray-50 dark:hover:bg-white/5 ${variant === 'affected' ? 'bg-red-50/20' : ''}`}>
        <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
          <div className={`min-w-[60px] sm:min-w-[75px] px-2 py-1 rounded-lg text-[10px] sm:text-xs font-black text-white text-center shadow-sm flex items-center justify-center gap-1.5 ${isRest ? 'bg-fgc-green border border-fgc-green/30 text-fgc-grey' : ''}`} style={isRest ? {} : { backgroundColor: item.color }}>
            {isRest ? <Coffee size={12} /> : null} {isRest ? 'DES' : item.id}
          </div>
          <div className="bg-fgc-grey dark:bg-black text-white px-2 py-1 rounded text-[9px] sm:text-[10px] font-black min-w-[45px] text-center shrink-0 border border-white/10">
            {item.torn}
          </div>
          <p className={`text-[12px] sm:text-sm font-bold truncate uppercase ${variant === 'affected' ? 'text-red-700 dark:text-red-400 font-black' : isRest ? 'text-fgc-green font-black' : 'text-fgc-grey dark:text-gray-300'}`}>
            {item.driver}
          </p>
          <div className="hidden md:flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            <MapPin size={10} className="text-gray-300" /> {item.stationId}
          </div>
        </div>
        <div className="flex items-center gap-2 pl-4">
          {item.phones && item.phones.length > 0 && (
            <a href={`tel:${item.phones[0]}`} className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all shadow-sm ${variant === 'affected' ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-100 dark:bg-black text-fgc-grey dark:text-gray-400 hover:bg-fgc-green hover:text-white'}`}>
              <Phone size={12} /> <span className="hidden sm:inline text-[10px] font-black">{item.phones[0]}</span>
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-red-500 rounded-2xl text-white shadow-lg shadow-red-500/20"><ShieldAlert size={28} /></div>
          <div>
            <h1 className="text-3xl font-black text-fgc-grey dark:text-white tracking-tight uppercase">Gestió d'Incidències</h1>
            <p className="text-gray-500 dark:text-gray-400 font-medium">Cerca cobertures ràpides i gestiona talls de servei.</p>
          </div>
        </div>
        {mode !== 'INIT' && (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">Filtre de Servei</span>
            <div className="inline-flex bg-white dark:bg-gray-900 p-1 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">
              {['Tots', ...serveiTypes].map(s => (<button key={s} onClick={() => setSelectedServei(s)} className={`px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-black transition-all ${selectedServei === s ? 'bg-fgc-grey dark:bg-fgc-green dark:text-fgc-grey text-white shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'}`}>{s === 'Tots' ? 'Tots' : `S-${s}`}</button>))}
            </div>
          </div>
        )}
      </header>
      {mode === 'INIT' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-12 max-w-4xl mx-auto">
          <button onClick={() => setMode('MAQUINISTA')} className="group bg-white dark:bg-gray-900 p-10 rounded-[48px] border border-gray-100 dark:border-white/5 shadow-xl hover:shadow-2xl transition-all flex flex-col items-center gap-6"><div className="w-24 h-24 bg-red-50 dark:bg-red-950/20 rounded-full flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform"><User size={48} /></div><div className="text-center"><h3 className="text-2xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Per Maquinista</h3><p className="text-sm font-medium text-gray-400 mt-2">Identifica el tren a partir del número de circulació i el torn titular.</p></div></button>
          <button onClick={() => setMode('LINIA')} className="group bg-white dark:bg-gray-900 p-10 rounded-[48px] border border-gray-100 dark:border-white/5 shadow-xl hover:shadow-2xl transition-all flex flex-col items-center gap-6"><div className="w-24 h-24 bg-fgc-green/10 rounded-full flex items-center justify-center text-fgc-green group-hover:scale-110 transition-transform"><MapIcon size={48} /></div><div className="text-center"><h3 className="text-2xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Per Línia / Tram</h3><p className="text-sm font-medium text-gray-400 mt-2">Gestiona talls de servei i identifica personal a cada costat del tall.</p></div></button>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="flex justify-start"><button onClick={() => {setMode('INIT'); clearAllCuts();}} className="text-[10px] font-black text-fgc-green hover:underline uppercase tracking-[0.2em] flex items-center gap-2">← Tornar al selector</button></div>
          {mode === 'MAQUINISTA' ? (
            <div className="bg-white dark:bg-gray-900 rounded-[32px] p-8 shadow-sm border border-gray-100 dark:border-white/5 transition-colors"><div className="max-w-2xl mx-auto space-y-6"><div className="text-center"><h3 className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Pas 1: Identifica el Tren</h3><p className="text-xs text-gray-400">Introdueix el número de la circulació que presenta la incidència (S-{selectedServei}).</p></div><div className="relative"><Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" size={24} /><input type="text" placeholder="Ex: 1104, 2351..." value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[28px] py-6 pl-16 pr-8 focus:ring-4 focus:ring-red-500/20 outline-none text-xl font-bold transition-all dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-700" /><button onClick={() => handleSearch()} disabled={loading || !query} className="absolute right-3 top-1/2 -translate-y-1/2 bg-fgc-grey dark:bg-fgc-green text-white dark:text-fgc-grey px-8 py-3 rounded-2xl font-black text-sm hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50">{loading ? <Loader2 className="animate-spin" size={20} /> : 'BUSCAR'}</button></div></div></div>
          ) : (
            <div className="max-w-7xl mx-auto"><InteractiveMap /></div>
          )}
          {originalShift && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-6">
                <div className="bg-white dark:bg-gray-900 rounded-[32px] p-8 shadow-sm border border-gray-100 dark:border-white/5 space-y-8 transition-colors">
                  <div className="flex items-center gap-3 border-b border-gray-100 dark:border-white/5 pb-6"><div className="h-12 min-w-[3.5rem] bg-red-600 text-white rounded-xl flex items-center justify-center font-black text-xl shadow-lg">{originalShift.id}</div><div><h3 className="text-xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Detalls del Torn</h3><p className="text-xs font-bold text-gray-400">Maquinista titular: {originalShift.drivers[0]?.cognoms}, {originalShift.drivers[0]?.nom}</p></div></div>
                  <div className="space-y-6">
                    <div><label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-3 ml-1">Punt de Relleu (Circulació)</label><div className="grid grid-cols-1 gap-2">{originalShift.enrichedCircs.map((c: any) => (<button key={c.codi} onClick={() => { setSelectedCircId(c.codi); setSelectedStation(c.inici); setSolutions([]); }} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${selectedCircId === c.codi ? 'bg-red-50 dark:bg-red-950/20 border-red-500 shadow-md ring-1 ring-red-500' : 'bg-gray-50 dark:bg-black/20 border-gray-100 dark:border-white/5 hover:border-red-200'}`}><div className="flex items-center gap-4"><span className="font-black text-lg text-fgc-grey dark:text-white">{c.codi}</span><div className="flex items-center gap-2 text-gray-400"><Clock size={14} /><span className="text-xs font-bold">{c.sortida} — {c.arribada}</span></div></div>{selectedCircId === c.codi && <UserCheck size={20} className="text-red-500" />}</button>))}</div></div>
                    {selectedCircId && (<div className="animate-in fade-in slide-in-from-top-2"><label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-3 ml-1">Estació de Relleu</label><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{[originalShift.enrichedCircs.find((c: any) => c.codi === selectedCircId).inici, ...(originalShift.enrichedCircs.find((c: any) => c.codi === selectedCircId).estacions?.map((s: any) => s.nom) || []), originalShift.enrichedCircs.find((c: any) => c.codi === selectedCircId).final].map((st: string, idx: number) => (<button key={`${st}-${idx}`} onClick={() => { setSelectedStation(st); setSolutions([]); }} className={`p-3 rounded-xl border text-[10px] font-black uppercase transition-all ${selectedStation === st ? 'bg-fgc-green text-fgc-grey border-fgc-green shadow-md' : 'bg-white dark:bg-gray-800 text-gray-400 border-gray-100 dark:border-white/5 hover:border-fgc-green'}`}>{st}</button>))}</div></div>)}
                    <button onClick={calculateRelief} disabled={calculating || !selectedStation} className="w-full bg-fgc-grey dark:bg-white text-white dark:text-fgc-grey py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">{calculating ? <Loader2 size={24} className="animate-spin" /> : <Zap size={24} />}CALCULAR COBERTURA</button>
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="bg-white dark:bg-gray-900 rounded-[32px] p-8 shadow-sm border border-gray-100 dark:border-white/5 min-h-[500px] transition-colors">
                  <div className="flex items-center justify-between mb-8 border-b border-gray-100 dark:border-white/5 pb-6"><div className="flex items-center gap-3"><Users size={20} className="text-fgc-green" /><h3 className="text-xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Candidats Disponibles</h3></div>{solutions.length > 0 && <span className="bg-fgc-green/20 text-fgc-green px-3 py-1 rounded-full text-[10px] font-black">{solutions.length} TROBATS</span>}</div>
                  {calculating ? (<div className="py-20 flex flex-col items-center justify-center gap-4 opacity-30"><Loader2 size={48} className="animate-spin text-fgc-green" /><p className="text-xs font-black uppercase tracking-widest">Escanejant la malla de servei...</p></div>) : solutions.length > 0 ? (<div className="space-y-4">{solutions.map((sol, idx) => (<div key={idx} className="bg-gray-50 dark:bg-black/20 p-5 rounded-[24px] border border-gray-100 dark:border-white/5 hover:shadow-lg transition-all group border-l-4 border-l-fgc-green"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-fgc-grey dark:bg-black text-white rounded-2xl flex items-center justify-center font-black text-xs shadow-md">{sol.torn}</div><div><div className="flex items-center gap-2"><h4 className="font-black text-fgc-grey dark:text-white uppercase tracking-tight">{sol.nom}</h4><span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${sol.type === 'Reserva' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-orange-50 text-orange-600 border-orange-200'}`}>{sol.type}</span></div><p className="text-[10px] font-bold text-gray-400 mt-0.5 italic">{sol.reason}</p></div></div><div className="flex gap-1">{sol.phones.map((p: string, i: number) => (<a key={i} href={`tel:${p}`} className="w-10 h-10 bg-fgc-grey dark:bg-black text-white rounded-xl flex items-center justify-center hover:bg-fgc-green hover:text-fgc-grey transition-all shadow-md"><Phone size={16} /></a>))}</div></div></div>))}</div>) : selectedStation ? (<div className="py-20 text-center space-y-4 opacity-40"><div className="w-20 h-20 bg-gray-100 dark:bg-black/40 rounded-full flex items-center justify-center mx-auto"><Info size={40} className="text-gray-300" /></div><p className="text-sm font-bold text-gray-500 max-w-[280px] mx-auto leading-relaxed">No s'han trobat personal lliure per cobrir aquest període a {selectedStation}.</p></div>) : (<div className="py-20 text-center space-y-4 opacity-40"><div className="w-20 h-20 bg-gray-50 dark:bg-black/20 rounded-full flex items-center justify-center mx-auto"><User size={40} className="text-gray-200" /></div><p className="text-sm font-bold text-gray-400 uppercase tracking-widest italic">Selecciona un relleu per veure opcions</p></div>)}
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

export default IncidenciaView;
