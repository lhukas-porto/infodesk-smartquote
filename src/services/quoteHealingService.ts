import { Quote, QuoteItem, IncomingEmail } from '../types';
import { saveQuoteItemsBackup, getQuoteItemsBackup, saveQuotes } from '../utils/storage';
import { fetchQuoteItemsByQuoteId, syncQuoteToSupabase } from './supabase';
import { reportError } from './errorReporter';

/**
 * Extrai o nome limpo e comercial do produto a partir do Assunto da proposta / e-mail.
 * Exemplo: "PEDIDO DE ORÇAMENTO SOL.128367- Porta Banner" -> "Porta Banner"
 * Exemplo: "Cotação 9841 - Nobreak Ragtech 1200VA" -> "Nobreak Ragtech 1200VA"
 */
export function extractCleanProductNameFromSubject(subject: string, defaultName: string = 'Item Comercial'): string {
  if (!subject || typeof subject !== 'string') return defaultName;

  let clean = subject.trim();

  // 1. Remove prefixos de e-mail / solicitação comuns
  clean = clean.replace(/^(re:|fwd:|enc:)\s*/gi, '');
  clean = clean.replace(/^(pedido\s+de\s+(orçamento|compra|cotação)|solicitação\s+de\s+(orçamento|compra|cotação)|solicita[çc][ãa]o|orçamento|cotação)\s*:?\s*/gi, '');

  // 2. Remove números de protocolo / solicitação como SOL.128367-, REQ-1234, etc.
  clean = clean.replace(/^(sol\.?\s*\d+|req-?\d+|ped-?\d+|c-?\d+|oc-?\d+)\s*[-:]?\s*/gi, '');

  // 3. Remove "para <cliente>" ou códigos de colchetes
  clean = clean.replace(/\[[^\]]+\]/g, '').trim();

  // 4. Remove hífens soltos no início ou fim
  clean = clean.replace(/^[-—–:\s]+|[-—–:\s]+$/g, '').trim();

  if (!clean || clean.length < 2) {
    return defaultName;
  }

  // Capitaliza elegantemente
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Valida se um item ou lista de itens contém dados comerciais legítimos.
 * Regra de Ouro: Se o item tem custo > 0, preço > 0 ou total > 0, NUNCA PODE SER DESCARTADO.
 */
export function isLegitimateQuoteItem(it: QuoteItem | null | undefined): boolean {
  if (!it || typeof it !== 'object') return false;
  if (!it.name || typeof it.name !== 'string') return false;

  const cost = Number(it.costPrice || 0);
  const unit = Number(it.unitPrice || 0);
  const total = Number(it.totalPrice || 0);
  const qty = Number(it.quantity || 0);

  // Se tem qualquer valor financeiro real ou quantidade positiva com nome válido, é legítimo
  if (cost > 0 || unit > 0 || total > 0) return true;
  if (qty > 0 && it.name.trim().length > 2) return true;

  return false;
}

export function areLegitimateQuoteItems(items: QuoteItem[] | null | undefined): boolean {
  if (!items || !Array.isArray(items) || items.length === 0) return false;
  return items.some(isLegitimateQuoteItem);
}

/**
 * Reconstitui um QuoteItem comercial perfeito baseado nos totais financeiros consolidados da proposta.
 */
export function reconstituteQuoteItemFromFinancials(quote: Quote): QuoteItem {
  const productName = extractCleanProductNameFromSubject(quote.subject, 'Item Comercial');
  const costPrice = Number(quote.totalCost || 0);
  const totalShipping = Number(quote.totalShipping || 0);
  const totalPrice = Number(quote.totalAmount || 0);
  const taxPercent = Number(quote.globalTaxPercent ?? 9.02);
  const markupPercent = Number(quote.globalMarkupPercent ?? 23.5);

  const cleanId = quote.id ? `item-${quote.id}-1` : `item-healed-${Date.now()}-1`;

  return {
    id: cleanId,
    itemNumber: 1,
    name: productName,
    description: quote.subject ? `Item consolidado da proposta: ${quote.subject}` : '',
    rawSearchQuery: productName,
    partNumber: '',
    ncm: '',
    imageUrl: '',
    showImage: false,
    quantity: 1,
    unit: 'Un.',
    costPrice,
    shippingCost: totalShipping,
    taxPercent,
    markupPercent,
    unitPrice: totalPrice > 0 ? totalPrice : (costPrice * 1.3),
    totalPrice: totalPrice > 0 ? totalPrice : (costPrice * 1.3),
    approved: quote.status === 'approved',
    approvedQuantity: quote.status === 'approved' ? 1 : undefined,
    purchaseStatus: quote.status === 'approved' ? 'pending' : undefined
  };
}

/**
 * Tenta encontrar itens correspondentes em e-mails do Inbox.
 */
export function findItemsFromEmailsForQuote(quote: Quote, emails?: IncomingEmail[]): QuoteItem[] | null {
  if (!emails || !Array.isArray(emails) || emails.length === 0) return null;

  // 1. Tenta correspondência exata por protocolo/solicitação (ex: SOL.128367)
  const solMatch = (quote.subject || '').match(/SOL\.?\s*(\d+)/i) || (quote.clientOrderNumber || '').match(/SOL\.?\s*(\d+)/i);
  const solNumber = solMatch ? solMatch[1] : null;

  for (const email of emails) {
    let matches = false;

    if (solNumber) {
      if ((email.subject || '').includes(solNumber) || (email.body || '').includes(solNumber)) {
        matches = true;
      }
    }

    if (!matches && quote.clientEmail && email.senderEmail) {
      if (email.senderEmail.toLowerCase().trim() === quote.clientEmail.toLowerCase().trim()) {
        if (quote.subject && email.subject && (
          email.subject.toLowerCase().includes(quote.subject.toLowerCase()) ||
          quote.subject.toLowerCase().includes(email.subject.toLowerCase())
        )) {
          matches = true;
        }
      }
    }

    if (matches && Array.isArray(email.suggestedItems) && email.suggestedItems.length > 0) {
      const parsedItems: QuoteItem[] = email.suggestedItems.map((si, idx) => ({
        id: `item-email-${Date.now()}-${idx + 1}`,
        itemNumber: idx + 1,
        name: si.name || 'Item Solicitado',
        description: si.description || '',
        rawSearchQuery: si.rawSearchQuery || si.name || '',
        partNumber: si.partNumber || si.itemCode || '',
        ncm: si.ncm || '',
        imageUrl: si.imageUrl || '',
        showImage: Boolean(si.imageUrl),
        quantity: si.quantity || 1,
        unit: si.unit || 'Un.',
        costPrice: Number(si.estimatedCost || (quote.totalCost && email.suggestedItems.length === 1 ? quote.totalCost : 0)),
        shippingCost: 0,
        taxPercent: Number(quote.globalTaxPercent ?? 9.02),
        markupPercent: Number(quote.globalMarkupPercent ?? 23.5),
        unitPrice: quote.totalAmount && email.suggestedItems.length === 1 ? Number(quote.totalAmount) : Number(si.estimatedCost || 0) * 1.35,
        totalPrice: quote.totalAmount && email.suggestedItems.length === 1 ? Number(quote.totalAmount) : Number(si.estimatedCost || 0) * 1.35 * (si.quantity || 1),
        approved: quote.status === 'approved',
        purchaseStatus: quote.status === 'approved' ? 'pending' : undefined
      }));

      if (areLegitimateQuoteItems(parsedItems)) {
        return parsedItems;
      }
    }
  }

  return null;
}

/**
 * Função Mestra de Cura e Recuperação Individual de Cotação:
 * Avalia se a cotação tem valor comercial mas está sem itens, e recupera de todas as fontes possíveis.
 */
export async function healAndRecoverQuote(
  quote: Quote,
  allQuotes?: Quote[],
  emails?: IncomingEmail[]
): Promise<{ quote: Quote; healed: boolean; source?: string }> {
  if (!quote) return { quote, healed: false };

  // Se já possui itens legítimos, apenas garante backups persistentes
  if (areLegitimateQuoteItems(quote.items)) {
    if (quote.code) saveQuoteItemsBackup(quote.code, quote.items);
    if (quote.id) saveQuoteItemsBackup(quote.id, quote.items);
    return { quote, healed: false };
  }

  const hasFinancialData = Number(quote.totalCost || 0) > 0 || Number(quote.totalAmount || 0) > 0;
  if (!hasFinancialData) {
    // Proposta sem valores financeiros e sem itens: rascunho limpo comum
    return { quote, healed: false };
  }

  console.warn(`[QuoteHealer] Detectada proposta com valores financeiros mas sem itens: [${quote.code || quote.id}] - R$ ${quote.totalAmount}. Iniciando recuperação...`);

  // 1. Tentar recuperar de backups do localStorage por código ou id
  if (quote.code) {
    const backupCode = getQuoteItemsBackup(quote.code);
    if (areLegitimateQuoteItems(backupCode)) {
      console.log(`[QuoteHealer] Itens recuperados do backup local pelo código ${quote.code}!`);
      const healedQuote: Quote = { ...quote, items: backupCode! };
      if (quote.id) saveQuoteItemsBackup(quote.id, backupCode!);
      return { quote: healedQuote, healed: true, source: 'localStorage_backup_code' };
    }
  }

  if (quote.id) {
    const backupId = getQuoteItemsBackup(quote.id);
    if (areLegitimateQuoteItems(backupId)) {
      console.log(`[QuoteHealer] Itens recuperados do backup local pelo ID ${quote.id}!`);
      const healedQuote: Quote = { ...quote, items: backupId! };
      if (quote.code) saveQuoteItemsBackup(quote.code, backupId!);
      return { quote: healedQuote, healed: true, source: 'localStorage_backup_id' };
    }
  }

  // 2. Tentar recuperar de outra cópia em allQuotes
  if (allQuotes && Array.isArray(allQuotes)) {
    const matched = allQuotes.find(q => 
      (q.code && quote.code && q.code.trim().toUpperCase() === quote.code.trim().toUpperCase()) ||
      (q.id && quote.id && q.id === quote.id)
    );
    if (matched && areLegitimateQuoteItems(matched.items)) {
      console.log(`[QuoteHealer] Itens recuperados da lista de cotações em memória!`);
      const healedQuote: Quote = { ...quote, items: matched.items };
      if (quote.code) saveQuoteItemsBackup(quote.code, matched.items);
      if (quote.id) saveQuoteItemsBackup(quote.id, matched.items);
      return { quote: healedQuote, healed: true, source: 'memory_quotes_match' };
    }
  }

  // 3. Tentar buscar no Supabase pelo id e pelo código
  try {
    const remoteItems = await fetchQuoteItemsByQuoteId(quote.id, quote.code);
    if (areLegitimateQuoteItems(remoteItems)) {
      console.log(`[QuoteHealer] Itens recuperados com sucesso do banco de dados Supabase!`);
      const healedQuote: Quote = { ...quote, items: remoteItems };
      if (quote.code) saveQuoteItemsBackup(quote.code, remoteItems);
      if (quote.id) saveQuoteItemsBackup(quote.id, remoteItems);
      return { quote: healedQuote, healed: true, source: 'supabase_remote' };
    }
  } catch (err) {
    console.warn('[QuoteHealer] Erro ao consultar Supabase durante recuperação:', err);
  }

  // 4. Tentar buscar do Inbox de e-mails
  const emailItems = findItemsFromEmailsForQuote(quote, emails);
  if (emailItems && areLegitimateQuoteItems(emailItems)) {
    console.log(`[QuoteHealer] Itens recuperados do Inbox de e-mails associado!`);
    const healedQuote: Quote = { ...quote, items: emailItems };
    if (quote.code) saveQuoteItemsBackup(quote.code, emailItems);
    if (quote.id) saveQuoteItemsBackup(quote.id, emailItems);
    return { quote: healedQuote, healed: true, source: 'inbox_email_match' };
  }

  // 5. Fallback Seguro & Determinístico: Reconstituição com base nos totais financeiros e assunto
  const reconstitutedItem = reconstituteQuoteItemFromFinancials(quote);
  const reconstitutedList = [reconstitutedItem];

  console.log(`[QuoteHealer] Reconstituindo item com sucesso: "${reconstitutedItem.name}" (Custo R$ ${reconstitutedItem.costPrice} | Total R$ ${reconstitutedItem.totalPrice})`);

  const healedQuote: Quote = {
    ...quote,
    items: reconstitutedList
  };

  if (quote.code) saveQuoteItemsBackup(quote.code, reconstitutedList);
  if (quote.id) saveQuoteItemsBackup(quote.id, reconstitutedList);

  return { quote: healedQuote, healed: true, source: 'financial_reconstitution' };
}

/**
 * Varredura e Cura em Lote de todas as propostas comerciais do sistema.
 * Garante que nenhuma cotação no histórico permaneça com 0 itens se tiver valores comerciais.
 */
export async function healAllQuotesBatch(
  quotes: Quote[],
  emails?: IncomingEmail[]
): Promise<{ quotes: Quote[]; healedCount: number }> {
  if (!quotes || !Array.isArray(quotes) || quotes.length === 0) {
    return { quotes: [], healedCount: 0 };
  }

  let healedCount = 0;
  const healedList: Quote[] = [];

  for (const q of quotes) {
    const hasItems = areLegitimateQuoteItems(q.items);
    const hasFinancials = Number(q.totalCost || 0) > 0 || Number(q.totalAmount || 0) > 0;

    if (!hasItems && hasFinancials) {
      const res = await healAndRecoverQuote(q, quotes, emails);
      if (res.healed) {
        healedList.push(res.quote);
        healedCount++;
        // Sincroniza em background no Supabase para nunca mais perder
        syncQuoteToSupabase(res.quote).catch(() => {});
        continue;
      }
    }
    healedList.push(q);
  }

  if (healedCount > 0) {
    console.log(`[QuoteHealer] Sucesso: ${healedCount} proposta(s) histórica(s) foram curadas e salvas com itens blindados!`);
    saveQuotes(healedList);
  }

  return { quotes: healedList, healedCount };
}
