import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import type { PreviewStatus, ProjectInfo } from '../../shared/types';

const MAX_LOG = 20_000;

export class PreviewManager {
  private child: ChildProcess | null = null;
  private status: PreviewStatus = { state: 'stopped' };
  private log = '';

  constructor(
    private appRoot: string,
    private cacheRoot: string,
    private onStatus: (status: PreviewStatus) => void,
  ) {}

  getStatus(): PreviewStatus {
    return this.status;
  }

  private setStatus(status: PreviewStatus) {
    this.status = status;
    this.onStatus(status);
  }

  private append(text: string) {
    this.log = (this.log + text).slice(-MAX_LOG);
  }

  start(project: ProjectInfo): void {
    this.stop();
    this.log = '';
    if (project.framework !== 'vite-react') {
      this.setStatus({ state: 'error', error: 'Live preview currently supports React + Vite projects only.', log: '' });
      return;
    }
    if (!project.hasNodeModules && !project.managedPreview) {
      this.setStatus({ state: 'error', error: 'Dependencies are not installed. Use "Install dependencies" to run the preview.', log: '' });
      return;
    }
    const managed = project.managedPreview && !project.hasNodeModules;
    const cacheDir = path.join(this.cacheRoot, crypto.createHash('sha1').update(project.root).digest('hex').slice(0, 12));
    const child = spawn(process.execPath, [path.join(this.appRoot, 'dist-electron', 'preview-server.mjs')], {
      cwd: project.root,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        OC_PROJECT_ROOT: project.root,
        OC_APP_ROOT: this.appRoot,
        OC_MANAGED: managed ? '1' : '0',
        OC_CACHE_DIR: cacheDir,
        FORCE_COLOR: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;
    this.setStatus({ state: 'starting', log: '' });

    let buffer = '';
    child.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      let index: number;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (line.startsWith('OC_MSG ')) {
          try {
            const msg = JSON.parse(line.slice(7));
            if (msg.type === 'ready') this.setStatus({ state: 'running', url: msg.url, log: this.log });
            if (msg.type === 'error') this.setStatus({ state: 'error', error: msg.message, log: this.log });
          } catch {
            /* ignore malformed control lines */
          }
        } else {
          this.append(line + '\n');
        }
      }
    });
    child.stderr!.on('data', (chunk: Buffer) => this.append(chunk.toString()));
    child.on('exit', (code) => {
      if (this.child !== child) return;
      this.child = null;
      if (this.status.state !== 'error') {
        this.setStatus(code === 0 || code === null ? { state: 'stopped' } : { state: 'error', error: `Preview server exited with code ${code}.`, log: this.log });
      }
    });
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null) {
      child.stdin?.end();
      setTimeout(() => {
        if (child.exitCode === null) child.kill();
      }, 1500);
    }
    if (this.status.state !== 'stopped') this.setStatus({ state: 'stopped' });
  }
}

let installChild: ChildProcess | null = null;
let installCancelled = false;

export function installDependencies(project: ProjectInfo, onLog: (text: string) => void): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const pm = project.packageManager;
    installCancelled = false;
    // Electron drops NODE_OPTIONS, so opt the package manager into the OS certificate store explicitly
    // (needed behind TLS-inspecting proxies/antivirus; ignored by Node versions without support).
    const env = { ...process.env, NODE_USE_SYSTEM_CA: '1' };
    const child = spawn(pm, ['install'], { cwd: project.root, shell: process.platform === 'win32', windowsHide: true, env });
    installChild = child;
    child.stdout?.on('data', (d: Buffer) => onLog(d.toString()));
    child.stderr?.on('data', (d: Buffer) => onLog(d.toString()));
    child.on('error', (err) => resolve({ ok: false, error: `Could not run ${pm}: ${err.message}` }));
    child.on('exit', (code) => {
      installChild = null;
      if (installCancelled) resolve({ ok: false, error: 'Install cancelled.' });
      else resolve(code === 0 ? { ok: true } : { ok: false, error: `${pm} install exited with code ${code}.` });
    });
  });
}

export function cancelInstall() {
  const child = installChild;
  if (!child?.pid) return;
  installCancelled = true;
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  else child.kill('SIGTERM');
}
