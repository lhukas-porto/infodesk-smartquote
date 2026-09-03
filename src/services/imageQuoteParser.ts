import Tesseract from 'tesseract.js';
import { 
  extractFullCompanyName, 
  extractDeliveryLocation, 
  extractContactPhone, 
  extractEmailFromText, 
  extractContactPersonFromText 
} from '../utils/aiEmailParser';

export interface ExtractedImageQuoteData {
  senderName: string;
  senderEmail: string;
  senderCompany: string;
  senderPhone?: string;
  deliveryLocation?: string;
  subject?: string;
  items: Array<{
    name: string;
    description: string;
    rawSearchQuery: string;
    quantity: number;
    unit: string;
    itemCode?: string;
    partNumber?: string;
    estimatedCost?: number;
    sourceUrl?: string;
  }>;
}

/**
 * Preprocesses image on a canvas to maximize OCR accuracy:
 * - Upscale pequena para melhor reconhecimento
 * - Aumento de contraste adaptativo
 */
export async function preprocessImageForOcr(imageSource: string | File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource));
        return;
      }
      const scale = img.width < 1200 ? 2.0 : 1;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
          const avg = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
          const enhanced = avg > 180 ? 255 : avg < 80 ? 0 : Math.round((avg - 80) / 100 * 255);
          d[i] = enhanced; d[i+1] = enhanced; d[i+2] = enhanced;
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(canvas.toDataURL('image/png'));
      }
    };
    img.onerror = () => resolve(typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource));
    img.src = typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIMESTAMP_RE = /^\d{2}:\d{2}$/;
const SKIP_LINE_RE = /^(https?:\/\/|www\.|de |da |do |para |com |por |em |no |na |total|valor|R\$)/i;

/** Remove timestamp do final da linha: "VÁLVULA... 08:38" → "VÁLVULA..." */
function stripTimestamp(line: string): string {
  return line.replace(/\s+\d{2}:\d{2}\s*$/, '').trim();
}

/** Extrai quantidade de uma string: "2 UNIDADES", "REF.: BERMAD: 2 UNIDADES" */
function extractQty(text: string): { qty: number; cleaned: string } {
  // Padrão: ": N UNIDADES" ou "- N UNIDADES" ou "N UNIDADES" no final
  const patterns = [
    /[:\-–]\s*(\d+)\s*(?:UNIDADES?|UN\.?|PCS?|PÇS?|UNID\.?|PEÇAS?)\s*$/i,
    /(\d+)\s*(?:UNIDADES?|UN\.?|PCS?|PÇS?|UNID\.?|PEÇAS?)\s*$/i,
    /^(\d+)\s*[xX]\s*/i,
    /\s+(\d+)\s*(?:UN|PC|PÇ)\s*$/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const qty = parseInt(m[1]) || 1;
      const cleaned = text.replace(p, '').trim().replace(/[:\-–]\s*$/, '').trim();
      return { qty, cleaned };
    }
  }
  return { qty: 1, cleaned: text };
}

/** Extrai referência/modelo de uma string */
function extractRef(text: string): string {
  const m = text.match(/REF\.?:?\s*([A-Za-z][A-Za-z0-9\-\/\s]{1,20}?)(?:[:\s]|$)/i) ||
            text.match(/MOD(?:ELO)?\.?\s*([A-Za-z0-9][A-Za-z0-9\-\/\s]{1,20}?)(?:\s|$)/i);
  return m?.[1]?.trim() || '';
}

// ─── Estratégia 1: Tabela estruturada (planilha/PDF com ITEM | QUANT | UN | DESCRIÇÃO) ──

function parseTableFormat(lines: string[]): ExtractedImageQuoteData['items'] {
  const items: ExtractedImageQuoteData['items'] = [];
  for (const line of lines) {
    const rowMatch = line.match(
      /^(?:(\d{1,3})\s+)?(?:(\d{4,8})\s+)?([A-Za-z0-9À-ÿ\s/.,\-_()]{4,120}?)\s+(UN|PC|CX|PCT|KG|LT|MT|PAR|KIT|M)\s+([\d.,]+)/i
    );
    if (rowMatch) {
      const code = rowMatch[2]?.trim();
      const desc = rowMatch[3].trim();
      const unit = rowMatch[4].toUpperCase();
      const qty = parseFloat(rowMatch[5].replace(',', '.')) || 1;
      if (desc.length >= 3 && !/^(item|quant|uni|disc|descri)/i.test(desc)) {
        items.push({
          name: code ? `${desc} — Cód: ${code}` : desc,
          description: '',
          rawSearchQuery: code ? `${desc} ${code}` : desc,
          quantity: qty,
          unit: unit.includes('CX') ? 'Cx.' : unit.includes('KG') ? 'Kg' : 'Un.',
          itemCode: code, partNumber: code, estimatedCost: 150
        });
      }
    }
  }
  return items;
}

// ─── Estratégia 2: Print de WhatsApp ──────────────────────────────────────────
//
// Lógica: o OCR lê linha por linha, mas um produto pode ter 2-3 linhas visuais.
// O timestamp HH:MM no final de cada mensagem é o separador natural de blocos.
//
// Exemplo de OCR bruto de um print de WhatsApp:
//   "VÁLVULA REDUTORA DE PRESSÃO"
//   "AÇÃO DIRETA MODELO 42LP - ø1"."
//   "REF.: BERMAD: 2 UNIDADES  08:38"
//   ""
//   "VÁLVULA REDUTORA DE PRESSÃO"
//   "PILOTADA – MODELO BC420 – ø2""
//   "(ROSCA). REF.: BERMAD  08:16"
//   ""
//   "Junta de Expansão Genebre"
//   "EPDM Dupla Onda BSP 2""
//
// Estratégia:
//   1. Dividir o texto em "blocos de mensagem" delimitados por timestamps ou linhas em branco
//   2. Dentro de cada bloco, juntar todas as linhas em uma só descrição
//   3. Extrair quantidade e referência do texto combinado

function parseWhatsAppBlockFormat(rawText: string): ExtractedImageQuoteData['items'] {
  const items: ExtractedImageQuoteData['items'] = [];

  // Normalizar OCR: "ø" pode vir como "0", "O", "9", "o" em contexto de diâmetro
  // "—" pode vir como "-" ou "–"
  const text = rawText
    .replace(/\r\n/g, '\n')
    .replace(/(\b(?:DN|Ø|ø|diam\.?)\s*)([0-9]+)/gi, '$1$2'); // normalizar diâmetro

  // Quebrar em blocos separados por:
  //   - Linha em branco
  //   - Linha só com timestamp "HH:MM"
  //   - Linha só com "—" ou "─"
  const rawLines = text.split('\n').map(l => l.trim());
  
  // Agrupar linhas em blocos: cada bloco termina quando encontra timestamp ou linha em branco
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    if (!line) {
      // Linha em branco → fim do bloco atual
      if (currentBlock.length > 0) {
        blocks.push([...currentBlock]);
        currentBlock = [];
      }
      continue;
    }

    if (TIMESTAMP_RE.test(line)) {
      // Timestamp isolado → fim do bloco atual
      if (currentBlock.length > 0) {
        blocks.push([...currentBlock]);
        currentBlock = [];
      }
      continue;
    }

    // Linha com timestamp embutido no final: "...texto... 08:38"
    const strippedLine = stripTimestamp(line);
    if (strippedLine !== line) {
      // Tinha timestamp embutido — adiciona linha limpa e fecha bloco
      if (strippedLine.length > 0) currentBlock.push(strippedLine);
      if (currentBlock.length > 0) {
        blocks.push([...currentBlock]);
        currentBlock = [];
      }
      continue;
    }

    currentBlock.push(line);
  }

  // Último bloco sem timestamp
  if (currentBlock.length > 0) blocks.push(currentBlock);

  console.log('[imageQuoteParser] WhatsApp blocks:', blocks);

  for (const block of blocks) {
    // Filtrar linhas de ruído dentro do bloco
    const meaningfulLines = block.filter(l =>
      l.length >= 3 &&
      !SKIP_LINE_RE.test(l) &&
      !TIMESTAMP_RE.test(l) &&
      !/^\d+$/.test(l) // número puro
    );

    if (meaningfulLines.length === 0) continue;

    // Juntar todas as linhas do bloco em uma descrição completa
    const combined = meaningfulLines.join(' ').replace(/\s{2,}/g, ' ').trim();

    if (combined.length < 6) continue;

    // Extrair quantidade
    const { qty, cleaned } = extractQty(combined);

    // Extrair referência
    const ref = extractRef(cleaned);

    // Nome final limpo
    const name = cleaned.length > 5 ? cleaned : combined;

    // Evitar duplicatas
    const alreadyExists = items.some(it =>
      it.rawSearchQuery.toLowerCase().includes(name.substring(0, 12).toLowerCase())
    );
    if (alreadyExists) continue;

    // Não adicionar se for claramente ruído (número, URL, só pontuação)
    if (/^[\d\s.,;:!\-–]+$/.test(name)) continue;
    if (name.length < 6) continue;

    items.push({
      name,
      description: '',
      rawSearchQuery: ref ? `${name} ${ref}`.trim() : name,
      quantity: qty,
      unit: 'Un.',
      partNumber: ref || undefined,
      estimatedCost: 150
    });
  }

  return items;
}

// ─── Estratégia 3: Fallback liberal ───────────────────────────────────────────
// Para qualquer imagem que não se encaixa nos formatos anteriores.
// Extrai qualquer linha com ≥12 chars que pareça texto de produto.

function parseLiberalFallback(lines: string[]): ExtractedImageQuoteData['items'] {
  const items: ExtractedImageQuoteData['items'] = [];
  for (const line of lines) {
    const cleaned = stripTimestamp(line);
    if (
      cleaned.length >= 10 &&
      cleaned.length <= 200 &&
      !TIMESTAMP_RE.test(cleaned) &&
      !/^https?:\/\//i.test(cleaned) &&
      /[a-zA-ZÀ-ÿ]{3,}/.test(cleaned) &&
      !SKIP_LINE_RE.test(cleaned)
    ) {
      const { qty, cleaned: name } = extractQty(cleaned);
      if (!items.find(it => it.rawSearchQuery.includes(name.substring(0, 12)))) {
        items.push({
          name,
          description: '',
          rawSearchQuery: name,
          quantity: qty,
          unit: 'Un.',
          estimatedCost: 150
        });
      }
    }
  }
  return items;
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Extrai itens e metadados do comprador a partir de uma imagem de pedido/cotação.
 * Suporta: tabela estruturada, print de WhatsApp, foto de tela com produtos.
 */
export async function extractDataFromQuotationImage(
  imageSource: string | File,
  onProgress?: (percent: number, message: string) => void
): Promise<ExtractedImageQuoteData> {
  onProgress?.(15, 'Otimizando imagem para leitura ótica...');

  let ocrText = '';
  try {
    const processedUrl = await preprocessImageForOcr(imageSource);
    onProgress?.(35, 'Iniciando reconhecimento de texto e tabelas (OCR)...');

    const result = await Tesseract.recognize(processedUrl, 'por+eng', {
      logger: m => {
        if (m.status === 'recognizing text' && m.progress) {
          const p = Math.round(35 + m.progress * 50);
          onProgress?.(p, `Lendo texto da imagem (${p}%)...`);
        }
      }
    });

    ocrText = result.data?.text || '';
    console.log('[imageQuoteParser] OCR raw text:\n', ocrText);
  } catch (err) {
    console.warn('[imageQuoteParser] Erro na leitura ótica:', err);
  }

  onProgress?.(88, 'Identificando produtos e dados de contato...');

  // ─── Metadados do remetente ───────────────────────────────────────────────
  const senderEmail = extractEmailFromText(ocrText);
  const senderPhone = extractContactPhone(ocrText) || '';
  const senderCompany = extractFullCompanyName('', '', '', ocrText);
  const senderName = extractContactPersonFromText(ocrText);
  const deliveryLocation = extractDeliveryLocation(ocrText) || 'Brasília';

  // ─── Cascata de parsers ───────────────────────────────────────────────────
  const lines = ocrText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let items: ExtractedImageQuoteData['items'] = [];

  // 1ª: Tabela estruturada (planilha/PDF)
  items = parseTableFormat(lines);
  console.log(`[imageQuoteParser] parseTableFormat → ${items.length} itens`);

  // 2ª: Print de WhatsApp (agrupa linhas por bloco de mensagem)
  if (items.length === 0) {
    items = parseWhatsAppBlockFormat(ocrText);
    console.log(`[imageQuoteParser] parseWhatsAppBlockFormat → ${items.length} itens`);
  }

  // 3ª: Fallback liberal (linha a linha)
  if (items.length === 0) {
    items = parseLiberalFallback(lines);
    console.log(`[imageQuoteParser] parseLiberalFallback → ${items.length} itens`);
  }

  onProgress?.(100, `Concluído! ${items.length} iten${items.length !== 1 ? 's' : ''} encontrado${items.length !== 1 ? 's' : ''}.`);

  return {
    senderName,
    senderEmail,
    senderCompany,
    senderPhone,
    deliveryLocation,
    subject: senderCompany
      ? `Cotação de Materiais — ${senderCompany}`
      : 'Cotação de Materiais',
    items
  };
}
