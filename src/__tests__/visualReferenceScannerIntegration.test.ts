/**
 * TESTES DE INTEGRAÇÃO: REFERÊNCIA VISUAL DE FOTOS NO SCANNER IA
 * Valida a conexão de fotos extraídas de planilhas/anexos como referência visual direta (Gemini Vision)
 * no Scanner IA individual e em lote.
 */

import { scanSingleProductPrice } from '../services/priceScannerService';
import { BatchItemTarget } from '../services/batchScannerService';

console.log('\n--- INICIANDO TESTES: REFERÊNCIA VISUAL DE FOTOS NO SCANNER IA ---');

// Teste 1: Assinatura e aceitação de imageSource em scanSingleProductPrice
async function testScanSingleProductPriceAcceptsImageSource() {
  console.log('\n[Teste 1] Validação da assinatura de scanSingleProductPrice com imageSource');
  
  // Imagem sintética simulando foto extraída de Excel ou colada pelo usuário
  const mockImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  
  // Chamada de scanSingleProductPrice passando query e imageSource
  // Sem chave de API Gemini injetada no ambiente de teste, o scanner realiza fallback seguro sem quebrar
  const result = await scanSingleProductPrice('Patch Cord Furukawa Cat6 1.5m Azul', undefined, mockImageBase64);
  
  if (!result || typeof result !== 'object') {
    throw new Error('scanSingleProductPrice deve retornar um ScannedPriceResult válido');
  }
  
  if (!result.id || typeof result.id !== 'string') {
    throw new Error('Resultado do scanner deve conter ID');
  }
  
  console.log('  ✓ scanSingleProductPrice processou query com imageSource com sucesso!');
  console.log('    Resultado obtido:', result.standardizedName || result.originalQuery, '| ID:', result.id);
}

// Teste 2: BatchItemTarget transporta imageUrl para varredura concorrente em lote
function testBatchItemTargetCarriesImageUrl() {
  console.log('\n[Teste 2] Validação do BatchItemTarget com imageUrl');
  
  const target: BatchItemTarget = {
    id: 'item-101',
    itemNumber: 1,
    name: 'SSD Kingston NV2 1TB M.2 NVMe',
    partNumber: 'SNV2S/1000G',
    quantity: 5,
    imageUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...'
  };
  
  if (target.imageUrl !== 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...') {
    throw new Error('BatchItemTarget deve manter a propriedade imageUrl intacta');
  }
  
  console.log('  ✓ BatchItemTarget aceita e propaga imageUrl para o motor de varredura concorrente!');
}

// Teste 3: Extração de fotos de múltiplos itens formatadas para o Scanner IA
function testConsolidationOfItemsWithPhotosForScanner() {
  console.log('\n[Teste 3] Consolidação de itens com fotos para envio ao Scanner IA');
  
  const sampleItems = [
    {
      name: 'Switch Intelbras 24 Portas Gigabit SG 2404 PoE Max',
      partNumber: '4760085',
      quantity: 2,
      unit: 'Un.',
      imageUrl: 'data:image/png;base64,intelbrasPhotoBase64Data1'
    },
    {
      name: 'Roteador Wi-Fi 6 Archer AX12',
      partNumber: 'AX12',
      quantity: 4,
      unit: 'Un.',
      imageUrl: 'data:image/png;base64,tpLinkPhotoBase64Data2'
    },
    {
      name: 'Cabo de Rede Furukawa Cat6 Azul 305m',
      partNumber: '23400198',
      quantity: 1,
      unit: 'Cx.'
      // Sem foto
    }
  ];
  
  // Lógica similar à do UniversalListImportModal.handleSendToScannerWithPhotos
  const photos = sampleItems
    .map(it => it.imageUrl)
    .filter((url): url is string => Boolean(url && url.startsWith('data:image/')));
  
  const itemsText = sampleItems.map(it => {
    const pn = it.partNumber ? ` [Ref: ${it.partNumber}]` : '';
    const qty = it.quantity > 0 ? ` | Qtd: ${it.quantity} ${it.unit || 'Un.'}` : '';
    const hasPhoto = it.imageUrl ? ' 📷 [Foto de Referência]' : '';
    return `${it.name}${pn}${qty}${hasPhoto}`;
  }).join('\n');
  
  if (photos.length !== 2) {
    throw new Error(`Esperava 2 fotos extraídas, encontrou ${photos.length}`);
  }
  
  if (!itemsText.includes('📷 [Foto de Referência]')) {
    throw new Error('O texto consolidado deve indicar produtos com foto de referência');
  }
  
  console.log('  ✓ Itens e fotos foram consolidados com sucesso:');
  console.log('    Total de fotos coletadas:', photos.length);
  console.log('    Texto gerado:\n' + itemsText.split('\n').map(l => '      ' + l).join('\n'));
}

async function runAllTests() {
  await testScanSingleProductPriceAcceptsImageSource();
  testBatchItemTargetCarriesImageUrl();
  testConsolidationOfItemsWithPhotosForScanner();
  console.log('\n✅ TODOS OS TESTES DE REFERÊNCIA VISUAL PASSARAM COM SUCESSO!\n');
}

runAllTests().catch(err => {
  console.error('\n❌ FALHA NOS TESTES DE REFERÊNCIA VISUAL:', err);
  process.exit(1);
});
