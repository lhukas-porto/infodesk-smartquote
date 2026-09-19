import React from 'react';
import { 
  FileText, 
  Mail, 
  Package, 
  Search, 
  Settings, 
  Users,
  History,
  BarChart3,
  Clock
} from 'lucide-react';
import { CompanySettings } from '../types';

interface NavbarProps {
  activeTab: 'inbox' | 'builder' | 'preview' | 'catalog' | 'history' | 'websearch' | 'analyses' | 'clients' | 'dashboard';
  setActiveTab: (tab: 'inbox' | 'builder' | 'preview' | 'catalog' | 'history' | 'websearch' | 'analyses' | 'clients' | 'dashboard') => void;
  unreadCount: number;
  openSettings: () => void;
  openWebSearch?: () => void;
  openClientsModal?: () => void;
  settings: CompanySettings;
  onNewQuote?: () => void;
  analysesCount?: number;
  isScannerOpen?: boolean;
  draftsCount?: number;
  onOpenDraftsHistory?: () => void;
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
  analysesCount = 0,
  isScannerOpen = false,
  draftsCount = 0,
  onOpenDraftsHistory
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-200/90 shadow-xs">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-16 py-2 gap-4 lg:gap-6">
          
          {/* Lado Esquerdo: Marca Infodesk + Divisória + Navegação Integrada */}
          <div className="flex items-center gap-4 lg:gap-6 min-w-0">
            
            {/* Bloco da Marca: Logo horizontal elegante */}
            <div 
              className="flex items-center gap-2.5 cursor-pointer select-none shrink-0 group py-1" 
              onClick={() => setActiveTab('inbox')}
              title="Ir para o Inbox"
            >
              <img 
                src="/infodesk-logo.png" 
                alt="Infodesk" 
                className="h-7 md:h-8 w-auto object-contain shrink-0 transition-transform group-hover:opacity-90" 
              />
              <div className="h-6 w-px bg-slate-200 shrink-0 hidden sm:block" />
              <div className="shrink-0">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="font-bold text-sm tracking-tight text-slate-900 group-hover:text-sky-700 transition-colors">
                    SmartQuote
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-sky-50 text-sky-700 border border-sky-200 rounded-md">
                    IA
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-medium leading-none mt-0.5 whitespace-nowrap hidden sm:block">
                  Automação Comercial
                </p>
              </div>
            </div>

            {/* Divisória Vertical sutil entre a marca e as abas */}
            <div className="h-7 w-px bg-slate-200 shrink-0 hidden lg:block" />

            {/* Menu de Navegação em Abas (Cápsula Integrada) */}
            <nav className="hidden lg:flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shrink-0">
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
                {analysesCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 bg-violet-100 text-violet-700 border border-violet-200 text-[10px] font-bold rounded-full" title={`${analysesCount} demandas avulsas`}>
                    {analysesCount}
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
                onClick={() => setActiveTab('websearch')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'websearch'
                    ? 'bg-white text-sky-700 border border-slate-200 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                title="Scanner de Preços & Produtos 360° com Inteligência Artificial"
              >
                <Search className="w-3.5 h-3.5 text-sky-600" />
                <span>Scanner de Preços</span>
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
                <span>Produtos</span>
              </button>

              <button
                onClick={() => setActiveTab('clients')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'clients'
                    ? 'bg-white text-sky-700 border border-slate-200 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                title="Cadastro e Gestão de Empresas e Compradores"
              >
                <Users className="w-3.5 h-3.5 text-sky-600" />
                <span>Empresas & Compradores</span>
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'history'
                    ? 'bg-white text-sky-700 border border-slate-200 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                title="Histórico completo de propostas salvas e enviadas"
              >
                <History className="w-3.5 h-3.5 text-sky-600" />
                <span>Histórico</span>
              </button>

              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-sky-700 border border-slate-200 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                title="Painel Executivo & Indicadores BI"
              >
                <BarChart3 className="w-3.5 h-3.5 text-sky-600" />
                <span>Painel BI</span>
              </button>
            </nav>

          </div>

          {/* Lado Direito: Ações auxiliares */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('clients')}
              className={`md:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition shadow-2xs whitespace-nowrap ${
                activeTab === 'clients'
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
              }`}
              title="Empresas & Compradores"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Empresas</span>
            </button>

            {draftsCount > 0 && (
              <button
                type="button"
                onClick={onOpenDraftsHistory}
                className="group relative flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-95 text-white rounded-xl shadow-xs hover:shadow-md transition-all duration-200 border border-amber-300/50 text-xs font-bold cursor-pointer shrink-0 animate-in fade-in"
                title={`Existe${draftsCount > 1 ? 'm' : ''} ${draftsCount} orçamento${draftsCount > 1 ? 's' : ''} em rascunho pendente${draftsCount > 1 ? 's' : ''}. Clique para abrir o histórico filtrado.`}
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-200 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                </span>
                <Clock className="w-3.5 h-3.5 text-amber-100 shrink-0" />
                <span className="whitespace-nowrap font-mono tracking-tight text-white drop-shadow-2xs">
                  {draftsCount} {draftsCount === 1 ? 'Rascunho' : 'Rascunhos'}
                </span>
              </button>
            )}

            <button
              onClick={openSettings}
              className="p-2 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition shadow-xs shrink-0"
              title="Configurações da Infodesk"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>

      {/* Barra de Navegação Inferior Fixa Nativa para Celular (Mobile Bottom Nav) */}
      <nav 
        aria-label="Navegação Mobile"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200/90 lg:hidden shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-2 py-1 flex items-center justify-around safe-area-bottom select-none"
      >
        {/* Inbox */}
        <button
          type="button"
          onClick={() => setActiveTab('inbox')}
          className={`flex-1 min-w-[56px] py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 relative cursor-pointer ${
            activeTab === 'inbox'
              ? 'text-sky-600 font-bold bg-sky-50/80'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <div className="relative">
            <Mail className={`w-5 h-5 ${activeTab === 'inbox' ? 'text-sky-600 stroke-[2.5]' : 'stroke-2'}`} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1 py-0.2 min-w-[14px] text-center bg-sky-500 text-white text-[9px] font-extrabold rounded-full shadow-2xs">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight mt-1 leading-none">
            Inbox
          </span>
        </button>

        {/* Cotação */}
        <button
          type="button"
          onClick={() => setActiveTab('builder')}
          className={`flex-1 min-w-[56px] py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 relative cursor-pointer ${
            activeTab === 'builder'
              ? 'text-sky-600 font-bold bg-sky-50/80'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className={`w-5 h-5 ${activeTab === 'builder' ? 'text-sky-600 stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] tracking-tight mt-1 leading-none">
            Cotação
          </span>
        </button>

        {/* Scanner de Preços */}
        <button
          type="button"
          onClick={() => setActiveTab('websearch')}
          className={`flex-1 min-w-[56px] py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 relative cursor-pointer ${
            activeTab === 'websearch'
              ? 'text-sky-600 font-bold bg-sky-50/80'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Search className={`w-5 h-5 ${activeTab === 'websearch' ? 'text-sky-600 stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] tracking-tight mt-1 leading-none">
            Scanner
          </span>
        </button>

        {/* Produtos */}
        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`flex-1 min-w-[56px] py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 relative cursor-pointer ${
            activeTab === 'catalog'
              ? 'text-sky-600 font-bold bg-sky-50/80'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Package className={`w-5 h-5 ${activeTab === 'catalog' ? 'text-sky-600 stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] tracking-tight mt-1 leading-none">
            Produtos
          </span>
        </button>

        {/* Histórico */}
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex-1 min-w-[56px] py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 relative cursor-pointer ${
            activeTab === 'history'
              ? 'text-sky-600 font-bold bg-sky-50/80'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <div className="relative">
            <History className={`w-5 h-5 ${activeTab === 'history' ? 'text-sky-600 stroke-[2.5]' : 'stroke-2'}`} />
            {draftsCount > 0 && (
              <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white"></span>
            )}
          </div>
          <span className="text-[10px] tracking-tight mt-1 leading-none">
            Histórico
          </span>
        </button>
      </nav>
    </header>
  );
};
