import React, { useState, useEffect } from 'react';
import { Package, X, Plus, Trash2, Check, ArrowRight, Layers, Tag } from 'lucide-react';
import { QuoteItem, QuoteKit } from '../types';
import { getQuoteKits, saveQuoteKit, deleteQuoteKit } from '../utils/storage';

interface KitsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentQuoteItems: QuoteItem[];
  onInsertKitItems: (kitItems: QuoteItem[]) => void;
}

export const KitsModal: React.FC<KitsModalProps> = ({
  isOpen,
  onClose,
  currentQuoteItems,
  onInsertKitItems
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'insert' | 'save'>('insert');
  const [kits, setKits] = useState<QuoteKit[]>(() => getQuoteKits());

  // Form para Salvar Novo Kit
  const [kitName, setKitName] = useState('');
  const [kitDesc, setKitDesc] = useState('');
  const [kitCategory, setKitCategory] = useState('Redes, Conectividade & Telefonia');

  useEffect(() => {
    setKits(getQuoteKits());
  }, [isOpen]);

  const handleSaveCurrentAsKit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kitName.trim() || currentQuoteItems.length === 0) return;

    const newKit: QuoteKit = {
      id: `kit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: kitName.trim(),
      description: kitDesc.trim(),
      category: kitCategory,
      items: currentQuoteItems.map(it => ({
        name: it.name,
        description: it.description,
        partNumber: it.partNumber,
        ncm: it.ncm,
        category: it.category,
        unit: it.unit,
        quantity: it.quantity,
        costPrice: it.costPrice,
        markupPercent: it.markupPercent,
        unitPrice: it.unitPrice,
        totalPrice: it.totalPrice,
        shippingCost: it.shippingCost,
        taxPercent: it.taxPercent,
        imageUrl: it.imageUrl,
        sourceUrl: it.sourceUrl,
        supplier: it.supplier,
        isOptional: it.isOptional
      })),
      createdAt: new Date().toISOString()
    };

    saveQuoteKit(newKit);
    setKits(getQuoteKits());
    setKitName('');
    setKitDesc('');
    setActiveTab('insert');
  };

  const handleDeleteKit = (id: string) => {
    deleteQuoteKit(id);
    setKits(getQuoteKits());
  };

  const handleInsert = (kit: QuoteKit) => {
    const convertedItems: QuoteItem[] = kit.items.map((it, idx) => ({
      ...it,
      id: `item_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
      itemNumber: idx + 1
    }));
    onInsertKitItems(convertedItems);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="sq-section-title text-base md:text-lg">
                Kits e Combos Comerciais
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Reaproveite conjuntos de produtos frequentes com 1 clique
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas Superiores */}
        <div className="flex border-b border-slate-100 px-6 pt-3 bg-white gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('insert')}
            className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'insert'
                ? 'border-sky-600 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Kits Disponíveis ({kits.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('save')}
            className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'save'
                ? 'border-sky-600 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Salvar Proposta Atual como Kit</span>
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'insert' ? (
            <div>
              {kits.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                    <Package className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-700">Nenhum kit comercial salvo ainda</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    Monte uma cotação com produtos que você costuma vender juntos e salve-a na aba "Salvar Proposta Atual como Kit".
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {kits.map(kit => (
                    <div 
                      key={kit.id}
                      className="p-4 rounded-xl border border-slate-200 hover:border-sky-300 bg-white hover:bg-sky-50/20 transition-all shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900">{kit.name}</h4>
                          {kit.category && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
                              {kit.category}
                            </span>
                          )}
                        </div>
                        {kit.description && (
                          <p className="text-xs text-slate-500 line-clamp-1">{kit.description}</p>
                        )}
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-0.5">
                          <span className="font-semibold text-sky-700">{kit.items.length} produtos incluídos</span>
                          <span>•</span>
                          <span>Salvo em {new Date(kit.createdAt).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteKit(kit.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Excluir kit"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInsert(kit)}
                          className="sq-btn-primary py-2 px-3.5 text-xs flex items-center gap-1.5"
                        >
                          <span>Inserir no Orçamento</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSaveCurrentAsKit} className="space-y-4">
              <div>
                <label htmlFor="kit-name-input" className="sq-label">
                  Nome do Kit Comercial
                </label>
                <input
                  id="kit-name-input"
                  type="text"
                  required
                  value={kitName}
                  onChange={(e) => setKitName(e.target.value)}
                  className="sq-input"
                />
              </div>

              <div>
                <label htmlFor="kit-desc-input" className="sq-label">
                  Descrição / Finalidade Comercial
                </label>
                <textarea
                  id="kit-desc-input"
                  rows={2}
                  value={kitDesc}
                  onChange={(e) => setKitDesc(e.target.value)}
                  className="sq-input py-2 h-auto"
                />
              </div>

              <div>
                <label htmlFor="kit-cat-select" className="sq-label">
                  Departamento / Categoria Oficial
                </label>
                <select
                  id="kit-cat-select"
                  value={kitCategory}
                  onChange={(e) => setKitCategory(e.target.value)}
                  className="sq-input"
                >
                  <option value="Informática, Hardware & Periféricos">Informática, Hardware & Periféricos</option>
                  <option value="Redes, Conectividade & Telefonia">Redes, Conectividade & Telefonia</option>
                  <option value="Áudio, Vídeo & Apresentação">Áudio, Vídeo & Apresentação</option>
                  <option value="Monitores, Displays & TVs">Monitores, Displays & TVs</option>
                  <option value="Energia, Nobreaks & Baterias">Energia, Nobreaks & Baterias</option>
                  <option value="Impressão & Automação Comercial">Impressão & Automação Comercial</option>
                  <option value="Papelaria, Artes & Material de Escritório">Papelaria, Artes & Material de Escritório</option>
                  <option value="Elétrica & Iluminação Tática">Elétrica & Iluminação Tática</option>
                  <option value="Construção, Acabamento & Marcenaria">Construção, Acabamento & Marcenaria</option>
                  <option value="Ferramentas & Instrumentos de Medição">Ferramentas & Instrumentos de Medição</option>
                  <option value="Equipamentos & Insumos Industriais">Equipamentos & Insumos Industriais</option>
                  <option value="Eletrodomésticos, Refrigeração & Copa">Eletrodomésticos, Refrigeração & Copa</option>
                  <option value="Limpeza, Higiene & Descartáveis">Limpeza, Higiene & Descartáveis</option>
                  <option value="Pet Shop & Veterinária">Pet Shop & Veterinária</option>
                  <option value="Diversos & Sazonais">Diversos & Sazonais</option>
                </select>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="block text-xs font-semibold text-slate-700 mb-1">
                  Itens a serem incluídos ({currentQuoteItems.length}):
                </span>
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1 text-xs text-slate-600">
                  {currentQuoteItems.map((it, idx) => (
                    <div key={idx} className="flex items-center justify-between py-0.5 border-b border-slate-100 last:border-0">
                      <span className="truncate pr-2">• {it.name || 'Produto sem nome'}</span>
                      <span className="font-mono text-[11px] text-slate-500 shrink-0">{it.quantity} {it.unit}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('insert')}
                  className="sq-btn-neutral"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!kitName.trim() || currentQuoteItems.length === 0}
                  className="sq-btn-primary flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Kit</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
