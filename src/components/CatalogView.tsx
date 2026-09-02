import React, { useState } from 'react';
import { 
  Package, 
  Upload, 
  Download, 
  Plus, 
  Search, 
  Trash2, 
  Check,
  ExternalLink
} from 'lucide-react';
import Papa from 'papaparse';
import { Product } from '../types';

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
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const [newProd, setNewProd] = useState<Partial<Product>>({
    sku: '',
    name: '',
    description: '',
    category: 'Hardware',
    costPrice: 0,
    unit: 'Un.',
    stock: 1
  });

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
          const sku = row.Codigo || row.SKU || row.sku || `PROD-${Date.now()}-${idx}`;
          const costPrice = parseFloat(String(row.Custo || row.PrecoCusto || row.cost || '0').replace(',', '.')) || 0;
          const description = row.Descricao || row.Especificacao || row.description || name;
          const category = row.Categoria || row.category || 'Geral';
          const unit = row.Unidade || row.Un || row.unit || 'Un.';

          parsed.push({
            id: `prod-${Date.now()}-${idx}`,
            sku,
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
          setProducts(prev => [...parsed, ...prev]);
          setImportStatus(`Sucesso! ${parsed.length} produtos importados da sua planilha CSV.`);
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
      Estoque: p.stock,
      Fornecedor: p.supplier || ''
    })));

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `Catalogo_Infodesk_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveNewProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProd.name || !newProd.costPrice) return;

    const created: Product = {
      id: `prod-${Date.now()}`,
      sku: newProd.sku || `SKU-${Date.now().toString().slice(-4)}`,
      name: newProd.name,
      description: newProd.description || newProd.name,
      category: newProd.category || 'Geral',
      costPrice: Number(newProd.costPrice),
      unit: newProd.unit || 'Un.',
      stock: Number(newProd.stock) || 1,
      lastUpdated: new Date().toISOString().split('T')[0]
    };

    setProducts(prev => [created, ...prev]);
    setIsAddModalOpen(false);
    setNewProd({ sku: '', name: '', description: '', category: 'Hardware', costPrice: 0, unit: 'Un.', stock: 1 });
  };

  const handleDeleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="space-y-6">
      
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-sky-600" />
            <h1 className="text-xl font-bold text-slate-900">Catálogo de Produtos & Importador CSV</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Gerencie sua base com preços de custo, códigos e especificações técnicas da Infodesk.
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
                <th className="p-3 w-28">SKU / Código</th>
                <th className="p-3 min-w-[280px]">Produto & Especificações</th>
                <th className="p-3 w-32">Categoria</th>
                <th className="p-3 w-24 text-center">Unidade</th>
                <th className="p-3 w-28 text-right">Preço Custo (R$)</th>
                <th className="p-3 w-24 text-center">Estoque</th>
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
                    R$ {p.costPrice.toFixed(2)}
                  </td>
                  <td className="p-3 text-center text-slate-600 font-medium">
                    {p.stock ?? 0}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => onAddToQuote(p)}
                        className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-[11px] font-semibold transition"
                        title="Adicionar ao Orçamento Atual"
                      >
                        + Orçar
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(p.id)}
                        className="p-1 text-slate-400 hover:text-red-500 rounded transition"
                        title="Excluir"
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
                <label className="block text-slate-600 font-medium mb-1">Código / SKU</label>
                <input
                  type="text"
                  value={newProd.sku}
                  onChange={(e) => setNewProd({ ...newProd, sku: e.target.value })}
                  placeholder="Ex: DEL-27-4K"
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
                    type="number"
                    step="0.01"
                    required
                    value={newProd.costPrice || ''}
                    onChange={(e) => setNewProd({ ...newProd, costPrice: parseFloat(e.target.value) })}
                    placeholder="0.00"
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

    </div>
  );
};
