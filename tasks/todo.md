# Plano de Implementação — Auditoria e Correções Gerais

- [x] 1. Fase 1: Criar script de migração SQL `supabase/migration_security_and_indexes_hardening.sql` (RLS fechado, blindagem da RPC `save_quote_atomic` com verificação de auth e índices de performance)
- [x] 2. Fase 2: Blindar autenticação no frontend em `src/App.tsx` (remover bypass de localStorage e exigir sessão ativa do Supabase Auth)
- [x] 3. Fase 2: Sanitizar exibição de e-mail HTML no Inbox em `src/components/InboxView.tsx` com DOMPurify
- [x] 4. Fase 3: Proteger `api/google-shopping.ts` (remover apiKey por query param GET e limitar a env vars)
- [x] 5. Fase 3: Criar Serverless Function `api/gemini-proxy.ts` e registrar no `vite.config.ts`
- [x] 6. Fase 3: Atualizar `src/services/priceScannerService.ts` e `src/services/multiItemExtractorService.ts` para usar o proxy do Gemini
- [x] 7. Fase 3: Atualizar `src/services/gmailService.ts` para reter token OAuth exclusivamente em memória volátil
- [x] 8. Validação: Executar suíte de testes automatizados (`npx tsx src/__tests__/run-tests.ts`) e build de produção (`npm run build`)
- [x] 9. Git: Commitar e enviar as alterações para o GitHub
