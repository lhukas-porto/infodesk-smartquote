import React, { useState, useMemo } from 'react';
import { 
  Send, 
  Mail, 
  Paperclip, 
  Check,
  FileText
} from 'lucide-react';
import { CompanySettings, Quote } from '../types';
import { generateProposalEmailHtml } from '../utils/aiEmailParser';

interface EmailSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: Quote;
  settings: CompanySettings;
  onConfirmSend: (quote: Quote) => Promise<void> | void;
  connectedUserEmail?: string | null;
  onSwitchAccount?: () => Promise<void> | void;
}

export const EmailSendModal: React.FC<EmailSendModalProps> = ({
  isOpen,
  onClose,
  quote,
  settings,
  onConfirmSend,
  connectedUserEmail,
  onSwitchAccount
}) => {
  const [isSending, setIsSending] = useState(false);
  const [isSentSuccess, setIsSentSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const proposalHtml = useMemo(() => {
    return generateProposalEmailHtml(quote, settings);
  }, [quote, settings]);

  const defaultSubject = (quote.subject && quote.subject !== 'Fornecimento de produtos para informática' && quote.subject !== 'Fornecimento de Materiais e Equipamentos')
    ? quote.subject
    : `Proposta Comercial ${quote.code} — Infodesk — Fornecimento de Produtos`;
  const defaultBody = `Prezada(o) ${quote.contactPerson || 'Cliente'},\n\nEm atenção à solicitação de Vossa Senhoria, encaminhamos a proposta comercial para fornecimento dos produtos para ${quote.clientCompany || 'sua empresa'}.\n\nValor Total: R$ ${quote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nCondições de Pagamento: ${quote.paymentTerms}\nPrazo de Entrega: ${quote.deliveryDays}\nGarantia: ${quote.warrantyTerms}\n\nAtenciosamente,\n${settings.representativeName}\nInfodesk — Informática & Tecnologia\nTelefone: ${settings.phone}\nWhatsApp: ${settings.whatsapp}\n${settings.address} – ${settings.cityState}`;

  // ⚠️ Todos os hooks devem ficar ANTES de qualquer early return (Rules of Hooks)
  const initialTo = quote.recipientEmails || quote.clientEmail || '';
  const initialCc = quote.ccEmails || '';
  const [toEmails, setToEmails] = useState(initialTo);
  const [ccEmails, setCcEmails] = useState(initialCc);
  const [showCc, setShowCc] = useState(Boolean(initialCc));
  const [subject, setSubject] = useState(defaultSubject);
  const [bodyText, setBodyText] = useState(defaultBody);

  const handleCancel = () => {
    setIsSending(false);
    setIsSentSuccess(false);
    setSendError(null);
    onClose();
  };

  // Sincronizar quando a proposta mudar ou o modal abrir
  React.useEffect(() => {
    if (isOpen) {
      setIsSending(false);
      setIsSentSuccess(false);
      setSendError(null);
      setToEmails(quote.recipientEmails || quote.clientEmail || '');
      setCcEmails(quote.ccEmails || '');
      if (quote.ccEmails) setShowCc(true);

      const computedSubject = (quote.subject && quote.subject !== 'Fornecimento de produtos para informática' && quote.subject !== 'Fornecimento de Materiais e Equipamentos')
        ? quote.subject
        : `Proposta Comercial ${quote.code} — Infodesk — Fornecimento de Produtos`;
      setSubject(computedSubject);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quote.id, quote.clientEmail, quote.recipientEmails, quote.ccEmails, quote.subject, quote.code, isOpen]);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!toEmails.trim()) {
      setSendError('Por favor, informe ao menos um e-mail de destinatário.');
      return;
    }

    setSendError(null);
    setIsSending(true);

    try {
      const finalSubject = subject.trim() || `Proposta Comercial ${quote.code} — Infodesk — Fornecimento de Produtos`;

      await onConfirmSend({
        ...quote,
        clientEmail: toEmails.split(/[,;]/)[0]?.trim() || quote.clientEmail,
        recipientEmails: toEmails.trim(),
        ccEmails: ccEmails.trim(),
        subject: finalSubject,
        status: 'sent',
        sentAt: new Date().toISOString()
      });

      setIsSending(false);
      setIsSentSuccess(true);
      setTimeout(() => {
        setIsSentSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Erro ao disparar e-mail:', err);
      setIsSending(false);
      setIsSentSuccess(false);
      setSendError(err?.message || 'Ocorreu um erro ao enviar o e-mail via Google Workspace.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl overflow-hidden shadow-xl animate-scaleIn space-y-4">
        
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-xl text-sky-600">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Disparar Proposta Comercial por E-mail
              </h2>
              <p className="text-xs text-slate-500">
                Envio autenticado pelo Google Workspace com cópia automática em "Itens Enviados"
              </p>
            </div>
          </div>

          <button
            onClick={handleCancel}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/50 transition cursor-pointer"
            title="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          
          {sendError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex flex-col gap-2 animate-fadeIn">
              <div className="flex items-start gap-2">
                <span className="font-bold text-rose-800">⚠️ Falha no envio:</span>
                <span className="flex-1 font-medium">{sendError}</span>
              </div>
              {onSwitchAccount && (
                <div className="flex items-center gap-2 pt-1 border-t border-rose-200/60 text-[11px]">
                  <span>Escolheu a conta errada ou token expirou?</span>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsSending(false);
                      setSendError(null);
                      await onSwitchAccount();
                    }}
                    className="font-bold text-sky-700 hover:text-sky-900 underline cursor-pointer"
                  >
                    Clique aqui para trocar de conta Google
                  </button>
                </div>
              )}
            </div>
          )}
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-600 font-bold">
                  Destinatários (Para:) *
                </label>
                {!showCc && (
                  <button
                    type="button"
                    onClick={() => setShowCc(true)}
                    className="text-[10px] text-sky-600 hover:text-sky-800 hover:underline font-semibold"
                  >
                    + Adicionar Cópia (Cc)
                  </button>
                )}
              </div>
              <input
                type="text"
                value={toEmails}
                onChange={(e) => setToEmails(e.target.value)}
                placeholder="email1@empresa.com, email2@empresa.com"
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-medium focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-xs"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Separe múltiplos e-mails por vírgula ou ponto e vírgula
              </span>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Remetente (Google Workspace)</label>
              {(() => {
                const repFirst = (settings.representativeName || '').trim().split(/\s+/)[0] || 'Lucas';
                const trade = (settings.tradeName || 'Infodesk').trim();
                const senderDisplayName = `${repFirst} - ${trade}`;
                return (
                  <input
                    type="text"
                    value={`${senderDisplayName} <${(settings.email || '').toLowerCase()}>`}
                    readOnly
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-600 font-medium focus:outline-none text-xs"
                  />
                );
              })()}
            </div>
          </div>

          {showCc && (
            <div className="bg-sky-50/50 p-3 rounded-xl border border-sky-100">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-700 font-bold text-[11px]">
                  Com Cópia (Cc):
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setCcEmails('');
                    setShowCc(false);
                  }}
                  className="text-[10px] text-slate-400 hover:text-red-500"
                >
                  Remover Cc
                </button>
              </div>
              <input
                type="text"
                value={ccEmails}
                onChange={(e) => setCcEmails(e.target.value)}
                placeholder="copia1@empresa.com, copia2@empresa.com"
                className="w-full bg-white border border-sky-200 rounded-lg px-3 py-1.5 text-slate-900 font-medium focus:outline-none focus:border-sky-500 text-xs"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700">
                Assunto do E-mail *
              </label>
              <span className="text-[10px] text-slate-400">
                Título oficial que o cliente verá na caixa de entrada
              </span>
            </div>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={`Ex: Proposta Comercial ${quote.code} — Infodesk — Fornecimento de Produtos`}
              className="w-full bg-white border border-slate-300 hover:border-sky-400 focus:border-sky-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-sky-100 transition shadow-2xs"
            />
          </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-slate-700 font-bold">
                  Conteúdo do E-mail (Proposta Oficial Embutida no Corpo)
                </label>
                <span className="text-[10px] text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200 font-semibold">
                  Sem anexo • Proposta formatada direto no corpo
                </span>
              </div>

              {/* Pré-visualização rica do corpo do e-mail com a proposta formatada */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-600 font-semibold text-[11px]">
                    <FileText className="w-3.5 h-3.5 text-sky-600" />
                    <span>Visualização do E-mail como o cliente receberá:</span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Fonte padrão Verdana • Tabela Oficial Infodesk
                  </span>
                </div>
                <div className="p-4 max-h-72 overflow-y-auto bg-white">
                  <div 
                    className="prose prose-xs max-w-none text-slate-900 pointer-events-none select-none text-[11px]"
                    dangerouslySetInnerHTML={{ __html: proposalHtml }}
                  />
                </div>
              </div>
            </div>

        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>
              Conta conectada: <strong className="font-mono text-slate-800">{connectedUserEmail || settings.googleAccountEmail || 'Google Workspace'}</strong>
            </span>
            {onSwitchAccount && (
              <button
                type="button"
                onClick={async () => {
                  setIsSending(false);
                  setSendError(null);
                  await onSwitchAccount();
                }}
                className="ml-1 text-[11px] text-sky-600 hover:text-sky-800 hover:underline font-semibold cursor-pointer"
                title="Conectar com outra conta Google"
              >
                (Trocar Conta)
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 bg-slate-100 text-slate-600 hover:text-slate-900 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSend}
              disabled={isSending || isSentSuccess}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer ${
                isSentSuccess
                  ? 'bg-emerald-600 text-white'
                  : isSending
                  ? 'bg-sky-500 text-white opacity-90 cursor-wait'
                  : 'bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white'
              }`}
            >
              {isSentSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>E-mail Enviado com Sucesso!</span>
                </>
              ) : isSending ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  <span>Enviando via Workspace...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Confirmar & Enviar Agora</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
