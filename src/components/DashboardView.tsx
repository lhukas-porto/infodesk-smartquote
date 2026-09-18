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
  CalendarDays,
  FileText,
  Sparkles, 
  ArrowUpRight, 
  ArrowRight 
} from 'lucide-react';
import { Quote, ClientCompany, Product } from '../types';
import { formatCompanyPrefix, resolveSupplierName } from '../utils/aiEmailParser';
import { getClientCompanies } from '../utils/storage';

interface DashboardViewProps {
  quotes: Quote[];
  clientCompanies?: ClientCompany[];
  products?: Product[];
  onNavigateToHistory: () => void;
  onNavigateToBuilder: () => void;
}

export type DatePeriodFilter = 'today' | '7days' | 'thisMonth' | '30days' | '90days' | 'all' | 'custom';

const PT_MONTHS = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

/**
 * Função utilitária para extrair timestamp seguro de uma proposta comercial,
 * suportando datas em formato ISO, DD/MM/YYYY e extensas em português ('17 de setembro de 2026')
 */
export function parseQuoteTimestamp(q: Quote): number {
  // 1. Tenta formato ISO em sentAt ou createdAt
  if (q.sentAt) {
    const t = new Date(q.sentAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (q.createdAt) {
    const t = new Date(q.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  const str = q.date?.trim();
  if (!str) return Date.now();

  const lower = str.toLowerCase();

  // "Hoje às 14:20" ou "Hoje"
  if (lower.includes('hoje')) {
    const timeMatch = lower.match(/(\d{1,2}):(\d{2})/);
    const d = new Date();
    if (timeMatch) {
      d.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
    }
    return d.getTime();
  }

  // "Ontem às 16:10" ou "Ontem"
  if (lower.includes('ontem')) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const timeMatch = lower.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      d.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
    }
    return d.getTime();
  }

  // "17 de setembro de 2026"
  const matchPt = lower.match(/(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i);
  if (matchPt) {
    const day = parseInt(matchPt[1], 10);
    const cleanMonth = matchPt[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const mIdx = PT_MONTHS.indexOf(cleanMonth);
    const year = parseInt(matchPt[3], 10);
    if (mIdx !== -1) {
      return new Date(year, mIdx, day, 12, 0, 0).getTime();
    }
  }

  // "17/09/2026" ou "17/09/2026 14:20"
  if (str.includes('/')) {
    const parts = str.split(' ')[0].split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day, 12, 0, 0).getTime();
    }
  }

  // Fallback para parser nativo
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.getTime();

  return Date.now();
}

/**
 * Busca e normaliza a empresa EXATAMENTE como está cadastrada no Gerenciamento de Clientes (client_companies).
 * Se a empresa estiver cadastrada (ex: "Grupo Sonda" com prefixo "Ao"), exibe "Ao Grupo Sonda",
 * mesmo que na cotação esteja apenas "Sonda" ou "À Sonda".
 */
export function resolveClientDisplayName(
  rawCompany: string | undefined, 
  registeredCompanies?: ClientCompany[]
): string {
  if (!rawCompany || !rawCompany.trim()) return 'Cliente não informado';
  const clean = rawCompany.trim().replace(/^(ao|à|a|para)\s+/i, '').trim();
  const norm = clean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let list: ClientCompany[] = [];
  try {
    list = registeredCompanies && registeredCompanies.length > 0 
      ? registeredCompanies 
      : getClientCompanies();
  } catch {
    list = registeredCompanies || [];
  }

  // 1. Tenta correspondência exata
  for (const c of list) {
    const cClean = (c.name || '').replace(/^(ao|à|a|para)\s+/i, '').trim();
    const cNorm = cClean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (cNorm === norm) {
      const pref = c.prefix || (c.name.trim().toLowerCase().startsWith('ao ') ? 'Ao' : 'À');
      return `${pref} ${cClean}`;
    }
  }

  // 2. Tenta correspondência por contenção ou palavras-chave significativas (ex: 'Sonda' -> 'Grupo Sonda')
  for (const c of list) {
    const cClean = (c.name || '').replace(/^(ao|à|a|para)\s+/i, '').trim();
    const cNorm = cClean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (cNorm.includes(norm) || norm.includes(cNorm)) {
      const pref = c.prefix || (c.name.trim().toLowerCase().startsWith('ao ') ? 'Ao' : 'À');
      return `${pref} ${cClean}`;
    }
    const cWords = cNorm.split(/\s+/).filter(w => w.length >= 3);
    const qWords = norm.split(/\s+/).filter(w => w.length >= 3);
    if (cWords.some(cw => qWords.includes(cw))) {
      const pref = c.prefix || (c.name.trim().toLowerCase().startsWith('ao ') ? 'Ao' : 'À');
      return `${pref} ${cClean}`;
    }
  }

  // 3. Se não houver cadastro correspondente, aplica a formatação gramatical oficial
  return formatCompanyPrefix(rawCompany);
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  quotes,
  clientCompanies,
  products,
  onNavigateToHistory,
  onNavigateToBuilder
}) => {
  const [period, setPeriod] = useState<DatePeriodFilter>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Rótulo textual amigável do período ativo
  const getPeriodLabel = (p: DatePeriodFilter): string => {
    switch (p) {
      case 'today': return 'Hoje';
      case '7days': return 'Últimos 7 dias';
      case 'thisMonth': return 'Este Mês';
      case '30days': return 'Últimos 30 dias';
      case '90days': return 'Últimos 90 dias';
      case 'custom': return 'Personalizado';
      case 'all': 
      default:
        return 'Todo o Histórico';
    }
  };

  // Filtra as cotações por período selecionado
  const filteredQuotes = useMemo(() => {
    if (period === 'all') return quotes;

    const now = new Date();

    if (period === 'today') {
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
      return quotes.filter(q => {
        const t = parseQuoteTimestamp(q);
        return t >= startOfToday && t <= endOfToday;
      });
    }

    if (period === '7days') {
      const past7d = now.getTime() - (7 * 24 * 60 * 60 * 1000);
      return quotes.filter(q => {
        const t = parseQuoteTimestamp(q);
        return t >= past7d;
      });
    }

    if (period === 'thisMonth') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
      return quotes.filter(q => {
        const t = parseQuoteTimestamp(q);
        return t >= startOfMonth;
      });
    }

    if (period === '30days') {
      const past30d = now.getTime() - (30 * 24 * 60 * 60 * 1000);
      return quotes.filter(q => {
        const t = parseQuoteTimestamp(q);
        return t >= past30d;
      });
    }

    if (period === '90days') {
      const past90d = now.getTime() - (90 * 24 * 60 * 60 * 1000);
      return quotes.filter(q => {
        const t = parseQuoteTimestamp(q);
        return t >= past90d;
      });
    }

    if (period === 'custom') {
      const startMs = customStartDate ? new Date(`${customStartDate}T00:00:00`).getTime() : 0;
      const endMs = customEndDate ? new Date(`${customEndDate}T23:59:59`).getTime() : Number.MAX_SAFE_INTEGER;
      return quotes.filter(q => {
        const t = parseQuoteTimestamp(q);
        return t >= startMs && t <= endMs;
      });
    }

    return quotes;
  }, [quotes, period, customStartDate, customEndDate]);

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

      // Agrupamento por cliente buscando exatamente como está cadastrado no Gerenciamento de Clientes
      const clientName = resolveClientDisplayName(q.clientCompany, clientCompanies);

      if (!clientMap[clientName]) {
        clientMap[clientName] = { company: clientName, count: 0, totalAmount: 0, approvedAmount: 0 };
      }
      clientMap[clientName].count++;
      clientMap[clientName].totalAmount += amt;
      if (status === 'approved') {
        clientMap[clientName].approvedAmount += amt;
      }

      // Agrupamento inteligente por fornecedor/distribuidor dos itens
      if (q.items && q.items.length > 0) {
        for (const it of q.items) {
          const supp = resolveSupplierName(it, products);
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
      .slice(0, 8);

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
  }, [filteredQuotes, clientCompanies, products]);

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Header com Design System Oficial */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl border border-sky-100 shrink-0">
            <BarChart3 className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">
                Painel Executivo & BI de Propostas
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Indicadores de conversão, margem realizada, clientes mais recorrentes e fornecedores mais cotados.
            </p>
          </div>
        </div>

        {/* Filtros de Período & Badge Contador Rápido (Justificados à Direita) */}
        <div className="flex flex-col items-end gap-2 ml-auto shrink-0 w-full sm:w-auto">
          
          {/* Badge Contador Rápido no Header */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-sky-50/80 border border-sky-200/90 rounded-xl text-sky-950 shadow-2xs self-end">
            <FileText className="w-4 h-4 text-sky-600 shrink-0" />
            <span className="text-xs font-medium text-slate-600">No período:</span>
            <span className="font-mono font-bold text-sky-800 text-sm bg-white px-2 py-0.5 rounded-lg border border-sky-100 shadow-2xs">
              {stats.totalQuotes} {stats.totalQuotes === 1 ? 'orçamento' : 'orçamentos'}
            </span>
          </div>

          {/* Botões de Seleção de Período */}
          <div className="flex items-center justify-end bg-slate-100 p-1 rounded-xl border border-slate-200 gap-0.5 overflow-x-auto max-w-full self-end">
            <button
              type="button"
              onClick={() => setPeriod('today')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                period === 'today' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setPeriod('7days')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                period === '7days' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 dias
            </button>
            <button
              type="button"
              onClick={() => setPeriod('thisMonth')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                period === 'thisMonth' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Este Mês
            </button>
            <button
              type="button"
              onClick={() => setPeriod('30days')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                period === '30days' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 dias
            </button>
            <button
              type="button"
              onClick={() => setPeriod('90days')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                period === '90days' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              90 dias
            </button>
            <button
              type="button"
              onClick={() => setPeriod('all')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                period === 'all' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setPeriod('custom')}
              className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 flex items-center gap-1 ${
                period === 'custom' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Filtrar por intervalo de datas"
            >
              <CalendarDays className="w-3.5 h-3.5 text-sky-600" />
              <span>Datas</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Filtro Customizado de Datas (aparece quando selecionado 'Datas') */}
      {period === 'custom' && (
        <div className="bg-sky-50/60 border border-sky-200/80 p-3 rounded-2xl flex flex-wrap items-center justify-end gap-3 text-xs animate-fadeIn ml-auto w-fit">
          <div className="flex items-center gap-1.5 font-semibold text-sky-900">
            <Filter className="w-3.5 h-3.5 text-sky-600" />
            <span>Intervalo Personalizado:</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-600 font-medium">De:</label>
            <input
              type="date"
              value={customStartDate}
              onChange={e => setCustomStartDate(e.target.value)}
              className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-xs font-mono"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-600 font-medium">Até:</label>
            <input
              type="date"
              value={customEndDate}
              onChange={e => setCustomEndDate(e.target.value)}
              className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-xs font-mono"
            />
          </div>
          {(customStartDate || customEndDate) && (
            <button
              type="button"
              onClick={() => { setCustomStartDate(''); setCustomEndDate(''); }}
              className="text-xs font-bold text-sky-700 hover:text-sky-900 underline ml-auto cursor-pointer"
            >
              Limpar datas
            </button>
          )}
        </div>
      )}

      {/* Cards de Métricas Superiores (Padrão Oficial AGENTS.md - 6 Cards com Contador Destacado) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        
        {/* Card 1 (DESTACADO): Total de Orçamentos no Período Selecionado */}
        <div className="bg-white border-2 border-sky-500/40 p-4 rounded-2xl shadow-xs relative overflow-hidden bg-gradient-to-br from-white via-white to-sky-50/50">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-800 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-sky-600" />
              Orçamentos
            </span>
            <span className="px-2 py-0.5 bg-sky-100/80 text-sky-800 rounded-full text-[10px] font-bold font-mono">
              {getPeriodLabel(period)}
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono mt-1.5 flex items-baseline gap-1.5">
            <span className="text-sky-700">{stats.totalQuotes}</span>
            <span className="text-xs font-semibold text-slate-500 font-sans">
              {stats.totalQuotes === 1 ? 'cotação' : 'cotações'}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-medium mt-1 truncate">
            {stats.approvedCount} aprovados • {stats.sentCount + stats.negotiatingCount} em negoc.
          </div>
        </div>

        {/* Card 2: Volume Cotado Total */}
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
          <div className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">
            Soma de {stats.totalQuotes} {stats.totalQuotes === 1 ? 'proposta' : 'propostas'}
          </div>
        </div>

        {/* Card 3: Volume Aprovado / Ganho */}
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
          <div className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">
            {stats.approvedCount} propostas fechadas
          </div>
        </div>

        {/* Card 4: Taxa de Conversão */}
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
          <div className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">
            Aprovadas / Apresentadas
          </div>
        </div>

        {/* Card 5: Ticket Médio */}
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
          <div className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">
            Média por proposta
          </div>
        </div>

        {/* Card 6: Margem Média Realizada */}
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
          <div className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">
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
