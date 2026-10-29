import { AtSign, Download, Eye, GitBranch, Maximize, MessageSquarePlus, Redo2, Square, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { redo, undo } from '../lib/actions';
import { newAiChat } from '../lib/ai';
import { addFrame, fitAll } from '../lib/canvas';
import { getState, setState, toast, type TreeNode } from '../lib/store';
import { shape, type Shape } from './shapeshift';

/* ---------- @ mentions ---------- */

export type Mentionable = { kind: 'layer' | 'page'; name: string; id?: string; uid?: string; path?: string; tag?: string };

function flatten(nodes: TreeNode[], out: Mentionable[] = []): Mentionable[] {
  for (const n of nodes) {
    out.push({ kind: 'layer', name: n.name, id: n.id, uid: n.uid, tag: n.tag });
    flatten(n.children, out);
  }
  return out;
}

/** Everything @ can point at: the current page's layers, then the project's pages. */
export function mentionables(): Mentionable[] {
  const s = getState();
  const pages: Mentionable[] = (s.projectConfig?.pages ?? []).map((p) => ({ kind: 'page', name: p.name, id: p.id, path: p.path }));
  return [...flatten(s.domTree), ...pages];
}

/** The text after the last "@", while it still looks like someone is choosing. */
export function activeMention(text: string): string | null {
  const m = /(^|\s)@([^@\n]{0,40})$/.exec(text);
  if (!m) return null;
  const query = m[2];
  // "@Signup form " is finished once a known name is followed by a space, however much is typed after it.
  const lower = query.toLowerCase();
  if (mentionables().some((i) => i.name && lower.startsWith(`${i.name.toLowerCase()} `))) return null;
  return query;
}

function matches(query: string): Mentionable[] {
  const q = query.trim().toLowerCase();
  const all = mentionables();
  const seen = new Set<string>();
  return all
    .filter((i) => (!q || i.name.toLowerCase().includes(q)) && !seen.has(`${i.kind}:${i.name}`) && !!seen.add(`${i.kind}:${i.name}`))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)))
    .slice(0, 8);
}

/** Every known name that appears as "@Name" in the sentence. */
export function referencesIn(text: string): Mentionable[] {
  const lower = text.toLowerCase();
  const found = new Map<string, Mentionable>();
  for (const item of mentionables().sort((a, b) => b.name.length - a.name.length)) {
    if (!item.name) continue;
    const at = `@${item.name.toLowerCase()}`;
    let i = lower.indexOf(at);
    while (i >= 0) {
      const end = i + at.length;
      if (!/[\p{L}\p{N}]/u.test(lower[end] ?? '') && (i === 0 || /\s/.test(lower[i - 1]))) {
        found.set(`${item.kind}:${item.name}`, item);
        break;
      }
      i = lower.indexOf(at, end);
    }
  }
  return [...found.values()];
}

export const insertMention = (text: string, item: Mentionable) => text.replace(/@[^@\n]{0,40}$/, `@${item.name} `);

const row =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] outline-none transition-colors hover:bg-popover-foreground/[0.06] focus-visible:bg-popover-foreground/[0.06]';

export const mention = shape<{ query: string; items: Mentionable[] }>({
  id: 'mention',
  label: 'Mention',
  bare: true,
  icon: <AtSign />,
  action: 'Insert',
  match: (text) => (activeMention(text) !== null ? 1 : 0),
  read: (text) => {
    const query = activeMention(text);
    return query === null ? null : { query, items: matches(query) };
  },
  render: ({ data, text, setText }) =>
    data.items.length ? (
      <ul className="-m-1 flex flex-col" role="listbox" aria-label="Layers and pages">
        {data.items.map((item, i) => (
          <li key={`${item.kind}-${item.name}-${i}`} role="option" aria-selected={i === 0}>
            <button type="button" className={`${row} ${i === 0 ? 'bg-popover-foreground/[0.06]' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => setText(insertMention(text, item))}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-popover-foreground/[0.06] text-[10px] font-medium uppercase text-muted-foreground">{item.kind === 'page' ? 'P' : (item.tag ?? 'L').slice(0, 2)}</span>
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{item.kind === 'page' ? 'Page' : 'Layer'}</span>
            </button>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-[13px] text-muted-foreground">No layers or pages match “{data.query.trim()}”.</p>
    ),
  // Enter takes the top result and leaves the field open to carry on typing.
  onSubmit: () => {},
});

/* ---------- commands ---------- */

/** "undo" on its own, or "/und…" while browsing: both open the command. */
const says = (label: string, words: string[]) => [
  new RegExp(`^\\s*/?\\s*(${words.join('|')})\\s*$`, 'i'),
  (text: string) => {
    if (!text.startsWith('/')) return 0;
    const rest = text.slice(1).trim().toLowerCase();
    return !rest || label.toLowerCase().includes(rest) ? 0.5 : 0;
  },
];

function command(id: string, label: string, hint: string, icon: ReactNode, words: string[], run: () => void | Promise<void>, action = 'Run'): Shape {
  return shape({
    id,
    label,
    hint,
    example: `/${label.toLowerCase()}`,
    icon,
    action,
    match: says(label, words),
    render: () => <p className="text-[13px] text-muted-foreground">{hint}</p>,
    onSubmit: () => void run(),
  });
}

const addFrameShape = shape({
  id: 'add-frame',
  label: 'Add frame',
  hint: 'Add a frame for another screen size',
  example: '/add frame',
  icon: <Square />,
  action: 'Add desktop',
  match: says('Add frame', ['add frame', 'new frame', 'add screen']),
  render: ({ submit }) => (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted-foreground">Pick a size, or press Enter for desktop.</p>
      <div className="flex gap-1.5">
        {(['desktop', 'tablet', 'mobile'] as const).map((p) => (
          <button key={p} type="button" className="h-8 cursor-pointer rounded-[10px] bg-popover-foreground/[0.06] px-3 text-[13px] capitalize outline-none hover:bg-popover-foreground/[0.1]" onMouseDown={(e) => e.preventDefault()} onClick={() => { addFrame(p); toast(`Added a ${p} frame.`, 'info'); }}>
            {p}
          </button>
        ))}
      </div>
    </div>
  ),
  onSubmit: () => addFrame('desktop'),
});

export const assistantShapes: Shape[] = [
  mention,
  command('undo', 'Undo', 'Step back the last change', <Undo2 />, ['undo'], async () => void (await undo()), 'Undo'),
  command('redo', 'Redo', 'Bring back the change you undid', <Redo2 />, ['redo'], async () => void (await redo()), 'Redo'),
  addFrameShape,
  command('fit', 'Fit all frames', 'Zoom the canvas to show every frame', <Maximize />, ['fit', 'fit all', 'zoom to fit'], () => fitAll(), 'Fit'),
  command('preview', 'Preview', 'Open the full-screen preview', <Eye />, ['preview', 'play'], () => setState({ fullPreview: true }), 'Preview'),
  command('versions', 'Versions', 'Open Git to save or publish a version', <GitBranch />, ['versions', 'commit', 'git', 'save version'], () => setState({ gitOpen: true }), 'Open'),
  command('export', 'Export', 'Export the project', <Download />, ['export', 'download'], () => setState({ exportOpen: true }), 'Export'),
  command('new-chat', 'New chat', 'Start a fresh conversation with the AI', <MessageSquarePlus />, ['new chat', 'clear chat', 'reset chat'], () => newAiChat(), 'Start'),
];
