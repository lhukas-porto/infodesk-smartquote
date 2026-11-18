export const config = {
  runtime: 'nodejs'
};

export default async function handler(req: any, res: any) {
  // Compatibilidade com Connect middleware do Vite dev server
  if (!res.status) {
    res.status = (code: number) => ({
      json: (data: any) => {
        res.statusCode = code;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      },
      send: (body: any) => {
        res.statusCode = code;
        res.end(body);
      },
      end: () => {
        res.statusCode = code;
        res.end();
      }
    });
  }

  // Headers de CORS permissivos para carregar imagens com segurança em canvas
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Utilize GET.' });
  }

  try {
    const rawUrl = (req.query?.url as string) || '';
    if (!rawUrl || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://'))) {
      return res.status(400).json({ success: false, error: 'URL inválida. Deve iniciar com http:// ou https://' });
    }

    const wantBase64 = req.query?.format === 'base64';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(rawUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: `Servidor de origem retornou status ${response.status}` });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/png';

    if (wantBase64) {
      const base64Data = buffer.toString('base64');
      const dataUrl = `data:${contentType};base64,${base64Data}`;
      return res.status(200).json({ success: true, dataUrl, contentType });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.statusCode = 200;
    res.end(buffer);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Falha ao buscar imagem remota' });
  }
}
