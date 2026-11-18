import { CompanySettings, Quote } from '../types';
import { generateProposalEmailHtml } from './aiEmailParser';

/**
 * Gera o arquivo binário em Base64 do PDF oficial da proposta para anexo no envio de e-mails.
 * Utiliza captura direta via html2canvas e montagem de páginas A4 em alta definição com jsPDF.
 */
export async function generateQuotePdfBase64(
  quote: Quote,
  settings: CompanySettings,
  clientLogoDataUrl?: string
): Promise<{ filename: string; base64: string }> {
  // Carrega html2canvas e jsPDF dinamicamente para manter o bundle principal leve
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf')
  ]);

  const cleanCode = (quote.code || 'proposta').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Proposta-Comercial-${cleanCode}.pdf`;

  // 1. Tenta capturar a réplica exata do DOM que o usuário está visualizando na tela
  const livePreviewEl = document.getElementById('quote-preview-document');
  let targetEl: HTMLElement;

  if (livePreviewEl) {
    targetEl = livePreviewEl.cloneNode(true) as HTMLElement;
    targetEl.id = 'quote-pdf-render-clone';
    targetEl.style.boxShadow = 'none';
    targetEl.style.border = 'none';
    targetEl.style.borderRadius = '0';
    targetEl.style.margin = '0';
  } else {
    const proposalHtml = generateProposalEmailHtml(quote, settings, {
      clientLogoUrl: clientLogoDataUrl,
      forEmailSend: false
    });
    targetEl = document.createElement('div');
    targetEl.id = 'quote-pdf-render-fallback';
    targetEl.innerHTML = proposalHtml;
    targetEl.style.width = '21cm';
    targetEl.style.fontFamily = 'Verdana, Geneva, sans-serif';
    targetEl.style.color = '#000000';
    targetEl.style.boxSizing = 'border-box';
  }

  // Posiciona de forma fixa no viewport com z-index negativo para não cobrir a tela do usuário,
  // mas com visibilidade e opacidade 100% ativas para que o html2canvas capture cada pixel perfeitamente.
  targetEl.style.position = 'fixed';
  targetEl.style.left = '0';
  targetEl.style.top = '0';
  targetEl.style.zIndex = '-9999';
  targetEl.style.backgroundColor = '#ffffff';
  targetEl.style.opacity = '1';
  targetEl.style.visibility = 'visible';
  targetEl.style.pointerEvents = 'none';
  document.body.appendChild(targetEl);

  try {
    // 2. Garante que todas as imagens (logomarca, fotos dos produtos, ícones) estejam 100% carregadas
    const images = Array.from(targetEl.querySelectorAll('img'));
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

    // Pausa breve para renderização de fontes e layout computado
    await new Promise(r => setTimeout(r, 120));

    // 3. Captura o elemento em alta definição (escala 2x para máxima nitidez de impressão)
    const canvas = await html2canvas(targetEl, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: 794
    });

    // 4. Monta o PDF folha por folha (A4: 210mm x 297mm)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pdfWidth = 210;
    const pdfHeight = 297;
    // Altura em pixels do canvas correspondente a 1 folha A4 proporcional
    const pageCanvasHeight = Math.floor((pdfHeight * canvas.width) / pdfWidth);

    let renderedHeight = 0;
    let pageNumber = 0;

    while (renderedHeight < canvas.height) {
      const sliceHeight = Math.min(pageCanvasHeight, canvas.height - renderedHeight);

      // Canvas individual da página atual
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;

      const ctx = pageCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0, renderedHeight, canvas.width, sliceHeight,
          0, 0, canvas.width, sliceHeight
        );
      }

      const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.98);
      const sliceHeightInMm = (sliceHeight * pdfWidth) / canvas.width;

      if (pageNumber > 0) {
        pdf.addPage('a4', 'portrait');
      }
      pdf.addImage(pageImgData, 'JPEG', 0, 0, pdfWidth, sliceHeightInMm, undefined, 'FAST');

      renderedHeight += pageCanvasHeight;
      pageNumber += 1;
    }

    const dataUriString = pdf.output('datauristring');
    const base64 = (dataUriString || '').split(',')[1] || dataUriString;

    return {
      filename,
      base64
    };
  } finally {
    if (document.body.contains(targetEl)) {
      document.body.removeChild(targetEl);
    }
  }
}
