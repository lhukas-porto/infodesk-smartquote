/**
 * TESTE DO COMPORTAMENTO PADRÃO DE FRETE PARA BRASÍLIA
 * Diretriz do Lucas: "Toda vez que o lugar de entrega for Brasília, o frete, a opção de exibir frete na proposta, vem desmarcado."
 */

import { isBrasiliaDelivery, shouldDisplayShippingInProposal } from '../utils/aiEmailParser';

console.log('--- Testando Comportamento de Frete Desmarcado para Brasília ---');

// Teste 1: Validação de localidades do Distrito Federal / Brasília
const brasiliaVariants = [
  'Brasília',
  'Brasília - DF',
  'brasilia',
  'BRASILIA - DF',
  'Brasília/DF',
  'Taguatinga',
  'Asa Sul',
  'Asa Norte',
  'Águas Claras',
  'Guará - DF',
  'DF',
  'BSB',
  '',
  undefined,
  null
];

for (const variant of brasiliaVariants) {
  const isBsb = isBrasiliaDelivery(variant);
  if (!isBsb) {
    throw new Error(`Falha no Teste 1: "${variant}" deveria ser identificado como entrega em Brasília/DF`);
  }
}
console.log('✅ Teste 1 passou: Todas as variações de Brasília/DF identificadas corretamente!');

// Teste 2: Validação de localidades de fora do Distrito Federal
const foraDeBrasilia = [
  'São Paulo - SP',
  'Belo Horizonte - MG',
  'Goiânia - GO',
  'Rio de Janeiro - RJ',
  'Curitiba - PR',
  'Joinville - SC',
  'Coronel Fabriciano - MG'
];

for (const loc of foraDeBrasilia) {
  const isBsb = isBrasiliaDelivery(loc);
  if (isBsb) {
    throw new Error(`Falha no Teste 2: "${loc}" NÃO deveria ser identificado como Brasília`);
  }
}
console.log('✅ Teste 2 passou: Localidades fora de Brasília/DF identificadas corretamente!');

// Teste 3: shouldDisplayShippingInProposal para Brasília sem override manual (deve ser false / desmarcado)
const quoteBrasiliaDefault = {
  city: 'Brasília',
  deliveryLocation: 'Brasília - DF',
  shippingTerms: 'Frete incluso p/ Brasília - DF.'
};

if (shouldDisplayShippingInProposal(quoteBrasiliaDefault) !== false) {
  throw new Error('Falha no Teste 3: Cotação para Brasília deveria ter frete desmarcado por padrão (false)');
}
console.log('✅ Teste 3 passou: Frete desmarcado por padrão para entrega em Brasília!');

// Teste 4: shouldDisplayShippingInProposal para fora de Brasília (deve ser true / marcado)
const quoteSpDefault = {
  city: 'Brasília',
  deliveryLocation: 'São Paulo - SP',
  shippingTerms: 'Frete incluso p/ São Paulo - SP.'
};

if (shouldDisplayShippingInProposal(quoteSpDefault) !== true) {
  throw new Error('Falha no Teste 4: Cotação fora de Brasília deveria ter frete marcado por padrão (true)');
}
console.log('✅ Teste 4 passou: Frete marcado por padrão para entregas fora de Brasília!');

// Teste 5: Respeito à decisão explícita do Lucas (override manual)
// Se o Lucas marcar o checkbox manualmente para Brasília, a escolha dele é respeitada:
const quoteBrasiliaExplicitTrue = {
  city: 'Brasília',
  deliveryLocation: 'Brasília - DF',
  shippingTerms: 'Frete incluso p/ Brasília - DF.',
  showShippingInProposal: true
};
if (shouldDisplayShippingInProposal(quoteBrasiliaExplicitTrue) !== true) {
  throw new Error('Falha no Teste 5.1: Se o usuário marcou explicitamente true para Brasília, deve exibir!');
}

// Se o Lucas desmarcar para fora de Brasília:
const quoteSpExplicitFalse = {
  city: 'Brasília',
  deliveryLocation: 'São Paulo - SP',
  shippingTerms: 'Frete incluso p/ São Paulo - SP.',
  showShippingInProposal: false
};
if (shouldDisplayShippingInProposal(quoteSpExplicitFalse) !== false) {
  throw new Error('Falha no Teste 5.2: Se o usuário desmarcou explicitamente false para SP, não deve exibir!');
}
console.log('✅ Teste 5 passou: Overrides manuais do usuário são respeitados com 100% de prioridade!');

console.log('🎉 TODOS OS TESTES DE FRETE DESMARCADO PARA BRASÍLIA PASSARAM COM SUCESSO!\n');
