import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, RefreshCcw, Train, Menu, X, Download, BookOpen, Settings, Moon, Sun, ShieldAlert } from 'lucide-react';
import { AppTab } from './types.ts';
import { CercarView } from './views/CercarView.tsx';
import OrganitzaView from './views/OrganitzaView.tsx';
import CiclesView from './views/CiclesView.tsx';
import IncidenciaView from './views/IncidenciaView.tsx';
import FileUploadModal from './components/FileUploadModal.tsx';
import CommandPalette from './components/CommandPalette.tsx';
import { supabase } from './supabaseClient.ts';
import { feedback } from './utils/feedback';
import { useToast } from './components/ToastProvider';

interface ParkedUnit {
  unit_number: string;
  depot_id: string;
  track: string;
}

import SplashScreen from './components/common/SplashScreen.tsx';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.Cercar);
  const [prevTab, setPrevTab] = useState<AppTab | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initProgress, setInitProgress] = useState(0);
  const { showToast } = useToast();

  const handleTabChange = useCallback((tab: AppTab) => {
    if (tab === activeTab) return;
    feedback.click();
    setPrevTab(activeTab);
    setActiveTab(tab);
  }, [activeTab]);

  useEffect(() => {
    // Simulació de càrrega de dades inicials
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
  const [globalSearch, setGlobalSearch] = useState<{ type: string, query: string } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

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

  const onExternalSearchHandled = useCallback(() => setGlobalSearch(null), []);

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

  // Parallax Effect Logic - Optimized for Desktop, Disabled for Mobile
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

    // Convert command types to search search types
    let searchType = 'torn';
    if (result.type === 'driver') searchType = 'maquinista';
    if (result.type === 'circulation') searchType = 'circulacio';
    if (result.type === 'station') searchType = 'estacio';

    setGlobalSearch({ type: searchType, query: result.id });
    handleTabChange(AppTab.Cercar);
    showToast(`Cercant ${result.title}...`, 'info');
  };

  const navItems = [
    { id: AppTab.Cercar, label: 'Cercar', icon: <Search size={18} /> },
    { id: AppTab.Organitza, label: 'Organitza', icon: <RefreshCcw size={18} /> },
    { id: AppTab.Incidencia, label: 'Incidència', icon: <ShieldAlert size={18} /> },
    { id: AppTab.Cicles, label: 'Unitats', icon: <Train size={18} /> }
  ];


  const toggleSecretMenu = () => {
    setShowSecretMenu(prev => !prev);
  };

  const togglePrivacyMode = () => {
    setIsPrivacyMode(prev => !prev);
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col transition-colors duration-300">
      <SplashScreen progress={initProgress} onComplete={() => setIsInitializing(false)} />

      {/* High-Fidelity Mesh Background Global with Parallax */}
      <div className="mesh-bg">
        <div className="blob blob-1 parallax-blob" data-speed="0.05" />
        <div className="blob blob-2 parallax-blob" data-speed="0.08" />
        <div className="blob blob-3 parallax-blob" data-speed="0.03" />
      </div>
      {/* Top Navigation Bar con soporte para Safe Areas */}
      <nav className="sticky top-0 z-40 bg-fgc-grey dark:bg-black/80 dark:backdrop-blur-md text-white shadow-md safe-top border-b border-white/5 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 sm:h-24">
            {/* Logo & Title */}
            <div
              className="flex items-center gap-4 cursor-pointer select-none group"
              onDoubleClick={toggleSecretMenu}
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

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleTabChange(item.id)}
                  onDoubleClick={item.id === AppTab.Cercar ? togglePrivacyMode : undefined}
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

                {/* Settings Menu Trigger */}
                <div className="relative" ref={settingsRef}>
                  <button
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                    className={`flex items-center justify-center w-12 h-12 rounded-xl transition-all group ${isSettingsOpen ? 'bg-fgc-green text-fgc-grey shadow-lg' : 'bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white'
                      }`}
                  >
                    <Settings size={22} className={`transition-transform duration-500 ${isSettingsOpen ? 'rotate-90' : 'group-hover:rotate-45'}`} />
                  </button>

                  {/* Settings Dropdown */}
                  {isSettingsOpen && (
                    <div className="absolute right-0 mt-3 w-64 bg-white dark:bg-gray-900 rounded-[24px] shadow-2xl border border-gray-100 dark:border-white/10 py-3 animate-in fade-in slide-in-from-top-4 duration-200">
                      <div className="px-6 py-3 border-b border-gray-100 dark:border-white/5">
                        <h4 className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Ajustes</h4>
                      </div>
                      <div className="px-3 pt-2">
                        <button
                          onClick={() => setIsDarkMode(!isDarkMode)}
                          className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-gray-100 dark:bg-white/10 text-fgc-grey dark:text-gray-300 group-hover:scale-110 transition-transform">
                              {isDarkMode ? <Moon size={18} /> : <Sun size={18} />}
                            </div>
                            <span className="text-sm font-bold text-fgc-grey dark:text-gray-200">Mode Fosc</span>
                          </div>
                          <div className={`w-12 h-6 rounded-full relative transition-colors duration-300 border ${isDarkMode ? 'bg-fgc-green border-fgc-green' : 'bg-gray-200 border-gray-300'
                            }`}>
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${isDarkMode ? 'left-7' : 'left-1'
                              }`} />
                          </div>
                        </button>

                        <div className="mx-3 mt-4 mb-2 p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                          <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Cerca Intel·ligent</p>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 italic">Atall Windows</span>
                              <span className="px-1.5 py-0.5 bg-white dark:bg-white/10 rounded border border-gray-200 dark:border-white/10 text-[10px] font-black text-fgc-grey dark:text-gray-300">CTRL + K</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 italic">Atall macOS</span>
                              <span className="px-1.5 py-0.5 bg-white dark:bg-white/10 rounded border border-gray-200 dark:border-white/10 text-[10px] font-black text-fgc-grey dark:text-gray-300">⌘ + K</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile menu button */}
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

        {/* Mobile menu (Notch expansion style) */}
        <div className={`md:hidden space-y-1 overflow-hidden dynamic-island-menu ${isMobileMenuOpen ? 'dynamic-island-menu-open' : ''}`}>
          {navItems.map((item, index) => (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              onDoubleClick={item.id === AppTab.Cercar ? togglePrivacyMode : undefined}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-lg font-bold transition-all active:scale-95 menu-item-stagger ${activeTab === item.id ? 'bg-fgc-green text-fgc-grey' : 'text-fgc-grey/70 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
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

      {/* Main Content: Mantenim les vistes muntades però ocultes per preservar l'estat */}
      <main className="flex-1 w-full py-8 safe-bottom max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 overflow-x-hidden">
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

      </main >

      {/* Floating Smart Search Button (Mobile ONLY) */}
      < button
        ref={searchButtonRef}
        onClick={(e) => {
          feedback.click();
          setSearchTriggerRect(e.currentTarget.getBoundingClientRect());
          setIsCommandPaletteOpen(true);
        }}
        className={`md:hidden fixed bottom-8 right-6 w-16 h-16 bg-fgc-green text-fgc-grey rounded-full shadow-[0_16px_32px_-8px_rgba(0,177,64,0.5)] border-4 border-white dark:border-gray-900 flex items-center justify-center z-[9999] active:scale-90 transition-all duration-500 ${isCommandPaletteOpen ? 'scale-0 rotate-90 opacity-0 pointer-events-none' : 'scale-100 rotate-0 opacity-100'}`}
        title="Búsqueda Inteligente"
      >
        <Search size={28} strokeWidth={3} />
      </button >

      {showUploadModal && <FileUploadModal onClose={() => setShowUploadModal(false)} />}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelect={handleCommandSelect}
        triggerRect={searchTriggerRect}
      />
    </div >
  );
};

export default App;