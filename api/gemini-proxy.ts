export const config = {
  runtime: 'nodejs'
};

const ALLOWED_MODELS = new Set([
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-flash'
]);

// Rate limiter em memória por IP (máximo 60 req/min)
const ipRateMap = new Map<string, { count: number; resetAt: number }>();


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

  // CORS e validação de origem restrita aos domínios oficiais da Infodesk
  const origin = (req.headers?.origin as string) || '';
  const referer = (req.headers?.referer as string) || '';

  const isAllowedOrigin = 
    origin.startsWith('http://localhost:') || 
    origin.startsWith('http://127.0.0.1:') || 
    origin === 'https://infodesk-smartquote.vercel.app' || 
    (/^https:\/\/infodesk-smartquote[a-z0-9-]*\.vercel\.app$/.test(origin)) ||
    (!origin && (
      referer.startsWith('http://localhost:') || 
      referer.startsWith('http://127.0.0.1:') || 
      referer.startsWith('https://infodesk-smartquote.vercel.app') ||
      (/^https:\/\/infodesk-smartquote[a-z0-9-]*\.vercel\.app/.test(referer))
    ));

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', isAllowedOrigin ? (origin || '*') : 'null');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Utilize POST.' });
  }

  if (!isAllowedOrigin && origin) {
    return res.status(403).json({ success: false, error: 'Acesso negado: origem não autorizada.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    if (!body || typeof body !== 'object') {
      body = {};
    }

    // Validação e isolamento estrito de modelos permitidos
    const requestedModel = (body.model as string) || 'gemini-flash-lite-latest';
    const model = ALLOWED_MODELS.has(requestedModel) ? requestedModel : 'gemini-flash-lite-latest';

    // Rate Limiting defensivo por IP
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'local';
    const now = Date.now();
    const rateInfo = ipRateMap.get(clientIp);
    if (rateInfo && rateInfo.resetAt > now) {
      if (rateInfo.count >= 60) {
        return res.status(429).json({ 
          success: false, 
          error: 'Limite de taxa excedido (60 req/min). Aguarde alguns segundos.' 
        });
      }
      rateInfo.count++;
    } else {
      ipRateMap.set(clientIp, { count: 1, resetAt: now + 60000 });
    }

    const contents = body.contents;

    if (!contents) {
      return res.status(400).json({ success: false, error: 'Parâmetro contents é obrigatório.' });
    }

    // Proteção de tamanho máximo de payload (máx 2MB para análises OCR/imagens)
    const payloadStr = typeof body === 'string' ? body : JSON.stringify(body);
    if (payloadStr.length > 2 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: 'Carga útil excede o limite máximo permitido (2MB).' });
    }

    // A chave é obtida prioritariamente das variáveis secretas de ambiente do servidor
    // Apenas se o usuário fornecer uma chave formatada e válida via body, permite fallback
    const rawClientKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const isValidClientKey = /^[A-Za-z0-9_-]{30,70}$/.test(rawClientKey);

    const apiKey = 
      process.env.GEMINI_API_KEY || 
      process.env.VITE_GEMINI_API_KEY || 
      (isValidClientKey ? rawClientKey : '');

    if (!apiKey) {
      return res.status(500).json({ 
        success: false, 
        error: 'Nenhuma chave Gemini configurada no servidor (GEMINI_API_KEY).' 
      });
    }

    const payload: any = { contents };
    if (body.systemInstruction) payload.systemInstruction = body.systemInstruction;
    if (body.generationConfig) payload.generationConfig = body.generationConfig;
    if (body.tools) payload.tools = body.tools;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    // Retry com backoff inteligente para absorver picos transitórios de 503 (alta demanda do Google)
    const maxAttempts = 3;
    let geminiRes: any;
    let data: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      try {
        geminiRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeout);

        // Se o Google retornar 503 (alta demanda momentânea), aguarda 1.2s e re-tenta automaticamente
        if (geminiRes.status === 503 && attempt < maxAttempts) {
          console.warn(`[Gemini Proxy] Google 503 em ${model} (tentativa ${attempt}/${maxAttempts}). Aguardando 1.2s para retry...`);
          await new Promise(r => setTimeout(r, 1200 * attempt));
          continue;
        }

        data = await geminiRes.json();
        return res.status(geminiRes.status).json(data);
      } catch (err: any) {
        clearTimeout(timeout);
        const isTimeout = err?.name === 'AbortError';
        if (attempt === maxAttempts) {
          console.error('[Gemini Proxy Error]:', isTimeout ? 'Timeout de 25s excedido' : err?.message);
          return res.status(isTimeout ? 504 : 500).json({ 
            success: false, 
            error: isTimeout ? 'Tempo limite de resposta da IA excedido (25s).' : (err?.message || 'Erro interno no proxy Gemini.') 
          });
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  } catch (err: any) {
    console.error('[Gemini Proxy Critical]:', err?.message);
    return res.status(500).json({ 
      success: false, 
      error: err?.message || 'Erro interno no proxy Gemini.' 
    });
  }
}
