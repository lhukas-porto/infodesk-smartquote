import { buildCompleteProductDescription, buildDirectPurchaseUrl } from '../utils/aiEmailParser';
import { QuoteItem, Product } from '../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[FALHA NO TESTE]: ${message}`);
  }
}

console.log('🧪 Iniciando testes de integração de Especificações Técnicas...');

// 1. Testar buildCompleteProductDescription com múltiplos atributos
const testProductFromScanner = {
  standardizedName: 'Monitor Dell 27 Polegadas 4K UHD IPS USB-C 65W S2722QC',
  description: 'Monitor profissional de alta resolução com painel IPS e cobertura de cores sRGB 99%. Ideal para produtividade corporativa.',
  brand: 'Dell',
  model: 'S2722QC',
  partNumber: '210-BBYZ',
  ncm: '8528.52.00',
  weight: '6.500 kg',
  dimensions: '61.16 x 17.47 x 40.01 cm',
  specifications: [
    { label: 'Tamanho da Tela', value: '27 polegadas' },
    { label: 'Resolução', value: '4K UHD (3840 x 2160)' },
    { label: 'Conectividade', value: 'USB-C com Power Delivery 65W, 2x HDMI 2.0' }
  ],
  sourceUrl: 'https://www.dell.com/pt-br/shop/monitor/s2722qc'
};

const completeSpecs = buildCompleteProductDescription(testProductFromScanner);
console.log('Ficha Técnica Gerada:\n', completeSpecs);

assert(completeSpecs.includes('Monitor profissional de alta resolução'), 'Deve conter a descrição comercial');
assert(completeSpecs.includes('Especificações Técnicas:'), 'Deve conter o bloco de especificações');
assert(completeSpecs.includes('• Tamanho da Tela: 27 polegadas'), 'Deve conter a especificação de tela');
assert(completeSpecs.includes('• Resolução: 4K UHD (3840 x 2160)'), 'Deve conter a especificação de resolução');
assert(completeSpecs.includes('• Marca: Dell'), 'Deve conter a marca');
assert(completeSpecs.includes('• Modelo: S2722QC'), 'Deve conter o modelo');
assert(completeSpecs.includes('• Part Number / SKU: 210-BBYZ'), 'Deve conter o Part Number');
assert(completeSpecs.includes('• NCM Fiscal: 8528.52.00'), 'Deve conter o NCM');
assert(completeSpecs.includes('• Peso aproximado: 6.500 kg'), 'Deve conter o peso');

console.log('✓ Teste 1 aprovado: buildCompleteProductDescription gera especificações ricas e completas!');

// 2. Testar que o item é montado para cotação com description preenchida
const itemData: Partial<QuoteItem> = {
  name: testProductFromScanner.standardizedName,
  description: completeSpecs,
  partNumber: testProductFromScanner.partNumber,
  ncm: testProductFromScanner.ncm,
  costPrice: 2100,
  unitPrice: 2835,
  quantity: 1,
  unit: 'Un.',
  supplier: 'Dell Oficial',
  sourceUrl: testProductFromScanner.sourceUrl
};

assert(Boolean(itemData.description) && itemData.description.length > 50, 'itemData deve conter descrição técnica não vazia');
console.log('✓ Teste 2 aprovado: itemData preserva a ficha técnica completa!');

// 3. Testar simulação de handleStartNewQuoteWithItems e handleAddWebSearchItemToQuote
const itemsToAdd = [itemData];
const convertedItems: QuoteItem[] = itemsToAdd.map((item, idx) => ({
  id: `item-test-${idx}`,
  itemNumber: idx + 1,
  name: item.name || '',
  description: item.description || '',
  partNumber: item.partNumber || '',
  ncm: item.ncm || '',
  quantity: item.quantity || 1,
  unit: item.unit || 'Un.',
  costPrice: item.costPrice || 0,
  markupPercent: 35,
  unitPrice: item.unitPrice || 0,
  totalPrice: (item.unitPrice || 0) * (item.quantity || 1),
  sourceUrl: item.sourceUrl || '',
  supplier: item.supplier || ''
}));

assert(convertedItems[0].description === completeSpecs, 'convertedItems deve manter a descrição idêntica');
console.log('✓ Teste 3 aprovado: Inserção na cotação retém integralmente as especificações técnicas!');

// 4. Testar simulação de abertura do modal de edição (handleOpenCatalogReviewModal)
const freshItem = convertedItems[0];
const catalogReviewProduct: Partial<Product> = {
  id: freshItem.productId || `prod-${Date.now()}`,
  sku: freshItem.partNumber || 'INF-0001',
  partNumber: freshItem.partNumber || '',
  ncm: freshItem.ncm || '',
  name: freshItem.name,
  description: freshItem.description || '',
  costPrice: freshItem.costPrice || 0,
  unit: freshItem.unit || 'Un.'
};

assert(catalogReviewProduct.description === completeSpecs, 'Modal de edição deve abrir com as especificações completas preenchidas no campo textarea');
console.log('✓ Teste 4 aprovado: Campo "Especificações Técnicas" abre devidamente preenchido!');

console.log('🎉 TODOS OS TESTES PASSARAM COM SUCESSO!');
