/**
 * Lime's ESLint parser cannot load TypeScript 7. Keep TypeScript 6 nested
 * beside that parser so the app's own compiler stays on 7.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const nested = path.join(root, 'node_modules', '@typescript-eslint', 'parser', 'node_modules', 'typescript', 'package.json');
let major = 0;
try {
  major = Number(JSON.parse(fs.readFileSync(nested, 'utf8')).version.split('.')[0]);
} catch {
  major = 0;
}
if (major !== 6) {
  const install = spawnSync('npm', ['install', '--prefix', 'node_modules/@typescript-eslint/parser', 'typescript@6.0.2', '--no-save', '--legacy-peer-deps'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_USE_SYSTEM_CA: '1' },
  });
  if (install.status !== 0) process.exit(install.status ?? 1);
}
const lint = spawnSync('npx', ['eslint', '-c', 'lime.eslint.config.mjs', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});
process.exit(lint.status ?? 1);
