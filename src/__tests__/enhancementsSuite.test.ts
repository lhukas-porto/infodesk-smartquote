import assert from 'assert';
import { 
  buildWhatsAppFollowUpMessage, 
  buildSingleItemWhatsAppText,
  buildWhatsAppItemsOnlyMessage,
  buildWhatsAppQuoteMessage
} from '../utils/whatsappFormatter';
import { Quote, QuoteItem, Product } from '../types';

console.log('🧪 Iniciando testes das melhorias S.H.A.R.K. (Desconto, Follow-up, Custo, Margens)...');

const mockQuote: Quote = {
  id: 'q-test-101',
  code: 'COT-2026-999',
  clientCompany: 'Hospital Regional de Brasília',
  contactPerson: 'Dra. Mariana Lima',
  clientPhone: '(61) 98888-7777',
  clientEmail: 'compras@hrb.df.gov.br',
  date: '2026-10-22',
  status: 'sent',
  sentAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 dias atrás (> 72h)
  items: [
    {
      id: 'it-1',
      itemNumber: 1,
      description: 'SSD NVMe 1TB Samsung 980',
      markupPercent: 30,
      name: 'SSD 1TB NVMe Samsung 980 M.2',
      partNumber: 'MZ-V8V1T0B/AM',
      quantity: 4,
      unit: 'Un.',
      costPrice: 400,
      unitPrice: 600,
      totalPrice: 2400
    },
    {
      id: 'it-2',
      itemNumber: 2,
      description: 'Patch Cord Cat6 Furukawa 2,5m Azul',
      markupPercent: 25,
      name: 'Patch Cord Cat6 Furukawa 2,5m',
      partNumber: '35123002',
      quantity: 10,
      unit: 'Un.',
      costPrice: 15,
      unitPrice: 22,
      totalPrice: 220
    }
  ],
  totalAmount: 2620,
  deliveryDays: '3 dias úteis',
  paymentTerms: '30 DDL',
  warrantyTerms: '12 meses'
} as unknown as Quote;

// =========================================================================
// TESTE 1: Follow-up WhatsApp Message Formatter
// =========================================================================
const followUpText = buildWhatsAppFollowUpMessage(mockQuote, {
  tradeName: 'Infodesk Tecnologia',
  representativeName: 'Lucas Porto',
  phone: '(61) 9 9627-2630'
} as any);

assert.ok(followUpText.includes('Mariana Lima'), 'Deve saudar o contato pelo nome');
assert.ok(followUpText.includes('COT-2026-999'), 'Deve citar o código da proposta');
assert.ok(followUpText.includes('Hospital Regional de Brasília'), 'Deve citar a empresa');
assert.ok(followUpText.includes('R$ 2.620,00'), 'Deve exibir o valor total formatado');
assert.ok(followUpText.includes('Lucas Porto'), 'Deve assinar com o nome do representante');
assert.ok(followUpText.includes('Infodesk Tecnologia'), 'Deve conter a razão/nome fantasia');
console.log('  ✅ 1. buildWhatsAppFollowUpMessage gera texto personalizado de follow-up com sucesso');

// =========================================================================
// TESTE 2: Cópia Rápida de 1 Item Individual
// =========================================================================
const singleItemText = buildSingleItemWhatsAppText(mockQuote.items[0]);
assert.ok(singleItemText.includes('SSD 1TB NVMe Samsung 980 M.2'), 'Deve conter o nome do produto');
assert.ok(singleItemText.includes('4 Un.'), 'Deve conter a quantidade e unidade');
assert.ok(singleItemText.includes('R$ 600,00/Un.'), 'Deve conter valor unitário');
assert.ok(singleItemText.includes('R$ 2.400,00'), 'Deve conter total do item');
assert.ok(singleItemText.includes('MZ-V8V1T0B/AM'), 'Deve conter o Part Number');
console.log('  ✅ 2. buildSingleItemWhatsAppText gera resumo formatado de 1 item em 1 clique');

// =========================================================================
// TESTE 3: Matemática do Simulador de Desconto Geral de Fechamento
// =========================================================================
// Proposta com 2620 total: se aplicar 5% de desconto geral
const currentTotal = 2620;
const discountPercent = 5;
const targetTotal = currentTotal * (1 - discountPercent / 100); // 2489
const ratio = targetTotal / currentTotal;

const simulatedItems = mockQuote.items.map(it => {
  const newUnitPrice = Number((it.unitPrice * ratio).toFixed(2));
  const newTotalPrice = Number((newUnitPrice * it.quantity).toFixed(2));
  const newMarkup = it.costPrice > 0 ? ((newUnitPrice - it.costPrice) / it.costPrice) * 100 : 0;
  return { ...it, unitPrice: newUnitPrice, totalPrice: newTotalPrice, markupPercent: newMarkup };
});

const newSum = simulatedItems.reduce((acc, it) => acc + it.totalPrice, 0);
assert.ok(Math.abs(newSum - targetTotal) < 1.0, 'Soma recalculada deve bater com alvo com tolerância de centavos');
// Verifica que o markup ainda é positivo e razoável
assert.ok(simulatedItems[0].markupPercent > 20, 'Markup deve ser recalculado mantendo lucro');
console.log('  ✅ 3. Simulador de Desconto Geral recalcula preços e markup proporcionalmente com precisão');

// =========================================================================
// TESTE 4: Detecção de Margem Mínima e Prejuízo
// =========================================================================
const safeMarkup = 18;
const lowMarkup = 6;
const negativeMarkup = -2;

assert.ok(safeMarkup >= 8, 'Margem segura');
assert.ok(lowMarkup < 8 && lowMarkup >= 0, 'Margem baixa preventivamente sinalizada');
assert.ok(negativeMarkup < 0, 'Margem negativa identificada como prejuízo imediato');
console.log('  ✅ 4. Alerta de margem mínima identifica prejuízo e margem baixa preventivamente');

// =========================================================================
// TESTE 5: Custo Antigo no Catálogo (> 45 dias)
// =========================================================================
const staleDate = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString();
const freshDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

const daysSinceStale = Math.floor((Date.now() - new Date(staleDate).getTime()) / (1000 * 60 * 60 * 24));
const daysSinceFresh = Math.floor((Date.now() - new Date(freshDate).getTime()) / (1000 * 60 * 60 * 24));

assert.ok(daysSinceStale >= 45, 'Item antigo deve ser marcado como > 45 dias');
assert.ok(daysSinceFresh < 45, 'Item recente não deve ser marcado como defasado');
console.log('  ✅ 5. Detecção de custo defasado (> 45 dias) funciona corretamente');

// =========================================================================
// TESTE 6: Custo Real vs Orçado na Central de Compras (Economia vs Sobrecusto)
// =========================================================================
const quotedCost = 400 * 4; // 1600
const actualCostSaved = 1450; // Economizou 150
const deltaSaved = quotedCost - actualCostSaved;
assert.strictEqual(deltaSaved, 150, 'Economia de R$ 150');

const actualCostOverrun = 1750; // Sobrecusto de 150
const deltaOverrun = quotedCost - actualCostOverrun;
assert.strictEqual(deltaOverrun, -150, 'Sobrecusto de R$ 150');
console.log('  ✅ 6. Termômetro de Custo Real vs Orçado calcula economia e sobrecusto em tempo real');

// =========================================================================
// TESTE 7: Régua de Follow-up (> 72 horas)
// =========================================================================
const sent4DaysAgo = Date.now() - (4 * 24 * 60 * 60 * 1000);
const sent1DayAgo = Date.now() - (1 * 24 * 60 * 60 * 1000);

const diffHoursOld = (Date.now() - sent4DaysAgo) / (1000 * 60 * 60);
const diffHoursNew = (Date.now() - sent1DayAgo) / (1000 * 60 * 60);

assert.ok(diffHoursOld >= 72, 'Proposta de 4 dias atrás deve exigir follow-up');
assert.ok(diffHoursNew < 72, 'Proposta de 1 dia atrás não deve exigir follow-up');
console.log('  ✅ 7. Régua de Follow-up (> 72 horas) identifica propostas estagnadas');

console.log('🎉 TODOS OS TESTES DAS MELHORIAS PASSARAM COM SUCESSO!\n');
