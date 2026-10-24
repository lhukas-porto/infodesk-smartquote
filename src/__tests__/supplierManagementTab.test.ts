import assert from 'assert';
import { 
  getRegisteredSuppliersDetailed, 
  saveRegisteredSupplier, 
  updateRegisteredSupplier, 
  deleteRegisteredSupplier, 
  resetRegisteredSuppliers,
  getAllRegisteredSuppliers,
  getDeletedSuppliers
} from '../services/supplierLearningService';

console.log('--- TESTES DA ABA OFICIAL DE FORNECEDORES ---');

// Mock localStorage para ambiente Node
const store: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (k: string) => store[k] || null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; }
};

// 1. Teste de listagem inicial de fornecedores
const mockProducts = [
  { id: 'p1', name: 'Alicate Universal', supplier: 'Palácio das Ferramentas' },
  { id: 'p2', name: 'Jogo de Chaves', supplier: 'Palácio das Ferramentas' },
  { id: 'p3', name: 'Furadeira Bosch', supplier: 'Dutra Máquinas' },
  { id: 'p4', name: 'Switch 24p', supplier: 'Distribuidora Nova Alpha' }
];

const detailedInitial = getRegisteredSuppliersDetailed(mockProducts);
console.log(`[Teste 1] Total de fornecedores detalhados: ${detailedInitial.length}`);
assert.ok(detailedInitial.length > 20, 'Deve conter os fornecedores padrão');

const palacio = detailedInitial.find(s => s.name === 'Palácio das Ferramentas');
assert.ok(palacio, 'Palácio das Ferramentas deve estar na lista');
assert.strictEqual(palacio?.productCount, 2, 'Palácio das Ferramentas deve ter 2 produtos vinculados');
console.log('✅ Teste 1 passou: Listagem detalhada com contagem de produtos correta!');

// 2. Teste de adição de novo fornecedor com domínio
saveRegisteredSupplier('Tech Supply Brasil', 'techsupply.com.br');
const detailedAfterAdd = getRegisteredSuppliersDetailed(mockProducts);
const techSupply = detailedAfterAdd.find(s => s.name === 'Tech Supply Brasil');
assert.ok(techSupply, 'Tech Supply Brasil deve ter sido adicionado');
assert.ok(techSupply?.domains.includes('techsupply.com.br'), 'Deve mapear o domínio techsupply.com.br');
console.log('✅ Teste 2 passou: Novo fornecedor com domínio salvo com sucesso!');

// 3. Teste de renomeação com propagação em produtos
store['infodesk_products'] = JSON.stringify(mockProducts);
const renameResult = updateRegisteredSupplier('Distribuidora Nova Alpha', 'Distribuidora Nova Beta', 'novabeta.com.br', true);
assert.strictEqual(renameResult.updatedProducts, 1, 'Deve ter atualizado 1 produto no catálogo');

const updatedProductsFromStorage = JSON.parse(store['infodesk_products']);
const productUpdated = updatedProductsFromStorage.find((p: any) => p.id === 'p4');
assert.strictEqual(productUpdated.supplier, 'Distribuidora Nova Beta', 'Produto p4 deve ter seu fornecedor atualizado para Nova Beta');
console.log('✅ Teste 3 passou: Renomeação propagada nos produtos do catálogo com sucesso!');

// 4. Teste de exclusão (tombstone)
deleteRegisteredSupplier('Distribuidora Nova Beta');
const detailedAfterDelete = getRegisteredSuppliersDetailed(mockProducts);
const deletedCheck = detailedAfterDelete.find(s => s.name === 'Distribuidora Nova Beta');
assert.strictEqual(deletedCheck, undefined, 'Fornecedor deletado não deve constar na listagem ativa');
assert.ok(getDeletedSuppliers().has('distribuidora nova beta'), 'Deve constar no tombstone de excluídos');
console.log('✅ Teste 4 passou: Exclusão e tombstone validados com sucesso!');

console.log('🎉 TODOS OS TESTES DA ABA DE FORNECEDORES PASSARAM COM 100% DE SUCESSO!\n');
