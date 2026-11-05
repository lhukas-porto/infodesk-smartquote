import assert from 'assert';
import {
  classifyProductType,
  learnDollarSurcharge,
  predictDollarSurcharge,
  resetLearnedDollarSurcharges,
  learnDollarSurchargesFromProducts
} from '../services/dollarSurchargeLearningService';
import { Product } from '../types';

console.log('🧪 [TESTE] Iniciando validação do aprendizado de acréscimo de dólar...');

// Reset inicial
resetLearnedDollarSurcharges();

// 1. Deve classificar corretamente os tipos de produto
assert.strictEqual(classifyProductType('HD Seagate Barracuda 4TB 3.5 Sata').key, 'hd');
assert.strictEqual(classifyProductType('Disco Rígido Externo WD 1TB').key, 'hd');
assert.strictEqual(classifyProductType('Smartphone Samsung Galaxy S24 FE 256GB').key, 'celular');
assert.strictEqual(classifyProductType('iPhone 15 Pro 128GB').key, 'celular');
assert.strictEqual(classifyProductType('SSD Kingston NV2 1TB M.2 NVMe').key, 'ssd');
assert.strictEqual(classifyProductType('Memória RAM Kingston Fury Beast 16GB DDR4').key, 'memoria_ram');
console.log('✅ 1. Classificação de taxonomia validada com sucesso.');

// 2. Deve aprender e prever a porcentagem do fornecedor após observações (exemplo dos HDs)
assert.strictEqual(predictDollarSurcharge('HD Seagate 4TB'), null);

// 1ª observação de HD com 15%
const obs1 = learnDollarSurcharge('HD Seagate Barracuda 4TB', 15);
assert.ok(obs1);
assert.strictEqual(obs1.sampleCount, 1);
assert.strictEqual(obs1.learnedPercent, 15);

// Agora já prevê 15% para qualquer outro HD
const pred1 = predictDollarSurcharge('HD Western Digital Purple 8TB');
assert.ok(pred1);
assert.strictEqual(pred1.percent, 15);
assert.strictEqual(pred1.confidence, 'Inicial');

// 2ª observação de HD com 15%
learnDollarSurcharge('HD Seagate IronWolf 6TB', 15);
const pred2 = predictDollarSurcharge('HD Toshiba Surveillance 2TB');
assert.ok(pred2);
assert.strictEqual(pred2.percent, 15);
assert.strictEqual(pred2.confidence, 'Frequente');

// 3ª e 4ª observação consolidando 15%
learnDollarSurcharge('HDD Seagate SkyHawk 4TB', 15);
learnDollarSurcharge('Hard Disk Dell 2.4TB 10k', 15);
const pred3 = predictDollarSurcharge('HD Enterprise 12TB');
assert.ok(pred3);
assert.strictEqual(pred3.percent, 15);
assert.strictEqual(pred3.confidence, 'Consolidado');
console.log('✅ 2. Aprendizado iterativo e consolidação validados com sucesso.');

// 3. Celulares aprendem sua própria porcentagem de forma isolada
learnDollarSurcharge('iPhone 15 Pro Max', 22);
learnDollarSurcharge('Samsung Galaxy S24 Ultra', 22);
const predCelular = predictDollarSurcharge('Celular Xiaomi Redmi Note 13');
assert.ok(predCelular);
assert.strictEqual(predCelular.percent, 22);

// HDs continuam com 15%
const predHdCheck = predictDollarSurcharge('HD Seagate 2TB');
assert.ok(predHdCheck);
assert.strictEqual(predHdCheck.percent, 15);
console.log('✅ 3. Isolamento entre categorias verificado com sucesso.');

// 4. Aprendizado em lote a partir do catálogo existente
const mockProducts: Product[] = [
  {
    id: 'p1',
    sku: 'MEM-01',
    name: 'Memória RAM Corsair 32GB DDR5',
    description: 'DDR5 5200Mhz',
    lastUpdated: '2026-03-01T10:00:00Z',
    category: 'Informática, Hardware & Periféricos',
    costPrice: 500,
    dollarPrice: 80,
    dollarSurchargePercent: 12,
    unit: 'Un.'
  },
  {
    id: 'p2',
    sku: 'MEM-02',
    name: 'Memória Kingston Fury 16GB DDR4',
    description: 'DDR4 3200Mhz',
    lastUpdated: '2026-03-01T10:00:00Z',
    category: 'Informática, Hardware & Periféricos',
    costPrice: 250,
    dollarPrice: 40,
    dollarSurchargePercent: 12,
    unit: 'Un.'
  }
];

learnDollarSurchargesFromProducts(mockProducts);
const predMem = predictDollarSurcharge('Memória RAM Crucial 8GB DDR4');
assert.ok(predMem);
assert.strictEqual(predMem.percent, 12);
console.log('✅ 4. Bootstrapping a partir de catálogo verificado com sucesso.');

console.log('🎉 Todos os 4 testes de aprendizado de dólar passaram 100%!');
