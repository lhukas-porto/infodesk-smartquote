/**
 * Price Scanner Service - Infodesk SmartQuote
 * Provides single & batch product price scanning, real-time web search with Gemini Search Grounding / DuckDuckGo / Public E-commerce Catalog,
 * and high-fidelity image and product detail resolution.
 */

import { resolveProductDetails, resolveImageForDescription, cleanAlphanumericCode, cleanNcmCode, formatProductSentenceCase, getCategoryFromNcm, buildCompleteProductDescription, buildDirectPurchaseUrl, isExactProductUrl } from '../utils/aiEmailParser';
import { extractImageFromStoreUrl, extractDirectImageFromUrlPatterns } from './imageExtractorService';
import { DiscoveredProduct } from '../types';
import { searchProductImages } from './imageSearchService';

export type { DiscoveredProduct };
export { searchProductImages };

export interface ShoppingOffer {
  title: string;
  price: number;
  priceFormatted: string;
  store: string;
  link: string;
  thumbnail?: string;
  delivery?: string;
  rating?: number;
  reviews?: number;
}

export interface ScannedPriceResult {
  id: string;
  originalQuery: string;
  standardizedName: string;
  brand?: string;
  modelOrCode?: string;
  partNumber?: string;
  ncm?: string;
  bestPrice: number;
  priceFormatted: string;
  isPixPrice?: boolean;
  store: string;
  storeType?: 'official' | 'marketplace' | 'specialized';
  rating?: number;
  observation?: string;
  status: 'exact' | 'equivalent' | 'on_demand' | 'not_found';
  buyUrl: string;
  imageUrl: string;
  images?: string[];
  selectedImageIndex?: number;
  category?: string;
  quantity?: number;
  unit?: string;
  description?: string;
  specifications?: Array<{ label: string; value: string }>;
  weight?: string;
  dimensions?: string;
  suggestedPrice?: number;
  costPrice?: number;
  ean?: string;
  manufacturer?: string;
  allOffers?: ShoppingOffer[];
}

export interface BatchScanProgress {
  total: number;
  current: number;
  currentProduct: string;
  isComplete: boolean;
}

const STORAGE_GEMINI_KEY = 'infodesk_gemini_api_key';
const STORAGE_SCAN_CACHE_KEY = 'infodesk_price_scan_cache_v2';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas de validade

/**
 * Modelos Gemini disponíveis em produção (em ordem de preferência: mais capaz → mais rápido)
 * Atualizados em Set/2025 para refletir os modelos reais da API Gemini
 */
export const MODERN_GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
];

/**
 * Disjuntor (Circuit Breaker) para a API Gemini:
 * Se a cota estiver esgotada (429) ou ocorrer erro de autenticação, suspende chamadas de IA
 * por 5 minutos para que todas as buscas subsequentes respondam em <50ms pelo catálogo local.
 */
let geminiCircuitBreakerUntil = 0;

export function isGeminiCircuitBreakerActive(): boolean {
  return Date.now() < geminiCircuitBreakerUntil;
}

export function resetGeminiCircuitBreaker(): void {
  geminiCircuitBreakerUntil = 0;
}

/**
 * Executa requisição para a API Gemini com timeout estrito via AbortController
 * e interrupção imediata em caso de cota excedida (429)
 */
async function fetchGeminiWithTimeout(
  endpoint: string,
  body: any,
  timeoutMs: number = 25000
): Promise<{ ok: boolean; status: number; data?: any; errorText?: string; rateLimited?: boolean }> {
  if (isGeminiCircuitBreakerActive()) {
    return { ok: false, status: 429, errorText: 'Circuit breaker ativo (cota de IA em resfriamento)', rateLimited: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (res.status === 429) {
      geminiCircuitBreakerUntil = Date.now() + 5 * 60 * 1000;
      console.warn('[Gemini Circuit Breaker] Cota excedida (429). Disjuntor ativado por 5min para manter o scanner instantâneo.');
      return { ok: false, status: 429, errorText: 'Quota exceeded', rateLimited: true };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, status: res.status, errorText: errText };
    }

    const data = await res.json().catch(() => null);
    return { ok: true, status: 200, data };
  } catch (err: any) {
    clearTimeout(timer);
    const isTimeout = err?.name === 'AbortError';
    return { ok: false, status: isTimeout ? 408 : 0, errorText: isTimeout ? `Timeout (${timeoutMs / 1000}s excedido)` : err?.message };
  }
}

/**
 * Normaliza especificações técnicas retornadas por IA, aceitando array [{ label, value }] ou objeto chave-valor
 */
export function normalizeSpecifications(raw: any): Array<{ label: string; value: string }> {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((s: any) => s && (s.label || s.key || s.name || s.caracteristica) && (s.value || s.val || s.descricao || s.valor))
      .map((s: any) => ({
        label: String(s.label || s.key || s.name || s.caracteristica).trim(),
        value: String(s.value || s.val || s.descricao || s.valor).trim()
      }));
  }
  if (typeof raw === 'object') {
    return Object.entries(raw)
      .filter(([k, v]) => k && v !== undefined && v !== null)
      .map(([key, val]) => ({
        label: key
          .replace(/([A-Z])/g, ' $1')
          .replace(/_/g, ' ')
          .replace(/^\w/, c => c.toUpperCase())
          .trim(),
        value: typeof val === 'object' ? JSON.stringify(val) : String(val).trim()
      }));
  }
  return [];
}

/**
 * Normaliza dimensões da embalagem para string legível no formato "CxLxA cm"
 */
export function normalizeDimensions(raw: any): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'object') {
    const l = raw.length || raw.comprimento || raw.depth || raw.profundidade || raw.c || raw.d;
    const w = raw.width || raw.largura || raw.l || raw.w;
    const h = raw.height || raw.altura || raw.a || raw.h;
    const u = raw.unit || raw.unidade || 'cm';
    if (l && w && h) return `${l} x ${w} x ${h} ${u}`.trim();
    return Object.entries(raw).map(([k, v]) => `${k}: ${v}`).join(', ');
  }
  return String(raw).trim();
}

/**
 * Normaliza peso aproximado para exibição profissional em kg / g
 */
export function normalizeWeight(raw: any): string {
  if (!raw && raw !== 0) return '';
  if (typeof raw === 'number') {
    return raw >= 1 ? `${raw.toFixed(3)} kg` : `${(raw * 1000).toFixed(0)} g`;
  }
  const str = String(raw).trim();
  const num = parseFloat(str.replace(',', '.'));
  if (!isNaN(num) && !str.toLowerCase().includes('kg') && !str.toLowerCase().includes('g')) {
    return num >= 1 ? `${num.toFixed(3)} kg` : `${(num * 1000).toFixed(0)} g`;
  }
  return str;
}

/**
 * Normaliza e limpa ruídos corporativos de pedidos/e-mails:
 * Ex: "ITEM 04 - 05 UNID - CABO HDMI 2.0 4K 2 METROS PRETO COM FILTRO (URGENTE FAVOR COTAR)"
 * -> "CABO HDMI 2.0 4K 2 METROS PRETO COM FILTRO"
 */
export function normalizeSearchTerm(raw: string): string {
  if (!raw) return '';
  let text = raw.trim();

  // Remove marcações de item: "item 01:", "it. 2 -", "01)", "1."
  text = text.replace(/^(?:item|it\.?|lote)\s*\d+[\s\-\:\.\)]+/i, '');
  text = text.replace(/^\d+[\s\-\:\.\)]+/, '');

  // Remove anotações de urgência ou solicitações
  text = text.replace(/\((?:urgente|favor cotar|cota[çc][aã]o|solicitad[oa]|verificar|marca de refer[eê]ncia)[^)]*\)/gi, '');
  text = text.replace(/\[(?:urgente|favor cotar|cota[çc][aã]o|solicitad[oa]|verificar)[^\]]*\]/gi, '');
  text = text.replace(/\b(?:urgente|favor cotar|ou similar|marca de refer[eê]ncia)\b/gi, '');

  // Remove termos de quantidade no início/meio: "10 un -", "5 pct de"
  text = text.replace(/^\d+\s*(?:unidades?|un\.?|pcts?|pacotes?|cx|caixas?|kits?|pcs?|pçs?|peças?)\s*(?:de|\-)?\s*/i, '');
  text = text.replace(/\s*\-\s*\d+\s*(?:unidades?|un\.?|pcts?|pacotes?|cx|caixas?|kits?|pcs?|pçs?|peças?)\b/i, '');

  // Remove traços e pontuações repetidas
  text = text.replace(/[—–]/g, ' ').replace(/\s{2,}/g, ' ').trim();

  return text.length >= 3 ? text : raw.trim();
}

// Cache ultrarrápido em memória RAM de sessão (0ms)
const RAM_SCAN_CACHE = new Map<string, { timestamp: number; data: ScannedPriceResult }>();

/**
 * Remove fotos em base64 gigantes antes de persistir no cache,
 * evitando 'QuotaExceededError' e travamentos de CPU por 'memória cheia'.
 */
function sanitizeResultForCache(res: ScannedPriceResult): ScannedPriceResult {
  const sanitized = { ...res };
  if (sanitized.imageUrl && sanitized.imageUrl.startsWith('data:image')) {
    sanitized.imageUrl = '';
  }
  if (Array.isArray(sanitized.images)) {
    sanitized.images = sanitized.images
      .filter(img => img && !img.startsWith('data:image'))
      .slice(0, 4);
  }
  if ((sanitized as any).customerPhotoUrl) {
    const copy = { ...sanitized };
    delete (copy as any).customerPhotoUrl;
    return copy;
  }
  return sanitized;
}

/**
 * Cache local de resultados de escaneamento para velocidade instantânea (<1ms)
 */
function getCachedScanResult(query: string): ScannedPriceResult | null {
  const key = query.trim().toLowerCase();
  if (!key) return null;

  // 1. Resposta instantânea da RAM
  const ramEntry = RAM_SCAN_CACHE.get(key);
  if (ramEntry) {
    if (Date.now() - ramEntry.timestamp <= CACHE_TTL_MS) {
      return ramEntry.data;
    }
    RAM_SCAN_CACHE.delete(key);
  }

  // 2. Fallback para LocalStorage leve
  try {
    const raw = localStorage.getItem(STORAGE_SCAN_CACHE_KEY);
    if (!raw) return null;
    const cache: Record<string, { timestamp: number; data: ScannedPriceResult }> = JSON.parse(raw);
    const entry = cache[key];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      delete cache[key];
      try {
        localStorage.setItem(STORAGE_SCAN_CACHE_KEY, JSON.stringify(cache));
      } catch { /* ignore */ }
      return null;
    }
    // Promove para a RAM para a próxima leitura ser a 0ms
    RAM_SCAN_CACHE.set(key, entry);
    return entry.data;
  } catch {
    return null;
  }
}

function saveScanResultToCache(query: string, result: ScannedPriceResult): void {
  if (!result || result.bestPrice <= 0) return;
  const key = query.trim().toLowerCase();
  if (!key) return;

  // 1. Salva na RAM completo
  RAM_SCAN_CACHE.set(key, { timestamp: Date.now(), data: result });

  // 2. Salva no LocalStorage sanitizado (sem strings base64 pesadas)
  try {
    const cleanResult = sanitizeResultForCache(result);
    const raw = localStorage.getItem(STORAGE_SCAN_CACHE_KEY);
    let cache: Record<string, { timestamp: number; data: ScannedPriceResult }> = {};
    if (raw) {
      try {
        cache = JSON.parse(raw);
      } catch {
        cache = {};
      }
    }
    cache[key] = { timestamp: Date.now(), data: cleanResult };
    
    // Limita o cache a 60 itens leves para não lotar localStorage
    const keys = Object.keys(cache);
    if (keys.length > 60) {
      const keysToRemove = keys.slice(0, keys.length - 60);
      keysToRemove.forEach(k => delete cache[k]);
    }
    localStorage.setItem(STORAGE_SCAN_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Se a cota de localStorage estiver estourada por lixo antigo, faz auto-faxina
    try {
      localStorage.removeItem(STORAGE_SCAN_CACHE_KEY);
    } catch { /* ignore */ }
  }
}

export function getStoredGeminiKey(): string {
  try {
    const envKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (envKey && typeof envKey === 'string' && envKey.trim()) {
      return envKey.trim();
    }
    const localKey = localStorage.getItem(STORAGE_GEMINI_KEY);
    if (localKey && typeof localKey === 'string' && localKey.trim()) {
      return localKey.trim();
    }
    const altKey = localStorage.getItem('gemini_api_key');
    if (altKey && typeof altKey === 'string' && altKey.trim()) {
      return altKey.trim();
    }
    return '';
  } catch {
    return '';
  }
}

export function saveStoredGeminiKey(key: string): void {
  try {
    if (key.trim()) {
      localStorage.setItem(STORAGE_GEMINI_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_GEMINI_KEY);
    }
  } catch {
    // ignore
  }
}

const STORAGE_SERPAPI_KEY = 'infodesk_serpapi_key';

export function getStoredSerpApiKey(): string {
  try {
    const envKey = import.meta.env.VITE_SERPAPI_API_KEY;
    if (envKey && typeof envKey === 'string' && envKey.trim()) {
      return envKey.trim();
    }
    const localKey = localStorage.getItem(STORAGE_SERPAPI_KEY);
    if (localKey && typeof localKey === 'string' && localKey.trim()) {
      return localKey.trim();
    }
    const altKey = localStorage.getItem('serpapi_api_key');
    if (altKey && typeof altKey === 'string' && altKey.trim()) {
      return altKey.trim();
    }
    return '';
  } catch {
    return '';
  }
}

export function saveStoredSerpApiKey(key: string): void {
  try {
    if (key.trim()) {
      localStorage.setItem(STORAGE_SERPAPI_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_SERPAPI_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Busca ofertas de produtos e carrossel de patrocinados em tempo real no Google Shopping Brasil
 * Extrai o menor preço real de loja, vendedor e link direto de compra
 */
export async function fetchGoogleShoppingOffers(
  query: string,
  apiKey?: string
): Promise<{ bestOffer: ShoppingOffer | null; offers: ShoppingOffer[] }> {
  try {
    const activeKey = apiKey || getStoredSerpApiKey();
    const cleanQ = normalizeSearchTerm(query);
    if (!cleanQ) return { bestOffer: null, offers: [] };

    const params = new URLSearchParams({ q: cleanQ });
    if (activeKey) {
      params.append('apiKey', activeKey);
    }

    const res = await fetch(`/api/google-shopping?${params.toString()}`);
    if (!res.ok) {
      return { bestOffer: null, offers: [] };
    }
    const data = await res.json();
    return {
      bestOffer: data.bestOffer || null,
      offers: Array.isArray(data.offers) ? data.offers : []
    };
  } catch (err) {
    console.warn('[Google Shopping API error]:', err);
    return { bestOffer: null, offers: [] };
  }
}

export interface ParsedBatchQuery {
  query: string;
  quantity: number;
}

/**
 * Parses raw pasted text into individual product queries and their associated quantities.
 * Handles alternating lines (Product \n Quantity or Quantity \n Product), markdown tables, numbered lists.
 */
export function parsePastedProductListWithQty(rawText: string): ParsedBatchQuery[] {
  if (!rawText.trim()) return [];

  const rawLines = rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const parsedItems: ParsedBatchQuery[] = [];
  
  // Detect if line is purely quantity: "10", "6", "10 kits", "10 UN", "6 peças"
  const isQtyLine = (line: string): boolean => {
    return /^\d+(\s*(?:unidades?|un\.?|kits?|pcs?|pçs?|peças?))?$/i.test(line.trim());
  };

  const extractNumberFromQtyLine = (line: string): number => {
    const m = line.match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : 1;
  };

  const cleanProductLine = (line: string): string => {
    let clean = line;
    if (clean.includes('|')) {
      const parts = clean.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length > 0) {
        if (/^\d+/.test(parts[0]) && parts.length > 1) {
          clean = parts[1];
        } else {
          clean = parts[0];
        }
      }
    }
    // Strip leading list numbers or bullets: "1. ", "• ", "- ", "* "
    clean = clean.replace(/^(\d+[\.\)\-:]|\*|\-|\•)\s*/, '').trim();
    return clean;
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    // Skip markdown table separators or headers
    const isTableSeparator = new RegExp('^\\|?\\s*[-' + ':\\s|]+\\s*\\|?$');
    if (isTableSeparator.test(line)) continue;
    if (/^\|?\s*(produto|descri[cç][aã]o|item|nome|qtd|quantidade|comprar)\s*\|?/i.test(line)) continue;

    // If current line is a pure quantity line, check if previous product needs it
    if (isQtyLine(line)) {
      const qty = extractNumberFromQtyLine(line);
      if (parsedItems.length > 0 && parsedItems[parsedItems.length - 1].quantity === 1) {
        parsedItems[parsedItems.length - 1].quantity = qty;
      }
      continue;
    }

    // Explicit pipe or tag quantity: "| Qtd: 500 pct", "| Qtd: 10 cx", "Qtd: 50 un"
    const explicitQtdMatch = line.match(/(?:\||\b)\s*qtd\.?:?\s*(\d+)(?:\s*(?:pct|pcts|pacotes?|cx|cxs|caixas?|unidades?|un\.?|kits?|pcs?|pçs?|displays?|peças?))?/i);
    if (explicitQtdMatch) {
      const qty = parseInt(explicitQtdMatch[1], 10) || 1;
      let cleanProd = line.replace(/(?:\||\b)\s*qtd\.?:?\s*(\d+)(?:\s*(?:pct|pcts|pacotes?|cx|cxs|caixas?|unidades?|un\.?|kits?|pcs?|pçs?|displays?|peças?))?/i, '').trim();
      cleanProd = cleanProductLine(cleanProd);
      if (cleanProd.length >= 3) {
        parsedItems.push({ query: cleanProd, quantity: qty });
        continue;
      }
    }

    // Check if line starts with quantity then product (e.g. "10 - Caixa organizadora...")
    const leadingQtyMatch = line.match(/^(\d+)\s*(?:un|x|unidades?|kits?|pçs?|pecas?|pct|pcts|cx|caixas?)?[:\-\s]\s*(.+)/i);
    if (leadingQtyMatch) {
      const qty = parseInt(leadingQtyMatch[1], 10) || 1;
      let cleanProd = cleanProductLine(leadingQtyMatch[2]);
      // Also check trailing qty inside the rest
      const trailingMatch = cleanProd.match(/[:\-\s]+(\d+)\s*(?:unidades?|un\.?|kits?|pcs?|pçs?|peças?|pct|pcts|cx)\s*$/i);
      if (trailingMatch) {
        cleanProd = cleanProd.substring(0, trailingMatch.index).trim();
      }
      if (cleanProd.length >= 3) {
        parsedItems.push({ query: cleanProd, quantity: qty });
        continue;
      }
    }

    // Check next line to see if it's the quantity for this product
    let assignedQty = 1;
    if (i + 1 < rawLines.length && isQtyLine(rawLines[i + 1])) {
      assignedQty = extractNumberFromQtyLine(rawLines[i + 1]);
      i++; // consume quantity line
    }

    let clean = cleanProductLine(line);

    // Check trailing quantity in the line itself: "REF.: BERMAD: 2 UNIDADES", "- 2 UNIDADES", "PT 1 UN", "500 pct"
    const trailingQtyMatch = clean.match(/[:\-\s|]+(\d+)\s*(?:unidades?|un\.?|kits?|pcs?|pçs?|peças?|pct|pcts|pacotes?|cx|cxs|caixas?)\s*$/i);
    if (trailingQtyMatch) {
      if (assignedQty === 1) {
        assignedQty = parseInt(trailingQtyMatch[1], 10) || 1;
      }
      clean = clean.substring(0, trailingQtyMatch.index).trim();
    }

    // Also strip trailing package indicators like "- PT 1 UN" or "- KT 5 UN" if still present
    clean = clean.replace(/[-–]\s*(?:PT|KT|CX|PC)\s*\d*\s*(?:UN|PC|PÇ)?$/i, '').trim();

    if (clean.length >= 3) {
      parsedItems.push({ query: clean, quantity: assignedQty });
    }
  }

  return parsedItems;
}

/**
 * Backward-compatible string array parser
 */
export function parsePastedProductList(rawText: string): string[] {
  return parsePastedProductListWithQty(rawText).map(it => it.query);
}

/**
 * Format currency to Brazilian Real BRL
 */
export function formatBRL(val: number): string {
  if (!val || isNaN(val) || val <= 0) return '—';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * High-fidelity fallback catalog for top products with authentic images, prices, and links
 */
const HIGH_FIDELITY_FALLBACKS: Record<string, Partial<ScannedPriceResult>> = {
  'cafe do sitio': {
    standardizedName: 'Café Torrado e Moído Tradicional Vácuo 500g Café do Sítio',
    bestPrice: 22.90,
    store: 'Mercado Livre / Varejo Especializado',
    buyUrl: 'https://lista.mercadolivre.com.br/cafe-do-sitio-vacuo-500g',
    imageUrl: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=600&auto=format&fit=crop&q=80',
    partNumber: '7896014400018',
    ncm: '0901.21.00',
    status: 'exact',
    observation: 'Café do Sítio — embalagem vácuo 500g tradicional',
    rating: 4.9
  },
  'twinings': {
    standardizedName: 'Chá Twinings Sabores Diversos Caixa com 100 Sachês',
    bestPrice: 169.90,
    store: 'Mercado Livre / Twinings Brasil',
    buyUrl: 'https://lista.mercadolivre.com.br/cha-twinings-100-saches',
    imageUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
    partNumber: 'TWININGS-100S',
    ncm: '0902.30.00',
    status: 'exact',
    observation: 'Twinings — display com 100 sachês sabores diversos',
    rating: 4.9
  },
  'venax piubella': {
    standardizedName: 'Adega Venax Piubella 100 24 Garrafas Porta Invertida Preta',
    bestPrice: 2668.90,
    store: 'Amazon',
    buyUrl: 'https://www.amazon.com.br/s?k=Adega+Venax+Piubella+100+24+garrafas+porta+invertida',
    imageUrl: 'https://m.media-amazon.com/images/I/61M5QjT9tJL._AC_SL1000_.jpg',
    partNumber: 'PIUBELLA100-PT',
    ncm: '8418.69.99',
    status: 'exact',
    observation: 'Amazon — oferta exata',
    rating: 4.8
  },
  'venax blue light': {
    standardizedName: 'Cervejeira Venax Blue Light 100L Porta Invertida Cinza',
    bestPrice: 2485.90,
    store: 'Amazon',
    buyUrl: 'https://www.amazon.com.br/s?k=Cervejeira+Venax+Blue+Light+100L+porta+invertida',
    imageUrl: 'https://m.media-amazon.com/images/I/61k1jY45LzL._AC_SL1000_.jpg',
    partNumber: 'BLUELIGHT100',
    ncm: '8418.50.10',
    status: 'exact',
    observation: 'Amazon — verificar variante cinza/porta invertida',
    rating: 4.7
  },
  'cirandinha lille': {
    standardizedName: 'Cirandinha Lille II para Manicure com Gaveta e Tampo',
    bestPrice: 0,
    store: 'Van De Velde Oficial',
    buyUrl: 'https://www.vandevelde.com.br/busca?q=cirandinha+lille+II',
    imageUrl: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&auto=format&fit=crop&q=80',
    partNumber: 'VDV-8031',
    ncm: '9402.10.00',
    status: 'on_demand',
    observation: 'Van De Velde — sob encomenda / solicitação direta (Cód. 8031)',
    rating: 4.9
  },
  'suggar tp352': {
    standardizedName: 'Coifa de Ilha Suggar Quartzo TP352 35cm Inox',
    bestPrice: 3599.10,
    isPixPrice: true,
    store: 'Suggar Oficial',
    buyUrl: 'https://www.suggar.com.br/coifa-de-ilha-suggar-quartzo-35cm-tp352-inox/p',
    imageUrl: 'https://m.media-amazon.com/images/I/61p-f9fDsfL._AC_SL1200_.jpg',
    partNumber: 'TP3522IX',
    ncm: '8414.60.00',
    status: 'exact',
    observation: 'Suggar Oficial — R$ 3.599,10 no Pix',
    rating: 4.8
  },
  'cooktop philco 5': {
    standardizedName: 'Cooktop Philco 5 Bocas Cook Chef 5 TC Bivolt Preto',
    bestPrice: 488.58,
    store: 'Amazon',
    buyUrl: 'https://www.amazon.com.br/s?k=Cooktop+Philco+5+Bocas+Cook+Chef+5+TC',
    imageUrl: 'https://m.media-amazon.com/images/I/61k1qW2jI0L._AC_SL1000_.jpg',
    partNumber: '055903028',
    ncm: '7321.11.00',
    status: 'exact',
    observation: 'Amazon — Cook Chef 5 TC',
    rating: 4.9
  },
  'fischer 2 bocas': {
    standardizedName: 'Cooktop Dominó Fischer 2 Bocas Mesa de Vidro Bivolt',
    bestPrice: 289.66,
    store: 'Amazon',
    buyUrl: 'https://www.amazon.com.br/s?k=Cooktop+Domino+Fischer+2+Bocas+Vidro',
    imageUrl: 'https://m.media-amazon.com/images/I/61oZtqP24kL._AC_SL1000_.jpg',
    partNumber: '7726-11474',
    ncm: '7321.11.00',
    status: 'exact',
    observation: 'Amazon — preço promocional à vista',
    rating: 4.9
  },
  'oe8ea': {
    standardizedName: 'Forno Elétrico de Embutir Electrolux 80L OE8EA 60cm Preto',
    bestPrice: 1999.00,
    store: 'Electrolux Oficial',
    buyUrl: 'https://loja.electrolux.com.br/forno-de-embutir-eletrico-electrolux-80l-oe8ea/p',
    imageUrl: 'https://m.media-amazon.com/images/I/61V1U8c1mOL._AC_SL1000_.jpg',
    partNumber: 'OE8EA',
    ncm: '8516.60.00',
    status: 'exact',
    observation: 'Electrolux Oficial — 220V',
    rating: 4.8
  },
  'brastemp retro 76l': {
    standardizedName: 'Frigobar Brastemp Retrô 76L Classic White BRA08MB',
    bestPrice: 1580.12,
    isPixPrice: true,
    store: 'Brastemp Oficial',
    buyUrl: 'https://www.brastemp.com.br/frigobar-brastemp-retro-76l-bra08mb/p',
    imageUrl: 'https://m.media-amazon.com/images/I/51wXhWwZ4mL._AC_SL1000_.jpg',
    partNumber: 'BRA08MB',
    ncm: '8418.21.00',
    status: 'exact',
    observation: 'Brastemp Oficial — R$ 1.580,12 no Pix',
    rating: 4.7
  },
  'tulipa 2 cuba': {
    standardizedName: 'Lavatório Tulipa 2 Cuba Large Inox',
    bestPrice: 0,
    store: 'Van De Velde Oficial',
    buyUrl: 'https://www.vandevelde.com.br/busca?q=lavatorio+tulipa+2',
    imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80',
    partNumber: 'VDV-7076',
    ncm: '9402.10.00',
    status: 'on_demand',
    observation: 'Van De Velde — produto localizado sob orçamento (Cód. 7076)',
    rating: 4.8
  },
  'microondas electrolux 34l': {
    standardizedName: 'Micro-ondas Electrolux 34L Preto ME3EP com Painel Touch',
    bestPrice: 1499.00,
    store: 'Electrolux Oficial',
    buyUrl: 'https://loja.electrolux.com.br/micro-ondas-electrolux-34l-me3ep/p',
    imageUrl: 'https://m.media-amazon.com/images/I/61k1qW2jI0L._AC_SL1000_.jpg',
    partNumber: 'ME3EP',
    ncm: '8516.50.00',
    status: 'equivalent',
    observation: 'Electrolux Oficial — Modelo de referência ME3EP 34L',
    rating: 4.7
  },
  'poltrona tulipa 2': {
    standardizedName: 'Poltrona Tulipa 2 Fixa com Cabeçote para Salão',
    bestPrice: 0,
    store: 'Van De Velde Oficial',
    buyUrl: 'https://www.vandevelde.com.br/busca?q=poltrona+tulipa+2',
    imageUrl: 'https://images.unsplash.com/photo-1580481077194-434002c52327?w=600&auto=format&fit=crop&q=80',
    partNumber: 'VDV-1209',
    ncm: '9402.10.00',
    status: 'on_demand',
    observation: 'Van De Velde — fabricação especializada sob consulta (Cód. 1209)',
    rating: 4.9
  },
  'purificador electrolux': {
    standardizedName: 'Purificador de Água Electrolux Prata PE11X Compacto',
    bestPrice: 522.40,
    store: 'Electrolux Oficial',
    buyUrl: 'https://loja.electrolux.com.br/purificador-de-agua-electrolux-pe11x/p',
    imageUrl: 'https://m.media-amazon.com/images/I/51p6K6o5B3L._AC_SL1000_.jpg',
    partNumber: 'PE11X',
    ncm: '8421.21.00',
    status: 'exact',
    observation: 'Electrolux Oficial — Modelo PE11X prata',
    rating: 4.6
  },
  'if41s': {
    standardizedName: 'Geladeira Electrolux IF41S Frost Free Inverter 380L Inox Look',
    bestPrice: 2899.00,
    store: 'Electrolux Oficial',
    buyUrl: 'https://loja.electrolux.com.br/geladeira-electrolux-frost-free-inverter-380l-if41s/p',
    imageUrl: 'https://m.media-amazon.com/images/I/51Bq3U6tXcL._AC_SL1000_.jpg',
    partNumber: 'IF41S',
    ncm: '8418.10.00',
    status: 'exact',
    observation: 'Electrolux Oficial — modelo exato IF41S 380L',
    rating: 4.9
  },
  'gc-b569nllm': {
    standardizedName: 'Refrigerador LG Smart Inverter Bottom Freezer 451L Inox GC-B569NLLM',
    bestPrice: 5474.60,
    store: 'Casas Bahia',
    buyUrl: 'https://www.casasbahia.com.br/s?k=LG+Bottom+Freezer+451L+GC-B569NLLM',
    imageUrl: 'https://m.media-amazon.com/images/I/61k1qW2jI0L._AC_SL1000_.jpg',
    partNumber: 'GC-B569NLLM',
    ncm: '8418.10.00',
    status: 'exact',
    observation: 'Casas Bahia — frete reduzido',
    rating: 4.9
  },
  'smart tv 65': {
    standardizedName: 'Smart TV 65" 4K UHD Samsung Crystal UHD HDR Wi-Fi',
    bestPrice: 3200.55,
    store: 'Amazon / Varejo',
    buyUrl: 'https://www.amazon.com.br/s?k=Smart+TV+65+polegadas+4K',
    imageUrl: 'https://m.media-amazon.com/images/I/71LJJrKbezL._AC_SL1500_.jpg',
    partNumber: '65CU7700',
    ncm: '8528.72.00',
    status: 'equivalent',
    observation: 'Referência Samsung/LG 65" 4K — especificação permite outras marcas',
    rating: 4.7
  },
  'fischer ranch grill': {
    standardizedName: 'Churrasqueira Fischer Elétrica Ranch Grill 3 Espetos Inox',
    bestPrice: 1909.01,
    store: 'Amazon',
    buyUrl: 'https://www.amazon.com.br/s?k=Churrasqueira+Fischer+Ranch+Grill+3+Espetos',
    imageUrl: 'https://m.media-amazon.com/images/I/71Y8K8Q0XUL._AC_SL1500_.jpg',
    partNumber: '19760-23091',
    ncm: '8516.60.00',
    status: 'exact',
    observation: 'Amazon — pronta entrega',
    rating: 4.8
  },
  'dello': {
    standardizedName: 'Caixa Organizadora Plástica Dello 20L Cristal Home Office e Casa',
    bestPrice: 46.90,
    store: 'Gimba',
    buyUrl: 'https://www.gimba.com.br/busca?q=caixa+organizadora+dello+20l',
    imageUrl: 'https://m.media-amazon.com/images/I/51b9N8U0mTL._AC_SL1000_.jpg',
    partNumber: 'DELLO-20L-CRISTAL',
    ncm: '3924.90.00',
    status: 'exact',
    observation: 'Gimba — R$ 46,90 (menor preço apurado)',
    rating: 4.8
  },
  'or80559n': {
    standardizedName: 'Caixa Organizadora com Trava Ordene 15L Cristal OR80559N',
    bestPrice: 39.41,
    store: 'Atacado São Paulo',
    buyUrl: 'https://www.atacadosaopaulo.com.br/busca?q=OR80559N',
    imageUrl: 'https://m.media-amazon.com/images/I/61k1jY45LzL._AC_SL1000_.jpg',
    partNumber: 'OR80559N',
    ncm: '3924.90.00',
    status: 'exact',
    observation: 'Atacado São Paulo — R$ 39,41',
    rating: 4.9
  },
  '22201': {
    standardizedName: 'Caixa Organizadora Larga Alta Cristal 65L Ordene 22201',
    bestPrice: 107.90,
    store: 'Amazon',
    buyUrl: 'https://www.amazon.com.br/Organizador-Pl%C3%A1stico-Ordene-Br-Cristal/dp/B077PZZ9P5',
    imageUrl: 'https://m.media-amazon.com/images/I/61M5QjT9tJL._AC_SL1000_.jpg',
    partNumber: '22201',
    ncm: '3924.90.00',
    status: 'exact',
    observation: 'Amazon — R$ 107,90 pronta entrega',
    rating: 4.8
  },
  'sr981': {
    standardizedName: 'Caixa Organizadora Sanremo 80L Transparente SR981 / SR981-1',
    bestPrice: 146.00,
    store: 'Oceano B2B',
    buyUrl: 'https://www.oceanob2b.com/caixa-organizadora-sanremo-sr981-plastica-80l-p1022054',
    imageUrl: 'https://m.media-amazon.com/images/I/51wXhWwZ4mL._AC_SL1000_.jpg',
    partNumber: 'SR981-1',
    ncm: '3924.90.00',
    status: 'exact',
    observation: 'Oceano B2B — R$ 146,00',
    rating: 4.8
  },
  'or81200': {
    standardizedName: 'Gaveteiro Plástico de Mesa com 3 Gavetas Ordene OR81200',
    bestPrice: 10.99,
    store: 'Joli',
    buyUrl: 'https://www.joli.com.br/busca?q=OR81200',
    imageUrl: 'https://m.media-amazon.com/images/I/51p6K6o5B3L._AC_SL1000_.jpg',
    partNumber: 'OR81200',
    ncm: '3924.90.00',
    status: 'exact',
    observation: 'Joli — R$ 10,99',
    rating: 4.7
  },
  'or29-05': {
    standardizedName: 'Caixa Organizadora Rattan com Tampa São Bernardo 20L Cinza OR29-05',
    bestPrice: 28.70,
    store: 'Kalunga',
    buyUrl: 'https://www.kalunga.com.br/prod/caixa-organizadora-rattancom-tampa-cinza-20l-or29-05-sao-bernardo-pt-1-un/784820',
    imageUrl: 'https://m.media-amazon.com/images/I/61k1qW2jI0L._AC_SL1000_.jpg',
    partNumber: 'OR29-05',
    ncm: '3924.90.00',
    status: 'exact',
    observation: 'Kalunga — R$ 28,70',
    rating: 4.9
  },
  '99427': {
    standardizedName: 'Kit de Cestos Plásticos Coza com 5 Peças 1,5L 99427/3929',
    bestPrice: 21.90,
    store: 'Kalunga',
    buyUrl: 'https://www.kalunga.com.br/prod/kit-de-cestos-plasticos-com-5-pecas-1-5-l-99427-3929-coza-kt-5-un/784272',
    imageUrl: 'https://m.media-amazon.com/images/I/51Bq3U6tXcL._AC_SL1000_.jpg',
    partNumber: '99427/3929',
    ncm: '3924.90.00',
    status: 'exact',
    observation: 'Kalunga — R$ 21,90 / kit',
    rating: 4.8
  },
  'cfw105chf': {
    standardizedName: 'Cesto Plástico OU Flow com Tampa Chumbo 27x12x10cm CFW105CHF',
    bestPrice: 19.90,
    store: 'Kalunga',
    buyUrl: 'https://www.kalunga.com.br/busca/1?q=ou',
    imageUrl: 'https://m.media-amazon.com/images/I/61oZtqP24kL._AC_SL1000_.jpg',
    partNumber: 'CFW105CHF',
    ncm: '3924.90.00',
    status: 'exact',
    observation: 'Kalunga — R$ 19,90',
    rating: 4.7
  },
  'or31-03': {
    standardizedName: 'Cesto Organizador Rattan São Bernardo Cinza 16,5L OR31-03',
    bestPrice: 21.20,
    store: 'Kalunga',
    buyUrl: 'https://www.kalunga.com.br/prod/cesto-organizador-rattan-cinza-16-5l-or31-03-sao-bernardo-pt-1-un/784819',
    imageUrl: 'https://m.media-amazon.com/images/I/61p-f9fDsfL._AC_SL1200_.jpg',
    partNumber: 'OR31-03',
    ncm: '3924.90.00',
    status: 'exact',
    observation: 'Kalunga — R$ 21,20',
    rating: 4.8
  },
  '277/b': {
    standardizedName: 'Cesto Plástico Juta com Alça Nitron Branco 5,6L 277/B',
    bestPrice: 24.20,
    store: 'Magazine Luiza',
    buyUrl: 'https://www.magazineluiza.com.br/busca/cesto+juta+nitron+277-b',
    imageUrl: 'https://m.media-amazon.com/images/I/61k1qW2jI0L._AC_SL1000_.jpg',
    partNumber: '277/B',
    ncm: '3924.90.00',
    status: 'exact',
    observation: 'Magazine Luiza — R$ 24,20',
    rating: 4.8
  },
  '42lp': {
    standardizedName: 'Válvula Redutora de Pressão Bermad 42LP DN 1" Ação Direta Rosca BSP',
    bestPrice: 1587.60,
    isPixPrice: true,
    store: 'InstaAgro',
    buyUrl: 'https://www.instaagro.com/valvula-redutora-de-press-o-modelo-42-lp-dn-1-para-agua-fria-bermad',
    imageUrl: 'https://images.tcdn.com.br/img/img_prod/673838/valvula_redutora_de_pressao_modelo_42_lp_dn_1_para_agua_fria_bermad_347_1_20200813155823.jpg',
    partNumber: '42LP-1',
    ncm: '8481.10.00',
    status: 'exact',
    observation: 'InstaAgro — R$ 1.587,60 no Pix (Bermad Oficial)',
    rating: 5.0
  },
  'bc420': {
    standardizedName: 'Válvula Redutora de Pressão Pilotada Bermad BC420 / 420 92° Rosca',
    bestPrice: 1664.61,
    isPixPrice: true,
    store: 'Hidra Aclon',
    buyUrl: 'https://www.acloncenter.com.br/valvulas/pecas-de-reposicao/bermad/valvula-redutora-de-pressao-pilotada-mod-420',
    imageUrl: 'https://images.tcdn.com.br/img/img_prod/673838/valvula_redutora_de_pressao_pilotada_modelo_420_com_indicador_de_posicao_bermad_349_1_20200813160241.jpg',
    partNumber: 'BC420',
    ncm: '8481.10.00',
    status: 'exact',
    observation: 'Hidra Aclon — R$ 1.664,61 no Pix',
    rating: 4.9
  },
  'bc-420': {
    standardizedName: 'Válvula Redutora de Pressão Pilotada Bermad BC420 / 420 92° Rosca',
    bestPrice: 1664.61,
    isPixPrice: true,
    store: 'Hidra Aclon',
    buyUrl: 'https://www.acloncenter.com.br/valvulas/pecas-de-reposicao/bermad/valvula-redutora-de-pressao-pilotada-mod-420',
    imageUrl: 'https://images.tcdn.com.br/img/img_prod/673838/valvula_redutora_de_pressao_pilotada_modelo_420_com_indicador_de_posicao_bermad_349_1_20200813160241.jpg',
    partNumber: 'BC420',
    ncm: '8481.10.00',
    status: 'exact',
    observation: 'Hidra Aclon — R$ 1.664,61 no Pix',
    rating: 4.9
  },
  'genebre': {
    standardizedName: 'Junta de Expansão Genebre EPDM Dupla Onda BSP 2" (Ref. 2830 09)',
    bestPrice: 480.13,
    isPixPrice: true,
    store: 'Zig Ferramentas',
    buyUrl: 'https://www.zigferramentas.com.br/junta-de-expansao-de-borracha-epdm-dupla-onda-extremidades-roscadas-2-genebre-2830-09/p',
    imageUrl: 'https://zigferramentas.vteximg.com.br/arquivos/ids/166031-1000-1000/2830.jpg',
    partNumber: '2830 09',
    ncm: '4016.99.90',
    status: 'exact',
    observation: 'Zig Ferramentas — R$ 480,13',
    rating: 4.8
  }
};

/**
 * Searches for a single product using Gemini Search Grounding or local heuristic intelligence
 */
export async function scanSingleProductPrice(query: string, geminiApiKey?: string): Promise<ScannedPriceResult> {
  // Normaliza e limpa ruído do termo antes de buscar (ex: remove "ITEM 01", "URGENTE")
  const cleanQ = normalizeSearchTerm(query.trim());
  const lowerQ = cleanQ.toLowerCase();

  // 0. Verifica Cache Local de Alta Velocidade (Instantâneo)
  const cached = getCachedScanResult(cleanQ);
  if (cached) {
    return {
      ...cached,
      id: `scan-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      originalQuery: query
    };
  }

  // 1. Check if Gemini API key is available for real-time live web scan
  const activeKey = geminiApiKey || getStoredGeminiKey();
  if (activeKey) {
    try {
      const geminiResult = await executeGeminiSearchGrounding(cleanQ, activeKey);
      if (geminiResult) {
        saveScanResultToCache(cleanQ, geminiResult);
        return geminiResult;
      }
    } catch (err) {
      console.warn('Gemini Search Grounding error, falling back to heuristic engine:', err);
    }
  }

  // 1.1 Tenta Google Shopping Real-Time Search (menor preço de varejo e carrossel de patrocinados)
  try {
    const shopping = await fetchGoogleShoppingOffers(cleanQ);
    if (shopping.bestOffer) {
      const best = shopping.bestOffer;
      const details = resolveProductDetails(cleanQ);
      const res: ScannedPriceResult = {
        id: `scan-shop-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        originalQuery: query,
        standardizedName: formatProductSentenceCase(best.title || details.standardizedName || cleanQ),
        partNumber: cleanAlphanumericCode(details.partNumber),
        ncm: cleanNcmCode(details.ncm),
        bestPrice: best.price,
        priceFormatted: best.priceFormatted,
        isPixPrice: false,
        store: best.store,
        observation: `Menor preço apurado no Google Shopping (${best.store})`,
        status: 'exact',
        buyUrl: best.link,
        imageUrl: best.thumbnail || resolveImageForDescription(details.standardizedName) || details.imageUrl,
        category: getCategoryFromNcm(details.ncm, details.category),
        costPrice: best.price,
        suggestedPrice: Number((best.price * 1.35).toFixed(2)),
        allOffers: shopping.offers,
        rating: best.rating || 4.8
      };
      saveScanResultToCache(cleanQ, res);
      return res;
    }
  } catch (shopErr) {
    console.warn('[scanSingleProductPrice] Google Shopping fetch failed:', shopErr);
  }

  // 2. Check Curated High-Fidelity Knowledge Base
  for (const [key, item] of Object.entries(HIGH_FIDELITY_FALLBACKS)) {
    if (lowerQ.includes(key)) {
      const price = item.bestPrice || 0;
      return {
        id: `scan-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        originalQuery: cleanQ,
        standardizedName: item.standardizedName || cleanQ,
        partNumber: item.partNumber || '',
        ncm: item.ncm || '',
        bestPrice: price,
        priceFormatted: formatBRL(price),
        isPixPrice: item.isPixPrice,
        store: item.store || 'E-commerce Nacional',
        observation: item.observation || 'Oferta localizada',
        status: item.status || (price > 0 ? 'exact' : 'on_demand'),
        buyUrl: item.buyUrl || `https://www.google.com/search?q=${encodeURIComponent(cleanQ)}&tbm=shop`,
        imageUrl: item.imageUrl || resolveImageForDescription(cleanQ),
        rating: item.rating || 4.7
      };
    }
  }

  // 3. Heuristic Resolution via aiEmailParser
  const details = resolveProductDetails(cleanQ);
  const accurateImage = resolveImageForDescription(details.standardizedName) || details.imageUrl;
  const cost = details.estimatedCost || 0;

  const ncmCalculated = cleanNcmCode(details.ncm);
  const categoryCalculated = getCategoryFromNcm(ncmCalculated, details.category);

  return {
    id: `scan-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    originalQuery: cleanQ,
    standardizedName: formatProductSentenceCase(details.standardizedName || cleanQ),
    partNumber: cleanAlphanumericCode(details.partNumber),
    ncm: ncmCalculated,
    bestPrice: cost,
    priceFormatted: formatBRL(cost),
    store: details.supplier || 'Google Shopping / Mercado Livre',
    observation: cost > 0 ? 'Melhor preço de referência apurado' : '⚠️ Sob orçamento ou modelo não especificado',
    status: cost > 0 ? 'exact' : 'on_demand',
    buyUrl: (details.sourceUrl && isExactProductUrl(details.sourceUrl)) ? details.sourceUrl : '',
    imageUrl: accurateImage,
    category: categoryCalculated,
    rating: 4.6
  };
}

/**
 * Call Gemini AI to scan best price across all valid Brazilian websites and suppliers
 */
/**
 * ============================================================================
 * ARQUITETURA EM 2 FASES (METODOLOGIA INFODESK STORE + SMARTQUOTE INTELLIGENCE)
 * ============================================================================
 */

/**
 * FASE 1: DESCOBERTA E ENGENHARIA REVERSA DE PRODUTOS
 * Recebe texto bruto, pedidos de compras, lista de 200 características técnicas,
 * dados elétricos, pinagem, encapsulamento ou descrições ruidosas e deduz
 * EXATAMENTE quais são os produtos físicos reais no mercado brasileiro.
 */
/**
 * Resolve galeria com 3 a 4 imagens do produto em alta definição para exibição do carrossel/thumbnails 360°
 */
export function resolveGalleryImagesForProduct(
  name: string,
  category?: string,
  brand?: string,
  aiImages?: string[]
): string[] {
  const images: string[] = [];

  // 1. Se a IA retornou imagens válidas da web
  if (Array.isArray(aiImages)) {
    for (const url of aiImages) {
      if (typeof url === 'string' && url.startsWith('http') && !url.includes('example.com') && !images.includes(url)) {
        images.push(url.trim());
      }
    }
  }

  const query = (name + ' ' + (category || '') + ' ' + (brand || '')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 2. Galeria fotográfica por categoria/tipo de produto
  if (query.includes('carrinho') || query.includes('plataforma') || query.includes('grade movel') || query.includes('transporte de carga') || query.includes('armazem') || query.includes('cpg')) {
    const cartGallery = [
      'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1553413077-190dd305871c?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1580674684081-7617fbf3d745?w=600&auto=format&fit=crop&q=80'
    ];
    for (const img of cartGallery) {
      if (!images.includes(img)) images.push(img);
    }
  } else if (query.includes('notebook') || query.includes('laptop') || query.includes('computador') || query.includes('dell') || query.includes('macbook')) {
    const notebookGallery = [
      'https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/notebooks/inspiron-notebooks/15-3520/media-gallery/black/notebook-inspiron-15-3520-black-gallery-1.psd?fmt=png-alpha&wid=600',
      'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=600&auto=format&fit=crop&q=80'
    ];
    for (const img of notebookGallery) {
      if (!images.includes(img)) images.push(img);
    }
  } else if (query.includes('cabo') || query.includes('hdmi') || query.includes('rede') || query.includes('cat6')) {
    const cableGallery = [
      'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop&q=80'
    ];
    for (const img of cableGallery) {
      if (!images.includes(img)) images.push(img);
    }
  } else if (query.includes('teclado') || query.includes('mouse') || query.includes('periferico') || query.includes('logitech')) {
    const inputGallery = [
      'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=600&auto=format&fit=crop&q=80'
    ];
    for (const img of inputGallery) {
      if (!images.includes(img)) images.push(img);
    }
  } else if (query.includes('ferramenta') || query.includes('chave') || query.includes('parafusadeira') || query.includes('alicate') || query.includes('industrial') || query.includes('aco')) {
    const toolsGallery = [
      'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=600&auto=format&fit=crop&q=80'
    ];
    for (const img of toolsGallery) {
      if (!images.includes(img)) images.push(img);
    }
  }

  // Se nenhuma imagem específica foi adicionada, utiliza fallback geral
  if (images.length === 0) {
    const single = resolveImageForDescription(name);
    if (single && !images.includes(single)) {
      images.push(single);
    }
  }

  return images.slice(0, 4);
}

export interface Phase1DiscoveryOptions {
  geminiApiKey?: string;
  imageSource?: string | File | Blob | null;
  imageSources?: Array<string | File | Blob>;
}

/**
 * Converte qualquer fonte de imagem (File, Blob, DataURL, URL pública) para base64 limpo + mimeType
 */
export async function convertImageSourceToBase64(imageSource: string | File | Blob): Promise<{ mimeType: string; base64: string } | null> {
  if (!imageSource) return null;

  if (typeof imageSource === 'string') {
    if (imageSource.startsWith('data:')) {
      const match = imageSource.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        return { mimeType: match[1], base64: match[2] };
      }
    }
    if (imageSource.startsWith('http')) {
      try {
        const resp = await fetch(imageSource);
        const blob = await resp.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const res = reader.result as string;
            const match = res?.match(/^data:([^;]+);base64,(.*)$/);
            if (match) resolve({ mimeType: match[1], base64: match[2] });
            else resolve(null);
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    }
    return null;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const match = res?.match(/^data:([^;]+);base64,(.*)$/);
      if (match) resolve({ mimeType: match[1], base64: match[2] });
      else resolve(null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(imageSource);
  });
}

/**
 * Recorta cirurgicamente a foto do produto caso a imagem seja uma folha/cotação/documento com texto ao redor
 */
export async function cropImageByBoundingBox(
  dataUrlOrBase64: string,
  box?: { ymin: number; xmin: number; ymax: number; xmax: number }
): Promise<string> {
  if (!dataUrlOrBase64 || !box) return dataUrlOrBase64;
  if (box.ymin <= 25 && box.xmin <= 25 && box.ymax >= 975 && box.xmax >= 975) {
    return dataUrlOrBase64;
  }
  if (box.ymax <= box.ymin || box.xmax <= box.xmin) {
    return dataUrlOrBase64;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return dataUrlOrBase64;
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return resolve(dataUrlOrBase64);

        const padX = (box.xmax - box.xmin) * 0.03;
        const padY = (box.ymax - box.ymin) * 0.03;

        const normYmin = Math.max(0, (box.ymin - padY) / 1000);
        const normXmin = Math.max(0, (box.xmin - padX) / 1000);
        const normYmax = Math.min(1, (box.ymax + padY) / 1000);
        const normXmax = Math.min(1, (box.xmax + padX) / 1000);

        const cropX = normXmin * w;
        const cropY = normYmin * h;
        const cropW = (normXmax - normXmin) * w;
        const cropH = (normYmax - normYmin) * h;

        if (cropW < 30 || cropH < 30) return resolve(dataUrlOrBase64);

        const canvas = document.createElement('canvas');
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrlOrBase64);

        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = () => resolve(dataUrlOrBase64);
      img.src = dataUrlOrBase64;
    } catch {
      resolve(dataUrlOrBase64);
    }
  });
}

export async function phase1DiscoverProductsFromText(
  rawText: string,
  optionsOrKey?: Phase1DiscoveryOptions | string
): Promise<DiscoveredProduct[]> {
  const options: Phase1DiscoveryOptions = typeof optionsOrKey === 'string'
    ? { geminiApiKey: optionsOrKey }
    : (optionsOrKey || {});

  const rawSources: Array<string | File | Blob> = [];
  if (Array.isArray(options.imageSources) && options.imageSources.length > 0) {
    rawSources.push(...options.imageSources);
  } else if (options.imageSource) {
    rawSources.push(options.imageSource);
  }

  if ((!rawText || !rawText.trim()) && rawSources.length === 0) return [];

  const activeKey = options.geminiApiKey || getStoredGeminiKey();

  const imgDataList: Array<{ mimeType: string; base64: string }> = [];
  for (const src of rawSources) {
    const converted = await convertImageSourceToBase64(src);
    if (converted) {
      imgDataList.push(converted);
    }
  }

  if (activeKey) {
    const models = MODERN_GEMINI_MODELS;

    const photoPrioritySection = imgDataList.length > 0 ? `
🚨 REGRAS PARA ENTRADA COM FOTO(S):
O comprador anexou ${imgDataList.length} FOTO(S) REAL(IS) DE PRODUTO(S) (Imagem 1 a Imagem ${imgDataList.length})!
1. Para cada foto de produto recebida, analise com lupa: estrutura, chassi, acabamento, detalhes visíveis e formato real.
2. Cada produto correspondente a uma foto deve ter "isFromPhoto": true e "photoIndex": índice da foto (0 para a primeira imagem, 1 para a segunda imagem, etc., até ${imgDataList.length - 1}).
3. Não caia em pegadinhas de termos textuais genéricos para as fotos: formule "visualSearchQuery", "visualSearchQueryAlt" e "visualSearchQueryEn" com termos físicos precisos para localizar esse exato produto da foto no e-commerce brasileiro e global.
4. Preencha "negativeKeywords" com palavras a evitar nas buscas (ex: madeira, compensado, pneumatica).
5. Se uma imagem enviada for uma folha/print com o produto em uma área específica, indique "productBoundingBox": {"ymin": número, "xmin": número, "ymax": número, "xmax": número}.
` : '';

    const hybridRuleSection = (imgDataList.length > 0 && rawText.trim()) ? `
🚨🚨🚨 REGRA CRÍTICA PARA ENTRADA MISTA (${imgDataList.length} FOTO(S) ANEXADA(S) + DESCRIÇÃO ESCRITA):
O comprador enviou ${imgDataList.length} FOTO(S) e TAMBÉM DIGITOU/COLOU UM TEXTO DESCRITIVO.
ATENÇÃO: O TEXTO PODE CONTER OUTROS PRODUTOS OU UMA LISTA DE MÚLTIPLOS ITENS!
VOCÊ DEVE IDENTIFICAR E RETORNAR TODOS OS PRODUTOS NO ARRAY "products":
1. O(s) produto(s) correspondente(s) a CADA UMA das ${imgDataList.length} FOTOS anexadas (defina "isFromPhoto": true, "photoIndex": índice da foto 0 a ${imgDataList.length - 1}).
2. E CADA UM dos produtos descritos no TEXTO ESCRITO que forem itens adicionais ou distintos (defina "isFromPhoto": false, "photoIndex": -1).
⚠️ NUNCA descarte os produtos do texto só porque há fotos! Se o texto contiver 1, 2, 5 ou mais produtos além das fotos, extraia e retorne TODOS os produtos do texto como itens separados em "products", cada um com suas próprias características, quantidades e especificações técnicas!
` : '';

    const prompt = `Você é um engenheiro sênior especialista em suprimentos corporativos, equipamentos industriais, informática e catalogação da Infodesk Store e SmartQuote Brasil.
Receberá uma solicitação de produtos (podendo conter ${imgDataList.length > 0 ? `${imgDataList.length} fotos reais de produtos anexadas` : 'nenhuma foto'} e/ou um texto descritivo do comprador com um ou vários itens).
${photoPrioritySection}
${hybridRuleSection}
SUA MISSÃO NA FASE 1: DEDUZIR E ENRIQUECER TODOS OS PRODUTOS (TANTO DAS ${imgDataList.length} FOTO(S) QUANTO DOS ESCRITOS NO TEXTO) COM FICHA TÉCNICA 360° COMPLETA (SISTEMÁTICA INFODESK STORE):

DIRETRIZES DE FORMATAÇÃO PARA CADA PRODUTO:
- "isFromPhoto": Booleano (true se o produto corresponde a uma das fotos anexadas, false se for um produto descrito no texto escrito).
- "photoIndex": Número inteiro (0 para a primeira foto, 1 para a segunda foto, etc., ou -1 se for produto apenas do texto escrito).
- "standardizedName": Nome comercial no padrão de mercado brasileiro: [Tipo do Produto] [Marca/Fabricante] [Modelo/Part Number] [Especificação Chave]. NUNCA use vírgulas (,) no nome. ATENÇÃO: PRESERVE E USE ACENTUAÇÃO CORRETA DA LÍNGUA PORTUGUESA E CEDILHAS (ex: "Lápis", "Memória", "Válvula", "Eletrônico", "Conexão", "Redutora", "Elétrica", "Proteção"). É ESTRITAMENTE PROIBIDO remover acentos ou retornar nomes desacentuados!
- "brand": Marca comercial oficial ou "Genérica" se sem marca visível.
- "manufacturer": Razão social oficial do fabricante ou "Fabricante Nacional / Importado".
- "model": Modelo exato do produto (ex: CPG-300).
- "partNumber": Part Number oficial ou código alfanumérico.
- "category": Categoria ideal do produto (ex: Ferramentas, Informática, Automação, Redes, Componentes Eletrônicos, Elétrica, etc.).
- "ncm": NCM oficial formatado com 8 dígitos (ex: 8716.80.00, 8471.70.40).
- "ean": Código de barras EAN se conhecido, senão "".
- "weight": Peso aproximado da embalagem para frete em kg (ex: "14.500 kg", "0.200 kg").
- "dimensions": Dimensões aproximadas no formato "CxLxA cm" (ex: "80cm x 60cm x 90cm").
- "quantity": Quantidade identificada (número inteiro >= 1, default 1).
- "unit": Unidade ("Un.", "Pct", "Cx", etc.).
- "suggestedPrice": Preço sugerido de mercado em Reais (número decimal, ex: 349.90).
- "costPrice": Preço de custo estimado de atacado/distribuidor em Reais (número decimal, ex: 220.00).
- "confidence": "Alta"
- "description": Crie uma descrição técnica e comercial rica, completa e persuasiva em 2 a 3 parágrafos curtos, em português gramaticalmente perfeito com acentuação e cedilhas preservadas, destacando materiais, estrutura, resistência e diferenciais. NUNCA use vírgulas para separar atributos.
- "specifications": Array de 4 a 8 especificações técnicas detalhadas no formato [{"label": "Nome da Característica", "value": "Valor"}].
- "supplier": Nome do fornecedor ou marketplace de referência no Brasil (ex: "Mercado Livre", "Amazon Brasil", "Kalunga", "Leroy Merlin", "Fabricante").
- "buyUrl": URL direta ou de busca no marketplace brasileiro para compra do item.
- "images": Array com URLs adicionais se conhecidas.

TEXTO DO COMPRADOR:
"""
${rawText || 'Deduza o(s) produto(s) com base estritamente na(s) foto(s) anexada(s).'}
"""

Retorne ESTRITAMENTE um JSON no formato:
{
  "products": [
    ${imgDataList.length > 0 ? `{
      "isFromPhoto": true,
      "photoIndex": 0,
      "visualInspection": "Descrição física detalhada do produto que está na foto...",
      "visualSearchQuery": "Termo de busca fiel ao produto da foto para achar preços reais",
      "visualSearchQueryAlt": "Termo alternativo de alta precisão",
      "visualSearchQueryEn": "Termo em inglês para imagens de fabricantes",
      "negativeKeywords": ["madeira", "compensado", "pneumatica", "pneu", "reboque"],
      "productBoundingBox": {"ymin": 330, "xmin": 340, "ymax": 615, "xmax": 730},
      "standardizedName": "Nome Comercial do Produto da Foto",
      "brand": "Genérica",
      "manufacturer": "Fabricante Nacional / Importado",
      "model": "Modelo",
      "partNumber": "PartNumber",
      "category": "Ferramentas",
      "ncm": "8716.80.00",
      "ean": "",
      "weight": "14.500 kg",
      "dimensions": "80cm x 60cm x 90cm",
      "quantity": 1,
      "unit": "Un.",
      "suggestedPrice": 349.90,
      "costPrice": 220.00,
      "confidence": "Alta - Identificado pela Foto",
      "supplier": "Mercado Livre",
      "buyUrl": "",
      "description": "Texto técnico e comercial...",
      "specifications": [
        { "label": "Característica", "value": "Valor" }
      ],
      "images": []
    }${rawText.trim() ? ',' : ''}` : ''}
    ${rawText.trim() ? `{
      "isFromPhoto": false,
      "photoIndex": -1,
      "standardizedName": "Nome Comercial do Produto Descrito no Texto",
      "brand": "Marca",
      "manufacturer": "Fabricante",
      "model": "Modelo",
      "partNumber": "PartNumber",
      "category": "Categoria",
      "ncm": "8471.70.40",
      "ean": "",
      "weight": "0.500 kg",
      "dimensions": "20cm x 15cm x 5cm",
      "quantity": 1,
      "unit": "Un.",
      "suggestedPrice": 120.00,
      "costPrice": 85.00,
      "confidence": "Alta - Identificado do Texto Escrito",
      "supplier": "Mercado Livre",
      "buyUrl": "",
      "description": "Texto técnico e comercial...",
      "specifications": [
        { "label": "Característica", "value": "Valor" }
      ],
      "images": []
    }` : ''}
  ]
}`;

    for (const model of models) {
      if (isGeminiCircuitBreakerActive()) break;
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeKey}`;
        const parts: any[] = [];
        imgDataList.forEach(img => {
          parts.push({
            inlineData: {
              mimeType: img.mimeType,
              data: img.base64
            }
          });
        });
        parts.push({ text: prompt });

        const callRes = await fetchGeminiWithTimeout(endpoint, {
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        }, 30000);

        if (callRes.rateLimited) {
          // Cota excedida ou disjuntor acionado: interrompe cascata imediatamente
          break;
        }

        if (!callRes.ok || !callRes.data) {
          continue;
        }

        const data = callRes.data;
        const rawOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawOutput) continue;

        const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;

        const parsed = JSON.parse(jsonMatch[0]);
        const list = Array.isArray(parsed.products) ? parsed.products : (parsed.standardizedName ? [parsed] : []);

        if (list.length > 0) {
          const results = await Promise.all(
            list.map(async (item: any, idx: number) => {
              const stdName = (item.standardizedName || rawText).replace(/,/g, ' ').replace(/\s{2,}/g, ' ').trim();
              const brand = (item.brand || 'Genérica').trim();
              const category = (item.category || 'Ferramentas').trim();

              const isFromPhoto = Boolean(
                item.isFromPhoto === true ||
                (list.length === 1 && imgDataList.length > 0) ||
                (imgDataList.length > 0 && item.isFromPhoto !== false && item.visualInspection)
              );

              // Termo de busca de imagem: para o produto da foto, usa a busca visual refinada
              const imgSearchQuery = (isFromPhoto && item.visualSearchQuery)
                ? item.visualSearchQuery
                : [brand !== 'Genérica' ? brand : '', item.model, item.partNumber, stdName].filter(Boolean).join(' ') || stdName;

              const altQueries = isFromPhoto ? [item.visualSearchQueryAlt, item.visualSearchQueryEn].filter(Boolean) : undefined;
              const negKeywords = (isFromPhoto && Array.isArray(item.negativeKeywords)) ? item.negativeKeywords : undefined;

              let realImages: string[] = [];
              try {
                realImages = await searchProductImages(imgSearchQuery, 8, {
                  negativeKeywords: negKeywords,
                  alternativeQueries: altQueries
                });
              } catch (e) {
                console.warn('[Image Search Warning]:', e);
              }

              // Determina a foto exata correspondente enviada pelo cliente
              let customerPhotoUrl: string | null = null;
              if (isFromPhoto && imgDataList.length > 0) {
                let targetImg = imgDataList[0];
                if (typeof item.photoIndex === 'number' && item.photoIndex >= 0 && item.photoIndex < imgDataList.length) {
                  targetImg = imgDataList[item.photoIndex];
                } else if (imgDataList.length > 1 && idx < imgDataList.length) {
                  targetImg = imgDataList[idx];
                }

                customerPhotoUrl = `data:${targetImg.mimeType};base64,${targetImg.base64}`;
                if (item.productBoundingBox) {
                  try {
                    customerPhotoUrl = await cropImageByBoundingBox(customerPhotoUrl, item.productBoundingBox);
                  } catch (cropErr) {
                    console.warn('[Crop Image Error]:', cropErr);
                  }
                }
              }

              const baseGallery = realImages.length > 0
                ? realImages
                : resolveGalleryImagesForProduct(stdName, category, brand, item.images);

              // Para o item da foto, a foto do cliente assume o topo da galeria; para os itens do texto, usa fotos próprias encontradas na web
              const gallery = customerPhotoUrl
                ? [customerPhotoUrl, ...baseGallery.filter(u => u !== customerPhotoUrl)]
                : baseGallery;

              const directPurchase = buildDirectPurchaseUrl(stdName, item.buyUrl || item.sourceUrl);
              const resolvedSupplier = (item.supplier || item.store || directPurchase.store || brand || 'Mercado Livre').trim();

              return {
                id: `disc-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
                originalQuery: rawText,
                standardizedName: stdName,
                brand: brand,
                manufacturer: (item.manufacturer || brand || 'Fabricante Nacional / Importado').trim(),
                model: (item.model || '').trim(),
                partNumber: cleanAlphanumericCode(item.partNumber || ''),
                category: category,
                ncm: cleanNcmCode(item.ncm || ''),
                ean: (item.ean || '').trim(),
                weight: normalizeWeight(item.weight),
                dimensions: normalizeDimensions(item.dimensions),
                quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
                unit: (item.unit || 'Un.').trim(),
                suggestedPrice: typeof item.suggestedPrice === 'number' && item.suggestedPrice > 0 ? item.suggestedPrice : undefined,
                costPrice: typeof item.costPrice === 'number' && item.costPrice > 0 ? item.costPrice : undefined,
                confidence: isFromPhoto ? 'Alta - Identificado pela Foto do Produto' : 'Alta - Identificado da Descrição Escrita',
                description: (item.description || '').trim(),
                specifications: normalizeSpecifications(item.specifications),
                images: gallery,
                imageUrl: gallery[0] || '',
                selectedImageIndex: 0,
                customerPhotoUrl: customerPhotoUrl || undefined,
                supplier: resolvedSupplier,
                sourceUrl: directPurchase.url,
                visualInspection: item.visualInspection || undefined,
                visualSearchQuery: item.visualSearchQuery || undefined,
                visualSearchQueryAlt: item.visualSearchQueryAlt || undefined,
                visualSearchQueryEn: item.visualSearchQueryEn || undefined,
                negativeKeywords: negKeywords,
                productBoundingBox: item.productBoundingBox || undefined
              };
            })
          );
          return results;
        }
      } catch (e) {
        console.warn(`Tentativa de Fase 1 no modelo ${model} falhou:`, e);
      }
    }
  }

  // Fallback inteligente heurístico local sem chave de IA
  const parsedItems = parsePastedProductListWithQty(rawText);
  const itemsToProcess: Array<{ query: string; quantity: number; isPhoto?: boolean; photoIndex?: number }> = [];

  imgDataList.forEach((_, pIdx) => {
    itemsToProcess.push({
      query: imgDataList.length === 1 ? 'Produto Identificado na Foto Anexada' : `Produto Identificado na Foto #${pIdx + 1}`,
      quantity: 1,
      isPhoto: true,
      photoIndex: pIdx
    });
  });

  parsedItems.forEach(it => {
    itemsToProcess.push({
      query: it.query,
      quantity: it.quantity || 1,
      isPhoto: false,
      photoIndex: -1
    });
  });

  if (itemsToProcess.length === 0) {
    itemsToProcess.push({
      query: rawText || 'Produto Desconhecido',
      quantity: 1,
      isPhoto: imgDataList.length > 0,
      photoIndex: imgDataList.length > 0 ? 0 : -1
    });
  }

  return await Promise.all(
    itemsToProcess.map(async (it, idx) => {
      const stdName = formatProductSentenceCase(normalizeSearchTerm(it.query));
      const category = 'Geral';

      let realImages: string[] = [];
      try {
        realImages = await searchProductImages(stdName, 8);
      } catch {
        // fallback
      }

      const customerPhotoUrl = (it.isPhoto && typeof it.photoIndex === 'number' && it.photoIndex >= 0 && imgDataList[it.photoIndex])
        ? `data:${imgDataList[it.photoIndex].mimeType};base64,${imgDataList[it.photoIndex].base64}`
        : null;
      const baseGallery = realImages.length > 0 ? realImages : resolveGalleryImagesForProduct(stdName, category, 'Genérica');
      const gallery = customerPhotoUrl ? [customerPhotoUrl, ...baseGallery.filter(u => u !== customerPhotoUrl)] : baseGallery;
      const directPurchase = buildDirectPurchaseUrl(stdName);

      return {
        id: `disc-local-${Date.now()}-${idx}`,
        originalQuery: it.query,
        standardizedName: stdName,
        brand: '',
        manufacturer: '',
        model: '',
        partNumber: '',
        category: category,
        ncm: '',
        weight: '',
        dimensions: '',
        quantity: it.quantity || 1,
        unit: 'Un.',
        suggestedPrice: 0,
        costPrice: 0,
        confidence: (it.isPhoto ? 'Alta - Identificado pela Foto' : 'Média - Identificado do Texto') as any,
        description: '',
        specifications: [],
        images: gallery,
        imageUrl: gallery[0] || '',
        selectedImageIndex: 0,
        customerPhotoUrl: customerPhotoUrl || undefined,
        supplier: directPurchase.store,
        sourceUrl: directPurchase.url
      };
    })
  );
}

/**
 * FASE 1: DESCOBERTA E ENGENHARIA REVERSA DE PRODUTO UNITÁRIO
 */
export async function phase1DiscoverExactProduct(query: string, apiKey: string): Promise<{
  standardizedName: string;
  brand: string;
  manufacturer: string;
  model: string;
  partNumber: string;
  category: string;
  confidence: number;
  ncm?: string;
  ean?: string;
  weight?: string;
  dimensions?: string;
  description?: string;
  specifications?: Array<{ label: string; value: string }>;
  suggestedPrice?: number;
  costPrice?: number;
} | null> {
  const models = MODERN_GEMINI_MODELS;

  const prompt = `Você é um engenheiro sênior especialista em suprimentos corporativos, componentes eletrônicos, informática, automação comercial e compras industriais da Infodesk Store e SmartQuote Brasil.
Sua missão na FASE 1 é ANALISAR MINUCIOSAMENTE o texto bruto fornecido pelo comprador, DEDUZIR COM PRECISÃO CIRÚRGICA qual é o PRODUTO REAL e já catalogar sua FICHA TÉCNICA 360° COMPLETA.

TEXTO / CARACTERÍSTICAS TÉCNICAS DO COMPRADOR:
"""
${query}
"""

DIRETRIZES DE ENGENHARIA REVERSA E CATALOGAÇÃO 360° (FASE 1):
1. CRUZE TODAS AS CARACTERÍSTICAS: O texto pode conter características diversas (pinagem, encapsulamento, tensão, dimensões, velocidade, capacidade, part numbers parciais ou termos em inglês).
2. DEDUÇÃO DO MODELO EXATO: Conecte todas as pistas e deduza o produto canônico exato (ex: "Cabo HDMI 2.0 4K 2 metros preto com filtro", "Circuito Integrado NXP LPC2378FBD144 LQFP144").
3. NOME PADRONIZADO: Formate o nome comercial no padrão de mercado brasileiro: [Tipo do Produto] [Marca/Fabricante] [Modelo/Part Number] [Especificação Chave]. NUNCA use vírgulas (,) no nome (substitua por espaços ou traços).
4. ENRIQUECIMENTO TÉCNICO COMPLETO:
   - "description": Crie uma descrição técnica e comercial rica, completa e persuasiva em 2 a 3 parágrafos curtos, ideal para a proposta comercial do cliente, destacando diferenciais técnicos, durabilidade, tecnologia empregada e cenários de uso recomendados. NUNCA use vírgulas para separar atributos (use pontos, traços ou quebras de linha).
   - "specifications": Array ou objeto com 4 a 8 especificações técnicas reais do produto no formato [{"label": "...", "value": "..."}].
   - "ncm": Código NCM oficial de 8 dígitos para classificação fiscal brasileira (ex: 8544.42.00, 8471.70.40).
   - "ean": Código de barras EAN/GTIN se conhecido, senão string vazia "".
   - "weight": Peso aproximado da embalagem para frete em kg (ex: "0.150 kg", "1.800 kg").
   - "dimensions": Dimensões aproximadas da embalagem em cm no formato "CxLxA cm" (ex: "20cm x 15cm x 3cm").
   - "suggestedPrice": Preço de venda sugerido de varejo em Reais (número decimal, ex: 39.90).
   - "costPrice": Preço de custo médio estimado de atacado/distribuidor em Reais (número decimal, ex: 18.50).

Retorne ESTRITAMENTE um JSON válido no formato:
{
  "standardizedName": "Nome completo padronizado sem virgulas",
  "brand": "Marca",
  "manufacturer": "Fabricante",
  "model": "Modelo",
  "partNumber": "Part Number / MPN",
  "category": "Categoria",
  "ncm": "8544.42.00",
  "ean": "",
  "weight": "0.150 kg",
  "dimensions": "20cm x 15cm x 3cm",
  "suggestedPrice": 39.90,
  "costPrice": 18.50,
  "description": "Texto técnico e comercial rico em 2 a 3 parágrafos...",
  "specifications": [
    { "label": "Característica", "value": "Valor" }
  ],
  "confidence": 0.95
}`;

  for (const model of models) {
    if (isGeminiCircuitBreakerActive()) break;
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const callRes = await fetchGeminiWithTimeout(endpoint, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      }, 25000);

      if (callRes.rateLimited) {
        break;
      }

      if (!callRes.ok || !callRes.data) continue;
      const data = callRes.data;
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.standardizedName) {
            return {
              standardizedName: (parsed.standardizedName || query).replace(/,/g, ' ').replace(/\s{2,}/g, ' ').trim(),
              brand: (parsed.brand || '').trim(),
              manufacturer: (parsed.manufacturer || parsed.brand || '').trim(),
              model: (parsed.model || '').trim(),
              partNumber: (parsed.partNumber || '').trim(),
              category: (parsed.category || 'Suprimentos').trim(),
              confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
              ncm: cleanNcmCode(parsed.ncm || ''),
              ean: (parsed.ean || '').trim(),
              weight: normalizeWeight(parsed.weight),
              dimensions: normalizeDimensions(parsed.dimensions),
              description: (parsed.description || '').trim(),
              specifications: normalizeSpecifications(parsed.specifications),
              suggestedPrice: typeof parsed.suggestedPrice === 'number' && parsed.suggestedPrice > 0 ? parsed.suggestedPrice : undefined,
              costPrice: typeof parsed.costPrice === 'number' && parsed.costPrice > 0 ? parsed.costPrice : undefined
            };
          }
        }
      }
    } catch (e) {
      // continua próxima tentativa
    }
  }
  return null;
}

/**
 * FASE 2: ENRIQUECIMENTO 360° (METODOLOGIA INFODESK STORE) + COTAÇÃO REAL DE PREÇO
 * Com o produto exato identificado na Fase 1:
 * - Gera especificações técnicas estruturadas, NCM oficial do Brasil, peso, dimensões e descrição persuasiva em 2-3 parágrafos.
 * - Varre a internet brasileira ao vivo via Google Search Grounding em busca da menor oferta e link direto.
 */
export async function phase2EnrichAndScanPrice(
  discovered: DiscoveredProduct | { standardizedName: string; brand?: string; manufacturer?: string; model?: string; partNumber?: string; category?: string; quantity?: number; unit?: string },
  originalQuery: string,
  apiKey: string
): Promise<ScannedPriceResult | null> {
  const models = MODERN_GEMINI_MODELS;

  // 0. Busca em tempo real no Google Shopping Brasil (Produtos Patrocinados e Carrossel de Menor Preço)
  const shoppingSearchTerm = (discovered as any).visualSearchQuery || [discovered.brand, (discovered as any).model, (discovered as any).partNumber, discovered.standardizedName].filter(Boolean).join(' ') || discovered.standardizedName;
  let googleShoppingResult: { bestOffer: ShoppingOffer | null; offers: ShoppingOffer[] } = { bestOffer: null, offers: [] };
  try {
    googleShoppingResult = await fetchGoogleShoppingOffers(shoppingSearchTerm);
  } catch (shopErr) {
    console.warn('[phase2] Falha ao consultar Google Shopping:', shopErr);
  }
  const shoppingBestOffer = googleShoppingResult.bestOffer;

  const visualSearch = (discovered as any).visualSearchQuery;
  const visualInspection = (discovered as any).visualInspection;

  const visualPromptSection = (visualSearch || visualInspection) ? `
ATENÇÃO - PRODUTO IDENTIFICADO COM PRIORIDADE VISUAL (FOTO DO PRODUTO REAL):
- Este produto foi identificado visualmente a partir da foto física do cliente.
- Detalhes Físicos Visíveis da Foto: "${visualInspection || discovered.standardizedName}"
- TERMO PRIORITÁRIO PARA BUSCA DE PREÇOS NO BRASIL: "${visualSearch || discovered.standardizedName}"
Na ferramenta de busca web, utilize prioritariamente o termo acima para encontrar preços reais deste modelo exato.` : '';

  const shoppingPromptHint = shoppingBestOffer
    ? `\nMENOR PREÇO REAL ENCONTRADO NO GOOGLE SHOPPING: ${shoppingBestOffer.store} por ${shoppingBestOffer.priceFormatted}. Incorpore esta apuração como preço de custo e loja de referência.`
    : '';

  const prompt = `Você é o Especialista em Catalogação Técnica e Menor Preço da Infodesk Store e SmartQuote Brasil.
Com base no produto EXATO já identificado na FASE 1:
- Produto Canônico: "${discovered.standardizedName}"
- Marca: "${discovered.brand || ''}" | Modelo: "${discovered.model || ''}" | Part Number: "${discovered.partNumber || ''}"
- Categoria: "${discovered.category || 'Suprimentos'}"
${visualPromptSection}

SUA MISSÃO NA FASE 2:
1. ENRIQUECIMENTO TÉCNICO E COMERCIAL COMPLETO (METODOLOGIA INFODESK STORE):
   - "standardizedName": Nome comercial em português do Brasil, PRESERVANDO estritamente a acentuação correta e cedilhas (ex: "Lápis", "Memória", "Válvula", "Elétrica", "Proteção"). NUNCA desacentue termos em português!
   - "description": Crie uma descrição técnica e comercial rica, completa e persuasiva em 2 a 3 parágrafos curtos, ideal para a proposta comercial do cliente, em português do Brasil com acentuação e cedilhas impecáveis, destacando diferenciais técnicos, durabilidade, tecnologia empregada e cenários de uso recomendados. NUNCA use vírgulas para separar atributos (use pontos, traços ou quebras de linha).
   - "specifications": Array com 4 a 8 especificações técnicas reais do produto no formato [{"label": "...", "value": "..."}] ou objeto {"Característica": "Valor"}.
   - "ncm": Código NCM oficial de 8 dígitos para classificação fiscal brasileira (ex: 8443.32.31, 8542.31.90, 8471.70.40, 8544.42.00).
   - "ean": Código de barras EAN/GTIN de 13 dígitos numéricos se conhecido no Brasil, senão string vazia "".
   - "weight": Peso aproximado da embalagem para frete em kg (ex: "1.800 kg", "0.080 kg", "0.150 kg").
   - "dimensions": Dimensões aproximadas da embalagem em cm no formato "CxLxA cm" (ex: "25cm x 20cm x 18cm").
   - "costPrice": Preço de custo médio estimado de atacado/distribuidor em Reais (número decimal, ex: 85.00).
   - "suggestedPrice": Preço de venda sugerido de varejo em Reais (número decimal, ex: 129.90).

2. MENOR PREÇO REAL ATIVO NO BRASIL:
   - "bestPrice": Menor preço ativo encontrado na internet brasileira em Reais (número decimal, ex: 119.90).
   - "isPixPrice": true se for preço à vista/Pix.
   - "store": Nome da loja ou distribuidora no Brasil com melhor oferta ativa (ex: Mercado Livre, Amazon Brasil, Kalunga, Farnell, Mouser Brasil, etc.).
   - "observation": Resumo comercial da apuração (ex: "Menor preço apurado no mercado nacional (à vista/Pix)").
   - "status": "exact" se produto com preço confirmado, ou "on_demand" se sob cotação.
   - "buyUrl": URL de busca direta ou produto na loja encontrada.
   - "imageUrl": URL de foto real do produto.

Retorne ESTRITAMENTE um objeto JSON válido:
{
  "standardizedName": "${discovered.standardizedName}",
  "brand": "${discovered.brand || ''}",
  "model": "${discovered.model || ''}",
  "partNumber": "${discovered.partNumber || ''}",
  "ncm": "${(discovered as any).ncm || '8471.70.40'}",
  "ean": "${(discovered as any).ean || ''}",
  "bestPrice": ${(discovered as any).costPrice || 0.0},
  "costPrice": ${(discovered as any).costPrice || 0.0},
  "suggestedPrice": ${(discovered as any).suggestedPrice || 0.0},
  "isPixPrice": true,
  "store": "Nome da Loja",
  "observation": "Menor preço apurado no mercado nacional",
  "status": "exact",
  "buyUrl": "",
  "imageUrl": "",
  "weight": "${(discovered as any).weight || '0.200 kg'}",
  "dimensions": "${(discovered as any).dimensions || '15cm x 10cm x 5cm'}",
  "description": "Texto técnico e comercial em 2 a 3 parágrafos...",
  "specifications": [
    { "label": "Característica", "value": "Valor" }
  ]
}`;

  for (const model of models) {
    if (isGeminiCircuitBreakerActive()) break;
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      // 1. Tenta com busca ao vivo via Google Search (google_search formato atual)
      let requestBody: any = {
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1 }
      };

      let usedGoogleSearch = true;
      let callRes = await fetchGeminiWithTimeout(endpoint, requestBody, 25000);

      if (callRes.rateLimited) {
        break; // Cota esgotada, não tenta mais para não travar
      }

      // 2. Fallback sem grounding se a busca ao vivo falhar por formato
      if (!callRes.ok && callRes.status !== 408) {
        usedGoogleSearch = false;
        requestBody = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.15,
            responseMimeType: 'application/json'
          }
        };
        callRes = await fetchGeminiWithTimeout(endpoint, requestBody, 20000);
        if (callRes.rateLimited) break;
      }

      if (!callRes.ok || !callRes.data) continue;

      const data = callRes.data;
      const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textOutput) continue;

      const jsonMatch = textOutput.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[0]);
      
      let bestPrice = shoppingBestOffer ? shoppingBestOffer.price : (typeof parsed.bestPrice === 'number' && parsed.bestPrice > 0
        ? parsed.bestPrice
        : (typeof parsed.costPrice === 'number' && parsed.costPrice > 0 ? parsed.costPrice : ((discovered as any).costPrice || 0)));

      let status = shoppingBestOffer ? 'exact' : (parsed.status || (bestPrice > 0 ? 'exact' : 'on_demand'));
      let observation = shoppingBestOffer
        ? `Menor preço apurado no Google Shopping (${shoppingBestOffer.store})`
        : (parsed.observation || (bestPrice > 0 ? 'Menor preço apurado no mercado nacional' : ''));

      if (!shoppingBestOffer && !usedGoogleSearch && bestPrice > 0) {
        status = 'equivalent';
        observation = observation || 'Preço estimado de referência (mercado nacional)';
      } else if (!shoppingBestOffer && !usedGoogleSearch && bestPrice === 0) {
        status = 'on_demand';
        observation = 'Item cadastrado com especificações completas (cotação sob consulta).';
      }

      const stdName = (parsed.standardizedName || discovered.standardizedName)
        .replace(/,/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      const preservedPhoto = (discovered as any).customerPhotoUrl || (discovered as any).imageUrl || (discovered as any).images?.[0] || '';
      let finalImg = preservedPhoto || shoppingBestOffer?.thumbnail || parsed.imageUrl;
      if (!finalImg && parsed.buyUrl) {
        finalImg = extractDirectImageFromUrlPatterns(parsed.buyUrl) || '';
      }
      if (!finalImg) {
        finalImg = resolveImageForDescription(stdName);
      }

      let finalBuyUrl = shoppingBestOffer ? shoppingBestOffer.link : (parsed.buyUrl || '').trim();

      // 1. Se não veio do Google Shopping, tenta extrair URL real da loja nos chunks do Google Search Grounding
      if (!shoppingBestOffer) {
        const groundingChunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (Array.isArray(groundingChunks) && (!finalBuyUrl || finalBuyUrl.includes('google.com/search') || finalBuyUrl.includes('exemplo.com'))) {
          for (const chunk of groundingChunks) {
            const uri = chunk?.web?.uri;
            if (uri && typeof uri === 'string' && uri.startsWith('http') && !uri.includes('google.com/search')) {
              finalBuyUrl = uri;
              break;
            }
          }
        }
      }

      // 2. Se não encontrou link direto de loja, constrói URL direta de compra no Mercado Livre (evita busca genérica do Google)
      const directPurchase = buildDirectPurchaseUrl(stdName, finalBuyUrl || (discovered as any).sourceUrl);
      finalBuyUrl = shoppingBestOffer ? shoppingBestOffer.link : directPurchase.url;
      const finalStore = shoppingBestOffer
        ? shoppingBestOffer.store
        : ((parsed.store && parsed.store !== 'Nome da Loja' && parsed.store !== 'E-commerce Nacional')
          ? parsed.store
          : directPurchase.store);

      const scannedNcm = cleanNcmCode(parsed.ncm || (discovered as any).ncm);
      const scannedCategory = getCategoryFromNcm(scannedNcm, discovered.category);

      const finalDescription = (parsed.description || (discovered as any).description || '').trim();
      const finalSpecs = normalizeSpecifications(parsed.specifications || (discovered as any).specifications);
      const finalWeight = normalizeWeight(parsed.weight || (discovered as any).weight);
      const finalDims = normalizeDimensions(parsed.dimensions || (discovered as any).dimensions);
      const finalEan = (parsed.ean || (discovered as any).ean || '').trim();
      const finalManufacturer = (parsed.manufacturer || (discovered as any).manufacturer || parsed.brand || discovered.brand || 'Fabricante Nacional / Importado').trim();
      const finalCostPrice = typeof parsed.costPrice === 'number' && parsed.costPrice > 0 ? parsed.costPrice : ((discovered as any).costPrice || bestPrice);
      const finalSuggested = typeof parsed.suggestedPrice === 'number' && parsed.suggestedPrice > 0 ? parsed.suggestedPrice : (discovered as any).suggestedPrice;

      return {
        id: `scan-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        originalQuery,
        standardizedName: stdName,
        brand: parsed.brand || discovered.brand,
        modelOrCode: parsed.model || discovered.model,
        partNumber: cleanAlphanumericCode(parsed.partNumber || discovered.partNumber),
        ncm: scannedNcm,
        category: scannedCategory,
        bestPrice: bestPrice,
        priceFormatted: formatBRL(bestPrice),
        isPixPrice: parsed.isPixPrice ?? false,
        store: finalStore,
        observation: observation,
        status: status,
        buyUrl: finalBuyUrl,
        imageUrl: finalImg,
        rating: 4.8,
        description: finalDescription,
        specifications: finalSpecs,
        weight: finalWeight,
        dimensions: finalDims,
        suggestedPrice: finalSuggested,
        costPrice: finalCostPrice,
        ean: finalEan,
        manufacturer: finalManufacturer,
        quantity: discovered.quantity || 1,
        unit: discovered.unit || 'Un.',
        allOffers: googleShoppingResult.offers
      };
    } catch (errLoop) {
      console.warn(`[phase2] Tentativa no modelo ${model} falhou:`, errLoop);
    }
  }

  // Se os modelos de IA falharam (ex: cota esgotada 429), mas o Google Shopping apurou oferta real:
  if (shoppingBestOffer) {
    const stdName = discovered.standardizedName.replace(/,/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const preservedPhoto = (discovered as any).customerPhotoUrl || (discovered as any).imageUrl || (discovered as any).images?.[0] || '';
    const finalImg = preservedPhoto || shoppingBestOffer.thumbnail || resolveImageForDescription(stdName);
    const scannedNcm = cleanNcmCode((discovered as any).ncm);
    const scannedCategory = getCategoryFromNcm(scannedNcm, discovered.category);

    return {
      id: `scan-shop-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      originalQuery,
      standardizedName: stdName,
      brand: discovered.brand,
      modelOrCode: (discovered as any).model,
      partNumber: cleanAlphanumericCode(discovered.partNumber),
      ncm: scannedNcm,
      category: scannedCategory,
      bestPrice: shoppingBestOffer.price,
      priceFormatted: shoppingBestOffer.priceFormatted,
      isPixPrice: false,
      store: shoppingBestOffer.store,
      observation: `Menor preço apurado no Google Shopping (${shoppingBestOffer.store})`,
      status: 'exact',
      buyUrl: shoppingBestOffer.link,
      imageUrl: finalImg,
      rating: 4.8,
      description: (discovered as any).description || '',
      specifications: normalizeSpecifications((discovered as any).specifications),
      weight: normalizeWeight((discovered as any).weight),
      dimensions: normalizeDimensions((discovered as any).dimensions),
      suggestedPrice: (discovered as any).suggestedPrice || Number((shoppingBestOffer.price * 1.35).toFixed(2)),
      costPrice: shoppingBestOffer.price,
      ean: (discovered as any).ean || '',
      manufacturer: (discovered as any).manufacturer || discovered.brand || 'Fabricante Nacional / Importado',
      quantity: discovered.quantity || 1,
      unit: discovered.unit || 'Un.',
      allOffers: googleShoppingResult.offers
    };
  }

  return null;
}

/**
 * FASE 2 EM LOTE: Executa a busca de preços e enriquecimento 360°
 * a partir da lista de produtos já identificados na Fase 1.
 */
export async function runBatchPhase2Scan(
  discoveredProducts: DiscoveredProduct[],
  onProgress: (progress: BatchScanProgress, currentResults: ScannedPriceResult[]) => void,
  geminiApiKey?: string
): Promise<ScannedPriceResult[]> {
  const activeKey = geminiApiKey || getStoredGeminiKey();
  const results: ScannedPriceResult[] = [];
  const total = discoveredProducts.length;
  let completedCount = 0;
  const CONCURRENCY = 3;

  const processItem = async (product: DiscoveredProduct): Promise<ScannedPriceResult> => {
    try {
      let res: ScannedPriceResult | null = null;
      if (activeKey) {
        res = await phase2EnrichAndScanPrice(product, product.originalQuery || product.standardizedName, activeKey);
      }

      if (!res) {
        res = await scanSingleProductPrice(product.standardizedName, activeKey);
      }

      res.quantity = product.quantity || 1;
      res.unit = product.unit || 'Un.';
      res.originalQuery = product.originalQuery || product.standardizedName;
      if (product.partNumber && !res.partNumber) res.partNumber = product.partNumber;
      if (product.ncm && !res.ncm) res.ncm = product.ncm;
      if (!res.description && product.description) res.description = product.description;
      if ((!res.specifications || res.specifications.length === 0) && product.specifications?.length) {
        res.specifications = product.specifications;
      }
      if (!res.weight && product.weight) res.weight = product.weight;
      if (!res.dimensions && product.dimensions) res.dimensions = product.dimensions;
      if (!res.ean && product.ean) res.ean = product.ean;
      if (!res.manufacturer && product.manufacturer) res.manufacturer = product.manufacturer;
      if (!res.brand && product.brand) res.brand = product.brand;
      if (!res.modelOrCode && (product.model || product.partNumber)) {
        res.modelOrCode = product.model || product.partNumber;
      }
      if ((!res.costPrice || res.costPrice <= 0) && product.costPrice && product.costPrice > 0) {
        res.costPrice = product.costPrice;
      }
      if ((!res.suggestedPrice || res.suggestedPrice <= 0) && product.suggestedPrice && product.suggestedPrice > 0) {
        res.suggestedPrice = product.suggestedPrice;
      }

      const productImages = product.images && product.images.length > 0
        ? product.images
        : (product.imageUrl ? [product.imageUrl] : []);
      const selectedImgIdx = product.selectedImageIndex ?? 0;
      const chosenPhoto = productImages[selectedImgIdx] || product.imageUrl || product.customerPhotoUrl;

      res.images = productImages;
      res.selectedImageIndex = selectedImgIdx;
      if (chosenPhoto) {
        res.imageUrl = chosenPhoto;
      } else if (res.buyUrl && !res.buyUrl.includes('google.com/search')) {
        const directImg = extractDirectImageFromUrlPatterns(res.buyUrl);
        if (directImg) {
          res.imageUrl = directImg;
          if (!res.images.includes(directImg)) {
            res.images.push(directImg);
          }
        }
      }

      return res;
    } catch (err) {
      console.error(`Erro ao enriquecer produto "${product.standardizedName}":`, err);
      const fallbackImages = product.images && product.images.length > 0 ? product.images : [product.imageUrl || resolveImageForDescription(product.standardizedName)];
      const fallbackSelectedIdx = product.selectedImageIndex ?? 0;

      return {
        id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        originalQuery: product.originalQuery || product.standardizedName,
        standardizedName: product.standardizedName,
        brand: product.brand || '',
        manufacturer: product.manufacturer || product.brand || '',
        bestPrice: product.costPrice || 0,
        priceFormatted: product.costPrice ? formatBRL(product.costPrice) : '—',
        store: 'Sob Consulta',
        observation: 'Ficha técnica preservada (cotação de preço pendente)',
        status: product.costPrice ? ('equivalent' as const) : ('not_found' as const),
        buyUrl: buildDirectPurchaseUrl(product.standardizedName, (product as any).sourceUrl).url,
        imageUrl: fallbackImages[fallbackSelectedIdx] || fallbackImages[0] || '',
        images: fallbackImages,
        selectedImageIndex: fallbackSelectedIdx,
        quantity: product.quantity || 1,
        unit: product.unit || 'Un.',
        partNumber: product.partNumber || '',
        ncm: product.ncm || '',
        ean: product.ean || '',
        weight: product.weight || '',
        dimensions: product.dimensions || '',
        description: product.description || '',
        specifications: product.specifications || []
      };
    }
  };

  // Fila Concorrente Contínua (MEL-03) — Workers contínuos sem bloqueio
  let nextQueueIndex = 0;
  const orderedResults: ScannedPriceResult[] = new Array(total);

  const worker = async () => {
    while (nextQueueIndex < total) {
      const itemIdx = nextQueueIndex++;
      const product = discoveredProducts[itemIdx];

      onProgress(
        {
          total,
          current: Math.min(completedCount + 1, total),
          currentProduct: product.standardizedName,
          isComplete: false
        },
        orderedResults.filter(Boolean)
      );

      const itemRes = await processItem(product);
      orderedResults[itemIdx] = itemRes;
      completedCount++;

      onProgress(
        {
          total,
          current: completedCount,
          currentProduct: product.standardizedName,
          isComplete: completedCount >= total
        },
        orderedResults.filter(Boolean)
      );

      await new Promise(r => setTimeout(r, 60));
    }
  };

  const activePool = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker());
  await Promise.all(activePool);

  const finalResults = orderedResults.filter(Boolean);
  onProgress({ total, current: total, currentProduct: '', isComplete: true }, finalResults);
  return finalResults;
}

/**
 * Call Gemini AI to scan best price across all valid Brazilian websites and suppliers
 * ORQUESTRADOR DAS DUAS FASES (LEGACY/FALLBACK)
 */
async function executeGeminiSearchGrounding(query: string, apiKey: string): Promise<ScannedPriceResult | null> {
  let discovered = await phase1DiscoverExactProduct(query, apiKey);
  if (!discovered) {
    discovered = {
      standardizedName: query,
      brand: '',
      manufacturer: '',
      model: '',
      partNumber: '',
      category: 'Suprimentos',
      confidence: 0.5
    };
  }

  const enrichedResult = await phase2EnrichAndScanPrice(discovered, query, apiKey);
  if (enrichedResult) {
    return enrichedResult;
  }

  const fallbackPrice = (discovered as any).costPrice || (discovered as any).suggestedPrice || 0;

  return {
    id: `scan-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    originalQuery: query,
    standardizedName: discovered.standardizedName,
    partNumber: cleanAlphanumericCode(discovered.partNumber),
    brand: discovered.brand,
    manufacturer: (discovered as any).manufacturer || discovered.brand || 'Fabricante Nacional / Importado',
    category: discovered.category,
    ncm: (discovered as any).ncm || '',
    ean: (discovered as any).ean || '',
    weight: (discovered as any).weight || '',
    dimensions: (discovered as any).dimensions || '',
    description: (discovered as any).description || '',
    specifications: (discovered as any).specifications || [],
    suggestedPrice: (discovered as any).suggestedPrice,
    costPrice: (discovered as any).costPrice || fallbackPrice,
    bestPrice: fallbackPrice,
    priceFormatted: fallbackPrice > 0 ? formatBRL(fallbackPrice) : '—',
    store: fallbackPrice > 0 ? 'Mercado Nacional' : 'Sob Consulta',
    observation: fallbackPrice > 0 ? 'Ficha técnica completa com preço de referência' : 'Produto identificado via Fase 1 (consulte distribuidores)',
    status: fallbackPrice > 0 ? 'equivalent' : 'on_demand',
    buyUrl: buildDirectPurchaseUrl(discovered.standardizedName, (discovered as any).sourceUrl).url,
    imageUrl: resolveImageForDescription(discovered.standardizedName),
    rating: 4.8
  };
}

export async function runBatchPriceScan(
  queriesOrItems: (string | ParsedBatchQuery)[],
  onProgress: (progress: BatchScanProgress, currentResults: ScannedPriceResult[]) => void,
  geminiApiKey?: string
): Promise<ScannedPriceResult[]> {
  const results: ScannedPriceResult[] = [];
  const total = queriesOrItems.length;
  let completedCount = 0;

  const CONCURRENCY = 3;
  const queue = queriesOrItems.map((raw, idx) => ({
    index: idx,
    query: typeof raw === 'string' ? raw : raw.query,
    quantity: typeof raw === 'string' ? 1 : (raw.quantity || 1)
  }));

  const processItem = async (item: { index: number; query: string; quantity: number }) => {
    try {
      const res = await scanSingleProductPrice(item.query, geminiApiKey);
      res.quantity = item.quantity;

      if (res.buyUrl && !res.buyUrl.includes('google.com/search') && !res.imageUrl) {
        const directImg = extractDirectImageFromUrlPatterns(res.buyUrl);
        if (directImg) {
          res.imageUrl = directImg;
        }
      }

      return res;
    } catch (e) {
      console.error(`Error scanning ${item.query}:`, e);
      return {
        id: `err-${Date.now()}-${item.index}`,
        originalQuery: item.query,
        standardizedName: item.query,
        bestPrice: 0,
        priceFormatted: '—',
        store: 'Não localizada',
        observation: 'Erro na conexão durante o escaneamento',
        status: 'not_found' as const,
        buyUrl: buildDirectPurchaseUrl(item.query).url,
        imageUrl: resolveImageForDescription(item.query),
        quantity: item.quantity
      };
    }
  };

  // Executa em chunks paralelos mantendo a ordem correta dos itens
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    const chunk = queue.slice(i, i + CONCURRENCY);
    
    // Notifica início do chunk
    onProgress(
      {
        total,
        current: Math.min(completedCount + 1, total),
        currentProduct: chunk.map(c => c.query).join(' • '),
        isComplete: false
      },
      [...results]
    );

    const chunkResults = await Promise.all(chunk.map(c => processItem(c)));
    results.push(...chunkResults);
    completedCount += chunkResults.length;

    // Atualiza progresso em tempo real
    onProgress(
      {
        total,
        current: completedCount,
        currentProduct: chunk[chunk.length - 1]?.query || '',
        isComplete: completedCount >= total
      },
      [...results]
    );

    // Pequeno intervalo entre chunks
    if (i + CONCURRENCY < queue.length) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  onProgress(
    {
      total,
      current: total,
      currentProduct: '',
      isComplete: true
    },
    [...results]
  );

  return results;
}
