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
import { 
  CompanySettings, 
  IncomingEmail, 
  Product, 
  Quote, 
  QuoteItem 
} from './types';
import { 
  getEmails, 
  getProducts, 
  getQuotes, 
  getSettings, 
  saveEmails, 
  saveProducts, 
  saveQuotes, 
  saveSettings 
} from './utils/storage';
import { 
  getStoredAccessToken, 
  getStoredUserEmail, 
  requestGmailAccessToken, 
  fetchRealGmailMessages, 
  sendRealGmailMessage, 
  disconnectGmailAccount 
} from './services/gmailService';
import { extractItemsFromEmailContent, extractDeliveryLocation, extractFullCompanyName, calculateCommercialUnitPrice } from './utils/aiEmailParser';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inbox' | 'builder' | 'preview' | 'catalog' | 'history' | 'websearch'>('inbox');
  const [settings, setSettings] = useState<CompanySettings>(getSettings());
  const [products, setProducts] = useState<Product[]>(getProducts());
  const [emails, setEmails] = useState<IncomingEmail[]>(getEmails());
  const [quotes, setQuotes] = useState<Quote[]>(getQuotes());

  const [isWebSearchOpen, setIsWebSearchOpen] = useState(false);
  const [webSearchQuery, setWebSearchQuery] = useState('');
  const [webSearchTargetIndex, setWebSearchTargetIndex] = useState<number | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Google Workspace / Gmail Real Integration State
  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean>(() => !!getStoredAccessToken());
  const [connectedUserEmail, setConnectedUserEmail] = useState<string | null>(() => getStoredUserEmail() || settings.email || 'lucas@infodesk.com.br');
  const [isSyncingEmails, setIsSyncingEmails] = useState(false);
  const [emailSyncError, setEmailSyncError] = useState<string | null>(null);

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '219637540127-tle29vean1bmjgm5irhs1n3eer1iqiep.apps.googleusercontent.com';

  const [currentQuote, setCurrentQuote] = useState<Quote>(() => {
    const existing = quotes[0];
    if (existing) return existing;
    return {
      id: `quote-${Date.now()}`,
      code: 'CNC 280826',
      clientCompany: 'CNC — Confederação Nacional do Comércio',
      contactPerson: 'Sra. Alexandra',
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

  const handleConnectGoogle = async () => {
    try {
      setEmailSyncError(null);
      setIsSyncingEmails(true);
      const { token, email } = await requestGmailAccessToken(googleClientId);
      setIsGoogleConnected(true);
      setConnectedUserEmail(email);
      setSettings(prev => ({ ...prev, googleAccountEmail: email, googleWorkspaceConnected: true }));

      const realMessages = await fetchRealGmailMessages(token);
      if (realMessages.length > 0) {
        setEmails(realMessages);
      }
    } catch (err: any) {
      setEmailSyncError(err.message || 'Não foi possível autenticar com o Google. Verifique se o pop-up foi autorizado.');
    } finally {
      setIsSyncingEmails(false);
    }
  };

  const handleRefreshEmails = async () => {
    const token = getStoredAccessToken();
    if (!token) {
      handleConnectGoogle();
      return;
    }
    try {
      setEmailSyncError(null);
      setIsSyncingEmails(true);
      const realMessages = await fetchRealGmailMessages(token);
      if (realMessages.length > 0) {
        setEmails(realMessages);
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
      const matchedProd = products.find(p => p.name.toLowerCase().includes(item.name.toLowerCase()));
      const cost = matchedProd ? matchedProd.costPrice : (item.estimatedCost || 150);
      const unitPrice = calculateCommercialUnitPrice(cost, shipping, markup, tax);
      const totalPrice = Number((unitPrice * item.quantity).toFixed(2));
      const itemUrl = item.sourceUrl || matchedProd?.sourceUrl || `https://www.google.com/search?q=${encodeURIComponent(item.name)}`;

      return {
        id: `item-${Date.now()}-${idx}`,
        itemNumber: idx + 1,
        productId: matchedProd?.id,
        name: item.name,
        description: item.description,
        rawSearchQuery: item.rawSearchQuery || item.name,
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
    const detectedLocation = email.deliveryLocation || extractDeliveryLocation(email.body, `${email.snippet} ${email.senderCompany}`);
    const shippingTerms = `Frete incluso p/ ${detectedLocation}.`;

    const newQuote: Quote = {
      id: `quote-${Date.now()}`,
      code: `${email.senderCompany.split(' ')[0].toUpperCase() || 'COT'} ${new Date().toLocaleDateString('pt-BR').replace(/\//g, '')}`,
      clientCompany: email.senderCompany,
      contactPerson: email.senderName,
      clientEmail: email.senderEmail,
      clientPhone: '',
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
      globalTaxPercent: tax,
      globalShipping: shipping,
      status: 'draft',
      createdAt: new Date().toISOString()
    };

    setCurrentQuote(newQuote);
    setActiveTab('builder');
  };

  const handleParseCustomEmail = (rawText: string) => {
    const parsedItems = extractItemsFromEmailContent(rawText);
    const markup = settings.defaultMarkupPercent || 35;
    const tax = settings.defaultTaxPercent || 6;
    const shipping = settings.defaultShippingCost || 0;

    const items: QuoteItem[] = parsedItems.map((item, idx) => {
      const matchedProd = products.find(p => p.name.toLowerCase().includes(item.name.toLowerCase()));
      const cost = matchedProd ? matchedProd.costPrice : (item.estimatedCost || 150);
      const unitPrice = calculateCommercialUnitPrice(cost, shipping, markup, tax);
      const totalPrice = Number((unitPrice * item.quantity).toFixed(2));
      const itemUrl = item.sourceUrl || matchedProd?.sourceUrl || `https://www.google.com/search?q=${encodeURIComponent(item.name)}`;

      return {
        id: `item-${Date.now()}-${idx}`,
        itemNumber: idx + 1,
        productId: matchedProd?.id,
        name: item.name,
        description: item.description,
        rawSearchQuery: item.rawSearchQuery || item.name,
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
    const companyName = detectedCompany && detectedCompany !== 'Empresa / Solicitante' ? detectedCompany : 'Cliente Solicitante';
    const cleanPrefix = companyName.replace(/[^A-Za-z0-9]/g, ' ').trim().split(/\s+/)[0].toUpperCase();
    const code = `${cleanPrefix || 'COT'} ${new Date().toLocaleDateString('pt-BR').replace(/\//g, '')}`;

    const newQuote: Quote = {
      id: `quote-${Date.now()}`,
      code,
      clientCompany: companyName,
      contactPerson: 'Responsável',
      clientEmail: 'contato@cliente.com.br',
      clientPhone: '',
      subject: 'Proposta Comercial Sob Demanda',
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
      globalTaxPercent: tax,
      globalShipping: shipping,
      status: 'draft',
      createdAt: new Date().toISOString()
    };

    setCurrentQuote(newQuote);
    setActiveTab('builder');
  };

  const handleNewQuote = () => {
    const blank: Quote = {
      id: `quote-${Date.now()}`,
      code: `CNC ${new Date().getDate().toString().padStart(2, '0')}${(new Date().getMonth() + 1).toString().padStart(2, '0')}${new Date().getFullYear().toString().slice(-2)}`,
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
      averageMargin: settings.defaultMarkupPercent || 35,
      status: 'draft',
      createdAt: new Date().toISOString()
    };
    setCurrentQuote(blank);
    setActiveTab('builder');
  };

  const handleSaveQuote = () => {
    setQuotes(prev => {
      const idx = prev.findIndex(q => q.id === currentQuote.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = currentQuote;
        return next;
      }
      return [currentQuote, ...prev];
    });
    alert('Orçamento salvo com sucesso!');
  };

  const handleConfirmSendEmail = async (sentQuote: Quote) => {
    const token = getStoredAccessToken();
    if (token) {
      try {
        await sendRealGmailMessage(token, {
          to: sentQuote.clientEmail,
          from: settings.email,
          subject: `Proposta Comercial ${sentQuote.code} — Infodesk — Fornecimento de Produtos`,
          bodyText: `Prezada(o) ${sentQuote.contactPerson || 'Cliente'},\n\nEm atenção à solicitação de Vossa Senhoria, encaminhamos a proposta comercial ${sentQuote.code} para ${sentQuote.clientCompany}.\n\nValor Total: R$ ${sentQuote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\nCondições de Pagamento: ${sentQuote.paymentTerms}\nPrazo de Entrega: ${sentQuote.deliveryDays}\nGarantia: ${sentQuote.warrantyTerms}\n\nAtenciosamente,\n${settings.representativeName}\nInfodesk — Informática & Tecnologia\nTelefone: ${settings.phone}\nWhatsApp: ${settings.whatsapp}\n${settings.address} – ${settings.cityState}`
        });
      } catch (err: any) {
        console.warn('Envio Gmail API:', err.message);
      }
    }

    setCurrentQuote(sentQuote);
    setQuotes(prev => {
      const filtered = prev.filter(q => q.id !== sentQuote.id);
      return [sentQuote, ...filtered];
    });
    setActiveTab('history');
  };

  const handleAddWebSearchItemToQuote = (item: Partial<QuoteItem>) => {
    const newItem: QuoteItem = {
      id: `item-${Date.now()}`,
      itemNumber: currentQuote.items.length + 1,
      name: item.name || '',
      description: item.description || '',
      quantity: item.quantity || 1,
      unit: item.unit || 'Un.',
      costPrice: item.costPrice || 0,
      markupPercent: item.markupPercent || 35,
      unitPrice: item.unitPrice || 0,
      totalPrice: item.totalPrice || 0,
      sourceUrl: item.sourceUrl || `https://www.google.com/search?q=${encodeURIComponent(item.name || '')}`
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
        settings={settings}
        onNewQuote={handleNewQuote}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'inbox' && (
          <InboxView
            emails={emails}
            onSelectEmailToQuote={handleSelectEmailToQuote}
            onParseCustomEmail={handleParseCustomEmail}
            isGoogleConnected={isGoogleConnected}
            connectedEmail={connectedUserEmail}
            isSyncing={isSyncingEmails}
            syncError={emailSyncError}
            onConnectGoogle={handleConnectGoogle}
            onDisconnectGoogle={handleDisconnectGoogle}
            onRefreshEmails={handleRefreshEmails}
          />
        )}

        {activeTab === 'builder' && (
          <QuoteBuilder
            currentQuote={currentQuote}
            setCurrentQuote={setCurrentQuote}
            products={products}
            settings={settings}
            onPreview={() => setActiveTab('preview')}
            onSave={handleSaveQuote}
            onSendEmail={() => setIsEmailModalOpen(true)}
            onOpenWebSearch={(query?: string, itemIdx?: number | null) => {
              setWebSearchQuery(query || '');
              setWebSearchTargetIndex(itemIdx !== undefined ? itemIdx : null);
              setIsWebSearchOpen(true);
            }}
            onSaveToCatalog={(p) => setProducts(prev => [p, ...prev])}
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
              setCurrentQuote(q);
              setActiveTab('preview');
            }}
          />
        )}
      </main>

      <WebSearchModal
        isOpen={isWebSearchOpen}
        onClose={() => setIsWebSearchOpen(false)}
        initialQuery={webSearchQuery}
        targetItemIndex={webSearchTargetIndex}
        onAddToQuote={handleAddWebSearchItemToQuote}
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
        onSaveToCatalog={(p) => setProducts(prev => [p, ...prev])}
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
        onSaveSettings={setSettings}
      />

    </div>
  );
};
