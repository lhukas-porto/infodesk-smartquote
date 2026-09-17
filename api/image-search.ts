export const config = {
  runtime: 'nodejs'
};

export default async function handler(req: any, res: any) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const q = (req.query?.q as string) || '';
    if (!q) {
      return res.status(200).json({ success: false, images: [] });
    }

    const bingRes = await fetch(
      `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2&first=1`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
          'Accept':
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      }
    );

    if (!bingRes.ok) {
      return res.status(200).json({ success: false, images: [] });
    }

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
      if (filtered.length >= 6) break;
    }

    return res.status(200).json({ success: true, images: filtered });
  } catch (err: any) {
    console.error('[Vercel Serverless Image Search Error]:', err?.message);
    return res.status(200).json({ success: false, images: [], error: err?.message });
  }
}
