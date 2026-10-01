-- ==============================================================================
-- INFODESK SMARTQUOTE — POLÍTICAS RLS SEGURAS (FECHAMENTO DE ACESSO PÚBLICO)
-- Execute este script no SQL Editor do Supabase (Dashboard -> SQL Editor -> New query)
-- após criar seu usuário no Supabase Auth (ex: lucas@infodesk.net.br).
-- ==============================================================================

-- 1. Habilitar RLS em todas as tabelas (garantia)
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

-- 2. Remover políticas públicas permissivas anteriores (USING true para anon)
DROP POLICY IF EXISTS "Allow select company_settings" ON company_settings;
DROP POLICY IF EXISTS "Allow update company_settings" ON company_settings;
DROP POLICY IF EXISTS "Allow insert company_settings" ON company_settings;
DROP POLICY IF EXISTS "Allow public access to company_settings" ON company_settings;

DROP POLICY IF EXISTS "Allow select client_companies" ON client_companies;
DROP POLICY IF EXISTS "Allow insert client_companies" ON client_companies;
DROP POLICY IF EXISTS "Allow update client_companies" ON client_companies;
DROP POLICY IF EXISTS "Allow delete client_companies" ON client_companies;
DROP POLICY IF EXISTS "Allow public access to client_companies" ON client_companies;

DROP POLICY IF EXISTS "Allow manage client_contacts" ON client_contacts;
DROP POLICY IF EXISTS "Allow public access to client_contacts" ON client_contacts;

DROP POLICY IF EXISTS "Allow manage products" ON products;
DROP POLICY IF EXISTS "Allow public access to products" ON products;

DROP POLICY IF EXISTS "Allow manage quotes" ON quotes;
DROP POLICY IF EXISTS "Allow public access to quotes" ON quotes;

DROP POLICY IF EXISTS "Allow manage quote_items" ON quote_items;
DROP POLICY IF EXISTS "Allow public access to quote_items" ON quote_items;

DROP POLICY IF EXISTS "Allow manage incoming_emails" ON incoming_emails;
DROP POLICY IF EXISTS "Allow public access to incoming_emails" ON incoming_emails;

DROP POLICY IF EXISTS "Allow manage payment_methods" ON payment_methods;
DROP POLICY IF EXISTS "Allow manage suppliers" ON suppliers;
DROP POLICY IF EXISTS "Allow manage procurement_items" ON procurement_items;
DROP POLICY IF EXISTS "Allow manage product_categories" ON product_categories;
DROP POLICY IF EXISTS "Allow manage measurement_units" ON measurement_units;

-- 3. Criar Políticas Estritas: Apenas usuários autenticados (TO authenticated) possuem acesso
CREATE POLICY "Allow authenticated read company_settings" 
  ON company_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated update company_settings" 
  ON company_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated insert company_settings" 
  ON company_settings FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated manage client_companies" 
  ON client_companies FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated manage client_contacts" 
  ON client_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated manage products" 
  ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated manage quotes" 
  ON quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated manage quote_items" 
  ON quote_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated manage incoming_emails" 
  ON incoming_emails FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated manage payment_methods" 
  ON payment_methods FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated manage suppliers" 
  ON suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated manage procurement_items" 
  ON procurement_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated manage product_categories" 
  ON product_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated manage measurement_units" 
  ON measurement_units FOR ALL TO authenticated USING (true) WITH CHECK (true);
