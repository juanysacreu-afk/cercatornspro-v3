import React from 'react';
import { Bell, AlertTriangle, Camera, FileText, Brush } from 'lucide-react';
import GlassPanel from '../../components/common/GlassPanel';

interface CiclesMaintenanceTabProps {
    maintenanceAlerts: any[];
    handleUpdateNotes: (unit: string, type: string, notes: string) => void;
    handleUpdateStatusDate: (unit: string, type: string, date: string) => void;
}

const CiclesMaintenanceTab: React.FC<CiclesMaintenanceTabProps> = ({ maintenanceAlerts, handleUpdateNotes, handleUpdateStatusDate }) => {
    return (
        <div className="animate-in fade-in slide-in-from-right-8 duration-700 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
                <GlassPanel className="p-8 overflow-hidden">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 bg-red-500 rounded-2xl text-white">
                            <Bell />
                        </div>
                        <h2 className="text-xl font-black uppercase text-fgc-grey dark:text-white">Manteniment</h2>
                    </div>
                    <div className="space-y-4">
                        {maintenanceAlerts.map((a, i) => {
                            const [isExpanded, setIsExpanded] = React.useState(false);
                            const conf = a.type === 'BROKEN' ? { icon: <AlertTriangle size={14} />, label: 'Avaria', color: 'bg-red-500' } :
                                a.type === 'IMAGES' ? { icon: <Camera size={14} />, label: 'Imatges', color: 'bg-blue-600' } :
                                    a.type === 'RECORDS' ? { icon: <FileText size={14} />, label: 'Registres', color: 'bg-yellow-500' } :
                                        { icon: <Brush size={14} />, label: 'Neteja', color: 'bg-orange-500' };

                            return (
                                <div key={`${a.unit}-${a.type}`} className="flex flex-col md:flex-row items-stretch md:items-center justify-between p-4 sm:p-6 rounded-3xl bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/5 gap-4">
                                    {/* Mobile & Desktop Header */}
                                    <div className="flex items-center justify-between md:justify-start gap-4 sm:gap-6 flex-1">
                                        <div className="flex items-center gap-4">
                                            <div className="text-center font-black shrink-0">
                                                <p className="text-[10px] text-gray-400 uppercase">Unitat</p>
                                                <p className="text-xl">{a.unit}</p>
                                            </div>
                                            <div className="w-px h-8 bg-gray-200 dark:bg-white/10 shrink-0 hidden md:block" />
                                            <div className="shrink-0">
                                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-black text-white ${conf.color}`}>
                                                    {conf.icon}
                                                    <span>{conf.label}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Mobile Toggle Button */}
                                        <button
                                            onClick={() => setIsExpanded(!isExpanded)}
                                            className="md:hidden p-2 bg-gray-100 dark:bg-white/10 rounded-xl text-fgc-grey dark:text-gray-300"
                                        >
                                            <FileText size={18} />
                                        </button>
                                    </div>

                                    {/* Desktop Content (Always Visible) */}
                                    <div className="hidden md:flex flex-1 items-center gap-6">
                                        <div className="w-px h-8 bg-gray-200 dark:bg-white/10 shrink-0" />
                                        <div className="flex-1 max-w-md ml-4">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Observacions</p>
                                            <input
                                                type="text"
                                                defaultValue={a.notes || ''}
                                                placeholder="Afegir nota..."
                                                onBlur={(e) => handleUpdateNotes(a.unit, a.type, e.target.value)}
                                                className="w-full bg-transparent text-[11px] font-bold outline-none border-b border-gray-100 dark:border-white/10 focus:border-fgc-green transition-all pb-1"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1 items-end">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data Registre</p>
                                            <input
                                                type="date"
                                                value={a.since ? a.since.split('T')[0] : ''}
                                                onChange={(e) => handleUpdateStatusDate(a.unit, a.type, new Date(e.target.value).toISOString())}
                                                className="bg-transparent text-sm font-black outline-none border-b border-dashed border-gray-300 dark:border-white/10 focus:border-fgc-green transition-colors text-fgc-grey dark:text-gray-300 p-0"
                                            />
                                        </div>
                                    </div>

                                    {/* Mobile Content (Collapsible) */}
                                    {isExpanded && (
                                        <div className="md:hidden flex flex-col gap-4 mt-2 pt-4 border-t border-gray-200 dark:border-white/5 animate-in slide-in-from-top-2">
                                            <div className="w-full">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Observacions</p>
                                                <textarea
                                                    defaultValue={a.notes || ''}
                                                    placeholder="Afegir nota..."
                                                    onBlur={(e) => handleUpdateNotes(a.unit, a.type, e.target.value)}
                                                    className="w-full bg-white dark:bg-black/20 p-3 rounded-xl text-sm font-bold outline-none border border-gray-200 dark:border-white/10 focus:border-fgc-green transition-all resize-none h-24"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data Registre</p>
                                                <input
                                                    type="date"
                                                    value={a.since ? a.since.split('T')[0] : ''}
                                                    onChange={(e) => handleUpdateStatusDate(a.unit, a.type, new Date(e.target.value).toISOString())}
                                                    className="w-full bg-white dark:bg-black/20 p-3 rounded-xl text-sm font-black outline-none border border-gray-200 dark:border-white/10 focus:border-fgc-green transition-colors text-fgc-grey dark:text-gray-300"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </GlassPanel>
            </div>
            <div className="space-y-6">
                <GlassPanel className="p-8">
                    <h3 className="font-black uppercase mb-4 text-fgc-grey dark:text-white">Informació</h3>
                    <p className="text-xs text-gray-500">Les alertes es mostren segons l'estat actual registrat a la base de dades en temps real.</p>
                </GlassPanel>
            </div>
        </div>
    );
};

export default CiclesMaintenanceTab;
