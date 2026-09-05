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
  ClipboardPaste
} from 'lucide-react';
import Papa from 'papaparse';
import { Product } from '../types';
import { saveProducts } from '../utils/storage';
import { 
  syncProductToSupabase, 
  syncBatchProductsToSupabase, 
  deleteProductFromSupabase 
} from '../services/supabase';
import {
  extractStoreNameFromUrl,
  applyTextCase,
  WordCaseStyle,
  getCategoryFromNcm
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
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.description.toLowerCase().includes(searchTerm.toLowerCase());
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
    if (!newProd.name || !newProd.costPrice) return;

    const created: Product = {
      id: `prod-${Date.now()}`,
      sku: (newProd.sku || newProd.partNumber || `SKU-${Date.now().toString().slice(-4)}`).trim(),
      partNumber: (newProd.sku || newProd.partNumber || '').trim(),
      name: newProd.name.trim(),
      description: newProd.description?.trim() || '',
      category: newProd.category || 'Geral',
      costPrice: Number(newProd.costPrice),
      unit: newProd.unit || 'Un.',
      lastUpdated: new Date().toISOString().split('T')[0]
    };

    setProducts(prev => {
      const next = [created, ...prev];
      saveProducts(next);
      return next;
    });
    syncProductToSupabase(created);

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
            <h1 className="text-xl font-bold text-slate-900">Produtos & Importador CSV</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Gerencie sua base de produtos com preços de custo, códigos e especificações técnicas da Infodesk.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-xs">
            <Upload className="w-3.5 h-3.5 text-sky-600" />
            <span>Importar Planilha CSV</span>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2"
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
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, SKU ou descrição..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs text-slate-600 font-medium whitespace-nowrap">Categoria:</span>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-sky-600 text-white font-bold shadow-xs'
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
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-slate-900 text-xs">{p.name}</p>
                      <a
                        href={p.sourceUrl || `https://www.google.com/search?q=${encodeURIComponent(p.name + ' ' + (p.description || ''))}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-400 hover:text-sky-600 transition"
                        title="Abrir pesquisa / link do produto na web"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-1">{p.description}</p>
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
                <label className="block text-slate-600 font-medium mb-1">Especificações Técnicas Completas</label>
                <textarea
                  rows={2}
                  value={newProd.description}
                  onChange={(e) => setNewProd({ ...newProd, description: e.target.value })}
                  placeholder="Ex: 4K UHD IPS, USB-C 65W, Ajuste de Altura, HDMI"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
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
                  <input
                    type="text"
                    value={newProd.unit}
                    onChange={(e) => setNewProd({ ...newProd, unit: e.target.value })}
                    placeholder="Un. / Cx. / Pç"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 text-center focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Categoria</label>
                  <input
                    type="text"
                    value={newProd.category}
                    onChange={(e) => setNewProd({ ...newProd, category: e.target.value })}
                    placeholder="Hardware"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-sky-500"
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
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
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

            {/* Form Body */}
            <form onSubmit={handleSaveEditedProduct} className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Foto Preview & Nome */}
              <div className="flex items-start gap-4 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div
                    tabIndex={0}
                    onClick={handleTriggerCatalogImageUpload}
                    onPaste={handlePasteImageToCatalog}
                    title="Clique para escolher foto do produto ou aperte Ctrl+V para colar foto copiada"
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
                    className="px-2 py-0.5 rounded text-[9.5px] font-semibold bg-sky-100 hover:bg-sky-200 text-sky-800 border border-sky-300 shadow-2xs flex items-center gap-1 transition cursor-pointer"
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
                          e.preventDefault();
                        }}
                        onClick={() => {
                          if (!editingProduct?.name) return;
                          const input = catalogProductNameInputRef.current;
                          const fullText = editingProduct.name;

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

                              setEditingProduct(prev => prev ? {
                                ...prev,
                                name: newFullText
                              } : null);

                              setTimeout(() => {
                                if (input) {
                                  input.focus();
                                  input.setSelectionRange(start, start + transformedPart.length);
                                }
                              }, 0);
                              return;
                            }
                          }

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

                          setEditingProduct(prev => prev ? {
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
                    value={editingProduct.name || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    onPaste={handlePasteImageToCatalog}
                    placeholder="Nome completo do produto sem traços ou vírgulas"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:border-sky-500"
                  />
                  {editingProduct.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setEditingProduct(prev => prev ? { ...prev, imageUrl: '' } : null)}
                      className="text-[10px] text-slate-400 hover:text-red-500 mt-1 block transition cursor-pointer"
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
                  value={editingProduct.description || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  placeholder="Ex: 4K UHD IPS, USB-C 65W, Ajuste de Altura, HDMI (deixe em branco se não houver)"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-sky-500 text-xs transition"
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
                  <input
                    type="text"
                    value={editingProduct.unit || 'Un.'}
                    onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
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
                    value={editingProduct.category || 'Geral'}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
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

              {/* Footer de Ações com botão único de Salvar no Catálogo */}
              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
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

    </div>
  );
};
