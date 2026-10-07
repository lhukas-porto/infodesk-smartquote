import { 
  extractCleanProductNameFromSubject, 
  reconstituteQuoteItemFromFinancials, 
  isLegitimateQuoteItem, 
  areLegitimateQuoteItems,
  healAndRecoverQuote,
  healAllQuotesBatch 
} from '../services/quoteHealingService';
import { Quote, QuoteItem, IncomingEmail } from '../types';

console.log('\n🧪 Iniciando testes de Cura, Recuperação e Blindagem de Itens de Propostas Comerciais...');

// Teste 1: Limpeza e extração inteligente do nome do produto a partir do Assunto
const s1 = "PEDIDO DE ORÇAMENTO SOL.128367- Porta Banner";
const p1 = extractCleanProductNameFromSubject(s1);
if (p1 !== "Porta Banner") {
  throw new Error(`Falha no Teste 1: esperado 'Porta Banner', obtido '${p1}'`);
}
console.log('✓ Teste 1 aprovado: extractCleanProductNameFromSubject extraiu com perfeição "Porta Banner" de "PEDIDO DE ORÇAMENTO SOL.128367- Porta Banner"');

const s2 = "Solicitação de Cotação - Nobreak Ragtech Easy Pro 1200VA";
const p2 = extractCleanProductNameFromSubject(s2);
if (!p2.includes("Nobreak Ragtech")) {
  throw new Error(`Falha no Teste 1.2: obtido '${p2}'`);
}
console.log('✓ Teste 1.2 aprovado: extractCleanProductNameFromSubject limpou prefixos de solicitação com sucesso.');

// Teste 2: Validação de itens legítimos (Nunca descartar dados com valor comercial)
const validItem: QuoteItem = {
  id: 'it-1',
  itemNumber: 1,
  name: 'Porta Banner Retrátil',
  description: '',
  quantity: 1,
  unit: 'Un.',
  costPrice: 240.00,
  markupPercent: 23.5,
  unitPrice: 326.00,
  totalPrice: 326.00
};

if (!isLegitimateQuoteItem(validItem)) {
  throw new Error('Falha no Teste 2: item legítimo com custo e preço foi rejeitado!');
}
console.log('✓ Teste 2 aprovado: isLegitimateQuoteItem reconhece com precisão itens comerciais com valor.');

// Teste 3: Reconstituição matemática e comercial baseada na proposta UBEC 290926-5 da foto
const mockUbecQuote: Quote = {
  id: 'quote-ubec-128367',
  code: 'UBEC 290926-5',
  clientCompany: 'À UBEC',
  contactPerson: 'A/C Srta. Tatiana Melo',
  clientEmail: 'tatiana.melo@ubec.edu.br',
  clientPhone: '(61) 3383-9385',
  subject: 'PEDIDO DE ORÇAMENTO SOL.128367- Porta Banner',
  city: 'Brasília',
  date: '29 de setembro de 2026',
  validityDays: '05 (cinco) dias',
  paymentTerms: 'Faturado.',
  deliveryDays: 'em até 10 dias úteis',
  warrantyTerms: '06 meses',
  openingText: 'Em atenção à solicitação...',
  items: [],
  totalCost: 240.00,
  totalShipping: 0.00,
  totalTaxes: 29.41,
  totalProfit: 56.59,
  totalAmount: 326.00,
  averageMargin: 23.5,
  globalMarkupPercent: 23.5,
  globalTaxPercent: 9.02,
  globalShipping: 0,
  status: 'sent',
  createdAt: '2026-09-29T10:00:00.000Z'
};

const reconstitutedItem = reconstituteQuoteItemFromFinancials(mockUbecQuote);
if (reconstitutedItem.name !== 'Porta Banner') {
  throw new Error(`Falha no Teste 3: Nome do item reconstituído incorreto: ${reconstitutedItem.name}`);
}
if (reconstitutedItem.costPrice !== 240.00) {
  throw new Error(`Falha no Teste 3: Custo incorreto: ${reconstitutedItem.costPrice}`);
}
if (reconstitutedItem.totalPrice !== 326.00) {
  throw new Error(`Falha no Teste 3: Preço total incorreto: ${reconstitutedItem.totalPrice}`);
}
console.log('✓ Teste 3 aprovado: reconstituteQuoteItemFromFinancials reconstruiu os dados fiscais e comerciais exatos da cotação UBEC 290926-5!');

// Teste 4: healAndRecoverQuote em proposta com 0 itens
async function runAsyncTests() {
  const result = await healAndRecoverQuote(mockUbecQuote);
  if (!result.healed) {
    throw new Error('Falha no Teste 4: healAndRecoverQuote deveria ter curado a proposta!');
  }
  if (!result.quote.items || result.quote.items.length === 0) {
    throw new Error('Falha no Teste 4: A proposta curada permaneceu sem itens!');
  }
  if (result.quote.items[0].name !== 'Porta Banner') {
    throw new Error(`Falha no Teste 4: Nome recuperado inválido: ${result.quote.items[0].name}`);
  }
  console.log('✓ Teste 4 aprovado: healAndRecoverQuote curou a proposta UBEC 290926-5 e injetou o item comercial com sucesso!');

  // Teste 5: healAllQuotesBatch curando múltiplas propostas
  const mockQuoteList: Quote[] = [
    { ...mockUbecQuote, id: 'q1', code: 'UBEC 290926-5', items: [] },
    { 
      ...mockUbecQuote, 
      id: 'q2', 
      code: 'CNC 280926-1', 
      subject: 'Cotação de Nobreak 1200VA',
      totalCost: 500, 
      totalAmount: 700, 
      items: [] 
    },
    { 
      ...mockUbecQuote, 
      id: 'q3', 
      code: 'SABIN 270926', 
      items: [validItem] // já possui itens
    }
  ];

  const batchResult = await healAllQuotesBatch(mockQuoteList);
  if (batchResult.healedCount !== 2) {
    throw new Error(`Falha no Teste 5: Esperado 2 propostas curadas, obtido ${batchResult.healedCount}`);
  }

  const q1Healed = batchResult.quotes.find(q => q.code === 'UBEC 290926-5');
  const q2Healed = batchResult.quotes.find(q => q.code === 'CNC 280926-1');
  const q3Untouched = batchResult.quotes.find(q => q.code === 'SABIN 270926');

  if (!q1Healed?.items?.length || q1Healed.items[0].name !== 'Porta Banner') {
    throw new Error('Falha no Teste 5: q1 não foi curado corretamente');
  }
  if (!q2Healed?.items?.length || !q2Healed.items[0].name.includes('Nobreak')) {
    throw new Error('Falha no Teste 5: q2 não foi curado corretamente');
  }
  if (q3Untouched?.items?.length !== 1 || q3Untouched.items[0].id !== 'it-1') {
    throw new Error('Falha no Teste 5: q3 que já possuía itens válidos foi modificado incorretamente');
  }

  console.log('✓ Teste 5 aprovado: healAllQuotesBatch curou em lote exatamente as propostas que precisavam, sem alterar as cotações intactas!');
  console.log('🎉 TODOS OS TESTES DE CURA E RECUPERAÇÃO DE PROPOSTAS PASSARAM COM 100% DE SUCESSO!\n');
}

runAsyncTests().catch(err => {
  console.error('[ERRO NO TESTE DE CURA]:', err);
  process.exit(1);
});
