import { cleanAlphanumericCode } from './aiEmailParser';

/**
 * Interface com os dados resolvidos de Modelo, Part Number e SKU.
 */
export interface ResolvedProductCode {
  partNumber: string;
  model: string;
  sku: string;
  source: 'description_explicit' | 'description_heuristic' | 'scanner_result' | 'fallback_generated';
}

// Lista de palavras e termos que NÃO são modelos (unidades, medidas, termos comuns de catálogo)
const NON_MODEL_TOKENS = new Set([
  'UN', 'UNID', 'UNIDADE', 'PCT', 'PACOTE', 'CX', 'CAIXA', 'KIT', 'CJ', 'CONJUNTO',
  'MM', 'CM', 'M', 'METRO', 'METROS', 'KM', 'POLEGADAS', 'POL', 'POLS',
  'KG', 'G', 'MG', 'L', 'LT', 'LITRO', 'LITROS', 'ML',
  'V', 'VOLT', 'VOLTS', '110V', '127V', '220V', 'BIVOLT', '12V', '24V', '5V',
  'W', 'WATTS', 'WATT', 'VA', 'KVA', 'HZ', '60HZ', '50HZ',
  'KB', 'MB', 'GB', 'TB', '1TB', '2TB', '4TB', '8TB', '16GB', '32GB', '64GB', '128GB', '256GB', '512GB',
  'USB', 'USBC', 'HDMI', 'VGA', 'DVI', 'DISPLAYPORT', 'BLUETOOTH', 'WIFI', 'WIRELESS', 'SEM', 'FIO',
  'PRETO', 'BRANCO', 'CINZA', 'AZUL', 'VERMELHO', 'AMARELO', 'VERDE', 'PRATA', 'BLACK', 'WHITE', 'GRAY', 'GREY',
  'NOVO', 'ORIGINAL', 'OFICIAL', 'GENERICO', 'GENERICA', 'PADRAO', 'COMPLETO', 'COMBO', 'ULTIMATE',
  'PARA', 'COM', 'SEM', 'TIPO', 'COR', 'CABO', 'ADAPTADOR', 'FONTE', 'CARREGADOR', 'SUPORTE'
]);

// Marcas comuns conhecidas para ancoragem de modelo
const KNOWN_BRANDS = [
  'HOLLYLAND', 'LOGITECH', 'DELL', 'EPSON', 'FURUKAWA', 'KINGSTON', 'SAMSUNG', 'LG',
  'HP', 'LENOVO', 'ASUS', 'ACER', 'INTELBRAS', 'APC', 'SMS', 'ELGIN', 'PANTUM',
  'HONEYWELL', 'ZEBRA', 'ARGOX', 'BEMATECH', 'BOSCH', 'MAKITA', 'DEWALT', 'GEDORE',
  'TRAMONTINA', 'CORFIO', 'PRYSMIAN', 'SIL', 'SCHNEIDER', 'SIEMENS', 'WEG', 'LEGRAND',
  'JBL', 'SONY', 'RODE', 'DJI', 'CANON', 'NIKON', 'SANDISK', 'SEAGATE', 'WESTERN DIGITAL', 'WD',
  'CORSAIR', 'HYPERX', 'REDDRAGON', 'MULTILASER', 'TP-LINK', 'D-LINK', 'UBIQUITI', 'MIKROTIK',
  'CISCO', 'FORTINET', 'HIKVISION', 'DAHUA', 'BRASTEMP', 'CONSUL', 'ELECTROLUX', 'VENAX',
  '3M', 'STARRETT', 'VONDER', 'BELGO', 'NORDSON', 'VALCLEI', 'GENEBRE'
];

/**
 * 1. Extração da própria descrição / texto digitado ou fornecido.
 * Procura marcadores explícitos (PN, P/N, Part Number, Ref, Cód, SKU, Modelo)
 * ou padrões de modelo bem conhecidos (ex: "Lark M2S", "P2723D", "E20", "NV2", "PE-R750").
 */
export function extractModelAndPartNumberFromText(
  text: string | undefined,
  brandHint?: string
): { partNumber: string; model: string; isExplicit: boolean } {
  if (!text || !text.trim()) {
    return { partNumber: '', model: '', isExplicit: false };
  }

  const raw = text.trim();

  // 1.1. Marcadores EXPLÍCITOS de Part Number / Código / Referência
  // Ex: "PN: 920-009599", "P/N: PE-R750", "Part Number: 12345", "Ref: 23400198", "Cód: 15724", "SKU: SNV2S/1000G"
  const explicitPnPatterns = [
    /(?:P\/?N|PART\s*NUMBER|PART#|ITEM#|PROD#)[:\s#-]+([A-Za-z0-9\-_./]{2,30})/i,
    /(?:REF(?:ER[EÊ]NCIA)?|C[OÓ]D(?:IGO)?|C[OÓ]D\.|SKU|MPN)[:\s#-]+([A-Za-z0-9\-_./]{2,30})/i
  ];

  for (const pattern of explicitPnPatterns) {
    const match = raw.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      const cleaned = cleanAlphanumericCode(candidate);
      if (cleaned && cleaned.length >= 2 && !NON_MODEL_TOKENS.has(cleaned)) {
        // Tenta também achar modelo explícito adjacente
        const modelMatch = raw.match(/(?:MODELO|MODEL|MOD)[:\s#-]+([A-Za-z0-9\-_./\s]{2,25})(?:$|[,\n|;]|\s-(?=\s))/i);
        const explicitModel = modelMatch ? modelMatch[1].trim() : candidate;
        return {
          partNumber: candidate,
          model: explicitModel,
          isExplicit: true
        };
      }
    }
  }

  // 1.2. Marcador EXPLÍCITO de Modelo
  // Ex: "Modelo: Lark M2S", "Model: P2723D", "Mod. GSB 13 RE"
  const explicitModelMatch = raw.match(/(?:MODELO|MODEL|MOD)[:\s#-]+([A-Za-z0-9\-_./\s]{2,25})(?:$|[,\n|;]|\s-(?=\s))/i);
  if (explicitModelMatch && explicitModelMatch[1]) {
    const modelCand = explicitModelMatch[1].trim();
    const cleanCand = cleanAlphanumericCode(modelCand);
    if (cleanCand && cleanCand.length >= 2 && !NON_MODEL_TOKENS.has(cleanCand)) {
      return {
        partNumber: modelCand,
        model: modelCand,
        isExplicit: true
      };
    }
  }

  // 1.3. Análise Heurística da Descrição: Busca de Modelos Reais incorporados no nome
  // Ex: "Microfone sem fio Hollyland Lark M2S Ultimate Combo" -> "Lark M2S" / "M2S"
  // Ex: "Monitor Dell 27 P2723D QHD" -> "P2723D"
  // Ex: "Projetor Epson PowerLite E20" -> "PowerLite E20"
  // Ex: "SSD Kingston NV2 1TB" -> "NV2"
  // Ex: "Teclado Logitech MX Keys Mini" -> "MX Keys Mini"
  // Ex: "Nobreak APC Back-UPS BZ1200-BR" -> "Back-UPS BZ1200-BR" / "BZ1200-BR"
  
  // A. Padrão Família + Código (ex: "Lark M2S", "PowerLite E20", "Back-UPS BZ1200", "MX Keys", "SohoPlus Cat6")
  const familyModelPattern = /\b(Lark\s+[A-Za-z0-9]+|PowerLite\s+[A-Za-z0-9]+|Back-UPS\s+[A-Za-z0-9\-]+|Voyager\s+[0-9]+[a-z]?|SohoPlus\s+[A-Za-z0-9]+|Latitude\s+[0-9]+|ThinkPad\s+[A-Za-z0-9]+|OptiPlex\s+[0-9]+|ProDesk\s+[0-9]+|ProBook\s+[0-9]+|Vostro\s+[0-9]+|IdeaPad\s+[A-Za-z0-9]+|Aspire\s+[A-Za-z0-9]+|MX\s+(?:Master|Keys|Anywhere)\s*[A-Za-z0-9]*)\b/i;
  const famMatch = raw.match(familyModelPattern);
  if (famMatch && famMatch[1]) {
    const famModel = famMatch[1].trim();
    // Extrai o código específico se houver (ex: de "Lark M2S" pega "M2S", de "PowerLite E20" pega "E20")
    const subCodeMatch = famModel.match(/\b([A-Za-z0-9\-]+)$/);
    const subCode = subCodeMatch ? subCodeMatch[1] : famModel;
    return {
      partNumber: subCode,
      model: famModel,
      isExplicit: false
    };
  }

  // B. Padrão Alfanumérico Misto Clássico de Peça/Modelo de Hardware
  // Ex: P2723D, M2S, C9200L, SNV2S, GSB13RE, P2500W, R28001008, PE-R750, 920-009599
  // Deve conter letras E números, ou ter hífens conectando blocos
  const alphanumericModelPattern = /\b([A-Z]{1,5}[0-9]{2,6}[A-Z0-9\-_]*|[0-9]{2,6}[A-Z]{1,5}[A-Z0-9\-_]*|[A-Z0-9]{2,8}-[A-Z0-9]{2,8}(?:-[A-Z0-9]{1,6})?)\b/i;
  const tokens = raw.split(/[\s,;|]+/);

  for (const token of tokens) {
    const cleanToken = token.replace(/^[(\[{<"']+|[)\]}>"':.,;]+$/g, '');
    const cleanUpper = cleanToken.toUpperCase();

    if (NON_MODEL_TOKENS.has(cleanUpper)) continue;
    // Ignora códigos puramente de medidas como 100M, 20MM, 18L, 305M, 220V
    if (/^[0-9]+(?:MM|CM|M|L|LT|KG|G|W|V|VA|HZ|GB|TB|POL)$/i.test(cleanToken)) continue;

    if (alphanumericModelPattern.test(cleanToken)) {
      // Validar tamanho razoável de código de modelo
      if (cleanToken.length >= 3 && cleanToken.length <= 25) {
        return {
          partNumber: cleanToken,
          model: cleanToken,
          isExplicit: false
        };
      }
    }
  }

  // C. Se tiver marca identificada, procurar modelo após a marca
  const brandToLook = (brandHint || '').trim().toUpperCase();
  const detectedBrand = brandToLook && brandToLook !== 'GENÉRICA' && brandToLook !== 'GENERICA'
    ? brandToLook
    : KNOWN_BRANDS.find(b => raw.toUpperCase().includes(b));

  if (detectedBrand) {
    const brandRegex = new RegExp(`\\b${detectedBrand}\\b\\s+([A-Za-z0-9\\-_]+(?:\\s+[A-Za-z0-9\\-_]+)?)`, 'i');
    const brandAfterMatch = raw.match(brandRegex);
    if (brandAfterMatch && brandAfterMatch[1]) {
      const cand = brandAfterMatch[1].trim();
      const candUpper = cand.toUpperCase();
      if (!NON_MODEL_TOKENS.has(candUpper) && !/^(sem|com|para|de|da|do)\b/i.test(cand)) {
        return {
          partNumber: cand,
          model: cand,
          isExplicit: false
        };
      }
    }
  }

  return { partNumber: '', model: '', isExplicit: false };
}

/**
 * 3. Fallback inteligente: Se não achou na descrição nem no scanner,
 * gera um modelo/part number de identificação padronizado para o produto nunca ficar sem código.
 * Formato limpo e profissional: [MARCA]-[SIGLA_PRODUTO]-[HASH_CURTO]
 */
export function generateFallbackProductCode(
  name: string | undefined,
  brand?: string,
  category?: string
): string {
  const cleanName = (name || '').trim().toUpperCase();
  if (!cleanName) {
    return `INF-${Date.now().toString().slice(-6)}`;
  }

  // Marca limpa
  let brandPrefix = (brand || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!brandPrefix || brandPrefix === 'GENERICA' || brandPrefix === 'GENERICA') {
    brandPrefix = 'INF';
  } else {
    brandPrefix = brandPrefix.slice(0, 6);
  }

  // Iniciais/Palavras-chave do nome
  const stopWords = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'PARA', 'COM', 'SEM', 'E', 'EM', 'POR', 'AO', 'AOS']);
  const words = cleanName
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stopWords.has(w));

  const keyword1 = words[0] ? words[0].slice(0, 5) : 'ITEM';
  const keyword2 = words[1] ? words[1].slice(0, 4) : '';
  const keyword3 = words.find(w => /[0-9]/.test(w)) ? words.find(w => /[0-9]/.test(w))!.slice(0, 5) : '';

  const parts = [brandPrefix, keyword1, keyword2, keyword3].filter(Boolean);
  const baseCode = parts.join('-');

  // Garante unicidade com hash curto de 3 caracteres determinísticos baseado no nome
  let hashVal = 0;
  for (let i = 0; i < cleanName.length; i++) {
    hashVal = ((hashVal << 5) - hashVal) + cleanName.charCodeAt(i);
    hashVal |= 0;
  }
  const hashSuffix = Math.abs(hashVal).toString(36).toUpperCase().slice(0, 3).padStart(3, '1');

  return `${baseCode}-${hashSuffix}`;
}

/**
 * RESOLVEDOR MESTRE OFICIAL (Regra do Lucas):
 * Coordena as 3 prioridades rigorosas:
 * 1. PRIORIDADE 1: Da própria descrição / texto de busca
 * 2. PRIORIDADE 2: Da busca do Scanner (Google Shopping / IA / Ofertas)
 * 3. PRIORIDADE 3: Fallback gerado inteligente (apenas se 1 e 2 não acharem nada)
 */
export function resolveProductModelAndPartNumber(params: {
  nameOrQuery?: string;
  description?: string;
  brand?: string;
  category?: string;
  scannerModel?: string;
  scannerPartNumber?: string;
  scannerOffers?: Array<{ title?: string; store?: string }>;
}): ResolvedProductCode {
  const {
    nameOrQuery,
    description,
    brand,
    category,
    scannerModel,
    scannerPartNumber,
    scannerOffers
  } = params;

  // --------------------------------------------------------------------------
  // PRIORIDADE 1: Tenta extrair da própria descrição / nome / query
  // --------------------------------------------------------------------------
  const fullText = [nameOrQuery, description].filter(Boolean).join(' — ');
  const fromText = extractModelAndPartNumberFromText(fullText, brand);

  if (fromText.isExplicit && fromText.partNumber) {
    const cleanPn = cleanAlphanumericCode(fromText.partNumber);
    return {
      partNumber: cleanPn || fromText.partNumber,
      model: fromText.model || fromText.partNumber,
      sku: cleanPn || fromText.partNumber,
      source: 'description_explicit'
    };
  }

  // --------------------------------------------------------------------------
  // PRIORIDADE 2: Se o texto trouxe modelo heurístico OU o scanner achou
  // --------------------------------------------------------------------------
  // 2.1. Se o scanner retornou part number real
  const cleanScannerPn = cleanAlphanumericCode(scannerPartNumber);
  if (cleanScannerPn && cleanScannerPn.length >= 2) {
    const finalModel = (scannerModel || '').trim() || fromText.model || cleanScannerPn;
    return {
      partNumber: cleanScannerPn,
      model: finalModel,
      sku: cleanScannerPn,
      source: 'scanner_result'
    };
  }

  // 2.2. Se o scanner retornou modelo real
  const cleanScannerModel = (scannerModel || '').trim();
  if (cleanScannerModel && cleanScannerModel.length >= 2) {
    const pnFromModel = cleanAlphanumericCode(cleanScannerModel);
    return {
      partNumber: pnFromModel || cleanScannerModel,
      model: cleanScannerModel,
      sku: pnFromModel || cleanScannerModel,
      source: 'scanner_result'
    };
  }

  // 2.3. Se o texto da descrição achou um modelo heurístico real (ex: "Lark M2S", "P2723D")
  if (fromText.model && fromText.model.length >= 2) {
    const cleanPn = cleanAlphanumericCode(fromText.partNumber || fromText.model);
    return {
      partNumber: cleanPn || fromText.partNumber || fromText.model,
      model: fromText.model,
      sku: cleanPn || fromText.partNumber || fromText.model,
      source: 'description_heuristic'
    };
  }

  // 2.4. Se houver ofertas do Google Shopping, tentar extrair modelo dos títulos das ofertas
  if (Array.isArray(scannerOffers) && scannerOffers.length > 0) {
    for (const offer of scannerOffers) {
      if (!offer.title) continue;
      const fromOffer = extractModelAndPartNumberFromText(offer.title, brand);
      if (fromOffer.model && fromOffer.model.length >= 2) {
        const cleanPn = cleanAlphanumericCode(fromOffer.partNumber || fromOffer.model);
        return {
          partNumber: cleanPn || fromOffer.model,
          model: fromOffer.model,
          sku: cleanPn || fromOffer.model,
          source: 'scanner_result'
        };
      }
    }
  }

  // --------------------------------------------------------------------------
  // PRIORIDADE 3: Fallback Inteligente (quando nada foi achado na descrição nem no scanner)
  // --------------------------------------------------------------------------
  const fallbackCode = generateFallbackProductCode(nameOrQuery, brand, category);
  return {
    partNumber: fallbackCode,
    model: fallbackCode,
    sku: fallbackCode,
    source: 'fallback_generated'
  };
}
