import React, { useState } from 'react';
import { 
  Send, 
  CheckCircle2, 
  Eye, 
  FileEdit, 
  FileText, 
  Clock, 
  Search, 
  History, 
  Trash2,
  AlertTriangle,
  X
} from 'lucide-react';
import { Quote } from '../types';

interface SentHistoryViewProps {
  quotes: Quote[];
  onOpenQuote: (quote: Quote) => void;
  onEditQuote?: (quote: Quote) => void;
  onDeleteQuote?: (quote: Quote) => void;
}

export const SentHistoryView: React.FC<SentHistoryViewProps> = ({
  quotes,
  onOpenQuote,
  onEditQuote,
  onDeleteQuote
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'sent'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null);

  const draftsCount = quotes.filter(q => q.status === 'draft').length;
  const sentCount = quotes.filter(q => q.status === 'sent').length;

  const filteredQuotes = quotes.filter(q => {
    const isSent = q.status === 'sent';
    const isDraft = q.status === 'draft' || !q.status;

    if (statusFilter === 'draft' && !isDraft) return false;
    if (statusFilter === 'sent' && !isSent) return false;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const comp = (q.clientCompany || '').toLowerCase();
      const contact = (q.contactPerson || '').toLowerCase();
      const code = (q.code || '').toLowerCase();
      return comp.includes(term) || contact.includes(term) || code.includes(term);
    }

    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-sky-600" />
            <h1 className="text-xl font-bold text-slate-900">Histórico de Propostas & Cotações</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Gerencie seus orçamentos em andamento (rascunhos) e propostas finalizadas/enviadas.
          </p>
        </div>

        {/* Filtros de Status (Todos / Rascunhos / Enviados) */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              statusFilter === 'all'
                ? 'bg-white text-sky-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todos ({quotes.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('draft')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              statusFilter === 'draft'
                ? 'bg-white text-amber-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3 h-3 text-amber-500" />
            <span>Rascunhos ({draftsCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('sent')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              statusFilter === 'sent'
                ? 'bg-white text-emerald-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>Enviados ({sentCount})</span>
          </button>
        </div>
      </div>

      {/* Barra de Busca rápida */}
      {quotes.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar orçamento por empresa, comprador ou código..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>
      )}

      {/* Lista de Cards */}
      {filteredQuotes.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-lg mx-auto shadow-xs space-y-3">
          <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mx-auto border border-sky-100">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            {statusFilter === 'draft' 
              ? 'Nenhum rascunho pendente' 
              : statusFilter === 'sent' 
                ? 'Nenhuma proposta enviada ainda' 
                : 'Nenhuma proposta encontrada'}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {searchTerm 
              ? 'Nenhum resultado corresponde à busca. Tente buscar por outros termos.' 
              : 'Ao salvar orçamentos na tela de Cotação, seus rascunhos e históricos completos aparecerão aqui.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredQuotes.map((q) => {
            const isDraft = q.status === 'draft' || !q.status;
            return (
              <div
                key={q.id}
                className="bg-white border border-slate-200 hover:border-slate-300 p-5 rounded-2xl shadow-xs transition flex flex-col justify-between space-y-4 group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                      {q.code || 'PROPOSTA'}
                    </span>
                    {isDraft ? (
                      <span className="text-[10px] text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1 font-bold">
                        <Clock className="w-3 h-3 text-amber-600" /> Rascunho
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 font-bold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Enviado
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-sky-700 transition">
                    {q.clientCompany}
                  </h3>
                  <div className="text-xs text-slate-500 space-y-0.5">
                    <p className="font-medium text-slate-700">{q.contactPerson}</p>
                    <p className="text-[11px] text-slate-500 break-all">
                      <span className="font-semibold text-slate-600">Para:</span> {q.recipientEmails || q.clientEmail || 'Não informado'}
                    </p>
                    {q.ccEmails && (
                      <p className="text-[10px] text-slate-400 break-all">
                        <span className="font-semibold text-slate-500">Cc:</span> {q.ccEmails}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-1 text-xs">
                    <div className="flex items-center justify-between text-slate-500">
                      <span>Itens Cotados:</span>
                      <span className="font-semibold text-slate-800">{q.items.length} produto(s)</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <span>Margem Média:</span>
                      <span className="font-semibold text-sky-700">{q.averageMargin?.toFixed(1) || 35}%</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <span className="font-bold text-slate-700">Valor Total:</span>
                      <span className="font-mono font-bold text-emerald-700 text-sm">
                        R$ {q.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-slate-400">{q.date}</span>
                  
                  <div className="flex items-center gap-1.5">
                    {onEditQuote && (
                      <button
                        type="button"
                        onClick={() => onEditQuote(q)}
                        className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 hover:text-sky-900 border border-sky-200 rounded-lg font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                        title="Reabrir orçamento diretamente na tela de edição para alterar itens e preços"
                      >
                        <FileEdit className="w-3.5 h-3.5 text-sky-600" />
                        <span>Editar</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenQuote(q)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-lg font-semibold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                      title="Visualizar documento pronto / impressão"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-600" />
                      <span>Ver Proposta</span>
                    </button>
                    {onDeleteQuote && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setQuoteToDelete(q);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition shadow-2xs cursor-pointer"
                        title={`Excluir orçamento ${q.code || ''} do histórico`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Moderno de Confirmação de Exclusão */}
      {quoteToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div 
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-900">
                  Excluir Orçamento?
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Tem certeza que deseja excluir o orçamento <strong className="font-mono text-slate-700">{quoteToDelete.code}</strong> da empresa <strong className="text-slate-700">"{quoteToDelete.clientCompany}"</strong>?
                </p>
                <p className="text-[11px] text-rose-600 font-semibold mt-1">
                  Esta ação não poderá ser desfeita.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuoteToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span>Comprador:</span>
                <span className="font-medium text-slate-800">{quoteToDelete.contactPerson || 'Não informado'}</span>
              </div>
              <div className="flex justify-between">
                <span>Total:</span>
                <span className="font-mono font-bold text-emerald-700">
                  R$ {quoteToDelete.totalAmount?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Itens:</span>
                <span className="font-medium text-slate-800">{quoteToDelete.items?.length || 0} produto(s)</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setQuoteToDelete(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteQuote && quoteToDelete) {
                    onDeleteQuote(quoteToDelete);
                  }
                  setQuoteToDelete(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sim, Excluir</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

