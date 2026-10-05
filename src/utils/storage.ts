import { ClientCompany, ClientContact, CompanySettings, IncomingEmail, Product, Quote, QuoteItem } from '../types';
import { defaultCompanySettings, initialClientCompanies, initialEmails, initialProducts, initialSentQuotes } from './mockData';
import { normalizeSearchText, normalizeToOfficialCategory } from './aiEmailParser';
import { 
  syncRegisteredMetadataToSupabase, 
  syncClientCompaniesToSupabase,
  syncCompanySettingsToSupabase,
  syncBatchProductsToSupabase,
  syncIncomingEmailsToSupabase,
  syncQuoteToSupabase,
  syncDirectPurchasesToSupabase,
  deleteDirectPurchaseFromSupabase,
  syncPaymentMethodsToSupabase,
  deleteCategoryFromSupabase,
  deleteUnitFromSupabase,
  deletePaymentMethodFromSupabase
} from '../services/supabase';

const SETTINGS_KEY = 'infodesk_settings';
const PRODUCTS_KEY = 'infodesk_products';
const EMAILS_KEY = 'infodesk_emails';
const QUOTES_KEY = 'infodesk_quotes';
const CLIENT_COMPANIES_KEY = 'infodesk_client_companies';
const CURRENT_DRAFT_QUOTE_KEY = 'infodesk_current_draft_quote';
const ACTIVE_TAB_KEY = 'infodesk_active_tab';
const MANUAL_ANALYSES_KEY = 'infodesk_manual_analyses';
const DELETED_QUOTE_CODES_KEY = 'infodesk_deleted_quote_codes';

const CURRENT_CACHE_VERSION = '2026-10-01-v3';
const CACHE_VERSION_KEY = 'infodesk_cache_version';

export const ensureFreshCacheVersion = (): void => {
  try {
    const saved = localStorage.getItem(CACHE_VERSION_KEY);
    if (saved !== CURRENT_CACHE_VERSION) {
      // Limpa dados legados e tombstones antigos do cache local para alinhar 100% com a nuvem
      localStorage.removeItem('infodesk_deleted_products');
      localStorage.removeItem('infodesk_products');
      localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION);
      console.log('[Storage] Cache version atualizada: alinhamento com Supabase realizado.');
    }
  } catch { /* noop */ }
};

ensureFreshCacheVersion();

export const isBlockedOrTestQuote = (q: { code?: string; clientCompany?: string; id?: string } | null | undefined): boolean => {
  if (!q) return true;
  const code = (q.code || '').trim().toLowerCase();
  const comp = (q.clientCompany || '').trim().toLowerCase();
  
  if (code.includes('empresa teste') || comp.includes('empresa teste')) return true;
  if (code.includes('teste alpha') || code.includes('teste beta')) return true;
  if (code === 'interativa 240826' || code === 'cnc 280826') return true;
  if (q.id === 'quote-interativa-01' || q.id === 'quote-cnc-01') return true;
  return false;
};

export const getDeletedQuoteCodes = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DELETED_QUOTE_CODES_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const set = new Set(arr.map((c: string) => String(c).trim().toUpperCase()));
        set.add('EMPRESA TESTE ALPHA 190926');
        set.add('EMPRESA TESTE BETA 190926');
        set.add('INTERATIVA 240826');
        set.add('CNC 280826');
        return set;
      }
    }
  } catch { /* noop */ }
  const defaultSet = new Set<string>();
  defaultSet.add('EMPRESA TESTE ALPHA 190926');
  defaultSet.add('EMPRESA TESTE BETA 190926');
  defaultSet.add('INTERATIVA 240826');
  defaultSet.add('CNC 280826');
  return defaultSet;
};

export const recordDeletedQuoteCode = (quoteCode: string): void => {
  if (!quoteCode) return;
  try {
    const set = getDeletedQuoteCodes();
    set.add(quoteCode.trim().toUpperCase());
    localStorage.setItem(DELETED_QUOTE_CODES_KEY, JSON.stringify(Array.from(set)));
  } catch { /* noop */ }
};

/**
 * Limpeza preventiva inteligente para evitar QuotaExceededError no localStorage.
 * Remove chaves de backup redundantes e caches antigos sem perder dados do usuário.
 */
export const pruneLocalStorage = (): void => {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('infodesk_backup_items_') || k.startsWith('infodesk_price_cache_'))) {
        keysToRemove.push(k);
      }
    }
    // Remove backups redundantes para liberar blocos de megabytes
    keysToRemove.forEach(k => {
      try { localStorage.removeItem(k); } catch { /* noop */ }
    });
    console.warn(`[Storage] Limpeza preventiva executada: ${keysToRemove.length} chaves obsoletas liberadas.`);
  } catch (e) {
    console.error('Falha ao executar pruneLocalStorage:', e);
  }
};

export const getCurrentDraftQuote = (): Quote | null => {
  try {
    const saved = localStorage.getItem(CURRENT_DRAFT_QUOTE_KEY) || sessionStorage.getItem(CURRENT_DRAFT_QUOTE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        if (isBlockedOrTestQuote(parsed) || getDeletedQuoteCodes().has((parsed.code || '').trim().toUpperCase())) {
          localStorage.removeItem(CURRENT_DRAFT_QUOTE_KEY);
          sessionStorage.removeItem(CURRENT_DRAFT_QUOTE_KEY);
          return null;
        }
        if (Array.isArray(parsed.items)) {
          if (!parsed.openingText || parsed.openingText.trim() === 'Em atenção...' || parsed.openingText.trim() === 'Em atenção' || parsed.openingText.trim().startsWith('Em atenção ao que foi solicitado')) {
            parsed.openingText = defaultCompanySettings.defaultOpeningText;
          }
        if (!parsed.paymentTerms || parsed.paymentTerms.trim() === '30 dias' || parsed.paymentTerms.trim() === '30 dias.') {
          parsed.paymentTerms = 'Faturado.';
        }
        if (!parsed.warrantyTerms || parsed.warrantyTerms.includes('12 (doze) meses') || parsed.warrantyTerms.includes('contra eventuais problemas')) {
          parsed.warrantyTerms = '06 (seis) meses balcão para defeitos de fabricação.';
        }
        if (parsed.globalMarkupPercent === undefined || parsed.globalMarkupPercent === 35 || parsed.globalMarkupPercent === 20 || parsed.globalMarkupPercent === 25) {
          parsed.globalMarkupPercent = 23.5;
        }
        if (!parsed.subject || parsed.subject.trim() === 'Orçamento diversos' || parsed.subject.trim() === 'Fornecimento de Materiais e Equipamentos' || parsed.subject.trim() === 'Fornecimento de produtos para informática') {
          parsed.subject = 'Fornecimento de Materiais';
        }
          return parsed;
        }
      }
    }
  } catch (e) {
    console.error('Erro ao recuperar rascunho de cotação:', e);
  }
  return null;
};

let draftSyncTimer: any = null;
export const syncDraftQuoteDebounced = (_quote: Quote): void => {
  if (draftSyncTimer) clearTimeout(draftSyncTimer);
  // DESATIVADO: Nunca sincronizar rascunhos temporários de digitação para o Supabase!
  // O Supabase armazena exclusivamente cotações que o usuário explicitamente salvou (handleSaveQuote, handleSaveAsNewQuote, handleSendQuote, handleDuplicateQuote).
  // O rascunho de tela fica restrito ao localStorage para recuperação instantânea contra F5/queda de conexão.
};

export const saveCurrentDraftQuote = (quote: Quote | null): void => {
  if (!quote || isBlockedOrTestQuote(quote) || getDeletedQuoteCodes().has((quote.code || '').trim().toUpperCase())) {
    try {
      localStorage.removeItem(CURRENT_DRAFT_QUOTE_KEY);
      sessionStorage.removeItem(CURRENT_DRAFT_QUOTE_KEY);
    } catch { /* noop */ }
    return;
  }

  const serialized = JSON.stringify(quote);

  try {
    localStorage.setItem(CURRENT_DRAFT_QUOTE_KEY, serialized);
  } catch (err: any) {
    console.warn('Quota excedida ao salvar rascunho. Executando limpeza automática...', err);
    pruneLocalStorage();
    try {
      localStorage.setItem(CURRENT_DRAFT_QUOTE_KEY, serialized);
    } catch (retryErr) {
      // Fallback resiliente: salva versão preservando todos os dados comerciais e removendo apenas imagens base64 pesadas (>5KB)
      try {
        const lightweightQuote: Quote = {
          ...quote,
          items: (quote.items || []).map(item => ({
            ...item,
            imageUrl: (item.imageUrl && item.imageUrl.startsWith('data:') && item.imageUrl.length > 5000) ? '' : item.imageUrl
          }))
        };
        localStorage.setItem(CURRENT_DRAFT_QUOTE_KEY, JSON.stringify(lightweightQuote));
      } catch (stripErr) {
        console.warn('Persistindo rascunho no sessionStorage como fallback de segurança.', stripErr);
        try {
          sessionStorage.setItem(CURRENT_DRAFT_QUOTE_KEY, serialized);
        } catch (sessionErr) {
          console.error('Falha final ao salvar rascunho no sessionStorage:', sessionErr);
        }
      }
    }
  }

  if (quote.items && quote.items.length > 0) {
    try {
      if (quote.code) saveQuoteItemsBackup(quote.code, quote.items);
      if (quote.id) saveQuoteItemsBackup(quote.id, quote.items);
    } catch {
      // Ignora erro de backup secundário
    }
  }
};

export const saveQuoteItemsBackup = (key: string, items: QuoteItem[]): void => {
  if (!key || !Array.isArray(items) || items.length === 0) return;
  try {
    const cleanKey = key.trim().replace(/\s+/g, '_').toUpperCase();
    localStorage.setItem(`infodesk_backup_items_${cleanKey}`, JSON.stringify(items));
  } catch (e) {
    console.warn('Quota excedida ao salvar backup de itens. Ignorando para não travar a aplicação.');
  }
};

export const getQuoteItemsBackup = (key: string): QuoteItem[] | null => {
  if (!key) return null;
  try {
    const cleanKey = key.trim().replace(/\s+/g, '_').toUpperCase();
    const saved = localStorage.getItem(`infodesk_backup_items_${cleanKey}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Erro ao ler backup de itens:', e);
  }
  return null;
};

export const getSavedActiveTab = (defaultTab: string = 'inbox'): string => {
  try {
    const saved = localStorage.getItem(ACTIVE_TAB_KEY);
    return saved && ['inbox', 'builder', 'preview', 'catalog', 'history', 'websearch', 'analyses', 'clients', 'dashboard'].includes(saved) ? saved : defaultTab;
  } catch {
    return defaultTab;
  }
};

export const saveActiveTab = (tab: string): void => {
  try {
    localStorage.setItem(ACTIVE_TAB_KEY, tab);
  } catch (e) {
    console.warn('Erro ao salvar aba ativa no localStorage:', e);
  }
};

// ─── Análises Avulsas (emails de foto/texto colados — ficam separados do inbox) ───

export const getManualAnalyses = (): IncomingEmail[] => {
  try {
    const saved = localStorage.getItem(MANUAL_ANALYSES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed.map(sanitizeEmailObject);
    }
  } catch (e) {
    console.warn('Erro ao carregar análises avulsas:', e);
  }
  return [];
};

export const saveManualAnalyses = (analyses: IncomingEmail[]): void => {
  if (!analyses || !Array.isArray(analyses)) return;
  try {
    // Máximo 100 análises; imagens base64 são mantidas pois são o conteúdo principal
    const trimmed = analyses.slice(0, 100);
    localStorage.setItem(MANUAL_ANALYSES_KEY, JSON.stringify(trimmed));
  } catch (quotaErr) {
    console.warn('Quota localStorage atingida ao salvar análises avulsas. Removendo imagens base64...', quotaErr);
    try {
      const noImages = analyses.slice(0, 100).map(e => ({
        ...e,
        bodyHtml: e.bodyHtml?.replace(/src=["']data:image\/[^;]+;base64,[^"']{100,}["']/gi, 'src="" alt="[imagem]"')
      }));
      localStorage.setItem(MANUAL_ANALYSES_KEY, JSON.stringify(noImages));
    } catch (e2) {
      console.error('Não foi possível salvar análises avulsas:', e2);
    }
  }
};

export const getSettings = (): CompanySettings => {
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (saved) {
    try { 
      const parsed = { ...defaultCompanySettings, ...JSON.parse(saved) };
      if (!parsed.defaultOpeningText || parsed.defaultOpeningText.trim() === 'Em atenção...' || parsed.defaultOpeningText.trim() === 'Em atenção' || parsed.defaultOpeningText.trim().startsWith('Em atenção ao que foi solicitado')) {
        parsed.defaultOpeningText = defaultCompanySettings.defaultOpeningText;
      }
      if (!parsed.defaultPaymentTerms || parsed.defaultPaymentTerms.trim() === '30 dias' || parsed.defaultPaymentTerms.trim() === '30 dias.') {
        parsed.defaultPaymentTerms = 'Faturado.';
      }
      if (!parsed.defaultWarrantyTerms || parsed.defaultWarrantyTerms.includes('contra eventuais problemas de fabricação') || parsed.defaultWarrantyTerms.includes('12 (doze) meses')) {
        parsed.defaultWarrantyTerms = defaultCompanySettings.defaultWarrantyTerms;
      }
      if (parsed.defaultMarkupPercent === undefined || parsed.defaultMarkupPercent === 35 || parsed.defaultMarkupPercent === 20 || parsed.defaultMarkupPercent === 25) {
        parsed.defaultMarkupPercent = 23.5;
      }
      if (!parsed.email || parsed.email.includes('infodesk.com.br')) {
        parsed.email = 'lucas@infodesk.net.br';
      }
      if (!parsed.googleAccountEmail || parsed.googleAccountEmail.includes('infodesk.com.br')) {
        parsed.googleAccountEmail = 'lucas@infodesk.net.br';
      }
      if (!parsed.dailyDollarRate || isNaN(Number(parsed.dailyDollarRate)) || Number(parsed.dailyDollarRate) <= 0) {
        parsed.dailyDollarRate = defaultCompanySettings.dailyDollarRate || 5.60;
      }
      return parsed;
    } catch (e) { console.error(e); }
  }
  return defaultCompanySettings;
};

export const saveSettings = (settings: CompanySettings, syncToCloud: boolean = false): void => {
  const cleanEmail = (settings.email || 'lucas@infodesk.net.br').toLowerCase().trim().replace('@infodesk.com.br', '@infodesk.net.br');
  const cleanGoogleEmail = (settings.googleAccountEmail || cleanEmail || 'lucas@infodesk.net.br').toLowerCase().trim().replace('@infodesk.com.br', '@infodesk.net.br');
  const normalized: CompanySettings = {
    ...settings,
    defaultPaymentTerms: (!settings.defaultPaymentTerms || settings.defaultPaymentTerms.trim() === '30 dias' || settings.defaultPaymentTerms.trim() === '30 dias.') ? 'Faturado.' : settings.defaultPaymentTerms,
    defaultWarrantyTerms: (!settings.defaultWarrantyTerms || settings.defaultWarrantyTerms.includes('12 (doze) meses') || settings.defaultWarrantyTerms.includes('contra eventuais problemas')) ? '06 (seis) meses balcão para defeitos de fabricação.' : settings.defaultWarrantyTerms,
    defaultMarkupPercent: (settings.defaultMarkupPercent === undefined || settings.defaultMarkupPercent === 35 || settings.defaultMarkupPercent === 20 || settings.defaultMarkupPercent === 25) ? 23.5 : settings.defaultMarkupPercent,
    email: cleanEmail,
    googleAccountEmail: cleanGoogleEmail,
    dailyDollarRate: Number(settings.dailyDollarRate) > 0 ? Number(settings.dailyDollarRate) : 5.60
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.warn('[Storage] Quota excedida ao salvar configurações. Pruning...', err);
    pruneLocalStorage();
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
    } catch (e2) {
      console.error('[Storage] Falha ao salvar configurações no localStorage:', e2);
    }
  }

  // Apenas sincroniza com a nuvem quando explicitamente solicitado (ex: ao salvar no formulário)
  // Isso evita que renderizações iniciais locais sobrescrevam os dados reais do Supabase
  if (syncToCloud) {
    syncCompanySettingsToSupabase(normalized).catch(err => {
      console.warn('[Storage] Erro ao sincronizar configurações no Supabase:', err);
    });
  }
};

const MOCK_SKUS_SET = new Set([
  'tra-plu-01',
  'del-mon-27',
  'log-mxk-01',
  'apc-nob-1500',
  'kng-ssd-1tb',
  'fur-cab-cat6',
  'cis-sw-24p'
]);

/**
 * Deduplica rigorosamente uma lista de produtos unificando por:
 * 1. ID único (se presente)
 * 2. Part Number oficial (mínimo 3 caracteres)
 * 3. SKU oficial
 * 4. Nome normalizado do produto (sempre mantendo e enriquecendo o registro mais completo)
 */
export const deduplicateProductsList = (products: Product[]): Product[] => {
  if (!products || !Array.isArray(products) || products.length === 0) return [];

  const seenIds = new Set<string>();
  const seenSkus = new Set<string>();
  const seenPartNumbers = new Set<string>();
  const seenNames = new Set<string>();
  const result: Product[] = [];

  for (const p of products) {
    if (!p || !p.name) continue;

    const idKey = (p.id || '').trim();
    const rawSku = (p.sku || '').trim().toLowerCase();
    const rawPn = (p.partNumber || '').trim().toLowerCase();
    const cleanSkuAlphaNum = rawSku.replace(/[^a-z0-9]/gi, '');
    const cleanPnAlphaNum = rawPn.replace(/[^a-z0-9]/gi, '');
    const normName = normalizeSearchText(p.name);

    // Ignora mock SKUs antigos
    if (rawSku && MOCK_SKUS_SET.has(rawSku)) continue;

    const isIdDuplicate = Boolean(idKey && seenIds.has(idKey));
    const isPnDuplicate = Boolean(rawPn && rawPn.length >= 3 && seenPartNumbers.has(rawPn));
    const isSkuDuplicate = Boolean(rawSku && !rawSku.startsWith('inf-auto-') && !rawSku.startsWith('sku-') && seenSkus.has(rawSku));
    const isNameDuplicate = Boolean(normName && normName.length >= 3 && seenNames.has(normName));

    // Busca se já existe um produto equivalente: funde para preservar o mais completo
    const existingIdx = result.findIndex(ex => {
      const exId = (ex.id || '').trim();
      const exPn = (ex.partNumber || '').trim().toLowerCase();
      const exSku = (ex.sku || '').trim().toLowerCase();
      const exName = normalizeSearchText(ex.name);
      const exCleanSku = exSku.replace(/[^a-z0-9]/gi, '');
      const exCleanPn = exPn.replace(/[^a-z0-9]/gi, '');

      const matchId = Boolean(idKey && exId && exId === idKey);
      const matchPn = Boolean(rawPn && rawPn.length >= 3 && exPn && exPn === rawPn);
      const matchCleanPn = Boolean(cleanPnAlphaNum && cleanPnAlphaNum.length >= 3 && exCleanPn && exCleanPn === cleanPnAlphaNum);
      const matchSku = Boolean(rawSku && !rawSku.startsWith('inf-auto-') && !rawSku.startsWith('sku-') && exSku && exSku === rawSku);
      const matchCleanSku = Boolean(cleanSkuAlphaNum && cleanSkuAlphaNum.length >= 3 && !cleanSkuAlphaNum.startsWith('infauto') && exCleanSku && exCleanSku === cleanSkuAlphaNum);
      const matchName = Boolean(normName && normName.length >= 3 && exName && exName === normName);

      return matchId || matchPn || matchCleanPn || matchSku || matchCleanSku || matchName;
    });

    if (existingIdx >= 0) {
      const existing = result[existingIdx];
      const pTime = p.lastUpdated ? new Date(p.lastUpdated).getTime() : 0;
      const exTime = existing.lastUpdated ? new Date(existing.lastUpdated).getTime() : 0;
      const isPNewer = pTime >= exTime;

      const chosenCategory = (isPNewer && p.category)
        ? normalizeToOfficialCategory(p.category)
        : (existing.category ? normalizeToOfficialCategory(existing.category) : normalizeToOfficialCategory(p.category || 'Diversos & Sazonais'));

      const chosenLastUpdated = (isPNewer && p.lastUpdated)
        ? p.lastUpdated
        : (existing.lastUpdated || p.lastUpdated || new Date().toISOString());

      result[existingIdx] = {
        ...existing,
        ...p,
        name: (isPNewer && p.name ? p.name : (p.name || existing.name || '')).trim(),
        description: (p.description !== undefined && p.description !== null && p.description.trim() !== '') 
          ? p.description.trim() 
          : (existing.description || ''),
        partNumber: (p.partNumber !== undefined && p.partNumber !== null && p.partNumber.trim() !== '')
          ? p.partNumber.trim()
          : (existing.partNumber || ''),
        sku: (p.sku !== undefined && p.sku !== null && p.sku.trim() !== '')
          ? p.sku.trim()
          : (existing.sku || ''),
        ncm: (p.ncm !== undefined && p.ncm !== null && p.ncm.trim() !== '')
          ? p.ncm.trim()
          : (existing.ncm || ''),
        imageUrl: (p.imageUrl !== undefined && p.imageUrl !== null && p.imageUrl.trim() !== '')
          ? p.imageUrl.trim()
          : (existing.imageUrl || ''),
        sourceUrl: (p.sourceUrl !== undefined && p.sourceUrl !== null && p.sourceUrl.trim() !== '')
          ? p.sourceUrl.trim()
          : (existing.sourceUrl || ''),
        supplier: (p.supplier !== undefined && p.supplier !== null && p.supplier.trim() !== '')
          ? p.supplier.trim()
          : (existing.supplier || ''),
        category: chosenCategory,
        costPrice: Number(p.costPrice) > 0 ? Number(p.costPrice) : (Number(existing.costPrice) || 0),
        unit: p.unit || existing.unit || 'Un.',
        stock: p.stock !== undefined ? Number(p.stock) : (existing.stock ?? 10),
        lastUpdated: chosenLastUpdated
      };
      continue;
    }

    if (idKey) seenIds.add(idKey);
    if (rawPn && rawPn.length >= 3) seenPartNumbers.add(rawPn);
    if (rawSku) seenSkus.add(rawSku);
    if (normName && normName.length >= 3) seenNames.add(normName);

    result.push({
      ...p,
      category: normalizeToOfficialCategory(p.category)
    });
  }

  return result;
};

/**
 * Realiza a mesclagem bidirecional inteligente entre produtos remotos (Supabase)
 * e o cache local (localStorage), garantindo que modificações feitas localmente
 * (como troca de categoria, preços ou dados) NUNCA sejam sobrescritas por um dado remoto mais antigo.
 */
export const mergeRemoteProductsWithLocal = (remote: Product[], local: Product[]): Product[] => {
  if (!remote || !Array.isArray(remote) || remote.length === 0) return local || [];
  if (!local || !Array.isArray(local) || local.length === 0) return deduplicateProductsList(remote).filter(p => !isProductDeleted(p));

  const localMap = new Map<string, Product>();
  const localPnMap = new Map<string, Product>();
  const localSkuMap = new Map<string, Product>();
  const localNameMap = new Map<string, Product>();

  for (const lp of local) {
    if (!lp) continue;
    if (lp.id) localMap.set(lp.id, lp);
    const pn = (lp.partNumber || '').trim().toLowerCase();
    if (pn && pn.length >= 3) localPnMap.set(pn, lp);
    const sku = (lp.sku || '').trim().toLowerCase();
    if (sku && !sku.startsWith('inf-auto-')) localSkuMap.set(sku, lp);
    const name = normalizeSearchText(lp.name);
    if (name && name.length >= 3) localNameMap.set(name, lp);
  }

  const mergedRemotes = remote.map(rp => {
    if (!rp) return rp;
    const rpPn = (rp.partNumber || '').trim().toLowerCase();
    const rpSku = (rp.sku || '').trim().toLowerCase();
    const rpName = normalizeSearchText(rp.name);

    const localMatch = localMap.get(rp.id) ||
      (rpPn && rpPn.length >= 3 ? localPnMap.get(rpPn) : undefined) ||
      (rpSku && !rpSku.startsWith('inf-auto-') ? localSkuMap.get(rpSku) : undefined) ||
      (rpName && rpName.length >= 3 ? localNameMap.get(rpName) : undefined);

    if (!localMatch) return rp;

    const localTime = localMatch.lastUpdated ? new Date(localMatch.lastUpdated).getTime() : 0;
    const remoteTime = rp.lastUpdated ? new Date(rp.lastUpdated).getTime() : 0;

    // Se o produto local for mais recente (ou tiver sido modificado recentemente), preserva a versão local!
    if (localTime > remoteTime) {
      return {
        ...rp,
        ...localMatch,
        category: localMatch.category ? normalizeToOfficialCategory(localMatch.category) : normalizeToOfficialCategory(rp.category),
        lastUpdated: localMatch.lastUpdated
      };
    }

    return rp;
  });

  // Também inclui produtos que existem apenas localmente
  const remoteIds = new Set(remote.map(r => r.id).filter(Boolean));
  const remotePns = new Set(remote.map(r => (r.partNumber || '').trim().toLowerCase()).filter(p => p.length >= 3));
  const remoteSkus = new Set(remote.map(r => (r.sku || '').trim().toLowerCase()).filter(s => !s.startsWith('inf-auto-')));
  const remoteNames = new Set(remote.map(r => normalizeSearchText(r.name)).filter(n => n.length >= 3));

  const localOnly = local.filter(lp => {
    if (!lp || isProductDeleted(lp)) return false;
    const lpPn = (lp.partNumber || '').trim().toLowerCase();
    const lpSku = (lp.sku || '').trim().toLowerCase();
    const lpName = normalizeSearchText(lp.name);

    const hasId = lp.id && remoteIds.has(lp.id);
    const hasPn = lpPn && lpPn.length >= 3 && remotePns.has(lpPn);
    const hasSku = lpSku && !lpSku.startsWith('inf-auto-') && remoteSkus.has(lpSku);
    const hasName = lpName && lpName.length >= 3 && remoteNames.has(lpName);

    return !hasId && !hasPn && !hasSku && !hasName;
  });

  return deduplicateProductsList([...mergedRemotes, ...localOnly]).filter(p => !isProductDeleted(p));
};

// ==========================================
// CONTROLE DE PRODUTOS DELETADOS (TOMBSTONES)
// ==========================================
const DELETED_PRODUCTS_KEY = 'infodesk_deleted_products';

export const getDeletedProductIdentifiers = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DELETED_PRODUCTS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.map((s: string) => String(s).toLowerCase().trim()));
    }
  } catch { /* noop */ }
  return new Set();
};

export const recordDeletedProduct = (product: Product | { id?: string; name?: string; sku?: string; partNumber?: string }): void => {
  if (!product) return;
  try {
    const set = getDeletedProductIdentifiers();
    if (product.id) set.add(product.id.toLowerCase().trim());
    if (product.sku) set.add(product.sku.toLowerCase().trim());
    if (product.partNumber) set.add(product.partNumber.toLowerCase().trim());
    if (product.name) {
      set.add(product.name.toLowerCase().trim());
      set.add(normalizeSearchText(product.name));
    }
    localStorage.setItem(DELETED_PRODUCTS_KEY, JSON.stringify(Array.from(set)));
  } catch { /* noop */ }
};

export const unrecordDeletedProduct = (product: Product | { id?: string; name?: string; sku?: string; partNumber?: string }): void => {
  if (!product) return;
  try {
    const set = getDeletedProductIdentifiers();
    if (product.id) set.delete(product.id.toLowerCase().trim());
    if (product.sku) set.delete(product.sku.toLowerCase().trim());
    if (product.partNumber) set.delete(product.partNumber.toLowerCase().trim());
    if (product.name) {
      set.delete(product.name.toLowerCase().trim());
      set.delete(normalizeSearchText(product.name));
    }
    localStorage.setItem(DELETED_PRODUCTS_KEY, JSON.stringify(Array.from(set)));
  } catch { /* noop */ }
};

export const isProductDeleted = (product: Product): boolean => {
  if (!product) return false;
  const set = getDeletedProductIdentifiers();
  if (set.size === 0) return false;

  if (product.id && set.has(product.id.toLowerCase().trim())) return true;
  if (product.sku && set.has(product.sku.toLowerCase().trim())) return true;
  if (product.partNumber && set.has(product.partNumber.toLowerCase().trim())) return true;
  if (product.name) {
    if (set.has(product.name.toLowerCase().trim())) return true;
    if (set.has(normalizeSearchText(product.name))) return true;
  }
  return false;
};

export const clearDeletedProducts = (): void => {
  try {
    localStorage.removeItem(DELETED_PRODUCTS_KEY);
  } catch { /* noop */ }
};

export const getProducts = (): Product[] => {
  const saved = localStorage.getItem(PRODUCTS_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return deduplicateProductsList(parsed).filter(p => !isProductDeleted(p));
      }
    } catch (e) { console.error(e); }
  }
  return [];
};

export const saveProducts = (products: Product[]): void => {
  if (!products || !Array.isArray(products)) return;

  const deduped = deduplicateProductsList(products).filter(p => !isProductDeleted(p));

  try {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(deduped));
  } catch (quotaErr) {
    console.warn('[Storage] Quota excedida ao salvar produtos. Executando limpeza preventiva...', quotaErr);
    pruneLocalStorage();

    try {
      localStorage.setItem(PRODUCTS_KEY, JSON.stringify(deduped));
    } catch (retryErr) {
      console.warn('[Storage] Quota ainda excedida. Aplicando higienização de fotos base64 do catálogo...', retryErr);

      // Nível 3: Remove imagens base64 volumosas (> 30KB) para salvar no localStorage sem crash
      const lightweight = deduped.map(p => {
        if (p.imageUrl && p.imageUrl.startsWith('data:image/') && p.imageUrl.length > 30000) {
          return { ...p, imageUrl: '' };
        }
        return p;
      });

      try {
        localStorage.setItem(PRODUCTS_KEY, JSON.stringify(lightweight));
      } catch (err3) {
        console.warn('[Storage] Tentando salvar apenas os 100 produtos mais recentes...', err3);
        const minimal = lightweight.slice(0, 100);
        try {
          localStorage.setItem(PRODUCTS_KEY, JSON.stringify(minimal));
        } catch (errFinal) {
          console.error('[Storage] Falha ao persistir produtos no localStorage. Dados preservados em memória/Supabase:', errFinal);
        }
      }
    }
  }

  // Cloud-First: Sincroniza imediatamente o lote de produtos no Supabase
  syncBatchProductsToSupabase(deduped).catch(err => {
    console.warn('[Storage] Erro ao sincronizar lote de produtos no Supabase:', err);
  });
};

export const sanitizeEmailObject = (e: any): IncomingEmail => {
  return {
    id: String(e?.id || `mail-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`),
    senderName: String(e?.senderName || 'Cliente / Solicitante'),
    senderEmail: String(e?.senderEmail || 'cliente@empresa.com.br').toLowerCase().trim(),
    senderCompany: String(e?.senderCompany || 'Empresa / Solicitante'),
    subject: String(e?.subject || '(Sem Assunto)'),
    date: String(e?.date || 'Recente'),
    snippet: String(e?.snippet || ''),
    body: String(e?.body || ''),
    bodyHtml: typeof e?.bodyHtml === 'string' ? e.bodyHtml : undefined,
    senderPhone: e?.senderPhone ? String(e.senderPhone) : '',
    deliveryLocation: e?.deliveryLocation ? String(e.deliveryLocation) : 'Brasília - DF',
    unread: Boolean(e?.unread),
    status: ['new', 'parsed', 'quoted', 'ignored'].includes(e?.status) ? e.status : 'new',
    suggestedItems: Array.isArray(e?.suggestedItems)
      ? e.suggestedItems.filter(Boolean).map((it: any) => {
          const rawName = String(it?.name || 'Item Solicitado').trim();
          const rawDesc = String(it?.description || '').trim();
          let unifiedName = rawName;
          if (rawDesc && rawDesc !== rawName && !rawName.toLowerCase().includes(rawDesc.toLowerCase())) {
            unifiedName = `${rawName} — ${rawDesc}`;
          }
          return {
            name: unifiedName,
            description: '',
            rawSearchQuery: String(it?.rawSearchQuery || unifiedName),
            partNumber: it?.partNumber ? String(it.partNumber) : undefined,
            itemCode: it?.itemCode ? String(it.itemCode) : undefined,
            ncm: it?.ncm ? String(it.ncm) : undefined,
            imageUrl: it?.imageUrl ? String(it.imageUrl) : undefined,
            quantity: Number(it?.quantity) > 0 ? Number(it.quantity) : 1,
            unit: String(it?.unit || 'Un.'),
            estimatedCost: it?.estimatedCost !== undefined ? Number(it.estimatedCost) : undefined,
            sourceUrl: it?.sourceUrl ? String(it.sourceUrl) : undefined
          };
        })
      : []
  };
};

function stripHeavyDataUrls(html?: string): string | undefined {
  if (!html) return undefined;
  // Substitui dados pesados de imagens em base64 (> 100 caracteres) por marcador leve
  return html.replace(/src=["']data:image\/[^;]+;base64,[^"']{100,}["']/gi, 'src="" alt="[imagem]"');
}

export const getEmails = (): IncomingEmail[] => {
  try {
    const saved = localStorage.getItem(EMAILS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.map(sanitizeEmailObject);
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar infodesk_emails do localStorage:', e);
  }
  return initialEmails.map(sanitizeEmailObject);
};

export const saveEmails = (emails: IncomingEmail[]): void => {
  if (!emails || !Array.isArray(emails)) return;

  try {
    // 1. Prepara lista leve (máximo 40 e-mails recentes, sem imagens base64 e texto de corpo limitado)
    const lightweight = emails.slice(0, 40).map(e => {
      const sanitized = sanitizeEmailObject(e);
      return {
        ...sanitized,
        senderEmail: (sanitized.senderEmail || '').toLowerCase().trim(),
        bodyHtml: stripHeavyDataUrls(sanitized.bodyHtml),
        body: (sanitized.body || '').slice(0, 40000)
      };
    });

    try {
      localStorage.setItem(EMAILS_KEY, JSON.stringify(lightweight));
    } catch (quotaErr) {
      console.warn('Limite de quota do localStorage atingido ao salvar e-mails. Aplicando compressão nível 1...', quotaErr);

      // Fallback 1: Remove bodyHtml completamente de todos os e-mails
      const noHtml = lightweight.map(e => ({ ...e, bodyHtml: undefined }));
      try {
        localStorage.setItem(EMAILS_KEY, JSON.stringify(noHtml));
      } catch (quotaErr2) {
        console.warn('Limite de quota do localStorage ainda atingido. Aplicando compressão nível 2...', quotaErr2);
        // Fallback 2: Mantém apenas os 20 e-mails mais recentes com corpo de 10kb
        const compact = noHtml.slice(0, 20).map(e => ({
          ...e,
          body: (e.body || '').slice(0, 10000)
        }));
        try {
          localStorage.setItem(EMAILS_KEY, JSON.stringify(compact));
        } catch (quotaErr3) {
          console.error('Quota do navegador esgotada. Os e-mails serão mantidos em memória:', quotaErr3);
        }
      }
    }
  } catch (err) {
    console.error('Erro ao processar saveEmails:', err);
  }

  // Cloud-First: Sincroniza imediatamente com o Supabase
  syncIncomingEmailsToSupabase(emails).catch(err => {
    console.warn('[Storage] Erro ao sincronizar e-mails no Supabase:', err);
  });
};

export const getQuotes = (): Quote[] => {
  try {
    const deletedCodes = getDeletedQuoteCodes();
    const saved = localStorage.getItem(QUOTES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.filter(q => !isBlockedOrTestQuote(q) && !deletedCodes.has((q.code || '').trim().toUpperCase()));
      }
    }
  } catch (e) {
    console.error(e);
  }
  return [];
};

function safeEmailString(val: any): string | undefined {
  if (!val) return undefined;
  if (Array.isArray(val)) {
    const s = val.map(x => String(x || '').trim().toLowerCase()).filter(Boolean).join(', ');
    return s || undefined;
  }
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    return s || undefined;
  }
  return undefined;
}

export const saveQuotes = (quotes: Quote[]): void => {
  try {
    const deletedCodes = getDeletedQuoteCodes();
    const normalized = quotes
      .filter(q => !isBlockedOrTestQuote(q) && !deletedCodes.has((q.code || '').trim().toUpperCase()))
      .map(q => ({
        ...q,
        clientEmail: (q.clientEmail || '').toLowerCase().trim(),
        recipientEmails: safeEmailString(q.recipientEmails),
        ccEmails: safeEmailString(q.ccEmails)
      }));
    try {
      localStorage.setItem(QUOTES_KEY, JSON.stringify(normalized));
      // Indexa imediatamente todas as compras realizadas em LOTE único de alto desempenho
      const purchasedRecords: ProcurementPurchaseRecord[] = [];
      normalized.forEach(q => {
        (q.items || []).forEach(it => {
          if (it.purchaseStatus === 'purchased' || it.purchaseStatus === 'delivered') {
            purchasedRecords.push({
              itemId: it.id,
              itemNumber: it.itemNumber,
              quoteId: q.id,
              quoteCode: q.code,
              name: it.name,
              purchaseStatus: it.purchaseStatus,
              actualCostPrice: it.actualCostPrice,
              actualUnitCostPrice: it.actualUnitCostPrice,
              actualPurchaseUrl: it.actualPurchaseUrl,
              actualShippingCost: it.actualShippingCost,
              shippingPending: it.shippingPending,
              paymentMethod: it.paymentMethod,
              purchasedAt: it.purchasedAt,
              purchaseNotes: it.purchaseNotes,
              actualTaxPercent: it.actualTaxPercent
            });
          }
        });
      });
      if (purchasedRecords.length > 0) {
        savePurchasedProcurementRecordsBatch(purchasedRecords);
      }
    } catch (quotaErr) {
      console.warn('Quota excedida ao salvar propostas. Executando limpeza automática...', quotaErr);
      pruneLocalStorage();
      try {
        localStorage.setItem(QUOTES_KEY, JSON.stringify(normalized));
      } catch (retryErr) {
        console.warn('Não foi possível persistir todas as propostas no localStorage:', retryErr);
      }
    }
  } catch (err) {
    console.warn('Erro ao salvar propostas no localStorage:', err);
  }
};

const COMPANY_PREFIXES_KEY = 'infodesk_company_prefixes';

export const getCompanyPrefixesMap = (): Record<string, 'À' | 'Ao'> => {
  try {
    const saved = localStorage.getItem(COMPANY_PREFIXES_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

export const saveCompanyPrefixPreference = (id: string, name: string, prefix: 'À' | 'Ao'): void => {
  try {
    const map = getCompanyPrefixesMap();
    if (id) map[id] = prefix;
    if (name) {
      const clean = name.replace(/^(ao|à|a|para)\s+/i, '').trim().toLowerCase();
      map[clean] = prefix;
    }
    localStorage.setItem(COMPANY_PREFIXES_KEY, JSON.stringify(map));
  } catch { /* noop */ }
};

const DELETED_CONTACT_IDS_KEY = 'infodesk_deleted_contact_ids';
const DELETED_COMPANY_IDS_KEY = 'infodesk_deleted_company_ids';

export const isBlockedOrTestCompany = (comp: { id?: string; name?: string } | null | undefined): boolean => {
  if (!comp || !comp.name) return true;
  if (comp.id === 'comp-terraco') return true;
  if (comp.id?.startsWith('comp-test')) return true;
  const lower = comp.name.toLowerCase();
  if (lower.includes('empresa teste')) return true;
  if (lower.includes('shopping terraço') || lower.includes('shopping terraco') || lower.includes('condomínio shopping terraço')) return true;
  return false;
};

export const getDeletedCompanyIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DELETED_COMPANY_IDS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const set = new Set(arr);
        set.add('comp-terraco');
        return set;
      }
    }
  } catch { /* noop */ }
  const defaultSet = new Set<string>();
  defaultSet.add('comp-terraco');
  return defaultSet;
};

export const recordDeletedCompanyId = (companyId: string): void => {
  if (!companyId) return;
  try {
    const set = getDeletedCompanyIds();
    set.add(companyId);
    localStorage.setItem(DELETED_COMPANY_IDS_KEY, JSON.stringify(Array.from(set)));
  } catch { /* noop */ }
};

export const getDeletedContactIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DELETED_CONTACT_IDS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch { /* noop */ }
  return new Set();
};

export const recordDeletedContactId = (contactId: string): void => {
  if (!contactId) return;
  try {
    const set = getDeletedContactIds();
    set.add(contactId);
    localStorage.setItem(DELETED_CONTACT_IDS_KEY, JSON.stringify(Array.from(set)));
  } catch { /* noop */ }
};

export const deduplicateCompanyContacts = (contacts: ClientContact[]): ClientContact[] => {
  if (!Array.isArray(contacts)) return [];
  const seenNames = new Set<string>();
  const seenEmails = new Set<string>();
  const deletedIds = getDeletedContactIds();
  const result: ClientContact[] = [];

  for (const ct of contacts) {
    if (!ct || !ct.name || deletedIds.has(ct.id)) continue;
    const cleanName = ct.name.trim().toLowerCase();
    const cleanEmail = (ct.email || '').trim().toLowerCase();

    // Se já vimos este comprador exatamente pelo nome nesta empresa, ignora a duplicata
    if (cleanName && seenNames.has(cleanName)) {
      continue;
    }
    // Se o e-mail for preenchido e já vimos o mesmo e-mail, ignora
    if (cleanEmail && seenEmails.has(cleanEmail)) {
      continue;
    }

    if (cleanName) seenNames.add(cleanName);
    if (cleanEmail) seenEmails.add(cleanEmail);
    result.push(ct);
  }

  return result;
};

export const getClientCompanies = (): ClientCompany[] => {
  try {
    const prefixMap = getCompanyPrefixesMap();
    const deletedCompanyIds = getDeletedCompanyIds();
    const saved = localStorage.getItem(CLIENT_COMPANIES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter(c => !isBlockedOrTestCompany(c) && !deletedCompanyIds.has(c.id))
          .map(c => {
          let locs = Array.isArray(c.locations) && c.locations.length > 0 
            ? c.locations 
            : (c.defaultDeliveryLocation ? [c.defaultDeliveryLocation] : ['Brasília']);
          
          // Garantir que UBEC use as cidades de destino do frete (Brasília, Coronel Fabriciano, Joinville)
          if (c.name.toLowerCase().includes('ubec')) {
            const hasCampus = locs.some((l: string) => l.toLowerCase().includes('campus'));
            if (hasCampus) {
              locs = ['Brasília', 'Coronel Fabriciano', 'Joinville', 'Itabira'];
              c.defaultDeliveryLocation = 'Brasília';
            }
          }
          if (c.name.toLowerCase().includes('pauloctavio') || c.name.toLowerCase().includes('paulo oct')) {
            const hasShopping = locs.some((l: string) => l.toLowerCase().includes('shopping') && !l.toLowerCase().includes('casa'));
            if (hasShopping) {
              locs = ['Brasília', 'Taguatinga', 'Águas Claras'];
              c.defaultDeliveryLocation = 'Brasília';
            }
          }

          const cleanName = (c.name || '').replace(/^(ao|à|a|para)\s+/i, '').trim().toLowerCase();
          const resolvedPrefix = c.prefix || prefixMap[c.id] || prefixMap[cleanName] || (c.name.trim().toLowerCase().startsWith('ao ') ? 'Ao' : 'À');

          const rawContacts = Array.isArray(c.contacts) ? c.contacts : [];
          const dedupedContacts = deduplicateCompanyContacts(rawContacts)
            .sort((a: ClientContact, b: ClientContact) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));

          return {
            ...c,
            prefix: resolvedPrefix as 'À' | 'Ao',
            defaultDeliveryLocation: c.defaultDeliveryLocation || locs[0] || 'Brasília',
            locations: locs,
            contacts: dedupedContacts
          };
        }).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));
      }
    }
  } catch (e) {
    console.error(e);
  }
  return initialClientCompanies
    .filter(comp => !isBlockedOrTestCompany(comp) && !getDeletedCompanyIds().has(comp.id))
    .map(comp => ({
      ...comp,
      contacts: deduplicateCompanyContacts(comp.contacts || []).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }))
    }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));
};

export const saveClientCompanies = (companies: ClientCompany[]): void => {
  try {
    const prefixMap = getCompanyPrefixesMap();
    companies.forEach(c => {
      if (c.prefix) {
        if (c.id) prefixMap[c.id] = c.prefix as 'À' | 'Ao';
        if (c.name) {
          const clean = c.name.replace(/^(ao|à|a|para)\s+/i, '').trim().toLowerCase();
          prefixMap[clean] = c.prefix as 'À' | 'Ao';
        }
      }
    });
    try {
      localStorage.setItem(COMPANY_PREFIXES_KEY, JSON.stringify(prefixMap));
    } catch { /* noop */ }

    const deletedCompanyIds = getDeletedCompanyIds();
    const normalized = companies
      .filter(comp => !isBlockedOrTestCompany(comp) && !deletedCompanyIds.has(comp.id))
      .map(comp => {
        const clean = (comp.name || '').replace(/^(ao|à|a|para)\s+/i, '').trim().toLowerCase();
        const pref = comp.prefix || prefixMap[comp.id] || prefixMap[clean] || (comp.name.trim().toLowerCase().startsWith('ao ') ? 'Ao' : 'À');
        const sortedContacts = (comp.contacts || [])
          .map(ct => ({
            ...ct,
            email: (ct.email || '').toLowerCase().trim()
          }))
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));

        return {
          ...comp,
          prefix: pref as 'À' | 'Ao',
          locations: Array.isArray(comp.locations) && comp.locations.length > 0
            ? Array.from(new Set(comp.locations.filter(Boolean).map(l => l.trim())))
            : (comp.defaultDeliveryLocation ? [comp.defaultDeliveryLocation] : ['Brasília - DF']),
          contacts: sortedContacts
        };
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));

    localStorage.setItem(CLIENT_COMPANIES_KEY, JSON.stringify(normalized));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('infodesk_companies_changed', { detail: normalized }));
    }
    syncClientCompaniesToSupabase(normalized).catch(() => {});
  } catch (err) {
    console.warn('Erro ao salvar empresas no localStorage:', err);
  }
};

export const registerOrUpdateClient = (
  companyName: string,
  contactName: string,
  email?: string,
  phone?: string,
  deliveryLocation?: string,
  paymentTerms?: string,
  deliveryDays?: string,
  warrantyTerms?: string
): ClientCompany[] => {
  if (!companyName || !companyName.trim()) return getClientCompanies();

  const cleanCompanyName = companyName.replace(/^(ao|à|a|para)\s+/i, '').trim();
  if (cleanCompanyName.toLowerCase().includes('empresa teste')) {
    return getClientCompanies();
  }
  
  const companies = getClientCompanies();
  let comp = companies.find(c => 
    c.name.toLowerCase() === cleanCompanyName.toLowerCase() ||
    c.name.toLowerCase().includes(cleanCompanyName.toLowerCase()) ||
    cleanCompanyName.toLowerCase().includes(c.name.toLowerCase())
  );

  const loc = deliveryLocation?.trim();

  const prefixMatch = companyName.trim().match(/^(ao|à)\s+/i);
  const detectedPrefix = prefixMatch ? (prefixMatch[1].toLowerCase() === 'ao' ? 'Ao' : 'À') : undefined;

  const prefixMap = getCompanyPrefixesMap();
  const cleanLower = cleanCompanyName.toLowerCase();

  if (!comp) {
    const resolvedPrefix = detectedPrefix || prefixMap[cleanLower] || 'À';
    comp = {
      id: `comp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: cleanCompanyName,
      prefix: resolvedPrefix,
      defaultDeliveryLocation: loc || 'Brasília - DF',
      locations: loc ? [loc] : ['Brasília - DF'],
      contacts: [],
      defaultPaymentTerms: paymentTerms?.trim() || undefined,
      defaultDeliveryDays: deliveryDays?.trim() || undefined,
      defaultWarrantyTerms: warrantyTerms?.trim() || undefined,
      lastUsed: new Date().toISOString()
    };
    companies.push(comp);
    saveCompanyPrefixPreference(comp.id, comp.name, resolvedPrefix as 'À' | 'Ao');
  } else {
    // Se explicitamente informado na digitação (ex: digitou "Ao Empresa"), atualiza;
    // Se a empresa já tinha prefixo próprio configurado, preserva fielmente.
    if (detectedPrefix) {
      comp.prefix = detectedPrefix;
      saveCompanyPrefixPreference(comp.id, comp.name, detectedPrefix as 'À' | 'Ao');
    } else if (!comp.prefix) {
      comp.prefix = prefixMap[comp.id] || prefixMap[cleanLower] || 'À';
    }
    comp.lastUsed = new Date().toISOString();
    comp.locations = Array.isArray(comp.locations) ? comp.locations : (comp.defaultDeliveryLocation ? [comp.defaultDeliveryLocation] : []);
    if (loc && !comp.locations.includes(loc)) {
      comp.locations.push(loc);
    }
    if (loc && !comp.defaultDeliveryLocation) {
      comp.defaultDeliveryLocation = loc;
    }
    if (paymentTerms?.trim()) {
      comp.defaultPaymentTerms = paymentTerms.trim();
    }
    if (deliveryDays?.trim()) {
      comp.defaultDeliveryDays = deliveryDays.trim();
    }
    if (warrantyTerms?.trim()) {
      comp.defaultWarrantyTerms = warrantyTerms.trim();
    }
  }

  if (contactName && contactName.trim().length > 0) {
    const cleanContact = contactName
      .replace(/^a\/c\s*/i, '')
      .replace(/^(sr\.|sra\.|srta\.|dr\.|dra\.)\s+/i, '')
      .trim();

    if (cleanContact.length > 1 && !['responsavel', 'responsável', 'cliente'].includes(cleanContact.toLowerCase())) {
      let contact = comp.contacts.find(ct => 
        ct.name.toLowerCase() === cleanContact.toLowerCase() ||
        ct.name.toLowerCase().includes(cleanContact.toLowerCase()) ||
        cleanContact.toLowerCase().includes(ct.name.toLowerCase())
      );

      if (!contact) {
        contact = {
          id: `cont-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: cleanContact,
          email: (email || '').toLowerCase().trim(),
          phone: phone || '',
          location: loc || comp.defaultDeliveryLocation,
          lastUsed: new Date().toISOString()
        };
        comp.contacts.push(contact);
      } else {
        if (email && (!contact.email || contact.email.includes('cliente.com.br'))) {
          contact.email = email.toLowerCase().trim();
        }
        if (phone && !contact.phone) {
          contact.phone = phone;
        }
        if (loc) {
          contact.location = loc;
        }
        contact.lastUsed = new Date().toISOString();
      }
    }
  }

  saveClientCompanies(companies);
  return companies;
};

// ─── Unidades e Categorias Dinâmicas Registradas ─────────────────────────────

export const DEFAULT_REGISTERED_UNITS = [
  'Cx.',
  'Kg',
  'Kit',
  'Metro',
  'm²',
  'Par',
  'Pct.',
  'Pote',
  'Rolo',
  'Un.'
].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

export const DEFAULT_REGISTERED_CATEGORIES = [
  'Áudio, Vídeo & Apresentação',
  'Construção, Acabamento & Marcenaria',
  'Diversos & Sazonais',
  'Eletrodomésticos, Refrigeração & Copa',
  'Elétrica & Iluminação Tática',
  'Energia, Nobreaks & Baterias',
  'Equipamentos & Insumos Industriais',
  'Ferramentas & Instrumentos de Medição',
  'Impressão & Automação Comercial',
  'Informática, Hardware & Periféricos',
  'Limpeza, Higiene & Descartáveis',
  'Monitores, Displays & TVs',
  'Papelaria, Artes & Material de Escritório',
  'Pet Shop & Veterinária',
  'Redes, Conectividade & Telefonia'
].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

const notifyMetadataChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('infodesk_metadata_changed'));
  }
};

// ==========================================
// CONTROLE DE ITENS DELETADOS (TOMBSTONES ANTI-RESSURREIÇÃO)
// ==========================================
const DELETED_CATEGORIES_KEY = 'infodesk_deleted_categories';
const DELETED_UNITS_KEY = 'infodesk_deleted_units';
const DELETED_PAYMENT_METHODS_KEY = 'infodesk_deleted_payment_methods';

export const getDeletedCategories = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DELETED_CATEGORIES_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.map((s: string) => String(s).toLowerCase().trim()));
    }
  } catch { /* noop */ }
  return new Set();
};

export const recordDeletedCategory = (category: string): void => {
  if (!category) return;
  try {
    const set = getDeletedCategories();
    set.add(category.toLowerCase().trim());
    localStorage.setItem(DELETED_CATEGORIES_KEY, JSON.stringify(Array.from(set)));
  } catch { /* noop */ }
};

export const unrecordDeletedCategory = (category: string): void => {
  if (!category) return;
  try {
    const set = getDeletedCategories();
    set.delete(category.toLowerCase().trim());
    localStorage.setItem(DELETED_CATEGORIES_KEY, JSON.stringify(Array.from(set)));
  } catch { /* noop */ }
};

export const clearDeletedCategories = (): void => {
  try {
    localStorage.removeItem(DELETED_CATEGORIES_KEY);
  } catch { /* noop */ }
};

export const getDeletedUnits = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DELETED_UNITS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.map((s: string) => String(s).toLowerCase().trim()));
    }
  } catch { /* noop */ }
  return new Set();
};

export const recordDeletedUnit = (unit: string): void => {
  if (!unit) return;
  try {
    const set = getDeletedUnits();
    set.add(unit.toLowerCase().trim());
    localStorage.setItem(DELETED_UNITS_KEY, JSON.stringify(Array.from(set)));
  } catch { /* noop */ }
};

export const unrecordDeletedUnit = (unit: string): void => {
  if (!unit) return;
  try {
    const set = getDeletedUnits();
    set.delete(unit.toLowerCase().trim());
    localStorage.setItem(DELETED_UNITS_KEY, JSON.stringify(Array.from(set)));
  } catch { /* noop */ }
};

export const clearDeletedUnits = (): void => {
  try {
    localStorage.removeItem(DELETED_UNITS_KEY);
  } catch { /* noop */ }
};

export const getDeletedPaymentMethods = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DELETED_PAYMENT_METHODS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.map((s: string) => String(s).toLowerCase().trim()));
    }
  } catch { /* noop */ }
  return new Set();
};

export const recordDeletedPaymentMethod = (method: string): void => {
  if (!method) return;
  try {
    const set = getDeletedPaymentMethods();
    set.add(method.toLowerCase().trim());
    localStorage.setItem(DELETED_PAYMENT_METHODS_KEY, JSON.stringify(Array.from(set)));
  } catch { /* noop */ }
};

export const unrecordDeletedPaymentMethod = (method: string): void => {
  if (!method) return;
  try {
    const set = getDeletedPaymentMethods();
    set.delete(method.toLowerCase().trim());
    localStorage.setItem(DELETED_PAYMENT_METHODS_KEY, JSON.stringify(Array.from(set)));
  } catch { /* noop */ }
};

export const clearDeletedPaymentMethods = (): void => {
  try {
    localStorage.removeItem(DELETED_PAYMENT_METHODS_KEY);
  } catch { /* noop */ }
};

// ==========================================
// 1. UNIDADES DE MEDIDA
// ==========================================
export const getRegisteredUnits = (): string[] => {
  const deleted = getDeletedUnits();
  try {
    const saved = localStorage.getItem('infodesk_registered_units');
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(Boolean)
          .map((u: string) => u.trim())
          .filter((u: string) => !deleted.has(u.toLowerCase()) && !['Frasco', 'Galão', 'Tubo', 'Lata', 'Peça'].includes(u))
          .sort((a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar unidades salvas:', e);
  }
  return DEFAULT_REGISTERED_UNITS.filter(u => !deleted.has(u.toLowerCase()));
};

export const saveRegisteredUnitsList = (units: string[]): string[] => {
  const deleted = getDeletedUnits();
  const cleanList = Array.from(new Set(units.map(u => u.trim()).filter(Boolean)))
    .filter(u => !deleted.has(u.toLowerCase()) && !['Frasco', 'Galão', 'Tubo', 'Lata', 'Peça'].includes(u))
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  try {
    localStorage.setItem('infodesk_registered_units', JSON.stringify(cleanList));
  } catch (e) {
    console.warn('Erro ao salvar lista de unidades:', e);
  }
  notifyMetadataChanged();
  try {
    syncRegisteredMetadataToSupabase(getRegisteredCategories(), cleanList).catch(() => {});
  } catch { /* noop */ }
  return cleanList;
};

export const saveRegisteredUnit = (unit: string): string[] => {
  if (!unit || !unit.trim()) return getRegisteredUnits();
  const clean = unit.trim();
  unrecordDeletedUnit(clean);
  const current = getRegisteredUnits();
  const exists = current.some(u => u.toLowerCase() === clean.toLowerCase());
  if (!exists) {
    const updated = [...current, clean];
    return saveRegisteredUnitsList(updated);
  }
  return current;
};

export const updateRegisteredUnit = (oldUnit: string, newUnit: string): string[] => {
  const cleanOld = oldUnit.trim();
  const cleanNew = newUnit.trim();
  if (!cleanNew) return getRegisteredUnits();
  const current = getRegisteredUnits();
  recordDeletedUnit(cleanOld);
  unrecordDeletedUnit(cleanNew);
  deleteUnitFromSupabase(cleanOld).catch(() => {});
  const updated = current.map(u => u.toLowerCase() === cleanOld.toLowerCase() ? cleanNew : u);
  if (!updated.some(u => u.toLowerCase() === cleanNew.toLowerCase())) {
    updated.push(cleanNew);
  }
  return saveRegisteredUnitsList(updated);
};

export const deleteRegisteredUnit = (unit: string): string[] => {
  const clean = unit.trim();
  recordDeletedUnit(clean);
  deleteUnitFromSupabase(clean).catch(() => {});
  const current = getRegisteredUnits();
  const updated = current.filter(u => u.trim().toLowerCase() !== clean.toLowerCase());
  return saveRegisteredUnitsList(updated);
};

export const resetRegisteredUnits = (): string[] => {
  clearDeletedUnits();
  return saveRegisteredUnitsList(DEFAULT_REGISTERED_UNITS);
};

// ==========================================
// 2. CATEGORIAS DE PRODUTO
// ==========================================
export const getRegisteredCategories = (): string[] => {
  const deleted = getDeletedCategories();
  try {
    const saved = localStorage.getItem('infodesk_registered_categories');
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(Boolean)
          .map((c: string) => c.trim())
          .filter((c: string) => !deleted.has(c.toLowerCase()))
          .sort((a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar categorias salvas:', e);
  }
  return DEFAULT_REGISTERED_CATEGORIES.filter(c => !deleted.has(c.toLowerCase()));
};

export const saveRegisteredCategoriesList = (categories: string[]): string[] => {
  const deleted = getDeletedCategories();
  const cleanList = Array.from(new Set(categories.map(c => c.trim()).filter(Boolean)))
    .filter(c => !deleted.has(c.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  try {
    localStorage.setItem('infodesk_registered_categories', JSON.stringify(cleanList));
  } catch (e) {
    console.warn('Erro ao salvar lista de categorias:', e);
  }
  notifyMetadataChanged();
  try {
    syncRegisteredMetadataToSupabase(cleanList, getRegisteredUnits()).catch(() => {});
  } catch { /* noop */ }
  return cleanList;
};

export const saveRegisteredCategory = (category: string): string[] => {
  if (!category || !category.trim()) return getRegisteredCategories();
  const clean = category.trim();
  unrecordDeletedCategory(clean);
  const current = getRegisteredCategories();
  const exists = current.some(c => c.toLowerCase() === clean.toLowerCase());
  if (!exists) {
    const updated = [...current, clean];
    return saveRegisteredCategoriesList(updated);
  }
  return current;
};

export const updateRegisteredCategory = (oldCategory: string, newCategory: string): string[] => {
  const cleanOld = oldCategory.trim();
  const cleanNew = newCategory.trim();
  if (!cleanNew) return getRegisteredCategories();
  const current = getRegisteredCategories();
  recordDeletedCategory(cleanOld);
  unrecordDeletedCategory(cleanNew);
  deleteCategoryFromSupabase(cleanOld).catch(() => {});
  const updated = current.map(c => c.toLowerCase() === cleanOld.toLowerCase() ? cleanNew : c);
  if (!updated.some(c => c.toLowerCase() === cleanNew.toLowerCase())) {
    updated.push(cleanNew);
  }
  return saveRegisteredCategoriesList(updated);
};

export const deleteRegisteredCategory = (category: string): string[] => {
  const clean = category.trim();
  recordDeletedCategory(clean);
  deleteCategoryFromSupabase(clean).catch(() => {});
  const current = getRegisteredCategories();
  const updated = current.filter(c => c.trim().toLowerCase() !== clean.toLowerCase());
  return saveRegisteredCategoriesList(updated);
};

export const resetRegisteredCategories = (): string[] => {
  clearDeletedCategories();
  return saveRegisteredCategoriesList(DEFAULT_REGISTERED_CATEGORIES);
};

// ==========================================
// 3. FORMAS DE PAGAMENTO (100% dinâmicas - sem lista padrão)
// ==========================================
export const DEFAULT_PAYMENT_METHODS: string[] = [];

export const getRegisteredPaymentMethods = (): string[] => {
  const deleted = getDeletedPaymentMethods();
  try {
    const saved = localStorage.getItem('infodesk_registered_payment_methods');
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(Boolean)
          .map((m: string) => m.trim())
          .filter((m: string) => !deleted.has(m.toLowerCase()))
          .sort((a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar formas de pagamento salvas:', e);
  }
  return [];
};

export const saveRegisteredPaymentMethodsList = (methods: string[]): string[] => {
  const deleted = getDeletedPaymentMethods();
  const cleanList = Array.from(new Set(methods.map(m => m.trim()).filter(Boolean)))
    .filter(m => !deleted.has(m.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  try {
    localStorage.setItem('infodesk_registered_payment_methods', JSON.stringify(cleanList));
  } catch (e) {
    console.warn('Erro ao salvar lista de formas de pagamento:', e);
  }
  notifyMetadataChanged();
  syncPaymentMethodsToSupabase(cleanList).catch(err => {
    console.warn('[Storage] Erro ao sincronizar payment_methods no Supabase:', err);
  });
  return cleanList;
};

export const saveRegisteredPaymentMethod = (method: string): string[] => {
  if (!method || !method.trim()) return getRegisteredPaymentMethods();
  const clean = method.trim();
  unrecordDeletedPaymentMethod(clean);
  const current = getRegisteredPaymentMethods();
  const exists = current.some(m => m.toLowerCase() === clean.toLowerCase());
  if (!exists) {
    const updated = [...current, clean];
    return saveRegisteredPaymentMethodsList(updated);
  }
  return current;
};

export const updateRegisteredPaymentMethod = (oldMethod: string, newMethod: string): string[] => {
  const cleanOld = oldMethod.trim();
  const cleanNew = newMethod.trim();
  if (!cleanNew) return getRegisteredPaymentMethods();
  const current = getRegisteredPaymentMethods();
  recordDeletedPaymentMethod(cleanOld);
  unrecordDeletedPaymentMethod(cleanNew);
  deletePaymentMethodFromSupabase(cleanOld).catch(() => {});
  const updated = current.map(m => m.toLowerCase() === cleanOld.toLowerCase() ? cleanNew : m);
  if (!updated.some(m => m.toLowerCase() === cleanNew.toLowerCase())) {
    updated.push(cleanNew);
  }
  return saveRegisteredPaymentMethodsList(updated);
};

export const deleteRegisteredPaymentMethod = (method: string): string[] => {
  const clean = method.trim();
  recordDeletedPaymentMethod(clean);
  deletePaymentMethodFromSupabase(clean).catch(() => {});
  const current = getRegisteredPaymentMethods();
  const updated = current.filter(m => m.trim().toLowerCase() !== clean.toLowerCase());
  return saveRegisteredPaymentMethodsList(updated);
};

export const resetRegisteredPaymentMethods = (): string[] => {
  clearDeletedPaymentMethods();
  return saveRegisteredPaymentMethodsList([]);
};

// ==========================================
// COMPRAS DIRETAS / AVULSAS (FORA DE PROPOSTA)
// ==========================================
const DIRECT_PURCHASES_KEY = 'infodesk_direct_purchases';

export const getDirectPurchases = (): import('../types').ProcurementItem[] => {
  try {
    const raw = localStorage.getItem(DIRECT_PURCHASES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Erro ao carregar compras diretas:', e);
  }
  return [];
};

export const saveDirectPurchases = (items: import('../types').ProcurementItem[]): void => {
  try {
    localStorage.setItem(DIRECT_PURCHASES_KEY, JSON.stringify(items));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('infodesk_direct_purchases_changed', { detail: items }));
    }
  } catch (e) {
    console.warn('Erro ao salvar compras diretas:', e);
  }
  // Sincroniza em nuvem no Supabase
  syncDirectPurchasesToSupabase(items).catch(err => {
    console.warn('[Storage] Erro ao sincronizar compras diretas com Supabase:', err);
  });
};

const DELETED_DIRECT_PURCHASE_IDS_KEY = 'infodesk_deleted_direct_purchase_ids';

export const getDeletedDirectPurchaseIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DELETED_DIRECT_PURCHASE_IDS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.map((id: string) => String(id).trim()));
      }
    }
  } catch { /* noop */ }
  return new Set<string>();
};

export const recordDeletedDirectPurchaseId = (id: string): void => {
  if (!id) return;
  try {
    const set = getDeletedDirectPurchaseIds();
    set.add(String(id).trim());
    localStorage.setItem(DELETED_DIRECT_PURCHASE_IDS_KEY, JSON.stringify(Array.from(set)));
  } catch { /* noop */ }
};

export const saveOrUpdateDirectPurchase = (item: import('../types').ProcurementItem): import('../types').ProcurementItem[] => {
  const current = getDirectPurchases();
  const index = current.findIndex(i => i.id === item.id);
  let updated: import('../types').ProcurementItem[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = item;
  } else {
    updated = [item, ...current];
  }
  saveDirectPurchases(updated);
  if (item.purchaseStatus === 'purchased' || item.purchaseStatus === 'delivered') {
    savePurchasedProcurementRecord({
      itemId: item.itemId || item.id,
      name: item.name,
      purchaseStatus: item.purchaseStatus,
      actualCostPrice: item.actualCostPrice,
      actualUnitCostPrice: item.actualUnitCostPrice,
      actualPurchaseUrl: item.actualPurchaseUrl,
      actualShippingCost: item.actualShippingCost,
      shippingPending: item.shippingPending,
      paymentMethod: item.paymentMethod,
      purchasedAt: item.purchasedAt,
      purchaseNotes: item.purchaseNotes,
      actualTaxPercent: item.taxPercent
    });
  }
  return updated;
};

export const deleteDirectPurchaseItem = (itemId: string): import('../types').ProcurementItem[] => {
  recordDeletedDirectPurchaseId(itemId);
  const current = getDirectPurchases();
  const updated = current.filter(i => i.id !== itemId && i.itemId !== itemId);
  saveDirectPurchases(updated);
  removePurchasedProcurementRecord(itemId);
  deleteDirectPurchaseFromSupabase(itemId).catch(err => {
    console.warn('[Storage] Erro ao deletar compra direta no Supabase:', err);
  });
  return updated;
};

// ==============================================================================
// 14. REGISTRO DEDICADO DE COMPRAS REALIZADAS (BLINDAGEM CONTRA PERDAS NO F5)
// ==============================================================================
export interface ProcurementPurchaseRecord {
  itemId: string;
  itemNumber?: number;
  quoteId?: string;
  quoteCode?: string;
  name?: string;
  purchaseStatus: 'purchased' | 'delivered';
  actualCostPrice?: number;
  actualUnitCostPrice?: number;
  actualPurchaseUrl?: string;
  actualShippingCost?: number;
  shippingPending?: boolean;
  paymentMethod?: string;
  purchasedAt?: string;
  purchaseNotes?: string;
  actualTaxPercent?: number;
}

const PROCUREMENT_PURCHASES_KEY = 'infodesk_procurement_purchases_v1';

export const getPurchasedProcurementRecords = (): Record<string, ProcurementPurchaseRecord> => {
  try {
    const raw = localStorage.getItem(PROCUREMENT_PURCHASES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const savePurchasedProcurementRecord = (record: ProcurementPurchaseRecord): void => {
  if (!record || (!record.itemId && !record.name)) return;
  try {
    const map = getPurchasedProcurementRecords();

    // 1. Chave direta por itemId
    if (record.itemId) {
      map[record.itemId] = record;
    }

    // 2. Chave composta por quoteId + itemId
    if (record.quoteId && record.itemId) {
      map[`${record.quoteId}_${record.itemId}`] = record;
    }

    // 3. Chave resiliente por quoteCode + itemNumber (o número do item NUNCA muda mesmo ao re-gerar UUID no banco!)
    if (record.quoteCode && record.itemNumber !== undefined) {
      const codeUpper = record.quoteCode.trim().toUpperCase();
      map[`${codeUpper}#item_${record.itemNumber}`] = record;
      map[`${codeUpper}#${record.itemNumber}`] = record;
    }

    // 4. Chave resiliente por quoteId + itemNumber
    if (record.quoteId && record.itemNumber !== undefined) {
      map[`${record.quoteId}#item_${record.itemNumber}`] = record;
    }

    // 5. Chave por quoteCode + nome normalizado
    if (record.quoteCode && record.name) {
      const codeUpper = record.quoteCode.trim().toUpperCase();
      const rawSig = `${record.quoteCode}_${record.name}`.trim().toLowerCase();
      const normSig = `${codeUpper}:::${normalizeSearchText(record.name)}`;
      const cleanNameSig = `${codeUpper}:::${record.name.trim().toLowerCase()}`;
      map[rawSig] = record;
      map[normSig] = record;
      map[cleanNameSig] = record;
    }

    // 6. Chave por quoteId + nome normalizado
    if (record.quoteId && record.name) {
      map[`${record.quoteId}:::${normalizeSearchText(record.name)}`] = record;
    }

    localStorage.setItem(PROCUREMENT_PURCHASES_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Erro ao salvar registro de compra persistente:', err);
  }
};

export const savePurchasedProcurementRecordsBatch = (records: ProcurementPurchaseRecord[]): void => {
  if (!records || records.length === 0) return;
  try {
    const map = getPurchasedProcurementRecords();
    let hasChanges = false;

    for (const record of records) {
      if (!record || (!record.itemId && !record.name)) continue;
      hasChanges = true;

      if (record.itemId) {
        map[record.itemId] = record;
      }
      if (record.quoteId && record.itemId) {
        map[`${record.quoteId}_${record.itemId}`] = record;
      }
      if (record.quoteCode && record.itemNumber !== undefined) {
        const codeUpper = record.quoteCode.trim().toUpperCase();
        map[`${codeUpper}#item_${record.itemNumber}`] = record;
        map[`${codeUpper}#${record.itemNumber}`] = record;
      }
      if (record.quoteId && record.itemNumber !== undefined) {
        map[`${record.quoteId}#item_${record.itemNumber}`] = record;
      }
      if (record.quoteCode && record.name) {
        const codeUpper = record.quoteCode.trim().toUpperCase();
        const rawSig = `${record.quoteCode}_${record.name}`.trim().toLowerCase();
        const normSig = `${codeUpper}:::${normalizeSearchText(record.name)}`;
        const cleanNameSig = `${codeUpper}:::${record.name.trim().toLowerCase()}`;
        map[rawSig] = record;
        map[normSig] = record;
        map[cleanNameSig] = record;
      }
      if (record.quoteId && record.name) {
        map[`${record.quoteId}:::${normalizeSearchText(record.name)}`] = record;
      }
    }

    if (hasChanges) {
      localStorage.setItem(PROCUREMENT_PURCHASES_KEY, JSON.stringify(map));
    }
  } catch (err) {
    console.warn('Erro ao salvar lote de compras persistentes:', err);
  }
};

export const findPurchasedProcurementRecord = (
  map: Record<string, ProcurementPurchaseRecord>,
  opts: {
    itemId?: string;
    quoteId?: string;
    quoteCode?: string;
    itemNumber?: number;
    name?: string;
  }
): ProcurementPurchaseRecord | undefined => {
  if (!map || Object.keys(map).length === 0) return undefined;

  const codeUpper = opts.quoteCode?.trim().toUpperCase();
  const normName = opts.name ? normalizeSearchText(opts.name) : '';
  const cleanName = opts.name?.trim().toLowerCase();

  // 1. Busca direta por itemId
  if (opts.itemId && map[opts.itemId]) {
    return map[opts.itemId];
  }

  // 2. Busca por quoteId_itemId
  if (opts.quoteId && opts.itemId && map[`${opts.quoteId}_${opts.itemId}`]) {
    return map[`${opts.quoteId}_${opts.itemId}`];
  }

  // 3. Busca por quoteCode + itemNumber (máxima confiabilidade contra novas UUIDs)
  if (codeUpper && opts.itemNumber !== undefined) {
    if (map[`${codeUpper}#item_${opts.itemNumber}`]) return map[`${codeUpper}#item_${opts.itemNumber}`];
    if (map[`${codeUpper}#${opts.itemNumber}`]) return map[`${codeUpper}#${opts.itemNumber}`];
  }

  // 4. Busca por quoteId + itemNumber
  if (opts.quoteId && opts.itemNumber !== undefined && map[`${opts.quoteId}#item_${opts.itemNumber}`]) {
    return map[`${opts.quoteId}#item_${opts.itemNumber}`];
  }

  // 5. Busca por quoteCode + nome normalizado
  if (codeUpper && normName) {
    if (map[`${codeUpper}:::${normName}`]) return map[`${codeUpper}:::${normName}`];
  }
  if (codeUpper && cleanName) {
    if (map[`${codeUpper}:::${cleanName}`]) return map[`${codeUpper}:::${cleanName}`];
  }
  if (opts.quoteCode && cleanName) {
    const rawSig = `${opts.quoteCode}_${opts.name}`.trim().toLowerCase();
    if (map[rawSig]) return map[rawSig];
  }

  // 6. Varredura nos valores caso as chaves diretas não tenham casado
  const records = Object.values(map);
  const match = records.find(r => {
    const rCode = r.quoteCode?.trim().toUpperCase();
    const isSameQuote = (codeUpper && rCode && codeUpper === rCode) || (opts.quoteId && r.quoteId && opts.quoteId === r.quoteId);
    if (!isSameQuote) return false;

    // Se a proposta é a mesma, verifica itemNumber
    if (opts.itemNumber !== undefined && r.itemNumber !== undefined && opts.itemNumber === r.itemNumber) {
      return true;
    }

    // Ou nome normalizado
    if (normName && r.name && normalizeSearchText(r.name) === normName) {
      return true;
    }

    return false;
  });

  return match;
};

export const removePurchasedProcurementRecord = (
  itemId: string, 
  quoteId?: string, 
  quoteCode?: string, 
  itemNumber?: number, 
  name?: string
): void => {
  try {
    const map = getPurchasedProcurementRecords();
    delete map[itemId];
    if (quoteId) {
      delete map[`${quoteId}_${itemId}`];
      if (itemNumber !== undefined) delete map[`${quoteId}#item_${itemNumber}`];
      if (name) delete map[`${quoteId}:::${normalizeSearchText(name)}`];
    }
    if (quoteCode) {
      const codeUpper = quoteCode.trim().toUpperCase();
      if (itemNumber !== undefined) {
        delete map[`${codeUpper}#item_${itemNumber}`];
        delete map[`${codeUpper}#${itemNumber}`];
      }
      if (name) {
        delete map[`${codeUpper}:::${normalizeSearchText(name)}`];
        delete map[`${codeUpper}:::${name.trim().toLowerCase()}`];
        delete map[`${quoteCode}_${name}`.trim().toLowerCase()];
      }
    }
    localStorage.setItem(PROCUREMENT_PURCHASES_KEY, JSON.stringify(map));
  } catch { /* noop */ }
};


