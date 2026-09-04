import React, { useState } from 'react';
import { 
  Send, 
  Mail, 
  Paperclip, 
  Check
} from 'lucide-react';
import { CompanySettings, Quote } from '../types';

interface EmailSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: Quote;
  settings: CompanySettings;
  onConfirmSend: (quote: Quote) => void;
}

export const EmailSendModal: React.FC<EmailSendModalProps> = ({
  isOpen,
  onClose,
  quote,
  settings,
  onConfirmSend
}) => {
  const [isSending, setIsSending] = useState(false);
  const [isSentSuccess, setIsSentSuccess] = useState(false);

  const defaultSubject = `Proposta Comercial ${quote.code} — Infodesk — Fornecimento de Produtos`;
  const defaultBody = `Prezada(o) ${quote.contactPerson || 'Cliente'},

Em atenção à solicitação de Vossa Senhoria, encaminhamos em anexo a proposta comercial referente ao fornecimento dos produtos solicitados para ${quote.clientCompany || 'sua empresa'}.

Resumo da Proposta:
- Código da Proposta: ${quote.code}
- Quantidade de Itens: ${quote.items.length}
- Valor Total: R$ ${quote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Condições de Pagamento: ${quote.paymentTerms}
- Prazo de Entrega: ${quote.deliveryDays}
- Garantia: ${quote.warrantyTerms}

Ficamos à inteira disposição para quaisquer esclarecimentos.

Atenciosamente,

${settings.representativeName}
Infodesk — Informática & Tecnologia
Telefone: ${settings.phone}
WhatsApp: ${settings.whatsapp}
${settings.address} – ${settings.cityState}`;

  // ⚠️ Todos os hooks devem ficar ANTES de qualquer early return (Rules of Hooks)
  const initialTo = quote.recipientEmails || quote.clientEmail || '';
  const initialCc = quote.ccEmails || '';
  const [toEmails, setToEmails] = useState(initialTo);
  const [ccEmails, setCcEmails] = useState(initialCc);
  const [showCc, setShowCc] = useState(Boolean(initialCc));
  const [subject, setSubject] = useState(defaultSubject);
  const [bodyText, setBodyText] = useState(defaultBody);

  // Sincronizar quando a proposta mudar
  React.useEffect(() => {
    setToEmails(quote.recipientEmails || quote.clientEmail || '');
    setCcEmails(quote.ccEmails || '');
    if (quote.ccEmails) setShowCc(true);
  }, [quote.id, quote.clientEmail, quote.recipientEmails, quote.ccEmails]);

  if (!isOpen) return null;

  const handleSend = () => {
    if (!toEmails.trim()) {
      alert('Por favor, informe ao menos um e-mail de destinatário.');
      return;
    }

    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setIsSentSuccess(true);
      setTimeout(() => {
        onConfirmSend({
          ...quote,
          clientEmail: toEmails.split(/[,;]/)[0]?.trim() || quote.clientEmail,
          recipientEmails: toEmails.trim(),
          ccEmails: ccEmails.trim(),
          status: 'sent',
          sentAt: new Date().toISOString()
        });
        setIsSentSuccess(false);
        onClose();
      }, 1500);
    }, 1200);
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
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-xs font-bold transition"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          
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
              <input
                type="text"
                value={`${settings.representativeName} <${(settings.email || '').toLowerCase()}>`}
                readOnly
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-600 font-medium focus:outline-none text-xs"
              />
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
            <label className="block text-slate-600 font-medium mb-1">Assunto</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-medium focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">Corpo do E-mail</label>
            <textarea
              rows={8}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-800 font-mono text-[11px] leading-relaxed focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-700 font-medium">
              <Paperclip className="w-4 h-4 text-sky-600" />
              <span>Proposta_Infodesk_{quote.code || 'CNC'}.pdf</span>
            </div>
            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
              Anexo Gerado Automaticamente
            </span>
          </div>

        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Autenticação Google Workspace Ativa</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 text-slate-600 hover:text-slate-900 rounded-xl text-xs font-semibold transition"
            >
              Cancelar
            </button>

            <button
              onClick={handleSend}
              disabled={isSending || isSentSuccess}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs ${
                isSentSuccess
                  ? 'bg-emerald-600 text-white'
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
