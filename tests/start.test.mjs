import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');

function tempDir(t, prefix = 'oc-start-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8"/></svg>';

test('faviconHrefs reads icon links in document order', () => {
  const html = `<head>
    <link rel="stylesheet" href="/a.css">
    <link rel="icon" type="image/svg+xml" href="/logo.svg" />
    <link href="/apple.png" rel="apple-touch-icon">
    <link rel='shortcut icon' href='favicon.ico'>
  </head>`;
  assert.deepEqual(h.faviconHrefs(html), ['/logo.svg', '/apple.png', 'favicon.ico']);
});

test('projectFavicon uses the declared icon, falling back to conventional files', (t) => {
  const root = tempDir(t);
  write(root, 'index.html', '<link rel="icon" href="/brand/mark.svg?v=2">');
  write(root, 'public/brand/mark.svg', SVG);
  write(root, 'public/favicon.png', 'png');
  assert.equal(h.projectFavicon(root), `data:image/svg+xml;base64,${Buffer.from(SVG).toString('base64')}`);

  fs.rmSync(path.join(root, 'public/brand'), { recursive: true });
  assert.match(h.projectFavicon(root), /^data:image\/png;base64,/, 'missing declared icon falls back to public/favicon.png');

  fs.rmSync(path.join(root, 'public/favicon.png'));
  assert.equal(h.projectFavicon(root), null);
});

test('projectFavicon ignores remote, oversized and out-of-project icons', (t) => {
  const parent = tempDir(t);
  const root = path.join(parent, 'site');
  write(parent, 'secret.svg', SVG);
  write(root, 'index.html', '<link rel="icon" href="https://cdn.example.com/x.svg"><link rel="icon" href="../secret.svg"><link rel="icon" href="/big.png">');
  write(root, 'public/big.png', Buffer.alloc(300 * 1024));
  assert.equal(h.projectFavicon(root), null);
});

test('findProjectRoot walks up from a file to the folder with package.json', (t) => {
  const root = tempDir(t);
  write(root, 'package.json', '{}');
  write(root, 'src/components/Hero.jsx', 'export default 1');
  assert.equal(h.findProjectRoot(path.join(root, 'src/components/Hero.jsx')), root);
  assert.equal(h.findProjectRoot(root), root);
});

test('repoName derives a folder name from a remote', () => {
  assert.equal(h.repoName('https://github.com/Lasethe1st/ad-agency.git'), 'ad-agency');
  assert.equal(h.repoName('git@github.com:octo/hello.world.git'), 'hello.world');
  assert.equal(h.repoName('https://github.com/octo/site/'), 'site');
});

test('Vercel helpers: CLI JSON, the shareable alias and the import link', () => {
  const out = 'Vercel CLI 63\n> Deploying {project}\nBuilding…\n{\n  "status": "ok",\n  "deployment": { "url": "a-1.vercel.app" }\n}\n';
  assert.deepEqual(h.extractJson(out), { status: 'ok', deployment: { url: 'a-1.vercel.app' } });
  assert.equal(h.extractJson('no json here'), null);

  assert.equal(h.publicAlias(['site-git-main-me.vercel.app', 'site-me.vercel.app', 'site-sigma.vercel.app']), 'site-me.vercel.app');
  assert.equal(h.publicAlias(['site-sigma.vercel.app', 'northbound.studio']), 'northbound.studio', 'custom domains win');
  assert.equal(h.publicAlias([]), null);

  assert.equal(h.githubSlug('https://github.com/Lasethe1st/ad-agency.git'), 'Lasethe1st/ad-agency');
  assert.equal(h.githubSlug('git@github.com:octo/site.git'), 'octo/site');
  assert.equal(h.githubSlug('https://gitlab.com/octo/site.git'), null);
  assert.equal(h.vercelImportUrl('https://github.com/octo/site.git'), 'https://vercel.com/new/import?s=https%3A%2F%2Fgithub.com%2Focto%2Fsite');
  assert.equal(h.vercelImportUrl(''), 'https://vercel.com/new');
});

test('gitClone rejects anything that is not a repository URL before touching disk', async (t) => {
  const parent = tempDir(t);
  let asked = false;
  await assert.rejects(
    h.gitClone(parent, 'not a url', () => {
      asked = true;
      return path.join(parent, 'x');
    }),
    /repository URL/,
  );
  assert.equal(asked, false);
  assert.deepEqual(fs.readdirSync(parent), []);
});
