import React, { useState, useMemo } from 'react';
import { X, FileText, CheckCircle2, AlertCircle, Plus, Search, Sparkles, PackagePlus } from 'lucide-react';
import { Product, QuoteItem } from '../types';

interface SmartBatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalogProducts: Product[];
  onImportItems: (newItems: QuoteItem[]) => void;
  defaultMarkup?: number;
  defaultTax?: number;
}

interface ParsedImportRow {
  id: string;
  rawText: string;
  quantity: number;
  detectedName: string;
  matchedProduct?: Product;
  matchScore: number;
  selected: boolean;
  costPrice: number;
  unit: string;
}

export const SmartBatchImportModal: React.FC<SmartBatchImportModalProps> = ({
  isOpen,
  onClose,
  catalogProducts = [],
  onImportItems,
  defaultMarkup = 35,
  defaultTax = 6
}) => {
  const [inputText, setInputText] = useState('');

  // Algoritmo de correspondência fuzzy / substring com o catálogo
  const findBestCatalogMatch = (query: string): { product?: Product; score: number } => {
    if (!query || catalogProducts.length === 0) return { score: 0 };
    const cleanQuery = query.toLowerCase().trim();
    const queryTokens = cleanQuery.split(/\s+/).filter(t => t.length > 2);

    let bestProduct: Product | undefined = undefined;
    let highestScore = 0;

    for (const prod of catalogProducts) {
      const prodName = (prod.name || '').toLowerCase();
      const prodSku = (prod.sku || prod.partNumber || '').toLowerCase();

      // Match exato de SKU
      if (prodSku && cleanQuery.includes(prodSku)) {
        return { product: prod, score: 100 };
      }

      // Match de tokens do nome
      let matchedTokens = 0;
      for (const token of queryTokens) {
        if (prodName.includes(token)) {
          matchedTokens++;
        }
      }

      const score = queryTokens.length > 0 ? (matchedTokens / queryTokens.length) * 100 : 0;
      if (score > highestScore && score >= 40) {
        highestScore = score;
        bestProduct = prod;
      }
    }

    return { product: bestProduct, score: Math.round(highestScore) };
  };

  // Parser de linhas de texto coladas (Hook chamado incondicionalmente no topo)
  const parsedRows: ParsedImportRow[] = useMemo(() => {
    if (!inputText.trim()) return [];

    const lines = inputText.split('\n').map(l => l.trim()).filter(Boolean);

    return lines.map((line, idx) => {
      // Tenta extrair quantidade do início: ex "10x", "10 un", "10 - ", "10 "
      let quantity = 1;
      let detectedName = line;

      const qtyMatch = line.match(/^(\d+)\s*(?:x|un|cx|pçs?|unidades?|-)?\s+(.+)$/i);
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1], 10) || 1;
        detectedName = qtyMatch[2].trim();
      }

      const match = findBestCatalogMatch(detectedName);

      return {
        id: `import-${idx}-${Date.now()}`,
        rawText: line,
        quantity,
        detectedName,
        matchedProduct: match.product,
        matchScore: match.score,
        selected: true,
        costPrice: match.product?.costPrice || 0,
        unit: match.product?.unit || 'Un.'
      };
    });
  }, [inputText, catalogProducts]);

  if (!isOpen) return null;

  const handleConfirmImport = () => {
    const selectedRows = parsedRows.filter(r => r.selected);
    if (selectedRows.length === 0) {
      alert('Selecione ao menos um produto para importar.');
      return;
    }

    const newQuoteItems: QuoteItem[] = selectedRows.map((row, idx) => {
      const cost = row.costPrice;
      const markup = defaultMarkup;
      const tax = defaultTax;
      // Preço de venda básico
      const unitPrice = cost > 0 ? Number(((cost * (1 + markup / 100)) / (1 - tax / 100)).toFixed(2)) : 0;
      const totalPrice = Number((unitPrice * row.quantity).toFixed(2));

      return {
        id: `item-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 6)}`,
        itemNumber: idx + 1,
        name: row.matchedProduct?.name || row.detectedName,
        description: row.matchedProduct?.description || row.detectedName,
        sku: row.matchedProduct?.sku || row.matchedProduct?.partNumber || '',
        category: row.matchedProduct?.category || 'Informática, Hardware & Periféricos',
        unit: row.unit || 'Un.',
        quantity: row.quantity,
        costPrice: cost,
        markupPercent: markup,
        taxPercent: tax,
        shippingCost: 0,
        unitPrice: unitPrice,
        totalPrice: totalPrice,
        photoUrl: row.matchedProduct?.imageUrl || '',
        supplier: row.matchedProduct?.supplier || ''
      };
    });

    onImportItems(newQuoteItems);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-white border border-slate-300 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Topo Modal */}
        <div className="p-4 px-6 bg-[#0f172a] border-b border-[#1e293b] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <PackagePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Importador de Listas com Auto-Match de Catálogo
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono rounded">
                  IA & Catálogo
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Cole listas de compras ou editais para cruzar instantaneamente com seu estoque e custos
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1 text-slate-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          
          {/* Caixa de Entrada de Texto Bruto */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-600" />
                <span>Cole a lista de itens abaixo (uma linha por produto):</span>
              </label>
              <button
                type="button"
                onClick={() => setInputText(`10x Cabo de Rede Furukawa Gigalan Cat6 Azul
2x Switch Intelbras 24 Portas Gigabit
8 SSD Kingston NV3 1TB M.2
4 Roteador Wi-Fi 6 TP-Link Archer`)}
                className="text-xs text-amber-600 hover:text-amber-700 font-semibold"
              >
                Colar Exemplo
              </button>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={5}
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-sans text-slate-900 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-100 outline-none transition resize-none"
            />
          </div>

          {/* Relação de Itens Identificados */}
          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Itens Identificados ({parsedRows.length}):</span>
                <span className="text-xs text-slate-500 font-normal">
                  {parsedRows.filter(r => r.matchedProduct).length} encontrados no catálogo
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto divide-y divide-slate-100">
                {parsedRows.map((row) => (
                  <div key={row.id} className="p-2.5 px-3.5 flex items-center justify-between gap-3 bg-white hover:bg-slate-50 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 font-bold font-mono flex items-center justify-center shrink-0 text-xs">
                        {row.quantity}x
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">
                          {row.matchedProduct?.name || row.detectedName}
                        </p>
                        {row.matchedProduct ? (
                          <div className="flex items-center gap-2 text-[10px] text-emerald-700 font-medium">
                            <span className="flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Catálogo ({row.matchScore}%): SKU {row.matchedProduct.sku || row.matchedProduct.partNumber}
                            </span>
                            <span>•</span>
                            <span>Custo Histórico: R$ {Number(row.costPrice).toFixed(2)}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-amber-500" />
                            Novo produto (custo a definir na proposta)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="text-xs font-mono font-bold text-slate-900">
                        {row.costPrice > 0 ? `R$ ${(row.costPrice * row.quantity).toFixed(2)}` : 'R$ 0,00'}
                      </span>
                      <span className="text-[10px] text-slate-400 block">custo est.</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Rodapé com Botão de Inserção */}
        <div className="p-4 px-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 transition"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={parsedRows.length === 0}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm ${
              parsedRows.length > 0
                ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer active:scale-95'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Inserir {parsedRows.length} Itens na Proposta</span>
          </button>
        </div>

      </div>
    </div>
  );
};
