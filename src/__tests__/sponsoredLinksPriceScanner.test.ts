import assert from 'node:assert';
import {
  enrichProductHeuristically,
  phase1DiscoverProductsFromText
} from '../services/priceScannerService';

console.log('🧪 Iniciando testes de captura de preços reais e eliminação do valor arbitrário R$ 65,00...');

// Teste 1: Produtos variados (mobília, utensílios, ferramentas) NÃO recebem mais 65.00 nem 55.00
const testItems = [
  'armário de aço tipo roupeiro com 9 portas de abrir',
  'poltrona duck infantil',
  'bowl quadrado 25cm melamina',
  'travessa 31x25cm marca germer',
  'mesa de trabalho alberflex twist branca',
  'painéis sensoriais kit criatividade'
];

testItems.forEach(item => {
  const enriched = enrichProductHeuristically(item, 1);
  assert.strictEqual(
    enriched.costPrice,
    0,
    `Falha: item "${item}" deveria ter costPrice = 0 (sem preço arbitrário), mas recebeu ${enriched.costPrice}`
  );
  assert.strictEqual(
    enriched.suggestedPrice,
    0,
    `Falha: item "${item}" deveria ter suggestedPrice = 0, mas recebeu ${enriched.suggestedPrice}`
  );
});
console.log('  ✅ 1. Nenhum item genérico recebe valor padrão arbitrário de R$ 65,00 ou R$ 55,00.');

// Teste 2: Produtos na Fase 1 em fallback local inicializam com costPrice 0 e não 65.00
async function runPhase1Test() {
  const discovered = await phase1DiscoverProductsFromText('poltrona duck infantil');
  assert(discovered.length > 0, 'Deveria descobrir pelo menos 1 produto');
  assert.notStrictEqual(
    discovered[0].costPrice,
    65.00,
    'Falha: costPrice não pode ser 65.00 arbitrário'
  );
  assert.strictEqual(
    discovered[0].costPrice,
    0,
    `costPrice inicial deve ser 0 quando ainda não cotado, obtido: ${discovered[0].costPrice}`
  );
  console.log('  ✅ 2. Fase 1 inicializa itens sem cotação com costPrice = 0 para aguardar apuração em links patrocinados.');
}

runPhase1Test().then(() => {
  console.log('🎉 TODOS OS TESTES DE ELIMINAÇÃO DO VALOR 65,00 PASSARAM COM 100% DE SUCESSO!\n');
}).catch(err => {
  console.error('❌ Falha nos testes:', err);
  process.exit(1);
});
