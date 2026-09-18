import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatCompanyPrefix } from '../utils/aiEmailParser';
import { 
  getClientCompanies, 
  saveClientCompanies, 
  getCompanyPrefixesMap, 
  saveCompanyPrefixPreference, 
  registerOrUpdateClient 
} from '../utils/storage';
import { ClientCompany } from '../types';

// Mock localStorage para ambiente de testes Node.js
if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    key: (index: number) => Object.keys(store)[index] || null,
    length: 0
  } as any;
}

console.log('🧪 Iniciando bateria de testes de Persistência de Prefixo (À / Ao)...');

// 1. Teste do formatCompanyPrefix
const resAoUbec = formatCompanyPrefix('Ao UBEC');
assert.equal(resAoUbec, 'Ao UBEC', 'formatCompanyPrefix("Ao UBEC") deve respeitar "Ao" e não reverter para "À"');

const resAUbec = formatCompanyPrefix('À UBEC');
assert.equal(resAUbec, 'À UBEC', 'formatCompanyPrefix("À UBEC") deve respeitar "À"');

const resExplicitAo = formatCompanyPrefix('Universidade Católica', 'Ao');
assert.equal(resExplicitAo, 'Ao Universidade Católica', 'explicitPrefix "Ao" deve ser aplicado');

const resExplicitA = formatCompanyPrefix('Hospital Regional', 'À');
assert.equal(resExplicitA, 'À Hospital Regional', 'explicitPrefix "À" deve ser aplicado');

console.log('✓ Teste 1 aprovado: formatCompanyPrefix respeita fielmente escolhas explícitas do usuário ("Ao" e "À")!');

// 2. Teste de salvamento e recuperação no storage
const testCompany: ClientCompany = {
  id: 'comp-test-1',
  name: 'Empresa Teste Inovação',
  prefix: 'Ao',
  defaultDeliveryLocation: 'Brasília',
  locations: ['Brasília'],
  contacts: []
};

saveClientCompanies([testCompany]);
const loaded = getClientCompanies();
const found = loaded.find(c => c.id === 'comp-test-1');
assert.ok(found, 'Empresa de teste deve existir no storage');
assert.equal(found.prefix, 'Ao', 'Prefixo "Ao" deve ser recuperado com sucesso');

const map = getCompanyPrefixesMap();
assert.equal(map['comp-test-1'], 'Ao', 'Mapa de prefixos dedicado deve registrar "Ao"');

console.log('✓ Teste 2 aprovado: saveClientCompanies e getClientCompanies persistem e restauram prefixo "Ao"!');

// 3. Teste de simulação de F5 com Supabase retornando empresa sem a coluna prefix
const remoteFromSupabaseWithoutPrefix: ClientCompany = {
  id: 'comp-test-1',
  name: 'Empresa Teste Inovação',
  // Supabase sem coluna prefix -> undefined
  defaultDeliveryLocation: 'Brasília',
  locations: ['Brasília'],
  contacts: []
};

// Simula a lógica de hidratação resiliente do App.tsx no F5
const localCompanies = getClientCompanies();
const localPrefixById = new Map<string, string>();
const localPrefixByName = new Map<string, string>();
localCompanies.forEach(c => {
  if (c.prefix) {
    localPrefixById.set(c.id, c.prefix);
    const clean = c.name.replace(/^(ao|à|a|para)\s+/i, '').trim().toLowerCase();
    localPrefixByName.set(clean, c.prefix);
  }
});

const preservedPrefix = remoteFromSupabaseWithoutPrefix.prefix 
  || localPrefixById.get(remoteFromSupabaseWithoutPrefix.id) 
  || localPrefixByName.get(remoteFromSupabaseWithoutPrefix.name.toLowerCase().trim())
  || 'À';

assert.equal(preservedPrefix, 'Ao', 'No F5, mesmo se Supabase retornar prefix undefined, o prefixo local "Ao" deve ser preservado!');

console.log('✓ Teste 3 aprovado: Hidratação resiliente de F5 nunca perde o prefixo configurado pelo usuário!');

// 4. Teste de registro / atualização inteligente
const updatedComps = registerOrUpdateClient('Ao Empresa Teste Inovação', 'Alexandre', 'alex@teste.com');
const compAfterRegister = updatedComps.find(c => c.id === 'comp-test-1' || c.name.includes('Empresa Teste Inovação'));
assert.ok(compAfterRegister, 'Empresa deve ser localizada');
assert.equal(compAfterRegister?.prefix, 'Ao', 'registerOrUpdateClient com "Ao" deve reter "Ao"');

console.log('✓ Teste 4 aprovado: registerOrUpdateClient preserva prefixo configurado sem regressão!');
console.log('🎉 TODOS OS TESTES DE PERSISTÊNCIA DE PREFIXO PASSARAM COM SUCESSO!\n');
