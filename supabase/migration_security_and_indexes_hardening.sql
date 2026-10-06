-- ==============================================================================
-- INFODESK SMARTQUOTE — BLINDAGEM DE SEGURANÇA, RLS & ÍNDICES DE PERFORMANCE
-- Execução: Dashboard do Supabase -> SQL Editor -> New Query -> Run
-- 100% IDEMPOTENTE: Seguro para rodar múltiplas vezes sem risco de perda de dados.
-- ==============================================================================

-- 1. BLINDAGEM DA STORED PROCEDURE ATÔMICA 'save_quote_atomic'
-- Restringe a execução estritamente a usuários autenticados e service_role,
-- bloqueando requisições anônimas não autorizadas.
CREATE OR REPLACE FUNCTION save_quote_atomic(
  p_quote JSONB,
  p_items JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote_id UUID;
BEGIN
  -- Verificação de autorização: impede chamadas anônimas
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Acesso negado: autenticação obrigatória para salvar propostas comerciais.';
  END IF;

  -- 1. Upsert da proposta comercial principal
  INSERT INTO quotes (
    code,
    client_company,
    contact_person,
    client_email,
    client_phone,
    subject,
    city,
    date,
    validity_days,
    payment_terms,
    delivery_days,
    warranty_terms,
    delivery_location,
    shipping_terms,
    opening_text,
    show_product_images,
    total_cost,
    total_shipping,
    total_taxes,
    total_profit,
    total_amount,
    average_margin,
    global_markup_percent,
    global_tax_percent,
    global_shipping,
    status,
    recipient_emails,
    cc_emails,
    sent_at,
    client_order_number,
    approved_at,
    approved_total_amount,
    created_at,
    updated_at
  ) VALUES (
    p_quote->>'code',
    p_quote->>'client_company',
    p_quote->>'contact_person',
    p_quote->>'client_email',
    p_quote->>'client_phone',
    p_quote->>'subject',
    COALESCE(p_quote->>'city', 'Brasília'),
    p_quote->>'date',
    p_quote->>'validity_days',
    p_quote->>'payment_terms',
    p_quote->>'delivery_days',
    p_quote->>'warranty_terms',
    p_quote->>'delivery_location',
    p_quote->>'shipping_terms',
    p_quote->>'opening_text',
    COALESCE((p_quote->>'show_product_images')::BOOLEAN, false),
    COALESCE((p_quote->>'total_cost')::NUMERIC, 0),
    COALESCE((p_quote->>'total_shipping')::NUMERIC, 0),
    COALESCE((p_quote->>'total_taxes')::NUMERIC, 0),
    COALESCE((p_quote->>'total_profit')::NUMERIC, 0),
    COALESCE((p_quote->>'total_amount')::NUMERIC, 0),
    COALESCE((p_quote->>'average_margin')::NUMERIC, 35),
    COALESCE((p_quote->>'global_markup_percent')::NUMERIC, 35),
    COALESCE((p_quote->>'global_tax_percent')::NUMERIC, 6),
    COALESCE((p_quote->>'global_shipping')::NUMERIC, 0),
    COALESCE(p_quote->>'status', 'draft'),
    CASE WHEN p_quote->'recipient_emails' IS NOT NULL THEN ARRAY(SELECT jsonb_array_elements_text(p_quote->'recipient_emails')) ELSE ARRAY[]::TEXT[] END,
    CASE WHEN p_quote->'cc_emails' IS NOT NULL THEN ARRAY(SELECT jsonb_array_elements_text(p_quote->'cc_emails')) ELSE ARRAY[]::TEXT[] END,
    CASE WHEN p_quote->>'sent_at' IS NOT NULL THEN (p_quote->>'sent_at')::TIMESTAMPTZ ELSE NULL END,
    p_quote->>'client_order_number',
    CASE WHEN p_quote->>'approved_at' IS NOT NULL THEN (p_quote->>'approved_at')::TIMESTAMPTZ ELSE NULL END,
    CASE WHEN p_quote->>'approved_total_amount' IS NOT NULL THEN (p_quote->>'approved_total_amount')::NUMERIC ELSE NULL END,
    COALESCE((p_quote->>'created_at')::TIMESTAMPTZ, NOW()),
    NOW()
  )
  ON CONFLICT (code) DO UPDATE SET
    client_company = EXCLUDED.client_company,
    contact_person = EXCLUDED.contact_person,
    client_email = EXCLUDED.client_email,
    client_phone = EXCLUDED.client_phone,
    subject = EXCLUDED.subject,
    city = EXCLUDED.city,
    date = EXCLUDED.date,
    validity_days = EXCLUDED.validity_days,
    payment_terms = EXCLUDED.payment_terms,
    delivery_days = EXCLUDED.delivery_days,
    warranty_terms = EXCLUDED.warranty_terms,
    delivery_location = EXCLUDED.delivery_location,
    shipping_terms = EXCLUDED.shipping_terms,
    opening_text = EXCLUDED.opening_text,
    show_product_images = EXCLUDED.show_product_images,
    total_cost = EXCLUDED.total_cost,
    total_shipping = EXCLUDED.total_shipping,
    total_taxes = EXCLUDED.total_taxes,
    total_profit = EXCLUDED.total_profit,
    total_amount = EXCLUDED.total_amount,
    average_margin = EXCLUDED.average_margin,
    global_markup_percent = EXCLUDED.global_markup_percent,
    global_tax_percent = EXCLUDED.global_tax_percent,
    global_shipping = EXCLUDED.global_shipping,
    status = EXCLUDED.status,
    recipient_emails = EXCLUDED.recipient_emails,
    cc_emails = EXCLUDED.cc_emails,
    sent_at = COALESCE(EXCLUDED.sent_at, quotes.sent_at),
    client_order_number = COALESCE(EXCLUDED.client_order_number, quotes.client_order_number),
    approved_at = COALESCE(EXCLUDED.approved_at, quotes.approved_at),
    approved_total_amount = COALESCE(EXCLUDED.approved_total_amount, quotes.approved_total_amount),
    updated_at = NOW()
  RETURNING id INTO v_quote_id;

  -- 2. Atualização atômica dos itens da proposta comercial
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    DELETE FROM quote_items WHERE quote_id = v_quote_id;

    INSERT INTO quote_items (
      quote_id,
      item_number,
      product_id,
      name,
      description,
      quantity,
      unit,
      cost_price,
      shipping_cost,
      tax_percent,
      markup_percent,
      unit_price,
      total_price,
      supplier,
      part_number,
      ncm,
      image_url,
      show_image,
      source_url,
      raw_search_query,
      approved,
      approved_quantity,
      purchase_status,
      actual_cost_price,
      actual_unit_cost_price,
      actual_purchase_url,
      actual_shipping_cost,
      shipping_pending,
      payment_method,
      purchased_at,
      purchase_notes,
      actual_tax_percent,
      client_order_number
    )
    SELECT
      v_quote_id,
      COALESCE((item->>'item_number')::INTEGER, 1),
      CASE WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') ~ '^[0-9a-fA-F-]{36}$' THEN (item->>'product_id')::UUID ELSE NULL END,
      item->>'name',
      COALESCE(item->>'description', ''),
      COALESCE((item->>'quantity')::INTEGER, 1),
      COALESCE(item->>'unit', 'Un.'),
      COALESCE((item->>'cost_price')::NUMERIC, 0),
      COALESCE((item->>'shipping_cost')::NUMERIC, 0),
      COALESCE((item->>'tax_percent')::NUMERIC, 6),
      COALESCE((item->>'markup_percent')::NUMERIC, 35),
      COALESCE((item->>'unit_price')::NUMERIC, 0),
      COALESCE((item->>'total_price')::NUMERIC, 0),
      item->>'supplier',
      item->>'part_number',
      item->>'ncm',
      item->>'image_url',
      COALESCE((item->>'show_image')::BOOLEAN, false),
      item->>'source_url',
      item->>'raw_search_query',
      COALESCE((item->>'approved')::BOOLEAN, false),
      (item->>'approved_quantity')::INTEGER,
      COALESCE(item->>'purchase_status', 'pending'),
      (item->>'actual_cost_price')::NUMERIC,
      (item->>'actual_unit_cost_price')::NUMERIC,
      item->>'actual_purchase_url',
      COALESCE((item->>'actual_shipping_cost')::NUMERIC, 0),
      COALESCE((item->>'shipping_pending')::BOOLEAN, false),
      item->>'payment_method',
      item->>'purchased_at',
      item->>'purchase_notes',
      (item->>'actual_tax_percent')::NUMERIC,
      item->>'client_order_number'
    FROM jsonb_array_elements(p_items) AS item;
  END IF;
END;
$$;

-- Revoga execução pública / anônima e concede apenas para authenticated e service_role
REVOKE EXECUTE ON FUNCTION save_quote_atomic(JSONB, JSONB) FROM public;
REVOKE EXECUTE ON FUNCTION save_quote_atomic(JSONB, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION save_quote_atomic(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION save_quote_atomic(JSONB, JSONB) TO service_role;


-- ==============================================================================
-- 2. BLINDAGEM DE ROW LEVEL SECURITY (RLS)
-- Garante que dados corporativos sensíveis sejam acessíveis apenas para
-- usuários devidamente autenticados no Supabase Auth.
-- ==============================================================================

-- Remover políticas públicas abertas anteriores
DROP POLICY IF EXISTS "Allow public select quotes" ON quotes;
DROP POLICY IF EXISTS "Allow public select quote_items" ON quote_items;
DROP POLICY IF EXISTS "Allow public select client_companies" ON client_companies;
DROP POLICY IF EXISTS "Allow public select client_contacts" ON client_contacts;
DROP POLICY IF EXISTS "Allow public select incoming_emails" ON incoming_emails;
DROP POLICY IF EXISTS "Allow public select products" ON products;
DROP POLICY IF EXISTS "Allow public select company_settings" ON company_settings;
DROP POLICY IF EXISTS "Allow public select payment_methods" ON payment_methods;
DROP POLICY IF EXISTS "Allow public select product_categories" ON product_categories;
DROP POLICY IF EXISTS "Allow public select measurement_units" ON measurement_units;
DROP POLICY IF EXISTS "Allow public select suppliers" ON suppliers;
DROP POLICY IF EXISTS "Allow public select procurement_items" ON procurement_items;

-- Garantir RLS habilitado em todas as tabelas
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE incoming_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurement_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_items ENABLE ROW LEVEL SECURITY;

-- Políticas Authenticated para Leitura e Gerenciamento
DROP POLICY IF EXISTS "Allow authenticated read quotes" ON quotes;
CREATE POLICY "Allow authenticated read quotes" ON quotes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated manage quotes" ON quotes;
CREATE POLICY "Allow authenticated manage quotes" ON quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated read quote_items" ON quote_items;
CREATE POLICY "Allow authenticated read quote_items" ON quote_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated manage quote_items" ON quote_items;
CREATE POLICY "Allow authenticated manage quote_items" ON quote_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated manage client_companies" ON client_companies;
CREATE POLICY "Allow authenticated manage client_companies" ON client_companies FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated manage client_contacts" ON client_contacts;
CREATE POLICY "Allow authenticated manage client_contacts" ON client_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated manage incoming_emails" ON incoming_emails;
CREATE POLICY "Allow authenticated manage incoming_emails" ON incoming_emails FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated manage products" ON products;
CREATE POLICY "Allow authenticated manage products" ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated manage company_settings" ON company_settings;
CREATE POLICY "Allow authenticated manage company_settings" ON company_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated manage payment_methods" ON payment_methods;
CREATE POLICY "Allow authenticated manage payment_methods" ON payment_methods FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated manage product_categories" ON product_categories;
CREATE POLICY "Allow authenticated manage product_categories" ON product_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated manage measurement_units" ON measurement_units;
CREATE POLICY "Allow authenticated manage measurement_units" ON measurement_units FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated manage suppliers" ON suppliers;
CREATE POLICY "Allow authenticated manage suppliers" ON suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated manage procurement_items" ON procurement_items;
CREATE POLICY "Allow authenticated manage procurement_items" ON procurement_items FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ==============================================================================
-- 3. ÍNDICES DE PERFORMANCE DE CONSULTA
-- Acelera listagens temporais, buscas de histórico e joins entre orçamentos e itens.
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_sent_at ON quotes(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_product_id ON quote_items(product_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_client_contacts_company_id ON client_contacts(company_id);

-- Recarrega cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';
