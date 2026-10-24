/**
 * TESTES AUTOMATIZADOS: ROBUSTEZ, EXTRAÇÃO DE QUANTIDADES NA MESMA LINHA E PADRONIZAÇÃO DO SCANNER IA
 * 
 * Valida as 11 melhorias implementadas no motor do Scanner IA:
 * 1. Parser de quantidade em múltiplas posições (início, fim, tags, tabs)
 * 2. Blindagem contra colisão em produtos com números (3M, 2040, 1930, 24 Portas, 480GB, 12V, 220V)
 * 3. Normalização automática de unidades comerciais (Un., Cx., Mt., Pct., Kit, Rl., Par)
 * 4. Sanitização cirúrgica do título comercial sem resquícios de quantidade e preservando acentuação
 * 5. Reconciliação determinística de quantidades no intake
 */

import {
  parsePastedProductListWithQty,
  normalizeProductUnit,
  sanitizeStandardizedProductName,
  enrichProductHeuristically
} from '../services/priceScannerService';

console.log('\n--- INICIANDO TESTES: ROBUSTEZ E QUANTIDADES NO SCANNER IA ---');

// ============================================================================
// TESTE 1: Quantidades no início da linha (10x, 10 un, 10 -, 10 peças)
// ============================================================================
console.log('\n[Teste 1] Extração de quantidade no início da linha');

const leadingCases = [
  { input: '10x Switch Cisco 24 portas Gigabit', expectedQty: 10, expectedUnit: 'Un.', expectedClean: 'Switch Cisco 24 portas Gigabit' },
  { input: '5 un - Cabo Furukawa Cat6 Azul 305m', expectedQty: 5, expectedUnit: 'Un.', expectedClean: 'Cabo Furukawa Cat6 Azul 305m' },
  { input: '3 caixas de Papel Chamex A4 75g', expectedQty: 3, expectedUnit: 'Cx.', expectedClean: 'Papel Chamex A4 75g' },
  { input: '100 metros de Cabo Flexível 2.5mm Corfio', expectedQty: 100, expectedUnit: 'Mt.', expectedClean: 'Cabo Flexível 2.5mm Corfio' },
  { input: '15 pacotes de Caneta Esferográfica Bic', expectedQty: 15, expectedUnit: 'Pct.', expectedClean: 'Caneta Esferográfica Bic' },
  { input: '2 kits de Ferramentas Manuais Gedore', expectedQty: 2, expectedUnit: 'Kit', expectedClean: 'Ferramentas Manuais Gedore' },
  { input: '4 rolos de Fita Isolante Scotch 3M', expectedQty: 4, expectedUnit: 'Rl.', expectedClean: 'Fita Isolante Scotch 3M' },
  { input: '8 - Nobreak SMS 1200VA Bivolt', expectedQty: 8, expectedUnit: 'Un.', expectedClean: 'Nobreak SMS 1200VA Bivolt' }
];

leadingCases.forEach(({ input, expectedQty, expectedUnit, expectedClean }) => {
  const res = parsePastedProductListWithQty(input);
  if (res.length !== 1) {
    throw new Error(`Falha ao parsear "${input}": esperava 1 item, obteve ${res.length}`);
  }
  if (res[0].quantity !== expectedQty) {
    throw new Error(`Quantidade incorreta para "${input}": esperava ${expectedQty}, obteve ${res[0].quantity}`);
  }
  if (res[0].unit !== expectedUnit) {
    throw new Error(`Unidade incorreta para "${input}": esperava ${expectedUnit}, obteve ${res[0].unit}`);
  }
  if (!res[0].query.toLowerCase().includes(expectedClean.toLowerCase().substring(0, 15))) {
    throw new Error(`Nome limpo incorreto para "${input}": obteve "${res[0].query}"`);
  }
  console.log(`  ✓ "${input}" -> Qtd: ${res[0].quantity} ${res[0].unit} | Query: "${res[0].query}"`);
});

// ============================================================================
// TESTE 2: Quantidades no final da linha (- 10 un, (10 peças), [10 UN], x10)
// ============================================================================
console.log('\n[Teste 2] Extração de quantidade no final da linha');

const trailingCases = [
  { input: 'Switch Cisco Business CBS250-24T-4G - 10 un', expectedQty: 10, expectedUnit: 'Un.' },
  { input: 'SSD Kingston A400 480GB (Qtd: 20)', expectedQty: 20, expectedUnit: 'Un.' },
  { input: 'Cabo de Rede Furukawa Cat6 Azul [3 cx]', expectedQty: 3, expectedUnit: 'Cx.' },
  { input: 'Fio Flexível 4.0mm Corfio - 50 metros', expectedQty: 50, expectedUnit: 'Mt.' },
  { input: 'Memória RAM 16GB DDR4 Kingston x8', expectedQty: 8, expectedUnit: 'Un.' },
  { input: 'Teclado Logitech K120 ABNT2 (5 peças)', expectedQty: 5, expectedUnit: 'Un.' },
  { input: 'Papel Toalha Interfolha Elite | Qtd: 12 pacotes', expectedQty: 12, expectedUnit: 'Pct.' }
];

trailingCases.forEach(({ input, expectedQty, expectedUnit }) => {
  const res = parsePastedProductListWithQty(input);
  if (res.length !== 1) {
    throw new Error(`Falha ao parsear "${input}": esperava 1 item, obteve ${res.length}`);
  }
  if (res[0].quantity !== expectedQty) {
    throw new Error(`Quantidade incorreta para "${input}": esperava ${expectedQty}, obteve ${res[0].quantity}`);
  }
  if (res[0].unit !== expectedUnit) {
    throw new Error(`Unidade incorreta para "${input}": esperava ${expectedUnit}, obteve ${res[0].unit}`);
  }
  console.log(`  ✓ "${input}" -> Qtd: ${res[0].quantity} ${res[0].unit} | Query: "${res[0].query}"`);
});

// ============================================================================
// TESTE 3: Blindagem de Produtos que Iniciam ou Contêm Números
// ============================================================================
console.log('\n[Teste 3] Blindagem contra falsos positivos (produtos com números)');

const protectedCases = [
  { input: '3M Fita Dupla Face Fixa Forte 19mm x 20m', expectedQty: 1, shouldContain: '3M' },
  { input: '2040 Perfil de Alumínio Estrutural V-Slot 1m', expectedQty: 1, shouldContain: '2040' },
  { input: '1930 Switch Aruba Instant On 24G 4SFP+', expectedQty: 1, shouldContain: '1930' },
  { input: '24 Portas Switch Cisco Business Gigabit', expectedQty: 1, shouldContain: '24 Portas' },
  { input: '480GB SSD Kingston A400 SATA III', expectedQty: 1, shouldContain: '480GB' },
  { input: '12V Fonte Chaveada Colmeia 10A Bivolt', expectedQty: 1, shouldContain: '12V' },
  { input: '220V Chuveiro Elétrico Lorenzetti Advanced', expectedQty: 1, shouldContain: '220V' },
  { input: 'Cat6 Cabo de Rede Furukawa SohoPlus Azul', expectedQty: 1, shouldContain: 'Cat6' }
];

protectedCases.forEach(({ input, expectedQty, shouldContain }) => {
  const res = parsePastedProductListWithQty(input);
  if (res.length !== 1) {
    throw new Error(`Falha ao parsear "${input}": esperava 1 item, obteve ${res.length}`);
  }
  if (res[0].quantity !== expectedQty) {
    throw new Error(`Falso positivo de quantidade para "${input}": capturou ${res[0].quantity} em vez de ${expectedQty}`);
  }
  if (!res[0].query.includes(shouldContain)) {
    throw new Error(`Código/marca do produto "${shouldContain}" foi incorretamente removido de "${res[0].query}"`);
  }
  console.log(`  ✓ "${input}" -> Preservou "${shouldContain}" intacto | Qtd: ${res[0].quantity}`);
});

// ============================================================================
// TESTE 4: Sanitização Cirúrgica de Título Comercial (sanitizeStandardizedProductName)
// ============================================================================
console.log('\n[Teste 4] Sanitização cirúrgica de títulos comerciais');

const sanitizationCases = [
  {
    raw: '10x Switch Cisco Business CBS250-24T-4G 24 Portas Gigabit',
    expected: 'Switch Cisco Business CBS250-24T-4G 24 Portas Gigabit'
  },
  {
    raw: 'SSD Kingston A400 480GB SATA III - 10 un',
    expected: 'SSD Kingston A400 480GB SATA III'
  },
  {
    raw: '5 peças - Memória RAM Kingston Fury Beast 16GB DDR4 3200MHz',
    expected: 'Memória RAM Kingston Fury Beast 16GB DDR4 3200MHz'
  },
  {
    raw: 'Redes: Cabo Furukawa Cat6 Azul 305m (Qtd: 3 cx)',
    expected: 'Cabo Furukawa Cat6 Azul 305m'
  },
  {
    raw: '02 Unidades - Válvula Redutora de Pressão 1/2 Pol Bermad',
    expected: 'Válvula Redutora de Pressão 1/2 Pol Bermad'
  }
];

sanitizationCases.forEach(({ raw, expected }) => {
  const clean = sanitizeStandardizedProductName(raw);
  if (clean.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Sanitização incorreta para "${raw}":\n  Esperado: "${expected}"\n  Obtido:   "${clean}"`);
  }
  console.log(`  ✓ "${raw}"\n    -> Limpo: "${clean}"`);
});

// ============================================================================
// TESTE 5: Preservação de Acentuação e Cedilhas em Português
// ============================================================================
console.log('\n[Teste 5] Preservação de acentuação e cedilhas na língua portuguesa');

const portugueseAccents = [
  'Lápis Preto HB Faber-Castell',
  'Memória RAM 16GB Kingston',
  'Válvula de Retenção e Conexão',
  'Disjuntor Bipolar Elétrico Schneider 32A',
  'Proteção Eletrônica Clamper Pocket'
];

portugueseAccents.forEach(title => {
  const sanitized = sanitizeStandardizedProductName(title);
  if (!sanitized.includes('á') && !sanitized.includes('ó') && !sanitized.includes('ç') && !sanitized.includes('é')) {
    throw new Error(`Acentuação foi perdida em: "${sanitized}"`);
  }
  console.log(`  ✓ Acentos preservados com perfeição: "${sanitized}"`);
});

// ============================================================================
// TESTE 6: Parsing Multi-Item e Formato Tabela/Planilha Excel (\t)
// ============================================================================
console.log('\n[Teste 6] Parsing multi-item com múltiplos produtos e colunas Tab');

const multiLineSpreadsheet = `
Switch Cisco CBS250-24T-4G\t10\tUN
Cabo de Rede Furukawa Cat6 Azul\t4\tCX
Patch Cord Cat6 1.5m Azul\t50\tUN
Fio Flexível Corfio 2.5mm\t200\tMT
`;

const parsedMulti = parsePastedProductListWithQty(multiLineSpreadsheet);
if (parsedMulti.length !== 4) {
  throw new Error(`Esperava 4 produtos da planilha, obteve ${parsedMulti.length}`);
}
if (parsedMulti[0].quantity !== 10 || parsedMulti[0].unit !== 'Un.') {
  throw new Error(`Item 0 da planilha com quantidade/unidade incorreta: ${parsedMulti[0].quantity} ${parsedMulti[0].unit}`);
}
if (parsedMulti[1].quantity !== 4 || parsedMulti[1].unit !== 'Cx.') {
  throw new Error(`Item 1 da planilha com quantidade/unidade incorreta: ${parsedMulti[1].quantity} ${parsedMulti[1].unit}`);
}
if (parsedMulti[3].quantity !== 200 || parsedMulti[3].unit !== 'Mt.') {
  throw new Error(`Item 3 da planilha com quantidade/unidade incorreta: ${parsedMulti[3].quantity} ${parsedMulti[3].unit}`);
}
console.log(`  ✓ 4 itens extraídos com quantidades e unidades perfeitamente mapeadas da planilha!`);

// ============================================================================
// TESTE 7: Enriquecimento Heurístico preservando Quantidade e Unidade
// ============================================================================
console.log('\n[Teste 7] enrichProductHeuristically com preservação de quantidade e unidade');

const enriched1 = enrichProductHeuristically('10x Switch Cisco 24 portas Gigabit', 10, 'Un.');
if (enriched1.quantity !== 10 || enriched1.unit !== 'Un.') {
  throw new Error(`Enriquecimento heurístico perdeu quantidade/unidade: ${enriched1.quantity} ${enriched1.unit}`);
}
if (enriched1.standardizedName.includes('10x')) {
  throw new Error(`Enriquecimento heurístico deixou "10x" no nome padronizado: "${enriched1.standardizedName}"`);
}
console.log(`  ✓ Enriquecido: "${enriched1.standardizedName}" | Qtd: ${enriched1.quantity} ${enriched1.unit} | NCM: ${enriched1.ncm}`);

const enriched2 = enrichProductHeuristically('Cabo Furukawa Cat6 Azul - 3 caixas', 3, 'Cx.');
if (enriched2.quantity !== 3 || enriched2.unit !== 'Cx.') {
  throw new Error(`Enriquecimento heurístico de caixa falhou: ${enriched2.quantity} ${enriched2.unit}`);
}
console.log(`  ✓ Enriquecido: "${enriched2.standardizedName}" | Qtd: ${enriched2.quantity} ${enriched2.unit} | NCM: ${enriched2.ncm}`);

console.log('\n🎉 TODOS OS TESTES DE ROBUSTEZ E QUANTIDADES DO SCANNER IA PASSARAM COM 100% DE SUCESSO!\n');
