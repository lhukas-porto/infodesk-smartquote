import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  ChevronDown,
  ChevronUp,
  Package,
  TrendingUp,
  Receipt,
  Plus,
  Check,
  Link2,
  Layers,
  List,
  RotateCcw,
  Trash2,
  History,
  Copy,
  Tag,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  Boxes,
  Truck,
  Store,
  FileText,
  Scissors,
  Camera,
  Image as ImageIcon
} from 'lucide-react';
import { Quote, ProcurementItem, Product, CompanySettings } from '../types';
import { 
  getRegisteredPaymentMethods, 
  saveRegisteredPaymentMethod,
  getDirectPurchases,
  saveOrUpdateDirectPurchase,
  deleteDirectPurchaseItem,
  getRegisteredUnits,
  getClientCompanies,
  getProducts,
  savePurchasedProcurementRecord,
  findPurchasedProcurementRecord,
  getPurchasedProcurementRecords,
  removePurchasedProcurementRecord,
  getProcurementSplits,
  saveProcurementSplit,
  removeProcurementSplit,
  getSettings,
  findProductImageInCache,
  saveProductImageToCache
} from '../utils/storage';
import { normalizeSearchText, extractStoreNameFromUrl, formatCompanyPrefix } from '../utils/aiEmailParser';
import { fetchDirectPurchasesFromSupabase } from '../services/supabase';
import { WebImagePickerModal } from './WebImagePickerModal';
import { autoFindProductImage } from '../services/imageSearchService';

interface ProcurementViewProps {
  quotes: Quote[];
  settings?: CompanySettings;
  onUpdateQuote: (quote: Quote) => void;
  onOpenQuote?: (quote: Quote) => void;
}

type PeriodOption = 'all' | 'today' | 'yesterday' | '7days' | '30days' | 'this_month' | 'last_month' | 'custom';
type ViewModeOption = 'items' | 'quotes' | 'suppliers' | 'reference';

function formatDatePtBr(dateStr?: string | null): string {
  if (!dateStr) return '';
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return clean;
}

interface ProductReferenceSummary {
  normalizedKey: string;
  name: string;
  partNumber?: string;
  ncm?: string;
  imageUrl?: string;
  unit: string;
  lastPurchasedAt?: string;
  lastUnitCost: number;
  minUnitCost: number;
  maxUnitCost: number;
  lastSupplier?: string;
  lastPurchaseUrl?: string;
  lastPaymentMethod?: string;
  lastClient?: string;
  totalQuantity: number;
  purchaseCount: number;
  allPurchases: {
    date: string;
    unitCost: number;
    totalCost: number;
    quantity: number;
    supplier?: string;
    client: string;
    purchaseUrl?: string;
    paymentMethod?: string;
    quoteCode: string;
  }[];
}

export const ProcurementView: React.FC<ProcurementViewProps> = ({
  quotes,
  settings,
  onUpdateQuote,
  onOpenQuote
}) => {
  const defaultTax = settings?.defaultTaxPercent ?? getSettings().defaultTaxPercent ?? 9.1;
  // 1. Filtros Avançados
  const [statusFilter, setStatusFilter] = useState<'pending' | 'purchased' | 'all'>('pending');
  const [periodFilter, setPeriodFilter] = useState<PeriodOption>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // 2. Modos de Exibição: Itens Individuais, Agrupado por Proposta, ou Referência de Preços Pagos
  const [viewMode, setViewMode] = useState<ViewModeOption>('items');
  const [collapsedQuotes, setCollapsedQuotes] = useState<Record<string, boolean>>({});
  const [collapsedSuppliers, setCollapsedSuppliers] = useState<Record<string, boolean>>({});
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // 3. Compras Diretas / Avulsas (independentes de orçamento)
  const [directPurchases, setDirectPurchases] = useState<ProcurementItem[]>(() => getDirectPurchases());
  const [isDirectPurchaseModalOpen, setIsDirectPurchaseModalOpen] = useState(false);
  const [stockProducts, setStockProducts] = useState<Product[]>(() => getProducts());
  const [selectedStockProduct, setSelectedStockProduct] = useState<Product | null>(null);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const [directPurchaseForm, setDirectPurchaseForm] = useState({
    productId: '' as string | undefined,
    name: '',
    partNumber: '',
    ncm: '',
    quantity: 1,
    unit: 'un',
    clientCompany: 'Infodesk (Uso Interno / Estoque)',
    clientOrderNumber: '',
    supplier: '',
    costPrice: 0,
    sellingPrice: 0,
    sourceUrl: '',
    imageUrl: '',
    initialStatus: 'pending' as 'pending' | 'purchased',
    // Campos caso já seja cadastrado como comprado
    actualCost: 0,
    paymentMethod: 'Cartão Amazon',
    purchaseDate: new Date().toISOString().split('T')[0],
    actualShipping: 0,
    shippingPending: false,
    notes: ''
  });

  // 4. Formas de Pagamento Dinâmicas
  const [paymentMethodsList, setPaymentMethodsList] = useState<string[]>(() => getRegisteredPaymentMethods());
  const [isAddingNewPaymentMethod, setIsAddingNewPaymentMethod] = useState(false);
  const [newPaymentMethodName, setNewPaymentMethodName] = useState('');

  // 4.1 Imagens Comerciais & Autocura
  const [imageVersion, setImageVersion] = useState<number>(0);
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false);
  const [imagePickerItem, setImagePickerItem] = useState<ProcurementItem | null>(null);
  const [imagePickerTargetMode, setImagePickerTargetMode] = useState<'card' | 'modal'>('card');

  // Unidades e Clientes Cadastrados para Seleção
  const registeredUnits = useMemo(() => getRegisteredUnits(), []);
  const registeredClients = useMemo(() => getClientCompanies(), []);

  // Sincroniza Formas de Pagamento, Compras Diretas e Imagens se alteradas
  useEffect(() => {
    const handleMetaChanged = () => {
      setPaymentMethodsList(getRegisteredPaymentMethods());
    };
    const handleDirectPurchasesChanged = () => {
      setDirectPurchases(getDirectPurchases());
    };
    const handleSplitsChanged = () => {
      setSplitVersion(v => v + 1);
    };
    const handleImagesUpdated = () => {
      setImageVersion(v => v + 1);
    };
    const handleProductsChanged = () => {
      setStockProducts(getProducts());
      setImageVersion(v => v + 1);
    };

    window.addEventListener('infodesk_metadata_changed', handleMetaChanged);
    window.addEventListener('infodesk_direct_purchases_changed', handleDirectPurchasesChanged);
    window.addEventListener('infodesk_procurement_splits_changed', handleSplitsChanged);
    window.addEventListener('infodesk_product_images_updated', handleImagesUpdated);
    window.addEventListener('infodesk_products_changed', handleProductsChanged);

    // Carrega compras diretas da nuvem ao abrir a Central de Compras
    fetchDirectPurchasesFromSupabase().then(remoteItems => {
      if (remoteItems && remoteItems.length > 0) {
        setDirectPurchases(prev => {
          const map = new Map<string, ProcurementItem>();
          remoteItems.forEach(i => map.set(i.id, i));
          prev.forEach(i => {
            if (!map.has(i.id)) map.set(i.id, i);
          });
          const merged = Array.from(map.values());
          try {
            localStorage.setItem('infodesk_direct_purchases', JSON.stringify(merged));
          } catch (e) {
            console.warn('Erro ao atualizar cache local de compras diretas:', e);
          }
          return merged;
        });
      }
    }).catch(() => {});

    return () => {
      window.removeEventListener('infodesk_metadata_changed', handleMetaChanged);
      window.removeEventListener('infodesk_direct_purchases_changed', handleDirectPurchasesChanged);
      window.removeEventListener('infodesk_procurement_splits_changed', handleSplitsChanged);
      window.removeEventListener('infodesk_product_images_updated', handleImagesUpdated);
      window.removeEventListener('infodesk_products_changed', handleProductsChanged);
    };
  }, []);

  // Filtro em tempo real de produtos do estoque para autocomplete
  const filteredStockProducts = useMemo(() => {
    if (!productSearchTerm.trim()) {
      return stockProducts.slice(0, 10);
    }
    const term = normalizeSearchText(productSearchTerm);
    return stockProducts.filter(p => {
      const nameMatch = normalizeSearchText(p.name).includes(term);
      const pnMatch = p.partNumber ? normalizeSearchText(p.partNumber).includes(term) : false;
      const skuMatch = p.sku ? normalizeSearchText(p.sku).includes(term) : false;
      const ncmMatch = p.ncm ? normalizeSearchText(p.ncm).includes(term) : false;
      const supMatch = p.supplier ? normalizeSearchText(p.supplier).includes(term) : false;
      return nameMatch || pnMatch || skuMatch || ncmMatch || supMatch;
    }).slice(0, 15);
  }, [stockProducts, productSearchTerm]);

  // Fechar dropdown de produto ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    }
    if (isProductDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProductDropdownOpen]);

  // 5. Estado do Modal de Registro de Compra (para itens pendentes de propostas ou diretos)
  const [activeItemForPurchase, setActiveItemForPurchase] = useState<ProcurementItem | null>(null);
  const [purchaseForm, setPurchaseForm] = useState({
    actualUnitCost: 0,
    actualCost: 0,
    actualShipping: 0,
    shippingPending: false,
    actualPurchaseUrl: '',
    actualSupplier: '',
    paymentMethod: 'PIX',
    purchaseDate: '',
    taxPercent: defaultTax,
    notes: '',
    clientOrderNumber: '',
    sellingUnitPrice: 0,
    imageUrl: ''
  });

  // 6. Paginação e Organização por Dia
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [groupByDay, setGroupByDay] = useState<boolean>(false);
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});

  const toggleDayCollapse = (dayKey: string) => {
    setCollapsedDays(prev => ({ ...prev, [dayKey]: !prev[dayKey] }));
  };

  // 7. Divisão de Compras em Múltiplos Fornecedores (Splits)
  const [splitVersion, setSplitVersion] = useState(0);
  const [itemToSplit, setItemToSplit] = useState<ProcurementItem | null>(null);
  const [splitFirstPartQty, setSplitFirstPartQty] = useState<number>(1);

  const handleOpenSplitModal = (item: ProcurementItem) => {
    setItemToSplit(item);
    setSplitFirstPartQty(Math.floor(item.quantity / 2) || 1);
  };

  const handleConfirmSplit = () => {
    if (!itemToSplit) return;
    const baseId = itemToSplit.splitFromId || itemToSplit.id;
    const ok = saveProcurementSplit(baseId, itemToSplit.quantity, splitFirstPartQty);
    if (ok) {
      setSplitVersion(v => v + 1);
      setItemToSplit(null);
      showToast(`Item fracionado em 2 lotes com sucesso!`);
    } else {
      alert('Quantidade inválida para divisão.');
    }
  };

  const handleReuniteSplit = (originalId: string) => {
    if (window.confirm('Deseja reunir os lotes fracionados de volta em um único item com a quantidade original?')) {
      removeProcurementSplit(originalId);
      setSplitVersion(v => v + 1);
      showToast('Lotes reunidos em um único item com sucesso!');
    }
  };

  // Extrai e Unifica Todos os Itens: Propostas Aprovadas + Compras Diretas Avulsas
  const procurementItems = useMemo<ProcurementItem[]>(() => {
    const list: ProcurementItem[] = [];

    const purchasesMap = getPurchasedProcurementRecords();
    const splitsMap = getProcurementSplits();

    // 1. Itens das propostas aprovadas
    (quotes || []).forEach(quote => {
      const isQuoteApproved = quote.status === 'approved';

      (quote.items || []).forEach(item => {
        // Se a proposta mãe está aprovada, todos os seus itens vão para compras,
        // a não ser que o item tenha sido expressamente desmarcado (approved === false E approvedQuantity === 0).
        // Se a proposta mãe não estiver com status 'approved', o item entra se tiver aprovação individual (approved === true).
        const isItemExplicitlyExcluded = item.approved === false && item.approvedQuantity === 0;
        const isItemApproved = (isQuoteApproved && !isItemExplicitlyExcluded) || item.approved === true;

        if (isItemApproved) {
          const baseId = `${quote.id}_${item.id}`;
          const qty = item.approvedQuantity !== undefined ? item.approvedQuantity : item.quantity;
          const quotedUnitPrice = item.unitPrice;
          const quotedTotalPrice = Number((quotedUnitPrice * qty).toFixed(2));
          const splitConfig = splitsMap[baseId];

          // Resolução inteligente da imagem: item -> registro blindado -> catálogo de produtos (estoque)
          const matchedStockProduct = stockProducts.find(p =>
            (item.productId && p.id === item.productId) ||
            (item.partNumber && p.partNumber && item.partNumber.trim().toLowerCase() === p.partNumber.trim().toLowerCase()) ||
            (item.name && p.name && normalizeSearchText(p.name) === normalizeSearchText(item.name))
          );
          const itemTax = item.actualTaxPercent ?? item.taxPercent ?? quote.globalTaxPercent ?? defaultTax;

          if (splitConfig && splitConfig.parts && splitConfig.parts.length > 0) {
            // ITEM FRACIONADO EM LOTES
            splitConfig.parts.forEach(part => {
              const subId = part.id;
              const subQty = part.quantity;
              const subQuotedTotalPrice = Number((quotedUnitPrice * subQty).toFixed(2));

              const subPurchaseRecord = findPurchasedProcurementRecord(purchasesMap, {
                itemId: subId,
                quoteId: quote.id,
                quoteCode: quote.code,
                name: item.name
              });

              const isSubPurchased = subPurchaseRecord?.purchaseStatus === 'purchased';
              const effectiveSubPurchaseStatus = isSubPurchased ? ('purchased' as const) : 'pending';

              const subActualCost = subPurchaseRecord?.actualCostPrice;
              const subActualUnit = subPurchaseRecord?.actualUnitCostPrice !== undefined
                ? subPurchaseRecord.actualUnitCostPrice
                : (subActualCost !== undefined && subQty > 0 ? Number((subActualCost / subQty).toFixed(2)) : undefined);

              const subActualUrl = subPurchaseRecord?.actualPurchaseUrl;
              const subStore = extractStoreNameFromUrl(subActualUrl);
              const subActualSupplier = subPurchaseRecord?.actualSupplier || (isSubPurchased && subStore ? subStore : undefined);
              const subSupplier = isSubPurchased
                ? (subActualSupplier || subPurchaseRecord?.supplier || subStore || item.supplier || '')
                : (item.supplier || '');

              const cachedSubImg = findProductImageInCache(item.name, item.partNumber);
              const effectiveImageUrl = item.imageUrl || subPurchaseRecord?.imageUrl || matchedStockProduct?.imageUrl || cachedSubImg;
              const effectiveClientOrderNumber = quote.clientOrderNumber || item.clientOrderNumber || subPurchaseRecord?.clientOrderNumber;

              list.push({
                id: subId,
                quoteId: quote.id,
                quoteCode: quote.code || 'PROPOSTA',
                clientOrderNumber: effectiveClientOrderNumber,
                clientCompany: quote.clientCompany || 'Cliente sem nome',
                contactPerson: quote.contactPerson,
                approvedAt: quote.approvedAt || quote.date,
                itemId: item.id,
                itemNumber: item.itemNumber,
                name: item.name,
                description: item.description,
                partNumber: item.partNumber,
                ncm: item.ncm,
                imageUrl: effectiveImageUrl,
                quantity: subQty,
                unit: item.unit || 'un',
                quotedCostPrice: item.costPrice,
                quotedUnitPrice,
                quotedTotalPrice: subQuotedTotalPrice,
                supplier: subSupplier,
                quotedSupplier: item.supplier,
                sourceUrl: item.sourceUrl,
                purchaseStatus: effectiveSubPurchaseStatus,
                actualCostPrice: subActualCost,
                actualUnitCostPrice: subActualUnit,
                actualPurchaseUrl: subActualUrl,
                actualSupplier: subActualSupplier,
                actualShippingCost: subPurchaseRecord?.actualShippingCost,
                shippingPending: subPurchaseRecord?.shippingPending ?? false,
                paymentMethod: subPurchaseRecord?.paymentMethod,
                purchasedAt: subPurchaseRecord?.purchasedAt,
                purchaseNotes: subPurchaseRecord?.purchaseNotes,
                taxPercent: itemTax,
                actualTaxPercent: subPurchaseRecord?.actualTaxPercent ?? itemTax,
                isDirectPurchase: false,
                splitFromId: baseId,
                splitBatchNumber: part.batchNumber,
                splitTotalBatches: splitConfig.parts.length
              });
            });
          } else {
            // ITEM ORIGINAL INTEIRO
            const purchaseRecord = findPurchasedProcurementRecord(purchasesMap, {
              itemId: item.id,
              quoteId: quote.id,
              quoteCode: quote.code,
              itemNumber: item.itemNumber,
              name: item.name
            });

            const isPurchased = item.purchaseStatus === 'purchased' || purchaseRecord?.purchaseStatus === 'purchased';
            const effectivePurchaseStatus = isPurchased ? ('purchased' as const) : (item.purchaseStatus || 'pending');

            const effectiveActualCost = item.actualCostPrice !== undefined ? item.actualCostPrice : purchaseRecord?.actualCostPrice;
            const effectiveActualUnit = item.actualUnitCostPrice !== undefined
              ? item.actualUnitCostPrice
              : (purchaseRecord?.actualUnitCostPrice !== undefined
                ? purchaseRecord.actualUnitCostPrice
                : (effectiveActualCost !== undefined && qty > 0 ? Number((effectiveActualCost / qty).toFixed(2)) : undefined));

            const effectiveActualPurchaseUrl = item.actualPurchaseUrl || purchaseRecord?.actualPurchaseUrl;
            const detectedStoreFromPurchaseUrl = extractStoreNameFromUrl(effectiveActualPurchaseUrl);
            const effectiveActualSupplier = item.actualSupplier || purchaseRecord?.actualSupplier || (isPurchased && detectedStoreFromPurchaseUrl ? detectedStoreFromPurchaseUrl : undefined);
            const effectiveSupplier = isPurchased
              ? (effectiveActualSupplier || item.supplier || purchaseRecord?.supplier || detectedStoreFromPurchaseUrl || '')
              : (item.supplier || '');
            const effectiveQuotedSupplier = item.quotedSupplier || purchaseRecord?.quotedSupplier || (isPurchased && effectiveSupplier !== item.supplier ? item.supplier : undefined);

            const cachedItemImg = findProductImageInCache(item.name, item.partNumber);
            const effectiveImageUrl = item.imageUrl || purchaseRecord?.imageUrl || matchedStockProduct?.imageUrl || cachedItemImg;
            const effectiveClientOrderNumber = quote.clientOrderNumber || item.clientOrderNumber || purchaseRecord?.clientOrderNumber;

            list.push({
              id: baseId,
              quoteId: quote.id,
              quoteCode: quote.code || 'PROPOSTA',
              clientOrderNumber: effectiveClientOrderNumber,
              clientCompany: quote.clientCompany || 'Cliente sem nome',
              contactPerson: quote.contactPerson,
              approvedAt: quote.approvedAt || quote.date,
              itemId: item.id,
              itemNumber: item.itemNumber,
              name: item.name,
              description: item.description,
              partNumber: item.partNumber,
              ncm: item.ncm,
              imageUrl: effectiveImageUrl,
              quantity: qty,
              unit: item.unit || 'un',
              quotedCostPrice: item.costPrice,
              quotedUnitPrice,
              quotedTotalPrice,
              supplier: effectiveSupplier,
              quotedSupplier: effectiveQuotedSupplier,
              sourceUrl: item.sourceUrl,
              purchaseStatus: effectivePurchaseStatus,
              actualCostPrice: effectiveActualCost,
              actualUnitCostPrice: effectiveActualUnit,
              actualPurchaseUrl: effectiveActualPurchaseUrl,
              actualSupplier: effectiveActualSupplier,
              actualShippingCost: item.actualShippingCost !== undefined ? item.actualShippingCost : purchaseRecord?.actualShippingCost,
              shippingPending: item.shippingPending ?? purchaseRecord?.shippingPending ?? false,
              paymentMethod: item.paymentMethod || purchaseRecord?.paymentMethod,
              purchasedAt: item.purchasedAt || purchaseRecord?.purchasedAt,
              purchaseNotes: item.purchaseNotes || purchaseRecord?.purchaseNotes,
              taxPercent: itemTax,
              actualTaxPercent: item.actualTaxPercent ?? purchaseRecord?.actualTaxPercent,
              isDirectPurchase: false
            });
          }
        }
      });
    });

    // 2. Compras Diretas Avulsas
    (directPurchases || []).forEach(dp => {
      const baseId = dp.id;
      const splitConfig = splitsMap[baseId];

      const matchedStock = stockProducts.find(p =>
        (dp.productId && p.id === dp.productId) ||
        (dp.partNumber && p.partNumber && dp.partNumber.trim().toLowerCase() === p.partNumber.trim().toLowerCase()) ||
        (dp.name && p.name && normalizeSearchText(p.name) === normalizeSearchText(dp.name))
      );

      if (splitConfig && splitConfig.parts && splitConfig.parts.length > 0) {
        splitConfig.parts.forEach(part => {
          const subId = part.id;
          const subQty = part.quantity;
          const subQuotedTotalPrice = Number((dp.quotedUnitPrice * subQty).toFixed(2));
          const subPurchaseRecord = findPurchasedProcurementRecord(purchasesMap, { itemId: subId });

          const isSubPurchased = subPurchaseRecord?.purchaseStatus === 'purchased';
          const effectiveSubPurchaseStatus = isSubPurchased ? ('purchased' as const) : 'pending';

          const subActualCost = subPurchaseRecord?.actualCostPrice;
          const subActualUnit = subPurchaseRecord?.actualUnitCostPrice !== undefined
            ? subPurchaseRecord.actualUnitCostPrice
            : (subActualCost !== undefined && subQty > 0 ? Number((subActualCost / subQty).toFixed(2)) : dp.quotedCostPrice);

          const subActualUrl = subPurchaseRecord?.actualPurchaseUrl || dp.sourceUrl;
          const subStore = extractStoreNameFromUrl(subActualUrl);
          const subActualSupplier = subPurchaseRecord?.actualSupplier || (isSubPurchased && subStore ? subStore : undefined);
          const subSupplier = isSubPurchased
            ? (subActualSupplier || subPurchaseRecord?.supplier || subStore || dp.supplier || '')
            : (dp.supplier || '');

          list.push({
            ...dp,
            id: subId,
            quantity: subQty,
            quotedTotalPrice: subQuotedTotalPrice,
            imageUrl: dp.imageUrl || subPurchaseRecord?.imageUrl || matchedStock?.imageUrl || findProductImageInCache(dp.name, dp.partNumber),
            supplier: subSupplier,
            actualSupplier: subActualSupplier,
            actualPurchaseUrl: subActualUrl,
            actualCostPrice: subActualCost,
            actualUnitCostPrice: subActualUnit,
            actualShippingCost: subPurchaseRecord?.actualShippingCost,
            shippingPending: subPurchaseRecord?.shippingPending ?? false,
            paymentMethod: subPurchaseRecord?.paymentMethod,
            purchasedAt: subPurchaseRecord?.purchasedAt,
            purchaseNotes: subPurchaseRecord?.purchaseNotes,
            purchaseStatus: effectiveSubPurchaseStatus,
            isDirectPurchase: true,
            splitFromId: baseId,
            splitBatchNumber: part.batchNumber,
            splitTotalBatches: splitConfig.parts.length
          });
        });
      } else {
        const dpActualUrl = dp.actualPurchaseUrl || dp.sourceUrl;
        const detectedStore = extractStoreNameFromUrl(dpActualUrl);
        const isPurchased = dp.purchaseStatus === 'purchased';
        const effectiveActualSupplier = dp.actualSupplier || (isPurchased && detectedStore ? detectedStore : undefined);
        const effectiveSupplier = isPurchased 
          ? (effectiveActualSupplier || dp.supplier || detectedStore || '')
          : (dp.supplier || '');

        const cachedDpImg = findProductImageInCache(dp.name, dp.partNumber);
        const effectiveDpImageUrl = dp.imageUrl || matchedStock?.imageUrl || cachedDpImg;

        list.push({
          ...dp,
          imageUrl: effectiveDpImageUrl,
          supplier: effectiveSupplier,
          actualSupplier: effectiveActualSupplier,
          actualPurchaseUrl: dpActualUrl,
          isDirectPurchase: true
        });
      }
    });

    return list;
  }, [quotes, directPurchases, defaultTax, stockProducts, splitVersion, imageVersion]);

  // Autocura Inteligente em Segundo Plano de Imagens Ausentes
  useEffect(() => {
    const missingImgItems = procurementItems.filter(it => !it.imageUrl && it.name && it.name.trim().length > 2);
    if (missingImgItems.length === 0) return;

    let isCancelled = false;

    const runAutoHealing = async () => {
      // Processa em lote suave (até 12 itens por ciclo)
      for (const it of missingImgItems.slice(0, 12)) {
        if (isCancelled) break;

        const cached = findProductImageInCache(it.name, it.partNumber);
        if (cached) {
          setImageVersion(v => v + 1);
          continue;
        }

        try {
          const found = await autoFindProductImage(it.name, it.partNumber);
          if (found && !isCancelled) {
            saveProductImageToCache({
              name: it.name,
              partNumber: it.partNumber
            }, found);

            if (it.purchaseStatus === 'purchased') {
              savePurchasedProcurementRecord({
                itemId: it.splitFromId ? it.id : (it.itemId || it.id),
                itemNumber: it.itemNumber,
                quoteId: it.quoteId,
                quoteCode: it.quoteCode,
                name: it.name,
                imageUrl: found,
                purchaseStatus: 'purchased'
              });
            }

            if (it.quoteId) {
              const targetQuote = quotes.find(q => 
                q.id === it.quoteId || 
                (q.code && it.quoteCode && q.code.toUpperCase() === it.quoteCode.toUpperCase())
              );
              if (targetQuote) {
                let changed = false;
                const updatedItems = (targetQuote.items || []).map(qIt => {
                  if (
                    (qIt.id && it.itemId && qIt.id === it.itemId) ||
                    (qIt.itemNumber !== undefined && it.itemNumber !== undefined && qIt.itemNumber === it.itemNumber) ||
                    (qIt.name && it.name && normalizeSearchText(qIt.name) === normalizeSearchText(it.name))
                  ) {
                    if (!qIt.imageUrl) {
                      changed = true;
                      return { ...qIt, imageUrl: found, showImage: true };
                    }
                  }
                  return qIt;
                });
                if (changed) {
                  onUpdateQuote({ ...targetQuote, items: updatedItems });
                }
              }
            } else if (it.isDirectPurchase) {
              saveOrUpdateDirectPurchase({ ...it, imageUrl: found });
            }

            setImageVersion(v => v + 1);
          }
        } catch {
          // Erro silencioso em auto-cura web ignorado
        }
      }
    };

    runAutoHealing();

    return () => {
      isCancelled = true;
    };
  }, [procurementItems, quotes, onUpdateQuote]);

  // Listas Dinâmicas para Dropdowns de Filtro
  const availableCompanies = useMemo(() => {
    const set = new Set<string>();
    procurementItems.forEach(it => {
      if (it.clientCompany && it.clientCompany.trim()) {
        set.add(it.clientCompany.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [procurementItems]);

  const availableSuppliers = useMemo(() => {
    const set = new Set<string>();
    procurementItems.forEach(it => {
      if (it.supplier && it.supplier.trim()) {
        set.add(it.supplier.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [procurementItems]);

  const availablePaymentMethods = useMemo(() => {
    const set = new Set<string>(paymentMethodsList);
    procurementItems.forEach(it => {
      if (it.paymentMethod && it.paymentMethod.trim()) {
        set.add(it.paymentMethod.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [paymentMethodsList, procurementItems]);

  // Catálogo Agregado de Referência de Preços Pagos (para consulta rápida)
  const purchasedReferenceCatalog = useMemo<ProductReferenceSummary[]>(() => {
    const map = new Map<string, ProductReferenceSummary>();

    procurementItems.forEach(item => {
      if (item.purchaseStatus !== 'purchased') return;

      const key = (item.partNumber?.trim() || item.name.trim()).toLowerCase();
      const unitPaid = item.actualUnitCostPrice !== undefined 
        ? item.actualUnitCostPrice 
        : (item.actualCostPrice !== undefined && item.quantity > 0 ? item.actualCostPrice / item.quantity : item.quotedCostPrice);
      const dateStr = (item.purchasedAt || item.approvedAt || '').split('T')[0];

      let entry = map.get(key);
      if (!entry) {
        entry = {
          normalizedKey: key,
          name: item.name,
          partNumber: item.partNumber,
          ncm: item.ncm,
          imageUrl: item.imageUrl,
          unit: item.unit || 'un',
          lastPurchasedAt: dateStr,
          lastUnitCost: unitPaid,
          minUnitCost: unitPaid,
          maxUnitCost: unitPaid,
          lastSupplier: item.actualSupplier || item.supplier || extractStoreNameFromUrl(item.actualPurchaseUrl || item.sourceUrl) || '',
          lastPurchaseUrl: item.actualPurchaseUrl || item.sourceUrl,
          lastPaymentMethod: item.paymentMethod,
          lastClient: item.clientCompany,
          totalQuantity: 0,
          purchaseCount: 0,
          allPurchases: []
        };
        map.set(key, entry);
      }

      entry.totalQuantity += item.quantity;
      entry.purchaseCount++;
      if (unitPaid < entry.minUnitCost) entry.minUnitCost = unitPaid;
      if (unitPaid > entry.maxUnitCost) entry.maxUnitCost = unitPaid;

      if (dateStr && (!entry.lastPurchasedAt || dateStr >= entry.lastPurchasedAt)) {
        entry.lastPurchasedAt = dateStr;
        entry.lastUnitCost = unitPaid;
        entry.lastSupplier = item.actualSupplier || item.supplier || extractStoreNameFromUrl(item.actualPurchaseUrl || item.sourceUrl) || entry.lastSupplier;
        entry.lastPurchaseUrl = item.actualPurchaseUrl || item.sourceUrl || entry.lastPurchaseUrl;
        entry.lastPaymentMethod = item.paymentMethod || entry.lastPaymentMethod;
        entry.lastClient = item.clientCompany || entry.lastClient;
      }

      entry.allPurchases.push({
        date: dateStr,
        unitCost: unitPaid,
        totalCost: item.actualCostPrice !== undefined ? item.actualCostPrice : unitPaid * item.quantity,
        quantity: item.quantity,
        supplier: item.actualSupplier || item.supplier || extractStoreNameFromUrl(item.actualPurchaseUrl || item.sourceUrl) || '',
        client: item.clientCompany,
        purchaseUrl: item.actualPurchaseUrl || item.sourceUrl,
        paymentMethod: item.paymentMethod,
        quoteCode: item.quoteCode
      });
    });

    return Array.from(map.values()).sort((a, b) => {
      return (b.lastPurchasedAt || '').localeCompare(a.lastPurchasedAt || '');
    });
  }, [procurementItems]);

  // Catálogo de Referência Filtrado por Busca
  const filteredReferenceCatalog = useMemo(() => {
    if (!searchTerm.trim()) return purchasedReferenceCatalog;
    const q = searchTerm.toLowerCase();
    return purchasedReferenceCatalog.filter(entry => 
      entry.name.toLowerCase().includes(q) ||
      (entry.partNumber || '').toLowerCase().includes(q) ||
      (entry.lastSupplier || '').toLowerCase().includes(q) ||
      (entry.lastClient || '').toLowerCase().includes(q)
    );
  }, [purchasedReferenceCatalog, searchTerm]);

  // Filtragem dos Itens da Lista Regular
  // 1. Filtragem contextual (Cliente, Forma de Pagamento, Fornecedor, Período e Busca Textual)
  // IMPORTANTE: NÃO filtra por status aqui para que as abas e métricas reflitam todos os itens do contexto!
  const contextItems = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return procurementItems.filter(item => {
      // 1. Filtro de Cliente / Empresa
      if (selectedCompany !== 'all' && item.clientCompany !== selectedCompany) {
        return false;
      }

      // 2. Filtro de Forma de Pagamento
      if (selectedPaymentMethod !== 'all' && item.paymentMethod !== selectedPaymentMethod) {
        return false;
      }

      // 3. Filtro de Fornecedor
      if (selectedSupplier !== 'all' && item.supplier !== selectedSupplier) {
        return false;
      }

      // 4. Filtro de Período
      if (periodFilter !== 'all') {
        const dateStr = item.purchasedAt || item.approvedAt;
        if (!dateStr) return false;
        const itemDateStr = dateStr.split('T')[0];
        const itemDate = new Date(dateStr);

        if (periodFilter === 'today') {
          if (itemDateStr !== todayStr) return false;
        } else if (periodFilter === 'yesterday') {
          if (itemDateStr !== yesterdayStr) return false;
        } else if (periodFilter === '7days') {
          if (itemDate < sevenDaysAgo) return false;
        } else if (periodFilter === '30days') {
          if (itemDate < thirtyDaysAgo) return false;
        } else if (periodFilter === 'this_month') {
          if (itemDate.getMonth() !== now.getMonth() || itemDate.getFullYear() !== now.getFullYear()) {
            return false;
          }
        } else if (periodFilter === 'last_month') {
          const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          if (itemDate.getMonth() !== lastMonthDate.getMonth() || itemDate.getFullYear() !== lastMonthDate.getFullYear()) {
            return false;
          }
        } else if (periodFilter === 'custom') {
          if (customStartDate && itemDateStr < customStartDate) return false;
          if (customEndDate && itemDateStr > customEndDate) return false;
        }
      }

      // 5. Busca textual unificada
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchName = (item.name || '').toLowerCase().includes(query);
        const matchClient = (item.clientCompany || '').toLowerCase().includes(query);
        const matchCode = (item.quoteCode || '').toLowerCase().includes(query);
        const matchOrder = (item.clientOrderNumber || '').toLowerCase().includes(query);
        const matchSupplier = (item.supplier || '').toLowerCase().includes(query);
        const matchPart = (item.partNumber || '').toLowerCase().includes(query);
        const matchNcm = (item.ncm || '').toLowerCase().includes(query);
        const matchNotes = (item.purchaseNotes || '').toLowerCase().includes(query);
        const matchPayment = (item.paymentMethod || '').toLowerCase().includes(query);

        if (!matchName && !matchClient && !matchCode && !matchOrder && !matchSupplier && !matchPart && !matchNcm && !matchNotes && !matchPayment) {
          return false;
        }
      }

      return true;
    });
  }, [
    procurementItems, 
    selectedCompany, 
    selectedPaymentMethod, 
    selectedSupplier, 
    periodFilter, 
    customStartDate, 
    customEndDate, 
    searchTerm
  ]);

  // Separação garantida por status dentro do contexto atual
  const pendingItems = useMemo(() => {
    return contextItems.filter(item => (item.purchaseStatus || 'pending') !== 'purchased');
  }, [contextItems]);

  const purchasedItems = useMemo(() => {
    return contextItems.filter(item => item.purchaseStatus === 'purchased');
  }, [contextItems]);

  // Itens da lista regular conforme aba ativa
  const filteredItems = useMemo(() => {
    if (statusFilter === 'pending') return pendingItems;
    if (statusFilter === 'purchased') return purchasedItems;
    return contextItems;
  }, [statusFilter, pendingItems, purchasedItems, contextItems]);

  // Reset da página atual ao alterar filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, periodFilter, searchTerm, selectedCompany, selectedPaymentMethod, selectedSupplier, itemsPerPage, groupByDay]);

  // Agrupamento Inteligente por Dia (Hoje, Ontem, Data específica)
  const groupedByDate = useMemo(() => {
    const map = new Map<string, {
      dateKey: string;
      displayTitle: string;
      items: ProcurementItem[];
      totalCost: number;
      totalRevenue: number;
      purchasedCount: number;
      pendingCount: number;
    }>();

    const todayClean = new Date().toISOString().split('T')[0];
    const yestDate = new Date();
    yestDate.setDate(yestDate.getDate() - 1);
    const yesterdayClean = yestDate.toISOString().split('T')[0];

    filteredItems.forEach(item => {
      const rawDate = item.purchasedAt || item.approvedAt || '';
      const dateKey = rawDate ? rawDate.split('T')[0] : 'sem_data';

      let displayTitle = 'Sem Data Definida';
      if (dateKey === todayClean) {
        displayTitle = `Hoje — ${formatDatePtBr(dateKey)}`;
      } else if (dateKey === yesterdayClean) {
        displayTitle = `Ontem — ${formatDatePtBr(dateKey)}`;
      } else if (dateKey !== 'sem_data') {
        displayTitle = formatDatePtBr(dateKey);
      }

      let g = map.get(dateKey);
      if (!g) {
        g = {
          dateKey,
          displayTitle,
          items: [],
          totalCost: 0,
          totalRevenue: 0,
          purchasedCount: 0,
          pendingCount: 0
        };
        map.set(dateKey, g);
      }

      g.items.push(item);
      const cost = item.actualCostPrice !== undefined ? item.actualCostPrice : (item.quotedCostPrice * item.quantity);
      g.totalCost += cost;
      g.totalRevenue += item.quotedTotalPrice;
      if (item.purchaseStatus === 'purchased') {
        g.purchasedCount++;
      } else {
        g.pendingCount++;
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.dateKey === 'sem_data') return 1;
      if (b.dateKey === 'sem_data') return -1;
      return b.dateKey.localeCompare(a.dateKey);
    });
  }, [filteredItems]);

  // Itens Paginados para Modo Individual
  const totalPages = itemsPerPage > 0 ? Math.max(1, Math.ceil(filteredItems.length / itemsPerPage)) : 1;
  const paginatedItems = useMemo(() => {
    if (itemsPerPage <= 0) return filteredItems;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage, itemsPerPage]);

  // Grupos por Dia da Página Atual (quando agrupado por dia e paginado)
  const paginatedGroupedByDate = useMemo(() => {
    if (!groupByDay) return [];
    const sourceItems = itemsPerPage > 0 ? paginatedItems : filteredItems;
    const map = new Map<string, {
      dateKey: string;
      displayTitle: string;
      items: ProcurementItem[];
      totalCost: number;
      totalRevenue: number;
      purchasedCount: number;
      pendingCount: number;
    }>();

    const todayClean = new Date().toISOString().split('T')[0];
    const yestDate = new Date();
    yestDate.setDate(yestDate.getDate() - 1);
    const yesterdayClean = yestDate.toISOString().split('T')[0];

    sourceItems.forEach(item => {
      const rawDate = item.purchasedAt || item.approvedAt || '';
      const dateKey = rawDate ? rawDate.split('T')[0] : 'sem_data';

      let displayTitle = 'Sem Data Definida';
      if (dateKey === todayClean) {
        displayTitle = `Hoje — ${formatDatePtBr(dateKey)}`;
      } else if (dateKey === yesterdayClean) {
        displayTitle = `Ontem — ${formatDatePtBr(dateKey)}`;
      } else if (dateKey !== 'sem_data') {
        displayTitle = formatDatePtBr(dateKey);
      }

      let g = map.get(dateKey);
      if (!g) {
        g = {
          dateKey,
          displayTitle,
          items: [],
          totalCost: 0,
          totalRevenue: 0,
          purchasedCount: 0,
          pendingCount: 0
        };
        map.set(dateKey, g);
      }

      g.items.push(item);
      const cost = item.actualCostPrice !== undefined ? item.actualCostPrice : (item.quotedCostPrice * item.quantity);
      g.totalCost += cost;
      g.totalRevenue += item.quotedTotalPrice;
      if (item.purchaseStatus === 'purchased') {
        g.purchasedCount++;
      } else {
        g.pendingCount++;
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.dateKey === 'sem_data') return 1;
      if (b.dateKey === 'sem_data') return -1;
      return b.dateKey.localeCompare(a.dateKey);
    });
  }, [groupByDay, itemsPerPage, paginatedItems, filteredItems]);

  // Agrupamento por Proposta Comercial
  const groupedByQuote = useMemo(() => {
    const groups: {
      quoteId: string;
      quoteCode: string;
      clientOrderNumber?: string;
      clientCompany: string;
      contactPerson?: string;
      approvedAt?: string;
      items: ProcurementItem[];
      totalItems: number;
      purchasedCount: number;
      percentComplete: number;
      totalQuotedRevenue: number;
      totalActualCost: number;
      totalQuotedCost: number;
    }[] = [];

    const map = new Map<string, typeof groups[0]>();

    filteredItems.forEach(item => {
      let g = map.get(item.quoteId);
      if (!g) {
        g = {
          quoteId: item.quoteId,
          quoteCode: item.quoteCode,
          clientOrderNumber: item.clientOrderNumber,
          clientCompany: item.clientCompany,
          contactPerson: item.contactPerson,
          approvedAt: item.approvedAt,
          items: [],
          totalItems: 0,
          purchasedCount: 0,
          percentComplete: 0,
          totalQuotedRevenue: 0,
          totalActualCost: 0,
          totalQuotedCost: 0
        };
        map.set(item.quoteId, g);
        groups.push(g);
      } else if (!g.clientOrderNumber && item.clientOrderNumber) {
        g.clientOrderNumber = item.clientOrderNumber;
      }

      g.items.push(item);
      g.totalItems++;
      if (item.purchaseStatus === 'purchased') {
        g.purchasedCount++;
      }
      g.totalQuotedRevenue += item.quotedTotalPrice;
      g.totalQuotedCost += item.quotedCostPrice * item.quantity;
      g.totalActualCost += item.actualCostPrice !== undefined ? item.actualCostPrice : (item.quotedCostPrice * item.quantity);
    });

    groups.forEach(g => {
      g.percentComplete = g.totalItems > 0 ? Math.round((g.purchasedCount / g.totalItems) * 100) : 0;
    });

    return groups;
  }, [filteredItems]);

  // Agrupamento Inteligente por Fornecedor (O que comprar na Kabum, Fujioka, etc.)
  const supplierGroups = useMemo(() => {
    const map = new Map<string, {
      supplierName: string;
      items: ProcurementItem[];
      totalQuantity: number;
      totalEstimatedCost: number;
      totalActualCost: number;
      pendingCount: number;
      purchasedCount: number;
    }>();

    filteredItems.forEach(item => {
      const rawSupp = (item.purchaseStatus === 'purchased' ? (item.actualSupplier || item.supplier) : item.supplier)?.trim();
      const supp = rawSupp && rawSupp.length > 0 ? rawSupp : 'Fornecedor a Definir';
      let g = map.get(supp);
      if (!g) {
        g = {
          supplierName: supp,
          items: [],
          totalQuantity: 0,
          totalEstimatedCost: 0,
          totalActualCost: 0,
          pendingCount: 0,
          purchasedCount: 0
        };
        map.set(supp, g);
      }
      g.items.push(item);
      g.totalQuantity += item.quantity;
      g.totalEstimatedCost += item.quotedCostPrice * item.quantity;
      g.totalActualCost += item.actualCostPrice !== undefined ? item.actualCostPrice : (item.quotedCostPrice * item.quantity);
      if (item.purchaseStatus === 'pending') g.pendingCount++;
      if (item.purchaseStatus === 'purchased') g.purchasedCount++;
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.supplierName === 'Fornecedor a Definir') return 1;
      if (b.supplierName === 'Fornecedor a Definir') return -1;
      return b.totalEstimatedCost - a.totalEstimatedCost;
    });
  }, [filteredItems]);

  // Métricas do Topo calculadas de forma desacoplada da aba ativa (sempre refletem o total real do contexto)
  const stats = useMemo(() => {
    const pendingCount = pendingItems.length;
    let pendingCost = 0;
    pendingItems.forEach(item => {
      pendingCost += item.quotedCostPrice * item.quantity;
    });

    const purchasedCount = purchasedItems.length;
    let purchasedCost = 0;
    let purchasedQuotedCost = 0;
    let purchasedRevenue = 0;
    let purchasedTax = 0;
    let purchasedShipping = 0;

    purchasedItems.forEach(item => {
      const cost = item.actualCostPrice !== undefined ? item.actualCostPrice : (item.quotedCostPrice * item.quantity);
      const quotedCost = item.quotedCostPrice * item.quantity;
      const shipping = item.actualShippingCost || 0;
      const rev = item.quotedTotalPrice;
      const tax = rev * (item.taxPercent / 100);

      purchasedCost += cost;
      purchasedQuotedCost += quotedCost;
      purchasedShipping += shipping;
      purchasedRevenue += rev;
      purchasedTax += tax;
    });

    const netProfit = purchasedRevenue - purchasedCost - purchasedShipping - purchasedTax;
    const totalInvested = purchasedCost + purchasedShipping + purchasedTax;
    const roiMargin = totalInvested > 0 ? (netProfit / totalInvested) * 100 : 0;
    const saving = purchasedQuotedCost - purchasedCost;

    return {
      pendingCount,
      pendingCost,
      purchasedCount,
      purchasedCost,
      purchasedQuotedCost,
      saving,
      purchasedRevenue,
      purchasedTax,
      purchasedShipping,
      netProfit,
      roiMargin
    };
  }, [pendingItems, purchasedItems]);

  // Abrir Modal de Registro de Compra com valores unitários, links e fornecedor real
  const handleOpenPurchaseModal = (item: ProcurementItem) => {
    setActiveItemForPurchase(item);
    setIsAddingNewPaymentMethod(false);
    setNewPaymentMethodName('');

    const qty = item.quantity > 0 ? item.quantity : 1;
    const defaultTotalCost = item.actualCostPrice !== undefined 
      ? item.actualCostPrice 
      : Number((item.quotedCostPrice * qty).toFixed(2));
      
    const defaultUnitCost = item.actualUnitCostPrice !== undefined 
      ? item.actualUnitCostPrice 
      : Number((defaultTotalCost / qty).toFixed(2));

    const defaultDate = item.purchasedAt 
      ? item.purchasedAt.split('T')[0]
      : new Date().toISOString().split('T')[0];

    const effectiveUrl = item.actualPurchaseUrl || item.sourceUrl || '';
    const detectedFromUrl = extractStoreNameFromUrl(effectiveUrl);
    const initialSupplier = item.actualSupplier || 
      (detectedFromUrl || '') || 
      item.supplier || 
      '';

    setPurchaseForm({
      actualUnitCost: defaultUnitCost,
      actualCost: defaultTotalCost,
      actualShipping: item.actualShippingCost || 0,
      shippingPending: Boolean(item.shippingPending),
      actualPurchaseUrl: effectiveUrl,
      actualSupplier: initialSupplier,
      paymentMethod: item.paymentMethod || paymentMethodsList[0] || 'PIX',
      purchaseDate: defaultDate,
      taxPercent: item.actualTaxPercent ?? item.taxPercent ?? defaultTax,
      notes: item.purchaseNotes || '',
      clientOrderNumber: item.clientOrderNumber || '',
      sellingUnitPrice: item.quotedUnitPrice || (item.quantity > 0 ? Number((item.quotedTotalPrice / item.quantity).toFixed(2)) : 0),
      imageUrl: item.imageUrl || ''
    });
  };

  // Atualização Inteligente de URL de Compra e Detecção Automática do Fornecedor
  const handlePurchaseUrlChange = (newUrl: string) => {
    const detectedStore = extractStoreNameFromUrl(newUrl);
    setPurchaseForm(prev => {
      const prevDetected = extractStoreNameFromUrl(prev.actualPurchaseUrl);
      const shouldAutoUpdateSupplier = Boolean(
        detectedStore && 
        (!prev.actualSupplier || prev.actualSupplier === prevDetected || prev.actualSupplier === activeItemForPurchase?.supplier)
      );

      return {
        ...prev,
        actualPurchaseUrl: newUrl,
        ...(shouldAutoUpdateSupplier ? { actualSupplier: detectedStore } : {})
      };
    });
  };

  // Cálculo Bidirecional: alterando o Valor Unitário
  const handleUnitCostChange = (val: number) => {
    const qty = activeItemForPurchase?.quantity || 1;
    const newTotal = Number((val * qty).toFixed(2));
    setPurchaseForm(prev => ({
      ...prev,
      actualUnitCost: val,
      actualCost: newTotal
    }));
  };

  // Cálculo Bidirecional: alterando o Custo Total
  const handleTotalCostChange = (val: number) => {
    const qty = activeItemForPurchase?.quantity || 1;
    const newUnit = qty > 0 ? Number((val / qty).toFixed(2)) : 0;
    setPurchaseForm(prev => ({
      ...prev,
      actualCost: val,
      actualUnitCost: newUnit
    }));
  };

  // Salvar Registro de Compra (seja de proposta ou compra direta)
  const handleSavePurchase = () => {
    if (!activeItemForPurchase) return;

    const resolvedSupplier = purchaseForm.actualSupplier?.trim() || 
      extractStoreNameFromUrl(purchaseForm.actualPurchaseUrl) || 
      activeItemForPurchase.supplier || 
      '';

    const effectiveOrderNum = purchaseForm.clientOrderNumber.trim() || undefined;
    const effectiveImg = purchaseForm.imageUrl.trim() || activeItemForPurchase.imageUrl || undefined;

    if (activeItemForPurchase.isDirectPurchase) {
      // Compra direta avulsa
      const sellingUnit = Number(purchaseForm.sellingUnitPrice) > 0 
        ? Number(purchaseForm.sellingUnitPrice) 
        : activeItemForPurchase.quotedUnitPrice;

      const isSplit = Boolean(activeItemForPurchase.splitFromId);
      const targetDirectRecordId = isSplit ? activeItemForPurchase.id : (activeItemForPurchase.itemId || activeItemForPurchase.id);

      if (!isSplit) {
        const updatedDirectItem: ProcurementItem = {
          ...activeItemForPurchase,
          clientOrderNumber: effectiveOrderNum,
          imageUrl: effectiveImg,
          quotedUnitPrice: sellingUnit,
          quotedTotalPrice: Number((sellingUnit * activeItemForPurchase.quantity).toFixed(2)),
          purchaseStatus: 'purchased',
          actualCostPrice: Number(purchaseForm.actualCost),
          actualUnitCostPrice: Number(purchaseForm.actualUnitCost),
          actualPurchaseUrl: purchaseForm.actualPurchaseUrl?.trim() || undefined,
          actualSupplier: resolvedSupplier || undefined,
          supplier: resolvedSupplier || activeItemForPurchase.supplier,
          actualShippingCost: Number(purchaseForm.actualShipping),
          shippingPending: Boolean(purchaseForm.shippingPending),
          paymentMethod: purchaseForm.paymentMethod,
          purchasedAt: purchaseForm.purchaseDate,
          taxPercent: Number(purchaseForm.taxPercent),
          purchaseNotes: purchaseForm.notes?.trim() || undefined
        };
        saveOrUpdateDirectPurchase(updatedDirectItem);
      }

      savePurchasedProcurementRecord({
        itemId: targetDirectRecordId,
        name: activeItemForPurchase.name,
        clientOrderNumber: effectiveOrderNum,
        imageUrl: effectiveImg,
        purchaseStatus: 'purchased',
        actualCostPrice: Number(purchaseForm.actualCost),
        actualUnitCostPrice: Number(purchaseForm.actualUnitCost),
        actualPurchaseUrl: purchaseForm.actualPurchaseUrl?.trim() || undefined,
        actualSupplier: resolvedSupplier || undefined,
        supplier: resolvedSupplier || activeItemForPurchase.supplier,
        actualShippingCost: Number(purchaseForm.actualShipping),
        shippingPending: Boolean(purchaseForm.shippingPending),
        paymentMethod: purchaseForm.paymentMethod,
        purchasedAt: purchaseForm.purchaseDate,
        purchaseNotes: purchaseForm.notes?.trim() || undefined,
        actualTaxPercent: Number(purchaseForm.taxPercent)
      });
      setActiveItemForPurchase(null);
      showToast(`Compra de "${activeItemForPurchase.name}" registrada com sucesso!`);
      return;
    }

    // Compra vinculada a proposta comercial
    const targetQuote = quotes.find(q => 
      q.id === activeItemForPurchase.quoteId || 
      (q.code && activeItemForPurchase.quoteCode && q.code.trim().toUpperCase() === activeItemForPurchase.quoteCode.trim().toUpperCase())
    );
    if (!targetQuote) {
      console.warn('[ProcurementView] Proposta de origem não encontrada:', activeItemForPurchase.quoteId, activeItemForPurchase.quoteCode);
      return;
    }

    const updatedItems = (targetQuote.items || []).map(it => {
      const isMatch = (it.id && activeItemForPurchase.itemId && it.id === activeItemForPurchase.itemId) ||
                      (it.itemNumber !== undefined && activeItemForPurchase.itemNumber !== undefined && it.itemNumber === activeItemForPurchase.itemNumber) ||
                      (it.name && activeItemForPurchase.name && normalizeSearchText(it.name) === normalizeSearchText(activeItemForPurchase.name));

      if (isMatch) {
        return {
          ...it,
          clientOrderNumber: effectiveOrderNum || it.clientOrderNumber,
          imageUrl: effectiveImg || it.imageUrl,
          approved: true,
          purchaseStatus: 'purchased' as const,
          actualCostPrice: Number(purchaseForm.actualCost),
          actualUnitCostPrice: Number(purchaseForm.actualUnitCost),
          actualPurchaseUrl: purchaseForm.actualPurchaseUrl?.trim() || undefined,
          actualSupplier: resolvedSupplier || undefined,
          supplier: resolvedSupplier || it.supplier,
          quotedSupplier: it.quotedSupplier || it.supplier,
          actualShippingCost: Number(purchaseForm.actualShipping),
          shippingPending: Boolean(purchaseForm.shippingPending),
          paymentMethod: purchaseForm.paymentMethod,
          purchasedAt: purchaseForm.purchaseDate,
          actualTaxPercent: Number(purchaseForm.taxPercent),
          purchaseNotes: purchaseForm.notes?.trim() || undefined
        };
      }
      return it;
    });

    // Registra imediatamente no storage dedicado de compras para blindagem absoluta contra F5
    const targetRecordItemId = activeItemForPurchase.splitFromId 
      ? activeItemForPurchase.id 
      : (activeItemForPurchase.itemId || activeItemForPurchase.id);

    savePurchasedProcurementRecord({
      itemId: targetRecordItemId,
      itemNumber: activeItemForPurchase.splitFromId ? undefined : activeItemForPurchase.itemNumber,
      quoteId: targetQuote.id,
      quoteCode: targetQuote.code,
      clientOrderNumber: effectiveOrderNum,
      imageUrl: effectiveImg,
      name: activeItemForPurchase.name,
      purchaseStatus: 'purchased',
      actualCostPrice: Number(purchaseForm.actualCost),
      actualUnitCostPrice: Number(purchaseForm.actualUnitCost),
      actualPurchaseUrl: purchaseForm.actualPurchaseUrl?.trim() || undefined,
      actualSupplier: resolvedSupplier || undefined,
      supplier: resolvedSupplier || activeItemForPurchase.supplier,
      quotedSupplier: activeItemForPurchase.quotedSupplier || activeItemForPurchase.supplier,
      actualShippingCost: Number(purchaseForm.actualShipping),
      shippingPending: Boolean(purchaseForm.shippingPending),
      paymentMethod: purchaseForm.paymentMethod,
      purchasedAt: purchaseForm.purchaseDate,
      purchaseNotes: purchaseForm.notes?.trim() || undefined,
      actualTaxPercent: Number(purchaseForm.taxPercent)
    });

    if (effectiveImg) {
      saveProductImageToCache({
        name: activeItemForPurchase.name,
        partNumber: activeItemForPurchase.partNumber
      }, effectiveImg);
    }

    onUpdateQuote({
      ...targetQuote,
      clientOrderNumber: effectiveOrderNum || targetQuote.clientOrderNumber,
      items: updatedItems
    });
    setActiveItemForPurchase(null);
    showToast(`Compra de "${activeItemForPurchase.name}" registrada com sucesso!`);
  };

  // 8. Seletor Visual de Imagens Comerciais na Web
  const handleOpenImagePicker = (item: ProcurementItem, mode: 'card' | 'modal' = 'card') => {
    setImagePickerItem(item);
    setImagePickerTargetMode(mode);
    setIsImagePickerOpen(true);
  };

  const handleSelectImage = (newUrl: string) => {
    if (!imagePickerItem) return;

    // Salva no cache central persistente para alimentar propostas, estoque e compras
    saveProductImageToCache({
      name: imagePickerItem.name,
      partNumber: imagePickerItem.partNumber
    }, newUrl);

    if (imagePickerTargetMode === 'modal') {
      setPurchaseForm(prev => ({ ...prev, imageUrl: newUrl }));
      showToast('Foto do produto vinculada ao formulário de compra!');
    } else {
      // Aplica direto ao card clicado
      if (imagePickerItem.purchaseStatus === 'purchased') {
        savePurchasedProcurementRecord({
          itemId: imagePickerItem.splitFromId ? imagePickerItem.id : (imagePickerItem.itemId || imagePickerItem.id),
          itemNumber: imagePickerItem.itemNumber,
          quoteId: imagePickerItem.quoteId,
          quoteCode: imagePickerItem.quoteCode,
          name: imagePickerItem.name,
          imageUrl: newUrl,
          purchaseStatus: 'purchased'
        });
      }

      if (imagePickerItem.quoteId) {
        const targetQuote = quotes.find(q => 
          q.id === imagePickerItem.quoteId || 
          (q.code && imagePickerItem.quoteCode && q.code.toUpperCase() === imagePickerItem.quoteCode.toUpperCase())
        );
        if (targetQuote) {
          const updatedItems = (targetQuote.items || []).map(qIt => {
            if (
              (qIt.id && imagePickerItem.itemId && qIt.id === imagePickerItem.itemId) ||
              (qIt.itemNumber !== undefined && imagePickerItem.itemNumber !== undefined && qIt.itemNumber === imagePickerItem.itemNumber) ||
              (qIt.name && imagePickerItem.name && normalizeSearchText(qIt.name) === normalizeSearchText(imagePickerItem.name))
            ) {
              return { ...qIt, imageUrl: newUrl, showImage: true };
            }
            return qIt;
          });
          onUpdateQuote({ ...targetQuote, items: updatedItems });
        }
      } else if (imagePickerItem.isDirectPurchase) {
        saveOrUpdateDirectPurchase({ ...imagePickerItem, imageUrl: newUrl });
      }

      setImageVersion(v => v + 1);
      showToast(`Foto de "${imagePickerItem.name}" atualizada com sucesso!`);
    }

    setIsImagePickerOpen(false);
    setImagePickerItem(null);
  };

  // 1. Desfazer Compra Realizada (retornando o item para o status 'A Comprar')
  const handleDeletePurchase = (item: ProcurementItem) => {
    removePurchasedProcurementRecord(
      item.splitFromId ? item.id : (item.itemId || item.id), 
      item.quoteId, 
      item.quoteCode, 
      item.itemNumber, 
      item.name
    );

    if (item.isDirectPurchase) {
      // Compra direta: reverte para pending e limpa campos reais
      const cleaned: ProcurementItem = { ...item };
      cleaned.purchaseStatus = 'pending';
      delete cleaned.actualCostPrice;
      delete cleaned.actualUnitCostPrice;
      delete cleaned.actualPurchaseUrl;
      delete cleaned.actualShippingCost;
      delete cleaned.paymentMethod;
      delete cleaned.purchasedAt;
      delete cleaned.purchaseNotes;
      delete cleaned.shippingPending;
      if (cleaned.quotedSupplier) {
        cleaned.supplier = cleaned.quotedSupplier;
      }
      delete cleaned.actualSupplier;
      delete cleaned.quotedSupplier;
      const updated = saveOrUpdateDirectPurchase(cleaned);
      setDirectPurchases(updated);
      showToast(`Registro de compra de "${item.name}" desfeito. Item retornou para "A Comprar".`);
      return;
    }

    // Compra de proposta: reverte para pending e limpa campos reais
    const targetQuote = quotes.find(q => 
      q.id === item.quoteId || 
      (q.code && item.quoteCode && q.code.trim().toUpperCase() === item.quoteCode.trim().toUpperCase())
    );
    if (!targetQuote) return;

    const updatedItems = (targetQuote.items || []).map(it => {
      const isMatch = (it.id && item.itemId && it.id === item.itemId) ||
                      (it.itemNumber !== undefined && item.itemNumber !== undefined && it.itemNumber === item.itemNumber) ||
                      (it.name && item.name && it.name.trim().toLowerCase() === item.name.trim().toLowerCase());

      if (isMatch) {
        const cleaned = { ...it };
        cleaned.purchaseStatus = 'pending' as const;
        delete cleaned.actualCostPrice;
        delete cleaned.actualUnitCostPrice;
        delete cleaned.actualPurchaseUrl;
        delete cleaned.actualShippingCost;
        delete cleaned.shippingPending;
        delete cleaned.paymentMethod;
        delete cleaned.purchasedAt;
        delete cleaned.purchaseNotes;
        delete cleaned.actualTaxPercent;
        if (cleaned.quotedSupplier) {
          cleaned.supplier = cleaned.quotedSupplier;
        }
        delete cleaned.actualSupplier;
        delete cleaned.quotedSupplier;
        return cleaned;
      }
      return it;
    });

    onUpdateQuote({
      ...targetQuote,
      items: updatedItems
    });
    showToast(`Registro de compra de "${item.name}" desfeito. Item retornou para "A Comprar".`);
  };

  // 2. Remover Item Definitivamente da Central de Compras (avulso OU de proposta)
  const handleRemoveItemPermanently = (item: ProcurementItem) => {
    const isDirect = item.isDirectPurchase;
    const msg = isDirect
      ? `Deseja excluir "${item.name}" definitivamente da Central de Compras?\n\nO item será removido permanentemente e não voltará mais ao recarregar a página.`
      : `Deseja remover "${item.name}" definitivamente da Central de Compras?\n\nO item será desvinculado da lista de compras da proposta ${item.quoteCode}.`;

    if (window.confirm(msg)) {
      if (isDirect) {
        // 1. Atualização Otimista Imediata no React State
        setDirectPurchases(prev => prev.filter(i => i.id !== item.id && i.itemId !== item.id));
        // 2. Remoção do Storage local (com registro em blacklist) e Supabase
        deleteDirectPurchaseItem(item.id);
        showToast(`Item "${item.name}" excluído definitivamente!`);
      } else {
        // Item de proposta: desaprova para compras e atualiza proposta no Supabase/localStorage
        const targetQuote = quotes.find(q => q.id === item.quoteId);
        if (!targetQuote) return;

        const updatedItems = (targetQuote.items || []).map(it => {
          if (it.id === item.itemId || it.id === item.id) {
            return {
              ...it,
              approved: false, // Retira da fila da Central de Compras
              approvedQuantity: 0,
              purchaseStatus: 'pending' as const
            };
          }
          return it;
        });

        onUpdateQuote({
          ...targetQuote,
          items: updatedItems
        });
        showToast(`Item "${item.name}" removido da Central de Compras!`);
      }
    }
  };

  // Adição Rápida de Nova Forma de Pagamento no Modal
  const handleQuickAddPaymentMethod = () => {
    const clean = newPaymentMethodName.trim();
    if (!clean) return;
    const updated = saveRegisteredPaymentMethod(clean);
    setPaymentMethodsList(updated);
    setPurchaseForm(prev => ({ ...prev, paymentMethod: clean }));
    setNewPaymentMethodName('');
    setIsAddingNewPaymentMethod(false);
  };

  // Selecionar Produto do Estoque
  const handleSelectStockProduct = (product: Product) => {
    setSelectedStockProduct(product);
    setProductSearchTerm(product.name);
    setIsProductDropdownOpen(false);
    setDirectPurchaseForm(prev => ({
      ...prev,
      productId: product.id,
      name: product.name,
      partNumber: product.partNumber || product.sku || '',
      ncm: product.ncm || '',
      unit: product.unit || prev.unit || 'un',
      costPrice: product.costPrice || prev.costPrice || 0,
      sellingPrice: product.sellingPrice || product.costPrice || 0,
      supplier: product.supplier || prev.supplier || '',
      sourceUrl: product.sourceUrl || prev.sourceUrl || '',
      imageUrl: product.imageUrl || prev.imageUrl || ''
    }));
  };

  // Limpar Produto Selecionado para permitir nova busca
  const handleClearSelectedProduct = () => {
    setSelectedStockProduct(null);
    setProductSearchTerm('');
    setIsProductDropdownOpen(true);
    setDirectPurchaseForm(prev => ({
      ...prev,
      productId: undefined,
      name: '',
      partNumber: '',
      ncm: '',
      costPrice: 0,
      sellingPrice: 0,
      supplier: '',
      sourceUrl: '',
      imageUrl: ''
    }));
  };

  // Abrir Modal de Nova Compra Avulsa
  const handleOpenNewDirectPurchaseModal = (prefill?: Partial<typeof directPurchaseForm>) => {
    const freshProducts = getProducts();
    setStockProducts(freshProducts);

    // Tenta encontrar o produto no estoque pelo prefill (por ID, partNumber ou nome)
    let matchingProduct: Product | null = null;
    if (prefill?.productId) {
      matchingProduct = freshProducts.find(p => p.id === prefill.productId) || null;
    }
    if (!matchingProduct && prefill?.name) {
      const normPrefillName = normalizeSearchText(prefill.name);
      matchingProduct = freshProducts.find(p => {
        if (prefill.partNumber && p.partNumber && normalizeSearchText(p.partNumber) === normalizeSearchText(prefill.partNumber)) {
          return true;
        }
        return normalizeSearchText(p.name) === normPrefillName;
      }) || null;
    }

    if (matchingProduct) {
      setSelectedStockProduct(matchingProduct);
      setProductSearchTerm(matchingProduct.name);
    } else {
      setSelectedStockProduct(null);
      setProductSearchTerm(prefill?.name || '');
    }

    setIsProductDropdownOpen(false);

    const clientPrefill = prefill?.clientCompany
      ? (prefill.clientCompany.startsWith('Infodesk') ? prefill.clientCompany : formatCompanyPrefix(prefill.clientCompany))
      : 'Infodesk (Uso Interno / Estoque)';

    setDirectPurchaseForm({
      productId: matchingProduct?.id,
      name: matchingProduct?.name || prefill?.name || '',
      partNumber: matchingProduct?.partNumber || matchingProduct?.sku || prefill?.partNumber || '',
      ncm: matchingProduct?.ncm || prefill?.ncm || '',
      quantity: prefill?.quantity || 1,
      unit: matchingProduct?.unit || prefill?.unit || 'un',
      clientCompany: clientPrefill,
      clientOrderNumber: prefill?.clientOrderNumber || '',
      supplier: matchingProduct?.supplier || prefill?.supplier || '',
      costPrice: matchingProduct?.costPrice || prefill?.costPrice || 0,
      sellingPrice: matchingProduct?.sellingPrice || (prefill as any)?.sellingPrice || matchingProduct?.costPrice || 0,
      sourceUrl: matchingProduct?.sourceUrl || prefill?.sourceUrl || '',
      imageUrl: matchingProduct?.imageUrl || (prefill as any)?.imageUrl || '',
      initialStatus: prefill?.initialStatus || 'pending',
      actualCost: prefill?.actualCost || 0,
      paymentMethod: prefill?.paymentMethod || paymentMethodsList[0] || 'Cartão Amazon',
      purchaseDate: new Date().toISOString().split('T')[0],
      actualShipping: prefill?.actualShipping || 0,
      shippingPending: prefill?.shippingPending || false,
      notes: prefill?.notes || ''
    });
    setIsDirectPurchaseModalOpen(true);
  };

  // Salvar Nova Compra Avulsa (Regra: Apenas produtos cadastrados no estoque)
  const handleSaveDirectPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStockProduct) {
      alert('Atenção: A compra avulsa só pode ser realizada para um produto previamente cadastrado no estoque.');
      return;
    }

    const cleanName = selectedStockProduct.name;
    const qty = Math.max(1, Number(directPurchaseForm.quantity) || 1);
    const cost = Number(directPurchaseForm.costPrice) || selectedStockProduct.costPrice || 0;
    const sellingUnit = Number(directPurchaseForm.sellingPrice) > 0
      ? Number(directPurchaseForm.sellingPrice)
      : (selectedStockProduct.sellingPrice || (cost > 0 ? cost : 0));
    const id = `direct-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const rawClient = directPurchaseForm.clientCompany.trim();
    const resolvedClient = (rawClient === 'Infodesk (Uso Interno / Estoque)' || !rawClient)
      ? 'Infodesk (Uso Interno / Estoque)'
      : formatCompanyPrefix(rawClient);

    const newItem: ProcurementItem = {
      id,
      quoteId: 'direct_purchases',
      quoteCode: 'COMPRA DIRETA',
      clientOrderNumber: directPurchaseForm.clientOrderNumber.trim() || undefined,
      clientCompany: resolvedClient,
      itemId: id,
      productId: selectedStockProduct.id,
      name: cleanName,
      partNumber: selectedStockProduct.partNumber || directPurchaseForm.partNumber.trim() || undefined,
      ncm: selectedStockProduct.ncm || directPurchaseForm.ncm.trim() || undefined,
      imageUrl: selectedStockProduct.imageUrl || directPurchaseForm.imageUrl.trim() || undefined,
      quantity: qty,
      unit: directPurchaseForm.unit || selectedStockProduct.unit || 'un',
      quotedCostPrice: cost,
      quotedUnitPrice: sellingUnit,
      quotedTotalPrice: Number((sellingUnit * qty).toFixed(2)),
      supplier: directPurchaseForm.supplier.trim() || selectedStockProduct.supplier || undefined,
      sourceUrl: directPurchaseForm.sourceUrl.trim() || selectedStockProduct.sourceUrl || undefined,
      purchaseStatus: directPurchaseForm.initialStatus,
      taxPercent: defaultTax,
      isDirectPurchase: true,
      approvedAt: new Date().toISOString()
    };

    if (directPurchaseForm.initialStatus === 'purchased') {
      const realTotal = Number(directPurchaseForm.actualCost) || (cost * qty);
      newItem.actualCostPrice = realTotal;
      newItem.actualUnitCostPrice = qty > 0 ? Number((realTotal / qty).toFixed(2)) : cost;
      newItem.actualPurchaseUrl = directPurchaseForm.sourceUrl.trim() || selectedStockProduct.sourceUrl || undefined;
      newItem.actualShippingCost = Number(directPurchaseForm.actualShipping) || 0;
      newItem.shippingPending = Boolean(directPurchaseForm.shippingPending);
      newItem.paymentMethod = directPurchaseForm.paymentMethod;
      newItem.purchasedAt = directPurchaseForm.purchaseDate;
      newItem.purchaseNotes = directPurchaseForm.notes.trim() || undefined;
    }

    saveOrUpdateDirectPurchase(newItem);
    setIsDirectPurchaseModalOpen(false);
  };

  // Copiar link para o clipboard
  const handleCopyLink = (url: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  // Alternar colapso de proposta no modo agrupado
  const toggleQuoteCollapse = (quoteId: string) => {
    setCollapsedQuotes(prev => ({
      ...prev,
      [quoteId]: !prev[quoteId]
    }));
  };

  // Alternar colapso de fornecedor no modo agrupado
  const toggleSupplierCollapse = (supplierName: string) => {
    setCollapsedSuppliers(prev => ({
      ...prev,
      [supplierName]: !prev[supplierName]
    }));
  };

  // Copiar Pedido de Compra formatado para WhatsApp do Vendedor/Representante
  const handleCopySupplierPurchaseOrder = (group: {
    supplierName: string;
    items: ProcurementItem[];
    totalQuantity: number;
    totalEstimatedCost: number;
  }) => {
    const dateStr = new Date().toLocaleDateString('pt-BR');
    const itemsLines = group.items.map((it, idx) => {
      const skuStr = it.partNumber ? ` (Cód/SKU: ${it.partNumber})` : '';
      const ocStr = it.clientOrderNumber ? ` [OC: ${it.clientOrderNumber}]` : '';
      const unitCost = it.quotedCostPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `${idx + 1}. *${it.name}*${skuStr}${ocStr}\n   • Qtd: *${it.quantity} ${it.unit || 'un'}* | Ref: R$ ${unitCost}`;
    }).join('\n\n');

    const totalStr = group.totalEstimatedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const message = `📋 *PEDIDO DE COMPRA / COTAÇÃO - INFODESK*
🗓️ *Data:* ${dateStr}
🤝 *Fornecedor:* ${group.supplierName}

📦 *ITENS SOLICITADOS:*
${itemsLines}

━━━━━━━━━━━━━━━━━━━━━━━━
💰 *Total Previsto:* R$ ${totalStr} (${group.totalQuantity} itens)
📍 *Entrega:* Brasília - DF

Olá! Poderia confirmar a disponibilidade destes itens para faturamento imediato para a Infodesk Tecnologia? Obrigado!`;

    navigator.clipboard.writeText(message);
    showToast(`Pedido de compra para "${group.supplierName}" copiado para a área de transferência!`);
  };

  // Abrir WhatsApp com Pedido de Compra Pré-preenchido
  const handleOpenWhatsAppSupplierOrder = (group: {
    supplierName: string;
    items: ProcurementItem[];
    totalQuantity: number;
    totalEstimatedCost: number;
  }) => {
    const dateStr = new Date().toLocaleDateString('pt-BR');
    const itemsLines = group.items.map((it, idx) => {
      const skuStr = it.partNumber ? ` (Cód/SKU: ${it.partNumber})` : '';
      const ocStr = it.clientOrderNumber ? ` [OC: ${it.clientOrderNumber}]` : '';
      const unitCost = it.quotedCostPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `${idx + 1}. *${it.name}*${skuStr}${ocStr}\n   • Qtd: *${it.quantity} ${it.unit || 'un'}* | Ref: R$ ${unitCost}`;
    }).join('\n\n');

    const totalStr = group.totalEstimatedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const message = `📋 *PEDIDO DE COMPRA / COTAÇÃO - INFODESK*
🗓️ *Data:* ${dateStr}
🤝 *Fornecedor:* ${group.supplierName}

📦 *ITENS SOLICITADOS:*
${itemsLines}

━━━━━━━━━━━━━━━━━━━━━━━━
💰 *Total Previsto:* R$ ${totalStr} (${group.totalQuantity} itens)
📍 *Entrega:* Brasília - DF

Olá! Poderia confirmar a disponibilidade destes itens para faturamento imediato para a Infodesk Tecnologia? Obrigado!`;

    const encoded = encodeURIComponent(message);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  // Exportar Excel
  const handleExportExcel = async () => {
    try {
      const { exportPurchasesToExcel } = await import('../utils/excelExport');
      exportPurchasesToExcel(filteredItems);
    } catch (err) {
      console.error('Erro ao exportar compras para Excel:', err);
    }
  };

  // Limpar todos os filtros
  const handleResetFilters = () => {
    setStatusFilter('all');
    setPeriodFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setSelectedCompany('all');
    setSelectedPaymentMethod('all');
    setSelectedSupplier('all');
    setSearchTerm('');
  };

  const hasActiveFilters = statusFilter !== 'pending' || 
    periodFilter !== 'all' || 
    selectedCompany !== 'all' || 
    selectedPaymentMethod !== 'all' || 
    selectedSupplier !== 'all' || 
    Boolean(searchTerm);

  return (
    <div className="space-y-6">
      {/* 1. Header Oficial do Sistema */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="sq-page-title flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-sky-600" />
              <span>Central de Compras</span>
            </h1>
          </div>
          <p className="sq-page-subtitle">
            Acompanhe compras aprovadas de propostas, cadastre novas compras, consulte preços pagos e concilie faturas.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {/* Botão de Nova Compra Avulsa (Independente de Orçamento) */}
          <button
            type="button"
            onClick={() => handleOpenNewDirectPurchaseModal()}
            className="sq-btn-primary"
            title="Cadastrar um item a comprar fora de proposta comercial (uso interno, insumo ou urgência)"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Compra</span>
          </button>

          {/* Alternador de Modo de Visualização */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto no-scrollbar max-w-full shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('items')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'items'
                  ? 'bg-white text-sky-700 shadow-2xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Ver produtos em lista individual"
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista de Itens</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('quotes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'quotes'
                  ? 'bg-white text-sky-700 shadow-2xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Agrupar produtos por Proposta Comercial"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Por Proposta</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('suppliers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'suppliers'
                  ? 'bg-white text-sky-700 shadow-2xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Agrupar produtos por Fornecedor (Kabum, Fujioka, etc.) e gerar Pedido de Compra"
            >
              <Building2 className="w-3.5 h-3.5 text-sky-600" />
              <span>Por Fornecedor ({supplierGroups.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('reference')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'reference'
                  ? 'bg-white text-emerald-800 shadow-2xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Consultar histórico de produtos já comprados e preços pagos como referência"
            >
              <History className="w-3.5 h-3.5 text-emerald-600" />
              <span>Referência de Preços ({purchasedReferenceCatalog.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="sq-btn-excel"
            title="Exportar planilha de compras com fórmulas idênticas a Compras 2026.xlsx"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Exportar Excel</span>
          </button>
        </div>
      </div>

      {/* 2. Cards de Métricas Superiores Consolidadas do Filtro (Padrão AGENTS.md) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Itens a Comprar */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              A Comprar
            </span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-amber-600">
              {stats.pendingCount}
            </span>
            <span className="text-xs text-slate-400">produtos</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block mt-1">
            Investimento previsto: R$ {stats.pendingCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Itens Comprados */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Itens Comprados
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-600">
              {stats.purchasedCount}
            </span>
            <span className="text-xs text-slate-400">adquiridos</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block mt-1">
            Venda aprovada: R$ {stats.purchasedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Custo Real Desembolsado & Saving */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Custo Real Pago
            </span>
            <DollarSign className="w-4 h-4 text-slate-400" />
          </div>
          <span className="text-xl sm:text-2xl font-bold font-mono text-slate-800 block mt-1">
            R$ {stats.purchasedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {stats.purchasedCount > 0 ? (
            <span className={`text-[10px] font-bold block mt-1 font-mono ${stats.saving >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {stats.saving >= 0 
                ? `Economia de R$ ${stats.saving.toFixed(2)} vs cotado` 
                : `R$ ${Math.abs(stats.saving).toFixed(2)} acima do cotado`}
            </span>
          ) : (
            <span className="text-[10px] text-slate-400 font-medium block mt-1">
              Nenhuma compra no filtro
            </span>
          )}
        </div>

        {/* Lucro Líquido Realizado */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Lucro Líquido
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-700 block mt-1">
            R$ {stats.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-emerald-600 font-semibold block mt-1 font-mono">
            {stats.roiMargin.toFixed(1)}% retorno (ROI)
          </span>
        </div>
      </div>

      {/* 3. Painel de Filtros Detalhados */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3.5">
        {/* Linha 1: Status Tabs + Limpar Filtros */}
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
              <span>Todos ({contextItems.length})</span>
            </button>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs text-slate-500 hover:text-rose-600 font-medium flex items-center gap-1 transition cursor-pointer self-end sm:self-auto"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpar Filtros</span>
            </button>
          )}
        </div>

        {/* Linha 2: Dropdowns de Filtro Detalhado */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Período */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400" />
              Período
            </label>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as PeriodOption)}
              className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-800 text-xs font-medium rounded-xl px-2.5 py-2 focus:outline-none focus:border-sky-500"
            >
              <option value="all">Todo o Histórico</option>
              <option value="today">Hoje</option>
              <option value="yesterday">Ontem</option>
              <option value="7days">Últimos 7 dias</option>
              <option value="30days">Últimos 30 dias</option>
              <option value="this_month">Este Mês</option>
              <option value="last_month">Mês Passado</option>
              <option value="custom">Personalizado (De / Até)...</option>
            </select>
          </div>

          {/* Cliente / Empresa */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-slate-400" />
              Cliente
            </label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-800 text-xs font-medium rounded-xl px-2.5 py-2 focus:outline-none focus:border-sky-500 truncate"
            >
              <option value="all">Todos os Clientes ({availableCompanies.length})</option>
              {availableCompanies.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Forma de Pagamento */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
              <CreditCard className="w-3 h-3 text-slate-400" />
              Forma de Pagamento
            </label>
            <select
              value={selectedPaymentMethod}
              onChange={(e) => setSelectedPaymentMethod(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-800 text-xs font-medium rounded-xl px-2.5 py-2 focus:outline-none focus:border-sky-500 truncate"
            >
              <option value="all">Todas as Formas de Pgto</option>
              {availablePaymentMethods.map(pm => (
                <option key={pm} value={pm}>{pm}</option>
              ))}
            </select>
          </div>

          {/* Fornecedor */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-slate-400" />
              Fornecedor
            </label>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-800 text-xs font-medium rounded-xl px-2.5 py-2 focus:outline-none focus:border-sky-500 truncate"
            >
              <option value="all">Todos os Fornecedores ({availableSuppliers.length})</option>
              {availableSuppliers.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Linha Opcional: Intervalo Customizado De / Até */}
        {periodFilter === 'custom' && (
          <div className="p-3 bg-sky-50/60 border border-sky-200/80 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fadeIn">
            <div>
              <label className="block text-[10px] font-bold text-sky-800 uppercase mb-1">
                Data Inicial (De)
              </label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full bg-white border border-sky-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-sky-800 uppercase mb-1">
                Data Final (Até)
              </label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full bg-white border border-sky-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono"
              />
            </div>
          </div>
        )}

        {/* Linha 3: Barra de Pesquisa */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4. Renderização do Conteúdo de Acordo com o Modo de Visualização */}

      {/* MODO 1: REFERÊNCIA DE PREÇOS PAGOS (CATÁLOGO DE HISTÓRICO) */}
      {viewMode === 'reference' ? (
        <div className="space-y-4">
          <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-sky-100 text-sky-700 rounded-xl">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Catálogo de Referência de Compras Realizadas
                </h3>
                <p className="text-xs text-slate-500">
                  Consulte os preços unitários pagos, fornecedores e links reais onde comprou para usar como base para novas aquisições.
                </p>
              </div>
            </div>

            <span className="text-xs font-mono font-bold text-sky-800 bg-white px-3 py-1 rounded-xl border border-sky-200 shadow-2xs">
              {filteredReferenceCatalog.length} produto(s) no histórico
            </span>
          </div>

          {filteredReferenceCatalog.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-lg mx-auto shadow-xs space-y-3">
              <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mx-auto border border-sky-100">
                <History className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Nenhum produto de referência encontrado
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {searchTerm
                  ? `Nenhum produto comprado coincide com o termo "${searchTerm}".`
                  : 'Assim que você registrar as compras de produtos, eles formarão automaticamente seu catálogo de preços e fornecedores de referência.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredReferenceCatalog.map(item => (
                <div
                  key={item.normalizedKey}
                  className="bg-white border border-slate-200 hover:border-sky-300 rounded-2xl p-4 shadow-xs transition hover:shadow-sm flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {item.partNumber && (
                          <span className="text-[10.5px] font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200 inline-block mb-1">
                            SKU: {item.partNumber}
                          </span>
                        )}
                        <h4 className="text-sm font-bold text-slate-900 line-clamp-2">
                          {item.name}
                        </h4>
                      </div>

                      {/* Card Preço Referência */}
                      <div className="text-right shrink-0">
                        <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                          Último Unitário
                        </span>
                        <span className="text-base font-mono font-bold text-emerald-700">
                          R$ {item.lastUnitCost.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          /{item.unit}
                        </span>
                      </div>
                    </div>

                    {/* Variação e Estatísticas */}
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs text-slate-600 flex-wrap gap-2">
                      <span>
                        Fornecedor: <strong className="text-slate-800">{item.lastSupplier || 'Não especificado'}</strong>
                      </span>
                      <span>
                        Comprado: <strong className="text-slate-800">{item.purchaseCount}x</strong> ({item.totalQuantity} {item.unit})
                      </span>
                      {item.purchaseCount > 1 && item.minUnitCost !== item.maxUnitCost && (
                        <span className="text-[11px] font-mono text-slate-500">
                          Faixa: R$ {item.minUnitCost.toFixed(2)} ~ R$ {item.maxUnitCost.toFixed(2)}
                        </span>
                      )}
                      {item.lastPurchasedAt && (
                        <span className="text-slate-400 text-[11px]">
                          Última em: {formatDatePtBr(item.lastPurchasedAt)} ({item.lastClient})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ações Rápidas de Referência */}
                  <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item.lastPurchaseUrl && (
                        <>
                          <a
                            href={item.lastPurchaseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition cursor-pointer"
                            title="Abrir o link onde este produto foi comprado da última vez"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Abrir Link da Loja</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => handleCopyLink(item.lastPurchaseUrl!)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium transition cursor-pointer"
                            title="Copiar URL para área de transferência"
                          >
                            {copiedUrl === item.lastPurchaseUrl ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-700 font-bold">Copiado!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copiar</span>
                              </>
                            )}
                          </button>
                        </>
                      )}
                    </div>

                    {/* Botão Comprar Novamente */}
                    <button
                      type="button"
                      onClick={() => handleOpenNewDirectPurchaseModal({
                        name: item.name,
                        partNumber: item.partNumber || '',
                        ncm: item.ncm || '',
                        unit: item.unit,
                        supplier: item.lastSupplier || '',
                        costPrice: item.lastUnitCost,
                        sourceUrl: item.lastPurchaseUrl || '',
                        initialStatus: 'pending',
                        clientCompany: item.lastClient || 'Infodesk (Uso Interno / Estoque)'
                      })}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
                      title="Abrir formulário de nova compra com estes dados pré-preenchidos"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Comprar Novamente</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-lg mx-auto shadow-xs space-y-3">
          <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mx-auto border border-sky-100">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            Nenhum item encontrado
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {hasActiveFilters
              ? 'Nenhum produto corresponde aos filtros selecionados. Tente ajustar os parâmetros ou clique em Limpar Filtros.'
              : statusFilter === 'pending'
                ? 'Excelente! Não há itens pendentes de compra no momento.'
                : 'Nenhum produto comprado cadastrado ainda.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Restaurar Filtros
            </button>
          )}
        </div>
      ) : viewMode === 'quotes' ? (
        /* MODO AGRUPADO POR PROPOSTA */
        <div className="space-y-4">
          {groupedByQuote.map(group => {
            const isCollapsed = Boolean(collapsedQuotes[group.quoteId]);
            const isDirectGroup = group.quoteId === 'direct_purchases';

            return (
              <div 
                key={group.quoteId}
                className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden transition"
              >
                {/* Cabeçalho da Proposta */}
                <div 
                  onClick={() => toggleQuoteCollapse(group.quoteId)}
                  className="p-4 sm:p-5 bg-gradient-to-r from-slate-50/80 to-white flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 transition border-b border-slate-100"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded-lg border ${
                        isDirectGroup 
                          ? 'bg-purple-50 text-purple-700 border-purple-200' 
                          : 'bg-sky-50 text-sky-700 border-sky-200'
                      }`}>
                        {group.quoteCode}
                      </span>
                      {group.clientOrderNumber && (
                        <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-lg border bg-amber-50 text-amber-900 border-amber-300 flex items-center gap-1 shadow-2xs">
                          <Tag className="w-3 h-3 text-amber-600" />
                          <span>OC: {group.clientOrderNumber}</span>
                        </span>
                      )}
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-500" />
                        {group.clientCompany}
                      </span>
                      {group.contactPerson && (
                        <span className="text-xs text-slate-400">
                          • {group.contactPerson}
                        </span>
                      )}
                    </div>

                    {/* Barra de Progresso de Compras */}
                    <div className="flex items-center gap-2 max-w-md pt-1">
                      <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${
                            group.percentComplete === 100 
                              ? 'bg-emerald-500' 
                              : group.percentComplete > 0 
                                ? 'bg-amber-500' 
                                : 'bg-slate-300'
                          }`}
                          style={{ width: `${group.percentComplete}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-mono font-bold text-slate-600 shrink-0">
                        {group.purchasedCount}/{group.totalItems} ({group.percentComplete}%)
                      </span>
                    </div>
                  </div>

                  {/* Resumo Financeiro da Proposta */}
                  <div className="flex items-center gap-4 sm:gap-6 shrink-0 self-end md:self-auto">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                        Venda Total
                      </span>
                      <span className="text-sm sm:text-base font-mono font-bold text-slate-900">
                        R$ {group.totalQuotedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                        Custo Comprado
                      </span>
                      <span className="text-sm sm:text-base font-mono font-bold text-emerald-700">
                        R$ {group.totalActualCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="p-1 rounded-lg text-slate-400 hover:text-slate-700 transition">
                      {isCollapsed ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronUp className="w-5 h-5" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Itens da Proposta (expansível) */}
                {!isCollapsed && (
                  <div className="p-3 sm:p-4 space-y-2.5 bg-slate-50/40">
                    {group.items.map(item => renderItemCard(item))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : viewMode === 'suppliers' ? (
        /* MODO AGRUPADO POR FORNECEDOR (KABUM, FUJIOKA, AMAZON...) */
        <div className="space-y-4">
          <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-sky-100 text-sky-700 rounded-xl">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Central de Compras por Fornecedor
                </h3>
                <p className="text-xs text-slate-500">
                  Agrupe os itens da sua cotação por distribuidor (Fujioka, Kabum, etc.) e copie o pedido de compra formatado para enviar no WhatsApp do vendedor.
                </p>
              </div>
            </div>

            <span className="text-xs font-mono font-bold text-sky-800 bg-white px-3 py-1 rounded-xl border border-sky-200 shadow-2xs">
              {supplierGroups.length} fornecedor(es) com itens
            </span>
          </div>

          {supplierGroups.map(group => {
            const isCollapsed = Boolean(collapsedSuppliers[group.supplierName]);
            return (
              <div
                key={group.supplierName}
                className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden transition"
              >
                {/* Cabeçalho do Fornecedor */}
                <div
                  onClick={() => toggleSupplierCollapse(group.supplierName)}
                  className="p-4 sm:p-5 bg-gradient-to-r from-slate-50/80 to-white flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 transition border-b border-slate-100"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 bg-sky-100 text-sky-800 border border-sky-200 text-xs font-bold rounded-lg flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-sky-600" />
                        {group.supplierName}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        • {group.items.length} produto(s) ({group.totalQuantity} unidades)
                      </span>
                      {group.pendingCount > 0 && (
                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          {group.pendingCount} pendente(s)
                        </span>
                      )}
                      {group.purchasedCount > 0 && (
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          {group.purchasedCount} comprado(s)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ações e Total */}
                  <div className="flex items-center gap-2 sm:gap-4 shrink-0 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    <div className="text-right mr-1">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                        Custo Estimado
                      </span>
                      <span className="text-sm sm:text-base font-mono font-bold text-slate-900">
                        R$ {group.totalEstimatedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopySupplierPurchaseOrder(group)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="Copiar lista de compras formatada para enviar no WhatsApp do vendedor"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-600" />
                      <span>Copiar Pedido</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenWhatsAppSupplierOrder(group)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="Abrir WhatsApp com o pedido de compra formatado"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-100" />
                      <span>WhatsApp</span>
                    </button>

                    <div 
                      onClick={() => toggleSupplierCollapse(group.supplierName)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 transition cursor-pointer"
                    >
                      {isCollapsed ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronUp className="w-5 h-5" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Itens do Fornecedor */}
                {!isCollapsed && (
                  <div className="p-3 sm:p-4 space-y-2.5 bg-slate-50/40">
                    {group.items.map(item => renderItemCard(item))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* MODO LISTA DE ITENS INDIVIDUAL (COM PAGINAÇÃO E OPÇÃO DE AGRUPAR POR DIA) */
        <div className="space-y-4">
          {/* Barra de Ferramentas da Lista: Contagem, Densidade e Agrupar por Dia */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs text-slate-600 font-medium">
                Mostrando <strong className="text-slate-900 font-bold">{filteredItems.length === 0 ? 0 : (itemsPerPage > 0 ? (currentPage - 1) * itemsPerPage + 1 : 1)}–{itemsPerPage > 0 ? Math.min(filteredItems.length, currentPage * itemsPerPage) : filteredItems.length}</strong> de <strong className="text-slate-900 font-bold">{filteredItems.length}</strong> itens
              </span>

              <span className="text-slate-300 hidden sm:inline">•</span>

              {/* Seletor de Itens por Página */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400">Por pág:</span>
                {[25, 50, 100].map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      setItemsPerPage(size);
                      setCurrentPage(1);
                    }}
                    className={`px-2 py-0.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      itemsPerPage === size
                        ? 'bg-sky-50 text-sky-800 border border-sky-300'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    {size}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setItemsPerPage(0);
                    setCurrentPage(1);
                  }}
                  className={`px-2 py-0.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    itemsPerPage === 0
                      ? 'bg-sky-50 text-sky-800 border border-sky-300'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  Todos
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
              {/* Botão Alternador: Agrupar por Dia */}
              <button
                type="button"
                onClick={() => setGroupByDay(!groupByDay)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                  groupByDay
                    ? 'bg-sky-50 text-sky-800 border-sky-300 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
                title="Agrupar produtos por dia de compra ou aprovação"
              >
                <Calendar className="w-3.5 h-3.5 text-sky-600" />
                <span>{groupByDay ? 'Agrupado por Dia' : 'Agrupar por Dia'}</span>
              </button>

              {/* Botões de Navegação de Página Rápidos */}
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    Ant.
                  </button>
                  <span className="text-xs font-mono font-bold text-slate-800 px-1.5">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    Próx.
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Lista de Itens: Agrupado por Dia OU Lista Direta Paginada */}
          {groupByDay ? (
            <div className="space-y-4">
              {paginatedGroupedByDate.map(group => {
                const isCollapsed = Boolean(collapsedDays[group.dateKey]);
                return (
                  <div key={group.dateKey} className="space-y-2.5">
                    {/* Header do Dia */}
                    <div
                      onClick={() => toggleDayCollapse(group.dateKey)}
                      className="p-3 bg-gradient-to-r from-slate-100/90 to-white border border-slate-200/90 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-slate-100 transition shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <div className="p-1.5 bg-sky-100 text-sky-700 rounded-lg">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                          {group.displayTitle}
                        </h4>
                        <span className="text-[11px] font-bold text-sky-800 bg-sky-50 px-2.5 py-0.5 rounded-lg border border-sky-200 font-mono">
                          {group.items.length} {group.items.length === 1 ? 'item' : 'itens'}
                        </span>
                        {group.purchasedCount > 0 && (
                          <span className="text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            {group.purchasedCount} comprado(s)
                          </span>
                        )}
                        {group.pendingCount > 0 && (
                          <span className="text-[10.5px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                            {group.pendingCount} pendente(s)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase block">Total do Dia</span>
                          <span className="text-xs sm:text-sm font-mono font-bold text-emerald-700">
                            R$ {group.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="p-1 rounded-lg text-slate-400 hover:text-slate-700 transition">
                          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="space-y-3 pl-1 sm:pl-3 border-l-2 border-sky-100">
                        {group.items.map(item => renderItemCard(item))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedItems.map(item => renderItemCard(item))}
            </div>
          )}

          {/* Rodapé de Paginação quando totalPages > 1 */}
          {totalPages > 1 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex items-center justify-between gap-3 mt-4">
              <span className="text-xs text-slate-500 font-medium">
                Página <strong className="text-slate-800">{currentPage}</strong> de <strong className="text-slate-800">{totalPages}</strong> ({filteredItems.length} compras no total)
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                  className="px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                  title="Primeira Página"
                >
                  «
                </button>
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  Anterior
                </button>
                <span className="text-xs font-mono font-bold text-sky-800 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200">
                  {currentPage}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  Próxima
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                  title="Última Página"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Modal de Efetivação / Registro de Compra */}
      {activeItemForPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-scaleIn max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Oficial do Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-gradient-to-r from-slate-50 to-white shrink-0">
              <div className="flex items-start gap-3.5 min-w-0">
                <div 
                  className="relative group w-14 h-14 rounded-2xl border border-slate-200 bg-white p-1.5 shrink-0 overflow-hidden flex items-center justify-center shadow-2xs hover:border-sky-400 transition cursor-pointer"
                  onClick={() => handleOpenImagePicker(activeItemForPurchase, 'modal')}
                  title="Clique para buscar ou trocar a foto do produto na web"
                >
                  {(purchaseForm.imageUrl || activeItemForPurchase.imageUrl) ? (
                    <img
                      src={purchaseForm.imageUrl || activeItemForPurchase.imageUrl}
                      alt={activeItemForPurchase.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <Package className="w-5 h-5 text-slate-300" />
                      <span className="text-[8px] font-bold text-sky-600 mt-0.5">Buscar</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-slate-900/65 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition rounded-2xl backdrop-blur-2xs">
                    <Camera className="w-4 h-4 text-white" />
                    <span className="text-[8.5px] font-bold mt-0.5">Trocar</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-0.5 text-xs font-bold font-mono uppercase tracking-wider rounded-lg border ${
                      activeItemForPurchase.purchaseStatus === 'purchased'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-sky-50 text-sky-700 border-sky-200'
                    }`}>
                      {activeItemForPurchase.purchaseStatus === 'purchased' ? 'EDITAR COMPRA' : 'REGISTRO DE COMPRA'}
                    </span>

                    {activeItemForPurchase.isDirectPurchase ? (
                      <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-bold font-mono rounded-md">
                        COMPRA AVULSA
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold font-mono rounded-md">
                        {activeItemForPurchase.quoteCode}
                      </span>
                    )}

                    {activeItemForPurchase.splitBatchNumber && (
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold font-mono rounded-md flex items-center gap-1">
                        <Scissors className="w-3 h-3 text-indigo-600" />
                        <span>Lote {activeItemForPurchase.splitBatchNumber}/{activeItemForPurchase.splitTotalBatches}</span>
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-slate-900 mt-1 line-clamp-1">
                    {activeItemForPurchase.name}
                  </h3>

                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                    <span>Qtd: <strong className="text-slate-800 font-mono font-bold">{activeItemForPurchase.quantity} {activeItemForPurchase.unit}</strong></span>
                    <span>•</span>
                    <span>Cliente: <strong className="text-slate-800">{activeItemForPurchase.clientCompany.startsWith('Infodesk') ? activeItemForPurchase.clientCompany : formatCompanyPrefix(activeItemForPurchase.clientCompany)}</strong></span>
                    {activeItemForPurchase.clientOrderNumber && (
                      <>
                        <span>•</span>
                        <span className="text-amber-800 font-mono font-bold">OC: {activeItemForPurchase.clientOrderNumber}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveItemForPurchase(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulário Reorganizado por Seções Lógicas */}
            <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">

              {/* SEÇÃO 1: ONDE E COMO COMPROU */}
              <div className="bg-slate-50/70 border border-slate-200/90 rounded-2xl p-4 space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Store className="w-4 h-4 text-emerald-600" />
                    <span>1. Fornecedor & Pagamento</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 font-medium">Dados de aquisição</span>
                </div>

                {/* Fornecedor e Link da Loja */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <span>Fornecedor / Loja Real *</span>
                      </span>
                      {activeItemForPurchase.supplier && activeItemForPurchase.supplier !== purchaseForm.actualSupplier && (
                        <span className="text-[10px] text-slate-400">
                          Cotado: {activeItemForPurchase.supplier}
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={purchaseForm.actualSupplier}
                      onChange={(e) => setPurchaseForm(prev => ({ ...prev, actualSupplier: e.target.value }))}
                      className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm text-slate-900 font-medium"
                    />
                    {/* Botões rápidos das principais lojas */}
                    <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-400 flex-wrap">
                      <span>Sugestões:</span>
                      {['Amazon', 'KaBuM!', 'Mercado Livre', 'Shopee', 'Kalunga'].map(store => (
                        <button
                          key={store}
                          type="button"
                          onClick={() => setPurchaseForm(prev => ({ ...prev, actualSupplier: store }))}
                          className={`hover:underline cursor-pointer font-medium px-1.5 py-0.5 rounded ${
                            purchaseForm.actualSupplier === store 
                              ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 font-bold' 
                              : 'text-sky-600 hover:text-sky-800'
                          }`}
                        >
                          {store}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5 text-sky-600" />
                        <span>Link da Compra (URL)</span>
                      </span>
                      {purchaseForm.actualPurchaseUrl && (
                        <a
                          href={purchaseForm.actualPurchaseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-600 hover:text-sky-800 text-[11px] font-bold inline-flex items-center gap-1 transition"
                        >
                          <span>Abrir Link</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </label>
                    <input
                      type="url"
                      value={purchaseForm.actualPurchaseUrl}
                      onChange={(e) => handlePurchaseUrlChange(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs text-slate-900 truncate"
                    />
                    {activeItemForPurchase.sourceUrl && activeItemForPurchase.sourceUrl !== purchaseForm.actualPurchaseUrl && (
                      <p className="text-[10px] text-slate-400 mt-1 truncate">
                        Link cotado anterior:{' '}
                        <a 
                          href={activeItemForPurchase.sourceUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-slate-500 hover:text-sky-700 underline"
                        >
                          {activeItemForPurchase.sourceUrl}
                        </a>
                      </p>
                    )}
                  </div>
                </div>

                {/* Foto do Produto com Busca na Web */}
                <div className="pt-2 border-t border-slate-200/60">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-sky-600" />
                      <span>Foto do Produto (Catálogo / Proposta)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleOpenImagePicker(activeItemForPurchase, 'modal')}
                      className="text-[11px] font-bold text-sky-600 hover:text-sky-800 flex items-center gap-1 transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Buscar Foto na Web</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div 
                      className="w-10 h-10 rounded-xl border border-slate-200 bg-white p-1 shrink-0 overflow-hidden flex items-center justify-center cursor-pointer hover:border-sky-400 transition"
                      onClick={() => handleOpenImagePicker(activeItemForPurchase, 'modal')}
                      title="Clique para buscar foto"
                    >
                      {(purchaseForm.imageUrl || activeItemForPurchase.imageUrl) ? (
                        <img 
                          src={purchaseForm.imageUrl || activeItemForPurchase.imageUrl} 
                          alt={activeItemForPurchase.name} 
                          className="w-full h-full object-contain" 
                        />
                      ) : (
                        <Package className="w-4 h-4 text-slate-300" />
                      )}
                    </div>
                    <input
                      type="url"
                      value={purchaseForm.imageUrl}
                      onChange={(e) => setPurchaseForm(prev => ({ ...prev, imageUrl: e.target.value }))}
                      className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs text-slate-900 truncate"
                    />
                    <button
                      type="button"
                      onClick={() => handleOpenImagePicker(activeItemForPurchase, 'modal')}
                      className="px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Buscar</span>
                    </button>
                  </div>
                </div>

                {/* Forma de Pagamento e Data da Compra */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                        <span>Forma de Pagamento</span>
                      </label>
                      {!isAddingNewPaymentMethod && (
                        <button
                          type="button"
                          onClick={() => setIsAddingNewPaymentMethod(true)}
                          className="text-[11px] font-bold text-sky-600 hover:text-sky-800 flex items-center gap-1 transition cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Nova Forma</span>
                        </button>
                      )}
                    </div>

                    {isAddingNewPaymentMethod ? (
                      <div className="flex items-center gap-2 p-1.5 bg-sky-50/80 border border-sky-200 rounded-xl animate-fadeIn">
                        <input
                          type="text"
                          autoFocus
                          value={newPaymentMethodName}
                          onChange={(e) => setNewPaymentMethodName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleQuickAddPaymentMethod();
                            }
                            if (e.key === 'Escape') setIsAddingNewPaymentMethod(false);
                          }}
                          className="flex-1 h-8 px-2.5 bg-white border border-sky-300 rounded-lg text-xs text-slate-900 font-medium focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleQuickAddPaymentMethod}
                          className="h-8 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsAddingNewPaymentMethod(false)}
                          className="h-8 px-2 text-slate-500 hover:text-slate-800 text-xs font-medium cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <select
                        value={purchaseForm.paymentMethod}
                        onChange={(e) => setPurchaseForm({ ...purchaseForm, paymentMethod: e.target.value })}
                        className="w-full h-10 px-3 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm text-slate-900 font-medium"
                      >
                        {paymentMethodsList.map(pm => (
                          <option key={pm} value={pm}>{pm}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Data da Compra</span>
                    </label>
                    <input
                      type="date"
                      value={purchaseForm.purchaseDate}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm, purchaseDate: e.target.value })}
                      className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm text-slate-900 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* SEÇÃO 2: VALORES, CUSTOS & VENDA */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-sky-600" />
                    <span>2. Custos & Valores Financeiros</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 font-medium">Cálculo bidirecional automático</span>
                </div>

                {/* Preço de Venda Unitário (Se for compra avulsa) */}
                {activeItemForPurchase.isDirectPurchase && (
                  <div className="p-3 bg-purple-50/70 border border-purple-200/90 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fadeIn">
                    <div>
                      <label className="block text-xs font-bold text-purple-900 mb-1 flex items-center justify-between">
                        <span>Preço de Venda Unitário Cobrado (R$) *</span>
                        <span className="text-[10px] text-purple-600 font-normal">por {activeItemForPurchase.unit}</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={purchaseForm.sellingUnitPrice || ''}
                        onChange={(e) => setPurchaseForm(prev => ({ ...prev, sellingUnitPrice: parseFloat(e.target.value) || 0 }))}
                        className="w-full h-10 px-3.5 bg-white border border-purple-300 hover:border-purple-400 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 rounded-xl text-xs sm:text-sm font-mono font-bold text-purple-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-purple-900 mb-1">
                        Venda Total Faturada (R$)
                      </label>
                      <div className="w-full h-10 px-3.5 bg-white/90 border border-purple-200 rounded-xl text-xs sm:text-sm font-mono font-bold text-purple-900 flex items-center">
                        R$ {((purchaseForm.sellingUnitPrice || 0) * activeItemForPurchase.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Grid dos Custos: Unitário, Total e Frete */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {/* Custo Unitário */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                      <span>Custo Unitário (R$) *</span>
                      <span className="text-[10px] font-normal text-slate-400">por {activeItemForPurchase.unit}</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={purchaseForm.actualUnitCost || ''}
                      onChange={(e) => handleUnitCostChange(parseFloat(e.target.value) || 0)}
                      className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-900"
                    />
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">
                        Cotado: R$ {activeItemForPurchase.quotedCostPrice.toFixed(2)}
                      </span>
                      {purchaseForm.actualUnitCost > 0 && (
                        <span className={`font-semibold font-mono ${
                          purchaseForm.actualUnitCost <= activeItemForPurchase.quotedCostPrice 
                            ? 'text-emerald-600' 
                            : 'text-amber-600'
                        }`}>
                          {purchaseForm.actualUnitCost <= activeItemForPurchase.quotedCostPrice
                            ? `(-R$ ${(activeItemForPurchase.quotedCostPrice - purchaseForm.actualUnitCost).toFixed(2)})`
                            : `(+R$ ${(purchaseForm.actualUnitCost - activeItemForPurchase.quotedCostPrice).toFixed(2)})`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Custo Total */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                      <span>Custo Total Real (R$) *</span>
                      <span className="text-[10px] font-normal text-slate-400">({activeItemForPurchase.quantity} un)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={purchaseForm.actualCost || ''}
                      onChange={(e) => handleTotalCostChange(parseFloat(e.target.value) || 0)}
                      className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-900"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Cotado Total: R$ {(activeItemForPurchase.quotedCostPrice * activeItemForPurchase.quantity).toFixed(2)}
                    </span>
                  </div>

                  {/* Frete da Compra */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5 text-slate-400" />
                        <span>Frete Pago (R$)</span>
                      </label>
                      <label className="inline-flex items-center gap-1 cursor-pointer text-[10px] font-semibold text-amber-700 hover:text-amber-800 select-none bg-amber-50 hover:bg-amber-100/70 border border-amber-200 px-1.5 py-0.5 rounded-md transition">
                        <input
                          type="checkbox"
                          checked={purchaseForm.shippingPending}
                          onChange={(e) => setPurchaseForm({ ...purchaseForm, shippingPending: e.target.checked })}
                          className="rounded border-amber-400 text-amber-600 focus:ring-amber-500 w-3 h-3 cursor-pointer"
                        />
                        <span>Pendente</span>
                      </label>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={purchaseForm.actualShipping || ''}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm, actualShipping: parseFloat(e.target.value) || 0 })}
                      className={`w-full h-10 px-3.5 bg-white border rounded-xl text-xs sm:text-sm font-mono text-slate-900 transition ${
                        purchaseForm.shippingPending
                          ? 'border-amber-400 bg-amber-50/20 focus:border-amber-500 focus:ring-amber-100'
                          : 'border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-sky-100'
                      }`}
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      {purchaseForm.shippingPending ? '⚠️ Frete a definir' : 'Frete pago da remessa'}
                    </span>
                  </div>
                </div>
              </div>

              {/* SEÇÃO 3: FISCAL, PEDIDO DO CLIENTE & RASTREIO */}
              <div className="bg-slate-50/70 border border-slate-200/90 rounded-2xl p-4 space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-indigo-600" />
                    <span>3. Pedido do Cliente, Fiscal & Rastreio</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 font-medium">Controle e auditoria</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Ordem de Compra do Cliente */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-amber-600" />
                        <span>Nº OC / AF (Ordem de Compra do Cliente)</span>
                      </span>
                    </label>
                    <input
                      type="text"
                      value={purchaseForm.clientOrderNumber}
                      onChange={(e) => setPurchaseForm(prev => ({ ...prev, clientOrderNumber: e.target.value }))}
                      className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm font-mono font-bold text-amber-900"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Ex: AF 102/2026, Pedido 45892 (opcional)
                    </span>
                  </div>

                  {/* Alíquota de Imposto */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      <span>Alíquota de Imposto (%)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={purchaseForm.taxPercent}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm, taxPercent: parseFloat(e.target.value) || 0 })}
                      className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm font-mono text-slate-900"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Padrão configurado: {defaultTax.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  {/* Observações / NF / Rastreio */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      <span>Observações / Código de Rastreio / NF</span>
                    </label>
                    <input
                      type="text"
                      value={purchaseForm.notes}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
                      className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs text-slate-900"
                    />
                  </div>

                  {/* URL da Foto do Produto */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-sky-600" />
                        <span>URL da Foto do Produto</span>
                      </span>
                    </label>
                    <input
                      type="url"
                      value={purchaseForm.imageUrl}
                      onChange={(e) => setPurchaseForm(prev => ({ ...prev, imageUrl: e.target.value }))}
                      className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs text-slate-900 truncate"
                    />
                  </div>
                </div>
              </div>

              {/* SEÇÃO 4: RESUMO FINANCEIRO EM TEMPO REAL */}
              {(() => {
                const venda = activeItemForPurchase.isDirectPurchase && purchaseForm.sellingUnitPrice > 0
                  ? (purchaseForm.sellingUnitPrice * activeItemForPurchase.quantity)
                  : activeItemForPurchase.quotedTotalPrice;
                const custo = purchaseForm.actualCost;
                const frete = purchaseForm.actualShipping;
                const imposto = venda * (purchaseForm.taxPercent / 100);
                const lucro = venda - custo - frete - imposto;
                const roi = (custo + frete + imposto) > 0 ? (lucro / (custo + frete + imposto)) * 100 : 0;

                return (
                  <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-4 shadow-sm border border-slate-700">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-700/80 pb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Resumo Financeiro da Operação</span>
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-300">
                        Venda: R$ {venda.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                        <span className="text-[10px] font-semibold text-slate-400 block uppercase">Custo + Frete</span>
                        <span className="text-xs sm:text-sm font-mono font-bold text-slate-200 block mt-0.5">
                          R$ {(custo + frete).toFixed(2)}
                        </span>
                      </div>

                      <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                        <span className="text-[10px] font-semibold text-slate-400 block uppercase">Imposto ({purchaseForm.taxPercent}%)</span>
                        <span className="text-xs sm:text-sm font-mono font-bold text-amber-300 block mt-0.5">
                          R$ {imposto.toFixed(2)}
                        </span>
                      </div>

                      <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                        <span className="text-[10px] font-semibold text-slate-400 block uppercase">Lucro Líquido</span>
                        <span className={`text-xs sm:text-sm font-mono font-bold block mt-0.5 ${lucro >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          R$ {lucro.toFixed(2)}
                        </span>
                      </div>

                      <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                        <span className="text-[10px] font-semibold text-slate-400 block uppercase">Retorno (ROI)</span>
                        <span className={`text-xs sm:text-sm font-mono font-bold block mt-0.5 ${roi >= 0 ? 'text-sky-400' : 'text-rose-400'}`}>
                          {roi.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer do Modal */}
            <div className="p-4 sm:p-5 border-t border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                {activeItemForPurchase.purchaseStatus === 'purchased' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Deseja desfazer o registro de compra de "${activeItemForPurchase.name}"?\n\nO item retornará para a fila "A Comprar".`)) {
                        handleDeletePurchase(activeItemForPurchase);
                        setActiveItemForPurchase(null);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-amber-700 hover:text-amber-800 hover:bg-amber-50 border border-amber-300 rounded-xl text-xs font-bold transition cursor-pointer"
                    title="Desfazer o registro de compra e manter o item na fila de A Comprar"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Desfazer Compra</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    handleRemoveItemPermanently(activeItemForPurchase);
                    setActiveItemForPurchase(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200/80 rounded-xl text-xs font-bold transition cursor-pointer"
                  title="Excluir este item definitivamente da Central de Compras"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir</span>
                </button>
              </div>

              <div className="flex items-center gap-2.5 self-end sm:self-auto">
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
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Salvar Registro de Compra</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal de Nova Compra Avulsa / Direta (Independente de Orçamento) */}
      {isDirectPurchaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-scaleIn max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-gradient-to-r from-slate-50 to-white shrink-0">
              <div>
                <span className="px-2.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold font-mono uppercase tracking-wider rounded-lg">
                  NOVA COMPRA
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  Adicionar Item da Nova Compra
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setIsDirectPurchaseModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveDirectPurchase} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Seletor de Produto do Estoque com Autocomplete */}
              <div ref={productDropdownRef} className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5 text-sky-600" />
                    <span>Produto do Estoque Cadastrado *</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {stockProducts.length} produtos cadastrados
                  </span>
                </div>

                {selectedStockProduct ? (
                  /* Card do Produto Selecionado com Validação Positiva */
                  <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-xl mt-0.5 shrink-0">
                        <Check className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm">
                            {selectedStockProduct.name}
                          </span>
                          {(selectedStockProduct.partNumber || selectedStockProduct.sku) && (
                            <span className="px-2 py-0.5 bg-white border border-emerald-200 text-emerald-800 font-mono text-[10px] font-bold rounded-md">
                              PN: {selectedStockProduct.partNumber || selectedStockProduct.sku}
                            </span>
                          )}
                          {selectedStockProduct.ncm && (
                            <span className="px-2 py-0.5 bg-white border border-emerald-200 text-slate-700 font-mono text-[10px] font-medium rounded-md">
                              NCM: {selectedStockProduct.ncm}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-600 mt-1 flex-wrap">
                          <span>
                            Estoque atual: <strong className="text-slate-900">{selectedStockProduct.stock ?? 0} {selectedStockProduct.unit}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Custo ref.: <strong className="text-slate-900">R$ {Number(selectedStockProduct.costPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                          </span>
                          {selectedStockProduct.supplier && (
                            <>
                              <span>•</span>
                              <span>Fornecedor: <strong className="text-slate-900">{selectedStockProduct.supplier}</strong></span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleClearSelectedProduct}
                      className="px-2.5 py-1 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold transition shrink-0 cursor-pointer"
                    >
                      Trocar Produto
                    </button>
                  </div>
                ) : (
                  /* Campo de Busca Interativo */
                  <div className="relative">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={productSearchTerm}
                        onChange={(e) => {
                          setProductSearchTerm(e.target.value);
                          setIsProductDropdownOpen(true);
                        }}
                        onFocus={() => setIsProductDropdownOpen(true)}
                        className="w-full h-10 pl-9 pr-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm text-slate-900 font-medium"
                      />
                    </div>
                    {/* Dropdown de Sugestões do Estoque */}
                    {isProductDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-100">
                        {filteredStockProducts.length > 0 ? (
                          filteredStockProducts.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleSelectStockProduct(p)}
                              className="w-full text-left p-3 hover:bg-sky-50/70 transition flex items-center justify-between gap-3 group cursor-pointer"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-slate-900 group-hover:text-sky-700 text-xs">
                                    {p.name}
                                  </span>
                                  {(p.partNumber || p.sku) && (
                                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-mono text-[10px] font-bold rounded">
                                      {p.partNumber || p.sku}
                                    </span>
                                  )}
                                  {p.ncm && (
                                    <span className="px-1.5 py-0.5 bg-slate-50 text-slate-500 font-mono text-[10px] rounded">
                                      NCM: {p.ncm}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5 flex-wrap">
                                  <span>{p.category}</span>
                                  {p.supplier && <span>• {p.supplier}</span>}
                                  <span>• Estoque: <strong className="text-slate-700">{p.stock ?? 0} {p.unit}</strong></span>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <div className="text-xs font-mono font-bold text-slate-900">
                                  R$ {Number(p.costPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                                <span className="text-[10px] text-sky-600 font-bold group-hover:underline">
                                  Selecionar
                                </span>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="p-4 text-center">
                            <AlertCircle className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                            <p className="font-bold text-slate-700 text-xs">Nenhum produto encontrado no estoque</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Para comprar este item, cadastre-o primeiro na aba <strong>Base de Produtos</strong>.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Quantidade, Unidade, Custo e Preço de Venda */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1 text-xs">
                    Quantidade *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={directPurchaseForm.quantity}
                    onChange={(e) => setDirectPurchaseForm({ ...directPurchaseForm, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-900 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1 text-xs">
                    Unidade
                  </label>
                  <select
                    value={directPurchaseForm.unit}
                    onChange={(e) => setDirectPurchaseForm({ ...directPurchaseForm, unit: e.target.value })}
                    className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-medium"
                  >
                    {registeredUnits.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1 text-xs">
                    Custo Unit. (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={directPurchaseForm.costPrice || ''}
                    onChange={(e) => setDirectPurchaseForm({ ...directPurchaseForm, costPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-emerald-800 font-bold mb-1 text-xs flex items-center justify-between">
                    <span>Venda Unit. (R$) *</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={directPurchaseForm.sellingPrice || ''}
                    onChange={(e) => setDirectPurchaseForm({ ...directPurchaseForm, sellingPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full h-9 px-3 bg-white border border-emerald-300 focus:border-emerald-500 rounded-xl text-xs font-mono font-bold text-emerald-800"
                  />
                </div>
              </div>

              {/* Resumo Financeiro Previsto da Compra Avulsa */}
              {(() => {
                const qty = Math.max(1, Number(directPurchaseForm.quantity) || 1);
                const custoTotal = (Number(directPurchaseForm.costPrice) || 0) * qty;
                const vendaTotal = (Number(directPurchaseForm.sellingPrice) || 0) * qty;
                const imposto = vendaTotal * (defaultTax / 100);
                const lucro = vendaTotal - custoTotal - imposto;
                const roi = (custoTotal + imposto) > 0 ? (lucro / (custoTotal + imposto)) * 100 : 0;

                return (
                  <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-slate-700 flex-wrap gap-2">
                    <span className="font-semibold text-emerald-900">
                      Venda Faturada: <strong className="font-mono font-bold">R$ {vendaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </span>
                    <span className="text-slate-500 font-mono">
                      Custo Total: R$ {custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className={`font-mono font-bold ${lucro >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      Lucro Previsto: R$ {lucro.toFixed(2)} ({roi.toFixed(1)}% ROI)
                    </span>
                  </div>
                );
              })()}

              {/* Cliente / Destino, Nº OC e Fornecedor */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Cliente
                  </label>
                  <select
                    value={directPurchaseForm.clientCompany}
                    onChange={(e) => setDirectPurchaseForm({ ...directPurchaseForm, clientCompany: e.target.value })}
                    className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-medium"
                  >
                    <option value="Infodesk (Uso Interno / Estoque)">Infodesk (Uso Interno / Estoque)</option>
                    {registeredClients.map(c => {
                      const clientFormatted = formatCompanyPrefix(c.name, c.prefix);
                      return (
                        <option key={c.id} value={clientFormatted}>{clientFormatted}</option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1 flex items-center justify-between">
                    <span>Nº OC / AF</span>
                    <span className="text-[10px] text-slate-400 font-normal">Opcional</span>
                  </label>
                  <input
                    type="text"
                    value={directPurchaseForm.clientOrderNumber}
                    onChange={(e) => setDirectPurchaseForm({ ...directPurchaseForm, clientOrderNumber: e.target.value })}
                    className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-amber-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Fornecedor
                  </label>
                  <input
                    type="text"
                    value={directPurchaseForm.supplier}
                    onChange={(e) => setDirectPurchaseForm({ ...directPurchaseForm, supplier: e.target.value })}
                    className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                  />
                </div>
              </div>

              {/* Link do Produto / Compra */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Link do Produto / Loja (URL)
                </label>
                <input
                  type="url"
                  value={directPurchaseForm.sourceUrl}
                  onChange={(e) => setDirectPurchaseForm({ ...directPurchaseForm, sourceUrl: e.target.value })}
                  className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                />
              </div>

              {/* Status Inicial da Compra */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                <span className="block text-[11px] font-bold text-slate-700 uppercase">
                  Status Desta Compra
                </span>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                    <input
                      type="radio"
                      name="initialStatus"
                      checked={directPurchaseForm.initialStatus === 'pending'}
                      onChange={() => setDirectPurchaseForm({ ...directPurchaseForm, initialStatus: 'pending' })}
                      className="text-amber-600 focus:ring-amber-500"
                    />
                    <span>A Comprar (Deixar na Fila de Pendentes)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                    <input
                      type="radio"
                      name="initialStatus"
                      checked={directPurchaseForm.initialStatus === 'purchased'}
                      onChange={() => setDirectPurchaseForm({ 
                        ...directPurchaseForm, 
                        initialStatus: 'purchased',
                        actualCost: directPurchaseForm.actualCost || (directPurchaseForm.costPrice * directPurchaseForm.quantity)
                      })}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Já Comprado (Registrar Imediatamente)</span>
                  </label>
                </div>

                {/* Campos adicionais se já foi comprado */}
                {directPurchaseForm.initialStatus === 'purchased' && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-200/60 animate-fadeIn">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        Custo Total (R$) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={directPurchaseForm.actualCost || ''}
                        onChange={(e) => setDirectPurchaseForm({ ...directPurchaseForm, actualCost: parseFloat(e.target.value) || 0 })}
                        className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] font-bold text-slate-600">
                          Frete (R$)
                        </label>
                        <label className="inline-flex items-center gap-1 cursor-pointer text-[10px] font-semibold text-amber-700 hover:text-amber-800 select-none">
                          <input
                            type="checkbox"
                            checked={directPurchaseForm.shippingPending}
                            onChange={(e) => setDirectPurchaseForm({ ...directPurchaseForm, shippingPending: e.target.checked })}
                            className="rounded border-amber-400 text-amber-600 focus:ring-amber-500 w-3 h-3 cursor-pointer"
                          />
                          <span>Pendente</span>
                        </label>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={directPurchaseForm.actualShipping || ''}
                        onChange={(e) => setDirectPurchaseForm({ ...directPurchaseForm, actualShipping: parseFloat(e.target.value) || 0 })}
                        className={`w-full h-8 px-2 bg-white border rounded-lg text-xs font-mono text-slate-900 transition ${
                          directPurchaseForm.shippingPending ? 'border-amber-400 bg-amber-50/20' : 'border-slate-300'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        Forma Pgto
                      </label>
                      <select
                        value={directPurchaseForm.paymentMethod}
                        onChange={(e) => setDirectPurchaseForm({ ...directPurchaseForm, paymentMethod: e.target.value })}
                        className="w-full h-8 px-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
                      >
                        {paymentMethodsList.map(pm => (
                          <option key={pm} value={pm}>{pm}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        Data Compra
                      </label>
                      <input
                        type="date"
                        value={directPurchaseForm.purchaseDate}
                        onChange={(e) => setDirectPurchaseForm({ ...directPurchaseForm, purchaseDate: e.target.value })}
                        className="w-full h-8 px-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Observações */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Observações / Rastreio / NF (opcional)
                </label>
                <input
                  type="text"
                  value={directPurchaseForm.notes}
                  onChange={(e) => setDirectPurchaseForm({ ...directPurchaseForm, notes: e.target.value })}
                  className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                />
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsDirectPurchaseModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!selectedStockProduct}
                  className={`px-5 py-2 font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 ${
                    selectedStockProduct 
                      ? 'bg-sky-600 hover:bg-sky-700 text-white cursor-pointer' 
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                  }`}
                  title={!selectedStockProduct ? "Selecione um produto do estoque para continuar" : "Salvar Compra Avulsa"}
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Compra Avulsa</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Modal de Divisão de Compra em Lotes (Split Purchase) */}
      {itemToSplit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scaleIn max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-gradient-to-r from-indigo-50/60 to-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Scissors className="w-5 h-5" />
                </div>
                <div>
                  <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold font-mono uppercase tracking-wider rounded-lg">
                    FRACIONAR COMPRA
                  </span>
                  <h3 className="text-base font-bold text-slate-900 mt-1">
                    Dividir em 2 Fornecedores
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setItemToSplit(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Card Resumo do Produto */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3">
                {itemToSplit.imageUrl ? (
                  <div className="w-12 h-12 rounded-xl border border-slate-200 bg-white p-1 shrink-0 overflow-hidden flex items-center justify-center">
                    <img src={itemToSplit.imageUrl} alt={itemToSplit.name} className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-xl border border-slate-200 bg-white text-slate-400 shrink-0 flex items-center justify-center">
                    <Package className="w-6 h-6 text-slate-300" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{itemToSplit.name}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Total: <strong className="text-slate-900 font-mono font-bold">{itemToSplit.quantity} {itemToSplit.unit}</strong> • Cotado: <strong className="text-slate-800 font-mono">R$ {itemToSplit.quotedUnitPrice.toFixed(2)}/un</strong>
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Cliente: {itemToSplit.clientCompany} • Origem: {itemToSplit.quoteCode}
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Informe quantas unidades deseja separar para a primeira compra. O restante ficará como um lote pendente separado, permitindo registrar custos, fornecedores e fretes independentes.
              </p>

              {/* Seletor de Quantidade do Lote 1 */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Quantidade para o 1º Fornecedor (Lote 1) *
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={itemToSplit.quantity - 1}
                    value={splitFirstPartQty}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) {
                        setSplitFirstPartQty(Math.max(1, Math.min(itemToSplit.quantity - 1, val)));
                      }
                    }}
                    className="w-32 h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-sm font-bold font-mono text-slate-900"
                  />
                  <span className="text-xs font-medium text-slate-500">
                    de um total de <strong className="text-slate-900 font-mono">{itemToSplit.quantity} {itemToSplit.unit}</strong>
                  </span>
                </div>
              </div>

              {/* Preview Comparativo dos 2 Lotes em Tempo Real */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-1">
                  <div className="flex items-center justify-between text-indigo-900">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Lote 1 (Imediato)</span>
                    <span className="px-2 py-0.5 bg-indigo-600 text-white rounded-md text-[10px] font-bold font-mono">
                      {splitFirstPartQty} {itemToSplit.unit}
                    </span>
                  </div>
                  <span className="text-xs text-indigo-800 font-medium block">
                    Venda: <strong className="font-mono font-bold">R$ {(itemToSplit.quotedUnitPrice * splitFirstPartQty).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </span>
                  <span className="text-[10px] text-indigo-600/80 block">
                    Pronto para comprar no 1º site
                  </span>
                </div>

                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-1">
                  <div className="flex items-center justify-between text-amber-900">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Lote 2 (Saldo)</span>
                    <span className="px-2 py-0.5 bg-amber-600 text-white rounded-md text-[10px] font-bold font-mono">
                      {itemToSplit.quantity - splitFirstPartQty} {itemToSplit.unit}
                    </span>
                  </div>
                  <span className="text-xs text-amber-800 font-medium block">
                    Venda: <strong className="font-mono font-bold">R$ {(itemToSplit.quotedUnitPrice * (itemToSplit.quantity - splitFirstPartQty)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </span>
                  <span className="text-[10px] text-amber-600/80 block">
                    Ficará pendente para o 2º site
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-100 bg-white flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setItemToSplit(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSplit}
                className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Scissors className="w-4 h-4" />
                <span>Confirmar Divisão em 2 Lotes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[9999] bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-bold flex items-center gap-2 animate-fadeIn border border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modal de Busca e Seleção de Foto Comercial na Web */}
      {isImagePickerOpen && imagePickerItem && (
        <WebImagePickerModal
          isOpen={true}
          onClose={() => {
            setIsImagePickerOpen(false);
            setImagePickerItem(null);
          }}
          productName={imagePickerItem.name || ''}
          currentImageUrl={imagePickerTargetMode === 'modal' ? (purchaseForm.imageUrl || imagePickerItem.imageUrl || '') : (imagePickerItem.imageUrl || '')}
          onSelectImage={(newUrl) => handleSelectImage(newUrl)}
        />
      )}
    </div>
  );

  // Função Auxiliar de Renderização de Card de Item
  function renderItemCard(item: ProcurementItem) {
    const isPurchased = item.purchaseStatus === 'purchased';
    const costPaid = item.actualCostPrice !== undefined 
      ? item.actualCostPrice 
      : (item.quotedCostPrice * item.quantity);
    const unitPaid = item.actualUnitCostPrice !== undefined
      ? item.actualUnitCostPrice
      : (item.quantity > 0 ? costPaid / item.quantity : item.quotedCostPrice);
    const fretePaid = item.actualShippingCost || 0;
    const revenue = item.quotedTotalPrice;
    const tax = revenue * (item.taxPercent / 100);
    const profit = revenue - costPaid - fretePaid - tax;
    const roi = (costPaid + fretePaid + tax) > 0 ? (profit / (costPaid + fretePaid + tax)) * 100 : 0;
    const effectivePurchaseUrl = item.actualPurchaseUrl || item.sourceUrl;

    return (
      <div
        key={item.id}
        className={`bg-white border rounded-2xl p-4 shadow-xs transition hover:shadow-sm flex flex-col gap-3 ${
          isPurchased 
            ? item.shippingPending
              ? 'border-emerald-200/90 bg-emerald-50/15 border-l-4 border-l-amber-500'
              : 'border-emerald-200/80 bg-emerald-50/10'
            : 'border-slate-200 hover:border-sky-300'
        }`}
      >
        {/* Cabeçalho do Card */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3.5 flex-1 min-w-0">
            {/* Foto do Produto com Suporte Interativo a Busca e Troca */}
            <div 
              className="relative group w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border border-slate-200 bg-white p-1.5 shrink-0 overflow-hidden flex items-center justify-center shadow-2xs hover:border-sky-400 transition cursor-pointer"
              onClick={() => handleOpenImagePicker(item, 'card')}
              title={item.imageUrl ? "Clique para alterar ou buscar outra foto na web" : "Clique para buscar foto deste produto na web"}
            >
              {item.imageUrl ? (
                <img 
                  src={item.imageUrl} 
                  alt={item.name} 
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    if (target.parentElement) {
                      target.parentElement.classList.add('bg-slate-100');
                    }
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400">
                  <Package className="w-5 h-5 text-slate-300 group-hover:scale-110 transition" />
                  <span className="text-[9px] font-bold text-sky-600 mt-0.5 opacity-80 group-hover:opacity-100">Buscar</span>
                </div>
              )}

              {/* Overlay interativo com hover suave */}
              <div className="absolute inset-0 bg-slate-900/65 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition rounded-2xl backdrop-blur-2xs">
                <Camera className="w-4 h-4 text-white" />
                <span className="text-[9px] font-bold mt-0.5">{item.imageUrl ? 'Trocar' : 'Buscar Foto'}</span>
              </div>
            </div>

            {/* Informações Principais */}
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Tag de Quantidade */}
                <span className="font-mono text-xs font-bold text-sky-800 bg-sky-50 px-2.5 py-0.5 rounded-lg border border-sky-200">
                  {item.quantity} {item.unit}
                </span>

                {/* Tag de Origem / Proposta / Compra Direta */}
                {item.isDirectPurchase ? (
                  <span className="text-[11px] font-mono font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-md border border-purple-200">
                    COMPRA AVULSA
                  </span>
                ) : (
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
                )}

                {/* Tag de Ordem de Compra do Cliente (se informada) */}
                {item.clientOrderNumber && (
                  <span 
                    className="text-[11px] font-mono font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-300 flex items-center gap-1 shadow-2xs"
                    title={`Ordem de Compra / Pedido do Cliente: ${item.clientOrderNumber}`}
                  >
                    <Tag className="w-3 h-3 text-amber-600" />
                    <span>OC: {item.clientOrderNumber}</span>
                  </span>
                )}

                {/* Badge de Lote Fracionado (Split) */}
                {item.splitBatchNumber && (
                  <span 
                    className="text-[11px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200 flex items-center gap-1 shadow-2xs"
                    title={`Item fracionado em compras separadas: Lote ${item.splitBatchNumber} de ${item.splitTotalBatches}`}
                  >
                    <Scissors className="w-3 h-3 text-indigo-600" />
                    <span>Lote {item.splitBatchNumber}/{item.splitTotalBatches}</span>
                  </span>
                )}

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

                {/* Badge de Frete Pendente (quando marcado) */}
                {item.shippingPending && (
                  <span 
                    className="text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border bg-amber-50 text-amber-800 border-amber-300 shadow-2xs animate-pulse"
                    title="O frete desta compra está marcado como pendente de confirmação / lançamento"
                  >
                    <Truck className="w-3 h-3 text-amber-600" />
                    <span>Frete Pendente</span>
                  </span>
                )}
              </div>

              <h3 className="text-sm font-bold text-slate-900 line-clamp-2">
                {item.name}
              </h3>

              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <strong>{item.clientCompany.startsWith('Infodesk') ? item.clientCompany : formatCompanyPrefix(item.clientCompany)}</strong>
                </span>
                {item.supplier && (
                  <span>
                    • Fornecedor: <strong className="text-slate-700">{item.supplier}</strong>
                    {isPurchased && item.quotedSupplier && item.quotedSupplier !== item.supplier && (
                      <span className="ml-1 text-[11px] text-slate-400 font-normal">
                        (Cotado: {item.quotedSupplier})
                      </span>
                    )}
                  </span>
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
              <span className="text-xs text-slate-400 block">
                {item.isDirectPurchase ? 'Valor Previsto / Venda' : 'Venda Faturada'}
              </span>
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

              {/* Custo Total e Valor Unitário Real */}
              <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 font-medium font-mono text-[11px]">
                Total: <strong>R$ {costPaid.toFixed(2)}</strong>
              </span>

              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-lg border border-emerald-200 font-medium font-mono text-[11px]">
                Unitário: <strong>R$ {unitPaid.toFixed(2)}/un</strong>
              </span>

              {/* Frete */}
              {item.shippingPending ? (
                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 px-2 py-0.5 rounded-lg border border-amber-300 font-bold font-mono text-[11px]" title="Valor do frete pendente de confirmação">
                  <Truck className="w-3 h-3 text-amber-600" />
                  Frete: {fretePaid > 0 ? `R$ ${fretePaid.toFixed(2)} (Pendente)` : 'Pendente'}
                </span>
              ) : fretePaid > 0 ? (
                <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 font-medium font-mono text-[11px]">
                  Frete: R$ {fretePaid.toFixed(2)}
                </span>
              ) : null}

              {item.purchasedAt && (
                <span className="text-slate-400 text-[11px]">
                  Comprado em: {formatDatePtBr(item.purchasedAt)}
                </span>
              )}

              {item.purchaseNotes && (
                <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-800 px-2 py-0.5 rounded-lg border border-sky-200 text-[11px] font-medium" title={item.purchaseNotes}>
                  <FileText className="w-3 h-3 text-sky-600" />
                  <span className="truncate max-w-[200px]">Obs/NF: {item.purchaseNotes}</span>
                </span>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Cotado a <strong>R$ {item.quotedCostPrice.toFixed(2)}/un</strong> • Aguardando aquisição</span>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            {/* Botão de Link de Compra Real ou Cotado */}
            {effectivePurchaseUrl && (
              <a
                href={effectivePurchaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  item.actualPurchaseUrl 
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-slate-100 hover:bg-sky-50 hover:text-sky-700 text-slate-700 border-slate-200 hover:border-sky-200'
                }`}
                title={item.actualPurchaseUrl ? 'Abrir página exata onde o produto foi comprado' : 'Abrir link cotado na proposta'}
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                <span>{item.actualPurchaseUrl ? 'Link de Compra' : 'Link da Loja'}</span>
              </a>
            )}

            {/* Botão Registrar Compra / Editar */}
            {isPurchased ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleOpenPurchaseModal(item)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                  title="Alterar dados da compra (valor, unitário, link ou forma de pgto)"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Editar</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Deseja desfazer o registro de compra de "${item.name}"?\n\nO item retornará para o status "A Comprar".`)) {
                      handleDeletePurchase(item);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-amber-700 hover:text-amber-800 hover:bg-amber-50 border border-amber-300 rounded-xl text-xs font-bold transition cursor-pointer"
                  title="Desfazer o registro desta compra e voltar o item para o status A Comprar"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Desfazer Compra</span>
                </button>

                {/* Exclusão permanente definitiva para qualquer item */}
                <button
                  type="button"
                  onClick={() => handleRemoveItemPermanently(item)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                  title="Remover este item definitivamente da Central de Compras"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Botão de Fracionamento (Split) se item tiver mais de 1 unidade e não for fracionado ainda */}
                {!item.splitFromId && item.quantity > 1 && (
                  <button
                    type="button"
                    onClick={() => handleOpenSplitModal(item)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/90 rounded-xl text-xs font-bold transition cursor-pointer"
                    title="Dividir este item em dois lotes para comprar quantidades diferentes em lojas distintas"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Dividir Item</span>
                  </button>
                )}

                {/* Botão de Reunir Lotes caso o item seja um lote fracionado pendente */}
                {item.splitFromId && (
                  <button
                    type="button"
                    onClick={() => handleReuniteSplit(item.splitFromId!)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                    title="Reunir os lotes de volta em um único item com a quantidade original"
                  >
                    <Boxes className="w-3.5 h-3.5 text-slate-500" />
                    <span>Reunir</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleOpenPurchaseModal(item)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Registrar Compra</span>
                </button>

                {/* Exclusão permanente definitiva para qualquer item pendente */}
                <button
                  type="button"
                  onClick={() => handleRemoveItemPermanently(item)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                  title="Remover este item definitivamente da Central de Compras"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
};
