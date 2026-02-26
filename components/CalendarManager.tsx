import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Calendar, Save, Trash2, Edit3, AlertCircle, CheckCircle2, RefreshCcw } from 'lucide-react';
import {
    ServiceCalendarEntry,
    fetchCalendarYear,
    upsertCalendarEntry,
    deleteCalendarEntry,
    getServiceLabel,
    getServiceColor,
    invalidateServiceCalendarCache,
} from '../utils/serviceCalendar';
import { useToast } from './ToastProvider';

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

const MONTH_NAMES = ['Gener', 'Febrer', 'Març', 'Abril', 'Maig', 'Juny',
    'Juliol', 'Agost', 'Setembre', 'Octubre', 'Novembre', 'Desembre'];
const DAY_NAMES = ['Dl', 'Dm', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'];

const SERVICE_OPTIONS = [
    { value: '000', label: '000 — Laborable', color: 'bg-blue-500' },
    { value: '100', label: '100 — Divendres / Pre-festiu', color: 'bg-teal-500' },
    { value: '200', label: '200 — Agost Laborable', color: 'bg-cyan-400' },
    { value: '300', label: '300 — Agost Divendres', color: 'bg-cyan-600' },
    { value: '400', label: '400 — Dissabte / Festiu', color: 'bg-amber-500' },
    { value: '500', label: '500 — Diumenge / Post-festiu', color: 'bg-rose-500' },
    { value: '504', label: "504 — Cap d'Any (Nit contínua)", color: 'bg-rose-700' },
    { value: '600', label: '600 — Especial 600', color: 'bg-purple-500' },
    { value: '700', label: '700 — Diada / Especial', color: 'bg-red-600' },
    { value: '707', label: '707 — Diada (sense nit ant.)', color: 'bg-red-700' },
    { value: '800', label: '800 — Agost 1a/4a Setmana (Ll-Dj)', color: 'bg-orange-400' },
    { value: '900', label: '900 — Agost Divendres Extrem', color: 'bg-orange-600' },
    { value: '101', label: '101 — Divendres + Nit contínua', color: 'bg-teal-700' },
    { value: '102', label: "102 — Cap d'Any Nit total", color: 'bg-teal-800' },
    { value: '106', label: '106 — Vigília Nadal Nit total', color: 'bg-indigo-600' },
    { value: '003', label: '003 — Festiu + Post-nit (L6/12/7)', color: 'bg-blue-700' },
    { value: '405', label: '405 — Dissabte + Post-nit (L6/12/7)', color: 'bg-amber-700' },
    { value: '503', label: '503 — Diumenge + Post-nit (L6/12/7)', color: 'bg-rose-700' },
];

function getDefaultForDateStr(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    if (day === 0) return '500';
    if (day === 6) return '400';
    if (day === 5) return '100';
    return '000';
}

function formatDateStr(dateStr: string): string {
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function buildDateStr(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

type ViewMode = 'week' | 'month' | 'year';

interface CalendarManagerProps {
    onClose: () => void;
}

// ─────────────────────────────────────────────────────────
// Edit Day Modal
// ─────────────────────────────────────────────────────────

interface EditDayModalProps {
    dateStr: string;
    entry: ServiceCalendarEntry | null;
    defaultServiceId: string;
    onSave: (entry: ServiceCalendarEntry) => Promise<void>;
    onDelete: (date: string) => Promise<void>;
    onClose: () => void;
}

const EditDayModal: React.FC<EditDayModalProps> = ({
    dateStr, entry, defaultServiceId, onSave, onDelete, onClose
}) => {
    const [serviceId, setServiceId] = useState(entry?.service_id || defaultServiceId);
    const [description, setDescription] = useState(entry?.description || '');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        await onSave({ date: dateStr, service_id: serviceId, description });
        setSaving(false);
        onClose();
    };

    const handleDelete = async () => {
        setSaving(true);
        await onDelete(dateStr);
        setSaving(false);
        onClose();
    };

    const isOverride = !!entry;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white dark:bg-[#2a2a2a] rounded-3xl shadow-2xl w-full max-w-md animate-modal-premium">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/10">
                    <div>
                        <h3 className="text-lg font-black text-gray-900 dark:text-white">
                            <Edit3 size={16} className="inline mr-2 text-fgc-green" />
                            Editar dia
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-0.5">{formatDateStr(dateStr)}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {isOverride && (
                        <div className="flex items-center gap-2 p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                            <AlertCircle size={16} className="text-amber-500 shrink-0" />
                            <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                                Dia amb excepció manual. Servei per defecte: <strong>{getDefaultForDateStr(dateStr)}</strong>
                            </p>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                            Codi de Servei
                        </label>
                        <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto pr-1 no-scrollbar">
                            {SERVICE_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setServiceId(opt.value)}
                                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${serviceId === opt.value
                                            ? 'border-fgc-green bg-fgc-green/5 dark:bg-fgc-green/10'
                                            : 'border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
                                        }`}
                                >
                                    <span className={`shrink-0 w-8 h-8 rounded-lg ${opt.color} flex items-center justify-center text-white text-xs font-black`}>
                                        {opt.value}
                                    </span>
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{opt.label}</span>
                                    {serviceId === opt.value && <CheckCircle2 size={16} className="ml-auto text-fgc-green shrink-0" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                            Descripció (opcional)
                        </label>
                        <input
                            type="text"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Ex: Diada de Catalunya, Pont, Vaga..."
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-sm font-semibold text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-fgc-green focus:ring-2 focus:ring-fgc-green/20 transition-all"
                        />
                    </div>
                </div>

                <div className="flex gap-3 p-6 pt-0">
                    {isOverride && (
                        <button
                            onClick={handleDelete}
                            disabled={saving}
                            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 font-bold text-sm hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                            <Trash2 size={16} />
                            Eliminar excepció
                        </button>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-fgc-green text-fgc-grey font-black text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                    >
                        <Save size={16} />
                        {saving ? 'Guardant...' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────

export const CalendarManager: React.FC<CalendarManagerProps> = ({ onClose }) => {
    const { showToast } = useToast();
    const [viewMode, setViewMode] = useState<ViewMode>('month');
    const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
    const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());
    const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
        const today = new Date();
        const day = today.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        const mon = new Date(today);
        mon.setDate(today.getDate() + diff);
        return mon;
    });

    const [entries, setEntries] = useState<Record<string, ServiceCalendarEntry>>({});
    const [loading, setLoading] = useState(true);
    const [editTarget, setEditTarget] = useState<string | null>(null);

    const loadYear = useCallback(async (year: number) => {
        setLoading(true);
        try {
            const data = await fetchCalendarYear(year);
            const map: Record<string, ServiceCalendarEntry> = {};
            for (const e of data) map[e.date] = e;
            setEntries(map);
        } catch {
            showToast('Error carregant el calendari', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { loadYear(currentYear); }, [currentYear, loadYear]);

    const handleSave = async (entry: ServiceCalendarEntry) => {
        try {
            await upsertCalendarEntry(entry);
            setEntries(prev => ({ ...prev, [entry.date]: entry }));
            showToast(`Dia ${formatDateStr(entry.date)} actualitzat: ${entry.service_id}`, 'success');
        } catch {
            showToast('Error guardant el canvi', 'error');
        }
    };

    const handleDelete = async (date: string) => {
        try {
            await deleteCalendarEntry(date);
            setEntries(prev => {
                const next = { ...prev };
                delete next[date];
                return next;
            });
            showToast(`Excepció del dia ${formatDateStr(date)} eliminada`, 'success');
        } catch {
            showToast('Error eliminant el canvi', 'error');
        }
    };

    const handleRefresh = () => {
        invalidateServiceCalendarCache();
        loadYear(currentYear);
        showToast('Calendari actualitzat', 'success');
    };

    const todayStr = new Date().toISOString().split('T')[0];

    // ── Day cell ──────────────────────────────────────────────
    const DayCell = ({ dateStr, compact = false }: { dateStr: string; compact?: boolean }) => {
        const entry = entries[dateStr];
        const code = entry?.service_id || getDefaultForDateStr(dateStr);
        const isOverride = !!entry;
        const isToday = dateStr === todayStr;
        const monthNum = parseInt(dateStr.split('-')[1], 10);
        const dayNum = parseInt(dateStr.split('-')[2], 10);
        const isCurrentMonth = monthNum - 1 === currentMonth;
        const colorClass = getServiceColor(code);

        return (
            <button
                onClick={() => setEditTarget(dateStr)}
                className={[
                    'relative flex flex-col items-center rounded-2xl border-2 transition-all hover:scale-105 active:scale-95',
                    compact ? 'p-1.5 gap-1' : 'p-2.5 gap-1.5',
                    isToday ? 'border-fgc-green shadow-lg shadow-fgc-green/20' : isOverride ? 'border-amber-400 dark:border-amber-500' : 'border-transparent hover:border-gray-200 dark:hover:border-white/10',
                    !isCurrentMonth && viewMode === 'month' ? 'opacity-30' : '',
                    'bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10',
                ].join(' ')}
                title={entry?.description || getServiceLabel(code)}
            >
                <span className={`text-xs font-black ${isToday ? 'text-fgc-green' : 'text-gray-700 dark:text-gray-300'}`}>
                    {dayNum}
                </span>
                <span className={[
                    compact ? 'w-6 h-6 text-[9px]' : 'w-8 h-8 text-[10px]',
                    'rounded-xl', colorClass, 'flex items-center justify-center text-white font-black leading-none',
                ].join(' ')}>
                    {code}
                </span>
                {isOverride && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-amber-400 rounded-full" />
                )}
                {isToday && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-fgc-green rounded-full animate-pulse" />
                )}
            </button>
        );
    };

    // ── Week View ─────────────────────────────────────────────
    const WeekView = () => {
        const days: string[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(currentWeekStart);
            d.setDate(d.getDate() + i);
            days.push(d.toISOString().split('T')[0]);
        }

        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <button onClick={() => {
                        const d = new Date(currentWeekStart);
                        d.setDate(d.getDate() - 7);
                        setCurrentWeekStart(d);
                        if (d.getFullYear() !== currentYear) setCurrentYear(d.getFullYear());
                    }} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                        <ChevronLeft size={20} className="text-gray-600 dark:text-gray-400" />
                    </button>
                    <span className="text-sm font-bold text-gray-600 dark:text-gray-400">
                        {formatDateStr(days[0])} — {formatDateStr(days[6])}
                    </span>
                    <button onClick={() => {
                        const d = new Date(currentWeekStart);
                        d.setDate(d.getDate() + 7);
                        setCurrentWeekStart(d);
                        if (d.getFullYear() !== currentYear) setCurrentYear(d.getFullYear());
                    }} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                        <ChevronRight size={20} className="text-gray-600 dark:text-gray-400" />
                    </button>
                </div>
                <div className="grid grid-cols-7 gap-2">
                    {['Dl', 'Dm', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'].map(d => (
                        <div key={d} className="text-center text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest py-1">{d}</div>
                    ))}
                    {days.map(dateStr => <DayCell key={dateStr} dateStr={dateStr} />)}
                </div>
                <div className="space-y-2 mt-4">
                    {days.map(dateStr => {
                        const entry = entries[dateStr];
                        const code = entry?.service_id || getDefaultForDateStr(dateStr);
                        const opt = SERVICE_OPTIONS.find(o => o.value === code);
                        return (
                            <div key={dateStr} className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-white/5">
                                <span className={`w-10 h-10 rounded-xl ${opt?.color || 'bg-gray-400'} flex items-center justify-center text-white font-black text-sm shrink-0`}>
                                    {code}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-gray-800 dark:text-white">{formatDateStr(dateStr)}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {entry?.description || getServiceLabel(code)}
                                    </p>
                                </div>
                                {entry && <span className="text-xs font-bold text-amber-500 shrink-0">Manual</span>}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // ── Month View ────────────────────────────────────────────
    const MonthView = () => {
        const firstDay = new Date(currentYear, currentMonth, 1);
        let startDow = firstDay.getDay();
        startDow = startDow === 0 ? 6 : startDow - 1;
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

        const cells: { dateStr: string; inMonth: boolean }[] = [];
        for (let i = startDow - 1; i >= 0; i--) {
            const d = daysInPrevMonth - i;
            const m = currentMonth === 0 ? 12 : currentMonth;
            const y = currentMonth === 0 ? currentYear - 1 : currentYear;
            cells.push({ dateStr: buildDateStr(y, m, d), inMonth: false });
        }
        for (let d = 1; d <= daysInMonth; d++) {
            cells.push({ dateStr: buildDateStr(currentYear, currentMonth + 1, d), inMonth: true });
        }
        const remaining = 42 - cells.length;
        for (let d = 1; d <= remaining; d++) {
            const m = currentMonth === 11 ? 1 : currentMonth + 2;
            const y = currentMonth === 11 ? currentYear + 1 : currentYear;
            cells.push({ dateStr: buildDateStr(y, m, d), inMonth: false });
        }

        return (
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <button onClick={() => {
                        if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
                        else setCurrentMonth(m => m - 1);
                    }} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                        <ChevronLeft size={20} className="text-gray-600 dark:text-gray-400" />
                    </button>
                    <span className="text-base font-black text-gray-800 dark:text-white">
                        {MONTH_NAMES[currentMonth]} {currentYear}
                    </span>
                    <button onClick={() => {
                        if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
                        else setCurrentMonth(m => m + 1);
                    }} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                        <ChevronRight size={20} className="text-gray-600 dark:text-gray-400" />
                    </button>
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {DAY_NAMES.map(d => (
                        <div key={d} className="text-center text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest py-1">{d}</div>
                    ))}
                    {cells.map(({ dateStr, inMonth }) => (
                        <div key={dateStr} className={inMonth ? '' : 'opacity-25'}>
                            <DayCell dateStr={dateStr} compact />
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // ── Year View ─────────────────────────────────────────────
    const YearView = () => (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {MONTH_NAMES.map((monthName, mIdx) => {
                const firstDay = new Date(currentYear, mIdx, 1);
                let startDow = firstDay.getDay();
                startDow = startDow === 0 ? 6 : startDow - 1;
                const daysInMonth = new Date(currentYear, mIdx + 1, 0).getDate();
                const exceptions = Array.from({ length: daysInMonth }, (_, i) => {
                    const d = buildDateStr(currentYear, mIdx + 1, i + 1);
                    return entries[d] ? 1 : 0;
                }).reduce((a, b) => a + b, 0);

                return (
                    <button
                        key={mIdx}
                        onClick={() => { setCurrentMonth(mIdx); setViewMode('month'); }}
                        className="p-4 rounded-2xl bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 border border-gray-100 dark:border-white/10 hover:border-fgc-green/40 transition-all active:scale-95 text-left"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-black text-gray-800 dark:text-white">{monthName}</span>
                            {exceptions > 0 && (
                                <span className="text-[10px] font-bold text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full">
                                    {exceptions} exc.
                                </span>
                            )}
                        </div>
                        <div className="grid grid-cols-7 gap-0.5">
                            {['D', 'M', 'X', 'J', 'V', 'S', 'G'].map(d => (
                                <div key={d} className="text-center text-[8px] text-gray-400 font-bold">{d}</div>
                            ))}
                            {Array(startDow).fill(null).map((_, i) => <div key={`pad-${i}`} />)}
                            {Array.from({ length: daysInMonth }, (_, i) => {
                                const dateStr = buildDateStr(currentYear, mIdx + 1, i + 1);
                                const entry = entries[dateStr];
                                const code = entry?.service_id || getDefaultForDateStr(dateStr);
                                const colorClass = getServiceColor(code);
                                const isToday = dateStr === todayStr;
                                return (
                                    <div
                                        key={dateStr}
                                        className={`w-3 h-3 rounded-sm ${colorClass} ${isToday ? 'ring-2 ring-white' : ''} opacity-80`}
                                        title={`${i + 1}: ${code}`}
                                    />
                                );
                            })}
                        </div>
                    </button>
                );
            })}
        </div>
    );

    // ── Legend ────────────────────────────────────────────────
    const Legend = () => (
        <div className="flex flex-wrap gap-2 py-3 border-t border-gray-100 dark:border-white/10">
            {[
                { code: '000', label: 'Laborable' },
                { code: '100', label: 'Divendres' },
                { code: '200', label: 'Ag. Lab.' },
                { code: '300', label: 'Ag. Div.' },
                { code: '400', label: 'Dissabte' },
                { code: '500', label: 'Diumenge' },
                { code: '800', label: 'Ag. 1a/4a' },
                { code: '900', label: 'Ag. Dv.' },
            ].map(({ code, label }) => (
                <div key={code} className="flex items-center gap-1.5">
                    <span className={`w-4 h-4 rounded ${getServiceColor(code)}`} />
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{code} {label}</span>
                </div>
            ))}
            <div className="flex items-center gap-1.5 ml-auto">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">Excepció manual</span>
            </div>
        </div>
    );

    // ── Render ────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white dark:bg-[#1e1e1e] rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-modal-premium">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/10 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-2xl bg-fgc-green/10">
                            <Calendar size={20} className="text-fgc-green" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-gray-900 dark:text-white">Gestor de Calendari</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Any {currentYear} · Calendari de Serveis FGC</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 rounded-xl px-2">
                            <button onClick={() => setCurrentYear(y => y - 1)} className="p-1.5 hover:text-fgc-green transition-colors">
                                <ChevronLeft size={16} className="text-gray-500 dark:text-gray-400" />
                            </button>
                            <span className="text-sm font-black text-gray-700 dark:text-gray-300 w-10 text-center">{currentYear}</span>
                            <button onClick={() => setCurrentYear(y => y + 1)} className="p-1.5 hover:text-fgc-green transition-colors">
                                <ChevronRight size={16} className="text-gray-500 dark:text-gray-400" />
                            </button>
                        </div>
                        <button onClick={handleRefresh} title="Actualitzar" className="p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                            <RefreshCcw size={18} className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={onClose} className="p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                            <X size={20} className="text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* View mode tabs */}
                <div className="flex gap-1 p-4 border-b border-gray-100 dark:border-white/10 shrink-0">
                    {(['week', 'month', 'year'] as ViewMode[]).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${viewMode === mode
                                    ? 'bg-fgc-green text-fgc-grey shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'
                                }`}
                        >
                            {mode === 'week' ? 'Setmana' : mode === 'month' ? 'Mes' : 'Any'}
                        </button>
                    ))}
                </div>

                {/* Calendar content */}
                <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <div className="w-8 h-8 border-4 border-fgc-green border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : (
                        viewMode === 'week' ? <WeekView />
                            : viewMode === 'month' ? <MonthView />
                                : <YearView />
                    )}
                </div>

                <div className="px-6 shrink-0">
                    <Legend />
                </div>
            </div>

            {editTarget && (
                <EditDayModal
                    dateStr={editTarget}
                    entry={entries[editTarget] || null}
                    defaultServiceId={getDefaultForDateStr(editTarget)}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    onClose={() => setEditTarget(null)}
                />
            )}
        </div>
    );
};

export default CalendarManager;
