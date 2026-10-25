import React from 'react';
import { ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2, X, ArrowRight, UserCheck, DollarSign, FileText } from 'lucide-react';
import { Quote, QuoteItem } from '../types';

export interface AuditIssue {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  itemId?: string;
  itemNumber?: number;
}

export function auditQuote(quote: Quote): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const items = quote.items || [];

  // 1. Checa se há itens
  if (items.length === 0) {
    issues.push({
      id: 'no_items',
      type: 'critical',
      title: 'Proposta sem produtos',
      description: 'Adicione pelo menos 1 item para gerar o orçamento.'
    });
    return issues;
  }

  // 2. Custos zerados
  items.forEach(it => {
    if (!it.costPrice || it.costPrice <= 0) {
      issues.push({
        id: `zero_cost_${it.id}`,
        type: 'critical',
        title: `Item ${it.itemNumber}: Custo de compra zerado (R$ 0,00)`,
        description: `"${it.name || 'Produto'}" está sem preço de custo cadastrado. Isso pode distorcer a margem ou gerar prejuízo.`,
        itemId: it.id,
        itemNumber: it.itemNumber
      });
    }
  });

  // 3. NCM incompleto ou ausente
  items.forEach(it => {
    const cleanNcm = (it.ncm || '').replace(/\D/g, '');
    if (!cleanNcm || cleanNcm.length < 8) {
      issues.push({
        id: `missing_ncm_${it.id}`,
        type: 'warning',
        title: `Item ${it.itemNumber}: NCM ausente ou incompleto`,
        description: `"${it.name || 'Produto'}" está sem NCM fiscal de 8 dígitos. Pode haver retenção ou dúvida no faturamento.`,
        itemId: it.id,
        itemNumber: it.itemNumber
      });
    }
  });

  // 4. Quantidade inválida
  items.forEach(it => {
    if (!it.quantity || it.quantity <= 0) {
      issues.push({
        id: `invalid_qty_${it.id}`,
        type: 'critical',
        title: `Item ${it.itemNumber}: Quantidade inválida`,
        description: `O item "${it.name || 'Produto'}" possui quantidade zerada ou negativa.`,
        itemId: it.id,
        itemNumber: it.itemNumber
      });
    }
  });

  // 5. Dados de contato do cliente
  if (!quote.clientCompany || quote.clientCompany.trim() === 'Cliente Avulso' || quote.clientCompany.trim() === '') {
    issues.push({
      id: 'missing_company',
      type: 'info',
      title: 'Empresa do cliente não especificada',
      description: 'A proposta está marcada como Cliente Avulso. Vincular a uma empresa facilita histórico e faturamento.'
    });
  }

  if (!quote.clientEmail && !quote.clientPhone) {
    issues.push({
      id: 'missing_contact',
      type: 'warning',
      title: 'Cliente sem E-mail e sem WhatsApp',
      description: 'Nenhum canal de envio foi preenchido. Cadastre o e-mail ou WhatsApp para envio ágil.'
    });
  }

  return issues;
}

interface QuoteAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: Quote;
  onProceed: () => void;
  onFocusItem?: (itemId: string) => void;
}

export const QuoteAuditModal: React.FC<QuoteAuditModalProps> = ({
  isOpen,
  onClose,
  quote,
  onProceed,
  onFocusItem
}) => {
  if (!isOpen) return null;

  const issues = auditQuote(quote);
  const criticalCount = issues.filter(i => i.type === 'critical').length;
  const warningCount = issues.filter(i => i.type === 'warning').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs ${
              issues.length === 0
                ? 'bg-emerald-100 text-emerald-700'
                : criticalCount > 0
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-amber-100 text-amber-700'
            }`}>
              {issues.length === 0 ? (
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              ) : criticalCount > 0 ? (
                <AlertCircle className="w-5 h-5 text-rose-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              )}
            </div>
            <div>
              <h2 className="sq-section-title text-base md:text-lg">
                Auditor de Proposta Comercial
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Checklist preventivo antes de gerar PDF, WhatsApp ou faturamento
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

        {/* Conteúdo */}
        <div className="p-6 overflow-y-auto space-y-4">
          {issues.length === 0 ? (
            <div className="text-center py-8 px-4 bg-emerald-50/60 rounded-2xl border border-emerald-200/80">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-emerald-950">
                Proposta 100% Auditada e Pronta!
              </h3>
              <p className="text-xs text-emerald-800 max-w-sm mx-auto mt-1">
                Todos os itens possuem preços de custo, NCMs de 8 dígitos, quantidades válidas e dados comerciais corretos.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold px-1 text-slate-600">
                <span>Itens com pontos de atenção ({issues.length}):</span>
                {criticalCount > 0 && (
                  <span className="text-rose-600 font-bold">
                    {criticalCount} {criticalCount === 1 ? 'crítico' : 'críticos'}
                  </span>
                )}
              </div>

              {issues.map(iss => (
                <div
                  key={iss.id}
                  className={`p-3.5 rounded-xl border flex items-start gap-3 transition-colors ${
                    iss.type === 'critical'
                      ? 'bg-rose-50/60 border-rose-200/80 text-rose-950'
                      : iss.type === 'warning'
                        ? 'bg-amber-50/60 border-amber-200/80 text-amber-950'
                        : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {iss.type === 'critical' ? (
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                    ) : iss.type === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                    ) : (
                      <FileText className="w-4 h-4 text-sky-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold">{iss.title}</h4>
                    <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">{iss.description}</p>
                  </div>
                  {iss.itemId && onFocusItem && (
                    <button
                      type="button"
                      onClick={() => {
                        onFocusItem(iss.itemId!);
                        onClose();
                      }}
                      className="px-2 py-1 text-[11px] font-bold rounded-lg bg-white/80 hover:bg-white text-slate-700 border border-slate-200 shadow-2xs shrink-0 self-center"
                    >
                      Ver Item
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="sq-btn-neutral"
          >
            {issues.length === 0 ? 'Fechar' : 'Voltar e Revisar'}
          </button>
          <button
            type="button"
            onClick={() => {
              onProceed();
              onClose();
            }}
            className={`flex items-center gap-2 ${
              issues.length === 0 || criticalCount === 0
                ? 'sq-btn-primary'
                : 'sq-btn-neutral text-rose-700 border-rose-200 hover:bg-rose-50'
            }`}
          >
            <span>{issues.length === 0 ? 'Prosseguir com Envio' : 'Prosseguir Mesmo Assim'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
