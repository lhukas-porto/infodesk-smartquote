/**
 * TESTE DO SISTEMA DE APRENDIZADO CONTÍNUO DE FORNECEDORES
 * Valida a retenção, resolução e extração correta de nomes de fornecedores formatados
 * (acentos, maiúsculas/minúsculas e espaçamentos) a partir de URLs e histórico de produtos.
 */

import {
  extractDomainKeys,
  learnSupplier,
  getLearnedSupplierForUrl,
  learnSuppliersFromProducts,
  getAllRegisteredSuppliers
} from '../services/supplierLearningService';
import { extractStoreNameFromUrl } from '../utils/aiEmailParser';
import { Product } from '../types';

console.log('--- Testando Aprendizado Contínuo de Fornecedores ---');

// Teste 1: Fornecedor pré-cadastrado no mapa padrão (Palácio das Ferramentas)
const palacioUrl = 'https://www.palaciodasferramentas.com.br/parafusadeira-impacto-12v-dewalt';
const palacioName = extractStoreNameFromUrl(palacioUrl);
console.log(`[Teste 1] URL: ${palacioUrl} => Nome extraído: "${palacioName}"`);
if (palacioName !== 'Palácio das Ferramentas') {
  throw new Error(`Falha no Teste 1: esperava "Palácio das Ferramentas", mas obteve "${palacioName}"`);
}
console.log('✅ Teste 1 passou: Palácio das Ferramentas reconhecido com acentuação e espaços corretos!');

// Teste 2: Aprendizado dinâmico de nova loja/fornecedor via learnSupplier
const novaLojaUrl = 'https://www.ferramentaskennedy.com.br/furadeira-de-bancada';
// Antes de aprender
const antesAprendizado = extractStoreNameFromUrl(novaLojaUrl);
console.log(`[Teste 2] Antes do aprendizado: "${antesAprendizado}"`);

// Lucas salva produto com o nome correto
learnSupplier(novaLojaUrl, 'Ferramentas Kennedy');

// Depois de aprender
const depoisAprendizado = extractStoreNameFromUrl('https://www.ferramentaskennedy.com.br/outro-item/serra-circular');
console.log(`[Teste 2] Depois do aprendizado para outro item do mesmo domínio: "${depoisAprendizado}"`);
if (depoisAprendizado !== 'Ferramentas Kennedy') {
  throw new Error(`Falha no Teste 2: esperava "Ferramentas Kennedy", mas obteve "${depoisAprendizado}"`);
}
console.log('✅ Teste 2 passou: Novo fornecedor aprendido e reutilizado para novos links!');

// Teste 3: Aprendizado em lote a partir do catálogo de produtos salvos
const mockProducts: Product[] = [
  {
    id: 'prod-1',
    sku: 'SKU-001',
    name: 'Kit Brocas Makita',
    description: 'Kit de brocas para furadeira',
    sellingPrice: 99.90,
    costPrice: 65.00,
    category: 'Ferramentas & Instrumentos de Medição',
    unit: 'UN',
    supplier: 'Dutra Máquinas',
    sourceUrl: 'https://www.dutramaquinas.com.br/produto/kit-brocas',
    createdAt: '2026-10-22',
    lastUpdated: '2026-10-22'
  },
  {
    id: 'prod-2',
    sku: 'SKU-002',
    name: 'Trena Laser Bosch',
    description: 'Trena laser digital',
    sellingPrice: 350.00,
    costPrice: 220.00,
    category: 'Ferramentas & Instrumentos de Medição',
    unit: 'UN',
    supplier: 'Casa das Furadeiras',
    sourceUrl: 'https://casadasfuradeiras.com.br/trena-bosch-50m',
    createdAt: '2026-10-22',
    lastUpdated: '2026-10-22'
  }
];

learnSuppliersFromProducts(mockProducts);

const dutraName = extractStoreNameFromUrl('https://www.dutramaquinas.com.br/outro-produto');
const furadeirasName = extractStoreNameFromUrl('https://casadasfuradeiras.com.br/parafusadeira');

if (dutraName !== 'Dutra Máquinas') {
  throw new Error(`Falha no Teste 3 (Dutra Máquinas): esperava "Dutra Máquinas", mas obteve "${dutraName}"`);
}
if (furadeirasName !== 'Casa das Furadeiras') {
  throw new Error(`Falha no Teste 3 (Casa das Furadeiras): esperava "Casa das Furadeiras", mas obteve "${furadeirasName}"`);
}
console.log('✅ Teste 3 passou: Aprendizado em lote a partir de produtos existentes com sucesso!');

// Teste 4: Consulta de lista consolidada de fornecedores para auto-complete
const todosFornecedores = getAllRegisteredSuppliers(mockProducts);
console.log(`[Teste 4] Total de fornecedores conhecidos no sistema: ${todosFornecedores.length}`);
if (!todosFornecedores.includes('Palácio das Ferramentas')) {
  throw new Error('Falha no Teste 4: "Palácio das Ferramentas" deveria estar na lista');
}
if (!todosFornecedores.includes('Dutra Máquinas')) {
  throw new Error('Falha no Teste 4: "Dutra Máquinas" deveria estar na lista');
}
if (!todosFornecedores.includes('Ferramentas Kennedy')) {
  throw new Error('Falha no Teste 4: "Ferramentas Kennedy" deveria estar na lista');
}
console.log('✅ Teste 4 passou: Lista consolidada de fornecedores para autocomplete completa!');

console.log('🎉 TODOS OS TESTES DE APRENDIZADO DE FORNECEDOR PASSARAM COM SUCESSO!\n');
