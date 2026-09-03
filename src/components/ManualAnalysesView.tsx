import React, { useState } from 'react';
import {
  Inbox,
  Camera,
  FileText,
  Sparkles,
  Trash2,
  Search,
  Clock,
  Building,
  User,
  Phone,
  MapPin,
  ChevronRight,
  ArrowRight,
  Package,
  Info,
  Loader2,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { IncomingEmail } from '../types';
import { extractDataFromQuotationImage } from '../services/imageQuoteParser';

interface ManualAnalysesViewProps {
  analyses: IncomingEmail[];
  onSelectToQuote: (email: IncomingEmail) => void;
  onDelete: (id: string) => void;
  onUpdateAnalysis: (id: string, updates: Partial<IncomingEmail>) => void;
}

export const ManualAnalysesView: React.FC<ManualAnalysesViewProps> = ({
  analyses,
  onSelectToQuote,
  onDelete,
  onUpdateAnalysis
}) => {
  const [selected, setSelected] = useState<IncomingEmail | null>(analyses[0] || null);
  const [filterText, setFilterText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Estado da extração IA
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [extractMsg, setExtractMsg] = useState('');
  const [extractFeedback, setExtractFeedback] = useState<string | null>(null);

  const filtered = analyses.filter(a => {
    if (!filterText.trim()) return true;
    const q = filterText.toLowerCase();
    return (
      a.subject.toLowerCase().includes(q) ||
      a.senderCompany.toLowerCase().includes(q) ||
      a.senderName.toLowerCase().includes(q)
    );
  });

  const isPhoto = (email: IncomingEmail) =>
    email.id.startsWith('mail-photo-') ||
    email.subject.toLowerCase().includes('foto') ||
    email.subject.toLowerCase().includes('print');

  const handleDelete = (id: string) => {
    if (confirmDeleteId === id) {
      onDelete(id);
      if (selected?.id === id) {
        const remaining = analyses.filter(a => a.id !== id);
        setSelected(remaining[0] || null);
      }
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  /** Extrai a imagem embutida do bodyHtml da análise */
  const getImageSrcFromAnalysis = (email: IncomingEmail): string | null => {
    if (email.bodyHtml) {
      const match = email.bodyHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (match && match[1] && match[1].length > 10) return match[1];
    }
    return null;
  };

  const handleExtractWithAI = async () => {
    if (!selected) return;

    const imgSrc = getImageSrcFromAnalysis(selected);
    if (!imgSrc) {
      setExtractFeedback('⚠️ Nenhuma imagem encontrada nesta análise. O botão funciona apenas para análises criadas a partir de foto.');
      setTimeout(() => setExtractFeedback(null), 5000);
      return;
    }

    setIsExtracting(true);
    setExtractProgress(10);
    setExtractMsg('Iniciando extração com IA...');
    setExtractFeedback(null);

    try {
      const data = await extractDataFromQuotationImage(imgSrc, (p, msg) => {
        setExtractProgress(p);
        setExtractMsg(msg);
      });

      if (data.items && data.items.length > 0) {
        const updates: Partial<IncomingEmail> = {
          suggestedItems: data.items,
          ...(data.senderName && data.senderName !== 'Cliente / Solicitante' && { senderName: data.senderName }),
          ...(data.senderCompany && data.senderCompany !== 'Empresa / Solicitante' && { senderCompany: data.senderCompany }),
          ...(data.senderEmail && data.senderEmail !== 'cliente@empresa.com.br' && { senderEmail: data.senderEmail }),
          ...(data.senderPhone && { senderPhone: data.senderPhone }),
          ...(data.deliveryLocation && { deliveryLocation: data.deliveryLocation }),
        };

        // Atualizar no state local para feedback imediato
        setSelected(prev => prev ? { ...prev, ...updates } : null);

        // Persistir no storage via callback
        onUpdateAnalysis(selected.id, updates);

        setExtractFeedback(`✓ ${data.items.length} iten${data.items.length !== 1 ? 's' : ''} extraído${data.items.length !== 1 ? 's' : ''} com sucesso!`);
        setTimeout(() => setExtractFeedback(null), 6000);
      } else {
        setExtractFeedback('⚠️ Nenhum item identificado na imagem. Tente ajustar a qualidade da foto ou adicione os itens manualmente.');
        setTimeout(() => setExtractFeedback(null), 7000);
      }
    } catch (err) {
      console.error('[ManualAnalysesView] Erro na extração:', err);
      setExtractFeedback('❌ Erro ao processar a imagem. Tente novamente.');
      setTimeout(() => setExtractFeedback(null), 5000);
    } finally {
      setIsExtracting(false);
      setExtractProgress(0);
      setExtractMsg('');
    }
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-10rem)]">
      {/* ─── Painel esquerdo: lista ─────────────────────────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-violet-50 rounded-lg">
              <Inbox className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Análises Avulsas</h2>
              <p className="text-[10px] text-slate-500">{analyses.length} item{analyses.length !== 1 ? 's' : ''} salvo{analyses.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 bg-slate-50"
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center">
              <div className="p-3 bg-slate-100 rounded-full mb-3">
                <Inbox className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-500">Nenhuma análise avulsa</p>
              <p className="text-xs text-slate-400 mt-1">
                Vá ao Inbox e cole um e-mail ou foto para salvar aqui
              </p>
            </div>
          ) : (
            filtered.map(a => (
              <button
                key={a.id}
                onClick={() => {
                  setSelected(a);
                  setExtractFeedback(null);
                }}
                className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-all group ${
                  selected?.id === a.id
                    ? 'bg-violet-50 border-l-2 border-l-violet-500'
                    : 'hover:bg-slate-50 border-l-2 border-l-transparent'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${isPhoto(a) ? 'bg-amber-50' : 'bg-sky-50'}`}>
                    {isPhoto(a)
                      ? <Camera className="w-3.5 h-3.5 text-amber-500" />
                      : <FileText className="w-3.5 h-3.5 text-sky-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{a.senderCompany || 'Empresa não identificada'}</p>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{a.subject}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase ${
                        isPhoto(a) ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
                      }`}>
                        {isPhoto(a) ? <Camera className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
                        {isPhoto(a) ? 'Foto' : 'Texto'}
                      </span>
                      <span className="text-[9px] text-slate-400 flex items-center gap-1">
                        <Package className="w-2.5 h-2.5" />
                        {a.suggestedItems.length} iten{a.suggestedItems.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 mt-1 transition-colors ${
                    selected?.id === a.id ? 'text-violet-400' : 'text-slate-300 group-hover:text-slate-400'
                  }`} />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ─── Painel direito: detalhe ────────────────────────────────────────── */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="p-4 bg-violet-50 rounded-2xl mb-4">
              <Inbox className="w-10 h-10 text-violet-300" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 mb-1">Selecione uma análise</h3>
            <p className="text-sm text-slate-400 max-w-xs">
              Clique em uma análise avulsa à esquerda para ver os detalhes e gerar uma cotação
            </p>
          </div>
        ) : (
          <>
            {/* Header do detalhe */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`p-2 rounded-xl shrink-0 ${isPhoto(selected) ? 'bg-amber-100' : 'bg-sky-100'}`}>
                    {isPhoto(selected)
                      ? <Camera className="w-5 h-5 text-amber-600" />
                      : <FileText className="w-5 h-5 text-sky-600" />
                    }
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{selected.subject}</h3>
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {selected.date}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleDelete(selected.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      confirmDeleteId === selected.id
                        ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {confirmDeleteId === selected.id ? 'Confirmar exclusão' : 'Excluir'}
                  </button>
                  <button
                    onClick={() => onSelectToQuote(selected)}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition active:scale-95"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Gerar Cotação
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Metadados do remetente */}
            <div className="px-6 py-3 border-b border-slate-100 bg-white">
              <div className="grid grid-cols-2 gap-3">
                {selected.senderCompany && selected.senderCompany !== 'Empresa / Solicitante' && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-medium">{selected.senderCompany}</span>
                  </div>
                )}
                {selected.senderName && selected.senderName !== 'Cliente / Solicitante' && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{selected.senderName}</span>
                  </div>
                )}
                {selected.senderPhone && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{selected.senderPhone}</span>
                  </div>
                )}
                {selected.deliveryLocation && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{selected.deliveryLocation}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Botão Extrair com IA + barra de progresso ── */}
            {isPhoto(selected) && (
              <div className="px-6 py-3 border-b border-slate-100 bg-amber-50/60">
                {isExtracting ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin shrink-0" />
                      <p className="text-xs text-amber-700 font-medium">{extractMsg}</p>
                    </div>
                    <div className="w-full bg-amber-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-300"
                        style={{ width: `${extractProgress}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-amber-600">{extractProgress}% concluído</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      {extractFeedback ? (
                        <p className={`text-xs font-medium flex items-center gap-1.5 ${
                          extractFeedback.startsWith('✓') ? 'text-green-700' : 
                          extractFeedback.startsWith('⚠') ? 'text-amber-700' : 'text-red-600'
                        }`}>
                          {extractFeedback.startsWith('✓') && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                          {extractFeedback}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-700">
                          {selected.suggestedItems.length === 0
                            ? 'Nenhum item extraído ainda. Use a IA para identificar os produtos da foto.'
                            : `${selected.suggestedItems.length} iten${selected.suggestedItems.length !== 1 ? 's' : ''} extraído${selected.suggestedItems.length !== 1 ? 's' : ''}. Você pode re-extrair a qualquer momento.`
                          }
                        </p>
                      )}
                    </div>
                    <button
                      onClick={handleExtractWithAI}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-lg text-xs font-bold shadow-sm transition active:scale-95 whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Extrair Itens da Foto com IA
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Itens extraídos */}
            <div className="flex-1 overflow-y-auto">
              {selected.suggestedItems.length > 0 ? (
                <div className="px-6 py-4 border-b border-slate-100">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                    Itens Extraídos ({selected.suggestedItems.length})
                  </h4>
                  <div className="space-y-2">
                    {selected.suggestedItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100"
                      >
                        <span className="shrink-0 w-5 h-5 flex items-center justify-center bg-slate-200 text-slate-600 text-[10px] font-bold rounded-full mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-800 truncate">{item.name}</p>
                          {item.description && item.description !== item.name && (
                            <p className="text-[10px] text-slate-500 truncate mt-0.5">{item.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] text-slate-500">Qtd: <strong>{item.quantity}</strong> {item.unit}</span>
                            {item.partNumber && (
                              <span className="text-[10px] text-slate-500">REF: <strong>{item.partNumber}</strong></span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : !isExtracting && (
                <div className="px-6 py-6 text-center">
                  <div className="p-3 bg-slate-100 rounded-full w-fit mx-auto mb-3">
                    <Package className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500 font-medium">Nenhum item extraído</p>
                  {isPhoto(selected) && (
                    <p className="text-xs text-slate-400 mt-1">
                      Clique em "Extrair Itens da Foto com IA" acima para identificar os produtos
                    </p>
                  )}
                </div>
              )}

              {/* Preview do conteúdo original */}
              <div className="px-6 py-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-400" />
                  Conteúdo Original
                </h4>
                {selected.bodyHtml ? (
                  <div
                    className="text-xs border border-slate-200 rounded-xl overflow-auto bg-white"
                    style={{ maxHeight: '300px' }}
                    dangerouslySetInnerHTML={{ __html: selected.bodyHtml }}
                  />
                ) : (
                  <pre className="text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-64 overflow-y-auto">
                    {selected.body || '(sem conteúdo)'}
                  </pre>
                )}
              </div>
            </div>

            {/* CTA fixo no rodapé */}
            <div className="px-6 py-3 bg-gradient-to-r from-violet-50 to-indigo-50 border-t border-violet-100 flex items-center justify-between">
              <p className="text-xs text-violet-700">
                <strong>{selected.suggestedItems.length} iten{selected.suggestedItems.length !== 1 ? 's' : ''}</strong> prontos para cotação
              </p>
              <button
                onClick={() => onSelectToQuote(selected)}
                className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm transition active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Gerar Cotação
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
