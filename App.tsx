
import React, { useState } from 'react';
import { Search, RefreshCcw, Train, Menu, X, Upload } from 'lucide-react';
import { AppTab } from './types';
import CercarView from './views/CercarView';
import OrganitzaView from './views/OrganitzaView';
import CiclesView from './views/CiclesView';
import FileUploadModal from './components/FileUploadModal';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.Cercar);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const navItems = [
    { id: AppTab.Cercar, label: 'Cercar', icon: <Search size={18} /> },
    { id: AppTab.Organitza, label: 'Organitza', icon: <RefreshCcw size={18} /> },
    { id: AppTab.Cicles, label: 'Cicles', icon: <Train size={18} /> }
  ];

  return (
    <div className="min-h-screen bg-fgc-light flex flex-col">
      {/* Top Navigation Bar */}
      <nav className="sticky top-0 z-50 bg-fgc-grey text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo & Title */}
            <div className="flex items-center gap-4">
              <img 
                src="https://www.fgc.cat/wp-content/uploads/2020/06/logo-FGC-square.png" 
                alt="FGC Logo" 
                className="w-12 h-12 rounded-lg object-cover shadow-sm"
              />
              <span className="text-2xl font-extrabold tracking-tight hidden sm:block">
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
          <div className="md:hidden bg-fgc-grey border-t border-white/10 px-2 pt-2 pb-3 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-base font-medium ${
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
              className="w-full flex items-center gap-4 px-4 py-3 text-fgc-green font-medium"
            >
              <Upload size={18} />
              Carregar PDF Diari
            </button>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === AppTab.Cercar && <CercarView />}
        {activeTab === AppTab.Organitza && <OrganitzaView />}
        {activeTab === AppTab.Cicles && <CiclesView />}
      </main>

      {showUploadModal && <FileUploadModal onClose={() => setShowUploadModal(false)} />}
    </div>
  );
};

export default App;
