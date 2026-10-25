import { QuoteItem } from '../types';
import { suggestMarkupForItem } from '../utils/pricingProfiles';

export interface PricingCalculationOptions {
  globalShipping?: number;
  globalMarkup?: number;
  globalTax?: number;
}

export interface QuoteTotalsResult {
  totalCost: number;
  totalShipping: number;
  totalTaxes: number;
  totalProfit: number;
  totalAmount: number;
  averageMargin: number;
  // Totais separados de Itens Opcionais / Sugestões
  optionalTotalAmount: number;
  optionalTotalCost: number;
  optionalTotalShipping: number;
  optionalTotalProfit: number;
  optionalItemsCount: number;
}

export interface TargetPriceCalculationResult {
  targetTotal: number;
  calculatedTotal: number;
  difference: number;
  suggestedMarkupPercent: number;
  netProfit: number;
  profitMarginPercent: number;
  isHealthyMargin: boolean; // >= 14%
  itemsCount: number;
}

/**
 * Aplica a regra de arredondamento comercial da Infodesk (solicitada por Lucas):
 * - Abaixo de R$ 10,00: preserva centavos exatos (2 casas decimais) para evitar prejuízo em itens de baixo custo.
 * - A partir de R$ 10,00: se centavos < 0,50 arredonda pra baixo, se >= 0,50 arredonda pra cima (inteiro comercial).
 */
export function applyCommercialPriceRounding(rawPrice: number): number {
  if (rawPrice <= 0) return 0;
  if (rawPrice < 10) {
    return Number(rawPrice.toFixed(2));
  }
  return Math.round(rawPrice);
}

/**
 * Calcula o Preço de Venda Comercial unitário garantindo:
 * - Lucro Líquido (Markup) incidindo sobre o Custo Real (Custo + Frete)
 * - Impostos incidindo sobre o Preço Faturado de Venda (Imposto por dentro)
 * - Regra de arredondamento comercial Lucas: centavos exatos para < R$ 10 e inteiros para >= R$ 10
 */
export function calculateCommercialUnitPrice(
  costPrice: number,
  shippingCost: number = 0,
  markupPercent: number = 23.5,
  taxPercent: number = 9.1
): number {
  const baseCost = Number(costPrice || 0) + Number(shippingCost || 0);
  if (baseCost <= 0) return 0;

  const taxRate = Number(taxPercent || 0) / 100;
  const marginRate = Number(markupPercent || 0) / 100;
  const netDivisor = 1 - taxRate;

  // Proteção contra alíquota >= 100%
  const rawPrice = netDivisor <= 0.01
    ? (baseCost * (1 + marginRate)) / 0.01
    : (baseCost * (1 + marginRate)) / netDivisor;

  return applyCommercialPriceRounding(rawPrice);
}

/**
 * Calcula a margem de lucro % (markup sobre o custo) dado o preço de venda, custo, frete e imposto
 * Fórmula:
 * Lucro Líquido = Preço * (1 - Imposto%) - (Custo + Frete)
 * Margem % = (Lucro Líquido / (Custo + Frete)) * 100
 */
export function calculateMarkupFromUnitPrice(
  unitPrice: number,
  costPrice: number,
  shippingCost: number = 0,
  taxPercent: number = 9.1
): number {
  const baseCost = Number(costPrice || 0) + Number(shippingCost || 0);
  if (baseCost <= 0 || unitPrice <= 0) return 0;

  const taxRate = Number(taxPercent || 0) / 100;
  const netRevenue = unitPrice * (1 - taxRate);
  const netProfit = netRevenue - baseCost;
  const markupRate = (netProfit / baseCost) * 100;
  return Number(markupRate.toFixed(2));
}

/**
 * Recalcula todos os totais financeiros e fiscais de uma lista de itens da cotação.
 * Metodologia padrão Infodesk:
 * - Lucro Líquido Real = Total Faturado - Custos de Mercadoria - Fretes Totais - Impostos
 * - Margem Líquida % = (Lucro Líquido / (Custo + Frete)) * 100
 */
export function recalculateQuoteTotals(
  items: QuoteItem[],
  options: PricingCalculationOptions = {}
): QuoteTotalsResult {
  const defaultShipping = options.globalShipping ?? 0;
  const defaultTax = options.globalTax ?? 9.1;

  let totalCost = 0;
  let totalShipping = 0;
  let totalAmount = 0;
  let totalTaxes = 0;

  let optionalTotalCost = 0;
  let optionalTotalShipping = 0;
  let optionalTotalAmount = 0;
  let optionalTotalTaxes = 0;
  let optionalItemsCount = 0;

  items.forEach(item => {
    const qty = item.quantity > 0 ? item.quantity : 1;
    const itemCost = (item.costPrice || 0) * qty;
    const itemShipping = (item.shippingCost ?? defaultShipping) * qty;
    const itemTotal = (item.unitPrice || 0) * qty;

    const taxRate = (item.taxPercent ?? defaultTax) / 100;
    const itemTaxAmount = itemTotal * taxRate;

    if (item.isOptional === true) {
      optionalTotalCost += itemCost;
      optionalTotalShipping += itemShipping;
      optionalTotalAmount += itemTotal;
      optionalTotalTaxes += itemTaxAmount;
      optionalItemsCount++;
    } else {
      totalCost += itemCost;
      totalShipping += itemShipping;
      totalAmount += itemTotal;
      totalTaxes += itemTaxAmount;
    }
  });

  const totalProfit = totalAmount - totalCost - totalShipping - totalTaxes;
  const baseTotalCost = totalCost + totalShipping;
  const averageMargin = baseTotalCost > 0 ? (totalProfit / baseTotalCost) * 100 : 0;

  const optionalTotalProfit = optionalTotalAmount - optionalTotalCost - optionalTotalShipping - optionalTotalTaxes;

  return {
    totalCost: Number(totalCost.toFixed(2)),
    totalShipping: Number(totalShipping.toFixed(2)),
    totalTaxes: Number(totalTaxes.toFixed(2)),
    totalProfit: Number(totalProfit.toFixed(2)),
    totalAmount: Number(totalAmount.toFixed(2)),
    averageMargin: Number(averageMargin.toFixed(1)),
    optionalTotalAmount: Number(optionalTotalAmount.toFixed(2)),
    optionalTotalCost: Number(optionalTotalCost.toFixed(2)),
    optionalTotalShipping: Number(optionalTotalShipping.toFixed(2)),
    optionalTotalProfit: Number(optionalTotalProfit.toFixed(2)),
    optionalItemsCount
  };
}

/**
 * Motor de Preço Alvo (Reverse Markup):
 * Dado um valor final desejado pelo cliente (ex: R$ 5.000,00), calcula o markup uniforme ideal
 * considerando os custos individuais, impostos e a regra oficial de arredondamento comercial da Infodesk.
 */
export function calculateMarkupForTargetTotal(
  items: QuoteItem[],
  targetTotal: number,
  options: PricingCalculationOptions = {}
): TargetPriceCalculationResult | null {
  const baseItems = items.filter(it => !it.isOptional && ((it.costPrice || 0) > 0 || (it.unitPrice || 0) > 0));
  if (baseItems.length === 0 || targetTotal <= 0) return null;

  const defaultShipping = options.globalShipping ?? 0;
  const defaultTax = options.globalTax ?? 9.1;

  let totalBaseCost = 0;
  baseItems.forEach(it => {
    const qty = it.quantity > 0 ? it.quantity : 1;
    const cost = (it.costPrice || 0) + (it.shippingCost ?? defaultShipping);
    totalBaseCost += cost * qty;
  });

  if (totalBaseCost <= 0) return null;

  // Estimativa teórica inicial do markup
  const avgTaxRate = defaultTax / 100;
  const netRevenueNeeded = targetTotal * (1 - avgTaxRate);
  const estimatedMarkup = ((netRevenueNeeded - totalBaseCost) / totalBaseCost) * 100;

  let bestMarkup = estimatedMarkup;
  let minDiff = Infinity;
  let bestCalculatedTotal = 0;

  // Varredura fina em janela de +/- 10% com passos de 0.1% para bater a regra de arredondamento comercial
  const startM = Math.max(-40, estimatedMarkup - 12);
  const endM = estimatedMarkup + 12;

  for (let m = startM; m <= endM; m += 0.1) {
    let currentTotal = 0;
    baseItems.forEach(it => {
      const qty = it.quantity > 0 ? it.quantity : 1;
      const shipping = it.shippingCost ?? defaultShipping;
      const tax = it.taxPercent ?? defaultTax;
      const p = calculateCommercialUnitPrice(it.costPrice || 0, shipping, m, tax);
      currentTotal += p * qty;
    });

    const diff = Math.abs(currentTotal - targetTotal);
    if (diff < minDiff) {
      minDiff = diff;
      bestMarkup = Number(m.toFixed(1));
      bestCalculatedTotal = currentTotal;
      if (diff === 0) break;
    }
  }

  // Apura impostos e lucro líquido com o melhor markup encontrado
  let totalTaxes = 0;
  baseItems.forEach(it => {
    const qty = it.quantity > 0 ? it.quantity : 1;
    const shipping = it.shippingCost ?? defaultShipping;
    const tax = it.taxPercent ?? defaultTax;
    const p = calculateCommercialUnitPrice(it.costPrice || 0, shipping, bestMarkup, tax);
    totalTaxes += (p * qty) * (tax / 100);
  });

  const netProfit = bestCalculatedTotal - totalBaseCost - totalTaxes;
  const profitMarginPercent = totalBaseCost > 0 ? (netProfit / totalBaseCost) * 100 : 0;

  return {
    targetTotal: Number(targetTotal.toFixed(2)),
    calculatedTotal: Number(bestCalculatedTotal.toFixed(2)),
    difference: Number((bestCalculatedTotal - targetTotal).toFixed(2)),
    suggestedMarkupPercent: bestMarkup,
    netProfit: Number(netProfit.toFixed(2)),
    profitMarginPercent: Number(profitMarginPercent.toFixed(1)),
    isHealthyMargin: profitMarginPercent >= 14,
    itemsCount: baseItems.length
  };
}

/**
 * Atualiza um único item recalculando seu preço unitário e preço total
 */
export function recalculateSingleItem(
  item: QuoteItem,
  options: PricingCalculationOptions = {}
): QuoteItem {
  const shipping = item.shippingCost ?? options.globalShipping ?? 0;
  const markup = item.markupPercent ?? options.globalMarkup ?? 23.5;
  const tax = item.taxPercent ?? options.globalTax ?? 9.1;

  const unitPrice = calculateCommercialUnitPrice(item.costPrice || 0, shipping, markup, tax);
  const qty = item.quantity > 0 ? item.quantity : 1;
  const totalPrice = Number((unitPrice * qty).toFixed(2));

  return {
    ...item,
    unitPrice,
    totalPrice
  };
}

/**
 * Aplica um markup em lote para itens selecionados ou para toda a cotação
 */
export function applyMarkupToItems(
  items: QuoteItem[],
  newMarkup: number,
  targetItemIds?: string[],
  options: PricingCalculationOptions = {}
): QuoteItem[] {
  return items.map(item => {
    if (targetItemIds && !targetItemIds.includes(item.id)) {
      return item;
    }

    const shipping = item.shippingCost ?? options.globalShipping ?? 0;
    const tax = item.taxPercent ?? options.globalTax ?? 9.1;
    const unitPrice = calculateCommercialUnitPrice(item.costPrice || 0, shipping, newMarkup, tax);
    const qty = item.quantity > 0 ? item.quantity : 1;

    return {
      ...item,
      markupPercent: newMarkup,
      unitPrice,
      totalPrice: Number((unitPrice * qty).toFixed(2))
    };
  });
}

/**
 * Aplica um perfil de precificação dinâmica sugerindo markups por categoria / faixa de preço
 */
export function applyPricingProfileToItems(
  items: QuoteItem[],
  profileId: string,
  options: PricingCalculationOptions = {}
): QuoteItem[] {
  return items.map(item => {
    const suggestedMarkup = suggestMarkupForItem(
      profileId,
      item.costPrice || 0,
      item.name,
      item.description
    );
    const shipping = item.shippingCost ?? options.globalShipping ?? 0;
    const tax = item.taxPercent ?? options.globalTax ?? 9.1;
    const unitPrice = calculateCommercialUnitPrice(item.costPrice || 0, shipping, suggestedMarkup, tax);
    const qty = item.quantity > 0 ? item.quantity : 1;

    return {
      ...item,
      markupPercent: suggestedMarkup,
      unitPrice,
      totalPrice: Number((unitPrice * qty).toFixed(2))
    };
  });
}
