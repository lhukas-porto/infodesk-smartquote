/**
 * Image Extractor Service - Infodesk SmartQuote
 * Extracts real product photos, Open Graph images, and thumbnails directly from store URLs
 * (Mercado Livre, Amazon, Kalunga, Magazine Luiza, InstaAgro, etc.)
 */

// Cache extracted images to avoid repeated network calls
const imageExtractionCache = new Map<string, string>();

/**
 * Direct pattern-based image extractors for major Brazilian e-commerce platforms
 */
export function extractDirectImageFromUrlPatterns(url: string): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    // Mercado Livre item URLs
    // e.g. https://produto.mercadolivre.com.br/MLB-123456789...
    const mlbMatch = pathname.match(/MLB-?(\d+)/i);
    if (mlbMatch && host.includes('mercadolivre')) {
      const mlbId = mlbMatch[1];
      return `https://http2.mlstatic.com/D_NQ_NP_2X_${mlbId}-MLB-F.webp`;
    }

    // Amazon ASIN URLs
    // e.g. /dp/B077PZZ9P5 or /gp/product/B077PZZ9P5
    const asinMatch = pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (asinMatch && host.includes('amazon')) {
      const asin = asinMatch[1];
      return `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_SX500_.jpg`;
    }

    // Kalunga URLs
    // e.g. /prod/.../784820
    const kalungaMatch = pathname.match(/\/(\d{5,8})$/);
    if (kalungaMatch && host.includes('kalunga')) {
      const code = kalungaMatch[1];
      return `https://img.kalunga.com.br/fotosdeprodutos/${code}d.jpg`;
    }
  } catch {
    // ignore parse error
  }

  return null;
}

/**
 * Extracts OpenGraph image (`og:image`) from any arbitrary store URL via free CORS proxy
 */
export async function extractImageFromStoreUrl(url: string, timeoutMs: number = 3500): Promise<string | null> {
  if (!url || !url.startsWith('http')) return null;

  // 1. Check cache
  if (imageExtractionCache.has(url)) {
    return imageExtractionCache.get(url) || null;
  }

  // 2. Try URL pattern heuristic first (instant, 0ms network latency)
  const patternImg = extractDirectImageFromUrlPatterns(url);
  if (patternImg) {
    imageExtractionCache.set(url, patternImg);
    return patternImg;
  }

  // 3. Query via reliable public CORS proxy to fetch og:image or meta image tag
  const proxyEndpoints = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];

  for (const proxyUrl of proxyEndpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'text/html' }
      });
      clearTimeout(timeoutId);

      if (!response.ok) continue;

      const html = await response.text();
      if (!html || html.length < 100) continue;

      // Extract Open Graph image: <meta property="og:image" content="..." />
      const ogMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);

      if (ogMatch && ogMatch[1]) {
        let foundUrl = ogMatch[1].trim();
        // Resolve protocol-relative URLs
        if (foundUrl.startsWith('//')) {
          foundUrl = 'https:' + foundUrl;
        } else if (foundUrl.startsWith('/')) {
          try {
            const origin = new URL(url).origin;
            foundUrl = origin + foundUrl;
          } catch {
            // keep as is
          }
        }

        if (foundUrl.startsWith('http')) {
          imageExtractionCache.set(url, foundUrl);
          return foundUrl;
        }
      }

      // Check schema.org Product image
      const schemaMatch = html.match(/"image"\s*:\s*["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
      if (schemaMatch && schemaMatch[1]) {
        const schemaImg = schemaMatch[1];
        imageExtractionCache.set(url, schemaImg);
        return schemaImg;
      }
    } catch {
      // try next proxy or fail gracefully
      continue;
    }
  }

  return null;
}
