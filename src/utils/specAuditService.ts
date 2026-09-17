/**
 * Escudo de Compatibilidade Técnica e Auditoria de Especificações (MEL-14)
 * Realiza checagem cruzada determinística entre a solicitação do cliente
 * e a oferta encontrada na web/fornecedor, detectando divergências críticas
 * de voltagem, PoE, memórias e capacidade antes da compra.
 */

export interface SpecAuditResult {
  score: number; // 0 a 100%
  status: 'exact' | 'equivalent' | 'conflict';
  badgeLabel: string;
  badgeColor: 'emerald' | 'amber' | 'rose';
  conflictReasons: string[];
  matchedSpecs: string[];
}

/**
 * Normaliza textos removendo acentos e pontuações para comparação
 */
function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Detecta especificações críticas de tensão (110V, 220V, Bivolt)
 */
function extractVoltage(text: string): '110v' | '220v' | 'bivolt' | null {
  const norm = normalizeText(text);
  if (/\b(bivolt|bi-volt|100-240v|110\/220v|110-220v)\b/i.test(norm)) return 'bivolt';
  if (/\b(220v|230v|240v)\b/i.test(norm)) return '220v';
  if (/\b(110v|115v|127v)\b/i.test(norm)) return '110v';
  return null;
}

/**
 * Detecta especificações de PoE (Power over Ethernet)
 */
function extractPoe(text: string): { isPoe: boolean; isExplicitNonPoe: boolean } {
  const norm = normalizeText(text);
  const isExplicitNonPoe = /\b(nao\s*poe|sem\s*poe|non-poe)\b/i.test(norm);
  const isPoe = /\b(poe\+|poe\b|802\.3at|802\.3af|power\s*over\s*ethernet)\b/i.test(norm) && !isExplicitNonPoe;
  return { isPoe, isExplicitNonPoe };
}

/**
 * Detecta padrão de memória (DDR3, DDR4, DDR5)
 */
function extractRamGeneration(text: string): 'ddr3' | 'ddr4' | 'ddr5' | null {
  const norm = normalizeText(text);
  if (/\bddr5\b/i.test(norm)) return 'ddr5';
  if (/\bddr4\b/i.test(norm)) return 'ddr4';
  if (/\bddr3\b/i.test(norm)) return 'ddr3';
  return null;
}

/**
 * Detecta contagem de portas de rede (ex: 8p, 16p, 24p, 48p)
 */
function extractPortCount(text: string): number | null {
  const norm = normalizeText(text);
  const match = norm.match(/\b(4|8|16|24|48|52)\s*(portas|port|p\b)/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Audita a compatibilidade entre a requisição e a oferta encontrada
 */
export function auditProductOfferCompatibility(
  requestedText: string,
  offeredText: string,
  partNumberMatch?: boolean
): SpecAuditResult {
  const req = normalizeText(requestedText);
  const off = normalizeText(offeredText);

  let score = 50; // base inicial
  const conflictReasons: string[] = [];
  const matchedSpecs: string[] = [];

  // 1. Part Number Check
  if (partNumberMatch) {
    score += 40;
    matchedSpecs.push('Part Number Exato');
  }

  // 2. Tensão / Voltagem
  const reqVolt = extractVoltage(req);
  const offVolt = extractVoltage(off);
  if (reqVolt && offVolt) {
    if (reqVolt === offVolt || reqVolt === 'bivolt' || offVolt === 'bivolt') {
      score += 10;
      matchedSpecs.push(`Tensão Compatível (${offVolt.toUpperCase()})`);
    } else {
      score -= 35;
      conflictReasons.push(`Conflito de Voltagem: solicitado ${reqVolt.toUpperCase()}, oferta ${offVolt.toUpperCase()}`);
    }
  }

  // 3. Suporte a PoE
  const reqPoe = extractPoe(req);
  const offPoe = extractPoe(off);
  if (reqPoe.isPoe) {
    if (offPoe.isPoe) {
      score += 15;
      matchedSpecs.push('Suporte a PoE Confirmado');
    } else if (offPoe.isExplicitNonPoe || (!offPoe.isPoe && off.includes('switch'))) {
      score -= 35;
      conflictReasons.push('Conflito de PoE: cliente solicitou modelo PoE, oferta encontrada não possui PoE');
    }
  }

  // 4. Geração de Memória RAM
  const reqRam = extractRamGeneration(req);
  const offRam = extractRamGeneration(off);
  if (reqRam && offRam) {
    if (reqRam === offRam) {
      score += 15;
      matchedSpecs.push(`Padrão de Memória ${offRam.toUpperCase()}`);
    } else {
      score -= 40;
      conflictReasons.push(`Incompatibilidade de Memória: solicitado ${reqRam.toUpperCase()}, oferta é ${offRam.toUpperCase()}`);
    }
  }

  // 5. Quantidade de Portas
  const reqPorts = extractPortCount(req);
  const offPorts = extractPortCount(off);
  if (reqPorts && offPorts) {
    if (reqPorts === offPorts) {
      score += 10;
      matchedSpecs.push(`${offPorts} Portas de Rede`);
    } else {
      score -= 30;
      conflictReasons.push(`Divergência de Portas: solicitado ${reqPorts} portas, oferta possui ${offPorts} portas`);
    }
  }

  // Limitar score entre 10 e 100
  const finalScore = Math.min(Math.max(score, 10), 100);

  // Classificação
  if (conflictReasons.length > 0) {
    return {
      score: Math.min(finalScore, 45),
      status: 'conflict',
      badgeLabel: 'Conflito de Especificação',
      badgeColor: 'rose',
      conflictReasons,
      matchedSpecs
    };
  }

  if (finalScore >= 80 || partNumberMatch) {
    return {
      score: finalScore,
      status: 'exact',
      badgeLabel: 'Correspondência Exata',
      badgeColor: 'emerald',
      conflictReasons: [],
      matchedSpecs: matchedSpecs.length > 0 ? matchedSpecs : ['Especificações Compatíveis']
    };
  }

  return {
    score: finalScore,
    status: 'equivalent',
    badgeLabel: 'Produto Equivalente',
    badgeColor: 'amber',
    conflictReasons: [],
    matchedSpecs: matchedSpecs.length > 0 ? matchedSpecs : ['Similaridade Geral']
  };
}
