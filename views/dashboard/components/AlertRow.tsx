import React from 'react';
import { AlertTriangle, Clock, Eye, ChevronRight } from 'lucide-react';
import type { PersonnelAlert } from '../hooks/useDashboardData';
import { feedback } from '../../../utils/feedback';

// ── AlertRow (C1 extraction) ───────────────────────────────────────────────
export const AlertRow: React.FC<{ alert: PersonnelAlert; onNavigate?: (type: string, query: string) => void }> = ({ alert, onNavigate }) => {
    const handleRowClick = () => {
        if (alert.tornId && onNavigate) {
            feedback.click();
            onNavigate('torn', alert.tornId);
        }
    };

    const severityStyles = {
        critical: 'border-l-red-500 bg-red-50/60 dark:bg-red-500/[0.06]',
        warning: 'border-l-amber-500 bg-amber-50/60 dark:bg-amber-500/[0.06]',
        info: 'border-l-blue-500 bg-blue-50/60 dark:bg-blue-500/[0.06]'
    };
    const severityIcons = {
        critical: <AlertTriangle size={16} className="text-red-500" />,
        warning: <Clock size={16} className="text-amber-500" />,
        info: <Eye size={16} className="text-blue-500" />
    };

    return (
        <div
            onClick={handleRowClick}
            className={`flex items-center gap-3 p-3.5 mx-1 rounded-2xl border-l-4 transition-all ${alert.tornId ? 'cursor-pointer hover:shadow-md hover:scale-[1.01] active:scale-[0.99]' : ''} ${severityStyles[alert.severity]}`}
        >
            <div className="shrink-0">{severityIcons[alert.severity]}</div>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[#4D5358] dark:text-white truncate">{alert.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{alert.subtitle}</div>
            </div>
            <ChevronRight size={14} className="text-gray-300 shrink-0" />
        </div>
    );
};

export default AlertRow;
