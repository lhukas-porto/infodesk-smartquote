import { ClientCompany, ClientContact, CompanySettings, IncomingEmail, Product, Quote, QuoteItem } from '../types';
import { defaultCompanySettings, initialClientCompanies, initialEmails, initialProducts, initialSentQuotes } from './mockData';
import { 
  syncRegisteredMetadataToSupabase, 
  syncClientCompaniesToSupabase,
  syncCompanySettingsToSupabase,
  syncBatchProductsToSupabase,
  syncIncomingEmailsToSupabase,
  syncQuoteToSupabase
} from '../services/supabase';

const SETTINGS_KEY = 'infodesk_settings';
const PRODUCTS_KEY = 'infodesk_products';
const EMAILS_KEY = 'infodesk_emails';
const QUOTES_KEY = 'infodesk_quotes';
const CLIENT_COMPANIES_KEY = 'infodesk_client_companies';
const CURRENT_DRAFT_QUOTE_KEY = 'infodesk_current_draft_quote';
const ACTIVE_TAB_KEY = 'infodesk_active_tab';
const MANUAL_ANALYSES_KEY = 'infodesk_manual_analyses';

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
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
        if (!parsed.openingText || parsed.openingText.trim() === 'Em atenção...' || parsed.openingText.trim() === 'Em atenção' || parsed.openingText.trim().startsWith('Em atenção ao que foi solicitado')) {
          parsed.openingText = defaultCompanySettings.defaultOpeningText;
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error('Erro ao recuperar rascunho de cotação:', e);
  }
  return null;
};

let draftSyncTimer: any = null;
export const syncDraftQuoteDebounced = (quote: Quote): void => {
  if (draftSyncTimer) clearTimeout(draftSyncTimer);
  draftSyncTimer = setTimeout(() => {
    if (quote && (quote.clientCompany || (quote.items && quote.items.length > 0))) {
      const draftQuote: Quote = {
        ...quote,
        status: quote.status || 'draft',
        code: quote.code || `RASCUNHO-${Date.now()}`
      };
      syncQuoteToSupabase(draftQuote).catch(err => {
        console.warn('[Storage] Erro ao sincronizar rascunho ativo no Supabase:', err);
      });
    }
  }, 1200);
};

export const saveCurrentDraftQuote = (quote: Quote | null): void => {
  if (!quote) {
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

  // Cloud-First: Garante sincronização contínua do rascunho no Supabase
  if (quote.clientCompany || (quote.items && quote.items.length > 0)) {
    syncDraftQuoteDebounced(quote);
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
      if (!parsed.defaultWarrantyTerms || parsed.defaultWarrantyTerms.includes('contra eventuais problemas de fabricação')) {
        parsed.defaultWarrantyTerms = defaultCompanySettings.defaultWarrantyTerms;
      }
      if (!parsed.email || parsed.email.includes('infodesk.com.br')) {
        parsed.email = 'lucas@infodesk.net.br';
      }
      if (!parsed.googleAccountEmail || parsed.googleAccountEmail.includes('infodesk.com.br')) {
        parsed.googleAccountEmail = 'lucas@infodesk.net.br';
      }
      return parsed;
    } catch (e) { console.error(e); }
  }
  return defaultCompanySettings;
};

export const saveSettings = (settings: CompanySettings): void => {
  const cleanEmail = (settings.email || 'lucas@infodesk.net.br').toLowerCase().trim().replace('@infodesk.com.br', '@infodesk.net.br');
  const cleanGoogleEmail = (settings.googleAccountEmail || cleanEmail || 'lucas@infodesk.net.br').toLowerCase().trim().replace('@infodesk.com.br', '@infodesk.net.br');
  const normalized: CompanySettings = {
    ...settings,
    email: cleanEmail,
    googleAccountEmail: cleanGoogleEmail
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

  // Cloud-First: Sincroniza imediatamente com o Supabase
  syncCompanySettingsToSupabase(normalized).catch(err => {
    console.warn('[Storage] Erro ao sincronizar configurações no Supabase:', err);
  });
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

export const getProducts = (): Product[] => {
  const saved = localStorage.getItem(PRODUCTS_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.filter(p => !MOCK_SKUS_SET.has((p.sku || '').trim().toLowerCase()));
      }
    } catch (e) { console.error(e); }
  }
  return [];
};

export const saveProducts = (products: Product[]): void => {
  if (!products || !Array.isArray(products)) return;

  try {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  } catch (quotaErr) {
    console.warn('[Storage] Quota excedida ao salvar produtos. Executando limpeza preventiva...', quotaErr);
    pruneLocalStorage();

    try {
      localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
    } catch (retryErr) {
      console.warn('[Storage] Quota ainda excedida. Aplicando higienização de fotos base64 do catálogo...', retryErr);

      // Nível 3: Remove imagens base64 volumosas (> 30KB) para salvar no localStorage sem crash
      const lightweight = products.map(p => {
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
  syncBatchProductsToSupabase(products).catch(err => {
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
    const saved = localStorage.getItem(QUOTES_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error(e);
  }
  return initialSentQuotes;
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
    const normalized = quotes.map(q => ({
      ...q,
      clientEmail: (q.clientEmail || '').toLowerCase().trim(),
      recipientEmails: safeEmailString(q.recipientEmails),
      ccEmails: safeEmailString(q.ccEmails)
    }));
    try {
      localStorage.setItem(QUOTES_KEY, JSON.stringify(normalized));
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

export const getClientCompanies = (): ClientCompany[] => {
  try {
    const prefixMap = getCompanyPrefixesMap();
    const saved = localStorage.getItem(CLIENT_COMPANIES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(c => {
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

          const sortedContacts = (Array.isArray(c.contacts) ? c.contacts : [])
            .slice()
            .sort((a: ClientContact, b: ClientContact) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));

          return {
            ...c,
            prefix: resolvedPrefix as 'À' | 'Ao',
            defaultDeliveryLocation: c.defaultDeliveryLocation || locs[0] || 'Brasília',
            locations: locs,
            contacts: sortedContacts
          };
        }).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));
      }
    }
  } catch (e) {
    console.error(e);
  }
  return initialClientCompanies
    .map(comp => ({
      ...comp,
      contacts: (comp.contacts || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }))
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

    const normalized = companies
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
  deliveryLocation?: string
): ClientCompany[] => {
  if (!companyName || !companyName.trim()) return getClientCompanies();

  const companies = getClientCompanies();
  const cleanCompanyName = companyName.replace(/^(ao|à|a|para)\s+/i, '').trim();
  
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
  'Acessórios & Escritório',
  'Automação & Energia',
  'Elétrica',
  'Equipamentos & Insumos Industriais',
  'Ferramentas',
  'Geral',
  'Hardware & Peças',
  'Informática & Tecnologia',
  'Limpeza & Higiene',
  'Papelaria e Materiais Escolares',
  'Periféricos & Cabos',
  'Redes & Conectividade',
  'Segurança & CFTV',
  'Segurança Eletrônica',
  'Serviços & Instalação',
  'Suprimentos & Copa'
].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

const notifyMetadataChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('infodesk_metadata_changed'));
  }
};

export const getRegisteredUnits = (): string[] => {
  try {
    const saved = localStorage.getItem('infodesk_registered_units');
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter(Boolean)
          .map((u: string) => u.trim())
          .filter((u: string) => !['Frasco', 'Galão', 'Tubo', 'Lata', 'Peça'].includes(u))
          .sort((a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar unidades salvas:', e);
  }
  return DEFAULT_REGISTERED_UNITS;
};

export const saveRegisteredUnitsList = (units: string[]): string[] => {
  const cleanList = Array.from(new Set(units.map(u => u.trim()).filter(Boolean)))
    .filter(u => !['Frasco', 'Galão', 'Tubo', 'Lata', 'Peça'].includes(u))
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
  const updated = current.map(u => u.toLowerCase() === cleanOld.toLowerCase() ? cleanNew : u);
  return saveRegisteredUnitsList(updated);
};

export const deleteRegisteredUnit = (unit: string): string[] => {
  const clean = unit.trim();
  const current = getRegisteredUnits();
  const updated = current.filter(u => u.trim() !== clean && u.trim().toLowerCase() !== clean.toLowerCase());
  return saveRegisteredUnitsList(updated);
};

export const resetRegisteredUnits = (): string[] => {
  return saveRegisteredUnitsList(DEFAULT_REGISTERED_UNITS);
};

export const getRegisteredCategories = (): string[] => {
  try {
    const saved = localStorage.getItem('infodesk_registered_categories');
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter(Boolean)
          .map((c: string) => c.trim())
          .sort((a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar categorias salvas:', e);
  }
  return DEFAULT_REGISTERED_CATEGORIES;
};

export const saveRegisteredCategoriesList = (categories: string[]): string[] => {
  const cleanList = Array.from(new Set(categories.map(c => c.trim()).filter(Boolean)))
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
  const updated = current.map(c => c.toLowerCase() === cleanOld.toLowerCase() ? cleanNew : c);
  return saveRegisteredCategoriesList(updated);
};

export const deleteRegisteredCategory = (category: string): string[] => {
  const clean = category.trim();
  const current = getRegisteredCategories();
  const updated = current.filter(c => c.trim() !== clean && c.trim().toLowerCase() !== clean.toLowerCase());
  return saveRegisteredCategoriesList(updated);
};

export const resetRegisteredCategories = (): string[] => {
  return saveRegisteredCategoriesList(DEFAULT_REGISTERED_CATEGORIES);
};

