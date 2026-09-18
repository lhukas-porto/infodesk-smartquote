import { createClient } from '@supabase/supabase-js';
import { ClientCompany, ClientContact, CompanySettings, IncomingEmail, Product, Quote, QuoteItem } from '../types';
import { extractStoreNameFromUrl } from '../utils/aiEmailParser';

const supabaseUrl = (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_SUPABASE_URL) || (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_URL : '') || '';
const supabaseAnonKey = (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY) || (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_ANON_KEY : '') || '';


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
      email: data.email,
      representativeName: data.representative_name,
      defaultValidityDays: data.default_validity_days,
      defaultPaymentTerms: data.default_payment_terms,
      defaultDeliveryDays: data.default_delivery_days,
      defaultWarrantyTerms: data.default_warranty_terms,
      defaultOpeningText: data.default_opening_text,
      defaultMarkupPercent: !isNaN(Number(data.default_markup_percent)) ? Number(data.default_markup_percent) : 23.5,
      defaultTaxPercent: !isNaN(Number(data.default_tax_percent)) ? Number(data.default_tax_percent) : 9.1,
      defaultShippingCost: !isNaN(Number(data.default_shipping_cost)) ? Number(data.default_shipping_cost) : 0,
      googleWorkspaceConnected: Boolean(data.google_workspace_connected ?? true),
      googleAccountEmail: data.google_account_email || data.email,
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
      email: settings.email,
      representative_name: settings.representativeName,
      default_validity_days: settings.defaultValidityDays,
      default_payment_terms: settings.defaultPaymentTerms,
      default_delivery_days: settings.defaultDeliveryDays,
      default_warranty_terms: settings.defaultWarrantyTerms,
      default_opening_text: settings.defaultOpeningText,
      default_markup_percent: settings.defaultMarkupPercent,
      default_tax_percent: settings.defaultTaxPercent,
      default_shipping_cost: settings.defaultShippingCost,
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
        status: q.status || 'draft',
        createdAt: q.created_at,
        sentAt: q.sent_at
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

  const itemsPayload = (quote.items || []).map(item => ({
    item_number: item.itemNumber,
    product_id: isValidUuid(item.productId) ? item.productId : null,
    name: item.name,
    description: item.description || '',
    raw_search_query: item.rawSearchQuery || item.name,
    part_number: item.partNumber || null,
    ncm: item.ncm || null,
    image_url: item.imageUrl || null,
    show_image: item.showImage ?? false,
    quantity: item.quantity,
    unit: item.unit || 'Un.',
    cost_price: item.costPrice,
    shipping_cost: item.shippingCost ?? 0,
    tax_percent: item.taxPercent ?? 6,
    markup_percent: item.markupPercent,
    unit_price: item.unitPrice,
    total_price: item.totalPrice,
    source_url: item.sourceUrl || null
  }));

  // 1. Tentar salvar atomicamente via RPC PostgreSQL no Supabase (transação segura)
  try {
    const { error: rpcError } = await supabase.rpc('save_quote_atomic', {
      p_quote: {
        code: quote.code,
        client_company: quote.clientCompany,
        contact_person: quote.contactPerson,
        client_email: quote.clientEmail,
        client_phone: quote.clientPhone,
        subject: quote.subject,
        city: quote.city,
        date: quote.date,
        validity_days: quote.validityDays,
        payment_terms: quote.paymentTerms,
        delivery_days: quote.deliveryDays,
        warranty_terms: quote.warrantyTerms,
        delivery_location: quote.deliveryLocation,
        shipping_terms: quote.shippingTerms,
        opening_text: quote.openingText,
        show_product_images: quote.showProductImages ?? false,
        total_cost: quote.totalCost,
        total_shipping: quote.totalShipping ?? 0,
        total_taxes: quote.totalTaxes ?? 0,
        total_profit: quote.totalProfit,
        total_amount: quote.totalAmount,
        average_margin: quote.averageMargin,
        global_markup_percent: quote.globalMarkupPercent ?? 35,
        global_tax_percent: quote.globalTaxPercent ?? 6,
        global_shipping: quote.globalShipping ?? 0,
        status: quote.status,
        recipient_emails: quote.recipientEmails,
        cc_emails: quote.ccEmails,
        sent_at: quote.sentAt
      },
      p_items: itemsPayload
    });

    if (!rpcError) {
      return;
    }
  } catch (rpcErr) {
    // Fallback silencioso caso a função RPC ainda não tenha sido executada no banco
  }

  // 2. Fallback direto caso a RPC não esteja disponível
  try {
    const { data: savedQuote, error: quoteError } = await supabase.from('quotes').upsert({
      code: quote.code,
      client_company: quote.clientCompany,
      contact_person: quote.contactPerson,
      client_email: quote.clientEmail,
      client_phone: quote.clientPhone,
      subject: quote.subject,
      city: quote.city,
      date: quote.date,
      validity_days: quote.validityDays,
      payment_terms: quote.paymentTerms,
      delivery_days: quote.deliveryDays,
      warranty_terms: quote.warrantyTerms,
      delivery_location: quote.deliveryLocation,
      shipping_terms: quote.shippingTerms,
      opening_text: quote.openingText,
      show_product_images: quote.showProductImages ?? false,
      total_cost: quote.totalCost,
      total_shipping: quote.totalShipping ?? 0,
      total_taxes: quote.totalTaxes ?? 0,
      total_profit: quote.totalProfit,
      total_amount: quote.totalAmount,
      average_margin: quote.averageMargin,
      global_tax_percent: quote.globalTaxPercent ?? 6,
      global_shipping: quote.globalShipping ?? 0,
      status: quote.status,
      updated_at: new Date().toISOString()
    }, { onConflict: 'code' }).select().single();

    if (quoteError || !savedQuote) {
      console.warn('Erro ao salvar quote no Supabase:', quoteError);
      return;
    }

    // Limpar itens anteriores e recriar para manter consistência absoluta
    await supabase.from('quote_items').delete().eq('quote_id', savedQuote.id);

    if (quote.items && quote.items.length > 0) {
      const itemsPayload = quote.items.map(item => ({
        quote_id: savedQuote.id,
        item_number: item.itemNumber,
        product_id: isValidUuid(item.productId) ? item.productId : null,
        name: item.name,
        description: item.description || '',
        raw_search_query: item.rawSearchQuery || item.name,
        part_number: item.partNumber || null,
        ncm: item.ncm || null,
        image_url: item.imageUrl || null,
        show_image: item.showImage ?? false,
        quantity: item.quantity,
        unit: item.unit || 'Un.',
        cost_price: item.costPrice,
        shipping_cost: item.shippingCost ?? 0,
        tax_percent: item.taxPercent ?? 6,
        markup_percent: item.markupPercent,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
        source_url: item.sourceUrl || null
      }));

      const { error: itemsInsertError } = await supabase.from('quote_items').insert(itemsPayload);
      if (itemsInsertError) {
        console.error('Erro ao inserir itens da cotação no Supabase:', itemsInsertError);
      }
    }
  } catch (err) {
    console.warn('Erro ao sincronizar orçamento no Supabase:', err);
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
  const sku = (product.sku || product.partNumber || '').trim();
  if (!sku) return;

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
      const sku = (p.sku || p.partNumber || '').trim();
      if (!sku) continue;
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

    return companiesData.map((c: any) => ({
      id: c.id,
      name: c.name,
      prefix: c.prefix || undefined,
      defaultDeliveryLocation: c.default_delivery_location || 'Brasília',
      locations: Array.isArray(c.locations) && c.locations.length > 0 ? c.locations : ['Brasília'],
      lastUsed: c.last_used,
      contacts: contactsByCompanyId[c.id] || []
    }));
  } catch (err) {
    console.warn('Erro ao carregar empresas do Supabase:', err);
    return null;
  }
}

export async function syncClientCompaniesToSupabase(companies: ClientCompany[]): Promise<void> {
  if (!supabase || !companies || companies.length === 0) return;
  try {
    // 1. Batch upsert de todas as empresas (tentativa com prefix)
    const companiesPayload = companies.map(comp => ({
      id: comp.id,
      name: comp.name,
      prefix: comp.prefix || null,
      default_delivery_location: comp.defaultDeliveryLocation || 'Brasília',
      locations: comp.locations || ['Brasília'],
      last_used: comp.lastUsed || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    
    const { error: upsertErr } = await supabase.from('client_companies').upsert(companiesPayload);
    if (upsertErr) {
      // Fallback sem prefix caso a coluna ainda não tenha sido criada no Supabase
      console.warn('Tentativa com prefix falhou no Supabase, tentando payload padrão:', upsertErr.message);
      const fallbackPayload = companies.map(comp => ({
        id: comp.id,
        name: comp.name,
        default_delivery_location: comp.defaultDeliveryLocation || 'Brasília',
        locations: comp.locations || ['Brasília'],
        last_used: comp.lastUsed || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
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
          location: ct.location || '',
          last_used: ct.lastUsed || new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      });
    });

    if (allContactsPayload.length > 0) {
      await supabase.from('client_contacts').upsert(allContactsPayload);
    }

    // 3. Sincronização e exclusão de contatos removidos por empresa
    for (const comp of companies) {
      const activeContactIds = (comp.contacts || []).map(c => c.id).filter(Boolean);
      if (activeContactIds.length > 0) {
        await supabase
          .from('client_contacts')
          .delete()
          .eq('company_id', comp.id)
          .not('id', 'in', `(${activeContactIds.map(id => `"${id}"`).join(',')})`);
      } else {
        await supabase.from('client_contacts').delete().eq('company_id', comp.id);
      }
    }
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

// ==============================================================================
// 6. METADADOS: CATEGORIAS E UNIDADES REGISTRADAS (Unificação com Banco)
// ==============================================================================
export async function fetchRegisteredMetadataFromSupabase(): Promise<{ categories: string[]; units: string[] } | null> {
  if (!supabase) return null;
  try {
    const categoriesSet = new Set<string>();
    const unitsSet = new Set<string>();

    // 1. Tentar ler de company_settings (se colunas já existirem no banco)
    try {
      const { data: settingsData } = await supabase
        .from('company_settings')
        .select('registered_categories, registered_units')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (settingsData) {
        if (Array.isArray(settingsData.registered_categories)) {
          settingsData.registered_categories.forEach((c: any) => {
            if (typeof c === 'string' && c.trim()) categoriesSet.add(c.trim());
          });
        }
        if (Array.isArray(settingsData.registered_units)) {
          settingsData.registered_units.forEach((u: any) => {
            if (typeof u === 'string' && u.trim()) unitsSet.add(u.trim());
          });
        }
      }
    } catch {
      // Colunas podem não existir ainda no banco físico; segue graciosamente
    }

    // 2. Extrair categorias e unidades diretamente da tabela products já existente
    try {
      const { data: productsData } = await supabase
        .from('products')
        .select('category, unit');

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
      console.warn('Aviso ao ler categorias de products no Supabase:', e);
    }

    // 3. Extrair unidades das quote_items já salvas no banco
    try {
      const { data: quoteItemsData } = await supabase
        .from('quote_items')
        .select('unit');

      if (Array.isArray(quoteItemsData)) {
        quoteItemsData.forEach((qi: any) => {
          if (qi.unit && typeof qi.unit === 'string' && qi.unit.trim()) {
            unitsSet.add(qi.unit.trim());
          }
        });
      }
    } catch {
      // Ignorar se falhar
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

