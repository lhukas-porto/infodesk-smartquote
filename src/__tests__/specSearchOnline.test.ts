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

// 4. Testa consolidação de ficha técnica 360° no padrão Scanner IA
import { buildCompleteProductDescription, normalizeToOfficialCategory } from '../utils/aiEmailParser';

const mockScannerStyleData = {
  description: 'O Teclado Sem Fio Logitech K380 oferece digitação confortável e silenciosa em qualquer dispositivo. Equipado com conexão Bluetooth multidispositivo, permite alternar instantaneamente entre computadores, tablets e smartphones.',
  specifications: [
    { label: 'Conectividade', value: 'Bluetooth Low Energy (BLE)' },
    { label: 'Alcance sem fio', value: 'Até 10 metros' },
    { label: 'Alimentação', value: '2 pilhas AAA inclusas' },
    { label: 'Autonomia', value: 'Até 24 meses de bateria' },
    { label: 'Compatibilidade', value: 'Windows, macOS, iPadOS, Android, ChromeOS' }
  ],
  brand: 'Logitech',
  model: 'K380',
  partNumber: '920-009599',
  ncm: '8471.60.52',
  category: 'Informática, Hardware & Periféricos',
  weight: '0.423 kg',
  dimensions: '27.9cm x 12.4cm x 1.6cm'
};

const consolidatedSpecs = buildCompleteProductDescription(mockScannerStyleData);

if (!consolidatedSpecs.includes('Logitech K380 oferece digitação confortável')) {
  throw new Error('Falha: descrição inicial não foi preservada na consolidação');
}
if (!consolidatedSpecs.includes('• Conectividade: Bluetooth Low Energy (BLE)')) {
  throw new Error('Falha: especificação de conectividade não foi incluída');
}
if (!consolidatedSpecs.includes('• Marca: Logitech')) {
  throw new Error('Falha: marca não foi incluída nas especificações');
}
if (!consolidatedSpecs.includes('• Part Number / SKU: 920-009599')) {
  throw new Error('Falha: part number não foi incluído');
}
if (!consolidatedSpecs.includes('• NCM Fiscal: 8471.60.52')) {
  throw new Error('Falha: NCM fiscal não foi incluído');
}
if (!consolidatedSpecs.includes('• Peso aproximado: 0.423 kg')) {
  throw new Error('Falha: peso não foi incluído');
}

const officialCat = normalizeToOfficialCategory(mockScannerStyleData.category);
if (officialCat !== 'Informática, Hardware & Periféricos') {
  throw new Error(`Falha: categoria oficial incorreta "${officialCat}"`);
}

console.log('✓ Teste 4 aprovado: Consolidação de Ficha Técnica 360° no padrão Scanner IA validada com máxima fidelidade!');

console.log('🎉 TODOS OS TESTES DE ESPECIFICAÇÕES TÉCNICAS ONLINE PASSARAM COM SUCESSO!\n');
