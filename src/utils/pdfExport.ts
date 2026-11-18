import { CompanySettings, Quote } from '../types';
import { generateProposalEmailHtml } from './aiEmailParser';

/**
 * Gera o arquivo binário em Base64 do PDF oficial da proposta para anexo no envio de e-mails.
 * Utiliza o mesmo documento fiel, calibrado em folha A4 com Verdana e dados fiscais da Infodesk.
 */
export async function generateQuotePdfBase64(
  quote: Quote,
  settings: CompanySettings,
  clientLogoDataUrl?: string
): Promise<{ filename: string; base64: string }> {
  // Carrega dinamicamente html2pdf para manter o bundle principal leve
  const html2pdfModule = await import('html2pdf.js');
  const html2pdf = (html2pdfModule as any).default || html2pdfModule;

  const cleanCode = (quote.code || 'proposta').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Proposta-Comercial-${cleanCode}.pdf`;

  // Tenta capturar a réplica exata do DOM que o usuário está visualizando na tela
  const livePreviewEl = document.getElementById('quote-preview-document');
  let renderEl: HTMLElement;

  if (livePreviewEl) {
    // Clona o elemento para não interferir na tela do usuário
    renderEl = livePreviewEl.cloneNode(true) as HTMLElement;
    renderEl.id = 'quote-pdf-render-clone';
    renderEl.style.boxShadow = 'none';
    renderEl.style.border = 'none';
    renderEl.style.borderRadius = '0';
    renderEl.style.margin = '0';
  } else {
    // Se invocado sem pré-visualização ativa, monta o container a partir do HTML oficial
    const proposalHtml = generateProposalEmailHtml(quote, settings, {
      clientLogoUrl: clientLogoDataUrl,
      forEmailSend: false
    });
    renderEl = document.createElement('div');
    renderEl.id = 'quote-pdf-render-fallback';
    renderEl.innerHTML = proposalHtml;
    renderEl.style.width = '21cm';
    renderEl.style.fontFamily = 'Verdana, Geneva, sans-serif';
    renderEl.style.color = '#000000';
    renderEl.style.boxSizing = 'border-box';
  }

  // REGRA CRÍTICA: NUNCA usar left: -9999px porque o html2canvas não renderiza elementos fora do viewport.
  // Usamos position: fixed no topo esquerdo (0, 0) com z-index: -9999 para que o elemento fique
  // dentro das coordenadas reais do viewport da janela, mas totalmente oculto atrás da interface do usuário.
  renderEl.style.position = 'fixed';
  renderEl.style.left = '0';
  renderEl.style.top = '0';
  renderEl.style.zIndex = '-9999';
  renderEl.style.backgroundColor = '#ffffff';
  renderEl.style.opacity = '1';
  renderEl.style.visibility = 'visible';
  renderEl.style.pointerEvents = 'none';
  document.body.appendChild(renderEl);

  try {
    // Garante que todas as imagens (logomarca, ícones, fotos de produtos) estejam 100% carregadas antes do snapshot
    const images = Array.from(renderEl.querySelectorAll('img'));
    await Promise.all(
      images.map(img => {
        if (img.complete && img.naturalWidth !== 0) return Promise.resolve(true);
        return new Promise(resolve => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          setTimeout(() => resolve(false), 2500); // Timeout de segurança
        });
      })
    );

    // Breve pausa para acomodação de fontes e estilos computados pelo navegador
    await new Promise(r => setTimeout(r, 150));

    // Como o elemento já tem as margens A4 oficiais embutidas (padding 2cm esquerda, 1.32cm direita, 0.75cm topo, 0.45cm base),
    // o margin do jsPDF é 0 para evitar margens duplicadas ou espremidas
    const opt = {
      margin: 0,
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    const pdfDataUriString = await html2pdf()
      .from(renderEl)
      .set(opt)
      .outputPdf('datauristring');

    const base64 = (pdfDataUriString || '').split(',')[1] || pdfDataUriString;

    return {
      filename,
      base64
    };
  } finally {
    if (document.body.contains(renderEl)) {
      document.body.removeChild(renderEl);
    }
  }
}
