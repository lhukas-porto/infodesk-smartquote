import { extractItemsFromEmailContent, ParsedItem } from '../utils/aiEmailParser';

export interface ExtractedMultiItem {
  name: string;
  description: string;
  partNumber?: string;
  quantity: number;
  unit: string;
  estimatedCost?: number;
  itemCode?: string;
  ncm?: string;
  sourceUrl?: string;
  imageUrl?: string;
}

export interface MultiItemExtractionResult {
  items: ExtractedMultiItem[];
  source: 'gemini_ai' | 'heuristic_fallback';
  rawResponse?: string;
  error?: string;
}

/**
 * Motor de Extração Multi-Item Estruturada por IA (MEL-01)
 * Analisa e-mails corporativos, listas e textos livres em português brasileiro,
 * extraindo tabelas precisas de produtos, quantidades, Part Numbers e descrições.
 */
export async function extractQuoteItemsWithAI(
  rawText: string,
  apiKey?: string
): Promise<MultiItemExtractionResult> {
  if (!rawText || !rawText.trim()) {
    return { items: [], source: 'heuristic_fallback' };
  }

  const activeApiKey = apiKey || (import.meta as any).env?.VITE_GEMINI_API_KEY || localStorage.getItem('infodesk_gemini_api_key') || localStorage.getItem('gemini_api_key') || '';

  // Se não houver chave disponível, utiliza imediatamente a engine determinística com fallback
  if (!activeApiKey) {
    const fallbackItems = extractItemsFromEmailContent(rawText);
    return {
      items: fallbackItems.map(it => ({
        name: it.name,
        description: it.description || it.name,
        partNumber: it.partNumber,
        quantity: it.quantity || 1,
        unit: it.unit || 'UN',
        estimatedCost: it.estimatedCost,
        ncm: it.ncm
      })),
      source: 'heuristic_fallback'
    };
  }

  const systemInstruction = `
Você é um especialista em suprimentos corporativos e compras de TI no Brasil.
Sua missão é ler a solicitação de cotação ou e-mail corporativo fornecido e extrair TODOS os produtos/itens comerciais solicitados.

Para cada item identificado, retorne estritamente um objeto JSON com:
- name: Nome comercial claro e objetivo do produto com ortografia e acentuação da língua portuguesa estritamente preservadas (ex: "Lápis Preto HB", "Memória RAM 16GB", "Válvula Redutora", "Switch Aruba Instant On 1930 24G 4SFP+"). NUNCA remova acentos ou cedilhas dos nomes!
- description: Especificações técnicas solicitadas no texto, com acentuação correta da língua portuguesa
- partNumber: Código de fabricante / Part Number / Modelo exato se houver (ex: "JL682A", "SMC1500C", "01-SSC-0218")
- quantity: Quantidade numérica inteira ou decimal (ex: 2)
- unit: Unidade de medida (ex: "UN", "PC", "CX", "MT", "KIT")
- estimatedCost: Custo unitário em Reais caso mencionado, senão 0

Regras:
1. PRESERVE SEMPRE A ACENTUAÇÃO E CEDILHAS (ex: Lápis, Memória, Elétrico, Válvula, Conexão). NUNCA desacentue termos em português.
2. Ignore assinaturas, saudações formais, dados bancários, CNPJ e endereços que não sejam produtos.
3. Se houver 10 itens em formato de lista ou tabela, extraia todos os 10 itens como elementos da lista.
4. Retorne APENAS um array JSON de itens, sem texto antes ou depois.
`;

  const prompt = `Texto da solicitação de cotação:\n"""\n${rawText.slice(0, 12000)}\n"""`;

  const models = [
    'gemini-flash-lite-latest',
    'gemini-3.6-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash'
  ];

  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeApiKey}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemInstruction}\n\n${prompt}` }]
            }
          ],
          generationConfig: {
            response_mime_type: 'application/json',
            temperature: 0.1
          }
        })
      });

      if (!response.ok) continue;

      const data = await response.json();
      const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidateText) continue;

      let parsed = JSON.parse(candidateText);
      if (!Array.isArray(parsed) && parsed.items && Array.isArray(parsed.items)) {
        parsed = parsed.items;
      }

      if (!Array.isArray(parsed)) continue;

      const cleanedItems: ExtractedMultiItem[] = parsed.map((item: any) => ({
        name: String(item.name || item.description || 'Produto').trim(),
        description: String(item.description || item.name || '').trim(),
        partNumber: item.partNumber ? String(item.partNumber).trim() : undefined,
        quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
        unit: item.unit ? String(item.unit).trim().toUpperCase() : 'UN',
        estimatedCost: typeof item.estimatedCost === 'number' && item.estimatedCost > 0 ? item.estimatedCost : 0,
        ncm: item.ncm ? String(item.ncm).replace(/[^0-9]/g, '') : undefined
      }));

      if (cleanedItems.length === 0) continue;

      return {
        items: cleanedItems,
        source: 'gemini_ai',
        rawResponse: candidateText
      };
    } catch (error: any) {
      console.warn(`[multiItemExtractorService] Modelo ${model} falhou:`, error?.message);
    }
  }

  console.warn('[multiItemExtractorService] Todos os modelos falharam, usando fallback heurístico');
  const fallbackItems = extractItemsFromEmailContent(rawText);
  return {
    items: fallbackItems.map(it => ({
      name: it.name,
      description: it.description || it.name,
      partNumber: it.partNumber,
      quantity: it.quantity || 1,
      unit: it.unit || 'UN',
      estimatedCost: it.estimatedCost,
      ncm: it.ncm
    })),
    source: 'heuristic_fallback'
  };
}
