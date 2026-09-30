import ExcelJS from 'exceljs';
import { Quote } from '../types';

/**
 * Gera e realiza o download da Planilha Excel de Custos e Precificação Detalhada
 * no padrão visual exato do Excel enviado por Lucas Porto (Infodesk):
 * - Fonte padrão: Verdana 9.5pt / 10pt
 * - Linhas horizontais pontilhadas entre os itens
 * - Bordas contornadas e sólidas nos cabeçalhos e totais
 * - Fórmulas automáticas e formatação monetária R$ #,##0.00
 * - Nome do arquivo no formato: [NOME DA EMPRESA] [DDMMYY].xlsx (ex: UBEC 090926.xlsx)
 */
export async function exportCostSheetToExcel(quote: Quote, dollarRate?: number): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Infodesk SmartQuote';
  workbook.lastModifiedBy = 'Infodesk SmartQuote';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('Cotação', {
    views: [{ showGridLines: false }]
  });

  // Formato Oficial do Excel: Categoria Contábil (2 decimais, Símbolo R$, zero exibido como "R$ -")
  const numFmtAccounting = '_-"R$"* #,##0.00_-;-"R$"* #,##0.00_-;_-"R$"* "-"??_-;_-@_-';

  const fontVerdana = (size = 9, bold = false) => ({
    name: 'Verdana',
    size,
    bold,
    color: { argb: 'FF000000' }
  });

  const borderThin = { style: 'thin' as const, color: { argb: 'FF000000' } };
  const borderMedium = { style: 'medium' as const, color: { argb: 'FF000000' } };
  const borderDotted = { style: 'dotted' as const, color: { argb: 'FF808080' } };

  // 1. Larguras das Colunas (Col A é margem; Col B é Item; Col C é Descrição...)
  worksheet.columns = [
    { key: 'colA', width: 4 },   // A: Margem vazia
    { key: 'colB', width: 6 },   // B: Item
    { key: 'colC', width: 44 },  // C: Descrição do Produto
    { key: 'colD', width: 6 },   // D: Qt.
    { key: 'colE', width: 10 },  // E: Dolar
    { key: 'colF', width: 14 },  // F: Custo unit.
    { key: 'colG', width: 15 },  // G: Custo total
    { key: 'colH', width: 16 },  // H: Custo unit. + Frete
    { key: 'colI', width: 16 },  // I: Custo total + Frete
    { key: 'colJ', width: 11 },  // J: Frete
    { key: 'colK', width: 14 },  // K: Venda unit.
    { key: 'colL', width: 16 },  // L: Venda total
    { key: 'colM', width: 14 },  // M: Imposto
    { key: 'colN', width: 14 },  // N: Lucro bruto
    { key: 'colO', width: 15 },  // O: Lucro liquido
    { key: 'colP', width: 11 },  // P: Margem %
    { key: 'colQ', width: 45 }   // Q: Link Exato
  ];

  // 2. Linha 2: Título Centralizado "Custo para peças" e Cotação do Dólar
  worksheet.mergeCells('F2:I2');
  const titleCell = worksheet.getCell('F2');
  titleCell.value = 'Custo para peças';
  titleCell.font = fontVerdana(14, true);
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  if (dollarRate && dollarRate > 0) {
    const symbolCell = worksheet.getCell('N2');
    symbolCell.value = 'R$';
    symbolCell.font = fontVerdana(9.5, false);
    symbolCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const rateCell = worksheet.getCell('O2');
    rateCell.value = dollarRate;
    rateCell.numFmt = '#,##0.00';
    rateCell.font = fontVerdana(9.5, false);
    rateCell.alignment = { horizontal: 'right', vertical: 'middle' };
  }

  // 3. Linha 4: Cabeçalho das Colunas
  const headerRow = worksheet.getRow(4);
  headerRow.height = 30;

  const headerDefs = [
    { col: 'B', text: 'Item' },
    { col: 'C', text: 'Descrição do Produto' },
    { col: 'D', text: 'Qt.' },
    { col: 'E', text: 'Dolar' },
    { col: 'F', text: 'Custo unit.' },
    { col: 'G', text: 'Custo total' },
    { col: 'H', text: 'Custo unit. +\nFrete' },
    { col: 'I', text: 'Custo total +\nFrete' },
    { col: 'J', text: 'Frete' },
    { col: 'K', text: 'Venda unit.' },
    { col: 'L', text: 'Venda total' },
    { col: 'M', text: 'Imposto' },
    { col: 'N', text: 'Lucro bruto' },
    { col: 'O', text: 'Lucro liquido' }
  ];

  headerDefs.forEach((h, idx) => {
    const cell = worksheet.getCell(`${h.col}4`);
    cell.value = h.text;
    cell.font = fontVerdana(9.5, true);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    const isFirst = idx === 0;
    const isLast = idx === headerDefs.length - 1;

    cell.border = {
      top: borderMedium,
      bottom: borderMedium,
      left: isFirst ? borderMedium : borderThin,
      right: isLast ? borderMedium : borderThin
    };
  });

  // 4. Linhas de Dados (Linha 5 até 5 + items.length - 1)
  const items = quote.items || [];
  const startRow = 5;
  const numItems = items.length;

  items.forEach((item, idx) => {
    const r = startRow + idx;
    const row = worksheet.getRow(r);
    row.height = 22;

    const isLastRow = idx === numItems - 1;
    const qty = item.quantity || 1;
    const unitFreight = Number(((item.shippingCost ?? 0) / qty).toFixed(2));
    const taxRateDecimal = ((item.taxPercent ?? quote.globalTaxPercent ?? 6) / 100);

    // B: Item
    const cellB = worksheet.getCell(`B${r}`);
    cellB.value = idx + 1;
    cellB.font = fontVerdana(9, false);
    cellB.alignment = { horizontal: 'center', vertical: 'middle' };

    // C: Descrição
    const cellC = worksheet.getCell(`C${r}`);
    cellC.value = item.name;
    cellC.font = fontVerdana(9, false);
    cellC.alignment = { horizontal: 'left', vertical: 'middle' };

    // D: Qt.
    const cellD = worksheet.getCell(`D${r}`);
    cellD.value = qty;
    cellD.font = fontVerdana(9, false);
    cellD.alignment = { horizontal: 'center', vertical: 'middle' };

    // E: Dolar
    const cellE = worksheet.getCell(`E${r}`);
    if (item.dollarPrice && item.dollarPrice > 0) {
      cellE.value = item.dollarPrice;
      cellE.numFmt = '"$" #,##0.00';
    } else {
      cellE.value = '';
    }
    cellE.font = fontVerdana(9, false);
    cellE.alignment = { horizontal: 'right', vertical: 'middle' };

    // F: Custo unit.
    const cellF = worksheet.getCell(`F${r}`);
    cellF.value = item.costPrice;
    cellF.numFmt = numFmtAccounting;
    cellF.font = fontVerdana(9, false);
    cellF.alignment = { horizontal: 'right', vertical: 'middle' };

    // G: Custo total (Fórmula: Custo unit. x Qt.)
    const cellG = worksheet.getCell(`G${r}`);
    cellG.value = { formula: `F${r}*D${r}`, result: item.costPrice * qty };
    cellG.numFmt = numFmtAccounting;
    cellG.font = fontVerdana(9, false);
    cellG.alignment = { horizontal: 'right', vertical: 'middle' };

    // H: Custo unit. + Frete (Fórmula: Custo unit. + Frete unitário)
    const cellH = worksheet.getCell(`H${r}`);
    cellH.value = { formula: `F${r}+J${r}`, result: item.costPrice + unitFreight };
    cellH.numFmt = numFmtAccounting;
    cellH.font = fontVerdana(9, false);
    cellH.alignment = { horizontal: 'right', vertical: 'middle' };

    // I: Custo total + Frete (Fórmula: Custo unit. + Frete x Qt.)
    const cellI = worksheet.getCell(`I${r}`);
    cellI.value = { formula: `H${r}*D${r}`, result: (item.costPrice + unitFreight) * qty };
    cellI.numFmt = numFmtAccounting;
    cellI.font = fontVerdana(9, false);
    cellI.alignment = { horizontal: 'right', vertical: 'middle' };

    // J: Frete (Se não puxou nada, coloca 0 que exibe R$ - no formato Contábil)
    const cellJ = worksheet.getCell(`J${r}`);
    cellJ.value = unitFreight || 0;
    cellJ.numFmt = numFmtAccounting;
    cellJ.font = fontVerdana(9, false);
    cellJ.alignment = { horizontal: 'right', vertical: 'middle' };

    // K: Venda unit.
    // Regra comercial solicitada por Lucas:
    // - Abaixo de R$ 10,00: preserva centavos exatos (2 casas decimais) para proteger itens de baixo custo
    // - A partir de R$ 10,00: arredonda para número inteiro (0 casas decimais)
    // No Excel: =SE(H5*markup < 10; ARRED(H5*markup; 2); ARRED(H5*markup; 0))
    const cellK = worksheet.getCell(`K${r}`);
    const markupPct = item.markupPercent ?? quote.averageMargin ?? 32;
    const markupFactor = Number((1 + markupPct / 100).toFixed(4));
    const baseEstimatedPrice = (item.costPrice + unitFreight) * markupFactor;
    const rawPrice = item.unitPrice ?? baseEstimatedPrice;
    const calculatedUnitPrice = rawPrice < 10
      ? Number(rawPrice.toFixed(2))
      : Math.round(rawPrice);

    cellK.value = {
      formula: `IF(H${r}*${markupFactor}<10,ROUND(H${r}*${markupFactor},2),ROUND(H${r}*${markupFactor},0))`,
      result: calculatedUnitPrice
    };
    cellK.numFmt = numFmtAccounting;
    cellK.font = fontVerdana(9, false);
    cellK.alignment = { horizontal: 'right', vertical: 'middle' };

    // L: Venda total (Fórmula: Venda unit. x Qt.)
    const cellL = worksheet.getCell(`L${r}`);
    const itemTotalSale = calculatedUnitPrice * qty;
    cellL.value = { formula: `K${r}*D${r}`, result: itemTotalSale };
    cellL.numFmt = numFmtAccounting;
    cellL.font = fontVerdana(9, false);
    cellL.alignment = { horizontal: 'right', vertical: 'middle' };

    // M: Imposto (Fórmula: Venda total x taxa imposto)
    const cellM = worksheet.getCell(`M${r}`);
    const expectedTax = itemTotalSale * taxRateDecimal;
    cellM.value = { formula: `L${r}*${taxRateDecimal.toFixed(4)}`, result: expectedTax };
    cellM.numFmt = numFmtAccounting;
    cellM.font = fontVerdana(9, false);
    cellM.alignment = { horizontal: 'right', vertical: 'middle' };

    // N: Lucro bruto (Fórmula: Venda total - Custo total + Frete)
    const cellN = worksheet.getCell(`N${r}`);
    const expectedGrossProfit = itemTotalSale - ((item.costPrice + unitFreight) * qty);
    cellN.value = { formula: `L${r}-I${r}`, result: expectedGrossProfit };
    cellN.numFmt = numFmtAccounting;
    cellN.font = fontVerdana(9, false);
    cellN.alignment = { horizontal: 'right', vertical: 'middle' };

    // O: Lucro liquido (Fórmula: Lucro bruto - Imposto)
    const cellO = worksheet.getCell(`O${r}`);
    const expectedNetProfit = expectedGrossProfit - expectedTax;
    cellO.value = { formula: `N${r}-M${r}`, result: expectedNetProfit };
    cellO.numFmt = numFmtAccounting;
    cellO.font = fontVerdana(9, false);
    cellO.alignment = { horizontal: 'right', vertical: 'middle' };

    // P: Margem % (fora da borda da tabela principal)
    const cellP = worksheet.getCell(`P${r}`);
    const marginRatio = (markupPct / 100);
    cellP.value = marginRatio;
    cellP.numFmt = '0.00%';
    cellP.font = fontVerdana(8.5, false);
    cellP.alignment = { horizontal: 'right', vertical: 'middle' };

    // Q: Link Exato
    const cellQ = worksheet.getCell(`Q${r}`);
    cellQ.value = item.sourceUrl || '';
    cellQ.font = { name: 'Verdana', size: 8.5, color: { argb: 'FF0066CC' } };
    cellQ.alignment = { horizontal: 'left', vertical: 'middle' };

    // Aplicação das bordas na grade de dados B..O:
    // Bordas horizontais intermediárias pontilhadas; borda final grossa/média
    const bottomBorder = isLastRow ? borderMedium : borderDotted;
    const tableCols = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'];

    tableCols.forEach((colLetter, cIdx) => {
      const cell = worksheet.getCell(`${colLetter}${r}`);
      const isFirstCol = cIdx === 0;
      const isLastCol = cIdx === tableCols.length - 1;

      cell.border = {
        top: borderDotted,
        bottom: bottomBorder,
        left: isFirstCol ? borderMedium : borderThin,
        right: isLastCol ? borderMedium : borderThin
      };
    });
  });

  // 5. Linhas de Totais e Resumo Financeiro
  const lastItemRow = startRow + numItems - 1;

  // Espaçamento respeitando rigorosamente a instrução de Lucas: 1 linha em branco com exatamente 8 pixels (6pt)
  const spacerRowNumber = lastItemRow + 1;
  const spacerRow = worksheet.getRow(spacerRowNumber);
  spacerRow.height = 6; // 6pt = 8px exatos (8 * 72 / 96 = 6)

  const totRow1 = lastItemRow + 2; // Linha de Custo / Totais de Imposto, Lucro Bruto e Lucro Líquido
  const totRow2 = totRow1 + 1;     // Linha de Venda Total
  const totRow3 = totRow2 + 1;     // Linha de Lucro Líquido

  // Boxed border para caixas de resumo
  const boxBorder = {
    top: borderMedium,
    bottom: borderMedium,
    left: borderMedium,
    right: borderMedium
  };

  // --- Linha 1 do Resumo (totRow1) ---
  const cellLblCusto = worksheet.getCell(`G${totRow1}`);
  cellLblCusto.value = 'Custo';
  cellLblCusto.font = fontVerdana(9.5, true);
  cellLblCusto.alignment = { horizontal: 'right', vertical: 'middle' };

  const cellValCusto = worksheet.getCell(`H${totRow1}`);
  cellValCusto.value = { 
    formula: `SUM(I${startRow}:I${lastItemRow})`, 
    result: quote.totalCost + (quote.totalShipping ?? 0) 
  };
  cellValCusto.numFmt = numFmtAccounting;
  cellValCusto.font = fontVerdana(9.5, true);
  cellValCusto.alignment = { horizontal: 'right', vertical: 'middle' };
  cellValCusto.border = boxBorder;

  // Totais das colunas M, N, O
  const cellTotImposto = worksheet.getCell(`M${totRow1}`);
  cellTotImposto.value = { 
    formula: `SUM(M${startRow}:M${lastItemRow})`, 
    result: quote.totalTaxes ?? 0 
  };
  cellTotImposto.numFmt = numFmtAccounting;
  cellTotImposto.font = fontVerdana(9.5, true);
  cellTotImposto.alignment = { horizontal: 'right', vertical: 'middle' };
  cellTotImposto.border = boxBorder;

  const cellTotLucroBruto = worksheet.getCell(`N${totRow1}`);
  cellTotLucroBruto.value = { 
    formula: `SUM(N${startRow}:N${lastItemRow})`, 
    result: quote.totalAmount - (quote.totalCost + (quote.totalShipping ?? 0)) 
  };
  cellTotLucroBruto.numFmt = numFmtAccounting;
  cellTotLucroBruto.font = fontVerdana(9.5, true);
  cellTotLucroBruto.alignment = { horizontal: 'right', vertical: 'middle' };
  cellTotLucroBruto.border = boxBorder;

  const cellTotLucroLiq = worksheet.getCell(`O${totRow1}`);
  cellTotLucroLiq.value = { 
    formula: `SUM(O${startRow}:O${lastItemRow})`, 
    result: quote.totalProfit 
  };
  cellTotLucroLiq.numFmt = numFmtAccounting;
  cellTotLucroLiq.font = fontVerdana(9.5, true);
  cellTotLucroLiq.alignment = { horizontal: 'right', vertical: 'middle' };
  cellTotLucroLiq.border = boxBorder;

  // --- Linha 2 do Resumo (totRow2) ---
  const cellLblTotal = worksheet.getCell(`G${totRow2}`);
  cellLblTotal.value = 'Total';
  cellLblTotal.font = fontVerdana(9.5, true);
  cellLblTotal.alignment = { horizontal: 'right', vertical: 'middle' };

  const cellValTotal = worksheet.getCell(`H${totRow2}`);
  cellValTotal.value = { 
    formula: `SUM(L${startRow}:L${lastItemRow})`, 
    result: quote.totalAmount 
  };
  cellValTotal.numFmt = numFmtAccounting;
  cellValTotal.font = fontVerdana(9.5, true);
  cellValTotal.alignment = { horizontal: 'right', vertical: 'middle' };
  cellValTotal.border = boxBorder;

  const cellMarginTotal = worksheet.getCell(`I${totRow2}`);
  cellMarginTotal.value = (quote.averageMargin ?? 32) / 100;
  cellMarginTotal.numFmt = '0.00%';
  cellMarginTotal.font = fontVerdana(9.5, true);
  cellMarginTotal.alignment = { horizontal: 'right', vertical: 'middle' };

  // --- Linha 3 do Resumo (totRow3) ---
  const cellLblLucro = worksheet.getCell(`G${totRow3}`);
  cellLblLucro.value = 'Lucro';
  cellLblLucro.font = fontVerdana(9.5, true);
  cellLblLucro.alignment = { horizontal: 'right', vertical: 'middle' };

  const cellValLucro = worksheet.getCell(`H${totRow3}`);
  cellValLucro.value = { 
    formula: `O${totRow1}`, 
    result: quote.totalProfit 
  };
  cellValLucro.numFmt = numFmtAccounting;
  cellValLucro.font = fontVerdana(9.5, true);
  cellValLucro.alignment = { horizontal: 'right', vertical: 'middle' };
  cellValLucro.border = boxBorder;

  // 6. Geração do Nome de Arquivo Sugerido:
  // "nome da empresa" "data só com numeros" ex: UBEC 090926
  const cleanCompanyName = (quote.clientCompany || 'Cotacao')
    .replace(/^(ao|à|a|para)\s+/i, '')
    .replace(/[^a-zA-Z0-9À-ÿ\s_-]/g, '')
    .trim() || 'Cotacao';

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const dateOnlyDigits = `${dd}${mm}${yy}`;

  const suggestedFilename = `${cleanCompanyName} ${dateOnlyDigits}.xlsx`;

  // 7. Escrever o buffer binário do Excel
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  // 8. Abrir janela nativa do Windows "Salvar Como..." (File System Access API)
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
      if (err.name === 'AbortError') {
        // Usuário cancelou a janela de salvar
        return;
      }
      console.warn('showSaveFilePicker indisponível ou cancelado, acionando método de download padrão:', err);
    }
  }

  // Fallback: download via elemento <a> se o File System Access API não for suportado
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

/**
 * Exporta a planilha de compras e conciliação de lucro no padrão idêntico
 * à planilha oficial de Lucas Porto (Infodesk): "Compras 2026.xlsx".
 */
export async function exportPurchasesToExcel(
  items: import('../types').ProcurementItem[],
  selectedMonthName?: string,
  year = new Date().getFullYear()
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Infodesk SmartQuote';
  workbook.lastModifiedBy = 'Lucas Porto';
  workbook.created = new Date();
  workbook.modified = new Date();

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril',
    'Maio', 'Junho', 'Julho', 'Agosto',
    'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  // Agrupa os itens por mês (ou todos no mês selecionado)
  const itemsByMonth: Record<string, import('../types').ProcurementItem[]> = {};
  monthNames.forEach(m => { itemsByMonth[m] = []; });

  items.forEach(it => {
    const dateStr = it.purchasedAt || it.approvedAt || new Date().toISOString();
    const d = new Date(dateStr);
    const mIdx = isNaN(d.getTime()) ? new Date().getMonth() : d.getMonth();
    const mName = monthNames[mIdx] || 'Janeiro';
    if (!itemsByMonth[mName]) itemsByMonth[mName] = [];
    itemsByMonth[mName].push(it);
  });

  const sheetsToCreate = selectedMonthName && selectedMonthName !== 'all'
    ? [selectedMonthName]
    : monthNames;

  for (const monthName of sheetsToCreate) {
    const monthItems = itemsByMonth[monthName] || [];
    const worksheet = workbook.addWorksheet(monthName, {
      views: [{ showGridLines: true }]
    });

    // Largura das colunas (Col A e B são margens; Col C a M são dados)
    worksheet.columns = [
      { key: 'colA', width: 4 },   // A
      { key: 'colB', width: 4 },   // B
      { key: 'colC', width: 14 },  // C: Data
      { key: 'colD', width: 16 },  // D: Forma de pgto
      { key: 'colE', width: 22 },  // E: Cliente
      { key: 'colF', width: 50 },  // F: Produto
      { key: 'colG', width: 18 },  // G: Fornecedor
      { key: 'colH', width: 15 },  // H: Custo
      { key: 'colI', width: 13 },  // I: Frete
      { key: 'colJ', width: 15 },  // J: Venda
      { key: 'colK', width: 14 },  // K: Imposto
      { key: 'colL', width: 16 },  // L: Lucro Líquido
      { key: 'colM', width: 14 }   // M: Porcentagem
    ];

    // Linha 1: Cabeçalho com Resumo do Mês
    worksheet.getCell('N1').value = 'Mês';
    worksheet.getCell('O1').value = 'Ano';
    worksheet.getCell('P1').value = 'Média';
    worksheet.getCell('Q1').value = '% Média';
    worksheet.getRow(1).font = { name: 'Calibri', size: 10, bold: true };

    // Linha 2: Cabeçalho das Colunas
    worksheet.getCell('C2').value = 'Data';
    worksheet.getCell('D2').value = 'Forma de pgto';
    worksheet.getCell('E2').value = 'Cliente';
    worksheet.getCell('F2').value = 'Produto';
    worksheet.getCell('G2').value = 'Fornecedor';
    worksheet.getCell('H2').value = 'Custo';
    worksheet.getCell('I2').value = 'Frete';
    worksheet.getCell('J2').value = 'Venda';
    worksheet.getCell('K2').value = 'Imposto';
    worksheet.getCell('L2').value = 'Lucro Líquido';
    worksheet.getCell('M2').value = 'Porcentagem';

    const headerRow = worksheet.getRow(2);
    headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E293B' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Formatação de Cabeçalho com preenchimento sutil
    ['C2', 'D2', 'E2', 'F2', 'G2', 'H2', 'I2', 'J2', 'K2', 'L2', 'M2'].forEach(cellRef => {
      worksheet.getCell(cellRef).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' }
      };
      worksheet.getCell(cellRef).border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FF94A3B8' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });

    let currentRow = 4; // Começa na linha 4, exatamente como no arquivo original

    monthItems.forEach(item => {
      const row = worksheet.getRow(currentRow);
      const dateFormatted = (item.purchasedAt || item.approvedAt || '').split('T')[0];

      // C: Data
      row.getCell('C').value = dateFormatted || new Date().toISOString().split('T')[0];
      row.getCell('C').alignment = { horizontal: 'center' };

      // D: Forma de Pgto
      row.getCell('D').value = item.paymentMethod || 'PIX';
      row.getCell('D').alignment = { horizontal: 'center' };

      // E: Cliente
      row.getCell('E').value = item.clientCompany || '-';

      // F: Produto (Quantidade + Nome + Hiperlink de Compra se disponível)
      const purchaseLink = item.actualPurchaseUrl || item.sourceUrl;
      if (purchaseLink && purchaseLink.startsWith('http')) {
        row.getCell('F').value = {
          text: `${item.quantity} ${item.name}`,
          hyperlink: purchaseLink
        };
      } else {
        row.getCell('F').value = `${item.quantity} ${item.name}`;
      }

      // G: Fornecedor
      row.getCell('G').value = item.supplier || 'Mercado Livre';

      // H: Custo (Total pago na mercadoria)
      const costTotal = item.actualCostPrice !== undefined
        ? item.actualCostPrice
        : (item.quotedCostPrice * item.quantity);
      row.getCell('H').value = Number(costTotal.toFixed(2));
      row.getCell('H').numFmt = 'R$ #,##0.00';

      // I: Frete
      const frete = item.actualShippingCost !== undefined ? item.actualShippingCost : 0;
      row.getCell('I').value = frete > 0 ? Number(frete.toFixed(2)) : null;
      row.getCell('I').numFmt = 'R$ #,##0.00';

      // J: Venda (Valor total cobrado do cliente)
      const vendaTotal = item.quotedTotalPrice;
      row.getCell('J').value = Number(vendaTotal.toFixed(2));
      row.getCell('J').numFmt = 'R$ #,##0.00';

      // K: Imposto (Fórmula: J*9.05%)
      row.getCell('K').value = { formula: `J${currentRow}*9.05%` };
      row.getCell('K').numFmt = 'R$ #,##0.00';

      // L: Lucro Líquido (Fórmula: IF(H>0, J - K - IF(ISBLANK(I),0,I) - H, 0))
      row.getCell('L').value = { formula: `IF(H${currentRow}>0, J${currentRow}-K${currentRow}-IF(ISBLANK(I${currentRow}),0,I${currentRow})-H${currentRow}, 0)` };
      row.getCell('L').numFmt = 'R$ #,##0.00';

      // M: Porcentagem ROI (Fórmula: J / (IF(ISBLANK(I),0,I) + H + K) - 1)
      row.getCell('M').value = { formula: `IF((H${currentRow}+K${currentRow})>0, J${currentRow}/(IF(ISBLANK(I${currentRow}),0,I${currentRow})+H${currentRow}+K${currentRow})-1, 0)` };
      row.getCell('M').numFmt = '0.00%';

      // Formatação visual da linha
      row.font = { name: 'Calibri', size: 10 };
      ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'].forEach(col => {
        row.getCell(col).border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      });

      currentRow++;
    });

    // Linha de Totais se houver itens
    if (monthItems.length > 0) {
      const lastItemRow = currentRow - 1;
      const totalRow = worksheet.getRow(currentRow + 1);
      totalRow.getCell('E').value = 'TOTAL:';
      totalRow.getCell('E').font = { bold: true };
      totalRow.getCell('E').alignment = { horizontal: 'right' };

      totalRow.getCell('H').value = { formula: `SUM(H4:H${lastItemRow})` };
      totalRow.getCell('H').numFmt = 'R$ #,##0.00';
      totalRow.getCell('H').font = { bold: true };

      totalRow.getCell('I').value = { formula: `SUM(I4:I${lastItemRow})` };
      totalRow.getCell('I').numFmt = 'R$ #,##0.00';
      totalRow.getCell('I').font = { bold: true };

      totalRow.getCell('J').value = { formula: `SUM(J4:J${lastItemRow})` };
      totalRow.getCell('J').numFmt = 'R$ #,##0.00';
      totalRow.getCell('J').font = { bold: true, color: { argb: 'FF15803D' } };

      totalRow.getCell('K').value = { formula: `SUM(K4:K${lastItemRow})` };
      totalRow.getCell('K').numFmt = 'R$ #,##0.00';
      totalRow.getCell('K').font = { bold: true };

      totalRow.getCell('L').value = { formula: `SUM(L4:L${lastItemRow})` };
      totalRow.getCell('L').numFmt = 'R$ #,##0.00';
      totalRow.getCell('L').font = { bold: true, color: { argb: 'FF0369A1' } };

      totalRow.getCell('M').value = { formula: `AVERAGE(M4:M${lastItemRow})` };
      totalRow.getCell('M').numFmt = '0.00%';
      totalRow.getCell('M').font = { bold: true };

      ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'].forEach(col => {
        totalRow.getCell(col).border = {
          top: { style: 'thin', color: { argb: 'FF94A3B8' } },
          bottom: { style: 'double', color: { argb: 'FF475569' } }
        };
      });
    }
  }

  // Gera e faz o download do arquivo
  const filename = `Compras ${year}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
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
      console.warn('showSaveFilePicker fallback:', err);
    }
  }

  if (typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }
}

