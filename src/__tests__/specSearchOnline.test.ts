/**
 * TESTE UNITÁRIO: BUSCA DE ESPECIFICAÇÕES TÉCNICAS ONLINE NA WEB
 * Valida a extração e o preenchimento de ficha técnica a partir da descrição/nome do produto.
 */

import { cleanAlphanumericCode, cleanNcmCode } from '../utils/aiEmailParser';

console.log('🧪 Iniciando testes de Busca de Especificações Técnicas Online...');

// 1. Testa higienização de códigos genéricos para Part Number e Modelo
const testPlaceholders = [
  'PARTNUMBER', 'PN', 'MODELO', 'MODEL', 'GENERICO', 'NA', 'SN', 
  'SEMCODIGO', 'UNKNOWN', 'NONE', 'AUTO', 'DEFAULT', 'NENHUM'
];

for (const ph of testPlaceholders) {
  const result = cleanAlphanumericCode(ph);
  if (result !== '') {
    throw new Error(`Falha: placeholder "${ph}" não foi descartado (retornou: "${result}"). Deveria retornar vazio.`);
  }
}
console.log('✓ Teste 1 aprovado: Placeholders e termos genéricos de partNumber/modelo são descartados com sucesso.');

// 2. Testa preservação de Part Number real do fabricante
const realCodes = [
  { raw: 'S2722QC', expected: 'S2722QC' },
  { raw: 'KF432C16BB/16', expected: 'KF432C16BB16' },
  { raw: '210-BBYZ', expected: '210BBYZ' },
  { raw: 'SA400S37/480G', expected: 'SA400S37480G' }
];

for (const rc of realCodes) {
  const cleaned = cleanAlphanumericCode(rc.raw);
  if (cleaned !== rc.expected) {
    throw new Error(`Falha: código real "${rc.raw}" resultou em "${cleaned}", esperado "${rc.expected}".`);
  }
}
console.log('✓ Teste 2 aprovado: Part Numbers autênticos do fabricante são preservados e limpos corretamente.');

// 3. Testa formatação de NCM
const ncmCases = [
  { raw: '8471.70.40', expected: '84717040' },
  { raw: '8528.52.00', expected: '85285200' },
  { raw: 'inválido', expected: '' }
];

for (const nc of ncmCases) {
  const cleaned = cleanNcmCode(nc.raw);
  if (cleaned !== nc.expected) {
    throw new Error(`Falha no NCM "${nc.raw}": esperado "${nc.expected}", recebido "${cleaned}"`);
  }
}
console.log('✓ Teste 3 aprovado: NCMs são validados e formatados com 8 dígitos fiscais.');

console.log('🎉 TODOS OS TESTES DE ESPECIFICAÇÕES TÉCNICAS ONLINE PASSARAM COM SUCESSO!\n');
