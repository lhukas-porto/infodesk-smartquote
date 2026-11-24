export const config = {
  runtime: 'nodejs'
};

const ALLOWED_GROQ_MODELS = new Set([
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant'
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

    const requestedModel = (body.model as string) || 'openai/gpt-oss-120b';
    const model = ALLOWED_GROQ_MODELS.has(requestedModel) ? requestedModel : 'openai/gpt-oss-120b';

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

    const messages = body.messages;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ success: false, error: 'Parâmetro messages (array) é obrigatório.' });
    }

    const rawClientKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const isValidClientKey = /^gsk_[A-Za-z0-9_-]{30,80}$/.test(rawClientKey);

    const apiKey = 
      process.env.GROQ_API_KEY || 
      (isValidClientKey ? rawClientKey : '');

    if (!apiKey) {
      return res.status(503).json({ 
        success: false, 
        error: 'Nenhuma chave Groq configurada no servidor (GROQ_API_KEY).' 
      });
    }

    const payload: any = {
      model,
      messages,
      temperature: typeof body.temperature === 'number' ? body.temperature : 0.1,
      response_format: { type: 'json_object' }
    };

    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const groqRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const data = await groqRes.json();
    return res.status(groqRes.status).json(data);
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError';
    console.error('[Groq Proxy Error]:', isTimeout ? 'Timeout de 25s excedido' : err?.message);
    return res.status(isTimeout ? 504 : 500).json({ 
      success: false, 
      error: isTimeout ? 'Tempo limite de resposta do Groq excedido (25s).' : (err?.message || 'Erro interno no proxy Groq.') 
    });
  }
}
