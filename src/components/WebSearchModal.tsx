import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Sparkles,
  Plus,
  Check,
  ExternalLink,
  Image as ImageIcon,
  Barcode,
  Receipt,
  BookmarkPlus,
  RefreshCw,
  Layers,
  ListChecks,
  CheckSquare,
  Square,
  AlertTriangle,
  Store,
  ArrowRight,
  Info,
  DollarSign,
  Upload,
  Camera,
  FileText,
  X,
  Percent,
  History,
  Tag,
  Type,
  ChevronDown,
  Trash2,
  Zap,
  CheckCircle2,
  Printer
} from 'lucide-react';
import { extractDataFromQuotationImage } from '../services/imageQuoteParser';
import { Product, QuoteItem } from '../types';
import {
  resolveProductDetails,
  cleanAlphanumericCode,
  cleanNcmCode,
  getCategoryFromNcm,
  ProductCandidateListing,
  isExactProductUrl,
  extractStoreNameFromUrl,
  resolveImageForDescription,
  formatProductSentenceCase,
  applyTextCase,
  WordCaseStyle
} from '../utils/aiEmailParser';
import {
  DiscoveredProduct,
  ScannedPriceResult,
  BatchScanProgress,
  parsePastedProductList,
  parsePastedProductListWithQty,
  runBatchPriceScan,
  scanSingleProductPrice,
  formatBRL,
  phase1DiscoverProductsFromText,
  runBatchPhase2Scan
} from '../services/priceScannerService';

interface WebSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToQuote: (item: Partial<QuoteItem>) => void;
  onStartNewQuoteWithItems?: (items: Partial<QuoteItem>[]) => void;
  onSaveToCatalog: (prod: Product) => void;
  initialQuery?: string;
  targetItemIndex?: number | null;
  onUpdateQuoteItem?: (index: number, updatedData: Partial<QuoteItem>) => void;
  existingItem?: Partial<QuoteItem> | null;
}

export const WebSearchModal: React.FC<WebSearchModalProps> = ({
  isOpen,
  onClose,
  onAddToQuote,
  onStartNewQuoteWithItems,
  onSaveToCatalog,
  initialQuery = '',
  targetItemIndex = null,
  onUpdateQuoteItem,
  existingItem = null
}) => {
  // Modal Mode: 'batch' (Lote Inteligente) or 'single' (Busca Unitária)
  const [activeTab, setActiveTab] = useState<'batch' | 'single'>('batch');

  // Single Search State
  const [query, setQuery] = useState(initialQuery);
  const [isSearchingSingle, setIsSearchingSingle] = useState(false);
  const [pastedUrl, setPastedUrl] = useState('');

  // Active Standardized Product Form State (Single Mode)
  const [standardizedName, setStandardizedName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [ncm, setNcm] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showImageInQuote, setShowImageInQuote] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [supplier, setSupplier] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [category, setCategory] = useState('Informática & Tecnologia');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('Un.');
  const [candidateListings, setCandidateListings] = useState<ProductCandidateListing[]>([]);
  const [description, setDescription] = useState('');
  const [specifications, setSpecifications] = useState<Array<{ label: string; value: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch Mode State
  const [batchRawInput, setBatchRawInput] = useState('');
  const [isScanningBatch, setIsScanningBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchScanProgress | null>(null);
  const [batchResults, setBatchResults] = useState<ScannedPriceResult[]>([]);
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(new Set());

  // Fluxo em 2 Fases (Fase 1: Dedução Técnica -> Fase 2: Infodesk Store Cotação & Enriquecimento)
  const [discoveredProducts, setDiscoveredProducts] = useState<DiscoveredProduct[]>([]);
  const [isDiscoveringPhase1, setIsDiscoveringPhase1] = useState(false);
  const [phase1StatusMessage, setPhase1StatusMessage] = useState('');

  // OCR Image Transcription State
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrProgressMessage, setOcrProgressMessage] = useState('');
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [ocrEditableText, setOcrEditableText] = useState('');
  const [ocrImagePreview, setOcrImagePreview] = useState<string | null>(null);
  const [attachedProductPhoto, setAttachedProductPhoto] = useState<string | null>(null);
  const imageUploadInputRef = useRef<HTMLInputElement>(null);

  // Success Feedbacks
  const [addedSuccess, setAddedSuccess] = useState(false);
  const [savedCatalogSuccess, setSavedCatalogSuccess] = useState(false);

  // Margem Alvo Rápida (+20%, +25%, +30%, +35%) e Filtro Rápido (Todos, Menor Preço, Mais Confiável)
  const [targetMarginPercent, setTargetMarginPercent] = useState<number | null>(null);
  const [sortFilterMode, setSortFilterMode] = useState<'all' | 'lowestPrice' | 'officialStores'>('all');

  // Controle de Capitalização estilo Word (Maiúsculas, Minúsculas, Primeira da frase, Primeira de Cada Palavra)
  const [isCaseMenuOpen, setIsCaseMenuOpen] = useState(false);
  const [activeCaseStyle, setActiveCaseStyle] = useState<WordCaseStyle>('sentence');
  const caseMenuRef = useRef<HTMLDivElement>(null);

  // When modal opens or initialQuery changes
  useEffect(() => {
    if (isOpen) {
      if (initialQuery) {
        setBatchRawInput(initialQuery);
      }
      setShowImageInQuote(existingItem?.showImage ?? false);
      setAddedSuccess(false);
      setSavedCatalogSuccess(false);
    }
  }, [isOpen, initialQuery, existingItem, targetItemIndex]);

  // Handle single standardization
  const runProductStandardization = async (searchTerm: string) => {
    setIsSearchingSingle(true);
    try {
      const scanned = await scanSingleProductPrice(searchTerm);
      const details = resolveProductDetails(searchTerm, undefined, existingItem?.partNumber);

      const finalPartNumber = existingItem?.partNumber && existingItem.partNumber.trim().length >= 2
        ? cleanAlphanumericCode(existingItem.partNumber)
        : cleanAlphanumericCode(scanned.partNumber || details.partNumber);

      const finalNcm = existingItem?.ncm && existingItem.ncm.trim().length >= 4
        ? cleanNcmCode(existingItem.ncm)
        : cleanNcmCode(scanned.ncm || details.ncm);

      const accurateImage = scanned.imageUrl || resolveImageForDescription(scanned.standardizedName || details.standardizedName) || details.imageUrl;
      const finalImage = existingItem?.imageUrl && !existingItem.imageUrl.includes('photo-1526738549149-8e07eca6c147')
        ? existingItem.imageUrl
        : accurateImage;

      const exactSourceUrl = (existingItem?.sourceUrl && isExactProductUrl(existingItem.sourceUrl))
        ? existingItem.sourceUrl
        : (scanned.buyUrl || (isExactProductUrl(details.sourceUrl) ? details.sourceUrl : ''));

      const exactSupplier = scanned.store || existingItem?.supplier || details.supplier || extractStoreNameFromUrl(exactSourceUrl);
      const finalCategory = getCategoryFromNcm(finalNcm, scanned.category || details.category);

      setStandardizedName(formatProductSentenceCase(scanned.standardizedName || details.standardizedName));
      setPartNumber(finalPartNumber);
      setNcm(finalNcm);
      setImageUrl(finalImage);
      setShowImageInQuote(existingItem?.showImage ?? true);
      setEstimatedCost(existingItem?.costPrice || scanned.bestPrice || details.estimatedCost);
      setSupplier(exactSupplier);
      setSourceUrl(exactSourceUrl);
      setCategory(finalCategory);
      setCandidateListings(details.candidateListings || []);
      setDescription(scanned.description || '');
      setSpecifications(scanned.specifications || []);
    } catch (e) {
      console.error('Error running single standardization:', e);
    } finally {
      setIsSearchingSingle(false);
    }
  };

  const handleSingleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    runProductStandardization(query);
  };

  // ─── FASE 1: Identificar Produto(s) com Dedução e Engenharia Reversa ──────────
  const handleStartPhase1Discovery = async () => {
    if (!batchRawInput.trim() && !attachedProductPhoto) return;

    setIsDiscoveringPhase1(true);
    setPhase1StatusMessage(
      attachedProductPhoto
        ? 'Examinando foto com prioridade visual máxima + especificações do texto...'
        : 'Analisando características técnicas e identificando o(s) produto(s)...'
    );
    setBatchResults([]);
    setSelectedResultIds(new Set());

    try {
      const discovered = await phase1DiscoverProductsFromText(batchRawInput, {
        imageSource: attachedProductPhoto
      });
      setDiscoveredProducts(discovered);
    } catch (err) {
      console.error('Erro na Fase 1 (Dedução de Produtos):', err);
      alert('Não foi possível identificar os produtos. Verifique o texto e tente novamente.');
    } finally {
      setIsDiscoveringPhase1(false);
      setPhase1StatusMessage('');
    }
  };

  // ─── FASE 2: Buscar Preços e Enriquecer (Sistemática Infodesk Store) ───────────
  const handleStartPhase2Enrichment = async () => {
    if (discoveredProducts.length === 0) return;

    setIsScanningBatch(true);
    setBatchProgress({ total: discoveredProducts.length, current: 0, currentProduct: '', isComplete: false });
    setBatchResults([]);
    setSelectedResultIds(new Set());

    try {
      const results = await runBatchPhase2Scan(discoveredProducts, (prog, currentRes) => {
        setBatchProgress({ ...prog });
        setBatchResults([...currentRes]);
        // Auto-seleciona os itens com preço válido
        const newSelected = new Set<string>();
        currentRes.forEach(r => {
          if (r.bestPrice > 0) newSelected.add(r.id);
        });
        setSelectedResultIds(newSelected);
      });

      setBatchResults(results);
      const initialSelected = new Set<string>();
      results.forEach(r => {
        if (r.bestPrice > 0) initialSelected.add(r.id);
      });
      setSelectedResultIds(initialSelected);
    } catch (err) {
      console.error('Erro na Fase 2 (Enriquecimento e Preços):', err);
    } finally {
      setIsScanningBatch(false);
    }
  };

  // Atualização em tempo real de produtos identificados na Fase 1
  const handleUpdateDiscoveredProduct = (id: string, updates: Partial<DiscoveredProduct>) => {
    setDiscoveredProducts(prev => prev.map(p => (p.id === id ? { ...p, ...updates } : p)));
  };

  // Remoção de um item específico da Fase 1
  const handleRemoveDiscoveredProduct = (id: string) => {
    setDiscoveredProducts(prev => prev.filter(p => p.id !== id));
  };

  // Seleção de foto na galeria de thumbnails do produto identificado
  const handleSelectDiscoveredImage = (productId: string, index: number) => {
    setDiscoveredProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        selectedImageIndex: index,
        imageUrl: p.images?.[index] || p.imageUrl
      };
    }));
  };

  // Inserir produto identificado individualmente na cotação
  const handleAddSingleDiscoveredToQuote = (prod: DiscoveredProduct) => {
    const chosenImage = prod.images?.[prod.selectedImageIndex || 0] || prod.imageUrl || '';
    const price = prod.suggestedPrice || (prod.costPrice ? prod.costPrice * 1.35 : 0);
    const cost = prod.costPrice || (prod.suggestedPrice ? prod.suggestedPrice / 1.35 : 0);

    onAddToQuote({
      name: prod.standardizedName,
      description: prod.description || prod.standardizedName,
      partNumber: cleanAlphanumericCode(prod.partNumber || ''),
      ncm: cleanNcmCode(prod.ncm || ''),
      imageUrl: chosenImage,
      showImage: !!chosenImage,
      costPrice: cost > 0 ? cost : price,
      unitPrice: price > 0 ? price : undefined,
      markupPercent: targetMarginPercent !== null ? targetMarginPercent : undefined,
      quantity: prod.quantity || 1,
      unit: prod.unit || 'Un.',
      supplier: prod.manufacturer || prod.brand || 'Infodesk Store',
      sourceUrl: ''
    });

    setAddedSuccess(true);
    setTimeout(() => {
      setAddedSuccess(false);
      onClose();
    }, 800);
  };

  // Inserir todos os produtos identificados na cotação
  const handleAddAllDiscoveredToQuote = () => {
    if (discoveredProducts.length === 0) return;
    discoveredProducts.forEach(prod => {
      const chosenImage = prod.images?.[prod.selectedImageIndex || 0] || prod.imageUrl || '';
      const price = prod.suggestedPrice || (prod.costPrice ? prod.costPrice * 1.35 : 0);
      const cost = prod.costPrice || (prod.suggestedPrice ? prod.suggestedPrice / 1.35 : 0);

      onAddToQuote({
        name: prod.standardizedName,
        description: prod.description || prod.standardizedName,
        partNumber: cleanAlphanumericCode(prod.partNumber || ''),
        ncm: cleanNcmCode(prod.ncm || ''),
        imageUrl: chosenImage,
        showImage: !!chosenImage,
        costPrice: cost > 0 ? cost : price,
        unitPrice: price > 0 ? price : undefined,
        markupPercent: targetMarginPercent !== null ? targetMarginPercent : undefined,
        quantity: prod.quantity || 1,
        unit: prod.unit || 'Un.',
        supplier: prod.manufacturer || prod.brand || 'Infodesk Store',
        sourceUrl: ''
      });
    });

    setAddedSuccess(true);
    setTimeout(() => {
      setAddedSuccess(false);
      onClose();
    }, 800);
  };

  // Salvar produto no Catálogo
  const handleSaveDiscoveredToCatalog = (prod: DiscoveredProduct) => {
    onSaveToCatalog({
      id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      sku: prod.partNumber || `SKU-${Date.now().toString().slice(-6)}`,
      partNumber: prod.partNumber,
      ncm: prod.ncm,
      name: prod.standardizedName,
      description: prod.description || prod.standardizedName,
      category: prod.category || 'Geral',
      costPrice: prod.costPrice || (prod.suggestedPrice ? prod.suggestedPrice / 1.35 : 0),
      unit: prod.unit || 'Un.',
      supplier: prod.manufacturer || prod.brand || 'Infodesk Store',
      imageUrl: prod.images?.[prod.selectedImageIndex || 0] || prod.imageUrl,
      lastUpdated: new Date().toISOString()
    });

    setSavedCatalogSuccess(true);
    setTimeout(() => {
      setSavedCatalogSuccess(false);
    }, 2000);
  };



  // Toggle select in batch
  const handleToggleSelectResult = (id: string) => {
    setSelectedResultIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedResultIds.size === batchResults.length) {
      setSelectedResultIds(new Set());
    } else {
      setSelectedResultIds(new Set(batchResults.map(r => r.id)));
    }
  };

  // Aplica formatação estilo Word (Maiúsculas, Minúsculas, 1ª da frase, 1ª de cada palavra)
  const handleApplyCaseToResults = (style: WordCaseStyle) => {
    setActiveCaseStyle(style);
    setIsCaseMenuOpen(false);

    setBatchResults(prev => prev.map(item => {
      // Se houver seleção ativa, altera apenas os selecionados; se nenhum estiver selecionado, altera todos
      const shouldTransform = selectedResultIds.size === 0 || selectedResultIds.has(item.id);
      if (!shouldTransform) return item;

      return {
        ...item,
        standardizedName: applyTextCase(item.standardizedName, style),
        originalQuery: applyTextCase(item.originalQuery, style)
      };
    }));
  };

  // Altera a capitalização de um item específico na lista
  const handleSingleResultChangeCase = (id: string, style: WordCaseStyle) => {
    setBatchResults(prev => prev.map(item => {
      if (item.id !== id) return item;
      return {
        ...item,
        standardizedName: applyTextCase(item.standardizedName, style)
      };
    }));
  };

  // Apply batch selected to existing quote
  const handleApplyBatchToQuote = () => {
    const selected = batchResults.filter(r => selectedResultIds.has(r.id));
    if (selected.length === 0) return;

    selected.forEach(res => {
      onAddToQuote({
        name: res.standardizedName,
        description: res.description || res.observation || '',
        partNumber: cleanAlphanumericCode(res.partNumber || ''),
        ncm: cleanNcmCode(res.ncm || ''),
        imageUrl: res.imageUrl,
        showImage: false,
        costPrice: res.bestPrice,
        markupPercent: targetMarginPercent !== null ? targetMarginPercent : undefined,
        quantity: res.quantity || 1,
        unit: 'Un.',
        sourceUrl: res.buyUrl,
        supplier: res.store
      });
    });

    setAddedSuccess(true);
    setTimeout(() => {
      setAddedSuccess(false);
      onClose();
    }, 1000);
  };

  // Start a fresh, clean quote from scratch with selected items
  const handleStartNewQuoteFromBatch = () => {
    const selected = batchResults.filter(r => selectedResultIds.has(r.id));
    if (selected.length === 0) return;

    const itemsToCreate: Partial<QuoteItem>[] = selected.map(res => {
      const cleanName = (res.standardizedName || '')
        .replace(/,/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      return {
        name: cleanName,
        description: res.description || res.observation || '',
        partNumber: cleanAlphanumericCode(res.partNumber || ''),
        ncm: cleanNcmCode(res.ncm || ''),
        imageUrl: res.imageUrl,
        showImage: false,
        costPrice: res.bestPrice,
        markupPercent: targetMarginPercent !== null ? targetMarginPercent : undefined,
        quantity: res.quantity || 1,
        unit: 'Un.',
        sourceUrl: res.buyUrl,
        supplier: res.store
      };
    });

    if (onStartNewQuoteWithItems) {
      onStartNewQuoteWithItems(itemsToCreate);
    } else {
      itemsToCreate.forEach(it => onAddToQuote(it));
    }

    setAddedSuccess(true);
    setTimeout(() => {
      setAddedSuccess(false);
      onClose();
    }, 800);
  };

  // Process Image with Gemini Vision AI (with fallback)
  const handleProcessImageForOcr = async (fileOrBlob: File | Blob) => {
    setIsOcrProcessing(true);
    setOcrProgressMessage('Carregando imagem para análise com Inteligência Artificial...');

    // Create preview
    const previewUrl = URL.createObjectURL(fileOrBlob);
    setOcrImagePreview(previewUrl);
    setAttachedProductPhoto(previewUrl);

    try {
      const extracted = await extractDataFromQuotationImage(fileOrBlob as File, (pct, msg) => {
        setOcrProgressMessage(msg);
      });

      if (extracted.items && extracted.items.length > 0) {
        // Formatar cada item de forma limpa, sem vírgulas: "Nome do Produto | Qtd: N Un"
        const formattedLines = extracted.items.map(it => {
          const qtyPart = it.quantity && it.quantity > 1 ? ` | Qtd: ${it.quantity} ${it.unit || 'Un.'}` : '';
          const codePart = it.partNumber ? ` [Ref: ${it.partNumber}]` : '';
          
          let cleanName = (it.name || '').trim();
          // Se a descrição adicionar dados técnicos reais que não estão no nome, adiciona com espaço limpo (sem traço)
          let extraDesc = '';
          if (it.description && it.description.trim() && it.description.trim().toLowerCase() !== cleanName.toLowerCase()) {
            const desc = it.description.trim();
            if (!desc.toLowerCase().startsWith(cleanName.toLowerCase()) && !cleanName.toLowerCase().startsWith(desc.toLowerCase())) {
              extraDesc = ` ${desc}`;
            }
          }

          // Higienização completa: remove apenas vírgulas
          const combined = `${cleanName}${extraDesc}`
            .replace(/,/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

          return `${combined}${codePart}${qtyPart}`.trim();
        });

        setOcrEditableText(formattedLines.join('\n'));
        setIsOcrModalOpen(true);
      } else {
        alert('Não foi possível identificar os produtos na imagem. Tente uma foto mais nítida.');
      }
    } catch (err) {
      console.error('Erro na extração visual da imagem:', err);
      alert('Não foi possível ler a imagem. Tente novamente.');
    } finally {
      setIsOcrProcessing(false);
      setOcrProgressMessage('');
    }
  };

  // Clipboard Paste Handler for Batch Mode (Detects if image is pasted)
  const handleBatchAreaPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(it => it.type.startsWith('image/'));
    if (imgItem) {
      e.preventDefault();
      const blob = imgItem.getAsFile();
      if (blob) {
        handleProcessImageForOcr(blob);
      }
    }
  };

  // Apply OCR Edited Text into Batch Input
  const handleConfirmOcrText = () => {
    if (ocrEditableText.trim()) {
      setBatchRawInput(prev => {
        if (!prev.trim()) return ocrEditableText.trim();
        return `${prev.trim()}\n${ocrEditableText.trim()}`;
      });
    }
    if (ocrImagePreview) {
      setAttachedProductPhoto(ocrImagePreview);
    }
    setIsOcrModalOpen(false);
  };

  // Apply single item to quote
  const handleApplySingleToQuote = () => {
    const itemData: Partial<QuoteItem> = {
      name: standardizedName,
      description: description || existingItem?.description || '',
      partNumber: cleanAlphanumericCode(partNumber),
      ncm: cleanNcmCode(ncm),
      imageUrl,
      showImage: showImageInQuote,
      costPrice: estimatedCost,
      quantity,
      unit,
      sourceUrl: sourceUrl || `https://www.google.com/search?q=${encodeURIComponent(standardizedName + ' ' + partNumber)}&tbm=shop`,
      supplier
    };

    if (targetItemIndex !== null && onUpdateQuoteItem) {
      onUpdateQuoteItem(targetItemIndex, itemData);
    } else {
      onAddToQuote(itemData);
    }

    setAddedSuccess(true);
    setTimeout(() => {
      setAddedSuccess(false);
      onClose();
    }, 800);
  };

  // Save single to catalog
  const handleSaveToCatalogAction = () => {
    onSaveToCatalog({
      id: `prod-${Date.now()}`,
      sku: cleanAlphanumericCode(partNumber) || `INF-${Date.now().toString().slice(-4)}`,
      partNumber: cleanAlphanumericCode(partNumber),
      ncm: cleanNcmCode(ncm),
      name: standardizedName,
      description: description || `Part Number: ${cleanAlphanumericCode(partNumber)} | NCM: ${cleanNcmCode(ncm)}`,
      category,
      costPrice: estimatedCost,
      unit,
      supplier,
      stock: 10,
      lastUpdated: new Date().toISOString().split('T')[0],
      sourceUrl,
      imageUrl
    });

    setSavedCatalogSuccess(true);
    setTimeout(() => {
      setSavedCatalogSuccess(false);
    }, 2000);
  };

  const handleSelectCandidate = (candidate: ProductCandidateListing) => {
    const candidateNcm = cleanNcmCode(candidate.ncm);
    setStandardizedName(candidate.name);
    setPartNumber(cleanAlphanumericCode(candidate.partNumber));
    setNcm(candidateNcm);
    setCategory(getCategoryFromNcm(candidateNcm, category));
    setImageUrl(candidate.imageUrl);
    setEstimatedCost(candidate.cost);
    setSupplier(candidate.supplier);
    setSourceUrl(candidate.directUrl);
  };

  // Tecla ESC para fechar o modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fechar menu de capitalização ao clicar fora
  useEffect(() => {
    const handleClickOutsideCaseMenu = (e: MouseEvent) => {
      if (caseMenuRef.current && !caseMenuRef.current.contains(e.target as Node)) {
        setIsCaseMenuOpen(false);
      }
    };
    if (isCaseMenuOpen) {
      document.addEventListener('mousedown', handleClickOutsideCaseMenu);
    }
    return () => document.removeEventListener('mousedown', handleClickOutsideCaseMenu);
  }, [isCaseMenuOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        className="bg-white border border-slate-200 rounded-3xl w-full max-w-6xl max-h-[96vh] h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn"
      >

        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-100 border border-sky-200 rounded-xl text-sky-700">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Scanner Inteligente de Preços & Ofertas
                </h2>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] rounded-full font-bold">
                  IA & Web Search
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Pesquise produtos (individualmente ou listas inteiras) com fotos reais, menor preço de mercado e links diretos de compra.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-sm font-bold transition ml-2 cursor-pointer shadow-2xs"
              title="Fechar (ESC)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* UNIFIED SEARCH SCANNER */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Input Area */}
          <div className="p-5 border-b border-slate-200 bg-white space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ListChecks className="w-4 h-4 text-sky-600" />
                <span>Cole seus Produtos (um único item ou lista inteira do WhatsApp, Planilha ou E-mail):</span>
              </label>
              <span className="text-[11px] text-slate-500 font-medium">
                {batchRawInput ? `${parsePastedProductList(batchRawInput).length} produto(s) identificado(s)` : 'Cole 1 item ou vários (1 por linha)'}
              </span>
            </div>

            {/* Preview da Foto Real Anexada do Produto (Prioridade Visual Máxima) */}
            {attachedProductPhoto && (
              <div className="flex items-center gap-3.5 p-3.5 bg-gradient-to-r from-sky-50 via-indigo-50/50 to-white border border-sky-300 rounded-2xl animate-fadeIn">
                <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-sky-300 shadow-2xs bg-white shrink-0">
                  <img
                    src={attachedProductPhoto}
                    alt="Foto do Produto Fornecida"
                    className="w-full h-full object-contain p-1"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 bg-sky-600 text-white text-[10px] font-extrabold uppercase tracking-wide rounded-md shadow-2xs">
                      📷 Prioridade Visual Ativa
                    </span>
                    <span className="text-xs font-bold text-slate-900">
                      Foto de Referência Anexada
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    A foto dita o modelo real, chassi, grade e rodas. A busca é focada no produto da foto.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachedProductPhoto(null)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                  title="Remover foto anexada"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="relative">
              <textarea
                rows={6}
                value={batchRawInput}
                onChange={(e) => setBatchRawInput(e.target.value)}
                onPaste={handleBatchAreaPaste}
                placeholder="Cole aqui o que você precisa buscar: pode ser um único produto ou uma lista completa. Você também pode colar um print direto com CTRL+V!"
                className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-4 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-mono leading-relaxed resize-y"
              />

              {/* Hidden File Input for Image Upload */}
              <input
                type="file"
                ref={imageUploadInputRef}
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleProcessImageForOcr(file);
                  }
                  e.target.value = '';
                }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => imageUploadInputRef.current?.click()}
                  disabled={isOcrProcessing}
                  className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Carregue uma imagem ou print de pedido para transcrever automaticamente"
                >
                  <Camera className="w-3.5 h-3.5 text-sky-600" />
                  <span>{isOcrProcessing ? 'Transcrevendo Foto...' : 'Carregar Foto de Pedido'}</span>
                </button>

                {(batchRawInput || discoveredProducts.length > 0 || batchResults.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setBatchRawInput('');
                      setDiscoveredProducts([]);
                      setBatchResults([]);
                      setSelectedResultIds(new Set());
                    }}
                    className="text-[11px] text-slate-400 hover:text-slate-600 ml-2 cursor-pointer"
                  >
                    Limpar Tudo
                  </button>
                )}
              </div>

              {/* BOTÃO DA FASE 1: IDENTIFICAR PRODUTO(S) */}
              <button
                type="button"
                onClick={handleStartPhase1Discovery}
                disabled={isDiscoveringPhase1 || isScanningBatch || !batchRawInput.trim()}
                className="px-6 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer"
                title="Fase 1: Analisa as características e deduz os produtos exatos sem vírgulas no padrão de mercado"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isDiscoveringPhase1 ? 'animate-spin' : ''}`} />
                <span>{isDiscoveringPhase1 ? 'Identificando Produto(s)...' : '1. Identificar Produto(s)'}</span>
              </button>
            </div>

            {/* OCR Processing Indicator */}
            {isOcrProcessing && (
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-3 animate-fadeIn">
                <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
                <div className="text-xs text-indigo-900 font-semibold">
                  <span>{ocrProgressMessage || 'Transcrevendo foto do pedido via leitura ótica (OCR)...'}</span>
                </div>
              </div>
            )}

            {/* Phase 1 Processing Indicator */}
            {isDiscoveringPhase1 && (
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-3 animate-fadeIn">
                <Sparkles className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
                <div className="text-xs text-indigo-900 font-semibold">
                  <span>{phase1StatusMessage || 'Analisando características técnicas e identificando produto(s)...'}</span>
                </div>
              </div>
            )}

            {/* Progress Bar da Fase 2 */}
            {isScanningBatch && batchProgress && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5 animate-fadeIn">
                <div className="flex items-center justify-between text-xs text-emerald-800 font-semibold">
                  <span>Sistemática Infodesk Store: {batchProgress.currentProduct}</span>
                  <span>{batchProgress.current} de {batchProgress.total} ({Math.round((batchProgress.current / batchProgress.total) * 100)}%)</span>
                </div>
                <div className="w-full bg-emerald-200 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-600 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Results Table Area */}
          <div className="flex-1 overflow-y-auto p-5 pb-28 bg-slate-50/50 space-y-4">
            {/* ─── PAINEL DE PRODUTOS IDENTIFICADOS 360° (PADRÃO INFODESK STORE) ─── */}
            {discoveredProducts.length > 0 && (
              <div className="space-y-4 animate-fadeIn">
                {/* Header de Ações Rápidas */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        Fase 1: Produtos Identificados e Catalogados 360°
                        <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] rounded-full font-extrabold">
                          {discoveredProducts.length} item(ns)
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Ficha técnica 360° gerada por IA com especificações, galeria de fotos e preços sugeridos de mercado.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {discoveredProducts.length > 1 && (
                      <button
                        type="button"
                        onClick={handleAddAllDiscoveredToQuote}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-98"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Inserir Todos ({discoveredProducts.length})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleStartPhase2Enrichment}
                      disabled={isScanningBatch}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                      title="Varre lojas online (Mercado Livre, Amazon, etc.) para apurar preços reais e links de compra"
                    >
                      <Zap className={`w-3.5 h-3.5 text-amber-500 ${isScanningBatch ? 'animate-spin' : ''}`} />
                      <span>{isScanningBatch ? 'Pesquisando Lojas...' : '2. Comparar Preços em Lojas (Fase 2)'}</span>
                    </button>
                  </div>
                </div>

                {/* LISTA DE CARDS 360° NO PADRÃO EXATO DA INFODESK STORE (FOTO 2) */}
                <div className="space-y-4">
                  {discoveredProducts.map((prod) => {
                    const images = prod.images && prod.images.length > 0 ? prod.images : [prod.imageUrl || ''];
                    const activeImgIndex = prod.selectedImageIndex ?? 0;
                    const currentImg = images[activeImgIndex] || images[0] || '';

                    return (
                      <div
                        key={prod.id}
                        className="bg-white border-2 border-emerald-400/40 hover:border-emerald-500/60 rounded-3xl p-5 md:p-6 shadow-xs hover:shadow-md transition-all duration-200 space-y-4 relative"
                      >
                        {/* Top Badges Row (Foto 2) */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded-full text-xs font-semibold">
                              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                              Inteligência Artificial (Gemini AI)
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#064e3b] text-white rounded-full text-xs font-bold shadow-2xs">
                              <Check className="w-3.5 h-3.5 text-emerald-300 stroke-[3]" />
                              {prod.confidence ? `${typeof prod.confidence === 'string' ? prod.confidence : 'Alta'} - Identificado por IA` : 'Alta - Identificado por IA'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-3.5 py-1 bg-[#fef3c7] text-[#b45309] border border-amber-200/80 rounded-full text-xs font-bold">
                              Novo Produto / Pronto para Cadastrar
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveDiscoveredProduct(prod.id)}
                              className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Remover este produto"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Main Content: Left Image Gallery, Right Details */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-6 items-start">
                          {/* Left Column: Image with Thumbnails */}
                          <div className="md:col-span-4 lg:col-span-3 flex flex-col items-center">
                            <div className="w-full aspect-square max-w-[220px] bg-white border border-slate-200 rounded-2xl p-2.5 flex items-center justify-center overflow-hidden shadow-2xs group relative">
                              {currentImg ? (
                                <img
                                  src={currentImg}
                                  alt={prod.standardizedName}
                                  className="max-w-full max-h-full object-contain group-hover:scale-105 transition duration-300"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full bg-slate-50 flex items-center justify-center text-slate-300">
                                  <ImageIcon className="w-12 h-12" />
                                </div>
                              )}
                            </div>

                            {/* Thumbnails Row */}
                            {images.length > 1 && (
                              <div className="flex items-center gap-2 mt-3 w-full max-w-[220px] justify-start overflow-x-auto pb-1">
                                {images.map((thumbUrl, tIdx) => (
                                  <button
                                    key={tIdx}
                                    type="button"
                                    onClick={() => handleSelectDiscoveredImage(prod.id, tIdx)}
                                    className={`w-12 h-12 rounded-xl border-2 p-0.5 bg-white shrink-0 overflow-hidden transition cursor-pointer flex items-center justify-center ${
                                      activeImgIndex === tIdx
                                        ? 'border-emerald-500 ring-2 ring-emerald-200 shadow-2xs scale-105'
                                        : 'border-slate-200 opacity-60 hover:opacity-100 hover:border-slate-300'
                                    }`}
                                  >
                                    <img src={thumbUrl} alt={`Thumbnail ${tIdx + 1}`} className="w-full h-full object-contain" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Right Column: Tags, Sub-specs, Title, Description, Specs Chips */}
                          <div className="md:col-span-8 lg:col-span-9 flex flex-col justify-between">
                            <div>
                              {/* Badges Row */}
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                {prod.brand && (
                                  <span className="px-3 py-1 bg-[#0f172a] text-white rounded-full text-xs font-bold shadow-2xs">
                                    {prod.brand}
                                  </span>
                                )}
                                {prod.manufacturer && (
                                  <span className="px-3 py-1 bg-[#1e293b] text-slate-100 rounded-full text-xs font-semibold shadow-2xs">
                                    Fab: {prod.manufacturer}
                                  </span>
                                )}
                                {prod.category && (
                                  <span className="px-2.5 py-1 text-slate-600 bg-slate-100 border border-slate-200/80 rounded-full text-xs font-medium">
                                    {prod.category}
                                  </span>
                                )}
                                {prod.partNumber && (
                                  <span className="px-3 py-1 bg-[#0b132b] text-indigo-100 font-mono rounded-full text-xs font-bold shadow-2xs">
                                    P/N: {prod.partNumber}
                                  </span>
                                )}
                              </div>

                              {/* Sub-specs Row (Mod, NCM, Peso) */}
                              <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs font-semibold text-slate-700 mt-2 mb-2">
                                {prod.model && (
                                  <span>Mod: <strong className="text-slate-900 font-bold">{prod.model}</strong></span>
                                )}
                                {prod.ncm && (
                                  <span>NCM: <strong className="text-slate-900 font-mono">{prod.ncm}</strong></span>
                                )}
                                {prod.weight && (
                                  <span>Peso: <strong className="text-slate-900">{prod.weight}</strong></span>
                                )}
                                {prod.dimensions && (
                                  <span>Dimensões: <strong className="text-slate-900">{prod.dimensions}</strong></span>
                                )}
                              </div>

                              {/* Title */}
                              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-snug mt-1 mb-2">
                                {prod.standardizedName}
                              </h3>

                              {/* Description */}
                              {prod.description && (
                                <p className="text-xs text-slate-600 leading-relaxed mb-3.5 whitespace-pre-line text-justify sm:text-left">
                                  {prod.description}
                                </p>
                              )}

                              {/* Technical Specifications Chips */}
                              {prod.specifications && prod.specifications.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-4">
                                  {prod.specifications.map((spec, sIdx) => (
                                    <div
                                      key={sIdx}
                                      className="bg-slate-100/90 border border-slate-200/70 rounded-lg px-2.5 py-1 text-[11px] text-slate-700 font-medium flex items-center gap-1 shadow-2xs"
                                    >
                                      <strong className="text-slate-900 font-semibold">{spec.label}:</strong>
                                      <span>{spec.value}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Bottom Bar: Suggested Price + Actions */}
                            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-auto">
                              {/* Price */}
                              <div>
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
                                  PREÇO SUGERIDO DE MERCADO
                                </span>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-2xl sm:text-3xl font-black text-emerald-600 font-mono tracking-tight">
                                    {prod.suggestedPrice && prod.suggestedPrice > 0
                                      ? `R$ ${prod.suggestedPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                      : (prod.costPrice && prod.costPrice > 0
                                        ? `R$ ${(prod.costPrice * 1.35).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        : 'Sob Consulta')}
                                  </span>
                                  {prod.costPrice && prod.costPrice > 0 && (
                                    <span className="text-xs text-slate-400 font-medium">
                                      (Custo aprox: R$ {prod.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Qty, Unit & Buttons */}
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
                                  <input
                                    type="number"
                                    min="1"
                                    value={prod.quantity || 1}
                                    onChange={(e) => handleUpdateDiscoveredProduct(prod.id, { quantity: parseInt(e.target.value, 10) || 1 })}
                                    className="w-12 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-xs font-bold text-slate-800 text-center focus:outline-none focus:border-emerald-500"
                                    title="Quantidade para a cotação"
                                  />
                                  <input
                                    type="text"
                                    value={prod.unit || 'Un.'}
                                    onChange={(e) => handleUpdateDiscoveredProduct(prod.id, { unit: e.target.value })}
                                    className="w-12 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-xs font-semibold text-slate-700 text-center focus:outline-none focus:border-emerald-500"
                                    title="Unidade"
                                  />
                                </div>

                                {/* Big Green Add to Quote Button */}
                                <button
                                  type="button"
                                  onClick={() => handleAddSingleDiscoveredToQuote(prod)}
                                  className="px-5 py-2.5 bg-gradient-to-r from-lime-600 via-emerald-600 to-green-600 hover:from-lime-500 hover:to-emerald-500 text-white rounded-xl text-xs sm:text-sm font-black transition shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer active:scale-98"
                                >
                                  <Plus className="w-4 h-4 stroke-[3]" />
                                  <span>+ Inserir na Cotação</span>
                                </button>

                                {/* Save to Catalog Button */}
                                <button
                                  type="button"
                                  onClick={() => handleSaveDiscoveredToCatalog(prod)}
                                  className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-2 cursor-pointer shadow-2xs"
                                  title="Salvar produto no catálogo para reutilizar"
                                >
                                  <Printer className="w-4 h-4 text-slate-500" />
                                  <span>Salvar no Catálogo</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── PAINEL DA FASE 2: RESULTADOS DE PREÇOS E ESPECIFICAÇÕES ─── */}
            {batchResults.length === 0 && !isScanningBatch && discoveredProducts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                <div className="p-4 bg-white rounded-3xl border border-slate-200 shadow-2xs mb-3">
                  <Sparkles className="w-8 h-8 text-indigo-600" />
                </div>
                <p className="text-sm font-bold text-slate-800 mb-1">Pesquisa Inteligente em 2 Fases (Padrão Infodesk Store)</p>
                <p className="text-xs text-slate-500 max-w-md leading-relaxed mb-4">
                  1. Cole acima o texto com dezenas de características técnicas, print ou foto e clique em <strong>1. Identificar Produto(s)</strong>.<br />
                  2. Com a descrição certinha deduzida pela IA, clique no botão da <strong>Fase 2</strong> para apurar preços ao vivo e especificações 360°.
                </p>
                <div className="flex items-center gap-2 text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Engenharia reversa com IA Gemini Vision & Search Grounding</span>
                </div>
              </div>
            ) : (batchResults.length > 0 || isScanningBatch) ? (
              <div className="space-y-3">
                {/* Results Sub-header with Margin Shortcuts & Filter */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-sky-600 transition"
                    >
                      {selectedResultIds.size === batchResults.length && batchResults.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-sky-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                      <span>Selecionar Todos ({selectedResultIds.size}/{batchResults.length})</span>
                    </button>
                  </div>

                  {/* Margem Rápida para Aplicação Automática com Campo Manual */}
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl">
                    <Percent className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[11px] font-bold text-slate-600">Margem Venda:</span>
                    {[20, 25, 30, 35].map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setTargetMarginPercent(prev => prev === m ? null : m)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                          targetMarginPercent === m
                            ? 'bg-sky-600 text-white shadow-xs'
                            : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-200'
                        }`}
                        title={`Lança o item na proposta já com ${m}% de margem calculada`}
                      >
                        +{m}%
                      </button>
                    ))}

                    {/* Campo Manual para digitação livre da margem */}
                    <div className="relative inline-flex items-center">
                      <input
                        type="number"
                        min="0"
                        max="200"
                        step="0.5"
                        placeholder="Outra"
                        value={targetMarginPercent !== null ? targetMarginPercent : ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            setTargetMarginPercent(null);
                          } else {
                            const num = parseFloat(val);
                            if (!isNaN(num)) {
                              setTargetMarginPercent(num);
                            }
                          }
                        }}
                        className={`w-14 bg-white border rounded-lg px-1.5 py-0.5 text-center text-xs font-bold text-slate-800 focus:outline-none transition ${
                          targetMarginPercent !== null && ![20, 25, 30, 35].includes(targetMarginPercent)
                            ? 'border-sky-500 ring-1 ring-sky-400 font-extrabold text-sky-700'
                            : 'border-slate-300 hover:border-slate-400'
                        }`}
                        title="Digite uma margem personalizada manualmente (ex: 22, 28.5, 40)"
                      />
                      <span className="text-[10px] text-slate-400 font-bold ml-0.5">%</span>
                    </div>

                    {targetMarginPercent !== null && (
                      <button
                        type="button"
                        onClick={() => setTargetMarginPercent(null)}
                        className="text-[11px] text-slate-400 hover:text-red-500 font-bold ml-1 transition p-0.5"
                        title="Limpar margem manual e voltar ao padrão"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Botão de Estilo de Capitalização estilo Microsoft Word */}
                  <div className="relative" ref={caseMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsCaseMenuOpen(prev => !prev)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 border cursor-pointer ${
                        isCaseMenuOpen
                          ? 'bg-sky-50 text-sky-700 border-sky-300 ring-2 ring-sky-200'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                      title="Maiúsculas/Minúsculas (estilo Microsoft Word): escolha como formatar a descrição dos itens encontrados"
                    >
                      <span className="font-serif font-bold text-xs tracking-tight text-sky-700 bg-sky-100 px-1 py-0.2 rounded">
                        Aa
                      </span>
                      <span className="hidden sm:inline">Maiúsculas / Minúsculas</span>
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>

                    {isCaseMenuOpen && (
                      <div className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl py-1.5 z-30 animate-in fade-in slide-in-from-top-1">
                        <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Formatar Descrições (Word)
                        </div>

                        <button
                          type="button"
                          onClick={() => handleApplyCaseToResults('sentence')}
                          className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-sky-50 transition ${
                            activeCaseStyle === 'sentence' ? 'font-bold text-sky-700 bg-sky-50/60' : 'text-slate-700'
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-semibold">Primeira da frase maiúscula</span>
                            <span className="text-[10px] text-slate-400">Ex: Teclado sem fio logitech k380</span>
                          </div>
                          {activeCaseStyle === 'sentence' && <Check className="w-4 h-4 text-sky-600 shrink-0" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleApplyCaseToResults('lowercase')}
                          className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-sky-50 transition ${
                            activeCaseStyle === 'lowercase' ? 'font-bold text-sky-700 bg-sky-50/60' : 'text-slate-700'
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-semibold">minúsculas</span>
                            <span className="text-[10px] text-slate-400">Ex: teclado sem fio logitech k380</span>
                          </div>
                          {activeCaseStyle === 'lowercase' && <Check className="w-4 h-4 text-sky-600 shrink-0" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleApplyCaseToResults('uppercase')}
                          className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-sky-50 transition ${
                            activeCaseStyle === 'uppercase' ? 'font-bold text-sky-700 bg-sky-50/60' : 'text-slate-700'
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-semibold">MAIÚSCULAS</span>
                            <span className="text-[10px] text-slate-400">Ex: TECLADO SEM FIO LOGITECH K380</span>
                          </div>
                          {activeCaseStyle === 'uppercase' && <Check className="w-4 h-4 text-sky-600 shrink-0" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleApplyCaseToResults('title')}
                          className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-sky-50 transition ${
                            activeCaseStyle === 'title' ? 'font-bold text-sky-700 bg-sky-50/60' : 'text-slate-700'
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-semibold">Primeira de Cada Palavra Maiúscula</span>
                            <span className="text-[10px] text-slate-400">Ex: Teclado Sem Fio Logitech K380</span>
                          </div>
                          {activeCaseStyle === 'title' && <Check className="w-4 h-4 text-sky-600 shrink-0" />}
                        </button>

                        {selectedResultIds.size > 0 && (
                          <div className="mt-1 pt-1.5 px-3 py-1 border-t border-slate-100 text-[10px] text-sky-600 font-medium">
                            Aplica nos {selectedResultIds.size} itens selecionados
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Filtro Rápido de Lojas */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSortFilterMode(prev => prev === 'lowestPrice' ? 'all' : 'lowestPrice')}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition flex items-center gap-1 border ${
                        sortFilterMode === 'lowestPrice'
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                      title="Ordenar pelo menor preço encontrado"
                    >
                      <DollarSign className="w-3 h-3" />
                      <span>Menor Preço</span>
                    </button>
                  </div>
                </div>

                {/* Cards / Table Rows */}
                <div className="space-y-2.5">
                  {(sortFilterMode === 'lowestPrice'
                    ? [...batchResults].sort((a, b) => {
                        if (a.bestPrice <= 0) return 1;
                        if (b.bestPrice <= 0) return -1;
                        return a.bestPrice - b.bestPrice;
                      })
                    : batchResults
                  ).map((item) => {
                    const isSelected = selectedResultIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        className={`bg-white border rounded-2xl p-4 transition shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${isSelected ? 'border-sky-400 ring-1 ring-sky-300 bg-sky-50/20' : 'border-slate-200 hover:border-slate-300'
                          }`}
                      >
                        {/* Checkbox & Product Info */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectResult(item.id)}
                            className="text-slate-400 hover:text-sky-600 transition shrink-0"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-sky-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300" />
                            )}
                          </button>

                          {/* Product Thumbnail */}
                          <div className="w-14 h-14 bg-white border border-slate-200 rounded-xl overflow-hidden shrink-0 flex items-center justify-center p-1 relative group">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.standardizedName}
                                className="w-full h-full object-contain group-hover:scale-110 transition duration-300"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-full h-full bg-slate-50 flex items-center justify-center rounded-lg text-slate-400">
                                <ImageIcon className="w-6 h-6 text-slate-300" />
                              </div>
                            )}
                          </div>

                          {/* Text Details */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {item.quantity && item.quantity > 1 && (
                                <span className="px-2 py-0.5 bg-sky-100 text-sky-800 border border-sky-200 rounded-lg text-[11px] font-extrabold font-mono shrink-0">
                                  {item.quantity}x
                                </span>
                              )}
                              <h4 className="text-xs font-bold text-slate-900 truncate">
                                {item.standardizedName}
                              </h4>
                              {item.status === 'exact' && (
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-bold">
                                  Exato
                                </span>
                              )}
                              {item.status === 'equivalent' && (
                                <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold">
                                  Equivalente
                                </span>
                              )}
                              {item.status === 'on_demand' && (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-[10px] font-bold">
                                  Sob Consulta
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 flex-wrap">
                              {item.partNumber && (
                                <span>
                                  <strong>PN:</strong> <code className="text-slate-700 font-mono">{item.partNumber}</code>
                                </span>
                              )}
                              {item.ncm && (
                                <span>
                                  <strong>NCM:</strong> <code className="text-slate-700 font-mono">{item.ncm}</code>
                                </span>
                              )}
                              <span>{item.observation}</span>
                            </div>
                            {item.description && (
                              <p className="text-[11px] text-slate-600 mt-1.5 line-clamp-2 italic leading-relaxed">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Price, Store & Buy Link */}
                        <div className="flex items-center gap-4 shrink-0 sm:border-l sm:border-slate-100 sm:pl-4 w-full sm:w-auto justify-between sm:justify-end">
                          <div className="text-right">
                            <div className="text-sm font-extrabold text-slate-900 font-mono">
                              {item.bestPrice > 0 ? (
                                <span className="text-emerald-700">{item.priceFormatted}</span>
                              ) : (
                                <span className="text-slate-400 font-normal">Sob orçamento</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              {item.store}
                            </div>
                            {/* Simulador de Venda com Margem */}
                            {item.bestPrice > 0 && targetMarginPercent !== null && (
                              <div className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded mt-0.5" title={`Custo R$ ${item.bestPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + ${targetMarginPercent}% de margem`}>
                                Venda: R$ {(item.bestPrice * (1 + targetMarginPercent / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            )}
                          </div>

                          {item.buyUrl && (
                            <a
                              href={item.buyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition shadow-2xs flex items-center gap-1 shrink-0"
                              title="Abrir página do produto"
                            >
                              <span>Comprar</span>
                              <ExternalLink className="w-3 h-3 text-sky-600" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {/* Batch Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between px-6">
            <div className="text-xs text-slate-600">
              {selectedResultIds.size > 0 ? (
                <span>
                  <strong>{selectedResultIds.size}</strong> itens selecionados para o orçamento.
                </span>
              ) : (
                <span>Selecione itens para adicionar à cotação.</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleApplyBatchToQuote}
                disabled={selectedResultIds.size === 0}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 disabled:opacity-50 rounded-xl text-xs font-semibold transition shadow-2xs flex items-center gap-1.5"
                title="Acrescenta os itens selecionados à cotação que já está aberta"
              >
                <Plus className="w-3.5 h-3.5 text-slate-500" />
                <span>Mesclar no Aberto</span>
              </button>
              <button
                type="button"
                onClick={handleStartNewQuoteFromBatch}
                disabled={selectedResultIds.size === 0}
                className="px-6 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer"
                title="Inicia uma cotação limpa do zero com esses produtos encontrados"
              >
                {addedSuccess ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                <span>{addedSuccess ? 'Orçamento Criado!' : `Criar Novo Orçamento (${selectedResultIds.size})`}</span>
              </button>
            </div>
          </div>
        </div>

        {/* MODAL DIALOG: EDIÇÃO DO TEXTO TRANSCRITO DA FOTO (OCR) */}
        {isOcrModalOpen && (
          <div
            className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          >
            <div
              className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      Produtos Identificados da Foto
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] rounded-full font-bold flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" /> IA Gemini Vision
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      O Gemini Vision identificou os produtos e quantidades da imagem. Revise antes de buscar os preços reais.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOcrModalOpen(false)}
                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-xs font-bold transition"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="p-5 flex-1 overflow-y-auto space-y-4">
                {ocrImagePreview && (
                  <div className="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <img
                      src={ocrImagePreview}
                      alt="Foto carregada"
                      className="w-16 h-16 object-cover rounded-lg border border-slate-300"
                    />
                    <div className="text-xs text-slate-600">
                      <p className="font-bold text-slate-800">Foto Processada com Sucesso</p>
                      <p className="text-[11px] text-slate-500">
                        Cada linha abaixo será tratada como um produto para a busca de preços. Edite ou apague livremente!
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Lista de Produtos Extraídos (1 por linha):
                  </label>
                  <textarea
                    rows={10}
                    value={ocrEditableText}
                    onChange={(e) => setOcrEditableText(e.target.value)}
                    placeholder="Cada linha representará um produto a ser cotado..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3 text-xs text-slate-900 font-mono focus:outline-none focus:border-sky-500 leading-relaxed"
                  />
                  <div className="flex justify-between items-center mt-1 text-[11px] text-slate-500">
                    <span>Linhas atuais: {ocrEditableText.split('\n').filter(l => l.trim()).length}</span>
                    <span>Dica: delete linhas de cabeçalho, totais ou ruídos da foto.</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 px-5">
                <button
                  type="button"
                  onClick={() => setIsOcrModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmOcrText}
                  className="px-5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Inserir na Lista de Cotação</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
