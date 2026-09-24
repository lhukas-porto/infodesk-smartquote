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
  ZoomIn,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  DollarSign,
  SlidersHorizontal,
  Tag
} from 'lucide-react';
import Papa from 'papaparse';
import { Product } from '../types';
import { 
  saveProducts, 
  deduplicateProductsList,
  getRegisteredUnits, 
  saveRegisteredUnit, 
  getRegisteredCategories, 
  saveRegisteredCategory 
} from '../utils/storage';
import { CreatableCombobox } from './CreatableCombobox';
import { ProductEditModal } from './ProductEditModal';
import { 
  syncProductToSupabase, 
  syncBatchProductsToSupabase, 
  deleteProductFromSupabase 
} from '../services/supabase';
import { normalizeToOfficialCategory } from '../utils/aiEmailParser';
import {
  normalizeSearchText
} from '../utils/aiEmailParser';
import { exportContaAzulExcel } from '../utils/contaAzulExport';

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
  const [isExportingContaAzul, setIsExportingContaAzul] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string } | null>(null);

  // Paginação e Ordenação (Padrão: Ordem Alfabética A-Z)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortField, setSortField] = useState<'name' | 'costPrice' | 'sku' | 'category' | null>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Volta automaticamente para a página 1 ao buscar, filtrar por categoria ou alterar o tamanho da página
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, pageSize]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoomedImage) {
          setZoomedImage(null);
          return;
        }
        if (isAddModalOpen) setIsAddModalOpen(false);
        if (editingProduct) setEditingProduct(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddModalOpen, editingProduct, zoomedImage]);

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
    return [...registeredUnits].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [registeredUnits]);

  const availableCategories = React.useMemo(() => {
    return [...registeredCategories].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [registeredCategories]);



  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: products.length };
    products.forEach(p => {
      const cat = normalizeToOfficialCategory(p.category || 'Diversos & Sazonais');
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [products]);

  const activeCategoriesCount = React.useMemo(() => {
    const set = new Set(products.map(p => p.category).filter(Boolean));
    return set.size;
  }, [products]);

  const avgCostPrice = React.useMemo(() => {
    if (products.length === 0) return 0;
    const sum = products.reduce((acc, p) => acc + (p.costPrice || 0), 0);
    return sum / products.length;
  }, [products]);

  const categories = ['all', ...Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'))];

  const filteredProducts = React.useMemo(() => {
    const term = normalizeSearchText(searchTerm);
    return products.filter(p => {
      const matchesSearch = !term ||
                            normalizeSearchText(p.name).includes(term) ||
                            normalizeSearchText(p.sku).includes(term) ||
                            normalizeSearchText(p.partNumber).includes(term) ||
                            normalizeSearchText(p.description).includes(term);
      const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [products, searchTerm, selectedCategory]);

  const sortedProducts = React.useMemo(() => {
    const field = sortField || 'name';
    const direction = sortDirection || 'asc';
    return [...filteredProducts].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal ?? '');
      const bStr = String(bVal ?? '');
      const cmp = aStr.localeCompare(bStr, 'pt-BR', { sensitivity: 'base' });
      return direction === 'asc' ? cmp : -cmp;
    });
  }, [filteredProducts, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / pageSize));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const startIndex = (currentPageSafe - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, sortedProducts.length);
  const paginatedProducts = sortedProducts.slice(startIndex, endIndex);

  const generatePageNumbers = (current: number, total: number) => {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [];
    if (current <= 4) {
      pages.push(1, 2, 3, 4, 5, '...', total);
    } else if (current >= total - 3) {
      pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total);
    } else {
      pages.push(1, '...', current - 1, current, current + 1, '...', total);
    }
    return pages;
  };

  const handleSort = (field: 'name' | 'costPrice' | 'sku' | 'category') => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        // Ao desmarcar a ordenação inversa, retorna ao padrão alfabético (A-Z)
        setSortField('name');
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

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
          const category = normalizeToOfficialCategory(row.Categoria || row.category || 'Diversos & Sazonais');
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
          let updatedCount = 0;
          let addedCount = 0;

          setProducts(prev => {
            const next = [...prev];
            parsed.forEach(newItem => {
              const normName = normalizeSearchText(newItem.name);
              const normPn = (newItem.partNumber || '').trim().toLowerCase();
              const normSku = (newItem.sku || '').trim().toLowerCase();

              const existingIdx = next.findIndex(p => {
                const pPn = (p.partNumber || '').trim().toLowerCase();
                const pSku = (p.sku || '').trim().toLowerCase();
                const pName = normalizeSearchText(p.name);

                return (
                  Boolean(normPn && pPn && pPn === normPn) ||
                  Boolean(normSku && pSku && pSku === normSku) ||
                  Boolean(normName && pName && pName === normName)
                );
              });

              if (existingIdx >= 0) {
                next[existingIdx] = {
                  ...next[existingIdx],
                  ...newItem,
                  id: next[existingIdx].id
                };
                updatedCount++;
              } else {
                next.unshift(newItem);
                addedCount++;
              }
            });
            saveProducts(next);
            return next;
          });
          syncBatchProductsToSupabase(parsed);
          setImportStatus(`Importação concluída: ${addedCount} novos adicionados e ${updatedCount} existentes atualizados.`);
          setTimeout(() => setImportStatus(null), 4000);
        }
      },
      error: (error) => {
        setImportStatus(`Erro ao ler CSV: ${error.message}`);
      }
    });
  };

  const handleExportContaAzul = async () => {
    try {
      setIsExportingContaAzul(true);
      await exportContaAzulExcel(products);
      setImportStatus('Planilha exportada com sucesso no formato oficial do Conta Azul!');
      setTimeout(() => setImportStatus(null), 4000);
    } catch (err: any) {
      console.error('Erro ao exportar produtos para Conta Azul:', err);
      alert('Erro ao exportar produtos: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setIsExportingContaAzul(false);
    }
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

  const handleSaveNewProductFromModal = (newProd: Product, shippingCost: number) => {
    const cleanName = newProd.name.trim();
    const cleanPn = (newProd.partNumber || '').trim().toLowerCase();
    const cleanSku = (newProd.sku || '').trim().toLowerCase();
    const normName = normalizeSearchText(cleanName);

    // 🛡️ Trava de Proteção Anti-Duplicidade (3 Níveis de Segurança):
    // 1. Part Number / Código de Fabricante (se preenchido)
    // 2. SKU / Código Interno (se preenchido e não vazio)
    // 3. Nome do Produto Normalizado (sem acentos, sem maiúsculas, sem espaços extras)
    const existingDuplicate = products.find(p => {
      const pPn = (p.partNumber || '').trim().toLowerCase();
      const pSku = (p.sku || '').trim().toLowerCase();
      const pName = normalizeSearchText(p.name);

      const matchPn = Boolean(cleanPn && pPn && cleanPn === pPn);
      const matchSku = Boolean(cleanSku && pSku && cleanSku === pSku);
      const matchName = Boolean(normName && pName && normName === pName);

      return matchPn || matchSku || matchName;
    });

    if (existingDuplicate) {
      const matchReason = 
        cleanPn && (existingDuplicate.partNumber || '').trim().toLowerCase() === cleanPn
          ? `Part Number idêntico (${existingDuplicate.partNumber})`
          : cleanSku && (existingDuplicate.sku || '').trim().toLowerCase() === cleanSku
          ? `Código/SKU idêntico (${existingDuplicate.sku})`
          : `Nome idêntico ("${existingDuplicate.name}")`;

      alert(`⚠️ Produto já cadastrado no sistema!\n\nFoi identificado um produto idêntico com base no critério: ${matchReason}.\n\n• Produto: ${existingDuplicate.name}\n• Categoria: ${existingDuplicate.category}\n• SKU: ${existingDuplicate.sku || 'N/A'}\n• Custo Atual: R$ ${existingDuplicate.costPrice.toFixed(2)}\n\nPara evitar itens duplicados no catálogo, localize o produto existente na lista e clique no lápis de edição para atualizar.`);
      return;
    }

    const unifiedCode = (newProd.sku || newProd.partNumber || '').trim();
    const created: Product = {
      ...newProd,
      id: `prod-${Date.now()}`,
      sku: unifiedCode || `SKU-${Date.now().toString().slice(-4)}`,
      partNumber: unifiedCode,
      name: cleanName,
      description: newProd.description?.trim() || '',
      category: normalizeToOfficialCategory(newProd.category || 'Diversos & Sazonais'),
      costPrice: Number(newProd.costPrice) || 0,
      shippingCost: shippingCost || 0,
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

    let finalCreated = created;
    setProducts(prev => {
      const normName = normalizeSearchText(created.name);
      const normPn = (created.partNumber || '').trim().toLowerCase();
      const normSku = (created.sku || '').trim().toLowerCase();

      const existingIdx = prev.findIndex(p => {
        const pPn = (p.partNumber || '').trim().toLowerCase();
        const pSku = (p.sku || '').trim().toLowerCase();
        const pName = normalizeSearchText(p.name);

        return (
          Boolean(normPn && normPn.length >= 3 && pPn === normPn) ||
          Boolean(normSku && !normSku.startsWith('inf-auto-') && pSku === normSku) ||
          Boolean(normName && normName.length >= 3 && pName === normName)
        );
      });

      let next: Product[];
      if (existingIdx >= 0) {
        finalCreated = {
          ...prev[existingIdx],
          ...created,
          id: prev[existingIdx].id
        };
        next = [...prev];
        next[existingIdx] = finalCreated;
      } else {
        next = [created, ...prev];
      }
      const deduped = deduplicateProductsList(next);
      saveProducts(deduped);
      return deduped;
    });
    syncProductToSupabase(finalCreated);

    setIsAddModalOpen(false);
    setImportStatus(`Produto "${finalCreated.name}" salvo com sucesso!`);
    setTimeout(() => setImportStatus(null), 4000);
  };

  const handleOpenEditModal = (product: Product) => {
    setEditingProduct({ ...product });
  };

  const handleSaveEditedProductFromModal = (updated: Product, shippingCost: number) => {
    const unifiedCode = (updated.sku || updated.partNumber || '').trim();
    const finalProd: Product = {
      ...updated,
      sku: unifiedCode || updated.sku || `SKU-${Date.now().toString().slice(-4)}`,
      partNumber: unifiedCode,
      name: updated.name.trim(),
      description: updated.description?.trim() || '',
      costPrice: Number(updated.costPrice) || 0,
      shippingCost: shippingCost || 0,
      lastUpdated: new Date().toISOString().split('T')[0]
    };

    if (finalProd.unit) {
      saveRegisteredUnit(finalProd.unit);
      setRegisteredUnits(getRegisteredUnits());
    }
    if (finalProd.category) {
      saveRegisteredCategory(finalProd.category);
      setRegisteredCategories(getRegisteredCategories());
    }

    setProducts(prev => {
      const next = prev.map(p => p.id === finalProd.id ? finalProd : p);
      saveProducts(next);
      return next;
    });

    syncProductToSupabase(finalProd);
    setEditingProduct(null);
    setImportStatus(`Produto "${finalProd.name}" atualizado com sucesso!`);
    setTimeout(() => setImportStatus(null), 4000);
  };

  const handleDeleteProduct = (id: string) => {
    const toDelete = products.find(p => p.id === id);
    deleteProductFromSupabase(id, toDelete?.sku, toDelete?.partNumber);
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
            onClick={handleExportContaAzul}
            disabled={isExportingContaAzul}
            className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer disabled:opacity-50"
            title="Exportar produtos no modelo oficial Conta Azul"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>{isExportingContaAzul ? 'Exportando...' : 'Exportar XML'}</span>
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

      {/* Cards de Métricas do Catálogo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">Total de Produtos</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-slate-900 font-mono">{products.length}</span>
            <span className="text-xs text-slate-500 font-medium">itens cadastrados</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium mt-0.5 block">Base ativa disponível para propostas</span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">Categorias Ativas</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-slate-900 font-mono">{activeCategoriesCount}</span>
            <span className="text-xs text-slate-500 font-medium">segmentos</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium mt-0.5 block">Hardware, Periféricos, Redes e Suprimentos</span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">Custo Médio dos Itens</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-slate-900 font-mono">
              R$ {avgCostPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium mt-0.5 block">Valor médio ponderado de custo de aquisição</span>
        </div>
      </div>

      {/* Barra de Busca e Filtro de Categoria em Dropdown */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* 1. Campo de Busca Amplo */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Digite o nome do produto, SKU, modelo, part number ou especificações..."
              className="w-full h-11 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl pl-11 pr-10 text-xs sm:text-sm text-slate-900 placeholder-slate-400 transition outline-none font-sans shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                title="Limpar texto da pesquisa"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 2. Filtro de Categoria Elegante em Dropdown */}
          <div className="relative min-w-[240px] sm:min-w-[280px]">
            <Layers className="w-4 h-4 text-sky-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className={`w-full h-11 pl-10 pr-9 border rounded-xl text-xs sm:text-sm font-semibold transition outline-none cursor-pointer shadow-2xs appearance-none ${
                selectedCategory !== 'all'
                  ? 'bg-sky-50/70 border-sky-300 text-sky-900 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'
              }`}
              title="Filtrar produtos por categoria"
            >
              <option value="all">Todas as Categorias</option>
              {categories.filter(c => c !== 'all').map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* 3. Ações: Limpar Filtros e Contador de Resultados */}
          <div className="flex items-center gap-2 shrink-0">
            {(searchTerm || selectedCategory !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('all');
                  setCurrentPage(1);
                }}
                className="h-11 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                title="Limpar pesquisa e categoria"
              >
                <X className="w-4 h-4 text-slate-500" />
                <span>Limpar</span>
              </button>
            )}

            <div className="h-11 px-4 bg-sky-50 border border-sky-200 rounded-xl text-sky-800 text-xs font-bold flex items-center gap-2 shrink-0 shadow-2xs">
              <Package className="w-4 h-4 text-sky-600" />
              <span>
                {sortedProducts.length} {sortedProducts.length === 1 ? 'encontrado' : 'encontrados'}
              </span>
            </div>
          </div>
        </div>

        {/* Tag visual da categoria ativa (se diferente de 'Todas') com botão de remoção rápida */}
        {selectedCategory !== 'all' && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-400 font-medium">Filtrando por categoria:</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-100 text-sky-800 border border-sky-200 font-bold rounded-lg text-xs shadow-2xs">
              <Layers className="w-3.5 h-3.5 text-sky-600" />
              <span>{selectedCategory}</span>
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className="p-0.5 hover:bg-sky-200 rounded text-sky-700 hover:text-sky-900 cursor-pointer ml-1"
                title="Remover filtro de categoria"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Tabela de Produtos com Ordenação e Paginação */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 select-none">
              <tr>
                <th 
                  onClick={() => handleSort('sku')} 
                  className="p-3 w-32 cursor-pointer hover:bg-slate-200/60 transition group"
                  title="Clique para ordenar por Código / SKU"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Código / SKU</span>
                    {sortField === 'sku' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-sky-600" /> : <ArrowDown className="w-3 h-3 text-sky-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                    )}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('name')} 
                  className="p-3 min-w-[280px] cursor-pointer hover:bg-slate-200/60 transition group"
                  title="Clique para ordenar por Nome do Produto"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Produto & Especificações</span>
                    {sortField === 'name' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-sky-600" /> : <ArrowDown className="w-3 h-3 text-sky-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                    )}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('category')} 
                  className="p-3 w-36 cursor-pointer hover:bg-slate-200/60 transition group"
                  title="Clique para ordenar por Categoria"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Categoria</span>
                    {sortField === 'category' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-sky-600" /> : <ArrowDown className="w-3 h-3 text-sky-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                    )}
                  </div>
                </th>
                <th className="p-3 w-24 text-center">Unidade</th>
                <th 
                  onClick={() => handleSort('costPrice')} 
                  className="p-3 w-32 text-right cursor-pointer hover:bg-slate-200/60 transition group"
                  title="Clique para ordenar por Preço de Custo"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Preço Custo (R$)</span>
                    {sortField === 'costPrice' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-sky-600" /> : <ArrowDown className="w-3 h-3 text-sky-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                    )}
                  </div>
                </th>
                <th className="p-3 w-36 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedProducts.length > 0 ? (
                paginatedProducts.map((p) => (
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
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Package className="w-8 h-8 text-slate-300" />
                      <p className="text-sm font-bold text-slate-700">Nenhum produto encontrado</p>
                      <p className="text-xs text-slate-400">
                        {searchTerm ? `Nenhum resultado corresponde à busca "${searchTerm}"` : 'Nenhum produto cadastrado nesta categoria'}
                      </p>
                      {(searchTerm || selectedCategory !== 'all') && (
                        <button
                          onClick={() => { setSearchTerm(''); setSelectedCategory('all'); }}
                          className="mt-2 px-3 py-1.5 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 rounded-lg text-xs font-semibold transition cursor-pointer"
                        >
                          Limpar Filtros
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé com Paginação de 10 em 10 itens */}
        <div className="border-t border-slate-200 bg-slate-50/70 p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>
              Exibindo <span className="font-bold text-slate-900">{sortedProducts.length > 0 ? startIndex + 1 : 0}</span> a{' '}
              <span className="font-bold text-slate-900">{endIndex}</span> de{' '}
              <span className="font-bold text-slate-900">{sortedProducts.length}</span> produtos
            </span>
            {sortedProducts.length !== products.length && (
              <span className="text-[11px] text-slate-400">({products.length} no total)</span>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-xs">Exibir:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none focus:border-sky-500 cursor-pointer"
              >
                <option value={10}>10 por pág.</option>
                <option value={25}>25 por pág.</option>
                <option value={50}>50 por pág.</option>
                <option value={100}>100 por pág.</option>
              </select>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPageSafe === 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
                  title="Primeira Página"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPageSafe === 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
                  title="Página Anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1 px-1">
                  {generatePageNumbers(currentPageSafe, totalPages).map((pNum, i) => {
                    if (typeof pNum === 'string') {
                      return (
                        <span key={`dots-${i}`} className="px-1 text-slate-400 text-xs">
                          ...
                        </span>
                      );
                    }
                    const isActive = pNum === currentPageSafe;
                    return (
                      <button
                        key={pNum}
                        onClick={() => setCurrentPage(pNum)}
                        className={`min-w-[28px] h-7 px-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          isActive
                            ? 'bg-sky-600 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {pNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPageSafe === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
                  title="Próxima Página"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPageSafe === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
                  title="Última Página"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Unificado de Cadastro de Produto */}
      {isAddModalOpen && (
        <ProductEditModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          product={{
            sku: '',
            name: '',
            description: '',
            category: 'Hardware',
            costPrice: 0,
            unit: 'Un.',
            stock: 10,
            ncm: '',
            supplier: '',
            sourceUrl: '',
            imageUrl: '',
            shippingCost: 0
          }}
          onSave={(finalProd, shippingCost) => {
            handleSaveNewProductFromModal(finalProd, shippingCost);
          }}
          availableUnits={availableUnits}
          onAddUnit={(unit) => {
            saveRegisteredUnit(unit);
            setRegisteredUnits(getRegisteredUnits());
          }}
          availableCategories={availableCategories}
          onAddCategory={(cat) => {
            saveRegisteredCategory(cat);
            setRegisteredCategories(getRegisteredCategories());
          }}
          title="Cadastrar Novo Produto na Infodesk"
          subtitle="Preencha os dados comerciais, foto e descrição. O produto será adicionado ao catálogo geral."
          badgeText="Novo Produto"
          saveButtonText="Cadastrar Produto"
          saveButtonTitle="Cadastrar produto no catálogo da Infodesk"
        />
      )}

      {/* Modal Unificado de Edição de Produto (Exatamente idêntico ao Catálogo/NCM da proposta) */}
      {editingProduct && (
        <ProductEditModal
          isOpen={Boolean(editingProduct)}
          onClose={() => setEditingProduct(null)}
          product={editingProduct}
          initialShippingCost={editingProduct.shippingCost || 0}
          onSave={(finalProd, shippingCost) => {
            handleSaveEditedProductFromModal(finalProd, shippingCost);
          }}
          availableUnits={availableUnits}
          onAddUnit={(unit) => {
            saveRegisteredUnit(unit);
            setRegisteredUnits(getRegisteredUnits());
          }}
          availableCategories={availableCategories}
          onAddCategory={(cat) => {
            saveRegisteredCategory(cat);
            setRegisteredCategories(getRegisteredCategories());
          }}
          title="Verificação Geral do Produto"
          subtitle="Revise os dados comerciais, foto e descrição. Depois de salvar o produto já entrará na base de dados."
          badgeText="Catálogo Oficial"
          saveButtonText="Salvar Produto"
          saveButtonTitle="Salva as alterações do produto na base de Produtos"
        />
      )}


      {/* Modal de Zoom da Foto na Tabela (Fiel à Referência Visual) */}
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
