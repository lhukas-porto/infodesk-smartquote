import assert from 'assert';
import { buildWhatsAppItemsOnlyMessage, buildWhatsAppQuoteMessage, formatPhoneForWhatsApp } from '../utils/whatsappFormatter';
import { Quote } from '../types';

console.log('🧪 Iniciando testes de formatação de mensagens para WhatsApp...');

const mockQuote: Quote = {
  id: 'q123',
  code: 'COT-2026-001',
  clientCompany: 'Hospital Santa Helena',
  contactPerson: 'Dra. Camila',
  clientPhone: '(61) 98765-4321',
  clientEmail: 'compras@hospital.com',
  date: '2026-10-22',
  status: 'draft',
  items: [
    {
      id: 'item-1',
      itemNumber: 1,
      description: '',
      markupPercent: 30,
      name: 'Switch Gigabit 24 Portas PoE+ Gerenciável',
      partNumber: 'SG2400P',
      quantity: 2,
      unit: 'Un.',
      costPrice: 850,
      unitPrice: 1250,
      totalPrice: 2500
    },
    {
      id: 'item-2',
      itemNumber: 2,
      description: '',
      markupPercent: 30,
      name: 'Cabo de Rede UTP Cat6 Furukawa Azul 305m',
      partNumber: '23200055',
      quantity: 5,
      unit: 'Cx.',
      costPrice: 420,
      unitPrice: 620,
      totalPrice: 3100
    }
  ],
  totalAmount: 5600,
  deliveryDays: '5 dias úteis',
  paymentTerms: '28 DDL',
  warrantyTerms: '12 meses'
} as unknown as Quote;

// 1. Teste de buildWhatsAppItemsOnlyMessage com todos os itens
const itemsOnlyMsg = buildWhatsAppItemsOnlyMessage(mockQuote, {
  tradeName: 'Infodesk',
  representativeName: 'Lucas Porto',
  phone: '(61) 9 9627-2630'
} as any);

assert.ok(itemsOnlyMsg.includes('LISTA DE ITENS PARA COTAÇÃO'), 'Deve conter título de lista de itens');
assert.ok(itemsOnlyMsg.includes('COT-2026-001'), 'Deve conter o código de referência da cotação');
assert.ok(itemsOnlyMsg.includes('Switch Gigabit 24 Portas PoE+ Gerenciável'), 'Deve conter nome do item 1');
assert.ok(itemsOnlyMsg.includes('*Quantidade:* 2 Un.'), 'Deve conter quantidade e unidade do item 1');
assert.ok(itemsOnlyMsg.includes('(PN: SG2400P)'), 'Deve conter Part Number');
assert.ok(itemsOnlyMsg.includes('Cabo de Rede UTP Cat6 Furukawa Azul 305m'), 'Deve conter nome do item 2');
assert.ok(itemsOnlyMsg.includes('*Quantidade:* 5 Cx.'), 'Deve conter quantidade e unidade do item 2');
assert.ok(itemsOnlyMsg.includes('Total: 2 produto(s)'), 'Deve conter totalizador de produtos');
assert.ok(!itemsOnlyMsg.includes('R$ 1250'), 'NÃO deve conter preços de venda para fornecedores');
assert.ok(!itemsOnlyMsg.includes('R$ 5600'), 'NÃO deve conter valor total da proposta');

console.log('  ✅ 1. buildWhatsAppItemsOnlyMessage gera lista limpa de itens e quantidades sem expor valores');

// 2. Teste de filtro com apenas item selecionado
const filteredMsg = buildWhatsAppItemsOnlyMessage(mockQuote, undefined, ['item-2']);
assert.ok(!filteredMsg.includes('Switch Gigabit'), 'Não deve incluir item-1');
assert.ok(filteredMsg.includes('Cabo de Rede UTP Cat6'), 'Deve incluir item-2');
assert.ok(filteredMsg.includes('Total: 1 produto(s)'), 'Totalizador deve refletir o item filtrado');

console.log('  ✅ 2. Suporta perfeitamente seleção parcial de itens marcados com checkbox');

// 3. Teste de formatação de telefone
assert.strictEqual(formatPhoneForWhatsApp('(61) 98765-4321'), '5561987654321');
assert.strictEqual(formatPhoneForWhatsApp('61987654321'), '5561987654321');
assert.strictEqual(formatPhoneForWhatsApp('+55 61 98765-4321'), '5561987654321');

console.log('  ✅ 3. formatPhoneForWhatsApp limpa e adiciona código DDI 55');

console.log('🎉 Todos os testes de whatsappFormatter passaram com sucesso!\n');
