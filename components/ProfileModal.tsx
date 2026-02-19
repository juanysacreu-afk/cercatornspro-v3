import React, { useState } from 'react';
import { User, Shield, Check, X, Camera } from 'lucide-react';
import GlassPanel from './common/GlassPanel';

interface UserProfile {
    firstName: string;
    lastName: string;
    role: string;
}

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentProfile: UserProfile;
    onSave: (profile: UserProfile) => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, currentProfile, onSave }) => {
    const [formData, setFormData] = useState<UserProfile>(currentProfile);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md animate-in zoom-in-95 duration-300">
                <GlassPanel className="overflow-hidden border border-white/20 shadow-2xl">
                    {/* Header */}
                    <div className="p-6 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-fgc-green/10 to-transparent">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-fgc-green/20 rounded-xl text-fgc-green">
                                <User size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white uppercase tracking-tight">Perfil de Supervisor</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Configuració Personal</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/5 rounded-xl text-gray-400 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-8 space-y-6">
                        {/* Avatar Section */}
                        <div className="flex flex-col items-center gap-4 mb-2">
                            <div className="relative group">
                                <div className="w-24 h-24 rounded-[32px] bg-gradient-to-br from-gray-700 to-gray-900 border-2 border-white/20 flex items-center justify-center text-3xl font-black text-white shadow-2xl group-hover:scale-105 transition-transform duration-500">
                                    {formData.firstName?.[0]}{formData.lastName?.[0]}
                                </div>
                                <div className="absolute -bottom-1 -right-1 p-2 bg-fgc-green rounded-xl text-fgc-grey shadow-lg scale-90 group-hover:scale-100 transition-transform cursor-pointer">
                                    <Camera size={16} strokeWidth={3} />
                                </div>
                            </div>
                            <div className="px-3 py-1 bg-white/5 rounded-full border border-white/5">
                                <span className="text-[10px] font-black text-fgc-green uppercase tracking-widest flex items-center gap-1.5">
                                    <Shield size={10} strokeWidth={3} /> Supervisor Actiu
                                </span>
                            </div>
                        </div>

                        {/* Form Fields */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Nom</label>
                                <input
                                    type="text"
                                    value={formData.firstName}
                                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                    className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white font-bold placeholder:text-gray-600 focus:outline-none focus:border-fgc-green/50 transition-colors"
                                    placeholder="Ex: Marcos"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Cognoms</label>
                                <input
                                    type="text"
                                    value={formData.lastName}
                                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                    className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white font-bold placeholder:text-gray-600 focus:outline-none focus:border-fgc-green/50 transition-colors"
                                    placeholder="Ex: Lopez"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Departament / Rol</label>
                                <input
                                    type="text"
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white font-bold placeholder:text-gray-600 focus:outline-none focus:border-fgc-green/50 transition-colors"
                                    placeholder="Ex: FGC Operacions"
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-4 px-6 rounded-2xl border border-white/10 text-white text-xs font-black uppercase tracking-widest hover:bg-white/5 transition-colors"
                            >
                                Cancel·lar
                            </button>
                            <button
                                type="submit"
                                className="flex-1 py-4 px-6 rounded-2xl bg-fgc-green text-fgc-grey text-xs font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-fgc-green/20"
                            >
                                <Check size={16} strokeWidth={3} /> Desar Perfil
                            </button>
                        </div>
                    </form>
                </GlassPanel>
            </div>
        </div>
    );
};

export default ProfileModal;
