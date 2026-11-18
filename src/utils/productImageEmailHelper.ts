import { QuoteItem } from '../types';
import { findProductImageInCache, saveProductImageToCache } from './storage';

/**
 * Redimensiona e comprime uma imagem Data URL no Canvas para JPEG compacto (max 320x240, ~20KB) com fundo branco.
 * Totalmente seguro contra CORS taint pois opera diretamente sobre data: URLs locais.
 */
export async function compressDataUrlViaCanvas(
  dataUrl: string,
  maxWidth: number = 320,
  maxHeight: number = 240,
  quality: number = 0.82
): Promise<string | null> {
  if (typeof document === 'undefined' || !dataUrl.startsWith('data:image/')) return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w <= 0 || h <= 0) return resolve(dataUrl);

        const scale = Math.min(maxWidth / w, maxHeight / h, 1);
        const finalW = Math.max(Math.round(w * scale), 10);
        const finalH = Math.max(Math.round(h * scale), 10);

        const canvas = document.createElement('canvas');
        canvas.width = finalW;
        canvas.height = finalH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, finalW, finalH);
        ctx.drawImage(img, 0, 0, finalW, finalH);

        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Converte e otimiza uma imagem para uma miniatura Base64 JPEG compacta (max 320x240, ~20KB).
 * Perfeita para caber na coluna de 130px da tabela oficial com alta densidade (Retina/HD),
 * permitindo que seja empacotada como anexo MIME inline (CID) que abre sem bloqueios no Outlook.
 *
 * Utiliza como prioridade o proxy local /api/image-proxy para contornar qualquer barreira de CORS
 * com o User-Agent do servidor, e fallbacks com CDNs públicos.
 */
export async function optimizeProductImageToBase64(
  url: string,
  maxWidth: number = 320,
  maxHeight: number = 240,
  quality: number = 0.82,
  timeoutMs: number = 7000
): Promise<string | null> {
  if (!url || typeof window === 'undefined') return null;

  const trimmed = url.trim();

  // 1. Se já for Base64 (data:image/...)
  if (trimmed.startsWith('data:image/')) {
    // Se for leve (< 60KB), retorna direto
    if (trimmed.length < 60000) {
      return trimmed;
    }
    // Se for grande, comprime no canvas para ficar levíssimo
    const compressed = await compressDataUrlViaCanvas(trimmed, maxWidth, maxHeight, quality);
    return compressed || trimmed;
  }

  // 2. Se for URL remota HTTP/HTTPS
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    // ESTRATÉGIA 1 (MÁXIMA PRIORIDADE): Proxy interno /api/image-proxy
    // Bypassa CORS no Node.js com headers de browser e retorna Data URL diretamente
    try {
      const controller = new AbortController();
      const proxyTimer = setTimeout(() => controller.abort(), Math.min(5000, timeoutMs));
      const proxyRes = await fetch(`/api/image-proxy?url=${encodeURIComponent(trimmed)}&format=base64`, {
        signal: controller.signal
      });
      clearTimeout(proxyTimer);
      if (proxyRes.ok) {
        const json = await proxyRes.json().catch(() => null);
        if (json?.success && json?.dataUrl && json.dataUrl.startsWith('data:image/')) {
          const compressed = await compressDataUrlViaCanvas(json.dataUrl, maxWidth, maxHeight, quality);
          return compressed || json.dataUrl;
        }
      }
    } catch (proxyErr) {
      console.warn('[optimizeProductImageToBase64] Proxy local falhou, tentando CDNs auxiliares...', proxyErr);
    }

    // ESTRATÉGIA 2: CDNs públicos com suporte a CORS
    const cleanUrlNoProto = trimmed.replace(/^https?:\/\//i, '');
    const endpoints = [
      `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrlNoProto)}&output=jpg&q=82&w=${maxWidth}`,
      `https://wsrv.nl/?url=${encodeURIComponent(cleanUrlNoProto)}&output=jpg&q=82&w=${maxWidth}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(trimmed)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(trimmed)}`
    ];

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const subTimer = setTimeout(() => controller.abort(), 2500);
        const resp = await fetch(endpoint, {
          signal: controller.signal,
          headers: { 'Accept': 'image/*,*/*' }
        });
        clearTimeout(subTimer);

        if (!resp.ok) continue;
        const blob = await resp.blob();
        if (blob && blob.size > 50) {
          const dataUrl = await new Promise<string>((r) => {
            const reader = new FileReader();
            reader.onloadend = () => r((reader.result as string) || '');
            reader.onerror = () => r('');
            reader.readAsDataURL(blob);
          });
          if (dataUrl && dataUrl.startsWith('data:image/')) {
            const compressed = await compressDataUrlViaCanvas(dataUrl, maxWidth, maxHeight, quality);
            return compressed || dataUrl;
          }
        }
      } catch {
        continue;
      }
    }

    // ESTRATÉGIA 3: Carregamento direto via Image (caso o servidor de origem permita CORS)
    try {
      const directDataUrl = await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const timer = setTimeout(() => resolve(null), 2000);
        img.onload = () => {
          clearTimeout(timer);
          try {
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            if (w <= 0 || h <= 0) return resolve(null);
            const scale = Math.min(maxWidth / w, maxHeight / h, 1);
            const finalW = Math.max(Math.round(w * scale), 10);
            const finalH = Math.max(Math.round(h * scale), 10);

            const canvas = document.createElement('canvas');
            canvas.width = finalW;
            canvas.height = finalH;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(null);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, finalW, finalH);
            ctx.drawImage(img, 0, 0, finalW, finalH);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };
        img.src = trimmed;
      });
      if (directDataUrl) return directDataUrl;
    } catch {}
  }

  return null;
}

/**
 * Processa os itens da proposta e converte todas as imagens ativas para Base64 otimizado
 * para que possam ser empacotadas como partes MIME inline (CID) pelo serviço de e-mail.
 */
export async function embedProductImagesForEmail(items: QuoteItem[]): Promise<QuoteItem[]> {
  if (!items || items.length === 0) return items;

  // Processa todos os itens em paralelo
  return Promise.all(
    items.map(async (item) => {
      // Se o usuário desmarcou explicitamente o toggle de imagem, respeita a decisão
      if (item.showImage === false) {
        return item;
      }

      // Descobre a melhor URL disponível:
      // 1) A do próprio item
      // 2) Caso vazia, consulta no cache persistente por Part Number, SKU ou Nome
      let effectiveUrl = (item.imageUrl || '').trim();
      if (!effectiveUrl) {
        const cached = findProductImageInCache(item.name, item.partNumber, item.sku);
        if (cached && cached.trim()) {
          effectiveUrl = cached.trim();
        }
      }

      // Se não há imagem em nenhum lugar, marca showImage: false
      if (!effectiveUrl) {
        return {
          ...item,
          showImage: false
        };
      }

      // Se já for Base64 (data:image/...)
      if (effectiveUrl.startsWith('data:image/')) {
        // Assegura persistência no cache para orçamentos e visualizações futuras
        saveProductImageToCache(
          { name: item.name, partNumber: item.partNumber, sku: item.sku },
          effectiveUrl,
          true
        );
        return {
          ...item,
          imageUrl: effectiveUrl,
          showImage: true
        };
      }

      // Converte imagem remota HTTP/HTTPS para Base64 otimizado
      try {
        const optimized = await optimizeProductImageToBase64(effectiveUrl);
        if (optimized && optimized.startsWith('data:image/')) {
          // Salva no cache persistente para que futuros envios e abas nunca mais precisem converter!
          saveProductImageToCache(
            { name: item.name, partNumber: item.partNumber, sku: item.sku },
            optimized,
            false
          );
          return {
            ...item,
            imageUrl: optimized,
            showImage: true
          };
        }
      } catch (err) {
        console.warn(`[ProductImageEmbed] Falha ao otimizar imagem do item #${item.itemNumber}:`, err);
      }

      // Se todas as tentativas de converter para Base64 falharem,
      // NUNCA desative a imagem se ela tiver uma URL válida (http/https)!
      // Mantém a foto ativa (showImage: true) com a URL original para que o cliente veja a imagem no e-mail!
      return {
        ...item,
        imageUrl: effectiveUrl,
        showImage: true
      };
    })
  );
}
