import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');

function project(name) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-del-'));
  const root = path.join(parent, name);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.writeFileSync(path.join(root, 'src', 'a.txt'), 'x');
  return { parent, root };
}

test('delete needs the exact folder name, then removes the folder', () => {
  const { parent, root } = project('my-site');
  assert.throws(() => h.deleteProjectFolder(root, 'my-sit'), /Type "my-site" exactly/);
  assert.throws(() => h.deleteProjectFolder(root, ''), /Type "my-site" exactly/);
  assert.ok(fs.existsSync(root));
  h.deleteProjectFolder(root, ' my-site ');
  assert.ok(!fs.existsSync(root));
  assert.ok(fs.existsSync(parent), 'only the project folder goes');
});

test('delete refuses folders that are not projects, and protected ones', () => {
  const { parent } = project('keep');
  assert.throws(() => h.deleteProjectFolder(parent, path.basename(parent)), /not an OpenCanvas project/);
  assert.throws(() => h.deleteProjectFolder(os.homedir(), path.basename(os.homedir())), /too important/);
  const { root } = project('guarded');
  assert.throws(() => h.deleteProjectFolder(root, 'guarded', [root]), /too important/);
  assert.ok(fs.existsSync(root));
});

test('isGitRepo sees a .git folder', () => {
  const { root } = project('repo');
  assert.equal(h.isGitRepo(root), false);
  fs.mkdirSync(path.join(root, '.git'));
  assert.equal(h.isGitRepo(root), true);
});
