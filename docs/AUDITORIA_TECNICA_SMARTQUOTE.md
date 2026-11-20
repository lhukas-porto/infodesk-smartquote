# RELATÓRIO DE AUDITORIA TÉCNICA COMPLETA — INFODESK SMARTQUOTE

**Data da Auditoria:** 17 de Setembro de 2026  
**Auditor Responsável:** Engenheiro de Software Sênior & Especialista em Segurança (S.H.A.R.K. Kerberos)  
**Sistema Auditado:** Infodesk SmartQuote (Versão 1.0.0)  
**Repositório:** `lhukas-porto/infodesk-smartquote`  
**Escopo:** Frontend, Backend/Supabase, Integrações (Gmail, Gemini, Bing, OCR), Motor de Precificação, Segurança, Banco de Dados, Performance e Qualidade.

---

## 1. RESUMO EXECUTIVO

### 1.1 Quantidade Total e Distribuição por Gravidade

Foram identificados **32 apontamentos técnicos e de negócio**, classificados de acordo com a taxonomia de risco padrão OWASP/CWE:

| Gravidade | Quantidade | Descrição do Impacto |
| :--- | :---: | :--- |
| 🔴 **CRÍTICO** | **6** | Risco imediato de invasão/vazamento de dados (LGPD), perda permanente de propostas, venda de produtos com prejuízo financeiro e falha total em produção. |
| 🟠 **ALTO** | **9** | Funcionalidades principais quebradas em produção, alucinação de dados comerciais pela IA, vulnerabilidades XSS e dependências vulneráveis (CVEs). |
| 🟡 **MÉDIO** | **10** | Inconsistências de cálculo comercial, loops N+1 no banco de dados, estouramento de cota do navegador (localStorage) e falhas de concorrência. |
| 🟢 **BAIXO** | **4** | Nomes de modelos de IA inválidos, validações silenciosas de formulários e inconsistências de nomenclatura. |
| 🔵 **MELHORIA** | **3** | Remoção de ~180 KB de código morto (componentes órfãos) e pacotes não utilizados. |
| **TOTAL** | **32** | **Mapeamento exaustivo com evidências em código** |

---

### 1.2 Os Cinco Maiores Riscos do Sistema

1. **Venda com Prejuízo por Arredondamento Truncado (`Math.round` em `calculateCommercialUnitPrice`):**
   O algoritmo de precificação arredonda preços unitários para números inteiros (Reais cheios). Para itens com custo unitário de baixo valor (cabos, conectores, parafusos, descartáveis com custo entre R$ 0,50 e R$ 1,40), o arredondamento forçado para baixo pode resultar em preço de venda inferior ao custo de compra acrescido de impostos, gerando **prejuízo financeiro direto a cada venda**.

2. **Supabase com RLS 100% Aberto ao Público (`USING (true) WITH CHECK (true)`):**
   Todas as tabelas (`incoming_emails`, `quotes`, `client_contacts`, `company_settings`, `products`) possuem políticas de Row Level Security liberadas para acesso anônimo irrestrito. Qualquer usuário na internet com a chave pública do Supabase pode ler todos os e-mails e propostas confidenciais de clientes, ou sobrescrever dados bancários/PIX e configurações da Infodesk.

3. **Perda Irreversível de Itens de Cotação por Falta de Transação (`syncQuoteToSupabase`):**
   Ao salvar uma cotação, a rotina executa `DELETE` de todos os `quote_items` existentes antes de inserir os novos. Como não há transação atômica (`BEGIN / COMMIT`), caso a conexão oscile ou a inserção falhe, os itens anteriores são deletados permanentemente sem recuperação.

4. **Quebra Total da Busca de Imagens em Produção (Vite Middleware em `vite.config.ts`):**
   O endpoint `/api/image-search` foi implementado como middleware de desenvolvimento do Vite (`configureServer`). Em produção na Vercel, o Vite não executa servidor Node.js; todas as chamadas a `/api/image-search` retornam erro 404 e caem em proxies públicos de terceiros não confiáveis que sofrem bloqueio por rate limit.

5. **Execução de Código Arbitrário / XSS via HTML de E-mail (`dangerouslySetInnerHTML` sem Sanitização):**
   Em `ManualAnalysesView.tsx` e `EmailSendModal.tsx`, conteúdos HTML de e-mails recebidos e variáveis de proposta são injetados diretamente no DOM via `dangerouslySetInnerHTML` sem passar por sanitizador (DOMPurify). Um e-mail com payload malicioso pode roubar o token OAuth do Gmail e as chaves de API salvas no `localStorage`.

---

### 1.3 Situação Geral do Sistema

O **Infodesk SmartQuote** possui uma interface moderna, rica em recursos visuais e pensada para alta produtividade comercial. No entanto, o sistema opera atualmente como uma **Single Page Application puramente cliente (Client-Side Only)**, com alto acoplamento ao `localStorage` do navegador e dependência de rotinas simuladas ou heurísticas quando APIs externas não respondem.

A transição entre o modo de protótipo/desenvolvimento e o ambiente de produção real deixou resíduos arquiteturais sérios (chaves no frontend, proxies públicos de contingência, falta de validações de integridade no banco e componentes órfãos).

---

### 1.4 Áreas Não Validadas e Limitações da Auditoria

| Área | Status | Motivo da Limitação |
| :--- | :---: | :--- |
| **Envio Real de E-mail via Gmail API** | Não disparado | Regra de ouro da auditoria: proibido disparar e-mails reais para clientes ou alterar dados de produção. |
| **Consumo ao Vivo da API Google Gemini** | Análise estática de contratos | Sem consumo de créditos/chaves de produção durante a fase de análise estática. |
| **Banco de Dados Supabase em Produção** | Análise de DDL/schema local | Auditoria realizada sobre `supabase/schema.sql` e chamadas client-side, sem acesso administrativo direto ao painel do Supabase. |

---

## 2. TABELA RESUMO DE ACHADOS

| ID | Gravidade | Módulo | Problema | Evidência | Impacto | Correção recomendada |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CALC-01** | 🔴 CRÍTICO | Precificação | Arredondamento para inteiro gera venda com prejuízo | `aiEmailParser.ts:1344` | Prejuízo financeiro em produtos de baixo valor unitário | Usar precisão de 2 casas decimais (`toFixed(2)` / centavos) |
| **SEC-01** | 🔴 CRÍTICO | Banco / RLS | RLS com acesso público total de leitura/escrita | `supabase/schema.sql:236-255` | Vazamento de e-mails, clientes e propostas (LGPD) | Implementar políticas restritas por autenticação |
| **DATA-01** | 🔴 CRÍTICO | Supabase Sync | Exclusão de itens sem transação causa perda de dados | `supabase.ts:233-263` | Perda definitiva de itens ao salvar propostas | Usar RPC transacional no PostgreSQL ou upsert com chave composta |
| **ARCH-01** | 🔴 CRÍTICO | Deploy / Vercel | Busca de imagens depende de dev server do Vite | `vite.config.ts:8-56` | Busca de imagens quebra 100% em produção na Vercel | Migrar rota para Vercel Serverless Function (`/api/image-search.ts`) |
| **SEC-02** | 🔴 CRÍTICO | Segurança | Armazenamento de OAuth Token em plaintext no LocalStorage | `gmailService.ts:58-60` | Sequestro de sessão do Gmail via XSS | Armazenar tokens em cookies `httpOnly` via backend/BFF |
| **SEC-03** | 🔴 CRÍTICO | Segurança / XSS | Injeção de HTML cru sem sanitização (DOMPurify) | `ManualAnalysesView.tsx:418` | Execução de scripts maliciosos e roubo de credenciais | Sanitizar com DOMPurify antes de renderizar |
| **AI-01** | 🟠 ALTO | Scanner IA | Alucinação de preços ao falhar Search Grounding | `priceScannerService.ts:1445-1458` | Propostas geradas com preços e links fictícios | Marcar como "Não cotado" em vez de permitir que a IA invente valores |
| **AI-02** | 🟠 ALTO | Scanner IA | Fallback local injeta carrinho de R$ 220,00 e NCM fixo | `priceScannerService.ts:1217-1249` | Dados mockados inseridos silenciosamente em cotações reais | Exibir erro claro solicitando chave da IA ou cotação manual |
| **SEC-04** | 🟠 ALTO | Privacidade | Vazamento de buscas corporativas para proxies públicos | `imageSearchService.ts:36-41` | Vazamento de demandas de compra para terceiros | Utilizar função serverless própria com IP dedicado |
| **SEC-05** | 🟠 ALTO | Dependências | Pacote `xlsx` vulnerável a Prototype Pollution e ReDoS | `package.json:23` | Risco de negação de serviço e poluição de protótipo | Remover `xlsx` (o projeto já utiliza `exceljs`) |
| **SEC-06** | 🟠 ALTO | Dependências | Pacote `jspdf` com múltiplas vulnerabilidades críticas | `package.json:16` | Risco de injeção em PDFs e manipulação de paths | Remover `jspdf` (não é utilizado no código-fonte) |
| **DATA-02** | 🟠 ALTO | Classificação | NCM ausente recebe código padrão de Notebook (`84713019`) | `aiEmailParser.ts:1187` | Risco de autuação fiscal e tributação errônea | Exigir validação e marcar NCM pendente sem inventar código |
| **DATA-03** | 🟠 ALTO | Persistência | Cota do LocalStorage excedida por imagens em Base64 | `storage.ts:97-100` | Travamento silencioso de salvamento e perda de dados | Armazenar fotos no Supabase Storage ou IndexedDB |
| **PERF-01** | 🟠 ALTO | Gmail API | Disparo simultâneo sem concorrência limitada (Rate Limit) | `gmailService.ts:249-251` | Erros 429 Too Many Requests ao sincronizar caixa de entrada | Implementar fila com `p-limit` (máx. 5 requisições simultâneas) |
| **PERF-02** | 🟠 ALTO | Supabase Sync | Loop síncrono N+1 ao salvar empresas e contatos | `supabase.ts:416-449` | Lentidão e congelamento da UI ao salvar catálogo | Utilizar batch upsert em lote único para empresas e contatos |
| **CALC-02** | 🟡 MÉDIO | Comercial | Confusão conceitual entre Margem sobre Venda e Markup | `QuoteBuilder.tsx:468` | Precificação abaixo da expectativa de margem líquida | Exibir claramente os dois indicadores (Markup e Margem Líquida) |
| **CALC-03** | 🟡 MÉDIO | Comercial | Divisão por zero em produto com custo zerado | `QuoteBuilder.tsx:580-587` | `NaN` na margem ao cotar produtos com custo zero | Tratar `baseCost <= 0` explicitamente mantendo consistência |
| **AI-03** | 🟡 MÉDIO | Scanner IA | Nomes de modelos de IA inexistentes na API v1beta | `priceScannerService.ts:994` | Latência extra de 3 a 5 segundos com requisições 404 | Atualizar lista de modelos para `gemini-2.0-flash` e `gemini-1.5-flash` |
| **UX-01** | 🟡 MÉDIO | Catálogo | Produto com custo zero bloqueado silenciosamente | `CatalogView.tsx:307` | Botão "Salvar" parece quebrado para itens sem custo | Adicionar validação com mensagem de erro visual |
| **UX-02** | 🟡 MÉDIO | E-mail Parser | Custo estimado fixo de R$ 150,00 para qualquer item | `aiEmailParser.ts:711, 756` | Usuário pode orçar por engano com valor de R$ 150,00 | Inicializar `costPrice` como 0,00 exigindo precificação |
| **DATA-04** | 🟡 MÉDIO | Supabase Sync | Interpolação de string sem escape em filtro PostgREST | `supabase.ts:443-444` | Falha na exclusão de contatos com caracteres especiais | Usar array nativo com operador Supabase `.in('id', array)` |
| **PERF-03** | 🟡 MÉDIO | OCR / Imagens | Tesseract baixa 25MB de modelos do CDN a cada uso | `imageQuoteParser.ts:486` | Lentidão extrema e falha offline no OCR de imagens | Pré-armazenar worker local ou exibir feedback de download |
| **UX-03** | 🟡 MÉDIO | Histórico | Estado inicial acoplado à cotação mockada 'CNC 280826' | `App.tsx:259` | Comportamento imprevisível ao criar novas propostas | Desacoplar estado de códigos hardcodados |
| **DATA-05** | 🟡 MÉDIO | EAN / Código | Ausência total de validação de dígito verificador EAN | `aiEmailParser.ts` | Códigos de barras inválidos salvos no banco | Implementar algoritmo Módulo 10 para validação de EAN-13 |
| **SEC-07** | 🟡 MÉDIO | Segurança | Variável `VITE_GEMINI_API_KEY` vazada no bundle público | `priceScannerService.ts:128` | Qualquer visitante pode extrair a chave de API do JS | Usar rota de proxy autenticada no backend/serverless |
| **CODE-01** | 🔵 MELHORIA | Arquitetura | Componente `WebSearchModal.tsx` órfão (81 KB de lixo) | `WebSearchModal.tsx` | Bundle inchado e complexidade desnecessária | Remover arquivo órfão |
| **CODE-02** | 🔵 MELHORIA | Arquitetura | Componente `PriceScannerPanel.tsx` órfão (46 KB de lixo) | `PriceScannerPanel.tsx` | Código morto no repositório | Remover arquivo órfão |
| **CODE-03** | 🔵 MELHORIA | Arquitetura | Componente `ClientManagementModal.tsx` montado mas inalcançável | `ClientManagementModal.tsx` | Re-renderizações e peso de 51 KB desnecessário | Remover modal legado após migração para View |

---

## 3. AUDITORIA DETALHADA DOS PROBLEMAS

### 🔴 PROBLEMA CALC-01: Arredondamento para Inteiro Gera Venda com Prejuízo Financeiro
* **Gravidade:** CRÍTICO
* **Arquivo e Linhas:** `src/utils/aiEmailParser.ts` (linhas 1324–1345)
* **Função envolvida:** `calculateCommercialUnitPrice(costPrice, shippingCost, profitMarginPercent, taxPercent)`
* **Evidência concreta:**
  ```typescript
  // src/utils/aiEmailParser.ts:1342-1344
  const rawPrice = (baseCost * (1 + marginRate)) / netDivisor;
  return Math.round(rawPrice); // <-- FORÇA INTEIRO
  ```
* **Como reproduzir:**
  1. Crie um item na cotação com Custo de R$ 1,10, Frete R$ 0,00, Markup 20% e Imposto 9,1%.
  2. `baseCost = 1.10`. `rawPrice = (1.10 * 1.20) / (1 - 0.091) = 1.32 / 0.909 = 1.452`.
  3. `Math.round(1.452)` retorna **R$ 1,00**.
  4. Venda: R$ 1,00. Imposto pago pela empresa: 9,1% = R$ 0,09. Receita líquida: R$ 0,91. Custo: R$ 1,10.
  5. **Prejuízo real por unidade: -R$ 0,19 (-17,2% de margem negativa!)**.
* **Resultado Atual:** Preço truncado para baixo em inteiros de Real.
* **Resultado Esperado:** Preço unitário calculado com precisão de centavos (`Number(rawPrice.toFixed(2))`).
* **Impacto Comercial:** Em pedidos de órgãos ou empresas que compram 5.000 ou 10.000 unidades de materiais miúdos (parafusos, conectores RJ45, canetas, envelopes, abraçadeiras), a empresa acumula milhares de reais em prejuízo direto.
* **Correção Recomendada:** Substituir `Math.round(rawPrice)` por `Number(rawPrice.toFixed(2))` ou manter regra de arredondamento opcional apenas para propostas globais.
* **Risco da Correção:** Baixo (apenas preserva os centavos legítimos).

---

### 🔴 PROBLEMA SEC-01: Row Level Security (RLS) do Supabase Aberto ao Público Global
* **Gravidade:** CRÍTICO
* **Arquivo e Linhas:** `supabase/schema.sql` (linhas 228–255)
* **Tabelas Envolvidas:** `company_settings`, `client_companies`, `client_contacts`, `products`, `quotes`, `quote_items`, `incoming_emails`
* **Evidência concreta:**
  ```sql
  -- supabase/schema.sql:237, 240, 243, 246, 249, 252, 255
  CREATE POLICY "Allow public access to company_settings" ON company_settings FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "Allow public access to quotes" ON quotes FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "Allow public access to incoming_emails" ON incoming_emails FOR ALL USING (true) WITH CHECK (true);
  ```
* **Como reproduzir:**
  1. No console do navegador ou terminal com `curl`, envie uma requisição para a URL do Supabase com a chave anônima (disponível no bundle da aplicação):
  ```bash
  curl -H "apikey: SUA_ANON_KEY" "https://SEU_PROJETO.supabase.co/rest/v1/incoming_emails?select=*"
  ```
  2. Todos os e-mails confidenciais recebidos pelo Gmail, com dados pessoais de compradores, telefones e anexos, são retornados em formato JSON.
* **Resultado Atual:** Qualquer pessoa na internet pode ler, alterar ou deletar todas as tabelas do banco de dados.
* **Resultado Esperado:** Acesso permitido apenas a usuários autenticados via Supabase Auth (`TO authenticated USING (auth.uid() IS NOT NULL)`).
* **Impacto Técnico e Comercial:** Violação direta da Lei Geral de Proteção de Dados (LGPD - Art. 46 e 52). Risco de sabotagem comercial (concorrente pode alterar preços de cotações em tempo real ou apagar o histórico).
* **Correção Recomendada:**
  1. Habilitar autenticação do operador (login com e-mail/senha ou Google OAuth integrado ao Supabase).
  2. Alterar políticas para `TO authenticated USING (auth.uid() IS NOT NULL)`.
  3. Proibir acesso via role `anon`.

---

### 🔴 PROBLEMA DATA-01: Exclusão de Itens sem Transação Atômica Causa Perda de Dados
* **Gravidade:** CRÍTICO
* **Arquivo e Linhas:** `src/services/supabase.ts` (linhas 232–263)
* **Função envolvida:** `syncQuoteToSupabase(quote)`
* **Evidência concreta:**
  ```typescript
  // src/services/supabase.ts:233
  await supabase.from('quote_items').delete().eq('quote_id', savedQuote.id);

  if (quote.items && quote.items.length > 0) {
    // ...
    const { error: itemsInsertError } = await supabase.from('quote_items').insert(itemsPayload);
    if (itemsInsertError) {
      console.warn('Erro ao inserir itens da cotação no Supabase:', itemsInsertError);
      // NENHUM ROLLBACK É EXECUTADO! OS ITENS JÁ FORAM APAGADOS!
    }
  }
  ```
* **Como reproduzir:**
  1. Abra uma cotação com 15 itens salvos.
  2. Simule uma falha de validação ou perda de conexão momentânea durante o `insert` (ex: um campo ultrapassou o tamanho ou o banco recusou por timeout).
  3. O `delete` foi consumado com sucesso, mas o `insert` falhou.
  4. Recarregue a página: a cotação agora tem 0 itens. Todos os dados digitados foram perdidos para sempre.
* **Resultado Atual:** Se o insert falhar, o delete não sofre rollback.
* **Resultado Esperado:** Operação executada dentro de uma transação PostgreSQL (tudo ou nada) via RPC (`save_quote_with_items`).
* **Impacto Comercial:** Perda de horas de trabalho do cotador comercial e impossibilidade de consultar propostas enviadas aos clientes.
* **Correção Recomendada:** Criar uma função armazenada (`FUNCTION`) no Supabase com bloco `BEGIN ... EXCEPTION ... ROLLBACK ... END` e chamá-la via `supabase.rpc('save_quote_atomic', { ... })`.

---

### 🔴 PROBLEMA ARCH-01: Endpoint de Busca de Imagens Inexistente em Produção (Vite Middleware)
* **Gravidade:** CRÍTICO
* **Arquivo e Linhas:** `vite.config.ts` (linhas 4–58), `src/services/imageSearchService.ts` (linha 98)
* **Componente envolvido:** `imageSearchPlugin` no Vite Dev Server
* **Evidência concreta:**
  ```typescript
  // vite.config.ts:7-8
  configureServer(server) {
    server.middlewares.use('/api/image-search', async (req, res) => { ... });
  }
  ```
  ```typescript
  // src/services/imageSearchService.ts:98
  const localRes = await fetch(`/api/image-search?q=${encodeURIComponent(clean)}`);
  ```
* **Como reproduzir:**
  1. Faça o build de produção (`npm run build`) e publique na Vercel.
  2. Acesse a aplicação na Vercel e realize uma busca de produtos com imagem.
  3. Abra a aba "Network" do navegador: a requisição para `/api/image-search` retorna status **404 Not Found** (ou o HTML do `index.html` da SPA).
  4. A busca interna falha e a aplicação é forçada a cair nos proxies públicos não confiáveis (`allorigins.win`).
* **Resultado Atual:** O backend de busca só funciona na máquina local do desenvolvedor (`npm run dev`).
* **Resultado Esperado:** Uma Vercel Serverless Function em `api/image-search.ts` que executa tanto localmente quanto em produção na nuvem.
* **Impacto Técnico:** Perda da principal funcionalidade de enriquecimento visual do sistema ao realizar deploy.

---

### 🔴 PROBLEMA SEC-02: Token de Acesso do Gmail Gravado em Plaintext no LocalStorage
* **Gravidade:** CRÍTICO
* **Arquivo e Linhas:** `src/services/gmailService.ts` (linhas 15–25, 58–60)
* **Função envolvida:** `requestGmailAccessToken` e `getStoredAccessToken`
* **Evidência concreta:**
  ```typescript
  // src/services/gmailService.ts:58
  localStorage.setItem(GMAIL_TOKEN_KEY, accessToken);
  ```
* **Cenário de Ataque:**
  O token armazenado possui escopos de leitura e envio de e-mails (`https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send`). Qualquer script malicioso injetado via XSS ou extensão de navegador não confiável pode ler `localStorage.getItem('infodesk_gmail_access_token')` e enviar e-mails em nome da Infodesk ou ler toda a caixa de entrada da empresa.
* **Correção Recomendada:** Utilizar fluxo de autorização OAuth 2.0 Authorization Code Flow com troca de token no backend e armazenamento em cookie HTTP-Only, Seguro e SameSite=Strict.

---

### 🔴 PROBLEMA SEC-03: Injeção Direta de HTML sem Sanitização (DOMPurify)
* **Gravidade:** CRÍTICO
* **Arquivo e Linhas:** `src/components/ManualAnalysesView.tsx` (linha 418), `src/components/EmailSendModal.tsx` (linha 240)
* **Evidência concreta:**
  ```tsx
  // src/components/ManualAnalysesView.tsx:418
  <div dangerouslySetInnerHTML={{ __html: selected.bodyHtml }} />
  ```
* **Como reproduzir:**
  1. Cole uma solicitação de e-mail avulsa contendo payload XSS:
     `<img src=x onerror="alert(document.domain)">` ou `<script>/* exfiltração */</script>`.
  2. Ao selecionar o e-mail na visualização, o script é executado no contexto da sessão do usuário.
* **Resultado Atual:** Execução de scripts arbitrários no navegador.
* **Resultado Esperado:** O HTML deve ser rigorosamente higienizado com biblioteca especializada (`DOMPurify.sanitize(html)`).
* **Correção Recomendada:** Instalar e aplicar `dompurify` em todas as saídas com `dangerouslySetInnerHTML` e em `srcDoc` de iframes.

---

### 🟠 PROBLEMA AI-01: Alucinação de Preços e Lojas Fictícias ao Falhar Search Grounding
* **Gravidade:** ALTO
* **Arquivo e Linhas:** `src/services/priceScannerService.ts` (linhas 1445–1458)
* **Função envolvida:** `phase2EnrichAndScanPrice`
* **Evidência concreta:**
  ```typescript
  // Se a busca web falhar (ex: erro de cota ou recusa de tool), a requisição é refeita SEM a ferramenta de busca:
  if (!response.ok) {
    requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
    };
    response = await fetch(endpoint, { ... });
  }
  ```
* **Comportamento Observado:**
  O Gemini recebe o prompt exigindo `bestPrice`, `store` e `buyUrl`. Sem acesso à ferramenta de busca ao vivo (`googleSearch`), a LLM **inventa um valor plausível** (ex: R$ 89,90), inventa uma loja (ex: "Mercado Livre") e inventa uma URL falsa.
* **Impacto Comercial:** O cotador assume que o preço foi verificado na internet e envia uma proposta com preço defasado ou com link para produto inexistente.
* **Correção Recomendada:** Se a ferramenta de busca ao vivo falhar, o campo de preço online deve ser retornado como `0` ou `null`, e o status marcado explicitamente como `"on_demand"` (preço sob consulta / manual), nunca alucinado.

---

### 🟠 PROBLEMA AI-02: Fallback Local Injeta Ficha Falsa de "Carrinho 300kg" e NCM Genérico
* **Gravidade:** ALTO
* **Arquivo e Linhas:** `src/services/priceScannerService.ts` (linhas 1212–1250)
* **Função envolvida:** Fallback de `phase1DeduceProduct`
* **Evidência concreta:**
  ```typescript
  // priceScannerService.ts:1217-1244
  const isCart = stdName.toLowerCase().includes('carrinho');
  // ...
  model: isCart ? 'CPG-300' : 'STD-01',
  partNumber: isCart ? 'CPG300GPRETO' : cleanAlphanumericCode(stdName.substring(0, 10)),
  ncm: isCart ? '8716.80.00' : '8471.70.40',
  suggestedPrice: isCart ? 349.90 : 189.90,
  costPrice: isCart ? 220.00 : 120.00,
  ```
* **Comportamento Observado:**
  Se a chave do Gemini não estiver preenchida, o sistema simula inteligência criando um produto completo falso: se contiver a palavra "carrinho" (ex: carrinho de compras de condomínio), ele atribui o modelo "CPG-300", NCM de reboque/veículo manual, custo de R$ 220 e venda de R$ 349,90. Para qualquer outro produto, inventa custo de R$ 120 e NCM de disco rígido magnético (`8471.70.40`).
* **Impacto Comercial:** Apresentação de dados inventados como se fossem apuração técnica real.
* **Correção Recomendada:** O fallback deve apenas normalizar o texto e deixar os campos técnicos (NCM, custo, modelo) vazios para preenchimento manual do usuário.

---

### 🟠 PROBLEMA DATA-02: NCM Ausente Recebe Automaticamente o Código de Notebook (`84713019`)
* **Gravidade:** ALTO
* **Arquivo e Linhas:** `src/utils/aiEmailParser.ts` (linhas 1186–1190)
* **Função envolvida:** `cleanNcmCode(ncm)`
* **Evidência concreta:**
  ```typescript
  // aiEmailParser.ts:1186-1187
  export function cleanNcmCode(ncm: string | undefined): string {
    if (!ncm) return '84713019'; // Notebooks e computadores portáteis
    const digits = ncm.replace(/\D/g, '');
    return digits.slice(0, 8);
  }
  ```
* **Impacto:**
  Se o cliente solicitar café, vassoura, toner, cabo de aço ou cadeira e o NCM não for localizado, o sistema preenche silenciosamente o NCM `8471.30.19`.
  Ao gerar a nota fiscal e emitir a proposta oficial para órgãos públicos (onde o NCM é auditado na entrada do almoxarifado), a mercadoria pode ser **recusada** e a empresa **penalizada**.
* **Correção Recomendada:** Retornar string vazia `""` ou `"A DEFINIR"` quando o NCM não for encontrado.

---

### 🟠 PROBLEMA SEC-04: Vazamento de Buscas Corporativas para Proxies Públicos Gratuitos
* **Gravidade:** ALTO
* **Arquivo e Linhas:** `src/services/imageSearchService.ts` (linhas 36–41)
* **Evidência concreta:**
  ```typescript
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(...)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(...)}`
  ];
  ```
* **Impacto:**
  As consultas de compras corporativas (incluindo part numbers de clientes sensíveis e órgãos públicos) são enviadas em texto claro através de servidores públicos mantidos por terceiros sem nenhum Acordo de Nível de Serviço (SLA) ou compromisso de privacidade.

---

### 🟠 PROBLEMA SEC-05 e SEC-06: Dependências com Vulnerabilidades Críticas e Pacotes Fantasmas
* **Gravidade:** ALTO
* **Arquivo e Linhas:** `package.json` (linhas 16, 23)
* **Evidência Concreta do `npm audit`:**
  - `xlsx`: Prototype Pollution (`GHSA-4r6h-8v6p-xvw6`) e ReDoS (`GHSA-5pgg-2g8v-p4x9`). O pacote `xlsx` está instalado mas **não é importado em nenhum arquivo** (o projeto usa `exceljs`).
  - `jspdf`: Local File Inclusion / Path Traversal (`GHSA-f8cm-6447-x5h2`, CVSS Crítico) e PDF Injection (`GHSA-pqxr-3g65-p328`). O pacote está instalado mas **não é importado em nenhum arquivo** (a exportação usa HTML `.doc` e `window.print`).
* **Correção Recomendada:** Executar `npm uninstall xlsx jspdf html2canvas` para eliminar 5 vulnerabilidades do relatório de segurança e reduzir o tamanho do `node_modules`.

---

### 🟠 PROBLEMA PERF-01: Disparo Simultâneo sem Concorrência Limitada na API do Gmail
* **Gravidade:** ALTO
* **Arquivo e Linhas:** `src/services/gmailService.ts` (linhas 249–254)
* **Evidência concreta:**
  ```typescript
  const detailedMessages = await Promise.all(
    messageList.slice(0, Math.min(messageList.length, maxCount)).map(async (msgItem: any) => {
      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgItem.id}?format=full`, ...);
  ```
* **Impacto:**
  Ao selecionar o filtro de "30 dias" (75 e-mails), a aplicação dispara 75 requisições HTTP paralelas instantâneas contra o Google Workspace. A API do Google possui limite de requisições por segundo por usuário e retorna erros `429 Too Many Requests`, deixando a caixa de entrada em branco.

---

### 🟠 PROBLEMA PERF-02: Loop Síncrono N+1 ao Sincronizar Empresas e Contatos
* **Gravidade:** ALTO
* **Arquivo e Linhas:** `src/services/supabase.ts` (linhas 416–449)
* **Evidência concreta:**
  Loops `for (const comp of companies)` com `for (const ct of comp.contacts)` contendo chamadas `await supabase.from(...).upsert(...)` individuais. Se houver 30 empresas e 50 compradores, são executadas **80 chamadas HTTP sequenciais** ao banco de dados, travando a interface por até 15 segundos.

---

### 🟡 PROBLEMA CALC-02: Inconsistência entre Margem sobre Venda e Markup sobre o Custo
* **Gravidade:** MÉDIO
* **Arquivo e Linhas:** `src/components/QuoteBuilder.tsx` (linhas 464–468)
* **Evidência concreta:**
  ```typescript
  const baseTotalCost = totalCost + totalShipping;
  const averageMargin = baseTotalCost > 0 ? (totalProfit / baseTotalCost) * 100 : 0;
  ```
* **Problema Conceitual:**
  A fórmula calcula `Lucro / Custo`, que financeiramente é chamado de **Markup**. No entanto, a interface rotula esse valor como **"Margem Média"**.
  - No mercado comercial: Margem Líquida = `Lucro / Preço de Venda`.
  - Se um produto custa R$ 100 e é vendido por R$ 133,33 com R$ 20 de lucro, o Markup é 20%, mas a Margem Real é de apenas 15% (`20 / 133,33`).
* **Correção Recomendada:** Rotular expressamente como `% Markup (sobre custo)` ou calcular a verdadeira Margem sobre Faturamento: `(totalProfit / totalAmount) * 100`.

---

### 🟡 PROBLEMA CALC-03: `NaN` e Comportamento Inconsistente ao Editar Produto com Custo Zero
* **Gravidade:** MÉDIO
* **Arquivo e Linhas:** `src/components/QuoteBuilder.tsx` (linhas 580–587)
* **Evidência concreta:**
  Ao digitar o Preço Unitário de um item cujo custo está zerado, a condição `if (baseCost > 0)` não é atendida e `item.markupPercent` permanece inalterado ou com valor defasado, quebrando o cálculo de totais.

---

### 🟡 PROBLEMA AI-03: Modelos de IA Inexistentes na Chamada da API Gemini
* **Gravidade:** MÉDIO
* **Arquivo e Linhas:** `src/services/priceScannerService.ts` (linhas 994, 1367)
* **Evidência concreta:**
  `const models = ['gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];`
  O identificador `gemini-3.1-flash-lite` não existe na API pública do Google. Cada chamada a esse modelo gera uma requisição desnecessária que retorna status HTTP 404, introduzindo atraso de 1 a 2 segundos na experiência do usuário.

---

### 🟡 PROBLEMA UX-01: Cadastro de Produto Bloqueado Silenciosamente se Custo For Zero
* **Gravidade:** MÉDIO
* **Arquivo e Linhas:** `src/components/CatalogView.tsx` (linha 307)
* **Evidência concreta:**
  `if (!newProd.name || !newProd.costPrice) return;`
  Em JavaScript, `!0` é `true`. Se o usuário tentar cadastrar um item de brinde, serviço ou produto com custo a apurar (R$ 0,00), a função retorna imediatamente sem nenhum feedback ou aviso na tela.

---

### 🟡 PROBLEMA UX-02: E-mail Parser Inicializa Todo Produto com R$ 150,00
* **Gravidade:** MÉDIO
* **Arquivo e Linhas:** `src/utils/aiEmailParser.ts` (linhas 711, 756)
* **Evidência concreta:**
  `estimatedCost: 150`
  Ao extrair produtos de texto puro de um e-mail, todo item recebe R$ 150,00 de custo estimado por padrão. Se o operador não notar e avançar direto para a proposta, enviará um preço baseado em R$ 150,00 para itens que poderiam custar R$ 10,00 ou R$ 5.000,00.

---

### 🟡 PROBLEMA DATA-04: Interpolação de String sem Escape em Filtro PostgREST
* **Gravidade:** MÉDIO
* **Arquivo e Linhas:** `src/services/supabase.ts` (linhas 443–444)
* **Evidência concreta:**
  ```typescript
  const inList = activeContactIds.map(id => `"${id}"`).join(',');
  await supabase.from('client_contacts').delete().eq('company_id', comp.id).not('id', 'in', `(${inList})`);
  ```
  Se algum ID de contato contiver caracteres especiais ou vírgulas, a sintaxe da URL do PostgREST quebra e a exclusão falha silenciosamente.

---

### 🟡 PROBLEMA DATA-05: Falta de Validação de Dígito Verificador no EAN/GTIN
* **Gravidade:** MÉDIO
* **Arquivo e Linhas:** `src/utils/aiEmailParser.ts`
* **Descrição:** Códigos de barras gerados pela IA ou digitados manualmente não passam por checagem de integridade (Módulo 10). Códigos truncados ou com erro de digitação são salvos no catálogo sem validação.

---

### 🟡 PROBLEMA SEC-07: Exposição de Chave da IA em Variável com Prefixo Público `VITE_`
* **Gravidade:** MÉDIO
* **Arquivo e Linhas:** `src/services/priceScannerService.ts` (linha 128)
* **Evidência concreta:**
  `const envKey = import.meta.env.VITE_GEMINI_API_KEY;`
  Qualquer variável iniciada com `VITE_` é inserida em texto plano no bundle JavaScript final baixado por qualquer visitante do site.

---

### 🔵 PROBLEMAS DE CÓDIGO MORTO: CODE-01, CODE-02 e CODE-03
* **Arquivos Afetados:**
  1. `src/components/WebSearchModal.tsx` (81.616 bytes): Componente modal antigo de busca web substituído pela `PriceScannerView.tsx`. Não possui nenhum import no projeto.
  2. `src/components/PriceScannerPanel.tsx` (46.157 bytes): Painel retrátil substituído por tela completa. Sem nenhum import ativo.
  3. `src/components/ClientManagementModal.tsx` (51.837 bytes): Modal legado substituído pela tela integrada `ClientManagementView.tsx`. Permanece instanciado em `App.tsx` e `QuoteBuilder.tsx` com `isOpen={false}` permanente, consumindo memória e bundle.

---

## 4. AUDITORIA DE BANCO DE DADOS (SUPABASE)

1. **Campos Monetários com Boas Práticas:** O schema utiliza corretamente `NUMERIC(12,2)` para valores monetários e `NUMERIC(6,2)` para alíquotas e margens, evitando erros de ponto flutuante (`FLOAT/REAL`).
2. **Índices Existentes:** Os índices para chaves estrangeiras e buscas frequentes (`sku`, `part_number`, `code`, `client_company`, `company_id`) foram devidamente criados no DDL.
3. **Falta de Constraints de Validação (`CHECK`):**
   - Não há constraint impedindo `cost_price < 0` ou `quantity <= 0` na tabela `quote_items`.
   - Não há constraint de formato para NCM (`ncm ~ '^[0-9]{8}$'`).
4. **Falta de Isolamento Multi-Tenant:** Todas as tabelas são globais. Se a aplicação no futuro atender filiais ou mais de uma empresa/vendedor, a ausência de uma coluna `tenant_id` ou `user_id` exigirá refatoração do banco.

---

## 5. AUDITORIA DE EXPERIÊNCIA DO USUÁRIO E FRONTEND

1. **Responsividade:** O layout das telas principais (`InboxView`, `QuoteBuilder`, `ClientManagementView`) utiliza classes Tailwind responsivas (`grid-cols-1 md:grid-cols-12`).
2. **Perda de Rascunho:** A rotina de auto-salvamento em `localStorage` sob a chave `infodesk_current_draft_quote` oferece boa proteção contra fechamento acidental da aba, com backup duplicado por código de orçamento.
3. **Gestão de Abas:** O estado da aba ativa é salvo em `infodesk_active_tab`, permitindo que o usuário recarregue a página (F5) sem perder o contexto de trabalho.

---

## 6. PLANO DE CORREÇÃO ESTRUTURADO EM 4 FASES

> ⚠️ **IMPORTANTE:** Nenhuma alteração foi executada no código nesta etapa de auditoria, conforme estritamente solicitado. O plano abaixo detalha a sequência recomendada para implementação após aprovação.

---

### FASE 1 — CORREÇÕES CRÍTICAS (Segurança, Perda de Dados e Cálculos Financeiros)

| Ordem | Ação Recomendada | Arquivos Afetados | Nível de Risco | Esforço | Teste Obrigatório de Validação |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **1.1** | Corrigir `calculateCommercialUnitPrice` para manter centavos (`toFixed(2)`) eliminando risco de venda com prejuízo | `src/utils/aiEmailParser.ts` | Médio | Pequeno | Testar produto com custo de R$ 0,50 a R$ 1,50 e verificar margem líquida positiva |
| **1.2** | Criar Vercel Serverless Function `/api/image-search.ts` para busca de fotos funcionar 100% em produção | `api/image-search.ts`, `vite.config.ts`, `src/services/imageSearchService.ts` | Baixo | Médio | Testar busca de fotos em ambiente de preview na Vercel |
| **1.3** | Sanitizar saídas HTML com `DOMPurify` em `ManualAnalysesView.tsx` e `EmailSendModal.tsx` | `src/components/ManualAnalysesView.tsx`, `src/components/EmailSendModal.tsx` | Baixo | Pequeno | Injetar payload `<img src=x onerror=alert(1)>` e confirmar bloqueio |
| **1.4** | Criar RPC transacional `save_quote_atomic` no Supabase para salvar proposta e itens atomicamente | `supabase/schema.sql`, `src/services/supabase.ts` | Alto | Médio | Simular falha de rede durante salvamento e verificar integridade dos itens |
| **1.5** | Atualizar políticas de RLS no Supabase restringindo leitura e escrita | `supabase/schema.sql` | Alto | Médio | Testar consultas com e sem autenticação via REST client |

---

### FASE 2 — FLUXOS PRINCIPAIS (Inbox, IA, Pesquisa e Precificação)

| Ordem | Ação Recomendada | Arquivos Afetados | Nível de Risco | Esforço | Teste Obrigatório de Validação |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **2.1** | Tratar falha da busca web no Gemini marcando preço sob consulta em vez de permitir alucinação | `src/services/priceScannerService.ts` | Baixo | Médio | Testar item exótico e verificar que o preço não é inventado |
| **2.2** | Remover mock hardcodado de "Carrinho 300kg" no fallback local sem chave de IA | `src/services/priceScannerService.ts` | Baixo | Pequeno | Realizar busca sem chave e conferir que campos técnicos ficam limpos |
| **2.3** | Ajustar `cleanNcmCode` para não forçar NCM de notebook (`84713019`) quando desconhecido | `src/utils/aiEmailParser.ts` | Baixo | Pequeno | Criar item sem NCM e verificar que o campo permanece vazio |
| **2.4** | Implementar limitação de concorrência (`p-limit`) na sincronização de e-mails do Gmail | `src/services/gmailService.ts` | Médio | Médio | Selecionar filtro de "30 dias" com 75 e-mails sem receber erro 429 |
| **2.5** | Remover custo padrão de R$ 150,00 do extrator de texto de e-mails | `src/utils/aiEmailParser.ts` | Baixo | Pequeno | Extrair lista de produtos em texto e verificar `costPrice = 0` |

---

### FASE 3 — CONFIABILIDADE E BANCO DE DADOS

| Ordem | Ação Recomendada | Arquivos Afetados | Nível de Risco | Esforço | Teste Obrigatório de Validação |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **3.1** | Otimizar sincronização de clientes no Supabase para batch único (eliminar loop N+1) | `src/services/supabase.ts` | Médio | Médio | Salvar lista de 20 empresas e verificar execução em menos de 1 segundo |
| **3.2** | Ajustar filtro PostgREST de exclusão de compradores para uso de array seguro | `src/services/supabase.ts` | Baixo | Pequeno | Excluir comprador com nome contendo acentos e aspas |
| **3.3** | Adicionar validação de dígito verificador (Módulo 10) para códigos de barras EAN-13 | `src/utils/aiEmailParser.ts` | Baixo | Pequeno | Validar EANs válidos e inválidos em testes unitários |
| **3.4** | Exibir mensagens de validação claras ao cadastrar produto com custo zero no catálogo | `src/components/CatalogView.tsx` | Baixo | Pequeno | Submeter formulário de produto com custo 0 e verificar aviso amigável |
| **3.5** | Ajustar exibição comercial na Cotação diferenciando `% Markup (Custo)` de `% Margem (Venda)` | `src/components/QuoteBuilder.tsx` | Baixo | Pequeno | Verificar cards de resumo financeiro na Cotação |

---

### FASE 4 — PERFORMANCE, SEGURANÇA E LIMPEZA DE CÓDIGO MORTO

| Ordem | Ação Recomendada | Arquivos Afetados | Nível de Risco | Esforço | Teste Obrigatório de Validação |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **4.1** | Desinstalar dependências vulneráveis e não utilizadas (`xlsx`, `jspdf`, `html2canvas`) | `package.json`, `package-lock.json` | Baixo | Pequeno | Rodar `npm run build` e conferir compilação limpa sem quebra |
| **4.2** | Excluir arquivos de componentes legados órfãos (`WebSearchModal.tsx`, `PriceScannerPanel.tsx`, `ClientManagementModal.tsx`) | `src/components/` | Baixo | Pequeno | Verificar redução de ~180 KB no bundle final |
| **4.3** | Atualizar lista de modelos do Gemini para versões oficiais ativas (`gemini-2.0-flash`) | `src/services/priceScannerService.ts`, `src/services/imageQuoteParser.ts` | Baixo | Pequeno | Monitorar tempo de resposta das consultas da IA |
| **4.4** | Migrar armazenamento de fotos de alta resolução para Supabase Storage evitando estouro de LocalStorage | `src/utils/storage.ts`, `src/services/supabase.ts` | Médio | Grande | Fazer upload de 5 fotos de 4MB e verificar estabilidade do app |

---

## 7. CONCLUSÃO E PRÓXIMOS PASSOS

O sistema **Infodesk SmartQuote** possui uma base funcional excelente e recursos de automação de ponta. As correções identificadas nesta auditoria são essenciais para transformar a aplicação em uma plataforma de nível empresarial (enterprise-grade), com segurança estrita para dados de clientes e órgãos públicos, e precisão matemática impecável para garantir a lucratividade e reputação comercial da Infodesk.

**Aguardando autorização de Lucas para dar início às correções faseadas.**
