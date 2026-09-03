-- ==============================================================================
-- INFODESK SMARTQUOTE — SCHEMA SQL COMPLETO PARA SUPABASE
-- Execute este script no SQL Editor do Supabase (Dashboard -> SQL Editor -> New query)
-- ==============================================================================

-- 1. Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABELA: company_settings (Configurações Gerais & Fiscais da Infodesk)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'Lucas Porto da Fonseca-ME',
  trade_name TEXT NOT NULL DEFAULT 'Infodesk — Informática & Tecnologia',
  cnpj TEXT NOT NULL DEFAULT '15.266.716/0001-02',
  state_registration TEXT NOT NULL DEFAULT '07.602.330/001-92',
  address TEXT NOT NULL DEFAULT 'CLSW 304 Bloco A Sala 108 – Sudoeste',
  city_state TEXT NOT NULL DEFAULT 'Brasília – DF',
  phone TEXT NOT NULL DEFAULT '(61) 3033-5373',
  whatsapp TEXT NOT NULL DEFAULT '(61) 9 9627-2630',
  email TEXT NOT NULL DEFAULT 'lucas@infodesk.com.br',
  representative_name TEXT NOT NULL DEFAULT 'Lucas Porto',
  default_validity_days TEXT NOT NULL DEFAULT '03 (três) dias ou enquanto durar o estoque.',
  default_payment_terms TEXT NOT NULL DEFAULT 'Faturado.',
  default_delivery_days TEXT NOT NULL DEFAULT 'em até 10 (dez) dias úteis após autorização de fornecimento.',
  default_warranty_terms TEXT NOT NULL DEFAULT '06 (seis) meses contra eventuais problemas de fabricação. Garantia balcão. Exceto para Monitor/Impressora/Nobreak (garantia 1 ano na rede autorizada).',
  default_opening_text TEXT NOT NULL DEFAULT 'Em atenção ao que foi solicitado por Vossa Senhoria, enviamos proposta para fornecimento dos produtos para informática, conforme especificações e condições a seguir.',
  default_markup_percent NUMERIC(6,2) NOT NULL DEFAULT 35.00,
  default_tax_percent NUMERIC(6,2) NOT NULL DEFAULT 6.00,
  default_shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  google_workspace_connected BOOLEAN NOT NULL DEFAULT true,
  google_account_email TEXT DEFAULT 'lucas@infodesk.com.br',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 3. TABELA: client_companies (Empresas Clientes & Cidades de Destino de Frete)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS client_companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_delivery_location TEXT DEFAULT 'Brasília',
  locations TEXT[] NOT NULL DEFAULT ARRAY['Brasília'],
  last_used TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 4. TABELA: client_contacts (Compradores e Contatos das Empresas)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS client_contacts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT DEFAULT 'Sr.',
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'Comprador',
  location TEXT,
  last_used TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 5. TABELA: products (Catálogo de Produtos com Part Number e NCM)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL,
  part_number TEXT,
  ncm TEXT DEFAULT '84713019',
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'Informática & Tecnologia',
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  unit TEXT NOT NULL DEFAULT 'Un.',
  supplier TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 6. TABELA: quotes (Propostas Comerciais / Orçamentos)
-- ==============================================================================
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
  delivery_location TEXT DEFAULT 'Brasília',
  shipping_terms TEXT,
  opening_text TEXT NOT NULL,
  show_product_images BOOLEAN NOT NULL DEFAULT false,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_shipping NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_taxes NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_profit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  average_margin NUMERIC(6,2) NOT NULL DEFAULT 35.00,
  global_tax_percent NUMERIC(6,2) NOT NULL DEFAULT 6.00,
  global_shipping NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 7. TABELA: quote_items (Itens da Proposta com Imagem Proporcional 4cm)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  item_number INTEGER NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  raw_search_query TEXT,
  part_number TEXT,
  ncm TEXT,
  image_url TEXT,
  show_image BOOLEAN NOT NULL DEFAULT false,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'Un.',
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  tax_percent NUMERIC(6,2) NOT NULL DEFAULT 6.00,
  markup_percent NUMERIC(6,2) NOT NULL DEFAULT 35.00,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  supplier TEXT,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 8. TABELA: incoming_emails (E-mails e Cotações Capturadas)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS incoming_emails (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  sender_name TEXT NOT NULL,
  sender_company TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_phone TEXT,
  subject TEXT NOT NULL,
  date TEXT NOT NULL,
  snippet TEXT,
  body TEXT,
  body_html TEXT,
  delivery_location TEXT,
  unread BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'new',
  suggested_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 9. ÍNDICES DE ALTA PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_client_companies_name ON client_companies(name);
CREATE INDEX IF NOT EXISTS idx_client_contacts_company_id ON client_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_client_contacts_email ON client_contacts(email);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_part_number ON products(part_number);
CREATE INDEX IF NOT EXISTS idx_quotes_code ON quotes(code);
CREATE INDEX IF NOT EXISTS idx_quotes_client_company ON quotes(client_company);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_incoming_emails_status ON incoming_emails(status);

-- ==============================================================================
-- 10. TRIGGER PARA AUTO-ATUALIZAÇÃO DO CAMPO updated_at
-- ==============================================================================
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp_company_settings ON company_settings;
CREATE TRIGGER set_timestamp_company_settings
BEFORE UPDATE ON company_settings
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_client_companies ON client_companies;
CREATE TRIGGER set_timestamp_client_companies
BEFORE UPDATE ON client_companies
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_client_contacts ON client_contacts;
CREATE TRIGGER set_timestamp_client_contacts
BEFORE UPDATE ON client_contacts
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_products ON products;
CREATE TRIGGER set_timestamp_products
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_quotes ON quotes;
CREATE TRIGGER set_timestamp_quotes
BEFORE UPDATE ON quotes
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- ==============================================================================
-- 11. ROW LEVEL SECURITY (RLS) & POLÍTICAS DE ACESSO
-- Permite leitura e escrita pelo frontend web (anon e authenticated)
-- ==============================================================================
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE incoming_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public access to company_settings" ON company_settings;
CREATE POLICY "Allow public access to company_settings" ON company_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to client_companies" ON client_companies;
CREATE POLICY "Allow public access to client_companies" ON client_companies FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to client_contacts" ON client_contacts;
CREATE POLICY "Allow public access to client_contacts" ON client_contacts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to products" ON products;
CREATE POLICY "Allow public access to products" ON products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to quotes" ON quotes;
CREATE POLICY "Allow public access to quotes" ON quotes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to quote_items" ON quote_items;
CREATE POLICY "Allow public access to quote_items" ON quote_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to incoming_emails" ON incoming_emails;
CREATE POLICY "Allow public access to incoming_emails" ON incoming_emails FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 12. DADOS INICIAIS (SEED DATA REALISTA)
-- ==============================================================================

-- 12.1 Dados Fiscais da Infodesk
INSERT INTO company_settings (
  company_name, trade_name, cnpj, state_registration, address, city_state,
  phone, whatsapp, email, representative_name, default_markup_percent, default_tax_percent, default_shipping_cost
) VALUES (
  'Lucas Porto da Fonseca-ME',
  'Infodesk — Informática & Tecnologia',
  '15.266.716/0001-02',
  '07.602.330/001-92',
  'CLSW 304 Bloco A Sala 108 – Sudoeste',
  'Brasília – DF',
  '(61) 3033-5373',
  '(61) 9 9627-2630',
  'lucas@infodesk.com.br',
  'Lucas Porto',
  35.00,
  6.00,
  0.00
) ON CONFLICT DO NOTHING;

-- 12.2 Empresas com Cidades de Destino de Frete
INSERT INTO client_companies (id, name, default_delivery_location, locations) VALUES
('comp-ubec', 'Universidade Brasileira de Educação Católica - UBEC', 'Brasília', ARRAY['Brasília', 'Coronel Fabriciano', 'Joinville', 'Itabira']),
('comp-pauloctavio', 'Casa Shopping Paulo Octávio', 'Brasília', ARRAY['Brasília', 'Taguatinga', 'Águas Claras']),
('comp-cnc', 'CNC — Confederação Nacional do Comércio', 'Brasília', ARRAY['Brasília', 'Rio de Janeiro', 'São Paulo']),
('comp-inframerica', 'Inframerica Concessionária do Aeroporto de Brasília', 'Brasília', ARRAY['Brasília', 'Natal']),
('comp-terraco', 'Condomínio Shopping Terraço', 'Brasília', ARRAY['Brasília'])
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  default_delivery_location = EXCLUDED.default_delivery_location,
  locations = EXCLUDED.locations;

-- 12.3 Compradores Vinculados
INSERT INTO client_contacts (id, company_id, name, title, email, phone, role, location) VALUES
('cont-alex-ubec', 'comp-ubec', 'Alex Pereira da Silva Vasconcellos', 'Sr.', 'alex.vasconcellos@ubec.edu.br', '(61) 3403-2944', 'Comprador', 'Brasília'),
('cont-rafael-ubec', 'comp-ubec', 'Rafael Costa', 'Sr.', 'rafael.costa@ubec.edu.br', '(61) 3403-2900', 'Comprador', 'Coronel Fabriciano'),
('cont-marcelo-pauloctavio', 'comp-pauloctavio', 'Marcelo Mattos', 'Sr.', 'marcelo.mattos@casashoppingpauloctavio.com', '(61) 3218-4000', 'Comprador', 'Brasília'),
('cont-alexandra-cnc', 'comp-cnc', 'Alexandra Oliveira', 'Srta.', 'alexandraoliveira@cnc.org.br', '(61) 3033-0000', 'Compradora', 'Brasília'),
('cont-paulo-infra', 'comp-inframerica', 'Paulo Silva', 'Sr.', 'compras@inframerica.aero', '(61) 3364-9000', 'Comprador Sênior', 'Brasília'),
('cont-mariana-infra', 'comp-inframerica', 'Mariana Duarte', 'Srta.', 'mariana.duarte@inframerica.aero', '(61) 3364-9015', 'Suprimentos & TI', 'Brasília'),
('cont-compras-terraco', 'comp-terraco', 'Equipe de Suprimentos', 'Sr.', 'suprimentos@terraco.com.br', '(61) 3403-2944', 'Comprador', 'Brasília')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  role = EXCLUDED.role,
  location = EXCLUDED.location;

-- 12.4 Produtos Iniciais no Catálogo
INSERT INTO products (sku, part_number, ncm, name, description, category, cost_price, unit, supplier, stock) VALUES
('DEL-MON-27', 'S2722QC', '85285200', 'Monitor Dell 27 4K UHD S2722QC', 'Monitor Dell 27 Polegadas 4K UHD IPS, USB-C 65W, Ajuste de Altura, HDMI, 99% sRGB', 'Monitores', 1850.00, 'Un.', 'Dell Brasil Comercial', 8),
('FUR-CAB-CAT6', '23400108', '85444900', 'Cabo de Rede Furukawa Cat6 Gigalan 100% Cobre', 'Cabo de Rede Furukawa SohoPlus Cat6 U/UTP 4 Pares 23AWG Azul (Caixa 305 metros)', 'Redes & Conectividade', 590.00, 'Cx.', 'Furukawa Electric', 10),
('APC-NOB-1500', 'BR1500M2-BR', '85044040', 'Nobreak Senoidal APC Back-UPS Pro 1500VA', 'Nobreak APC 1500VA / 900W Bivolt Automático, 8 Tomadas, Display LCD, Conexão USB', 'Energia & Nobreaks', 920.00, 'Un.', 'Schneider Electric', 5),
('KNG-SSD-1TB', 'SKC3000S/1024G', '84717040', 'SSD Kingston KC3000 1TB M.2 NVMe', 'SSD Kingston KC3000 PCIe 4.0 NVMe M.2 2280 Leitura 7000MB/s Gravação 6000MB/s', 'Armazenamento', 410.00, 'Un.', 'Kingston Tech BR', 24),
('CIS-SW-24P', 'CBS250-24P-4G', '85176239', 'Switch Cisco Business 24 Portas Gigabit PoE+ CBS250', 'Switch Gerenciável Cisco CBS250-24P-4G 24 Portas Gigabit PoE+ 195W + 4 Portas SFP Gigabit', 'Redes & Conectividade', 2450.00, 'Un.', 'Cisco Distribuição', 3)
ON CONFLICT DO NOTHING;
