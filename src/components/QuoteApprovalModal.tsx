import React, { useState, useMemo } from 'react';
import { 
  CheckCircle2, 
  X, 
  Building2, 
  ShoppingCart, 
  AlertCircle,
  PackageCheck,
  Calendar,
  Sparkles,
  Tag
} from 'lucide-react';
import { Quote, QuoteItem } from '../types';

interface QuoteApprovalModalProps {
  quote: Quote;
  isOpen: boolean;
  onClose: () => void;
  onConfirmApproval: (updatedQuote: Quote) => void;
}

interface ItemApprovalState {
  approved: boolean;
  approvedQuantity: number;
}

const getItemKey = (item: QuoteItem, index: number): string => {
  return item.id || `it_${index}_${item.itemNumber ?? ''}_${(item.name || '').slice(0, 15)}`;
};

export const QuoteApprovalModal: React.FC<QuoteApprovalModalProps> = ({
  quote,
  isOpen,
  onClose,
  onConfirmApproval
}) => {
  // Inicializa o estado de cada item com aprovação garantida por padrão
  const [itemsState, setItemsState] = useState<Record<string, ItemApprovalState>>(() => {
    const initialState: Record<string, ItemApprovalState> = {};
    (quote.items || []).forEach((item, index) => {
      const key = getItemKey(item, index);
      // Se a proposta está sendo aprovada, o padrão comercial é aprovar os produtos cotados
      const initialApproved = item.approved !== false;
      const qty = (item.approvedQuantity !== undefined && item.approvedQuantity > 0) 
        ? item.approvedQuantity 
        : (item.quantity > 0 ? item.quantity : 1);

      initialState[key] = {
        approved: initialApproved,
        approvedQuantity: qty
      };
    });
    return initialState;
  });

  const [approvalDate, setApprovalDate] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const [clientOrderNumber, setClientOrderNumber] = useState<string>(quote.clientOrderNumber || '');

  // Atualiza estado se a proposta mudar
  React.useEffect(() => {
    const initialState: Record<string, ItemApprovalState> = {};
    (quote.items || []).forEach((item, index) => {
      const key = getItemKey(item, index);
      const initialApproved = item.approved !== false;
      const qty = (item.approvedQuantity !== undefined && item.approvedQuantity > 0) 
        ? item.approvedQuantity 
        : (item.quantity > 0 ? item.quantity : 1);

      initialState[key] = {
        approved: initialApproved,
        approvedQuantity: qty
      };
    });
    setItemsState(initialState);
    setClientOrderNumber(quote.clientOrderNumber || '');
  }, [quote]);

  // Totais e Métricas Dinâmicas
  const metrics = useMemo(() => {
    let approvedItemsCount = 0;
    let approvedAmount = 0;
    let approvedCost = 0;

    (quote.items || []).forEach((item, index) => {
      const key = getItemKey(item, index);
      const state = itemsState[key];
      if (state && state.approved) {
        approvedItemsCount++;
        const qty = state.approvedQuantity || (item.quantity > 0 ? item.quantity : 1);
        approvedAmount += item.unitPrice * qty;
        approvedCost += (item.costPrice + (item.shippingCost || 0)) * qty;
      }
    });

    const approvedProfit = approvedAmount - approvedCost;
    const margin = approvedCost > 0 ? (approvedProfit / approvedCost) * 100 : 0;

    return {
      totalOriginal: quote.totalAmount,
      totalItemsOriginal: quote.items?.length || 0,
      approvedItemsCount,
      approvedAmount,
      approvedCost,
      approvedProfit,
      margin
    };
  }, [quote, itemsState]);

  if (!isOpen) return null;

  const handleToggleItem = (key: string) => {
    setItemsState(prev => {
      const current = prev[key];
      if (!current) return prev;
      return {
        ...prev,
        [key]: {
          ...current,
          approved: !current.approved
        }
      };
    });
  };

  const handleQuantityChange = (key: string, newQty: number, maxQty: number) => {
    const validQty = Math.max(1, Math.min(newQty, maxQty));
    setItemsState(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        approvedQuantity: validQty
      }
    }));
  };

  const handleSelectAll = (select: boolean) => {
    setItemsState(prev => {
      const updated: Record<string, ItemApprovalState> = {};
      Object.keys(prev).forEach(id => {
        updated[id] = {
          ...prev[id],
          approved: select
        };
      });
      return updated;
    });
  };

  const handleConfirm = () => {
    const oc = clientOrderNumber.trim() || undefined;
    // Monta os itens atualizados com status de aprovação e envio garantido para esteira de compras
    const updatedItems: QuoteItem[] = (quote.items || []).map((item, index) => {
      const key = getItemKey(item, index);
      const state = itemsState[key] || { 
        approved: true, 
        approvedQuantity: item.quantity > 0 ? item.quantity : 1 
      };
      const isApproved = state.approved !== false;
      const validQty = (state.approvedQuantity && state.approvedQuantity > 0)
        ? state.approvedQuantity
        : (item.quantity > 0 ? item.quantity : 1);

      return {
        ...item,
        id: item.id || key,
        approved: isApproved,
        approvedQuantity: isApproved ? validQty : 0,
        clientOrderNumber: oc || item.clientOrderNumber,
        // Itens aprovados entram com status de compra 'pending' caso ainda não tenham sido comprados
        purchaseStatus: isApproved 
          ? (item.purchaseStatus || 'pending') 
          : undefined
      };
    });

    const updatedQuote: Quote = {
      ...quote,
      status: 'approved',
      clientOrderNumber: oc,
      items: updatedItems,
      approvedTotalAmount: metrics.approvedAmount,
      approvedAt: approvalDate
    };

    onConfirmApproval(updatedQuote);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-4 bg-gradient-to-r from-slate-50 to-white">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-2.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold font-mono uppercase tracking-wider rounded-lg">
                {quote.code || 'PROPOSTA'}
              </span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Fechamento de Proposta
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-emerald-600" />
              Confirmar Itens Aprovados pelo Cliente
            </h2>
            <p className="text-xs text-slate-500 flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Cliente: <strong className="text-slate-700">{quote.clientCompany || 'Não informado'}</strong></span>
              {quote.contactPerson && (
                <>
                  <span>•</span>
                  <span>Comprador: <strong className="text-slate-700">{quote.contactPerson}</strong></span>
                </>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dashboard Resumo da Aprovação */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 sm:p-5 bg-slate-50/70 border-b border-slate-200/80">
          <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-xs">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Itens Aprovados
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-slate-900 font-mono">
                {metrics.approvedItemsCount}
              </span>
              <span className="text-xs text-slate-400">/ {metrics.totalItemsOriginal} produtos</span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
              {metrics.approvedItemsCount === metrics.totalItemsOriginal ? 'Fechamento 100%' : 'Fechamento parcial'}
            </span>
          </div>

          <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-xs">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Valor Fechado
            </span>
            <span className="text-lg font-bold text-emerald-700 font-mono block mt-1">
              R$ {metrics.approvedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
              Original: R$ {metrics.totalOriginal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-xs">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Custo Previsto
            </span>
            <span className="text-lg font-bold text-slate-700 font-mono block mt-1">
              R$ {metrics.approvedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
              Estimado na cotação
            </span>
          </div>

          <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-xs">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Lucro Estimado
            </span>
            <span className="text-lg font-bold text-sky-700 font-mono block mt-1">
              R$ {metrics.approvedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-sky-600 font-semibold block mt-0.5 font-mono">
              {metrics.margin.toFixed(1)}% margem média
            </span>
          </div>
        </div>

        {/* Toolbar da Lista de Itens */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectAll(true)}
              className="text-xs font-bold text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-xl border border-sky-200 transition cursor-pointer"
            >
              Selecionar Todos
            </button>
            <button
              type="button"
              onClick={() => handleSelectAll(false)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl border border-slate-200 transition cursor-pointer"
            >
              Desmarcar Todos
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-amber-600" />
                <span className="hidden sm:inline">Nº da OC / AF:</span>
                <span className="sm:hidden">OC:</span>
              </span>
              <input
                type="text"
                value={clientOrderNumber}
                onChange={(e) => setClientOrderNumber(e.target.value)}
                className="bg-white border border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 px-2.5 py-1 rounded-xl text-xs font-mono font-bold text-amber-900 w-36 sm:w-44"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Data Fechamento:</span>
              </span>
              <input
                type="date"
                value={approvalDate}
                onChange={(e) => setApprovalDate(e.target.value)}
                className="bg-white border border-slate-200 px-2.5 py-1 rounded-xl text-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* Lista com Rolagem */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5 divide-y divide-slate-100">
          {(quote.items || []).map((item, index) => {
            const key = getItemKey(item, index);
            const state = itemsState[key] || { approved: true, approvedQuantity: item.quantity > 0 ? item.quantity : 1 };
            const isApproved = state.approved !== false;
            const currentQty = state.approvedQuantity || (item.quantity > 0 ? item.quantity : 1);
            const itemTotal = item.unitPrice * currentQty;

            return (
              <div
                key={key}
                className={`pt-2.5 first:pt-0 transition-all rounded-2xl p-3 border ${
                  isApproved 
                    ? 'bg-white border-slate-200 shadow-2xs hover:border-emerald-300' 
                    : 'bg-slate-50/60 border-slate-100 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox de Aprovação */}
                  <div className="pt-1">
                    <input
                      type="checkbox"
                      id={`chk-${key}`}
                      checked={isApproved}
                      onChange={() => handleToggleItem(key)}
                      className="w-4 h-4 text-emerald-600 rounded-md border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                  </div>

                  {/* Foto do Produto se houver */}
                  {item.imageUrl ? (
                    <div className="w-12 h-12 rounded-xl border border-slate-200 bg-white p-1 shrink-0 overflow-hidden flex items-center justify-center">
                      <img 
                        src={item.imageUrl} 
                        alt={item.name} 
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-xl border border-slate-200 bg-slate-100 text-slate-400 shrink-0 flex items-center justify-center text-[10px] font-bold">
                      #{index + 1}
                    </div>
                  )}

                  {/* Informações do Item */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <label 
                          htmlFor={`chk-${key}`}
                          className={`text-xs sm:text-sm font-bold block cursor-pointer transition ${
                            isApproved ? 'text-slate-900 hover:text-emerald-700' : 'text-slate-500 line-through'
                          }`}
                        >
                          {item.name}
                        </label>
                        <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                          {item.description || item.partNumber || 'Sem descrição adicional'}
                        </p>
                      </div>

                      {/* Status Tag */}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${
                        isApproved 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {isApproved ? 'Aprovado' : 'Declinado'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 pt-2 border-t border-slate-100">
                      {/* Fornecedor Cotado */}
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <span>Fornecedor:</span>
                        <strong className="text-slate-700">{item.supplier || 'Não especificado'}</strong>
                      </div>

                      {/* Controle de Quantidade */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500">Qtd aprovada:</span>
                        <input
                          type="number"
                          min="1"
                          max={item.quantity}
                          disabled={!isApproved}
                          value={currentQty}
                          onChange={(e) => handleQuantityChange(key, parseInt(e.target.value) || 1, item.quantity)}
                          className={`w-16 h-7 text-xs font-mono font-bold text-center border rounded-lg focus:outline-none focus:border-emerald-500 ${
                            isApproved ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-100 border-slate-200 text-slate-400'
                          }`}
                        />
                        <span className="text-[11px] text-slate-400">/ {item.quantity} {item.unit || 'un'}</span>
                      </div>

                      {/* Preço Unitário & Total */}
                      <div className="ml-auto text-right">
                        <span className="text-[11px] text-slate-400 block">
                          Unit: R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className={`text-xs sm:text-sm font-mono font-bold ${isApproved ? 'text-emerald-700' : 'text-slate-400'}`}>
                          Total: R$ {itemTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Rodapé com Ações */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Ao confirmar, os <strong>{metrics.approvedItemsCount} itens aprovados</strong> serão enviados automaticamente para a sua <strong>Central de Compras</strong>.
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm rounded-xl border border-slate-200 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={metrics.approvedItemsCount === 0}
              onClick={handleConfirm}
              className={`px-5 py-2.5 font-bold text-xs sm:text-sm rounded-xl text-white shadow-xs transition flex items-center gap-2 cursor-pointer ${
                metrics.approvedItemsCount > 0
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700'
                  : 'bg-slate-300 cursor-not-allowed text-slate-500'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Confirmar Aprovação ({metrics.approvedItemsCount})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
