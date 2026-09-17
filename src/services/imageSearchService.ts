/**
 * Image Search Service - Infodesk SmartQuote (Sistemática Infodesk Store)
 * Busca automatizada de fotos reais de produtos na Web com motor de busca de imagens
 * (Mercado Livre, Amazon, Kalunga, e-commerces especializados)
 * Idêntico à implementação de alta acurácia da Infodesk Store.
 */

// Cache em memória para consultas repetidas
const IN_MEMORY_IMAGE_CACHE = new Map<string, string[]>();

function cleanSearchQuery(query: string): string {
  if (!query) return '';
  const cleaned = query
    .replace(/["'()[\]{}#*]/g, ' ')
    .replace(/[,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove repetição de palavras idênticas
  const words = cleaned.split(' ');
  const seen = new Set<string>();
  const uniqueWords: string[] = [];
  for (const w of words) {
    const lower = w.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      uniqueWords.push(w);
    }
  }
  return uniqueWords.join(' ');
}

export interface ImageSearchOptions {
  negativeKeywords?: string[];
  alternativeQueries?: string[];
}

function filterNegativeImages(urls: string[], negativeKeywords?: string[]): string[] {
  if (!negativeKeywords || negativeKeywords.length === 0) return urls;
  const negLower = negativeKeywords.map(k => k.toLowerCase().trim()).filter(Boolean);
  if (negLower.length === 0) return urls;

  return urls.filter(u => {
    const lower = u.toLowerCase();
    return !negLower.some(neg => lower.includes(neg));
  });
}

async function fetchSingleQueryImages(query: string, maxResults: number): Promise<string[]> {
  const clean = cleanSearchQuery(query);
  if (!clean || clean.length < 2) return [];

  // Rota segura oficial (/api/image-search): tratada por Serverless Function na Vercel e middleware no Vite Dev
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`/api/image-search?q=${encodeURIComponent(clean)}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data?.success && Array.isArray(data?.images) && data.images.length > 0) {
        return data.images.slice(0, maxResults);
      }
    }
  } catch (err: any) {
    console.warn('[Image Search] Falha ao consultar endpoint /api/image-search:', err?.message);
  }

  return [];
}

/**
 * Busca imagens reais do produto na web (Sistemática Infodesk Store com Validação Visual)
 * @param query Nome do produto ou termo de busca visual preciso
 * @param maxResults Quantidade máxima de fotos (padrão 4)
 * @param options Opções de filtros negativos e queries alternativas
 */
export async function searchProductImages(
  query: string,
  maxResults = 4,
  options?: ImageSearchOptions
): Promise<string[]> {
  const clean = cleanSearchQuery(query);
  if (!clean || clean.length < 2) return [];

  const cacheKey = `${clean.toLowerCase()}_${(options?.negativeKeywords || []).join('_')}`;
  if (IN_MEMORY_IMAGE_CACHE.has(cacheKey)) {
    return IN_MEMORY_IMAGE_CACHE.get(cacheKey) || [];
  }

  const collected: string[] = [];
  const seen = new Set<string>();

  // 1. Executa busca na query principal
  const primaryRaw = await fetchSingleQueryImages(clean, maxResults * 2);
  const primaryFiltered = filterNegativeImages(primaryRaw, options?.negativeKeywords);

  for (const img of primaryFiltered) {
    if (!seen.has(img)) {
      seen.add(img);
      collected.push(img);
      if (collected.length >= maxResults) break;
    }
  }

  // 2. Se não atingiu a quantidade desejada e há queries alternativas, consulta as alternativas
  if (collected.length < maxResults && options?.alternativeQueries && options.alternativeQueries.length > 0) {
    for (const altQuery of options.alternativeQueries) {
      if (collected.length >= maxResults) break;
      const cleanAlt = cleanSearchQuery(altQuery);
      if (!cleanAlt || cleanAlt.toLowerCase() === clean.toLowerCase()) continue;

      const altRaw = await fetchSingleQueryImages(cleanAlt, maxResults);
      const altFiltered = filterNegativeImages(altRaw, options.negativeKeywords);

      for (const img of altFiltered) {
        if (!seen.has(img)) {
          seen.add(img);
          collected.push(img);
          if (collected.length >= maxResults) break;
        }
      }
    }
  }

  if (collected.length > 0) {
    IN_MEMORY_IMAGE_CACHE.set(cacheKey, collected);
    return collected;
  }

  return [];
}

