import { ClientCompany, CompanySettings, IncomingEmail, Product, Quote } from '../types';

export const defaultCompanySettings: CompanySettings = {
  companyName: 'Lucas Porto da Fonseca-ME',
  tradeName: 'Infodesk — Informática & Tecnologia',
  cnpj: '15.266.716/0001-02',
  stateRegistration: '07.602.330/001-92',
  address: 'CLSW 304 Bloco A Sala 108 – Sudoeste',
  cityState: 'Brasília – DF',
  phone: '(61) 3033-5373',
  whatsapp: '(61) 9 9627-2630',
  email: 'lucas@infodesk.com.br',
  representativeName: 'Lucas Porto',
  defaultValidityDays: '03 (três) dias ou enquanto durar o estoque.',
  defaultPaymentTerms: 'Faturado.',
  defaultDeliveryDays: 'em até 10 (dez) dias úteis após autorização de fornecimento.',
  defaultWarrantyTerms: '06 (seis) meses contra eventuais problemas de fabricação. Garantia balcão. Exceto para Monitor/Impressora/Nobreak (garantia 1 ano na rede autorizada).',
  defaultOpeningText: 'Em atenção ao que foi solicitado por Vossa Senhoria, enviamos proposta para fornecimento dos produtos para informática, conforme especificações e condições a seguir.',
  defaultMarkupPercent: 23.5,
  defaultTaxPercent: 9.1,
  defaultShippingCost: 0,
  googleWorkspaceConnected: true,
  googleAccountEmail: 'lucas@infodesk.com.br'
};

export const initialProducts: Product[] = [
  {
    id: 'prod-1',
    sku: 'TRA-PLU-01',
    name: 'Organizador de pia Tramontina Plurale',
    description: 'Organizador de pia Tramontina Plurale em plástico e aço inox com divisórias',
    category: 'Acessórios & Escritório',
    costPrice: 78.50,
    unit: 'Un.',
    supplier: 'Tramontina Distribuição',
    stock: 12,
    lastUpdated: '2026-08-28'
  },
  {
    id: 'prod-2',
    sku: 'DEL-MON-27',
    name: 'Monitor Dell 27 4K UHD S2722QC',
    description: 'Monitor Dell 27 Polegadas 4K UHD IPS, USB-C 65W, Ajuste de Altura, HDMI, 99% sRGB',
    category: 'Monitores',
    costPrice: 1850.00,
    unit: 'Un.',
    supplier: 'Dell Brasil Comercial',
    stock: 8,
    lastUpdated: '2026-08-25'
  },
  {
    id: 'prod-3',
    sku: 'LOG-MXK-01',
    name: 'Teclado Mecânico Logitech MX Keys S',
    description: 'Teclado sem fio avançado iluminado com conexão Bluetooth / Logi Bolt, Layout ABNT2',
    category: 'Periféricos',
    costPrice: 480.00,
    unit: 'Un.',
    supplier: 'Logitech Distribuição',
    stock: 15,
    lastUpdated: '2026-08-27'
  },
  {
    id: 'prod-4',
    sku: 'APC-NOB-1500',
    name: 'Nobreak Senoidal APC Back-UPS Pro 1500VA',
    description: 'Nobreak APC 1500VA / 900W Bivolt Automático, 8 Tomadas, Display LCD, Conexão USB',
    category: 'Energia & Nobreaks',
    costPrice: 920.00,
    unit: 'Un.',
    supplier: 'Schneider Electric',
    stock: 5,
    lastUpdated: '2026-08-20'
  },
  {
    id: 'prod-5',
    sku: 'KNG-SSD-1TB',
    name: 'SSD Kingston KC3000 1TB M.2 NVMe',
    description: 'SSD Kingston KC3000 PCIe 4.0 NVMe M.2 2280 Leitura 7000MB/s Gravação 6000MB/s com Dissipador',
    category: 'Armazenamento',
    costPrice: 410.00,
    unit: 'Un.',
    supplier: 'Kingston Tech BR',
    stock: 24,
    lastUpdated: '2026-08-29'
  },
  {
    id: 'prod-6',
    sku: 'FUR-CAB-CAT6',
    name: 'Cabo de Rede Furukawa Cat6 Gigalan 100% Cobre',
    description: 'Cabo de Rede Furukawa SohoPlus Cat6 U/UTP 4 Pares 23AWG Azul (Caixa 305 metros)',
    category: 'Redes & Conectividade',
    costPrice: 590.00,
    unit: 'Cx.',
    supplier: 'Furukawa Electric',
    stock: 10,
    lastUpdated: '2026-08-15'
  },
  {
    id: 'prod-7',
    sku: 'CIS-SW-24P',
    name: 'Switch Cisco Business 24 Portas Gigabit PoE+ CBS250',
    description: 'Switch Gerenciável Cisco CBS250-24P-4G 24 Portas Gigabit PoE+ 195W + 4 Portas SFP Gigabit',
    category: 'Redes & Conectividade',
    costPrice: 2450.00,
    unit: 'Un.',
    supplier: 'Cisco Distribuição',
    stock: 3,
    lastUpdated: '2026-08-10'
  }
];

export const initialEmails: IncomingEmail[] = [
  {
    id: 'mock-email-1',
    senderName: 'Eng. Ricardo Silveira',
    senderEmail: 'suprimentos@comunicacoes.gov.br',
    senderCompany: 'Ministério das Comunicações',
    deliveryLocation: 'Brasília - DF',
    subject: 'Solicitação de Cotação — Antena de Rádio Panorama e Acessórios',
    date: 'Hoje às 14:20',
    snippet: 'Prezados, solicitamos proposta para fornecimento de 2 UND Antena do Rádio Panorama Antennas EBF-S4-5BL e Cabo USB Sepura...',
    unread: true,
    status: 'new',
    body: `Prezados,\nSolicitamos proposta comercial para o fornecimento dos materiais abaixo:\n\nQNTD: 2 UND\nTEXTO BREVE: ANTENA DO RÁDIO\nMARCA: PANORAMA ANTENNAS\nMODELO: EBF-S4-5BL\nESPECIFICAÇÕES TÉCNICAS: FREQUÊNCIA 450-470 MHZ, GANHO 2dBi, IMPEDÂNCIA 50 OHM, POLARIZAÇÃO VERTICAL, CONECTOR BNC MACHO.\n\nItens para Cotação:\n1 UND - CABO USB\n- SEPURA USB PROGRAMMING CABLE FOR SC2020 / SC2021\n- SN: 300-01384\n- MARCA: SEPURA`,
    bodyHtml: `
      <p style="margin-bottom: 12px; font-weight: 500;">Prezados,</p>
      <p style="margin-bottom: 16px;">Solicitamos proposta comercial para fornecimento dos itens descritos na tabela abaixo:</p>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <thead>
          <tr style="background-color: #1e3a8a; color: #ffffff; text-align: center;">
            <th colspan="5" style="padding: 8px; font-size: 11px; letter-spacing: 0.05em;">MATERIAL/SERVIÇO</th>
          </tr>
          <tr style="background-color: #1e3a8a; color: #ffffff; font-size: 11px;">
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; width: 10%;">QNTD</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; width: 10%;">ITEM</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left; width: 35%;">TEXTO BREVE</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; width: 25%;">MARCA</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; width: 20%;">MODELO</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">2</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">UND</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: left; font-weight: bold;">ANTENA DO RÁDIO</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">PANORAMA ANTENNAS</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">EBF-S4-5BL</td>
          </tr>
          <tr>
            <td style="background-color: #1e3a8a; color: #ffffff; font-weight: bold; padding: 10px; text-align: center; vertical-align: middle;">
              Observações
            </td>
            <td colspan="4" style="padding: 10px; border: 1px solid #cbd5e1; font-size: 11px; line-height: 1.6;">
              <strong>D026319</strong><br/>
              ESPECIFICAÇÕES TÉCNICAS:<br/>
              - FREQUÊNCIA: 450-470 MHZ<br/>
              - GANHO: 2dBi<br/>
              - IMPEDÂNCIA: 50 OHM<br/>
              - POLARIZAÇÃO: VERTICAL<br/>
              - RADIAÇÃO: OMNIDIRECIONAL<br/>
              - POTÊNCIA MÁXIMA: 50W<br/>
              - CABO: URM76, 5MM<br/>
              - CONECTOR: BNC MACHO
            </td>
          </tr>
        </tbody>
      </table>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; margin-top: 12px;">
        <h4 style="font-weight: bold; font-size: 12px; margin-bottom: 6px;">Itens para Cotação:</h4>
        <p style="margin: 0; font-weight: bold;">1 UND - CABO USB</p>
        <ul style="margin: 4px 0 0 16px; padding: 0; font-size: 11px;">
          <li>SEPURA USB PROGRAMMING CABLE FOR SC2020 / SC2021</li>
          <li>SN: 300-01384</li>
          <li>MARCA: SEPURA</li>
        </ul>
      </div>
    `,
    suggestedItems: [
      {
        name: 'ANTENA DO RÁDIO - PANORAMA ANTENNAS (EBF-S4-5BL)',
        description: 'D026319 - Frequência: 450-470 MHz, 50 Ohm, Conector BNC Macho',
        rawSearchQuery: 'ANTENA DO RÁDIO PANORAMA ANTENNAS EBF-S4-5BL D026319 450-470 MHZ BNC',
        quantity: 2,
        unit: 'Un.',
        estimatedCost: 280.00,
        sourceUrl: 'https://lista.mercadolivre.com.br/antena-panorama-antennas-ebf-s4-5bl'
      },
      {
        name: 'CABO USB PROGRAMAÇÃO SEPURA SC2020 / SC2021',
        description: 'SEPURA USB PROGRAMMING CABLE FOR SC2020 / SC2021 - SN: 300-01384',
        rawSearchQuery: 'CABO USB SEPURA 300-01384 PROGRAMMING CABLE SC2020 SC2021',
        quantity: 1,
        unit: 'Un.',
        estimatedCost: 350.00,
        sourceUrl: 'https://lista.mercadolivre.com.br/cabo-usb-sepura-300-01384'
      }
    ]
  },
  {
    id: 'mock-email-2',
    senderName: 'Carla Vasconcelos',
    senderEmail: 'cotações@institutoeducar.org.br',
    senderCompany: 'Fundação Educacional de Tecnologia',
    deliveryLocation: 'Belo Horizonte - MG',
    subject: 'Solicitação de Preços — Smartphones Motorola & Tablets Samsung',
    date: 'Hoje às 11:45',
    snippet: 'Solicitamos cotação de 1 Smartphone Motorola Moto G35 e 1 Tablet Samsung Galaxy Tab A11...',
    unread: false,
    status: 'new',
    body: `Prezada equipe,\nFavor encaminhar proposta para os dispositivos móveis abaixo:\n\n1. Smartphone Motorola Moto G35, 5G, 128Gb, 04Gb RAM (Marca: MOTOROLA) - Quantidade: 1\n2. Galaxy Tab A11, 64gb, 4gb Ram, Tela de 8.7 (Marca: SAMSUNG) - Quantidade: 1\n\nFaturamento para 15 dias.`,
    bodyHtml: `
      <p style="margin-bottom: 12px;">Prezada equipe,</p>
      <p style="margin-bottom: 16px;">Favor encaminhar proposta para os dispositivos móveis abaixo com entrega em Belo Horizonte:</p>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
        <thead>
          <tr style="background-color: #e2e8f0; color: #1e293b; font-size: 11px;">
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; width: 12%;">Quant.</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left; width: 38%;">Item (Material)</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left; width: 25%;">Descrição detalhada do item</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; width: 25%;">Marca/ Fabricante (se houver necessidade de especificação)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">1</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: left;">Smartphone Motorola Moto G35, 5g, 128Gb, 04Gb RAM</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: left;">Motorola Moto G35</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">MOTOROLA</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">1</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: left;">Galaxy Tab A11, 64gb, 4gb Ram, Tela de 8.7</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: left;">SANSUNG TAB A11</td>
            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">SANSUNG</td>
          </tr>
        </tbody>
      </table>
      <p style="font-size: 11px; color: #64748b; margin-top: 8px;">Condições: Faturamento 15 dias, entrega inclusa.</p>
    `,
    suggestedItems: [
      {
        name: 'Smartphone Motorola Moto G35, 5G, 128Gb, 04Gb RAM - MOTOROLA',
        description: 'Motorola Moto G35 - Marca: MOTOROLA',
        rawSearchQuery: 'Smartphone Motorola Moto G35 5g 128Gb 04Gb RAM MOTOROLA',
        quantity: 1,
        unit: 'Un.',
        estimatedCost: 890.00,
        sourceUrl: 'https://lista.mercadolivre.com.br/smartphone-motorola-moto-g35'
      },
      {
        name: 'Galaxy Tab A11, 64gb, 4gb Ram, Tela de 8.7 - SAMSUNG',
        description: 'SAMSUNG TAB A11 64GB 4GB RAM',
        rawSearchQuery: 'Galaxy Tab A11 64gb 4gb Ram Tela de 8.7 SAMSUNG',
        quantity: 1,
        unit: 'Un.',
        estimatedCost: 780.00,
        sourceUrl: 'https://lista.mercadolivre.com.br/galaxy-tab-a11-64gb-4gb'
      }
    ]
  },
  {
    id: 'mock-email-3',
    senderName: 'Marcos Vinicius',
    senderEmail: 'almoxarifado@transportebrasil.com.br',
    senderCompany: 'Logística & Frotas Brasil',
    deliveryLocation: 'São Paulo - SP',
    subject: 'Cotação REQ 152332 — Peças e Rotulador Eletrônico',
    date: 'Ontem às 16:10',
    snippet: 'Solicitamos proposta para fornecimento de Caixa de setor Kombi Nakata e Rotulador Brother...',
    unread: false,
    status: 'new',
    body: `REQ: 152332\nCaixa de setor de direção da Kombi 1.4 Flex 2012 - Peça completa\nTipo: Mecânica (rosca sem fim/setor)\nMarca/Origem: NAKATA\nCódigo/Referência: 10320041S\nLubrificação: Utiliza óleo 90, com ajuste de nível superior\nAplicação: Volkswagen Kombi 1.4 (2006 - 2014)\nQTD: 1,00\n\nRotulador Eletrônico PT80 Azul – Brother\nQuantidade: 3`,
    bodyHtml: `
      <p style="margin-bottom: 12px;">Prezados fornecedores,</p>
      <p style="margin-bottom: 14px;">Solicitamos cotação dos seguintes itens com urgência:</p>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <thead>
          <tr style="background-color: #ffffff; color: #000000; font-size: 11px;">
            <th style="padding: 8px; border: 1px solid #000000; text-align: center; width: 15%;">REQ</th>
            <th style="padding: 8px; border: 1px solid #000000; text-align: center; width: 70%;">DESCRIÇÃO</th>
            <th style="padding: 8px; border: 1px solid #000000; text-align: center; width: 15%;">QTD</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 12px; border: 1px solid #000000; text-align: center; vertical-align: top; font-weight: bold;">
              152332
            </td>
            <td style="padding: 12px; border: 1px solid #000000; text-align: center; line-height: 1.6; font-size: 11px;">
              <strong>Caixa de setor de direção da Kombi 1.4 Flex 2012 - Peça completa</strong><br/>
              Tipo: Mecânica (rosca sem fim/setor).<br/>
              Marca/Origem: NAKATA<br/>
              Código/Referência: 10320041S.<br/>
              Lubrificação: Utiliza óleo 90, com ajuste de nível superior.<br/>
              Aplicação: Volkswagen Kombi 1.4 (2006 - 2014)
            </td>
            <td style="padding: 12px; border: 1px solid #000000; text-align: center; vertical-align: top; font-weight: bold;">
              1,00
            </td>
          </tr>
        </tbody>
      </table>

      <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
        <thead>
          <tr style="background-color: #ffffff; color: #1e3a8a; font-size: 11px;">
            <th style="padding: 8px; border: 1px solid #1e3a8a; text-align: center; width: 12%;">ITEM</th>
            <th style="padding: 8px; border: 1px solid #1e3a8a; text-align: center; width: 70%;">ESPECIFICAÇÃO</th>
            <th style="padding: 8px; border: 1px solid #1e3a8a; text-align: center; width: 18%;">QUANTIDADE</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 10px; border: 1px solid #1e3a8a; text-align: center; font-weight: bold;">1</td>
            <td style="padding: 10px; border: 1px solid #1e3a8a; text-align: left;">
              <p style="margin: 0 0 6px 0; font-weight: bold;">Rotulador Eletrônico PT80 Azul – Brother</p>
              <img src="https://m.media-amazon.com/images/I/71YyM5nZ0NL._AC_SL1500_.jpg" alt="Rotulador PT80 Brother" style="max-height: 90px; border-radius: 4px; border: 1px solid #e2e8f0; display: block;" />
            </td>
            <td style="padding: 10px; border: 1px solid #1e3a8a; text-align: center; font-weight: bold; font-size: 14px;">3</td>
          </tr>
        </tbody>
      </table>
    `,
    suggestedItems: [
      {
        name: 'Caixa de setor de direção da Kombi 1.4 Flex 2012 - NAKATA — Mecânica (rosca sem fim/setor) - Ref: 10320041S - Kombi 1.4 (2006-2014)',
        description: '',
        rawSearchQuery: 'Caixa de setor de direção Kombi 1.4 Flex NAKATA 10320041S Mecânica',
        quantity: 1,
        unit: 'Un.',
        itemCode: '10320041S',
        estimatedCost: 520.00,
        sourceUrl: 'https://lista.mercadolivre.com.br/caixa-direcao-kombi-10320041s-nakata'
      },
      {
        name: 'Rotulador Eletrônico PT80 Azul – Brother',
        description: 'Rotulador Portátil Brother PT80',
        rawSearchQuery: 'Rotulador Eletrônico PT80 Azul Brother',
        quantity: 3,
        unit: 'Un.',
        imageUrl: 'https://m.media-amazon.com/images/I/71YyM5nZ0NL._AC_SL1500_.jpg',
        estimatedCost: 180.00,
        sourceUrl: 'https://lista.mercadolivre.com.br/rotulador-eletronico-pt80-brother'
      }
    ]
  }
];

export const initialSentQuotes: Quote[] = [
  {
    id: 'quote-cnc-01',
    code: 'CNC 280826',
    clientCompany: 'CNC — Confederação Nacional do Comércio',
    contactPerson: 'Srta. Alexandra',
    clientEmail: 'alexandraoliveira@cnc.org.br',
    clientPhone: '',
    subject: 'Fornecimento de produtos para informática',
    city: 'Brasília',
    date: '28 de agosto de 2026',
    validityDays: '03 (três) dias ou enquanto durar o estoque.',
    paymentTerms: 'Faturado.',
    deliveryDays: 'em até 10 (dez) dias úteis após autorização de fornecimento.',
    warrantyTerms: '06 (seis) meses contra eventuais problemas de fabricação. Garantia balcão. Exceto para Monitor/Impressora/Nobreak (garantia 1 ano na rede autorizada).',
    deliveryLocation: 'Brasília',
    shippingTerms: 'Frete incluso p/ Brasília.',
    openingText: 'Em atenção ao que foi solicitado por Vossa Senhoria, enviamos proposta para fornecimento dos produtos para informática, conforme especificações e condições a seguir.',
    items: [
      {
        id: 'item-1',
        itemNumber: 1,
        productId: 'prod-1',
        name: 'Organizador de pia Tramontina Plurale',
        description: 'Organizador de pia Tramontina Plurale em plástico e aço inox',
        quantity: 3,
        unit: 'Un.',
        costPrice: 78.50,
        markupPercent: 40.12,
        unitPrice: 110.00,
        totalPrice: 330.00
      }
    ],
    totalCost: 235.50,
    totalProfit: 94.50,
    totalAmount: 330.00,
    averageMargin: 40.12,
    status: 'sent',
    createdAt: '2026-08-28T10:00:00Z',
    sentAt: '2026-08-28T10:30:00Z'
  },
  {
    id: 'quote-interativa-01',
    code: 'INTERATIVA 240826',
    clientCompany: 'Grupo Interativa',
    contactPerson: 'Srta. Gabriela',
    clientEmail: 'gabriela.silva@grupointerativa.net',
    clientPhone: '011 99930-2946',
    subject: 'Proposta Comercial — Switch HPE Aruba & Roteadores Ubiquiti',
    city: 'Brasília',
    date: '24 de agosto de 2026',
    validityDays: '03 (três) dias ou enquanto durar o estoque.',
    paymentTerms: 'Faturado.',
    deliveryDays: 'em até 10 (dez) dias após autorização de fornecimento.',
    warrantyTerms: '06 (seis) meses contra eventuais problemas de fabricação. Garantia balcão. Exceto para Monitor/Impressora/Nobreak (garantia 1 ano na rede autorizada).',
    deliveryLocation: 'São Paulo',
    shippingTerms: 'Frete incluso p/ São Paulo.',
    openingText: 'Em atenção ao que foi solicitado por Vossa Senhoria, enviamos proposta para fornecimento dos produtos para informática, conforme especificações e condições a seguir.',
    items: [
      {
        id: 'item-int-1',
        itemNumber: 1,
        name: 'Switch HPE Aruba 1930 48G 4x SFP 1/10Gbe RJ45 10/100/1000Mbp, Layer 2+ Gerenciável JL685A',
        description: '',
        quantity: 4,
        unit: 'Un.',
        costPrice: 3200.00,
        markupPercent: 36.875,
        unitPrice: 4380.00,
        totalPrice: 17520.00
      },
      {
        id: 'item-int-2',
        itemNumber: 2,
        name: 'Roteador Wireless Ubiquiti Unifi U7 Pro 5765MBPS',
        description: '',
        quantity: 1,
        unit: 'Un.',
        costPrice: 1300.00,
        markupPercent: 36.846,
        unitPrice: 1779.00,
        totalPrice: 1779.00
      },
      {
        id: 'item-int-3',
        itemNumber: 3,
        name: 'Adaptador Ubiquiti Poe Uacc-Poe+-2.5G-BR 30W',
        description: '',
        quantity: 1,
        unit: 'Un.',
        costPrice: 135.00,
        markupPercent: 40.74,
        unitPrice: 190.00,
        totalPrice: 190.00
      }
    ],
    totalCost: 14235.00,
    totalProfit: 5254.00,
    totalAmount: 19489.00,
    averageMargin: 36.91,
    status: 'sent',
    createdAt: '2026-08-24T16:44:00Z',
    sentAt: '2026-08-24T17:00:00Z'
  }
];

export const initialClientCompanies: ClientCompany[] = [
  {
    id: 'comp-ubec',
    name: 'Universidade Brasileira de Educação Católica - UBEC',
    defaultDeliveryLocation: 'Brasília',
    locations: [
      'Brasília',
      'Coronel Fabriciano',
      'Joinville',
      'Itabira'
    ],
    lastUsed: '2026-09-03T12:00:00Z',
    contacts: [
      {
        id: 'cont-alex-ubec',
        name: 'Alex Pereira da Silva Vasconcellos',
        title: 'Sr.',
        email: 'alex.vasconcellos@ubec.edu.br',
        phone: '(61) 3403-2944',
        role: 'Comprador',
        location: 'Brasília',
        lastUsed: '2026-09-03T12:00:00Z'
      },
      {
        id: 'cont-rafael-ubec',
        name: 'Rafael Costa',
        title: 'Sr.',
        email: 'rafael.costa@ubec.edu.br',
        phone: '(61) 3403-2900',
        role: 'Comprador',
        location: 'Coronel Fabriciano'
      }
    ]
  },
  {
    id: 'comp-pauloctavio',
    name: 'Casa Shopping Paulo Octávio',
    defaultDeliveryLocation: 'Brasília',
    locations: [
      'Brasília',
      'Taguatinga',
      'Águas Claras'
    ],
    lastUsed: '2026-09-03T11:49:00Z',
    contacts: [
      {
        id: 'cont-marcelo-pauloctavio',
        name: 'Marcelo Mattos',
        title: 'Sr.',
        email: 'marcelo.mattos@casashoppingpauloctavio.com',
        phone: '(61) 3218-4000',
        role: 'Comprador',
        location: 'Brasília',
        lastUsed: '2026-09-03T11:49:00Z'
      }
    ]
  },
  {
    id: 'comp-cnc',
    name: 'CNC — Confederação Nacional do Comércio',
    defaultDeliveryLocation: 'Brasília',
    locations: [
      'Brasília',
      'Rio de Janeiro',
      'São Paulo'
    ],
    lastUsed: '2026-08-28T10:00:00Z',
    contacts: [
      {
        id: 'cont-alexandra-cnc',
        name: 'Alexandra Oliveira',
        title: 'Srta.',
        email: 'alexandraoliveira@cnc.org.br',
        phone: '(61) 3033-0000',
        role: 'Compradora',
        location: 'Brasília',
        lastUsed: '2026-08-28T10:00:00Z'
      }
    ]
  },
  {
    id: 'comp-inframerica',
    name: 'Inframerica Concessionária do Aeroporto de Brasília',
    defaultDeliveryLocation: 'Brasília',
    locations: [
      'Brasília',
      'Natal'
    ],
    lastUsed: '2026-08-20T10:00:00Z',
    contacts: [
      {
        id: 'cont-paulo-infra',
        name: 'Paulo Silva',
        title: 'Sr.',
        email: 'compras@inframerica.aero',
        phone: '(61) 3364-9000',
        role: 'Comprador Sênior',
        location: 'Brasília'
      },
      {
        id: 'cont-mariana-infra',
        name: 'Mariana Duarte',
        title: 'Srta.',
        email: 'mariana.duarte@inframerica.aero',
        phone: '(61) 3364-9015',
        role: 'Suprimentos & TI',
        location: 'Brasília'
      }
    ]
  },
  {
    id: 'comp-terraco',
    name: 'Condomínio Shopping Terraço',
    defaultDeliveryLocation: 'Brasília',
    locations: [
      'Brasília'
    ],
    lastUsed: '2026-08-25T10:00:00Z',
    contacts: [
      {
        id: 'cont-compras-terraco',
        name: 'Equipe de Suprimentos',
        title: 'Sr.',
        email: 'suprimentos@terraco.com.br',
        phone: '(61) 3403-2944',
        role: 'Comprador',
        location: 'Brasília'
      }
    ]
  }
];
