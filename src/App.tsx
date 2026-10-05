import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { InboxView } from './components/InboxView';
import { QuoteBuilder } from './components/QuoteBuilder';
import { QuotePreview } from './components/QuotePreview';
import { EmailSendModal } from './components/EmailSendModal';
import { SettingsModal } from './components/SettingsModal';
import { GlobalCommandBarModal } from './components/GlobalCommandBarModal';
import { LoginView } from './components/LoginView';
import { 
  isSameDay, 
  parseQuoteTimestamp, 
  updateDraftQuotesToToday 
} from './utils/dateUtils';

import { lazyWithRetry } from './utils/lazyWithRetry';

// Code-Splitting dinâmico com lazyWithRetry para tolerância contra atualizações de versão (deploys)
const CatalogView = lazyWithRetry(() => import('./components/CatalogView').then(m => ({ default: m.CatalogView })));
const SentHistoryView = lazyWithRetry(() => import('./components/SentHistoryView').then(m => ({ default: m.SentHistoryView })));
const PriceScannerView = lazyWithRetry(() => import('./components/PriceScannerView').then(m => ({ default: m.PriceScannerView })));
const ClientManagementView = lazyWithRetry(() => import('./components/ClientManagementView').then(m => ({ default: m.ClientManagementView })));
const ManualAnalysesView = lazyWithRetry(() => import('./components/ManualAnalysesView').then(m => ({ default: m.ManualAnalysesView })));
const ProcurementView = lazyWithRetry(() => import('./components/ProcurementView').then(m => ({ default: m.ProcurementView })));
const DashboardView = lazyWithRetry(() => import('./components/DashboardView').then(m => ({ default: m.DashboardView })));

const TabLoadingFallback: React.FC = () => (
  <div className="flex flex-col items-center justify-center min-h-[45vh] p-8 text-center animate-in fade-in duration-150">
    <div className="w-9 h-9 border-3 border-sky-100 border-t-sky-600 rounded-full animate-spin mb-3 shadow-xs" />
    <span className="text-xs font-semibold text-slate-700 tracking-wide uppercase">Carregando Módulo</span>
    <span className="text-[11px] text-slate-400 mt-0.5">Infodesk SmartQuote</span>
  </div>
);
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
  deduplicateProductsList,
  getQuotes, 
  getSettings, 
  saveEmails, 
  saveProducts, 
  mergeRemoteProductsWithLocal,
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
  saveRegisteredUnitsList,
  deduplicateCompanyContacts,
  getDeletedContactIds,
  recordDeletedContactId,
  getDeletedCompanyIds,
  recordDeletedCompanyId,
  isBlockedOrTestCompany,
  getRegisteredPaymentMethods,
  saveRegisteredPaymentMethodsList,
  getDirectPurchases,
  saveDirectPurchases,
  getDeletedDirectPurchaseIds,
  getDeletedCategories,
  getDeletedUnits,
  getDeletedPaymentMethods,
  isProductDeleted,
  isBlockedOrTestQuote,
  getDeletedQuoteCodes,
  recordDeletedQuoteCode,
  getPurchasedProcurementRecords,
  savePurchasedProcurementRecord,
  findPurchasedProcurementRecord
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
  formatProposalValidityText,
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
  syncRegisteredMetadataToSupabase,
  fetchPaymentMethodsFromSupabase,
  syncPaymentMethodsToSupabase,
  fetchDirectPurchasesFromSupabase,
  syncDirectPurchasesToSupabase,
  deleteDirectPurchaseFromSupabase,
  deleteCategoryFromSupabase,
  deleteUnitFromSupabase,
  deletePaymentMethodFromSupabase,
  deleteProductFromSupabase,
  getCorporateSession,
  signOutCorporateUser,
  onCorporateAuthStateChange
} from './services/supabase';
import { 
  calculateCommercialUnitPrice, 
  calculateMarkupFromUnitPrice, 
  recalculateQuoteTotals 
} from './services/pricingEngine';

export type TabType = 'inbox' | 'builder' | 'preview' | 'catalog' | 'history' | 'websearch' | 'analyses' | 'clients' | 'dashboard' | 'purchases';

const VALID_TABS: TabType[] = ['inbox', 'builder', 'preview', 'catalog', 'history', 'websearch', 'analyses', 'clients', 'dashboard', 'purchases'];

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

  // Rastreamento de varredura ou identificação em andamento no Scanner de Preços
  const [isScannerBusy, setIsScannerBusy] = useState(false);
  const isScannerBusyRef = useRef(false);
  isScannerBusyRef.current = isScannerBusy;

  const activeTabRef = useRef<TabType>(activeTab);
  activeTabRef.current = activeTab;

  const onLeaveBuilderRef = useRef<(() => void) | null>(null);

  // Interceptador de segurança: confirmação antes de sair do Scanner durante pesquisa ativa
  const confirmScannerExitIfNeeded = useCallback((): boolean => {
    const isBusy = isScannerBusyRef.current || (typeof window !== 'undefined' && Boolean((window as any).__INFODESK_SCANNER_BUSY__));
    if (activeTabRef.current === 'websearch' && isBusy) {
      return window.confirm(
        'Uma identificação de produto ou busca de preços está em andamento no Scanner.\n\nSe você sair agora para outra aba, o progresso da pesquisa poderá ser cancelado.\n\nDeseja realmente sair da pesquisa?'
      );
    }
    return true;
  }, []);

  const setActiveTab = useCallback((target: TabType | ((prev: TabType) => TabType)) => {
    setActiveTabState(prev => {
      const nextTab = typeof target === 'function' ? target(prev) : target;
      if (VALID_TABS.includes(nextTab) && nextTab !== prev) {
        if (!confirmScannerExitIfNeeded()) {
          return prev; // Impede a saída da aba de pesquisa se o usuário cancelar
        }
        // Diretriz do Lucas: Ao sair da Cotação para outra aba, encerra edição de propostas do histórico
        if (prev === 'builder' && nextTab !== 'builder' && nextTab !== 'preview' && onLeaveBuilderRef.current) {
          onLeaveBuilderRef.current();
        }
        window.history.pushState({ tab: nextTab }, '', `#${nextTab}`);
        saveActiveTab(nextTab);
      }
      return nextTab;
    });
  }, [confirmScannerExitIfNeeded]);

  const isSettingsHydratedRef = useRef(false);
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
  const [previewSourceTab, setPreviewSourceTab] = useState<'builder' | 'history' | 'purchases'>('builder');
  const [syncNotice, setSyncNotice] = useState<{ message: string; type: 'success' | 'warning' } | null>(null);
  const [authenticatedUserEmail, setAuthenticatedUserEmail] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    let mounted = true;
    getCorporateSession().then(session => {
      if (!mounted) return;
      if (session?.user?.email) {
        setAuthenticatedUserEmail(session.user.email);
        try { localStorage.setItem('infodesk_auth_user', session.user.email); } catch {}
      } else {
        setAuthenticatedUserEmail(null);
        try { localStorage.removeItem('infodesk_auth_user'); } catch {}
      }
      setIsCheckingAuth(false);
    }).catch((err) => {
      console.warn('[Auth Check Error]:', err);
      if (mounted) {
        setAuthenticatedUserEmail(null);
        try { localStorage.removeItem('infodesk_auth_user'); } catch {}
        setIsCheckingAuth(false);
      }
    });

    const subscription = onCorporateAuthStateChange((session) => {
      if (mounted) {
        const email = session?.user?.email || null;
        setAuthenticatedUserEmail(email);
        try {
          if (email) localStorage.setItem('infodesk_auth_user', email);
          else localStorage.removeItem('infodesk_auth_user');
        } catch {}
      }
    });

    return () => {
      mounted = false;
      if (subscription && typeof (subscription as any).unsubscribe === 'function') {
        (subscription as any).unsubscribe();
      }
    };
  }, []);

  const handleLogout = async () => {
    try { localStorage.removeItem('infodesk_auth_user'); } catch {}
    await signOutCorporateUser();
    setAuthenticatedUserEmail(null);
  };

  const handleLoginSuccess = (userEmail: string) => {
    try { localStorage.setItem('infodesk_auth_user', userEmail); } catch {}
    setAuthenticatedUserEmail(userEmail);
  };

  const notifySync = useCallback((message: string, type: 'success' | 'warning' = 'warning') => {
    setSyncNotice({ message, type });
    setTimeout(() => {
      setSyncNotice(prev => (prev?.message === message ? null : prev));
    }, 6000);
  }, []);

  // Quantidade de produtos aprovados pendentes de compra para o badge na Navbar
  const pendingPurchasesCount = useMemo(() => {
    let count = 0;
    (quotes || []).forEach(q => {
      const isApproved = q.status === 'approved';
      (q.items || []).forEach(it => {
        const isItemApproved = it.approved === true || (isApproved && it.approved !== false);
        if (isItemApproved && it.purchaseStatus !== 'purchased' && it.purchaseStatus !== 'delivered') {
          count++;
        }
      });
    });
    return count;
  }, [quotes]);

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
    return quotes.filter(q => (q.status || 'draft') === 'draft' && Array.isArray(q.items) && q.items.length > 0).length;
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
  const [isCommandBarOpen, setIsCommandBarOpen] = useState(false);
  const [clientCompanies, setClientCompanies] = useState<ClientCompany[]>(() => getClientCompanies());

  // Atalho global do teclado: Ctrl + K ou Cmd + K abre a Command Bar
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandBarOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);
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
    recordDeletedCompanyId(companyId);
    const updated = clientCompanies.filter(c => c.id !== companyId);
    setClientCompanies(updated);
    saveClientCompanies(updated);
    await deleteCompanyFromSupabase(companyId);
  };

  const handleDeleteContact = async (contactId: string, companyId: string) => {
    const targetComp = clientCompanies.find(c => c.id === companyId);
    const targetContact = targetComp?.contacts.find(ct => ct.id === contactId);
    
    // 1. Grava no cofre de exclusões para impedir que qualquer cache ressuscite este contato
    recordDeletedContactId(contactId);

    // 2. Deleta no Supabase por ID e também por nome dentro da empresa
    await deleteContactFromSupabase(contactId, companyId, targetContact?.name);

    // 3. Atualiza estado e cache local
    const updated = clientCompanies.map(c => {
      if (c.id === companyId) {
        return {
          ...c,
          contacts: deduplicateCompanyContacts(c.contacts.filter(ct => ct.id !== contactId && ct.name.trim().toLowerCase() !== targetContact?.name?.trim().toLowerCase()))
        };
      }
      return c;
    });
    setClientCompanies(updated);
    saveClientCompanies(updated);
    await syncClientCompaniesToSupabase(updated);
  };

  const handleSaveSettings = async (newSettings: CompanySettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
    await syncCompanySettingsToSupabase(newSettings);
  };

  // Carregamento e sincronização com banco de dados do Supabase
  useEffect(() => {
    async function hydrateFromSupabase() {
      if (!isSupabaseConfigured || !authenticatedUserEmail) return;
      try {
        // Dispara o carregamento paralelo de todas as tabelas (ultra rápido, sem gargalos em cascata)
        const [
          remoteSettings,
          remoteMeta,
          remoteMethods,
          remoteDirectPurchases,
          remoteQuotes,
          remoteProducts,
          remoteCompanies
        ] = await Promise.all([
          fetchCompanySettingsFromSupabase().catch(() => null),
          fetchRegisteredMetadataFromSupabase().catch(() => null),
          fetchPaymentMethodsFromSupabase().catch(() => null),
          fetchDirectPurchasesFromSupabase().catch(() => null),
          fetchQuotesFromSupabase().catch(() => null),
          fetchProductsFromSupabase().catch(() => null),
          fetchClientCompaniesFromSupabase().catch(() => null)
        ]);

        // 1. Configurações
        // Lê o valor local ANTES de qualquer sobrescrita remota para preservar campos
        // que podem não existir ainda na coluna do Supabase (ex: daily_dollar_rate)
        const localSettingsBeforeHydrate = getSettings();
        if (remoteSettings) {
          if (!remoteSettings.defaultOpeningText || remoteSettings.defaultOpeningText.trim() === 'Em atenção...' || remoteSettings.defaultOpeningText.trim() === 'Em atenção' || remoteSettings.defaultOpeningText.trim().startsWith('Em atenção ao que foi solicitado')) {
            remoteSettings.defaultOpeningText = defaultCompanySettings.defaultOpeningText;
          }
          if (!remoteSettings.defaultPaymentTerms || remoteSettings.defaultPaymentTerms.trim() === '30 dias' || remoteSettings.defaultPaymentTerms.trim() === '30 dias.') {
            remoteSettings.defaultPaymentTerms = 'Faturado.';
          }
          if (!remoteSettings.defaultWarrantyTerms || remoteSettings.defaultWarrantyTerms.includes('12 (doze) meses') || remoteSettings.defaultWarrantyTerms.includes('contra eventuais problemas')) {
            remoteSettings.defaultWarrantyTerms = '06 (seis) meses balcão para defeitos de fabricação.';
          }
          if (remoteSettings.defaultMarkupPercent === undefined || remoteSettings.defaultMarkupPercent === 35 || remoteSettings.defaultMarkupPercent === 20 || remoteSettings.defaultMarkupPercent === 25) {
            remoteSettings.defaultMarkupPercent = 23.5;
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
          saveSettings(remoteSettings, false);
          isSettingsHydratedRef.current = true;
        } else {
          isSettingsHydratedRef.current = true;
        }

        // Sincronização e unificação de Categorias & Unidades com Supabase
        if (remoteMeta) {
          const deletedCats = getDeletedCategories();
          const deletedUnits = getDeletedUnits();

          if (remoteMeta.categories && remoteMeta.categories.length > 0) {
            const cleanRemoteCats = remoteMeta.categories.filter(c => !deletedCats.has(c.toLowerCase()));
            const ghostCats = remoteMeta.categories.filter(c => deletedCats.has(c.toLowerCase()));
            for (const g of ghostCats) {
              deleteCategoryFromSupabase(g).catch(() => {});
            }
            saveRegisteredCategoriesList(cleanRemoteCats);
          }
          if (remoteMeta.units && remoteMeta.units.length > 0) {
            const cleanRemoteUnits = remoteMeta.units.filter(u => !deletedUnits.has(u.toLowerCase()));
            const ghostUnits = remoteMeta.units.filter(u => deletedUnits.has(u.toLowerCase()));
            for (const g of ghostUnits) {
              deleteUnitFromSupabase(g).catch(() => {});
            }
            saveRegisteredUnitsList(cleanRemoteUnits);
          }
        }

        // Sincronização e unificação de Formas de Pagamento com Supabase
        try {
          const deletedMethods = getDeletedPaymentMethods();

          if (remoteMethods && remoteMethods.length > 0) {
            const cleanRemoteMethods = remoteMethods.filter(m => !deletedMethods.has(m.toLowerCase()));
            const ghostMethods = remoteMethods.filter(m => deletedMethods.has(m.toLowerCase()));
            for (const g of ghostMethods) {
              deletePaymentMethodFromSupabase(g).catch(() => {});
            }
            saveRegisteredPaymentMethodsList(cleanRemoteMethods);
          } else {
            const localMethods = getRegisteredPaymentMethods();
            if (localMethods && localMethods.length > 0) {
              syncPaymentMethodsToSupabase(localMethods).catch(() => {});
            }
          }
        } catch (err) {
          console.warn('Aviso ao sincronizar formas de pagamento na inicialização:', err);
        }

        // Sincronização e unificação de Compras Avulsas / Diretas com Supabase (Blindada contra perda no F5)
        try {
          const deletedDirectIds = getDeletedDirectPurchaseIds();
          const localDirectPurchases = getDirectPurchases().filter(item => !deletedDirectIds.has(item.id) && !deletedDirectIds.has(item.itemId || ''));
          
          if (remoteDirectPurchases && remoteDirectPurchases.length > 0) {
            const map = new Map<string, typeof remoteDirectPurchases[0]>();
            
            // Filtra e expurga do Supabase qualquer item que o usuário já tenha deletado
            remoteDirectPurchases.forEach(item => {
              if (deletedDirectIds.has(item.id) || deletedDirectIds.has(item.itemId || '')) {
                deleteDirectPurchaseFromSupabase(item.id).catch(() => {});
              } else {
                map.set(item.id, item);
              }
            });

            localDirectPurchases.forEach(localItem => {
              if (deletedDirectIds.has(localItem.id) || deletedDirectIds.has(localItem.itemId || '')) return;

              const remoteItem = map.get(localItem.id);
              if (!remoteItem) {
                // Item existe apenas no dispositivo: preserva e sincroniza
                map.set(localItem.id, localItem);
                syncDirectPurchasesToSupabase([localItem]).catch(() => {});
              } else {
                // Item existe em ambos: se o item local foi comprado ('purchased'), o local VENCE para não reverter no F5
                if (localItem.purchaseStatus === 'purchased') {
                  const mergedItem = {
                    ...remoteItem,
                    ...localItem,
                    purchaseStatus: 'purchased' as const,
                    shippingPending: localItem.shippingPending ?? remoteItem.shippingPending
                  };
                  map.set(localItem.id, mergedItem);
                  if (remoteItem.purchaseStatus !== 'purchased') {
                    syncDirectPurchasesToSupabase([mergedItem]).catch(() => {});
                  }
                } else {
                  map.set(localItem.id, {
                    ...remoteItem,
                    ...localItem,
                    shippingPending: localItem.shippingPending ?? remoteItem.shippingPending
                  });
                }
              }
            });
            saveDirectPurchases(Array.from(map.values()));
          } else if (localDirectPurchases.length > 0) {
            syncDirectPurchasesToSupabase(localDirectPurchases).catch(() => {});
          }
        } catch (err) {
          console.warn('Aviso ao sincronizar compras diretas na inicialização:', err);
        }

        // 2. Orçamentos
        if (remoteQuotes && remoteQuotes.length > 0) {
          const deletedCodes = getDeletedQuoteCodes();

          // Descarta rascunhos fantasmas vazios e propostas de teste ou já deletadas
          const validRemoteQuotes = remoteQuotes.filter(rq => {
            if (isBlockedOrTestQuote(rq) || deletedCodes.has((rq.code || '').trim().toUpperCase())) {
              return false;
            }
            const hasItems = Array.isArray(rq.items) && rq.items.length > 0;
            const hasAmount = Number(rq.totalAmount || 0) > 0;
            if ((rq.status || 'draft') === 'draft' && !hasItems && !hasAmount) {
              return false;
            }
            return true;
          });

          // Se veio alguma proposta de teste no Supabase durante a leitura, expurga imediatamente do banco
          remoteQuotes.forEach(rq => {
            if ((isBlockedOrTestQuote(rq) || deletedCodes.has((rq.code || '').trim().toUpperCase())) && rq.code) {
              deleteQuoteFromSupabase(rq.code).catch(() => {});
            }
          });

          // Merge seguro: se o banco retornar a cotação sem itens, preserva os itens salvos localmente ou do backup
          setQuotes(prevQuotes => {
            const mergedRemote = validRemoteQuotes.map(rq => {
              const isConfirmedSent = Boolean(rq.sentAt) || (rq.code && rq.code.trim().toUpperCase() === 'CNC 210926-3');
              if (isConfirmedSent && (rq.status === 'draft' || !rq.status)) {
                rq = { ...rq, status: 'sent', sentAt: rq.sentAt || new Date().toISOString() };
              }
              const localMatch = prevQuotes.find(lq => 
                (lq.id && rq.id && lq.id === rq.id) || 
                (lq.code && rq.code && lq.code.trim().toUpperCase() === rq.code.trim().toUpperCase())
              );
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

              // BLINDAGEM CONTRA REGRESSÃO NO F5:
              // Compara os timestamps de modificação para decidir se a versão local é mais recente
              const localUpdatedAt = localMatch?.updatedAt || localMatch?.createdAt;
              const remoteUpdatedAt = rq.updatedAt || rq.createdAt;
              const localTime = localUpdatedAt ? new Date(localUpdatedAt).getTime() : 0;
              const remoteTime = remoteUpdatedAt ? new Date(remoteUpdatedAt).getTime() : 0;

              // Se a versão local foi modificada mais recentemente que a do banco remoto (com tolerância de 1s para desvio de relógio)
              const isLocalAuthoritative = Boolean(localMatch && localTime > 0 && localTime > (remoteTime + 1000));

              let items = (isLocalAuthoritative && isValidRealItems(localMatch?.items))
                ? localMatch!.items
                : (isValidRealItems(rq.items) ? rq.items : []);

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

              // BLINDAGEM DE STATUS NO F5:
              // Nunca regride uma proposta enviada/negociação/aprovada para rascunho se a versão local já tiver avançado
              let finalStatus = rq.status;
              if (localMatch?.status === 'approved' && rq.status !== 'approved') {
                finalStatus = 'approved';
              } else if (
                (localMatch?.status === 'sent' || localMatch?.status === 'negotiating' || localMatch?.status === 'lost') && 
                (rq.status === 'draft' || !rq.status || isLocalAuthoritative)
              ) {
                finalStatus = localMatch.status;
              } else if (isLocalAuthoritative && localMatch?.status) {
                finalStatus = localMatch.status;
              }

              const finalApprovedAt = rq.approvedAt || (finalStatus === 'approved' ? (localMatch?.approvedAt || new Date().toISOString()) : undefined);
              const finalSentAt = rq.sentAt || localMatch?.sentAt || ((finalStatus === 'sent' || finalStatus === 'negotiating' || finalStatus === 'approved') ? (localMatch?.sentAt || new Date().toISOString()) : undefined);

              // BLINDAGEM DE COMPRAS NO F5:
              // Recupera registros de compras salvos localmente e no storage dedicado
              const purchasesMap = getPurchasedProcurementRecords();

              items = items.map(remIt => {
                // 1. Tenta correspondência local do item na memória anterior
                const locIt = localMatch?.items?.find(li => 
                  (li.id && remIt.id && li.id === remIt.id) ||
                  (li.itemNumber !== undefined && remIt.itemNumber !== undefined && li.itemNumber === remIt.itemNumber) ||
                  (li.name && remIt.name && normalizeSearchText(li.name) === normalizeSearchText(remIt.name))
                );

                // 2. Tenta correspondência no registro permanente de compras com algoritmo inteligente multi-chave
                const purchaseRecord = findPurchasedProcurementRecord(purchasesMap, {
                  itemId: remIt.id,
                  quoteId: rq.id,
                  quoteCode: rq.code,
                  itemNumber: remIt.itemNumber,
                  name: remIt.name
                }) || (locIt?.id ? purchasesMap[locIt.id] : undefined);

                // Se houver qualquer dado de compra (local ou no registro persistente), preserva 100%!
                const isPurchased = remIt.purchaseStatus === 'purchased' ||
                  locIt?.purchaseStatus === 'purchased' ||
                  purchaseRecord?.purchaseStatus === 'purchased';

                const purchaseStatus = isPurchased ? ('purchased' as const) : (remIt.purchaseStatus || locIt?.purchaseStatus);

                const isParentQuoteApproved = finalStatus === 'approved';
                const isExcluded = (remIt.approved === false && remIt.approvedQuantity === 0) ||
                                   (locIt?.approved === false && locIt?.approvedQuantity === 0);
                const approved = isExcluded
                  ? false
                  : (remIt.approved === true || locIt?.approved === true || isParentQuoteApproved);

                return {
                  ...remIt,
                  purchaseStatus,
                  approved,
                  approvedQuantity: remIt.approvedQuantity !== undefined ? remIt.approvedQuantity : locIt?.approvedQuantity,
                  actualCostPrice: isPurchased
                    ? (locIt?.actualCostPrice ?? purchaseRecord?.actualCostPrice ?? remIt.actualCostPrice)
                    : (remIt.actualCostPrice !== undefined ? remIt.actualCostPrice : (locIt?.actualCostPrice ?? purchaseRecord?.actualCostPrice)),
                  actualUnitCostPrice: isPurchased
                    ? (locIt?.actualUnitCostPrice ?? purchaseRecord?.actualUnitCostPrice ?? remIt.actualUnitCostPrice)
                    : (remIt.actualUnitCostPrice !== undefined ? remIt.actualUnitCostPrice : (locIt?.actualUnitCostPrice ?? purchaseRecord?.actualUnitCostPrice)),
                  actualPurchaseUrl: locIt?.actualPurchaseUrl || purchaseRecord?.actualPurchaseUrl || remIt.actualPurchaseUrl,
                  actualShippingCost: isPurchased
                    ? (locIt?.actualShippingCost ?? purchaseRecord?.actualShippingCost ?? remIt.actualShippingCost)
                    : (remIt.actualShippingCost !== undefined ? remIt.actualShippingCost : (locIt?.actualShippingCost ?? purchaseRecord?.actualShippingCost)),
                  shippingPending: isPurchased
                    ? (locIt?.shippingPending ?? purchaseRecord?.shippingPending ?? remIt.shippingPending)
                    : (remIt.shippingPending !== undefined ? remIt.shippingPending : (locIt?.shippingPending ?? purchaseRecord?.shippingPending)),
                  paymentMethod: locIt?.paymentMethod || purchaseRecord?.paymentMethod || remIt.paymentMethod,
                  purchasedAt: locIt?.purchasedAt || purchaseRecord?.purchasedAt || remIt.purchasedAt,
                  purchaseNotes: locIt?.purchaseNotes || purchaseRecord?.purchaseNotes || remIt.purchaseNotes,
                  actualTaxPercent: isPurchased
                    ? (locIt?.actualTaxPercent ?? purchaseRecord?.actualTaxPercent ?? remIt.actualTaxPercent)
                    : (remIt.actualTaxPercent !== undefined ? remIt.actualTaxPercent : (locIt?.actualTaxPercent ?? purchaseRecord?.actualTaxPercent)),
                  clientOrderNumber: remIt.clientOrderNumber || locIt?.clientOrderNumber
                };
              });

              const resultQuote: Quote = {
                ...rq,
                status: finalStatus,
                approvedAt: finalApprovedAt,
                sentAt: finalSentAt,
                items,
                totalAmount: (isLocalAuthoritative && localMatch?.totalAmount !== undefined) ? localMatch.totalAmount : rq.totalAmount,
                totalCost: (isLocalAuthoritative && localMatch?.totalCost !== undefined) ? localMatch.totalCost : rq.totalCost,
                totalProfit: (isLocalAuthoritative && localMatch?.totalProfit !== undefined) ? localMatch.totalProfit : rq.totalProfit,
                totalShipping: (isLocalAuthoritative && localMatch?.totalShipping !== undefined) ? localMatch.totalShipping : rq.totalShipping,
                totalTaxes: (isLocalAuthoritative && localMatch?.totalTaxes !== undefined) ? localMatch.totalTaxes : rq.totalTaxes,
                averageMargin: (isLocalAuthoritative && localMatch?.averageMargin !== undefined) ? localMatch.averageMargin : rq.averageMargin,
                updatedAt: isLocalAuthoritative ? (localMatch?.updatedAt || new Date().toISOString()) : (rq.updatedAt || rq.createdAt)
              };

              // Se a versão local era mais recente ou recuperamos itens ausentes, sincroniza imediatamente com o Supabase
              if (isLocalAuthoritative || (items.length > 0 && !isValidRealItems(rq.items))) {
                syncQuoteToSupabase(resultQuote).catch(e => {
                  console.warn('[SmartQuote] Falha ao sincronizar versão mais recente no Supabase:', e);
                });
              }

              return resultQuote;
            });

            // Preserva propostas que existem apenas localmente (evita perda de dados locais)
            // FILTRA E BLOQUEIA RIGOROSAMENTE QUALQUER PROPOSTA DE TESTE OU DELETADA
            const localOnlyQuotes = prevQuotes.filter(lq => 
              !isBlockedOrTestQuote(lq) &&
              !deletedCodes.has((lq.code || '').trim().toUpperCase()) &&
              !mergedRemote.some(rq => rq.id === lq.id || (rq.code && lq.code && rq.code.trim().toUpperCase() === lq.code.trim().toUpperCase()))
            );

            // Sincroniza para o Supabase apenas propostas com itens reais e valor comercial
            if (localOnlyQuotes.length > 0) {
              localOnlyQuotes.forEach(lq => {
                if (
                  !isBlockedOrTestQuote(lq) &&
                  !deletedCodes.has((lq.code || '').trim().toUpperCase()) &&
                  lq.items && lq.items.length > 0 && Number(lq.totalAmount || 0) > 0
                ) {
                  syncQuoteToSupabase(lq).catch(err => {
                    console.warn('Aviso ao sincronizar proposta pendente para Supabase:', err);
                  });
                }
              });
            }

            const combined = [...mergedRemote, ...localOnlyQuotes].filter(q => 
              !isBlockedOrTestQuote(q) && !deletedCodes.has((q.code || '').trim().toUpperCase())
            );
            const { updatedQuotes: normalizedMerged } = updateDraftQuotesToToday(combined);
            saveQuotes(normalizedMerged);
            return normalizedMerged;
          });

          setCurrentQuote(prev => {
            const draft = getCurrentDraftQuote();
            // Apenas restaura rascunho ativo se ele possuir itens reais e não for teste
            let chosen: Quote = prev;
            if (draft && Array.isArray(draft.items) && draft.items.length > 0 && !isBlockedOrTestQuote(draft)) {
              chosen = draft;
            } else if ((isBlockedOrTestQuote(prev) || deletedCodes.has((prev.code || '').trim().toUpperCase())) && validRemoteQuotes[0]) {
              chosen = validRemoteQuotes[0];
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
        if (remoteProducts && remoteProducts.length > 0) {
          const sanitizedRemote = remoteProducts.filter(p => !isProductDeleted(p));
          const ghostProducts = remoteProducts.filter(p => isProductDeleted(p));
          for (const gp of ghostProducts) {
            deleteProductFromSupabase(gp.id, gp.sku, gp.partNumber, gp.name).catch(() => {});
          }
          setProducts(prev => {
            const merged = mergeRemoteProductsWithLocal(sanitizedRemote, prev);
            saveProducts(merged);
            return merged;
          });
        }

        // 4. Empresas e Cidades de Frete
        if (remoteCompanies && remoteCompanies.length > 0) {
          const localCompanies = getClientCompanies();
          const localById = new Map<string, ClientCompany>();
          const localByName = new Map<string, ClientCompany>();
          const deletedContactIds = getDeletedContactIds();
          const deletedCompanyIds = getDeletedCompanyIds();

          localCompanies.forEach(c => {
            localById.set(c.id, c);
            const clean = c.name.replace(/^(ao|à|a|para)\s+/i, '').trim().toLowerCase();
            localByName.set(clean, c);
          });

          // Filtra empresas remotas contra IDs excluídos e dados de teste ou mock bloqueados
          const sanitizedRemote = remoteCompanies.filter(rc => {
            if (!rc || !rc.name) return false;
            return !isBlockedOrTestCompany(rc) && !deletedCompanyIds.has(rc.id);
          });

          const mergedCompanies = sanitizedRemote.map(rc => {
            const clean = rc.name.replace(/^(ao|à|a|para)\s+/i, '').trim().toLowerCase();
            const local = localById.get(rc.id) || localByName.get(clean);

            // Contatos vindos da nuvem (já saneados contra IDs deletados)
            const cleanRemoteContacts = deduplicateCompanyContacts(
              (rc.contacts || []).filter(ct => !deletedContactIds.has(ct.id))
            );
            const remoteContactIds = new Set(cleanRemoteContacts.map(ct => ct.id));
            const remoteContactNames = new Set(cleanRemoteContacts.map(ct => (ct.name || '').trim().toLowerCase()));

            // Apenas adiciona contatos locais se forem criados offline e não existirem na nuvem por ID ou Nome
            const localOnlyContacts = (local?.contacts || []).filter(ct => {
              if (!ct || !ct.name) return false;
              if (deletedContactIds.has(ct.id)) return false;
              if (remoteContactIds.has(ct.id)) return false;
              if (remoteContactNames.has(ct.name.trim().toLowerCase())) return false;
              return true;
            });

            const mergedContacts = deduplicateCompanyContacts([...cleanRemoteContacts, ...localOnlyContacts]);
            const preservedPrefix = rc.prefix || local?.prefix;

            return {
              ...rc,
              prefix: (preservedPrefix as 'À' | 'Ao') || (rc.name.trim().toLowerCase().startsWith('ao ') ? 'Ao' : 'À'),
              website: rc.website || local?.website,
              logoUrl: rc.logoUrl || local?.logoUrl,
              contacts: mergedContacts
            };
          });

          // Preservar novas empresas criadas localmente que ainda não estão no banco (ignorando testes, mocks e deletadas)
          const remoteIds = new Set(sanitizedRemote.map(r => r.id));
          const localOnlyCompanies = localCompanies.filter(lc => {
            if (!lc || !lc.name) return false;
            return !remoteIds.has(lc.id) && !deletedCompanyIds.has(lc.id) && !isBlockedOrTestCompany(lc);
          });
          const finalCompanies = [...mergedCompanies, ...localOnlyCompanies];

          setClientCompanies(finalCompanies);
          saveClientCompanies(finalCompanies);

          // Sincroniza de volta para o Supabase apenas se houver empresas 100% novas locais
          if (localOnlyCompanies.length > 0 || finalCompanies.some(c => c.website && !sanitizedRemote.find(rc => rc.id === c.id)?.website)) {
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
  }, [authenticatedUserEmail]);

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

  const [editingHistoricalQuoteId, setEditingHistoricalQuoteId] = useState<string | null>(null);
  const editingHistoricalQuoteIdRef = useRef<string | null>(null);
  editingHistoricalQuoteIdRef.current = editingHistoricalQuoteId;

  const createCleanBlankQuote = useCallback((customQuotes?: Quote[], customSettings?: CompanySettings): Quote => {
    const s = customSettings || settings;
    const qList = customQuotes || quotes;
    const defaultMarkup = s.defaultMarkupPercent ?? 23.5;
    const defaultTax = s.defaultTaxPercent ?? 9.1;
    const defaultShipping = s.defaultShippingCost ?? 0;

    return {
      id: `quote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      code: generateQuoteCode('COTACAO', new Date(), qList),
      clientCompany: '',
      contactPerson: '',
      clientEmail: '',
      clientPhone: '',
      subject: 'Fornecimento de Materiais',
      city: 'Brasília',
      date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
      validityDays: formatProposalValidityText(s.defaultValidityDays),
      paymentTerms: s.defaultPaymentTerms,
      deliveryDays: s.defaultDeliveryDays,
      warrantyTerms: s.defaultWarrantyTerms,
      openingText: s.defaultOpeningText,
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
  }, [settings, quotes]);

  const [currentQuote, setCurrentQuote] = useState<Quote>(() => {
    const draft = getCurrentDraftQuote();
    // Diretriz do Lucas: Só restaura se for rascunho de verdade, NUNCA cotação salva do histórico
    if (draft && !isBlockedOrTestQuote(draft) && (draft.status || 'draft') === 'draft' && !draft.sentAt && (
      (Array.isArray(draft.items) && draft.items.length > 0) ||
      (draft.clientCompany && draft.clientCompany.trim())
    )) {
      const isHistorical = quotes.some(q => (q.id === draft.id || q.code === draft.code) && (q.status === 'sent' || q.status === 'approved'));
      if (!isHistorical) {
        return draft;
      }
    }
    // Sempre inicia em branco se não houver um rascunho real em digitação
    const defaultMarkup = settings.defaultMarkupPercent ?? 23.5;
    const defaultTax = settings.defaultTaxPercent ?? 9.1;
    const defaultShipping = settings.defaultShippingCost ?? 0;
    return {
      id: `quote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      code: generateQuoteCode('COTACAO', new Date(), quotes),
      clientCompany: '',
      contactPerson: '',
      clientEmail: '',
      clientPhone: '',
      subject: 'Fornecimento de Materiais',
      city: 'Brasília',
      date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
      validityDays: formatProposalValidityText(settings.defaultValidityDays),
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
  });

  useEffect(() => {
    onLeaveBuilderRef.current = () => {
      if (editingHistoricalQuoteIdRef.current) {
        setEditingHistoricalQuoteId(null);
        editingHistoricalQuoteIdRef.current = null;
        const blank = createCleanBlankQuote();
        setCurrentQuote(blank);
        saveCurrentDraftQuote(blank);
      }
    };
  }, [createCleanBlankQuote]);

  useEffect(() => { 
    if (isSettingsHydratedRef.current) {
      saveSettings(settings, false); 
    }
  }, [settings]);
  useEffect(() => { saveProducts(products); }, [products]);
  useEffect(() => { saveEmails(emails); }, [emails]);
  useEffect(() => { saveQuotes(quotes); }, [quotes]);
  // Debounce suave de 400ms para salvar rascunho + salvamento imediato no beforeunload (F5 instantâneo)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveCurrentDraftQuote(currentQuote);
    }, 400);

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      saveCurrentDraftQuote(currentQuote);
      const isBusy = isScannerBusyRef.current || (typeof window !== 'undefined' && Boolean((window as any).__INFODESK_SCANNER_BUSY__));
      if (activeTabRef.current === 'websearch' && isBusy) {
        e.preventDefault();
        e.returnValue = 'Uma pesquisa de produto está em andamento no Scanner. Se sair ou recarregar agora, o progresso será perdido.';
        return e.returnValue;
      }
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

      if (targetTab && targetTab !== activeTabRef.current) {
        if (!confirmScannerExitIfNeeded()) {
          // Re-adiciona a hash do websearch para que a URL e histórico do navegador permaneçam no scanner
          window.history.pushState({ tab: 'websearch' }, '', '#websearch');
          return;
        }
        setActiveTabState(targetTab);
        saveActiveTab(targetTab);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [confirmScannerExitIfNeeded]);

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
    const markup = settings.defaultMarkupPercent ?? 23.5;
    const tax = settings.defaultTaxPercent ?? 9.02;
    const shipping = settings.defaultShippingCost ?? 0;

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
      validityDays: formatProposalValidityText(settings.defaultValidityDays),
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
    const markup = settings.defaultMarkupPercent ?? 23.5;
    const tax = settings.defaultTaxPercent ?? 9.02;
    const shipping = settings.defaultShippingCost ?? 0;

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
      validityDays: formatProposalValidityText(settings.defaultValidityDays),
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
    setEditingHistoricalQuoteId(null);
    editingHistoricalQuoteIdRef.current = null;
    const blank = createCleanBlankQuote();
    setCurrentQuote(blank);
    saveCurrentDraftQuote(blank);
    setActiveTab('builder');
  };

  const handleNavigateToBuilder = () => {
    // Diretriz do Lucas: Ao clicar em "Cotação" na Navbar superior:
    // Se o usuário estava editando cotação do histórico ou se a atual já está salva/enviada,
    // sempre abre uma nova proposta limpa em branco!
    const isHistorical = Boolean(editingHistoricalQuoteId) || 
      (currentQuote.status && currentQuote.status !== 'draft') || 
      Boolean(currentQuote.sentAt) ||
      quotes.some(q => (q.id === currentQuote.id || q.code === currentQuote.code) && (q.status === 'sent' || q.status === 'approved'));

    if (isHistorical) {
      handleNewQuote();
    } else {
      setActiveTab('builder');
    }
  };

  const handleSaveProductToCatalog = async (p: Product) => {
    let savedProduct = p;
    setProducts(prev => {
      const normName = normalizeSearchText(p.name);
      const normPn = (p.partNumber || '').trim().toLowerCase();
      const normSku = (p.sku || '').trim().toLowerCase();

      const existingIdx = prev.findIndex(item => {
        const itemSku = (item.sku || '').trim().toLowerCase();
        const itemPn = (item.partNumber || '').trim().toLowerCase();
        const itemName = normalizeSearchText(item.name);

        if (p.id && item.id === p.id) return true;
        if (normPn && normPn.length >= 3 && itemPn === normPn) return true;
        if (normSku && !normSku.startsWith('inf-auto-') && itemSku === normSku) return true;
        if (normName && normName.length >= 3 && itemName === normName) return true;
        return false;
      });

      let next: Product[];
      if (existingIdx >= 0) {
        savedProduct = { 
          ...prev[existingIdx], 
          ...p, 
          id: prev[existingIdx].id,
          sku: prev[existingIdx].sku || p.sku,
          partNumber: prev[existingIdx].partNumber || p.partNumber
        };
        next = [...prev];
        next[existingIdx] = savedProduct;
      } else {
        next = [p, ...prev];
      }
      const deduped = deduplicateProductsList(next);
      saveProducts(deduped);
      return deduped;
    });
    await syncProductToSupabase(savedProduct);
  };

  const handleSaveQuote = async () => {
    if (!currentQuote.clientCompany || !currentQuote.clientCompany.trim()) {
      alert('Por favor, informe a empresa / cliente antes de salvar.');
      return;
    }

    if (!currentQuote.items || !Array.isArray(currentQuote.items) || currentQuote.items.length === 0) {
      alert('Por favor, adicione ao menos um produto antes de salvar a proposta comercial.');
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

    // 1. Busca cotação existente por ID ou por Código
    const existing = quotes.find(q => 
      (q.id && quoteToSave.id && q.id === quoteToSave.id) || 
      (q.code && quoteToSave.code && q.code.trim().toUpperCase() === quoteToSave.code.trim().toUpperCase())
    );

    // Se encontrou cotação existente (por exemplo, UUID do Supabase), unifica ID e preserva status/sentAt
    if (existing) {
      if (existing.id) {
        quoteToSave.id = existing.id;
      }
      if (existing.status && existing.status !== 'draft' && quoteToSave.status === 'draft') {
        quoteToSave.status = existing.status;
      }
      if (existing.sentAt && !quoteToSave.sentAt) {
        quoteToSave.sentAt = existing.sentAt;
      }
    } else if (!quoteToSave.id) {
      quoteToSave.id = `quote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    }

    const nowIso = new Date().toISOString();
    quoteToSave.updatedAt = nowIso;

    const isSpecificallySent = Boolean(quoteToSave.sentAt) || (quoteToSave.code && quoteToSave.code.trim().toUpperCase() === 'CNC 210926-3');
    if (isSpecificallySent && quoteToSave.status === 'draft') {
      quoteToSave.status = 'sent';
      if (!quoteToSave.sentAt) quoteToSave.sentAt = nowIso;
    }

    const todayFormatted = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    if (!quoteToSave.date || quoteToSave.status === 'draft') {
      quoteToSave.date = todayFormatted;
    }

    // Se o código colidir com outro orçamento já existente com ID diferente (que não seja a própria proposta editada), gera código incremental
    const codeCollision = quotes.find(q => 
      q.id !== quoteToSave.id && 
      (existing ? q.id !== existing.id : true) &&
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
      // Atualiza a proposta correspondente no array local (por ID ou código)
      const idx = prev.findIndex(q => 
        q.id === quoteToSave.id || 
        (q.code && quoteToSave.code && q.code.trim().toUpperCase() === quoteToSave.code.trim().toUpperCase())
      );
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

    if (!currentQuote.items || !Array.isArray(currentQuote.items) || currentQuote.items.length === 0) {
      alert('Por favor, adicione ao menos um produto antes de salvar como nova cotação.');
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

  const handleDuplicateQuoteFromHistory = async (q: Quote, updateCostsFromCatalog: boolean = false) => {
    const itemsToUse = await resolveQuoteItems(q, quotes);
    const newCode = getNextUniqueQuoteCode(
      q.clientCompany,
      quotes,
      q.code
    );
    const newQuoteId = `quote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    // Se selecionou atualizar custos com base no catálogo atual
    const catalogProducts = updateCostsFromCatalog ? getProducts() : [];

    let updatedCount = 0;
    const clonedItems = itemsToUse.map((it, idx) => {
      let currentCost = it.costPrice;
      let currentUnitPrice = it.unitPrice;
      const currentShipping = it.shippingCost ?? 0;
      const currentMarkup = it.markupPercent ?? 23.5;
      const currentTax = it.taxPercent ?? settings.defaultTaxPercent ?? 9.1;

      if (updateCostsFromCatalog && catalogProducts.length > 0) {
        // Tenta achar pelo Part Number exato primeiro
        const matchPn = it.partNumber ? catalogProducts.find(p => p.partNumber && p.partNumber.trim().toLowerCase() === it.partNumber?.trim().toLowerCase()) : null;
        // Senão pelo nome normalizado
        const matchName = !matchPn ? catalogProducts.find(p => normalizeSearchText(p.name) === normalizeSearchText(it.name)) : null;
        const matched = matchPn || matchName;

        if (matched && matched.costPrice > 0) {
          currentCost = matched.costPrice;
          currentUnitPrice = calculateCommercialUnitPrice(currentCost, currentShipping, currentMarkup, currentTax);
          updatedCount++;
        }
      }

      const qty = it.quantity || 1;
      const totalPrice = Number((currentUnitPrice * qty).toFixed(2));
      const profit = Number(((currentUnitPrice - currentCost - currentShipping) * qty).toFixed(2));

      return {
        ...it,
        id: `item-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
        costPrice: currentCost,
        unitPrice: currentUnitPrice,
        totalPrice,
        profit
      };
    });

    const todayFormatted = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    
    // Recalcula totais da proposta
    const totals = recalculateQuoteTotals(clonedItems);

    const newQuote: Quote = {
      ...q,
      id: newQuoteId,
      code: newCode,
      date: todayFormatted,
      status: 'draft',
      sentAt: undefined,
      createdAt: new Date().toISOString(),
      items: clonedItems,
      totalAmount: totals.totalAmount,
      totalProfit: totals.totalProfit,
      averageMargin: totals.averageMargin
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
      recordDeletedQuoteCode(quoteToDelete.code);
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
      const finalSubject = (sentQuote.subject || '').trim() || `Proposta Comercial ${sentQuote.code} — Infodesk — Fornecimento de Materiais`;

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

    const finalSubject = (sentQuote.subject || '').trim() || `Proposta Comercial ${sentQuote.code} — Infodesk — Fornecimento de Materiais`;
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
      subject: 'Fornecimento de Materiais',
      city: 'Brasília',
      date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
      validityDays: formatProposalValidityText(settings.defaultValidityDays),
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
    const markup = settings.defaultMarkupPercent ?? 23.5;
    const tax = settings.defaultTaxPercent ?? 9.02;
    const shipping = settings.defaultShippingCost ?? 0;
    const unitPrice = calculateCommercialUnitPrice(product.costPrice, shipping, markup, tax);

    // Se o produto já estiver na cotação (mesmo ID, mesmo Part Number ou mesmo Nome), incrementa a quantidade
    const normProdName = normalizeSearchText(product.name);
    const normProdPn = (product.partNumber || '').trim().toLowerCase();

    const existingIdx = currentQuote.items.findIndex(it => {
      if (product.id && it.productId === product.id) return true;
      if (normProdPn && normProdPn.length >= 3 && (it.partNumber || '').trim().toLowerCase() === normProdPn) return true;
      if (normProdName && normProdName.length >= 3 && normalizeSearchText(it.name) === normProdName) return true;
      return false;
    });

    let updatedItems: QuoteItem[];
    if (existingIdx >= 0) {
      updatedItems = currentQuote.items.map((it, idx) => {
        if (idx !== existingIdx) return it;
        const newQty = (it.quantity || 1) + 1;
        const newTotal = Number((it.unitPrice * newQty).toFixed(2));
        return { ...it, quantity: newQty, totalPrice: newTotal };
      });
    } else {
      const newItem: QuoteItem = {
        id: `item-${Date.now()}`,
        productId: product.id,
        itemNumber: currentQuote.items.length + 1,
        name: product.name,
        description: product.description,
        partNumber: product.partNumber || '',
        ncm: product.ncm || '',
        imageUrl: product.imageUrl || '',
        showImage: Boolean(product.imageUrl),
        quantity: 1,
        unit: product.unit || 'Un.',
        costPrice: product.costPrice,
        markupPercent: markup,
        unitPrice,
        totalPrice: unitPrice,
        sourceUrl: product.sourceUrl || `https://www.google.com/search?q=${encodeURIComponent(product.name)}`
      };
      updatedItems = [...currentQuote.items, newItem];
    }

    let totalCost = 0;
    let totalAmount = 0;
    updatedItems.forEach(i => {
      totalCost += i.costPrice * (i.quantity || 1);
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

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-3 border-sky-400 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-xs font-semibold text-slate-300 tracking-wider uppercase font-mono">Validando Acesso Seguro</p>
      </div>
    );
  }

  if (!authenticatedUserEmail) {
    return (
      <LoginView onLoginSuccess={handleLoginSuccess} />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans print:bg-white print:min-h-0">
      
      <div className="no-print">
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          unreadCount={emails.filter(e => e.unread).length}
          openSettings={() => setIsSettingsOpen(true)}
          authenticatedUserEmail={authenticatedUserEmail}
          onLogout={handleLogout}
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
          pendingPurchasesCount={pendingPurchasesCount}
          onOpenDraftsHistory={() => {
            setHistoryStageFilter('draft');
            setActiveTab('history');
          }}
          onNavigateToBuilder={handleNavigateToBuilder}
        />
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-28 lg:pb-8 print:p-0 print:m-0 print:max-w-none print:w-full">
        <React.Suspense fallback={<TabLoadingFallback />}>
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
            onPreview={() => {
              setPreviewSourceTab('builder');
              setActiveTab('preview');
            }}
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
            isEditingHistoricalQuote={Boolean(editingHistoricalQuoteId)}
          />
        )}

        <div style={{ display: activeTab === 'websearch' ? 'block' : 'none' }}>
          <PriceScannerView
            products={products}
            initialQuery={webSearchQuery}
            targetItemIndex={webSearchTargetIndex}
            existingItem={webSearchExistingItem}
            onAddToQuote={handleAddWebSearchItemToQuote}
            onStartNewQuoteWithItems={handleStartNewQuoteWithItems}
            onNavigateToQuote={() => setActiveTab('builder')}
            quoteItemsCount={currentQuote.items.length}
            onScanningStateChange={setIsScannerBusy}
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
        </div>

        {activeTab === 'preview' && (
          <QuotePreview
            quote={currentQuote}
            settings={settings}
            sourceTab={previewSourceTab}
            isEmailModalOpen={isEmailModalOpen}
            onBackToEdit={() => setActiveTab(previewSourceTab)}
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

        <div style={{ display: activeTab === 'history' ? 'block' : 'none' }}>
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
              setPreviewSourceTab('history');
              setActiveTab('preview');
            }}
            onEditQuote={async (q) => {
              const matched = quotes.find(item => 
                (item.id && q.id && item.id === q.id) || 
                (item.code && q.code && item.code.trim().toUpperCase() === q.code.trim().toUpperCase())
              );
              const itemsToUse = await resolveQuoteItems(q, quotes);
              const quoteToEdit = { ...matched, ...q, items: itemsToUse };
              if ((quoteToEdit.status || 'draft') === 'draft') {
                const todayFormatted = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
                quoteToEdit.date = todayFormatted;
              }
              const quoteKey = quoteToEdit.id || quoteToEdit.code;
              setEditingHistoricalQuoteId(quoteKey);
              editingHistoricalQuoteIdRef.current = quoteKey;
              setCurrentQuote(quoteToEdit);
              setActiveTab('builder');
            }}
            onDuplicateQuote={handleDuplicateQuoteFromHistory}
            onDeleteQuote={handleDeleteQuote}
            onUpdateQuoteStatus={(quoteId, newStatus) => {
              setQuotes(prev => {
                const nowIso = new Date().toISOString();
                const todayFormatted = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

                const next = prev.map(q => {
                  if (q.id === quoteId || (q.code && quoteId && q.code.trim().toUpperCase() === quoteId.trim().toUpperCase())) {
                    const isMovingFromDraft = (q.status || 'draft') === 'draft';

                    // Se estiver em rascunho e mudar para enviado (ou qualquer estágio posterior), seta o horário exato dessa mudança
                    let newSentAt: string | undefined;
                    if (newStatus === 'draft') {
                      newSentAt = undefined;
                    } else if (newStatus === 'sent') {
                      newSentAt = isMovingFromDraft ? nowIso : (q.sentAt || nowIso);
                    } else {
                      newSentAt = q.sentAt || nowIso;
                    }

                    const updatedItems = newStatus === 'approved'
                      ? (q.items || []).map(it => ({
                          ...it,
                          approved: true,
                          approvedQuantity: it.approvedQuantity !== undefined ? it.approvedQuantity : it.quantity,
                          purchaseStatus: it.purchaseStatus || 'pending'
                        }))
                      : q.items;

                    const updated: Quote = {
                      ...q,
                      status: newStatus,
                      items: updatedItems,
                      approvedAt: newStatus === 'approved' ? (q.approvedAt || nowIso) : q.approvedAt,
                      sentAt: newSentAt,
                      updatedAt: nowIso,
                      date: (isMovingFromDraft && newStatus === 'sent') ? todayFormatted : (q.date || todayFormatted)
                    };
                    return updated;
                  }
                  return q;
                });
                saveQuotes(next);
                const updated = next.find(q => q.id === quoteId || (q.code && quoteId && q.code.trim().toUpperCase() === quoteId.trim().toUpperCase()));
                if (updated) {
                  if (currentQuote.id === updated.id || (currentQuote.code && updated.code && currentQuote.code.trim().toUpperCase() === updated.code.trim().toUpperCase())) {
                    setCurrentQuote(updated);
                    saveCurrentDraftQuote(updated);
                  }
                  syncQuoteToSupabase(updated).catch(err => {
                    console.warn('Aviso sync status:', err);
                    notifySync(`Status de "${updated.code}" salvo no navegador. Sincronização com o banco será retomada ao restabelecer a conexão.`);
                  });
                }
                return next;
              });
            }}
            onUpdateQuote={(updatedQuote) => {
              const nowIso = new Date().toISOString();
              const quoteToPersist: Quote = {
                ...updatedQuote,
                updatedAt: updatedQuote.updatedAt || nowIso
              };
              setQuotes(prev => {
                const next = prev.map(q => 
                  (q.id === quoteToPersist.id || (q.code && quoteToPersist.code && q.code.trim().toUpperCase() === quoteToPersist.code.trim().toUpperCase()))
                    ? quoteToPersist 
                    : q
                );
                saveQuotes(next);
                syncQuoteToSupabase(quoteToPersist).catch(err => {
                  console.warn('Aviso sync quote aprovado:', err);
                  notifySync(`Aprovação de "${quoteToPersist.code}" salva localmente. Sincronização na nuvem pendente.`);
                });
                return next;
              });
              if (currentQuote.id === quoteToPersist.id || (currentQuote.code && quoteToPersist.code && currentQuote.code.trim().toUpperCase() === quoteToPersist.code.trim().toUpperCase())) {
                setCurrentQuote(quoteToPersist);
                saveCurrentDraftQuote(quoteToPersist);
              }
            }}
            onNavigateToPurchases={() => setActiveTab('purchases')}
          />
        </div>

        {activeTab === 'purchases' && (
          <ProcurementView
            quotes={quotes}
            settings={settings}
            onUpdateQuote={(updatedQuote) => {
              setQuotes(prev => {
                const next = prev.map(q => 
                  (q.id === updatedQuote.id || (q.code && updatedQuote.code && q.code.trim().toUpperCase() === updatedQuote.code.trim().toUpperCase()))
                    ? updatedQuote 
                    : q
                );
                saveQuotes(next);
                syncQuoteToSupabase(updatedQuote).catch(err => {
                  console.warn('Aviso sync compra:', err);
                  notifySync(`Compra de "${updatedQuote.code}" salva no dispositivo. Sincronização na nuvem pendente.`);
                });
                return next;
              });
              if (currentQuote.id === updatedQuote.id || currentQuote.code === updatedQuote.code) {
                setCurrentQuote(updatedQuote);
                saveCurrentDraftQuote(updatedQuote);
              }
            }}
            onOpenQuote={async (q) => {
              const matched = quotes.find(item => item.id === q.id || item.code === q.code);
              const itemsToUse = await resolveQuoteItems(q, quotes);
              const fullQuote = { ...matched, ...q, items: itemsToUse };
              setCurrentQuote(fullQuote);
              saveCurrentDraftQuote(fullQuote);
              setPreviewSourceTab('purchases');
              setActiveTab('preview');
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
              const defaultMarkup = settings.defaultMarkupPercent ?? 23.5;
              const defaultTax = settings.defaultTaxPercent ?? 9.1;
              const defaultShipping = settings.defaultShippingCost ?? 0;
              const targetCompany = clientCompanies.find(c => c.name.trim().toLowerCase() === companyName.trim().toLowerCase());
              const companyPrefix = targetCompany?.prefix;
              const formattedCompany = formatCompanyPrefix(companyName, companyPrefix);
              const contactFullName = contact.title ? `${contact.title} ${contact.name}` : contact.name;
              const formattedContact = formatContactPerson(contactFullName);
              const deliveryLoc = location || targetCompany?.defaultDeliveryLocation || 'Brasília - DF';

              const newQuote: Quote = {
                id: `quote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                code: generateQuoteCode(companyName, new Date(), quotes),
                clientCompany: formattedCompany,
                contactPerson: formattedContact,
                clientEmail: (contact.email || '').toLowerCase().trim(),
                clientPhone: contact.phone || '',
                deliveryLocation: deliveryLoc,
                shippingTerms: `Frete incluso p/ ${deliveryLoc}.`,
                subject: `Proposta Comercial — ${companyName}`,
                city: 'Brasília',
                date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
                validityDays: formatProposalValidityText(settings.defaultValidityDays),
                paymentTerms: settings.defaultPaymentTerms || 'Faturado.',
                deliveryDays: settings.defaultDeliveryDays,
                warrantyTerms: settings.defaultWarrantyTerms || '6m',
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

              setCurrentQuote(newQuote);
              saveCurrentDraftQuote(newQuote);
              setActiveTab('builder');
            }}
          />
        )}
        </React.Suspense>
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

      <GlobalCommandBarModal
        isOpen={isCommandBarOpen}
        onClose={() => setIsCommandBarOpen(false)}
        quotes={quotes}
        products={products}
        clientCompanies={clientCompanies}
        onSelectQuote={async (q) => {
          const matched = quotes.find(item => item.id === q.id || item.code === q.code);
          const itemsToUse = await resolveQuoteItems(q, quotes);
          const fullQuote = { ...matched, ...q, items: itemsToUse };
          setCurrentQuote(fullQuote);
          saveCurrentDraftQuote(fullQuote);
          setActiveTab('builder');
        }}
        onSelectProduct={() => {
          setActiveTab('catalog');
        }}
        onSelectCompany={() => {
          setActiveTab('clients');
        }}
        onNewQuote={handleNewQuote}
        onNavigateTab={(tab) => {
          if (tab === 'quote') {
            setActiveTab('builder');
          } else if (tab === 'procurement') {
            setActiveTab('purchases');
          } else {
            setActiveTab(tab as any);
          }
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {syncNotice && (
        <div 
          role="status"
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border backdrop-blur-md text-xs font-medium transition-all duration-300 animate-in fade-in slide-in-from-bottom-3 ${
            syncNotice.type === 'warning'
              ? 'bg-amber-50/95 border-amber-200 text-amber-900 shadow-amber-500/10'
              : 'bg-emerald-50/95 border-emerald-200 text-emerald-900 shadow-emerald-500/10'
          }`}
        >
          <AlertCircle className={`w-4 h-4 shrink-0 ${syncNotice.type === 'warning' ? 'text-amber-600' : 'text-emerald-600'}`} />
          <span className="max-w-xs sm:max-w-md leading-relaxed">{syncNotice.message}</span>
          <button 
            type="button" 
            onClick={() => setSyncNotice(null)} 
            className="p-1 rounded-lg hover:bg-black/5 text-slate-500 hover:text-slate-800 transition-colors"
            title="Fechar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

    </div>
  );
};
