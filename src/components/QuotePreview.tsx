import React, { useRef, useState } from 'react';
import { 
  Printer, 
  Send, 
  ArrowLeft, 
  Copy, 
  Check,
  ExternalLink,
  FileText,
  Download
} from 'lucide-react';
import { CompanySettings, Quote } from '../types';

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

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadDoc = () => {
    setDownloadingDoc(true);
    const filename = `${quote.code.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Proposta_Infodesk'}.doc`;

    const clientCompanyFormatted = quote.clientCompany.startsWith('Ao ') ? quote.clientCompany : `Ao ${quote.clientCompany}`;
    const contactPersonFormatted = quote.contactPerson.startsWith('A/C ') ? quote.contactPerson : `A/C ${quote.contactPerson}`;

    const itemsRows = quote.items.map(item => `
      <tr>
        <td style="border: 1pt solid #475569; padding: 6pt; text-align: center;">${item.itemNumber}</td>
        <td style="border: 1pt solid #475569; padding: 6pt;">
          ${item.showImage && item.imageUrl ? `<img src="${item.imageUrl}" width="38" height="38" style="vertical-align: middle; margin-right: 6pt; border: 1pt solid #cbd5e1;" />` : ''}
          <strong>${item.name}</strong>
        </td>
        <td style="border: 1pt solid #475569; padding: 6pt; text-align: center;">${item.quantity}</td>
        <td style="border: 1pt solid #475569; padding: 6pt; text-align: center;">${item.unit || 'Un.'}</td>
        <td style="border: 1pt solid #475569; padding: 6pt; text-align: center; white-space: nowrap;">R$ ${item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="border: 1pt solid #475569; padding: 6pt; text-align: center; white-space: nowrap;">R$ ${item.totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `).join('');

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
            margin: 2.0cm 2.0cm 2.2cm 2.0cm;
            mso-header-margin: 35.4pt;
            mso-footer-margin: 35.4pt;
            mso-footer: f1;
            mso-paper-source: 0;
          }
          div.Section1 { page: Section1; }
          div#f1 { mso-element: footer; }
          body {
            font-family: Calibri, "Segoe UI", Arial, sans-serif;
            font-size: 11pt;
            line-height: 1.25;
            color: #000000;
          }
          p { margin: 0 0 8pt 0; }
          table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 12pt;
          }
          th {
            background-color: #f1f5f9;
            font-weight: bold;
            text-align: center;
            border: 1pt solid #475569;
            padding: 6pt;
            font-size: 10pt;
          }
        </style>
      </head>
      <body>
        <div class="Section1">
          <div style="margin-bottom: 18pt;">
            <p style="font-size: 20pt; font-weight: bold; color: #0284c7; margin: 0;">INFODESK</p>
            <p style="font-size: 9.5pt; color: #475569; margin: 0;">Informática & Tecnologia</p>
          </div>

          <div style="margin-bottom: 14pt; line-height: 1.3;">
            <p style="margin: 0; font-weight: bold;">${clientCompanyFormatted}</p>
            <p style="margin: 0; font-weight: bold;">${contactPersonFormatted}</p>
            <p style="margin: 0;">E-mail: <a href="mailto:${quote.clientEmail}" style="color: #0000ee; text-decoration: underline;">${quote.clientEmail}</a></p>
          </div>

          <p style="text-align: justify; margin-bottom: 14pt;">
            ${quote.openingText || settings.defaultOpeningText}
          </p>

          <table>
            <thead>
              <tr>
                <th style="width: 8%;">Item</th>
                <th style="width: 44%;">Descrição do Produto</th>
                <th style="width: 10%;">Qtd.</th>
                <th style="width: 8%;">Un.</th>
                <th style="width: 15%;">Preço unit.</th>
                <th style="width: 15%;">Preço total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div style="margin-bottom: 18pt; font-size: 10.5pt; line-height: 1.3;">
            <p style="margin: 0 0 4pt 0; font-weight: bold;">Condições gerais:</p>
            <p style="margin: 0 0 2pt 0;"><span style="font-weight: bold;">Validade da proposta:</span> ${quote.validityDays}</p>
            <p style="margin: 0 0 2pt 0;"><span style="font-weight: bold;">Condições de pagamento:</span> ${quote.paymentTerms}</p>
            <p style="margin: 0 0 2pt 0;"><span style="font-weight: bold;">Prazo de entrega:</span> ${quote.deliveryDays}</p>
            <p style="margin: 0 0 2pt 0;"><span style="font-weight: bold;">Garantia:</span> ${quote.warrantyTerms}</p>
            <p style="margin: 2pt 0 0 0; font-weight: bold;">${quote.shippingTerms || `Frete incluso p/ ${quote.deliveryLocation || 'Brasília'}.`}</p>
          </div>

          <div style="text-align: right; margin-top: 24pt; margin-bottom: 36pt; line-height: 1.4;">
            <p style="margin: 0 0 16pt 0;">${quote.city || 'Brasília'}, ${quote.date}.</p>
            <p style="margin: 0; font-weight: bold;">${settings.representativeName}</p>
            <p style="margin: 0;">&#9742; ${settings.phone}</p>
            <p style="margin: 0;"><a href="https://api.whatsapp.com/send?phone=55${settings.whatsapp.replace(/\D/g, '')}" style="color: #0000ee; text-decoration: underline;">${settings.whatsapp}</a></p>
          </div>

          <!-- Official Native Word Document Footer -->
          <div style="mso-element:footer" id="f1">
            <div style="border-top: 1pt solid #000000; padding-top: 6pt; text-align: center; font-size: 9pt; font-family: Calibri, sans-serif; line-height: 1.3;">
              <p style="margin: 0; font-weight: bold;">${settings.companyName}</p>
              <p style="margin: 0;">${settings.address} – ${settings.cityState}</p>
              <p style="margin: 0;">CNPJ: ${settings.cnpj}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;I.E.: ${settings.stateRegistration}</p>
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
      `${settings.phone} / ${settings.whatsapp}\n` +
      `${settings.companyName}\n` +
      `${settings.address} – ${settings.cityState}\n` +
      `CNPJ: ${settings.cnpj}  I.E.: ${settings.stateRegistration}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      
      <div className="no-print bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <button
          onClick={onBackToEdit}
          className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-semibold transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar ao Montador</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopyToClipboard}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-semibold transition"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
            <span>{copied ? 'Copiado!' : 'Copiar Texto'}</span>
          </button>

          <button
            onClick={handleDownloadDoc}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 rounded-xl text-xs font-bold transition shadow-xs"
            title="Exportar orçamento diretamente em arquivo editável do Word (.doc)"
          >
            {downloadingDoc ? <Check className="w-4 h-4 text-emerald-600" /> : <FileText className="w-4 h-4 text-sky-600" />}
            <span>{downloadingDoc ? 'Baixando...' : 'Baixar .doc (Word)'}</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl text-xs font-semibold transition shadow-xs"
          >
            <Printer className="w-4 h-4 text-sky-600" />
            <span>Imprimir / Salvar PDF</span>
          </button>

          <button
            onClick={onSendEmail}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm transition"
          >
            <Send className="w-4 h-4" />
            <span>Disparar E-mail</span>
          </button>
        </div>
      </div>

      <div className="flex justify-center">
        <div 
          ref={documentRef}
          className="print-page bg-white text-black w-full max-w-[794px] min-h-[1123px] p-12 md:p-14 shadow-2xl rounded-sm border border-slate-200 text-[13.5px] leading-normal font-sans flex flex-col justify-between"
          style={{ fontFamily: 'Calibri, Arial, "Segoe UI", sans-serif' }}
        >
          {/* Main Top & Center Content */}
          <div className="flex-1 flex flex-col">
            {/* Header with Original Infodesk Logo */}
            <div className="mb-8">
              <img 
                src="/infodesk-logo-original.svg" 
                alt="Infodesk" 
                className="h-14 w-auto object-contain"
              />
            </div>

            {/* Client Destination Info */}
            <div className="space-y-1 text-black text-[13.5px] mb-6">
              <p className="font-bold">
                {quote.clientCompany.startsWith('Ao ') ? quote.clientCompany : `Ao ${quote.clientCompany}`}
              </p>
              <p className="font-bold">
                {quote.contactPerson.startsWith('A/C ') ? quote.contactPerson : `A/C ${quote.contactPerson}`}
              </p>
              <p>
                E-mail: <a href={`mailto:${quote.clientEmail}`} className="text-blue-700 underline">{quote.clientEmail}</a>
              </p>
            </div>

            {/* Opening Paragraph */}
            <p className="text-justify text-black mb-6 text-[13.5px] leading-relaxed">
              {quote.openingText || settings.defaultOpeningText}
            </p>

            {/* Product Items Table */}
            <div className="mb-6">
              <table className="w-full text-left text-[13px] border-collapse border border-slate-400">
                <thead>
                  <tr className="bg-slate-100/60 font-bold border-b border-slate-400 text-black">
                    <th className="p-2 border-r border-slate-400 text-center w-12">Item</th>
                    <th className="p-2 border-r border-slate-400 text-center">Descrição do Produto</th>
                    <th className="p-2 border-r border-slate-400 text-center w-14">Qtd.</th>
                    <th className="p-2 border-r border-slate-400 text-center w-14">Un.</th>
                    <th className="p-2 border-r border-slate-400 text-center w-28">Preço unit.</th>
                    <th className="p-2 text-center w-28">Preço total</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.items.map((item) => {
                    const productUrl = item.sourceUrl || `https://www.google.com/search?q=${encodeURIComponent(item.name + ' ' + (item.description || ''))}`;
                    return (
                      <tr key={item.id} className="border-b border-slate-300">
                        <td className="p-2 border-r border-slate-400 text-center">
                          {item.itemNumber}
                        </td>
                        <td className="p-2 border-r border-slate-400">
                          <div className="flex items-center gap-2.5">
                            {item.showImage && item.imageUrl && (
                              <img 
                                src={item.imageUrl} 
                                alt={item.name} 
                                className="w-9 h-9 object-contain rounded border border-slate-200 p-0.5 bg-white shrink-0" 
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            )}
                            <a
                              href={productUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-bold text-black hover:text-blue-700 hover:underline inline-flex items-center gap-1.5 cursor-pointer group"
                              title="Clique para abrir o link do produto na web"
                            >
                              <span>{item.name}</span>
                              <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-blue-600 inline opacity-60 group-hover:opacity-100 transition print:hidden" />
                            </a>
                          </div>
                        </td>
                        <td className="p-2 border-r border-slate-400 text-center">
                          {item.quantity}
                        </td>
                        <td className="p-2 border-r border-slate-400 text-center">
                          {item.unit}
                        </td>
                        <td className="p-2 border-r border-slate-400 text-center whitespace-nowrap">
                          R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-center whitespace-nowrap">
                          R$ {item.totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* General Conditions */}
            <div className="space-y-1 mb-8 text-[13.5px]">
              <p className="font-bold mb-2">Condições gerais:</p>
              <p><span className="font-bold">Validade da proposta:</span> {quote.validityDays}</p>
              <p><span className="font-bold">Condições de pagamento:</span> {quote.paymentTerms}</p>
              <p><span className="font-bold">Prazo de entrega:</span> {quote.deliveryDays}</p>
              <p><span className="font-bold">Garantia:</span> {quote.warrantyTerms}</p>
              <p className="font-bold text-black">{quote.shippingTerms || `Frete incluso p/ ${quote.deliveryLocation || 'Brasília'}.`}</p>
            </div>

            {/* Date & Signature (Right-aligned as in the original document) */}
            <div className="flex flex-col items-end text-right ml-auto space-y-6 mb-8 text-[13.5px]">
              <div>
                <p>{quote.city || 'Brasília'}, {quote.date}.</p>
              </div>

              <div className="space-y-1">
                <p className="font-bold text-black">{settings.representativeName}</p>
                <div className="flex items-center justify-end gap-2 text-black">
                  <img src="/phone-icon.png" alt="Telefone" className="w-4 h-4 object-contain inline-block" />
                  <span>{settings.phone}</span>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <img src="/whatsapp-icon.png" alt="WhatsApp" className="w-4 h-4 object-contain inline-block" />
                  <a 
                    href={`https://api.whatsapp.com/send?phone=55${settings.whatsapp.replace(/\D/g, '')}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-blue-700 underline"
                  >
                    {settings.whatsapp}
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Divider & Company Details (ALWAYS glued to the bottom of the sheet) */}
          <div className="mt-auto pt-3 border-t border-slate-800 text-[12px] text-slate-800 space-y-0.5 text-center">
            <p className="font-bold text-black">{settings.companyName}</p>
            <p>{settings.address} – {settings.cityState}</p>
            <p className="flex items-center justify-center gap-8">
              <span>CNPJ: {settings.cnpj}</span>
              <span>I.E.: {settings.stateRegistration}</span>
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};
