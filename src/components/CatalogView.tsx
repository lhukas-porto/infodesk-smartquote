import React, { useState, useRef } from 'react';
import { 
  Package, 
  Upload, 
  Download, 
  Plus, 
  Search, 
  Trash2, 
  Check,
  ExternalLink,
  Edit3,
  X,
  Camera,
  ImagePlus,
  ClipboardPaste,
  ChevronDown,
  Layers,
  ZoomIn
} from 'lucide-react';
import Papa from 'papaparse';
import { Product } from '../types';
import { 
  saveProducts, 
  getRegisteredUnits, 
  saveRegisteredUnit, 
  getRegisteredCategories, 
  saveRegisteredCategory 
} from '../utils/storage';
import { CreatableCombobox } from './CreatableCombobox';
import { 
  syncProductToSupabase, 
  syncBatchProductsToSupabase, 
  deleteProductFromSupabase 
} from '../services/supabase';
import {
  extractStoreNameFromUrl,
  applyTextCase,
  getNextTextCase,
  getWordOrSelectionRange,
  mergeSelectedRanges,
  applyCaseToRanges,
  WordCaseStyle,
  getCategoryFromNcm,
  normalizeSearchText
} from '../utils/aiEmailParser';

interface CatalogViewProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  onAddToQuote: (product: Product) => void;
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  products,
  setProducts,
  onAddToQuote
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string } | null>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAddModalOpen) setIsAddModalOpen(false);
        if (editingProduct) setEditingProduct(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddModalOpen, editingProduct]);

  // Intercepta o ESC na fase de captura para fechar o Zoom primeiro, sem fechar o modal de edição por baixo
  React.useEffect(() => {
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

  const [newProd, setNewProd] = useState<Partial<Product>>({
    sku: '',
    name: '',
    description: '',
    category: 'Hardware',
    costPrice: 0,
    unit: 'Un.',
    stock: 1
  });
  const [costPriceInput, setCostPriceInput] = useState<string>('');
  const [editCostPriceInput, setEditCostPriceInput] = useState<string>('');

  const [registeredUnits, setRegisteredUnits] = useState<string[]>(() => getRegisteredUnits());
  const [registeredCategories, setRegisteredCategories] = useState<string[]>(() => getRegisteredCategories());

  React.useEffect(() => {
    const handleMetadataChange = () => {
      setRegisteredUnits(getRegisteredUnits());
      setRegisteredCategories(getRegisteredCategories());
    };
    window.addEventListener('infodesk_metadata_changed', handleMetadataChange);
    return () => window.removeEventListener('infodesk_metadata_changed', handleMetadataChange);
  }, []);

  const availableUnits = React.useMemo(() => {
    const fromProducts = (products || []).map(p => p.unit).filter(Boolean);
    return Array.from(new Set([...registeredUnits, ...fromProducts])).filter(Boolean);
  }, [registeredUnits, products]);

  const availableCategories = React.useMemo(() => {
    const fromProducts = (products || []).map(p => p.category).filter(Boolean);
    return Array.from(new Set([...registeredCategories, ...fromProducts])).filter(Boolean);
  }, [registeredCategories, products]);

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

  const catalogFileInputRef = useRef<HTMLInputElement>(null);
  const catalogProductNameInputRef = useRef<HTMLInputElement>(null);
  const [isCatalogCaseMenuOpen, setIsCatalogCaseMenuOpen] = useState(false);
  const catalogCaseMenuRef = useRef<HTMLDivElement>(null);
  const [catalogSelectedRanges, setCatalogSelectedRanges] = useState<Array<{ start: number; end: number }>>([]);
  const catalogBackdropRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutsideCaseMenu = (e: MouseEvent) => {
      if (catalogCaseMenuRef.current && !catalogCaseMenuRef.current.contains(e.target as Node)) {
        setIsCatalogCaseMenuOpen(false);
      }
    };
    if (isCatalogCaseMenuOpen) {
      document.addEventListener('mousedown', handleClickOutsideCaseMenu);
    }
    return () => document.removeEventListener('mousedown', handleClickOutsideCaseMenu);
  }, [isCatalogCaseMenuOpen]);

  const handleApplyCatalogNameCase = (targetStyle?: WordCaseStyle) => {
    if (!editingProduct?.name) return;
    const input = catalogProductNameInputRef.current;
    const fullText = editingProduct.name;

    // 1. Se existem palavras selecionadas com Ctrl (estilo Word)
    if (catalogSelectedRanges.length > 0) {
      const firstRange = catalogSelectedRanges[0];
      const firstPart = fullText.substring(firstRange.start, firstRange.end);
      const styleToApply = targetStyle || getNextTextCase(firstPart);

      const { newText, newRanges } = applyCaseToRanges(fullText, catalogSelectedRanges, styleToApply);

      setEditingProduct(prev => prev ? {
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

    setEditingProduct(prev => prev ? {
      ...prev,
      name: newFullText
    } : null);

    setIsCatalogCaseMenuOpen(false);

    setTimeout(() => {
      if (input) {
        input.focus();
        input.setSelectionRange(start, start + transformedPart.length);
      }
    }, 0);
  };

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
              if (res) return res;
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
            if (res) return res;
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
            if (res) return res;
          }
        }
      } catch (err) {
        // Fallback silencioso
      }
    }
    return null;
  };

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
      if (dataUrl && editingProduct) {
        setEditingProduct(prev => prev ? { ...prev, imageUrl: dataUrl } : null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePasteImageToCatalog = async (e: React.ClipboardEvent) => {
    const dataUrl = await extractImageFromClipboard(e.clipboardData);
    if (dataUrl) {
      e.preventDefault();
      e.stopPropagation();
      setEditingProduct(prev => prev ? { ...prev, imageUrl: dataUrl } : null);
    }
  };

  const handleDirectPasteToCatalog = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dataUrl = await readImageFromSystemClipboard();
    if (dataUrl) {
      setEditingProduct(prev => prev ? { ...prev, imageUrl: dataUrl } : null);
    } else {
      alert('Nenhuma imagem encontrada na área de transferência. Tire um print (PrintScreen ou Win+Shift+S) ou copie uma imagem antes de colar.');
    }
  };

  // Listener global de Ctrl+V quando o modal de edição do catálogo estiver aberto
  React.useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      if (!editingProduct) return;
      const dataUrl = await extractImageFromClipboard(e.clipboardData);
      if (dataUrl) {
        e.preventDefault();
        e.stopPropagation();
        setEditingProduct(prev => prev ? { ...prev, imageUrl: dataUrl } : null);
      }
    };

    window.addEventListener('paste', handleGlobalPaste, true);
    return () => window.removeEventListener('paste', handleGlobalPaste, true);
  }, [editingProduct]);

  const categories = ['all', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];

  const filteredProducts = products.filter(p => {
    const term = normalizeSearchText(searchTerm);
    const matchesSearch = !term ||
                          normalizeSearchText(p.name).includes(term) ||
                          normalizeSearchText(p.sku).includes(term) ||
                          normalizeSearchText(p.partNumber).includes(term) ||
                          normalizeSearchText(p.description).includes(term);
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed: Product[] = [];
        results.data.forEach((row: any, idx: number) => {
          const name = row.Nome || row.Produto || row.name || row.Description || `Produto ${idx + 1}`;
          const sku = row.Codigo || row.SKU || row.sku || row.Modelo || row.modelo || row.PartNumber || row.partNumber || row.Part_Number || `PROD-${Date.now()}-${idx}`;
          const partNumber = row.PartNumber || row.partNumber || row.Part_Number || row.Modelo || row.modelo || sku;
          const costPrice = parseFloat(String(row.Custo || row.PrecoCusto || row.cost || '0').replace(',', '.')) || 0;
          const description = row.Descricao || row.Especificacao || row.description || '';
          const category = row.Categoria || row.category || 'Geral';
          const unit = row.Unidade || row.Un || row.unit || 'Un.';

          parsed.push({
            id: `prod-${Date.now()}-${idx}`,
            sku,
            partNumber,
            name,
            description,
            category,
            costPrice,
            unit,
            stock: 10,
            lastUpdated: new Date().toISOString().split('T')[0]
          });
        });

        if (parsed.length > 0) {
          setProducts(prev => {
            const next = [...parsed, ...prev];
            saveProducts(next);
            return next;
          });
          syncBatchProductsToSupabase(parsed);
          setImportStatus(`Sucesso! ${parsed.length} produtos importados e sincronizados com o banco de dados.`);
          setTimeout(() => setImportStatus(null), 4000);
        }
      },
      error: (error) => {
        setImportStatus(`Erro ao ler CSV: ${error.message}`);
      }
    });
  };

  const handleExportCSV = () => {
    const csv = Papa.unparse(products.map(p => ({
      Codigo: p.sku,
      Nome: p.name,
      Descricao: p.description,
      Categoria: p.category,
      PrecoCusto: p.costPrice,
      Unidade: p.unit,
      Fornecedor: p.supplier || ''
    })));

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `Produtos_Infodesk_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveNewProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProd.name || !newProd.name.trim()) {
      alert('Por favor, informe ao menos o nome do produto.');
      return;
    }

    const cost = Number(newProd.costPrice) || 0;

    const created: Product = {
      id: `prod-${Date.now()}`,
      sku: (newProd.sku || newProd.partNumber || `SKU-${Date.now().toString().slice(-4)}`).trim(),
      partNumber: (newProd.sku || newProd.partNumber || '').trim(),
      name: newProd.name.trim(),
      description: newProd.description?.trim() || '',
      category: newProd.category || 'Geral',
      costPrice: cost,
      unit: newProd.unit || 'Un.',
      lastUpdated: new Date().toISOString().split('T')[0]
    };

    if (created.unit) {
      saveRegisteredUnit(created.unit);
      setRegisteredUnits(getRegisteredUnits());
    }
    if (created.category) {
      saveRegisteredCategory(created.category);
      setRegisteredCategories(getRegisteredCategories());
    }

    setProducts(prev => {
      const next = [created, ...prev];
      saveProducts(next);
      return next;
    });
    syncProductToSupabase(created);

    if (cost === 0) {
      setImportStatus('Produto cadastrado com custo R$ 0,00 (sob cotação). Você poderá definir o custo posteriormente.');
      setTimeout(() => setImportStatus(null), 4000);
    }

    setIsAddModalOpen(false);
    setNewProd({ sku: '', name: '', description: '', category: 'Hardware', costPrice: 0, unit: 'Un.', stock: 1 });
    setCostPriceInput('');
  };

  const handleOpenEditModal = (product: Product) => {
    setEditingProduct({ ...product });
    setEditCostPriceInput(formatCurrencyPtBr(product.costPrice));
  };

  const handleSaveEditedProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !editingProduct.name) return;

    const unifiedCode = (editingProduct.sku || editingProduct.partNumber || '').trim();
    const updated: Product = {
      ...editingProduct,
      sku: unifiedCode || editingProduct.sku || `SKU-${Date.now().toString().slice(-4)}`,
      partNumber: unifiedCode,
      name: editingProduct.name.trim(),
      description: editingProduct.description?.trim() || '',
      costPrice: Number(editingProduct.costPrice) || 0,
      lastUpdated: new Date().toISOString().split('T')[0]
    };

    if (updated.unit) {
      saveRegisteredUnit(updated.unit);
      setRegisteredUnits(getRegisteredUnits());
    }
    if (updated.category) {
      saveRegisteredCategory(updated.category);
      setRegisteredCategories(getRegisteredCategories());
    }

    setProducts(prev => {
      const next = prev.map(p => p.id === updated.id ? updated : p);
      saveProducts(next);
      return next;
    });

    syncProductToSupabase(updated);
    setEditingProduct(null);
    setEditCostPriceInput('');
  };

  const handleDeleteProduct = (id: string) => {
    const toDelete = products.find(p => p.id === id);
    if (toDelete?.sku) {
      deleteProductFromSupabase(toDelete.sku);
    }
    setProducts(prev => {
      const next = prev.filter(p => p.id !== id);
      saveProducts(next);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-sky-600" />
            <h1 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">Produtos & Catálogo Geral</h1>
            <span className="px-2.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold font-mono uppercase tracking-wider rounded-lg">
              {products.length} ITENS
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Gerencie sua base de produtos com preços de custo, códigos e especificações técnicas da Infodesk.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs active:scale-95">
            <Upload className="w-3.5 h-3.5 text-slate-600" />
            <span>Importar CSV</span>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Produto</span>
          </button>
        </div>
      </div>

      {importStatus && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fadeIn">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{importStatus}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, SKU ou descrição..."
            className="w-full h-10 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl pl-10 pr-4 text-xs sm:text-sm text-slate-900 placeholder-slate-400 transition outline-none font-sans"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs text-slate-600 font-bold whitespace-nowrap">Categoria:</span>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              {cat === 'all' ? 'Todas' : cat}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="p-3 w-32">Código / SKU / Modelo</th>
                <th className="p-3 min-w-[280px]">Produto & Especificações</th>
                <th className="p-3 w-32">Categoria</th>
                <th className="p-3 w-24 text-center">Unidade</th>
                <th className="p-3 w-28 text-right">Preço Custo (R$)</th>
                <th className="p-3 w-36 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition">
                  <td className="p-3 font-mono font-semibold text-sky-700 text-xs">
                    {p.sku}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {p.imageUrl && (
                        <div
                          onClick={() => setZoomedImage({ url: p.imageUrl!, title: p.name })}
                          title="Clique para ver a foto com ZOOM"
                          className="w-10 h-10 min-w-[40px] max-w-[40px] min-h-[40px] max-h-[40px] rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs hover:border-sky-500 hover:shadow-md shrink-0 overflow-hidden cursor-pointer transition relative group/cimg select-none"
                        >
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="w-full h-full max-w-full max-h-full object-contain group-hover/cimg:scale-105 transition duration-200"
                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                          />
                          <div className="absolute inset-0 bg-sky-950/50 opacity-0 group-hover/cimg:opacity-100 transition flex items-center justify-center text-white backdrop-blur-[0.5px]">
                            <ZoomIn className="w-3.5 h-3.5 text-white drop-shadow-sm" />
                          </div>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-slate-900 text-xs">{p.name}</p>
                          <a
                            href={p.sourceUrl || `https://www.google.com/search?q=${encodeURIComponent(p.name + ' ' + (p.description || ''))}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-slate-400 hover:text-sky-600 transition shrink-0"
                            title="Abrir pesquisa / link do produto na web"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-1">{p.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-slate-700">
                    <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] border border-slate-200">
                      {p.category}
                    </span>
                  </td>
                  <td className="p-3 text-center font-medium text-slate-500">
                    {p.unit}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    R$ {p.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => onAddToQuote(p)}
                        className="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-[11px] font-semibold transition cursor-pointer active:scale-95"
                        title="Adicionar ao Orçamento Atual"
                      >
                        + Orçar
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(p)}
                        className="p-1 text-slate-500 hover:text-sky-600 hover:bg-sky-50 border border-transparent hover:border-sky-200 rounded-lg transition cursor-pointer active:scale-95"
                        title="Editar Informações do Produto"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(p.id)}
                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer active:scale-95"
                        title="Excluir Produto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 shadow-xl space-y-4 animate-scaleIn">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Plus className="w-5 h-5 text-sky-600" />
                Cadastrar Novo Produto na Infodesk
              </h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewProduct} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Nome do Produto *</label>
                <input
                  type="text"
                  required
                  value={newProd.name}
                  onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
                  placeholder="Ex: Monitor Dell 27 4K UHD"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Código / SKU / Part Number / Modelo</label>
                <input
                  type="text"
                  value={newProd.sku}
                  onChange={(e) => setNewProd({ ...newProd, sku: e.target.value, partNumber: e.target.value })}
                  placeholder="Ex: DEL-27-4K ou S2722QC"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Especificações Técnicas</label>
                <textarea
                  rows={5}
                  value={newProd.description}
                  onChange={(e) => setNewProd({ ...newProd, description: e.target.value })}
                  placeholder="Ex: 4K UHD IPS, USB-C 65W, Ajuste de Altura, HDMI"
                  className="w-full min-h-[110px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 focus:outline-none focus:border-sky-500 leading-relaxed resize-y"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Preço Custo (R$) *</label>
                  <input
                    type="text"
                    required
                    value={costPriceInput}
                    onFocus={() => {
                      if ((newProd.costPrice || 0) <= 0) {
                        setCostPriceInput('');
                      }
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCostPriceInput(val);
                      const parsed = parsePtBrNumber(val);
                      setNewProd(prev => ({ ...prev, costPrice: parsed }));
                    }}
                    onBlur={() => {
                      const parsed = parsePtBrNumber(costPriceInput);
                      setNewProd(prev => ({ ...prev, costPrice: parsed }));
                      setCostPriceInput(formatCurrencyPtBr(parsed));
                    }}
                    placeholder="0,00"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Unidade</label>
                  <CreatableCombobox
                    value={newProd.unit || 'Un.'}
                    onChange={(val) => {
                      const finalVal = val.trim() || 'Un.';
                      setNewProd(prev => ({ ...prev, unit: finalVal }));
                      saveRegisteredUnit(finalVal);
                      setRegisteredUnits(getRegisteredUnits());
                    }}
                    options={availableUnits}
                    onAddOption={(newUnit) => {
                      saveRegisteredUnit(newUnit);
                      setRegisteredUnits(getRegisteredUnits());
                    }}
                    defaultValue="Un."
                    textAlign="center"
                    placeholder="Un."
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Categoria</label>
                  <CreatableCombobox
                    value={newProd.category || 'Geral'}
                    onChange={(val) => {
                      const finalVal = val.trim() || 'Geral';
                      setNewProd(prev => ({ ...prev, category: finalVal }));
                      saveRegisteredCategory(finalVal);
                      setRegisteredCategories(getRegisteredCategories());
                    }}
                    options={availableCategories}
                    onAddOption={(newCat) => {
                      saveRegisteredCategory(newCat);
                      setRegisteredCategories(getRegisteredCategories());
                    }}
                    defaultValue="Geral"
                    textAlign="left"
                    placeholder="Geral"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 hover:text-slate-900 rounded-xl font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-sm transition"
                >
                  Salvar Produto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edição de Produto (Mesmo layout e recursos do QuoteBuilder com Salvar único e Especificações Técnicas) */}
      {editingProduct && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-sky-100 text-sky-700 rounded-xl">
                  <Package className="w-5 h-5 text-sky-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    Verificação Geral do Produto
                    <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-[10px] rounded-full font-bold">
                      Base de Produtos
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Revise os dados comerciais, foto e especificações completas deste produto.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-xs font-bold transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input oculto para upload de arquivo de imagem */}
            <input
              type="file"
              ref={catalogFileInputRef}
              onChange={handleCatalogImageFileChange}
              accept="image/*"
              className="hidden"
            />

            {/* Form com Footer Fixo/Flutuante */}
            <form onSubmit={handleSaveEditedProduct} className="flex-1 flex flex-col min-h-0">
              <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1 custom-scrollbar">
              {/* Foto Preview & Nome */}
              <div className="flex items-start gap-4 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div
                    tabIndex={0}
                    onClick={() => {
                      if (editingProduct.imageUrl) {
                        setZoomedImage({
                          url: editingProduct.imageUrl,
                          title: editingProduct.name || 'Produto'
                        });
                      } else {
                        handleTriggerCatalogImageUpload();
                      }
                    }}
                    onPaste={handlePasteImageToCatalog}
                    title={editingProduct.imageUrl ? "Clique para ver a foto com ZOOM (ou aperte Ctrl+V para colar outra foto)" : "Clique para escolher foto do produto ou aperte Ctrl+V para colar foto copiada"}
                    className={`w-16 h-16 rounded-xl overflow-hidden shrink-0 flex items-center justify-center p-1 cursor-pointer transition relative group/cimg select-none focus:outline-none focus:ring-2 focus:ring-sky-400 ${
                      editingProduct.imageUrl
                        ? 'bg-white border border-slate-300 hover:border-sky-500 shadow-2xs'
                        : 'border-2 border-dashed border-sky-300 bg-sky-50 hover:bg-sky-100 hover:border-sky-500'
                    }`}
                  >
                    {editingProduct.imageUrl ? (
                      <>
                        <img
                          src={editingProduct.imageUrl}
                          alt={editingProduct.name || 'Produto'}
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
                          onClick={() => handleApplyCatalogNameCase()}
                          className="inline-flex items-center gap-1 text-slate-700 hover:text-sky-700 hover:bg-sky-50 px-2 py-1 rounded-l-lg font-bold text-[10px] transition cursor-pointer active:scale-95 select-none"
                          title="Alternar maiúsculas/minúsculas da palavra sob o cursor, das palavras selecionadas ou do nome todo"
                        >
                          <span className="font-serif font-bold text-[11px] leading-none text-sky-700">Aa</span>
                          <span className="text-[10px] font-medium text-slate-700">Mudar Caso</span>
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setIsCatalogCaseMenuOpen(prev => !prev)}
                          className="px-1.5 py-1 border-l border-slate-200 hover:bg-sky-50 text-slate-500 hover:text-sky-700 rounded-r-lg transition cursor-pointer active:scale-95"
                          title="Escolher estilo de maiúsculas/minúsculas específico"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>

                        {isCatalogCaseMenuOpen && (
                          <div
                            ref={catalogCaseMenuRef}
                            className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                          >
                            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
                              Formatar Trecho / Palavras
                            </div>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleApplyCatalogNameCase('sentence')}
                              className="w-full px-3 py-1.5 text-left text-xs hover:bg-sky-50 text-slate-700 flex flex-col transition cursor-pointer"
                            >
                              <span className="font-semibold text-slate-800">Primeira da frase maiúscula</span>
                              <span className="text-[10px] text-slate-400">Ex: Teclado sem fio logitech k380</span>
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleApplyCatalogNameCase('lowercase')}
                              className="w-full px-3 py-1.5 text-left text-xs hover:bg-sky-50 text-slate-700 flex flex-col transition cursor-pointer"
                            >
                              <span className="font-semibold text-slate-800">minúsculas</span>
                              <span className="text-[10px] text-slate-400">Ex: teclado sem fio logitech k380</span>
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleApplyCatalogNameCase('uppercase')}
                              className="w-full px-3 py-1.5 text-left text-xs hover:bg-sky-50 text-slate-700 flex flex-col transition cursor-pointer"
                            >
                              <span className="font-semibold text-slate-800">MAIÚSCULAS</span>
                              <span className="text-[10px] text-slate-400">Ex: TECLADO SEM FIO LOGITECH K380</span>
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleApplyCatalogNameCase('title')}
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
                      ref={catalogBackdropRef}
                      aria-hidden="true"
                      className="absolute inset-0 px-3 py-2 text-transparent font-semibold pointer-events-none overflow-hidden whitespace-pre font-sans text-sm select-none border border-transparent flex items-center"
                    >
                      {renderBackdropHighlights(editingProduct.name || '', catalogSelectedRanges)}
                    </div>
                    <input
                      ref={catalogProductNameInputRef}
                      type="text"
                      required
                      value={editingProduct.name || ''}
                      onChange={(e) => {
                        setEditingProduct({ ...editingProduct, name: e.target.value });
                        if (catalogSelectedRanges.length > 0) setCatalogSelectedRanges([]);
                      }}
                      onMouseUp={handleCatalogInputMouseUp}
                      onDoubleClick={handleCatalogInputDoubleClick}
                      onScroll={(e) => {
                        if (catalogBackdropRef.current) {
                          catalogBackdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
                        }
                      }}
                      onPaste={handlePasteImageToCatalog}
                      placeholder="Nome completo do produto sem traços ou vírgulas"
                      className="w-full bg-transparent border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:border-sky-500 relative z-10"
                    />
                  </div>

                  {/* Badges de palavras selecionadas com Ctrl */}
                  {catalogSelectedRanges.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-bold">
                        <Layers className="w-3 h-3 text-sky-600" />
                        <span>{catalogSelectedRanges.length} {catalogSelectedRanges.length === 1 ? 'palavra selecionada com Ctrl' : 'palavras selecionadas com Ctrl'}:</span>
                      </div>
                      {catalogSelectedRanges.map((range, idx) => {
                        const wordText = (editingProduct.name || '').substring(range.start, range.end);
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100/90 border border-sky-300 text-sky-900 text-[11px] font-bold shadow-2xs"
                          >
                            <span>{wordText}</span>
                            <button
                              type="button"
                              onClick={() => setCatalogSelectedRanges(prev => prev.filter((_, i) => i !== idx))}
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
                        onClick={() => setCatalogSelectedRanges([])}
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
                  value={editingProduct.description || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  placeholder="Ex: 4K UHD IPS, USB-C 65W, Ajuste de Altura, HDMI (deixe em branco se não houver)"
                  className="w-full min-h-[110px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 focus:bg-white focus:outline-none focus:border-sky-500 text-xs transition leading-relaxed resize-y"
                />
              </div>

              {/* Código / Part Number / SKU e NCM */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Código / SKU / Part Number / Modelo
                  </label>
                  <input
                    type="text"
                    value={editingProduct.sku || editingProduct.partNumber || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value, partNumber: e.target.value })}
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
                    value={editingProduct.ncm || ''}
                    onChange={(e) => {
                      const newNcm = e.target.value;
                      const autoCategory = getCategoryFromNcm(newNcm);
                      setEditingProduct(prev => prev ? {
                        ...prev,
                        ncm: newNcm,
                        category: autoCategory !== 'Geral' ? autoCategory : prev.category
                      } : null);
                    }}
                    placeholder="Ex: 8528.52.20"
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
                    value={editCostPriceInput}
                    onFocus={() => {
                      if ((editingProduct.costPrice || 0) <= 0) {
                        setEditCostPriceInput('');
                      }
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditCostPriceInput(val);
                      const parsed = parsePtBrNumber(val);
                      setEditingProduct(prev => prev ? ({ ...prev, costPrice: parsed }) : null);
                    }}
                    onBlur={() => {
                      const parsed = parsePtBrNumber(editCostPriceInput);
                      setEditingProduct(prev => prev ? ({ ...prev, costPrice: parsed }) : null);
                      setEditCostPriceInput(formatCurrencyPtBr(parsed));
                    }}
                    placeholder="0,00"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Unidade
                  </label>
                  <CreatableCombobox
                    value={editingProduct.unit || 'Un.'}
                    onChange={(val) => {
                      const finalVal = val.trim() || 'Un.';
                      setEditingProduct(prev => prev ? { ...prev, unit: finalVal } : null);
                      saveRegisteredUnit(finalVal);
                      setRegisteredUnits(getRegisteredUnits());
                    }}
                    options={availableUnits}
                    onAddOption={(newUnit) => {
                      saveRegisteredUnit(newUnit);
                      setRegisteredUnits(getRegisteredUnits());
                    }}
                    defaultValue="Un."
                    textAlign="center"
                    placeholder="Un."
                  />
                </div>
              </div>

              {/* Categoria e Fornecedor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Categoria
                  </label>
                  <CreatableCombobox
                    value={editingProduct.category || 'Geral'}
                    onChange={(val) => {
                      const finalVal = val.trim() || 'Geral';
                      setEditingProduct(prev => prev ? { ...prev, category: finalVal } : null);
                      saveRegisteredCategory(finalVal);
                      setRegisteredCategories(getRegisteredCategories());
                    }}
                    options={availableCategories}
                    onAddOption={(newCat) => {
                      saveRegisteredCategory(newCat);
                      setRegisteredCategories(getRegisteredCategories());
                    }}
                    defaultValue="Geral"
                    textAlign="left"
                    placeholder="Geral"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Fornecedor
                  </label>
                  <input
                    type="text"
                    value={editingProduct.supplier || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, supplier: e.target.value })}
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
                    value={editingProduct.sourceUrl || ''}
                    onChange={(e) => {
                      const newUrl = e.target.value;
                      const detectedStore = extractStoreNameFromUrl(newUrl);
                      setEditingProduct(prev => prev ? {
                        ...prev,
                        sourceUrl: newUrl,
                        supplier: detectedStore || prev.supplier
                      } : null);
                    }}
                    placeholder="https://..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-[11px] focus:outline-none focus:border-sky-500"
                  />
                  {editingProduct.sourceUrl && (
                    <a
                      href={editingProduct.sourceUrl}
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
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-semibold transition text-xs cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition flex items-center gap-2 cursor-pointer text-xs active:scale-95"
                  title="Salva as alterações do produto na base de Produtos"
                >
                  <Check className="w-4 h-4 text-white" />
                  <span>Salvar Produto</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

    </div>
  );
};
