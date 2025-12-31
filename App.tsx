
import React, { useState } from 'react';
import { Search, RefreshCcw, Train, Menu, X, Upload, BookOpen } from 'lucide-react';
import { AppTab } from './types.ts';
import CercarView from './views/CercarView.tsx';
import OrganitzaView from './views/OrganitzaView.tsx';
import CiclesView from './views/CiclesView.tsx';
import AgendaView from './views/AgendaView.tsx';
import FileUploadModal from './components/FileUploadModal.tsx';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.Cercar);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showSecretMenu, setShowSecretMenu] = useState(false);

  const navItems = [
    { id: AppTab.Cercar, label: 'Cercar', icon: <Search size={18} /> },
    { id: AppTab.Organitza, label: 'Organitza', icon: <RefreshCcw size={18} /> },
    { id: AppTab.Cicles, label: 'Cicles', icon: <Train size={18} /> }
  ];

  if (showSecretMenu) {
    navItems.push({ id: AppTab.Agenda, label: 'Agenda', icon: <BookOpen size={18} /> });
  }

  const toggleSecretMenu = () => {
    setShowSecretMenu(prev => !prev);
  };

  return (
    <div className="min-h-screen bg-fgc-light flex flex-col">
      {/* Top Navigation Bar con soporte para Safe Areas */}
      <nav className="sticky top-0 z-50 bg-fgc-grey text-white shadow-md safe-top">
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
              <span className="text-xl sm:text-2xl font-extrabold tracking-tight hidden xs:block">
                Cercatorns<span className="text-fgc-green">Pro</span>
              </span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-base font-semibold transition-all ${
                    activeTab === item.id 
                      ? 'bg-fgc-green text-fgc-grey shadow-lg shadow-fgc-green/20' 
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
              <div className="w-px h-8 bg-white/10 mx-3" />
              <button 
                onClick={() => setShowUploadModal(true)}
                title="Carregar PDF Diari"
                className="flex items-center justify-center w-12 h-12 bg-white/10 hover:bg-fgc-green hover:text-fgc-grey rounded-xl transition-all group"
              >
                <Upload size={22} className="group-hover:scale-110 transition-transform" />
              </button>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
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
                className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl text-lg font-bold ${
                  activeTab === item.id ? 'bg-fgc-green text-fgc-grey' : 'text-gray-300'
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
              <Upload size={20} />
              Carregar PDF Diari
            </button>
          </div>
        )}
      </nav>

      {/* Main Content: Mantenim les vistes muntades però ocultes per preservar l'estat */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 safe-bottom">
        <div className={activeTab === AppTab.Cercar ? 'block' : 'hidden'}>
          <CercarView />
        </div>
        <div className={activeTab === AppTab.Organitza ? 'block' : 'hidden'}>
          <OrganitzaView />
        </div>
        <div className={activeTab === AppTab.Cicles ? 'block' : 'hidden'}>
          <CiclesView />
        </div>
        {showSecretMenu && (
          <div className={activeTab === AppTab.Agenda ? 'block' : 'hidden'}>
            <AgendaView />
          </div>
        )}
      </main>

      {showUploadModal && <FileUploadModal onClose={() => setShowUploadModal(false)} />}
    </div>
  );
};

export default App;
