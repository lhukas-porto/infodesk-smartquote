import { supabase } from './supabase';

export interface CachedPriceOffer {
  id: string;
  partNumber: string;
  name: string;
  supplier: string;
  costPrice: number;
  sourceUrl?: string;
  date: string; // ISO date
  daysAgo: number;
  isRecent: boolean; // < 15 days
}

const LOCAL_CACHE_KEY = 'smartquote_price_cache_v1';
const MAX_CACHE_ITEMS = 200;

function normalizePartNumber(pn: string): string {
  return (pn || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

/**
 * Lê o cache do LocalStorage de forma resiliente
 */
function getLocalCache(): Record<string, CachedPriceOffer> {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Persiste cache no LocalStorage
 */
function setLocalCache(cache: Record<string, CachedPriceOffer>): void {
  try {
    // Manter o tamanho controlado
    const keys = Object.keys(cache);
    if (keys.length > MAX_CACHE_ITEMS) {
      // Ordenar pelas mais antigas e descartar
      const sortedKeys = keys.sort((a, b) => new Date(cache[a].date).getTime() - new Date(cache[b].date).getTime());
      const keysToRemove = sortedKeys.slice(0, keys.length - MAX_CACHE_ITEMS);
      keysToRemove.forEach(k => delete cache[k]);
    }
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('[priceCacheService] Falha ao gravar cache local:', err);
  }
}

/**
 * Salva uma cotação/oferta confirmada no cache (MEL-02)
 */
export function savePriceToCache(params: {
  partNumber?: string;
  name: string;
  supplier: string;
  costPrice: number;
  sourceUrl?: string;
}): void {
  if (!params.partNumber || params.costPrice <= 0) return;
  const normPn = normalizePartNumber(params.partNumber);
  if (!normPn || normPn.length < 3) return;

  const now = new Date();
  const offer: CachedPriceOffer = {
    id: `cache-${normPn}`,
    partNumber: params.partNumber.trim(),
    name: params.name.trim(),
    supplier: params.supplier?.trim() || 'Fornecedor Homologado',
    costPrice: params.costPrice,
    sourceUrl: params.sourceUrl,
    date: now.toISOString(),
    daysAgo: 0,
    isRecent: true
  };

  const cache = getLocalCache();
  cache[normPn] = offer;
  setLocalCache(cache);
}

/**
 * Busca oferta recente por Part Number (primeiro no LocalStorage, depois no Supabase)
 * Responde em milissegundos (<50ms).
 */
export async function findRecentPriceByPartNumber(
  partNumber: string
): Promise<CachedPriceOffer | null> {
  if (!partNumber) return null;
  const normPn = normalizePartNumber(partNumber);
  if (!normPn || normPn.length < 3) return null;

  const cache = getLocalCache();
  const cached = cache[normPn];

  if (cached) {
    const cachedDate = new Date(cached.date);
    const diffMs = Date.now() - cachedDate.getTime();
    const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    return {
      ...cached,
      daysAgo,
      isRecent: daysAgo <= 15
    };
  }

  // Tenta consultar no Supabase produtos cadastrados com esse Part Number
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, part_number, cost_price, supplier, source_url, updated_at')
      .ilike('part_number', `%${partNumber.trim()}%`)
      .limit(1)
      .maybeSingle();

    if (!error && data && data.cost_price > 0) {
      const updatedDate = new Date(data.updated_at || new Date().toISOString());
      const daysAgo = Math.floor((Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24));

      const offer: CachedPriceOffer = {
        id: data.id,
        partNumber: data.part_number || partNumber,
        name: data.name,
        supplier: data.supplier || 'Catálogo Infodesk',
        costPrice: Number(data.cost_price),
        sourceUrl: data.source_url,
        date: updatedDate.toISOString(),
        daysAgo,
        isRecent: daysAgo <= 30
      };

      // Guardar no cache local para a próxima chamada ser instantânea
      cache[normPn] = offer;
      setLocalCache(cache);

      return offer;
    }
  } catch {
    // Silencioso se offline
  }

  return null;
}
