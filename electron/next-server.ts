/**
 * Next.js preview server. Spawned as a separate Node process, like the Vite preview.
 * Runs the project's own `next` in dev mode with webpack and adds OpenCanvas in memory:
 * Next ignores `next({ conf })` in dev, so the config loader is wrapped instead. No project file is written.
 */
import fs from 'node:fs';
import http from 'node:http';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { withOpenCanvas } from './next-config';

const projectRoot = process.env.OC_PROJECT_ROOT!;
const appRoot = process.env.OC_APP_ROOT!;
const editableRoots: string[] = JSON.parse(process.env.OC_EDITABLE_ROOTS || '["app"]');
const BRIDGE_PATH = '/@open-canvas/bridge.js';
const START_PORT = 5190;

function send(message: Record<string, unknown>) {
  process.stdout.write(`OC_MSG ${JSON.stringify(message)}\n`);
}

const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
const options = {
  projectRoot,
  editableRoots,
  loaderPath: path.join(appRoot, 'dist-electron', 'next-oc-loader.cjs'),
  clientPath: path.join(appRoot, 'preview-runtime', 'next-client.js'),
};

let configHooked = false;

/** Wraps `next/dist/server/config`'s default export so every loaded config gets the OpenCanvas loader. */
function hookConfigLoader() {
  const configFile = projectRequire.resolve('next/dist/server/config');
  const ModuleAny = Module as any;
  const originalLoad = ModuleAny._load;
  let proxy: unknown = null;
  ModuleAny._load = function (request: string, parent: unknown, isMain: boolean) {
    const exports = originalLoad.apply(this, arguments);
    if (!/config(\.js)?$/.test(request)) return exports;
    let file: string;
    try {
      file = ModuleAny._resolveFilename(request, parent, isMain);
    } catch {
      return exports;
    }
    if (file !== configFile) return exports;
    if (!proxy) {
      const loadConfig = exports.default;
      const wrapped = async (...args: unknown[]) => {
        configHooked = true;
        return withOpenCanvas(await loadConfig(...args), options);
      };
      proxy = new Proxy(exports, { get: (target, key) => (key === 'default' ? wrapped : Reflect.get(target, key)) });
    }
    return proxy;
  };
}

function freePort(start: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once('error', (err: NodeJS.ErrnoException) => (err.code === 'EADDRINUSE' && start < START_PORT + 50 ? resolve(freePort(start + 1)) : reject(err)));
    probe.listen(start, '127.0.0.1', () => probe.close(() => resolve(start)));
  });
}

async function main() {
  let nextPkg: string;
  try {
    nextPkg = projectRequire.resolve('next/package.json');
  } catch {
    throw new Error('Next.js isn’t installed in this project. Use "Install dependencies" to run the preview.');
  }
  const version: string = JSON.parse(fs.readFileSync(nextPkg, 'utf8')).version;
  hookConfigLoader();
  delete process.env.TURBOPACK;
  (process.env as Record<string, string>).NODE_ENV = 'development';
  const nextModule = projectRequire('next');
  const createNext = nextModule.default ?? nextModule;

  const port = await freePort(START_PORT);
  const hostname = '127.0.0.1';
  const server = http.createServer();
  const app = createNext({ dev: true, dir: projectRoot, hostname, port, httpServer: server, webpack: true, turbopack: false });
  await app.prepare();
  if (!configHooked) {
    send({ type: 'warning', message: `OpenCanvas couldn’t add source ids to Next.js ${version}. The preview works, but elements can’t be selected.` });
  }
  const handle = app.getRequestHandler();
  const bridge = () => fs.readFileSync(path.join(appRoot, 'preview-runtime', 'bridge.js'), 'utf8');
  server.on('request', (req, res) => {
    if (req.url?.split('?')[0] === BRIDGE_PATH) {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      res.end(bridge());
      return;
    }
    handle(req, res).catch((err: Error) => {
      res.statusCode = 500;
      res.end(err.message);
    });
  });
  if (typeof app.getUpgradeHandler === 'function') {
    const upgrade = app.getUpgradeHandler();
    server.on('upgrade', (req, socket, head) => upgrade(req, socket, head));
  }
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, hostname, resolve);
  });
  const url = `http://${hostname}:${port}/`;
  console.log(`Next.js ${version} preview on ${url}`);
  send({ type: 'ready', url });

  const shutdown = async () => {
    await Promise.race([app.close?.(), new Promise((r) => setTimeout(r, 1500))]).catch(() => undefined);
    server.close();
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
