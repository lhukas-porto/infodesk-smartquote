import { 
  getRegisteredCategories, 
  saveRegisteredCategory, 
  saveRegisteredCategoriesList,
  updateRegisteredCategory, 
  deleteRegisteredCategory, 
  resetRegisteredCategories,
  getRegisteredUnits, 
  saveRegisteredUnit, 
  saveRegisteredUnitsList,
  updateRegisteredUnit, 
  deleteRegisteredUnit, 
  resetRegisteredUnits,
  DEFAULT_REGISTERED_CATEGORIES,
  DEFAULT_REGISTERED_UNITS
} from '../utils/storage';

console.log('🧪 Iniciando testes de sincronização e unificação de Categorias & Unidades...');

// Mock simples de localStorage se rodando em Node sem DOM
if (typeof window === 'undefined' || !window.localStorage) {
  const store: Record<string, string> = {};
  (global as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    key: (i: number) => Object.keys(store)[i] || null,
    length: 0
  };
  (global as any).window = {
    dispatchEvent: () => true
  };
}

// 1. Verificar valores padrão
resetRegisteredCategories();
resetRegisteredUnits();

const initialCats = getRegisteredCategories();
if (!initialCats.includes('Informática & TI') || !initialCats.includes('Geral')) {
  throw new Error('Falha no Teste 1: Categorias padrão não foram carregadas corretamente.');
}
console.log('✓ Teste 1 aprovado: Categorias padrão carregadas com sucesso.');

const initialUnits = getRegisteredUnits();
if (!initialUnits.includes('Un.') || !initialUnits.includes('Cx.') || !initialUnits.includes('Kit')) {
  throw new Error('Falha no Teste 2: Unidades padrão não foram carregadas corretamente.');
}
console.log('✓ Teste 2 aprovado: Unidades padrão carregadas com sucesso.');

// 2. Adicionar nova categoria e verificar idempotência (não duplica se caixa diferente)
saveRegisteredCategory('CFTV & Monitoramento');
saveRegisteredCategory('cftv & monitoramento'); // mesma categoria em minúsculas
const catsAfterAdd = getRegisteredCategories();
const cftvOccurrences = catsAfterAdd.filter(c => c.toLowerCase() === 'cftv & monitoramento');
if (cftvOccurrences.length !== 1) {
  throw new Error(`Falha no Teste 3: Categoria duplicada encontrada (${cftvOccurrences.length}).`);
}
console.log('✓ Teste 3 aprovado: Categoria adicionada e protegida contra duplicidade insensível a maiúsculas.');

// 3. Atualizar e Deletar categoria
updateRegisteredCategory('CFTV & Monitoramento', 'Segurança & CFTV');
const catsAfterUpdate = getRegisteredCategories();
if (!catsAfterUpdate.includes('Segurança & CFTV') || catsAfterUpdate.includes('CFTV & Monitoramento')) {
  throw new Error('Falha no Teste 4: Atualização de categoria falhou.');
}
deleteRegisteredCategory('Segurança & CFTV');
const catsAfterDelete = getRegisteredCategories();
if (catsAfterDelete.includes('Segurança & CFTV')) {
  throw new Error('Falha no Teste 4: Deleção de categoria falhou.');
}
console.log('✓ Teste 4 aprovado: Edição e remoção de categoria funcionam com precisão.');

// 4. Teste de Unidades: Adicionar, editar, deletar
saveRegisteredUnit('Bobina');
saveRegisteredUnit('bobina');
const unitsAfterAdd = getRegisteredUnits();
const bobinaCount = unitsAfterAdd.filter(u => u.toLowerCase() === 'bobina');
if (bobinaCount.length !== 1) {
  throw new Error('Falha no Teste 5: Unidade duplicada permitida.');
}
updateRegisteredUnit('Bobina', 'Rolo');
if (!getRegisteredUnits().includes('Rolo')) {
  throw new Error('Falha no Teste 5: Edição de unidade falhou.');
}
deleteRegisteredUnit('Rolo');
if (getRegisteredUnits().includes('Rolo')) {
  throw new Error('Falha no Teste 5: Deleção de unidade falhou.');
}
console.log('✓ Teste 5 aprovado: Ciclo completo de unidades (criação, edição, exclusão) validado.');

// 5. Teste de Merge com produtos do Banco de Dados
const bancoProdutosMock = [
  { category: 'Energia & Nobreaks', unit: 'M²' },
  { category: 'Equipamentos & Insumos Industriais', unit: 'Pote' },
  { category: 'Informática & TI', unit: 'Un.' } // Já existente
];

const mergedCategories = Array.from(new Set([
  ...getRegisteredCategories(),
  ...bancoProdutosMock.map(p => p.category)
]));
saveRegisteredCategoriesList(mergedCategories);

const finalCategories = getRegisteredCategories();
if (!finalCategories.includes('Energia & Nobreaks') || !finalCategories.includes('Equipamentos & Insumos Industriais')) {
  throw new Error('Falha no Teste 6: Merge unificado com produtos do banco falhou.');
}
console.log('✓ Teste 6 aprovado: Unificação e auto-aprendizado a partir de produtos do banco validado.');

console.log('🎉 TODOS OS TESTES DE CATEGORIAS E UNIDADES PASSARAM COM SUCESSO!\n');
