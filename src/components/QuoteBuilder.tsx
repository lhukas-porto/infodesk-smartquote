import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Search,
  Sparkles,
  Save,
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
  LayoutList,
  PlusCircle,
  Mail,
  MoreVertical
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
  extractWarrantyType,
  calculateCommercialUnitPrice, 
  formatCompanyPrefix, 
  formatContactPerson, 
  isExactProductUrl, 
  generateQuoteCode, 
  formatProductSentenceCase,
  maskPhone,
  applyTextCase,
  getNextTextCase,
  getWordOrSelectionRange,
  mergeSelectedRanges,
  applyCaseToRanges,
  WordCaseStyle,
  extractStoreNameFromUrl,
  getCategoryFromNcm,
  buildDirectPurchaseUrl,
  buildCompleteProductDescription
} from '../utils/aiEmailParser';
import { 
  getClientCompanies, 
  saveClientCompanies, 
  registerOrUpdateClient,
  getRegisteredUnits, 
  saveRegisteredUnit, 
  getRegisteredCategories, 
  saveRegisteredCategory 
} from '../utils/storage';
import { CreatableCombobox } from './CreatableCombobox';
import { exportCostSheetToExcel } from '../utils/excelExport';
import { UniversalListImportModal } from './UniversalListImportModal';
import { WebImagePickerModal } from './WebImagePickerModal';
import { ProductEditModal } from './ProductEditModal';
import { validateNcm, formatNcm } from '../utils/ncmValidator';
import { compressImageDataUrl } from '../utils/imageCompressor';
import { PRICING_PROFILES, suggestMarkupForItem } from '../utils/pricingProfiles';
import { savePriceToCache } from '../services/priceCacheService';
import { recalculateQuoteTotals, calculateMarkupFromUnitPrice } from '../services/pricingEngine';
import { MultiSupplierMatrixModal } from './MultiSupplierMatrixModal';
import { auditProductOfferCompatibility } from '../utils/specAuditService';

interface QuoteBuilderProps {
  currentQuote: Quote;
  setCurrentQuote: React.Dispatch<React.SetStateAction<Quote>>;
  products: Product[];
  settings: CompanySettings;
  quotes?: Quote[];
  onPreview: () => void;
  onSave: () => void;
  onSendEmail: () => void;
  onOpenWebSearch: (query?: string, itemIdx?: number | null, existingItem?: Partial<QuoteItem>) => void;
  onSaveToCatalog?: (prod: Product) => void;
  clientCompanies?: ClientCompany[];
  onSaveCompanies?: (companies: ClientCompany[]) => void;
  onDeleteCompany?: (companyId: string) => void;
  onDeleteContact?: (contactId: string, companyId: string) => void;
  onUpdateSettings?: (newSettings: CompanySettings) => void;
  onNewQuote?: () => void;
}

export const QuoteBuilder: React.FC<QuoteBuilderProps> = ({
  currentQuote,
  setCurrentQuote,
  products,
  settings,
  quotes: propsQuotes,
  onPreview,
  onSave,
  onSendEmail,
  onOpenWebSearch,
  onSaveToCatalog,
  clientCompanies: propsClientCompanies,
  onSaveCompanies: propsOnSaveCompanies,
  onDeleteCompany: propsOnDeleteCompany,
  onDeleteContact: propsOnDeleteContact,
  onUpdateSettings,
  onNewQuote
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
  const [freightTotal, setFreightTotal] = useState<number>(() => {
    return currentQuote.freightTotal ?? 0;
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
  
  // Estado para Modal de Importação Universal (MEL-10) e Perfis de Margem (MEL-07)
  const [isUniversalImportOpen, setIsUniversalImportOpen] = useState(false);
  const [selectedPricingProfile, setSelectedPricingProfile] = useState<string>('corporativo_padrao');
  const [isSupplierMatrixOpen, setIsSupplierMatrixOpen] = useState(false);

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
  const [catalogReviewShippingInput, setCatalogReviewShippingInput] = useState<string>('');
  const [targetQuoteItemId, setTargetQuoteItemId] = useState<string | null>(null);

  // Seleção múltipla de itens para Ações em Lote e campo de Margem/Lucro % em Lote
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [batchMarkupInput, setBatchMarkupInput] = useState<string>('');

  // Modo de visualização da tabela (Compacto vs Completo com NCM/PartNumber/Links)
  const [isCompactTableMode, setIsCompactTableMode] = useState<boolean>(false);

  // Painel sanfona retrátil de Condições Gerais de Fornecimento
  const [isCommercialConditionsOpen, setIsCommercialConditionsOpen] = useState<boolean>(true);
  const [isOpeningTextOpen, setIsOpeningTextOpen] = useState<boolean>(false);

  // Estado do zoom da foto em tela cheia (lightbox)
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string; itemNumber?: number } | null>(null);

  // Menu de Formatação de Texto estilo Word (Maiúsculas, Minúsculas, 1ª da frase, 1ª de Cada Palavra)
  const [isQuoteCaseMenuOpen, setIsQuoteCaseMenuOpen] = useState(false);
  const [activeQuoteCaseStyle, setActiveQuoteCaseStyle] = useState<WordCaseStyle>('sentence');
  const quoteCaseMenuRef = useRef<HTMLDivElement>(null);

  // Menu de Mais Ações no celular (Salvar Excel, Novo Orçamento, etc)
  const [isMobileMoreActionsOpen, setIsMobileMoreActionsOpen] = useState(false);
  const mobileMoreActionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (mobileMoreActionsRef.current && !mobileMoreActionsRef.current.contains(e.target as Node)) {
        setIsMobileMoreActionsOpen(false);
      }
    };
    if (isMobileMoreActionsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileMoreActionsOpen]);

  // Menu dropdown de Mudar Caso dentro do modal Editar (Catálogo)
  const [isCatalogCaseMenuOpen, setIsCatalogCaseMenuOpen] = useState(false);
  const catalogCaseMenuRef = useRef<HTMLDivElement>(null);
  // Intervalos de palavras selecionadas com Ctrl (estilo Word) no modal Editar
  const [catalogSelectedRanges, setCatalogSelectedRanges] = useState<Array<{ start: number; end: number }>>([]);
  const catalogBackdropRef = useRef<HTMLDivElement>(null);

  // Referência para upload de arquivo e item ativo para imagem
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeImageUploadIndexRef = useRef<number | null>(null);
  const catalogFileInputRef = useRef<HTMLInputElement>(null);
  const catalogProductNameInputRef = useRef<HTMLInputElement>(null);
  const itemNameTextareaRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});

  // Unidades e Categorias cadastradas com auto-aprendizado dinâmico
  const [registeredUnits, setRegisteredUnits] = useState<string[]>(() => getRegisteredUnits());
  const [registeredCategories, setRegisteredCategories] = useState<string[]>(() => getRegisteredCategories());

  useEffect(() => {
    const handleMetadataChange = () => {
      setRegisteredUnits(getRegisteredUnits());
      setRegisteredCategories(getRegisteredCategories());
    };
    window.addEventListener('infodesk_metadata_changed', handleMetadataChange);
    return () => window.removeEventListener('infodesk_metadata_changed', handleMetadataChange);
  }, []);

  const availableUnits = React.useMemo(() => {
    return [...registeredUnits].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [registeredUnits]);

  const availableCategories = React.useMemo(() => {
    return [...registeredCategories].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [registeredCategories]);

  const clientCompanies = propsClientCompanies || localClientCompanies;

  const handleUpdateCompanies = (updated: ClientCompany[]) => {
    if (propsOnSaveCompanies) {
      propsOnSaveCompanies(updated);
    } else {
      saveClientCompanies(updated);
      setLocalClientCompanies(updated);
    }
  };

  // Refs para acompanhar alterações em settings e sincronizar com a cotação ativa
  const prevSettingsMarkupRef = useRef<number | undefined>(settings.defaultMarkupPercent);
  const prevSettingsTaxRef = useRef<number | undefined>(settings.defaultTaxPercent);
  const prevSettingsShippingRef = useRef<number | undefined>(settings.defaultShippingCost);

  React.useEffect(() => {
    // Se o usuário alterou alíquota, margem ou frete nas Configurações da Empresa, atualiza imediatamente a cotação
    const markupChanged = settings.defaultMarkupPercent !== undefined && settings.defaultMarkupPercent !== prevSettingsMarkupRef.current;
    const taxChanged = settings.defaultTaxPercent !== undefined && settings.defaultTaxPercent !== prevSettingsTaxRef.current;
    const shippingChanged = settings.defaultShippingCost !== undefined && settings.defaultShippingCost !== prevSettingsShippingRef.current;

    if (markupChanged || taxChanged || shippingChanged) {
      if (markupChanged) prevSettingsMarkupRef.current = settings.defaultMarkupPercent;
      if (taxChanged) prevSettingsTaxRef.current = settings.defaultTaxPercent;
      if (shippingChanged) prevSettingsShippingRef.current = settings.defaultShippingCost;

      const newMarkup = settings.defaultMarkupPercent ?? globalMarkup;
      const newTax = settings.defaultTaxPercent ?? globalTax;
      const newShipping = settings.defaultShippingCost ?? globalShipping;

      if (markupChanged) setGlobalMarkup(newMarkup);
      if (taxChanged) setGlobalTax(newTax);
      if (shippingChanged) setGlobalShipping(newShipping);

      setCurrentQuote(prev => {
        const updatedItems = prev.items.map(it => {
          const sCost = shippingChanged ? newShipping : (it.shippingCost ?? (prev.globalShipping ?? newShipping));
          const tRate = taxChanged ? newTax : (it.taxPercent ?? (prev.globalTaxPercent ?? newTax));
          const mPercent = markupChanged ? newMarkup : (it.markupPercent ?? (prev.globalMarkupPercent ?? newMarkup));
          const uPrice = calculateItemUnitPrice(it.costPrice, sCost, mPercent, tRate);
          return {
            ...it,
            shippingCost: sCost,
            taxPercent: tRate,
            markupPercent: mPercent,
            unitPrice: uPrice,
            totalPrice: Number((uPrice * it.quantity).toFixed(2))
          };
        });
        const totals = recalculateQuote(updatedItems);
        return {
          ...prev,
          globalMarkupPercent: markupChanged ? newMarkup : prev.globalMarkupPercent,
          globalTaxPercent: taxChanged ? newTax : prev.globalTaxPercent,
          globalShipping: shippingChanged ? newShipping : prev.globalShipping,
          items: updatedItems,
          ...totals
        };
      });
    } else {
      if (currentQuote.globalMarkupPercent !== undefined && currentQuote.globalMarkupPercent > 0) {
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

      if (currentQuote.freightTotal !== undefined) {
        setFreightTotal(currentQuote.freightTotal);
      }
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

  // Sincronização e auto-correção: garante que totalPrice e markupPercent de cada item correspondam exatamente à matemática real
  React.useEffect(() => {
    if (!currentQuote.items || currentQuote.items.length === 0) return;
    const hasMismatch = currentQuote.items.some(it => {
      const expectedTotal = Number(((it.unitPrice || 0) * (it.quantity || 1)).toFixed(2));
      const totalMismatch = it.totalPrice === undefined || Math.abs(it.totalPrice - expectedTotal) > 0.01;

      // Se tiver custo e preço unitário, verifica se a margem gravada está desatualizada
      if (it.costPrice > 0 && it.unitPrice > 0) {
        const sCost = it.shippingCost ?? globalShipping;
        const tRate = it.taxPercent ?? globalTax;
        const trueMarkup = calculateMarkupFromUnitPrice(it.unitPrice, it.costPrice, sCost, tRate);
        const marginMismatch = it.markupPercent === undefined || Math.abs(it.markupPercent - trueMarkup) > 0.1;
        if (marginMismatch) return true;
      }
      return totalMismatch;
    });

    if (hasMismatch) {
      const fixedItems = currentQuote.items.map(it => {
        const expectedTotal = Number(((it.unitPrice || 0) * (it.quantity || 1)).toFixed(2));
        let markup = it.markupPercent;
        if (it.costPrice > 0 && it.unitPrice > 0) {
          const sCost = it.shippingCost ?? globalShipping;
          const tRate = it.taxPercent ?? globalTax;
          markup = calculateMarkupFromUnitPrice(it.unitPrice, it.costPrice, sCost, tRate);
        }
        return {
          ...it,
          markupPercent: markup !== undefined ? markup : globalMarkup,
          totalPrice: expectedTotal
        };
      });
      const totals = recalculateQuote(fixedItems);
      setCurrentQuote(prev => ({
        ...prev,
        items: fixedItems,
        ...totals
      }));
    }
  }, [currentQuote.items, globalShipping, globalTax, globalMarkup]);

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

  // Auto-ajuste dinâmico da altura das caixas de texto de descrição
  const adjustItemTextareaHeight = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(32, el.scrollHeight)}px`;
  };

  React.useEffect(() => {
    currentQuote.items.forEach(item => {
      const el = itemNameTextareaRefs.current[item.id];
      if (el) {
        adjustItemTextareaHeight(el);
      }
    });
  }, [currentQuote.items]);

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

  // Modal de Busca e Escolha de Foto Comercial na Web
  const [webImagePickerItem, setWebImagePickerItem] = useState<{
    type: 'quote_item' | 'catalog_review';
    itemId?: string;
    itemIndex?: number;
    productName: string;
    currentImageUrl?: string;
  } | null>(null);

  const handlePhotoSelectedForQuote = (selectedUrl: string) => {
    if (!webImagePickerItem) return;

    if (webImagePickerItem.type === 'quote_item') {
      const targetId = webImagePickerItem.itemId;
      const targetIdx = webImagePickerItem.itemIndex;

      setCurrentQuote(prev => {
        const updatedItems = prev.items.map((item, idx) => {
          if ((targetId && item.id === targetId) || (!targetId && idx === targetIdx)) {
            return {
              ...item,
              imageUrl: selectedUrl,
              showImage: !!selectedUrl
            };
          }
          return item;
        });

        return {
          ...prev,
          items: updatedItems
        };
      });
    } else if (webImagePickerItem.type === 'catalog_review') {
      setCatalogReviewProduct(prev => prev ? { ...prev, imageUrl: selectedUrl } : null);
    }
    setWebImagePickerItem(null);
  };

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
    const sanitized = str.toString().trim().replace(/R\$\s?/gi, '').replace(/\./g, '').replace(',', '.');
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

  const recalculateQuote = (items: QuoteItem[], customFreight?: number) => {
    const fTotal = customFreight !== undefined ? customFreight : freightTotal;
    return recalculateQuoteTotals(items, {
      globalShipping,
      globalMarkup,
      globalTax,
      freightTotal: fTotal
    });
  };

  const handleFreightTotalChange = (val: string) => {
    const clean = val.replace(/[^\d.,]/g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    const newFreight = isNaN(parsed) || parsed < 0 ? 0 : Number(parsed.toFixed(2));
    setFreightTotal(newFreight);
    const totals = recalculateQuote(currentQuote.items, newFreight);
    setCurrentQuote(prev => ({
      ...prev,
      freightTotal: newFreight,
      ...totals
    }));
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

  const handleItemUpdate = (index: number, updates: Partial<QuoteItem>) => {
    setCurrentQuote(prev => {
      const updatedItems = [...prev.items];
      if (!updatedItems[index]) return prev;
      const item = { ...updatedItems[index], ...updates };

      if ('costPrice' in updates || 'markupPercent' in updates || 'shippingCost' in updates || 'taxPercent' in updates) {
        const cost = item.costPrice;
        const markup = item.markupPercent ?? globalMarkup;
        const shipping = item.shippingCost ?? globalShipping;
        const tax = item.taxPercent ?? globalTax;

        item.unitPrice = calculateItemUnitPrice(cost, shipping, markup, tax);
        item.totalPrice = Number((item.unitPrice * item.quantity).toFixed(2));
      } else if ('unitPrice' in updates) {
        const uPrice = Number(updates.unitPrice);
        item.unitPrice = uPrice;
        item.totalPrice = Number((uPrice * item.quantity).toFixed(2));
        const shipping = item.shippingCost ?? globalShipping;
        const tax = item.taxPercent ?? globalTax;
        item.markupPercent = calculateMarkupFromUnitPrice(uPrice, item.costPrice, shipping, tax);
      } else if ('quantity' in updates) {
        const qty = Number(updates.quantity) || 1;
        item.quantity = qty;
        item.totalPrice = Number((item.unitPrice * qty).toFixed(2));
      }

      if ('sourceUrl' in updates && updates.sourceUrl) {
        const detectedStore = extractStoreNameFromUrl(updates.sourceUrl);
        if (detectedStore) {
          item.supplier = detectedStore;
        }
      }

      updatedItems[index] = item;
      const totals = recalculateQuote(updatedItems);

      return {
        ...prev,
        items: updatedItems,
        ...totals
      };
    });
  };

  const handleItemChange = (index: number, field: keyof QuoteItem, value: any) => {
    handleItemUpdate(index, { [field]: value });
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
    reader.onload = async (event) => {
      const rawUrl = event.target?.result as string;
      if (rawUrl) {
        const compressed = await compressImageDataUrl(rawUrl);
        handleItemUpdate(targetIdx, { imageUrl: compressed, showImage: true });
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
              if (res) return await compressImageDataUrl(res);
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
            if (res) return await compressImageDataUrl(res);
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
            if (res) return await compressImageDataUrl(res);
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
            const rawUrl = await new Promise<string | null>((resolve) => {
              const reader = new FileReader();
              reader.onload = (event) => resolve(event.target?.result as string || null);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            });
            if (rawUrl) return await compressImageDataUrl(rawUrl);
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
      handleItemUpdate(index, { imageUrl: dataUrl, showImage: true });
    }
  };

  const handleDirectPasteToItem = async (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const dataUrl = await readImageFromSystemClipboard();
    if (dataUrl) {
      handleItemUpdate(index, { imageUrl: dataUrl, showImage: true });
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
    reader.onload = async (event) => {
      const rawUrl = event.target?.result as string;
      if (rawUrl && catalogReviewProduct) {
        const compressed = await compressImageDataUrl(rawUrl);
        setCatalogReviewProduct(prev => prev ? { ...prev, imageUrl: compressed } : null);
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
        handleItemUpdate(targetIdx, { imageUrl: dataUrl, showImage: true });
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
        handleItemUpdate(targetItemIdx, { imageUrl: dataUrl, showImage: true });
        activeImageUploadIndexRef.current = targetItemIdx;
      }
    };

    // Usar true para fase de captura, interceptando o paste antes de qualquer outro handler
    window.addEventListener('paste', handleGlobalPaste, true);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste, true);
    };
  }, [isCatalogModalOpen, currentQuote.items]);

  // Fechar menus de capitalização (da tabela e do modal de edição) ao clicar fora
  React.useEffect(() => {
    const handleClickOutsideCaseMenus = (e: MouseEvent) => {
      if (quoteCaseMenuRef.current && !quoteCaseMenuRef.current.contains(e.target as Node)) {
        setIsQuoteCaseMenuOpen(false);
      }
      if (catalogCaseMenuRef.current && !catalogCaseMenuRef.current.contains(e.target as Node)) {
        setIsCatalogCaseMenuOpen(false);
      }
    };
    if (isQuoteCaseMenuOpen || isCatalogCaseMenuOpen) {
      document.addEventListener('mousedown', handleClickOutsideCaseMenus);
    }
    return () => document.removeEventListener('mousedown', handleClickOutsideCaseMenus);
  }, [isQuoteCaseMenuOpen, isCatalogCaseMenuOpen]);

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
        if (isCatalogModalOpen) {
          setIsCatalogModalOpen(false);
        } else if (validationModal.isOpen) {
          setValidationModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCatalogModalOpen, validationModal.isOpen]);

  // Listener dedicado com prioridade máxima (capture: true) para fechar o Zoom no ESC sem fechar o modal/tela de baixo
  useEffect(() => {
    if (!zoomedImage) return;

    const handleZoomKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        setZoomedImage(null);
      }
    };

    window.addEventListener('keydown', handleZoomKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleZoomKeyDown, true);
    };
  }, [zoomedImage]);

  const handleExportExcel = async () => {
    try {
      await exportCostSheetToExcel(currentQuote);
    } catch (err) {
      console.error('Erro ao exportar planilha de custos para Excel:', err);
    }
  };

  const handleImportUniversalItems = (importedItems: Partial<QuoteItem>[]) => {
    const currentCount = currentQuote.items?.length || 0;
    const newItems: QuoteItem[] = importedItems.map((item, idx) => {
      const cost = item.costPrice || 0;
      const markup = item.markupPercent || globalMarkup || 25;
      const unitPrice = calculateItemUnitPrice(cost, globalShipping, markup, globalTax);
      const qty = item.quantity || 1;
      const totalPrice = Number((unitPrice * qty).toFixed(2));

      // Salvar no cache se tiver Part Number e custo informado
      if (item.partNumber && cost > 0) {
        savePriceToCache({
          partNumber: item.partNumber,
          name: item.name || '',
          supplier: item.supplier || 'Planilha Importada',
          costPrice: cost
        });
      }

      return {
        id: `item-${Date.now()}-${idx}`,
        itemNumber: currentCount + idx + 1,
        name: item.name || `Item ${currentCount + idx + 1}`,
        description: item.description || item.name || '',
        partNumber: item.partNumber || '',
        ncm: formatNcm(item.ncm) || '',
        quantity: qty,
        unit: item.unit || 'Un.',
        costPrice: cost,
        shippingCost: globalShipping,
        taxPercent: globalTax,
        markupPercent: markup,
        unitPrice,
        totalPrice,
        imageUrl: item.imageUrl || '',
        showImage: false,
        supplier: item.supplier || '',
        sourceUrl: item.sourceUrl || ''
      };
    });

    const updatedItems = [...(currentQuote.items || []), ...newItems];
    const totals = recalculateQuote(updatedItems);
    setCurrentQuote(prev => ({
      ...prev,
      items: updatedItems,
      ...totals
    }));
  };

  const handleApplyPricingProfile = (profileId: string) => {
    setSelectedPricingProfile(profileId);
    if (!currentQuote.items || currentQuote.items.length === 0) return;

    const updatedItems = currentQuote.items.map(item => {
      const suggested = suggestMarkupForItem(profileId, item.costPrice || 0, item.name, item.description);
      const unitPrice = calculateItemUnitPrice(item.costPrice, item.shippingCost ?? globalShipping, suggested, item.taxPercent ?? globalTax);
      const totalPrice = Number((unitPrice * item.quantity).toFixed(2));
      return {
        ...item,
        markupPercent: suggested,
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

  const handleApplyOptimizedBasket = (updatedItems: QuoteItem[]) => {
    const recalculated = updatedItems.map(item => {
      const uPrice = calculateItemUnitPrice(
        item.costPrice,
        item.shippingCost ?? globalShipping,
        item.markupPercent || globalMarkup,
        item.taxPercent ?? globalTax
      );
      return {
        ...item,
        unitPrice: uPrice,
        totalPrice: Number((uPrice * item.quantity).toFixed(2))
      };
    });
    const totals = recalculateQuote(recalculated);
    setCurrentQuote(prev => ({
      ...prev,
      items: recalculated,
      ...totals
    }));
    setIsSupplierMatrixOpen(false);
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
    const directInfo = buildDirectPurchaseUrl(freshItem.name, freshItem.sourceUrl);

    // Se a descrição estiver vazia no item da proposta, buscar do catálogo ou gerar das especificações
    const matchedCatalogProd = products.find(p => 
      (freshItem.productId && p.id === freshItem.productId) || 
      (freshItem.partNumber && p.partNumber && p.partNumber.trim().toLowerCase() === freshItem.partNumber.trim().toLowerCase()) || 
      (p.name && freshItem.name && p.name.trim().toLowerCase() === freshItem.name.trim().toLowerCase())
    );

    const fallbackSpecs = buildCompleteProductDescription({
      description: '',
      partNumber: freshItem.partNumber,
      ncm: freshItem.ncm,
      supplier: freshItem.supplier
    });

    const finalDescription = (freshItem.description && freshItem.description.trim()) || 
      (matchedCatalogProd?.description && matchedCatalogProd.description.trim()) || 
      fallbackSpecs;

    setTargetQuoteItemId(freshItem.id);
    setCatalogReviewProduct({
      id: freshItem.productId || `prod-${Date.now()}`,
      sku: generatedSku,
      partNumber: freshItem.partNumber || '',
      ncm: freshItem.ncm || '',
      name: freshItem.name,
      description: finalDescription,
      category: initialCategory,
      costPrice: freshItem.costPrice || 0,
      unit: freshItem.unit || 'Un.',
      supplier: freshItem.supplier || directInfo.store,
      stock: 10,
      lastUpdated: new Date().toISOString().split('T')[0],
      sourceUrl: directInfo.url,
      imageUrl: freshItem.imageUrl || ''
    });
    setCatalogReviewCostInput(formatCurrencyPtBr(freshItem.costPrice || 0));
    setCatalogReviewShippingInput(freshItem.shippingCost !== undefined && freshItem.shippingCost > 0 ? formatCurrencyPtBr(freshItem.shippingCost) : '0,00');
    setCatalogSelectedRanges([]);
    setIsCatalogModalOpen(true);
  };

  // Efetiva o salvamento unificado: salva no catálogo de produtos E na proposta corrente
  const handleSaveProductFromReviewModal = (finalProd: Product, shippingCost?: number) => {
    if (!finalProd || !finalProd.name) return;

    // Registra unidade e categoria para ficarem permanentemente disponíveis
    if (finalProd.unit) {
      saveRegisteredUnit(finalProd.unit);
      setRegisteredUnits(getRegisteredUnits());
    }
    if (finalProd.category) {
      saveRegisteredCategory(finalProd.category);
      setRegisteredCategories(getRegisteredCategories());
    }

    // 1. Salvar ou atualizar na base de produtos (catálogo geral e Supabase)
    if (onSaveToCatalog) {
      onSaveToCatalog(finalProd);
    }

    // 2. Salvar na proposta corrente (atualiza item com foto, valores, frete, descrição, etc.)
    if (targetQuoteItemId) {
      const itemIdx = currentQuote.items.findIndex(it => it.id === targetQuoteItemId);
      if (itemIdx >= 0) {
        const updatedItems = [...currentQuote.items];
        const currentItem = updatedItems[itemIdx];
        const newCost = Number(finalProd.costPrice) || currentItem.costPrice;
        const newShipping = shippingCost !== undefined && !isNaN(shippingCost) ? shippingCost : (currentItem.shippingCost ?? globalShipping);
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
          shippingCost: newShipping,
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

    setIsCatalogModalOpen(false);
    setCatalogReviewProduct(null);
    setTargetQuoteItemId(null);
  };

  const handleConfirmSaveCatalog = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (catalogReviewProduct) {
      handleSaveProductFromReviewModal(catalogReviewProduct as Product);
    }
  };

  // Mantido por compatibilidade: executa o mesmo salvamento unificado
  const handleSaveToCurrentQuote = (e?: React.FormEvent) => {
    handleConfirmSaveCatalog(e);
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

  // Alterna Maiúsculas/Minúsculas no item da tabela de cotação:
  // - Se o usuário selecionou 1 ou mais palavras no textarea, aplica APENAS na seleção!
  // - Se o cursor estiver posicionado em uma palavra, aplica nessa 1 palavra!
  // - Se não houver seleção nem palavra sob o cursor, aplica no nome completo do item.
  const handleCycleItemTextCase = (idx: number, itemId: string) => {
    const item = currentQuote.items[idx];
    if (!item) return;

    const textarea = itemNameTextareaRefs.current[itemId];
    const fullText = item.name || '';

    const { start, end } = getWordOrSelectionRange(
      fullText,
      textarea?.selectionStart ?? null,
      textarea?.selectionEnd ?? null
    );

    const targetPart = fullText.substring(start, end);
    if (!targetPart.trim()) return;

    const nextStyle = getNextTextCase(targetPart);
    const transformedPart = applyTextCase(targetPart, nextStyle);
    const newFullText = fullText.substring(0, start) + transformedPart + fullText.substring(end);

    handleItemChange(idx, 'name', newFullText);

    // Restaura a seleção do trecho e devolve o foco no textarea
    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(start, start + transformedPart.length);
      }
    }, 0);
  };

  // Alterna ou aplica Maiúsculas/Minúsculas no produto do modal Editar (Catálogo / Revisão):
  // - Suporta multi-seleção com Ctrl (estilo Word)
  // - Permite mudar de 1 palavra (sob cursor ou selecionada)
  // - Permite mudar várias palavras juntas (selecionadas ao mesmo tempo)
  // - Permite mudar o texto completo se nada estiver selecionado
  const handleApplyCatalogNameCase = (targetStyle?: WordCaseStyle) => {
    if (!catalogReviewProduct?.name) return;
    const input = catalogProductNameInputRef.current;
    const fullText = catalogReviewProduct.name;

    // 1. Se existem palavras selecionadas com Ctrl (estilo Word)
    if (catalogSelectedRanges.length > 0) {
      const firstRange = catalogSelectedRanges[0];
      const firstPart = fullText.substring(firstRange.start, firstRange.end);
      const styleToApply = targetStyle || getNextTextCase(firstPart);

      const { newText, newRanges } = applyCaseToRanges(fullText, catalogSelectedRanges, styleToApply);

      setCatalogReviewProduct(prev => prev ? {
        ...prev,
        name: newText
      } : null);

      setCatalogSelectedRanges(newRanges);
      setIsCatalogCaseMenuOpen(false);

      setTimeout(() => {
        if (input) {
          input.focus();
        }
      }, 0);
      return;
    }

    // 2. Se não há multi-seleção de Ctrl, segue a seleção única nativa ou palavra sob o cursor
    const { start, end } = getWordOrSelectionRange(
      fullText,
      input?.selectionStart ?? null,
      input?.selectionEnd ?? null
    );

    const targetPart = fullText.substring(start, end);
    if (!targetPart.trim()) return;

    const styleToApply = targetStyle || getNextTextCase(targetPart);
    const transformedPart = applyTextCase(targetPart, styleToApply);
    const newFullText = fullText.substring(0, start) + transformedPart + fullText.substring(end);

    setCatalogReviewProduct(prev => prev ? {
      ...prev,
      name: newFullText
    } : null);

    setIsCatalogCaseMenuOpen(false);

    // Mantém a seleção e o foco no trecho modificado para permitir cliques sucessivos
    setTimeout(() => {
      if (input) {
        input.focus();
        input.setSelectionRange(start, start + transformedPart.length);
      }
    }, 0);
  };

  // Gerenciador de cliques com Ctrl no input para selecionar múltiplas palavras separadas (estilo Word)
  const handleCatalogInputMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const fullText = input.value;

    if (e.ctrlKey) {
      if (end > start) {
        const newRange = { start, end };
        setCatalogSelectedRanges(prev => {
          const isExact = prev.some(r => r.start === start && r.end === end);
          if (isExact) {
            return prev.filter(r => !(r.start === start && r.end === end));
          }
          return mergeSelectedRanges([...prev, newRange]);
        });
      } else {
        const { start: wordStart, end: wordEnd } = getWordOrSelectionRange(fullText, start, end);
        if (wordEnd > wordStart) {
          setCatalogSelectedRanges(prev => {
            const exists = prev.some(r => Math.max(r.start, wordStart) < Math.min(r.end, wordEnd));
            if (exists) {
              return prev.filter(r => !(Math.max(r.start, wordStart) < Math.min(r.end, wordEnd)));
            }
            return mergeSelectedRanges([...prev, { start: wordStart, end: wordEnd }]);
          });
        }
      }
    } else {
      if (end > start) {
        if (catalogSelectedRanges.length > 0) {
          setCatalogSelectedRanges([]);
        }
      } else {
        if (catalogSelectedRanges.length > 0) {
          setCatalogSelectedRanges([]);
        }
      }
    }
  };

  const handleCatalogInputDoubleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const input = e.currentTarget;
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      const fullText = input.value;
      const { start: wordStart, end: wordEnd } = getWordOrSelectionRange(fullText, start, end);
      if (wordEnd > wordStart) {
        setCatalogSelectedRanges(prev => {
          const exists = prev.some(r => Math.max(r.start, wordStart) < Math.min(r.end, wordEnd));
          if (exists) {
            return prev.filter(r => !(Math.max(r.start, wordStart) < Math.min(r.end, wordEnd)));
          }
          return mergeSelectedRanges([...prev, { start: wordStart, end: wordEnd }]);
        });
      }
    }
  };

  const renderBackdropHighlights = (text: string, ranges: Array<{ start: number; end: number }>) => {
    if (!ranges || ranges.length === 0) return null;

    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    sorted.forEach((r, idx) => {
      if (r.start > lastIndex) {
        elements.push(
          <span key={`unsel-${idx}`} className="text-transparent">
            {text.substring(lastIndex, r.start)}
          </span>
        );
      }
      elements.push(
        <span
          key={`sel-${idx}`}
          className="bg-sky-200/90 text-transparent rounded-xs shadow-2xs border-b-2 border-sky-500 font-semibold"
        >
          {text.substring(r.start, r.end)}
        </span>
      );
      lastIndex = r.end;
    });

    if (lastIndex < text.length) {
      elements.push(
        <span key="unsel-last" className="text-transparent">
          {text.substring(lastIndex)}
        </span>
      );
    }

    return elements;
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
          <p className="text-[10px] text-indigo-600 font-medium pt-0.5">
            Simples / ICMS embutido
          </p>
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
          title="Clique para editar a Margem / Markup (%) de todos os itens"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider group-hover:text-emerald-700 transition">Lucro Real ({globalMarkup}%)</span>
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
          <p className="text-[10px] text-slate-600 font-semibold pt-0.5" title={`% Margem Líquida (sobre venda): ${currentQuote.averageMargin.toFixed(1)}% | % Markup (sobre custo): ${globalMarkup}%`}>
            % Margem Líq: <strong className={currentQuote.averageMargin < 12 && currentQuote.items.length > 0 ? 'text-amber-700 font-bold' : 'text-emerald-700'}>{currentQuote.averageMargin.toFixed(1)}% (venda)</strong>
          </p>
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
              {matchedCompany && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  ✓ Cadastrada
                </span>
              )}
            </div>
            <div ref={companySearchContainerRef} className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={currentQuote.clientCompany}
                  onChange={(e) => {
                    const val = e.target.value;
                    const newCode = generateQuoteCode(val, new Date(), propsQuotes);
                    setCurrentQuote(prev => {
                      const isSavedForAnother = (propsQuotes || []).some(q => 
                        q.id === prev.id && 
                        q.clientCompany && 
                        q.clientCompany.trim().toLowerCase() !== val.trim().toLowerCase()
                      );
                      return { 
                        ...prev, 
                        id: isSavedForAnother ? `quote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` : prev.id,
                        clientCompany: val,
                        code: val.trim().length >= 2 ? newCode : prev.code
                      };
                    });
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

                      const filtered = clientCompanies
                        .filter(c => {
                          if (!query) return false;
                          const nameMatch = (c.name || '').toLowerCase().includes(query);
                          const locMatch = (c.locations || []).some(l => l.toLowerCase().includes(query));
                          const contactMatch = (c.contacts || []).some(ct => ct.name.toLowerCase().includes(query) || (ct.email || '').toLowerCase().includes(query));
                          return nameMatch || locMatch || contactMatch;
                        })
                        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));

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
                                const formatted = formatCompanyPrefix(c.name, c.prefix);
                                const newCode = generateQuoteCode(c.name, new Date(), propsQuotes);
                                setCurrentQuote(prev => {
                                  const isSavedForAnother = (propsQuotes || []).some(q => 
                                    q.id === prev.id && 
                                    q.clientCompany && 
                                    q.clientCompany.trim().toLowerCase() !== formatted.trim().toLowerCase()
                                  );
                                  return {
                                    ...prev,
                                    id: isSavedForAnother ? `quote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` : prev.id,
                                    clientCompany: formatted,
                                    deliveryLocation: c.defaultDeliveryLocation || prev.deliveryLocation,
                                    shippingTerms: c.defaultDeliveryLocation ? `Frete incluso p/ ${c.defaultDeliveryLocation}.` : prev.shippingTerms,
                                    code: newCode
                                  };
                                });
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
                                    {c.defaultDeliveryLocation && <span>📍  {c.defaultDeliveryLocation}</span>}
                                    {c.contacts?.length > 0 && (
                                      <span>👥  {c.contacts.length} comprador(es)</span>
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

                      const filteredContacts = matchedCompany.contacts
                        .filter(contact => {
                          if (!query) return true;
                          const nameMatch = contact.name.toLowerCase().includes(query);
                          const emailMatch = (contact.email || '').toLowerCase().includes(query);
                          const phoneMatch = (contact.phone || '').toLowerCase().includes(query);
                          return nameMatch || emailMatch || phoneMatch;
                        })
                        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));

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
                                      {contact.phone && <span>📍  {contact.phone}</span>}
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

          {/* Assunto Personalizado da Proposta / E-mail */}
          <div className="md:col-span-3 pt-3 border-t border-slate-100">
            <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold text-slate-700">
                <Mail className="w-3.5 h-3.5 text-sky-600" />
                Assunto do E-mail da Proposta
              </span>
              <span className="text-[11px] text-slate-400 font-normal">
                Personalize como o assunto aparecerá para o cliente no envio do e-mail
              </span>
            </label>
            <input
              type="text"
              value={currentQuote.subject || ''}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, subject: e.target.value }))}
              placeholder={`Ex: Proposta Comercial ${currentQuote.code || ''} — Infodesk — Fornecimento de Produtos`}
              className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 hover:border-sky-400 focus:border-sky-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition"
            />
          </div>
        </div>
      </div>

      {/* Items & Prices Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        {/* Barra superior estilo ERP / Sistema Comercial: Selecione ou crie um novo item */}
        <div className="p-3 sm:p-4 bg-slate-50/70 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-2">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
              <span>Produtos/Serviços</span>
              <span className="text-red-500 font-bold">*</span>
              <span className="text-slate-400 font-normal hidden sm:inline">|</span>
              <span className="text-slate-600 font-semibold hidden sm:flex items-center gap-1">
                Selecione ou crie um novo item
                <span title="Selecione um produto da sua base de Produtos Infodesk para inserir com foto e custos já preenchidos, ou crie uma nova linha em branco para preenchimento manual.">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-sky-600 cursor-help transition" />
                </span>
              </span>
            </label>
            <div className="flex items-center gap-1.5 sm:gap-2.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
              {/* Botão de Importação Universal */}
              <button
                type="button"
                onClick={() => setIsUniversalImportOpen(true)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 shadow-2xs cursor-pointer active:scale-95 shrink-0 whitespace-nowrap"
                title="Importar produtos em lote a partir de planilha Excel (.xlsx), CSV ou copiar e colar células (Ctrl+V)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">Importar Planilha / Excel</span>
                <span className="sm:hidden">Importar</span>
              </button>

              {/* Botão de Matriz Multi-Fornecedor & Split */}
              {currentQuote.items && currentQuote.items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsSupplierMatrixOpen(true)}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200/90 shadow-2xs cursor-pointer active:scale-95 shrink-0 whitespace-nowrap"
                  title="Abrir matriz comparativa de fornecedores e simular cesta mais barata"
                >
                  <Layers className="w-3.5 h-3.5 text-sky-600" />
                  <span className="hidden sm:inline">Matriz Fornecedores & Split</span>
                  <span className="sm:hidden">Matriz</span>
                </button>
              )}

              {/* Botão de Alternância de Visualização Compacta / Detalhada */}
              {currentQuote.items && currentQuote.items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsCompactTableMode(prev => !prev)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1.5 border shadow-2xs cursor-pointer shrink-0 whitespace-nowrap ${
                    isCompactTableMode
                      ? 'bg-sky-50 text-sky-700 border-sky-300 ring-1 ring-sky-200'
                      : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                  title="Alternar entre modo compacto (linhas menores e mais limpas) e detalhado (com utilitários de fotos e links expandidos)"
                >
                  <LayoutList className="w-3.5 h-3.5 text-sky-600" />
                  <span className="hidden sm:inline">{isCompactTableMode ? 'Visualização Detalhada' : 'Visualização Compacta'}</span>
                  <span className="sm:hidden">{isCompactTableMode ? 'Detalhada' : 'Compacta'}</span>
                </button>
              )}

              {currentQuote.items && currentQuote.items.length > 0 && (
                <span className="text-[11px] text-slate-500 font-medium hidden md:inline shrink-0 whitespace-nowrap">
                  {currentQuote.items.length} {currentQuote.items.length === 1 ? 'item' : 'itens'}
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
                  placeholder="Digite o nome, código ou marca para buscar nos produtos cadastrados..."
                  className="w-full bg-white border border-slate-300 hover:border-sky-400 rounded-xl pl-9 pr-9 py-2.5 text-xs text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs transition"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <Search className="w-4 h-4 text-slate-400" />
                </div>

                {productSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setProductSearchQuery('');
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition"
                    title="Limpar busca"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
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
                      const filtered = products
                        .filter(p => {
                          if (!query) return false; // Não abre todos os itens se não digitou nada!
                          const nameMatch = (p.name || '').toLowerCase().includes(query);
                          const skuMatch = (p.sku || '').toLowerCase().includes(query);
                          const partMatch = (p.partNumber || '').toLowerCase().includes(query);
                          const catMatch = (p.category || '').toLowerCase().includes(query);
                          return nameMatch || skuMatch || partMatch || catMatch;
                        })
                        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));

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

            <button
              type="button"
              onClick={() => {
                handleAddFromCatalog('__NEW_CUSTOM_ITEM__');
                setProductSearchQuery('');
                setIsProductSearchOpen(false);
              }}
              className="h-10 px-3.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer active:scale-95 whitespace-nowrap"
              title="Adicionar uma nova linha de produto em branco para preenchimento manual"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Item</span>
            </button>
          </div>

          {/* Barra de Operações Rápidas em Lote (Bulk Actions) */}
          {currentQuote.items && currentQuote.items.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 max-w-full">
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
                  title="Ativa ou desativa a exibição das fotos na proposta para todos os itens simultaneamente"
                >
                  {currentQuote.items.every(i => i.showImage) ? 'Ocultar Fotos' : 'Exibir Fotos (Todos)'}
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
                <th className="py-2 px-1.5 w-12 min-w-[44px] text-center">
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
                <th className="py-2 px-2 min-w-[180px]">Descrição Detalhada do Produto</th>
                <th className="py-2 px-1 w-12 min-w-[48px] text-center">Qtd.</th>
                <th className="py-2 px-1 w-12 min-w-[48px] text-center">Un.</th>
                <th className="py-2 px-1 w-20 min-w-[74px] text-center">Custo (R$)</th>
                <th className="py-2 px-1 w-20 min-w-[74px] text-center">Frete (R$)</th>
                <th className="py-2 px-1 w-16 min-w-[62px] text-center">
                  <span title="Margem de Lucro (%) individual deste item sobre o custo">
                    Margem %
                  </span>
                </th>
                <th className="py-2 px-1 w-24 min-w-[78px] text-center">Preço Unit. (R$)</th>
                <th className="py-2 px-1 w-24 min-w-[84px] text-center">Preço Total (R$)</th>
                <th className="py-2 px-1 w-14 min-w-[56px] text-center">Ações</th>
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

                    <td className="py-2 px-1 w-12 min-w-[44px] text-center font-bold text-slate-500 pt-3.5">
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

                    <td className="py-2 px-2 min-w-[180px]">
                      <div className="flex flex-col gap-1.5">
                        {/* Linha principal: Foto + Descrição */}
                        <div className="flex items-start gap-2">
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
                            className={`w-10 h-10 min-w-[40px] max-w-[40px] min-h-[40px] max-h-[40px] rounded-lg border flex items-center justify-center shrink-0 overflow-hidden cursor-pointer transition relative group/img select-none focus:outline-none focus:ring-2 focus:ring-sky-400 ${
                              item.imageUrl 
                                ? 'border-slate-200 bg-white p-0.5 shadow-2xs hover:border-sky-500 hover:shadow-md' 
                                : 'border-dashed border-sky-300 bg-sky-50/60 hover:bg-sky-100/80 hover:border-sky-500 text-sky-600'
                            }`}
                          >
                            {item.imageUrl ? (
                              <>
                                <img
                                  key={item.imageUrl}
                                  src={item.imageUrl}
                                  alt={item.name}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full max-w-full max-h-full object-contain group-hover/img:scale-105 transition duration-200"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                                <div className="absolute inset-0 bg-sky-950/50 opacity-0 group-hover/img:opacity-100 transition flex flex-col items-center justify-center text-white backdrop-blur-[0.5px]">
                                  <ZoomIn className="w-3.5 h-3.5 text-white drop-shadow-sm" />
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-col items-center justify-center text-center p-0.5">
                                <ImagePlus className="w-3.5 h-3.5 text-sky-500 group-hover/img:scale-110 transition" />
                              </div>
                            )}
                          </div>

                          {/* Campo de Descrição */}
                          <div className="flex-1 min-w-0">
                            <textarea
                              ref={(el) => {
                                itemNameTextareaRefs.current[item.id] = el;
                                if (el) adjustItemTextareaHeight(el);
                              }}
                              rows={1}
                              value={item.name}
                              onFocus={() => { activeImageUploadIndexRef.current = idx; }}
                              onChange={(e) => {
                                handleItemChange(idx, 'name', e.target.value);
                                adjustItemTextareaHeight(e.target);
                              }}
                              onPaste={(e) => {
                                handlePasteImageToItem(e, idx);
                                setTimeout(() => {
                                  const el = itemNameTextareaRefs.current[item.id];
                                  if (el) adjustItemTextareaHeight(el);
                                }, 0);
                              }}
                              placeholder="Descrição padronizada do produto"
                              className="w-full min-h-[32px] bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white resize-none leading-snug overflow-hidden"
                            />
                          </div>
                        </div>

                        {/* Barra de utilidades (recolhida no modo compacto) */}
                        {!isCompactTableMode && (
                          <div className="flex flex-wrap items-center gap-1.5 pl-0.5 text-[10px] pt-0.5">
                            <label className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 cursor-pointer select-none shrink-0">
                              <input
                                type="checkbox"
                                checked={!!item.showImage}
                                onChange={(e) => handleItemChange(idx, 'showImage', e.target.checked)}
                                className="rounded text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                              />
                              <span className="font-medium text-[10px] whitespace-nowrap">Foto na proposta</span>
                            </label>

                            <button
                              type="button"
                              onClick={() => setWebImagePickerItem({
                                type: 'quote_item',
                                itemId: item.id,
                                itemIndex: idx,
                                productName: item.name,
                                currentImageUrl: item.imageUrl
                              })}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-1.5 py-0.5 rounded-md transition cursor-pointer whitespace-nowrap shrink-0"
                              title="Pesquisar e escolher foto comercial deste item na web"
                            >
                              <Search className="w-2.5 h-2.5" />
                              <span>{item.imageUrl ? 'Trocar Foto' : 'Buscar Foto'}</span>
                            </button>

                            {item.sourceUrl ? (
                              <a
                                href={item.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md font-bold transition text-[10px] whitespace-nowrap shrink-0"
                                title={`Abrir link do produto em ${item.supplier || 'loja'}`}
                              >
                                <ExternalLink className="w-3 h-3 text-emerald-600" />
                                <span>Link do Produto</span>
                              </a>
                            ) : (
                              <a
                                href={`https://www.google.com/search?q=${encodeURIComponent(item.rawSearchQuery || item.name)}&tbm=shop`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 hover:underline text-[10px] whitespace-nowrap shrink-0"
                                title="Buscar produto no Google Shopping"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Link do Produto</span>
                              </a>
                            )}

                            {onSaveToCatalog && (
                              <button
                                type="button"
                                onClick={() => handleOpenCatalogReviewModal(item)}
                                title="Cadastrar ou revisar foto, NCM, SKU e ficha técnica no Catálogo Geral"
                                className={`text-[10px] font-semibold inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border transition cursor-pointer whitespace-nowrap shrink-0 ${savedCatalogIds[item.id]
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-50 hover:bg-sky-50 hover:text-sky-700 hover:border-sky-200 text-slate-600 border-slate-200'
                                  }`}
                              >
                                {savedCatalogIds[item.id] ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span>Salvo no Catálogo</span>
                                  </>
                                ) : (
                                  <>
                                    <Package className="w-3 h-3 text-slate-500" />
                                    <span>Catálogo / NCM</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Qtd */}
                    <td className="py-2 px-1 w-12 min-w-[48px] text-center">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                        className="w-full h-8 min-w-[42px] bg-slate-50 border border-slate-300 rounded-lg px-1 text-xs text-center font-bold text-slate-900 focus:outline-none focus:border-sky-500 font-mono leading-none"
                      />
                    </td>

                    {/* Unidade */}
                    <td className="py-2 px-1 w-12 min-w-[48px] text-center">
                      <input
                        type="text"
                        list="quote-registered-units"
                        value={item.unit || 'Un.'}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleItemChange(idx, 'unit', val);
                          if (val.trim()) {
                            saveRegisteredUnit(val.trim());
                            setRegisteredUnits(getRegisteredUnits());
                          }
                        }}
                        onBlur={(e) => {
                          if (!e.target.value.trim()) {
                            handleItemChange(idx, 'unit', 'Un.');
                          }
                        }}
                        placeholder="Un."
                        className="w-full h-8 min-w-[44px] bg-slate-50 border border-slate-300 rounded-lg px-1 text-xs text-center text-slate-700 focus:outline-none focus:border-sky-500 font-medium leading-none"
                      />
                    </td>

                    {/* Custo Unitário */}
                    <td className="py-2 px-1 w-20 min-w-[74px] text-center">
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
                              delete copy[`${idx}-unitPrice`];
                              return copy;
                            });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        placeholder="0,00"
                        className="w-full h-8 min-w-[68px] bg-slate-50 border border-slate-300 rounded-lg px-1 text-xs text-center font-mono text-slate-700 focus:outline-none focus:border-sky-500 focus:bg-white leading-none"
                      />
                    </td>

                    {/* Frete Unitário por Item */}
                    <td className="py-2 px-1 w-20 min-w-[74px] text-center">
                      <input
                        type="text"
                        value={
                          editingInputs[`${idx}-shippingCost`] !== undefined
                            ? editingInputs[`${idx}-shippingCost`]
                            : (item.shippingCost !== undefined && item.shippingCost > 0 ? formatCurrencyPtBr(item.shippingCost) : '0,00')
                        }
                        onFocus={() => {
                          const shipVal = item.shippingCost ?? 0;
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
                              delete copy[`${idx}-unitPrice`];
                              return copy;
                            });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        placeholder="0,00"
                        title="Frete unitário deste item (R$)"
                        className="w-full h-8 min-w-[68px] bg-slate-50 border border-slate-300 rounded-lg px-1 text-xs text-center font-mono text-amber-700 font-semibold focus:outline-none focus:border-amber-500 focus:bg-white leading-none"
                      />
                    </td>

                    {/* Margem Lucro */}
                    <td className="py-2 px-1 w-16 min-w-[62px] text-center">
                      <input
                        type="text"
                        value={
                          editingInputs[`${idx}-markupPercent`] !== undefined
                            ? editingInputs[`${idx}-markupPercent`]
                            : formatPercentPtBr(
                                item.markupPercent !== undefined
                                  ? item.markupPercent
                                  : (item.unitPrice && item.costPrice
                                      ? calculateMarkupFromUnitPrice(item.unitPrice, item.costPrice, item.shippingCost ?? globalShipping, item.taxPercent ?? globalTax)
                                      : globalMarkup)
                              )
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
                              delete copy[`${idx}-unitPrice`];
                              return copy;
                            });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        placeholder="0,0"
                        title="Margem de lucro % sobre o custo"
                        className="w-full h-8 min-w-[56px] bg-slate-50 border border-slate-300 rounded-lg px-1 text-xs text-center font-bold text-sky-700 focus:outline-none focus:border-sky-500 focus:bg-white leading-none"
                      />
                    </td>

                    {/* Preço Unitário */}
                    <td className="py-2 px-1 w-24 min-w-[78px] text-center">
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
                              delete copy[`${idx}-markupPercent`];
                              return copy;
                            });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (idx === currentQuote.items.length - 1) {
                              e.preventDefault();
                              handleAddItem();
                            } else {
                              (e.target as HTMLInputElement).blur();
                            }
                          }
                        }}
                        placeholder="0,00"
                        className="w-full h-8 min-w-[72px] bg-slate-50 border border-slate-300 rounded-lg px-1 text-xs text-center font-bold text-slate-900 font-mono focus:outline-none focus:border-sky-500 focus:bg-white leading-none"
                      />
                    </td>

                    {/* Preço Total do Item */}
                    <td className="py-2 px-1 w-24 min-w-[84px] text-center font-bold text-emerald-700 font-mono text-xs whitespace-nowrap pt-4">
                      R$ {formatCurrencyPtBr(Number(((item.unitPrice || 0) * (item.quantity || 1)).toFixed(2)))}
                    </td>

                    <td className="py-2 px-1 w-14 min-w-[56px] text-center pt-3">
                      <div className="flex items-center justify-center gap-0.5">
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
                          className="text-slate-400 hover:text-sky-600 p-1 rounded-md hover:bg-sky-50 transition inline-flex items-center justify-center"
                          title="Duplicar este item (clone)"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-slate-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition inline-flex items-center justify-center"
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
            {currentQuote.items.length > 0 && (() => {
              const itemsSubtotal = currentQuote.items.reduce((acc, it) => acc + (it.totalPrice || 0), 0);
              return (
                <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-xs">
                  {/* Subtotal dos Produtos */}
                  <tr className="border-b border-slate-100">
                    <td colSpan={7} className="py-2.5 px-3 text-right text-slate-500 uppercase tracking-wider text-[11px] font-semibold">
                      Subtotal dos Produtos:
                    </td>
                    <td colSpan={2} className="py-2.5 px-3 text-right text-slate-700 text-xs font-mono font-bold">
                      R$ {itemsSubtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>

                  {/* Campo de Frete Geral da Proposta (solicitado por Lucas) */}
                  <tr className="bg-amber-50/35 border-b border-slate-200">
                    <td colSpan={7} className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-2 text-slate-700">
                        <Truck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="text-[11.5px] font-bold">Frete Geral da Proposta:</span>
                        <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">(opcional para frete global da entrega)</span>
                      </div>
                    </td>
                    <td colSpan={2} className="py-2 px-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <span className="text-xs text-slate-500 font-mono font-semibold">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={freightTotal === 0 ? '' : freightTotal.toString().replace('.', ',')}
                          placeholder="0,00"
                          onChange={(e) => handleFreightTotalChange(e.target.value)}
                          className="w-24 h-7 px-2 text-right bg-white border border-slate-300 hover:border-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-200 rounded-lg text-xs font-mono font-bold text-slate-900 shadow-2xs transition"
                          title="Informe o valor de frete geral da entrega para ser somado ao total da proposta"
                        />
                      </div>
                    </td>
                    <td className="py-2 px-1 text-center">
                      {freightTotal > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleFreightTotalChange('0')}
                          className="text-[10px] text-slate-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition inline-flex items-center justify-center"
                          title="Zerar frete geral (Frete incluso / R$ 0,00)"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-[9.5px] text-emerald-700 font-semibold uppercase px-1.5 py-0.5 bg-emerald-50 border border-emerald-200/60 rounded" title="Frete incluso / R$ 0,00">
                          Incluso
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Total Geral da Proposta */}
                  <tr className="bg-slate-100/70">
                    <td colSpan={7} className="p-3 text-right text-slate-900 uppercase tracking-wider text-[11px] font-extrabold">
                      Total Geral da Proposta:
                    </td>
                    <td colSpan={2} className="p-3 text-right text-emerald-700 text-sm md:text-base font-mono font-extrabold">
                      R$ {currentQuote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
          <datalist id="quote-registered-units">
            {availableUnits.map(u => (
              <option key={u} value={u} />
            ))}
          </datalist>
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
                🛡️ {extractWarrantyMonthsNumber(currentQuote.warrantyTerms)}m ({extractWarrantyType(currentQuote.warrantyTerms) === 'autorizada' ? 'Autorizada' : 'Balcão'})
              </span>
              {currentQuote.showShippingInProposal === false ? (
                <span className="bg-amber-50 text-amber-700 border border-amber-200/80 px-2 py-0.5 rounded-md font-semibold">
                  📦 Frete oculto
                </span>
              ) : null}
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
            <div className="h-7 flex items-center justify-between">
              <label className="block text-slate-600 font-medium">Validade da Proposta</label>
              <span className="text-[11px] font-bold text-sky-700 font-mono">
                {extractValidityDaysNumber(currentQuote.validityDays)} dias
              </span>
            </div>
            <div className="h-7 flex items-center gap-1.5 flex-wrap">
              {[2, 3, 5, 7, 10, 15, 30].map(days => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setCurrentQuote(prev => ({
                    ...prev,
                    validityDays: formatValidityDaysText(days)
                  }))}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${extractValidityDaysNumber(currentQuote.validityDays) === days
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                >
                  {days}d
                </button>
              ))}
            </div>
            <input
              type="text"
              value={currentQuote.validityDays}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, validityDays: e.target.value }))}
              placeholder="05 (cinco) dias ou enquanto durar o estoque."
              className="w-full h-9 bg-slate-50 border border-slate-300 rounded-xl px-3 text-slate-800 focus:outline-none focus:border-sky-500 text-[11px] font-medium"
            />
          </div>

          {/* Condições de Pagamento */}
          <div className="space-y-1.5">
            <div className="h-7 flex items-center justify-between">
              <label className="block text-slate-600 font-medium">Condições de Pagamento</label>
              <span className="text-[11px] font-bold text-sky-700 font-mono">
                {currentQuote.paymentTerms?.toLowerCase().includes('faturado')
                  ? 'Faturado'
                  : currentQuote.paymentTerms?.toLowerCase().includes('vista')
                    ? 'À vista'
                    : `${extractPaymentDaysNumber(currentQuote.paymentTerms)} dias`}
              </span>
            </div>
            <div className="h-7 flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setCurrentQuote(prev => ({
                  ...prev,
                  paymentTerms: 'Faturado.'
                }))}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${currentQuote.paymentTerms?.toLowerCase().includes('faturado')
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
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${currentQuote.paymentTerms?.toLowerCase().includes('vista')
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
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${!currentQuote.paymentTerms?.toLowerCase().includes('vista') && !currentQuote.paymentTerms?.toLowerCase().includes('faturado') && extractPaymentDaysNumber(currentQuote.paymentTerms) === days
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                >
                  {days}d
                </button>
              ))}
            </div>
            <input
              type="text"
              value={currentQuote.paymentTerms}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, paymentTerms: e.target.value }))}
              placeholder="Faturado."
              className="w-full h-9 bg-slate-50 border border-slate-300 rounded-xl px-3 text-slate-800 focus:outline-none focus:border-sky-500 text-[11px] font-medium"
            />
          </div>

          {/* Prazo de Entrega */}
          <div className="space-y-1.5">
            <div className="h-7 flex items-center justify-between">
              <label className="block text-slate-600 font-medium">Prazo de Entrega (Dias Úteis)</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeliveryException(prev => !prev)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition flex items-center gap-1 cursor-pointer ${
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
            <div className="h-7 flex items-center gap-1.5 flex-wrap">
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
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${extractDeliveryDaysNumber(currentQuote.deliveryDays) === days
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                >
                  {days}d
                </button>
              ))}
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
                          className={`text-[10.5px] px-2.5 py-1 rounded-lg border font-medium transition flex items-center gap-1.5 cursor-pointer ${
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
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
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
              className="w-full h-9 bg-slate-50 border border-slate-300 rounded-xl px-3 text-slate-800 focus:outline-none focus:border-sky-500 text-[11px] font-medium"
            />
          </div>

          {/* Termos de Garantia */}
          <div className="space-y-1.5">
            <div className="h-7 flex items-center justify-between">
              <label className="block text-slate-600 font-medium">Termos de Garantia</label>
              <span className="text-[11px] font-bold text-sky-700 font-mono">
                {extractWarrantyMonthsNumber(currentQuote.warrantyTerms)} meses • {extractWarrantyType(currentQuote.warrantyTerms) === 'autorizada' ? 'Rede Autorizada' : 'Balcão'}
              </span>
            </div>

            {/* Modalidade e Meses na mesma linha para alinhamento perfeito */}
            <div className="h-7 flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  const months = extractWarrantyMonthsNumber(currentQuote.warrantyTerms);
                  setCurrentQuote(prev => ({
                    ...prev,
                    warrantyTerms: formatWarrantyMonthsText(months, 'balcao')
                  }));
                }}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  extractWarrantyType(currentQuote.warrantyTerms) === 'balcao'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                Balcão
              </button>
              <button
                type="button"
                onClick={() => {
                  const months = extractWarrantyMonthsNumber(currentQuote.warrantyTerms);
                  setCurrentQuote(prev => ({
                    ...prev,
                    warrantyTerms: formatWarrantyMonthsText(months, 'autorizada')
                  }));
                }}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  extractWarrantyType(currentQuote.warrantyTerms) === 'autorizada'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                Autorizada
              </button>
              <div className="h-3.5 w-px bg-slate-200 mx-0.5"></div>
              {[1, 3, 6, 12, 24, 36].map(months => {
                const isSelected = extractWarrantyMonthsNumber(currentQuote.warrantyTerms) === months;
                return (
                  <button
                    key={months}
                    type="button"
                    onClick={() => {
                      const type = extractWarrantyType(currentQuote.warrantyTerms);
                      setCurrentQuote(prev => ({
                        ...prev,
                        warrantyTerms: formatWarrantyMonthsText(months, type)
                      }));
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                      isSelected
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    {months}m
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={currentQuote.warrantyTerms}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, warrantyTerms: e.target.value }))}
              placeholder="06 (seis) meses balcão para defeitos de fabricação."
              className="w-full h-9 bg-slate-50 border border-slate-300 rounded-xl px-3 text-slate-800 focus:outline-none focus:border-sky-500 text-[11px] font-medium"
            />
          </div>

          {/* Cláusula de Frete */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-600 font-medium flex items-center gap-1 text-xs">
                <Truck className="w-3.5 h-3.5 text-sky-600" />
                <span>Cláusula de Frete na Proposta</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] font-semibold text-slate-600 hover:text-slate-900">
                <input
                  type="checkbox"
                  checked={currentQuote.showShippingInProposal !== false}
                  onChange={(e) => setCurrentQuote(prev => ({
                    ...prev,
                    showShippingInProposal: e.target.checked
                  }))}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 h-3.5 w-3.5 cursor-pointer"
                />
                <span>Exibir na proposta</span>
              </label>
            </div>
            <input
              type="text"
              disabled={currentQuote.showShippingInProposal === false}
              value={currentQuote.shippingTerms || `Frete incluso p/ ${currentQuote.deliveryLocation || 'Brasília'}.`}
              onChange={(e) => setCurrentQuote(prev => ({ ...prev, shippingTerms: e.target.value }))}
              placeholder="Ex: Frete incluso p/ São Paulo."
              className={`w-full border rounded-xl px-3 py-2 font-medium text-xs transition ${
                currentQuote.showShippingInProposal === false
                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-50 border border-slate-300 text-slate-800 focus:outline-none focus:border-sky-500'
              }`}
            />
          </div>

          {/* Observações da Proposta (ao lado do frete) */}
          <div>
            <label className="block text-slate-600 font-medium mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-sky-600" />
              <span>Observações na Proposta</span>
            </label>
            <input
              type="text"
              value={currentQuote.observations || currentQuote.notes || ''}
              onChange={(e) => {
                const val = e.target.value;
                setCurrentQuote(prev => ({
                  ...prev,
                  observations: val,
                  notes: val
                }));
              }}
              placeholder="Ex: Faturamento direto da fábrica / Impostos inclusos."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-sky-500 font-medium text-xs"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100">
          {!isOpeningTextOpen ? (
            <button
              type="button"
              onClick={() => setIsOpeningTextOpen(true)}
              className="text-xs font-semibold text-slate-500 hover:text-sky-600 flex items-center gap-1.5 transition cursor-pointer"
            >
              <span>✎ Personalizar texto de abertura da proposta</span>
              <span className="text-[10.5px] text-slate-400 font-normal truncate max-w-md hidden sm:inline">
                ({currentQuote.openingText ? `${currentQuote.openingText.slice(0, 55)}...` : 'Padrão formal ativo'})
              </span>
            </button>
          ) : (
            <div className="space-y-1.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <label className="block text-slate-600 font-medium text-xs">Parágrafo de Abertura da Proposta</label>
                <button
                  type="button"
                  onClick={() => setIsOpeningTextOpen(false)}
                  className="text-[11px] text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                >
                  Recolher ▲
                </button>
              </div>
              <textarea
                rows={2}
                value={
                  (!currentQuote.openingText || currentQuote.openingText.trim() === 'Em atenção...' || currentQuote.openingText.trim() === 'Em atenção' || currentQuote.openingText.trim().startsWith('Em atenção ao que foi solicitado'))
                    ? ((settings.defaultOpeningText && settings.defaultOpeningText.trim() !== 'Em atenção...' && settings.defaultOpeningText.trim() !== 'Em atenção' && !settings.defaultOpeningText.trim().startsWith('Em atenção ao que foi solicitado'))
                        ? settings.defaultOpeningText
                        : 'Em atenção à solicitação de Vossa Senhoria, temos a grata satisfação de submeter à apreciação a nossa proposta de preços para fornecimento dos produtos relacionados a seguir:')
                    : currentQuote.openingText
                }
                onChange={(e) => setCurrentQuote(prev => ({ ...prev, openingText: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-sky-500 font-medium"
              />
            </div>
          )}
        </div>
        </div>
      )}
    </div>

      {/* Barra de Ações Finais da Cotação (Barra Flutuante Fixa / Sticky Footer) */}
      <div className="sticky bottom-16 lg:bottom-3 z-30 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-3 sm:p-5 shadow-lg shadow-slate-900/10 transition-all">
        
        {/* Layout Desktop (sm e superior) */}
        <div className="hidden sm:flex items-center justify-between gap-4">
          <div className="text-left">
            <p className="text-xs text-slate-500 font-medium">
              Total da Cotação: <strong className="text-slate-900 font-mono text-base ml-1">R$ {currentQuote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </p>
            <p className="text-[11px] text-slate-400">
              {currentQuote.items.length} {currentQuote.items.length === 1 ? 'item cotado' : 'itens cotados'} • Margem média de {currentQuote.averageMargin.toFixed(1)}%
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onNewQuote && (
              <button
                type="button"
                onClick={() => {
                  if (currentQuote.items.length > 0) {
                    if (window.confirm('Deseja iniciar um Novo Orçamento? As alterações não salvas da proposta atual serão substituídas.')) {
                      onNewQuote();
                    }
                  } else {
                    onNewQuote();
                  }
                }}
                className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-sky-700 border border-sky-200/90 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
                title="Iniciar um novo orçamento em branco"
              >
                <PlusCircle className="w-3.5 h-3.5 text-sky-600" />
                <span>Novo Orçamento</span>
              </button>
            )}

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
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm shadow-sky-600/25 cursor-pointer active:scale-95"
              title="Visualizar documento comercial oficial para conferência, impressão em PDF ou disparo por e-mail"
            >
              <Eye className="w-4 h-4" />
              <span>Visualizar & Emitir Proposta</span>
            </button>
          </div>
        </div>

        {/* Layout Mobile Otimizado (sem botões sobrepostos) */}
        <div className="flex sm:hidden flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block leading-none mb-0.5">Total Proposta</span>
              <span className="text-sm font-extrabold text-slate-900 font-mono leading-none">
                R$ {currentQuote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <span className="text-[10.5px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg font-medium">
              {currentQuote.items.length} {currentQuote.items.length === 1 ? 'item' : 'itens'} • {currentQuote.averageMargin.toFixed(0)}% margem
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100">
            {/* Salvar Rascunho */}
            <button
              type="button"
              onClick={() => persistAndProceed(onSave)}
              className="flex flex-col items-center justify-center py-2.5 px-1 bg-slate-100 active:bg-slate-200 text-slate-700 rounded-xl text-[10.5px] font-bold transition shadow-2xs cursor-pointer active:scale-95"
              title="Salvar rascunho"
            >
              <Save className="w-4 h-4 text-slate-600 mb-0.5" />
              <span>Salvar</span>
            </button>

            {/* Visualizar Proposta */}
            <button
              type="button"
              onClick={() => persistAndProceed(onPreview, true)}
              className="flex flex-col items-center justify-center py-2.5 px-1 bg-sky-600 active:bg-sky-700 text-white rounded-xl text-[10.5px] font-bold transition shadow-xs cursor-pointer active:scale-95"
              title="Visualizar proposta oficial"
            >
              <Eye className="w-4 h-4 mb-0.5" />
              <span>Visualizar</span>
            </button>

            {/* Mais Ações (Excel, Novo Orçamento) */}
            <div className="relative" ref={mobileMoreActionsRef}>
              <button
                type="button"
                onClick={() => setIsMobileMoreActionsOpen(prev => !prev)}
                className={`w-full h-full flex flex-col items-center justify-center py-2.5 px-1 rounded-xl text-[10.5px] font-bold transition shadow-2xs cursor-pointer active:scale-95 border ${
                  isMobileMoreActionsOpen 
                    ? 'bg-sky-50 text-sky-700 border-sky-300' 
                    : 'bg-slate-100 active:bg-slate-200 text-slate-700 border-slate-200'
                }`}
                title="Mais ações da proposta"
              >
                <MoreVertical className="w-4 h-4 mb-0.5 text-slate-600" />
                <span>Mais</span>
              </button>

              {isMobileMoreActionsOpen && (
                <div className="absolute right-0 bottom-full mb-2 w-52 bg-white border border-slate-200 rounded-2xl shadow-xl py-1.5 z-50 animate-scaleIn">
                  <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Mais Ações
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMoreActionsOpen(false);
                      if (!currentQuote.items || currentQuote.items.length === 0) {
                        alert('Adicione ao menos um produto na cotação para exportar a planilha Excel.');
                        return;
                      }
                      handleExportExcel();
                    }}
                    className="w-full px-3 py-2.5 text-left text-xs font-semibold text-emerald-800 hover:bg-emerald-50 flex items-center gap-2 transition"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Salvar Excel (.xlsx)</span>
                  </button>

                  {onNewQuote && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMoreActionsOpen(false);
                        if (currentQuote.items.length > 0) {
                          if (window.confirm('Deseja iniciar um Novo Orçamento? As alterações não salvas da proposta atual serão substituídas.')) {
                            onNewQuote();
                          }
                        } else {
                          onNewQuote();
                        }
                      }}
                      className="w-full px-3 py-2.5 text-left text-xs font-semibold text-sky-700 hover:bg-sky-50 flex items-center gap-2 transition border-t border-slate-100"
                    >
                      <PlusCircle className="w-4 h-4 text-sky-600" />
                      <span>Novo Orçamento</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>



      {/* Modal Unificado de Verificação Geral e Edição do Produto (Catálogo / NCM) */}
      {isCatalogModalOpen && catalogReviewProduct && (
        <ProductEditModal
          isOpen={isCatalogModalOpen}
          onClose={() => {
            setIsCatalogModalOpen(false);
            setCatalogReviewProduct(null);
            setTargetQuoteItemId(null);
          }}
          product={catalogReviewProduct}
          initialShippingCost={
            targetQuoteItemId
              ? (currentQuote.items.find(it => it.id === targetQuoteItemId)?.shippingCost ?? globalShipping)
              : 0
          }
          showShippingFields={true}
          availableUnits={availableUnits}
          onAddUnit={(newUnit) => {
            saveRegisteredUnit(newUnit);
            setRegisteredUnits(getRegisteredUnits());
          }}
          availableCategories={availableCategories}
          onAddCategory={(newCat) => {
            saveRegisteredCategory(newCat);
            setRegisteredCategories(getRegisteredCategories());
          }}
          title="Verificação Geral do Produto"
          subtitle="Revise os dados comerciais, foto e descrição. Depois de salvar o produto já entrará na base de dados."
          badgeText="Proposta & Produtos"
          saveButtonText="Salvar"
          saveButtonTitle="Salvar alterações no item da proposta e na base geral de produtos"
          onSave={(finalProd, shippingCost) => {
            handleSaveProductFromReviewModal(finalProd, shippingCost);
          }}
        />
      )}

      {/* Modal de Zoom da Foto no Meio da Tela (Fiel à Referência Visual) */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
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

      {/* Modal Interativo de Ajuste e Salvamento da Margem de Lucro (%) */}
      {isMarkupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-scaleIn">
            <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-indigo-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-xs">
                  <Percent className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Margem de Lucro (%)</h3>
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
      {/* Modal de Importação Universal (MEL-10) */}
      <UniversalListImportModal
        isOpen={isUniversalImportOpen}
        onClose={() => setIsUniversalImportOpen(false)}
        onImportItems={handleImportUniversalItems}
        defaultMarkupPercent={globalMarkup}
      />

      {/* Modal de Matriz Multi-Fornecedor & Split (MEL-06) */}
      <MultiSupplierMatrixModal
        isOpen={isSupplierMatrixOpen}
        onClose={() => setIsSupplierMatrixOpen(false)}
        items={currentQuote.items || []}
        onApplyOptimizedBasket={handleApplyOptimizedBasket}
      />

      {/* Modal de Escolha de Foto Comercial na Web */}
      {webImagePickerItem && (
        <WebImagePickerModal
          isOpen={true}
          onClose={() => setWebImagePickerItem(null)}
          productName={webImagePickerItem.productName}
          currentImageUrl={webImagePickerItem.currentImageUrl}
          onSelectImage={handlePhotoSelectedForQuote}
        />
      )}

    </div>
  );
};

