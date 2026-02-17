import React from 'react';
import { useDrag } from 'react-dnd';
import { Train, AlertTriangle, Camera, FileText, Brush } from 'lucide-react';

interface DraggableUnitProps {
    unit: string;
    isBroken: boolean;
    needsImages: boolean;
    needsRecords: boolean;
    needsCleaning: boolean;
}

const DraggableUnit: React.FC<DraggableUnitProps> = ({ unit, isBroken, needsImages, needsRecords, needsCleaning }) => {
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'UNIT',
        item: { unit_number: unit },
        collect: (monitor) => ({ isDragging: !!monitor.isDragging() }),
    }));

    return (
        <div
            ref={(el) => { if (el) drag(el); }}
            className={`min-w-[90px] sm:min-w-[100px] p-2 rounded-xl border flex items-center gap-2 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-all ${isDragging ? 'opacity-40' : 'opacity-100'} ${isBroken
                ? 'bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30'
                : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-white/10'
                }`}
        >
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isBroken ? 'bg-red-500 text-white' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600'}`}>
                {isBroken ? <AlertTriangle size={12} /> : <Train size={12} />}
            </div>
            <div className="min-w-0 font-black">
                <p className={`text-[10px] truncate leading-none ${isBroken ? 'text-red-700 dark:text-red-400' : 'text-fgc-grey dark:text-white'}`}>{unit}</p>
                <div className="flex gap-0.5 mt-1">
                    {needsImages && <Camera size={8} className="text-blue-500" />}
                    {needsRecords && <FileText size={8} className="text-yellow-500" />}
                    {needsCleaning && <Brush size={8} className="text-orange-500" />}
                </div>
            </div>
        </div>
    );
};

export default DraggableUnit;
