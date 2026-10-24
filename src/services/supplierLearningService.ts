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

  // Agrupamento canônico inteligente (evita duplicatas como "Acril Destac" vs "Acrildestac")
  const canonicalMap = new Map<string, {
    name: string;
    domainsSet: Set<string>;
    productCount: number;
    isDefault: boolean;
  }>();

  const defaultNames = new Set(Object.values(DEFAULT_SUPPLIERS_MAP).map(n => n.trim().toLowerCase()));

  const getOrCreateCanonical = (rawName: string) => {
    const clean = rawName.trim();
    if (!clean || clean.length < 2) return null;
    const lower = clean.toLowerCase();
    if (deleted.has(lower)) return null;

    // Chave canônica alfanumérica pura (sem espaços nem pontuação)
    const canonKey = lower.replace(/[^a-z0-9]/g, '');
    if (!canonKey || canonKey.length < 2) return null;

    if (!canonicalMap.has(canonKey)) {
      canonicalMap.set(canonKey, {
        name: clean,
        domainsSet: new Set(),
        productCount: 0,
        isDefault: defaultNames.has(lower)
      });
    }

    const entry = canonicalMap.get(canonKey)!;
    // Se o nome atual tiver melhor formatação comercial (com espaços), dá preferência
    if (clean.includes(' ') && !entry.name.includes(' ')) {
      entry.name = clean;
    } else if (clean.length > entry.name.length && clean[0] === clean[0].toUpperCase()) {
      entry.name = clean;
    }

    return entry;
  };

  // 1. Processa do mapa de aprendizado
  for (const [key, name] of Object.entries(currentMap)) {
    if (!name || name.trim().length < 2) continue;
    const cleanName = name.trim();
    if (deleted.has(cleanName.toLowerCase())) continue;

    const entry = getOrCreateCanonical(cleanName);
    if (!entry) continue;

    // Só adiciona como domínio público se for um domínio real de internet (com ponto, ex: "acrildestac.com.br")
    if (key.includes('.') && key.length >= 4 && !key.includes(' ')) {
      entry.domainsSet.add(key.toLowerCase());
    }
  }

  // 2. Processa produtos extras para contagem e fornecedores adicionais
  if (Array.isArray(extraProducts)) {
    for (const p of extraProducts) {
      const s = p?.supplier?.trim();
      if (!s || s.length < 2 || deleted.has(s.toLowerCase())) continue;
      const lower = s.toLowerCase();
      if (['fornecedor local', 'fornecedor', 'local', 'sem fornecedor'].includes(lower)) continue;

      const entry = getOrCreateCanonical(s);
      if (entry) {
        entry.productCount += 1;
        if (s.includes(' ') && !entry.name.includes(' ')) {
          entry.name = s;
        }
      }
    }
  }

  // 3. Processa cotações extras se fornecidas
  if (Array.isArray(extraQuotes)) {
    for (const q of extraQuotes) {
      if (Array.isArray(q?.items)) {
        for (const it of q.items) {
          const s = it?.supplier?.trim();
          if (!s || s.length < 2 || deleted.has(s.toLowerCase())) continue;
          const lower = s.toLowerCase();
          if (['fornecedor local', 'fornecedor', 'local', 'sem fornecedor'].includes(lower)) continue;

          getOrCreateCanonical(s);
        }
      }
    }
  }

  // Monta lista final consolidada
  const result: SupplierDetail[] = [];
  for (const entry of canonicalMap.values()) {
    const domainList = Array.from(entry.domainsSet).sort((a, b) => a.localeCompare(b));

    result.push({
      name: entry.name,
      domains: domainList,
      isDefault: entry.isDefault || defaultNames.has(entry.name.toLowerCase()),
      productCount: entry.productCount
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
  const oldCanonKey = cleanOld.toLowerCase().replace(/[^a-z0-9]/g, '');
  const newCanonKey = cleanNew.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (isRenaming) {
    recordDeletedSupplier(cleanOld);
  }
  unrecordDeletedSupplier(cleanNew);

  // 1. Atualiza mapa de aprendizado
  const currentMap = loadLearnedMap();
  let mapChanged = false;

  const domainTrimmed = (newDomainOrUrl || '').trim();
  const { fullDomain: newFullDomain, baseSlug: newBaseSlug } = domainTrimmed 
    ? extractDomainKeys(domainTrimmed) 
    : { fullDomain: '', baseSlug: '' };

  // 1.1 Varre currentMap e atualiza / remove domínios
  for (const [key, val] of Object.entries(currentMap)) {
    const valLower = val.trim().toLowerCase();
    const valCanon = valLower.replace(/[^a-z0-9]/g, '');
    const isOldMatch = valLower === cleanOld.toLowerCase() || 
                       valLower === cleanNew.toLowerCase() || 
                       (oldCanonKey && valCanon === oldCanonKey);

    if (isOldMatch) {
      if (key.includes('.')) {
        // Se é chave de domínio de internet (ex: acrildestac.com.br)
        // Se o usuário tirou o endereço (!domainTrimmed) ou mudou para outro (key !== newFullDomain):
        if (!domainTrimmed || (newFullDomain && key !== newFullDomain)) {
          delete currentMap[key];
          mapChanged = true;
          continue;
        }
      }
      currentMap[key] = cleanNew;
      mapChanged = true;
    }
  }

  // 1.2 Se um novo domínio foi informado, registra no mapa
  if (newFullDomain) {
    currentMap[newFullDomain] = cleanNew;
    mapChanged = true;
  }
  if (newBaseSlug) {
    currentMap[newBaseSlug] = cleanNew;
    mapChanged = true;
  }

  // 1.3 Registra a slug canônica do novo nome
  if (newCanonKey && newCanonKey.length >= 2) {
    currentMap[newCanonKey] = cleanNew;
    mapChanged = true;
  }
  if (isRenaming && oldCanonKey && oldCanonKey !== newCanonKey && currentMap[oldCanonKey] === cleanNew) {
    delete currentMap[oldCanonKey];
    mapChanged = true;
  }

  if (mapChanged) {
    memorySuppliersMap = { ...currentMap };
    persistLearnedMap(memorySuppliersMap);
  }

  // 2. Propagação nos produtos do catálogo
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
            const supp = p?.supplier?.trim();
            if (supp) {
              const suppLower = supp.toLowerCase();
              const suppCanon = suppLower.replace(/[^a-z0-9]/g, '');
              const isMatch = suppLower === cleanOld.toLowerCase() || (oldCanonKey && suppCanon === oldCanonKey);
              if (isMatch && supp !== cleanNew) {
                updatedProducts++;
                const updatedP = { ...p, supplier: cleanNew, updated_at: new Date().toISOString() };
                modifiedProducts.push(updatedP);
                return updatedP;
              }
            }
            return p;
          });

          if (updatedProducts > 0) {
            storageObj.setItem('infodesk_products', JSON.stringify(updatedList));
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
                const s = it?.supplier?.trim();
                if (s) {
                  const sLower = s.toLowerCase();
                  const sCanon = sLower.replace(/[^a-z0-9]/g, '');
                  const isMatch = sLower === cleanOld.toLowerCase() || (oldCanonKey && sCanon === oldCanonKey);
                  if (isMatch && s !== cleanNew) {
                    hasItemChange = true;
                    return { ...it, supplier: cleanNew };
                  }
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
  const canonKey = clean.toLowerCase().replace(/[^a-z0-9]/g, '');

  const currentMap = loadLearnedMap();
  let changed = false;
  for (const [key, val] of Object.entries(currentMap)) {
    const valCanon = val.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (val.trim().toLowerCase() === clean.toLowerCase() || (canonKey && valCanon === canonKey)) {
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
