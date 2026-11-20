import React, { useState } from 'react';
import { X, Copy, Check, MessageSquare, ExternalLink, Send, Phone, Building2, Calendar, ShieldCheck } from 'lucide-react';
import { Quote } from '../types';

interface WhatsAppProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: Quote;
  clientCompanyName?: string;
  clientContactName?: string;
  clientContactPhone?: string;
  deliveryTime?: string;
  paymentTerms?: string;
}

export const WhatsAppProposalModal: React.FC<WhatsAppProposalModalProps> = ({
  isOpen,
  onClose,
  quote,
  clientCompanyName = '',
  clientContactName = '',
  clientContactPhone = '',
  deliveryTime = '05 a 07 dias úteis',
  paymentTerms = '28 DDL'
}) => {
  const [phoneNumber, setPhoneNumber] = useState(clientContactPhone || '');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Montagem do texto executivo para WhatsApp
  const generateMessageText = () => {
    const headerGreeting = clientContactName 
      ? `Olá, ${clientContactName}! Tudo bem?` 
      : 'Olá! Tudo bem?';

    const companyLine = clientCompanyName 
      ? `\n*Cliente:* ${clientCompanyName}` 
      : '';

    const contactLine = clientContactName 
      ? `\n*A/C:* ${clientContactName}` 
      : '';

    // Listagem resumida dos itens (até 6 primeiros itens detalhados se houver muitos)
    const itemsList = (quote.items || []).slice(0, 8).map((it, idx) => {
      return `${idx + 1}. *${it.quantity}x* ${it.name} — R$ ${formatCurrency(it.totalPrice || (it.unitPrice * it.quantity))}`;
    }).join('\n');

    const remainingCount = (quote.items || []).length - 8;
    const remainingText = remainingCount > 0 ? `\n_... e mais ${remainingCount} ite${remainingCount > 1 ? 'ns' : 'm'} detalhado(s) no documento oficial._` : '';

    return `${headerGreeting}

Segue o resumo da nossa proposta comercial:

📄 *PROPOSTA COMERCIAL ${quote.code}*${companyLine}${contactLine}

📦 *RELAÇÃO DE ITENS (${(quote.items || []).length}):*
${itemsList}${remainingText}

💰 *INVESTIMENTO TOTAL:*
• *Valor Total:* *R$ ${formatCurrency(quote.totalAmount)}*

📋 *CONDIÇÕES COMERCIAIS:*
• *Prazo de Entrega:* ${deliveryTime || quote.deliveryDays || '05 a 07 dias úteis'}
• *Condição de Pagamento:* ${paymentTerms || quote.paymentTerms || '28 DDL'}
• *Validade:* ${quote.validityDays || '05 dias corridos'}

Qualquer dúvida ou ajuste que precisar na proposta, estamos à disposição. Podemos garantir o lote e prosseguir com a emissão do pedido?

*Infodesk SmartQuote*`;
  };

  const messageText = generateMessageText();

  const handleCopy = () => {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenWhatsApp = () => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const encoded = encodeURIComponent(messageText);
    const url = cleanPhone 
      ? `https://wa.me/55${cleanPhone.replace(/^55/, '')}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white border border-slate-300 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Topo Modal - Commercial Titanium */}
        <div className="p-4 px-6 bg-[#0f172a] border-b border-[#1e293b] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Fechamento Rápido via WhatsApp
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono rounded">
                  {quote.code}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Resumo executivo pronto para envio direto ao comprador
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

        {/* Corpo do Modal */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Campo de Telefone do Comprador */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-amber-600" />
              <span>WhatsApp do Comprador (Opcional)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full h-10 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-100 outline-none transition font-sans"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Se deixar em branco, o WhatsApp abrirá para você escolher o contato na hora.
            </p>
          </div>

          {/* Prévia da Mensagem */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Mensagem Formatada:</span>
              </label>
              <span className="text-[10px] text-slate-400">
                Total: R$ {formatCurrency(quote.totalAmount)}
              </span>
            </div>
            <textarea
              readOnly
              value={messageText}
              rows={11}
              className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-none resize-none select-all"
            />
          </div>
        </div>

        {/* Rodapé com Ações */}
        <div className="p-4 px-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 transition"
          >
            Fechar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copied ? 'Copiado!' : 'Copiar Texto'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm active:scale-95 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Abrir no WhatsApp</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
