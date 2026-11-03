import React, { useState } from 'react';
import { User, Shield, Check, X, Search, Loader2, LogOut, ShieldCheck, Lock, History, PhoneCall } from 'lucide-react';
import GlassPanel from './common/GlassPanel';
import { supabase } from '../supabaseClient';
import { useToast } from './ToastProvider';
import { feedback } from '../utils/feedback';
import { fetchRecentAuditLogs, AuditLogEntry } from '../utils/auditLogger';

interface UserProfile {
    id?: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
}

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentProfile: UserProfile;
    onSave: (profile: UserProfile) => void;
    onSignOut?: () => void;
    isMandatory?: boolean;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, currentProfile, onSave, onSignOut, isMandatory = false }) => {
    const [formData, setFormData] = useState<UserProfile>(currentProfile);
    const [isSearching, setIsSearching] = useState(false);
    const [showAuditLogs, setShowAuditLogs] = useState(false);
    const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const { showToast } = useToast();

    const handleToggleAudit = async () => {
        if (!showAuditLogs) {
            setLoadingLogs(true);
            setShowAuditLogs(true);
            const logs = await fetchRecentAuditLogs(30);
            setAuditLogs(logs);
            setLoadingLogs(false);
        } else {
            setShowAuditLogs(false);
        }
    };

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isMandatory && (!formData.firstName || !formData.lastName || !formData.email)) {
            showToast('Siusplau, completa totes les dades', 'error');
            return;
        }
        onSave(formData);
        if (!isMandatory || (formData.firstName && formData.lastName && formData.email)) {
            onClose();
        }
    };

    const handleLogin = async () => {
        if (!formData.email && !formData.firstName && !formData.lastName) return;
        setIsSearching(true);
        try {
            // 1. Try by email (latest entry)
            if (formData.email) {
                const { data, error } = await supabase
                    .from('supervisor_profiles')
                    .select('*')
                    .eq('email', formData.email.toLowerCase().trim())
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (data && data.length > 0 && !error) {
                    const profile = data[0];
                    setFormData({
                        id: profile.id,
                        firstName: profile.first_name,
                        lastName: profile.last_name,
                        email: profile.email || formData.email,
                        role: profile.role
                    });
                    showToast('Perfil carregat correctament', 'success');
                    feedback.success();
                    setIsSearching(false);
                    return;
                }
            }

            // 2. Try by Name + Last Name in supervisor_profiles
            if (formData.firstName && formData.lastName) {
                const { data } = await supabase
                    .from('supervisor_profiles')
                    .select('*')
                    .ilike('first_name', `%${formData.firstName.trim()}%`)
                    .ilike('last_name', `%${formData.lastName.trim()}%`)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (data && data.length > 0) {
                    const profile = data[0];
                    setFormData({
                        id: profile.id,
                        firstName: profile.first_name,
                        lastName: profile.last_name,
                        email: profile.email || formData.email,
                        role: profile.role
                    });
                    showToast('Perfil trobat per nom', 'success');
                    feedback.success();
                    setIsSearching(false);
                    return;
                }
            }

            // 3. Try in daily_assignments (Maquinistes) as fallback to pre-fill
            const searchVal = formData.email || formData.lastName || formData.firstName;
            if (searchVal) {
                const { data } = await supabase
                    .from('daily_assignments')
                    .select('nom, cognoms, empleat_id')
                    .or(`nom.ilike.%${searchVal}%,cognoms.ilike.%${searchVal}%,empleat_id.ilike.%${searchVal}%`)
                    .limit(1);

                if (data && data.length > 0) {
                    const emp = data[0];
                    setFormData(prev => ({
                        ...prev,
                        firstName: emp.nom,
                        lastName: emp.cognoms,
                        // We don't overwrite email unless empty
                        email: prev.email || `${emp.nom.toLowerCase().charAt(0)}${emp.cognoms.toLowerCase().split(' ')[0]}@fgc.cat`
                    }));
                    showToast('Dades recuperades de la base de dades operativa', 'success');
                    feedback.success();
                    setIsSearching(false);
                    return;
                }
            }

            showToast('No s\'ha trobat cap perfil associat', 'error');
            feedback.haptic([50, 50, 50]);
        } catch (e) {
            console.error("Error profile lookup:", e);
            showToast('Error de connexió', 'error');
            feedback.haptic([50, 50, 50]);
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[1000] overflow-y-auto p-3 sm:p-4 md:p-6 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
        >
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={isMandatory ? undefined : onClose}
            />

            <div className="relative w-full max-w-md my-auto flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[min(92dvh,820px)] animate-modal-premium">
                <GlassPanel className="flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[min(92dvh,820px)] overflow-hidden rounded-[28px] border border-gray-200 dark:border-white/10 shadow-2xl bg-white dark:bg-gray-900">
                    {/* Header */}
                    <div className="shrink-0 px-6 py-4 border-b border-gray-100 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-fgc-green/10 to-transparent">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-fgc-green/20 rounded-xl text-fgc-green">
                                <User size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">Perfil de Supervisor</h3>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest mt-0.5">Configuració Personal</p>
                            </div>
                        </div>
                        {!isMandatory && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl text-gray-500 dark:text-gray-400 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="overflow-y-auto overscroll-contain flex-1 p-6 space-y-5">
                        {/* Avatar Section */}
                        <div className="flex flex-col items-center gap-2.5">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-950 border-2 border-white dark:border-white/10 flex items-center justify-center text-2xl font-black text-gray-800 dark:text-white shadow-lg">
                                {formData.firstName?.[0]}{formData.lastName?.[0]}
                            </div>
                            <div className="px-3 py-0.5 bg-gray-100 dark:bg-white/5 rounded-full border border-gray-200 dark:border-white/5">
                                <span className="text-[10px] font-black text-fgc-green uppercase tracking-widest flex items-center gap-1.5">
                                    <Shield size={10} strokeWidth={3} /> Supervisor Actiu
                                </span>
                            </div>
                        </div>

                        {/* Form Fields */}
                        <div className="space-y-3.5">
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Nom</label>
                                <input
                                    type="text"
                                    value={formData.firstName}
                                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                    className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white font-bold placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-fgc-green/50 focus:ring-1 focus:ring-fgc-green/50 transition-all"
                                    placeholder="Ex: Marcos"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Cognoms</label>
                                <input
                                    type="text"
                                    value={formData.lastName}
                                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                    className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white font-bold placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-fgc-green/50 focus:ring-1 focus:ring-fgc-green/50 transition-all"
                                    placeholder="Ex: Lopez"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Correu Corporatiu</label>
                                <div className="flex gap-2">
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="flex-1 min-w-0 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white font-bold placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-fgc-green/50 focus:ring-1 focus:ring-fgc-green/50 transition-all"
                                        placeholder="Ex: mlopez@fgc.cat"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleLogin}
                                        disabled={!formData.email || isSearching}
                                        className="px-3.5 py-2.5 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-600 dark:text-white font-bold hover:bg-gray-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center justify-center shadow-sm"
                                        title="Recuperar perfil"
                                    >
                                        {isSearching ? <Loader2 size={16} className="animate-spin text-fgc-green" /> : <Search size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Departament / Rol</label>
                                <div className="relative">
                                    <select
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                        className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white font-bold focus:outline-none focus:border-fgc-green/50 focus:ring-1 focus:ring-fgc-green/50 transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="" disabled className="bg-white dark:bg-gray-800 text-gray-500">Selecciona un rol...</option>
                                        <option value="Supervisor de Grup" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">Supervisor de Grup</option>
                                        <option value="Responsable d'area" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">Responsable d'àrea</option>
                                        <option value="Cap" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">Cap</option>
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="m6 9 6 6 6-6" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2.5 pt-2">
                            {!isMandatory && (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 py-3 px-4 rounded-xl bg-gray-50 dark:bg-transparent border border-gray-200 dark:border-white/10 text-gray-600 dark:text-white text-xs font-black uppercase tracking-widest hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                                >
                                    Cancel·lar
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={isMandatory && (!formData.firstName || !formData.lastName || !formData.email || !formData.role)}
                                className={`flex-1 py-3 px-4 rounded-xl bg-fgc-green text-white text-xs font-black uppercase tracking-widest hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-fgc-green/20 ${isMandatory && (!formData.firstName || !formData.lastName || !formData.email || !formData.role) ? 'opacity-50 cursor-not-allowed hover:scale-100 active:scale-100' : ''}`}
                            >
                                <Check size={16} strokeWidth={3} /> {isMandatory ? 'Guardar i Continuar' : 'Desar Perfil'}
                            </button>
                        </div>

                        {/* LOPD Audit Section */}
                        <div className="pt-1">
                            <button
                                type="button"
                                onClick={handleToggleAudit}
                                className="w-full py-2.5 px-3.5 rounded-xl bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 text-xs font-bold flex items-center justify-between border border-gray-200 dark:border-white/10 transition-all"
                            >
                                <span className="flex items-center gap-2">
                                    <ShieldCheck size={15} className="text-fgc-green shrink-0" />
                                    Traçabilitat LOPD / Auditoria
                                </span>
                                <span className="text-[10px] uppercase font-bold text-gray-400">
                                    {showAuditLogs ? 'Amagar' : 'Consultar'}
                                </span>
                            </button>

                            {showAuditLogs && (
                                <div className="mt-2 p-3 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 max-h-48 overflow-y-auto space-y-2 text-left">
                                    <div className="flex items-center justify-between pb-1 border-b border-gray-200 dark:border-white/10 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                        <span>Últimes Consultes Registrades</span>
                                        <span className="flex items-center gap-1 text-fgc-green">
                                            <Lock size={10} /> Immutable
                                        </span>
                                    </div>

                                    {loadingLogs ? (
                                        <div className="py-4 flex justify-center items-center text-xs text-gray-400 gap-2">
                                            <Loader2 size={14} className="animate-spin text-fgc-green" /> Carregant registre...
                                        </div>
                                    ) : auditLogs.length === 0 ? (
                                        <p className="text-xs text-gray-400 py-3 text-center">Sense accessos recents registrats.</p>
                                    ) : (
                                        auditLogs.map((log) => {
                                            const timeStr = new Date(log.created_at).toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                            const dateStr = new Date(log.created_at).toLocaleDateString('ca-ES', { day: '2-digit', month: '2-digit' });

                                            let badgeColor = 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
                                            let actionLabel = log.action_type;
                                            if (log.action_type === 'AUTH_LOGIN') {
                                                badgeColor = 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
                                                actionLabel = 'LOGIN';
                                            } else if (log.action_type === 'AUTH_LOGOUT') {
                                                badgeColor = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
                                                actionLabel = 'LOGOUT';
                                            } else if (log.action_type === 'CALL_DISPATCH') {
                                                badgeColor = 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
                                                actionLabel = 'TRUCADA';
                                            } else if (log.action_type === 'VIEW_AGENT_CONTACT') {
                                                badgeColor = 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300';
                                                actionLabel = 'CONSULTA FITXA';
                                            } else if (log.action_type === 'SEARCH_AGENTS') {
                                                badgeColor = 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
                                                actionLabel = 'CERCA';
                                            }

                                            return (
                                                <div key={log.id} className="p-2 rounded-lg bg-white dark:bg-black/30 border border-gray-100 dark:border-white/5 text-[11px] flex flex-col gap-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${badgeColor}`}>
                                                            {actionLabel}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 font-mono">
                                                            {dateStr} {timeStr}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between text-gray-600 dark:text-gray-300 font-medium">
                                                        <span className="truncate max-w-[180px] font-mono text-[10px] text-gray-500">
                                                            {log.user_email}
                                                        </span>
                                                        {log.target_nomina && (
                                                            <span className="font-bold text-fgc-green">
                                                                Nòmina: {log.target_nomina}
                                                            </span>
                                                        )}
                                                        {log.details?.phone_called && (
                                                            <span className="font-bold text-amber-600 dark:text-amber-400">
                                                                Tel: {log.details.phone_called}
                                                            </span>
                                                        )}
                                                        {log.details?.query && (
                                                            <span className="font-bold text-purple-500">
                                                                "{log.details.query}"
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div className="text-[9px] text-gray-400 pt-1 text-center italic">
                                        RGPD Art. 30 — Traçabilitat legal custodiada a Supabase
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sign Out Button */}
                        {onSignOut && (
                            <div className="pt-2 border-t border-gray-100 dark:border-white/5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose();
                                        onSignOut();
                                    }}
                                    className="w-full py-2.5 px-4 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                                >
                                    <LogOut size={15} /> Tancar Sessió de Supervisor
                                </button>
                            </div>
                        )}
                    </form>
                </GlassPanel>
            </div>
        </div>
    );
};

export default ProfileModal;
