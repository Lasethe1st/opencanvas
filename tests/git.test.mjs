import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');

let hasGit = true;
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' });
} catch {
  hasGit = false;
}

test('parseStatus reads branch, upstream, ahead/behind and file states', () => {
  const raw = ['## main...origin/main [ahead 2, behind 1]', ' M src/App.jsx', '?? public/logo.svg', 'R  new.css', 'old.css', 'UU conflict.js', 'D  gone.txt', ''].join('\0');
  const s = h.parseStatus(raw);
  assert.equal(s.branch, 'main');
  assert.equal(s.upstream, 'origin/main');
  assert.equal(s.ahead, 2);
  assert.equal(s.behind, 1);
  assert.deepEqual(
    s.files.map((f) => `${f.state}:${f.path}`),
    ['modified:src/App.jsx', 'untracked:public/logo.svg', 'renamed:new.css', 'conflict:conflict.js', 'deleted:gone.txt'],
  );
  assert.equal(h.parseStatus('## No commits yet on main\0').branch, 'main');
  assert.equal(h.parseStatus('## feature/x\0').upstream, null);
});

test('remote URLs are validated and GitHub shorthand expands', () => {
  assert.equal(h.normalizeRemote('you/site'), 'https://github.com/you/site.git');
  assert.equal(h.normalizeRemote(' https://github.com/you/site.git '), 'https://github.com/you/site.git');
  assert.equal(h.normalizeRemote('git@github.com:you/site.git'), 'git@github.com:you/site.git');
  for (const bad of ['', 'not a url', 'https://github.com/you/site; rm -rf /', '--upload-pack=evil', 'file:///etc']) {
    assert.throws(() => h.normalizeRemote(bad), /repository URL/);
  }
  assert.equal(h.remoteWebUrl('git@github.com:you/site.git'), 'https://github.com/you/site');
  assert.equal(h.remoteWebUrl('https://github.com/you/site.git'), 'https://github.com/you/site');
});

test('friendly git errors', () => {
  assert.match(h.friendlyError('push', ' ! [rejected]        main -> main (fetch first)\nerror: failed to push'), /Pull first/);
  assert.match(h.friendlyError('push', 'fatal: Authentication failed for https://github.com/x/y.git'), /sign-in/);
  assert.match(h.friendlyError('push', 'remote: Repository not found.\nfatal: repository not found'), /not found/);
});

test('init, identity, remote and commit in a fresh project', { skip: !hasGit && 'git not installed' }, async (t) => {
  // Outside this repository (and outside tests/.tmp, which other test files delete while running).
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-git-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'App.jsx'), 'export default function App() { return <main /> }\n');

  let status = await h.gitStatus(root);
  assert.equal(status.installed, true);
  assert.equal(status.repo, false);
  await h.gitInit(root);
  assert.ok(fs.existsSync(path.join(root, '.gitignore')));
  status = await h.gitStatus(root);
  assert.equal(status.repo, true);
  assert.equal(status.parentRepo, null);
  assert.equal(status.branch, 'main');
  assert.equal(status.lastCommit, null);
  assert.ok(status.files.some((f) => f.state === 'untracked'));

  await h.gitSetIdentity(root, 'Test User', 'test@example.com');
  await assert.rejects(h.gitSetIdentity(root, 'X', 'nope'), /valid email/);
  await assert.rejects(h.gitCommit(root, '   '), /commit message/);
  await h.gitCommit(root, 'First commit');
  status = await h.gitStatus(root);
  assert.equal(status.lastCommit.message, 'First commit');
  assert.equal(status.files.length, 0);
  await assert.rejects(h.gitCommit(root, 'Again'), /Nothing to commit/);

  assert.equal(await h.gitSetRemote(root, 'you/site'), 'https://github.com/you/site.git');
  await h.gitSetRemote(root, 'https://github.com/you/other.git');
  status = await h.gitStatus(root);
  assert.equal(status.remote, 'https://github.com/you/other.git');

  fs.writeFileSync(path.join(root, 'src', 'App.jsx'), 'export default function App() { return <main>hi</main> }\n');
  status = await h.gitStatus(root);
  assert.deepEqual(status.files, [{ path: 'src/App.jsx', state: 'modified' }]);
});
