/**
 * SERVIÇO DE APRENDIZADO CONTÍNUO DE PERCENTUAIS DE DÓLAR DO FORNECEDOR (DIRETRIZ DO LUCAS)
 *
 * Permite que o sistema aprenda com os percentuais de acréscimo cobrados pelos fornecedores
 * sobre o valor em dólar para cada tipo de produto (ex: HDs sempre ~15%, Celulares ~20%, etc.).
 *
 * Após algumas comparações e produtos salvos, o sistema deduz e sugere automaticamente
 * a porcentagem ideal para o tipo de produto identificado.
 */

import { Product, Quote } from '../types';

export interface LearnedDollarSurcharge {
  key: string;
  label: string;
  learnedPercent: number;
  sampleCount: number;
  confidence: 'Inicial' | 'Frequente' | 'Consolidado';
  history: Array<{ percent: number; timestamp: string; productName?: string }>;
  lastUpdated: string;
}

const STORAGE_KEY = 'infodesk_learned_dollar_surcharges_v1';

// Mapeamento canônico de categorias/termos frequentes no segmento de suprimentos corporativos
const TAXONOMY_PATTERNS: Array<{
  regex: RegExp;
  key: string;
  label: string;
  defaultPercent?: number;
}> = [
  { regex: /\b(hd|hds|disco\s*r[ií]gido|hard\s*disk|hdd)\b/i, key: 'hd', label: 'HDs / Discos Rígidos' },
  { regex: /\b(ssd|ssds|nvme|m\.?2\s*nvme)\b/i, key: 'ssd', label: 'SSDs / Armazenamento Flash' },
  { regex: /\b(celular|celulares|smartphone|smartphones|iphone|galaxy\s*s|redmi|xiaomi)\b/i, key: 'celular', label: 'Celulares & Smartphones' },
  { regex: /\b(mem[oó]ria|mem[oó]rias|ram|ddr4|ddr5|dimm|sodimm)\b/i, key: 'memoria_ram', label: 'Memórias RAM' },
  { regex: /\b(processador|processadores|cpu|ryzen|intel\s*core|xeon)\b/i, key: 'processador', label: 'Processadores' },
  { regex: /\b(placa\s*de\s*v[ií]deo|gpu|rtx|gtx|radeon|geforce)\b/i, key: 'placa_video', label: 'Placas de Vídeo' },
  { regex: /\b(placa\s*m[aã]e|motherboard|mainboard)\b/i, key: 'placa_mae', label: 'Placas-Mãe' },
  { regex: /\b(fonte|fontes|fonte\s*atx|power\s*supply)\b/i, key: 'fonte', label: 'Fontes de Alimentação' },
  { regex: /\b(switch|switches|switch\s*gerenci[aá]vel)\b/i, key: 'switch', label: 'Switches de Rede' },
  { regex: /\b(roteador|roteadores|access\s*point|ap\s*wi-?fi)\b/i, key: 'roteador', label: 'Roteadores & APs' },
  { regex: /\b(servidor|servidores|rack\s*server)\b/i, key: 'servidor', label: 'Servidores & Infra' },
  { regex: /\b(nobreak|nobreaks|ups|estabilizador)\b/i, key: 'nobreak', label: 'Nobreaks & Energia' },
  { regex: /\b(monitor|monitores|display|tela\s*led)\b/i, key: 'monitor', label: 'Monitores & Displays' },
  { regex: /\b(notebook|notebooks|laptop|laptops|macbook)\b/i, key: 'notebook', label: 'Notebooks & Laptops' },
  { regex: /\b(tablet|tablets|ipad)\b/i, key: 'tablet', label: 'Tablets & iPads' },
  { regex: /\b(headset|headsets|fone|headphones|auricular)\b/i, key: 'headset', label: 'Fones & Headsets' },
  { regex: /\b(teclado|teclados)\b/i, key: 'teclado', label: 'Teclados' },
  { regex: /\b(mouse|mouses)\b/i, key: 'mouse', label: 'Mouses' },
  { regex: /\b(impressora|impressoras|multifuncional|rotulador)\b/i, key: 'impressora', label: 'Impressoras' },
  { regex: /\b(webcam|camera|c[aâ]mera)\b/i, key: 'camera', label: 'Câmeras & Vídeo' },
  { regex: /\b(cabo|cabos|patch\s*cord|hdmi)\b/i, key: 'cabo', label: 'Cabos & Conectividade' }
];

// Cache em memória
let memorySurcharges: Record<string, LearnedDollarSurcharge> = {};
let isLoaded = false;

function loadFromStorage(): void {
  if (isLoaded) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      memorySurcharges = JSON.parse(raw);
    }
  } catch {
    memorySurcharges = {};
  }
  isLoaded = true;
}

function persistToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memorySurcharges));
  } catch {
    // localStorage may be disabled or full
  }
}

/**
 * Normaliza o texto e extrai o "tipo de produto" (família ou palavra-chave principal)
 */
export function classifyProductType(productName?: string, category?: string): { key: string; label: string } {
  const norm = (productName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  // 1. Verifica taxonomia conhecida (HDs, Celulares, SSDs, etc.)
  for (const item of TAXONOMY_PATTERNS) {
    if (item.regex.test(norm)) {
      return { key: item.key, label: item.label };
    }
  }

  // 2. Extrai o substantivo/palavra central se o nome for válido
  const tokens = norm
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !/^\d+$/.test(t) && !/^(para|com|sem|pro|plus|ultra|max|mini|usb|gb|tb|mb|ghz|mhz|bivolt|220v|110v|un|pct|kit|cx)$/i.test(t));

  if (tokens.length > 0) {
    const primaryToken = tokens[0];
    const capitalized = primaryToken.charAt(0).toUpperCase() + primaryToken.slice(1);
    return {
      key: `custom_${primaryToken}`,
      label: `${capitalized}s (Geral)`
    };
  }

  // 3. Fallback pela categoria do sistema
  if (category && category.trim()) {
    const catSlug = category
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_');
    return {
      key: `cat_${catSlug}`,
      label: category
    };
  }

  return { key: 'diversos', label: 'Diversos' };
}

/**
 * Calcula a porcentagem mais frequente (moda) ou média ponderada de uma lista de valores
 */
function calculateConsolidatedPercent(history: Array<{ percent: number }>): number {
  if (history.length === 0) return 0;
  if (history.length === 1) return history[0].percent;

  // Agrupa frequências
  const freqMap: Record<string, number> = {};
  history.forEach(h => {
    const rounded = Number(h.percent.toFixed(2)).toString();
    freqMap[rounded] = (freqMap[rounded] || 0) + 1;
  });

  // Encontra a maior frequência
  let bestVal = history[history.length - 1].percent;
  let maxFreq = 0;
  for (const [valStr, count] of Object.entries(freqMap)) {
    if (count > maxFreq) {
      maxFreq = count;
      bestVal = parseFloat(valStr);
    }
  }

  // Se houver empate na frequência, pondera os mais recentes
  if (maxFreq === 1) {
    const recent = history.slice(-5);
    const sum = recent.reduce((acc, h) => acc + h.percent, 0);
    return Number((sum / recent.length).toFixed(2));
  }

  return Number(bestVal.toFixed(2));
}

function calculateConfidence(sampleCount: number): 'Inicial' | 'Frequente' | 'Consolidado' {
  if (sampleCount >= 4) return 'Consolidado';
  if (sampleCount >= 2) return 'Frequente';
  return 'Inicial';
}

/**
 * Registra o percentual de acréscimo do fornecedor para o tipo de produto
 * e atualiza o conhecimento do sistema.
 */
export function learnDollarSurcharge(
  productName: string | undefined,
  surchargePercent: number,
  category?: string
): LearnedDollarSurcharge | null {
  if (!productName || isNaN(surchargePercent) || surchargePercent <= 0) {
    return null;
  }

  loadFromStorage();

  const { key, label } = classifyProductType(productName, category);
  const nowIso = new Date().toISOString();

  const existing = memorySurcharges[key] || {
    key,
    label,
    learnedPercent: surchargePercent,
    sampleCount: 0,
    confidence: 'Inicial',
    history: [],
    lastUpdated: nowIso
  };

  const newHistory = [
    ...existing.history,
    {
      percent: Number(surchargePercent.toFixed(2)),
      timestamp: nowIso,
      productName: productName.slice(0, 100)
    }
  ].slice(-30); // Mantém até 30 observações mais recentes

  const sampleCount = newHistory.length;
  const learnedPercent = calculateConsolidatedPercent(newHistory);
  const confidence = calculateConfidence(sampleCount);

  const updated: LearnedDollarSurcharge = {
    key,
    label: existing.label || label,
    learnedPercent,
    sampleCount,
    confidence,
    history: newHistory,
    lastUpdated: nowIso
  };

  memorySurcharges[key] = updated;
  persistToStorage();

  return updated;
}

/**
 * Prediz/sugere a porcentagem do fornecedor com base no nome do produto e categoria
 */
export function predictDollarSurcharge(
  productName?: string,
  category?: string
): { percent: number; confidence: 'Inicial' | 'Frequente' | 'Consolidado'; label: string; sampleCount: number } | null {
  if (!productName && !category) return null;

  loadFromStorage();

  const { key, label } = classifyProductType(productName, category);
  const learned = memorySurcharges[key];

  if (learned && learned.sampleCount > 0 && learned.learnedPercent > 0) {
    return {
      percent: learned.learnedPercent,
      confidence: learned.confidence,
      label: learned.label,
      sampleCount: learned.sampleCount
    };
  }

  return null;
}

/**
 * Retorna todos os aprendizados consolidados
 */
export function getAllLearnedDollarSurcharges(): Record<string, LearnedDollarSurcharge> {
  loadFromStorage();
  return { ...memorySurcharges };
}

/**
 * Carrega e aprende a partir do catálogo existente de produtos
 */
export function learnDollarSurchargesFromProducts(products: Product[]): void {
  if (!Array.isArray(products) || products.length === 0) return;

  loadFromStorage();
  let changed = false;

  for (const p of products) {
    const dollar = Number(p.dollarPrice);
    const surcharge = Number((p as any).dollarSurchargePercent);
    if (p.name && dollar > 0 && surcharge > 0) {
      learnDollarSurcharge(p.name, surcharge, p.category);
      changed = true;
    }
  }

  if (changed) {
    persistToStorage();
  }
}

/**
 * Carrega e aprende a partir de propostas do histórico
 */
export function learnDollarSurchargesFromQuotes(quotes: Quote[]): void {
  if (!Array.isArray(quotes) || quotes.length === 0) return;

  loadFromStorage();
  let changed = false;

  for (const q of quotes) {
    if (!Array.isArray(q.items)) continue;
    for (const it of q.items) {
      const dollar = Number(it.dollarPrice);
      const surcharge = Number(it.dollarSurchargePercent);
      if (it.name && dollar > 0 && surcharge > 0) {
        learnDollarSurcharge(it.name, surcharge, it.category);
        changed = true;
      }
    }
  }

  if (changed) {
    persistToStorage();
  }
}

/**
 * Reseta a memória de aprendizado (útil para testes unitários)
 */
export function resetLearnedDollarSurcharges(): void {
  memorySurcharges = {};
  isLoaded = true;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
