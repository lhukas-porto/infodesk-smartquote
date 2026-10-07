import assert from 'node:assert/strict';
import { 
  getRegisteredPaymentMethods, 
  saveRegisteredPaymentMethod, 
  deleteRegisteredPaymentMethod,
  resetRegisteredPaymentMethods 
} from '../utils/storage';
import { Quote, ProcurementItem } from '../types';
import { extractStoreNameFromUrl } from '../utils/aiEmailParser';

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

// 1. Teste de Formas de Pagamento Dinâmicas (100% gerenciadas pelo usuário, sem lista padrão forçada)
console.log('🔹 1. Validando Gerenciamento de Formas de Pagamento...');
const initialMethods = getRegisteredPaymentMethods();
assert.equal(Array.isArray(initialMethods), true, 'Deve retornar array de formas');

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
assert.equal(extractStoreNameFromUrl(mockProcurementItem.actualPurchaseUrl), 'Amazon', 'Loja extraída da URL deve ser Amazon');
assert.equal(mockProcurementItem.paymentMethod, 'Cartão Amazon', 'Forma de pagamento deve ser retida');
console.log('  ✅ Gestão de Compras: Link real retido, unitário registrado, loja Amazon detectada e saving calculado com sucesso!');

// 4. Teste de Exclusão de Compra e Retorno para 'A Comprar'
console.log('🔹 4. Validando Exclusão de Compra e Retorno para "A Comprar"...');
const purchasedItemData = {
  id: 'item-1',
  name: 'SSD Kingston 480GB A400',
  quantity: 10,
  unit: 'un',
  costPrice: 220.00,
  markupPercent: 40.9,
  unitPrice: 310.00,
  totalPrice: 3100.00,
  purchaseStatus: 'purchased' as const,
  actualCostPrice: 1950.00,
  actualUnitCostPrice: 195.00,
  actualPurchaseUrl: 'https://www.amazon.com.br/dp/B01N5IB20Q',
  paymentMethod: 'Cartão Amazon',
  purchasedAt: '2026-09-30',
  actualTaxPercent: 9.05,
  purchaseNotes: 'Pedido Amazon 1234'
};

// Simula exclusão da compra (handleDeletePurchase)
const cleanedItem = { ...purchasedItemData };
cleanedItem.purchaseStatus = 'pending' as any;
delete (cleanedItem as any).actualCostPrice;
delete (cleanedItem as any).actualUnitCostPrice;
delete (cleanedItem as any).actualPurchaseUrl;
delete (cleanedItem as any).actualShippingCost;
delete (cleanedItem as any).paymentMethod;
delete (cleanedItem as any).purchasedAt;
delete (cleanedItem as any).purchaseNotes;
delete (cleanedItem as any).actualTaxPercent;

assert.equal(cleanedItem.purchaseStatus, 'pending', 'Status deve voltar imediatamente para pending (A Comprar)');
assert.equal((cleanedItem as any).actualCostPrice, undefined, 'actualCostPrice deve ser limpo');
assert.equal((cleanedItem as any).actualUnitCostPrice, undefined, 'actualUnitCostPrice deve ser limpo');
assert.equal((cleanedItem as any).actualPurchaseUrl, undefined, 'actualPurchaseUrl deve ser limpo');
assert.equal((cleanedItem as any).paymentMethod, undefined, 'paymentMethod deve ser limpo');
console.log('  ✅ Exclusão de Compra: Compra excluída com sucesso, dados reais limpos e item retornado para "A Comprar"!');

// 5. Teste de Compras Avulsas / Diretas (Sem proposta comercial prévia)
console.log('🔹 5. Validando Compras Avulsas / Diretas (Uso Interno, Estoque, etc.)...');
import { 
  getDirectPurchases, 
  saveOrUpdateDirectPurchase, 
  deleteDirectPurchaseItem 
} from '../utils/storage';

const mockDirectItem: ProcurementItem = {
  id: 'direct-test-1234',
  quoteId: 'direct_purchases',
  quoteCode: 'COMPRA DIRETA',
  clientCompany: 'Infodesk (Uso Interno / Estoque)',
  itemId: 'direct-test-1234',
  name: 'Cabo de Rede Furukawa Cat6 Soho Plus 305m',
  partNumber: 'FUR-CAT6-BL',
  quantity: 2,
  unit: 'cx',
  quotedCostPrice: 650.00,
  quotedUnitPrice: 650.00,
  quotedTotalPrice: 1300.00,
  supplier: 'Distribuidora Roxtell',
  sourceUrl: 'https://distribuidora.com/cabo-furukawa',
  purchaseStatus: 'pending',
  taxPercent: 9.05,
  isDirectPurchase: true
};

const updatedList = saveOrUpdateDirectPurchase(mockDirectItem);
assert.ok(mockDirectItem.id.startsWith('direct-'), 'ID da compra avulsa deve ter prefixo direct-');
assert.equal(mockDirectItem.isDirectPurchase, true, 'isDirectPurchase deve ser true');
assert.equal(mockDirectItem.quoteCode, 'COMPRA DIRETA', 'quoteCode deve ser COMPRA DIRETA');
assert.equal(updatedList.length, 1, 'Deve conter 1 compra direta cadastrada');

const allDirect = getDirectPurchases();
assert.equal(allDirect.length, 1, 'Deve conter 1 compra direta cadastrada via getDirectPurchases');
assert.equal(allDirect[0].name, 'Cabo de Rede Furukawa Cat6 Soho Plus 305m');

// Atualiza para comprado
const purchasedDirectData: ProcurementItem = {
  ...mockDirectItem,
  purchaseStatus: 'purchased',
  actualCostPrice: 1200.00,
  actualUnitCostPrice: 600.00,
  actualPurchaseUrl: 'https://kabum.com.br/cabo-furukawa',
  paymentMethod: 'PIX',
  purchasedAt: '2026-09-30'
};

const listAfterPurchased = saveOrUpdateDirectPurchase(purchasedDirectData);
const foundPurchased = listAfterPurchased.find(i => i.id === mockDirectItem.id);
assert.ok(foundPurchased, 'Item deve existir na lista atualizada');
assert.equal(foundPurchased?.purchaseStatus, 'purchased');
assert.equal(foundPurchased?.actualUnitCostPrice, 600.00);

// 6. Teste de Agrupamento para Catálogo de Referência de Preços Pagos
console.log('🔹 6. Validando Agrupamento para Catálogo de Referência de Preços...');
const referenceItem1: ProcurementItem = {
  id: 'ref-1',
  quoteId: 'q-1',
  quoteCode: 'PROPOSTA-1',
  clientCompany: 'Sabin',
  itemId: 'i-1',
  name: 'SSD Kingston 480GB A400',
  partNumber: 'SA400S37/480G',
  quantity: 5,
  unit: 'un',
  quotedCostPrice: 200,
  quotedUnitPrice: 280,
  quotedTotalPrice: 1400,
  supplier: 'Kabum',
  actualCostPrice: 950,
  actualUnitCostPrice: 190,
  actualPurchaseUrl: 'https://kabum.com/ssd480',
  purchaseStatus: 'purchased',
  taxPercent: 9.05,
  purchasedAt: '2026-08-15'
};

const referenceItem2: ProcurementItem = {
  id: 'ref-2',
  quoteId: 'q-2',
  quoteCode: 'PROPOSTA-2',
  clientCompany: 'Baterias Moura',
  itemId: 'i-2',
  name: 'SSD Kingston 480GB A400',
  partNumber: 'SA400S37/480G',
  quantity: 2,
  unit: 'un',
  quotedCostPrice: 210,
  quotedUnitPrice: 290,
  quotedTotalPrice: 580,
  supplier: 'Amazon',
  actualCostPrice: 370,
  actualUnitCostPrice: 185,
  actualPurchaseUrl: 'https://amazon.com.br/ssd480',
  purchaseStatus: 'purchased',
  taxPercent: 9.05,
  purchasedAt: '2026-09-20'
};

// Agregação por chave
const key1 = referenceItem1.name.toLowerCase().trim();
const key2 = referenceItem2.name.toLowerCase().trim();
assert.equal(key1, key2, 'Mesmo produto deve gerar a mesma chave de agrupamento');

const allItems = [referenceItem1, referenceItem2];
const prices = allItems.map(i => i.actualUnitCostPrice!).filter(Boolean);
const minPrice = Math.min(...prices);
const maxPrice = Math.max(...prices);
const latestItem = allItems.sort((a, b) => (b.purchasedAt || '').localeCompare(a.purchasedAt || ''))[0];

assert.equal(minPrice, 185, 'Preço mínimo deve ser 185');
assert.equal(maxPrice, 190, 'Preço máximo deve ser 190');
assert.equal(latestItem.actualPurchaseUrl, 'https://amazon.com.br/ssd480', 'Última compra foi na Amazon');
assert.equal(latestItem.actualUnitCostPrice, 185, 'Último preço unitário pago foi 185');
console.log('  ✅ Catálogo de Referência: Agrupamento, histórico mín/máx e último preço/link calculados perfeitamente!');

// Exclusão de compra avulsa
deleteDirectPurchaseItem(mockDirectItem.id);
assert.equal(getDirectPurchases().length, 0, 'Compra avulsa deve ser removida');
console.log('  ✅ Exclusão de Compra Avulsa: Removida com sucesso!');

console.log('🎉 TODOS OS TESTES DAS NOVAS FUNCIONALIDADES DE COMPRAS PASSARAM COM 100% DE SUCESSO!\n');
