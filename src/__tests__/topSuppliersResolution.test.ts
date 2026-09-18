/**
 * TESTE UNITÁRIO: RESOLUÇÃO INTELIGENTE DE TOP FORNECEDORES EM CUSTO
 * Valida que o Painel BI de Propostas identifica os reais fornecedores / distribuidores:
 * 1. Extração por Link Direto de Compra (sourceUrl): Amazon, Mercado Livre, Leroy Merlin, Agis Distribuição, Dufrio, Notecom, etc.
 * 2. Descarte de URLs de busca (ex: google.com/search) evitando atribuir "Google" como loja
 * 3. Associação inteligente com Catálogo de Produtos
 * 4. Detecção por marcas / fabricantes industriais (Furukawa, Schneider, Cisco, Dell)
 * 5. Eliminação do problema onde todos os itens caíam no genérico "Fornecedor Local"
 */

import { extractStoreNameFromUrl, resolveSupplierName } from '../utils/aiEmailParser';

console.log('--- INICIANDO TESTES DE RESOLUÇÃO DE TOP FORNECEDORES ---');

// Teste 1: Extração direta por URL de grandes lojas e marketplaces
const testCasesUrl = [
  { url: 'https://www.amazon.com.br/dp/B0BGL12Y9W', expected: 'Amazon' },
  { url: 'https://www.mercadolivre.com.br/produto/p/MLB50144894', expected: 'Mercado Livre' },
  { url: 'https://www.leroymerlin.com.br/perfil-u-aluminio', expected: 'Leroy Merlin' },
  { url: 'https://vendas.agis.com.br/impressora-zebra', expected: 'Agis Distribuição' },
  { url: 'https://www.dufrio.com.br/geladeira-consul', expected: 'Dufrio' },
  { url: 'https://www.notecom.com.br/placa-de-video', expected: 'Notecom' },
  { url: 'https://www.kalunga.com.br/prod/lapis-de-cor', expected: 'Kalunga' },
  { url: 'https://www.centralbrasilinstrumentos.com.br/certificado', expected: 'Central Brasil Instrumentos' },
  { url: 'https://www.kabum.com.br/produto/12345', expected: 'KaBuM!' },
  { url: 'https://www.lojaeletrica.com.br/cabo-rede', expected: 'Loja Elétrica' }
];

for (const tc of testCasesUrl) {
  const result = extractStoreNameFromUrl(tc.url);
  if (result !== tc.expected) {
    throw new Error(`Falha na extração de loja para "${tc.url}". Esperado: "${tc.expected}", obtido: "${result}"`);
  }
}
console.log('✅ Teste 1: extractStoreNameFromUrl extraiu corretamente todas as lojas e distribuidores corporativos.');

// Teste 2: Google Search URL não deve ser considerado loja
const googleSearchUrl = 'https://www.google.com/search?q=Conector%20Keystone%20Furukawa';
const googleResult = extractStoreNameFromUrl(googleSearchUrl);
if (googleResult !== '') {
  throw new Error(`URL de busca do Google não deveria retornar loja. Retornou: "${googleResult}"`);
}
console.log('✅ Teste 2: URLs de pesquisa do Google descartadas corretamente para não gerar "Google" como fornecedor.');

// Teste 3: Item com link de busca do Google mas marca Furukawa deve resolver para "Furukawa Electric"
const furukawaItem = {
  name: 'Conector keystone Furukawa Soho Plus RJ45 fêmea CAT6',
  sourceUrl: googleSearchUrl,
  costPrice: 17.04,
  quantity: 60
};
const furukawaSupp = resolveSupplierName(furukawaItem);
if (furukawaSupp !== 'Furukawa Electric') {
  throw new Error(`Esperado 'Furukawa Electric', obtido: '${furukawaSupp}'`);
}
console.log('✅ Teste 3: resolveSupplierName detectou marca Furukawa com sucesso quando URL era de pesquisa.');

// Teste 4: Item sem URL mas com produto vinculado no catálogo
const catalogMock = [
  {
    id: 'prod-123',
    name: 'Servidor PowerEdge R750',
    partNumber: 'PE-R750',
    supplier: 'Dell Brasil Comercial',
    costPrice: 25000
  }
];

const itemWithProd = {
  productId: 'prod-123',
  name: 'Servidor Corporativo',
  costPrice: 25000,
  quantity: 1
};
const resolvedFromCatalog = resolveSupplierName(itemWithProd, catalogMock as any);
if (resolvedFromCatalog !== 'Dell Brasil Comercial') {
  throw new Error(`Esperado 'Dell Brasil Comercial', obtido: '${resolvedFromCatalog}'`);
}
console.log('✅ Teste 4: resolveSupplierName obteve fornecedor diretamente do produto vinculado no catálogo.');

// Teste 5: Fornecedor genérico "Fornecedor Local" é substituído pela loja da URL
const itemWithGenericSupp = {
  name: 'Geladeira Cycle Defrost Duplex Consul',
  supplier: 'Fornecedor Local',
  sourceUrl: 'https://www.dufrio.com.br/geladeira',
  costPrice: 1799,
  quantity: 1
};
const resolvedDufrio = resolveSupplierName(itemWithGenericSupp);
if (resolvedDufrio !== 'Dufrio') {
  throw new Error(`Esperado 'Dufrio', obtido: '${resolvedDufrio}'`);
}
console.log('✅ Teste 5: "Fornecedor Local" foi substituído com precisão pela loja real da URL ("Dufrio").');

console.log('🎉 TODOS OS TESTES DE RESOLUÇÃO DE TOP FORNECEDORES PASSARAM COM SUCESSO!\n');
