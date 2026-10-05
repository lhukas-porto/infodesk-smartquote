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

  const isMoreTabActive = ['dashboard', 'websearch', 'catalog', 'clients'].includes(activeTab);

  return (
    <>
      <header className="no-print fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.06)] transition-all duration-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-16 py-2 gap-2 sm:gap-4 lg:gap-6">
          
          {/* Lado Esquerdo: Marca Infodesk */}
          <div className="flex items-center shrink-0">
            <div 
              className="flex items-center gap-2 sm:gap-2.5 cursor-pointer select-none shrink-0 group py-1" 
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
          </div>

          {/* Centro: Menu de Navegação em Abas (Cápsula Integrada Centralizada) - Desktop */}
          <div className="hidden lg:flex flex-1 justify-center items-center px-2">
            <nav className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shrink-0">
              <button
                onClick={() => setActiveTab('inbox')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
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
                onClick={() => setActiveTab('websearch')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'websearch'
                    ? 'bg-white text-sky-700 border border-slate-200 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                title="Scanner de Produtos com IA"
              >
                <Search className="w-3.5 h-3.5 text-sky-600" />
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
                    ? 'bg-white text-sky-700 border border-slate-200 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Cotação</span>
              </button>

              <button
                onClick={() => setActiveTab('catalog')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
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
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'clients'
                    ? 'bg-white text-sky-700 border border-slate-200 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                title="Cadastro e Gestão de Empresas e Compradores"
              >
                <Users className="w-3.5 h-3.5 text-sky-600" />
                <span>Empresas</span>
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
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
                onClick={() => setActiveTab('purchases')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'purchases'
                    ? 'bg-white text-emerald-700 border border-slate-200 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                title="Central de Compras & Gestão de Lucro"
              >
                <ShoppingCart className="w-3.5 h-3.5 text-emerald-600" />
                <span>Compras</span>
                {pendingPurchasesCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-white text-[10px] font-bold rounded-full animate-pulse">
                    {pendingPurchasesCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-sky-700 border border-slate-200 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                title="Dashboard Executivo & Indicadores"
              >
                <BarChart3 className="w-3.5 h-3.5 text-sky-600" />
                <span>Dashboard</span>
              </button>
            </nav>
          </div>

          {/* Lado Direito: Ações auxiliares */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0">
            {draftsCount > 0 && (
              <button
                type="button"
                onClick={onOpenDraftsHistory}
                className="group relative flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-95 text-white rounded-xl shadow-xs hover:shadow-md transition-all duration-200 border border-amber-300/50 text-xs font-bold cursor-pointer shrink-0 animate-in fade-in"
                title={`Existe${draftsCount > 1 ? 'm' : ''} ${draftsCount} orçamento${draftsCount > 1 ? 's' : ''} em rascunho pendente${draftsCount > 1 ? 's' : ''}. Clique para abrir o histórico filtrado.`}
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-200 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                </span>
                <Clock className="w-3.5 h-3.5 text-amber-100 shrink-0" />
                <span className="font-mono tracking-tight text-white drop-shadow-2xs">
                  {draftsCount} <span className="hidden sm:inline">{draftsCount === 1 ? 'Rascunho' : 'Rascunhos'}</span>
                </span>
              </button>
            )}

            <button
              onClick={openSettings}
              className="p-2 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition shadow-xs shrink-0 cursor-pointer"
              title="Configurações da Infodesk"
            >
              <Settings className="w-4 h-4" />
            </button>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl transition shadow-xs text-xs font-semibold shrink-0 cursor-pointer"
                title={`Sessão ativa: ${authenticatedUserEmail || 'Lucas'}. Clique para desconectar com segurança.`}
              >
                <LogOut className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            )}
          </div>

        </div>
      </div>
    </header>

    {/* Barra de Navegação Inferior Fixa Nativa para Celular (Mobile Bottom Nav) */}
    <nav 
      aria-label="Navegação Mobile"
      className="no-print fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200/90 lg:hidden shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-2 py-1 flex items-center justify-around safe-area-bottom select-none"
    >
      {/* Inbox */}
      <button
        type="button"
        onClick={() => handleMobileNavSelect('inbox')}
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
        onClick={() => handleMobileNavSelect('builder')}
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

      {/* Compras */}
      <button
        type="button"
        onClick={() => handleMobileNavSelect('purchases')}
        className={`flex-1 min-w-[56px] py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 relative cursor-pointer ${
          activeTab === 'purchases'
            ? 'text-emerald-600 font-bold bg-emerald-50/80'
            : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <div className="relative">
          <ShoppingCart className={`w-5 h-5 ${activeTab === 'purchases' ? 'text-emerald-600 stroke-[2.5]' : 'stroke-2'}`} />
          {pendingPurchasesCount > 0 && (
            <span className="absolute -top-1.5 -right-2 px-1 py-0.2 min-w-[14px] text-center bg-amber-500 text-white text-[9px] font-extrabold rounded-full shadow-2xs animate-pulse">
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

      {/* Mais / Menu Drawer */}
      <button
        type="button"
        onClick={() => setIsMobileMenuOpen(true)}
        className={`flex-1 min-w-[56px] py-1.5 px-1 flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 relative cursor-pointer ${
          isMoreTabActive || isMobileMenuOpen
            ? 'text-sky-600 font-bold bg-sky-50/80'
            : 'text-slate-500 hover:text-slate-800'
        }`}
        title="Mais opções e ferramentas"
      >
        <div className="relative">
          <Menu className="w-5 h-5 stroke-2" />
          {analysesCount > 0 && (
            <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-violet-600 ring-2 ring-white"></span>
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
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-fade-in-backdrop cursor-pointer" 
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
              <span id="mobile-menu-title" className="font-bold text-sm text-slate-900">Ferramentas & Módulos</span>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 rounded-full">
                SmartQuote
              </span>
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
                  <p className="text-[11px] text-slate-500">Métricas comerciais, conversão e faturamento</p>
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
                  <p className="text-[11px] text-slate-500">Localizar fornecedores e referências com IA</p>
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
                  <p className="text-[11px] text-slate-500">Consulta geral de estoque, NCM e custos base</p>
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
                  <p className="text-[11px] text-slate-500">Gestão de CNPJs, compradores e condições</p>
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
                    ? 'bg-amber-50 text-amber-900 border border-amber-200'
                    : 'bg-amber-50/70 hover:bg-amber-100/70 text-amber-900 border border-amber-200/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-950">Rascunhos em Elaboração</p>
                    <p className="text-[11px] text-amber-700">{draftsCount} orçamento{draftsCount > 1 ? 's' : ''} aguardando envio</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-600 shrink-0" />
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
                    <p className="text-[11px] text-slate-500">{analysesCount} demanda{analysesCount > 1 ? 's' : ''} em processamento</p>
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
                    <p className="text-[11px] text-sky-100">Iniciar proposta limpa com novo código</p>
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

