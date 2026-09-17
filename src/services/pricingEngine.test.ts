import { 
  calculateCommercialUnitPrice, 
  recalculateQuoteTotals,
  applyMarkupToItems,
  applyPricingProfileToItems
} from './pricingEngine';
import { QuoteItem } from '../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[FALHA NO TESTE]: ${message}`);
  }
}

console.log('🧪 Iniciando testes de precisão da PricingEngine (MEL-05)...');

// Cenário 1: Item >= R$ 10 com centavos < 0,50 (arredonda para baixo em inteiro)
// Custo 1000, Frete 0, Markup 20%, Imposto 10%
// Preço = (1000 * 1.20) / 0.90 = 1333.3333... => Arredonda para 1333
const price1 = calculateCommercialUnitPrice(1000, 0, 20, 10);
assert(price1 === 1333, `Esperado 1333, obteve ${price1}`);
console.log('✓ Cenário 1 aprovado (Preço >= 10 com centavos < 0.50 arredondado para inteiro)');

// Cenário 2: Custo zero
const price2 = calculateCommercialUnitPrice(0, 0, 25, 9.1);
assert(price2 === 0, `Esperado 0, obteve ${price2}`);
console.log('✓ Cenário 2 aprovado (Custo zero)');

// Cenário 3: Item >= R$ 10 com centavos >= 0,50 (arredonda para cima em inteiro)
// Custo 500, Frete 50 => Base 550, Markup 30%, Imposto 9.1%
// Numerador = 550 * 1.30 = 715
// Denominador = 1 - 0.091 = 0.909
// Preço = 715 / 0.909 = 786.5786... => Arredonda para 787
const price3 = calculateCommercialUnitPrice(500, 50, 30, 9.1);
assert(price3 === 787, `Esperado 787, obteve ${price3}`);
console.log('✓ Cenário 3 aprovado (Preço >= 10 com centavos >= 0.50 arredondado para inteiro)');

// Cenário 3.1: Item < R$ 10 (conector/parafuso) PRESERVA centavos exatos
// Custo 1.10, Frete 0, Markup 20%, Imposto 9.1%
// Preço = (1.10 * 1.20) / 0.909 = 1.32 / 0.909 = 1.4521... => 1.45
const priceLow1 = calculateCommercialUnitPrice(1.10, 0, 20, 9.1);
assert(priceLow1 === 1.45, `Esperado 1.45 (centavos preservados), obteve ${priceLow1}`);
console.log('✓ Cenário 3.1 aprovado (Item < R$ 10 preserva centavos exatos: R$ 1,45)');

// Cenário 3.2: Item < R$ 10 (cabo/patch cord) PRESERVA centavos exatos
// Custo 5.00, Frete 0, Markup 30%, Imposto 10%
// Preço = 6.50 / 0.90 = 7.222... => 7.22
const priceLow2 = calculateCommercialUnitPrice(5.00, 0, 30, 10);
assert(priceLow2 === 7.22, `Esperado 7.22 (centavos preservados), obteve ${priceLow2}`);
console.log('✓ Cenário 3.2 aprovado (Item < R$ 10 preserva centavos exatos: R$ 7,22)');

// Cenário 4: Recalcular totais de cotação
const mockItems: QuoteItem[] = [
  {
    id: 'it-1',
    itemNumber: 1,
    name: 'Switch 24p',
    description: '',
    quantity: 2,
    unit: 'UN',
    costPrice: 1000,
    shippingCost: 0,
    taxPercent: 10,
    markupPercent: 20,
    unitPrice: 1333.33,
    totalPrice: 2666.66
  },
  {
    id: 'it-2',
    itemNumber: 2,
    name: 'Patch Cord',
    description: '',
    quantity: 10,
    unit: 'UN',
    costPrice: 10,
    shippingCost: 0,
    taxPercent: 10,
    markupPercent: 50,
    unitPrice: 16.67,
    totalPrice: 166.70
  }
];

const totals = recalculateQuoteTotals(mockItems);
assert(totals.totalCost === 2100.00, `Total custo esperado 2100, obteve ${totals.totalCost}`);
assert(totals.totalAmount === 2833.36, `Total faturado esperado 2833.36, obteve ${totals.totalAmount}`);
assert(totals.totalTaxes === 283.34, `Total impostos esperado 283.34, obteve ${totals.totalTaxes}`);
assert(totals.totalProfit > 400 && totals.totalProfit < 500, `Lucro esperado positivo em torno de 450, obteve ${totals.totalProfit}`);
console.log('✓ Cenário 4 aprovado (Totais e lucros consolidados)');

// Cenário 5: Aplicação de Markup em lote
const updatedItems = applyMarkupToItems(mockItems, 25);
assert(updatedItems[0].markupPercent === 25, 'Markup do item 1 deve ser 25');
assert(updatedItems[1].markupPercent === 25, 'Markup do item 2 deve ser 25');
console.log('✓ Cenário 5 aprovado (Aplicação de markup em lote)');

// Cenário 6: Perfil dinâmico
const profiledItems = applyPricingProfileToItems(mockItems, 'corporativo_padrao');
// O patch cord (custo 10) deve receber markup maior que o switch (custo 1000)
assert(profiledItems[1].markupPercent > profiledItems[0].markupPercent, 'Item miúdo deve ter margem maior que item caro');
console.log('✓ Cenário 6 aprovado (Perfil de precificação inteligente)');

console.log('🎉 TODOS OS 6 TESTES DA PRICING ENGINE PASSARAM COM 100% DE SUCESSO!');
