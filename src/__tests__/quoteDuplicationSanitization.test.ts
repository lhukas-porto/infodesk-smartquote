import assert from 'node:assert/strict';
import { Quote, QuoteItem } from '../types';
import { 
  sanitizeQuoteItemForDuplication, 
  sanitizeDraftQuote, 
  doesQuoteNeedDraftSanitization 
} from '../utils/storage';

console.log('\n🧪 Iniciando testes de Sanitização e Blindagem na Duplicação de Cotações...');

// 1. Mock de item comprado e aprovado com dados reais de compra e OC
const mockApprovedPurchasedItem: QuoteItem = {
  id: 'item-orig-123',
  itemNumber: 1,
  name: 'Switch Gigabit 24 Portas Gerenciável',
  description: 'Switch corporativo L2+',
  category: 'Redes, Conectividade & Telefonia',
  partNumber: 'TL-SG1024DE',
  ncm: '85176259',
  quantity: 2,
  unit: 'Un.',
  costPrice: 500,
  shippingCost: 20,
  taxPercent: 9.1,
  markupPercent: 30,
  unitPrice: 752.48,
  totalPrice: 1504.96,
  supplier: 'Mercado Livre',
  quotedSupplier: 'Distribuidor Furukawa Oficial',
  sourceUrl: 'https://distribuidor.com/switch',
  
  // Dados de aprovação e Central de Compras
  approved: true,
  approvedQuantity: 2,
  purchaseStatus: 'purchased',
  actualCostPrice: 480,
  actualUnitCostPrice: 240,
  actualPurchaseUrl: 'https://mercadolivre.com.br/item-123',
  actualSupplier: 'Mercado Livre Loja Oficial',
  actualShippingCost: 15,
  shippingPending: false,
  paymentMethod: 'Cartão Corporate XP',
  purchasedAt: '2026-10-15T14:30:00.000Z',
  purchaseNotes: 'Comprado com NF 99881 e entregue na recepção',
  actualTaxPercent: 9.1,
  clientOrderNumber: 'OC-CLIENTE-99482'
};

// =========================================================================
// TESTE 1: sanitizeQuoteItemForDuplication limpa 100% dos dados de OC e compras
// =========================================================================
const cleanClonedItem = sanitizeQuoteItemForDuplication(mockApprovedPurchasedItem, 0);

assert.notEqual(cleanClonedItem.id, mockApprovedPurchasedItem.id, 'O ID clonado deve ser novo e único');
assert.equal(cleanClonedItem.itemNumber, 1, 'O itemNumber deve ser configurado corretamente');
assert.equal(cleanClonedItem.name, mockApprovedPurchasedItem.name, 'O nome comercial do produto deve ser preservado');
assert.equal(cleanClonedItem.partNumber, mockApprovedPurchasedItem.partNumber, 'O Part Number deve ser preservado');
assert.equal(cleanClonedItem.unitPrice, mockApprovedPurchasedItem.unitPrice, 'O preço de venda unitário deve ser preservado');
assert.equal(cleanClonedItem.supplier, 'Distribuidor Furukawa Oficial', 'Deve restaurar o fornecedor originalmente cotado');
assert.equal(cleanClonedItem.quotedSupplier, undefined, 'quotedSupplier residual deve ser undefined');

// Validação de blindagem contra dados de compras e aprovação
assert.equal(cleanClonedItem.approved, undefined, 'Item duplicado nunca deve herdar status aprovado');
assert.equal(cleanClonedItem.approvedQuantity, undefined, 'approvedQuantity deve ser limpo');
assert.equal(cleanClonedItem.purchaseStatus, undefined, 'purchaseStatus deve ser limpo (não pode nascer comprado)');
assert.equal(cleanClonedItem.actualCostPrice, undefined, 'actualCostPrice deve ser limpo');
assert.equal(cleanClonedItem.actualUnitCostPrice, undefined, 'actualUnitCostPrice deve ser limpo');
assert.equal(cleanClonedItem.actualPurchaseUrl, undefined, 'actualPurchaseUrl deve ser limpo');
assert.equal(cleanClonedItem.actualSupplier, undefined, 'actualSupplier deve ser limpo');
assert.equal(cleanClonedItem.actualShippingCost, undefined, 'actualShippingCost deve ser limpo');
assert.equal(cleanClonedItem.shippingPending, undefined, 'shippingPending deve ser limpo');
assert.equal(cleanClonedItem.paymentMethod, undefined, 'paymentMethod de compra real deve ser limpo');
assert.equal(cleanClonedItem.purchasedAt, undefined, 'purchasedAt deve ser limpo');
assert.equal(cleanClonedItem.purchaseNotes, undefined, 'purchaseNotes deve ser limpo');
assert.equal(cleanClonedItem.actualTaxPercent, undefined, 'actualTaxPercent deve ser limpo');
assert.equal(cleanClonedItem.clientOrderNumber, undefined, 'clientOrderNumber do item deve ser limpo');

console.log('✓ Teste 1 aprovado: sanitizeQuoteItemForDuplication expurga dados de compra e OC mantendo integridade comercial.');

// =========================================================================
// TESTE 2: doesQuoteNeedDraftSanitization detecta resíduos indevidos
// =========================================================================
const dirtyDraftQuote: Quote = {
  id: 'quote-dirty-1',
  code: 'CNC 210926-2',
  clientCompany: 'Empresa Teste',
  contactPerson: 'João',
  clientEmail: 'joao@teste.com',
  clientPhone: '61999999999',
  subject: 'Fornecimento',
  city: 'Brasília',
  date: '20 de outubro de 2026',
  validityDays: '10 dias',
  paymentTerms: 'Faturado',
  deliveryDays: '5 dias',
  warrantyTerms: '1 ano',
  openingText: 'Prezados',
  totalCost: 1000,
  totalProfit: 500,
  totalAmount: 1500,
  averageMargin: 23.5,
  status: 'draft',
  createdAt: '2026-10-20T10:00:00.000Z',
  clientOrderNumber: 'OC-ANTIGA-5544', // RESÍDUO INDEVIDO DE DUPLICAÇÃO
  approvedAt: '2026-10-18T10:00:00.000Z', // RESÍDUO
  approvedTotalAmount: 1500, // RESÍDUO
  items: [mockApprovedPurchasedItem]
};

assert.equal(doesQuoteNeedDraftSanitization(dirtyDraftQuote), true, 'Deve detectar que a cotação rascunho precisa de higienização');

console.log('✓ Teste 2 aprovado: doesQuoteNeedDraftSanitization identifica precisamente cotações rascunho com dados residuais.');

// =========================================================================
// TESTE 3: sanitizeDraftQuote cura e purifica a cotação inteira
// =========================================================================
const curedQuote = sanitizeDraftQuote(dirtyDraftQuote);

assert.equal(curedQuote.status, 'draft', 'Status deve permanecer draft');
assert.equal(curedQuote.clientOrderNumber, undefined, 'clientOrderNumber da proposta rascunho deve ser undefined');
assert.equal(curedQuote.approvedAt, undefined, 'approvedAt deve ser undefined');
assert.equal(curedQuote.approvedTotalAmount, undefined, 'approvedTotalAmount deve ser undefined');
assert.equal(curedQuote.sentAt, undefined, 'sentAt deve ser undefined');
assert.equal(curedQuote.followUpAt, undefined, 'followUpAt deve ser undefined');

// Validação dos itens na cotação curada
assert.equal(curedQuote.items.length, 1);
const curedItem = curedQuote.items[0];
assert.equal(curedItem.approved, undefined, 'Item na cotação rascunho não pode ter approved');
assert.equal(curedItem.purchaseStatus, undefined, 'Item na cotação rascunho não pode ter purchaseStatus');
assert.equal(curedItem.clientOrderNumber, undefined, 'Item na cotação rascunho não pode ter OC');
assert.equal(curedItem.actualCostPrice, undefined, 'Item na cotação rascunho não pode ter custo real de compra');

// A cotação curada agora deve estar limpa
assert.equal(doesQuoteNeedDraftSanitization(curedQuote), false, 'A cotação curada não deve mais requerer sanitização');

console.log('✓ Teste 3 aprovado: sanitizeDraftQuote higienizou todos os campos da cotação e dos itens com perfeição.');

// =========================================================================
// TESTE 4: Cotação legitimamente aprovada preserva seus dados de aprovação
// =========================================================================
const legitimateApprovedQuote: Quote = {
  ...dirtyDraftQuote,
  id: 'quote-approved-real',
  status: 'approved',
  clientOrderNumber: 'OC-OFICIAL-VÁLIDA',
  approvedAt: '2026-10-20T12:00:00.000Z',
  approvedTotalAmount: 1500
};

assert.equal(doesQuoteNeedDraftSanitization(legitimateApprovedQuote), false, 'Cotação approved legítima não deve ser marcada para sanitização');

const preservedQuote = sanitizeDraftQuote(legitimateApprovedQuote);
assert.equal(preservedQuote.clientOrderNumber, 'OC-OFICIAL-VÁLIDA', 'Cotação aprovada deve manter sua OC legítima');
assert.equal(preservedQuote.approvedAt, '2026-10-20T12:00:00.000Z', 'Cotação aprovada deve manter sua data de aprovação');
assert.equal(preservedQuote.approvedTotalAmount, 1500, 'Cotação aprovada deve manter seu total aprovado');

console.log('✓ Teste 4 aprovado: Propostas legitimamente aprovadas mantêm 100% de seus dados de OC e aprovação.');

console.log('\n🎉 TODOS OS TESTES DE SANITIZAÇÃO NA DUPLICAÇÃO DE COTAÇÕES PASSARAM COM 100% DE SUCESSO!\n');
