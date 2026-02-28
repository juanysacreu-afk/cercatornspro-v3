import React, { useState } from 'react';
import { AppTab } from '../../types';
import { Settings, Moon, Sun, Upload, HelpCircle } from 'lucide-react';
import { feedback } from '../../utils/feedback';

interface SidebarProps {
    activeTab: AppTab;
    onTabChange: (tab: AppTab) => void;
    navItems: { id: AppTab, label: string, icon: React.ReactNode }[];
    isPrivacyMode: boolean;
    toggleAdminMode: () => void;
    onSettingsClick: () => void;
    onProfileClick: () => void;
    onUploadClick: () => void;
    isDarkMode: boolean;
    userProfile: { firstName: string, lastName: string, role: string };
    onToggleDarkMode: () => void;
    settingsButtonRef: React.RefObject<HTMLButtonElement>;
}

const Sidebar: React.FC<SidebarProps> = ({
    activeTab,
    onTabChange,
    navItems,
    toggleAdminMode,
    onSettingsClick,
    onProfileClick,
    onUploadClick,
    isDarkMode,
    onToggleDarkMode,
    settingsButtonRef,
    userProfile
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const handleTabClick = (id: AppTab) => {
        onTabChange(id);
        feedback.click();
    };

    return (
        <aside
            className={`hidden lg:flex flex-col h-full sticky left-0 top-0 bg-[#4D5358]/95 dark:bg-[#222222]/95 backdrop-blur-xl border-r border-white/5 transition-all duration-500 z-50 shadow-2xl shrink-0 ${isExpanded ? 'w-64' : 'w-20'}`}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
        >
            {/* Logo Area */}
            <div className="h-24 flex items-center px-5 overflow-hidden border-b border-white/5">
                <div
                    className="flex items-center gap-4 cursor-pointer select-none group shrink-0 w-full"
                    onDoubleClick={toggleAdminMode}
                >
                    <img
                        src="https://www.fgc.cat/wp-content/uploads/2020/06/logo-FGC-square.png"
                        alt="FGC Icon"
                        className="w-10 h-10 rounded-lg shrink-0 group-active:scale-95 transition-transform"
                    />
                    <div className={`transition-all duration-500 whitespace-nowrap overflow-hidden ${isExpanded ? 'opacity-100 translate-x-0 w-auto' : 'opacity-0 -translate-x-4 w-0 pointer-events-none'}`}>
                        <img
                            src="/logo-pro.png"
                            alt="NEXUS"
                            className="h-10 w-auto object-contain"
                        />
                    </div>
                </div>
            </div>

            {/* Main Navigation */}
            <nav className="flex-1 px-3 space-y-2 mt-8">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        data-tour={`${item.id}-tab`}
                        onClick={() => handleTabClick(item.id)}
                        className={`w-full flex items-center px-4 py-4 rounded-2xl transition-all relative group overflow-hidden ${activeTab === item.id
                            ? 'bg-fgc-green text-fgc-grey shadow-lg shadow-fgc-green/20'
                            : 'text-gray-400 hover:bg-white/5 hover:text-white'
                            }`}
                    >
                        <div className={`shrink-0 transition-transform duration-300 ${activeTab === item.id ? 'scale-110' : 'group-hover:scale-110'}`}>
                            {item.icon}
                        </div>
                        <span className={`ml-4 font-bold text-sm transition-all duration-500 whitespace-nowrap ${isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}>
                            {item.label}
                        </span>

                        {activeTab === item.id && (
                            <div className="absolute left-0 w-1.5 h-6 bg-fgc-grey rounded-r-full" />
                        )}

                        {!isExpanded && activeTab !== item.id && (
                            <div className="absolute left-full ml-4 px-2 py-1 bg-fgc-grey text-white text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-[100]">
                                {item.label}
                            </div>
                        )}
                    </button>
                ))}
            </nav>

            {/* Bottom Section */}
            <div className="p-4 space-y-4 border-t border-white/5 bg-black/5">
                {/* Upload Trigger */}
                <button
                    onClick={() => {
                        onUploadClick();
                        feedback.click();
                    }}
                    data-tour="upload-btn"
                    className="w-full flex items-center px-4 py-3.5 rounded-2xl transition-all text-gray-400 hover:bg-fgc-green/10 hover:text-white group"
                >
                    <div className="shrink-0 group-hover:-translate-y-1 transition-transform duration-300">
                        <Upload size={20} />
                    </div>
                    <span className={`ml-4 text-[11px] font-bold uppercase tracking-widest transition-all duration-500 whitespace-nowrap ${isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}>
                        Carregar Dades
                    </span>
                </button>

                {/* Tour Trigger */}
                <button
                    onClick={() => {
                        feedback.click();
                        (window as any).startAppTour?.();
                    }}
                    data-tour="help-btn"
                    className="w-full flex items-center px-4 py-3.5 rounded-2xl transition-all text-gray-400 hover:bg-amber-500/10 hover:text-amber-500 group"
                    title="Reiniciar Tour Guia"
                >
                    <div className="shrink-0 group-hover:scale-110 transition-transform duration-300">
                        <HelpCircle size={20} />
                    </div>
                    <span className={`ml-4 text-[11px] font-bold uppercase tracking-widest transition-all duration-500 whitespace-nowrap ${isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}>
                        Ajuda / Tour
                    </span>
                </button>

                {/* Settings Trigger */}
                <button
                    ref={settingsButtonRef}
                    onClick={() => {
                        onSettingsClick();
                        feedback.click();
                    }}
                    data-tour="settings-btn"
                    className="w-full flex items-center px-4 py-3.5 rounded-2xl transition-all text-gray-400 hover:bg-white/5 hover:text-white group"
                >
                    <div className="shrink-0 group-hover:rotate-90 transition-transform duration-500">
                        <Settings size={20} />
                    </div>
                    <span className={`ml-4 text-[11px] font-bold uppercase tracking-widest transition-all duration-500 whitespace-nowrap ${isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}>
                        Configuració
                    </span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
