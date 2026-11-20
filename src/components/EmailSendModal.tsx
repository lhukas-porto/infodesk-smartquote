import React, { useState, useMemo, useRef } from 'react';
import { 
  Send, 
  Mail, 
  Paperclip, 
  Check,
  FileText,
  ExternalLink,
  X,
  ShieldCheck,
  Users,
  AtSign,
  Sparkles
} from 'lucide-react';
import { CompanySettings, Quote } from '../types';
import { generateProposalEmailHtml, generatePdfOnlyEmailHtml, formatProposalValidityText } from '../utils/aiEmailParser';
import { resolveClientLogoBase64, getSynchronousClientLogoPreview, generateInitialsAvatarPngDataUrl } from '../utils/clientLogoEmailHelper';

function extractEmailString(val: any): string {
  if (!val) return '';
  if (Array.isArray(val)) {
    return val.map(x => String(x || '').trim()).filter(Boolean).join(', ');
  }
  if (typeof val === 'string') {
    return val.trim();
  }
  return '';
}

export type EmailSendMode = 'body_only' | 'body_and_pdf' | 'pdf_only';

interface EmailSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: Quote;
  settings: CompanySettings;
  onConfirmSend: (quote: Quote, options?: {
    attachments?: Array<{
      filename: string;
      mimeType: string;
      contentBase64: string;
    }>;
    customBodyHtml?: string;
    customBodyText?: string;
  }) => Promise<void> | void;
  connectedUserEmail?: string | null;
  onSwitchAccount?: () => Promise<void> | void;
  initialClientLogoUrl?: string;
}

export const EmailSendModal: React.FC<EmailSendModalProps> = ({
  isOpen,
  onClose,
  quote,
  settings,
  onConfirmSend,
  connectedUserEmail,
  onSwitchAccount,
  initialClientLogoUrl
}) => {
  const [isSending, setIsSending] = useState(false);
  const [isSentSuccess, setIsSentSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendMode, setSendMode] = useState<EmailSendMode>('body_only'); // Padrão: proposta no corpo do e-mail
  const toInputRef = useRef<HTMLInputElement>(null);

  const [clientLogoDataUrl, setClientLogoDataUrl] = useState<string | null>(() => {
    return initialClientLogoUrl || quote.clientLogoUrl || getSynchronousClientLogoPreview(quote.clientCompany, quote.clientEmail);
  });

  React.useEffect(() => {
    let isMounted = true;
    if (isOpen) {
      if (initialClientLogoUrl) {
        setClientLogoDataUrl(initialClientLogoUrl);
        if (!initialClientLogoUrl.startsWith('data:')) {
          resolveClientLogoBase64({
            name: quote.clientCompany,
            logoUrl: initialClientLogoUrl,
            contacts: quote.clientEmail ? [{ email: quote.clientEmail }] : []
          }).then(dataUrl => {
            if (isMounted && dataUrl && dataUrl.startsWith('data:')) {
              setClientLogoDataUrl(dataUrl);
            }
          }).catch(() => {});
        }
      } else if (quote.clientCompany) {
        const immediate = quote.clientLogoUrl || getSynchronousClientLogoPreview(quote.clientCompany, quote.clientEmail);
        if (immediate) {
          setClientLogoDataUrl(immediate);
        }

        resolveClientLogoBase64({
          name: quote.clientCompany,
          logoUrl: quote.clientLogoUrl,
          contacts: quote.clientEmail ? [{ email: quote.clientEmail }] : []
        }).then(dataUrl => {
          if (isMounted && dataUrl && dataUrl.startsWith('data:')) {
            setClientLogoDataUrl(dataUrl);
          } else if (isMounted && quote.clientCompany) {
            const avatar = generateInitialsAvatarPngDataUrl(quote.clientCompany);
            if (avatar) setClientLogoDataUrl(avatar);
          }
        }).catch(() => {});
      }
    }
    return () => { isMounted = false; };
  }, [isOpen, initialClientLogoUrl, quote.clientCompany, quote.clientEmail, quote.clientLogoUrl]);

  const defaultSubject = (quote.subject && quote.subject !== 'Orçamento diversos' && quote.subject !== 'Fornecimento de produtos para informática' && quote.subject !== 'Fornecimento de Materiais e Equipamentos')
    ? quote.subject
    : 'Fornecimento de Materiais';

  const defaultPdfOnlyMessage = useMemo(() => {
    const contact = quote.contactPerson ? quote.contactPerson.replace(/^a\/c\s*:?\s*/i, '').trim() : 'Prezado(a)';
    const company = quote.clientCompany ? quote.clientCompany.replace(/^(ao|à|a|para)\s+/i, '').trim() : 'sua empresa';
    return `Prezada(o) ${contact},\n\nEm atenção à solicitação de Vossa Senhoria, encaminhamos em anexo a nossa Proposta Comercial em PDF referente ao fornecimento dos materiais e equipamentos para ${company}.\n\nOs detalhes completos dos itens, imagens, especificações técnicas e condições comerciais constam detalhados no documento PDF anexo.\n\nPermanecemos à inteira disposição para quaisquer esclarecimentos.`;
  }, [quote.contactPerson, quote.clientCompany]);

  const [pdfOnlyMessage, setPdfOnlyMessage] = useState(defaultPdfOnlyMessage);

  const getResolvedInitialTo = (q: Quote): string => {
    const fromRecipient = extractEmailString(q.recipientEmails);
    if (fromRecipient) return fromRecipient;
    const fromClient = extractEmailString(q.clientEmail);
    if (fromClient) return fromClient;
    return '';
  };

  const initialTo = getResolvedInitialTo(quote);
  const initialCc = extractEmailString(quote.ccEmails);
  const [toEmails, setToEmails] = useState(initialTo);
  const [ccEmails, setCcEmails] = useState(initialCc);
  const [showCc, setShowCc] = useState(Boolean(initialCc));
  const [subject, setSubject] = useState(defaultSubject);

  const handleCancel = () => {
    setIsSending(false);
    setIsSentSuccess(false);
    setSendError(null);
    onClose();
  };

  // Sincronizar quando a proposta mudar ou o modal abrir
  React.useEffect(() => {
    if (isOpen) {
      setIsSending(false);
      setIsSentSuccess(false);
      setSendError(null);
      setSendMode('body_only'); // Padrão: orçamento no corpo do e-mail
      const resolvedTo = getResolvedInitialTo(quote);
      const resolvedCc = extractEmailString(quote.ccEmails);
      setToEmails(resolvedTo);
      setCcEmails(resolvedCc);
      if (resolvedCc) setShowCc(true);

      const computedSubject = (quote.subject && quote.subject !== 'Orçamento diversos' && quote.subject !== 'Fornecimento de produtos para informática' && quote.subject !== 'Fornecimento de Materiais e Equipamentos')
        ? quote.subject
        : 'Fornecimento de Materiais';
      setSubject(computedSubject);
      setPdfOnlyMessage(defaultPdfOnlyMessage);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quote.id, quote.clientEmail, quote.recipientEmails, quote.ccEmails, quote.subject, quote.code, isOpen, defaultPdfOnlyMessage]);

  if (!isOpen) return null;

  const handleSend = async () => {
    try {
      const cleanTo = extractEmailString(toEmails);
      if (!cleanTo) {
        setSendError('Por favor, informe ao menos um e-mail de destinatário no campo "Destinatários (Para:) *".');
        toInputRef.current?.focus();
        return;
      }

      setSendError(null);
      setIsSending(true);

      const finalSubject = (subject || '').trim() || 'Fornecimento de Materiais';
      const cleanCc = extractEmailString(ccEmails);

      let attachments: Array<{ filename: string; mimeType: string; contentBase64: string }> | undefined = undefined;
      let customBodyHtml: string | undefined = undefined;
      let customBodyText: string | undefined = undefined;

      // 1. Gera anexo PDF se o modo exigir (body_and_pdf ou pdf_only)
      if (sendMode === 'body_and_pdf' || sendMode === 'pdf_only') {
        try {
          const { generateQuotePdfBase64 } = await import('../utils/pdfExport');
          const pdf = await generateQuotePdfBase64(quote, settings, clientLogoDataUrl || undefined);
          attachments = [{
            filename: pdf.filename,
            mimeType: 'application/pdf',
            contentBase64: pdf.base64
          }];
        } catch (pdfErr) {
          console.error('Erro ao gerar anexo PDF da proposta:', pdfErr);
          throw new Error('Não foi possível gerar o arquivo PDF da proposta para anexar. Tente novamente.');
        }
      }

      // 2. Se for o modo "Apenas PDF Anexo", monta a mensagem formal e o HTML enxuto indicando o anexo
      if (sendMode === 'pdf_only') {
        customBodyHtml = generatePdfOnlyEmailHtml(quote, settings, {
          forEmailSend: true,
          clientLogoUrl: clientLogoDataUrl || undefined,
          customMessage: pdfOnlyMessage
        });
        const formattedTotal = Number(quote.totalAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const repName = settings.representativeName || 'Lucas Porto';
        const trade = settings.tradeName || 'Infodesk';
        const cleanPhone = (settings.phone || '61 3033-5373').replace(/[()]/g, '').trim();
        const cleanWhatsapp = (settings.whatsapp || '61 9 9627-2630').replace(/[()]/g, '').trim();

        customBodyText = `${pdfOnlyMessage}\n\n` +
          `• Número da Proposta: ${quote.code || 'Infodesk'}\n` +
          `• Valor Total: R$ ${formattedTotal}\n` +
          `• Condições de Pagamento: ${quote.paymentTerms || 'Faturado.'}\n` +
          `• Prazo de Entrega: ${quote.deliveryDays || 'Pronta Entrega'}\n` +
          `• Validade da Proposta: ${formatProposalValidityText(quote.validityDays)}\n` +
          `• Garantia: ${quote.warrantyTerms || '06 meses'}\n\n` +
          `Permanecemos à inteira disposição para quaisquer esclarecimentos.\n\n` +
          `Atenciosamente,\n` +
          `${repName}\n` +
          `${trade} — Informática & Tecnologia\n` +
          `Telefone: ${cleanPhone} | WhatsApp: ${cleanWhatsapp}\n` +
          `${settings.address || 'CLSW 304 Bloco A Sala 108 – Sudoeste'} – ${settings.cityState || 'Brasília - DF'}`;
      }

      await onConfirmSend({
        ...quote,
        clientLogoUrl: clientLogoDataUrl || quote.clientLogoUrl || undefined,
        clientEmail: cleanTo.split(/[,;]/)[0]?.trim() || extractEmailString(quote.clientEmail),
        recipientEmails: cleanTo,
        ccEmails: cleanCc,
        subject: finalSubject,
        status: 'sent',
        sentAt: new Date().toISOString()
      }, { 
        attachments,
        customBodyHtml,
        customBodyText
      });

      setIsSending(false);
      setIsSentSuccess(true);
      setTimeout(() => {
        setIsSentSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Erro ao disparar e-mail:', err);
      setIsSending(false);
      setIsSentSuccess(false);
      setSendError(err?.message || 'Ocorreu um erro ao enviar o e-mail via Google Workspace.');
    }
  };

  const handleMailtoFallback = async () => {
    try {
      const cleanTo = extractEmailString(toEmails);
      const repName = settings.representativeName || 'Lucas Porto';
      const trade = settings.tradeName || 'Infodesk';
      const phone = (settings.phone || '61 3033-5373').replace(/[()]/g, '').trim();
      const wa = (settings.whatsapp || '61 9 9627-2630').replace(/[()]/g, '').trim();
      const formattedTotal = Number(quote.totalAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const finalSubject = (subject || '').trim() || `Proposta Comercial ${quote.code} — Infodesk`;

      const executiveSummary = 
        `Prezada(o) ${quote.contactPerson || 'Cliente'},\n\n` +
        `Em atenção à solicitação de Vossa Senhoria, temos a grata satisfação de encaminhar a proposta comercial ${quote.code} para ${quote.clientCompany}.\n\n` +
        `• Valor Total: R$ ${formattedTotal}\n` +
        `• Condições de Pagamento: ${quote.paymentTerms || 'Faturado.'}\n` +
        `• Prazo de Entrega: ${quote.deliveryDays || 'Pronta Entrega'}\n` +
        `• Validade da Proposta: ${formatProposalValidityText(quote.validityDays)}\n` +
        `• Garantia: ${quote.warrantyTerms || '06 meses'}\n\n` +
        `A proposta detalhada em alta resolução com a relação completa de todos os ${quote.items?.length || 0} itens, fotos e especificações técnicas segue em anexo em formato PDF (arquivo baixado automaticamente).\n\n` +
        `Permanecemos à inteira disposição para quaisquer esclarecimentos.\n\n` +
        `Atenciosamente,\n` +
        `${repName}\n` +
        `${trade} — Informática & Tecnologia\n` +
        `Telefone: ${phone} | WhatsApp: ${wa}\n` +
        `${settings.address || 'CLSW 304 Bloco A Sala 108 – Sudoeste'} – ${settings.cityState || 'Brasília - DF'}`;

      // Baixa o PDF oficial automaticamente
      try {
        const { downloadQuotePdf } = await import('../utils/pdfExport');
        await downloadQuotePdf(quote, settings);
      } catch (pdfErr) {
        console.warn('Erro ao disparar download do PDF para anexo mailto:', pdfErr);
      }

      const mailtoUrl = `mailto:${encodeURIComponent(cleanTo)}?subject=${encodeURIComponent(finalSubject)}&body=${encodeURIComponent(executiveSummary)}`;
      window.open(mailtoUrl, '_self');
    } catch (err: any) {
      console.warn('Falha no mailto fallback:', err);
    }
  };

  const repFirst = (settings.representativeName || '').trim().split(/\s+/)[0] || 'Lucas';
  const trade = (settings.tradeName || 'Infodesk').trim();
  const senderDisplayName = `${repFirst} - ${trade}`;
  const senderEmail = (connectedUserEmail || 'lucas@infodesk.net.br').toLowerCase();

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl overflow-hidden shadow-xl animate-scaleIn">
        
        {/* Cabeçalho do Modal */}
        <div className="px-6 py-4 border-b border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-sky-50/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-700 text-white rounded-xl shadow-xs shrink-0 flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Disparar Proposta Comercial por E-mail
                </h2>
                <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-bold font-mono uppercase tracking-wider rounded-lg">
                  {quote.code}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Envio autenticado pelo Google Workspace com cópia automática em "Itens Enviados"
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancel}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          
          {sendError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex flex-col gap-2 animate-fadeIn">
              <div className="flex items-start gap-2">
                <span className="font-bold text-rose-800">⚠️ Falha no envio:</span>
                <span className="flex-1 font-medium">{sendError}</span>
              </div>
              {onSwitchAccount && (
                <div className="flex items-center gap-2 pt-1 border-t border-rose-200/60 text-[11px]">
                  <span>Escolheu a conta errada ou token expirou?</span>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsSending(false);
                      setSendError(null);
                      await onSwitchAccount();
                    }}
                    className="font-bold text-sky-700 hover:text-sky-900 underline cursor-pointer"
                  >
                    Clique aqui para trocar de conta Google
                  </button>
                </div>
              )}
            </div>
          )}
          
          {/* Destinatários e Remetente — Perfeitamente Alinhados */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <div className="h-6 flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-sky-600" />
                  <span>Destinatários (Para:)</span>
                </label>
                {!showCc && (
                  <button
                    type="button"
                    onClick={() => setShowCc(true)}
                    className="text-[11px] text-sky-600 hover:text-sky-800 font-semibold cursor-pointer hover:underline flex items-center gap-0.5"
                  >
                    <span>+ Adicionar Cópia (Cc)</span>
                  </button>
                )}
              </div>
              <input
                ref={toInputRef}
                type="text"
                value={toEmails}
                onChange={(e) => {
                  setToEmails(e.target.value);
                  if (sendError) setSendError(null);
                }}
                className={`w-full h-10 px-3.5 bg-white border ${
                  sendError && !extractEmailString(toEmails)
                    ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/20'
                    : 'border-slate-300 hover:border-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100'
                } rounded-xl text-xs sm:text-sm text-slate-900 font-medium focus:outline-none transition shadow-2xs`}
              />
              <div className="h-5 flex items-center text-[10.5px] text-slate-400 mt-1">
                <span>Separe múltiplos e-mails por vírgula ou ponto e vírgula</span>
              </div>
            </div>

            <div>
              <div className="h-6 flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Remetente Oficial</span>
                </label>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold rounded-md flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Autenticado</span>
                </span>
              </div>
              <input
                type="text"
                value={`${senderDisplayName} <${senderEmail}>`}
                readOnly
                className="w-full h-10 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700 font-medium font-mono focus:outline-none select-all"
              />
              <div className="h-5 flex items-center text-[10.5px] text-slate-400 mt-1">
                <span>Disparo verificado com cópia salva em "Itens Enviados"</span>
              </div>
            </div>
          </div>

          {showCc && (
            <div className="p-3 bg-sky-50/50 rounded-2xl border border-sky-100 space-y-1.5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <AtSign className="w-3.5 h-3.5 text-sky-600" />
                  <span>Com Cópia (Cc):</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setCcEmails('');
                    setShowCc(false);
                  }}
                  className="text-[11px] text-slate-400 hover:text-rose-600 font-semibold cursor-pointer transition flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  <span>Remover Cópia</span>
                </button>
              </div>
              <input
                type="text"
                value={ccEmails}
                onChange={(e) => setCcEmails(e.target.value)}
                className="w-full h-9 px-3.5 bg-white border border-sky-200 hover:border-sky-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs text-slate-900 font-medium focus:outline-none transition"
              />
            </div>
          )}

          {/* Assunto */}
          <div>
            <div className="h-6 flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-sky-600" />
                <span>Assunto do E-mail</span>
              </label>
              <span className="text-[10.5px] text-slate-400">
                Título oficial que o cliente verá na caixa de entrada
              </span>
            </div>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full h-10 px-3.5 bg-white border border-slate-300 hover:border-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm text-slate-900 font-semibold tracking-tight focus:outline-none transition shadow-2xs"
            />
          </div>

          {/* 3 Opções de Formato de Envio */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                <span>Como deseja enviar esta proposta?</span>
              </label>
              <span className="text-[10.5px] text-slate-400">
                Escolha o formato ideal para este cliente
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              
              {/* Opção 1: No corpo do e-mail (Padrão) */}
              <button
                type="button"
                onClick={() => setSendMode('body_only')}
                className={`p-3.5 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between gap-3 cursor-pointer ${
                  sendMode === 'body_only'
                    ? 'bg-sky-50/80 border-sky-500 ring-2 ring-sky-200 shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-xl transition ${
                    sendMode === 'body_only' ? 'bg-sky-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <Mail className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    sendMode === 'body_only' ? 'bg-sky-200 text-sky-900' : 'bg-slate-100 text-slate-500'
                  }`}>
                    Padrão
                  </span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 leading-tight">No corpo do e-mail</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">Proposta e tabela completas no corpo, sem anexo</p>
                </div>
              </button>

              {/* Opção 2: Corpo + PDF anexo */}
              <button
                type="button"
                onClick={() => setSendMode('body_and_pdf')}
                className={`p-3.5 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between gap-3 cursor-pointer ${
                  sendMode === 'body_and_pdf'
                    ? 'bg-sky-50/80 border-sky-500 ring-2 ring-sky-200 shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-xl transition ${
                    sendMode === 'body_and_pdf' ? 'bg-sky-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <Paperclip className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    sendMode === 'body_and_pdf' ? 'bg-sky-200 text-sky-900' : 'bg-slate-100 text-slate-500'
                  }`}>
                    Corpo + PDF
                  </span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 leading-tight">Corpo + PDF anexo</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">Proposta no e-mail e documento oficial em PDF anexo</p>
                </div>
              </button>

              {/* Opção 3: Apenas PDF anexo */}
              <button
                type="button"
                onClick={() => setSendMode('pdf_only')}
                className={`p-3.5 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between gap-3 cursor-pointer ${
                  sendMode === 'pdf_only'
                    ? 'bg-sky-50/80 border-sky-500 ring-2 ring-sky-200 shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-xl transition ${
                    sendMode === 'pdf_only' ? 'bg-sky-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <FileText className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    sendMode === 'pdf_only' ? 'bg-sky-200 text-sky-900' : 'bg-slate-100 text-slate-500'
                  }`}>
                    Só PDF
                  </span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 leading-tight">Apenas PDF anexo</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">Mensagem formal no corpo e proposta em PDF</p>
                </div>
              </button>

            </div>
          </div>

          {/* Área de Contexto Dinâmica baseada na escolha */}
          {sendMode === 'pdf_only' ? (
            <div className="space-y-2.5 p-3.5 bg-sky-50/60 border border-sky-200 rounded-2xl animate-fadeIn">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-sky-950 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-sky-600" />
                  <span>Mensagem formal que acompanhará o PDF em anexo:</span>
                </label>
                <span className="text-[10px] text-sky-700 font-semibold bg-sky-100 px-2 py-0.5 rounded-full">
                  Carta de Apresentação Editável
                </span>
              </div>
              <textarea
                value={pdfOnlyMessage}
                onChange={(e) => setPdfOnlyMessage(e.target.value)}
                rows={4}
                className="w-full bg-white border border-sky-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl p-3 text-xs text-slate-800 font-medium leading-relaxed resize-none focus:outline-none transition shadow-2xs"
              />
              <div className="p-2.5 bg-white border border-sky-100 rounded-xl text-[11px] text-slate-600 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-sky-800 shrink-0">📎 Anexo Confirmado:</span>
                  <span className="truncate"><strong>Proposta-Comercial-{(quote.code || 'Infodesk').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf</strong></span>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shrink-0">
                  Alta Resolução
                </span>
              </div>
            </div>
          ) : sendMode === 'body_and_pdf' ? (
            <div className="p-3.5 bg-sky-50/70 border border-sky-200 rounded-2xl flex items-center justify-between gap-3 text-sky-900 animate-fadeIn">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-sky-600 text-white rounded-xl shadow-2xs shrink-0">
                  <Paperclip className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-sky-950 flex items-center gap-2">
                    <span>Formato Duplo Selecionado</span>
                    <span className="px-1.5 py-0.2 bg-sky-200/90 text-sky-900 text-[10px] font-bold rounded font-mono">PDF + HTML</span>
                  </p>
                  <p className="text-[11px] text-sky-700 truncate">
                    A proposta será exibida no corpo do e-mail E o arquivo <strong>Proposta-Comercial-{(quote.code || 'Infodesk').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf</strong> será anexado.
                  </p>
                </div>
              </div>
              <span className="text-[10.5px] font-bold text-sky-800 bg-sky-100 px-2.5 py-1 rounded-lg border border-sky-200 shrink-0 hidden sm:inline-flex items-center gap-1">
                📎 Anexo Automático
              </span>
            </div>
          ) : (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 text-slate-700 animate-fadeIn">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-slate-200/80 rounded-xl text-slate-600 shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <span>Envio Ágil no Corpo do E-mail</span>
                    <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 text-[10px] font-bold rounded font-mono">{quote.code}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {quote.clientCompany ? `${quote.clientCompany} • ` : ''}{quote.items?.length || 0} produto(s) formatado(s) com fotos e tabela oficial de preços.
                  </p>
                </div>
              </div>
              <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 shrink-0 hidden sm:inline-flex items-center gap-1">
                <Check className="w-3 h-3" /> Abertura Instantânea
              </span>
            </div>
          )}

        </div>

        {/* Rodapé do Modal */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>
              Conta conectada: <strong className="font-mono text-slate-800">{connectedUserEmail || settings.googleAccountEmail || 'Google Workspace'}</strong>
            </span>
            {onSwitchAccount && (
              <button
                type="button"
                onClick={async () => {
                  setIsSending(false);
                  setSendError(null);
                  await onSwitchAccount();
                }}
                className="ml-1 text-[11px] text-sky-600 hover:text-sky-800 hover:underline font-semibold cursor-pointer"
                title="Conectar com outra conta Google"
              >
                (Trocar Conta)
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {sendError && (
              <span className="text-[11px] text-rose-600 font-semibold truncate max-w-[220px] sm:max-w-xs animate-fadeIn" title={sendError}>
                ⚠️ {sendError}
              </span>
            )}

            <button
              type="button"
              onClick={handleMailtoFallback}
              className="h-10 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-2xs"
              title="Abrir no cliente padrão do computador (Outlook/Thunderbird) com download automático do PDF"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span>Abrir no Outlook</span>
            </button>

            <button
              type="button"
              onClick={handleCancel}
              className="h-10 px-4 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSend}
              disabled={isSending || isSentSuccess}
              className={`h-10 px-5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer active:scale-95 ${
                isSentSuccess
                  ? 'bg-emerald-600 text-white'
                  : isSending
                  ? 'bg-sky-500 text-white opacity-90 cursor-wait'
                  : 'bg-sky-600 hover:bg-sky-700 text-white'
              }`}
            >
              {isSentSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>E-mail Enviado com Sucesso!</span>
                </>
              ) : isSending ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  <span>{sendMode === 'body_only' ? 'Enviando via Workspace...' : 'Gerando PDF & Enviando...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Confirmar & Enviar Agora</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
