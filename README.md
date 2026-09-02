# Infodesk SmartQuote

Sistema de geração de propostas comerciais com leitura de e-mails, catálogo de produtos, formação de preços e exportação em PDF.

## Tecnologias

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS
- **Backend/DB**: Supabase (PostgreSQL)
- **Deploy**: Vercel
- **Email**: Google Gmail API

## Configuração Local

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/infodesk-smartquote.git
cd infodesk-smartquote

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
# Preencha VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e VITE_GOOGLE_CLIENT_ID

# 4. Suba o banco no Supabase
# Acesse app.supabase.com → SQL Editor → cole o conteúdo de supabase/schema.sql

# 5. Inicie o servidor de desenvolvimento
npm run dev
```

## Banco de Dados

O arquivo `supabase/schema.sql` contém todo o schema do banco. Execute-o no **SQL Editor** do seu projeto Supabase.

Tabelas:
- `company_settings` — Configurações da Infodesk (CNPJ, endereço, alíquotas)
- `products` — Catálogo de produtos com Part Number e NCM
- `quotes` — Orçamentos comerciais gerados
- `quote_items` — Itens dos orçamentos
- `incoming_emails` — E-mails capturados da caixa de cotações

## Deploy

O projeto é configurado para deploy automático na Vercel. Configure as mesmas variáveis de ambiente em:
`Vercel Dashboard → Project Settings → Environment Variables`
