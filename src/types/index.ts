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
  shippingCost?: number;
  dollarPrice?: number;
}

export interface SupplierOffer {
  id: string;
  supplier: string;
  costPrice: number;
  deliveryDays?: number;
  stock?: number;
  sourceUrl?: string;
  notes?: string;
  isSelected?: boolean;
}

export interface QuoteItem {
  id: string;
  productId?: string;
  itemNumber: number;
  name: string;
  description: string;
  rawSearchQuery?: string;
  category?: string;
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
  alternativeOffers?: SupplierOffer[];
  // Campos de Aprovação Parcial e Central de Compras
  approved?: boolean;
  approvedQuantity?: number;
  purchaseStatus?: 'pending' | 'purchased' | 'delivered';
  actualCostPrice?: number;
  actualUnitCostPrice?: number;
  actualPurchaseUrl?: string;
  actualShippingCost?: number;
  shippingPending?: boolean;
  paymentMethod?: string;
  purchasedAt?: string;
  purchaseNotes?: string;
  actualTaxPercent?: number;
  clientOrderNumber?: string; // Número da Ordem de Compra / Pedido do Cliente / AF
}

export interface Quote {
  id: string;
  code: string;
  clientOrderNumber?: string; // Número da Ordem de Compra / Pedido do Cliente / AF
  clientCompany: string;
  contactPerson: string;
  clientEmail: string;
  recipientEmails?: string;
  ccEmails?: string;
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
  showShippingInProposal?: boolean;
  observations?: string;
  openingText: string;
  showProductImages?: boolean;
  items: QuoteItem[];
  totalCost: number;
  totalShipping?: number;
  totalTaxes?: number;
  totalProfit: number;
  totalAmount: number;
  averageMargin: number;
  globalMarkupPercent?: number;
  globalTaxPercent?: number;
  globalShipping?: number;
  status: 'draft' | 'sent' | 'negotiating' | 'approved' | 'rejected' | 'lost';
  createdAt: string;
  sentAt?: string;
  followUpAt?: string;
  lastFollowUpSentAt?: string;
  notes?: string;
  // Campos de aprovação e fechamento parcial
  approvedTotalAmount?: number;
  approvedAt?: string;
}

export interface ProcurementItem {
  id: string; // unique item id
  quoteId: string;
  quoteCode: string;
  clientOrderNumber?: string; // Número da Ordem de Compra do Cliente
  clientCompany: string;
  contactPerson?: string;
  approvedAt?: string;
  itemId: string;
  productId?: string;
  name: string;
  description?: string;
  partNumber?: string;
  ncm?: string;
  imageUrl?: string;
  quantity: number;
  unit: string;
  quotedCostPrice: number;
  quotedUnitPrice: number;
  quotedTotalPrice: number;
  supplier?: string;
  sourceUrl?: string;
  
  // Dados reais de compra
  purchaseStatus: 'pending' | 'purchased' | 'delivered';
  actualCostPrice?: number;
  actualUnitCostPrice?: number;
  actualPurchaseUrl?: string;
  actualShippingCost?: number;
  shippingPending?: boolean;
  paymentMethod?: string;
  purchasedAt?: string;
  purchaseNotes?: string;
  taxPercent: number; // padrão 9.05%
  isDirectPurchase?: boolean;
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
    unitPrice?: number;
    markupPercent?: number;
    sourceUrl?: string;
  }[];
}

export interface CompanySettings {
  id?: string;
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
  dailyDollarRate?: number;
  googleWorkspaceConnected: boolean;
  googleAccountEmail: string;
  registeredCategories?: string[];
  registeredUnits?: string[];
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
  prefix?: 'À' | 'Ao' | string;
  contacts: ClientContact[];
  defaultDeliveryLocation?: string;
  defaultPaymentTerms?: string;
  defaultDeliveryDays?: string;
  defaultWarrantyTerms?: string;
  locations?: string[];
  lastUsed?: string;
  logoUrl?: string;
  website?: string;
}

export interface DiscoveredProduct {
  id: string;
  originalQuery: string;
  standardizedName: string;
  brand?: string;
  manufacturer?: string;
  model?: string;
  partNumber?: string;
  category?: string;
  ncm?: string;
  quantity: number;
  unit: string;
  confidence?: number | string;
  // 360° Infodesk Store Enrichment
  description?: string;
  specifications?: Array<{ label: string; value: string }>;
  weight?: string;
  dimensions?: string;
  suggestedPrice?: number;
  costPrice?: number;
  ean?: string;
  images?: string[];
  imageUrl?: string;
  selectedImageIndex?: number;
  customerPhotoUrl?: string;
  visualInspection?: string;
  visualSearchQuery?: string;
  visualSearchQueryAlt?: string;
  visualSearchQueryEn?: string;
  negativeKeywords?: string[];
  productBoundingBox?: { ymin: number; xmin: number; ymax: number; xmax: number };
  supplier?: string;
  sourceUrl?: string;
}


