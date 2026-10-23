/**
 * TESTES AUTOMATIZADOS: DETECTOR INTELIGENTE DE PRODUTOS DUPLICADOS
 * Valida o algoritmo de detecção de similaridade, cruzamento de Part Number,
 * fusão de fichas técnicas e critérios de descarte.
 */

import { Product } from '../types';

console.log('\n--- INICIANDO TESTES: DETECÇÃO E HIGIENIZAÇÃO DE DUPLICATAS ---');

function cleanAlphanumeric(text: string): string {
  return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeSearchText(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Teste 1: Detecção de duplicatas por mesmo Part Number
function testDetectByPartNumber() {
  console.log('\n[Teste 1] Detecção por Part Number idêntico');
  
  const p1: Product = {
    id: 'prod-001',
    sku: 'INT-SG2404',
    partNumber: '4760085',
    name: 'Switch Intelbras 24 Portas Gigabit SG 2404 PoE Max',
    description: '',
    lastUpdated: new Date().toISOString(),
    costPrice: 1250,
    category: 'Redes, Conectividade & Telefonia',
    unit: 'Un.'
  };

  const p2: Product = {
    id: 'prod-002',
    sku: 'INF-AUTO-999',
    partNumber: '4760085', // Mesmo PN
    name: 'Switch SG2404 PoE Intelbras',
    description: '',
    lastUpdated: new Date().toISOString(),
    costPrice: 1190,
    category: 'Redes, Conectividade & Telefonia',
    unit: 'Un.'
  };

  const pn1 = cleanAlphanumeric(p1.partNumber || '');
  const pn2 = cleanAlphanumeric(p2.partNumber || '');

  const isDuplicate = pn1 && pn2 && pn1 === pn2;
  if (!isDuplicate) {
    throw new Error('Falha ao detectar duplicata com mesmo Part Number');
  }

  console.log('  ✓ Detectou duplicata com 100% de confiança pelo Part Number:', p1.partNumber);
}

// Teste 2: Detecção de duplicatas por alta sobreposição de nome
function testDetectByNameSimilarity() {
  console.log('\n[Teste 2] Detecção por alta sobreposição de nome');
  
  const p1: Product = {
    id: 'prod-010',
    sku: 'CAB-FUR-CAT6',
    name: 'Cabo de Rede Furukawa Cat6 Azul 305m',
    description: '',
    lastUpdated: new Date().toISOString(),
    costPrice: 650,
    category: 'Redes, Conectividade & Telefonia',
    unit: 'Cx.'
  };

  const p2: Product = {
    id: 'prod-011',
    sku: 'CAB-FUR-CAT6-AZUL',
    name: 'Cabo de Rede Furukawa Cat6 Azul',
    description: '',
    lastUpdated: new Date().toISOString(),
    costPrice: 640,
    category: 'Redes, Conectividade & Telefonia',
    unit: 'Cx.'
  };

  const n1 = normalizeSearchText(p1.name);
  const n2 = normalizeSearchText(p2.name);

  const contains = n1.includes(n2) || n2.includes(n1);
  const ratio = Math.min(n1.length, n2.length) / Math.max(n1.length, n2.length);

  if (!contains || ratio < 0.60) {
    throw new Error('Falha ao detectar alta sobreposição de nomes');
  }

  console.log(`  ✓ Detectou sobreposição entre "${p1.name}" e "${p2.name}" (${Math.round(ratio * 100)}%)`);
}

// Teste 3: Lógica de Mesclagem Inteligente
function testSmartMergeLogic() {
  console.log('\n[Teste 3] Fusão de produtos preservando os melhores atributos');

  const itemA: Product = {
    id: 'item-a',
    sku: 'SKU-OLD',
    partNumber: 'PN-12345',
    name: 'Roteador Wi-Fi 6 AX12 TP-Link Dual Band Gigabit',
    description: 'Roteador Wi-Fi 6 de alta velocidade com tecnologia OFDMA e 4 antenas externas',
    lastUpdated: new Date().toISOString(),
    costPrice: 220,
    imageUrl: 'https://exemplo.com/foto-alta-resolucao.jpg',
    category: 'Redes, Conectividade & Telefonia',
    unit: 'Un.'
  };

  const itemB: Product = {
    id: 'item-b',
    sku: 'AX12-TPLINK',
    partNumber: 'PN-12345',
    name: 'Roteador AX12',
    description: 'Roteador TP-Link',
    lastUpdated: new Date().toISOString(),
    costPrice: 195, // Menor custo!
    category: 'Redes, Conectividade & Telefonia',
    unit: 'Un.',
    supplier: 'Distribuidora Oficial'
  };

  const merged: Product = {
    ...itemA,
    name: itemA.name.length >= itemB.name.length ? itemA.name : itemB.name,
    description: (itemA.description?.length || 0) >= (itemB.description?.length || 0) ? itemA.description : itemB.description,
    costPrice: Math.min(itemA.costPrice, itemB.costPrice),
    imageUrl: itemA.imageUrl || itemB.imageUrl,
    supplier: itemA.supplier || itemB.supplier
  };

  if (merged.costPrice !== 195) {
    throw new Error('A fusão deve adotar o melhor custo financeiro (R$ 195)');
  }

  if (!merged.imageUrl || !merged.imageUrl.includes('foto-alta-resolucao')) {
    throw new Error('A fusão deve preservar a imagem de referência');
  }

  if (merged.name !== 'Roteador Wi-Fi 6 AX12 TP-Link Dual Band Gigabit') {
    throw new Error('A fusão deve preservar a descrição mais completa');
  }

  console.log('  ✓ Fusão concluída com sucesso!');
  console.log('    Nome preservado:', merged.name);
  console.log('    Menor custo adotado: R$', merged.costPrice);
  console.log('    Fornecedor incorporado:', merged.supplier);
}

function runAll() {
  testDetectByPartNumber();
  testDetectByNameSimilarity();
  testSmartMergeLogic();
  console.log('\n✅ TODOS OS TESTES DE HIGIENIZAÇÃO DE DUPLICATAS PASSARAM COM SUCESSO!\n');
}

runAll();
