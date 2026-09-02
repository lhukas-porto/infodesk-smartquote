-- ==============================================================================
-- INFODESK SMARTQUOTE — SUPABASE DATABASE SCHEMA
-- ==============================================================================

-- 1. Company Settings (Configurações Gerais & Fiscais da Infodesk)
CREATE TABLE IF NOT EXISTS company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'Lucas Porto da Fonseca-ME',
  trade_name TEXT NOT NULL DEFAULT 'Infodesk',
  cnpj TEXT NOT NULL DEFAULT '15.266.716/0001-02',
  state_registration TEXT NOT NULL DEFAULT '07.602.330/001-92',
  address TEXT NOT NULL DEFAULT 'SCS QD 02 BL C NRO 22 SALA 304 EDIF RIACHUELO',
  city_state TEXT NOT NULL DEFAULT 'Brasília - DF',
  phone TEXT NOT NULL DEFAULT '(61) 3033-5373',
  whatsapp TEXT NOT NULL DEFAULT '(61) 9 9627-2630',
  email TEXT NOT NULL DEFAULT 'lucas@infodesk.com.br',
  representative_name TEXT NOT NULL DEFAULT 'Lucas Porto da Fonseca',
  default_validity_days TEXT NOT NULL DEFAULT '05 (cinco) dias',
  default_payment_terms TEXT NOT NULL DEFAULT '30 dias',
  default_delivery_days TEXT NOT NULL DEFAULT 'em até 10 (dez) dias úteis após autorização de fornecimento.',
  default_warranty_terms TEXT NOT NULL DEFAULT '12 (doze) meses balcão para defeitos de fabricação.',
  default_opening_text TEXT NOT NULL DEFAULT 'Em atenção à solicitação de Vossa Senhoria, temos a grata satisfação de submeter à apreciação a nossa proposta de preços para fornecimento dos produtos relacionados a seguir:',
  default_markup_percent NUMERIC NOT NULL DEFAULT 35,
  default_tax_percent NUMERIC NOT NULL DEFAULT 6,
  default_shipping_cost NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Products Catalog (Catálogo de Produtos com Part Number e NCM)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL,
  part_number TEXT,
  ncm TEXT DEFAULT '84713019',
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'Informática & Tecnologia',
  cost_price NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'Un.',
  supplier TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Quotes (Orçamentos Comerciais)
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  client_company TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_phone TEXT,
  subject TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Brasília',
  date TEXT NOT NULL,
  validity_days TEXT NOT NULL,
  payment_terms TEXT NOT NULL,
  delivery_days TEXT NOT NULL,
  warranty_terms TEXT NOT NULL,
  delivery_location TEXT,
  shipping_terms TEXT,
  opening_text TEXT NOT NULL,
  show_product_images BOOLEAN NOT NULL DEFAULT true,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  total_shipping NUMERIC NOT NULL DEFAULT 0,
  total_taxes NUMERIC NOT NULL DEFAULT 0,
  total_profit NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  average_margin NUMERIC NOT NULL DEFAULT 35,
  global_tax_percent NUMERIC NOT NULL DEFAULT 6,
  global_shipping NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Quote Items (Itens do Orçamento)
CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  item_number INTEGER NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  raw_search_query TEXT,
  part_number TEXT,
  ncm TEXT,
  image_url TEXT,
  show_image BOOLEAN DEFAULT true,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'Un.',
  cost_price NUMERIC NOT NULL DEFAULT 0,
  shipping_cost NUMERIC DEFAULT 0,
  tax_percent NUMERIC DEFAULT 6,
  markup_percent NUMERIC NOT NULL DEFAULT 35,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Incoming Emails (Histórico de E-mails e Cotações Capturadas)
CREATE TABLE IF NOT EXISTS incoming_emails (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  sender_name TEXT NOT NULL,
  sender_company TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  date TEXT NOT NULL,
  snippet TEXT,
  body TEXT,
  delivery_location TEXT,
  unread BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'new',
  suggested_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE incoming_emails ENABLE ROW LEVEL SECURITY;

-- Public read/write policies for Infodesk authenticated/anon workspace
CREATE POLICY "Allow public access to company_settings" ON company_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to quotes" ON quotes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to quote_items" ON quote_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to incoming_emails" ON incoming_emails FOR ALL USING (true) WITH CHECK (true);

-- Insert Initial Company Settings Default Row
INSERT INTO company_settings (
  company_name, trade_name, cnpj, state_registration, address, city_state,
  phone, whatsapp, email, representative_name, default_tax_percent, default_markup_percent
) VALUES (
  'Lucas Porto da Fonseca-ME', 'Infodesk', '15.266.716/0001-02', '07.602.330/001-92',
  'SCS QD 02 BL C NRO 22 SALA 304 EDIF RIACHUELO', 'Brasília - DF',
  '(61) 3033-5373', '(61) 9 9627-2630', 'lucas@infodesk.com.br', 'Lucas Porto da Fonseca',
  6.0, 35.0
) ON CONFLICT DO NOTHING;
