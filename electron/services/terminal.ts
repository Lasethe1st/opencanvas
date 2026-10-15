import fs from 'node:fs';
import path from 'node:path';
import { TERMINAL_LIMITS, type TerminalExitEvent, type TerminalKind, type TerminalSession } from '../../shared/terminal';
import { killTree } from './processes';

/** The subset of node-pty's IPty the manager relies on. */
export interface Pty {
  pid: number;
  onData(listener: (data: string) => void): unknown;
  onExit(listener: (e: { exitCode: number; signal?: number }) => void): unknown;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export type SpawnPty = (file: string, args: string[], opts: { cwd: string; env: Record<string, string>; cols: number; rows: number; name: string }) => Pty;

export interface TerminalDeps {
  spawn: SpawnPty;
  onData: (id: string, data: string) => void;
  onExit: (event: TerminalExitEvent) => void;
  shell?: () => { file: string; args: string[] };
  env?: NodeJS.ProcessEnv;
}

export class TerminalError extends Error {}

/** Environment for project shells: the user's own, minus the editor's internals. */
export function terminalEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (/^OC_/i.test(key) || /^ELECTRON_/i.test(key)) continue;
    out[key] = value;
  }
  out.TERM = out.TERM || 'xterm-256color';
  out.COLORTERM = 'truecolor';
  return out;
}

function onPath(exe: string, env: NodeJS.ProcessEnv): boolean {
  const dirs = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean);
  return dirs.some((d) => fs.existsSync(path.join(d, exe)));
}

export function defaultShell(env: NodeJS.ProcessEnv = process.env): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    if (onPath('pwsh.exe', env)) return { file: 'pwsh.exe', args: ['-NoLogo'] };
    return { file: 'powershell.exe', args: ['-NoLogo'] };
  }
  const shell = env.SHELL && fs.existsSync(env.SHELL) ? env.SHELL : '/bin/bash';
  return { file: shell, args: ['-l'] };
}

interface Live {
  info: TerminalSession;
  pty: Pty;
  pending: string;
  timer: NodeJS.Timeout | null;
  scrollback: string;
  exited: Promise<number | null>;
}

/** Removes colour and cursor escape sequences so output reads as plain text. */
export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/\r(?!\n)/g, '\n');
}

/** Command line for running one command in the platform's shell. */
export function commandShell(command: string): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    // -Command reports any failure as exit code 1; pass the program's own code through instead.
    const script = `${command}; $__ocOk = $?; if ($LASTEXITCODE) { exit $LASTEXITCODE }; if (-not $__ocOk) { exit 1 }`;
    return { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-Command', script] };
  }
  return { file: process.env.SHELL && fs.existsSync(process.env.SHELL) ? process.env.SHELL : '/bin/bash', args: ['-lc', command] };
}

export class TerminalManager {
  private sessions = new Map<string, Live>();
  private seq = 0;

  constructor(private deps: TerminalDeps) {}

  list(): TerminalSession[] {
    return [...this.sessions.values()].map((s) => this.snapshot(s));
  }

  get(id: string): TerminalSession | null {
    const s = this.sessions.get(id);
    return s ? this.snapshot(s) : null;
  }

  /** On Windows the pid is only known once ConPTY has started the process, so read it live. */
  private snapshot(s: Live): TerminalSession {
    if (s.pty.pid > 0) s.info.pid = s.pty.pid;
    return { ...s.info };
  }

  /** Output held in memory for a panel that is reattaching. */
  scrollback(id: string): string {
    return this.sessions.get(id)?.scrollback ?? '';
  }

  create(opts: { cwd: string; kind?: TerminalKind; title?: string; cols?: number; rows?: number; command?: { file: string; args: string[] } }): TerminalSession {
    if (!fs.existsSync(opts.cwd)) throw new TerminalError('The project folder no longer exists.');
    const running = [...this.sessions.values()].filter((s) => s.info.status === 'running').length;
    if (running >= TERMINAL_LIMITS.maxSessions) throw new TerminalError(`You can have up to ${TERMINAL_LIMITS.maxSessions} terminals open. Close one first.`);
    const shell = opts.command ?? (this.deps.shell ?? (() => defaultShell(this.deps.env)))();
    const kind = opts.kind ?? 'user';
    const id = `t${++this.seq}-${Date.now().toString(36)}`;
    let pty: Pty;
    try {
      pty = this.deps.spawn(shell.file, shell.args, {
        cwd: opts.cwd,
        env: terminalEnv(this.deps.env),
        cols: Math.max(10, opts.cols ?? 100),
        rows: Math.max(4, opts.rows ?? 24),
        name: 'xterm-256color',
      });
    } catch (err) {
      throw new TerminalError(`Could not start ${path.basename(shell.file)}: ${(err as Error).message}`);
    }
    const count = [...this.sessions.values()].filter((s) => s.info.kind === kind).length + 1;
    const info: TerminalSession = {
      id,
      title: opts.title?.trim() || (kind === 'ai' ? `AI ${count}` : `Terminal ${count}`),
      kind,
      pid: pty.pid,
      cwd: opts.cwd,
      shell: path.basename(shell.file),
      status: 'running',
      exitCode: null,
    };
    let resolveExit!: (code: number | null) => void;
    const live: Live = { info, pty, pending: '', timer: null, scrollback: '', exited: new Promise((r) => (resolveExit = r)) };
    this.sessions.set(id, live);
    pty.onData((data) => this.push(live, data));
    pty.onExit(({ exitCode }) => {
      this.flush(live);
      live.info.status = 'exited';
      live.info.exitCode = typeof exitCode === 'number' ? exitCode : null;
      this.deps.onExit({ id, exitCode: live.info.exitCode });
      resolveExit(live.info.exitCode);
    });
    return { ...info };
  }

  /** Resolves with the exit code when the session's process ends (null if it was killed or is unknown). */
  waitForExit(id: string): Promise<number | null> {
    return this.sessions.get(id)?.exited ?? Promise.resolve(null);
  }

  private push(live: Live, data: string) {
    live.scrollback = (live.scrollback + data).slice(-TERMINAL_LIMITS.scrollback);
    live.pending += data;
    if (live.pending.length >= TERMINAL_LIMITS.flushBytes) this.flush(live);
    else if (!live.timer) live.timer = setTimeout(() => this.flush(live), TERMINAL_LIMITS.flushMs);
  }

  private flush(live: Live) {
    if (live.timer) clearTimeout(live.timer);
    live.timer = null;
    while (live.pending) {
      const chunk = live.pending.slice(0, TERMINAL_LIMITS.flushBytes);
      live.pending = live.pending.slice(chunk.length);
      this.deps.onData(live.info.id, chunk);
    }
  }

  write(id: string, data: string): void {
    const s = this.sessions.get(id);
    if (!s || s.info.status !== 'running') return;
    s.pty.write(String(data));
  }

  resize(id: string, cols: number, rows: number): void {
    const s = this.sessions.get(id);
    if (!s || s.info.status !== 'running') return;
    const c = Math.floor(Number(cols));
    const r = Math.floor(Number(rows));
    if (!(c >= 2 && c <= 1000 && r >= 1 && r <= 500)) return;
    try {
      s.pty.resize(c, r);
    } catch {
      /* the process may have just exited */
    }
  }

  rename(id: string, title: string): TerminalSession | null {
    const s = this.sessions.get(id);
    const next = String(title ?? '').trim().slice(0, 40);
    if (!s || !next) return s ? { ...s.info } : null;
    s.info.title = next;
    return { ...s.info };
  }

  /** Ends the session and every process it started. Exited sessions are removed from the list. */
  kill(id: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    if (s.info.status === 'running') {
      killTree(this.snapshot(s).pid, true);
      try {
        s.pty.kill();
      } catch {
        /* already gone */
      }
    }
    this.sessions.delete(id);
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }

  /**
   * Runs one command for the AI in its own visible session. Resolves when it exits, when it has been running
   * `settleMs` (long-running servers keep going in their tab), on timeout, or when `signal` aborts.
   */
  async runCommand(opts: { cwd: string; command: string; signal: AbortSignal; timeoutMs: number; longRunning?: boolean; settleMs?: number; onCreated?: (s: TerminalSession) => void }): Promise<CommandRun> {
    const session = this.create({ cwd: opts.cwd, kind: 'ai', command: commandShell(opts.command) });
    opts.onCreated?.(session);
    const live = this.sessions.get(session.id)!;
    let timer: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;
    type Outcome = { kind: 'exit'; code: number | null } | { kind: 'timeout' } | { kind: 'settled' } | { kind: 'aborted' };
    const outcome = await Promise.race<Outcome>([
      live.exited.then((code) => ({ kind: 'exit' as const, code })),
      new Promise<Outcome>((r) => (timer = setTimeout(() => r(opts.longRunning ? { kind: 'settled' } : { kind: 'timeout' }), opts.longRunning ? (opts.settleMs ?? 15_000) : opts.timeoutMs))),
      new Promise<Outcome>((r) => {
        onAbort = () => r({ kind: 'aborted' });
        if (opts.signal.aborted) onAbort();
        else opts.signal.addEventListener('abort', onAbort, { once: true });
      }),
    ]);
    clearTimeout(timer);
    if (onAbort) opts.signal.removeEventListener('abort', onAbort);
    // ConPTY can deliver the last chunk just after the exit event.
    if (outcome.kind === 'exit') await new Promise((r) => setTimeout(r, 150));
    const output = stripAnsi(live.scrollback);
    if (outcome.kind === 'timeout' || outcome.kind === 'aborted') this.stop(session.id);
    return {
      sessionId: session.id,
      title: session.title,
      exitCode: outcome.kind === 'exit' ? outcome.code : null,
      status: outcome.kind === 'exit' ? 'exited' : outcome.kind === 'settled' ? 'running' : outcome.kind === 'timeout' ? 'timed-out' : 'stopped',
      output,
    };
  }

  /** Ends a session's processes but keeps its tab so the output stays readable. */
  stop(id: string): void {
    const s = this.sessions.get(id);
    if (!s || s.info.status !== 'running') return;
    killTree(this.snapshot(s).pid, true);
    try {
      s.pty.kill();
    } catch {
      /* already gone */
    }
  }
}

export interface CommandRun {
  sessionId: string;
  title: string;
  exitCode: number | null;
  status: 'exited' | 'running' | 'timed-out' | 'stopped';
  output: string;
}
