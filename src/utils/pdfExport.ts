import { CompanySettings, Quote } from '../types';
import { generateProposalEmailHtml } from './aiEmailParser';

/**
 * Gera o arquivo binário em Base64 do PDF oficial da proposta para anexo no envio de e-mails.
 * Utiliza o mesmo HTML fiel e calibrado em folha A4 com Verdana e dados fiscais da Infodesk.
 */
export async function generateQuotePdfBase64(
  quote: Quote,
  settings: CompanySettings,
  clientLogoDataUrl?: string
): Promise<{ filename: string; base64: string }> {
  // Carrega dinamicamente html2pdf para manter o bundle principal leve
  const html2pdfModule = await import('html2pdf.js');
  const html2pdf = (html2pdfModule as any).default || html2pdfModule;

  const proposalHtml = generateProposalEmailHtml(quote, settings, {
    clientLogoUrl: clientLogoDataUrl,
    forEmailSend: false
  });

  const container = document.createElement('div');
  container.innerHTML = proposalHtml;
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '210mm';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#000000';
  container.style.fontFamily = 'Verdana, Geneva, sans-serif';
  container.style.boxSizing = 'border-box';
  document.body.appendChild(container);

  const cleanCode = (quote.code || 'proposta').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Proposta-Comercial-${cleanCode}.pdf`;

  const opt = {
    margin: [7.5, 13.2, 4.5, 20.0], // mm: [top, right, bottom, left]
    filename: filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    const pdfDataUriString = await html2pdf()
      .from(container)
      .set(opt)
      .outputPdf('datauristring');

    const base64 = (pdfDataUriString || '').split(',')[1] || pdfDataUriString;

    return {
      filename,
      base64
    };
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}
