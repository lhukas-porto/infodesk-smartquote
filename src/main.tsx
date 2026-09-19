import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initGlobalSpellcheck } from './utils/spellcheckEnforcer';
import './index.css';

// Ativa o corretor ortográfico pt-BR nativo em todos os campos de texto do sistema
initGlobalSpellcheck();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
