// src/components/DiscountSimulatorModal.tsx
// Simulador e aplicação de desconto geral de fechamento comercial em lote

import React, { useState, useMemo } from 'react';
import { X, Tag, Percent, DollarSign, Calculator, AlertTriangle, Check, ArrowRight, ShieldAlert } from 'lucide-react';
import { QuoteItem } from '../types';

interface DiscountSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: QuoteItem[];
  globalTax?: number;
  globalShipping?: number;
  onApplyDiscount: (discountFactor: number) => void;
}

export const DiscountSimulatorModal: React.FC<DiscountSimulatorModalProps> = ({
  isOpen,
  onClose,
  items,
  globalTax = 0,
  globalShipping = 0,
  onApplyDiscount
}) => {
  const [discountType, setDiscountType] = useState<'percent' | 'target_amount'>('percent');
  const [percentInput, setPercentInput] = useState<string>('5');
  const [targetAmountInput, setTargetAmountInput] = useState<string>('');

  // 1. Totais atuais da proposta
  const { currentTotal, currentCost, currentNetRevenue, currentProfit, currentMargin } = useMemo(() => {
    let tot = 0;
    let cost = 0;
    let netRev = 0;

    items.forEach(it => {
      const q = it.quantity || 1;
      const unitP = it.unitPrice || 0;
      const tax = it.taxPercent ?? globalTax;
      const ship = it.shippingCost ?? globalShipping;
      const unitCost = Number(it.costPrice || 0) + Number(ship || 0);

      tot += unitP * q;
      cost += unitCost * q;
      netRev += (unitP * (1 - (tax / 100))) * q;
    });

    const profit = netRev - cost;
    const margin = netRev > 0 ? (profit / netRev) * 100 : 0;

    return {
      currentTotal: tot,
      currentCost: cost,
      currentNetRevenue: netRev,
      currentProfit: profit,
      currentMargin: margin
    };
  }, [items, globalTax, globalShipping]);

  // 2. Fator de desconto simulado
  const discountFactor = useMemo(() => {
    if (currentTotal <= 0) return 1;

    if (discountType === 'percent') {
      const pct = parseFloat(percentInput.replace(',', '.')) || 0;
      if (pct <= 0) return 1;
      if (pct >= 100) return 0;
      return (100 - pct) / 100;
    } else {
      const target = parseFloat(targetAmountInput.replace(',', '.')) || 0;
      if (target <= 0) return 1;
      return target / currentTotal;
    }
  }, [discountType, percentInput, targetAmountInput, currentTotal]);

  // 3. Simulação com o novo fator de desconto
  const { simulatedTotal, simulatedProfit, simulatedMargin, discountNominal } = useMemo(() => {
    let simTot = 0;
    let simNetRev = 0;

    items.forEach(it => {
      const q = it.quantity || 1;
      const originalUnitP = it.unitPrice || 0;
      const newUnitP = originalUnitP * discountFactor;
      const tax = it.taxPercent ?? globalTax;

      simTot += newUnitP * q;
      simNetRev += (newUnitP * (1 - (tax / 100))) * q;
    });

    const profit = simNetRev - currentCost;
    const margin = simNetRev > 0 ? (profit / simNetRev) * 100 : 0;
    const nominal = currentTotal - simTot;

    return {
      simulatedTotal: simTot,
      simulatedProfit: profit,
      simulatedMargin: margin,
      discountNominal: nominal
    };
  }, [items, discountFactor, globalTax, currentCost, currentTotal]);

  if (!isOpen) return null;

  const isMarginCritical = simulatedProfit < 0;
  const isMarginLow = simulatedMargin < 8 && !isMarginCritical;

  const handleConfirm = () => {
    if (discountFactor <= 0 || discountFactor > 1.5) {
      alert('Fator de desconto inválido.');
      return;
    }
    onApplyDiscount(discountFactor);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
      <div 
        className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-lg w-full flex flex-col overflow-hidden animate-scaleIn max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-sky-100 text-sky-700 rounded-xl flex items-center justify-center">
              <Tag className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-snug">
                Simulador de Desconto Geral
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Negocie com o comprador aplicando desconto linear com segurança de margem.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-5 overflow-y-auto space-y-4">
          
          {/* Seletor do Tipo de Negociação */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => setDiscountType('percent')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                discountType === 'percent'
                  ? 'bg-white text-sky-800 shadow-xs border border-sky-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Percent className="w-3.5 h-3.5" />
              <span>Porcentagem (%)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDiscountType('target_amount');
                if (!targetAmountInput && currentTotal > 0) {
                  setTargetAmountInput(Math.floor(currentTotal * 0.95).toString());
                }
              }}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                discountType === 'target_amount'
                  ? 'bg-white text-emerald-800 shadow-xs border border-emerald-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Valor Alvo Fechado (R$)</span>
            </button>
          </div>

          {/* Campo de Entrada de Desconto */}
          {discountType === 'percent' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Porcentagem de Desconto a Aplicar em Toda a Proposta:
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="50"
                    value={percentInput}
                    onChange={(e) => setPercentInput(e.target.value)}
                    className="w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-sm font-bold text-slate-900 font-mono"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-400">%</span>
                </div>

                {/* Atalhos rápidos */}
                <div className="flex items-center gap-1">
                  {['2', '3', '5', '7', '10'].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPercentInput(p)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer border ${
                        percentInput === p
                          ? 'bg-sky-50 text-sky-700 border-sky-300'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Valor Total Alvo Desejado (Fechamento Redondo):
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs font-bold text-slate-400">R$</span>
                <input
                  type="number"
                  step="10"
                  value={targetAmountInput}
                  onChange={(e) => setTargetAmountInput(e.target.value)}
                  className="w-full h-10 pl-10 pr-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 rounded-xl text-sm font-bold text-slate-900 font-mono"
                />
              </div>
            </div>
          )}

          {/* Comparativo: Antes vs Depois */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Impacto Financeiro na Cotação
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Valor Atual</span>
                <span className="text-sm font-bold font-mono text-slate-800">
                  R$ {currentTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">
                  Lucro: R$ {currentProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({currentMargin.toFixed(1)}%)
                </span>
              </div>

              <div className={`p-2.5 rounded-xl border shadow-2xs ${
                isMarginCritical 
                  ? 'bg-rose-50 border-rose-300' 
                  : isMarginLow 
                  ? 'bg-amber-50 border-amber-300' 
                  : 'bg-emerald-50/70 border-emerald-200'
              }`}>
                <span className="text-[10px] text-slate-500 block uppercase font-semibold">Novo Valor Simulado</span>
                <span className="text-sm font-bold font-mono text-slate-900">
                  R$ {simulatedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className={`text-[10px] font-bold block mt-0.5 font-mono ${
                  isMarginCritical ? 'text-rose-700' : isMarginLow ? 'text-amber-700' : 'text-emerald-700'
                }`}>
                  Lucro: R$ {simulatedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({simulatedMargin.toFixed(1)}%)
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-600 flex items-center justify-between pt-1 border-t border-slate-200/80">
              <span>Desconto concedido:</span>
              <span className="font-bold font-mono text-slate-900">
                -R$ {discountNominal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Avisos de Margem de Risco */}
          {isMarginCritical && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong>Atenção: Margem Negativa (Prejuízo)!</strong>
                <p className="text-[11px] text-rose-700 mt-0.5">
                  Com esse desconto, o valor final não cobre os custos de compra e impostos. Ajuste para um desconto menor.
                </p>
              </div>
            </div>
          )}

          {isMarginLow && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Margem Baixa (menor que 8%)</strong>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Essa contraproposta reduz muito sua rentabilidade. Verifique se vale a pena comercialmente.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={isMarginCritical || discountFactor === 1}
            onClick={handleConfirm}
            className={`h-10 px-4.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 ${
              isMarginCritical || discountFactor === 1
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                : 'bg-sky-600 hover:bg-sky-700 text-white'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>Aplicar Desconto na Cotação</span>
          </button>
        </div>
      </div>
    </div>
  );
};
