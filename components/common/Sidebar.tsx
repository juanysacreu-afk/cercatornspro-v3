import React, { useState } from 'react';
import { AppTab } from '../../types';
import { Settings, Moon, Sun } from 'lucide-react';
import { feedback } from '../../utils/feedback';

interface SidebarProps {
    activeTab: AppTab;
    onTabChange: (tab: AppTab) => void;
    navItems: { id: AppTab, label: string, icon: React.ReactNode }[];
    isPrivacyMode: boolean;
    toggleAdminMode: () => void;
    onSettingsClick: () => void;
    onProfileClick: () => void;
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
            className={`hidden lg:flex flex-col h-screen sticky top-0 bg-[#4D5358]/95 dark:bg-[#222222]/95 backdrop-blur-xl border-r border-white/5 transition-all duration-500 z-50 shadow-2xl ${isExpanded ? 'w-64' : 'w-20'}`}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
        >
            {/* Logo Area */}
            <div className="h-24 flex items-center px-5 overflow-hidden border-b border-white/5">
                <div
                    className="flex items-center gap-4 cursor-pointer select-none group shrink-0"
                    onDoubleClick={toggleAdminMode}
                >
                    <img
                        src="https://www.fgc.cat/wp-content/uploads/2020/06/logo-FGC-square.png"
                        alt="Logo"
                        className="w-10 h-10 rounded-lg shrink-0 group-active:scale-95 transition-transform"
                    />
                    <div className={`transition-all duration-500 whitespace-nowrap ${isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}>
                        <span className="text-xl font-black text-white tracking-tighter">Cerca<span className="text-fgc-green">Torns</span></span>
                        <span className="ml-1.5 px-1.5 py-0.5 bg-fgc-green text-fgc-grey text-[8px] font-black rounded uppercase">Pro</span>
                    </div>
                </div>
            </div>

            {/* Main Navigation */}
            <nav className="flex-1 px-3 space-y-2 mt-8">
                {navItems.map((item) => (
                    <button
                        key={item.id}
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
                {/* Theme Toggle */}
                <button
                    onClick={() => {
                        onToggleDarkMode();
                        feedback.click();
                    }}
                    className="w-full flex items-center px-4 py-3.5 rounded-2xl transition-all text-gray-400 hover:bg-white/5 hover:text-white group"
                >
                    <div className="shrink-0 group-hover:rotate-12 transition-transform">
                        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                    </div>
                    <span className={`ml-4 text-[11px] font-bold uppercase tracking-widest transition-all duration-500 whitespace-nowrap ${isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}>
                        {isDarkMode ? 'Mode Clar' : 'Mode Fosc'}
                    </span>
                </button>

                {/* Settings Trigger */}
                <button
                    ref={settingsButtonRef}
                    onClick={() => {
                        onSettingsClick();
                        feedback.click();
                    }}
                    className="w-full flex items-center px-4 py-3.5 rounded-2xl transition-all text-gray-400 hover:bg-white/5 hover:text-white group"
                >
                    <div className="shrink-0 group-hover:rotate-90 transition-transform duration-500">
                        <Settings size={20} />
                    </div>
                    <span className={`ml-4 text-[11px] font-bold uppercase tracking-widest transition-all duration-500 whitespace-nowrap ${isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}>
                        Configuració
                    </span>
                </button>

                <button
                    onClick={onProfileClick}
                    className={`flex items-center py-2 transition-all duration-500 w-full hover:bg-white/5 rounded-2xl group/profile ${isExpanded ? 'px-4 gap-4' : 'justify-center'}`}
                >
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-lg capitalize group-hover/profile:scale-105 transition-transform">
                        {userProfile.firstName?.[0] || 'M'}{userProfile.lastName?.[0] || 'L'}
                    </div>
                    <div className={`transition-all duration-500 text-left ${isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 absolute -translate-x-4 pointer-events-none'}`}>
                        <p className="text-[10px] font-black text-white uppercase leading-none tracking-tighter">
                            {userProfile.firstName} {userProfile.lastName}
                        </p>
                        <p className="text-[9px] text-gray-500 font-bold mt-1 uppercase tracking-tighter">
                            {userProfile.role}
                        </p>
                    </div>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
