// src/components/GlobalErrorToaster.tsx
// Diretriz do Lucas: Tolerância Zero a Erros Silenciosos
// Exibe qualquer erro de operação, API ou exceção com destaque visual e botão de cópia rápida.

import React, { useEffect, useState } from 'react';
import { AlertOctagon, X, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { AppErrorEvent, subscribeToErrors, dismissError, getActiveErrors } from '../services/errorReporter';

export const GlobalErrorToaster: React.FC = () => {
  const [errors, setErrors] = useState<AppErrorEvent[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);

  useEffect(() => {
    // Carrega erros iniciais se houver
    setErrors(getActiveErrors());

    const unsubscribe = subscribeToErrors(
      (newError) => {
        setErrors((prev) => [newError, ...prev]);
      },
      (dismissedId) => {
        setErrors((prev) => prev.filter((e) => e.id !== dismissedId));
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  if (errors.length === 0) return null;

  const handleCopy = async (err: AppErrorEvent) => {
    const textToCopy = [
      `🚨 [ERRO SMARTQUOTE]: ${err.title}`,
      `Mensagem: ${err.message}`,
      err.context ? `Contexto: ${err.context}` : null,
      `Data/Hora: ${err.timestamp.toLocaleString('pt-BR')}`,
      err.technicalDetails ? `Detalhes Técnicos:\n${err.technicalDetails}` : null
    ]
      .filter(Boolean)
      .join('\n');

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedId(err.id);
      setTimeout(() => setCopiedId(null), 3000);
    } catch (e) {
      console.error('Falha ao copiar erro:', e);
    }
  };

  return (
    <aside
      aria-label="Notificações de erro do sistema"
      className="fixed top-4 right-4 z-[9999] max-w-lg w-[calc(100vw-2rem)] flex flex-col gap-3 pointer-events-none"
    >
      {errors.map((err) => (
        <div
          key={err.id}
          className="pointer-events-auto bg-white/95 backdrop-blur-md border-2 border-rose-300 shadow-2xl rounded-2xl p-4 text-slate-900 transition-all duration-200 animate-in fade-in slide-in-from-top-4"
          style={{ boxShadow: '0 20px 25px -5px rgba(225, 29, 72, 0.15), 0 8px 10px -6px rgba(225, 29, 72, 0.1)' }}
        >
          {/* Cabeçalho do Erro */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-rose-100 text-rose-700 rounded-lg flex items-center justify-center shrink-0">
                <AlertOctagon className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-rose-100 text-rose-800 rounded-md">
                    Falha Operacional
                  </span>
                  {err.context && (
                    <span className="text-[11px] font-medium text-slate-500 truncate max-w-[200px]" title={err.context}>
                      {err.context}
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-bold text-slate-900 leading-snug mt-0.5">
                  {err.title}
                </h4>
              </div>
            </div>

            <button
              onClick={() => dismissError(err.id)}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
              title="Fechar aviso de erro"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mensagem Principal */}
          <div className="mt-2.5 text-xs text-rose-950 bg-rose-50/70 border border-rose-200/80 rounded-xl p-3 leading-relaxed font-medium select-text break-words">
            {err.message}
          </div>

          {/* Detalhes Técnicos Expansíveis (se houver) */}
          {err.technicalDetails && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setExpandedDetailsId(expandedDetailsId === err.id ? null : err.id)}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 hover:text-rose-900 transition-colors"
              >
                {expandedDetailsId === err.id ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    Ocultar detalhes técnicos
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    Ver detalhes técnicos para suporte
                  </>
                )}
              </button>

              {expandedDetailsId === err.id && (
                <pre className="mt-1.5 p-2 bg-slate-900 text-slate-100 text-[10px] rounded-lg max-h-36 overflow-auto font-mono whitespace-pre-wrap select-text leading-tight">
                  {err.technicalDetails}
                </pre>
              )}
            </div>
          )}

          {/* Rodapé de Ação Rápida */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400">
              {err.timestamp.toLocaleTimeString('pt-BR')}
            </span>

            <button
              type="button"
              onClick={() => handleCopy(err)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs ${
                copiedId === err.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-rose-600 hover:bg-rose-700 text-white'
              }`}
            >
              {copiedId === err.id ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Copiado! Envie no Chat
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copiar Erro para Resolver
                </>
              )}
            </button>
          </div>
        </div>
      ))}
    </aside>
  );
};
