import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { InboxView } from './components/InboxView';
import { QuoteBuilder } from './components/QuoteBuilder';
import { QuotePreview } from './components/QuotePreview';
import { CatalogView } from './components/CatalogView';
import { SentHistoryView } from './components/SentHistoryView';
import { PriceScannerView } from './components/PriceScannerView';
import { EmailSendModal } from './components/EmailSendModal';
import { SettingsModal } from './components/SettingsModal';
import { ClientManagementView } from './components/ClientManagementView';
import { ManualAnalysesView } from './components/ManualAnalysesView';
import { 
  DashboardView, 
  isSameDay, 
  parseQuoteTimestamp, 
  updateDraftQuotesToToday 
} from './components/DashboardView';
import { 
  CompanySettings, 
  IncomingEmail, 
  Product, 
  Quote, 
  QuoteItem,
  ClientCompany,
  ClientContact 
} from './types';
import { 
  getEmails, 
  getProducts, 
  getQuotes, 
  getSettings, 
  saveEmails, 
  saveProducts, 
  saveQuotes, 
  saveSettings,
  registerOrUpdateClient,
  sanitizeEmailObject,
  getClientCompanies,
  saveClientCompanies,
  getCurrentDraftQuote,
  saveCurrentDraftQuote,
  getSavedActiveTab,
  saveActiveTab,
  getManualAnalyses,
  saveManualAnalyses,
  getQuoteItemsBackup,
  saveQuoteItemsBackup,
  getRegisteredCategories,
  saveRegisteredCategoriesList,
  getRegisteredUnits,
  saveRegisteredUnitsList
} from './utils/storage';
import { defaultCompanySettings } from './utils/mockData';
import { 
  getStoredAccessToken, 
  getStoredUserEmail, 
  requestGmailAccessToken, 
  fetchRealGmailMessages, 
  sendRealGmailMessage, 
  disconnectGmailAccount,
  EmailPeriodFilter 
} from './services/gmailService';
import { 
  extractItemsFromEmailContent, 
  extractDeliveryLocation, 
  extractFullCompanyName, 
  resolveProductDetails,
  formatCompanyPrefix,
  formatContactPerson,
  extractContactPhone,
  isExactProductUrl,
  extractEmailFromText,
  extractContactPersonFromText,
  generateQuoteCode,
  getNextUniqueQuoteCode,
  formatProductSentenceCase,
  generateProposalEmailHtml,
  normalizeSearchText
} from './utils/aiEmailParser';
import {
  isSupabaseConfigured,
  fetchCompanySettingsFromSupabase,
  syncCompanySettingsToSupabase,
  fetchQuotesFromSupabase,
  fetchQuoteItemsByQuoteId,
  syncQuoteToSupabase,
  fetchProductsFromSupabase,
  syncProductToSupabase,
  syncBatchProductsToSupabase,
  fetchClientCompaniesFromSupabase,
  syncClientCompaniesToSupabase,
  deleteCompanyFromSupabase,
  deleteContactFromSupabase,
  deleteQuoteFromSupabase,
  fetchIncomingEmailsFromSupabase,
  syncIncomingEmailsToSupabase,
  deleteIncomingEmailFromSupabase,
  fetchRegisteredMetadataFromSupabase,
  syncRegisteredMetadataToSupabase
} from './services/supabase';
import { 
  calculateCommercialUnitPrice, 
  calculateMarkupFromUnitPrice, 
  recalculateQuoteTotals 
} from './services/pricingEngine';

export type TabType = 'inbox' | 'builder' | 'preview' | 'catalog' | 'history' | 'websearch' | 'analyses' | 'clients' | 'dashboard';

const VALID_TABS: TabType[] = ['inbox', 'builder', 'preview', 'catalog', 'history', 'websearch', 'analyses', 'clients', 'dashboard'];

const getTabFromHash = (): TabType | null => {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace('#', '').trim().toLowerCase();
  return VALID_TABS.includes(hash as TabType) ? (hash as TabType) : null;
};

export const App: React.FC = () => {
  const [activeTab, setActiveTabState] = useState<TabType>(() => {
    const hashTab = getTabFromHash();
    if (hashTab) return hashTab;
    const saved = getSavedActiveTab('inbox');
    return (VALID_TABS.includes(saved as TabType) ? saved : 'inbox') as TabType;
  });

  const setActiveTab = useCallback((target: TabType | ((prev: TabType) => TabType)) => {
    setActiveTabState(prev => {
      const nextTab = typeof target === 'function' ? target(prev) : target;
      if (VALID_TABS.includes(nextTab) && nextTab !== prev) {
        window.history.pushState({ tab: nextTab }, '', `#${nextTab}`);
        saveActiveTab(nextTab);
      }
      return nextTab;
    });
  }, []);
  const [settings, setSettings] = useState<CompanySettings>(getSettings());
  const [products, setProducts] = useState<Product[]>(getProducts());
  const [emails, setEmails] = useState<IncomingEmail[]>(getEmails());
  const [quotes, setQuotes] = useState<Quote[]>(() => {
    const raw = getQuotes();
    const healed = raw.map(q => {
      const isConfirmedSent = Boolean(q.sentAt) || (q.code && q.code.trim().toUpperCase() === 'CNC 210926-3');
      if (isConfirmedSent && (q.status === 'draft' || !q.status)) {
        return {
          ...q,
          status: 'sent' as const,
          sentAt: q.sentAt || new Date().toISOString()
        };
      }
      return q;
    });
    const { updatedQuotes, hasChanges } = updateDraftQuotesToToday(healed);
    if (hasChanges || JSON.stringify(healed) !== JSON.stringify(raw)) {
      saveQuotes(updatedQuotes);
    }
    return updatedQuotes;
  });
  const [historyStageFilter, setHistoryStageFilter] = useState<'all' | 'draft' | 'sent' | 'negotiating' | 'approved' | 'lost'>('all');

  // Garante que qualquer rascunho com data anterior seja atualizado para a data de hoje
  useEffect(() => {
    const { updatedQuotes, hasChanges } = updateDraftQuotesToToday(quotes);
    if (hasChanges) {
      setQuotes(updatedQuotes);
      saveQuotes(updatedQuotes);
      updatedQuotes.forEach(q => {
        const oldQ = quotes.find(item => item.id === q.id);
        if (oldQ && (oldQ.date !== q.date || oldQ.createdAt !== q.createdAt)) {
          syncQuoteToSupabase(q);
        }
      });
    }
  }, [quotes]);

  const draftQuotesCount = useMemo(() => {
    return quotes.filter(q => (q.status || 'draft') === 'draft').length;
  }, [quotes]);

  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('infodesk_scanner_panel_open');
    return saved !== null ? saved === 'true' : true;
  });
  const [webSearchQuery, setWebSearchQuery] = useState('');
  const [webSearchTargetIndex, setWebSearchTargetIndex] = useState<number | null>(null);
  const [webSearchExistingItem, setWebSearchExistingItem] = useState<Partial<QuoteItem> | null>(null);

  const handleToggleScanner = (open?: boolean) => {
    setIsScannerOpen(prev => {
      const next = open !== undefined ? open : !prev;
      localStorage.setItem('infodesk_scanner_panel_open', String(next));
      return next;
    });
  };
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [clientCompanies, setClientCompanies] = useState<ClientCompany[]>(() => getClientCompanies());
  const [manualAnalyses, setManualAnalyses] = useState<IncomingEmail[]>(() => getManualAnalyses());

  const handleSaveCompanies = async (updated: ClientCompany[]) => {
    setClientCompanies(updated);
    saveClientCompanies(updated);
    try {
      await syncClientCompaniesToSupabase(updated);
    } catch (err) {
      console.warn('Erro ao sincronizar empresas:', err);
    }
  };

  const handleAddManualAnalysis = (email: IncomingEmail) => {
    setManualAnalyses(prev => {
      // evitar duplicatas por id
      const exists = prev.some(a => a.id === email.id);
      if (exists) return prev;
      const next = [email, ...prev];
      saveManualAnalyses(next);
      syncIncomingEmailsToSupabase(next).catch(() => {});
      return next;
    });
  };

  const handleDeleteManualAnalysis = (id: string) => {
    setManualAnalyses(prev => {
      const next = prev.filter(a => a.id !== id);
      saveManualAnalyses(next);
      deleteIncomingEmailFromSupabase(id).catch(() => {});
      return next;
    });
  };

  const handleUpdateManualAnalysis = (id: string, updates: Partial<IncomingEmail>) => {
    setManualAnalyses(prev => {
      const next = prev.map(a => a.id === id ? { ...a, ...updates } : a);
      saveManualAnalyses(next);
      syncIncomingEmailsToSupabase(next).catch(() => {});
      return next;
    });
  };

  const handleDeleteCompany = async (companyId: string) => {
    const updated = clientCompanies.filter(c => c.id !== companyId);
    setClientCompanies(updated);
    saveClientCompanies(updated);
    await deleteCompanyFromSupabase(companyId);
  };

  const handleDeleteContact = async (contactId: string, companyId: string) => {
    await deleteContactFromSupabase(contactId);
    const updated = clientCompanies.map(c => {
      if (c.id === companyId) {
        return {
          ...c,
          contacts: c.contacts.filter(ct => ct.id !== contactId)
        };
      }
      return c;
    });
    setClientCompanies(updated);
    saveClientCompanies(updated);
    syncClientCompaniesToSupabase(updated);
  };

  const handleSaveSettings = async (newSettings: CompanySettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
    await syncCompanySettingsToSupabase(newSettings);
  };

  // Carregamento e sincronização com banco de dados do Supabase
  useEffect(() => {
    async function hydrateFromSupabase() {
      if (!isSupabaseConfigured) return;
      try {
        // 1. Configurações
        // Lê o valor local ANTES de qualquer sobrescrita remota para preservar campos
        // que podem não existir ainda na coluna do Supabase (ex: daily_dollar_rate)
        const localSettingsBeforeHydrate = getSettings();
        const remoteSettings = await fetchCompanySettingsFromSupabase();
        if (remoteSettings) {
          if (!remoteSettings.defaultOpeningText || remoteSettings.defaultOpeningText.trim() === 'Em atenção...' || remoteSettings.defaultOpeningText.trim() === 'Em atenção' || remoteSettings.defaultOpeningText.trim().startsWith('Em atenção ao que foi solicitado')) {
            remoteSettings.defaultOpeningText = defaultCompanySettings.defaultOpeningText;
          }
          if (remoteSettings.email && remoteSettings.email.includes('infodesk.com.br')) {
            remoteSettings.email = remoteSettings.email.replace('@infodesk.com.br', '@infodesk.net.br');
          }
          if (remoteSettings.googleAccountEmail && remoteSettings.googleAccountEmail.includes('infodesk.com.br')) {
            remoteSettings.googleAccountEmail = remoteSettings.googleAccountEmail.replace('@infodesk.com.br', '@infodesk.net.br');
          }
          // Preserva a cotação do dólar definida localmente se o Supabase retornou o valor
          // padrão (5.60), o que indica que a coluna está nula ou a migration não foi aplicada.
          // Sem essa proteção, o F5 sempre reverteria o valor para 5.60.
          const localDollarRate = localSettingsBeforeHydrate?.dailyDollarRate;
          if (
            localDollarRate &&
            localDollarRate !== 5.60 &&
            (!remoteSettings.dailyDollarRate || remoteSettings.dailyDollarRate === 5.60)
          ) {
            remoteSettings.dailyDollarRate = localDollarRate;
          }
          setSettings(remoteSettings);
          saveSettings(remoteSettings);
        }

        // Sincronização e unificação de Categorias & Unidades com Supabase
        const remoteMeta = await fetchRegisteredMetadataFromSupabase();
        if (remoteMeta) {
          if (remoteMeta.categories && remoteMeta.categories.length > 0) {
            saveRegisteredCategoriesList(remoteMeta.categories);
          }
          if (remoteMeta.units && remoteMeta.units.length > 0) {
            saveRegisteredUnitsList(remoteMeta.units);
          }
        }

        // 2. Orçamentos
        const remoteQuotes = await fetchQuotesFromSupabase();
        if (remoteQuotes && remoteQuotes.length > 0) {
          // Merge seguro: se o banco retornar a cotação sem itens, preserva os itens salvos localmente ou do backup
          setQuotes(prevQuotes => {
            const mergedRemote = remoteQuotes.map(rq => {
              const isConfirmedSent = Boolean(rq.sentAt) || (rq.code && rq.code.trim().toUpperCase() === 'CNC 210926-3');
              if (isConfirmedSent && (rq.status === 'draft' || !rq.status)) {
                rq = { ...rq, status: 'sent', sentAt: rq.sentAt || new Date().toISOString() };
              }
              const localMatch = prevQuotes.find(lq => lq.id === rq.id || (lq.code && rq.code && lq.code.trim().toUpperCase() === rq.code.trim().toUpperCase()));
              const isValidRealItems = (itList?: QuoteItem[] | null): boolean => {
                if (!itList || !Array.isArray(itList) || itList.length === 0) return false;
                if (itList.length === 1) {
                  const it = itList[0];
                  if (it.id?.includes('fallback')) return false;
                  if (it.name && (
                    it.name === rq.subject ||
                    it.name.startsWith('Proposta Comercial') ||
                    it.name.startsWith('Fornecimento para')
                  )) {
                    return false;
                  }
                }
                return true;
              };

              let items = isValidRealItems(rq.items) ? rq.items : [];

              // Se o remoto não veio com itens reais, busca na memória local ou nos backups
              if (!isValidRealItems(items) && localMatch && isValidRealItems(localMatch.items)) {
                items = localMatch.items;
              }
              if (!isValidRealItems(items)) {
                const bCode = rq.code ? getQuoteItemsBackup(rq.code) : null;
                const bId = rq.id ? getQuoteItemsBackup(rq.id) : null;
                const blmCode = localMatch?.code ? getQuoteItemsBackup(localMatch.code) : null;
                const blmId = localMatch?.id ? getQuoteItemsBackup(localMatch.id) : null;

                if (isValidRealItems(bCode)) items = bCode!;
                else if (isValidRealItems(bId)) items = bId!;
                else if (isValidRealItems(blmCode)) items = blmCode!;
                else if (isValidRealItems(blmId)) items = blmId!;
              }

              // Se recuperamos itens reais que estavam ausentes no banco, cura o Supabase em background
              if (items.length > 0 && !isValidRealItems(rq.items)) {
                syncQuoteToSupabase({ ...rq, items }).catch(e => {
                  console.warn('[SmartQuote] Falha ao curar itens no Supabase:', e);
                });
              }

              return { ...rq, items };
            });

            // Preserva propostas que existem apenas localmente (evita perda de dados locais)
            const localOnlyQuotes = prevQuotes.filter(lq => 
              !mergedRemote.some(rq => rq.id === lq.id || (rq.code && lq.code && rq.code.trim().toUpperCase() === lq.code.trim().toUpperCase()))
            );

            // Sincroniza automaticamente para o Supabase qualquer proposta que estava presa no navegador local
            if (localOnlyQuotes.length > 0) {
              localOnlyQuotes.forEach(lq => {
                syncQuoteToSupabase(lq).catch(err => {
                  console.warn('Aviso ao sincronizar proposta pendente para Supabase:', err);
                });
              });
            }

            const combined = [...mergedRemote, ...localOnlyQuotes];
            const { updatedQuotes: normalizedMerged } = updateDraftQuotesToToday(combined);
            saveQuotes(normalizedMerged);
            return normalizedMerged;
          });

          setCurrentQuote(prev => {
            const draft = getCurrentDraftQuote();
            // Se já temos um rascunho recente que o usuário está editando, preserva o rascunho
            let chosen: Quote = prev;
            if (draft && ((Array.isArray(draft.items) && draft.items.length > 0) || Boolean(draft.clientCompany && draft.clientCompany.trim()))) {
              chosen = draft;
            } else if (prev.code === 'CNC 280826' && remoteQuotes[0]) {
              const firstRemote = remoteQuotes[0];
              // Se o remoteQuote não trouxe itens mas o initial prev tinha, mantém itens
              if ((!firstRemote.items || firstRemote.items.length === 0) && prev.items && prev.items.length > 0) {
                chosen = { ...firstRemote, items: prev.items };
              } else {
                chosen = firstRemote;
              }
            }
            if ((chosen.status || 'draft') === 'draft' && !isSameDay(parseQuoteTimestamp(chosen), Date.now())) {
              const todayFormatted = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
              chosen = {
                ...chosen,
                date: todayFormatted,
                createdAt: new Date().toISOString()
              };
              saveCurrentDraftQuote(chosen);
            }
            if (!chosen.openingText || chosen.openingText.trim() === 'Em atenção...' || chosen.openingText.trim() === 'Em atenção') {
              chosen = {
                ...chosen,
                openingText: remoteSettings?.defaultOpeningText || defaultCompanySettings.defaultOpeningText
              };
            }
            return chosen;
          });
        }

        // 3. Catálogo de Produtos
        const remoteProducts = await fetchProductsFromSupabase();
        if (remoteProducts && remoteProducts.length > 0) {
          const MOCK_SKUS_SET = new Set([
            'tra-plu-01',
            'del-mon-27',
            'log-mxk-01',
            'apc-nob-1500',
            'kng-ssd-1tb',
            'fur-cab-cat6',
            'cis-sw-24p'
          ]);
          // Deduplica rigorosamente por SKU e Nome
          const seenSkus = new Set<string>();
          const cleanRemote: Product[] = [];
          for (const p of remoteProducts) {
            const skuKey = (p.sku || '').trim().toLowerCase();
            const nameKey = (p.name || '').trim().toLowerCase();
            const key = skuKey || nameKey;
            if (key && !MOCK_SKUS_SET.has(skuKey) && !seenSkus.has(key)) {
              seenSkus.add(key);
              cleanRemote.push(p);
            }
          }
          setProducts(cleanRemote);
          try {
            localStorage.setItem('smartquote_products', JSON.stringify(cleanRemote));
          } catch (e) {
            console.warn('[SmartQuote] Falha ao persistir produtos localmente:', e);
          }
        }

        // 4. Empresas e Cidades de Frete
        const remoteCompanies = await fetchClientCompaniesFromSupabase();
        if (remoteCompanies && remoteCompanies.length > 0) {
          const localCompanies = getClientCompanies();
          const localById = new Map<string, ClientCompany>();
          const localByName = new Map<string, ClientCompany>();
          localCompanies.forEach(c => {
            localById.set(c.id, c);
            const clean = c.name.replace(/^(ao|à|a|para)\s+/i, '').trim().toLowerCase();
            localByName.set(clean, c);
          });

          const mergedCompanies = remoteCompanies.map(rc => {
            const clean = rc.name.replace(/^(ao|à|a|para)\s+/i, '').trim().toLowerCase();
            const local = localById.get(rc.id) || localByName.get(clean);

            // Preservar contatos locais não sincronizados
            const remoteContactIds = new Set((rc.contacts || []).map(ct => ct.id));
            const localOnlyContacts = (local?.contacts || []).filter(ct => !remoteContactIds.has(ct.id));
            const mergedContacts = [...(rc.contacts || []), ...localOnlyContacts];

            const preservedPrefix = rc.prefix || local?.prefix;

            return {
              ...rc,
              prefix: (preservedPrefix as 'À' | 'Ao') || (rc.name.trim().toLowerCase().startsWith('ao ') ? 'Ao' : 'À'),
              website: rc.website || local?.website,
              logoUrl: rc.logoUrl || local?.logoUrl,
              contacts: mergedContacts
            };
          });

          // Preservar novas empresas criadas localmente que ainda não estão no banco
          const remoteIds = new Set(remoteCompanies.map(r => r.id));
          const localOnlyCompanies = localCompanies.filter(lc => !remoteIds.has(lc.id));
          const finalCompanies = [...mergedCompanies, ...localOnlyCompanies];

          setClientCompanies(finalCompanies);
          saveClientCompanies(finalCompanies);

          // Sincroniza de volta para o Supabase caso houvesse dados locais preservados
          const hasLocalOnlyContacts = mergedCompanies.some(mc => {
            const remote = remoteCompanies.find(rc => rc.id === mc.id);
            return (mc.contacts || []).length > (remote?.contacts?.length || 0);
          });
          if (localOnlyCompanies.length > 0 || hasLocalOnlyContacts || finalCompanies.some(c => c.website && !remoteCompanies.find(rc => rc.id === c.id)?.website)) {
            syncClientCompaniesToSupabase(finalCompanies).catch(() => {});
          }
        }

        // 5. E-mails e Cotações Capturadas
        const remoteEmails = await fetchIncomingEmailsFromSupabase();
        if (remoteEmails && remoteEmails.length > 0) {
          setEmails(remoteEmails);
          saveEmails(remoteEmails);
        }
      } catch (err) {
        console.warn('Sincronização inicial com Supabase:', err);
      }
    }

    hydrateFromSupabase();
  }, []);

  // Manter estado de clientCompanies sincronizado quando houver alterações em qualquer componente
  useEffect(() => {
    const handleCompaniesChanged = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setClientCompanies(e.detail);
      }
    };
    window.addEventListener('infodesk_companies_changed', handleCompaniesChanged);
    return () => window.removeEventListener('infodesk_companies_changed', handleCompaniesChanged);
  }, []);

  // Google Workspace / Gmail Real Integration State
  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean>(() => !!getStoredAccessToken());
  const [connectedUserEmail, setConnectedUserEmail] = useState<string | null>(() => getStoredUserEmail() || 'lucas@infodesk.net.br');
  const [isSyncingEmails, setIsSyncingEmails] = useState(false);
  const [emailSyncError, setEmailSyncError] = useState<string | null>(null);
  const [emailPeriod, setEmailPeriod] = useState<EmailPeriodFilter>('7d');

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '219637540127-tle29vean1bmjgm5irhs1n3eer1iqiep.apps.googleusercontent.com';

  const [currentQuote, setCurrentQuote] = useState<Quote>(() => {
    const draft = getCurrentDraftQuote();
    if (draft && ((Array.isArray(draft.items) && draft.items.length > 0) || Boolean(draft.clientCompany && draft.clientCompany.trim()))) {
      return draft;
    }
    const existing = quotes[0];
    if (existing) return existing;
    return {
      id: `quote-${Date.now()}`,
      code: 'CNC 280826',
      clientCompany: 'CNC — Confederação Nacional do Comércio',
      contactPerson: 'Srta. Alexandra',
      clientEmail: 'alexandraoliveira@cnc.org.br',
      clientPhone: '',
      subject: 'Fornecimento de produtos para informática',
      city: 'Brasília',
      date: '28 de agosto de 2026',
      validityDays: settings.defaultValidityDays,
      paymentTerms: settings.defaultPaymentTerms,
      deliveryDays: settings.defaultDeliveryDays,
      warrantyTerms: settings.defaultWarrantyTerms,
      openingText: settings.defaultOpeningText,
      items: [
        {
          id: 'item-1',
          itemNumber: 1,
          productId: 'prod-1',
          name: 'Organizador de pia Tramontina Plurale',
          description: 'Organizador de pia Tramontina Plurale em plástico e aço inox',
          quantity: 3,
          unit: 'Un.',
          costPrice: 78.50,
          markupPercent: 40.12,
          unitPrice: 110.00,
          totalPrice: 330.00
        }
      ],
      totalCost: 235.50,
      totalProfit: 94.50,
      totalAmount: 330.00,
      averageMargin: 40.12,
      status: 'draft',
      createdAt: new Date().toISOString()
    };
  });

  useEffect(() => { saveSettings(settings); }, [settings]);
  useEffect(() => { saveProducts(products); }, [products]);
  useEffect(() => { saveEmails(emails); }, [emails]);
  useEffect(() => { saveQuotes(quotes); }, [quotes]);
  // Debounce suave de 400ms para salvar rascunho + salvamento imediato no beforeunload (F5 instantâneo)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveCurrentDraftQuote(currentQuote);
    }, 400);

    const handleBeforeUnload = () => {
      saveCurrentDraftQuote(currentQuote);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentQuote]);
  useEffect(() => { saveActiveTab(activeTab); }, [activeTab]);

  // Sincroniza o histórico do navegador (permite que o botão Voltar/Avançar retorne para a tela anterior da aplicação)
  useEffect(() => {
    // 1. Inicializa o estado atual no histórico com a hash correspondente
    const initialHashTab = getTabFromHash();
    const currentInitial = initialHashTab || activeTab;
    window.history.replaceState({ tab: currentInitial }, '', `#${currentInitial}`);

    // 2. Intercepta os eventos de voltar/avançar do navegador (popstate)
    const handlePopState = (event: PopStateEvent) => {
      // Fecha modais flutuantes se estiverem abertos
      setIsEmailModalOpen(false);
      setIsSettingsOpen(false);

      let targetTab: TabType | null = null;
      if (event.state && typeof event.state.tab === 'string' && VALID_TABS.includes(event.state.tab as TabType)) {
        targetTab = event.state.tab as TabType;
      } else {
        const hashTab = getTabFromHash();
        if (hashTab) targetTab = hashTab;
      }

      if (targetTab) {
        setActiveTabState(targetTab);
        saveActiveTab(targetTab);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleConnectGoogle = async () => {
    try {
      setEmailSyncError(null);
      setIsSyncingEmails(true);
      const targetEmail = connectedUserEmail || 'lucas@infodesk.net.br';
      const { token, email } = await requestGmailAccessToken(googleClientId, false, targetEmail);
      const cleanEmail = (email || 'lucas@infodesk.net.br').replace('@infodesk.com.br', '@infodesk.net.br');
      setIsGoogleConnected(true);
      setConnectedUserEmail(cleanEmail);
      setSettings(prev => {
        const updated = { ...prev, googleAccountEmail: cleanEmail, email: cleanEmail, googleWorkspaceConnected: true };
        saveSettings(updated);
        return updated;
      });

      const realMessages = await fetchRealGmailMessages(token, emailPeriod);
      if (realMessages && realMessages.length > 0) {
        const sanitized = realMessages.map(sanitizeEmailObject);
        setEmails(sanitized);
        saveEmails(sanitized);
      }
    } catch (err: any) {
      setEmailSyncError(err.message || 'Não foi possível autenticar com o Google. Verifique se o pop-up foi autorizado.');
    } finally {
      setIsSyncingEmails(false);
    }
  };

  const handleSwitchGoogleAccount = async () => {
    disconnectGmailAccount();
    setIsGoogleConnected(false);
    setConnectedUserEmail(null);
    try {
      const auth = await requestGmailAccessToken(googleClientId, true);
      const cleanEmail = (auth.email || 'lucas@infodesk.net.br').replace('@infodesk.com.br', '@infodesk.net.br');
      setIsGoogleConnected(true);
      setConnectedUserEmail(cleanEmail);
      setSettings(prev => {
        const updated = { ...prev, googleAccountEmail: cleanEmail, email: cleanEmail, googleWorkspaceConnected: true };
        saveSettings(updated);
        return updated;
      });
    } catch (err: any) {
      console.warn('Troca de conta cancelada ou falhou:', err);
    }
  };

  const handleRefreshEmails = async (period?: EmailPeriodFilter) => {
    const targetPeriod = period || emailPeriod;
    if (period) {
      setEmailPeriod(period);
    }
    const token = getStoredAccessToken();
    if (!token) {
      // Quando não estiver conectado ao Google, apenas ajusta o filtro visual sem forçar pop-up
      return;
    }
    try {
      setEmailSyncError(null);
      setIsSyncingEmails(true);
      const realMessages = await fetchRealGmailMessages(token, targetPeriod);
      if (realMessages && realMessages.length > 0) {
        const sanitized = realMessages.map(sanitizeEmailObject);
        setEmails(sanitized);
        saveEmails(sanitized);
      }
    } catch (err: any) {
      setEmailSyncError(err.message || 'Erro ao buscar e-mails do Gmail.');
      if (String(err.message).toLowerCase().includes('expirada')) {
        setIsGoogleConnected(false);
      }
    } finally {
      setIsSyncingEmails(false);
    }
  };

  const handleDisconnectGoogle = () => {
    disconnectGmailAccount();
    setIsGoogleConnected(false);
    setConnectedUserEmail(null);
    setSettings(prev => ({ ...prev, googleWorkspaceConnected: false }));
  };

  const handleSelectEmailToQuote = (email: IncomingEmail) => {
    const markup = settings.defaultMarkupPercent || 35;
    const tax = settings.defaultTaxPercent || 6;
    const shipping = settings.defaultShippingCost || 0;

    const items: QuoteItem[] = email.suggestedItems.map((item, idx) => {
      // 1. Exact catalog search
      const matchedProd = products.find(p => p.name.toLowerCase() === item.name.toLowerCase() || p.name.toLowerCase().includes(item.name.toLowerCase()));
      
      // 2. Automated search using the exact product description from the email/table
      const exactSearchRef = item.rawSearchQuery || [item.name, item.description].filter(Boolean).join(' - ');
      const resolved = resolveProductDetails(exactSearchRef, item.description);

      // Cost price: catalog > resolved marketplace cost > suggested estimated cost
      const cost = matchedProd ? matchedProd.costPrice : (resolved.estimatedCost || item.estimatedCost || 0);
      const unitPrice = item.unitPrice || calculateCommercialUnitPrice(cost, shipping, markup, tax);
      const markupPercent = (item.unitPrice && cost > 0)
        ? calculateMarkupFromUnitPrice(item.unitPrice, cost, shipping, tax)
        : (item.markupPercent || markup);
      const totalPrice = Number((unitPrice * item.quantity).toFixed(2));

      // Image: inline image from table > catalog photo > resolved web photo
      const finalImageUrl = item.imageUrl || matchedProd?.imageUrl || resolved.imageUrl;

      // Part Number & NCM (clean codes)
      const finalPartNumber = item.partNumber || item.itemCode || matchedProd?.partNumber || resolved.partNumber;
      const finalNcm = item.ncm || matchedProd?.ncm || resolved.ncm;

      // Exact marketplace URL (apenas se for link exato do produto)
      const itemUrl = (item.sourceUrl && isExactProductUrl(item.sourceUrl)) 
        ? item.sourceUrl 
        : (isExactProductUrl(resolved.sourceUrl) ? resolved.sourceUrl : (isExactProductUrl(matchedProd?.sourceUrl) ? matchedProd?.sourceUrl : ''));

      return {
        id: `item-${Date.now()}-${idx}`,
        itemNumber: idx + 1,
        productId: matchedProd?.id,
        name: formatProductSentenceCase(resolved.standardizedName || item.name),
        description: item.description ? formatProductSentenceCase(item.description) : '',
        rawSearchQuery: exactSearchRef,
        partNumber: finalPartNumber,
        ncm: finalNcm,
        imageUrl: finalImageUrl,
        showImage: false,
        quantity: item.quantity,
        unit: item.unit || 'Un.',
        costPrice: cost,
        shippingCost: shipping,
        taxPercent: tax,
        markupPercent,
        unitPrice,
        totalPrice,
        sourceUrl: itemUrl
      };
    });

    let totalCost = 0;
    let totalShipping = 0;
    let totalAmount = 0;
    let totalTaxes = 0;

    items.forEach(i => {
      const qty = i.quantity || 1;
      const itemCost = i.costPrice * qty;
      const itemShipping = (i.shippingCost || 0) * qty;
      const itemTotal = i.totalPrice;
      const itemTax = itemTotal * ((i.taxPercent || tax) / 100);

      totalCost += itemCost;
      totalShipping += itemShipping;
      totalAmount += itemTotal;
      totalTaxes += itemTax;
    });

    const totalProfit = totalAmount - totalCost - totalShipping - totalTaxes;
    const directCosts = totalCost + totalShipping;
    const averageMargin = directCosts > 0 ? (totalProfit / directCosts) * 100 : 0;
    const detectedLocation = email.deliveryLocation || extractDeliveryLocation(email.body, `${email.snippet} ${email.senderCompany}`);
    const shippingTerms = `Frete incluso p/ ${detectedLocation}.`;

    const newQuote: Quote = {
      id: `quote-${Date.now()}`,
      code: generateQuoteCode(email.senderCompany),
      clientCompany: formatCompanyPrefix(email.senderCompany),
      contactPerson: formatContactPerson(email.senderName),
      clientEmail: (email.senderEmail || '').toLowerCase().trim(),
      clientPhone: email.senderPhone || extractContactPhone(email.body) || extractContactPhone(email.bodyHtml || '') || '',
      subject: email.subject,
      city: 'Brasília',
      date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
      validityDays: settings.defaultValidityDays,
      paymentTerms: settings.defaultPaymentTerms,
      deliveryDays: settings.defaultDeliveryDays,
      warrantyTerms: settings.defaultWarrantyTerms,
      deliveryLocation: detectedLocation,
      shippingTerms,
      openingText: settings.defaultOpeningText,
      items,
      totalCost: Number(totalCost.toFixed(2)),
      totalShipping: Number(totalShipping.toFixed(2)),
      totalTaxes: Number(totalTaxes.toFixed(2)),
      totalProfit: Number(totalProfit.toFixed(2)),
      totalAmount: Number(totalAmount.toFixed(2)),
      averageMargin: Number(averageMargin.toFixed(1)),
      globalMarkupPercent: markup,
      globalTaxPercent: tax,
      globalShipping: shipping,
      showProductImages: true,
      status: 'draft',
      createdAt: new Date().toISOString()
    };

    const updatedComps = registerOrUpdateClient(
      newQuote.clientCompany,
      newQuote.contactPerson,
      newQuote.clientEmail,
      newQuote.clientPhone,
      newQuote.deliveryLocation
    );
    setClientCompanies(updatedComps);

    setCurrentQuote(newQuote);
    setActiveTab('builder');
  };

  const handleParseCustomEmail = (rawText: string) => {
    const parsedItems = extractItemsFromEmailContent(rawText);
    const markup = settings.defaultMarkupPercent || 35;
    const tax = settings.defaultTaxPercent || 6;
    const shipping = settings.defaultShippingCost || 0;

    const items: QuoteItem[] = parsedItems.map((item, idx) => {
      const matchedProd = products.find(p => p.name.toLowerCase() === item.name.toLowerCase() || p.name.toLowerCase().includes(item.name.toLowerCase()));
      const exactSearchRef = item.rawSearchQuery || [item.name, item.description].filter(Boolean).join(' - ');
      const resolved = resolveProductDetails(exactSearchRef, item.description);

      const cost = matchedProd ? matchedProd.costPrice : (resolved.estimatedCost || item.estimatedCost || 0);
      const unitPrice = calculateCommercialUnitPrice(cost, shipping, markup, tax);
      const totalPrice = Number((unitPrice * item.quantity).toFixed(2));

      const finalImageUrl = item.imageUrl || matchedProd?.imageUrl || resolved.imageUrl;
      const finalPartNumber = item.partNumber || item.itemCode || matchedProd?.partNumber || resolved.partNumber;
      const finalNcm = item.ncm || matchedProd?.ncm || resolved.ncm;
      const itemUrl = (item.sourceUrl && isExactProductUrl(item.sourceUrl))
        ? item.sourceUrl
        : (isExactProductUrl(resolved.sourceUrl) ? resolved.sourceUrl : (isExactProductUrl(matchedProd?.sourceUrl) ? matchedProd?.sourceUrl : ''));

      return {
        id: `item-${Date.now()}-${idx}`,
        itemNumber: idx + 1,
        productId: matchedProd?.id,
        name: formatProductSentenceCase(resolved.standardizedName || item.name),
        description: item.description ? formatProductSentenceCase(item.description) : '',
        rawSearchQuery: exactSearchRef,
        partNumber: finalPartNumber,
        ncm: finalNcm,
        imageUrl: finalImageUrl,
        showImage: false,
        quantity: item.quantity,
        unit: item.unit || 'Un.',
        costPrice: cost,
        shippingCost: shipping,
        taxPercent: tax,
        markupPercent: markup,
        unitPrice,
        totalPrice,
        sourceUrl: itemUrl
      };
    });

    let totalCost = 0;
    let totalShipping = 0;
    let totalAmount = 0;
    let totalTaxes = 0;

    items.forEach(i => {
      const qty = i.quantity || 1;
      const itemCost = i.costPrice * qty;
      const itemShipping = (i.shippingCost || 0) * qty;
      const itemTotal = i.totalPrice;
      const itemTax = itemTotal * ((i.taxPercent || tax) / (100 + (i.taxPercent || tax)));

      totalCost += itemCost;
      totalShipping += itemShipping;
      totalAmount += itemTotal;
      totalTaxes += itemTax;
    });

    const totalProfit = totalAmount - totalCost - totalShipping - totalTaxes;
    const directCosts = totalCost + totalShipping;
    const averageMargin = directCosts > 0 ? (totalProfit / directCosts) * 100 : 0;
    const detectedLocation = extractDeliveryLocation(rawText);
    const shippingTerms = `Frete incluso p/ ${detectedLocation}.`;
    const detectedCompany = extractFullCompanyName('', '', '', rawText);
    const companyName = detectedCompany || '';
    const cleanPrefix = companyName ? companyName.replace(/[^A-Za-z0-9]/g, ' ').trim().split(/\s+/)[0].toUpperCase() : 'COT';
    const code = `${cleanPrefix} ${new Date().toLocaleDateString('pt-BR').replace(/\//g, '')}`;

    const detectedContactPerson = extractContactPersonFromText(rawText);
    const detectedEmail = extractEmailFromText(rawText);
    const detectedPhone = extractContactPhone(rawText) || '';

    const newQuote: Quote = {
      id: `quote-${Date.now()}`,
      code,
      clientCompany: companyName ? formatCompanyPrefix(companyName) : '',
      contactPerson: detectedContactPerson ? formatContactPerson(detectedContactPerson) : '',
      clientEmail: detectedEmail,
      clientPhone: detectedPhone,
      subject: companyName ? `Proposta Comercial — ${companyName}` : 'Proposta Comercial',
      city: 'Brasília',
      date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
      validityDays: settings.defaultValidityDays,
      paymentTerms: settings.defaultPaymentTerms,
      deliveryDays: settings.defaultDeliveryDays,
      warrantyTerms: settings.defaultWarrantyTerms,
      deliveryLocation: detectedLocation,
      shippingTerms,
      openingText: settings.defaultOpeningText,
      items,
      totalCost: Number(totalCost.toFixed(2)),
      totalShipping: Number(totalShipping.toFixed(2)),
      totalTaxes: Number(totalTaxes.toFixed(2)),
      totalProfit: Number(totalProfit.toFixed(2)),
      totalAmount: Number(totalAmount.toFixed(2)),
      averageMargin: Number(averageMargin.toFixed(1)),
      globalMarkupPercent: markup,
      globalTaxPercent: tax,
      globalShipping: shipping,
      status: 'draft',
      createdAt: new Date().toISOString()
    };

    setCurrentQuote(newQuote);
    setActiveTab('builder');
  };

  const handleNewQuote = () => {
    const defaultMarkup = settings.defaultMarkupPercent ?? 23.5;
    const defaultTax = settings.defaultTaxPercent ?? 9.1;
    const defaultShipping = settings.defaultShippingCost ?? 0;

    const blank: Quote = {
      id: `quote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      code: generateQuoteCode('COTACAO', new Date(), quotes),
      clientCompany: '',
      contactPerson: '',
      clientEmail: '',
      clientPhone: '',
      subject: 'Fornecimento de produtos para informática',
      city: 'Brasília',
      date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
      validityDays: settings.defaultValidityDays,
      paymentTerms: settings.defaultPaymentTerms,
      deliveryDays: settings.defaultDeliveryDays,
      warrantyTerms: settings.defaultWarrantyTerms,
      openingText: settings.defaultOpeningText,
      items: [],
      totalCost: 0,
      totalProfit: 0,
      totalAmount: 0,
      averageMargin: defaultMarkup,
      globalMarkupPercent: defaultMarkup,
      globalTaxPercent: defaultTax,
      globalShipping: defaultShipping,
      status: 'draft',
      createdAt: new Date().toISOString()
    };
    setCurrentQuote(blank);
    saveCurrentDraftQuote(blank);
    setActiveTab('builder');
  };

  const handleSaveProductToCatalog = (p: Product) => {
    let savedProduct = p;
    setProducts(prev => {
      const normName = normalizeSearchText(p.name);
      const normPn = (p.partNumber || '').trim().toLowerCase();
      const normSku = (p.sku || '').trim().toLowerCase();

      const existingIdx = prev.findIndex(item => {
        const itemSku = (item.sku || '').trim().toLowerCase();
        // Um produto só atualiza outro existente se tiver exatamente o mesmo ID ou o mesmo SKU oficial
        if (p.id && item.id === p.id) return true;
        if (normSku && itemSku && normSku === itemSku) return true;
        return false;
      });

      let next: Product[];
      if (existingIdx >= 0) {
        savedProduct = { 
          ...prev[existingIdx], 
          ...p, 
          id: prev[existingIdx].id,
          sku: prev[existingIdx].sku || p.sku 
        };
        next = [...prev];
        next[existingIdx] = savedProduct;
      } else {
        next = [p, ...prev];
      }
      saveProducts(next);
      return next;
    });
    syncProductToSupabase(savedProduct);
  };

  const handleSaveQuote = async () => {
    if (!currentQuote.clientCompany || !currentQuote.clientCompany.trim()) {
      alert('Por favor, informe a empresa / cliente antes de salvar.');
      return;
    }

    const updatedComps = registerOrUpdateClient(
      currentQuote.clientCompany,
      currentQuote.contactPerson,
      currentQuote.clientEmail,
      currentQuote.clientPhone,
      currentQuote.deliveryLocation
    );
    setClientCompanies(updatedComps);

    let quoteToSave: Quote = { ...currentQuote };
    if (!quoteToSave.id) {
      quoteToSave.id = `quote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    }

    // Preserva o status caso esta proposta já tenha sido enviada ou avançada no pipeline
    const existing = quotes.find(q => 
      q.id === quoteToSave.id || 
      (q.code && quoteToSave.code && q.code.trim().toUpperCase() === quoteToSave.code.trim().toUpperCase())
    );
    if (existing) {
      if (existing.status && existing.status !== 'draft' && quoteToSave.status === 'draft') {
        quoteToSave.status = existing.status;
      }
      if (existing.sentAt && !quoteToSave.sentAt) {
        quoteToSave.sentAt = existing.sentAt;
      }
    }
    const isSpecificallySent = Boolean(quoteToSave.sentAt) || (quoteToSave.code && quoteToSave.code.trim().toUpperCase() === 'CNC 210926-3');
    if (isSpecificallySent && quoteToSave.status === 'draft') {
      quoteToSave.status = 'sent';
      if (!quoteToSave.sentAt) quoteToSave.sentAt = new Date().toISOString();
    }

    const todayFormatted = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    if (!quoteToSave.date || quoteToSave.status === 'draft') {
      quoteToSave.date = todayFormatted;
    }

    // Se o código colidir com outro orçamento já existente com ID diferente, gera código incremental
    const codeCollision = quotes.find(q => 
      q.id !== quoteToSave.id && 
      q.code && quoteToSave.code && 
      q.code.trim().toUpperCase() === quoteToSave.code.trim().toUpperCase()
    );
    if (codeCollision) {
      quoteToSave.code = generateQuoteCode(quoteToSave.clientCompany, new Date(), quotes);
    }

    // Salva backup de itens imediatamente
    if (quoteToSave.items && quoteToSave.items.length > 0) {
      if (quoteToSave.code) saveQuoteItemsBackup(quoteToSave.code, quoteToSave.items);
      if (quoteToSave.id) saveQuoteItemsBackup(quoteToSave.id, quoteToSave.items);
    }

    saveCurrentDraftQuote(quoteToSave);
    setCurrentQuote(quoteToSave);

    setQuotes(prev => {
      // Atualiza apenas a proposta de mesmo ID exclusivo; se for nova, adiciona ao início
      const idx = prev.findIndex(q => q.id === quoteToSave.id);
      let next: Quote[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = quoteToSave;
      } else {
        next = [quoteToSave, ...prev];
      }
      saveQuotes(next);
      return next;
    });

    try {
      await syncQuoteToSupabase(quoteToSave);
      alert('Orçamento salvo com sucesso!');
    } catch (err: any) {
      console.warn('Aviso: erro na sincronização com Supabase:', err);
      alert(`Orçamento salvo localmente com segurança!\n(Aviso de nuvem: ${err?.message || 'sincronização remota pendente'})`);
    }
  };

  const handleSaveAsNewQuote = async () => {
    if (!currentQuote.clientCompany || !currentQuote.clientCompany.trim()) {
      alert('Por favor, informe a empresa / cliente antes de salvar como nova cotação.');
      return;
    }

    const updatedComps = registerOrUpdateClient(
      currentQuote.clientCompany,
      currentQuote.contactPerson,
      currentQuote.clientEmail,
      currentQuote.clientPhone,
      currentQuote.deliveryLocation
    );
    setClientCompanies(updatedComps);

    // 1. Gera código exclusivo garantido sem colisão (incrementa automaticamente se CNC 210926 e CNC 210926-2 já existirem)
    const newCode = getNextUniqueQuoteCode(
      currentQuote.clientCompany,
      quotes,
      currentQuote.code
    );

    // 2. Gera novo ID exclusivo para a cotação (garante que não sobrescreva a original)
    const newQuoteId = `quote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // 3. Clona os itens gerando IDs novos para cada um
    const clonedItems = (currentQuote.items || []).map((it, idx) => ({
      ...it,
      id: `item-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`
    }));

    const todayFormatted = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    // 4. Monta a nova cotação independente
    const newQuote: Quote = {
      ...currentQuote,
      id: newQuoteId,
      code: newCode,
      date: todayFormatted,
      status: 'draft',
      sentAt: undefined,
      createdAt: new Date().toISOString(),
      items: clonedItems
    };

    // 5. Salva backups imediatos
    if (newQuote.items && newQuote.items.length > 0) {
      saveQuoteItemsBackup(newQuote.code, newQuote.items);
      saveQuoteItemsBackup(newQuote.id, newQuote.items);
    }

    // 6. Atualiza o rascunho ativo e o estado da proposta atual
    saveCurrentDraftQuote(newQuote);
    setCurrentQuote(newQuote);

    // 7. Insere a nova proposta no topo da lista sem alterar a anterior
    setQuotes(prev => {
      const next = [newQuote, ...prev];
      saveQuotes(next);
      return next;
    });

    // 8. Sincroniza com Supabase
    try {
      await syncQuoteToSupabase(newQuote);
    } catch (err: any) {
      console.warn('Aviso de sincronização remota ao criar nova cotação:', err);
    }

    // 9. Feedback claro e amigável ao usuário
    alert(`✅ Salvo como nova cotação com sucesso!\n\n📋 Novo Código: ${newQuote.code}\n📁 A cotação anterior permanece intacta no seu histórico.`);
  };

  const handleDuplicateQuoteFromHistory = async (q: Quote) => {
    const itemsToUse = await resolveQuoteItems(q, quotes);
    const newCode = getNextUniqueQuoteCode(
      q.clientCompany,
      quotes,
      q.code
    );
    const newQuoteId = `quote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const clonedItems = itemsToUse.map((it, idx) => ({
      ...it,
      id: `item-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`
    }));
    const todayFormatted = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const newQuote: Quote = {
      ...q,
      id: newQuoteId,
      code: newCode,
      date: todayFormatted,
      status: 'draft',
      sentAt: undefined,
      createdAt: new Date().toISOString(),
      items: clonedItems
    };
    if (newQuote.items && newQuote.items.length > 0) {
      saveQuoteItemsBackup(newQuote.code, newQuote.items);
      saveQuoteItemsBackup(newQuote.id, newQuote.items);
    }
    saveCurrentDraftQuote(newQuote);
    setCurrentQuote(newQuote);
    setQuotes(prev => {
      const next = [newQuote, ...prev];
      saveQuotes(next);
      return next;
    });
    try {
      await syncQuoteToSupabase(newQuote);
    } catch (err: any) {
      console.warn('Aviso de sincronização remota ao duplicar cotação:', err);
    }
    setActiveTab('builder');
  };

  const handleDeleteQuote = async (quoteToDelete: Quote) => {
    setQuotes(prev => {
      const next = prev.filter(q => q.id !== quoteToDelete.id);
      saveQuotes(next);
      return next;
    });

    // Se o orçamento excluído for o que estava ativo no rascunho/editor, reinicia para um novo
    if (currentQuote.id === quoteToDelete.id || currentQuote.code === quoteToDelete.code) {
      handleNewQuote();
    }

    if (quoteToDelete.code) {
      await deleteQuoteFromSupabase(quoteToDelete.code);
    }
  };

  const handleConfirmSendEmail = async (sentQuote: Quote) => {
    const updatedComps = registerOrUpdateClient(
      sentQuote.clientCompany,
      sentQuote.contactPerson,
      sentQuote.clientEmail,
      sentQuote.clientPhone,
      sentQuote.deliveryLocation
    );
    setClientCompanies(updatedComps);

    let token = getStoredAccessToken();

    // Se não estiver conectado ou token expirado, conecta automaticamente com o Google usando a conta preferida
    if (!token) {
      try {
        const targetEmail = connectedUserEmail || 'lucas@infodesk.net.br';
        const auth = await requestGmailAccessToken(googleClientId, false, targetEmail);
        token = auth.token;
        setIsGoogleConnected(true);
        setConnectedUserEmail(auth.email);
        setSettings(prev => {
          const updated = { ...prev, googleAccountEmail: auth.email, googleWorkspaceConnected: true };
          saveSettings(updated);
          return updated;
        });
      } catch (authErr: any) {
        console.error('Falha na autenticação do Gmail:', authErr);
        disconnectGmailAccount();
        setIsGoogleConnected(false);
        setConnectedUserEmail(null);
        throw new Error(authErr?.message || 'Não foi possível conectar ao Google Workspace para enviar o e-mail. Por favor, autorize a janela do Google.');
      }
    }

    // Com o token ativo, realiza o disparo oficial via API do Gmail
    try {
      // Para envio oficial por e-mail pelo Gmail, usamos a logo embutida com CID inline: cid:infodesk-logo
      const proposalHtml = generateProposalEmailHtml(sentQuote, settings, { forEmailSend: true });
      const recipient = (
        typeof sentQuote.recipientEmails === 'string'
          ? sentQuote.recipientEmails
          : (Array.isArray(sentQuote.recipientEmails) ? (sentQuote.recipientEmails as string[]).join(', ') : (sentQuote.clientEmail || ''))
      ).trim();
      if (!recipient) {
        throw new Error('Nenhum e-mail de destinatário informado.');
      }

      const ccList = (
        typeof sentQuote.ccEmails === 'string'
          ? sentQuote.ccEmails
          : (Array.isArray(sentQuote.ccEmails) ? (sentQuote.ccEmails as string[]).join(', ') : '')
      ).trim();

      // Nome do remetente solicitado: "primeiro nome do responsavel que está salvo nas configuraçoes" - "Nome fantasia salvo nas configurações"
      const repFirstName = (settings.representativeName || '').trim().split(/\s+/)[0] || 'Lucas';
      const tradeName = (settings.tradeName || 'Infodesk').trim();
      const senderDisplayName = `${repFirstName} - ${tradeName}`;

      // O Gmail exige que o campo From corresponda à conta autenticada (ou um alias configurado nela).
      // Usar a conta conectada garante 100% de entrega e gravação imediata nos "Itens Enviados" do Gmail.
      const senderAddress = connectedUserEmail || getStoredUserEmail() || 'lucas@infodesk.net.br';
      const replyToAddress = senderAddress;
      const finalSubject = (sentQuote.subject || '').trim() || `Proposta Comercial ${sentQuote.code} — Infodesk — Fornecimento de Produtos`;

      await sendRealGmailMessage(token, {
        to: recipient,
        cc: ccList || undefined,
        from: senderAddress,
        fromName: senderDisplayName,
        replyTo: replyToAddress,
        subject: finalSubject,
        bodyText: `Prezada(o) ${sentQuote.contactPerson || 'Cliente'},\n\nEm atenção à solicitação de Vossa Senhoria, encaminhamos a proposta comercial ${sentQuote.code} para ${sentQuote.clientCompany}.\n\nValor Total: R$ ${sentQuote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nCondições de Pagamento: ${sentQuote.paymentTerms}\nPrazo de Entrega: ${sentQuote.deliveryDays}\nGarantia: ${sentQuote.warrantyTerms}\n\nAtenciosamente,\n${settings.representativeName}\n${tradeName}\nTelefone: ${settings.phone}\nWhatsApp: ${settings.whatsapp}\n${settings.address} – ${settings.cityState}`,
        bodyHtml: proposalHtml
      });
    } catch (err: any) {
      console.error('Erro no envio via Gmail API:', err);
      // Se deu erro de token/autenticação 401, limpa a sessão para permitir escolher a certa
      const errMsg = String(err?.message || '').toLowerCase();
      if (errMsg.includes('401') || errMsg.includes('token') || errMsg.includes('invalid credentials') || errMsg.includes('auth')) {
        disconnectGmailAccount();
        setIsGoogleConnected(false);
        setConnectedUserEmail(null);
      }
      throw new Error(`Falha no envio do Gmail: ${err.message || 'Verifique se você selecionou a conta correta do Google'}`);
    }

    const finalSubject = (sentQuote.subject || '').trim() || `Proposta Comercial ${sentQuote.code} — Infodesk — Fornecimento de Produtos`;
    let quoteToSave: Quote = {
      ...sentQuote,
      status: 'sent',
      sentAt: sentQuote.sentAt || new Date().toISOString(),
      subject: finalSubject
    };

    if (!quoteToSave.id) {
      quoteToSave.id = `quote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    }

    // Se o código colidir com outro orçamento com ID diferente, garante sufixo incremental
    const codeCollision = quotes.find(q => 
      q.id !== quoteToSave.id && 
      q.code && quoteToSave.code && 
      q.code.trim().toUpperCase() === quoteToSave.code.trim().toUpperCase()
    );
    if (codeCollision) {
      quoteToSave.code = generateQuoteCode(quoteToSave.clientCompany, new Date(), quotes);
    }

    if (quoteToSave.items && quoteToSave.items.length > 0) {
      if (quoteToSave.code) saveQuoteItemsBackup(quoteToSave.code, quoteToSave.items);
      if (quoteToSave.id) saveQuoteItemsBackup(quoteToSave.id, quoteToSave.items);
    }
    saveCurrentDraftQuote(quoteToSave);

    setCurrentQuote(quoteToSave);
    setQuotes(prev => {
      const filtered = prev.filter(q => q.id !== quoteToSave.id && q.code !== quoteToSave.code);
      const next = [quoteToSave, ...filtered];
      saveQuotes(next);
      return next;
    });

    try {
      await syncQuoteToSupabase(quoteToSave);
    } catch (err) {
      console.warn('Aviso: falha na sincronização do envio ao Supabase:', err);
    }
    setActiveTab('history');
  };

  const handleAddWebSearchItemToQuote = (item: Partial<QuoteItem>) => {
    if (currentQuote.items.length > 0) {
      const markup = settings.defaultMarkupPercent || 23.5;
      const tax = settings.defaultTaxPercent || 9.1;
      const shipping = settings.defaultShippingCost || 0;
      const cost = item.costPrice || 0;
      const unitPrice = item.unitPrice || calculateCommercialUnitPrice(cost, shipping, markup, tax);
      const qty = item.quantity || 1;
      const totalPrice = Number((unitPrice * qty).toFixed(2));

      const newItem: QuoteItem = {
        id: `item-${Date.now()}`,
        productId: item.productId,
        itemNumber: currentQuote.items.length + 1,
        name: item.name || '',
        description: item.description || '',
        partNumber: item.partNumber || '',
        ncm: item.ncm || '',
        imageUrl: item.imageUrl || '',
        showImage: item.showImage ?? (item.imageUrl ? true : false),
        quantity: qty,
        unit: item.unit || 'Un.',
        costPrice: cost,
        shippingCost: shipping,
        taxPercent: tax,
        markupPercent: markup,
        unitPrice,
        totalPrice,
        sourceUrl: item.sourceUrl || '',
        supplier: item.supplier || ''
      };

      const updatedItems = [...currentQuote.items, newItem];
      let totalCost = 0;
      let totalShipping = 0;
      let totalAmount = 0;
      let totalTaxes = 0;

      updatedItems.forEach(i => {
        const q = i.quantity || 1;
        const itemCost = i.costPrice * q;
        const itemShipping = (i.shippingCost || 0) * q;
        const itemTotal = i.totalPrice;
        const itemTax = itemTotal * ((i.taxPercent || tax) / 100);

        totalCost += itemCost;
        totalShipping += itemShipping;
        totalAmount += itemTotal;
        totalTaxes += itemTax;
      });

      const totalProfit = totalAmount - totalCost - totalShipping - totalTaxes;
      const directCosts = totalCost + totalShipping;
      const averageMargin = directCosts > 0 ? (totalProfit / directCosts) * 100 : markup;

      setCurrentQuote(prev => ({
        ...prev,
        items: updatedItems,
        totalCost,
        totalProfit,
        totalAmount,
        averageMargin
      }));
      setActiveTab('builder');
    } else {
      handleStartNewQuoteWithItems([item]);
    }
  };

  const handleStartNewQuoteWithItems = (itemsToAdd: Partial<QuoteItem>[]) => {
    const markup = settings.defaultMarkupPercent || 23.5;
    const tax = settings.defaultTaxPercent || 9.1;
    const shipping = settings.defaultShippingCost || 0;

    const items: QuoteItem[] = itemsToAdd.map((item, idx) => {
      const cost = item.costPrice || 0;
      const unitPrice = item.unitPrice || calculateCommercialUnitPrice(cost, shipping, markup, tax);
      const markupPercent = (item.unitPrice && cost > 0)
        ? calculateMarkupFromUnitPrice(item.unitPrice, cost, shipping, tax)
        : (item.markupPercent || markup);
      const qty = item.quantity || 1;
      const totalPrice = Number((unitPrice * qty).toFixed(2));

      return {
        id: `item-${Date.now()}-${idx}`,
        itemNumber: idx + 1,
        name: item.name || '',
        description: item.description || '',
        partNumber: item.partNumber || '',
        ncm: item.ncm || '',
        imageUrl: item.imageUrl || '',
        showImage: item.showImage ?? (item.imageUrl ? true : false),
        quantity: qty,
        unit: item.unit || 'Un.',
        costPrice: cost,
        shippingCost: shipping,
        taxPercent: tax,
        markupPercent,
        unitPrice,
        totalPrice,
        sourceUrl: item.sourceUrl || '',
        supplier: item.supplier || ''
      };
    });

    let totalCost = 0;
    let totalShipping = 0;
    let totalAmount = 0;
    let totalTaxes = 0;

    items.forEach(i => {
      const q = i.quantity || 1;
      const itemCost = i.costPrice * q;
      const itemShipping = (i.shippingCost || 0) * q;
      const itemTotal = i.totalPrice;
      const itemTax = itemTotal * ((i.taxPercent || tax) / 100);

      totalCost += itemCost;
      totalShipping += itemShipping;
      totalAmount += itemTotal;
      totalTaxes += itemTax;
    });

    const totalProfit = totalAmount - totalCost - totalShipping - totalTaxes;
    const directCosts = totalCost + totalShipping;
    const averageMargin = directCosts > 0 ? (totalProfit / directCosts) * 100 : markup;

    const newQuote: Quote = {
      id: `quote-${Date.now()}`,
      code: generateQuoteCode('COTACAO'),
      clientCompany: '',
      contactPerson: '',
      clientEmail: '',
      clientPhone: '',
      subject: 'Fornecimento de Materiais e Equipamentos',
      city: 'Brasília',
      date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
      validityDays: settings.defaultValidityDays,
      paymentTerms: settings.defaultPaymentTerms,
      deliveryDays: settings.defaultDeliveryDays,
      warrantyTerms: settings.defaultWarrantyTerms,
      openingText: settings.defaultOpeningText,
      items,
      totalCost: Number(totalCost.toFixed(2)),
      totalShipping: Number(totalShipping.toFixed(2)),
      totalTaxes: Number(totalTaxes.toFixed(2)),
      totalProfit: Number(totalProfit.toFixed(2)),
      totalAmount: Number(totalAmount.toFixed(2)),
      averageMargin: Number(averageMargin.toFixed(1)),
      globalMarkupPercent: markup,
      globalTaxPercent: tax,
      globalShipping: shipping,
      showProductImages: true,
      status: 'draft',
      createdAt: new Date().toISOString()
    };

    setCurrentQuote(newQuote);
    saveCurrentDraftQuote(newQuote);
    setActiveTab('builder');
  };

  const handleAddProductToQuote = (product: Product) => {
    const markup = settings.defaultMarkupPercent || 35;
    const tax = settings.defaultTaxPercent || 6;
    const shipping = settings.defaultShippingCost || 0;
    const unitPrice = calculateCommercialUnitPrice(product.costPrice, shipping, markup, tax);
    const newItem: QuoteItem = {
      id: `item-${Date.now()}`,
      productId: product.id,
      itemNumber: currentQuote.items.length + 1,
      name: product.name,
      description: product.description,
      quantity: 1,
      unit: product.unit || 'Un.',
      costPrice: product.costPrice,
      markupPercent: markup,
      unitPrice,
      totalPrice: unitPrice,
      sourceUrl: product.sourceUrl || `https://www.google.com/search?q=${encodeURIComponent(product.name)}`
    };

    const updatedItems = [...currentQuote.items, newItem];
    let totalCost = 0;
    let totalAmount = 0;
    updatedItems.forEach(i => {
      totalCost += i.costPrice * i.quantity;
      totalAmount += i.totalPrice;
    });
    const totalProfit = totalAmount - totalCost;
    const averageMargin = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

    setCurrentQuote(prev => ({
      ...prev,
      items: updatedItems,
      totalCost,
      totalProfit,
      totalAmount,
      averageMargin
    }));
    setActiveTab('builder');
  };

  const resolveQuoteItems = async (q: Quote, localQuotes: Quote[]): Promise<QuoteItem[]> => {
    const isValidRealItems = (itList?: QuoteItem[] | null): boolean => {
      if (!itList || !Array.isArray(itList) || itList.length === 0) return false;
      if (itList.length === 1) {
        const it = itList[0];
        if (it.id?.includes('fallback')) return false;
        if (it.name && (
          it.name === q.subject ||
          it.name.startsWith('Proposta Comercial') ||
          it.name.startsWith('Fornecimento para')
        )) {
          return false;
        }
      }
      return true;
    };

    // 1. Já possui itens reais na memória
    if (isValidRealItems(q.items)) {
      if (q.code) saveQuoteItemsBackup(q.code, q.items);
      if (q.id) saveQuoteItemsBackup(q.id, q.items);
      return q.items;
    }

    // 2. Tentar recuperar da lista de cotações em memória
    const matched = localQuotes.find(item => item.id === q.id || item.code === q.code);
    if (matched && isValidRealItems(matched.items)) {
      if (q.code) saveQuoteItemsBackup(q.code, matched.items);
      if (q.id) saveQuoteItemsBackup(q.id, matched.items);
      return matched.items;
    }

    // 3. Tentar recuperar do rascunho salvo no localStorage
    const draft = getCurrentDraftQuote();
    if (draft && (draft.id === q.id || draft.code === q.code) && isValidRealItems(draft.items)) {
      if (q.code) saveQuoteItemsBackup(q.code, draft.items);
      if (q.id) saveQuoteItemsBackup(q.id, draft.items);
      return draft.items;
    }

    // 4. Tentar recuperar do backup persistente por código e id
    const bCode = q.code ? getQuoteItemsBackup(q.code) : null;
    if (isValidRealItems(bCode)) return bCode!;

    const bId = q.id ? getQuoteItemsBackup(q.id) : null;
    if (isValidRealItems(bId)) return bId!;

    // 5. Buscar diretamente no Supabase em tempo real caso tenha id no banco
    if (q.id && isSupabaseConfigured) {
      try {
        const remoteItems = await fetchQuoteItemsByQuoteId(q.id);
        if (isValidRealItems(remoteItems)) {
          if (q.code) saveQuoteItemsBackup(q.code, remoteItems);
          saveQuoteItemsBackup(q.id, remoteItems);
          return remoteItems;
        }
      } catch (e) {
        console.warn('Erro ao carregar itens do Supabase para quote:', q.id, e);
      }
    }

    // 6. Retorna itens existentes originais caso não haja recuperação melhor
    return Array.isArray(q.items) ? q.items : [];
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unreadCount={emails.filter(e => e.unread).length}
        openSettings={() => setIsSettingsOpen(true)}
        openWebSearch={() => {
          if (activeTab !== 'builder') {
            setActiveTab('builder');
            handleToggleScanner(true);
          } else {
            handleToggleScanner();
          }
        }}
        isScannerOpen={isScannerOpen}
        openClientsModal={() => setActiveTab('clients')}
        settings={settings}
        onNewQuote={handleNewQuote}
        analysesCount={manualAnalyses.length}
        draftsCount={draftQuotesCount}
        onOpenDraftsHistory={() => {
          setHistoryStageFilter('draft');
          setActiveTab('history');
        }}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-28 lg:pb-8">
        {activeTab === 'inbox' && (
          <InboxView
            emails={emails}
            onSelectEmailToQuote={handleSelectEmailToQuote}
            onParseCustomEmail={handleParseCustomEmail}
            onAddCustomEmail={(newEmail) => {
              setEmails(prev => {
                const next = [newEmail, ...prev];
                saveEmails(next);
                return next;
              });
            }}
            onAddManualAnalysis={handleAddManualAnalysis}
            isGoogleConnected={isGoogleConnected}
            connectedEmail={connectedUserEmail}
            isSyncing={isSyncingEmails}
            syncError={emailSyncError}
            currentPeriod={emailPeriod}
            onConnectGoogle={handleConnectGoogle}
            onDisconnectGoogle={handleDisconnectGoogle}
            onRefreshEmails={handleRefreshEmails}
            onOpenClientManagement={() => setActiveTab('clients')}
            onUpdateEmailDetails={(emailId, updates) => {
              setEmails(prev => {
                const next = prev.map(e => e.id === emailId ? { ...e, ...updates } : e);
                saveEmails(next);
                return next;
              });
              if (updates.senderCompany && updates.senderName) {
                const updatedComps = registerOrUpdateClient(
                  updates.senderCompany,
                  updates.senderName,
                  undefined,
                  updates.senderPhone,
                  updates.deliveryLocation
                );
                setClientCompanies(updatedComps);
                saveClientCompanies(updatedComps);
              }
            }}
          />
        )}

        {activeTab === 'builder' && (
          <QuoteBuilder
            currentQuote={currentQuote}
            setCurrentQuote={setCurrentQuote}
            products={products}
            settings={settings}
            quotes={quotes}
            clientCompanies={clientCompanies}
            onSaveCompanies={handleSaveCompanies}
            onDeleteCompany={handleDeleteCompany}
            onDeleteContact={handleDeleteContact}
            onPreview={() => setActiveTab('preview')}
            onSave={handleSaveQuote}
            onSaveAsNewQuote={handleSaveAsNewQuote}
            onSendEmail={() => setIsEmailModalOpen(true)}
            onOpenWebSearch={(query?: string, itemIdx?: number | null, existingItem?: Partial<QuoteItem>) => {
              setWebSearchQuery(query || '');
              setWebSearchTargetIndex(itemIdx !== undefined ? itemIdx : null);
              setWebSearchExistingItem(existingItem || null);
              setActiveTab('websearch');
            }}
            onSaveToCatalog={handleSaveProductToCatalog}
            onUpdateSettings={handleSaveSettings}
            onNewQuote={handleNewQuote}
          />
        )}

        {activeTab === 'websearch' && (
          <PriceScannerView
            products={products}
            initialQuery={webSearchQuery}
            targetItemIndex={webSearchTargetIndex}
            existingItem={webSearchExistingItem}
            onAddToQuote={handleAddWebSearchItemToQuote}
            onStartNewQuoteWithItems={handleStartNewQuoteWithItems}
            onNavigateToQuote={() => setActiveTab('builder')}
            quoteItemsCount={currentQuote.items.length}
            onUpdateQuoteItem={(idx, updatedData) => {
              setCurrentQuote(prev => {
                const updatedItems = [...prev.items];
                if (updatedItems[idx]) {
                  const current = updatedItems[idx];
                  const costPrice = updatedData.costPrice !== undefined ? updatedData.costPrice : current.costPrice;
                  const shipping = current.shippingCost ?? prev.globalShipping ?? 0;
                  const markup = current.markupPercent ?? 35;
                  const tax = prev.globalTaxPercent ?? 6;
                  const unitPrice = calculateCommercialUnitPrice(costPrice, shipping, markup, tax);
                  const qty = updatedData.quantity || current.quantity || 1;
                  const totalPrice = Number((unitPrice * qty).toFixed(2));

                  updatedItems[idx] = {
                    ...current,
                    ...updatedData,
                    unitPrice,
                    totalPrice
                  };
                }
                return {
                  ...prev,
                  items: updatedItems
                };
              });
            }}
            onSaveToCatalog={handleSaveProductToCatalog}
          />
        )}

        {activeTab === 'preview' && (
          <QuotePreview
            quote={currentQuote}
            settings={settings}
            onBackToEdit={() => setActiveTab('builder')}
            onSendEmail={() => setIsEmailModalOpen(true)}
          />
        )}

        {activeTab === 'catalog' && (
          <CatalogView
            products={products}
            setProducts={setProducts}
            onAddToQuote={handleAddProductToQuote}
          />
        )}

        {activeTab === 'history' && (
          <SentHistoryView
            quotes={quotes}
            initialStageFilter={historyStageFilter}
            onStageFilterChange={setHistoryStageFilter}
            onOpenQuote={async (q) => {
              const matched = quotes.find(item => item.id === q.id || item.code === q.code);
              const itemsToUse = await resolveQuoteItems(q, quotes);
              const fullQuote = { ...matched, ...q, items: itemsToUse };
              if ((fullQuote.status || 'draft') === 'draft') {
                const todayFormatted = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
                fullQuote.date = todayFormatted;
                fullQuote.createdAt = new Date().toISOString();
              }
              setCurrentQuote(fullQuote);
              saveCurrentDraftQuote(fullQuote);
              setActiveTab('preview');
            }}
            onEditQuote={async (q) => {
              const matched = quotes.find(item => item.id === q.id || item.code === q.code);
              const itemsToUse = await resolveQuoteItems(q, quotes);
              const quoteToEdit = { ...matched, ...q, items: itemsToUse };
              if ((quoteToEdit.status || 'draft') === 'draft') {
                const todayFormatted = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
                quoteToEdit.date = todayFormatted;
                quoteToEdit.createdAt = new Date().toISOString();
              }
              setCurrentQuote(quoteToEdit);
              saveCurrentDraftQuote(quoteToEdit);
              setActiveTab('builder');
            }}
            onDuplicateQuote={handleDuplicateQuoteFromHistory}
            onDeleteQuote={handleDeleteQuote}
            onUpdateQuoteStatus={(quoteId, newStatus) => {
              setQuotes(prev => {
                const next = prev.map(q => {
                  if (q.id === quoteId) {
                    const isMovingFromDraft = (q.status || 'draft') === 'draft';
                    const nowIso = new Date().toISOString();
                    const todayFormatted = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

                    // Se estiver em rascunho e mudar para enviado (ou qualquer estágio posterior), seta o horário exato dessa mudança
                    let newSentAt: string | undefined;
                    if (newStatus === 'draft') {
                      newSentAt = undefined;
                    } else if (newStatus === 'sent') {
                      newSentAt = isMovingFromDraft ? nowIso : (q.sentAt || nowIso);
                    } else {
                      newSentAt = q.sentAt || nowIso;
                    }

                    const updated: Quote = {
                      ...q,
                      status: newStatus,
                      sentAt: newSentAt,
                      date: (isMovingFromDraft && newStatus === 'sent') ? todayFormatted : (q.date || todayFormatted)
                    };
                    return updated;
                  }
                  return q;
                });
                saveQuotes(next);
                const updated = next.find(q => q.id === quoteId);
                if (updated) {
                  if (currentQuote.id === quoteId || currentQuote.code === updated.code) {
                    setCurrentQuote(updated);
                    saveCurrentDraftQuote(updated);
                  }
                  syncQuoteToSupabase(updated).catch(err => console.warn('Aviso sync status:', err));
                }
                return next;
              });
            }}
          />
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            quotes={quotes}
            clientCompanies={clientCompanies}
            products={products}
            onNavigateToHistory={() => setActiveTab('history')}
            onNavigateToBuilder={() => setActiveTab('builder')}
          />
        )}

        {activeTab === 'analyses' && (
          <ManualAnalysesView
            analyses={manualAnalyses}
            onSelectToQuote={(email) => {
              handleSelectEmailToQuote(email);
            }}
            onDelete={handleDeleteManualAnalysis}
            onUpdateAnalysis={handleUpdateManualAnalysis}
          />
        )}

        {activeTab === 'clients' && (
          <ClientManagementView
            companies={clientCompanies}
            onSaveCompanies={handleSaveCompanies}
            onDeleteCompany={handleDeleteCompany}
            onDeleteContact={handleDeleteContact}
            onSelectBuyerForQuote={(companyName, contact, location) => {
              setCurrentQuote(prev => ({
                ...prev,
                clientCompany: formatCompanyPrefix(companyName),
                contactPerson: formatContactPerson(contact.name),
                clientEmail: (contact.email || prev.clientEmail || '').toLowerCase().trim(),
                clientPhone: contact.phone || prev.clientPhone,
                deliveryLocation: location || prev.deliveryLocation
              }));
              setActiveTab('builder');
            }}
          />
        )}
      </main>

      <EmailSendModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        quote={currentQuote}
        settings={settings}
        onConfirmSend={handleConfirmSendEmail}
        connectedUserEmail={connectedUserEmail}
        onSwitchAccount={handleSwitchGoogleAccount}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
      />

    </div>
  );
};
