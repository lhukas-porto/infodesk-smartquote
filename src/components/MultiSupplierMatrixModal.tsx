import React, { useState } from 'react';
import { 
  X, 
  Layers, 
  Sparkles, 
  CheckCircle2, 
  TrendingDown, 
  ExternalLink,
  Store,
  ArrowRight,
  Plus
} from 'lucide-react';
import { QuoteItem, SupplierOffer } from '../types';

interface MultiSupplierMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: QuoteItem[];
  onApplyOptimizedBasket: (updatedItems: QuoteItem[]) => void;
}

export const MultiSupplierMatrixModal: React.FC<MultiSupplierMatrixModalProps> = ({
  isOpen,
  onClose,
  items,
  onApplyOptimizedBasket
}) => {
  // Estado local para manipulação das ofertas dos itens
  const [localItems, setLocalItems] = useState<QuoteItem[]>(() => {
    return items.map(item => {
      // Se não tiver ofertas alternativas, popula com a atual
      const currentOffer: SupplierOffer = {
        id: `off-curr-${item.id}`,
        supplier: item.supplier || 'Fornecedor Atual',
        costPrice: item.costPrice || 0,
        sourceUrl: item.sourceUrl,
        isSelected: true
      };

      const existingAlts = item.alternativeOffers || [];
      const hasCurrent = existingAlts.some(a => a.supplier.toLowerCase() === (item.supplier || '').toLowerCase());

      return {
        ...item,
        alternativeOffers: hasCurrent ? existingAlts : [currentOffer, ...existingAlts]
      };
    });
  });

  // Cálculo de economia potencial
  const currentTotalCost = localItems.reduce((acc, item) => acc + (item.costPrice || 0) * (item.quantity || 1), 0);

  // Calcula a cesta mais barata
  const calculateOptimizedItems = (): { optimized: QuoteItem[]; minCost: number } => {
    let minCost = 0;
    const optimized = localItems.map(item => {
      const allOffers = item.alternativeOffers || [];
      if (allOffers.length === 0) {
        minCost += (item.costPrice || 0) * (item.quantity || 1);
        return item;
      }

      // Encontrar a oferta com menor custo > 0
      const validOffers = allOffers.filter(o => o.costPrice > 0);
      if (validOffers.length === 0) {
        minCost += (item.costPrice || 0) * (item.quantity || 1);
        return item;
      }

      const cheapest = validOffers.reduce((prev, curr) => (curr.costPrice < prev.costPrice ? curr : prev), validOffers[0]);
      minCost += cheapest.costPrice * (item.quantity || 1);

      return {
        ...item,
        costPrice: cheapest.costPrice,
        supplier: cheapest.supplier,
        sourceUrl: cheapest.sourceUrl || item.sourceUrl,
        alternativeOffers: allOffers.map(o => ({
          ...o,
          isSelected: o.id === cheapest.id
        }))
      };
    });

    return { optimized, minCost };
  };

  const { optimized, minCost: optimizedTotalCost } = calculateOptimizedItems();
  const potentialSavings = Math.max(currentTotalCost - optimizedTotalCost, 0);
  const savingsPercent = currentTotalCost > 0 ? (potentialSavings / currentTotalCost) * 100 : 0;

  const handleSelectOfferForItem = (itemId: string, offerId: string) => {
    setLocalItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const targetOffer = item.alternativeOffers?.find(o => o.id === offerId);
      if (!targetOffer) return item;

      return {
        ...item,
        costPrice: targetOffer.costPrice,
        supplier: targetOffer.supplier,
        sourceUrl: targetOffer.sourceUrl || item.sourceUrl,
        alternativeOffers: item.alternativeOffers?.map(o => ({
          ...o,
          isSelected: o.id === offerId
        }))
      };
    }));
  };

  const handleApplyCheapestBasket = () => {
    setLocalItems(optimized);
  };

  const handleConfirmAndSave = () => {
    onApplyOptimizedBasket(localItems);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="sq-page-title text-base md:text-lg">Matriz Multi-Fornecedor & Cesta Inteligente</h2>
              </div>
              <p className="sq-page-subtitle">
                Compare fornecedores por item, faça split de pedidos e maximize a margem da sua proposta
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Card de Economia / Simulação */}
        <div className="px-6 py-3.5 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border-b border-emerald-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-emerald-950">
                Economia Potencial na Compra: R$ {potentialSavings.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({savingsPercent.toFixed(1)}%)
              </span>
              <p className="text-[11px] text-slate-600">
                Custo atual: R$ {currentTotalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Cesta Otimizada: R$ {optimizedTotalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleApplyCheapestBasket}
            disabled={potentialSavings <= 0}
            className="sq-btn-emerald flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Simular Cesta Mais Barata</span>
          </button>
        </div>

        {/* Lista de Itens e Fornecedores com Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {localItems.map((item, idx) => {
            const offers = item.alternativeOffers || [];
            return (
              <div key={item.id} className="border border-slate-200 rounded-2xl p-4 bg-white shadow-2xs hover:border-slate-300 transition-colors space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center font-mono">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-900">{item.name}</span>
                    {item.partNumber && (
                      <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded font-mono text-[10px] font-bold">
                        PN: {item.partNumber}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    Qtd: <strong>{item.quantity} {item.unit}</strong> | Fornecedor eleito: <strong className="text-sky-700">{item.supplier || 'Padrão'}</strong>
                  </span>
                </div>

                {/* Grade de Ofertas Concorrentes do Item */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {offers.map(offer => {
                    const isSelected = offer.isSelected || (offer.supplier === item.supplier && offer.costPrice === item.costPrice);
                    return (
                      <div
                        key={offer.id}
                        onClick={() => handleSelectOfferForItem(item.id, offer.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-sky-50/70 border-sky-400 ring-2 ring-sky-500/20 shadow-xs'
                            : 'bg-slate-50/50 hover:bg-slate-100/70 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 truncate">
                            <Store className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            {offer.supplier}
                          </span>
                          {isSelected && (
                            <span className="px-1.5 py-0.5 bg-sky-600 text-white text-[9.5px] font-bold rounded flex items-center gap-1 shrink-0">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Eleito
                            </span>
                          )}
                        </div>

                        <div className="flex items-baseline justify-between pt-1">
                          <span className="text-sm font-bold font-mono text-slate-900">
                            R$ {offer.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            Total: R$ {(offer.costPrice * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        {offer.sourceUrl && (
                          <a
                            href={offer.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] text-sky-600 hover:text-sky-800 flex items-center gap-1 mt-1 font-semibold"
                          >
                            <span>Ver Oferta</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Rodapé */}
        <div className="px-6 py-3.5 border-t border-slate-200 flex items-center justify-between bg-slate-50/70">
          <button
            onClick={onClose}
            className="sq-btn-neutral"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmAndSave}
            className="sq-btn-primary flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Aplicar Seleção na Cotação</span>
          </button>
        </div>
      </div>
    </div>
  );
};
