# Infodesk SmartQuote — Automação Inteligente de Cotações

Sistema completo e inteligente de automação de propostas comerciais para a **Infodesk — Informática & Tecnologia**.  
Permite leitura inteligente de e-mails, parser visual de tabelas de editais e convites, catálogo de produtos unificado, cálculo automático de impostos e margens, scanner de preços de fornecedores, exportação para Word (.doc) e Excel (.xlsx), e disparo oficial de propostas autenticado pelo **Google Workspace / Gmail API** com cópia automática em "Itens Enviados".

---

## 🚀 Funcionalidades Principais

1. **Leitura e Parser Inteligente de E-mails e Documentos:**
   - Integração OAuth2 com Google Workspace (Gmail API).
   - Extração automática de itens, quantidades, especificações técnicas, dados da empresa cliente, pessoa de contato e local de entrega.
   - Suporte avançado a tabelas HTML complexas de editais e convites de compras.

2. **Categorização e Classificação Fiscal Automática (NCM):**
   - Motor inteligente de resolução de NCM (Nomenclatura Comum do Mercosul).
   - Tradução automática dos 8 dígitos do código fiscal para a categoria comercial correspondente (Notebooks, Periféricos, Redes, Alimentos/Copa, Limpeza, etc.).
   - Aplicação em tempo real no Catálogo de Produtos, Busca Web e Montador de Propostas.

3. **Catálogo de Produtos Unificado:**
   - Gestão de produtos com unificação de Código/SKU e Part Number/Modelo.
   - Suporte a especificações técnicas detalhadas opcionais (sem exibição de texto padrão desnecessário quando em branco).
   - Histórico de custos, imagens de produtos e fornecedores.

4. **Formação Dinâmica de Preços e Margens:**
   - Markup personalizável, alíquotas de impostos (ex: Simples Nacional) e custo de frete.
   - Scanner de preços e fornecedores integrado com busca web em tempo real.
   - Cálculo automático de preço de venda e margem de lucro por item e global.

5. **Identidade Visual e Documentos Oficiais:**
   - Logomarca oficial horizontal da Infodesk padronizada em todo o sistema:
     - Na tela de navegação (Navbar) e na folha A4 oficial.
     - Na exportação nativa para Word (.doc) embutida via base64 para funcionamento 100% offline.
     - No corpo dos e-mails enviados e na pasta "Itens Enviados" do Gmail via anexos inline MIME (`cid:infodesk-logo`).
   - Assinatura com ícones gráficos oficiais de telefone (`phone-icon.png`) e WhatsApp (`whatsapp-icon.png`) anexados inline sem conversão para emojis indesejados.

6. **Envio Oficial de Propostas via Gmail:**
   - Cabeçalho `From` codificado no padrão RFC 2047 com o formato exato: `[Primeiro Nome] - [Nome Fantasia] <email@empresa.com>`.
   - Conexão e reconexão automática com a conta Google Workspace.
   - Gravação imediata do histórico completo e sincronização em tempo real com o Supabase.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Lucide Icons.
- **Backend / Persistência**: Supabase (PostgreSQL com RLS) e LocalStorage redundante.
- **E-mail & Autenticação**: Google Identity Services OAuth2 e Gmail REST API v1.
- **Exportação de Documentos**: Microsoft Word (.doc) com MSO Stylesheets e Excel (.xlsx).
- **Hospedagem & CI/CD**: Vercel.

---

## 💻 Configuração Local

```bash
# 1. Clone o repositório
git clone https://github.com/lhukas-porto/infodesk-smartquote.git
cd infodesk-smartquote

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
# Preencha VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e VITE_GOOGLE_CLIENT_ID

# 4. Inicie o servidor de desenvolvimento local
npm run dev
```

---

## 🗄️ Estrutura do Banco de Dados (Supabase)

O arquivo `supabase/schema.sql` contém a estrutura completa das tabelas:
- `company_settings`: Configurações da empresa (Razão Social, Nome Fantasia, CNPJ, Inscrição Estadual, endereço, contatos, alíquotas).
- `products`: Catálogo de produtos com SKU/Part Number, NCM, categoria, custo e especificações.
- `quotes`: Propostas comerciais geradas, status de envio, condições de pagamento e prazos.
- `quote_items`: Linhas de produtos de cada cotação.
- `incoming_emails`: Registro de e-mails de clientes escaneados da caixa de entrada.
- `client_companies`: Cadastro inteligente de clientes e locais de entrega recorrentes.

---

## 🚀 Deploy na Vercel

O projeto possui integração contínua com a Vercel via branch `master`.  
Para configurar as variáveis de ambiente em produção:
1. Acesse o **Vercel Dashboard → Project Settings → Environment Variables**.
2. Adicione as chaves:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GOOGLE_CLIENT_ID`
3. Cada commit na branch `master` dispara o build e deploy automaticamente.
