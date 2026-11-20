import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  FileText, 
  Mail, 
  Package, 
  Search,
  Settings, 
  Users,
  History,
  BarChart3,
  Clock,
  ShoppingCart,
  LogOut,
  Menu,
  X,
  ChevronRight,
  PlusCircle,
  Sparkles
} from 'lucide-react';
import { CompanySettings } from '../types';
import { SmartQuoteLogo } from './SmartQuoteLogo';

interface NavbarProps {
  activeTab: 'inbox' | 'builder' | 'preview' | 'catalog' | 'history' | 'websearch' | 'analyses' | 'clients' | 'dashboard' | 'purchases';
  setActiveTab: (tab: 'inbox' | 'builder' | 'preview' | 'catalog' | 'history' | 'websearch' | 'analyses' | 'clients' | 'dashboard' | 'purchases') => void;
  unreadCount: number;
  openSettings: () => void;
  openWebSearch?: () => void;
  openClientsModal?: () => void;
  settings: CompanySettings;
  onNewQuote?: () => void;
  analysesCount?: number;
  isScannerOpen?: boolean;
  draftsCount?: number;
  pendingPurchasesCount?: number;
  onOpenDraftsHistory?: () => void;
  authenticatedUserEmail?: string | null;
  onLogout?: () => void;
  onNavigateToBuilder?: () => void;
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
  pendingPurchasesCount = 0,
  onOpenDraftsHistory,
  authenticatedUserEmail,
  onLogout,
  onNavigateToBuilder
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Travar o scroll da página de fundo enquanto o menu drawer estiver aberto
  useEffect(() => {
    if (isMobileMenuOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isMobileMenuOpen]);

  const handleMobileNavSelect = (tab: NavbarProps['activeTab']) => {
    setIsMobileMenuOpen(false);
    if (tab === 'builder') {
      if (onNavigateToBuilder) {
        onNavigateToBuilder();
      } else {
        setActiveTab('builder');
      }
    } else {
      setActiveTab(tab);
    }
  };

  // Ocultado visualmente a pedido do Lucas temporariamente (todo o código do Inbox permanece 100% preservado)
  const SHOW_INBOX_TAB = false;

  const isMoreTabActive = ['dashboard', 'websearch', 'catalog', 'clients'].includes(activeTab);

  return (
    <>
      <header className="no-print fixed top-0 left-0 right-0 z-40 bg-[#0f172a] border-b border-[#1e293b] shadow-[0_4px_25px_rgba(0,0,0,0.35)] transition-all duration-200">
        <div className="w-full max-w-7xl xl:max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-16 py-2 gap-2 sm:gap-4">
          
          {/* Lado Esquerdo: Marca SmartQuote (clique direciona ao Scanner IA) */}
          <div className="flex items-center shrink-0 min-w-0 lg:w-56 xl:w-64">
            <div 
              className="flex items-center cursor-pointer select-none shrink-0 group py-1 active:scale-98 transition-transform" 
              onClick={() => setActiveTab('websearch')}
              title="Scanner IA de Produtos"
            >
              <SmartQuoteLogo size="md" showBadge={false} showSubtitle={true} inverted={true} className="group-hover:opacity-95 transition-opacity" />
            </div>
          </div>

          {/* Centro: Menu de Navegação em Abas (Cápsula Integrada Centralizada) - Desktop */}
          <div className="hidden lg:flex flex-1 justify-center items-center px-1 min-w-0">
            <nav className="flex items-center gap-0.5 xl:gap-1 bg-[#1e293b] p-1.5 rounded-xl border border-[#334155] shrink-0 shadow-inner">
              {SHOW_INBOX_TAB && (
                <button
                  onClick={() => setActiveTab('inbox')}
                  className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    activeTab === 'inbox'
                      ? 'bg-slate-700/80 text-amber-400 border border-amber-500/50 shadow-xs font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Inbox</span>
                  {unreadCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-slate-900 text-[10px] font-bold rounded-full">
                      {unreadCount}
                    </span>
                  )}
                  {analysesCount > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold rounded-full" title={`${analysesCount} demandas avulsas`}>
                      {analysesCount}
                    </span>
                  )}
                </button>
              )}

              <button
                onClick={() => setActiveTab('websearch')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'websearch'
                    ? 'bg-slate-700/80 text-amber-400 border border-amber-500/50 shadow-xs font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
                title="Scanner de Produtos com IA"
              >
                <Search className={`w-3.5 h-3.5 ${activeTab === 'websearch' ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>Scanner IA</span>
              </button>

              <button
                onClick={() => {
                  if (onNavigateToBuilder) {
                    onNavigateToBuilder();
                  } else {
                    setActiveTab('builder');
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'builder'
                    ? 'bg-slate-700/80 text-amber-400 border border-amber-500/50 shadow-xs font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <FileText className={`w-3.5 h-3.5 ${activeTab === 'builder' ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>Cotação</span>
              </button>

              <button
                onClick={() => setActiveTab('catalog')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'catalog'
                    ? 'bg-slate-700/80 text-amber-400 border border-amber-500/50 shadow-xs font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Package className={`w-3.5 h-3.5 ${activeTab === 'catalog' ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>Produtos</span>
              </button>

              <button
                onClick={() => setActiveTab('clients')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'clients'
                    ? 'bg-slate-700/80 text-amber-400 border border-amber-500/50 shadow-xs font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
                title="Cadastro e Gestão de Empresas e Compradores"
              >
                <Users className={`w-3.5 h-3.5 ${activeTab === 'clients' ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>Empresas</span>
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'history'
                    ? 'bg-slate-700/80 text-amber-400 border border-amber-500/50 shadow-xs font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
                title="Histórico completo de propostas salvas e enviadas"
              >
                <History className={`w-3.5 h-3.5 ${activeTab === 'history' ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>Histórico</span>
              </button>

              <button
                onClick={() => setActiveTab('purchases')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'purchases'
                    ? 'bg-slate-700/80 text-amber-400 border border-amber-500/50 shadow-xs font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
                title="Central de Compras & Gestão de Lucro"
              >
                <ShoppingCart className={`w-3.5 h-3.5 ${activeTab === 'purchases' ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>Compras</span>
                {pendingPurchasesCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-slate-900 text-[10px] font-bold rounded-full animate-pulse">
                    {pendingPurchasesCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'dashboard'
                    ? 'bg-slate-700/80 text-amber-400 border border-amber-500/50 shadow-xs font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
                title="Dashboard Executivo & Indicadores"
              >
                <BarChart3 className={`w-3.5 h-3.5 ${activeTab === 'dashboard' ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>Dashboard</span>
              </button>
            </nav>
          </div>

          {/* Lado Direito: Ações auxiliares */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0 lg:w-56 xl:w-64">
            {draftsCount > 0 && (
              <button
                type="button"
                onClick={onOpenDraftsHistory}
                className="group relative flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-700 hover:to-rose-800 active:scale-95 text-white rounded-xl shadow-xs hover:shadow-md transition-all duration-200 border border-red-400/50 text-xs font-bold cursor-pointer shrink-0 animate-in fade-in"
                title={`Existe${draftsCount > 1 ? 'm' : ''} ${draftsCount} orçamento${draftsCount > 1 ? 's' : ''} em rascunho pendente${draftsCount > 1 ? 's' : ''}. Clique para abrir o histórico filtrado.`}
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-200 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                </span>
                <Clock className="w-3.5 h-3.5 text-red-100 shrink-0" />
                <span className="font-mono tracking-tight text-white drop-shadow-2xs">
                  {draftsCount} <span className="hidden sm:inline">{draftsCount === 1 ? 'Rascunho' : 'Rascunhos'}</span>
                </span>
              </button>
            )}

            <button
              onClick={openSettings}
              className="p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition shadow-xs shrink-0 cursor-pointer"
              title="Configurações da Infodesk"
            >
              <Settings className="w-4 h-4" />
            </button>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-slate-300 hover:text-rose-400 hover:bg-rose-950/40 border border-slate-700 hover:border-rose-800 rounded-xl transition shadow-xs text-xs font-semibold shrink-0 cursor-pointer"
                title={`Sessão ativa: ${authenticatedUserEmail || 'Lucas'}. Clique para desconectar com segurança.`}
              >
                <LogOut className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            )}
          </div>

        </div>
      </div>
    </header>

    {/* Barra de Navegação Inferior Fixa Nativa para Celular (Mobile Bottom Nav - Commercial Titanium) */}
    <nav 
      aria-label="Navegação Mobile"
      className="no-print fixed bottom-0 left-0 right-0 z-40 bg-[#0f172a] border-t border-[#1e293b] lg:hidden shadow-[0_-4px_16px_rgba(0,0,0,0.35)] px-2 py-1 flex items-center justify-around safe-area-bottom select-none"
    >
      {/* Inbox (Ocultado temporariamente a pedido do Lucas) */}
      {SHOW_INBOX_TAB && (
        <button
          type="button"
          onClick={() => handleMobileNavSelect('inbox')}
          className={`flex-1 min-w-[56px] py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 relative cursor-pointer ${
            activeTab === 'inbox'
              ? 'text-amber-400 font-bold bg-slate-800/80'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <Mail className={`w-5 h-5 ${activeTab === 'inbox' ? 'text-amber-400 stroke-[2.5]' : 'stroke-2'}`} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1 py-0.2 min-w-[14px] text-center bg-amber-500 text-slate-900 text-[10px] font-extrabold rounded-full shadow-2xs">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight mt-1 leading-none">
            Inbox
          </span>
        </button>
      )}

      {/* Cotação */}
      <button
        type="button"
        onClick={() => handleMobileNavSelect('builder')}
        className={`flex-1 min-w-[56px] py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 relative cursor-pointer ${
          activeTab === 'builder'
            ? 'text-amber-400 font-bold bg-slate-800/80'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <FileText className={`w-5 h-5 ${activeTab === 'builder' ? 'text-amber-400 stroke-[2.5]' : 'stroke-2'}`} />
        <span className="text-[10px] tracking-tight mt-1 leading-none">
          Cotação
        </span>
      </button>

      {/* Compras */}
      <button
        type="button"
        onClick={() => handleMobileNavSelect('purchases')}
        className={`flex-1 min-w-[56px] py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 relative cursor-pointer ${
          activeTab === 'purchases'
            ? 'text-amber-400 font-bold bg-slate-800/80'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <div className="relative">
          <ShoppingCart className={`w-5 h-5 ${activeTab === 'purchases' ? 'text-amber-400 stroke-[2.5]' : 'stroke-2'}`} />
          {pendingPurchasesCount > 0 && (
            <span className="absolute -top-1.5 -right-2 px-1 py-0.2 min-w-[14px] text-center bg-amber-500 text-slate-900 text-[10px] font-extrabold rounded-full shadow-2xs animate-pulse">
              {pendingPurchasesCount > 99 ? '99+' : pendingPurchasesCount}
            </span>
          )}
        </div>
        <span className="text-[10px] tracking-tight mt-1 leading-none">
          Compras
        </span>
      </button>

      {/* Histórico */}
      <button
        type="button"
        onClick={() => handleMobileNavSelect('history')}
        className={`flex-1 min-w-[56px] py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 relative cursor-pointer ${
          activeTab === 'history'
            ? 'text-amber-400 font-bold bg-slate-800/80'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <div className="relative">
          <History className={`w-5 h-5 ${activeTab === 'history' ? 'text-amber-400 stroke-[2.5]' : 'stroke-2'}`} />
          {draftsCount > 0 && (
            <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-slate-900"></span>
          )}
        </div>
        <span className="text-[10px] tracking-tight mt-1 leading-none">
          Histórico
        </span>
      </button>

      {/* Mais / Menu Drawer */}
      <button
        type="button"
        onClick={() => setIsMobileMenuOpen(true)}
        className={`flex-1 min-w-[56px] py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 relative cursor-pointer ${
          isMoreTabActive || isMobileMenuOpen
            ? 'text-amber-400 font-bold bg-slate-800/80'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="Mais opções e ferramentas"
      >
        <div className="relative">
          <Menu className="w-5 h-5 stroke-2" />
          {analysesCount > 0 && (
            <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-slate-900"></span>
          )}
        </div>
        <span className="text-[10px] tracking-tight mt-1 leading-none">
          Mais
        </span>
      </button>
    </nav>

    {/* Drawer / Bottom Sheet Mobile Menu via Portal - Fora de qualquer container de header */}
    {typeof document !== 'undefined' && isMobileMenuOpen && createPortal(
      <div 
        className="lg:hidden fixed inset-0 z-[9999] flex flex-col justify-end"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-menu-title"
      >
        {/* Backdrop escurecido */}
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity animate-fade-in-backdrop cursor-pointer" 
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />

        {/* Painel Inferior que sobe suavemente a partir do rodapé do celular */}
        <div className="relative w-full bg-white rounded-t-3xl border-t border-slate-200 shadow-2xl p-4 pb-8 max-h-[85vh] flex flex-col z-10 animate-slide-up-sheet">
          {/* Traço visual de puxador */}
          <div className="flex justify-center mb-2.5 shrink-0">
            <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
          </div>

          {/* Cabeçalho do Drawer */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <span id="mobile-menu-title" className="font-bold text-sm text-slate-900">Módulos</span>
              <SmartQuoteLogo size="xs" showBadge={false} />
            </div>
            <button 
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              title="Fechar menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Grid de opções do menu com scroll autônomo */}
          <div className="space-y-1.5 overflow-y-auto overscroll-contain flex-1 pr-0.5 custom-scrollbar">
            <button
              type="button"
              onClick={() => handleMobileNavSelect('dashboard')}
              className={`w-full flex items-center justify-between p-3 rounded-2xl transition text-left cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-sky-50 text-sky-800 border border-sky-200'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Dashboard & Indicadores</p>
                  <p className="text-xs text-slate-500">Métricas comerciais, conversão e faturamento</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => handleMobileNavSelect('websearch')}
              className={`w-full flex items-center justify-between p-3 rounded-2xl transition text-left cursor-pointer ${
                activeTab === 'websearch'
                  ? 'bg-sky-50 text-sky-800 border border-sky-200'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Scanner IA de Produtos</p>
                  <p className="text-xs text-slate-500">Localizar fornecedores e referências com IA</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => handleMobileNavSelect('catalog')}
              className={`w-full flex items-center justify-between p-3 rounded-2xl transition text-left cursor-pointer ${
                activeTab === 'catalog'
                  ? 'bg-sky-50 text-sky-800 border border-sky-200'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Catálogo de Produtos</p>
                  <p className="text-xs text-slate-500">Consulta geral de estoque, NCM e custos base</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => handleMobileNavSelect('clients')}
              className={`w-full flex items-center justify-between p-3 rounded-2xl transition text-left cursor-pointer ${
                activeTab === 'clients'
                  ? 'bg-sky-50 text-sky-800 border border-sky-200'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Empresas & Clientes</p>
                  <p className="text-xs text-slate-500">Gestão de CNPJs, compradores e condições</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            {draftsCount > 0 && onOpenDraftsHistory && (
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenDraftsHistory();
                }}
                className={`w-full flex items-center justify-between p-3 rounded-2xl transition text-left cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-red-50 text-red-900 border border-red-200'
                    : 'bg-red-50/70 hover:bg-red-100/70 text-red-900 border border-red-200/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-red-950">Rascunhos Pendentes</p>
                    <p className="text-xs text-red-700">{draftsCount} orçamento{draftsCount > 1 ? 's' : ''} aguardando envio</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-red-600 shrink-0" />
              </button>
            )}

            {analysesCount > 0 && (
              <button
                type="button"
                onClick={() => handleMobileNavSelect('analyses')}
                className={`w-full flex items-center justify-between p-3 rounded-2xl transition text-left cursor-pointer ${
                  activeTab === 'analyses'
                    ? 'bg-violet-50 text-violet-800 border border-violet-200'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">Demandas Avulsas & OCR</p>
                    <p className="text-xs text-slate-500">{analysesCount} demanda{analysesCount > 1 ? 's' : ''} em processamento</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            )}

            {onNewQuote && (
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onNewQuote();
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white transition text-left cursor-pointer shadow-xs mt-2"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center shrink-0">
                    <PlusCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Criar Nova Cotação do Zero</p>
                    <p className="text-xs text-sky-100">Iniciar proposta limpa com novo código</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/70 shrink-0" />
              </button>
            )}
          </div>

          {/* Rodapé do Menu com Configurações e Logout */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                openSettings();
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 cursor-pointer"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              <span>Configurações</span>
            </button>

            {onLogout && (
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onLogout();
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-200 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair</span>
              </button>
            )}
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* Espaçador para compensar a navbar fixa no topo e evitar sobreposição com o conteúdo */}
    <div className="h-16 shrink-0 no-print" aria-hidden="true" />
  </>
  );
};

