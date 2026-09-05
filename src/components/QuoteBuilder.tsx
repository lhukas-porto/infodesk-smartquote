import React, { useState, useRef } from 'react';
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
  FileSpreadsheet,
  Package,
  X,
  Camera,
  ImagePlus,
  FileText,
  ChevronDown,
  ZoomIn,
  Copy,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  HelpCircle,
  ClipboardPaste,
  ChevronUp,
  Sliders,
  LayoutList
} from 'lucide-react';
import { ClientCompany, ClientContact, CompanySettings, Product, Quote, QuoteItem } from '../types';
import { 
  formatDeliveryDaysText, 
  extractDeliveryDaysNumber, 
  formatDeliveryDaysWithException,
  extractDeliveryExceptionDetails,
  formatValidityDaysText,
  extractValidityDaysNumber,
  formatPaymentTermsDays,
  extractPaymentDaysNumber,
  formatWarrantyMonthsText,
  extractWarrantyMonthsNumber,
  calculateCommercialUnitPrice, 
  formatCompanyPrefix, 
  formatContactPerson, 
  isExactProductUrl, 
  generateQuoteCode, 
  formatProductSentenceCase,
  maskPhone,
  applyTextCase,
  WordCaseStyle,
  extractStoreNameFromUrl,
  getCategoryFromNcm
} from '../utils/aiEmailParser';
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
  onUpdateSettings?: (newSettings: CompanySettings) => void;
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
  onOpenEmailScanner: propsOnOpenEmailScanner,
  onUpdateSettings
}) => {
  const [globalMarkup, setGlobalMarkup] = useState<number>(() => {
    return currentQuote.globalMarkupPercent ?? settings.defaultMarkupPercent ?? 23.5;
  });
  const [globalTax, setGlobalTax] = useState<number>(() => {
    return currentQuote.globalTaxPercent ?? settings.defaultTaxPercent ?? 9.1;
  });
  const [globalShipping, setGlobalShipping] = useState<number>(() => {
    return currentQuote.globalShipping ?? settings.defaultShippingCost ?? 0;
  });

  const [savedCatalogIds, setSavedCatalogIds] = useState<Record<string, boolean>>({});
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const productSearchContainerRef = useRef<HTMLDivElement>(null);
  const [isCompanySearchOpen, setIsCompanySearchOpen] = useState(false);
  const companySearchContainerRef = useRef<HTMLDivElement>(null);
  const [isBuyerSearchOpen, setIsBuyerSearchOpen] = useState(false);
  const buyerSearchContainerRef = useRef<HTMLDivElement>(null);
  const [isLocationSearchOpen, setIsLocationSearchOpen] = useState(false);
  const locationSearchContainerRef = useRef<HTMLDivElement>(null);
  const [localClientCompanies, setLocalClientCompanies] = useState<ClientCompany[]>(() => getClientCompanies());
  const [isClientsModalOpen, setIsClientsModalOpen] = useState(false);

  // Estado da regra de exceção no prazo de entrega (ex: Exceto para os itens 1 e 2 em até 25 dias úteis)
  const [showDeliveryException, setShowDeliveryException] = useState(() => {
    const details = extractDeliveryExceptionDetails(currentQuote.deliveryDays);
    return details.hasException;
  });
  const [exceptionItemNumbers, setExceptionItemNumbers] = useState<number[]>(() => {
    const details = extractDeliveryExceptionDetails(currentQuote.deliveryDays);
    return details.itemNumbers;
  });
  const [exceptionDays, setExceptionDays] = useState<number>(() => {
    const details = extractDeliveryExceptionDetails(currentQuote.deliveryDays);
    return details.days;
  });

  // Estado da janela de verificação geral antes de salvar no catálogo
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [catalogReviewProduct, setCatalogReviewProduct] = useState<Partial<Product> | null>(null);
  const [catalogReviewCostInput, setCatalogReviewCostInput] = useState<string>('');
  const [targetQuoteItemId, setTargetQuoteItemId] = useState<string | null>(null);

  // Seleção múltipla de itens para Ações em Lote e campo de Margem/Lucro % em Lote
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [batchMarkupInput, setBatchMarkupInput] = useState<string>('');

  // Modo de visualização da tabela (Compacto vs Completo com NCM/PartNumber/Links)
  const [isCompactTableMode, setIsCompactTableMode] = useState<boolean>(false);

  // Painel sanfona retrátil de Condições Gerais de Fornecimento
  const [isCommercialConditionsOpen, setIsCommercialConditionsOpen] = useState<boolean>(true);

  // Estado do zoom da foto em tela cheia (lightbox)
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string; itemNumber?: number } | null>(null);

  // Menu de Formatação de Texto estilo Word (Maiúsculas, Minúsculas, 1ª da frase, 1ª de Cada Palavra)
  const [isQuoteCaseMenuOpen, setIsQuoteCaseMenuOpen] = useState(false);
  const [activeQuoteCaseStyle, setActiveQuoteCaseStyle] = useState<WordCaseStyle>('sentence');
  const quoteCaseMenuRef = useRef<HTMLDivElement>(null);

  // Referência para upload de arquivo e item ativo para imagem
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeImageUploadIndexRef = useRef<number | null>(null);
  const catalogFileInputRef = useRef<HTMLInputElement>(null);
  const catalogProductNameInputRef = useRef<HTMLInputElement>(null);
  const itemNameTextareaRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});

  const clientCompanies = propsClientCompanies || localClientCompanies;

  const handleUpdateCompanies = (updated: ClientCompany[]) => {
    if (propsOnSaveCompanies) {
      propsOnSaveCompanies(updated);
    } else {
      saveClientCompanies(updated);
      setLocalClientCompanies(updated);
    }
  };

  // Ref para acompanhar alterações em settings e sincronizar com a cotação ativa
  const prevSettingsMarkupRef = useRef<number | undefined>(settings.defaultMarkupPercent);

  React.useEffect(() => {
    // Se o usuário alterou a margem padrão nas Configurações da Empresa, atualiza imediatamente a cotação
    if (settings.defaultMarkupPercent !== undefined && settings.defaultMarkupPercent !== prevSettingsMarkupRef.current) {
      prevSettingsMarkupRef.current = settings.defaultMarkupPercent;
      setGlobalMarkup(settings.defaultMarkupPercent);
      setCurrentQuote(prev => {
        const updatedItems = prev.items.map(it => {
          const sCost = it.shippingCost ?? (prev.globalShipping ?? settings.defaultShippingCost ?? 0);
          const tRate = it.taxPercent ?? (prev.globalTaxPercent ?? settings.defaultTaxPercent ?? 9.1);
          const uPrice = calculateItemUnitPrice(it.costPrice, sCost, settings.defaultMarkupPercent!, tRate);
          return {
            ...it,
            markupPercent: settings.defaultMarkupPercent!,
            unitPrice: uPrice,
            totalPrice: Number((uPrice * it.quantity).toFixed(2))
          };
        });
        const totals = recalculateQuote(updatedItems);
        return {
          ...prev,
          globalMarkupPercent: settings.defaultMarkupPercent,
          items: updatedItems,
          ...totals
        };
      });
    } else if (currentQuote.globalMarkupPercent !== undefined && currentQuote.globalMarkupPercent > 0) {
      setGlobalMarkup(currentQuote.globalMarkupPercent);
    } else if (settings.defaultMarkupPercent !== undefined) {
      setGlobalMarkup(settings.defaultMarkupPercent);
    }

    if (currentQuote.globalTaxPercent !== undefined) {
      setGlobalTax(currentQuote.globalTaxPercent);
    } else if (settings.defaultTaxPercent !== undefined) {
      setGlobalTax(settings.defaultTaxPercent);
    }

    if (currentQuote.globalShipping !== undefined) {
      setGlobalShipping(currentQuote.globalShipping);
    } else if (settings.defaultShippingCost !== undefined) {
      setGlobalShipping(settings.defaultShippingCost);
    }

    // Se a cotação não tiver cidade definida, assume a cidade da sede configurada na empresa
    if (!currentQuote.city && settings.cityState) {
      const defaultCity = settings.cityState.split('-')[0].trim() || 'Brasília';
      setCurrentQuote(prev => ({ ...prev, city: defaultCity }));
    }

    // Sincroniza estado de exceção caso venha salvo da cotação
    const excDetails = extractDeliveryExceptionDetails(currentQuote.deliveryDays);
    if (excDetails.hasException) {
      setExceptionItemNumbers(excDetails.itemNumbers);
      setExceptionDays(excDetails.days);
      setShowDeliveryException(true);
    }
  }, [currentQuote.id, currentQuote.deliveryDays, currentQuote.globalMarkupPercent, settings.defaultMarkupPercent, settings.defaultTaxPercent, settings.defaultShippingCost, settings.cityState]);

  // Fechar dropdowns de busca ao clicar fora
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (companySearchContainerRef.current && !companySearchContainerRef.current.contains(e.target as Node)) {
        setIsCompanySearchOpen(false);
      }
      if (buyerSearchContainerRef.current && !buyerSearchContainerRef.current.contains(e.target as Node)) {
        setIsBuyerSearchOpen(false);
      }
      if (locationSearchContainerRef.current && !locationSearchContainerRef.current.contains(e.target as Node)) {
        setIsLocationSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Estado para edição fluida dos campos numéricos com formatação pt-BR
  const [editingInputs, setEditingInputs] = useState<Record<string, string>>({});

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

  // Modal dedicado e interativo para ajuste de margem global
  const [isMarkupModalOpen, setIsMarkupModalOpen] = useState(false);
  const [modalMarkupInput, setModalMarkupInput] = useState('');

  // Modal dedicado e interativo para ajuste de impostos global
  const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);
  const [modalTaxInput, setModalTaxInput] = useState('');

  // Estado da validação pré-envio / checklist antifalhas
  const [validationModal, setValidationModal] = useState<{
    isOpen: boolean;
    issues: { type: 'error' | 'warning'; message: string; actionText?: string }[];
    onConfirmAction: () => void;
  }>({
    isOpen: false,
    issues: [],
    onConfirmAction: () => {}
  });

  const runPreFlightCheck = (): { type: 'error' | 'warning'; message: string }[] => {
    const issues: { type: 'error' | 'warning'; message: string }[] = [];

    if (!currentQuote.clientCompany?.trim()) {
      issues.push({ type: 'error', message: 'O nome da empresa cliente não foi preenchido.' });
    }
    if (!currentQuote.contactPerson?.trim()) {
      issues.push({ type: 'warning', message: 'O nome do comprador (A/C) está em branco.' });
    }
    if (!currentQuote.clientEmail?.trim()) {
      issues.push({ type: 'warning', message: 'O e-mail de contato do cliente está vazio.' });
    }
    if (!currentQuote.items || currentQuote.items.length === 0) {
      issues.push({ type: 'error', message: 'A proposta não possui nenhum produto cadastrado.' });
    } else {
      currentQuote.items.forEach((it, idx) => {
        const itemLabel = `Item ${it.itemNumber || idx + 1}`;
        if (!it.name || !it.name.trim()) {
          issues.push({ type: 'error', message: `${itemLabel}: descrição do produto está vazia.` });
        }
        if (it.unitPrice <= 0) {
          issues.push({ type: 'error', message: `${itemLabel}: valor unitário está zerado (R$ 0,00).` });
        }
        if (it.costPrice <= 0) {
          issues.push({ type: 'warning', message: `${itemLabel}: preço de custo está zerado (R$ 0,00).` });
        }
        if (it.quantity <= 0) {
          issues.push({ type: 'error', message: `${itemLabel}: quantidade é menor ou igual a zero.` });
        }
      });
    }

    if (currentQuote.averageMargin < 10 && currentQuote.items.length > 0) {
      issues.push({ type: 'warning', message: `Margem de lucro média está muito baixa (${currentQuote.averageMargin.toFixed(1)}%). Recomenda-se conferir os custos.` });
    }

    if (!currentQuote.validityDays?.trim()) {
      issues.push({ type: 'warning', message: 'Prazo de validade da proposta não definido.' });
    }
    if (!currentQuote.deliveryDays?.trim()) {
      issues.push({ type: 'warning', message: 'Prazo de entrega da proposta não definido.' });
    }

    return issues;
  };

  const persistAndProceed = (action: () => void, requiresValidation: boolean = false) => {
    persistClientDetails();
    if (requiresValidation) {
      const issues = runPreFlightCheck();
      if (issues.length > 0) {
        setValidationModal({
          isOpen: true,
          issues,
          onConfirmAction: action
        });
        return;
      }
    }
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

  // Helpers de formatação brasileira com separador de milhar (.) e 2 casas decimais (,): ex: 1.100,00
  const formatCurrencyPtBr = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) return '0,00';
    return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatPercentPtBr = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) return '0,00';
    return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const parsePtBrNumber = (str: string): number => {
    if (!str) return 0;
    const sanitized = str.toString().trim().replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(sanitized);
    return isNaN(parsed) ? 0 : parsed;
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

      // Metodologia Planilha Infodesk:
      // Imposto Real sobre a fatura = Preço Faturado * Alíquota
      const taxRate = (item.taxPercent ?? globalTax ?? 0) / 100;
      const itemTaxAmount = itemTotal * taxRate;

      totalCost += itemCost;
      totalShipping += itemShipping;
      totalAmount += itemTotal;
      totalTaxes += itemTaxAmount;
    });

    // Lucro líquido = Faturamento - Custos - Fretes - Impostos
    const totalProfit = totalAmount - totalCost - totalShipping - totalTaxes;
    const baseTotalCost = totalCost + totalShipping;
    // Margem Líquida Real sobre o Custo (ex: 200 de lucro sobre 1000 de custo = 20%)
    const averageMargin = baseTotalCost > 0 ? (totalProfit / baseTotalCost) * 100 : 0;

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
      const tax = item.taxPercent ?? globalTax;
      const shipping = item.shippingCost ?? globalShipping;
      const unitPrice = calculateItemUnitPrice(item.costPrice, shipping, markup, tax);
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
      globalMarkupPercent: markup,
      items: updatedItems,
      ...totals
    }));

    if (onUpdateSettings) {
      onUpdateSettings({ ...settings, defaultMarkupPercent: markup });
    }
  };

  const handleApplyGlobalTax = (tax: number) => {
    setGlobalTax(tax);
    const updatedItems = currentQuote.items.map(item => {
      const markup = item.markupPercent ?? globalMarkup;
      const shipping = item.shippingCost ?? globalShipping;
      const unitPrice = calculateItemUnitPrice(item.costPrice, shipping, markup, tax);
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

    if (onUpdateSettings) {
      onUpdateSettings({ ...settings, defaultTaxPercent: tax });
    }
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

    if (onUpdateSettings) {
      onUpdateSettings({ ...settings, defaultShippingCost: shipping });
    }
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
        const taxRate = (item.taxPercent ?? globalTax) / 100;
        // Lucro Líquido = Preço * (1 - Imposto%) - Custo
        // Margem de Lucro sobre o Custo = (Lucro Líquido / Custo) * 100
        const netProfit = uPrice * (1 - taxRate) - baseCost;
        item.markupPercent = Number(((netProfit / baseCost) * 100).toFixed(2));
      }
    } else if (field === 'quantity') {
      const qty = Number(value) || 1;
      item.quantity = qty;
      item.totalPrice = Number((item.unitPrice * qty).toFixed(2));
    } else if (field === 'sourceUrl') {
      const detectedStore = extractStoreNameFromUrl(value);
      if (detectedStore) {
        item.supplier = detectedStore;
      }
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

  // Upload e Colar Imagem para Itens da Cotação
  const handleTriggerUploadImage = (index: number) => {
    activeImageUploadIndexRef.current = index;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const targetIdx = activeImageUploadIndexRef.current;
    if (targetIdx === null || targetIdx === undefined) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        handleItemChange(targetIdx, 'imageUrl', dataUrl);
        handleItemChange(targetIdx, 'showImage', true);
      }
    };
    reader.readAsDataURL(file);
  };

  // Helper universal para extrair imagem de ClipboardEvent ou navigator.clipboard
  const extractImageFromClipboard = async (clipboardData: DataTransfer | null): Promise<string | null> => {
    // 1. Tenta extrair direto do DataTransfer síncrono (event.clipboardData)
    if (clipboardData) {
      // 1.1 Items (blobs / arquivos em memória gerados por print screen ou copiar imagem)
      const items = clipboardData.items;
      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (blob) {
              const res = await new Promise<string | null>((resolve) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target?.result as string || null);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              });
              if (res) return res;
            }
          }
        }
      }

      // 1.2 Files diretos
      const files = clipboardData.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.type.startsWith('image/')) {
            const res = await new Promise<string | null>((resolve) => {
              const reader = new FileReader();
              reader.onload = (event) => resolve(event.target?.result as string || null);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(file);
            });
            if (res) return res;
          }
        }
      }
    }

    // 2. Fallback via navigator.clipboard.read (acesso direto à área de transferência do sistema operacional)
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.read) {
      try {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          const imageType = item.types.find(t => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const res = await new Promise<string | null>((resolve) => {
              const reader = new FileReader();
              reader.onload = (event) => resolve(event.target?.result as string || null);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            });
            if (res) return res;
          }
        }
      } catch (err) {
        // Permissão de clipboard pode exigir clique direto do usuário
      }
    }

    return null;
  };

  // Leitura direta com acionamento por clique (garante permissão do navegador para ler o print)
  const readImageFromSystemClipboard = async (): Promise<string | null> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.read) {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          const imageType = item.types.find(t => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            return await new Promise<string | null>((resolve) => {
              const reader = new FileReader();
              reader.onload = (event) => resolve(event.target?.result as string || null);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            });
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao ler imagem da área de transferência:', err);
    }
    return null;
  };

  const handlePasteImageToItem = async (e: React.ClipboardEvent, index: number) => {
    const dataUrl = await extractImageFromClipboard(e.clipboardData);
    if (dataUrl) {
      e.preventDefault();
      e.stopPropagation();
      handleItemChange(index, 'imageUrl', dataUrl);
      handleItemChange(index, 'showImage', true);
    }
  };

  const handleDirectPasteToItem = async (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const dataUrl = await readImageFromSystemClipboard();
    if (dataUrl) {
      handleItemChange(index, 'imageUrl', dataUrl);
      handleItemChange(index, 'showImage', true);
    } else {
      alert('Nenhuma imagem encontrada na área de transferência. Tire um print (PrintScreen ou Win+Shift+S) ou copie uma imagem antes de colar.');
    }
  };

  // Upload e Colar Imagem para o Modal de Catálogo
  const handleTriggerCatalogImageUpload = () => {
    if (catalogFileInputRef.current) {
      catalogFileInputRef.current.value = '';
      catalogFileInputRef.current.click();
    }
  };

  const handleCatalogImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl && catalogReviewProduct) {
        setCatalogReviewProduct(prev => prev ? { ...prev, imageUrl: dataUrl } : null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePasteImageToCatalog = async (e: React.ClipboardEvent) => {
    const dataUrl = await extractImageFromClipboard(e.clipboardData);
    if (dataUrl) {
      e.preventDefault();
      e.stopPropagation();
      setCatalogReviewProduct(prev => prev ? { ...prev, imageUrl: dataUrl } : null);
    }
  };

  const handleDirectPasteToCatalog = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dataUrl = await readImageFromSystemClipboard();
    if (dataUrl) {
      setCatalogReviewProduct(prev => prev ? { ...prev, imageUrl: dataUrl } : null);
    } else {
      alert('Nenhuma imagem encontrada na área de transferência. Tire um print (PrintScreen ou Win+Shift+S) ou copie uma imagem antes de colar.');
    }
  };

  // Listener global de teclado (Ctrl+V) em qualquer lugar da tela (fase de captura)
  React.useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      const dataUrl = await extractImageFromClipboard(e.clipboardData);
      if (!dataUrl) return;

      // Se há imagem no print screen copiado:
      e.preventDefault();
      e.stopPropagation();

      // 1. Se o modal do catálogo estiver aberto, cola nele
      if (isCatalogModalOpen) {
        setCatalogReviewProduct(prev => prev ? { ...prev, imageUrl: dataUrl } : null);
        return;
      }

      // 2. Se houver item ativo clicado recentemente
      if (activeImageUploadIndexRef.current !== null && activeImageUploadIndexRef.current !== undefined) {
        const targetIdx = activeImageUploadIndexRef.current;
        handleItemChange(targetIdx, 'imageUrl', dataUrl);
        handleItemChange(targetIdx, 'showImage', true);
        return;
      }

      // 3. Procura o primeiro item sem foto na cotação, ou o item que está com foco
      const activeEl = document.activeElement;
      let targetItemIdx = -1;

      if (activeEl) {
        const tr = activeEl.closest('tr[data-item-index]');
        if (tr) {
          const idxAttr = tr.getAttribute('data-item-index');
          if (idxAttr !== null) targetItemIdx = parseInt(idxAttr, 10);
        }
      }

      if (targetItemIdx === -1) {
        // Encontra o primeiro item sem foto
        targetItemIdx = currentQuote.items.findIndex(it => !it.imageUrl);
      }

      if (targetItemIdx === -1 && currentQuote.items.length > 0) {
        // Se todos já tiverem foto, coloca no primeiro
        targetItemIdx = 0;
      }

      if (targetItemIdx >= 0 && targetItemIdx < currentQuote.items.length) {
        handleItemChange(targetItemIdx, 'imageUrl', dataUrl);
        handleItemChange(targetItemIdx, 'showImage', true);
        activeImageUploadIndexRef.current = targetItemIdx;
      }
    };

    // Usar true para fase de captura, interceptando o paste antes de qualquer outro handler
    window.addEventListener('paste', handleGlobalPaste, true);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste, true);
    };
  }, [isCatalogModalOpen, currentQuote.items]);

  // Fechar menu de capitalização do QuoteBuilder ao clicar fora
  React.useEffect(() => {
    const handleClickOutsideQuoteCase = (e: MouseEvent) => {
      if (quoteCaseMenuRef.current && !quoteCaseMenuRef.current.contains(e.target as Node)) {
        setIsQuoteCaseMenuOpen(false);
      }
    };
    if (isQuoteCaseMenuOpen) {
      document.addEventListener('mousedown', handleClickOutsideQuoteCase);
    }
    return () => document.removeEventListener('mousedown', handleClickOutsideQuoteCase);
  }, [isQuoteCaseMenuOpen]);

  // Fecha os dropdowns de busca dinâmica ao clicar fora
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        productSearchContainerRef.current &&
        !productSearchContainerRef.current.contains(e.target as Node)
      ) {
        setIsProductSearchOpen(false);
      }
      if (
        companySearchContainerRef.current &&
        !companySearchContainerRef.current.contains(e.target as Node)
      ) {
        setIsCompanySearchOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoomedImage) {
          setZoomedImage(null);
        } else if (isCatalogModalOpen) {
          setIsCatalogModalOpen(false);
        } else if (validationModal.isOpen) {
          setValidationModal(prev => ({ ...prev, isOpen: false }));
        } else if (isClientsModalOpen) {
          setIsClientsModalOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleExportExcel = async () => {
    try {
      await exportCostSheetToExcel(currentQuote);
    } catch (err) {
      console.error('Erro ao exportar planilha de custos para Excel:', err);
    }
  };

  const handleAddFromCatalog = (productIdToAdd?: string) => {
    const pId = productIdToAdd || selectedProductId;
    if (!pId) return;

    if (pId === '__NEW_CUSTOM_ITEM__') {
      handleAddItem();
      setSelectedProductId('');
      return;
    }

    const prod = products.find(p => p.id === pId);
    if (!prod) return;

    const unitPrice = calculateItemUnitPrice(prod.costPrice, globalShipping, globalMarkup, globalTax);
    const newItem: QuoteItem = {
      id: `item-${Date.now()}`,
      productId: prod.id,
      itemNumber: currentQuote.items.length + 1,
      name: prod.name,
      description: prod.description || '',
      imageUrl: prod.imageUrl || '',
      showImage: false,
      partNumber: prod.partNumber || '',
      ncm: prod.ncm || '',
      quantity: 1,
      unit: prod.unit || 'Un.',
      costPrice: prod.costPrice,
      shippingCost: globalShipping,
      taxPercent: globalTax,
      markupPercent: globalMarkup,
      unitPrice,
      totalPrice: unitPrice,
      supplier: prod.supplier,
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

  // Abre a janela do produto para verificação geral antes de salvar no catálogo
  const handleOpenCatalogReviewModal = (item: QuoteItem) => {
    // Buscar o item mais atualizado da cotação corrente para garantir que todas as edições feitas na tela sejam carregadas
    const freshItem = currentQuote.items.find(it => it.id === item.id) || item;
    const generatedSku = freshItem.partNumber ? freshItem.partNumber.trim() : (freshItem.productId || `INF-${Date.now().toString().slice(-4)}`);
    const initialCategory = getCategoryFromNcm(freshItem.ncm, 'Geral');
    setTargetQuoteItemId(freshItem.id);
    setCatalogReviewProduct({
      id: freshItem.productId || `prod-${Date.now()}`,
      sku: generatedSku,
      partNumber: freshItem.partNumber || '',
      ncm: freshItem.ncm || '',
      name: freshItem.name,
      description: freshItem.description || '',
      category: initialCategory,
      costPrice: freshItem.costPrice || 0,
      unit: freshItem.unit || 'Un.',
      supplier: freshItem.supplier || 'Fornecedor Web / Mercado',
      stock: 10,
      lastUpdated: new Date().toISOString().split('T')[0],
      sourceUrl: freshItem.sourceUrl || `https://www.google.com/search?q=${encodeURIComponent(freshItem.name)}`,
      imageUrl: freshItem.imageUrl || ''
    });
    setCatalogReviewCostInput(formatCurrencyPtBr(freshItem.costPrice || 0));
    setIsCatalogModalOpen(true);
  };

  // Salva a foto, descrição e demais dados apenas na proposta corrente (sem cadastrar no catálogo geral)
  const handleSaveToCurrentQuote = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!catalogReviewProduct || !targetQuoteItemId) {
      setIsCatalogModalOpen(false);
      return;
    }

    const itemIdx = currentQuote.items.findIndex(it => it.id === targetQuoteItemId);
    if (itemIdx >= 0) {
      const updatedItems = [...currentQuote.items];
      const currentItem = updatedItems[itemIdx];
      const newCost = Number(catalogReviewProduct.costPrice) || currentItem.costPrice;
      const newShipping = currentItem.shippingCost ?? globalShipping;
      const newMarkup = currentItem.markupPercent ?? globalMarkup;
      const newTax = currentItem.taxPercent ?? globalTax;
      const newUnitPrice = calculateItemUnitPrice(newCost, newShipping, newMarkup, newTax);

      updatedItems[itemIdx] = {
        ...currentItem,
        name: (catalogReviewProduct.name || currentItem.name).trim(),
        description: catalogReviewProduct.description !== undefined ? catalogReviewProduct.description.trim() : (currentItem.description || ''),
        imageUrl: catalogReviewProduct.imageUrl ?? currentItem.imageUrl,
        showImage: Boolean(catalogReviewProduct.imageUrl ?? currentItem.imageUrl),
        partNumber: catalogReviewProduct.sku || catalogReviewProduct.partNumber || currentItem.partNumber,
        ncm: catalogReviewProduct.ncm ?? currentItem.ncm,
        costPrice: newCost,
        unit: catalogReviewProduct.unit || currentItem.unit || 'Un.',
        supplier: catalogReviewProduct.supplier || currentItem.supplier,
        sourceUrl: catalogReviewProduct.sourceUrl || currentItem.sourceUrl,
        unitPrice: newUnitPrice,
        totalPrice: Number((newUnitPrice * currentItem.quantity).toFixed(2))
      };

      const totals = recalculateQuote(updatedItems);
      setCurrentQuote(prev => ({
        ...prev,
        items: updatedItems,
        ...totals
      }));
    }

    setIsCatalogModalOpen(false);
    setCatalogReviewProduct(null);
    setTargetQuoteItemId(null);
  };

  // Efetiva o salvamento no catálogo com o OK final do usuário
  const handleConfirmSaveCatalog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catalogReviewProduct || !catalogReviewProduct.name) return;

    if (onSaveToCatalog) {
      const unifiedCode = (catalogReviewProduct.sku || catalogReviewProduct.partNumber || '').trim();
      const finalProd: Product = {
        id: catalogReviewProduct.id || `prod-${Date.now()}`,
        sku: unifiedCode || `INF-${Date.now().toString().slice(-4)}`,
        partNumber: unifiedCode,
        ncm: catalogReviewProduct.ncm?.trim() || '',
        name: (catalogReviewProduct.name || '').trim(),
        description: catalogReviewProduct.description || '',
        category: catalogReviewProduct.category || 'Geral',
        costPrice: Number(catalogReviewProduct.costPrice) || 0,
        unit: catalogReviewProduct.unit || 'Un.',
        supplier: catalogReviewProduct.supplier || 'Fornecedor Web / Mercado',
        stock: Number(catalogReviewProduct.stock) || 10,
        lastUpdated: new Date().toISOString().split('T')[0],
        sourceUrl: catalogReviewProduct.sourceUrl || '',
        imageUrl: catalogReviewProduct.imageUrl || ''
      };

      onSaveToCatalog(finalProd);

      // Também sincroniza a proposta corrente para que a foto e o nome revisados fiquem nela
      if (targetQuoteItemId) {
        const itemIdx = currentQuote.items.findIndex(it => it.id === targetQuoteItemId);
        if (itemIdx >= 0) {
          const updatedItems = [...currentQuote.items];
          const currentItem = updatedItems[itemIdx];
          const newCost = Number(finalProd.costPrice) || currentItem.costPrice;
          const newShipping = currentItem.shippingCost ?? globalShipping;
          const newMarkup = currentItem.markupPercent ?? globalMarkup;
          const newTax = currentItem.taxPercent ?? globalTax;
          const newUnitPrice = calculateItemUnitPrice(newCost, newShipping, newMarkup, newTax);

          updatedItems[itemIdx] = {
            ...currentItem,
            productId: finalProd.id,
            name: finalProd.name,
            description: finalProd.description,
            imageUrl: finalProd.imageUrl,
            showImage: Boolean(finalProd.imageUrl),
            partNumber: finalProd.partNumber,
            ncm: finalProd.ncm,
            costPrice: newCost,
            unit: finalProd.unit,
            supplier: finalProd.supplier,
            sourceUrl: finalProd.sourceUrl,
            unitPrice: newUnitPrice,
            totalPrice: Number((newUnitPrice * currentItem.quantity).toFixed(2))
          };

          const totals = recalculateQuote(updatedItems);
          setCurrentQuote(prev => ({
            ...prev,
            items: updatedItems,
            ...totals
          }));
        }

        setSavedCatalogIds(prev => ({ ...prev, [targetQuoteItemId]: true }));
        setTimeout(() => {
          setSavedCatalogIds(prev => ({ ...prev, [targetQuoteItemId]: false }));
        }, 3000);
      }
    }

    setIsCatalogModalOpen(false);
    setCatalogReviewProduct(null);
    setTargetQuoteItemId(null);
  };

  const handleRemoveItem = (index: number) => {
    const removedItem = currentQuote.items[index];
    if (removedItem) {
      setSelectedItemIds(prev => prev.filter(id => id !== removedItem.id));
    }
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

  // Duplicação instantânea de item
  const handleDuplicateItem = (index: number) => {
    const original = currentQuote.items[index];
    if (!original) return;
    const duplicated: QuoteItem = {
      ...original,
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: `${original.name}`,
    };
    const updatedItems = [...currentQuote.items];
    updatedItems.splice(index + 1, 0, duplicated);
    const renumbered = updatedItems.map((item, idx) => ({
      ...item,
      itemNumber: idx + 1
    }));
    const totals = recalculateQuote(renumbered);
    setCurrentQuote(prev => ({
      ...prev,
      items: renumbered,
      ...totals
    }));
  };

  // Reordenação de item para cima
  const handleMoveItemUp = (index: number) => {
    if (index <= 0) return;
    const itemsCopy = [...currentQuote.items];
    const temp = itemsCopy[index - 1];
    itemsCopy[index - 1] = itemsCopy[index];
    itemsCopy[index] = temp;
    const renumbered = itemsCopy.map((item, idx) => ({
      ...item,
      itemNumber: idx + 1
    }));
    const totals = recalculateQuote(renumbered);
    setCurrentQuote(prev => ({
      ...prev,
      items: renumbered,
      ...totals
    }));
  };

  // Reordenação de item para baixo
  const handleMoveItemDown = (index: number) => {
    if (index >= currentQuote.items.length - 1) return;
    const itemsCopy = [...currentQuote.items];
    const temp = itemsCopy[index + 1];
    itemsCopy[index + 1] = itemsCopy[index];
    itemsCopy[index] = temp;
    const renumbered = itemsCopy.map((item, idx) => ({
      ...item,
      itemNumber: idx + 1
    }));
    const totals = recalculateQuote(renumbered);
    setCurrentQuote(prev => ({
      ...prev,
      items: renumbered,
      ...totals
    }));
  };

  // Alterna seleção individual de item
  const handleToggleSelectItem = (id: string) => {
    setSelectedItemIds(prev =>
      prev.includes(id) ? prev.filter(itemKey => itemKey !== id) : [...prev, id]
    );
  };

  // Alterna selecionar todos os itens ou limpar seleção
  const handleToggleSelectAll = () => {
    if (selectedItemIds.length === currentQuote.items.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(currentQuote.items.map(it => it.id));
    }
  };

  // Aplica a porcentagem de lucro/margem digitada exclusivamente aos itens selecionados
  const handleApplyMarkupToSelectedItems = (val: string) => {
    const parsed = parsePtBrNumber(val);
    if (isNaN(parsed) || parsed < 0) return;

    // Se nenhum item foi explicitamente marcado com checkbox, avisa o usuário ou não altera
    if (selectedItemIds.length === 0) {
      alert('Selecione ao menos um item da proposta marcando a caixinha ao lado do item para alterar a margem em lote.');
      return;
    }

    const updatedItems = currentQuote.items.map(item => {
      if (selectedItemIds.includes(item.id)) {
        const shipping = item.shippingCost ?? globalShipping;
        const tax = item.taxPercent ?? globalTax;
        const unitPrice = calculateItemUnitPrice(item.costPrice, shipping, parsed, tax);
        const totalPrice = Number((unitPrice * item.quantity).toFixed(2));
        return {
          ...item,
          markupPercent: parsed,
          unitPrice,
          totalPrice
        };
      }
      return item;
    });

    const totals = recalculateQuote(updatedItems);
    setCurrentQuote(prev => ({
      ...prev,
      items: updatedItems,
      ...totals
    }));
  };

  // Preenchimento em lote: adicionar marca ou prefixo nos itens selecionados/todos
  const handleApplyPrefixOrBrandToAll = (brand: string) => {
    if (!brand.trim()) return;
    const cleanBrand = brand.trim();
    const updated = currentQuote.items.map(it => {
      const alreadyHasBrand = it.name.toLowerCase().includes(cleanBrand.toLowerCase());
      return {
        ...it,
        name: alreadyHasBrand ? it.name : `${cleanBrand} ${it.name}`.trim(),
        supplier: it.supplier || cleanBrand
      };
    });
    setCurrentQuote(prev => ({
      ...prev,
      items: updated
    }));
  };

  // Preenchimento em lote: aplicar formatação de texto estilo Word em todos os itens da cotação
  const handleApplyCaseToQuoteItems = (style: WordCaseStyle) => {
    setActiveQuoteCaseStyle(style);
    setIsQuoteCaseMenuOpen(false);
    setCurrentQuote(prev => ({
      ...prev,
      items: prev.items.map(it => ({
        ...it,
        name: applyTextCase(it.name, style)
      }))
    }));
  };

  // Alterna Maiúsculas/Minúsculas no item:
  // Se o usuário selecionou uma ou mais palavras no textarea, aplica APENAS na seleção!
  // Se não houver seleção, aplica no nome completo do item.
  const handleCycleItemTextCase = (idx: number, itemId: string) => {
    const item = currentQuote.items[idx];
    if (!item) return;

    const textarea = itemNameTextareaRefs.current[itemId];
    const fullText = item.name || '';

    // Verifica se há texto/palavras selecionadas
    if (textarea && textarea.selectionStart !== undefined && textarea.selectionEnd !== undefined && textarea.selectionEnd > textarea.selectionStart) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = fullText.substring(start, end);

      if (selectedText.trim()) {
        // Determina o próximo estilo para o trecho selecionado
        let nextStyle: WordCaseStyle = 'uppercase';
        if (selectedText === applyTextCase(selectedText, 'uppercase')) {
          nextStyle = 'lowercase';
        } else if (selectedText === applyTextCase(selectedText, 'lowercase')) {
          nextStyle = 'sentence';
        } else if (selectedText === applyTextCase(selectedText, 'sentence')) {
          nextStyle = 'title';
        } else {
          nextStyle = 'uppercase';
        }

        const transformedPart = applyTextCase(selectedText, nextStyle);
        const newFullText = fullText.substring(0, start) + transformedPart + fullText.substring(end);

        handleItemChange(idx, 'name', newFullText);

        // Restaura a seleção do trecho e devolve o foco no textarea
        setTimeout(() => {
          if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(start, start + transformedPart.length);
          }
        }, 0);
        return;
      }
    }

    // Se nenhuma palavra estava selecionada, cicla o texto inteiro do item
    let nextStyle: WordCaseStyle = 'sentence';
    if (fullText === applyTextCase(fullText, 'sentence')) {
      nextStyle = 'lowercase';
    } else if (fullText === applyTextCase(fullText, 'lowercase')) {
      nextStyle = 'uppercase';
    } else if (fullText === applyTextCase(fullText, 'uppercase')) {
      nextStyle = 'title';
    } else {
      nextStyle = 'sentence';
    }

    handleItemChange(idx, 'name', applyTextCase(fullText, nextStyle));
  };

  const quoteTaxes = currentQuote.totalTaxes ??
    currentQuote.items.reduce((acc, item) => {
      const taxRate = (item.taxPercent ?? globalTax ?? 0) / 100;
      return acc + (item.totalPrice * taxRate);
    }, 0);

  const quoteShipping = currentQuote.totalShipping ??
    currentQuote.items.reduce((acc, item) => acc + ((item.shippingCost ?? globalShipping ?? 0) * item.quantity), 0);

  return (
    <div className="space-y-6">

      {/* Header Bar with Action Buttons */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg md:text-xl font-bold text-slate-900">Nova Proposta Comercial</h1>
            <span className="px-2.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold rounded-lg font-mono">
              {currentQuote.code}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure os dados do cliente, custos, alíquota de impostos e margem de lucro da Infodesk.
          </p>
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

        <div 
          onClick={() => {
            setModalTaxInput(globalTax.toString().replace('.', ','));
            setIsTaxModalOpen(true);
          }}
          className="bg-white hover:bg-indigo-50/40 border border-slate-200 hover:border-indigo-300 p-4 rounded-2xl shadow-xs cursor-pointer transition group select-none active:scale-[0.99]"
          title="Clique para editar a alíquota de impostos desta proposta"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider group-hover:text-indigo-700 transition">Impostos ({globalTax}%)</span>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-indigo-500 opacity-0 group-hover:opacity-100 transition font-bold">Editar ✎</span>
              <Receipt className="w-4 h-4 text-indigo-500" />
            </div>
          </div>
          <p className="text-base font-bold text-slate-900 font-mono">
            R$ {quoteTaxes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="text-[10px] text-indigo-600 font-medium flex items-center justify-between pt-0.5">
            <span>Simples / ICMS embutido</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setModalTaxInput(globalTax.toString().replace('.', ','));
                setIsTaxModalOpen(true);
              }}
              className="text-[9.5px] font-bold text-indigo-700 hover:text-indigo-900 underline cursor-pointer bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded transition"
            >
              Alterar %
            </button>
          </div>
        </div>

        <div 
          onClick={() => {
            setModalMarkupInput(globalMarkup.toString().replace('.', ','));
            setIsMarkupModalOpen(true);
          }}
          className={`border p-4 rounded-2xl shadow-xs transition cursor-pointer group select-none active:scale-[0.99] ${
            currentQuote.averageMargin < 12 && currentQuote.items.length > 0
              ? 'bg-amber-50/60 hover:bg-amber-50 border-amber-300 ring-1 ring-amber-300/50'
              : 'bg-white hover:bg-emerald-50/40 border-slate-200 hover:border-emerald-300'
          }`}
          title="Clique para editar a Margem de Lucro (% Markup) de todos os itens"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider group-hover:text-emerald-700 transition">Lucro Líquido Real</span>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-emerald-600 opacity-0 group-hover:opacity-100 transition font-bold">Editar ✎</span>
              {currentQuote.averageMargin < 12 && currentQuote.items.length > 0 ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-md">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  Margem Baixa
                </span>
              ) : (
                <Sparkles className="w-4 h-4 text-emerald-600" />
              )}
            </div>
          </div>
          <p className={`text-base font-bold font-mono ${
            currentQuote.averageMargin < 12 && currentQuote.items.length > 0 ? 'text-amber-800' : 'text-emerald-600'
          }`}>
            R$ {currentQuote.totalProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="text-[10px] text-slate-600 font-semibold flex items-center justify-between pt-0.5" title={`Margem líquida após impostos: ${currentQuote.averageMargin.toFixed(1)}% | Markup comercial: ${globalMarkup}%`}>
            <span>Margem real: <strong className={currentQuote.averageMargin < 12 && currentQuote.items.length > 0 ? 'text-amber-700 font-bold' : 'text-emerald-700'}>{currentQuote.averageMargin.toFixed(1)}%</strong></span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setModalMarkupInput(globalMarkup.toString().replace('.', ','));
                setIsMarkupModalOpen(true);
              }}
              className="text-[9.5px] font-bold text-emerald-700 hover:text-emerald-900 underline cursor-pointer bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded transition"
            >
              Alterar
            </button>
          </div>
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



      {/* Client Destination Info */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building className="w-4 h-4 text-sky-600" />
            <span>Dados do Solicitante & Identificação</span>
          </h3>
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
            <div ref={companySearchContainerRef} className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={currentQuote.clientCompany}
                  onChange={(e) => {
                    const val = e.target.value;
                    const newCode = generateQuoteCode(val);
                    setCurrentQuote(prev => ({ 
                      ...prev, 
                      clientCompany: val,
                      code: val.trim().length >= 2 ? newCode : prev.code
                    }));
                    setIsCompanySearchOpen(true);
                  }}
                  onFocus={() => {
                    if (currentQuote.clientCompany?.trim()) {
                      setIsCompanySearchOpen(true);
                    }
                  }}
                  placeholder="Digite para buscar empresa cadastrada..."
                  className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 hover:border-sky-400 rounded-xl pl-9 pr-8 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 font-medium transition"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <Building className="w-4 h-4 text-slate-400" />
                </div>

                {currentQuote.clientCompany && (
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentQuote(prev => ({ ...prev, clientCompany: '' }));
                      setIsCompanySearchOpen(false);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200/70 rounded-md text-slate-400 hover:text-slate-600 transition"
                    title="Limpar nome da empresa"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Dropdown de resultados filtrados em tempo real ao digitar a empresa */}
              {isCompanySearchOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden max-h-72 flex flex-col animate-scaleIn">
                  <div className="p-2 overflow-y-auto divide-y divide-slate-100">
                    {(() => {
                      const query = (currentQuote.clientCompany || '')
                        .replace(/^(ao|à|a|para)\s+/i, '')
                        .trim()
                        .toLowerCase();

                      const filtered = clientCompanies.filter(c => {
                        if (!query) return false;
                        const nameMatch = (c.name || '').toLowerCase().includes(query);
                        const locMatch = (c.locations || []).some(l => l.toLowerCase().includes(query));
                        const contactMatch = (c.contacts || []).some(ct => ct.name.toLowerCase().includes(query) || (ct.email || '').toLowerCase().includes(query));
                        return nameMatch || locMatch || contactMatch;
                      });

                      if (!query) {
                        return (
                          <div className="p-3 text-center text-xs text-slate-400">
                            <p className="font-semibold text-slate-600">Digite o nome da empresa...</p>
                            <p className="text-[10.5px] text-slate-400 mt-0.5">Ex: "UBEC", "SABIN", "CNC" ou nome de comprador.</p>
                          </div>
                        );
                      }

                      if (filtered.length === 0) {
                        return (
                          <div className="p-3.5 text-center text-xs text-slate-500">
                            <p className="font-semibold text-slate-700">Nenhuma empresa salva como "{currentQuote.clientCompany}"</p>
                            <p className="text-[10.5px] text-slate-400 mt-1">
                              Você pode continuar digitando normalmente para usar essa empresa nesta proposta.
                            </p>
                          </div>
                        );
                      }

                      return (
                        <div className="pt-0.5 space-y-1">
                          <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Empresas Encontradas ({filtered.length})
                          </div>
                          {filtered.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                const formatted = formatCompanyPrefix(c.name);
                                setCurrentQuote(prev => ({
                                  ...prev,
                                  clientCompany: formatted,
                                  deliveryLocation: c.defaultDeliveryLocation || prev.deliveryLocation,
                                  shippingTerms: c.defaultDeliveryLocation ? `Frete incluso p/ ${c.defaultDeliveryLocation}.` : prev.shippingTerms,
                                  code: generateQuoteCode(c.name)
                                }));
                                setIsCompanySearchOpen(false);
                              }}
                              className="w-full text-left p-2.5 hover:bg-sky-50/80 rounded-xl transition flex items-center justify-between gap-3 border border-transparent hover:border-sky-200 cursor-pointer group"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-lg bg-sky-100 group-hover:bg-sky-200 text-sky-700 flex items-center justify-center shrink-0">
                                  <Building className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-slate-900 group-hover:text-sky-900 truncate">
                                    {c.name}
                                  </div>
                                  <div className="text-[10.5px] text-slate-500 flex items-center gap-2 truncate">
                                    {c.defaultDeliveryLocation && <span>📍 {c.defaultDeliveryLocation}</span>}
                                    {c.contacts?.length > 0 && (
                                      <span>👥 {c.contacts.length} comprador(es)</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <span className="text-[10.5px] font-bold text-sky-600 bg-white border border-sky-200 group-hover:bg-sky-600 group-hover:text-white px-2 py-0.5 rounded-md shrink-0 transition">
                                Selecionar
                              </span>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-600">A/C (Nome do Comprador)</label>
              {matchedCompany && matchedCompany.contacts.length > 0 && (
                <span className="text-[10px] text-sky-700 bg-sky-50 px-2 py-0.5 rounded font-semibold border border-sky-200">
                  {matchedCompany.contacts.length} comprador(es) disponível(is)
                </span>
              )}
            </div>

            <div ref={buyerSearchContainerRef} className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={currentQuote.contactPerson}
                  onChange={(e) => {
                    setCurrentQuote(prev => ({ ...prev, contactPerson: e.target.value }));
                    setIsBuyerSearchOpen(true);
                  }}
                  onFocus={() => {
                    if (matchedCompany && matchedCompany.contacts.length > 0) {
                      setIsBuyerSearchOpen(true);
                    }
                  }}
                  placeholder={matchedCompany && matchedCompany.contacts.length > 0 ? "Clique para listar compradores da empresa ou digite para filtrar..." : "Ex: A/C Sr. Alex ou A/C Srta. Alexandra"}
                  className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 hover:border-sky-400 rounded-xl pl-9 pr-8 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 font-medium transition"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <UserCheck className="w-4 h-4 text-slate-400" />
                </div>

                {currentQuote.contactPerson && (
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentQuote(prev => ({ ...prev, contactPerson: '' }));
                      setIsBuyerSearchOpen(false);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200/70 rounded-md text-slate-400 hover:text-slate-600 transition"
                    title="Limpar comprador"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Dropdown de compradores vinculados exclusivamente à empresa escolhida */}
              {isBuyerSearchOpen && matchedCompany && matchedCompany.contacts.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden max-h-60 flex flex-col animate-scaleIn">
                  <div className="p-2 overflow-y-auto divide-y divide-slate-100">
                    {(() => {
                      const query = (currentQuote.contactPerson || '')
                        .replace(/^a\/c\s*/i, '')
                        .replace(/^(sr\.|sra\.|srta\.|dr\.|dra\.)\s+/i, '')
                        .trim()
                        .toLowerCase();

                      const filteredContacts = matchedCompany.contacts.filter(contact => {
                        if (!query) return true;
                        const nameMatch = contact.name.toLowerCase().includes(query);
                        const emailMatch = (contact.email || '').toLowerCase().includes(query);
                        const phoneMatch = (contact.phone || '').toLowerCase().includes(query);
                        return nameMatch || emailMatch || phoneMatch;
                      });

                      if (filteredContacts.length === 0) {
                        return (
                          <div className="p-3 text-center text-xs text-slate-500">
                            <p className="font-semibold text-slate-700">Nenhum comprador cadastrado com "{currentQuote.contactPerson}"</p>
                            <p className="text-[10.5px] text-slate-400 mt-1">
                              Você pode continuar digitando normalmente para usar este novo comprador.
                            </p>
                          </div>
                        );
                      }

                      return (
                        <div className="pt-0.5 space-y-1">
                          <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                            <span>Compradores da {matchedCompany.name.split('—')[0].split('-')[0].trim()} ({filteredContacts.length})</span>
                            <span className="text-[9px] font-normal text-slate-400">Clique para selecionar</span>
                          </div>
                          {filteredContacts.map(contact => {
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
                                  setIsBuyerSearchOpen(false);
                                }}
                                className={`w-full text-left p-2.5 rounded-xl transition flex items-center justify-between gap-3 border cursor-pointer ${
                                  isSelected
                                    ? 'bg-sky-50 border-sky-300'
                                    : 'hover:bg-sky-50/80 border-transparent hover:border-sky-200'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                    isSelected ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-700'
                                  }`}>
                                    <UserCheck className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-xs font-bold text-slate-900 truncate">
                                      {contact.title || 'Sr(a).'} {contact.name}
                                    </div>
                                    <div className="text-[10.5px] text-slate-500 flex items-center gap-2 truncate">
                                      {contact.email && <span>✉️ {contact.email}</span>}
                                      {contact.phone && <span>📞 {contact.phone}</span>}
                                    </div>
                                  </div>
                                </div>

                                <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md shrink-0 transition ${
                                  isSelected
                                    ? 'bg-sky-600 text-white'
                                    : 'text-sky-600 bg-white border border-sky-200'
                                }`}>
                                  {isSelected ? 'Selecionado' : 'Preencher'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
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
              value={maskPhone(currentQuote.clientPhone || '')}
              onChange={(e) => {
                const masked = maskPhone(e.target.value);
                setCurrentQuote(prev => ({ ...prev, clientPhone: masked }));
              }}
              placeholder="Ex: (61) 3403-2944"
              maxLength={15}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Código / Referência</label>
            <input
              type="text"
              value={currentQuote.code}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, code: e.target.value }))}
              placeholder="Ex: SABIN 050926"
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

          <div ref={locationSearchContainerRef} className="relative">
            <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-sky-600" />
              <span>Localidade do Frete / Destino da Entrega</span>
            </label>

            <div className="relative">
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
                  setIsLocationSearchOpen(true);
                }}
                onFocus={() => {
                  if (matchedCompany?.locations && matchedCompany.locations.length > 0) {
                    setIsLocationSearchOpen(true);
                  }
                }}
                placeholder={matchedCompany?.locations && matchedCompany.locations.length > 0 ? "Clique para listar cidades da empresa ou digite para buscar..." : "Ex: Brasília, Coronel Fabriciano, Joinville..."}
                className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 hover:border-sky-400 rounded-xl pl-9 pr-8 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 font-medium transition"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <MapPin className="w-4 h-4 text-slate-400" />
              </div>

              {currentQuote.deliveryLocation && (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentQuote(prev => ({
                      ...prev,
                      deliveryLocation: '',
                      shippingTerms: 'Frete incluso p/ sua localidade.'
                    }));
                    setIsLocationSearchOpen(false);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200/70 rounded-md text-slate-400 hover:text-slate-600 transition"
                  title="Limpar localidade"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown de destinos de frete vinculados exclusivamente à empresa escolhida */}
            {isLocationSearchOpen && matchedCompany && matchedCompany.locations && matchedCompany.locations.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden max-h-60 flex flex-col animate-scaleIn">
                <div className="p-2 overflow-y-auto divide-y divide-slate-100">
                  {(() => {
                    const query = (currentQuote.deliveryLocation || '').trim().toLowerCase();
                    const filteredLocations = matchedCompany.locations.filter(loc => {
                      if (!query) return true;
                      return loc.toLowerCase().includes(query);
                    });

                    if (filteredLocations.length === 0) {
                      return (
                        <div className="p-3 text-center text-xs text-slate-500">
                          <p className="font-semibold text-slate-700">Nenhum destino cadastrado com "{currentQuote.deliveryLocation}"</p>
                          <p className="text-[10.5px] text-slate-400 mt-1">
                            Você pode continuar digitando livremente para usar este destino.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="pt-0.5 space-y-1">
                        <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Destinos da {matchedCompany.name.split('—')[0].split('-')[0].trim()} ({filteredLocations.length})</span>
                          <span className="text-[9px] font-normal text-slate-400">Clique para selecionar</span>
                        </div>
                        {filteredLocations.map(loc => {
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
                                setIsLocationSearchOpen(false);
                              }}
                              className={`w-full text-left p-2.5 rounded-xl transition flex items-center justify-between gap-3 border cursor-pointer ${
                                isSelected
                                  ? 'bg-sky-50 border-sky-300'
                                  : 'hover:bg-sky-50/80 border-transparent hover:border-sky-200'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                  isSelected ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-700'
                                }`}>
                                  <MapPin className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-slate-900 truncate">
                                    {loc}
                                  </div>
                                  <div className="text-[10.5px] text-slate-500 truncate">
                                    Frete incluso p/ {loc}
                                  </div>
                                </div>
                              </div>

                              <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md shrink-0 transition ${
                                isSelected
                                  ? 'bg-sky-600 text-white'
                                  : 'text-sky-600 bg-white border border-sky-200'
                              }`}>
                                {isSelected ? 'Selecionado' : 'Selecionar'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Items & Prices Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        {/* Barra superior estilo ERP / Sistema Comercial: Selecione ou crie um novo item */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-200">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
              <span>Produtos/Serviços</span>
              <span className="text-red-500 font-bold">*</span>
              <span className="text-slate-400 font-normal">|</span>
              <span className="text-slate-600 font-semibold flex items-center gap-1">
                Selecione ou crie um novo item
                <span title="Selecione um produto da sua base de Produtos Infodesk para inserir com foto e custos já preenchidos, ou crie uma nova linha em branco para preenchimento manual.">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-sky-600 cursor-help transition" />
                </span>
              </span>
            </label>
            <div className="flex items-center gap-2.5">
              {/* Botão de Alternância de Visualização Compacta / Detalhada */}
              {currentQuote.items && currentQuote.items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsCompactTableMode(prev => !prev)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-1.5 border shadow-2xs cursor-pointer ${
                    isCompactTableMode
                      ? 'bg-sky-50 text-sky-700 border-sky-300 ring-1 ring-sky-200'
                      : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                  title="Alternar entre modo compacto (linhas menores e mais limpas) e detalhado (com utilitários de fotos e links expandidos)"
                >
                  <LayoutList className="w-3.5 h-3.5 text-sky-600" />
                  <span>{isCompactTableMode ? 'Visualização Detalhada' : 'Visualização Compacta'}</span>
                </button>
              )}

              {currentQuote.items && currentQuote.items.length > 0 && (
                <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                  {currentQuote.items.length} {currentQuote.items.length === 1 ? 'item na cotação' : 'itens na cotação'}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div ref={productSearchContainerRef} className="relative flex-1">
              <div className="relative">
                <input
                  type="text"
                  value={productSearchQuery}
                  onChange={(e) => {
                    setProductSearchQuery(e.target.value);
                    setIsProductSearchOpen(true);
                  }}
                  onFocus={() => {
                    setIsProductSearchOpen(true);
                  }}
                  placeholder="Digite o nome, código ou marca para buscar nos produtos..."
                  className="w-full bg-white border border-slate-300 hover:border-sky-400 rounded-xl pl-9 pr-24 py-2.5 text-xs text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs transition"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <Search className="w-4 h-4 text-slate-400" />
                </div>

                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {productSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setProductSearchQuery('');
                      }}
                      className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition text-xs"
                      title="Limpar busca"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      handleAddFromCatalog('__NEW_CUSTOM_ITEM__');
                      setProductSearchQuery('');
                      setIsProductSearchOpen(false);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-[11px] font-bold transition active:scale-95"
                    title="Criar novo item diretamente"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Novo</span>
                  </button>
                </div>
              </div>

              {/* Dropdown de resultados filtrados em tempo real ao digitar */}
              {isProductSearchOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden max-h-80 flex flex-col animate-scaleIn">
                  <div className="p-2 overflow-y-auto divide-y divide-slate-100">
                    {/* Opção Rápida de Criar Novo */}
                    <button
                      type="button"
                      onClick={() => {
                        handleAddFromCatalog('__NEW_CUSTOM_ITEM__');
                        setProductSearchQuery('');
                        setIsProductSearchOpen(false);
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-sky-50 rounded-xl transition flex items-center gap-2.5 text-xs text-sky-700 font-bold group mb-1 border border-transparent hover:border-sky-200"
                    >
                      <div className="w-7 h-7 rounded-lg bg-sky-100 group-hover:bg-sky-200 text-sky-700 flex items-center justify-center shrink-0">
                        <Plus className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span>+ Criar novo item em branco na cotação</span>
                        <p className="text-[10.5px] font-normal text-slate-500">
                          {productSearchQuery ? `Ou use "${productSearchQuery}" como descrição inicial` : 'Preenchimento manual de código, custo e fotos'}
                        </p>
                      </div>
                    </button>

                    {/* Resultados da busca incremental no catálogo */}
                    {(() => {
                      const query = productSearchQuery.trim().toLowerCase();
                      const filtered = products.filter(p => {
                        if (!query) return false; // Não abre todos os itens se não digitou nada!
                        const nameMatch = (p.name || '').toLowerCase().includes(query);
                        const skuMatch = (p.sku || '').toLowerCase().includes(query);
                        const partMatch = (p.partNumber || '').toLowerCase().includes(query);
                        const catMatch = (p.category || '').toLowerCase().includes(query);
                        return nameMatch || skuMatch || partMatch || catMatch;
                      });

                      if (!query) {
                        return (
                          <div className="p-4 text-center text-xs text-slate-400">
                            <p className="font-semibold text-slate-600">Digite para buscar nos produtos...</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">Ex: "Café", "Cabo", "Intelbras", "0901" ou código do produto.</p>
                          </div>
                        );
                      }

                      if (filtered.length === 0) {
                        return (
                          <div className="p-4 text-center text-xs text-slate-500">
                            <p className="font-semibold text-slate-700">Nenhum item encontrado para "{productSearchQuery}"</p>
                            <p className="text-[11px] text-slate-400 mt-1">
                              Clique no botão <strong className="text-sky-600">+ Criar novo item</strong> acima para adicionar manualmente.
                            </p>
                          </div>
                        );
                      }

                      return (
                        <div className="pt-1 space-y-1">
                          <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Produtos Encontrados ({filtered.length})
                          </div>
                          {filtered.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                handleAddFromCatalog(p.id);
                                setProductSearchQuery('');
                                setIsProductSearchOpen(false);
                              }}
                              className="w-full text-left p-2.5 hover:bg-slate-50 rounded-xl transition flex items-center gap-3 border border-transparent hover:border-slate-200 cursor-pointer group"
                            >
                              {p.imageUrl ? (
                                <img
                                  src={p.imageUrl}
                                  alt={p.name}
                                  className="w-9 h-9 object-contain bg-white border border-slate-200 rounded-lg p-0.5 shrink-0"
                                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-400">
                                  <Package className="w-4 h-4" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-900 truncate group-hover:text-sky-700">
                                  {p.name}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-slate-500 font-mono">
                                  {p.partNumber && <span>Part: {p.partNumber}</span>}
                                  {p.sku && <span>SKU: {p.sku}</span>}
                                  <span className="text-slate-400 font-sans">• {p.unit || 'Un.'}</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-xs font-bold text-emerald-700 font-mono block">
                                  R$ {p.costPrice.toFixed(2)}
                                </span>
                                <span className="text-[10px] text-slate-400">Custo Ref.</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Barra de Operações Rápidas em Lote (Bulk Actions) */}
          {currentQuote.items && currentQuote.items.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                  <span>Ações em Lote:</span>
                </span>

                <button
                  type="button"
                  onClick={() => {
                    const brand = window.prompt('Digite a marca/fabricante para aplicar ao nome de todos os itens (Ex: Dell, HP, Lenovo, Intelbras):');
                    if (brand) handleApplyPrefixOrBrandToAll(brand);
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-sky-50 text-slate-700 hover:text-sky-700 border border-slate-200 rounded-lg text-[11px] font-semibold transition shadow-2xs cursor-pointer"
                  title="Aplica o nome da marca na frente da descrição dos itens que ainda não a possuem"
                >
                  + Inserir Marca em Todos
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const months = window.prompt('Definir meses de garantia padrão para o texto da proposta (Ex: 12, 24, 36):', '12');
                    if (months) {
                      const num = parseInt(months, 10);
                      if (!isNaN(num) && num > 0) {
                        setCurrentQuote(prev => ({
                          ...prev,
                          warrantyTerms: formatWarrantyMonthsText(num)
                        }));
                      }
                    }
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-sky-50 text-slate-700 hover:text-sky-700 border border-slate-200 rounded-lg text-[11px] font-semibold transition shadow-2xs cursor-pointer"
                  title="Padroniza cláusula de garantia na proposta para todos os itens"
                >
                  Garantia Padronizada
                </button>

                {/* Botão de Formatação Word (Maiúsculas/Minúsculas) em Lote */}
                <div className="relative" ref={quoteCaseMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsQuoteCaseMenuOpen(prev => !prev)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition shadow-2xs cursor-pointer flex items-center gap-1.5 border ${
                      isQuoteCaseMenuOpen
                        ? 'bg-sky-50 text-sky-700 border-sky-300 ring-1 ring-sky-200'
                        : 'bg-white hover:bg-sky-50 text-slate-700 hover:text-sky-700 border-slate-200'
                    }`}
                    title="Altera maiúsculas/minúsculas de todos os itens da cotação (estilo Microsoft Word)"
                  >
                    <span className="font-serif font-bold text-xs tracking-tight text-sky-700 bg-sky-100 px-1 py-0.2 rounded">
                      Aa
                    </span>
                    <span>Maiúsculas / Minúsculas</span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </button>

                  {isQuoteCaseMenuOpen && (
                    <div className="absolute left-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl py-1.5 z-40 animate-in fade-in slide-in-from-top-1">
                      <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Formatar Itens da Cotação (Word)
                      </div>

                      <button
                        type="button"
                        onClick={() => handleApplyCaseToQuoteItems('sentence')}
                        className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-sky-50 transition ${
                          activeQuoteCaseStyle === 'sentence' ? 'font-bold text-sky-700 bg-sky-50/60' : 'text-slate-700'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold">Primeira da frase maiúscula</span>
                          <span className="text-[10px] text-slate-400">Ex: Teclado sem fio logitech k380</span>
                        </div>
                        {activeQuoteCaseStyle === 'sentence' && <Check className="w-4 h-4 text-sky-600 shrink-0" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApplyCaseToQuoteItems('lowercase')}
                        className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-sky-50 transition ${
                          activeQuoteCaseStyle === 'lowercase' ? 'font-bold text-sky-700 bg-sky-50/60' : 'text-slate-700'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold">minúsculas</span>
                          <span className="text-[10px] text-slate-400">Ex: teclado sem fio logitech k380</span>
                        </div>
                        {activeQuoteCaseStyle === 'lowercase' && <Check className="w-4 h-4 text-sky-600 shrink-0" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApplyCaseToQuoteItems('uppercase')}
                        className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-sky-50 transition ${
                          activeQuoteCaseStyle === 'uppercase' ? 'font-bold text-sky-700 bg-sky-50/60' : 'text-slate-700'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold">MAIÚSCULAS</span>
                          <span className="text-[10px] text-slate-400">Ex: TECLADO SEM FIO LOGITECH K380</span>
                        </div>
                        {activeQuoteCaseStyle === 'uppercase' && <Check className="w-4 h-4 text-sky-600 shrink-0" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApplyCaseToQuoteItems('title')}
                        className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-sky-50 transition ${
                          activeQuoteCaseStyle === 'title' ? 'font-bold text-sky-700 bg-sky-50/60' : 'text-slate-700'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold">Primeira de Cada Palavra Maiúscula</span>
                          <span className="text-[10px] text-slate-400">Ex: Teclado Sem Fio Logitech K380</span>
                        </div>
                        {activeQuoteCaseStyle === 'title' && <Check className="w-4 h-4 text-sky-600 shrink-0" />}
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const allHaveImage = currentQuote.items.every(i => i.showImage);
                    const updated = currentQuote.items.map(i => ({ ...i, showImage: !allHaveImage }));
                    setCurrentQuote(prev => ({ ...prev, items: updated }));
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-sky-50 text-slate-700 hover:text-sky-700 border border-slate-200 rounded-lg text-[11px] font-semibold transition shadow-2xs cursor-pointer"
                  title="Ativa ou desativa a exibição das fotos no PDF/Word para todos os itens simultaneamente"
                >
                  {currentQuote.items.every(i => i.showImage) ? 'Ocultar Fotos no PDF' : 'Exibir Fotos no PDF (Todos)'}
                </button>

                {/* Divisor vertical */}
                <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>

                {/* Campo Editável de Porcentagem de Lucro para Itens Selecionados */}
                <div className="flex items-center gap-1.5 bg-sky-50/80 border border-sky-200/80 px-2.5 py-1 rounded-xl shadow-2xs">
                  <span className="text-[11px] font-bold text-sky-900 flex items-center gap-1">
                    <Percent className="w-3.5 h-3.5 text-sky-600" />
                    <span>Lucro:</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={batchMarkupInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBatchMarkupInput(val);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleApplyMarkupToSelectedItems(batchMarkupInput);
                        }
                      }}
                      placeholder={formatPercentPtBr(globalMarkup)}
                      className="w-16 h-7 bg-white border border-sky-300 rounded-lg px-2 text-xs font-mono font-bold text-slate-900 text-center focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs"
                      title="Digite a porcentagem de lucro e clique em 'Aplicar nos Selecionados' ou pressione Enter"
                    />
                    <button
                      type="button"
                      onClick={() => handleApplyMarkupToSelectedItems(batchMarkupInput)}
                      className="px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[11px] font-bold shadow-2xs transition active:scale-95 cursor-pointer whitespace-nowrap"
                      title={selectedItemIds.length > 0 ? `Aplicar ${batchMarkupInput || formatPercentPtBr(globalMarkup)}% nos ${selectedItemIds.length} item(ns) selecionado(s)` : 'Selecione os itens pelas caixinhas ao lado do número para aplicar'}
                    >
                      Aplicar nos Selecionados {selectedItemIds.length > 0 && `(${selectedItemIds.length})`}
                    </button>
                  </div>
                  {selectedItemIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedItemIds([])}
                      className="text-[10px] text-slate-500 hover:text-rose-600 underline font-semibold transition ml-1"
                      title="Desmarcar todos os itens"
                    >
                      Limpar seleção
                    </button>
                  )}
                </div>
              </div>

              <div className="text-[11px] text-slate-500 font-medium">
                Dica: Você pode <strong>duplicar</strong> itens e <strong>reordenar</strong> nas setinhas da tabela.
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="p-3 w-14 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="checkbox"
                      checked={currentQuote.items.length > 0 && selectedItemIds.length === currentQuote.items.length}
                      onChange={handleToggleSelectAll}
                      className="w-3.5 h-3.5 rounded text-sky-600 border-slate-300 focus:ring-sky-500 cursor-pointer"
                      title={selectedItemIds.length === currentQuote.items.length ? "Desmarcar todos" : "Selecionar todos os itens"}
                    />
                    <span>Item</span>
                  </div>
                </th>
                <th className="p-3 min-w-[280px]">Descrição Detalhada do Produto</th>
                <th className="p-3 w-20 min-w-[76px] text-center">Qtd.</th>
                <th className="p-3 w-16 text-center">Un.</th>
                <th className="p-3 w-24 text-center">Custo (R$)</th>
                <th className="p-3 w-24 text-center">Frete (R$)</th>
                <th className="p-3 w-24 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setModalMarkupInput(globalMarkup.toString().replace('.', ','));
                      setIsMarkupModalOpen(true);
                    }}
                    className="group/mth inline-flex items-center justify-center gap-1 hover:text-sky-600 transition cursor-pointer"
                    title="Margem de Lucro (% Markup). Clique para aplicar uma nova margem em lote para todos os itens"
                  >
                    <span>Margem %</span>
                    <span className="text-[9px] text-sky-500 opacity-60 group-hover/mth:opacity-100 font-normal">✎</span>
                  </button>
                </th>
                <th className="p-3 w-28 text-center">Preço Unit. (R$)</th>
                <th className="p-3 w-28 text-center">Preço Total (R$)</th>
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
                  <tr 
                    key={item.id} 
                    data-item-index={idx}
                    onClick={() => { activeImageUploadIndexRef.current = idx; }}
                    className={`transition group align-top ${
                      selectedItemIds.includes(item.id)
                        ? 'bg-sky-50/50 hover:bg-sky-50/80'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >

                    <td className="p-3 text-center font-bold text-slate-500 pt-4">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={selectedItemIds.includes(item.id)}
                          onChange={() => handleToggleSelectItem(item.id)}
                          className="w-4 h-4 rounded text-sky-600 border-slate-300 focus:ring-sky-500 cursor-pointer"
                          title={`Selecionar item ${item.itemNumber || idx + 1} para ações em lote`}
                        />
                        <span className="text-[11px] font-mono text-slate-600">{item.itemNumber}</span>
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="flex flex-col gap-2">
                        {/* Linha principal: Foto + Descrição */}
                        <div className="flex items-start gap-2.5">
                          {/* Caixa de Foto / Upload / Zoom */}
                          <div
                            tabIndex={0}
                            onClick={(e) => {
                              if (item.imageUrl) {
                                e.stopPropagation();
                                setZoomedImage({
                                  url: item.imageUrl,
                                  title: item.name || `Item ${item.itemNumber || idx + 1}`,
                                  itemNumber: item.itemNumber || idx + 1
                                });
                              } else {
                                activeImageUploadIndexRef.current = idx;
                                handleTriggerUploadImage(idx);
                              }
                            }}
                            onFocus={() => { activeImageUploadIndexRef.current = idx; }}
                            onPaste={(e) => handlePasteImageToItem(e, idx)}
                            title={item.imageUrl ? "Clique para ver a foto com ZOOM no meio da tela (ou use Ctrl+V para colar outra)" : "Clique para buscar foto nos arquivos ou aperte Ctrl+V para colar"}
                            className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 overflow-hidden cursor-pointer transition relative group/img select-none focus:outline-none focus:ring-2 focus:ring-sky-400 ${
                              item.imageUrl 
                                ? 'border-slate-200 bg-white p-1 shadow-2xs hover:border-sky-500 hover:shadow-md' 
                                : 'border-dashed border-sky-300 bg-sky-50/60 hover:bg-sky-100/80 hover:border-sky-500 text-sky-600'
                            }`}
                          >
                            {item.imageUrl ? (
                              <>
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="w-full h-full object-contain group-hover/img:scale-105 transition duration-200"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                                <div className="absolute inset-0 bg-sky-950/50 opacity-0 group-hover/img:opacity-100 transition flex flex-col items-center justify-center text-white backdrop-blur-[0.5px]">
                                  <ZoomIn className="w-4 h-4 text-white drop-shadow-sm" />
                                  <span className="text-[7.5px] font-bold tracking-wider uppercase mt-0.5">Zoom</span>
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-col items-center justify-center text-center p-0.5">
                                <ImagePlus className="w-4 h-4 text-sky-500 group-hover/img:scale-110 transition" />
                                <span className="text-[8px] font-bold text-sky-700 leading-tight mt-0.5">+ Foto</span>
                              </div>
                            )}
                          </div>

                          {/* Campo de Descrição */}
                          <div className="flex-1 min-w-0">
                            <textarea
                              ref={(el) => { itemNameTextareaRefs.current[item.id] = el; }}
                              rows={2}
                              value={item.name}
                              onFocus={() => { activeImageUploadIndexRef.current = idx; }}
                              onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                              onPaste={(e) => handlePasteImageToItem(e, idx)}
                              placeholder="Descrição padronizada do produto"
                              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white resize-y leading-relaxed"
                            />
                          </div>
                        </div>

                        {/* Barra de utilidades (recolhida no modo compacto) */}
                        {!isCompactTableMode && (
                          <div className="flex items-center justify-between gap-2 pl-0.5 text-[11px] pt-0.5">
                            <div className="flex items-center gap-3">
                              <label className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={!!item.showImage}
                                  onChange={(e) => handleItemChange(idx, 'showImage', e.target.checked)}
                                  className="rounded text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                                />
                                <span className="font-medium">Foto na proposta</span>
                              </label>

                              {item.imageUrl ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleItemChange(idx, 'imageUrl', '');
                                    handleItemChange(idx, 'showImage', false);
                                  }}
                                  className="text-[10px] text-slate-400 hover:text-red-500 transition"
                                  title="Remover foto deste item"
                                >
                                  Remover foto
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => handleDirectPasteToItem(e, idx)}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-1.5 py-0.5 rounded transition"
                                  title="Colar print da área de transferência direto para este item (Ctrl+V)"
                                >
                                  <ClipboardPaste className="w-2.5 h-2.5" />
                                  <span>Colar Print</span>
                                </button>
                              )}

                              {item.sourceUrl && isExactProductUrl(item.sourceUrl) ? (
                                <a
                                  href={item.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-bold transition text-[10px]"
                                  title={`Abrir link do produto em ${item.supplier || 'loja'}`}
                                >
                                  <ExternalLink className="w-3 h-3 text-emerald-600" />
                                  <span>{item.supplier ? item.supplier : 'Link Exato'}</span>
                                </a>
                              ) : (
                                <a
                                  href={`https://www.google.com/search?q=${encodeURIComponent(item.rawSearchQuery || item.name)}&tbm=shop`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 hover:underline text-[10px]"
                                  title="Buscar preços no Google Shopping"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Ver Ofertas</span>
                                </a>
                              )}
                            </div>

                            {onSaveToCatalog && (
                              <button
                                type="button"
                                onClick={() => handleOpenCatalogReviewModal(item)}
                                title="Editar foto, descrição padronizada, NCM e dados deste item"
                                className={`text-[10px] font-semibold flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition ${savedCatalogIds[item.id]
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-100 hover:bg-sky-50 hover:text-sky-700 hover:border-sky-200 text-slate-600 border-slate-200'
                                  }`}
                              >
                                {savedCatalogIds[item.id] ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span>Atualizado</span>
                                  </>
                                ) : (
                                  <>
                                    <Edit3 className="w-3 h-3 text-sky-600" />
                                    <span>Editar</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Qtd */}
                    <td className="p-3 w-20 min-w-[76px]">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                        className="w-full h-9 min-w-[56px] bg-slate-50 border border-slate-300 rounded-lg px-2 text-xs text-center font-bold text-slate-900 focus:outline-none focus:border-sky-500 font-mono leading-none"
                      />
                    </td>

                    {/* Unidade */}
                    <td className="p-3">
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                        className="w-full h-9 bg-slate-50 border border-slate-300 rounded-lg px-2 text-xs text-center text-slate-700 focus:outline-none focus:border-sky-500 font-medium leading-none"
                      />
                    </td>

                    {/* Custo Unitário */}
                    <td className="p-3">
                      <input
                        type="text"
                        value={
                          editingInputs[`${idx}-costPrice`] !== undefined
                            ? editingInputs[`${idx}-costPrice`]
                            : formatCurrencyPtBr(item.costPrice)
                        }
                        onFocus={() => {
                          setEditingInputs(prev => ({
                            ...prev,
                            [`${idx}-costPrice`]: item.costPrice > 0 ? formatCurrencyPtBr(item.costPrice) : ''
                          }));
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditingInputs(prev => ({ ...prev, [`${idx}-costPrice`]: val }));
                        }}
                        onBlur={() => {
                          const rawVal = editingInputs[`${idx}-costPrice`];
                          if (rawVal !== undefined) {
                            const parsed = parsePtBrNumber(rawVal);
                            handleItemChange(idx, 'costPrice', parsed);
                            setEditingInputs(prev => {
                              const copy = { ...prev };
                              delete copy[`${idx}-costPrice`];
                              return copy;
                            });
                          }
                        }}
                        className="w-full h-9 bg-slate-50 border border-slate-300 rounded-lg px-2 text-xs text-center font-mono text-slate-700 focus:outline-none focus:border-sky-500 focus:bg-white leading-none"
                      />
                    </td>

                    {/* Frete Unitário */}
                    <td className="p-3">
                      <input
                        type="text"
                        value={
                          editingInputs[`${idx}-shippingCost`] !== undefined
                            ? editingInputs[`${idx}-shippingCost`]
                            : formatCurrencyPtBr(item.shippingCost ?? globalShipping)
                        }
                        onFocus={() => {
                          const shipVal = item.shippingCost ?? globalShipping ?? 0;
                          setEditingInputs(prev => ({
                            ...prev,
                            [`${idx}-shippingCost`]: shipVal > 0 ? formatCurrencyPtBr(shipVal) : ''
                          }));
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditingInputs(prev => ({ ...prev, [`${idx}-shippingCost`]: val }));
                        }}
                        onBlur={() => {
                          const rawVal = editingInputs[`${idx}-shippingCost`];
                          if (rawVal !== undefined) {
                            const parsed = parsePtBrNumber(rawVal);
                            handleItemChange(idx, 'shippingCost', parsed);
                            setEditingInputs(prev => {
                              const copy = { ...prev };
                              delete copy[`${idx}-shippingCost`];
                              return copy;
                            });
                          }
                        }}
                        className="w-full h-9 bg-slate-50 border border-slate-300 rounded-lg px-2 text-xs text-center font-mono text-amber-700 font-semibold focus:outline-none focus:border-amber-500 focus:bg-white leading-none"
                      />
                    </td>

                    {/* Margem Lucro */}
                    <td className="p-3">
                      <div className="relative flex items-center justify-center">
                        <input
                          type="text"
                          value={
                            editingInputs[`${idx}-markupPercent`] !== undefined
                              ? editingInputs[`${idx}-markupPercent`]
                              : formatPercentPtBr(item.markupPercent ?? globalMarkup)
                          }
                          onFocus={() => {
                            const markVal = item.markupPercent ?? globalMarkup ?? 0;
                            setEditingInputs(prev => ({
                              ...prev,
                              [`${idx}-markupPercent`]: markVal > 0 ? formatPercentPtBr(markVal) : ''
                            }));
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingInputs(prev => ({ ...prev, [`${idx}-markupPercent`]: val }));
                          }}
                          onBlur={() => {
                            const rawVal = editingInputs[`${idx}-markupPercent`];
                            if (rawVal !== undefined) {
                              const parsed = parsePtBrNumber(rawVal);
                              handleItemChange(idx, 'markupPercent', parsed);
                              setEditingInputs(prev => {
                                const copy = { ...prev };
                                delete copy[`${idx}-markupPercent`];
                                return copy;
                              });
                            }
                          }}
                          className="w-full h-9 bg-slate-50 border border-slate-300 rounded-lg pl-2 pr-5 text-xs text-center font-bold text-sky-700 focus:outline-none focus:border-sky-500 focus:bg-white leading-none"
                        />
                        <span className="absolute right-2 text-[10px] text-slate-400 pointer-events-none">%</span>
                      </div>
                    </td>

                    {/* Preço Unitário */}
                    <td className="p-3">
                      <input
                        type="text"
                        value={
                          editingInputs[`${idx}-unitPrice`] !== undefined
                            ? editingInputs[`${idx}-unitPrice`]
                            : formatCurrencyPtBr(item.unitPrice)
                        }
                        onFocus={() => {
                          setEditingInputs(prev => ({
                            ...prev,
                            [`${idx}-unitPrice`]: item.unitPrice > 0 ? formatCurrencyPtBr(item.unitPrice) : ''
                          }));
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditingInputs(prev => ({ ...prev, [`${idx}-unitPrice`]: val }));
                        }}
                        onBlur={() => {
                          const rawVal = editingInputs[`${idx}-unitPrice`];
                          if (rawVal !== undefined) {
                            const parsed = parsePtBrNumber(rawVal);
                            handleItemChange(idx, 'unitPrice', parsed);
                            setEditingInputs(prev => {
                              const copy = { ...prev };
                              delete copy[`${idx}-unitPrice`];
                              return copy;
                            });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && idx === currentQuote.items.length - 1) {
                            e.preventDefault();
                            handleAddItem();
                          }
                        }}
                        className="w-full h-9 bg-slate-50 border border-slate-300 rounded-lg px-2 text-xs text-center font-bold text-slate-900 font-mono focus:outline-none focus:border-sky-500 focus:bg-white leading-none"
                      />
                    </td>

                    {/* Preço Total do Item */}
                    <td className="p-3 text-center font-bold text-emerald-700 font-mono text-xs whitespace-nowrap pt-5">
                      R$ {formatCurrencyPtBr(item.totalPrice)}
                    </td>

                    <td className="p-3 text-center pt-3.5">
                      <div className="flex items-center justify-center gap-1">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleMoveItemUp(idx)}
                            disabled={idx === 0}
                            className="text-slate-400 hover:text-sky-600 disabled:opacity-20 p-0.5 rounded hover:bg-sky-50 transition"
                            title="Mover para cima"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveItemDown(idx)}
                            disabled={idx === currentQuote.items.length - 1}
                            className="text-slate-400 hover:text-sky-600 disabled:opacity-20 p-0.5 rounded hover:bg-sky-50 transition"
                            title="Mover para baixo"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDuplicateItem(idx)}
                          className="text-slate-400 hover:text-sky-600 p-1.5 rounded-lg hover:bg-sky-50 transition inline-flex items-center justify-center"
                          title="Duplicar este item (clone)"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition inline-flex items-center justify-center"
                          title="Remover Item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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

      {/* Commercial Terms & Conditions (Sanfona Retrátil com Resumo) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
        <div 
          onClick={() => setIsCommercialConditionsOpen(prev => !prev)}
          className="flex items-center justify-between cursor-pointer select-none group"
        >
          <div className="flex items-center gap-2.5 flex-wrap">
            <Calendar className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-sky-700 transition">
              Condições Gerais de Fornecimento (Padrão Infodesk)
            </h3>
            {/* Chips de Resumo Visual quando recolhido */}
            <div className="flex items-center gap-1.5 flex-wrap text-[10.5px]">
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                ⏳ {extractValidityDaysNumber(currentQuote.validityDays)} dias validade
              </span>
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                💳 {currentQuote.paymentTerms?.split('.')[0] || 'Faturado'}
              </span>
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                🚚 {extractDeliveryDaysNumber(currentQuote.deliveryDays)} dias entrega
              </span>
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                🛡️ {extractWarrantyMonthsNumber(currentQuote.warrantyTerms)} meses garantia
              </span>
            </div>
          </div>

          <button
            type="button"
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 group-hover:text-sky-600 transition"
            title={isCommercialConditionsOpen ? "Recolher condições gerais" : "Expandir condições gerais"}
          >
            {isCommercialConditionsOpen ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>

        {isCommercialConditionsOpen && (
          <div className="space-y-4 pt-1 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
              {/* Validade da Proposta */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-slate-600 font-medium">Validade da Proposta</label>
              <span className="text-[11px] font-bold text-sky-700 font-mono">
                {extractValidityDaysNumber(currentQuote.validityDays)} dias
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[2, 3, 5, 7, 10, 15, 30].map(days => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setCurrentQuote(prev => ({
                    ...prev,
                    validityDays: formatValidityDaysText(days)
                  }))}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${extractValidityDaysNumber(currentQuote.validityDays) === days
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
                  value={extractValidityDaysNumber(currentQuote.validityDays)}
                  onChange={(e) => {
                    const d = parseInt(e.target.value, 10) || 1;
                    setCurrentQuote(prev => ({
                      ...prev,
                      validityDays: formatValidityDaysText(d)
                    }));
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-0.5 text-center text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
            <input
              type="text"
              value={currentQuote.validityDays}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, validityDays: e.target.value }))}
              placeholder="05 (cinco) dias ou enquanto durar o estoque."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-sky-500 text-[11px] font-medium"
            />
          </div>

          {/* Condições de Pagamento */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-slate-600 font-medium">Condições de Pagamento</label>
              <span className="text-[11px] font-bold text-sky-700 font-mono">
                {currentQuote.paymentTerms?.toLowerCase().includes('faturado')
                  ? 'Faturado'
                  : currentQuote.paymentTerms?.toLowerCase().includes('vista')
                    ? 'À vista'
                    : `${extractPaymentDaysNumber(currentQuote.paymentTerms)} dias`}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setCurrentQuote(prev => ({
                  ...prev,
                  paymentTerms: 'Faturado.'
                }))}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${currentQuote.paymentTerms?.toLowerCase().includes('faturado')
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  }`}
              >
                Faturado
              </button>
              <button
                type="button"
                onClick={() => setCurrentQuote(prev => ({
                  ...prev,
                  paymentTerms: 'À vista.'
                }))}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${currentQuote.paymentTerms?.toLowerCase().includes('vista')
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  }`}
              >
                À vista
              </button>
              {[15, 21, 28, 30, 45, 60].map(days => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setCurrentQuote(prev => ({
                    ...prev,
                    paymentTerms: formatPaymentTermsDays(days)
                  }))}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${!currentQuote.paymentTerms?.toLowerCase().includes('vista') && !currentQuote.paymentTerms?.toLowerCase().includes('faturado') && extractPaymentDaysNumber(currentQuote.paymentTerms) === days
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
                  min="0"
                  max="180"
                  value={currentQuote.paymentTerms?.toLowerCase().includes('vista') ? 0 : extractPaymentDaysNumber(currentQuote.paymentTerms)}
                  onChange={(e) => {
                    const d = parseInt(e.target.value, 10);
                    setCurrentQuote(prev => ({
                      ...prev,
                      paymentTerms: d === 0 ? 'À vista.' : formatPaymentTermsDays(d || 30)
                    }));
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-0.5 text-center text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
            <input
              type="text"
              value={currentQuote.paymentTerms}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, paymentTerms: e.target.value }))}
              placeholder="30 dias"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-sky-500 text-[11px] font-medium"
            />
          </div>

          {/* Prazo de Entrega */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-slate-600 font-medium">Prazo de Entrega (Dias Úteis)</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeliveryException(prev => !prev)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition flex items-center gap-1 ${
                    showDeliveryException
                      ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                      : exceptionItemNumbers.length > 0
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
                  title="Configurar prazo diferente para itens específicos"
                >
                  <span>⚡ {showDeliveryException ? 'Ocultar Exceção' : (exceptionItemNumbers.length > 0 ? `Exceção ativa (${exceptionItemNumbers.length})` : '+ Regra de Exceção')}</span>
                </button>
                <span className="text-[11px] font-bold text-sky-700 font-mono">
                  {extractDeliveryDaysNumber(currentQuote.deliveryDays)} dias
                </span>
              </div>
            </div>

            {/* Dias gerais da proposta */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10.5px] text-slate-400 font-medium mr-0.5">Padrão:</span>
              {[3, 5, 7, 10, 15, 20, 30].map(days => (
                <button
                  key={days}
                  type="button"
                  onClick={() => {
                    const phrase = exceptionItemNumbers.length > 0
                      ? formatDeliveryDaysWithException(days, exceptionItemNumbers, exceptionDays)
                      : formatDeliveryDaysText(days);
                    setCurrentQuote(prev => ({
                      ...prev,
                      deliveryDays: phrase
                    }));
                  }}
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
                    const phrase = exceptionItemNumbers.length > 0
                      ? formatDeliveryDaysWithException(d, exceptionItemNumbers, exceptionDays)
                      : formatDeliveryDaysText(d);
                    setCurrentQuote(prev => ({
                      ...prev,
                      deliveryDays: phrase
                    }));
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-0.5 text-center text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Painel de Regra de Exceção por Itens */}
            {showDeliveryException && (
              <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-xl space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
                    <span>⚠️ Regra de Exceção:</span>
                    <span className="font-normal text-amber-800">Escolha quais itens terão prazo diferente</span>
                  </span>
                  {exceptionItemNumbers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setExceptionItemNumbers([]);
                        const stdDays = extractDeliveryDaysNumber(currentQuote.deliveryDays);
                        setCurrentQuote(prev => ({
                          ...prev,
                          deliveryDays: formatDeliveryDaysText(stdDays)
                        }));
                      }}
                      className="text-[10px] text-amber-800 hover:underline font-semibold"
                    >
                      Limpar exceção
                    </button>
                  )}
                </div>

                {/* Seleção dos itens */}
                {currentQuote.items && currentQuote.items.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {currentQuote.items.map((it, idx) => {
                      const itemNum = it.itemNumber || idx + 1;
                      const isSelected = exceptionItemNumbers.includes(itemNum);
                      const shortName = it.name ? (it.name.length > 25 ? `${it.name.slice(0, 25)}...` : it.name) : `Item ${itemNum}`;

                      return (
                        <button
                          key={it.id || idx}
                          type="button"
                          onClick={() => {
                            const newSelection = isSelected
                              ? exceptionItemNumbers.filter(n => n !== itemNum)
                              : [...exceptionItemNumbers, itemNum];
                            setExceptionItemNumbers(newSelection);

                            const stdDays = extractDeliveryDaysNumber(currentQuote.deliveryDays);
                            const phrase = newSelection.length > 0
                              ? formatDeliveryDaysWithException(stdDays, newSelection, exceptionDays)
                              : formatDeliveryDaysText(stdDays);

                            setCurrentQuote(prev => ({
                              ...prev,
                              deliveryDays: phrase
                            }));
                          }}
                          className={`text-[10.5px] px-2.5 py-1 rounded-lg border font-medium transition flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-amber-600 text-white border-amber-700 font-bold shadow-2xs'
                              : 'bg-white hover:bg-amber-100/70 text-slate-700 border-amber-200'
                          }`}
                        >
                          <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[9.5px]">
                            {itemNum}
                          </span>
                          <span>{shortName}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10.5px] text-amber-700 italic">Adicione produtos na cotação para selecionar os itens da exceção.</p>
                )}

                {/* Prazo para os itens selecionados */}
                <div className="flex items-center gap-2 pt-1 border-t border-amber-200/60 flex-wrap">
                  <span className="text-[10.5px] font-bold text-amber-900">Prazo dos itens selecionados:</span>
                  {[5, 10, 15, 20, 25, 30, 45].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setExceptionDays(d);
                        const stdDays = extractDeliveryDaysNumber(currentQuote.deliveryDays);
                        if (exceptionItemNumbers.length > 0) {
                          setCurrentQuote(prev => ({
                            ...prev,
                            deliveryDays: formatDeliveryDaysWithException(stdDays, exceptionItemNumbers, d)
                          }));
                        }
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                        exceptionDays === d
                          ? 'bg-amber-700 text-white shadow-2xs'
                          : 'bg-white text-amber-900 border border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                  <div className="relative inline-block w-16">
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={exceptionDays}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 1;
                        setExceptionDays(val);
                        const stdDays = extractDeliveryDaysNumber(currentQuote.deliveryDays);
                        if (exceptionItemNumbers.length > 0) {
                          setCurrentQuote(prev => ({
                            ...prev,
                            deliveryDays: formatDeliveryDaysWithException(stdDays, exceptionItemNumbers, val)
                          }));
                        }
                      }}
                      className="w-full bg-white border border-amber-300 rounded px-2 py-0.5 text-center text-xs font-bold text-amber-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>
            )}

            <input
              type="text"
              value={currentQuote.deliveryDays}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, deliveryDays: e.target.value }))}
              placeholder="em até 10 (dez) dias úteis após autorização de fornecimento."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-sky-500 text-[11px] font-medium"
            />
          </div>

          {/* Termos de Garantia */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-slate-600 font-medium">Termos de Garantia</label>
              <span className="text-[11px] font-bold text-sky-700 font-mono">
                {extractWarrantyMonthsNumber(currentQuote.warrantyTerms)} meses
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[3, 6, 12, 24, 36].map(months => (
                <button
                  key={months}
                  type="button"
                  onClick={() => setCurrentQuote(prev => ({
                    ...prev,
                    warrantyTerms: formatWarrantyMonthsText(months)
                  }))}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${extractWarrantyMonthsNumber(currentQuote.warrantyTerms) === months
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                >
                  {months}m
                </button>
              ))}
              <div className="relative inline-block w-16">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={extractWarrantyMonthsNumber(currentQuote.warrantyTerms)}
                  onChange={(e) => {
                    const m = parseInt(e.target.value, 10) || 1;
                    setCurrentQuote(prev => ({
                      ...prev,
                      warrantyTerms: formatWarrantyMonthsText(m)
                    }));
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-0.5 text-center text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
            <input
              type="text"
              value={currentQuote.warrantyTerms}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, warrantyTerms: e.target.value }))}
              placeholder="12 (doze) meses balcão para defeitos de fabricação."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-sky-500 text-[11px] font-medium"
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
      )}
    </div>

      {/* Barra de Ações Finais da Cotação (Barra Flutuante Fixa / Sticky Footer) */}
      <div className="sticky bottom-3 z-30 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-lg shadow-slate-900/10 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all">
        <div className="text-left w-full sm:w-auto">
          <p className="text-xs text-slate-500 font-medium">
            Total da Cotação: <strong className="text-slate-900 font-mono text-base ml-1">R$ {currentQuote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </p>
          <p className="text-[11px] text-slate-400">
            {currentQuote.items.length} {currentQuote.items.length === 1 ? 'item cotado' : 'itens cotados'} • Margem média de {currentQuote.averageMargin.toFixed(1)}%
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={() => persistAndProceed(onSave)}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
            title="Salva alterações na proposta atual (rascunho)"
          >
            <Save className="w-3.5 h-3.5 text-slate-600" />
            <span>Salvar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!currentQuote.items || currentQuote.items.length === 0) {
                alert('Adicione ao menos um produto na cotação para exportar a planilha Excel.');
                return;
              }
              handleExportExcel();
            }}
            className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
            title="Baixar planilha de custos e precificação detalhada no Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Salvar Excel</span>
          </button>

          <button
            type="button"
            onClick={() => persistAndProceed(onPreview, true)}
            className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm shadow-sky-600/25 cursor-pointer active:scale-95"
            title="Visualizar documento pronto para impressão ou download em PDF"
          >
            <Eye className="w-4 h-4" />
            <span>Visualizar proposta</span>
          </button>

          <button
            type="button"
            onClick={() => persistAndProceed(onSendEmail, true)}
            className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm shadow-emerald-600/25 cursor-pointer active:scale-95"
            title="Disparar proposta comercial formal por e-mail para o cliente"
          >
            <Send className="w-4 h-4" />
            <span>Enviar e-mail</span>
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

      {/* Modal de Verificação Geral antes de Salvar no Catálogo */}
      {isCatalogModalOpen && catalogReviewProduct && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-sky-100 text-sky-700 rounded-xl">
                  <Package className="w-5 h-5 text-sky-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    Verificação Geral do Produto
                    <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-[10px] rounded-full font-bold">
                      Proposta & Produtos
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Revise os dados comerciais, foto e descrição. Você pode salvar apenas na proposta corrente ou cadastrar na base de produtos geral.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCatalogModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-xs font-bold transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleConfirmSaveCatalog} className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Foto Preview & Nome */}
              <div className="flex items-start gap-4 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div
                    tabIndex={0}
                    onClick={handleTriggerCatalogImageUpload}
                    onPaste={handlePasteImageToCatalog}
                    title="Clique para escolher foto do produto ou aperte Ctrl+V para colar foto copiada"
                    className={`w-16 h-16 rounded-xl overflow-hidden shrink-0 flex items-center justify-center p-1 cursor-pointer transition relative group/cimg select-none focus:outline-none focus:ring-2 focus:ring-sky-400 ${
                      catalogReviewProduct.imageUrl
                        ? 'bg-white border border-slate-300 hover:border-sky-500 shadow-2xs'
                        : 'border-2 border-dashed border-sky-300 bg-sky-50 hover:bg-sky-100 hover:border-sky-500'
                    }`}
                  >
                    {catalogReviewProduct.imageUrl ? (
                      <>
                        <img
                          src={catalogReviewProduct.imageUrl}
                          alt={catalogReviewProduct.name || 'Produto'}
                          className="w-full h-full object-contain"
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/cimg:opacity-100 transition flex items-center justify-center text-white">
                          <Camera className="w-4 h-4" />
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center">
                        <ImagePlus className="w-5 h-5 text-sky-500 group-hover/cimg:scale-110 transition" />
                        <span className="text-[9px] font-bold text-sky-700 leading-tight mt-0.5">+ Foto</span>
                      </div>
                    )}
                  </div>
                  
                  <button
                    type="button"
                    onClick={handleDirectPasteToCatalog}
                    title="Colar print screen ou imagem da área de transferência (Ctrl+V)"
                    className="px-2 py-0.5 rounded text-[9.5px] font-semibold bg-sky-100 hover:bg-sky-200 text-sky-800 border border-sky-300 shadow-2xs flex items-center gap-1 transition"
                  >
                    <ClipboardPaste className="w-3 h-3" />
                    Colar Print
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700">
                      Nome Padronizado Comercial *
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          // Impede que o clique no botão desfaça a seleção no input
                          e.preventDefault();
                        }}
                        onClick={() => {
                          if (!catalogReviewProduct?.name) return;
                          const input = catalogProductNameInputRef.current;
                          const fullText = catalogReviewProduct.name;

                          // 1. Se há texto selecionado no input, transforma APENAS o trecho selecionado
                          if (input && input.selectionStart !== null && input.selectionEnd !== null && input.selectionEnd > input.selectionStart) {
                            const start = input.selectionStart;
                            const end = input.selectionEnd;
                            const selectedPart = fullText.substring(start, end);

                            if (selectedPart.trim()) {
                              let nextStyle: WordCaseStyle = 'uppercase';
                              if (selectedPart === applyTextCase(selectedPart, 'uppercase')) {
                                nextStyle = 'lowercase';
                              } else if (selectedPart === applyTextCase(selectedPart, 'lowercase')) {
                                nextStyle = 'sentence';
                              } else if (selectedPart === applyTextCase(selectedPart, 'sentence')) {
                                nextStyle = 'title';
                              } else {
                                nextStyle = 'uppercase';
                              }

                              const transformedPart = applyTextCase(selectedPart, nextStyle);
                              const newFullText = fullText.substring(0, start) + transformedPart + fullText.substring(end);

                              setCatalogReviewProduct(prev => prev ? {
                                ...prev,
                                name: newFullText
                              } : null);

                              // Preserva a seleção e devolve o foco no trecho
                              setTimeout(() => {
                                if (input) {
                                  input.focus();
                                  input.setSelectionRange(start, start + transformedPart.length);
                                }
                              }, 0);
                              return;
                            }
                          }

                          // 2. Se nada estiver selecionado, cicla o texto completo
                          let nextStyle: WordCaseStyle = 'sentence';
                          if (fullText === applyTextCase(fullText, 'sentence')) {
                            nextStyle = 'lowercase';
                          } else if (fullText === applyTextCase(fullText, 'lowercase')) {
                            nextStyle = 'uppercase';
                          } else if (fullText === applyTextCase(fullText, 'uppercase')) {
                            nextStyle = 'title';
                          } else {
                            nextStyle = 'sentence';
                          }

                          setCatalogReviewProduct(prev => prev ? {
                            ...prev,
                            name: applyTextCase(fullText, nextStyle)
                          } : null);
                        }}
                        className="inline-flex items-center gap-1 text-slate-500 hover:text-sky-700 bg-slate-100 hover:bg-sky-50 border border-slate-200 hover:border-sky-200 px-1.5 py-0.5 rounded font-bold transition text-[10px] cursor-pointer active:scale-95"
                        title="Altera maiúsculas/minúsculas estilo Word. Se você selecionou uma ou mais palavras, altera APENAS o trecho selecionado!"
                      >
                        <span className="font-serif font-bold text-[11px] leading-none text-sky-700">Aa</span>
                        <span className="text-[9px] font-medium text-slate-600">Mudar Caso</span>
                      </button>
                      <span className="text-[10px] text-slate-400">
                        <b>Ctrl+V</b> cola print
                      </span>
                    </div>
                  </div>
                  <input
                    ref={catalogProductNameInputRef}
                    type="text"
                    required
                    value={catalogReviewProduct.name || ''}
                    onChange={(e) => setCatalogReviewProduct({ ...catalogReviewProduct, name: e.target.value })}
                    onPaste={handlePasteImageToCatalog}
                    placeholder="Nome completo do produto sem traços ou vírgulas"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:border-sky-500"
                  />
                  {catalogReviewProduct.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setCatalogReviewProduct(prev => prev ? { ...prev, imageUrl: '' } : null)}
                      className="text-[10px] text-slate-400 hover:text-red-500 mt-1 block transition"
                    >
                      Remover foto
                    </button>
                  )}
                </div>
              </div>

              {/* Especificações Técnicas Completas */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Especificações Técnicas Completas
                </label>
                <textarea
                  rows={2}
                  value={catalogReviewProduct.description || ''}
                  onChange={(e) => setCatalogReviewProduct({ ...catalogReviewProduct, description: e.target.value })}
                  placeholder="Ex: 4K UHD IPS, USB-C 65W, Ajuste de Altura, HDMI (deixe em branco se não houver)"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-sky-500 text-xs transition"
                />
              </div>

              {/* SKU / Part Number e NCM */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Código / SKU / Part Number / Modelo
                  </label>
                  <input
                    type="text"
                    value={catalogReviewProduct.sku || catalogReviewProduct.partNumber || ''}
                    onChange={(e) => setCatalogReviewProduct({ ...catalogReviewProduct, sku: e.target.value, partNumber: e.target.value })}
                    placeholder="Ex: DEL-27-4K ou S2722QC"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    NCM Fiscal (8 dígitos)
                  </label>
                  <input
                    type="text"
                    value={catalogReviewProduct.ncm || ''}
                    onChange={(e) => {
                      const newNcm = e.target.value;
                      const autoCategory = getCategoryFromNcm(newNcm);
                      setCatalogReviewProduct(prev => prev ? {
                        ...prev,
                        ncm: newNcm,
                        category: autoCategory !== 'Geral' ? autoCategory : prev.category
                      } : null);
                    }}
                    placeholder="Ex: 0901.21.00"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Preço de Custo e Unidade */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Preço de Custo (R$) *
                  </label>
                  <input
                    type="text"
                    required
                    value={catalogReviewCostInput}
                    onFocus={() => {
                      if ((catalogReviewProduct.costPrice || 0) <= 0) {
                        setCatalogReviewCostInput('');
                      }
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCatalogReviewCostInput(val);
                      const parsed = parsePtBrNumber(val);
                      setCatalogReviewProduct(prev => prev ? ({ ...prev, costPrice: parsed }) : null);
                    }}
                    onBlur={() => {
                      const parsed = parsePtBrNumber(catalogReviewCostInput);
                      setCatalogReviewProduct(prev => prev ? ({ ...prev, costPrice: parsed }) : null);
                      setCatalogReviewCostInput(formatCurrencyPtBr(parsed));
                    }}
                    placeholder="0,00"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Unidade
                  </label>
                  <input
                    type="text"
                    value={catalogReviewProduct.unit || 'Un.'}
                    onChange={(e) => setCatalogReviewProduct({ ...catalogReviewProduct, unit: e.target.value })}
                    placeholder="Un. / Pct / Cx"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 text-center focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Categoria e Fornecedor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Categoria
                  </label>
                  <input
                    type="text"
                    value={catalogReviewProduct.category || 'Geral'}
                    onChange={(e) => setCatalogReviewProduct({ ...catalogReviewProduct, category: e.target.value })}
                    placeholder="Ex: Suprimentos / Copa"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Fornecedor / Loja de Referência
                  </label>
                  <input
                    type="text"
                    value={catalogReviewProduct.supplier || ''}
                    onChange={(e) => setCatalogReviewProduct({ ...catalogReviewProduct, supplier: e.target.value })}
                    placeholder="Ex: Mercado Livre, Kalunga, Fabricante"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Link de Compra / Referência */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Link Direto de Compra ou Referência
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={catalogReviewProduct.sourceUrl || ''}
                    onChange={(e) => {
                      const newUrl = e.target.value;
                      const detectedStore = extractStoreNameFromUrl(newUrl);
                      setCatalogReviewProduct(prev => prev ? {
                        ...prev,
                        sourceUrl: newUrl,
                        supplier: detectedStore || prev.supplier
                      } : null);
                    }}
                    placeholder="https://..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-[11px] focus:outline-none focus:border-sky-500"
                  />
                  {catalogReviewProduct.sourceUrl && (
                    <a
                      href={catalogReviewProduct.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
                      title="Testar Link"
                    >
                      <ExternalLink className="w-4 h-4 text-sky-600" />
                    </a>
                  )}
                </div>
              </div>

              {/* Footer de Ações */}
              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsCatalogModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-semibold transition text-xs"
                >
                  Cancelar
                </button>

                <div className="flex items-center gap-2">
                  {/* Botão 1: Salvar apenas na proposta corrente */}
                  <button
                    type="button"
                    onClick={handleSaveToCurrentQuote}
                    className="px-4 py-2 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 hover:text-sky-800 rounded-xl font-bold shadow-2xs transition flex items-center gap-1.5 cursor-pointer text-xs"
                    title="Aplica a foto e descrição editadas exclusivamente no item desta cotação atual"
                  >
                    <FileText className="w-4 h-4 text-sky-600" />
                    <span>Salvar na Proposta</span>
                  </button>

                  {/* Botão 2: Salvar na base de produtos (e também na proposta) */}
                  <button
                    type="submit"
                    className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer text-xs"
                    title="Registra este produto definitivamente na base geral de Produtos Infodesk para futuros orçamentos"
                  >
                    <BookmarkPlus className="w-4 h-4 text-white" />
                    <span>Salvar em Produtos</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Zoom da Foto no Meio da Tela (Fiel à Referência Visual) */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div 
            className="relative bg-white rounded-3xl pt-6 pb-7 px-6 sm:px-8 shadow-2xl max-w-md sm:max-w-lg w-full flex flex-col items-center animate-scaleIn border border-slate-100/80"
          >
            {/* Botão X discreto no canto superior direito exatamente como na foto */}
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="absolute top-4 right-4 text-stone-500 hover:text-stone-800 transition p-1"
              title="Fechar (Esc)"
            >
              <X className="w-5 h-5 stroke-[2.2]" />
            </button>

            {/* Cabeçalho de Texto Fiel: Nome em negrito pesado escuro e subtítulo estilizado */}
            <div className="text-center px-4 pt-1 pb-5 w-full">
              <h2 className="text-base sm:text-lg font-black text-[#261f18] uppercase tracking-wide leading-tight font-sans">
                {zoomedImage.title}
              </h2>
              <p className="text-[11px] sm:text-xs font-bold text-[#5c3e1e] uppercase tracking-widest mt-1.5 font-sans">
                {zoomedImage.itemNumber ? `ITEM ${zoomedImage.itemNumber} • ESPECIFICAÇÃO TÉCNICA` : 'ESPECIFICAÇÃO TÉCNICA'}
              </p>
            </div>

            {/* Moldura Quadrada com Bordas Arredondadas e Borda Dourada Elegante */}
            <div className="relative w-72 h-72 sm:w-84 sm:h-84 md:w-96 md:h-96 rounded-2xl overflow-hidden border-[3px] border-[#e59b12] shadow-md bg-white flex items-center justify-center p-3 my-2">
              <img
                src={zoomedImage.url}
                alt={zoomedImage.title}
                className="max-w-full max-h-full object-contain rounded-xl select-none"
              />
            </div>

            {/* Botão Fechar Retangular Clássico com borda fina e cantos levemente arredondados */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                className="px-8 py-2 bg-white hover:bg-stone-50 text-[#3d2b1f] border border-[#cfc8be] rounded-md text-xs sm:text-[13px] font-semibold transition cursor-pointer active:scale-95 shadow-2xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Validação Pré-Envio / Checklist Antifalhas */}
      {validationModal.isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-scaleIn"
          >
            <div className="p-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${
                  validationModal.issues.some(i => i.type === 'error')
                    ? 'bg-rose-100 text-rose-600'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Checklist Antifalhas da Proposta</h3>
                  <p className="text-[11px] text-slate-500">
                    {validationModal.issues.some(i => i.type === 'error')
                      ? 'Corrija os pontos críticos abaixo antes de prosseguir'
                      : 'Revise os alertas recomendados antes de enviar ao cliente'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setValidationModal(prev => ({ ...prev, isOpen: false }))}
                className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-2.5">
              {validationModal.issues.map((issue, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-xl border flex items-start gap-3 text-xs leading-relaxed ${
                    issue.type === 'error'
                      ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                      : 'bg-amber-50/80 border-amber-200 text-amber-900'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    issue.type === 'error' ? 'bg-rose-500' : 'bg-amber-500'
                  }`} />
                  <span className="font-medium flex-1">{issue.message}</span>
                </div>
              ))}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setValidationModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Voltar e Ajustar
              </button>

              {/* Se tiver erro crítico impeditivo, bloqueia; se for só aviso, permite prosseguir */}
              {!validationModal.issues.some(i => i.type === 'error') ? (
                <button
                  type="button"
                  onClick={() => {
                    const act = validationModal.onConfirmAction;
                    setValidationModal(prev => ({ ...prev, isOpen: false }));
                    act();
                  }}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Prosseguir Assim Mesmo</span>
                </button>
              ) : (
                <span className="text-[11px] font-bold text-rose-600">
                  Ajuste os erros críticos acima para liberar o envio
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Interativo de Ajuste e Salvamento da Margem de Lucro (% Markup) */}
      {isMarkupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-scaleIn">
            <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-indigo-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-xs">
                  <Percent className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Margem de Lucro (% Markup)</h3>
                  <p className="text-xs text-slate-500">Defina o markup global e padrão da Infodesk</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMarkupModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/80 hover:bg-white text-slate-400 hover:text-slate-700 flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = parsePtBrNumber(modalMarkupInput);
                if (!isNaN(parsed) && parsed >= 0) {
                  handleApplyGlobalMarkup(parsed);
                  setIsMarkupModalOpen(false);
                }
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Porcentagem de Markup desejada para esta proposta:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    value={modalMarkupInput}
                    onChange={(e) => setModalMarkupInput(e.target.value)}
                    placeholder="Ex: 30 ou 23,5"
                    className="w-full bg-slate-50 focus:bg-white border-2 border-sky-300 focus:border-sky-500 rounded-2xl px-4 py-3 text-lg font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-sky-500/10 transition pr-10 font-mono"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none">
                    %
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  💡 Ao aplicar, recalcula todos os preços unitários e totais dos produtos, atualiza o Lucro Líquido Real e grava a nova margem no banco de dados e rascunho.
                </p>
              </div>

              {/* Botões de atalho rápido */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] font-bold text-slate-400">Atalhos:</span>
                {[20, 23.5, 25, 30, 35].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setModalMarkupInput(val.toString().replace('.', ','))}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-sky-50 hover:text-sky-700 border border-slate-200 hover:border-sky-300 rounded-lg text-xs font-bold text-slate-600 transition"
                  >
                    {val}%
                  </button>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsMarkupModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition flex items-center gap-2 active:scale-95"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar e Aplicar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Interativo de Ajuste e Salvamento da Alíquota de Impostos (% Tax) */}
      {isTaxModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-scaleIn">
            <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Alíquota de Impostos (%)</h3>
                  <p className="text-xs text-slate-500">Simples Nacional / ICMS embutido da Infodesk</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTaxModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/80 hover:bg-white text-slate-400 hover:text-slate-700 flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = parsePtBrNumber(modalTaxInput);
                if (!isNaN(parsed) && parsed >= 0) {
                  handleApplyGlobalTax(parsed);
                  setIsTaxModalOpen(false);
                }
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Porcentagem de imposto para esta proposta:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    value={modalTaxInput}
                    onChange={(e) => setModalTaxInput(e.target.value)}
                    placeholder="Ex: 9,1 ou 6"
                    className="w-full bg-slate-50 focus:bg-white border-2 border-indigo-300 focus:border-indigo-500 rounded-2xl px-4 py-3 text-lg font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition pr-10 font-mono"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none">
                    %
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  💡 Atualiza a alíquota em todos os produtos da cotação, recalcula os preços comerciais e o total de impostos.
                </p>
              </div>

              {/* Botões de atalho rápido */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] font-bold text-slate-400">Atalhos:</span>
                {[4, 6, 8.5, 9.1, 12].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setModalTaxInput(val.toString().replace('.', ','))}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-lg text-xs font-bold text-slate-600 transition"
                  >
                    {val}%
                  </button>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsTaxModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition flex items-center gap-2 active:scale-95"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar e Aplicar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hidden File Inputs for Image Uploading */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageFileChange}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={catalogFileInputRef}
        onChange={handleCatalogImageFileChange}
        accept="image/*"
        className="hidden"
      />

    </div>
  );
};
