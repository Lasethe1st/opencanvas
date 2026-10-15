import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');
const JSZip = require('jszip');
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(APP_ROOT, 'tests', '.tmp', `export-${Date.now()}`);
fs.mkdirSync(TMP, { recursive: true });

let n = 0;
function project(files) {
  const root = path.join(TMP, `p${++n}`);
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return h.detectProject(root);
}
const VITE_PKG = (extra = {}) => JSON.stringify({ name: 'site', dependencies: { react: '19', 'react-dom': '19' }, devDependencies: { vite: '7' }, scripts: { dev: 'vite', build: 'vite build' }, ...extra });
const titles = (report) => report.issues.map((i) => `${i.severity}: ${i.title}`);

test('importsOf finds static, dynamic, re-export and require imports but skips comments', () => {
  const code = [
    "import React from 'react';",
    "import './index.css';",
    "export { x } from './x';",
    "const m = await import('./lazy');",
    "const fs = require('node:fs');",
    "// import nope from 'commented';",
    "/* import alsoNope from 'block'; */",
  ].join('\n');
  assert.deepEqual(
    h.importsOf(code).map((i) => `${i.line}:${i.spec}`),
    ['1:react', '2:./index.css', '3:./x', '4:./lazy', '5:node:fs'],
  );
  assert.equal(h.packageOf('@radix-ui/react-dialog/dist'), '@radix-ui/react-dialog');
  assert.equal(h.packageOf('lodash/debounce'), 'lodash');
});

test('a clean project has no errors or warnings', () => {
  const info = project({
    'package.json': VITE_PKG(),
    'package-lock.json': '{}',
    'index.html': '<div id="root"></div><script type="module" src="/src/main.jsx"></script>',
    'src/main.jsx': "import { createRoot } from 'react-dom/client';\nimport App from './App';\nimport './index.css';\ncreateRoot(document.getElementById('root')).render(<App />);",
    'src/App.jsx': "import logo from './logo.svg';\nexport default function App() { return <img src={logo} />; }",
    'src/logo.svg': '<svg/>',
    'src/index.css': 'body { margin: 0; }',
  });
  const report = h.validateExport(info);
  assert.deepEqual(titles(report), []);
  assert.deepEqual(report.envVars, []);
  assert.equal(report.envExample, null);
  assert.ok(report.checkedFiles >= 4);
});

test('missing files, unresolved imports, missing dependencies and assets are reported with file and line', () => {
  const info = project({
    'package.json': VITE_PKG({ scripts: { dev: 'vite' } }),
    'tsconfig.json': '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } // comment\n}',
    'index.html': '<script type="module" src="/src/main.tsx"></script>',
    'src/main.tsx': "import App from './App';\nimport { Button } from '@/components/Button';\nimport { motion } from 'framer-motion';\nimport { useState } from 'react';\nimport path from 'node:path';",
    'src/App.tsx': "import { Card } from '@/components/Card';\nexport default function App() { return <img src=\"/hero.png\" />; }",
    'src/components/Card.tsx': 'export const Card = () => null;',
    'src/index.css': '.a { background: url(./missing.png); }',
  });
  const report = h.validateExport(info);
  const byTitle = Object.fromEntries(report.issues.map((i) => [i.title, i]));

  assert.equal(byTitle['Import "@/components/Button" can’t be found']?.file, 'src/main.tsx:2');
  assert.equal(byTitle['"framer-motion" is imported but not in package.json']?.file, 'src/main.tsx:3');
  assert.match(byTitle['"framer-motion" is imported but not in package.json'].fix, /npm install framer-motion/);
  assert.equal(byTitle['./missing.png referenced in CSS can’t be found']?.severity, 'error');
  assert.equal(byTitle['/hero.png isn’t in public/']?.severity, 'warning');
  assert.equal(byTitle['No lockfile']?.severity, 'warning');
  assert.equal(byTitle['No build script']?.severity, 'warning');
  assert.ok(!report.issues.some((i) => /Card|react"|node:path/.test(i.title)), 'resolved alias, declared deps and builtins pass');

  const order = report.issues.map((i) => i.severity);
  assert.deepEqual(order, [...order].sort((a, b) => ['error', 'warning', 'info'].indexOf(a) - ['error', 'warning', 'info'].indexOf(b)), 'sorted by severity');

  const noHtml = project({ 'package.json': VITE_PKG(), 'package-lock.json': '{}', 'src/main.jsx': '' });
  assert.ok(titles(h.validateExport({ ...noHtml, framework: 'vite-react' })).includes('error: index.html is missing'));

  const next = project({ 'package.json': JSON.stringify({ dependencies: { next: '15', react: '19' }, scripts: { build: 'next build' } }), 'package-lock.json': '{}' });
  assert.ok(titles(h.validateExport(next)).includes('error: No app or pages folder'));
});

test('env vars produce a values-free .env.example, and .env files and secrets never ship', async () => {
  const info = project({
    'package.json': VITE_PKG(),
    'package-lock.json': '{}',
    'index.html': '<script type="module" src="/src/main.jsx"></script>',
    'src/main.jsx': "const a = import.meta.env.VITE_API_URL;\nconst b = process.env.STRIPE_KEY;\nconst mode = import.meta.env.MODE;\nconst k = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';",
    '.env': 'STRIPE_KEY=sk_live_real_secret_value',
    '.env.local': 'VITE_API_URL=https://internal',
  });
  const report = h.validateExport(info);
  assert.deepEqual(report.envVars, ['STRIPE_KEY', 'VITE_API_URL'], 'MODE is built in');
  assert.equal(report.envExample, '# Variables the code reads. Copy to .env and fill in real values.\nSTRIPE_KEY=\nVITE_API_URL=\n');
  assert.ok(titles(report).includes('info: A .env.example will be added'));
  assert.ok(titles(report).includes('info: .env, .env.local are left out'));
  assert.ok(titles(report).includes('warning: Looks like an API secret key is written in the code'));

  const zip = await h.buildProjectZip(info, { '.env.example': report.envExample });
  const loaded = await JSZip.loadAsync(zip.buffer);
  const names = Object.keys(loaded.files).map((f) => f.split('/').slice(1).join('/'));
  assert.ok(names.includes('.env.example'));
  assert.ok(!names.includes('.env') && !names.includes('.env.local'));
  for (const file of Object.values(loaded.files)) {
    if (file.dir) continue;
    const text = await file.async('string');
    assert.ok(!text.includes('sk_live_real_secret_value') && !text.includes('https://internal'), `${file.name} carries no env values`);
  }

  assert.deepEqual(h.runInstructions(info, report.envVars).slice(2, 3), ['cp .env.example .env   # then set STRIPE_KEY, VITE_API_URL']);
});

test('envExampleFor keeps the project’s own lines and only adds missing names', () => {
  assert.equal(h.envExampleFor('API_URL=\n# comment\nexport TOKEN=', ['API_URL', 'TOKEN']), null);
  assert.equal(h.envExampleFor('API_URL=\n', ['API_URL', 'NEW_ONE']), 'API_URL=\n\n# Added by OpenCanvas: variables the code reads. Fill in real values in .env.\nNEW_ONE=\n');
  assert.equal(h.envExampleFor(null, []), null);
});

test('OpenCanvas preview leftovers are errors', () => {
  const info = project({
    'package.json': VITE_PKG(),
    'package-lock.json': '{}',
    'index.html': '<script type="module" src="/src/main.jsx"></script>',
    'src/main.jsx': "import './App';",
    'src/App.jsx': 'export default () => <div data-oc-id="src/App.jsx:1:22">Hi</div>;',
  });
  const leak = h.validateExport(info).issues.find((i) => i.title === 'OpenCanvas preview code found in the source');
  assert.equal(leak?.severity, 'error');
  assert.equal(leak.file, 'src/App.jsx:1');
});

const buildProject = (build) =>
  project({
    'package.json': JSON.stringify({ name: 'check', version: '1.0.0', private: true, scripts: { build } }),
    'index.html': '',
  });

test('the build check reports the failing step and cleans up', { timeout: 120_000 }, async () => {
  const info = buildProject('node -e "console.log(\'building\'); process.exit(3)"');
  let log = '';
  const res = await h.runBuildCheck(info, { onLog: (t) => (log += t), signal: new AbortController().signal });
  if (res.state === 'unavailable') return; // offline npm can't even do an empty install
  assert.equal(res.state, 'failed', res.message);
  assert.equal(res.step, 'build');
  assert.deepEqual(res.steps, [
    { step: 'install', ok: true },
    { step: 'typecheck', ok: true, skipped: true },
    { step: 'build', ok: false },
  ]);
  assert.match(res.message, /exit code 3/);
  assert.match(log, /> npm run build/);
  assert.match(log, /building/);
});

test('the build check can be cancelled while a step runs', { timeout: 120_000 }, async () => {
  const info = buildProject('node -e "console.log(\'waiting\'); setTimeout(() => {}, 60000)"');
  const ctrl = new AbortController();
  const started = Date.now();
  const res = await h.runBuildCheck(info, {
    signal: ctrl.signal,
    onLog: (t) => {
      if (t.includes('waiting')) ctrl.abort();
    },
  });
  if (res.state === 'unavailable') return;
  assert.equal(res.state, 'cancelled', res.message);
  assert.equal(res.step, 'build');
  assert.ok(Date.now() - started < 55_000, 'did not wait for the script');
});

test('the build check times out as "unavailable"', { timeout: 60_000 }, async () => {
  const info = buildProject('node -e "setTimeout(() => {}, 60000)"');
  const res = await h.runBuildCheck(info, { onLog: () => {}, signal: new AbortController().signal, timeoutMs: 1500 });
  assert.equal(res.state, 'unavailable');
  assert.match(res.message, /took longer/);
});

test.after(() => fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }));
