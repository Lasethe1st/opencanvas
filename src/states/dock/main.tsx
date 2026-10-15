import { StrictMode, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import '../../lib/theme';
import '@fontsource-variable/inter';
import '@fontsource-variable/geist-mono';
import '../../styles/tokens.css';
import '../../styles/ui.css';
import '../../styles/app.css';
import '../../styles/open-canvas.css';
import '../../styles/direction.css';
import '../bug-check/states.css';
import './states.css';
import { Dock } from '../../components/Dock';
import { Toasts } from '../../components/Toasts';
import { setState } from '../../lib/store';
import { FILE_TREE, FRAMES, GROUPS, RUNTIME, STATE_KEYS, STATES } from './fixtures';

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

/** Types into a React-controlled input the way a user would. */
function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const Arrow = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v4a3 3 0 0 0 3 3h7" />
    <path d="m10 7 3 3-3 3" />
  </svg>
);

function StatesPage() {
  const active = useSyncExternalStore(subscribe, readState);
  const [applied, setApplied] = useState<string | null>(null);
  const listRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const s = STATES[active];
    setState({
      projectConfig: s.config,
      dockMode: s.mode,
      dockDraft: s.draft ?? '',
      mcp: s.mcp ?? null,
      aiStatus: s.ai?.status ?? null,
      aiChat: s.ai?.chat ?? [],
      aiTurnId: s.ai?.turnId ?? null,
      frames: FRAMES,
      activeFrameId: FRAMES[0].id,
      frameRuntime: RUNTIME,
      fileTree: FILE_TREE,
    });
    setApplied(active);
  }, [active]);

  useEffect(() => {
    const query = STATES[active].query;
    if (applied !== active || !query) return;
    const input = stageRef.current?.querySelector<HTMLInputElement>('.dock-search input');
    if (input) typeInto(input, query);
  }, [applied, active]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .dock')) return;
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
      <div className="state-layout state-layout--dock">
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

        <div ref={stageRef} className="state-stage state-stage--dock stage">
          {applied === active && <Dock key={active} />}
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
