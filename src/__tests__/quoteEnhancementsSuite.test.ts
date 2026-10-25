import { describe, it } from 'node:test';
import assert from 'node:assert';
import { QuoteItem, Quote, QuoteKit } from '../types';
import { 
  recalculateQuoteTotals, 
  calculateMarkupForTargetTotal,
  calculateCommercialUnitPrice 
} from '../services/pricingEngine';
import { 
  getQuoteKits, 
  saveQuoteKit, 
  deleteQuoteKit, 
  getLastPriceForClient 
} from '../utils/storage';

describe('Suíte de Novos Recursos da Cotação (SmartQuote v3)', () => {

  it('1. Preço Alvo (Reverse Markup): Deve calcular markup ideal para atingir o valor final desejado', () => {
    const items: QuoteItem[] = [
      {
        id: '1',
        itemNumber: 1,
        name: 'Switch Gigabit 24 Portas',
        description: '',
        quantity: 2,
        unit: 'Un.',
        costPrice: 500,
        markupPercent: 25,
        taxPercent: 9.1,
        unitPrice: 688,
        totalPrice: 1376
      },
      {
        id: '2',
        itemNumber: 2,
        name: 'Cabo Furukawa Cat6 305m',
        description: '',
        quantity: 1,
        unit: 'Cx.',
        costPrice: 400,
        markupPercent: 25,
        taxPercent: 9.1,
        unitPrice: 550,
        totalPrice: 550
      }
    ];

    // Custo base total = (500 * 2) + 400 = 1400
    // Queremos bater R$ 2.500,00 redondo
    const result = calculateMarkupForTargetTotal(items, 2500, { globalTax: 9.1 });
    assert.ok(result, 'Resultado de preço alvo não deve ser nulo');
    assert.strictEqual(result.targetTotal, 2500);
    // Total calculado deve estar muito próximo de 2500 (diferença máxima de 1% devido a arredondamento de inteiros comerciais)
    assert.ok(Math.abs(result.calculatedTotal - 2500) <= 25, `Total calculado ${result.calculatedTotal} deve ser muito próximo do alvo 2500`);
    assert.ok(result.suggestedMarkupPercent > 0, 'Markup sugerido deve ser positivo');
    assert.ok(result.isHealthyMargin, 'Margem deve ser considerada saudável');
  });

  it('2. Itens Opcionais: recalculateQuoteTotals deve segregar itens opcionais do total principal', () => {
    const items: QuoteItem[] = [
      {
        id: '1',
        itemNumber: 1,
        name: 'Computador Core i5',
        description: '',
        quantity: 1,
        unit: 'Un.',
        costPrice: 2000,
        markupPercent: 25,
        taxPercent: 9.1,
        unitPrice: 2750,
        totalPrice: 2750,
        isOptional: false
      },
      {
        id: '2',
        itemNumber: 2,
        name: 'Upgrade para 32GB RAM (Opcional)',
        description: '',
        quantity: 1,
        unit: 'Un.',
        costPrice: 300,
        markupPercent: 25,
        taxPercent: 9.1,
        unitPrice: 413,
        totalPrice: 413,
        isOptional: true
      }
    ];

    const totals = recalculateQuoteTotals(items, { globalTax: 9.1 });

    // Total principal deve conter APENAS o item base
    assert.strictEqual(totals.totalAmount, 2750, 'Total principal deve conter apenas itens não-opcionais');
    assert.strictEqual(totals.totalCost, 2000, 'Custo principal deve conter apenas itens não-opcionais');

    // Totais opcionais devem estar segregados
    assert.strictEqual(totals.optionalTotalAmount, 413, 'Total opcional deve somar R$ 413');
    assert.strictEqual(totals.optionalTotalCost, 300, 'Custo opcional deve somar R$ 300');
    assert.strictEqual(totals.optionalItemsCount, 1, 'Deve contar 1 item opcional');
  });

  it('3. Memória de Preço por Cliente: getLastPriceForClient deve recuperar histórico correto', () => {
    const mockQuotes = [
      {
        id: 'q1',
        code: 'UBEC 150926-1',
        clientCompany: 'União Brasileira de Educação Católica - UBEC',
        contactPerson: 'Carlos',
        clientEmail: 'carlos@ubec.edu.br',
        clientPhone: '6199999999',
        subject: 'Rede',
        city: 'Brasília',
        date: '2026-09-15',
        validityDays: '10',
        paymentTerms: '28 dias',
        deliveryDays: '5',
        items: [
          {
            id: 'it1',
            itemNumber: 1,
            name: 'Switch Cisco 24p Gigabit',
            partNumber: 'CBS250-24T-4G',
            description: '',
            quantity: 3,
            unit: 'Un.',
            costPrice: 1200,
            markupPercent: 22,
            taxPercent: 9.1,
            unitPrice: 1610,
            totalPrice: 4830
          }
        ],
        status: 'approved',
        createdAt: '2026-09-15T10:00:00Z',
        updatedAt: '2026-09-15T10:00:00Z',
        globalMarkupPercent: 22
      }
    ] as unknown as Quote[];

    // Busca com variação no nome da empresa e mesmo Part Number
    const found = getLastPriceForClient('UBEC', { partNumber: 'cbs250-24t-4g' }, mockQuotes);
    assert.ok(found, 'Deve encontrar o preço praticado para a UBEC');
    assert.strictEqual(found.unitPrice, 1610);
    assert.strictEqual(found.quoteCode, 'UBEC 150926-1');

    // Cliente inexistente não deve retornar nada
    const notFound = getLastPriceForClient('Cliente Fantasma', { partNumber: 'CBS250-24T-4G' }, mockQuotes);
    assert.strictEqual(notFound, null);
  });

  it('4. Kits Comerciais: Deve permitir salvar, listar e excluir kits', () => {
    const kit: QuoteKit = {
      id: 'kit-rede-test-01',
      name: 'Kit Ponto de Rede Furukawa',
      description: 'Switch + Cabos + Patch Cords',
      category: 'Redes, Conectividade & Telefonia',
      items: [
        {
          name: 'Switch 8 Portas',
          description: '',
          quantity: 1,
          unit: 'Un.',
          costPrice: 200,
          markupPercent: 25,
          unitPrice: 275,
          totalPrice: 275
        }
      ],
      createdAt: new Date().toISOString()
    };

    saveQuoteKit(kit);
    const list = getQuoteKits();
    const saved = list.find(k => k.id === 'kit-rede-test-01');
    assert.ok(saved, 'Kit deve ser encontrado na lista após salvar');
    assert.strictEqual(saved.name, 'Kit Ponto de Rede Furukawa');

    deleteQuoteKit('kit-rede-test-01');
    const listAfterDelete = getQuoteKits();
    assert.ok(!listAfterDelete.some(k => k.id === 'kit-rede-test-01'), 'Kit deve ter sido excluído');
  });

});
