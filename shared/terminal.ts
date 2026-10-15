export type TerminalKind = 'user' | 'ai';

export interface TerminalSession {
  id: string;
  title: string;
  kind: TerminalKind;
  pid: number;
  cwd: string;
  shell: string;
  status: 'running' | 'exited';
  exitCode: number | null;
}

export interface TerminalDataEvent {
  id: string;
  data: string;
}

export interface TerminalExitEvent {
  id: string;
  exitCode: number | null;
}

export const TERMINAL_LIMITS = {
  /** Output is flushed to the editor at most this often. */
  flushMs: 16,
  /** Largest single flush; bigger bursts are split across flushes. */
  flushBytes: 64 * 1024,
  /** Scrollback kept in memory so a reloaded panel can reattach. Never written to disk. */
  scrollback: 200 * 1024,
  maxSessions: 8,
} as const;
