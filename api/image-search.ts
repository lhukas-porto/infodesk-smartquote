export const config = {
  runtime: 'nodejs'
};

const imageIpRateMap = new Map<string, { count: number; resetAt: number }>();

function generateQueryVariations(rawQuery: string): string[] {
  const clean = (rawQuery || '')
    .replace(/["'()[\]{}#*]/g, ' ')
    .replace(/[,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return [];

  const variations: string[] = [clean];

  // 1. Remove termos excessivos de especificações secundárias
  const stripped = clean
    .replace(/\b\d+([.,]\d+)?\s*(rpm|mb|gb|tb|mhz|ghz|va|w|v|bivolt|220v|110v|un|pct|kit|cx|metros?|m)\b/gi, ' ')
    .replace(/\b(sata\s*(iii|3|ii|2)?|nvme|pcie|ddr[345]|soho\s*plus)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (stripped && stripped !== clean && stripped.length >= 3) {
    variations.push(stripped);
  }

  // 2. Extrai marca + modelo ou código alfanumérico se existir
  const codeMatch = clean.match(/\b([A-Z0-9]{3,}-[A-Z0-9]+|[A-Z0-9]{5,})\b/i);
  const words = clean.split(' ').filter(w => w.length >= 2);
  if (codeMatch && words.length > 0) {
    const brand = words[0];
    const brandAndCode = `${brand} ${codeMatch[0]}`;
    if (brandAndCode.toLowerCase() !== clean.toLowerCase()) {
      variations.push(brandAndCode);
    }
  }

  // 3. 4 primeiras palavras mais significativas (marca + linha + modelo)
  if (words.length > 4) {
    variations.push(words.slice(0, 4).join(' '));
  }

  return Array.from(new Set(variations));
}

async function fetchDuckDuckGoImages(q: string, maxResults = 10): Promise<string[]> {
  try {
    const tokenRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://duckduckgo.com/'
        }
      }
    );

    const setCookie = tokenRes.headers.get('set-cookie') || '';
    const html = await tokenRes.text();
    const vqdMatch = html.match(/vqd=['"]?([^'"&\s]+)/i);
    if (!vqdMatch) return [];

    const vqd = vqdMatch[1];
    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=,,,&p=1`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Referer': 'https://duckduckgo.com/',
          'Cookie': setCookie,
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );

    if (!imgRes.ok) return [];

    const data = await imgRes.json();
    const rawList = Array.isArray(data?.results) ? data.results : [];
    const results: string[] = [];
    const seen = new Set<string>();

    for (const r of rawList) {
      const url = r.image || r.thumbnail;
      if (!url || typeof url !== 'string' || !url.startsWith('https://')) continue;
      if (
        url.includes('.svg') ||
        url.includes('placeholder') ||
        url.includes('data:image') ||
        url.includes('unsplash.com')
      ) {
        continue;
      }
      if (seen.has(url)) continue;
      seen.add(url);
      results.push(url);
      if (results.length >= maxResults) break;
    }

    return results;
  } catch (err: any) {
    console.warn('[DDG Image Fetch Error]:', err?.message);
    return [];
  }
}

async function fetchSerpApiImages(q: string, apiKey: string, maxResults = 10): Promise<string[]> {
  if (!apiKey) return [];
  try {
    const serpUrl = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(q)}&gl=br&hl=pt&api_key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(serpUrl, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];

    const data = await res.json();
    const raw = Array.isArray(data?.images_results) ? data.images_results : [];
    const results: string[] = [];
    const seen = new Set<string>();

    for (const item of raw) {
      const url = item.original || item.thumbnail;
      if (!url || typeof url !== 'string' || !url.startsWith('https://')) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      results.push(url);
      if (results.length >= maxResults) break;
    }

    return results;
  } catch (err: any) {
    console.warn('[SerpApi Images Error]:', err?.message);
    return [];
  }
}

async function fetchBingImages(q: string, maxResults = 10): Promise<string[]> {
  try {
    const bingRes = await fetch(
      `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2&first=1`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept':
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      }
    );

    if (!bingRes.ok) return [];

    const html = await bingRes.text();
    const matches = [...html.matchAll(/murl&quot;:&quot;(https?:\/\/[^&"]+)&quot;/g)].map(
      (m) => m[1]
    );

    const filtered: string[] = [];
    const seen = new Set<string>();

    for (const url of matches) {
      if (!url.startsWith('https://')) continue;
      if (
        url.includes('.svg') ||
        url.includes('placeholder') ||
        url.includes('data:image') ||
        url.includes('unsplash.com')
      )
        continue;
      if (seen.has(url)) continue;
      seen.add(url);
      filtered.push(url);
      if (filtered.length >= maxResults) break;
    }

    return filtered;
  } catch (err: any) {
    console.warn('[Bing Fallback Error]:', err?.message);
    return [];
  }
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

  // CORS restrito e seguro para origens oficiais
  const origin = (req.headers?.origin as string) || '';
  const isAllowedOrigin = 
    !origin || 
    origin.startsWith('http://localhost:') || 
    origin.startsWith('http://127.0.0.1:') || 
    origin === 'https://infodesk-smartquote.vercel.app' || 
    (/^https:\/\/infodesk-smartquote[a-z0-9-]*\.vercel\.app$/.test(origin));

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', isAllowedOrigin ? (origin || '*') : 'null');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Rate Limiting defensivo por IP (máximo 60 req/min)
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'local';
  const now = Date.now();
  const rateInfo = imageIpRateMap.get(clientIp);
  if (rateInfo && rateInfo.resetAt > now) {
    if (rateInfo.count >= 60) {
      return res.status(429).json({ success: false, error: 'Limite de taxa excedido (60 req/min). Aguarde alguns segundos.' });
    }
    rateInfo.count++;
  } else {
    imageIpRateMap.set(clientIp, { count: 1, resetAt: now + 60000 });
  }

  try {
    const rawQ = (req.query?.q as string) || '';
    const q = rawQ.trim().slice(0, 160);
    if (!q) {
      return res.status(200).json({ success: false, images: [] });
    }

    const serpApiKey = 
      process.env.SERPAPI_API_KEY || 
      process.env.VITE_SERPAPI_API_KEY || 
      '';

    const queryVariations = generateQueryVariations(q);
    const collectedImages: string[] = [];
    const seen = new Set<string>();

    const addImages = (imgs: string[]) => {
      for (const img of imgs) {
        if (!seen.has(img)) {
          seen.add(img);
          collectedImages.push(img);
        }
      }
    };

    // 1. Tenta varredura com DuckDuckGo (Motor Primário ultra veloz e resiliente)
    for (const queryVariant of queryVariations) {
      const ddgImages = await fetchDuckDuckGoImages(queryVariant, 10);
      if (ddgImages.length > 0) {
        addImages(ddgImages);
        if (collectedImages.length >= 8) break;
      }
    }

    // 2. Se não encontrou imagens e houver chave SerpApi, consulta Google Images
    if (collectedImages.length === 0 && serpApiKey) {
      for (const queryVariant of queryVariations) {
        const serpImages = await fetchSerpApiImages(queryVariant, serpApiKey, 10);
        if (serpImages.length > 0) {
          addImages(serpImages);
          if (collectedImages.length >= 8) break;
        }
      }
    }

    // 3. Fallback defensivo com Bing Images
    if (collectedImages.length === 0) {
      for (const queryVariant of queryVariations) {
        const bingImages = await fetchBingImages(queryVariant, 10);
        if (bingImages.length > 0) {
          addImages(bingImages);
          if (collectedImages.length >= 8) break;
        }
      }
    }

    return res.status(200).json({
      success: true,
      images: collectedImages.slice(0, 12)
    });
  } catch (err: any) {
    console.error('[Multi-Engine Image Search Error]:', err?.message);
    return res.status(200).json({ success: false, images: [], error: err?.message });
  }
}
