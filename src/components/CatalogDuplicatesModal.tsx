import React, { useState, useMemo } from 'react';
import { 
  Copy, 
  Trash2, 
  Check, 
  GitMerge, 
  AlertTriangle, 
  Search, 
  X, 
  ExternalLink, 
  ShieldCheck,
  Package,
  Layers,
  ArrowRight
} from 'lucide-react';
import { Product } from '../types';
import { normalizeSearchText } from '../utils/aiEmailParser';

export interface DuplicatePair {
  id: string;
  itemA: Product;
  itemB: Product;
  confidence: number; // 0 a 100
  reason: 'exact_part_number' | 'exact_sku' | 'exact_name' | 'high_name_similarity' | 'word_overlap';
  reasonText: string;
}

interface CatalogDuplicatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onDeleteProduct: (productId: string) => Promise<void> | void;
  onUpdateProduct: (product: Product) => Promise<void> | void;
}

function cleanAlphanumeric(text: string): string {
  return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function calculateWordOverlap(text1: string, text2: string): number {
  const words1 = normalizeSearchText(text1).split(/\s+/).filter(w => w.length > 2);
  const words2 = normalizeSearchText(text2).split(/\s+/).filter(w => w.length > 2);
  if (words1.length === 0 || words2.length === 0) return 0;

  const set1 = new Set(words1);
  const set2 = new Set(words2);
  let common = 0;
  for (const w of set1) {
    if (set2.has(w)) common++;
  }

  const unionSize = new Set([...words1, ...words2]).size;
  return unionSize > 0 ? common / unionSize : 0;
}

export const CatalogDuplicatesModal: React.FC<CatalogDuplicatesModalProps> = ({
  isOpen,
  onClose,
  products,
  onDeleteProduct,
  onUpdateProduct
}) => {
  const [ignoredPairIds, setIgnoredPairIds] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'part_number' | 'name' | 'similarity'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  // Algoritmo de Identificação de Duplicatas no Catálogo
  const duplicatePairs = useMemo(() => {
    if (!products || products.length < 2) return [];

    const pairs: DuplicatePair[] = [];
    const seenCombos = new Set<string>();

    for (let i = 0; i < products.length; i++) {
      for (let j = i + 1; j < products.length; j++) {
        const a = products[i];
        const b = products[j];

        if (!a || !b || a.id === b.id) continue;

        const comboKey = a.id < b.id ? `${a.id}_${b.id}` : `${b.id}_${a.id}`;
        if (seenCombos.has(comboKey)) continue;

        const pnA = cleanAlphanumeric(a.partNumber || '');
        const pnB = cleanAlphanumeric(b.partNumber || '');
        const skuA = cleanAlphanumeric(a.sku || '');
        const skuB = cleanAlphanumeric(b.sku || '');
        const nameA = normalizeSearchText(a.name || '');
        const nameB = normalizeSearchText(b.name || '');

        let match: { confidence: number; reason: DuplicatePair['reason']; reasonText: string } | null = null;

        // 1. Mesmo Part Number
        if (pnA && pnB && pnA.length >= 3 && pnA === pnB) {
          match = {
            confidence: 100,
            reason: 'exact_part_number',
            reasonText: `Part Number idêntico: "${a.partNumber}"`
          };
        }
        // 2. Mesmo SKU (excluindo códigos temporários autogerados)
        else if (skuA && skuB && !skuA.startsWith('infauto') && !skuA.startsWith('sku') && skuA === skuB) {
          match = {
            confidence: 98,
            reason: 'exact_sku',
            reasonText: `Código/SKU idêntico: "${a.sku}"`
          };
        }
        // 3. Nomes Idênticos
        else if (nameA && nameB && nameA.length >= 3 && nameA === nameB) {
          match = {
            confidence: 95,
            reason: 'exact_name',
            reasonText: 'Nome do produto idêntico (após normalização)'
          };
        }
        // 4. Um nome contém o outro (ex: "Switch 24p Intelbras" vs "Switch 24p Intelbras SG 2404")
        else if (nameA.length > 8 && nameB.length > 8 && (nameA.includes(nameB) || nameB.includes(nameA))) {
          const shorter = Math.min(nameA.length, nameB.length);
          const longer = Math.max(nameA.length, nameB.length);
          const ratio = shorter / longer;
          if (ratio >= 0.60) {
            const conf = Math.round(75 + ratio * 20);
            match = {
              confidence: conf,
              reason: 'high_name_similarity',
              reasonText: `Alta sobreposição de nome (${Math.round(ratio * 100)}%)`
            };
          }
        }
        // 5. Alta sobreposição de palavras-chave
        else {
          const overlap = calculateWordOverlap(a.name, b.name);
          if (overlap >= 0.65) {
            match = {
              confidence: Math.round(overlap * 90),
              reason: 'word_overlap',
              reasonText: `Vocabulário técnico coincidente (${Math.round(overlap * 100)}%)`
            };
          }
        }

        if (match) {
          seenCombos.add(comboKey);
          pairs.push({
            id: comboKey,
            itemA: a,
            itemB: b,
            confidence: match.confidence,
            reason: match.reason,
            reasonText: match.reasonText
          });
        }
      }
    }

    // Ordena por confiança decrescente (os mais prováveis primeiro)
    return pairs.sort((x, y) => y.confidence - x.confidence);
  }, [products]);

  // Filtra pares ignorados e pelo filtro selecionado
  const activePairs = useMemo(() => {
    return duplicatePairs.filter(p => {
      if (ignoredPairIds.has(p.id)) return false;
      if (filterType === 'part_number' && p.reason !== 'exact_part_number') return false;
      if (filterType === 'name' && p.reason !== 'exact_name') return false;
      if (filterType === 'similarity' && p.reason !== 'high_name_similarity' && p.reason !== 'word_overlap') return false;
      return true;
    });
  }, [duplicatePairs, ignoredPairIds, filterType]);

  const handleKeepItem = async (keepItem: Product, discardItem: Product, pairId: string) => {
    setProcessingId(pairId);
    try {
      await onDeleteProduct(discardItem.id);
      setIgnoredPairIds(prev => new Set(prev).add(pairId));
      showToast(`Produto "${discardItem.name}" removido! Mantido: "${keepItem.name}".`);
    } catch (err: any) {
      alert(`Erro ao apagar produto: ${err?.message || 'Falha na exclusão'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleMergeItems = async (itemA: Product, itemB: Product, pairId: string) => {
    setProcessingId(pairId);
    try {
      // Cria a versão mesclada escolhendo os dados mais ricos
      const bestName = (itemA.name.length >= itemB.name.length) ? itemA.name : itemB.name;
      const bestDesc = (itemA.description && itemA.description.length >= (itemB.description || '').length)
        ? itemA.description
        : (itemB.description || itemA.description || '');
      const bestPn = itemA.partNumber || itemB.partNumber || '';
      const bestSku = itemA.sku || itemB.sku || '';
      const bestNcm = itemA.ncm || itemB.ncm || '';
      const bestCost = (itemA.costPrice > 0 && itemB.costPrice > 0)
        ? Math.min(itemA.costPrice, itemB.costPrice)
        : (itemA.costPrice || itemB.costPrice || 0);
      const bestImage = itemA.imageUrl || itemB.imageUrl || '';
      const bestSupplier = itemA.supplier || itemB.supplier || '';

      const mergedProduct: Product = {
        ...itemA,
        name: bestName,
        description: bestDesc,
        partNumber: bestPn,
        sku: bestSku,
        ncm: bestNcm,
        costPrice: bestCost,
        imageUrl: bestImage,
        supplier: bestSupplier,
        lastUpdated: new Date().toISOString()
      };

      // Atualiza itemA com a versão rica e apaga o itemB redundante
      await onUpdateProduct(mergedProduct);
      await onDeleteProduct(itemB.id);

      setIgnoredPairIds(prev => new Set(prev).add(pairId));
      showToast(`Produtos mesclados com sucesso em "${bestName}" com custo R$ ${bestCost.toFixed(2)}!`);
    } catch (err: any) {
      alert(`Erro ao mesclar produtos: ${err?.message || 'Falha na mesclagem'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleIgnorePair = (pairId: string) => {
    setIgnoredPairIds(prev => new Set(prev).add(pairId));
    showToast('Par mantido como produtos distintos.');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Toast interno de feedback */}
        {successToast && (
          <div className="absolute top-4 right-6 z-60 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-bounce">
            <Check className="w-4 h-4 stroke-[3]" />
            <span>{successToast}</span>
          </div>
        )}

        {/* Header Modal */}
        <div className="p-5 sm:p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-600 border border-amber-200 rounded-2xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Detector Inteligente de Produtos Duplicados
                </h2>
                <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-[11px] font-bold font-mono rounded-full">
                  {activePairs.length} {activePairs.length === 1 ? 'SUSPEITO' : 'SUSPEITOS'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Compare produtos idênticos ou com alta similaridade e decida qual manter, apagar ou mesclar no catálogo.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            title="Fechar detector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Filtros de Suspeita */}
        <div className="px-5 sm:px-6 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-slate-500 mr-1">Filtrar por:</span>
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                filterType === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Todos ({duplicatePairs.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('part_number')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                filterType === 'part_number'
                  ? 'bg-sky-600 text-white'
                  : 'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200/80'
              }`}
            >
              Mesmo Part Number
            </button>
            <button
              type="button"
              onClick={() => setFilterType('name')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                filterType === 'name'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/80'
              }`}
            >
              Nome Idêntico
            </button>
            <button
              type="button"
              onClick={() => setFilterType('similarity')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                filterType === 'similarity'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/80'
              }`}
            >
              Alta Similaridade
            </button>
          </div>

          <div className="text-[11px] text-slate-400 font-medium">
            Total de produtos no catálogo: <strong className="text-slate-700">{products.length}</strong>
          </div>
        </div>

        {/* Lista de Pares Comparativos */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-slate-100/50">
          {activePairs.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-3xl space-y-3">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Nenhuma Duplicata Detectada!</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Parabéns! O catálogo está higienizado e todos os {products.length} produtos possuem códigos, part numbers e descrições únicas.
              </p>
            </div>
          ) : (
            activePairs.map((pair, idx) => {
              const { itemA, itemB, confidence, reasonText } = pair;
              const isProcessing = processingId === pair.id;

              return (
                <div 
                  key={pair.id}
                  className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden transition hover:border-slate-300"
                >
                  {/* Cabeçalho do Card */}
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-xs text-slate-800">
                        {reasonText}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        confidence >= 95
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : confidence >= 80
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-sky-100 text-sky-800 border border-sky-200'
                      }`}>
                        {confidence}% Certeza
                      </span>

                      <button
                        type="button"
                        onClick={() => handleMergeItems(itemA, itemB, pair.id)}
                        disabled={isProcessing}
                        className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                        title="Mesclar o melhor dos 2 em um só cadastro"
                      >
                        <GitMerge className="w-3.5 h-3.5" />
                        <span>Mesclar Ambos</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleIgnorePair(pair.id)}
                        disabled={isProcessing}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold cursor-pointer transition disabled:opacity-50"
                        title="Ignorar e manter ambos no sistema"
                      >
                        Ignorar
                      </button>
                    </div>
                  </div>

                  {/* Comparativo Lado a Lado */}
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 p-4 gap-4 md:gap-0">
                    
                    {/* Opção A */}
                    <div className="md:pr-4 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-start gap-3">
                          {itemA.imageUrl ? (
                            <img
                              src={itemA.imageUrl}
                              alt={itemA.name}
                              className="w-14 h-14 object-cover rounded-xl border border-slate-200 bg-slate-50 shrink-0"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center shrink-0 text-slate-400">
                              <Package className="w-6 h-6" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold font-mono rounded">
                                OPÇÃO A
                              </span>
                              <span className="text-[11px] font-medium text-slate-500">
                                {itemA.category}
                              </span>
                            </div>
                            <h4 className="font-bold text-xs sm:text-sm text-slate-900 mt-1 line-clamp-2">
                              {itemA.name}
                            </h4>
                          </div>
                        </div>

                        {/* Metadados A */}
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <div>
                            <span className="text-slate-400 block text-[10px]">Part Number</span>
                            <strong className="text-slate-800 font-mono">{itemA.partNumber || '—'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">SKU</span>
                            <strong className="text-slate-800 font-mono">{itemA.sku || '—'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Custo Atual</span>
                            <strong className="text-emerald-700 font-bold">R$ {Number(itemA.costPrice || 0).toFixed(2)}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Fornecedor</span>
                            <span className="text-slate-700 truncate block">{itemA.supplier || '—'}</span>
                          </div>
                        </div>

                        {itemA.description && (
                          <p className="mt-2 text-[11px] text-slate-500 line-clamp-2 italic">
                            "{itemA.description}"
                          </p>
                        )}
                      </div>

                      {/* Botão de Decisão A */}
                      <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleKeepItem(itemA, itemB, pair.id)}
                          disabled={isProcessing}
                          className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>MANTER ESTE (Apagar Opção B)</span>
                        </button>
                      </div>
                    </div>

                    {/* Opção B */}
                    <div className="md:pl-4 flex flex-col justify-between space-y-3 pt-3 md:pt-0">
                      <div>
                        <div className="flex items-start gap-3">
                          {itemB.imageUrl ? (
                            <img
                              src={itemB.imageUrl}
                              alt={itemB.name}
                              className="w-14 h-14 object-cover rounded-xl border border-slate-200 bg-slate-50 shrink-0"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center shrink-0 text-slate-400">
                              <Package className="w-6 h-6" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold font-mono rounded">
                                OPÇÃO B
                              </span>
                              <span className="text-[11px] font-medium text-slate-500">
                                {itemB.category}
                              </span>
                            </div>
                            <h4 className="font-bold text-xs sm:text-sm text-slate-900 mt-1 line-clamp-2">
                              {itemB.name}
                            </h4>
                          </div>
                        </div>

                        {/* Metadados B */}
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <div>
                            <span className="text-slate-400 block text-[10px]">Part Number</span>
                            <strong className="text-slate-800 font-mono">{itemB.partNumber || '—'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">SKU</span>
                            <strong className="text-slate-800 font-mono">{itemB.sku || '—'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Custo Atual</span>
                            <strong className="text-emerald-700 font-bold">R$ {Number(itemB.costPrice || 0).toFixed(2)}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Fornecedor</span>
                            <span className="text-slate-700 truncate block">{itemB.supplier || '—'}</span>
                          </div>
                        </div>

                        {itemB.description && (
                          <p className="mt-2 text-[11px] text-slate-500 line-clamp-2 italic">
                            "{itemB.description}"
                          </p>
                        )}
                      </div>

                      {/* Botão de Decisão B */}
                      <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleKeepItem(itemB, itemA, pair.id)}
                          disabled={isProcessing}
                          className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>MANTER ESTE (Apagar Opção A)</span>
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Modal */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {activePairs.length > 0 ? (
              <span>
                💡 Dica: Ao clicar em <strong>"Manter Este"</strong>, a duplicata é excluída instantaneamente do Supabase e do Catálogo.
              </span>
            ) : (
              <span>Catálogo 100% limpo e sem redundâncias.</span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
          >
            Concluir Limpeza
          </button>
        </div>

      </div>
    </div>
  );
};
