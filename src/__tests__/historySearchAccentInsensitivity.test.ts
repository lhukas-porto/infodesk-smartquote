import { normalizeSearchText } from '../utils/aiEmailParser';
import { Quote } from '../types';

console.log('🧪 Iniciando testes de Busca Insensível a Acentos, Cedilha e Caixa Alta/Baixa...');

// 1. Testes unitários da função normalizeSearchText
function assertEqual(actual: string, expected: string, msg: string) {
  if (actual !== expected) {
    throw new Error(`FALHA no teste [${msg}]: Esperado "${expected}", mas obteve "${actual}"`);
  }
}

// Cedilha
assertEqual(normalizeSearchText('Preço'), 'preco', 'Cedilha minúscula e maiúscula');
assertEqual(normalizeSearchText('PREÇO'), 'preco', 'Cedilha maiúscula');
assertEqual(normalizeSearchText('Atenção'), 'atencao', 'Cedilha e til');
assertEqual(normalizeSearchText('ATENÇÃO'), 'atencao', 'Cedilha e til maiúsculas');

// Acentos variados
assertEqual(normalizeSearchText('Cotação'), 'cotacao', 'Cotação normalizada');
assertEqual(normalizeSearchText('Memória'), 'memoria', 'Acento agudo');
assertEqual(normalizeSearchText('MEMÓRIA'), 'memoria', 'Acento agudo maiúsculo');
assertEqual(normalizeSearchText('Eletrônico'), 'eletronico', 'Circunflexo');
assertEqual(normalizeSearchText('ELETRÔNICO'), 'eletronico', 'Circunflexo maiúsculo');
assertEqual(normalizeSearchText('Informática'), 'informatica', 'Informática');
assertEqual(normalizeSearchText('Brasília'), 'brasilia', 'Brasília');
assertEqual(normalizeSearchText('São Paulo'), 'sao paulo', 'São Paulo');

console.log('✓ Teste 1 aprovado: normalizeSearchText remove perfeitamente acentos, cedilhas e uniformiza caixa!');

// 2. Simulação de busca no Histórico de Orçamentos
const mockQuotes: Partial<Quote>[] = [
  {
    id: 'q1',
    code: 'INF-001',
    clientCompany: 'Fundação Educacional',
    contactPerson: 'João da Conceição',
    items: [
      {
        id: 'i1',
        itemNumber: 1,
        name: 'Memória RAM Kingston Fury 16GB DDR4',
        description: 'Módulo de memória de alta performance',
        partNumber: 'KF432C16BB/16',
        ncm: '8473.30.42',
        quantity: 2,
        unit: 'Un.',
        costPrice: 200,
        markupPercent: 30,
        unitPrice: 260,
        totalPrice: 520
      }
    ] as any
  },
  {
    id: 'q2',
    code: 'INF-002',
    clientCompany: 'Prefeitura Municipal',
    contactPerson: 'Márcia Araújo',
    items: [
      {
        id: 'i2',
        itemNumber: 1,
        name: 'Nobreak Senoidal APC 1500VA',
        description: 'Proteção elétrica profissional',
        partNumber: 'BR1500G-BR',
        ncm: '8504.40.40',
        quantity: 1,
        unit: 'Un.',
        costPrice: 1200,
        markupPercent: 30,
        unitPrice: 1560,
        totalPrice: 1560
      }
    ] as any
  }
];

function searchQuotes(searchTerm: string): Partial<Quote>[] {
  const term = normalizeSearchText(searchTerm);
  if (!term) return mockQuotes;

  return mockQuotes.filter(q => {
    const comp = normalizeSearchText(q.clientCompany);
    const contact = normalizeSearchText(q.contactPerson);
    const code = normalizeSearchText(q.code);
    const itemMatch = Array.isArray(q.items) && q.items.some(it => {
      return (
        normalizeSearchText(it.name).includes(term) ||
        normalizeSearchText(it.description).includes(term) ||
        normalizeSearchText(it.partNumber).includes(term)
      );
    });
    return comp.includes(term) || contact.includes(term) || code.includes(term) || itemMatch;
  });
}

// Cenário A: Usuário digita sem acento "memoria", deve achar "Memória RAM"
const resA = searchQuotes('memoria');
if (resA.length !== 1 || resA[0].id !== 'q1') {
  throw new Error('FALHA: Busca por "memoria" sem acento não encontrou o orçamento com "Memória RAM"');
}
console.log('✓ Teste 2 aprovado: Busca por "memoria" (sem acento) encontrou produto com "Memória"');

// Cenário B: Usuário digita com acento "MEMÓRIA", deve achar "Memória RAM"
const resB = searchQuotes('MEMÓRIA');
if (resB.length !== 1 || resB[0].id !== 'q1') {
  throw new Error('FALHA: Busca por "MEMÓRIA" em caixa alta com acento falhou');
}
console.log('✓ Teste 3 aprovado: Busca por "MEMÓRIA" (caixa alta e com acento) encontrou com sucesso');

// Cenário C: Usuário digita com cedilha "Fundação" ou sem cedilha "fundacao"
const resC = searchQuotes('fundacao');
if (resC.length !== 1 || resC[0].id !== 'q1') {
  throw new Error('FALHA: Busca por "fundacao" sem cedilha falhou ao encontrar "Fundação"');
}
console.log('✓ Teste 4 aprovado: Busca por "fundacao" sem cedilha encontrou "Fundação"');

// Cenário D: Usuário busca por produto com cedilha ou sem cedilha / til: "Conceição" / "conceicao"
const resD = searchQuotes('conceicao');
if (resD.length !== 1 || resD[0].id !== 'q1') {
  throw new Error('FALHA: Busca por comprador "conceicao" sem cedilha/til falhou');
}
console.log('✓ Teste 5 aprovado: Busca por "conceicao" encontrou "João da Conceição"');

// Cenário E: Usuário busca por produto com acento "elétrica" / "eletrica"
const resE = searchQuotes('ELETRICA');
if (resE.length !== 1 || resE[0].id !== 'q2') {
  throw new Error('FALHA: Busca por descrição "ELETRICA" falhou ao encontrar "elétrica"');
}
console.log('✓ Teste 6 aprovado: Busca por "ELETRICA" encontrou produto com descrição "elétrica"');

console.log('🎉 TODOS OS TESTES DE BUSCA INSENSÍVEL A ACENTOS, CEDILHA E CAIXA PASSARAM COM SUCESSO!\n');
