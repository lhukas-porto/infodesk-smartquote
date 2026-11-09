import { strict as assert } from 'node:assert';
import { auditQuote } from '../components/QuoteAuditModal';
import { buildSingleItemWhatsAppText, buildWhatsAppQuoteMessage } from '../utils/whatsappFormatter';
import { Quote } from '../types';

console.log('🧪 Iniciando testes de validação de produto com preço zerado (R$ 0,00)...');

const mockQuoteWithZeroPrice = {
  id: 'q-test-zero',
  code: 'COT-2026-TEST',
  clientCompany: 'Cliente Teste LTDA',
  contactPerson: 'João Comprador',
  clientEmail: 'joao@cliente.com',
  date: '09/11/2026',
  items: [
    {
      id: 'it-1',
      itemNumber: 1,
      name: 'Item Disponível',
      description: '',
      markupPercent: 35,
      quantity: 1,
      unit: 'Un.',
      costPrice: 100,
      unitPrice: 150,
      totalPrice: 150,
      showImage: false
    },
    {
      id: 'it-2',
      itemNumber: 2,
      name: 'Item Indisponível no Mercado',
      description: '',
      markupPercent: 0,
      quantity: 1,
      unit: 'Un.',
      costPrice: 0,
      unitPrice: 0,
      totalPrice: 0,
      showImage: false
    }
  ],
  totalAmount: 150,
  totalCost: 100,
  averageMargin: 35
} as unknown as Quote;

// 1. Teste de Auditoria de Cotação
const auditIssues = auditQuote(mockQuoteWithZeroPrice);
const criticalIssues = auditIssues.filter(i => i.type === 'critical');

assert.equal(criticalIssues.length, 0, 'Não deve haver issues críticas bloqueando o envio de item zerado');
console.log('  ✅ Auditoria: Nenhum bloqueio crítico para produto com preço zerado.');

// 2. Teste do WhatsApp Formatter para Item Avulso com Preço 0
const singleItemText = buildSingleItemWhatsAppText({
  name: 'Produto Indisponível',
  quantity: 2,
  unit: 'peças',
  unitPrice: 0,
  totalPrice: 0
});

assert.ok(singleItemText.includes('*Unitário:* R$ 0,00/peças'), 'Deve conter valor unitário R$ 0,00');
assert.ok(singleItemText.includes('*Total:* R$ 0,00'), 'Deve conter total R$ 0,00');
console.log('  ✅ WhatsApp Avulso: Exibe perfeitamente Unitário R$ 0,00 e Total R$ 0,00.');

// 3. Teste do WhatsApp Formatter Geral
const fullWhatsApp = buildWhatsAppQuoteMessage(mockQuoteWithZeroPrice, {
  representativeName: 'Lucas Porto',
  companyName: 'Infodesk',
  phone: '61999999999'
} as any);

assert.ok(fullWhatsApp.includes('Item Indisponível no Mercado'), 'Deve conter o nome do item');
assert.ok(fullWhatsApp.includes('*Unit:* R$ 0,00'), 'Deve conter Unit: R$ 0,00 na lista geral');
assert.ok(fullWhatsApp.includes('*Subtotal:* R$ 0,00'), 'Deve conter Subtotal: R$ 0,00 na lista geral');
console.log('  ✅ WhatsApp Proposta Completa: Formata item zerado corretamente sem quebras.');

console.log('🎉 Todos os testes de liberação de preço zerado passaram com 100% de sucesso!');
