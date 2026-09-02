import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Search,
  Sparkles,
  Save,
  Send,
  Eye,
  Calculator,
  Percent,
  DollarSign,
  Building,
  Calendar,
  Layers,
  ExternalLink,
  BookmarkPlus,
  Check,
  Truck,
  Receipt,
  MapPin
} from 'lucide-react';
import { CompanySettings, Product, Quote, QuoteItem } from '../types';
import { formatDeliveryDaysText, extractDeliveryDaysNumber, calculateCommercialUnitPrice } from '../utils/aiEmailParser';

interface QuoteBuilderProps {
  currentQuote: Quote;
  setCurrentQuote: React.Dispatch<React.SetStateAction<Quote>>;
  products: Product[];
  settings: CompanySettings;
  onPreview: () => void;
  onSave: () => void;
  onSendEmail: () => void;
  onOpenWebSearch: (query?: string, itemIdx?: number | null) => void;
  onSaveToCatalog?: (prod: Product) => void;
}

export const QuoteBuilder: React.FC<QuoteBuilderProps> = ({
  currentQuote,
  setCurrentQuote,
  products,
  settings,
  onPreview,
  onSave,
  onSendEmail,
  onOpenWebSearch,
  onSaveToCatalog
}) => {
  const [globalMarkup, setGlobalMarkup] = useState<number>(settings.defaultMarkupPercent || 35);
  const [globalTax, setGlobalTax] = useState<number>(settings.defaultTaxPercent || 6);
  const [globalShipping, setGlobalShipping] = useState<number>(settings.defaultShippingCost || 0);

  const [savedCatalogIds, setSavedCatalogIds] = useState<Record<string, boolean>>({});
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  // Helper to calculate unit price based on cost, shipping, markup and tax
  const calculateItemUnitPrice = (
    cost: number,
    shipping: number = globalShipping,
    markup: number = globalMarkup,
    tax: number = globalTax
  ): number => {
    return calculateCommercialUnitPrice(cost, shipping, markup, tax);
  };

  const recalculateQuote = (items: QuoteItem[]): {
    totalCost: number;
    totalShipping: number;
    totalTaxes: number;
    totalProfit: number;
    totalAmount: number;
    averageMargin: number
  } => {
    let totalCost = 0;
    let totalShipping = 0;
    let totalAmount = 0;
    let totalTaxes = 0;

    items.forEach(item => {
      const qty = item.quantity || 1;
      const itemCost = (item.costPrice || 0) * qty;
      const itemShipping = (item.shippingCost ?? globalShipping ?? 0) * qty;
      const itemTotal = (item.unitPrice || 0) * qty;

      const taxRate = item.taxPercent ?? globalTax ?? 0;
      // Tax embedded in the price: Total * (TaxRate / (100 + TaxRate))
      const itemTaxAmount = itemTotal * (taxRate / (100 + taxRate));

      totalCost += itemCost;
      totalShipping += itemShipping;
      totalAmount += itemTotal;
      totalTaxes += itemTaxAmount;
    });

    const totalProfit = totalAmount - totalCost - totalShipping - totalTaxes;
    const directCosts = totalCost + totalShipping;
    const averageMargin = directCosts > 0 ? (totalProfit / directCosts) * 100 : 0;

    return {
      totalCost: Number(totalCost.toFixed(2)),
      totalShipping: Number(totalShipping.toFixed(2)),
      totalTaxes: Number(totalTaxes.toFixed(2)),
      totalProfit: Number(totalProfit.toFixed(2)),
      totalAmount: Number(totalAmount.toFixed(2)),
      averageMargin: Number(averageMargin.toFixed(1))
    };
  };

  const handleApplyGlobalMarkup = (markup: number) => {
    setGlobalMarkup(markup);
    const updatedItems = currentQuote.items.map(item => {
      const ship = item.shippingCost ?? globalShipping;
      const tax = item.taxPercent ?? globalTax;
      const unitPrice = calculateItemUnitPrice(item.costPrice, ship, markup, tax);
      const totalPrice = Number((unitPrice * item.quantity).toFixed(2));
      return {
        ...item,
        markupPercent: markup,
        unitPrice,
        totalPrice
      };
    });

    const totals = recalculateQuote(updatedItems);
    setCurrentQuote(prev => ({
      ...prev,
      items: updatedItems,
      ...totals
    }));
  };

  const handleApplyGlobalTax = (tax: number) => {
    setGlobalTax(tax);
    const updatedItems = currentQuote.items.map(item => {
      const ship = item.shippingCost ?? globalShipping;
      const markup = item.markupPercent ?? globalMarkup;
      const unitPrice = calculateItemUnitPrice(item.costPrice, ship, markup, tax);
      const totalPrice = Number((unitPrice * item.quantity).toFixed(2));
      return {
        ...item,
        taxPercent: tax,
        unitPrice,
        totalPrice
      };
    });

    const totals = recalculateQuote(updatedItems);
    setCurrentQuote(prev => ({
      ...prev,
      globalTaxPercent: tax,
      items: updatedItems,
      ...totals
    }));
  };

  const handleApplyGlobalShipping = (shipping: number) => {
    setGlobalShipping(shipping);
    const updatedItems = currentQuote.items.map(item => {
      const markup = item.markupPercent ?? globalMarkup;
      const tax = item.taxPercent ?? globalTax;
      const unitPrice = calculateItemUnitPrice(item.costPrice, shipping, markup, tax);
      const totalPrice = Number((unitPrice * item.quantity).toFixed(2));
      return {
        ...item,
        shippingCost: shipping,
        unitPrice,
        totalPrice
      };
    });

    const totals = recalculateQuote(updatedItems);
    setCurrentQuote(prev => ({
      ...prev,
      globalShipping: shipping,
      items: updatedItems,
      ...totals
    }));
  };

  const handleItemChange = (index: number, field: keyof QuoteItem, value: any) => {
    const updatedItems = [...currentQuote.items];
    const item = { ...updatedItems[index], [field]: value };

    if (field === 'costPrice' || field === 'markupPercent' || field === 'shippingCost' || field === 'taxPercent') {
      const cost = field === 'costPrice' ? Number(value) : item.costPrice;
      const markup = field === 'markupPercent' ? Number(value) : (item.markupPercent ?? globalMarkup);
      const shipping = field === 'shippingCost' ? Number(value) : (item.shippingCost ?? globalShipping);
      const tax = field === 'taxPercent' ? Number(value) : (item.taxPercent ?? globalTax);

      item.unitPrice = calculateItemUnitPrice(cost, shipping, markup, tax);
      item.totalPrice = Number((item.unitPrice * item.quantity).toFixed(2));
    } else if (field === 'unitPrice') {
      const uPrice = Number(value);
      item.unitPrice = uPrice;
      item.totalPrice = Number((uPrice * item.quantity).toFixed(2));
      const baseCost = item.costPrice + (item.shippingCost ?? globalShipping);
      if (baseCost > 0) {
        const taxRate = item.taxPercent ?? globalTax;
        const priceBeforeTax = uPrice / (1 + taxRate / 100);
        item.markupPercent = Number((((priceBeforeTax - baseCost) / baseCost) * 100).toFixed(2));
      }
    } else if (field === 'quantity') {
      const qty = Number(value) || 1;
      item.quantity = qty;
      item.totalPrice = Number((item.unitPrice * qty).toFixed(2));
    }

    updatedItems[index] = item;
    const totals = recalculateQuote(updatedItems);

    setCurrentQuote(prev => ({
      ...prev,
      items: updatedItems,
      ...totals
    }));
  };

  const handleAddItem = () => {
    const unitPrice = calculateItemUnitPrice(0, globalShipping, globalMarkup, globalTax);
    const newItem: QuoteItem = {
      id: `item-${Date.now()}`,
      itemNumber: currentQuote.items.length + 1,
      name: '',
      description: '',
      quantity: 1,
      unit: 'Un.',
      costPrice: 0,
      shippingCost: globalShipping,
      taxPercent: globalTax,
      markupPercent: globalMarkup,
      unitPrice,
      totalPrice: unitPrice
    };

    const updatedItems = [...currentQuote.items, newItem];
    const totals = recalculateQuote(updatedItems);

    setCurrentQuote(prev => ({
      ...prev,
      items: updatedItems,
      ...totals
    }));
  };

  const handleAddFromCatalog = () => {
    if (!selectedProductId) return;
    const prod = products.find(p => p.id === selectedProductId);
    if (!prod) return;

    const unitPrice = calculateItemUnitPrice(prod.costPrice, globalShipping, globalMarkup, globalTax);
    const newItem: QuoteItem = {
      id: `item-${Date.now()}`,
      productId: prod.id,
      itemNumber: currentQuote.items.length + 1,
      name: prod.name,
      description: prod.description,
      quantity: 1,
      unit: prod.unit || 'Un.',
      costPrice: prod.costPrice,
      shippingCost: globalShipping,
      taxPercent: globalTax,
      markupPercent: globalMarkup,
      unitPrice,
      totalPrice: unitPrice,
      sourceUrl: prod.sourceUrl
    };

    const updatedItems = [...currentQuote.items, newItem];
    const totals = recalculateQuote(updatedItems);

    setCurrentQuote(prev => ({
      ...prev,
      items: updatedItems,
      ...totals
    }));
    setSelectedProductId('');
  };

  const handleSaveItemToCatalog = (item: QuoteItem) => {
    if (onSaveToCatalog) {
      onSaveToCatalog({
        id: `prod-${Date.now()}`,
        sku: `INF-${Date.now().toString().slice(-4)}`,
        name: item.name,
        description: item.description,
        category: 'Geral',
        costPrice: item.costPrice || 0,
        unit: item.unit || 'Un.',
        supplier: 'Fornecedor Web / Mercado',
        stock: 5,
        lastUpdated: new Date().toISOString().split('T')[0],
        sourceUrl: item.sourceUrl || `https://www.google.com/search?q=${encodeURIComponent(item.name)}`
      });
      setSavedCatalogIds(prev => ({ ...prev, [item.id]: true }));
      setTimeout(() => {
        setSavedCatalogIds(prev => ({ ...prev, [item.id]: false }));
      }, 2500);
    }
  };

  const handleRemoveItem = (index: number) => {
    const updatedItems = currentQuote.items.filter((_, i) => i !== index).map((item, idx) => ({
      ...item,
      itemNumber: idx + 1
    }));
    const totals = recalculateQuote(updatedItems);

    setCurrentQuote(prev => ({
      ...prev,
      items: updatedItems,
      ...totals
    }));
  };

  const quoteTaxes = currentQuote.totalTaxes ??
    currentQuote.items.reduce((acc, item) => {
      const taxRate = item.taxPercent ?? globalTax ?? 0;
      return acc + (item.totalPrice * (taxRate / (100 + taxRate)));
    }, 0);

  const quoteShipping = currentQuote.totalShipping ??
    currentQuote.items.reduce((acc, item) => acc + ((item.shippingCost ?? globalShipping ?? 0) * item.quantity), 0);

  return (
    <div className="space-y-6">

      {/* Header Bar with Action Buttons */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg md:text-xl font-bold text-slate-900">Montador de Proposta Comercial</h1>
            <span className="px-2.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold rounded-lg font-mono">
              {currentQuote.code}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Preencha os dados do cliente, ajuste custo, frete, alíquota de impostos e margem de lucro da Infodesk.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-nowrap">
          <button
            onClick={() => onOpenWebSearch()}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-xs whitespace-nowrap"
            title="Buscar preços em fornecedores na Web"
          >
            <Search className="w-3.5 h-3.5 text-sky-600" />
            <span>Pesquisar Preço Web</span>
          </button>

          <button
            onClick={onSave}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-xs whitespace-nowrap"
            title="Salvar alterações do orçamento"
          >
            <Save className="w-3.5 h-3.5 text-emerald-600" />
            <span>Salvar</span>
          </button>

          <button
            onClick={onPreview}
            className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 whitespace-nowrap"
            title="Visualizar documento pronto"
          >
            <Eye className="w-4 h-4" />
            <span>Ver Documento</span>
          </button>

          <button
            onClick={onSendEmail}
            className="px-3.5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 whitespace-nowrap"
            title="Disparar proposta por e-mail"
          >
            <Send className="w-4 h-4" />
            <span>Disparar E-mail</span>
          </button>
        </div>
      </div>

      {/* Financial Summary Dashboard (5 Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Custo Produtos</span>
            <DollarSign className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-base font-bold text-slate-900 font-mono">
            R$ {currentQuote.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-slate-400">Preço de compra fornecedor</span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Frete Total</span>
            <Truck className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-base font-bold text-slate-900 font-mono">
            R$ {quoteShipping.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-amber-600 font-medium">Logística e entrega</span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Impostos ({globalTax}%)</span>
            <Receipt className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-base font-bold text-slate-900 font-mono">
            R$ {quoteTaxes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-indigo-600 font-medium">Simples / ICMS embutido</span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Lucro Líquido Real</span>
            <Sparkles className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-base font-bold text-emerald-600 font-mono">
            R$ {currentQuote.totalProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-emerald-600/90 font-semibold">
            Margem real: {currentQuote.averageMargin.toFixed(1)}%
          </span>
        </div>

        <div className="bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-200 p-4 rounded-2xl shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-sky-800 mb-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Total Proposta</span>
            <Calculator className="w-4 h-4 text-sky-600" />
          </div>
          <p className="text-lg font-extrabold text-slate-900 font-mono">
            R$ {currentQuote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-sky-700 font-medium">Valor final enviado ao cliente</span>
        </div>

      </div>

      {/* Fast Pricing Composition Controls — compact single bar */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-3.5 shadow-xs flex flex-wrap items-center gap-4">

        {/* Formula label */}
        <span className="text-[11px] text-slate-400 hidden lg:inline-block whitespace-nowrap">
          Fórmula: <strong className="text-slate-600">(Custo + Frete) × (1 + Margem%) × (1 + Imposto%)</strong>
        </span>

        <div className="flex-1 h-px bg-slate-100 hidden lg:block" />

        {/* Margem de Lucro — editável */}
        <div className="flex items-center gap-2 shrink-0">
          <Percent className="w-3.5 h-3.5 text-sky-600 shrink-0" />
          <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">Margem de Lucro:</span>
          <div className="flex items-center bg-sky-50 border border-sky-200 rounded-lg overflow-hidden">
            <input
              type="number"
              min={0}
              max={200}
              step={1}
              value={globalMarkup}
              onChange={(e) => handleApplyGlobalMarkup(parseFloat(e.target.value) || 0)}
              className="w-16 bg-transparent px-2 py-1 text-xs font-bold text-sky-800 font-mono focus:outline-none text-center"
            />
            <span className="text-xs font-bold text-sky-600 pr-2">%</span>
          </div>
        </div>

        {/* Alíquota de Imposto — somente leitura (vem das configurações) */}
        <div className="flex items-center gap-2 shrink-0">
          <Receipt className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">Imposto (Simples):</span>
          <span className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-700 font-mono">
            {globalTax}%
          </span>
          <span className="text-[10px] text-slate-400 hidden sm:inline">fixo nas configurações</span>
        </div>

        {/* Frete por Unidade */}
        <div className="flex items-center gap-2 shrink-0">
          <Truck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">Frete/Un.:</span>
          <div className="flex items-center bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
            <span className="text-[10px] text-amber-600 pl-2">R$</span>
            <input
              type="number"
              step="1"
              value={globalShipping}
              onChange={(e) => handleApplyGlobalShipping(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="w-16 bg-transparent px-2 py-1 text-xs font-bold text-amber-800 font-mono focus:outline-none text-center"
            />
          </div>
          <button
            type="button"
            onClick={() => handleApplyGlobalShipping(globalShipping)}
            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold transition whitespace-nowrap"
          >
            Aplicar em Todos
          </button>
        </div>

        <div className="w-px h-6 bg-slate-200 hidden md:block shrink-0" />

        {/* Puxar do Catálogo */}
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
          >
            <option value="">📦 Puxar do catálogo Infodesk...</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} — R$ {p.costPrice.toFixed(2)} ({p.category})
              </option>
            ))}
          </select>
          <button
            onClick={handleAddFromCatalog}
            disabled={!selectedProductId}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-sky-700 border border-slate-300 rounded-xl text-xs font-semibold transition disabled:opacity-40 whitespace-nowrap flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Inserir</span>
          </button>
        </div>

      </div>

      {/* Client Destination Info */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Building className="w-4 h-4 text-sky-600" />
          Dados do Solicitante & Identificação
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Empresa / Órgão (Ao)</label>
            <input
              type="text"
              value={currentQuote.clientCompany}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, clientCompany: e.target.value }))}
              placeholder="Ex: Ao CNC ou Ministério da Saúde"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">A/C (Nome do Responsável)</label>
            <input
              type="text"
              value={currentQuote.contactPerson}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, contactPerson: e.target.value }))}
              placeholder="Ex: A/C Sra. Alexandra"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">E-mail para Retorno</label>
            <input
              type="email"
              value={currentQuote.clientEmail}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, clientEmail: e.target.value }))}
              placeholder="Ex: alexandraoliveira@cnc.org.br"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Código / Referência</label>
            <input
              type="text"
              value={currentQuote.code}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, code: e.target.value }))}
              placeholder="Ex: CNC 280826"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-mono font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Data de Emissão</label>
            <input
              type="text"
              value={currentQuote.date}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, date: e.target.value }))}
              placeholder="Ex: 28 de agosto de 2026"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Cidade de Emissão</label>
            <input
              type="text"
              value={currentQuote.city}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, city: e.target.value }))}
              placeholder="Ex: Brasília"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-sky-600" />
              <span>Local de Entrega / Destino</span>
            </label>
            <input
              type="text"
              value={currentQuote.deliveryLocation || ''}
              onChange={(e) => {
                const loc = e.target.value;
                setCurrentQuote(prev => ({
                  ...prev,
                  deliveryLocation: loc,
                  shippingTerms: `Frete incluso p/ ${loc || 'sua localidade'}.`
                }));
              }}
              placeholder="Ex: São Paulo, Brasília, Rio de Janeiro"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-medium"
            />
          </div>
        </div>
      </div>

      {/* Items & Prices Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-bold text-slate-900">Grade de Produtos & Preços da Proposta</h3>
          </div>
          <button
            onClick={handleAddItem}
            className="px-3.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar Linha</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="p-3 w-12 text-center">Item</th>
                <th className="p-3 min-w-[280px]">Descrição Detalhada do Produto</th>
                <th className="p-3 w-16 text-center">Qtd.</th>
                <th className="p-3 w-16 text-center">Un.</th>
                <th className="p-3 w-24 text-right">Custo (R$)</th>
                <th className="p-3 w-24 text-right">Frete (R$)</th>
                <th className="p-3 w-24 text-center">Margem %</th>
                <th className="p-3 w-28 text-right">Preço Unit. (R$)</th>
                <th className="p-3 w-28 text-right">Preço Total (R$)</th>
                <th className="p-3 w-12 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentQuote.items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-slate-400">
                    Nenhum produto adicionado. Use o botão acima ou selecione um e-mail no Inbox para carregar itens com IA.
                  </td>
                </tr>
              ) : (
                currentQuote.items.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition group">

                    <td className="p-3 text-center font-bold text-slate-500">
                      {item.itemNumber}
                    </td>

                    <td className="p-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        {item.imageUrl && (
                          <div className="w-10 h-10 rounded-lg border border-slate-200 bg-white p-0.5 shrink-0 overflow-hidden shadow-2xs">
                            <img 
                              src={item.imageUrl} 
                              alt={item.name} 
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        <div className="flex-1">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                            placeholder="Descrição padronizada do produto"
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-sky-500"
                          />
                        </div>
                      </div>

                      {/* Part Number & NCM Badges (Clean codes) */}
                      <div className="flex flex-wrap items-center gap-2 text-[10px]">
                        {item.partNumber && (
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-mono font-bold">
                            P/N: {item.partNumber}
                          </span>
                        )}
                        {item.ncm && (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-mono font-bold">
                            NCM: {item.ncm}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenWebSearch(item.rawSearchQuery || [item.name, item.description].filter(Boolean).join(' - '), idx)}
                            className="inline-flex items-center gap-1 text-[11px] text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2 py-0.5 rounded font-bold transition"
                            title="Buscar na Web com todos os dados do e-mail, padronizar descrição, Part Number, NCM e foto"
                          >
                            <Sparkles className="w-3 h-3 text-sky-600" />
                            <span>Buscar / Padronizar com IA</span>
                          </button>

                          <a
                            href={item.sourceUrl || `https://lista.mercadolivre.com.br/${encodeURIComponent((item.rawSearchQuery || item.name).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, '-'))}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 hover:underline font-medium"
                            title="Abrir anúncio ou pesquisa do produto na web"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Ver na Web</span>
                          </a>
                        </div>

                        {onSaveToCatalog && (
                          <button
                            type="button"
                            onClick={() => handleSaveItemToCatalog(item)}
                            className={`text-[10px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded border transition ${savedCatalogIds[item.id]
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                              }`}
                          >
                            {savedCatalogIds[item.id] ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>Salvo no Catálogo!</span>
                              </>
                            ) : (
                              <>
                                <BookmarkPlus className="w-3 h-3 text-sky-600" />
                                <span>Salvar no Catálogo</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="p-3">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-center font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </td>

                    <td className="p-3">
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-center text-slate-700 focus:outline-none focus:border-sky-500"
                      />
                    </td>

                    <td className="p-3">
                      <input
                        type="number"
                        step="0.01"
                        value={item.costPrice}
                        onChange={(e) => handleItemChange(idx, 'costPrice', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-right font-mono text-slate-700 focus:outline-none focus:border-sky-500"
                      />
                    </td>

                    {/* Frete Unitário */}
                    <td className="p-3">
                      <input
                        type="number"
                        step="1"
                        value={item.shippingCost ?? globalShipping}
                        onChange={(e) => handleItemChange(idx, 'shippingCost', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-right font-mono text-amber-700 font-semibold focus:outline-none focus:border-amber-500"
                      />
                    </td>

                    {/* Margem Lucro */}
                    <td className="p-3">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.5"
                          value={item.markupPercent ?? globalMarkup}
                          onChange={(e) => handleItemChange(idx, 'markupPercent', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-1.5 pr-4 py-1.5 text-xs text-center font-bold text-sky-700 focus:outline-none focus:border-sky-500"
                        />
                        <span className="absolute right-1 top-2 text-[10px] text-slate-400">%</span>
                      </div>
                    </td>

                    {/* Preço Unitário */}
                    <td className="p-3">
                      <input
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-right font-bold text-slate-900 font-mono focus:outline-none focus:border-sky-500"
                      />
                    </td>

                    <td className="p-3 text-right font-bold text-emerald-700 font-mono text-xs whitespace-nowrap">
                      R$ {item.totalPrice.toFixed(2)}
                    </td>

                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleRemoveItem(idx)}
                        className="text-slate-400 hover:text-red-500 p-1 rounded transition"
                        title="Remover Item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
            {currentQuote.items.length > 0 && (
              <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-xs">
                <tr>
                  <td colSpan={7} className="p-3 text-right text-slate-600 uppercase tracking-wider text-[11px]">
                    Total Geral da Proposta:
                  </td>
                  <td colSpan={2} className="p-3 text-right text-emerald-700 text-sm font-mono font-extrabold">
                    R$ {currentQuote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Commercial Terms & Conditions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-sky-600" />
          Condições Gerais de Fornecimento (Padrão Infodesk)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-600 font-medium mb-1">Validade da Proposta</label>
            <input
              type="text"
              value={currentQuote.validityDays}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, validityDays: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">Condições de Pagamento</label>
            <input
              type="text"
              value={currentQuote.paymentTerms}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, paymentTerms: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-slate-600 font-medium">Prazo de Entrega (Dias Úteis)</label>
              <span className="text-[11px] font-bold text-sky-700 font-mono">
                {extractDeliveryDaysNumber(currentQuote.deliveryDays)} dias
              </span>
            </div>
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              {[3, 5, 7, 10, 15, 20, 30].map(days => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setCurrentQuote(prev => ({
                    ...prev,
                    deliveryDays: formatDeliveryDaysText(days)
                  }))}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${
                    extractDeliveryDaysNumber(currentQuote.deliveryDays) === days
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  {days}d
                </button>
              ))}
              <div className="relative inline-block w-16">
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={extractDeliveryDaysNumber(currentQuote.deliveryDays)}
                  onChange={(e) => {
                    const d = parseInt(e.target.value, 10) || 1;
                    setCurrentQuote(prev => ({
                      ...prev,
                      deliveryDays: formatDeliveryDaysText(d)
                    }));
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-0.5 text-center text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 font-medium">
              "{currentQuote.deliveryDays || formatDeliveryDaysText(10)}"
            </p>
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">Termos de Garantia</label>
            <input
              type="text"
              value={currentQuote.warrantyTerms}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, warrantyTerms: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-slate-600 font-medium mb-1 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-sky-600" />
              <span>Cláusula de Frete na Proposta</span>
            </label>
            <input
              type="text"
              value={currentQuote.shippingTerms || `Frete incluso p/ ${currentQuote.deliveryLocation || 'Brasília'}.`}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, shippingTerms: e.target.value }))}
              placeholder="Ex: Frete incluso p/ São Paulo."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-sky-500 font-medium"
            />
          </div>
        </div>

        <div>
          <label className="block text-slate-600 font-medium mb-1 text-xs">Parágrafo de Abertura da Proposta</label>
          <textarea
            rows={2}
            value={currentQuote.openingText}
            onChange={(e) => setCurrentQuote(prev => ({ ...prev, openingText: e.target.value }))}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

    </div>
  );
};
