import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Phone, Train, X, Timer, Layers, Plus, Minus, Wand2,
  ArrowRight, Activity, FilePlus, ArrowDownToLine, ArrowUpToLine,
  Repeat, Users, Zap, CheckCircle2, LayoutGrid, Construction, Info,
  TrendingUp, ZoomIn, ZoomOut, RotateCcw, Move, User, ShieldAlert, Loader2
} from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { supabase } from '../../supabaseClient';
import {
  resolveStationId, isServiceVisible, mainLiniaForFilter,
  S1_STATIONS, S2_STATIONS, L6_STATIONS, L7_STATIONS, L12_STATIONS, LINIA_STATIONS,
  getLiniaColorHex, getFgcMinutes, formatFgcTime, getTravelTime, LINE_COLORS
} from '../../utils/stations';
import type { LivePersonnel, ParkedUnit } from '../../types';
import GlassPanel from '../../components/common/GlassPanel';
import { getFullPath } from './mapUtils';
import { MAP_STATIONS, MAP_SEGMENTS } from './mapConstants';

// ──────────────────────────────────────────────
// Tipos para las props del componente extraído
// ──────────────────────────────────────────────

interface DividedPersonnelIsland {
  label: string;
  stations: Set<string>;
  list: LivePersonnel[];
}

export interface AlternativeServiceOverlayProps {
  islandId: string;
  dividedPersonnel: Record<string, DividedPersonnelIsland> | null;
  selectedServei: string;
  allShifts: any[];
  displayMin: number;
  showToast: (msg: string, type?: string) => void;
  onClose: () => void;
  isPrivacyMode: boolean;
  parkedUnits: ParkedUnit[];
  selectedCutSegments: Set<string>;
}

// ──────────────────────────────────────────────
// Componente principal (antes anidado dentro de IncidenciaView)
// ──────────────────────────────────────────────

const AlternativeServiceOverlay: React.FC<AlternativeServiceOverlayProps> = ({
  islandId,
  dividedPersonnel,
  selectedServei,
  allShifts,
  displayMin,
  showToast,
  onClose,
  isPrivacyMode,
  parkedUnits,
  selectedCutSegments
}) => {
  const [viewMode, setViewMode] = useState<'RESOURCES' | 'CIRCULATIONS' | 'SHIFTS' | 'GRAPH'>('RESOURCES');
  const [lineFilters, setLineFilters] = useState<string[]>(['Tots']);

  const toggleLineFilter = (ln: string) => {
    if (ln === 'Tots') {
      setLineFilters(['Tots']);
      return;
    }
    setLineFilters(prev => {
      const next = prev.includes(ln)
        ? prev.filter(x => x !== ln)
        : [...prev.filter(x => x !== 'Tots'), ln];
      return next.length === 0 ? ['Tots'] : next;
    });
  };
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
  const [lineHeadways, setLineHeadways] = useState<Record<string, number | null>>({
    S1: 15, S2: 15, L6: 15, L7: 15, L12: 15
  });
  const [enabledLines, setEnabledLines] = useState<Record<string, boolean>>({
    S1: true, S2: true, L6: true, L7: true, L12: true
  });
  const [normalLines, setNormalLines] = useState<Record<string, boolean>>({
    S1: false, S2: false, L6: false, L7: false, L12: false
  });
  const [isInitializedFor, setIsInitializedFor] = useState<string | null>(null);

  // Initial calculation for reasonable defaults
  useEffect(() => {
    if (isInitializedFor === islandId) return;

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

    // 1. Assignació L12: 1 tren per defecte si està disponible
    if (enabledLines.L12 && canSupportL12) {
      if (avTrains > 0 && avDrivers > 0) tryInc("L12");
    }

    // 2. Assignació L7: Tots els trens que hi hagi actualment en l'illa
    if (enabledLines.L7 && (canSupportL7Full || canSupportL7Local)) {
      const l7TrainsInIsland = physicalTrains.filter(t => t.linia === 'L7' || t.linia === '300').length;
      for (let i = 0; i < l7TrainsInIsland; i++) {
        if (avTrains > 0 && avDrivers > 0) tryInc("L7");
      }
    }

    // 3. Assignació L6: Tots els trens que hi hagi actualment en l'illa
    if (enabledLines.L6 && canSupportL6) {
      const l6TrainsInIsland = physicalTrains.filter(t => t.linia === 'L6').length;
      for (let i = 0; i < l6TrainsInIsland; i++) {
        if (avTrains > 0 && avDrivers > 0) tryInc("L6");
      }
    }

    // 4. Assignació Restant: Repartit equitativament entre S1 i S2
    let cycle = 0;
    while (avTrains > 0 && avDrivers > 0 && cycle < 30) {
      let changed = false;
      if (canSupportS1 && canSupportS2 && enabledLines.S1 && enabledLines.S2) {
        if (avTrains >= 2 && avDrivers >= 2) {
          tryInc("S1");
          tryInc("S2");
          changed = true;
        }
      } else if (canSupportS1 && enabledLines.S1) {
        if (tryInc("S1")) changed = true;
      } else if (canSupportS2 && enabledLines.S2) {
        if (tryInc("S2")) changed = true;
      }
      if (!changed) break;
      cycle++;
    }

    // Fallback if nothing assigned but resources available
    if (Object.values(initial).reduce((a, b) => a + b, 0) === 0 && avTrains > 0 && avDrivers > 0) {
      if (canSupportS1 && enabledLines.S1) initial.S1 = 1;
      else if (canSupportS2 && enabledLines.S2) initial.S2 = 1;
      else if ((canSupportL7Full || canSupportL7Local) && enabledLines.L7) initial.L7 = 1;
      else if (canSupportL6 && enabledLines.L6) initial.L6 = 1;
      else if (canSupportL12 && enabledLines.L12) initial.L12 = 1;
    }

    setLineCounts(initial);
    setIsInitializedFor(islandId);
  }, [islandId, physicalTrains.length, allDrivers.length, isInitializedFor]);

  const updateCount = (linia: string, delta: number) => {
    setLineCounts(prev => {
      let updates: Record<string, number> = { [linia]: Math.max(0, prev[linia] + delta) };

      // Mantenir mateixa quantitat de S1 i S2 si l'illa suporta ambdues i estan habilitades
      if ((linia === 'S1' || linia === 'S2') && canSupportS1 && canSupportS2 && enabledLines.S1 && enabledLines.S2) {
        const val = updates[linia];
        updates = { S1: val, S2: val };
      }

      const nextState = { ...prev, ...updates };
      const total = Object.values(nextState).reduce((sum, v) => sum + v, 0);

      // Block if exceeding total physical trains or total drivers
      if (total > physicalTrains.length || total > allDrivers.length) {
        return prev;
      }
      return nextState;
    });
  };

  const updateHeadway = (linia: string, delta: number) => {
    setLineHeadways(prev => ({
      ...prev,
      [linia]: Math.max(1, (prev[linia] || 15) + delta)
    }));
  };

  const toggleLine = (linia: string) => {
    setEnabledLines(prev => {
      const next = !prev[linia];
      if (!next) {
        setLineCounts(c => ({ ...c, [linia]: 0 }));
      }
      return { ...prev, [linia]: next };
    });
  };

  const toggleNormal = (linia: string) => {
    setNormalLines(prev => ({ ...prev, [linia]: !prev[linia] }));
  };

  const shuttlePlan = useMemo(() => {
    // 4.5: Integrar parked_units y control de flota
    const availableTrains = [...physicalTrains];

    // Añadir trenes estacionados en los depósitos de la isla
    if (parkedUnits && parkedUnits.length > 0) {
      const relevantDepots = new Set(['PC', 'RE', 'COR', 'NA', 'PN', 'RB', 'SC', 'GR'].filter(d => islandStations.has(d)));
      parkedUnits.forEach(u => {
        if (relevantDepots.has(u.depot_id)) {
          // Verificar que no esté ya en physicalTrains (aunque parkedUnits deberían ser solo estacionados)
          if (!availableTrains.some(t => t.id === u.unit_number.toString())) {
            availableTrains.push({
              type: 'TRAIN',
              id: u.unit_number.toString(),
              linia: 'S/L',
              stationId: u.depot_id,
              color: '#9ca3af', // Gris claro para material en reserva
              driver: 'SENSE MAQUINISTA',
              torn: '---',
              shiftStart: '--:--', shiftEnd: '--:--',
              shiftStartMin: 0, shiftEndMin: 0,
              shiftDep: u.depot_id,
              servei: '0',
              phones: [],
              inici: u.depot_id, final: u.depot_id,
              via_inici: u.track.toString(), via_final: u.track.toString(),
              horaPas: '--:--',
              x: 0, y: 0, // No importa para el plan
              isMoving: false
            });
          }
        }
      });
    }

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
    }

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

    // Priority Groups order: High (S1, S2) -> Medium (L7) -> Low (L6, L12)
    const priorityGroups = [
      { lines: ['S1', 'S2'], priority: 'ALTA' },
      { lines: ['L7'], priority: 'MITJA' },
      { lines: ['L6', 'L12'], priority: 'BAIXA' }
    ];

    priorityGroups.forEach(group => {
      let anyRemaining = true;
      const assignedInGroup = group.lines.map(() => 0);
      while (anyRemaining) {
        anyRemaining = false;
        group.lines.forEach((linia, idx) => {
          if (assignedInGroup[idx] < (lineCounts[linia] || 0)) {
            const route = getRouteForLinia(linia);
            if (tryAssign(route, group.priority, linia)) {
              assignedInGroup[idx]++;
              anyRemaining = true;
            }
          }
        });
      }
    });

    return formedServices;
  }, [lineCounts, physicalTrains, allDrivers, canSupportL7Full]);

  const handleGenerateCirculations = async () => {
    setGenerating(true);
    setViewMode('CIRCULATIONS');

    const REST_STATIONS = ['PC', 'SR', 'RE', 'TB', 'NA', 'PN', 'RB'];

    try {
      let theoryCircs: any[] = [];
      let fromIdx = 0;
      while (true) {
        const { data: batch } = await supabase.from('circulations').select('*').range(fromIdx, fromIdx + 999);
        if (!batch || batch.length === 0) break;
        theoryCircs = theoryCircs.concat(batch);
        if (batch.length < 1000) break;
        fromIdx += 1000;
      }
      if (theoryCircs.length === 0) {
        showToast("No s'han pogut carregar circulacions teòriques", "error");
        return;
      }

      const liniaPrefixes: Record<string, string> = { 'S1': 'D', 'S2': 'F', 'L6': 'A', 'L7': 'B', 'L12': 'L' };
      const liniaStationsRef = LINIA_STATIONS;

      // Optimized lookup maps
      const circIdToService: Record<string, string> = {};
      const circIdToShiftId: Record<string, string> = {};
      allShifts.forEach(s => {
        (s.circulations as any[] || []).forEach(cRef => {
          const codi = (typeof cRef === 'string' ? cRef : cRef?.codi)?.toUpperCase().trim() || '';
          if (codi) {
            circIdToService[codi] = (s.servei || '').toString();
            circIdToShiftId[codi] = s.id;
          }
        });
      });

      // NORMATIVA LABORAL BV — Línia Barcelona-Vallès
      const TURNAROUND_TERM = 6; // minutes at each terminus for cab maneuver
      const N_LABORAL = {
        CAB_CHANGE: 3,          // Canvi de cabina (totes les estacions)
        HANDOVER: 7,            // Relevo (Rubí, Sarrià)
        MAX_DRIVE: 120,         // Màx. conducció continuada sense pausa (2h)
        MIN_BREAK: 10,          // Descans mínim obligatori després de MAX_DRIVE
        MAIN_BREAK: 35,         // Descans principal ("àpat") per torn sencer
        MAIN_BREAK_PARTIAL: 15, // Descans principal per torn parcial (6h)
        MIN_TOTAL_REST: 90,     // Suma mínima descansos torn sencer
        MIN_TOTAL_REST_PARTIAL_6: 45, // Suma mínima desc. torn parcial 6h
        NON_COMPUTE_THRESHOLD: 15, // Períodes < 15 min no computen com a descans
        DEADHEAD_REST_FACTOR: 0.5, // Viatje en via morta ≥15 min: 50% descans
        PASSENGER_REST_FACTOR: 0.66, // Com a viatger ≥15 min: 66% descans
        // Temps inici/final de servei per cotxera/dependència
        SETUP: {
          'PC': { withStartup: 7, withoutStartup: 7 }, // General
          'NA': { withStartup: 23, withoutStartup: 18 }, // Cocheras Terrassa N.U.
          'PN': { withStartup: 19, withoutStartup: 14 }, // Cocheras Sabadell P.N.
          'RB': { withStartup: 7, withoutStartup: 7 }, // Rubí estació
          'COR': { withStartup: 23, withoutStartup: 18 }, // Rubí COR
          'RE': { withStartup: 30, withoutStartup: 30 }, // Reina Elisenda
          'SR': { withStartup: 7, withoutStartup: 7 }, // Sarrià
          'SC': { withStartup: 7, withoutStartup: 7 }, // Sant Cugat
          'GR': { withStartup: 7, withoutStartup: 7 }, // Gràcia
          'TB': { withStartup: 7, withoutStartup: 7 }, // Terrassa
        } as Record<string, { withStartup: number; withoutStartup: number }>,
        // Canvi de material per estació
        TRAIN_CHANGE: {
          'DEFAULT': 6,
          'COR': 30,  // Rubí COR
          'RE': 10,  // Reina Elisenda
          'GR': 3,   // Gràcia (a partir de les 00:00h)
        } as Record<string, number>,
        // Temps a peu entre dependències
        WALK: {
          'RB-COR': 12, 'COR-RB': 12,
          'NA-TNU': 11, 'TNU-NA': 11,
          'PN-SPN': 6, 'SPN-PN': 6,
          'RE-ZM': 10, 'ZM-RE': 10,  // Reina Elisenda <-> Zona Maniobres
          'SR-V0': 10, 'V0-SR': 10,  // Sarrià Via 0
        } as Record<string, number>,
      };

      // Helper: get train change time for a station
      const getTrainChangeTime = (station: string, timeMin: number): number => {
        if (station === 'GR' && timeMin >= 1440) return N_LABORAL.TRAIN_CHANGE['GR'];
        return N_LABORAL.TRAIN_CHANGE[station] ?? N_LABORAL.TRAIN_CHANGE['DEFAULT'];
      };

      // Helper: get setup time for a home depot
      const getSetupTime = (depot: string, hasStartup = true): number => {
        const entry = N_LABORAL.SETUP[depot];
        if (!entry) return 7;
        return hasStartup ? entry.withStartup : entry.withoutStartup;
      };

      // Helper: get walk time between two points
      const getWalkTime = (from: string, to: string): number => {
        const key = `${from}-${to}`;
        return N_LABORAL.WALK[key] ?? 0;
      };

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

      // Initialize Driver Pool with correct BV normativa setup times per home depot
      let driverPool: any[] = allDrivers.map(d => {
        const shiftNum = parseInt(d.torn?.replace(/\D/g, '') || '0');
        let homeStation = 'PC'; // Default (Plaça Catalunya / Provença area)
        if (shiftNum >= 100 && shiftNum < 200) homeStation = 'SR';  // Sarrià branch
        else if (shiftNum >= 200 && shiftNum < 300) homeStation = 'RB';  // Rubí
        else if (shiftNum >= 300 && shiftNum < 400) homeStation = 'NA';  // Terrassa N.U.
        else if (shiftNum >= 400 && shiftNum < 500) homeStation = 'PN';  // Sabadell P.N.

        const startMin = getFgcMinutes(d.shiftStart) || displayMin;
        const endMin = getFgcMinutes(d.shiftEnd) || 1620;

        // BV Norm 1: Max shift duration = 8h 45min (525 min) from start
        const extensionLimit = startMin + 525;

        // BV Norm 6: Setup time at start of service depends on home depot
        // For emergency service we assume trains already started (without UT startup)
        const setupTime = getSetupTime(homeStation, false);

        // Driver is available at: max(displayMin, shiftStart + setupTime already elapsed)
        // If driver already started (startMin < displayMin), they're already deployed
        const effectiveAvailAt = startMin < displayMin
          ? displayMin   // already on shift, available now
          : startMin + setupTime; // just starting, needs setup time

        // Accumulated driving time already done before the incident (approximate)
        const alreadyDriven = Math.max(0, displayMin - startMin);
        // Simplified: assume half their pre-incident time was actual driving
        const contDriveAtStart = Math.min(N_LABORAL.MAX_DRIVE, Math.floor(alreadyDriven * 0.5));

        // Main break: if driver has been on shift > 2.5h, they may have had their break
        const shiftHoursElapsed = (displayMin - startMin) / 60;
        const mainBreakLikelyTaken = shiftHoursElapsed > 3.5;

        return {
          ...d,
          currentStation: d.stationId || homeStation,
          availableAt: effectiveAvailAt,
          activeShiftEnd: endMin,
          shiftExtensionLimit: extensionLimit,
          activeShiftStart: startMin,
          activeShiftDep: homeStation,
          setupTime,
          tripCount: 0,
          contDrive: contDriveAtStart,
          mainBreakTaken: mainBreakLikelyTaken,
          accumulatedRest: 0,   // Sum of rest periods ≥ 15 min
          lastArrival: displayMin,
          currentTrain: null
        };
      });

      const DEPOT_NODES = ['PC', 'RE', 'COR', 'NA', 'PN', 'RB', 'SC', 'GR'];
      const islandDepots = DEPOT_NODES.filter(d => islandStations.has(d));

      const LINE_ORDER = ['S1', 'S2', 'L7', 'L6', 'L12'];

      // Helper to find next maneuver number for maneuvers (V, T or X) (800-999)
      let lastManeuverNum = 799;
      (theoryCircs as any[]).forEach(c => {
        if (c.id.startsWith('V') || c.id.startsWith('T') || c.id.startsWith('X')) {
          const n = parseInt(c.id.replace(/\D/g, ''));
          if (n >= 800 && n <= 999 && n > lastManeuverNum) lastManeuverNum = n;
        }
      });

      // 0. Process Normal Mode Lines (Including maneuvers and passenger-only trips)
      const shiftsToIncludeNorm = new Set<string>();
      LINE_ORDER.forEach(liniaCode => {
        if (!normalLines[liniaCode] || !enabledLines[liniaCode]) return;
        (theoryCircs as any[]).forEach(c => {
          if (c.linia === liniaCode) {
            const sId = circIdToShiftId[c.id.toUpperCase().trim()];
            if (sId) shiftsToIncludeNorm.add(sId);
          }
        });
      });

      shiftsToIncludeNorm.forEach(shiftId => {
        const shift = allShifts.find(s => s.id === shiftId);
        if (!shift || !isServiceVisible(shift.servei, selectedServei)) return;
        const shiftService = (shift.servei || '').toString();
        const assignedD = driverPool.find(dp => dp.torn === shift.id);

        (shift.circulations as any[]).forEach(cRef => {
          const codi = (typeof cRef === 'string' ? cRef : cRef?.codi) || '';
          if (!codi) return;

          let circ = (theoryCircs as any[]).find(tc => tc.id === codi);
          if (!circ && codi === 'VIATGER' && typeof cRef === 'object') {
            circ = { ...cRef, id: 'VIATGER', linia: 'V' };
          }
          if (!circ) return;

          const mStart = getFgcMinutes(circ.sortida);
          const mEnd = getFgcMinutes(circ.arribada);
          if (mStart === null || mStart < displayMin) return;

          const hasTouch = [circ.inici, circ.final, ...(circ.estacions?.map((s: any) => s.nom) || [])].some(st => islandStations.has(st));
          if (!hasTouch) return;

          const isManeuver = circ.id.startsWith('V') || circ.id.startsWith('T') || circ.id.startsWith('X');
          const isViatger = circ.id === 'VIATGER';

          plan.push({
            id: circ.id,
            servei: shiftService,
            linia: circ.linia || '---',
            train: 'TREN GRÀFIC',
            driver: assignedD ? assignedD.driver : 'SENSE MAQUINISTA (NORMAL)',
            torn: shift.id,
            isManeuver,
            isViatger,
            shiftStart: assignedD?.shiftStart || '--:--',
            shiftEnd: assignedD?.shiftEnd || '--:--',
            sortida: circ.sortida,
            arribada: circ.arribada,
            route: (circ as any).route || `${circ.inici} → ${circ.final}`,
            direction: isManeuver ? 'MANIOBRA' : (isViatger ? 'VIATGER' : (parseInt(circ.id.replace(/\D/g, '') || '1') % 2 === 0 ? 'DESCENDENT' : 'ASCENDENT')),
            startTimeMinutes: mStart,
            numValue: parseInt(circ.id.replace(/\D/g, '') || '0') || 900,
            isNormal: true,
            delay: 0,
            prevId: 'GRÀFIC',
            nextId: 'GRÀFIC'
          });

          if (assignedD && mEnd !== null) {
            assignedD.availableAt = Math.max(assignedD.availableAt, mEnd + 2);
            assignedD.currentStation = circ.final;
            assignedD.tripCount++;
          }
        });
      });

      const lineContexts: Record<string, any> = {};

      // 1. Prepare data for each line (Only alternative ones)
      LINE_ORDER.forEach(liniaCode => {
        if (!enabledLines[liniaCode] || normalLines[liniaCode]) return;
        const count = lineCounts[liniaCode];
        if (count === 0) return;
        const eps = getEndpoints(liniaStationsRef[liniaCode]);
        if (!eps) return;

        const prefix = liniaPrefixes[liniaCode];
        const areaTheory = (theoryCircs as any[]).filter(c => mainLiniaForFilter(c.linia) === liniaCode);
        let maxAscStartedNum = 0, maxDescStartedNum = 0;
        let maxAscTime = 0, maxDescTime = 0;

        areaTheory.forEach(c => {
          // Filter by selected service
          const shiftServ = circIdToService[c.id.toUpperCase().trim()] || '';
          if (!isServiceVisible(shiftServ, selectedServei)) return;

          const n = parseInt(c.id.replace(/\D/g, '')) || 0;
          const isAsc = n % 2 !== 0;
          const m = getFgcMinutes(c.sortida);

          if (m !== null) {
            if (m <= displayMin) {
              if (isAsc && n > maxAscStartedNum) maxAscStartedNum = n;
              else if (!isAsc && n > maxDescStartedNum) maxDescStartedNum = n;
            }
            // Only consider trips WITH PASSENGERS (Ignore maneuvers V, T, X)
            const isManeuver = c.id.startsWith('V') || c.id.startsWith('T') || c.id.startsWith('X');
            if (!isManeuver) {
              if (isAsc && m > maxAscTime) maxAscTime = m;
              if (!isAsc && m > maxDescTime) maxDescTime = m;
            }
          }
        });

        if (maxAscTime === 0 && maxDescTime === 0) {
          maxAscTime = 1620;
          maxDescTime = 1620;
        }
        const maxLineTime = Math.max(maxAscTime, maxDescTime);

        let refTravelTime = 15;
        const sample = areaTheory.filter(c => {
          const stops = [c.inici, ...(c.estacions?.map((s: any) => s.nom) || []), c.final].map(s => resolveStationId(s));
          return stops.includes(eps.start) && stops.includes(eps.end);
        }).sort((a, b) => (getFgcMinutes(b.sortida) || 0) - (getFgcMinutes(a.sortida) || 0))[0];

        // 4.3: Cálculo preciso de tiempos de viaje usando promedios reales de la malla
        let totalTravelMins = 0;
        let countValid = 0;

        areaTheory.forEach(c => {
          const stops = [c.inici, ...(c.estacions?.map((s: any) => s.nom) || []), c.final].map(s => resolveStationId(s));
          const idx1 = stops.indexOf(eps.start);
          const idx2 = stops.indexOf(eps.end);

          if (idx1 !== -1 && idx2 !== -1) {
            const times = [c.sortida, ...(c.estacions?.map((s: any) => s.hora || s.sortida) || []), c.arribada];
            const t1 = getFgcMinutes(times[idx1]);
            const t2 = getFgcMinutes(times[idx2]);

            if (t1 !== null && t2 !== null) {
              const diff = Math.abs(t2 - t1);
              // Filtrar outliers obvios (ej. menos de 2 min para tramos largos o mas de 60)
              if (diff > 2 && diff < 60) {
                totalTravelMins += diff;
                countValid++;
              }
            }
          }
        });

        if (countValid > 0) {
          refTravelTime = Math.ceil(totalTravelMins / countValid);
        } else if (sample) {
          const stops = [sample.inici, ...(sample.estacions?.map((s: any) => s.nom) || []), sample.arribada];
          const times = [sample.sortida, ...(sample.estacions?.map((s: any) => s.hora || s.sortida) || []), sample.arribada];
          const t1 = getFgcMinutes(times[stops.indexOf(eps.start)]), t2 = getFgcMinutes(times[stops.indexOf(eps.end)]);
          if (t1 !== null && t2 !== null) refTravelTime = Math.abs(t2 - t1);
        } else {
          // Fallback: Interpolación lineal basada en distancia (nodos) * 3 min
          refTravelTime = Math.max(8, (getFullPath(eps.start, eps.end).length - 1) * 3);
        }

        const shuttlePath = getFullPath(eps.start, eps.end);
        let vuPenalty = 0;
        for (let i = 0; i < shuttlePath.length - 1; i++) {
          const u = shuttlePath[i], v = shuttlePath[i + 1];
          if ((selectedCutSegments.has(`${u}-${v}-V1`) || selectedCutSegments.has(`${v}-${u}-V1`)) !== (selectedCutSegments.has(`${u}-${v}-V2`) || selectedCutSegments.has(`${v}-${u}-V2`))) vuPenalty += 5;
        }
        refTravelTime += vuPenalty;

        const branchUnits = (resourcesByLinia[liniaCode] || []).map(u => ({
          ...u,
          currentDriverId: u.driver ? u.driver.torn : null,
          availableAt: displayMin, // Disponibilitat inicial
          currentStation: u.driver ? (u.driver.stationId || 'PC') : 'PC' // Estació inicial
        }));

        const numUnits = Math.max(1, branchUnits.length);
        const clampedTravel = Math.min(60, Math.max(5, refTravelTime));

        // ── AUTO FREQUENCY CALCULATION based on driver capacity ──────────────────
        // Physics minimum: time for full round trip divided by fleet size
        const fullCyclePhysics = 2 * (clampedTravel + TURNAROUND_TERM);
        const physicsHeadway = fullCyclePhysics / numUnits;

        // Calculate total one-way trips all available drivers can cover
        // (accounting for BV mandatory breaks and shift limits)
        let totalDriverTripCapacity = 0;
        driverPool.forEach(d => {
          const shiftEndLimit = Math.max(d.activeShiftEnd, d.shiftExtensionLimit || 0);
          const driverWindowStart = Math.max(displayMin, d.availableAt);
          const driverWindowEnd = shiftEndLimit;
          const rawWindow = Math.max(0, driverWindowEnd - driverWindowStart);
          if (rawWindow <= 0) return;

          // Deduct mandatory main break from effective working time:
          // BV Norm 2: 35 min break must happen between hour 2.5 and 5.5 of shift.
          // If driver hasn't taken it yet and the window crosses that period, deduct 35 min.
          const hoursFromShiftStart = (driverWindowStart - d.activeShiftStart) / 60;
          const requiresMainBreakInWindow =
            !d.mainBreakTaken &&
            hoursFromShiftStart < 5.5 &&  // break window not yet past
            rawWindow > 30;                // enough time left for it to matter
          const breakDeduction = requiresMainBreakInWindow ? N_LABORAL.MAIN_BREAK : 0;

          // Also deduct compulsory 10-min rest if continuous driving near limit
          const continuousBreaks = d.contDrive > N_LABORAL.MAX_DRIVE - clampedTravel
            ? N_LABORAL.MIN_BREAK : 0;

          const effectiveWorkTime = Math.max(0, rawWindow - breakDeduction - continuousBreaks);

          // Each one-way trip costs: travel time + turnaround at destination
          // (BV Norm 6: TURNAROUND_TERM covers cab change + readiness)
          const tripsThisDriver = Math.floor(effectiveWorkTime / (clampedTravel + TURNAROUND_TERM));
          totalDriverTripCapacity += tripsThisDriver;
        });

        // How many one-way trip slots would physics headway generate across service window?
        const serviceWindow = Math.max(0, maxLineTime - displayMin);
        const physicsSlots = numUnits * Math.floor(serviceWindow / (clampedTravel + TURNAROUND_TERM));

        let optimalHeadway: number;
        if (totalDriverTripCapacity === 0) {
          // No drivers available — use physics minimum, all marked SENSE MAQUINISTA
          optimalHeadway = physicsHeadway;
        } else if (totalDriverTripCapacity >= physicsSlots * 0.9) {
          // Enough drivers: run at maximum physics frequency (full coverage)
          optimalHeadway = physicsHeadway;
        } else {
          // Driver-limited: widen headway so trips ≤ driver capacity
          // totalDriverTripCapacity = numUnits * serviceWindow / headway (approx)
          // → headway = numUnits * serviceWindow / totalDriverTripCapacity
          const driverHeadway = (numUnits * serviceWindow) / totalDriverTripCapacity;
          optimalHeadway = Math.max(physicsHeadway, driverHeadway);
        }

        // Round to nearest minute and enforce absolute minimum of 5 min
        const headway = Math.max(5, Math.round(optimalHeadway));

        lineContexts[liniaCode] = {
          eps, prefix,
          refTravelTime: clampedTravel,
          headway,          // auto-computed or physics-based
          physicsHeadway,   // kept for reference
          maxLineTime, maxAscTime, maxDescTime,
          nextAscNum: maxAscStartedNum + 2, nextDescNum: maxDescStartedNum + 2,
          branchUnits,
          nextStartTimeAsc: displayMin + 2,
          nextStartTimeDesc: displayMin + 2 + Math.floor(headway / 2)
        };
      });

      // 2. Create trip slots for all lines — one unit at a time, sequential round-trip
      const tripSlots: any[] = [];
      Object.entries(lineContexts).forEach(([liniaCode, ctx]) => {
        const numUnits = Math.max(1, ctx.branchUnits.length);

        // Full cycle for ONE unit = outbound + turnaround + return + turnaround
        const fullCycleTime = 2 * (ctx.refTravelTime + TURNAROUND_TERM);

        // True stagger = evenly spread units so frequency is constant throughout service
        const trueStagger = fullCycleTime / numUnits;

        ctx.branchUnits.forEach((u: any, uIdx: number) => {
          const staggerOffset = Math.round(uIdx * trueStagger);
          let currentTime = ctx.nextStartTimeAsc + staggerOffset;
          let currentStation = ctx.eps.start;
          let goingToEnd = true; // first leg: start → end

          while (currentTime < ctx.maxLineTime) {
            const origin = currentStation;
            const dest = goingToEnd ? ctx.eps.end : ctx.eps.start;
            const isTechnical = goingToEnd
              ? currentTime >= ctx.maxAscTime
              : currentTime >= ctx.maxDescTime;

            tripSlots.push({
              liniaCode,
              isAsc: goingToEnd,
              idealStartTime: currentTime,
              origin,
              dest,
              unitIdx: uIdx,
              isTechnical
            });

            // Advance: travel time + turnaround at destination terminal
            currentTime += ctx.refTravelTime + TURNAROUND_TERM;
            currentStation = dest;
            goingToEnd = !goingToEnd;
          }
        });
      });

      // 3. Ensure S1/S2 trip parity (Equal quantity of trips)
      if (canSupportS1 && canSupportS2) {
        const s1Count = tripSlots.filter(s => s.liniaCode === 'S1').length;
        const s2Count = tripSlots.filter(s => s.liniaCode === 'S2').length;
        const target = Math.min(s1Count, s2Count);
        let cS1 = 0, cS2 = 0;
        const filtered = [];
        for (const s of tripSlots) {
          if (s.liniaCode === 'S1') { if (cS1 < target) { filtered.push(s); cS1++; } }
          else if (s.liniaCode === 'S2') { if (cS2 < target) { filtered.push(s); cS2++; } }
          else filtered.push(s);
        }
        tripSlots.length = 0; tripSlots.push(...filtered);
      }

      // 4. Assign drivers chronologically — unit schedule is fixed, only driver varies
      tripSlots.sort((a, b) => a.idealStartTime - b.idealStartTime);
      tripSlots.forEach(slot => {
        const ctx = lineContexts[slot.liniaCode];
        // The unit for this slot is already determined by unitIdx from section 2
        const unitObj = ctx.branchUnits[slot.unitIdx];
        if (!unitObj) return;

        // The departure time is fixed by the physical unit's cycle (section 2)
        const startTime = slot.idealStartTime;
        const endTime = startTime + ctx.refTravelTime;

        // Find the best available driver for this slot — full BV normativa check
        const selectedCandidate = driverPool.map(d => {
          const isAtStation = d.currentStation === slot.origin;
          const isSameUnit = unitObj.currentDriverId === d.torn;

          // ── BV Norm 6: Technical times ──────────────────────────────────────────
          let techTime = 0;
          if (isSameUnit) {
            // Same cab: only cab-change time (driver flips sides)
            techTime = N_LABORAL.CAB_CHANGE;
          } else if (isAtStation) {
            // Different train at the same station: train-change time
            techTime = getTrainChangeTime(slot.origin, startTime);
          } else {
            // Driver must walk to origin station
            const walkLookup = getWalkTime(d.currentStation, slot.origin);
            if (walkLookup > 0) {
              techTime = walkLookup + getTrainChangeTime(slot.origin, startTime);
            } else {
              // Generic walking estimate: 4 min per graph node
              const pathLen = getFullPath(d.currentStation, slot.origin).length;
              techTime = Math.max(10, (pathLen - 1) * 4);
            }
          }

          // ── BV Norm 5: Continuous driving limit (2h max without 10-min break) ───
          const drivingLimitMet = (d.contDrive || 0) + ctx.refTravelTime > N_LABORAL.MAX_DRIVE;

          // ── BV Norm 2: Main break window (between h2.5 and h5.5 of shift) ────────
          const hoursInShift = (startTime - d.activeShiftStart) / 60;
          const inMainBreakWindow = hoursInShift >= 2.5 && hoursInShift <= 5.5;
          const needsMainBreak = !d.mainBreakTaken && inMainBreakWindow;

          // ── Compute effective ready-time ─────────────────────────────────────────
          let driverReadyAt = d.availableAt + techTime;
          if (drivingLimitMet) driverReadyAt += N_LABORAL.MIN_BREAK;     // +10 min
          if (needsMainBreak) driverReadyAt += N_LABORAL.MAIN_BREAK;    // +35 min

          // Driver must be physically ready before the train departs (±2 min tolerance)
          const driverCanMakeIt = driverReadyAt <= startTime + 2;

          // ── Anti-teleportation: after first trip driver must be at origin ─────────
          const canPerform = isAtStation || d.tripCount === 0;

          // ── BV Norm 1: Shift-end check (original end OR 8h45m extension) ─────────
          // Include travel time from last station back to home depot
          const retPathLen = getFullPath(slot.dest, d.activeShiftDep || 'PC').length;
          const returnDuration = Math.max(getWalkTime(slot.dest, d.activeShiftDep || ''),
            (retPathLen - 1) * 3);
          const shiftEndLimit = Math.max(d.activeShiftEnd, d.shiftExtensionLimit || 0);
          const isValid = driverCanMakeIt && canPerform &&
            endTime + returnDuration <= shiftEndLimit;

          return { driver: d, isValid, isAtStation, isSameUnit, needsMainBreak, drivingLimitMet };
        })
          .filter(c => c.isValid)
          .sort((a, b) => {
            // Prefer: same unit → at station → fewest trips (equitable load) → earliest available
            if (a.isSameUnit !== b.isSameUnit) return a.isSameUnit ? -1 : 1;
            if (a.isAtStation !== b.isAtStation) return a.isAtStation ? -1 : 1;
            if ((a.driver.tripCount || 0) !== (b.driver.tripCount || 0))
              return (a.driver.tripCount || 0) - (b.driver.tripCount || 0);
            return (a.driver.availableAt || 0) - (b.driver.availableAt || 0);
          })[0];

        const selectedDriver = selectedCandidate?.driver || null;
        const activeDriver = selectedDriver || { driver: 'SENSE MAQUINISTA (AVÍS)', torn: '---' };
        const tripNum = slot.isAsc ? ctx.nextAscNum : ctx.nextDescNum;
        if (slot.isAsc) ctx.nextAscNum += 2; else ctx.nextDescNum += 2;

        plan.push({
          id: `${ctx.prefix}A${tripNum.toString().padStart(3, '0')}`,
          delay: 0,
          servei: (activeDriver as any).servei,
          linia: slot.liniaCode,
          train: unitObj.train.id,
          driver: activeDriver.driver || (activeDriver as any).driverName,
          torn: activeDriver.torn,
          shiftStart: activeDriver.shiftStart || '--:--',
          shiftEnd: activeDriver.shiftEnd || '--:--',
          sortida: formatFgcTime(startTime),
          arribada: formatFgcTime(endTime),
          route: `${slot.origin} → ${slot.dest}`,
          direction: slot.isAsc ? 'ASCENDENT' : 'DESCENDENT',
          startTimeMinutes: startTime,
          numValue: tripNum
        });

        // Update unit state (unit always moves on schedule regardless of driver)
        unitObj.availableAt = endTime;
        unitObj.currentStation = slot.dest;
        if (selectedDriver) {
          unitObj.currentDriverId = selectedDriver.torn;
          selectedDriver.currentStation = slot.dest;
          selectedDriver.availableAt = endTime;
          selectedDriver.tripCount = (selectedDriver.tripCount || 0) + 1;

          // BV Norm 5: reset continuous driving if limit was met (driver had mandatory break)
          if (selectedCandidate!.drivingLimitMet) selectedDriver.contDrive = 0;
          selectedDriver.contDrive = (selectedDriver.contDrive || 0) + ctx.refTravelTime;

          // BV Norm 2: mark main break as taken and reset contDrive
          if (selectedCandidate!.needsMainBreak) {
            selectedDriver.mainBreakTaken = true;
            selectedDriver.contDrive = 0;
            selectedDriver.accumulatedRest = (selectedDriver.accumulatedRest || 0) + N_LABORAL.MAIN_BREAK;
          }

          // BV Norm rest accounting: turnaround at terminus counts as rest if >= 15 min
          if (TURNAROUND_TERM >= N_LABORAL.NON_COMPUTE_THRESHOLD) {
            selectedDriver.accumulatedRest = (selectedDriver.accumulatedRest || 0) + TURNAROUND_TERM;
          }
        } else {
          unitObj.currentDriverId = '---';
        }

        // L6 MANEUVER LOGIC AT SR
        if (slot.liniaCode === 'L6' && slot.isAsc && slot.dest === 'SR') {
          // 1. Maniobra SR v1 -> SR v0 (Impar/Odd)
          lastManeuverNum++;
          if (lastManeuverNum > 999) lastManeuverNum = 801;
          if (lastManeuverNum % 2 === 0) lastManeuverNum++;
          if (lastManeuverNum > 999) lastManeuverNum = 801;

          const m1Start = endTime + 2;
          const m1End = m1Start + 3;
          plan.push({
            id: `VA${lastManeuverNum}`, servei: (activeDriver as any).servei, linia: 'L6', train: unitObj.train.id,
            driver: activeDriver.driver || (activeDriver as any).driverName, torn: activeDriver.torn,
            sortida: formatFgcTime(m1Start), arribada: formatFgcTime(m1End),
            route: 'SR Via 1 → SR Via 0', direction: 'MANIOBRA', startTimeMinutes: m1Start, numValue: lastManeuverNum
          });

          // 2. Maniobra SR v0 -> SR v2 (Parell/Even)
          lastManeuverNum++;
          if (lastManeuverNum > 999) lastManeuverNum = 801;
          if (lastManeuverNum % 2 !== 0) lastManeuverNum++;
          if (lastManeuverNum > 999) lastManeuverNum = 802;

          const m2Start = m1End + 4;
          const m2End = m2Start + 3;
          plan.push({
            id: `VA${lastManeuverNum}`, servei: (activeDriver as any).servei, linia: 'L6', train: unitObj.train.id,
            driver: activeDriver.driver || (activeDriver as any).driverName, torn: activeDriver.torn,
            sortida: formatFgcTime(m2Start), arribada: formatFgcTime(m2End),
            route: 'SR Via 0 → SR Via 2', direction: 'MANIOBRA', startTimeMinutes: m2Start, numValue: lastManeuverNum
          });

          if (selectedDriver) {
            selectedDriver.availableAt = m2End;
            selectedDriver.currentStation = 'SR'; // Now at v2
          }
          unitObj.availableAt = m2End;
          unitObj.currentStation = 'SR';
        }

        // S1 MANEUVER LOGIC AT TERMINUS (NA)
        if (slot.liniaCode === 'S1' && slot.dest === 'NA') {
          // 1. NA v1 -> Zona Maniobres (Impar)
          lastManeuverNum++;
          if (lastManeuverNum > 999) lastManeuverNum = 801;
          if (lastManeuverNum % 2 === 0) lastManeuverNum++;
          if (lastManeuverNum > 999) lastManeuverNum = 801;

          const m1Start = endTime + 2;
          const m1End = m1Start + 3;
          plan.push({
            id: `TA${lastManeuverNum}`, servei: (activeDriver as any).servei, linia: 'S1', train: unitObj.train.id,
            driver: activeDriver.driver || (activeDriver as any).driverName, torn: activeDriver.torn,
            sortida: formatFgcTime(m1Start), arribada: formatFgcTime(m1End),
            route: 'NA Via 1 → Zona Maniobres', direction: 'MANIOBRA', startTimeMinutes: m1Start, numValue: lastManeuverNum
          });

          // 2. Zona Maniobres -> NA v2 (Parell)
          lastManeuverNum++;
          if (lastManeuverNum > 999) lastManeuverNum = 801;
          if (lastManeuverNum % 2 !== 0) lastManeuverNum++;
          if (lastManeuverNum > 999) lastManeuverNum = 802;

          const m2Start = m1End + 4;
          const m2End = m2Start + 3;
          plan.push({
            id: `TA${lastManeuverNum}`, servei: (activeDriver as any).servei, linia: 'S1', train: unitObj.train.id,
            driver: activeDriver.driver || (activeDriver as any).driverName, torn: activeDriver.torn,
            sortida: formatFgcTime(m2Start), arribada: formatFgcTime(m2End),
            route: 'Zona Maniobres → NA Via 2', direction: 'MANIOBRA', startTimeMinutes: m2Start, numValue: lastManeuverNum
          });
          if (selectedDriver) {
            selectedDriver.availableAt = m2End;
            selectedDriver.currentStation = 'NA';
          }
          unitObj.availableAt = m2End;
          unitObj.currentStation = 'NA';
        } else if (slot.liniaCode === 'S1' && (slot.dest === 'TR' || slot.dest === 'EN')) {
          // Single TA maneuver for other terminals
          lastManeuverNum++;
          if (lastManeuverNum > 999) lastManeuverNum = 801;
          const mStart = endTime + 2;
          const mEnd = mStart + 4;
          plan.push({
            id: `TA${lastManeuverNum}`, servei: (activeDriver as any).servei, linia: 'S1', train: unitObj.train.id,
            driver: activeDriver.driver || (activeDriver as any).driverName, torn: activeDriver.torn,
            sortida: formatFgcTime(mStart), arribada: formatFgcTime(mEnd),
            route: `${slot.dest} → ${slot.dest}`, direction: 'MANIOBRA', startTimeMinutes: mStart, numValue: lastManeuverNum
          });
          if (selectedDriver) {
            selectedDriver.availableAt = mEnd;
          }
          unitObj.availableAt = mEnd;
        }
      });

      // 5. Retirement/Retiro trips with assigned driver (only if matched with home base)
      Object.entries(lineContexts).forEach(([liniaCode, ctx]) => {
        const islandDepots = ['PC', 'RE', 'COR', 'NA', 'PN', 'RB', 'SC', 'GR'].filter(d => islandStations.has(d));
        ctx.branchUnits.forEach((u: any) => {
          const lastTrip = plan.filter(p => p.train === u.train.id).sort((a, b) => b.startTimeMinutes - a.startTimeMinutes)[0];
          const fromStation = lastTrip ? lastTrip.route.split(' → ')[1] : u.train.stationId;
          const arrival = lastTrip ? getFgcMinutes(lastTrip.arribada) || displayMin : displayMin;

          let targetDepot = '', minDistance = 999;
          islandDepots.forEach(dep => {
            const path = getFullPath(fromStation, dep);
            if (path.length > 0 && path.length < minDistance) {
              minDistance = path.length;
              targetDepot = dep;
            }
          });

          if (targetDepot && fromStation !== targetDepot) {
            const rStart = Math.max(arrival + 5, ctx.maxLineTime);
            const rTravel = Math.max(5, (minDistance - 1) * 3);
            const rEnd = rStart + rTravel;

            // Check if the last driver is from this home base
            let assignedDriver = 'MAQUINISTA DE RETIR';
            let assignedTorn = '---';
            let sStart = '--:--', sEnd = '--:--';

            if (lastTrip && lastTrip.torn) {
              const shiftNum = parseInt(lastTrip.torn.replace(/\D/g, '') || '0');
              let homeStation = 'PC';
              if (shiftNum >= 100 && shiftNum < 200) homeStation = 'SR';
              else if (shiftNum >= 200 && shiftNum < 300) homeStation = 'RB';
              else if (shiftNum >= 300 && shiftNum < 400) homeStation = 'NA';
              else if (shiftNum >= 400 && shiftNum < 500) homeStation = 'PN';

              // Only assign original driver if depot is home base and has shift time left (including extension)
              const limit = Math.max(getFgcMinutes(lastTrip.shiftEnd) || 1620, (getFgcMinutes(lastTrip.shiftStart) || 0) + 525);
              if (targetDepot === homeStation && rEnd <= limit) {
                assignedDriver = lastTrip.driver;
                assignedTorn = lastTrip.torn;
                sStart = lastTrip.shiftStart;
                sEnd = lastTrip.shiftEnd;
              }
            }

            let retireId = `V${u.train.id.replace(/\./g, '')}`;
            if (liniaCode === 'S1') {
              lastManeuverNum++;
              if (lastManeuverNum > 999) lastManeuverNum = 801;
              // Retiro a deposito (XA + impar)
              if (lastManeuverNum % 2 === 0) lastManeuverNum++;
              if (lastManeuverNum > 999) lastManeuverNum = 801;

              const prefix = targetDepot === 'NA' ? 'XA' : 'TA';
              retireId = `${prefix}${lastManeuverNum}`;
            }

            plan.push({
              id: retireId,
              linia: liniaCode,
              train: u.train.id,
              driver: assignedDriver,
              torn: assignedTorn,
              shiftStart: sStart,
              shiftEnd: sEnd,
              sortida: formatFgcTime(rStart),
              arribada: formatFgcTime(rEnd),
              route: `${fromStation} → ${targetDepot}`,
              direction: 'RETIR',
              startTimeMinutes: rStart,
              numValue: 999
            });
          }
        });
      });

      const sortedPlan = plan.sort((a, b) => a.startTimeMinutes - b.startTimeMinutes || a.numValue - b.numValue);

      // Track transitions
      const unitSequences: Record<string, any[]> = {};
      sortedPlan.forEach(trip => { if (!unitSequences[trip.train]) unitSequences[trip.train] = []; unitSequences[trip.train].push(trip); });
      Object.values(unitSequences).forEach(trips => {
        for (let i = 0; i < trips.length; i++) {
          trips[i].prevId = i === 0 ? 'En circulació' : trips[i - 1].id;
          trips[i].nextId = i === trips.length - 1 ? 'Final de servei' : trips[i + 1].id;
        }
      });

      setGeneratedCircs(sortedPlan);
    } catch (e) { console.error(e); } finally { setGenerating(false); }
  };

  const renderAlternativeServiceGraph = () => {
    const masterOrder = [
      'PC', 'PR', 'GR', 'PM', 'PD', 'EP', 'TB',
      'SG', 'MN', 'BN', 'TT', 'SR', 'RE',
      'PF', 'VL', 'LP', 'LF', 'VD', 'SC',
      'MS', 'HG', 'RB', 'FN', 'TR', 'VP', 'EN', 'NA',
      'VO', 'SJ', 'BT', 'UN', 'SQ', 'CF', 'PJ', 'CT', 'NO', 'PN'
    ];

    const liniaStationsMap: Record<string, string[]> = {
      'S1': ['PC', 'PR', 'GR', 'SG', 'MN', 'BN', 'TT', 'SR', 'PF', 'VL', 'LP', 'LF', 'VD', 'SC', 'MS', 'HG', 'RB', 'FN', 'TR', 'VP', 'EN', 'NA'],
      'S2': ['PC', 'PR', 'GR', 'SG', 'MN', 'BN', 'TT', 'SR', 'PF', 'VL', 'LP', 'LF', 'VD', 'SC', 'VO', 'SJ', 'BT', 'UN', 'SQ', 'CF', 'PJ', 'CT', 'NO', 'PN'],
      'L6': ['PC', 'PR', 'GR', 'SG', 'MN', 'BN', 'TT', 'SR'],
      'L7': ['PC', 'PR', 'GR', 'PM', 'PD', 'EP', 'TB'],
      'L12': ['SR', 'RE'],
    };

    const colorMap = (linia: string) => {
      const l = (linia || '').toUpperCase().trim();
      if (l.startsWith('F') || l === 'ES2') return '#22c55e';
      if (l === 'L7' || l === 'ML7' || l === '300') return '#8B4513';
      if (l === 'L6' || l === 'L66' || l === 'ML6' || l === '100') return '#9333ea';
      if (l === 'L12') return '#d8b4fe';
      if (l === 'S1' || l === 'MS1' || l === '400') return '#f97316';
      if (l === 'S2' || l === 'MS2' || l === '500') return '#22c55e';
      if (l.startsWith('M')) return '#6b7280';
      return '#4D5358';
    };

    const filteredCircs = generatedCircs.filter(c => lineFilters.includes('Tots') || lineFilters.includes(mainLiniaForFilter(c.linia)));

    // Build station set: include ALL stations from each visible line
    const foundStations = new Set<string>();
    const visibleLines = new Set<string>();
    filteredCircs.forEach(c => {
      const ml = mainLiniaForFilter(c.linia);
      visibleLines.add(ml);
      const routeParts = c.route.split(' → ');
      if (routeParts.length >= 2) {
        const sOrigin = resolveStationId(routeParts[0].trim(), c.linia);
        const sDest = resolveStationId(routeParts[1].trim(), c.linia);
        if (masterOrder.includes(sOrigin)) foundStations.add(sOrigin);
        if (masterOrder.includes(sDest)) foundStations.add(sDest);
      }
    });
    visibleLines.forEach(line => {
      const stations = liniaStationsMap[line];
      if (stations) stations.forEach(s => foundStations.add(s));
    });

    const sortedStations = masterOrder.filter(s => foundStations.has(s)).reverse();
    if (sortedStations.length === 0) return <div className="flex items-center justify-center h-full text-gray-400 font-bold text-sm uppercase">No hi ha circulacions disponibles per mostrar.</div>;

    const timeScale = 4;
    const startTime = displayMin;
    const hoursToShow = Math.min(22, Math.ceil((24 * 60 + 240 - displayMin) / 60));
    const width = hoursToShow * 60 * timeScale;
    const height = Math.max(600, sortedStations.length * 50);

    const getFgcMin = (t: string) => {
      if (!t || !t.includes(':')) return null;
      const p = t.split(':');
      const h = parseInt(p[0]), m = parseInt(p[1]);
      if (isNaN(h) || isNaN(m)) return null;
      let total = h * 60 + m;
      if (h < 4) total += 24 * 60;
      return total;
    };

    const formatTime = (totalMins: number) => {
      const totalSecs = Math.round(totalMins * 60);
      const h = Math.floor(totalSecs / 3600) % 24;
      const m = Math.floor((totalSecs % 3600) / 60);
      const s = totalSecs % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Group by unit/torn
    const groups: Record<string, any[]> = {};
    filteredCircs.forEach((c, idx) => {
      const routeParts = c.route.split(' → ');
      if (routeParts.length < 2) return;
      const sOrigin = resolveStationId(routeParts[0].trim(), c.linia);
      const sDest = resolveStationId(routeParts[1].trim(), c.linia);
      const y1Index = sortedStations.indexOf(sOrigin);
      const y2Index = sortedStations.indexOf(sDest);
      if (y1Index === -1 || y2Index === -1) return;
      if (y1Index === y2Index) return;

      const uId = c.train && c.train !== 'TREN GRÀFIC' ? c.train : `GRAFIC-${c.torn || idx}`;
      if (!groups[uId]) groups[uId] = [];
      groups[uId].push({ ...c, originId: sOrigin, destId: sDest, y1: y1Index * 50, y2: y2Index * 50 });
    });

    const terminalOvershoots: Record<string, number> = { 'PC': 40, 'NA': -40, 'PN': -40, 'TB': -40, 'RE': -40, 'SR': 40 };

    return (
      <div className="space-y-4 animate-in slide-in-from-right duration-500 overflow-hidden flex flex-col" style={{ minHeight: '700px' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 px-2"><TrendingUp size={16} className="text-orange-500" /><h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Malla Ferroviària d'Emergència</h4></div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              <span>{filteredCircs.length} circulacions</span>
              <span>{Object.keys(groups).length} unitats</span>
            </div>
            <div className="flex items-center bg-gray-100 dark:bg-white/5 p-1 rounded-2xl border border-gray-200 dark:border-white/10">
              {['Tots', 'S1', 'S2', 'L6', 'L7', 'L12'].map(ln => (
                <button
                  key={ln}
                  onClick={() => toggleLineFilter(ln)}
                  className={`px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase transition-all ${lineFilters.includes(ln)
                    ? 'bg-white dark:bg-gray-700 text-[#4D5358] dark:text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                    }`}
                >
                  {ln}
                </button>
              ))}
            </div>
            <button onClick={() => setViewMode('RESOURCES')} className="text-[10px] font-bold text-blue-500 hover:underline ml-4">← Tornar a recursos</button>
          </div>
        </div>

        <div className="flex-1 bg-white dark:bg-gray-950 rounded-[32px] border border-gray-100 dark:border-white/5 overflow-hidden shadow-inner relative" style={{ minHeight: '550px' }}>
          <TransformWrapper initialScale={0.8} minScale={0.1} maxScale={4} centerOnInit={true}>
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                  <button onClick={() => zoomIn()} className="p-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-full shadow border border-black/5 text-[#4D5358] dark:text-white"><ZoomIn size={16} /></button>
                  <button onClick={() => zoomOut()} className="p-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-full shadow border border-black/5 text-[#4D5358] dark:text-white"><ZoomOut size={16} /></button>
                  <button onClick={() => resetTransform()} className="p-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-full shadow border border-black/5 text-[#4D5358] dark:text-white"><RotateCcw size={16} /></button>
                </div>
                <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                  <div className="relative p-8 select-none">
                    <svg width={width} height={height} className="overflow-visible">
                      {/* Time grid */}
                      {Array.from({ length: hoursToShow * 4 + 1 }).map((_, i) => {
                        const m = i * 15;
                        const x = m * timeScale;
                        const isHour = i % 4 === 0;
                        return (
                          <g key={i}>
                            <line x1={x} y1={-20} x2={x} y2={height + 20} stroke="currentColor" strokeDasharray={isHour ? "" : "2,2"} className={isHour ? 'text-gray-200 dark:text-white/10' : 'text-gray-100 dark:text-white/5'} />
                            {isHour && (
                              <text x={x} y={-30} className="text-[10px] font-bold fill-gray-400 dark:fill-gray-500 uppercase" textAnchor="middle">
                                {formatTime(startTime + m)}
                              </text>
                            )}
                          </g>
                        );
                      })}

                      {/* Station axes */}
                      {sortedStations.map((st, i) => {
                        const y = i * 50;
                        return (
                          <g key={st}>
                            <line x1={-20} y1={y} x2={width + 20} y2={y} stroke="currentColor" className="text-gray-100 dark:text-white/5" />
                            <text x={-30} y={y + 4} className="text-[11px] font-bold fill-fgc-grey dark:fill-gray-400 uppercase" textAnchor="end">{st}</text>
                          </g>
                        );
                      })}

                      {/* Circulation lines */}
                      {Object.entries(groups).map(([uId, trips]) => {
                        const sorted = trips.sort((a, b) => (getFgcMin(a.sortida) || 0) - (getFgcMin(b.sortida) || 0));
                        return (
                          <g key={uId}>
                            {/* Layer 1: Transitions/Loops */}
                            {sorted.map((c, i) => {
                              const next = sorted[i + 1];
                              if (!next) return null;
                              const endM = getFgcMin(c.arribada);
                              const nextStartM = getFgcMin(next.sortida);
                              if (endM === null || nextStartM === null) return null;
                              if (nextStartM - endM > 60 || nextStartM < endM) return null;

                              const x2 = (endM - startTime) * timeScale;
                              const nx1 = (nextStartM - startTime) * timeScale;
                              const color = colorMap(c.linia);
                              const ny1 = next.y1;

                              const yDir = terminalOvershoots[c.destId];
                              if (yDir !== undefined && c.destId === next.originId) {
                                return (
                                  <path
                                    key={`loop-${uId}-${i}`}
                                    d={`M ${x2} ${c.y2} C ${x2 + 15} ${c.y2 + yDir}, ${nx1 - 15} ${ny1 + yDir}, ${nx1} ${ny1}`}
                                    fill="none" stroke={color} strokeWidth={2} strokeDasharray="5,3" className="opacity-50"
                                  />
                                );
                              } else {
                                return (
                                  <path
                                    key={`trans-${uId}-${i}`}
                                    d={`M ${x2} ${c.y2} C ${x2 + (nx1 - x2) / 2} ${c.y2}, ${x2 + (nx1 - x2) / 2} ${ny1}, ${nx1} ${ny1}`}
                                    fill="none" stroke={color} strokeWidth={1} strokeDasharray="4,2" className="opacity-30"
                                  />
                                );
                              }
                            })}

                            {/* Layer 2: Main circulation lines */}
                            {sorted.map((c, i) => {
                              const sM = getFgcMin(c.sortida);
                              const eM = getFgcMin(c.arribada);
                              if (sM === null || eM === null) return null;
                              const x1 = (sM - startTime) * timeScale;
                              const x2 = (eM - startTime) * timeScale;
                              const color = colorMap(c.linia);
                              const isManiobra = (c.linia || '').toUpperCase().startsWith('M') && c.linia !== 'ML6' && c.linia !== 'ML7';
                              const isSenseMaquinista = c.torn === '---';

                              return (
                                <g key={`trip-${uId}-${i}`} className="group cursor-pointer">
                                  <line
                                    x1={x1} y1={c.y1} x2={x2} y2={c.y2}
                                    stroke={color}
                                    strokeWidth={isManiobra ? 2 : isSenseMaquinista ? 2.5 : 4}
                                    strokeDasharray={isManiobra ? "4,2" : isSenseMaquinista ? "4,2" : ""}
                                    className="transition-all group-hover:stroke-blue-500 group-hover:[stroke-width:8px] drop-shadow-sm"
                                  />
                                  <circle cx={x1} cy={c.y1} r={4} fill={color} className="transition-all group-hover:r-6" />
                                  <circle cx={x2} cy={c.y2} r={4} fill={color} className="transition-all group-hover:r-6" />

                                  {/* Hover tooltip */}
                                  <g className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                    <rect x={Math.min(x1, x2)} y={Math.min(c.y1, c.y2) - 70} width={200} height={60} rx={14} className="fill-fgc-grey/95 dark:fill-black/95 shadow-2xl" />
                                    <text x={Math.min(x1, x2) + 14} y={Math.min(c.y1, c.y2) - 50} className="fill-white text-[11px] font-bold uppercase">{c.id} — {c.torn}</text>
                                    <text x={Math.min(x1, x2) + 14} y={Math.min(c.y1, c.y2) - 35} className="fill-white/70 text-[9px] font-bold uppercase">{c.sortida} → {c.arribada}</text>
                                    <text x={Math.min(x1, x2) + 14} y={Math.min(c.y1, c.y2) - 20} className="text-[9px] font-bold uppercase" fill={color}>{c.linia} · {c.originId} → {c.destId}</text>
                                  </g>
                                </g>
                              );
                            })}
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

        {/* Legend - same as MallaVisualizer */}
        <div className="flex flex-wrap items-center gap-6 px-4 bg-gray-50 dark:bg-black/20 p-4 rounded-[24px] border border-gray-100 dark:border-white/5">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: LINE_COLORS['S1'].hex }} /> <span className="text-[10px] font-bold uppercase text-gray-500">{LINE_COLORS['S1'].label}</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: LINE_COLORS['S2'].hex }} /> <span className="text-[10px] font-bold uppercase text-gray-500">{LINE_COLORS['S2'].label}</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: LINE_COLORS['L6'].hex }} /> <span className="text-[10px] font-bold uppercase text-gray-500">{LINE_COLORS['L6'].label}</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: LINE_COLORS['L7'].hex }} /> <span className="text-[10px] font-bold uppercase text-gray-500">{LINE_COLORS['L7'].label}</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: LINE_COLORS['L12'].hex }} /> <span className="text-[10px] font-bold uppercase text-gray-500">{LINE_COLORS['L12'].label}</span></div>
          <div className="flex items-center gap-2"><div className="w-8 h-0 border-t-2 border-dashed border-gray-400" /> <span className="text-[10px] font-bold uppercase text-gray-500">Maniobres</span></div>
          <div className="flex items-center gap-2"><div className="w-8 h-0 border-t-2 border-dashed border-orange-400" /> <span className="text-[10px] font-bold uppercase text-orange-400">Sense Maquinista</span></div>
          <div className="flex-1 min-w-[100px]" />
          <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest italic">
            <div className="flex items-center gap-1"><Move size={12} /> Arrossega</div>
            <div className="flex items-center gap-1"><ZoomIn size={12} /> Zoom</div>
            <div className="flex items-center gap-1"><Activity size={12} /> Hover per detalls</div>
          </div>
        </div>
      </div>
    );
  };

  const islandLabel = dividedPersonnel[islandId].label.replace("Illa ", "");
  const totalAssigned = Object.values(lineCounts).reduce((a, b) => a + b, 0);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center p-4 sm:p-12 md:p-20 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-500 overflow-y-auto">
      <GlassPanel className="w-full max-w-6xl !rounded-[40px] sm:!rounded-[56px] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col mb-12 relative animate-in zoom-in-95 duration-500">
        {/* Header */}
        <div className="p-8 border-b border-gray-100 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-gray-50/50 dark:bg-black/20">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-fgc-green rounded-2xl text-[#4D5358] shadow-lg"><Activity size={24} /></div>
            <div>
              <h3 className="text-xl font-bold text-[#4D5358] dark:text-white uppercase tracking-tight">Pla de Servei Alternatiu</h3>
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{islandLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 bg-white dark:bg-gray-800 px-3 py-2 rounded-xl border border-gray-100 dark:border-white/10 shadow-sm">
              <button
                onClick={async () => {
                  let theoryCircs: any[] = [];
                  let fromIdx2 = 0;
                  while (true) {
                    const { data: batch } = await supabase.from('circulations').select('*').range(fromIdx2, fromIdx2 + 999);
                    if (!batch || batch.length === 0) break;
                    theoryCircs = theoryCircs.concat(batch);
                    if (batch.length < 1000) break;
                    fromIdx2 += 1000;
                  }
                  if (theoryCircs.length === 0) return;
                  const liniaStationsRef = LINIA_STATIONS;

                  Object.entries(lineCounts).forEach(([linia, count]) => {
                    if (count === 0 || !enabledLines[linia]) return;
                    const lineStops = liniaStationsRef[linia];
                    if (!lineStops) return;
                    const islandLineStops = lineStops.filter(s => islandStations.has(s));
                    if (islandLineStops.length < 2) return;

                    const start = islandLineStops[0];
                    const end = islandLineStops[islandLineStops.length - 1];

                    const sample = (theoryCircs as any[])
                      .filter(c => c.linia === linia && getFgcMinutes(c.sortida) <= displayMin)
                      .sort((a, b) => getFgcMinutes(b.sortida) - getFgcMinutes(a.sortida))[0]
                      || (theoryCircs as any[]).find(c => c.linia === linia);

                    if (sample) {
                      const stops = [sample.inici, ...(sample.estacions?.map((s: any) => s.nom) || []), sample.final];
                      const times = [sample.sortida, ...(sample.estacions?.map((s: any) => s.hora || s.sortida) || []), sample.arribada];
                      const idx1 = stops.indexOf(start), idx2 = stops.indexOf(end);
                      if (idx1 !== -1 && idx2 !== -1) {
                        const duration = Math.abs(getFgcMinutes(times[idx1]) - getFgcMinutes(times[idx2]));
                        const optimal = Math.round((duration * 2 + 6) / count);
                        setLineHeadways(h => ({ ...h, [linia]: Math.max(1, optimal) }));
                      }
                    }
                  });
                }}
                className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                title="Recalcular totes les freqüències automàticament"
              >
                <Wand2 size={14} className="group-hover:rotate-12 transition-transform" />
                <span className="text-[10px] font-bold uppercase tracking-wider">AUTO FREQ</span>
              </button>
            </div>
            <button
              onClick={handleGenerateCirculations}
              className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-bold text-sm transition-all shadow-xl active:scale-95 bg-blue-600 text-white hover:bg-blue-700`}
            >
              <FilePlus size={18} /> GENERAR CIRCULACIONS
            </button>
            <button
              onClick={async () => {
                if (generatedCircs.length === 0) await handleGenerateCirculations();
                setViewMode('SHIFTS');
              }}
              className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-bold text-sm transition-all shadow-xl active:scale-95 bg-purple-600 text-white hover:bg-purple-700`}
            >
              <Users size={18} /> GENERAR TORNS
            </button>
            <button
              onClick={async () => {
                if (generatedCircs.length === 0) await handleGenerateCirculations();
                setViewMode('GRAPH');
              }}
              className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-bold text-sm transition-all shadow-xl active:scale-95 bg-orange-600 text-white hover:bg-orange-700`}
            >
              <TrendingUp size={18} /> GENERAR MALLA
            </button>
            <button onClick={() => onClose()} className="p-3 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 rounded-full transition-colors"><X size={28} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
          {viewMode === 'RESOURCES' ? (
            <>
              <div className="flex items-center justify-between px-2">
                <h4 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.3em]">Configuració Manual de Recursos</h4>
                <div className="flex gap-4">
                  <span className="bg-gray-100 dark:bg-white/5 px-3 py-1 rounded-full text-[10px] font-bold text-gray-500 uppercase tracking-widest">{totalAssigned} de {physicalTrains.length} Unitats Disp.</span>
                  <span className="bg-gray-100 dark:bg-white/5 px-3 py-1 rounded-full text-[10px] font-bold text-gray-500 uppercase tracking-widest">{totalAssigned} de {allDrivers.length} Maquinistes Disp.</span>
                </div>
              </div>

              {/* Resource Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                {/* Total Trens */}
                <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-[32px] border border-blue-100 dark:border-blue-900/30 flex flex-col items-center justify-center text-center">
                  <Train className="text-blue-500 mb-2" size={32} />
                  <span className="text-4xl font-bold text-blue-700 dark:text-blue-400">{physicalTrains.length}</span>
                  <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mt-1">Total Trens</span>
                </div>

                {/* S1 + S2 */}
                <div className={`bg-orange-50/30 dark:bg-orange-950/10 p-6 rounded-[32px] border border-orange-100 dark:border-orange-900/30 flex flex-col items-center justify-between transition-opacity ${(!enabledLines.S1 && !enabledLines.S2) ? 'opacity-40' : 'opacity-100'}`}>
                  <div className="flex items-center justify-between w-full mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-orange-600">S1</span>
                      <span className="text-gray-300 text-xs font-bold">+</span>
                      <span className="text-xs font-bold text-fgc-green">S2</span>
                    </div>
                    <div className="flex gap-1.5 items-center">
                      <button
                        onClick={() => { toggleLine('S1'); toggleLine('S2'); }}
                        className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase transition-colors ${enabledLines.S1 ? 'bg-fgc-green text-[#4D5358]' : 'bg-gray-200 text-gray-400'}`}
                      >
                        {enabledLines.S1 ? 'ON' : 'OFF'}
                      </button>
                      <button
                        onClick={() => { toggleNormal('S1'); toggleNormal('S2'); }}
                        className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase transition-colors ${normalLines.S1 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-400'}`}
                      >
                        {normalLines.S1 ? 'NORMAL' : 'ALTER.'}
                      </button>
                    </div>
                  </div>
                  <div className="flex w-full justify-around items-center">
                    {/* S1 */}
                    <div className={`flex flex-col items-center gap-2 ${!enabledLines.S1 ? 'grayscale' : ''}`}>
                      <span className="text-[8px] font-bold text-orange-400 uppercase">S1</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateCount('S1', -1)} disabled={!enabledLines.S1} className="p-1 hover:bg-orange-100 dark:hover:bg-white/5 rounded-lg text-orange-500 transition-colors disabled:opacity-20"><Minus size={14} /></button>
                        <span className="text-2xl font-bold text-[#4D5358] dark:text-white leading-none">{lineCounts.S1}</span>
                        <button onClick={() => updateCount('S1', 1)} disabled={!enabledLines.S1} className="p-1 hover:bg-orange-100 dark:hover:bg-white/5 rounded-lg text-orange-500 transition-colors disabled:opacity-20"><Plus size={14} /></button>
                      </div>
                      <div className="flex items-center gap-1 bg-white dark:bg-black/20 px-2 py-1 rounded-lg border border-black/5 mt-1">
                        <button onClick={() => updateHeadway('S1', -1)} disabled={!enabledLines.S1} className="text-orange-400 disabled:opacity-20"><Minus size={10} /></button>
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-bold text-[#4D5358] dark:text-white leading-none">{lineHeadways.S1 || 15}</span>
                          <span className="text-[6px] font-bold text-gray-400 uppercase">min</span>
                        </div>
                        <button onClick={() => updateHeadway('S1', 1)} disabled={!enabledLines.S1} className="text-orange-400 disabled:opacity-20"><Plus size={10} /></button>
                      </div>
                    </div>
                    <div className="w-px h-8 bg-orange-100 dark:bg-white/10" />
                    {/* S2 */}
                    <div className={`flex flex-col items-center gap-2 ${!enabledLines.S2 ? 'grayscale' : ''}`}>
                      <span className="text-[8px] font-bold text-fgc-green uppercase">S2</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateCount('S2', -1)} disabled={!enabledLines.S2} className="p-1 hover:bg-fgc-green/10 dark:hover:bg-white/5 rounded-lg text-fgc-green transition-colors disabled:opacity-20"><Minus size={14} /></button>
                        <span className="text-2xl font-bold text-[#4D5358] dark:text-white leading-none">{lineCounts.S2}</span>
                        <button onClick={() => updateCount('S2', 1)} disabled={!enabledLines.S2} className="p-1 hover:bg-fgc-green/10 dark:hover:bg-white/5 rounded-lg text-fgc-green transition-colors disabled:opacity-20"><Plus size={14} /></button>
                      </div>
                      <div className="flex items-center gap-1 bg-white dark:bg-black/20 px-2 py-1 rounded-lg border border-black/5 mt-1">
                        <button onClick={() => updateHeadway('S2', -1)} disabled={!enabledLines.S2} className="text-fgc-green disabled:opacity-20"><Minus size={10} /></button>
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-bold text-[#4D5358] dark:text-white leading-none">{lineHeadways.S2 || 15}</span>
                          <span className="text-[6px] font-bold text-gray-400 uppercase">min</span>
                        </div>
                        <button onClick={() => updateHeadway('S2', 1)} disabled={!enabledLines.S2} className="text-fgc-green disabled:opacity-20"><Plus size={10} /></button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* L6 */}
                <div className={`bg-purple-50/50 dark:bg-purple-900/10 p-6 rounded-[32px] border border-purple-100 dark:border-purple-900/30 flex flex-col items-center justify-between transition-opacity ${!enabledLines.L6 ? 'opacity-40' : 'opacity-100'}`}>
                  <div className="flex items-center justify-between w-full mb-4">
                    <span className="text-xs font-bold text-purple-600 uppercase tracking-widest">L6</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => toggleLine('L6')}
                        className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase transition-colors ${enabledLines.L6 ? 'bg-fgc-green text-[#4D5358]' : 'bg-gray-200 text-gray-400'}`}
                      >
                        {enabledLines.L6 ? 'ON' : 'OFF'}
                      </button>
                      <button
                        onClick={() => toggleNormal('L6')}
                        className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase transition-colors ${normalLines.L6 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-400'}`}
                      >
                        {normalLines.L6 ? 'NORMAL' : 'ALTER.'}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => updateCount('L6', -1)} disabled={!enabledLines.L6} className="p-1 hover:bg-purple-100 dark:hover:bg-white/5 rounded-lg text-purple-500 transition-colors disabled:opacity-20"><Minus size={16} /></button>
                    <span className="text-3xl font-bold text-[#4D5358] dark:text-white leading-none">{lineCounts.L6}</span>
                    <button onClick={() => updateCount('L6', 1)} disabled={!enabledLines.L6} className="p-1 hover:bg-purple-100 dark:hover:bg-white/5 rounded-lg text-purple-500 transition-colors disabled:opacity-20"><Plus size={16} /></button>
                  </div>
                  <div className="flex items-center gap-2 bg-white dark:bg-black/20 px-3 py-1 rounded-xl border border-black/5 mt-4">
                    <button onClick={() => updateHeadway('L6', -1)} disabled={!enabledLines.L6} className="text-purple-400 disabled:opacity-20"><Minus size={12} /></button>
                    <div className="flex flex-col items-center w-10">
                      <span className="text-[12px] font-bold text-[#4D5358] dark:text-white leading-none">{lineHeadways.L6 || 15}</span>
                      <span className="text-[7px] font-bold text-gray-400 uppercase tracking-tighter">min</span>
                    </div>
                    <button onClick={() => updateHeadway('L6', 1)} disabled={!enabledLines.L6} className="text-purple-400 disabled:opacity-20"><Plus size={12} /></button>
                  </div>
                </div>

                {/* L7 & L12 */}
                <div className={`bg-amber-50/30 dark:bg-amber-950/10 p-6 rounded-[32px] border border-amber-100 dark:border-amber-900/30 flex flex-col items-center justify-between transition-opacity ${(!enabledLines.L7 && !enabledLines.L12) ? 'opacity-40' : 'opacity-100'}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs font-bold text-amber-700">L7</span>
                    <span className="text-gray-300 text-xs font-bold">&</span>
                    <span className="text-xs font-bold text-purple-400">L12</span>
                  </div>
                  <div className="flex w-full justify-around items-center">
                    {/* L7 */}
                    <div className={`flex flex-col items-center gap-2 ${!enabledLines.L7 ? 'grayscale' : ''}`}>
                      <div className="flex gap-1 mb-1">
                        <button
                          onClick={() => toggleLine('L7')}
                          className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase transition-colors ${enabledLines.L7 ? 'bg-fgc-green text-[#4D5358]' : 'bg-gray-200 text-gray-400'}`}
                        >
                          {enabledLines.L7 ? 'ON' : 'OFF'}
                        </button>
                        <button
                          onClick={() => toggleNormal('L7')}
                          className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase transition-colors ${normalLines.L7 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-400'}`}
                        >
                          {normalLines.L7 ? 'NORM' : 'ALT'}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateCount('L7', -1)} disabled={!enabledLines.L7 || normalLines.L7} className="p-1 hover:bg-amber-100 dark:hover:bg-white/5 rounded-lg text-amber-600 transition-colors disabled:opacity-20"><Minus size={14} /></button>
                        <span className="text-2xl font-bold text-[#4D5358] dark:text-white leading-none">{lineCounts.L7}</span>
                        <button onClick={() => updateCount('L7', 1)} disabled={!enabledLines.L7 || normalLines.L7} className="p-1 hover:bg-amber-100 dark:hover:bg-white/5 rounded-lg text-amber-600 transition-colors disabled:opacity-20"><Plus size={14} /></button>
                      </div>
                      <div className="flex items-center gap-1 bg-white dark:bg-black/20 px-2 py-1 rounded-lg border border-black/5 mt-1">
                        <button onClick={() => updateHeadway('L7', -1)} disabled={!enabledLines.L7 || normalLines.L7} className="text-amber-500 disabled:opacity-20"><Minus size={10} /></button>
                        <span className="text-[10px] font-bold text-[#4D5358] dark:text-white">{lineHeadways.L7 || 15}</span>
                        <button onClick={() => updateHeadway('L7', 1)} disabled={!enabledLines.L7 || normalLines.L7} className="text-amber-500 disabled:opacity-20"><Plus size={10} /></button>
                      </div>
                    </div>
                    <div className="w-px h-8 bg-amber-100 dark:bg-white/10" />
                    {/* L12 */}
                    <div className={`flex flex-col items-center gap-2 ${!enabledLines.L12 ? 'grayscale' : ''}`}>
                      <div className="flex gap-1 mb-1">
                        <button
                          onClick={() => toggleLine('L12')}
                          className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase transition-colors ${enabledLines.L12 ? 'bg-fgc-green text-[#4D5358]' : 'bg-gray-200 text-gray-400'}`}
                        >
                          {enabledLines.L12 ? 'ON' : 'OFF'}
                        </button>
                        <button
                          onClick={() => toggleNormal('L12')}
                          className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase transition-colors ${normalLines.L12 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-400'}`}
                        >
                          {normalLines.L12 ? 'NORM' : 'ALT'}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateCount('L12', -1)} disabled={!enabledLines.L12 || normalLines.L12} className="p-1 hover:bg-purple-100 dark:hover:bg-white/5 rounded-lg text-purple-400 transition-colors disabled:opacity-20"><Minus size={14} /></button>
                        <span className="text-2xl font-bold text-[#4D5358] dark:text-white leading-none">{lineCounts.L12}</span>
                        <button onClick={() => updateCount('L12', 1)} disabled={!enabledLines.L12 || normalLines.L12} className="p-1 hover:bg-purple-100 dark:hover:bg-white/5 rounded-lg text-purple-400 transition-colors disabled:opacity-20"><Plus size={14} /></button>
                      </div>
                      <div className="flex items-center gap-1 bg-white dark:bg-black/20 px-2 py-1 rounded-lg border border-black/5 mt-1">
                        <button onClick={() => updateHeadway('L12', -1)} disabled={!enabledLines.L12 || normalLines.L12} className="text-purple-400 disabled:opacity-20"><Minus size={10} /></button>
                        <span className="text-[10px] font-bold text-[#4D5358] dark:text-white">{lineHeadways.L12 || 15}</span>
                        <button onClick={() => updateHeadway('L12', 1)} disabled={!enabledLines.L12 || normalLines.L12} className="text-purple-400 disabled:opacity-20"><Plus size={10} /></button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Maquinistes */}
                <div className="bg-fgc-green/10 dark:bg-fgc-green/5 p-6 rounded-[32px] border border-fgc-green/20 dark:border-fgc-green/10 flex flex-col items-center justify-center text-center">
                  <User className="text-fgc-green mb-2" size={32} />
                  <span className="text-4xl font-bold text-fgc-green">{allDrivers.length}</span>
                  <span className="text-[10px] font-bold text-fgc-green-dark dark:text-fgc-green uppercase tracking-widest mt-1">Maquinistes</span>
                </div>
              </div>

              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-2 px-2"><ShieldAlert size={16} className="text-red-500" /><h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Assignació de Recursos d'Illa (Per ordre de prioritat)</h4></div>
                <div className="grid grid-cols-1 gap-3">
                  {shuttlePlan.map((s, idx) => (
                    <div key={idx} className="bg-white dark:bg-gray-800 rounded-[32px] p-6 border border-gray-100 dark:border-white/5 shadow-sm flex items-center justify-between gap-6 hover:shadow-xl transition-all group overflow-hidden relative">
                      <div className="flex items-center gap-6 flex-1 min-w-0 z-10">
                        <div className={`h-16 w-16 rounded-2xl flex items-center justify-center font-bold text-white shadow-lg shrink-0 text-xl border-4 border-white/20`} style={{ backgroundColor: getLiniaColorHex(s.liniaCode) }}>
                          {s.liniaCode}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <p className="text-xl font-bold text-[#4D5358] dark:text-white uppercase truncate tracking-tight">{s.route}</p>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase border ${s.priority === 'ALTA' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-purple-50 text-purple-600 border-purple-100'}`}>Prioritat {s.priority}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                              <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 px-2 py-0.5 rounded-lg text-[10px] uppercase font-bold">Unitat: {s.train.id}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                              <span className="bg-fgc-green/10 dark:bg-fgc-green/20 text-fgc-green px-2 py-0.5 rounded-lg text-[10px] uppercase font-bold">Personal: {s.driver.driver}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 z-10">
                        {s.driver.phones?.map((p: string, i: number) => (
                          <a key={i} href={isPrivacyMode ? undefined : `tel:${p}`} className={`w-12 h-12 bg-gray-50 dark:bg-black text-[#4D5358] dark:text-gray-400 rounded-2xl flex items-center justify-center hover:bg-fgc-green hover:text-white transition-all shadow-md border border-gray-100 dark:border-white/10 ${isPrivacyMode ? 'cursor-default' : ''}`}><Phone size={20} /></a>
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
                <div className="flex items-center gap-2 px-2"><LayoutGrid size={16} className="text-blue-500" /><h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Escaleta de Circulacions d'Emergència</h4></div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-gray-100 dark:bg-white/5 p-1 rounded-2xl border border-gray-200 dark:border-white/10">
                    {['Tots', 'S1', 'S2', 'L6', 'L7', 'L12'].map(ln => (
                      <button
                        key={ln}
                        onClick={() => toggleLineFilter(ln)}
                        className={`px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase transition-all ${lineFilters.includes(ln)
                          ? 'bg-white dark:bg-fgc-green text-[#4D5358] dark:text-[#4D5358] shadow-sm'
                          : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                          }`}
                      >
                        {ln}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setViewMode('RESOURCES')} className="text-[10px] font-bold text-blue-500 hover:underline ml-4">← Tornar a recursos</button>
                </div>
              </div>
              {generating ? (
                <div className="py-20 flex flex-col items-center gap-4 opacity-30"><Loader2 className="animate-spin text-blue-500" size={48} /><p className="text-xs font-bold uppercase tracking-widest">Sincronitzant malla teòrica...</p></div>
              ) : (
                <div className="bg-gray-50 dark:bg-black/20 rounded-[32px] overflow-hidden border border-gray-100 dark:border-white/5">
                  <div className="grid grid-cols-8 bg-fgc-grey dark:bg-black text-white p-4 text-[10px] font-bold uppercase tracking-widest">
                    <div>Codi</div><div>Tren Anterior</div><div>Torn Maquinista</div><div>Sortida</div><div>Arribada</div><div className="col-span-1">Ruta</div><div>Següent Circulació</div><div>Direcció</div>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-white/5">
                    {generatedCircs
                      .filter(c => lineFilters.includes('Tots') || lineFilters.includes(c.linia))
                      .map((c, idx) => (
                        <div key={idx} className={`grid grid-cols-8 p-4 items-center transition-colors ${c.torn === '---' ? 'bg-orange-50 dark:bg-orange-900/10 hover:bg-orange-100 dark:hover:bg-orange-900/20 pulse-orange' : 'hover:bg-white dark:hover:bg-white/5'}`}>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getLiniaColorHex(c.linia) }} />
                            <span className="font-bold text-lg text-[#4D5358] dark:text-white">{c.id}</span>
                          </div>
                          <div className="font-bold text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-tight">{c.prevId}</div>
                          <div className="flex flex-col">
                            <span className="font-bold text-xs text-[#4D5358] dark:text-white uppercase">{c.torn || '---'}</span>
                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 truncate">{c.driver}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-orange-600 dark:text-orange-400 leading-none">{c.sortida}</span>
                            {c.delay > 0 && <span className="text-[9px] font-bold text-red-500 animate-pulse">+{c.delay} min</span>}
                          </div>
                          <div className="font-bold text-sm text-blue-600 dark:text-blue-400">{c.arribada}</div>
                          <div className="text-[10px] font-bold text-[#4D5358] dark:text-gray-300 truncate">{c.route}</div>
                          <div className="font-bold text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-tight">{c.nextId}</div>
                          <div><span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase border ${c.direction === 'ASCENDENT' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-fgc-green/10 text-fgc-green border-fgc-green/20'}`}>{c.direction}</span></div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : viewMode === 'SHIFTS' ? (
            <div className="space-y-6 animate-in slide-in-from-right duration-500">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 px-2"><Users size={16} className="text-purple-500" /><h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Pla d'Assignació per Torn de Maquinista</h4></div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-gray-100 dark:bg-white/5 p-1 rounded-2xl border border-gray-200 dark:border-white/10">
                    {['Tots', 'S1', 'S2', 'L6', 'L7', 'L12'].map(ln => (
                      <button
                        key={ln}
                        onClick={() => toggleLineFilter(ln)}
                        className={`px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase transition-all ${lineFilters.includes(ln)
                          ? 'bg-white dark:bg-fgc-green text-[#4D5358] dark:text-[#4D5358] shadow-sm'
                          : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                          }`}
                      >
                        {ln}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setViewMode('RESOURCES')} className="text-[10px] font-bold text-blue-500 hover:underline ml-4">← Tornar a recursos</button>
                </div>
              </div>

              {generating ? (
                <div className="py-20 flex flex-col items-center gap-4 opacity-30"><Loader2 className="animate-spin text-purple-500" size={48} /><p className="text-xs font-bold uppercase tracking-widest">Organitzant torns d'emergència...</p></div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {(() => {
                    const groups: Record<string, any> = {};
                    generatedCircs
                      .filter(c => lineFilters.includes('Tots') || lineFilters.includes(c.linia))
                      .forEach(c => {
                        if (!c.torn) return;

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
                      <div key={g.id} className={`rounded-[32px] border shadow-sm overflow-hidden flex flex-col ${g.id === '---' ? 'bg-orange-50/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-500/20 pulse-orange' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-white/5'}`}>
                        <div className="p-6 bg-gray-50/50 dark:bg-black/20 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm ${g.id === '---' ? 'bg-orange-500 text-white' : 'bg-purple-100 dark:bg-purple-900/40 text-purple-600'}`}>{g.id}</div>
                            <div>
                              <p className={`text-sm font-bold uppercase truncate ${g.id === '---' ? 'text-orange-700 dark:text-orange-400' : 'text-[#4D5358] dark:text-white'}`}>{g.driver}</p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Horari: {g.start} - {g.end}</p>
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase ${g.id === '---' ? 'bg-orange-500 text-white' : 'bg-purple-50 dark:bg-purple-900/20 text-purple-600'}`}>{g.trips.length} SERVEIS</span>
                        </div>
                        <div className="p-4 space-y-2">
                          {g.trips.map((t: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50/50 dark:bg-white/5 border border-gray-100/50 dark:border-white/5">
                              <div className="flex items-center gap-3">
                                <div className="w-1.5 h-8 rounded-full" style={{ backgroundColor: getLiniaColorHex(t.linia) }} />
                                <div>
                                  <p className="text-xs font-bold text-[#4D5358] dark:text-white uppercase">{t.id} - {t.route}</p>
                                  <p className="text-[9px] font-bold text-gray-400 uppercase">Tren: {t.train}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-bold text-purple-600">{t.sortida} - {t.arribada}</p>
                                <p className="text-[8px] font-bold text-gray-400 uppercase">{t.direction}</p>
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
          ) : (
            renderAlternativeServiceGraph()
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
                      Les circulacions es generen amb una cadència personalitzada per línia, alternant sentits segons els recursos assignats.
                      {hasVU && <span className="text-orange-600 dark:text-orange-400 block mt-1">⚠️ S'han detectat trams en Via Única: S'ha aplicat un increment de temps de viatge de +5 min per tram afectat.</span>}
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="flex items-center gap-2 text-right">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Capacitat de zona</span>
              <div className="h-2 w-32 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-fgc-green" style={{ width: `${(totalAssigned / Math.max(1, physicalTrains.length)) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      </GlassPanel>
    </div>,
    document.body
  );
};

export default AlternativeServiceOverlay;
