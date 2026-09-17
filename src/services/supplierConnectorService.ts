/**
 * Serviço de Conexão e Normalização de Tabelas de Distribuidores (MEL-13)
 * Suporta formatos de catálogos e planilhas de distribuidores de TI:
 * - Ingram Micro (colunas SKU, PN, Fabricante, Preço Revenda, Estoque)
 * - SND Distribuidora (colunas Cód. SND, Part Number, Descrição, Preço, Qtd)
 * - Aldo Solar / Golden Distribuidora (colunas Modelo, Fabricante, Preço Custo)
 * - Formato Genérico Inteligente (detecção heurística por cabeçalho)
 */

export interface NormalizedDistributorItem {
  partNumber: string;
  sku?: string;
  name: string;
  description?: string;
  brand?: string;
  category?: string;
  ncm?: string;
  costPrice: number;
  stockQuantity?: number;
  supplier: string;
  warrantyMonths?: number;
}

export type DistributorType = 'ingram' | 'snd' | 'aldo' | 'generic';

export interface DistributorProfile {
  id: DistributorType;
  name: string;
  aliases: string[];
  pnHeaders: string[];
  nameHeaders: string[];
  costHeaders: string[];
  brandHeaders: string[];
  stockHeaders: string[];
  ncmHeaders: string[];
}

export const DISTRIBUTOR_PROFILES: DistributorProfile[] = [
  {
    id: 'ingram',
    name: 'Ingram Micro Brasil',
    aliases: ['ingram', 'ingram micro', 'im'],
    pnHeaders: ['vendor part number', 'part number', 'partnumber', 'pn', 'mpn', 'código fabricante'],
    nameHeaders: ['product description', 'descrição do produto', 'descricao', 'nome do produto', 'item'],
    costHeaders: ['revenda', 'preço revenda', 'unit price', 'custo', 'preco', 'preço'],
    brandHeaders: ['vendor', 'fabricante', 'marca', 'vendor name'],
    stockHeaders: ['inventory', 'estoque', 'stock', 'quantidade disponível'],
    ncmHeaders: ['ncm', 'classificação fiscal']
  },
  {
    id: 'snd',
    name: 'SND Distribuição',
    aliases: ['snd', 'snd distribuidora'],
    pnHeaders: ['part number', 'cód. fabricante', 'cod fabricante', 'pn'],
    nameHeaders: ['descrição', 'descricao', 'produto', 'especificação'],
    costHeaders: ['preço faturado', 'preço', 'preco', 'unitario', 'custo'],
    brandHeaders: ['fabricante', 'marca', 'linha'],
    stockHeaders: ['disponivel', 'estoque', 'qtd', 'saldo'],
    ncmHeaders: ['ncm', 'class. fiscal']
  },
  {
    id: 'aldo',
    name: 'Aldo Solar / Geral',
    aliases: ['aldo', 'aldo solar'],
    pnHeaders: ['código', 'codigo', 'modelo', 'part number'],
    nameHeaders: ['descrição do equipamento', 'equipamento', 'descricao', 'produto'],
    costHeaders: ['preço à vista', 'preco a vista', 'preço', 'custo'],
    brandHeaders: ['marca', 'fabricante'],
    stockHeaders: ['estoque', 'disponibilidade'],
    ncmHeaders: ['ncm']
  },
  {
    id: 'generic',
    name: 'Distribuidor Genérico',
    aliases: ['geral', 'outro'],
    pnHeaders: ['pn', 'part number', 'partnumber', 'código', 'codigo', 'sku', 'ref', 'modelo'],
    nameHeaders: ['descrição', 'descricao', 'nome', 'produto', 'item', 'material'],
    costHeaders: ['preço', 'preco', 'custo', 'valor', 'unitário', 'unitario', 'vlr'],
    brandHeaders: ['marca', 'fabricante', 'brand'],
    stockHeaders: ['estoque', 'saldo', 'qtd', 'quantidade', 'disponível', 'disponivel'],
    ncmHeaders: ['ncm', 'class fiscal']
  }
];

/**
 * Detecta o distribuidor pelo cabeçalho ou nome do arquivo
 */
export function detectDistributorProfile(fileName: string, headers: string[]): DistributorProfile {
  const lowerFile = fileName.toLowerCase();
  for (const prof of DISTRIBUTOR_PROFILES) {
    if (prof.id === 'generic') continue;
    if (prof.aliases.some(a => lowerFile.includes(a))) {
      return prof;
    }
  }

  // Se não identificou pelo nome do arquivo, testa correspondência com cabeçalhos
  const lowerHeaders = headers.map(h => h.trim().toLowerCase());
  for (const prof of DISTRIBUTOR_PROFILES) {
    if (prof.id === 'generic') continue;
    const hasPn = prof.pnHeaders.some(p => lowerHeaders.includes(p));
    const hasName = prof.nameHeaders.some(n => lowerHeaders.includes(n));
    if (hasPn && hasName) {
      return prof;
    }
  }

  return DISTRIBUTOR_PROFILES.find(p => p.id === 'generic') || DISTRIBUTOR_PROFILES[3];
}

/**
 * Normaliza um número monetário no formato R$ ou padrão numérico internacional
 */
export function parseCurrencyValue(raw: any): number {
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  if (!raw) return 0;

  const str = String(raw).trim();
  // Limpar R$, espaços e símbolos
  let clean = str.replace(/[R$\s]/g, '');

  // Se tiver vírgula e ponto (ex: 1.250,50)
  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    // Ex: 1250,50
    clean = clean.replace(',', '.');
  }

  const num = parseFloat(clean);
  return isNaN(num) ? 0 : Number(num.toFixed(2));
}

/**
 * Processa linhas de tabela bruta convertendo para itens normalizados
 */
export function parseDistributorRows(
  rows: Record<string, any>[],
  profile: DistributorProfile,
  supplierOverride?: string
): NormalizedDistributorItem[] {
  if (!rows || rows.length === 0) return [];

  const headers = Object.keys(rows[0] || {});
  const findKey = (candidates: string[]) => {
    return headers.find(h => candidates.includes(h.trim().toLowerCase())) || '';
  };

  const pnKey = findKey(profile.pnHeaders) || findKey(DISTRIBUTOR_PROFILES[3].pnHeaders);
  const nameKey = findKey(profile.nameHeaders) || findKey(DISTRIBUTOR_PROFILES[3].nameHeaders);
  const costKey = findKey(profile.costHeaders) || findKey(DISTRIBUTOR_PROFILES[3].costHeaders);
  const brandKey = findKey(profile.brandHeaders) || findKey(DISTRIBUTOR_PROFILES[3].brandHeaders);
  const stockKey = findKey(profile.stockHeaders) || findKey(DISTRIBUTOR_PROFILES[3].stockHeaders);
  const ncmKey = findKey(profile.ncmHeaders) || findKey(DISTRIBUTOR_PROFILES[3].ncmHeaders);

  const normalized: NormalizedDistributorItem[] = [];

  for (const row of rows) {
    const rawName = nameKey ? String(row[nameKey] || '').trim() : '';
    const rawPn = pnKey ? String(row[pnKey] || '').trim() : '';
    const rawCost = costKey ? parseCurrencyValue(row[costKey]) : 0;

    // Ignora linhas sem nome e sem PN ou custo zero
    if (!rawName && !rawPn) continue;

    const brand = brandKey ? String(row[brandKey] || '').trim() : '';
    const ncm = ncmKey ? String(row[ncmKey] || '').trim() : '';
    const stock = stockKey ? parseInt(String(row[stockKey] || '0').replace(/\D/g, ''), 10) || 0 : undefined;

    normalized.push({
      partNumber: rawPn,
      name: rawName || rawPn,
      description: rawName,
      brand,
      ncm,
      costPrice: rawCost,
      stockQuantity: stock,
      supplier: supplierOverride || profile.name
    });
  }

  return normalized;
}
