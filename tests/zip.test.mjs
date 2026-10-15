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
const TMP = path.join(APP_ROOT, 'tests', '.tmp', `zip-${Date.now()}`);
fs.mkdirSync(TMP, { recursive: true });

let n = 0;
const target = () => path.join(TMP, `p${++n}`);
async function zipOf(files, transform) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  transform?.(zip);
  return zip.generateAsync({ type: 'nodebuffer' });
}
const PKG = JSON.stringify({ name: '@acme/site', dependencies: { react: '19', 'react-dom': '19', vite: '7', 'react-router-dom': '7', tailwindcss: '4' }, scripts: { dev: 'vite', build: 'vite build' } });

test('safeEntryPath refuses absolute paths, drive letters and parent segments', () => {
  assert.equal(h.safeEntryPath('src/App.jsx'), 'src/App.jsx');
  assert.equal(h.safeEntryPath('./src//a.js'), 'src/a.js');
  assert.equal(h.safeEntryPath('src\\win\\a.js'), 'src/win/a.js');
  for (const bad of ['../evil.js', 'a/../../evil.js', '/etc/passwd', 'C:/Windows/x', 'c:evil', '..\\evil.js']) assert.equal(h.safeEntryPath(bad), null, bad);
});

test('a GitHub-style ZIP is unpacked with its top folder stripped and build output skipped', async () => {
  const data = await zipOf({
    'site-main/package.json': PKG,
    'site-main/index.html': '<script type="module" src="/src/main.jsx"></script>',
    'site-main/src/main.jsx': "import './index.css';",
    'site-main/src/index.css': '@import "tailwindcss";',
    'site-main/components.json': '{}',
    'site-main/node_modules/react/index.js': 'x',
    'site-main/.git/HEAD': 'ref',
    'site-main/dist/index.html': 'built',
    'site-main/.next/cache': 'x',
    '__MACOSX/site-main/._package.json': 'x',
  });
  let suggested;
  const res = await h.extractZip(data, (name) => ((suggested = name), target()), 'site-main');
  assert.equal(suggested, 'site', 'named after package.json, without the scope');
  assert.equal(res.fileCount, 5);
  assert.equal(res.skipped, 4, 'node_modules, .git, dist and .next');
  assert.ok(fs.existsSync(path.join(res.root, 'package.json')));
  assert.ok(fs.existsSync(path.join(res.root, 'src', 'main.jsx')));
  assert.ok(!fs.existsSync(path.join(res.root, 'node_modules')));
  assert.ok(!fs.existsSync(path.join(res.root, 'site-main')));

  const info = h.detectProject(res.root);
  const summary = h.projectSummary(info);
  assert.equal(summary.framework, 'React + Vite');
  assert.equal(summary.router, 'React Router');
  assert.equal(summary.tailwind, true);
  assert.equal(summary.shadcn, true);
  assert.deepEqual(summary.scripts, ['dev', 'build']);
  assert.match(summary.editing, /src\//);
});

test('zip-slip entries are refused and nothing is written', async () => {
  const data = await zipOf({ 'package.json': PKG }, (zip) => zip.file('../../outside.txt', 'pwned'));
  const before = fs.readdirSync(TMP).length;
  await assert.rejects(h.extractZip(data, target), /unsafe path/);
  assert.equal(fs.readdirSync(TMP).length, before, 'no folder was created');
  assert.ok(!fs.existsSync(path.join(APP_ROOT, 'tests', 'outside.txt')));
});

test('ZIPs without a package.json, too many files or that are not ZIPs are refused', async () => {
  await assert.rejects(h.extractZip(await zipOf({ 'readme.md': '#' }), target), /No package.json/);
  await assert.rejects(h.extractZip(Buffer.from('not a zip'), target), /isn’t a readable ZIP/);

  const many = { 'package.json': PKG };
  for (let i = 0; i <= h.ZIP_LIMITS.maxFiles; i++) many[`src/f${i}.js`] = '';
  await assert.rejects(h.extractZip(await zipOf(many), target), /imports up to 20,000/);
});

test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
