/**
 * Ativa e garante a verificacao ortografica nativa (spellcheck) em portugues (pt-BR)
 * em todos os inputs, textareas e campos editaveis de todo o sistema.
 */
export function initGlobalSpellcheck(): void {
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
    document.querySelectorAll<HTMLElement>('input, textarea, [contenteditable]').forEach(enableSpellcheck);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAll);
  } else {
    applyAll();
  }

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

  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            enableSpellcheck(el);
            el.querySelectorAll?.<HTMLElement>('input, textarea, [contenteditable]').forEach(enableSpellcheck);
          }
        });
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
}
