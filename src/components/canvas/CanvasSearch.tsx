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
  const root = useStore((s) => s.project?.root ?? '');
  return open ? <Palette key={root} /> : null;
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

  const activeFrame = frames.find((f) => f.id === activeFrameId);
  const activeName = activeFrame?.name ?? '';
  const activeDevice = activeFrame?.preset ?? 'custom';
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
      if (!idx) return;
      // Fuzzy matches still rank, but only a contiguous substring gets highlighted.
      const contiguous = text.toLowerCase().includes(query);
      hits.push({ ...it, idx: contiguous ? idx : [], s: score(text, idx) });
    };
    if (!commandMode && !query) {
      // No recents yet: offer a few frames, then commands, instead of blank glass.
      if (!recents.length)
        return [
          ...frames.slice(0, 3).map((f): Hit => ({ key: `f-${f.id}`, kind: 'frame', label: f.name, id: f.id, device: f.preset, idx: [], s: 0 })),
          ...commands.slice(0, 4).map((c): Hit => ({ ...c, idx: [], s: 0 })),
        ];
      return recents.map((r): Hit => ({ key: `r-${r.kind}-${r.id}-${r.uid ?? ''}`, ...r, idx: [], s: 0 }));
    }
    if (!commandMode) {
      for (const f of frames) add({ key: `f-${f.id}`, kind: 'frame', label: f.name, id: f.id, device: f.preset, }, f.name);
      for (const n of elements) {
        const label = n.name || n.tag;
        add({ key: `e-${n.uid}`, kind: 'element', label, tag: n.tag, id: n.id, uid: n.uid, meta: activeName, device: activeDevice }, label);
      }
    }
    for (const c of commands) add(c, c.label);
    const order: Record<Kind, number> = { frame: 0, element: 1, command: 2 };
    hits.sort((a, b) => order[a.kind] - order[b.kind] || a.s - b.s);
    // Cap each group so huge trees stay snappy.
    const per: Record<Kind, number> = { frame: 0, element: 0, command: 0 };
    return hits.filter((h) => ++per[h.kind] <= (h.kind === 'element' ? 50 : 20));
  }, [frames, elements, commands, query, commandMode, recents, activeName, activeDevice]);

  const typed = raw.trim();
  const empty = !typed;
  // The debounced query lags the input by ~80ms; don't flash recents or 'No matches' meanwhile.
  const pending = !empty && raw !== q;
  // Layers arrive from the preview after the project opens; until then, show placeholders, not 'No matches'.
  const loading = !commandMode && !empty && domTree.length === 0;
  const noMatch = !empty && !pending && !loading && results.length === 0;
  const fallback = noMatch ? commands.filter((c) => ['c-fit', 'c-desktop', 'c-keys'].includes(c.key)) : [];
  const shown = pending || loading ? [] : noMatch ? fallback.map((c) => ({ ...c, idx: [] as number[] })) : results;
  const showRecents = empty && recents.length > 0;
  useEffect(() => setSel(0), [query, commandMode, noMatch]);
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
      pushRecent({ kind: 'element', id: it.id, uid: it.uid, label: it.label, meta: it.meta, tag: it.tag, device: it.device });
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(shown[sel]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
    // Ctrl/Cmd+K bubbles to the app's window handler, which toggles the palette closed.
    if (!(e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) e.stopPropagation();
  };

  let index = -1;
  const onInput = (value: string) => {
    // A '>' anywhere switches to commands: keep only what follows the last '>'.
    const at = value.lastIndexOf('>');
    if (at > 0 || (at === 0 && value !== value.trimStart())) value = '>' + value.slice(at + 1);
    else if (at < 0 && value.trimStart().startsWith('>')) value = value.trimStart();
    setRaw(value);
  };
  return (
    <div className="canvas-search__scrim" onPointerDown={(e) => e.target === e.currentTarget && close(true)}>
      <div className="canvas-search" role="dialog" aria-label="Search canvas" onKeyDown={onKey}>
        <div className="canvas-search__field">
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            value={raw}
            onChange={(e) => onInput(e.target.value)}
            placeholder="Search"
            spellCheck={false}
            aria-label="Search canvas"
            aria-activedescendant={shown[sel] ? `cs-${shown[sel].key}` : undefined}
          />
          <kbd className="canvas-search__kbd">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </div>
        <div className="canvas-search__list" ref={listRef} role="listbox">
          {(pending || loading) &&
            [0, 1, 2].map((i) => (
              <div key={i} className="canvas-search__skeleton" aria-hidden="true">
                <span />
                <span style={{ width: `${[46, 32, 58][i]}%` }} />
              </div>
            ))}
          {noMatch && (
            <>
              <div className="canvas-search__empty">No matches for “{typed.replace(/^>\s*/, '')}”</div>
              <div className="canvas-search__group">Try</div>
            </>
          )}
          {showRecents && <div className="canvas-search__group">Recent</div>}
          {showRecents || noMatch
            ? shown.map((it) => <Row key={it.key} it={it} index={++index} sel={sel} setSel={setSel} choose={choose} />)
            : GROUPS.map((g) => {
                const rows = shown.filter((r) => r.kind === g.kind);
                if (!rows.length) return null;
                return (
                  <div key={g.kind}>
                    <div className="canvas-search__group">{g.title}</div>
                    {rows.map((it) => <Row key={it.key} it={it} index={++index} sel={sel} setSel={setSel} choose={choose} />)}
                  </div>
                );
              })}
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
  const PlaceIcon = (it.kind !== 'command' ? DEVICE_ICON[it.device ?? 'custom'] ?? Frame : null) as Icon | null;
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
      {PlaceIcon && (
        <span className="canvas-search__device" title={it.kind === 'element' ? it.meta : undefined}>
          <PlaceIcon size={14} aria-hidden="true" />
        </span>
      )}
    </div>
  );
}
