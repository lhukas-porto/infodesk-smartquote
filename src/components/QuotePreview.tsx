import React, { useRef, useState } from 'react';
import { 
  Printer, 
  Send, 
  ArrowLeft, 
  Copy, 
  Check,
  Download,
  FileSpreadsheet,
  SplitSquareVertical
} from 'lucide-react';
import { CompanySettings, Quote } from '../types';
import { formatCompanyPrefix, formatContactPerson, extractDeliveryExceptionDetails } from '../utils/aiEmailParser';
import { exportCostSheetToExcel } from '../utils/excelExport';
import { exportQuoteToWord } from '../utils/wordExport';

interface QuotePreviewProps {
  quote: Quote;
  settings: CompanySettings;
  onBackToEdit: () => void;
  onSendEmail: () => void;
}

export const QuotePreview: React.FC<QuotePreviewProps> = ({
  quote,
  settings,
  onBackToEdit,
  onSendEmail
}) => {
  const documentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloadingDoc, setDownloadingDoc] = useState(false);
  const [forcePageBreak, setForcePageBreak] = useState(() => {
    // Se a proposta tiver 6 ou mais itens, ativa por padrão para garantir formatação executiva perfeita
    return (quote.items || []).length >= 6;
  });

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
      await exportQuoteToWord(quote, settings);
    } catch (err) {
      console.error('Erro ao gerar proposta em Word:', err);
      alert('Não foi possível gerar o arquivo Word (.docx). Por favor, tente novamente.');
    } finally {
      setDownloadingDoc(false);
    }
  };

  const handleCopyToClipboard = () => {
    const text = `PROPOSTA COMERCIAL — INFODESK\n\n` +
      `Ao ${quote.clientCompany}\n` +
      `A/C ${quote.contactPerson}\n` +
      `E-mail: ${quote.clientEmail}\n\n` +
      `${getResolvedOpeningText(quote.openingText, settings.defaultOpeningText)}\n\n` +
      quote.items.map(i => `${i.itemNumber}. ${i.name} | Qtd: ${i.quantity} ${i.unit} | Unit: R$ ${i.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Total: R$ ${i.totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join('\n') +
      `\n\nTotal Geral: R$ ${quote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n` +
      `Condições Gerais:\n` +
      `- Validade: ${quote.validityDays}\n` +
      `- Pagamento: ${quote.paymentTerms}\n` +
      `- Prazo de Entrega: ${quote.deliveryDays}\n` +
      `- Garantia: ${quote.warrantyTerms}\n` +
      (quote.showShippingInProposal !== false && quote.shippingTerms ? `- ${quote.shippingTerms.toLowerCase().startsWith('frete') ? quote.shippingTerms : `Frete: ${quote.shippingTerms}`}\n` : '') +
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

  return (
    <div className="space-y-6">
      
      {/* Top Action Toolbar (Hidden during Print) */}
      <div className="no-print bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <button
          onClick={onBackToEdit}
          className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-semibold transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar à Cotação</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopyToClipboard}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-medium transition"
            title="Copiar texto puro para WhatsApp"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado!' : 'Copiar Texto'}</span>
          </button>

          <button
            onClick={handleDownloadDoc}
            disabled={downloadingDoc}
            className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 bg-blue-50/50 hover:bg-blue-100/60 text-blue-700 rounded-xl text-xs font-semibold transition"
            title="Baixar proposta comercial oficial em Microsoft Word (.docx)"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>{downloadingDoc ? 'Gerando Word...' : 'Exportar Word (.docx)'}</span>
          </button>

          <button
            onClick={async () => {
              try {
                await exportCostSheetToExcel(quote);
              } catch (err) {
                console.error('Erro ao exportar planilha Excel:', err);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition shadow-2xs active:scale-95"
            title="Baixar planilha de custos e precificação detalhada no Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Exportar Excel (.xlsx)</span>
          </button>

          {quote.items && quote.items.length >= 4 && (
            <button
              type="button"
              onClick={() => setForcePageBreak(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-semibold transition cursor-pointer active:scale-95 ${
                forcePageBreak 
                  ? 'border-sky-500 bg-sky-50 text-sky-800' 
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
              title="Alternar quebra de página antes das condições gerais para orçamentos com múltiplos produtos"
            >
              <SplitSquareVertical className={`w-3.5 h-3.5 ${forcePageBreak ? 'text-sky-600' : 'text-slate-500'}`} />
              <span>{forcePageBreak ? 'Pág. 2 Ativa' : 'Quebrar Condições'}</span>
            </button>
          )}

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-medium transition"
            title="Imprimir ou Salvar em PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir / PDF</span>
          </button>

          <button
            onClick={onSendEmail}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-blue-500/20 transition"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Enviar ao Cliente</span>
          </button>
        </div>
      </div>

      {/* Visual Proposal Page (Identical replica of Infodesk's official document) */}
      <div className="flex justify-center">
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
          <div className="flex-1 flex flex-col">
            {/* Header with Original Infodesk Logo */}
            <div className="mb-6 text-left">
              <img 
                src="/infodesk-logo.png" 
                alt="Infodesk" 
                className="object-contain"
                style={{ width: '8.56cm', height: '2.08cm' }}
              />
            </div>

            {/* Client Destination Info */}
            <div 
              className="text-black mb-5"
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

            {/* Opening Paragraph */}
            <p 
              className="text-justify text-black mb-5"
              style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '9pt', textAlign: 'justify', lineHeight: '1.35' }}
            >
              {getResolvedOpeningText(quote.openingText, settings.defaultOpeningText)}
            </p>

            {/* Product Items Table */}
            <div className="mb-5">
              <table 
                className="w-full text-left border-collapse"
                style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '10pt', maxWidth: '18.52cm' }}
              >
                <thead>
                  <tr className="font-bold text-black">
                    <th className="p-1.5 text-center w-12 font-bold" style={{ fontSize: '10pt', fontWeight: 'bold', border: '0.5pt solid #000000' }}>Item</th>
                    <th className="p-1.5 text-center font-bold" style={{ fontSize: '10pt', fontWeight: 'bold', border: '0.5pt solid #000000' }}>Descrição do Produto</th>
                    <th className="p-1.5 text-center w-12 font-bold" style={{ fontSize: '10pt', fontWeight: 'bold', border: '0.5pt solid #000000' }}>Qtd.</th>
                    <th className="p-1.5 text-center w-12 font-bold" style={{ fontSize: '10pt', fontWeight: 'bold', border: '0.5pt solid #000000' }}>Un.</th>
                    <th className="p-1.5 text-center w-28 font-bold" style={{ fontSize: '10pt', fontWeight: 'bold', border: '0.5pt solid #000000' }}>Preço unit.</th>
                    <th className="p-1.5 text-center w-28 font-bold" style={{ fontSize: '10pt', fontWeight: 'bold', border: '0.5pt solid #000000' }}>Preço total</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.items.map((item) => {
                    const excDetails = extractDeliveryExceptionDetails(quote.deliveryDays);
                    const isException = excDetails.hasException && excDetails.itemNumbers.includes(item.itemNumber);
                    return (
                    <tr key={item.id}>
                      <td className="p-1.5 text-center" style={{ fontSize: '10pt', border: '0.5pt solid #000000' }}>
                        {item.itemNumber}
                      </td>
                      <td className="p-1.5 text-left" style={{ fontSize: '10pt', border: '0.5pt solid #000000' }}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{item.name}</span>
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
                      <td className="p-1.5 text-center" style={{ fontSize: '10pt', border: '0.5pt solid #000000' }}>
                        {item.quantity}
                      </td>
                      <td className="p-1.5 text-center" style={{ fontSize: '10pt', border: '0.5pt solid #000000' }}>
                        {item.unit || 'Un.'}
                      </td>
                      <td className="p-1.5 text-center whitespace-nowrap" style={{ fontSize: '10pt', border: '0.5pt solid #000000' }}>
                        R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-1.5 text-center whitespace-nowrap" style={{ fontSize: '10pt', border: '0.5pt solid #000000' }}>
                        R$ {item.totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>

            {/* General Conditions */}
            <div 
              className={`mb-8 text-black sq-avoid-break ${forcePageBreak ? 'sq-page-break-before pt-6' : ''}`}
              style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '10pt', lineHeight: '1.5' }}
            >
              <p className="font-bold underline mb-2" style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '12pt', fontWeight: 'bold', textDecoration: 'underline' }}>Condições gerais:</p>
              <p style={{ fontSize: '10pt', lineHeight: '1.5' }}>➤&nbsp; Validade da proposta: {quote.validityDays}</p>
              <p style={{ fontSize: '10pt', lineHeight: '1.5' }}>➤&nbsp; Condições de pagamento: {quote.paymentTerms}</p>
              <p style={{ fontSize: '10pt', lineHeight: '1.5' }}>➤&nbsp; Prazo de entrega: {quote.deliveryDays}</p>
              <p style={{ fontSize: '10pt', lineHeight: '1.5' }}>➤&nbsp; Garantia: {quote.warrantyTerms}</p>
              {quote.showShippingInProposal !== false && quote.shippingTerms && (
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

            {/* Date & Signature */}
            <div 
              className="flex flex-col items-end text-right ml-auto space-y-7 mb-8 text-black sq-avoid-break"
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
          </div>

          {/* Bottom Divider & Company Details */}
          <div 
            className="mt-auto pt-2 text-black space-y-0.5 text-center font-bold sq-avoid-break"
            style={{ borderTop: '0.5pt solid #000000', fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '10pt', fontWeight: 'bold' }}
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
