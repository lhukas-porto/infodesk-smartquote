import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GlobalErrorToaster } from './components/GlobalErrorToaster';
import { initGlobalErrorListeners } from './services/errorReporter';
import { initGlobalSpellcheck } from './utils/spellcheckEnforcer';
import './index.css';

// Diretriz do Lucas: Tolerância Zero a Erros Silenciosos
// Inicializa capturador global de erros e rejeições não tratadas
initGlobalErrorListeners();

// Auto-recuperação transparente quando uma nova versão é publicada na Vercel
// (evita Failed to fetch dynamically imported module após deploys)
window.addEventListener('vite:preloadError', (event) => {
  console.warn('Vite detectou módulo dinâmico desatualizado após deploy. Recarregando aplicação...', event);
  const hasRetried = sessionStorage.getItem('sq_vite_preload_retry');
  if (!hasRetried) {
    sessionStorage.setItem('sq_vite_preload_retry', 'true');
    window.location.reload();
  }
});

// Ativa o corretor ortográfico pt-BR nativo em todos os campos de texto do sistema
initGlobalSpellcheck();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <GlobalErrorToaster />
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
