import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  Percent, 
  Building2, 
  Package, 
  Store,
  Filter,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ArrowRight
} from 'lucide-react';
import { Quote } from '../types';

interface DashboardViewProps {
  quotes: Quote[];
  onNavigateToHistory: () => void;
  onNavigateToBuilder: () => void;
}

type DatePeriodFilter = 'all' | '30days' | '90days';

export const DashboardView: React.FC<DashboardViewProps> = ({
  quotes,
  onNavigateToHistory,
  onNavigateToBuilder
}) => {
  const [period, setPeriod] = useState<DatePeriodFilter>('all');

  // Filtra as cotações por período
  const filteredQuotes = useMemo(() => {
    if (period === 'all') return quotes;
    const now = Date.now();
    const daysLimit = period === '30days' ? 30 : 90;
    const msLimit = daysLimit * 24 * 60 * 60 * 1000;

    return quotes.filter(q => {
      const dateStr = q.sentAt || q.createdAt || q.date;
      if (!dateStr) return true;
      let time = now;
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
          if (!isNaN(d.getTime())) time = d.getTime();
        }
      } else {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) time = d.getTime();
      }
      return (now - time) <= msLimit;
    });
  }, [quotes, period]);

  // Cálculos de KPIs
  const stats = useMemo(() => {
    const totalQuotes = filteredQuotes.length;
    let totalQuotedAmount = 0;
    let totalApprovedAmount = 0;
    let approvedCount = 0;
    let sentCount = 0;
    let draftCount = 0;
    let negotiatingCount = 0;
    let lostCount = 0;
    let totalMarginSum = 0;

    const clientMap: Record<string, { company: string; count: number; totalAmount: number; approvedAmount: number }> = {};
    const supplierMap: Record<string, { supplier: string; itemCount: number; totalAmount: number }> = {};

    for (const q of filteredQuotes) {
      const amt = q.totalAmount || 0;
      totalQuotedAmount += amt;
      totalMarginSum += (q.averageMargin || 35);

      const status = q.status || 'draft';
      if (status === 'approved') {
        approvedCount++;
        totalApprovedAmount += amt;
      } else if (status === 'sent') {
        sentCount++;
      } else if (status === 'negotiating') {
        negotiatingCount++;
      } else if (status === 'rejected' || status === 'lost') {
        lostCount++;
      } else {
        draftCount++;
      }

      // Agrupamento por cliente
      const clientName = q.clientCompany || 'Cliente não informado';
      if (!clientMap[clientName]) {
        clientMap[clientName] = { company: clientName, count: 0, totalAmount: 0, approvedAmount: 0 };
      }
      clientMap[clientName].count++;
      clientMap[clientName].totalAmount += amt;
      if (status === 'approved') {
        clientMap[clientName].approvedAmount += amt;
      }

      // Agrupamento por fornecedor dos itens
      if (q.items && q.items.length > 0) {
        for (const it of q.items) {
          const supp = it.supplier || 'Fornecedor Local';
          if (!supplierMap[supp]) {
            supplierMap[supp] = { supplier: supp, itemCount: 0, totalAmount: 0 };
          }
          supplierMap[supp].itemCount += (it.quantity || 1);
          supplierMap[supp].totalAmount += (it.costPrice || 0) * (it.quantity || 1);
        }
      }
    }

    const conversionRate = (sentCount + approvedCount + negotiatingCount + lostCount) > 0 
      ? (approvedCount / (sentCount + approvedCount + negotiatingCount + lostCount)) * 100 
      : 0;

    const averageTicket = totalQuotes > 0 ? totalQuotedAmount / totalQuotes : 0;
    const averageMargin = totalQuotes > 0 ? totalMarginSum / totalQuotes : 0;

    const topClients = Object.values(clientMap)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5);

    const topSuppliers = Object.values(supplierMap)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5);

    return {
      totalQuotes,
      totalQuotedAmount,
      totalApprovedAmount,
      approvedCount,
      sentCount,
      draftCount,
      negotiatingCount,
      lostCount,
      conversionRate,
      averageTicket,
      averageMargin,
      topClients,
      topSuppliers
    };
  }, [filteredQuotes]);

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Header com Design System Oficial */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl border border-sky-100">
            <BarChart3 className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">
                Painel Executivo & BI de Propostas
              </h1>
              <span className="px-2.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold font-mono uppercase tracking-wider rounded-lg">
                MEL-11
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Indicadores de conversão, margem realizada, clientes mais recorrentes e fornecedores mais cotados.
            </p>
          </div>
        </div>

        {/* Filtros de Período */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setPeriod('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                period === 'all' ? 'bg-white text-sky-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todo o Histórico
            </button>
            <button
              type="button"
              onClick={() => setPeriod('90days')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                period === '90days' ? 'bg-white text-sky-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Últimos 90 dias
            </button>
            <button
              type="button"
              onClick={() => setPeriod('30days')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                period === '30days' ? 'bg-white text-sky-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Últimos 30 dias
            </button>
          </div>
        </div>
      </div>

      {/* Cards de Métricas Superiores (Padrão Oficial AGENTS.md) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Card 1: Volume Cotado Total */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Volume Cotado
            </span>
            <DollarSign className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-base font-bold text-slate-900 font-mono mt-1">
            R$ {stats.totalQuotedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">
            {stats.totalQuotes} orçamentos registrados
          </div>
        </div>

        {/* Card 2: Volume Aprovado / Ganho */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
              Vendas Aprovadas
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-base font-bold text-emerald-700 font-mono mt-1">
            R$ {stats.totalApprovedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">
            {stats.approvedCount} propostas fechadas com sucesso
          </div>
        </div>

        {/* Card 3: Taxa de Conversão */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Taxa de Conversão
            </span>
            <TrendingUp className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-base font-bold text-purple-700 font-mono mt-1">
            {stats.conversionRate.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">
            Aprovadas / Total apresentadas
          </div>
        </div>

        {/* Card 4: Ticket Médio */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Ticket Médio
            </span>
            <Package className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-base font-bold text-slate-900 font-mono mt-1">
            R$ {stats.averageTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">
            Média por proposta comercial
          </div>
        </div>

        {/* Card 5: Margem Média Realizada */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Margem Média
            </span>
            <Percent className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-base font-bold text-sky-700 font-mono mt-1">
            {stats.averageMargin.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">
            Lucro médio aplicado
          </div>
        </div>

      </div>

      {/* Grid Central: Funil Visual de Conversão & Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Coluna Esquerda: Funil Visual de Vendas (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-600" />
              <span>Funil de Conversão Comercial</span>
            </h2>
            <button
              type="button"
              onClick={onNavigateToHistory}
              className="text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1 transition"
            >
              <span>Ver Kanban</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 pt-2">
            {[
              { label: 'Rascunhos em Edição', count: stats.draftCount, color: 'bg-amber-500', barBg: 'bg-amber-100' },
              { label: 'Propostas Enviadas', count: stats.sentCount, color: 'bg-sky-500', barBg: 'bg-sky-100' },
              { label: 'Em Negociação Ativa', count: stats.negotiatingCount, color: 'bg-purple-500', barBg: 'bg-purple-100' },
              { label: 'Vendas Aprovadas', count: stats.approvedCount, color: 'bg-emerald-500', barBg: 'bg-emerald-100' },
              { label: 'Propostas Declinadas', count: stats.lostCount, color: 'bg-rose-400', barBg: 'bg-rose-100' },
            ].map(stage => {
              const pct = stats.totalQuotes > 0 ? (stage.count / stats.totalQuotes) * 100 : 0;
              return (
                <div key={stage.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-700 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${stage.color}`}></span>
                      {stage.label}
                    </span>
                    <span className="font-mono text-slate-500 font-bold">
                      {stage.count} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className={`h-2.5 w-full ${stage.barBg} rounded-full overflow-hidden`}>
                    <div 
                      className={`h-full ${stage.color} rounded-full transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dica de Inteligência Comercial */}
          <div className="p-3.5 bg-sky-50/70 border border-sky-100 rounded-xl text-xs text-sky-900 flex items-start gap-2.5 mt-4">
            <Sparkles className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Dica de Fechamento:</strong> Propostas em negociação têm probabilidade 3x maior de conversão quando o follow-up ocorre antes de 48 horas após o envio do documento formal.
            </p>
          </div>
        </div>

        {/* Coluna Direita: Top Clientes & Top Fornecedores (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Top Clientes */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h2 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-600" />
              <span>Top Clientes por Volume</span>
            </h2>

            {stats.topClients.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Nenhum dado de cliente disponível</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {stats.topClients.map(c => (
                  <div key={c.company} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-bold text-slate-800 truncate">{c.company}</p>
                      <p className="text-[10px] text-slate-400">{c.count} proposta(s)</p>
                    </div>
                    <div className="text-right shrink-0 font-mono font-bold text-slate-900">
                      R$ {c.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Fornecedores mais Cotados */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h2 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
              <Store className="w-4 h-4 text-emerald-600" />
              <span>Top Fornecedores em Custo</span>
            </h2>

            {stats.topSuppliers.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Nenhum dado de fornecedor disponível</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {stats.topSuppliers.map(s => (
                  <div key={s.supplier} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-bold text-slate-800 truncate">{s.supplier}</p>
                      <p className="text-[10px] text-slate-400">{s.itemCount} unidade(s) cotada(s)</p>
                    </div>
                    <div className="text-right shrink-0 font-mono font-bold text-emerald-700">
                      R$ {s.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
