/**
 * SERVIÇO DE APRENDIZADO CONTÍNUO DE FORNECEDORES E LOJAS (DIRETRIZ DO LUCAS)
 * 
 * Permite que o sistema aprenda com os fornecedores já salvos em outros produtos
 * e nas cotações anteriores, garantindo que URLs (como "palaciodasferramentas.com.br")
 * sejam automaticamente convertidas para o nome comercial correto, com acentos,
 * espaçamento e maiúsculas adequadas ("Palácio das Ferramentas").
 */

const STORAGE_KEY = 'infodesk_learned_suppliers_v1';

// Base de conhecimento inicial com fornecedores e distribuidores frequentes do mercado brasileiro
const DEFAULT_SUPPLIERS_MAP: Record<string, string> = {
  'palaciodasferramentas': 'Palácio das Ferramentas',
  'palaciodasferramentas.com.br': 'Palácio das Ferramentas',
  'dutramaquinas': 'Dutra Máquinas',
  'dutramaquinas.com.br': 'Dutra Máquinas',
  'lojadomecanico': 'Loja do Mecânico',
  'lojadomecanico.com.br': 'Loja do Mecânico',
  'ferramentaskennedy': 'Ferramentas Kennedy',
  'ferramentaskennedy.com.br': 'Ferramentas Kennedy',
  'anhangueraferramentas': 'Anhanguera Ferramentas',
  'anhangueraferramentas.com.br': 'Anhanguera Ferramentas',
  'dutotec': 'Dutotec',
  'dutotec.com.br': 'Dutotec',
  'centralbrasilinstrumentos': 'Central Brasil Instrumentos',
  'centralbrasil': 'Central Brasil Instrumentos',
  'comercialalvorada': 'Comercial Alvorada',
  'ultramaquinas': 'Ultra Máquinas',
  'leomadeiras': 'Léo Madeiras',
  'lojaeletrica': 'Loja Elétrica',
  'sipolatti': 'Sipolatti',
  'agis': 'Agis Distribuição',
  'fischer': 'Fischer Oficial',
  'magazineluiza': 'Magazine Luiza',
  'magalu': 'Magazine Luiza',
  'mercadolivre': 'Mercado Livre',
  'kabum': 'KaBuM!',
  'amazon': 'Amazon',
  'carrefour': 'Carrefour',
  'leroymerlin': 'Leroy Merlin',
  'kalunga': 'Kalunga',
  'casasbahia': 'Casas Bahia',
  'pontofrio': 'Ponto Frio',
  'fastshop': 'Fast Shop',
  'dell': 'Dell Brasil',
  'intelbras': 'Intelbras',
  'furukawa': 'Furukawa Electric',
  'schneider': 'Schneider Electric',
  'dufrio': 'Dufrio',
  'pichau': 'Pichau',
  'terabyte': 'Terabyte',
  'terabyteshop': 'Terabyte',
  'electrolux': 'Electrolux',
  'brastemp': 'Brastemp',
  'consul': 'Consul',
  'philco': 'Philco',
  'suggar': 'Suggar',
  'samsung': 'Samsung',
  'apple': 'Apple',
  'lenovo': 'Lenovo',
  'shopee': 'Shopee',
  'aliexpress': 'AliExpress'
};

// Cache em memória compartilhado
let memorySuppliersMap: Record<string, string> = { ...DEFAULT_SUPPLIERS_MAP };
let isLoaded = false;

/**
 * Normaliza uma chave de domínio ou texto para matching sem acentos, sem www e minúsculo.
 * Ex: "https://www.palaciodasferramentas.com.br/produto/123" -> "palaciodasferramentas.com.br" e "palaciodasferramentas"
 */
export function extractDomainKeys(urlOrDomain?: string): { fullDomain: string; baseSlug: string } {
  if (!urlOrDomain) return { fullDomain: '', baseSlug: '' };
  try {
    let clean = urlOrDomain.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `https://${clean}`;
    }
    let host = '';
    try {
      const parsed = new URL(clean);
      host = parsed.hostname.toLowerCase();
    } catch {
      host = clean.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
    }

    // Remove subdomínios comuns
    host = host.replace(/^(www\.|vendas\.|loja\.|lojas\.|compre\.|shop\.|m\.|br\.)+/, '');

    // Slug base sem extensões (ex: "palaciodasferramentas" de "palaciodasferramentas.com.br")
    const baseSlug = host.split('.')[0] || '';

    return { fullDomain: host, baseSlug };
  } catch {
    return { fullDomain: '', baseSlug: '' };
  }
}

function getSafeStorage(): Storage | null {
  if (typeof localStorage !== 'undefined') return localStorage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return null;
}

/**
 * Carrega fornecedores aprendidos persistidos no localStorage
 */
function loadLearnedMap(): Record<string, string> {
  if (isLoaded) return memorySuppliersMap;
  try {
    const storage = getSafeStorage();
    if (storage) {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          memorySuppliersMap = { ...DEFAULT_SUPPLIERS_MAP, ...parsed };
        }
      }
    }
  } catch (err) {
    console.warn('[supplierLearningService] Erro ao carregar aprendizado de fornecedores:', err);
  }
  isLoaded = true;
  return memorySuppliersMap;
}

/**
 * Salva o mapa de fornecedores aprendidos no localStorage
 */
function persistLearnedMap(map: Record<string, string>): void {
  try {
    const storage = getSafeStorage();
    if (storage) {
      storage.setItem(STORAGE_KEY, JSON.stringify(map));
    }
  } catch (err) {
    console.warn('[supplierLearningService] Erro ao persistir aprendizado de fornecedores:', err);
  }
}

/**
 * Registra o aprendizado de um fornecedor a partir de uma URL e do nome correto informado pelo Lucas.
 * Ex: learnSupplier('https://www.palaciodasferramentas.com.br/item', 'Palácio das Ferramentas')
 */
export function learnSupplier(urlOrDomain: string | undefined, supplierName: string | undefined): void {
  if (!urlOrDomain || !supplierName) return;
  const cleanName = supplierName.trim();
  // Ignora nomes genéricos ou temporários
  if (!cleanName || cleanName.length < 2 || ['fornecedor local', 'fornecedor', 'local', 'sem fornecedor', 'loja'].includes(cleanName.toLowerCase())) {
    return;
  }

  const { fullDomain, baseSlug } = extractDomainKeys(urlOrDomain);
  if (!baseSlug || baseSlug.includes('google') || baseSlug.length < 2) return;

  const currentMap = loadLearnedMap();
  let changed = false;

  if (fullDomain && currentMap[fullDomain] !== cleanName) {
    currentMap[fullDomain] = cleanName;
    changed = true;
  }

  if (baseSlug && currentMap[baseSlug] !== cleanName) {
    currentMap[baseSlug] = cleanName;
    changed = true;
  }

  if (changed) {
    memorySuppliersMap = { ...currentMap };
    persistLearnedMap(memorySuppliersMap);
  }
}

/**
 * Consulta se existe um fornecedor aprendido para a URL informada.
 * Retorna o nome formatado oficial (ex: "Palácio das Ferramentas") ou null se não houver aprendizado prévio.
 */
export function getLearnedSupplierForUrl(url?: string): string | null {
  if (!url) return null;
  const { fullDomain, baseSlug } = extractDomainKeys(url);
  if (!baseSlug || baseSlug.includes('google')) return null;

  const currentMap = loadLearnedMap();

  // 1. Procura match exato pelo fullDomain (ex: "palaciodasferramentas.com.br")
  if (fullDomain && currentMap[fullDomain]) {
    return currentMap[fullDomain];
  }

  // 2. Procura match exato pelo slug base (ex: "palaciodasferramentas")
  if (baseSlug && currentMap[baseSlug]) {
    return currentMap[baseSlug];
  }

  // 3. Procura match por chave contida no domínio
  for (const [key, name] of Object.entries(currentMap)) {
    if (key.length >= 4 && (fullDomain.includes(key) || key.includes(baseSlug))) {
      return name;
    }
  }

  return null;
}

/**
 * Aprende em lote com todos os produtos existentes (Catálogo, Cotações, etc.)
 */
export function learnSuppliersFromProducts(
  products?: Array<any | null>
): number {
  if (!Array.isArray(products) || products.length === 0) return 0;
  let count = 0;
  for (const p of products) {
    if (!p) continue;
    const url = p.sourceUrl || p.source_url || p.url || p.link || p.productUrl;
    const supp = p.supplier || p.store;
    if (url && supp) {
      learnSupplier(url, supp);
      count++;
    }
  }
  return count;
}

/**
 * Aprende em lote com as propostas comerciais e seus itens
 */
export function learnSuppliersFromQuotes(
  quotes?: Array<{ items?: Array<any> } | null>
): number {
  if (!Array.isArray(quotes) || quotes.length === 0) return 0;
  let count = 0;
  for (const q of quotes) {
    if (!q || !Array.isArray(q.items)) continue;
    for (const it of q.items) {
      const url = it.sourceUrl || it.source_url || it.url || it.link || it.productUrl;
      const supp = it.supplier || it.store;
      if (url && supp) {
        learnSupplier(url, supp);
        count++;
      }
    }
  }
  return count;
}

const DELETED_SUPPLIERS_KEY = 'infodesk_deleted_suppliers_v1';

export interface SupplierDetail {
  name: string;
  domains: string[];
  isDefault: boolean;
  productCount: number;
}

export function getDeletedSuppliers(): Set<string> {
  try {
    const storage = getSafeStorage();
    if (storage) {
      const raw = storage.getItem(DELETED_SUPPLIERS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          return new Set(arr.map(s => String(s).trim().toLowerCase()).filter(Boolean));
        }
      }
    }
  } catch { /* noop */ }
  return new Set<string>();
}

export function recordDeletedSupplier(name: string): void {
  if (!name) return;
  try {
    const set = getDeletedSuppliers();
    set.add(name.trim().toLowerCase());
    const storage = getSafeStorage();
    if (storage) {
      storage.setItem(DELETED_SUPPLIERS_KEY, JSON.stringify(Array.from(set)));
    }
  } catch { /* noop */ }
}

export function unrecordDeletedSupplier(name: string): void {
  if (!name) return;
  try {
    const set = getDeletedSuppliers();
    set.delete(name.trim().toLowerCase());
    const storage = getSafeStorage();
    if (storage) {
      storage.setItem(DELETED_SUPPLIERS_KEY, JSON.stringify(Array.from(set)));
    }
  } catch { /* noop */ }
}

export function clearDeletedSuppliers(): void {
  try {
    const storage = getSafeStorage();
    if (storage) {
      storage.removeItem(DELETED_SUPPLIERS_KEY);
    }
  } catch { /* noop */ }
}

/**
 * Retorna todos os nomes únicos de fornecedores conhecidos e aprendidos
 * para uso em auto-complete, comboboxes e sugestões de digitação.
 */
export function getAllRegisteredSuppliers(
  extraProducts?: Array<{ supplier?: string }>,
  extraQuotes?: Array<{ items?: Array<{ supplier?: string }> }>
): string[] {
  const currentMap = loadLearnedMap();
  const deleted = getDeletedSuppliers();
  const set = new Set<string>();

  // Adiciona valores do mapa de aprendizado
  for (const name of Object.values(currentMap)) {
    if (name && name.trim().length >= 2) {
      const clean = name.trim();
      if (!deleted.has(clean.toLowerCase())) {
        set.add(clean);
      }
    }
  }

  // Adiciona dos produtos extras se fornecidos
  if (Array.isArray(extraProducts)) {
    for (const p of extraProducts) {
      const s = p?.supplier?.trim();
      if (s && s.length >= 2 && !['fornecedor local', 'fornecedor', 'local'].includes(s.toLowerCase())) {
        if (!deleted.has(s.toLowerCase())) {
          set.add(s);
        }
      }
    }
  }

  // Adiciona das cotações extras se fornecidas
  if (Array.isArray(extraQuotes)) {
    for (const q of extraQuotes) {
      if (Array.isArray(q?.items)) {
        for (const it of q.items) {
          const s = it?.supplier?.trim();
          if (s && s.length >= 2 && !['fornecedor local', 'fornecedor', 'local'].includes(s.toLowerCase())) {
            if (!deleted.has(s.toLowerCase())) {
              set.add(s);
            }
          }
        }
      }
    }
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Retorna lista detalhada de fornecedores para a Aba Oficial de Fornecedores das Configurações
 */
export function getRegisteredSuppliersDetailed(
  extraProducts?: Array<{ supplier?: string }>,
  extraQuotes?: Array<{ items?: Array<{ supplier?: string }> }>
): SupplierDetail[] {
  const currentMap = loadLearnedMap();
  const deleted = getDeletedSuppliers();

  const supplierToDomains = new Map<string, Set<string>>();
  const defaultNames = new Set(Object.values(DEFAULT_SUPPLIERS_MAP).map(n => n.trim().toLowerCase()));

  // 1. Processa do mapa de aprendizado
  for (const [key, name] of Object.entries(currentMap)) {
    if (!name || name.trim().length < 2) continue;
    const cleanName = name.trim();
    if (deleted.has(cleanName.toLowerCase())) continue;

    if (!supplierToDomains.has(cleanName)) {
      supplierToDomains.set(cleanName, new Set());
    }
    if (key.length >= 3 && !key.includes(' ')) {
      supplierToDomains.get(cleanName)!.add(key);
    }
  }

  // 2. Processa produtos extras para contagem e fornecedores adicionais
  const productCountMap = new Map<string, number>();
  if (Array.isArray(extraProducts)) {
    for (const p of extraProducts) {
      const s = p?.supplier?.trim();
      if (!s || s.length < 2 || deleted.has(s.toLowerCase())) continue;
      const lower = s.toLowerCase();
      if (['fornecedor local', 'fornecedor', 'local', 'sem fornecedor'].includes(lower)) continue;

      productCountMap.set(s, (productCountMap.get(s) || 0) + 1);

      if (!supplierToDomains.has(s)) {
        supplierToDomains.set(s, new Set());
      }
    }
  }

  // 3. Processa cotações extras
  if (Array.isArray(extraQuotes)) {
    for (const q of extraQuotes) {
      if (Array.isArray(q?.items)) {
        for (const it of q.items) {
          const s = it?.supplier?.trim();
          if (!s || s.length < 2 || deleted.has(s.toLowerCase())) continue;
          const lower = s.toLowerCase();
          if (['fornecedor local', 'fornecedor', 'local', 'sem fornecedor'].includes(lower)) continue;

          if (!supplierToDomains.has(s)) {
            supplierToDomains.set(s, new Set());
          }
        }
      }
    }
  }

  // Monta lista final
  const result: SupplierDetail[] = [];
  for (const [name, domainsSet] of supplierToDomains.entries()) {
    const domainList = Array.from(domainsSet).sort((a, b) => {
      const aHasDot = a.includes('.');
      const bHasDot = b.includes('.');
      if (aHasDot && !bHasDot) return -1;
      if (!aHasDot && bHasDot) return 1;
      return a.localeCompare(b);
    });

    result.push({
      name,
      domains: domainList,
      isDefault: defaultNames.has(name.toLowerCase()),
      productCount: productCountMap.get(name) || 0
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * Salva ou adiciona um novo fornecedor no sistema
 */
export function saveRegisteredSupplier(name: string, domainOrUrl?: string): void {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length < 2) return;
  unrecordDeletedSupplier(cleanName);

  if (domainOrUrl && domainOrUrl.trim()) {
    learnSupplier(domainOrUrl.trim(), cleanName);
  } else {
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (slug.length >= 2) {
      const currentMap = loadLearnedMap();
      currentMap[slug] = cleanName;
      memorySuppliersMap = { ...currentMap };
      persistLearnedMap(memorySuppliersMap);
    }
  }

  notifySuppliersChanged({ type: 'add', name: cleanName });
}

/**
 * Atualiza / renomeia um fornecedor e propaga as alterações para todos os produtos
 * e cotações existentes com o nome antigo (Diretriz do Lucas).
 */
export function updateRegisteredSupplier(
  oldName: string, 
  newName: string, 
  newDomainOrUrl?: string, 
  updateProductsAndQuotes: boolean = true
): { updatedProducts: number; updatedQuotes: number } {
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim();
  if (!cleanOld || !cleanNew) return { updatedProducts: 0, updatedQuotes: 0 };

  const isRenaming = cleanOld.toLowerCase() !== cleanNew.toLowerCase();

  if (isRenaming) {
    // Registra o nome antigo no tombstone de excluídos para garantir que nunca mais
    // seja ressuscitado por produtos em cache, cotações antigas ou DEFAULT_SUPPLIERS_MAP
    recordDeletedSupplier(cleanOld);
  }
  unrecordDeletedSupplier(cleanNew);

  // 1. Atualiza mapa de aprendizado
  const currentMap = loadLearnedMap();
  let mapChanged = false;
  for (const [key, val] of Object.entries(currentMap)) {
    if (val.trim().toLowerCase() === cleanOld.toLowerCase()) {
      currentMap[key] = cleanNew;
      mapChanged = true;
    }
  }

  // Se for renomeação, garante que o novo nome tenha pelo menos uma chave registrada
  if (isRenaming) {
    const newSlug = cleanNew.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (newSlug.length >= 2) {
      currentMap[newSlug] = cleanNew;
      mapChanged = true;
    }
    // Remove slug antiga se pertencia ao nome antigo
    const oldSlug = cleanOld.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (oldSlug.length >= 2 && oldSlug !== newSlug && currentMap[oldSlug] === cleanNew) {
      delete currentMap[oldSlug];
      mapChanged = true;
    }
  }

  if (newDomainOrUrl && newDomainOrUrl.trim()) {
    const { fullDomain, baseSlug } = extractDomainKeys(newDomainOrUrl.trim());
    if (fullDomain) currentMap[fullDomain] = cleanNew;
    if (baseSlug) currentMap[baseSlug] = cleanNew;
    mapChanged = true;
  }

  if (mapChanged) {
    memorySuppliersMap = { ...currentMap };
    persistLearnedMap(memorySuppliersMap);
  }

  let updatedProducts = 0;
  let updatedQuotes = 0;

  if (updateProductsAndQuotes && (typeof localStorage !== 'undefined' || typeof window !== 'undefined')) {
    const storageObj = typeof localStorage !== 'undefined' ? localStorage : window.localStorage;
    try {
      const rawProducts = storageObj.getItem('infodesk_products');
      if (rawProducts) {
        const productsArr = JSON.parse(rawProducts);
        if (Array.isArray(productsArr)) {
          const modifiedProducts: any[] = [];
          const updatedList = productsArr.map((p: any) => {
            if (p?.supplier && p.supplier.trim().toLowerCase() === cleanOld.toLowerCase()) {
              updatedProducts++;
              const updatedP = { ...p, supplier: cleanNew, updated_at: new Date().toISOString() };
              modifiedProducts.push(updatedP);
              return updatedP;
            }
            return p;
          });

          if (updatedProducts > 0) {
            storageObj.setItem('infodesk_products', JSON.stringify(updatedList));
            // Sincroniza em background com Supabase
            import('./supabase').then(({ syncBatchProductsToSupabase }) => {
              syncBatchProductsToSupabase(modifiedProducts).catch(err => {
                console.warn('[supplierLearningService] Erro ao sincronizar produtos atualizados com Supabase:', err);
              });
            }).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao propagar renomeação de fornecedor nos produtos:', e);
    }

    // 3. Propagação nas Cotações Salvas
    try {
      const rawQuotes = storageObj.getItem('infodesk_quotes');
      if (rawQuotes) {
        const quotesArr = JSON.parse(rawQuotes);
        if (Array.isArray(quotesArr)) {
          let quotesModified = false;
          const updatedQuotesList = quotesArr.map((q: any) => {
            if (Array.isArray(q?.items)) {
              let hasItemChange = false;
              const newItems = q.items.map((it: any) => {
                if (it?.supplier && it.supplier.trim().toLowerCase() === cleanOld.toLowerCase()) {
                  hasItemChange = true;
                  return { ...it, supplier: cleanNew };
                }
                return it;
              });
              if (hasItemChange) {
                updatedQuotes++;
                quotesModified = true;
                return { ...q, items: newItems, updatedAt: new Date().toISOString() };
              }
            }
            return q;
          });

          if (quotesModified) {
            storageObj.setItem('infodesk_quotes', JSON.stringify(updatedQuotesList));
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao propagar renomeação de fornecedor nas cotações:', e);
    }
  }

  notifySuppliersChanged({ type: 'update', oldName: cleanOld, newName: cleanNew, updatedProducts, updatedQuotes });
  return { updatedProducts, updatedQuotes };
}

/**
 * Remove um fornecedor do aprendizado e do sistema
 */
export function deleteRegisteredSupplier(name: string): void {
  const clean = name.trim();
  if (!clean) return;

  recordDeletedSupplier(clean);

  const currentMap = loadLearnedMap();
  let changed = false;
  for (const [key, val] of Object.entries(currentMap)) {
    if (val.trim().toLowerCase() === clean.toLowerCase()) {
      delete currentMap[key];
      changed = true;
    }
  }

  if (changed) {
    memorySuppliersMap = { ...currentMap };
    persistLearnedMap(memorySuppliersMap);
  }

  notifySuppliersChanged({ type: 'delete', name: clean });
}

/**
 * Restaura fornecedores e distribuidores padrão oficiais
 */
export function resetRegisteredSuppliers(): void {
  clearDeletedSuppliers();
  memorySuppliersMap = { ...DEFAULT_SUPPLIERS_MAP };
  persistLearnedMap(memorySuppliersMap);
  notifySuppliersChanged({ type: 'reset' });
}

function notifySuppliersChanged(detail?: any): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('infodesk:suppliers-updated', { detail }));
    } catch { /* noop */ }
  }
}
