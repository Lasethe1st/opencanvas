import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { selectElement } from '../../lib/actions';
import { addFrame, fitAll, fitFrame, fitSelection, setActiveFrame, setCamera } from '../../lib/canvas';
import { Frame, Keyboard, Moon, Plus, Ruler, Search, Settings, Columns3, Maximize, type Icon } from '../../lib/hugeicons';
import { LayerIcon, layerKind } from '../../lib/layer-icons';
import { togglePanels } from '../../lib/panels';
import { getRulers, setRulers } from '../../lib/rulers';
import { getState, setState, useStore, type TreeNode } from '../../lib/store';
import { setThemePreference } from '../../lib/theme';
import { DEVICE_ICON } from '../../ui/FreeCanvas';

type Kind = 'frame' | 'element' | 'command';
interface Item {
  key: string;
  kind: Kind;
  label: string;
  meta?: string;
  tag?: string;
  device?: string;
  icon?: Icon;
  id?: string;
  uid?: string;
  run?: () => void;
}
interface Recent { kind: 'frame' | 'element'; id: string; uid?: string; label: string; meta?: string; tag?: string; device?: string }

const MAX_RECENTS = 5;
const recentsKey = () => `oc-canvas-search:${(getState().project?.root ?? '').replace(/\\/g, '/').toLowerCase()}`;
function loadRecents(): Recent[] {
  try {
    const raw = JSON.parse(localStorage.getItem(recentsKey()) ?? '[]');
    return Array.isArray(raw) ? raw.slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}
function pushRecent(r: Recent) {
  try {
    const next = [r, ...loadRecents().filter((x) => !(x.kind === r.kind && x.id === r.id && x.uid === r.uid))].slice(0, MAX_RECENTS);
    localStorage.setItem(recentsKey(), JSON.stringify(next));
  } catch {
    /* storage blocked */
  }
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Subsequence match: returns the matched character indexes, or null. Contiguous substrings win. */
function match(text: string, q: string): number[] | null {
  if (!q) return [];
  const t = text.toLowerCase();
  const at = t.indexOf(q);
  if (at >= 0) return Array.from({ length: q.length }, (_, i) => at + i);
  const idx: number[] = [];
  let j = 0;
  for (let i = 0; i < t.length && j < q.length; i++) if (t[i] === q[j]) idx.push(i), j++;
  return j === q.length ? idx : null;
}
function score(text: string, idx: number[]) {
  if (!idx.length) return 0;
  const spread = idx[idx.length - 1] - idx[0] - idx.length;
  return idx[0] + spread * 2 + text.length * 0.01;
}

function Highlight({ text, idx }: { text: string; idx: number[] }) {
  if (!idx.length) return <>{text}</>;
  const set = new Set(idx);
  const out: ReactNode[] = [];
  let buf = '';
  let on = false;
  const flush = (k: number) => {
    if (buf) out.push(on ? <mark key={k}>{buf}</mark> : buf);
    buf = '';
  };
  [...text].forEach((ch, i) => {
    const hit = set.has(i);
    if (hit !== on) flush(i), (on = hit);
    buf += ch;
  });
  flush(text.length);
  return <>{out}</>;
}

function flatten(nodes: TreeNode[], out: TreeNode[] = []) {
  for (const n of nodes) {
    out.push(n);
    if (n.children?.length) flatten(n.children, out);
  }
  return out;
}

/** Selects an element in the active frame, then pans and zooms to it once the preview reports its rect. */
function jumpToElement(id: string, uid: string) {
  selectElement(id, uid, false);
  if (getState().selection?.uid === uid) return fitSelection();
  const unsub = useStore.subscribe((s) => {
    if (s.selection?.uid === uid) {
      unsub();
      clearTimeout(t);
      fitSelection();
    }
  });
  const t = setTimeout(unsub, 2000);
}

const GROUPS: { kind: Kind; title: string }[] = [
  { kind: 'frame', title: 'Frames' },
  { kind: 'element', title: 'Elements' },
  { kind: 'command', title: 'Commands' },
];

export function CanvasSearch() {
  const open = useStore((s) => s.canvasSearchOpen);
  return open ? <Palette /> : null;
}

function Palette() {
  const frames = useStore((s) => s.frames);
  const domTree = useStore((s) => s.domTree);
  const activeFrameId = useStore((s) => s.activeFrameId);
  const [raw, setRaw] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const savedCamera = useRef(getState().camera);
  const [recents] = useState(loadRecents);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  // ~80ms debounce keeps typing smooth on big trees.
  useEffect(() => {
    const t = setTimeout(() => setQ(raw), 80);
    return () => clearTimeout(t);
  }, [raw]);

  const close = (restore: boolean) => {
    if (restore) setCamera(savedCamera.current);
    setState({ canvasSearchOpen: false });
  };

  const activeName = frames.find((f) => f.id === activeFrameId)?.name ?? '';
  const elements = useMemo(() => flatten(domTree), [domTree]);
  const commands: Item[] = useMemo(
    () => [
      { key: 'c-desktop', kind: 'command', label: 'Add desktop frame', icon: Plus, run: () => addFrame('desktop') },
      { key: 'c-tablet', kind: 'command', label: 'Add tablet frame', icon: Plus, run: () => addFrame('tablet') },
      { key: 'c-mobile', kind: 'command', label: 'Add mobile frame', icon: Plus, run: () => addFrame('mobile') },
      { key: 'c-fit', kind: 'command', label: 'Zoom to fit all', icon: Maximize, run: fitAll },
      { key: 'c-rulers', kind: 'command', label: 'Toggle rulers', icon: Ruler, run: () => setRulers(!getRulers()) },
      { key: 'c-panels', kind: 'command', label: 'Toggle sidebars', icon: Columns3, run: togglePanels },
      { key: 'c-theme', kind: 'command', label: 'Toggle dark mode', icon: Moon, run: () => setThemePreference(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') },
      { key: 'c-settings', kind: 'command', label: 'Open settings', icon: Settings, run: () => setState({ settingsOpen: true }) },
      { key: 'c-keys', kind: 'command', label: 'Keyboard shortcuts', icon: Keyboard, run: () => setState({ shortcutsOpen: true }) },
    ],
    [],
  );

  const commandMode = raw.trimStart().startsWith('>');
  const query = (commandMode ? q.trimStart().replace(/^>/, '') : q).trim().toLowerCase();

  const results = useMemo(() => {
    type Hit = Item & { idx: number[]; s: number };
    const hits: Hit[] = [];
    const add = (it: Item, text: string) => {
      const idx = match(text, query);
      if (idx) hits.push({ ...it, idx, s: score(text, idx) });
    };
    if (!commandMode && !query) {
      // No recents yet: offer a few commands instead of blank glass.
      if (!recents.length) return commands.slice(0, 4).map((c): Hit => ({ ...c, idx: [], s: 0 }));
      return recents.map((r): Hit => ({ key: `r-${r.kind}-${r.id}-${r.uid ?? ''}`, ...r, idx: [], s: 0 }));
    }
    if (!commandMode) {
      for (const f of frames) add({ key: `f-${f.id}`, kind: 'frame', label: f.name, id: f.id, device: f.preset, }, f.name);
      for (const n of elements) {
        const label = n.name || n.tag;
        add({ key: `e-${n.uid}`, kind: 'element', label, tag: n.tag, id: n.id, uid: n.uid, meta: activeName }, label);
      }
    }
    for (const c of commands) add(c, c.label);
    const order: Record<Kind, number> = { frame: 0, element: 1, command: 2 };
    hits.sort((a, b) => order[a.kind] - order[b.kind] || a.s - b.s);
    // Cap each group so huge trees stay snappy.
    const per: Record<Kind, number> = { frame: 0, element: 0, command: 0 };
    return hits.filter((h) => ++per[h.kind] <= (h.kind === 'element' ? 50 : 20));
  }, [frames, elements, commands, query, commandMode, recents, activeName]);

  useEffect(() => setSel(0), [query, commandMode]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const choose = (it: Item | undefined) => {
    if (!it) return;
    close(false);
    if (it.kind === 'command') return it.run?.();
    if (it.kind === 'frame' && it.id) {
      if (!getState().frames.some((f) => f.id === it.id)) return;
      setActiveFrame(it.id);
      fitFrame(it.id);
      pushRecent({ kind: 'frame', id: it.id, label: it.label, device: it.device });
    } else if (it.kind === 'element' && it.id && it.uid) {
      jumpToElement(it.id, it.uid);
      pushRecent({ kind: 'element', id: it.id, uid: it.uid, label: it.label, meta: it.meta, tag: it.tag });
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[sel]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
    // Ctrl/Cmd+K bubbles to the app's window handler, which toggles the palette closed.
    if (!(e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) e.stopPropagation();
  };

  let index = -1;
  const empty = !commandMode && !query;
  return (
    <div className="canvas-search__scrim" onPointerDown={(e) => e.target === e.currentTarget && close(true)}>
      <div className="canvas-search" role="dialog" aria-label="Search canvas" onKeyDown={onKey}>
        <div className="canvas-search__field">
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Search"
            spellCheck={false}
            aria-label="Search canvas"
            aria-activedescendant={results[sel] ? `cs-${results[sel].key}` : undefined}
          />
          <kbd className="canvas-search__kbd">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </div>
        <div className="canvas-search__list" ref={listRef} role="listbox">
          {empty && results.length > 0 && <div className="canvas-search__group">{recents.length ? 'Recent' : 'Commands'}</div>}
          {empty
            ? results.map((it) => <Row key={it.key} it={it} index={++index} sel={sel} setSel={setSel} choose={choose} />)
            : GROUPS.map((g) => {
                const rows = results.filter((r) => r.kind === g.kind);
                if (!rows.length) return null;
                return (
                  <div key={g.kind}>
                    <div className="canvas-search__group">{g.title}</div>
                    {rows.map((it) => <Row key={it.key} it={it} index={++index} sel={sel} setSel={setSel} choose={choose} />)}
                  </div>
                );
              })}
          {!results.length && !empty && <div className="canvas-search__empty">No matches</div>}
          {empty && (
            <div className="canvas-search__hint">
              Type <kbd>&gt;</kbd> for commands
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ it, index, sel, setSel, choose }: { it: Item & { idx?: number[] }; index: number; sel: number; setSel: (i: number) => void; choose: (it: Item) => void }) {
  const kind = it.kind === 'element' ? layerKind(it.tag ?? 'div') : it.kind === 'frame' ? 'frame' : 'command';
  const DeviceIcon = (it.kind === 'frame' ? DEVICE_ICON[it.device ?? 'custom'] ?? Frame : null) as Icon | null;
  const CmdIcon = it.icon;
  return (
    <div
      id={`cs-${it.key}`}
      role="option"
      aria-selected={index === sel}
      data-index={index}
      data-kind={kind}
      className={`canvas-search__row${index === sel ? ' is-active' : ''}`}
      onPointerMove={() => index !== sel && setSel(index)}
      onClick={() => choose(it)}
    >
      <span className="canvas-search__chip">
        {it.kind === 'element' ? <LayerIcon tag={it.tag ?? 'div'} size={13} color="currentColor" /> : DeviceIcon ? <DeviceIcon size={13} aria-hidden="true" /> : CmdIcon ? <CmdIcon size={13} aria-hidden="true" /> : null}
      </span>
      <span className="canvas-search__label">
        <Highlight text={it.label} idx={it.idx ?? []} />
      </span>
      {it.kind === 'frame' && DeviceIcon ? (
        <span className="canvas-search__device">
          <DeviceIcon size={14} aria-hidden="true" />
        </span>
      ) : (
        it.meta && <span className="canvas-search__meta">{it.meta}</span>
      )}
    </div>
  );
}
