# ROADMAP DE IMPLEMENTAÇÃO — PACOTE DE MELHORIAS S.H.A.R.K.

- [x] **Fase 1: Módulo 1 — Nova Proposta Comercial (QuoteBuilder)**
  - [x] 1.1: Memória de último preço praticado por cliente na linha de cada item (histórico comparativo e preenchimento rápido em 1 clique)
  - [x] 1.2: Simulador de Desconto Geral de Fechamento (por percentual ou valor total alvo com recálculo proporcional e trava de segurança)
  - [x] 1.3: Alerta visual de margem líquida mínima configurável (destaque preventivo anti-prejuízo)

- [x] **Fase 2: Módulo 2 — WhatsApp & Fechamento Ágil**
  - [x] 2.1: Três presets de tom no WhatsAppQuoteModal (Itens & Qtd Fornecedor, Proposta Completa Cliente, Follow-up Amigável)
  - [x] 2.2: Botão de cópia rápida em 1 clique na linha de cada item da cotação

- [x] **Fase 3: Módulo 3 — Central de Compras (ProcurementView)**
  - [x] 3.1: Agrupamento inteligente por Loja/Fornecedor (Carrinho consolidado por fornecedor)
  - [x] 3.2: Termômetro financeiro de Custo Real vs Orçado com cálculo de economia ou sobrecusto em tempo real

- [x] **Fase 4: Módulo 4 — Catálogo Geral (CatalogView & ProductEditModal)**
  - [x] 4.1: Alerta visual de custo antigo / defasado (> 45 dias sem atualização)
  - [x] 4.2: Enriquecimento automático inteligente no cadastro de produtos por Part Number

- [x] **Fase 5: Módulo 5 — Histórico & CRM (SentHistoryView & Dashboard)**
  - [x] 5.1: Régua de Follow-up para propostas sem retorno (> 3 dias) com disparo rápido no WhatsApp
  - [x] 5.2: Registro de Motivo de Perda (Preço, Prazo, Estoque, Desistência) e métricas no histórico

- [x] **Fase 6: Testes Automatizados & Critic Verification**
  - [x] 6.1: Criar bateria de testes unitários para cálculo de desconto geral, histórico de cliente e follow-up
  - [x] 6.2: Validação estática completa (`npm run build` / `tsc`)
