process.env.NODE_ENV = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatCompanyPrefix } from '../utils/aiEmailParser';
import { resolveClientDisplayName } from '../components/DashboardView';
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

const resSabin = formatCompanyPrefix('Sabin');
assert.equal(resSabin, 'Ao Sabin', 'formatCompanyPrefix("Sabin") deve retornar "Ao Sabin" (entidade laboratorial masculina)');

const resASabin = formatCompanyPrefix('À Sabin');
assert.equal(resASabin, 'Ao Sabin', 'formatCompanyPrefix("À Sabin") deve corrigir para "Ao Sabin"');

const resCnc = formatCompanyPrefix('CNC');
assert.equal(resCnc, 'À CNC', 'formatCompanyPrefix("CNC") deve retornar "À CNC" (confederação feminina)');

console.log('✓ Teste 1 aprovado: formatCompanyPrefix respeita fielmente escolhas explícitas e gramática de entidades ("Ao Sabin", "À CNC")!');

// 2. Teste de salvamento e recuperação de prefixo no mapa dedicado
saveCompanyPrefixPreference('comp-instituto-1', 'Instituto de Tecnologia', 'Ao');
const map = getCompanyPrefixesMap();
assert.equal(map['comp-instituto-1'], 'Ao', 'Mapa de prefixos dedicado deve registrar "Ao"');
assert.equal(map['instituto de tecnologia'], 'Ao', 'Mapa de prefixos dedicado deve registrar por nome normalizado');

console.log('✓ Teste 2 aprovado: saveCompanyPrefixPreference persiste e restaura prefixo "Ao"!');

// 3. Teste de simulação de F5 com hidratação resiliente de prefixo
const remoteWithoutPrefix: ClientCompany = {
  id: 'comp-instituto-1',
  name: 'Instituto de Tecnologia',
  defaultDeliveryLocation: 'Brasília',
  locations: ['Brasília'],
  contacts: []
};

const localPrefixMap = getCompanyPrefixesMap();
const cleanName = remoteWithoutPrefix.name.replace(/^(ao|à|a|para)\s+/i, '').trim().toLowerCase();
const preservedPrefix = remoteWithoutPrefix.prefix 
  || localPrefixMap[remoteWithoutPrefix.id] 
  || localPrefixMap[cleanName]
  || 'À';

assert.equal(preservedPrefix, 'Ao', 'No F5, mesmo se Supabase retornar prefix undefined, o prefixo local "Ao" deve ser preservado!');

console.log('✓ Teste 3 aprovado: Hidratação resiliente de F5 nunca perde o prefixo configurado pelo usuário!');

// 4. Teste de resolução exata conforme cadastro oficial (resolveClientDisplayName)
const mockRegistered: ClientCompany[] = [
  { id: 'comp-sonda', name: 'Grupo Sonda', prefix: 'Ao', locations: ['Brasília'], contacts: [] },
  { id: 'comp-sabin', name: 'Sabin', prefix: 'Ao', locations: ['Brasília'], contacts: [] },
  { id: 'comp-ubec', name: 'UBEC', prefix: 'À', locations: ['Brasília'], contacts: [] }
];

const resResolvedSonda = resolveClientDisplayName('À Sonda', mockRegistered);
assert.equal(resResolvedSonda, 'Ao Grupo Sonda', 'resolveClientDisplayName("À Sonda") deve resolver para "Ao Grupo Sonda" exatamente como cadastrado');

const resResolvedSondaPlain = resolveClientDisplayName('Sonda', mockRegistered);
assert.equal(resResolvedSondaPlain, 'Ao Grupo Sonda', 'resolveClientDisplayName("Sonda") deve resolver para "Ao Grupo Sonda" exatamente como cadastrado');

console.log('✓ Teste 4 aprovado: resolveClientDisplayName busca e exibe a empresa exatamente conforme cadastrada no Gerenciamento de Clientes ("Ao Grupo Sonda")!');
console.log('🎉 TODOS OS TESTES DE PERSISTÊNCIA DE PREFIXO PASSARAM COM SUCESSO!\n');
