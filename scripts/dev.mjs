import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { buildElectron } from './build-electron.mjs';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`Renderer dev server: ${url}`);

let child = null;
let restarting = false;
let restartTimer = null;

function launch() {
  child = spawn(electronPath, ['.'], { stdio: 'inherit', env: { ...process.env, OC_DEV_SERVER_URL: url } });
  child.on('exit', () => {
    if (restarting) return;
    server.close();
    process.exit(0);
  });
}

let ready = false;
await buildElectron((outfile) => {
  if (!ready || outfile.endsWith('preview-server.mjs') || outfile.endsWith('harness.cjs')) return;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    console.log('Electron sources changed, restarting...');
    restarting = true;
    child?.once('exit', () => {
      restarting = false;
      launch();
    });
    child?.kill();
  }, 200);
});
setTimeout(() => {
  ready = true;
  launch();
}, 1500);
