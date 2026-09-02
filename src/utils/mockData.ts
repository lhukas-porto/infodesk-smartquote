import { CompanySettings, IncomingEmail, Product, Quote } from '../types';

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
  defaultMarkupPercent: 35,
  defaultTaxPercent: 6,
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

export const initialEmails: IncomingEmail[] = [];

export const initialSentQuotes: Quote[] = [
  {
    id: 'quote-cnc-01',
    code: 'CNC 280826',
    clientCompany: 'CNC — Confederação Nacional do Comércio',
    contactPerson: 'Sra. Alexandra',
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
