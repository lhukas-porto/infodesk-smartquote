import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  Percent, 
  Building2, 
  Filter, 
  CalendarDays,
  FileText,
  ArrowUpRight,
  Zap,
  Package,
  Tag,
  ExternalLink,
  Layers,
  Sparkles,
  Truck
} from 'lucide-react';
import { Quote, ClientCompany, Product } from '../types';
import { 
  formatCompanyPrefix, 
  resolveSupplierName,
  normalizeToOfficialCategory 
} from '../utils/aiEmailParser';
import { getClientCompanies } from '../utils/storage';
import { parseQuoteTimestamp, isSameDay, updateDraftQuotesToToday } from '../utils/dateUtils';

export { parseQuoteTimestamp, isSameDay, updateDraftQuotesToToday };

export type DatePeriodFilter = 'today' | '7days' | 'thisMonth' | '30days' | '90days' | 'all' | 'custom';

interface DashboardViewProps {
  quotes: Quote[];
  clientCompanies?: ClientCompany[];
  products?: Product[];
  onNavigateToHistory: () => void;
  onNavigateToBuilder: () => void;
  onOpenQuote?: (quote: Quote) => void;
}

/**
 * Busca e normaliza a empresa EXATAMENTE como está cadastrada no Gerenciamento de Clientes (client_companies).
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

  // 2. Tenta correspondência por contenção ou palavras-chave significativas
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

  // 3. Formatação gramatical oficial
  return formatCompanyPrefix(rawCompany);
}

export function getCategoryBadgeStyle(category?: string): string {
  if (!category) return 'bg-slate-100 text-slate-700 border-slate-200';
  const c = category.toLowerCase();
  if (c.includes('redes') || c.includes('telefonia')) return 'bg-sky-50 text-sky-800 border-sky-200';
  if (c.includes('informática') || c.includes('hardware')) return 'bg-indigo-50 text-indigo-800 border-indigo-200';
  if (c.includes('elétrica') || c.includes('iluminação')) return 'bg-amber-50 text-amber-900 border-amber-300';
  if (c.includes('ferramentas') || c.includes('medição')) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (c.includes('papelaria') || c.includes('artes') || c.includes('escritório')) return 'bg-purple-50 text-purple-800 border-purple-200';
  if (c.includes('eletrodomésticos') || c.includes('refrigeração') || c.includes('copa')) return 'bg-cyan-50 text-cyan-800 border-cyan-200';
  if (c.includes('limpeza') || c.includes('higiene') || c.includes('descartáveis')) return 'bg-teal-50 text-teal-800 border-teal-200';
  if (c.includes('energia') || c.includes('nobreaks') || c.includes('baterias')) return 'bg-orange-50 text-orange-800 border-orange-200';
  if (c.includes('impressão') || c.includes('automação')) return 'bg-rose-50 text-rose-800 border-rose-200';
  if (c.includes('construção') || c.includes('acabamento') || c.includes('marcenaria')) return 'bg-stone-100 text-stone-800 border-stone-300';
  if (c.includes('equipamentos') || c.includes('industriais')) return 'bg-slate-100 text-slate-800 border-slate-300';
  if (c.includes('áudio') || c.includes('vídeo') || c.includes('apresentação')) return 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200';
  if (c.includes('monitores') || c.includes('displays') || c.includes('tvs')) return 'bg-blue-50 text-blue-800 border-blue-200';
  if (c.includes('pet shop') || c.includes('veterinária')) return 'bg-lime-50 text-lime-900 border-lime-300';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

export function getCategoryIcon(category?: string): string {
  if (!category) return '🏷️';
  const c = category.toLowerCase();
  if (c.includes('redes') || c.includes('telefonia')) return '🌐';
  if (c.includes('informática') || c.includes('hardware')) return '💻';
  if (c.includes('elétrica') || c.includes('iluminação')) return '⚡';
  if (c.includes('ferramentas') || c.includes('medição')) return '🔩';
  if (c.includes('papelaria') || c.includes('artes') || c.includes('escritório')) return '📄';
  if (c.includes('eletrodomésticos') || c.includes('refrigeração') || c.includes('copa')) return '🧊';
  if (c.includes('limpeza') || c.includes('higiene') || c.includes('descartáveis')) return '🧻';
  if (c.includes('energia') || c.includes('nobreaks') || c.includes('baterias')) return '🔋';
  if (c.includes('impressão') || c.includes('automação')) return '🖨️';
  if (c.includes('construção') || c.includes('acabamento') || c.includes('marcenaria')) return '🧱';
  if (c.includes('equipamentos') || c.includes('industriais')) return '⚙️';
  if (c.includes('áudio') || c.includes('vídeo') || c.includes('apresentação')) return '🎙️';
  if (c.includes('monitores') || c.includes('displays') || c.includes('tvs')) return '🖥️';
  if (c.includes('pet shop') || c.includes('veterinária')) return '🐾';
  return '📦';
}

export function getCategoryBarColor(category?: string): string {
  if (!category) return 'bg-slate-400';
  const c = category.toLowerCase();
  if (c.includes('redes') || c.includes('telefonia')) return 'bg-sky-500';
  if (c.includes('informática') || c.includes('hardware')) return 'bg-indigo-500';
  if (c.includes('elétrica') || c.includes('iluminação')) return 'bg-amber-500';
  if (c.includes('ferramentas') || c.includes('medição')) return 'bg-emerald-500';
  if (c.includes('papelaria') || c.includes('artes') || c.includes('escritório')) return 'bg-purple-500';
  if (c.includes('eletrodomésticos') || c.includes('refrigeração') || c.includes('copa')) return 'bg-cyan-500';
  if (c.includes('limpeza') || c.includes('higiene') || c.includes('descartáveis')) return 'bg-teal-500';
  if (c.includes('energia') || c.includes('nobreaks') || c.includes('baterias')) return 'bg-orange-500';
  if (c.includes('impressão') || c.includes('automação')) return 'bg-rose-500';
  if (c.includes('construção') || c.includes('acabamento') || c.includes('marcenaria')) return 'bg-stone-500';
  if (c.includes('equipamentos') || c.includes('industriais')) return 'bg-slate-500';
  if (c.includes('áudio') || c.includes('vídeo') || c.includes('apresentação')) return 'bg-fuchsia-500';
  if (c.includes('monitores') || c.includes('displays') || c.includes('tvs')) return 'bg-blue-500';
  if (c.includes('pet shop') || c.includes('veterinária')) return 'bg-lime-500';
  return 'bg-slate-400';
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  quotes,
  clientCompanies,
  products,
  onNavigateToHistory,
  onNavigateToBuilder,
  onOpenQuote
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

  // Cálculos de KPIs Estratégicos e Analíticos
  const stats = useMemo(() => {
    const totalQuotes = filteredQuotes.length;
    let totalQuotedAmount = 0;
    let totalApprovedAmount = 0;
    let totalApprovedCost = 0;
    let totalQuotedCost = 0;
    let approvedCount = 0;
    let sentCount = 0;
    let draftCount = 0;
    let negotiatingCount = 0;
    let lostCount = 0;
    let totalMarginSum = 0;

    const clientMap: Record<string, { company: string; count: number; totalAmount: number; approvedAmount: number }> = {};
    const supplierMap: Record<string, { supplier: string; itemCount: number; totalAmount: number; quoteCount: number }> = {};
    const categoryMap: Record<string, { category: string; itemCount: number; totalAmount: number }> = {};

    for (const q of filteredQuotes) {
      const amt = q.totalAmount || 0;
      totalQuotedAmount += amt;
      totalMarginSum += (q.averageMargin || 35);

      const status = q.status || 'draft';
      const isApproved = status === 'approved';

      if (isApproved) {
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

      // Agrupamento por cliente buscando no cadastro oficial
      const clientName = resolveClientDisplayName(q.clientCompany, clientCompanies);
      if (!clientMap[clientName]) {
        clientMap[clientName] = { company: clientName, count: 0, totalAmount: 0, approvedAmount: 0 };
      }
      clientMap[clientName].count++;
      clientMap[clientName].totalAmount += amt;
      if (isApproved) {
        clientMap[clientName].approvedAmount += amt;
      }

      // Custos e Mix por Fornecedor e Categoria Oficial
      let quoteCost = 0;
      if (q.items && q.items.length > 0) {
        for (const it of q.items) {
          const qty = it.quantity || 1;
          const cost = (it.costPrice || 0) * qty;
          const itemAmt = (it.totalPrice || ((it.unitPrice || 0) * qty)) || (cost > 0 ? cost * 1.35 : 0);
          quoteCost += cost;

          // Fornecedores & Distribuidores
          const supp = resolveSupplierName(it, products);
          if (!supplierMap[supp]) {
            supplierMap[supp] = { supplier: supp, itemCount: 0, totalAmount: 0, quoteCount: 0 };
          }
          supplierMap[supp].itemCount += qty;
          supplierMap[supp].totalAmount += cost > 0 ? cost : itemAmt * 0.75;
          supplierMap[supp].quoteCount++;

          // Categorias Oficiais
          const rawCat = it.category || '';
          const cat = normalizeToOfficialCategory(rawCat);
          if (!categoryMap[cat]) {
            categoryMap[cat] = { category: cat, itemCount: 0, totalAmount: 0 };
          }
          categoryMap[cat].itemCount += qty;
          categoryMap[cat].totalAmount += itemAmt;
        }
      } else {
        const estCost = amt * (1 - ((q.averageMargin || 35) / 100));
        quoteCost = estCost;
      }

      totalQuotedCost += quoteCost;
      if (isApproved) {
        totalApprovedCost += quoteCost;
      }
    }

    const approvedGrossProfit = Math.max(0, totalApprovedAmount - totalApprovedCost);
    const totalQuotedGrossProfit = Math.max(0, totalQuotedAmount - totalQuotedCost);

    const conversionRate = (sentCount + approvedCount + negotiatingCount + lostCount) > 0 
      ? (approvedCount / (sentCount + approvedCount + negotiatingCount + lostCount)) * 100 
      : 0;

    const averageTicket = totalQuotes > 0 ? totalQuotedAmount / totalQuotes : 0;
    const approvedAverageTicket = approvedCount > 0 ? totalApprovedAmount / approvedCount : 0;
    const averageMargin = totalQuotes > 0 ? totalMarginSum / totalQuotes : 0;

    // Top Clientes
    const topClients = Object.values(clientMap)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5);

    // Top Fornecedores & Distribuidores
    const topSuppliers = Object.values(supplierMap)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5);

    // Mix de Categorias (com percentual relativo)
    const totalCategoryVolume = Object.values(categoryMap).reduce((acc, c) => acc + c.totalAmount, 0) || totalQuotedAmount || 1;
    const topCategories = Object.values(categoryMap)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .map(cat => ({
        ...cat,
        percentage: Math.min(100, Math.max(1, (cat.totalAmount / totalCategoryVolume) * 100)),
        badgeStyle: getCategoryBadgeStyle(cat.category),
        icon: getCategoryIcon(cat.category),
        barColor: getCategoryBarColor(cat.category)
      }));

    // Radar de Oportunidades Quentes (Propostas em Negociação Ativa ou Enviadas recentes)
    const hotOpportunities = filteredQuotes
      .filter(q => q.status === 'negotiating' || q.status === 'sent')
      .sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0))
      .slice(0, 3);

    // Fallback se não houver cotações em negociação: pega as maiores propostas ativas
    const displayOpportunities = hotOpportunities.length > 0 
      ? hotOpportunities 
      : filteredQuotes
          .filter(q => q.status !== 'rejected' && q.status !== 'lost')
          .sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0))
          .slice(0, 3);

    return {
      totalQuotes,
      totalQuotedAmount,
      totalApprovedAmount,
      totalApprovedCost,
      totalQuotedCost,
      approvedGrossProfit,
      totalQuotedGrossProfit,
      approvedCount,
      sentCount,
      draftCount,
      negotiatingCount,
      lostCount,
      conversionRate,
      averageTicket,
      approvedAverageTicket,
      averageMargin,
      topClients,
      topSuppliers,
      topCategories,
      displayOpportunities
    };
  }, [filteredQuotes, clientCompanies, products]);

  // Dias decorridos desde a cotação
  const getDaysPending = (q: Quote): number => {
    const t = parseQuoteTimestamp(q);
    const diffMs = Date.now() - t;
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      
      {/* ─── HEADER EXECUTIVO COM DESIGN SYSTEM OFICIAL ─── */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-gradient-to-br from-sky-500 to-indigo-600 text-white rounded-2xl shadow-sm shrink-0">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="sq-page-title">
                Dashboard Comercial & Inteligência de Vendas
              </h1>
            </div>
            <p className="sq-page-subtitle">
              Indicadores executivos, margem realizada, mix de departamentos e acompanhamento de oportunidades.
            </p>
          </div>
        </div>

        {/* Filtros de Período & Contador Rápido */}
        <div className="flex flex-col sm:items-end items-stretch gap-2.5 ml-auto shrink-0 w-full sm:w-auto">
          {/* Badge Contador Rápido no Header */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-sky-50/90 border border-sky-200/90 rounded-xl text-sky-950 shadow-2xs self-start sm:self-end">
            <FileText className="w-4 h-4 text-sky-600 shrink-0" />
            <span className="text-xs font-semibold text-slate-600">No período:</span>
            <span className="font-mono font-bold text-sky-800 text-sm bg-white px-2.5 py-0.5 rounded-lg border border-sky-200 shadow-2xs">
              {stats.totalQuotes} {stats.totalQuotes === 1 ? 'orçamento' : 'orçamentos'}
            </span>
          </div>

          {/* Botões de Seleção de Período */}
          <div className="flex items-center justify-start sm:justify-end bg-slate-100 p-1 rounded-xl border border-slate-200 gap-0.5 overflow-x-auto scrollbar-thin max-w-full self-stretch sm:self-end shadow-2xs">
            <button
              type="button"
              onClick={() => setPeriod('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                period === 'today' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setPeriod('7days')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                period === '7days' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 dias
            </button>
            <button
              type="button"
              onClick={() => setPeriod('thisMonth')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                period === 'thisMonth' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Este Mês
            </button>
            <button
              type="button"
              onClick={() => setPeriod('30days')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                period === '30days' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 dias
            </button>
            <button
              type="button"
              onClick={() => setPeriod('90days')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                period === '90days' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              90 dias
            </button>
            <button
              type="button"
              onClick={() => setPeriod('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                period === 'all' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setPeriod('custom')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
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

      {/* Barra de Filtro Customizado de Datas */}
      {period === 'custom' && (
        <div className="bg-sky-50/70 border border-sky-200 p-3 rounded-2xl flex flex-wrap items-center justify-end gap-3 text-xs animate-fadeIn ml-auto w-fit shadow-2xs">
          <div className="flex items-center gap-1.5 font-bold text-sky-900">
            <Filter className="w-3.5 h-3.5 text-sky-600" />
            <span>Intervalo Personalizado:</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-600 font-semibold">De:</label>
            <input
              type="date"
              value={customStartDate}
              onChange={e => setCustomStartDate(e.target.value)}
              className="bg-white border border-slate-200 px-2.5 py-1 rounded-xl text-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-xs font-mono shadow-2xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-600 font-semibold">Até:</label>
            <input
              type="date"
              value={customEndDate}
              onChange={e => setCustomEndDate(e.target.value)}
              className="bg-white border border-slate-200 px-2.5 py-1 rounded-xl text-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-xs font-mono shadow-2xs"
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

      {/* ─── 6 CARDS DE MÉTRICAS SUPERIORES (PADRÃO OFICIAL AGENTS.MD) ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-3.5">
        
        {/* Card 1: Orçamentos Emitidos */}
        <div className="bg-white border-2 border-sky-500/40 p-4 rounded-2xl shadow-xs relative overflow-hidden bg-gradient-to-br from-white via-white to-sky-50/50">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-800 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-sky-600" />
              Orçamentos
            </span>
            <span className="px-1.5 py-0.5 bg-sky-100 text-sky-800 rounded-md text-[10px] font-bold font-mono">
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
            {stats.approvedCount} aprovados · {stats.sentCount + stats.negotiatingCount} em negoc.
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
          <div className="text-lg font-bold text-slate-900 font-mono mt-1">
            R$ {stats.totalQuotedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">
            Soma de {stats.totalQuotes} {stats.totalQuotes === 1 ? 'proposta' : 'propostas'}
          </div>
        </div>

        {/* Card 3: Vendas Aprovadas */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
              Vendas Aprovadas
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg font-bold text-emerald-700 font-mono mt-1">
            R$ {stats.totalApprovedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-emerald-600/80 font-medium mt-0.5 truncate font-mono">
            {stats.approvedCount} pedidos fechados
          </div>
        </div>

        {/* Card 4 (NOVO): Lucro Bruto Realizado em R$ */}
        <div className="bg-white border-2 border-emerald-500/40 p-4 rounded-2xl shadow-xs bg-gradient-to-br from-white via-white to-emerald-50/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              Lucro Realizado
            </span>
            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-900 rounded-md text-[10px] font-bold font-mono">
              R$
            </span>
          </div>
          <div className="text-lg font-black text-emerald-700 font-mono mt-1">
            R$ {stats.approvedGrossProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-emerald-700/80 font-medium mt-0.5 truncate font-mono">
            Margem: {stats.totalApprovedAmount > 0 ? ((stats.approvedGrossProfit / stats.totalApprovedAmount) * 100).toFixed(1) : stats.averageMargin.toFixed(1)}% aplicada
          </div>
        </div>

        {/* Card 5: Taxa de Conversão */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Conversão
            </span>
            <Percent className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-lg font-bold text-purple-700 font-mono mt-1">
            {stats.conversionRate.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">
            Aprovadas / Apresentadas
          </div>
        </div>

        {/* Card 6: Ticket Médio Comparativo */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Ticket Médio
            </span>
            <Tag className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-lg font-bold text-sky-700 font-mono mt-1">
            R$ {stats.averageTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">
            Fechado: R$ {stats.approvedAverageTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

      </div>

      {/* ─── GRID CENTRAL: FUNIL & MIX DE DEPARTAMENTOS (7 COLS) | RANKINGS (5 COLS) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Coluna Esquerda: Funil Visual de Vendas + Mix de Departamentos (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Card Funil Comercial */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="sq-section-title">
                <TrendingUp className="w-4 h-4 text-sky-600" />
                <span>Funil de Conversão Comercial</span>
              </h2>
              <span className="text-xs text-slate-400 font-medium">Ciclo completo de vendas</span>
            </div>

            <div className="space-y-3.5 pt-1">
              {[
                { label: 'Rascunhos em Edição', count: stats.draftCount, color: 'bg-amber-500', barBg: 'bg-amber-100', dotBg: 'bg-amber-500' },
                { label: 'Propostas Enviadas ao Cliente', count: stats.sentCount, color: 'bg-sky-500', barBg: 'bg-sky-100', dotBg: 'bg-sky-500' },
                { label: 'Em Negociação Ativa (Quentes)', count: stats.negotiatingCount, color: 'bg-purple-500', barBg: 'bg-purple-100', dotBg: 'bg-purple-500' },
                { label: 'Vendas Aprovadas (Fechadas)', count: stats.approvedCount, color: 'bg-emerald-500', barBg: 'bg-emerald-100', dotBg: 'bg-emerald-500' },
                { label: 'Propostas Declinadas / Perdidas', count: stats.lostCount, color: 'bg-rose-400', barBg: 'bg-rose-100', dotBg: 'bg-rose-400' },
              ].map(stage => {
                const pct = stats.totalQuotes > 0 ? (stage.count / stats.totalQuotes) * 100 : 0;
                return (
                  <div key={stage.label} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700 flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${stage.dotBg}`}></span>
                        <span>{stage.label}</span>
                      </span>
                      <span className="font-mono text-slate-600 font-bold">
                        {stage.count} <span className="text-[11px] text-slate-400 font-sans">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className={`h-2.5 w-full ${stage.barBg} rounded-full overflow-hidden`}>
                      <div 
                        className={`h-full ${stage.color} rounded-full transition-all duration-500`}
                        style={{ width: `${Math.max(pct, stage.count > 0 ? 4 : 0)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card Mix de Departamentos (As 15 Categorias Oficiais) */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="sq-section-title">
                <Layers className="w-4 h-4 text-sky-600" />
                <span>Mix de Departamentos (15 Categorias Oficiais)</span>
              </h2>
              <span className="text-xs text-slate-400 font-medium">Participação em volume</span>
            </div>

            {stats.topCategories.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Nenhum dado categorizado no período selecionado.</p>
            ) : (
              <div className="space-y-4">
                {/* Barra Proporcional Multi-Cor */}
                <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-100 shadow-2xs">
                  {stats.topCategories.map((cat, idx) => (
                    <div 
                      key={idx}
                      className={`${cat.barColor} h-full transition-all duration-500`}
                      style={{ width: `${cat.percentage}%` }}
                      title={`${cat.category}: ${cat.percentage.toFixed(1)}%`}
                    />
                  ))}
                </div>

                {/* Grid de Tags Temáticas com Ícones */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {stats.topCategories.slice(0, 6).map((cat, idx) => (
                    <div 
                      key={idx}
                      className={`p-2.5 rounded-2xl border flex items-center justify-between gap-2 shadow-2xs ${cat.badgeStyle}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0">{cat.icon}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{cat.category}</p>
                          <p className="text-[10px] opacity-80">{cat.itemCount} item(ns) cotado(s)</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-xs">{cat.percentage.toFixed(1)}%</span>
                        <p className="text-[10px] opacity-75 font-mono">
                          R$ {cat.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Coluna Direita: Top Clientes & Top Fornecedores (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Top 5 Clientes */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="sq-section-title">
                <Building2 className="w-4 h-4 text-sky-600" />
                <span>Top 5 Clientes por Faturamento</span>
              </h2>
            </div>

            {stats.topClients.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Nenhum cliente com propostas neste período.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {stats.topClients.map((c, idx) => (
                  <div key={c.company} className="py-3 flex items-center justify-between text-xs group">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center shrink-0">
                        #{idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900 truncate group-hover:text-sky-700 transition">{c.company}</p>
                        <p className="text-[10px] text-slate-400">{c.count} proposta(s) · {c.approvedAmount > 0 ? `R$ ${c.approvedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} fechado` : 'Em prospecção'}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono font-bold text-slate-900">
                      R$ {c.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top 5 Fornecedores & Distribuidores (Inteligência de Compras - ATIVAÇÃO) */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="sq-section-title">
                <Truck className="w-4 h-4 text-emerald-600" />
                <span>Top 5 Fornecedores & Distribuidores</span>
              </h2>
              <span className="text-xs text-slate-400 font-medium">Base de Custo</span>
            </div>

            {stats.topSuppliers.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Nenhum dado de fornecedor apurado no período.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {stats.topSuppliers.map((s, idx) => (
                  <div key={s.supplier} className="py-3 flex items-center justify-between text-xs group">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold flex items-center justify-center shrink-0">
                        #{idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900 truncate group-hover:text-emerald-700 transition">{s.supplier}</p>
                        <p className="text-[10px] text-slate-400">{s.itemCount} peças/itens negociados</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono font-bold text-emerald-800">
                      R$ {s.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* ─── RADAR DE OPORTUNIDADES QUENTES (FOLLOW-UP DE FECHAMENTO) ─── */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-200 shrink-0">
              <Zap className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h2 className="sq-section-title">
                Radar de Oportunidades Quentes (Follow-up Ativo)
              </h2>
              <p className="text-xs text-slate-500">
                Cotações prioritárias em negociação para você acionar o cliente e acelerar o fechamento.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onNavigateToHistory}
            className="text-xs font-bold text-sky-600 hover:text-sky-800 flex items-center gap-1 cursor-pointer self-start sm:self-auto"
          >
            <span>Ver Histórico Completo</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {stats.displayOpportunities.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200/80">
            Nenhuma oportunidade em aberto no momento. Todas as propostas estão finalizadas!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
            {stats.displayOpportunities.map(opp => {
              const days = getDaysPending(opp);
              const clientName = resolveClientDisplayName(opp.clientCompany, clientCompanies);
              const statusLabel = opp.status === 'negotiating' 
                ? 'Em Negociação' 
                : (opp.status === 'sent' ? 'Enviada ao Cliente' : 'Rascunho Ativo');
              const statusBadgeColor = opp.status === 'negotiating'
                ? 'bg-purple-50 text-purple-800 border-purple-200'
                : 'bg-sky-50 text-sky-800 border-sky-200';

              return (
                <div 
                  key={opp.id} 
                  className="bg-white border border-slate-200 hover:border-sky-300 rounded-2xl p-4 transition shadow-2xs hover:shadow-xs flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${statusBadgeColor}`}>
                        {statusLabel}
                      </span>
                      <span className="text-[11px] font-mono font-bold text-slate-400">
                        {opp.code || 'Sem código'}
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-slate-900 truncate" title={clientName}>
                      {clientName}
                    </h3>

                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-base font-black text-slate-900 font-mono">
                        R$ {(opp.totalAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        {opp.averageMargin || 35}% margem
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-400 flex items-center gap-1 pt-0.5">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{days === 0 ? 'Criado hoje' : `Aguardando retorno há ${days} dia(s)`}</span>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenQuote) {
                        onOpenQuote(opp);
                      } else {
                        onNavigateToHistory();
                      }
                    }}
                    className="w-full py-2 px-3 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 shadow-2xs"
                  >
                    <span>Acompanhar Cotação</span>
                    <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
