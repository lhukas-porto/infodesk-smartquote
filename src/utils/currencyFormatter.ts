/**
 * Utilitário central de formatação monetária (Padrão Oficial Infodesk SmartQuote)
 * Garante em 100% dos locais:
 * - Símbolo oficial "R$ "
 * - Ponto (.) como separador de milhar para valores a partir de 1.000
 * - Vírgula (,) como separador decimal com 2 casas
 * Exemplo oficial: 32645.74 -> "R$ 32.645,74"
 */

export function formatBRL(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(Number(value))) {
    return 'R$ 0,00';
  }
  const num = Number(value);
  if (num < 0) {
    return `-R$ ${Math.abs(num).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCurrencyPtBr(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(Number(value))) {
    return '0,00';
  }
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parsePtBrCurrency(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  const sanitized = value.toString().trim().replace(/R\$\s?/gi, '').replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(sanitized);
  return isNaN(parsed) ? 0 : parsed;
}
