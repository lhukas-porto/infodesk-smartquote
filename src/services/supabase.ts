import { createClient } from '@supabase/supabase-js';
import { ClientCompany, ClientContact, CompanySettings, IncomingEmail, Product, Quote, QuoteItem } from '../types';
import { extractStoreNameFromUrl } from '../utils/aiEmailParser';

const FALLBACK_SUPABASE_URL = 'https://dxhbjygtbcxpabflsijv.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4aGJqeWd0YmN4cGFiZmxzaWp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzMTQ3MTIsImV4cCI6MjEwMzg5MDcxMn0.Bt9yCZDtPYCk8Cqa223MgReN2EmGfCl-41fR22GAucU';

const supabaseUrl = (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_SUPABASE_URL) 
  || (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_URL : '') 
  || FALLBACK_SUPABASE_URL;

const supabaseAnonKey = (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY) 
  || (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_ANON_KEY : '') 
  || FALLBACK_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

// ==============================================================================
// 1. CONFIGURAÇÕES DA EMPRESA (company_settings)
// ==============================================================================
export async function fetchCompanySettingsFromSupabase(): Promise<CompanySettings | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from('company_settings').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      companyName: data.company_name,
      tradeName: data.trade_name,
      cnpj: data.cnpj,
      stateRegistration: data.state_registration,
      address: data.address,
      cityState: data.city_state,
      phone: data.phone,
      whatsapp: data.whatsapp,
      email: String(data.email || 'lucas@infodesk.net.br').replace('@infodesk.com.br', '@infodesk.net.br'),
      representativeName: data.representative_name,
      defaultValidityDays: data.default_validity_days,
      defaultPaymentTerms: data.default_payment_terms,
      defaultDeliveryDays: data.default_delivery_days,
      defaultWarrantyTerms: data.default_warranty_terms,
      defaultOpeningText: data.default_opening_text,
      defaultMarkupPercent: !isNaN(Number(data.default_markup_percent)) ? Number(data.default_markup_percent) : 23.5,
      defaultTaxPercent: !isNaN(Number(data.default_tax_percent)) ? Number(data.default_tax_percent) : 9.1,
      defaultShippingCost: !isNaN(Number(data.default_shipping_cost)) ? Number(data.default_shipping_cost) : 0,
      dailyDollarRate: !isNaN(Number(data.daily_dollar_rate)) && Number(data.daily_dollar_rate) > 0 ? Number(data.daily_dollar_rate) : 5.60,
      googleWorkspaceConnected: Boolean(data.google_workspace_connected ?? true),
      googleAccountEmail: String(data.google_account_email || data.email || 'lucas@infodesk.net.br').replace('@infodesk.com.br', '@infodesk.net.br'),
      registeredCategories: Array.isArray(data.registered_categories) ? data.registered_categories : undefined,
      registeredUnits: Array.isArray(data.registered_units) ? data.registered_units : undefined
    };
  } catch (err) {
    console.warn('Erro ao consultar configurações no Supabase:', err);
    return null;
  }
}

export async function syncCompanySettingsToSupabase(settings: CompanySettings): Promise<void> {
  if (!supabase) return;
  try {
    const payload = {
      company_name: settings.companyName,
      trade_name: settings.tradeName,
      cnpj: settings.cnpj,
      state_registration: settings.stateRegistration,
      address: settings.address,
      city_state: settings.cityState,
      phone: settings.phone,
      whatsapp: settings.whatsapp,
      email: (settings.email || 'lucas@infodesk.net.br').replace('@infodesk.com.br', '@infodesk.net.br'),
      google_account_email: (settings.googleAccountEmail || settings.email || 'lucas@infodesk.net.br').replace('@infodesk.com.br', '@infodesk.net.br'),
      representative_name: settings.representativeName,
      default_validity_days: settings.defaultValidityDays,
      default_payment_terms: settings.defaultPaymentTerms,
      default_delivery_days: settings.defaultDeliveryDays,
      default_warranty_terms: settings.defaultWarrantyTerms,
      default_opening_text: settings.defaultOpeningText,
      default_markup_percent: settings.defaultMarkupPercent,
      default_tax_percent: settings.defaultTaxPercent,
      default_shipping_cost: settings.defaultShippingCost,
      daily_dollar_rate: settings.dailyDollarRate || 5.60,
      ...(Array.isArray(settings.registeredCategories) ? { registered_categories: settings.registeredCategories } : {}),
      ...(Array.isArray(settings.registeredUnits) ? { registered_units: settings.registeredUnits } : {}),
      updated_at: new Date().toISOString()
    };

    // Se temos o ID ou encontramos o registro existente, atualizamos diretamente pelo ID para nunca duplicar
    let targetId = settings.id;
    if (!targetId) {
      const { data: existing } = await supabase.from('company_settings').select('id').order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (existing?.id) {
        targetId = existing.id;
      }
    }

    if (targetId) {
      const { error } = await supabase.from('company_settings').update(payload).eq('id', targetId);
      if (error) {
        // Se a coluna ainda não existir no Postgres, tenta sem os campos de categorias/unidades para não quebrar a persistência
        const fallbackPayload = { ...payload };
        delete (fallbackPayload as any).registered_categories;
        delete (fallbackPayload as any).registered_units;
        const { error: retryError } = await supabase.from('company_settings').update(fallbackPayload).eq('id', targetId);
        if (retryError) {
          console.error('Erro ao atualizar company_settings no Supabase:', retryError);
        }
      }
    } else {
      const { error } = await supabase.from('company_settings').insert(payload);
      if (error) {
        const fallbackPayload = { ...payload };
        delete (fallbackPayload as any).registered_categories;
        delete (fallbackPayload as any).registered_units;
        const { error: retryError } = await supabase.from('company_settings').insert(fallbackPayload);
        if (retryError) {
          console.error('Erro ao inserir company_settings no Supabase:', retryError);
        }
      }
    }
  } catch (err) {
    console.warn('Erro ao sincronizar configurações no Supabase:', err);
  }
}

// ==============================================================================
// 2. ORÇAMENTOS E ITENS (quotes & quote_items)
// ==============================================================================
function normalizeEmailListString(val: any): string | undefined {
  if (!val) return undefined;
  if (Array.isArray(val)) {
    const joined = val.map(x => String(x || '').trim()).filter(Boolean).join(', ');
    return joined || undefined;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed || undefined;
  }
  return undefined;
}

export async function fetchQuotesFromSupabase(limitCount: number = 60): Promise<Quote[] | null> {
  if (!supabase) return null;
  try {
    const { data: quotesData, error: quotesError } = await supabase
      .from('quotes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limitCount);

    if (quotesError || !quotesData) {
      console.warn('Erro ao carregar orçamentos do Supabase:', quotesError);
      return null;
    }

    const quoteIds = quotesData.map((q: any) => q.id).filter(Boolean);
    let itemsData: any[] = [];

    // Otimização: busca itens somente das propostas carregadas, evitando N+1 ou carregar a tabela inteira
    if (quoteIds.length > 0) {
      const { data, error: itemsError } = await supabase
        .from('quote_items')
        .select('*')
        .in('quote_id', quoteIds)
        .order('item_number', { ascending: true });

      if (itemsError) {
        console.warn('Erro ao carregar itens de orçamentos do Supabase:', itemsError);
      } else if (data) {
        itemsData = data;
      }
    }

    const itemsByQuoteId: Record<string, QuoteItem[]> = {};
    (itemsData || []).forEach((row: any) => {
      const qKey = row.quote_id;
      if (!itemsByQuoteId[qKey]) {
        itemsByQuoteId[qKey] = [];
      }
      itemsByQuoteId[qKey].push({
        id: row.id,
        productId: row.product_id || undefined,
        itemNumber: row.item_number,
        name: row.name,
        description: row.description || '',
        rawSearchQuery: row.raw_search_query || row.name,
        partNumber: row.part_number || '',
        ncm: row.ncm || '',
        imageUrl: row.image_url || '',
        showImage: Boolean(row.show_image),
        quantity: row.quantity,
        unit: row.unit || 'Un.',
        costPrice: Number(row.cost_price),
        shippingCost: Number(row.shipping_cost || 0),
        taxPercent: Number(row.tax_percent || 6),
        markupPercent: Number(row.markup_percent || 35),
        unitPrice: Number(row.unit_price),
        totalPrice: Number(row.total_price),
        sourceUrl: row.source_url || '',
        supplier: row.supplier || extractStoreNameFromUrl(row.source_url) || ''
      });
    });

    return quotesData.map((q: any): Quote => {
      const quoteItems = (itemsByQuoteId[q.id] && itemsByQuoteId[q.id].length > 0)
        ? itemsByQuoteId[q.id]
        : (Number(q.total_amount || 0) > 0 ? [{
            id: `item-${q.id}-fallback`,
            itemNumber: 1,
            name: q.subject || `Fornecimento para ${q.client_company || 'Cliente'}`,
            description: '',
            rawSearchQuery: q.subject || q.code,
            partNumber: '',
            ncm: '',
            imageUrl: '',
            showImage: false,
            quantity: 1,
            unit: 'Un.',
            costPrice: Number(q.total_cost || 0),
            shippingCost: Number(q.total_shipping || 0),
            taxPercent: Number(q.global_tax_percent || 6),
            markupPercent: Number(q.average_margin || 35),
            unitPrice: Number(q.total_amount || 0),
            totalPrice: Number(q.total_amount || 0),
            sourceUrl: '',
            supplier: ''
          }] : []);

      return {
        id: q.id,
        code: q.code,
        clientCompany: q.client_company,
        contactPerson: q.contact_person,
        clientEmail: q.client_email,
        clientPhone: q.client_phone || '',
        subject: q.subject,
        city: q.city || 'Brasília',
        date: q.date,
        validityDays: q.validity_days,
        paymentTerms: q.payment_terms,
        deliveryDays: q.delivery_days,
        warrantyTerms: q.warranty_terms,
        deliveryLocation: q.delivery_location || 'Brasília',
        shippingTerms: q.shipping_terms || `Frete incluso p/ ${q.delivery_location || 'Brasília'}.`,
        openingText: q.opening_text,
        showProductImages: Boolean(q.show_product_images),
        items: quoteItems,
        totalCost: Number(q.total_cost),
        totalShipping: Number(q.total_shipping || 0),
        totalTaxes: Number(q.total_taxes || 0),
        totalProfit: Number(q.total_profit),
        totalAmount: Number(q.total_amount),
        averageMargin: Number(q.average_margin || 35),
        globalMarkupPercent: q.global_markup_percent !== undefined && q.global_markup_percent !== null ? Number(q.global_markup_percent) : undefined,
        globalTaxPercent: Number(q.global_tax_percent || 6),
        globalShipping: Number(q.global_shipping || 0),
        status: (q.sent_at && (!q.status || q.status === 'draft')) || (q.code && q.code.trim().toUpperCase() === 'CNC 210926-3') ? 'sent' : (q.status || 'draft'),
        recipientEmails: normalizeEmailListString(q.recipient_emails),
        ccEmails: normalizeEmailListString(q.cc_emails),
        createdAt: q.created_at,
        sentAt: q.sent_at || ((q.code && q.code.trim().toUpperCase() === 'CNC 210926-3') ? q.created_at || new Date().toISOString() : undefined)
      };
    });
  } catch (err) {
    console.warn('Erro ao consultar orçamentos no Supabase:', err);
    return null;
  }
}

function isValidUuid(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

export async function fetchQuoteItemsByQuoteId(quoteId: string): Promise<QuoteItem[]> {
  if (!supabase || !quoteId) return [];
  try {
    const { data: itemsData, error } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', quoteId)
      .order('item_number', { ascending: true });

    if (error || !itemsData) return [];
    return itemsData.map((row: any) => ({
      id: row.id,
      productId: row.product_id || undefined,
      itemNumber: row.item_number,
      name: row.name,
      description: row.description || '',
      rawSearchQuery: row.raw_search_query || row.name,
      partNumber: row.part_number || '',
      ncm: row.ncm || '',
      imageUrl: row.image_url || '',
      showImage: Boolean(row.show_image),
      quantity: row.quantity,
      unit: row.unit || 'Un.',
      costPrice: Number(row.cost_price),
      shippingCost: Number(row.shipping_cost || 0),
      taxPercent: Number(row.tax_percent || 6),
      markupPercent: Number(row.markup_percent || 35),
      unitPrice: Number(row.unit_price),
      totalPrice: Number(row.total_price),
      sourceUrl: row.source_url || '',
      supplier: row.supplier || extractStoreNameFromUrl(row.source_url) || ''
    }));
  } catch (err) {
    console.warn('Erro ao buscar itens de orçamento específico no Supabase:', err);
    return [];
  }
}

export async function syncQuoteToSupabase(quote: Quote): Promise<void> {
  if (!supabase) return;

  const cleanCompany = (quote.clientCompany || '').trim() || 'Cliente';
  const cleanContact = (quote.contactPerson || '').trim() || 'A/C Compras';
  const cleanEmail = (quote.clientEmail || '').trim() || 'contato@cliente.com.br';
  const cleanPhone = (quote.clientPhone || '').trim() || null;
  const cleanSubject = (quote.subject || '').trim() || `Fornecimento de produtos para informática — ${cleanCompany}`;
  const cleanCity = (quote.city || '').trim() || 'Brasília';
  const cleanDate = (quote.date || '').trim() || new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const cleanValidity = (quote.validityDays || '').trim() || '03 (três) dias';
  const cleanPayment = (quote.paymentTerms || '').trim() || 'Faturado.';
  const cleanDelivery = (quote.deliveryDays || '').trim() || 'em até 10 dias úteis';
  const cleanWarranty = (quote.warrantyTerms || '').trim() || '06 meses';
  const cleanDeliveryLocation = (quote.deliveryLocation || '').trim() || 'Brasília';
  const cleanShippingTerms = (quote.shippingTerms || '').trim() || `Frete incluso p/ ${cleanDeliveryLocation}.`;
  const cleanOpeningText = (quote.openingText || '').trim() || 'Em atenção à solicitação de Vossa Senhoria, formulamos a seguinte proposta comercial:';

  const sanitizedQuotePayload = {
    code: quote.code,
    client_company: cleanCompany,
    contact_person: cleanContact,
    client_email: cleanEmail,
    client_phone: cleanPhone,
    subject: cleanSubject,
    city: cleanCity,
    date: cleanDate,
    validity_days: cleanValidity,
    payment_terms: cleanPayment,
    delivery_days: cleanDelivery,
    warranty_terms: cleanWarranty,
    delivery_location: cleanDeliveryLocation,
    shipping_terms: cleanShippingTerms,
    opening_text: cleanOpeningText,
    show_product_images: Boolean(quote.showProductImages),
    total_cost: Number(quote.totalCost || 0),
    total_shipping: Number(quote.totalShipping || 0),
    total_taxes: Number(quote.totalTaxes || 0),
    total_profit: Number(quote.totalProfit || 0),
    total_amount: Number(quote.totalAmount || 0),
    average_margin: Number(quote.averageMargin || 35),
    global_tax_percent: Number(quote.globalTaxPercent ?? 6),
    global_shipping: Number(quote.globalShipping ?? 0),
    status: (quote.sentAt && (!quote.status || quote.status === 'draft')) || (quote.code && quote.code.trim().toUpperCase() === 'CNC 210926-3') ? 'sent' : (quote.status || 'draft'),
    sent_at: quote.sentAt || ((quote.status === 'sent' || (quote.code && quote.code.trim().toUpperCase() === 'CNC 210926-3')) ? new Date().toISOString() : null),
    updated_at: new Date().toISOString()
  };

  const itemsPayload = (quote.items || []).map((item, idx) => ({
    item_number: item.itemNumber || idx + 1,
    product_id: isValidUuid(item.productId) ? item.productId : null,
    name: (item.name || '').trim() || `Item ${idx + 1}`,
    description: item.description || '',
    raw_search_query: item.rawSearchQuery || item.name || '',
    part_number: item.partNumber || null,
    ncm: item.ncm || null,
    image_url: item.imageUrl || null,
    show_image: Boolean(item.showImage),
    quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
    unit: item.unit || 'Un.',
    cost_price: Number(item.costPrice || 0),
    shipping_cost: Number(item.shippingCost || 0),
    tax_percent: Number(item.taxPercent ?? 6),
    markup_percent: Number(item.markupPercent || 35),
    unit_price: Number(item.unitPrice || 0),
    total_price: Number(item.totalPrice || 0),
    source_url: item.sourceUrl || null
  }));

  // 1. Tentar salvar atomicamente via RPC PostgreSQL no Supabase se existir
  try {
    const { error: rpcError } = await supabase.rpc('save_quote_atomic', {
      p_quote: sanitizedQuotePayload,
      p_items: itemsPayload
    });

    if (!rpcError) {
      return;
    }
  } catch (rpcErr) {
    // Fallback caso a função RPC não exista no schema cache
  }

  // 2. Upsert direto protegido na tabela quotes
  const { data: savedQuote, error: quoteError } = await supabase
    .from('quotes')
    .upsert(sanitizedQuotePayload, { onConflict: 'code' })
    .select()
    .single();

  if (quoteError || !savedQuote) {
    console.error('Erro ao salvar quote no Supabase:', quoteError);
    throw new Error(`Falha no banco Supabase: ${quoteError?.message || 'registro não retornado'}`);
  }

  // Limpar itens anteriores e recriar para manter consistência absoluta
  await supabase.from('quote_items').delete().eq('quote_id', savedQuote.id);

  if (itemsPayload.length > 0) {
    const itemsToInsert = itemsPayload.map(it => ({
      ...it,
      quote_id: savedQuote.id
    }));

    const { error: itemsInsertError } = await supabase.from('quote_items').insert(itemsToInsert);
    if (itemsInsertError) {
      console.error('Erro ao inserir itens da cotação no Supabase:', itemsInsertError);
      throw new Error(`Falha ao gravar itens no banco: ${itemsInsertError.message}`);
    }
  }
}

export async function deleteQuoteFromSupabase(code: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('quotes').delete().eq('code', code);
  } catch (err) {
    console.warn('Erro ao deletar orçamento no Supabase:', err);
  }
}

// ==============================================================================
// 3. CATÁLOGO DE PRODUTOS (products)
// ==============================================================================
export async function fetchProductsFromSupabase(): Promise<Product[] | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from('products').select('*').order('name');
    if (error || !data || data.length === 0) return null;
    return data.map((p: any) => ({
      id: p.id,
      sku: p.sku,
      partNumber: p.part_number,
      ncm: p.ncm,
      name: p.name,
      description: p.description || '',
      category: p.category || 'Informática & Tecnologia',
      costPrice: Number(p.cost_price),
      unit: p.unit || 'Un.',
      supplier: p.supplier || '',
      stock: p.stock || 0,
      imageUrl: p.image_url || '',
      sourceUrl: p.source_url || '',
      lastUpdated: p.updated_at
    }));
  } catch (err) {
    console.warn('Erro ao carregar produtos do Supabase:', err);
    return null;
  }
}

export async function syncProductToSupabase(product: Product): Promise<void> {
  if (!supabase) return;
  let sku = (product.sku || product.partNumber || '').trim();
  if (!sku) {
    const safeNameHash = (product.name || 'PROD').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase();
    const uniqueSuffix = (product.id || Date.now().toString()).slice(-6);
    sku = `INF-${safeNameHash || 'AUTO'}-${uniqueSuffix}`;
  }

  const payload = {
    sku,
    part_number: product.partNumber || null,
    ncm: product.ncm || null,
    name: product.name,
    description: product.description || '',
    category: product.category || 'Informática & Tecnologia',
    cost_price: product.costPrice || 0,
    unit: product.unit || 'Un.',
    supplier: product.supplier || null,
    stock: product.stock ?? 0,
    image_url: product.imageUrl || null,
    source_url: product.sourceUrl || null,
    updated_at: new Date().toISOString()
  };

  try {
    const { error: upsertErr } = await supabase
      .from('products')
      .upsert(payload, { onConflict: 'sku' });

    if (!upsertErr) return;

    // Fallback caso a tabela no Supabase não tenha constraint UNIQUE em sku (erro 42P10)
    console.warn('[SmartQuote] Upsert de produto falhou, aplicando fallback direto:', upsertErr.message);
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('sku', sku)
      .maybeSingle();

    if (existing && existing.id) {
      await supabase.from('products').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('products').insert(payload);
    }
  } catch (err) {
    console.warn('Erro ao sincronizar produto no Supabase:', err);
  }
}

export async function syncBatchProductsToSupabase(products: Product[]): Promise<void> {
  if (!supabase || !products || products.length === 0) return;
  try {
    const seenSkus = new Set<string>();
    const validProducts: Product[] = [];
    
    // Deduplica por SKU para evitar erro do PostgreSQL ON CONFLICT DO UPDATE em lote
    for (const p of products) {
      let sku = (p.sku || p.partNumber || '').trim();
      if (!sku) {
        const safeNameHash = (p.name || 'PROD').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase();
        const uniqueSuffix = (p.id || Math.random().toString(36).substring(2, 8)).slice(-6);
        sku = `INF-${safeNameHash || 'AUTO'}-${uniqueSuffix}`;
      }
      if (!seenSkus.has(sku.toLowerCase())) {
        seenSkus.add(sku.toLowerCase());
        validProducts.push({ ...p, sku });
      }
    }

    if (validProducts.length === 0) return;

    const payload = validProducts.map(p => ({
      sku: p.sku,
      part_number: p.partNumber || null,
      ncm: p.ncm || null,
      name: p.name,
      description: p.description || '',
      category: p.category || 'Informática & Tecnologia',
      cost_price: p.costPrice || 0,
      unit: p.unit || 'Un.',
      supplier: p.supplier || null,
      stock: p.stock ?? 0,
      image_url: p.imageUrl || null,
      source_url: p.sourceUrl || null,
      updated_at: new Date().toISOString()
    }));

    const { error: batchErr } = await supabase.from('products').upsert(payload, { onConflict: 'sku' });
    if (!batchErr) return;

    // Fallback individual resiliente se o upsert em lote for rejeitado pelo banco
    console.warn('[SmartQuote] Upsert em lote rejeitado pelo banco, aplicando fallback item a item:', batchErr.message);
    for (const item of payload) {
      try {
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('sku', item.sku)
          .maybeSingle();

        if (existing && existing.id) {
          await supabase.from('products').update(item).eq('id', existing.id);
        } else {
          await supabase.from('products').insert(item);
        }
      } catch (itemErr) {
        console.warn(`[SmartQuote] Falha ao sincronizar item [${item.sku}]:`, itemErr);
      }
    }
  } catch (err) {
    console.warn('Erro ao sincronizar lote de produtos no Supabase:', err);
  }
}

export async function deleteProductFromSupabase(productSku: string): Promise<void> {
  if (!supabase || !productSku) return;
  try {
    await supabase.from('products').delete().eq('sku', productSku);
  } catch (err) {
    console.warn('Erro ao excluir produto no Supabase:', err);
  }
}

// ==============================================================================
// 4. CLIENTES E COMPRADORES (client_companies & client_contacts)
// ==============================================================================
export async function fetchClientCompaniesFromSupabase(): Promise<ClientCompany[] | null> {
  if (!supabase) return null;
  try {
    const { data: companiesData, error: compError } = await supabase
      .from('client_companies')
      .select('*')
      .order('last_used', { ascending: false });

    if (compError || !companiesData || companiesData.length === 0) return null;

    const { data: contactsData } = await supabase
      .from('client_contacts')
      .select('*')
      .order('last_used', { ascending: false });

    const contactsByCompanyId: Record<string, ClientContact[]> = {};
    (contactsData || []).forEach((ct: any) => {
      if (!contactsByCompanyId[ct.company_id]) {
        contactsByCompanyId[ct.company_id] = [];
      }
      contactsByCompanyId[ct.company_id].push({
        id: ct.id,
        name: ct.name,
        title: ct.title || 'Sr.',
        email: ct.email || '',
        phone: ct.phone || '',
        role: ct.role || undefined,
        location: ct.location || '',
        lastUsed: ct.last_used
      });
    });

    return companiesData.map((c: any) => {
      const rawLocations: string[] = Array.isArray(c.locations) && c.locations.length > 0 
        ? c.locations 
        : [c.default_delivery_location || 'Brasília'];
      
      let extractedWebsite: string | undefined = c.website ? String(c.website).trim() : undefined;
      let extractedLogoUrl: string | undefined = c.logo_url ? String(c.logo_url).trim() : undefined;
      const cleanLocations: string[] = [];

      for (const loc of rawLocations) {
        const item = String(loc || '').trim();
        if (!item) continue;
        if (item.toLowerCase().startsWith('website:') || item.toLowerCase().startsWith('site:')) {
          const domain = item.replace(/^(website:|site:)/i, '').trim();
          if (!extractedWebsite && domain) extractedWebsite = domain;
        } else if (item.toLowerCase().startsWith('logo:')) {
          const logo = item.replace(/^logo:/i, '').trim();
          if (!extractedLogoUrl && logo) extractedLogoUrl = logo;
        } else if (item.startsWith('http://') || item.startsWith('https://')) {
          try {
            const parsed = new URL(item);
            if (!extractedWebsite) extractedWebsite = parsed.hostname.replace(/^www\./, '');
          } catch {
            const domain = item.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
            if (!extractedWebsite) extractedWebsite = domain;
          }
        } else {
          cleanLocations.push(item);
        }
      }

      if (cleanLocations.length === 0) {
        cleanLocations.push(c.default_delivery_location || 'Brasília');
      }

      return {
        id: c.id,
        name: c.name,
        prefix: c.prefix || undefined,
        defaultDeliveryLocation: c.default_delivery_location || cleanLocations[0] || 'Brasília',
        locations: cleanLocations,
        website: extractedWebsite,
        logoUrl: extractedLogoUrl,
        lastUsed: c.last_used,
        contacts: contactsByCompanyId[c.id] || []
      };
    });
  } catch (err) {
    console.warn('Erro ao carregar empresas do Supabase:', err);
    return null;
  }
}

export async function syncClientCompaniesToSupabase(companies: ClientCompany[]): Promise<void> {
  if (!supabase || !companies || companies.length === 0) return;
  try {
    // 1. Batch upsert de todas as empresas (com website e logo serializados de forma compatível)
    const companiesPayload = companies.map(comp => {
      const cleanLocs = (comp.locations || [comp.defaultDeliveryLocation || 'Brasília'])
        .map(l => String(l || '').trim())
        .filter(l => Boolean(l) && !l.toLowerCase().startsWith('website:') && !l.toLowerCase().startsWith('site:') && !l.toLowerCase().startsWith('logo:') && !l.startsWith('http://') && !l.startsWith('https://'));

      if (cleanLocs.length === 0) cleanLocs.push(comp.defaultDeliveryLocation || 'Brasília');

      const persistedLocations = [...cleanLocs];
      if (comp.website && comp.website.trim()) {
        persistedLocations.push(`website:${comp.website.trim()}`);
      }
      if (comp.logoUrl && comp.logoUrl.trim() && comp.logoUrl.startsWith('http')) {
        persistedLocations.push(`logo:${comp.logoUrl.trim()}`);
      }

      return {
        id: comp.id,
        name: comp.name,
        prefix: comp.prefix || null,
        default_delivery_location: comp.defaultDeliveryLocation || cleanLocs[0] || 'Brasília',
        locations: persistedLocations,
        last_used: comp.lastUsed || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });
    
    const { error: upsertErr } = await supabase.from('client_companies').upsert(companiesPayload);
    if (upsertErr) {
      console.warn('Tentativa com prefix falhou no Supabase, tentando fallback sem prefix:', upsertErr.message);
      const fallbackPayload = companiesPayload.map(({ prefix, ...rest }) => rest);
      await supabase.from('client_companies').upsert(fallbackPayload);
    }

    // 2. Batch upsert de todos os contatos
    const allContactsPayload: any[] = [];
    companies.forEach(comp => {
      (comp.contacts || []).forEach(ct => {
        allContactsPayload.push({
          id: ct.id,
          company_id: comp.id,
          name: ct.name,
          title: ct.title || 'Sr.',
          email: ct.email || '',
          phone: ct.phone || '',
          role: ct.role || 'Comprador',
          location: ct.location || '',
          last_used: ct.lastUsed || new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      });
    });

    if (allContactsPayload.length > 0) {
      const { error: ctErr } = await supabase.from('client_contacts').upsert(allContactsPayload);
      if (ctErr) {
        console.warn('Upsert de contatos falhou, tentando fallback sem coluna role:', ctErr.message);
        const fallbackContacts = allContactsPayload.map(({ role, ...rest }) => rest);
        await supabase.from('client_contacts').upsert(fallbackContacts);
      }
    }

    // Observação: Exclusões de contatos são tratadas de forma explícita via deleteContactFromSupabase,
    // evitando deleção acidental de compradores por estados parciais ou dessincronizados.
  } catch (err) {
    console.warn('Erro ao sincronizar empresas no Supabase:', err);
  }
}

export async function deleteCompanyFromSupabase(companyId: string): Promise<void> {
  if (!supabase || !companyId) return;
  try {
    // Excluir compradores vinculados primeiro
    await supabase.from('client_contacts').delete().eq('company_id', companyId);
    // Excluir a empresa
    await supabase.from('client_companies').delete().eq('id', companyId);
  } catch (err) {
    console.warn('Erro ao deletar empresa do Supabase:', err);
  }
}

export async function deleteContactFromSupabase(contactId: string): Promise<void> {
  if (!supabase || !contactId) return;
  try {
    await supabase.from('client_contacts').delete().eq('id', contactId);
  } catch (err) {
    console.warn('Erro ao deletar comprador do Supabase:', err);
  }
}

// ==============================================================================
// 5. E-MAILS CAPTURADOS (incoming_emails)
// ==============================================================================
export async function fetchIncomingEmailsFromSupabase(): Promise<IncomingEmail[] | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('incoming_emails')
      .select('*')
      .order('date', { ascending: false });

    if (error || !data || data.length === 0) return null;

    return data.map((e: any): IncomingEmail => ({
      id: e.id,
      threadId: e.thread_id,
      senderName: e.sender_name,
      senderCompany: e.sender_company,
      senderEmail: e.sender_email,
      senderPhone: e.sender_phone,
      subject: e.subject,
      date: e.date,
      snippet: e.snippet || '',
      body: e.body || '',
      bodyHtml: e.body_html || '',
      deliveryLocation: e.delivery_location || '',
      unread: Boolean(e.unread),
      status: e.status || 'new',
      suggestedItems: Array.isArray(e.suggested_items) ? e.suggested_items : []
    }));
  } catch (err) {
    console.warn('Erro ao carregar e-mails do Supabase:', err);
    return null;
  }
}

export async function syncIncomingEmailsToSupabase(emails: IncomingEmail[]): Promise<void> {
  if (!supabase || !emails || emails.length === 0) return;
  try {
    const payload = emails.map(e => ({
      id: e.id,
      thread_id: e.threadId || null,
      sender_name: e.senderName,
      sender_company: e.senderCompany,
      sender_email: e.senderEmail,
      sender_phone: e.senderPhone || null,
      subject: e.subject,
      date: e.date,
      snippet: e.snippet || '',
      body: e.body || '',
      body_html: e.bodyHtml || null,
      delivery_location: e.deliveryLocation || null,
      unread: e.unread ?? true,
      status: e.status || 'new',
      suggested_items: e.suggestedItems || []
    }));

    await supabase.from('incoming_emails').upsert(payload);
  } catch (err) {
    console.warn('Erro ao sincronizar e-mails no Supabase:', err);
  }
}

export async function deleteIncomingEmailFromSupabase(emailId: string): Promise<void> {
  if (!supabase || !emailId) return;
  try {
    await supabase.from('incoming_emails').delete().eq('id', emailId);
  } catch (err) {
    console.warn('Erro ao excluir e-mail no Supabase:', err);
  }
}

// ==============================================================================
// 6. METADADOS: CATEGORIAS E UNIDADES REGISTRADAS (Unificação com Banco)
// ==============================================================================
export async function fetchRegisteredMetadataFromSupabase(): Promise<{ categories: string[]; units: string[] } | null> {
  if (!supabase) return null;
  try {
    const categoriesSet = new Set<string>();
    const unitsSet = new Set<string>();

    // 1. Tentar ler de company_settings (fonte canônica da verdade gerenciada pelo usuário)
    try {
      const { data: settingsData } = await supabase
        .from('company_settings')
        .select('registered_categories, registered_units')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (settingsData) {
        const hasCategories = Array.isArray(settingsData.registered_categories) && settingsData.registered_categories.length > 0;
        const hasUnits = Array.isArray(settingsData.registered_units) && settingsData.registered_units.length > 0;

        if (hasCategories || hasUnits) {
          const categories = hasCategories
            ? Array.from(new Set((settingsData.registered_categories as string[]).map(c => c?.trim()).filter(Boolean)))
            : [];
          const units = hasUnits
            ? Array.from(new Set((settingsData.registered_units as string[]).map(u => u?.trim()).filter(Boolean)))
            : [];

          return { categories, units };
        }
      }
    } catch {
      // Colunas podem não existir ainda no banco físico; segue graciosamente para bootstrap inicial
    }

    // 2. Fallback de bootstrap inicial apenas se company_settings estiver completamente vazio
    try {
      const { data: productsData } = await supabase
        .from('products')
        .select('category, unit')
        .limit(50);

      if (Array.isArray(productsData)) {
        productsData.forEach((p: any) => {
          if (p.category && typeof p.category === 'string' && p.category.trim()) {
            categoriesSet.add(p.category.trim());
          }
          if (p.unit && typeof p.unit === 'string' && p.unit.trim()) {
            unitsSet.add(p.unit.trim());
          }
        });
      }
    } catch (e) {
      console.warn('Aviso no fallback inicial de categorias/unidades no Supabase:', e);
    }

    return {
      categories: Array.from(categoriesSet),
      units: Array.from(unitsSet)
    };
  } catch (err) {
    console.warn('Erro ao consultar metadados de categorias/unidades no Supabase:', err);
    return null;
  }
}

export async function syncRegisteredMetadataToSupabase(categories: string[], units: string[]): Promise<void> {
  if (!supabase) return;
  try {
    const cleanCats = Array.from(new Set(categories.map(c => c.trim()).filter(Boolean)));
    const cleanUnits = Array.from(new Set(units.map(u => u.trim()).filter(Boolean)));

    // Buscar o ID de company_settings existente
    const { data: existing } = await supabase
      .from('company_settings')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from('company_settings')
        .update({
          registered_categories: cleanCats,
          registered_units: cleanUnits,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (error) {
        console.warn('Aviso ao sincronizar categorias/unidades no Supabase (colunas registradas requerem execução do schema.sql):', error.message);
      }
    }
  } catch (err) {
    console.warn('Erro silencioso ao sincronizar metadados no Supabase:', err);
  }
}

