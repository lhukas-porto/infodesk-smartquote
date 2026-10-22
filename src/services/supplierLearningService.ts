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

/**
 * Carrega fornecedores aprendidos persistidos no localStorage
 */
function loadLearnedMap(): Record<string, string> {
  if (isLoaded) return memorySuppliersMap;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem(STORAGE_KEY);
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
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
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

/**
 * Retorna todos os nomes únicos de fornecedores conhecidos e aprendidos
 * para uso em auto-complete, comboboxes e sugestões de digitação.
 */
export function getAllRegisteredSuppliers(
  extraProducts?: Array<{ supplier?: string }>,
  extraQuotes?: Array<{ items?: Array<{ supplier?: string }> }>
): string[] {
  const currentMap = loadLearnedMap();
  const set = new Set<string>();

  // Adiciona valores do mapa de aprendizado
  for (const name of Object.values(currentMap)) {
    if (name && name.trim().length >= 2) {
      set.add(name.trim());
    }
  }

  // Adiciona dos produtos extras se fornecidos
  if (Array.isArray(extraProducts)) {
    for (const p of extraProducts) {
      const s = p?.supplier?.trim();
      if (s && s.length >= 2 && !['fornecedor local', 'fornecedor', 'local'].includes(s.toLowerCase())) {
        set.add(s);
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
            set.add(s);
          }
        }
      }
    }
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
