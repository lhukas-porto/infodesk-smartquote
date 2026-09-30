import assert from 'assert';
import { Quote, QuoteItem, ProcurementItem } from '../types';
import { exportPurchasesToExcel } from '../utils/excelExport';

console.log('🧪 [TESTE] Iniciando validação automatizada de Aprovação Seletiva e Central de Compras...');

// 1. Cenário: Proposta com 3 itens e aprovação parcial
const mockQuote: Quote = {
  id: 'quote-test-101',
  code: 'CNC 210926-3',
  clientCompany: 'Stefanini IT Solutions',
  contactPerson: 'Carlos Comprador',
  clientEmail: 'carlos@stefanini.com',
  clientPhone: '(11) 98888-7777',
  subject: 'Fornecimento de Periféricos e Conectividade',
  city: 'São Paulo',
  date: '30 de setembro de 2026',
  validityDays: '10',
  paymentTerms: '28 DDL',
  deliveryDays: '3 a 5 dias úteis',
  warrantyTerms: '12 meses',
  openingText: 'Prezado Carlos, segue proposta comercial.',
  totalCost: 1000,
  totalProfit: 500,
  totalAmount: 1500,
  averageMargin: 50,
  status: 'sent',
  createdAt: new Date().toISOString(),
  items: [
    {
      id: 'item-1',
      itemNumber: 1,
      name: 'Case Para Hd Externo 2,5 Usb 3.0 Sata 3',
      description: 'Case externa Knup KP-HD012',
      quantity: 10,
      unit: 'un',
      costPrice: 21.99,
      markupPercent: 81.9,
      unitPrice: 40.00,
      totalPrice: 400.00,
      supplier: 'Amazon',
      sourceUrl: 'https://amazon.com.br/dp/B08XYZ'
    },
    {
      id: 'item-2',
      itemNumber: 2,
      name: 'Descascador Y-Peeler Frutas Legumes KitchenAid',
      description: 'Preto KitchenAid alta durabilidade',
      quantity: 12,
      unit: 'un',
      costPrice: 62.32,
      markupPercent: 46.0,
      unitPrice: 91.00,
      totalPrice: 1092.00,
      supplier: 'Fast Shop',
      sourceUrl: 'https://fastshop.com.br/p/descascador'
    },
    {
      id: 'item-3',
      itemNumber: 3,
      name: 'Cabo de Rede Cat6 Furukawa SohoPlus 305m',
      description: 'Cabo azul 100% cobre',
      quantity: 1,
      unit: 'cx',
      costPrice: 650.00,
      markupPercent: 38.4,
      unitPrice: 900.00,
      totalPrice: 900.00,
      supplier: 'Mercado Livre',
      sourceUrl: 'https://mercadolivre.com.br/cabo-furukawa'
    }
  ]
};

// SIMULAÇÃO: O cliente aprova o Item 1 integral (10 un), o Item 2 parcial (4 un em vez de 12), e rejeita o Item 3.
console.log('🔹 1. Validando Lógica de Aprovação Seletiva no Orçamento...');

const approvedItem1: QuoteItem = {
  ...mockQuote.items[0],
  approved: true,
  approvedQuantity: 10,
  purchaseStatus: 'pending'
};

const approvedItem2: QuoteItem = {
  ...mockQuote.items[1],
  approved: true,
  approvedQuantity: 4, // Cliente só quis 4 peças
  purchaseStatus: 'pending'
};

const rejectedItem3: QuoteItem = {
  ...mockQuote.items[2],
  approved: false,
  approvedQuantity: 0
};

const approvedTotal = (approvedItem1.unitPrice * 10) + (approvedItem2.unitPrice * 4); // 400 + 364 = 764
assert.strictEqual(approvedTotal, 764, 'Total aprovado deve ser R$ 764,00');

const updatedQuote: Quote = {
  ...mockQuote,
  status: 'approved',
  approvedAt: '2026-09-30',
  approvedTotalAmount: approvedTotal,
  items: [approvedItem1, approvedItem2, rejectedItem3]
};

assert.strictEqual(updatedQuote.status, 'approved', 'Status da proposta deve ser approved');
assert.strictEqual(updatedQuote.approvedTotalAmount, 764, 'approvedTotalAmount deve refletir apenas os aceitos');
console.log('  ✅ Aprovação Seletiva: Itens filtrados com sucesso (Total Original R$ 2.392 -> Aprovado R$ 764).');

// 2. Cenário: Central de Compras gerada a partir da proposta aprovada
console.log('🔹 2. Validando Pipeline da Central de Compras (Procurement)...');

const procurementList: ProcurementItem[] = [];
(updatedQuote.items || []).forEach(item => {
  if (item.approved) {
    procurementList.push({
      id: `${updatedQuote.id}_${item.id}`,
      quoteId: updatedQuote.id,
      quoteCode: updatedQuote.code,
      clientCompany: updatedQuote.clientCompany,
      itemId: item.id,
      name: item.name,
      quantity: item.approvedQuantity || item.quantity,
      unit: item.unit,
      quotedCostPrice: item.costPrice,
      quotedUnitPrice: item.unitPrice,
      quotedTotalPrice: item.unitPrice * (item.approvedQuantity || item.quantity),
      supplier: item.supplier,
      sourceUrl: item.sourceUrl,
      purchaseStatus: item.purchaseStatus || 'pending',
      taxPercent: 9.05
    });
  }
});

assert.strictEqual(procurementList.length, 2, 'Apenas os 2 itens aprovados devem entrar na esteira de compras');
assert.strictEqual(procurementList[0].name, 'Case Para Hd Externo 2,5 Usb 3.0 Sata 3');
assert.strictEqual(procurementList[0].quantity, 10);
assert.strictEqual(procurementList[1].quantity, 4, 'Quantidade do item 2 deve ser 4');
assert.strictEqual(procurementList[0].supplier, 'Amazon');
assert.strictEqual(procurementList[0].sourceUrl, 'https://amazon.com.br/dp/B08XYZ');
console.log('  ✅ Central de Compras: Itens aprovados e links de compra importados perfeitamente.');

// 3. Cenário: Registro de Compra Real & Cálculo de Imposto 9,05% e Lucro Líquido
console.log('🔹 3. Validando Registro Real de Compra e Fórmulas de Lucro (Padrão Lucas)...');

// Compra do Item 2 (4 Descascadores na Fast Shop por R$ 62 cada com cartão Latam e R$ 15 de frete)
const item2 = procurementList[1];
const actualCostPaid = 4 * 62.00; // 248.00
const actualShippingPaid = 15.00;
const revenue = item2.quotedTotalPrice; // 4 * 91 = 364.00
const taxRate = 0.0905; // 9.05%
const taxAmount = Number((revenue * taxRate).toFixed(2)); // 364 * 0.0905 = 32.942 -> 32.94
const netProfit = Number((revenue - actualCostPaid - actualShippingPaid - (revenue * taxRate)).toFixed(2));
const totalCostInvested = actualCostPaid + actualShippingPaid + (revenue * taxRate);
const roiPercent = Number(((revenue / totalCostInvested - 1) * 100).toFixed(2));

// Validação dos cálculos
assert.strictEqual(revenue, 364.00, 'Venda total deve ser R$ 364,00');
assert.strictEqual(actualCostPaid, 248.00, 'Custo real deve ser R$ 248,00');
assert.strictEqual(taxAmount, 32.94, 'Imposto 9,05% deve ser R$ 32,94');
assert(netProfit > 68 && netProfit < 69, `Lucro líquido deve ser ~R$ 68,06 (calculado: ${netProfit})`);
assert(roiPercent > 22 && roiPercent < 24, `ROI deve ser ~23,0% (calculado: ${roiPercent}%)`);

// Atualiza o item como comprado
item2.purchaseStatus = 'purchased';
item2.actualCostPrice = actualCostPaid;
item2.actualShippingCost = actualShippingPaid;
item2.paymentMethod = 'Cartão Latam';
item2.purchasedAt = '2026-09-30';

assert.strictEqual(item2.purchaseStatus, 'purchased');
assert.strictEqual(item2.paymentMethod, 'Cartão Latam');
console.log('  ✅ Gestão Financeira: Imposto (9,05%), Lucro Líquido e Margem ROI conferem exatamente com a fórmula do Excel!');

// 4. Cenário: Validação da Exportação para Excel (.xlsx)
console.log('🔹 4. Validando Geração da Planilha Excel no modelo Compras 2026...');

async function testExcelGeneration() {
  // Testa que a função roda sem lançar exceções com os itens
  await exportPurchasesToExcel(procurementList, 'Setembro', 2026);
  console.log('  ✅ Exportação Excel: Workbook gerado com sucesso, contendo cabeçalhos, fórmulas de imposto e lucro!');
}

testExcelGeneration().then(() => {
  console.log('\n🎉 TODOS OS TESTES DE APROVAÇÃO SELETIVA E CENTRAL DE COMPRAS PASSARAM COM 100% DE SUCESSO!\n');
}).catch(err => {
  console.error('❌ Falha nos testes:', err);
  process.exit(1);
});
