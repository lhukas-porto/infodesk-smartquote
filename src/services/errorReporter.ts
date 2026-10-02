// src/services/errorReporter.ts
// Diretriz do Lucas: Tolerância Zero a Erros Silenciosos
// Central de captura, normalização e exibição visual de erros na UI do SmartQuote.

export interface AppErrorEvent {
  id: string;
  title: string;
  message: string;
  technicalDetails?: string;
  context?: string;
  timestamp: Date;
}

type ErrorListener = (error: AppErrorEvent) => void;
type DismissListener = (id: string) => void;

const errorListeners = new Set<ErrorListener>();
const dismissListeners = new Set<DismissListener>();

const activeErrors: AppErrorEvent[] = [];

/**
 * Normaliza qualquer tipo de erro (Error, string, objeto Supabase, fetch error)
 * para uma mensagem e detalhe legível pelo Lucas.
 */
export function normalizeErrorMessage(err: unknown): { message: string; technicalDetails?: string } {
  if (!err) {
    return { message: 'Erro desconhecido ou não especificado.' };
  }

  if (typeof err === 'string') {
    return { message: err };
  }

  if (err instanceof Error) {
    return {
      message: err.message || 'Erro inesperado.',
      technicalDetails: err.stack
    };
  }

  // Erros comuns do Supabase / PostgREST
  if (typeof err === 'object' && err !== null) {
    const anyErr = err as Record<string, any>;
    const msg = anyErr.message || anyErr.error_description || anyErr.msg || anyErr.statusText;
    const details = [
      anyErr.details ? `Detalhes: ${anyErr.details}` : null,
      anyErr.hint ? `Dica: ${anyErr.hint}` : null,
      anyErr.code ? `Código: ${anyErr.code}` : null,
      anyErr.status ? `Status HTTP: ${anyErr.status}` : null
    ].filter(Boolean).join(' | ');

    if (msg) {
      return {
        message: String(msg),
        technicalDetails: details || JSON.stringify(err, null, 2)
      };
    }

    try {
      return {
        message: 'Erro retornado pela operação.',
        technicalDetails: JSON.stringify(err, null, 2)
      };
    } catch {
      return { message: String(err) };
    }
  }

  return { message: String(err) };
}

/**
 * Dispara um erro visual para a tela, notificando todos os ouvintes da UI.
 * NUNCA engula um erro! Sempre chame reportError() no bloco catch.
 */
export function reportError(title: string, error: unknown, context?: string): AppErrorEvent {
  const { message, technicalDetails } = normalizeErrorMessage(error);
  
  const errorEvent: AppErrorEvent = {
    id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title: title || 'Atenção: Ocorreu um Erro',
    message,
    technicalDetails,
    context,
    timestamp: new Date()
  };

  // Também registra no console para auditoria técnica detalhada
  console.error(`🚨 [SmartQuote ErrorReporter] ${title}:`, { error, context, event: errorEvent });

  activeErrors.push(errorEvent);
  errorListeners.forEach((listener) => {
    try {
      listener(errorEvent);
    } catch (e) {
      console.error('Falha ao acionar listener de erro:', e);
    }
  });

  return errorEvent;
}

/**
 * Remove um erro ativo da tela.
 */
export function dismissError(id: string): void {
  const idx = activeErrors.findIndex((e) => e.id === id);
  if (idx !== -1) {
    activeErrors.splice(idx, 1);
  }
  dismissListeners.forEach((listener) => {
    try {
      listener(id);
    } catch (e) {
      console.error('Falha ao acionar dismissListener:', e);
    }
  });
}

/**
 * Retorna todos os erros atualmente ativos.
 */
export function getActiveErrors(): AppErrorEvent[] {
  return [...activeErrors];
}

/**
 * Inscreve um componente para receber novos erros em tempo real.
 */
export function subscribeToErrors(onNewError: ErrorListener, onDismiss?: DismissListener): () => void {
  errorListeners.add(onNewError);
  if (onDismiss) dismissListeners.add(onDismiss);

  return () => {
    errorListeners.delete(onNewError);
    if (onDismiss) dismissListeners.delete(onDismiss);
  };
}

let isInitialized = false;

/**
 * Ativa ouvintes globais do navegador para garantir que QUALQUER erro não tratado
 * ou promise rejeitada apareça na tela imediatamente, em vez de morrer silencioso no console.
 */
export function initGlobalErrorListeners(): void {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  // Captura erros assíncronos de promises não tratadas
  window.addEventListener('unhandledrejection', (event) => {
    // Evita loop se o próprio listener der erro
    try {
      const reason = event.reason;
      reportError(
        'Falha em Operação Assíncrona',
        reason || 'Uma promessa assíncrona falhou sem tratamento.',
        'Unhandled Promise Rejection'
      );
    } catch (e) {
      console.error('Erro no tratador unhandledrejection:', e);
    }
  });

  // Captura exceções globais de script
  window.addEventListener('error', (event) => {
    try {
      // Ignora erros de extensões externas ou redimensionamento irrelevante
      if (event.message?.includes('ResizeObserver loop') || event.filename?.includes('extension:')) {
        return;
      }

      reportError(
        'Exceção Não Tratada no Sistema',
        event.error || event.message,
        event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : 'Global Error'
      );
    } catch (e) {
      console.error('Erro no tratador global window.error:', e);
    }
  });
}
