import { CompanySettings, Quote } from '../types';
import { 
  formatCompanyPrefix, 
  formatContactPerson, 
  formatProposalValidityText, 
  shouldDisplayShippingInProposal,
  extractDeliveryExceptionDetails,
  escapeHtml 
} from './aiEmailParser';
import { resolveClientLogoBase64, generateInitialsAvatarPngDataUrl, fetchImageToDataUrl } from './clientLogoEmailHelper';
import { findProductImageInCache, saveProductImageToCache } from './storage';

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
 * Converte qualquer caminho relativo ou recurso local (ex: /infodesk-logo.png) em Data URL Base64
 * para eliminar 100% de dependência de rede ou latência durante a captura do html2canvas.
 */
async function getAssetAsBase64(path: string): Promise<string> {
  if (typeof window === 'undefined') return path;
  try {
    const res = await fetch(path);
    if (!res.ok) return path;
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || path);
      reader.onerror = () => resolve(path);
      reader.readAsDataURL(blob);
    });
  } catch {
    return path;
  }
}

/**
 * Resolve e converte a imagem do produto para Base64 Data URL, garantindo que
 * o html2canvas nunca omita a foto por políticas de CORS em canvas.
 */
async function resolveItemImageBase64(item: any): Promise<string | null> {
  if (!item.imageUrl || !item.imageUrl.trim()) {
    const cached = findProductImageInCache(item.name, item.partNumber);
    return cached || null;
  }
  const url = item.imageUrl.trim();
  if (url.startsWith('data:image/')) return url;

  // 1. Tenta cache local persistente
  const cached = findProductImageInCache(item.name, item.partNumber);
  if (cached && cached.startsWith('data:image/')) return cached;

  // 2. Converte via proxy oficial ou fetch do cliente
  try {
    const converted = await fetchImageToDataUrl(url, 3500);
    if (converted && converted.startsWith('data:image/')) {
      saveProductImageToCache({ name: item.name, partNumber: item.partNumber }, converted, true);
      return converted;
    }
  } catch {
    // fallback para url original
  }

  return url;
}

/**
 * Divide os itens e blocos da proposta em páginas A4 exatas, simulando o motor de impressão do navegador.
 * Evita que linhas de produtos sejam cortadas ao meio ou que páginas em branco sejam criadas.
 */
function paginateQuoteForA4(quote: Quote): A4PageSlice[] {
  // Altura útil segura de 1 folha A4 (29.7cm = 1122.5px menos margens superior/inferior de 45px)
  const PAGE_CAPACITY_PX = 1045;
  
  // Elementos fixos da Página 1
  const headerHeight = 98; // Infodesk logo oficial (79px) + margem inferior (20px)
  const clientHeight = 85; // Bloco do cliente com logo (4 linhas + respiro)
  const introHeight = 48; // Parágrafo de abertura formal
  const preTableHeight = headerHeight + clientHeight + introHeight; // ~231px
  const tableHeaderHeight = 36;

  // Bloco de encerramento da última página
  let conditionsHeight = 28 + (4 * 22);
  if (shouldDisplayShippingInProposal(quote) && quote?.shippingTerms) {
    conditionsHeight += 22;
  }
  const obs = (quote?.observations || quote?.notes || '').trim();
  if (obs) {
    const obsLines = obs.split(/\r?\n/).length;
    conditionsHeight += Math.max(1, obsLines) * 22 + 6;
  }
  const dateTextHeight = 22;
  const signatureTextHeight = 62;
  const footerHeight = 65;
  const baseClosingHeight = conditionsHeight + dateTextHeight + signatureTextHeight + footerHeight; // ~260px
  const minClosingTotal = baseClosingHeight + 45; // Inclui espaçadores mínimos

  const rawItems = (quote?.items || []).filter((it: any) => !it.isOptional);

  // Calcula altura de cada linha com base no conteúdo e imagem
  const getItemHeight = (item: any) => {
    const hasImage = Boolean(item.showImage !== false && item.imageUrl);
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
 * Replica 100% dos espaçamentos, tipografia, negritos, sublinhados e estruturas de tabela do e-mail.
 */
function renderA4SheetHtml(
  page: A4PageSlice,
  quote: Quote,
  settings: CompanySettings,
  clientLogoUrl?: string,
  itemImageMap?: Map<string, string>,
  logoBase64?: string,
  phoneIconBase64?: string,
  whatsappIconBase64?: string
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

  const effectiveLogoSrc = logoBase64 || '/infodesk-logo.png';
  const effectivePhoneIconSrc = phoneIconBase64 || '/phone-icon.png';
  const effectiveWhatsappIconSrc = whatsappIconBase64 || '/whatsapp-icon.png';

  const itemsHtml = page.items.map((item: any) => {
    const isException = excDetails.hasException && excDetails.itemNumbers.includes(item.itemNumber);
    const itemKey = String(item.id || item.itemNumber);
    const itemImgBase64 = itemImageMap?.get(itemKey) || itemImageMap?.get(String(item.itemNumber)) || item.imageUrl || '';
    const hasImage = Boolean(item.showImage !== false && itemImgBase64 && itemImgBase64.trim());
    const safeItemName = escapeHtml(item.name);

    return `
      <tr style="page-break-inside: avoid; background-color: #ffffff;">
        <td style="border: 0.5pt solid #000000; padding: 6px 4px; width: 6%; text-align: center; vertical-align: middle; white-space: nowrap; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; color: #000000;">
          ${escapeHtml(item.itemNumber)}
        </td>
        <td style="border: 0.5pt solid #000000; padding: 6px 8px; width: 46%; text-align: left; vertical-align: middle; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; color: #000000;">
          <div style="font-weight: normal; color: #000000;">
            ${safeItemName}
            ${isException ? `<span style="font-size: 8pt; color: #b45309; font-weight: bold; margin-left: 6px;">(Prazo diferenciado: ${escapeHtml(excDetails.days)} dias úteis)</span>` : ''}
          </div>
          ${hasImage ? `
            <table border="0" cellpadding="0" cellspacing="0" width="130" style="width: 130px; max-width: 130px; margin-top: 6px; margin-bottom: 4px; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; page-break-inside: avoid;">
              <tr>
                <td width="130" align="left" valign="middle" style="width: 130px; max-width: 130px; padding: 0; margin: 0; line-height: 0; vertical-align: middle;">
                  <img src="${itemImgBase64}" alt="${safeItemName}" width="130" border="0" style="width: 130px; max-width: 130px; height: auto; max-height: 95px; object-fit: contain; display: block; border: 0; outline: none; text-decoration: none;" />
                </td>
              </tr>
            </table>
          ` : ''}
        </td>
        <td style="border: 0.5pt solid #000000; padding: 6px 4px; width: 6%; text-align: center; vertical-align: middle; white-space: nowrap; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; color: #000000;">
          ${escapeHtml(item.quantity)}
        </td>
        <td style="border: 0.5pt solid #000000; padding: 6px 4px; width: 6%; text-align: center; vertical-align: middle; white-space: nowrap; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; color: #000000;">
          ${escapeHtml(item.unit || 'Un.')}
        </td>
        <td style="border: 0.5pt solid #000000; padding: 6px 6px; width: 18%; text-align: center; vertical-align: middle; white-space: nowrap; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; color: #000000;">
          R$ ${Number(item.unitPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td style="border: 0.5pt solid #000000; padding: 6px 6px; width: 18%; text-align: center; vertical-align: middle; white-space: nowrap; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; color: #000000;">
          R$ ${Number(item.totalPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="a4-render-sheet" style="width: 21cm; height: 29.7cm; min-height: 29.7cm; max-height: 29.7cm; box-sizing: border-box; padding: 0.75cm 1.32cm 0.45cm 2.0cm; background: #ffffff; color: #000000; font-family: Verdana, Geneva, sans-serif; font-size: 10pt; line-height: 1.35; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;">
      <div style="flex: 1; display: flex; flex-direction: column;">
        
        ${page.isFirstPage ? `
          <!-- Logo Infodesk (8,56 x 2,08 cm) -->
          <div style="margin-bottom: 20px; text-align: left;">
            <img src="${effectiveLogoSrc}" alt="Infodesk" width="324" height="79" style="width: 8.56cm; height: 2.08cm; max-width: 100%; object-fit: contain; display: block; border: 0;" />
          </div>

          <!-- Dados do Cliente / Solicitante (Com Logo do Cliente no Destinatário) -->
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; margin-bottom: 18px; border-collapse: collapse; font-family: Verdana, Geneva, sans-serif;">
            <tr>
              ${clientLogoUrl ? `
                <td width="56" valign="middle" align="center" style="width: 56px; padding-right: 14px; vertical-align: middle; border: 0;">
                  <img src="${clientLogoUrl}" alt="${clientCompanyFormatted}" width="50" height="50" border="0" style="width: 50px; height: 50px; max-width: 50px; max-height: 50px; object-fit: contain; display: block; margin: 0 auto; border: 0; outline: none; background: transparent;" />
                </td>
              ` : ''}
              <td valign="middle" style="vertical-align: middle; line-height: 1.5; font-family: Verdana, Geneva, sans-serif;">
                <p style="margin: 0; font-weight: bold; font-size: 12pt; line-height: 1.5; font-family: Verdana, Geneva, sans-serif; color: #000000;">${clientCompanyFormatted}</p>
                <p style="margin: 0; font-weight: bold; font-size: 12pt; line-height: 1.5; font-family: Verdana, Geneva, sans-serif; color: #000000;">${contactPersonFormatted}</p>
                <p style="margin: 4px 0 0 0; font-size: 8pt; font-weight: bold; line-height: 1.35; font-family: Verdana, Geneva, sans-serif; color: #000000;">E-mail: <a href="mailto:${(quote.clientEmail || '').toLowerCase()}" style="color: #0000ee; text-decoration: underline; font-size: 8pt; font-weight: bold;">${(quote.clientEmail || '').toLowerCase()}</a></p>
                ${quote.clientPhone ? `<p style="margin: 2px 0 0 0; font-size: 8pt; font-weight: bold; line-height: 1.35; font-family: Verdana, Geneva, sans-serif; color: #000000;">Telefone: ${escapeHtml(quote.clientPhone)}</p>` : ''}
              </td>
            </tr>
          </table>

          <!-- Parágrafo de Abertura -->
          <p style="text-align: justify; text-indent: 1.25cm; margin-top: 0; margin-bottom: 16px; font-size: 9pt; font-family: Verdana, Geneva, sans-serif; line-height: 1.35; color: #000000;">
            ${escapeHtml(openingText)}
          </p>
        ` : ''}

        ${page.items.length > 0 ? `
          <!-- Tabela Oficial de Produtos desta Página -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-family: Verdana, Geneva, sans-serif; font-size: 10pt;">
            <thead>
              <tr style="background-color: #ffffff;">
                <th style="border: 0.5pt solid #000000; padding: 6px 4px; width: 6%; text-align: center; font-weight: bold; font-size: 10pt; color: #000000; white-space: nowrap;">Item</th>
                <th style="border: 0.5pt solid #000000; padding: 6px 8px; width: 46%; text-align: center; font-weight: bold; font-size: 10pt; color: #000000;">Descrição do Produto</th>
                <th style="border: 0.5pt solid #000000; padding: 6px 4px; width: 6%; text-align: center; font-weight: bold; font-size: 10pt; color: #000000; white-space: nowrap;">Qtd.</th>
                <th style="border: 0.5pt solid #000000; padding: 6px 4px; width: 6%; text-align: center; font-weight: bold; font-size: 10pt; color: #000000; white-space: nowrap;">Un.</th>
                <th style="border: 0.5pt solid #000000; padding: 6px 6px; width: 18%; text-align: center; font-weight: bold; font-size: 10pt; color: #000000; white-space: nowrap;">Preço unit.</th>
                <th style="border: 0.5pt solid #000000; padding: 6px 6px; width: 18%; text-align: center; font-weight: bold; font-size: 10pt; color: #000000; white-space: nowrap;">Preço total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        ` : ''}

        ${page.isLastPage ? `
          <!-- Condições Gerais (Exatamente com Negrito e Sublinhado Oficiais) -->
          <div style="margin-bottom: 0px; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; line-height: 1.5; color: #000000;">
            <p style="margin: 0 0 6px 0; font-size: 12pt; font-weight: bold; text-decoration: underline; font-family: Verdana, Geneva, sans-serif; color: #000000;">Condições gerais:</p>
            <p style="margin: 0 0 4px 0; font-size: 10pt; line-height: 1.5; color: #000000;">➤&nbsp; Validade da proposta: ${escapeHtml(formatProposalValidityText(quote.validityDays))}</p>
            <p style="margin: 0 0 4px 0; font-size: 10pt; line-height: 1.5; color: #000000;">➤&nbsp; Condições de pagamento: ${escapeHtml(quote.paymentTerms || 'Faturado.')}</p>
            <p style="margin: 0 0 4px 0; font-size: 10pt; line-height: 1.5; color: #000000;">➤&nbsp; Prazo de entrega: ${escapeHtml(quote.deliveryDays || 'Pronta Entrega')}</p>
            <p style="margin: 0 0 4px 0; font-size: 10pt; line-height: 1.5; color: #000000;">➤&nbsp; Garantia: ${escapeHtml(quote.warrantyTerms || '06 meses')}</p>
            ${formattedShipping ? `<p style="margin: 0 0 4px 0; font-size: 10pt; line-height: 1.5; font-weight: bold; color: #000000;">➤&nbsp; ${escapeHtml(formattedShipping)}</p>` : ''}
            ${cleanObs ? `<p style="margin: 0 0 4px 0; font-size: 10pt; line-height: 1.5; font-weight: bold; color: #000000; white-space: pre-line;">➤&nbsp; <strong style="font-weight: bold;">Obs:</strong> <strong style="font-weight: bold;">${escapeHtml(cleanObs)}</strong></p>` : ''}
          </div>

          <!-- Espaçador Harmônico A4: Condições Gerais -> Data -->
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; border-collapse: collapse; margin: 0; padding: 0;">
            <tr>
              <td height="${page.spacers.spacerAfterConditions}" style="height: ${page.spacers.spacerAfterConditions}px; line-height: ${page.spacers.spacerAfterConditions}px; font-size: 1px; mso-line-height-rule: exactly;">&nbsp;</td>
            </tr>
          </table>

          <!-- Data e Assinatura Alinhadas à Direita -->
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; border-collapse: collapse; text-align: right; margin: 0; padding: 0;">
            <tr>
              <td align="right" style="text-align: right; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; color: #000000; line-height: 1.4; padding: 0;">
                <p style="margin: 0; font-size: 10pt; color: #000000;">${escapeHtml(quote.city || (settings.cityState ? settings.cityState.split('-')[0].trim() : 'Brasília'))}, ${escapeHtml(quote.date)}.</p>
              </td>
            </tr>
            <!-- Espaçador Harmônico A4: Data -> Nome da Assinatura -->
            <tr>
              <td height="${page.spacers.spacerAfterDate}" style="height: ${page.spacers.spacerAfterDate}px; line-height: ${page.spacers.spacerAfterDate}px; font-size: 1px; mso-line-height-rule: exactly;">&nbsp;</td>
            </tr>
            <tr>
              <td align="right" style="text-align: right; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; color: #000000; line-height: 1.4; padding: 0;">
                <p style="margin: 0 0 2px 0; font-weight: normal; font-size: 10pt; color: #000000;">${escapeHtml(settings.representativeName || 'Lucas Porto')}</p>
                
                <!-- Linha dos Telefones com ícones oficiais embutidos -->
                <table align="right" border="0" cellpadding="0" cellspacing="0" style="margin-left: auto; border-collapse: collapse; text-align: right; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; margin-top: 2px;">
                  <tr>
                    <td style="padding: 0; vertical-align: middle; text-align: right; color: #000000; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
                      <img src="${effectivePhoneIconSrc}" alt="Telefone" width="14" height="14" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; border: 0; display: inline-block;" />
                      <span style="color: #000000; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; vertical-align: middle;">${cleanPhone}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 2px 0 0 0; vertical-align: middle; text-align: right; color: #000000; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
                      <img src="${effectiveWhatsappIconSrc}" alt="WhatsApp" width="14" height="14" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; border: 0; display: inline-block;" /><a href="https://api.whatsapp.com/send?phone=55${cleanWhatsapp}" target="_blank" rel="noreferrer" style="color: #0000ee; text-decoration: underline; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; vertical-align: middle; display: inline-block; white-space: nowrap;">${formattedWhatsapp}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        ` : ''}

      </div>

      ${page.isLastPage ? `
        <!-- Espaçador Harmônico A4: Assinatura -> Rodapé Fiscal -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; border-collapse: collapse; margin: 0; padding: 0;">
          <tr>
            <td height="${page.spacers.spacerBeforeFooter}" style="height: ${page.spacers.spacerBeforeFooter}px; line-height: ${page.spacers.spacerBeforeFooter}px; font-size: 1px; mso-line-height-rule: exactly;">&nbsp;</td>
          </tr>
        </table>

        <!-- Rodapé Fiscal Fixo na Base da Folha -->
        <div style="border-top: 0.5pt solid #000000; padding-top: 8px; padding-bottom: 4px; text-align: center; font-weight: bold; font-size: 9.5pt; color: #000000; font-family: Verdana, Geneva, sans-serif; flex-shrink: 0;">
          <p style="margin: 0; font-weight: bold; font-size: 9.5pt;">${escapeHtml(settings.companyName || 'Lucas Porto da Fonseca ME')}</p>
          <p style="margin: 2px 0 0 0; font-weight: bold; font-size: 9.5pt;">${escapeHtml(settings.address || 'CLSW 304 Bloco A Sala 108 – Sudoeste')} – ${escapeHtml(settings.cityState || 'Brasília – DF')}</p>
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
 * garantindo paridade total com o e-mail oficial: sem cortes de linhas, com fotos de produtos preservadas em Base64
 * e sem dependência de requisições cross-origin no canvas.
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

  // 1. Converte e garante a melhor logomarca do cliente em Base64 Data URL (sem depender de CORS no html2canvas)
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

  // 2. Converte preventivamente os ativos estáticos em Base64 Data URLs (Infodesk logo, telefone e WhatsApp)
  const [logoBase64, phoneIconBase64, whatsappIconBase64] = await Promise.all([
    getAssetAsBase64('/infodesk-logo.png'),
    getAssetAsBase64('/phone-icon.png'),
    getAssetAsBase64('/whatsapp-icon.png')
  ]);

  // 3. Pré-carrega e converte TODAS as fotos dos produtos da proposta para Base64 Data URL
  // Isso elimina 100% dos bloqueios de CORS do html2canvas e garante que a foto apareça perfeitamente no PDF
  const itemImageMap = new Map<string, string>();
  const rawItems = (quote?.items || []).filter((it: any) => !it.isOptional);

  await Promise.all(
    rawItems.map(async (item: any) => {
      const hasImage = Boolean(item.showImage !== false && item.imageUrl && item.imageUrl.trim());
      if (!hasImage) return;

      const itemKey = String(item.id || item.itemNumber);
      try {
        const base64DataUrl = await resolveItemImageBase64(item);
        if (base64DataUrl) {
          itemImageMap.set(itemKey, base64DataUrl);
          itemImageMap.set(String(item.itemNumber), base64DataUrl);
        }
      } catch (err) {
        console.warn(`[PDF Export] Aviso ao carregar foto do item ${item.itemNumber} em Base64:`, err);
      }
    })
  );

  // 4. Divide a proposta nas páginas A4 oficiais
  const pages = paginateQuoteForA4(quote);

  // 5. Inicializa o documento jsPDF A4 retrato
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  // 6. Renderiza cada folha A4 individualmente
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const sheetWrapper = document.createElement('div');
    sheetWrapper.innerHTML = renderA4SheetHtml(
      page, 
      quote, 
      settings, 
      effectiveClientLogo,
      itemImageMap,
      logoBase64,
      phoneIconBase64,
      whatsappIconBase64
    );
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
            setTimeout(() => resolve(false), 2500);
          });
        })
      );

      // Pequena pausa para acomodação de fontes e text-renders
      await new Promise(r => setTimeout(r, 90));

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

/**
 * Dispara o download direto do PDF oficial da proposta comercial no computador do usuário.
 */
export async function downloadQuotePdf(
  quote: Quote,
  settings: CompanySettings,
  clientLogoDataUrl?: string
): Promise<void> {
  const { filename, base64 } = await generateQuotePdfBase64(quote, settings, clientLogoDataUrl);
  const link = document.createElement('a');
  link.href = `data:application/pdf;base64,${base64}`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
