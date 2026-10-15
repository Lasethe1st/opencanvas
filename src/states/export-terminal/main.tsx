import { StrictMode, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import '../../lib/theme';
import '@fontsource-variable/inter';
import '@fontsource-variable/geist-mono';
import '../../styles/tokens.css';
import '../../styles/ui.css';
import '../../styles/app.css';
import '../bug-check/states.css';
import './states.css';
import type { TerminalSession } from '../../../shared/terminal';
import type { BuildCheckResult } from '../../../shared/types';
import { ExportDialog } from '../../components/ExportDialog';
import { TerminalPanel } from '../../components/TerminalPanel';
import { Toasts } from '../../components/Toasts';
import { api } from '../../lib/api';
import { setState } from '../../lib/store';
import { resetTerminals, viewFor } from '../../lib/terminal';
import { GROUPS, PROJECT, STATE_KEYS, STATES, type StateDef } from './fixtures';

const subscribe = (fn: () => void) => {
  window.addEventListener('popstate', fn);
  return () => window.removeEventListener('popstate', fn);
};
const readState = () => {
  const key = new URLSearchParams(location.search).get('__state') ?? '';
  return STATES[key] ? key : STATE_KEYS[0];
};
const go = (key: string) => {
  const url = new URL(location.href);
  url.searchParams.set('__state', key);
  history.replaceState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

/* ---------- Fake desktop API for the active state ---------- */

let current: StateDef = STATES[STATE_KEYS[0]];
let skipAutoCreate = false;
let created = 0;
const logListeners = new Set<(text: string) => void>();
const PROMPT = '\x1b[2mPS\x1b[0m C:\\Users\\you\\OpenCanvas\\northbound> ';
const never = <T,>() => new Promise<T>(() => undefined);

api.terminal.unavailable = async () => current.terminal?.unavailable ?? null;
api.terminal.create = async () => {
  // The panel opens a shell by itself when it has none; the empty state should stay empty.
  if (skipAutoCreate) {
    skipAutoCreate = false;
    return never<TerminalSession>();
  }
  const session: TerminalSession = { id: `new-${++created}`, title: `Terminal ${created + 1}`, kind: 'user', pid: 7000 + created, cwd: PROJECT.root, shell: 'powershell.exe', status: 'running', exitCode: null };
  queueMicrotask(() => viewFor(session.id).term.write(PROMPT));
  return session;
};
api.terminal.write = async (id, data) => {
  viewFor(id).term.write(data.replace(/\r/g, `\r\n${PROMPT}`).replace(/\x7f/g, '\b \b'));
};
api.terminal.resize = async () => undefined;
api.terminal.kill = async () => undefined;
api.terminal.rename = async (id, title) => {
  const session = current.terminal?.sessions.find((s) => s.session.id === id)?.session;
  return session ? { ...session, title } : null;
};
api.validateExport = async () => current.export?.report ?? never();
api.checkBuild = async () => {
  const ex = current.export!;
  queueMicrotask(() => ex.log && logListeners.forEach((fn) => fn(ex.log!)));
  return ex.check ? (await new Promise((r) => setTimeout(r, 50)), ex.check) : never<BuildCheckResult>();
};
api.cancelBuildCheck = async () => undefined;
api.onCheckLog = (fn) => {
  logListeners.add(fn);
  return () => logListeners.delete(fn);
};
api.exportZip = async () => current.export?.exported ?? { ok: false };
api.revealFile = async () => undefined;
api.revealProject = async () => undefined;

function apply(def: StateDef) {
  current = def;
  resetTerminals();
  if (def.terminal) {
    const { sessions, active, unavailable } = def.terminal;
    skipAutoCreate = !sessions.length && !unavailable;
    for (const { session, output } of sessions) viewFor(session.id).term.write(output);
    setState({ project: PROJECT, terminalOpen: true, terminals: sessions.map((s) => s.session), activeTerminal: active ?? sessions[0]?.session.id ?? null, exportOpen: false, buffers: {} });
  } else {
    const dirty = def.export.dirty;
    setState({
      project: PROJECT,
      terminalOpen: false,
      exportOpen: true,
      buffers: dirty ? { 'src/App.jsx': { content: 'export default 1;', saved: 'export default 0;' } as never } : {},
    });
  }
}

function clickButton(root: HTMLElement | null, text: RegExp) {
  const button = [...(root?.querySelectorAll('button') ?? [])].find((b) => text.test(b.textContent ?? ''));
  button?.click();
  return !!button;
}

function StatesPage() {
  const active = useSyncExternalStore(subscribe, readState);
  const [applied, setApplied] = useState<string | null>(null);
  const listRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const def = STATES[active];

  useLayoutEffect(() => {
    apply(STATES[active]);
    setApplied(active);
  }, [active]);

  // States after a click: start the build check, or export once the report is in.
  useEffect(() => {
    const ex = STATES[active].export;
    if (applied !== active || !ex || (ex.check === undefined && !ex.exported)) return;
    const timer = setInterval(() => {
      const stage = stageRef.current;
      if (!stage?.querySelector('.export-report__summary')) return;
      clearInterval(timer);
      if (ex.check !== undefined) clickButton(stage, /Check it builds/);
      if (ex.exported) clickButton(stage, /Download project ZIP/);
    }, 30);
    return () => clearInterval(timer);
  }, [applied, active]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .terminal-panel, .dialog')) return;
      if (e.key === 'h' || e.key === 'H') {
        document.documentElement.toggleAttribute('data-states-hidden');
        return;
      }
      const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      const next = STATE_KEYS[STATE_KEYS.indexOf(readState()) + step];
      if (!next) return;
      e.preventDefault();
      go(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="state-page">
      <div className="state-layout state-layout--m4">
        <nav ref={listRef} className="state-switcher" aria-label="States">
          {GROUPS.map((g) => (
            <div key={g.heading} className="state-switcher-group" role="group" aria-labelledby={`states-${g.heading}`}>
              <span className="state-switcher-heading" id={`states-${g.heading}`}>
                {g.heading}
              </span>
              {Object.entries(g.states).map(([key, s]) => (
                <button key={key} type="button" data-state={key} aria-pressed={key === active} onClick={() => go(key)}>
                  {s.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="state-switcher-select">
          <select aria-label="State" value={active} onChange={(e) => go(e.target.value)}>
            {GROUPS.map((g) => (
              <optgroup key={g.heading} label={g.heading}>
                {Object.entries(g.states).map(([key, s]) => (
                  <option key={key} value={key}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div ref={stageRef} className={`state-stage state-stage--m4 ${def.terminal ? 'is-terminal' : 'is-export'}`}>
          <div className="state-stage__canvas" aria-hidden />
          {applied === active && (def.terminal ? <TerminalPanel key={active} /> : <ExportDialog key={active} />)}
        </div>
      </div>
      <Toasts />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StatesPage />
  </StrictMode>,
);
