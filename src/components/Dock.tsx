import {
  Copy,
  FileCode2,
  FileText,
  Layers,
  Palette,
  Search,
  Sparkles,
  SquareStack,
  SwatchBook,
  Type,
} from '../lib/hugeicons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PageConfig } from '../../shared/project-config';
import type { FileNode } from '../../shared/types';
import { openFile, revealInCode, selectElement } from '../lib/actions';
import { api } from '../lib/api';
import { openAiSettings } from '../lib/ai';
import { focusPage, saveDirection } from '../lib/pages';
import { copyAgentPrompt } from '../lib/prompt';
import { activeFrame, getState, setState, useStore, type DockMode, type TreeNode } from '../lib/store';
import { Button, cx } from '../ui/primitives.jsx';
import { DirectionEditor, uploadPaths, type DirectionDraft } from './direction/DirectionEditor';
import { AiChat } from './dock/AiChat';
import { DockerChat } from './dock/DockerChat';
import { DesignSystemPanel } from './dock/DesignSystem';
import { VariantsPanel } from './dock/Variants';

/** Dock modes hosted in the left control rail (Ask AI, Search, …). */
export const CONTROL_MODES: { id: DockMode; label: string; icon: ReactNode }[] = [
  { id: 'search', label: 'Search', icon: <Search size={15} /> },
  { id: 'direction', label: 'Direction', icon: <Palette size={15} /> },
  { id: 'design-system', label: 'Design system', icon: <SwatchBook size={15} /> },
  { id: 'variants', label: 'Variants', icon: <SquareStack size={15} /> },
];

export const openDock = (mode: DockMode) => setState({ dockMode: mode });
const closeDock = () => setState({ dockMode: null });

/** Floating dock panel for Ask AI / Search / Direction / etc. (opened from the left rail). */
export function Dock() {
  const mode = useStore((s) => s.dockMode);
  const [shown, setShown] = useState<DockMode | null>(mode);
  const dockRef = useRef<HTMLDivElement | null>(null);
  if (mode && mode !== shown) setShown(mode);

  const close = () => closeDock();

  useEffect(() => {
    if (!mode) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && dockRef.current?.contains(target)) return;
      // Left rail buttons toggle modes — don't steal their clicks.
      if (target instanceof Element && target.closest('.tool-rails, .assistant-docker')) return;
      close();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [mode]);

  if (!mode && !shown) return null;

  return (
    <div
      ref={dockRef}
      className={cx('dock', mode && 'is-open')}
      role="region"
      aria-label="Dock"
      hidden={!mode}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && getState().dockMode) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="dock__panel" id="oc-dock-panel" inert={!mode || undefined} aria-hidden={!mode || undefined}>
        <div className="dock__panel-inner">
          {shown === 'input' && <InputPanel key="input" />}
          {shown === 'variants' && <VariantsPanel key="variants" />}
          {shown === 'search' && <SearchPanel key="search" onDone={closeDock} />}
          {shown === 'direction' && <DirectionPanel key="direction" />}
          {shown === 'design-system' && <DesignSystemPanel key="design-system" />}
        </div>
      </div>
    </div>
  );
}

function PanelHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="dock-head">
      <h2 className="dock-head__title">{title}</h2>
      {children}
    </div>
  );
}

/* ---------- Ask AI ---------- */

function InputPanel() {
  const useChat = useStore((s) => !!s.aiStatus?.ready || s.aiChat.length > 0);
  return useChat ? <DockerChat /> : <HandOffPanel />;
}

/** Without an AI provider set up, the request goes to the user's own agent as a prompt. */
function HandOffPanel() {
  const draft = useStore((s) => s.dockDraft);
  const mcpRunning = useStore((s) => !!s.mcp?.running);
  const copy = () => void copyAgentPrompt(draft);
  return (
    <div className="dock-pane">
      <PanelHead title="Ask AI" />
      <textarea
        className="dock-input"
        autoFocus
        rows={3}
        aria-label="What should change?"
        placeholder="e.g. Add a pricing section with three plans and a FAQ"
        value={draft}
        onChange={(e) => setState({ dockDraft: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            copy();
          }
        }}
      />
      <p className="dock-note">
        Add an AI provider (Anthropic, OpenAI, or a local model with Ollama or LM Studio) to make changes right here. Or copy this as a prompt, with your direction and pages attached, and paste it into Cursor, Claude or another agent.{' '}
        {mcpRunning ? 'Your agent is connected over MCP, so its edits appear here live.' : 'Turn on the MCP server in Settings so agents can edit the canvas live.'}
      </p>
      <div className="dock-actions">
        <Button size="sm" variant="ghost" disabled={!draft} onClick={() => setState({ dockDraft: '' })}>
          Clear
        </Button>
        <Button size="sm" icon={<Copy size={13} />} onClick={copy}>
          Copy as prompt
        </Button>
        <Button size="sm" variant="primary" icon={<Sparkles size={13} />} onClick={openAiSettings}>
          Set up AI
        </Button>
      </div>
    </div>
  );
}

/* ---------- Search ---------- */

interface Hit {
  key: string;
  group: 'Pages' | 'Layers' | 'Files' | 'Text';
  label: string;
  detail?: string;
  icon: ReactNode;
  run: () => void;
}

const NO_PAGES: PageConfig[] = [];
const NO_NODES: TreeNode[] = [];
const TEXT_FILE = /\.(m?[jt]sx?|css|scss|html?|md|mdx|json)$/i;
const MAX_TEXT_FILES = 80;
const MAX_HITS_PER_GROUP = 8;

function flatTree(nodes: TreeNode[], out: TreeNode[] = []): TreeNode[] {
  for (const n of nodes) {
    out.push(n);
    flatTree(n.children, out);
  }
  return out;
}

function flatFiles(node: FileNode | null, out: string[] = []): string[] {
  if (!node) return out;
  if (node.type === 'file') out.push(node.path);
  for (const c of node.children ?? []) flatFiles(c, out);
  return out;
}

function useTextHits(query: string, files: string[]): { hits: Hit[]; searching: boolean } {
  const [state, setStateLocal] = useState<{ hits: Hit[]; searching: boolean }>({ hits: [], searching: false });
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return setStateLocal({ hits: [], searching: false });
    let alive = true;
    setStateLocal((s) => ({ ...s, searching: true }));
    const timer = setTimeout(async () => {
      const hits: Hit[] = [];
      const buffers = getState().buffers;
      for (const file of files.filter((f) => TEXT_FILE.test(f) && !f.startsWith('.opencanvas/')).slice(0, MAX_TEXT_FILES)) {
        if (!alive || hits.length >= MAX_HITS_PER_GROUP) break;
        let content: string;
        try {
          content = buffers[file]?.content ?? (await api.readFile(file));
        } catch {
          continue;
        }
        const lines = content.split('\n');
        for (let i = 0; i < lines.length && hits.length < MAX_HITS_PER_GROUP; i++) {
          if (!lines[i].toLowerCase().includes(q)) continue;
          const line = i + 1;
          hits.push({ key: `t:${file}:${line}`, group: 'Text', label: lines[i].trim().slice(0, 90), detail: `${file}:${line}`, icon: <Type size={13} />, run: () => revealInCode(file, line) });
        }
      }
      if (alive) setStateLocal({ hits, searching: false });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, files]);
  return state;
}

function SearchPanel({ onDone }: { onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const pages = useStore((s) => s.projectConfig?.pages ?? NO_PAGES);
  const tree = useStore((s) => {
    const f = activeFrame(s);
    return (f && s.frameRuntime[f.id]?.tree) || NO_NODES;
  });
  const fileTree = useStore((s) => s.fileTree);
  const files = useMemo(() => flatFiles(fileTree), [fileTree]);
  const text = useTextHits(query, files);
  const listRef = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const match = (...values: (string | undefined)[]) => values.some((v) => v?.toLowerCase().includes(q));
    const out: Hit[] = [];
    for (const p of pages.filter((p) => match(p.name, p.path)).slice(0, MAX_HITS_PER_GROUP)) {
      out.push({ key: `p:${p.id}`, group: 'Pages', label: p.name, detail: p.path, icon: <FileText size={13} />, run: () => focusPage(p.id) });
    }
    for (const n of flatTree(tree).filter((n) => match(n.name, n.tag)).slice(0, MAX_HITS_PER_GROUP)) {
      out.push({ key: `l:${n.uid}`, group: 'Layers', label: n.name || n.tag, detail: `<${n.tag}>`, icon: <Layers size={13} />, run: () => selectElement(n.id, n.uid) });
    }
    for (const f of files.filter((f) => match(f)).slice(0, MAX_HITS_PER_GROUP)) {
      out.push({ key: `f:${f}`, group: 'Files', label: f.split('/').pop()!, detail: f, icon: <FileCode2 size={13} />, run: () => void openFile(f) });
    }
    return [...out, ...text.hits];
  }, [query, pages, tree, files, text.hits]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (hit: Hit | undefined) => {
    if (!hit) return;
    hit.run();
    onDone();
  };

  let lastGroup = '';
  return (
    <div className="dock-pane">
      <div className="dock-search">
        <Search size={14} aria-hidden />
        <input
          autoFocus
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls="oc-dock-results"
          aria-activedescendant={hits[active] ? `oc-dock-hit-${active}` : undefined}
          aria-label="Search pages, layers, files and text"
          placeholder="Search pages, layers, files and text"
          value={query}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (hits.length) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              run(hits[active]);
            }
          }}
        />
      </div>
      <div ref={listRef} id="oc-dock-results" className="dock-results" role="listbox" aria-label="Results">
        {hits.map((h, i) => {
          const header = h.group !== lastGroup ? h.group : null;
          lastGroup = h.group;
          return (
            <div key={h.key}>
              {header && <div className="dock-results__group">{header}</div>}
              <div
                id={`oc-dock-hit-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === active}
                className={cx('dock-hit', i === active && 'is-active')}
                onMouseMove={() => i !== active && setActive(i)}
                onClick={() => run(h)}
              >
                {h.icon}
                <span className="dock-hit__label">{h.label}</span>
                {h.detail && <span className="dock-hit__detail">{h.detail}</span>}
              </div>
            </div>
          );
        })}
        {query.trim() && !hits.length && !text.searching && <p className="dock-empty">Nothing matches “{query.trim()}”.</p>}
        {text.searching && <p className="dock-empty">Searching text…</p>}
      </div>
    </div>
  );
}

/* ---------- Direction ---------- */

function DirectionPanel() {
  const saved = useStore((s) => s.projectConfig?.config.direction);
  const [draft, setDraft] = useState<DirectionDraft | null>(() => (saved ? { direction: saved, pending: {} } : null));
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(draft);
  latest.current = draft;

  useEffect(() => {
    if (!draft && saved) setDraft({ direction: saved, pending: {} });
  }, [saved, draft]);

  const flush = async () => {
    const d = latest.current;
    if (!d) return;
    setStatus('saving');
    const sent = Object.keys(d.pending);
    const ok = await saveDirection(d.direction, uploadPaths(d.pending));
    setStatus(ok ? 'saved' : 'error');
    if (!ok || !sent.length) return;
    const stored = getState().projectConfig?.config.direction.references ?? [];
    setDraft((cur) =>
      cur && {
        direction: { ...cur.direction, references: cur.direction.references.map((r) => ({ ...r, imagePath: stored.find((s) => s.id === r.id)?.imagePath ?? r.imagePath })) },
        pending: Object.fromEntries(Object.entries(cur.pending).filter(([id]) => !sent.includes(id))),
      },
    );
  };

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void flush();
      }
    },
    [],
  );

  if (!draft) return <p className="dock-empty">Open a project to set its direction.</p>;
  return (
    <div className="dock-pane dock-pane--scroll">
      <PanelHead title="Direction">
        <span className="dock-head__status" aria-live="polite">
          {status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved' : 'Saved'}
        </span>
      </PanelHead>
      <DirectionEditor
        compact
        draft={draft}
        onChange={(d) => {
          setDraft(d);
          latest.current = d;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            timer.current = null;
            void flush();
          }, 500);
        }}
      />
      <p className="dock-note">Your direction guides AI agents and is saved in .opencanvas/project.json. It doesn’t restyle the page by itself.</p>
    </div>
  );
}
