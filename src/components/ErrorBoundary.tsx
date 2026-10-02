import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2, Copy, Check, Sparkles } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, errorInfo: null, copied: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturou um erro:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    try {
      sessionStorage.removeItem('sq_chunk_retry');
      sessionStorage.removeItem('sq_vite_preload_retry');

      if (this.state.error?.message?.toLowerCase().includes('quota')) {
        // Higieniza infodesk_products caso tenha imagens base64 gigantes que estouraram o armazenamento
        try {
          const prodsRaw = localStorage.getItem('infodesk_products');
          if (prodsRaw) {
            const prods = JSON.parse(prodsRaw);
            if (Array.isArray(prods)) {
              const cleaned = prods.map((p: any) => ({
                ...p,
                imageUrl: p.imageUrl && !p.imageUrl.startsWith('data:image/') ? p.imageUrl : ''
              }));
              localStorage.setItem('infodesk_products', JSON.stringify(cleaned));
            }
          }
        } catch {
          try { localStorage.removeItem('infodesk_products'); } catch { /* noop */ }
        }

        localStorage.removeItem('infodesk_current_draft_quote');
        localStorage.removeItem('infodesk_emails');
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('infodesk_backup_items_') || k.startsWith('infodesk_price_cache_'))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      }
    } catch (e) {
      console.error(e);
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  private handleClearCacheAndReset = () => {
    try {
      try {
        const prodsRaw = localStorage.getItem('infodesk_products');
        if (prodsRaw) {
          const prods = JSON.parse(prodsRaw);
          if (Array.isArray(prods)) {
            const cleaned = prods.map((p: any) => ({
              ...p,
              imageUrl: p.imageUrl && !p.imageUrl.startsWith('data:image/') ? p.imageUrl : ''
            }));
            localStorage.setItem('infodesk_products', JSON.stringify(cleaned));
          }
        }
      } catch {
        try { localStorage.removeItem('infodesk_products'); } catch { /* noop */ }
      }

      localStorage.removeItem('infodesk_current_draft_quote');
      localStorage.removeItem('infodesk_emails');
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('infodesk_backup_items_') || k.startsWith('infodesk_price_cache_'))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      console.error(e);
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  private handleCopyError = () => {
    const errorText = `[INFODESK SMARTQUOTE - ERRO VISUAL]
Mensagem: ${this.state.error?.message || String(this.state.error)}
URL: ${window.location.href}
Data: ${new Date().toISOString()}
Stack:
${this.state.error?.stack || 'Sem stack trace'}
ComponentStack:
${this.state.errorInfo?.componentStack || 'Sem component stack'}`;

    navigator.clipboard.writeText(errorText).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 3000);
    }).catch(() => {
      // Fallback simples
      alert('Erro copiado.');
    });
  };

  public render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || String(this.state.error || '');
      const isChunkLoadError =
        errorMessage.includes('Failed to fetch dynamically imported module') ||
        errorMessage.includes('Importing a module script failed') ||
        errorMessage.includes('error loading dynamically imported module') ||
        this.state.error?.name === 'ChunkLoadError';

      const isEmailRelated =
        errorMessage.toLowerCase().includes('email') ||
        (this.state.errorInfo?.componentStack || '').toLowerCase().includes('email');

      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-lg w-full shadow-lg text-center space-y-5">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${
              isChunkLoadError
                ? 'bg-sky-50 border border-sky-200 text-sky-600'
                : 'bg-amber-50 border border-amber-200 text-amber-600'
            }`}>
              {isChunkLoadError ? (
                <Sparkles className="w-7 h-7" />
              ) : (
                <AlertTriangle className="w-7 h-7" />
              )}
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">
                {isChunkLoadError
                  ? 'Nova Versão do SmartQuote Disponível!'
                  : isEmailRelated
                    ? 'Instabilidade na Leitura de E-mails'
                    : 'Ops! Ocorreu uma instabilidade visual'}
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                {isChunkLoadError
                  ? 'Uma nova versão do sistema acabou de ser publicada. Basta recarregar a tela para sincronizar os recursos mais recentes.'
                  : isEmailRelated
                    ? 'Um e-mail com formatação atípica ou dados incompletos impediu a exibição padrão da tela. O sistema de proteção recuperou o controle para evitar tela em branco.'
                    : 'Ocorreu uma falha inesperada ao processar esta tela. O sistema de proteção recuperou o controle para evitar tela em branco.'}
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left max-h-32 overflow-y-auto">
                <p className="text-[11px] font-mono text-red-600 break-words">
                  {errorMessage}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
              <button
                onClick={this.handleReset}
                className="w-full sm:w-auto px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isChunkLoadError ? 'Atualizar Sistema Agora' : 'Recarregar Tela'}</span>
              </button>

              <button
                onClick={this.handleCopyError}
                className="w-full sm:w-auto px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                title="Copiar mensagem técnica e stack trace para o desenvolvedor"
              >
                {this.state.copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-bold">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copiar Erro</span>
                  </>
                )}
              </button>

              {isEmailRelated && (
                <button
                  onClick={this.handleClearCacheAndReset}
                  className="w-full sm:w-auto px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Limpa os e-mails em cache local e restaura os dados padrão"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Limpar Cache de E-mails</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
