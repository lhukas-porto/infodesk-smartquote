export const config = {
  runtime: 'nodejs'
};

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
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Utilize POST.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    if (!body || typeof body !== 'object') {
      body = {};
    }

    const model = (body.model as string) || 'gemini-flash-lite-latest';
    const contents = body.contents;

    if (!contents) {
      return res.status(400).json({ success: false, error: 'Parâmetro contents é obrigatório.' });
    }

    // A chave é obtida com segurança das variáveis de ambiente do backend
    const apiKey = 
      process.env.GEMINI_API_KEY || 
      process.env.VITE_GEMINI_API_KEY || 
      (body.apiKey as string) || 
      '';

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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const geminiRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const data = await geminiRes.json();
    return res.status(geminiRes.status).json(data);
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError';
    console.error('[Gemini Proxy Error]:', isTimeout ? 'Timeout de 45s excedido' : err?.message);
    return res.status(isTimeout ? 504 : 500).json({ 
      success: false, 
      error: isTimeout ? 'Tempo limite de resposta da IA excedido (45s).' : (err?.message || 'Erro interno no proxy Gemini.') 
    });
  }
}
