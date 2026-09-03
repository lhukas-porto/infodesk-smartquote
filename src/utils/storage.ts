import { ClientCompany, CompanySettings, IncomingEmail, Product, Quote } from '../types';
import { defaultCompanySettings, initialClientCompanies, initialEmails, initialProducts, initialSentQuotes } from './mockData';

const SETTINGS_KEY = 'infodesk_settings';
const PRODUCTS_KEY = 'infodesk_products';
const EMAILS_KEY = 'infodesk_emails';
const QUOTES_KEY = 'infodesk_quotes';
const CLIENT_COMPANIES_KEY = 'infodesk_client_companies';
const CURRENT_DRAFT_QUOTE_KEY = 'infodesk_current_draft_quote';
const ACTIVE_TAB_KEY = 'infodesk_active_tab';
const MANUAL_ANALYSES_KEY = 'infodesk_manual_analyses';

export const getCurrentDraftQuote = (): Quote | null => {
  const saved = localStorage.getItem(CURRENT_DRAFT_QUOTE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
        return parsed;
      }
    } catch (e) {
      console.error('Erro ao recuperar rascunho de cotação:', e);
    }
  }
  return null;
};

export const saveCurrentDraftQuote = (quote: Quote | null): void => {
  if (!quote) {
    localStorage.removeItem(CURRENT_DRAFT_QUOTE_KEY);
    return;
  }
  localStorage.setItem(CURRENT_DRAFT_QUOTE_KEY, JSON.stringify(quote));
};

export const getSavedActiveTab = (defaultTab: string = 'inbox'): string => {
  const saved = localStorage.getItem(ACTIVE_TAB_KEY);
  return saved && ['inbox', 'builder', 'preview', 'catalog', 'history', 'websearch', 'analyses'].includes(saved) ? saved : defaultTab;
};

export const saveActiveTab = (tab: string): void => {
  localStorage.setItem(ACTIVE_TAB_KEY, tab);
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
      return { ...defaultCompanySettings, ...JSON.parse(saved) }; 
    } catch (e) { console.error(e); }
  }
  return defaultCompanySettings;
};

export const saveSettings = (settings: CompanySettings): void => {
  const normalized: CompanySettings = {
    ...settings,
    email: (settings.email || '').toLowerCase().trim(),
    googleAccountEmail: (settings.googleAccountEmail || '').toLowerCase().trim()
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
};

export const getProducts = (): Product[] => {
  const saved = localStorage.getItem(PRODUCTS_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return initialProducts;
};

export const saveProducts = (products: Product[]): void => {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
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

export const saveQuotes = (quotes: Quote[]): void => {
  try {
    const normalized = quotes.map(q => ({
      ...q,
      clientEmail: (q.clientEmail || '').toLowerCase().trim()
    }));
    localStorage.setItem(QUOTES_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.warn('Erro ao salvar propostas no localStorage:', err);
  }
};

export const getClientCompanies = (): ClientCompany[] => {
  try {
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
          return {
            ...c,
            defaultDeliveryLocation: c.defaultDeliveryLocation || locs[0] || 'Brasília',
            locations: locs
          };
        });
      }
    }
  } catch (e) {
    console.error(e);
  }
  return initialClientCompanies;
};

export const saveClientCompanies = (companies: ClientCompany[]): void => {
  try {
    const normalized = companies.map(comp => ({
      ...comp,
      locations: Array.isArray(comp.locations) && comp.locations.length > 0
        ? Array.from(new Set(comp.locations.filter(Boolean).map(l => l.trim())))
        : (comp.defaultDeliveryLocation ? [comp.defaultDeliveryLocation] : ['Brasília - DF']),
      contacts: (comp.contacts || []).map(ct => ({
        ...ct,
        email: (ct.email || '').toLowerCase().trim()
      }))
    }));
    localStorage.setItem(CLIENT_COMPANIES_KEY, JSON.stringify(normalized));
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

  if (!comp) {
    comp = {
      id: `comp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: cleanCompanyName,
      defaultDeliveryLocation: loc || 'Brasília - DF',
      locations: loc ? [loc] : ['Brasília - DF'],
      contacts: [],
      lastUsed: new Date().toISOString()
    };
    companies.push(comp);
  } else {
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
          role: 'Comprador',
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
