import assert from 'node:assert';
import { resolveFreshestProductData } from '../utils/freshestProductResolver';
import { QuoteItem, Product, Quote } from '../types';
import { ProcurementPurchaseRecord } from '../utils/storage';

console.log('--- TESTANDO RESOLUÇÃO DE CUSTOS E LINKS MAIS RECENTES NA DUPLICAÇÃO ---');

// Cenário 1: Item antigo atualizado pelo catálogo
const oldItem: QuoteItem = {
  id: 'item-1',
  itemNumber: 1,
  name: 'SSD Kingston NV2 1TB M.2 NVMe',
  description: 'SSD Kingston NV2 1TB',
  partNumber: 'SNV2S/1000G',
  quantity: 2,
  unit: 'UN',
  costPrice: 280.00,
  unitPrice: 380.00,
  markupPercent: 25,
  totalPrice: 760.00,
  sourceUrl: 'https://kabum.com.br/antigo',
  supplier: 'Kabum Antigo'
};

const catalogProducts: Product[] = [
  {
    id: 'prod-1',
    sku: 'SKU-001',
    name: 'SSD Kingston NV2 1TB M.2 NVMe',
    description: 'SSD Kingston NV2 1TB',
    category: 'Informática, Hardware & Periféricos',
    unit: 'UN',
    partNumber: 'SNV2S/1000G',
    costPrice: 350.00,
    sourceUrl: 'https://kabum.com.br/novo-link-catalogo',
    supplier: 'Kabum Oficial',
    lastUpdated: new Date(Date.now() - 1000).toISOString()
  }
];

const resCatalog = resolveFreshestProductData({
  item: oldItem,
  originalQuoteDate: '2026-01-10T10:00:00Z',
  catalogProducts
});

assert.strictEqual(resCatalog.costPrice, 350.00, 'Deveria atualizar o custo para 350.00 do catálogo');
assert.strictEqual(resCatalog.sourceUrl, 'https://kabum.com.br/novo-link-catalogo', 'Deveria atualizar o link para o link do catálogo');
assert.strictEqual(resCatalog.costUpdated, true, 'Deveria sinalizar que custo foi atualizado');
assert.strictEqual(resCatalog.linkUpdated, true, 'Deveria sinalizar que link foi atualizado');
console.log('✓ Cenário 1 (Catálogo): Custo e link atualizados com sucesso.');

// Cenário 2: Compra real recente na Central de Compras (Procurement) supera cotação antiga
const procurementRecords: Record<string, ProcurementPurchaseRecord> = {
  'rec-1': {
    itemId: 'item-old-2',
    name: 'SSD Kingston NV2 1TB M.2 NVMe',
    purchaseStatus: 'purchased',
    actualUnitCostPrice: 335.50,
    actualPurchaseUrl: 'https://mercadolivre.com.br/compra-recente-loja-oficial',
    actualSupplier: 'Mercado Livre Oficial',
    purchasedAt: new Date(Date.now() - 500).toISOString() // Comprado bem recente
  }
};

const resProcurement = resolveFreshestProductData({
  item: oldItem,
  originalQuoteDate: '2026-01-10T10:00:00Z',
  procurementRecords
});

assert.strictEqual(resProcurement.costPrice, 335.50, 'Deveria pegar o custo de compra real de R$ 335.50');
assert.strictEqual(resProcurement.sourceUrl, 'https://mercadolivre.com.br/compra-recente-loja-oficial', 'Deveria pegar a URL da compra real');
assert.strictEqual(resProcurement.supplier, 'Mercado Livre Oficial', 'Deveria pegar o fornecedor da compra real');
console.log('✓ Cenário 2 (Procurement): Custo e link de compra real aplicados com sucesso.');

// Cenário 3: Proposta mais recente com link novo
const recentQuotes: Quote[] = [
  {
    id: 'quote-recent',
    code: 'INF-2026-999',
    date: '2026-11-15',
    status: 'sent',
    totalAmount: 1000,
    createdAt: new Date(Date.now() - 2000).toISOString(),
    items: [
      {
        id: 'it-recent',
        itemNumber: 1,
        name: 'SSD Kingston NV2 1TB M.2 NVMe',
        description: 'SSD Kingston',
        partNumber: 'SNV2S/1000G',
        costPrice: 340.00,
        unitPrice: 450.00,
        totalPrice: 450.00,
        markupPercent: 25,
        unit: 'UN',
        quantity: 1,
        sourceUrl: 'https://amazon.com.br/ssd-kingston-nv2',
        supplier: 'Amazon Prime'
      }
    ]
  } as unknown as Quote
];

const resQuotes = resolveFreshestProductData({
  item: oldItem,
  originalQuoteDate: '2026-01-10T10:00:00Z',
  allQuotes: recentQuotes
});

assert.strictEqual(resQuotes.costPrice, 340.00, 'Deveria trazer custo mais recente da outra cotação');
assert.strictEqual(resQuotes.sourceUrl, 'https://amazon.com.br/ssd-kingston-nv2', 'Deveria trazer link mais recente da outra cotação');
console.log('✓ Cenário 3 (Cotação Recente): Custo e link herdados da proposta mais nova.');

// Cenário 4: Item sem novas alterações mantém valores originais intactos
const itemSemAlteracao: QuoteItem = {
  id: 'item-3',
  itemNumber: 1,
  name: 'Cabo de Rede Furukawa Cat6 Soho Plus 305m',
  description: 'Cabo de rede',
  quantity: 1,
  unit: 'CX',
  markupPercent: 25,
  costPrice: 650.00,
  unitPrice: 850.00,
  totalPrice: 850.00,
  sourceUrl: 'https://furukawa.com.br/cabo-cat6',
  supplier: 'Distribuidor Furukawa'
};

const resSemAlteracao = resolveFreshestProductData({
  item: itemSemAlteracao,
  originalQuoteDate: '2026-11-01T10:00:00Z',
  catalogProducts: [],
  procurementRecords: {},
  allQuotes: []
});

assert.strictEqual(resSemAlteracao.costPrice, 650.00, 'Custo original deve ser preservado');
assert.strictEqual(resSemAlteracao.sourceUrl, 'https://furukawa.com.br/cabo-cat6', 'Link original deve ser preservado');
assert.strictEqual(resSemAlteracao.costUpdated, false);
assert.strictEqual(resSemAlteracao.linkUpdated, false);
console.log('✓ Cenário 4 (Preservação): Valores originais preservados com fidelidade.');

console.log('=== TODOS OS TESTES DE RESOLUÇÃO DE CUSTOS E LINKS PASSARAM COM SUCESSO! ===');
