import { StrictMode, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import '../../lib/theme';
import '@fontsource-variable/inter';
import '@fontsource-variable/geist-mono';
import '../../styles/tokens.css';
import '../../styles/ui.css';
import '../../styles/app.css';
import '../../styles/open-canvas.css';
import './states.css';
import { BugCheckPanel } from '../../components/BugCheck';
import { Toasts } from '../../components/Toasts';
import { setState, useStore } from '../../lib/store';
import { GROUPS, STATE_KEYS, STATES } from './fixtures';

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

const Arrow = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v4a3 3 0 0 0 3 3h7" />
    <path d="m10 7 3 3-3 3" />
  </svg>
);

function StatesPage() {
  const active = useSyncExternalStore(subscribe, readState);
  const open = useStore((s) => s.auditOpen);
  const listRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const { running, audit } = STATES[active];
    setState({ auditOpen: true, auditRunning: running, audit });
  }, [active]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
      if (e.key === 'h' || e.key === 'H') {
        document.documentElement.toggleAttribute('data-states-hidden');
        return;
      }
      const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      const i = STATE_KEYS.indexOf(readState());
      const next = STATE_KEYS[i + step];
      if (!next) return;
      e.preventDefault();
      go(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="state-page">
      <div className="state-layout">
        <nav ref={listRef} className="state-switcher" aria-label="States">
          {GROUPS.map((g) => (
            <div key={g.heading} className="state-switcher-group" role="group" aria-labelledby={`states-${g.heading}`}>
              <span className="state-switcher-heading" id={`states-${g.heading}`}>
                <Arrow />
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
          <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </div>

        <div className="state-stage">{open ? <BugCheckPanel /> : <button type="button" className="state-reopen" onClick={() => setState({ auditOpen: true })}>Panel closed. Reopen</button>}</div>
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
