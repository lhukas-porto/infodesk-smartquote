import React, { useState, useRef, useEffect } from 'react';
import {
  Package,
  X,
  ZoomIn,
  ImagePlus,
  Search,
  ChevronDown,
  Layers,
  Truck,
  Calculator,
  ExternalLink,
  Save,
  Check
} from 'lucide-react';
import { Product } from '../types';
import {
  applyTextCase,
  getNextTextCase,
  getWordOrSelectionRange,
  mergeSelectedRanges,
  applyCaseToRanges,
  WordCaseStyle,
  extractStoreNameFromUrl,
  getCategoryFromNcm,
  normalizeToOfficialCategory
} from '../utils/aiEmailParser';
import { CreatableCombobox } from './CreatableCombobox';
import { validateNcm, formatNcm } from '../utils/ncmValidator';
import { compressImageDataUrl } from '../utils/imageCompressor';
import { WebImagePickerModal } from './WebImagePickerModal';
import { getSettings } from '../utils/storage';

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
  title = 'Verificação Geral do Produto',
  subtitle = 'Revise os dados comerciais, foto e descrição. Depois de salvar o produto já entrará na base de dados.',
  badgeText = 'Proposta & Produtos',
  initialShippingCost = 0,
  showShippingFields = true,
  dailyDollarRate,
  saveButtonText = 'Salvar',
  saveButtonTitle = 'Salvar alterações no produto'
}) => {
  const [draft, setDraft] = useState<Partial<Product>>(() => product || {});
  const [dollarInput, setDollarInput] = useState<string>('');
  const [costInput, setCostInput] = useState<string>('');
  const [shippingInput, setShippingInput] = useState<string>('');

  const [selectedWordRanges, setSelectedWordRanges] = useState<Array<{ start: number; end: number }>>([]);
  const [isCaseMenuOpen, setIsCaseMenuOpen] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string } | null>(null);
  const [isWebImagePickerOpen, setIsWebImagePickerOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const caseMenuRef = useRef<HTMLDivElement>(null);

  const effectiveDollarRate = Number(dailyDollarRate) > 0 ? Number(dailyDollarRate) : (getSettings().dailyDollarRate || 5.60);

  // Sincroniza estado inicial sempre que o modal abre ou o produto fornecido muda
  useEffect(() => {
    if (isOpen && product) {
      setDraft({ ...product });
      const initialCost = product.costPrice !== undefined ? product.costPrice : 0;
      setCostInput(initialCost > 0 ? formatCurrencyPtBr(initialCost) : '0,00');

      const initialDollar = (product as any)?.dollarPrice;
      setDollarInput(initialDollar && initialDollar > 0 ? formatCurrencyPtBr(initialDollar) : '');

      const resolvedShipping = initialShippingCost !== undefined && initialShippingCost > 0
        ? initialShippingCost
        : (product.shippingCost || 0);
      setShippingInput(resolvedShipping > 0 ? formatCurrencyPtBr(resolvedShipping) : '0,00');

      setSelectedWordRanges([]);
      setIsCaseMenuOpen(false);
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

  // Fecha o menu de casos ao clicar fora
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

  // Alterna ou aplica Maiúsculas/Minúsculas no nome
  const handleApplyNameCase = (targetStyle?: WordCaseStyle) => {
    if (!draft.name) return;
    const input = nameInputRef.current;
    const fullText = draft.name;

    // 1. Se existem palavras selecionadas com Ctrl (estilo Word)
    if (selectedWordRanges.length > 0) {
      const firstRange = selectedWordRanges[0];
      const firstPart = fullText.substring(firstRange.start, firstRange.end);
      const styleToApply = targetStyle || getNextTextCase(firstPart);

      const { newText, newRanges } = applyCaseToRanges(fullText, selectedWordRanges, styleToApply);

      setDraft(prev => ({ ...prev, name: newText }));
      setSelectedWordRanges(newRanges);
      setIsCaseMenuOpen(false);

      setTimeout(() => {
        if (input) input.focus();
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

    setDraft(prev => ({ ...prev, name: newFullText }));
    setIsCaseMenuOpen(false);

    setTimeout(() => {
      if (input) {
        input.focus();
        input.setSelectionRange(start, start + transformedPart.length);
      }
    }, 0);
  };

  const handleInputMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const fullText = input.value;

    if (e.ctrlKey) {
      if (end > start) {
        const newRange = { start, end };
        setSelectedWordRanges(prev => {
          const isExact = prev.some(r => r.start === start && r.end === end);
          if (isExact) {
            return prev.filter(r => !(r.start === start && r.end === end));
          }
          return mergeSelectedRanges([...prev, newRange]);
        });
      } else {
        const { start: wordStart, end: wordEnd } = getWordOrSelectionRange(fullText, start, end);
        if (wordEnd > wordStart) {
          setSelectedWordRanges(prev => {
            const exists = prev.some(r => Math.max(r.start, wordStart) < Math.min(r.end, wordEnd));
            if (exists) {
              return prev.filter(r => !(Math.max(r.start, wordStart) < Math.min(r.end, wordEnd)));
            }
            return mergeSelectedRanges([...prev, { start: wordStart, end: wordEnd }]);
          });
        }
      }
    } else {
      if (selectedWordRanges.length > 0) {
        setSelectedWordRanges([]);
      }
    }
  };

  const handleInputDoubleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const input = e.currentTarget;
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      const fullText = input.value;
      const { start: wordStart, end: wordEnd } = getWordOrSelectionRange(fullText, start, end);
      if (wordEnd > wordStart) {
        setSelectedWordRanges(prev => {
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
      sku: unifiedCode || draft.sku || `INF-${Date.now().toString().slice(-4)}`,
      partNumber: unifiedCode,
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
                      Nome Padronizado Comercial *
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 hover:border-sky-300 shadow-2xs">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleApplyNameCase()}
                          className="inline-flex items-center gap-1 text-slate-700 hover:text-sky-700 hover:bg-sky-50 px-2 py-1 rounded-l-lg font-bold text-[10px] transition cursor-pointer active:scale-95 select-none"
                          title="Alternar maiúsculas/minúsculas da palavra sob o cursor, das palavras selecionadas ou do nome todo"
                        >
                          <span className="font-serif font-bold text-[11px] leading-none text-sky-700">Aa</span>
                          <span className="text-[10px] font-medium text-slate-700">Mudar Caso</span>
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setIsCaseMenuOpen(prev => !prev)}
                          className="px-1.5 py-1 border-l border-slate-200 hover:bg-sky-50 text-slate-500 hover:text-sky-700 rounded-r-lg transition cursor-pointer active:scale-95"
                          title="Escolher estilo de maiúsculas/minúsculas específico"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>

                        {isCaseMenuOpen && (
                          <div
                            ref={caseMenuRef}
                            className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                          >
                            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
                              Formatar Trecho / Palavras
                            </div>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleApplyNameCase('sentence')}
                              className="w-full px-3 py-1.5 text-left text-xs hover:bg-sky-50 text-slate-700 flex flex-col transition cursor-pointer"
                            >
                              <span className="font-semibold text-slate-800">Primeira da frase maiúscula</span>
                              <span className="text-[10px] text-slate-400">Ex: Teclado sem fio logitech k380</span>
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleApplyNameCase('lowercase')}
                              className="w-full px-3 py-1.5 text-left text-xs hover:bg-sky-50 text-slate-700 flex flex-col transition cursor-pointer"
                            >
                              <span className="font-semibold text-slate-800">minúsculas</span>
                              <span className="text-[10px] text-slate-400">Ex: teclado sem fio logitech k380</span>
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleApplyNameCase('uppercase')}
                              className="w-full px-3 py-1.5 text-left text-xs hover:bg-sky-50 text-slate-700 flex flex-col transition cursor-pointer"
                            >
                              <span className="font-semibold text-slate-800">MAIÚSCULAS</span>
                              <span className="text-[10px] text-slate-400">Ex: TECLADO SEM FIO LOGITECH K380</span>
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleApplyNameCase('title')}
                              className="w-full px-3 py-1.5 text-left text-xs hover:bg-sky-50 text-slate-700 flex flex-col transition cursor-pointer"
                            >
                              <span className="font-semibold text-slate-800">Primeira de Cada Palavra Maiúscula</span>
                              <span className="text-[10px] text-slate-400">Ex: Teclado Sem Fio Logitech K380</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="relative w-full">
                    {/* Camada visual de destaque sincronizada para seleção com Ctrl (estilo Word) */}
                    <div
                      ref={backdropRef}
                      aria-hidden="true"
                      className="absolute inset-0 px-3 py-2 text-transparent font-semibold pointer-events-none overflow-hidden whitespace-pre font-sans text-sm select-none border border-transparent flex items-center"
                    >
                      {renderBackdropHighlights(draft.name || '', selectedWordRanges)}
                    </div>
                    <input
                      ref={nameInputRef}
                      type="text"
                      required
                      value={draft.name || ''}
                      onChange={(e) => {
                        setDraft({ ...draft, name: e.target.value });
                        if (selectedWordRanges.length > 0) setSelectedWordRanges([]);
                      }}
                      onMouseUp={handleInputMouseUp}
                      onDoubleClick={handleInputDoubleClick}
                      onScroll={(e) => {
                        if (backdropRef.current) {
                          backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
                        }
                      }}
                      onPaste={handlePasteImage}
                      placeholder="Nome completo do produto sem traços ou vírgulas"
                      className="w-full bg-transparent border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:border-sky-500 relative z-10"
                    />
                  </div>

                  {/* Badges de palavras selecionadas com Ctrl */}
                  {selectedWordRanges.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-bold">
                        <Layers className="w-3 h-3 text-sky-600" />
                        <span>
                          {selectedWordRanges.length}{' '}
                          {selectedWordRanges.length === 1 ? 'palavra selecionada com Ctrl' : 'palavras selecionadas com Ctrl'}:
                        </span>
                      </div>
                      {selectedWordRanges.map((range, idx) => {
                        const wordText = (draft.name || '').substring(range.start, range.end);
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100/90 border border-sky-300 text-sky-900 text-[11px] font-bold shadow-2xs"
                          >
                            <span>{wordText}</span>
                            <button
                              type="button"
                              onClick={() => setSelectedWordRanges(prev => prev.filter((_, i) => i !== idx))}
                              className="hover:text-red-600 ml-0.5 p-0.5 rounded transition cursor-pointer"
                              title="Remover esta palavra da seleção"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setSelectedWordRanges([])}
                        className="text-[10px] text-slate-400 hover:text-slate-600 underline ml-1 cursor-pointer transition"
                      >
                        Limpar seleção
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Especificações Técnicas */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Especificações Técnicas
                </label>
                <textarea
                  rows={5}
                  value={draft.description || ''}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Ex: 4K UHD IPS, USB-C 65W, Ajuste de Altura, HDMI (deixe em branco se não houver)"
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
                    placeholder="Ex: DEL-27-4K ou S2722QC"
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
                        category: autoCategory ? normalizeToOfficialCategory(autoCategory) : prev.category
                      }));
                    }}
                    placeholder="Ex: 8517.62.54"
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
                    placeholder="0,00"
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
                    placeholder="0,00"
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
                      placeholder="0,00"
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
                    placeholder="Un."
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
                      const finalVal = normalizeToOfficialCategory(val.trim() || 'Diversos & Sazonais');
                      setDraft(prev => ({ ...prev, category: finalVal }));
                      // onAddCategory só é chamado pelo onAddOption (ao confirmar a nova entrada)
                    }}
                    options={availableCategories}
                    onAddOption={(newCat) => {
                      if (onAddCategory) onAddCategory(normalizeToOfficialCategory(newCat));
                    }}
                    defaultValue="Diversos & Sazonais"
                    textAlign="left"
                    placeholder="Diversos & Sazonais"
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
                    placeholder="Ex: Mercado Livre, Kalunga, Fabricante"
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
                    placeholder="https://..."
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
