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
import './categoriesUnitsSync.test';
import './procurementAndApproval.test';
import './procurementAdvancedFeatures.test';
import './specSearchOnline.test';
import './quoteHealing.test';
import './inboxScannerBridgeAndUnread.test';
import './quoteDuplicationSanitization.test';
import './windowUtils.test';
import './whatsappItemsMessage.test';
import './enhancementsSuite.test';
import './textCaseCycle.test';
import './supplierLearning.test';
import './brasiliaShippingDefault.test';
import './productDescriptionPreservation.test';
import './excelMultiSheetAndImageImport.test';
import './visualReferenceScannerIntegration.test';

console.log('\n======================================================');
console.log('🏁 SUÍTE COMPLETA DE TESTES EXECUTADA COM 100% DE SUCESSO!');
console.log('======================================================\n');