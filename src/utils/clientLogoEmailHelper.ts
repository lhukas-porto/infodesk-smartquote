import { ClientCompany } from '../types';
import { getClientCompanies } from './storage';
import { getCompanyInitials, resolveCompanyCandidates } from './companyLogoResolver';

/**
 * Procura a empresa correspondente no cadastro local de clientes
 */
export function findMatchingClientCompany(clientCompanyName?: string): ClientCompany | undefined {
  if (!clientCompanyName || !clientCompanyName.trim()) return undefined;
  try {
    const companies = getClientCompanies();
    const rawTarget = clientCompanyName.toLowerCase().trim();
    const cleanTarget = rawTarget.replace(/^(ao|à|a|para)\s+/i, '').trim();

    return companies.find(c => {
      const rawC = c.name.toLowerCase().trim();
      const cleanC = rawC.replace(/^(ao|à|a|para)\s+/i, '').trim();
      return (
        cleanC === cleanTarget ||
        cleanC.includes(cleanTarget) ||
        cleanTarget.includes(cleanC) ||
        rawC === rawTarget
      );
    });
  } catch {
    return undefined;
  }
}

/**
 * Gera um avatar PNG Data URL limpo (96x96 circular com iniciais)
 * Compatível 100% com clientes de e-mail (incluindo conversão para CID no Gmail)
 */
export function generateInitialsAvatarPngDataUrl(name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Fundo circular suave sem bordas
    ctx.beginPath();
    ctx.arc(48, 48, 46, 0, Math.PI * 2);
    ctx.fillStyle = '#f0f9ff';
    ctx.fill();

    // Iniciais da empresa
    const initials = getCompanyInitials(name || 'Cliente');
    ctx.font = 'bold 32px Verdana, Geneva, sans-serif';
    ctx.fillStyle = '#0369a1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, 48, 50);

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/**
 * Testa se uma imagem remota é alcançável e carrega com dimensões reais (sem bloqueio de CORS)
 */
export async function isImageLoadable(url: string, timeoutMs: number = 2000): Promise<boolean> {
  if (!url || typeof window === 'undefined') return false;
  return new Promise<boolean>((resolve) => {
    const img = new Image();
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    }, timeoutMs);

    img.onload = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(img.naturalWidth > 3 && img.naturalHeight > 3);
      }
    };

    img.onerror = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(false);
      }
    };

    img.src = url;
  });
}

/**
 * Tenta carregar uma URL de imagem no navegador e converter para Data URL Base64.
 * Utiliza fetch direto e proxies CORS públicos caso o servidor de origem restrinja a leitura de bytes pelo navegador.
 */
async function fetchImageToDataUrl(url: string, timeoutMs: number = 2500): Promise<string | null> {
  if (!url || !url.startsWith('http')) return null;

  // 1. Tenta primeiramente via proxy interno /api/image-proxy (Vercel Serverless / Vite dev middleware)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(2200, timeoutMs));
    const proxyRes = await fetch(`/api/image-proxy?url=${encodeURIComponent(url)}&format=base64`, {
      signal: controller.signal
    });
    clearTimeout(timer);
    if (proxyRes.ok) {
      const json = await proxyRes.json().catch(() => null);
      if (json?.success && json?.dataUrl && json.dataUrl.startsWith('data:image/')) {
        return json.dataUrl;
      }
    }
  } catch {
    // Segue para fallbacks externos caso o proxy local esteja indisponível
  }

  const cleanUrlNoProto = url.replace(/^https?:\/\//i, '');
  const endpoints = [
    `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrlNoProto)}&output=png&w=128`,
    `https://wsrv.nl/?url=${encodeURIComponent(cleanUrlNoProto)}&output=png&w=128`,
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];

  for (const targetUrl of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(targetUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'image/*,*/*' }
      });
      clearTimeout(timer);

      if (!resp.ok) continue;
      const blob = await resp.blob();
      if (!blob || blob.size < 40) continue;

      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result as string;
          resolve(res || null);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });

      if (dataUrl && dataUrl.startsWith('data:image/')) {
        return dataUrl;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Tenta carregar via elemento <img> do DOM com Canvas (contorna certas restrições de CORS simples)
 */
async function loadImgElementToDataUrl(url: string, timeoutMs: number = 2000): Promise<string | null> {
  if (typeof window === 'undefined' || !url) return null;

  return new Promise<string | null>((resolve) => {
    let resolved = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, timeoutMs);

    img.onload = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try {
        if (img.naturalWidth <= 3 || img.naturalHeight <= 3) {
          resolve(null);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(null);
      }
    };

    img.src = url;
  });
}

/**
 * Retorna de forma síncrona imediata o melhor candidato a logo para evitar "flashing" vazio
 */
export function getSynchronousClientLogoPreview(compName?: string, clientEmail?: string): string | null {
  if (!compName || !compName.trim()) return null;
  const registered = findMatchingClientCompany(compName);
  if (registered?.logoUrl) return registered.logoUrl;

  const candidates = resolveCompanyCandidates({
    name: compName,
    website: registered?.website,
    logoUrl: registered?.logoUrl,
    contacts: (registered?.contacts && registered.contacts.length > 0)
      ? registered.contacts
      : (clientEmail ? [{ id: 'ct-0', name: '', email: clientEmail }] : [])
  });

  if (candidates && candidates.length > 0) {
    return candidates[0];
  }

  return generateInitialsAvatarPngDataUrl(compName);
}

/**
 * Resolve a melhor logo do cliente disponível:
 * 1. Procura no cadastro oficial (website, logoUrl, contatos)
 * 2. Tenta converter os candidatos para Base64 (para suporte total a anexos MIME)
 * 3. Se CORS bloquear Base64, usa o URL HTTPS direto validado
 * 4. Se nenhum carregar, gera avatar PNG oficial com iniciais
 */
export async function resolveClientLogoBase64(comp: {
  name?: string;
  website?: string;
  logoUrl?: string;
  contacts?: Array<{ email?: string }>;
}): Promise<string | null> {
  // Se já for Base64 (data:image/...)
  if (comp.logoUrl && comp.logoUrl.startsWith('data:image/')) {
    return comp.logoUrl;
  }

  // Tenta enriquecer com dados do cadastro se website/logoUrl estiverem ausentes
  const registered = comp.name ? findMatchingClientCompany(comp.name) : undefined;
  const effectiveWebsite = comp.website || registered?.website;
  const effectiveLogoUrl = comp.logoUrl || registered?.logoUrl;
  const effectiveContacts = (comp.contacts && comp.contacts.length > 0)
    ? comp.contacts
    : (registered?.contacts || []);

  const normalizedComp = {
    name: comp.name,
    website: effectiveWebsite,
    logoUrl: effectiveLogoUrl,
    contacts: effectiveContacts.map((ct, idx) => ({
      id: `ct-${idx}`,
      name: '',
      email: ct.email || ''
    }))
  };

  const candidates = resolveCompanyCandidates(normalizedComp);
  if (!candidates || candidates.length === 0) {
    return comp.name ? generateInitialsAvatarPngDataUrl(comp.name) : null;
  }

  // Testa os primeiros 5 candidatos mais promissores
  const targets = candidates.slice(0, 5);

  for (const url of targets) {
    // 1. Tenta converter para Base64 diretamente ou via proxies CDN (weserv.nl / wsrv.nl)
    const fetchRes = await fetchImageToDataUrl(url, 2200);
    if (fetchRes && fetchRes.startsWith('data:image/')) {
      return fetchRes;
    }

    const canvasRes = await loadImgElementToDataUrl(url, 1500);
    if (canvasRes && canvasRes.startsWith('data:image/')) {
      return canvasRes;
    }
  }

  // ⚠️ REGRA ANTI-BLOQUEIO DO OUTLOOK:
  // Nunca retorne uma URL http/https externa como fallback para o e-mail oficial,
  // pois o Microsoft Outlook bloqueia imagens externas com uma caixa cinza e [X].
  // Retornamos SEMPRE o avatar oficial gerado no Canvas em Base64 nativo (CID),
  // garantindo exibição instantânea sem avisos de segurança no Outlook.
  return comp.name ? generateInitialsAvatarPngDataUrl(comp.name) : null;
}

export const resolveClientLogo = resolveClientLogoBase64;
