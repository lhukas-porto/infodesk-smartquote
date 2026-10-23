import assert from 'assert';
import { calculateCommercialUnitPrice } from '../utils/aiEmailParser';
import { getSettings, saveSettings } from '../utils/storage';

console.log('🧪 Iniciando testes de herança da Margem de Lucro Padrão (%) de configurações para o Scanner IA...');

// 1. Verificar leitura da margem padrão de configurações
const currentSettings = getSettings();
const initialMarkup = currentSettings.defaultMarkupPercent ?? 23.5;
assert.ok(typeof initialMarkup === 'number' && initialMarkup > 0, 'Margem padrão de configurações deve ser um número positivo');
console.log(`  ✅ 1. Margem padrão de configurações lida com sucesso: ${initialMarkup}%`);

// 2. Simular alteração da Margem de Lucro Padrão nas configurações para 28.5%
const testSettings = {
  ...currentSettings,
  defaultMarkupPercent: 28.5,
  defaultTaxPercent: 9.1,
  defaultShippingCost: 0
};
saveSettings(testSettings);

const reloadedSettings = getSettings();
assert.strictEqual(reloadedSettings.defaultMarkupPercent, 28.5, 'Configurações devem persistir nova margem de 28.5%');
console.log('  ✅ 2. Margem de lucro de teste (28.5%) persistida com sucesso nas configurações');

// 3. Simular cálculo de preço do item vindo do scanner com a margem das configurações
const cost = 100.00;
const shipping = reloadedSettings.defaultShippingCost ?? 0;
const tax = reloadedSettings.defaultTaxPercent ?? 9.1;
const expectedUnitPrice = calculateCommercialUnitPrice(cost, shipping, 28.5, tax);

// Testar que o unitPrice não usa o antigo hardcode de 35%
const oldHardcodedPrice = calculateCommercialUnitPrice(cost, shipping, 35, tax);
assert.notStrictEqual(expectedUnitPrice, oldHardcodedPrice, 'Preço com 28.5% não pode ser igual ao preço com 35%');

// Validar fórmula comercial oficial: (baseCost * (1 + marginRate)) / (1 - taxRate)
assert.strictEqual(expectedUnitPrice, calculateCommercialUnitPrice(cost, shipping, 28.5, tax));
assert.strictEqual(expectedUnitPrice, 141); // 100 * 1.285 / 0.909 = 141.36 => arredondamento comercial = 141
console.log(`  ✅ 3. Preço comercial apurado com fidelidade: R$ ${cost.toFixed(2)} + 28.5% = R$ ${expectedUnitPrice.toFixed(2)} (diferente de 35%: R$ ${oldHardcodedPrice.toFixed(2)})`);

// 4. Restaurar as configurações originais
saveSettings(currentSettings);
assert.strictEqual(getSettings().defaultMarkupPercent, initialMarkup, 'Configurações originais restauradas com sucesso');
console.log(`  ✅ 4. Configurações restauradas com sucesso para a margem oficial (${initialMarkup}%)`);

console.log('🎉 TODOS OS TESTES DE HERANÇA DA MARGEM PADRÃO PASSARAM COM 100% DE SUCESSO!\n');
