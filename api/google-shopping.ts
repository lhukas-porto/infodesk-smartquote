export const config = {
  runtime: 'nodejs'
};

export interface ShoppingOffer {
  title: string;
  price: number;
  priceFormatted: string;
  store: string;
  link: string;
  thumbnail?: string;
  delivery?: string;
  rating?: number;
  reviews?: number;
}

/**
 * Função utilitária para extrair valor numérico em reais de strings como "R$ 26,31" ou "26.31"
 */
function parsePrice(val: any): number {
  if (typeof val === 'number') return val;
  if (!val || typeof val !== 'string') return 0;
  
  // Limpa caracteres não numéricos exceto vírgula e ponto
  const clean = val.replace(/R\$\s*/i, '').trim();
  // Se contiver vírgula como decimal (ex: 26,31 ou 1.250,50)
  if (clean.includes(',')) {
    const normalized = clean.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : num;
  }
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function formatBrl(val: number): string {
  return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function handler(req: any, res: any) {
  // Garante compatibilidade com Connect middleware do Vite dev server
  if (!res.status) {
    res.status = (code: number) => ({
      json: (data: any) => {
        res.statusCode = code;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      },
      end: () => {
        res.statusCode = code;
        res.end();
      }
    });
  }

  // CORS flexível para chamadas do frontend
  const origin = (req.headers?.origin as string) || '';
  const isAllowedOrigin = 
    !origin || 
    origin.includes('localhost') || 
    origin.includes('127.0.0.1') || 
    origin.includes('vercel.app') || 
    origin.includes('infodesk');

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', isAllowedOrigin ? (origin || '*') : 'null');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const rawQ = (req.query?.q as string) || (req.body?.q as string) || '';
    const q = rawQ.trim().slice(0, 140);
    if (!q) {
      return res.status(200).json({ success: false, reason: 'empty_query', offers: [] });
    }

    const apiKey = (req.query?.apiKey as string) || 
      (req.body?.apiKey as string) || 
      process.env.SERPAPI_API_KEY || 
      process.env.VITE_SERPAPI_API_KEY || 
      process.env.VALUESERP_API_KEY || 
      '';

    if (!apiKey) {
      return res.status(200).json({ 
        success: false, 
        reason: 'no_api_key', 
        message: 'Nenhuma chave de SerpApi ou ValueSerp configurada.',
        offers: [] 
      });
    }

    const offers: ShoppingOffer[] = [];

    // 1. Tentativa via SerpApi (Google Shopping)
    try {
      const serpUrl = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(q)}&gl=br&hl=pt&google_domain=google.com.br&api_key=${encodeURIComponent(apiKey)}`;
      const serpRes = await fetch(serpUrl, { headers: { 'Accept': 'application/json' } });
      
      if (serpRes.ok) {
        const data = await serpRes.json();
        const rawResults = [
          ...(Array.isArray(data.shopping_results) ? data.shopping_results : []),
          ...(Array.isArray(data.ads) ? data.ads : []),
          ...(Array.isArray(data.inline_shopping) ? data.inline_shopping : [])
        ];

        for (const item of rawResults) {
          const title = (item.title || item.name || '').trim();
          const priceNum = typeof item.extracted_price === 'number' 
            ? item.extracted_price 
            : parsePrice(item.price || item.raw_price);
          
          const rawLink = item.link || item.product_link || item.direct_link || '';
          const store = (item.source || item.merchant?.name || item.seller || 'Loja Online').trim();

          if (title && priceNum > 0 && rawLink) {
            offers.push({
              title,
              price: priceNum,
              priceFormatted: formatBrl(priceNum),
              store,
              link: rawLink,
              thumbnail: item.thumbnail || item.image || undefined,
              delivery: item.delivery || item.shipping || undefined,
              rating: typeof item.rating === 'number' ? item.rating : undefined,
              reviews: typeof item.reviews === 'number' ? item.reviews : undefined
            });
          }
        }
      }
    } catch (serpErr) {
      console.warn('[Google Shopping SerpApi Error]:', serpErr);
    }

    // 2. Se a SerpApi não retornou ou se for chave do ValueSerp, tenta rota ValueSerp
    if (offers.length === 0) {
      try {
        const valUrl = `https://api.valueserp.com/search?api_key=${encodeURIComponent(apiKey)}&search_type=shopping&q=${encodeURIComponent(q)}&gl=br&hl=pt&google_domain=google.com.br`;
        const valRes = await fetch(valUrl, { headers: { 'Accept': 'application/json' } });

        if (valRes.ok) {
          const valData = await valRes.json();
          const rawItems = Array.isArray(valData.shopping_results) ? valData.shopping_results : [];
          for (const item of rawItems) {
            const title = (item.title || '').trim();
            const priceNum = typeof item.price_raw === 'number' ? item.price_raw : parsePrice(item.price);
            const link = item.link || '';
            const store = (item.merchant_name || item.source || 'Loja Online').trim();

            if (title && priceNum > 0 && link) {
              offers.push({
                title,
                price: priceNum,
                priceFormatted: formatBrl(priceNum),
                store,
                link,
                thumbnail: item.image || item.thumbnail || undefined,
                delivery: item.shipping_raw || undefined,
                rating: item.rating,
                reviews: item.reviews
              });
            }
          }
        }
      } catch (valErr) {
        console.warn('[Google Shopping ValueSerp Error]:', valErr);
      }
    }

    if (offers.length === 0) {
      return res.status(200).json({
        success: false,
        reason: 'no_offers_found',
        message: 'Nenhuma oferta patrocinada encontrada no Google Shopping para este produto.',
        offers: []
      });
    }

    // Ordena do MENOR preço para o maior
    offers.sort((a, b) => a.price - b.price);

    const bestOffer = offers[0];

    return res.status(200).json({
      success: true,
      bestOffer,
      offersCount: offers.length,
      offers
    });

  } catch (err: any) {
    console.error('[Google Shopping Serverless Error]:', err?.message);
    return res.status(500).json({ success: false, error: err?.message, offers: [] });
  }
}
