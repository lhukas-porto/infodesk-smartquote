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
  DollarSign,
  ArrowRight,
  Receipt
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

interface PriceScannerViewProps {
  onAddToQuote: (item: Partial<QuoteItem>) => void;
  onStartNewQuoteWithItems?: (items: Partial<QuoteItem>[]) => void;
  onSaveToCatalog: (prod: Product) => void;
  onNavigateToQuote?: () => void;
  quoteItemsCount?: number;
  initialQuery?: string;
  targetItemIndex?: number | null;
  onUpdateQuoteItem?: (index: number, updatedData: Partial<QuoteItem>) => void;
  existingItem?: Partial<QuoteItem> | null;
}

export const PriceScannerView: React.FC<PriceScannerViewProps> = ({
  onAddToQuote,
  onStartNewQuoteWithItems,
  onSaveToCatalog,
  onNavigateToQuote,
  quoteItemsCount = 0,
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

  useEffect(() => {
    if (initialQuery) {
      setBatchRawInput(initialQuery);
    }
  }, [initialQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (caseMenuRef.current && !caseMenuRef.current.contains(e.target as Node)) {
        setIsCaseMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAttachProductPhoto = (fileOrBlob: File | Blob) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setAttachedProductPhoto(dataUrl);
      showToast('Foto do produto anexada! A análise visual terá prioridade máxima.');
    };
    reader.readAsDataURL(fileOrBlob);
  };

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
        imageSource: attachedProductPhoto
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

  // Inserir produto identificado individualmente na cotação
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
      showToast('Item inserido na sua cotação!');
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
    showToast(`${discoveredProducts.length} itens inseridos na sua cotação!`);
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

  // Inserir itens da Fase 2 na cotação
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

    showToast(`${selected.length} item(ns) adicionado(s) à cotação!`);
  };

  // OCR
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
    <div className="w-full space-y-6 animate-fadeIn pb-12">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 bg-emerald-600 text-white text-xs sm:text-sm font-bold px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 animate-bounce">
          <Check className="w-5 h-5 stroke-[3]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header da Página Inteira */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-sky-500 to-indigo-600 text-white rounded-2xl shadow-sm shrink-0">
            <Search className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Scanner Inteligente de Preços & Ofertas 360°
              </h1>
              <span className="px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs rounded-full font-bold">
                IA & Web Search
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Pesquise produtos com fotos reais do e-commerce, menor preço de mercado e insira diretamente na sua cotação.
            </p>
          </div>
        </div>

        {onNavigateToQuote && (
          <button
            type="button"
            onClick={onNavigateToQuote}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer shrink-0 self-start md:self-auto"
            title="Voltar para a tela de cotação"
          >
            <span>Ver Cotação</span>
            {quoteItemsCount > 0 && (
              <span className="px-2 py-0.5 bg-sky-600 text-white text-[11px] rounded-full font-extrabold">
                {quoteItemsCount}
              </span>
            )}
            <ArrowRight className="w-4 h-4 text-slate-400" />
          </button>
        )}
      </div>

      {/* Card de Busca e Entrada */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-sky-600" />
            <span>Cole seus Produtos (texto, especificações ou cole um print com CTRL+V):</span>
          </label>
          <span className="text-xs text-slate-500 font-medium">
            {batchRawInput ? `${parsePastedProductList(batchRawInput).length} produto(s) identificado(s)` : 'Cole 1 item ou vários (1 por linha)'}
          </span>
        </div>

        {/* Preview da Foto Real Anexada do Produto (Prioridade Visual Máxima) */}
        {attachedProductPhoto && (
          <div className="flex items-center gap-3.5 p-3.5 bg-gradient-to-r from-sky-50 via-indigo-50/50 to-white border border-sky-300 rounded-2xl animate-fadeIn">
            <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-sky-300 shadow-xs bg-white shrink-0">
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
                  Foto de Referência do Produto Anexada
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                A foto dita o modelo real, grade, rodas e acabamento. O texto complementa dimensões e quantidades.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAttachedProductPhoto(null)}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
              title="Remover foto anexada"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="relative">
          <textarea
            rows={5}
            value={batchRawInput}
            onChange={(e) => setBatchRawInput(e.target.value)}
            onPaste={handleBatchAreaPaste}
            placeholder="Exemplo: Carrinho Plataforma Com Grade Móvel Profissional 300kg Preto... Você também pode dar CTRL+V de fotos ou prints direto aqui!"
            className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-4 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-mono leading-relaxed resize-y"
          />

          {/* Input oculto para anexar foto do produto (prioridade máxima) */}
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

          {/* Input oculto para OCR de documento/pedido */}
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
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => productPhotoInputRef.current?.click()}
              className="px-4 py-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs active:scale-98"
              title="Anexe uma foto do produto para prioridade visual absoluta na dedução"
            >
              <ImageIcon className="w-4 h-4" />
              <span>{attachedProductPhoto ? 'Trocar Foto do Produto' : 'Anexar Foto do Produto (Prioridade)'}</span>
            </button>

            <button
              type="button"
              onClick={() => imageUploadInputRef.current?.click()}
              disabled={isOcrProcessing}
              className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-2 cursor-pointer shadow-2xs"
              title="Carregue uma imagem ou print de pedido para transcrever automaticamente"
            >
              <Camera className="w-4 h-4 text-slate-500" />
              <span>{isOcrProcessing ? 'Transcrevendo...' : 'Ler Pedido OCR'}</span>
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
                className="text-xs text-slate-400 hover:text-slate-600 ml-2 cursor-pointer"
              >
                Limpar Tudo
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleStartPhase1Discovery}
            disabled={isDiscoveringPhase1 || isScanningBatch || (!batchRawInput.trim() && !attachedProductPhoto)}
            className="px-6 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs flex items-center gap-2 cursor-pointer active:scale-98"
          >
            <Sparkles className={`w-4 h-4 ${isDiscoveringPhase1 ? 'animate-spin' : ''}`} />
            <span>{isDiscoveringPhase1 ? 'Identificando Produto(s)...' : '1. Identificar Produto(s)'}</span>
          </button>
        </div>

        {/* OCR Processing Indicator */}
        {isOcrProcessing && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-3 animate-fadeIn">
            <Sparkles className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
            <div className="text-xs text-indigo-900 font-semibold">
              <span>{ocrProgressMessage || 'Transcrevendo foto do pedido via leitura ótica (OCR)...'}</span>
            </div>
          </div>
        )}

        {/* Phase 1 Processing Indicator */}
        {isDiscoveringPhase1 && (
          <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-3 animate-fadeIn">
            <Sparkles className="w-5 h-5 text-indigo-600 animate-spin shrink-0" />
            <div className="text-xs sm:text-sm text-indigo-900 font-semibold">
              <span>{phase1StatusMessage || 'Analisando características técnicas e buscando fotos reais...'}</span>
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

      {/* ─── PAINEL DE PRODUTOS IDENTIFICADOS 360° (PADRÃO INFODESK STORE) ─── */}
      {discoveredProducts.length > 0 && (
        <div className="space-y-4 animate-fadeIn">
          {/* Header de Ações Rápidas */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  Fase 1: Produtos Identificados e Catalogados 360°
                  <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs rounded-full font-extrabold">
                    {discoveredProducts.length} item(ns)
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Ficha técnica 360° com especificações, galeria de fotos reais e preços sugeridos de mercado.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {discoveredProducts.length > 1 && (
                <button
                  type="button"
                  onClick={handleAddAllDiscoveredToQuote}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>Inserir Todos ({discoveredProducts.length})</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleStartPhase2Enrichment}
                disabled={isScanningBatch}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-2xs active:scale-95"
                title="Varre lojas online para apurar preços reais e links de compra"
              >
                <Zap className={`w-4 h-4 text-amber-500 ${isScanningBatch ? 'animate-spin' : ''}`} />
                <span>{isScanningBatch ? 'Pesquisando Lojas...' : '2. Comparar Preços em Lojas (Fase 2)'}</span>
              </button>
            </div>
          </div>

          {/* LISTA DE CARDS 360° NO PADRÃO INFODESK STORE */}
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
                  {/* Top Badges Row */}
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

                        {/* Sub-specs Row (Mod, NCM, Peso, Dimensões) */}
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
                          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-3.5 whitespace-pre-line text-justify sm:text-left">
                            {prod.description}
                          </p>
                        )}

                        {/* Technical Specifications Chips */}
                        {prod.specifications && prod.specifications.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-4">
                            {prod.specifications.map((spec, sIdx) => (
                              <div
                                key={sIdx}
                                className="bg-slate-100/90 border border-slate-200/70 rounded-lg px-2.5 py-1 text-xs text-slate-700 font-medium flex items-center gap-1 shadow-2xs"
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

                          <button
                            type="button"
                            onClick={() => handleAddSingleDiscoveredToQuote(prod)}
                            className="px-5 py-2.5 bg-gradient-to-r from-lime-600 via-emerald-600 to-green-600 hover:from-lime-500 hover:to-emerald-500 text-white rounded-xl text-xs sm:text-sm font-black transition shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer active:scale-98"
                          >
                            <Plus className="w-4 h-4 stroke-[3]" />
                            <span>+ Inserir na Cotação</span>
                          </button>

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

      {/* ─── PAINEL DA FASE 2: RESULTADOS DE PREÇOS EM LOJAS ─── */}
      {batchResults.length > 0 && (
        <div className="space-y-3 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
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

            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Fase 2: Menor Preço e Ofertas em Lojas
              </h3>
              <span className="px-2.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-xs rounded-full font-bold">
                {batchResults.length} item(ns)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApplyBatchToQuote}
                disabled={selectedResultIds.size === 0}
                className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Inserir Selecionados na Cotação</span>
              </button>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            {batchResults.map((item) => {
              const isSelected = selectedResultIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`bg-white border rounded-2xl p-4 transition shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                    isSelected ? 'border-sky-400 ring-1 ring-sky-300 bg-sky-50/20' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
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

                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {item.standardizedName}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                        {item.partNumber && <span><strong>PN:</strong> <code className="text-slate-700">{item.partNumber}</code></span>}
                        {item.ncm && <span><strong>NCM:</strong> <code className="text-slate-700">{item.ncm}</code></span>}
                        <span>{item.observation}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 sm:border-l sm:border-slate-100 sm:pl-4 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-right">
                      <div className="text-sm sm:text-base font-extrabold text-slate-900 font-mono">
                        {item.bestPrice > 0 ? (
                          <span className="text-emerald-700">{item.priceFormatted}</span>
                        ) : (
                          <span className="text-slate-400 font-normal">Sob consulta</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-medium">
                        {item.store}
                      </div>
                    </div>

                    {item.buyUrl && (
                      <a
                        href={item.buyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition shadow-2xs flex items-center gap-1 shrink-0"
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
      )}

      {/* OCR MODAL DIALOG */}
      {isOcrModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                Produtos Identificados da Foto (OCR)
              </h3>
              <button
                type="button"
                onClick={() => setIsOcrModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {ocrImagePreview && (
                <div className="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <img src={ocrImagePreview} alt="Foto" className="w-16 h-16 object-cover rounded-lg border" />
                  <p className="text-xs text-slate-600">
                    Revise as linhas extraídas abaixo antes de buscar os preços:
                  </p>
                </div>
              )}
              <textarea
                rows={10}
                value={ocrEditableText}
                onChange={(e) => setOcrEditableText(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3 text-xs text-slate-900 font-mono focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 px-5">
              <button
                type="button"
                onClick={() => setIsOcrModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={handleConfirmOcrText}
                className="px-5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-xs"
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
