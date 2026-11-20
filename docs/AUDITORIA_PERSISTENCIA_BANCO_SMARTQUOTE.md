# RELATÓRIO DE AUDITORIA DE PERSISTÊNCIA E INTEGRIDADE DE DADOS
## INFODESK SMARTQUOTE — ANÁLISE ARQUITETURAL SUPABASE / POSTGRESQL

> **Auditor:** Engenheiro de Software Sênior & Especialista em Bancos de Dados / Supabase  
> **Data da Auditoria:** 17 de Setembro de 2026  
> **Ambiente Auditado:** Supabase PostgreSQL (`dxhbjygtbcxpabflsijv.supabase.co`) + Frontend React/TypeScript  
> **Escopo:** Rotinas de gravação, integridade transacional, concorrência, mapeamento de tipos, isolamento e resiliência de dados.  
> **Status de Execução:** Auditoria 100% não-destrutiva (Read-Only). Nenhuma linha de código ou registro de produção foi modificado.

---

## 1. RESUMO EXECUTIVO

A auditoria de persistência do **Infodesk SmartQuote** revelou uma arquitetura **híbrida (Database + LocalStorage)**. O sistema utiliza o Supabase como banco central de sincronização, mas depende criticamente do `localStorage` do navegador para manter o estado de rascunhos, caches de emergência e campos que **não possuem colunas correspondentes no PostgreSQL**.

### Principais Conclusões:
1. **Gravação Funcional nos Fluxos Principais, mas com Fragilidade Transacional:**
   - As entidades `company_settings`, `client_companies`, `client_contacts`, `products`, `quotes` e `quote_items` estão gravando e consultando dados no Supabase.
   - Atualmente, existem no banco de produção **15 cotações**, **69 itens de cotação**, **76 produtos cadastrados**, **9 empresas clientes** e **23 compradores**.
2. **Falta de Atomicidade Real nas Cotações (Risco de Perda de Itens):**
   - A função PostgreSQL transacional `save_quote_atomic` **não existe no cache do banco remoto** (retorna erro `function public.save_quote_atomic does not exist`).
   - Como consequência, o sistema recorre a um fallback não-atômico de 3 etapas: `upsert` na cotação -> `delete` em todos os itens anteriores -> `insert` nos novos itens. Se a conexão falhar entre o `delete` e o `insert`, a cotação é esvaziada no banco.
3. **Falsas Mensagens de Sucesso (Promises Desacopladas):**
   - No `App.tsx`, o salvamento de cotações (`syncQuoteToSupabase`) é disparado **sem `await`**, exibindo o alerta `"Orçamento salvo com sucesso!"` antes mesmo de o banco confirmar a gravação. Se a rede cair ou o PostgREST rejeitar a operação, o usuário recebe confirmação de sucesso falsa.
4. **Campos Ignorados pelo Banco (Mantidos Apenas no Frontend):**
   - O fornecedor dos itens (`supplier`) **não possui coluna na tabela `quote_items`**. O banco armazena o item sem o fornecedor; ao recarregar, o sistema tenta deduzir o fornecedor a partir da URL da loja (`source_url`). Se não houver URL, o fornecedor é perdido no banco.
   - Destinatários secundários e cópias (`recipientEmails`, `ccEmails`) e margem de markup global (`globalMarkupPercent`) **não possuem colunas na tabela `quotes`**.
5. **Isolamento e Segurança (Multi-Tenancy Ausente):**
   - As políticas de Row Level Security (RLS) estão configuradas como `USING (true) WITH CHECK (true)` para a chave pública anônima (`anon`). Não há vínculo com autenticação (`auth.uid()`) nem coluna de `tenant_id` ou `empresa_id`. Qualquer requisição externa com a chave `anon` pode ler, alterar ou excluir dados de qualquer orçamento.

---

## 2. ETAPA 1 — IDENTIFICAÇÃO DA TECNOLOGIA

| Componente | Tecnologia Identificada | Detalhes & Configuração |
| :--- | :--- | :--- |
| **Banco de Dados** | PostgreSQL 15.x via Supabase | Host: `https://dxhbjygtbcxpabflsijv.supabase.co` |
| **Cliente de Acesso** | `@supabase/supabase-js` v2.39.8 | Conexão direta REST via PostgREST |
| **ORM** | Nenhum | Chamadas fluentes nativas `supabase.from('table')` |
| **Autenticação** | Nenhuma no Banco | Todas as requisições usam `VITE_SUPABASE_ANON_KEY` pública |
| **Row Level Security (RLS)** | Habilitado, porém irrestrito | Políticas com `USING (true) WITH CHECK (true)` |
| **Transações / RPC** | Ausentes no banco ativo | RPC `save_quote_atomic` declarada no SQL, mas não instalada |
| **Triggers Ativos** | `trigger_set_timestamp()` | Atualiza `updated_at = NOW()` nas 6 tabelas principais |
| **Storage de Arquivos** | Nenhum bucket configurado | Imagens armazenadas como links externos HTTPS (VTEX, CDN) |
| **Estado Local & Cache** | `localStorage` do navegador | Chaves: `infodesk_settings`, `infodesk_quotes`, `infodesk_products`, etc. |

---

## 3. ETAPA 2 — MAPEAMENTO DE TODAS AS GRAVAÇÕES NO BANCO

| Operação | Arquivo | Função | Tabela Alvo | Ação PostgREST | Origem dos Dados |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Salvar Configurações** | `src/services/supabase.ts` | `syncCompanySettingsToSupabase` | `company_settings` | `UPDATE` / `INSERT` | `SettingsModal.tsx` |
| **Salvar Categorias/Unidades** | `src/services/supabase.ts` | `syncRegisteredMetadataToSupabase` | `company_settings` | `UPDATE` | `SettingsModal.tsx` / `storage.ts` |
| **Criar/Atualizar Cotação** | `src/services/supabase.ts` | `syncQuoteToSupabase` | `quotes` | `UPSERT` (`code`) | `QuoteBuilder.tsx` / `App.tsx` |
| **Substituir Itens Cotação** | `src/services/supabase.ts` | `syncQuoteToSupabase` | `quote_items` | `DELETE` + `INSERT` | `currentQuote.items` |
| **Excluir Cotação** | `src/services/supabase.ts` | `deleteQuoteFromSupabase` | `quotes` | `DELETE` (`code`) | `HistoryModal.tsx` / `App.tsx` |
| **Salvar Produto** | `src/services/supabase.ts` | `syncProductToSupabase` | `products` | `UPSERT` (`sku`) | `CatalogView.tsx` / `PriceScanner` |
| **Lote de Produtos** | `src/services/supabase.ts` | `syncBatchProductsToSupabase` | `products` | `UPSERT` (`sku`) | Importação CSV / Varredura |
| **Excluir Produto** | `src/services/supabase.ts` | `deleteProductFromSupabase` | `products` | `DELETE` (`sku`) | `CatalogView.tsx` |
| **Salvar Empresas Clientes** | `src/services/supabase.ts` | `syncClientCompaniesToSupabase` | `client_companies` | `UPSERT` (`id`) | `QuoteBuilder.tsx` / Clientes |
| **Salvar Compradores** | `src/services/supabase.ts` | `syncClientCompaniesToSupabase` | `client_contacts` | `UPSERT` (`id`) | `comp.contacts` |
| **Limpar Contatos Removidos**| `src/services/supabase.ts` | `syncClientCompaniesToSupabase` | `client_contacts` | `DELETE` | Contatos removidos no formulário |
| **Excluir Empresa** | `src/services/supabase.ts` | `deleteCompanyFromSupabase` | `client_companies` | `DELETE` (`id`) | Gerenciamento de Clientes |
| **Excluir Comprador** | `src/services/supabase.ts` | `deleteContactFromSupabase` | `client_contacts` | `DELETE` (`id`) | Gerenciamento de Clientes |
| **Salvar E-mails Capturados** | `src/services/supabase.ts` | `syncIncomingEmailsToSupabase` | `incoming_emails` | `UPSERT` (`id`) | Leitura de Inbox Gmail |

---

## 4. MATRIZ DE PERSISTÊNCIA REAL (AUDITADA EM PRODUÇÃO)

| Entidade | Inserir no Banco | Consultar | Atualizar | Excluir | Persiste após F5? | Persiste em outro dispositivo? | Resultado Geral |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Configurações Gerais** | ✅ Sim | ✅ Sim | ✅ Sim | ❌ Bloqueado | ✅ Sim | ✅ Sim | **100% Confiável** |
| **Categorias & Unidades** | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim | **100% Confiável** |
| **Empresas Clientes** | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim | **100% Confiável** |
| **Compradores / Contatos** | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim | **100% Confiável** |
| **Catálogo de Produtos** | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim | **100% Confiável (Requer SKU)** |
| **Cotação (Cabeçalho)** | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim | **Confiável (sem campos extras)** |
| **Itens da Cotação** | ⚠️ Parcial | ✅ Sim | ⚠️ Parcial | ✅ Sim | ✅ Sim | ⚠️ Parcial | **Risco Transacional (Não-atômico)** |
| **Fornecedor do Item** | ❌ Não | ⚠️ Deduzido | ❌ Não | — | ⚠️ LocalStorage | ❌ Não | **Não salvo em tabela `quote_items`** |
| **Rascunho Ativo da Tela** | ❌ Não | ❌ Não | ❌ Não | — | ✅ LocalStorage | ❌ Não | **Apenas local até salvar manual** |
| **E-mails de Entrada** | ⚠️ Opcional | ✅ Sim | ⚠️ Opcional | — | ✅ LocalStorage | ⚠️ Opcional | **Tabela vazia no banco (0 rows)** |

---

## 5. MAPEAMENTO DE CAMPOS: INTERFACE vs TYPESCRIPT vs BANCO

### Tabela 1: `quotes` (Cabeçalho da Cotação)
| Campo na Interface | Propriedade TypeScript (`Quote`) | Payload Enviado | Coluna no Banco (`quotes`) | Tipo PostgreSQL | Status de Persistência |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Código da Proposta | `code` | `code` | `code` | `TEXT UNIQUE` | ✅ Persistido |
| Empresa Cliente | `clientCompany` | `client_company` | `client_company` | `TEXT` | ✅ Persistido |
| Contato / Comprador | `contactPerson` | `contact_person` | `contact_person` | `TEXT` | ✅ Persistido |
| E-mail Principal | `clientEmail` | `client_email` | `client_email` | `TEXT` | ✅ Persistido |
| Telefone | `clientPhone` | `client_phone` | `client_phone` | `TEXT` | ✅ Persistido |
| Assunto | `subject` | `subject` | `subject` | `TEXT` | ✅ Persistido |
| Cidade | `city` | `city` | `city` | `TEXT` | ✅ Persistido |
| Data | `date` | `date` | `date` | `TEXT` | ✅ Persistido |
| Validade | `validityDays` | `validity_days` | `validity_days` | `TEXT` | ✅ Persistido |
| Cond. Pagamento | `paymentTerms` | `payment_terms` | `payment_terms` | `TEXT` | ✅ Persistido |
| Prazo de Entrega | `deliveryDays` | `delivery_days` | `delivery_days` | `TEXT` | ✅ Persistido |
| Termos de Garantia | `warrantyTerms` | `warranty_terms` | `warranty_terms` | `TEXT` | ✅ Persistido |
| Local de Entrega | `deliveryLocation` | `delivery_location` | `delivery_location` | `TEXT` | ✅ Persistido |
| Termos de Frete | `shippingTerms` | `shipping_terms` | `shipping_terms` | `TEXT` | ✅ Persistido |
| Texto de Abertura | `openingText` | `opening_text` | `opening_text` | `TEXT` | ✅ Persistido |
| Exibir Fotos | `showProductImages` | `show_product_images` | `show_product_images` | `BOOLEAN` | ✅ Persistido |
| Custo Total | `totalCost` | `total_cost` | `total_cost` | `NUMERIC(10,2)` | ✅ Persistido |
| Frete Total | `totalShipping` | `total_shipping` | `total_shipping` | `NUMERIC(10,2)` | ✅ Persistido |
| Impostos Totais | `totalTaxes` | `total_taxes` | `total_taxes` | `NUMERIC(10,2)` | ✅ Persistido |
| Lucro Total | `totalProfit` | `total_profit` | `total_profit` | `NUMERIC(10,2)` | ✅ Persistido |
| Valor Total da Proposta | `totalAmount` | `total_amount` | `total_amount` | `NUMERIC(10,2)` | ✅ Persistido |
| Margem Média | `averageMargin` | `average_margin` | `average_margin` | `NUMERIC(6,2)` | ✅ Persistido |
| Imposto Global % | `globalTaxPercent` | `global_tax_percent` | `global_tax_percent` | `NUMERIC(6,2)` | ✅ Persistido |
| Frete Global R$ | `globalShipping` | `global_shipping` | `global_shipping` | `NUMERIC(10,2)` | ✅ Persistido |
| Status | `status` | `status` | `status` | `TEXT` | ✅ Persistido |
| E-mails Destinatários | `recipientEmails` | Não enviado | **INEXISTENTE** | — | ❌ **Perdido no Banco** |
| E-mails em Cópia | `ccEmails` | Não enviado | **INEXISTENTE** | — | ❌ **Perdido no Banco** |
| Markup Global % | `globalMarkupPercent`| Não enviado | **INEXISTENTE** | — | ❌ **Perdido no Banco** |

---

### Tabela 2: `quote_items` (Itens da Cotação)
| Campo na Interface | Propriedade TypeScript (`QuoteItem`) | Payload Enviado | Coluna no Banco (`quote_items`) | Tipo PostgreSQL | Status de Persistência |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ID da Cotação | `quoteId` | `quote_id` | `quote_id` | `UUID FK` | ✅ Relacionado |
| Número do Item | `itemNumber` | `item_number` | `item_number` | `INTEGER` | ✅ Persistido |
| ID do Produto | `productId` | `product_id` | `product_id` | `UUID FK NULL` | ✅ Persistido |
| Nome do Produto | `name` | `name` | `name` | `TEXT` | ✅ Persistido |
| Descrição / Ficha | `description` | `description` | `description` | `TEXT` | ✅ Persistido |
| Termo de Pesquisa | `rawSearchQuery` | `raw_search_query` | `raw_search_query` | `TEXT` | ✅ Persistido |
| Part Number | `partNumber` | `part_number` | `part_number` | `TEXT` | ✅ Persistido |
| NCM | `ncm` | `ncm` | `ncm` | `TEXT` | ✅ Persistido |
| Imagem (URL) | `imageUrl` | `image_url` | `image_url` | `TEXT` | ✅ Persistido |
| Exibir Imagem | `showImage` | `show_image` | `show_image` | `BOOLEAN` | ✅ Persistido |
| Quantidade | `quantity` | `quantity` | `quantity` | `INTEGER` | ✅ Persistido |
| Unidade | `unit` | `unit` | `unit` | `TEXT` | ✅ Persistido |
| Preço de Custo | `costPrice` | `cost_price` | `cost_price` | `NUMERIC(10,2)` | ✅ Persistido |
| Frete do Item | `shippingCost` | `shipping_cost` | `shipping_cost` | `NUMERIC(10,2)` | ✅ Persistido |
| Alíquota de Imposto | `taxPercent` | `tax_percent` | `tax_percent` | `NUMERIC(6,2)` | ✅ Persistido |
| Margem de Markup | `markupPercent` | `markup_percent` | `markup_percent` | `NUMERIC(6,2)` | ✅ Persistido |
| Preço Unitário Venda | `unitPrice` | `unit_price` | `unit_price` | `NUMERIC(10,2)` | ✅ Persistido |
| Preço Total Venda | `totalPrice` | `total_price` | `total_price` | `NUMERIC(10,2)` | ✅ Persistido |
| Link do Fornecedor | `sourceUrl` | `source_url` | `source_url` | `TEXT` | ✅ Persistido |
| **Nome do Fornecedor**| `supplier` | Não enviado | **INEXISTENTE** | — | ❌ **Perdido no Banco** |

---

## 6. RELAÇÃO DETALHADA DE PROBLEMAS ENCONTRADOS

| ID | Gravidade | Confiança | Fluxo Afetado | Problema Identificado | Impacto |
| :---: | :---: | :---: | :--- | :--- | :--- |
| **PRB-01** | 🔴 **CRÍTICO** | Confirmado | Cotação e Itens | Ausência de transação atômica (`DELETE` seguido de `INSERT`) | Risco de esvaziamento de itens se houver falha de rede intermediária |
| **PRB-02** | 🔴 **CRÍTICO** | Confirmado | RLS / Segurança | Políticas RLS irrestritas (`USING true`) sem autenticação de usuário | Qualquer cliente com a chave pública anônima pode alterar qualquer dado |
| **PRB-03** | 🟠 **ALTO** | Confirmado | Envio e Histórico | `syncQuoteToSupabase` disparado sem `await` e com `alert()` prematuro | Falsa mensagem de sucesso para o usuário antes da confirmação do banco |
| **PRB-04** | 🟠 **ALTO** | Confirmado | Itens da Cotação | Coluna `supplier` ausente na tabela `quote_items` | Fornecedor não é salvo no banco; depende de dedução frágil pela URL |
| **PRB-05** | 🟡 **MÉDIO** | Confirmado | Cotação | Colunas `recipient_emails`, `cc_emails` e `global_markup_percent` ausentes em `quotes` | Destinatários secundários e markup global persistem apenas no `localStorage` |
| **PRB-06** | 🟡 **MÉDIO** | Confirmado | Catálogo | `syncProductToSupabase` descarta silenciosamente produtos sem SKU | Produto sem código não vai para o banco sem notificação ao usuário |
| **PRB-07** | 🟡 **MÉDIO** | Confirmado | Concorrência | Ausência de bloqueio otimista (`optimistic locking` / versão) | Se dois computadores editarem o mesmo orçamento, o último sobrescreve o primeiro |
| **PRB-08** | 🟢 **BAIXO** | Confirmado | E-mails | Tabela `incoming_emails` está vazia no banco (0 registros) | E-mails capturados do Gmail persistem apenas no navegador local |

---

### FICHA TÉCNICA DOS PROBLEMAS

#### [PRB-01] Falha de Atomicidade no Salvamento de Cotações e Itens
- **Arquivo:** `src/services/supabase.ts` (Linhas 315–428)
- **Tabela Envolvida:** `quotes` e `quote_items`
- **Causa:** A chamada `await supabase.rpc('save_quote_atomic', ...)` falha porque a procedure SQL não foi compilada no Supabase. O código cai no bloco `catch` e executa:
  1. `await supabase.from('quotes').upsert(...)`
  2. `await supabase.from('quote_items').delete().eq('quote_id', savedQuote.id)`
  3. `await supabase.from('quote_items').insert(itemsPayload)`
- **Como Reproduzir:** Desconectar a rede (ou forçar um erro de timeout) imediatamente após o passo 2. O orçamento no banco fica sem nenhum item.
- **Resultado Atual:** O cabeçalho existe, mas os itens são apagados permanentemente no banco.
- **Resultado Esperado:** Operação executada dentro de uma transação SQL (`BEGIN ... COMMIT ... ROLLBACK`). Se os itens falharem, o `delete` sofre rollback imediato.
- **Correção Recomendada:** Executar o script SQL da função `save_quote_atomic` no Supabase SQL Editor e validar retorno obrigatório de erro antes de prosseguir.

---

#### [PRB-02] Row Level Security (RLS) Permissivo sem Isolamento de Tenant
- **Arquivo:** `supabase/schema.sql` (Linhas 256–304)
- **Tabelas Envolvidas:** Todas (`company_settings`, `client_companies`, `client_contacts`, `products`, `quotes`, `quote_items`)
- **Causa:** As policies do Supabase utilizam `USING (true) WITH CHECK (true)` para `public` e `anon`.
- **Como Reproduzir:** Executar um `curl` ou PostgREST request usando a `VITE_SUPABASE_ANON_KEY` contida no bundle do frontend com `DELETE FROM quotes`. O banco executará sem pedir credencial.
- **Resultado Atual:** Acesso administrativo total concedido a qualquer portador da chave anônima.
- **Resultado Esperado:** Policies atreladas a `auth.uid()` com coluna `user_id` ou chave de autorização de backend.

---

#### [PRB-03] Chamada Assíncrona Desacoplada e Falso Alerta de Sucesso
- **Arquivo:** `src/App.tsx` (Linhas 873–874 e 985–987)
- **Função:** `handleSaveQuote` e `handleSaveQuoteAndGoToHistory`
- **Causa:** `syncQuoteToSupabase(currentQuote)` é executado sem `await`, seguido imediatamente de `alert('Orçamento salvo com sucesso!')`.
- **Como Reproduzir:** Desativar a conexão com a internet ou bloquear a URL do Supabase no DevTools e clicar em "Salvar Orçamento".
- **Resultado Atual:** O pop-up diz que o orçamento foi salvo com sucesso, mas a requisição HTTP nem sequer foi concluída (e falhará silenciosamente no console).
- **Resultado Esperado:** O botão deve entrar em estado de carregamento (`isSaving`), aguardar a resolução da Promise com `await`, verificar o retorno e só exibir sucesso se o banco responder HTTP 200/201.

---

#### [PRB-04] Campo Fornecedor (`supplier`) Ausente na Tabela `quote_items`
- **Arquivo:** `src/services/supabase.ts` (Linhas 399–420) e `supabase/schema.sql` (Linha 125)
- **Tabela Envolvida:** `quote_items`
- **Causa:** O modelo `QuoteItem` possui o campo `supplier?: string;`. No entanto, a tabela `quote_items` no PostgreSQL não possui a coluna `supplier`. O payload gerado na linha 399 não inclui o campo.
- **Como Reproduzir:** Criar uma cotação com um item que possui Fornecedor manual (ex: "Distribuidora ABC"). Salvar no banco. Abrir a aplicação em uma aba anônima (limpando o `localStorage`). O item volta sem o fornecedor original.
- **Resultado Atual:** O fornecedor só é mantido se houver uma URL identificável de loja no `source_url`.
- **Resultado Esperado:** Coluna `supplier TEXT` adicionada à tabela `quote_items` e persistida fielmente.

---

#### [PRB-05] Colunas de E-mails Secundários e Markup Global Ausentes em `quotes`
- **Arquivo:** `src/services/supabase.ts` (Linha 361) e `supabase/schema.sql` (Linha 95)
- **Tabela Envolvida:** `quotes`
- **Causa:** Os campos `recipientEmails`, `ccEmails` e `globalMarkupPercent` existem no TypeScript, mas a tabela `quotes` não possui as colunas `recipient_emails TEXT[]`, `cc_emails TEXT[]` e `global_markup_percent NUMERIC(6,2)`.
- **Impacto:** Se o orçamento for reaberto em outro computador, os e-mails adicionais de envio configurados para aquele cliente não são recuperados do banco de dados.

---

## 7. ETAPA 10 — AUDITORIA DE TIPOS E VALORES CRÍTICOS

### 1. Moeda e Preços (Dinheiro):
- **No Banco:** Armazenado como `NUMERIC(10,2)` (correto, tipo decimal de precisão fixa, sem imprecisão binária de ponto flutuante).
- **No Frontend:** Manipulado como `number` em ponto flutuante JavaScript, arredondado por regras monetárias (`Math.round`, `toFixed(2)`). Os testes da `PricingEngine` validaram 100% de conformidade até a 2ª casa decimal.

### 2. Quantidades:
- **No Banco:** `INTEGER` na tabela `quote_items`.
- **Ponto de Atenção:** Itens fracionados (como metros, quilos ou litros decimais, ex: `1.5 kg` ou `2.5 m`) não são suportados como número fracionado na coluna `quantity` (que aceita apenas inteiros). Se o usuário cotar `1.5 m`, haverá truncamento ou erro no PostgreSQL.

### 3. Códigos Fiscais (NCM / Part Number):
- **No Banco:** Armazenados como `TEXT`. Preservam zeros à esquerda (ex: NCM `84181000` ou `08011100`) sem risco de conversão para número.

### 4. Datas e Fusos Horários:
- **No Banco:** Colunas `created_at` e `updated_at` utilizam `TIMESTAMPTZ` (com fuso horário UTC).
- **No Frontend:** As datas comerciais da proposta (`date`) são formatadas como string descritiva em português (ex: `"17 de setembro de 2026"`), evitando problemas de deslocamento de dia no fuso de Brasília.

---

## 8. CONCLUSÃO OBRIGATÓRIA (RESPOSTAS DIRETAS)

1. **Os dados estão sendo gravados corretamente?**  
   **Sim, para os fluxos primários**, mas com **gravação parcial** de alguns atributos secundários e **sem proteção transacional completa** em falhas de rede.

2. **Quais fluxos estão totalmente confiáveis?**  
   - Configurações da Empresa (`company_settings`)
   - Categorias & Unidades Registradas
   - Cadastro e Atualização de Empresas Clientes (`client_companies`)
   - Cadastro e Atualização de Compradores (`client_contacts`)
   - Catálogo de Produtos com SKU preenchido (`products`)

3. **Quais fluxos possuem risco?**  
   - Salvamento e Atualização de Cotações com Itens (risco de esvaziamento por falta de transação atômica).
   - Inserção de produtos sem SKU (são ignorados silenciosamente).

4. **Existem dados que ficam apenas no frontend?**  
   **Sim.** O rascunho em tempo real de digitação, o Fornecedor (`supplier`) dos itens da cotação, os e-mails adicionais de envio (`recipientEmails`/`ccEmails`) e o Markup Global ficam restritos ao `localStorage`.

5. **Existem salvamentos parciais?**  
   **Sim.** Na cotação, o cabeçalho é salvo com todos os campos financeiros, mas atributos específicos dos itens (como fornecedor de origem) não são salvos na tabela de itens.

6. **Existem riscos de duplicidade?**  
   **Baixo para cotações e produtos**, pois utilizam constraint `UNIQUE` em `code` e `sku`. **Médio para compradores**, pois a geração de ID depende de timestamp local (`cont-${Date.now()}`).

7. **Existem riscos de sobrescrita?**  
   **Sim.** Não há controle de concorrência ou bloqueio otimista (`optimistic locking`). Se dois usuários abrirem a mesma proposta e salvarem, a gravação mais recente sobrescreve a anterior sem aviso.

8. **Existem problemas de relacionamento?**  
   **Não.** Os relacionamentos `quote_items.quote_id -> quotes.id` e `client_contacts.company_id -> client_companies.id` estão consistentes e as chaves estrangeiras funcionam adequadamente.

9. **Existe isolamento correto entre empresas?**  
   **Não.** O sistema atualmente opera em modo **Single-Tenant compartilhado**. O RLS está aberto para qualquer requisição com a chave pública anônima.

10. **O sistema pode apresentar sucesso sem ter salvado?**  
    **Sim.** No botão "Salvar Orçamento", a mensagem de sucesso é exibida antes da resposta do Supabase, permitindo falsa sensação de salvamento se a conexão falhar.

---

> 🛑 **AUDITORIA CONCLUÍDA.** Conforme a regra mandatória, nenhuma alteração de código ou banco foi realizada. Aguardando sua autorização para definir o plano de correção técnica.
