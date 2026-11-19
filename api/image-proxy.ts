import dns from 'node:dns';
import net from 'node:net';

export const config = {
  runtime: 'nodejs'
};

/**
 * Converte um endereço IPv4 em um número inteiro de 32 bits para checagem rápida de intervalos CIDR.
 */
function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

/**
 * Avalia rigorosamente se um IP (v4 ou v6) pertence a redes privadas, loopback,
 * link-local (metadados de nuvem como 169.254.169.254) ou faixas reservadas (RFC 1918 / 3927 / 6598 / 5737).
 */
function isPrivateOrReservedIp(ip: string): boolean {
  if (!ip) return true;
  const cleanIp = ip.trim().toLowerCase();

  // 1. Tratamento de IPv6 mapped IPv4 (ex: "::ffff:127.0.0.1")
  if (cleanIp.startsWith('::ffff:')) {
    const v4Part = cleanIp.slice(7);
    if (net.isIPv4(v4Part)) {
      return isPrivateOrReservedIp(v4Part);
    }
  }

  // 2. Validação IPv6
  if (net.isIPv6(cleanIp)) {
    if (
      cleanIp === '::1' ||
      cleanIp === '::' ||
      cleanIp.startsWith('fe80:') || // Link-local
      cleanIp.startsWith('fc00:') || // Unique local
      cleanIp.startsWith('fd00:') || // Unique local
      cleanIp.startsWith('ff')       // Multicast
    ) {
      return true;
    }
    return false;
  }

  // 3. Validação IPv4
  if (net.isIPv4(cleanIp)) {
    const num = ipv4ToInt(cleanIp);

    // 0.0.0.0/8 (Rede atual)
    if ((num >>> 24) === 0) return true;

    // 127.0.0.0/8 (Loopback / Localhost)
    if ((num >>> 24) === 127) return true;

    // 10.0.0.0/8 (Rede Privada RFC 1918)
    if ((num >>> 24) === 10) return true;

    // 172.16.0.0/12 (Rede Privada RFC 1918: 172.16.0.0 - 172.31.255.255)
    if (num >= 0xac100000 && num <= 0xac1fffff) return true;

    // 192.168.0.0/16 (Rede Privada RFC 1918)
    if ((num >>> 16) === ((192 << 8) | 168)) return true;

    // 169.254.0.0/16 (Link-local / Metadados AWS, GCP, Azure, OpenStack)
    if ((num >>> 16) === ((169 << 8) | 254)) return true;

    // 100.64.0.0/10 (Carrier-grade NAT RFC 6598)
    if (num >= 0x64400000 && num <= 0x647fffff) return true;

    // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (TEST-NET)
    if ((num >>> 8) === ((192 << 16) | (0 << 8) | 2)) return true;
    if ((num >>> 8) === ((198 << 16) | (51 << 8) | 100)) return true;
    if ((num >>> 8) === ((203 << 16) | (0 << 8) | 113)) return true;

    // 224.0.0.0/4 (Multicast) e 240.0.0.0/4 (Reservado)
    if ((num >>> 28) >= 14) return true;

    // 255.255.255.255 (Broadcast)
    if (num === 0xffffffff) return true;

    return false;
  }

  return true;
}

/**
 * Validação rigorosa anti-SSRF com resolução de DNS para prevenir DNS Rebinding,
 * manipulação de portas e acesso a metadados de nuvem.
 */
async function validateUrlSafety(rawUrl: string): Promise<{ safe: boolean; error?: string; url?: URL }> {
  try {
    const parsed = new URL(rawUrl);

    // 1. Apenas protocolos HTTP e HTTPS legítimos
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { safe: false, error: 'Protocolo não permitido. Utilize apenas HTTP ou HTTPS.' };
    }

    // 2. Restrição de portas para portas web oficiais (80, 443 ou default vazia)
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
      return { safe: false, error: 'Porta de conexão não autorizada.' };
    }

    // 3. Proibir credenciais embutidas na URL (ex: http://user:pass@evil.com)
    if (parsed.username || parsed.password) {
      return { safe: false, error: 'Credenciais na URL não são permitidas.' };
    }

    const host = parsed.hostname.toLowerCase();

    // 4. Bloqueio imediato de hostnames conhecidos de ambiente interno e nuvem
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.lan') ||
      host.endsWith('.home') ||
      host.endsWith('.corp') ||
      host.includes('metadata.google.internal') ||
      host === 'instance-data'
    ) {
      return { safe: false, error: 'Acesso a domínios internos ou de infraestrutura bloqueado por política de segurança.' };
    }

    // 5. Se o host for um IP literal direto, valida de imediato
    if (net.isIP(host)) {
      if (isPrivateOrReservedIp(host)) {
        return { safe: false, error: 'Acesso a endereço IP privado ou reservado bloqueado por segurança.' };
      }
    } else {
      // 6. Resolução de DNS profunda anti-rebinding: garante que o IP final resolvido não é privado
      try {
        const addresses = await dns.promises.lookup(host, { all: true });
        if (!addresses || addresses.length === 0) {
          return { safe: false, error: 'Não foi possível resolver o domínio informado.' };
        }
        for (const addr of addresses) {
          if (isPrivateOrReservedIp(addr.address)) {
            return { safe: false, error: `Domínio resolve para IP interno/reservado (${addr.address}). Acesso bloqueado.` };
          }
        }
      } catch {
        return { safe: false, error: 'Falha na resolução DNS do domínio da imagem.' };
      }
    }

    return { safe: true, url: parsed };
  } catch {
    return { safe: false, error: 'Formato de URL inválido.' };
  }
}

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
    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).json({ success: false, error: 'Parâmetro url é obrigatório.' });
    }

    const wantBase64 = req.query?.format === 'base64';

    // Loop seguro com suporte a até 3 redirecionamentos manuais inspecionados
    let currentUrl = rawUrl.trim();
    let redirectCount = 0;
    const MAX_REDIRECTS = 3;
    let finalResponse: any = null;

    while (redirectCount <= MAX_REDIRECTS) {
      const validation = await validateUrlSafety(currentUrl);
      if (!validation.safe) {
        return res.status(400).json({ success: false, error: validation.error || 'URL insegura ou bloqueada.' });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      try {
        const response = await fetch(currentUrl, {
          signal: controller.signal,
          redirect: 'manual', // NUNCA seguir automaticamente para impedir SSRF por redirect bypass
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
          }
        });
        clearTimeout(timeout);

        // Se houver redirecionamento HTTP (301, 302, 307, 308)
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          if (!location) {
            return res.status(400).json({ success: false, error: 'Redirecionamento sem cabeçalho Location.' });
          }
          currentUrl = new URL(location, currentUrl).toString();
          redirectCount++;
          continue;
        }

        finalResponse = response;
        break;
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        throw fetchErr;
      }
    }

    if (!finalResponse) {
      return res.status(400).json({ success: false, error: 'Excedido o limite de redirecionamentos seguros.' });
    }

    if (!finalResponse.ok) {
      return res.status(finalResponse.status).json({
        success: false,
        error: `Servidor de origem retornou status ${finalResponse.status}`
      });
    }

    // Validação de Content-Type: deve ser imagem
    const rawContentType = finalResponse.headers.get('content-type') || 'image/jpeg';
    const cleanContentType = rawContentType.split(';')[0].trim().toLowerCase();
    if (!cleanContentType.startsWith('image/')) {
      return res.status(400).json({ success: false, error: 'O recurso solicitado não é uma imagem válida.' });
    }

    // Limitação de tamanho de payload para prevenir DoS por saturação de memória (máximo 12MB)
    const contentLength = finalResponse.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 12 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: 'A imagem solicitada excede o limite máximo permitido de 12MB.' });
    }

    const arrayBuffer = await finalResponse.arrayBuffer();
    if (arrayBuffer.byteLength > 12 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: 'A imagem solicitada excede o limite máximo permitido de 12MB.' });
    }

    const buffer = Buffer.from(arrayBuffer);

    if (wantBase64) {
      const base64Data = buffer.toString('base64');
      const dataUrl = `data:${cleanContentType};base64,${base64Data}`;
      return res.status(200).json({ success: true, dataUrl, contentType: cleanContentType });
    }

    res.setHeader('Content-Type', cleanContentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.statusCode = 200;
    res.end(buffer);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Falha ao buscar imagem remota com segurança.' });
  }
}
