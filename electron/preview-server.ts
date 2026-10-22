/**
 * Standalone preview server. Spawned as a separate Node process (never inside
 * the Electron main process) so project code and its tooling stay isolated
 * from the editor's privileged runtime.
 *
 * Variant frames load with `?ocv=<id>`. Entry scripts and imports under editable
 * roots inherit that tag; `load` serves `.opencanvas/variants/<id>/…` overrides
 * when present. `node_modules` and CSS stay shared (one React).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createServer, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { injectSourceIds } from '../shared/source/jsx';
import { isVariantTaggedSource, parseOcvId, shouldPropagateOcv, variantOverrideRel, withOcv } from '../shared/variant-resolve';

const projectRoot = process.env.OC_PROJECT_ROOT!;
const appRoot = process.env.OC_APP_ROOT!;
const managed = process.env.OC_MANAGED === '1';
const cacheDir = process.env.OC_CACHE_DIR;
const editableRoots: string[] = JSON.parse(process.env.OC_EDITABLE_ROOTS || '["src"]');
const BRIDGE_ID = '/@open-canvas/bridge.js';
const EARLY_ERRORS = fs.readFileSync(path.join(appRoot, 'preview-runtime', 'early-errors.js'), 'utf8');

function send(message: Record<string, unknown>) {
  process.stdout.write(`OC_MSG ${JSON.stringify(message)}\n`);
}

function projectRel(abs: string): string {
  return path.relative(projectRoot, abs).split(path.sep).join('/');
}

function editablePrefixes(): string[] {
  return editableRoots.map((r) => path.join(projectRoot, r).split(path.sep).join('/'));
}

function openCanvasPlugin(): Plugin {
  const roots = editableRoots.map((r) => path.join(projectRoot, r) + path.sep);
  const prefixes = editablePrefixes();

  return {
    name: 'open-canvas-source-ids',
    enforce: 'pre',
    async resolveId(id, importer, options) {
      if (id === BRIDGE_ID || id.startsWith(`${BRIDGE_ID}?`)) return '\0oc-bridge';

      const importerOcv = importer ? parseOcvId(importer).ocv : null;
      const { clean, ocv: existing } = parseOcvId(id);
      if (existing) return null;
      if (!importerOcv) return null;
      if (clean.startsWith('\0')) return null;

      const resolved = await this.resolve(clean, importer ? parseOcvId(importer).clean : importer, { skipSelf: true, ...options });
      if (!resolved || resolved.external) return resolved;
      const resolvedPath = parseOcvId(resolved.id).clean;
      if (!shouldPropagateOcv(withOcv(importer ?? '', importerOcv), resolvedPath.split(path.sep).join('/'), prefixes)) {
        return resolved;
      }
      return { ...resolved, id: withOcv(resolvedPath, importerOcv) };
    },
    load(id) {
      if (id === '\0oc-bridge') return fs.readFileSync(path.join(appRoot, 'preview-runtime', 'bridge.js'), 'utf8');

      const { clean, ocv } = parseOcvId(id);
      if (!ocv || !isVariantTaggedSource(clean)) return null;

      const normalized = path.normalize(clean.split('?')[0]);
      if (!roots.some((r) => normalized.startsWith(r)) || normalized.includes(`${path.sep}node_modules${path.sep}`)) {
        return null;
      }

      const rel = projectRel(normalized);
      const overrideRel = variantOverrideRel(ocv, rel);
      const overrideAbs = path.join(projectRoot, ...overrideRel.split('/'));
      if (fs.existsSync(overrideAbs) && fs.statSync(overrideAbs).isFile()) {
        return fs.readFileSync(overrideAbs, 'utf8');
      }
      return null;
    },
    transform(code, id) {
      const file = parseOcvId(id).clean;
      if (!/\.(jsx|tsx|js)$/.test(file)) return null;
      const normalized = path.normalize(file);
      if (!roots.some((r) => normalized.startsWith(r)) || normalized.includes(`${path.sep}node_modules${path.sep}`)) return null;
      const rel = projectRel(normalized);
      const result = injectSourceIds(code, file, rel);
      return result.changed ? { code: result.code, map: null } : null;
    },
    transformIndexHtml(html, ctx) {
      const tags = [
        { tag: 'script', children: EARLY_ERRORS, injectTo: 'head-prepend' as const },
        { tag: 'script', attrs: { type: 'module', src: BRIDGE_ID }, injectTo: 'body' as const },
      ];
      const url = ctx.originalUrl || ctx.path || '';
      let ocv: string | null = null;
      try {
        ocv = new URL(url, 'http://oc.local').searchParams.get('ocv');
      } catch {
        ocv = null;
      }
      if (!ocv) return tags;

      // Tag every module entry script so the resolve/load chain carries ?ocv=.
      const tagged = html.replace(/(<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'])([^"']+)(["'])/gi, (_m, pre: string, src: string, post: string) => {
        if (src.startsWith(BRIDGE_ID) || src.includes('node_modules')) return `${pre}${src}${post}`;
        return `${pre}${withOcv(src, ocv!)}${post}`;
      });
      return { html: tagged, tags };
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
