/**
 * Direct Store URL Price Scraper & Inspection Service
 * Infodesk SmartQuote (Item A - Validação Ativa de Preços em Links Salvos)
 * 
 * Inspeciona diretamente links de compra salvos (Mercado Livre, Amazon, KaBuM, etc.)
 * extraindo preço atualizado, disponibilidade e título via proxies CORS e heurísticas DOM/JSON-LD.
 */

import { isExactProductUrl } from '../utils/aiEmailParser';

export interface ScrapedDirectUrlPrice {
  success: boolean;
  price?: number;
  priceFormatted?: string;
  store?: string;
  inStock?: boolean;
  title?: string;
  error?: string;
}

// Cache em memória de preços checados via URL para não re-bater na rede em 5 minutos
const directPriceCache = new Map<string, { result: ScrapedDirectUrlPrice; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Normaliza valores monetários brasileiros (ex: "749,90", "1.250,00", "749.90") para float
 */
function parseBrlPrice(raw: string | number): number {
  if (typeof raw === 'number') return raw > 0 ? Number(raw.toFixed(2)) : 0;
  if (!raw || typeof raw !== 'string') return 0;

  const clean = raw.replace(/R\$\s*/gi, '').trim();
  if (clean.includes(',')) {
    const normalized = clean.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : Number(num.toFixed(2));
  }
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : Number(num.toFixed(2));
}

/**
 * Identifica a loja / domínio amigável a partir da URL
 */
export function identifyStoreFromUrl(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host.includes('mercadolivre') || host.includes('mercadolibre') || host.includes('meli.la')) return 'Mercado Livre';
    if (host.includes('amazon')) return 'Amazon';
    if (host.includes('kabum')) return 'KaBuM!';
    if (host.includes('kalunga')) return 'Kalunga';
    if (host.includes('magazineluiza') || host.includes('magalu')) return 'Magazine Luiza';
    if (host.includes('pichau')) return 'Pichau';
    if (host.includes('terabyteshop')) return 'TerabyteShop';
    if (host.includes('leroymerlin')) return 'Leroy Merlin';
    if (host.includes('casasbahia')) return 'Casas Bahia';
    if (host.includes('americanas')) return 'Americanas';
    return host;
  } catch {
    return 'Fornecedor';
  }
}

/**
 * Extrai preço de tags HTML / JSON-LD / Meta Tags de e-commerce
 */
function extractPriceFromHtml(html: string): number | null {
  if (!html || html.length < 50) return null;

  // 1. Tenta Schema.org JSON-LD (Padrão mais confiável da Web)
  try {
    const jsonLdMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatches) {
      for (const block of jsonLdMatches) {
        const rawJson = block.replace(/<\/?script[^>]*>/gi, '').trim();
        try {
          const parsed = JSON.parse(rawJson);
          const findOffers = (obj: any): any => {
            if (!obj || typeof obj !== 'object') return null;
            if (obj.offers) return obj.offers;
            if (Array.isArray(obj['@graph'])) {
              for (const item of obj['@graph']) {
                const sub = findOffers(item);
                if (sub) return sub;
              }
            }
            return null;
          };

          const offers = findOffers(parsed);
          if (offers) {
            const offerList = Array.isArray(offers) ? offers : [offers];
            for (const off of offerList) {
              const p = parseBrlPrice(off.price || off.lowPrice || off.priceSpecification?.price);
              if (p > 0) return p;
            }
          }
        } catch {
          // Continua para o próximo bloco
        }
      }
    }
  } catch {
    // ignora falhas de regex
  }

  // 2. Meta tags OpenGraph e Schema
  const metaPatterns = [
    /<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']([0-9.,]+)["']/i,
    /<meta[^>]+content=["']([0-9.,]+)["'][^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["']/i,
    /<meta[^>]+(?:itemprop)=["']price["'][^>]+content=["']([0-9.,]+)["']/i,
    /<meta[^>]+content=["']([0-9.,]+)["'][^>]+(?:itemprop)=["']price["']/i
  ];

  for (const pat of metaPatterns) {
    const match = html.match(pat);
    if (match && match[1]) {
      const p = parseBrlPrice(match[1]);
      if (p > 0) return p;
    }
  }

  // 3. Padrões específicos de grandes e-commerces brasileiros
  // Mercado Livre fração + centavos: <span class="andes-money-amount__fraction">749</span> ... <span class="andes-money-amount__cents">90</span>
  const mlFraction = html.match(/class=["'][^"']*andes-money-amount__fraction[^"']*["']>([0-9.]+)</i);
  if (mlFraction && mlFraction[1]) {
    const centsMatch = html.match(/class=["'][^"']*andes-money-amount__cents[^"']*["']>([0-9]{2})</i);
    const fractionPart = mlFraction[1].replace(/\./g, '');
    const centsPart = centsMatch && centsMatch[1] ? centsMatch[1] : '00';
    const num = parseFloat(`${fractionPart}.${centsPart}`);
    if (!isNaN(num) && num > 0) return Number(num.toFixed(2));
  }

  // KaBuM! / Pichau padrão de preço à vista
  const kabumMatch = html.match(/class=["'][^"']*finalPrice[^"']*["'][^>]*>R\$\s*([0-9.,]+)</i)
    || html.match(/preco_desconto["']\s*:\s*["']?([0-9.,]+)["']?/i);
  if (kabumMatch && kabumMatch[1]) {
    const p = parseBrlPrice(kabumMatch[1]);
    if (p > 0) return p;
  }

  return null;
}

/**
 * Busca e inspeciona o preço ao vivo diretamente na URL salva
 */
export async function scrapeDirectUrlPrice(
  url: string,
  timeoutMs: number = 7000
): Promise<ScrapedDirectUrlPrice> {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return { success: false, error: 'URL inválida ou ausente' };
  }

  const store = identifyStoreFromUrl(url);

  // 1. Checa cache recente
  const cached = directPriceCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  // 2. Proxies CORS públicos com fallback para contornar bloqueio de mesma origem do navegador
  const proxyEndpoints = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];

  for (const proxyUrl of proxyEndpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/json'
        }
      });
      clearTimeout(timer);

      if (!resp.ok) continue;

      const html = await resp.text();
      if (!html || html.length < 100) continue;

      const price = extractPriceFromHtml(html);
      if (price && price > 0) {
        const result: ScrapedDirectUrlPrice = {
          success: true,
          price,
          priceFormatted: `R$ ${price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          store,
          inStock: !html.includes('Produto esgotado') && !html.includes('Avise-me quando chegar') && !html.includes('Sem estoque')
        };
        directPriceCache.set(url, { result, timestamp: Date.now() });
        return result;
      }
    } catch {
      // Tenta próximo proxy
      continue;
    }
  }

  return {
    success: false,
    store,
    error: 'Não foi possível extrair o preço direto da página (conteúdo dinâmico ou bloqueado).'
  };
}
