import assert from 'assert';
import { sanitizeSupplierName, resolveSupplierName } from '../utils/aiEmailParser';

console.log('🧪 Iniciando testes de sanitização e resolução de fornecedor...');

// 1. Termos genéricos devem retornar string vazia ""
const genericTerms = [
  'Genérica',
  'generica',
  'Genérico',
  'generico',
  'Marca Genérica',
  'marca generica',
  'Fornecedor Genérico',
  'fornecedor generico',
  'Loja Genérica',
  'loja generica',
  'Fornecedor Local',
  'E-commerce Nacional',
  'Mercado Nacional',
  'Sob Consulta',
  'Não Informado',
  'Não localizada',
  'N/A',
  'N/D',
  'Fabricante Nacional / Importado',
  'Nome da Loja',
  'Sem marca',
  'Sem fornecedor',
  'undefined',
  'null',
  '',
  '   '
];

for (const term of genericTerms) {
  assert.strictEqual(
    sanitizeSupplierName(term),
    '',
    `Esperado string vazia para "${term}", mas recebeu "${sanitizeSupplierName(term)}"`
  );
}

assert.strictEqual(sanitizeSupplierName(undefined), '');
assert.strictEqual(sanitizeSupplierName(null), '');
console.log('  ✅ 1. Termos genéricos e ausentes convertidos para string vazia com 100% de precisão');

// 2. Fornecedores e lojas reais devem ser preservados
const realStores = [
  'KaBuM!',
  'Mercado Livre',
  'Amazon',
  'Kalunga',
  'Dell',
  'Van De Velde Oficial',
  'Magazine Luiza',
  'Gimba',
  'Corfio'
];

for (const store of realStores) {
  assert.strictEqual(
    sanitizeSupplierName(store),
    store,
    `Esperado preservar "${store}", mas recebeu "${sanitizeSupplierName(store)}"`
  );
}
console.log('  ✅ 2. Lojas e distribuidores autênticos preservados intactos');

// 3. resolveSupplierName não deve devolver "Fornecedor Local" nem "Genérica"
const resVazio = resolveSupplierName({
  name: 'Cabo Flexível 2.5mm',
  supplier: 'Genérica'
});
assert.strictEqual(resVazio, '', 'resolveSupplierName deve retornar "" para supplier genérico');

const resSemFornecedor = resolveSupplierName({
  name: 'Ventosa Dupla para Vidro',
  supplier: ''
});
assert.strictEqual(resSemFornecedor, '', 'resolveSupplierName deve retornar "" quando não houver loja');
console.log('  ✅ 3. resolveSupplierName retorna string vazia quando não há fornecedor concreto');

// 4. resolveSupplierName a partir de links diretos
const resKabum = resolveSupplierName({
  sourceUrl: 'https://www.kabum.com.br/produto/12345/ssd-kingston'
});
assert.strictEqual(resKabum, 'KaBuM!');

const resAmazon = resolveSupplierName({
  sourceUrl: 'https://www.amazon.com.br/dp/B08N5WRWNW'
});
assert.strictEqual(resAmazon, 'Amazon');
console.log('  ✅ 4. resolveSupplierName identifica lojas a partir de URLs válidas');

console.log('🎉 TODOS OS TESTES DE SANITIZAÇÃO DE FORNECEDOR PASSARAM COM SUCESSO!\n');
