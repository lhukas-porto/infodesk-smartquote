/**
 * TESTE UNITÁRIO: CICLO DO BOTÃO Aa (MAIÚSCULAS / MINÚSCULAS)
 * REGRA DO LUCAS: O primeiro clique no botão Aa deve SEMPRE deixar o texto em minúsculo!
 */

import { getNextTextCase, applyTextCase } from '../utils/aiEmailParser';

console.log('🧪 Iniciando testes do ciclo do botão Aa (Maiúsculas/Minúsculas)...');

// 1. Cenário: Produto com texto misto ou capitalizado
const originalProduct = 'Switch Dell PowerSwitch N1524P';
const firstActionStyle = getNextTextCase(originalProduct);

if (firstActionStyle !== 'lowercase') {
  throw new Error(`Falha: primeira ação para "${originalProduct}" foi "${firstActionStyle}", esperava-se "lowercase"!`);
}

const firstTransformed = applyTextCase(originalProduct, firstActionStyle);
if (firstTransformed !== 'switch dell powerswitch n1524p') {
  throw new Error(`Falha na transformação para minúsculo: obtido "${firstTransformed}"`);
}
console.log('✓ Teste 1 aprovado: Primeiro clique em produto misto deixa 100% minúsculo.');

// 2. Cenário: Produto em Title Case padrão do catálogo/cotação
const titleProduct = 'Teclado Sem Fio Logitech K380';
const titleActionStyle = getNextTextCase(titleProduct);
if (titleActionStyle !== 'lowercase') {
  throw new Error(`Falha: primeira ação para "${titleProduct}" foi "${titleActionStyle}", esperava-se "lowercase"!`);
}
console.log('✓ Teste 2 aprovado: Primeiro clique em produto Title Case deixa minúsculo.');

// 3. Cenário: Produto em MAIÚSCULAS (ex: vindo de nota fiscal ou OCR)
const upperProduct = 'CABO DE REDE FURUKAWA CAT6';
const upperActionStyle = getNextTextCase(upperProduct);
if (upperActionStyle !== 'lowercase') {
  throw new Error(`Falha: primeira ação para "${upperProduct}" foi "${upperActionStyle}", esperava-se "lowercase"!`);
}
console.log('✓ Teste 3 aprovado: Primeiro clique em produto MAIÚSCULO deixa minúsculo.');

// 4. Cenário: Ciclo contínuo a partir do minúsculo (simulando múltiplos cliques seguidos)
const step1 = 'cabo furukawa cat6 azul';
const step2Style = getNextTextCase(step1); // primeiro clique num texto já minúsculo -> title
if (step2Style !== 'title') {
  throw new Error(`Falha: após minúsculo esperava-se "title", obtido "${step2Style}"`);
}

const step2 = applyTextCase(step1, step2Style); // "Cabo Furukawa Cat6 Azul"
const step3Style = getNextTextCase(step2, step2Style); // segundo clique seguido -> sentence
if (step3Style !== 'sentence') {
  throw new Error(`Falha: após title esperava-se "sentence", obtido "${step3Style}"`);
}

const step3 = applyTextCase(step2, step3Style); // "Cabo furukawa cat6 azul"
const step4Style = getNextTextCase(step3, step3Style); // terceiro clique seguido -> uppercase
if (step4Style !== 'uppercase') {
  throw new Error(`Falha: após sentence esperava-se "uppercase", obtido "${step4Style}"`);
}

const step4 = applyTextCase(step3, step4Style); // "CABO FURUKAWA CAT6 AZUL"
const step5Style = getNextTextCase(step4, step4Style); // quarto clique seguido -> retorna para lowercase
if (step5Style !== 'lowercase') {
  throw new Error(`Falha: após uppercase esperava-se retornar para "lowercase", obtido "${step5Style}"`);
}
console.log('✓ Teste 4 aprovado: Ciclo completo (minúsculo -> title -> sentence -> uppercase -> minúsculo) validado!');

console.log('🎉 TODOS OS TESTES DO BOTÃO Aa PASSARAM COM 100% DE SUCESSO!\n');
