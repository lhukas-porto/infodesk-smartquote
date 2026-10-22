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

assert.ok(!itemsOnlyMsg.includes('LISTA DE ITENS PARA COTAÇÃO'), 'NÃO deve conter cabeçalho');
assert.ok(!itemsOnlyMsg.includes('Solicitado por:'), 'NÃO deve conter solicitado por');
assert.ok(!itemsOnlyMsg.includes('WhatsApp:'), 'NÃO deve conter linha de telefone no rodapé');
assert.ok(!itemsOnlyMsg.includes('\n\n'), 'NÃO deve conter linhas vazias sem nada');
assert.ok(itemsOnlyMsg.includes('*1.* Switch Gigabit 24 Portas PoE+ Gerenciável (PN: SG2400P) - *Qtd:* 2 Un.'), 'Item 1 deve conter nome, PN e quantidade na mesma linha');
assert.ok(itemsOnlyMsg.includes('*2.* Cabo de Rede UTP Cat6 Furukawa Azul 305m (PN: 23200055) - *Qtd:* 5 Cx.'), 'Item 2 deve conter nome, PN e quantidade na mesma linha');
assert.ok(!itemsOnlyMsg.includes('R$ 1250'), 'NÃO deve conter preços de venda para fornecedores');
assert.ok(!itemsOnlyMsg.includes('R$ 5600'), 'NÃO deve conter valor total da proposta');

console.log('  ✅ 1. buildWhatsAppItemsOnlyMessage gera lista compacta de itens e quantidades na mesma linha sem cabeçalho/rodapé');

// 2. Teste de filtro com apenas item selecionado
const filteredMsg = buildWhatsAppItemsOnlyMessage(mockQuote, undefined, ['item-2']);
assert.ok(!filteredMsg.includes('Switch Gigabit'), 'Não deve incluir item-1');
assert.ok(filteredMsg.includes('Cabo de Rede UTP Cat6 Furukawa Azul 305m'), 'Deve incluir item-2');
assert.ok(filteredMsg.includes('- *Qtd:* 5 Cx.'), 'Deve conter quantidade na mesma linha');

console.log('  ✅ 2. Suporta perfeitamente seleção parcial de itens marcados com checkbox');

// 3. Teste de formatação de telefone
assert.strictEqual(formatPhoneForWhatsApp('(61) 98765-4321'), '5561987654321');
assert.strictEqual(formatPhoneForWhatsApp('61987654321'), '5561987654321');
assert.strictEqual(formatPhoneForWhatsApp('+55 61 98765-4321'), '5561987654321');

console.log('  ✅ 3. formatPhoneForWhatsApp limpa e adiciona código DDI 55');

console.log('🎉 Todos os testes de whatsappFormatter passaram com sucesso!\n');
