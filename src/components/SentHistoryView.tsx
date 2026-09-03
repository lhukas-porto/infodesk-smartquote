import React from 'react';
import { 
  Send, 
  CheckCircle2, 
  Eye
} from 'lucide-react';
import { Quote } from '../types';

interface SentHistoryViewProps {
  quotes: Quote[];
  onOpenQuote: (quote: Quote) => void;
}

export const SentHistoryView: React.FC<SentHistoryViewProps> = ({
  quotes,
  onOpenQuote
}) => {
  return (
    <div className="space-y-6">
      
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-sky-600" />
            <h1 className="text-xl font-bold text-slate-900">Histórico de Propostas & E-mails Enviados</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Registro sincronizado de todas as cotações emitidas e enviadas pelo Google Workspace da Infodesk.
          </p>
        </div>

        <span className="px-3 py-1 bg-slate-100 text-sky-800 text-xs font-bold rounded-lg border border-slate-200">
          {quotes.length} {quotes.length === 1 ? 'proposta registrada' : 'propostas registradas'}
        </span>
      </div>

      {quotes.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-lg mx-auto shadow-xs space-y-3">
          <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mx-auto border border-sky-100">
            <Send className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Nenhuma Proposta Registrada Ainda</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Assim que você salvar rascunhos ou disparar cotações por e-mail para seus clientes, o histórico completo com margens, valores e arquivos gerados será exibido aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quotes.map((q) => (
            <div
              key={q.id}
              className="bg-white border border-slate-200 hover:border-slate-300 p-5 rounded-2xl shadow-xs transition flex flex-col justify-between space-y-4 group"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                    {q.code || 'PROPOSTA'}
                  </span>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Enviado
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-sm group-hover:text-sky-700 transition">
                  {q.clientCompany}
                </h3>
                <p className="text-xs text-slate-500">{q.contactPerson} • {q.clientEmail}</p>

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
                      R$ {q.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>{q.date}</span>
                <button
                  onClick={() => onOpenQuote(q)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-lg font-semibold transition flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5 text-sky-600" />
                  <span>Ver Proposta</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};
