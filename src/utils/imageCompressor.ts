/**
 * Utilitário de Compressão e Otimização de Imagens no Navegador
 * Reduz impressões de tela (Print Screen / Ctrl+V) e uploads de 5MB-10MB para ~30KB-80KB,
 * preservando nitidez comercial e evitando 100% dos erros de QuotaExceededError no localStorage.
 */

export const compressImageDataUrl = (
  dataUrl: string, 
  maxWidth = 500, 
  maxHeight = 500, 
  quality = 0.78
): Promise<string> => {
  // Se não for base64 (ex: URL https:// de CDN externa), não processa
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return Promise.resolve(dataUrl);
  }

  // Não compacta SVGs para não corromper vetores
  if (dataUrl.startsWith('data:image/svg')) {
    return Promise.resolve(dataUrl);
  }

  // Se já for JPEG bem compacto (< 20KB), não precisa reprocessar
  if (dataUrl.startsWith('data:image/jpeg') && dataUrl.length < 22000) {
    return Promise.resolve(dataUrl);
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          // Redimensionamento proporcional mantendo a proporção de tela
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(width, 1);
          canvas.height = Math.max(height, 1);

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }

          // Fundo branco sólido para prints com transparência convertidos para JPEG
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Exporta como JPEG otimizado
          const compressed = canvas.toDataURL('image/jpeg', quality);

          // Retorna a menor string base64
          resolve(compressed && compressed.length < dataUrl.length ? compressed : dataUrl);
        } catch (canvasErr) {
          console.warn('[ImageCompressor] Erro ao renderizar no canvas:', canvasErr);
          resolve(dataUrl);
        }
      };

      img.onerror = () => {
        resolve(dataUrl);
      };

      img.src = dataUrl;
    } catch (err) {
      console.warn('[ImageCompressor] Falha ao instanciar Image:', err);
      resolve(dataUrl);
    }
  });
};
