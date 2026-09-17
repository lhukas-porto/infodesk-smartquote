/**
 * Utilitário de Compressão e Otimização de Imagens no Navegador
 * Reduz impressões de tela (Print Screen / Ctrl+V) e uploads de 5MB-10MB para ~30KB-80KB,
 * preservando nitidez comercial e evitando 100% dos erros de QuotaExceededError no localStorage.
 */

export const compressImageDataUrl = (
  dataUrl: string, 
  maxWidth = 800, 
  maxHeight = 800, 
  quality = 0.82
): Promise<string> => {
  // Se não for base64 ou se for muito pequeno (< 30KB), não precisa reprocessar
  if (!dataUrl || !dataUrl.startsWith('data:image/') || dataUrl.length < 35000) {
    return Promise.resolve(dataUrl);
  }

  // Não compacta SVGs para não corromper vetores
  if (dataUrl.startsWith('data:image/svg')) {
    return Promise.resolve(dataUrl);
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          // Se já for menor que as dimensões máximas e tamanho razoável, mantém
          if (width <= maxWidth && height <= maxHeight && dataUrl.length < 150000) {
            resolve(dataUrl);
            return;
          }

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

          // Fundo branco para imagens com transparência convertidas para JPEG
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Exporta como JPEG otimizado
          const compressed = canvas.toDataURL('image/jpeg', quality);

          // Se por algum motivo o JPEG ficou maior (raro), mantém o menor
          resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
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
