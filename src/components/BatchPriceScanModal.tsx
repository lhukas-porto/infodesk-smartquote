import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Zap, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Store, 
  ExternalLink, 
  Play, 
  Square, 
  CheckSquare, 
  Sparkles,
  ArrowRight,
  RotateCcw
} from 'lucide-react';
import { QuoteItem } from '../types';
import { 
  executeConcurrentBatchScan, 
  BatchItemTarget, 
  BatchItemProgress, 
  BatchScanOverallProgress 
} from '../services/batchScannerService';

interface BatchPriceScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: QuoteItem[];
  onApplyResults: (updates: Map<string, Partial<QuoteItem>>) => void;
}

export const BatchPriceScanModal: React.FC<BatchPriceScanModalProps> = ({
  isOpen,
  onClose,
  items,
  onApplyResults
}) => {
  const [itemStatuses, setItemStatuses] = useState<Map<string, BatchItemProgress>>(new Map());
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [overallProgress, setOverallProgress] = useState<BatchScanOverallProgress>({
    total: 0,
    completed: 0,
    foundCount: 0,
    cachedCount: 0,
    percent: 0,
    isFinished: false
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Inicializa a lista de itens quando o modal é aberto
  useEffect(() => {
    if (isOpen && items.length > 0) {
      const initialMap = new Map<string, BatchItemProgress>();
      const initialSelected = new Set<string>();

      items.forEach(it => {
        initialMap.set(it.id, {
          id: it.id,
          itemNumber: it.itemNumber,
          name: it.name,
          status: it.costPrice && it.costPrice > 0 ? 'found' : 'pending',
          costPrice: it.costPrice || 0,
          supplier: it.supplier || '',
          buyUrl: it.sourceUrl || '',
          imageUrl: it.imageUrl || '',
          ncm: it.ncm || ''
        });

        // Pré-seleciona para atualizar todos que estão pendentes ou que receberem novos preços
        initialSelected.add(it.id);
      });

      setItemStatuses(initialMap);
      setSelectedItemIds(initialSelected);
      setOverallProgress({
        total: items.length,
        completed: 0,
        foundCount: 0,
        cachedCount: 0,
        percent: 0,
        isFinished: false
      });
    }
  }, [isOpen, items]);

  if (!isOpen) return null;

  const handleStartScan = async () => {
    if (items.length === 0 || isScanning) return;

    setIsScanning(true);
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    const targets: BatchItemTarget[] = items.map(it => ({
      id: it.id,
      itemNumber: it.itemNumber,
      name: it.name,
      partNumber: it.partNumber || (it as any).sku,
      quantity: it.quantity,
      currentCost: it.costPrice
    }));

    try {
      await executeConcurrentBatchScan(targets, {
        concurrencyLimit: 3,
        abortSignal: abortCtrl.signal,
        onItemProgress: (prog) => {
          setItemStatuses(prev => {
            const next = new Map(prev);
            next.set(prog.id, prog);
            return next;
          });

          // Se achou preço, garante que o item está marcado para aplicação
          if (prog.status === 'found' || prog.status === 'cached') {
            setSelectedItemIds(prev => new Set(prev).add(prog.id));
          }
        },
        onOverallProgress: (overall) => {
          setOverallProgress(overall);
        }
      });
    } catch (err) {
      console.error('Erro durante varredura concorrente:', err);
    } finally {
      setIsScanning(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopScan = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsScanning(false);
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedItemIds.size === items.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(items.map(it => it.id)));
    }
  };

  const handleApplyToQuote = () => {
    const updates = new Map<string, Partial<QuoteItem>>();

    itemStatuses.forEach((status, id) => {
      if (selectedItemIds.has(id) && (status.status === 'found' || status.status === 'cached') && status.costPrice && status.costPrice > 0) {
        const itemUpdate: Partial<QuoteItem> = {
          costPrice: status.costPrice
        };
        if (status.supplier) itemUpdate.supplier = status.supplier;
        if (status.buyUrl) itemUpdate.sourceUrl = status.buyUrl;
        if (status.imageUrl) {
          itemUpdate.imageUrl = status.imageUrl;
          itemUpdate.showImage = true;
        }
        if (status.ncm) itemUpdate.ncm = status.ncm;

        updates.set(id, itemUpdate);
      }
    });

    if (updates.size === 0) {
      alert('Nenhum item com preço localizado foi selecionado para atualização.');
      return;
    }

    onApplyResults(updates);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center">
              <Zap className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="sq-page-title">Varredura de Preços em Lote (IA)</h2>
                <span className="sq-badge-code">MEL-03</span>
              </div>
              <p className="sq-page-subtitle">
                Pesquisa concorrente de custos, distribuidores e fotos em tempo real
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dashboard de Métricas Rápidas */}
        <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-2xs">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Total de Itens</span>
            <span className="text-lg font-bold text-slate-900 font-mono">{overallProgress.total}</span>
            <span className="block text-[10px] text-slate-400">Na fila para varredura</span>
          </div>

          <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-2xs">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Concluídos</span>
            <span className="text-lg font-bold text-sky-600 font-mono">
              {overallProgress.completed} <span className="text-xs text-slate-400 font-normal">/ {overallProgress.total}</span>
            </span>
            <span className="block text-[10px] text-slate-400">{overallProgress.percent}% concluído</span>
          </div>

          <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-2xs">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Preços Localizados</span>
            <span className="text-lg font-bold text-emerald-600 font-mono">{overallProgress.foundCount}</span>
            <span className="block text-[10px] text-emerald-700/80 font-medium">Disponíveis p/ aplicar</span>
          </div>

          <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-2xs">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Cache / Histórico</span>
            <span className="text-lg font-bold text-purple-600 font-mono">{overallProgress.cachedCount}</span>
            <span className="block text-[10px] text-purple-700/80 font-medium">Resolução a 0ms</span>
          </div>
        </div>

        {/* Barra de Progresso com Animação */}
        {isScanning && (
          <div className="w-full bg-slate-100 h-1.5 relative overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 transition-all duration-300"
              style={{ width: `${overallProgress.percent}%` }}
            />
          </div>
        )}

        {/* Lista de Itens e Status em Tempo Real */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs font-semibold text-slate-600">
            <div className="flex items-center gap-2 cursor-pointer select-none" onClick={toggleSelectAll}>
              {selectedItemIds.size === items.length && items.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-sky-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>Selecionar Todos ({selectedItemIds.size}/{items.length})</span>
            </div>
            <span>Status da Pesquisa</span>
          </div>

          {items.map((item) => {
            const status = itemStatuses.get(item.id);
            const isSelected = selectedItemIds.has(item.id);
            const currentStatus = status?.status || 'pending';

            return (
              <div 
                key={item.id}
                onClick={() => toggleSelectItem(item.id)}
                className={`p-3 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer ${
                  isSelected 
                    ? 'border-sky-200 bg-sky-50/30 hover:bg-sky-50/50' 
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-sky-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        #{item.itemNumber}
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-1">
                        {item.name || 'Produto sem descrição'}
                      </h4>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-3">
                      <span>Qtd: <strong className="text-slate-700">{item.quantity} {item.unit || 'Un.'}</strong></span>
                      {status?.supplier && (
                        <span className="flex items-center gap-1 text-slate-600">
                          <Store className="w-3 h-3 text-slate-400" />
                          {status.supplier}
                        </span>
                      )}
                      {status?.buyUrl && (
                        <a 
                          href={status.buyUrl} 
                          target="_blank" 
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-sky-600 hover:underline flex items-center gap-0.5"
                        >
                          Ver oferta <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Badge de Status Semafórico */}
                <div className="shrink-0 flex items-center justify-end">
                  {currentStatus === 'pending' && (
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold">
                      Na fila
                    </span>
                  )}

                  {currentStatus === 'searching' && (
                    <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                      <span>Pesquisando...</span>
                    </span>
                  )}

                  {currentStatus === 'cached' && (
                    <span className="px-2.5 py-1 bg-purple-50 text-purple-800 border border-purple-200 rounded-lg text-xs font-bold flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-purple-600" />
                      <span>Cache: R$ {status?.costPrice?.toFixed(2)}</span>
                    </span>
                  )}

                  {currentStatus === 'found' && (
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>R$ {status?.costPrice?.toFixed(2)}</span>
                    </span>
                  )}

                  {currentStatus === 'not_found' && (
                    <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                      <span>Não localizado</span>
                    </span>
                  )}

                  {currentStatus === 'error' && (
                    <span className="px-2.5 py-1 bg-rose-100 text-rose-800 border border-rose-200 rounded-lg text-xs font-semibold">
                      Erro na busca
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer com Ações */}
        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="sq-btn-neutral w-full sm:w-auto"
          >
            Fechar
          </button>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            {isScanning ? (
              <button
                type="button"
                onClick={handleStopScan}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition w-full sm:w-auto cursor-pointer"
              >
                <Square className="w-4 h-4 fill-white" />
                <span>Pausar Varredura</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartScan}
                className="sq-btn-primary w-full sm:w-auto flex items-center justify-center gap-2"
              >
                {overallProgress.completed > 0 ? (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Reiniciar Varredura</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Iniciar Varredura em Lote</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              disabled={isScanning || overallProgress.foundCount === 0}
              onClick={handleApplyToQuote}
              className={`sq-btn-emerald w-full sm:w-auto flex items-center justify-center gap-2 ${
                isScanning || overallProgress.foundCount === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span>Aplicar à Cotação ({selectedItemIds.size})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
