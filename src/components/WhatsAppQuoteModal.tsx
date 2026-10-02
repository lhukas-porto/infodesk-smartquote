// src/components/WhatsAppQuoteModal.tsx
// Modal de envio e cópia de proposta para WhatsApp B2B

import React, { useState } from 'react';
import { X, Copy, Check, MessageSquare, ExternalLink, Send } from 'lucide-react';
import { Quote, CompanySettings } from '../types';
import { buildWhatsAppQuoteMessage, openWhatsAppWithQuote } from '../utils/whatsappFormatter';

interface WhatsAppQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: Quote;
  settings?: CompanySettings;
}

export const WhatsAppQuoteModal: React.FC<WhatsAppQuoteModalProps> = ({
  isOpen,
  onClose,
  quote,
  settings
}) => {
  const [copied, setCopied] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(quote.clientPhone || '');

  if (!isOpen) return null;

  const messageText = buildWhatsAppQuoteMessage(quote, settings);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(messageText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = messageText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('Falha ao copiar texto do WhatsApp:', e);
    }
  };

  const handleSend = () => {
    openWhatsAppWithQuote(quote, settings, phoneNumber);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
      <div 
        className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-xl w-full flex flex-col overflow-hidden animate-scaleIn max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  Proposta Comercial no WhatsApp
                </h3>
                <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-mono font-bold rounded-md uppercase">
                  {quote.code || 'COTACAO'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Envie o resumo executivo direto para o comprador fechar a compra com agilidade.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition"
            title="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Campo de Telefone do Destinatário */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Número de WhatsApp do Comprador / Cliente
            </label>
            <div className="relative">
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 rounded-xl text-xs sm:text-sm text-slate-900 font-mono"
              />
              <span className="absolute right-3 top-2.5 text-xs text-slate-400">
                {quote.contactPerson ? `Comprador: ${quote.contactPerson}` : ''}
              </span>
            </div>
          </div>

          {/* Prévia da Mensagem Diagramada */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Prévia da Mensagem Formatada
              </label>
              <span className="text-[11px] text-slate-400">
                {quote.items?.length || 0} produto(s) cotado(s)
              </span>
            </div>

            <div className="relative bg-slate-900 text-slate-100 rounded-2xl p-4 font-mono text-xs leading-relaxed max-h-72 overflow-y-auto whitespace-pre-wrap select-text border border-slate-800 shadow-inner">
              {messageText}
            </div>
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition"
          >
            Fechar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className={`h-10 px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Texto Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-500" />
                  <span>Copiar Mensagem</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSend}
              className="h-10 px-4.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>Abrir no WhatsApp</span>
              <ExternalLink className="w-3.5 h-3.5 text-emerald-200" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
