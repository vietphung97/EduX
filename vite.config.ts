import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const saveImagePlugin = () => ({
  name: 'save-image',
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

      if (req.method === 'POST' && req.url?.startsWith('/api/save-image')) {
        const urlObj = new URL(req.url, 'http://localhost');
        const name = urlObj.searchParams.get('name') || 'unknown.png';
        const dir = path.resolve(__dirname, 'public/roadmap');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks));
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('saved:' + name);
        });
        return;
      }

      if (req.method === 'GET' && req.url?.startsWith('/api/find-download')) {
        try {
          // Tìm file mới nhất trong Downloads
          const result = execSync(
            `powershell -Command "Get-ChildItem $env:USERPROFILE\\Downloads | Where-Object { $_.Extension -match 'jpg|jpeg|webp|png' } | Sort-Object LastWriteTime -Descending | Select-Object -First 3 -ExpandProperty FullName"`,
            { encoding: 'utf8', timeout: 8000 }
          ).trim();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ path: result }));
        } catch(e: any) {
          res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }

      if (req.method === 'GET' && req.url?.startsWith('/api/copy-to-roadmap')) {
        try {
          const urlObj = new URL(req.url, 'http://localhost');
          const srcPath = urlObj.searchParams.get('src') || '';
          const dir = path.resolve(__dirname, 'public/roadmap');
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.copyFileSync(srcPath, path.join(dir, 'roadmap_mockup.jpg'));
          const size = fs.statSync(path.join(dir, 'roadmap_mockup.jpg')).size;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, size }));
        } catch(e: any) {
          res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }

      next();
    });
  }
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: env.VITE_BASE_URL || '/',
      server: { port: 5555, host: '0.0.0.0' },
      plugins: [react(), saveImagePlugin()],
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-react': ['react', 'react-dom'],
              'vendor-supabase': ['@supabase/supabase-js'],
              'vendor-gemini': ['@google/genai'],
              'vendor-recharts': ['recharts'],
            }
          }
        }
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: { alias: { '@': path.resolve(__dirname, '.') } }
    };
});
