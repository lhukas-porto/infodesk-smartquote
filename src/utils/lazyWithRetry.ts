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
