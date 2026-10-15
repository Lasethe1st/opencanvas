import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const browserPreview: Plugin = {
  name: 'oc-browser-preview',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__browser-preview', (req, res) => {
      if (req.url?.startsWith('/bridge.js')) {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.end(readFileSync(resolve(__dirname, 'preview-runtime/bridge.js')));
        return;
      }
      const html = readFileSync(resolve(__dirname, 'scripts/browser-preview.html'), 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html.replace('</body>', '<script type="module" src="/__browser-preview/bridge.js"></script></body>'));
    });
  },
};

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [react(), browserPreview],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
