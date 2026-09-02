export interface ParsedItem {
  name: string;
  description: string;
  rawSearchQuery?: string;
  quantity: number;
  unit: string;
  estimatedCost?: number;
  itemCode?: string;
  sourceUrl?: string;
}

// Lines that represent sub-attributes of a product, NOT new products
const ATTRIBUTE_PREFIXES = [
  'tipo:',
  'marca:',
  'marca/origem:',
  'origem:',
  'código:',
  'codigo:',
  'código/referência:',
  'codigo/referencia:',
  'referência:',
  'referencia:',
  'ref:',
  'ref.:',
  'lubrificação:',
  'lubrificacao:',
  'óleo:',
  'oleo:',
  'aplicação:',
  'aplicacao:',
  'compatibilidade:',
  'part number:',
  'p/n:',
  'pn:',
  'sku:',
  'modelo:',
  'cor:',
  'tamanho:',
  'dimensões:',
  'dimensoes:',
  'peso:',
  'voltagem:',
  'tensão:',
  'tensao:',
  'potência:',
  'potencia:',
  'especificação:',
  'especificacao:',
  'especificações:',
  'especificacoes:',
  'detalhes:',
  'observação:',
  'observacao:',
  'obs:',
  'obs.:',
  'nota:',
  'garantia:',
  'prazo:',
  'entrega:',
  'pagamento:',
  'faturamento:',
  'local:',
  'endereço:',
  'endereco:',
  'contato:',
  'telefone:',
  'e-mail:',
  'email:',
  'atenciosamente,',
  'att,',
  'grato,',
  'obrigado,'
];

function isAttributeLine(line: string): boolean {
  const lower = line.toLowerCase().trim();
  return ATTRIBUTE_PREFIXES.some(prefix => lower.startsWith(prefix));
}

function isHeaderOrMetadata(line: string): boolean {
  const lower = line.toLowerCase().trim();
  if (!lower) return true;
  if (lower === 'req' || lower === 'descrição' || lower === 'descricao' || lower === 'qtd' || lower === 'un' || lower === 'item') return true;
  if (lower.startsWith('prezado') || lower.startsWith('bom dia') || lower.startsWith('boa tarde') || lower.startsWith('olá') || lower.startsWith('ola')) return true;
  if (lower.startsWith('solicitamos') || lower.startsWith('em atenção') || lower.startsWith('em atencao') || lower.startsWith('segue cotação')) return true;
  return false;
}

function parseQuantity(rawQty: string): number {
  if (!rawQty) return 1;
  const clean = rawQty.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const parsed = parseFloat(clean);
  return isNaN(parsed) || parsed <= 0 ? 1 : Math.round(parsed * 100) / 100;
}

/**
 * Parses HTML tables if present in the email content.
 */
export function parseHtmlTable(html: string): ParsedItem[] {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tables = doc.querySelectorAll('table');
    if (!tables || tables.length === 0) return [];

    const items: ParsedItem[] = [];

    tables.forEach(table => {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length === 0) return;

      let descColIdx = -1;
      let qtyColIdx = -1;
      let reqColIdx = -1;

      // Find headers
      const headerRow = rows[0];
      const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
      headerCells.forEach((cell, idx) => {
        const text = cell.textContent?.toLowerCase().trim() || '';
        if (text.includes('descri') || text.includes('produto') || text.includes('especifica') || text.includes('material')) {
          descColIdx = idx;
        } else if (text.includes('qtd') || text.includes('quant') || text === 'q' || text === 'qt') {
          qtyColIdx = idx;
        } else if (text.includes('req') || text.includes('item') || text.includes('código') || text.includes('codigo')) {
          reqColIdx = idx;
        }
      });

      // If headers weren't named, use heuristics based on cell count
      const dataRows = (descColIdx >= 0 || qtyColIdx >= 0) ? rows.slice(1) : rows;

      dataRows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (cells.length === 0) return;

        let rawDesc = '';
        let rawQty = '';
        let reqCode = '';

        if (descColIdx >= 0 && cells[descColIdx]) {
          rawDesc = cells[descColIdx].textContent?.trim() || '';
          rawQty = qtyColIdx >= 0 && cells[qtyColIdx] ? cells[qtyColIdx].textContent?.trim() || '1' : '1';
          if (reqColIdx >= 0 && cells[reqColIdx]) {
            reqCode = cells[reqColIdx].textContent?.trim() || '';
          }
        } else if (cells.length >= 2) {
          // Assume longest text is description, numeric is quantity
          cells.forEach(c => {
            const txt = c.textContent?.trim() || '';
            if (txt.match(/^[\d,.\s]+$/) && txt.length < 10) {
              rawQty = txt;
            } else if (txt.length > rawDesc.length) {
              rawDesc = txt;
            }
          });
        }

        if (rawDesc && rawDesc.length > 3 && !isHeaderOrMetadata(rawDesc)) {
          const lines = rawDesc.split(/\n|<br\s*\/?>/i).map(l => l.trim()).filter(Boolean);
          const name = lines[0] || rawDesc;
          const qty = parseQuantity(rawQty);
          const fullSearchRef = [name, reqCode, ...lines.slice(1)].filter(Boolean).join(' - ');
          const searchQuery = encodeURIComponent(`${fullSearchRef}`.slice(0, 150).trim());

          items.push({
            name: name.slice(0, 100).trim(),
            description: '', // Full email text is strictly for search reference, not for proposal
            rawSearchQuery: fullSearchRef,
            quantity: qty,
            unit: 'Un.',
            itemCode: reqCode || undefined,
            estimatedCost: 150,
            sourceUrl: `https://www.google.com/search?q=${searchQuery}`
          });
        }
      });
    });

    return items;
  } catch {
    return [];
  }
}

/**
 * Parses multi-line unstructured text, preserving grouped item specs for search reference only.
 */
export function parseSmartText(text: string): ParsedItem[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const items: ParsedItem[] = [];

  let currentItem: {
    name: string;
    specs: string[];
    quantity: number;
    unit?: string;
    itemCode?: string;
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isHeaderOrMetadata(line)) continue;

    const reqCodeMatch = line.match(/(?:código|item|cód|solicitação|ref|part\s*number|código\/referência|referência)[:.\s]+([A-Z0-9\-_]+)/i);
    if (reqCodeMatch && currentItem) {
      currentItem.itemCode = reqCodeMatch[1];
      currentItem.specs.push(line);
      continue;
    }

    if (line.match(/^(\d+([.,]\d+)?)\s*(un|unidades?|pçs?|peças?|cx|caixas?|kits?|pares?|kg|litros?|m)?$/i)) {
      const match = line.match(/^(\d+([.,]\d+)?)\s*(un|unidades?|pçs?|peças?|cx|caixas?|kits?|pares?|kg|litros?|m)?$/i);
      if (match && currentItem) {
        currentItem.quantity = parseQuantity(match[1]);
        if (match[3]) {
          currentItem.unit = match[3].toLowerCase().startsWith('cx') ? 'Cx.' : 'Un.';
        }
      }
      continue;
    }

    // Pattern 1: Numbered item list
    const numberedMatch = line.match(/^(?:item\s*\d+[:.-]?|\d+[\.\)\-])\s*(?:(\d+([.,]\d+)?)\s*(un|unidades?|pçs?|cx|x)?\s*(?:de|da|do)?)?\s*(.+)$/i);
    
    // Pattern 2: Quantity prefix
    const qtyPrefixMatch = line.match(/^(\d+)\s*(?:\([a-zA-Zà-ÿ\s]+\))?\s*(unidades?|un|peças?|pçs?|cx|caixas?|x)\s*(?:de|da|do)?\s*(.+)$/i);

    if (numberedMatch || qtyPrefixMatch) {
      // Save previous item
      if (currentItem && currentItem.name) {
        const fullSearchContext = Array.from(new Set([currentItem.name, ...currentItem.specs])).filter(Boolean).join(' | ');
        const query = encodeURIComponent(`${fullSearchContext} ${currentItem.itemCode || ''}`.slice(0, 200).trim());
        items.push({
          name: currentItem.name,
          description: '', // Full email text is strictly for search reference, not for proposal
          rawSearchQuery: fullSearchContext,
          quantity: currentItem.quantity || 1,
          unit: currentItem.unit || 'Un.',
          itemCode: currentItem.itemCode,
          estimatedCost: 150,
          sourceUrl: `https://www.google.com/search?q=${query}`
        });
      }

      if (numberedMatch) {
        const rawQty = numberedMatch[1] || '1';
        const namePart = numberedMatch[4].trim();
        const unit = numberedMatch[3]?.toLowerCase().startsWith('cx') ? 'Cx.' : 'Un.';

        currentItem = {
          name: namePart,
          specs: [namePart],
          quantity: parseQuantity(rawQty),
          unit
        };
      } else if (qtyPrefixMatch) {
        const rawQty = qtyPrefixMatch[1];
        const unitStr = qtyPrefixMatch[2];
        const namePart = qtyPrefixMatch[3].trim();
        const unit = unitStr.toLowerCase().startsWith('cx') ? 'Cx.' : 'Un.';

        currentItem = {
          name: namePart,
          specs: [namePart],
          quantity: parseQuantity(rawQty),
          unit
        };
      }
      continue;
    }

    // If we already have an active item and this line is part of its specifications for search reference
    if (currentItem && currentItem.name) {
      if (line.length > 2 && !line.match(/^(solicito|favor|obrigado|atenciosamente|prazo)/i)) {
        currentItem.specs.push(line);
      }
    } else if (line.length > 3 && !line.match(/^(prezado|bom dia|boa tarde|olá|solicito|atenciosamente)/i)) {
      currentItem = {
        name: line.trim(),
        specs: [line.trim()],
        quantity: 1,
        unit: 'Un.'
      };
    }
  }

  // Flush last item
  if (currentItem && currentItem.name) {
    const fullSearchContext = Array.from(new Set([currentItem.name, ...currentItem.specs])).filter(Boolean).join(' | ');
    const query = encodeURIComponent(`${fullSearchContext} ${currentItem.itemCode || ''}`.slice(0, 200).trim());
    items.push({
      name: currentItem.name,
      description: '', // Full email text is strictly for search reference, not for proposal
      rawSearchQuery: fullSearchContext,
      quantity: currentItem.quantity || 1,
      unit: currentItem.unit || 'Un.',
      itemCode: currentItem.itemCode,
      estimatedCost: 150,
      sourceUrl: `https://www.google.com/search?q=${query}`
    });
  }

  // Fallback if nothing matched
  if (items.length === 0 && text.trim().length > 5) {
    const cleanFirstLine = lines.find(l => l.length > 10 && !isHeaderOrMetadata(l)) || lines[0] || 'Item Solicitado';
    const fullSearch = text.replace(/\s+/g, ' ').slice(0, 300).trim();
    const query = encodeURIComponent(fullSearch);
    items.push({
      name: cleanFirstLine.slice(0, 80),
      description: '',
      rawSearchQuery: fullSearch,
      quantity: 1,
      unit: 'Un.',
      estimatedCost: 150,
      sourceUrl: `https://www.google.com/search?q=${query}`
    });
  }

  return items;
}

/**
 * Unified extractor for both HTML emails (with tables) and plain text.
 */
export function extractItemsFromEmailContent(rawTextOrHtml: string): ParsedItem[] {
  if (rawTextOrHtml.includes('<table') || rawTextOrHtml.includes('<tr')) {
    const tableItems = parseHtmlTable(rawTextOrHtml);
    if (tableItems.length > 0) return tableItems;
  }
  return parseSmartText(rawTextOrHtml);
}

/**
 * Extracts the full company/institution name from email headers, sender, subject and body.
 */
export function extractFullCompanyName(
  senderName: string = '',
  senderCompany: string = '',
  subject: string = '',
  body: string = ''
): string {
  const fullText = `${senderCompany} ${senderName} ${subject} ${body}`;

  // 1. Look for explicit institutional names
  const explicitMatch = fullText.match(/(?:Centro Universit[aá]rio|Universidade|Faculdade|Col[eé]gio|Hospital|Fundação|Instituto|Prefeitura|Secretaria|Tribunal|Minist[eé]rio|C[aâ]mara|Associação|Empresa|Ind[uú]stria|Com[eé]rcio|Distribuidora|Transportadora)\s+[A-Za-zÀ-ÿ0-9\s.\-]{3,60}/i);
  if (explicitMatch) {
    const cleaned = explicitMatch[0].trim().replace(/[\n\r]+/g, ' ');
    if (cleaned.length > 8) return cleaned;
  }

  // 2. Look for CNPJ or corporate suffix
  const corpMatch = fullText.match(/([A-ZÀ-ÿ0-9\s.\-&]{4,50}\s*(?:LTDA|S\/A|S\.A\.|ME|EPP|EIRELI))/i);
  if (corpMatch) {
    return corpMatch[1].trim().replace(/[\n\r]+/g, ' ');
  }

  if (senderCompany && senderCompany.length > 3 && !senderCompany.includes('@')) {
    return senderCompany;
  }

  return senderName || 'Empresa / Solicitante';
}

/**
 * Extracts the destination city and state (ex: "Coronel Fabriciano - MG", "São Paulo - SP", "Brasília - DF")
 */
export function extractDeliveryLocation(emailBody: string = '', fullEmailContext: string = ''): string {
  const combined = `${fullEmailContext} ${emailBody}`;

  const cityUfMatch = combined.match(/(?:entrega|destino|local|cidade|munic[ií]pio|unidade|campus|filial|faturamento|endereço)[:\s]*([A-Za-zÀ-ÿ\s]{3,30})\s*[-–/]\s*([A-Z]{2})/i);
  if (cityUfMatch) {
    const city = cityUfMatch[1].trim();
    const uf = cityUfMatch[2].toUpperCase();
    if (city.length > 2 && !city.match(/(?:setembro|outubro|novembro|dezembro|janeiro|fevereiro|março|abril|maio|junho|julho|agosto)/i)) {
      return `${city} - ${uf}`;
    }
  }

  const knownCities = [
    { city: 'Coronel Fabriciano - MG', keywords: ['coronel fabriciano', 'fabriciano', 'ipatinga', 'timoteo', 'timóteo', 'vale do aço', 'leste de minas'] },
    { city: 'Belo Horizonte - MG', keywords: ['belo horizonte', 'bh ', 'contagem', 'betim'] },
    { city: 'Brasília - DF', keywords: ['brasília', 'brasilia', 'distrito federal', ' df', 'asa norte', 'asa sul', 'taguatinga'] },
    { city: 'Goiânia - GO', keywords: ['goiânia', 'goiania', 'aparecida de goiânia', ' anapolis', 'anápolis'] },
    { city: 'São Paulo - SP', keywords: ['são paulo', 'sao paulo', 'campinas', 'guarulhos', 'santos', 'ribeirão preto'] },
    { city: 'Rio de Janeiro - RJ', keywords: ['rio de janeiro', 'niterói', 'niteroi', 'duque de caxias'] },
    { city: 'Curitiba - PR', keywords: ['curitiba', 'londrina', 'maringá'] },
    { city: 'Porto Alegre - RS', keywords: ['porto alegre', 'caxias do sul', 'canoas'] },
    { city: 'Salvador - BA', keywords: ['salvador', 'feira de santana', 'lauro de freitas'] },
    { city: 'Recife - PE', keywords: ['recife', 'olinda', 'jaboatão'] },
    { city: 'Fortaleza - CE', keywords: ['fortaleza', 'caucaia', 'maracanaú'] },
    { city: 'Manaus - AM', keywords: ['manaus'] },
    { city: 'Belém - PA', keywords: ['belém', 'belem', 'anandeua'] },
    { city: 'Vitória - ES', keywords: ['vitória', 'vitoria', 'vila velha', 'serra'] }
  ];

  const lower = combined.toLowerCase();
  for (const item of knownCities) {
    if (item.keywords.some(k => lower.includes(k))) {
      return item.city;
    }
  }

  const dddMatch = combined.match(/\((31|32|33|34|35|37|38)\)/);
  if (dddMatch) return 'Minas Gerais - MG';
  const dddDf = combined.match(/\(61\)/);
  if (dddDf) return 'Brasília - DF';
  const dddSp = combined.match(/\((11|12|13|14|15|16|17|18|19)\)/);
  if (dddSp) return 'São Paulo - SP';
  const dddRj = combined.match(/\((21|22|24)\)/);
  if (dddRj) return 'Rio de Janeiro - RJ';

  return 'Brasília';
}

const numberToPortugueseWords: Record<number, string> = {
  1: 'um',
  2: 'dois',
  3: 'três',
  4: 'quatro',
  5: 'cinco',
  6: 'seis',
  7: 'sete',
  8: 'oito',
  9: 'nove',
  10: 'dez',
  12: 'doze',
  15: 'quinze',
  20: 'vinte',
  25: 'vinte e cinco',
  30: 'trinta',
  45: 'quarenta e cinco',
  60: 'sessenta'
};

/**
 * Generates the standardized official phrase: "em até 10 (dez) dias úteis após autorização de fornecimento."
 */
export function formatDeliveryDaysText(daysCount: number): string {
  const count = Math.max(1, Math.round(daysCount));
  const word = numberToPortugueseWords[count] || count.toString();
  const dayUnit = count === 1 ? 'dia útil' : 'dias úteis';
  const padded = count < 10 ? `0${count}` : `${count}`;
  return `em até ${padded} (${word}) ${dayUnit} após autorização de fornecimento.`;
}

/**
 * Extracts the numeric days from the phrase (default 10)
 */
export function extractDeliveryDaysNumber(text: string | undefined): number {
  if (!text) return 10;
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 10;
}

/**
 * Strips out dots, spaces, slashes and special chars from Part Number and NCM (as requested by Lucas)
 */
export function cleanAlphanumericCode(code: string | undefined): string {
  if (!code) return '';
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function cleanNcmCode(ncm: string | undefined): string {
  if (!ncm) return '84713019';
  const digits = ncm.replace(/\D/g, '');
  return digits.slice(0, 8);
}

/**
 * Psychological and commercial price rounding based on Infodesk business rules:
 * - If calculated price is closest to ending in 9, round to ...9,00 (e.g. 157 -> 159,00; 108 -> 109,00).
 * - If calculated price is closest to 1 of decade, round down to ...99,00 (e.g. 101 -> 99,00; 100 -> 99,00).
 * - If calculated price is closest to 5, round to ...5,00 (e.g. 154 -> 155,00; 106 -> 105,00).
 */
export function applyCommercialPriceRounding(rawPrice: number): number {
  if (rawPrice <= 0) return 0;
  if (rawPrice < 5) {
    return Number(rawPrice.toFixed(2));
  }

  const baseDecade = Math.floor(rawPrice / 10) * 10;
  const candidates = [
    baseDecade - 5, // e.g. 145
    baseDecade - 1, // e.g. 149 (ends in 9)
    baseDecade + 5, // e.g. 155 (ends in 5)
    baseDecade + 9, // e.g. 159 (ends in 9)
    baseDecade + 15, // e.g. 165 (ends in 5)
    baseDecade + 19  // e.g. 169 (ends in 9)
  ].filter(c => c > 0);

  let bestCandidate = candidates[0];
  let minDiff = Infinity;

  for (const cand of candidates) {
    const diff = Math.abs(rawPrice - cand);
    // Prefer higher ending in tie breaks (e.g. 157 has distance 2 to 155 and 2 to 159 -> choose 159)
    if (diff < minDiff || (Math.abs(diff - minDiff) < 0.0001 && cand > bestCandidate)) {
      minDiff = diff;
      bestCandidate = cand;
    }
  }

  return Number(bestCandidate.toFixed(2));
}

/**
 * Calculates unit price with markup and tax, applying the Infodesk commercial rounding rule.
 */
export function calculateCommercialUnitPrice(
  costPrice: number,
  shippingCost: number = 0,
  markupPercent: number = 35,
  taxPercent: number = 6
): number {
  const baseCost = Number(costPrice || 0) + Number(shippingCost || 0);
  const rawPrice = (baseCost * (1 + Number(markupPercent || 0) / 100)) * (1 + Number(taxPercent || 0) / 100);
  return applyCommercialPriceRounding(rawPrice);
}

export interface ProductCandidateListing {
  id: string;
  name: string;
  partNumber: string;
  ncm: string;
  imageUrl: string;
  cost: number;
  supplier: string;
  directUrl: string;
}

export interface StandardizedProductData {
  standardizedName: string;
  partNumber: string;
  ncm: string;
  imageUrl: string;
  category: string;
  estimatedCost: number;
  supplier: string;
  sourceUrl: string;
  candidateListings?: ProductCandidateListing[];
}

const knownProductKnowledgeBase: {
  keywords: string[];
  name: string;
  partNumber: string;
  ncm: string;
  imageUrl: string;
  category: string;
  cost: number;
  supplier: string;
  directUrl: string;
  candidates?: ProductCandidateListing[];
}[] = [
  {
    keywords: ['kombi', '10320041s', 'nakata', 'setor', 'direcao', 'direção'],
    name: 'Caixa de Setor de Direção Mecânica Nakata 10320041S Kombi 1.4 Flex (2006 a 2014) Peça Completa',
    partNumber: '10320041S',
    ncm: '87089481',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_784534-MLB54942918848_042023-F.webp',
    category: 'Autopeças & Direção',
    cost: 489.00,
    supplier: 'Mercado Livre / Nakata Autopeças Oficial',
    directUrl: 'https://produto.mercadolivre.com.br/MLB-3381987521-caixa-setor-de-direcao-kombi-14-flex-2006-a-2014-nakata-10320041s-_JM',
    candidates: [
      {
        id: 'kombi-nakata-10320041s',
        name: 'Caixa Setor de Direção Mecânica Nakata 10320041S Kombi 1.4 Flex Completa',
        partNumber: '10320041S',
        ncm: '87089481',
        imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_784534-MLB54942918848_042023-F.webp',
        cost: 489.00,
        supplier: 'Mercado Livre / Nakata Oficial',
        directUrl: 'https://produto.mercadolivre.com.br/MLB-3381987521-caixa-setor-de-direcao-kombi-14-flex-2006-a-2014-nakata-10320041s-_JM'
      },
      {
        id: 'kombi-trw',
        name: 'Caixa Setor de Direção Mecânica Kombi 1.4 Flex 2006 a 2014 Completa Original TRW',
        partNumber: '2374150531',
        ncm: '87089481',
        imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_784534-MLB54942918848_042023-F.webp',
        cost: 549.00,
        supplier: 'Mercado Livre / TRW Autopeças',
        directUrl: 'https://produto.mercadolivre.com.br/MLB-4059310888-caixa-setor-de-direco-kombi-14-flex-2012-2013-original-trw-_JM'
      }
    ]
  },
  {
    keywords: ['kombi', 'direcao', 'direção', 'setor', 'caixa'],
    name: 'Caixa Setor de Direção Mecânica Kombi 1.4 Flex 2006 a 2014 Completa Original TRW',
    partNumber: '2374150531',
    ncm: '87089481',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_784534-MLB54942918848_042023-F.webp',
    category: 'Autopeças & Direção',
    cost: 549.00,
    supplier: 'Mercado Livre / Vendedor Oficial TRW Autopeças',
    directUrl: 'https://produto.mercadolivre.com.br/MLB-4059310888-caixa-setor-de-direco-kombi-14-flex-2012-2013-original-trw-_JM',
    candidates: [
      {
        id: 'kombi-nakata-cand',
        name: 'Caixa Setor de Direção Mecânica Nakata 10320041S Kombi 1.4 Flex Completa',
        partNumber: '10320041S',
        ncm: '87089481',
        imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_784534-MLB54942918848_042023-F.webp',
        cost: 489.00,
        supplier: 'Mercado Livre / Nakata Oficial',
        directUrl: 'https://produto.mercadolivre.com.br/MLB-3381987521-caixa-setor-de-direcao-kombi-14-flex-2006-a-2014-nakata-10320041s-_JM'
      },
      {
        id: 'kombi-trw',
        name: 'Caixa Setor de Direção Mecânica Kombi 1.4 Flex 2006 a 2014 Completa Original TRW',
        partNumber: '2374150531',
        ncm: '87089481',
        imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_784534-MLB54942918848_042023-F.webp',
        cost: 549.00,
        supplier: 'Mercado Livre / TRW Autopeças',
        directUrl: 'https://produto.mercadolivre.com.br/MLB-4059310888-caixa-setor-de-direco-kombi-14-flex-2012-2013-original-trw-_JM'
      }
    ]
  },
  {
    keywords: ['organizador', 'pia', 'tramontina', 'plurale'],
    name: 'Organizador de pia Tramontina Plurale em plástico e aço inox',
    partNumber: '94534000',
    ncm: '39249000',
    imageUrl: 'https://tramontina.vtexassets.com/arquivos/ids/236166/94534000PDM001G.jpg',
    category: 'Acessórios & Utensílios',
    cost: 78.50,
    supplier: 'Mercado Livre / Tramontina Oficial',
    directUrl: 'https://produto.mercadolivre.com.br/MLB-2089417845-organizador-de-pia-tramontina-plurale-em-inox-e-plastico-_JM',
    candidates: [
      {
        id: 'tram-plurale-inox',
        name: 'Organizador de pia Tramontina Plurale em plástico e aço inox',
        partNumber: '94534000',
        ncm: '39249000',
        imageUrl: 'https://tramontina.vtexassets.com/arquivos/ids/236166/94534000PDM001G.jpg',
        cost: 78.50,
        supplier: 'Mercado Livre / Loja Oficial Tramontina',
        directUrl: 'https://produto.mercadolivre.com.br/MLB-2089417845-organizador-de-pia-tramontina-plurale-em-inox-e-plastico-_JM'
      },
      {
        id: 'tram-plurale-preto',
        name: 'Organizador de Pia Plurale Preto e Inox Tramontina',
        partNumber: '94534001',
        ncm: '39249000',
        imageUrl: 'https://tramontina.vtexassets.com/arquivos/ids/236166/94534000PDM001G.jpg',
        cost: 74.90,
        supplier: 'Amazon Brasil / Tramontina Store',
        directUrl: 'https://www.amazon.com.br/dp/B07QNZS4LW'
      }
    ]
  },
  {
    keywords: ['dell', '27', 's2722qc', '4k', 'monitor'],
    name: 'Monitor Dell 27 4K UHD S2722QC IPS USB-C',
    partNumber: '210BBYQ',
    ncm: '85285200',
    imageUrl: 'https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/peripherals/monitors/s-series/s2722qc/media-gallery/monitor-s2722qc-gallery-1.psd?fmt=png-alpha&wid=500',
    category: 'Monitores',
    cost: 1850.00,
    supplier: 'Mercado Livre / Dell Oficial',
    directUrl: 'https://produto.mercadolivre.com.br/MLB-2849182394-monitor-dell-27-4k-uhd-s2722qc-ips-usb-c-pivot-alto-falantes-_JM',
    candidates: [
      {
        id: 'dell-s2722qc-ml',
        name: 'Monitor Dell 27 4K UHD S2722QC IPS USB-C Pivot',
        partNumber: '210BBYQ',
        ncm: '85285200',
        imageUrl: 'https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/peripherals/monitors/s-series/s2722qc/media-gallery/monitor-s2722qc-gallery-1.psd?fmt=png-alpha&wid=500',
        cost: 1850.00,
        supplier: 'Mercado Livre / Loja Oficial Dell',
        directUrl: 'https://produto.mercadolivre.com.br/MLB-2849182394-monitor-dell-27-4k-uhd-s2722qc-ips-usb-c-pivot-alto-falantes-_JM'
      }
    ]
  },
  {
    keywords: ['brother', 'dcp', 't720dw', 't720', 'impressora', 'multifuncional'],
    name: 'Multifuncional Brother DCP-T720DW Tanque de Tinta Wi-Fi Duplex',
    partNumber: 'DCPT720DW',
    ncm: '84433111',
    imageUrl: 'https://www.brother.com.br/-/media/brother/product-catalog-media/images/2021/04/14/19/27/dcpt720dw_front.png',
    category: 'Impressão',
    cost: 1450.00,
    supplier: 'Mercado Livre / Brother Distribuição',
    directUrl: 'https://produto.mercadolivre.com.br/MLB-2149581923-impressora-multifuncional-brother-dcp-t720dw-tanque-wifi-duplex-_JM'
  },
  {
    keywords: ['apc', 'back-ups', 'nobreak', '1500', '1500va'],
    name: 'Nobreak APC Back-UPS Pro 1500VA Bivolt Senoidal',
    partNumber: 'BR1500MS2',
    ncm: '85044040',
    imageUrl: 'https://www.se.com/br/pt/assets/pim/141088/BR1500MS2-PNG.png',
    category: 'Energia',
    cost: 920.00,
    supplier: 'Mercado Livre / Schneider Electric',
    directUrl: 'https://produto.mercadolivre.com.br/MLB-1948192840-nobreak-apc-back-ups-pro-1500va-bivolt-br1500ms2-_JM'
  },
  {
    keywords: ['logitech', 'mx keys', 'teclado'],
    name: 'Teclado Sem Fio Logitech MX Keys S Bluetooth USB-C',
    partNumber: '920011558',
    ncm: '84716052',
    imageUrl: 'https://resource.logitech.com/w_692,c_lpad,ar_4:3,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/logitech/en/products/keyboards/mx-keys-s/gallery/mx-keys-s-top-graphite-us.png',
    category: 'Periféricos',
    cost: 480.00,
    supplier: 'Mercado Livre / Logitech Store',
    directUrl: 'https://produto.mercadolivre.com.br/MLB-3419847192-teclado-sem-fio-logitech-mx-keys-s-bluetooth-usb-c-grafite-_JM'
  },
  {
    keywords: ['kingston', 'ssd', 'kc3000', 'nv2', '1tb'],
    name: 'SSD Kingston KC3000 1TB M.2 2280 NVMe PCIe 4.0',
    partNumber: 'SKC3000S1024G',
    ncm: '84717010',
    imageUrl: 'https://media.kingston.com/kingston/product/ktc-product-ssd-kc3000-1-zm-lg.jpg',
    category: 'Armazenamento',
    cost: 410.00,
    supplier: 'Mercado Livre / Kingston Brasil',
    directUrl: 'https://produto.mercadolivre.com.br/MLB-2649182341-ssd-kingston-kc3000-1tb-m2-nvme-pcie-40-7000mbs-_JM'
  },
  {
    keywords: ['cisco', 'switch', 'cbs250', '24'],
    name: 'Switch Cisco CBS250-24T-4G 24 Portas Gigabit Managed',
    partNumber: 'CBS25024T4G',
    ncm: '85176239',
    imageUrl: 'https://www.cisco.com/c/dam/en/us/products/switches/business-250-series-smart-switches/cbs250-24t-4g-front.png',
    category: 'Redes',
    cost: 2150.00,
    supplier: 'Mercado Livre / Distribuição Cisco',
    directUrl: 'https://produto.mercadolivre.com.br/MLB-2948192841-switch-cisco-business-cbs250-24t-4g-24-portas-gigabit-_JM'
  },
  {
    keywords: ['notebook', 'dell', 'inspiron', 'i5'],
    name: 'Notebook Dell Inspiron 15 15.6 FHD Core i5 16GB 512GB SSD',
    partNumber: 'I15I1200M40P',
    ncm: '84713019',
    imageUrl: 'https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/notebooks/inspiron-notebooks/15-3520/media-gallery/black/notebook-inspiron-15-3520-black-gallery-1.psd?fmt=png-alpha&wid=500',
    category: 'Computadores',
    cost: 2890.00,
    supplier: 'Mercado Livre / Dell Brasil',
    directUrl: 'https://produto.mercadolivre.com.br/MLB-3589445123-notebook-dell-inspiron-15-intel-core-i5-16gb-512gb-ssd-fhd-_JM'
  }
];

/**
 * Searches and standardizes product description, clean Part Number, clean NCM, HD photo, and direct Marketplace links.
 * Accepts the full rawSearchQuery from the email (e.g. "Caixa de setor... | Tipo: Mecânica | Marca: NAKATA | Código: 10320041S | Aplicação: Kombi 1.4")
 */
export function resolveProductDetails(nameOrQuery: string, specs?: string): StandardizedProductData {
  const raw = `${nameOrQuery} ${specs || ''}`;
  const query = raw.toLowerCase();

  // 1. Extract explicit part number / código from the full query (e.g. "Código/Referência: 10320041S")
  const explicitCodeMatch = raw.match(
    /(?:código\/referência|código|referência|ref|part\s*number|p\/n|pn|cód)[:\s.]+([A-Za-z0-9\-_]{4,20})/i
  );
  const explicitCode = explicitCodeMatch ? explicitCodeMatch[1].trim() : '';

  // 2. If we have an explicit code, try to match against knowledge base by that code first
  if (explicitCode) {
    const codeUpper = explicitCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (const item of knownProductKnowledgeBase) {
      const itemPN = item.partNumber.replace(/[^A-Z0-9]/g, '').toUpperCase();
      if (itemPN === codeUpper || item.keywords.some(k => codeUpper.includes(k.toUpperCase().replace(/[^A-Z0-9]/g, '')))) {
        return {
          standardizedName: item.name,
          partNumber: cleanAlphanumericCode(item.partNumber),
          ncm: cleanNcmCode(item.ncm),
          imageUrl: item.imageUrl,
          category: item.category,
          estimatedCost: item.cost,
          supplier: item.supplier,
          sourceUrl: item.directUrl,
          candidateListings: item.candidates
        };
      }
    }
  }

  // 3. Check knowledge base by keyword scoring — use lower threshold for full spec queries
  const isFullSpecQuery = raw.includes('|') || raw.includes('Tipo:') || raw.includes('Marca') || raw.includes('Aplicação');
  const matchThreshold = isFullSpecQuery ? 1 : 2;

  for (const item of knownProductKnowledgeBase) {
    const matchCount = item.keywords.filter(k => query.includes(k)).length;
    if (matchCount >= matchThreshold) {
      return {
        standardizedName: item.name,
        partNumber: cleanAlphanumericCode(item.partNumber),
        ncm: cleanNcmCode(item.ncm),
        imageUrl: item.imageUrl,
        category: item.category,
        estimatedCost: item.cost,
        supplier: item.supplier,
        sourceUrl: item.directUrl,
        candidateListings: item.candidates
      };
    }
  }

  // 4. Dynamic generation for arbitrary product queries
  const cleanName = (nameOrQuery.split('|')[0])
    .replace(/^item\s*\d*[:\-.]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Use the explicitly found part number if any, otherwise try to infer
  let generatedPartNumber = explicitCode ? cleanAlphanumericCode(explicitCode) : '';
  if (!generatedPartNumber) {
    const pnMatch = query.match(/(?:pn|p\/n|part\s*number|código|ref|referência|modelo)[:\s]*([a-zA-Z0-9\-_]{4,20})/i);
    generatedPartNumber = pnMatch ? cleanAlphanumericCode(pnMatch[1]) : '';
  }
  if (!generatedPartNumber) {
    const cleanToken = cleanName.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    generatedPartNumber = cleanToken.slice(0, 10) || `INF${Math.floor(10000 + Math.random() * 90000)}`;
  }

  // Category, NCM, Cost & Image heuristics
  let ncm = '84713019';
  let category = 'Informática & Tecnologia';
  let cost = 250.00;
  let defaultImage = 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=500&auto=format&fit=crop&q=80';
  let supplier = 'Mercado Livre / Vendedor Homologado';

  // Automotive / Mechanical Parts
  if (query.includes('kombi') || query.includes('direção') || query.includes('direcao') || query.includes('setor') || query.includes('veículo') || query.includes('carro') || query.includes('auto') || query.includes('motor') || query.includes('freio') || query.includes('suspensão') || query.includes('amortecedor') || query.includes('peça')) {
    category = 'Autopeças & Mecânica';
    supplier = 'Mercado Livre / Distribuidora de Peças Automotivas';
    
    if (query.includes('direção') || query.includes('direcao') || query.includes('setor') || query.includes('caixa')) {
      ncm = '87089481'; // Caixas de direção
      cost = 520.00;
      defaultImage = 'https://http2.mlstatic.com/D_NQ_NP_2X_784534-MLB54942918848_042023-F.webp';
      if (query.includes('kombi')) {
        generatedPartNumber = generatedPartNumber || '2374150531';
      }
    } else if (query.includes('freio') || query.includes('pastilha') || query.includes('disco')) {
      ncm = '87083090';
      cost = 180.00;
      defaultImage = 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=500&auto=format&fit=crop&q=80';
    } else if (query.includes('amortecedor') || query.includes('suspensão')) {
      ncm = '87088000';
      cost = 340.00;
      defaultImage = 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=500&auto=format&fit=crop&q=80';
    } else {
      ncm = '87089990';
      cost = 280.00;
      defaultImage = 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=500&auto=format&fit=crop&q=80';
    }
  } else if (query.includes('monitor') || query.includes('tela') || query.includes('display')) {
    ncm = '85285200';
    category = 'Monitores';
    cost = 950.00;
    defaultImage = 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Distribuição Monitores';
  } else if (query.includes('impressora') || query.includes('toner') || query.includes('cartucho') || query.includes('multifuncional')) {
    ncm = '84433111';
    category = 'Impressão';
    cost = 890.00;
    defaultImage = 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Fornecedores Oficiais';
  } else if (query.includes('ssd') || query.includes('disco') || query.includes('hd ') || query.includes('memória')) {
    ncm = '84717010';
    category = 'Armazenamento';
    cost = 320.00;
    defaultImage = 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Kingston Brasil';
  } else if (query.includes('teclado') || query.includes('mouse') || query.includes('headset')) {
    ncm = '84716052';
    category = 'Periféricos';
    cost = 180.00;
    defaultImage = 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Periféricos';
  } else if (query.includes('switch') || query.includes('roteador') || query.includes('cabo') || query.includes('rede')) {
    ncm = '85176239';
    category = 'Redes';
    cost = 650.00;
    defaultImage = 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Cisco & Mikrotik';
  } else if (query.includes('nobreak') || query.includes('estabilizador') || query.includes('fonte')) {
    ncm = '85044040';
    category = 'Energia';
    cost = 490.00;
    defaultImage = 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / APC & SMS';
  } else if (query.includes('organizador') || query.includes('suporte') || query.includes('mesa') || query.includes('cadeira')) {
    ncm = '39249000';
    category = 'Mobiliário & Utensílios';
    cost = 95.00;
    defaultImage = 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Tramontina Store';
  }

  // Build a precise Mercado Livre search URL from the clean product name + explicit code
  const searchTerms = [cleanName, explicitCode].filter(Boolean).join(' ');
  const mlSlug = searchTerms.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, '-');
  const directMarketplaceUrl = `https://lista.mercadolivre.com.br/${encodeURIComponent(mlSlug)}#D[A:${encodeURIComponent(searchTerms)}]`;

  return {
    standardizedName: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
    partNumber: cleanAlphanumericCode(generatedPartNumber),
    ncm: cleanNcmCode(ncm),
    imageUrl: defaultImage,
    category,
    estimatedCost: cost,
    supplier,
    sourceUrl: directMarketplaceUrl
  };
}
