import React, { useState, useMemo } from 'react';
import { ShieldCheck, AlertTriangle, XCircle, TrendingUp, DollarSign, Percent, ArrowRight, RotateCcw, Check, Sparkles } from 'lucide-react';

interface ProfitShieldSimulatorProps {
  totalCost: number;
  currentTotalAmount: number;
  currentProfit: number;
  currentMarginPercent: number;
  globalTaxPercent?: number;
  globalShippingCost?: number;
  onApplyDiscount?: (discountPercent: number) => void;
  onClose?: () => void;
}

export const ProfitShieldSimulator: React.FC<ProfitShieldSimulatorProps> = ({
  totalCost,
  currentTotalAmount,
  currentProfit,
  currentMarginPercent,
  globalTaxPercent = 6,
  globalShippingCost = 0,
  onApplyDiscount,
  onClose
}) => {
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [extraShipping, setExtraShipping] = useState<number>(0);
  const [minSafeMargin, setMinSafeMargin] = useState<number>(18); // Limite de segurança padrão: 18%

  // Cálculos do Cenário Simulado
  const simulation = useMemo(() => {
    // Valor total com desconto
    const discountMultiplier = (100 - discountPercent) / 100;
    const baseNewTotal = currentTotalAmount * discountMultiplier;
    const simulatedTotal = baseNewTotal + extraShipping;

    // Impostos sobre o novo total faturado
    const simulatedTax = simulatedTotal * (globalTaxPercent / 100);

    // Custo total acumulado (Custo dos produtos + frete original + frete extra)
    const effectiveTotalCost = totalCost + globalShippingCost + extraShipping;

    // Lucro líquido simulado = Total Faturado - Custo Produtos - Fretes - Impostos
    const simulatedProfit = simulatedTotal - effectiveTotalCost - simulatedTax;

    // Margem líquida percentual simulada
    const simulatedMarginPercent = simulatedTotal > 0 ? (simulatedProfit / simulatedTotal) * 100 : 0;

    // Variação de lucro em relação ao original
    const profitDifference = simulatedProfit - currentProfit;

    // Avaliação de Risco
    let status: 'safe' | 'warning' | 'danger' = 'safe';
    let statusTitle = 'Margem Saudável & Blindada';
    let statusDesc = 'O lucro projetado está dentro dos parâmetros ideais da Infodesk.';

    if (simulatedMarginPercent < minSafeMargin && simulatedMarginPercent >= 12) {
      status = 'warning';
      statusTitle = 'Atenção: Margem Abaixo do Ideal';
      statusDesc = `A margem caiu para ${simulatedMarginPercent.toFixed(1)}% (abaixo do teto recomendado de ${minSafeMargin}%).`;
    } else if (simulatedMarginPercent < 12) {
      status = 'danger';
      statusTitle = 'Alerta Anti-Prejuízo: Margem Crítica!';
      statusDesc = 'Risco iminente de cobrir apenas impostos e fretes. Não recomendado fechar neste valor sem renegociar com fornecedores.';
    }

    return {
      simulatedTotal,
      simulatedProfit,
      simulatedMarginPercent,
      profitDifference,
      status,
      statusTitle,
      statusDesc
    };
  }, [totalCost, currentTotalAmount, currentProfit, globalTaxPercent, globalShippingCost, discountPercent, extraShipping, minSafeMargin]);

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="bg-white border border-slate-300 rounded-2xl p-5 shadow-sm space-y-4 animate-in fade-in duration-200">
      
      {/* Topo do Card de Simulação */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0 border border-amber-300/60">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Simulador de Cenários & Blindagem Anti-Prejuízo
              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-mono font-bold rounded-md border border-slate-300">
                Margem Segura: {minSafeMargin}%
              </span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Teste descontos e custos extras para garantir negociações sempre lucrativas
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="self-end sm:self-center text-xs font-semibold text-slate-500 hover:text-slate-800 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition"
          >
            Fechar Simulador
          </button>
        )}
      </div>

      {/* Controles de Simulação: Desconto e Frete */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Desconto Comercial */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-amber-600" />
              Desconto Comercial Ofertado ao Cliente
            </span>
            <span className="font-mono font-bold text-slate-900 text-xs">
              {discountPercent}%
            </span>
          </label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[0, 2, 3, 5, 7, 10].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setDiscountPercent(val)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                  discountPercent === val
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-300'
                }`}
              >
                {val === 0 ? 'Sem Desconto' : `${val}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Frete Adicional / Inesperado */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-blue-700" />
              Frete Adicional ou Despesa Extra (R$)
            </span>
            <span className="font-mono font-bold text-slate-900 text-xs">
              R$ {formatCurrency(extraShipping)}
            </span>
          </label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[0, 50, 100, 150, 250].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setExtraShipping(val)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                  extraShipping === val
                    ? 'bg-blue-700 text-white shadow-2xs'
                    : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-300'
                }`}
              >
                {val === 0 ? 'R$ 0,00' : `+ R$ ${val}`}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Painel do Resultado Simulado & Termômetro Anti-Prejuízo */}
      <div className={`p-4 rounded-xl border transition-all ${
        simulation.status === 'safe'
          ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
          : simulation.status === 'warning'
          ? 'bg-amber-50/80 border-amber-300 text-amber-950'
          : 'bg-rose-50 border-rose-300 text-rose-950'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          <div className="flex items-center gap-2.5">
            {simulation.status === 'safe' && <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />}
            {simulation.status === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />}
            {simulation.status === 'danger' && <XCircle className="w-5 h-5 text-rose-600 shrink-0" />}
            <div>
              <p className="text-xs font-bold">{simulation.statusTitle}</p>
              <p className="text-[11px] opacity-80">{simulation.statusDesc}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-right">
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-500 block">Novo Total Proposta</span>
              <span className="text-sm font-bold font-mono text-slate-900">
                R$ {formatCurrency(simulation.simulatedTotal)}
              </span>
            </div>
            <div className="pl-3 border-l border-slate-300/80">
              <span className="text-[10px] uppercase font-semibold text-slate-500 block">Lucro Simulado</span>
              <span className={`text-sm font-bold font-mono ${
                simulation.status === 'danger' ? 'text-rose-700' : 'text-emerald-700'
              }`}>
                R$ {formatCurrency(simulation.simulatedProfit)}
                <span className="text-[10px] ml-1 opacity-75">
                  ({simulation.simulatedMarginPercent.toFixed(1)}%)
                </span>
              </span>
            </div>
          </div>

        </div>

        {/* Impacto no Bolso */}
        {discountPercent > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 flex items-center justify-between text-xs">
            <span className="text-[11px] font-medium opacity-80">
              Impacto deste desconto na margem da proposta:
            </span>
            <span className="font-mono font-bold text-amber-800">
              {simulation.profitDifference < 0 ? `- R$ ${formatCurrency(Math.abs(simulation.profitDifference))}` : 'Sem alteração'}
            </span>
          </div>
        )}
      </div>

      {/* Ações do Simulador */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => {
            setDiscountPercent(0);
            setExtraShipping(0);
          }}
          className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restaurar Valores Originais</span>
        </button>

        {onApplyDiscount && discountPercent > 0 && (
          <button
            type="button"
            onClick={() => onApplyDiscount(discountPercent)}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm active:scale-95 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Aplicar Desconto de {discountPercent}% nos Itens da Proposta</span>
          </button>
        )}
      </div>

    </div>
  );
};
