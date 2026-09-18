import { parseQuoteTimestamp, DatePeriodFilter } from '../components/DashboardView';
import { Quote } from '../types';

console.log('🧪 Iniciando testes do Contador de Orçamentos por Período no BI...');

// Helper de simulação do filtro
function filterQuotesByPeriod(
  quotes: Quote[], 
  period: DatePeriodFilter, 
  customStart?: string, 
  customEnd?: string
): Quote[] {
  if (period === 'all') return quotes;
  const now = new Date();

  if (period === 'today') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    return quotes.filter(q => {
      const t = parseQuoteTimestamp(q);
      return t >= startOfToday && t <= endOfToday;
    });
  }

  if (period === '7days') {
    const past7d = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    return quotes.filter(q => {
      const t = parseQuoteTimestamp(q);
      return t >= past7d;
    });
  }

  if (period === 'thisMonth') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
    return quotes.filter(q => {
      const t = parseQuoteTimestamp(q);
      return t >= startOfMonth;
    });
  }

  if (period === '30days') {
    const past30d = now.getTime() - (30 * 24 * 60 * 60 * 1000);
    return quotes.filter(q => {
      const t = parseQuoteTimestamp(q);
      return t >= past30d;
    });
  }

  if (period === '90days') {
    const past90d = now.getTime() - (90 * 24 * 60 * 60 * 1000);
    return quotes.filter(q => {
      const t = parseQuoteTimestamp(q);
      return t >= past90d;
    });
  }

  if (period === 'custom') {
    const startMs = customStart ? new Date(`${customStart}T00:00:00`).getTime() : 0;
    const endMs = customEnd ? new Date(`${customEnd}T23:59:59`).getTime() : Number.MAX_SAFE_INTEGER;
    return quotes.filter(q => {
      const t = parseQuoteTimestamp(q);
      return t >= startMs && t <= endMs;
    });
  }

  return quotes;
}

// 1. Teste de parseQuoteTimestamp com diferentes formatos
const qTodayIso: Quote = {
  id: 'q-1',
  code: 'COT-001',
  date: 'Recente',
  createdAt: new Date().toISOString(),
  clientCompany: 'Empresa A',
  status: 'approved',
  items: [],
  subtotal: 1000,
  taxAmount: 0,
  shippingAmount: 0,
  totalAmount: 1000,
  validityDays: 10,
  paymentTerms: 'À vista',
  deliveryTime: 'Imediato'
};

const qTodayPt: Quote = {
  ...qTodayIso,
  id: 'q-2',
  code: 'COT-002',
  createdAt: undefined,
  date: `${new Date().getDate()} de setembro de ${new Date().getFullYear()}`
};

const qOld: Quote = {
  ...qTodayIso,
  id: 'q-3',
  code: 'COT-003',
  createdAt: undefined,
  date: '10/01/2025' // Data passada
};

const qOntem: Quote = {
  ...qTodayIso,
  id: 'q-4',
  code: 'COT-004',
  createdAt: undefined,
  date: 'Ontem às 15:30'
};

const mockQuotes = [qTodayIso, qTodayPt, qOld, qOntem];

// Teste 1: Hoje deve pegar qTodayIso e qTodayPt
const todayFiltered = filterQuotesByPeriod(mockQuotes, 'today');
if (todayFiltered.length === 2 && todayFiltered.some(q => q.id === 'q-1') && todayFiltered.some(q => q.id === 'q-2')) {
  console.log('✓ Teste 1 aprovado: Período "Hoje" filtra com precisão as cotações de hoje');
} else {
  throw new Error(`Falha no Teste 1: esperado 2 cotações, recebido ${todayFiltered.length}`);
}

// Teste 2: 7 dias deve incluir hoje e ontem, excluindo janeiro de 2025
const weekFiltered = filterQuotesByPeriod(mockQuotes, '7days');
if (weekFiltered.length === 3 && !weekFiltered.some(q => q.id === 'q-3')) {
  console.log('✓ Teste 2 aprovado: Período "7 dias" contabiliza cotações recentes (hoje e ontem)');
} else {
  throw new Error(`Falha no Teste 2: esperado 3 cotações, recebido ${weekFiltered.length}`);
}

// Teste 3: Todo o histórico deve retornar todas as 4 cotações
const allFiltered = filterQuotesByPeriod(mockQuotes, 'all');
if (allFiltered.length === 4) {
  console.log('✓ Teste 3 aprovado: Período "Todo o Histórico" contabiliza a totalidade das cotações');
} else {
  throw new Error(`Falha no Teste 3: esperado 4 cotações, recebido ${allFiltered.length}`);
}

// Teste 4: Customizado por intervalo de datas
const customFiltered = filterQuotesByPeriod(mockQuotes, 'custom', '2025-01-01', '2025-01-31');
if (customFiltered.length === 1 && customFiltered[0].id === 'q-3') {
  console.log('✓ Teste 4 aprovado: Período customizado por datas selecionadas funciona perfeitamente');
} else {
  throw new Error(`Falha no Teste 4: esperado 1 cotação em janeiro/2025, recebido ${customFiltered.length}`);
}

console.log('🎉 TODOS OS TESTES DO CONTADOR BI POR PERÍODO PASSARAM COM SUCESSO!\n');
