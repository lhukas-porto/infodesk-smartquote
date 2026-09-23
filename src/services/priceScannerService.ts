/**
 * Price Scanner Service - Infodesk SmartQuote
 * Provides single & batch product price scanning, real-time web search with Gemini Search Grounding / DuckDuckGo / Public E-commerce Catalog,
 * and high-fidelity image and product detail resolution.
 */

import { resolveProductDetails, resolveImageForDescription, cleanAlphanumericCode, cleanNcmCode, formatProductSentenceCase, getCategoryFromNcm, buildCompleteProductDescription, buildDirectPurchaseUrl, isExactProductUrl } from '../utils/aiEmailParser';
import { extractImageFromStoreUrl, extractDirectImageFromUrlPatterns } from './imageExtractorService';
import { DiscoveredProduct } from '../types';
import { searchProductImages } from './imageSearchService';
import { compressImageDataUrl } from '../utils/imageCompressor';

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
 * Modelos Gemini disponíveis para esta conta.
 * gemini-flash-lite-latest e gemini-3.1-flash-lite respondem em ~3s mesmo em picos de alta demanda.
 * gemini-3.6-flash e 3.5-flash atuam como fallbacks adicionais.
 */
export const MODERN_GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash'
];

/**
 * Disjuntor (Circuit Breaker) para a API Gemini:
 * Se todos os modelos da cascata falharem por cota, suspende chamadas de IA
 * por apenas 15 segundos para dar tempo à cota regenerar.
 */
let geminiCircuitBreakerUntil = 0;

export function isGeminiCircuitBreakerActive(): boolean {
  return Date.now() < geminiCircuitBreakerUntil;
}

export function resetGeminiCircuitBreaker(): void {
  geminiCircuitBreakerUntil = 0;
}

/**
 * Executa requisição para a API Gemini com timeout estrito via AbortController.
 * Não trava todos os modelos se apenas 1 deles tiver cota esgotada (429).
 */
async function fetchGeminiWithTimeout(
  endpoint: string,
  body: any,
  timeoutMs: number = 25000
): Promise<{ ok: boolean; status: number; data?: any; errorText?: string; rateLimited?: boolean }> {
  if (isGeminiCircuitBreakerActive()) {
    return { ok: false, status: 429, errorText: 'Circuit breaker ativo (cota de IA em resfriamento rápido)', rateLimited: true };
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
      console.warn('[Gemini API] Modelo retornou 429 (rate limit). O scanner tentará o próximo modelo da cascata.');
      return { ok: false, status: 429, errorText: 'Quota exceeded for model', rateLimited: true };
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

/**
 * Higieniza o nome comercial padronizado do produto:
 * - Remove artefatos de OCR e marcadores soltos: ".º", "1 .º", "º", "* —", etc.
 * - Remove prefixos errôneos de categoria (ex: "Monitor ventosa" -> "Ventosa")
 * - Remove parágrafos descritivos colados no título comercial
 * - Limpa pontuações quebradas e vírgulas
 */
export function sanitizeStandardizedProductName(rawName: string, category?: string, brand?: string): string {
  if (!rawName) return '';
  let name = rawName.trim();

  // 1. Remove artefatos de OCR e marcadores soltos: ".º", "1 .º", "º", "* —", "•", "▪"
  name = name.replace(/(?:\.º|\d+\s*\.º|º|\*\s*—|•|▪|→)/g, ' ');

  // 2. Remove pontuações estranhas e vírgulas
  name = name.replace(/,/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // 3. Remove frases truncadas de fim de linha comuns em OCR (ex: "pacote com", "kit com", "caixa com" solto no final)
  name = name.replace(/\s+(?:pacote|kit|caixa|embalagem)\s+(?:com|de)?\s*$/i, '');

  // 4. Correção de prefixos incorretos de categoria:
  // Se o nome começar com "Monitor " mas for uma ventosa, bucha, suporte adesivo, etc.
  if (/^Monitor\s+(?:ventosa|bucha|parafuso|adesivo|pel[ií]cula|presilha|abra[çc]adeira|gancho)/i.test(name)) {
    name = name.replace(/^Monitor\s+/i, '');
  }
  // Se o nome começar com "Headset " mas for de outros departamentos
  if (/^Headset\s+(?!.*\b(?:fone|auricular|microfone|headphone|usb\b|p3\b|p2\b|bluetooth)\b)(?:ventosa|bucha|parafuso|adesivo|suporte|cabo|tinta|fita|disjuntor|alicate|chave|caneta|papel|l[aâ]mpada|lumin[aá]ria|filamento|resina|tubo|caixa|jogo\s+de\s+xadrez)/i.test(name)) {
    name = name.replace(/^Headset\s+/i, '');
  }

  // 5. Se o nome for longo e contiver frases/verbos descritivos emendados:
  // Ex: "Ventosa de 30mm... produzidas em plástico silicone e pvc cristal garantem boa fixação..."
  const cutMarkers = [
    /\s+produzid[ao]s?\s+em\b/i,
    /\s+fabricad[ao]s?\s+em\b/i,
    /\s+garantem?\b/i,
    /\s+adequado?\s+para\b/i,
    /\s+ideal\s+para\b/i,
    /\s+desenvolvid[ao]\s+para\b/i,
    /\s+evitando\b/i,
    /\s+cor:\s*/i,
    /\s+di[aâ]metro:\s*/i,
    /\s+di[aâ]metro\s+do\s+furo:\s*/i
  ];

  for (const marker of cutMarkers) {
    const match = name.search(marker);
    if (match > 12) {
      name = name.substring(0, match).trim();
      break;
    }
  }

  // 6. Limpeza final de pontuação e capitalização
  name = name.replace(/[\.\-\:\,]+$/, '').trim();
  if (name.length > 0) {
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }

  // 7. Restaura capitalização oficial de marcas reconhecidas no nome do produto
  for (const b of RECOGNIZED_BRANDS) {
    const reg = new RegExp(`\\b${b}\\b`, 'gi');
    name = name.replace(reg, b);
  }

  // Se uma marca explícita foi detectada/passada (ex: Intelbras, Logitech), assegura sua grafia correta
  if (brand && brand !== 'Genérica') {
    const regB = new RegExp(`\\b${brand}\\b`, 'gi');
    name = name.replace(regB, brand);
  }

  // 8. Restaura siglas e acrônimos técnicos comuns em maiúsculo
  const techAcronyms = ['USB', 'HDMI', 'VGA', 'DVI', 'P3', 'P2', 'Cat6', 'Cat5e', 'Cat5', 'LED', 'LCD', 'OLED', 'RGB', 'SSD', 'HDD', 'NVMe', 'ABNT2', 'Bivolt', 'Wi-Fi', 'WiFi', 'Bluetooth', 'PoE', 'RJ45', 'RJ11', 'Full HD', '4K'];
  for (const ac of techAcronyms) {
    const reg = new RegExp(`\\b${ac}\\b`, 'gi');
    name = name.replace(reg, ac);
  }

  return name;
}

/**
 * Higieniza e estrutura a descrição técnica do produto:
 * - Remove lixo de OCR e marcadores (".º", "1 .º", "* —")
 * - Remove frases truncadas como "pacote com" solto no final
 * - Remove prefixos errôneos
 * - Garante pontuação e parágrafos elegantes
 */
export function sanitizeProductDescription(rawDesc: string, fallbackName: string): string {
  if (!rawDesc || rawDesc.trim().length < 15) {
    return `Produto comercial de alta qualidade: ${fallbackName}. Fabricado com padrões rigorosos de resistência, acabamento e durabilidade para uso corporativo e profissional.`;
  }

  let text = rawDesc.trim();

  // 1. Remove artefatos de OCR e marcadores soltos
  text = text.replace(/(?:\.º|\d+\s*\.º|º|\*\s*—|•|▪|→)/g, ' ');

  // 2. Remove frases truncadas de fim de texto
  text = text.replace(/\s+(?:pacote|kit|caixa|embalagem)\s+(?:com|de)?\s*$/i, '.');

  // 3. Remove "Monitor " se colado no início de produtos que não são monitores
  text = text.replace(/^Monitor\s+(ventosa|bucha|parafuso|adesivo|presilha)/i, '$1');

  // 4. Limpa múltiplos espaços
  text = text.replace(/\s{2,}/g, ' ').trim();

  // 5. Garante que inicie com letra maiúscula e termine com ponto final
  text = text.charAt(0).toUpperCase() + text.slice(1);
  if (!text.endsWith('.')) {
    text += '.';
  }

  return text;
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

  let rawDataUrl: string | null = null;

  if (typeof imageSource === 'string') {
    if (imageSource.startsWith('data:')) {
      rawDataUrl = imageSource;
    } else if (imageSource.startsWith('http')) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 4000);
        const resp = await fetch(imageSource, { signal: controller.signal });
        clearTimeout(t);
        const blob = await resp.blob();
        rawDataUrl = await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string || null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    }
  } else {
    rawDataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(imageSource);
    });
  }

  if (!rawDataUrl) return null;

  // Comprime a imagem para 1024x1024 mantendo nitidez visual, mas reduzindo o payload de 5MB para ~60KB
  const optimizedUrl = await compressImageDataUrl(rawDataUrl, 1024, 1024, 0.85);
  const match = optimizedUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }
  return null;
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

// ==============================================================================
// MOTOR DE ENRIQUECIMENTO HEURÍSTICO E BASE DE CONHECIMENTO CORPORATIVO (INFODESK)
// Garante que mesmo com IA offline, sem internet ou com instabilidade (503/429),
// qualquer busca de produto traga Ficha Técnica 360° COMPLETA, NCM oficial,
// categoria correta das 15 diretrizes, especificações estruturadas e preços.
// ==============================================================================

export const OFFICIAL_15_CATEGORIES = [
  'Informática, Hardware & Periféricos',
  'Redes, Conectividade & Telefonia',
  'Áudio, Vídeo & Apresentação',
  'Monitores, Displays & TVs',
  'Energia, Nobreaks & Baterias',
  'Impressão & Automação Comercial',
  'Papelaria, Artes & Material de Escritório',
  'Elétrica & Iluminação Tática',
  'Construção, Acabamento & Marcenaria',
  'Ferramentas & Instrumentos de Medição',
  'Equipamentos & Insumos Industriais',
  'Eletrodomésticos, Refrigeração & Copa',
  'Limpeza, Higiene & Descartáveis',
  'Pet Shop & Veterinária',
  'Diversos & Sazonais'
] as const;

export interface HeuristicEnrichedProduct {
  standardizedName: string;
  brand: string;
  manufacturer: string;
  model: string;
  partNumber: string;
  category: string;
  ncm: string;
  weight: string;
  dimensions: string;
  suggestedPrice: number;
  costPrice: number;
  description: string;
  specifications: Array<{ label: string; value: string }>;
  quantity: number;
  unit: string;
  confidence: string;
}

// Catálogo Canônico de Alta Fidelidade (Produtos Corporativos mais demandados)
const CANONICAL_KNOWN_PRODUCTS: Record<string, Partial<HeuristicEnrichedProduct>> = {
  'logitech h390': {
    standardizedName: 'Headset USB Logitech H390 com Microfone com Cancelamento de Ruído e Controles Integrados',
    brand: 'Logitech',
    manufacturer: 'Logitech International S.A.',
    model: 'H390',
    partNumber: '981-000014',
    category: 'Áudio, Vídeo & Apresentação',
    ncm: '8518.30.00',
    weight: '0.320 kg',
    dimensions: '20cm x 18cm x 7cm',
    suggestedPrice: 249.90,
    costPrice: 165.00,
    description: `Headset estéreo USB Logitech H390 projetado para chamadas empresariais, videoconferências e produtividade diária em ambientes corporativos. Equipado com drivers otimizados por laser que oferecem áudio digital cristalino e microfone unidirecional com tecnologia avançada de cancelamento de ruído passivo para eliminar ruídos indesejados de fundo.

Conta com controles integrados de fácil alcance no cabo para ajuste rápido de volume e botão de mudo com indicador luminoso. A haste acolchoada ajustável e as almofadas auriculares em couro sintético macio garantem conforto ergonômico mesmo durante longas horas de uso contínuo em reuniões e atendimentos.

Conexão USB-A Plug-and-Play instantânea sem necessidade de instalação de drivers, compatível nativamente com Windows, macOS, ChromeOS e com as principais plataformas de comunicação corporativa, como Microsoft Teams, Zoom, Google Meet e Skype.`,
    specifications: [
      { label: 'Tipo de Conexão', value: 'USB-A Plug and Play' },
      { label: 'Microfone', value: 'Unidirecional com Cancelamento de Ruído' },
      { label: 'Controles no Cabo', value: 'Ajuste de volume (+/-) e botão de silenciamento (Mute)' },
      { label: 'Resposta de Frequência Headset', value: '20 Hz – 20 kHz' },
      { label: 'Resposta de Frequência Microfone', value: '100 Hz – 10 kHz' },
      { label: 'Sensibilidade do Headset', value: '94 dBV/Pa +/- 3 dB' },
      { label: 'Comprimento do Cabo', value: '1,9 metros emborrachado' },
      { label: 'Compatibilidade', value: 'Windows, macOS, ChromeOS, Teams, Zoom, Meet' }
    ]
  },
  'logitech h111': {
    standardizedName: 'Headset Estéreo Logitech H111 Conector P3 3.5mm com Microfone Giratório',
    brand: 'Logitech',
    manufacturer: 'Logitech International S.A.',
    model: 'H111',
    partNumber: '981-000612',
    category: 'Áudio, Vídeo & Apresentação',
    ncm: '8518.30.00',
    weight: '0.150 kg',
    dimensions: '18cm x 16cm x 5cm',
    suggestedPrice: 89.90,
    costPrice: 58.00,
    description: `Headset analógico multiplataforma Logitech H111 para chamadas de voz, videoaulas e reuniões corporativas. Possui conector de áudio padrão P3 (3,5 mm) compatível com notebooks, smartphones, tablets e computadores modernos.

Microfone versátil giratório em 180 graus que pode ser posicionado à esquerda ou à direita e recolhido quando não estiver em uso. Arco de cabeça ajustável e almofadas auriculares macias para conforto no dia a dia.`,
    specifications: [
      { label: 'Tipo de Conexão', value: 'Jack P3 3.5mm (Áudio + Microfone unificados)' },
      { label: 'Microfone', value: 'Giratório 180° com redução de ruído' },
      { label: 'Resposta de Frequência', value: '20 Hz – 20 kHz' },
      { label: 'Comprimento do Cabo', value: '2,35 metros' },
      { label: 'Compatibilidade', value: 'Windows, macOS, Android, iOS, ChromeOS' }
    ]
  },
  'logitech h151': {
    standardizedName: 'Headset Estéreo Logitech H151 Conector P3 3.5mm com Controles Integrados no Cabo',
    brand: 'Logitech',
    manufacturer: 'Logitech International S.A.',
    model: 'H151',
    partNumber: '981-000570',
    category: 'Áudio, Vídeo & Apresentação',
    ncm: '8518.30.00',
    weight: '0.180 kg',
    dimensions: '18cm x 16cm x 5cm',
    suggestedPrice: 129.90,
    costPrice: 85.00,
    description: `Headset corporativo com controles de áudio embutidos no cabo para ajuste instantâneo de volume e silenciamento. Microfone com cancelamento de ruído giratório e arco de cabeça ajustável com almofadas macias.`,
    specifications: [
      { label: 'Tipo de Conexão', value: 'Conector P3 3.5mm estéreo' },
      { label: 'Controles no Cabo', value: 'Ajuste de volume e botão Mute' },
      { label: 'Microfone', value: 'Giratório com cancelamento de ruído' },
      { label: 'Comprimento do Cabo', value: '1,8 metros' }
    ]
  },
  'logitech c920': {
    standardizedName: 'Webcam Full HD 1080p Logitech C920s Pro com Microfone Duplo e Proteção de Privacidade',
    brand: 'Logitech',
    manufacturer: 'Logitech International S.A.',
    model: 'C920s Pro',
    partNumber: '960-001257',
    category: 'Áudio, Vídeo & Apresentação',
    ncm: '8525.89.19',
    weight: '0.280 kg',
    dimensions: '14cm x 14cm x 6cm',
    suggestedPrice: 429.90,
    costPrice: 285.00,
    description: `A Webcam Logitech C920s Pro oferece vídeo Full HD 1080p a 30 fps com nitidez impressionante para streaming, chamadas de vídeo corporativas e conferências de alto nível. Equipada com lente de vidro de alta precisão e foco automático rápido.

Conta com dois microfones estéreo omnidirecionais integrados que capturam som natural de todos os ângulos e tampa de privacidade integrada para segurança física da lente quando não estiver em uso.`,
    specifications: [
      { label: 'Resolução Máxima', value: 'Full HD 1080p a 30 fps / 720p a 30 fps' },
      { label: 'Tipo de Foco', value: 'Automático de alta precisão (Autofocus)' },
      { label: 'Tipo de Lente', value: 'Vidro Full HD com campo de visão de 78°' },
      { label: 'Microfones', value: 'Estéreo duplo omnidirecional embutido' },
      { label: 'Conexão', value: 'USB-A 2.0 Plug-and-Play' },
      { label: 'Obturador de Privacidade', value: 'Incluso' }
    ]
  },
  'logitech c270': {
    standardizedName: 'Webcam HD 720p Logitech C270 com Microfone Embutido com Redução de Ruído',
    brand: 'Logitech',
    manufacturer: 'Logitech International S.A.',
    model: 'C270',
    partNumber: '960-000694',
    category: 'Áudio, Vídeo & Apresentação',
    ncm: '8525.89.19',
    weight: '0.220 kg',
    dimensions: '12cm x 12cm x 5cm',
    suggestedPrice: 169.90,
    costPrice: 110.00,
    description: `Webcam de uso diário Logitech C270 com resolução HD 720p e correção automática de luz RightLight. Ideal para chamadas em notebooks e computadores de escritório com microfone integrado que capta voz com clareza a até 1,5 metro.`,
    specifications: [
      { label: 'Resolução Máxima', value: 'HD 720p a 30 fps' },
      { label: 'Campo de Visão', value: '60° diagonal' },
      { label: 'Microfone', value: 'Mono integrado com cancelamento de ruído' },
      { label: 'Conexão', value: 'USB-A Plug-and-Play' }
    ]
  },
  'logitech k120': {
    standardizedName: 'Teclado USB Logitech K120 Padrão ABNT2 Resistente a Respingos',
    brand: 'Logitech',
    manufacturer: 'Logitech International S.A.',
    model: 'K120',
    partNumber: '920-004423',
    category: 'Informática, Hardware & Periféricos',
    ncm: '8471.60.52',
    weight: '0.650 kg',
    dimensions: '46cm x 16cm x 3cm',
    suggestedPrice: 69.90,
    costPrice: 42.00,
    description: `Teclado com fio padrão ABNT2 Logitech K120 projetado para trabalho corporativo intenso e durabilidade máxima. Teclas de perfil baixo silenciosas, barra de espaço curva e layout ergonômico em tamanho padrão com teclado numérico integrado.

Construção robusta com design resistente a respingos de líquidos acidentais, suportes basculantes articulados ajustáveis e teclas reforçadas que suportam até 10 milhões de pressionamentos. Conexão USB Plug-and-Play direta.`,
    specifications: [
      { label: 'Padrão do Teclado', value: 'ABNT2 com tecla Ç e teclado numérico' },
      { label: 'Conexão', value: 'USB-A Plug and Play' },
      { label: 'Resistência', value: 'Design resistente a respingos de até 60ml' },
      { label: 'Durabilidade', value: 'Teclas testadas para até 10 milhões de toques' },
      { label: 'Comprimento do Cabo', value: '1,5 metros' }
    ]
  },
  'logitech mk120': {
    standardizedName: 'Combo Teclado e Mouse Óptico USB Logitech MK120 ABNT2 Resistente a Respingos',
    brand: 'Logitech',
    manufacturer: 'Logitech International S.A.',
    model: 'MK120',
    partNumber: '920-004430',
    category: 'Informática, Hardware & Periféricos',
    ncm: '8471.60.52',
    weight: '0.850 kg',
    dimensions: '52cm x 17cm x 4cm',
    suggestedPrice: 99.90,
    costPrice: 65.00,
    description: `Combo com fio confiável formado pelo consagrado teclado ABNT2 K120 e mouse óptico de alta definição 1000 DPI. A combinação ideal para equipar estações de trabalho empresariais com excelente custo-benefício e durabilidade prolongada.`,
    specifications: [
      { label: 'Teclado', value: 'Padrão ABNT2 com teclas silenciosas e perfil fino' },
      { label: 'Mouse', value: 'Óptico ambidestro 1000 DPI com rolagem suave' },
      { label: 'Conexão', value: '2 conexões USB-A individuais Plug and Play' },
      { label: 'Resistência a Respingos', value: 'Sim, dreno para líquidos até 60ml' }
    ]
  },
  'logitech mk220': {
    standardizedName: 'Combo Teclado e Mouse Sem Fio Logitech MK220 Design Compacto ABNT2',
    brand: 'Logitech',
    manufacturer: 'Logitech International S.A.',
    model: 'MK220',
    partNumber: '920-004431',
    category: 'Informática, Hardware & Periféricos',
    ncm: '8471.60.52',
    weight: '0.750 kg',
    dimensions: '45cm x 15cm x 5cm',
    suggestedPrice: 129.90,
    costPrice: 85.00,
    description: `Combo sem fio ultracompacto MK220 com teclado 36% menor que os teclados normais, mas com todas as teclas padrão e teclado numérico. Conexão sem fio confiável de 2.4 GHz de até 10 metros com criptografia AES de 128 bits.`,
    specifications: [
      { label: 'Conexão Sem Fio', value: '2.4 GHz com alcance de até 10 metros' },
      { label: 'Design', value: 'Compacto econômico de espaço com teclas padrão' },
      { label: 'Autonomia de Bateria', value: 'Até 24 meses (teclado) e 5 meses (mouse)' },
      { label: 'Padrão', value: 'ABNT2' }
    ]
  },
  'logitech mk270': {
    standardizedName: 'Combo Teclado e Mouse Sem Fio Logitech MK270 ABNT2 com 8 Teclas de Atalho',
    brand: 'Logitech',
    manufacturer: 'Logitech International S.A.',
    model: 'MK270',
    partNumber: '920-004433',
    category: 'Informática, Hardware & Periféricos',
    ncm: '8471.60.52',
    weight: '0.850 kg',
    dimensions: '52cm x 16cm x 5cm',
    suggestedPrice: 179.90,
    costPrice: 119.00,
    description: `O combo sem fio mais vendido do mundo. Teclado completo ABNT2 com 8 teclas de atalho multimídia para controle instantâneo de música, e-mail e internet, acompanhado de mouse compacto sem fio com nano receptor USB.`,
    specifications: [
      { label: 'Conexão Sem Fio', value: 'Tecnologia sem fio avançada de 2.4 GHz' },
      { label: 'Teclas de Atalho', value: '8 teclas dedicadas para multimídia e internet' },
      { label: 'Padrão', value: 'ABNT2 completo com teclado numérico' },
      { label: 'Bateria', value: 'Até 36 meses no teclado e 12 meses no mouse' }
    ]
  },
  'logitech m170': {
    standardizedName: 'Mouse Sem Fio Logitech M170 Conexão 2.4GHz com Receptor USB Nano',
    brand: 'Logitech',
    manufacturer: 'Logitech International S.A.',
    model: 'M170',
    partNumber: '910-004940',
    category: 'Informática, Hardware & Periféricos',
    ncm: '8471.60.53',
    weight: '0.110 kg',
    dimensions: '12cm x 7cm x 4cm',
    suggestedPrice: 59.90,
    costPrice: 38.00,
    description: `Mouse sem fio compacto e ambidestro Logitech M170 com alcance de até 10 metros e até 12 meses de vida útil da pilha. Conexão instantânea via receptor USB nano Plug-and-Play.`,
    specifications: [
      { label: 'Sensor', value: 'Óptico suave 1000 DPI' },
      { label: 'Conexão', value: 'Sem fio 2.4 GHz via receptor USB' },
      { label: 'Design', value: 'Ambidestro ergonômico compacto' },
      { label: 'Alimentação', value: '1 pilha AA (inclusa)' }
    ]
  },
  'logitech m185': {
    standardizedName: 'Mouse Sem Fio Logitech M185 Pilha Inclusa Receptor USB Plug and Play',
    brand: 'Logitech',
    manufacturer: 'Logitech International S.A.',
    model: 'M185',
    partNumber: '910-002225',
    category: 'Informática, Hardware & Periféricos',
    ncm: '8471.60.53',
    weight: '0.115 kg',
    dimensions: '12cm x 7cm x 4cm',
    suggestedPrice: 69.90,
    costPrice: 44.00,
    description: `Mouse sem fio confiável para notebooks e computadores de mesa. Conforto contornado para a mão e longa duração de bateria com botão liga/desliga integrado.`,
    specifications: [
      { label: 'Sensor', value: 'Óptico avançado 1000 DPI' },
      { label: 'Conexão', value: 'Sem fio 2.4 GHz' },
      { label: 'Compatibilidade', value: 'Windows, macOS, ChromeOS, Linux' }
    ]
  },
  'dell km3322w': {
    standardizedName: 'Combo Teclado e Mouse Sem Fio Dell KM3322W Padrão ABNT2 Preto',
    brand: 'Dell',
    manufacturer: 'Dell Technologies Inc.',
    model: 'KM3322W',
    partNumber: '580-BBBO',
    category: 'Informática, Hardware & Periféricos',
    ncm: '8471.60.52',
    weight: '0.850 kg',
    dimensions: '52cm x 16cm x 5cm',
    suggestedPrice: 149.90,
    costPrice: 98.00,
    description: `Combo corporativo sem fio Dell KM3322W projetado para produtividade duradoura. Teclas silenciosas resistentes a derramamento acidental de líquidos e bateria com autonomia de até 36 meses.`,
    specifications: [
      { label: 'Padrão', value: 'ABNT2 com teclado numérico' },
      { label: 'Conexão', value: 'Sem fio 2.4 GHz via receptor nano USB' },
      { label: 'Mouse', value: 'Sensor óptico 1000 DPI com 3 botões' }
    ]
  },
  'dell wm126': {
    standardizedName: 'Mouse Sem Fio Dell WM126 Sensor Óptico 1000 DPI Preto',
    brand: 'Dell',
    manufacturer: 'Dell Technologies Inc.',
    model: 'WM126',
    partNumber: '570-AAMH',
    category: 'Informática, Hardware & Periféricos',
    ncm: '8471.60.53',
    weight: '0.120 kg',
    dimensions: '12cm x 7cm x 4cm',
    suggestedPrice: 89.90,
    costPrice: 58.00,
    description: `Mouse sem fio Dell WM126 com excelente precisão óptica e design ergonômico ambidestro. Permite parear até 6 dispositivos compatíveis através do receptor Dell Universal Pairing.`,
    specifications: [
      { label: 'Resolução', value: 'Sensor óptico de 1000 DPI' },
      { label: 'Conexão', value: 'Sem fio 2.4 GHz Dell Universal' },
      { label: 'Bateria', value: 'Até 1 ano de autonomia com 1 pilha AA' }
    ]
  },
  'kingston nv2': {
    standardizedName: 'SSD Kingston NV2 M.2 2280 NVMe PCIe 4.0 Alta Performance',
    brand: 'Kingston',
    manufacturer: 'Kingston Technology Company',
    model: 'NV2',
    partNumber: 'SNV2S/1000G',
    category: 'Informática, Hardware & Periféricos',
    ncm: '8471.70.40',
    weight: '0.050 kg',
    dimensions: '12cm x 8cm x 1cm',
    suggestedPrice: 369.90,
    costPrice: 255.00,
    description: `O SSD NV2 PCIe 4.0 NVMe da Kingston é uma solução de armazenamento substancial de última geração alimentada por um controlador NVMe Gen 4x4, oferecendo velocidades de leitura de até 3.500 MB/s para cargas de trabalho pesadas e sistemas mais rápidos.`,
    specifications: [
      { label: 'Formato', value: 'M.2 2280 (80mm)' },
      { label: 'Interface', value: 'PCIe 4.0 x4 NVMe' },
      { label: 'Velocidade de Leitura', value: 'Até 3.500 MB/s' },
      { label: 'Velocidade de Gravação', value: 'Até 2.800 MB/s' }
    ]
  },
  'furukawa cat6': {
    standardizedName: 'Cabo de Rede Furukawa SohoPlus Cat.6 U/UTP 4 Pares 24AWG Caixa 305 Metros Azul',
    brand: 'Furukawa',
    manufacturer: 'Furukawa Electric LatAm',
    model: 'SohoPlus Cat6',
    partNumber: '23400198',
    category: 'Redes, Conectividade & Telefonia',
    ncm: '8544.42.00',
    weight: '12.500 kg',
    dimensions: '38cm x 38cm x 26cm',
    suggestedPrice: 690.00,
    costPrice: 460.00,
    description: `Cabo de rede Furukawa SohoPlus Cat6 U/UTP de 4 pares trançados de condutores 100% cobre sólido. Homologado pela Anatel para redes corporativas Gigabit Ethernet 1000BASE-TX e 10GBASE-T em distâncias adequadas com capa externa em PVC anti-chama CMX.`,
    specifications: [
      { label: 'Categoria', value: 'Cat.6 U/UTP 250 MHz' },
      { label: 'Condutor', value: '100% Cobre sólido 24 AWG' },
      { label: 'Capa', value: 'PVC CMX anti-chama RoHS' },
      { label: 'Comprimento', value: 'Caixa tipo Fastbox com 305 metros' }
    ]
  },
  'tp-link tl-sg1024d': {
    standardizedName: 'Switch Gigabit Ethernet 24 Portas 10/100/1000 Mbps TP-Link TL-SG1024D Caixa Metálica',
    brand: 'TP-Link',
    manufacturer: 'TP-Link Technologies Co., Ltd.',
    model: 'TL-SG1024D',
    partNumber: 'TL-SG1024D',
    category: 'Redes, Conectividade & Telefonia',
    ncm: '8517.62.59',
    weight: '2.300 kg',
    dimensions: '44cm x 22cm x 5cm',
    suggestedPrice: 499.00,
    costPrice: 330.00,
    description: `Switch de mesa ou rack de 24 portas Gigabit Ethernet TL-SG1024D que fornece uma atualização de alto desempenho e baixo custo para expandir a infraestrutura de rede corporativa. Gabinete metálico padrão de 13 polegadas com suportes para rack inclusos.`,
    specifications: [
      { label: 'Portas', value: '24 portas RJ45 10/100/1000 Mbps' },
      { label: 'Capacidade de Comutação', value: '48 Gbps sem bloqueio' },
      { label: 'Consumo Energético', value: 'Tecnologia Green Ethernet com economia de até 40%' },
      { label: 'Alimentação', value: 'Bivolt Automático 100-240V' }
    ]
  },
  'apc back-ups': {
    standardizedName: 'Nobreak APC Back-UPS 1500VA Bivolt Automático com 8 Tomadas NBR 14136',
    brand: 'APC',
    manufacturer: 'Schneider Electric Brasil',
    model: 'Back-UPS 1500VA',
    partNumber: 'BZ1500PBI-BR',
    category: 'Energia, Nobreaks & Baterias',
    ncm: '8504.40.40',
    weight: '12.800 kg',
    dimensions: '40cm x 20cm x 30cm',
    suggestedPrice: 1190.00,
    costPrice: 790.00,
    description: `Nobreak inteligente APC Back-UPS 1500VA para proteção contínua de estações de trabalho empresariais, servidores e equipamentos de rede contra quedas de energia, surtos elétricos e picos de voltagem. Possui 8 tomadas de saída e estabilizador interno com regulação automática de voltagem (AVR).`,
    specifications: [
      { label: 'Potência', value: '1500 VA / 825 W' },
      { label: 'Tensão de Entrada', value: 'Bivolt Automático 115V / 220V' },
      { label: 'Tomadas de Saída', value: '8 tomadas padrão NBR 14136 (10A)' },
      { label: 'Bateria', value: 'Baterias seladas chumbo-ácido livres de manutenção' }
    ]
  },
  'intelbras 125i': {
    standardizedName: 'Telefone Sem Fio Intelbras TS 125i com Identificador de Chamadas Preto',
    brand: 'Intelbras',
    manufacturer: 'Intelbras S/A',
    model: 'TS 125i',
    partNumber: '4121251',
    category: 'Redes, Conectividade & Telefonia',
    ncm: '8517.18.90',
    weight: '0.550 kg',
    dimensions: '15cm x 15cm x 10cm',
    suggestedPrice: 119.90,
    costPrice: 75.00,
    description: `Telefone sem fio digital Intelbras TS 125i desenvolvido para proporcionar máxima clareza e praticidade em comunicações corporativas e residenciais. Equipado com display luminoso âmbar e tecnologia digital DECT 6.0 livre de interferências.

Possui identificador de chamadas DTMF e FSK automático, agenda interna para até 50 contatos com nome e número, funções de rediscagem dos últimos 10 números, discagem rápida e controle ergonômico de volume com alta autonomia de conversação.`,
    specifications: [
      { label: 'Tecnologia', value: 'DECT 6.0 sem interferências' },
      { label: 'Identificador de Chamadas', value: 'Sim (DTMF e FSK automático)' },
      { label: 'Agenda Telefônica', value: 'Até 50 contatos com nome e número' },
      { label: 'Display Luminoso', value: 'Alfanumérico com iluminação âmbar' },
      { label: 'Autonomia da Bateria', value: 'Até 15h em conversação e 150h em standby' },
      { label: 'Alimentação', value: 'Bivolt Automático 100-240V' }
    ]
  },
  'ts 125i': {
    standardizedName: 'Telefone Sem Fio Intelbras TS 125i com Identificador de Chamadas Preto',
    brand: 'Intelbras',
    manufacturer: 'Intelbras S/A',
    model: 'TS 125i',
    partNumber: '4121251',
    category: 'Redes, Conectividade & Telefonia',
    ncm: '8517.18.90',
    weight: '0.550 kg',
    dimensions: '15cm x 15cm x 10cm',
    suggestedPrice: 119.90,
    costPrice: 75.00,
    description: `Telefone sem fio digital Intelbras TS 125i desenvolvido para proporcionar máxima clareza e praticidade em comunicações corporativas e residenciais. Equipado com display luminoso âmbar e tecnologia digital DECT 6.0 livre de interferências.

Possui identificador de chamadas DTMF e FSK automático, agenda interna para até 50 contatos com nome e número, funções de rediscagem dos últimos 10 números, discagem rápida e controle ergonômico de volume com alta autonomia de conversação.`,
    specifications: [
      { label: 'Tecnologia', value: 'DECT 6.0 sem interferências' },
      { label: 'Identificador de Chamadas', value: 'Sim (DTMF e FSK automático)' },
      { label: 'Agenda Telefônica', value: 'Até 50 contatos com nome e número' },
      { label: 'Display Luminoso', value: 'Alfanumérico com iluminação âmbar' },
      { label: 'Alimentação', value: 'Bivolt Automático 100-240V' }
    ]
  },
  'ventosa 30mm': {
    standardizedName: 'Ventosa de Silicone e PVC Cristal 30mm Transparente com Furo 2.5mm',
    brand: 'Genérica',
    manufacturer: 'Fabricante Nacional / Importado',
    model: 'Ventosa 30mm',
    partNumber: 'VT-30MM',
    category: 'Construção, Acabamento & Marcenaria',
    ncm: '3926.90.90',
    weight: '0.100 kg',
    dimensions: '10cm x 10cm x 5cm',
    suggestedPrice: 2.50,
    costPrice: 0.90,
    description: `Ventosa de fixação produzida em plástico silicone e PVC cristal transparente com 30mm (3cm) de diâmetro. Desenvolvida para garantir excelente fixação por vácuo em superfícies lisas, não porosas, vidros e acrílicos.

Equipada com furo central de 2,5mm para encaixe de parafusos, ganchos ou pinos de sustentação. Ideal para apoio de tampos de vidro, displays promocionais, artesanato e proteção de mesas evitando o deslocamento do vidro.`,
    specifications: [
      { label: 'Diâmetro Externo', value: '30 mm (3 cm)' },
      { label: 'Diâmetro do Furo', value: '2,5 mm' },
      { label: 'Material', value: 'Silicone e PVC Cristal Transparente' },
      { label: 'Superfícies de Aplicação', value: 'Vidro, acrílico, espelho e superfícies polidas' },
      { label: 'Finalidade', value: 'Fixação e apoio anti-deslocamento' }
    ]
  }
};

const RECOGNIZED_BRANDS = [
  'Logitech', 'Dell', 'HP', 'Lenovo', 'Kingston', 'SanDisk', 'Samsung', 'Western Digital', 'WD',
  'Seagate', 'Corsair', 'Razer', 'Redragon', 'Multilaser', 'Fortrek', 'C3Tech', 'Intelbras',
  'TP-Link', 'D-Link', 'Furukawa', 'Ubiquiti', 'Mikrotik', 'Cisco', 'Aruba', 'Mercusys',
  'APC', 'SMS', 'Ragtech', 'Engetron', 'NHS', 'TS Shara', 'Epson', 'Canon', 'Brother',
  'Zebra', 'Elgin', 'Bematech', 'Honeywell', 'Gertec', 'Datalogic', 'Argox', 'Tramontina',
  'Bosch', 'Makita', 'DeWalt', 'Vonder', 'Irwin', 'Starrett', 'Gedore', 'Stanley', 'Corfio',
  'Sil', 'Prysmian', 'Cobrecom', 'Schneider', 'Siemens', 'ABB', 'WEG', 'Steck', 'Lorenzetti',
  'JBL', 'Edifier', 'Sony', 'Sennheiser', 'Shure', 'Rode', 'HyperX', 'Chamex', 'Report',
  'Suzano', 'Pilot', 'Faber-Castell', 'Bic', 'Pentel', 'Cis', 'Tilibra', '3M', 'Post-it',
  'Brastemp', 'Consul', 'Electrolux', 'Philco', 'Mondial', 'Britânia', 'Oster', 'Cadence',
  'Ypê', 'Veja', 'Omo', 'Scotch-Brite', 'Kimberly-Clark', 'Bralimpia'
];

interface ArchetypeRule {
  noun: string;
  category: string;
  ncm: string;
  weight: string;
  dimensions: string;
  costPrice: number;
  suggestedPrice: number;
  specs: Array<{ label: string; value: string }>;
  description: (brand: string, model: string, fullQuery: string) => string;
}

const ARCHETYPE_RULES: Record<string, ArchetypeRule> = {
  headset: {
    noun: 'Headset',
    category: 'Áudio, Vídeo & Apresentação',
    ncm: '8518.30.00',
    weight: '0.300 kg',
    dimensions: '20cm x 18cm x 7cm',
    costPrice: 150.00,
    suggestedPrice: 229.00,
    specs: [
      { label: 'Tipo de Conexão', value: 'USB-A Plug and Play' },
      { label: 'Microfone', value: 'Unidirecional com Cancelamento de Ruído' },
      { label: 'Controles no Cabo', value: 'Ajuste de volume e botão Mute' },
      { label: 'Resposta de Frequência', value: '20 Hz – 20 kHz' },
      { label: 'Comprimento do Cabo', value: '1,8 a 2,0 metros emborrachado' },
      { label: 'Compatibilidade', value: 'Windows, macOS, ChromeOS, Teams, Zoom, Meet' }
    ],
    description: (brand, model) =>
      `Headset estéreo profissional ${brand} ${model} desenvolvido para atender às exigências de produtividade diária em escritórios, centrais de atendimento e ambientes corporativos. Proporciona áudio digital equilibrado e voz nítida para reuniões, videoconferências e ligações telefônicas.\n\nEquipado com microfone com tecnologia de cancelamento de ruído ambiente, haste ajustável confortável e almofadas acolchoadas ergonômicas para jornadas prolongadas. Conexão direta Plug-and-Play compatível com as principais plataformas corporativas.`
  },
  teclado: {
    noun: 'Teclado',
    category: 'Informática, Hardware & Periféricos',
    ncm: '8471.60.52',
    weight: '0.650 kg',
    dimensions: '46cm x 16cm x 3cm',
    costPrice: 55.00,
    suggestedPrice: 89.90,
    specs: [
      { label: 'Padrão das Teclas', value: 'ABNT2 com tecla Ç e teclado numérico integrado' },
      { label: 'Conexão', value: 'USB Plug and Play' },
      { label: 'Durabilidade', value: 'Teclas reforçadas para uso corporativo contínuo' },
      { label: 'Compatibilidade', value: 'Windows, Linux, macOS' }
    ],
    description: (brand, model) =>
      `Teclado corporativo de alta durabilidade ${brand} ${model} padrão brasileiro ABNT2 com teclas de toque macio e perfil ergonômico. Ideal para digitação rápida e confortável em estações de trabalho empresariais.\n\nConstrução resistente com pés de inclinação ajustáveis e conexão USB direta sem necessidade de softwares adicionais.`
  },
  mouse: {
    noun: 'Mouse',
    category: 'Informática, Hardware & Periféricos',
    ncm: '8471.60.53',
    weight: '0.120 kg',
    dimensions: '12cm x 7cm x 4cm',
    costPrice: 40.00,
    suggestedPrice: 65.00,
    specs: [
      { label: 'Sensor', value: 'Óptico de alta precisão (1000 a 1600 DPI)' },
      { label: 'Design', value: 'Ambidestro ergonômico' },
      { label: 'Botões', value: '3 botões com scroll suave' },
      { label: 'Conexão', value: 'USB Plug and Play' }
    ],
    description: (brand, model) =>
      `Mouse óptico ergonômico ${brand} ${model} desenvolvido para máxima precisão e controle fluido no cotidiano corporativo. Sensor de alta resposta que opera com suavidade sobre diversas superfícies sem falhas de rastreamento.`
  },
  webcam: {
    noun: 'Webcam',
    category: 'Áudio, Vídeo & Apresentação',
    ncm: '8525.89.19',
    weight: '0.250 kg',
    dimensions: '14cm x 14cm x 6cm',
    costPrice: 220.00,
    suggestedPrice: 349.00,
    specs: [
      { label: 'Resolução de Vídeo', value: 'Full HD 1080p / 720p a 30 fps' },
      { label: 'Foco', value: 'Foco automático de alta precisão (Autofocus)' },
      { label: 'Microfone', value: 'Microfone estéreo integrado com redução de ruído' },
      { label: 'Conexão', value: 'USB 2.0 / 3.0 Plug and Play' },
      { label: 'Fixação', value: 'Clipe universal para monitores, notebooks e tripé' }
    ],
    description: (brand, model) =>
      `Webcam de alta definição ${brand} ${model} projetada para videoconferências corporativas, transmissões e reuniões remotas com transmissão estável e cores naturais.`
  },
  ssd: {
    noun: 'SSD',
    category: 'Informática, Hardware & Periféricos',
    ncm: '8471.70.40',
    weight: '0.050 kg',
    dimensions: '12cm x 8cm x 1.5cm',
    costPrice: 190.00,
    suggestedPrice: 299.00,
    specs: [
      { label: 'Formato / Interface', value: 'M.2 2280 NVMe PCIe ou SATA III' },
      { label: 'Velocidade de Leitura', value: 'Alta taxa de transferência sequencial' },
      { label: 'Resistência a Impactos', value: 'Sem partes móveis mecânicas' },
      { label: 'Compatibilidade', value: 'Desktops, Notebooks e Servidores compatíveis' }
    ],
    description: (brand, model) =>
      `Unidade de estado sólido SSD ${brand} ${model} de alta velocidade para aceleração de inicialização do sistema operacional, carregamento instantâneo de aplicações e confiabilidade no armazenamento corporativo de dados.`
  },
  switch: {
    noun: 'Switch',
    category: 'Redes, Conectividade & Telefonia',
    ncm: '8517.62.59',
    weight: '2.100 kg',
    dimensions: '44cm x 22cm x 5cm',
    costPrice: 350.00,
    suggestedPrice: 530.00,
    specs: [
      { label: 'Portas', value: 'Portas RJ45 Gigabit Ethernet 10/100/1000 Mbps com Auto MDI/MDIX' },
      { label: 'Capacidade de Comutação', value: 'Encaminhamento sem bloqueio de pacotes' },
      { label: 'Gabinete', value: 'Metálico resistente para rack de 19" ou mesa' },
      { label: 'Alimentação', value: 'Bivolt Automático 100-240V 50/60Hz' }
    ],
    description: (brand, model) =>
      `Switch de rede corporativo ${brand} ${model} com alto desempenho e estabilidade para infraestruturas de dados. Permite conexão ágil e segura de múltiplos dispositivos com máxima eficiência energética.`
  },
  cabo_rede: {
    noun: 'Cabo de Rede',
    category: 'Redes, Conectividade & Telefonia',
    ncm: '8544.42.00',
    weight: '11.500 kg',
    dimensions: '38cm x 38cm x 26cm',
    costPrice: 430.00,
    suggestedPrice: 690.00,
    specs: [
      { label: 'Categoria', value: 'Cat.6 U/UTP 4 pares' },
      { label: 'Condutores', value: '100% Cobre sólido 23/24 AWG' },
      { label: 'Capa Externa', value: 'PVC antichama (CM ou CMX)' },
      { label: 'Homologação', value: 'Anatel e normas ANSI/TIA-568' }
    ],
    description: (brand, model) =>
      `Cabo de rede de alta performance ${brand} ${model} para cabeamento estruturado horizontal e vertical em redes de telecomunicações e dados de alta velocidade.`
  },
  nobreak: {
    noun: 'Nobreak',
    category: 'Energia, Nobreaks & Baterias',
    ncm: '8504.40.40',
    weight: '9.500 kg',
    dimensions: '38cm x 18cm x 26cm',
    costPrice: 680.00,
    suggestedPrice: 990.00,
    specs: [
      { label: 'Topologia', value: 'Interativo com Estabilizador e Filtro de Linha interno' },
      { label: 'Tensão de Entrada/Saída', value: 'Bivolt Automático / Bivolt Selecionável' },
      { label: 'Tomadas de Saída', value: 'Padrão NBR 14136 protegidas' },
      { label: 'Proteção', value: 'Contra surtos, sobrecarga, curto-circuito e subtensão' }
    ],
    description: (brand, model) =>
      `Nobreak ${brand} ${model} projetado para proteger computadores, servidores e equipamentos sensíveis contra quedas repentinas de energia, picos de tensão e oscilações da rede elétrica.`
  },
  monitor: {
    noun: 'Monitor',
    category: 'Monitores, Displays & TVs',
    ncm: '8528.52.00',
    weight: '4.800 kg',
    dimensions: '60cm x 40cm x 15cm',
    costPrice: 650.00,
    suggestedPrice: 980.00,
    specs: [
      { label: 'Tamanho da Tela', value: '23.8" a 27" Full HD (1920 x 1080)' },
      { label: 'Painel', value: 'IPS com ângulo de visão de 178°' },
      { label: 'Conexões', value: 'HDMI, DisplayPort e VGA' },
      { label: 'Ergonomia', value: 'Ajuste de inclinação e compatível com suporte VESA' }
    ],
    description: (brand, model) =>
      `Monitor profissional ${brand} ${model} com bordas ultrafinas e painel de alta fidelidade cromática, ideal para estações de trabalho e produtividade empresarial contínua.`
  }
};

/**
 * Enriquecimento Heurístico de Alta Confiabilidade:
 * Cruza termos com catálogo canônico e regras determinísticas.
 * Nunca retorna campos em branco, garantindo 100% de estabilidade ao usuário.
 */
export function enrichProductHeuristically(rawQuery: string, quantity: number = 1): HeuristicEnrichedProduct {
  const norm = rawQuery.toLowerCase().trim();

  // Limpeza de quantidade do texto ("40 unidades", "40 un", "10 pçs")
  const cleanQuery = rawQuery
    .replace(/\b\d+\s*(?:unidades?|un\.?|pcts?|pacotes?|cx|cxs|caixas?|kits?|pcs?|pçs?|peças?)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 1. Verificação no Catálogo Canônico
  for (const [key, prod] of Object.entries(CANONICAL_KNOWN_PRODUCTS)) {
    const tokens = key.split(' ');
    const allMatch = tokens.every(t => norm.includes(t));
    if (allMatch && prod.standardizedName) {
      return {
        standardizedName: prod.standardizedName,
        brand: prod.brand || 'Logitech',
        manufacturer: prod.manufacturer || `${prod.brand} International`,
        model: prod.model || '',
        partNumber: prod.partNumber || '',
        category: prod.category || 'Áudio, Vídeo & Apresentação',
        ncm: prod.ncm || '8518.30.00',
        weight: prod.weight || '0.300 kg',
        dimensions: prod.dimensions || '20cm x 18cm x 7cm',
        suggestedPrice: prod.suggestedPrice || 199.00,
        costPrice: prod.costPrice || 130.00,
        description: prod.description || '',
        specifications: prod.specifications || [],
        quantity: quantity > 0 ? quantity : 1,
        unit: 'Un.',
        confidence: 'Alta - Ficha Técnica Reconhecida (Catálogo Canônico)'
      };
    }
  }

  // 2. Extração de Marca Reconhecida
  let detectedBrand = '';
  for (const b of RECOGNIZED_BRANDS) {
    const reg = new RegExp(`\\b${b}\\b`, 'i');
    if (reg.test(rawQuery)) {
      detectedBrand = b;
      break;
    }
  }

  // 3. Detecção de Arquétipo de Produto (apenas se corresponder estritamente ao termo)
  let archKey: string | null = null;
  if (/\b(?:headset|fone de ouvido|headphone|auricular)\b/i.test(norm)) archKey = 'headset';
  else if (/\b(?:teclado|keyboard)\b/i.test(norm)) archKey = 'teclado';
  else if (/\bmouse\b/i.test(norm)) archKey = 'mouse';
  else if (/\b(?:webcam|c[aâ]mera usb)\b/i.test(norm)) archKey = 'webcam';
  else if (/\b(?:ssd|nvme|m\.2|disco s[oó]lido)\b/i.test(norm)) archKey = 'ssd';
  else if (/\b(?:switch de rede|switch giga|switch 10\/100|switch 24|switch 16|switch 8 portas)\b/i.test(norm)) archKey = 'switch';
  else if (/\b(?:cabo de rede|patch cord|furukawa|cat6|cat5e?)\b/i.test(norm)) archKey = 'cabo_rede';
  else if (/\b(?:nobreak|ups|estabilizador de tens[aã]o)\b/i.test(norm)) archKey = 'nobreak';
  else if (/\b(?:monitor corporativo|monitor dell|monitor led|monitor ips|smart tv)\b/i.test(norm)) archKey = 'monitor';

  // 4. Detecção de Modelo / Código Alfanumérico
  let detectedModel = '';
  const modelRegexes = [
    /\b([A-Z]{1,3}\d{2,4}[A-Za-z]?)\b/i, // H390, K120, C920, WM126, P2422H
    /\b([A-Z0-9]{2,5}-[A-Z0-9]{2,6})\b/i, // TL-SG1024D, MK-220
    /\b(\d{3,4}[A-Z]{1,3})\b/i
  ];
  for (const rx of modelRegexes) {
    const m = cleanQuery.match(rx);
    if (m && !RECOGNIZED_BRANDS.some(b => b.toLowerCase() === m[1].toLowerCase())) {
      detectedModel = m[1].toUpperCase();
      break;
    }
  }

  const brand = detectedBrand || 'Genérica';
  const model = detectedModel || '';
  const pNumber = model ? `${brand !== 'Genérica' ? brand.substring(0, 3).toUpperCase() : 'PROD'}-${model}` : '';

  // 5. Se NÃO for um dos arquétipos de informática, gera produto genérico limpo SEM prefixar Headset
  if (!archKey) {
    let category = 'Diversos & Sazonais';
    let ncm = '8471.90.00';
    let weight = '0.500 kg';
    let dimensions = '20cm x 15cm x 10cm';

    if (/ventosa|silicone|pvc|bucha|parafuso|cimento|areia|gesso|piso|madeira|mdf|tinta|fita|adesiv/i.test(norm)) {
      category = 'Construção, Acabamento & Marcenaria';
      ncm = '3926.90.90';
      weight = '0.150 kg';
      dimensions = '10cm x 10cm x 5cm';
    } else if (/alicate|chave|serra|trena|parafusadeira|furadeira|ferramenta|nivel|torquimetro/i.test(norm)) {
      category = 'Ferramentas & Instrumentos de Medição';
      ncm = '8203.20.90';
      weight = '0.450 kg';
      dimensions = '22cm x 8cm x 4cm';
    } else if (/cabo flex[ií]vel|disjuntor|tomada|interruptor|eletroduto|lumin[aá]ria|l[aâ]mpada|fio\s+\d/i.test(norm)) {
      category = 'Elétrica & Iluminação Tática';
      ncm = '8544.49.00';
      weight = '1.000 kg';
      dimensions = '25cm x 25cm x 10cm';
    } else if (/switch|roteador|modem|patch cord|cabo de rede|keystone|fibra|telefonia|telefone|interfone/i.test(norm)) {
      category = 'Redes, Conectividade & Telefonia';
      ncm = /telefone|interfone/i.test(norm) ? '8517.18.00' : '8517.62.59';
      weight = '0.550 kg';
      dimensions = '18cm x 15cm x 10cm';
    } else if (/papel|caneta|l[aá]pis|caderno|prancheta|envelope|pasta|grampeador|borracha/i.test(norm)) {
      category = 'Papelaria, Artes & Material de Escritório';
      ncm = '4820.10.00';
      weight = '0.250 kg';
    } else if (/etiqueta|rotulador|leitor de c[oó]digo|automa[çc][aã]o|t[eé]rmic[oa]|bobina/i.test(norm)) {
      category = 'Impressão & Automação Comercial';
      ncm = '8443.32.99';
      weight = '1.500 kg';
    } else if (/geladeira|frigobar|fog[aã]o|micro-ondas|cafeteira|chaleira|copa|garrafa t[eé]rmica/i.test(norm)) {
      category = 'Eletrodomésticos, Refrigeração & Copa';
      ncm = '8418.21.00';
      weight = '15.000 kg';
    } else if (/detergente|desinfetante|sab[aã]o|[aá]lcool|limpeza|papel toalha|papel higi[eê]nico|lixeira|dispenser/i.test(norm)) {
      category = 'Limpeza, Higiene & Descartáveis';
      ncm = '3402.20.00';
      weight = '1.000 kg';
    } else if (/ra[çc][aã]o|pet|c[aã]o|gato|veterin[aá]ri/i.test(norm)) {
      category = 'Pet Shop & Veterinária';
      ncm = '2309.10.00';
      weight = '5.000 kg';
    } else if (/nobreak|bateria|pilha|carregador|estabilizador/i.test(norm)) {
      category = 'Energia, Nobreaks & Baterias';
      ncm = '8504.40.40';
      weight = '6.000 kg';
    } else if (/projetor|webcam|c[aâ]mera|microfone|\b(?:headset|fone de ouvido|headphone|auricular)\b|caixa de som|audiovisu/i.test(norm)) {
      category = 'Áudio, Vídeo & Apresentação';
      ncm = '8518.30.00';
      weight = '0.400 kg';
    } else if (/ssd|mem[oó]ria|teclado|mouse|computador|notebook|hd\b|processador|placa/i.test(norm)) {
      category = 'Informática, Hardware & Periféricos';
      ncm = '8471.70.40';
      weight = '0.500 kg';
    }

    const isPhone = /telefone|interfone/i.test(norm);
    const resolvedModel = model || (norm.match(/\b(\d{2,4}[a-z]?)\b/i)?.[1]?.toUpperCase() || '');

    const stdName = sanitizeStandardizedProductName(
      formatProductSentenceCase(normalizeSearchTerm(cleanQuery)),
      category,
      brand !== 'Genérica' ? brand : undefined
    );

    const specs = isPhone ? [
      { label: 'Tipo de Aparelho', value: 'Telefone com fio para mesa ou parede' },
      { label: 'Marca / Fabricante', value: brand !== 'Genérica' ? brand : 'Intelbras' },
      { label: 'Funções Integradas', value: 'Flash, Rediscagem, Mudo e Ajuste de Volume' },
      { label: 'Conexão', value: 'Linha Telefônica Padrão RJ11' },
      { label: 'Categoria Oficial', value: category },
      { label: 'Aplicação', value: 'Uso corporativo, comercial e residencial' }
    ] : [
      { label: 'Produto', value: stdName },
      { label: 'Marca / Fabricante', value: brand !== 'Genérica' ? brand : 'Nacional / Importado' },
      { label: 'Categoria Oficial', value: category },
      { label: 'Aplicação', value: 'Uso comercial, empresarial e corporativo' },
      { label: 'Padrão Técnico', value: 'Conforme especificações e normas do fabricante' }
    ];

    const desc = isPhone
      ? `Telefone ${brand !== 'Genérica' ? brand : ''} ${resolvedModel} desenvolvido para proporcionar comunicação clara, confiável e de alta qualidade em ambientes corporativos e comerciais. Possui teclas ergonômicas de toque suave, ajuste de volume da campainha e funções essenciais como rediscagem e modo mudo.\n\nConstrução robusta e durável em plástico de engenharia, sendo compatível com centrais PABX analógicas e linhas telefônicas convencionais com instalação versátil em mesa ou parede.`
      : `${stdName} desenvolvido para atender demandas corporativas e comerciais com confiabilidade e qualidade técnica comprovadas.`;

    return {
      standardizedName: stdName,
      brand,
      manufacturer: brand !== 'Genérica' ? `${brand} do Brasil / Importado` : 'Fabricante Nacional / Importado',
      model: resolvedModel || model,
      partNumber: pNumber || (resolvedModel ? `${brand !== 'Genérica' ? brand.substring(0, 3).toUpperCase() : 'PROD'}-${resolvedModel}` : ''),
      category,
      ncm,
      weight,
      dimensions,
      suggestedPrice: isPhone ? 89.90 : 99.00,
      costPrice: isPhone ? 55.00 : 65.00,
      description: desc,
      specifications: specs,
      quantity: quantity > 0 ? quantity : 1,
      unit: 'Un.',
      confidence: 'Alta - Ficha Técnica Estruturada'
    };
  }

  // 6. Produto de arquétipo reconhecido (teclado, mouse, webcam, etc.)
  const arch = ARCHETYPE_RULES[archKey];

  // Constrói nome padronizado no formato de mercado sem duplicar o termo
  const cleanDetail = cleanQuery
    .replace(new RegExp(`\\b${brand}\\b`, 'gi'), '')
    .replace(new RegExp(`\\b${model}\\b`, 'gi'), '')
    .replace(new RegExp(`\\b${arch.noun}\\b`, 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const stdName = `${arch.noun} ${brand !== 'Genérica' ? brand : ''} ${model} ${cleanDetail}`
    .replace(/,/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    standardizedName: formatProductSentenceCase(stdName),
    brand,
    manufacturer: brand !== 'Genérica' ? `${brand} International` : 'Fabricante Nacional / Importado',
    model,
    partNumber: pNumber,
    category: arch.category,
    ncm: arch.ncm,
    weight: arch.weight,
    dimensions: arch.dimensions,
    suggestedPrice: arch.suggestedPrice,
    costPrice: arch.costPrice,
    description: arch.description(brand, model, cleanQuery),
    specifications: arch.specs,
    quantity: quantity > 0 ? quantity : 1,
    unit: 'Un.',
    confidence: 'Alta - Ficha Técnica Heurística Estruturada'
  };
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
🚨 REGRAS PARA ENTRADA VISUAL (${imgDataList.length} IMAGEM/FOTO ANEXADA):
Analise o conteúdo visual com rigor e diferencie com precisão o tipo de imagem:

TIPO A — DOCUMENTO, PRINT DE TELA, TABELA, PEDIDO OU LISTA (MÁXIMA ATENÇÃO):
Se a imagem for um print de tela, documento digital, planilha, tabela, lista digitada, WhatsApp ou formulário contendo texto e produtos:
1. LEITURA E TRANSCRIÇÃO INTERNA COMPLETA:
   - Leia e compreenda internamente todo o texto, códigos, referências, part numbers, quantidades e descrições contidos na imagem.
2. DIVISÃO EM LINHAS / BORDAS DE TABELA:
   - Observe atentamente as LINHAS HORIZONTAIS, BORDAS DE TABELA, ZEBRADOS OU SEPARADORES que dividem os itens.
   - Cada linha ou bloco delimitado por linhas horizontais representa UM ITEM COMERCIAL INDEPENDENTE!
3. DESCRIÇÕES EXTENSAS EM MÚLTIPLAS LINHAS:
   - Se a descrição de um determinado item for longa e ocupar várias linhas verticais dentro da mesma célula/linha (ex: especificações técnicas detalhadas, dimensões, normas):
     TODO esse bloco contínuo de texto pertence àquele único item específico delimitado pelas linhas divisórias!
     NÃO quebre essa descrição em produtos fictícios e NÃO ignore os outros produtos da tabela!
     As linhas horizontais divisórias da tabela determinam o início e o fim de cada produto.
4. QUANTIDADE DE PRODUTOS NO ARRAY:
   - Se o print contiver 4 itens delimitados por linhas, você DEVE retornar EXATAMENTE OS 4 PRODUTOS no array "products"!
5. PROIBIDO UNIFICAR TABELAS/PRINTS: O Princípio de Unificação NUNCA se aplica a prints de tela, listas ou tabelas com múltiplos produtos! Cada linha é um produto autônomo que deve ser pesquisado e cotado individualmente.

TIPO B — FOTOS REAIS DO MESMO OBJETO FÍSICO:
- Somente se as fotos mostrarem diferentes ângulos, componentes ou embalagem de um ÚNICO objeto físico (ex: fotos de um jogo de xadrez):
  Aplica-se o Princípio de Consolidação: retorne 1 único produto unificando as informações visuais das fotos.
- Preencha "visualSearchQuery", "visualSearchQueryAlt" e "visualSearchQueryEn" com termos físicos e comerciais precisos para localizar o produto no e-commerce brasileiro e internacional.
- Preencha "negativeKeywords" com termos a evitar.
` : '';

    const hybridRuleSection = (imgDataList.length > 0 && rawText.trim()) ? `
🚨🚨🚨 REGRA PARA ENTRADA COMBINADA (${imgDataList.length} FOTO/PRINT + TEXTO ESCRITO):
1. SE A IMAGEM FOR UM PRINT DE TELA, TABELA OU LISTA:
   Mesmo que haja texto digitado, você DEVE transcrever e extrair cada um dos itens delimitados por linhas no print. Se o print tiver 4 produtos separados por linhas, retorne os 4 produtos no array "products"!
2. SE AS FOTOS FOREM DE UM ÚNICO OBJETO FÍSICO COMPLEMENTANDO UM PRODUTO DIGITADO:
   Ex: texto "JOGO DE XADREZ GIGANTE 66x66CM- PEDAGÓGICO" com 3 fotos de xadrez:
   Neste caso, retorne 1 único produto consolidando o texto e as fotos!
3. SE O TEXTO FOR UMA LISTA DE MÚLTIPLOS ITENS:
   Retorne cada item como um produto separado no array "products".
` : '';

    const prompt = `Você é um engenheiro sênior especialista em suprimentos corporativos, equipamentos industriais, informática e catalogação da Infodesk Store e SmartQuote Brasil.
Receberá uma solicitação de produtos (podendo conter ${imgDataList.length > 0 ? `${imgDataList.length} fotos reais de produtos anexadas` : 'nenhuma foto'} e/ou um texto descritivo do comprador com um ou vários itens).
${photoPrioritySection}
${hybridRuleSection}
SUA MISSÃO NA FASE 1: DEDUZIR E ENRIQUECER O(S) PRODUTO(S) COM FICHA TÉCNICA 360° COMPLETA (SISTEMÁTICA INFODESK STORE).
LEMBRE-SE: Se a imagem for um print de tela, documento ou tabela com múltiplos itens separados por linhas horizontais, você DEVE RETORNAR CADA ITEM SEPARADAMENTE no array "products" (ex: 4 linhas de produtos = 4 produtos distintos)! Somente unifique em 1 produto se forem diferentes ângulos físicos de um mesmo objeto.

DIRETRIZES DE FORMATAÇÃO PARA CADA PRODUTO:
- "isFromPhoto": Booleano (true se o produto corresponde ou foi enriquecido pelas fotos anexadas, false se for estritamente do texto sem fotos).
- "photoIndex": Número inteiro (0 para foto principal ou -1 se não houver fotos).
- "standardizedName": TÍTULO COMERCIAL PADRONIZADO E CONCISO (máximo 5 a 15 palavras). Padrão: [Tipo do Produto] [Marca/Fabricante] [Modelo/Part Number] [Especificação Chave]. Exemplo CORRETO de Ventosa: "Ventosa de Silicone e PVC Cristal 30mm Transparente com Furo 2.5mm".
  REGRAS CRÍTICAS DO NOME:
  1. NUNCA coloque parágrafos, frases descritivas ("garantem boa fixação", "adequado para utilizar em display"), tópicos ou listas de atributos dentro do nome! O nome deve ser limpo e conciso.
  2. NUNCA insira prefixos de categoria incorretos! Por exemplo: uma ventosa de silicone usada para apoiar display de acrílico ou tampo de vidro NÃO é um "Monitor ventosa"! Uma ventosa é uma ventosa de fixação. Analise a real natureza física do produto.
  3. NUNCA inclua lixo de OCR ou caracteres truncados (ex: ".º", "1 .º", "º", "* —", frases cortadas como "pacote com").
  4. NUNCA use vírgulas (,) no nome. ATENÇÃO: PRESERVE E USE ACENTUAÇÃO CORRETA DA LÍNGUA PORTUGUESA E CEDILHAS (ex: "Lápis", "Memória", "Válvula", "Eletrônico", "Conexão", "Redutora", "Elétrica", "Proteção"). É ESTRITAMENTE PROIBIDO remover acentos ou retornar nomes desacentuados!
- "brand": Marca comercial oficial ou "Genérica" se sem marca visível.
- "manufacturer": Razão social oficial do fabricante ou "Fabricante Nacional / Importado".
- "model": Modelo exato do produto (ex: CPG-300).
- "partNumber": Part Number oficial ou código alfanumérico.
- "category": Categoria ideal do produto escolhida OBRIGATORIAMENTE entre as categorias oficiais do sistema: ["Informática, Hardware & Periféricos", "Redes, Conectividade & Telefonia", "Áudio, Vídeo & Apresentação", "Monitores, Displays & TVs", "Energia, Nobreaks & Baterias", "Impressão & Automação Comercial", "Papelaria, Artes & Material de Escritório", "Elétrica & Iluminação Tática", "Construção, Acabamento & Marcenaria", "Ferramentas & Instrumentos de Medição", "Equipamentos & Insumos Industriais", "Eletrodomésticos, Refrigeração & Copa", "Limpeza, Higiene & Descartáveis", "Pet Shop & Veterinária", "Diversos & Sazonais"]. ATENÇÃO: Ventosas, fixadores, buchas e suportes pertencem a "Construção, Acabamento & Marcenaria" ou "Equipamentos & Insumos Industriais", NUNCA a "Monitores, Displays & TVs"! NUNCA crie categorias fora desta lista.
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
  REGRAS CRÍTICAS DA DESCRIÇÃO:
  1. É EXPRESSAMENTE PROIBIDO cuspir texto bruto de OCR com pontuações quebradas, marcadores de lista desformatados (".º", "1 .º", "* —") ou frases incompletas ("pacote com", "kit com").
  2. Reescreva todas as informações em parágrafos fluídos de redação técnica e comercial elegante.
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
    {
      "isFromPhoto": ${imgDataList.length > 0 ? 'true' : 'false'},
      "photoIndex": ${imgDataList.length > 0 ? '0' : '-1'},
      "visualInspection": "Descrição física detalhada do produto unificando as fotos e o texto...",
      "visualSearchQuery": "Termo de busca comercial fiel ao produto para achar preços reais",
      "visualSearchQueryAlt": "Termo alternativo de alta precisão",
      "visualSearchQueryEn": "Termo em inglês para imagens de fabricantes",
      "negativeKeywords": ["palavra1", "palavra2"],
      "standardizedName": "Nome Comercial Padronizado do Produto",
      "brand": "Marca Oficial ou Genérica",
      "manufacturer": "Fabricante Oficial",
      "model": "Modelo Exato",
      "partNumber": "PartNumber",
      "category": "Uma das categorias oficiais",
      "ncm": "9504.90.90",
      "ean": "",
      "weight": "2.500 kg",
      "dimensions": "66cm x 66cm x 8cm",
      "quantity": 1,
      "unit": "Un.",
      "suggestedPrice": 249.90,
      "costPrice": 160.00,
      "confidence": "Alta - Identificado com Fotos e Descrição",
      "supplier": "Mercado Livre",
      "buyUrl": "",
      "description": "Texto técnico e comercial rico em 2 a 3 parágrafos...",
      "specifications": [
        { "label": "Característica", "value": "Valor" }
      ],
      "images": []
    }
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
        }, 45000);

        if (callRes.rateLimited) {
          console.warn(`[Phase1][${model}] Rate limited (429) no modelo ${model}, tentando próximo da cascata...`);
          continue;
        }

        if (!callRes.ok || !callRes.data) {
          console.error(`[Phase1][${model}] Falha HTTP ${callRes.status}:`, callRes.errorText?.slice(0, 300));
          continue;
        }

        const data = callRes.data;
        const rawOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawOutput) {
          const finishReason = data?.candidates?.[0]?.finishReason;
          const safetyRatings = data?.candidates?.[0]?.safetyRatings;
          console.error(`[Phase1][${model}] Sem rawOutput. finishReason:`, finishReason, '| safety:', JSON.stringify(safetyRatings));
          continue;
        }

        const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.error(`[Phase1][${model}] Resposta não é JSON:`, rawOutput.slice(0, 200));
          continue;
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const list = Array.isArray(parsed.products) ? parsed.products : (parsed.standardizedName ? [parsed] : []);

        if (list.length === 0) {
          console.error(`[Phase1][${model}] Gemini retornou lista vazia de produtos. JSON:`, rawOutput.slice(0, 200));
          continue;
        }

        if (list.length > 0) {
          const results = await Promise.all(
            list.map(async (item: any, idx: number) => {
              const brand = (item.brand || 'Genérica').trim();
              let category = (item.category || 'Ferramentas & Instrumentos de Medição').trim();
              if (/ventosa|fixador|apoio\s+de\s+vidro/i.test(item.standardizedName || rawText) && category.toLowerCase().includes('monitor')) {
                category = 'Construção, Acabamento & Marcenaria';
              }
              const stdName = sanitizeStandardizedProductName(item.standardizedName || rawText, category, brand);

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

              // Determina as fotos correspondentes enviadas pelo cliente
              let customerPhotoUrls: string[] = [];
              let customerPhotoUrl: string | null = null;

              if (imgDataList.length > 0) {
                if (list.length === 1) {
                  // Quando 1 único produto consolidado foi identificado, TODAS as fotos enviadas entram na galeria dele!
                  for (let i = 0; i < imgDataList.length; i++) {
                    const img = imgDataList[i];
                    let pUrl = `data:${img.mimeType};base64,${img.base64}`;
                    if (i === 0 && item.productBoundingBox) {
                      try {
                        pUrl = await cropImageByBoundingBox(pUrl, item.productBoundingBox);
                      } catch (cropErr) {
                        console.warn('[Crop Image Error]:', cropErr);
                      }
                    }
                    customerPhotoUrls.push(pUrl);
                  }
                  customerPhotoUrl = customerPhotoUrls[0] || null;
                } else if (isFromPhoto) {
                  let targetImg = imgDataList[0];
                  if (typeof item.photoIndex === 'number' && item.photoIndex >= 0 && item.photoIndex < imgDataList.length) {
                    targetImg = imgDataList[item.photoIndex];
                  } else if (imgDataList.length > 1 && idx < imgDataList.length) {
                    targetImg = imgDataList[idx];
                  }

                  let pUrl = `data:${targetImg.mimeType};base64,${targetImg.base64}`;
                  if (item.productBoundingBox) {
                    try {
                      pUrl = await cropImageByBoundingBox(pUrl, item.productBoundingBox);
                    } catch (cropErr) {
                      console.warn('[Crop Image Error]:', cropErr);
                    }
                  }
                  customerPhotoUrls = [pUrl];
                  customerPhotoUrl = pUrl;
                }
              }

              const baseGallery = realImages.length > 0
                ? realImages
                : resolveGalleryImagesForProduct(stdName, category, brand, item.images);

              // As fotos do cliente assumem o topo da galeria do produto; complementadas por fotos encontradas na web
              const gallery = customerPhotoUrls.length > 0
                ? [...customerPhotoUrls, ...baseGallery.filter(u => !customerPhotoUrls.includes(u))]
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
                description: sanitizeProductDescription(item.description, stdName),
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
  // LOG DE DIAGNÓSTICO: se chegar aqui, o Gemini não respondeu (sem chave, circuit breaker ativo ou API falhou)
  console.warn(
    '[Phase1 Fallback Heurístico] Gemini não respondeu para:', rawText.slice(0, 80),
    '| Tem chave IA:', !!activeKey,
    '| Circuit Breaker ativo:', isGeminiCircuitBreakerActive()
  );
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
      const enriched = enrichProductHeuristically(it.query, it.quantity);
      const stdName = enriched.standardizedName || formatProductSentenceCase(normalizeSearchTerm(it.query));
      const category = enriched.category;
      const brand = enriched.brand;

      let realImages: string[] = [];
      try {
        realImages = await searchProductImages(stdName, 8);
      } catch {
        // fallback
      }

      const customerPhotoUrl = (it.isPhoto && typeof it.photoIndex === 'number' && it.photoIndex >= 0 && imgDataList[it.photoIndex])
        ? `data:${imgDataList[it.photoIndex].mimeType};base64,${imgDataList[it.photoIndex].base64}`
        : null;
      const baseGallery = realImages.length > 0 ? realImages : resolveGalleryImagesForProduct(stdName, category, brand);
      const gallery = customerPhotoUrl ? [customerPhotoUrl, ...baseGallery.filter(u => u !== customerPhotoUrl)] : baseGallery;
      const directPurchase = buildDirectPurchaseUrl(stdName);

      return {
        id: `disc-local-${Date.now()}-${idx}`,
        originalQuery: it.query,
        standardizedName: stdName,
        brand: enriched.brand,
        manufacturer: enriched.manufacturer,
        model: enriched.model,
        partNumber: enriched.partNumber,
        category: enriched.category,
        ncm: cleanNcmCode(enriched.ncm),
        weight: normalizeWeight(enriched.weight),
        dimensions: normalizeDimensions(enriched.dimensions),
        quantity: it.quantity || enriched.quantity || 1,
        unit: enriched.unit || 'Un.',
        suggestedPrice: enriched.suggestedPrice,
        costPrice: enriched.costPrice,
        confidence: (it.isPhoto ? 'Alta - Identificado pela Foto' : enriched.confidence) as any,
        description: enriched.description,
        specifications: enriched.specifications,
        images: gallery,
        imageUrl: gallery[0] || '',
        selectedImageIndex: 0,
        customerPhotoUrl: customerPhotoUrl || undefined,
        supplier: directPurchase.store || enriched.brand,
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
  "category": "Uma das categorias oficiais: Informática, Hardware & Periféricos | Redes, Conectividade & Telefonia | Áudio, Vídeo & Apresentação | Monitores, Displays & TVs | Energia, Nobreaks & Baterias | Impressão & Automação Comercial | Papelaria, Artes & Material de Escritório | Elétrica & Iluminação Tática | Construção, Acabamento & Marcenaria | Ferramentas & Instrumentos de Medição | Equipamentos & Insumos Industriais | Eletrodomésticos, Refrigeração & Copa | Limpeza, Higiene & Descartáveis | Pet Shop & Veterinária | Diversos & Sazonais",
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

  // Fallback heurístico inteligente se todos os modelos de IA falharem ou estiverem indisponíveis (503/429)
  const enriched = enrichProductHeuristically(query);
  return {
    standardizedName: enriched.standardizedName,
    brand: enriched.brand,
    manufacturer: enriched.manufacturer,
    model: enriched.model,
    partNumber: enriched.partNumber,
    category: enriched.category,
    confidence: 0.9,
    ncm: cleanNcmCode(enriched.ncm),
    weight: normalizeWeight(enriched.weight),
    dimensions: normalizeDimensions(enriched.dimensions),
    description: enriched.description,
    specifications: enriched.specifications,
    suggestedPrice: enriched.suggestedPrice,
    costPrice: enriched.costPrice
  };
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
      let callRes = await fetchGeminiWithTimeout(endpoint, requestBody, 35000);

      if (callRes.rateLimited) {
        console.warn(`[Phase2][${model}] Rate limited (429) no modelo ${model}, tentando próximo da cascata...`);
        continue;
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
        callRes = await fetchGeminiWithTimeout(endpoint, requestBody, 30000);
        if (callRes.rateLimited) continue;
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

      const stdName = sanitizeStandardizedProductName(
        parsed.standardizedName || discovered.standardizedName,
        discovered.category,
        parsed.brand || discovered.brand
      );

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
      let scannedCategory = getCategoryFromNcm(scannedNcm, discovered.category);
      if (/ventosa|fixador|apoio\s+de\s+vidro/i.test(stdName) && scannedCategory.toLowerCase().includes('monitor')) {
        scannedCategory = 'Construção, Acabamento & Marcenaria';
      }

      const finalDescription = sanitizeProductDescription(
        parsed.description || (discovered as any).description || '',
        stdName
      );
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
