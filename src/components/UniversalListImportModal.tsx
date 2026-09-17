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
  Layers
} from 'lucide-react';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { QuoteItem } from '../types';
import { detectDistributorProfile, DistributorProfile } from '../services/supplierConnectorService';

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
  [key: string]: any;
}

export const UniversalListImportModal: React.FC<UniversalListImportModalProps> = ({
  isOpen,
  onClose,
  onImportItems,
  defaultMarkupPercent = 25
}) => {
  const pasteAreaId = useId();
  const fileInputId = useId();
  const [activeTab, setActiveTab] = useState<'paste' | 'file'>('paste');
  const [pastedText, setPastedText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [detectedDistributor, setDetectedDistributor] = useState<DistributorProfile | null>(null);

  if (!isOpen) return null;

  // Tenta adivinhar o mapeamento de colunas com base nos cabeçalhos ou conteúdo
  const detectAndMapColumns = (rawMatrix: string[][], fileName: string = ''): ParsedRow[] => {
    if (!rawMatrix || rawMatrix.length === 0) return [];

    // Limpar linhas vazias
    const nonEmptyRows = rawMatrix.filter(r => r.some(cell => cell && cell.trim().length > 0));
    if (nonEmptyRows.length === 0) return [];

    let startIdx = 0;
    const headerRow = nonEmptyRows[0].map(h => (h || '').toLowerCase().trim());

    // Identifica distribuidor conhecido
    const profile = detectDistributorProfile(fileName, headerRow);
    setDetectedDistributor(profile);

    // Índices mapeados padrão
    let colPn = -1;
    let colDesc = -1;
    let colQty = -1;
    let colUnit = -1;
    let colCost = -1;
    let colNcm = -1;

    // Detectar se a primeira linha é cabeçalho
    const hasHeader = headerRow.some(h => 
      /c[oó]d(igo)?|pn|part\s*number|sku|item|descri[cç][aã]o|produto|material|qtd|quant(idade)?|un(idade)?|pre[cç]o|custo|valor|ncm|revenda/i.test(h)
    );

    if (hasHeader) {
      startIdx = 1;
      headerRow.forEach((col, idx) => {
        if (profile.pnHeaders.some(p => col.includes(p)) && colPn === -1) colPn = idx;
        else if (profile.nameHeaders.some(n => col.includes(n)) && colDesc === -1) colDesc = idx;
        else if (profile.costHeaders.some(c => col.includes(c)) && colCost === -1) colCost = idx;
        else if (profile.stockHeaders.some(s => col.includes(s)) && colQty === -1) colQty = idx;
        else if (profile.ncmHeaders.some(nc => col.includes(nc)) && colNcm === -1) colNcm = idx;
        else if (/c[oó]d(igo)?|pn|part\s*number|sku/i.test(col) && colPn === -1) colPn = idx;
        else if (/descri[cç][aã]o|produto|especifica[cç][aã]o|material|item/i.test(col) && colDesc === -1) colDesc = idx;
        else if (/qtd|quant(idade)?/i.test(col) && colQty === -1) colQty = idx;
        else if (/un(idade)?/i.test(col) && colUnit === -1) colUnit = idx;
        else if (/custo|pre[cç]o|valor|unit[aá]rio|revenda/i.test(col) && colCost === -1) colCost = idx;
        else if (/ncm/i.test(col) && colNcm === -1) colNcm = idx;
      });
    }

    // Heurística de fallback caso não tenha cabeçalho
    if (colDesc === -1) {
      if (nonEmptyRows[0].length === 1) {
        colDesc = 0;
      } else if (nonEmptyRows[0].length === 2) {
        // Ex: Descrição | Quantidade  OU  Código | Descrição
        const isSecondColNumber = !isNaN(Number(nonEmptyRows[0][1]?.replace(',', '.')));
        if (isSecondColNumber) {
          colDesc = 0;
          colQty = 1;
        } else {
          colPn = 0;
          colDesc = 1;
        }
      } else {
        // Ex: Código | Descrição | Quantidade ...
        colPn = 0;
        colDesc = 1;
        colQty = 2;
        if (nonEmptyRows[0].length >= 4) colUnit = 3;
        if (nonEmptyRows[0].length >= 5) colCost = 4;
      }
    }

    const results: ParsedRow[] = [];

    for (let i = startIdx; i < nonEmptyRows.length; i++) {
      const row = nonEmptyRows[i];
      const desc = colDesc !== -1 && row[colDesc] ? row[colDesc].trim() : '';
      if (!desc && colPn !== -1 && !row[colPn]) continue;

      const rawQty = colQty !== -1 && row[colQty] ? row[colQty].trim() : '1';
      const cleanQty = parseFloat(rawQty.replace(/\./g, '').replace(',', '.')) || 1;

      const rawCost = colCost !== -1 && row[colCost] ? row[colCost].trim() : '0';
      const cleanCost = parseFloat(rawCost.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;

      const rawPn = colPn !== -1 && row[colPn] ? row[colPn].trim() : '';
      const rawUnit = colUnit !== -1 && row[colUnit] ? row[colUnit].trim().toUpperCase() : 'UN';
      const rawNcm = colNcm !== -1 && row[colNcm] ? row[colNcm].replace(/[^0-9]/g, '') : '';

      results.push({
        partNumber: rawPn,
        name: desc || rawPn || `Item ${results.length + 1}`,
        description: desc,
        quantity: cleanQty > 0 ? cleanQty : 1,
        unit: rawUnit || 'UN',
        costPrice: cleanCost >= 0 ? cleanCost : 0,
        ncm: rawNcm
      });
    }

    return results;
  };

  const handleProcessPastedText = () => {
    setErrorMsg(null);
    if (!pastedText.trim()) {
      setErrorMsg('Cole o texto copiado de uma planilha do Excel ou tabela antes de processar.');
      return;
    }

    try {
      setIsProcessing(true);
      // O Excel copia células separadas por TAB (\t) e linhas por \n
      const lines = pastedText.split(/\r?\n/).filter(l => l.trim().length > 0);
      const matrix: string[][] = [];

      lines.forEach(line => {
        // Se tiver tabulações, é Excel
        if (line.includes('\t')) {
          matrix.push(line.split('\t'));
        } else if (line.includes(';') || line.includes(',')) {
          // CSV / texto separado por vírgula ou ponto-e-vírgula
          const parsed = Papa.parse(line, { delimiter: line.includes(';') ? ';' : ',' });
          if (parsed.data && parsed.data[0]) {
            matrix.push(parsed.data[0] as string[]);
          }
        } else {
          // Linha única (apenas descrição do produto)
          matrix.push([line]);
        }
      });

      const rows = detectAndMapColumns(matrix);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.csv')) {
        Papa.parse(file, {
          complete: (results) => {
            const rows = detectAndMapColumns(results.data as string[][], fileName);
            setParsedRows(rows);
            setSuccessCount(rows.length);
            setIsProcessing(false);
          },
          error: (err) => {
            setErrorMsg(`Falha ao ler arquivo CSV: ${err.message}`);
            setIsProcessing(false);
          }
        });
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];
        
        if (!worksheet) {
          throw new Error('A planilha selecionada não possui abas visíveis.');
        }

        const matrix: string[][] = [];
        worksheet.eachRow((row) => {
          const rowValues: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell) => {
            rowValues.push(cell.value ? String(cell.value) : '');
          });
          matrix.push(rowValues);
        });

        const rows = detectAndMapColumns(matrix, fileName);
        setParsedRows(rows);
        setSuccessCount(rows.length);
        setIsProcessing(false);
      } else {
        setErrorMsg('Por favor, selecione um arquivo válido (.xlsx, .xls ou .csv).');
        setIsProcessing(false);
      }
    } catch (err: any) {
      setErrorMsg(`Erro ao ler arquivo: ${err?.message || 'Arquivo corrompido ou incompatível'}`);
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = () => {
    if (parsedRows.length === 0) return;

    const formattedQuoteItems: Partial<QuoteItem>[] = parsedRows.map((row) => {
      const markup = defaultMarkupPercent > 0 ? defaultMarkupPercent : 25;
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
        ncm: row.ncm || undefined,
        supplier: detectedDistributor && detectedDistributor.id !== 'generic' 
          ? detectedDistributor.name 
          : (row.supplier || undefined)
      };
    });

    onImportItems(formattedQuoteItems);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Cabeçalho do Modal */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-700">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="sq-page-title text-base md:text-lg">Importador Universal de Listas</h2>
                <span className="sq-badge-code">MEL-10 & MEL-13</span>
                {detectedDistributor && detectedDistributor.id !== 'generic' && (
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-md text-[11px] font-bold">
                    Tabela: {detectedDistributor.name}
                  </span>
                )}
              </div>
              <p className="sq-page-subtitle">
                Importe planilhas Excel, tabelas de distribuidores (Ingram, SND, Aldo) ou copie e cole células diretamente
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-slate-200 px-6 bg-white">
          <button
            onClick={() => setActiveTab('paste')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'paste'
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <ClipboardPaste className="w-4 h-4" />
            Colar Células do Excel (Ctrl+V)
          </button>
          <button
            onClick={() => setActiveTab('file')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'file'
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            Carregar Arquivo (.xlsx / .csv)
          </button>
        </div>

        {/* Conteúdo Principal com Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeTab === 'paste' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor={pasteAreaId} className="sq-label mb-0">
                  Selecione as linhas na planilha do Excel, copie (Ctrl+C) e cole abaixo (Ctrl+V):
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const clipText = await navigator.clipboard.readText();
                      if (clipText) setPastedText(clipText);
                    } catch {
                      // Fallback se permissão de clipboard for negada
                    }
                  }}
                  className="text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Colar da Área de Transferência
                </button>
              </div>
              <textarea
                id={pasteAreaId}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                rows={6}
                placeholder="Exemplo colado:&#10;JL682A	Switch Aruba Instant On 1930 24G	2	UN	1200.00&#10;SMC1500C	Nobreak APC Smart-UPS 1500VA	1	UN	3400.00"
                className="sq-input h-auto py-3 font-mono text-xs leading-relaxed resize-y"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleProcessPastedText}
                  disabled={isProcessing || !pastedText.trim()}
                  className="sq-btn-primary flex items-center gap-2"
                >
                  {isProcessing ? 'Processando...' : 'Identificar Colunas e Gerar Prévia'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <label htmlFor={fileInputId} className="border-2 border-dashed border-slate-200 hover:border-sky-400 rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-slate-50/50 hover:bg-sky-50/30 transition-all cursor-pointer">
                <FileSpreadsheet className="w-12 h-12 text-slate-400 mb-3" />
                <span className="text-sm font-bold text-slate-800">
                  Clique para selecionar a planilha ou arraste para cá
                </span>
                <span className="text-xs text-slate-500 mt-1">
                  Formatos aceitos: Microsoft Excel (.xlsx, .xls) ou Texto Separado por Vírgula (.csv)
                </span>
                <input
                  id={fileInputId}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
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
                        <td className="py-2 px-3 font-medium text-slate-800 max-w-md truncate">
                          {row.name}
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
