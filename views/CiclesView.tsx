import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Train,
  MapPin,
  Bell,
  Gauge,
  AlertTriangle,
  Camera,
  FileText,
  Brush,
  X,
  CheckCircle2
} from 'lucide-react';
import { feedback } from '../utils/feedback';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import GlassPanel from '../components/common/GlassPanel';
import { Skeleton, CardSkeleton, ListSkeleton } from '../components/common/Skeleton';

// Hooks
import { useCiclesData } from './cicles/hooks/useCiclesData';

// Components
import CiclesFleetTab from './cicles/CiclesFleetTab';
import CiclesDepotTab from './cicles/CiclesDepotTab';
import CiclesMaintenanceTab from './cicles/CiclesMaintenanceTab';
import CiclesKilometersTab from './cicles/CiclesKilometersTab';

interface CiclesViewProps {
  parkedUnits: any[];
  onParkedUnitsChange: () => Promise<void>;
}

type ViewMode = 'FLEET' | 'DEPOTS' | 'MAINTENANCE' | 'KILOMETERS';

const CiclesViewComponent: React.FC<CiclesViewProps> = ({ parkedUnits, onParkedUnitsChange }) => {
  const {
    loading, saving,
    assignments,
    brokenTrains, imageTrains, recordTrains, cleaningTrains,
    maintenanceAlerts, unitKilometers, availableShiftsCycles,
    allFleetTrains, notifications, FLEET_CONFIG,
    // Actions
    handleSaveAssignment,
    handleDeleteAssignment,
    handleDeleteAllAssignments,
    handleToggleStatus,
    handleUpdateStatusDate,
    handleUpdateNotes,
    handleAddParkedUnit,
    handleRemoveParkedUnit,
    handleSaveKilometers,
    handleDeleteKilometerRecord
  } = useCiclesData(parkedUnits, onParkedUnitsChange);

  const [activeView, setActiveView] = useState<ViewMode>('FLEET');
  const [selectedUnitDetail, setSelectedUnitDetail] = useState<string | null>(null);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-6 sm:space-y-8 p-4 sm:p-8 animate-in fade-in duration-700">
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#4D5358] dark:text-white tracking-tight uppercase title-glow">Gestió d'Unitats</h1>
            <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 font-medium tracking-tight">Assignació, estat de flota i dipòsits.</p>
          </div>
          <div className="flex bg-white/50 dark:bg-black/20 p-1 rounded-full border border-gray-100 dark:border-white/5 backdrop-blur-md shadow-sm">
            {[
              { id: 'FLEET', icon: <Train size={18} /> },
              { id: 'DEPOTS', icon: <MapPin size={18} /> },
              { id: 'MAINTENANCE', icon: <Bell size={18} /> },
              { id: 'KILOMETERS', icon: <Gauge size={18} /> }
            ].map(view => (
              <button
                key={view.id}
                onClick={() => { feedback.deepClick(); setActiveView(view.id as ViewMode); }}
                className={`p-2.5 rounded-full transition-all ${activeView === view.id ? 'bg-fgc-grey text-white shadow-lg scale-110' : 'text-gray-400 hover:text-[#4D5358] hover:bg-white dark:hover:bg-white/5'}`}
              >
                {view.icon}
              </button>
            ))}
          </div>
        </header>

        <div className="relative overflow-hidden min-h-[600px]">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in">
              <CardSkeleton /> <div className="lg:col-span-2"><ListSkeleton items={6} /></div>
            </div>
          ) : (
            <>
              {activeView === 'FLEET' && (
                <CiclesFleetTab
                  loading={loading}
                  saving={saving}
                  assignments={assignments}
                  brokenTrains={brokenTrains}
                  cleaningTrains={cleaningTrains}
                  recordTrains={recordTrains}
                  imageTrains={imageTrains}
                  availableShiftsCycles={availableShiftsCycles}
                  allFleetTrains={allFleetTrains}
                  handleSaveAssignment={handleSaveAssignment}
                  handleDeleteAssignment={handleDeleteAssignment}
                  handleDeleteAllAssignments={handleDeleteAllAssignments}
                  setSelectedUnitDetail={setSelectedUnitDetail}
                  FLEET_CONFIG={FLEET_CONFIG}
                />
              )}
              {activeView === 'DEPOTS' && (
                <CiclesDepotTab
                  parkedUnits={parkedUnits}
                  allFleetTrains={allFleetTrains}
                  brokenTrains={brokenTrains}
                  imageTrains={imageTrains}
                  recordTrains={recordTrains}
                  cleaningTrains={cleaningTrains}
                  handleAddParkedUnit={handleAddParkedUnit}
                  handleRemoveParkedUnit={handleRemoveParkedUnit}
                />
              )}
              {activeView === 'MAINTENANCE' && (
                <CiclesMaintenanceTab
                  maintenanceAlerts={maintenanceAlerts}
                  handleUpdateNotes={handleUpdateNotes}
                  handleUpdateStatusDate={handleUpdateStatusDate}
                />
              )}
              {activeView === 'KILOMETERS' && (
                <CiclesKilometersTab
                  allFleetTrains={allFleetTrains}
                  unitKilometers={unitKilometers}
                  saving={saving}
                  handleSaveKilometers={handleSaveKilometers}
                  handleDeleteKilometerRecord={handleDeleteKilometerRecord}
                  setSelectedUnitDetail={setSelectedUnitDetail}
                />
              )}
            </>
          )}
        </div>

        {/* Local Notifications (if needed overlay, though ToastProvider is preferred) */}
        {notifications.length > 0 && (
          <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
            {notifications.map(n => (
              <div key={n.id} className={`p-4 rounded-xl text-white shadow-2xl animate-in slide-in-from-right-full fade-in duration-300 ${n.type === 'error' ? 'bg-red-500' : 'bg-fgc-green'}`}>
                <p className="font-bold text-xs uppercase">{n.title}</p>
                <p className="text-sm">{n.message}</p>
              </div>
            ))}
          </div>
        )}

        {/* Unit Detail Overlay */}
        {selectedUnitDetail && (() => {
          const unit = selectedUnitDetail;
          const currentAssignment = assignments.find(a => a.train_number === unit);

          const isBroken = brokenTrains.has(unit);
          const needsImages = imageTrains.has(unit);
          const needsRecords = recordTrains.has(unit);
          const needsCleaning = cleaningTrains.has(unit);

          const history = unitKilometers
            .filter(k => k.unit_number === unit)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          const unitKm = history.length > 0 ? parseFloat(history[0].kilometers) : 0;

          return createPortal(
            <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedUnitDetail(null)} />
              <GlassPanel className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto p-0 rounded-[40px] shadow-2xl border-white/20">
                {/* Header Section */}
                <div className="sticky top-0 z-20 p-6 flex items-center justify-between border-b border-gray-100 dark:border-white/5 bg-white/90 dark:bg-fgc-grey/90 backdrop-blur-xl">
                  <div className="flex items-center gap-5">
                    <div className={`p-4 rounded-[24px] shadow-lg text-white ${isBroken ? 'bg-red-500' : 'bg-blue-600'}`}>
                      <Train size={32} />
                    </div>
                    <div>
                      <h2 className="text-3xl font-bold uppercase tracking-tighter leading-none">{unit}</h2>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="px-3 py-1 bg-gray-100 dark:bg-white/5 rounded-full text-[10px] font-bold text-gray-400 uppercase tracking-widest border border-gray-200/50 dark:border-white/5">
                          Sèrie {unit.split('.')[0]}
                        </span>
                        {currentAssignment && (
                          <span className="px-3 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full text-[10px] font-bold uppercase tracking-widest border border-blue-500/20">
                            Cicle: {currentAssignment.cycle_id}
                          </span>
                        )}
                        {isBroken && (
                          <span className="px-3 py-1 bg-red-500/10 text-red-600 dark:text-red-400 rounded-full text-[10px] font-bold uppercase tracking-widest border border-red-500/20">
                            AVARIA ACTIVA
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedUnitDetail(null)} className="p-4 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 rounded-[20px] transition-all"><X size={24} /></button>
                </div>

                <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Left Column: Status & Assignment */}
                  <div className="lg:col-span-4 space-y-8">
                    {/* Status Selection Section */}
                    <div className="space-y-4">
                      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 px-1">
                        <CheckCircle2 size={14} className="text-fgc-green" /> Estats de la Unitat
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { id: 'is_broken', label: 'AVARIA', icon: <AlertTriangle size={18} />, active: isBroken, color: 'red' },
                          { id: 'needs_images', label: 'IMATGES', icon: <Camera size={18} />, active: needsImages, color: 'blue' },
                          { id: 'needs_records', label: 'REGISTRES', icon: <FileText size={18} />, active: needsRecords, color: 'yellow' },
                          { id: 'needs_cleaning', label: 'NETEJA', icon: <Brush size={18} />, active: needsCleaning, color: 'orange' },
                        ].map(st => (
                          <button
                            key={st.id}
                            onClick={() => handleToggleStatus(unit, st.id, st.active)}
                            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-3xl border-2 transition-all hover:scale-[1.02] active:scale-95 ${st.active
                              ? `bg-${st.color}-500/10 border-${st.color}-500 text-${st.color}-500 shadow-lg`
                              : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-white/5 text-gray-400'}`}
                          >
                            {st.icon}
                            <span className="text-[10px] font-bold uppercase">{st.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Cycle Assignment Section */}
                    <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-white/5">
                      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 px-1">
                        <Train size={14} className="text-fgc-green" /> Assignació Actual
                      </h3>
                      {currentAssignment ? (
                        <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl flex items-center justify-between border border-gray-100 dark:border-white/5">
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase">Cicle Assignat</p>
                            <p className="text-xl font-bold text-[#4D5358] dark:text-white">{currentAssignment.cycle_id}</p>
                          </div>
                          <button
                            onClick={() => handleDeleteAssignment(currentAssignment.cycle_id)}
                            className="px-3 py-1.5 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg text-xs font-bold uppercase hover:bg-red-200 transition-colors"
                          >
                            Desassignar
                          </button>
                        </div>
                      ) : (
                        <div className="p-6 bg-gray-50/50 dark:bg-white/5 rounded-2xl border border-dashed border-gray-300 dark:border-white/10 text-center">
                          <p className="text-xs text-gray-400 italic">Sense assignació activa</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Mileage History */}
                  <div className="lg:col-span-8 space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 px-1">
                        <Gauge size={14} className="text-fgc-green" /> Històric de Kilometratge
                      </h3>
                      <div className="px-3 py-1 bg-fgc-green/10 text-fgc-green rounded-full text-xs font-bold">
                        TOTAL: {unitKm.toLocaleString()} KM
                      </div>
                    </div>

                    <div className="bg-gray-50/50 dark:bg-gray-800/50 rounded-[32px] p-1 border border-gray-100 dark:border-white/5 h-[400px] flex flex-col">
                      {history.length > 0 ? (
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                          {history.map((h, i) => (
                            <div key={h.id} className="grid grid-cols-3 gap-4 p-4 bg-white dark:bg-black/40 rounded-2xl border border-gray-100 dark:border-white/5 items-center hover:scale-[1.01] transition-transform">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center font-bold text-xs text-gray-500">
                                  {history.length - i}
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-gray-400 uppercase">Data Lectura</p>
                                  <p className="text-sm font-bold text-[#4D5358] dark:text-white">{new Date(h.date).toLocaleDateString()}</p>
                                </div>
                              </div>
                              <div className="text-center">
                                <p className="text-[10px] font-bold text-gray-400 uppercase">Kilometratge</p>
                                <p className="text-base font-bold text-[#4D5358] dark:text-white">{parseFloat(h.kilometers).toLocaleString()} <span className="text-xs text-gray-400">km</span></p>
                              </div>
                              <div className="text-right">
                                {i < history.length - 1 && (() => {
                                  const diff = parseFloat(h.kilometers) - parseFloat(history[i + 1].kilometers);
                                  return diff > 0 ? (
                                    <span className="text-xs font-bold text-fgc-green">+{diff.toLocaleString()} km</span>
                                  ) : (
                                    <span className="text-xs font-bold text-gray-300">-</span>
                                  );
                                })()}
                                {i === history.length - 1 && <span className="text-[10px] font-bold text-blue-400 uppercase">Lectura Inicial</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-50">
                          <Gauge size={48} className="text-gray-300 mb-4" />
                          <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">No hi ha dades de kilometratge</p>
                          <p className="text-xs text-gray-400 mt-2 max-w-xs">Utilitza la pestanya 'Kilòmetres' per afegir la primera lectura d'aquesta unitat.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </GlassPanel>
            </div>,
            document.body
          );
        })()}

      </div>
    </DndProvider>
  );
};

export default CiclesViewComponent;