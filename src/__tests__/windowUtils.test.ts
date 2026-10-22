import assert from 'assert';
import { sanitizeExternalUrl, openInNewWindow } from '../utils/windowUtils';

console.log('🧪 Iniciando testes de abertura de links em nova janela (windowUtils)...');

// 1. Testes de sanitização de URL
assert.strictEqual(sanitizeExternalUrl(''), '');
assert.strictEqual(sanitizeExternalUrl(undefined), '');
assert.strictEqual(sanitizeExternalUrl(null), '');
assert.strictEqual(sanitizeExternalUrl('   '), '');
assert.strictEqual(sanitizeExternalUrl('https://mercadolivre.com.br/item/123'), 'https://mercadolivre.com.br/item/123');
assert.strictEqual(sanitizeExternalUrl('http://kabum.com.br'), 'http://kabum.com.br');
assert.strictEqual(sanitizeExternalUrl('www.amazon.com.br/dp/B08XYZ'), 'https://www.amazon.com.br/dp/B08XYZ');
assert.strictEqual(sanitizeExternalUrl('  fastshop.com.br/produto  '), 'https://fastshop.com.br/produto');

console.log('  ✅ 1. sanitizeExternalUrl normaliza protocolos e remove espaços com precisão');

// 2. Simulação de ambiente browser com mock de window.open
let openedUrl = '';
let openedTarget = '';
let openedFeatures = '';
let focusCalled = false;
let preventDefaultCalled = false;

// Configurar mock global de window
(globalThis as any).window = {
  screen: {
    availWidth: 1920,
    availHeight: 1080
  },
  open: (url: string, target: string, features?: string) => {
    openedUrl = url;
    openedTarget = target;
    openedFeatures = features || '';
    return {
      focus: () => {
        focusCalled = true;
      }
    };
  }
};

const fakeEvent = {
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  preventDefault: () => {
    preventDefaultCalled = true;
  }
} as any;

openInNewWindow('mercadolivre.com.br/p/item', fakeEvent);

assert.strictEqual(preventDefaultCalled, true, 'Deve prevenir comportamento padrão de abrir na mesma tela ou aba');
assert.strictEqual(openedUrl, 'https://mercadolivre.com.br/p/item');
assert.strictEqual(openedTarget, '_blank');
assert.ok(openedFeatures.includes('popup=yes'), 'Deve incluir popup=yes para forçar janela independente');
assert.ok(openedFeatures.includes('width='), 'Deve especificar largura calculada da janela');
assert.ok(openedFeatures.includes('height='), 'Deve especificar altura calculada da janela');
assert.strictEqual(focusCalled, true, 'Deve focar a nova janela aberta');

console.log('  ✅ 2. openInNewWindow aciona window.open com recursos de janela independente (popup e dimensões)');

// 3. Teste com tecla modificadora (Ctrl / Meta) para permitir comportamento nativo de aba
let modifierPrevented = false;
openedUrl = '';
const ctrlEvent = {
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  preventDefault: () => {
    modifierPrevented = true;
  }
} as any;

openInNewWindow('https://google.com', ctrlEvent);
assert.strictEqual(modifierPrevented, false, 'Não deve chamar preventDefault se Ctrl for pressionado');
assert.strictEqual(openedUrl, '', 'Não deve abrir janela independente artificial quando o usuário quer Ctrl+Click');

console.log('  ✅ 3. Cliques com teclas de atalho (Ctrl/Cmd/Shift) respeitam a navegação nativa do navegador');

console.log('🎉 Todos os testes de windowUtils passaram com sucesso!\n');
