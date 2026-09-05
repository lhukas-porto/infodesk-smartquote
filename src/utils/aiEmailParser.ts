export interface ParsedItem {
  name: string;
  description: string;
  rawSearchQuery?: string;
  quantity: number;
  unit: string;
  estimatedCost?: number;
  itemCode?: string;
  partNumber?: string;
  ncm?: string;
  imageUrl?: string;
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

// Common conversational sentences in emails that should never be items
const CONVERSATIONAL_PATTERNS = [
  /^(prezado|caro|olá|ola|bom dia|boa tarde|boa noite|oi\b)/i,
  /^(solicito|solicitamos|gostaria|favor|pedimos|segue|enviamos|encaminho|venho por meio)/i,
  /^(orçamento|cotacao|cotação|proposta|valores|preços|precos)\s+(para|de|dos|das|referente)/i,
  /^(em anexo|conforme|atenciosamente|att|grato|obrigado|agradeço|abraço|cordialmente)/i,
  /^(qualquer dúvida|ficamos à disposição|no aguardo|aguardo retorno|urgente)/i,
  /^(prazo de entrega|condições de pagamento|condicoes de pagamento|faturamento|local de entrega|dados para faturamento)/i,
  /^(cnpj|inscrição|inscricao|endereço|endereco|telefone|contato|e-mail|email)/i,
  /^(total|subtotal|vlr|valor total|valor unitário|condições)/i
];

function isConversationalLine(line: string): boolean {
  const lower = line.toLowerCase().trim();
  if (lower.length < 4) return true;
  return CONVERSATIONAL_PATTERNS.some(regex => regex.test(lower));
}

/**
 * Detects lines containing CNPJs, phone numbers, zip codes, URLs or registration numbers
 * that should NEVER be parsed as a product item.
 */
function isRegistrationOrContactLine(line: string): boolean {
  const clean = line.trim();
  // CNPJ pattern (formatted or broken like "00.180.842/0001-11" or "/0001-11")
  if (/\b\d{2}\.?\d{3}\.?\d{3}\/\d{4}-\d{2}\b/.test(clean)) return true;
  if (/^\/?\d{4}-\d{2}$/.test(clean)) return true;
  if (/\bcnpj\b|\bie\b|\binscrição\b/i.test(clean)) return true;
  // CEP pattern: "70000-000" or "CEP:"
  if (/\b\d{5}-\d{3}\b/.test(clean) || /\bcep\b/i.test(clean)) return true;
  // Phone/WhatsApp pattern
  if (/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\d{4}|\d{4})[-\s]?\d{4}\b/.test(clean) && !/[a-zA-Z]{4,}/.test(clean)) return true;
  // URLs or emails
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(clean) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return true;
  return false;
}

function isHeaderOrMetadata(line: string): boolean {
  const lower = line.toLowerCase().trim();
  if (!lower) return true;
  if (['req', 'descrição', 'descricao', 'qtd', 'quant', 'un', 'item', 'cód', 'cod', 'discriminacao', 'discriminação'].includes(lower)) return true;
  if (/^(convite enviado por|código da cotação|codigo da cotacao|rodada|empresa|cnpj|endereço de entrega|endereco de entrega|endereço de cobrança|endereco de cobranca|contato|email|e-mail|telefone|dados para faturamento|local de entrega)\b/i.test(lower)) return true;
  return isConversationalLine(line) || isRegistrationOrContactLine(line);
}


/**
 * Returns true if a line has strong signals of being an actual product:
 * - Starts with a quantity pattern: 1x, 2 UN, Item 1, 01 - ...
 * - Contains technical/product keywords with specs (ex: mm, cm, v, w, polegadas, cabo, disco, cadeira, etc.)
 * - Matches part-number or sku format
 */
function isLikelyProductStart(line: string): boolean {
  const clean = line.trim();
  if (isConversationalLine(clean) || isTableFooterLine(clean) || isAttributeLine(clean)) return false;

  // Numbered list: "1.", "1 -", "Item 1", "01)"
  if (/^(?:item\s*\d+|\d+[\.\)\-–])\s+/i.test(clean)) return true;

  // Quantity + Unit: "1 UN -", "5 pçs", "10 caixas de", "2x"
  if (/^\d+(?:[.,]\d+)?\s*(?:unidades?|un\.?|und\.?|pçs?|peças?|cx\.?|caixas?|kg|litros?|mts?|m²?|pares?|kits?|x)\b/i.test(clean)) return true;

  // Standalone product structure (ex: "Disco de Serra 250mm...", "Cadeira Giratória NR17...", "Monitor 27...")
  // Must not look like a conversational sentence (e.g. "Precisamos disso com urgência")
  const productNounPattern = /^(disco|cadeira|mesa|teclado|mouse|monitor|cabo|fonte|nobreak|switch|roteador|impressora|toner|cartucho|papel|bateria|lampada|lâmpada|ferramenta|parafuso|filtro|oleo|óleo|placa|modulo|módulo|leitor|suporte|armario|armário|gaveteiro|estante|projetor|sensor|adaptador|conversor|alicativo|alicativo|furadeira|parafusadeira|chave|conector|tubo|bomba|motor|válvula|valvula|pneu|rolamento|correia|engrenagem|disco|broca|solda|painel|disjuntor|rele|relé|transformador|camera|câmera|dvr|hd|ssd|memoria|memória|processador|gabinete|servidor|rack)\b/i;
  
  if (productNounPattern.test(clean) && clean.length >= 6) return true;

  return false;
}


/**
 * Returns true for lines that represent table footers, signatures or column-header rows
 * that must NOT be treated as product items.
 */
function isTableFooterLine(line: string): boolean {
  const lower = line.toLowerCase().trim();
  if (!lower || lower.length < 2) return true;
  // Footer keywords
  if (/^total\b/i.test(lower)) return true;
  if (/^subtotal\b/i.test(lower)) return true;
  if (/^(atenciosamente|att,?|grato,?|obrigado,?|abraços)/i.test(lower)) return true;
  // Column-header rows: lines that contain ONLY label words (no description words)
  if (/^(item|quant\.?|qtd\.?|un\.?|und\.?|vlr\.?|valor|unit\.?|total|descri|discrimin|material|especif)/i.test(lower) &&
    lower.length < 80 && /^[\w\s.,/]+$/.test(lower)) {
    // If the line itself looks like a header row (all caps labels)
    const words = lower.split(/\s+/);
    const headerWords = ['item', 'quant', 'qtd', 'un', 'und', 'vlr', 'valor', 'unit', 'total', 'descri', 'discrimin', 'material', 'especif'];
    const matchCount = words.filter(w => headerWords.some(h => w.startsWith(h))).length;
    if (matchCount >= 2) return true;
  }
  return false;
}

function parseQuantity(rawQty: string): number {
  if (!rawQty) return 1;
  const clean = rawQty.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const parsed = parseFloat(clean);
  return isNaN(parsed) || parsed <= 0 ? 1 : Math.round(parsed * 100) / 100;
}


/**
 * Enhanced HTML Table Parser supporting complex quotation tables:
 * - Multi-level headers (e.g. MATERIAL/SERVIÇO spanning top, sub-headers below)
 * - Headers: REQ, ITEM, TEXTO BREVE, DESCRIÇÃO TÉCNICA, MARCA, MODELO, QNTD/QUANTIDADE
 * - Sub-rows for Observações / Especificações Técnicas attached to the main item
 * - Inline product images (<img> tags)
 * - Table footer filtering (notes like "A marca pode ser substituída...")
 */
export function parseHtmlTable(html: string): ParsedItem[] {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tables = doc.querySelectorAll('table');
    if (!tables || tables.length === 0) return [];

    const items: ParsedItem[] = [];

    tables.forEach(table => {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length < 2) return;

      // 0. Check if table is a 2-column Key-Value Form / Portal Notification (e.g. CONVITE ENVIADO POR)
      // where column 0 has labels (Empresa, CNPJ, Endereço, Contato, Itens da Cotação, etc.)
      const isKeyValueCard = rows.some(r => {
        const firstCell = r.querySelector('th, td')?.textContent?.toLowerCase().trim() || '';
        return (
          firstCell.includes('itens da cotação') || 
          firstCell.includes('itens da cotacao') || 
          firstCell.includes('itens do pedido') ||
          firstCell.includes('itens solicitados') ||
          firstCell.includes('itens da proposta')
        );
      });

      if (isKeyValueCard) {
        rows.forEach(r => {
          const cells = Array.from(r.querySelectorAll('th, td'));
          if (cells.length >= 2) {
            const label = cells[0].textContent?.toLowerCase().trim() || '';
            if (
              label.includes('itens da cotação') || 
              label.includes('itens da cotacao') || 
              label.includes('itens do pedido') || 
              label.includes('itens solicitados') ||
              label.includes('itens da proposta')
            ) {
              // The items are located strictly in cells[1]!
              const valueCell = cells[1];
              if (valueCell.querySelector('table')) {
                const subTableItems = parseHtmlTable(valueCell.innerHTML);
                items.push(...subTableItems);
              } else {
                const textContent = valueCell.textContent?.trim() || '';
                const extracted = parseSmartText(textContent);
                if (extracted.length > 0) {
                  items.push(...extracted);
                } else if (textContent.length > 3) {
                  const match = textContent.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Z]{1,5})\s*[-–]\s*(.+)$/);
                  if (match) {
                    items.push({
                      name: match[3].trim(),
                      description: '',
                      rawSearchQuery: match[3].trim(),
                      quantity: parseQuantity(match[1]),
                      unit: match[2].toUpperCase().startsWith('CX') ? 'Cx.' : 'Un.',
                      estimatedCost: 150,
                      sourceUrl: `https://lista.mercadolivre.com.br/${encodeURIComponent(match[3].trim())}`
                    });
                  }
                }
              }
            }
          }
        });
        return;
      }

      // 1. Identify Header Row (look in the first 4 rows for the row with most column indicators)
      let headerRowIdx = -1;
      let bestScore = 0;

      for (let r = 0; r < Math.min(rows.length, 4); r++) {
        const cells = Array.from(rows[r].querySelectorAll('th, td'));
        let score = 0;
        cells.forEach(c => {
          const t = c.textContent?.toLowerCase().trim() || '';
          if (/\b(qntd|qtd|quant|quantidade)\b/i.test(t)) score += 3;
          if (/\b(texto breve|item\s*\(material\)|descri[çc][aã]o|especifica[çc][aã]o|discrimin|material|produto)\b/i.test(t)) score += 3;
          if (/\b(marca|fabricante|origem)\b/i.test(t)) score += 2;
          if (/\b(modelo|model|ref|req|c[oó]digo)\b/i.test(t)) score += 2;
          if (t === 'item' || t === 'un' || t === 'und') score += 1;
        });

        if (score > bestScore) {
          bestScore = score;
          headerRowIdx = r;
        }
      }

      if (headerRowIdx === -1 || bestScore < 3) {
        // Not a standard product table
        return;
      }

      // 2. Map Column Indices from the identified Header Row
      const headerCells = Array.from(rows[headerRowIdx].querySelectorAll('th, td'));
      let qtyColIdx = -1;
      let unitColIdx = -1;
      let shortNameColIdx = -1;
      let descColIdx = -1;
      let brandColIdx = -1;
      let modelColIdx = -1;
      let reqColIdx = -1;
      let itemNumColIdx = -1;

      headerCells.forEach((cell, idx) => {
        const text = cell.textContent?.toLowerCase().trim() || '';
        
        if (/\b(qntd|qtd|quant|quantidade)\b/i.test(text)) {
          qtyColIdx = idx;
        } else if (/\b(und|unidade)\b/i.test(text) || text === 'un') {
          unitColIdx = idx;
        } else if (/\b(texto breve|item\s*\(material\)|material|produto)\b/i.test(text)) {
          shortNameColIdx = idx;
        } else if (/\b(descri[çc][aã]o|especifica[çc][aã]o|especifica[çc][oõ]es|detalhes|discrimin)\b/i.test(text)) {
          descColIdx = idx;
        } else if (/\b(marca|fabricante|marca\/origem|marca\/fabricante)\b/i.test(text)) {
          brandColIdx = idx;
        } else if (/\b(modelo|model)\b/i.test(text)) {
          modelColIdx = idx;
        } else if (/\b(req|c[oó]digo|codigo|ref|refer[eê]ncia|part\s*number|p\/n|pn)\b/i.test(text)) {
          reqColIdx = idx;
        } else if (text === 'item' || text === 'nº' || text === 'n') {
          // If next rows have "UND", "UN", this column is unit; otherwise item number
          itemNumColIdx = idx;
        }
      });

      // If unit column wasn't explicitly named but itemNum column exists and first data row has "UND"/"UN", assign unitColIdx
      const firstDataRow = rows[headerRowIdx + 1];
      if (firstDataRow && itemNumColIdx >= 0 && unitColIdx < 0) {
        const sampleCellText = firstDataRow.querySelectorAll('td, th')[itemNumColIdx]?.textContent?.trim().toUpperCase() || '';
        if (['UND', 'UN', 'PC', 'PÇ', 'CX', 'KG', 'M', 'LT'].includes(sampleCellText)) {
          unitColIdx = itemNumColIdx;
          itemNumColIdx = -1;
        }
      }

      // If no separate shortName column, let descCol serve as name
      if (shortNameColIdx < 0 && descColIdx >= 0) {
        shortNameColIdx = descColIdx;
      } else if (descColIdx < 0 && shortNameColIdx >= 0) {
        descColIdx = shortNameColIdx;
      }

      // If neither was identified, check if there are at least 2 columns
      if (shortNameColIdx < 0 && descColIdx < 0) {
        // Fallback: use first non-qty column
        headerCells.forEach((_, idx) => {
          if (idx !== qtyColIdx && shortNameColIdx < 0) {
            shortNameColIdx = idx;
            descColIdx = idx;
          }
        });
      }

      if (shortNameColIdx < 0 && qtyColIdx < 0) return;

      // 3. Process Data Rows
      const dataRows = rows.slice(headerRowIdx + 1);
      let lastItem: ParsedItem | null = null;

      dataRows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (cells.length === 0) return;

        const fullRowText = cells.map(c => c.textContent?.trim() || '').join(' ').trim();
        const fullRowLower = fullRowText.toLowerCase();

        // 3a. Ignore table footer or generic condition lines
        if (
          fullRowLower.includes('a marca pode ser substituída') ||
          fullRowLower.includes('marca pode ser substituida') ||
          fullRowLower.startsWith('total') ||
          fullRowLower.startsWith('subtotal') ||
          fullRowLower.includes('condições de pagamento') ||
          fullRowLower.includes('prazo de entrega')
        ) {
          return;
        }

        // 3b. Check for Observation / Sub-specs row attached to the previous item
        // e.g. Left cell: "Observações" and Right cell: technical specs
        const firstCellText = cells[0]?.textContent?.trim().toLowerCase() || '';
        const isObsRow = (
          firstCellText.includes('observa') ||
          firstCellText.includes('especifica') ||
          firstCellText.includes('detalhes') ||
          (cells.length <= 2 && (fullRowLower.includes('especificações técnicas') || fullRowLower.includes('especificacoes tecnicas') || fullRowLower.includes('frequência:')))
        );

        if (isObsRow && lastItem) {
          const obsContent = cells.slice(cells.length > 1 ? 1 : 0).map(c => c.textContent?.trim() || '').filter(Boolean).join('\n');
          if (obsContent) {
            lastItem.description = lastItem.description ? `${lastItem.description}\n${obsContent}` : obsContent;
            lastItem.rawSearchQuery = `${lastItem.rawSearchQuery} | ${obsContent.replace(/\s+/g, ' ')}`;
            // Extract potential part number / code from observations (e.g. "D026319", "SN: 300-01384")
            const subCodeMatch = obsContent.match(/\b([A-Z0-9]{5,15})\b/);
            if (subCodeMatch && !lastItem.itemCode) {
              lastItem.itemCode = subCodeMatch[1];
            }
          }
          return;
        }

        // 3c. Extract fields from regular item row
        let rawQty = qtyColIdx >= 0 && cells[qtyColIdx] ? cells[qtyColIdx].textContent?.trim() || '1' : '1';
        let rawUnit = unitColIdx >= 0 && cells[unitColIdx] ? cells[unitColIdx].textContent?.trim() || 'Un.' : 'Un.';
        let rawShortName = shortNameColIdx >= 0 && cells[shortNameColIdx] ? cells[shortNameColIdx].textContent?.trim() || '' : '';
        let rawDesc = descColIdx >= 0 && cells[descColIdx] ? cells[descColIdx].textContent?.trim() || '' : '';
        let rawBrand = brandColIdx >= 0 && cells[brandColIdx] ? cells[brandColIdx].textContent?.trim() || '' : '';
        let rawModel = modelColIdx >= 0 && cells[modelColIdx] ? cells[modelColIdx].textContent?.trim() || '' : '';
        let reqCode = reqColIdx >= 0 && cells[reqColIdx] ? cells[reqColIdx].textContent?.trim() || '' : '';

        // Extract inline image if present (ignore broken or internal cid: URLs)
        const imgElem = row.querySelector('img');
        let inlineImageUrl: string | undefined = imgElem?.getAttribute('src') || undefined;
        if (inlineImageUrl && (inlineImageUrl.startsWith('cid:') || (!inlineImageUrl.startsWith('http') && !inlineImageUrl.startsWith('data:')))) {
          inlineImageUrl = undefined;
        }

        // Clean up multi-line descriptions inside a single cell (e.g. Kombi example)
        let detailedLines: string[] = [];
        if (rawDesc) {
          detailedLines = rawDesc.split(/\n|<br\s*\/?>/i).map(l => l.trim()).filter(Boolean);
        }

        // If no shortName was provided, use the first line of the detailed description
        let mainName = rawShortName || detailedLines[0] || rawDesc;

        // Skip invalid or conversational rows
        if (!mainName || mainName.length < 3 || isHeaderOrMetadata(mainName) || isConversationalLine(mainName)) {
          return;
        }

        // Clean up brand if it includes label "Marca: X"
        if (rawBrand) {
          rawBrand = rawBrand.replace(/^marca[:\s]*/i, '').trim();
        }
        if (rawModel) {
          rawModel = rawModel.replace(/^modelo[:\s]*/i, '').trim();
        }

        // If brand/model were not separate columns, extract from multiline specs if present
        if (!rawBrand) {
          const brandMatch = rawDesc.match(/(?:marca|marca\/origem|fabricante)[:\s]+([^\n\r,;]+)/i);
          if (brandMatch) rawBrand = brandMatch[1].trim();
        }
        if (!reqCode) {
          const codeMatch = rawDesc.match(/(?:código\/referência|código|referência|ref|cód)[:\s.]+([A-Za-z0-9\-_.]+)/i);
          if (codeMatch) reqCode = codeMatch[1].trim();
        }

        // Format clean standardized product name
        let formattedName = mainName;
        if (rawBrand && !formattedName.toLowerCase().includes(rawBrand.toLowerCase())) {
          formattedName = `${formattedName} - ${rawBrand}`;
        }
        if (rawModel && !formattedName.toLowerCase().includes(rawModel.toLowerCase())) {
          formattedName = `${formattedName} (${rawModel})`;
        }

        // Normalize unit
        const u = rawUnit.toUpperCase();
        let normalizedUnit = 'Un.';
        if (u.includes('CX') || u.includes('CAIXA')) normalizedUnit = 'Cx.';
        else if (u.includes('KG')) normalizedUnit = 'Kg';
        else if (u.includes('LT') || u.includes('LITRO')) normalizedUnit = 'Lt.';
        else if (u.includes('MT') || u.includes('METRO')) normalizedUnit = 'M';
        else if (u.includes('PAR')) normalizedUnit = 'Par';
        else if (u.includes('KIT')) normalizedUnit = 'Kit';

        const qty = parseQuantity(rawQty);

        // Build comprehensive search query preserving all technical keywords
        const searchParts = [
          formattedName,
          reqCode,
          rawBrand,
          rawModel,
          ...detailedLines.slice(1)
        ].filter(Boolean);
        const fullSearchRef = Array.from(new Set(searchParts)).join(' - ');
        const searchQuery = encodeURIComponent(fullSearchRef.slice(0, 180).trim());

        const parsedItem: ParsedItem = {
          name: formattedName.slice(0, 120).trim(),
          description: rawDesc !== mainName ? rawDesc : '',
          rawSearchQuery: fullSearchRef,
          quantity: qty,
          unit: normalizedUnit,
          itemCode: reqCode || undefined,
          imageUrl: inlineImageUrl,
          estimatedCost: 150,
          sourceUrl: `https://www.google.com/search?q=${searchQuery}`
        };

        items.push(parsedItem);
        lastItem = parsedItem;
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
  const items: ParsedItem[] = []

  // ─── TABULAR TEXT FORMAT DETECTOR ─────────────────────────────────────────
  // Detects emails formatted as plain-text tables like:
  //   ITEM  QUANT.  UN.  DISCRIMINAÇÃO  VLR. UNIT.  VALOR TOTAL
  //   1     5       UN.  CADEIRA P/ ARQUIBANCADAS NA COR AZUL   -
  //
  // Strategy: look for a header row containing "discrimin" (or "descri" / "material")
  // alongside "quant" or "qtd" — then parse subsequent data rows.
  const tableHeaderLineIdx = lines.findIndex(l => {
    const lower = l.toLowerCase();
    return (
      (lower.includes('discrimin') || lower.includes('descri') || lower.includes('especif') || lower.includes('material')) &&
      (lower.includes('quant') || lower.includes('qtd') || lower.includes('un.') || lower.includes('item'))
    );
  });

  if (tableHeaderLineIdx >= 0) {
    // Parse columns from the header
    const headerLine = lines[tableHeaderLineIdx].toLowerCase();
    // Find column keyword positions by splitting on 2+ spaces or tab
    const headerParts = lines[tableHeaderLineIdx].split(/\s{2,}|\t/).map(p => p.trim());

    // Map column indices
    let itemColIdx = -1, qtyColIdx = -1, unColIdx = -1, descColIdx = -1;
    headerParts.forEach((h, idx) => {
      const hl = h.toLowerCase();
      if (hl === 'item' || hl === 'nº' || hl === 'n') itemColIdx = idx;
      else if (hl.startsWith('quant') || hl.startsWith('qtd') || hl === 'q') qtyColIdx = idx;
      else if (hl === 'un.' || hl === 'un' || hl === 'und' || hl === 'unidade') unColIdx = idx;
      else if (hl.startsWith('discrimin') || hl.startsWith('descri') || hl.startsWith('material') || hl.startsWith('especif')) descColIdx = idx;
    });
    // Fallback if split didn't work well — use regex heuristics on data rows
    const hasGoodColumns = descColIdx >= 0 || qtyColIdx >= 0;

    const dataLines = lines.slice(tableHeaderLineIdx + 1);
    for (const line of dataLines) {
      // Skip footer lines (TOTAL, subtotal, blank rows, signatures)
      if (isTableFooterLine(line)) continue;

      const parts = line.split(/\s{2,}|\t/).map(p => p.trim());
      if (parts.length < 2) continue;

      let qty = 1;
      let unit = 'Un.';
      let descRaw = '';

      if (hasGoodColumns && parts.length >= 3) {
        // Use detected column positions
        if (qtyColIdx >= 0 && parts[qtyColIdx]) qty = parseQuantity(parts[qtyColIdx]);
        if (unColIdx >= 0 && parts[unColIdx]) {
          const u = parts[unColIdx].toLowerCase();
          unit = u.startsWith('cx') ? 'Cx.' : u.startsWith('kg') ? 'Kg' : 'Un.';
        }
        if (descColIdx >= 0 && parts[descColIdx]) {
          descRaw = parts.slice(descColIdx).join(' ');
        } else {
          // Take the longest part as description
          descRaw = parts.reduce((a, b) => (b.length > a.length ? b : a), '');
        }
      } else {
        // Fallback: first numeric = qty, first short alpha = unit, rest = description
        const firstNumMatch = line.match(/^(\d+)\s+(\d+(?:[.,]\d+)?)\s+(un\.?|cx\.?|kg|pç\.?|pc\.?)\s+(.+)$/i);
        if (firstNumMatch) {
          // "1  5  UN.  CADEIRA ..."  format
          qty = parseQuantity(firstNumMatch[2]);
          unit = firstNumMatch[3].toLowerCase().startsWith('cx') ? 'Cx.' : 'Un.';
          descRaw = firstNumMatch[4];
        } else {
          descRaw = parts.reduce((a, b) => (b.length > a.length ? b : a), '');
          const numericParts = parts.filter(p => /^\d+([.,]\d+)?$/.test(p));
          if (numericParts.length >= 2) qty = parseQuantity(numericParts[1]);
          else if (numericParts.length === 1) qty = parseQuantity(numericParts[0]);
        }
      }

      // Clean up description — remove trailing dashes, prices, asterisks
      descRaw = descRaw.replace(/\*+/g, '').replace(/\s*[-–]\s*$/, '').replace(/R?\$[\d.,\s]+$/, '').trim();
      if (!descRaw || descRaw.length < 3) continue;
      if (isTableFooterLine(descRaw)) continue;

      const fullSearchContext = descRaw;
      const query = encodeURIComponent(fullSearchContext.slice(0, 200));
      items.push({
        name: descRaw.slice(0, 120).trim(),
        description: '',
        rawSearchQuery: fullSearchContext,
        quantity: qty,
        unit,
        estimatedCost: 150,
        sourceUrl: `https://lista.mercadolivre.com.br/${query}`
      });
    }

    // If we found items with the table parser, look for follow-up description lines (* description *)
    // and append them as rawSearchQuery context to the last parsed item
    if (items.length > 0) {
      const followUpLines = lines.slice(tableHeaderLineIdx + 1 + items.length);
      followUpLines.forEach(fl => {
        const clean = fl.replace(/\*/g, '').trim();
        if (clean.length > 5 && !isTableFooterLine(clean) && items.length > 0) {
          const last = items[items.length - 1];
          if (!last.rawSearchQuery?.includes(clean)) {
            last.rawSearchQuery = `${last.rawSearchQuery} | ${clean}`;
          }
        }
      });
      return items;
    }
  }
  // ─── END TABULAR DETECTOR ─────────────────────────────────────────────────

  let currentItem: {
    name: string;
    specs: string[];
    quantity: number;
    unit?: string;
    itemCode?: string;
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // If line starts with "Itens da Cotação: 2 UN..." or similar, strip prefix to parse the product
    const itemsHeaderMatch = line.match(/^(?:itens\s+da\s+cota[çc][aã]o|itens\s+do\s+pedido|itens\s+solicitados|itens\s+da\s+proposta)[:\s-]+(.+)$/i);
    if (itemsHeaderMatch) {
      line = itemsHeaderMatch[1].trim();
    }

    if (isHeaderOrMetadata(line)) continue;
    if (isTableFooterLine(line)) continue;

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

    // Pattern 1: Numbered item list (e.g. "1. Cabo flexível..." or "Item 01 - ...")
    // NOTE: Must strictly require a valid separator and NOT match CNPJ prefixes or date formats
    const numberedMatch = line.match(/^(?:item\s*(\d+)[:.‐-]?|(\d{1,3})[\.\)\-–]\s+)\s*(?:(\d+([.,]\d+)?)\s*(un|unidades?|pçs?|cx|x)?\s*(?:de|da|do)?)?\s*([a-zA-ZÀ-ÿ].+)$/i);
    
    // Pattern 2: Quantity prefix "5 unidades de ..."
    const qtyPrefixMatch = line.match(/^(\d{1,4})\s*(?:\([a-zA-Zà-ÿ\s]+\))?\s*(unidades?|un|peças?|pçs?|cx|caixas?|x)\s*(?:de|da|do)?\s*([a-zA-ZÀ-ÿ].+)$/i);

    // Pattern 3: "1 UN - Descrição do produto..." or "1 UN – descrição"
    // Handles lines like: "1 UN - Disco de Serra Circular 250 x 30 mm com 80 Dentes LU3A0200 -"
    const qtyUnitDashMatch = line.match(/^(\d+(?:[.,]\d+)?)\s+(UN\.?|UNID\.?|CX\.?|KG\.?|PC\.?|PÇ\.?|MT?\.?|LT?\.?|M²?|ROLO|PARES?|KITS?)\s*[-–]\s*([a-zA-ZÀ-ÿ0-9].+?)(?:\s*[-–]\s*)?$/i);

    if (numberedMatch || qtyPrefixMatch || qtyUnitDashMatch) {
      let namePart = '';
      let rawQty = '1';
      let unit = 'Un.';

      if (qtyUnitDashMatch) {
        rawQty = qtyUnitDashMatch[1];
        const unitStr = qtyUnitDashMatch[2];
        namePart = qtyUnitDashMatch[3].replace(/\s*[-–]\s*$/, '').trim();
        unit = unitStr.toLowerCase().startsWith('cx') ? 'Cx.'
          : unitStr.toLowerCase().startsWith('kg') ? 'Kg'
          : unitStr.toLowerCase().startsWith('lt') || unitStr.toLowerCase() === 'l' ? 'Lt.'
          : 'Un.';
      } else if (numberedMatch) {
        rawQty = numberedMatch[3] || '1';
        namePart = numberedMatch[6].trim();
        unit = numberedMatch[5]?.toLowerCase().startsWith('cx') ? 'Cx.' : 'Un.';
      } else if (qtyPrefixMatch) {
        rawQty = qtyPrefixMatch[1];
        const unitStr = qtyPrefixMatch[2];
        namePart = qtyPrefixMatch[3].trim();
        unit = unitStr.toLowerCase().startsWith('cx') ? 'Cx.' : 'Un.';
      }

      // Check if extracted name is actually metadata, CNPJ or contact
      if (isHeaderOrMetadata(namePart) || isRegistrationOrContactLine(namePart) || isConversationalLine(namePart)) {
        continue;
      }

      // Save previous item
      if (currentItem && currentItem.name) {
        const fullSearchContext = Array.from(new Set([currentItem.name, ...currentItem.specs])).filter(Boolean).join(' | ');
        const query = encodeURIComponent(`${fullSearchContext} ${currentItem.itemCode || ''}`.slice(0, 200).trim());
        items.push({
          name: currentItem.name,
          description: '',
          rawSearchQuery: [fullSearchContext, currentItem.itemCode].filter(Boolean).join(' | '),
          quantity: currentItem.quantity || 1,
          unit: currentItem.unit || 'Un.',
          itemCode: currentItem.itemCode,
          estimatedCost: 150,
          sourceUrl: `https://www.google.com/search?q=${query}`
        });
      }

      currentItem = { name: namePart, specs: [namePart], quantity: parseQuantity(rawQty), unit };
      continue;
    }

    // Detect orphaned reference/part-number line following a product item
    // e.g. "FREUD-F03FS05061-000" — standalone alphanumeric code, no spaces or description words
    const isOrphanRefCode = /^[A-Z][A-Z0-9]{1,15}[-\/][A-Z0-9\-]{3,25}$/i.test(line) && line.split(' ').length <= 2;
    if (isOrphanRefCode && currentItem && !isRegistrationOrContactLine(line)) {
      currentItem.itemCode = line.trim();
      currentItem.specs.push(line.trim());
      continue;
    }

    // If we already have an active item and this line is part of its specifications for search reference
    if (currentItem && currentItem.name) {
      if (line.length > 2 && !isConversationalLine(line) && !isRegistrationOrContactLine(line)) {
        currentItem.specs.push(line);
      }
    } else if (isLikelyProductStart(line) && !isRegistrationOrContactLine(line)) {
      // Only start an item if the line actually looks like a product (has noun/specs, not greeting or conversational)
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
      description: '',
      rawSearchQuery: fullSearchContext,
      quantity: currentItem.quantity || 1,
      unit: currentItem.unit || 'Un.',
      itemCode: currentItem.itemCode,
      estimatedCost: 150,
      sourceUrl: `https://www.google.com/search?q=${query}`
    });
  }

  // Final validation: filter out any accidental conversational items or contact/CNPJ lines
  const validItems = items.filter(it => {
    const n = it.name.toLowerCase().trim();
    if (n.length < 3) return false;
    if (isConversationalLine(n)) return false;
    if (isRegistrationOrContactLine(n)) return false;
    if (isTableFooterLine(n)) return false;
    // Quantity sanity check: reject unreal quantities generated by CNPJ fragments (ex: > 100,000 without keyword)
    if (it.quantity > 50000 && !/^(parafuso|arruela|rebite|prego|resistor|capacitor|conector)\b/i.test(n)) {
      return false;
    }
    return true;
  });

  return validItems;
}



/**
 * Helper to convert HTML to clean plain text with preserved linebreaks.
 */
function htmlToPlainText(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Replace breaks with newlines
    doc.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
    // Append newlines to block elements
    doc.querySelectorAll('tr, p, div, li, h1, h2, h3, h4, td, th').forEach(el => el.append('\n'));
    return doc.body.textContent || '';
  } catch {
    return html.replace(/<[^>]+>/g, '\n');
  }
}

/**
 * Unified extractor for both HTML emails (with tables) and plain text.
 */
export function extractItemsFromEmailContent(rawTextOrHtml: string): ParsedItem[] {
  if (!rawTextOrHtml || rawTextOrHtml.trim().length === 0) return [];

  const isHtml = rawTextOrHtml.includes('<table') || rawTextOrHtml.includes('<tr') || rawTextOrHtml.includes('</div>') || rawTextOrHtml.includes('</p>');

  if (isHtml) {
    // 1. Try extracting from true product HTML tables first
    const tableItems = parseHtmlTable(rawTextOrHtml);
    if (tableItems.length > 0) return tableItems;

    // 2. If no product table was found in the HTML, extract clean plain text and parse line-by-line
    const textContent = htmlToPlainText(rawTextOrHtml);
    const textItems = parseSmartText(textContent);
    if (textItems.length > 0) return textItems;
  }

  // 3. Fallback: Parse as raw text
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
  // 1. Procurar nome de empresa entre colchetes no Assunto (padrão muito comum em portais corporativos)
  // Exemplo: Cotação-[018808][CONDOMINIO DO CONJUNTO COMERCIAL BRASILIA SHOPPING AND TOWERS]
  if (subject) {
    const bracketMatches = Array.from(subject.matchAll(/\[([A-Za-zÀ-ÿ0-9\s.\-&/]{4,90})\]/g));
    for (const bMatch of bracketMatches) {
      const candidate = bMatch[1].trim();
      // Descartar se for puramente números (ex: [018808]) ou tags de assunto gerais
      if (
        !/^\d+$/.test(candidate) && 
        !/^(cotação|cotacao|urgente|proposta|solicitação|pedido|sp|df|mg|rj|compras)$/i.test(candidate)
      ) {
        return candidate;
      }
    }
  }

  // 2. Procurar em tabelas estruturadas de convite/portal no corpo do e-mail
  // Exemplo: "Empresa: CONDOMINIO DO CONJUNTO COMERCIAL BRASILIA SHOPPING AND TOWERS"
  if (body) {
    const tableMatch = body.match(/(?:^|[\r\n\t])\s*(?:empresa|cliente|raz[aã]o\s+social|institui[çc][aã]o)\s*[:\t]+\s*([A-Za-zÀ-ÿ0-9\s.\-&/]{4,90})/i);
    if (tableMatch) {
      let candidate = tableMatch[1].trim();
      candidate = candidate.split(/\b(?:cnpj|endere[çc]o|contato|telefone|inscri[çc][aã]o|c[oó]digo|rodada)\b/i)[0].trim();
      if (
        candidate.length >= 4 &&
        !/^(foi convidada|solicita|gostaria|favor|prezado|informamos|acesso|portal|sua empresa)/i.test(candidate) &&
        !/^(solicitante|comprador|compras|empresa|cliente)$/i.test(candidate)
      ) {
        return candidate;
      }
    }
  }

  const fullText = `${senderCompany} ${senderName} ${subject} ${body}`;

  // 3. Verificar empresas conhecidas ou condomínios expressos
  const knownCompanies = [
    { name: 'Iate Clube de Brasília', keywords: ['iate clube', 'iatebsb', 'iate de brasilia'] },
    { name: 'Universidade Brasileira de Educação Católica - UBEC', keywords: ['ubec', 'educação católica', 'catolica de brasilia', 'unileste', 'catolica de santa catarina'] },
    { name: 'Casa Shopping Paulo Octávio', keywords: ['paulo octávio', 'paulo octavio', 'pauloctavio', 'casa shopping'] },
    { name: 'CNC — Confederação Nacional do Comércio', keywords: ['cnc', 'confederação nacional do comércio', 'confederacao nacional do comercio'] },
    { name: 'Inframerica Concessionária do Aeroporto de Brasília', keywords: ['inframerica', 'aeroporto de brasília', 'aeroporto de brasilia'] },
    { name: 'Condomínio Shopping Terraço', keywords: ['terraço shopping', 'terraco shopping'] }
  ];

  const lower = fullText.toLowerCase();
  for (const comp of knownCompanies) {
    if (comp.keywords.some(k => lower.includes(k))) {
      return comp.name;
    }
  }

  // 4. Procurar nomes que comecem com CONDOMÍNIO / SHOPPING no texto
  const condoMatch = fullText.match(/\b(CONDOM[IÍ]NIO\s+[A-ZÀ-ÿ0-9\s.\-&/]{6,70})\b/i);
  if (condoMatch) {
    const c = condoMatch[1].trim().replace(/[\n\r]+/g, ' ');
    if (c.length >= 10 && !c.toLowerCase().includes('foi convidada')) return c;
  }

  // 5. Procurar nomes institucionais explícitos (Universidades, Clubes, Hospitais, Fundações, etc.)
  const explicitMatch = fullText.match(/(?:Centro Universit[aá]rio|Universidade|Faculdade|Col[eé]gio|Hospital|Fundação|Instituto|Prefeitura|Secretaria|Tribunal|Minist[eé]rio|C[aâ]mara|Associação|Ind[uú]stria|Com[eé]rcio|Distribuidora|Transportadora|Iate\s+Clube|Clube|Country\s+Club|Sindicato|Federa[çc][aã]o|Confedera[çc][aã]o|Conselho|Ordem|SESC|SENAC|SESI|SENAI)\s+[A-Za-zÀ-ÿ0-9\s.\-]{3,60}/i);
  if (explicitMatch) {
    let cleaned = explicitMatch[0].trim().replace(/[\n\r]+/g, ' ');
    // Se no assunto colou o nome do comprador após hífen (ex: "IATE CLUBE DE BRASÍLIA - DANIEL"):
    cleaned = cleaned.split(/\s*[-—]\s*(?:sr\.|sra\.|contato|comprador|[A-Z][a-z]+|[A-Z]{3,})/)[0].trim();
    if (cleaned.length > 5 && !/^(solicita|or[çc]amento|urgente|cota[çc][aã]o)/i.test(cleaned)) {
      return cleaned;
    }
  }

  // 6. Procurar rótulo explícito "Empresa:", "Cliente:" que EXIJA dois pontos ou tab (NÃO espaço solto!)
  const labelMatch = fullText.match(/(?:empresa|cliente|raz[aã]o\s+social|institui[çc][aã]o)[:\t]+\s*([A-Za-zÀ-ÿ0-9\s.\-&]{3,70})/i);
  if (labelMatch) {
    let candidate = labelMatch[1].trim();
    candidate = candidate.split(/\b(?:cnpj|endere[çc]o|contato|telefone|inscri[çc][aã]o|c[oó]digo|rodada)\b/i)[0].trim();
    if (
      candidate.length >= 3 && 
      !/^(foi convidada|solicita|gostaria|favor|prezado|informamos|acesso|portal|sua empresa)/i.test(candidate) &&
      !/^(solicitante|comprador|compras|empresa|cliente)$/i.test(candidate)
    ) {
      return candidate;
    }
  }

  // 7. Procurar sufixo societário (LTDA, S/A, ME, EPP, EIRELI) com limites estritos de palavra \b
  // ATENÇÃO: É terminantemente proibido casar com letras soltas sem limite de palavra (para não casar com "ORÇAMENTO" ou "daniel.melo")
  const corpMatch = fullText.match(/\b([A-ZÀ-ÿ0-9\s.&]{4,50}\s+\b(?:LTDA|S\/A|S\.A\.|ME|EPP|EIRELI)\b)/i);
  if (corpMatch) {
    const candidate = corpMatch[1].trim().replace(/[\n\r]+/g, ' ');
    if (
      !/^(solicita|or[çc]amento|urgente|cota[çc][aã]o|pedido|proposta|prezado)/i.test(candidate) &&
      !candidate.toLowerCase().includes('solicita') &&
      !candidate.toLowerCase().includes('orçamento') &&
      !candidate.toLowerCase().includes('orcamento')
    ) {
      return candidate;
    }
  }

  if (senderCompany && senderCompany.length > 3 && !senderCompany.includes('@') && !senderCompany.toLowerCase().includes('solicitante')) {
    return senderCompany;
  }

  // Se não encontrou, NUNCA inventar: retorna vazio!
  return '';
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
    { city: 'Joinville - SC', keywords: ['joinville', 'joinvile', 'santa catarina', 'sc '] },
    { city: 'Itabira - MG', keywords: ['itabira'] },
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
 * Converte número para extenso em português
 */
export function getPortugueseNumberWord(num: number): string {
  const map: Record<number, string> = {
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
    24: 'vinte e quatro',
    25: 'vinte e cinco',
    28: 'vinte e oito',
    30: 'trinta',
    36: 'trinta e seis',
    45: 'quarenta e cinco',
    60: 'sessenta',
    90: 'noventa'
  };
  return map[num] || num.toString();
}

/**
 * Generates the standardized official phrase: "em até 10 (dez) dias úteis após autorização de fornecimento."
 */
export function formatDeliveryDaysText(daysCount: number): string {
  const count = Math.max(1, Math.round(daysCount));
  const word = numberToPortugueseWords[count] || getPortugueseNumberWord(count);
  const dayUnit = count === 1 ? 'dia útil' : 'dias úteis';
  const padded = count < 10 ? `0${count}` : `${count}`;
  return `em até ${padded} (${word}) ${dayUnit} após autorização de fornecimento.`;
}

/**
 * Generates the standardized official phrase with optional item exceptions:
 * Ex: "em até 10 (dez) dias úteis após autorização de fornecimento. Exceto para os itens 1, 3 e 4 em até 20 (vinte) dias úteis após autorização de fornecimento."
 */
export function formatDeliveryDaysWithException(
  standardDays: number,
  exceptionItemNumbers: number[] = [],
  exceptionDays?: number
): string {
  const basePhrase = formatDeliveryDaysText(standardDays);
  if (!exceptionItemNumbers || exceptionItemNumbers.length === 0 || !exceptionDays) {
    return basePhrase;
  }

  const sorted = [...new Set(exceptionItemNumbers)].sort((a, b) => a - b);
  let itemsStr = '';
  if (sorted.length === 1) {
    itemsStr = `o item ${sorted[0]}`;
  } else if (sorted.length === 2) {
    itemsStr = `os itens ${sorted[0]} e ${sorted[1]}`;
  } else {
    const last = sorted[sorted.length - 1];
    const initial = sorted.slice(0, -1).join(', ');
    itemsStr = `os itens ${initial} e ${last}`;
  }

  const excCount = Math.max(1, Math.round(exceptionDays));
  const excWord = numberToPortugueseWords[excCount] || getPortugueseNumberWord(excCount);
  const excDayUnit = excCount === 1 ? 'dia útil' : 'dias úteis';
  const excPadded = excCount < 10 ? `0${excCount}` : `${excCount}`;

  return `${basePhrase} Exceto para ${itemsStr} em até ${excPadded} (${excWord}) ${excDayUnit} após autorização de fornecimento.`;
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
 * Extracts exception items and exception days from delivery phrase if present:
 * Ex: "... Exceto para o item 1 em até 25 (vinte e cinco) dias úteis..."
 */
export function extractDeliveryExceptionDetails(text: string | undefined): { itemNumbers: number[]; days: number; hasException: boolean } {
  if (!text || !text.includes('Exceto para')) {
    return { itemNumbers: [], days: 20, hasException: false };
  }

  const parts = text.split(/Exceto para/i);
  const exceptionPart = parts[1] || '';

  // Extract days from the exception part (ex: "em até 25 (vinte e cinco) dias úteis")
  const daysMatch = exceptionPart.match(/em até (\d+)/i) || exceptionPart.match(/(\d+)\s*(?:\([^)]+\)\s*)?dias/i);
  const days = daysMatch ? parseInt(daysMatch[1], 10) : 20;

  // Extract item numbers before "em até"
  const itemNumbers: number[] = [];
  const itemsSection = exceptionPart.split(/em até/i)[0] || '';
  const numMatches = itemsSection.match(/\d+/g);
  if (numMatches) {
    numMatches.forEach(n => {
      const parsed = parseInt(n, 10);
      if (!isNaN(parsed) && parsed > 0 && !itemNumbers.includes(parsed)) {
        itemNumbers.push(parsed);
      }
    });
  }

  return {
    itemNumbers,
    days,
    hasException: itemNumbers.length > 0
  };
}

/**
 * Formata Validade da Proposta no padrão oficial Infodesk: "05 (cinco) dias ou enquanto durar o estoque."
 */
export function formatValidityDaysText(daysCount: number): string {
  const count = Math.max(1, Math.round(daysCount));
  const word = getPortugueseNumberWord(count);
  const dayUnit = count === 1 ? 'dia' : 'dias';
  const padded = count < 10 ? `0${count}` : `${count}`;
  return `${padded} (${word}) ${dayUnit} ou enquanto durar o estoque.`;
}

export function extractValidityDaysNumber(text: string | undefined): number {
  if (!text) return 5;
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 5;
}

/**
 * Formata Condições de Pagamento: "30 dias" ou "A vista" ou "28 dias faturado"
 */
export function formatPaymentTermsDays(daysCount: number): string {
  if (daysCount === 0) return 'À vista.';
  return `${daysCount} dias`;
}

export function extractPaymentDaysNumber(text: string | undefined): number {
  if (!text) return 30;
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 30;
}

/**
 * Formata Termos de Garantia: "12 (doze) meses balcão para defeitos de fabricação."
 */
export function formatWarrantyMonthsText(monthsCount: number): string {
  const count = Math.max(1, Math.round(monthsCount));
  const word = getPortugueseNumberWord(count);
  const unit = count === 1 ? 'mês' : 'meses';
  const padded = count < 10 ? `0${count}` : `${count}`;
  return `${padded} (${word}) ${unit} balcão para defeitos de fabricação.`;
}

export function extractWarrantyMonthsNumber(text: string | undefined): number {
  if (!text) return 12;
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 12;
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
 * Identifica e padroniza a Categoria Comercial do produto com base no código NCM Fiscal oficial (8 dígitos).
 * O NCM é a Nomenclatura Comum do Mercosul, dividida em Capítulos (2 dígitos), Posições (4 dígitos) e Subposições.
 */
export function getCategoryFromNcm(ncmCode: string | undefined, fallbackCategory?: string): string {
  if (!ncmCode) return fallbackCategory || 'Geral';
  const clean = ncmCode.replace(/\D/g, '').padEnd(8, '0');
  const cap = clean.slice(0, 2);
  const pos = clean.slice(0, 4);

  // 1. Alimentos, Bebidas, Café e Copa
  if (pos === '0901') return 'Café, Chás & Matinais';
  if (pos === '0902' || pos === '0903') return 'Chás & Infusões';
  if (cap === '09') return 'Café, Chás & Especiarias';
  if (pos === '1701' || pos === '1702' || pos === '1704') return 'Açúcar & Doces';
  if (pos === '1806') return 'Chocolates & Bomboniere';
  if (pos === '1905') return 'Biscoitos & Snacks';
  if (pos === '2101') return 'Café Solúvel & Extratos';
  if (cap === '21') return 'Alimentos & Mercearia';
  if (pos === '2201' || pos === '2202') return 'Águas, Sucos & Bebidas';
  if (cap === '22') return 'Bebidas & Líquidos';

  // 2. Embalagens, Descartáveis, Limpeza e Higiene
  if (pos === '3923') return 'Embalagens & Descartáveis';
  if (pos === '3924') return 'Utilidades Domésticas & Plásticos';
  if (pos === '3926') return 'Artigos Plásticos & Acessórios';
  if (cap === '39') return 'Plásticos & Polímeros';
  if (pos === '4818') return 'Papéis Higiênicos & Guardanapos';
  if (pos === '4819') return 'Caixas & Embalagens de Papelão';
  if (pos === '4820') return 'Papelaria & Cadernos';
  if (cap === '48') return 'Papelaria & Escritório';
  if (pos === '3401' || pos === '3402') return 'Limpeza & Higiene Profissional';
  if (cap === '34') return 'Produtos de Limpeza';
  if (cap === '33') return 'Higiene Pessoal & Cosméticos';

  // 3. Informática, Tecnologia e Automação (Capítulo 84 e 85)
  if (pos === '8471') {
    const sub = clean.slice(0, 6);
    if (sub === '847130') return 'Notebooks & Computadores Portáteis';
    if (sub === '847141' || sub === '847149' || sub === '847150') return 'Desktops & Servidores';
    if (sub === '847160') return 'Periféricos & Entrada de Dados';
    if (sub === '847170') return 'Armazenamento & SSDs';
    if (sub === '847180' || sub === '847190') return 'Componentes & Placas';
    return 'Informática & Tecnologia';
  }
  if (pos === '8443') return 'Impressoras, Multifuncionais & Toners';
  if (pos === '8470') return 'Calculadoras & Automação Comercial';
  if (pos === '8473') return 'Partes & Peças para Informática';

  // 4. Redes, Conectividade e Telecomunicações
  if (pos === '8517') {
    const sub = clean.slice(0, 6);
    if (sub === '851711' || sub === '851713' || sub === '851714') return 'Telefonia & Smartphones';
    if (sub === '851761' || sub === '851762') return 'Redes, Roteadores & Switches';
    if (sub === '851771' || sub === '851779') return 'Antenas & Telecomunicação';
    return 'Redes & Conectividade';
  }

  // 5. Monitores, Áudio e Vídeo
  if (pos === '8528') return 'Monitores & Telas Profissionais';
  if (pos === '8518') return 'Áudio, Caixas de Som & Headsets';
  if (pos === '8519' || pos === '8521' || pos === '8522') return 'Áudio & Vídeo';
  if (pos === '8525') return 'Câmeras, Webcams & CFTV';

  // 6. Energia, Fontes e Nobreaks
  if (pos === '8504') {
    const sub = clean.slice(0, 6);
    if (sub === '850440') return 'Nobreaks, Fontes & Conversores';
    return 'Transformadores & Energia';
  }
  if (pos === '8506' || pos === '8507') return 'Pilhas, Baterias & Nobreaks';
  if (pos === '8535' || pos === '8536' || pos === '8537') return 'Materiais Elétricos & Disjuntores';
  if (pos === '8544') return 'Cabos & Conectores';

  // 7. Eletrodomésticos, Refrigeração e Climatização
  if (pos === '8418') return 'Refrigeração, Geladeiras & Frigobares';
  if (pos === '8415') return 'Ar-Condicionado & Climatização';
  if (pos === '8414') return 'Ventilação, Coifas & Exaustores';
  if (pos === '8421') return 'Filtros & Purificadores de Água';
  if (pos === '8422') return 'Lava-Louças & Máquinas de Limpeza';
  if (pos === '8450') return 'Lavadoras & Secadoras';
  if (pos === '8516') return 'Eletroportáteis, Fornos & Micro-ondas';

  // 8. Válvulas, Tubos, Metais e Hidráulica Industrial
  if (pos === '8481') return 'Válvulas & Registros Industriais';
  if (pos === '8413') return 'Bombas Hidráulicas & Motores';
  if (pos === '7304' || pos === '7306' || pos === '7307') return 'Tubos & Conexões de Aço';
  if (pos === '7411' || pos === '7412') return 'Tubos & Conexões de Cobre';
  if (cap === '73' || cap === '76') return 'Metais & Estruturas';
  if (cap === '40') return 'Borrachas, Juntas & Vedações';

  // 9. Ferramentas, Segurança e EPI
  if (pos === '8203' || pos === '8204' || pos === '8205' || pos === '8206') return 'Ferramentas Manuais';
  if (pos === '8467') return 'Ferramentas Elétricas';
  if (cap === '82') return 'Ferramentas & Cutelaria';
  if (pos === '9004' || pos === '9020') return 'EPI & Proteção Individual';
  if (cap === '90') return 'Instrumentos de Medição & Óptica';

  // 10. Mobiliário e Escritório
  if (pos === '9401' || pos === '9403') return 'Mobiliário Corporativo & Cadeiras';
  if (pos === '9405') return 'Iluminação & Luminárias';
  if (cap === '94') return 'Mobiliário & Decoração';

  // 11. Veículos e Autopeças
  if (cap === '87') return 'Veículos & Autopeças';

  return fallbackCategory || 'Geral';
}

/**
 * Regra de arredondamento comercial solicitada por Lucas:
 * - Se os centavos estiverem abaixo de 0,50 (ex: 59,20), arredonda para baixo (ex: 59,00).
 * - Se os centavos estiverem iguais ou acima de 0,50 (ex: 59,50 ou 59,70), arredonda para cima (ex: 60,00).
 * Na prática: Math.round(rawPrice).
 */
export function applyCommercialPriceRounding(rawPrice: number): number {
  if (rawPrice <= 0) return 0;
  return Math.round(rawPrice);
}

/**
 * Calcula o Preço de Venda garantindo que a porcentagem de Lucro Líquido
 * incida diretamente sobre o Custo Real dos produtos, e o Imposto incida sobre o Preço de Venda.
 *
 * Regra de arredondamento:
 * Se os centavos estiverem abaixo de 0,50 -> arredonda para baixo (ex: 59,20 -> 59,00).
 * Se estiverem iguais ou acima de 0,50 -> arredonda para cima (ex: 59,50 -> 60,00).
 *
 * Exemplo prático:
 * Custo = R$ 18,90 | Lucro = 21% | Imposto = 9,1%
 * Preço Bruto = 18,90 * 1,21 / (1 - 0,091) = 25,158... -> Centavos abaixo de 0,50 -> R$ 25,00!
 */
export function calculateCommercialUnitPrice(
  costPrice: number,
  shippingCost: number = 0,
  profitMarginPercent: number = 20,
  taxPercent: number = 9.1
): number {
  const baseCost = Number(costPrice || 0) + Number(shippingCost || 0);
  if (baseCost <= 0) return 0;

  const taxRate = Number(taxPercent || 0) / 100;
  const marginRate = Number(profitMarginPercent || 0) / 100;
  const netDivisor = 1 - taxRate;

  // Evita divisão por zero se imposto >= 100%
  if (netDivisor <= 0.01) {
    return Math.round(baseCost * (1 + marginRate) / 0.01);
  }

  // Preço de venda com arredondamento padrão comercial (< 0.50 para baixo, >= 0.50 para cima)
  const rawPrice = (baseCost * (1 + marginRate)) / netDivisor;
  return Math.round(rawPrice);
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
    keywords: ['sacola', 'plastica', 'plástica', '25x35', '1000'],
    name: 'Sacola Plástica Alça Camiseta 25x35cm Branca (Pacote com 1000 Unidades)',
    partNumber: 'SAC-2535-1000',
    ncm: '39232190',
    imageUrl: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=500&auto=format&fit=crop&q=80',
    category: 'Embalagens & Descartáveis',
    cost: 48.00,
    supplier: '',
    directUrl: ''
  },
  {
    keywords: ['carbon block', 'frisbel', '4.1/2', 'filtro', '127815'],
    name: 'Refil Elemento Filtrante Carbon Block 4.1/2" Compatível Frisbel',
    partNumber: '127815',
    ncm: '84212100',
    imageUrl: '/carbon-block-frisbel.jpg',
    category: 'Filtros & Purificadores',
    cost: 32.00,
    supplier: '',
    directUrl: ''
  },
  {
    keywords: ['torneira boia', '1.1/2', 'caixa de água', 'caixa de agua', '127936'],
    name: 'Torneira Boia 1.1/2 Polegada para Caixa de Água Alta Vazão',
    partNumber: '127936',
    ncm: '84818099',
    imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=500&auto=format&fit=crop&q=80',
    category: 'Hidráulica',
    cost: 65.00,
    supplier: '',
    directUrl: ''
  },
  {
    keywords: ['base de corte', 'brw', 'dupla face a3', '127956'],
    name: 'Base de Corte Dupla Face A3 45x30cm BRW',
    partNumber: '127956',
    ncm: '39269090',
    imageUrl: 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=500&auto=format&fit=crop&q=80',
    category: 'Papelaria & Escritório',
    cost: 42.00,
    supplier: '',
    directUrl: ''
  },
  {
    keywords: ['antena', 'panorama', 'ebf-s4-5bl', 'd026319', 'rádio', 'radio', 'antenas'],
    name: 'Antena Móvel Panorama Antennas EBF-S4-5BL 450-470 MHz BNC Macho',
    partNumber: 'EBF-S4-5BL',
    ncm: '85177110',
    imageUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=80',
    category: 'Radiocomunicação & Antenas',
    cost: 280.00,
    supplier: '',
    directUrl: ''
  },
  {
    keywords: ['sepura', '300-01384', '30001384', 'sc2020', 'sc2021', 'cabo usb'],
    name: 'Cabo de Programação USB Sepura para Rádio SC2020 / SC2021 (300-01384)',
    partNumber: '30001384',
    ncm: '85444200',
    imageUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=80',
    category: 'Cabos & Conectores',
    cost: 350.00,
    supplier: '',
    directUrl: ''
  },
  {
    keywords: ['motorola', 'moto g35', 'g35', 'smartphone'],
    name: 'Smartphone Motorola Moto G35 5G 128GB 4GB RAM',
    partNumber: 'MOTOG35',
    ncm: '85171300',
    imageUrl: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=500&auto=format&fit=crop&q=80',
    category: 'Smartphones & Celulares',
    cost: 890.00,
    supplier: '',
    directUrl: ''
  },
  {
    keywords: ['samsung', 'galaxy tab', 'tab a11', 'tab a9', 'tablet', 'sansung'],
    name: 'Tablet Samsung Galaxy Tab A9/A11 64GB 4GB RAM Wi-Fi 8.7"',
    partNumber: 'SMX110',
    ncm: '84713012',
    imageUrl: 'https://images.unsplash.com/photo-1561154464-82e9adf32764?w=500&auto=format&fit=crop&q=80',
    category: 'Tablets',
    cost: 780.00,
    supplier: '',
    directUrl: ''
  },
  {
    keywords: ['rotulador', 'pt80', 'brother', 'eletrônico', 'pt-80'],
    name: 'Rotulador Eletrônico Portátil Brother PT80 Azul',
    partNumber: 'PT80',
    ncm: '84433299',
    imageUrl: 'https://m.media-amazon.com/images/I/71YyM5nZ0NL._AC_SL1500_.jpg',
    category: 'Identificação & Rotuladores',
    cost: 180.00,
    supplier: '',
    directUrl: ''
  },
  {
    keywords: ['refil', 'filtro', 'cix08ax', 'consul', 'purificador'],
    name: 'Refil Filtro Purificador de Água Consul CIX08AX',
    partNumber: 'CIX08AX',
    ncm: '84212100',
    imageUrl: 'https://images.unsplash.com/photo-1585837575652-267c041d77d4?w=500&auto=format&fit=crop&q=80',
    category: 'Filtros & Purificadores',
    cost: 89.00,
    supplier: '',
    directUrl: ''
  },
  {
    keywords: ['escada', 'aluminio', 'alumínio', 'degraus', '120kg'],
    name: 'Escada de Alumínio Doméstica Reforçada 120kg',
    partNumber: 'ESC-ALUM',
    ncm: '76169900',
    imageUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=500&auto=format&fit=crop&q=80',
    category: 'Ferramentas & Acesso',
    cost: 140.00,
    supplier: '',
    directUrl: ''
  },
  {
    keywords: ['relogio', 'relógio', 'parede', 'redondo'],
    name: 'Relógio de Parede Redondo Silencioso Fundo Branco 30cm',
    partNumber: 'REL-PAR',
    ncm: '91052100',
    imageUrl: 'https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?w=500&auto=format&fit=crop&q=80',
    category: 'Utilidades & Escritório',
    cost: 45.00,
    supplier: '',
    directUrl: ''
  },
  {
    keywords: ['post-it', 'post it', '3m', 'hb004657233', 'bloco de notas'],
    name: 'Bloco de Notas Adesivas Post-it 3M 76x76mm 540 folhas Multicor (HB004657233)',
    partNumber: 'HB004657233',
    ncm: '48201000',
    imageUrl: 'https://m.media-amazon.com/images/I/71wLp8n-2lL._AC_SL1500_.jpg',
    category: 'Papelaria & Escritório',
    cost: 28.50,
    supplier: '',
    directUrl: ''
  },
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

export type WordCaseStyle = 'uppercase' | 'lowercase' | 'sentence' | 'title';

/**
 * Aplica estilos de capitalização estilo Microsoft Word:
 * - 'uppercase': TODAS EM MAIÚSCULAS
 * - 'lowercase': todas em minúsculas
 * - 'sentence': Primeira da frase maiúscula
 * - 'title': Primeira De Cada Palavra Maiúscula (mantendo conectivos menores em minúsculo se aplicável)
 */
export function applyTextCase(text: string, style: WordCaseStyle): string {
  if (!text) return '';

  // Extrai e preserva espaços ou pontuações ao redor da palavra/seleção
  const match = text.match(/^(\s*)(.*?)(\s*)$/s);
  if (!match) return text;
  const [, leadingSpace, core, trailingSpace] = match;
  if (!core) return text;

  let transformed = core;

  switch (style) {
    case 'uppercase':
      transformed = core.toUpperCase();
      break;

    case 'lowercase':
      transformed = core.toLowerCase();
      break;

    case 'sentence': {
      // Primeira letra em maiúscula, restante em minúsculo
      transformed = core.charAt(0).toUpperCase() + core.slice(1).toLowerCase();
      break;
    }

    case 'title': {
      // Primeira de cada palavra em maiúscula
      const lowerConnectors = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'com', 'para', 'por', 'a', 'o', 'as', 'os', 'um', 'uma', 'no', 'na', 'nos', 'nas']);
      const words = core.split(/(\s+|[-/])/);
      transformed = words.map((w, idx) => {
        if (!w || /^\s+$/.test(w) || /^[-/]$/.test(w)) return w;
        const lower = w.toLowerCase();
        // Preservar minúsculo para conectivos no meio da frase
        if (idx > 0 && lowerConnectors.has(lower)) {
          return lower;
        }
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }).join('');
      break;
    }

    default:
      transformed = core;
  }

  return leadingSpace + transformed + trailingSpace;
}

/**
 * Formata a descrição do produto com apenas a primeira letra em maiúscula
 * e todo o restante em minúsculo (sentence case estrito), conforme solicitado pelo usuário.
 * Ex: "CHÁ PRETO E VERDE TWININGS..." -> "Chá preto e verde twinings..."
 * Ex: "Cafe Torrado e Moido Tradicional Vacuo 500g" -> "Cafe torrado e moido tradicional vacuo 500g"
 */
export function formatProductSentenceCase(text: string): string {
  return applyTextCase(text, 'sentence');
}

export function isExactProductUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase().trim();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return false;
  if (lower.includes('lista.mercadolivre.com.br')) return false;
  if (lower.includes('google.com') || lower.includes('google.com.br')) return false;
  if (lower.includes('amazon.com.br/s') || lower.includes('amazon.com/s')) return false;
  if (lower.includes('/busca') || lower.includes('/search') || lower.includes('search?') || lower.includes('query=') || lower.includes('#d[a:')) return false;
  return true;
}

export function extractStoreNameFromUrl(url?: string): string {
  if (!url) return '';
  try {
    let cleanUrl = url.trim();
    if (!cleanUrl) return '';

    // Se o usuário digitou sem protocolo (ex: kalunga.com.br ou www.kabum.com.br)
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    let hostname = '';
    try {
      const parsed = new URL(cleanUrl);
      hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      // Se a URL ainda está incompleta durante a digitação
      hostname = cleanUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
    }

    if (hostname.includes('mercadolivre') || hostname.includes('mercado-livre')) return 'Mercado Livre';
    if (hostname.includes('kabum')) return 'KaBuM!';
    if (hostname.includes('amazon')) return 'Amazon';
    if (hostname.includes('magazineluiza') || hostname.includes('magalu')) return 'Magazine Luiza';
    if (hostname.includes('dell')) return 'Dell Brasil';
    if (hostname.includes('lenovo')) return 'Lenovo';
    if (hostname.includes('samsung')) return 'Samsung';
    if (hostname.includes('apple')) return 'Apple';
    if (hostname.includes('pichau')) return 'Pichau';
    if (hostname.includes('terabyteshop') || hostname.includes('terabyte')) return 'Terabyte';
    if (hostname.includes('kalunga')) return 'Kalunga';
    if (hostname.includes('casasbahia')) return 'Casas Bahia';
    if (hostname.includes('pontofrio') || hostname.includes('ponto.')) return 'Ponto Frio';
    if (hostname.includes('extra.com')) return 'Extra';
    if (hostname.includes('fastshop')) return 'Fast Shop';
    if (hostname.includes('shopee')) return 'Shopee';
    if (hostname.includes('aliexpress')) return 'AliExpress';
    if (hostname.includes('fischer')) return 'Fischer Oficial';
    if (hostname.includes('eletrolux') || hostname.includes('electrolux')) return 'Electrolux';
    if (hostname.includes('brastemp')) return 'Brastemp';
    if (hostname.includes('consul')) return 'Consul';
    if (hostname.includes('suggar')) return 'Suggar';
    if (hostname.includes('philco')) return 'Philco';
    if (hostname.includes('leroymerlin')) return 'Leroy Merlin';
    if (hostname.includes('carrefour')) return 'Carrefour';

    // Para outros domínios, extrai o nome principal formatado (Ex: intelbras.com.br -> Intelbras)
    const basePart = hostname.split('.')[0];
    if (basePart && basePart.length > 2) {
      return basePart.charAt(0).toUpperCase() + basePart.slice(1);
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Busca e retorna a imagem correta em alta definição estritamente de acordo com a
 * Descrição Padronizada do Produto (Comercial).
 */
export function resolveImageForDescription(description: string): string {
  if (!description) return '';
  const query = description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 1. Match em catálogo de produtos conhecidos
  for (const item of knownProductKnowledgeBase) {
    if (item.imageUrl && item.keywords.some(k => query.includes(k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
      return item.imageUrl;
    }
  }

  // 2. Classificação precisa por termos da Descrição Padronizada Comercial
  if (query.includes('adega') || query.includes('vinho')) {
    return 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('cervejeira') || query.includes('cerveja')) {
    return 'https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('cooktop') || query.includes('fogao') || query.includes('inducao') || query.includes('bocas')) {
    return 'https://images.unsplash.com/photo-1588854337236-6889d631faa8?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('forno') || query.includes('microondas') || query.includes('micro-ondas')) {
    return 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('coifa') || query.includes('depurador') || query.includes('exaustor')) {
    return 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('refrigerador') || query.includes('geladeira') || query.includes('frost free') || query.includes('bottom')) {
    return 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('frigobar')) {
    return 'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('purificador') || query.includes('filtro') || query.includes('bebedouro') || query.includes('carbon block') || query.includes('refil')) {
    return 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('smart tv') || query.includes('televis') || query.includes('tv 4k') || query.includes('tv 65') || query.includes('tv 55') || query.includes('polegadas')) {
    return 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('churrasqueira') || query.includes('grill') || query.includes('espeto')) {
    return 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('cirandinha') || query.includes('lavatorio') || query.includes('manicure') || query.includes('salao') || query.includes('poltrona') || query.includes('tulipa') || query.includes('cabecote')) {
    return 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('cabo de rede') || query.includes('cat6') || query.includes('cat5') || query.includes('furukawa')) {
    return 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('switch') || query.includes('roteador') || query.includes('cisco') || query.includes('ubiquiti')) {
    return 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('notebook') || query.includes('laptop') || query.includes('dell inspiron') || query.includes('macbook')) {
    return 'https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/notebooks/inspiron-notebooks/15-3520/media-gallery/black/notebook-inspiron-15-3520-black-gallery-1.psd?fmt=png-alpha&wid=600';
  }
  if (query.includes('monitor')) {
    return 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('teclado') || query.includes('mouse')) {
    return 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('nobreak') || query.includes('estabilizador')) {
    return 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('smartphone') || query.includes('celular') || query.includes('motorola') || query.includes('samsung galaxy')) {
    return 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('tablet') || query.includes('ipad')) {
    return 'https://images.unsplash.com/photo-1561154464-82e9adf32764?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('kombi') || query.includes('setor de direcao') || query.includes('nakata')) {
    return 'https://http2.mlstatic.com/D_NQ_NP_2X_784534-MLB54942918848_042023-F.webp';
  }
  if (query.includes('organizador de pia') || query.includes('plurale') || query.includes('tramontina')) {
    return 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('base de corte') || query.includes('brw') || query.includes('papelaria')) {
    return 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('valvula') || query.includes('redutora') || query.includes('bermad')) {
    return 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('junta') || query.includes('genebre') || query.includes('epdm') || query.includes('tubulacao')) {
    return 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('torneira') || query.includes('hidraulica')) {
    return 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('cafe') || query.includes('cafeteira') || query.includes('moido') || query.includes('graos')) {
    return 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=600&auto=format&fit=crop&q=80';
  }
  if (query.includes('cha') || query.includes('twinings') || query.includes('sache') || query.includes('infusao')) {
    return 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80';
  }

  return 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=600&auto=format&fit=crop&q=80';
}

/**
 * Searches and standardizes product description, clean Part Number, clean NCM, HD photo, and direct Marketplace links.
 * Accepts the full rawSearchQuery from the email (e.g. "Caixa de setor... | Tipo: Mecânica | Marca: NAKATA | Código: 10320041S | Aplicação: Kombi 1.4")
 */
export function resolveProductDetails(nameOrQuery: string, specs?: string, existingPartNumber?: string): StandardizedProductData {
  const raw = `${nameOrQuery} ${specs || ''}`;
  const query = raw.toLowerCase();

  // 1. Extract explicit part number / código from existing item or query
  let explicitCode = existingPartNumber && existingPartNumber.trim().length >= 2 ? existingPartNumber.trim() : '';
  if (!explicitCode) {
    const explicitCodeMatch = raw.match(
      /(?:código\/referência|código|referência|ref|part\s*number|p\/n|pn|cód)[:\s.]+([A-Za-z0-9\-_]{2,20})/i
    );
    if (explicitCodeMatch) {
      explicitCode = explicitCodeMatch[1].trim();
    }
  }

  // Also check for trailing or isolated numerical product code (e.g. "— 28003", " 28003", "Ref 10320041S")
  if (!explicitCode) {
    const trailingCodeMatch = raw.match(/(?:—|-|\b)\s*(?:cód[:\s]*)?([0-9]{4,8})\b/i);
    if (trailingCodeMatch) {
      explicitCode = trailingCodeMatch[1].trim();
    }
  }

  // 2. If we have an explicit code, try to match against knowledge base by that code first
  if (explicitCode) {
    const codeUpper = explicitCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (const item of knownProductKnowledgeBase) {
      const itemPN = item.partNumber.replace(/[^A-Z0-9]/g, '').toUpperCase();
      if (itemPN === codeUpper || item.keywords.some(k => codeUpper.includes(k.toUpperCase().replace(/[^A-Z0-9]/g, '')))) {
        const hasExact = isExactProductUrl(item.directUrl);
        return {
          standardizedName: formatProductSentenceCase(item.name),
          partNumber: cleanAlphanumericCode(explicitCode || item.partNumber),
          ncm: cleanNcmCode(item.ncm),
          imageUrl: item.imageUrl,
          category: item.category,
          estimatedCost: item.cost,
          supplier: hasExact ? (item.supplier || extractStoreNameFromUrl(item.directUrl)) : '',
          sourceUrl: hasExact ? item.directUrl : '',
          candidateListings: item.candidates?.filter(c => isExactProductUrl(c.directUrl))
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
      const hasExact = isExactProductUrl(item.directUrl);
      return {
        standardizedName: formatProductSentenceCase(item.name),
        partNumber: cleanAlphanumericCode(explicitCode || item.partNumber),
        ncm: cleanNcmCode(item.ncm),
        imageUrl: item.imageUrl,
        category: item.category,
        estimatedCost: item.cost,
        supplier: hasExact ? (item.supplier || extractStoreNameFromUrl(item.directUrl)) : '',
        sourceUrl: hasExact ? item.directUrl : '',
        candidateListings: item.candidates?.filter(c => isExactProductUrl(c.directUrl))
      };
    }
  }

  // 4. Dynamic generation for arbitrary product queries
  const cleanName = (nameOrQuery.split('|')[0])
    .replace(/^item\s*\d*[:\-.]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Preservar o part number real explicitamente encontrado
  let generatedPartNumber = explicitCode ? cleanAlphanumericCode(explicitCode) : '';
  if (!generatedPartNumber) {
    const pnMatch = query.match(/(?:pn|p\/n|part\s*number|código|ref|referência|modelo)[:\s]*([a-zA-Z0-9\-_]{2,20})/i);
    generatedPartNumber = pnMatch ? cleanAlphanumericCode(pnMatch[1]) : '';
  }

  // Category, NCM, Cost & Image heuristics — Curadoria visual HD por categoria real
  let ncm = '84713019';
  let category = 'Informática & Tecnologia';
  let cost = 250.00;
  let defaultImage = resolveImageForDescription(cleanName);
  let supplier = '';

  if (query.includes('adega') || query.includes('vinho')) {
    category = 'Eletrodomésticos & Refrigeração';
    ncm = '84185090';
    cost = 1890.00;
    defaultImage = 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Venax Oficial';
  } else if (query.includes('cervejeira') || query.includes('cerveja')) {
    category = 'Refrigeração Comercial';
    ncm = '84185090';
    cost = 2150.00;
    defaultImage = 'https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Venax Brasil';
  } else if (query.includes('refrigerador') || query.includes('geladeira') || query.includes('frost free') || query.includes('bottom freez')) {
    category = 'Eletrodomésticos & Refrigeração';
    ncm = '84181000';
    cost = 2890.00;
    defaultImage = 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Eletrolux & LG';
  } else if (query.includes('frigobar')) {
    category = 'Eletrodomésticos & Refrigeração';
    ncm = '84182100';
    cost = 1450.00;
    defaultImage = 'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Brastemp Loja Oficial';
  } else if (query.includes('coifa') || query.includes('depurador') || query.includes('exaustor')) {
    category = 'Eletrodomésticos & Cozinha';
    ncm = '84146000';
    cost = 1680.00;
    defaultImage = 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Suggar Oficial';
  } else if (query.includes('cooktop') || query.includes('fogão') || query.includes('fogao')) {
    category = 'Eletrodomésticos & Cozinha';
    ncm = '85166020';
    cost = 580.00;
    defaultImage = 'https://images.unsplash.com/photo-1588854337236-6889d631faa8?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Philco & Fischer';
  } else if (query.includes('forno') || query.includes('microondas') || query.includes('micro-ondas')) {
    category = 'Eletrodomésticos & Cozinha';
    ncm = query.includes('micro') ? '85165000' : '85166010';
    cost = 990.00;
    defaultImage = 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Eletrolux Store';
  } else if (query.includes('purificador') || query.includes('filtro') || query.includes('bebedouro')) {
    category = 'Purificação & Tratamento de Água';
    ncm = '84212100';
    cost = 650.00;
    defaultImage = 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Eletrolux & IBBL';
  } else if (query.includes('smart tv') || query.includes('televis') || query.includes('polegadas') || query.includes('tv 65')) {
    category = 'Áudio & Vídeo';
    ncm = '85287200';
    cost = 3490.00;
    defaultImage = 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Samsung & LG';
  } else if (query.includes('churrasqueira') || query.includes('grill') || query.includes('espetos')) {
    category = 'Eletrodomésticos & Lazer';
    ncm = '85167990';
    cost = 1490.00;
    defaultImage = 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Fischer Oficial';
  } else if (query.includes('cirandinha') || query.includes('lavatório') || query.includes('lavatorio') || query.includes('poltrona') || query.includes('tulipa') || query.includes('salão') || query.includes('cabeçote')) {
    category = 'Mobiliário Profissional & Beleza';
    ncm = '94021000';
    cost = 890.00;
    defaultImage = 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=500&auto=format&fit=crop&q=80';
    supplier = 'Mercado Livre / Móveis p/ Salão de Beleza';
  } else if (query.includes('kombi') || query.includes('direção') || query.includes('direcao') || query.includes('setor') || query.includes('veículo') || query.includes('carro') || query.includes('auto') || query.includes('motor') || query.includes('freio') || query.includes('suspensão') || query.includes('amortecedor') || query.includes('peça')) {
    category = 'Autopeças & Mecânica';
    supplier = 'Mercado Livre / Distribuidora de Peças Automotivas';
    
    if (query.includes('direção') || query.includes('direcao') || query.includes('setor') || query.includes('caixa')) {
      ncm = '87089481'; // Caixas de direção
      cost = 520.00;
      defaultImage = 'https://http2.mlstatic.com/D_NQ_NP_2X_784534-MLB54942918848_042023-F.webp';
      if (query.includes('kombi')) {
        generatedPartNumber = generatedPartNumber || '10320041S';
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
  } else if (query.includes('valvula') || query.includes('redutora') || query.includes('registro') || query.includes('bermad')) {
    ncm = '84811000';
    category = 'Válvulas & Hidráulica Industrial';
    cost = 1580.00;
    defaultImage = 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop&q=80';
    supplier = 'Distribuidor Especializado em Hidráulica';
  } else if (query.includes('junta') || query.includes('expansao') || query.includes('genebre') || query.includes('epdm')) {
    ncm = '40169990';
    category = 'Conexões & Vedações Industriais';
    cost = 480.00;
    defaultImage = 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=500&auto=format&fit=crop&q=80';
    supplier = 'Distribuidor Genebre / Conexões';
  }

  return {
    standardizedName: formatProductSentenceCase(cleanName),
    partNumber: cleanAlphanumericCode(generatedPartNumber),
    ncm: cleanNcmCode(ncm),
    imageUrl: defaultImage,
    category,
    estimatedCost: cost,
    supplier: '',
    sourceUrl: ''
  };
}

/**
 * Automatically applies grammatical gender agreement for the recipient company:
 * - Feminine entities (Universidade, Faculdade, Escola, Fundação, Associação, Prefeitura, Secretaria, etc.) -> "À Universidade..."
 * - Masculine entities (Condomínio, Hospital, Instituto, Shopping, Tribunal, Banco, Grupo, etc.) -> "Ao Condomínio...", "Ao Hospital..."
 * - Companies, concessionárias, and general legal entities -> "À Inframerica...", "À UBEC...", "À Interativa...", "À Frisbel..."
 */
export function formatCompanyPrefix(companyName: string): string {
  if (!companyName) return '';
  const clean = companyName.trim();

  // If already starts with "Ao ", "À ", "A ", "Para "
  const match = clean.match(/^(ao|à|a|para)\s+(.*)/i);
  let baseName = clean;
  let hasExplicitPrefix = false;
  let userPrefix = '';

  if (match) {
    hasExplicitPrefix = true;
    userPrefix = match[1].toLowerCase();
    baseName = match[2].trim();
  }

  // Normalize lower base for linguistic detection
  const lower = baseName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Masculine entities in Portuguese
  const masculineKeywords = [
    'condominio', 'shopping', 'hospital', 'instituto', 'tribunal', 'ministerio',
    'banco', 'colegio', 'centro', 'fundo', 'grupo', 'clube', 'departamento',
    'sindicato', 'cartorio', 'laboratorio', 'governo', 'municipio', 'posto',
    'hotel', 'parque', 'aeroporto', 'comando', 'senado', 'congresso',
    'tjdft', 'stj', 'stf', 'tcu', 'trf', 'tre', 'trt', 'mpt', 'mpf',
    'sesc', 'senai', 'sebrae', 'senac', 'sesi', 'cnc', 'crea', 'crm', 'cro'
  ];

  const isMasculine = masculineKeywords.some(kw => {
    const regex = new RegExp(`(^|\\s|[—–-])${kw}(\\s|[—–-]|\$|s)`, 'i');
    return regex.test(lower);
  });

  // If already prefixed with "Ao" but it's an obviously feminine company like Inframerica, correct it
  if (hasExplicitPrefix) {
    if (!isMasculine && userPrefix === 'ao' && (
      lower.includes('inframerica') || 
      lower.includes('concessionaria') || 
      lower.includes('ubec') ||
      lower.includes('empresa') ||
      lower.endsWith('a')
    )) {
      return `À ${baseName}`;
    }
    const prefixNormalized = (userPrefix === 'ao') ? 'Ao' : (userPrefix === 'à' || userPrefix === 'a' ? 'À' : 'Para');
    return `${prefixNormalized} ${baseName}`;
  }

  // Corporate entities, companies, concessionárias are feminine in Portuguese ("a empresa") -> "À"
  const correctPrefix = isMasculine ? 'Ao' : 'À';
  return `${correctPrefix} ${baseName}`;
}

/**
 * Automatically adds the respectful title (Sr. or Srta.) based on the recipient's name:
 * - "Alex Pereira da Silva Vasconcellos" -> "A/C Sr. Alex Pereira da Silva Vasconcellos"
 * - "Alexandra Oliveira" -> "A/C Srta. Alexandra Oliveira"
 */
export function formatContactPerson(contactPerson: string): string {
  if (!contactPerson) return '';
  let clean = contactPerson.trim();
  
  // Strip existing "A/C" prefix if present
  clean = clean.replace(/^a\/c\s*/i, '').trim();

// Se for vazio ou nome genérico fictício, retorna vazio!
  if (!clean || /^(responsavel|responsável|cliente|comprador|solicitante|usuario|usuário)$/i.test(clean)) {
    return '';
  }

  // If already has title like "Sr.", "Srta.", "Sra.", "Dr.", "Dra."
  if (/^(sr\.|srta\.|sra\.|dr\.|dra\.|prof\.|profa\.)\s+/i.test(clean)) {
    return `A/C ${clean}`;
  }

  const firstName = clean.split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const femaleNames = new Set([
    'alexandra', 'gabriela', 'maria', 'ana', 'patricia', 'camila', 'juliana',
    'bruna', 'mariana', 'fernanda', 'beatriz', 'carolina', 'aline', 'amanda', 'larissa',
    'leticia', 'jessica', 'daniela', 'vanessa', 'renata', 'luana',
    'bianca', 'roberta', 'claudia', 'monica', 'paula', 'carla',
    'simone', 'luciana', 'andreia', 'viviane', 'cristina', 'helena', 'marina',
    'debora', 'priscila', 'sabrina', 'tamires', 'flavia', 'tatiane',
    'adriana', 'regina', 'solange', 'teresa', 'tereza', 'valeria', 'eliane',
    'isabela', 'isabella', 'clara', 'laura', 'sophia', 'sofia', 'livia', 'luiza',
    'lorena', 'alice', 'sarah', 'sara', 'yasmin', 'raquel', 'fatima', 'elisangela'
  ]);

  const maleExceptions = new Set(['lucas', 'luca', 'joshua', 'elias', 'isaia', 'matias', 'alex', 'alessandro']);

  const isFemale = femaleNames.has(firstName) || 
    (firstName.endsWith('a') && !maleExceptions.has(firstName));

  const title = isFemale ? 'Srta.' : 'Sr.';
  return `A/C ${title} ${clean}`;
}

/**
 * Extracts telephone / WhatsApp number of the sender from text, tables or signatures
 */
export function extractContactPhone(text: string): string | undefined {
  if (!text) return undefined;

  // 1. Procurar por rótulos explícitos (telefone, tel, fone, whatsapp, whats, celular, cel, ramal, contato)
  const labeled = text.match(/(?:telefone|tel|fone|whatsapp|whats|celular|cel|contato|ramal)[:\s]*(\+?55\s*)?(?:\(?0?[1-9]{2}\)?\s*)?(?:9\s*)?[0-9]{4,5}[-\s.]?[0-9]{4}\b/i);
  if (labeled) {
    const raw = labeled[0].replace(/^(?:telefone|tel|fone|whatsapp|whats|celular|cel|contato|ramal)[:\s]*/i, '').trim();
    return formatCleanPhone(raw);
  }

  // 2. Procurar padrão com DDD explícito: (XX) 9XXXX-XXXX ou (XX) XXXX-XXXX
  const dddMatch = text.match(/(?:\+?55\s*)?(?:\([1-9]{2}\)\s*|[1-9]{2}\s+)(?:9\s*)?[0-9]{4}[-\s.]?[0-9]{4}\b/);
  if (dddMatch) {
    return formatCleanPhone(dddMatch[0]);
  }

  // Se não encontrou, NUNCA inventar: retorna undefined!
  return undefined;
}

function formatCleanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 13 && digits.startsWith('55')) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return raw.trim();
}

/**
 * Extracts a real e-mail address from text or document
 */
export function isSystemOrNoReplyEmail(email: string): boolean {
  if (!email) return true;
  const lower = email.toLowerCase().trim();
  return (
    lower.includes('noreply') ||
    lower.includes('no-reply') ||
    lower.includes('naoresponder') ||
    lower.includes('nãoresponder') ||
    lower.includes('notificacao') ||
    lower.includes('notificacoes') ||
    lower.includes('mailer-daemon') ||
    lower.includes('portal@') ||
    lower.includes('baseb.com.br') ||
    lower.includes('nimbi.com.br') ||
    lower.includes('bionexo') ||
    lower.includes('bbmnet') ||
    lower.includes('exemplo') ||
    lower.includes('teste') ||
    lower.includes('cliente@empresa') ||
    lower.includes('google.com') ||
    lower.includes('microsoft.com')
  );
}

/**
 * Extracts a real e-mail address from text or document.
 * Prioritizes explicit labels ("Email: contato@...") and ignores automated system / portal senders.
 */
export function extractEmailFromText(text: string): string {
  if (!text) return '';

  // 1. Prioridade máxima: rótulo explícito "Email: ...", "E-mail: ..."
  const labelMatches = Array.from(text.matchAll(/(?:email|e-mail|contato|correio)[:\s\t]+([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi));
  for (const m of labelMatches) {
    const candidate = m[1].toLowerCase().trim();
    if (!isSystemOrNoReplyEmail(candidate)) {
      return candidate;
    }
  }

  // 2. Todos os emails válidos, filtrando remetentes de no-reply/portais
  const allEmails = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g);
  if (allEmails) {
    for (const em of allEmails) {
      const candidate = em.toLowerCase().trim();
      if (!isSystemOrNoReplyEmail(candidate)) {
        return candidate;
      }
    }
  }

  return '';
}

/**
 * Extracts real contact buyer name from text
 */
export function extractContactPersonFromText(text: string): string {
  if (!text) return '';

  // 1. Rótulos como Contato, Comprador, Solicitante, Responsável, A/C
  const labelMatch = text.match(/(?:Contato|Comprador|Solicitante|Respons[aá]vel|A\/C|Aos\s+cuidados\s+de|Att\.?)[:\s\t]+([A-Za-zÀ-ÿ\s]{3,60})/i);
  if (labelMatch) {
    let candidate = labelMatch[1].trim();
    // Trunca imediatamente caso o texto colado inclua o próximo campo (ex: "Sandra Costa Emailsandra...")
    candidate = candidate.split(/\b(?:email|e-mail|telefone|tel|fone|cel|cnpj|endere[çc]o|cargo|departamento|setor|itens|c[oó]digo|rodada)\b/i)[0].trim();
    if (candidate.length >= 3 && !/^(empresa|solicitante|responsavel|responsável|cliente|compras|ti|suprimentos|departamento|portal)$/i.test(candidate)) {
      return candidate;
    }
  }

  // 2. Padrão "De: Nome <email>" ou "From: Nome <email>"
  const fromMatch = text.match(/(?:De|From)[:\s]+([A-Za-zÀ-ÿ\s]{3,40})\s*<[^>]+>/i);
  if (fromMatch) {
    let candidate = fromMatch[1].trim();
    candidate = candidate.split(/\b(?:email|e-mail|telefone|cnpj|endere[çc]o)\b/i)[0].trim();
    if (candidate.length >= 3 && !/^(nao responder|no-reply|noreply|sistema|portal|atendimento)$/i.test(candidate)) {
      return candidate;
    }
  }

  return '';
}

/**
 * Gera o Código / Referência oficial da proposta no padrão exigido por Lucas:
 * "[NOME DA EMPRESA] [DATA SÓ COM NÚMEROS: DDMMAA]"
 * Exemplo: SABIN 050926
 * Com crítica inteligente: Se o código base já existir no banco/localStorage, gera incremental:
 * SABIN 050926-2, SABIN 050926-3, etc.
 */
export function generateQuoteCode(
  companyName?: string, 
  date: Date = new Date(),
  existingCodesOrQuotes?: (string | { code?: string })[]
): string {
  let cleanName = (companyName || 'COTACAO')
    .replace(/^(ao|à|a|para)\s+/i, '')
    .replace(/[^a-zA-Z0-9À-ÿ\s_-]/g, '')
    .trim() || 'COTACAO';

  // Se for nome institucional longo com hífen/sigla explícita (ex: "Universidade Católica - UBEC"), priorizar a sigla
  const dashParts = cleanName.split(/[-—]/);
  if (dashParts.length > 1) {
    const candidateSigla = dashParts[dashParts.length - 1].trim();
    if (candidateSigla.length >= 2 && candidateSigla.length <= 12 && /^[A-Z0-9]+$/.test(candidateSigla)) {
      cleanName = candidateSigla;
    }
  }

  // Normaliza espaços múltiplos mantendo o nome completo da empresa (ex: "PAULO OCTAVIO", "HOSPITAL SANTA LUCIA")
  cleanName = cleanName.replace(/\s+/g, ' ').trim();
  if (cleanName.length > 35) {
    cleanName = cleanName.slice(0, 35).trim();
  }

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  const dateOnlyDigits = `${dd}${mm}${yy}`;

  const baseCode = `${cleanName.toUpperCase().trim()} ${dateOnlyDigits}`;

  // Coleta lista de códigos já existentes
  let existingSet = new Set<string>();

  if (Array.isArray(existingCodesOrQuotes) && existingCodesOrQuotes.length > 0) {
    existingCodesOrQuotes.forEach(it => {
      if (typeof it === 'string' && it.trim()) {
        existingSet.add(it.trim().toUpperCase());
      } else if (it && typeof it === 'object' && it.code) {
        existingSet.add(it.code.trim().toUpperCase());
      }
    });
  } else {
    // Busca do localStorage se não foi passado diretamente
    try {
      const saved = localStorage.getItem('infodesk_quotes');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          parsed.forEach((q: any) => {
            if (q?.code) existingSet.add(String(q.code).trim().toUpperCase());
          });
        }
      }
    } catch {
      // ignore
    }
  }

  // Crítica de unicidade: Se não existe, usa o baseCode. Se já existe, cria incremental (-2, -3, ...)
  if (!existingSet.has(baseCode.toUpperCase())) {
    return baseCode;
  }

  let counter = 2;
  while (counter <= 999) {
    const candidate = `${baseCode}-${counter}`;
    if (!existingSet.has(candidate.toUpperCase())) {
      return candidate;
    }
    counter++;
  }

  return `${baseCode}-${Date.now().toString().slice(-4)}`;
}

/**
 * Aplica máscara brasileira inteligente em números de telefone (fixo ou celular):
 * Ex: 6134032944 -> (61) 3403-2944
 * Ex: 61996272630 -> (61) 99627-2630 ou (61) 9 9627-2630
 * Permite digitação progressiva fluida.
 */
export function maskPhone(value: string): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 11);

  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    // Telefone fixo: (XX) XXXX-XXXX
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  // Celular: (XX) 9XXXX-XXXX
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/**
 * Gera o corpo do e-mail em HTML exatamente com a mesma identidade visual,
 * Constrói o corpo completo do e-mail em HTML padrão da Infodesk com tipografia Verdana,
 * estrutura tabular, cabeçalho e rodapé oficial da pré-visualização da proposta.
 */
export function generateProposalEmailHtml(
  quote: any, 
  settings: any, 
  options: { forEmailSend?: boolean } = {}
): string {
  const clientCompanyFormatted = formatCompanyPrefix(quote.clientCompany);
  const contactPersonFormatted = formatContactPerson(quote.contactPerson);
  const excDetails = extractDeliveryExceptionDetails(quote.deliveryDays);

  const cleanPhone = (settings.phone || '61 3033-5373').replace(/[()]/g, '').trim();
  const cleanWhatsapp = (settings.whatsapp || '61 9 9627-2630').replace(/[()]/g, '').trim();

  // Para envio oficial por e-mail pelo Gmail, usamos Content-ID (CID) inline MIME: cid:infodesk-logo
  // Para visualização no modal interno do navegador, usamos a logomarca oficial: /infodesk-logo.png
  const logoImageSrc = options.forEmailSend ? 'cid:infodesk-logo' : '/infodesk-logo.png';

  const itemsRows = (quote.items || []).map((item: any) => {
    const isException = excDetails.hasException && excDetails.itemNumbers.includes(item.itemNumber);
    const hasDescription = item.description && 
      item.description !== item.name && 
      !item.description.toLowerCase().includes('menor pre') && 
      !item.description.toLowerCase().includes('apurado');
    const hasImage = item.showImage && item.imageUrl;

    return `
      <tr>
        <td style="border: 1px solid #000000; padding: 6px 8px; text-align: center; vertical-align: top; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
          ${item.itemNumber}
        </td>
        <td style="border: 1px solid #000000; padding: 6px 8px; text-align: left; vertical-align: top; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
          <div style="font-weight: normal; color: #000000;">
            ${item.name}
            ${isException ? `<span style="font-size: 8pt; color: #b45309; font-weight: bold; margin-left: 6px;">(Prazo diferenciado: ${excDetails.days} dias úteis)</span>` : ''}
          </div>
          ${hasDescription ? `<div style="font-size: 8.5pt; color: #334155; margin-top: 4px; line-height: 1.35; white-space: pre-line;">${item.description}</div>` : ''}
          ${hasImage ? `<div style="margin-top: 8px; margin-bottom: 4px;"><img src="${item.imageUrl}" alt="${item.name}" height="140" style="height: 140px; width: auto; max-width: 260px; object-fit: contain; display: block;" /></div>` : ''}
        </td>
        <td style="border: 1px solid #000000; padding: 6px 8px; text-align: center; vertical-align: top; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
          ${item.quantity}
        </td>
        <td style="border: 1px solid #000000; padding: 6px 8px; text-align: center; vertical-align: top; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
          ${item.unit || 'Un.'}
        </td>
        <td style="border: 1px solid #000000; padding: 6px 8px; text-align: center; vertical-align: top; white-space: nowrap; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
          R$ ${Number(item.unitPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td style="border: 1px solid #000000; padding: 6px 8px; text-align: center; vertical-align: top; white-space: nowrap; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
          R$ ${Number(item.totalPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
      </tr>
    `;
  }).join('');

  const formattedShipping = quote.shippingTerms
    ? (quote.shippingTerms.toLowerCase().startsWith('frete')
        ? quote.shippingTerms
        : `Frete: ${quote.shippingTerms}`)
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Proposta Comercial ${quote.code}</title>
</head>
<body style="margin: 0; padding: 20px; background-color: #ffffff; font-family: Verdana, Geneva, sans-serif; font-size: 10pt; line-height: 1.35; color: #000000;">
  <div style="max-width: 780px; margin: 0 auto; background-color: #ffffff;">
    
    <!-- Logo Infodesk -->
    <div style="margin-bottom: 24px;">
      <img src="${logoImageSrc}" alt="Infodesk" height="60" style="height: 60px; width: auto; display: block; border: 0;" />
    </div>

    <!-- Dados do Cliente / Solicitante -->
    <div style="margin-bottom: 18px; line-height: 1.35;">
      <p style="margin: 0; font-weight: bold; font-size: 12pt; font-family: Verdana, Geneva, sans-serif; color: #000000;">${clientCompanyFormatted}</p>
      <p style="margin: 2px 0 0 0; font-weight: bold; font-size: 12pt; font-family: Verdana, Geneva, sans-serif; color: #000000;">${contactPersonFormatted}</p>
      <p style="margin: 4px 0 0 0; font-size: 8pt; font-family: Verdana, Geneva, sans-serif; color: #000000;"><strong>E-mail:</strong> <a href="mailto:${(quote.clientEmail || '').toLowerCase()}" style="color: #0000ee; text-decoration: underline;">${(quote.clientEmail || '').toLowerCase()}</a></p>
      ${quote.clientPhone ? `<p style="margin: 2px 0 0 0; font-size: 8pt; font-family: Verdana, Geneva, sans-serif; color: #000000;"><strong>Telefone:</strong> ${quote.clientPhone}</p>` : ''}
    </div>

    <!-- Parágrafo de Abertura -->
    <p style="text-align: justify; margin-bottom: 16px; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; line-height: 1.35; color: #000000;">
      ${quote.openingText || settings.defaultOpeningText || 'Em atenção ao que foi solicitado por Vossa Senhoria, enviamos proposta para fornecimento dos produtos para informática, conforme especificações e condições a seguir:'}
    </p>

    <!-- Tabela Oficial de Produtos -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-family: Verdana, Geneva, sans-serif; font-size: 10pt;">
      <thead>
        <tr style="background-color: #ffffff;">
          <th style="border: 1px solid #000000; padding: 6px 8px; width: 7%; text-align: center; font-weight: bold; font-size: 10pt; color: #000000;">Item</th>
          <th style="border: 1px solid #000000; padding: 6px 8px; width: 49%; text-align: center; font-weight: bold; font-size: 10pt; color: #000000;">Descrição do Produto</th>
          <th style="border: 1px solid #000000; padding: 6px 8px; width: 8%; text-align: center; font-weight: bold; font-size: 10pt; color: #000000;">Qtd.</th>
          <th style="border: 1px solid #000000; padding: 6px 8px; width: 8%; text-align: center; font-weight: bold; font-size: 10pt; color: #000000;">Un.</th>
          <th style="border: 1px solid #000000; padding: 6px 8px; width: 14%; text-align: center; font-weight: bold; font-size: 10pt; color: #000000;">Preço unit.</th>
          <th style="border: 1px solid #000000; padding: 6px 8px; width: 14%; text-align: center; font-weight: bold; font-size: 10pt; color: #000000;">Preço total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <!-- Condições Gerais -->
    <div style="margin-bottom: 24px; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; line-height: 1.45; color: #000000;">
      <p style="margin: 0 0 6px 0; font-weight: bold; text-decoration: underline;">Condições gerais:</p>
      <p style="margin: 0 0 3px 0;">➤&nbsp; Validade da proposta: ${quote.validityDays}</p>
      <p style="margin: 0 0 3px 0;">➤&nbsp; Condições de pagamento: ${quote.paymentTerms}</p>
      <p style="margin: 0 0 3px 0;">➤&nbsp; Prazo de entrega: ${quote.deliveryDays}</p>
      <p style="margin: 0 0 3px 0;">➤&nbsp; Garantia: ${quote.warrantyTerms}</p>
      ${formattedShipping ? `<p style="margin: 0 0 3px 0; font-weight: bold;">➤&nbsp; ${formattedShipping}</p>` : ''}
    </div>

    <!-- Data e Assinatura Alinhadas à Direita -->
    <div style="text-align: right; margin-top: 24px; margin-bottom: 32px; line-height: 1.4; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; color: #000000;">
      <p style="margin: 0 0 20px 0; font-size: 10pt; color: #000000;">${quote.city || (settings.cityState ? settings.cityState.split('-')[0].trim() : 'Brasília')}, ${quote.date}.</p>
      <p style="margin: 0; font-weight: normal; font-size: 10pt; color: #000000;">${settings.representativeName || 'Lucas Porto'}</p>
      
      <!-- Linha do Telefone (com ícone oficial idêntico à visualização) -->
      <table align="right" border="0" cellpadding="0" cellspacing="0" style="margin-left: auto; border-collapse: collapse; text-align: right; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; margin-top: 2px;">
        <tr>
          <td style="padding: 0; vertical-align: middle; text-align: right; color: #000000; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
            <img src="${options.forEmailSend ? 'cid:phone-icon' : '/phone-icon.png'}" alt="Telefone" width="14" height="14" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; border: 0; display: inline-block;" />
            <span style="color: #000000; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; vertical-align: middle;">${cleanPhone}</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 2px 0 0 0; vertical-align: middle; text-align: right; color: #000000; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
            <a href="https://api.whatsapp.com/send?phone=55${cleanWhatsapp.replace(/\D/g, '')}" target="_blank" rel="noreferrer" style="color: #0000ee; text-decoration: underline; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; display: inline-block;">
              <img src="${options.forEmailSend ? 'cid:whatsapp-icon' : '/whatsapp-icon.png'}" alt="WhatsApp" width="14" height="14" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; border: 0; display: inline-block;" />
              <span style="vertical-align: middle; color: #0000ee; text-decoration: underline;">${cleanWhatsapp}</span>
            </a>
          </td>
        </tr>
      </table>
      <div style="clear: both;"></div>
    </div>

    <!-- Rodapé Oficial com Dados Fiscais da Infodesk -->
    <div style="border-top: 1px solid #000000; padding-top: 8px; text-align: center; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; line-height: 1.35; color: #000000;">
      <p style="margin: 0; font-weight: bold;">${settings.companyName || 'Lucas Porto da Fonseca-ME'}</p>
      <p style="margin: 2px 0 0 0;">${settings.address || 'CLSW 304 Bloco A Sala 108 – Sudoeste'} – ${settings.cityState || 'Brasília - DF'}</p>
      <p style="margin: 2px 0 0 0;">CNPJ: ${settings.cnpj || '15.266.716/0001-02'}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;I.E.: ${settings.stateRegistration || '07.602.330/001-92'}</p>
    </div>

  </div>
</body>
</html>`;
}

