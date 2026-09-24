import ExcelJS from 'exceljs';
import { Product } from '../types';

function extractWeight(desc?: string): number | null {
  if (!desc) return null;
  const m = desc.match(/peso\s*(?:aproximado|bruto|l[ií]quido)?[:\s]+([0-9]+(?:[.,][0-9]+)?)\s*(kg|g)/i);
  if (m) {
    let val = parseFloat(m[1].replace(',', '.'));
    if (m[2].toLowerCase() === 'g') val = val / 1000;
    return Number(val.toFixed(3));
  }
  return null;
}

function cleanUnit(unit?: string): string {
  if (!unit) return 'Unidade';
  const raw = unit.trim();
  const normalized = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized === 'UN' || normalized === 'UND' || raw.toLowerCase().startsWith('un')) {
    return 'Unidade';
  }
  if (normalized === 'PCT' || normalized === 'PACOTE') return 'PCT';
  if (normalized === 'CX' || normalized === 'CAIXA') return 'CX';
  if (normalized === 'KIT') return 'KIT';
  if (normalized === 'M' || normalized === 'METRO') return 'M';
  if (normalized === 'M2') return 'M2';
  return raw;
}

function cleanNcm(ncm?: string): number | null {
  if (!ncm) return null;
  const digits = String(ncm).replace(/\D/g, '');
  return digits.length > 0 ? Number(digits) : null;
}

/**
 * Cria a planilha do Conta Azul do zero caso o arquivo de template estático não esteja acessível via fetch
 */
function createProgrammaticContaAzulWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Infodesk SmartQuote';
  wb.lastModifiedBy = 'Infodesk SmartQuote';

  // Aba 1: Orientações
  const wsOrient = wb.addWorksheet('Orientações');
  wsOrient.addRow(['Orientações de preenchimento da planilha:']);
  wsOrient.addRow(['* Preencha os dados dos seus produtos na aba "Produtos"']);
  wsOrient.addRow(['* Não utilize caracteres especiais, como por exemplo: \' " ! @ # % ¨ & * ( ) ª º § + _ - ? ° [ { } ] : ;']);
  wsOrient.addRow(['* Cole as informações planilha utilizando a função Colar Especial > Colar Valores, para não perder a formatação padrão das células;']);
  wsOrient.addRow(['* As células não podem conter fórmulas;']);

  // Aba 2: Produtos
  const wsProd = wb.addWorksheet('Produtos');
  wsProd.columns = [
    { width: 32 }, { width: 32 }, { width: 29 }, { width: 20 }, { width: 17 },
    { width: 17 }, { width: 17 }, { width: 17 }, { width: 21 }, { width: 21 },
    { width: 21 }, { width: 21 }, { width: 21 }, { width: 24 }, { width: 21 }
  ];

  const headerRow = wsProd.getRow(1);
  headerRow.height = 68;

  const headerTexts = [
    'Nome do produto\n\nCampo livre para letras e números.\nEste campo é OBRIGATÓRIO',
    'Código do produto (SKU)\n\nCampo livre para letras e números',
    'Quantidade em estoque\n\nUse somente números',
    'Custo médio (preço de compra)\n\nUse somente números',
    'Preço de venda\n\nUse somente números',
    'Código de barras (GTIN/EAN)\n\nUse somente números',
    'Unidade de medida\n\nUse somente letras',
    'NCM\n\nUse somente números',
    'Categoria do produto\n\nCampo livre para letras e números',
    'Peso bruto (quilos)\n\nUse somente números',
    'Peso líquido (quilos)\n\nUse somente números\nO valor deve ser menor que o peso bruto',
    'Estoque máximo\n\nUse somente números',
    'Estoque mínimo\n\nUse somente números\nO valor deve ser menor que o estoque máximo',
    'Origem do produto\n\nInforme um número de 0 à 8',
    'CEST\n\nInforme o valor com sete dígitos'
  ];

  headerTexts.forEach((text, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = text;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
    const bgColor = i === 0 ? 'FF38761D' : 'FF3C78D8';
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: bgColor }
    };
  });

  return wb;
}

/**
 * Exporta os produtos cadastrados para o formato oficial do Conta Azul
 * atendendo rigorosamente aos critérios solicitados por Lucas:
 * 1. Nome do produto sempre em CAIXA ALTA
 * 2. Quantidade em estoque SEMPRE 0
 * 3. Onde tiver UN ou Un. escrever "Unidade"
 * 4. Categoria do produto em branco
 * 5. Origem do produto em branco
 * 6. Preço de venda com markup padrão
 */
export async function exportContaAzulExcel(products: Product[], defaultMarkup = 23.5): Promise<void> {
  const wb = new ExcelJS.Workbook();
  let ws: ExcelJS.Worksheet | undefined;

  // 1. Tentar carregar o template oficial estático da pasta public/
  try {
    const response = await fetch('/conta-azul-modelo.xlsx');
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      await wb.xlsx.load(arrayBuffer);
      ws = wb.getWorksheet('Produtos');
    }
  } catch (err) {
    console.warn('[ContaAzul] Falha ao carregar template via fetch, construindo nativamente:', err);
  }

  // Fallback seguro se não carregou o arquivo estático
  if (!ws) {
    const fallbackWb = createProgrammaticContaAzulWorkbook();
    ws = fallbackWb.getWorksheet('Produtos');
    // Copiar abas para wb
    fallbackWb.eachSheet((sheet) => {
      if (!wb.getWorksheet(sheet.name)) {
        const newSheet = wb.addWorksheet(sheet.name);
        newSheet.model = sheet.model;
      }
    });
    ws = wb.getWorksheet('Produtos');
  }

  if (!ws) {
    throw new Error('Não foi possível inicializar a planilha do Conta Azul.');
  }

  // 2. Preencher os produtos a partir da linha 2
  products.forEach((p, idx) => {
    const rowNum = idx + 2;
    const row = ws!.getRow(rowNum);

    const cost = Number(p.costPrice) || 0;
    const markupFactor = 1 + defaultMarkup / 100;
    const rawPrice = cost * markupFactor;
    const salePrice = rawPrice < 10 ? Number(rawPrice.toFixed(2)) : Math.round(rawPrice);

    const nameUpperCase = (p.name || '').trim().toUpperCase();
    const sku = (p.sku || p.partNumber || '').trim();
    const stock = 0; // Quantidade em estoque SEMPRE 0
    const unit = cleanUnit(p.unit);
    const ncm = cleanNcm(p.ncm);
    const weight = extractWeight(p.description);

    // 1: Nome do produto (sempre em CAIXA ALTA)
    row.getCell(1).value = nameUpperCase;

    // 2: Código do produto (SKU)
    row.getCell(2).value = sku;

    // 3: Quantidade em estoque (sempre 0)
    row.getCell(3).value = stock;
    row.getCell(3).numFmt = '#,##0';

    // 4: Custo médio (preço de compra)
    row.getCell(4).value = cost;
    row.getCell(4).numFmt = '#,##0.00';

    // 5: Preço de venda
    row.getCell(5).value = salePrice;
    row.getCell(5).numFmt = '#,##0.00';

    // 6: Código de barras (GTIN/EAN)
    row.getCell(6).value = null;

    // 7: Unidade de medida (onde era UN/Un. vira 'Unidade')
    row.getCell(7).value = unit;

    // 8: NCM (somente números)
    row.getCell(8).value = ncm;
    if (ncm) row.getCell(8).numFmt = '0';

    // 9: Categoria do produto (em branco)
    row.getCell(9).value = null;

    // 10: Peso bruto (quilos)
    row.getCell(10).value = weight || null;
    if (weight) row.getCell(10).numFmt = '#,##0.00';

    // 11: Peso líquido (quilos)
    row.getCell(11).value = weight || null;
    if (weight) row.getCell(11).numFmt = '#,##0.00';

    // 12: Estoque máximo
    row.getCell(12).value = null;

    // 13: Estoque mínimo
    row.getCell(13).value = null;

    // 14: Origem do produto (em branco)
    row.getCell(14).value = null;

    // 15: CEST
    row.getCell(15).value = null;

    row.commit();
  });

  const suggestedFilename = 'Planilha de exportação para Conta Azul.xlsx';

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  // Tenta abrir salvar como nativo se disponível
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: suggestedFilename,
        types: [
          {
            description: 'Planilha do Excel (*.xlsx)',
            accept: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
            }
          }
        ]
      });

      const writableStream = await fileHandle.createWritable();
      await writableStream.write(blob);
      await writableStream.close();
      return;
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.warn('showSaveFilePicker indisponível, usando download direto:', err);
    }
  }

  // Fallback padrão via link <a>
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedFilename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
