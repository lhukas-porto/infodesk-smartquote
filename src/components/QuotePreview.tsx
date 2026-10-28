import React, { useRef, useState, useEffect } from 'react';
import { 
  Printer, 
  Send, 
  ArrowLeft, 
  Copy, 
  Check, 
  Download, 
  FileSpreadsheet,
  Edit3,
  Sliders,
  Plus,
  Minus,
  Trash2,
  RotateCcw,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  MoveVertical
} from 'lucide-react';
import { CompanySettings, Quote, QuoteItem } from '../types';
import { 
  formatCompanyPrefix, 
  formatContactPerson, 
  extractDeliveryExceptionDetails, 
  formatProposalValidityText,
  shouldDisplayShippingInProposal 
} from '../utils/aiEmailParser';
import { reportError } from '../services/errorReporter';

interface QuotePreviewProps {
  quote: Quote;
  settings: CompanySettings;
  onBackToEdit: () => void;
  onSendEmail: () => void;
  sourceTab?: 'builder' | 'history' | 'purchases' | 'dashboard';
  isEmailModalOpen?: boolean;
}

export const QuotePreview: React.FC<QuotePreviewProps> = ({
  quote,
  settings,
  onBackToEdit,
  onSendEmail,
  sourceTab = 'builder',
  isEmailModalOpen = false
}) => {
  const documentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloadingDoc, setDownloadingDoc] = useState(false);

  // Estados de Ajuste de Diagramação e Posicionamento (Cabeçalho & Rodapé)
  const [headerTopOffset, setHeaderTopOffset] = useState<number>(0); // cm
  const [headerBottomOffset, setHeaderBottomOffset] = useState<number>(1.2); // cm
  const [footerBottomOffset, setFooterBottomOffset] = useState<number>(0); // cm
  const [footerTopOffset, setFooterTopOffset] = useState<number>(0.8); // cm
  const [isFooterStuckToBottom, setIsFooterStuckToBottom] = useState<boolean>(true);

  // Linhas em branco adicionais entre seções
  const [extraLines, setExtraLines] = useState<Record<string, number>>({
    afterHeader: 0,
    afterClient: 0,
    afterOpening: 0,
    afterTable: 0,
    afterConditions: 0,
    afterSignature: 0,
  });

  // Modo de Edição Livre na Folha
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [isDiagramPanelOpen, setIsDiagramPanelOpen] = useState<boolean>(true);

  // Cópia local dos itens para permitir adicionar ou retirar linhas da tabela
  const [previewItems, setPreviewItems] = useState<QuoteItem[]>(() => quote.items || []);

  useEffect(() => {
    setPreviewItems(quote.items || []);
  }, [quote.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEmailModalOpen) return;
        e.preventDefault();
        onBackToEdit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBackToEdit, isEmailModalOpen]);

  const cleanPhone = (settings.phone || '61 3033-5373').replace(/[()]/g, '').trim();
  const cleanWhatsapp = (settings.whatsapp || '61 9 9627-2630').replace(/[()]/g, '').trim();

  const getResolvedOpeningText = (openingText?: string, defaultText?: string) => {
    const fallback = 'Em atenção à solicitação de Vossa Senhoria, temos a grata satisfação de submeter à apreciação a nossa proposta de preços para fornecimento dos produtos relacionados a seguir:';
    const chosen = (openingText && openingText.trim()) || (defaultText && defaultText.trim()) || fallback;
    if (chosen === 'Em atenção...' || chosen === 'Em atenção' || chosen.length < 15 || chosen.startsWith('Em atenção ao que foi solicitado')) {
      return fallback;
    }
    return chosen;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadDoc = async () => {
    try {
      setDownloadingDoc(true);
      const { exportQuoteToWord } = await import('../utils/wordExport');
      await exportQuoteToWord(quote, settings);
    } catch (err) {
      console.error('Erro ao gerar proposta em Word:', err);
      reportError('Falha ao gerar proposta em Word (.docx)', err, 'QuotePreview - handleDownloadDoc');
      alert('Não foi possível gerar o arquivo Word (.docx). Por favor, tente novamente.');
    } finally {
      setDownloadingDoc(false);
    }
  };

  const handleCopyToClipboard = () => {
    const text = `PROPOSTA COMERCIAL — INFODESK\n\n` +
      `Ao ${quote.clientCompany}\n` +
      (quote.contactPerson ? `${formatContactPerson(quote.contactPerson)}\n` : '') +
      `E-mail: ${quote.clientEmail}\n\n` +
      `${getResolvedOpeningText(quote.openingText, settings.defaultOpeningText)}\n\n` +
      previewItems.map(i => `${i.itemNumber}. ${i.name} | Qtd: ${i.quantity} ${i.unit} | Unit: R$ ${i.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Total: R$ ${i.totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join('\n') +
      `\n\nTotal Geral: R$ ${quote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n` +
      `Condições Gerais:\n` +
      `- Validade: ${formatProposalValidityText(quote.validityDays)}\n` +
      `- Pagamento: ${quote.paymentTerms}\n` +
      `- Prazo de Entrega: ${quote.deliveryDays}\n` +
      `- Garantia: ${quote.warrantyTerms}\n` +
      (shouldDisplayShippingInProposal(quote) && quote.shippingTerms ? `- ${quote.shippingTerms.toLowerCase().startsWith('frete') ? quote.shippingTerms : `Frete: ${quote.shippingTerms}`}\n` : '') +
      (() => {
        const clean = (quote.observations || quote.notes || '').trim().replace(/^(obs(\.|ervação|ervações)?\s*:\s*)/i, '').trim();
        return clean ? `- Obs: ${clean}\n\n` : '\n';
      })() +
      `${quote.city || (settings.cityState ? settings.cityState.split('-')[0].trim() : 'Brasília')}, ${quote.date}.\n\n` +
      `${settings.representativeName}\n` +
      `Tel: ${cleanPhone} / WhatsApp: ${cleanWhatsapp}\n` +
      `${settings.companyName}\n` +
      `${settings.address} – ${settings.cityState}\n` +
      `CNPJ: ${settings.cnpj}  I.E.: ${settings.stateRegistration}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Funções de Controle de Linhas
  const handleAddExtraLine = (sectionKey: string) => {
    setExtraLines(prev => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || 0) + 1
    }));
  };

  const handleRemoveExtraLine = (sectionKey: string) => {
    setExtraLines(prev => ({
      ...prev,
      [sectionKey]: Math.max(0, (prev[sectionKey] || 0) - 1)
    }));
  };

  // Predefinições
  const handleApplySinglePageFit = () => {
    setHeaderTopOffset(0);
    setHeaderBottomOffset(0.6);
    setFooterTopOffset(0.4);
    setFooterBottomOffset(0);
    setIsFooterStuckToBottom(true);
    setExtraLines({
      afterHeader: 0,
      afterClient: 0,
      afterOpening: 0,
      afterTable: 0,
      afterConditions: 0,
      afterSignature: 0,
    });
  };

  const handleApplyExpandedLayout = () => {
    setHeaderTopOffset(0.2);
    setHeaderBottomOffset(1.6);
    setFooterTopOffset(1.2);
    setFooterBottomOffset(0.3);
    setIsFooterStuckToBottom(true);
    setExtraLines({
      afterHeader: 1,
      afterClient: 0,
      afterOpening: 0,
      afterTable: 1,
      afterConditions: 1,
      afterSignature: 1,
    });
  };

  const handleResetDefaults = () => {
    setHeaderTopOffset(0);
    setHeaderBottomOffset(1.2);
    setFooterTopOffset(0.8);
    setFooterBottomOffset(0);
    setIsFooterStuckToBottom(true);
    setExtraLines({
      afterHeader: 0,
      afterClient: 0,
      afterOpening: 0,
      afterTable: 0,
      afterConditions: 0,
      afterSignature: 0,
    });
    setPreviewItems(quote.items || []);
  };

  // Adicionar / Remover linha da tabela de produtos
  const handleAddTableRow = () => {
    const nextNumber = previewItems.length + 1;
    const newItem: QuoteItem = {
      id: `preview-item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      itemNumber: nextNumber,
      name: 'Novo Item Comercial',
      description: '',
      quantity: 1,
      unit: 'Un.',
      costPrice: 0,
      markupPercent: 35,
      unitPrice: 0,
      totalPrice: 0
    };
    setPreviewItems(prev => [...prev, newItem]);
  };

  const handleRemoveTableRow = (id: string) => {
    setPreviewItems(prev => prev.filter(it => it.id !== id));
  };

  // Renderizador de Espaçador com Botões Interativos
  const renderSectionSpacer = (key: string, baseMarginCm: number = 0) => {
    const count = extraLines[key] || 0;
    return (
      <div 
        style={{ 
          marginBottom: `${baseMarginCm + (count * 0.45)}cm`,
          minHeight: count > 0 ? `${count * 0.45}cm` : undefined 
        }} 
        className="relative"
      >
        {isEditMode && (
          <div className="no-print my-0.5 flex items-center justify-center">
            <div className="flex items-center gap-1.5 bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 rounded-lg px-2 py-0.5 text-[10px] text-slate-500 hover:text-sky-700 transition shadow-2xs">
              <button
                type="button"
                onClick={() => handleAddExtraLine(key)}
                className="inline-flex items-center gap-0.5 font-bold hover:text-sky-800 cursor-pointer"
                title="Adicionar linha de espaço neste ponto"
              >
                <Plus className="w-3 h-3 text-sky-600" />
                <span>Linha</span>
              </button>
              {count > 0 && (
                <>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveExtraLine(key)}
                    className="inline-flex items-center gap-0.5 font-bold hover:text-red-600 cursor-pointer text-red-500"
                    title="Remover linha de espaço"
                  >
                    <Minus className="w-3 h-3" />
                    <span>Linha ({count})</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const editableClass = isEditMode
    ? "outline-dashed outline-1 outline-sky-300 hover:outline-sky-500 hover:bg-sky-50/40 rounded px-1 transition cursor-text"
    : "";

  return (
    <div className="space-y-4 print:space-y-0 print:m-0 print:p-0">
      
      {/* Top Action Toolbar (Hidden during Print) */}
      <div className="no-print bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <button
          onClick={onBackToEdit}
          className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-semibold transition cursor-pointer active:scale-95"
          title="Voltar à tela anterior (ou pressione a tecla ESC)"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>
            {sourceTab === 'history' 
              ? 'Voltar ao Histórico' 
              : sourceTab === 'purchases' 
                ? 'Voltar a Compras' 
                : sourceTab === 'dashboard'
                  ? 'Voltar ao Dashboard'
                  : 'Voltar à Cotação'}
          </span>
          <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-slate-500 bg-slate-200/80 rounded font-semibold ml-0.5">
            ESC
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle do Painel de Diagramação */}
          <button
            type="button"
            onClick={() => setIsDiagramPanelOpen(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-semibold transition cursor-pointer ${
              isDiagramPanelOpen 
                ? 'bg-sky-50 border-sky-300 text-sky-800' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="Abrir/fechar controles de diagramação, cabeçalho, rodapé e linhas"
          >
            <Sliders className="w-3.5 h-3.5 text-sky-600" />
            <span>Ajustar Layout</span>
            {isDiagramPanelOpen ? <ChevronUp className="w-3 h-3 text-sky-600" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
          </button>

          {/* Toggle Modo Edição Direta na Folha */}
          <button
            type="button"
            onClick={() => setIsEditMode(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold transition cursor-pointer ${
              isEditMode 
                ? 'bg-amber-100 border-amber-300 text-amber-900 shadow-2xs' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-amber-50 hover:text-amber-800'
            }`}
            title="Permite clicar diretamente na folha para editar qualquer texto, adicionar ou retirar linhas com Enter/Backspace"
          >
            <Edit3 className={`w-3.5 h-3.5 ${isEditMode ? 'text-amber-700' : 'text-slate-500'}`} />
            <span>{isEditMode ? 'Modo Edição Ativo' : 'Editar na Folha'}</span>
          </button>

          <button
            onClick={handleCopyToClipboard}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-medium transition cursor-pointer"
            title="Copiar texto puro para WhatsApp"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado!' : 'Copiar Texto'}</span>
          </button>

          <button
            onClick={handleDownloadDoc}
            disabled={downloadingDoc}
            className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 bg-blue-50/50 hover:bg-blue-100/60 text-blue-700 rounded-xl text-xs font-semibold transition cursor-pointer"
            title="Baixar proposta comercial oficial em Microsoft Word (.docx)"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>{downloadingDoc ? 'Gerando Word...' : 'Exportar Word (.docx)'}</span>
          </button>

          <button
            onClick={async () => {
              try {
                const { exportCostSheetToExcel } = await import('../utils/excelExport');
                await exportCostSheetToExcel(quote);
              } catch (err) {
                console.error('Erro ao exportar planilha Excel:', err);
                reportError('Falha ao exportar planilha Excel (.xlsx)', err, 'QuotePreview - handleDownloadExcel');
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition shadow-2xs active:scale-95 cursor-pointer"
            title="Baixar planilha de custos e precificação detalhada no Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Exportar Excel (.xlsx)</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer active:scale-95"
            title="Imprimir ou Salvar em PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir / PDF</span>
          </button>

          <button
            onClick={onSendEmail}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-blue-500/20 transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Enviar ao Cliente</span>
          </button>
        </div>
      </div>

      {/* PAINEL DE CONTROLE DE DIAGRAMAÇÃO & CABEÇALHO/RODAPÉ (no-print) */}
      {isDiagramPanelOpen && (
        <div className="no-print bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3.5 animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center text-sky-700">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Diagramação & Ajustes da Folha A4</h4>
                <p className="text-[11px] text-slate-500">Posicione cabeçalho, rodapé e adicione/retire linhas para encaixar perfeitamente na página.</p>
              </div>
            </div>

            {/* Predefinições Rápidas de 1 Clique */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApplySinglePageFit}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-slate-700 hover:text-sky-800 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer"
                title="Comprime os espaçamentos para evitar que itens extras quebrem para a página 2"
              >
                <Minimize2 className="w-3 h-3 text-sky-600" />
                <span>Ajustar em 1 Página</span>
              </button>

              <button
                type="button"
                onClick={handleApplyExpandedLayout}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-700 hover:text-emerald-800 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer"
                title="Distribui o espaço harmonicamente quando a proposta tem poucos itens para não ficar vazia"
              >
                <Maximize2 className="w-3 h-3 text-emerald-600" />
                <span>Distribuir pela Folha</span>
              </button>

              <button
                type="button"
                onClick={handleResetDefaults}
                className="inline-flex items-center gap-1 px-2 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 rounded-lg text-xs font-semibold transition cursor-pointer"
                title="Restaurar espaçamentos originais da Infodesk"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restaurar</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Bloco 1: Cabeçalho */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <MoveVertical className="w-3.5 h-3.5 text-sky-600" />
                  Cabeçalho (Logo & Topo)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-500 block mb-1">Topo da Folha:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setHeaderTopOffset(prev => Math.max(-0.5, Number((prev - 0.25).toFixed(2))))}
                      className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-bold cursor-pointer"
                      title="Subir topo"
                    >
                      -
                    </button>
                    <span className="font-mono font-semibold text-slate-800 px-1">{headerTopOffset.toFixed(2)} cm</span>
                    <button
                      type="button"
                      onClick={() => setHeaderTopOffset(prev => Math.min(3.0, Number((prev + 0.25).toFixed(2))))}
                      className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-bold cursor-pointer"
                      title="Descer topo"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 block mb-1">Espaço sob Logo:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setHeaderBottomOffset(prev => Math.max(0.2, Number((prev - 0.2).toFixed(2))))}
                      className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-bold cursor-pointer"
                      title="Diminuir espaço"
                    >
                      -
                    </button>
                    <span className="font-mono font-semibold text-slate-800 px-1">{headerBottomOffset.toFixed(2)} cm</span>
                    <button
                      type="button"
                      onClick={() => setHeaderBottomOffset(prev => Math.min(3.0, Number((prev + 0.2).toFixed(2))))}
                      className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-bold cursor-pointer"
                      title="Aumentar espaço"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Bloco 2: Rodapé */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <MoveVertical className="w-3.5 h-3.5 text-sky-600" />
                  Rodapé (Empresa & Base)
                </span>
                <label className="inline-flex items-center gap-1 cursor-pointer select-none text-[10px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={isFooterStuckToBottom}
                    onChange={(e) => setIsFooterStuckToBottom(e.target.checked)}
                    className="rounded text-sky-600 w-3 h-3"
                  />
                  <span>Fixar na Base</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-500 block mb-1">Espaço sob Rodapé:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setFooterBottomOffset(prev => Math.max(-0.5, Number((prev - 0.2).toFixed(2))))}
                      className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-bold cursor-pointer"
                      title="Descer rodapé"
                    >
                      -
                    </button>
                    <span className="font-mono font-semibold text-slate-800 px-1">{footerBottomOffset.toFixed(2)} cm</span>
                    <button
                      type="button"
                      onClick={() => setFooterBottomOffset(prev => Math.min(3.0, Number((prev + 0.2).toFixed(2))))}
                      className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-bold cursor-pointer"
                      title="Subir rodapé"
                    >
                      +
                    </button>
                  </div>
                </div>

                {!isFooterStuckToBottom && (
                  <div>
                    <span className="text-slate-500 block mb-1">Distância da Assinatura:</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setFooterTopOffset(prev => Math.max(0.2, Number((prev - 0.2).toFixed(2))))}
                        className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-bold cursor-pointer"
                      >
                        -
                      </button>
                      <span className="font-mono font-semibold text-slate-800 px-1">{footerTopOffset.toFixed(2)} cm</span>
                      <button
                        type="button"
                        onClick={() => setFooterTopOffset(prev => Math.min(3.0, Number((prev + 0.2).toFixed(2))))}
                        className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-bold cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bloco 3: Dicas do Modo Edição */}
            <div className="bg-sky-50/60 border border-sky-200 rounded-xl p-3 flex flex-col justify-between">
              <div>
                <span className="font-bold text-sky-900 block mb-1">✏️ Edição Livre na Folha</span>
                <p className="text-[11px] text-sky-800 leading-snug">
                  Com o <strong>Modo Edição</strong> ativo, você pode clicar em qualquer frase ou linha para alterar, teclar <strong>Enter</strong> para pular linhas ou <strong>Backspace</strong> para remover!
                </p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${isEditMode ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className="text-[10px] font-semibold text-slate-600">
                  {isEditMode ? 'Clique e edite direto no documento abaixo' : 'Ative o botão "Editar na Folha" para destravar'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Visual Proposal Page (Identical replica of Infodesk's official document) */}
      <div className="flex justify-start sm:justify-center overflow-x-auto max-w-full pb-8 print:block print:w-full print:m-0 print:p-0">
        <div 
          ref={documentRef}
          className="print-page bg-white text-black w-full shadow-2xl rounded-sm border border-slate-200 flex flex-col justify-between"
          style={{ 
            fontFamily: 'Verdana, Geneva, sans-serif',
            width: '21cm',
            minHeight: '29.7cm',
            maxWidth: '21cm',
            boxSizing: 'border-box',
            paddingTop: '0.75cm',
            paddingRight: '1.32cm',
            paddingBottom: '0.25cm',
            paddingLeft: '2.0cm'
          }}
        >
          {/* Main Top & Center Content */}
          <div 
            className="flex-1 flex flex-col"
            style={{ marginTop: headerTopOffset !== 0 ? `${headerTopOffset}cm` : undefined }}
          >
            {/* Header with Original Infodesk Logo */}
            <div 
              className="text-left"
              style={{ marginBottom: `${headerBottomOffset}cm` }}
            >
              <img 
                src="/infodesk-logo.png" 
                alt="Infodesk" 
                className="object-contain"
                style={{ width: '8.56cm', height: '2.08cm' }}
              />
            </div>

            {renderSectionSpacer('afterHeader', 0)}

            {/* Client Destination Info */}
            <div 
              className={`text-black ${editableClass}`}
              contentEditable={isEditMode}
              suppressContentEditableWarning={true}
              style={{ fontFamily: 'Verdana, Geneva, sans-serif' }}
            >
              <p 
                className="font-bold text-black tracking-normal"
                style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '12pt', lineHeight: '1.5', fontWeight: 'bold' }}
              >
                {formatCompanyPrefix(quote.clientCompany)}
              </p>
              <p 
                className="font-bold text-black tracking-normal"
                style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '12pt', lineHeight: '1.5', fontWeight: 'bold' }}
              >
                {formatContactPerson(quote.contactPerson)}
              </p>
              <p 
                className="text-black font-bold"
                style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '8pt', lineHeight: '1.35', fontWeight: 'bold', marginTop: '4px' }}
              >
                E-mail: <a href={`mailto:${(quote.clientEmail || '').toLowerCase()}`} className="text-[#0000ff] underline font-bold" style={{ fontSize: '8pt', fontWeight: 'bold' }}>{(quote.clientEmail || '').toLowerCase()}</a>
              </p>
              {quote.clientPhone && (
                <p 
                  className="text-black font-bold"
                  style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '8pt', lineHeight: '1.35', fontWeight: 'bold', marginTop: '2px' }}
                >
                  Telefone: <span className="font-bold" style={{ fontSize: '8pt', fontWeight: 'bold' }}>{quote.clientPhone}</span>
                </p>
              )}
            </div>

            {renderSectionSpacer('afterClient', 0.6)}

            {/* Opening Paragraph */}
            <p 
              className={`text-justify text-black ${editableClass}`}
              contentEditable={isEditMode}
              suppressContentEditableWarning={true}
              style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '9pt', textAlign: 'justify', lineHeight: '1.35', textIndent: '1.25cm' }}
            >
              {getResolvedOpeningText(quote.openingText, settings.defaultOpeningText)}
            </p>

            {renderSectionSpacer('afterOpening', 0.6)}

            {/* Product Items Table */}
            <div>
              <table 
                className="w-full text-left border-collapse"
                style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '10pt', maxWidth: '18.52cm' }}
              >
                <thead>
                  <tr className="font-bold text-black">
                    <th className="p-1.5 text-center font-bold whitespace-nowrap" style={{ fontSize: '10pt', fontWeight: 'bold', border: '0.5pt solid #000000', width: '6%' }}>Item</th>
                    <th className="p-1.5 text-center font-bold" style={{ fontSize: '10pt', fontWeight: 'bold', border: '0.5pt solid #000000', width: '46%' }}>Descrição do Produto</th>
                    <th className="p-1.5 text-center font-bold whitespace-nowrap" style={{ fontSize: '10pt', fontWeight: 'bold', border: '0.5pt solid #000000', width: '6%' }}>Qtd.</th>
                    <th className="p-1.5 text-center font-bold whitespace-nowrap" style={{ fontSize: '10pt', fontWeight: 'bold', border: '0.5pt solid #000000', width: '6%' }}>Un.</th>
                    <th className="p-1.5 text-center font-bold whitespace-nowrap" style={{ fontSize: '10pt', fontWeight: 'bold', border: '0.5pt solid #000000', width: '18%' }}>Preço unit.</th>
                    <th className="p-1.5 text-center font-bold whitespace-nowrap" style={{ fontSize: '10pt', fontWeight: 'bold', border: '0.5pt solid #000000', width: '18%' }}>Preço total</th>
                    {isEditMode && <th className="no-print p-1 text-center font-bold text-xs w-8 text-slate-400">Ação</th>}
                  </tr>
                </thead>
                <tbody>
                  {previewItems.filter(it => !it.isOptional).map((item) => {
                    const excDetails = extractDeliveryExceptionDetails(quote.deliveryDays);
                    const isException = excDetails.hasException && excDetails.itemNumbers.includes(item.itemNumber);
                    return (
                    <tr key={item.id} className="group">
                      <td 
                        className={`p-1.5 text-center align-middle ${editableClass}`}
                        contentEditable={isEditMode}
                        suppressContentEditableWarning={true}
                        style={{ fontSize: '10pt', border: '0.5pt solid #000000', verticalAlign: 'middle' }}
                      >
                        {item.itemNumber}
                      </td>
                      <td className="p-1.5 text-left align-middle" style={{ fontSize: '10pt', border: '0.5pt solid #000000', verticalAlign: 'middle' }}>
                        <div className="flex items-start justify-between gap-2">
                          <span 
                            className={`font-medium ${editableClass}`}
                            contentEditable={isEditMode}
                            suppressContentEditableWarning={true}
                          >
                            {item.name}
                          </span>
                          {isException && (
                            <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-300 rounded text-[7.5pt] font-bold shrink-0">
                              Prazo: {excDetails.days} dias úteis
                            </span>
                          )}
                        </div>
                        {item.showImage && item.imageUrl && (
                          <div className="mt-2 mb-1 flex justify-start">
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              style={{
                                maxHeight: '2.71cm',
                                maxWidth: '4cm',
                                width: 'auto',
                                height: 'auto',
                                objectFit: 'contain'
                              }}
                              className="rounded-none bg-transparent"
                            />
                          </div>
                        )}
                      </td>
                      <td 
                        className={`p-1.5 text-center align-middle ${editableClass}`}
                        contentEditable={isEditMode}
                        suppressContentEditableWarning={true}
                        style={{ fontSize: '10pt', border: '0.5pt solid #000000', verticalAlign: 'middle' }}
                      >
                        {item.quantity}
                      </td>
                      <td 
                        className={`p-1.5 text-center align-middle ${editableClass}`}
                        contentEditable={isEditMode}
                        suppressContentEditableWarning={true}
                        style={{ fontSize: '10pt', border: '0.5pt solid #000000', verticalAlign: 'middle' }}
                      >
                        {item.unit || 'Un.'}
                      </td>
                      <td 
                        className={`p-1.5 text-center whitespace-nowrap align-middle ${editableClass}`}
                        contentEditable={isEditMode}
                        suppressContentEditableWarning={true}
                        style={{ fontSize: '10pt', border: '0.5pt solid #000000', verticalAlign: 'middle' }}
                      >
                        R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td 
                        className={`p-1.5 text-center whitespace-nowrap align-middle ${editableClass}`}
                        contentEditable={isEditMode}
                        suppressContentEditableWarning={true}
                        style={{ fontSize: '10pt', border: '0.5pt solid #000000', verticalAlign: 'middle' }}
                      >
                        R$ {item.totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      {isEditMode && (
                        <td className="no-print p-1 text-center align-middle border border-slate-200">
                          <button
                            type="button"
                            onClick={() => handleRemoveTableRow(item.id)}
                            className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded cursor-pointer transition"
                            title="Ocultar/retirar esta linha da tabela"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                  })}
                </tbody>
              </table>

              {/* Botão de Adicionar Linha de Produto na Tabela (no-print) */}
              {isEditMode && (
                <div className="no-print mt-2 flex items-center justify-start gap-2">
                  <button
                    type="button"
                    onClick={handleAddTableRow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5 text-sky-600" />
                    <span>Adicionar Linha na Tabela</span>
                  </button>
                </div>
              )}
            </div>

            {/* Tabela de Itens Opcionais / Upgrades Sugeridos */}
            {(() => {
              const optionalItems = previewItems.filter(it => it.isOptional);
              if (optionalItems.length === 0) return null;
              const optionalTotal = optionalItems.reduce((acc, it) => acc + ((it.unitPrice || 0) * (it.quantity || 1)), 0);

              return (
                <div className="mt-3 mb-2 sq-avoid-break">
                  <div className="mb-1.5 text-left">
                    <span className="font-bold uppercase tracking-wider text-[8pt] bg-slate-100 px-2 py-0.5 border border-slate-300 inline-block text-slate-800">
                      Itens Opcionais / Sugestões de Upgrade (Valores Adicionais):
                    </span>
                  </div>
                  <table 
                    className="w-full text-left border-collapse"
                    style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '9pt', maxWidth: '18.52cm' }}
                  >
                    <thead>
                      <tr className="font-bold text-black bg-slate-50">
                        <th className="p-1 text-center font-bold" style={{ fontSize: '8.5pt', border: '0.5pt solid #000000', width: '6%' }}>Item</th>
                        <th className="p-1 text-center font-bold" style={{ fontSize: '8.5pt', border: '0.5pt solid #000000', width: '46%' }}>Descrição do Item Opcional</th>
                        <th className="p-1 text-center font-bold" style={{ fontSize: '8.5pt', border: '0.5pt solid #000000', width: '6%' }}>Qtd.</th>
                        <th className="p-1 text-center font-bold" style={{ fontSize: '8.5pt', border: '0.5pt solid #000000', width: '6%' }}>Un.</th>
                        <th className="p-1 text-center font-bold" style={{ fontSize: '8.5pt', border: '0.5pt solid #000000', width: '18%' }}>Preço unit.</th>
                        <th className="p-1 text-center font-bold" style={{ fontSize: '8.5pt', border: '0.5pt solid #000000', width: '18%' }}>Preço total</th>
                        {isEditMode && <th className="no-print p-1 text-center font-bold text-xs w-8 text-slate-400">Ação</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {optionalItems.map((item, optIdx) => (
                        <tr key={item.id}>
                          <td 
                            className={`p-1 text-center align-middle ${editableClass}`}
                            contentEditable={isEditMode}
                            suppressContentEditableWarning={true}
                            style={{ fontSize: '8.5pt', border: '0.5pt solid #000000' }}
                          >
                            Op-{optIdx + 1}
                          </td>
                          <td 
                            className={`p-1 text-left align-middle ${editableClass}`}
                            contentEditable={isEditMode}
                            suppressContentEditableWarning={true}
                            style={{ fontSize: '8.5pt', border: '0.5pt solid #000000' }}
                          >
                            <span className="font-medium">{item.name}</span>
                          </td>
                          <td 
                            className={`p-1 text-center align-middle ${editableClass}`}
                            contentEditable={isEditMode}
                            suppressContentEditableWarning={true}
                            style={{ fontSize: '8.5pt', border: '0.5pt solid #000000' }}
                          >
                            {item.quantity}
                          </td>
                          <td 
                            className={`p-1 text-center align-middle ${editableClass}`}
                            contentEditable={isEditMode}
                            suppressContentEditableWarning={true}
                            style={{ fontSize: '8.5pt', border: '0.5pt solid #000000' }}
                          >
                            {item.unit || 'Un.'}
                          </td>
                          <td 
                            className={`p-1 text-center whitespace-nowrap align-middle ${editableClass}`}
                            contentEditable={isEditMode}
                            suppressContentEditableWarning={true}
                            style={{ fontSize: '8.5pt', border: '0.5pt solid #000000' }}
                          >
                            R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td 
                            className={`p-1 text-center whitespace-nowrap align-middle ${editableClass}`}
                            contentEditable={isEditMode}
                            suppressContentEditableWarning={true}
                            style={{ fontSize: '8.5pt', border: '0.5pt solid #000000' }}
                          >
                            R$ {item.totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          {isEditMode && (
                            <td className="no-print p-1 text-center align-middle border border-slate-200">
                              <button
                                type="button"
                                onClick={() => handleRemoveTableRow(item.id)}
                                className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded cursor-pointer transition"
                                title="Ocultar/retirar item opcional"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={5} className="p-1 text-right font-bold" style={{ fontSize: '8.5pt', border: '0.5pt solid #000000' }}>
                          Subtotal Opcionais:
                        </td>
                        <td className="p-1 text-center font-bold whitespace-nowrap" style={{ fontSize: '8.5pt', border: '0.5pt solid #000000' }}>
                          R$ {optionalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        {isEditMode && <td className="no-print"></td>}
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {renderSectionSpacer('afterTable', 0.8)}

            {/* General Conditions */}
            <div 
              className={`text-black sq-avoid-break ${editableClass}`}
              contentEditable={isEditMode}
              suppressContentEditableWarning={true}
              style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '10pt', lineHeight: '1.5' }}
            >
              <p className="font-bold underline mb-2" style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '12pt', fontWeight: 'bold', textDecoration: 'underline' }}>Condições gerais:</p>
              <p style={{ fontSize: '10pt', lineHeight: '1.5' }}>➤&nbsp; Validade da proposta: {formatProposalValidityText(quote.validityDays)}</p>
              <p style={{ fontSize: '10pt', lineHeight: '1.5' }}>➤&nbsp; Condições de pagamento: {quote.paymentTerms}</p>
              <p style={{ fontSize: '10pt', lineHeight: '1.5' }}>➤&nbsp; Prazo de entrega: {quote.deliveryDays}</p>
              <p style={{ fontSize: '10pt', lineHeight: '1.5' }}>➤&nbsp; Garantia: {quote.warrantyTerms}</p>
              {shouldDisplayShippingInProposal(quote) && quote.shippingTerms && (
                <p className="font-bold" style={{ fontSize: '10pt', lineHeight: '1.5' }}>
                  ➤&nbsp; {quote.shippingTerms.toLowerCase().startsWith('frete') ? quote.shippingTerms : `Frete: ${quote.shippingTerms}`}
                </p>
              )}
              {(() => {
                const clean = (quote.observations || quote.notes || '').trim().replace(/^(obs(\.|ervação|ervações)?\s*:\s*)/i, '').trim();
                if (!clean) return null;
                return (
                  <p style={{ fontSize: '10pt', lineHeight: '1.5', whiteSpace: 'pre-line' }}>
                    ➤&nbsp; <strong style={{ fontWeight: 'bold' }}>Obs:</strong> {clean}
                  </p>
                );
              })()}
            </div>

            {renderSectionSpacer('afterConditions', 0.8)}

            {/* Date & Signature */}
            <div 
              className={`flex flex-col items-end text-right ml-auto space-y-7 text-black sq-avoid-break ${editableClass}`}
              contentEditable={isEditMode}
              suppressContentEditableWarning={true}
              style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '10pt' }}
            >
              <div>
                <p style={{ fontSize: '10pt' }}>{quote.city || (settings.cityState ? settings.cityState.split('-')[0].trim() : 'Brasília')}, {quote.date}.</p>
              </div>

              <div className="space-y-0.5 text-right" style={{ fontSize: '10pt' }}>
                <p className="text-black font-normal" style={{ fontSize: '10pt' }}>{settings.representativeName || 'Lucas Porto'}</p>
                <div className="flex items-center justify-end gap-1.5 text-black" style={{ fontSize: '10pt' }}>
                  <img src="/phone-icon.png" alt="Telefone" className="w-3.5 h-3.5 object-contain inline-block" />
                  <span style={{ fontSize: '10pt' }}>{cleanPhone}</span>
                </div>
                <div className="flex items-center justify-end gap-1.5" style={{ fontSize: '10pt' }}>
                  <img src="/whatsapp-icon.png" alt="WhatsApp" className="w-3.5 h-3.5 object-contain inline-block" />
                  <a 
                    href={`https://api.whatsapp.com/send?phone=55${cleanWhatsapp.replace(/\D/g, '')}`} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-[#0000ff] underline"
                    style={{ fontSize: '10pt' }}
                  >
                    {cleanWhatsapp}
                  </a>
                </div>
              </div>
            </div>

            {renderSectionSpacer('afterSignature', 0.4)}
          </div>

          {/* Bottom Divider & Company Details */}
          <div 
            className={`${isFooterStuckToBottom ? 'mt-auto' : ''} pt-2 text-black space-y-0.5 text-center font-bold sq-avoid-break ${editableClass}`}
            contentEditable={isEditMode}
            suppressContentEditableWarning={true}
            style={{ 
              marginTop: isFooterStuckToBottom ? undefined : `${footerTopOffset}cm`,
              marginBottom: footerBottomOffset !== 0 ? `${footerBottomOffset}cm` : undefined,
              borderTop: '0.5pt solid #000000', 
              fontFamily: 'Verdana, Geneva, sans-serif', 
              fontSize: '10pt', 
              fontWeight: 'bold' 
            }}
          >
            <p className="font-bold" style={{ fontSize: '10pt', fontWeight: 'bold' }}>{settings.companyName || 'Lucas Porto da Fonseca-ME'}</p>
            <p className="font-bold" style={{ fontSize: '10pt', fontWeight: 'bold' }}>{settings.address || 'CLSW 304 Bloco A Sala 108 – Sudoeste'} – {settings.cityState || 'Brasília - DF'}</p>
            <p className="flex items-center justify-center gap-12 font-bold" style={{ fontSize: '10pt', fontWeight: 'bold' }}>
              <span style={{ fontSize: '10pt', fontWeight: 'bold' }}>CNPJ: {settings.cnpj || '15.266.716/0001-02'}</span>
              <span style={{ fontSize: '10pt', fontWeight: 'bold' }}>I.E.: {settings.stateRegistration || '07.602.330/001-92'}</span>
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};
