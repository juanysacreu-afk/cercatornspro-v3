import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Layers, Activity, LayoutGrid, Construction, Info } from 'lucide-react';
import GlassPanel from '../../components/common/GlassPanel';
import {
  isServiceVisible,
  S1_STATIONS, S2_STATIONS, L6_STATIONS, L12_STATIONS
} from '../../utils/stations';
import type { LivePersonnel, ParkedUnit } from '../../types';

// Custom Hook
import { useAlternativeService } from './hooks/useAlternativeService';

// Sub-components
import ResourceConfigPanel from './components/ResourceConfigPanel';
import AlternativeServiceGraph from './components/AlternativeServiceGraph';
import CirculationsTable from './components/CirculationsTable';
import ShiftsSummary from './components/ShiftsSummary';

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

  if (!dividedPersonnel || !dividedPersonnel[islandId]) return null;
  
  const personnel = (dividedPersonnel[islandId].list || []).filter(p => isServiceVisible(p.servei, selectedServei));
  const islandStations = dividedPersonnel[islandId].stations;
  const physicalTrains = personnel.filter(p => p.type === 'TRAIN');
  const allDrivers = [...personnel];


  const canSupportS1 = Array.from(islandStations).some(s => S1_STATIONS.includes(s));
  const canSupportS2 = Array.from(islandStations).some(s => S2_STATIONS.includes(s));
  const canSupportL6 = Array.from(islandStations).some(s => L6_STATIONS.includes(s));
  const canSupportL7Full = islandStations.has('PC') && islandStations.has('TB');
  const canSupportL7Local = islandStations.has('GR') && islandStations.has('TB') && !canSupportL7Full;
  const canSupportL12 = islandStations.has('SR') && islandStations.has('RE');

  const {
    lineCounts,
    lineHeadways,
    enabledLines,
    normalLines,
    generatedCircs,
    generating,
    shuttlePlan,
    updateCount,
    updateHeadway,
    toggleLine,
    toggleNormal,
    handleGenerateCirculations,
    autoRecalculateHeadways
  } = useAlternativeService({
    islandId,
    islandStations,
    physicalTrains,
    allDrivers,
    selectedServei,
    allShifts,
    displayMin,
    parkedUnits,
    selectedCutSegments,
    showToast,
    canSupportS1,
    canSupportS2,
    canSupportL6,
    canSupportL7Full,
    canSupportL7Local,
    canSupportL12
  });

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

  const handleExportXLS = () => {
    const csvContent = [
      ['ID', 'Linia', 'Ruta', 'Sortida', 'Arribada', 'Tren', 'Maquinista', 'Torn'].join('\t'),
      ...generatedCircs.map(c => [c.id, c.linia, c.route, c.sortida, c.arribada, c.train, c.driver, c.torn].join('\t'))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Segregacio_${islandId}_${new Date().toISOString().split('T')[0]}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalRequiredTrains = Object.values(lineCounts).reduce((a, b) => a + b, 0);
  const totalRequiredDrivers = totalRequiredTrains;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#4D5358]/60 dark:bg-black/80 backdrop-blur-xl animate-in fade-in duration-500" onClick={onClose} />

      <div className="relative w-full max-w-7xl h-[92vh] flex flex-col animate-in zoom-in-95 duration-500">
        <GlassPanel className="h-full flex flex-col border-white/20 dark:border-white/10 overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-8 border-b border-gray-100 dark:border-white/5 bg-white/50 dark:bg-black/20 backdrop-blur-md">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 bg-orange-500/10 p-4 rounded-3xl border border-orange-500/20">
                <Construction size={24} className="text-orange-500 animate-pulse" />
                <div className="flex flex-col">
                  <h2 className="text-lg font-heavy text-[#4D5358] dark:text-white uppercase tracking-tighter leading-none mb-1">Nexus Segregation Engine</h2>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-orange-500 rounded-lg">
                      <span className="text-[9px] font-heavy text-white uppercase">{islandId}</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{dividedPersonnel[islandId].label}</span>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/5 p-1.5 rounded-[24px] border border-gray-200 dark:border-white/10">
                <button
                  onClick={() => setViewMode('RESOURCES')}
                  className={`flex items-center gap-2.5 px-6 py-2.5 rounded-[20px] text-[10px] font-bold uppercase transition-all ${viewMode === 'RESOURCES' ? 'bg-white dark:bg-gray-800 text-[#4D5358] dark:text-white shadow-lg' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
                >
                  <Layers size={14} className={viewMode === 'RESOURCES' ? 'text-blue-500' : ''} />
                  <span>Configuració</span>
                </button>
                <button
                  onClick={() => setViewMode('CIRCULATIONS')}
                  className={`flex items-center gap-2.5 px-6 py-2.5 rounded-[20px] text-[10px] font-bold uppercase transition-all ${viewMode === 'CIRCULATIONS' ? 'bg-white dark:bg-gray-800 text-[#4D5358] dark:text-white shadow-lg' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
                >
                  <Activity size={14} className={viewMode === 'CIRCULATIONS' ? 'text-green-500' : ''} />
                  <span>Circulacions</span>
                </button>
                <button
                  onClick={() => setViewMode('SHIFTS')}
                  className={`flex items-center gap-2.5 px-6 py-2.5 rounded-[20px] text-[10px] font-bold uppercase transition-all ${viewMode === 'SHIFTS' ? 'bg-white dark:bg-gray-800 text-[#4D5358] dark:text-white shadow-lg' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
                >
                  <LayoutGrid size={14} className={viewMode === 'SHIFTS' ? 'text-orange-500' : ''} />
                  <span>Torns</span>
                </button>
                {generatedCircs.length > 0 && (
                  <button
                    onClick={() => setViewMode('GRAPH')}
                    className={`flex items-center gap-2.5 px-6 py-2.5 rounded-[20px] text-[10px] font-bold uppercase transition-all ${viewMode === 'GRAPH' ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20' : 'text-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-500/10'}`}
                  >
                    <Activity size={14} />
                    <span>Malla Gràfica</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 text-gray-400">
                <Info size={14} />
                <span className="text-[10px] font-bold uppercase racking-widest">v2.1 Algoritme NEXUS_BV</span>
              </div>
              <button onClick={onClose} className="p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-white/10 rounded-2xl text-gray-400 hover:text-red-500 hover:border-red-500/20 hover:bg-red-50 transition-all shadow-sm">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-auto p-8 bg-gray-50/50 dark:bg-transparent custom-scrollbar">
            {viewMode === 'RESOURCES' && (
              <ResourceConfigPanel
                lineCounts={lineCounts}
                lineHeadways={lineHeadways}
                enabledLines={enabledLines}
                normalLines={normalLines}
                shuttlePlan={shuttlePlan}
                physicalTrainsCount={physicalTrains.length}
                allDriversCount={allDrivers.length}
                totalRequiredTrains={totalRequiredTrains}
                totalRequiredDrivers={totalRequiredDrivers}
                updateCount={updateCount}
                updateHeadway={updateHeadway}
                toggleLine={toggleLine}
                toggleNormal={toggleNormal}
                autoRecalculateHeadways={autoRecalculateHeadways}
                handleGenerateCirculations={handleGenerateCirculations}
                generating={generating}
                canSupportS1={canSupportS1}
                canSupportS2={canSupportS2}
                canSupportL6={canSupportL6}
                canSupportL7Full={canSupportL7Full}
                canSupportL12={canSupportL12}
              />
            )}

            {viewMode === 'CIRCULATIONS' && (
              <CirculationsTable
                generatedCircs={generatedCircs}
                onExport={handleExportXLS}
              />
            )}

            {viewMode === 'SHIFTS' && (
              <ShiftsSummary generatedCircs={generatedCircs} />
            )}

            {viewMode === 'GRAPH' && (
              <AlternativeServiceGraph
                generatedCircs={generatedCircs}
                lineFilters={lineFilters}
                toggleLineFilter={toggleLineFilter}
                displayMin={displayMin}
                islandStations={islandStations}
                setViewMode={setViewMode}
              />
            )}
          </div>
        </GlassPanel>
      </div>
    </div>,
    document.body
  );
};

export default AlternativeServiceOverlay;
