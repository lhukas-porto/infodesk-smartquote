import {
  extractModelAndPartNumberFromText,
  resolveProductModelAndPartNumber,
  generateFallbackProductCode
} from '../utils/productModelExtractor';

console.log('🧪 Iniciando testes de resolução de Modelo e Part Number (Regra do Lucas)...');

// Teste 1: Produto com modelo na própria descrição (Microfone Hollyland Lark M2S)
const test1 = resolveProductModelAndPartNumber({
  nameOrQuery: 'Microfone sem fio Hollyland Lark M2S Ultimate Combo Lightning USB-C cinza',
  brand: 'Hollyland'
});
console.log('Teste 1 (Hollyland Lark M2S):', test1);
if (!test1.model.includes('M2S') && !test1.partNumber.includes('M2S')) {
  throw new Error(`Falha no Teste 1: esperado modelo/PN com M2S, obteve: ${JSON.stringify(test1)}`);
}

// Teste 2: Produto com P/N explícito na descrição
const test2 = resolveProductModelAndPartNumber({
  nameOrQuery: 'Teclado sem fio Logitech MX Keys Mini - PN: 920-009599',
  brand: 'Logitech'
});
console.log('Teste 2 (Logitech com PN):', test2);
if (!test2.partNumber.includes('920009599')) {
  throw new Error(`Falha no Teste 2: esperado partNumber com 920009599, obteve: ${JSON.stringify(test2)}`);
}

// Teste 3: Monitor Dell com código alfanumérico P2723D
const test3 = resolveProductModelAndPartNumber({
  nameOrQuery: 'Monitor Dell 27 P2723D QHD IPS',
  brand: 'Dell'
});
console.log('Teste 3 (Dell P2723D):', test3);
if (!test3.model.includes('P2723D') || !test3.partNumber.includes('P2723D')) {
  throw new Error(`Falha no Teste 3: esperado P2723D, obteve: ${JSON.stringify(test3)}`);
}

// Teste 4: Produto sem modelo no texto, mas encontrado pelo Scanner
const test4 = resolveProductModelAndPartNumber({
  nameOrQuery: 'Microfone sem fio profissional lapela',
  scannerModel: 'Lark 150',
  scannerPartNumber: 'HL-LARK150'
});
console.log('Teste 4 (Achado no scanner):', test4);
if (test4.partNumber !== 'HLLARK150' || test4.model !== 'Lark 150') {
  throw new Error(`Falha no Teste 4: esperado HLLARK150 e Lark 150, obteve: ${JSON.stringify(test4)}`);
}

// Teste 5: Produto totalmente genérico sem modelo e sem scanner -> Gera Fallback
const test5 = resolveProductModelAndPartNumber({
  nameOrQuery: 'Cabo de aço galvanizado 1/8 polegada 30 metros',
  brand: 'Genérica',
  category: 'Construção, Acabamento & Marcenaria'
});
console.log('Teste 5 (Fallback inteligente):', test5);
if (!test5.partNumber || test5.source !== 'fallback_generated') {
  throw new Error(`Falha no Teste 5: esperado fallback_generated, obteve: ${JSON.stringify(test5)}`);
}

console.log('✅ Todos os testes de resolução de modelo e part number passaram com sucesso!');
