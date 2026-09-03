import React from 'react';
import { 
  FileText, 
  Mail, 
  Package, 
  Search, 
  Send, 
  Settings, 
  Sparkles, 
  PlusCircle, 
  Layers,
  Users,
  Camera
} from 'lucide-react';
import { CompanySettings } from '../types';

interface NavbarProps {
  activeTab: 'inbox' | 'builder' | 'preview' | 'catalog' | 'history' | 'websearch' | 'analyses';
  setActiveTab: (tab: 'inbox' | 'builder' | 'preview' | 'catalog' | 'history' | 'websearch' | 'analyses') => void;
  unreadCount: number;
  openSettings: () => void;
  openWebSearch: () => void;
  openClientsModal?: () => void;
  settings: CompanySettings;
  onNewQuote: () => void;
  analysesCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  unreadCount,
  openSettings,
  openWebSearch,
  openClientsModal,
  settings,
  onNewQuote,
  analysesCount = 0
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-200/90 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          <div className="flex items-center gap-3 cursor-pointer select-none shrink-0" onClick={() => setActiveTab('inbox')}>
            <img 
              src="/infodesk-logo-original.svg" 
              alt="Infodesk" 
              className="h-8 w-auto object-contain shrink-0 transition-transform hover:opacity-90" 
            />
            <div className="h-6 w-px bg-slate-200 shrink-0"></div>
            <div className="shrink-0">
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="font-bold text-sm tracking-tight text-slate-900">
                  SmartQuote
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-sky-50 text-sky-700 border border-sky-200 rounded-md">
                  IA
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-medium leading-none mt-0.5 whitespace-nowrap">Automação Comercial</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shrink-0">
            <button
              onClick={() => setActiveTab('inbox')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'inbox'
                  ? 'bg-white text-sky-700 border border-slate-200 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Inbox</span>
              {unreadCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-sky-500 text-white text-[10px] font-bold rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('builder')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'builder'
                  ? 'bg-white text-sky-700 border border-slate-200 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Cotação</span>
            </button>

            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'preview'
                  ? 'bg-white text-sky-700 border border-slate-200 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Proposta</span>
            </button>

            <button
              onClick={() => setActiveTab('catalog')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'catalog'
                  ? 'bg-white text-sky-700 border border-slate-200 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Catálogo</span>
            </button>

            <button
              onClick={() => setActiveTab('analyses')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'analyses'
                  ? 'bg-white text-violet-700 border border-slate-200 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Análises Avulsas</span>
              {analysesCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-violet-500 text-white text-[10px] font-bold rounded-full">
                  {analysesCount}
                </span>
              )}
            </button>

            {openClientsModal && (
              <button
                type="button"
                onClick={openClientsModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap text-slate-700 hover:text-slate-900 hover:bg-slate-200/60"
                title="Cadastro e Gestão de Empresas e Compradores"
              >
                <Users className="w-3.5 h-3.5 text-sky-600" />
                <span>Empresas & Compradores</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'history'
                  ? 'bg-white text-sky-700 border border-slate-200 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Enviados</span>
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {openClientsModal && (
              <button
                type="button"
                onClick={openClientsModal}
                className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition shadow-2xs whitespace-nowrap"
                title="Empresas & Compradores"
              >
                <Users className="w-3.5 h-3.5 text-sky-600" />
                <span>Empresas</span>
              </button>
            )}

            <button
              onClick={openWebSearch}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition shadow-xs whitespace-nowrap"
              title="Pesquisar Preços e Specs na Web"
            >
              <Search className="w-3.5 h-3.5 text-sky-600" />
              <span className="hidden sm:inline">Scanner de Preços</span>
            </button>

            <button
              onClick={onNewQuote}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-xs transition active:scale-95 whitespace-nowrap"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Novo Orçamento</span>
              <span className="sm:hidden">Novo</span>
            </button>

            <button
              onClick={openSettings}
              className="p-2 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition shadow-xs shrink-0"
              title="Configurações da Infodesk"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
