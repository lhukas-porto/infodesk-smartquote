import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import googleShoppingHandler from './api/google-shopping';
import geminiProxyHandler from './api/gemini-proxy';
import imageSearchHandler from './api/image-search';

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
          (req as any).query = { q };
          await imageSearchHandler(req, res);
        } catch (err: any) {
          console.error('[Image Search Middleware Error]:', err?.message);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, images: [], error: err?.message }));
        }
      });
    }
  };
}

function geminiProxyPlugin(): Plugin {
  return {
    name: 'gemini-proxy-plugin',
    configureServer(server) {
      server.middlewares.use('/api/gemini-proxy', async (req, res) => {
        try {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => { body += chunk; });
            req.on('end', async () => {
              try {
                (req as any).body = JSON.parse(body);
              } catch {
                (req as any).body = {};
              }
              await geminiProxyHandler(req, res);
            });
          } else {
            await geminiProxyHandler(req, res);
          }
        } catch (err: any) {
          console.error('[Gemini Proxy Middleware Error]:', err?.message);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err?.message }));
        }
      });
    }
  };
}

const APP_BUILD_ID = `sq-${Date.now()}`;

function versionManifestPlugin(): Plugin {
  const payload = JSON.stringify({
    buildId: APP_BUILD_ID,
    builtAt: new Date().toISOString()
  });

  return {
    name: 'version-manifest-plugin',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.end(payload);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: payload
      });
    }
  };
}

export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID)
  },
  plugins: [react(), versionManifestPlugin(), imageSearchPlugin(), googleShoppingPlugin(), geminiProxyPlugin()],
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
            if (id.includes('tesseract.js')) return 'vendor-tesseract';
            if (id.includes('papaparse')) return 'vendor-papaparse';
            if (id.includes('dompurify')) return 'vendor-dompurify';
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
