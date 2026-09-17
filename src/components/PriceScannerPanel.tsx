import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Sparkles,
  Plus,
  Check,
  ExternalLink,
  Image as ImageIcon,
  Camera,
  FileText,
  X,
  Percent,
  ChevronDown,
  Trash2,
  Zap,
  CheckCircle2,
  Printer,
  ListChecks,
  CheckSquare,
  Square,
  DollarSign
} from 'lucide-react';
import { extractDataFromQuotationImage } from '../services/imageQuoteParser';
import { Product, QuoteItem } from '../types';
import {
  cleanAlphanumericCode,
  cleanNcmCode,
  applyTextCase,
  WordCaseStyle
} from '../utils/aiEmailParser';
import {
  DiscoveredProduct,
  ScannedPriceResult,
  BatchScanProgress,
  parsePastedProductList,
  runBatchPhase2Scan,
  phase1DiscoverProductsFromText
} from '../services/priceScannerService';

interface PriceScannerPanelProps {
  onClose: () => void;
  onAddToQuote: (item: Partial<QuoteItem>) => void;
  onStartNewQuoteWithItems?: (items: Partial<QuoteItem>[]) => void;
  onSaveToCatalog: (prod: Product) => void;
  initialQuery?: string;
  targetItemIndex?: number | null;
  onUpdateQuoteItem?: (index: number, updatedData: Partial<QuoteItem>) => void;
  existingItem?: Partial<QuoteItem> | null;
}

export const PriceScannerPanel: React.FC<PriceScannerPanelProps> = ({
  onClose,
  onAddToQuote,
  onStartNewQuoteWithItems,
  onSaveToCatalog,
  initialQuery = '',
  targetItemIndex = null,
  onUpdateQuoteItem,
  existingItem = null
}) => {
  // Batch / Search Input
  const [batchRawInput, setBatchRawInput] = useState(initialQuery);
  const [isScanningBatch, setIsScanningBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchScanProgress | null>(null);
  const [batchResults, setBatchResults] = useState<ScannedPriceResult[]>([]);
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(new Set());

  // Fase 1: Dedução Técnica 360° (Padrão Infodesk Store)
  const [discoveredProducts, setDiscoveredProducts] = useState<DiscoveredProduct[]>([]);
  const [isDiscoveringPhase1, setIsDiscoveringPhase1] = useState(false);
  const [phase1StatusMessage, setPhase1StatusMessage] = useState('');

  // OCR Image Transcription State
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrProgressMessage, setOcrProgressMessage] = useState('');
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [ocrEditableText, setOcrEditableText] = useState('');
  const [ocrImagePreview, setOcrImagePreview] = useState<string | null>(null);
  const imageUploadInputRef = useRef<HTMLInputElement>(null);

  // Foto Real do Produto com Prioridade Visual Máxima (Desejo do Comprador)
  const [attachedProductPhoto, setAttachedProductPhoto] = useState<string | null>(null);
  const productPhotoInputRef = useRef<HTMLInputElement>(null);

  // Success Feedback Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Margem e Filtros
  const [targetMarginPercent, setTargetMarginPercent] = useState<number | null>(null);
  const [sortFilterMode, setSortFilterMode] = useState<'all' | 'lowestPrice'>('all');
  const [isCaseMenuOpen, setIsCaseMenuOpen] = useState(false);
  const [activeCaseStyle, setActiveCaseStyle] = useState<WordCaseStyle>('sentence');
  const caseMenuRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  const handleAttachProductPhoto = (fileOrBlob: File | Blob) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setAttachedProductPhoto(dataUrl);
      showToast('Foto do produto anexada! A análise visual terá prioridade máxima.');
    };
    reader.readAsDataURL(fileOrBlob);
  };

  // When initialQuery changes, update input
  useEffect(() => {
    if (initialQuery) {
      setBatchRawInput(initialQuery);
    }
  }, [initialQuery]);

  // Click outside for case menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (caseMenuRef.current && !caseMenuRef.current.contains(e.target as Node)) {
        setIsCaseMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── FASE 1: Identificar Produto(s) com Dedução e Engenharia Reversa ──────────
  const handleStartPhase1Discovery = async () => {
    if (!batchRawInput.trim() && !attachedProductPhoto) return;

    setIsDiscoveringPhase1(true);
    setPhase1StatusMessage(
      attachedProductPhoto
        ? 'Examinando foto com prioridade visual máxima + especificações do texto...'
        : 'Analisando características técnicas e buscando fotos reais...'
    );
    setBatchResults([]);
    setSelectedResultIds(new Set());

    try {
      const discovered = await phase1DiscoverProductsFromText(batchRawInput, {
        imageSource: attachedProductPhoto || undefined
      });
      setDiscoveredProducts(discovered);
      if (discovered.length > 0) {
        showToast(
          attachedProductPhoto
            ? 'Produto deduzido com fidelidade máxima à foto!'
            : `${discovered.length} produto(s) identificado(s) com sucesso!`
        );
      }
    } catch (err) {
      console.error('Erro na Fase 1 (Dedução de Produtos):', err);
      alert('Não foi possível identificar os produtos. Verifique o texto/foto e tente novamente.');
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
      showToast(`Preços apurados para ${results.length} item(ns)!`);
    } catch (err) {
      console.error('Erro na Fase 2 (Enriquecimento e Preços):', err);
    } finally {
      setIsScanningBatch(false);
    }
  };

  const handleUpdateDiscoveredProduct = (id: string, updates: Partial<DiscoveredProduct>) => {
    setDiscoveredProducts(prev => prev.map(p => (p.id === id ? { ...p, ...updates } : p)));
  };

  const handleRemoveDiscoveredProduct = (id: string) => {
    setDiscoveredProducts(prev => prev.filter(p => p.id !== id));
  };

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

  // Inserir produto identificado individualmente na cotação ao lado
  const handleAddSingleDiscoveredToQuote = (prod: DiscoveredProduct) => {
    const chosenImage = prod.images?.[prod.selectedImageIndex || 0] || prod.imageUrl || '';
    const price = prod.suggestedPrice || (prod.costPrice ? prod.costPrice * 1.35 : 0);
    const cost = prod.costPrice || (prod.suggestedPrice ? prod.suggestedPrice / 1.35 : 0);

    const itemData: Partial<QuoteItem> = {
      name: prod.standardizedName,
      description: prod.description || prod.standardizedName,
      partNumber: cleanAlphanumericCode(prod.partNumber || ''),
      ncm: cleanNcmCode(prod.ncm || ''),
      imageUrl: chosenImage,
      showImage: !!chosenImage,
      costPrice: cost > 0 ? cost : price,
      unitPrice: price > 0 ? price : undefined,
      quantity: prod.quantity || 1,
      unit: prod.unit || 'Un.'
    };

    if (targetItemIndex !== null && onUpdateQuoteItem) {
      onUpdateQuoteItem(targetItemIndex, itemData);
      showToast('Item atualizado na cotação!');
    } else {
      onAddToQuote(itemData);
      showToast('Item inserido na cotação ao lado!');
    }
  };

  // Salvar produto no catálogo
  const handleSaveDiscoveredToCatalog = (prod: DiscoveredProduct) => {
    const chosenImage = prod.images?.[prod.selectedImageIndex || 0] || prod.imageUrl || '';
    const price = prod.suggestedPrice || (prod.costPrice ? prod.costPrice * 1.35 : 0);
    const cost = prod.costPrice || (prod.suggestedPrice ? prod.suggestedPrice / 1.35 : 0);

    const newProd: Product = {
      id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      sku: cleanAlphanumericCode(prod.partNumber || '') || `INF-${Date.now().toString().slice(-4)}`,
      partNumber: cleanAlphanumericCode(prod.partNumber || ''),
      ncm: cleanNcmCode(prod.ncm || ''),
      name: prod.standardizedName,
      description: prod.description || `Part Number: ${cleanAlphanumericCode(prod.partNumber || '')} | NCM: ${cleanNcmCode(prod.ncm || '')}`,
      category: prod.category || 'Informática & Tecnologia',
      costPrice: cost > 0 ? Number(cost.toFixed(2)) : Number(price.toFixed(2)),
      unit: prod.unit || 'Un.',
      supplier: prod.brand || 'Infodesk Store',
      stock: 10,
      lastUpdated: new Date().toISOString().split('T')[0],
      sourceUrl: '',
      imageUrl: chosenImage
    };

    onSaveToCatalog(newProd);
    showToast('Produto salvo no catálogo!');
  };

  // Inserir todos os identificados na cotação
  const handleAddAllDiscoveredToQuote = () => {
    discoveredProducts.forEach(prod => {
      handleAddSingleDiscoveredToQuote(prod);
    });
    showToast(`${discoveredProducts.length} itens inseridos na cotação!`);
  };

  // Checkbox seleção na Fase 2
  const handleToggleSelectResult = (id: string) => {
    setSelectedResultIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  // Inserir itens da Fase 2 na cotação aberta
  const handleApplyBatchToQuote = () => {
    const selected = batchResults.filter(r => selectedResultIds.has(r.id));
    if (selected.length === 0) return;

    selected.forEach(item => {
      const margin = targetMarginPercent !== null ? targetMarginPercent : 35;
      const cost = item.bestPrice > 0 ? item.bestPrice : 0;
      const unitPrice = cost > 0 ? Number((cost * (1 + margin / 100)).toFixed(2)) : undefined;

      onAddToQuote({
        name: item.standardizedName,
        description: item.description || item.standardizedName,
        partNumber: cleanAlphanumericCode(item.partNumber || ''),
        ncm: cleanNcmCode(item.ncm || ''),
        imageUrl: item.imageUrl || '',
        showImage: !!item.imageUrl,
        costPrice: cost,
        unitPrice,
        quantity: item.quantity || 1,
        unit: 'Un.',
        supplier: item.store || 'Pesquisa Web',
        sourceUrl: item.buyUrl || ''
      });
    });

    showToast(`${selected.length} item(ns) inserido(s) na cotação ao lado!`);
  };

  // Processar imagem via OCR
  const handleProcessImageForOcr = async (fileOrBlob: File | Blob) => {
    setIsOcrProcessing(true);
    setOcrProgressMessage('Carregando imagem...');
    try {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        setOcrImagePreview(url);
        setAttachedProductPhoto(url);
      };
      reader.readAsDataURL(fileOrBlob);
    } catch {
      // preview fail is non-fatal
    }

    try {
      const extracted = await extractDataFromQuotationImage(fileOrBlob as File, (pct, msg) => {
        setOcrProgressMessage(msg);
      });

      if (extracted.items && extracted.items.length > 0) {
        const formattedLines = extracted.items.map(it => {
          const qtyPart = it.quantity && it.quantity > 1 ? ` | Qtd: ${it.quantity} ${it.unit || 'Un.'}` : '';
          const codePart = it.partNumber ? ` [Ref: ${it.partNumber}]` : '';

          let cleanName = (it.name || '').trim();
          let extraDesc = '';
          if (it.description && it.description.trim() && it.description.trim().toLowerCase() !== cleanName.toLowerCase()) {
            const desc = it.description.trim();
            if (!desc.toLowerCase().startsWith(cleanName.toLowerCase()) && !cleanName.toLowerCase().startsWith(desc.toLowerCase())) {
              extraDesc = ` ${desc}`;
            }
          }

          const combined = `${cleanName}${extraDesc}`
            .replace(/,/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

          return `${combined}${codePart}${qtyPart}`.trim();
        });

        setOcrEditableText(formattedLines.join('\n'));
        setIsOcrModalOpen(true);
      } else {
        alert('Não foi possível identificar produtos na imagem. Tente uma foto mais nítida.');
      }
    } catch (err) {
      console.error('Erro na extração visual:', err);
      alert('Não foi possível ler a imagem. Tente novamente.');
    } finally {
      setIsOcrProcessing(false);
      setOcrProgressMessage('');
    }
  };

  const handleBatchAreaPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(it => it.type.startsWith('image/'));
    if (imgItem) {
      e.preventDefault();
      const blob = imgItem.getAsFile();
      if (blob) {
        handleAttachProductPhoto(blob);
      }
    }
  };

  const handleConfirmOcrText = () => {
    if (ocrEditableText.trim()) {
      setBatchRawInput(prev => {
        if (!prev.trim()) return ocrEditableText.trim();
        return `${prev.trim()}\n${ocrEditableText.trim()}`;
      });
    }
    if (ocrImagePreview) {
      setAttachedProductPhoto(ocrImagePreview);
      showToast('Texto inserido e Foto Anexada com Prioridade Visual Ativa!');
    }
    setIsOcrModalOpen(false);
  };

  const handleApplyCaseToResults = (style: WordCaseStyle) => {
    setActiveCaseStyle(style);
    setBatchResults(prev => prev.map(item => {
      const applyToThis = selectedResultIds.size === 0 || selectedResultIds.has(item.id);
      if (!applyToThis) return item;
      return {
        ...item,
        standardizedName: applyTextCase(item.standardizedName, style),
        description: item.description ? applyTextCase(item.description, style) : item.description
      };
    }));
    setDiscoveredProducts(prev => prev.map(p => ({
      ...p,
      standardizedName: applyTextCase(p.standardizedName, style),
      description: p.description ? applyTextCase(p.description, style) : p.description
    })));
    setIsCaseMenuOpen(false);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-lg flex flex-col h-[calc(100vh-6.5rem)] max-h-[calc(100vh-6.5rem)] overflow-hidden transition-all">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 text-center animate-fadeIn shrink-0 flex items-center justify-center gap-2 shadow-sm">
          <Check className="w-4 h-4 stroke-[3]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header do Painel Lateral */}
      <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-sky-50/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-gradient-to-br from-sky-500 to-indigo-600 text-white rounded-xl shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-2">
              Scanner de Preços & 360°
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] rounded-full font-bold">
                IA & Web
              </span>
            </h2>
            <p className="text-[11px] text-slate-500">
              Busca com fotos reais e insere na cotação ao lado
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-xs font-bold transition cursor-pointer"
          title="Minimizar scanner lateral"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Input e Controles Superiores */}
      <div className="p-3.5 border-b border-slate-200 bg-white space-y-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5 text-sky-600" />
            <span>Cole o produto ou lista (texto ou print com CTRL+V):</span>
          </label>
          <span className="text-[10px] text-slate-400 font-medium">
            {batchRawInput ? `${parsePastedProductList(batchRawInput).length} item(ns)` : '1 ou vários'}
          </span>
        </div>

        {/* Preview da Foto Real Anexada do Produto (Prioridade Visual Máxima) */}
        {attachedProductPhoto && (
          <div className="flex items-center gap-2.5 p-2 bg-gradient-to-r from-sky-50 to-indigo-50/50 border border-sky-300 rounded-xl animate-fadeIn">
            <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-sky-300 shadow-2xs bg-white shrink-0">
              <img
                src={attachedProductPhoto}
                alt="Foto do Produto"
                className="w-full h-full object-contain p-0.5"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-1.5 py-0.5 bg-sky-600 text-white text-[9px] font-black uppercase rounded">
                  📷 Prioridade Visual
                </span>
                <span className="text-[11px] font-bold text-slate-800 truncate">
                  Foto do Produto Anexada
                </span>
              </div>
              <p className="text-[10px] text-slate-500 truncate mt-0.5">
                O modelo da foto dita chassi, grade e rodas com peso máximo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAttachedProductPhoto(null)}
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
              title="Remover foto"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="relative">
          <textarea
            rows={3}
            value={batchRawInput}
            onChange={(e) => setBatchRawInput(e.target.value)}
            onPaste={handleBatchAreaPaste}
            placeholder="Ex: Carrinho Plataforma 300kg com grade móvel preto, ou dê CTRL+V da foto direto aqui..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-mono leading-relaxed resize-y"
          />

          {/* Input oculto para foto de referência do produto (prioridade máxima) */}
          <input
            type="file"
            ref={productPhotoInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleAttachProductPhoto(file);
              }
              e.target.value = '';
            }}
          />

          {/* Input oculto para OCR de pedidos/tabelas */}
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

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => productPhotoInputRef.current?.click()}
              className="px-2.5 py-1.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-98"
              title="Anexe uma foto do produto para prioridade visual absoluta na dedução"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>{attachedProductPhoto ? 'Trocar Foto' : 'Foto (Prioridade)'}</span>
            </button>

            <button
              type="button"
              onClick={() => imageUploadInputRef.current?.click()}
              disabled={isOcrProcessing}
              className="px-2 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer shadow-2xs"
              title="Carregue uma imagem ou print de pedido para transcrever automaticamente"
            >
              <Camera className="w-3 h-3 text-slate-500" />
              <span>{isOcrProcessing ? 'Lendo...' : 'OCR'}</span>
            </button>

            {(batchRawInput || attachedProductPhoto || discoveredProducts.length > 0 || batchResults.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setBatchRawInput('');
                  setAttachedProductPhoto(null);
                  setDiscoveredProducts([]);
                  setBatchResults([]);
                  setSelectedResultIds(new Set());
                }}
                className="text-[10px] text-slate-400 hover:text-slate-600 px-1.5 py-1 cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleStartPhase1Discovery}
            disabled={isDiscoveringPhase1 || isScanningBatch || (!batchRawInput.trim() && !attachedProductPhoto)}
            className="px-3.5 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-98"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isDiscoveringPhase1 ? 'animate-spin' : ''}`} />
            <span>{isDiscoveringPhase1 ? 'Identificando...' : '1. Identificar'}</span>
          </button>
        </div>

        {/* OCR Processing Indicator */}
        {isOcrProcessing && (
          <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-2 animate-fadeIn">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-spin shrink-0" />
            <span className="text-[11px] text-indigo-900 font-medium truncate">
              {ocrProgressMessage || 'Transcrevendo foto do pedido via OCR...'}
            </span>
          </div>
        )}

        {/* Phase 1 Processing Indicator */}
        {isDiscoveringPhase1 && (
          <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-2 animate-fadeIn">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-spin shrink-0" />
            <span className="text-[11px] text-indigo-900 font-medium truncate">
              {phase1StatusMessage || 'Analisando características e buscando fotos reais...'}
            </span>
          </div>
        )}

        {/* Progress Bar da Fase 2 */}
        {isScanningBatch && batchProgress && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1 animate-fadeIn">
            <div className="flex items-center justify-between text-[11px] text-emerald-800 font-semibold">
              <span className="truncate">{batchProgress.currentProduct}</span>
              <span>{batchProgress.current}/{batchProgress.total}</span>
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

      {/* Área Central Rolável com os Cards 360° e Resultados */}
      <div className="flex-1 overflow-y-auto p-3.5 bg-slate-50/60 space-y-4">
        {/* FASE 1: PRODUTOS IDENTIFICADOS 360° */}
        {discoveredProducts.length > 0 && (
          <div className="space-y-3.5 animate-fadeIn">
            {/* Header de Ações Rápidas */}
            <div className="flex items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                Produtos Identificados ({discoveredProducts.length})
              </span>

              <div className="flex items-center gap-1.5">
                {discoveredProducts.length > 1 && (
                  <button
                    type="button"
                    onClick={handleAddAllDiscoveredToQuote}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold transition shadow-2xs flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3 stroke-[3]" />
                    <span>Inserir Todos</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleStartPhase2Enrichment}
                  disabled={isScanningBatch}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer"
                  title="Varre lojas online para comparar preços"
                >
                  <Zap className={`w-3 h-3 text-amber-500 ${isScanningBatch ? 'animate-spin' : ''}`} />
                  <span>{isScanningBatch ? 'Pesquisando...' : 'Fase 2: Lojas'}</span>
                </button>
              </div>
            </div>

            {/* LISTA DE CARDS 360° */}
            <div className="space-y-3.5">
              {discoveredProducts.map((prod) => {
                const images = prod.images && prod.images.length > 0 ? prod.images : [prod.imageUrl || ''];
                const activeImgIndex = prod.selectedImageIndex ?? 0;
                const currentImg = images[activeImgIndex] || images[0] || '';

                return (
                  <div
                    key={prod.id}
                    className="bg-white border-2 border-emerald-400/40 hover:border-emerald-500/70 rounded-2xl p-3.5 shadow-2xs space-y-3 transition"
                  >
                    {/* Top Badges */}
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded-full text-[10px] font-semibold">
                          <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                          IA Gemini
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#064e3b] text-white rounded-full text-[10px] font-bold">
                          <Check className="w-2.5 h-2.5 text-emerald-300 stroke-[3]" />
                          Identificado
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveDiscoveredProduct(prod.id)}
                        className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="Remover"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Image & Thumbnails */}
                    <div className="flex flex-col items-center">
                      <div className="w-full aspect-square max-w-[180px] bg-white border border-slate-200 rounded-xl p-2 flex items-center justify-center overflow-hidden shadow-2xs group relative">
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
                            <ImageIcon className="w-10 h-10" />
                          </div>
                        )}
                      </div>

                      {/* Thumbnails Row */}
                      {images.length > 1 && (
                        <div className="flex items-center gap-1.5 mt-2 w-full max-w-[220px] justify-center overflow-x-auto pb-1">
                          {images.map((thumbUrl, tIdx) => (
                            <button
                              key={tIdx}
                              type="button"
                              onClick={() => handleSelectDiscoveredImage(prod.id, tIdx)}
                              className={`w-9 h-9 rounded-lg border-2 p-0.5 bg-white shrink-0 overflow-hidden transition cursor-pointer flex items-center justify-center ${
                                activeImgIndex === tIdx
                                  ? 'border-emerald-500 ring-2 ring-emerald-200 shadow-2xs scale-105'
                                  : 'border-slate-200 opacity-60 hover:opacity-100 hover:border-slate-300'
                              }`}
                            >
                              <img src={thumbUrl} alt={`Thumb ${tIdx + 1}`} className="w-full h-full object-contain" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Metadata & Title */}
                    <div>
                      <div className="flex flex-wrap items-center gap-1 mb-1.5">
                        {prod.brand && (
                          <span className="px-2 py-0.5 bg-[#0f172a] text-white rounded-md text-[10px] font-bold">
                            {prod.brand}
                          </span>
                        )}
                        {prod.category && (
                          <span className="px-2 py-0.5 text-slate-600 bg-slate-100 border border-slate-200/80 rounded-md text-[10px] font-medium">
                            {prod.category}
                          </span>
                        )}
                        {prod.partNumber && (
                          <span className="px-2 py-0.5 bg-[#0b132b] text-indigo-100 font-mono rounded-md text-[10px] font-bold">
                            P/N: {prod.partNumber}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold text-slate-600 mb-1.5">
                        {prod.model && <span>Mod: <strong className="text-slate-900">{prod.model}</strong></span>}
                        {prod.ncm && <span>NCM: <strong className="text-slate-900 font-mono">{prod.ncm}</strong></span>}
                        {prod.weight && <span>Peso: <strong className="text-slate-900">{prod.weight}</strong></span>}
                      </div>

                      <h3 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight leading-snug mb-1.5">
                        {prod.standardizedName}
                      </h3>

                      {prod.description && (
                        <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-3 mb-2">
                          {prod.description}
                        </p>
                      )}

                      {/* Specs Chips */}
                      {prod.specifications && prod.specifications.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2.5">
                          {prod.specifications.slice(0, 6).map((spec, sIdx) => (
                            <div
                              key={sIdx}
                              className="bg-slate-100 border border-slate-200/70 rounded-md px-1.5 py-0.5 text-[10px] text-slate-700 flex items-center gap-1"
                            >
                              <strong className="text-slate-900 font-semibold">{spec.label}:</strong>
                              <span>{spec.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Preço e Botão Inserir na Cotação */}
                    <div className="pt-2.5 border-t border-slate-100 flex flex-col gap-2">
                      <div className="flex items-baseline justify-between">
                        <div>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                            PREÇO SUGERIDO
                          </span>
                          <span className="text-lg font-black text-emerald-600 font-mono tracking-tight">
                            {prod.suggestedPrice && prod.suggestedPrice > 0
                              ? `R$ ${prod.suggestedPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : (prod.costPrice && prod.costPrice > 0
                                ? `R$ ${(prod.costPrice * 1.35).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : 'Sob Consulta')}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                          <input
                            type="number"
                            min="1"
                            value={prod.quantity || 1}
                            onChange={(e) => handleUpdateDiscoveredProduct(prod.id, { quantity: parseInt(e.target.value, 10) || 1 })}
                            className="w-10 bg-white border border-slate-200 rounded px-1 py-0.5 text-[11px] font-bold text-slate-800 text-center focus:outline-none"
                            title="Quantidade"
                          />
                          <input
                            type="text"
                            value={prod.unit || 'Un.'}
                            onChange={(e) => handleUpdateDiscoveredProduct(prod.id, { unit: e.target.value })}
                            className="w-10 bg-white border border-slate-200 rounded px-1 py-0.5 text-[11px] font-semibold text-slate-700 text-center focus:outline-none"
                            title="Unidade"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddSingleDiscoveredToQuote(prod)}
                          className="col-span-2 py-2 bg-gradient-to-r from-lime-600 via-emerald-600 to-green-600 hover:from-lime-500 hover:to-emerald-500 text-white rounded-xl text-xs font-black transition shadow-sm hover:shadow flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
                          <span>+ Inserir na Cotação</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSaveDiscoveredToCatalog(prod)}
                          className="col-span-2 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-[11px] font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-400" />
                          <span>Salvar no Catálogo</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* FASE 2: RESULTADOS DE PREÇOS EM LOJAS */}
        {batchResults.length > 0 && (
          <div className="space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-sky-600"
              >
                {selectedResultIds.size === batchResults.length ? (
                  <CheckSquare className="w-3.5 h-3.5 text-sky-600" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>Sel. Todos ({selectedResultIds.size}/{batchResults.length})</span>
              </button>

              <button
                type="button"
                onClick={handleApplyBatchToQuote}
                disabled={selectedResultIds.size === 0}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3 stroke-[3]" />
                <span>Inserir Selecionados</span>
              </button>
            </div>

            <div className="space-y-2">
              {batchResults.map(item => {
                const isSelected = selectedResultIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`bg-white border rounded-xl p-2.5 transition shadow-2xs flex items-center justify-between gap-2.5 ${
                      isSelected ? 'border-sky-400 ring-1 ring-sky-300 bg-sky-50/20' : 'border-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleSelectResult(item.id)}
                      className="text-slate-400 hover:text-sky-600 shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-sky-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300" />
                      )}
                    </button>

                    <div className="w-10 h-10 bg-white border border-slate-200 rounded-lg overflow-hidden shrink-0 flex items-center justify-center p-0.5">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.standardizedName} className="w-full h-full object-contain" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-slate-300" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="text-[11px] font-bold text-slate-900 truncate">
                        {item.standardizedName}
                      </h4>
                      <div className="text-[10px] text-slate-500 truncate">
                        {item.store || 'Loja Online'} • {item.partNumber || item.ncm || ''}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-emerald-700 font-mono">
                        {item.bestPrice > 0 ? item.priceFormatted : 'Sob consulta'}
                      </div>
                      {item.buyUrl && (
                        <a
                          href={item.buyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-sky-600 hover:underline inline-flex items-center gap-0.5"
                        >
                          <span>Ver</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {discoveredProducts.length === 0 && batchResults.length === 0 && !isDiscoveringPhase1 && !isScanningBatch && (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-4 text-slate-400 space-y-2">
            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs">
              <Sparkles className="w-6 h-6 text-indigo-500" />
            </div>
            <p className="text-xs font-bold text-slate-700">
              Cole acima qualquer produto ou pedido
            </p>
            <p className="text-[11px] text-slate-400 max-w-[240px] leading-relaxed">
              O scanner deduz o modelo, busca fotos reais de e-commerce e insere direto na sua proposta ao lado.
            </p>
          </div>
        )}
      </div>

      {/* MODAL OCR REVISÃO (quando carregar foto de pedido) */}
      {isOcrModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn">
            <div className="p-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-600" />
                Produtos Identificados da Foto
              </h3>
              <button
                type="button"
                onClick={() => setIsOcrModalOpen(false)}
                className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              {ocrImagePreview && (
                <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <img src={ocrImagePreview} alt="Foto" className="w-12 h-12 object-cover rounded border" />
                  <p className="text-[11px] text-slate-600">
                    Edite o texto abaixo se necessário:
                  </p>
                </div>
              )}
              <textarea
                rows={8}
                value={ocrEditableText}
                onChange={(e) => setOcrEditableText(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOcrModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg font-semibold"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={handleConfirmOcrText}
                className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                Inserir no Scanner
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
