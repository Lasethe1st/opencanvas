import { FitAddon } from '@xterm/addon-fit';
import { Terminal, type ITheme } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { TerminalSession } from '../../shared/terminal';
import { errorMessage } from './actions';
import { api } from './api';
import { getState, setState, toast } from './store';

export interface TerminalView {
  term: Terminal;
  fit: FitAddon;
  el: HTMLDivElement;
  opened: boolean;
}

const views = new Map<string, TerminalView>();

const ANSI_LIGHT = {
  black: '#2b2b30', red: '#c8262c', green: '#1f7a45', yellow: '#946200', blue: '#2563eb', magenta: '#a3329b', cyan: '#0e7490', white: '#6b6b74',
  brightBlack: '#52525b', brightRed: '#dc3a40', brightGreen: '#1f9d55', brightYellow: '#b07400', brightBlue: '#3b82f6', brightMagenta: '#c041b8', brightCyan: '#0891b2', brightWhite: '#18181b',
};
const ANSI_DARK = {
  black: '#3a3a3f', red: '#f0565c', green: '#3fbf75', yellow: '#f2a33a', blue: '#6ea2f8', magenta: '#d17ad0', cyan: '#4fc3d9', white: '#d4d4d8',
  brightBlack: '#71717a', brightRed: '#ff7b80', brightGreen: '#6fd99a', brightYellow: '#f6c27a', brightBlue: '#93bbfa', brightMagenta: '#e3a0e2', brightCyan: '#7dd8e8', brightWhite: '#fafafa',
};

function themeFromTokens(): ITheme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const dark = document.documentElement.dataset.theme === 'dark';
  return {
    background: v('--surface'),
    foreground: v('--fg'),
    cursor: v('--fg'),
    cursorAccent: v('--surface'),
    selectionBackground: v('--select-soft'),
    ...(dark ? ANSI_DARK : ANSI_LIGHT),
  };
}

new MutationObserver(() => {
  const theme = themeFromTokens();
  for (const view of views.values()) view.term.options.theme = theme;
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/** The xterm instance for a session, created on first use and kept while the session lives. */
export function viewFor(id: string): TerminalView {
  const existing = views.get(id);
  if (existing) return existing;
  const term = new Terminal({
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'Consolas, monospace',
    fontSize: 12,
    lineHeight: 1.25,
    cursorBlink: true,
    scrollback: 5000,
    theme: themeFromTokens(),
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.onData((data) => void api.terminal.write(id, data));
  term.onResize(({ cols, rows }) => void api.terminal.resize(id, cols, rows));
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    const ctrl = e.ctrlKey || e.metaKey;
    // Leave Ctrl+` to the editor so it can hide the panel from inside a shell.
    if (ctrl && e.key === '`') return false;
    if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'c' && term.hasSelection()) {
      void navigator.clipboard.writeText(term.getSelection());
      term.clearSelection();
      return false;
    }
    // Let the browser fire a paste event, which xterm turns into input.
    if (ctrl && e.key.toLowerCase() === 'v') return false;
    return true;
  });
  const el = document.createElement('div');
  el.className = 'terminal-view';
  const view: TerminalView = { term, fit, el, opened: false };
  views.set(id, view);
  return view;
}

function disposeView(id: string) {
  const view = views.get(id);
  if (!view) return;
  view.term.dispose();
  view.el.remove();
  views.delete(id);
}

function upsert(session: TerminalSession) {
  setState((s) => ({ terminals: s.terminals.some((t) => t.id === session.id) ? s.terminals.map((t) => (t.id === session.id ? session : t)) : [...s.terminals, session] }));
}

export function setTerminalOpen(open: boolean) {
  setState({ terminalOpen: open });
  try {
    localStorage.setItem('oc-terminal-open', open ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

export function toggleTerminal() {
  const open = !getState().terminalOpen;
  setTerminalOpen(open);
  if (!open) (document.querySelector<HTMLElement>('.stage__viewport') ?? document.querySelector<HTMLElement>('.code-view'))?.focus?.();
}

export async function newTerminal(): Promise<void> {
  try {
    const session = await api.terminal.create();
    viewFor(session.id);
    upsert(session);
    setState({ activeTerminal: session.id });
    setTerminalOpen(true);
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

export async function killTerminal(id: string): Promise<void> {
  await api.terminal.kill(id);
  disposeView(id);
  setState((s) => {
    const index = s.terminals.findIndex((t) => t.id === id);
    const terminals = s.terminals.filter((t) => t.id !== id);
    const activeTerminal = s.activeTerminal === id ? (terminals[Math.min(index, terminals.length - 1)]?.id ?? null) : s.activeTerminal;
    return { terminals, activeTerminal };
  });
}

export async function renameTerminal(id: string, title: string): Promise<void> {
  const next = await api.terminal.rename(id, title);
  if (next) upsert(next);
}

/** Subscribes to terminal output and reattaches to sessions that outlived a reload. */
export function initTerminals(): () => void {
  const offData = api.terminal.onData(({ id, data }) => {
    if (getState().terminals.some((t) => t.id === id) || views.has(id)) viewFor(id).term.write(data);
  });
  const offExit = api.terminal.onExit(({ id, exitCode }) => {
    const session = getState().terminals.find((t) => t.id === id);
    if (!session) return;
    upsert({ ...session, status: 'exited', exitCode });
    viewFor(id).term.write(`\r\n\x1b[2m[Process exited${exitCode === null ? '' : ` with code ${exitCode}`}]\x1b[0m\r\n`);
  });
  const offCreated = api.terminal.onCreated((session) => {
    viewFor(session.id);
    upsert(session);
    setState({ activeTerminal: session.id });
    setTerminalOpen(true);
  });
  void api.terminal.list().then(async (sessions) => {
    for (const session of sessions) {
      if (views.has(session.id)) continue;
      viewFor(session.id).term.write(await api.terminal.scrollback(session.id));
      upsert(session);
    }
    if (sessions.length && !getState().activeTerminal) setState({ activeTerminal: sessions[0].id });
  });
  return () => {
    offData();
    offExit();
    offCreated();
  };
}

/** Clears views when the project closes (main kills the sessions). */
export function resetTerminals() {
  for (const id of [...views.keys()]) disposeView(id);
  setState({ terminals: [], activeTerminal: null });
}
