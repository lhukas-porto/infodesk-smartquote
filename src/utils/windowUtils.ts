/**
 * Utilitário para abertura de links externos em uma NOVA JANELA independente.
 * 
 * Garante que:
 * 1. O link abra em uma nova janela do navegador (e não apenas numa aba secundária),
 *    permitindo manter o SmartQuote visível simultaneamente ou em monitores separados.
 * 2. URLs sem protocolo (ex: "mercadolivre.com.br") recebam automaticamente o prefixo "https://",
 *    evitando erros de navegação relativa.
 * 3. Cliques com teclas modificadoras (Ctrl/Cmd/Shift) continuem respeitando a preferência nativa.
 */

export function sanitizeExternalUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function openInNewWindow(rawUrl?: string | null, event?: React.MouseEvent): void {
  if (event) {
    // Se o usuário clicar com Ctrl, Cmd ou Shift, permite o comportamento nativo de abas
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    event.preventDefault();
  }

  const cleanUrl = sanitizeExternalUrl(rawUrl);
  if (!cleanUrl) return;

  try {
    const screenW = typeof window !== 'undefined' && window.screen ? (window.screen.availWidth || 1366) : 1366;
    const screenH = typeof window !== 'undefined' && window.screen ? (window.screen.availHeight || 768) : 768;

    // Dimensões generosas e confortáveis para navegar na loja/fornecedor
    const width = Math.min(1360, Math.max(880, Math.round(screenW * 0.85)));
    const height = Math.min(960, Math.max(640, Math.round(screenH * 0.9)));
    const left = Math.max(0, Math.round((screenW - width) / 2));
    const top = Math.max(0, Math.round((screenH - height) / 2));

    const windowFeatures = `popup=yes,width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=yes,toolbar=yes,menubar=no,location=yes`;

    const newWindow = window.open(cleanUrl, '_blank', windowFeatures);
    if (!newWindow) {
      // Fallback se o navegador bloquear janelas popup com dimensões
      window.open(cleanUrl, '_blank', 'noopener,noreferrer');
    } else {
      newWindow.focus();
    }
  } catch (err) {
    // Fallback de segurança garantindo abertura
    window.open(cleanUrl, '_blank', 'noopener,noreferrer');
  }
}
