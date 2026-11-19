import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  Search,
  Check,
  X,
  Layers,
  AlertCircle,
  Trash2,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { Quote } from '../types';
import {
  scanAndRecoverDeletedQuotes,
  restoreRecoveredQuote,
  permanentlyDeleteRecoveredCandidate,
  permanentlyDeleteAllRecoveredCandidates,
  RecoveredCandidate
} from '../utils/storage';

export interface QuoteRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSearchTerm?: string;
  onRestoreQuote: (quote: Quote) => void;
}

export const QuoteRecoveryModal: React.FC<QuoteRecoveryModalProps> = ({
  isOpen,
  onClose,
  initialSearchTerm = '',
  onRestoreQuote
}) => {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [candidates, setCandidates] = useState<RecoveredCandidate[]>([]);
  const [restoredId, setRestoredId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [showConfirmDeleteAll, setShowConfirmDeleteAll] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm(initialSearchTerm || '');
      const found = scanAndRecoverDeletedQuotes(initialSearchTerm || '');
      setCandidates(found);
      setRestoredId(null);
      setConfirmDeleteId(null);
      setShowConfirmDeleteAll(false);
      setActionSuccessMessage(null);
    }
  }, [isOpen, initialSearchTerm]);

  const handleSearch = () => {
    const found = scanAndRecoverDeletedQuotes(searchTerm);
    setCandidates(found);
  };

  const handleRestore = (candidate: RecoveredCandidate) => {
    const restored = restoreRecoveredQuote(candidate.quote);
    setRestoredId(candidate.id);
    setActionSuccessMessage(`Proposta "${candidate.code || candidate.clientCompany}" restaurada com sucesso para os Rascunhos!`);
    onRestoreQuote(restored);
  };

  const handlePermanentDelete = async (candidate: RecoveredCandidate) => {
    try {
      setIsDeletingId(candidate.id);
      await permanentlyDeleteRecoveredCandidate(candidate);
      setCandidates(prev => prev.filter(c => c.id !== candidate.id));
      setConfirmDeleteId(null);
      setActionSuccessMessage(`Proposta "${candidate.code || candidate.clientCompany}" excluída permanentemente do banco de dados e do dispositivo.`);
    } catch (err) {
      console.error('Falha ao excluir permanentemente:', err);
    } finally {
      setIsDeletingId(null);
    }
  };

  const handlePermanentDeleteAll = async () => {
    if (candidates.length === 0) return;
    try {
      setIsDeletingAll(true);
      await permanentlyDeleteAllRecoveredCandidates(candidates);
      setCandidates([]);
      setShowConfirmDeleteAll(false);
      setActionSuccessMessage('Todos os orçamentos da lixeira foram excluídos de vez do banco de dados.');
    } catch (err) {
      console.error('Falha ao esvaziar lixeira:', err);
    } finally {
      setIsDeletingAll(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Central de Recuperação de Propostas e Rascunhos
                </h2>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold rounded-lg uppercase tracking-wider">
                  Lixeira de Segurança
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Restauração de rascunhos ou exclusão definitiva do banco.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
            title="Fechar janela de recuperação"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback de Ação */}
        {actionSuccessMessage && (
          <div className="mx-4 mt-3 px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2 font-medium">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionSuccessMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionSuccessMessage(null)}
              className="text-emerald-600 hover:text-emerald-900 text-xs font-bold"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Barra de Pesquisa */}
        <div className="p-4 border-b border-slate-100 bg-white">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Filtrar por Nome do Cliente, Código ou Produto
            </label>
            {candidates.length > 0 && !showConfirmDeleteAll && (
              <button
                type="button"
                onClick={() => setShowConfirmDeleteAll(true)}
                className="text-xs font-bold text-rose-600 hover:text-rose-800 hover:underline flex items-center gap-1 cursor-pointer transition"
                title="Excluir permanentemente todos os orçamentos listados do banco de dados"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Esvaziar Lixeira Permanentemente</span>
              </button>
            )}
          </div>

          {/* Aviso de Confirmação para Esvaziar Toda a Lixeira */}
          {showConfirmDeleteAll && (
            <div className="mb-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in">
              <div className="flex items-center gap-2 text-rose-800 text-xs font-medium">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  Tem certeza? Isso vai excluir <strong>definitivamente</strong> todos os itens da lixeira do banco de dados e do dispositivo sem possibilidade de volta.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 justify-end">
                <button
                  type="button"
                  onClick={() => setShowConfirmDeleteAll(false)}
                  disabled={isDeletingAll}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handlePermanentDeleteAll}
                  disabled={isDeletingAll}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  {isDeletingAll ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Excluindo do Banco...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Sim, Excluir Tudo de Vez</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                }}
                title="Termo de pesquisa para encontrar orçamento excluído"
                className="w-full h-10 pl-9 pr-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm text-slate-900"
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              className="h-10 px-4 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer shrink-0"
            >
              Pesquisar
            </button>
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setCandidates(scanAndRecoverDeletedQuotes(''));
                }}
                className="h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer shrink-0"
                title="Limpar filtro e listar todos os itens da lixeira"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* Lista de Resultados */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {candidates.length === 0 ? (
            <div className="text-center py-10 px-4">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-200/80 mb-3">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                {searchTerm
                  ? `Nenhum rascunho ou backup encontrado para "${searchTerm}"`
                  : 'Nenhum orçamento encontrado na lixeira de segurança'}
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                {searchTerm
                  ? 'Tente limpar o termo de busca para listar todos os backups disponíveis.'
                  : 'A lixeira está vazia. Qualquer orçamento excluído futuramente aparecerá aqui para recuperação ou descarte.'}
              </p>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setCandidates(scanAndRecoverDeletedQuotes(''));
                  }}
                  className="mt-3 text-xs font-bold text-sky-600 hover:text-sky-800 underline cursor-pointer"
                >
                  Listar todos os orçamentos da lixeira
                </button>
              )}
            </div>
          ) : (
            candidates.map((cand) => {
              const isRestored = restoredId === cand.id;
              const isConfirmingDelete = confirmDeleteId === cand.id;
              const isDeletingThis = isDeletingId === cand.id;

              return (
                <div
                  key={cand.id}
                  className={`p-3.5 rounded-2xl border transition ${
                    isRestored
                      ? 'bg-emerald-50/70 border-emerald-300'
                      : isConfirmingDelete
                      ? 'bg-rose-50/60 border-rose-300'
                      : 'bg-white border-slate-200 hover:border-sky-300 hover:shadow-xs'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-lg">
                          {cand.code}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 truncate">
                          {cand.clientCompany}
                        </h4>
                        {cand.clientName && (
                          <span className="text-xs text-slate-500">
                            ({cand.clientName})
                          </span>
                        )}
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          {cand.sourceLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-600 pt-0.5">
                        <span className="flex items-center gap-1 font-medium">
                          <Layers className="w-3.5 h-3.5 text-slate-400" />
                          <strong>{cand.itemsCount}</strong> itens
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="font-mono font-bold text-emerald-700">
                          R$ {cand.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-[11px] text-slate-400">
                          {cand.date}
                        </span>
                      </div>

                      {/* Prévia dos itens */}
                      {cand.quote.items && cand.quote.items.length > 0 && (
                        <p className="text-[11px] text-slate-500 line-clamp-1 italic pt-0.5">
                          Itens: {cand.quote.items.map(i => i.name).filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>

                    {/* Ações: Restaurar ou Excluir Permanentemente */}
                    <div className="shrink-0 flex items-center justify-end gap-2">
                      {isRestored ? (
                        <div className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-xl">
                          <Check className="w-4 h-4" />
                          <span>Restaurado!</span>
                        </div>
                      ) : isConfirmingDelete ? (
                        <div className="flex items-center gap-1.5 bg-rose-100 p-1 rounded-xl animate-in fade-in">
                          <button
                            type="button"
                            onClick={() => handlePermanentDelete(cand)}
                            disabled={isDeletingThis}
                            className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs transition cursor-pointer flex items-center gap-1"
                            title="Confirmar exclusão definitiva do banco"
                          >
                            {isDeletingThis ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            <span>Excluir de Vez</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={isDeletingThis}
                            className="px-2 py-1.5 bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleRestore(cand)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer active:scale-95"
                            title="Restaurar este orçamento para os Rascunhos ativos"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restaurar Rascunho</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(cand.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-2 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 font-bold text-xs rounded-xl transition cursor-pointer"
                            title="Excluir permanentemente do banco de dados (Supabase) e do dispositivo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Excluir do Banco</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between text-xs text-slate-500">
          <span>
            {candidates.length} orçamento(s) na lixeira
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition cursor-pointer"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
