import React from 'react';
import { useDrop } from 'react-dnd';
import { X } from 'lucide-react';
import DraggableUnit from '../train/DraggableUnit';

interface DroppableTrackProps {
    track: { id: string; label: string; capacity: number };
    units: any[];
    onDropUnit: (unit: string, trackId: string) => void;
    onRemoveUnit: (unit: string) => void;
    brokenTrains: Set<string>;
    imageTrains: Set<string>;
    recordTrains: Set<string>;
    cleaningTrains: Set<string>;
    capacity: number;
}

const DroppableTrack: React.FC<DroppableTrackProps> = ({ track, units, onDropUnit, onRemoveUnit, brokenTrains, imageTrains, recordTrains, cleaningTrains, capacity }) => {
    const [{ isOver, canDrop }, drop] = useDrop(() => ({
        accept: 'UNIT',
        drop: (item: { unit_number: string }) => onDropUnit(item.unit_number, track.id),
        collect: (monitor) => ({ isOver: !!monitor.isOver(), canDrop: !!monitor.canDrop() }),
    }));

    return (
        <div
            ref={(el) => { if (el) drop(el); }}
            className={`relative p-3 rounded-2xl border-2 border-dashed transition-all min-h-[80px] flex items-center gap-3 ${isOver ? 'bg-blue-500/10 border-blue-500 scale-[1.01]' : canDrop ? 'bg-blue-500/5 border-blue-500/30' : 'bg-gray-50/50 dark:bg-black/20 border-gray-100 dark:border-white/5'}`}
        >
            <div className="w-14 h-10 bg-white dark:bg-gray-800 border border-gray-100 dark:border-white/5 rounded-xl flex flex-col items-center justify-center shadow-sm shrink-0">
                <span className="text-[7px] font-black text-gray-400 uppercase tracking-tighter leading-none mb-0.5">VIA</span>
                <span className="text-xs font-black text-blue-600 leading-none">{track.id}</span>
                <div className={`mt-0.5 py-0.5 px-1.5 rounded-full text-[7px] font-black ${units.length >= capacity ? 'bg-red-500 text-white' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'}`}>
                    {units.length}/{capacity}
                </div>
            </div>
            <div className="flex-1 flex flex-wrap gap-2 py-2">
                {units.length > 0 ? units.map((u: any, i: number) => (
                    <div key={i} className="relative group/unit">
                        <DraggableUnit
                            unit={u.unit_number}
                            isBroken={brokenTrains.has(u.unit_number)}
                            needsImages={imageTrains.has(u.unit_number)}
                            needsRecords={recordTrains.has(u.unit_number)}
                            needsCleaning={cleaningTrains.has(u.unit_number)}
                        />
                        <button onClick={() => onRemoveUnit(u.unit_number)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/unit:opacity-100 transition-all shadow-lg z-10"><X size={8} /></button>
                    </div>
                )) : <div className="text-[9px] font-bold text-gray-300 dark:text-gray-700 uppercase tracking-widest italic ml-2">Lliure</div>}
            </div>
        </div>
    );
};

export default DroppableTrack;
