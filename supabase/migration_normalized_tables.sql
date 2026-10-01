-- ==============================================================================
-- INFODESK SMARTQUOTE — MIGRAÇÃO DE NORMALIZAÇÃO DE TABELAS SUPABASE
-- Execute este script no SQL Editor do Supabase (Dashboard -> SQL Editor -> New query)
-- ==============================================================================

-- 1. TABELA: payment_methods (Formas de Pagamento e Cartões)
CREATE TABLE IF NOT EXISTS payment_methods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT DEFAULT 'credit_card',
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TABELA: suppliers (Distribuidores e Fornecedores Oficiais)
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  trade_name TEXT,
  cnpj TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  website TEXT,
  payment_terms_default TEXT DEFAULT 'Faturado 28D',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABELA: procurement_items (Central de Compras, Compras Avulsas e Registro Real)
CREATE TABLE IF NOT EXISTS procurement_items (
  id TEXT PRIMARY KEY,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  quote_code TEXT NOT NULL DEFAULT 'COMPRA DIRETA',
  client_company TEXT NOT NULL DEFAULT 'Infodesk (Uso Interno / Estoque)',
  contact_person TEXT,
  item_id TEXT,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  part_number TEXT,
  ncm TEXT,
  image_url TEXT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'un',
  quoted_cost_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  quoted_unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  quoted_total_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  supplier TEXT,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  source_url TEXT,
  purchase_status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'purchased' | 'delivered'
  tax_percent NUMERIC(6,2) NOT NULL DEFAULT 9.05,
  is_direct_purchase BOOLEAN NOT NULL DEFAULT true,
  actual_cost_price NUMERIC(12,2),
  actual_unit_cost_price NUMERIC(12,2),
  actual_purchase_url TEXT,
  actual_shipping_cost NUMERIC(10,2) DEFAULT 0.00,
  payment_method TEXT,
  payment_method_id TEXT REFERENCES payment_methods(id) ON DELETE SET NULL,
  purchased_at TEXT,
  purchase_notes TEXT,
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TABELA: product_categories (Macro-Departamentos Oficiais da Infodesk)
CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_official BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. TABELA: measurement_units (Unidades de Medida Padronizadas)
CREATE TABLE IF NOT EXISTS measurement_units (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  symbol TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 6. ÍNDICES DE ALTA PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_procurement_purchase_status ON procurement_items(purchase_status);
CREATE INDEX IF NOT EXISTS idx_procurement_is_direct ON procurement_items(is_direct_purchase);
CREATE INDEX IF NOT EXISTS idx_procurement_quote_id ON procurement_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_procurement_product_id ON procurement_items(product_id);
CREATE INDEX IF NOT EXISTS idx_procurement_purchased_at ON procurement_items(purchased_at);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_payment_methods_name ON payment_methods(name);

-- ==============================================================================
-- 7. TRIGGERS DE UPDATED_AT
-- ==============================================================================
DROP TRIGGER IF EXISTS set_timestamp_payment_methods ON payment_methods;
CREATE TRIGGER set_timestamp_payment_methods
BEFORE UPDATE ON payment_methods
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_suppliers ON suppliers;
CREATE TRIGGER set_timestamp_suppliers
BEFORE UPDATE ON suppliers
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_procurement_items ON procurement_items;
CREATE TRIGGER set_timestamp_procurement_items
BEFORE UPDATE ON procurement_items
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_product_categories ON product_categories;
CREATE TRIGGER set_timestamp_product_categories
BEFORE UPDATE ON product_categories
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_measurement_units ON measurement_units;
CREATE TRIGGER set_timestamp_measurement_units
BEFORE UPDATE ON measurement_units
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (RLS) & POLÍTICAS DE ACESSO
-- ==============================================================================
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurement_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow manage payment_methods" ON payment_methods;
CREATE POLICY "Allow manage payment_methods" ON payment_methods FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow manage suppliers" ON suppliers;
CREATE POLICY "Allow manage suppliers" ON suppliers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow manage procurement_items" ON procurement_items;
CREATE POLICY "Allow manage procurement_items" ON procurement_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow manage product_categories" ON product_categories;
CREATE POLICY "Allow manage product_categories" ON product_categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow manage measurement_units" ON measurement_units;
CREATE POLICY "Allow manage measurement_units" ON measurement_units FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 9. DADOS INICIAIS (SEED DATA)
-- ==============================================================================

-- 9.1 Formas de Pagamento Oficiais
INSERT INTO payment_methods (id, name, type, display_order) VALUES
  ('pm-pix', 'PIX', 'pix', 1),
  ('pm-c6', 'Cartão C6', 'credit_card', 2),
  ('pm-amazon', 'Cartão Amazon', 'credit_card', 3),
  ('pm-nubank', 'Cartão Nubank', 'credit_card', 4),
  ('pm-itau', 'Cartão Itaú', 'credit_card', 5),
  ('pm-boleto', 'Boleto Bancário', 'bank_slip', 6),
  ('pm-fat28', 'Faturado 28D', 'invoice', 7)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type;

-- 9.2 Distribuidores e Fornecedores Estruturados
INSERT INTO suppliers (id, name, trade_name, website, payment_terms_default) VALUES
  ('sup-kabum', 'Kabum Comércio Eletrônico S/A', 'Kabum!', 'https://www.kabum.com.br', 'Cartão / PIX à vista'),
  ('sup-amazon', 'Amazon Serviços de Varejo do Brasil Ltda', 'Amazon Brasil', 'https://www.amazon.com.br', 'Cartão Amazon'),
  ('sup-dell', 'Dell Computadores do Brasil Ltda', 'Dell Brasil', 'https://www.dell.com/pt-br', 'Faturado 30D'),
  ('sup-furukawa', 'Furukawa Electric LatAm S/A', 'Furukawa Electric', 'https://www.furukawalatam.com', 'Faturado Distribuidor'),
  ('sup-roxtell', 'Roxtell Distribuidora de Informática', 'Distribuidora Roxtell', 'https://www.roxtell.com.br', 'Faturado 28D'),
  ('sup-allnations', 'All Nations Comércio de Eletrônicos S/A', 'All Nations Distribuidora', 'https://www.allnations.com.br', 'Faturado 28D'),
  ('sup-schneider', 'Schneider Electric Brasil Ltda', 'APC / Schneider', 'https://www.se.com/br', 'Faturado'),
  ('sup-kingston', 'Kingston Technology do Brasil', 'Kingston Brasil', 'https://www.kingston.com/br', 'Distribuidor Oficial')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, trade_name = EXCLUDED.trade_name;

-- 9.3 15 Categorias / Macro-Departamentos Oficiais (Regra do Lucas)
INSERT INTO product_categories (id, name, is_official, display_order) VALUES
  ('cat-1', 'Informática, Hardware & Periféricos', true, 1),
  ('cat-2', 'Redes, Conectividade & Telefonia', true, 2),
  ('cat-3', 'Áudio, Vídeo & Apresentação', true, 3),
  ('cat-4', 'Monitores, Displays & TVs', true, 4),
  ('cat-5', 'Energia, Nobreaks & Baterias', true, 5),
  ('cat-6', 'Impressão & Automação Comercial', true, 6),
  ('cat-7', 'Papelaria, Artes & Material de Escritório', true, 7),
  ('cat-8', 'Elétrica & Iluminação Tática', true, 8),
  ('cat-9', 'Construção, Acabamento & Marcenaria', true, 9),
  ('cat-10', 'Ferramentas & Instrumentos de Medição', true, 10),
  ('cat-11', 'Equipamentos & Insumos Industriais', true, 11),
  ('cat-12', 'Eletrodomésticos, Refrigeração & Copa', true, 12),
  ('cat-13', 'Limpeza, Higiene & Descartáveis', true, 13),
  ('cat-14', 'Pet Shop & Veterinária', true, 14),
  ('cat-15', 'Diversos & Sazonais', true, 15)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_official = EXCLUDED.is_official;

-- 9.4 Unidades de Medida Padrão
INSERT INTO measurement_units (id, name, symbol, display_order) VALUES
  ('unit-un', 'Unidade', 'un', 1),
  ('unit-cx', 'Caixa', 'cx', 2),
  ('unit-pc', 'Peça', 'pç', 3),
  ('unit-pct', 'Pacote', 'pct', 4),
  ('unit-mt', 'Metro', 'm', 5),
  ('unit-rl', 'Rolo', 'rl', 6),
  ('unit-par', 'Par', 'par', 7),
  ('unit-kit', 'Kit', 'kit', 8),
  ('unit-kg', 'Quilograma', 'kg', 9)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, symbol = EXCLUDED.symbol;
