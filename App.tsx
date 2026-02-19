import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, RefreshCcw, Train, Menu, X, Download, BookOpen, Settings, Moon, Sun, ShieldAlert, Eye, Layers, Volume2, VolumeX } from 'lucide-react';
import { AppTab } from './types.ts';
import { CercarView } from './views/CercarView.tsx';
import OrganitzaView from './views/OrganitzaView.tsx';
import CiclesView from './views/CiclesView.tsx';
import IncidenciaView from './views/IncidenciaView.tsx';
import DashboardView from './views/dashboard/DashboardView.tsx';
import FileUploadModal from './components/FileUploadModal.tsx';
import CommandPalette from './components/CommandPalette.tsx';
import Sidebar from './components/common/Sidebar.tsx';
import { supabase } from './supabaseClient.ts';
import { feedback } from './utils/feedback';
import { useToast } from './components/ToastProvider';
import ProfileModal from './components/ProfileModal.tsx';

interface ParkedUnit {
  unit_number: string;
  depot_id: string;
  track: string;
}

import SplashScreen from './components/common/SplashScreen.tsx';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.Dashboard);
  const [prevTab, setPrevTab] = useState<AppTab | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initProgress, setInitProgress] = useState(0);
  const { showToast } = useToast();

  const handleTabChange = useCallback((tab: AppTab) => {
    setIsMobileMenuOpen(false);
    if (tab === activeTab) return;
    feedback.click();
    setPrevTab(activeTab);
    setActiveTab(tab);
  }, [activeTab]);

  const handleNavigateToSearch = useCallback((type: string, query: string) => {
    setGlobalSearch({ type, query });
    handleTabChange(AppTab.Cercar);
  }, [handleTabChange]);

  useEffect(() => {
    const interval = setInterval(() => {
      setInitProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 20;
      });
    }, 200);

    return () => clearInterval(interval);
  }, []);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const [isPrivacyMode, setIsPrivacyMode] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [userProfile, setUserProfile] = useState(() => {
    const saved = localStorage.getItem('user_profile');
    if (saved) return JSON.parse(saved);
    return {
      firstName: 'Marcos',
      lastName: 'Lopez',
      email: 'mlopez@fgc.cat',
      role: 'FGC Operacions'
    };
  });

  useEffect(() => {
    const fetchProfile = async () => {
      const saved = localStorage.getItem('user_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.id) {
          const { data, error } = await supabase.from('supervisor_profiles').select('*').eq('id', parsed.id).single();
          if (data && !error) {
            const profile = {
              id: data.id,
              firstName: data.first_name,
              lastName: data.last_name,
              email: data.email || '',
              role: data.role
            };
            setUserProfile(profile);
            localStorage.setItem('user_profile', JSON.stringify(profile));
          }
        }
      }
    };
    fetchProfile();
  }, []);

  const handleProfileUpdate = async (newProfile: { id?: string, firstName: string, lastName: string, email: string, role: string }) => {
    const payload = {
      first_name: newProfile.firstName,
      last_name: newProfile.lastName,
      email: newProfile.email,
      role: newProfile.role
    };

    let updatedProfile = { ...newProfile };

    if (newProfile.id) {
      await supabase.from('supervisor_profiles').update(payload).eq('id', newProfile.id);
    } else {
      const { data, error } = await supabase.from('supervisor_profiles').insert(payload).select().single();
      if (data && !error) {
        updatedProfile.id = data.id;
      }
    }

    setUserProfile(updatedProfile);
    localStorage.setItem('user_profile', JSON.stringify(updatedProfile));
    showToast('Perfil actualitzat correctament', 'success');
    feedback.success();
  };
  const [globalSearch, setGlobalSearch] = useState<{ type: string, query: string } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  const [isProNav, setIsProNav] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('proNav') === 'true';
    }
    return false;
  });

  const [isSoundEnabled, setIsSoundEnabled] = useState(() => {
    return feedback.isSoundsEnabled();
  });

  const handleToggleSound = () => {
    const newState = !isSoundEnabled;
    setIsSoundEnabled(newState);
    feedback.setSoundsEnabled(newState);
    if (newState) feedback.click();
  };

  useEffect(() => {
    localStorage.setItem('proNav', isProNav.toString());
  }, [isProNav]);

  const [parkedUnits, setParkedUnits] = useState<ParkedUnit[]>([]);

  const handleShare = useCallback(async (title: string, text: string, url: string = window.location.href, files?: File[]) => {
    feedback.click();
    if (navigator.share) {
      try {
        const shareData: ShareData = { title, text, url };
        if (files && files.length > 0 && navigator.canShare && navigator.canShare({ files })) {
          shareData.files = files;
        }
        await navigator.share(shareData);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.warn('Share failed', e);
        }
      }
    } else {
      navigator.clipboard.writeText(`${title}\n${text}\n${url}`);
      showToast('Enllaç copiat al portapapers', 'success');
    }
  }, [showToast]);

  const [searchTriggerRect, setSearchTriggerRect] = useState<DOMRect | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);

  const fetchParkedUnits = useCallback(async () => {
    const { data } = await supabase.from('parked_units').select('*');
    if (data) setParkedUnits(data);
  }, []);

  useEffect(() => {
    fetchParkedUnits();
    const channel = supabase.channel('global_parked_units')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parked_units' }, fetchParkedUnits)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        feedback.click();
        setIsCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, []);

  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window);
    if (isMobile) return;

    let ticking = false;
    let mouseTicking = false;

    const handleParallax = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          document.documentElement.style.setProperty('--scroll-y', `${scrollY}px`);
          ticking = false;
        });
        ticking = true;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseTicking) {
        window.requestAnimationFrame(() => {
          const x = (e.clientX / window.innerWidth - 0.5) * 2;
          const y = (e.clientY / window.innerHeight - 0.5) * 2;
          document.documentElement.style.setProperty('--mouse-x', x.toString());
          document.documentElement.style.setProperty('--mouse-y', y.toString());
          mouseTicking = false;
        });
        mouseTicking = true;
      }
    };

    window.addEventListener('scroll', handleParallax, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleParallax);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const handleCommandSelect = (result: any) => {
    setIsCommandPaletteOpen(false);
    let searchType = 'torn';
    if (result.type === 'driver') searchType = 'maquinista';
    if (result.type === 'circulation') searchType = 'circulacio';
    if (result.type === 'station') searchType = 'estacio';

    setGlobalSearch({ type: searchType, query: result.id });
    handleTabChange(AppTab.Cercar);
    showToast(`Cercant ${result.title}...`, 'info');
  };

  const navItems = [
    { id: AppTab.Dashboard, label: 'CCO', icon: <Eye size={18} /> },
    { id: AppTab.Cercar, label: 'Cercar', icon: <Search size={18} /> },
    { id: AppTab.Organitza, label: 'Organitza', icon: <RefreshCcw size={18} /> },
    { id: AppTab.Incidencia, label: 'Incidència', icon: <ShieldAlert size={18} /> },
    { id: AppTab.Cicles, label: 'Unitats', icon: <Train size={18} /> }
  ];

  const toggleAdminMode = () => {
    setIsPrivacyMode(prev => !prev);
    setShowSecretMenu(prev => !prev);
    feedback.success();
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col transition-colors duration-300">
      <SplashScreen progress={initProgress} onComplete={() => setIsInitializing(false)} />

      <div className="mesh-bg">
        <div className="blob blob-1 parallax-blob" data-speed="0.05" />
        <div className="blob blob-2 parallax-blob" data-speed="0.08" />
        <div className="blob blob-3 parallax-blob" data-speed="0.03" />
      </div>

      <div className={`flex flex-1 overflow-hidden ${isProNav ? 'flex-row' : 'flex-col'}`}>
        {isProNav && (
          <Sidebar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            navItems={navItems}
            isPrivacyMode={isPrivacyMode}
            toggleAdminMode={toggleAdminMode}
            onSettingsClick={() => setIsSettingsOpen(!isSettingsOpen)}
            onProfileClick={() => setIsProfileModalOpen(true)}
            onUploadClick={() => setShowUploadModal(true)}
            isDarkMode={isDarkMode}
            userProfile={userProfile}
            onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
            settingsButtonRef={settingsRef as any}
          />
        )}

        <div className={`flex-1 flex flex-col min-w-0 relative ${isProNav ? 'lg:pl-20' : ''}`}>
          {(!isProNav || isMobileMenuOpen) && (
            <nav style={{ backgroundColor: isDarkMode ? '#222222' : '#4D5358' }} className="sticky top-0 z-40 dark:backdrop-blur-md text-white shadow-md safe-top border-b border-white/5 transition-all w-full">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-20 sm:h-24">
                  <div
                    className="flex items-center gap-4 cursor-pointer select-none group"
                    onDoubleClick={toggleAdminMode}
                  >
                    <img
                      src="https://www.fgc.cat/wp-content/uploads/2020/06/logo-FGC-square.png"
                      alt="FGC Logo"
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover shadow-sm transition-transform active:scale-95 group-hover:brightness-110"
                    />
                    <span className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                      <span className="text-white transition-colors duration-300">Cerca</span>
                      <span className="text-fgc-green">Torns</span> <span className="pro-badge">PRO</span>
                    </span>
                  </div>

                  <div className="hidden md:flex items-center gap-1">
                    {navItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleTabChange(item.id)}
                        className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-base font-semibold transition-all group/nav ${activeTab === item.id
                          ? 'bg-fgc-green text-fgc-grey shadow-lg shadow-fgc-green/20'
                          : 'text-gray-300 hover:bg-white/10 hover:text-white'
                          }`}
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    ))}

                    <div className="w-px h-8 bg-white/10 mx-3" />

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setShowUploadModal(true)}
                        title="Carregar PDF Diari"
                        className="flex items-center justify-center w-12 h-12 bg-white/10 hover:bg-fgc-green hover:text-fgc-grey rounded-xl transition-all group"
                      >
                        <Download size={22} className="group-hover:scale-110 transition-transform" />
                      </button>

                      <div className="relative">
                        <button
                          ref={!isProNav ? (settingsRef as any) : null}
                          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                          className={`flex items-center justify-center w-12 h-12 rounded-xl transition-all group ${isSettingsOpen && !isProNav ? 'bg-fgc-green text-fgc-grey shadow-lg' : 'bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white'}`}
                        >
                          <Settings size={22} className={`transition-transform duration-500 ${isSettingsOpen && !isProNav ? 'rotate-90' : 'group-hover:rotate-45'}`} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="md:hidden flex items-center gap-2">
                    <button
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      className="p-2 rounded-lg text-white hover:bg-white/10 transition-colors"
                    >
                      {isDarkMode ? <Moon size={24} /> : <Sun size={24} />}
                    </button>
                    <button
                      onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                      className="p-2 rounded-lg text-white hover:bg-white/10 transition-transform active:scale-90"
                    >
                      <div className={`transition-all duration-500 ${isMobileMenuOpen ? 'rotate-90 scale-110' : 'rotate-0 scale-100'}`}>
                        {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className={`md:hidden space-y-1 overflow-hidden dynamic-island-menu ${isMobileMenuOpen ? 'dynamic-island-menu-open' : ''}`}>
                {navItems.map((item, index) => (
                  <button
                    key={item.id}
                    onClick={() => handleTabChange(item.id)}
                    className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-lg font-bold transition-all active:scale-95 menu-item-stagger ${activeTab === item.id ? 'bg-fgc-green text-fgc-grey' : 'text-fgc-grey/70 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'}`}
                    style={{ transitionDelay: `${index * 50}ms` }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setShowUploadModal(true);
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-4 px-6 py-4 text-fgc-green font-bold text-lg border-t border-black/5 dark:border-white/5 mt-4 menu-item-stagger"
                  style={{ transitionDelay: `${navItems.length * 50}ms` }}
                >
                  <Download size={20} />
                  Carregar PDF Diari
                </button>
              </div>
            </nav>
          )}

          {/* Settings Dropdown - Now always accessible and correctly positioned */}
          {isSettingsOpen && (
            <div
              className={`fixed ${isProNav ? 'left-20 bottom-6 ml-4 z-[100]' : 'right-4 top-24 z-[100]'} w-64 bg-white dark:bg-[#4D5358] rounded-[24px] shadow-2xl border border-gray-100 dark:border-white/10 py-3 animate-in fade-in slide-in-from-top-4 duration-200`}
              ref={settingsRef}
            >
              <div className="px-6 py-3 border-b border-gray-100 dark:border-white/5">
                <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Ajustes</h4>
              </div>
              <div className="px-3 pt-2">
                {/* Profile Section inside Settings */}
                <button
                  onClick={() => {
                    setIsProfileModalOpen(true);
                    setIsSettingsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group mb-1"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-lg capitalize">
                    {userProfile.firstName?.[0] || 'M'}{userProfile.lastName?.[0] || 'L'}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-black text-fgc-grey dark:text-white uppercase leading-none truncate">
                      {userProfile.firstName} {userProfile.lastName}
                    </p>
                    <p className="text-[10px] text-gray-500 font-bold mt-1 uppercase tracking-tighter truncate">
                      {userProfile.role}
                    </p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-fgc-green/10 text-fgc-green group-hover:scale-110 transition-transform">
                    <Settings size={14} />
                  </div>
                </button>

                <div className="h-px bg-gray-100 dark:bg-white/5 mx-3 mb-2" />
                <button
                  onClick={() => {
                    setIsDarkMode(!isDarkMode);
                    setIsSettingsOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-gray-100 dark:bg-white/10 text-fgc-grey dark:text-gray-300 group-hover:scale-110 transition-transform">
                      {isDarkMode ? <Moon size={18} /> : <Sun size={18} />}
                    </div>
                    <span className="text-sm font-bold text-fgc-grey dark:text-gray-200">Mode Fosc</span>
                  </div>
                  <div className={`w-12 h-6 rounded-full relative transition-colors duration-300 border ${isDarkMode ? 'bg-fgc-green border-fgc-green' : 'bg-gray-200 border-gray-300'}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${isDarkMode ? 'left-7' : 'left-1'}`} />
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsProNav(!isProNav);
                    setIsSettingsOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-gray-100 dark:bg-white/10 text-fgc-grey dark:text-gray-300 group-hover:scale-110 transition-transform">
                      <Layers size={18} />
                    </div>
                    <span className="text-sm font-bold text-fgc-grey dark:text-gray-200">
                      Navegació
                    </span>
                  </div>
                  <div className={`w-12 h-6 rounded-full relative transition-colors duration-300 border ${isProNav ? 'bg-fgc-green border-fgc-green' : 'bg-gray-200 border-gray-300'}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${isProNav ? 'left-7' : 'left-1'}`} />
                  </div>
                </button>

                <button
                  onClick={handleToggleSound}
                  className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-gray-100 dark:bg-white/10 text-fgc-grey dark:text-gray-300 group-hover:scale-110 transition-transform">
                      {isSoundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                    </div>
                    <span className="text-sm font-bold text-fgc-grey dark:text-gray-200">
                      Sons de l'App
                    </span>
                  </div>
                  <div className={`w-12 h-6 rounded-full relative transition-colors duration-300 border ${isSoundEnabled ? 'bg-fgc-green border-fgc-green' : 'bg-gray-200 border-gray-300'}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${isSoundEnabled ? 'left-7' : 'left-1'}`} />
                  </div>
                </button>

                <div className="mx-3 mt-4 mb-2 p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Cerca Intel·ligent</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 italic">Atall Windows</span>
                      <span className="px-1.5 py-0.5 bg-white dark:bg-white/10 rounded border border-gray-200 dark:border-white/10 text-[10px] font-bold text-fgc-grey dark:text-gray-300">CTRL + K</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 italic">Atall macOS</span>
                      <span className="px-1.5 py-0.5 bg-white dark:bg-white/10 rounded border border-gray-200 dark:border-white/10 text-[10px] font-bold text-fgc-grey dark:text-gray-300">⌘ + K</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto w-full py-8 safe-bottom max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 overflow-x-hidden">
            <div className={`${activeTab === AppTab.Dashboard ? 'block animate-in fade-in slide-in-from-right-8 duration-500' : 'hidden'}`}>
              <DashboardView />
            </div>
            <div className={`${activeTab === AppTab.Cercar ? 'block animate-in fade-in slide-in-from-right-8 duration-500' : 'hidden'}`}>
              <CercarView
                isPrivacyMode={isPrivacyMode}
                externalSearch={globalSearch}
                onExternalSearchHandled={() => setGlobalSearch(null)}
              />
            </div>
            <div className={`${activeTab === AppTab.Organitza ? 'block animate-in fade-in slide-in-from-right-8 duration-500' : 'hidden'}`}>
              <OrganitzaView
                isPrivacyMode={isPrivacyMode}
                onNavigateToSearch={handleNavigateToSearch}
              />
            </div>
            <div className={`${activeTab === AppTab.Incidencia ? 'block animate-in fade-in slide-in-from-right-8 duration-500' : 'hidden'}`}>
              <IncidenciaView
                showSecretMenu={showSecretMenu}
                parkedUnits={parkedUnits}
                onParkedUnitsChange={fetchParkedUnits}
                isPrivacyMode={isPrivacyMode}
              />
            </div>
            <div className={`${activeTab === AppTab.Cicles ? 'block animate-in fade-in slide-in-from-right-8 duration-500' : 'hidden'}`}>
              <CiclesView parkedUnits={parkedUnits} onParkedUnitsChange={fetchParkedUnits} />
            </div>
          </div>
        </div>
      </div>

      <button
        ref={searchButtonRef}
        onClick={(e) => {
          feedback.click();
          setSearchTriggerRect(e.currentTarget.getBoundingClientRect());
          setIsCommandPaletteOpen(true);
        }}
        className={`md:hidden fixed bottom-8 right-6 w-16 h-16 bg-fgc-green text-fgc-grey rounded-full shadow-[0_16px_32px_-8px_rgba(168,208,23,0.5)] border-4 border-white dark:border-gray-900 flex items-center justify-center z-[9999] active:scale-90 transition-all duration-500 ${isCommandPaletteOpen ? 'scale-0 rotate-90 opacity-0 pointer-events-none' : 'scale-100 rotate-0 opacity-100'}`}
        title="Búsqueda Inteligente"
      >
        <Search size={28} strokeWidth={3} />
      </button>

      {showUploadModal && <FileUploadModal onClose={() => setShowUploadModal(false)} />}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelect={handleCommandSelect}
        triggerRect={searchTriggerRect}
      />

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentProfile={userProfile}
        onSave={handleProfileUpdate}
      />
    </div>
  );
};

export default App;