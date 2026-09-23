/**
 * Perfis de Precificação Comercial e Regras de Markup Dinâmico (MEL-07)
 * Permite aplicar margens inteligentes por categoria e faixa de valor,
 * evitando a perda de vendas de alto valor e maximizando lucros em acessórios.
 */

export interface PricingProfile {
  id: string;
  name: string;
  badge: string;
  description: string;
  defaultMarkup: number;
  rules: {
    maxCost?: number;
    minCost?: number;
    categoryKeywords?: string[];
    suggestedMarkup: number;
    label: string;
  }[];
}

export const PRICING_PROFILES: PricingProfile[] = [
  {
    id: 'corporativo_padrao',
    name: 'TI Corporativa Padrão',
    badge: 'Equilibrado',
    description: 'Perfil balanceado para vendas corporativas B2B (empresas médias e grandes).',
    defaultMarkup: 23.5,
    rules: [
      {
        maxCost: 60,
        categoryKeywords: ['cabo', 'conector', 'patch', 'keystone', 'adaptador', 'pilha'],
        suggestedMarkup: 50,
        label: 'Acessórios e Miudezas (< R$ 60)'
      },
      {
        minCost: 60,
        maxCost: 600,
        suggestedMarkup: 30,
        label: 'Periféricos e Componentes (R$ 60 a R$ 600)'
      },
      {
        minCost: 600,
        maxCost: 4000,
        suggestedMarkup: 22,
        label: 'Equipamentos e Switches (R$ 600 a R$ 4.000)'
      },
      {
        minCost: 4000,
        suggestedMarkup: 16,
        label: 'Servidores e Projetos de Alto Valor (> R$ 4.000)'
      }
    ]
  },
  {
    id: 'governo_licitacao',
    name: 'Governo / Pregão Eletrônico',
    badge: 'Competitivo',
    description: 'Margens agressivas focadas em vencer disputas de preço e editais públicos.',
    defaultMarkup: 15,
    rules: [
      {
        maxCost: 100,
        suggestedMarkup: 25,
        label: 'Insumos de Menor Valor (< R$ 100)'
      },
      {
        minCost: 100,
        maxCost: 3000,
        suggestedMarkup: 15,
        label: 'Equipamentos de Lote Geral'
      },
      {
        minCost: 3000,
        suggestedMarkup: 10,
        label: 'Grandes Lotes e Servidores (> R$ 3.000)'
      }
    ]
  },
  {
    id: 'acessorios_margem_alta',
    name: 'Atendimento Rápido / Balcão',
    badge: 'Alta Margem',
    description: 'Maximiza lucro em compras pontuais e emergenciais com pronta entrega.',
    defaultMarkup: 35,
    rules: [
      {
        maxCost: 150,
        suggestedMarkup: 65,
        label: 'Itens de Conveniência (< R$ 150)'
      },
      {
        minCost: 150,
        maxCost: 1500,
        suggestedMarkup: 40,
        label: 'Periféricos de Consumo'
      },
      {
        minCost: 1500,
        suggestedMarkup: 25,
        label: 'Equipamentos Principais'
      }
    ]
  },
  {
    id: 'revenda_parceira',
    name: 'Revenda / Parceiro B2B',
    badge: 'Repasse',
    description: 'Margem enxuta para intermediação e fornecimento a outras revendas integradoras.',
    defaultMarkup: 12,
    rules: [
      {
        maxCost: 500,
        suggestedMarkup: 18,
        label: 'Acessórios em Revenda'
      },
      {
        minCost: 500,
        suggestedMarkup: 10,
        label: 'Hardware para Revenda'
      }
    ]
  }
];

/**
 * Sugere o markup ideal para um item com base no custo e descrição dentro do perfil selecionado
 */
export function suggestMarkupForItem(
  profileId: string,
  costPrice: number,
  itemName: string = '',
  itemDesc: string = ''
): number {
  const profile = PRICING_PROFILES.find(p => p.id === profileId) || PRICING_PROFILES[0];
  const combinedText = `${itemName} ${itemDesc}`.toLowerCase();

  for (const rule of profile.rules) {
    // Checar palavras-chave de categoria
    if (rule.categoryKeywords && rule.categoryKeywords.some(kw => combinedText.includes(kw))) {
      return rule.suggestedMarkup;
    }

    const satisfiesMin = rule.minCost === undefined || costPrice >= rule.minCost;
    const satisfiesMax = rule.maxCost === undefined || costPrice <= rule.maxCost;

    if (satisfiesMin && satisfiesMax) {
      return rule.suggestedMarkup;
    }
  }

  return profile.defaultMarkup;
}
