import { QuoteItem } from '../types';

/**
 * Converte e otimiza uma imagem para uma miniatura Base64 JPEG compacta (max 320x240, ~20KB).
 * Perfeita para caber na coluna de 130px da tabela oficial com alta densidade (Retina/HD),
 * permitindo que seja empacotada como anexo MIME inline (CID) que abre sem bloqueios no Outlook.
 */
export async function optimizeProductImageToBase64(
  url: string,
  maxWidth: number = 320,
  maxHeight: number = 240,
  quality: number = 0.82,
  timeoutMs: number = 3000
): Promise<string | null> {
  if (!url || typeof window === 'undefined') return null;

  // Se já for Base64 pequeno (< 45KB), mantém diretamente
  if (url.startsWith('data:image/') && url.length < 60000) {
    return url;
  }

  return new Promise<string | null>(async (resolve) => {
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(url.startsWith('data:') ? url : null);
      }
    }, timeoutMs);

    const finish = (result: string | null) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(result);
      }
    };

    let sourceDataUrl = url;

    // Se for URL externa HTTP, busca via fetch ou proxies CORS para contornar restrições de mesma origem
    if (url.startsWith('http')) {
      const endpoints = [
        url,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
      ];

      let loadedBlob: Blob | null = null;
      for (const endpoint of endpoints) {
        try {
          const controller = new AbortController();
          const subTimer = setTimeout(() => controller.abort(), 1800);
          const resp = await fetch(endpoint, {
            signal: controller.signal,
            headers: { 'Accept': 'image/*,*/*' }
          });
          clearTimeout(subTimer);

          if (!resp.ok) continue;
          const blob = await resp.blob();
          if (blob && blob.size > 50) {
            loadedBlob = blob;
            break;
          }
        } catch {
          continue;
        }
      }

      if (loadedBlob) {
        try {
          sourceDataUrl = await new Promise<string>((r) => {
            const reader = new FileReader();
            reader.onloadend = () => r((reader.result as string) || url);
            reader.onerror = () => r(url);
            reader.readAsDataURL(loadedBlob!);
          });
        } catch {
          sourceDataUrl = url;
        }
      }
    }

    // Carrega em um Image element para desenhar no Canvas redimensionado
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;

        if (w <= 0 || h <= 0) {
          finish(url.startsWith('data:') ? url : null);
          return;
        }

        // Calcula proporção mantendo aspecto sem distorcer
        const scale = Math.min(maxWidth / w, maxHeight / h, 1);
        const finalW = Math.max(Math.round(w * scale), 10);
        const finalH = Math.max(Math.round(h * scale), 10);

        const canvas = document.createElement('canvas');
        canvas.width = finalW;
        canvas.height = finalH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(url.startsWith('data:') ? url : null);
          return;
        }

        // Fundo branco limpo para imagens PNG transparentes exportadas em JPEG
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, finalW, finalH);
        ctx.drawImage(img, 0, 0, finalW, finalH);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        finish(compressedDataUrl);
      } catch {
        finish(url.startsWith('data:') ? url : null);
      }
    };

    img.onerror = () => {
      finish(url.startsWith('data:') ? url : null);
    };

    img.src = sourceDataUrl;
  });
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
      // Se o item não tem imagem ativa ou não tem URL de imagem, mantém como está
      if (!item.showImage || !item.imageUrl) {
        return item;
      }

      try {
        const optimized = await optimizeProductImageToBase64(item.imageUrl);
        if (optimized) {
          return {
            ...item,
            imageUrl: optimized
          };
        }
      } catch (err) {
        console.warn(`[ProductImageEmbed] Falha ao otimizar imagem do item #${item.itemNumber}:`, err);
      }

      return item;
    })
  );
}
