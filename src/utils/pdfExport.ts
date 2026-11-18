import { CompanySettings, Quote } from '../types';
import { 
  formatCompanyPrefix, 
  formatContactPerson, 
  formatProposalValidityText, 
  shouldDisplayShippingInProposal,
  extractDeliveryExceptionDetails,
  escapeHtml 
} from './aiEmailParser';
import { resolveClientLogoBase64, generateInitialsAvatarPngDataUrl } from './clientLogoEmailHelper';

interface A4PageSlice {
  pageNumber: number;
  totalPages: number;
  isFirstPage: boolean;
  isLastPage: boolean;
  items: any[];
  spacers: {
    spacerAfterConditions: number;
    spacerAfterDate: number;
    spacerBeforeFooter: number;
  };
}

/**
 * Divide os itens e blocos da proposta em páginas A4 exatas, simulando o motor de impressão do navegador.
 * Evita que linhas de produtos sejam cortadas ao meio ou que páginas em branco sejam criadas.
 */
function paginateQuoteForA4(quote: Quote): A4PageSlice[] {
  // Altura útil segura de 1 folha A4 (29.7cm = 1122.5px menos margens superior/inferior de 45px)
  const PAGE_CAPACITY_PX = 1045;
  
  // Elementos fixos da Página 1
  const headerHeight = 98; // Infodesk logo oficial (78px) + margem inferior (20px)
  const clientHeight = 85; // Bloco do cliente com logo (4 linhas + respiro)
  const introHeight = 48; // Parágrafo de abertura formal
  const preTableHeight = headerHeight + clientHeight + introHeight; // ~231px
  const tableHeaderHeight = 32;

  // Bloco de encerramento da última página
  let conditionsHeight = 26 + (4 * 20);
  if (shouldDisplayShippingInProposal(quote) && quote?.shippingTerms) {
    conditionsHeight += 20;
  }
  const obs = (quote?.observations || quote?.notes || '').trim();
  if (obs) {
    const obsLines = obs.split(/\r?\n/).length;
    conditionsHeight += Math.max(1, obsLines) * 20 + 6;
  }
  const dateTextHeight = 20;
  const signatureTextHeight = 58;
  const footerHeight = 65;
  const baseClosingHeight = conditionsHeight + dateTextHeight + signatureTextHeight + footerHeight; // ~249px
  const minClosingTotal = baseClosingHeight + 45; // Inclui espaçadores mínimos

  const rawItems = (quote?.items || []).filter((it: any) => !it.isOptional);

  // Calcula altura de cada linha com base no conteúdo e imagem
  const getItemHeight = (item: any) => {
    const hasImage = Boolean(item.showImage && item.imageUrl);
    const nameLength = (item.name || '').length;
    return hasImage ? (nameLength > 50 ? 140 : 125) : (nameLength > 50 ? 38 : 28);
  };

  const pages: A4PageSlice[] = [];
  let currentItems: any[] = [];
  let currentOccupied = preTableHeight + tableHeaderHeight;
  let pageIndex = 1;

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    const h = getItemHeight(item);
    const isLastItem = (i === rawItems.length - 1);

    // Se este for o último item da proposta e já tivermos 3+ itens na Página 1,
    // mas o bloco de encerramento NÃO couber na Página 1 junto com ele:
    // guardamos este item para liderar a Página 2 com o encerramento harmonioso.
    const wouldLeaveClosingOrphanOnNextPage = 
      isLastItem && 
      pageIndex === 1 && 
      currentItems.length >= 3 && 
      (currentOccupied + h + minClosingTotal > PAGE_CAPACITY_PX);

    if (pageIndex === 1) {
      if (!wouldLeaveClosingOrphanOnNextPage && (currentOccupied + h <= PAGE_CAPACITY_PX)) {
        currentItems.push(item);
        currentOccupied += h;
      } else {
        pages.push({
          pageNumber: 1,
          totalPages: 1,
          isFirstPage: true,
          isLastPage: false,
          items: currentItems,
          spacers: { spacerAfterConditions: 24, spacerAfterDate: 16, spacerBeforeFooter: 28 }
        });
        pageIndex = 2;
        currentItems = [item];
        currentOccupied = tableHeaderHeight + h;
      }
    } else {
      if (currentOccupied + h <= PAGE_CAPACITY_PX) {
        currentItems.push(item);
        currentOccupied += h;
      } else {
        pages.push({
          pageNumber: pageIndex,
          totalPages: pageIndex,
          isFirstPage: false,
          isLastPage: false,
          items: currentItems,
          spacers: { spacerAfterConditions: 24, spacerAfterDate: 16, spacerBeforeFooter: 28 }
        });
        pageIndex += 1;
        currentItems = [item];
        currentOccupied = tableHeaderHeight + h;
      }
    }
  }

  // Verifica se o bloco de encerramento cabe na página atual
  if (currentOccupied + minClosingTotal <= PAGE_CAPACITY_PX) {
    const freeSpace = Math.max(0, PAGE_CAPACITY_PX - (currentOccupied + minClosingTotal));
    const isSingle = (pages.length === 0);
    const spacers = isSingle ? {
      spacerAfterConditions: Math.max(20, Math.min(55, 20 + Math.round(freeSpace * 0.35))),
      spacerAfterDate: Math.max(14, Math.min(32, 14 + Math.round(freeSpace * 0.22))),
      spacerBeforeFooter: Math.max(24, Math.min(80, 24 + Math.round(freeSpace * 0.43)))
    } : {
      spacerAfterConditions: Math.max(24, Math.min(110, 24 + Math.round(freeSpace * 0.30))),
      spacerAfterDate: Math.max(16, Math.min(50, 16 + Math.round(freeSpace * 0.18))),
      spacerBeforeFooter: Math.max(28, Math.min(260, 28 + Math.round(freeSpace * 0.52)))
    };

    pages.push({
      pageNumber: pageIndex,
      totalPages: pageIndex,
      isFirstPage: isSingle,
      isLastPage: true,
      items: currentItems,
      spacers
    });
  } else {
    // Encerramento precisa de uma folha final exclusiva
    pages.push({
      pageNumber: pageIndex,
      totalPages: pageIndex,
      isFirstPage: (pages.length === 0),
      isLastPage: false,
      items: currentItems,
      spacers: { spacerAfterConditions: 24, spacerAfterDate: 16, spacerBeforeFooter: 28 }
    });

    pageIndex += 1;
    const freeSpace = Math.max(0, PAGE_CAPACITY_PX - minClosingTotal);
    const spacers = {
      spacerAfterConditions: Math.max(24, Math.min(110, 24 + Math.round(freeSpace * 0.30))),
      spacerAfterDate: Math.max(16, Math.min(50, 16 + Math.round(freeSpace * 0.18))),
      spacerBeforeFooter: Math.max(28, Math.min(260, 28 + Math.round(freeSpace * 0.52)))
    };

    pages.push({
      pageNumber: pageIndex,
      totalPages: pageIndex,
      isFirstPage: false,
      isLastPage: true,
      items: [],
      spacers
    });
  }

  // Atualiza totalPages em todas as fatias
  const total = pages.length;
  pages.forEach(p => { p.totalPages = total; });

  return pages;
}

/**
 * Renderiza o HTML oficial de 1 página A4 específica para captura fotográfica.
 */
function renderA4SheetHtml(
  page: A4PageSlice,
  quote: Quote,
  settings: CompanySettings,
  clientLogoUrl?: string
): string {
  const clientCompanyFormatted = escapeHtml(formatCompanyPrefix(quote.clientCompany));
  const contactPersonFormatted = escapeHtml(formatContactPerson(quote.contactPerson));
  const cleanPhone = escapeHtml((settings.phone || '61 3033-5373').replace(/[()]/g, '').trim());
  const cleanWhatsapp = (settings.whatsapp || '61 9 9627-2630').replace(/\D/g, '');
  const formattedWhatsapp = escapeHtml((settings.whatsapp || '61 9 9627-2630').replace(/[()]/g, '').trim());
  const excDetails = extractDeliveryExceptionDetails(quote.deliveryDays);

  const fallbackIntro = 'Em atenção à solicitação de Vossa Senhoria, temos a grata satisfação de submeter à apreciação a nossa proposta de preços para fornecimento dos produtos relacionados a seguir:';
  const openingText = (quote.openingText && quote.openingText.trim()) || (settings.defaultOpeningText && settings.defaultOpeningText.trim()) || fallbackIntro;

  const formattedShipping = (shouldDisplayShippingInProposal(quote) && quote.shippingTerms)
    ? (quote.shippingTerms.toLowerCase().startsWith('frete')
        ? quote.shippingTerms
        : `Frete: ${quote.shippingTerms}`)
    : '';

  const cleanObs = (quote.observations || quote.notes || '').trim().replace(/^(obs(\.|ervação|ervações)?\s*:\s*)/i, '').trim();

  const itemsHtml = page.items.map((item: any) => {
    const isException = excDetails.hasException && excDetails.itemNumbers.includes(item.itemNumber);
    const hasImage = item.showImage && item.imageUrl;
    const safeItemName = escapeHtml(item.name);
    const safeImageUrl = (item.imageUrl || '').startsWith('data:')
      ? item.imageUrl
      : encodeURI(item.imageUrl || '');

    return `
      <tr style="background: #ffffff;">
        <td style="border: 0.5pt solid #000000; padding: 4px; width: 6%; text-align: center; vertical-align: middle; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
          ${escapeHtml(item.itemNumber)}
        </td>
        <td style="border: 0.5pt solid #000000; padding: 6px 8px; width: 46%; text-align: left; vertical-align: middle; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
          <div style="font-weight: normal; color: #000000;">
            ${safeItemName}
            ${isException ? `<span style="font-size: 8pt; color: #b45309; font-weight: bold; margin-left: 6px;">(Prazo diferenciado: ${escapeHtml(excDetails.days)} dias úteis)</span>` : ''}
          </div>
          ${hasImage ? `
            <div style="margin-top: 6px; margin-bottom: 4px;">
              <img src="${safeImageUrl}" alt="${safeItemName}" style="max-width: 130px; max-height: 95px; width: auto; height: auto; object-fit: contain; display: block;" />
            </div>
          ` : ''}
        </td>
        <td style="border: 0.5pt solid #000000; padding: 4px; width: 6%; text-align: center; vertical-align: middle; white-space: nowrap; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
          ${escapeHtml(item.quantity)}
        </td>
        <td style="border: 0.5pt solid #000000; padding: 4px; width: 6%; text-align: center; vertical-align: middle; white-space: nowrap; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
          ${escapeHtml(item.unit || 'Un.')}
        </td>
        <td style="border: 0.5pt solid #000000; padding: 4px; width: 18%; text-align: center; vertical-align: middle; white-space: nowrap; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
          R$ ${Number(item.unitPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td style="border: 0.5pt solid #000000; padding: 4px; width: 18%; text-align: center; vertical-align: middle; white-space: nowrap; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
          R$ ${Number(item.totalPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="a4-render-sheet" style="width: 21cm; height: 29.7cm; min-height: 29.7cm; max-height: 29.7cm; box-sizing: border-box; padding: 0.75cm 1.32cm 0.45cm 2.0cm; background: #ffffff; color: #000000; font-family: Verdana, Geneva, sans-serif; font-size: 10pt; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;">
      <div style="flex: 1; display: flex; flex-direction: column;">
        
        ${page.isFirstPage ? `
          <!-- Cabeçalho Infodesk Oficial -->
          <div style="margin-bottom: 24px; text-align: left;">
            <img src="/infodesk-logo.png" alt="Infodesk" style="width: 8.56cm; height: 2.08cm; object-fit: contain; display: block;" />
          </div>

          <!-- Destinatário com Logomarca do Cliente -->
          <div style="margin-bottom: 20px; display: flex; align-items: center; font-family: Verdana, Geneva, sans-serif;">
            ${clientLogoUrl ? `
              <div style="width: 1.45cm; height: 1.45cm; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 16px;">
                <img src="${clientLogoUrl}" alt="${clientCompanyFormatted}" style="width: 1.45cm; height: 1.45cm; max-width: 1.45cm; max-height: 1.45cm; object-fit: contain; display: block;" />
              </div>
            ` : ''}
            <div style="flex: 1; line-height: 1.4;">
              <p style="margin: 0; font-weight: bold; font-size: 11pt; color: #000000;">${clientCompanyFormatted}</p>
              <p style="margin: 0; font-weight: bold; font-size: 11pt; color: #000000;">${contactPersonFormatted}</p>
              <p style="margin: 4px 0 0 0; font-size: 8pt; font-weight: bold; color: #000000;">E-mail: <a href="mailto:${(quote.clientEmail || '').toLowerCase()}" style="color: #0000ee; text-decoration: underline;">${(quote.clientEmail || '').toLowerCase()}</a></p>
              ${quote.clientPhone ? `<p style="margin: 2px 0 0 0; font-size: 8pt; font-weight: bold; color: #000000;">Telefone: ${escapeHtml(quote.clientPhone)}</p>` : ''}
            </div>
          </div>

          <!-- Parágrafo de Abertura -->
          <p style="text-align: justify; text-indent: 1.25cm; margin-bottom: 16px; font-size: 9pt; line-height: 1.35; color: #000000;">
            ${escapeHtml(openingText)}
          </p>
        ` : ''}

        ${page.items.length > 0 ? `
          <!-- Tabela de Produtos desta Página -->
          <table style="width: 100%; border-collapse: collapse; font-family: Verdana, Geneva, sans-serif; font-size: 10pt; margin-bottom: 16px;">
            <thead>
              <tr style="background: #ffffff; font-weight: bold; font-size: 8.5pt;">
                <th style="border: 0.5pt solid #000000; padding: 4px; width: 6%; text-align: center;">Item</th>
                <th style="border: 0.5pt solid #000000; padding: 4px 6px; width: 46%; text-align: center;">Descrição do Produto</th>
                <th style="border: 0.5pt solid #000000; padding: 4px; width: 6%; text-align: center;">Qtd.</th>
                <th style="border: 0.5pt solid #000000; padding: 4px; width: 6%; text-align: center;">Un.</th>
                <th style="border: 0.5pt solid #000000; padding: 4px; width: 18%; text-align: center;">Preço unit.</th>
                <th style="border: 0.5pt solid #000000; padding: 4px; width: 18%; text-align: center;">Preço total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        ` : ''}

        ${page.isLastPage ? `
          <!-- Condições Gerais -->
          <div style="font-family: Verdana, Geneva, sans-serif; font-size: 10pt; line-height: 1.5; color: #000000;">
            <p style="font-weight: bold; text-decoration: underline; font-size: 12pt; margin: 0 0 8px 0;">Condições gerais:</p>
            <p style="margin: 0 0 3px 0;">➤&nbsp; Validade da proposta: ${escapeHtml(formatProposalValidityText(quote.validityDays))}</p>
            <p style="margin: 0 0 3px 0;">➤&nbsp; Condições de pagamento: ${escapeHtml(quote.paymentTerms || 'Faturado.')}</p>
            <p style="margin: 0 0 3px 0;">➤&nbsp; Prazo de entrega: ${escapeHtml(quote.deliveryDays || 'Pronta Entrega')}</p>
            <p style="margin: 0 0 3px 0;">➤&nbsp; Garantia: ${escapeHtml(quote.warrantyTerms || '06 meses')}</p>
            ${formattedShipping ? `<p style="margin: 0 0 3px 0; font-weight: bold;">➤&nbsp; ${escapeHtml(formattedShipping)}</p>` : ''}
            ${cleanObs ? `<p style="margin: 0 0 3px 0; font-weight: bold; white-space: pre-line;">➤&nbsp; <strong style="font-weight: bold;">Obs:</strong> <strong style="font-weight: bold;">${escapeHtml(cleanObs)}</strong></p>` : ''}
          </div>

          <!-- Data e Assinatura -->
          <div style="display: flex; flex-direction: column; align-items: flex-end; text-align: right; margin-left: auto; color: #000000; margin-top: ${page.spacers.spacerAfterConditions}px;">
            <p style="margin: 0; font-size: 10pt;">${escapeHtml(quote.city || (settings.cityState ? settings.cityState.split('-')[0].trim() : 'Brasília'))}, ${escapeHtml(quote.date)}.</p>
            <div style="margin-top: ${page.spacers.spacerAfterDate}px; text-align: right; font-size: 10pt;">
              <p style="margin: 0 0 2px 0; font-weight: normal; color: #000000;">${escapeHtml(settings.representativeName || 'Lucas Porto')}</p>
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; margin-top: 2px;">
                <img src="/phone-icon.png" alt="Telefone" style="width: 14px; height: 14px; object-fit: contain; display: inline-block;" />
                <span style="font-size: 10pt; color: #000000;">${cleanPhone}</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; margin-top: 2px;">
                <img src="/whatsapp-icon.png" alt="WhatsApp" style="width: 14px; height: 14px; object-fit: contain; display: inline-block;" />
                <a href="https://api.whatsapp.com/send?phone=55${cleanWhatsapp}" style="color: #0000ee; text-decoration: underline; font-size: 10pt;">${formattedWhatsapp}</a>
              </div>
            </div>
          </div>
        ` : ''}

      </div>

      ${page.isLastPage ? `
        <!-- Rodapé Fiscal Fixo na Base da Folha -->
        <div style="border-top: 0.5pt solid #000000; padding-top: 8px; padding-bottom: 4px; text-align: center; font-weight: bold; font-size: 9.5pt; color: #000000; font-family: Verdana, Geneva, sans-serif; flex-shrink: 0;">
          <p style="margin: 0; font-weight: bold; font-size: 9.5pt;">${escapeHtml(settings.companyName || 'Lucas Porto da Fonseca-ME')}</p>
          <p style="margin: 2px 0 0 0; font-weight: bold; font-size: 9.5pt;">${escapeHtml(settings.address || 'CLSW 304 Bloco A Sala 108 – Sudoeste')} – ${escapeHtml(settings.cityState || 'Brasília - DF')}</p>
          <p style="margin: 2px 0 0 0; font-weight: bold; font-size: 9.5pt; display: flex; align-items: center; justify-content: center; gap: 48px;">
            <span>CNPJ: ${escapeHtml(settings.cnpj || '15.266.716/0001-02')}</span>
            <span>I.E.: ${escapeHtml(settings.stateRegistration || '07.602.330/001-92')}</span>
          </p>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Gera o arquivo binário em Base64 do PDF oficial da proposta para anexo no envio de e-mails.
 * Utiliza fatiamento exato folha por folha (A4: 210mm x 297mm) com html2canvas e jsPDF,
 * garantindo paridade total com as regras de impressão manual sem cortes de linhas nem páginas extras.
 */
export async function generateQuotePdfBase64(
  quote: Quote,
  settings: CompanySettings,
  clientLogoDataUrl?: string
): Promise<{ filename: string; base64: string }> {
  // Carrega html2canvas e jsPDF sob demanda para manter o bundle leve
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf')
  ]);

  const cleanCode = (quote.code || 'proposta').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Proposta-Comercial-${cleanCode}.pdf`;

  // 1. Garante a melhor logomarca do cliente em Base64 Data URL (sem depender de CORS no html2canvas)
  let effectiveClientLogo: string | undefined = clientLogoDataUrl;
  if (!effectiveClientLogo || effectiveClientLogo.startsWith('http')) {
    try {
      const resolved = await resolveClientLogoBase64({
        name: quote.clientCompany,
        logoUrl: effectiveClientLogo || quote.clientLogoUrl,
        contacts: quote.clientEmail ? [{ email: quote.clientEmail }] : []
      });
      if (resolved && resolved.startsWith('data:')) {
        effectiveClientLogo = resolved;
      }
    } catch {
      // Falha silenciosa de logo, fallback mantido
    }
  }

  // Se ainda assim for uma URL HTTP externa ou indefinido, gera avatar oficial PNG em Base64 com as iniciais da empresa
  if ((!effectiveClientLogo || effectiveClientLogo.startsWith('http')) && quote.clientCompany) {
    const avatar = generateInitialsAvatarPngDataUrl(quote.clientCompany);
    if (avatar) effectiveClientLogo = avatar;
  }

  // 2. Divide a proposta nas páginas A4 oficiais
  const pages = paginateQuoteForA4(quote);

  // 3. Inicializa o documento jsPDF A4 retrato
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  // 4. Renderiza cada folha A4 individualmente
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const sheetWrapper = document.createElement('div');
    sheetWrapper.innerHTML = renderA4SheetHtml(page, quote, settings, effectiveClientLogo);
    const sheetEl = sheetWrapper.firstElementChild as HTMLElement;

    // Renderiza temporariamente no viewport em camada de fundo invisível
    sheetEl.style.position = 'fixed';
    sheetEl.style.left = '0';
    sheetEl.style.top = '0';
    sheetEl.style.zIndex = '-9999';
    sheetEl.style.backgroundColor = '#ffffff';
    sheetEl.style.opacity = '1';
    sheetEl.style.visibility = 'visible';
    sheetEl.style.pointerEvents = 'none';
    document.body.appendChild(sheetEl);

    try {
      // Garante carregamento das imagens desta folha
      const images = Array.from(sheetEl.querySelectorAll('img'));
      await Promise.all(
        images.map(img => {
          if (img.complete && img.naturalWidth !== 0) return Promise.resolve(true);
          return new Promise(resolve => {
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            setTimeout(() => resolve(false), 2000);
          });
        })
      );

      // Pequena pausa para acomodação de fontes
      await new Promise(r => setTimeout(r, 80));

      const canvas = await html2canvas(sheetEl, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: 794
      });

      if (i > 0) {
        pdf.addPage('a4', 'portrait');
      }

      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    } finally {
      if (document.body.contains(sheetEl)) {
        document.body.removeChild(sheetEl);
      }
    }
  }

  const dataUriString = pdf.output('datauristring');
  const base64 = (dataUriString || '').split(',')[1] || dataUriString;

  return {
    filename,
    base64
  };
}
