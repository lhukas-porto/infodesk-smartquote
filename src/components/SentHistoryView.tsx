import React, { useState, useMemo } from 'react';
import { 
  Send, 
  CheckCircle2, 
  Eye, 
  FileEdit, 
  FileText, 
  Clock, 
  Search, 
  History, 
  Trash2,
  AlertTriangle,
  X,
  Flame,
  MessageSquare,
  TrendingUp,
  DollarSign,
  Filter,
  Check,
  ChevronRight,
  Sparkles,
  ArrowUpDown,
  Building2,
  User, 
  Mail, 
  Package,
  Calendar,
  CalendarDays,
  Copy
} from 'lucide-react';
import { Quote } from '../types';
import { normalizeSearchText } from '../utils/aiEmailParser';
import { parseQuoteTimestamp, isSameDay } from './DashboardView';

interface SentHistoryViewProps {
  quotes: Quote[];
  onOpenQuote: (quote: Quote) => void | Promise<void>;
  onEditQuote?: (quote: Quote) => void | Promise<void>;
  onDuplicateQuote?: (quote: Quote) => void | Promise<void>;
  onDeleteQuote?: (quote: Quote) => void;
  onUpdateQuoteStatus?: (quoteId: string, newStatus: Quote['status']) => void;
  initialStageFilter?: StageId | 'all';
  onStageFilterChange?: (stage: StageId | 'all') => void;
}

type StageId = 'draft' | 'sent' | 'negotiating' | 'approved' | 'lost';

interface StageStep {
  id: StageId;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  activeColor: string;
  activeBorder: string;
  activeBg: string;
  activeText: string;
}

const PIPELINE_STAGES: StageStep[] = [
  {
    id: 'draft',
    label: 'Rascunho',
    shortLabel: 'Rascunho',
    icon: Clock,
    activeColor: 'bg-amber-500',
    activeBorder: 'border-amber-300',
    activeBg: 'bg-amber-50',
    activeText: 'text-amber-800'
  },
  {
    id: 'sent',
    label: 'Enviada',
    shortLabel: 'Enviada',
    icon: Send,
    activeColor: 'bg-sky-500',
    activeBorder: 'border-sky-300',
    activeBg: 'bg-sky-50',
    activeText: 'text-sky-800'
  },
  {
    id: 'negotiating',
    label: 'Em Negociação',
    shortLabel: 'Negociação',
    icon: MessageSquare,
    activeColor: 'bg-purple-500',
    activeBorder: 'border-purple-300',
    activeBg: 'bg-purple-50',
    activeText: 'text-purple-800'
  },
  {
    id: 'approved',
    label: 'Aprovada / Ganha 🏆',
    shortLabel: 'Aprovada',
    icon: CheckCircle2,
    activeColor: 'bg-emerald-500',
    activeBorder: 'border-emerald-300',
    activeBg: 'bg-emerald-50',
    activeText: 'text-emerald-800'
  }
];

export type HistoryDateFilter = 'today' | 'yesterday' | '7days' | 'thisMonth' | 'all' | 'specificDate' | 'customRange';

// Normaliza o status do quote para os estágios do pipeline (escopo de módulo para evitar TDZ em inicializadores de estado)
export const normalizeStatus = (q: Quote): StageId => {
  if (q.status === 'rejected' || q.status === 'lost') return 'lost';
  if (q.status === 'approved') return 'approved';
  if (q.status === 'negotiating') return 'negotiating';
  if (q.status === 'sent' || Boolean(q.sentAt)) return 'sent';
  if (q.code && q.code.trim().toUpperCase() === 'CNC 210926-3') return 'sent';
  return 'draft';
};

export const SentHistoryView: React.FC<SentHistoryViewProps> = ({
  quotes,
  onOpenQuote,
  onEditQuote,
  onDuplicateQuote,
  onDeleteQuote,
  onUpdateQuoteStatus,
  initialStageFilter = 'all',
  onStageFilterChange
}) => {
  const [dateFilter, setDateFilter] = useState<HistoryDateFilter>(() => {
    const now = new Date();
    const hasTodayOrDraft = (quotes || []).some(q => 
      isSameDay(parseQuoteTimestamp(q), now.getTime()) || normalizeStatus(q) === 'draft'
    );
    return hasTodayOrDraft ? 'today' : 'all';
  });
  const [specificDate, setSpecificDate] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const [selectedStageFilter, setSelectedStageFilter] = useState<StageId | 'all'>(initialStageFilter);
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyFollowUpDue, setOnlyFollowUpDue] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'amount_desc' | 'amount_asc'>('recent');
  const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null);

  React.useEffect(() => {
    if (initialStageFilter !== undefined) {
      setSelectedStageFilter(initialStageFilter);
    }
  }, [initialStageFilter]);

  const handleSelectStage = (stage: StageId | 'all') => {
    setSelectedStageFilter(stage);
    onStageFilterChange?.(stage);
  };

  const formatDateBR = (isoDate: string): string => {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return isoDate;
  };

  const getDateFilterLabel = (filter: HistoryDateFilter): string => {
    switch (filter) {
      case 'today': return 'Hoje';
      case 'yesterday': return 'Ontem';
      case '7days': return 'Últimos 7 dias';
      case 'thisMonth': return 'Este Mês';
      case 'all': return 'Todo o Histórico';
      case 'specificDate': return specificDate ? `Dia ${formatDateBR(specificDate)}` : 'Por Dia';
      case 'customRange': 
        if (customStartDate && customEndDate) {
          return `${formatDateBR(customStartDate)} até ${formatDateBR(customEndDate)}`;
        }
        return 'Período Personalizado';
      default:
        return 'Hoje';
    }
  };

  // Formata data e horário do envio com suporte a fuso horário brasileiro no formato compacto (DD/MM/YYYY HH:mm)
  const formatQuoteDateTime = (q: Quote): { displayDate: string; displayTime?: string } => {
    let dateStr = '';
    let timeStr = '';

    // 1. Prioriza sentAt ou createdAt para data e hora exatas
    const tsSource = q.sentAt || q.createdAt;
    if (tsSource) {
      try {
        const d = new Date(tsSource);
        if (!isNaN(d.getTime())) {
          dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
          timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
      } catch {
        // ignore
      }
    }

    // 2. Se a data ainda não foi formatada, converte q.date para DD/MM/YYYY compacto
    if (!dateStr && q.date) {
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(q.date.trim())) {
        dateStr = q.date.trim();
      } else {
        const parsed = parseQuoteTimestamp(q);
        if (parsed > 0) {
          const d = new Date(parsed);
          dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } else {
          dateStr = q.date;
        }
      }
    }

    return { 
      displayDate: dateStr || 'Data n/d', 
      displayTime: timeStr || undefined 
    };
  };

  // Timestamp preciso para ordenação por horário de envio
  const getSortTimestamp = (q: Quote): number => {
    if (q.sentAt) {
      const t = new Date(q.sentAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (q.createdAt) {
      const t = new Date(q.createdAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    return parseQuoteTimestamp(q);
  };

  // Verifica se uma proposta enviada ou em negociação tem mais de 48 horas (precisa de Follow-up)
  const isFollowUpDue = (q: Quote): boolean => {
    const status = normalizeStatus(q);
    if (status !== 'sent' && status !== 'negotiating') return false;

    const timestamp = parseQuoteTimestamp(q);
    const diffHours = (Date.now() - timestamp) / (1000 * 60 * 60);
    return diffHours >= 48;
  };

  // 1. Filtra as cotações por DATA / PERÍODO (Padrão: Hoje / Dia Corrente)
  const dateFilteredQuotes = useMemo(() => {
    const now = new Date();
    const todayFormatted = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    // Descarta rascunhos fantasmas vazios (0 itens comerciais) que possam ter ficado na memória
    const validQuotes = quotes.filter(q => (q.status && q.status !== 'draft') || (Array.isArray(q.items) && q.items.length > 0));

    // Se o estágio selecionado for especificamente 'draft', exibe todos os rascunhos para gestão completa
    if (selectedStageFilter === 'draft') {
      return validQuotes
        .filter(q => normalizeStatus(q) === 'draft')
        .map(q => {
          if (!isSameDay(parseQuoteTimestamp(q), now.getTime())) {
            return { ...q, date: todayFormatted };
          }
          return q;
        });
    }

    if (dateFilter === 'all') return validQuotes;

    if (dateFilter === 'today') {
      const todayMs = now.getTime();
      // Sempre traz para o dia atual os orçamentos que estão no status rascunho, atualizando a data dele para a data atual
      return validQuotes
        .filter(q => isSameDay(parseQuoteTimestamp(q), todayMs) || normalizeStatus(q) === 'draft')
        .map(q => {
          if (normalizeStatus(q) === 'draft' && !isSameDay(parseQuoteTimestamp(q), todayMs)) {
            return { ...q, date: todayFormatted };
          }
          return q;
        });
    }

    if (dateFilter === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yMs = y.getTime();
      return validQuotes.filter(q => isSameDay(parseQuoteTimestamp(q), yMs));
    }

    if (dateFilter === '7days') {
      const past7d = now.getTime() - (7 * 24 * 60 * 60 * 1000);
      return validQuotes.filter(q => parseQuoteTimestamp(q) >= past7d);
    }

    if (dateFilter === 'thisMonth') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
      return validQuotes.filter(q => parseQuoteTimestamp(q) >= startOfMonth);
    }

    if (dateFilter === 'specificDate') {
      if (!specificDate) return validQuotes;
      const parts = specificDate.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const targetTime = new Date(y, m, d, 12, 0, 0).getTime();
        return validQuotes.filter(q => isSameDay(parseQuoteTimestamp(q), targetTime));
      }
      return validQuotes;
    }

    if (dateFilter === 'customRange') {
      const startMs = customStartDate ? new Date(`${customStartDate}T00:00:00`).getTime() : 0;
      const endMs = customEndDate ? new Date(`${customEndDate}T23:59:59`).getTime() : Number.MAX_SAFE_INTEGER;
      return validQuotes.filter(q => {
        const t = parseQuoteTimestamp(q);
        return t >= startMs && t <= endMs;
      });
    }

    return validQuotes;
  }, [quotes, dateFilter, specificDate, customStartDate, customEndDate, selectedStageFilter]);

  // 2. Totais e métricas por estágio calculados sobre o período ativo
  const stageStats = useMemo(() => {
    const stats: Record<StageId | 'all', { count: number; totalAmount: number }> = {
      all: { count: dateFilteredQuotes.length, totalAmount: 0 },
      draft: { count: 0, totalAmount: 0 },
      sent: { count: 0, totalAmount: 0 },
      negotiating: { count: 0, totalAmount: 0 },
      approved: { count: 0, totalAmount: 0 },
      lost: { count: 0, totalAmount: 0 },
    };

    dateFilteredQuotes.forEach(q => {
      const amt = q.totalAmount || 0;
      stats.all.totalAmount += amt;
      const st = normalizeStatus(q);
      stats[st].count += 1;
      stats[st].totalAmount += amt;
    });

    return stats;
  }, [dateFilteredQuotes]);

  const followUpRequiredQuotes = useMemo(() => {
    return dateFilteredQuotes.filter(isFollowUpDue);
  }, [dateFilteredQuotes]);

  // 3. Lista final filtrada por estágio, busca textual e ordenada
  const filteredQuotes = useMemo(() => {
    return dateFilteredQuotes
      .filter(q => {
        const norm = normalizeStatus(q);
        if (selectedStageFilter !== 'all' && norm !== selectedStageFilter) return false;
        if (onlyFollowUpDue && !isFollowUpDue(q)) return false;

        if (searchTerm.trim()) {
          const term = normalizeSearchText(searchTerm);
          if (!term) return true;

          const comp = normalizeSearchText(q.clientCompany);
          const contact = normalizeSearchText(q.contactPerson);
          const code = normalizeSearchText(q.code);
          const subject = normalizeSearchText(q.subject);

          const itemMatch = Array.isArray(q.items) && q.items.some(it => {
            const name = normalizeSearchText(it.name);
            const desc = normalizeSearchText(it.description);
            const pn = normalizeSearchText(it.partNumber);
            const ncm = normalizeSearchText(it.ncm);
            const supp = normalizeSearchText(it.supplier);
            return (
              name.includes(term) ||
              desc.includes(term) ||
              pn.includes(term) ||
              ncm.includes(term) ||
              supp.includes(term)
            );
          });

          return comp.includes(term) || contact.includes(term) || code.includes(term) || subject.includes(term) || itemMatch;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'amount_desc') return (b.totalAmount || 0) - (a.totalAmount || 0);
        if (sortBy === 'amount_asc') return (a.totalAmount || 0) - (b.totalAmount || 0);

        // Classificação por horário de envio (mais recentes no topo)
        return getSortTimestamp(b) - getSortTimestamp(a);
      });
  }, [dateFilteredQuotes, selectedStageFilter, onlyFollowUpDue, searchTerm, sortBy]);

  return (
    <div className="space-y-5 animate-fadeIn">
      
      {/* Header com Design System Oficial */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl border border-sky-100 shrink-0">
            <History className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">
                Histórico Comercial
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Gerencie cada proposta na régua de estágios, acompanhe valores em negociação e controle os prazos de follow-up.
            </p>
          </div>
        </div>

        {/* Resumo Rápido */}
        <div className="flex items-center gap-2">
          <div className="bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Volume em Propostas
            </span>
            <span className="text-sm font-bold font-mono text-slate-900">
              R$ {stageStats.all.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Cards de Métricas & Filtros Interativos (Chips Superiores) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {[
          { id: 'all', title: 'Todas as Propostas', count: stageStats.all.count, amount: stageStats.all.totalAmount, badge: 'text-slate-700 bg-slate-100', dot: 'bg-slate-400' },
          { id: 'draft', title: 'Rascunhos', count: stageStats.draft.count, amount: stageStats.draft.totalAmount, badge: 'text-amber-800 bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
          { id: 'sent', title: 'Enviadas', count: stageStats.sent.count, amount: stageStats.sent.totalAmount, badge: 'text-sky-800 bg-sky-50 border-sky-200', dot: 'bg-sky-500' },
          { id: 'negotiating', title: 'Em Negociação', count: stageStats.negotiating.count, amount: stageStats.negotiating.totalAmount, badge: 'text-purple-800 bg-purple-50 border-purple-200', dot: 'bg-purple-500' },
          { id: 'approved', title: 'Aprovadas 🏆', count: stageStats.approved.count, amount: stageStats.approved.totalAmount, badge: 'text-emerald-800 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
          { id: 'lost', title: 'Perdidas', count: stageStats.lost.count, amount: stageStats.lost.totalAmount, badge: 'text-rose-800 bg-rose-50 border-rose-200', dot: 'bg-rose-400' },
        ].map(card => {
          const isSelected = selectedStageFilter === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                handleSelectStage(card.id as any);
                setOnlyFollowUpDue(false);
              }}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-sky-50/80 border-sky-400 ring-2 ring-sky-200 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[11px] font-bold text-slate-600 truncate flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${card.dot}`}></span>
                  <span className="truncate">{card.title}</span>
                </span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold shrink-0 ${card.badge}`}>
                  {card.count}
                </span>
              </div>
              <div className="font-mono text-xs font-bold text-slate-900 mt-1">
                R$ {card.amount.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
            </button>
          );
        })}
      </div>

      {/* Alerta de Follow-up Inteligente (+48h) */}
      {followUpRequiredQuotes.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center shrink-0">
              <Flame className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-amber-950">
                  Atenção de Vendas: Follow-up Recomendado
                </h4>
                <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full text-[10px] font-mono font-bold">
                  {followUpRequiredQuotes.length} proposta(s) sem retorno (+48h)
                </span>
              </div>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Propostas formais enviadas que ainda não foram convertidas em negociação ou fechamento.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOnlyFollowUpDue(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              onlyFollowUpDue
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{onlyFollowUpDue ? 'Exibindo Apenas +48h (Remover Filtro)' : 'Filtrar Propostas +48h'}</span>
          </button>
        </div>
      )}

      {/* Barra de Filtro de Datas & Períodos (Padrão: Hoje / Dia Corrente) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        
        {/* Esquerda: Contador de cotações no período selecionado */}
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-sky-50 text-sky-600 rounded-xl border border-sky-100 shrink-0">
            <Calendar className="w-4 h-4 text-sky-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">
                Período:
              </span>
              <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-lg text-[11px] font-mono font-bold">
                {getDateFilterLabel(dateFilter)}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">
              {dateFilteredQuotes.length} {dateFilteredQuotes.length === 1 ? 'proposta no período' : 'propostas no período'}
            </span>
          </div>
        </div>

        {/* Direita: Seletores Rápidos de Período & Busca por Dia / Intervalo */}
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 gap-0.5 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setDateFilter('today')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                dateFilter === 'today' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Exibir cotações de hoje (Padrão)"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('yesterday')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                dateFilter === 'yesterday' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Exibir cotações de ontem"
            >
              Ontem
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('7days')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                dateFilter === '7days' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Últimos 7 dias"
            >
              7 dias
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('thisMonth')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                dateFilter === 'thisMonth' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Cotações deste mês"
            >
              Este Mês
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('all')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                dateFilter === 'all' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Todo o histórico de cotações"
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('specificDate')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 flex items-center gap-1 ${
                dateFilter === 'specificDate' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Filtrar por dia específico"
            >
              <Calendar className="w-3.5 h-3.5 text-sky-600" />
              <span>Por Dia</span>
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('customRange')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 flex items-center gap-1 ${
                dateFilter === 'customRange' ? 'bg-white text-sky-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Filtrar por intervalo de datas"
            >
              <CalendarDays className="w-3.5 h-3.5 text-sky-600" />
              <span>Período</span>
            </button>
          </div>
        </div>

      </div>

      {/* Se dateFilter === 'specificDate', mostra o campo para escolher o dia */}
      {dateFilter === 'specificDate' && (
        <div className="bg-sky-50/60 border border-sky-200/80 p-3 rounded-2xl flex flex-wrap items-center justify-end gap-3 text-xs animate-fadeIn ml-auto w-fit">
          <div className="flex items-center gap-1.5 font-semibold text-sky-900">
            <Calendar className="w-3.5 h-3.5 text-sky-600" />
            <span>Selecionar Dia:</span>
          </div>
          <input
            type="date"
            value={specificDate}
            onChange={(e) => setSpecificDate(e.target.value)}
            className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-xs font-mono"
          />
          {specificDate && (
            <button
              type="button"
              onClick={() => setDateFilter('today')}
              className="text-xs font-bold text-sky-700 hover:text-sky-900 underline cursor-pointer"
            >
              Voltar para Hoje
            </button>
          )}
        </div>
      )}

      {/* Se dateFilter === 'customRange', mostra os campos De / Até */}
      {dateFilter === 'customRange' && (
        <div className="bg-sky-50/60 border border-sky-200/80 p-3 rounded-2xl flex flex-wrap items-center justify-end gap-3 text-xs animate-fadeIn ml-auto w-fit">
          <div className="flex items-center gap-1.5 font-semibold text-sky-900">
            <Filter className="w-3.5 h-3.5 text-sky-600" />
            <span>Período Personalizado:</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-600 font-medium">De:</label>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-xs font-mono"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-600 font-medium">Até:</label>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-xs font-mono"
            />
          </div>
          {(customStartDate || customEndDate) && (
            <button
              type="button"
              onClick={() => { setCustomStartDate(''); setCustomEndDate(''); }}
              className="text-xs font-bold text-sky-700 hover:text-sky-900 underline cursor-pointer"
            >
              Limpar datas
            </button>
          )}
        </div>
      )}

      {/* Barra de Busca e Ordenação */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por produto, empresa, comprador, part number ou código..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <span>Ordenar:</span>
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-sky-500"
          >
            <option value="recent">Horário de Envio (Mais Recentes)</option>
            <option value="amount_desc">Maior Valor (R$)</option>
            <option value="amount_asc">Menor Valor (R$)</option>
          </select>
        </div>
      </div>

      {/* Lista de Propostas em Estilo Pipeline Row */}
      {filteredQuotes.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-lg mx-auto shadow-xs space-y-3">
          <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mx-auto border border-sky-100">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            Nenhuma proposta encontrada
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {searchTerm || selectedStageFilter !== 'all' || onlyFollowUpDue
              ? 'Nenhum orçamento corresponde aos filtros de busca ou estágio selecionados.'
              : dateFilter === 'today'
                ? 'Nenhum orçamento emitido no dia de hoje até o momento.'
                : `Nenhum orçamento encontrado para o filtro (${getDateFilterLabel(dateFilter)}).`}
          </p>
          {dateFilter !== 'all' && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setDateFilter('all')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5 text-sky-600" />
                Ver Todo o Histórico
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredQuotes.map((q) => {
            const currentStage = normalizeStatus(q);
            const isDue = isFollowUpDue(q);

            return (
              <div
                key={q.id}
                className={`bg-white border rounded-2xl p-4 shadow-xs transition hover:shadow-sm flex flex-col gap-3 group ${
                  isDue ? 'border-amber-300/80 bg-amber-50/10' : 'border-slate-200 hover:border-sky-300'
                }`}
              >
                {/* 1. Nível Superior: Identificação da Proposta & Cliente à esquerda, Financeiro à direita */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  {/* Esquerda: Código, Data/Hora e Dados do Cliente */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    {(() => {
                      const { displayDate, displayTime } = formatQuoteDateTime(q);
                      return (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-lg border border-sky-200">
                            {q.code || 'PROPOSTA'}
                          </span>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{displayDate}</span>
                            </span>
                            {displayTime && (
                              <span 
                                className="flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200/80 px-1.5 py-0.5 rounded font-mono text-[10.5px] font-semibold"
                                title={q.sentAt ? `Horário do envio: ${displayTime}` : `Horário de criação: ${displayTime}`}
                              >
                                <Clock className="w-2.5 h-2.5 text-sky-600 shrink-0" />
                                <span>{displayTime}</span>
                              </span>
                            )}
                          </div>
                          {currentStage === 'draft' && (
                            <span 
                              className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-[10px] font-bold flex items-center gap-1"
                              title="Orçamento em rascunho (pendente de envio)"
                            >
                              <Clock className="w-2.5 h-2.5 text-amber-600" />
                              Rascunho
                            </span>
                          )}
                          {isDue && (
                            <span 
                              className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-[10px] font-bold flex items-center gap-1 animate-pulse"
                              title="Enviada há mais de 48h sem resposta do cliente"
                            >
                              <Flame className="w-2.5 h-2.5 text-amber-600" />
                              +48h sem retorno
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    <div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-sky-700 transition flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{q.clientCompany || 'Cliente sem nome'}</span>
                      </h3>
                      <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{q.contactPerson || 'Comprador não especificado'}</span>
                        </span>
                        {q.clientEmail && (
                          <span className="text-slate-400 truncate max-w-[220px]">
                            • {q.clientEmail}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Direita: Valores Financeiros & Margem com destaque executivo */}
                  <div className="sm:text-right shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 flex sm:flex-col justify-between sm:justify-start items-baseline sm:items-end">
                    <span className="text-base sm:text-lg font-mono font-bold text-emerald-700 block">
                      R$ {q.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <div className="flex items-center sm:justify-end gap-2 text-[11px] text-slate-500 mt-0.5">
                      <span>{q.items?.length || 0} produto(s)</span>
                      <span>•</span>
                      <span className="font-semibold text-sky-700 font-mono">
                        {q.averageMargin?.toFixed(0) || 25}% margem
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Nível Inferior: Barra de Controle (Stepper do Pipeline à esquerda + Ações à direita) */}
                <div className="border-t border-slate-100 pt-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                  {/* Stepper de Estágio Comercial Interativo */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center bg-slate-50 p-1 rounded-xl border border-slate-200 overflow-x-auto max-w-full">
                      {PIPELINE_STAGES.map((stage, idx) => {
                        const isCurrent = currentStage === stage.id;
                        const Icon = stage.icon;

                        return (
                          <React.Fragment key={stage.id}>
                            <button
                              type="button"
                              onClick={() => {
                                if (onUpdateQuoteStatus) {
                                  onUpdateQuoteStatus(q.id, stage.id);
                                }
                              }}
                              className={`py-1 px-2.5 sm:px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                                isCurrent
                                  ? `${stage.activeBg} ${stage.activeText} border ${stage.activeBorder} shadow-2xs`
                                  : 'text-slate-500 hover:text-slate-800 hover:bg-white/80'
                              }`}
                              title={`Mover para estágio: ${stage.label}`}
                            >
                              <Icon className={`w-3.5 h-3.5 ${isCurrent ? stage.activeText : 'text-slate-400'}`} />
                              <span className="text-[11px] sm:text-xs">{stage.shortLabel}</span>
                            </button>
                            {idx < PIPELINE_STAGES.length - 1 && (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mx-0.5" />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>

                    {/* Opção discreta de marcar como Perdida */}
                    {currentStage === 'lost' ? (
                      <span className="text-[10px] text-rose-700 bg-rose-50 px-2 py-1 rounded-lg border border-rose-200 font-bold flex items-center gap-1">
                        <X className="w-3 h-3 text-rose-600" /> Perdida / Declinada
                      </span>
                    ) : (
                      onUpdateQuoteStatus && (
                        <button
                          type="button"
                          onClick={() => onUpdateQuoteStatus(q.id, 'lost')}
                          className="text-[11px] text-slate-400 hover:text-rose-600 transition flex items-center gap-1 px-2 py-1 hover:bg-rose-50 rounded-lg cursor-pointer"
                          title="Marcar como proposta perdida"
                        >
                          <X className="w-3 h-3" />
                          <span>Perdida</span>
                        </button>
                      )
                    )}
                  </div>

                  {/* Botões de Ação Padronizados */}
                  <div className="flex items-center md:justify-end gap-1.5 shrink-0 flex-wrap">
                    {onEditQuote && (
                      <button
                        type="button"
                        onClick={() => {
                          if (currentStage === 'draft') {
                            const todayFormatted = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
                            onEditQuote({ ...q, date: todayFormatted, createdAt: new Date().toISOString() });
                          } else {
                            onEditQuote(q);
                          }
                        }}
                        className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 hover:text-sky-900 border border-sky-200 rounded-xl font-bold text-xs transition flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
                        title="Editar proposta no QuoteBuilder"
                      >
                        <FileEdit className="w-3.5 h-3.5 text-sky-600" />
                        <span>Editar</span>
                      </button>
                    )}

                    {onDuplicateQuote && (
                      <button
                        type="button"
                        onClick={() => onDuplicateQuote(q)}
                        className="px-3 py-1.5 bg-slate-50 hover:bg-sky-50 text-slate-700 hover:text-sky-800 border border-slate-200 hover:border-sky-200 rounded-xl font-bold text-xs transition flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
                        title="Duplicar proposta como uma nova cotação com código único e itens preservados"
                      >
                        <Copy className="w-3.5 h-3.5 text-sky-600" />
                        <span>Duplicar</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        if (currentStage === 'draft') {
                          const todayFormatted = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
                          onOpenQuote({ ...q, date: todayFormatted, createdAt: new Date().toISOString() });
                        } else {
                          onOpenQuote(q);
                        }
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl font-bold text-xs transition flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
                      title="Visualizar documento pronto para impressão/PDF"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-600" />
                      <span>Visualizar</span>
                    </button>

                    {onDeleteQuote && (
                      <button
                        type="button"
                        onClick={() => setQuoteToDelete(q)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-xl transition shadow-2xs cursor-pointer"
                        title="Excluir proposta"
                      >
                        <Trash2 className="w-4 h-4 text-rose-500" />
                      </button>
                    )}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Modal Moderno de Confirmação de Exclusão */}
      {quoteToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div 
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-900">
                  Excluir Orçamento?
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Tem certeza que deseja excluir o orçamento <strong className="font-mono text-slate-700">{quoteToDelete.code}</strong> da empresa <strong className="text-slate-700">"{quoteToDelete.clientCompany}"</strong>?
                </p>
                <p className="text-[11px] text-rose-600 font-semibold mt-1">
                  Esta ação não poderá ser desfeita.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuoteToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span>Comprador:</span>
                <span className="font-medium text-slate-800">{quoteToDelete.contactPerson || 'Não informado'}</span>
              </div>
              <div className="flex justify-between">
                <span>Total:</span>
                <span className="font-mono font-bold text-emerald-700">
                  R$ {quoteToDelete.totalAmount?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setQuoteToDelete(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteQuote && quoteToDelete) {
                    onDeleteQuote(quoteToDelete);
                  }
                  setQuoteToDelete(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sim, Excluir</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
