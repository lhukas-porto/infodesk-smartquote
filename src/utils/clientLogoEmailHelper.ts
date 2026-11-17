import { resolveCompanyCandidates } from './companyLogoResolver';

/**
 * Tenta carregar uma URL de imagem no navegador e converter para Data URL Base64
 */
async function fetchImageToDataUrl(url: string, timeoutMs: number = 3000): Promise<string | null> {
  if (!url || !url.startsWith('http')) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'image/*,*/*' }
    });
    clearTimeout(timer);

    if (!resp.ok) return null;
    const blob = await resp.blob();
    if (!blob || blob.size < 40 || !blob.type.startsWith('image/')) return null;

    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        resolve(res || null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Tenta carregar via elemento <img> do DOM com Canvas (contorna certas restrições de CORS simples)
 */
async function loadImgElementToDataUrl(url: string, timeoutMs: number = 3000): Promise<string | null> {
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
 * Resolve e carrega a melhor logo do cliente disponível em Base64 para incorporação oficial inline no e-mail
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

  const normalizedComp = {
    ...comp,
    contacts: (comp.contacts || []).map((ct, idx) => ({
      id: `ct-${idx}`,
      name: '',
      email: ct.email || ''
    }))
  };

  const candidates = resolveCompanyCandidates(normalizedComp);
  if (!candidates || candidates.length === 0) return null;

  // Testa os primeiros 4 candidatos mais promissores
  const targets = candidates.slice(0, 4);

  for (const url of targets) {
    // 1. Tenta via canvas / element
    const canvasRes = await loadImgElementToDataUrl(url, 2500);
    if (canvasRes && canvasRes.startsWith('data:image/')) {
      return canvasRes;
    }

    // 2. Tenta via fetch direto
    const fetchRes = await fetchImageToDataUrl(url, 2500);
    if (fetchRes && fetchRes.startsWith('data:image/')) {
      return fetchRes;
    }
  }

  return null;
}
