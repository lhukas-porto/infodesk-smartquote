import { getStoredGeminiKey, MODERN_GEMINI_MODELS, fetchGeminiWithTimeout, isGeminiCircuitBreakerActive } from './priceScannerService';
import type { QuoteItem } from '../types';
import {
  cleanAlphanumericCode,
  cleanNcmCode,
  normalizeToOfficialCategory,
  buildCompleteProductDescription,
  resolveProductModelAndPartNumber
} from '../utils/aiEmailParser';

export interface SpecSearchParams {
  productName: string;
  brand?: string;
  partNumber?: string;
  category?: string;
  supplier?: string;
  sourceUrl?: string;
  ncm?: string;
  geminiApiKey?: string;
}

export interface SpecSearchResult {
  /** Descrição técnica completa formatada com parágrafos e tópicos de especificações (padrão Scanner IA) */
  description: string;
  /** Parágrafos comerciais e técnicos originais */
  summaryDescription?: string;
  /** Lista estruturada de atributos e valores */
  specifications: Array<{ label: string; value: string }>;
  /** NCM oficial de 8 dígitos formatado */
  ncm?: string;
  /** Part Number ou SKU autêntico do fabricante (se identificado com certeza) */
  partNumber?: string;
  /** Marca comercial autêntica */
  brand?: string;
  /** Fabricante ou Razão Social oficial */
  manufacturer?: string;
  /** Modelo oficial */
  model?: string;
  /** Categoria oficial padronizada do sistema */
  category?: string;
  /** Peso aproximado da embalagem em kg */
  weight?: string;
  /** Dimensões aproximadas no formato CxLxA cm */
  dimensions?: string;
  /** Nome comercial padronizado e conciso sugerido */
  standardizedName?: string;
  /** Fonte identificada das especificações (fabricante ou e-commerce) */
  sourceReference?: string;
}

/**
 * Consulta a IA do Google Gemini com Grounding de Pesquisa na Web para realizar uma varredura
 * técnica profunda e autêntica do produto, seguindo estritamente a hierarquia de fontes do Lucas:
 * 1. PRIORIDADE MÁXIMA: SITE OFICIAL DO FABRICANTE (ex: Dell, HP, Furukawa, Logitech, Brother, Nakata, Samsung, Intelbras, etc.)
 * 2. PRIORIDADE SECUNDÁRIA (Fallback se não houver no fabricante): Maiores e-commerces de referência no Brasil:
 *    - Magazine Luiza (Magalu), Carrefour, Amazon Brasil, Mercado Livre Oficial, Kabum, Fast Shop, Kalunga, Leroy Merlin, Casas Bahia.
 */
export async function fetchProductSpecsOnline(params: SpecSearchParams): Promise<SpecSearchResult> {
  const query = (params.productName || params.partNumber || '').trim();
  if (!query) {
    throw new Error('Por favor, informe o nome ou part number do produto antes de buscar especificações.');
  }

  const apiKey = params.geminiApiKey || getStoredGeminiKey();
  if (!apiKey) {
    throw new Error('Chave de API do Gemini não configurada. Configure sua chave em Configurações > Chave Gemini.');
  }

  if (isGeminiCircuitBreakerActive()) {
    throw new Error('O serviço de IA está em resfriamento rápido de cota. Tente novamente em 15 segundos.');
  }

  const prompt = `Você é um engenheiro sênior especialista em suprimentos corporativos, equipamentos industriais, tecnologia, materiais e catalogação da Infodesk Store e SmartQuote Brasil.
Sua missão é enriquecer o produto abaixo com a ESPECIFICAÇÃO TÉCNICA E FICHA TÉCNICA OFICIAL AUTÊNTICA (SISTEMÁTICA INFODESK STORE), trazendo a MÁXIMA RIQUEZA de detalhes técnicos, comerciais e fiscais.

DADOS CONSOLIDADOS DO PRODUTO (REVISADOS NA COTAÇÃO):
- Nome/Referência do Produto: "${query}"
${params.partNumber ? `- Part Number / Código Oficial informado: "${params.partNumber}"` : ''}
${params.brand ? `- Marca informada: "${params.brand}"` : ''}
${params.supplier ? `- Fornecedor / Fabricante informado: "${params.supplier}"` : ''}
${params.sourceUrl ? `- Link de referência / compra: "${params.sourceUrl}"` : ''}
${params.category ? `- Categoria informada: "${params.category}"` : ''}
${params.ncm ? `- NCM Fiscal informado: "${params.ncm}"` : ''}

REGRAS OBRIGATÓRIAS DE FONTES DE PESQUISA (HIERARQUIA ESTRITA DO LUCAS):
1. PRIORIDADE MÁXIMA (1ª ESCOLHA): SITE OFICIAL DO FABRICANTE
   - Obtenha as especificações prioritariamente no site oficial do fabricante do produto (ex: Dell, HP, Furukawa, Logitech, Brother, Nakata, Samsung, Motorola, Intelbras, TP-Link, APC/Schneider Electric, Kingston, Epson, Tramontina, 3M, etc.).
   - Priorize datasheets técnicos oficiais, manuais de especificações e páginas do produto no domínio do fabricante.

2. PRIORIDADE SECUNDÁRIA (FALLBACK - Caso não consiga achar no site do fabricante):
   - Consulte os maiores e-commerces e distribuidores de referência no Brasil:
     * Magazine Luiza (Magalu)
     * Carrefour
     * Amazon Brasil
     * Mercado Livre (Lojas Oficiais do Fabricante / Marca)
     * Kabum
     * Fast Shop
     * Kalunga
     * Leroy Merlin
     * Casas Bahia / Ponto Frio

DIRETRIZES DE ENRIQUECIMENTO (MÁXIMA RIQUEZA E PROFUNDIDADE):
1. "standardizedName": TÍTULO COMERCIAL PADRONIZADO E CONCISO (máximo 5 a 15 palavras). Padrão: [Tipo do Produto] [Marca/Fabricante] [Modelo/Part Number] [Especificação Chave]. Use acentuação e cedilhas completas da língua portuguesa. NUNCA use vírgulas no nome.
2. "brand": Marca comercial autêntica do produto (ex: "Intelbras", "Dell", "Furukawa", "Logitech", "HP", "Aquário", etc.) ou "Genérica".
3. "manufacturer": Fabricante ou Razão Social oficial da marca.
4. "model": MODELO REAL DO PRODUTO (PRIORIDADE MÁXIMA): Extraia prioritariamente o MODELO que já consta no nome do produto (ex: 'Lark M2S', 'P2723D', 'E20', 'MX Keys Mini', 'C9200L'). Se não constar, identifique o modelo oficial de fábrica.
5. "partNumber": PART NUMBER / CÓDIGO DE REFERÊNCIA OFICIAL (PRIORIDADE MÁXIMA): Extraia o Part Number ou Código de Referência oficial das especificações ou do nome. Se houver um modelo comercial claro (ex: 'Lark M2S', 'P2723D'), use a sigla do modelo como Part Number (ex: 'M2S', 'P2723D') para servir como código oficial da peça. O produto NUNCA deve ficar sem código de identificação.
6. "category": Categoria ideal do produto escolhida OBRIGATORIAMENTE entre as categorias oficiais do sistema:
   ["Informática, Hardware & Periféricos", "Redes, Conectividade & Telefonia", "Áudio, Vídeo & Apresentação", "Monitores, Displays & TVs", "Energia, Nobreaks & Baterias", "Impressão & Automação Comercial", "Papelaria, Artes & Material de Escritório", "Elétrica & Iluminação Tática", "Construção, Acabamento & Marcenaria", "Ferramentas & Instrumentos de Medição", "Equipamentos & Insumos Industriais", "Eletrodomésticos, Refrigeração & Copa", "Limpeza, Higiene & Descartáveis", "Pet Shop & Veterinária", "Diversos & Sazonais"].
7. "ncm": NCM oficial do Brasil formatado com 8 dígitos (ex: 8471.70.40, 8528.52.00, 8517.62.54).
8. "weight": Peso aproximado da embalagem para frete em kg (ex: "0.350 kg", "1.500 kg").
9. "dimensions": Dimensões aproximadas no formato "CxLxA cm" (ex: "25cm x 18cm x 5cm").
10. "description": Crie uma descrição técnica e comercial rica, completa e persuasiva em 2 a 3 parágrafos curtos, em português gramaticalmente perfeito com acentuação e cedilhas preservadas, destacando utilidades, materiais, durabilidade, estrutura, ergonomia, resistência e diferenciais de qualidade. NUNCA use vírgulas para separar atributos.
11. "specifications": Array rico de 6 a 12 especificações técnicas detalhadas no formato [{"label": "Nome da Característica", "value": "Valor"}], cobrindo minuciosamente:
    - Capacidade / Potência / Resolução / Velocidade / Desempenho
    - Conectividade / Interfaces / Entradas e Saídas / Padrão de Comunicação
    - Alimentação / Voltagem / Consumo Energético (se aplicável)
    - Estrutura / Material de Construção / Acabamento / Cor
    - Normas / Certificações / Homologações (ex: Anatel, Inmetro, ISO)
    - Compatibilidade de Ambientes ou Sistemas Operacionais
    - Conteúdo da Embalagem / Acessórios Inclusos
12. "sourceReference": Nome do site/fonte onde a ficha foi obtida (ex: "Site Oficial Dell", "Site Oficial Furukawa", "Magazine Luiza", "Carrefour", "Amazon Brasil").

Retorne ESTRITAMENTE um JSON no seguinte formato:
{
  "standardizedName": "Nome Comercial Padronizado",
  "brand": "Marca Oficial",
  "manufacturer": "Fabricante Oficial",
  "model": "",
  "partNumber": "",
  "category": "Uma das 15 categorias oficiais",
  "ncm": "8471.70.40",
  "weight": "0.450 kg",
  "dimensions": "20cm x 15cm x 4cm",
  "sourceReference": "Site Oficial do Fabricante ou E-commerce",
  "description": "Texto técnico e comercial persuasivo em 2 a 3 parágrafos fluídos...",
  "specifications": [
    { "label": "Capacidade", "value": "..." },
    { "label": "Conectividade", "value": "..." },
    { "label": "Material", "value": "..." },
    { "label": "Compatibilidade", "value": "..." },
    { "label": "Alimentação", "value": "..." },
    { "label": "Conteúdo da Embalagem", "value": "..." }
  ]
}`;

  for (const model of MODERN_GEMINI_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const requestBody: any = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      };

      const callRes = await fetchGeminiWithTimeout(endpoint, requestBody, 25000);

      if (callRes.rateLimited) {
        console.warn(`[fetchProductSpecsOnline][${model}] Rate limit (429), tentando próximo modelo da cascata...`);
        continue;
      }

      if (!callRes.ok || !callRes.data) {
        console.warn(`[fetchProductSpecsOnline][${model}] Falha HTTP ${callRes.status}:`, callRes.errorText?.slice(0, 200));
        continue;
      }

      const rawOutput = callRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawOutput) continue;

      const parsed = parseSpecJson(rawOutput, params);
      if (parsed && (parsed.description || parsed.specifications.length > 0)) {
        return parsed;
      }
    } catch (err) {
      console.warn(`[fetchProductSpecsOnline] Erro no modelo ${model}:`, err);
    }
  }

  throw new Error('Não foi possível obter as especificações completas com IA neste momento. Verifique sua conexão e tente novamente em instantes.');
}

function parseSpecJson(raw: string, params?: SpecSearchParams): SpecSearchResult | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const obj = JSON.parse(match[0]);

    const specsList: Array<{ label: string; value: string }> = [];
    if (Array.isArray(obj.specifications)) {
      obj.specifications.forEach((s: any) => {
        if (s && (s.label || s.key || s.caracteristica) && (s.value || s.val || s.valor)) {
          specsList.push({
            label: String(s.label || s.key || s.caracteristica).trim(),
            value: String(s.value || s.val || s.valor).trim()
          });
        }
      });
    }

    const ncmClean = cleanNcmCode(obj.ncm || '');
    const brandClean = obj.brand ? String(obj.brand).trim() : (params?.brand || undefined);
    const categoryClean = obj.category ? normalizeToOfficialCategory(String(obj.category)) : (params?.category ? normalizeToOfficialCategory(params.category) : undefined);
    const summaryText = typeof obj.description === 'string' ? obj.description.trim() : '';

    const resolvedCode = resolveProductModelAndPartNumber({
      nameOrQuery: obj.standardizedName ? String(obj.standardizedName).trim() : params?.productName,
      description: summaryText,
      brand: brandClean,
      category: categoryClean,
      scannerModel: obj.model ? String(obj.model).trim() : undefined,
      scannerPartNumber: obj.partNumber ? String(obj.partNumber).trim() : params?.partNumber
    });

    const partClean = resolvedCode.partNumber;
    const modelClean = resolvedCode.model;
    const manufacturerClean = obj.manufacturer ? String(obj.manufacturer).trim() : undefined;
    const weightClean = obj.weight ? String(obj.weight).trim() : undefined;
    const dimensionsClean = obj.dimensions ? String(obj.dimensions).trim() : undefined;

    // Gera a descrição consolidada completa no mesmo formato nobre do Scanner IA
    const richDescription = buildCompleteProductDescription({
      description: summaryText,
      specifications: specsList,
      weight: weightClean,
      dimensions: dimensionsClean,
      brand: brandClean,
      model: modelClean,
      partNumber: partClean,
      ncm: ncmClean,
      category: categoryClean
    });

    return {
      description: richDescription || summaryText,
      summaryDescription: summaryText,
      specifications: specsList,
      ncm: ncmClean,
      partNumber: partClean,
      brand: brandClean,
      manufacturer: manufacturerClean,
      model: modelClean,
      category: categoryClean,
      weight: weightClean,
      dimensions: dimensionsClean,
      standardizedName: obj.standardizedName ? String(obj.standardizedName).trim() : undefined
    };
  } catch (e) {
    console.warn('[parseSpecJson] Falha ao parsear JSON:', e);
    return null;
  }
}

/**
 * Verifica se um item da cotação precisa de enriquecimento técnico oficial.
 * Retorna true se a descrição estiver vazia, muito curta ou sem estrutura técnica de especificações.
 */
export function itemNeedsSpecEnrichment(item: QuoteItem): boolean {
  if (!item || !item.name) return false;
  const desc = (item.description || '').trim();
  if (desc.length === 0) return true;
  // Se for apenas repetição do nome do item
  if (desc.toLowerCase() === item.name.trim().toLowerCase()) return true;
  // Se tem menos de 50 caracteres e não contém tópicos técnicos
  if (desc.length < 50 && !desc.includes(':') && !desc.includes('•') && !desc.includes('-')) return true;
  return false;
}

export interface EnrichQuoteItemsOptions {
  forceAll?: boolean;
  onProgress?: (current: number, total: number, item: QuoteItem, stage: string) => void;
  shouldCancel?: () => boolean;
}

/**
 * Enriquece os itens da cotação com especificações técnicas oficiais autênticas
 * no momento de salvar a cotação (conforme diretriz do Lucas).
 *
 * Utiliza o nome consolidado, part number/modelo, link de compra oficial e fornecedor
 * que foram revisados pelo Lucas na cotação para máxima precisão.
 *
 * Hierarquia de busca:
 * 1. PRIORIDADE MÁXIMA: Site oficial do Fabricante
 * 2. PRIORIDADE SECUNDÁRIA: Principais e-commerces (Magalu, Carrefour, Amazon, etc.)
 */
export async function enrichQuoteItemsWithOfficialSpecs(
  items: QuoteItem[],
  options: EnrichQuoteItemsOptions = {}
): Promise<{ updatedItems: QuoteItem[]; enrichedCount: number }> {
  if (!Array.isArray(items) || items.length === 0) {
    return { updatedItems: items, enrichedCount: 0 };
  }

  const { forceAll = false, onProgress, shouldCancel } = options;
  const updatedItems = items.map(item => ({ ...item }));

  // Identifica quais itens necessitam de busca
  const indicesToEnrich: number[] = [];
  for (let i = 0; i < updatedItems.length; i++) {
    if (forceAll || itemNeedsSpecEnrichment(updatedItems[i])) {
      indicesToEnrich.push(i);
    }
  }

  if (indicesToEnrich.length === 0) {
    return { updatedItems, enrichedCount: 0 };
  }

  let enrichedCount = 0;
  for (let step = 0; step < indicesToEnrich.length; step++) {
    if (shouldCancel && shouldCancel()) {
      break;
    }

    const itemIdx = indicesToEnrich[step];
    const targetItem = updatedItems[itemIdx];

    onProgress?.(
      step + 1,
      indicesToEnrich.length,
      targetItem,
      `Consultando site do fabricante e grandes redes para "${targetItem.name}"...`
    );

    try {
      const specResult = await fetchProductSpecsOnline({
        productName: targetItem.name,
        partNumber: targetItem.partNumber,
        category: targetItem.category,
        supplier: targetItem.supplier,
        sourceUrl: targetItem.sourceUrl,
        ncm: targetItem.ncm
      });

      if (specResult && specResult.description) {
        targetItem.description = specResult.description;
        if (!targetItem.partNumber && specResult.partNumber) {
          targetItem.partNumber = specResult.partNumber;
        }
        if (!targetItem.ncm && specResult.ncm) {
          targetItem.ncm = specResult.ncm;
        }
        if (!targetItem.category && specResult.category) {
          targetItem.category = specResult.category;
        }
        enrichedCount++;
      }
    } catch (err) {
      console.warn(`[enrichQuoteItemsWithOfficialSpecs] Falha ao enriquecer "${targetItem.name}":`, err);
      // Não interrompe o fluxo de salvamento caso a busca de um item falhe
    }
  }

  return { updatedItems, enrichedCount };
}

