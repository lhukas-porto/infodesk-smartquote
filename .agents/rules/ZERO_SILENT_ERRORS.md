# ZERO_SILENT_ERRORS.md — DIRETRIZ DE TOLERÂNCIA ZERO A ERROS SILENCIOSOS (REGRA DO LUCAS)

## 📌 Visão Geral
Toda e qualquer exceção, falha de requisição (Supabase, Gemini API, OCR, WebSearch), problema de parsing de arquivo ou erro operacional no InfoDesk SmartQuote **NÃO PODE SER SILENCIOSO**.

## 🛑 O que é PROIBIDO
- `catch (err) { console.error(err); }` sem feedback na UI.
- Falhas assíncronas ignoradas.
- Mensagens genéricas como "Algo deu errado" que não informam o erro real.

## ✅ O que é OBRIGATÓRIO
1. **Disparar `reportError(titulo, erro, contexto)`**:
   Importe de `src/services/errorReporter.ts` e chame dentro do bloco `catch` de qualquer operação.
2. **Exibição na UI**:
   O `GlobalErrorToaster` exibe um card vermelho destacado com:
   - Título da ação.
   - Mensagem legível da falha.
   - Detalhes técnicos (stack / payload de erro da API).
   - Botão **"Copiar Erro para Resolver"**.
3. **Tratamento Global**:
   `initGlobalErrorListeners()` já captura `unhandledrejection` e `window.error` em runtime.
