import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(APP_ROOT, 'tests', '.tmp');
/** Installed once by hand or by CI: `npm install` in tests/.cache/next-fixture (see the test below). */
const FIXTURE = path.join(APP_ROOT, 'tests', '.cache', 'next-fixture');

function tmpProject(files) {
  const root = path.join(TMP, `next-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(root, { recursive: true });
  h.writeFiles(root, files);
  return root;
}

const PKG = JSON.stringify({ name: 'shop', dependencies: { next: '15.5.0', react: '19.1.0', 'react-dom': '19.1.0' } });

test('Next.js projects are detected through the adapter, with their own editable folders', () => {
  const root = tmpProject({
    'package.json': PKG,
    'app/layout.tsx': 'export default function Layout({ children }) { return <html><body>{children}</body></html>; }',
    'app/page.tsx': 'export default function Home() { return <h1>Hi</h1>; }',
    'components/Card.tsx': 'export const Card = () => <div />;',
  });
  const info = h.detectProject(root);
  assert.equal(info.framework, 'next');
  assert.equal(info.canPreview, true);
  assert.equal(info.editable, true);
  assert.deepEqual(info.editableRoots, ['app', 'components']);
  assert.equal(info.entryFile, 'app/layout.tsx');
  assert.equal(info.stylesFile, 'app/open-canvas.css');
  assert.ok(info.warnings.some((w) => /Install/.test(w)), 'no node_modules: asks for an install');
  assert.equal(h.isEditablePath(info, 'components/Card.tsx'), true);
  assert.equal(h.isEditablePath(info, 'lib/data.ts'), false);

  assert.equal(h.nextEntry((rel) => rel === 'src/pages/_app.jsx'), 'src/pages/_app.jsx');
  assert.equal(h.adapterFor('cra').supports.preview, false);
  assert.equal(h.detectProject(tmpProject({ 'package.json': JSON.stringify({ dependencies: { vite: '7', react: '19' } }), 'index.html': '' })).editableRoots[0], 'src');
});

test('withOpenCanvas keeps the user’s webpack function and adds the loader and bridge client', () => {
  const calls = [];
  const user = {
    reactStrictMode: true,
    webpack(config, ctx) {
      calls.push(ctx.isServer);
      config.resolve = { alias: { '@': '/x' } };
      return config;
    },
  };
  const opts = { projectRoot: '/p', editableRoots: ['app', 'components'], loaderPath: '/oc/loader.cjs', clientPath: '/oc/next-client.js' };
  const merged = h.withOpenCanvas(user, opts);
  assert.notEqual(merged, user, 'the loaded config object is not mutated');
  assert.equal(merged.reactStrictMode, true);
  assert.equal(h.withOpenCanvas(merged, opts), merged, 'applying twice is a no-op');

  const client = merged.webpack({ module: { rules: [{ test: /x/ }] }, entry: async () => ({ 'main-app': ['next/app-dev.js'], main: 'next/dev.js', 'app/page': ['page.js'] }) }, { isServer: false });
  assert.deepEqual(calls, [false]);
  assert.deepEqual(client.resolve.alias, { '@': '/x' });
  assert.equal(client.module.rules.length, 2);
  const rule = client.module.rules[0];
  assert.equal(rule.enforce, 'pre', 'runs on the original source, before SWC');
  assert.deepEqual(rule.include, [path.join('/p', 'app'), path.join('/p', 'components')]);
  assert.equal(rule.use[0].loader, '/oc/loader.cjs');
  return client.entry().then((entries) => {
    assert.deepEqual(entries['main-app'], ['/oc/next-client.js', 'next/app-dev.js']);
    assert.deepEqual(entries.main, ['/oc/next-client.js', 'next/dev.js']);
    assert.deepEqual(entries['app/page'], ['page.js'], 'page entries are left alone');

    const server = merged.webpack({ module: { rules: [] }, entry: 'server-entry' }, { isServer: true });
    assert.equal(server.entry, 'server-entry', 'the server compiler gets ids but no bridge');
    assert.deepEqual(h.addClientEntry({ main: { import: 'a.js' } }, 'c.js'), { main: { import: ['c.js', 'a.js'] } });
  });
});

test('the loader adds ids to host elements only and leaves everything else as it was', () => {
  const code = `'use client';\nimport Link from 'next/link';\nexport default function Page({ title }: { title: string }) {\n  return <main><Link href="/a">A</Link><h1>{title}</h1></main>;\n}\n`;
  const out = h.transformForNext(code, path.join('/p', 'app', 'page.tsx'), '/p');
  assert.match(out, /^'use client';\nimport Link from 'next\/link';/);
  assert.match(out, /<main data-oc-id="app\/page.tsx:4:9">/);
  assert.match(out, /<h1 data-oc-id="app\/page.tsx:4:39">/);
  assert.match(out, /<Link href="\/a">/, 'components keep their props untouched');
  const plain = 'export const x: number = 1;\n';
  assert.equal(h.transformForNext(plain, '/p/app/x.tsx', '/p'), plain);
});

/* ---------- Live Next.js preview ---------- */

const hasNext = fs.existsSync(path.join(FIXTURE, 'node_modules', 'next', 'package.json'));

async function waitFor(fn, ms, label) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      last = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${label}${last ? `: ${last.message}` : ''}`);
}

test('a real Next.js app previews with source ids and the bridge, and edits reach the page', { skip: !hasNext && 'Next.js is not installed in tests/.cache/next-fixture (run npm install there; skipped offline).', timeout: 240_000 }, async (t) => {
  const pageSrc = `export default function Home() {\n  return (\n    <main>\n      <h1>Fixture heading</h1>\n    </main>\n  );\n}\n`;
  h.writeFiles(FIXTURE, {
    'app/layout.jsx': `export const metadata = { title: 'Fixture' };\nexport default function RootLayout({ children }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`,
    'app/page.jsx': pageSrc,
  });
  fs.rmSync(path.join(FIXTURE, 'app', 'open-canvas.css'), { force: true });
  const info = h.detectProject(FIXTURE);
  assert.equal(info.framework, 'next');
  assert.deepEqual(info.editableRoots, ['app']);

  const child = spawn(process.execPath, [path.join(APP_ROOT, 'dist-electron', 'next-server.mjs')], {
    cwd: FIXTURE,
    env: { ...process.env, OC_PROJECT_ROOT: FIXTURE, OC_APP_ROOT: APP_ROOT, OC_EDITABLE_ROOTS: JSON.stringify(info.editableRoots), NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  t.after(() => {
    if (child.exitCode === null && child.pid) {
      if (process.platform === 'win32') h.killTree(child.pid, true);
      else child.kill('SIGKILL');
    }
  });
  let log = '';
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => {
      log += d;
      const m = /OC_MSG (.*)/.exec(String(d));
      if (!m) return;
      const msg = JSON.parse(m[1]);
      if (msg.type === 'ready') resolve(msg.url);
      if (msg.type === 'error') reject(new Error(msg.message));
    });
    child.stderr.on('data', (d) => (log += d));
    child.on('exit', (code) => reject(new Error(`next-server exited with ${code}\n${log}`)));
  });
  const url = await ready;
  assert.doesNotMatch(log, /couldn’t add source ids/, 'the config hook found Next’s loader');

  const html = await waitFor(async () => {
    const res = await fetch(url);
    const body = await res.text();
    return res.ok && body.includes('Fixture heading') ? body : null;
  }, 180_000, 'the first page render');
  assert.match(html, /<h1 data-oc-id="app\/page.jsx:4:6">Fixture heading<\/h1>/, 'Server Component output carries source ids');

  const bridge = await fetch(new URL('/@open-canvas/bridge.js', url));
  assert.equal(bridge.status, 200);
  assert.match(await bridge.text(), /__openCanvasBridge/);

  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+main-app[^"]*)"/g)].map((m) => m[1]);
  assert.ok(scripts.length, 'the page loads the App Router client entry');
  const chunk = await (await fetch(new URL(scripts[0], url))).text();
  assert.match(chunk, /__ocBridgeRequested/, 'the bridge client is part of the client entry');

  const res = h.applyEdit(info, { type: 'setText', id: 'app/page.jsx:4:6', text: 'Edited from the canvas' });
  assert.equal(res.ok, true, res.error);
  assert.match(fs.readFileSync(path.join(FIXTURE, 'app/page.jsx'), 'utf8'), /<h1>Edited from the canvas<\/h1>/);
  await waitFor(async () => (await (await fetch(url)).text()).includes('Edited from the canvas'), 60_000, 'the edit to show up');

  const style = h.applyEdit(info, { type: 'setStyle', id: 'app/page.jsx:4:6', breakpoint: 'base', styles: { color: 'rgb(200, 0, 0)' } });
  assert.equal(style.ok, true, style.error);
  assert.match(fs.readFileSync(path.join(FIXTURE, 'app/layout.jsx'), 'utf8'), /import '\.\/open-canvas\.css';/, 'style edits load through the root layout');
  fs.writeFileSync(path.join(FIXTURE, 'app/page.jsx'), pageSrc);
});
