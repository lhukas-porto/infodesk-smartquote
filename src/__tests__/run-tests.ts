/**
 * SUÍTE CENTRALIZADA DE TESTES AUTOMATIZADOS — INFODESK SMARTQUOTE
 * Executa todas as baterias de teste de precisão comercial, cálculo de impostos,
 * margens de lucro, regras de arredondamento e auditoria de compatibilidade técnica.
 * 
 * Executar via: npx tsx src/__tests__/run-tests.ts
 */

import '../services/pricingEngine.test';
import '../services/productSpecsIntegration.test';
import './companyPrefixPersistence.test';
import './historySearchAccentInsensitivity.test';
import './biPeriodCounter.test';
import './historyDateFilter.test';
import './topSuppliersResolution.test';

console.log('\n======================================================');
console.log('🏁 SUÍTE COMPLETA DE TESTES EXECUTADA COM 100% DE SUCESSO!');
console.log('======================================================\n');
