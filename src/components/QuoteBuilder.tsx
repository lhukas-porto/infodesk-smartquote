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
  MapPin,
  Users,
  UserCheck,
  UserPlus,
  Edit3,
  FileSpreadsheet
} from 'lucide-react';
import { ClientCompany, ClientContact, CompanySettings, Product, Quote, QuoteItem } from '../types';
import { formatDeliveryDaysText, extractDeliveryDaysNumber, calculateCommercialUnitPrice, formatCompanyPrefix, formatContactPerson, isExactProductUrl, generateQuoteCode } from '../utils/aiEmailParser';
import { getClientCompanies, saveClientCompanies, registerOrUpdateClient } from '../utils/storage';
import { ClientManagementModal } from './ClientManagementModal';
import { exportCostSheetToExcel } from '../utils/excelExport';

interface QuoteBuilderProps {
  currentQuote: Quote;
  setCurrentQuote: React.Dispatch<React.SetStateAction<Quote>>;
  products: Product[];
  settings: CompanySettings;
  onPreview: () => void;
  onSave: () => void;
  onSendEmail: () => void;
  onOpenWebSearch: (query?: string, itemIdx?: number | null, existingItem?: Partial<QuoteItem>) => void;
  onSaveToCatalog?: (prod: Product) => void;
  clientCompanies?: ClientCompany[];
  onSaveCompanies?: (companies: ClientCompany[]) => void;
  onDeleteCompany?: (companyId: string) => void;
  onDeleteContact?: (contactId: string, companyId: string) => void;
  onOpenEmailScanner?: () => void;
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
  onSaveToCatalog,
  clientCompanies: propsClientCompanies,
  onSaveCompanies: propsOnSaveCompanies,
  onDeleteCompany: propsOnDeleteCompany,
  onDeleteContact: propsOnDeleteContact,
  onOpenEmailScanner: propsOnOpenEmailScanner
}) => {
  const [globalMarkup, setGlobalMarkup] = useState<number>(settings.defaultMarkupPercent || 35);
  const [globalTax, setGlobalTax] = useState<number>(settings.defaultTaxPercent || 6);
  const [globalShipping, setGlobalShipping] = useState<number>(settings.defaultShippingCost || 0);

  const [savedCatalogIds, setSavedCatalogIds] = useState<Record<string, boolean>>({});
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [localClientCompanies, setLocalClientCompanies] = useState<ClientCompany[]>(() => getClientCompanies());
  const [isClientsModalOpen, setIsClientsModalOpen] = useState(false);

  const clientCompanies = propsClientCompanies || localClientCompanies;

  const handleUpdateCompanies = (updated: ClientCompany[]) => {
    if (propsOnSaveCompanies) {
      propsOnSaveCompanies(updated);
    } else {
      saveClientCompanies(updated);
      setLocalClientCompanies(updated);
    }
  };

  React.useEffect(() => {
    if (settings.defaultMarkupPercent !== undefined) setGlobalMarkup(settings.defaultMarkupPercent);
    if (settings.defaultTaxPercent !== undefined) setGlobalTax(settings.defaultTaxPercent);
    if (settings.defaultShippingCost !== undefined) setGlobalShipping(settings.defaultShippingCost);
  }, [settings.defaultMarkupPercent, settings.defaultTaxPercent, settings.defaultShippingCost]);

  const persistClientDetails = () => {
    if (currentQuote.clientCompany && currentQuote.contactPerson) {
      const updated = registerOrUpdateClient(
        currentQuote.clientCompany,
        currentQuote.contactPerson,
        currentQuote.clientEmail,
        currentQuote.clientPhone,
        currentQuote.deliveryLocation
      );
      handleUpdateCompanies(updated);
    }
  };

  const persistAndProceed = (action: () => void) => {
    persistClientDetails();
    action();
  };

  const cleanCompName = (currentQuote.clientCompany || '').replace(/^(ao|à|a|para)\s+/i, '').trim().toLowerCase();
  const matchedCompany = clientCompanies.find(c =>
    cleanCompName && (
      c.name.toLowerCase() === cleanCompName ||
      c.name.toLowerCase().includes(cleanCompName) ||
      cleanCompName.includes(c.name.toLowerCase())
    )
  );

  const cleanContactName = (currentQuote.contactPerson || '')
    .replace(/^a\/c\s*/i, '')
    .replace(/^(sr\.|sra\.|srta\.|dr\.|dra\.)\s+/i, '')
    .trim();

  const isBuyerLinkedToCompany = Boolean(
    matchedCompany &&
    cleanContactName &&
    matchedCompany.contacts.some(ct =>
      ct.name.toLowerCase().includes(cleanContactName.toLowerCase()) ||
      cleanContactName.toLowerCase().includes(ct.name.toLowerCase())
    )
  );

  const [linkNotification, setLinkNotification] = useState<string | null>(null);

  const handleLinkBuyerToCompany = () => {
    if (!currentQuote.clientCompany.trim() || !currentQuote.contactPerson.trim()) return;
    const updated = registerOrUpdateClient(
      currentQuote.clientCompany,
      currentQuote.contactPerson,
      currentQuote.clientEmail,
      currentQuote.clientPhone,
      currentQuote.deliveryLocation
    );
    handleUpdateCompanies(updated);
    setLinkNotification(`Comprador "${cleanContactName}" vinculado à "${matchedCompany?.name || currentQuote.clientCompany}" com sucesso!`);
    setTimeout(() => setLinkNotification(null), 4000);
  };

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
      totalPrice: unitPrice,
      showImage: false
    };

    const updatedItems = [...currentQuote.items, newItem];
    const totals = recalculateQuote(updatedItems);

    setCurrentQuote(prev => ({
      ...prev,
      items: updatedItems,
      ...totals
    }));
  };

  const handleExportExcel = async () => {
    try {
      await exportCostSheetToExcel(currentQuote);
    } catch (err) {
      console.error('Erro ao exportar planilha de custos para Excel:', err);
    }
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
            <h1 className="text-lg md:text-xl font-bold text-slate-900">Elaboração de Cotação Comercial</h1>
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
            onClick={() => persistAndProceed(onSave)}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-xs whitespace-nowrap"
            title="Salvar alterações do orçamento"
          >
            <Save className="w-3.5 h-3.5 text-emerald-600" />
            <span>Salvar</span>
          </button>

          <button
            onClick={() => persistAndProceed(onPreview)}
            className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 whitespace-nowrap"
            title="Visualizar documento pronto"
          >
            <Eye className="w-4 h-4" />
            <span>Ver Documento</span>
          </button>

          <button
            onClick={() => persistAndProceed(onSendEmail)}
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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building className="w-4 h-4 text-sky-600" />
            <span>Dados do Solicitante & Identificação</span>
          </h3>

          <button
            type="button"
            onClick={() => setIsClientsModalOpen(true)}
            className="text-xs font-semibold text-sky-700 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-xl border border-sky-200 transition flex items-center gap-1.5 shadow-2xs active:scale-95"
          >
            <Users className="w-3.5 h-3.5 text-sky-600" />
            <span>Agenda de Compradores & Empresas ({clientCompanies.length})</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-600">Empresa / Órgão</label>
              <div className="flex items-center gap-1">
                {matchedCompany && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mr-1">
                    ✓ Cadastrada
                  </span>
                )}
                <span className="text-[10px] text-slate-400 font-medium">Prefixo:</span>
                <button
                  type="button"
                  onClick={() => {
                    const current = currentQuote.clientCompany.replace(/^(ao|à|a|para)\s+/i, '').trim();
                    setCurrentQuote(prev => ({ ...prev, clientCompany: `À ${current}` }));
                  }}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition ${
                    currentQuote.clientCompany.trim().startsWith('À')
                      ? 'bg-sky-600 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                  title="Mudar para 'À [Empresa]'"
                >
                  À
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const current = currentQuote.clientCompany.replace(/^(ao|à|a|para)\s+/i, '').trim();
                    setCurrentQuote(prev => ({ ...prev, clientCompany: `Ao ${current}` }));
                  }}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition ${
                    currentQuote.clientCompany.trim().startsWith('Ao')
                      ? 'bg-sky-600 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                  title="Mudar para 'Ao [Órgão/Condomínio]'"
                >
                  Ao
                </button>
              </div>
            </div>
            <input
              type="text"
              list="registered-companies-list"
              value={currentQuote.clientCompany}
              onChange={(e) => {
                const val = e.target.value;
                setCurrentQuote(prev => ({ ...prev, clientCompany: val }));
              }}
              placeholder="Ex: À UBEC ou Ao CNC"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-medium"
            />
            <datalist id="registered-companies-list">
              {clientCompanies.map(c => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>

            {/* Quick Companies Chips */}
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <span className="text-[10px] text-slate-400 font-medium">Atalhos:</span>
              {clientCompanies.slice(0, 4).map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    const formatted = formatCompanyPrefix(c.name);
                    setCurrentQuote(prev => ({
                      ...prev,
                      clientCompany: formatted,
                      deliveryLocation: c.defaultDeliveryLocation || prev.deliveryLocation,
                      code: generateQuoteCode(c.name)
                    }));
                  }}
                  className={`text-[10.5px] px-2 py-0.5 rounded-lg border transition font-medium ${cleanCompName && c.name.toLowerCase().includes(cleanCompName)
                    ? 'bg-sky-100 text-sky-800 border-sky-300 font-bold'
                    : 'bg-slate-50 hover:bg-sky-50 text-slate-700 border-slate-200'
                    }`}
                >
                  {c.name.split('—')[0].split('-')[0].trim()}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-xs font-medium text-slate-600">A/C (Nome do Comprador)</label>
            <input
              type="text"
              value={currentQuote.contactPerson}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, contactPerson: e.target.value }))}
              placeholder="Ex: A/C Sr. Alex ou A/C Srta. Alexandra"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-medium"
            />

            {/* If matched company has buyers, show them right here! */}
            {matchedCompany && matchedCompany.contacts.length > 0 && (
              <div className="p-2.5 bg-sky-50/70 border border-sky-200 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-sky-900 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-sky-600" />
                    Compradores salvos da {matchedCompany.name.split('—')[0].split('-')[0].trim()}:
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsClientsModalOpen(true)}
                    className="text-[10px] font-semibold text-sky-700 hover:text-sky-900 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Cadastrar outro</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {matchedCompany.contacts.map((contact) => {
                    const isSelected = currentQuote.contactPerson.toLowerCase().includes(contact.name.toLowerCase());
                    return (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => {
                          const formattedContact = formatContactPerson(contact.name);
                          setCurrentQuote(prev => ({
                            ...prev,
                            contactPerson: formattedContact,
                            clientEmail: (contact.email || prev.clientEmail || '').toLowerCase().trim(),
                            clientPhone: contact.phone || prev.clientPhone
                          }));
                        }}
                        className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 shadow-2xs ${isSelected
                          ? 'bg-sky-600 text-white font-semibold shadow-xs'
                          : 'bg-white hover:bg-sky-100 text-slate-800 border border-slate-200 hover:border-sky-300'
                          }`}
                        title={`E-mail: ${contact.email} | Telefone: ${contact.phone || 'Sem telefone'}`}
                      >
                        <UserCheck className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-sky-600'}`} />
                        <span>{contact.title || 'Sr(a).'} {contact.name}</span>
                        {contact.phone && <span className="text-[10px] opacity-80 font-normal">📞</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">E-mail para Retorno</label>
            <input
              type="email"
              value={currentQuote.clientEmail}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, clientEmail: e.target.value.toLowerCase() }))}
              placeholder="Ex: alexandraoliveira@cnc.org.br"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-medium lowercase"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Telefone do Contato (Opcional)</label>
            <input
              type="text"
              value={currentQuote.clientPhone || ''}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, clientPhone: e.target.value }))}
              placeholder="Ex: (61) 3403-2944"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-medium"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-600">Código / Referência</label>
              <button
                type="button"
                onClick={() => {
                  setCurrentQuote(prev => ({
                    ...prev,
                    code: generateQuoteCode(prev.clientCompany)
                  }));
                }}
                className="text-[10.5px] text-sky-600 hover:text-sky-800 font-bold flex items-center gap-1 transition cursor-pointer"
                title="Regerar código baseado no nome da empresa e data (Ex: UBEC 090926)"
              >
                <span>🔄 Sugerir Código</span>
              </button>
            </div>
            <input
              type="text"
              value={currentQuote.code}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, code: e.target.value }))}
              placeholder="Ex: UBEC 090926"
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-sky-600" />
                <span>Localidade do Frete / Destino da Entrega</span>
              </label>
              {matchedCompany?.locations && matchedCompany.locations.length > 1 && (
                <span className="text-[10px] text-sky-700 font-semibold bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                  {matchedCompany.locations.length} destinos de frete
                </span>
              )}
            </div>

            <input
              type="text"
              list="company-locations-datalist"
              value={currentQuote.deliveryLocation || ''}
              onChange={(e) => {
                const loc = e.target.value;
                setCurrentQuote(prev => ({
                  ...prev,
                  deliveryLocation: loc,
                  shippingTerms: `Frete incluso p/ ${loc || 'sua localidade'}.`
                }));
              }}
              placeholder="Ex: Brasília, Coronel Fabriciano, Joinville..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-medium"
            />
            <datalist id="company-locations-datalist">
              {(matchedCompany?.locations || []).map(loc => (
                <option key={loc} value={loc} />
              ))}
            </datalist>

            {/* Quick Chips de Localidades de Frete da Empresa */}
            {matchedCompany?.locations && matchedCompany.locations.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                <span className="text-[10px] text-slate-400 font-medium">Cidades / Destinos de Frete da Empresa:</span>
                {matchedCompany.locations.map(loc => {
                  const isSelected = (currentQuote.deliveryLocation || '').toLowerCase().trim() === loc.toLowerCase().trim();
                  return (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => {
                        setCurrentQuote(prev => ({
                          ...prev,
                          deliveryLocation: loc,
                          shippingTerms: `Frete incluso p/ ${loc}.`
                        }));
                      }}
                      className={`text-[10.5px] px-2 py-0.5 rounded-lg border transition flex items-center gap-1 font-medium ${
                        isSelected
                          ? 'bg-sky-600 text-white border-sky-600 font-bold shadow-2xs'
                          : 'bg-white hover:bg-sky-50 text-slate-700 border-slate-200 hover:border-sky-300'
                      }`}
                    >
                      <MapPin className={`w-3 h-3 ${isSelected ? 'text-white' : 'text-sky-500'}`} />
                      <span>{loc}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Barra de Vínculo: Dizer que o comprador tal pertence à empresa tal */}
        {currentQuote.clientCompany && currentQuote.contactPerson && (
          <div className="p-3.5 bg-gradient-to-r from-sky-50/90 via-indigo-50/50 to-slate-50 border border-sky-200/90 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-2xs mt-1">
            <div className="flex items-center gap-2 text-xs">
              <Building className="w-4 h-4 text-sky-600 shrink-0" />
              <span className="text-slate-700">
                Vínculo: Comprador <strong className="text-slate-900 font-bold">{cleanContactName || currentQuote.contactPerson}</strong> pertence à empresa <strong className="text-sky-800 font-bold">{matchedCompany?.name || currentQuote.clientCompany}</strong>
              </span>
              {isBuyerLinkedToCompany ? (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span>Vínculo Salvo na Agenda</span>
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-full border border-amber-300 flex items-center gap-1">
                  <span>Novo vínculo detectado</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!isBuyerLinkedToCompany && (
                <button
                  type="button"
                  onClick={handleLinkBuyerToCompany}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-2xs transition flex items-center gap-1.5 active:scale-95"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Salvar Vínculo na Agenda</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsClientsModalOpen(true)}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-2xs"
                title="Abrir agenda completa para editar empresas e compradores"
              >
                <Edit3 className="w-3.5 h-3.5 text-sky-600" />
                <span>Editar Empresa / Comprador</span>
              </button>
            </div>
          </div>
        )}

        {linkNotification && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{linkNotification}</span>
          </div>
        )}
      </div>

      {/* Items & Prices Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-bold text-slate-900">Grade de Produtos & Preços da Proposta</h3>
            {currentQuote.items && currentQuote.items.length > 3 && (
              <span className="text-[10.5px] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold">
                {currentQuote.items.length} itens identificados
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {currentQuote.items && currentQuote.items.length > 3 && (
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                title="Gerar e salvar arquivo Excel (.xlsx) com a tabela completa de custos e precificação"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Gerar Planilha Excel (.xlsx)</span>
              </button>
            )}
            <button
              onClick={handleAddItem}
              className="px-3.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Linha</span>
            </button>
          </div>
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
                          <textarea
                            rows={Math.max(1, Math.min(4, Math.ceil((item.name || '').length / 45)))}
                            value={item.name}
                            onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                            placeholder="Descrição padronizada do produto"
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-sky-500 resize-y leading-relaxed"
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

                      {/* Miniatura da Foto e Controle de Inclusão na Proposta */}
                      {item.imageUrl && (
                        <div className="flex items-center gap-2.5 p-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-7 h-7 object-contain bg-white rounded border border-slate-200 p-0.5 shrink-0"
                          />
                          <label className="flex items-center gap-1.5 text-[10.5px] font-medium text-slate-700 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!item.showImage}
                              onChange={(e) => handleItemChange(idx, 'showImage', e.target.checked)}
                              className="rounded text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                            />
                            <span>Usar foto na proposta (altura 4cm)</span>
                          </label>
                          {item.showImage && (
                            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-bold">
                              Ativa na impressão
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenWebSearch(item.rawSearchQuery || [item.name, item.description].filter(Boolean).join(' - '), idx, item)}
                            className="inline-flex items-center gap-1 text-[11px] text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2 py-0.5 rounded font-bold transition"
                            title="Buscar na Web com todos os dados do e-mail, padronizar descrição, Part Number, NCM e foto"
                          >
                            <Sparkles className="w-3 h-3 text-sky-600" />
                            <span>Buscar / Padronizar com IA</span>
                          </button>

                          {item.sourceUrl && isExactProductUrl(item.sourceUrl) ? (
                            <a
                              href={item.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-900 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-bold transition"
                              title={`Abrir página exata do produto em ${item.supplier || 'loja'}`}
                            >
                              <ExternalLink className="w-3 h-3 text-emerald-600" />
                              <span>Link Exato</span>
                            </a>
                          ) : (
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(item.rawSearchQuery || item.name)}&tbm=shop`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 hover:underline font-medium"
                              title="Buscar preços deste produto no Google Shopping"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Buscar Ofertas (Shopping)</span>
                            </a>
                          )}
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
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${extractDeliveryDaysNumber(currentQuote.deliveryDays) === days
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

      {/* Barra de Ações Finais da Cotação */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-left w-full sm:w-auto">
          <p className="text-xs text-slate-500 font-medium">
            Total da Cotação: <strong className="text-slate-900 font-mono text-base ml-1">R$ {currentQuote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
          </p>
          <p className="text-[11px] text-slate-400">
            {currentQuote.items.length} {currentQuote.items.length === 1 ? 'item cotado' : 'itens cotados'} • Margem média de {currentQuote.averageMargin.toFixed(1)}%
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={() => persistAndProceed(onSave)}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <Save className="w-4 h-4 text-slate-600" />
            <span>Salvar Rascunho</span>
          </button>

          <button
            type="button"
            onClick={() => persistAndProceed(onPreview)}
            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm shadow-sky-600/20 cursor-pointer"
          >
            <Eye className="w-4 h-4" />
            <span>Visualizar Proposta Final & PDF</span>
          </button>

          <button
            type="button"
            onClick={() => persistAndProceed(onSendEmail)}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm shadow-emerald-600/20 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Enviar por E-mail</span>
          </button>
        </div>
      </div>

      {/* Modal de Gestão de Empresas e Compradores */}
      <ClientManagementModal
        isOpen={isClientsModalOpen}
        onClose={() => setIsClientsModalOpen(false)}
        companies={clientCompanies}
        onSaveCompanies={handleUpdateCompanies}
        onDeleteCompany={propsOnDeleteCompany}
        onDeleteContact={propsOnDeleteContact}
        onOpenEmailScanner={propsOnOpenEmailScanner}
        onSelectBuyerForQuote={(compName, contact) => {
          const formattedCompany = formatCompanyPrefix(compName);
          const formattedContact = formatContactPerson(contact.name);
          setCurrentQuote(prev => ({
            ...prev,
            clientCompany: formattedCompany,
            contactPerson: formattedContact,
            clientEmail: (contact.email || prev.clientEmail || '').toLowerCase().trim(),
            clientPhone: contact.phone || prev.clientPhone,
            code: generateQuoteCode(compName)
          }));
        }}
      />

    </div>
  );
};
