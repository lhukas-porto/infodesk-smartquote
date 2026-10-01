-- ==============================================================================
-- INFODESK SMARTQUOTE — RESTAURAÇÃO DE LEITURA PÚBLICA (DESBLOQUEIO IMEDIATO)
-- Execute este script no SQL Editor do Supabase para restabelecer a entrega
-- imediata de orçamentos, produtos e configurações para a aplicação.
-- ==============================================================================

-- 1. Políticas de Leitura Pública (SELECT) para permitir download dos dados
CREATE POLICY "Allow public select quotes" 
  ON public.quotes FOR SELECT TO public USING (true);

CREATE POLICY "Allow public select quote_items" 
  ON public.quote_items FOR SELECT TO public USING (true);

CREATE POLICY "Allow public select company_settings" 
  ON public.company_settings FOR SELECT TO public USING (true);

CREATE POLICY "Allow public select products" 
  ON public.products FOR SELECT TO public USING (true);

CREATE POLICY "Allow public select client_companies" 
  ON public.client_companies FOR SELECT TO public USING (true);

CREATE POLICY "Allow public select client_contacts" 
  ON public.client_contacts FOR SELECT TO public USING (true);

CREATE POLICY "Allow public select incoming_emails" 
  ON public.incoming_emails FOR SELECT TO public USING (true);

CREATE POLICY "Allow public select payment_methods" 
  ON public.payment_methods FOR SELECT TO public USING (true);

CREATE POLICY "Allow public select product_categories" 
  ON public.product_categories FOR SELECT TO public USING (true);

CREATE POLICY "Allow public select measurement_units" 
  ON public.measurement_units FOR SELECT TO public USING (true);

CREATE POLICY "Allow public select suppliers" 
  ON public.suppliers FOR SELECT TO public USING (true);

CREATE POLICY "Allow public select procurement_items" 
  ON public.procurement_items FOR SELECT TO public USING (true);
