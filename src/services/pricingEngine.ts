import { QuoteItem } from '../types';
import { suggestMarkupForItem } from '../utils/pricingProfiles';

export interface PricingCalculationOptions {
  globalShipping?: number;
  globalMarkup?: number;
  globalTax?: number;
  freightTotal?: number; // Frete geral da proposta (valor fixo)
}

export interface QuoteTotalsResult {
  totalCost: number;
  totalShipping: number;
  totalTaxes: number;
  totalProfit: number;
  totalAmount: number;
  averageMargin: number;
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

  items.forEach(item => {
    const qty = item.quantity > 0 ? item.quantity : 1;
    const itemCost = (item.costPrice || 0) * qty;
    const itemShipping = (item.shippingCost ?? defaultShipping) * qty;
    const itemTotal = (item.unitPrice || 0) * qty;

    const taxRate = (item.taxPercent ?? defaultTax) / 100;
    const itemTaxAmount = itemTotal * taxRate;

    totalCost += itemCost;
    totalShipping += itemShipping;
    totalAmount += itemTotal;
    totalTaxes += itemTaxAmount;
  });

  // Frete geral da proposta (quando o usuário define um valor global fixo de frete em vez de unitário por item)
  const generalFreight = Number(options.freightTotal || 0);
  if (generalFreight > 0) {
    totalAmount += generalFreight;
    totalShipping += generalFreight;
  }

  const totalProfit = totalAmount - totalCost - totalShipping - totalTaxes;
  const baseTotalCost = totalCost + totalShipping;
  const averageMargin = baseTotalCost > 0 ? (totalProfit / baseTotalCost) * 100 : 0;

  return {
    totalCost: Number(totalCost.toFixed(2)),
    totalShipping: Number(totalShipping.toFixed(2)),
    totalTaxes: Number(totalTaxes.toFixed(2)),
    totalProfit: Number(totalProfit.toFixed(2)),
    totalAmount: Number(totalAmount.toFixed(2)),
    averageMargin: Number(averageMargin.toFixed(1))
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
  const markup = item.markupPercent ?? options.globalMarkup ?? 25;
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
