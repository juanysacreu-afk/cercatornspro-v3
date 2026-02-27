import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, RefreshCcw, Train, Menu, X, Download, BookOpen, Settings, Moon, Sun, ShieldAlert, Eye, Layers, Volume2, VolumeX, MessageCircle, HelpCircle, Calendar } from 'lucide-react';
import { AppTab } from './types.ts';
import { CercarView } from './views/CercarView.tsx';
import OrganitzaView from './views/OrganitzaView.tsx';
import CiclesView from './views/CiclesView.tsx';
import IncidenciaView from './views/IncidenciaView.tsx';
import DashboardView from './views/dashboard/DashboardView.tsx';
import MensajeriaView from './views/mensajeria/MensajeriaView.tsx';
import FileUploadModal from './components/FileUploadModal.tsx';
import CommandPalette from './components/CommandPalette.tsx';
import Sidebar from './components/common/Sidebar.tsx';
import { supabase } from './supabaseClient.ts';
import { feedback } from './utils/feedback';
import { getMapPositionForPk } from './views/incidencia/mapUtils';

import { OnboardingTour } from './components/common/OnboardingTour.tsx';
import { useToast } from './components/ToastProvider';
import { CalendarManager } from './components/CalendarManager';
import ProfileModal from './components/ProfileModal.tsx';
import { syncOfflineData } from './utils/offlineSync';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [initMessage, setInitMessage] = useState('Sincronitzant dades...');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const activeTabRef = useRef(activeTab);
  const { showToast } = useToast();
  const [focusLocation, setFocusLocation] = useState<{ lat: number; lon: number; label: string; x?: number; y?: number } | null>(null);



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

  const handleLookOnMap = useCallback((loc: { lat: number; lon: number; label: string; x?: number; y?: number }) => {
    setFocusLocation(loc);
    handleTabChange(AppTab.Incidencia);
  }, [handleTabChange]);


  useEffect(() => {
    const doSync = async () => {
      await syncOfflineData((msg, progressValue) => {
        setInitMessage(msg);
        if (progressValue !== undefined) {
          setInitProgress(progressValue);
        }
      });
      setInitProgress(100);
    };

    const timer = setTimeout(doSync, 500);
    return () => clearTimeout(timer);
  }, []);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isMonitorMode, setIsMonitorMode] = useState(false);
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const [isPrivacyMode, setIsPrivacyMode] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [userProfile, setUserProfile] = useState(() => {
    const saved = localStorage.getItem('user_profile');
    if (saved) return JSON.parse(saved);
    return {
      firstName: '',
      lastName: '',
      email: '',
      role: ''
    };
  });

  useEffect(() => {
    activeTabRef.current = activeTab;
    if (activeTab === AppTab.Mensajeria) {
      setUnreadMessages(0);
      localStorage.setItem('mensajeriaLastRead', new Date().toISOString());
    }
  }, [activeTab]);

  useEffect(() => {
    const initUnread = async () => {
      const lastRead = localStorage.getItem('mensajeriaLastRead') || new Date(0).toISOString();
      const { count, error } = await supabase
        .from('telegram_messages')
        .select('*', { count: 'exact', head: true })
        .gt('created_at', lastRead);

      if (!error && count !== null) {
        setUnreadMessages(count);
      }
    };
    initUnread();

    const subs = supabase.channel('telegram_messages_unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telegram_messages' }, () => {
        if (activeTabRef.current !== AppTab.Mensajeria) {
          setUnreadMessages(prev => prev + 1);
        } else {
          localStorage.setItem('mensajeriaLastRead', new Date().toISOString());
        }
      })
      .subscribe();

    return () => { subs.unsubscribe(); };
  }, []);

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
        } else if (!parsed.email) {
          setIsProfileModalOpen(true);
        }
      } else {
        setIsProfileModalOpen(true);
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

  // AUTO-RECOVERY: If user is trapped in ProNav on mobile due to a previous bug,
  // forcefully disable it on load so they get their top navbar back.
  useEffect(() => {
    if (isProNav && window.innerWidth < 1024) {
      setIsProNav(false);
      localStorage.setItem('proNav', 'false');
    }
  }, []);

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
    { id: AppTab.Cicles, label: 'Unitats', icon: <Train size={18} /> },
    { id: AppTab.Mensajeria, label: 'Missatges', icon: <MessageCircle size={18} /> }
  ];

  const toggleAdminMode = () => {
    setIsPrivacyMode(prev => !prev);
    setShowSecretMenu(prev => !prev);
    feedback.success();
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col transition-colors duration-300">
      <SplashScreen progress={initProgress} message={initMessage} onComplete={() => setIsInitializing(false)} />

      <div className="mesh-bg">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      <div className="flex flex-1 overflow-hidden flex-row">
        <AnimatePresence initial={false}>
          {isProNav && !isMonitorMode && (
            <motion.div
              key="sidebar"
              initial={{ width: 0, opacity: 0, scale: 0.95 }}
              animate={{ width: 'auto', opacity: 1, scale: 1 }}
              exit={{ width: 0, opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", bounce: 0.2, duration: 0.7 }}
              className="z-50 shrink-0 origin-left overflow-hidden hidden lg:block"
            >
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
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col min-w-0 relative">
          <AnimatePresence initial={false}>
            {!isProNav && !isMonitorMode && (
              <motion.nav
                key="topnav"
                initial={{ height: 0, opacity: 0, scale: 0.95 }}
                animate={{ height: 'auto', opacity: 1, scale: 1 }}
                exit={{ height: 0, opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.7 }}
                style={{ backgroundColor: isDarkMode ? '#222222' : '#4D5358' }}
                className="sticky top-0 z-50 dark:backdrop-blur-md text-white shadow-md safe-top border-b border-white/5 w-full shrink-0 origin-top"
              >
                <div className="w-full px-4 sm:px-6 lg:px-8">
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
                      <img
                        src="/logo-pro.png"
                        alt="Nexus"
                        className="h-10 sm:h-12 w-auto object-contain"
                      />
                    </div>

                    <div className="hidden md:flex items-center gap-1">
                      {navItems.filter((item) => item.id !== AppTab.Mensajeria).map((item) => (
                        <button
                          key={item.id}
                          data-tour={`${item.id}-tab`}
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
                          data-tour="mensajeria-tab"
                          onClick={() => handleTabChange(AppTab.Mensajeria)}
                          title="Missatges"
                          className={`relative flex items-center justify-center w-12 h-12 rounded-xl transition-all group ${activeTab === AppTab.Mensajeria ? 'bg-fgc-green text-fgc-grey shadow-lg' : 'bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white'}`}
                        >
                          <div className="relative">
                            <MessageCircle size={22} className={activeTab === AppTab.Mensajeria ? '' : 'group-hover:scale-110 transition-transform'} />
                            {unreadMessages > 0 && <span className="absolute -top-1.5 -right-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-red-500 ring-2 ring-[#4D5358] dark:ring-[#222222] text-[10px] font-bold text-white shadow-sm animate-in zoom-in">{unreadMessages}</span>}
                          </div>
                        </button>

                        <button
                          onClick={() => setShowUploadModal(true)}
                          title="Carregar PDF Diari"
                          className="flex items-center justify-center w-12 h-12 bg-white/10 hover:bg-fgc-green hover:text-fgc-grey rounded-xl transition-all group"
                        >
                          <Download size={22} className="group-hover:scale-110 transition-transform" />
                        </button>

                        <button
                          onClick={() => (window as any).startAppTour?.()}
                          title="Tour Guia"
                          className="flex items-center justify-center w-12 h-12 bg-white/10 hover:bg-fgc-green hover:text-fgc-grey rounded-xl transition-all group"
                        >
                          <HelpCircle size={22} className="group-hover:scale-110 transition-transform" />
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
                        ref={settingsRef as any}
                        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                        className={`p-2 rounded-lg text-white hover:bg-white/10 transition-colors ${isSettingsOpen ? 'bg-white/10' : ''}`}
                      >
                        <Settings size={24} className={`transition-transform duration-500 ${isSettingsOpen ? 'rotate-90' : ''}`} />
                      </button>
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
              </motion.nav>
            )}
          </AnimatePresence>

          {/* Settings Dropdown - Now always accessible and correctly positioned */}
          {isSettingsOpen && (
            <div
              className={`fixed ${isProNav ? 'left-20 bottom-6 ml-4 z-[100]' : 'right-4 top-24 z-[100]'} w-64 bg-white dark:bg-[#4D5358] rounded-[24px] shadow-2xl border border-gray-100 dark:border-white/10 py-3 animate-modal-premium`}
              ref={settingsRef}
            >
              <div className="px-6 py-3 border-b border-gray-100 dark:border-white/5">
                <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Configuració</h4>
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
                  role="switch"
                  aria-checked={isDarkMode}
                  aria-label={isDarkMode ? 'Desactivar modo fosc' : 'Activar modo fosc'}
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
                  role="switch"
                  aria-checked={isProNav}
                  aria-label={isProNav ? 'Desactivar navegació lateral' : 'Activar navegació lateral'}
                  className="hidden lg:flex w-full items-center justify-between p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group"
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
                  role="switch"
                  aria-checked={isSoundEnabled}
                  aria-label={isSoundEnabled ? "Desactivar sons de l'aplicació" : "Activar sons de l'aplicació"}
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

                {/* Calendar Manager Button */}
                <button
                  onClick={() => {
                    setIsCalendarOpen(true);
                    setIsSettingsOpen(false);
                  }}
                  aria-label="Obrir Gestor de Calendari"
                  className="w-full flex items-center gap-3 p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group"
                >
                  <div className="p-2 rounded-xl bg-gray-100 dark:bg-white/10 text-fgc-grey dark:text-gray-300 group-hover:scale-110 transition-transform">
                    <Calendar size={18} />
                  </div>
                  <div className="flex-1 text-left">
                    <span className="text-sm font-bold text-fgc-grey dark:text-gray-200">Gestor de Calendari</span>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Codis de servei 2026</p>
                  </div>
                </button>

                <div className="hidden md:block mx-3 mt-4 mb-2 p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Cerca Intel·ligent</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 italic">Drecera Windows</span>
                      <span className="px-1.5 py-0.5 bg-white dark:bg-white/10 rounded border border-gray-200 dark:border-white/10 text-[10px] font-bold text-fgc-grey dark:text-gray-300">CTRL + K</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 italic">Drecera macOS</span>
                      <span className="px-1.5 py-0.5 bg-white dark:bg-white/10 rounded border border-gray-200 dark:border-white/10 text-[10px] font-bold text-fgc-grey dark:text-gray-300">⌘ + K</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Calendar Manager Modal */}
          {isCalendarOpen && (
            <CalendarManager onClose={() => setIsCalendarOpen(false)} />
          )}

          <div className="flex-1 w-full relative overflow-hidden">
            {[
              { id: AppTab.Dashboard, Component: <DashboardView onNavigateToSearch={handleNavigateToSearch} isMonitorMode={isMonitorMode} setIsMonitorMode={setIsMonitorMode} /> },
              {
                id: AppTab.Cercar, Component: <CercarView
                  isPrivacyMode={isPrivacyMode}
                  externalSearch={globalSearch}
                  onExternalSearchHandled={() => setGlobalSearch(null)}
                  onLookOnMap={handleLookOnMap}
                />
              },
              {
                id: AppTab.Organitza, Component: <OrganitzaView
                  isPrivacyMode={isPrivacyMode}
                  onNavigateToSearch={handleNavigateToSearch}
                />
              },
              {
                id: AppTab.Incidencia, Component: <IncidenciaView
                  showSecretMenu={showSecretMenu}
                  parkedUnits={parkedUnits}
                  onParkedUnitsChange={fetchParkedUnits}
                  isPrivacyMode={isPrivacyMode}
                  focusLocation={focusLocation}
                />
              },

              { id: AppTab.Cicles, Component: <CiclesView parkedUnits={parkedUnits} onParkedUnitsChange={fetchParkedUnits} /> },
              { id: AppTab.Mensajeria, Component: <MensajeriaView currentProfile={userProfile} /> }
            ].map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <motion.div
                  key={tab.id}
                  initial={false}
                  animate={{
                    opacity: isActive ? 1 : 0,
                    y: isActive ? 0 : 15,
                    scale: isActive ? 1 : 0.98,
                    pointerEvents: isActive ? 'auto' : 'none',
                    zIndex: isActive ? 10 : 0
                  }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className={`absolute inset-0 overflow-x-hidden w-full px-4 sm:px-6 lg:px-8 border-none no-scrollbar ${tab.id === AppTab.Mensajeria ? 'pt-6 lg:pt-8 pb-2 lg:pb-4 h-full overflow-y-hidden' : 'py-8 safe-bottom overflow-y-auto'}`}
                >
                  <div className={tab.id === AppTab.Mensajeria ? 'h-full flex flex-col' : ''}>
                    {tab.Component}
                  </div>
                </motion.div>
              );
            })}
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
        isMandatory={!userProfile.email}
      />

      <OnboardingTour />
    </div >
  );
};

export default App;