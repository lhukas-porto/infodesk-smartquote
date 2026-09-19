import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import googleShoppingHandler from './api/google-shopping';

function googleShoppingPlugin(): Plugin {
  return {
    name: 'google-shopping-plugin',
    configureServer(server) {
      server.middlewares.use('/api/google-shopping', async (req, res) => {
        try {
          const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
          const q = parsedUrl.searchParams.get('q') || '';
          const apiKey = parsedUrl.searchParams.get('apiKey') || '';
          (req as any).query = { q, apiKey };
          await googleShoppingHandler(req, res);
        } catch (err: any) {
          console.error('[Google Shopping Middleware Error]:', err?.message);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, offers: [], error: err?.message }));
        }
      });
    }
  };
}

function imageSearchPlugin(): Plugin {
  return {
    name: 'image-search-plugin',
    configureServer(server) {
      server.middlewares.use('/api/image-search', async (req, res) => {
        try {
          const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
          const q = parsedUrl.searchParams.get('q') || '';
          if (!q) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, images: [] }));
            return;
          }

          // Real product image search via Bing engine
          const bingRes = await fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2&first=1`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
            }
          });

          if (!bingRes.ok) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, images: [] }));
            return;
          }

          const html = await bingRes.text();
          const matches = [...html.matchAll(/murl&quot;:&quot;(https?:\/\/[^&"]+)&quot;/g)].map(m => m[1]);

          const filtered: string[] = [];
          const seen = new Set<string>();

          for (const url of matches) {
            if (!url.startsWith('https://')) continue;
            if (url.includes('.svg') || url.includes('placeholder') || url.includes('data:image') || url.includes('unsplash.com')) continue;
            if (seen.has(url)) continue;
            seen.add(url);
            filtered.push(url);
            if (filtered.length >= 10) break;
          }

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, images: filtered }));
        } catch (err: any) {
          console.error('[Image Search Middleware Error]:', err?.message);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, images: [], error: err?.message }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), imageSearchPlugin(), googleShoppingPlugin()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('docx')) return 'vendor-docx';
            if (id.includes('exceljs')) return 'vendor-exceljs';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
          }
        }
      }
    }
  },
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : []
  }
});
