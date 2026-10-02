import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  FileText, 
  Package, 
  Users, 
  ShoppingCart, 
  BarChart3, 
  History, 
  Settings, 
  Plus, 
  X, 
  ArrowRight, 
  Command,
  Clock,
  Building2
} from 'lucide-react';
import { Quote, Product, ClientCompany } from '../types';

interface GlobalCommandBarModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotes: Quote[];
  products: Product[];
  clientCompanies: ClientCompany[];
  onSelectQuote: (quote: Quote) => void;
  onSelectProduct?: (product: Product) => void;
  onSelectCompany?: (company: ClientCompany) => void;
  onNewQuote: () => void;
  onNavigateTab: (tab: 'quote' | 'catalog' | 'history' | 'procurement' | 'clients' | 'dashboard') => void;
  onOpenSettings: () => void;
}

type CommandItemType = 'quote' | 'product' | 'company' | 'action';

interface CommandItem {
  id: string;
  type: CommandItemType;
  title: string;
  subtitle?: string;
  badge?: string;
  icon: React.ReactNode;
  action: () => void;
}

export const GlobalCommandBarModal: React.FC<GlobalCommandBarModalProps> = ({
  isOpen,
  onClose,
  quotes,
  products,
  clientCompanies,
  onSelectQuote,
  onSelectProduct,
  onSelectCompany,
  onNewQuote,
  onNavigateTab,
  onOpenSettings
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Foco no input ao abrir
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Ações Rápidas Estáticas
  const quickActions: CommandItem[] = useMemo(() => [
    {
      id: 'action-new-quote',
      type: 'action',
      title: 'Nova Proposta Comercial',
      subtitle: 'Criar um novo orçamento em branco',
      badge: 'Ação Rápida',
      icon: <Plus className="w-4 h-4 text-sky-600" />,
      action: () => {
        onNewQuote();
        onClose();
      }
    },
    {
      id: 'action-procurement',
      type: 'action',
      title: 'Central de Compras & Suprimentos',
      subtitle: 'Acompanhar itens a comprar, fornecedores e conciliação',
      badge: 'Navegação',
      icon: <ShoppingCart className="w-4 h-4 text-amber-600" />,
      action: () => {
        onNavigateTab('procurement');
        onClose();
      }
    },
    {
      id: 'action-catalog',
      type: 'action',
      title: 'Catálogo de Produtos',
      subtitle: 'Explorar e gerenciar estoque de produtos',
      badge: 'Navegação',
      icon: <Package className="w-4 h-4 text-emerald-600" />,
      action: () => {
        onNavigateTab('catalog');
        onClose();
      }
    },
    {
      id: 'action-companies',
      type: 'action',
      title: 'Empresas & Compradores',
      subtitle: 'Cadastro e histórico de clientes e compradores',
      badge: 'Navegação',
      icon: <Users className="w-4 h-4 text-purple-600" />,
      action: () => {
        onNavigateTab('clients');
        onClose();
      }
    },
    {
      id: 'action-history',
      type: 'action',
      title: 'Histórico de Propostas Comerciais',
      subtitle: 'Consultar propostas aprovadas, rascunhos e enviadas',
      badge: 'Navegação',
      icon: <History className="w-4 h-4 text-indigo-600" />,
      action: () => {
        onNavigateTab('history');
        onClose();
      }
    },
    {
      id: 'action-dashboard',
      type: 'action',
      title: 'Painel Executivo & BI',
      subtitle: 'Métricas de faturamento, margens e vendas',
      badge: 'Navegação',
      icon: <BarChart3 className="w-4 h-4 text-blue-600" />,
      action: () => {
        onNavigateTab('dashboard');
        onClose();
      }
    },
    {
      id: 'action-settings',
      type: 'action',
      title: 'Configurações da Infodesk',
      subtitle: 'Ajustar dados da empresa, logos, impostos e integrações',
      badge: 'Sistema',
      icon: <Settings className="w-4 h-4 text-slate-600" />,
      action: () => {
        onOpenSettings();
        onClose();
      }
    }
  ], [onNewQuote, onNavigateTab, onOpenSettings, onClose]);

  // Itens Filtrados
  const filteredItems: CommandItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return quickActions;
    }

    const items: CommandItem[] = [];

    // 1. Propostas Comerciais
    quotes.forEach(quote => {
      const matchCode = (quote.code || '').toLowerCase().includes(q);
      const matchOrder = (quote.clientOrderNumber || '').toLowerCase().includes(q);
      const matchClient = (quote.clientCompany || '').toLowerCase().includes(q);
      const matchContact = (quote.contactPerson || '').toLowerCase().includes(q);
      const matchItems = (quote.items || []).some(it => (it.name || '').toLowerCase().includes(q));

      if (matchCode || matchOrder || matchClient || matchContact || matchItems) {
        const total = (quote.items || []).reduce((acc, it) => acc + (it.totalPrice || 0), 0);
        const ocBadge = quote.clientOrderNumber ? ` • OC: ${quote.clientOrderNumber}` : '';
        items.push({
          id: `quote-${quote.id}`,
          type: 'quote',
          title: `${quote.code || 'Proposta'} • ${quote.clientCompany || 'Cliente sem nome'}${ocBadge}`,
          subtitle: `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • ${quote.contactPerson ? `${quote.contactPerson} • ` : ''}${quote.items?.length || 0} item(ns)`,
          badge: quote.clientOrderNumber ? 'Proposta / OC' : 'Proposta',
          icon: <FileText className="w-4 h-4 text-sky-600" />,
          action: () => {
            onSelectQuote(quote);
            onClose();
          }
        });
      }
    });

    // 2. Produtos do Catálogo
    products.forEach(prod => {
      const matchName = (prod.name || '').toLowerCase().includes(q);
      const matchPartNumber = (prod.partNumber || prod.sku || '').toLowerCase().includes(q);
      const matchCategory = (prod.category || '').toLowerCase().includes(q);

      if (matchName || matchPartNumber || matchCategory) {
        items.push({
          id: `prod-${prod.id}`,
          type: 'product',
          title: prod.name,
          subtitle: `${prod.partNumber ? `SKU: ${prod.partNumber} • ` : ''}${prod.category || 'Geral'} • Custo: R$ ${(prod.costPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          badge: 'Produto',
          icon: <Package className="w-4 h-4 text-emerald-600" />,
          action: () => {
            if (onSelectProduct) {
              onSelectProduct(prod);
            } else {
              onNavigateTab('catalog');
            }
            onClose();
          }
        });
      }
    });

    // 3. Empresas Clientes
    clientCompanies.forEach(comp => {
      const matchName = (comp.name || '').toLowerCase().includes(q);
      const matchContact = (comp.contacts || []).some(c => (c.name || '').toLowerCase().includes(q));

      if (matchName || matchContact) {
        items.push({
          id: `comp-${comp.id}`,
          type: 'company',
          title: comp.name,
          subtitle: `${comp.contacts?.length || 0} comprador(es) • ${comp.defaultDeliveryLocation || 'Brasília - DF'}`,
          badge: 'Empresa',
          icon: <Building2 className="w-4 h-4 text-purple-600" />,
          action: () => {
            if (onSelectCompany) {
              onSelectCompany(comp);
            } else {
              onNavigateTab('clients');
            }
            onClose();
          }
        });
      }
    });

    // 4. Ações Rápidas correspondentes
    quickActions.forEach(act => {
      if (act.title.toLowerCase().includes(q) || act.subtitle?.toLowerCase().includes(q)) {
        items.push(act);
      }
    });

    return items.slice(0, 15);
  }, [query, quotes, products, clientCompanies, quickActions, onSelectQuote, onSelectProduct, onSelectCompany, onNavigateTab, onClose]);

  // Ajusta índice selecionado ao mudar filtros
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems]);

  // Teclado: Navegação por setas, enter e esc
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filteredItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-20 px-3 sm:px-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scaleIn max-h-[82vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Campo de Busca Superior */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-slate-100 bg-slate-50/50">
          <Search className="w-5 h-5 text-slate-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm sm:text-base text-slate-900 placeholder-slate-400 focus:outline-none font-medium"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1 shrink-0 text-slate-400">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-white border border-slate-200 rounded shadow-2xs">ESC</kbd>
            </div>
          )}
        </div>

        {/* Lista de Resultados com rolagem suave */}
        <div 
          ref={listRef} 
          className="p-2 overflow-y-auto flex-1 divide-y divide-slate-50"
        >
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-slate-400 space-y-1">
              <p className="text-sm font-medium text-slate-600">Nenhum resultado encontrado para "{query}"</p>
              <p className="text-xs">Tente buscar por número de proposta (INF-), nome do produto, SKU ou cliente.</p>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-3 rounded-xl transition cursor-pointer ${
                    isSelected 
                      ? 'bg-sky-50/80 border border-sky-200/80 text-sky-950' 
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`p-2 rounded-xl shrink-0 ${
                      item.type === 'quote' ? 'bg-sky-100 text-sky-700' :
                      item.type === 'product' ? 'bg-emerald-100 text-emerald-700' :
                      item.type === 'company' ? 'bg-purple-100 text-purple-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {item.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {item.title}
                        </span>
                        {item.badge && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${
                            item.type === 'quote' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                            item.type === 'product' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            item.type === 'company' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                            'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {isSelected && (
                      <span className="text-xs font-semibold text-sky-700 flex items-center gap-1 animate-in fade-in">
                        <span className="hidden sm:inline">Acessar</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé com Dicas de Atalho */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 font-mono bg-white border border-slate-200 rounded text-slate-500 shadow-2xs">↑</kbd>
              <kbd className="px-1.5 py-0.5 font-mono bg-white border border-slate-200 rounded text-slate-500 shadow-2xs">↓</kbd>
              <span>Navegar</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 font-mono bg-white border border-slate-200 rounded text-slate-500 shadow-2xs">↵</kbd>
              <span>Abrir</span>
            </span>
          </div>

          <span className="hidden sm:inline text-slate-400 font-medium">
            InfoDesk SmartQuote Command Bar
          </span>
        </div>
      </div>
    </div>
  );
};
