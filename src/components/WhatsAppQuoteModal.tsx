// src/components/WhatsAppQuoteModal.tsx
// Modal de envio e cópia de proposta para WhatsApp B2B (Proposta Comercial ou Lista de Itens & Qtd)

import React, { useState, useMemo } from 'react';
import { X, Copy, Check, MessageSquare, ExternalLink, Send, Package, FileText, CheckSquare, Layers } from 'lucide-react';
import { Quote, CompanySettings } from '../types';
import { 
  buildWhatsAppQuoteMessage, 
  buildWhatsAppItemsOnlyMessage, 
  openWhatsAppWithMessage 
} from '../utils/whatsappFormatter';

export type WhatsAppMessageMode = 'items_only' | 'full';

interface WhatsAppQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: Quote;
  settings?: CompanySettings;
  selectedItemIds?: string[];
  initialMode?: WhatsAppMessageMode;
}

export const WhatsAppQuoteModal: React.FC<WhatsAppQuoteModalProps> = ({
  isOpen,
  onClose,
  quote,
  settings,
  selectedItemIds = [],
  initialMode = 'items_only'
}) => {
  const [copied, setCopied] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(quote.clientPhone || '');
  const [messageMode, setMessageMode] = useState<WhatsAppMessageMode>(initialMode);
  
  // Se houver itens selecionados previamente na tabela, permite alternar entre "Todos" ou "Apenas Selecionados"
  const hasSpecificSelection = selectedItemIds.length > 0 && selectedItemIds.length < (quote.items?.length || 0);
  const [useOnlySelected, setUseOnlySelected] = useState<boolean>(hasSpecificSelection);

  const activeItemIds = useMemo(() => {
    if (useOnlySelected && hasSpecificSelection) {
      return selectedItemIds;
    }
    return undefined;
  }, [useOnlySelected, hasSpecificSelection, selectedItemIds]);

  const activeItemsCount = activeItemIds ? activeItemIds.length : (quote.items?.length || 0);

  const messageText = useMemo(() => {
    if (messageMode === 'items_only') {
      return buildWhatsAppItemsOnlyMessage(quote, settings, activeItemIds);
    }
    return buildWhatsAppQuoteMessage(quote, settings, activeItemIds);
  }, [messageMode, quote, settings, activeItemIds]);

  if (!isOpen) return null;

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
    openWhatsAppWithMessage(messageText, phoneNumber);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
      <div 
        className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-xl w-full flex flex-col overflow-hidden animate-scaleIn max-h-[94vh]"
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
                  Texto Formatado para WhatsApp
                </h3>
                <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-mono font-bold rounded-md uppercase">
                  {quote.code || 'COTAÇÃO'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Gere e copie a mensagem perfeita para fornecedores ou compradores em 1 clique.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
            title="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-5 overflow-y-auto space-y-4">
          
          {/* Seletor de Modelo de Mensagem: Itens & Qtd VS Proposta Completa */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Escolha o formato do texto:
            </label>
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => setMessageMode('items_only')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  messageMode === 'items_only'
                    ? 'bg-white text-emerald-800 shadow-xs border border-emerald-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Package className={`w-4 h-4 ${messageMode === 'items_only' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>Itens & Quantidades</span>
              </button>

              <button
                type="button"
                onClick={() => setMessageMode('full')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  messageMode === 'full'
                    ? 'bg-white text-sky-800 shadow-xs border border-sky-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className={`w-4 h-4 ${messageMode === 'full' ? 'text-sky-600' : 'text-slate-400'}`} />
                <span>Proposta Completa</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 px-1">
              {messageMode === 'items_only'
                ? '📦 Ideal para cotar com fornecedores ou conferência rápida (apenas descrição, Part Number, quantidade e unidade, sem valores monetários).'
                : '💼 Proposta comercial completa para o cliente (com valor unitário, subtotal, valor final, frete, garantia e prazo de entrega).'}
            </p>
          </div>

          {/* Filtro por Itens Selecionados (quando o usuário marcou checkboxes na tabela) */}
          {hasSpecificSelection && (
            <div className="flex items-center justify-between p-2.5 bg-sky-50 border border-sky-200 rounded-xl text-xs">
              <span className="flex items-center gap-1.5 font-medium text-sky-900">
                <CheckSquare className="w-4 h-4 text-sky-600 shrink-0" />
                <span>Existem {selectedItemIds.length} item(ns) marcados na tabela</span>
              </span>
              <label className="inline-flex items-center gap-1.5 font-bold text-sky-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useOnlySelected}
                  onChange={(e) => setUseOnlySelected(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                />
                <span>Incluir apenas os marcados ({selectedItemIds.length})</span>
              </label>
            </div>
          )}

          {/* Campo de Telefone do Destinatário (opcional para envio direto) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Número de WhatsApp do Destinatário (opcional)
            </label>
            <div className="relative">
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 rounded-xl text-xs sm:text-sm text-slate-900 font-mono"
              />
              <span className="absolute right-3 top-2.5 text-xs text-slate-400 pointer-events-none">
                {quote.contactPerson ? `Contato: ${quote.contactPerson}` : ''}
              </span>
            </div>
          </div>

          {/* Prévia da Mensagem Formatada */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <span>Prévia do Texto Copiado</span>
                <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">
                  {messageMode === 'items_only' ? 'Itens & Qtd' : 'Completa'}
                </span>
              </label>
              <span className="text-[11px] text-slate-500 font-medium">
                {activeItemsCount} produto(s)
              </span>
            </div>

            <div className="relative bg-slate-900 text-slate-100 rounded-2xl p-4 font-mono text-xs leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap select-text border border-slate-800 shadow-inner">
              {messageText}
            </div>
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
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
              title="Copiar texto formatado para a área de transferência"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Texto Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-500" />
                  <span>Copiar Texto</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSend}
              className="h-10 px-4.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer active:scale-95"
              title="Abrir no WhatsApp Web ou Desktop"
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
