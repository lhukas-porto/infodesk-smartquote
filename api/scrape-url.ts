export const config = {
  runtime: 'nodejs'
};

function parseBrlPrice(raw: string | number): number {
  if (typeof raw === 'number') return raw > 0 ? Number(raw.toFixed(2)) : 0;
  if (!raw || typeof raw !== 'string') return 0;

  const clean = raw.replace(/R\$\s*/gi, '').trim();
  if (clean.includes(',')) {
    const normalized = clean.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : Number(num.toFixed(2));
  }
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : Number(num.toFixed(2));
}

function identifyStoreFromUrl(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host.includes('mercadolivre') || host.includes('mercadolibre') || host.includes('meli.la')) return 'Mercado Livre';
    if (host.includes('amazon')) return 'Amazon';
    if (host.includes('kabum')) return 'KaBuM!';
    if (host.includes('kalunga')) return 'Kalunga';
    if (host.includes('magazineluiza') || host.includes('magalu')) return 'Magazine Luiza';
    if (host.includes('pichau')) return 'Pichau';
    if (host.includes('terabyteshop')) return 'TerabyteShop';
    if (host.includes('leroymerlin')) return 'Leroy Merlin';
    if (host.includes('casasbahia')) return 'Casas Bahia';
    if (host.includes('americanas')) return 'Americanas';
    return host;
  } catch {
    return 'Fornecedor';
  }
}

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      /^169\.254\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function extractPriceAndDetailsFromHtml(html: string): { price: number | null; title?: string; inStock: boolean } {
  if (!html || html.length < 50) return { price: null, inStock: false };

  let extractedPrice: number | null = null;
  let extractedTitle: string | undefined = undefined;
  let inStock = true;

  // 1. Schema.org JSON-LD (Altamente confiável)
  try {
    const jsonLdMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatches) {
      for (const block of jsonLdMatches) {
        const rawJson = block.replace(/<\/?script[^>]*>/gi, '').trim();
        try {
          const parsed = JSON.parse(rawJson);
          const inspectItem = (obj: any) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.name && !extractedTitle && typeof obj.name === 'string') {
              extractedTitle = obj.name.trim();
            }
            if (obj.offers) {
              const offerList = Array.isArray(obj.offers) ? obj.offers : [obj.offers];
              for (const off of offerList) {
                if (off) {
                  const p = parseBrlPrice(off.price || off.lowPrice || off.priceSpecification?.price);
                  if (p > 0 && (!extractedPrice || p < extractedPrice)) {
                    extractedPrice = p;
                  }
                  if (off.availability && typeof off.availability === 'string') {
                    if (off.availability.includes('OutOfStock') || off.availability.includes('Discontinued')) {
                      inStock = false;
                    }
                  }
                }
              }
            }
            if (Array.isArray(obj['@graph'])) {
              for (const sub of obj['@graph']) {
                inspectItem(sub);
              }
            }
          };
          inspectItem(parsed);
        } catch {
          // ignore json parse error
        }
      }
    }
  } catch {
    // ignore
  }

  // 2. OpenGraph e Meta Tags
  if (!extractedTitle) {
    const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      extractedTitle = titleMatch[1].trim();
    }
  }

  if (!extractedPrice) {
    const metaPatterns = [
      /<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']([0-9.,]+)["']/i,
      /<meta[^>]+content=["']([0-9.,]+)["'][^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["']/i,
      /<meta[^>]+(?:itemprop)=["']price["'][^>]+content=["']([0-9.,]+)["']/i,
      /<meta[^>]+content=["']([0-9.,]+)["'][^>]+(?:itemprop)=["']price["']/i
    ];
    for (const pat of metaPatterns) {
      const match = html.match(pat);
      if (match && match[1]) {
        const p = parseBrlPrice(match[1]);
        if (p > 0) {
          extractedPrice = p;
          break;
        }
      }
    }
  }

  // 3. Padrões específicos de e-commerce brasileiro
  if (!extractedPrice) {
    // Mercado Livre: andes-money-amount__fraction + andes-money-amount__cents
    const mlFraction = html.match(/class=["'][^"']*andes-money-amount__fraction[^"']*["']>([0-9.]+)</i);
    if (mlFraction && mlFraction[1]) {
      const centsMatch = html.match(/class=["'][^"']*andes-money-amount__cents[^"']*["']>([0-9]{2})</i);
      const fractionPart = mlFraction[1].replace(/\./g, '');
      const centsPart = centsMatch && centsMatch[1] ? centsMatch[1] : '00';
      const num = parseFloat(`${fractionPart}.${centsPart}`);
      if (!isNaN(num) && num > 0) {
        extractedPrice = Number(num.toFixed(2));
      }
    }
  }

  if (!extractedPrice) {
    // Amazon: a-offscreen ou a-price-whole
    const amazonOffscreen = html.match(/class=["'][^"']*a-offscreen[^"']*["']>R\$\s*([0-9.,]+)</i);
    if (amazonOffscreen && amazonOffscreen[1]) {
      const p = parseBrlPrice(amazonOffscreen[1]);
      if (p > 0) extractedPrice = p;
    } else {
      const amazonWhole = html.match(/class=["'][^"']*a-price-whole[^"']*["']>([0-9.]+)[<,\s]/i);
      if (amazonWhole && amazonWhole[1]) {
        const fractionMatch = html.match(/class=["'][^"']*a-price-fraction[^"']*["']>([0-9]{2})</i);
        const fraction = fractionMatch && fractionMatch[1] ? fractionMatch[1] : '00';
        const num = parseFloat(`${amazonWhole[1].replace(/\./g, '')}.${fraction}`);
        if (!isNaN(num) && num > 0) extractedPrice = Number(num.toFixed(2));
      }
    }
  }

  if (!extractedPrice) {
    // KaBuM / Pichau / Magazine Luiza
    const genericMatches = [
      /class=["'][^"']*finalPrice[^"']*["'][^>]*>R\$\s*([0-9.,]+)/i,
      /preco_desconto["']\s*:\s*["']?([0-9.,]+)["']?/i,
      /data-testid=["']price-value["'][^>]*>R\$\s*([0-9.,]+)/i,
      /class=["'][^"']*price-template__text[^"']*["'][^>]*>R\$\s*([0-9.,]+)/i
    ];
    for (const pat of genericMatches) {
      const match = html.match(pat);
      if (match && match[1]) {
        const p = parseBrlPrice(match[1]);
        if (p > 0) {
          extractedPrice = p;
          break;
        }
      }
    }
  }

  // Checagem de estoque por texto
  if (html.includes('Produto esgotado') || html.includes('Avise-me quando chegar') || html.includes('Sem estoque') || html.includes('Ops! Já vendemos todo o estoque')) {
    inStock = false;
  }

  return { price: extractedPrice, title: extractedTitle, inStock };
}

export default async function handler(req: any, res: any) {
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

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let targetUrl = '';
  if (req.method === 'GET') {
    targetUrl = (req.query?.url as string) || '';
  } else if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    targetUrl = body?.url || '';
  }

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).json({ success: false, error: 'Parâmetro url é obrigatório e deve iniciar com http:// ou https://' });
  }

  if (!isSafeExternalUrl(targetUrl)) {
    return res.status(400).json({ success: false, error: 'URL inválida ou direcionada para rede privada (SSRF bloqueado).' });
  }

  const store = identifyStoreFromUrl(targetUrl);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'no-cache'
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(200).json({
        success: false,
        store,
        error: `Servidor da loja retornou status HTTP ${response.status}`
      });
    }

    const html = await response.text();
    const { price, title, inStock } = extractPriceAndDetailsFromHtml(html);

    if (price && price > 0) {
      return res.status(200).json({
        success: true,
        price,
        priceFormatted: `R$ ${price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        store,
        inStock,
        title
      });
    }

    return res.status(200).json({
      success: false,
      store,
      title,
      error: 'Preço não identificado no HTML da loja (conteúdo gerado por script ou protegido).'
    });
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError';
    return res.status(200).json({
      success: false,
      store,
      error: isTimeout ? 'Tempo limite de 9s excedido ao conectar com a loja.' : (err?.message || 'Erro ao carregar página.')
    });
  }
}
