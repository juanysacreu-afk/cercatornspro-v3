import React, { useState } from 'react';
import { User, Shield, Check, X, Search, Loader2 } from 'lucide-react';
import GlassPanel from './common/GlassPanel';
import { supabase } from '../supabaseClient';
import { useToast } from './ToastProvider';
import { feedback } from '../utils/feedback';

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
    isMandatory?: boolean;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, currentProfile, onSave, isMandatory = false }) => {
    const [formData, setFormData] = useState<UserProfile>(currentProfile);
    const [isSearching, setIsSearching] = useState(false);
    const { showToast } = useToast();

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
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
        >
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-500 ease-out-expo"
                onClick={isMandatory ? undefined : onClose}
            />

            <div className="relative w-full max-w-md animate-modal-premium">
                <GlassPanel className="overflow-hidden border border-gray-200 dark:border-white/10 shadow-2xl bg-white dark:bg-gray-900">
                    {/* Header */}
                    <div className="p-6 border-b border-gray-100 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-fgc-green/10 to-transparent">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-fgc-green/20 rounded-xl text-fgc-green">
                                <User size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Perfil de Supervisor</h3>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest mt-0.5">Configuració Personal</p>
                            </div>
                        </div>
                        {!isMandatory && (
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl text-gray-500 dark:text-gray-400 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="p-8 space-y-6">
                        {/* Avatar Section */}
                        <div className="flex flex-col items-center gap-4 mb-2">
                            <div className="w-24 h-24 rounded-[32px] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-950 border-2 border-white dark:border-white/10 flex items-center justify-center text-3xl font-black text-gray-800 dark:text-white shadow-xl">
                                {formData.firstName?.[0]}{formData.lastName?.[0]}
                            </div>
                            <div className="px-3 py-1 bg-gray-100 dark:bg-white/5 rounded-full border border-gray-200 dark:border-white/5">
                                <span className="text-[10px] font-black text-fgc-green uppercase tracking-widest flex items-center gap-1.5">
                                    <Shield size={10} strokeWidth={3} /> Supervisor Actiu
                                </span>
                            </div>
                        </div>

                        {/* Form Fields */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 ml-1">Nom</label>
                                <input
                                    type="text"
                                    value={formData.firstName}
                                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                    className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-gray-900 dark:text-white font-bold placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-fgc-green/50 focus:ring-1 focus:ring-fgc-green/50 transition-all"
                                    placeholder="Ex: Marcos"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 ml-1">Cognoms</label>
                                <input
                                    type="text"
                                    value={formData.lastName}
                                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                    className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-gray-900 dark:text-white font-bold placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-fgc-green/50 focus:ring-1 focus:ring-fgc-green/50 transition-all"
                                    placeholder="Ex: Lopez"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 ml-1">Correu Corporatiu</label>
                                <div className="flex gap-2">
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="flex-1 min-w-0 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-gray-900 dark:text-white font-bold placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-fgc-green/50 focus:ring-1 focus:ring-fgc-green/50 transition-all"
                                        placeholder="Ex: mlopez@fgc.cat"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleLogin}
                                        disabled={!formData.email || isSearching}
                                        className="px-4 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl text-gray-600 dark:text-white font-bold hover:bg-gray-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center justify-center shadow-sm"
                                        title="Recuperar perfil"
                                    >
                                        {isSearching ? <Loader2 size={18} className="animate-spin text-fgc-green" /> : <Search size={18} />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 ml-1">Departament / Rol</label>
                                <div className="relative">
                                    <select
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                        className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-gray-900 dark:text-white font-bold focus:outline-none focus:border-fgc-green/50 focus:ring-1 focus:ring-fgc-green/50 transition-all appearance-none cursor-pointer"
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
                        <div className="flex gap-3 pt-4">
                            {!isMandatory && (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 py-4 px-6 rounded-2xl bg-gray-50 dark:bg-transparent border border-gray-200 dark:border-white/10 text-gray-600 dark:text-white text-xs font-black uppercase tracking-widest hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                                >
                                    Cancel·lar
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={isMandatory && (!formData.firstName || !formData.lastName || !formData.email || !formData.role)}
                                className={`flex-1 py-4 px-6 rounded-2xl bg-fgc-green text-white text-xs font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-fgc-green/20 ${isMandatory && (!formData.firstName || !formData.lastName || !formData.email || !formData.role) ? 'opacity-50 cursor-not-allowed hover:scale-100 active:scale-100' : ''}`}
                            >
                                <Check size={16} strokeWidth={3} /> {isMandatory ? 'Guardar i Continuar' : 'Desar Perfil'}
                            </button>
                        </div>
                    </form>
                </GlassPanel>
            </div>
        </div>
    );
};

export default ProfileModal;
