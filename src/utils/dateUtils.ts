import { Quote } from '../types';

const PT_MONTHS = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

/**
 * Função utilitária para extrair timestamp seguro de uma proposta comercial,
 * suportando datas em formato ISO, DD/MM/YYYY e extensas em português ('17 de setembro de 2026')
 */
export function parseQuoteTimestamp(q: Quote): number {
  if (q.sentAt) {
    const t = new Date(q.sentAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  const str = q.date?.trim();
  if (str) {
    const lower = str.toLowerCase();

    if (lower.includes('hoje')) {
      const timeMatch = lower.match(/(\d{1,2}):(\d{2})/);
      const d = new Date();
      if (timeMatch) {
        d.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
      }
      return d.getTime();
    }

    if (lower.includes('ontem')) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const timeMatch = lower.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        d.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
      }
      return d.getTime();
    }

    const matchPt = lower.match(/(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i);
    if (matchPt) {
      const day = parseInt(matchPt[1], 10);
      const cleanMonth = matchPt[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const mIdx = PT_MONTHS.indexOf(cleanMonth);
      const year = parseInt(matchPt[3], 10);
      if (mIdx !== -1) {
        return new Date(year, mIdx, day, 12, 0, 0).getTime();
      }
    }

    if (str.includes('/')) {
      const parts = str.split(' ')[0].split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day, 12, 0, 0).getTime();
      }
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  if (q.createdAt) {
    const t = new Date(q.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  return Date.now();
}

/**
 * Compara se dois timestamps pertencem ao mesmo dia civil no horário local.
 */
export function isSameDay(t1: number, t2: number): boolean {
  const d1 = new Date(t1);
  const d2 = new Date(t2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Garante que qualquer orçamento em status 'draft' (rascunho) que esteja com
 * data anterior à data corrente seja automaticamente atualizado para a data de hoje.
 */
export function updateDraftQuotesToToday(quotes: Quote[]): { updatedQuotes: Quote[]; hasChanges: boolean } {
  const now = new Date();
  const todayStr = now.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  let hasChanges = false;
  const updatedQuotes = quotes.map(q => {
    if (!q.status || q.status === 'draft') {
      const qTime = parseQuoteTimestamp(q);
      if (qTime < todayStart && !isSameDay(qTime, todayStart)) {
        hasChanges = true;
        return {
          ...q,
          date: todayStr
        };
      }
    }
    return q;
  });

  return { updatedQuotes, hasChanges };
}
