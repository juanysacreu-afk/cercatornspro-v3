import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, RefreshCcw, Search, GitBranch, Phone, Clock } from 'lucide-react';
import type { GanttBar } from '../hooks/useGanttData';
import { feedback } from '../../../utils/feedback';

export interface ContextMenuProps {
    x: number;
    y: number;
    bar: GanttBar;
    clickedTime: string;
    onClose: () => void;
    onMarkIncident: () => void;
    onMarkUncovered: () => void;
    onClearIncident: () => void;
    onViewTurn: () => void;
    onAssignAnother: () => void;
    isPrivacyMode: boolean;
}

export const GanttContextMenu: React.FC<ContextMenuProps> = ({
    x, y, bar, clickedTime, onClose,
    onMarkIncident, onMarkUncovered, onClearIncident,
    onViewTurn, onAssignAnother, isPrivacyMode
}) => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        const handleClickOutside = () => onClose();
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [onClose]);

    if (typeof document === 'undefined') return null;

    // Boundary check for desktop
    const menuWidth = 220;
    const menuHeight = 240;
    const adjustedX = Math.min(x, window.innerWidth - menuWidth - 10);
    const adjustedY = Math.min(y, window.innerHeight - menuHeight - 10);

    return createPortal(
        <>
            {isMobile && (
                <div 
                    className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[9998] animate-in fade-in duration-200"
                    onClick={onClose}
                />
            )}
            <div
                className={`fixed z-[9999] bg-white dark:bg-gray-800 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] border border-gray-200 dark:border-white/10 py-1.5 min-w-[220px] animate-in fade-in zoom-in-95 duration-100 overflow-hidden ${isMobile ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[85vw] max-w-[320px]' : ''}`}
                style={isMobile ? {} : { left: adjustedX, top: adjustedY }}
                onClick={(e) => e.stopPropagation()}
            >
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 mb-1">
                <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-gray-800 dark:text-gray-200">{bar.shortId}</span>
                    <span className="flex items-center gap-1 text-[10px] font-mono text-gray-500 bg-gray-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
                        <Clock size={10} />
                        {clickedTime}
                    </span>
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">{bar.driverName || 'Sense conductor'}</div>
            </div>

            {!bar.incidentStartTime ? (
                <>
                    <button
                        onClick={onMarkIncident}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600 flex items-center gap-2"
                    >
                        <AlertTriangle size={12} className="text-amber-500" />
                        Marcar Indisposició
                    </button>
                    <button
                        onClick={onMarkUncovered}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 flex items-center gap-2"
                    >
                        <AlertTriangle size={12} className="text-red-500" />
                        Marcar Torn Descobert
                    </button>
                </>
            ) : (
                <button
                    onClick={onClearIncident}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                >
                    <RefreshCcw size={12} />
                    Esborrar Marcació
                </button>
            )}

            <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />

            <button
                onClick={onViewTurn}
                className="w-full text-left px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2"
            >
                <Search size={12} />
                Veure el torn (Cercar)
            </button>

            {(bar.dependencia === 'EXTRA' || /R/i.test(bar.shortId)) && (
                <button
                    onClick={onAssignAnother}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center gap-2"
                >
                    <GitBranch size={12} />
                    Assignar a un altre torn
                </button>
            )}

            {bar.driverPhone && (
                <a
                    href={isPrivacyMode ? undefined : `tel:${bar.driverPhone}`}
                    className={`w-full text-left px-3 py-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 flex items-center gap-2 ${isPrivacyMode ? 'cursor-default' : ''}`}
                    onClick={(e) => {
                        if (isPrivacyMode) e.preventDefault();
                        feedback.click();
                    }}
                >
                    <Phone size={14} />
                    {isPrivacyMode ? 'Trucar: *** ** ** **' : `Trucar: ${bar.driverPhone}`}
                </a>
            )}
        </div>
        </>,
        document.body
    );
};

export default GanttContextMenu;
