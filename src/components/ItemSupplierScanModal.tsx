import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Search, 
  ExternalLink, 
  Check, 
  Building2, 
  Tag, 
  DollarSign, 
  TrendingDown, 
  Store,
  Layers,
  ShoppingBag
} from 'lucide-react';
import { QuoteItem } from '../types';
import { getProducts } from '../utils/storage';
import { findRecentPriceByPartNumber, CachedPriceOffer } from '../services/priceCacheService';
import { normalizeSearchText } from '../utils/aiEmailParser';

interface ItemSupplierScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: QuoteItem | null;
  itemIndex: number;
  onApplyPrice: (index: number, newCost: number, supplier?: string, sourceUrl?: string) => void;
  onNavigateToWebSearch?: (query: string) => void;
}

interface SupplierOption {
  id: string;
  supplier: string;
  costPrice: number;
  sourceUrl?: string;
  sourceType: 'catalog' | 'cache' | 'marketplace' | 'current';
  badgeLabel?: string;
}

export const ItemSupplierScanModal: React.FC<ItemSupplierScanModalProps> = ({
  isOpen,
  onClose,
  item,
  itemIndex,
  onApplyPrice,
  onNavigateToWebSearch
}) => {
  const [cachedOffer, setCachedOffer] = useState<CachedPriceOffer | null>(null);
  const [options, setOptions] = useState<SupplierOption[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !item) {
      setOptions([]);
      setCachedOffer(null);
      return;
    }

    setIsLoading(true);
    const discoveredOptions: SupplierOption[] = [];

    // 1. Custo Atual do Item
    discoveredOptions.push({
      id: 'current',
      supplier: item.supplier || 'Custo Atual da Cotação',
      costPrice: item.costPrice || 0,
      sourceUrl: item.sourceUrl,
      sourceType: 'current',
      badgeLabel: 'Atual'
    });

    // 2. Busca no Catálogo Local de Produtos
    try {
      const catalog = getProducts();
      const matchPn = item.partNumber 
        ? catalog.find(p => p.partNumber && p.partNumber.trim().toLowerCase() === item.partNumber?.trim().toLowerCase()) 
        : null;
      const matchName = !matchPn 
        ? catalog.find(p => normalizeSearchText(p.name) === normalizeSearchText(item.name)) 
        : null;
      const matched = matchPn || matchName;

      if (matched && matched.costPrice > 0) {
        discoveredOptions.push({
          id: 'catalog',
          supplier: matched.supplier || 'Catálogo InfoDesk',
          costPrice: matched.costPrice,
          sourceUrl: matched.sourceUrl,
          sourceType: 'catalog',
          badgeLabel: 'Catálogo'
        });
      }
    } catch (e) {
      console.warn('Erro ao consultar catálogo:', e);
    }

    // 3. Ofertas Alternativas já registradas no Item (caso tenha vindo de matriz)
    if (item.alternativeOffers && item.alternativeOffers.length > 0) {
      item.alternativeOffers.forEach((alt, idx) => {
        if (alt.costPrice > 0 && !discoveredOptions.some(o => o.supplier.toLowerCase() === alt.supplier.toLowerCase())) {
          discoveredOptions.push({
            id: `alt-${idx}`,
            supplier: alt.supplier,
            costPrice: alt.costPrice,
            sourceUrl: alt.sourceUrl,
            sourceType: 'marketplace',
            badgeLabel: 'Histórico'
          });
        }
      });
    }

    // 4. Busca no Cache Recente de Part Number
    if (item.partNumber) {
      findRecentPriceByPartNumber(item.partNumber).then(cached => {
        if (cached && cached.costPrice > 0) {
          setCachedOffer(cached);
          if (!discoveredOptions.some(o => o.costPrice === cached.costPrice)) {
            discoveredOptions.push({
              id: 'cache-pn',
              supplier: cached.supplier || 'Cache Cotação Anterior',
              costPrice: cached.costPrice,
              sourceUrl: cached.sourceUrl,
              sourceType: 'cache',
              badgeLabel: `${cached.daysAgo === 0 ? 'Hoje' : `${cached.daysAgo}d atrás`}`
            });
          }
        }
        // Ordena por menor custo
        const sorted = [...discoveredOptions].sort((a, b) => {
          if (a.costPrice <= 0) return 1;
          if (b.costPrice <= 0) return -1;
          return a.costPrice - b.costPrice;
        });
        setOptions(sorted);
        if (sorted.length > 0) {
          const cheapest = sorted.find(s => s.costPrice > 0) || sorted[0];
          setSelectedOptionId(cheapest.id);
        }
        setIsLoading(false);
      }).catch(() => {
        setOptions(discoveredOptions);
        setIsLoading(false);
      });
    } else {
      const sorted = [...discoveredOptions].sort((a, b) => {
        if (a.costPrice <= 0) return 1;
        if (b.costPrice <= 0) return -1;
        return a.costPrice - b.costPrice;
      });
      setOptions(sorted);
      if (sorted.length > 0) {
        const cheapest = sorted.find(s => s.costPrice > 0) || sorted[0];
        setSelectedOptionId(cheapest.id);
      }
      setIsLoading(false);
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const selectedOption = options.find(o => o.id === selectedOptionId) || options[0];
  const searchQuery = item.partNumber ? `${item.partNumber} ${item.name}` : item.name;

  const handleApply = () => {
    if (!selectedOption) return;
    onApplyPrice(
      itemIndex,
      selectedOption.costPrice,
      selectedOption.supplier !== 'Custo Atual da Cotação' ? selectedOption.supplier : undefined,
      selectedOption.sourceUrl
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Scanner de Fornecedores & Preço</h3>
                {item.partNumber && (
                  <span className="sq-badge-code">
                    PN: {item.partNumber}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1" title={item.name}>
                {item.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Card Resumo do Produto */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Custo Atual na Cotação</span>
              <span className="text-base font-bold font-mono text-slate-900">
                R$ {(item.costPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Preço de Venda Atual</span>
              <span className="text-base font-bold font-mono text-sky-700">
                R$ {(item.unitPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Opções de Fornecedores */}
          <div className="space-y-2.5">
            <label className="sq-label mb-1">
              Fornecedores e Fontes de Preço Identificadas:
            </label>

            {isLoading ? (
              <div className="py-8 text-center text-xs text-slate-500">
                <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Consultando fornecedores e histórico de compras...
              </div>
            ) : options.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
                Nenhum fornecedor registrado com preço para este item ainda.
              </div>
            ) : (
              options.map(opt => {
                const isSelected = selectedOptionId === opt.id;
                const isCheaper = opt.costPrice > 0 && item.costPrice > 0 && opt.costPrice < item.costPrice;
                const savings = isCheaper ? item.costPrice - opt.costPrice : 0;

                return (
                  <div
                    key={opt.id}
                    onClick={() => setSelectedOptionId(opt.id)}
                    className={`p-3.5 rounded-xl border-2 transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-sky-500 bg-sky-50/50 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        isSelected ? 'border-sky-600 bg-sky-600' : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{opt.supplier}</span>
                          {opt.badgeLabel && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {opt.badgeLabel}
                            </span>
                          )}
                          {isCheaper && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 flex items-center gap-0.5">
                              <TrendingDown className="w-3 h-3 text-emerald-600" />
                              Economia de R$ {savings.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>

                        {opt.sourceUrl && (
                          <a
                            href={opt.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[11px] text-sky-600 hover:underline flex items-center gap-1 mt-0.5"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Abrir link do fornecedor</span>
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-extrabold font-mono text-slate-900 block">
                        R$ {opt.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Links Rápidos de Pesquisa Direta nos Marketplaces */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <span className="text-[11px] font-semibold text-slate-600 block">
              Pesquisar em tempo real nos marketplaces externos:
            </span>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=shop`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 transition"
              >
                <Store className="w-3.5 h-3.5 text-slate-500" />
                <span>Google Shopping</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>

              <a
                href={`https://lista.mercadolivre.com.br/${encodeURIComponent(searchQuery)}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-xs font-bold text-amber-800 flex items-center gap-1.5 transition"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-amber-600" />
                <span>Mercado Livre</span>
                <ExternalLink className="w-3 h-3 text-amber-500" />
              </a>

              <a
                href={`https://www.amazon.com.br/s?k=${encodeURIComponent(searchQuery)}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl text-xs font-bold text-sky-800 flex items-center gap-1.5 transition"
              >
                <Store className="w-3.5 h-3.5 text-sky-600" />
                <span>Amazon Brasil</span>
                <ExternalLink className="w-3 h-3 text-sky-500" />
              </a>

              {onNavigateToWebSearch && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToWebSearch(searchQuery);
                  }}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-800 flex items-center gap-1.5 transition"
                >
                  <Search className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Abrir no Scanner da Infodesk</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Rodapé com Botões */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="sq-btn-neutral"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={!selectedOption || selectedOption.costPrice <= 0}
            className="sq-btn-primary flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>
              Aplicar Custo R$ {selectedOption ? selectedOption.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
