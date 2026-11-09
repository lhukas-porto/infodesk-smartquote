import assert from 'assert';
import { extractStoreNameFromUrl, isUrlConsistentWithSupplier } from '../utils/aiEmailParser';
import { getLearnedSupplierForUrl, learnSupplier } from '../services/supplierLearningService';

console.log('🧪 [TESTE] Iniciando validação de Fornecedores e Imagens Web...');

// 1. Reconhecimento imediato de lojas canônicas sem contaminação
assert.strictEqual(extractStoreNameFromUrl('www.mercadolivre.com.br'), 'Mercado Livre');
assert.strictEqual(extractStoreNameFromUrl('https://www.mercadolivre.com.br'), 'Mercado Livre');
assert.strictEqual(extractStoreNameFromUrl('www.comprasparaguai.com.br'), 'Compras Paraguai');
assert.strictEqual(extractStoreNameFromUrl('https://www.comprasparaguai.com.br/smartphone-samsung-galaxy-s24/'), 'Compras Paraguai');
assert.strictEqual(extractStoreNameFromUrl('www.lojasparaguai.com.br'), 'Lojas Paraguai');
assert.strictEqual(extractStoreNameFromUrl('casanissei.com/br/eletronicos'), 'Casa Nissei');
assert.strictEqual(extractStoreNameFromUrl('cellshop.com/br/smartphones'), 'Cellshop');
assert.strictEqual(extractStoreNameFromUrl('balaodainformatica.com.br/produto/123'), 'Balão da Informática');
assert.strictEqual(extractStoreNameFromUrl('gkinfostore.com.br/teclado'), 'GK Info Store');
assert.strictEqual(extractStoreNameFromUrl('patoloco.com.br/mouse'), 'Patoloco');
console.log('✅ 1. Todas as lojas canônicas e agregadores do Paraguai reconhecidos instantaneamente.');

// 2. Proteção canônica contra contaminação por marcas de fabricantes ou termos genéricos
learnSupplier('https://www.comprasparaguai.com.br/smartphone-samsung-galaxy-s24/', 'Samsung');
assert.strictEqual(extractStoreNameFromUrl('www.comprasparaguai.com.br'), 'Compras Paraguai');

learnSupplier('https://www.comprasparaguai.com.br/outro-item', 'Fornecedor Web / Mercado');
assert.strictEqual(extractStoreNameFromUrl('www.comprasparaguai.com.br'), 'Compras Paraguai');

learnSupplier('https://www.mercadolivre.com.br/iphone-15', 'Apple');
assert.strictEqual(extractStoreNameFromUrl('www.mercadolivre.com.br'), 'Mercado Livre');
console.log('✅ 2. Imunidade canônica ativa: marcas e termos genéricos não contaminam domínios de lojas.');

// 3. Consistência entre URLs sem protocolo
assert.strictEqual(isUrlConsistentWithSupplier('https://www.comprasparaguai.com.br/busca/?q=teste', 'Compras Paraguai'), true);
assert.strictEqual(isUrlConsistentWithSupplier('https://www.mercadolivre.com.br/p/MLB123', 'Mercado Livre'), true);
console.log('✅ 3. Consistência de fornecedor e URL validada.');

// 4. Teste de alta precisão do motor de imagens com Bing primário
import imageSearchHandler from '../../api/image-search';

async function testImageSearch() {
  let outputImages: string[] = [];
  const req = {
    headers: { origin: 'http://localhost:5173' },
    query: { q: 'Microfone sem Fio Duplo Depusheng LK2 Dinâmico Preto' }
  };
  const res = {
    status(_code: number) { return this; },
    json(data: any) { outputImages = data.images || []; },
    setHeader() {}
  };
  await imageSearchHandler(req, res);
  assert.ok(outputImages.length > 0, 'Motor de imagem deve retornar fotos reais com precisão');
  assert.ok(outputImages.some(u => u.includes('mlstatic') || u.includes('mercado') || u.includes('magazineluiza') || u.includes('mlcdn')), 'Deve conter imagens autênticas de e-commerce');
  console.log('✅ 4. Motor de busca de imagens com Bing primário retornou ' + outputImages.length + ' fotos de alta precisão!');
  console.log('🎉 Todos os testes de Fornecedores e Imagens Web passaram 100%!');
}

await testImageSearch();

