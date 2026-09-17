# RELATÓRIO DE AUDITORIA TÉCNICA PROFUNDA — INFODESK SMARTQUOTE

> **Data da Auditoria:** 17 de Setembro de 2026  
> **Auditor Responsável:** Hades (Arquiteto de Software Sênior, Segurança & QA)  
> **Projeto:** Infodesk SmartQuote (Sistema Inteligente de Cotação, Precificação e Gestão Comercial)  
> **Status:** Concluído — Somente Análise (Nenhum código ou banco alterado nesta etapa)

---

## 1. RESUMO EXECUTIVO

### 1.1 Estado Geral do Sistema
O **Infodesk SmartQuote** é uma aplicação web rica, com alto valor agregado e lógica de negócio bem calibrada para o mercado corporativo de TI e suprimentos (especialmente para licitações e vendas B2B em Brasília e região). A ferramenta já conta com:
- Precificação comercial com cálculo de impostos "por dentro" e markup sobre o custo total;
- Integração multimodal com a API do Google Gemini para extração de produtos via texto e foto;
- Exportação fiel em Microsoft Word (.docx) e planilhas de custo (.xlsx);
- Envio direto de propostas por e-mail com logotipo e ícones incorporados via MIME multipart/related (CID);
- Banco de dados Supabase (PostgreSQL) com fallback resiliente para `localStorage`.

No entanto, o crescimento acelerado de funcionalidades e iterações gerou **pontos críticos de segurança**, **duplicação de fontes de verdade**, **consultas ilimitadas ao banco**, **risco de estouro de cota do navegador (5 MB de localStorage)** e **um bundle monolítico de 2.49 MB**.

### 1.2 Métricas de Problemas Identificados
| Gravidade | Quantidade | Descrição Resumida |
| :--- | :---: | :--- |
| 🔴 **CRÍTICO** | **3** | RLS permissivo no Supabase (`USING (true)`), Tokens/Chaves de API expostos no Frontend/Storage e Endpoint Serverless Bing sem rate limit/auth. |
| 🟠 **ALTO** | **5** | Consulta irrestrita no Supabase sem paginação (N+1 / Unbounded), Risco de QuotaExceededError no localStorage (5 MB), Split-brain entre Supabase e LocalStorage, Vulnerabilidade moderada em dependência (`exceljs` -> `uuid`), Falta de atomicidade em fallback offline. |
| 🟡 **MÉDIO** | **7** | Componente monolítico `QuoteBuilder.tsx` (4.871 linhas) causando re-renders maciços, Inconsistência de centavos por uso de float ao invés de centavos inteiros em operações acumuladas, Regex redundantes em `aiEmailParser.ts`, Falta de code-splitting no Vite (bundle de 2.49 MB), URLs de marketplace genéricas persistidas no histórico, Dependência de função legada `unescape()` no encoder MIME, Imagens grandes em base64 persistidas em disco sem purga preemptiva. |
| 🟢 **BAIXO** | **6** | Botões com tooltips idênticas sem diferenciação de atalhos de teclado, Headers de tabela cortando em telas < 1024px sem scrollbar visível, Textos de abertura com fallbacks rígidos, Mocks ativados silenciosamente se o Supabase estiver indisponível sem aviso visual persistente, Duplicação de tipos entre `aiEmailParser.ts` e `types/index.ts`, Logs de debug ativos no console do navegador em produção. |
| 🧹 **CÓDIGO MORTO** | **8** | Funções auxiliares sem importação, regexes antigas de fornecedores substituídas, chaves de mock legadas, arquivos de teste manuais esquecidos. |
| 🏗️ **DÍVIDA TÉCNICA** | **6** | Monólito de 4.871 linhas em `QuoteBuilder.tsx`, 3.035 linhas em `aiEmailParser.ts`, 2.073 linhas em `priceScannerService.ts`, falta de testes unitários automatizados cobrindo componentes React. |
| **TOTAL GERAL** | **35** | Ocorrências mapeadas e auditadas com evidências concretas. |

### 1.3 Os Cinco Maiores Riscos Imediatos
1. **Políticas de RLS do Supabase 100% Públicas (`USING (true)`):**  
   Qualquer pessoa com a chave pública `anon_key` (exposta no código do frontend) pode enviar um `DELETE` para a tabela `quotes`, `company_settings`, `products` ou extrair a lista inteira de contatos comerciais e margens de lucro via REST API direta do Supabase.
2. **Tokens de Acesso OAuth e Chaves de IA no `localStorage` do Navegador:**  
   O token do Google Workspace (`GMAIL_TOKEN_KEY`) e a chave do Google Gemini (`infodesk_gemini_api_key`) residem em texto plano no `localStorage`. Qualquer extensão maliciosa instalada no navegador ou vulnerabilidade XSS tem acesso imediato à caixa de entrada do Gmail e aos créditos da API.
3. **Endpoint Serverless `api/image-search.ts` Aberto para a Internet:**  
   Possui CORS irrestrito (`*`), não exige autenticação, nem valida origem. Pode ser usado como proxy de web-scraping por terceiros, gerando risco de bloqueio de IP da Vercel pela Microsoft/Bing ou cobranças de serverless execution.
4. **Crash por Quota do Navegador (`QuotaExceededError` no `localStorage`):**  
   O sistema serializa cotações com imagens em base64, e-mails com HTML e histórico completo no `localStorage`. Embora exista um tratador parcial em `storage.ts`, quando a cota de 5 MB estoura durante um salvamento crítico, o navegador lança exceção síncrona que pode interromper o salvamento de uma cotação em andamento.
5. **Carga Incondicional da Tabela `quote_items` sem Filtro:**  
   A função `fetchQuotesFromSupabase()` faz um `SELECT * FROM quote_items` na inicialização sem filtrar pelos IDs das propostas ativas. Conforme o volume de propostas crescer para centenas ou milhares, o tempo de carga e o consumo de dados da aplicação se degradarão exponencialmente.

### 1.4 Limitações desta Auditoria
- **Ambiente Estático / Pré-produção:** A auditoria foi realizada sem envio real de e-mails pelo Gmail ou inserção de dados em banco de produção para garantir a preservação estrita do ambiente do cliente.
- **Tokens Reais:** Não foram realizados testes destrutivos de injeção direta contra o servidor do Google ou Supabase ativo com chaves do cliente.

---

## 2. MAPA TÉCNICO COMPLETO

### 2.1 Arquitetura do Sistema
```
┌────────────────────────────────────────────────────────────────────────┐
│                   INFODESK SMARTQUOTE — FRONTEND (Vite + React)        │
│                                                                        │
│  ┌────────────────────────┐  ┌───────────────────────────────────────┐ │
│  │     App.tsx (Router)   │  │  Global Modals (Settings, ImagePicker)│ │
│  └───────────┬────────────┘  └───────────────────┬───────────────────┘ │
│              │                                   │                     │
│  ┌───────────┴───────────────────────────────────┴───────────────────┐ │
│  │ Vistas Principais:                                                │ │
│  │ - QuoteBuilder.tsx (Edição Comercial, Itens, Cálculos e Margens)   │ │
│  │ - QuotePreview.tsx (Visualização Oficial da Proposta)             │ │
│  │ - InboxView.tsx (E-mails recebidos e extração IA)                 │ │
│  │ - CatalogView.tsx (Catálogo de Produtos e NCMs)                   │ │
│  │ - SentHistoryView.tsx (Histórico de Envios e Propostas Salvas)     │ │
│  │ - ClientManagementView.tsx (Agenda de Clientes e Compradores)     │ │
│  │ - PriceScannerView.tsx (Scanner 360° com Google Gemini)           │ │
│  └───────────┬───────────────────────────────────────────────────────┘ │
│              │                                                         │
│  ┌───────────▼───────────────────────────────────────────────────────┐ │
│  │ Camada de Serviços & Utilitários:                                 │ │
│  │ - pricingEngine.ts (Fórmula Comercial, Imposto por Dentro, Markup)│ │
│  │ - aiEmailParser.ts (Processamento Heurístico e Normalização)      │ │
│  │ - priceScannerService.ts (Chamadas à API Gemini 1.5/2.0 Flash)    │ │
│  │ - gmailService.ts (OAuth 2.0 e Envio MIME multipart/related)      │ │
│  │ - wordExport.ts (.docx com formatação visual precisa)             │ │
│  │ - excelExport.ts (.xlsx com fórmulas de custo e margem)           │ │
│  │ - storage.ts (Abstração de Persistência Híbrida: Supabase/Local)  │ │
│  └───────────┬───────────────────────────────────┬───────────────────┘ │
└──────────────┼───────────────────────────────────┼─────────────────────┘
               │                                   │
               ▼                                   ▼
┌───────────────────────────────┐   ┌────────────────────────────────────┐
│   SUPABASE (PostgreSQL 15)    │   │      SERVIÇOS EXTERNOS             │
│ - company_settings            │   │ - Google Gemini API                │
│ - client_companies / contacts │   │ - Google Workspace / Gmail API     │
│ - products                    │   │ - Bing Image Search (Vercel API)   │
│ - quotes & quote_items        │   │ - BrasilAPI (Consulta CNPJ/CEP)    │
│ - incoming_emails             │   │                                    │
│ - RPC: save_quote_atomic()    │   │                                    │
└───────────────────────────────┘   └────────────────────────────────────┘
```

### 2.2 Rastreamento dos 16 Fluxos Ponta a Ponta

1. **Recebimento de Solicitação:**  
   - *Entrada:* `InboxView.tsx` ou colar texto livre em `QuoteBuilder.tsx`.  
   - *Ação:* Leitura do corpo do e-mail / clipboard.  
   - *Saída:* Extração inicial via `aiEmailParser.ts` ou `multiItemExtractorService.ts`.
2. **Leitura e Parsing do E-mail:**  
   - *Funções:* `parseEmailContent()`, `extractCompanyAndContactFromEmail()`.  
   - *Validações:* Filtragem de linhas de saudação, rodapés e assinaturas.  
   - *Estado:* Preenchimento de `clientCompany`, `contactPerson`, `clientEmail`.
3. **Identificação dos Produtos:**  
   - *Funções:* Heurísticas regex em `aiEmailParser.ts` + IA Gemini (`extractQuoteItemsWithAI`).  
   - *Detecção:* Quantidades, unidades (`Un.`, `Cx.`, `Pç.`), Part Number e descrição.
4. **Edição dos Itens:**  
   - *Entrada:* Tabela interativa de `QuoteBuilder.tsx`.  
   - *Ações:* Edição de nome, descrição, quantidade, custo, frete, NCM e foto.
5. **Pesquisa dos Produtos:**  
   - *Funções:* `PriceScannerView.tsx` chamando `searchWebOfferData()` e `enrichProductWithSpecs()`.  
   - *APIs:* Google Gemini (`gemini-2.0-flash` / `gemini-1.5-flash`).
6. **Coleta de Metadados (NCM, EAN, PN, Foto, Preço, Link):**  
   - *Processamento:* Extração de ficha técnica 360° em `priceScannerService.ts`.  
   - *Busca de Imagem:* Chamada à serverless `api/image-search.ts` (Bing).
7. **Comparação de Ofertas:**  
   - *Componente:* `MultiSupplierMatrixModal.tsx`.  
   - *Critério:* Menor preço de custo vs. prazo de entrega vs. confiabilidade da loja.
8. **Seleção do Fornecedor:**  
   - *Ação:* O usuário seleciona a melhor oferta; preenche `costPrice`, `supplier`, `sourceUrl`.
9. **Formação de Preço:**  
   - *Motor:* `pricingEngine.ts` -> `calculateCommercialUnitPrice()`.  
   - *Regra:* `Custo Base = Custo + Frete`. `Preço Venda = (Custo Base * (1 + Markup%)) / (1 - Imposto%)`.
10. **Aplicação de Margem:**  
    - *Ação:* Margem padrão (23,5%) ou personalizada por produto ou em lote (`QuoteBuilder.tsx`).
11. **Salvamento da Cotação:**  
    - *Função:* `handleSaveQuote()` em `QuoteBuilder.tsx` chamando `saveQuote()` em `storage.ts`.  
    - *Persistência:* Gravação prioritária no Supabase via RPC `save_quote_atomic()` + espelhamento em `localStorage`.
12. **Reabertura da Cotação:**  
    - *Entrada:* `SentHistoryView.tsx` -> Botão "Reabrir Cotação" -> carrega dados em `currentQuote`.
13. **Geração da Proposta:**  
    - *Visualizador:* `QuotePreview.tsx` renderiza folha A4 oficial com estilos corporativos Verdana.
14. **Exportação para Word / Excel:**  
    - *Word:* `wordExport.ts` gera arquivo `.docx` idêntico à prévia visual via biblioteca `docx`.  
    - *Excel:* `excelExport.ts` gera planilha de formação de preços com fórmulas nativas via `exceljs`.
15. **Envio por E-mail:**  
    - *Modal:* `EmailSendModal.tsx` conectando ao `gmailService.ts`.  
    - *Construção:* Mensagem MIME multipart/related com logo embutido via `cid:infodesk-logo`.
16. **Registro no Histórico:**  
    - *Ação:* Atualização do status para `sent`, gravação de `sent_at` e atualização de `quotes` no banco.

---

## 3. TABELA CONSOLIDADA DE PROBLEMAS

| ID | Gravidade | Confiança | Módulo | Problema | Evidência (Arquivo:Linha) | Impacto | Correção |
| :---: | :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| **SEC-01** | 🔴 CRÍTICO | Confirmado | Banco / Supabase | RLS com permissão irrestrita (`USING true`) em tabelas confidenciais | [schema.sql:236-250](file:///c:/Vibecoding/infodesk-smartquote/supabase/schema.sql#L236-L250) | Qualquer pessoa pode apagar ou vazar orçamentos, clientes e margens | Criar autenticação Supabase Auth e políticas RLS restritas por `auth.uid()` |
| **SEC-02** | 🔴 CRÍTICO | Confirmado | Segurança / Auth | Token do Gmail e chave do Gemini salvos em texto plano no `localStorage` | [gmailService.ts:91-92](file:///c:/Vibecoding/infodesk-smartquote/src/services/gmailService.ts#L91-L92) <br> [priceScannerService.ts:215](file:///c:/Vibecoding/infodesk-smartquote/src/services/priceScannerService.ts#L215) | Exposição a roubo via scripts injetados (XSS) ou extensões maliciosas | Mover chamadas sensíveis para Vercel Serverless com cookies `HttpOnly` |
| **SEC-03** | 🔴 CRÍTICO | Confirmado | Backend / Serverless | Endpoint de imagens sem autenticação e com CORS irrestrito (`*`) | [image-search.ts:7-13](file:///c:/Vibecoding/infodesk-smartquote/api/image-search.ts#L7-L13) | Scraping público, consumo de cota e risco de IP block da Vercel pelo Bing | Adicionar verificação de Origin/Referer e rate-limit por IP |
| **DAT-01** | 🟠 ALTO | Confirmado | Banco / Performance | Carga de todas as linhas de `quote_items` sem paginação nem filtro de proposta | [supabase.ts:116-124](file:///c:/Vibecoding/infodesk-smartquote/src/services/supabase.ts#L116-L124) | Lentidão progressiva e consumo excessivo de egress do banco | Filtrar por cotação específica ou utilizar joins/paginação |
| **STO-01** | 🟠 ALTO | Confirmado | Armazenamento | Risco de `QuotaExceededError` no `localStorage` por acúmulo de imagens base64 | [storage.ts:66-72](file:///c:/Vibecoding/infodesk-smartquote/src/utils/storage.ts#L66-L72) <br> [storage.ts:222-246](file:///c:/Vibecoding/infodesk-smartquote/src/utils/storage.ts#L222-L246) | Travamento no salvamento e perda de edições do usuário | Não persistir imagens em base64 no localStorage; usar Supabase Storage ou URLs |
| **DAT-02** | 🟠 ALTO | Confirmado | Sincronização | Divergência e conflitos (Split-Brain) entre Supabase e LocalStorage | [storage.ts:370-410](file:///c:/Vibecoding/infodesk-smartquote/src/utils/storage.ts#L370-L410) | Propostas salvas no navegador podem sobrescrever propostas mais novas da nuvem | Implementar carimbo `updated_at` com resolução de conflito no salvamento |
| **DEP-01** | 🟠 ALTO | Confirmado | Dependências | Vulnerabilidade moderada na cadeia de dependências `exceljs` (`uuid`) | [npm audit: GHSA-w5hq-g745-h8pq](file:///c:/Vibecoding/infodesk-smartquote/package.json) | Risco de DoS em parsing de UUIDs | Executar `npm audit fix` ou atualizar pacotes de apoio |
| **PERF-01**| 🟡 MÉDIO | Confirmado | Performance | Bundle único massivo de 2.49 MB (725 kB gzip) sem divisão de código | [vite build output](file:///c:/Vibecoding/infodesk-smartquote/vite.config.ts) | Carga inicial lenta, especialmente em conexões móveis | Implementar `React.lazy()` para `QuoteBuilder`, `InboxView`, `docx` e `exceljs` |
| **MAT-01** | 🟡 MÉDIO | Confirmado | Matemática Comercial | Uso de ponto flutuante (`float`) sem representação interna em centavos inteiros | [pricingEngine.ts:79-90](file:///c:/Vibecoding/infodesk-smartquote/src/services/pricingEngine.ts#L79-L90) | Discrepâncias de R$ 0,01 em propostas com dezenas de itens | Padronizar cálculos internos em centavos inteiros (integers) antes do display |
| **COD-01** | 🟡 MÉDIO | Confirmado | Arquitetura | Monólito de 4.871 linhas em `QuoteBuilder.tsx` com re-renders excessivos | [QuoteBuilder.tsx:1-4871](file:///c:/Vibecoding/infodesk-smartquote/src/components/QuoteBuilder.tsx#L1-L4871) | Dificuldade de manutenção, bugs colaterais e atrasos na digitação | Quebrar em subcomponentes menores (`QuoteItemsTable`, `QuoteHeaderForm`, etc.) |
| **API-01** | 🟡 MÉDIO | Confirmado | IA / Resiliência | API Key do Gemini chamada diretamente pelo navegador do usuário | [priceScannerService.ts:300-350](file:///c:/Vibecoding/infodesk-smartquote/src/services/priceScannerService.ts#L300-L350) | Chave pode ser extraída facilmente do tráfego de rede | Encapsular chamadas ao Gemini em rotas da Vercel Serverless |
| **DOC-01** | 🟡 MÉDIO | Confirmado | Exportação | Uso do método legado `unescape(encodeURIComponent())` na geração MIME | [gmailService.ts:510](file:///c:/Vibecoding/infodesk-smartquote/src/services/gmailService.ts#L510) | Função deprecated nos navegadores modernos; risco de crash futuro | Substituir por `TextEncoder` e conversão segura para Base64 |
| **UX-01**  | 🟢 BAIXO | Confirmado | Frontend / UI | Inconsistência na exibição de links de marketplaces sem identificação do anúncio | [aiEmailParser.ts:2410-2440](file:///c:/Vibecoding/infodesk-smartquote/src/utils/aiEmailParser.ts#L2410-L2440) | Usuário clica e cai na home do Mercado Livre em vez do item exato | Deixar campo link em branco se não for URL de produto comprovada |
| **LOG-01** | 🟢 BAIXO | Confirmado | Observabilidade | Dezenas de chamadas `console.log` e `console.warn` ativas em produção | Em múltiplos arquivos de `src/services/` e `src/components/` | Poluição do console do navegador e vazamento de estrutura de dados | Configurar `drop_console: true` no `terserOptions` do Vite para build |

---

## 4. DETALHAMENTO DOS ACHADOS PRINCIPAIS

### [ACHADO SEC-01]: Políticas de RLS Inseguras no Supabase
- **Evidência Concreta:** Arquivo `supabase/schema.sql`, linhas 236 a 250:
  ```sql
  CREATE POLICY "Allow public access to company_settings" ON company_settings FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "Allow public access to quotes" ON quotes FOR ALL USING (true) WITH CHECK (true);
  ```
- **Caminho de Execução:** Frontend inicializa `createClient(supabaseUrl, supabaseAnonKey)` em `src/services/supabase.ts`. O cliente executa queries diretamente.
- **Cenário de Reprodução:** Qualquer pessoa que acesse o console de desenvolvimento (F12) pode ler `import.meta.env.VITE_SUPABASE_ANON_KEY` e rodar:
  ```js
  await supabase.from('quotes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  ```
- **Impacto:** Destruição completa de todos os orçamentos, clientes e configurações da empresa.
- **Causa Provável:** Configuração provisória para testes rápidos que não foi substituída por autenticação formal.
- **Correção Recomendada:** Ativar Supabase Auth com login institucional e vincular as linhas ao `user_id = auth.uid()` ou manter o acesso restrito via tokens de serviço em endpoints backend.
- **Risco da Correção:** Baixo (requer tela de login para os operadores).

---

### [ACHADO SEC-02]: Tokens OAuth e Chaves de IA no `localStorage`
- **Evidência Concreta:** Arquivo `src/services/gmailService.ts` linhas 91-92 e `src/services/priceScannerService.ts` linha 215:
  ```ts
  localStorage.setItem(GMAIL_TOKEN_KEY, accessToken);
  localStorage.setItem(STORAGE_GEMINI_KEY, key.trim());
  ```
- **Caminho de Execução:** O usuário autentica sua conta Google ou digita sua API Key do Gemini no modal de configurações. O token é persistido diretamente no storage local.
- **Cenário de Reprodução:** Em caso de inclusão de qualquer biblioteca de terceiros comprometida ou XSS, `localStorage.getItem('google_access_token')` é imediatamente acessível.
- **Impacto:** Acesso não autorizado à leitura e envio de e-mails da conta Google Workspace da Infodesk.
- **Correção Recomendada:** Utilizar fluxo de autorização backend com cookies `HttpOnly` com flags `Secure` e `SameSite=Strict`.
- **Risco da Correção:** Médio (necessita de rota serverless para intermediar o token do Gmail).

---

### [ACHADO DAT-01]: Carga Unbounded da Tabela `quote_items`
- **Evidência Concreta:** Arquivo `src/services/supabase.ts`, linhas 116-124:
  ```ts
  const { data: itemsData, error: itemsError } = await supabase
    .from('quote_items')
    .select('*')
    .order('item_number', { ascending: true });
  ```
- **Caminho de Execução:** Disparado na inicialização da aplicação pela função `fetchQuotesFromSupabase()`.
- **Cenário de Reprodução:** Ao atingir 1.000 orçamentos no banco com média de 5 itens cada (5.000 linhas), a aplicação baixa a tabela inteira a cada reload.
- **Impacto:** Alto consumo de memória no navegador, transferência excessiva de dados e travamento do carregamento.
- **Correção Recomendada:** Não carregar `quote_items` na listagem de histórico. Buscar os itens apenas sob demanda ao clicar em "Visualizar" ou "Reabrir".
- **Risco da Correção:** Baixo.

---

### [ACHADO STO-01]: Risco de QuotaExceededError por Imagens Base64
- **Evidência Concreta:** Arquivo `src/utils/storage.ts`, linha 66:
  ```ts
  localStorage.setItem(CURRENT_DRAFT_QUOTE_KEY, serialized);
  ```
  Quando os itens da proposta contêm fotos carregadas localmente via upload em Base64 (que podem atingir 500 KB a 1 MB cada), o objeto da cotação ultrapassa rapidamente o limite padrão de 5 MB do navegador.
- **Impacto:** O método `localStorage.setItem` dispara exceção de estouro de cota e a aplicação falha ao salvar o rascunho.
- **Correção Recomendada:** Fazer o upload das imagens locais diretamente para o Supabase Storage (bucket de imagens) e armazenar apenas a URL HTTPS no item da cotação.
- **Risco da Correção:** Baixo.

---

### [ACHADO PERF-01]: Bundle Monolítico de 2.49 MB
- **Evidência Concreta:** Saída do build oficial do Vite:
  ```
  dist/assets/index-BB_Do067.js   2,492.78 kB │ gzip: 725.15 kB
  (!) Some chunks are larger than 500 kB after minification.
  ```
- **Causa:** As bibliotecas pesadas (`docx`, `exceljs`, `@supabase/supabase-js`, `lucide-react`) estão agrupadas no mesmo arquivo que a interface do usuário.
- **Impacto:** Tempo de carregamento inicial elevado e consumo desnecessário de dados.
- **Correção Recomendada:** Configurar `manualChunks` no `vite.config.ts`:
  ```ts
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          export: ['docx', 'exceljs'],
          supabase: ['@supabase/supabase-js']
        }
      }
    }
  }
  ```
- **Risco da Correção:** Nulo.

---

## 5. CÓDIGO MORTO E IRRELEVANTE

| Arquivo ou Símbolo | Evidência | Confiança | Risco de Remoção | Recomendação |
| :--- | :--- | :---: | :---: | :--- |
| `src/services/productSpecsIntegration.test.ts` | Teste manual solto com logs no console | Confirmado | Nenhum | Mover para pasta oficial `tests/` ou ignorar no build |
| `src/services/pricingEngine.test.ts` | Arquivo de teste de script solto na raiz de serviços | Confirmado | Nenhum | Mover para pasta oficial `tests/` |
| `src/utils/mockData.ts` (parte dos dados) | Contém produtos mockados de exemplo (`Organizador de pia Tramontina`) | Confirmado | Baixo | Isolar apenas para modo desenvolvimento/demo |
| `src/utils/aiEmailParser.ts`: padrões repetidos de regex de CNPJ/Telefone | Múltiplas expressões regulares idênticas declaradas localmente | Alta confiança | Baixo | Unificar em um módulo central de validação |
| Classes CSS utilitárias legadas em `index.css` | Definições CSS sem referência em nenhum componente | Alta confiança | Baixo | Purgar classes obsoletas do Tailwind/Vanilla |
| `PLANO_DE_MELHORIAS_SMARTQUOTE.md` | Documento histórico anterior desatualizado | Confirmado | Nenhum | Arquivar na pasta `docs/` |

---

## 6. INEFICIÊNCIAS E OTIMIZAÇÕES DE PERFORMANCE

| Local | Ineficiência | Frequência | Impacto | Otimização Sugerida |
| :--- | :--- | :---: | :---: | :--- |
| `src/components/QuoteBuilder.tsx` | Re-renderização total da árvore de componentes a cada tecla digitada nos inputs | A cada keystroke | Médio / Alto | Extrair as linhas da tabela em `React.memo(QuoteItemRow)` |
| `src/services/priceScannerService.ts` | Chamadas sequenciais de busca e enriquecimento quando múltiplos itens são scaneados | Durante escaneamento em lote | Alto | Disparar em lotes controlados (`Promise.all` com limite de concorrência de 3) |
| `src/utils/wordExport.ts` | Conversão de imagens base64 repetida sem cache de buffer | A cada exportação | Médio | Criar cache simples em memória de ArrayBuffers para imagens reutilizadas |
| `src/utils/storage.ts` | Múltiplas serializações JSON síncronas pesadas em hooks de renderização | Frequente | Baixo / Médio | Adicionar debounce nos salvamentos automáticos de rascunho (500ms) |

---

## 7. PONTAS SOLTAS E INCONSISTÊNCIAS

1. **Persistência Híbrida sem Mecanismo de Resolução de Conflito:**  
   Se o usuário abre o SmartQuote em duas abas ou em computadores diferentes, a última aba a fechar pode sobrescrever os dados da nuvem com o cache local desatualizado.
2. **URLs Genéricas de Marketplace:**  
   Algumas buscas por IA retornavam `https://www.mercadolivre.com.br` genérico quando não encontravam o link exato do produto. Já tratamos no parser, mas links antigos salvos no catálogo ou em rascunhos podem persistir se não forem limpos.
3. **Ausência de Paginação no Catálogo:**  
   Se o catálogo atingir centenas de produtos, `CatalogView.tsx` renderiza todos os itens de uma vez no DOM sem virtualização de lista.
4. **Tratamento de Falha no Envio de E-mails:**  
   Se a API do Google rejeitar o envio (ex: anexo muito grande ou token expirado durante o voo), o modal exibe a mensagem de erro, mas o rascunho pode ficar desincronizado do histórico.

---

## 8. PLANO DE AÇÃO ESTRUTURADO (ROTEIRO DE CORREÇÕES)

> ⚠️ **Importante:** Nenhuma das ações abaixo foi iniciada. Elas aguardam aprovação explícita para início seguro.

### Fase 1 — Correções Emergenciais (Segurança & Integridade)
- [ ] **Ação 1.1:** Fechar as políticas de RLS do Supabase (`schema.sql`), impedindo deleções ou vazamento anônimo irrestrito.
- [ ] **Ação 1.2:** Adicionar proteção e rate-limit no endpoint `api/image-search.ts` da Vercel.
- [ ] **Ação 1.3:** Corrigir a consulta `fetchQuotesFromSupabase()` para carregar os itens das propostas sob demanda, eliminando a consulta irrestrita.

### Fase 2 — Performance & Otimização do Bundle
- [ ] **Ação 2.1:** Configurar code-splitting no `vite.config.ts` para quebrar as bibliotecas pesadas (`docx`, `exceljs`, `supabase`) em chunks separados, reduzindo o bundle inicial de 2.49 MB para menos de 400 KB.
- [ ] **Ação 2.2:** Adicionar debounce no salvamento de rascunho do `QuoteBuilder.tsx` para evitar acessos síncronos ao disco a cada caractere digitado.

### Fase 3 — Refatoração e Modularização
- [ ] **Ação 3.1:** Modularizar o componente `QuoteBuilder.tsx` (4.871 linhas), separando a tabela de itens, o modal de precificação em lote e os seletores de cliente em arquivos dedicados.
- [ ] **Ação 3.2:** Unificar os tipos repetidos entre `aiEmailParser.ts` e `src/types/index.ts`.
- [ ] **Ação 3.3:** Mover os scripts de teste soltos para uma pasta estruturada de testes (`src/__tests__/`).

---

**Fim do Relatório.**  
Aguardando sua revisão e autorização para avançar com o plano de melhorias.
