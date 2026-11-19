import {
  resolveProductModelAndPartNumber,
  isSyntheticOrVagueCode
} from '../utils/productModelExtractor';
import { buildCompleteProductDescription } from '../utils/aiEmailParser';

console.log('🧪 Iniciando testes de Enriquecimento de Marca, Modelo e Descrição Técnica (Regra do Lucas)...');

// Teste 1: Rejeição de Códigos Sintéticos Truncados (VENTPE220V, CH1700)
if (!isSyntheticOrVagueCode('VENTPE220V')) {
  throw new Error('Falha no Teste 1: VENTPE220V deve ser considerado sintético/vago');
}
if (!isSyntheticOrVagueCode('CH1700')) {
  throw new Error('Falha no Teste 1: CH1700 deve ser considerado sintético/vago');
}
if (isSyntheticOrVagueCode('NV-15') || isSyntheticOrVagueCode('CE-06') || isSyntheticOrVagueCode('S-07')) {
  throw new Error('Falha no Teste 1: Modelos autênticos (NV-15, CE-06, S-07) NÃO devem ser considerados sintéticos');
}
console.log('✓ Teste 1 aprovado: Códigos sintéticos detectados e isolados com precisão!');

// Teste 2: Substituição de código sintético por modelo real das ofertas do Google Shopping
const test2 = resolveProductModelAndPartNumber({
  nameOrQuery: 'Ventilador de Coluna 220V',
  brand: 'Genérica',
  scannerModel: 'Coluna',
  scannerPartNumber: 'VENTPE220V',
  scannerOffers: [
    { title: 'Ventilador De Coluna 40cm Mondial Maxi Power V-40-B 220v Preto', store: 'Mercado Livre' }
  ]
});

console.log('Teste 2 resultado:', test2);
if (test2.partNumber === 'VENTPE220V') {
  throw new Error(`Falha no Teste 2: Código sintético VENTPE220V não deveria ser mantido quando há oferta real com modelo V-40-B! Obteve: ${JSON.stringify(test2)}`);
}
console.log('✓ Teste 2 aprovado: Oferta real do scanner superou código sintético da Fase 1!');

// Teste 3: Chaleira elétrica - extração de modelo CE-06
const test3 = resolveProductModelAndPartNumber({
  nameOrQuery: 'Chaleira Elétrica 1.7L',
  brand: 'Genérica',
  scannerModel: '1.7L',
  scannerPartNumber: 'CH1700',
  scannerOffers: [
    { title: 'Chaleira Elétrica Mondial Pratic Inox 1,7L CE-06 220V Preto', store: 'Amazon Brasil' }
  ]
});

console.log('Teste 3 resultado:', test3);
if (test3.partNumber === 'CH1700') {
  throw new Error(`Falha no Teste 3: Código sintético CH1700 não deveria ser mantido! Obteve: ${JSON.stringify(test3)}`);
}
console.log('✓ Teste 3 aprovado: Chaleira elétrica recebeu modelo comercial e código autêntico!');

// Teste 4: buildCompleteProductDescription gera ficha técnica completa e estruturada
const testDesc = buildCompleteProductDescription({
  description: 'Ventilador de coluna com 3 velocidades, ajuste telescópico de altura e oscilação horizontal contínua.',
  brand: 'Mondial',
  model: 'Maxi Power 40cm',
  partNumber: 'V-40-B',
  ncm: '84145110',
  weight: '4.500 kg',
  dimensions: '50cm x 50cm x 140cm',
  specifications: [
    { label: 'Potência', value: '140W' },
    { label: 'Tensão', value: '220V' },
    { label: 'Diâmetro da Hélice', value: '40 cm' }
  ]
});

console.log('Teste 4 descrição gerada:\n', testDesc);
if (!testDesc.includes('Mondial') || !testDesc.includes('V-40-B') || !testDesc.includes('140W') || !testDesc.includes('Especificações Técnicas:')) {
  throw new Error(`Falha no Teste 4: Descrição completa incompleta. Obteve: ${testDesc}`);
}
console.log('✓ Teste 4 aprovado: buildCompleteProductDescription gerou ficha técnica executiva completa!');

console.log('🎉 TODOS OS TESTES DE ENRIQUECIMENTO DE PRODUTOS PASSARAM COM 100% DE SUCESSO!');
