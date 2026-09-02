import { createClient } from '@supabase/supabase-js';
import { CompanySettings, IncomingEmail, Product, Quote } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

/**
 * Syncs company settings to Supabase
 */
export async function syncCompanySettingsToSupabase(settings: CompanySettings): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('company_settings').upsert({
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
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Erro ao sincronizar configurações no Supabase:', err);
  }
}

/**
 * Syncs a quote and its items to Supabase
 */
export async function syncQuoteToSupabase(quote: Quote): Promise<void> {
  if (!supabase) return;
  try {
    const { data: savedQuote, error: quoteError } = await supabase.from('quotes').upsert({
      id: quote.id.startsWith('quote-') ? undefined : quote.id,
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
      show_product_images: quote.showProductImages ?? true,
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
    }).select().single();

    if (quoteError || !savedQuote) {
      console.warn('Erro ao salvar quote no Supabase:', quoteError);
      return;
    }

    // Delete and recreate items for clean state
    await supabase.from('quote_items').delete().eq('quote_id', savedQuote.id);

    if (quote.items && quote.items.length > 0) {
      const itemsPayload = quote.items.map(item => ({
        quote_id: savedQuote.id,
        item_number: item.itemNumber,
        product_id: item.productId || null,
        name: item.name,
        description: item.description || '',
        raw_search_query: item.rawSearchQuery || item.name,
        part_number: item.partNumber || null,
        ncm: item.ncm || null,
        image_url: item.imageUrl || null,
        show_image: item.showImage ?? true,
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

      await supabase.from('quote_items').insert(itemsPayload);
    }
  } catch (err) {
    console.warn('Erro ao sincronizar orçamentos no Supabase:', err);
  }
}

/**
 * Syncs product to Supabase catalog
 */
export async function syncProductToSupabase(product: Product): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('products').upsert({
      sku: product.sku,
      part_number: product.partNumber || null,
      ncm: product.ncm || '84713019',
      name: product.name,
      description: product.description,
      category: product.category,
      cost_price: product.costPrice,
      unit: product.unit || 'Un.',
      supplier: product.supplier || null,
      stock: product.stock ?? 0,
      image_url: product.imageUrl || null,
      source_url: product.sourceUrl || null,
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Erro ao sincronizar produto no Supabase:', err);
  }
}
