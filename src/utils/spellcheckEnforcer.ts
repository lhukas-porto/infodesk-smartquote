/**
 * Ativa e garante a verificacao ortografica nativa (spellcheck) em portugues (pt-BR)
 * em todos os inputs, textareas e campos editaveis de todo o sistema.
 * Otimizado para alto desempenho com zero impacto de memoria ou CPU.
 */
let isSpellcheckInitialized = false;

export function initGlobalSpellcheck(): void {
  if (isSpellcheckInitialized || typeof window === 'undefined') return;
  isSpellcheckInitialized = true;

  const enableSpellcheck = (el: HTMLElement | null) => {
    if (!el || !el.tagName) return;
    const isInput = el.tagName === 'INPUT';
    const isTextarea = el.tagName === 'TEXTAREA';
    const isEditable = el.isContentEditable;

    if (isInput) {
      const type = (el as HTMLInputElement).type?.toLowerCase();
      if (['password', 'file', 'checkbox', 'radio', 'hidden', 'submit', 'button', 'range', 'color'].includes(type)) {
        return;
      }
    }

    if (isInput || isTextarea || isEditable) {
      if (el.getAttribute('spellcheck') !== 'true') {
        el.setAttribute('spellcheck', 'true');
        (el as any).spellcheck = true;
      }
      if (el.getAttribute('lang') !== 'pt-BR') {
        el.setAttribute('lang', 'pt-BR');
      }
      if (el.getAttribute('autocorrect') !== 'on') {
        el.setAttribute('autocorrect', 'on');
      }
    }
  };

  const applyAll = () => {
    if (typeof document === 'undefined') return;
    document.querySelectorAll<HTMLElement>('input, textarea, [contenteditable]').forEach(enableSpellcheck);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAll, { once: true });
  } else {
    applyAll();
  }

  // Delegação instantânea por eventos: quando o usuário clica ou foca em qualquer campo
  window.addEventListener('focusin', (e) => {
    enableSpellcheck(e.target as HTMLElement);
  }, true);

  window.addEventListener('mousedown', (e) => {
    enableSpellcheck(e.target as HTMLElement);
  }, true);

  window.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement;
    enableSpellcheck(target);
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      if (document.activeElement !== target && typeof target.focus === 'function') {
        target.focus();
      }
    }
  }, true);

  // Observador com debounce de 1.5s que só executa quando novos nós são adicionados ao DOM
  if (typeof MutationObserver !== 'undefined' && document.body) {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver((mutations) => {
      const hasAddedNodes = mutations.some(m => m.addedNodes.length > 0);
      if (!hasAddedNodes) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        applyAll();
        debounceTimer = null;
      }, 1500);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

