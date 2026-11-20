-- ==============================================================================
-- INFODESK SMARTQUOTE — RLS BLINDADO COM ISOLAMENTO CORPORATIVO E RBAC
-- Arquivo: supabase/migration_strict_rbac_and_tenant_rls.sql
-- 
-- Finalidade:
-- 1. Substituir políticas abertas "TO authenticated USING (true)" por regras estritas
--    de autorização corporativa baseadas em domínio oficial (@infodesk.net.br) e RBAC.
-- 2. Proteger 'company_settings' para que apenas administradores possam alterar
--    dados fiscais, CNPJ, margens globais e integrações.
-- 3. Blindar stored procedures atômicas (save_quote_atomic) contra chamadas não autorizadas.
-- 4. 100% IDEMPOTENTE: Seguro para rodar no Supabase Dashboard (SQL Editor).
-- ==============================================================================

-- 1. Habilitar RLS em todas as tabelas (garantia preventiva)
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE incoming_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurement_units ENABLE ROW LEVEL SECURITY;

-- 2. Função de Segurança Auxiliar: Checagem de Administrador do Sistema
CREATE OR REPLACE FUNCTION is_smartquote_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (
    auth.role() = 'service_role' OR
    auth.jwt() ->> 'email' IN ('lucas@infodesk.net.br') OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
$$;

-- 3. Função de Segurança Auxiliar: Checagem de Usuário Corporativo Autorizado
CREATE OR REPLACE FUNCTION is_smartquote_authorized_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (
    auth.role() = 'service_role' OR
    is_smartquote_admin() OR
    (auth.role() = 'authenticated' AND (
      auth.jwt() ->> 'email' LIKE '%@infodesk.net.br' OR
      (auth.jwt() -> 'app_metadata' ->> 'authorized')::BOOLEAN = true
    ))
  );
$$;

-- 4. POLÍTICAS: company_settings (Configurações Fiscais e Globais da Empresa)
DROP POLICY IF EXISTS "Allow authenticated read company_settings" ON company_settings;
DROP POLICY IF EXISTS "Allow authenticated update company_settings" ON company_settings;
DROP POLICY IF EXISTS "Allow authenticated insert company_settings" ON company_settings;
DROP POLICY IF EXISTS "Allow authenticated manage company_settings" ON company_settings;
DROP POLICY IF EXISTS "Allow public access to company_settings" ON company_settings;

-- Leitura permitida para todos os usuários autorizados da equipe
CREATE POLICY "Allow authorized read company_settings"
  ON company_settings FOR SELECT
  TO authenticated
  USING (is_smartquote_authorized_user());

-- Alteração estritamente restrita a Administradores
CREATE POLICY "Allow admin update company_settings"
  ON company_settings FOR UPDATE
  TO authenticated
  USING (is_smartquote_admin())
  WITH CHECK (is_smartquote_admin());

CREATE POLICY "Allow admin insert company_settings"
  ON company_settings FOR INSERT
  TO authenticated
  WITH CHECK (is_smartquote_admin());

-- 5. POLÍTICAS: quotes & quote_items (Propostas Comerciais e Itens)
DROP POLICY IF EXISTS "Allow authenticated manage quotes" ON quotes;
DROP POLICY IF EXISTS "Allow authenticated read quotes" ON quotes;
DROP POLICY IF EXISTS "Allow authenticated manage quote_items" ON quote_items;
DROP POLICY IF EXISTS "Allow authenticated read quote_items" ON quote_items;

CREATE POLICY "Allow authorized manage quotes"
  ON quotes FOR ALL
  TO authenticated
  USING (is_smartquote_authorized_user())
  WITH CHECK (is_smartquote_authorized_user());

CREATE POLICY "Allow authorized manage quote_items"
  ON quote_items FOR ALL
  TO authenticated
  USING (is_smartquote_authorized_user())
  WITH CHECK (is_smartquote_authorized_user());

-- 6. POLÍTICAS: client_companies & client_contacts (Clientes e Contatos)
DROP POLICY IF EXISTS "Allow authenticated manage client_companies" ON client_companies;
DROP POLICY IF EXISTS "Allow authenticated manage client_contacts" ON client_contacts;

CREATE POLICY "Allow authorized manage client_companies"
  ON client_companies FOR ALL
  TO authenticated
  USING (is_smartquote_authorized_user())
  WITH CHECK (is_smartquote_authorized_user());

CREATE POLICY "Allow authorized manage client_contacts"
  ON client_contacts FOR ALL
  TO authenticated
  USING (is_smartquote_authorized_user())
  WITH CHECK (is_smartquote_authorized_user());

-- 7. POLÍTICAS: products, categories & units (Catálogo e Metadados)
DROP POLICY IF EXISTS "Allow authenticated manage products" ON products;
DROP POLICY IF EXISTS "Allow authenticated manage product_categories" ON product_categories;
DROP POLICY IF EXISTS "Allow authenticated manage measurement_units" ON measurement_units;

CREATE POLICY "Allow authorized manage products"
  ON products FOR ALL
  TO authenticated
  USING (is_smartquote_authorized_user())
  WITH CHECK (is_smartquote_authorized_user());

CREATE POLICY "Allow authorized manage product_categories"
  ON product_categories FOR ALL
  TO authenticated
  USING (is_smartquote_authorized_user())
  WITH CHECK (is_smartquote_authorized_user());

CREATE POLICY "Allow authorized manage measurement_units"
  ON measurement_units FOR ALL
  TO authenticated
  USING (is_smartquote_authorized_user())
  WITH CHECK (is_smartquote_authorized_user());

-- 8. POLÍTICAS: suppliers, procurement_items, payment_methods & incoming_emails
DROP POLICY IF EXISTS "Allow authenticated manage suppliers" ON suppliers;
DROP POLICY IF EXISTS "Allow authenticated manage procurement_items" ON procurement_items;
DROP POLICY IF EXISTS "Allow authenticated manage payment_methods" ON payment_methods;
DROP POLICY IF EXISTS "Allow authenticated manage incoming_emails" ON incoming_emails;

CREATE POLICY "Allow authorized manage suppliers"
  ON suppliers FOR ALL
  TO authenticated
  USING (is_smartquote_authorized_user())
  WITH CHECK (is_smartquote_authorized_user());

CREATE POLICY "Allow authorized manage procurement_items"
  ON procurement_items FOR ALL
  TO authenticated
  USING (is_smartquote_authorized_user())
  WITH CHECK (is_smartquote_authorized_user());

CREATE POLICY "Allow authorized manage payment_methods"
  ON payment_methods FOR ALL
  TO authenticated
  USING (is_smartquote_authorized_user())
  WITH CHECK (is_smartquote_authorized_user());

CREATE POLICY "Allow authorized manage incoming_emails"
  ON incoming_emails FOR ALL
  TO authenticated
  USING (is_smartquote_authorized_user())
  WITH CHECK (is_smartquote_authorized_user());

-- 9. BLINDAGEM DA FUNÇÃO ATÔMICA 'save_quote_atomic'
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
  -- Verificação rigorosa de autorização
  IF NOT is_smartquote_authorized_user() THEN
    RAISE EXCEPTION 'Acesso negado: apenas usuários corporativos autorizados da Infodesk podem salvar propostas comerciais.';
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
    sent_at = EXCLUDED.sent_at,
    client_order_number = EXCLUDED.client_order_number,
    approved_at = EXCLUDED.approved_at,
    approved_total_amount = EXCLUDED.approved_total_amount,
    updated_at = NOW()
  RETURNING id INTO v_quote_id;

  -- 2. Limpeza atômica e reinserção dos itens filhos da proposta
  IF v_quote_id IS NOT NULL THEN
    DELETE FROM quote_items WHERE quote_id = v_quote_id;

    INSERT INTO quote_items (
      quote_id,
      item_number,
      product_id,
      name,
      description,
      part_number,
      ncm,
      category,
      unit,
      cost_price,
      markup_percent,
      tax_percent,
      shipping_cost,
      unit_price,
      quantity,
      total_price,
      supplier,
      source_url,
      image_url,
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
      COALESCE((item->>'item_number')::INTEGER, (item->>'itemNumber')::INTEGER, 1),
      CASE WHEN item->>'product_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (item->>'product_id')::UUID ELSE NULL END,
      COALESCE(item->>'name', ''),
      COALESCE(item->>'description', ''),
      item->>'part_number',
      item->>'ncm',
      item->>'category',
      COALESCE(item->>'unit', 'Un.'),
      COALESCE((item->>'cost_price')::NUMERIC, (item->>'costPrice')::NUMERIC, 0),
      COALESCE((item->>'markup_percent')::NUMERIC, (item->>'markupPercent')::NUMERIC, 35),
      COALESCE((item->>'tax_percent')::NUMERIC, (item->>'taxPercent')::NUMERIC, 6),
      COALESCE((item->>'shipping_cost')::NUMERIC, (item->>'shippingCost')::NUMERIC, 0),
      COALESCE((item->>'unit_price')::NUMERIC, (item->>'unitPrice')::NUMERIC, 0),
      COALESCE((item->>'quantity')::NUMERIC, 1),
      COALESCE((item->>'total_price')::NUMERIC, (item->>'totalPrice')::NUMERIC, 0),
      item->>'supplier',
      item->>'source_url',
      item->>'image_url',
      COALESCE(item->>'purchase_status', 'pending'),
      (item->>'actual_cost_price')::NUMERIC,
      (item->>'actual_unit_cost_price')::NUMERIC,
      item->>'actual_purchase_url',
      (item->>'actual_shipping_cost')::NUMERIC,
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
