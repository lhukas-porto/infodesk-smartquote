export interface Product {
  id: string;
  sku: string;
  partNumber?: string;
  ncm?: string;
  name: string;
  description: string;
  category: string;
  costPrice: number;
  unit: string;
  supplier?: string;
  stock?: number;
  lastUpdated: string;
  sourceUrl?: string;
  imageUrl?: string;
}

export interface QuoteItem {
  id: string;
  productId?: string;
  itemNumber: number;
  name: string;
  description: string;
  rawSearchQuery?: string;
  partNumber?: string;
  ncm?: string;
  imageUrl?: string;
  showImage?: boolean;
  quantity: number;
  unit: string;
  costPrice: number;
  shippingCost?: number;
  taxPercent?: number;
  markupPercent: number;
  unitPrice: number;
  totalPrice: number;
  sourceUrl?: string;
  supplier?: string;
  dollarPrice?: number;
}

export interface Quote {
  id: string;
  code: string;
  clientCompany: string;
  contactPerson: string;
  clientEmail: string;
  clientPhone: string;
  subject: string;
  city: string;
  date: string;
  validityDays: string;
  paymentTerms: string;
  deliveryDays: string;
  warrantyTerms: string;
  deliveryLocation?: string;
  shippingTerms?: string;
  openingText: string;
  showProductImages?: boolean;
  items: QuoteItem[];
  totalCost: number;
  totalShipping?: number;
  totalTaxes?: number;
  totalProfit: number;
  totalAmount: number;
  averageMargin: number;
  globalTaxPercent?: number;
  globalShipping?: number;
  status: 'draft' | 'sent' | 'approved' | 'rejected';
  createdAt: string;
  sentAt?: string;
}

export interface IncomingEmail {
  id: string;
  threadId?: string;
  senderName: string;
  senderEmail: string;
  senderCompany: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  bodyHtml?: string;
  senderPhone?: string;
  deliveryLocation?: string;
  unread: boolean;
  status: 'new' | 'parsed' | 'quoted' | 'ignored';
  suggestedItems: {
    name: string;
    description: string;
    rawSearchQuery?: string;
    partNumber?: string;
    itemCode?: string;
    ncm?: string;
    imageUrl?: string;
    quantity: number;
    unit: string;
    estimatedCost?: number;
    sourceUrl?: string;
  }[];
}

export interface CompanySettings {
  companyName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  address: string;
  cityState: string;
  phone: string;
  whatsapp: string;
  email: string;
  representativeName: string;
  defaultValidityDays: string;
  defaultPaymentTerms: string;
  defaultDeliveryDays: string;
  defaultWarrantyTerms: string;
  defaultShippingTerms?: string;
  defaultOpeningText: string;
  defaultMarkupPercent: number;
  defaultTaxPercent: number;
  defaultShippingCost: number;
  googleWorkspaceConnected: boolean;
  googleAccountEmail: string;
}

export interface WebSearchResult {
  id: string;
  title: string;
  specs: string;
  partNumber?: string;
  ncm?: string;
  imageUrl?: string;
  estimatedCost: number;
  suggestedMarkup: number;
  supplier: string;
  rating: number;
  availability: string;
  category: string;
  url?: string;
}

export interface ClientContact {
  id: string;
  name: string;
  title?: string;
  email: string;
  phone?: string;
  role?: string;
  location?: string;
  lastUsed?: string;
}

export interface ClientCompany {
  id: string;
  name: string;
  contacts: ClientContact[];
  defaultDeliveryLocation?: string;
  locations?: string[];
  lastUsed?: string;
}
