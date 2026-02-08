import React, { useState, useEffect, useRef } from 'react';
import { Search, RefreshCcw, Train, Menu, X, Download, BookOpen, Settings, Moon, Sun, ShieldAlert } from 'lucide-react';
import { AppTab } from './types.ts';
import CercarView from './views/CercarView.tsx';
import OrganitzaView from './views/OrganitzaView.tsx';
import CiclesView from './views/CiclesView.tsx';
import AgendaView from './views/AgendaView.tsx';
import IncidenciaView from './views/IncidenciaView.tsx';
import FileUploadModal from './components/FileUploadModal.tsx';
import { supabase } from './supabaseClient.ts';

interface ParkedUnit {
  unit_number: string;
  depot_id: string;
  track: string;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.Cercar);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  const [parkedUnits, setParkedUnits] = useState<ParkedUnit[]>([]);

  const fetchParkedUnits = async () => {
    const { data } = await supabase.from('parked_units').select('*');
    if (data) setParkedUnits(data);
  };

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

  const navItems = [
    { id: AppTab.Cercar, label: 'Cercar', icon: <Search size={18} /> },
    { id: AppTab.Organitza, label: 'Organitza', icon: <RefreshCcw size={18} /> },
    { id: AppTab.Incidencia, label: 'Incidència', icon: <ShieldAlert size={18} /> },
    { id: AppTab.Cicles, label: 'Unitats', icon: <Train size={18} /> }
  ];

  if (showSecretMenu) {
    navItems.push({ id: AppTab.Agenda, label: 'Agenda', icon: <BookOpen size={18} /> });
  }

  const toggleSecretMenu = () => {
    setShowSecretMenu(prev => !prev);
  };

  const togglePrivacyMode = () => {
    setIsPrivacyMode(prev => !prev);
  };

  return (
    <div className="min-h-screen bg-fgc-light dark:bg-fgc-dark flex flex-col transition-colors duration-300">
      {/* Top Navigation Bar con soporte para Safe Areas */}
      <nav className="sticky top-0 z-50 bg-fgc-grey dark:bg-black/80 dark:backdrop-blur-md text-white shadow-md safe-top border-b border-white/5">
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
                Cerca<span className="text-fgc-green">Torns</span> <span className="pro-badge">PRO</span>
              </span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  onDoubleClick={item.id === AppTab.Cercar ? togglePrivacyMode : undefined}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-base font-semibold transition-all ${activeTab === item.id
                    ? 'bg-fgc-green text-fgc-grey shadow-lg shadow-fgc-green/20'
                    : 'text-gray-300 hover:bg-white/10 hover:text-white'
                    }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
              <div className="w-px h-8 bg-white/10 mx-3" />

              <div className="flex items-center gap-2">
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
                className="p-2 rounded-lg text-gray-400 hover:text-white"
              >
                {isDarkMode ? <Moon size={24} /> : <Sun size={24} />}
              </button>
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
              >
                {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-fgc-grey border-t border-white/10 px-2 pt-2 pb-3 space-y-1 shadow-2xl">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileMenuOpen(false);
                }}
                onDoubleClick={item.id === AppTab.Cercar ? togglePrivacyMode : undefined}
                className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl text-lg font-bold ${activeTab === item.id ? 'bg-fgc-green text-fgc-grey' : 'text-gray-300'
                  }`}
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
              className="w-full flex items-center gap-4 px-4 py-4 text-fgc-green font-bold text-lg border-t border-white/5 mt-2"
            >
              <Download size={20} />
              Carregar PDF Diari
            </button>
          </div>
        )}
      </nav>

      {/* Main Content: Mantenim les vistes muntades però ocultes per preservar l'estat */}
      <main className="flex-1 w-full py-8 safe-bottom max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={activeTab === AppTab.Cercar ? 'block' : 'hidden'}>
          <CercarView isPrivacyMode={isPrivacyMode} />
        </div>
        <div className={activeTab === AppTab.Organitza ? 'block' : 'hidden'}>
          <OrganitzaView isPrivacyMode={isPrivacyMode} />
        </div>
        <div className={activeTab === AppTab.Incidencia ? 'block' : 'hidden'}>
          <IncidenciaView isPrivacyMode={isPrivacyMode} showSecretMenu={showSecretMenu} parkedUnits={parkedUnits} onParkedUnitsChange={fetchParkedUnits} />
        </div>
        <div className={activeTab === AppTab.Cicles ? 'block' : 'hidden'}>
          <CiclesView parkedUnits={parkedUnits} onParkedUnitsChange={fetchParkedUnits} />
        </div>
        {showSecretMenu && (
          <div className={activeTab === AppTab.Agenda ? 'block' : 'hidden'}>
            <AgendaView isPrivacyMode={isPrivacyMode} />
          </div>
        )}
      </main>

      {showUploadModal && <FileUploadModal onClose={() => setShowUploadModal(false)} />}
    </div>
  );
};

export default App;