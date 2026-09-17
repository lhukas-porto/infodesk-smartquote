# Tarefas de Implementação — SmartQuote

## Fase 3: Inteligência e Precisão de Suprimentos
- [x] 1. Criar `src/utils/specAuditService.ts` com motor determinístico de verificação de conflitos de especificações e cálculo do Índice de Confiança (MEL-14)
- [x] 2. Integrar Escudo de Compatibilidade no `PriceScannerView.tsx` e `QuoteBuilder.tsx` com badges semafóricos (Verde = Match Exato, Amarelo = Equivalente, Vermelho = Conflito) (MEL-14)
- [x] 3. Expandir tipo `QuoteItem` em `src/types/index.ts` com suporte a `alternativeOffers` (MEL-06)
- [x] 4. Criar componente `MultiSupplierMatrixModal.tsx` com comparativo lado a lado de fornecedores e simulador de "Cesta Mais Barata" (MEL-06)
- [x] 5. Integrar a Matriz de Fornecedores no `QuoteBuilder.tsx` (MEL-06)
- [x] 6. Validação técnica de ponta a ponta: checagem de tipos TypeScript (`tsc --noEmit`) e teste de build (`npm run build`)

## Fase 4: Gestão Comercial e Automação de Vendas
- [x] 1. Enriquecer status de propostas (`draft`, `sent`, `negotiating`, `approved`, `lost`) em `src/types/index.ts` (MEL-08)
- [x] 2. Implementar Funil Visual Kanban e Alertas de Follow-up 48h em `SentHistoryView.tsx` (MEL-08)
- [x] 3. Implementar Dashboard Executivo BI (`DashboardView.tsx`) com métricas de conversão, ticket médio, margem média e ranking de fornecedores (MEL-11)
- [x] 4. Integrar o Dashboard BI na barra de navegação (`Navbar.tsx`) e roteamento (`App.tsx`) (MEL-11)
- [x] 5. Criar `supplierConnectorService.ts` com importação de catálogos e tabelas brutas de grandes distribuidores (Ingram Micro, SND, Aldo Solar) (MEL-13)
- [x] 6. Validação de integridade e build (`tsc --noEmit` & `npm run build`)
