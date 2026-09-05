import React, { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { InboxView } from './components/InboxView';
import { QuoteBuilder } from './components/QuoteBuilder';
import { QuotePreview } from './components/QuotePreview';
import { CatalogView } from './components/CatalogView';
import { SentHistoryView } from './components/SentHistoryView';
import { WebSearchModal } from './components/WebSearchModal';
import { EmailSendModal } from './components/EmailSendModal';
import { SettingsModal } from './components/SettingsModal';
import { ClientManagementModal } from './components/ClientManagementModal';
import { EmailContactScannerModal } from './components/EmailContactScannerModal';
import { ManualAnalysesView } from './components/ManualAnalysesView';
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
  calculateCommercialUnitPrice, 
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
  syncQuoteToSupabase,
  fetchProductsFromSupabase,
  syncProductToSupabase,
  fetchClientCompaniesFromSupabase,
  syncClientCompaniesToSupabase,
  deleteCompanyFromSupabase,
  deleteContactFromSupabase,
  deleteQuoteFromSupabase,
  fetchIncomingEmailsFromSupabase,
  syncIncomingEmailsToSupabase
} from './services/supabase';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inbox' | 'builder' | 'preview' | 'catalog' | 'history' | 'websearch' | 'analyses'>(() => {
    const saved = getSavedActiveTab('inbox');
    return (['inbox', 'builder', 'preview', 'catalog', 'history', 'websearch', 'analyses'].includes(saved) ? saved : 'inbox') as any;
  });
  const [settings, setSettings] = useState<CompanySettings>(getSettings());
  const [products, setProducts] = useState<Product[]>(getProducts());
  const [emails, setEmails] = useState<IncomingEmail[]>(getEmails());
  const [quotes, setQuotes] = useState<Quote[]>(getQuotes());

  const [isWebSearchOpen, setIsWebSearchOpen] = useState(false);
  const [webSearchQuery, setWebSearchQuery] = useState('');
  const [webSearchTargetIndex, setWebSearchTargetIndex] = useState<number | null>(null);
  const [webSearchExistingItem, setWebSearchExistingItem] = useState<Partial<QuoteItem> | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isClientsModalOpen, setIsClientsModalOpen] = useState(false);
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
              if (items.length > 0) {
                if (rq.code) saveQuoteItemsBackup(rq.code, items);
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
            if (draft && draft.items && draft.items.length > 0) {
              return draft;
            }
            if (prev.code === 'CNC 280826' && remoteQuotes[0]) {
              const firstRemote = remoteQuotes[0];
              // Se o remoteQuote não trouxe itens mas o initial prev tinha, mantém itens
              if ((!firstRemote.items || firstRemote.items.length === 0) && prev.items && prev.items.length > 0) {
                return { ...firstRemote, items: prev.items };
              }
              return firstRemote;
            }
            return prev;
          });
        }

        // 3. Catálogo de Produtos
        const remoteProducts = await fetchProductsFromSupabase();
        if (remoteProducts && remoteProducts.length > 0) {
          setProducts(remoteProducts);
          saveProducts(remoteProducts);
        }

        // 4. Empresas e Cidades de Frete
        const remoteCompanies = await fetchClientCompaniesFromSupabase();
        if (remoteCompanies && remoteCompanies.length > 0) {
          setClientCompanies(remoteCompanies);
          saveClientCompanies(remoteCompanies);
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
    if (draft && Array.isArray(draft.items) && draft.items.length > 0) {
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
  useEffect(() => { saveClientCompanies(clientCompanies); }, [clientCompanies]);
  useEffect(() => { saveCurrentDraftQuote(currentQuote); }, [currentQuote]);
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
      const cost = matchedProd ? matchedProd.costPrice : (resolved.estimatedCost || item.estimatedCost || 150);
      const unitPrice = calculateCommercialUnitPrice(cost, shipping, markup, tax);
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

      const cost = matchedProd ? matchedProd.costPrice : (resolved.estimatedCost || item.estimatedCost || 150);
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
    const defaultTax = settings.defaultTaxPercent ?? 6;
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
        const auth = await requestGmailAccessToken(googleClientId);
        token = auth.token;
        setIsGoogleConnected(true);
        setConnectedUserEmail(auth.email);
        setSettings(prev => ({ ...prev, googleAccountEmail: auth.email, googleWorkspaceConnected: true }));
      } catch (authErr: any) {
        console.error('Falha na autenticação do Gmail:', authErr);
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

      await sendRealGmailMessage(token, {
        to: recipient,
        cc: sentQuote.ccEmails,
        from: senderAddress,
        fromName: senderDisplayName,
        replyTo: replyToAddress,
        subject: `Proposta Comercial ${sentQuote.code} — Infodesk — Fornecimento de Produtos`,
        bodyText: `Prezada(o) ${sentQuote.contactPerson || 'Cliente'},\n\nEm atenção à solicitação de Vossa Senhoria, encaminhamos a proposta comercial ${sentQuote.code} para ${sentQuote.clientCompany}.\n\nValor Total: R$ ${sentQuote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nCondições de Pagamento: ${sentQuote.paymentTerms}\nPrazo de Entrega: ${sentQuote.deliveryDays}\nGarantia: ${sentQuote.warrantyTerms}\n\nAtenciosamente,\n${settings.representativeName}\n${tradeName}\nTelefone: ${settings.phone}\nWhatsApp: ${settings.whatsapp}\n${settings.address} – ${settings.cityState}`,
        bodyHtml: proposalHtml
      });
    } catch (err: any) {
      console.error('Erro no envio via Gmail API:', err);
      // Se o token expirou no meio do caminho, limpa a sessão para reconectar na próxima tentativa
      if (String(err?.message || '').toLowerCase().includes('token') || String(err?.message || '').toLowerCase().includes('401')) {
        setIsGoogleConnected(false);
      }
      throw new Error(`Falha no envio do Gmail: ${err.message || 'Verifique sua conexão'}`);
    }

    setCurrentQuote(sentQuote);
    setQuotes(prev => {
      const filtered = prev.filter(q => q.id !== sentQuote.id && q.code !== sentQuote.code);
      const next = [sentQuote, ...filtered];
      saveQuotes(next);
      return next;
    });

    syncQuoteToSupabase(sentQuote);
    setActiveTab('history');
  };

  const handleAddWebSearchItemToQuote = (item: Partial<QuoteItem>) => {
    const markup = item.markupPercent || settings.defaultMarkupPercent || 35;
    const tax = settings.defaultTaxPercent || 6;
    const shipping = item.shippingCost || settings.defaultShippingCost || 0;
    const cost = item.costPrice || 0;
    const unitPrice = item.unitPrice || calculateCommercialUnitPrice(cost, shipping, markup, tax);
    const qty = item.quantity || 1;
    const totalPrice = Number((unitPrice * qty).toFixed(2));

    const newItem: QuoteItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      itemNumber: currentQuote.items.length + 1,
      name: item.name || '',
      description: item.description || '',
      partNumber: item.partNumber || '',
      ncm: item.ncm || '',
      imageUrl: item.imageUrl || '',
      showImage: item.showImage ?? false,
      quantity: qty,
      unit: item.unit || 'Un.',
      costPrice: cost,
      shippingCost: shipping,
      taxPercent: tax,
      markupPercent: markup,
      unitPrice,
      totalPrice,
      sourceUrl: item.sourceUrl || `https://www.google.com/search?q=${encodeURIComponent(item.name || '')}`,
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
      totalCost: Number(totalCost.toFixed(2)),
      totalShipping: Number(totalShipping.toFixed(2)),
      totalTaxes: Number(totalTaxes.toFixed(2)),
      totalProfit: Number(totalProfit.toFixed(2)),
      totalAmount: Number(totalAmount.toFixed(2)),
      averageMargin: Number(averageMargin.toFixed(1))
    }));
  };

  const handleStartNewQuoteWithItems = (itemsToAdd: Partial<QuoteItem>[]) => {
    const markup = settings.defaultMarkupPercent || 23.5;
    const tax = settings.defaultTaxPercent || 9.1;
    const shipping = settings.defaultShippingCost || 0;

    const items: QuoteItem[] = itemsToAdd.map((item, idx) => {
      const cost = item.costPrice || 0;
      const unitPrice = item.unitPrice || calculateCommercialUnitPrice(cost, shipping, markup, tax);
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
        showImage: item.showImage ?? false,
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
      status: 'draft',
      createdAt: new Date().toISOString()
    };

    setCurrentQuote(newQuote);
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

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unreadCount={emails.filter(e => e.unread).length}
        openSettings={() => setIsSettingsOpen(true)}
        openWebSearch={() => setIsWebSearchOpen(true)}
        openClientsModal={() => setIsClientsModalOpen(true)}
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
            onOpenClientManagement={() => setIsClientsModalOpen(true)}
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
              setIsWebSearchOpen(true);
            }}
            onSaveToCatalog={(p) => {
              setProducts(prev => {
                const next = [p, ...prev];
                saveProducts(next);
                return next;
              });
              syncProductToSupabase(p);
            }}
            onUpdateSettings={handleSaveSettings}
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
            onOpenQuote={(q) => {
              const matched = quotes.find(item => item.id === q.id || item.code === q.code);
              let itemsToUse = (q.items && q.items.length > 0)
                ? q.items
                : (matched && matched.items && matched.items.length > 0 ? matched.items : []);

              if (itemsToUse.length === 0) {
                const bCode = q.code ? getQuoteItemsBackup(q.code) : null;
                const bId = q.id ? getQuoteItemsBackup(q.id) : null;
                if (bCode && bCode.length > 0) itemsToUse = bCode;
                else if (bId && bId.length > 0) itemsToUse = bId;
              }

              if (itemsToUse.length === 0) {
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

                if (matchingSource && matchingSource.suggestedItems?.length > 0) {
                  const markup = q.globalMarkupPercent ?? settings.defaultMarkupPercent ?? 35;
                  const tax = q.globalTaxPercent ?? settings.defaultTaxPercent ?? 6;
                  const shipping = q.globalShipping ?? settings.defaultShippingCost ?? 0;
                  itemsToUse = matchingSource.suggestedItems.map((it, idx) => {
                    const matchedProd = products.find(p => p.name.toLowerCase() === it.name.toLowerCase() || p.name.toLowerCase().includes(it.name.toLowerCase()));
                    const exactSearchRef = it.rawSearchQuery || [it.name, it.description].filter(Boolean).join(' - ');
                    const resolved = resolveProductDetails(exactSearchRef, it.description);
                    const cost = matchedProd ? matchedProd.costPrice : (resolved.estimatedCost || it.estimatedCost || 150);
                    const unitPrice = calculateCommercialUnitPrice(cost, shipping, markup, tax);
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
                      markupPercent: markup,
                      unitPrice,
                      totalPrice,
                      sourceUrl: itemUrl
                    };
                  });
                }
              }

              if (itemsToUse.length > 0 && q.code) {
                saveQuoteItemsBackup(q.code, itemsToUse);
              }

              const fullQuote = { ...matched, ...q, items: itemsToUse };
              setCurrentQuote(fullQuote);
              setActiveTab('preview');
            }}
            onEditQuote={(q) => {
              const matched = quotes.find(item => item.id === q.id || item.code === q.code);
              const draft = getCurrentDraftQuote();
              const draftMatches = draft && (draft.id === q.id || draft.code === q.code);

              let itemsToUse = (q.items && q.items.length > 0) ? q.items : [];
              if (itemsToUse.length === 0 && matched && matched.items && matched.items.length > 0) {
                itemsToUse = matched.items;
              }
              if (itemsToUse.length === 0 && draftMatches && draft.items && draft.items.length > 0) {
                itemsToUse = draft.items;
              }

              if (itemsToUse.length === 0) {
                const bCode = q.code ? getQuoteItemsBackup(q.code) : null;
                const bId = q.id ? getQuoteItemsBackup(q.id) : null;
                if (bCode && bCode.length > 0) itemsToUse = bCode;
                else if (bId && bId.length > 0) itemsToUse = bId;
              }

              if (itemsToUse.length === 0) {
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

                if (matchingSource && matchingSource.suggestedItems?.length > 0) {
                  const markup = q.globalMarkupPercent ?? settings.defaultMarkupPercent ?? 35;
                  const tax = q.globalTaxPercent ?? settings.defaultTaxPercent ?? 6;
                  const shipping = q.globalShipping ?? settings.defaultShippingCost ?? 0;
                  itemsToUse = matchingSource.suggestedItems.map((it, idx) => {
                    const matchedProd = products.find(p => p.name.toLowerCase() === it.name.toLowerCase() || p.name.toLowerCase().includes(it.name.toLowerCase()));
                    const exactSearchRef = it.rawSearchQuery || [it.name, it.description].filter(Boolean).join(' - ');
                    const resolved = resolveProductDetails(exactSearchRef, it.description);
                    const cost = matchedProd ? matchedProd.costPrice : (resolved.estimatedCost || it.estimatedCost || 150);
                    const unitPrice = calculateCommercialUnitPrice(cost, shipping, markup, tax);
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
                      markupPercent: markup,
                      unitPrice,
                      totalPrice,
                      sourceUrl: itemUrl
                    };
                  });
                }
              }

              if (itemsToUse.length > 0 && q.code) {
                saveQuoteItemsBackup(q.code, itemsToUse);
              }

              const quoteToEdit = {
                ...matched,
                ...q,
                items: itemsToUse
              };

              setCurrentQuote(quoteToEdit);
              saveCurrentDraftQuote(quoteToEdit);
              setActiveTab('builder');
            }}
            onDeleteQuote={handleDeleteQuote}
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
      </main>

      <WebSearchModal
        isOpen={isWebSearchOpen}
        onClose={() => {
          setIsWebSearchOpen(false);
          setWebSearchExistingItem(null);
        }}
        initialQuery={webSearchQuery}
        targetItemIndex={webSearchTargetIndex}
        existingItem={webSearchExistingItem}
        onAddToQuote={handleAddWebSearchItemToQuote}
        onStartNewQuoteWithItems={handleStartNewQuoteWithItems}
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
        onSaveToCatalog={(p) => {
          setProducts(prev => {
            const next = [p, ...prev];
            saveProducts(next);
            return next;
          });
          syncProductToSupabase(p);
        }}
      />

      <EmailSendModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        quote={currentQuote}
        settings={settings}
        onConfirmSend={handleConfirmSendEmail}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
      />

      <ClientManagementModal
        isOpen={isClientsModalOpen}
        onClose={() => setIsClientsModalOpen(false)}
        companies={clientCompanies}
        onSaveCompanies={handleSaveCompanies}
        onDeleteCompany={handleDeleteCompany}
        onDeleteContact={handleDeleteContact}
        onOpenEmailScanner={() => setIsScannerModalOpen(true)}
        onSelectBuyerForQuote={(companyName, contact) => {
          setCurrentQuote(prev => ({
            ...prev,
            clientCompany: formatCompanyPrefix(companyName),
            contactPerson: formatContactPerson(contact.name),
            clientEmail: (contact.email || prev.clientEmail || '').toLowerCase().trim(),
            clientPhone: contact.phone || prev.clientPhone
          }));
          setActiveTab('builder');
        }}
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
