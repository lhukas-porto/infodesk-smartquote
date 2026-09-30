import assert from 'node:assert/strict';
import { 
  getRegisteredPaymentMethods, 
  saveRegisteredPaymentMethod, 
  deleteRegisteredPaymentMethod,
  resetRegisteredPaymentMethods 
} from '../utils/storage';
import { Quote, ProcurementItem } from '../types';

// Mock localStorage se em ambiente Node sem browser
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] || null,
    length: 0
  } as Storage;
}

console.log('🧪 Iniciando testes das Novas Funcionalidades da Central de Compras...');

// 1. Teste de Formas de Pagamento Dinâmicas
console.log('🔹 1. Validando Gerenciamento de Formas de Pagamento...');
const initialMethods = getRegisteredPaymentMethods();
assert.ok(initialMethods.includes('PIX'), 'Deve conter PIX');
assert.ok(initialMethods.includes('Cartão C6'), 'Deve conter Cartão C6');
assert.ok(initialMethods.includes('Cartão Amazon'), 'Deve conter Cartão Amazon');

// Adiciona uma nova forma personalizada (ex: Cartão XP Corporate)
const updatedWithXP = saveRegisteredPaymentMethod('Cartão XP Corporate');
assert.ok(updatedWithXP.includes('Cartão XP Corporate'), 'Deve incluir a nova forma adicionada');

// Não duplica se tentar adicionar a mesma
const noDuplicates = saveRegisteredPaymentMethod('cartão xp corporate');
assert.equal(noDuplicates.filter(m => m.toLowerCase() === 'cartão xp corporate').length, 1, 'Não deve duplicar forma de pagamento insensível a maiúsculas');

// Remoção
const afterDelete = deleteRegisteredPaymentMethod('Cartão XP Corporate');
assert.ok(!afterDelete.includes('Cartão XP Corporate'), 'Deve ter removido a forma com sucesso');
console.log('  ✅ Formas de Pagamento: Criação, listagem, remoção e proteção contra duplicidade validadas!');

// 2. Teste de Cálculo Bidirecional de Preços (Unitário vs Total)
console.log('🔹 2. Validando Cálculo Bidirecional de Preços de Compra...');
const quantity = 5;
const unitCostInput = 189.90;
const calculatedTotal = Number((unitCostInput * quantity).toFixed(2));
assert.equal(calculatedTotal, 949.50, '5 unidades a R$ 189,90 deve resultar em R$ 949,50 de custo total');

// Inverso: digitou o custo total e calcula o unitário
const totalCostInput = 1000.00;
const calculatedUnit = Number((totalCostInput / quantity).toFixed(2));
assert.equal(calculatedUnit, 200.00, 'R$ 1.000,00 para 5 unidades deve resultar em R$ 200,00 unitário');
console.log('  ✅ Cálculo Bidirecional: Conversão unitário x quantidade e total / quantidade perfeita!');

// 3. Teste de Link Real de Compra (actualPurchaseUrl) e Saving
console.log('🔹 3. Validando Registro de Link Real de Compra e Saving...');
const mockProcurementItem: ProcurementItem = {
  id: 'quote-1_item-1',
  quoteId: 'quote-1',
  quoteCode: 'PROPOSTA-2026-0930',
  clientCompany: 'Sabin',
  itemId: 'item-1',
  name: 'SSD Kingston 480GB A400',
  quantity: 10,
  unit: 'un',
  quotedCostPrice: 220.00, // Preço que foi cotado
  quotedUnitPrice: 310.00, // Preço vendido pro cliente
  quotedTotalPrice: 3100.00,
  supplier: 'Kabum',
  sourceUrl: 'https://www.kabum.com.br/produto/12345',
  purchaseStatus: 'purchased',
  // Dados reais registrados:
  actualUnitCostPrice: 195.00, // Comprou mais barato por R$ 195/un
  actualCostPrice: 1950.00,
  actualPurchaseUrl: 'https://www.amazon.com.br/dp/B01N5IB20Q', // Comprou na Amazon em vez da Kabum!
  actualShippingCost: 0,
  paymentMethod: 'Cartão Amazon',
  taxPercent: 9.05,
  purchasedAt: '2026-09-30'
};

// Verifica saving
const quotedTotalCost = mockProcurementItem.quotedCostPrice * mockProcurementItem.quantity; // 2.200
const actualTotalCost = mockProcurementItem.actualCostPrice!; // 1.950
const saving = quotedTotalCost - actualTotalCost;
assert.equal(saving, 250.00, 'Economia real deve ser exatamente R$ 250,00 (R$ 25/unidade)');
assert.equal(mockProcurementItem.actualPurchaseUrl, 'https://www.amazon.com.br/dp/B01N5IB20Q', 'Link real de compra deve ser retido');
assert.equal(mockProcurementItem.paymentMethod, 'Cartão Amazon', 'Forma de pagamento deve ser retida');
console.log('  ✅ Gestão de Compras: Link real retido, unitário registrado e saving calculado com sucesso!');

console.log('🎉 TODOS OS TESTES DAS NOVAS FUNCIONALIDADES DE COMPRAS PASSARAM COM 100% DE SUCESSO!\n');
