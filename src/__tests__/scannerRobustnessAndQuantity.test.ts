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

// ============================================================================
// TESTE 8: Padronização Canônica Oficial de Smartphones e Resolução de Plurais
// ============================================================================
console.log('\n[Teste 8] Padronização Canônica Oficial de Smartphones e Resolução de Plurais');

const phoneQuery = '03 aparelhos de celular Samsung S25fe, 256g';
const parsedPhone = parsePastedProductListWithQty(phoneQuery);
if (parsedPhone.length !== 1 || parsedPhone[0].quantity !== 3) {
  throw new Error(`Falha ao parsear quantidade do celular: esperava 3, obteve ${parsedPhone[0]?.quantity}`);
}

const enrichedPhone = enrichProductHeuristically(parsedPhone[0].query, parsedPhone[0].quantity, parsedPhone[0].unit);

// 1. O nome NÃO pode ser "Aparelhos de celular Samsung s25fe 256g"
if (enrichedPhone.standardizedName.toLowerCase().startsWith('aparelhos de celular')) {
  throw new Error(`Nome não padronizado para smartphone: manteve gíria "${enrichedPhone.standardizedName}"`);
}
if (!enrichedPhone.standardizedName.includes('Galaxy S25 FE')) {
  throw new Error(`Nome não identificou a linha Galaxy S25 FE: obteve "${enrichedPhone.standardizedName}"`);
}
if (!enrichedPhone.standardizedName.includes('256GB')) {
  throw new Error(`Capacidade de armazenamento 256g não foi normalizada para 256GB: obteve "${enrichedPhone.standardizedName}"`);
}

// 2. Modelo e Part Number NÃO podem ser "256G" nem "SAM-256G"
if (enrichedPhone.model === '256G') {
  throw new Error(`Modelo capturou armazenamento erroneamente: "${enrichedPhone.model}"`);
}
if (enrichedPhone.partNumber === 'SAM-256G') {
  throw new Error(`Part number foi fabricado incorretamente como "${enrichedPhone.partNumber}"`);
}

// 3. Categoria DEVE ser "Redes, Conectividade & Telefonia"
if (enrichedPhone.category !== 'Redes, Conectividade & Telefonia') {
  throw new Error(`Categoria incorreta para smartphone: esperava "Redes, Conectividade & Telefonia", obteve "${enrichedPhone.category}"`);
}

// 4. NCM DEVE ser de telefones inteligentes / smartphones (8517.13.00)
if (enrichedPhone.ncm !== '8517.13.00') {
  throw new Error(`NCM incorreto para smartphone: esperava "8517.13.00", obteve "${enrichedPhone.ncm}"`);
}

console.log(`  ✓ Smartphone Samsung padronizado com excelência:`);
console.log(`    Nome Oficial: "${enrichedPhone.standardizedName}"`);
console.log(`    Categoria:    "${enrichedPhone.category}"`);
console.log(`    NCM:          "${enrichedPhone.ncm}"`);
console.log(`    Modelo:       "${enrichedPhone.model}" | P/N: "${enrichedPhone.partNumber}"`);

// 5. Teste de plural para singular em mouse e teclado
const cleanMouse = sanitizeStandardizedProductName('Mouses sem fio Logitech M170');
if (!cleanMouse.startsWith('Mouse')) {
  throw new Error(`Plural não foi convertido para singular em mouse: obteve "${cleanMouse}"`);
}
console.log(`  ✓ "Mouses sem fio Logitech M170" -> "${cleanMouse}"`);

// ============================================================================
// TESTE 9: Padronização Canônica Universal Multicategorias (Regra do Lucas)
// ============================================================================
console.log('\n[Teste 9] Padronização Canônica Universal Multicategorias (Informática, Elétrica, Papelaria, Ferramentas, Eletro, Limpeza)');

const universalTestCases = [
  {
    raw: '10 mouses sem fios logitech m170',
    expectedQty: 10,
    expectedCategory: 'Informática, Hardware & Periféricos',
    expectedNcm: '8471.60.53',
    mustContain: ['Mouse', 'sem Fio', 'Logitech', 'M170'],
    mustNotContain: ['Mouses', 'fios'],
    forbiddenModelTokens: ['10', 'SEM', 'FIOS']
  },
  {
    raw: '05 disjuntores bipolares schneider 32a',
    expectedQty: 5,
    expectedCategory: 'Elétrica & Iluminação Tática',
    expectedNcm: '8536.20.00',
    mustContain: ['Disjuntor', 'Bipolar', 'Schneider', '32a'],
    mustNotContain: ['disjuntores', 'bipolares'],
    forbiddenModelTokens: ['32A', '5', 'SCH-32A']
  },
  {
    raw: '20 resmas de papel chamex a4 75g',
    expectedQty: 20,
    expectedCategory: 'Papelaria, Artes & Material de Escritório',
    expectedNcm: '4802.56.10',
    mustContain: ['Papel', 'Chamex', 'A4', '75g'],
    mustNotContain: ['resmas de'],
    forbiddenModelTokens: ['75G', '20', 'CHA-75G']
  },
  {
    raw: '03 parafusadeiras a bateria bosch 12v',
    expectedQty: 3,
    expectedCategory: 'Ferramentas & Instrumentos de Medição',
    expectedNcm: '8467.21.00',
    mustContain: ['Parafusadeira', 'Bosch', '12V'],
    mustNotContain: ['parafusadeiras'],
    forbiddenModelTokens: ['12V', '03', 'BOS-12V']
  },
  {
    raw: '10 rolos de fitas isolantes 3m imperial 20m',
    expectedQty: 10,
    expectedCategory: 'Elétrica & Iluminação Tática',
    expectedNcm: '3919.10.20',
    mustContain: ['Fita Isolante', '3M', 'Imperial', '20m'],
    mustNotContain: ['fitas isolantes'],
    forbiddenModelTokens: ['20M', '10', '3M-20M']
  },
  {
    raw: '2 frigobares consul 120 litros 220v',
    expectedQty: 2,
    expectedCategory: 'Eletrodomésticos, Refrigeração & Copa',
    expectedNcm: '8418.21.00',
    mustContain: ['Frigobar', 'Consul', '220V'],
    mustNotContain: ['frigobares'],
    forbiddenModelTokens: ['220V', '120L', '2']
  },
  {
    raw: '10 fardos de papeis toalha interfolha sulleg',
    expectedQty: 10,
    expectedCategory: 'Limpeza, Higiene & Descartáveis',
    expectedNcm: '4818.20.00',
    mustContain: ['Papel Toalha Interfolha'],
    mustNotContain: ['papeis toalha', 'fardos de'],
    forbiddenModelTokens: ['10']
  }
];

universalTestCases.forEach((tc, idx) => {
  const parsed = parsePastedProductListWithQty(tc.raw);
  if (parsed.length !== 1 || parsed[0].quantity !== tc.expectedQty) {
    throw new Error(`[Caso ${idx + 1}] Quantidade incorreta para "${tc.raw}": esperava ${tc.expectedQty}, obteve ${parsed[0]?.quantity}`);
  }

  const enriched = enrichProductHeuristically(parsed[0].query, parsed[0].quantity, parsed[0].unit);

  // 1. Validação de Categoria Oficial
  if (enriched.category !== tc.expectedCategory) {
    throw new Error(`[Caso ${idx + 1}] Categoria incorreta para "${tc.raw}": esperava "${tc.expectedCategory}", obteve "${enriched.category}"`);
  }

  // 2. Validação de NCM oficial
  if (enriched.ncm !== tc.expectedNcm) {
    throw new Error(`[Caso ${idx + 1}] NCM incorreto para "${tc.raw}": esperava "${tc.expectedNcm}", obteve "${enriched.ncm}"`);
  }

  // 3. Validação de termos obrigatórios no nome padronizado
  for (const term of tc.mustContain) {
    if (!enriched.standardizedName.toLowerCase().includes(term.toLowerCase())) {
      throw new Error(`[Caso ${idx + 1}] Nome padronizado não contém o termo obrigatório "${term}": obteve "${enriched.standardizedName}"`);
    }
  }

  // 4. Validação de termos proibidos (gírias/plurais)
  for (const term of tc.mustNotContain) {
    if (enriched.standardizedName.toLowerCase().includes(term.toLowerCase())) {
      throw new Error(`[Caso ${idx + 1}] Nome padronizado ainda contém termo inadequado "${term}": obteve "${enriched.standardizedName}"`);
    }
  }

  // 5. Blindagem contra tokens de especificação no model e part number
  for (const badToken of tc.forbiddenModelTokens) {
    if (enriched.model?.toUpperCase() === badToken.toUpperCase()) {
      throw new Error(`[Caso ${idx + 1}] Modelo foi corrompido com especificação proibida "${badToken}": obteve "${enriched.model}"`);
    }
    if (enriched.partNumber?.toUpperCase() === badToken.toUpperCase()) {
      throw new Error(`[Caso ${idx + 1}] Part Number foi fabricado incorretamente com token proibido "${badToken}": obteve "${enriched.partNumber}"`);
    }
  }

  console.log(`  ✓ [Universal ${idx + 1}] "${tc.raw}"`);
  console.log(`      -> Nome Canônico: "${enriched.standardizedName}"`);
  console.log(`      -> Categoria:     "${enriched.category}" | NCM: ${enriched.ncm}`);
  console.log(`      -> Modelo:        "${enriched.model || '(vazio)'}" | P/N: "${enriched.partNumber || '(vazio)'}"`);
});

console.log('\n🎉 TODOS OS TESTES DE ROBUSTEZ E QUANTIDADES DO SCANNER IA PASSARAM COM 100% DE SUCESSO!\n');

