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
  const selectedItems = itemIdsToInclude && itemIdsToInclude.length > 0
    ? allItems.filter(it => itemIdsToInclude.includes(it.id))
    : allItems;

  const baseItems = selectedItems.filter(it => !it.isOptional);
  const optionalItems = selectedItems.filter(it => it.isOptional);

  const baseTotal = baseItems.reduce((acc, it) => acc + ((it.unitPrice || 0) * (it.quantity || 1)), 0);
  const optionalTotal = optionalItems.reduce((acc, it) => acc + ((it.unitPrice || 0) * (it.quantity || 1)), 0);

  const formatLine = (item: any, index: number) => {
    const qty = item.quantity || 1;
    const unit = item.unit || 'un.';
    const unitPrice = item.unitPrice ? item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00';
    const subtotal = ((item.unitPrice || 0) * qty).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const partNumberInfo = item.partNumber ? ` (PN: ${item.partNumber})` : '';

    return `*${index + 1}.* ${item.name}${partNumberInfo}\n   ▪ *Qtd:* ${qty} ${unit} | *Unit:* R$ ${unitPrice} | *Subtotal:* R$ ${subtotal}`;
  };

  const baseItemsLines = baseItems.map(formatLine);
  const optionalItemsLines = optionalItems.map(formatLine);

  const totalFormatted = baseTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const optionalFormatted = optionalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const parts = [
    greeting,
    `Segue o resumo da proposta comercial *#${quote.code || 'PROPOSTA'}* para *${companyName}*:`,
    '',
    `📦 *ITENS DA PROPOSTA:*`,
    baseItemsLines.length > 0 ? baseItemsLines.join('\n\n') : 'Nenhum item base selecionado.',
    '',
    optionalItems.length > 0 ? `✨ *ITENS OPCIONAIS & UPGRADES SUGERIDOS:*\n${optionalItemsLines.join('\n\n')}\n\n➕ *Subtotal Opcionais:* + R$ ${optionalFormatted}\n` : null,
    `💰 *VALOR TOTAL${optionalItems.length > 0 ? ' (BASE)' : ''}:* R$ ${totalFormatted}`,
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

  const itemsLines = items.map((item, index) => {
    const qty = item.quantity || 1;
    const unit = item.unit || 'un.';
    const partNumberInfo = item.partNumber ? ` (PN: ${item.partNumber.trim()})` : '';

    return `*${index + 1}.* ${item.name}${partNumberInfo} - *Qtd:* ${qty} ${unit}`;
  });

  return itemsLines.join('\n');
}

/**
 * Constrói mensagem de Follow-up amigável para propostas enviadas aguardando retorno
 */
export function buildWhatsAppFollowUpMessage(quote: Quote, settings?: CompanySettings): string {
  const contactName = quote.contactPerson ? quote.contactPerson.trim() : '';
  const companyName = quote.clientCompany ? quote.clientCompany.trim() : 'sua empresa';
  const greeting = contactName ? `Olá, ${contactName}!` : `Olá!`;
  
  const repName = settings?.representativeName || 'Lucas Porto';
  const companyTrade = settings?.tradeName || 'Infodesk';
  const companyPhone = settings?.phone || '(61) 9 9627-2630';
  const totalFormatted = quote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const parts = [
    `${greeting} Tudo bem?`,
    '',
    `Passando para verificar se você conseguiu avaliar a proposta comercial *#${quote.code || 'PROPOSTA'}* que enviamos para a *${companyName}* no valor de *R$ ${totalFormatted}*.`,
    '',
    `Estamos com as condições e disponibilidade reservadas para você. Caso precise de qualquer ajuste em quantidades, prazos ou formas de pagamento, conte com a gente!`,
    '',
    `Podemos prosseguir com o faturamento e envio?`,
    '',
    `Um abraço,`,
    `*${repName}* | *${companyTrade}*`,
    `WhatsApp: ${companyPhone}`
  ];

  return parts.filter(Boolean).join('\n');
}

/**
 * Constrói texto rápido de 1 item para envio no WhatsApp
 */
export function buildSingleItemWhatsAppText(
  item: { name: string; quantity: number; unit?: string; partNumber?: string; unitPrice?: number; totalPrice?: number }, 
  index?: number
): string {
  const prefix = index !== undefined ? `*${index + 1}.* ` : '▪ ';
  const qty = item.quantity || 1;
  const unit = item.unit || 'un.';
  const partNumberInfo = item.partNumber ? ` (PN: ${item.partNumber.trim()})` : '';

  let text = `${prefix}${item.name}${partNumberInfo}\n  ▪ *Quantidade:* ${qty} ${unit}`;
  if (item.unitPrice && item.unitPrice > 0) {
    const unitFormatted = item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    text += ` | *Unitário:* R$ ${unitFormatted}/${unit}`;
  }
  if (item.totalPrice && item.totalPrice > 0) {
    const totalFormatted = item.totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    text += `\n  ▪ *Total:* R$ ${totalFormatted}`;
  }
  return text;
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
