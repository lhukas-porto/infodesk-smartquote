import {
  Document,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  Footer,
  UnderlineType,
  LineRuleType,
  convertMillimetersToTwip,
  Packer,
  ExternalHyperlink
} from 'docx';
import { CompanySettings, Quote } from '../types';
import { 
  formatCompanyPrefix, 
  formatContactPerson, 
  extractDeliveryExceptionDetails 
} from './aiEmailParser';
import { 
  INFODESK_LOGO_BASE64, 
  PHONE_ICON_BASE64, 
  WHATSAPP_ICON_BASE64 
} from './infodeskLogoBase64';

/**
 * Converte string base64 pura ou data-URL para Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
  if (typeof atob === 'function') {
    const binary = atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } else {
    // Node.js fallback (para testes e build)
    return new Uint8Array(Buffer.from(cleanBase64, 'base64'));
  }
}

/**
 * Carrega os bytes e as dimensões proporcionais de uma imagem (base64, blob ou URL externa)
 * Limita a foto a no máximo 4,0 cm de largura x 2,71 cm de altura, mantendo a proporção exata.
 */
async function loadProductImageData(src: string): Promise<{ data: Uint8Array; width: number; height: number; type: 'png' | 'jpg' } | null> {
  try {
    if (!src) return null;
    let bytes: Uint8Array;

    const isJpg = src.toLowerCase().includes('.jpg') || src.toLowerCase().includes('.jpeg') || src.includes('image/jpeg');
    const imgType: 'png' | 'jpg' = isJpg ? 'jpg' : 'png';

    const maxWidth = 151;  // 4.00 cm em 96 DPI
    const maxHeight = 102; // 2.71 cm em 96 DPI
    let width = maxWidth;
    let height = maxHeight;

    if (src.startsWith('data:')) {
      bytes = base64ToUint8Array(src);
    } else {
      const res = await fetch(src);
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      bytes = new Uint8Array(buffer);
    }

    if (typeof Image !== 'undefined') {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const natW = img.naturalWidth || maxWidth;
          const natH = img.naturalHeight || maxHeight;
          const scale = Math.min(maxWidth / natW, maxHeight / natH, 1);
          width = Math.max(1, Math.round(natW * scale));
          height = Math.max(1, Math.round(natH * scale));
          resolve();
        };
        img.onerror = () => resolve();
        img.src = src;
      });
    }

    return { data: bytes, width, height, type: imgType };
  } catch (err) {
    console.warn('Não foi possível carregar foto do produto para exportação Word:', err);
    return null;
  }
}

/**
 * Retorna o texto de abertura padrão canônico da proposta
 */
export function getCanonicalOpeningText(openingText?: string, defaultText?: string): string {
  const canonical = 'Em atenção à solicitação de Vossa Senhoria, temos a grata satisfação de submeter à apreciação a nossa proposta de preços para fornecimento dos produtos relacionados a seguir:';
  const chosen = (openingText && openingText.trim()) || (defaultText && defaultText.trim()) || canonical;
  if (chosen === 'Em atenção...' || chosen === 'Em atenção' || chosen.length < 15 || chosen.startsWith('Em atenção ao que foi solicitado')) {
    return canonical;
  }
  return chosen;
}

/**
 * Constrói o Documento Word Nativo (.docx) com medidas e características estritamente fiéis
 * ao layout visual e às especificações comerciais da Infodesk.
 */
export async function buildQuoteWordDocument(quote: Quote, settings: CompanySettings): Promise<Document> {
  const cleanPhone = (settings.phone || '61 3033-5373').replace(/[()]/g, '').trim();
  const cleanWhatsapp = (settings.whatsapp || '61 9 9627-2630').replace(/[()]/g, '').trim();

  const logoBytes = base64ToUint8Array(INFODESK_LOGO_BASE64);
  const phoneBytes = base64ToUint8Array(PHONE_ICON_BASE64);
  const whatsappBytes = base64ToUint8Array(WHATSAPP_ICON_BASE64);

  const clientCompanyFormatted = formatCompanyPrefix(quote.clientCompany);
  const contactPersonFormatted = formatContactPerson(quote.contactPerson);
  const excDetails = extractDeliveryExceptionDetails(quote.deliveryDays);

  const formattedShipping = (quote.showShippingInProposal !== false && quote.shippingTerms)
    ? (quote.shippingTerms.toLowerCase().startsWith('frete')
        ? quote.shippingTerms
        : `Frete: ${quote.shippingTerms}`)
    : '';

  // Bordas finas de 0,5 pt (4 oitavos de ponto) pretas oficiais
  const cellBorders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
  };

  // Preenchimento interno das células (4 pt vertical, 6 pt horizontal)
  const cellMargins = {
    top: convertMillimetersToTwip(1.4),
    bottom: convertMillimetersToTwip(1.4),
    left: convertMillimetersToTwip(2.1),
    right: convertMillimetersToTwip(2.1)
  };

  // Largura total da tabela: 176.8 mm (~18.52 cm em proporcional)
  // Divisão: Item (8%), Descrição (48%), Qtd (8%), Un (8%), Preço Unit (14%), Preço Total (14%)
  const colWidths = [
    convertMillimetersToTwip(14.1),
    convertMillimetersToTwip(84.8),
    convertMillimetersToTwip(14.1),
    convertMillimetersToTwip(14.1),
    convertMillimetersToTwip(24.8),
    convertMillimetersToTwip(24.8)
  ];

  // Linha de Cabeçalho da Tabela
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      new TableCell({
        width: { size: colWidths[0], type: WidthType.DXA },
        borders: cellBorders,
        margins: cellMargins,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Item', bold: true, size: 20 })]
          })
        ]
      }),
      new TableCell({
        width: { size: colWidths[1], type: WidthType.DXA },
        borders: cellBorders,
        margins: cellMargins,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Descrição do Produto', bold: true, size: 20 })]
          })
        ]
      }),
      new TableCell({
        width: { size: colWidths[2], type: WidthType.DXA },
        borders: cellBorders,
        margins: cellMargins,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Qtd.', bold: true, size: 20 })]
          })
        ]
      }),
      new TableCell({
        width: { size: colWidths[3], type: WidthType.DXA },
        borders: cellBorders,
        margins: cellMargins,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Un.', bold: true, size: 20 })]
          })
        ]
      }),
      new TableCell({
        width: { size: colWidths[4], type: WidthType.DXA },
        borders: cellBorders,
        margins: cellMargins,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Preço unit.', bold: true, size: 20 })]
          })
        ]
      }),
      new TableCell({
        width: { size: colWidths[5], type: WidthType.DXA },
        borders: cellBorders,
        margins: cellMargins,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Preço total', bold: true, size: 20 })]
          })
        ]
      })
    ]
  });

  // Linhas dos Itens
  const itemRows: TableRow[] = [];
  for (const item of quote.items) {
    const isException = excDetails.hasException && excDetails.itemNumbers.includes(item.itemNumber);
    const descChildren: (Paragraph)[] = [];

    // Nome e prazo diferenciado se houver
    const nameRuns: TextRun[] = [
      new TextRun({ text: item.name, size: 20 })
    ];
    if (isException) {
      nameRuns.push(
        new TextRun({
          text: ` (Prazo diferenciado: ${excDetails.days} dias úteis)`,
          bold: true,
          size: 15,
          color: 'B45309'
        })
      );
    }
    descChildren.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { line: 260, after: item.showImage && item.imageUrl ? 80 : 0 },
        children: nameRuns
      })
    );

    // Foto do produto proporcional
    if (item.showImage && item.imageUrl) {
      const imgData = await loadProductImageData(item.imageUrl);
      if (imgData) {
        descChildren.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 60, after: 40 },
            children: [
              new ImageRun({
                type: imgData.type,
                data: imgData.data,
                transformation: {
                  width: imgData.width,
                  height: imgData.height
                }
              })
            ]
          })
        );
      }
    }

    itemRows.push(
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: colWidths[0], type: WidthType.DXA },
            borders: cellBorders,
            margins: cellMargins,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: String(item.itemNumber), size: 20 })]
              })
            ]
          }),
          new TableCell({
            width: { size: colWidths[1], type: WidthType.DXA },
            borders: cellBorders,
            margins: cellMargins,
            children: descChildren
          }),
          new TableCell({
            width: { size: colWidths[2], type: WidthType.DXA },
            borders: cellBorders,
            margins: cellMargins,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: String(item.quantity), size: 20 })]
              })
            ]
          }),
          new TableCell({
            width: { size: colWidths[3], type: WidthType.DXA },
            borders: cellBorders,
            margins: cellMargins,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: item.unit || 'Un.', size: 20 })]
              })
            ]
          }),
          new TableCell({
            width: { size: colWidths[4], type: WidthType.DXA },
            borders: cellBorders,
            margins: cellMargins,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `R$ ${item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    size: 20
                  })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: colWidths[5], type: WidthType.DXA },
            borders: cellBorders,
            margins: cellMargins,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `R$ ${item.totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    size: 20
                  })
                ]
              })
            ]
          })
        ]
      })
    );
  }

  // Monta a Tabela Oficial
  const itemsTable = new Table({
    width: {
      size: convertMillimetersToTwip(176.8),
      type: WidthType.DXA
    },
    rows: [headerRow, ...itemRows]
  });

  // Parágrafos de Condições Gerais
  const conditionsParagraphs: Paragraph[] = [
    new Paragraph({
      spacing: { before: 280, after: 120 },
      children: [
        new TextRun({
          text: 'Condições gerais:',
          bold: true,
          underline: { type: UnderlineType.SINGLE },
          size: 24
        })
      ]
    }),
    new Paragraph({
      spacing: { line: 360, after: 80 },
      children: [
        new TextRun({ text: `➤  Validade da proposta: ${quote.validityDays}`, size: 20 })
      ]
    }),
    new Paragraph({
      spacing: { line: 360, after: 80 },
      children: [
        new TextRun({ text: `➤  Condições de pagamento: ${quote.paymentTerms}`, size: 20 })
      ]
    }),
    new Paragraph({
      spacing: { line: 360, after: 80 },
      children: [
        new TextRun({ text: `➤  Prazo de entrega: ${quote.deliveryDays}`, size: 20 })
      ]
    }),
    new Paragraph({
      spacing: { line: 360, after: 80 },
      children: [
        new TextRun({ text: `➤  Garantia: ${quote.warrantyTerms}`, size: 20 })
      ]
    })
  ];

  const rawObs = (quote.observations || quote.notes || '').trim();
  const cleanObs = rawObs.replace(/^(obs(\.|ervação|ervações)?\s*:\s*)/i, '').trim();

  if (formattedShipping) {
    conditionsParagraphs.push(
      new Paragraph({
        spacing: { line: 360, after: cleanObs ? 80 : 480 },
        children: [
          new TextRun({ text: `➤  ${formattedShipping}`, bold: true, size: 20 })
        ]
      })
    );
  }

  if (cleanObs) {
    const obsLines = cleanObs.split('\n');
    const obsRuns: TextRun[] = [
      new TextRun({ text: '➤  ', size: 20 }),
      new TextRun({ text: 'Obs: ', bold: true, size: 20 })
    ];
    obsLines.forEach((line, lIdx) => {
      if (lIdx === 0) {
        obsRuns.push(new TextRun({ text: line, size: 20 }));
      } else {
        obsRuns.push(new TextRun({ text: `     ${line}`, break: 1, size: 20 }));
      }
    });

    conditionsParagraphs.push(
      new Paragraph({
        spacing: { line: 360, after: 480 },
        children: obsRuns
      })
    );
  } else if (!formattedShipping) {
    // Espaçamento final após condições se não houver frete nem observação
    conditionsParagraphs[conditionsParagraphs.length - 1] = new Paragraph({
      spacing: { line: 360, after: 480 },
      children: [
        new TextRun({ text: `➤  Garantia: ${quote.warrantyTerms}`, size: 20 })
      ]
    });
  }

  // Documento Principal
  return new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Verdana',
            size: 20
          },
          paragraph: {
            spacing: {
              line: 324,
              lineRule: LineRuleType.AUTO
            }
          }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297)
            },
            margin: {
              top: convertMillimetersToTwip(7.5),
              bottom: convertMillimetersToTwip(2.5),
              left: convertMillimetersToTwip(20.0),
              right: convertMillimetersToTwip(13.2),
              footer: convertMillimetersToTwip(2.5)
            }
          }
        },
        // Rodapé Nativo Oficial da Página
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: {
                  top: {
                    style: BorderStyle.SINGLE,
                    size: 4,
                    color: '000000',
                    space: 4
                  }
                },
                spacing: { before: 80, line: 270 },
                children: [
                  new TextRun({
                    text: settings.companyName || 'Lucas Porto da Fonseca-ME',
                    bold: true,
                    size: 20
                  })
                ]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { line: 270 },
                children: [
                  new TextRun({
                    text: `${settings.address || 'CLSW 304 Bloco A Sala 108 – Sudoeste'} – ${settings.cityState || 'Brasília - DF'}`,
                    bold: true,
                    size: 20
                  })
                ]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { line: 270 },
                children: [
                  new TextRun({
                    text: `CNPJ: ${settings.cnpj || '15.266.716/0001-02'}                    I.E.: ${settings.stateRegistration || '07.602.330/001-92'}`,
                    bold: true,
                    size: 20
                  })
                ]
              })
            ]
          })
        },
        children: [
          // Logomarca Infodesk (8,56 x 2,08 cm)
          new Paragraph({
            spacing: { after: 360 }, // ~18pt
            children: [
              new ImageRun({
                type: 'png',
                data: logoBytes,
                transformation: {
                  width: 324, // 8.56 cm em 96 DPI
                  height: 79  // 2.08 cm em 96 DPI
                }
              })
            ]
          }),

          // Dados do Destinatário (12 pt, negrito, espaçamento 1,5)
          new Paragraph({
            spacing: { line: 360, after: 0 },
            children: [
              new TextRun({
                text: clientCompanyFormatted,
                bold: true,
                size: 24
              })
            ]
          }),
          new Paragraph({
            spacing: { line: 360, after: 0 },
            children: [
              new TextRun({
                text: contactPersonFormatted,
                bold: true,
                size: 24
              })
            ]
          }),
          new Paragraph({
            spacing: { line: 270, before: 80, after: 0 },
            children: [
              new TextRun({ text: 'E-mail: ', bold: true, size: 16 }),
              new ExternalHyperlink({
                children: [
                  new TextRun({
                    text: (quote.clientEmail || '').toLowerCase(),
                    bold: true,
                    size: 16,
                    color: '0000EE',
                    underline: { type: UnderlineType.SINGLE }
                  })
                ],
                link: `mailto:${(quote.clientEmail || '').toLowerCase()}`
              })
            ]
          }),
          ...(quote.clientPhone
            ? [
                new Paragraph({
                  spacing: { line: 270, before: 40, after: 280 }, // ~14pt after
                  children: [
                    new TextRun({ text: `Telefone: ${quote.clientPhone}`, bold: true, size: 16 })
                  ]
                })
              ]
            : [
                new Paragraph({
                  spacing: { after: 280 },
                  children: []
                })
              ]),

          // Texto de apresentação (9 pt, justificado, espaçamento 1,35)
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { line: 324, after: 240 }, // ~12pt after
            children: [
              new TextRun({
                text: getCanonicalOpeningText(quote.openingText, settings.defaultOpeningText),
                size: 18
              })
            ]
          }),

          // Tabela de Produtos
          itemsTable,

          // Condições Gerais
          ...conditionsParagraphs,

          // Data e Assinatura à Direita
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 480 }, // 24pt
            children: [
              new TextRun({
                text: `${quote.city || (settings.cityState ? settings.cityState.split('-')[0].trim() : 'Brasília')}, ${quote.date}.`,
                size: 20
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { line: 280, after: 40 },
            children: [
              new TextRun({
                text: settings.representativeName || 'Lucas Porto',
                size: 20
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { line: 280, after: 40 },
            children: [
              new ImageRun({
                type: 'png',
                data: phoneBytes,
                transformation: { width: 14, height: 14 }
              }),
              new TextRun({ text: `  ${cleanPhone}`, size: 20 })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { line: 280, after: 0 },
            children: [
              new ImageRun({
                type: 'png',
                data: whatsappBytes,
                transformation: { width: 14, height: 14 }
              }),
              new TextRun({ text: '  ' }),
              new ExternalHyperlink({
                children: [
                  new TextRun({
                    text: cleanWhatsapp,
                    size: 20,
                    color: '0000EE',
                    underline: { type: UnderlineType.SINGLE }
                  })
                ],
                link: `https://api.whatsapp.com/send?phone=55${cleanWhatsapp.replace(/\D/g, '')}`
              })
            ]
          })
        ]
      }
    ]
  });
}

/**
 * Função executada no navegador para gerar e disparar o download imediato
 * do arquivo DOCX nativo oficial.
 */
export async function exportQuoteToWord(quote: Quote, settings: CompanySettings): Promise<void> {
  const doc = await buildQuoteWordDocument(quote, settings);
  const blob = await Packer.toBlob(doc);
  // O nome do arquivo segue o campo de cotação (quote.code)
  // Preserva acentos (É, Á, Ó, Ç), espaços e caracteres válidos, removendo apenas proibidos do Windows (< > : " / \ | ? *)
  const rawCode = (quote.code || 'Proposta').trim();
  const cleanCode = rawCode.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() || 'Proposta';
  const filename = cleanCode.toLowerCase().endsWith('.docx') ? cleanCode : `${cleanCode}.docx`;

  // 1. Tenta abrir a janela nativa do Windows ("Salvar como...") usando File System Access API
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'Documento do Microsoft Word (*.docx)',
            accept: {
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
            }
          }
        ]
      });

      const writableStream = await fileHandle.createWritable();
      await writableStream.write(blob);
      await writableStream.close();
      return;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // Usuário cancelou a janela do Windows - encerra normalmente
        return;
      }
      console.warn('showSaveFilePicker falhou ou não permitido, acionando método de download padrão:', err);
    }
  }

  // 2. Fallback padrão via link temporário se a API nativa não estiver disponível
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 1000);
}
