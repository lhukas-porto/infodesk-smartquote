-- ==============================================================================
-- INFODESK SMARTQUOTE — MIGRAÇÃO: ADIÇÃO DE FORNECEDOR E RPC ATÔMICA ATUALIZADA
-- Instruções:
-- 1. Abra o painel do Supabase: https://supabase.com/dashboard/project/dxhbjygtbcxpabflsijv
-- 2. Acesse no menu lateral: SQL Editor -> New Query
-- 3. Cole todo o conteúdo deste arquivo e clique em RUN.
-- 100% IDEMPOTENTE: Seguro para rodar múltiplas vezes sem risco de duplicar ou apagar dados.
-- ==============================================================================

-- 1. ADICIONAR COLUNA 'supplier' NA TABELA 'quote_items'
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS supplier TEXT;

-- 2. ADICIONAR COLUNAS COMPLEMENTARES NA TABELA 'quotes' (evita erros em RPC)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS global_markup_percent NUMERIC(6,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS recipient_emails TEXT[];
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS cc_emails TEXT[];
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_order_number TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS approved_total_amount NUMERIC(12,2);

-- 3. ATUALIZAÇÃO DA STORED PROCEDURE ATÔMICA 'save_quote_atomic'
-- Permite que propostas e todos os itens sejam gravados em transação única atômica,
-- suportando tanto orçamentos novos quanto aprovados na Central de Compras.
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
    COALESCE((SELECT array_agg(x::TEXT) FROM jsonb_array_elements_text(p_quote->'recipient_emails') t(x)), ARRAY[]::TEXT[]),
    COALESCE((SELECT array_agg(x::TEXT) FROM jsonb_array_elements_text(p_quote->'cc_emails') t(x)), ARRAY[]::TEXT[]),
    CASE WHEN (p_quote->>'sent_at') IS NOT NULL THEN (p_quote->>'sent_at')::TIMESTAMPTZ ELSE NULL END,
    p_quote->>'client_order_number',
    CASE WHEN (p_quote->>'approved_at') IS NOT NULL THEN (p_quote->>'approved_at')::TIMESTAMPTZ ELSE NULL END,
    CASE WHEN (p_quote->>'approved_total_amount') IS NOT NULL THEN (p_quote->>'approved_total_amount')::NUMERIC ELSE NULL END,
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
    client_order_number = COALESCE(EXCLUDED.client_order_number, quotes.client_order_number),
    approved_at = COALESCE(EXCLUDED.approved_at, quotes.approved_at),
    approved_total_amount = COALESCE(EXCLUDED.approved_total_amount, quotes.approved_total_amount),
    updated_at = NOW()
  RETURNING id INTO v_quote_id;

  -- 2. Deletar itens anteriores da proposta
  DELETE FROM quote_items WHERE quote_id = v_quote_id;

  -- 3. Inserir novos itens com todos os campos comerciais e fornecedor
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
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

-- 4. RECARREGAR O CACHE DE SCHEMA DO POSTGREST IMEDIATAMENTE
NOTIFY pgrst, 'reload schema';
