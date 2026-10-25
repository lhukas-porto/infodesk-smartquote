import React, { useState, useMemo } from 'react';
import { Target, X, Check, AlertTriangle, TrendingUp, DollarSign, Calculator } from 'lucide-react';
import { QuoteItem } from '../types';
import { calculateMarkupForTargetTotal } from '../services/pricingEngine';

interface TargetPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: QuoteItem[];
  globalTaxPercent?: number;
  globalShippingCost?: number;
  onApplyTargetMarkup: (markupPercent: number) => void;
}

export const TargetPriceModal: React.FC<TargetPriceModalProps> = ({
  isOpen,
  onClose,
  items,
  globalTaxPercent = 9.1,
  globalShippingCost = 0,
  onApplyTargetMarkup
}) => {
  if (!isOpen) return null;

  const baseItems = useMemo(() => items.filter(it => !it.isOptional), [items]);
  const currentTotal = useMemo(() => {
    return baseItems.reduce((acc, it) => acc + (it.unitPrice || 0) * (it.quantity > 0 ? it.quantity : 1), 0);
  }, [baseItems]);

  const [targetInput, setTargetInput] = useState<string>(() => {
    return currentTotal > 0 ? String(Math.round(currentTotal)) : '';
  });

  const parsedTarget = useMemo(() => {
    const clean = targetInput.replace(/[^\d.,]/g, '').replace(',', '.');
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
  }, [targetInput]);

  const calculation = useMemo(() => {
    if (parsedTarget <= 0 || baseItems.length === 0) return null;
    return calculateMarkupForTargetTotal(baseItems, parsedTarget, {
      globalTax: globalTaxPercent,
      globalShipping: globalShippingCost
    });
  }, [baseItems, parsedTarget, globalTaxPercent, globalShippingCost]);

  const handleApply = () => {
    if (!calculation || calculation.suggestedMarkupPercent === undefined) return;
    onApplyTargetMarkup(calculation.suggestedMarkupPercent);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shadow-xs">
              <Target className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <h2 className="sq-section-title text-base md:text-lg">
                Simulador de Preço Alvo
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ajuste automático de margem para atingir o valor final negociado
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Card de Resumo Atual */}
          <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Total Atual Base
              </span>
              <span className="text-base font-bold text-slate-800 font-mono mt-0.5 block">
                {currentTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Itens na Proposta
              </span>
              <span className="text-base font-bold text-slate-800 font-mono mt-0.5 block">
                {baseItems.length} {baseItems.length === 1 ? 'item' : 'itens'}
              </span>
            </div>
          </div>

          {/* Campo de Preço Alvo */}
          <div>
            <label htmlFor="target-price-input" className="sq-label flex items-center justify-between">
              <span>Valor Total Negociado (Preço Alvo)</span>
              <span className="text-[11px] text-slate-400 font-normal">Ex: 5000</span>
            </label>
            <div className="relative mt-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold font-mono">
                R$
              </span>
              <input
                id="target-price-input"
                type="text"
                inputMode="decimal"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                autoFocus
                className="sq-input pl-10 text-base font-bold font-mono text-slate-900"
              />
            </div>
          </div>

          {/* Resultado do Cálculo */}
          {calculation && (
            <div className="space-y-3.5 pt-2 border-t border-slate-100">
              <div className="p-4 rounded-xl border bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-sky-600" />
                    Markup Uniforme Sugerido:
                  </span>
                  <span className="text-base font-bold font-mono text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                    {calculation.suggestedMarkupPercent}%
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-200/60">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Total Projetado:</span>
                    <span className="font-bold text-slate-800 font-mono">
                      {calculation.calculatedTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Diferença Arredondamento:</span>
                    <span className={`font-bold font-mono ${calculation.difference === 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                      {calculation.difference > 0 ? `+ R$ ${calculation.difference.toFixed(2)}` : calculation.difference < 0 ? `- R$ ${Math.abs(calculation.difference).toFixed(2)}` : 'R$ 0,00 (Exato)'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-200/60">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Lucro Líquido Real:</span>
                    <span className={`font-bold font-mono ${calculation.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {calculation.netProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Margem Líquida %:</span>
                    <span className={`font-bold font-mono ${calculation.profitMarginPercent >= 14 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {calculation.profitMarginPercent}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Termômetro de Saúde de Margem */}
              <div className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                calculation.profitMarginPercent >= 22
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                  : calculation.profitMarginPercent >= 14
                    ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                    : 'bg-rose-50/80 border-rose-200 text-rose-900'
              }`}>
                {calculation.profitMarginPercent >= 14 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                )}
                <div>
                  <span className="font-bold block">
                    {calculation.profitMarginPercent >= 22
                      ? 'Margem Excelente (Alta Rentabilidade)'
                      : calculation.profitMarginPercent >= 14
                        ? 'Margem Saudável (Padrão Comercial)'
                        : 'Atenção: Margem Abaixo do Piso Mínimo Recomendado (14%)'}
                  </span>
                  <span className="text-[11px] opacity-90 block mt-0.5">
                    {calculation.profitMarginPercent >= 14
                      ? `Esta cotação garante R$ ${calculation.netProfit.toFixed(2)} de lucro líquido já descontando fretes e impostos.`
                      : 'O valor negociado reduz o lucro líquido da operação. Certifique-se com a gerência antes de aprovar.'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="sq-btn-neutral"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!calculation || parsedTarget <= 0}
            className="sq-btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            <span>Aplicar Markup ({calculation?.suggestedMarkupPercent ?? 0}%)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
