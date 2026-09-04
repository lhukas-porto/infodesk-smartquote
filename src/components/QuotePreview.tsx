import React, { useRef, useState } from 'react';
import { 
  Printer, 
  Send, 
  ArrowLeft, 
  Copy, 
  Check,
  Download,
  FileSpreadsheet
} from 'lucide-react';
import { CompanySettings, Quote } from '../types';
import { formatCompanyPrefix, formatContactPerson, extractDeliveryExceptionDetails } from '../utils/aiEmailParser';
import { exportCostSheetToExcel } from '../utils/excelExport';

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

  const cleanPhone = (settings.phone || '61 3033-5373').replace(/[()]/g, '').trim();
  const cleanWhatsapp = (settings.whatsapp || '61 9 9627-2630').replace(/[()]/g, '').trim();

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadDoc = () => {
    setDownloadingDoc(true);
    const filename = `${quote.code.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Proposta_Infodesk'}.doc`;

    const clientCompanyFormatted = formatCompanyPrefix(quote.clientCompany);
    const contactPersonFormatted = formatContactPerson(quote.contactPerson);

    const excDetails = extractDeliveryExceptionDetails(quote.deliveryDays);
    const itemsRows = quote.items.map(item => {
      const isException = excDetails.hasException && excDetails.itemNumbers.includes(item.itemNumber);
      const hasDescription = item.description && 
        item.description !== item.name && 
        !item.description.toLowerCase().includes('menor pre') && 
        !item.description.toLowerCase().includes('apurado');
      const hasImage = item.showImage && item.imageUrl;

      return `
      <tr>
        <td style="border: 1pt solid #000000; padding: 4pt 6pt; text-align: center; vertical-align: top;">${item.itemNumber}</td>
        <td style="border: 1pt solid #000000; padding: 4pt 6pt; text-align: left; vertical-align: top;">
          <div style="font-weight: normal;">
            ${item.name}
            ${isException ? `<span style="font-size: 8pt; color: #b45309; font-weight: bold; margin-left: 6pt;">(Prazo diferenciado: ${excDetails.days} dias úteis)</span>` : ''}
          </div>
          ${hasDescription ? `<div style="font-size: 8.5pt; color: #334155; margin-top: 3pt; line-height: 1.3; white-space: pre-line;">${item.description}</div>` : ''}
          ${hasImage ? `<div style="margin-top: 6pt; margin-bottom: 3pt;"><img src="${item.imageUrl}" alt="${item.name}" height="140" style="height: 140px; width: auto; max-width: 260px; object-fit: contain; display: block;" /></div>` : ''}
        </td>
        <td style="border: 1pt solid #000000; padding: 4pt 6pt; text-align: center; vertical-align: top;">${item.quantity}</td>
        <td style="border: 1pt solid #000000; padding: 4pt 6pt; text-align: center; vertical-align: top;">${item.unit || 'Un.'}</td>
        <td style="border: 1pt solid #000000; padding: 4pt 6pt; text-align: center; vertical-align: top; white-space: nowrap;">R$ ${item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="border: 1pt solid #000000; padding: 4pt 6pt; text-align: center; vertical-align: top; white-space: nowrap;">R$ ${item.totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `;
    }).join('');

    const formattedShipping = quote.shippingTerms
      ? (quote.shippingTerms.toLowerCase().startsWith('frete')
          ? quote.shippingTerms
          : `Frete: ${quote.shippingTerms}`)
      : '';

    const fullDoc = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${quote.code}</title>
        <!--[if gte mso 9]>
        <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          @page Section1 {
            size: 21.0cm 29.7cm;
            margin: 2.0cm 2.0cm 2.0cm 2.0cm;
            mso-header-margin: 35.4pt;
            mso-footer-margin: 35.4pt;
            mso-footer: f1;
            mso-paper-source: 0;
          }
          div.Section1 { page: Section1; }
          div#f1 { mso-element: footer; }
          body {
            font-family: Verdana, Geneva, sans-serif;
            font-size: 10pt;
            line-height: 1.35;
            color: #000000;
          }
          p { margin: 0 0 6pt 0; }
          table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 14pt;
            font-family: Verdana, Geneva, sans-serif;
            font-size: 10pt;
          }
          th {
            font-weight: bold;
            text-align: center;
            border: 1pt solid #000000;
            padding: 4pt 6pt;
            font-size: 10pt;
            background-color: #ffffff;
          }
          td {
            border: 1pt solid #000000;
            padding: 4pt 6pt;
            font-size: 10pt;
          }
        </style>
      </head>
      <body>
        <div class="Section1">
          <div style="margin-bottom: 24pt;">
            <img src="${window.location.origin}/infodesk-logo-original.svg" width="285" height="70" style="width: 285px; height: 70px;" />
          </div>

          <div style="margin-bottom: 14pt; line-height: 1.35; font-family: Verdana, Geneva, sans-serif;">
            <p style="margin: 0; font-weight: bold; font-size: 12pt; font-family: Verdana, Geneva, sans-serif;">${clientCompanyFormatted}</p>
            <p style="margin: 2pt 0 0 0; font-weight: bold; font-size: 12pt; font-family: Verdana, Geneva, sans-serif;">${contactPersonFormatted}</p>
            <p style="margin: 3pt 0 0 0; font-size: 8pt; font-family: Verdana, Geneva, sans-serif;"><strong>E-mail:</strong> <a href="mailto:${(quote.clientEmail || '').toLowerCase()}" style="color: #0000ee; text-decoration: underline; font-size: 8pt;">${(quote.clientEmail || '').toLowerCase()}</a></p>
            ${quote.clientPhone ? `<p style="margin: 2pt 0 0 0; font-size: 8pt; font-family: Verdana, Geneva, sans-serif;"><strong>Telefone:</strong> ${quote.clientPhone}</p>` : ''}
          </div>

          <p style="text-align: justify; margin-bottom: 12pt; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; line-height: 1.35;">
            ${quote.openingText || settings.defaultOpeningText}
          </p>

          <table>
            <thead>
              <tr>
                <th style="width: 8%;">Item</th>
                <th style="width: 48%; text-align: center;">Descrição do Produto</th>
                <th style="width: 8%;">Qtd.</th>
                <th style="width: 8%;">Un.</th>
                <th style="width: 14%;">Preço unit.</th>
                <th style="width: 14%;">Preço total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div style="margin-bottom: 20pt; font-size: 10pt; font-family: Verdana, Geneva, sans-serif; line-height: 1.45;">
            <p style="margin: 0 0 6pt 0; font-weight: bold; text-decoration: underline;">Condições gerais:</p>
            <p style="margin: 0 0 3pt 0;">➤&nbsp; Validade da proposta: ${quote.validityDays}</p>
            <p style="margin: 0 0 3pt 0;">➤&nbsp; Condições de pagamento: ${quote.paymentTerms}</p>
            <p style="margin: 0 0 3pt 0;">➤&nbsp; Prazo de entrega: ${quote.deliveryDays}</p>
            <p style="margin: 0 0 3pt 0;">➤&nbsp; Garantia: ${quote.warrantyTerms}</p>
            ${formattedShipping ? `<p style="margin: 0 0 3pt 0; font-weight: bold;">➤&nbsp; ${formattedShipping}</p>` : ''}
          </div>

          <div style="text-align: right; margin-top: 24pt; margin-bottom: 30pt; line-height: 1.4; font-size: 10pt; font-family: Verdana, Geneva, sans-serif;">
            <p style="margin: 0 0 24pt 0;">${quote.city || 'Brasília'}, ${quote.date}.</p>
            <p style="margin: 0; font-weight: normal;">${settings.representativeName || 'Lucas Porto'}</p>
            <p style="margin: 0;">&#9742; ${cleanPhone}</p>
            <p style="margin: 0;"><a href="https://api.whatsapp.com/send?phone=55${cleanWhatsapp.replace(/\D/g, '')}" style="color: #0000ee; text-decoration: underline;">${cleanWhatsapp}</a></p>
          </div>

          <!-- Official Native Word Document Footer -->
          <div style="mso-element:footer" id="f1">
            <div style="border-top: 1pt solid #000000; padding-top: 6pt; text-align: center; font-size: 10pt; font-family: Verdana, sans-serif; line-height: 1.35;">
              <p style="margin: 0; font-weight: bold;">${settings.companyName || 'Lucas Porto da Fonseca-ME'}</p>
              <p style="margin: 0;">${settings.address || 'CLSW 304 Bloco A Sala 108 – Sudoeste'} – ${settings.cityState || 'Brasília - DF'}</p>
              <p style="margin: 0;">CNPJ: ${settings.cnpj || '15.266.716/0001-02'}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;I.E.: ${settings.stateRegistration || '07.602.330/001-92'}</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', fullDoc], {
      type: 'application/msword;charset=utf-8'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setTimeout(() => setDownloadingDoc(false), 1500);
  };

  const handleCopyToClipboard = () => {
    const text = `PROPOSTA COMERCIAL — INFODESK\n\n` +
      `Ao ${quote.clientCompany}\n` +
      `A/C ${quote.contactPerson}\n` +
      `E-mail: ${quote.clientEmail}\n\n` +
      `Em atenção ao que foi solicitado por Vossa Senhoria, enviamos proposta para fornecimento dos produtos para informática, conforme especificações e condições a seguir:\n\n` +
      quote.items.map(i => `${i.itemNumber}. ${i.name} | Qtd: ${i.quantity} ${i.unit} | Unit: R$ ${i.unitPrice.toFixed(2)} | Total: R$ ${i.totalPrice.toFixed(2)}`).join('\n') +
      `\n\nTotal Geral: R$ ${quote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n` +
      `Condições Gerais:\n` +
      `- Validade: ${quote.validityDays}\n` +
      `- Pagamento: ${quote.paymentTerms}\n` +
      `- Prazo de Entrega: ${quote.deliveryDays}\n` +
      `- Garantia: ${quote.warrantyTerms}\n` +
      `- ${quote.shippingTerms || `Frete incluso p/ ${quote.deliveryLocation || 'Brasília'}.`}\n\n` +
      `${quote.city || 'Brasília'}, ${quote.date}.\n\n` +
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
            title="Baixar arquivo DOC editável padrão Infodesk"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>{downloadingDoc ? 'Gerando Word...' : 'Exportar Word (.doc)'}</span>
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
          className="print-page bg-white text-black w-full max-w-[794px] min-h-[1123px] px-[20mm] pt-[15mm] pb-[12mm] shadow-2xl rounded-sm border border-slate-200 leading-normal flex flex-col justify-between"
          style={{ fontFamily: 'Verdana, Geneva, sans-serif' }}
        >
          {/* Main Top & Center Content */}
          <div className="flex-1 flex flex-col">
            {/* Header with Original Infodesk Logo */}
            <div className="mb-8">
              <img 
                src="/infodesk-logo-original.svg" 
                alt="Infodesk" 
                className="w-auto object-contain"
                style={{ height: '70px' }}
              />
            </div>

            {/* Client Destination Info */}
            <div 
              className="space-y-1 text-black mb-5 leading-snug"
              style={{ fontFamily: 'Verdana, Geneva, sans-serif' }}
            >
              <p 
                className="font-bold text-black tracking-normal"
                style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '12pt', lineHeight: '1.3' }}
              >
                {formatCompanyPrefix(quote.clientCompany)}
              </p>
              <p 
                className="font-bold text-black tracking-normal"
                style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '12pt', lineHeight: '1.3' }}
              >
                {formatContactPerson(quote.contactPerson)}
              </p>
              <p 
                className="pt-0.5 text-black"
                style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '8pt', lineHeight: '1.3' }}
              >
                E-mail: <a href={`mailto:${(quote.clientEmail || '').toLowerCase()}`} className="text-[#0000ff] underline">{(quote.clientEmail || '').toLowerCase()}</a>
              </p>
              {quote.clientPhone && (
                <p 
                  className="pt-0.5 text-black"
                  style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '8pt', lineHeight: '1.3' }}
                >
                  Telefone: <span>{quote.clientPhone}</span>
                </p>
              )}
            </div>

            {/* Opening Paragraph */}
            <p 
              className="text-left text-black mb-5 leading-snug"
              style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '10pt' }}
            >
              {quote.openingText || settings.defaultOpeningText}
            </p>

            {/* Product Items Table */}
            <div className="mb-5">
              <table 
                className="w-full text-left border-collapse border border-black"
                style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '10pt' }}
              >
                <thead>
                  <tr className="font-bold border-b border-black text-black">
                    <th className="p-1.5 border border-black text-center w-12" style={{ fontSize: '10pt' }}>Item</th>
                    <th className="p-1.5 border border-black text-center" style={{ fontSize: '10pt' }}>Descrição do Produto</th>
                    <th className="p-1.5 border border-black text-center w-12" style={{ fontSize: '10pt' }}>Qtd.</th>
                    <th className="p-1.5 border border-black text-center w-12" style={{ fontSize: '10pt' }}>Un.</th>
                    <th className="p-1.5 border border-black text-center w-28" style={{ fontSize: '10pt' }}>Preço unit.</th>
                    <th className="p-1.5 border border-black text-center w-28" style={{ fontSize: '10pt' }}>Preço total</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.items.map((item) => {
                    const excDetails = extractDeliveryExceptionDetails(quote.deliveryDays);
                    const isException = excDetails.hasException && excDetails.itemNumbers.includes(item.itemNumber);
                    return (
                    <tr key={item.id} className="border-b border-black">
                      <td className="p-1.5 border border-black text-center" style={{ fontSize: '10pt' }}>
                        {item.itemNumber}
                      </td>
                      <td className="p-1.5 border border-black text-left" style={{ fontSize: '10pt' }}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{item.name}</span>
                          {isException && (
                            <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-300 rounded text-[7.5pt] font-bold shrink-0">
                              Prazo: {excDetails.days} dias úteis
                            </span>
                          )}
                        </div>
                        {item.description && 
                         item.description !== item.name && 
                         !item.description.toLowerCase().includes('menor pre') && 
                         !item.description.toLowerCase().includes('apurado') && (
                          <div className="text-[8.5pt] text-slate-700 mt-0.5 whitespace-pre-line">{item.description}</div>
                        )}
                        {item.showImage && item.imageUrl && (
                          <div className="mt-2 mb-1 flex justify-start">
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              style={{
                                height: '4.5cm',
                                maxHeight: '4.5cm',
                                width: 'auto',
                                objectFit: 'contain'
                              }}
                              className="rounded-none bg-transparent"
                            />
                          </div>
                        )}
                      </td>
                      <td className="p-1.5 border border-black text-center" style={{ fontSize: '10pt' }}>
                        {item.quantity}
                      </td>
                      <td className="p-1.5 border border-black text-center" style={{ fontSize: '10pt' }}>
                        {item.unit || 'Un.'}
                      </td>
                      <td className="p-1.5 border border-black text-center whitespace-nowrap" style={{ fontSize: '10pt' }}>
                        R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-1.5 border border-black text-center whitespace-nowrap" style={{ fontSize: '10pt' }}>
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
              className="space-y-1 mb-8 leading-relaxed text-black"
              style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '10pt' }}
            >
              <p className="font-bold underline mb-2" style={{ fontSize: '10pt' }}>Condições gerais:</p>
              <p style={{ fontSize: '10pt' }}>➤&nbsp; Validade da proposta: {quote.validityDays}</p>
              <p style={{ fontSize: '10pt' }}>➤&nbsp; Condições de pagamento: {quote.paymentTerms}</p>
              <p style={{ fontSize: '10pt' }}>➤&nbsp; Prazo de entrega: {quote.deliveryDays}</p>
              <p style={{ fontSize: '10pt' }}>➤&nbsp; Garantia: {quote.warrantyTerms}</p>
              {quote.shippingTerms && (
                <p className="font-bold" style={{ fontSize: '10pt' }}>
                  ➤&nbsp; {quote.shippingTerms.toLowerCase().startsWith('frete') ? quote.shippingTerms : `Frete: ${quote.shippingTerms}`}
                </p>
              )}
            </div>

            {/* Date & Signature (Right-aligned as in the original document) */}
            <div 
              className="flex flex-col items-end text-right ml-auto space-y-7 mb-8 text-black"
              style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '10pt' }}
            >
              <div>
                <p style={{ fontSize: '10pt' }}>{quote.city || 'Brasília'}, {quote.date}.</p>
              </div>

              <div className="space-y-0.5 text-right" style={{ fontSize: '10pt' }}>
                <p className="text-black font-normal" style={{ fontSize: '10pt' }}>{settings.representativeName || 'Lucas Porto'}</p>
                <div className="flex items-center justify-end gap-1 text-black" style={{ fontSize: '10pt' }}>
                  <span className="leading-none" style={{ fontSize: '10pt' }}>☎</span>
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

          {/* Bottom Divider & Company Details (ALWAYS glued to the bottom of the sheet) */}
          <div 
            className="mt-auto pt-2 border-t border-black text-black space-y-0.5 text-center"
            style={{ fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '10pt' }}
          >
            <p className="font-bold" style={{ fontSize: '10pt' }}>{settings.companyName || 'Lucas Porto da Fonseca-ME'}</p>
            <p style={{ fontSize: '10pt' }}>{settings.address || 'CLSW 304 Bloco A Sala 108 – Sudoeste'} – {settings.cityState || 'Brasília - DF'}</p>
            <p className="flex items-center justify-center gap-12" style={{ fontSize: '10pt' }}>
              <span style={{ fontSize: '10pt' }}>CNPJ: {settings.cnpj || '15.266.716/0001-02'}</span>
              <span style={{ fontSize: '10pt' }}>I.E.: {settings.stateRegistration || '07.602.330/001-92'}</span>
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};
