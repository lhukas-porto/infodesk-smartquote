import { Quote, QuoteItem, Product } from '../types';
import { ProcurementPurchaseRecord } from './storage';
import { CachedPriceOffer } from '../services/priceCacheService';
import { normalizeSearchText } from './aiEmailParser';

export interface FreshestProductResult {
  costPrice: number;
  sourceUrl?: string;
  supplier?: string;
  costUpdated: boolean;
  linkUpdated: boolean;
  sourceType: 'procurement' | 'catalog' | 'recent_quote' | 'price_cache' | 'original';
}

interface CandidateItem {
  costPrice?: number;
  sourceUrl?: string;
  supplier?: string;
  timestamp: number;
  source: 'procurement' | 'catalog' | 'recent_quote' | 'price_cache' | 'original';
}

/**
 * Converte strings de data flexíveis em milissegundos para ordenação cronológica
 */
function parseDateToTimestamp(rawDate?: string | null): number {
  if (!rawDate) return 0;
  try {
    const parsed = new Date(rawDate).getTime();
    if (!isNaN(parsed) && parsed > 0) return parsed;
  } catch {
    // fallback
  }

  // Tenta formato pt-BR "DD de Mês de YYYY" ou "DD/MM/YYYY"
  try {
    const parts = rawDate.split('/');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      const dt = new Date(y, m, d).getTime();
      if (!isNaN(dt)) return dt;
    }
  } catch {
    // ignore
  }

  return 0;
}

/**
 * Valida se uma URL é válida para ser usada como link de produto
 */
function isValidProductUrl(url?: string | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed.length < 8) return false;
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

/**
 * Encontra os dados mais recentes (custo unitário, link e fornecedor) para um item de proposta duplicada,
 * consultando:
 * 1. Registros de compras reais na Central de Compras (Procurement)
 * 2. Catálogo atual de produtos
 * 3. Propostas históricas mais recentes
 * 4. Cache recente de preços por Part Number
 * 5. Dados originais do próprio item
 */
export function resolveFreshestProductData(params: {
  item: QuoteItem;
  originalQuoteDate?: string;
  catalogProducts?: Product[];
  procurementRecords?: Record<string, ProcurementPurchaseRecord>;
  allQuotes?: Quote[];
  cachedPrice?: CachedPriceOffer | null;
}): FreshestProductResult {
  const {
    item,
    originalQuoteDate,
    catalogProducts = [],
    procurementRecords = {},
    allQuotes = [],
    cachedPrice
  } = params;

  const targetPn = item.partNumber ? item.partNumber.trim().toUpperCase() : '';
  const targetNormName = item.name ? normalizeSearchText(item.name) : '';
  const originalTimestamp = parseDateToTimestamp(originalQuoteDate);

  const candidates: CandidateItem[] = [];

  // 1. Dados originais do próprio item (base de comparação)
  const origCost = item.costPrice > 0 ? item.costPrice : 0;
  const origActualCost = (item.actualUnitCostPrice && item.actualUnitCostPrice > 0)
    ? item.actualUnitCostPrice
    : ((item.actualCostPrice && item.actualCostPrice > 0 && (item.quantity || 1) > 0)
      ? Number((item.actualCostPrice / (item.quantity || 1)).toFixed(2))
      : 0);

  const baseCost = origActualCost > 0 ? origActualCost : origCost;
  const baseLink = isValidProductUrl(item.actualPurchaseUrl)
    ? item.actualPurchaseUrl!.trim()
    : (isValidProductUrl(item.sourceUrl) ? item.sourceUrl!.trim() : undefined);
  const baseSupplier = item.actualSupplier || item.quotedSupplier || item.supplier;

  candidates.push({
    costPrice: baseCost > 0 ? baseCost : undefined,
    sourceUrl: baseLink,
    supplier: baseSupplier,
    timestamp: originalTimestamp || 1,
    source: 'original'
  });

  // 2. Registros de Compras Reais da Central de Compras (Procurement)
  const purchaseList = Object.values(procurementRecords);
  for (const rec of purchaseList) {
    if (!rec) continue;

    let isMatch = false;
    // Correspondência direta por ID do item
    if (item.id && rec.itemId === item.id) {
      isMatch = true;
    }
    // Correspondência por nome normalizado
    if (!isMatch && rec.name && targetNormName && normalizeSearchText(rec.name) === targetNormName) {
      isMatch = true;
    }
    // Correspondência por Part Number no nome do registro
    if (!isMatch && targetPn && rec.name && rec.name.toUpperCase().includes(targetPn)) {
      isMatch = true;
    }

    if (isMatch) {
      const recCost = (rec.actualUnitCostPrice && rec.actualUnitCostPrice > 0)
        ? rec.actualUnitCostPrice
        : (rec.actualCostPrice && rec.actualCostPrice > 0 ? rec.actualCostPrice : undefined);
      
      const recUrl = isValidProductUrl(rec.actualPurchaseUrl) ? rec.actualPurchaseUrl!.trim() : undefined;
      const recSupplier = rec.actualSupplier || rec.supplier;
      const recTime = parseDateToTimestamp(rec.purchasedAt) || (Date.now() - 15 * 86400000);

      if (recCost || recUrl) {
        candidates.push({
          costPrice: recCost,
          sourceUrl: recUrl,
          supplier: recSupplier,
          timestamp: recTime,
          source: 'procurement'
        });
      }
    }
  }

  // 3. Catálogo de Produtos
  for (const prod of catalogProducts) {
    if (!prod) continue;

    let isMatch = false;
    if (targetPn && prod.partNumber && prod.partNumber.trim().toUpperCase() === targetPn) {
      isMatch = true;
    } else if (targetNormName && prod.name && normalizeSearchText(prod.name) === targetNormName) {
      isMatch = true;
    }

    if (isMatch) {
      const prodCost = prod.costPrice > 0 ? prod.costPrice : undefined;
      const prodUrl = isValidProductUrl(prod.sourceUrl) ? prod.sourceUrl!.trim() : undefined;
      const prodSupplier = prod.supplier?.trim() || undefined;
      
      // Catálogo atual reflete a tabela ativa cadastrada pelo usuário
      const prodTime = parseDateToTimestamp(prod.lastUpdated) || parseDateToTimestamp((prod as any).updatedAt) || parseDateToTimestamp(prod.createdAt) || (Date.now() - 5000);

      if (prodCost || prodUrl) {
        candidates.push({
          costPrice: prodCost,
          sourceUrl: prodUrl,
          supplier: prodSupplier,
          timestamp: prodTime,
          source: 'catalog'
        });
      }
    }
  }

  // 4. Propostas Históricas Recentes (outras cotações onde o produto foi orçado/comprado)
  for (const quote of allQuotes) {
    if (!quote || !quote.items || quote.items.length === 0) continue;
    const quoteTime = parseDateToTimestamp(quote.updatedAt) || parseDateToTimestamp(quote.createdAt) || parseDateToTimestamp(quote.date);

    for (const qItem of quote.items) {
      let isMatch = false;
      if (targetPn && qItem.partNumber && qItem.partNumber.trim().toUpperCase() === targetPn) {
        isMatch = true;
      } else if (targetNormName && qItem.name && normalizeSearchText(qItem.name) === targetNormName) {
        isMatch = true;
      }

      if (isMatch) {
        const qCost = (qItem.actualUnitCostPrice && qItem.actualUnitCostPrice > 0)
          ? qItem.actualUnitCostPrice
          : (qItem.costPrice > 0 ? qItem.costPrice : undefined);
        
        const qUrl = isValidProductUrl(qItem.actualPurchaseUrl)
          ? qItem.actualPurchaseUrl!.trim()
          : (isValidProductUrl(qItem.sourceUrl) ? qItem.sourceUrl!.trim() : undefined);
        
        const qSupplier = qItem.actualSupplier || qItem.quotedSupplier || qItem.supplier;
        const itemTime = parseDateToTimestamp(qItem.purchasedAt) || quoteTime;

        if (qCost || qUrl) {
          candidates.push({
            costPrice: qCost,
            sourceUrl: qUrl,
            supplier: qSupplier,
            timestamp: itemTime,
            source: 'recent_quote'
          });
        }
      }
    }
  }

  // 5. Cache de Preços recente por Part Number
  if (cachedPrice && cachedPrice.costPrice > 0) {
    const cacheTime = parseDateToTimestamp(cachedPrice.date) || (Date.now() - 86400000);
    candidates.push({
      costPrice: cachedPrice.costPrice,
      sourceUrl: isValidProductUrl(cachedPrice.sourceUrl) ? cachedPrice.sourceUrl!.trim() : undefined,
      supplier: cachedPrice.supplier,
      timestamp: cacheTime,
      source: 'price_cache'
    });
  }

  // ==============================================================================
  // SELEÇÃO DO CUSTO E LINK MAIS RECENTES
  // ==============================================================================

  // Seleciona o custo mais recente válido
  const costCandidates = candidates
    .filter(c => typeof c.costPrice === 'number' && c.costPrice > 0)
    .sort((a, b) => b.timestamp - a.timestamp);

  const bestCostCandidate = costCandidates[0];
  const finalCost = bestCostCandidate ? bestCostCandidate.costPrice! : origCost;
  const costUpdated = Boolean(bestCostCandidate && bestCostCandidate.source !== 'original' && Math.abs(finalCost - origCost) > 0.001);

  // Seleciona o link mais recente válido
  const linkCandidates = candidates
    .filter(c => Boolean(c.sourceUrl && isValidProductUrl(c.sourceUrl)))
    .sort((a, b) => b.timestamp - a.timestamp);

  const bestLinkCandidate = linkCandidates[0];
  const finalUrl = bestLinkCandidate ? bestLinkCandidate.sourceUrl : baseLink;
  const linkUpdated = Boolean(
    bestLinkCandidate &&
    bestLinkCandidate.source !== 'original' &&
    finalUrl !== item.sourceUrl
  );

  // Seleciona o fornecedor mais relevante
  const chosenSupplier = bestLinkCandidate?.supplier || bestCostCandidate?.supplier || baseSupplier;
  const winningSource = bestCostCandidate?.source || bestLinkCandidate?.source || 'original';

  return {
    costPrice: finalCost,
    sourceUrl: finalUrl,
    supplier: chosenSupplier,
    costUpdated,
    linkUpdated,
    sourceType: winningSource
  };
}
