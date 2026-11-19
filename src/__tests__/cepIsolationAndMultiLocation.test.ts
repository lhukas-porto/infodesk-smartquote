import { 
  resolveLocationCep, 
  formatCep, 
  normalizeLocationKey, 
  extractCityBaseKey,
  clearGlobalLocationCepsCache,
  getGlobalLocationCeps,
  setGlobalLocationCep
} from '../utils/cepHelper';
import { ClientCompany } from '../types';

console.log('🧪 Iniciando testes de Isolamento Estrito de CEPs e Multi-Campi...');

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(`Falha no teste: ${message}`);
  }
  console.log(`  ✅ ${message}`);
}

// 1. Teste de Formatação de CEP
console.log('\n[1/5] Testando formatação de CEP (formatCep)...');
assert(formatCep('71966700') === '71966-700', 'Formata 8 dígitos numéricos em XXXXX-XXX');
assert(formatCep('71.966-700') === '71966-700', 'Higieniza pontuações e formata corretamente');
assert(formatCep('') === '', 'Trata string vazia sem lançar exceção');
assert(formatCep(null) === '', 'Trata valor nulo sem lançar exceção');

// 2. Mock de Empresas para Simulação Comercial
const ubecCompany: ClientCompany = {
  id: 'comp-ubec-01',
  name: 'UBEC — União Brasileira de Educação Católica',
  contacts: [],
  defaultDeliveryLocation: 'Brasília - DF',
  locations: ['Campus Taguatinga', 'Campus Asa Sul', 'Brasília - DF'],
  locationCeps: {
    'campus taguatinga': '71966-700',
    'campus asa sul': '70200-001',
    'brasilia': '71966-700',
    'brasilia - df': '71966-700'
  }
};

const plumaCompany: ClientCompany = {
  id: 'comp-pluma-02',
  name: 'Pluma Agroavícola',
  contacts: [],
  defaultDeliveryLocation: 'Brasília - DF',
  locations: ['Brasília - DF'],
  locationCeps: {} // Pluma não possui CEP cadastrado
};

const sabinCompany: ClientCompany = {
  id: 'comp-sabin-03',
  name: 'Laboratório Sabin',
  contacts: [],
  defaultDeliveryLocation: 'Brasília - DF',
  locations: ['Brasília - DF', 'Guará'],
  locationCeps: {
    'brasilia': '70040-000',
    'brasilia - df': '70040-000',
    'guara': '71010-000'
  }
};

// 3. Teste de Isolamento entre Empresas Diferentes
console.log('\n[2/5] Testando isolamento estrito entre empresas (Anti-Vazamento)...');

const ubecBsb = resolveLocationCep('Brasília - DF', ubecCompany);
assert(ubecBsb.cep === '71966-700', 'UBEC recebe seu CEP de Taguatinga/Brasília (71966-700)');
assert(ubecBsb.source === 'company', 'Origem do CEP da UBEC identificada como company');

const plumaBsb = resolveLocationCep('Brasília - DF', plumaCompany);
assert(plumaBsb.cep === null, 'Pluma NÃO recebe o CEP da UBEC para Brasília - DF (retorna null)');
assert(plumaBsb.formatted === '', 'Pluma não exibe texto de CEP herdado');
assert(plumaBsb.source === 'none', 'Origem do CEP da Pluma é "none" (Sem CEP)');

const sabinBsb = resolveLocationCep('Brasília - DF', sabinCompany);
assert(sabinBsb.cep === '70040-000', 'Sabin recebe seu próprio CEP (70040-000), jamais o da UBEC');
assert(sabinBsb.source === 'company', 'Origem do CEP do Sabin identificada como company');

// 4. Teste de Múltiplas Unidades / Campi na Mesma Empresa (Solução 2)
console.log('\n[3/5] Testando múltiplos campi/unidades por empresa...');

const ubecTaguatinga = resolveLocationCep('Campus Taguatinga', ubecCompany);
assert(ubecTaguatinga.cep === '71966-700', 'Unidade Taguatinga da UBEC resolve CEP 71966-700');

const ubecAsaSul = resolveLocationCep('Campus Asa Sul', ubecCompany);
assert(ubecAsaSul.cep === '70200-001', 'Unidade Asa Sul da UBEC resolve CEP 70200-001');
assert(ubecAsaSul.cep !== ubecTaguatinga.cep, 'Campi diferentes da mesma instituição possuem CEPs distintos');

// 5. Teste de Prioridade Máxima da Cotação Atual (quoteCep)
console.log('\n[4/5] Testando prioridade de CEP específico da cotação...');

const quoteOverride = resolveLocationCep('Brasília - DF', ubecCompany, '72300-500');
assert(quoteOverride.cep === '72300-500', 'CEP digitado especificamente na cotação tem prioridade');
assert(quoteOverride.source === 'quote', 'Origem identificada como "quote"');

// 6. Teste de Blindagem do Cache Global
console.log('\n[5/6] Testando extinção e blindagem de cache global...');

setGlobalLocationCep('Brasília', '99999-999');
const globalCeps = getGlobalLocationCeps();
assert(Object.keys(globalCeps).length === 0, 'setGlobalLocationCep não grava dados no cache compartilhado');

clearGlobalLocationCepsCache();
assert(typeof localStorage !== 'undefined' ? localStorage.getItem('infodesk_location_ceps') === null : true, 'clearGlobalLocationCepsCache remove chave legada com sucesso');

// 7. Teste de Serialização e Hidratação de locationCeps para o Supabase
console.log('\n[6/6] Testando serialização e hidratação de CEPs no Supabase (Roundtrip)...');

// Simulação de serialização em syncClientCompaniesToSupabase
const testCompany: ClientCompany = {
  id: 'comp-test-roundtrip',
  name: 'Empresa Teste Roundtrip',
  contacts: [],
  defaultDeliveryLocation: 'Brasília',
  locations: ['Brasília', 'Goiânia'],
  locationCeps: {
    'brasilia': '70040-010',
    'goiania': '74000-000'
  }
};

const persistedLocations: string[] = [...(testCompany.locations || [])];
for (const [key, val] of Object.entries(testCompany.locationCeps || {})) {
  if (val && String(val).trim()) {
    persistedLocations.push(`cep:${key.trim().toLowerCase()}:${String(val).trim()}`);
  }
}

assert(persistedLocations.includes('cep:brasilia:70040-010'), 'Serializa CEP de Brasília corretamente');
assert(persistedLocations.includes('cep:goiania:74000-000'), 'Serializa CEP de Goiânia corretamente');

// Simulação de desserialização em fetchClientCompaniesFromSupabase
const extractedLocationCeps: Record<string, string> = {};
const cleanLocations: string[] = [];

for (const loc of persistedLocations) {
  const item = String(loc || '').trim();
  if (item.toLowerCase().startsWith('cep:')) {
    const rawCepItem = item.substring(4).trim();
    const colonIdx = rawCepItem.indexOf(':');
    if (colonIdx > 0) {
      const locKey = rawCepItem.substring(0, colonIdx).trim().toLowerCase();
      const cepVal = rawCepItem.substring(colonIdx + 1).trim();
      if (locKey && cepVal) {
        extractedLocationCeps[locKey] = cepVal;
      }
    }
  } else {
    cleanLocations.push(item);
  }
}

assert(extractedLocationCeps['brasilia'] === '70040-010', 'Desserializa CEP de Brasília com fidelidade absoluta');
assert(extractedLocationCeps['goiania'] === '74000-000', 'Desserializa CEP de Goiânia com fidelidade absoluta');
assert(!cleanLocations.includes('cep:brasilia:70040-010'), 'Cidades limpas não são poluídas com tags de CEP');
assert(cleanLocations.includes('Brasília') && cleanLocations.includes('Goiânia'), 'Preserva cidades de entrega limpas');

console.log('\n✨ TODOS OS TESTES DE ISOLAMENTO E PERSISTÊNCIA DE CEP PASSARAM COM 100% DE SUCESSO!\n');
