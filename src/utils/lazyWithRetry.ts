import React from 'react';

/**
 * Carrega componentes dinâmicos (React.lazy) com resiliência contra atualizações de versão (deploys).
 * Quando uma nova versão sobe na Vercel, chunks antigos são substituídos por novos hashes.
 * Se o navegador do usuário tentar buscar um hash antigo que não existe mais (404),
 * este utilitário detecta a falha de carregamento dinâmico e faz um reload transparente
 * da página para carregar o bundle mais recente automaticamente.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    const pageHasBeenForceRefreshed = sessionStorage.getItem('sq_chunk_retry');

    try {
      const component = await componentImport();
      // Se carregou com sucesso, limpa a flag da sessão
      sessionStorage.removeItem('sq_chunk_retry');
      return component;
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      const isChunkError =
        errorMsg.includes('Failed to fetch dynamically imported module') ||
        errorMsg.includes('Importing a module script failed') ||
        errorMsg.includes('error loading dynamically imported module') ||
        error?.name === 'ChunkLoadError';

      if (isChunkError && !pageHasBeenForceRefreshed) {
        sessionStorage.setItem('sq_chunk_retry', 'true');
        console.warn('SmartQuote: Novo deploy detectado na Vercel com chunk desatualizado. Recarregando página...');
        window.location.reload();
        // Retorna promessa que não resolve para não jogar erro na UI enquanto a página recarrega
        return new Promise<{ default: T }>(() => {});
      }

      // Se já recarregou uma vez e persistiu ou é outro erro, libera para o ErrorBoundary
      sessionStorage.removeItem('sq_chunk_retry');
      throw error;
    }
  });
}

declare const __APP_BUILD_ID__: string | undefined;

const AUTO_RELOAD_STORAGE_KEY = 'sq_last_auto_reload_build_id';

function isUserCurrentlyBusy(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (Boolean((window as any).__INFODESK_SCANNER_BUSY__)) return true;

  const activeEl = document.activeElement;
  if (activeEl) {
    const tag = activeEl.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (activeEl as HTMLElement).isContentEditable) {
      return true;
    }
  }
  return false;
}

/**
 * Monitora silenciosamente se uma nova versão do sistema foi publicada na Vercel (/version.json).
 * Dispara SOMENTE 1 único refresh automático quando (e somente quando) o buildId remoto mudar,
 * aguardando o momento seguro caso o usuário esteja digitando ou com o Scanner em execução.
 */
export function startAutoVersionWatcher(onBeforeReload?: () => void): () => void {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return () => {};
  }

  const currentBuildId = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : '';
  if (!currentBuildId) {
    return () => {};
  }

  let pendingNewBuildId: string | null = null;
  let isChecking = false;
  let lastCheckTime = 0;

  const executeSafeReload = (targetBuildId: string) => {
    try {
      sessionStorage.setItem(AUTO_RELOAD_STORAGE_KEY, targetBuildId);
    } catch { /* ignore */ }
    try {
      onBeforeReload?.();
    } catch { /* ignore */ }
    window.location.reload();
  };

  const checkVersion = async (force: boolean = false) => {
    if (isChecking) return;
    if (typeof document !== 'undefined' && document.hidden && !force) return;

    const now = Date.now();
    if (!force && now - lastCheckTime < 15000) return;
    lastCheckTime = now;

    if (pendingNewBuildId) {
      if (!isUserCurrentlyBusy()) {
        executeSafeReload(pendingNewBuildId);
      }
      return;
    }

    isChecking = true;
    try {
      const res = await fetch(`/version.json?t=${now}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!res.ok) return;

      const data = await res.json();
      const remoteBuildId = data?.buildId ? String(data.buildId).trim() : '';
      if (!remoteBuildId || remoteBuildId === currentBuildId) {
        return;
      }

      // Garante que nunca recarregue mais de 1 vez para o mesmo buildId
      const alreadyReloadedFor = sessionStorage.getItem(AUTO_RELOAD_STORAGE_KEY);
      if (alreadyReloadedFor === remoteBuildId) {
        return;
      }

      if (!isUserCurrentlyBusy()) {
        executeSafeReload(remoteBuildId);
      } else {
        pendingNewBuildId = remoteBuildId;
      }
    } catch {
      // Silencioso se estiver offline temporariamente
    } finally {
      isChecking = false;
    }
  };

  const handleFocus = () => {
    checkVersion(true);
  };

  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && !document.hidden) {
      checkVersion(true);
    }
  };

  // Verifica logo após abrir e periodicamente (ou quando houver atualização pendente esperando o usuário soltar o teclado)
  const interval = window.setInterval(() => {
    if (pendingNewBuildId) {
      if (!isUserCurrentlyBusy()) {
        executeSafeReload(pendingNewBuildId);
      }
    } else {
      checkVersion(false);
    }
  }, 45000);

  const pendingRetryInterval = window.setInterval(() => {
    if (pendingNewBuildId && !isUserCurrentlyBusy()) {
      executeSafeReload(pendingNewBuildId);
    }
  }, 3000);

  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Checagem inicial 3s após carregar a aba (caso o index.html estivesse em cache local do navegador no computador do escritório)
  const initialTimer = window.setTimeout(() => checkVersion(true), 3000);

  return () => {
    window.clearInterval(interval);
    window.clearInterval(pendingRetryInterval);
    window.clearTimeout(initialTimer);
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
