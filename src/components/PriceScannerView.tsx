import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Sparkles,
  Plus,
  Check,
  ExternalLink,
  Image as ImageIcon,
  Camera,
  FileText,
  X,
  Percent,
  ChevronDown,
  Trash2,
  Zap,
  CheckCircle2,
  Printer,
  ListChecks,
  CheckSquare,
  Square,
  DollarSign,
  ArrowRight,
  Receipt,
  Database,
  RefreshCw
} from 'lucide-react';
import { extractDataFromQuotationImage } from '../services/imageQuoteParser';
import { Product, QuoteItem } from '../types';
import {
  cleanAlphanumericCode,
  cleanNcmCode,
  applyTextCase,
  WordCaseStyle,
  buildCompleteProductDescription,
  buildDirectPurchaseUrl,
  normalizeSearchText,
  normalizeToOfficialCategory
} from '../utils/aiEmailParser';
import {
  DiscoveredProduct,
  ScannedPriceResult,
  BatchScanProgress,
  parsePastedProductList,
  runBatchPhase2Scan,
  phase1DiscoverProductsFromText
} from '../services/priceScannerService';
import { WebImagePickerModal } from './WebImagePickerModal';
import { 
  findRecentPriceByPartNumber, 
  savePriceToCache, 
  CachedPriceOffer 
} from '../services/priceCacheService';
import { auditProductOfferCompatibility } from '../utils/specAuditService';
import { reportError } from '../services/errorReporter';

export interface CatalogMatchInfo {
  product: Product;
  score: number; // 0 a 100
  reason: 'part_number' | 'sku' | 'exact_name' | 'high_similarity' | 'moderate_similarity';
  details: string;
}

// Lista rica e categorizada de marcas das 15 categorias oficiais
const KNOWN_BRANDS = [
  // Redes, Conectividade & TI
  'intelbras', 'furukawa', 'sohoplus', 'nexans', 'logitech', 'dell', 'lenovo', 'hp', 'samsung', 'lg',
  'tp-link', 'tplink', 'ubiquiti', 'mikrotik', 'd-link', 'dlink', 'cisco', 'huawei', 'aruba',
  'kingston', 'sandisk', 'seagate', 'western digital', 'wd', 'adata', 'corsair', 'crucial', 'lexar',
  'apple', 'motorola', 'xiaomi', 'asus', 'acer', 'multilaser', 'fortrek', 'redragon', 'aquario', 'aquário',
  // Energia & Nobreaks
  'sms', 'ragtech', 'ts shara', 'apc', 'lacerda', 'mcm', 'duracell', 'rayovac',
  // Impressão & Automação Comercial
  'zebra', 'argox', 'elgin', 'bematech', 'honeywell', 'datalogic', 'brother', 'epson', 'canon', 'gertec', 'dymo',
  // Eletrodomésticos, Refrigeração, Beleza & Copa
  'wolff', 'rojemac', 'brinox', 'mondial', 'taiff', 'gama', 'ga.ma', 'lizze', 'britania', 'britânia', 'oster', 'philco', 'electrolux', 'consul',
  'cadence', 'invicta', 'sanremo', 'coza', 'marinex', 'nadir', 'oxford', 'tramontina', 'dako', 'atlas', 'fame',
  'arno', 'panasonic', 'walita', 'midea', 'brastemp', 'sugar', 'colormaq', 'conair', 'babyliss', 'mallory',
  // Ferramentas & Instrumentos de Medição
  'bosch', 'makita', 'dewalt', 'vonder', 'gedore', 'irwin', 'stanley', 'dwt', 'minipa', 'fluke', 'western',
  'fertak', 'sparta', 'worker', 'starrett', 'sata', 'belzer', 'rocast',
  // Elétrica & Iluminação
  'schneider', 'siemens', 'weg', 'abb', 'pial', 'legrand', 'steck', 'corfio', 'sil', 'prysmian', 'lorenzetti',
  'ourolux', 'taschibra', 'osram', 'philips', 'avant', 'g-light', 'blumenau',
  // Construção, Acabamento & Marcenaria
  'quartzolit', 'votoran', 'ciser', 'tigre', 'amanco', 'krona', 'deca', 'docol', 'coral', 'suvinil',
  'sherwin williams', 'anjo', 'placo', 'knauf', 'barbieri', 'tarkett', '3m', 'norton',
  // Papelaria, Artes & Escritório
  'acrilex', 'faber-castell', 'faber castell', 'bic', 'compactor', 'pilot', 'chamex', 'suzano', 'report',
  'tilibra', 'spiral', 'molin', 'cis', 'stabilo', 'pentel', 'post-it',
  // Limpeza, Higiene & Descartáveis
  'kimberly-clark', 'kimberly', 'premis', 'elite', 'ype', 'ypê', 'veja', 'lysoform', 'bombril', 'bettanin', 'santher'
];

function extractBrandToken(text: string): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  for (const b of KNOWN_BRANDS) {
    const cleanB = b.replace('-', '[- ]?');
    if (new RegExp(`\\b${cleanB}\\b`, 'i').test(lower)) {
      return b.replace(/[^a-z0-9]/gi, '');
    }
  }
  return '';
}

export function resolveBrand(
  brandField?: string,
  name?: string,
  description?: string,
  supplierField?: string,
  manufacturerField?: string
): string {
  // 1. Marca conhecida detectada no nome do produto (fonte de maior precisão e confiabilidade)
  const brandInName = extractBrandToken(name || '');
  if (brandInName) return brandInName;

  // 2. Campo brand direto, verificando se contém marca conhecida ou nome limpo
  if (brandField && brandField.trim()) {
    const knownInBrand = extractBrandToken(brandField);
    if (knownInBrand) return knownInBrand;
    const cleanBrand = brandField.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanBrand.length >= 3 && !/^(generico|importado|fabricante|fornecedor|padrao|marca|diversos|distribuidora)$/i.test(cleanBrand)) {
      return cleanBrand;
    }
  }

  // 3. Marca conhecida na descrição
  const brandInDesc = extractBrandToken(description || '');
  if (brandInDesc) return brandInDesc;

  // 4. Marca conhecida no fabricante ou fornecedor
  const brandInManuf = extractBrandToken(manufacturerField || '');
  if (brandInManuf) return brandInManuf;

  const brandInSupplier = extractBrandToken(supplierField || '');
  if (brandInSupplier) return brandInSupplier;

  return '';
}

function normalizeMatchingString(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[–—_/-]/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PRODUCT_STOPWORDS = new Set([
  'de', 'do', 'da', 'dos', 'das', 'com', 'em', 'para', 'por', 'sem', 'sob', 'sobre',
  'e', 'ou', 'um', 'uma', 'uns', 'umas', 'o', 'a', 'os', 'as', 'no', 'na', 'nos', 'nas',
  'ao', 'aos', 'pelo', 'pela', 'pelos', 'pelas', 'pro', 'pra', 'pros', 'pras',
  'tipo', 'modelo', 'mod', 'ref', 'referencia', 'linha', 'serie',
  'un', 'uni', 'unid', 'unidade', 'unidades', 'kit', 'cx', 'caixa', 'pct', 'pacote',
  'peca', 'pecas', 'novo', 'nova', 'original', 'profissional', 'padrao', 'item', 'marca'
]);

function canonicalizeToken(token: string): string {
  if (token === 'aco' || token === 'acoinox') return 'inox';
  if (token === 'wireless' || token === 'semfio') return 'semfio';
  if (token === 'bivolts' || token === '110v220v' || token === '127v220v') return 'bivolt';
  if (token === 'mililitros' || token === 'mililitro' || token === 'mls') return 'ml';
  if (token === 'litros' || token === 'litro' || token === 'lts') return 'l';
  if (token === 'gramas' || token === 'grama' || token === 'grs' || token === 'gr') return 'g';
  if (token === 'quilos' || token === 'quilo' || token === 'kilos' || token === 'kilo') return 'kg';
  if (token === 'gigabytes' || token === 'gigabyte') return 'gb';
  if (token === 'terabytes' || token === 'terabyte') return 'tb';
  if (token === 'portas' || token === 'porta') return 'p';
  if (token === 'polegadas' || token === 'polegada') return 'pol';
  return token;
}

function tokenizeProductText(text: string): string[] {
  const norm = normalizeMatchingString(text);
  const treated = norm
    .replace(/\baco inox\b/g, 'inox')
    .replace(/\bsem fio\b/g, 'semfio')
    .replace(/\b(\d+)\s*(ml|l|g|kg|gb|tb|mb|p|portas|pol|v|w|watts|watt|a|mah)\b/g, '$1$2');

  const words = treated.split(/\s+/).filter(w => w.length >= 2);
  const result: string[] = [];
  for (const w of words) {
    if (!PRODUCT_STOPWORDS.has(w)) {
      result.push(canonicalizeToken(w));
    }
  }
  return result;
}

function extractTechnicalSpecs(tokens: string[]): {
  volume?: string;
  storage?: string;
  voltage?: string;
  power?: string;
  ports?: string;
} {
  const specs: { volume?: string; storage?: string; voltage?: string; power?: string; ports?: string } = {};
  for (const t of tokens) {
    if (/^\d+(?:\.\d+)?(ml|l)$/.test(t)) {
      specs.volume = t;
    } else if (/^\d+(gb|tb|mb)$/.test(t)) {
      specs.storage = t;
    } else if (/^(110v|127v|220v|bivolt|12v|24v)$/.test(t)) {
      specs.voltage = t;
    } else if (/^\d+w$/.test(t)) {
      specs.power = t;
    } else if (/^\d+p$/.test(t)) {
      specs.ports = t;
    }
  }
  return specs;
}

function extractCoreNoun(tokens: string[], brand: string): string {
  const brandClean = brand.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const t of tokens) {
    if (brandClean && t.includes(brandClean)) continue;
    if (/^\d+/.test(t)) continue;
    if (/^(preto|preta|branco|branca|inox|azul|cinza|transparente|fosco|fosca|claro|escuro|aco)$/.test(t)) continue;
    return t;
  }
  return tokens[0] || '';
}

export function findCatalogMatchDetails(
  prod: { 
    partNumber?: string; 
    sku?: string; 
    standardizedName?: string; 
    name?: string; 
    ncm?: string; 
    brand?: string; 
    manufacturer?: string; 
    model?: string; 
    description?: string; 
  },
  catalog: Product[] = []
): CatalogMatchInfo | null {
  if (!catalog || catalog.length === 0) return null;

  const targetPn = cleanAlphanumericCode(prod.partNumber || '');
  const targetSku = cleanAlphanumericCode(prod.sku || '');
  const targetRawName = prod.standardizedName || prod.name || '';
  const targetNameNorm = normalizeSearchText(targetRawName);
  const targetBrand = resolveBrand(prod.brand, targetRawName, prod.description, undefined, prod.manufacturer);
  const targetTokens = tokenizeProductText(targetRawName);
  const targetSpecs = extractTechnicalSpecs(targetTokens);
  const targetCoreNoun = extractCoreNoun(targetTokens, targetBrand);

  const isGenericCode = (code: string) => /^(antint|prod|item|peca|un|kit|cx|pct|01|02|03|1234|ref|padrao|default)$/i.test(code);

  // 1. Part Number do Fabricante Exato (100% de precisão)
  if (targetPn && targetPn.length >= 4 && !isGenericCode(targetPn)) {
    const byPn = catalog.find(p => {
      const pPn = cleanAlphanumericCode(p.partNumber || '');
      const pSku = cleanAlphanumericCode(p.sku || '');
      const codeMatches = (pPn && pPn === targetPn) || (pSku && pSku === targetPn);
      if (!codeMatches) return false;
      const pBrand = resolveBrand(undefined, p.name, p.description, p.supplier);
      if (targetBrand && pBrand && targetBrand !== pBrand && targetBrand.length > 2 && pBrand.length > 2) {
        return false;
      }
      return true;
    });
    if (byPn) {
      return {
        product: byPn,
        score: 100,
        reason: 'part_number',
        details: `Part Number idêntico: ${targetPn}`
      };
    }
  }

  // 2. SKU do Catálogo Exato (100% de precisão)
  if (targetSku && targetSku.length >= 4 && !isGenericCode(targetSku)) {
    const bySku = catalog.find(p => {
      const pSku = cleanAlphanumericCode(p.sku || '');
      const pPn = cleanAlphanumericCode(p.partNumber || '');
      const skuMatches = (pSku && pSku === targetSku) || (pPn && pPn === targetSku);
      if (!skuMatches) return false;
      const pBrand = resolveBrand(undefined, p.name, p.description, p.supplier);
      if (targetBrand && pBrand && targetBrand !== pBrand && targetBrand.length > 2 && pBrand.length > 2) {
        return false;
      }
      return true;
    });
    if (bySku) {
      return {
        product: bySku,
        score: 100,
        reason: 'sku',
        details: `Código SKU idêntico: ${targetSku}`
      };
    }
  }

  // 3. Nome Completo Normalizado Idêntico (100% de precisão)
  if (targetNameNorm && targetNameNorm.length > 6) {
    const byExactName = catalog.find(p => {
      const pNameNorm = normalizeSearchText(p.name);
      if (pNameNorm !== targetNameNorm) return false;
      const pBrand = resolveBrand(undefined, p.name, p.description, p.supplier);
      if (targetBrand && pBrand && targetBrand !== pBrand && targetBrand.length > 2 && pBrand.length > 2) {
        return false;
      }
      return true;
    });
    if (byExactName) {
      return {
        product: byExactName,
        score: 100,
        reason: 'exact_name',
        details: 'Título do produto 100% idêntico'
      };
    }
  }

  // 4. Comparador Semântico Avançado por Similaridade Ponderada
  if (targetTokens.length < 2) return null;

  let bestMatch: { product: Product; score: number; details: string } | null = null;

  for (const catProd of catalog) {
    const catTokens = tokenizeProductText(catProd.name + ' ' + (catProd.description || ''));
    if (catTokens.length < 2) continue;

    const catBrand = resolveBrand(undefined, catProd.name, catProd.description, catProd.supplier);
    const catSpecs = extractTechnicalSpecs(catTokens);
    const catCoreNoun = extractCoreNoun(catTokens, catBrand);

    // Regra Eliminatória 1: Conflito de Marcas Conhecidas
    // Só descarta se AMBAS forem marcas válidas identificadas e manifestamente distintas
    if (targetBrand && catBrand && targetBrand.length >= 3 && catBrand.length >= 3 && targetBrand !== catBrand) {
      const catTextNorm = normalizeMatchingString(catProd.name + ' ' + (catProd.description || ''));
      const targetTextNorm = normalizeMatchingString(targetRawName + ' ' + (prod.description || ''));
      // Se um dos textos citar a marca do outro, não é conflito
      if (!catTextNorm.includes(targetBrand) && !targetTextNorm.includes(catBrand)) {
        continue;
      }
    }

    // Regra Eliminatória 2: Conflito de Especificação Crítica
    let hasSpecConflict = false;
    if (targetSpecs.volume && catSpecs.volume && targetSpecs.volume !== catSpecs.volume) hasSpecConflict = true;
    if (targetSpecs.storage && catSpecs.storage && targetSpecs.storage !== catSpecs.storage) hasSpecConflict = true;
    if (targetSpecs.ports && catSpecs.ports && targetSpecs.ports !== catSpecs.ports) hasSpecConflict = true;
    if (targetSpecs.power && catSpecs.power && targetSpecs.power !== catSpecs.power) hasSpecConflict = true;
    if (targetSpecs.voltage && catSpecs.voltage) {
      const isTargetBivolt = targetSpecs.voltage === 'bivolt';
      const isCatBivolt = catSpecs.voltage === 'bivolt';
      if (!isTargetBivolt && !isCatBivolt && targetSpecs.voltage !== catSpecs.voltage) {
        hasSpecConflict = true;
      }
    }
    if (hasSpecConflict) continue;

    // Regra Eliminatória 3: Conflito de Núcleo (Substantivo principal)
    if (targetCoreNoun && catCoreNoun && targetCoreNoun.length >= 4 && catCoreNoun.length >= 4 && targetCoreNoun !== catCoreNoun) {
      if (!targetCoreNoun.includes(catCoreNoun) && !catCoreNoun.includes(targetCoreNoun)) {
        continue;
      }
    }

    // CÁLCULO DE SCORE
    let score = 0;
    const matchReasons: string[] = [];

    // A. Pontuação de Marca (até 35 pts)
    const catTextNorm = normalizeMatchingString(catProd.name + ' ' + (catProd.description || ''));
    const targetTextNorm = normalizeMatchingString(targetRawName + ' ' + (prod.description || ''));
    const brandsMatch = (targetBrand && catBrand && targetBrand === catBrand) || 
                        (targetBrand && catTextNorm.includes(targetBrand)) ||
                        (catBrand && targetTextNorm.includes(catBrand));

    if (brandsMatch) {
      score += 35;
      matchReasons.push(`Marca ${(targetBrand || catBrand).toUpperCase()}`);
    } else if (!targetBrand || !catBrand) {
      score += 15;
    }

    // B. Pontuação de Núcleo (até 25 pts)
    if (targetCoreNoun && catCoreNoun && (targetCoreNoun === catCoreNoun || targetCoreNoun.includes(catCoreNoun) || catCoreNoun.includes(targetCoreNoun))) {
      score += 25;
      matchReasons.push(`Núcleo "${targetCoreNoun}"`);
    } else {
      score += 10;
    }

    // C. Pontuação de Especificações Coincidentes (até 15 pts)
    let specBonus = 0;
    if (targetSpecs.volume && catSpecs.volume && targetSpecs.volume === catSpecs.volume) {
      specBonus += 10;
      matchReasons.push(`Vol: ${targetSpecs.volume}`);
    }
    if (targetSpecs.storage && catSpecs.storage && targetSpecs.storage === catSpecs.storage) {
      specBonus += 10;
      matchReasons.push(`Cap: ${targetSpecs.storage}`);
    }
    if (targetSpecs.ports && catSpecs.ports && targetSpecs.ports === catSpecs.ports) {
      specBonus += 10;
      matchReasons.push(`Portas: ${targetSpecs.ports}`);
    }
    if (targetSpecs.power && catSpecs.power && targetSpecs.power === catSpecs.power) {
      specBonus += 10;
      matchReasons.push(`Potência: ${targetSpecs.power}`);
    }
    if (targetSpecs.voltage && catSpecs.voltage && (targetSpecs.voltage === catSpecs.voltage || targetSpecs.voltage === 'bivolt' || catSpecs.voltage === 'bivolt')) {
      specBonus += 10;
      matchReasons.push(`Tensão: ${targetSpecs.voltage}`);
    }
    if (specBonus === 0 && !targetSpecs.volume && !targetSpecs.storage && !targetSpecs.ports && !targetSpecs.power && !targetSpecs.voltage) {
      specBonus = 10;
    }
    score += Math.min(15, specBonus);

    // D. Cobertura de Tokens do Catálogo no Alvo (até 25 pts)
    const catNameTokens = tokenizeProductText(catProd.name);
    const sharedTokens = catNameTokens.filter(t => targetTokens.includes(t));
    const coverageRatio = catNameTokens.length > 0 ? (sharedTokens.length / catNameTokens.length) : 0;
    
    score += Math.round(coverageRatio * 25);
    if (coverageRatio >= 0.75) {
      matchReasons.push('Alta sobreposição');
    }

    const finalScore = Math.min(98, Math.max(0, score));

    if (finalScore >= 60) {
      if (!bestMatch || finalScore > bestMatch.score) {
        bestMatch = {
          product: catProd,
          score: finalScore,
          details: `${finalScore}% similar (${matchReasons.join(' + ')})`
        };
      }
    }
  }

  if (bestMatch) {
    return {
      product: bestMatch.product,
      score: bestMatch.score,
      reason: bestMatch.score >= 75 ? 'high_similarity' : 'moderate_similarity',
      details: bestMatch.details
    };
  }

  return null;
}

export function findExistingCatalogProduct(
  prod: { 
    partNumber?: string; 
    sku?: string; 
    standardizedName?: string; 
    name?: string; 
    ncm?: string; 
    brand?: string; 
    manufacturer?: string; 
    model?: string; 
    description?: string;
  },
  catalog: Product[] = []
): Product | null {
  const match = findCatalogMatchDetails(prod, catalog);
  return match && match.score >= 60 ? match.product : null;
}

interface PriceScannerViewProps {
  products?: Product[];
  onAddToQuote: (item: Partial<QuoteItem>) => void;
  onStartNewQuoteWithItems?: (items: Partial<QuoteItem>[]) => void;
  onSaveToCatalog: (prod: Product) => void;
  onNavigateToQuote?: () => void;
  quoteItemsCount?: number;
  initialQuery?: string;
  targetItemIndex?: number | null;
  onUpdateQuoteItem?: (index: number, updatedData: Partial<QuoteItem>) => void;
  existingItem?: Partial<QuoteItem> | null;
  onScanningStateChange?: (isScanning: boolean) => void;
}

export const PriceScannerView: React.FC<PriceScannerViewProps> = ({
  products = [],
  onAddToQuote,
  onStartNewQuoteWithItems,
  onSaveToCatalog,
  onNavigateToQuote,
  quoteItemsCount = 0,
  initialQuery = '',
  targetItemIndex = null,
  onUpdateQuoteItem,
  existingItem = null,
  onScanningStateChange
}) => {
  // Batch / Search Input
  const [batchRawInput, setBatchRawInput] = useState(initialQuery);
  const [isScanningBatch, setIsScanningBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchScanProgress | null>(null);
  const [batchResults, setBatchResults] = useState<ScannedPriceResult[]>([]);
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(new Set());

  // Fase 1: Dedução Técnica 360° (Padrão Infodesk Store)
  const [discoveredProducts, setDiscoveredProducts] = useState<DiscoveredProduct[]>([]);
  const [isDiscoveringPhase1, setIsDiscoveringPhase1] = useState(false);
  const [phase1StatusMessage, setPhase1StatusMessage] = useState('');

  // OCR Image Transcription State
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrProgressMessage, setOcrProgressMessage] = useState('');
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [ocrEditableText, setOcrEditableText] = useState('');
  const [ocrImagePreview, setOcrImagePreview] = useState<string | null>(null);
  const imageUploadInputRef = useRef<HTMLInputElement>(null);

  // Monitora se qualquer processo de identificação ou varredura está ativo
  const isScanningActive = isDiscoveringPhase1 || isScanningBatch || isOcrProcessing;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__INFODESK_SCANNER_BUSY__ = isScanningActive;
    }
    if (onScanningStateChange) {
      onScanningStateChange(isScanningActive);
    }
    return () => {
      if (typeof window !== 'undefined') {
        (window as any).__INFODESK_SCANNER_BUSY__ = false;
      }
      if (onScanningStateChange) {
        onScanningStateChange(false);
      }
    };
  }, [isScanningActive, onScanningStateChange]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isScanningActive) {
        e.preventDefault();
        e.returnValue = 'Uma pesquisa de produto está em andamento no Scanner. Se fechar ou recarregar agora, o progresso será perdido.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isScanningActive]);

  // Fotos Reais dos Produtos com Prioridade Visual Máxima (Desejo do Comprador - Suporte a Múltiplas Fotos)
  const [attachedProductPhotos, setAttachedProductPhotos] = useState<string[]>([]);
  const productPhotoInputRef = useRef<HTMLInputElement>(null);

  // Success Feedback Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal de Conflito/Confirmação de Atualização no Catálogo
  const [catalogConflictItem, setCatalogConflictItem] = useState<{
    discovered: DiscoveredProduct;
    existing: Product;
    matchInfo?: CatalogMatchInfo;
  } | null>(null);

  // Itens salvos ou atualizados nesta sessão (para feedback imediato)
  const [savedInSessionIds, setSavedInSessionIds] = useState<Set<string>>(new Set());

  // Margem e Filtros
  const [targetMarginPercent, setTargetMarginPercent] = useState<number | null>(null);
  const [sortFilterMode, setSortFilterMode] = useState<'all' | 'lowestPrice'>('all');
  const [isCaseMenuOpen, setIsCaseMenuOpen] = useState(false);
  const [activeCaseStyle, setActiveCaseStyle] = useState<WordCaseStyle>('sentence');
  const caseMenuRef = useRef<HTMLDivElement>(null);

  // Modal de Seleção de Foto Comercial
  const [photoPickerTarget, setPhotoPickerTarget] = useState<{
    type: 'discovered' | 'batch';
    id: string;
    name: string;
    images: string[];
    currentImageUrl: string;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  const [recentCachedPrice, setRecentCachedPrice] = useState<CachedPriceOffer | null>(null);

  useEffect(() => {
    if (initialQuery) {
      setBatchRawInput(initialQuery);
    }
  }, [initialQuery]);

  // Monitora digitação para encontrar ofertas recentes no cache/histórico (MEL-02)
  useEffect(() => {
    let isMounted = true;
    const text = batchRawInput?.trim();
    if (!text || text.length < 3) {
      setRecentCachedPrice(null);
      return;
    }

    const timer = setTimeout(async () => {
      // Extrair possível part number ou código do texto digitado
      const matchPn = text.match(/\b[A-Z0-9]{3,}-[A-Z0-9]{2,}\b|\b[A-Z]{2,}[0-9]{3,}[A-Z0-9]*\b/i);
      const query = matchPn ? matchPn[0] : text;
      const cached = await findRecentPriceByPartNumber(query);
      if (isMounted) {
        setRecentCachedPrice(cached);
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [batchRawInput]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (caseMenuRef.current && !caseMenuRef.current.contains(e.target as Node)) {
        setIsCaseMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAttachProductPhotos = (filesOrBlobs: Array<File | Blob | string> | FileList) => {
    const list = Array.from(filesOrBlobs);
    if (list.length === 0) return;

    let loadedCount = 0;
    const newPhotos: string[] = [];

    list.forEach((item) => {
      if (typeof item === 'string') {
        newPhotos.push(item);
        loadedCount++;
        if (loadedCount === list.length) {
          setAttachedProductPhotos(prev => [...prev, ...newPhotos]);
          showToast(`${newPhotos.length} foto(s) de produto anexada(s) ao scanner!`);
        }
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (dataUrl) newPhotos.push(dataUrl);
          loadedCount++;
          if (loadedCount === list.length) {
            setAttachedProductPhotos(prev => [...prev, ...newPhotos]);
            showToast(`${newPhotos.length} foto(s) de produto anexada(s) ao scanner!`);
          }
        };
        reader.readAsDataURL(item);
      }
    });
  };

  const handleRemoveProductPhoto = (indexToRemove: number) => {
    setAttachedProductPhotos(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // ─── FASE 1: Identificar Produto(s) com Dedução e Engenharia Reversa ──────────
  const handleStartPhase1Discovery = async (customText?: string, customPhotos?: string[]) => {
    const textToProcess = customText !== undefined ? customText : batchRawInput;
    const photosToProcess = customPhotos !== undefined ? customPhotos : attachedProductPhotos;

    if (!textToProcess.trim() && photosToProcess.length === 0) return;

    setIsDiscoveringPhase1(true);
    setPhase1StatusMessage(
      photosToProcess.length > 0 && textToProcess.trim()
        ? `Lendo ${photosToProcess.length} imagem(ns), transcrevendo dados e cruzando com as especificações...`
        : photosToProcess.length > 0
          ? `Lendo imagem(ns), transcrevendo itens e identificando produtos com fidelidade máxima...`
          : 'Identificando itens e marcas comerciais...'
    );
    setBatchResults([]);
    setSelectedResultIds(new Set());

    let stepTimer: any = null;
    if (!photosToProcess.length) {
      let stepCount = 0;
      const steps = [
        'Identificando itens e marcas comerciais...',
        'Diferenciando especificações técnicas e NCM oficial do Brasil...',
        'Buscando fotos reais e referências de fornecedores...',
        'Montando fichas técnicas completas...'
      ];
      stepTimer = setInterval(() => {
        stepCount++;
        if (stepCount < steps.length) {
          setPhase1StatusMessage(steps[stepCount]);
        }
      }, 4500);
    }

    try {
      const discovered = await phase1DiscoverProductsFromText(textToProcess, {
        imageSources: photosToProcess,
        imageSource: photosToProcess[0] || null
      });
      setDiscoveredProducts(discovered);
      if (discovered.length > 0) {
        showToast(
          photosToProcess.length > 0 && textToProcess.trim()
            ? `Print/fotos e descrições processadas! ${discovered.length} produto(s) identificado(s)!`
            : photosToProcess.length > 0
              ? `${discovered.length} produto(s) identificado(s) a partir do print/foto!`
              : `${discovered.length} produto(s) identificado(s) com sucesso!`
        );
      }
    } catch (err) {
      reportError('Falha ao Identificar Produtos via IA', err, 'Price Scanner - Fase 1 (Dedução)');
    } finally {
      if (stepTimer) clearInterval(stepTimer);
      setIsDiscoveringPhase1(false);
      setPhase1StatusMessage('');
    }
  };

  // ─── FASE 2: Buscar Preços e Enriquecer (Sistemática Infodesk Store) ───────────
  const handleStartPhase2Enrichment = async () => {
    if (discoveredProducts.length === 0) return;

    setIsScanningBatch(true);
    setBatchProgress({ total: discoveredProducts.length, current: 0, currentProduct: '', isComplete: false });
    setBatchResults([]);
    setSelectedResultIds(new Set());

    try {
      const results = await runBatchPhase2Scan(discoveredProducts, (prog, currentRes) => {
        setBatchProgress({ ...prog });
        setBatchResults([...currentRes]);
        const newSelected = new Set<string>();
        currentRes.forEach(r => {
          if (r.bestPrice > 0) newSelected.add(r.id);
        });
        setSelectedResultIds(newSelected);
      });

      setBatchResults(results);
      const initialSelected = new Set<string>();
      results.forEach(r => {
        if (r.bestPrice > 0) initialSelected.add(r.id);
      });
      setSelectedResultIds(initialSelected);
      showToast(`Preços apurados para ${results.length} item(ns)!`);
    } catch (err) {
      reportError('Falha ao Apurar Preços dos Produtos', err, 'Price Scanner - Fase 2 (Enriquecimento e Fornecedores)');
    } finally {
      setIsScanningBatch(false);
    }
  };

  const handleUpdateDiscoveredProduct = (id: string, updates: Partial<DiscoveredProduct>) => {
    setDiscoveredProducts(prev => prev.map(p => (p.id === id ? { ...p, ...updates } : p)));
  };

  const handleRemoveDiscoveredProduct = (id: string) => {
    setDiscoveredProducts(prev => prev.filter(p => p.id !== id));
  };

  const handleSelectDiscoveredImage = (productId: string, index: number) => {
    setDiscoveredProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        selectedImageIndex: index,
        imageUrl: p.images?.[index] || p.imageUrl
      };
    }));
  };

  const handleSelectBatchResultImage = (itemId: string, index: number) => {
    setBatchResults(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const chosenImg = item.images?.[index] || item.imageUrl;
      return {
        ...item,
        selectedImageIndex: index,
        imageUrl: chosenImg
      };
    }));
  };

  const handlePhotoPicked = (newImageUrl: string) => {
    if (!photoPickerTarget) return;

    if (photoPickerTarget.type === 'discovered') {
      setDiscoveredProducts(prev => prev.map(p => {
        if (p.id !== photoPickerTarget.id) return p;
        const existingImages = p.images || [];
        const newImages = newImageUrl && !existingImages.includes(newImageUrl)
          ? [newImageUrl, ...existingImages]
          : existingImages;
        const newIndex = newImages.indexOf(newImageUrl);
        return {
          ...p,
          images: newImages,
          selectedImageIndex: newIndex >= 0 ? newIndex : 0,
          imageUrl: newImageUrl
        };
      }));
      showToast('Foto do orçamento atualizada!');
    } else if (photoPickerTarget.type === 'batch') {
      setBatchResults(prev => prev.map(item => {
        if (item.id !== photoPickerTarget.id) return item;
        const existingImages = item.images || [];
        const newImages = newImageUrl && !existingImages.includes(newImageUrl)
          ? [newImageUrl, ...existingImages]
          : existingImages;
        const newIndex = newImages.indexOf(newImageUrl);
        return {
          ...item,
          images: newImages,
          selectedImageIndex: newIndex >= 0 ? newIndex : 0,
          imageUrl: newImageUrl
        };
      }));
      showToast('Foto do orçamento atualizada!');
    }
  };

  // Inserir produto identificado individualmente na cotação
  const handleAddSingleDiscoveredToQuote = (prod: DiscoveredProduct) => {
    const chosenImage = prod.images?.[prod.selectedImageIndex || 0] || prod.imageUrl || '';
    const price = prod.suggestedPrice || (prod.costPrice ? prod.costPrice * 1.35 : 0);
    const cost = prod.costPrice || (prod.suggestedPrice ? prod.suggestedPrice / 1.35 : 0);
    const fullDesc = buildCompleteProductDescription(prod);
    const directInfo = buildDirectPurchaseUrl(prod.standardizedName, prod.sourceUrl);

    // Cruzar com catálogo existente para vincular automaticamente
    const catalogMatch = findCatalogMatchDetails(prod, products);
    const existingInCatalog = catalogMatch && catalogMatch.score >= 60 ? catalogMatch.product : null;

    const itemData: Partial<QuoteItem> = {
      productId: existingInCatalog ? existingInCatalog.id : undefined,
      name: existingInCatalog ? existingInCatalog.name : prod.standardizedName,
      description: fullDesc || prod.description || existingInCatalog?.description || '',
      partNumber: existingInCatalog?.partNumber || cleanAlphanumericCode(prod.partNumber || ''),
      ncm: existingInCatalog?.ncm || cleanNcmCode(prod.ncm || ''),
      category: existingInCatalog?.category || prod.category,
      imageUrl: chosenImage || existingInCatalog?.imageUrl,
      showImage: !!(chosenImage || existingInCatalog?.imageUrl),
      costPrice: existingInCatalog && existingInCatalog.costPrice > 0 ? existingInCatalog.costPrice : (cost > 0 ? cost : price),
      unitPrice: price > 0 ? price : undefined,
      quantity: prod.quantity || 1,
      unit: prod.unit || existingInCatalog?.unit || 'Un.',
      supplier: existingInCatalog?.supplier || prod.supplier || directInfo.store,
      sourceUrl: prod.sourceUrl || directInfo.url || existingInCatalog?.sourceUrl
    };

    if (targetItemIndex !== null && onUpdateQuoteItem) {
      onUpdateQuoteItem(targetItemIndex, itemData);
      showToast('Item atualizado na cotação com ficha técnica completa!');
      onNavigateToQuote?.();
    } else if (onStartNewQuoteWithItems) {
      onStartNewQuoteWithItems([itemData]);
      showToast(existingInCatalog 
        ? `Novo orçamento criado e vinculado ao item "${existingInCatalog.name}" do catálogo!`
        : 'Novo orçamento criado com o produto e especificações completas!');
      onNavigateToQuote?.();
    } else {
      onAddToQuote(itemData);
      showToast(existingInCatalog 
        ? `Item vinculado a "${existingInCatalog.name}" (Cód: ${existingInCatalog.sku || existingInCatalog.partNumber}) e inserido na cotação!`
        : 'Item inserido na sua cotação com ficha técnica completa!');
      onNavigateToQuote?.();
    }
  };

  // Salvar ou atualizar produto no catálogo com confirmação se já existe
  const handleRequestSaveOrUpdate = (
    prod: DiscoveredProduct,
    existing: Product | null,
    matchInfo?: CatalogMatchInfo
  ) => {
    // Se existing não foi passado explicitamente, checa pelo matching inteligente do catálogo
    const actualExisting = existing || (findCatalogMatchDetails(prod, products)?.product || null);
    const actualMatch = matchInfo || (actualExisting ? (findCatalogMatchDetails(prod, products) || undefined) : undefined);

    if (actualExisting) {
      setCatalogConflictItem({ discovered: prod, existing: actualExisting, matchInfo: actualMatch });
    } else {
      executeSaveProductToCatalog(prod, null, 'create_new');
    }
  };

  const executeSaveProductToCatalog = (
    prod: DiscoveredProduct,
    existing: Product | null,
    mode: 'update' | 'create_new'
  ) => {
    const chosenImage = prod.images?.[prod.selectedImageIndex || 0] || prod.imageUrl || '';
    const price = prod.suggestedPrice || (prod.costPrice ? prod.costPrice * 1.35 : 0);
    const cost = prod.costPrice || (prod.suggestedPrice ? prod.suggestedPrice / 1.35 : 0);
    const fullDesc = buildCompleteProductDescription(prod);
    const directInfo = buildDirectPurchaseUrl(prod.standardizedName, prod.sourceUrl);

    if (mode === 'update' && existing) {
      const updatedProd: Product = {
        ...existing,
        name: prod.standardizedName || existing.name,
        description: fullDesc || prod.description || existing.description,
        costPrice: cost > 0 ? Number(cost.toFixed(2)) : existing.costPrice,
        partNumber: cleanAlphanumericCode(prod.partNumber || '') || existing.partNumber,
        ncm: cleanNcmCode(prod.ncm || '') || existing.ncm,
        category: prod.category || existing.category,
        unit: prod.unit || existing.unit || 'Un.',
        supplier: prod.supplier || prod.brand || directInfo.store || existing.supplier,
        imageUrl: chosenImage || existing.imageUrl,
        sourceUrl: prod.sourceUrl || directInfo.url || existing.sourceUrl,
        lastUpdated: new Date().toISOString().split('T')[0]
      };
      onSaveToCatalog(updatedProd);
      setCatalogConflictItem(null);
      setSavedInSessionIds(prev => new Set(prev).add(prod.id));
      showToast(`Ficha técnica do produto "${existing.name}" atualizada com sucesso no catálogo!`);
    } else {
      const isDuplicate = Boolean(existing);
      const realPn = cleanAlphanumericCode(prod.partNumber || '');
      // Se não achar Part Number ou SKU diretamente do fabricante, deixa em branco para o Lucas preencher manualmente
      const newSku = realPn || '';

      const newProd: Product = {
        id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        sku: newSku,
        partNumber: realPn,
        ncm: cleanNcmCode(prod.ncm || ''),
        name: prod.standardizedName,
        description: fullDesc || prod.description || '',
        category: normalizeToOfficialCategory(prod.category || 'Informática, Hardware & Periféricos'),
        costPrice: cost > 0 ? Number(cost.toFixed(2)) : Number(price.toFixed(2)),
        unit: prod.unit || 'Un.',
        supplier: prod.supplier || prod.brand || directInfo.store,
        stock: 10,
        lastUpdated: new Date().toISOString().split('T')[0],
        sourceUrl: prod.sourceUrl || directInfo.url,
        imageUrl: chosenImage
      };
      onSaveToCatalog(newProd);
      setCatalogConflictItem(null);
      setSavedInSessionIds(prev => new Set(prev).add(prod.id));
      showToast(isDuplicate 
        ? `Novo registro cadastrado no catálogo${newSku ? ` com código ${newSku}` : ''}!` 
        : 'Produto salvo no catálogo com ficha técnica completa!');
    }
  };

  // Inserir todos os identificados na cotação
  const handleAddAllDiscoveredToQuote = () => {
    if (discoveredProducts.length === 0) return;

    const itemsData: Partial<QuoteItem>[] = discoveredProducts.map(prod => {
      const chosenImage = prod.images?.[prod.selectedImageIndex || 0] || prod.imageUrl || '';
      const price = prod.suggestedPrice || (prod.costPrice ? prod.costPrice * 1.35 : 0);
      const cost = prod.costPrice || (prod.suggestedPrice ? prod.suggestedPrice / 1.35 : 0);
      const fullDesc = buildCompleteProductDescription(prod);
      const directInfo = buildDirectPurchaseUrl(prod.standardizedName, prod.sourceUrl);

      const catalogMatch = findCatalogMatchDetails(prod, products);
      const existingInCatalog = catalogMatch && catalogMatch.score >= 60 ? catalogMatch.product : null;

      return {
        productId: existingInCatalog ? existingInCatalog.id : undefined,
        name: existingInCatalog ? existingInCatalog.name : prod.standardizedName,
        description: fullDesc || prod.description || existingInCatalog?.description || '',
        partNumber: existingInCatalog?.partNumber || cleanAlphanumericCode(prod.partNumber || ''),
        ncm: existingInCatalog?.ncm || cleanNcmCode(prod.ncm || ''),
        category: existingInCatalog?.category || prod.category,
        imageUrl: chosenImage || existingInCatalog?.imageUrl,
        showImage: !!(chosenImage || existingInCatalog?.imageUrl),
        costPrice: existingInCatalog && existingInCatalog.costPrice > 0 ? existingInCatalog.costPrice : (cost > 0 ? cost : price),
        unitPrice: price > 0 ? price : undefined,
        quantity: prod.quantity || 1,
        unit: prod.unit || existingInCatalog?.unit || 'Un.',
        supplier: existingInCatalog?.supplier || prod.supplier || directInfo.store,
        sourceUrl: prod.sourceUrl || directInfo.url || existingInCatalog?.sourceUrl
      };
    });

    if (onStartNewQuoteWithItems) {
      onStartNewQuoteWithItems(itemsData);
      showToast(`Novo orçamento criado com ${itemsData.length} produto(s) e fichas técnicas completas!`);
      onNavigateToQuote?.();
    } else {
      itemsData.forEach(item => onAddToQuote(item));
      showToast(`${discoveredProducts.length} itens inseridos na sua cotação com fichas técnicas completas!`);
      onNavigateToQuote?.();
    }
  };

  // Checkbox seleção na Fase 2
  const handleToggleSelectResult = (id: string) => {
    setSelectedResultIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedResultIds.size === batchResults.length) {
      setSelectedResultIds(new Set());
    } else {
      setSelectedResultIds(new Set(batchResults.map(r => r.id)));
    }
  };

  // Inserir itens selecionados da Fase 2 na cotação
  const handleApplyBatchToQuote = () => {
    const selected = batchResults.filter(r => selectedResultIds.has(r.id));
    if (selected.length === 0) return;

    const itemsToAdd: Partial<QuoteItem>[] = selected.map(item => {
      const margin = targetMarginPercent !== null ? targetMarginPercent : 35;
      const cost = item.bestPrice > 0 ? item.bestPrice : 0;
      const unitPrice = cost > 0 ? Number((cost * (1 + margin / 100)).toFixed(2)) : undefined;
      const chosenPhoto = (item.images && item.images[item.selectedImageIndex ?? 0]) || item.imageUrl || '';
      const fullDesc = buildCompleteProductDescription(item);
      const directInfo = buildDirectPurchaseUrl(item.standardizedName, item.buyUrl);

      return {
        name: item.standardizedName,
        description: fullDesc || item.description || '',
        partNumber: cleanAlphanumericCode(item.partNumber || ''),
        ncm: cleanNcmCode(item.ncm || ''),
        imageUrl: chosenPhoto,
        showImage: !!chosenPhoto,
        costPrice: cost,
        unitPrice,
        quantity: item.quantity || 1,
        unit: item.unit || 'Un.',
        supplier: item.store || directInfo.store,
        sourceUrl: item.buyUrl || directInfo.url
      };
    });

    if (onStartNewQuoteWithItems) {
      onStartNewQuoteWithItems(itemsToAdd);
      showToast(`Novo orçamento criado com ${itemsToAdd.length} item(ns) e fichas técnicas completas!`);
      onNavigateToQuote?.();
    } else {
      itemsToAdd.forEach(item => onAddToQuote(item));
      showToast(`${selected.length} item(ns) adicionado(s) à cotação com fichas técnicas completas!`);
      onNavigateToQuote?.();
    }
  };

  // Inserir item único da Fase 2 na cotação
  const handleAddSingleBatchResultToQuote = (item: ScannedPriceResult) => {
    const margin = targetMarginPercent !== null ? targetMarginPercent : 35;
    const cost = item.bestPrice > 0 ? item.bestPrice : 0;
    const unitPrice = cost > 0 ? Number((cost * (1 + margin / 100)).toFixed(2)) : undefined;
    const chosenPhoto = (item.images && item.images[item.selectedImageIndex ?? 0]) || item.imageUrl || '';
    const fullDesc = buildCompleteProductDescription(item);
    const directInfo = buildDirectPurchaseUrl(item.standardizedName, item.buyUrl);

    const itemData: Partial<QuoteItem> = {
      name: item.standardizedName,
      description: fullDesc || item.description || '',
      partNumber: cleanAlphanumericCode(item.partNumber || ''),
      ncm: cleanNcmCode(item.ncm || ''),
      imageUrl: chosenPhoto,
      showImage: !!chosenPhoto,
      costPrice: cost,
      unitPrice,
      quantity: item.quantity || 1,
      unit: item.unit || 'Un.',
      supplier: item.store || directInfo.store,
      sourceUrl: item.buyUrl || directInfo.url
    };

    if (targetItemIndex !== null && onUpdateQuoteItem) {
      onUpdateQuoteItem(targetItemIndex, itemData);
      showToast('Item atualizado na cotação com ficha técnica completa!');
      onNavigateToQuote?.();
    } else if (onStartNewQuoteWithItems) {
      onStartNewQuoteWithItems([itemData]);
      showToast('Novo orçamento criado com o produto e especificações completas!');
      onNavigateToQuote?.();
    } else {
      onAddToQuote(itemData);
      showToast('Item inserido na sua cotação!');
      onNavigateToQuote?.();
    }
  };

  // OCR / Transcrição Automática de Print ou Pedido
  const handleProcessImageForOcr = async (fileOrBlob: File | Blob) => {
    setIsOcrProcessing(true);
    setOcrProgressMessage('Lendo imagem e transcrevendo produtos...');
    let previewUrl = '';
    try {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        previewUrl = url;
        setOcrImagePreview(url);
        if (url) {
          setAttachedProductPhotos(prev => (prev.includes(url) ? prev : [...prev, url]));
        }
      };
      reader.readAsDataURL(fileOrBlob);
    } catch {
      // preview fail is non-fatal
    }

    try {
      const extracted = await extractDataFromQuotationImage(fileOrBlob as File, (pct, msg) => {
        setOcrProgressMessage(msg);
      });

      if (extracted.items && extracted.items.length > 0) {
        const formattedLines = extracted.items.map(it => {
          const qtyPart = it.quantity && it.quantity > 1 ? ` | Qtd: ${it.quantity} ${it.unit || 'Un.'}` : '';
          const codePart = it.partNumber ? ` [Ref: ${it.partNumber}]` : '';

          let cleanName = (it.name || '').trim();
          let extraDesc = '';
          if (it.description && it.description.trim() && it.description.trim().toLowerCase() !== cleanName.toLowerCase()) {
            const desc = it.description.trim();
            // Apenas complementa se o nome for muito curto e a descrição for sucinta (evita despejar parágrafos inteiros de OCR)
            if (!desc.toLowerCase().startsWith(cleanName.toLowerCase()) && !cleanName.toLowerCase().startsWith(desc.toLowerCase())) {
              if (cleanName.length < 25 && desc.length <= 40 && !/[.º•▪*—→]/.test(desc)) {
                extraDesc = ` ${desc}`;
              }
            }
          }

          const combined = `${cleanName}${extraDesc}`
            .replace(/(?:\.º|\d+\s*\.º|º|\*\s*—|•|▪|→)/g, ' ')
            .replace(/,/g, ' ')
            .replace(/\r?\n/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

          return `${combined}${codePart}${qtyPart}`.trim();
        });

        const fullFormattedText = formattedLines.join('\n');
        setOcrEditableText(fullFormattedText);
        setBatchRawInput(fullFormattedText);
        showToast(`${extracted.items.length} produto(s) transcrito(s) do print! Identificando produtos...`);

        // Executa a Fase 1 de descoberta automaticamente, sem exigir telas intermediárias
        setTimeout(() => {
          const photos = previewUrl ? [previewUrl] : undefined;
          handleStartPhase1Discovery(fullFormattedText, photos);
        }, 150);
      } else {
        alert('Não foi possível identificar produtos na imagem. Tente uma foto mais nítida.');
      }
    } catch (err) {
      reportError('Falha no Processamento OCR do Print/Imagem', err, 'Price Scanner - Leitura Visual');
    } finally {
      setIsOcrProcessing(false);
      setOcrProgressMessage('');
    }
  };

  const handleBatchAreaPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItems = items.filter(it => it.type.startsWith('image/'));
    if (imgItems.length > 0) {
      e.preventDefault();
      const files: File[] = [];
      imgItems.forEach(it => {
        const file = it.getAsFile();
        if (file) files.push(file);
      });
      if (files.length > 0) {
        handleAttachProductPhotos(files);
        // Se colar um print e o campo de texto estiver vazio, transcreve silenciosamente e inicia a pesquisa
        if (files.length === 1 && !batchRawInput.trim()) {
          showToast('Print colado! Lendo imagem e transcrevendo produtos...');
          handleProcessImageForOcr(files[0]);
        }
      }
    }
  };

  const handleConfirmOcrText = () => {
    if (ocrEditableText.trim()) {
      setBatchRawInput(prev => {
        if (!prev.trim()) return ocrEditableText.trim();
        return `${prev.trim()}\n${ocrEditableText.trim()}`;
      });
    }
    if (ocrImagePreview) {
      setAttachedProductPhotos(prev => [...prev, ocrImagePreview]);
      showToast('Texto inserido e Foto Anexada com Prioridade Visual Ativa!');
    }
    setIsOcrModalOpen(false);
  };

  const handleApplyCaseToResults = (style: WordCaseStyle) => {
    setActiveCaseStyle(style);
    setBatchResults(prev => prev.map(item => {
      const applyToThis = selectedResultIds.size === 0 || selectedResultIds.has(item.id);
      if (!applyToThis) return item;
      return {
        ...item,
        standardizedName: applyTextCase(item.standardizedName, style),
        description: item.description ? applyTextCase(item.description, style) : item.description
      };
    }));
    setDiscoveredProducts(prev => prev.map(p => ({
      ...p,
      standardizedName: applyTextCase(p.standardizedName, style),
      description: p.description ? applyTextCase(p.description, style) : p.description
    })));
    setIsCaseMenuOpen(false);
  };

  return (
    <div className="w-full space-y-6 animate-fadeIn pb-12">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 bg-emerald-600 text-white text-xs sm:text-sm font-bold px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 animate-bounce">
          <Check className="w-5 h-5 stroke-[3]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header da Página Inteira */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-sky-500 to-indigo-600 text-white rounded-2xl shadow-sm shrink-0">
            <Search className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="sq-page-title">
                Scanner Inteligente de Preços & Produtos
              </h1>
            </div>
            <p className="sq-page-subtitle">
              Pesquise produtos por código, especificações técnicas ou foto e insira diretamente na sua cotação comercial.
            </p>
          </div>
        </div>

      </div>

      {/* Card de Busca e Entrada */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-sky-600" />
            <span>Cole aqui seus itens (texto, especificações ou um print):</span>
          </label>
        </div>

        {/* Banner Dourado de Preço em Histórico Recente (MEL-02) */}
        {recentCachedPrice && (
          <div className="p-4 bg-amber-50/90 border border-amber-300/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-950">
                    Preço Homologado em Histórico ({recentCachedPrice.daysAgo === 0 ? 'Hoje' : `há ${recentCachedPrice.daysAgo} dias`})
                  </span>
                  <span className="px-1.5 py-0.5 bg-amber-200 text-amber-900 rounded font-mono text-[10px] font-bold">
                    PN: {recentCachedPrice.partNumber}
                  </span>
                </div>
                <p className="text-xs text-amber-800 mt-0.5">
                  <strong>R$ {recentCachedPrice.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> via <span className="font-semibold">{recentCachedPrice.supplier}</span> — economize tempo e reaproveite o custo já negociado.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onAddToQuote({
                  name: recentCachedPrice.name,
                  description: recentCachedPrice.name,
                  partNumber: recentCachedPrice.partNumber,
                  costPrice: recentCachedPrice.costPrice,
                  supplier: recentCachedPrice.supplier,
                  sourceUrl: recentCachedPrice.sourceUrl,
                  quantity: 1
                });
                showToast('Preço do histórico adicionado à cotação!');
              }}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 self-end sm:self-auto"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Aproveitar este Preço</span>
            </button>
          </div>
        )}

        {/* Preview das Fotos Reais Anexadas dos Produtos (Prioridade Visual Máxima - Múltiplas Fotos) */}
        {attachedProductPhotos.length > 0 && (
          <div className="p-4 bg-gradient-to-r from-sky-50/90 via-indigo-50/50 to-white border border-sky-300 rounded-2xl shadow-xs space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 bg-sky-600 text-white text-[10px] font-extrabold uppercase tracking-wide rounded-md shadow-2xs">
                  📷 Prioridade Visual Ativa
                </span>
                <span className="text-xs font-bold text-slate-900">
                  {attachedProductPhotos.length === 1
                    ? '1 Foto de Produto Anexada'
                    : `${attachedProductPhotos.length} Fotos de Produtos Anexadas`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => productPhotoInputRef.current?.click()}
                  className="text-xs text-sky-700 hover:text-sky-800 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar mais</span>
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setAttachedProductPhotos([])}
                  className="text-xs text-slate-400 hover:text-rose-600 transition cursor-pointer"
                  title="Remover todas as fotos anexadas"
                >
                  Limpar fotos
                </button>
              </div>
            </div>

            {/* Grid de Miniaturas das Fotos com Remoção Individual */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
              {attachedProductPhotos.map((photo, idx) => (
                <div
                  key={idx}
                  className="relative group rounded-xl overflow-hidden border border-sky-200 bg-white aspect-square flex items-center justify-center hover:border-sky-400 shadow-2xs transition"
                >
                  <img
                    src={photo}
                    alt={`Foto ${idx + 1}`}
                    className="w-full h-full object-contain p-1"
                  />
                  <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-slate-900/70 text-white font-mono text-[9px] font-bold rounded">
                    #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveProductPhoto(idx)}
                    className="absolute top-1 right-1 p-1 bg-white/95 hover:bg-rose-600 text-slate-500 hover:text-white rounded-lg shadow-xs transition opacity-90 group-hover:opacity-100 cursor-pointer"
                    title={`Remover foto #${idx + 1}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-slate-600">
              {batchRawInput.trim()
                ? `As ${attachedProductPhotos.length} fotos e os produtos descritos no texto serão buscados em conjunto: o scanner trará os produtos de cada foto e também os itens digitados.`
                : `As fotos ditam o modelo real, acabamento e formato de cada item. O scanner extrairá cada um dos produtos fotografados com ficha técnica completa.`}
            </p>
          </div>
        )}

        <div className="relative">
          <textarea
            rows={5}
            value={batchRawInput}
            onChange={(e) => setBatchRawInput(e.target.value)}
            onPaste={handleBatchAreaPaste}
            className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-4 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-mono leading-relaxed resize-y"
          />

          {/* Input oculto para anexar fotos dos produtos (suporte a múltiplas fotos) */}
          <input
            type="file"
            ref={productPhotoInputRef}
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleAttachProductPhotos(e.target.files);
              }
              e.target.value = '';
            }}
          />

          {/* Input oculto para OCR de documento/pedido */}
          <input
            type="file"
            ref={imageUploadInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleProcessImageForOcr(file);
              }
              e.target.value = '';
            }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => productPhotoInputRef.current?.click()}
              className="px-4 py-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs active:scale-98"
              title="Anexe uma ou mais fotos dos produtos para prioridade visual absoluta na dedução"
            >
              <ImageIcon className="w-4 h-4" />
              <span>
                {attachedProductPhotos.length > 0
                  ? `+ Anexar Mais Fotos (${attachedProductPhotos.length})`
                  : 'Anexar Fotos'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => imageUploadInputRef.current?.click()}
              disabled={isOcrProcessing}
              className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-2 cursor-pointer shadow-2xs"
              title="Carregue uma imagem ou print de pedido para transcrever automaticamente"
            >
              <Camera className="w-4 h-4 text-slate-500" />
              <span>{isOcrProcessing ? 'Transcrevendo...' : 'Fazer OCR'}</span>
            </button>

            {(batchRawInput || attachedProductPhotos.length > 0 || discoveredProducts.length > 0 || batchResults.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setBatchRawInput('');
                  setAttachedProductPhotos([]);
                  setDiscoveredProducts([]);
                  setBatchResults([]);
                  setSelectedResultIds(new Set());
                }}
                className="text-xs text-slate-400 hover:text-slate-600 ml-2 cursor-pointer"
              >
                Limpar Tudo
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleStartPhase1Discovery()}
            disabled={isDiscoveringPhase1 || isScanningBatch || (!batchRawInput.trim() && attachedProductPhotos.length === 0)}
            className="px-6 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs flex items-center gap-2 cursor-pointer active:scale-98"
          >
            <Sparkles className={`w-4 h-4 ${isDiscoveringPhase1 ? 'animate-spin' : ''}`} />
            <span>{isDiscoveringPhase1 ? 'Buscando Produto(s)...' : 'Buscar Produto(s)'}</span>
          </button>
        </div>

        {/* OCR Processing Indicator */}
        {isOcrProcessing && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-3 animate-fadeIn">
            <Sparkles className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
            <div className="text-xs text-indigo-900 font-semibold">
              <span>{ocrProgressMessage || 'Transcrevendo foto do pedido via (OCR)...'}</span>
            </div>
          </div>
        )}

        {/* Phase 1 Processing Indicator */}
        {isDiscoveringPhase1 && (
          <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-3 animate-fadeIn">
            <Sparkles className="w-5 h-5 text-indigo-600 animate-spin shrink-0" />
            <div className="text-xs sm:text-sm text-indigo-900 font-semibold">
              <span>{phase1StatusMessage || 'Analisando características técnicas e buscando fotos reais...'}</span>
            </div>
          </div>
        )}

        {/* Progress Bar da Fase 2 */}
        {isScanningBatch && batchProgress && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5 animate-fadeIn">
            <div className="flex items-center justify-between text-xs text-emerald-800 font-semibold">
              <span>Sistemática Infodesk Store: {batchProgress.currentProduct}</span>
              <span>{batchProgress.current} de {batchProgress.total} ({Math.round((batchProgress.current / batchProgress.total) * 100)}%)</span>
            </div>
            <div className="w-full bg-emerald-200 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-600 h-full transition-all duration-300 rounded-full"
                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ─── PAINEL DE PRODUTOS IDENTIFICADOS 360° (PADRÃO INFODESK STORE) ─── */}
      {discoveredProducts.length > 0 && (
        <div className="space-y-4 animate-fadeIn">
          {/* Header de Ações Rápidas */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  Fase 1: Produtos Identificados e Catalogados
                  <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs rounded-full font-extrabold">
                    {discoveredProducts.length} item(ns)
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Ficha técnica 360° com especificações, galeria de fotos reais e preços sugeridos de mercado.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {discoveredProducts.length > 1 && (
                <button
                  type="button"
                  onClick={handleAddAllDiscoveredToQuote}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>Inserir Todos ({discoveredProducts.length})</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleStartPhase2Enrichment}
                disabled={isScanningBatch}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-2xs active:scale-95"
                title="Varre lojas online para apurar preços reais e links de compra"
              >
                <Zap className={`w-4 h-4 text-amber-500 ${isScanningBatch ? 'animate-spin' : ''}`} />
                <span>{isScanningBatch ? 'Pesquisando Lojas...' : '2. Comparar Preços em Lojas (Fase 2)'}</span>
              </button>
            </div>
          </div>

          {/* LISTA DE CARDS 360° NO PADRÃO INFODESK STORE */}
          <div className="space-y-4">
            {discoveredProducts.map((prod) => {
              const images = prod.images && prod.images.length > 0 ? prod.images : [prod.imageUrl || ''];
              const activeImgIndex = prod.selectedImageIndex ?? 0;
              const currentImg = images[activeImgIndex] || images[0] || '';
              const catalogMatch = findCatalogMatchDetails(prod, products);
              const existingInCatalog = catalogMatch ? catalogMatch.product : null;
              const isJustSavedInSession = savedInSessionIds.has(prod.id);

              return (
                <div
                  key={prod.id}
                  className="bg-white border-2 border-emerald-400/40 hover:border-emerald-500/60 rounded-3xl p-5 md:p-6 shadow-xs hover:shadow-md transition-all duration-200 space-y-4 relative"
                >
                  {/* Top Badges Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded-full text-xs font-semibold">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        Inteligência Artificial (Gemini AI)
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#064e3b] text-white rounded-full text-xs font-bold shadow-2xs">
                        <Check className="w-3.5 h-3.5 text-emerald-300 stroke-[3]" />
                        {prod.confidence ? `${typeof prod.confidence === 'string' ? prod.confidence : 'Alta'} - Identificado por IA` : 'Alta - Identificado por IA'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isJustSavedInSession ? (
                        <span className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-full text-xs font-bold shadow-2xs animate-fadeIn">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Cadastrado no Catálogo com Sucesso (Código: {existingInCatalog?.sku || prod.partNumber || 'OK'})</span>
                        </span>
                      ) : existingInCatalog ? (
                        catalogMatch && catalogMatch.score >= 80 ? (
                          <span className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-sky-100 text-sky-900 border border-sky-300 rounded-full text-xs font-bold shadow-2xs">
                            <Database className="w-3.5 h-3.5 text-sky-700" />
                            <span>Produto no Catálogo ({catalogMatch.score}% similar · Cód: {existingInCatalog.sku || existingInCatalog.partNumber})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-xs font-bold shadow-2xs">
                            <Database className="w-3.5 h-3.5 text-amber-700" />
                            <span>Item Similar no Catálogo ({catalogMatch?.score || 70}% compatível)</span>
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center px-3.5 py-1 bg-[#fef3c7] text-[#b45309] border border-amber-200/80 rounded-full text-xs font-bold">
                          Novo Produto / Pronto para Cadastrar
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveDiscoveredProduct(prod.id)}
                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="Remover este produto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Main Content: Left Image Gallery, Right Details */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-6 items-start">
                    {/* Left Column: Image with Thumbnails */}
                    <div className="md:col-span-4 lg:col-span-3 flex flex-col items-center">
                      <div className="w-full aspect-square max-w-[220px] bg-white border border-slate-200 rounded-2xl p-2.5 flex items-center justify-center overflow-hidden shadow-2xs group relative">
                        {currentImg ? (
                          <img
                            src={currentImg}
                            alt={prod.standardizedName}
                            className="max-w-full max-h-full object-contain group-hover:scale-105 transition duration-300"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full bg-slate-50 flex items-center justify-center text-slate-300">
                            <ImageIcon className="w-12 h-12" />
                          </div>
                        )}
                        {currentImg && (
                          <div className="absolute top-2 left-2 bg-emerald-600 text-white text-[9.5px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                            <span>Foto do Orçamento</span>
                          </div>
                        )}
                      </div>

                      {/* Thumbnails Row - Escolha de Foto para o Orçamento */}
                      {images.length > 1 && (
                        <div className="w-full max-w-[220px] mt-2.5">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1">
                            <span>Escolha a foto para o orçamento:</span>
                            <span className="text-emerald-700 font-extrabold">{activeImgIndex + 1}/{images.length}</span>
                          </div>
                          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
                            {images.map((thumbUrl, tIdx) => (
                              <button
                                key={tIdx}
                                type="button"
                                onClick={() => handleSelectDiscoveredImage(prod.id, tIdx)}
                                className={`w-12 h-12 rounded-xl border-2 p-0.5 bg-white shrink-0 overflow-hidden transition cursor-pointer flex items-center justify-center relative ${
                                  activeImgIndex === tIdx
                                    ? 'border-emerald-500 ring-2 ring-emerald-200 shadow-2xs scale-105'
                                    : 'border-slate-200 opacity-60 hover:opacity-100 hover:border-slate-300'
                                }`}
                                title={`Clique para escolher a foto #${tIdx + 1} para o orçamento`}
                              >
                                <img src={thumbUrl} alt={`Thumbnail ${tIdx + 1}`} className="w-full h-full object-contain" />
                                {activeImgIndex === tIdx && (
                                  <div className="absolute bottom-0 right-0 bg-emerald-600 text-white rounded-tl-md p-0.5">
                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Botão para abrir modal com todas as fotos / pesquisar outras */}
                      <button
                        type="button"
                        onClick={() => setPhotoPickerTarget({
                          type: 'discovered',
                          id: prod.id,
                          name: prod.standardizedName,
                          images,
                          currentImageUrl: currentImg
                        })}
                        className="mt-2.5 text-[11px] font-bold text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                        title="Ver todas as fotos encontradas ou buscar novas fotos na web"
                      >
                        <Search className="w-3 h-3" />
                        <span>Ver todas / Buscar mais fotos</span>
                      </button>
                    </div>

                    {/* Right Column: Tags, Sub-specs, Title, Description, Specs Chips */}
                    <div className="md:col-span-8 lg:col-span-9 flex flex-col justify-between">
                      <div>
                        {/* Badges Row */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {prod.brand && (
                            <span className="px-3 py-1 bg-[#0f172a] text-white rounded-full text-xs font-bold shadow-2xs">
                              {prod.brand}
                            </span>
                          )}
                          {prod.manufacturer && (
                            <span className="px-3 py-1 bg-[#1e293b] text-slate-100 rounded-full text-xs font-semibold shadow-2xs">
                              Fab: {prod.manufacturer}
                            </span>
                          )}
                          {prod.category && (
                            <span className="px-2.5 py-1 text-slate-600 bg-slate-100 border border-slate-200/80 rounded-full text-xs font-medium">
                              {prod.category}
                            </span>
                          )}
                          {prod.partNumber && (
                            <span className="px-3 py-1 bg-[#0b132b] text-indigo-100 font-mono rounded-full text-xs font-bold shadow-2xs">
                              P/N: {prod.partNumber}
                            </span>
                          )}
                        </div>

                        {/* Sub-specs Row (Mod, NCM, Peso, Dimensões) */}
                        <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs font-semibold text-slate-700 mt-2 mb-2">
                          {prod.model && (
                            <span>Mod: <strong className="text-slate-900 font-bold">{prod.model}</strong></span>
                          )}
                          {prod.ncm && (
                            <span>NCM: <strong className="text-slate-900 font-mono">{prod.ncm}</strong></span>
                          )}
                          {prod.weight && (
                            <span>Peso: <strong className="text-slate-900">{prod.weight}</strong></span>
                          )}
                          {prod.dimensions && (
                            <span>Dimensões: <strong className="text-slate-900">{prod.dimensions}</strong></span>
                          )}
                        </div>

                        {/* Comparativo de Catálogo quando já existe */}
                        {existingInCatalog && (
                          <div className="mb-2.5 px-3.5 py-2.5 bg-sky-50/90 border border-sky-200/90 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-sky-900 shadow-2xs">
                            <div className="flex items-start sm:items-center gap-2 min-w-0">
                              <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0 mt-0.5 sm:mt-0" />
                              <div className="min-w-0">
                                <div>
                                  <strong>Comparativo com o Catálogo:</strong> Identificado como <em>"{existingInCatalog.name}"</em> · Custo atual: <strong>R$ {(existingInCatalog.costPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                                </div>
                                {catalogMatch?.details && (
                                  <div className="text-[11px] text-sky-700 font-medium mt-0.5 flex items-center gap-1">
                                    <Sparkles className="w-3 h-3 text-sky-600 shrink-0" />
                                    <span>{catalogMatch.details}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10.5px] font-bold text-sky-800 bg-sky-100/90 border border-sky-200 px-2 py-0.5 rounded-md font-mono">
                                SKU: {existingInCatalog.sku || existingInCatalog.partNumber}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRequestSaveOrUpdate(prod, existingInCatalog, catalogMatch || undefined)}
                                className="text-[11px] font-bold text-sky-700 hover:text-sky-900 underline ml-1 cursor-pointer"
                                title="Ver comparativo lado a lado e decidir se atualiza ou cria novo"
                              >
                                Comparar lado a lado
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Title */}
                        <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-snug mt-1 mb-2">
                          {prod.standardizedName}
                        </h3>

                        {/* Description */}
                        {prod.description && (
                          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-3.5 whitespace-pre-line text-justify sm:text-left">
                            {prod.description}
                          </p>
                        )}

                        {/* Technical Specifications Chips */}
                        {prod.specifications && prod.specifications.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-4">
                            {prod.specifications.map((spec, sIdx) => (
                              <div
                                key={sIdx}
                                className="bg-slate-100/90 border border-slate-200/70 rounded-lg px-2.5 py-1 text-xs text-slate-700 font-medium flex items-center gap-1 shadow-2xs"
                              >
                                <strong className="text-slate-900 font-semibold">{spec.label}:</strong>
                                <span>{spec.value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Bottom Bar: Suggested Price + Actions */}
                      <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-auto">
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
                            PREÇO SUGERIDO DE MERCADO
                          </span>
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl sm:text-3xl font-black text-emerald-600 font-mono tracking-tight">
                              {prod.suggestedPrice && prod.suggestedPrice > 0
                                ? `R$ ${prod.suggestedPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : (prod.costPrice && prod.costPrice > 0
                                  ? `R$ ${(prod.costPrice * 1.35).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : 'Sob Consulta')}
                            </span>
                            {Boolean(prod.costPrice && prod.costPrice > 0) && (
                              <span className="text-xs text-slate-400 font-medium">
                                (Custo aprox: R$ {prod.costPrice!.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 flex-wrap">
                          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
                            <input
                              type="number"
                              min="1"
                              value={prod.quantity || 1}
                              onChange={(e) => handleUpdateDiscoveredProduct(prod.id, { quantity: parseInt(e.target.value, 10) || 1 })}
                              className="w-12 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-xs font-bold text-slate-800 text-center focus:outline-none focus:border-emerald-500"
                              title="Quantidade para a cotação"
                            />
                            <input
                              type="text"
                              value={prod.unit || 'Un.'}
                              onChange={(e) => handleUpdateDiscoveredProduct(prod.id, { unit: e.target.value })}
                              className="w-12 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-xs font-semibold text-slate-700 text-center focus:outline-none focus:border-emerald-500"
                              title="Unidade"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddSingleDiscoveredToQuote(prod)}
                            className="px-5 py-2.5 bg-gradient-to-r from-lime-600 via-emerald-600 to-green-600 hover:from-lime-500 hover:to-emerald-500 text-white rounded-xl text-xs sm:text-sm font-black transition shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer active:scale-98"
                          >
                            <Plus className="w-4 h-4 stroke-[3]" />
                            <span>+ Inserir na Cotação</span>
                          </button>

                          {existingInCatalog ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleRequestSaveOrUpdate(prod, existingInCatalog, catalogMatch || undefined)}
                                className="px-4 py-2.5 bg-sky-50 hover:bg-sky-100 border border-sky-300 text-sky-800 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer shadow-2xs active:scale-95"
                                title="Atualizar dados, fotos e custos desta ficha no catálogo"
                              >
                                <RefreshCw className="w-4 h-4 text-sky-600" />
                                <span>Atualizar no Catálogo</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => executeSaveProductToCatalog(prod, null, 'create_new')}
                                className="px-4 py-2.5 bg-white hover:bg-emerald-50 border border-slate-300 hover:border-emerald-300 text-slate-700 hover:text-emerald-800 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer shadow-2xs active:scale-95"
                                title="Cadastrar como um novo item independente no catálogo (outra marca ou modelo alternativo)"
                              >
                                <Plus className="w-4 h-4 text-emerald-600" />
                                <span>Salvar como Novo (Outra Marca/Modelo)</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRequestSaveOrUpdate(prod, null)}
                              className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-2 cursor-pointer shadow-2xs active:scale-95"
                              title="Salvar produto no catálogo para reutilizar em cotações"
                            >
                              <Printer className="w-4 h-4 text-slate-500" />
                              <span>Salvar no Catálogo</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── PAINEL DA FASE 2: RESULTADOS DE PREÇOS EM LOJAS ─── */}
      {batchResults.length > 0 && (
        <div className="space-y-3 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-sky-600 transition"
            >
              {selectedResultIds.size === batchResults.length && batchResults.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-sky-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>Selecionar Todos ({selectedResultIds.size}/{batchResults.length})</span>
            </button>

            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Fase 2: Menor Preço e Ofertas em Lojas
              </h3>
              <span className="px-2.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-xs rounded-full font-bold">
                {batchResults.length} item(ns)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApplyBatchToQuote}
                disabled={selectedResultIds.size === 0}
                className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Inserir Selecionados na Cotação</span>
              </button>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            {batchResults.map((item) => {
              const isSelected = selectedResultIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`bg-white border rounded-2xl p-4 transition shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                    isSelected ? 'border-sky-400 ring-1 ring-sky-300 bg-sky-50/20' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleToggleSelectResult(item.id)}
                      className="text-slate-400 hover:text-sky-600 transition shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-sky-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300" />
                      )}
                    </button>

                    <div className="flex flex-col items-center shrink-0">
                      <div className="w-14 h-14 bg-white border border-slate-200 rounded-xl overflow-hidden shrink-0 flex items-center justify-center p-1 relative group shadow-2xs">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.standardizedName}
                            className="w-full h-full object-contain group-hover:scale-110 transition duration-300"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full bg-slate-50 flex items-center justify-center rounded-lg text-slate-400">
                            <ImageIcon className="w-6 h-6 text-slate-300" />
                          </div>
                        )}
                        {item.imageUrl && (
                          <div className="absolute top-1 left-1 bg-emerald-600 text-white rounded-full p-0.5 shadow-xs" title="Foto do Orçamento">
                            <Check className="w-2 h-2 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPhotoPickerTarget({
                          type: 'batch',
                          id: item.id,
                          name: item.standardizedName,
                          images: item.images && item.images.length > 0 ? item.images : (item.imageUrl ? [item.imageUrl] : []),
                          currentImageUrl: item.imageUrl || ''
                        })}
                        className="text-[10px] text-sky-600 hover:text-sky-800 font-semibold hover:underline mt-1 cursor-pointer"
                        title="Trocar ou pesquisar foto para a cotação"
                      >
                        Trocar Foto
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {item.standardizedName}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                        {item.partNumber && <span><strong>PN:</strong> <code className="text-slate-700">{item.partNumber}</code></span>}
                        {item.ncm && <span><strong>NCM:</strong> <code className="text-slate-700">{item.ncm}</code></span>}
                        <span>{item.observation}</span>
                      </div>

                      {/* Seletor de fotos quando há múltiplas imagens encontradas */}
                      {item.images && item.images.length > 1 && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap bg-slate-50 p-1.5 rounded-xl border border-slate-200/80">
                          <span className="text-[10px] font-bold text-slate-600 shrink-0 flex items-center gap-1">
                            <span>Foto do Orçamento:</span>
                            <span className="text-emerald-700 font-extrabold">({(item.selectedImageIndex ?? 0) + 1}/{item.images.length})</span>
                          </span>
                          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                            {item.images.map((thumbUrl, tIdx) => {
                              const isCur = (item.selectedImageIndex ?? 0) === tIdx;
                              return (
                                <button
                                  key={tIdx}
                                  type="button"
                                  onClick={() => handleSelectBatchResultImage(item.id, tIdx)}
                                  className={`w-7 h-7 rounded-lg border p-0.5 bg-white shrink-0 overflow-hidden transition cursor-pointer relative ${
                                    isCur
                                      ? 'border-emerald-500 ring-2 ring-emerald-200 shadow-2xs scale-105'
                                      : 'border-slate-200 opacity-60 hover:opacity-100 hover:border-slate-300'
                                  }`}
                                  title={`Usar foto #${tIdx + 1} no orçamento`}
                                >
                                  <img src={thumbUrl} alt="" className="w-full h-full object-contain" />
                                  {isCur && (
                                    <div className="absolute bottom-0 right-0 bg-emerald-600 text-white rounded-tl-sm p-0.5">
                                      <Check className="w-1.5 h-1.5 stroke-[3]" />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Escudo de Compatibilidade Técnica (MEL-14) */}
                      {(() => {
                        const audit = auditProductOfferCompatibility(
                          item.originalQuery || item.standardizedName,
                          `${item.standardizedName} ${item.observation || ''}`,
                          !!item.partNumber
                        );

                        return (
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border ${
                              audit.status === 'exact'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : audit.status === 'conflict'
                                ? 'bg-rose-50 text-rose-800 border-rose-300 animate-pulse'
                                : 'bg-amber-50 text-amber-800 border-amber-300'
                            }`}>
                              {audit.status === 'exact' ? '✓ ' : audit.status === 'conflict' ? '⚠️ ' : 'ℹ️ '}
                              {audit.badgeLabel} ({audit.score}% Confiança)
                            </span>

                            {audit.conflictReasons.length > 0 && (
                              <span className="text-[10.5px] font-bold text-rose-700">
                                {audit.conflictReasons[0]}
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Carrossel de Ofertas Concorrentes do Google Shopping */}
                      {item.allOffers && item.allOffers.length > 1 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-sky-600" />
                            <span>Google Shopping:</span>
                          </span>
                          {item.allOffers.slice(0, 4).map((off, oIdx) => (
                            <a
                              key={oIdx}
                              href={off.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`px-2 py-0.5 rounded-lg text-[10.5px] font-medium border flex items-center gap-1 transition ${
                                oIdx === 0
                                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold hover:bg-emerald-100'
                                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                              title={`Abrir oferta na loja ${off.store}: ${off.priceFormatted}`}
                            >
                              <span>{off.store}:</span>
                              <strong className={oIdx === 0 ? 'text-emerald-700' : 'text-slate-900'}>{off.priceFormatted}</strong>
                              {oIdx === 0 && <span className="text-[9px] bg-emerald-600 text-white px-1 rounded-sm font-bold ml-0.5">Menor</span>}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 sm:border-l sm:border-slate-100 sm:pl-4 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-right">
                      <div className="text-sm sm:text-base font-extrabold text-slate-900 font-mono">
                        {item.bestPrice > 0 ? (
                          <span className="text-emerald-700">{item.priceFormatted}</span>
                        ) : (
                          <span className="text-slate-400 font-normal">Sob consulta</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 font-semibold flex items-center justify-end gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span>{item.store}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddSingleBatchResultToQuote(item)}
                        className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition shadow-2xs flex items-center gap-1 cursor-pointer active:scale-95"
                        title="Criar novo orçamento com este produto"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Inserir na Cotação</span>
                      </button>

                      {item.buyUrl && (
                        <a
                          href={item.buyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-white hover:bg-sky-50 text-sky-800 border border-sky-200 hover:border-sky-300 rounded-xl text-xs font-bold transition shadow-2xs flex items-center gap-1.5 shrink-0"
                          title={`Abrir página do produto na loja ${item.store}`}
                        >
                          <span>Comprar na {item.store || 'Loja'}</span>
                          <ExternalLink className="w-3 h-3 text-sky-600" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* OCR MODAL DIALOG */}
      {isOcrModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                Produtos Identificados da Foto (OCR)
              </h3>
              <button
                type="button"
                onClick={() => setIsOcrModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {ocrImagePreview && (
                <div className="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <img src={ocrImagePreview} alt="Foto" className="w-16 h-16 object-cover rounded-lg border" />
                  <p className="text-xs text-slate-600">
                    Revise as linhas extraídas abaixo antes de buscar os preços:
                  </p>
                </div>
              )}
              <textarea
                rows={10}
                value={ocrEditableText}
                onChange={(e) => setOcrEditableText(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3 text-xs text-slate-900 font-mono focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 px-5">
              <button
                type="button"
                onClick={() => setIsOcrModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={handleConfirmOcrText}
                className="px-5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                Inserir no Scanner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFLITO / PRODUTO JÁ EXISTENTE NO CATÁLOGO */}
      {catalogConflictItem && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn">
            <div className="p-5 border-b border-slate-200 bg-sky-50/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-100 border border-sky-300 flex items-center justify-center text-sky-700 shadow-2xs">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    Produto já Cadastrado no Catálogo
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Este item já possui registro na sua base de produtos (Código: <strong>{catalogConflictItem.existing.sku || catalogConflictItem.existing.partNumber}</strong>).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCatalogConflictItem(null)}
                className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 flex items-center justify-center text-xs font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              {catalogConflictItem.matchInfo && (
                <div className="px-4 py-2.5 bg-sky-50 border border-sky-200/90 rounded-2xl flex items-center justify-between text-xs text-sky-950 shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
                    <span className="truncate">
                      <strong>Identificação por Similaridade:</strong> {catalogConflictItem.matchInfo.details}
                    </span>
                  </div>
                  <span className="shrink-0 ml-2 font-mono font-bold px-2.5 py-0.5 bg-sky-100 text-sky-800 border border-sky-300 rounded-lg text-xs">
                    {catalogConflictItem.matchInfo.score}% match
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Registro Atual no Catálogo */}
                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-slate-500" />
                      Ficha Atual no Catálogo
                    </span>
                    <span className="text-[10.5px] font-mono font-bold bg-white border border-slate-200 px-2 py-0.5 rounded-md text-slate-700">
                      {catalogConflictItem.existing.sku || catalogConflictItem.existing.partNumber}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">
                    {catalogConflictItem.existing.name}
                  </h4>
                  <div className="text-[11px] text-slate-600 space-y-1 pt-1 border-t border-slate-200/60 font-medium">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Preço de Custo:</span>
                      <strong className="text-slate-900 font-mono">
                        R$ {(catalogConflictItem.existing.costPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                    {catalogConflictItem.existing.partNumber && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Part Number:</span>
                        <strong className="text-slate-800 font-mono">{catalogConflictItem.existing.partNumber}</strong>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-400">Categoria:</span>
                      <span className="text-slate-700">{catalogConflictItem.existing.category || 'Diversos & Sazonais'}</span>
                    </div>
                  </div>
                </div>

                {/* Nova Informação Escaneada pela IA */}
                <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      Nova Ficha Escaneada (IA)
                    </span>
                    <span className="text-[10.5px] font-mono font-bold bg-white border border-emerald-200 px-2 py-0.5 rounded-md text-emerald-800">
                      Ref: {catalogConflictItem.discovered.partNumber || 'Nova'}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-emerald-950 leading-snug line-clamp-2">
                    {catalogConflictItem.discovered.standardizedName}
                  </h4>
                  <div className="text-[11px] text-emerald-800 space-y-1 pt-1 border-t border-emerald-200/60 font-medium">
                    <div className="flex justify-between">
                      <span className="text-emerald-600">Preço Escaneado:</span>
                      <strong className="text-emerald-950 font-mono">
                        {catalogConflictItem.discovered.suggestedPrice
                          ? `R$ ${catalogConflictItem.discovered.suggestedPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : (catalogConflictItem.discovered.costPrice
                            ? `R$ ${catalogConflictItem.discovered.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                            : 'Sob Consulta')}
                      </strong>
                    </div>
                    {catalogConflictItem.discovered.partNumber && (
                      <div className="flex justify-between">
                        <span className="text-emerald-600">Part Number:</span>
                        <strong className="text-emerald-900 font-mono">{catalogConflictItem.discovered.partNumber}</strong>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-emerald-600">Fotos Encontradas:</span>
                      <span>{catalogConflictItem.discovered.images?.length || 1} imagem(ns)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                <p>
                  <strong>Como deseja proceder?</strong> Você pode atualizar o registro existente para enriquecer a descrição, fotos e preços de mercado, ou criar um registro duplicado com código independente.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 px-6">
              <button
                type="button"
                onClick={() => setCatalogConflictItem(null)}
                className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Cancelar
              </button>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => executeSaveProductToCatalog(catalogConflictItem.discovered, catalogConflictItem.existing, 'create_new')}
                  className="px-4 py-2.5 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-300 hover:border-emerald-300 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-2xs"
                  title="Cadastrar como um novo registro separado no catálogo (outra marca ou modelo)"
                >
                  <Plus className="w-4 h-4 text-emerald-600" />
                  <span>Salvar como Novo (Outra Marca/Modelo)</span>
                </button>

                <button
                  type="button"
                  onClick={() => executeSaveProductToCatalog(catalogConflictItem.discovered, catalogConflictItem.existing, 'update')}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs active:scale-98"
                  title="Substituir e enriquecer os dados técnicos do item existente no catálogo"
                >
                  <RefreshCw className="w-4 h-4 text-white" />
                  <span>Atualizar Ficha Existente</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ESCOLHA DE FOTOS DA WEB */}
      {photoPickerTarget && (
        <WebImagePickerModal
          isOpen={true}
          onClose={() => setPhotoPickerTarget(null)}
          productName={photoPickerTarget.name}
          initialImages={photoPickerTarget.images}
          currentImageUrl={photoPickerTarget.currentImageUrl}
          onSelectImage={handlePhotoPicked}
        />
      )}
    </div>
  );
};
