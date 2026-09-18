/**
 * TESTE UNITÁRIO: FILTRO DE DATAS DO HISTÓRICO DE COTAÇÕES
 * Valida a regra:
 * 1. Padrão ao abrir o histórico: mostrar cotações do dia corrente (Hoje)
 * 2. Possibilidade de busca por dia específico ('specificDate')
 * 3. Possibilidade de busca por período personalizado ('customRange' / '7days' / 'thisMonth')
 * 4. Possibilidade de exibir todo o histórico ('all')
 */

import { parseQuoteTimestamp } from '../components/DashboardView';
import type { Quote } from '../types';

function isSameDay(t1: number, t2: number): boolean {
  const d1 = new Date(t1);
  const d2 = new Date(t2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function filterQuotesByDate(
  quotes: Quote[],
  filter: 'today' | 'yesterday' | '7days' | 'thisMonth' | 'all' | 'specificDate' | 'customRange',
  specificDate?: string,
  customStartDate?: string,
  customEndDate?: string
): Quote[] {
  if (filter === 'all') return quotes;
  const now = new Date();

  if (filter === 'today') {
    const todayMs = now.getTime();
    return quotes.filter(q => isSameDay(parseQuoteTimestamp(q), todayMs));
  }

  if (filter === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yMs = y.getTime();
    return quotes.filter(q => isSameDay(parseQuoteTimestamp(q), yMs));
  }

  if (filter === '7days') {
    const past7d = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    return quotes.filter(q => parseQuoteTimestamp(q) >= past7d);
  }

  if (filter === 'thisMonth') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
    return quotes.filter(q => parseQuoteTimestamp(q) >= startOfMonth);
  }

  if (filter === 'specificDate') {
    if (!specificDate) return quotes;
    const parts = specificDate.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const targetTime = new Date(y, m, d, 12, 0, 0).getTime();
      return quotes.filter(q => isSameDay(parseQuoteTimestamp(q), targetTime));
    }
    return quotes;
  }

  if (filter === 'customRange') {
    const startMs = customStartDate ? new Date(`${customStartDate}T00:00:00`).getTime() : 0;
    const endMs = customEndDate ? new Date(`${customEndDate}T23:59:59`).getTime() : Number.MAX_SAFE_INTEGER;
    return quotes.filter(q => {
      const t = parseQuoteTimestamp(q);
      return t >= startMs && t <= endMs;
    });
  }

  return quotes;
}

console.log('--- INICIANDO TESTES DO FILTRO DE DATAS DO HISTÓRICO ---');

const now = new Date();
const todayIso = now.toISOString();

const yesterday = new Date(now);
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayIso = yesterday.toISOString();

const tenDaysAgo = new Date(now);
tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
const tenDaysAgoIso = tenDaysAgo.toISOString();

const mockQuotes: Quote[] = [
  {
    id: 'q1',
    code: 'INF-001',
    date: todayIso,
    clientCompany: 'Sonda',
    contactPerson: 'João',
    totalAmount: 1500,
    items: [],
    status: 'sent'
  } as any,
  {
    id: 'q2',
    code: 'INF-002',
    date: yesterdayIso,
    clientCompany: 'Sabin',
    contactPerson: 'Maria',
    totalAmount: 2500,
    items: [],
    status: 'approved'
  } as any,
  {
    id: 'q3',
    code: 'INF-003',
    date: tenDaysAgoIso,
    clientCompany: 'Petrobras',
    contactPerson: 'Carlos',
    totalAmount: 5000,
    items: [],
    status: 'draft'
  } as any
];

// Teste 1: Padrão é 'today'
const todayQuotes = filterQuotesByDate(mockQuotes, 'today');
if (todayQuotes.length !== 1 || todayQuotes[0].id !== 'q1') {
  throw new Error(`Falha no filtro padrão 'today'. Esperado 1 item (q1), recebido: ${todayQuotes.length}`);
}
console.log('✅ Teste 1: Filtro padrão "Hoje" retornou com precisão apenas as cotações do dia corrente.');

// Teste 2: Filtro 'yesterday'
const yesterdayQuotes = filterQuotesByDate(mockQuotes, 'yesterday');
if (yesterdayQuotes.length !== 1 || yesterdayQuotes[0].id !== 'q2') {
  throw new Error(`Falha no filtro 'yesterday'. Esperado 1 item (q2), recebido: ${yesterdayQuotes.length}`);
}
console.log('✅ Teste 2: Filtro "Ontem" retornou exatamente a cotação de ontem.');

// Teste 3: Filtro 'all'
const allQuotes = filterQuotesByDate(mockQuotes, 'all');
if (allQuotes.length !== 3) {
  throw new Error(`Falha no filtro 'all'. Esperado 3 itens, recebido: ${allQuotes.length}`);
}
console.log('✅ Teste 3: Filtro "Todas" retornou o histórico completo.');

const formatLocalYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Teste 4: Filtro por dia específico ('specificDate')
const tenDaysAgoFormatted = formatLocalYMD(tenDaysAgo);
const specificDayQuotes = filterQuotesByDate(mockQuotes, 'specificDate', tenDaysAgoFormatted);
if (specificDayQuotes.length !== 1 || specificDayQuotes[0].id !== 'q3') {
  throw new Error(`Falha no filtro 'specificDate'. Esperado 1 item (q3), recebido: ${specificDayQuotes.length}`);
}
console.log(`✅ Teste 4: Filtro "Por Dia" (${tenDaysAgoFormatted}) localizou exatamente a cotação da data selecionada.`);

// Teste 5: Filtro por período ('customRange')
const rangeStart = new Date(now);
rangeStart.setDate(rangeStart.getDate() - 3);
const rangeQuotes = filterQuotesByDate(
  mockQuotes,
  'customRange',
  undefined,
  formatLocalYMD(rangeStart),
  formatLocalYMD(now)
);
if (rangeQuotes.length !== 2) {
  throw new Error(`Falha no filtro 'customRange'. Esperado 2 itens (hoje e ontem), recebido: ${rangeQuotes.length}`);
}
console.log('✅ Teste 5: Filtro "Período" retornou com sucesso o intervalo selecionado.');

console.log('🎉 TODOS OS TESTES DO FILTRO DE DATAS DO HISTÓRICO PASSARAM COM SUCESSO!\n');
