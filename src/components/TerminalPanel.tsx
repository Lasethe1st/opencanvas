import { ChevronDown, Plus, SquareTerminal, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { TerminalSession } from '../../shared/terminal';
import { api } from '../lib/api';
import { useStore, setState } from '../lib/store';
import { killTerminal, newTerminal, renameTerminal, setTerminalOpen, toggleTerminal, viewFor } from '../lib/terminal';
import { Button, cx, IconButton } from '../ui/primitives.jsx';
import { ToolButton } from '../ui/ToolRail.jsx';

const HEIGHT_KEY = 'oc-terminal-height';
const MIN_HEIGHT = 120;
const STEP = 24;

function readHeight(): number {
  const stored = Number(localStorage.getItem(HEIGHT_KEY));
  return Number.isFinite(stored) && stored >= MIN_HEIGHT ? stored : 240;
}

const maxHeight = () => Math.max(MIN_HEIGHT, Math.round(window.innerHeight * 0.7));

export function TerminalButton() {
  const open = useStore((s) => s.terminalOpen);
  return (
    <ToolButton label="Terminal" shortcut="Ctrl+`" active={open} onClick={toggleTerminal}>
      <SquareTerminal size={16} />
    </ToolButton>
  );
}

function statusText(t: TerminalSession) {
  if (t.status === 'running') return 'running';
  return t.exitCode === null ? 'exited' : `exited (${t.exitCode})`;
}

function Tab({ session, active }: { session: TerminalSession; active: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== session.title) void renameTerminal(session.id, draft);
    else setDraft(session.title);
  };
  return (
    <div className={cx('terminal-tab', active && 'is-active', session.status === 'exited' && 'is-exited')}>
      {editing ? (
        <input
          className="terminal-tab__rename"
          aria-label="Terminal name"
          autoFocus
          value={draft}
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              e.stopPropagation();
              setDraft(session.title);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          role="tab"
          id={`terminal-tab-${session.id}`}
          aria-selected={active}
          aria-controls="terminal-body"
          className="terminal-tab__main"
          title={`${session.shell} · ${statusText(session)} · double-click or F2 to rename`}
          onClick={() => setState({ activeTerminal: session.id })}
          onDoubleClick={() => setEditing(true)}
          onKeyDown={(e) => e.key === 'F2' && setEditing(true)}
        >
          <span className={cx('terminal-tab__dot', session.status === 'running' ? 'is-running' : 'is-exited')} aria-hidden />
          {session.kind === 'ai' && <span className="terminal-tab__badge">AI</span>}
          <span className="terminal-tab__title">{session.title}</span>
          {session.status === 'exited' ? <span className="terminal-tab__status">{statusText(session)}</span> : <span className="sr-only">, running</span>}
        </button>
      )}
      <IconButton
        size="sm"
        label={session.status === 'running' ? `Kill ${session.title}` : `Close ${session.title}`}
        className="terminal-tab__close"
        onClick={() => void killTerminal(session.id)}
      >
        <X size={12} />
      </IconButton>
    </div>
  );
}

export function TerminalPanel({ force }: { force?: boolean } = {}) {
  const open = useStore((s) => s.terminalOpen) || !!force;
  const terminals = useStore((s) => s.terminals);
  const active = useStore((s) => s.activeTerminal);
  const [height, setHeight] = useState(readHeight);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const autoCreated = useRef(false);

  useEffect(() => {
    void api.terminal.unavailable().then(setUnavailable);
  }, []);

  useEffect(() => {
    localStorage.setItem(HEIGHT_KEY, String(height));
  }, [height]);

  // The first time the panel opens with nothing running, start a shell like any editor terminal would.
  useEffect(() => {
    if (!open || unavailable !== null || terminals.length || autoCreated.current) return;
    autoCreated.current = true;
    void newTerminal();
  }, [open, unavailable, terminals.length]);

  // Mount the active session's xterm into the panel and keep it sized to it.
  useEffect(() => {
    const host = hostRef.current;
    if (!open || !host || !active) return;
    const view = viewFor(active);
    host.replaceChildren(view.el);
    if (!view.opened) {
      view.term.open(view.el);
      view.opened = true;
    }
    const fit = () => {
      if (host.clientWidth > 0 && host.clientHeight > 0) {
        try {
          view.fit.fit();
        } catch {
          /* not measurable yet */
        }
      }
    };
    fit();
    view.term.focus();
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    return () => observer.disconnect();
  }, [open, active]);

  if (!open) return null;

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const move = (ev: PointerEvent) => setHeight(Math.min(maxHeight(), Math.max(MIN_HEIGHT, startH + (startY - ev.clientY))));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('is-resizing-rows');
    };
    document.body.classList.add('is-resizing-rows');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const resizeKeys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp') setHeight((h) => Math.min(maxHeight(), h + STEP));
    else if (e.key === 'ArrowDown') setHeight((h) => Math.max(MIN_HEIGHT, h - STEP));
    else if (e.key === 'Home') setHeight(MIN_HEIGHT);
    else if (e.key === 'End') setHeight(maxHeight());
    else return;
    e.preventDefault();
  };

  // Escape on the panel's own controls hands focus back to the canvas; inside the shell it belongs to the program.
  const chromeKeys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || (e.target as HTMLElement).closest('.terminal-view')) return;
    e.stopPropagation();
    (document.querySelector<HTMLElement>('.stage__viewport') ?? document.querySelector<HTMLElement>('.code-view'))?.focus?.();
  };

  return (
    <section className="terminal-panel" style={{ height }} aria-label="Terminal" onKeyDown={chromeKeys}>
      <div
        className="terminal-panel__resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal"
        aria-valuemin={MIN_HEIGHT}
        aria-valuemax={maxHeight()}
        aria-valuenow={height}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={resizeKeys}
      />
      <div className="terminal-panel__bar">
        <div className="terminal-panel__tabs" role="tablist" aria-label="Terminal sessions">
          {terminals.map((t) => (
            <Tab key={t.id} session={t} active={t.id === active} />
          ))}
        </div>
        <IconButton size="sm" label="New terminal" disabled={unavailable !== null} onClick={() => void newTerminal()}>
          <Plus size={14} />
        </IconButton>
        <IconButton size="sm" label="Hide terminal (Ctrl+`)" onClick={() => setTerminalOpen(false)}>
          <ChevronDown size={14} />
        </IconButton>
      </div>
      {unavailable !== null ? (
        <div className="terminal-panel__empty" role="status">
          {unavailable}
        </div>
      ) : terminals.length === 0 ? (
        <div className="terminal-panel__empty">
          <span>No terminals running.</span>
          <Button size="sm" icon={<Plus size={13} />} onClick={() => void newTerminal()}>
            New terminal
          </Button>
        </div>
      ) : (
        <div id="terminal-body" className="terminal-panel__body" role="tabpanel" aria-labelledby={active ? `terminal-tab-${active}` : undefined} ref={hostRef} />
      )}
    </section>
  );
}
