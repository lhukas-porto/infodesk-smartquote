import React, { useState, useMemo } from 'react';
import { 
  ShoppingCart, 
  Search, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  Filter, 
  Calendar, 
  FileSpreadsheet, 
  Building2, 
  Sparkles, 
  CreditCard, 
  DollarSign, 
  ArrowUpRight, 
  Edit3, 
  X, 
  ChevronRight,
  Package,
  TrendingUp,
  Receipt
} from 'lucide-react';
import { Quote, ProcurementItem } from '../types';
import { exportPurchasesToExcel } from '../utils/excelExport';

interface ProcurementViewProps {
  quotes: Quote[];
  onUpdateQuote: (quote: Quote) => void;
  onOpenQuote?: (quote: Quote) => void;
}

const PAYMENT_METHODS = [
  'PIX',
  'Cartão C6',
  'Cartão Latam',
  'Cartão Azul',
  'Amazon',
  'Boleto',
  'Dinheiro',
  'Outro'
];

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril',
  'Maio', 'Junho', 'Julho', 'Agosto',
  'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const ProcurementView: React.FC<ProcurementViewProps> = ({
  quotes,
  onUpdateQuote,
  onOpenQuote
}) => {
  // Filtros
  const [statusFilter, setStatusFilter] = useState<'pending' | 'purchased' | 'all'>('pending');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Estado do Modal de Registro de Compra
  const [activeItemForPurchase, setActiveItemForPurchase] = useState<ProcurementItem | null>(null);
  const [purchaseForm, setPurchaseForm] = useState({
    actualCost: 0,
    actualShipping: 0,
    paymentMethod: 'PIX',
    purchaseDate: '',
    taxPercent: 9.05,
    notes: ''
  });

  // Extrai todos os itens de propostas aprovadas (ou com itens aprovados)
  const procurementItems = useMemo<ProcurementItem[]>(() => {
    const list: ProcurementItem[] = [];

    (quotes || []).forEach(quote => {
      // Considera propostas aprovadas ou itens marcados explicitamente como aprovados
      const isQuoteApproved = quote.status === 'approved';

      (quote.items || []).forEach(item => {
        const isItemApproved = item.approved === true || (isQuoteApproved && item.approved !== false);

        if (isItemApproved) {
          const qty = item.approvedQuantity !== undefined ? item.approvedQuantity : item.quantity;
          const quotedUnitPrice = item.unitPrice;
          const quotedTotalPrice = Number((quotedUnitPrice * qty).toFixed(2));

          list.push({
            id: `${quote.id}_${item.id}`,
            quoteId: quote.id,
            quoteCode: quote.code || 'PROPOSTA',
            clientCompany: quote.clientCompany || 'Cliente sem nome',
            contactPerson: quote.contactPerson,
            approvedAt: quote.approvedAt || quote.date,
            itemId: item.id,
            name: item.name,
            description: item.description,
            partNumber: item.partNumber,
            ncm: item.ncm,
            imageUrl: item.imageUrl,
            quantity: qty,
            unit: item.unit || 'un',
            quotedCostPrice: item.costPrice,
            quotedUnitPrice,
            quotedTotalPrice,
            supplier: item.supplier,
            sourceUrl: item.sourceUrl,
            purchaseStatus: item.purchaseStatus || 'pending',
            actualCostPrice: item.actualCostPrice,
            actualShippingCost: item.actualShippingCost,
            paymentMethod: item.paymentMethod,
            purchasedAt: item.purchasedAt,
            purchaseNotes: item.purchaseNotes,
            taxPercent: item.actualTaxPercent ?? 9.05
          });
        }
      });
    });

    return list;
  }, [quotes]);

  // Lista de fornecedores únicos para filtro
  const suppliers = useMemo(() => {
    const set = new Set<string>();
    procurementItems.forEach(it => {
      if (it.supplier && it.supplier.trim()) {
        set.add(it.supplier.trim());
      }
    });
    return Array.from(set).sort();
  }, [procurementItems]);

  // Filtragem dos Itens
  const filteredItems = useMemo(() => {
    return procurementItems.filter(item => {
      // 1. Filtro de Status
      if (statusFilter !== 'all' && item.purchaseStatus !== statusFilter) {
        return false;
      }

      // 2. Filtro de Fornecedor
      if (selectedSupplier !== 'all' && item.supplier !== selectedSupplier) {
        return false;
      }

      // 3. Filtro de Mês
      if (selectedMonth !== 'all') {
        const dateStr = item.purchasedAt || item.approvedAt;
        if (dateStr) {
          const d = new Date(dateStr);
          const monthIdx = isNaN(d.getTime()) ? -1 : d.getMonth();
          if (monthIdx >= 0 && MONTH_NAMES[monthIdx] !== selectedMonth) {
            return false;
          }
        }
      }

      // 4. Busca textual
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchName = item.name.toLowerCase().includes(query);
        const matchClient = item.clientCompany.toLowerCase().includes(query);
        const matchCode = item.quoteCode.toLowerCase().includes(query);
        const matchSupplier = (item.supplier || '').toLowerCase().includes(query);
        if (!matchName && !matchClient && !matchCode && !matchSupplier) {
          return false;
        }
      }

      return true;
    });
  }, [procurementItems, statusFilter, selectedSupplier, selectedMonth, searchTerm]);

  // Métricas do Topo
  const stats = useMemo(() => {
    let pendingCount = 0;
    let pendingCost = 0;
    let purchasedCount = 0;
    let purchasedCost = 0;
    let purchasedRevenue = 0;
    let purchasedTax = 0;
    let purchasedShipping = 0;

    procurementItems.forEach(item => {
      if (item.purchaseStatus === 'pending') {
        pendingCount++;
        pendingCost += item.quotedCostPrice * item.quantity;
      } else {
        purchasedCount++;
        const cost = item.actualCostPrice !== undefined ? item.actualCostPrice : (item.quotedCostPrice * item.quantity);
        const shipping = item.actualShippingCost || 0;
        const rev = item.quotedTotalPrice;
        const tax = rev * (item.taxPercent / 100);

        purchasedCost += cost;
        purchasedShipping += shipping;
        purchasedRevenue += rev;
        purchasedTax += tax;
      }
    });

    const netProfit = purchasedRevenue - purchasedCost - purchasedShipping - purchasedTax;
    const roiMargin = (purchasedCost + purchasedShipping + purchasedTax) > 0
      ? (netProfit / (purchasedCost + purchasedShipping + purchasedTax)) * 100
      : 0;

    return {
      pendingCount,
      pendingCost,
      purchasedCount,
      purchasedCost,
      purchasedRevenue,
      netProfit,
      roiMargin
    };
  }, [procurementItems]);

  // Abrir Modal de Registro de Compra
  const handleOpenPurchaseModal = (item: ProcurementItem) => {
    setActiveItemForPurchase(item);
    
    // Sugere valores pré-carregados
    const defaultCost = item.actualCostPrice !== undefined 
      ? item.actualCostPrice 
      : Number((item.quotedCostPrice * item.quantity).toFixed(2));
      
    const defaultDate = item.purchasedAt 
      ? item.purchasedAt.split('T')[0]
      : new Date().toISOString().split('T')[0];

    setPurchaseForm({
      actualCost: defaultCost,
      actualShipping: item.actualShippingCost || 0,
      paymentMethod: item.paymentMethod || 'PIX',
      purchaseDate: defaultDate,
      taxPercent: item.taxPercent || 9.05,
      notes: item.purchaseNotes || ''
    });
  };

  // Salvar Registro de Compra no Quote correspondente
  const handleSavePurchase = () => {
    if (!activeItemForPurchase) return;

    const targetQuote = quotes.find(q => q.id === activeItemForPurchase.quoteId);
    if (!targetQuote) return;

    const updatedItems = (targetQuote.items || []).map(it => {
      if (it.id === activeItemForPurchase.itemId) {
        return {
          ...it,
          purchaseStatus: 'purchased' as const,
          actualCostPrice: Number(purchaseForm.actualCost),
          actualShippingCost: Number(purchaseForm.actualShipping),
          paymentMethod: purchaseForm.paymentMethod,
          purchasedAt: purchaseForm.purchaseDate,
          actualTaxPercent: Number(purchaseForm.taxPercent),
          purchaseNotes: purchaseForm.notes
        };
      }
      return it;
    });

    const updatedQuote: Quote = {
      ...targetQuote,
      items: updatedItems
    };

    onUpdateQuote(updatedQuote);
    setActiveItemForPurchase(null);
  };

  // Marcar de volta como Pendente
  const handleRevertToPending = (item: ProcurementItem) => {
    const targetQuote = quotes.find(q => q.id === item.quoteId);
    if (!targetQuote) return;

    const updatedItems = (targetQuote.items || []).map(it => {
      if (it.id === item.itemId) {
        return {
          ...it,
          purchaseStatus: 'pending' as const
        };
      }
      return it;
    });

    onUpdateQuote({
      ...targetQuote,
      items: updatedItems
    });
  };

  // Exportar Excel
  const handleExportExcel = () => {
    exportPurchasesToExcel(
      procurementItems, 
      selectedMonth !== 'all' ? selectedMonth : undefined
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Oficial do Sistema */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="px-2.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold font-mono uppercase tracking-wider rounded-lg">
              SUPRIMENTOS & COMPRAS
            </span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <ShoppingCart className="w-3.5 h-3.5 text-emerald-600" />
              Gestão de Aquisições
            </span>
          </div>
          <h1 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Central de Compras & Conciliação de Lucro
          </h1>
          <p className="text-xs text-slate-500">
            Acompanhe itens de propostas aprovadas, acesse links dos fornecedores e registre os custos reais com cálculo automático de imposto (9,05%) e margem líquida.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-xl font-bold text-xs sm:text-sm shadow-2xs transition cursor-pointer"
            title="Exportar planilha de compras no padrão idêntico a Compras 2026.xlsx"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Exportar Planilha Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* 2. Cards de Métricas Superiores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Itens a Comprar */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Itens a Comprar
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-amber-600">
              {stats.pendingCount}
            </span>
            <span className="text-xs text-slate-400">produtos pendentes</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block mt-1">
            Investimento estimado: R$ {stats.pendingCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Itens Comprados */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Comprados no Ano
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-600">
              {stats.purchasedCount}
            </span>
            <span className="text-xs text-slate-400">itens adquiridos</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block mt-1">
            Faturamento: R$ {stats.purchasedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Custo Real Pago */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Custo Real Desembolsado
          </span>
          <span className="text-xl sm:text-2xl font-bold font-mono text-slate-800 block mt-1">
            R$ {stats.purchasedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-400 font-medium block mt-1">
            Itens com compra registrada
          </span>
        </div>

        {/* Lucro Líquido Realizado */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Lucro Líquido Realizado
          </span>
          <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-700 block mt-1">
            R$ {stats.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-emerald-600 font-semibold block mt-1 font-mono">
            {stats.roiMargin.toFixed(1)}% retorno médio
          </span>
        </div>
      </div>

      {/* 3. Barra de Filtros e Busca */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        {/* Abas Rápidas de Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'pending'
                  ? 'bg-white text-amber-700 shadow-2xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>A Comprar ({stats.pendingCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('purchased')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'purchased'
                  ? 'bg-white text-emerald-700 shadow-2xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Comprados ({stats.purchasedCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white text-sky-700 shadow-2xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Todos ({procurementItems.length})</span>
            </button>
          </div>

          {/* Selects de Mês e Fornecedor */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-sky-500"
              >
                <option value="all">Todos os Meses</option>
                {MONTH_NAMES.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {suppliers.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedSupplier}
                  onChange={(e) => setSelectedSupplier(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-sky-500"
                >
                  <option value="all">Todos Fornecedores</option>
                  {suppliers.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Input de Busca */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por produto, cliente, código de proposta ou fornecedor..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4. Lista de Itens para Compra */}
      {filteredItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-lg mx-auto shadow-xs space-y-3">
          <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mx-auto border border-sky-100">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            Nenhum item encontrado
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {searchTerm || selectedSupplier !== 'all' || selectedMonth !== 'all'
              ? 'Nenhum produto corresponde aos filtros selecionados.'
              : statusFilter === 'pending'
                ? 'Parabéns! Não há produtos pendentes de compra no momento.'
                : 'Nenhum produto com compra registrada ainda.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map(item => {
            const isPurchased = item.purchaseStatus === 'purchased';
            const costPaid = item.actualCostPrice !== undefined 
              ? item.actualCostPrice 
              : (item.quotedCostPrice * item.quantity);
            const fretePaid = item.actualShippingCost || 0;
            const revenue = item.quotedTotalPrice;
            const tax = revenue * (item.taxPercent / 100);
            const profit = revenue - costPaid - fretePaid - tax;
            const roi = (costPaid + fretePaid + tax) > 0 ? (profit / (costPaid + fretePaid + tax)) * 100 : 0;

            return (
              <div
                key={item.id}
                className={`bg-white border rounded-2xl p-4 shadow-xs transition hover:shadow-sm flex flex-col gap-3 ${
                  isPurchased ? 'border-emerald-200/80 bg-emerald-50/10' : 'border-slate-200 hover:border-sky-300'
                }`}
              >
                {/* Cabeçalho do Card */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    {/* Foto do Produto */}
                    {item.imageUrl ? (
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border border-slate-200 bg-white p-1.5 shrink-0 overflow-hidden flex items-center justify-center">
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
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border border-slate-200 bg-slate-100 text-slate-400 shrink-0 flex items-center justify-center">
                        <Package className="w-6 h-6 text-slate-300" />
                      </div>
                    )}

                    {/* Informações Principais */}
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Tag de Quantidade */}
                        <span className="font-mono text-xs font-bold text-sky-800 bg-sky-50 px-2.5 py-0.5 rounded-lg border border-sky-200">
                          {item.quantity} {item.unit}
                        </span>

                        {/* Tag da Proposta */}
                        <button
                          type="button"
                          onClick={() => {
                            const q = quotes.find(quote => quote.id === item.quoteId);
                            if (q && onOpenQuote) onOpenQuote(q);
                          }}
                          className="text-[11px] font-mono font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md border border-slate-200/80 transition cursor-pointer"
                          title="Ver proposta original"
                        >
                          {item.quoteCode}
                        </button>

                        {/* Status de Compra */}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                          isPurchased 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                        }`}>
                          {isPurchased ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Comprado
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 text-amber-600" />
                              Pendente de Compra
                            </>
                          )}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 line-clamp-2">
                        {item.name}
                      </h3>

                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <strong>{item.clientCompany}</strong>
                        </span>
                        {item.supplier && (
                          <span>• Fornecedor: <strong className="text-slate-700">{item.supplier}</strong></span>
                        )}
                        {item.partNumber && (
                          <span>• Part Number: <code className="font-mono text-[11px]">{item.partNumber}</code></span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Financeiro do Card */}
                  <div className="sm:text-right shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block">Venda Faturada</span>
                      <span className="text-base sm:text-lg font-mono font-bold text-slate-900 block">
                        R$ {revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center sm:justify-end gap-2 text-xs">
                      {isPurchased ? (
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span className="text-emerald-700 font-bold">
                            Lucro: R$ {profit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-sky-700 font-bold">
                            {roi.toFixed(1)}% ROI
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[11px]">
                          Custo previsto: R$ {(item.quotedCostPrice * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Linha de Ações e Detalhes da Compra */}
                <div className="border-t border-slate-100 pt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  {/* Dados da Compra (se já realizada) */}
                  {isPurchased ? (
                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 font-medium">
                        <CreditCard className="w-3 h-3 text-slate-500" />
                        Pgto: <strong className="text-slate-800">{item.paymentMethod || 'PIX'}</strong>
                      </span>
                      <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 font-medium font-mono text-[11px]">
                        Custo: R$ {costPaid.toFixed(2)}
                      </span>
                      {fretePaid > 0 && (
                        <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 font-medium font-mono text-[11px]">
                          Frete: R$ {fretePaid.toFixed(2)}
                        </span>
                      )}
                      {item.purchasedAt && (
                        <span className="text-slate-400 text-[11px]">
                          Comprado em: {item.purchasedAt.split('T')[0]}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Item aguardando aquisição no fornecedor</span>
                    </div>
                  )}

                  {/* Botões de Ação */}
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {/* Botão de Link Externo da Loja */}
                    {item.sourceUrl && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-sky-50 hover:text-sky-700 text-slate-700 border border-slate-200 hover:border-sky-200 rounded-xl text-xs font-bold transition cursor-pointer"
                        title="Abrir página do produto na loja cotada"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Abrir Link da Loja</span>
                      </a>
                    )}

                    {/* Botão Registrar Compra / Editar */}
                    {isPurchased ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenPurchaseModal(item)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                          title="Alterar dados da compra"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Editar Compra</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevertToPending(item)}
                          className="px-2 py-1.5 text-slate-400 hover:text-rose-600 text-xs font-medium hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Desmarcar como comprado"
                        >
                          Voltar p/ Pendente
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenPurchaseModal(item)}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Registrar Compra</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Modal / Gaveta de Registro de Compra */}
      {activeItemForPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-gradient-to-r from-slate-50 to-white">
              <div>
                <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold font-mono uppercase tracking-wider rounded-lg">
                  REGISTRO DE COMPRA
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {activeItemForPurchase.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeItemForPurchase.quantity} {activeItemForPurchase.unit} • Cliente: {activeItemForPurchase.clientCompany}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveItemForPurchase(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulário de Compra */}
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Custo Total da Mercadoria */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Custo Real Total (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={purchaseForm.actualCost}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, actualCost: parseFloat(e.target.value) || 0 })}
                    className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm font-mono text-slate-900"
                    placeholder="0.00"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Cotado: R$ {(activeItemForPurchase.quotedCostPrice * activeItemForPurchase.quantity).toFixed(2)}
                  </span>
                </div>

                {/* Frete da Compra */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Frete da Compra (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={purchaseForm.actualShipping}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, actualShipping: parseFloat(e.target.value) || 0 })}
                    className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm font-mono text-slate-900"
                    placeholder="0.00 (grátis)"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Forma de Pagamento */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Forma de Pagamento (Cartão/Conta)
                  </label>
                  <select
                    value={purchaseForm.paymentMethod}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, paymentMethod: e.target.value })}
                    className="w-full h-10 px-3 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm text-slate-900 font-medium"
                  >
                    {PAYMENT_METHODS.map(pm => (
                      <option key={pm} value={pm}>{pm}</option>
                    ))}
                  </select>
                </div>

                {/* Data da Compra */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Data da Compra
                  </label>
                  <input
                    type="date"
                    value={purchaseForm.purchaseDate}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, purchaseDate: e.target.value })}
                    className="w-full h-10 px-3 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm text-slate-900 font-mono"
                  />
                </div>
              </div>

              {/* Imposto (Padrão 9.05% da sua planilha) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Alíquota Imposto (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={purchaseForm.taxPercent}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, taxPercent: parseFloat(e.target.value) || 0 })}
                    className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm font-mono text-slate-900"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Padrão da planilha: 9,05%
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Observações / Código de Rastreio
                  </label>
                  <input
                    type="text"
                    value={purchaseForm.notes}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
                    placeholder="Ex: pedido #12345, entrega em 3 dias"
                    className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs text-slate-900"
                  />
                </div>
              </div>

              {/* Preview Financeiro em Tempo Real (Fórmula do Excel de Lucas) */}
              {(() => {
                const venda = activeItemForPurchase.quotedTotalPrice;
                const custo = purchaseForm.actualCost;
                const frete = purchaseForm.actualShipping;
                const imposto = venda * (purchaseForm.taxPercent / 100);
                const lucro = venda - custo - frete - imposto;
                const roi = (custo + frete + imposto) > 0 ? (lucro / (custo + frete + imposto)) * 100 : 0;

                return (
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 block uppercase">Imposto ({purchaseForm.taxPercent}%)</span>
                      <span className="text-xs font-mono font-bold text-slate-700">R$ {imposto.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 block uppercase">Lucro Líquido Real</span>
                      <span className={`text-xs font-mono font-bold ${lucro >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                        R$ {lucro.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 block uppercase">% Retorno (ROI)</span>
                      <span className={`text-xs font-mono font-bold ${roi >= 0 ? 'text-sky-700' : 'text-rose-600'}`}>
                        {roi.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer do Modal */}
            <div className="p-4 sm:p-5 border-t border-slate-100 bg-white flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setActiveItemForPurchase(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSavePurchase}
                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Salvar Registro de Compra</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
