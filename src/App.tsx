import React, { useEffect, useState } from 'react';
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
import { EmailContactScannerModal } from './components/EmailContactScannerModal';
import { ManualAnalysesView } from './components/ManualAnalysesView';
import { DashboardView } from './components/DashboardView';
import { ScannedContactCandidate } from './services/emailScannerService';
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
  saveQuoteItemsBackup
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
  formatProductSentenceCase,
  generateProposalEmailHtml
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
  syncIncomingEmailsToSupabase
} from './services/supabase';
import { 
  calculateCommercialUnitPrice, 
  calculateMarkupFromUnitPrice, 
  recalculateQuoteTotals 
} from './services/pricingEngine';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inbox' | 'builder' | 'preview' | 'catalog' | 'history' | 'websearch' | 'analyses' | 'clients' | 'dashboard'>(() => {
    const saved = getSavedActiveTab('inbox');
    return (['inbox', 'builder', 'preview', 'catalog', 'history', 'websearch', 'analyses', 'clients', 'dashboard'].includes(saved) ? saved : 'inbox') as any;
  });
  const [settings, setSettings] = useState<CompanySettings>(getSettings());
  const [products, setProducts] = useState<Product[]>(getProducts());
  const [emails, setEmails] = useState<IncomingEmail[]>(getEmails());
  const [quotes, setQuotes] = useState<Quote[]>(getQuotes());

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
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [clientCompanies, setClientCompanies] = useState<ClientCompany[]>(() => getClientCompanies());
  const [manualAnalyses, setManualAnalyses] = useState<IncomingEmail[]>(() => getManualAnalyses());

  const handleSaveCompanies = (updated: ClientCompany[]) => {
    setClientCompanies(updated);
    saveClientCompanies(updated);
    syncClientCompaniesToSupabase(updated);
  };

  const handleAddManualAnalysis = (email: IncomingEmail) => {
    setManualAnalyses(prev => {
      // evitar duplicatas por id
      const exists = prev.some(a => a.id === email.id);
      if (exists) return prev;
      const next = [email, ...prev];
      saveManualAnalyses(next);
      return next;
    });
  };

  const handleDeleteManualAnalysis = (id: string) => {
    setManualAnalyses(prev => {
      const next = prev.filter(a => a.id !== id);
      saveManualAnalyses(next);
      return next;
    });
  };

  const handleUpdateManualAnalysis = (id: string, updates: Partial<IncomingEmail>) => {
    setManualAnalyses(prev => {
      const next = prev.map(a => a.id === id ? { ...a, ...updates } : a);
      saveManualAnalyses(next);
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

  const handleSaveScannedCandidate = async (candidate: ScannedContactCandidate) => {
    const fullName = `${candidate.title} ${candidate.contactName}`.trim();
    const updated = registerOrUpdateClient(
      candidate.companyName,
      fullName,
      candidate.email,
      candidate.phone,
      candidate.deliveryLocation
    );
    setClientCompanies(updated);
    saveClientCompanies(updated);
    await syncClientCompaniesToSupabase(updated);
  };

  const handleSaveAllScannedCandidates = async (candidatesList: ScannedContactCandidate[]) => {
    let current = clientCompanies;
    for (const candidate of candidatesList) {
      const fullName = `${candidate.title} ${candidate.contactName}`.trim();
      current = registerOrUpdateClient(
        candidate.companyName,
        fullName,
        candidate.email,
        candidate.phone,
        candidate.deliveryLocation
      );
    }
    setClientCompanies(current);
    saveClientCompanies(current);
    await syncClientCompaniesToSupabase(current);
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
        const remoteSettings = await fetchCompanySettingsFromSupabase();
        if (remoteSettings) {
          if (!remoteSettings.defaultOpeningText || remoteSettings.defaultOpeningText.trim() === 'Em atenção...' || remoteSettings.defaultOpeningText.trim() === 'Em atenção' || remoteSettings.defaultOpeningText.trim().startsWith('Em atenção ao que foi solicitado')) {
            remoteSettings.defaultOpeningText = defaultCompanySettings.defaultOpeningText;
          }
          setSettings(remoteSettings);
          saveSettings(remoteSettings);
        }

        // 2. Orçamentos
        const remoteQuotes = await fetchQuotesFromSupabase();
        if (remoteQuotes && remoteQuotes.length > 0) {
          // Merge seguro: se o banco retornar a cotação sem itens, preserva os itens salvos localmente ou do backup
          setQuotes(prevQuotes => {
            const merged = remoteQuotes.map(rq => {
              const localMatch = prevQuotes.find(lq => lq.id === rq.id || lq.code === rq.code);
              let items = (rq.items && rq.items.length > 0) ? rq.items : [];
              if (items.length === 0 && localMatch && Array.isArray(localMatch.items) && localMatch.items.length > 0) {
                items = localMatch.items;
              }
              if (items.length === 0) {
                const bCode = rq.code ? getQuoteItemsBackup(rq.code) : null;
                const bId = rq.id ? getQuoteItemsBackup(rq.id) : null;
                if (bCode && bCode.length > 0) items = bCode;
                else if (bId && bId.length > 0) items = bId;
              }
              if (items.length === 0 && (Number(rq.totalAmount || 0) > 0 || Number(rq.totalCost || 0) > 0)) {
                items = [{
                  id: `item-${rq.id || Date.now()}-fallback`,
                  itemNumber: 1,
                  name: rq.subject || `Fornecimento para ${rq.clientCompany || 'Cliente'}`,
                  description: '',
                  rawSearchQuery: rq.subject || rq.code,
                  partNumber: '',
                  ncm: '',
                  imageUrl: '',
                  showImage: false,
                  quantity: 1,
                  unit: 'Un.',
                  costPrice: Number(rq.totalCost || 0),
                  shippingCost: Number(rq.totalShipping || 0),
                  taxPercent: Number(rq.globalTaxPercent || 6),
                  markupPercent: Number(rq.averageMargin || 35),
                  unitPrice: Number(rq.totalAmount || 0),
                  totalPrice: Number(rq.totalAmount || 0),
                  sourceUrl: '',
                  supplier: ''
                }];
              }
              if (items.length > 0) {
                if (rq.code) saveQuoteItemsBackup(rq.code, items);
                if (rq.id) saveQuoteItemsBackup(rq.id, items);
                return { ...rq, items };
              }
              return rq;
            });
            saveQuotes(merged);
            return merged;
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
        const localProducts = getProducts();

        if (remoteProducts && remoteProducts.length > 0) {
          // Identifica produtos locais que ainda não foram para o Supabase e envia imediatamente
          const remoteSkus = new Set(remoteProducts.map(p => (p.sku || p.partNumber || '').trim().toLowerCase()));
          const missingLocals = localProducts.filter(lp => {
            const sku = (lp.sku || lp.partNumber || '').trim().toLowerCase();
            return sku && !remoteSkus.has(sku);
          });

          if (missingLocals.length > 0) {
            console.log(`[SmartQuote] Enviando ${missingLocals.length} produtos locais pendentes diretamente para o Supabase...`);
            syncBatchProductsToSupabase(missingLocals).catch(err => {
              console.warn('[SmartQuote] Erro ao sincronizar produtos pendentes com o Supabase:', err);
            });
            const merged = [...remoteProducts, ...missingLocals];
            setProducts(merged);
            saveProducts(merged);
          } else {
            setProducts(remoteProducts);
            saveProducts(remoteProducts);
          }
        } else if (localProducts && localProducts.length > 0) {
          // Se a tabela do banco estava vazia, envia todos os produtos locais imediatamente para o Supabase
          console.log(`[SmartQuote] Cadastrando imediatamente ${localProducts.length} produtos locais no Supabase...`);
          syncBatchProductsToSupabase(localProducts).catch(err => {
            console.warn('[SmartQuote] Falha ao cadastrar produtos locais no Supabase:', err);
          });
          setProducts(localProducts);
        }

        // 4. Empresas e Cidades de Frete
        const remoteCompanies = await fetchClientCompaniesFromSupabase();
        if (remoteCompanies && remoteCompanies.length > 0) {
          const localCompanies = getClientCompanies();
          const localPrefixById = new Map<string, string>();
          const localPrefixByName = new Map<string, string>();
          localCompanies.forEach(c => {
            if (c.prefix) {
              localPrefixById.set(c.id, c.prefix);
              const clean = c.name.replace(/^(ao|à|a|para)\s+/i, '').trim().toLowerCase();
              localPrefixByName.set(clean, c.prefix);
            }
          });

          const mergedCompanies = remoteCompanies.map(rc => {
            const clean = rc.name.replace(/^(ao|à|a|para)\s+/i, '').trim().toLowerCase();
            const preservedPrefix = rc.prefix || localPrefixById.get(rc.id) || localPrefixByName.get(clean);
            return {
              ...rc,
              prefix: (preservedPrefix as 'À' | 'Ao') || (rc.name.trim().toLowerCase().startsWith('ao ') ? 'Ao' : 'À')
            };
          });

          setClientCompanies(mergedCompanies);
          saveClientCompanies(mergedCompanies);
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

  // Google Workspace / Gmail Real Integration State
  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean>(() => !!getStoredAccessToken());
  const [connectedUserEmail, setConnectedUserEmail] = useState<string | null>(() => getStoredUserEmail() || settings.email || 'lucas@infodesk.com.br');
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

  const handleConnectGoogle = async () => {
    try {
      setEmailSyncError(null);
      setIsSyncingEmails(true);
      const { token, email } = await requestGmailAccessToken(googleClientId);
      setIsGoogleConnected(true);
      setConnectedUserEmail(email);
      setSettings(prev => ({ ...prev, googleAccountEmail: email, googleWorkspaceConnected: true }));

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
      setIsGoogleConnected(true);
      setConnectedUserEmail(auth.email);
      setSettings(prev => {
        const updated = { ...prev, googleAccountEmail: auth.email, googleWorkspaceConnected: true };
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

    registerOrUpdateClient(
      newQuote.clientCompany,
      newQuote.contactPerson,
      newQuote.clientEmail,
      newQuote.clientPhone,
      newQuote.deliveryLocation
    );

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
      id: `quote-${Date.now()}`,
      code: generateQuoteCode('COTACAO'),
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
    setActiveTab('builder');
  };

  const handleSaveProductToCatalog = (p: Product) => {
    setProducts(prev => {
      const existingIdx = prev.findIndex(item => 
        (p.id && item.id === p.id) || 
        (p.partNumber && item.partNumber && item.partNumber.trim().toLowerCase() === p.partNumber.trim().toLowerCase()) ||
        (p.sku && item.sku && item.sku.trim().toLowerCase() === p.sku.trim().toLowerCase()) ||
        (p.name && item.name && item.name.trim().toLowerCase() === p.name.trim().toLowerCase())
      );
      let next: Product[];
      if (existingIdx >= 0) {
        next = [...prev];
        next[existingIdx] = { ...prev[existingIdx], ...p };
      } else {
        next = [p, ...prev];
      }
      saveProducts(next);
      return next;
    });
    syncProductToSupabase(p);
  };

  const handleSaveQuote = () => {
    registerOrUpdateClient(
      currentQuote.clientCompany,
      currentQuote.contactPerson,
      currentQuote.clientEmail,
      currentQuote.clientPhone,
      currentQuote.deliveryLocation
    );

    // Salva backup de itens imediatamente
    if (currentQuote.items && currentQuote.items.length > 0) {
      if (currentQuote.code) saveQuoteItemsBackup(currentQuote.code, currentQuote.items);
      if (currentQuote.id) saveQuoteItemsBackup(currentQuote.id, currentQuote.items);
    }

    setQuotes(prev => {
      const idx = prev.findIndex(q => q.id === currentQuote.id || q.code === currentQuote.code);
      let next: Quote[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = currentQuote;
      } else {
        next = [currentQuote, ...prev];
      }
      saveQuotes(next);
      return next;
    });

    syncQuoteToSupabase(currentQuote);
    alert('Orçamento salvo com sucesso!');
  };

  const handleDeleteQuote = async (quoteToDelete: Quote) => {
    setQuotes(prev => {
      const next = prev.filter(q => q.id !== quoteToDelete.id && q.code !== quoteToDelete.code);
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
    registerOrUpdateClient(
      sentQuote.clientCompany,
      sentQuote.contactPerson,
      sentQuote.clientEmail,
      sentQuote.clientPhone,
      sentQuote.deliveryLocation
    );

    let token = getStoredAccessToken();

    // Se não estiver conectado ou token expirado, conecta automaticamente com o Google
    if (!token) {
      try {
        const auth = await requestGmailAccessToken(googleClientId, true);
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
      const recipient = (sentQuote.recipientEmails || sentQuote.clientEmail || '').trim();
      if (!recipient) {
        throw new Error('Nenhum e-mail de destinatário informado.');
      }

      // Nome do remetente solicitado: "primeiro nome do responsavel que está salvo nas configuraçoes" - "Nome fantasia salvo nas configurações"
      const repFirstName = (settings.representativeName || '').trim().split(/\s+/)[0] || 'Lucas';
      const tradeName = (settings.tradeName || 'Infodesk').trim();
      const senderDisplayName = `${repFirstName} - ${tradeName}`;

      // O Gmail exige que o campo From corresponda à conta autenticada (ou um alias configurado nela).
      // Usar a conta conectada garante 100% de entrega e gravação imediata nos "Itens Enviados" do Gmail.
      const senderAddress = connectedUserEmail || settings.googleAccountEmail || 'me';
      const replyToAddress = settings.email || senderAddress;
      const finalSubject = (sentQuote.subject || '').trim() || `Proposta Comercial ${sentQuote.code} — Infodesk — Fornecimento de Produtos`;

      await sendRealGmailMessage(token, {
        to: recipient,
        cc: sentQuote.ccEmails,
        from: senderAddress,
        fromName: senderDisplayName,
        replyTo: replyToAddress,
        subject: finalSubject,
        bodyText: `Prezada(o) ${sentQuote.contactPerson || 'Cliente'},\n\nEm atenção à solicitação de Vossa Senhoria, encaminhamos a proposta comercial ${sentQuote.code} para ${sentQuote.clientCompany}.\n\nValor Total: R$ ${sentQuote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nCondições de Pagamento: ${sentQuote.paymentTerms}\nPrazo de Entrega: ${sentQuote.deliveryDays}\nGarantia: ${sentQuote.warrantyTerms}\n\nAtenciosamente,\n${settings.representativeName}\n${tradeName}\nTelefone: ${settings.phone}\nWhatsApp: ${settings.whatsapp}\n${settings.address} – ${settings.cityState}`,
        bodyHtml: proposalHtml
      });
    } catch (err: any) {
      console.error('Erro no envio via Gmail API:', err);
      // Se deu erro de conta errada, 400, 401, token ou from, limpa a sessão para permitir escolher a certa
      disconnectGmailAccount();
      setIsGoogleConnected(false);
      setConnectedUserEmail(null);
      throw new Error(`Falha no envio do Gmail: ${err.message || 'Verifique se você selecionou a conta correta do Google'}`);
    }

    const finalSubject = (sentQuote.subject || '').trim() || `Proposta Comercial ${sentQuote.code} — Infodesk — Fornecimento de Produtos`;
    const quoteToSave: Quote = {
      ...sentQuote,
      subject: finalSubject
    };

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

    syncQuoteToSupabase(quoteToSave);
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
    // 1. Já possui itens na memória
    if (Array.isArray(q.items) && q.items.length > 0) {
      if (q.code) saveQuoteItemsBackup(q.code, q.items);
      if (q.id) saveQuoteItemsBackup(q.id, q.items);
      return q.items;
    }

    // 2. Tentar recuperar da lista de cotações em memória
    const matched = localQuotes.find(item => item.id === q.id || item.code === q.code);
    if (matched && Array.isArray(matched.items) && matched.items.length > 0) {
      if (q.code) saveQuoteItemsBackup(q.code, matched.items);
      if (q.id) saveQuoteItemsBackup(q.id, matched.items);
      return matched.items;
    }

    // 3. Tentar recuperar do rascunho salvo no localStorage
    const draft = getCurrentDraftQuote();
    if (draft && (draft.id === q.id || draft.code === q.code) && Array.isArray(draft.items) && draft.items.length > 0) {
      if (q.code) saveQuoteItemsBackup(q.code, draft.items);
      if (q.id) saveQuoteItemsBackup(q.id, draft.items);
      return draft.items;
    }

    // 4. Tentar recuperar do backup persistente por código e id
    const bCode = q.code ? getQuoteItemsBackup(q.code) : null;
    if (bCode && bCode.length > 0) return bCode;

    const bId = q.id ? getQuoteItemsBackup(q.id) : null;
    if (bId && bId.length > 0) return bId;

    // 5. Buscar diretamente no Supabase em tempo real caso tenha id no banco
    if (q.id && isSupabaseConfigured) {
      try {
        const remoteItems = await fetchQuoteItemsByQuoteId(q.id);
        if (remoteItems && remoteItems.length > 0) {
          if (q.code) saveQuoteItemsBackup(q.code, remoteItems);
          saveQuoteItemsBackup(q.id, remoteItems);
          return remoteItems;
        }
      } catch (e) {
        console.warn('Erro ao carregar itens do Supabase para quote:', q.id, e);
      }
    }

    // 6. Tentar encontrar e-mail ou análise correspondente
    const searchList = [...emails, ...manualAnalyses];
    const matchingSource = searchList.find(e => {
      const sEmail = (e.senderEmail || '').toLowerCase().trim();
      const qEmail = (q.clientEmail || '').toLowerCase().trim();
      const sComp = (e.senderCompany || '').toLowerCase().trim();
      const qComp = (q.clientCompany || '').toLowerCase().trim();
      const codePrefix = (q.code || '').split(' ')[0].toLowerCase();
      return (
        (qEmail && sEmail === qEmail) ||
        (qComp && (sComp.includes(qComp) || qComp.includes(sComp))) ||
        (codePrefix && sComp.includes(codePrefix))
      );
    });

    if (matchingSource && matchingSource.suggestedItems && matchingSource.suggestedItems.length > 0) {
      const markup = q.globalMarkupPercent ?? settings.defaultMarkupPercent ?? 35;
      const tax = q.globalTaxPercent ?? settings.defaultTaxPercent ?? 6;
      const shipping = q.globalShipping ?? settings.defaultShippingCost ?? 0;
      const reconstructed: QuoteItem[] = matchingSource.suggestedItems.map((it, idx) => {
        const matchedProd = products.find(p => p.name.toLowerCase() === it.name.toLowerCase() || p.name.toLowerCase().includes(it.name.toLowerCase()));
        const exactSearchRef = it.rawSearchQuery || [it.name, it.description].filter(Boolean).join(' - ');
        const resolved = resolveProductDetails(exactSearchRef, it.description);
        const cost = matchedProd ? matchedProd.costPrice : (resolved.estimatedCost || it.estimatedCost || 0);
        const unitPrice = it.unitPrice || calculateCommercialUnitPrice(cost, shipping, markup, tax);
        const markupPercent = (it.unitPrice && cost > 0)
          ? calculateMarkupFromUnitPrice(it.unitPrice, cost, shipping, tax)
          : markup;
        const totalPrice = Number((unitPrice * it.quantity).toFixed(2));
        const finalImageUrl = it.imageUrl || matchedProd?.imageUrl || resolved.imageUrl;
        const finalPartNumber = it.partNumber || it.itemCode || matchedProd?.partNumber || resolved.partNumber;
        const finalNcm = it.ncm || matchedProd?.ncm || resolved.ncm;
        const itemUrl = (it.sourceUrl && isExactProductUrl(it.sourceUrl)) ? it.sourceUrl : (isExactProductUrl(resolved.sourceUrl) ? resolved.sourceUrl : (isExactProductUrl(matchedProd?.sourceUrl) ? matchedProd?.sourceUrl : ''));
        return {
          id: `item-${Date.now()}-${idx}`,
          itemNumber: idx + 1,
          productId: matchedProd?.id,
          name: formatProductSentenceCase(resolved.standardizedName || it.name),
          description: it.description ? formatProductSentenceCase(it.description) : '',
          rawSearchQuery: exactSearchRef,
          partNumber: finalPartNumber,
          ncm: finalNcm,
          imageUrl: finalImageUrl,
          showImage: false,
          quantity: it.quantity,
          unit: it.unit || 'Un.',
          costPrice: cost,
          shippingCost: shipping,
          taxPercent: tax,
          markupPercent,
          unitPrice,
          totalPrice,
          sourceUrl: itemUrl
        };
      });

      if (reconstructed.length > 0) {
        if (q.code) saveQuoteItemsBackup(q.code, reconstructed);
        if (q.id) saveQuoteItemsBackup(q.id, reconstructed);
        return reconstructed;
      }
    }

    // 7. Auto-recuperação infalível baseada nos totais da proposta (evita tabela vazia)
    if (Number(q.totalAmount || 0) > 0 || Number(q.totalCost || 0) > 0) {
      const cost = Number(q.totalCost || 0);
      const shipping = Number(q.totalShipping || 0);
      const tax = Number(q.globalTaxPercent || 6);
      const total = Number(q.totalAmount || 0);
      const markup = (total > 0 && cost > 0)
        ? calculateMarkupFromUnitPrice(total, cost, shipping, tax)
        : Number(q.averageMargin || q.globalMarkupPercent || 35);
      const fallbackItem: QuoteItem = {
        id: `item-${Date.now()}-1`,
        itemNumber: 1,
        name: q.subject || `Fornecimento para ${q.clientCompany || 'Cliente'}`,
        description: '',
        rawSearchQuery: q.subject || q.code,
        partNumber: '',
        ncm: '',
        imageUrl: '',
        showImage: false,
        quantity: 1,
        unit: 'Un.',
        costPrice: cost,
        shippingCost: shipping,
        taxPercent: tax,
        markupPercent: markup,
        unitPrice: total,
        totalPrice: total,
        sourceUrl: '',
        supplier: ''
      };
      if (q.code) saveQuoteItemsBackup(q.code, [fallbackItem]);
      if (q.id) saveQuoteItemsBackup(q.id, [fallbackItem]);
      return [fallbackItem];
    }

    return [];
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
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
            clientCompanies={clientCompanies}
            onSaveCompanies={handleSaveCompanies}
            onDeleteCompany={handleDeleteCompany}
            onDeleteContact={handleDeleteContact}
            onOpenEmailScanner={() => setIsScannerModalOpen(true)}
            onPreview={() => setActiveTab('preview')}
            onSave={handleSaveQuote}
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
            onOpenQuote={async (q) => {
              const matched = quotes.find(item => item.id === q.id || item.code === q.code);
              const itemsToUse = await resolveQuoteItems(q, quotes);
              const fullQuote = { ...matched, ...q, items: itemsToUse };
              setCurrentQuote(fullQuote);
              saveCurrentDraftQuote(fullQuote);
              setActiveTab('preview');
            }}
            onEditQuote={async (q) => {
              const matched = quotes.find(item => item.id === q.id || item.code === q.code);
              const itemsToUse = await resolveQuoteItems(q, quotes);
              const quoteToEdit = { ...matched, ...q, items: itemsToUse };
              setCurrentQuote(quoteToEdit);
              saveCurrentDraftQuote(quoteToEdit);
              setActiveTab('builder');
            }}
            onDeleteQuote={handleDeleteQuote}
            onUpdateQuoteStatus={(quoteId, newStatus) => {
              setQuotes(prev => {
                const next = prev.map(q => q.id === quoteId ? { ...q, status: newStatus } : q);
                saveQuotes(next);
                const updated = next.find(q => q.id === quoteId);
                if (updated) syncQuoteToSupabase(updated);
                return next;
              });
            }}
          />
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            quotes={quotes}
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
            onOpenEmailScanner={() => setIsScannerModalOpen(true)}
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

      <EmailContactScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        existingCompanies={clientCompanies}
        localEmails={emails}
        accessToken={getStoredAccessToken()}
        onSaveCandidate={handleSaveScannedCandidate}
        onSaveAllCandidates={handleSaveAllScannedCandidates}
      />

    </div>
  );
};
