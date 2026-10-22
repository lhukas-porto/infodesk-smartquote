// src/utils/whatsappFormatter.ts
// Formatação de propostas comerciais e listas de itens para fechamento rápido via WhatsApp B2B

import { Quote, CompanySettings } from '../types';

/**
 * Limpa e formata o telefone para o padrão internacional do WhatsApp (DDI 55 + DDD + Número)
 */
export function formatPhoneForWhatsApp(rawPhone?: string): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';

  // Se já tiver 55 no início e tiver 12 ou 13 dígitos
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  // Se tiver 10 ou 11 dígitos (DDD + número)
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

/**
 * Constrói a mensagem comercial diagramada para WhatsApp (Proposta Comercial Completa)
 */
export function buildWhatsAppQuoteMessage(
  quote: Quote, 
  settings?: CompanySettings,
  itemIdsToInclude?: string[]
): string {
  const contactName = quote.contactPerson ? quote.contactPerson.trim() : '';
  const companyName = quote.clientCompany ? quote.clientCompany.trim() : 'sua empresa';
  const greeting = contactName ? `Olá, ${contactName}!` : `Olá!`;
  
  const repName = settings?.representativeName || 'Lucas Porto';
  const companyTrade = settings?.tradeName || 'Infodesk';
  const companyPhone = settings?.phone || '(61) 9 9627-2630';

  const allItems = quote.items || [];
  const items = itemIdsToInclude && itemIdsToInclude.length > 0
    ? allItems.filter(it => itemIdsToInclude.includes(it.id))
    : allItems;

  const totalAmount = itemIdsToInclude && itemIdsToInclude.length > 0
    ? items.reduce((acc, it) => acc + ((it.unitPrice || 0) * (it.quantity || 1)), 0)
    : quote.totalAmount;

  const totalFormatted = totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const itemsLines = items.map((item, index) => {
    const qty = item.quantity || 1;
    const unit = item.unit || 'un.';
    const unitPrice = item.unitPrice ? item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00';
    const subtotal = ((item.unitPrice || 0) * qty).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const partNumberInfo = item.partNumber ? ` (PN: ${item.partNumber})` : '';

    return `*${index + 1}.* ${item.name}${partNumberInfo}\n   ▪ *Qtd:* ${qty} ${unit} | *Unit:* R$ ${unitPrice} | *Subtotal:* R$ ${subtotal}`;
  });

  const parts = [
    greeting,
    `Segue o resumo da proposta comercial *#${quote.code || 'PROPOSTA'}* para *${companyName}*:`,
    '',
    `📦 *ITENS DA PROPOSTA:*`,
    itemsLines.join('\n\n'),
    '',
    `💰 *VALOR TOTAL:* R$ ${totalFormatted}`,
    `📅 *Prazo de Entrega:* ${quote.deliveryDays || 'Imediato / a combinar'}`,
    `💳 *Condições de Pagamento:* ${quote.paymentTerms || '28 DDL (Faturado)'}`,
    `🛡️ *Garantia:* ${quote.warrantyTerms || '12 meses contra defeitos de fabricação'}`,
    quote.deliveryLocation ? `📍 *Local de Entrega:* ${quote.deliveryLocation}` : null,
    '',
    `Ficamos à disposição para faturamento imediato ou qualquer dúvida!`,
    `Atenciosamente,`,
    `*${repName}* | *${companyTrade}*`,
    `Telefone/WhatsApp: ${companyPhone}`
  ];

  return parts.filter(Boolean).join('\n');
}

/**
 * Constrói texto limpo para WhatsApp contendo apenas Itens e Quantidades (sem valores),
 * ideal para cotação rápida com fornecedores, logística ou conferência de lista de compras.
 */
export function buildWhatsAppItemsOnlyMessage(
  quote: Quote, 
  settings?: CompanySettings, 
  itemIdsToInclude?: string[]
): string {
  const allItems = quote.items || [];
  const items = itemIdsToInclude && itemIdsToInclude.length > 0
    ? allItems.filter(it => itemIdsToInclude.includes(it.id))
    : allItems;

  const repName = settings?.representativeName || 'Lucas Porto';
  const companyTrade = settings?.tradeName || 'Infodesk';
  const companyPhone = settings?.phone || '(61) 9 9627-2630';
  const codeHeader = quote.code ? ` - Ref: #${quote.code}` : '';

  const itemsLines = items.map((item, index) => {
    const qty = item.quantity || 1;
    const unit = item.unit || 'un.';
    const partNumberInfo = item.partNumber ? ` (PN: ${item.partNumber.trim()})` : '';

    return `*${index + 1}.* ${item.name}${partNumberInfo}\n   ▪ *Quantidade:* ${qty} ${unit}`;
  });

  const parts = [
    `📦 *LISTA DE ITENS PARA COTAÇÃO${codeHeader}*`,
    `Favor verificar disponibilidade e melhores valores para os seguintes itens:`,
    '',
    itemsLines.join('\n\n'),
    '',
    `Total: ${items.length} produto(s)`,
    `Solicitado por: *${repName}* | *${companyTrade}*`,
    `WhatsApp: ${companyPhone}`
  ];

  return parts.filter(Boolean).join('\n');
}

/**
 * Abre o WhatsApp Web ou Desktop com uma mensagem pré-carregada
 */
export function openWhatsAppWithMessage(message: string, customPhone?: string): void {
  const cleanPhone = formatPhoneForWhatsApp(customPhone);
  const encodedText = encodeURIComponent(message);

  let url = `https://api.whatsapp.com/send?text=${encodedText}`;
  if (cleanPhone) {
    url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  }

  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Abre o WhatsApp Web ou Desktop com a proposta completa
 */
export function openWhatsAppWithQuote(quote: Quote, settings?: CompanySettings, customPhone?: string): void {
  const message = buildWhatsAppQuoteMessage(quote, settings);
  openWhatsAppWithMessage(message, customPhone || quote.clientPhone);
}
