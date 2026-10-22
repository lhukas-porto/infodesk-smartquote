import React, { useState, useId } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  ClipboardPaste, 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight,
  Sparkles,
  Layers,
  FileUp,
  FileText,
  MessageSquare,
  Loader2,
  Image as ImageIcon
} from 'lucide-react';
import Papa from 'papaparse';
import { QuoteItem } from '../types';
import { detectDistributorProfile, DistributorProfile } from '../services/supplierConnectorService';
import { extractQuoteItemsWithAI } from '../services/multiItemExtractorService';
import { extractItemsFromEmailContent } from '../utils/aiEmailParser';
import { extractDataFromQuotationImage } from '../services/imageQuoteParser';
import { reportError } from '../services/errorReporter';
import { compressImageDataUrl } from '../utils/imageCompressor';

interface UniversalListImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportItems: (newItems: Partial<QuoteItem>[]) => void;
  defaultMarkupPercent?: number;
}

interface ParsedRow {
  partNumber: string;
  name: string;
  description: string;
  quantity: number;
  unit: string;
  costPrice: number;
  ncm?: string;
  supplier?: string;
  imageUrl?: string;
  [key: string]: any;
}

interface SheetOption {
  index: number;
  name: string;
  rowCount: number;
}

interface MatrixRowItem {
  rowNumber: number;
  cells: string[];
  imageUrl?: string;
}

/**
 * Converte com segurança buffers binários de imagens para dataUrl em Base64
 */
function arrayBufferToBase64DataUrl(buffer: any, extension: string): string {
  try {
    let bytes: Uint8Array;
    if (buffer instanceof Uint8Array) {
      bytes = buffer;
    } else if (buffer && buffer.buffer) {
      bytes = new Uint8Array(buffer.buffer);
    } else {
      bytes = new Uint8Array(buffer);
    }
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const cleanExt = (extension || 'jpeg').toLowerCase().replace(/^\./, '');
    const mime = cleanExt === 'png' ? 'image/png' : (cleanExt === 'gif' ? 'image/gif' : 'image/jpeg');
    return `data:${mime};base64,${base64}`;
  } catch (e) {
    console.warn('Erro ao converter imagem de planilha:', e);
    return '';
  }
}

/**
 * Extrai fotos reais embutidas nas células da aba do Excel
 */
async function extractImagesFromWorksheet(workbook: any, worksheet: any): Promise<Map<number, string>> {
  const imagesMap = new Map<number, string>();
  try {
    const rawImages = typeof worksheet.getImages === 'function' ? worksheet.getImages() : [];
    if (!Array.isArray(rawImages) || rawImages.length === 0) return imagesMap;

    for (const imgRef of rawImages) {
      try {
        const imageId = imgRef.imageId;
        if (imageId === undefined || imageId === null) continue;

        const imgData = typeof workbook.getImage === 'function' 
          ? workbook.getImage(Number(imageId)) 
          : null;
        if (!imgData || !imgData.buffer) continue;

        const ext = imgData.extension || 'jpeg';
        let row1Indexed = -1;

        if (typeof imgRef.range === 'string') {
          const match = imgRef.range.match(/\d+/);
          if (match) row1Indexed = parseInt(match[0], 10);
        } else if (imgRef.range && typeof imgRef.range === 'object') {
          if (imgRef.range.tl) {
            const rawR = imgRef.range.tl.nativeRow !== undefined 
              ? imgRef.range.tl.nativeRow + 1 
              : (imgRef.range.tl.row !== undefined ? Math.floor(imgRef.range.tl.row) + 1 : -1);
            row1Indexed = rawR;
          }
        }

        if (row1Indexed > 0) {
          const dataUrl = arrayBufferToBase64DataUrl(imgData.buffer, ext);
          if (dataUrl) {
            const compressed = await compressImageDataUrl(dataUrl, 500, 500, 0.82);
            imagesMap.set(row1Indexed, compressed);
          }
        }
      } catch (imgErr) {
        console.warn('Erro ao processar imagem individual do Excel:', imgErr);
      }
    }
  } catch (err) {
    console.warn('Falha ao extrair imagens da aba Excel:', err);
  }
  return imagesMap;
}

/**
 * Mapeamento de colunas de alta precisão
 * Analisa estatisticamente a natureza dos dados (palavras, números, moedas, códigos)
 */
function detectAndMapAdvancedMatrix(
  rawRows: MatrixRowItem[],
  fileName: string = '',
  detectedProfile?: DistributorProfile | null
): ParsedRow[] {
  if (!rawRows || rawRows.length === 0) return [];

  // Filtrar linhas vazias (sem células com texto e sem imagem)
  const nonEmptyRows = rawRows.filter(r => 
    r.imageUrl || r.cells.some(c => c && c.trim().length > 0)
  );
  if (nonEmptyRows.length === 0) return [];

  let startIdx = 0;
  const firstRowCells = nonEmptyRows[0].cells.map(h => (h || '').toLowerCase().trim());

  // Verificar se a primeira linha é um cabeçalho
  const hasHeader = firstRowCells.some(h => 
    /c[oó]d(igo)?|pn|part\s*number|sku|item|descri[cç][aã]o|produto|material|especifica[cç][aã]o|qtd|quant(idade)?|un(idade)?|pre[cç]o|custo|valor|ncm|revenda|foto|imagem/i.test(h)
  );

  let colPn = -1;
  let colDesc = -1;
  let colQty = -1;
  let colUnit = -1;
  let colCost = -1;
  let colNcm = -1;

  if (hasHeader) {
    startIdx = 1;
    firstRowCells.forEach((col, idx) => {
      if (detectedProfile) {
        if (detectedProfile.pnHeaders.some(p => col.includes(p)) && colPn === -1) colPn = idx;
        else if (detectedProfile.nameHeaders.some(n => col.includes(n)) && colDesc === -1) colDesc = idx;
        else if (detectedProfile.costHeaders.some(c => col.includes(c)) && colCost === -1) colCost = idx;
        else if (detectedProfile.stockHeaders.some(s => col.includes(s)) && colQty === -1) colQty = idx;
        else if (detectedProfile.ncmHeaders.some(nc => col.includes(nc)) && colNcm === -1) colNcm = idx;
      }

      if (/c[oó]d(igo)?|pn|part\s*number|sku|ref(er[eê]ncia)?/i.test(col) && colPn === -1) colPn = idx;
      else if (/descri[cç][aã]o|produto|especifica[cç][aã]o|material|item|nome/i.test(col) && colDesc === -1) colDesc = idx;
      else if (/qtd|quant(idade)?/i.test(col) && colQty === -1) colQty = idx;
      else if (/un(idade)?/i.test(col) && colUnit === -1) colUnit = idx;
      else if (/custo|pre[cç]o|valor|unit[aá]rio|revenda/i.test(col) && colCost === -1) colCost = idx;
      else if (/ncm/i.test(col) && colNcm === -1) colNcm = idx;
    });
  }

  // Se não detectou por cabeçalho, fazer análise estatística profunda das colunas
  if (colDesc === -1) {
    const candidateRows = nonEmptyRows.slice(startIdx);
    const maxCols = Math.max(...candidateRows.map(r => r.cells.length));
    
    interface ColStat {
      index: number;
      nonEmptyCount: number;
      avgLength: number;
      avgWords: number;
      numericCount: number;
      priceCount: number;
      unitCount: number;
      shortCodeCount: number;
    }

    const stats: ColStat[] = [];
    for (let c = 0; c < maxCols; c++) {
      let nonEmptyCount = 0;
      let totalLength = 0;
      let totalWords = 0;
      let numericCount = 0;
      let priceCount = 0;
      let unitCount = 0;
      let shortCodeCount = 0;

      for (const r of candidateRows) {
        const val = (r.cells[c] || '').trim();
        if (val) {
          nonEmptyCount++;
          totalLength += val.length;
          const words = val.split(/\s+/).filter(Boolean);
          totalWords += words.length;

          // Numérico puro (ex: 1, 5, 10, 25)
          if (/^\d+([.,]\d+)?$/.test(val)) {
            numericCount++;
          }
          // Preço / Moeda (ex: R$ 10,00 ou 10,50)
          if (/^r?\$?\s*\d+([.,]\d{2})$/i.test(val) || /^r\$\s*[\d.,]+/i.test(val)) {
            priceCount++;
          }
          // Unidade conhecida
          if (/^(un|un\.|pc|pç|cx|m|kg|par|l|kit|cj|und|rolo|g|pct)$/i.test(val)) {
            unitCount++;
          }
          // Código curto (ex: MO-01, SKU123, AP406SL)
          if (val.length <= 15 && words.length === 1 && /^[A-Z0-9-_.]{2,15}$/i.test(val)) {
            shortCodeCount++;
          }
        }
      }

      stats.push({
        index: c,
        nonEmptyCount,
        avgLength: nonEmptyCount > 0 ? totalLength / nonEmptyCount : 0,
        avgWords: nonEmptyCount > 0 ? totalWords / nonEmptyCount : 0,
        numericCount,
        priceCount,
        unitCount,
        shortCodeCount
      });
    }

    // 1. Descrição: coluna com maior quantidade de palavras e comprimento de texto
    // (ex: "Bowl quadrado 25cm Melamina", "Travessa 31x25 cm marca Germer")
    const descCandidates = [...stats].filter(s => s.nonEmptyCount > 0 && s.avgWords >= 1.4);
    if (descCandidates.length > 0) {
      descCandidates.sort((a, b) => b.avgLength - a.avgLength);
      colDesc = descCandidates[0].index;
    } else {
      // Fallback: coluna não numérica com maior texto
      const textCandidates = [...stats].filter(s => s.nonEmptyCount > 0 && s.numericCount / s.nonEmptyCount < 0.5);
      if (textCandidates.length > 0) {
        textCandidates.sort((a, b) => b.avgLength - a.avgLength);
        colDesc = textCandidates[0].index;
      } else {
        colDesc = 0;
      }
    }

    // 2. Quantidade: coluna puramente numérica (que não seja a de descrição)
    const qtyCandidates = [...stats].filter(s => 
      s.index !== colDesc && 
      s.nonEmptyCount > 0 && 
      (s.numericCount / s.nonEmptyCount) >= 0.5 &&
      s.priceCount === 0
    );
    if (qtyCandidates.length > 0) {
      colQty = qtyCandidates[0].index;
    }

    // 3. Preço / Custo: coluna com formato monetário
    const costCandidates = [...stats].filter(s => 
      s.index !== colDesc && 
      s.index !== colQty && 
      s.nonEmptyCount > 0 && 
      s.priceCount > 0
    );
    if (costCandidates.length > 0) {
      colCost = costCandidates[0].index;
    }

    // 4. Código / Part Number: coluna com códigos curtos alfanuméricos (ex: MO-01, MO-02)
    const pnCandidates = [...stats].filter(s => 
      s.index !== colDesc && 
      s.index !== colQty && 
      s.index !== colCost && 
      s.nonEmptyCount > 0 && 
      (s.shortCodeCount / s.nonEmptyCount) >= 0.5
    );
    if (pnCandidates.length > 0) {
      colPn = pnCandidates[0].index;
    }

    // 5. Unidade
    const unitCandidates = [...stats].filter(s => 
      s.index !== colDesc && 
      s.index !== colQty && 
      s.index !== colCost && 
      s.index !== colPn && 
      s.nonEmptyCount > 0 && 
      s.unitCount > 0
    );
    if (unitCandidates.length > 0) {
      colUnit = unitCandidates[0].index;
    }
  }

  const results: ParsedRow[] = [];

  for (let i = startIdx; i < nonEmptyRows.length; i++) {
    const rowObj = nonEmptyRows[i];
    const row = rowObj.cells;
    const desc = colDesc !== -1 && row[colDesc] ? row[colDesc].trim() : '';
    const rawPn = colPn !== -1 && row[colPn] ? row[colPn].trim() : '';

    // Se não tiver nem descrição nem código, mas tiver imagem, usa "Produto [Linha]"
    if (!desc && !rawPn && !rowObj.imageUrl) continue;

    const rawQty = colQty !== -1 && row[colQty] ? row[colQty].trim() : '1';
    const cleanQty = parseFloat(rawQty.replace(/\./g, '').replace(',', '.')) || 1;

    const rawCost = colCost !== -1 && row[colCost] ? row[colCost].trim() : '0';
    const cleanCost = parseFloat(rawCost.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;

    const rawUnit = colUnit !== -1 && row[colUnit] ? row[colUnit].trim().toUpperCase() : 'UN';
    const rawNcm = colNcm !== -1 && row[colNcm] ? row[colNcm].replace(/[^0-9]/g, '') : '';

    const name = desc || rawPn || `Item ${results.length + 1}`;

    results.push({
      partNumber: rawPn,
      name,
      description: desc || name,
      quantity: cleanQty > 0 ? cleanQty : 1,
      unit: rawUnit || 'UN',
      costPrice: cleanCost >= 0 ? cleanCost : 0,
      ncm: rawNcm,
      imageUrl: rowObj.imageUrl || undefined
    });
  }

  return results;
}

/**
 * Lê e analisa uma aba específica do Excel com suporte completo a imagens e mapeamento
 */
async function parseWorksheetData(
  workbook: any,
  worksheet: any,
  fileName: string,
  detectedProfile?: DistributorProfile | null
): Promise<ParsedRow[]> {
  // 1. Extrair imagens embutidas nas células
  const rowImagesMap = await extractImagesFromWorksheet(workbook, worksheet);

  // 2. Extrair matriz de células
  const rawRows: MatrixRowItem[] = [];
  worksheet.eachRow((row: any, rowNumber: number) => {
    const rowValues: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell: any) => {
      let val = '';
      if (cell.value !== undefined && cell.value !== null) {
        if (typeof cell.value === 'object') {
          if (cell.value.result !== undefined) {
            val = String(cell.value.result);
          } else if (Array.isArray(cell.value.richText)) {
            val = cell.value.richText.map((t: any) => t.text).join('');
          } else if (cell.value.text !== undefined) {
            val = String(cell.value.text);
          } else {
            val = String(cell.value);
          }
        } else {
          val = String(cell.value);
        }
      }
      rowValues.push(val.trim());
    });

    const img = rowImagesMap.get(rowNumber) || 
                rowImagesMap.get(rowNumber - 1) || 
                rowImagesMap.get(rowNumber + 1);

    rawRows.push({
      rowNumber,
      cells: rowValues,
      imageUrl: img
    });
  });

  return detectAndMapAdvancedMatrix(rawRows, fileName, detectedProfile);
}

export const UniversalListImportModal: React.FC<UniversalListImportModalProps> = ({
  isOpen,
  onClose,
  onImportItems,
  defaultMarkupPercent = 23.5
}) => {
  const pasteAreaId = useId();
  const freeTextAreaId = useId();
  const fileInputId = useId();
  const [activeTab, setActiveTab] = useState<'paste' | 'freeText' | 'file'>('paste');
  const [pastedText, setPastedText] = useState('');
  const [freeText, setFreeText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [detectedDistributor, setDetectedDistributor] = useState<DistributorProfile | null>(null);

  // Gerenciamento de Múltiplas Abas (Worksheets) do Excel
  const [availableSheets, setAvailableSheets] = useState<SheetOption[]>([]);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState<number>(0);
  const [loadedWorkbook, setLoadedWorkbook] = useState<any>(null);
  const [loadedFileName, setLoadedFileName] = useState<string>('');

  if (!isOpen) return null;

  const handleProcessPastedText = () => {
    setErrorMsg(null);
    if (!pastedText.trim()) {
      setErrorMsg('Cole o texto copiado de uma planilha do Excel ou tabela antes de processar.');
      return;
    }

    try {
      setIsProcessing(true);
      const lines = pastedText.split(/\r?\n/).filter(l => l.trim().length > 0);
      const rawRows: MatrixRowItem[] = [];

      lines.forEach((line, idx) => {
        if (line.includes('\t')) {
          rawRows.push({ rowNumber: idx + 1, cells: line.split('\t') });
        } else if (line.includes(';') || line.includes(',')) {
          const parsed = Papa.parse(line, { delimiter: line.includes(';') ? ';' : ',' });
          if (parsed.data && parsed.data[0]) {
            rawRows.push({ rowNumber: idx + 1, cells: parsed.data[0] as string[] });
          }
        } else {
          rawRows.push({ rowNumber: idx + 1, cells: [line] });
        }
      });

      const profile = detectDistributorProfile('', rawRows[0]?.cells.map(c => c.toLowerCase()) || []);
      setDetectedDistributor(profile);

      const rows = detectAndMapAdvancedMatrix(rawRows, '', profile);
      if (rows.length === 0) {
        setErrorMsg('Nenhum item válido identificado no texto colado. Verifique as colunas.');
        setParsedRows([]);
      } else {
        setParsedRows(rows);
        setSuccessCount(rows.length);
      }
    } catch (err: any) {
      setErrorMsg(`Erro ao interpretar texto: ${err?.message || 'Formato não reconhecido'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessFreeText = async () => {
    setErrorMsg(null);
    if (!freeText.trim()) {
      setErrorMsg('Cole o texto da mensagem do cliente (WhatsApp ou e-mail) antes de processar.');
      return;
    }

    try {
      setIsProcessing(true);
      const res = await extractQuoteItemsWithAI(freeText);
      const items = res.items && res.items.length > 0 
        ? res.items 
        : extractItemsFromEmailContent(freeText);

      if (!items || items.length === 0) {
        setErrorMsg('Nenhum item comercial identificado no texto. Tente colar uma lista com itens e quantidades (ex: "10x Cabos Furukawa Cat6").');
        setParsedRows([]);
      } else {
        const rows: ParsedRow[] = items.map((it: any) => ({
          partNumber: it.partNumber || '',
          name: it.name,
          description: it.description || it.name,
          quantity: it.quantity && it.quantity > 0 ? it.quantity : 1,
          unit: it.unit || 'UN',
          costPrice: it.estimatedCost || 0,
          ncm: it.ncm || ''
        }));
        setParsedRows(rows);
        setSuccessCount(rows.length);
      }
    } catch (err: any) {
      setErrorMsg(`Erro ao processar texto: ${err?.message || 'Falha na extração de itens'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    setProcessingMessage('');
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.pdf')) {
        setProcessingMessage('Lendo documento PDF com IA Gemini e extraindo itens...');
        try {
          const res = await extractDataFromQuotationImage(file, (_pct, msg) => {
            if (msg) setProcessingMessage(msg);
          });

          if (res && res.items && res.items.length > 0) {
            const rows: ParsedRow[] = res.items.map((it: any) => ({
              partNumber: it.partNumber || it.itemCode || '',
              name: it.name,
              description: it.description || it.name,
              quantity: it.quantity > 0 ? it.quantity : 1,
              unit: it.unit || 'UN',
              costPrice: it.estimatedCost || 0,
              ncm: it.ncm || ''
            }));
            setParsedRows(rows);
            setSuccessCount(rows.length);
            setAvailableSheets([]);
            setLoadedWorkbook(null);
          } else {
            setErrorMsg('Não foi possível identificar itens de produtos no arquivo PDF. Certifique-se de que o documento contém uma lista legível de produtos/materiais.');
            setParsedRows([]);
          }
        } catch (pdfErr: any) {
          reportError('Importação de Arquivo PDF', pdfErr, `Arquivo: ${file.name} (${file.size} bytes)`);
          setErrorMsg(pdfErr?.message || 'Falha ao processar o arquivo PDF. Verifique se a sua chave Gemini está configurada.');
          setParsedRows([]);
        } finally {
          setIsProcessing(false);
          setProcessingMessage('');
        }
      } else if (fileName.endsWith('.csv')) {
        setProcessingMessage('Interpretando dados do arquivo CSV...');
        Papa.parse(file, {
          complete: (results) => {
            const rawRows: MatrixRowItem[] = (results.data as string[][]).map((r, idx) => ({
              rowNumber: idx + 1,
              cells: r
            }));
            const profile = detectDistributorProfile(fileName, rawRows[0]?.cells.map(c => c.toLowerCase()) || []);
            setDetectedDistributor(profile);
            const rows = detectAndMapAdvancedMatrix(rawRows, fileName, profile);
            setParsedRows(rows);
            setSuccessCount(rows.length);
            setAvailableSheets([]);
            setLoadedWorkbook(null);
            setIsProcessing(false);
            setProcessingMessage('');
          },
          error: (err) => {
            reportError('Importação de CSV', err, `Arquivo CSV: ${file.name}`);
            setErrorMsg(`Falha ao ler arquivo CSV: ${err.message}`);
            setIsProcessing(false);
            setProcessingMessage('');
          }
        });
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        setProcessingMessage('Carregando planilha Excel e mapeando abas...');
        const buffer = await file.arrayBuffer();
        const ExcelJS = (await import('exceljs')).default || await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        if (!workbook.worksheets || workbook.worksheets.length === 0) {
          throw new Error('A planilha selecionada não possui abas visíveis.');
        }

        const sheets: SheetOption[] = workbook.worksheets.map((ws: any, idx: number) => ({
          index: idx,
          name: ws.name || `Aba ${idx + 1}`,
          rowCount: ws.actualRowCount || ws.rowCount || 0
        }));

        setLoadedWorkbook(workbook);
        setLoadedFileName(file.name);
        setAvailableSheets(sheets);

        // Seleciona a aba que tem o maior número de linhas preenchidas por padrão
        let initialIndex = 0;
        let maxLines = 0;
        sheets.forEach((s, idx) => {
          if (s.rowCount > maxLines) {
            maxLines = s.rowCount;
            initialIndex = idx;
          }
        });

        setSelectedSheetIndex(initialIndex);
        setProcessingMessage(`Processando itens e fotos da aba "${sheets[initialIndex].name}"...`);

        const profile = detectDistributorProfile(fileName, []);
        setDetectedDistributor(profile);

        const rows = await parseWorksheetData(workbook, workbook.worksheets[initialIndex], file.name, profile);
        setParsedRows(rows);
        setSuccessCount(rows.length);
        setIsProcessing(false);
        setProcessingMessage('');
      } else {
        setErrorMsg('Por favor, selecione um arquivo válido (.pdf, .xlsx, .xls ou .csv).');
        setIsProcessing(false);
        setProcessingMessage('');
      }
    } catch (err: any) {
      reportError('Importação de Arquivo', err, `Arquivo: ${file?.name || 'Desconhecido'}`);
      setErrorMsg(`Erro ao ler arquivo: ${err?.message || 'Arquivo corrompido ou incompatível'}`);
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  const handleSelectSheet = async (sheetIndex: number) => {
    if (!loadedWorkbook || !loadedWorkbook.worksheets[sheetIndex]) return;
    try {
      setIsProcessing(true);
      setSelectedSheetIndex(sheetIndex);
      const ws = loadedWorkbook.worksheets[sheetIndex];
      setProcessingMessage(`Lendo dados e fotos da aba "${ws.name || sheetIndex + 1}"...`);

      const rows = await parseWorksheetData(loadedWorkbook, ws, loadedFileName, detectedDistributor);
      setParsedRows(rows);
      setSuccessCount(rows.length);
    } catch (err: any) {
      reportError('Troca de Aba Excel', err, `Aba: ${sheetIndex}`);
      setErrorMsg(`Erro ao ler aba: ${err?.message || 'Falha ao processar'}`);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  const handleConfirmImport = () => {
    if (parsedRows.length === 0) return;

    const formattedQuoteItems: Partial<QuoteItem>[] = parsedRows.map((row) => {
      const markup = defaultMarkupPercent > 0 ? defaultMarkupPercent : 23.5;
      const cost = row.costPrice || 0;
      const unitPrice = cost > 0 ? Number((cost * (1 + markup / 100)).toFixed(2)) : 0;
      const totalPrice = Number((unitPrice * row.quantity).toFixed(2));

      return {
        name: row.name,
        description: row.description || row.name,
        partNumber: row.partNumber || undefined,
        quantity: row.quantity,
        unit: row.unit || 'UN',
        costPrice: cost,
        markupPercent: markup,
        unitPrice: unitPrice,
        totalPrice: totalPrice,
        imageUrl: row.imageUrl || undefined,
        showImage: Boolean(row.imageUrl)
      };
    });

    onImportItems(formattedQuoteItems);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Cabeçalho do Modal */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-sky-700 shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="sq-page-title text-base md:text-lg flex items-center gap-2">
                <span>Importação Inteligente de Listas & Planilhas</span>
                <span className="sq-badge-code text-[10px]">Multi-Formato</span>
              </h3>
              <p className="sq-page-subtitle">
                Importe planilhas Excel (.xlsx), documentos PDF (.pdf), tabelas CSV ou copie e cole mensagens de cotação
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas Superiores de Seleção de Origem */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`flex items-center gap-2 py-2.5 px-4 text-xs font-bold rounded-t-xl transition-colors border-t border-x cursor-pointer ${
              activeTab === 'paste'
                ? 'bg-white text-sky-700 border-slate-200 -mb-px'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            <ClipboardPaste className="w-4 h-4" />
            <span>Colar da Planilha (Excel/CSV)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={`flex items-center gap-2 py-2.5 px-4 text-xs font-bold rounded-t-xl transition-colors border-t border-x cursor-pointer ${
              activeTab === 'file'
                ? 'bg-white text-sky-700 border-slate-200 -mb-px'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload de Arquivo (Excel / PDF / CSV)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('freeText')}
            className={`flex items-center gap-2 py-2.5 px-4 text-xs font-bold rounded-t-xl transition-colors border-t border-x cursor-pointer ${
              activeTab === 'freeText'
                ? 'bg-white text-sky-700 border-slate-200 -mb-px'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Mensagem Livre (WhatsApp / E-mail)</span>
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {detectedDistributor && (
            <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-bold text-emerald-950">
                  Padrão detectado: {detectedDistributor.name}
                </span>
              </div>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                Mapeamento Automático
              </span>
            </div>
          )}

          {activeTab === 'paste' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor={pasteAreaId} className="sq-label mb-0">
                  Selecione as linhas da sua planilha, copie (Ctrl+C) e cole (Ctrl+V) no campo abaixo:
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text) setPastedText(text);
                    } catch {
                      // Silently fallback if permission denied
                    }
                  }}
                  className="text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" /> Colar da Área de Transferência
                </button>
              </div>
              <textarea
                id={pasteAreaId}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                rows={6}
                className="sq-input h-auto py-3 font-mono text-xs leading-relaxed resize-y text-slate-800"
              />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[11px] text-slate-500">
                  Dica: Você pode copiar colunas como: Código | Descrição | Quantidade | Unidade | Custo
                </span>
                <button
                  type="button"
                  onClick={handleProcessPastedText}
                  disabled={isProcessing || !pastedText.trim()}
                  className="sq-btn-emerald flex items-center gap-2"
                >
                  {isProcessing ? 'Mapeando Colunas...' : 'Interpretar e Identificar Itens'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'freeText' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor={freeTextAreaId} className="sq-label mb-0">
                  Cole o texto informal do pedido (mensagens de WhatsApp ou cotações de e-mail):
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text) setFreeText(text);
                    } catch {
                      // Silently fallback
                    }
                  }}
                  className="text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Colar da Área de Transferência
                </button>
              </div>
              <textarea
                id={freeTextAreaId}
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                rows={6}
                className="sq-input h-auto py-3 font-sans text-xs leading-relaxed resize-y text-slate-800"
              />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  Nossa IA extrairá produtos, quantidades, códigos e unidades automaticamente.
                </span>
                <button
                  type="button"
                  onClick={handleProcessFreeText}
                  disabled={isProcessing || !freeText.trim()}
                  className="sq-btn-emerald flex items-center gap-2"
                >
                  {isProcessing ? 'Extraindo Produtos...' : 'Extrair Produtos da Mensagem'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'file' && (
            <div className="space-y-4">
              <label htmlFor={fileInputId} className="border-2 border-dashed border-slate-200 hover:border-sky-400 rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-slate-50/50 hover:bg-sky-50/30 transition-all cursor-pointer">
                {isProcessing ? (
                  <div className="flex flex-col items-center py-4 space-y-3">
                    <Loader2 className="w-10 h-10 text-sky-600 animate-spin" />
                    <span className="text-sm font-bold text-slate-800">
                      {processingMessage || 'Processando arquivo...'}
                    </span>
                    <span className="text-xs text-slate-400">
                      Extraindo linhas, fotos embutidas e especificações da planilha...
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-700 mb-3">
                      <FileUp className="w-7 h-7" />
                    </div>
                    <span className="text-sm font-bold text-slate-800">
                      Clique para selecionar ou arraste o arquivo para cá
                    </span>
                    <span className="text-xs text-slate-500 mt-1">
                      Formatos aceitos: Microsoft Excel (.xlsx, .xls com suporte a fotos e múltiplas abas), PDF (.pdf) ou CSV (.csv)
                    </span>
                  </>
                )}
                <input
                  id={fileInputId}
                  type="file"
                  accept=".xlsx, .xls, .csv, .pdf, application/pdf"
                  onChange={handleFileUpload}
                  disabled={isProcessing}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* Seletor Elegante de Múltiplas Abas do Excel */}
          {availableSheets.length > 1 && (
            <div className="p-3.5 bg-gradient-to-r from-sky-50 via-indigo-50/40 to-white border border-sky-200 rounded-2xl shadow-xs space-y-2.5 animate-fadeIn">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-sky-600 text-white text-[10px] font-extrabold uppercase tracking-wide rounded-md">
                    {availableSheets.length} Abas Encontradas
                  </span>
                  <span className="text-xs font-bold text-slate-800">
                    Selecione a aba da planilha que deseja carregar:
                  </span>
                </div>
                <span className="text-[11px] text-sky-800 font-medium">
                  Aba ativa: <strong>{availableSheets[selectedSheetIndex]?.name}</strong>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {availableSheets.map((s) => (
                  <button
                    key={s.index}
                    type="button"
                    onClick={() => handleSelectSheet(s.index)}
                    disabled={isProcessing}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-2 ${
                      selectedSheetIndex === s.index
                        ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-xs font-bold'
                        : 'bg-white hover:bg-sky-50 text-slate-700 border border-slate-200 shadow-2xs'
                    }`}
                  >
                    <FileSpreadsheet className={`w-3.5 h-3.5 ${selectedSheetIndex === s.index ? 'text-white' : 'text-sky-600'}`} />
                    <span>{s.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                      selectedSheetIndex === s.index ? 'bg-sky-700 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {s.rowCount} lin
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mensagens de Alerta ou Erro */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Grid de Prévia dos Itens Identificados */}
          {parsedRows.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="sq-section-title text-sm">
                    {parsedRows.length} {parsedRows.length === 1 ? 'item identificado' : 'itens identificados'} para importação
                  </span>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  Confira as informações antes de inserir na proposta
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Part Number / Cód</th>
                      <th className="py-2.5 px-3">Descrição do Produto</th>
                      <th className="py-2.5 px-3 text-center">Qtd</th>
                      <th className="py-2.5 px-3 text-center">Un</th>
                      <th className="py-2.5 px-3 text-right">Custo Estimado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {parsedRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-semibold text-sky-700">
                          {row.partNumber || <span className="text-slate-300 italic">-</span>}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-800 max-w-md">
                          <div className="flex items-center gap-2.5">
                            {row.imageUrl ? (
                              <img 
                                src={row.imageUrl} 
                                alt="" 
                                className="w-10 h-10 rounded-lg object-contain bg-slate-50 border border-slate-200 shrink-0 shadow-2xs" 
                              />
                            ) : null}
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-900">{row.name}</div>
                              {row.description && row.description !== row.name && (
                                <div className="text-[11px] text-slate-500 truncate max-w-sm">
                                  {row.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-slate-700">
                          {row.quantity}
                        </td>
                        <td className="py-2 px-3 text-center text-slate-500 uppercase text-[11px]">
                          {row.unit}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700">
                          {row.costPrice > 0 ? (
                            `R$ ${row.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          ) : (
                            <span className="text-slate-400 italic">A pesquisar</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="px-6 py-3.5 border-t border-slate-200 flex items-center justify-between bg-slate-50/70">
          <button
            onClick={onClose}
            className="sq-btn-neutral"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmImport}
            disabled={parsedRows.length === 0}
            className="sq-btn-emerald flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Layers className="w-4 h-4" />
            Inserir {parsedRows.length > 0 ? `${parsedRows.length} Itens` : 'Itens'} na Cotação
          </button>
        </div>
      </div>
    </div>
  );
};
