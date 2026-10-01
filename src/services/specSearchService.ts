import { getStoredGeminiKey } from './priceScannerService';
import { cleanAlphanumericCode, cleanNcmCode } from '../utils/aiEmailParser';

export interface SpecSearchParams {
  productName: string;
  brand?: string;
  partNumber?: string;
  category?: string;
  geminiApiKey?: string;
}

export interface SpecSearchResult {
  description: string;
  ncm?: string;
  partNumber?: string;
  brand?: string;
  model?: string;
}

const SPEC_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
];

/**
 * Busca na web as especificações técnicas oficiais e ficha técnica do fabricante a partir do nome do produto.
 */
export async function fetchProductSpecsOnline(params: SpecSearchParams): Promise<SpecSearchResult> {
  const query = (params.productName || '').trim();
  if (!query) {
    throw new Error('Nome do produto não informado para pesquisa.');
  }

  const apiKey = params.geminiApiKey || getStoredGeminiKey();
  if (!apiKey) {
    throw new Error('Chave de API do Gemini não configurada. Configure em Configurações.');
  }

  const prompt = `Você é um engenheiro sênior especialista em catalogação e ficha técnica de produtos da Infodesk Store e SmartQuote Brasil.
Pesquise na internet as especificações técnicas oficiais e folha de dados (datasheet) deste produto:
- Nome do Produto: "${query}"
${params.brand ? `- Marca/Fabricante: "${params.brand}"` : ''}
${params.partNumber ? `- Part Number / Código: "${params.partNumber}"` : ''}
${params.category ? `- Categoria: "${params.category}"` : ''}

SUA MISSÃO:
1. Realize uma busca profunda no Google pelas especificações técnicas reais do modelo oficial.
2. Escreva uma descrição técnica e comercial impecável em português do Brasil com acentuação e cedilhas completas:
   - 1 a 2 parágrafos objetivos descrevendo o produto, suas principais utilidades, benefícios e aplicação prática. NUNCA use vírgulas para separar atributos técnicos.
   - Uma seção clara de especificações técnicas iniciada por "Especificações Técnicas:" com marcadores em bullet point ("• "):
     Exemplo de estrutura:
     [Parágrafo de introdução comercial e técnica do produto com diferenciais e materiais...]

     Especificações Técnicas:
     • Característica 1: Valor
     • Característica 2: Valor
     • Conectividade: ...
     • Dimensões / Peso: ...
     • Conteúdo da Embalagem: ...

3. DIRETRIZES DE FIDELIDADE (REGRA DE OURO):
   - "partNumber": Part Number oficial APENAS se constar explicitamente do catálogo ou site do fabricante. Se não tiver certeza absoluta direta do fabricante, retorne string vazia "". NUNCA invente Part Numbers!
   - "model": Modelo oficial APENAS se constar do fabricante, senão "".
   - "ncm": Código NCM oficial de 8 dígitos para classificação fiscal brasileira (ex: 8471.70.40, 8528.52.00).
   - "brand": Marca oficial autêntica do produto.

Retorne ESTRITAMENTE um JSON válido no formato:
{
  "description": "Texto completo dos parágrafos e da seção de Especificações Técnicas com marcadores • ...",
  "partNumber": "",
  "model": "",
  "ncm": "",
  "brand": ""
}`;

  for (const model of SPEC_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      
      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        // Tenta sem grounding se falhar por suporte a tools
        const fallbackRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.15,
              responseMimeType: 'application/json'
            }
          })
        });
        if (!fallbackRes.ok) continue;
        const fallbackData = await fallbackRes.json();
        const text = fallbackData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = parseSpecJson(text);
          if (parsed && parsed.description) return parsed;
        }
        continue;
      }

      const data = await res.json();
      const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textOutput) continue;

      const parsed = parseSpecJson(textOutput);
      if (parsed && parsed.description) {
        return parsed;
      }
    } catch (err) {
      console.warn(`[fetchProductSpecsOnline] Falha no modelo ${model}:`, err);
    }
  }

  throw new Error('Não foi possível obter as especificações na web no momento. Tente novamente em instantes.');
}

function parseSpecJson(raw: string): SpecSearchResult | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const obj = JSON.parse(match[0]);
    if (!obj.description || typeof obj.description !== 'string') return null;

    return {
      description: obj.description.trim(),
      ncm: cleanNcmCode(obj.ncm || ''),
      partNumber: cleanAlphanumericCode(obj.partNumber || ''),
      brand: obj.brand ? String(obj.brand).trim() : undefined,
      model: obj.model ? String(obj.model).trim() : undefined
    };
  } catch {
    return null;
  }
}
