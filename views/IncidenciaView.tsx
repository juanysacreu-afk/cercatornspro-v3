import React, { useState, useEffect, useMemo } from 'react';
import { Search, ShieldAlert, Loader2, UserCheck, Clock, MapPin, AlertCircle, Phone, Info, Users, Zap, User, Train, Map as MapIcon, X, Timer, Scissors, ArrowDownToLine, ArrowUpToLine, ArrowLeftToLine, ArrowRightToLine, Coffee, Layers, Trash2, Repeat, Rewind, FastForward, RotateCcw, RefreshCw, LayoutGrid, CheckCircle2, Activity, FilePlus, ArrowRight } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';
import IncidenciaPerTorn from '../components/IncidenciaPerTorn.tsx';

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
  phones?: string[];
  inici?: string;
  final?: string;
  horaPas?: string;
  x: number;
  y: number;
  visualOffset?: number;
}

interface IncidenciaViewProps {
  showSecretMenu: boolean;
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

const MAP_STATIONS = [
  { id: 'PC', label: 'Pl. Catalunya', x: 20, y: 100 }, { id: 'PR', label: 'Provença', x: 50, y: 100 }, { id: 'GR', label: 'Gràcia', x: 80, y: 100 }, { id: 'SG', label: 'Sant Gervasi', x: 110, y: 100 }, { id: 'MN', label: 'Muntaner', x: 140, y: 100 }, { id: 'BN', label: 'La Bonanova', x: 170, y: 100 }, { id: 'TT', label: 'Les Tres Torres', x: 200, y: 100 }, { id: 'SR', label: 'Sarrià', x: 230, y: 100 }, { id: 'PF', label: 'Peu del Funicular', x: 260, y: 100 }, { id: 'VL', label: 'B. Vallvidrera', x: 290, y: 100 }, { id: 'LP', label: 'Les Planes', x: 320, y: 100 }, { id: 'LF', label: 'La Floresta', x: 350, y: 100 }, { id: 'VD', label: 'Valldoreix', x: 380, y: 100 }, { id: 'SC', label: 'Sant Cugat', x: 410, y: 100 }, { id: 'PM', label: 'Pl. Molina', x: 100, y: 160 }, { id: 'PD', label: 'Pàdua', x: 130, y: 160 }, { id: 'EP', label: 'El Putxet', x: 160, y: 160 }, { id: 'TB', label: 'Av. Tibidabo', x: 190, y: 160 }, { id: 'RE', label: 'R. Elisenda', x: 260, y: 40 }, { id: 'MS', label: 'Mira-Sol', x: 440, y: 40 }, { id: 'HG', label: 'Hosp. General', x: 470, y: 40 }, { id: 'RB', label: 'Rubí Centre', x: 500, y: 40 }, { id: 'FN', label: 'Les Fonts', x: 530, y: 40 }, { id: 'TR', label: 'Terrassa Rambla', x: 560, y: 40 }, { id: 'VP', label: 'Vallparadís', x: 590, y: 40 }, { id: 'EN', label: 'Estació del Nord', x: 620, y: 40 }, { id: 'NA', label: 'Nacions Unides', x: 650, y: 40 }, { id: 'VO', label: 'Volpalleres', x: 440, y: 160 }, { id: 'SJ', label: 'Sant Joan', x: 470, y: 160 }, { id: 'BT', label: 'Bellaterra', x: 500, y: 160 }, { id: 'UN', label: 'U. Autònoma', x: 530, y: 160 }, { id: 'SQ', label: 'Sant Quirze', x: 560, y: 160 }, { id: 'CF', label: 'Can Feu', x: 590, y: 160 }, { id: 'PJ', label: 'Pl. Major', x: 620, y: 160 }, { id: 'CT', label: 'La Creu Alta', x: 650, y: 160 }, { id: 'NO', label: 'Sabadell Nord', x: 680, y: 160 }, { id: 'PN', label: 'Parc del Nord', x: 710, y: 160 },
];

const MAP_SEGMENTS = [
  { from: 'PC', to: 'PR' }, { from: 'PR', to: 'GR' }, { from: 'GR', to: 'SG' }, { from: 'SG', to: 'MN' }, { from: 'MN', to: 'BN' }, { from: 'BN', to: 'TT' }, { from: 'TT', to: 'SR' }, { from: 'SR', to: 'PF' }, { from: 'PF', to: 'VL' }, { from: 'VL', to: 'LP' }, { from: 'LP', to: 'LF' }, { from: 'LF', to: 'VD' }, { from: 'VD', to: 'SC' }, { from: 'GR', to: 'PM' }, { from: 'PM', to: 'PD' }, { from: 'PM', to: 'PD' }, { from: 'PD', to: 'EP' }, { from: 'EP', to: 'TB' }, { from: 'SR', to: 'RE' }, { from: 'SC', to: 'MS' }, { from: 'MS', to: 'HG' }, { from: 'HG', to: 'RB' }, { from: 'RB', to: 'FN' }, { from: 'FN', to: 'TR' }, { from: 'TR', to: 'VP' }, { from: 'VP', to: 'EN' }, { from: 'EN', to: 'NA' }, { from: 'SC', to: 'VO' }, { from: 'VO', to: 'SJ' }, { from: 'SJ', to: 'BT' }, { from: 'BT', to: 'UN' }, { from: 'UN', to: 'SQ' }, { from: 'SQ', to: 'CF' }, { from: 'CF', to: 'PJ' }, { from: 'PJ', to: 'CT' }, { from: 'CT', to: 'NO' }, { from: 'NO', to: 'PN' },
];

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
};

const IncidenciaView: React.FC<IncidenciaViewProps> = ({ showSecretMenu }) => {
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
  const [altServiceIsland, setAltServiceIsland] = useState<string | null>(null);
  
  const [passengerResults, setPassengerResults] = useState<any[]>([]);
  const [adjacentResults, setAdjacentResults] = useState<{anterior: any[], posterior: any[]}>({anterior: [], posterior: []});
  const [restingResults, setRestingResults] = useState<any[]>([]);
  const [extensibleResults, setExtensibleResults] = useState<any[]>([]);
  const [reserveInterceptResults, setReserveInterceptResults] = useState<any[]>([]);

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
    if (isRealTime) {
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
  }, [isRealTime]);

  useEffect(() => {
    if (customTime) {
      const m = getFgcMinutes(customTime);
      if (m !== null) setDisplayMin(m);
    } else if (isRealTime) {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const m = getFgcMinutes(timeStr);
      if (m !== null) setDisplayMin(m);
    }
  }, [customTime, isRealTime, mode]);

  const fetchLiveMapData = async () => {
    setLoading(true);
    try {
      const { data: allShifts } = await supabase.from('shifts').select('*');
      if (!allShifts) return;
      
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
      const { count } = await supabase.from('circulations').select('*', { count: 'exact', head: true });
      const totalCount = count || 0;
      if (totalCount > 1000) {
        for (let i = 0; i < totalCount; i += 1000) {
          const { data } = await supabase.from('circulations').select('*').range(i, i + 999);
          if (data) circDetailsData = [...circDetailsData, ...data];
        }
      } else {
        const { data } = await supabase.from('circulations').select('*');
        if (data) circDetailsData = data;
      }

      if (circDetailsData.length === 0) {
          setLoading(false);
          return;
      }

      const circDetailsMap = new Map<string, any>(circDetailsData.map((c: any) => [c.id.trim().toUpperCase(), c]));

      allShifts.forEach(shift => {
        const shiftService = (shift.servei || '').toString();
        
        let isShiftVisible = false;
        if (selectedServei === 'Tots') {
            isShiftVisible = true;
        } else {
            if (selectedServei === '400') isShiftVisible = shiftService === '400' || shiftService === 'S1';
            else if (selectedServei === '500') isShiftVisible = shiftService === '500' || shiftService === 'S2';
            else if (selectedServei === '100') isShiftVisible = shiftService === '100' || shiftService === 'L6';
            else if (selectedServei === '0') isShiftVisible = shiftService === '0' || shiftService === 'L12';
            else isShiftVisible = (shiftService === selectedServei);
        }

        if (!isShiftVisible) return;

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
              const endID = resolveStationId(circ.final || (estacions[estacions.length-1]?.nom), circ.linia);

              const stopsWithTimes = [
                { nom: startID, min: startMin },
                ...validStops,
                { nom: endID, min: endMin }
              ]
              .filter(s => VALID_STATION_IDS.has(s.nom)) 
              .sort((a: any, b: any) => a.min - b.min);

              if (stopsWithTimes.length < 1) return;

              let x = 0, y = 0, currentStationId = stopsWithTimes[0].nom;

              if (stopsWithTimes.length === 1) {
                 const p = stationCoords[currentStationId] || stationCoords['PC'];
                 x = p.x; y = p.y;
              } else {
                  const expandedStops: { nom: string, min: number }[] = [];
                  for (let i = 0; i < stopsWithTimes.length - 1; i++) {
                    const current = stopsWithTimes[i];
                    const next = stopsWithTimes[i+1];
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
                    const s2 = expandedStops[i+1];
                    if (displayMin >= s1.min && displayMin <= s2.min) {
                      currentStationId = s1.nom;
                      const p1 = stationCoords[s1.nom] || stationCoords['PC'];
                      const p2 = stationCoords[s2.nom] || stationCoords['PC'];
                      if (s1.min === s2.min) { x = p1.x; y = p1.y; } else {
                        const progress = (displayMin - s1.min) / (s2.min - s1.min);
                        x = p1.x + (p2.x - p1.x) * progress;
                        y = p1.y + (p2.y - p1.y) * progress;
                      }
                      break;
                    }
                  }
              }

              const shortTorn = getShortTornId(shift.id);
              const assignment = allDaily?.find(d => d.torn === shortTorn);
              const driverPhones = allPhones?.find(p => p.nomina === assignment?.empleat_id)?.phones || [];

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
                phones: driverPhones, 
                inici: (circ as any).inici as string | undefined, 
                final: (circ as any).final as string | undefined, 
                horaPas: formatFgcTime(displayMin),
                x, y
              });
              processedKeys.add(codi);
           }
        });
      });

      allShifts.forEach(shift => {
        const shiftService = (shift.servei || '').toString();
        
        let isShiftVisible = false;
        if (selectedServei === 'Tots') {
            isShiftVisible = true;
        } else {
            if (selectedServei === '400') isShiftVisible = shiftService === '400' || shiftService === 'S1';
            else if (selectedServei === '500') isShiftVisible = shiftService === '500' || shiftService === 'S2';
            else if (selectedServei === '100') isShiftVisible = shiftService === '100' || shiftService === 'L6';
            else if (selectedServei === '0') isShiftVisible = shiftService === '0' || shiftService === 'L12';
            else isShiftVisible = (shiftService === selectedServei);
        }

        if (!isShiftVisible) return;

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
                // Fix type errors by casting assignment to any, as its type is unknown in this context.
                driver: `${(assignment as any).cognoms}, ${(assignment as any).nom}`, 
                driverName: (assignment as any).nom,
                driverSurname: (assignment as any).cognoms,
                torn: shift.id, phones: driverPhones, 
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

  useEffect(() => { if (mode === 'LINIA') fetchLiveMapData(); }, [mode, displayMin, selectedServei]);

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
    const { data: phones } = primary?.empleat_id ? await supabase.from('phonebook').select('*').eq('nomina', primary.empleat_id).single() : { data: null };
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
      let mFinal = d?.final || c.final;
      if (isViatger && obsParts.length >= 3) { mInici = obsParts[1]; mFinal = obsParts[2]; }
      const cycleInfo = c.cicle ? trainAssig?.find(ta => ta.cycle_id === c.cicle) : null;
      return { ...d, ...c, codi, machinistInici: mInici, machinistFinal: mFinal, train: cycleInfo?.train_number, realCodi: isViatger ? realCodiId : null };
    }).sort((a: any, b: any) => (getFgcMinutes(a.sortida || '00:00') || 0) - (getFgcMinutes(b.sortida || '00:00') || 0));
    return { ...shift, driver: { nom: primary?.nom || 'No assignat', cognoms: primary?.cognoms || '', nomina: primary?.empleat_id || '---', phones: phones?.phones || [], tipus_torn: primary?.tipus_torn }, fullCirculations: fullCircs };
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

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true); setOriginalShift(null); 
    setPassengerResults([]); setAdjacentResults({anterior:[], posterior:[]}); setRestingResults([]); setExtensibleResults([]); setReserveInterceptResults([]);
    try {
      const { data: shifts } = await supabase.from('shifts').select('*');
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
    setPassengerResults([]); setAdjacentResults({anterior:[], posterior:[]}); setRestingResults([]); setExtensibleResults([]); setReserveInterceptResults([]);
    try {
      let shiftsQuery = supabase.from('shifts').select('id, servei, circulations, inici_torn, final_torn, duracio, dependencia');
      
      if (selectedServei !== 'Tots') {
        shiftsQuery = (shiftsQuery as any).eq('servei', selectedServei);
      }

      const { data: allShiftsRaw = [] } = await (shiftsQuery as any);
      const { data: tcDetail = null } = await (supabase.from('circulations').select('*').eq('id', selectedCircId).single() as any);
      
      if (!allShiftsRaw || !tcDetail) { setCalculating(false); return; }

      const reliefTimeStr = (tcDetail.inici === selectedStation ? tcDetail.sortida : (tcDetail.estacions?.find((s: any) => s.nom === selectedStation)?.hora || tcDetail.arribada)) as string | undefined;
      const reliefMin = getFgcMinutes(reliefTimeStr);
      const arribadaMin = getFgcMinutes(tcDetail.arribada as string | undefined);
      
      if (reliefMin === null || arribadaMin === null) { setCalculating(false); return; }

      const passIds: string[] = []; 
      const antIds: string[] = []; 
      const postIds: string[] = [];

      const { data: sameLine } = await (supabase.from('circulations').select('id, sortida').eq('linia', (tcDetail as any).linia).eq('final', (tcDetail as any).final) as any);
      const sorted = (sameLine as any[])?.sort((a: any, b: any) => (getFgcMinutes(a.sortida as string) || 0) - (getFgcMinutes(b.sortida as string) || 0)) || [];
      const idx = sorted.findIndex((c: any) => (c as any).id === (tcDetail as any).id);
      const antId = idx > 0 ? (sorted[idx-1] as any).id : null;
      const postId = idx < sorted.length - 1 ? (sorted[idx+1] as any).id : null;

      (allShiftsRaw as any[]).forEach((s: any) => {
        (s.circulations as any[]).forEach(c => {
          if (c.codi === 'Viatger' && c.observacions) {
            const obs = c.observacions.split('-')[0].toUpperCase();
            if (obs === selectedCircId) passIds.push(s.id);
            if (antId && obs === antId) antIds.push(s.id);
            if (postId && obs === postId) postIds.push(s.id);
          }
        });
      });

      const [resPass, resAnt, resPost] = await Promise.all([
        Promise.all(passIds.map(id => fetchFullTurnData(id))),
        Promise.all(antIds.map(id => fetchFullTurnData(id))),
        Promise.all(postIds.map(id => fetchFullTurnData(id)))
      ]);

      setPassengerResults(resPass.filter(Boolean));
      setAdjacentResults({ 
        anterior: resAnt.filter(Boolean).map(t => ({...t, adjCode: antId})), 
        posterior: resPost.filter(Boolean).map(t => ({...t, adjCode: postId})) 
      });

      const resting: any[] = []; 
      const extensible: any[] = []; 
      const reserves: any[] = [];
      const enrichedAll = await Promise.all(allShiftsRaw.map((s: any) => fetchFullTurnData(s.id)));
      
      const normalizedStation = resolveStationId(selectedStation);

      enrichedAll.forEach(tData => {
        if (!tData || tData.id === originalShift.id) return;
        const segs = getSegments(tData);
        const [h, m] = (tData.duracio || "00:00").split(':').map(Number);
        const dur = h * 60 + m;
        
        const isRestHere = segs.find(seg => 
          seg.type === 'gap' && 
          resolveStationId(seg.codi as string) === normalizedStation && 
          seg.start <= (reliefMin + 1) && 
          seg.end >= (reliefMin - 1)
        );

        if (isRestHere) resting.push({...tData, restSeg: isRestHere});
        
        if (dur < 525 && isRestHere) {
          const conflict = segs.some(seg => seg.type === 'circ' && seg.start >= reliefMin && seg.start < (arribadaMin + 15));
          if (!conflict) {
            const tFinal = getFgcMinutes(tData.final_torn);
            if (tFinal !== null) {
                const extra = Math.max(0, (arribadaMin + 15) - tFinal);
                if (dur + extra <= 525) extensible.push({...tData, extData: { estimatedReturn: arribadaMin + 15, extra }});
            }
          }
        }

        const isS1Zone = ['MS','HG','RB','FN','TR','VP','EN','NA'].includes(normalizedStation);
        const isS2Zone = ['VO','SJ','BT','UN','SQ','CF','PJ','CT','NO','PN'].includes(normalizedStation);
        
        const resPoint = RESERVAS_CONFIG.find(r => {
          const timeOk = isReserveActive(r, reliefMin);
          if (!timeOk) return false;
          if (isS1Zone) return r.loc === 'RB';
          if (isS2Zone) return r.loc === 'SR' || r.loc === 'PN';
          return normalizedStation === r.loc;
        });

        if (resPoint && tData.id.includes(resPoint.id)) { 
          reserves.push({...tData, resData: { resId: resPoint.id, loc: resPoint.loc, time: reliefTimeStr }}); 
        }
      });

      setRestingResults(resting); 
      setExtensibleResults(extensible); 
      setReserveInterceptResults(reserves);
    } catch (e) { console.error(e); } finally { setCalculating(false); }
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
    setMode('INIT'); setQuery(''); setOriginalShift(null); setSelectedCircId(''); setSelectedStation('');
    setPassengerResults([]); setAdjacentResults({anterior:[], posterior:[]}); setRestingResults([]); setExtensibleResults([]); setReserveInterceptResults([]);
    setSelectedCutStations(new Set()); setSelectedCutSegments(new Set()); setAltServiceIsland(null);
  };

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

  const clearAllCuts = () => { setSelectedCutStations(new Set()); setSelectedCutSegments(new Set()); setAltServiceIsland(null); };

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
    const vallesUnified = islands.S1.has('PN') || islands.S2.has('NA');
    const result: Record<string, { list: LivePersonnel[], stations: Set<string>, isUnified: boolean, label: string }> = { 
      AFFECTED: { list: [], stations: selectedCutStations, isUnified: false, label: 'Zona de Tall / Atrapats' }, 
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
      if (selectedCutStations.has(st)) result.AFFECTED.list.push(p);
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
    const rest = liveData.filter(p => p.type === 'REST');
    const grouped: Record<string, LivePersonnel[]> = {};
    rest.forEach(p => { if (!grouped[p.stationId]) grouped[p.stationId] = []; grouped[p.stationId].push(p); });
    return grouped;
  }, [liveData]);

  const CompactRow: React.FC<{ torn: any, color: string, label?: React.ReactNode, sub?: string }> = ({ torn, color, label, sub }) => (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all flex items-center gap-4 border-l-4 ${color}`}>
      <div className="h-10 min-w-[2.5rem] px-2 bg-fgc-grey/10 dark:bg-black text-fgc-grey dark:text-gray-300 rounded-xl flex items-center justify-center font-black text-xs shrink-0">{torn.id}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2"><p className="text-sm font-black text-fgc-grey dark:text-gray-200 truncate uppercase">{torn.driver?.cognoms}, {torn.driver?.nom}</p>{label}</div>
        <p className="text-[8px] font-black text-gray-300 dark:text-gray-600 uppercase tracking-widest truncate">Nom. {torn.driver?.nomina} • {torn.inici_torn}-{torn.final_torn} {sub ? `• ${sub}` : ''}</p>
      </div>
      <div className="flex gap-1 shrink-0">{torn.driver?.phones?.map((p: string, i: number) => (
        <a key={i} href={`tel:${p}`} className="w-9 h-9 bg-fgc-grey dark:bg-black text-white rounded-xl flex items-center justify-center hover:bg-fgc-green transition-all shadow-sm"><Phone size={14} /></a>
      ))}</div>
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
          <div className="bg-fgc-grey dark:bg-black text-white px-2 py-1 rounded text-[9px] sm:text-[10px] font-black min-w-[45px] text-center shrink-0 border border-white/10">{item.torn}</div>
          <p className={`text-[12px] sm:text-sm font-bold truncate uppercase ${variant === 'affected' ? 'text-red-700 dark:text-red-400 font-black' : isRest ? 'text-fgc-green font-black' : 'text-fgc-grey dark:text-gray-300'}`}>{item.driver}</p>
          <div className="hidden md:flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest"><MapPin size={10} className="text-gray-300" /> {item.stationId}</div>
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

  const AlternativeServiceOverlay = ({ islandId }: { islandId: string }) => {
    const [viewMode, setViewMode] = useState<'RESOURCES' | 'CIRCULATIONS'>('RESOURCES');
    const [generatedCircs, setGeneratedCircs] = useState<any[]>([]);
    const [generating, setGenerating] = useState(false);

    if (!dividedPersonnel || !dividedPersonnel[islandId]) return null;
    const personnel = dividedPersonnel[islandId].list;
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

        if (canSupportL12) tryAssign("L12 (Shuttle SR-RE)", "MITJA", "L12");

        const l7TrainsInIsland = physicalTrains.filter(t => t.linia === 'L7' || t.linia === '300').length;
        let l7Target = 0;
        let l7Withdraw = false;
        
        if (canSupportL7Full || canSupportL7Local) {
            if (l7TrainsInIsland === 2) l7Target = 2;
            else if (l7TrainsInIsland === 3) l7Target = 3;
            else if (l7TrainsInIsland >= 4) { l7Target = 3; l7Withdraw = true; }
            else l7Target = 2;
        }

        const l7Route = canSupportL7Full ? "L7 (Shuttle PC-TB)" : "L7 (Shuttle GR-TB)";
        for(let i=0; i<l7Target; i++) tryAssign(l7Route, "MITJA", "L7");
        if (l7Withdraw && canSupportL7Full) tryAssign("Retirada L7 a PC (Excedent)", "BÀSICA", "L7");

        let cycleCount = 0;
        while (availableTrains.length > 0 && availableDrivers.length > 0) {
          if (canSupportS1 && !tryAssign("S1 (Llançadora Terrassa)", "ALTA", "S1")) break;
          if (canSupportS2 && !tryAssign("S2 (Llançadora Sabadell)", "ALTA", "S2")) break;
          cycleCount++;
          if (canSupportL6 && !tryAssign("L6 (Reforç Urbà)", "MITJA", "L6")) break;
          if (!canSupportS1 && !canSupportS2 && !canSupportL6 && !canSupportL7Full && !canSupportL7Local && !canSupportL12) {
             tryAssign("Llançadora Local d'Illa", "BÀSICA", "S1");
             break;
          }
          if (cycleCount > 20) break;
        }
        return formedServices;
    }, [physicalTrains, allDrivers, canSupportS1, canSupportS2, canSupportL6, canSupportL12, canSupportL7Full, canSupportL7Local]);

    const handleGenerateCirculations = async () => {
        setGenerating(true);
        setViewMode('CIRCULATIONS');
        try {
            const { data: theoryCircs } = await supabase.from('circulations').select('*');
            if (!theoryCircs) return;

            const nextByLinia: Record<string, { odd: number, even: number }> = {
                'S1': { odd: 401, even: 402 },
                'S2': { odd: 501, even: 502 },
                'L6': { odd: 101, even: 102 },
                'L7': { odd: 301, even: 302 },
                'L12': { odd: 1, even: 2 }
            };

            const liniaPrefixes: Record<string, string> = { 'S1': 'D', 'S2': 'F', 'L6': 'A', 'L7': 'B', 'L12': 'L' };

            // Determinar properes circulacions segons horari actual
            Object.keys(nextByLinia).forEach(linia => {
                const afterCurrent = (theoryCircs as any[])
                    .filter(c => c.linia === linia && getFgcMinutes(c.sortida as string)! >= displayMin)
                    .sort((a,b) => getFgcMinutes(a.sortida as string)! - getFgcMinutes(b.sortida as string)!);
                
                const firstOdd = afterCurrent.find(c => parseInt((c.id as string).replace(/\D/g, '')) % 2 !== 0);
                const firstEven = afterCurrent.find(c => parseInt((c.id as string).replace(/\D/g, '')) % 2 === 0);
                
                if (firstOdd) nextByLinia[linia].odd = parseInt((firstOdd.id as string).replace(/\D/g, ''));
                if (firstEven) nextByLinia[linia].even = parseInt((firstEven.id as string).replace(/\D/g, ''));
            });

            const plan: any[] = [];
            const activeResources = shuttlePlan.filter(s => s.priority !== 'BÀSICA');
            
            // Generar seqüència d'1 hora de servei per linia activa
            activeResources.forEach((res, idx) => {
                const prefix = liniaPrefixes[res.liniaCode] || 'X';
                let currentNum = (idx % 2 === 0) ? nextByLinia[res.liniaCode].odd : nextByLinia[res.liniaCode].even;
                
                for(let i=0; i<6; i++) { // 6 circulacions per tren (anada i tornada 3 cops)
                    const id = `${prefix}${currentNum.toString().padStart(3, '0')}`;
                    plan.push({
                        id,
                        route: res.route,
                        train: res.train.id,
                        driver: res.driver.driver,
                        time: formatFgcTime(displayMin + (i * 15)),
                        direction: currentNum % 2 !== 0 ? 'ASCENDENT' : 'DESCENDENT'
                    });
                    currentNum += 2;
                }
            });

            setGeneratedCircs(plan.sort((a,b) => getFgcMinutes(a.time)! - getFgcMinutes(b.time)!));
        } catch (e) { console.error(e); } finally { setGenerating(false); }
    };

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-fgc-grey/60 backdrop-blur-md animate-in fade-in duration-300">
        <div className="bg-white dark:bg-gray-900 w-full max-w-5xl rounded-[48px] shadow-2xl border border-white/20 overflow-hidden flex flex-col max-h-[90vh]">
           <div className="p-8 border-b border-gray-100 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-gray-50/50 dark:bg-black/20">
              <div className="flex items-center gap-4">
                 <div className="p-3 bg-fgc-green rounded-2xl text-fgc-grey shadow-lg"><Activity size={24} /></div>
                 <div>
                    <h3 className="text-xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Pla de Servei Alternatiu (Geogràfic)</h3>
                    <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                      {dividedPersonnel[islandId].label} • {shuttlePlan.length} Unitats / {allDrivers.length} Maquinistes
                    </p>
                 </div>
              </div>
              <div className="flex items-center gap-3">
                 <button 
                    onClick={handleGenerateCirculations}
                    className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-sm transition-all shadow-lg active:scale-95 ${viewMode === 'CIRCULATIONS' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-fgc-grey dark:text-white border border-gray-100 dark:border-white/10'}`}
                 >
                    <FilePlus size={18} /> CREAR CIRCULACIONS
                 </button>
                 <button onClick={() => setAltServiceIsland(null)} className="p-3 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 rounded-full transition-colors"><X size={28} /></button>
              </div>
           </div>
           
           <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
              {viewMode === 'RESOURCES' ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-[28px] border border-blue-100 dark:border-blue-900/50 flex flex-col items-center gap-1">
                        <Train size={24} className="text-blue-500 mb-1" />
                        <p className="text-xl font-black text-blue-700 dark:text-blue-300">{physicalTrains.length}</p>
                        <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest text-center leading-tight">Trens a la zona</p>
                     </div>
                     <div className="bg-fgc-green/10 dark:bg-fgc-green/5 p-4 rounded-[28px] border border-fgc-green/20 dark:border-fgc-green/10 flex flex-col items-center gap-1">
                        <User size={24} className="text-fgc-green mb-1" />
                        <p className="text-xl font-black text-fgc-grey dark:text-gray-200">{allDrivers.length}</p>
                        <p className="text-[8px] font-black text-fgc-green uppercase tracking-widest text-center leading-tight">Personal Disponible</p>
                     </div>
                     <div className={`p-4 rounded-[28px] border flex flex-col items-center gap-1 ${canSupportS1 || canSupportS2 ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200' : 'bg-gray-50 opacity-40 border-gray-100'}`}>
                        <LayoutGrid size={24} className={canSupportS1 || canSupportS2 ? "text-orange-500" : "text-gray-400"} />
                        <p className="text-xl font-black uppercase text-fgc-grey dark:text-white">{(canSupportS1 && canSupportS2) ? "S1+S2" : canSupportS1 ? "S1" : canSupportS2 ? "S2" : "Tall"}</p>
                        <p className="text-[8px] font-black uppercase tracking-widest text-center leading-tight">Prioritat Alta</p>
                     </div>
                     <div className={`p-4 rounded-[28px] border flex flex-col items-center gap-1 ${canSupportL6 || canSupportL7Full || canSupportL7Local ? 'bg-purple-50 dark:bg-purple-950/20 border-purple-200' : 'bg-gray-50 opacity-40 border-gray-100'}`}>
                        <Layers size={24} className={canSupportL6 || canSupportL7Full || canSupportL7Local ? "text-purple-500" : "text-gray-400"} />
                        <p className="text-xl font-black uppercase text-fgc-grey dark:text-white">
                            {canSupportL6 ? "L6" : ""} {canSupportL7Full || canSupportL7Local ? "L7" : ""} {canSupportL12 ? "L12" : ""}
                        </p>
                        <p className="text-[8px] font-black uppercase tracking-widest text-center leading-tight">Serveis de Ramal</p>
                     </div>
                  </div>

                  <div className="space-y-4">
                     <div className="flex items-center gap-2 px-2"><ShieldAlert size={16} className="text-red-500" /><h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Assignació de Recursos d'Illa</h4></div>
                     <div className="grid grid-cols-1 gap-3">
                        {shuttlePlan.map((s, idx) => (
                           <div key={idx} className="bg-white dark:bg-gray-800 rounded-[28px] p-5 border border-gray-100 dark:border-white/5 shadow-sm flex items-center justify-between gap-6 hover:shadow-md transition-all group">
                              <div className="flex items-center gap-5 flex-1 min-w-0">
                                 <div className={`h-12 w-12 rounded-xl flex items-center justify-center font-black text-white shadow-lg shrink-0 ${s.priority === 'ALTA' ? 'bg-red-500' : 'bg-purple-500'}`}>{idx + 1}</div>
                                 <div className="min-w-0">
                                    <div className="flex items-center gap-3 mb-1">
                                       <p className="text-lg font-black text-fgc-grey dark:text-white uppercase truncate">{s.route}</p>
                                       <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${s.priority === 'ALTA' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-purple-50 text-purple-600 border-purple-100'}`}>Prioritat {s.priority}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                       <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400"><Train size={12} className="text-blue-500" /> Tren: <span className="text-fgc-grey dark:text-gray-200 font-black">{s.train.id}</span></div>
                                       <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400"><UserCheck size={12} className="text-fgc-green" /> Maquinista: <span className="text-fgc-grey dark:text-gray-200 font-black truncate">{s.driver.driver}</span></div>
                                    </div>
                                 </div>
                              </div>
                              <div className="flex gap-2">
                                 {s.driver.phones?.map((p: string, i: number) => (
                                    <a key={i} href={`tel:${p}`} className="w-10 h-10 bg-gray-50 dark:bg-black text-fgc-grey dark:text-gray-400 rounded-xl flex items-center justify-center hover:bg-fgc-green hover:text-white transition-all shadow-sm border border-gray-100 dark:border-white/10"><Phone size={16} /></a>
                                 ))}
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
                </>
              ) : (
                <div className="space-y-6 animate-in slide-in-from-right duration-500">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 px-2"><LayoutGrid size={16} className="text-blue-500" /><h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Escaleta de Circulacions d'Emergència</h4></div>
                        <button onClick={() => setViewMode('RESOURCES')} className="text-[10px] font-black text-blue-500 hover:underline">← Tornar a recursos</button>
                    </div>
                    {generating ? (
                        <div className="py-20 flex flex-col items-center gap-4 opacity-30"><Loader2 className="animate-spin text-blue-500" size={48} /><p className="text-xs font-black uppercase tracking-widest">Sincronitzant malla teòrica...</p></div>
                    ) : (
                        <div className="bg-gray-50 dark:bg-black/20 rounded-[32px] overflow-hidden border border-gray-100 dark:border-white/5">
                            <div className="grid grid-cols-5 bg-fgc-grey dark:bg-black text-white p-4 text-[10px] font-black uppercase tracking-widest">
                                <div>Codi</div><div>Tren</div><div>Inici</div><div>Ruta</div><div>Direcció</div>
                            </div>
                            <div className="divide-y divide-gray-100 dark:divide-white/5">
                                {generatedCircs.map((c, idx) => (
                                    <div key={idx} className="grid grid-cols-5 p-4 items-center hover:bg-white dark:hover:bg-white/5 transition-colors">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                                            <span className="font-black text-lg text-fgc-grey dark:text-white">{c.id}</span>
                                        </div>
                                        <div className="font-bold text-sm text-gray-500 dark:text-gray-400">{c.train}</div>
                                        <div className="font-black text-sm text-blue-600 dark:text-blue-400">{c.time}</div>
                                        <div className="text-xs font-bold text-gray-400 truncate">{c.route}</div>
                                        <div><span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${c.direction === 'ASCENDENT' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-green-50 text-green-600 border-green-100'}`}>{c.direction}</span></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
              )}
           </div>
           
           <div className="p-8 border-t border-gray-100 dark:border-white/5 bg-gray-50/30 dark:bg-black/40">
              <div className="flex items-start gap-4 p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/20">
                 <Info size={20} className="text-blue-500 mt-1 shrink-0" />
                 <div className="text-xs font-bold text-blue-700 dark:text-blue-300 leading-relaxed">
                   <p className="uppercase tracking-widest mb-1 underline">Regles Operatives Aplicades:</p>
                   <ul className="list-disc pl-4 space-y-1">
                       <li><b>Prefixes:</b> L6(A), L7(B), L12(L), S1(D), S2(F).</li>
                       <li><b>Numeració:</b> Primera referència basada en la propera teòrica per horari.</li>
                       <li><b>Paritat:</b> Ascendents (Imparells) i Descendents (Parells).</li>
                   </ul>
                 </div>
              </div>
           </div>
        </div>
      </div>
    );
  };

  const InteractiveMap = () => {
    const trains = liveData.filter(p => p.type === 'TRAIN');
    return (
      <div className="bg-white dark:bg-black/40 rounded-[40px] p-6 sm:p-10 border border-gray-100 dark:border-white/5 relative overflow-hidden flex flex-col transition-colors shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
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
          <div className="flex flex-wrap items-center gap-3 bg-gray-50 dark:bg-black/20 p-2 rounded-[24px] border border-gray-100 dark:border-white/5">
              <div className="flex items-center gap-2">
                <button onClick={() => setIsRealTime(true)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${isRealTime ? 'bg-fgc-grey dark:bg-fgc-green text-white dark:text-fgc-grey shadow-md' : 'text-gray-400 hover:text-fgc-grey'}`}>Live</button>
                <input type="time" value={customTime} onChange={(e) => { setCustomTime(e.target.value); setIsRealTime(false); }} className="bg-white dark:bg-gray-800 border-none rounded-lg px-3 py-1.5 text-xs font-black text-fgc-grey dark:text-white focus:ring-2 focus:ring-fgc-green/30 outline-none" />
                <button onClick={fetchLiveMapData} className="p-2 hover:bg-gray-200 dark:hover:bg-white/10 rounded-lg text-gray-400"><RefreshCw size={14} /></button>
              </div>
          </div>
          {(selectedCutStations.size > 0 || selectedCutSegments.size > 0) && (<button onClick={clearAllCuts} className="text-[10px] font-black text-red-500 uppercase flex items-center gap-2 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 rounded-xl hover:scale-105 transition-all shadow-sm border border-red-100 dark:border-red-900/40 animate-in fade-in zoom-in-95"><Trash2 size={14} /> Anul·lar Talls ({selectedCutStations.size + selectedCutSegments.size})</button>)}
        </div>
        <div className="overflow-x-auto custom-scrollbar pb-10 -mx-4 px-4 select-none">
          <svg viewBox="0 0 750 220" className="min-w-[800px] h-auto overflow-visible">
            {MAP_SEGMENTS.map((seg, i) => {
              const s1 = MAP_STATIONS.find(s => s.id === (seg as any).from)!;
              const s2 = MAP_STATIONS.find(s => s.id === (seg as any).to)!;
              if(!s1 || !s2) return null;
              const isBlocked = selectedCutSegments.has(`${s1.id}-${s2.id}`) || selectedCutSegments.has(`${s2.id}-${s1.id}`);
              return (
                <g key={`seg-${i}`} className="cursor-pointer group" onClick={() => toggleSegmentCut(s1.id, s2.id)}>
                  <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke="transparent" strokeWidth="16" />
                  <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke={isBlocked ? "#ef4444" : "#A4A7AB"} strokeWidth="6" strokeLinecap="round" className={`transition-all duration-300 ${isBlocked ? 'opacity-100' : 'opacity-40 group-hover:opacity-60'}`} />
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
                  <circle cx={st.x} cy={st.y} r="9" fill="white" stroke={isCut ? "#ef4444" : "#53565A"} strokeWidth="2.5" onClick={() => toggleStationCut(st.id)} className="cursor-pointer transition-all duration-300 group-hover:stroke-red-500" />
                  {count > 0 && !isCut && (
                    <g onClick={() => setSelectedRestLocation(selectedRestLocation === st.id ? null : st.id)} className="cursor-pointer transition-colors">
                      <circle cx={st.x} cy={st.y + (isUpper ? -32 : 44)} r={count > 1 ? 7 : 4} fill={count > 1 ? "#3b82f6" : "#8EDE00"} className="shadow-md" stroke="white" strokeWidth="1.5" />
                      {count > 1 && (<text x={st.x} y={st.y + (isUpper ? -29.5 : 46.5)} textAnchor="middle" fill="white" className="text-[7px] font-black pointer-events-none">{count}</text>)}
                    </g>
                  )}
                  <text x={st.x} y={st.y + (isUpper ? -16 : 30)} textAnchor="middle" pointerEvents="none" className={`text-[9px] font-black select-none transition-colors duration-300 ${isCut ? 'fill-red-500' : 'fill-gray-400 dark:fill-gray-500 group-hover:fill-red-400'}`}>{st.id}</text>
                </g>
              );
            })}
            {trains.map((p, idx) => {
               const offset = (p as any).visualOffset || 0;
               const isAffected = selectedCutStations.has(p.stationId.toUpperCase());
               return (
                 <g key={`${p.id}-${p.torn}-${idx}`} className="transition-all duration-1000 ease-linear">
                   <circle cx={p.x} cy={p.y} r={5.5} fill={p.color} className={`${isAffected ? "stroke-red-500 stroke-2" : "stroke-white dark:stroke-black stroke-[1.5]"}`} style={{ transform: `translate(${offset * 4}px, 0px)`, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))' }}><title>{p.id} - Torn {p.torn}</title></circle>
                   <text x={p.x} y={p.y - 9} textAnchor="middle" className="text-[7px] font-black fill-fgc-grey dark:fill-white pointer-events-none drop-shadow-md" style={{ transform: `translate(${offset * 4}px, 0px)` }}>{p.id}</text>
                 </g>
               );
            })}
          </svg>
        </div>
        {selectedRestLocation && groupedRestPersonnel[selectedRestLocation] && (
          <div className="absolute top-0 right-0 h-full w-full sm:w-80 bg-white/95 dark:bg-black/90 backdrop-blur-md border-l border-gray-100 dark:border-white/10 z-[100] p-6 shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto">
            <div className="flex items-center justify-between mb-8 border-b border-gray-100 dark:border-white/5 pb-4"><div className="flex items-center gap-3"><div className="p-2 bg-blue-500 rounded-lg text-white"><Coffee size={20} /></div><div><h4 className="text-sm font-black text-fgc-grey dark:text-white uppercase tracking-tight">Personal en Descans</h4><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{MAP_STATIONS.find(s => s.id === selectedRestLocation)?.id || selectedRestLocation}</p></div></div><button onClick={() => setSelectedRestLocation(null)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"><X size={20} /></button></div>
            <div className="space-y-3">{groupedRestPersonnel[selectedRestLocation].map((p, idx) => (<div key={idx} className="bg-white dark:bg-white/5 p-4 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all group"><div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><span className="bg-fgc-grey dark:bg-black text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">{p.torn}</span>{p.phones && p.phones.length > 0 && (<a href={`tel:${p.phones[0]}`} className="text-blue-500 hover:scale-110 transition-transform"><Phone size={14} /></a>)}</div><span className="text-[9px] font-black text-fgc-green uppercase tracking-widest">{p.horaPas}</span></div><p className="text-xs font-bold text-fgc-grey dark:text-gray-200 uppercase truncate">{p.driver}</p>{p.phones && p.phones.length > 0 && (<p className="text-[9px] font-bold text-gray-400 mt-1">{p.phones[0]}</p>)}</div>))}</div>
          </div>
        )}
        {(selectedCutStations.size > 0 || selectedCutSegments.size > 0) && dividedPersonnel && (
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
                  const items = bucket?.list || [];
                  const vallesUnified = dividedPersonnel.VALLES.isUnified;
                  if (col.unifiedOnly && !vallesUnified) return null;
                  if (col.splitOnly && vallesUnified) return null;
                  if (items.length === 0 && col.id !== 'AFFECTED') return null;
                  const trainsCount = items.filter(i => i.type === 'TRAIN').length;
                  const isRed = col.color === 'red';
                  return (
                    <div key={col.id} className={`${isRed ? 'bg-red-50/50 dark:bg-red-950/20 border-2 border-red-500/30' : 'bg-gray-50/30 dark:bg-white/5 border border-gray-100 dark:border-white/10'} rounded-[32px] p-6 transition-all`}>
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
                               onClick={() => setAltServiceIsland(col.id)}
                               className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded-xl text-[10px] sm:text-xs font-black shadow-md hover:scale-105 active:scale-95 transition-all"
                             >
                               <Zap size={10} /> SERVEI ALTERNATIU
                             </button>
                           )}
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
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-red-500 rounded-2xl text-white shadow-lg shadow-red-500/20"><ShieldAlert size={28} /></div>
          <div><h1 className="text-3xl font-black text-fgc-grey dark:text-white tracking-tight uppercase">Gestió d'Incidències</h1><p className="text-gray-500 dark:text-gray-400 font-medium">Cerca cobertures avançades i gestiona talls operatius.</p></div>
        </div>
        {mode !== 'INIT' && (
          <div className="flex flex-col gap-2"><span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">Filtre de Servei (Torn)</span><div className="inline-flex bg-white dark:bg-gray-900 p-1 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">{['Tots', ...serveiTypes].map(s => (<button key={s} onClick={() => setSelectedServei(s)} className={`px-3 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-black transition-all ${selectedServei === s ? 'bg-fgc-grey dark:bg-fgc-green dark:text-fgc-grey text-white shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'}`}>{s === 'Tots' ? 'Tots' : `S-${s}`}</button>))}</div></div>
        )}
      </header>

      {mode === 'INIT' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 py-12 max-w-6xl mx-auto">
          <button onClick={() => setMode('MAQUINISTA')} className="group bg-white dark:bg-gray-900 p-10 rounded-[48px] border border-gray-100 dark:border-white/5 shadow-xl hover:shadow-2xl transition-all flex flex-col items-center gap-6"><div className="w-24 h-24 bg-red-50 dark:bg-red-950/20 rounded-full flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform"><User size={48} /></div><div className="text-center"><h3 className="text-2xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Per Maquinista</h3><p className="text-sm font-medium text-gray-400 mt-2">Identifica tren i busca cobertura avançada amb intercepció de reserves.</p></div></button>
          <button onClick={() => setMode('LINIA')} className="group bg-white dark:bg-gray-900 p-10 rounded-[48px] border border-gray-100 dark:border-white/5 shadow-xl hover:shadow-2xl transition-all flex flex-col items-center gap-6"><div className="w-24 h-24 bg-fgc-green/10 rounded-full flex items-center justify-center text-fgc-green group-hover:scale-110 transition-transform"><MapIcon size={48} /></div><div className="text-center"><h3 className="text-2xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Per Línia / Tram</h3><p className="text-sm font-medium text-gray-400 mt-2">Gestiona talls de servei i identifica personal a cada costat.</p></div></button>
          <button onClick={() => setMode('PER_TORN')} className="group bg-white dark:bg-gray-900 p-10 rounded-[48px] border border-gray-100 dark:border-white/5 shadow-xl hover:shadow-2xl transition-all flex flex-col items-center gap-6"><div className="w-24 h-24 bg-blue-50 dark:bg-blue-950/20 rounded-full flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform"><RotateCcw size={48} /></div><div className="text-center"><h3 className="text-2xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Per Torn</h3><p className="text-sm font-medium text-gray-400 mt-2">Cobreix totes les circulacions d'un torn descobert utilitzant els buits d'altres.</p></div></button>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="flex justify-start"><button onClick={resetAllModeData} className="text-[10px] font-black text-fgc-green hover:underline uppercase tracking-[0.2em] flex items-center gap-2">← Tornar al selector</button></div>
          {mode === 'MAQUINISTA' && (
             <div className="bg-white dark:bg-gray-900 rounded-[32px] p-8 shadow-sm border border-gray-100 dark:border-white/5 transition-colors">
               <div className="max-w-2xl mx-auto space-y-6 text-center w-full">
                 <h3 className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Identifica el Tren afectat</h3>
                 <div className="relative">
                   <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={24} />
                   <input type="text" placeholder="Ex: 1104, 2351..." value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[28px] py-6 pl-16 pr-8 focus:ring-4 focus:ring-red-500/20 outline-none text-xl font-bold transition-all dark:text-white shadow-inner" />
                   <button onClick={handleSearch} disabled={loading || !query} className="absolute right-3 top-1/2 -translate-y-1/2 bg-fgc-grey dark:bg-fgc-green text-white dark:text-fgc-grey px-8 py-3 rounded-2xl font-black text-sm hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50">{loading ? <Loader2 className="animate-spin" size={20} /> : 'BUSCAR'}</button>
                 </div>
               </div>
             </div>
          )}
          {mode === 'LINIA' && (<div className="max-w-7xl mx-auto"><InteractiveMap /></div>)}
          {mode === 'PER_TORN' && (<IncidenciaPerTorn selectedServei={selectedServei} showSecretMenu={showSecretMenu} />)}
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
                      <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-3 ml-1">Tria la Circulació de Relleu</label>
                      <div className="grid grid-cols-1 gap-2">
                        {originalShift.fullCirculations.map((c: any) => (
                          <button key={c.codi} onClick={() => { setSelectedCircId(c.codi); setSelectedStation(c.inici); setPassengerResults([]); setAdjacentResults({anterior:[], posterior:[]}); setRestingResults([]); setExtensibleResults([]); setReserveInterceptResults([]); }} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${selectedCircId === c.codi ? 'bg-red-50 dark:bg-red-950/20 border-red-500 shadow-md ring-1 ring-red-500' : 'bg-gray-50 dark:bg-black/20 border-gray-100 dark:border-white/5 hover:border-red-200'}`}>
                            <div className="flex items-center gap-4"><span className="font-black text-lg text-fgc-grey dark:text-white">{c.codi}</span><div className="flex items-center gap-2 text-gray-400"><Clock size={14} /><span className="text-xs font-bold">{c.sortida} — {c.arribada}</span></div></div>{selectedCircId === c.codi && <UserCheck size={20} className="text-red-500" />}
                          </button>
                        ))}
                      </div>
                    </div>
                    {selectedCircId && (
                      <div className="animate-in fade-in slide-in-from-top-2">
                        <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-3 ml-1">Estació de Relleu</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(() => {
                            const tc = originalShift.fullCirculations.find((c: any) => c.codi === selectedCircId);
                            if (!tc) return null;
                            const stations = [tc.inici, ...(tc.estacions?.map((s: any) => s.nom) || []), tc.final];
                            return stations.map((st: string, idx: number) => (
                              <button key={`${st}-${idx}`} onClick={() => { setSelectedStation(st); setPassengerResults([]); setAdjacentResults({anterior:[], posterior:[]}); setRestingResults([]); setExtensibleResults([]); setReserveInterceptResults([]); }} className={`p-3 rounded-xl border text-[10px] font-black uppercase transition-all ${selectedStation === st ? 'bg-fgc-green text-fgc-grey border-fgc-green shadow-md' : 'bg-white dark:bg-gray-800 text-gray-400 border-gray-100 dark:border-white/5 hover:border-fgc-green'}`}>{st}</button>
                            ));
                          })()}
                        </div>
                      </div>
                    )}
                    <button onClick={calculateRelief} disabled={calculating || !selectedStation} className="w-full bg-fgc-grey dark:bg-white text-white dark:text-fgc-grey py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl hover:scale-[1.02] active:scale-95 disabled:opacity-50">ANALITZAR COBERTURA</button>
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="bg-white dark:bg-gray-900 rounded-[32px] p-8 shadow-sm border border-gray-100 dark:border-white/5 min-h-[600px] space-y-8">
                  <div className="flex items-center gap-3 border-b border-gray-100 dark:border-white/5 pb-6"><Users size={20} className="text-fgc-green" /><h3 className="text-xl font-black text-fgc-grey dark:text-white uppercase tracking-tight">Personal Disponible</h3></div>
                  {calculating ? (<div className="py-20 flex flex-col items-center justify-center gap-4 opacity-30"><Loader2 size={48} className="animate-spin text-fgc-green" /><p className="text-xs font-black uppercase tracking-widest">Escanejant malla ferroviària...</p></div>) : (passengerResults.length > 0 || adjacentResults.anterior.length > 0 || adjacentResults.posterior.length > 0 || restingResults.length > 0 || extensibleResults.length > 0 || reserveInterceptResults.length > 0) ? (
                    <div className="space-y-10">
                      {passengerResults.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2"><Users size={14} className="text-blue-500" /> Viatgers al tren afectat</h3>
                          <div className="flex flex-col gap-2">
                            {passengerResults.map((t, i) => <CompactRow key={i} torn={t} color="border-l-blue-500" />)}
                          </div>
                        </div>
                      )}

                      {(adjacentResults.anterior.length > 0 || adjacentResults.posterior.length > 0) && (
                        <div className="space-y-3">
                          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2"><Users size={14} className="text-purple-500" /> Viatgers (Anterior / Posterior)</h3>
                          <div className="flex flex-col gap-2">
                            {adjacentResults.anterior.map((t, i) => <CompactRow key={`ant-${i}`} torn={t} color="border-l-purple-400" label={<span className="flex items-center gap-1 text-[8px] text-purple-600 font-black uppercase"><Rewind size={10} /> {t.adjCode} (Ant)</span>} />)}
                            {adjacentResults.posterior.map((t, i) => <CompactRow key={`post-${i}`} torn={t} color="border-l-purple-600" label={<span className="flex items-center gap-1 text-[8px] text-purple-600 font-black uppercase"><FastForward size={10} /> {t.adjCode} (Post)</span>} />)}
                          </div>
                        </div>
                      )}

                      {reserveInterceptResults.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2"><Repeat size={14} className="text-indigo-500" /> Intercepció de Reserves</h3>
                          <div className="flex flex-col gap-2">
                            {reserveInterceptResults.map((t, i) => <CompactRow key={i} torn={t} color="border-l-indigo-500" label={<span className="flex items-center gap-1 text-[8px] text-indigo-500 font-black uppercase tracking-widest"><Repeat size={10} /> {t.resData.resId}</span>} sub={`Intercepció proposada a ${t.resData.loc}`} />)}
                          </div>
                        </div>
                      )}

                      {restingResults.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2"><Coffee size={14} className="text-fgc-green" /> En descans a {selectedStation}</h3>
                          <div className="flex flex-col gap-2">
                            {restingResults.map((t, i) => <CompactRow key={i} torn={t} color="border-l-fgc-green" sub={`Lliure fins les ${formatFgcTime(t.restSeg.end)}`} />)}
                          </div>
                        </div>
                      )}

                      {extensibleResults.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2"><Timer size={14} className="text-orange-500" /> Perllongaments de Jornada</h3>
                          <div className="flex flex-col gap-2">
                            {extensibleResults.map((t, i) => <CompactRow key={i} torn={t} color="border-l-orange-500" sub={`Retorn estimat: ${formatFgcTime(t.extData.estimatedReturn)}`} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : selectedStation ? (
                    <div className="py-20 text-center space-y-4 opacity-40">
                      <div className="w-16 h-16 bg-gray-100 dark:bg-black/20 rounded-full flex items-center justify-center mx-auto text-gray-300 dark:text-gray-700"><Info size={28} /></div>
                      <p className="text-sm font-bold text-gray-500 max-w-[280px] mx-auto">Cap maquinista detectat en disposició de cobrir el relleu a {selectedStation}.</p>
                    </div>
                  ) : (
                    <div className="py-20 text-center space-y-4 opacity-40">
                      <div className="w-20 h-20 bg-gray-50 dark:bg-black/20 rounded-full flex items-center justify-center mx-auto text-gray-200 dark:text-gray-800"><User size={40} /></div>
                      <p className="text-sm font-bold text-gray-400 uppercase tracking-widest italic">Selecciona un punt de relleu</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {altServiceIsland && <AlternativeServiceOverlay islandId={altServiceIsland} />}
      {mode === 'INIT' && !loading && (<div className="py-32 text-center opacity-10 flex flex-col items-center"><ShieldAlert size={100} className="text-fgc-grey mb-8" /><p className="text-xl font-black uppercase tracking-[0.4em] text-fgc-grey">Centre de Gestió Operativa</p></div>)}
    </div>
  );
};

export default IncidenciaView;