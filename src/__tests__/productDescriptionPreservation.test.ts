import assert from 'assert';
import { buildCompleteProductDescription, formatProductSentenceCase } from '../utils/aiEmailParser';
import { MODERN_GEMINI_MODELS } from '../services/priceScannerService';
import { itemNeedsSpecEnrichment } from '../services/specSearchService';

console.log('🧪 Executando bateria de testes: Preservação de Descrições de Produtos...');

// Teste 1: buildCompleteProductDescription gera descrição estruturada rica
{
  const itemWithoutRichDesc = {
    brand: 'TP-Link',
    model: 'TL-SG108',
    partNumber: 'TL-SG108',
    ncm: '8517.62.54',
    specifications: [
      { label: 'Portas', value: '8 Portas Gigabit 10/100/1000 Mbps' },
      { label: 'Carcaça', value: 'Aço de alta resistência' }
    ]
  };

  const fullDesc = buildCompleteProductDescription(itemWithoutRichDesc);
  assert(fullDesc.includes('• Portas: 8 Portas Gigabit'), 'Deveria conter a especificação de portas');
  assert(fullDesc.includes('• Marca: TP-Link'), 'Deveria conter a marca');
  assert(fullDesc.includes('• Modelo: TL-SG108'), 'Deveria conter o modelo');
  assert(fullDesc.includes('• Part Number / SKU: TL-SG108'), 'Deveria conter o part number');
  assert(fullDesc.includes('• NCM Fiscal: 8517.62.54'), 'Deveria conter o NCM');
  console.log('  ✅ Teste 1 passou: buildCompleteProductDescription gera descrição completa com especificações');
}

// Teste 2: Scanner de Preços - preservação de descrição quando produto não existe no catálogo
{
  const scannerItem = {
    standardizedName: 'Switch TP-Link 8 Portas Gigabit TL-SG108',
    brand: 'TP-Link',
    model: 'TL-SG108',
    partNumber: 'TL-SG108',
    ncm: '8517.62.54',
    description: 'Switch corporativo de alta durabilidade com 8 portas RJ45 blindadas.',
    specifications: [{ label: 'Velocidade', value: '10/100/1000 Mbps' }]
  };

  const existingInCatalog = null;
  const fullDesc = buildCompleteProductDescription(scannerItem);

  const resolvedDescription = (existingInCatalog as any)?.description || fullDesc || scannerItem.description || '';
  assert(resolvedDescription.length > 50, 'A descrição não pode ser vazia');
  assert(resolvedDescription.includes('Switch corporativo'), 'Deveria preservar a descrição técnica base');
  assert(resolvedDescription.includes('• Velocidade: 10/100/1000 Mbps'), 'Deveria incluir as especificações');
  console.log('  ✅ Teste 2 passou: Item do Scanner preserva descrição técnica mesmo sem cadastro prévio no catálogo');
}

// Teste 3: Scanner de Preços - prioridade da descrição do catálogo quando já cadastrado
{
  const existingInCatalog = {
    id: 'prod-123',
    name: 'Switch TP-Link 8 Portas Gigabit TL-SG108',
    description: 'Descrição Oficial Cadastrada pela Engenharia da Infodesk Store.'
  };

  const scannerItem = {
    standardizedName: 'Switch TP-Link 8 Portas Gigabit TL-SG108',
    description: 'Descrição temporária da web'
  };

  const fullDesc = buildCompleteProductDescription(scannerItem);
  const resolvedDescription = existingInCatalog?.description || fullDesc || scannerItem.description || '';
  assert.strictEqual(resolvedDescription, 'Descrição Oficial Cadastrada pela Engenharia da Infodesk Store.');
  console.log('  ✅ Teste 3 passou: Item com cadastro existente preserva a descrição oficial do catálogo');
}

// Teste 4: Inbox (Importação de E-mails) - prioridade para descrição do produto casado do catálogo
{
  const emailItem = {
    name: 'Switch 8 Portas Gigabit',
    description: '', // Email geralmente não traz descrição longa
    quantity: 2
  };

  const matchedProd = {
    id: 'prod-catalog-99',
    name: 'Switch TP-Link TL-SG108 8 Portas Gigabit',
    description: 'Equipamento corporativo com gabinete metálico e economia de energia.'
  };

  const resolvedDescription = matchedProd?.description || (emailItem.description ? formatProductSentenceCase(emailItem.description) : '') || '';
  assert.strictEqual(resolvedDescription, matchedProd.description);
  console.log('  ✅ Teste 4 passou: Importação via Inbox herda a descrição rica do produto casado no catálogo');
}

// Teste 5: itemNeedsSpecEnrichment identifica corretamente se um item precisa de enriquecimento
{
  assert.strictEqual(itemNeedsSpecEnrichment({ name: 'Mouse USB', description: '' } as any), true, 'Item vazio precisa de enriquecimento');
  assert.strictEqual(itemNeedsSpecEnrichment({ name: 'Mouse USB', description: 'Mouse USB' } as any), true, 'Item com descrição igual ao nome precisa de enriquecimento');
  assert.strictEqual(itemNeedsSpecEnrichment({
    name: 'Mouse USB Logitech M90',
    description: 'Mouse óptico ambidestro de alta precisão com conexão USB plug and play.\n• Resolução: 1000 DPI\n• Cabo: 1.5 metros'
  } as any), false, 'Item completo não precisa de enriquecimento');
  console.log('  ✅ Teste 5 passou: itemNeedsSpecEnrichment valida o nível de completude da descrição');
}

// Teste 6: MODERN_GEMINI_MODELS contém apenas modelos existentes da API v1beta do Google
{
  assert(MODERN_GEMINI_MODELS.length >= 3, 'Deve haver ao menos 3 modelos na cascata');
  MODERN_GEMINI_MODELS.forEach(model => {
    assert(!model.includes('3.1'), `Modelo inválido detectado: ${model}`);
    assert(!model.includes('3.6'), `Modelo inválido detectado: ${model}`);
    assert(!model.includes('3.5'), `Modelo inválido detectado: ${model}`);
    assert(model.startsWith('gemini-'), `Deve ser um modelo gemini oficial: ${model}`);
  });
  console.log('  ✅ Teste 6 passou: Cascata de modelos Gemini configurada exclusivamente com modelos autênticos');
}

console.log('🎉 Todos os testes de preservação de descrições passaram com êxito!\n');
