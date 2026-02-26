import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, ShieldAlert, Loader2, UserCheck, Clock, MapPin, AlertCircle, Phone, Info, Users, Zap, User, Train, Map as MapIcon, X, Timer, Scissors, ArrowDownToLine, ArrowUpToLine, ArrowLeftToLine, ArrowRightToLine, Coffee, Layers, Trash2, Repeat, Rewind, FastForward, RotateCcw, RefreshCw, LayoutGrid, CheckCircle2, Activity, FilePlus, ArrowRight, Move, Plus, Minus, Bell, Construction, Warehouse, ZoomIn, ZoomOut, Maximize, Wand2, TrendingUp, ArrowLeft } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';
import { fetchFullTurns } from '../utils/queries.ts';
import { getStatusColor } from '../utils/fgc.ts';
import { useServiceToday } from '../utils/useServiceToday';
import {
  resolveStationId, isServiceVisible, normalizeStr, mainLiniaForFilter,
  S1_STATIONS, S2_STATIONS, L6_STATIONS, L7_STATIONS, L12_STATIONS, LINIA_STATIONS,
  getLiniaColorHex, getFgcMinutes, formatFgcTime, getShortTornId, LINE_COLORS, getTravelTime
} from '../utils/stations';
import type { LivePersonnel, IncidenciaViewProps, IncidenciaMode, DiagramId, ReserveShift, MallaCirculation, EnrichedShift } from '../types';
import IncidenciaPerTorn from '../components/IncidenciaPerTorn.tsx';
import DepotModal from '../components/DepotModal.tsx';
import MallaVisualizer from '../components/MallaVisualizer.tsx';
import TrainInspectorPopup from '../components/TrainInspectorPopup.tsx';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { feedback } from '../utils/feedback';
import { useToast } from '../components/ToastProvider';
import GlassPanel from '../components/common/GlassPanel';
import { CardSkeleton, ListSkeleton } from '../components/common/Skeleton';
import ShiftHeader from './incidencia/ShiftHeader';
import CompactViatgerRow from './incidencia/CompactViatgerRow';
import ListPersonnelRow from './incidencia/ListPersonnelRow';
import IncidentDashboard from './incidencia/IncidentDashboard';
import IncidentMap from './incidencia/IncidentMap';
import AlternativeServiceOverlay from './incidencia/AlternativeServiceOverlay';
import ErrorBoundary from '../components/common/ErrorBoundary';
import { MAP_STATIONS, MAP_SEGMENTS, MAP_CROSSOVERS, DEPOT_CAPACITIES, RESERVAS_DATA } from './incidencia/mapConstants';
import { getFullPath, getConnectivityIslands } from './incidencia/mapUtils';
import { useLiveMapData } from './incidencia/hooks/useLiveMapData';
import { useCirculationSearch } from './incidencia/hooks/useCirculationSearch';

// Interfaces imported from types.ts (LivePersonnel, IncidenciaViewProps, IncidenciaMode, DiagramId, ReserveShift)







// Capacitats dels dipòsits segons Pla de garatges BV07


// S1_STATIONS, S2_STATIONS, L6_STATIONS, L7_STATIONS, L12_STATIONS imported from utils/stations.ts





const IncidenciaViewComponent: React.FC<IncidenciaViewProps> = ({ showSecretMenu, parkedUnits, onParkedUnitsChange, isPrivacyMode }) => {
  const [mode, setMode] = useState<IncidenciaMode>('INIT');
  const { showToast } = useToast();
  const todayService = useServiceToday();
  const [selectedServei, setSelectedServei] = useState<string>(todayService);

  // Update selectedServei if Supabase returns a different code than the initial sync guess
  const resolvedFromDB = React.useRef(false);
  useEffect(() => {
    if (!resolvedFromDB.current && todayService !== selectedServei) {
      setSelectedServei(todayService);
      resolvedFromDB.current = true;
    }
  }, [todayService]);
  const [isRealTime, setIsRealTime] = useState(true);
  const [customTime, setCustomTime] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [manualOverrides, setManualOverrides] = useState<Record<string, string>>({});
  const [isGeoTrenEnabled, setIsGeoTrenEnabled] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Custom Hooks
  const {
    liveData,
    loading: mapLoading,
    geoTrenData,
    displayMin,
    allShifts,
    setAllShifts
  } = useLiveMapData({
    isRealTime,
    isPaused,
    customTime,
    selectedServei,
    mode,
    manualOverrides,
    isGeoTrenEnabled
  });

  const {
    query, setQuery,
    loading: searchLoading,
    searchedCircData, setSearchedCircData,
    mainDriverInfo, setMainDriverInfo,
    passengerResults, setPassengerResults,
    adjacentResults, setAdjacentResults,
    restingResults, setRestingResults,
    extensibleResults, setExtensibleResults,
    reserveInterceptResults, setReserveInterceptResults,
    handleSearchCirculation
  } = useCirculationSearch({ selectedServei });

  // Backwards compatibility for prop drilling
  const loading = mapLoading || searchLoading;
  const setLoading = (val: boolean) => { }; // No-op, managed by hooks

  // 2.4: Track map transform state for mini-map and counter-scaling
  const [mapTransform, setMapTransform] = useState({ scale: 1, posX: 0, posY: 0 });

  const [selectedCutStations, setSelectedCutStations] = useState<Set<string>>(new Set());
  const [selectedCutSegments, setSelectedCutSegments] = useState<Set<string>>(new Set());
  const [selectedRestLocation, setSelectedRestLocation] = useState<string | null>(null);
  const [altServiceIsland, setAltServiceIsland] = useState<string | null>(null);
  // Consolidated diagram state: null = closed, string = which diagram is open
  const [openDiagram, setOpenDiagram] = useState<string | null>(null);

  const [depotSyncing, setDepotSyncing] = useState(false);
  const [selectedTrain, setSelectedTrain] = useState<LivePersonnel | null>(null);

  const [isRealMallaOpen, setIsRealMallaOpen] = useState(false);
  const [theoryCircsLocal, setTheoryCircsLocal] = useState<MallaCirculation[]>([]);
  const [realMallaCircs, setRealMallaCircs] = useState<MallaCirculation[]>([]);

  const serveiTypes = ['0', '100', '400', '500'];

  const resetAllModeData = () => {
    feedback.click();
    setMode('INIT');
    setQuery('');
    setSearchedCircData(null);
    setMainDriverInfo(null);
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

    const islands = getConnectivityIslands(selectedCutStations, selectedCutSegments);
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
      // Live personnel (Trains and Rest) should respect the service filter (Schedule Type)
      if (!isServiceVisible(p.servei, selectedServei)) return;

      const st = (p.stationId || '').toUpperCase().trim();
      const code = MAP_STATIONS.find(ms => ms.id === st || ms.label.toUpperCase() === st)?.id || st;

      let isAffected = false;
      if (effectiveCutStations.has(code) && !p.isMoving) isAffected = true;
      if (!isAffected && p.isMoving && p.nextStationId) {
        const nextCode = MAP_STATIONS.find(ms => ms.id === p.nextStationId?.toUpperCase() || ms.label.toUpperCase() === p.nextStationId?.toUpperCase())?.id || p.nextStationId;
        const s1 = `${code}-${nextCode}-V1`, s2 = `${code}-${nextCode}-V2`;
        const s1r = `${nextCode}-${code}-V1`, s2r = `${nextCode}-${code}-V2`;
        if (selectedCutSegments.has(s1) || selectedCutSegments.has(s2) || selectedCutSegments.has(s1r) || selectedCutSegments.has(s2r)) isAffected = true;
      }

      if (isAffected) result.AFFECTED.list.push(p);
      else if (islands.BCN.has(code)) result.BCN.list.push(p);
      else if (vallesUnified && (islands.S1.has(code) || islands.S2.has(code))) result.VALLES.list.push(p);
      else if (islands.S1.has(code)) result.S1.list.push(p);
      else if (islands.S2.has(code)) result.S2.list.push(p);
      else if (islands.L6.has(code)) result.L6.list.push(p);
      else if (islands.L7.has(code)) result.L7.list.push(p);
      else result.ISOLATED.list.push(p);
    });
    return result;
  }, [liveData, selectedCutStations, selectedCutSegments, selectedServei]);

  const groupedRestPersonnel = useMemo(() => {
    const rest = liveData.filter(p => p.type === 'REST' && isServiceVisible(p.servei, selectedServei));
    const grouped: Record<string, LivePersonnel[]> = {};
    rest.forEach(p => { if (!grouped[p.stationId]) grouped[p.stationId] = []; grouped[p.stationId].push(p); });
    return grouped;
  }, [liveData, selectedServei]);

  const CompactRow: React.FC<{ torn: EnrichedShift, color: string, label?: React.ReactNode, sub?: string }> = ({ torn, color, label, sub }) => (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all flex items-center gap-4 border-l-4 ${color}`}>
      <div className="h-10 min-w-[2.5rem] px-2 bg-fgc-grey/10 dark:bg-black text-[#4D5358] dark:text-gray-300 rounded-xl flex items-center justify-center font-bold text-xs shrink-0">{torn.id}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2"><p className="text-sm font-bold text-[#4D5358] dark:text-gray-200 truncate uppercase">{torn.drivers[0]?.cognoms}, {torn.drivers[0]?.nom}</p>{label}</div>
        <p className="text-[8px] font-bold text-gray-300 dark:text-gray-600 uppercase tracking-widest truncate">Nom. {torn.drivers[0]?.nomina} • {torn.inici_torn}-{torn.final_torn} {sub ? `• ${sub}` : ''}</p>
      </div>
      <div className="flex gap-1 shrink-0">{torn.drivers[0]?.phones?.map((p: string, i: number) => (
        <a key={i} href={isPrivacyMode ? undefined : `tel:${p}`} className={`w-9 h-9 bg-fgc-grey dark:bg-black text-white rounded-xl flex items-center justify-center hover:bg-fgc-green transition-all shadow-sm ${isPrivacyMode ? 'cursor-default' : ''}`}><Phone size={14} /></a>
      ))}</div>
    </div>
  );



  // AlternativeServiceOverlay extraído a ./incidencia/AlternativeServiceOverlay.tsx

  // TrainInspectorPopup extraído a components/TrainInspectorPopup.tsx

  return (
    <>
      <div className="relative min-h-screen p-4 sm:p-8 space-y-6 animate-in fade-in duration-700 overflow-x-hidden">
        {/* Header con Parallax Suave */}
        <ShiftHeader
          mode={mode}
          selectedServei={selectedServei}
          onServeiChange={setSelectedServei}
          serveiTypes={serveiTypes}
        />

        {mode === 'INIT' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 py-12 max-w-6xl mx-auto">
            <button onClick={() => { feedback.deepClick(); setMode('MAQUINISTA'); }} className="group glass-card glass-interactive p-10 rounded-[48px] border border-gray-100 dark:border-white/5 shadow-xl transition-all flex flex-col items-center gap-6"><div className="w-24 h-24 bg-red-50 dark:bg-red-950/20 rounded-full flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform"><User size={48} /></div><div className="text-center"><h3 className="text-2xl font-bold text-[#4D5358] dark:text-white uppercase tracking-tight">Per Circulació</h3><p className="text-sm font-medium text-gray-400 mt-2">Identifica tren i busca cobertura avançada amb intercepció de reserves.</p></div></button>
            <button onClick={() => { feedback.deepClick(); setMode('LINIA'); }} className="group glass-card glass-interactive p-10 rounded-[48px] border border-gray-100 dark:border-white/5 shadow-xl transition-all flex flex-col items-center gap-6"><div className="w-24 h-24 bg-fgc-green/10 rounded-full flex items-center justify-center text-fgc-green group-hover:scale-110 transition-transform"><MapIcon size={48} /></div><div className="text-center"><h3 className="text-2xl font-bold text-[#4D5358] dark:text-white uppercase tracking-tight">Per Línia / Tram</h3><p className="text-sm font-medium text-gray-400 mt-2">Gestiona talls de servei i identifica personal a cada costat.</p></div></button>
            <button onClick={() => { feedback.deepClick(); setMode('PER_TORN'); }} className="group glass-card glass-interactive p-10 rounded-[48px] border border-gray-100 dark:border-white/5 shadow-xl transition-all flex flex-col items-center gap-6"><div className="w-24 h-24 bg-blue-50 dark:bg-blue-950/20 rounded-full flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform"><RotateCcw size={48} /></div><div className="text-center"><h3 className="text-2xl font-bold text-[#4D5358] dark:text-white uppercase tracking-tight">Per Torn</h3><p className="text-sm font-medium text-gray-400 mt-2">Cobreix totes les circulacions d'un torn descobert utilitzant els buits d'altres.</p></div></button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex justify-start">
              <button
                onClick={resetAllModeData}
                className="flex items-center gap-2 text-gray-400 dark:text-gray-500 hover:text-[#4D5358] dark:hover:text-white transition-colors"
              >
                <ArrowLeft size={16} />
                <span className="text-xs font-bold uppercase tracking-widest">Tornar enrere</span>
              </button>
            </div>

            {mode === 'MAQUINISTA' && (
              <ErrorBoundary sectionName="Cerca per Circulació">
                <div className="space-y-6">

                  <IncidentDashboard
                    query={query}
                    setQuery={setQuery}
                    onSearch={handleSearchCirculation}
                    loading={loading}
                    searchedCircData={searchedCircData}
                    mainDriverInfo={mainDriverInfo}
                    passengerResults={passengerResults}
                    adjacentResults={adjacentResults}
                    restingResults={restingResults}
                    extensibleResults={extensibleResults}
                    reserveInterceptResults={reserveInterceptResults}
                    isPrivacyMode={isPrivacyMode}
                  />
                </div>
              </ErrorBoundary>
            )}

            {mode === 'LINIA' && (
              <ErrorBoundary sectionName="Mapa de Línia / Tram">
                <div className="w-full">
                  <IncidentMap
                    liveData={liveData}
                    parkedUnits={parkedUnits}
                    onParkedUnitsChange={onParkedUnitsChange}
                    selectedTrain={selectedTrain}
                    setSelectedTrain={setSelectedTrain}
                    openDiagram={openDiagram}
                    setOpenDiagram={setOpenDiagram}
                    isRealTime={isRealTime}
                    setIsRealTime={setIsRealTime}
                    customTime={customTime}
                    setCustomTime={setCustomTime}
                    isPaused={isPaused}
                    setIsPaused={setIsPaused}
                    isGeoTrenEnabled={isGeoTrenEnabled}
                    setIsGeoTrenEnabled={setIsGeoTrenEnabled}
                    geoTrenData={geoTrenData}
                    mapTransform={mapTransform}
                    setMapTransform={setMapTransform}
                    selectedCutStations={selectedCutStations}
                    setSelectedCutStations={setSelectedCutStations}
                    selectedCutSegments={selectedCutSegments}
                    setSelectedCutSegments={setSelectedCutSegments}
                    dividedPersonnel={dividedPersonnel}
                    selectedRestLocation={selectedRestLocation}
                    setSelectedRestLocation={setSelectedRestLocation}
                    groupedRestPersonnel={groupedRestPersonnel}
                    isPrivacyMode={isPrivacyMode}
                    depotSyncing={depotSyncing}
                    setDepotSyncing={setDepotSyncing}
                    setAltServiceIsland={setAltServiceIsland}
                    manualOverrides={manualOverrides}
                    setManualOverrides={setManualOverrides}
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                    selectedServei={selectedServei}
                    theoryCircsLocal={theoryCircsLocal}
                    setTheoryCircsLocal={setTheoryCircsLocal}
                    allShifts={allShifts}
                    setAllShifts={setAllShifts}
                    setRealMallaCircs={setRealMallaCircs}
                    setIsRealMallaOpen={setIsRealMallaOpen}
                    setQuery={setQuery}
                    handleSearchCirculation={handleSearchCirculation}
                    loading={loading}
                    setLoading={setLoading}
                  />
                </div>
              </ErrorBoundary>
            )}
            {mode === 'PER_TORN' && (
              <ErrorBoundary sectionName="Cobertura per Torn">
                <IncidenciaPerTorn selectedServei={selectedServei} showSecretMenu={showSecretMenu} isPrivacyMode={isPrivacyMode} />
              </ErrorBoundary>
            )}

          </div>
        )}
      </div>

      {mode === 'INIT' && !loading && (
        <div className="py-32 text-center opacity-10 flex flex-col items-center">
          <ShieldAlert size={100} className="text-[#4D5358] mb-8" />
          <p className="text-xl font-bold uppercase tracking-[0.4em] text-[#4D5358]">Centre de Gestió Operativa</p>
        </div>
      )}

      {altServiceIsland && (
        <ErrorBoundary sectionName="Servei Alternatiu">
          <AlternativeServiceOverlay
            islandId={altServiceIsland}
            dividedPersonnel={dividedPersonnel}
            selectedServei={selectedServei}
            allShifts={allShifts}
            displayMin={displayMin}
            showToast={showToast}
            onClose={() => setAltServiceIsland(null)}
            isPrivacyMode={isPrivacyMode}
            parkedUnits={parkedUnits}
            selectedCutSegments={selectedCutSegments}
          />
        </ErrorBoundary>
      )}
      {
        isRealMallaOpen && createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white dark:bg-fgc-grey w-full max-w-7xl h-[90vh] rounded-[48px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
              <div className="p-6 border-b border-gray-100 dark:border-white/5 flex items-center justify-between bg-gray-50/50 dark:bg-black/20">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-orange-500 rounded-2xl text-white shadow-lg"><TrendingUp size={24} /></div>
                  <div>
                    <h3 className="text-xl font-bold text-[#4D5358] dark:text-white uppercase tracking-tight">Malla Real Interactiva</h3>
                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Servei Seleccionat: S-{selectedServei}</p>
                  </div>
                </div>
                <button onClick={() => setIsRealMallaOpen(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
              </div>
              <div className="flex-1 overflow-hidden p-6">
                <MallaVisualizer circs={realMallaCircs} />
              </div>
            </div>
          </div>,
          document.body
        )
      }
    </>
  );
};

export const IncidenciaView = React.memo(IncidenciaViewComponent);
export default IncidenciaView;