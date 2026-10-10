/**
 * Standalone preview server. Spawned as a separate Node process (never inside
 * the Electron main process) so project code and its tooling stay isolated
 * from the editor's privileged runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createServer, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { injectSourceIds } from '../shared/source/jsx';

const projectRoot = process.env.OC_PROJECT_ROOT!;
const appRoot = process.env.OC_APP_ROOT!;
const managed = process.env.OC_MANAGED === '1';
const cacheDir = process.env.OC_CACHE_DIR;
const BRIDGE_ID = '/@open-canvas/bridge.js';

function send(message: Record<string, unknown>) {
  process.stdout.write(`OC_MSG ${JSON.stringify(message)}\n`);
}

function openCanvasPlugin(): Plugin {
  const srcDir = path.join(projectRoot, 'src') + path.sep;
  return {
    name: 'open-canvas-source-ids',
    enforce: 'pre',
    resolveId(id) {
      if (id === BRIDGE_ID) return '\0oc-bridge';
      return null;
    },
    load(id) {
      if (id === '\0oc-bridge') return fs.readFileSync(path.join(appRoot, 'preview-runtime', 'bridge.js'), 'utf8');
      return null;
    },
    transform(code, id) {
      const file = id.split('?')[0];
      if (!/\.(jsx|tsx|js)$/.test(file)) return null;
      const normalized = path.normalize(file);
      if (!normalized.startsWith(srcDir) || normalized.includes(`${path.sep}node_modules${path.sep}`)) return null;
      const rel = path.relative(projectRoot, normalized).split(path.sep).join('/');
      const result = injectSourceIds(code, file, rel);
      return result.changed ? { code: result.code, map: null } : null;
    },
    transformIndexHtml() {
      return [{ tag: 'script', attrs: { type: 'module', src: BRIDGE_ID }, injectTo: 'body' }];
    },
  };
}

async function main() {
  const appModules = path.join(appRoot, 'node_modules');
  const server = await createServer({
    root: projectRoot,
    configFile: managed ? false : undefined,
    cacheDir: managed ? cacheDir : undefined,
    clearScreen: false,
    logLevel: 'info',
    plugins: managed ? [openCanvasPlugin(), react()] : [openCanvasPlugin()],
    resolve: managed
      ? {
          alias: [
            { find: /^react$/, replacement: path.join(appModules, 'react') },
            { find: /^react\/(.*)$/, replacement: path.join(appModules, 'react') + '/$1' },
            { find: /^react-dom$/, replacement: path.join(appModules, 'react-dom') },
            { find: /^react-dom\/(.*)$/, replacement: path.join(appModules, 'react-dom') + '/$1' },
          ],
        }
      : undefined,
    optimizeDeps: managed ? { include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] } : undefined,
    server: {
      host: '127.0.0.1',
      port: 5180,
      strictPort: false,
      fs: { allow: [projectRoot, appModules, path.join(appRoot, 'preview-runtime')] },
    },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('Preview server started without a URL.');
  send({ type: 'ready', url });

  const shutdown = async () => {
    await server.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('disconnect', shutdown);
  process.stdin.on('end', shutdown);
  process.stdin.resume();
}

main().catch((err) => {
  send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
