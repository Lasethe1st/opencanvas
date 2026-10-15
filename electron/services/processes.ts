import { spawn, spawnSync } from 'node:child_process';

/**
 * Kills a process and everything it started (dev servers, package managers). With `sync` the tree is gone
 * when it returns, which matters when the caller is about to kill the parent another way.
 */
export function killTree(pid: number | undefined, sync = false): void {
  // 0 and 4 are the idle and System processes on Windows; a pid that low is never ours.
  if (!pid || !Number.isInteger(pid) || pid <= 4) return;
  if (process.platform === 'win32') {
    const args = ['/pid', String(pid), '/T', '/F'];
    if (sync) spawnSync('taskkill', args, { windowsHide: true, stdio: 'ignore', timeout: 5000 });
    else spawn('taskkill', args, { windowsHide: true, stdio: 'ignore' }).on('error', () => undefined);
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

export interface RunResult {
  code: number | null;
  output: string;
  timedOut: boolean;
  cancelled: boolean;
  error?: string;
}

export interface RunOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  onLog?: (text: string) => void;
  timeoutMs?: number;
  signal?: AbortSignal;
  maxOutput?: number;
}

/** Runs a shell command line, streaming output; resolves (never rejects) with what happened. */
export function runCommand(command: string, opts: RunOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    const max = opts.maxOutput ?? 200_000;
    let output = '';
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    const child = spawn(command, { cwd: opts.cwd, env: opts.env ?? process.env, shell: true, windowsHide: true, detached: process.platform !== 'win32' });
    const take = (d: Buffer) => {
      const text = d.toString();
      output = (output + text).slice(-max);
      opts.onLog?.(text);
    };
    child.stdout?.on('data', take);
    child.stderr?.on('data', take);
    const finish = (result: Omit<RunResult, 'output' | 'timedOut' | 'cancelled'>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      resolve({ ...result, output, timedOut, cancelled });
    };
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          killTree(child.pid);
        }, opts.timeoutMs)
      : undefined;
    const onAbort = () => {
      cancelled = true;
      killTree(child.pid);
    };
    if (opts.signal?.aborted) onAbort();
    else opts.signal?.addEventListener('abort', onAbort);
    child.on('error', (err) => finish({ code: null, error: err.message }));
    child.on('exit', (code) => finish({ code }));
  });
}
