import React, { useState, useRef, useEffect } from 'react';
import {
  Package,
  X,
  ZoomIn,
  ImagePlus,
  Search,
  Truck,
  Calculator,
  ExternalLink,
  Save,
  Check,
  Sparkles,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { Product } from '../types';
import {
  extractStoreNameFromUrl,
  getCategoryFromNcm,
  normalizeToOfficialCategory,
  OFFICIAL_CATEGORIES
} from '../utils/aiEmailParser';
import { CreatableCombobox } from './CreatableCombobox';
import { validateNcm, formatNcm } from '../utils/ncmValidator';
import { compressImageDataUrl } from '../utils/imageCompressor';
import { WebImagePickerModal } from './WebImagePickerModal';
import { getSettings } from '../utils/storage';
import { fetchProductSpecsOnline } from '../services/specSearchService';

export interface ProductEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Partial<Product> | null;
  onSave: (product: Product, shippingCost: number) => void;
  availableUnits: string[];
  onAddUnit?: (newUnit: string) => void;
  availableCategories: string[];
  onAddCategory?: (newCategory: string) => void;
  title?: string;
  subtitle?: string;
  badgeText?: string;
  initialShippingCost?: number;
  showShippingFields?: boolean;
  dailyDollarRate?: number;
  saveButtonText?: string;
  saveButtonTitle?: string;
}

const formatCurrencyPtBr = (value: number | undefined | null): string => {
  if (value === undefined || value === null || isNaN(value)) return '0,00';
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parsePtBrNumber = (str: string): number => {
  if (!str) return 0;
  const sanitized = str.toString().trim().replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(sanitized);
  return isNaN(parsed) ? 0 : parsed;
};

const extractImageFromClipboard = async (clipboardData: DataTransfer | null): Promise<string | null> => {
  if (clipboardData) {
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
    } catch {
      // ignore clipboard permission error
    }
  }
  return null;
};

export const ProductEditModal: React.FC<ProductEditModalProps> = ({
  isOpen,
  onClose,
  product,
  onSave,
  availableUnits,
  onAddUnit,
  availableCategories,
  onAddCategory,
  title = 'Dados do Produto',
  subtitle = 'Revise os dados comerciais, foto e descrição. Depois de salvar o produto já entrará na base de dados.',
  badgeText,
  initialShippingCost = 0,
  showShippingFields = true,
  dailyDollarRate,
  saveButtonText = 'Salvar',
  saveButtonTitle = 'Salva na base de Produtos'
}) => {
  const [draft, setDraft] = useState<Partial<Product>>(() => product || {});
  const [dollarInput, setDollarInput] = useState<string>('');
  const [costInput, setCostInput] = useState<string>('');
  const [shippingInput, setShippingInput] = useState<string>('');

  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string } | null>(null);
  const [isWebImagePickerOpen, setIsWebImagePickerOpen] = useState(false);
  const [isSearchingSpecs, setIsSearchingSpecs] = useState(false);
  const [specsMessage, setSpecsMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const effectiveDollarRate = Number(dailyDollarRate) > 0 ? Number(dailyDollarRate) : (getSettings().dailyDollarRate || 5.60);

  // Garante que todas as 15 categorias oficiais do Infodesk SmartQuote estejam sempre disponíveis
  const allCategoryOptions = React.useMemo(() => {
    const list = Array.from(new Set([
      ...OFFICIAL_CATEGORIES,
      ...(availableCategories || [])
    ])).filter(Boolean);
    return list.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [availableCategories]);

  const wasOpenRef = useRef<boolean>(false);
  const lastOpenedProductIdRef = useRef<string | null>(null);

  // Sincroniza estado inicial APENAS quando o modal abre pela primeira vez ou quando o produto selecionado realmente mudar
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }

    const currentProdId = product?.id || product?.sku || product?.name || null;
    const isFirstOpen = !wasOpenRef.current;
    const isDifferentProduct = currentProdId !== lastOpenedProductIdRef.current;

    if (isFirstOpen || isDifferentProduct) {
      wasOpenRef.current = true;
      lastOpenedProductIdRef.current = currentProdId;

      const initialCat = product?.category ? normalizeToOfficialCategory(product.category) : 'Diversos & Sazonais';
      setDraft({
        ...(product || {}),
        category: initialCat
      });
      const initialCost = product?.costPrice !== undefined ? product.costPrice : 0;
      setCostInput(initialCost > 0 ? formatCurrencyPtBr(initialCost) : '0,00');

      const initialDollar = (product as any)?.dollarPrice;
      setDollarInput(initialDollar && initialDollar > 0 ? formatCurrencyPtBr(initialDollar) : '');

      const resolvedShipping = initialShippingCost !== undefined && initialShippingCost > 0
        ? initialShippingCost
        : (product?.shippingCost || 0);
      setShippingInput(resolvedShipping > 0 ? formatCurrencyPtBr(resolvedShipping) : '0,00');

      setZoomedImage(null);
      setIsWebImagePickerOpen(false);
    }
  }, [isOpen, product, initialShippingCost]);

  // Conversão de Dólar para Real
  const handleDollarChange = (val: string) => {
    setDollarInput(val);
    const parsedDollar = parsePtBrNumber(val);
    if (parsedDollar > 0) {
      const calculatedCostBrl = Number((parsedDollar * effectiveDollarRate).toFixed(2));
      setCostInput(formatCurrencyPtBr(calculatedCostBrl));
      setDraft(prev => ({
        ...prev,
        dollarPrice: parsedDollar,
        costPrice: calculatedCostBrl
      }));
    } else {
      setDraft(prev => ({
        ...prev,
        dollarPrice: undefined
      }));
    }
  };

  const handleDollarBlur = () => {
    const parsedDollar = parsePtBrNumber(dollarInput);
    if (parsedDollar > 0) {
      setDollarInput(formatCurrencyPtBr(parsedDollar));
      const calculatedCostBrl = Number((parsedDollar * effectiveDollarRate).toFixed(2));
      setCostInput(formatCurrencyPtBr(calculatedCostBrl));
      setDraft(prev => ({
        ...prev,
        dollarPrice: parsedDollar,
        costPrice: calculatedCostBrl
      }));
    } else {
      setDollarInput('');
      setDraft(prev => ({
        ...prev,
        dollarPrice: undefined
      }));
    }
  };

  // Captura global de Ctrl+V quando o modal está aberto
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalPaste = async (e: ClipboardEvent) => {
      const dataUrl = await extractImageFromClipboard(e.clipboardData);
      if (dataUrl) {
        e.preventDefault();
        e.stopPropagation();
        setDraft(prev => ({ ...prev, imageUrl: dataUrl }));
      }
    };

    window.addEventListener('paste', handleGlobalPaste, true);
    return () => window.removeEventListener('paste', handleGlobalPaste, true);
  }, [isOpen]);

  // Upload local de imagem
  const handleTriggerImageUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawUrl = event.target?.result as string;
      if (rawUrl) {
        const compressed = await compressImageDataUrl(rawUrl);
        setDraft(prev => ({ ...prev, imageUrl: compressed }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePasteImage = async (e: React.ClipboardEvent) => {
    const dataUrl = await extractImageFromClipboard(e.clipboardData);
    if (dataUrl) {
      e.preventDefault();
      e.stopPropagation();
      setDraft(prev => ({ ...prev, imageUrl: dataUrl }));
    }
  };

  const handleSearchSpecificationsOnline = async () => {
    const productName = (draft.name || '').trim();
    if (!productName) {
      alert('Por favor, informe ao menos o Nome Padronizado do produto antes de buscar as especificações com IA.');
      return;
    }

    setIsSearchingSpecs(true);
    setSpecsMessage(null);
    try {
      const result = await fetchProductSpecsOnline({
        productName,
        brand: draft.supplier,
        partNumber: draft.partNumber || draft.sku,
        category: draft.category
      });

      setDraft(prev => ({
        ...prev,
        description: result.description || prev.description,
        ncm: (prev.ncm && prev.ncm.trim().length >= 8) ? prev.ncm : (result.ncm || prev.ncm || ''),
        partNumber: prev.partNumber?.trim() ? prev.partNumber : (result.partNumber || ''),
        sku: prev.sku?.trim() ? prev.sku : (result.partNumber || prev.sku || ''),
        category: (!prev.category || prev.category === 'Diversos & Sazonais') && result.category
          ? normalizeToOfficialCategory(result.category)
          : prev.category,
        supplier: (!prev.supplier || !prev.supplier.trim()) && result.brand
          ? result.brand
          : prev.supplier
      }));

      setSpecsMessage({
        text: 'Ficha técnica 360° gerada com sucesso pela IA (especificações ricas, NCM e categoria)!',
        type: 'success'
      });
      setTimeout(() => setSpecsMessage(null), 5000);
    } catch (err: any) {
      console.warn('Erro ao buscar especificações técnicas na web:', err);
      setSpecsMessage({
        text: err?.message || 'Não foi possível consultar as especificações com IA neste momento.',
        type: 'error'
      });
      setTimeout(() => setSpecsMessage(null), 6000);
    } finally {
      setIsSearchingSpecs(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!draft.name || !draft.name.trim()) {
      alert('Por favor, informe ao menos o Nome do Produto.');
      return;
    }

    const unifiedCode = (draft.sku || draft.partNumber || '').trim();
    const parsedCost = parsePtBrNumber(costInput);
    const parsedShipping = parsePtBrNumber(shippingInput);
    const parsedDollar = parsePtBrNumber(dollarInput);

    const finalProd: Product = {
      id: draft.id || `prod-${Date.now()}`,
      sku: unifiedCode || draft.sku || '',
      partNumber: unifiedCode || draft.partNumber || '',
      ncm: (draft.ncm || '').trim(),
      name: draft.name.trim(),
      description: draft.description || '',
      category: normalizeToOfficialCategory(draft.category || 'Diversos & Sazonais'),
      costPrice: parsedCost,
      dollarPrice: parsedDollar > 0 ? parsedDollar : undefined,
      unit: draft.unit || 'Un.',
      supplier: draft.supplier || 'Fornecedor Web / Mercado',
      stock: draft.stock !== undefined ? Number(draft.stock) : 10,
      lastUpdated: new Date().toISOString().split('T')[0],
      sourceUrl: draft.sourceUrl || '',
      imageUrl: draft.imageUrl || '',
      shippingCost: parsedShipping
    };

    onSave(finalProd, parsedShipping);
  };

  if (!isOpen) return null;

  const currentCostVal = parsePtBrNumber(costInput) || Number(draft.costPrice) || 0;
  const currentShippingVal = parsePtBrNumber(shippingInput) || 0;
  const currentTotalCostVal = currentCostVal + currentShippingVal;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
        <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn">
          
          {/* Header */}
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-sky-100 text-sky-700 rounded-xl">
                <Package className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>{title}</span>
                  {badgeText && (
                    <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-[10px] rounded-full font-bold">
                      {badgeText}
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {subtitle}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-xs font-bold transition cursor-pointer"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form com Footer Fixo/Flutuante */}
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1 custom-scrollbar">
              
              {/* Foto Preview & Nome */}
              <div className="flex items-start gap-4 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div
                    tabIndex={0}
                    onClick={() => {
                      if (draft.imageUrl) {
                        setZoomedImage({
                          url: draft.imageUrl,
                          title: draft.name || 'Produto'
                        });
                      } else {
                        handleTriggerImageUpload();
                      }
                    }}
                    onPaste={handlePasteImage}
                    title={
                      draft.imageUrl
                        ? "Clique para ver a foto com ZOOM (ou aperte Ctrl+V para colar outra foto)"
                        : "Clique para escolher foto do produto ou aperte Ctrl+V para colar foto copiada"
                    }
                    className={`w-16 h-16 rounded-xl overflow-hidden shrink-0 flex items-center justify-center p-1 cursor-pointer transition relative group/cimg select-none focus:outline-none focus:ring-2 focus:ring-sky-400 ${
                      draft.imageUrl
                        ? 'bg-white border border-slate-300 hover:border-sky-500 shadow-2xs'
                        : 'border-2 border-dashed border-sky-300 bg-sky-50 hover:bg-sky-100 hover:border-sky-500'
                    }`}
                  >
                    {draft.imageUrl ? (
                      <>
                        <img
                          src={draft.imageUrl}
                          alt={draft.name || 'Produto'}
                          className="w-full h-full object-contain group-hover/cimg:scale-105 transition duration-200"
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />
                        <div className="absolute inset-0 bg-sky-950/50 opacity-0 group-hover/cimg:opacity-100 transition flex items-center justify-center text-white backdrop-blur-[0.5px]">
                          <ZoomIn className="w-5 h-5 text-white drop-shadow-sm" />
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
                    onClick={() => setIsWebImagePickerOpen(true)}
                    title="Pesquisar fotos para este produto e escolher qual usar"
                    className="px-2 py-0.5 rounded text-[9.5px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs flex items-center gap-1 transition cursor-pointer"
                  >
                    <Search className="w-3 h-3" />
                    Buscar Foto
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700">
                      Nome Padronizado *
                    </label>
                  </div>

                  <input
                    ref={nameInputRef}
                    type="text"
                    required
                    value={draft.name || ''}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    onPaste={handlePasteImage}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition shadow-2xs text-xs sm:text-sm"
                  />
                </div>
              </div>

              {/* Especificações Técnicas */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-700">
                    Especificações Técnicas
                  </label>
                  <button
                    type="button"
                    onClick={handleSearchSpecificationsOnline}
                    disabled={isSearchingSpecs || !draft.name?.trim()}
                    title="Consultar a IA para gerar a ficha técnica completa 360° do produto (mesma riqueza de informações do Scanner IA)"
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 shadow-2xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    {isSearchingSpecs ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                        <span>Gerando Ficha Técnica...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                        <span>Buscar Especificações (IA)</span>
                      </>
                    )}
                  </button>
                </div>

                {specsMessage && (
                  <div className={`mb-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-semibold flex items-center gap-1.5 animate-fadeIn ${
                    specsMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}>
                    {specsMessage.type === 'success' ? (
                      <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                    )}
                    <span>{specsMessage.text}</span>
                  </div>
                )}

                <textarea
                  rows={5}
                  value={draft.description || ''}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="w-full min-h-[110px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 focus:bg-white focus:outline-none focus:border-sky-500 text-xs transition leading-relaxed resize-y"
                />
              </div>

              {/* Código / SKU / Part Number e NCM */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Código / SKU / Part Number / Modelo
                  </label>
                  <input
                    type="text"
                    value={draft.sku || draft.partNumber || ''}
                    onChange={(e) => setDraft({ ...draft, sku: e.target.value, partNumber: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700">
                      NCM Fiscal
                    </label>
                    {draft.ncm && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        validateNcm(draft.ncm).isKnown
                          ? 'bg-emerald-100 text-emerald-800'
                          : validateNcm(draft.ncm).isValid
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {validateNcm(draft.ncm).isKnown
                          ? 'Oficial TI'
                          : validateNcm(draft.ncm).isValid
                          ? '8 Dígitos'
                          : 'Incompleto'}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={draft.ncm || ''}
                    onChange={(e) => {
                      const formatted = formatNcm(e.target.value);
                      const autoCategory = getCategoryFromNcm(formatted);
                      setDraft(prev => ({
                        ...prev,
                        ncm: formatted,
                        // Só infere categoria automaticamente a partir do NCM se o usuário ainda não tiver escolhido uma categoria específica
                        category: (!prev.category || prev.category === 'Diversos & Sazonais' || prev.category === 'Geral') && autoCategory
                          ? normalizeToOfficialCategory(autoCategory)
                          : prev.category
                      }));
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-sky-500 text-xs"
                  />
                  {draft.ncm && validateNcm(draft.ncm).description && (
                    <p className="text-[10px] text-emerald-700 font-medium mt-1 truncate" title={validateNcm(draft.ncm).description}>
                      ✓ {validateNcm(draft.ncm).description}
                    </p>
                  )}
                </div>
              </div>

              {/* Preço em Dólar, Preço de Custo, Frete Unitário, Custo Total e Unidade */}
              <div className={`grid grid-cols-1 ${showShippingFields ? 'sm:grid-cols-5' : 'sm:grid-cols-3'} gap-3 items-start`}>
                <div className="flex flex-col">
                  <label className="h-8 flex items-end justify-center sm:justify-start text-[11px] font-bold text-slate-700 mb-1.5 leading-tight">
                    <span>Preço em Dólar (US$)</span>
                  </label>
                  <input
                    type="text"
                    value={dollarInput}
                    onFocus={() => {
                      const parsed = parsePtBrNumber(dollarInput);
                      if (parsed <= 0) {
                        setDollarInput('');
                      }
                    }}
                    onChange={(e) => handleDollarChange(e.target.value)}
                    onBlur={handleDollarBlur}
                    title={`Preço em dólar americano (Cotação atual: R$ ${effectiveDollarRate.toFixed(2).replace('.', ',')})`}
                    className="w-full h-10 bg-slate-50 border border-slate-300 rounded-xl px-3 text-slate-900 font-mono font-bold focus:outline-none focus:border-sky-500 text-xs text-center"
                  />
                  {effectiveDollarRate > 0 && (
                    <p className="text-[9px] text-slate-400 text-center mt-1 font-medium truncate" title="Cotação do dia definida nas Configurações">
                      US$ = R$ {effectiveDollarRate.toFixed(2).replace('.', ',')}
                    </p>
                  )}
                </div>

                <div className="flex flex-col">
                  <label className="h-8 flex items-end justify-center sm:justify-start text-[11px] font-bold text-slate-700 mb-1.5 leading-tight">
                    <span>Preço de Custo (R$) *</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={costInput}
                    onFocus={() => {
                      if ((draft.costPrice || 0) <= 0) {
                        setCostInput('');
                      }
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCostInput(val);
                      const parsed = parsePtBrNumber(val);
                      setDraft(prev => ({ ...prev, costPrice: parsed }));
                    }}
                    onBlur={() => {
                      const parsed = parsePtBrNumber(costInput);
                      setDraft(prev => ({ ...prev, costPrice: parsed }));
                      setCostInput(formatCurrencyPtBr(parsed));
                    }}
                    className="w-full h-10 bg-slate-50 border border-slate-300 rounded-xl px-3 text-slate-900 font-mono font-bold focus:outline-none focus:border-sky-500 text-xs text-center"
                  />
                </div>

                {showShippingFields && (
                  <div className="flex flex-col">
                    <label className="h-8 flex items-end justify-center sm:justify-start gap-1 text-[11px] font-bold text-slate-700 mb-1.5 leading-tight">
                      <Truck className="w-3.5 h-3.5 text-amber-600 shrink-0 mb-0.5" />
                      <span>Frete Unitário (R$)</span>
                    </label>
                    <input
                      type="text"
                      value={shippingInput}
                      onFocus={() => {
                        const parsed = parsePtBrNumber(shippingInput);
                        if (parsed <= 0) {
                          setShippingInput('');
                        }
                      }}
                      onChange={(e) => {
                        setShippingInput(e.target.value);
                      }}
                      onBlur={() => {
                        const parsed = parsePtBrNumber(shippingInput);
                        setShippingInput(parsed > 0 ? formatCurrencyPtBr(parsed) : '0,00');
                        setDraft(prev => ({ ...prev, shippingCost: parsed }));
                      }}
                      title="Frete unitário a ser aplicado neste item no orçamento"
                      className="w-full h-10 bg-slate-50 border border-slate-300 rounded-xl px-3 text-slate-900 font-mono font-bold focus:outline-none focus:border-amber-500 focus:bg-white text-xs text-center"
                    />
                  </div>
                )}

                {showShippingFields && (
                  <div className="flex flex-col">
                    <label className="h-8 flex items-end justify-center sm:justify-start gap-1 text-[11px] font-bold text-slate-700 mb-1.5 leading-tight">
                      <Calculator className="w-3.5 h-3.5 text-sky-600 shrink-0 mb-0.5" />
                      <span>Custo Total (R$)</span>
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={formatCurrencyPtBr(currentTotalCostVal)}
                      title="Custo total unitário: Preço de Custo + Frete Unitário"
                      className="w-full h-10 bg-slate-100/90 border border-slate-300 rounded-xl px-3 text-slate-900 font-mono font-bold text-xs text-center cursor-default select-all focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex flex-col">
                  <label className="h-8 flex items-end justify-center sm:justify-start text-[11px] font-bold text-slate-700 mb-1.5 leading-tight">
                    <span>Unidade</span>
                  </label>
                  <CreatableCombobox
                    value={draft.unit || 'Un.'}
                    onChange={(val) => {
                      const finalVal = val.trim() || 'Un.';
                      setDraft(prev => ({ ...prev, unit: finalVal }));
                      // onAddUnit só é chamado pelo onAddOption (ao confirmar a nova entrada)
                    }}
                    options={availableUnits}
                    onAddOption={(newUnit) => {
                      if (onAddUnit) onAddUnit(newUnit);
                    }}
                    defaultValue="Un."
                    textAlign="center"
                    inputClassName="h-10 font-bold font-mono"
                  />
                </div>
              </div>

              {/* Categoria e Fornecedor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <div className="flex flex-col">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                    Categoria
                  </label>
                  <CreatableCombobox
                    value={draft.category || 'Diversos & Sazonais'}
                    onChange={(val) => {
                      setDraft(prev => ({ ...prev, category: val }));
                    }}
                    options={allCategoryOptions}
                    onAddOption={(newCat) => {
                      const finalCat = normalizeToOfficialCategory(newCat);
                      setDraft(prev => ({ ...prev, category: finalCat }));
                      if (onAddCategory) onAddCategory(finalCat);
                    }}
                    defaultValue="Diversos & Sazonais"
                    textAlign="left"
                    inputClassName="h-10"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                    Fornecedor
                  </label>
                  <input
                    type="text"
                    value={draft.supplier || ''}
                    onChange={(e) => setDraft({ ...draft, supplier: e.target.value })}
                    className="w-full h-10 bg-slate-50 border border-slate-300 rounded-xl px-3 text-slate-900 focus:outline-none focus:border-sky-500 text-xs"
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
                    value={draft.sourceUrl || ''}
                    onChange={(e) => {
                      const newUrl = e.target.value;
                      const detectedStore = extractStoreNameFromUrl(newUrl);
                      setDraft(prev => ({
                        ...prev,
                        sourceUrl: newUrl,
                        supplier: detectedStore || prev.supplier
                      }));
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-[11px] focus:outline-none focus:border-sky-500"
                  />
                  {draft.sourceUrl && (
                    <a
                      href={draft.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer"
                      title="Testar Link"
                    >
                      <ExternalLink className="w-4 h-4 text-sky-600" />
                    </a>
                  )}
                </div>
              </div>

            </div>

            {/* Footer de Ações Flutuante / Fixo na base */}
            <div className="p-4 border-t border-slate-200 bg-white/95 backdrop-blur-xs flex items-center justify-between gap-2 shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] z-10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-semibold transition text-xs cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-xs hover:shadow-md transition flex items-center gap-2 cursor-pointer text-xs sm:text-sm active:scale-[0.98]"
                title={saveButtonTitle}
              >
                <Save className="w-4 h-4 text-white" />
                <span>{saveButtonText}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Input de arquivo invisível para upload de foto local */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* Modal de Zoom da Foto no Meio da Tela */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div 
            className="relative bg-white rounded-3xl pt-6 pb-7 px-6 sm:px-8 shadow-2xl max-w-md sm:max-w-lg w-full flex flex-col items-center animate-scaleIn border border-slate-100/80"
          >
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="absolute top-4 right-4 text-stone-500 hover:text-stone-800 transition p-1 cursor-pointer"
              title="Fechar (Esc)"
            >
              <X className="w-5 h-5 stroke-[2.2]" />
            </button>

            <div className="text-center px-4 pt-1 pb-5 w-full">
              <h2 className="text-base sm:text-lg font-black text-[#261f18] uppercase tracking-wide leading-tight font-sans">
                {zoomedImage.title}
              </h2>
              <p className="text-[11px] sm:text-xs font-bold text-[#5c3e1e] uppercase tracking-widest mt-1.5 font-sans">
                ESPECIFICAÇÃO TÉCNICA
              </p>
            </div>

            <div className="relative w-72 h-72 sm:w-84 sm:h-84 md:w-96 md:h-96 rounded-2xl overflow-hidden border-[3px] border-[#e59b12] shadow-md bg-white flex items-center justify-center p-3 my-2">
              <img
                src={zoomedImage.url}
                alt={zoomedImage.title}
                className="max-w-full max-h-full object-contain rounded-xl select-none"
              />
            </div>

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

      {/* Modal de Busca e Escolha de Foto Comercial na Web */}
      {isWebImagePickerOpen && (
        <WebImagePickerModal
          isOpen={true}
          onClose={() => setIsWebImagePickerOpen(false)}
          productName={draft.name || ''}
          currentImageUrl={draft.imageUrl || ''}
          onSelectImage={(newUrl) => {
            setDraft(prev => ({ ...prev, imageUrl: newUrl }));
            setIsWebImagePickerOpen(false);
          }}
        />
      )}
    </>
  );
};
