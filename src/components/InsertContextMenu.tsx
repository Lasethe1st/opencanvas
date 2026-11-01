import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Menu } from 'bloom-menu';
import { motion } from 'framer-motion';
import type { InsertKind } from '../../shared/types';
import { insertElement, insertImageFromDisk } from '../lib/actions';
import { addFrame, addFrameAt } from '../lib/canvas';
import { bloomPlacement, closeInsertMenu, useInsertMenu } from '../lib/element-menu';
import { editSelectedText, INLINE_TAGS } from '../lib/inline-edit';
import { Frame } from '../lib/hugeicons';
import { HugeiconsIcon } from '@hugeicons/react';
import { AiMagicIcon } from '@hugeicons/core-free-icons';
import { getState, setState, useStore } from '../lib/store';
import { openDock } from './Dock';
import { ELEMENTS } from './ToolRail';

const SEED = 8;
const CLOSE_MS = 320;
const W = 224;
const H = 330;

type Item = { id: string; label: string; icon: ReactNode; hint?: string; keywords: string; needsFrame: boolean; run: () => void };

/** Wait for the inserted element to become the selection, then start typing into it. */
function editWhenSelected(before: string | undefined) {
  let tries = 0;
  const tick = () => {
    const sel = getState().selection;
    if (sel && sel.id !== before && INLINE_TAGS.has(sel.tag)) return editSelectedText();
    if (++tries < 30) window.setTimeout(tick, 100);
  };
  window.setTimeout(tick, 100);
}

/**
 * Right-click on anything that isn't an element (bare canvas, a page wrapper, frame chrome, a frame's empty body):
 * a list of things to insert, blooming out of the pointer like the element menu. Type to filter, arrows + Enter to pick.
 * Inside a frame, items go into that frame's page (at the end of its root, as the rail does).
 * On bare canvas only Frame applies (a new Desktop frame at the click point); the element items are disabled.
 */
export function InsertContextMenu() {
  const at = useInsertMenu();
  const editable = useStore((s) => s.project?.editable ?? false);
  const [origin, setOrigin] = useState<NonNullable<typeof at> | null>(null);
  const [phase, setPhase] = useState<'closed' | 'opening' | 'open'>('closed');
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    if (at) {
      setOrigin(at);
      setQuery('');
      setFocus(0);
      setPhase('opening');
    } else if (origin) {
      setPhase('closed');
      timer.current = window.setTimeout(() => setOrigin(null), CLOSE_MS);
    }
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== 'opening') return;
    const id = requestAnimationFrame(() => setPhase('open'));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  const inFrame = !!origin?.frameId;
  const el = (kind: InsertKind, label?: string, hint?: string): Item => {
    const e = ELEMENTS.find((x) => x.kind === kind)!;
    const Icon = e.icon;
    return {
      id: kind, label: label ?? e.label, hint, keywords: `${e.label} ${e.keywords}`.toLowerCase(), needsFrame: true, icon: <Icon size={15} />,
      run: () => {
        if (kind === 'image') return void insertImageFromDisk();
        const before = getState().selection?.id;
        void insertElement(kind).then(() => (kind === 'paragraph' || kind === 'heading') && editWhenSelected(before));
      },
    };
  };
  const groups: Item[][] = [
    [
      el('paragraph', 'Text'),
      { id: 'frame', label: 'Frame', hint: undefined, keywords: 'frame artboard page screen desktop', needsFrame: false, icon: <Frame size={15} />, run: () => (origin?.frameId ? addFrame('desktop') : origin && addFrameAt('desktop', origin.world)) },
      el('image', undefined, 'I'),
      el('div', 'Rectangle', 'R'),
      el('button', undefined, 'B'),
      el('input'),
    ],
    [el('heading'), el('link'), el('section'), el('flex'), el('grid'), el('form')],
    [{ id: 'ai', label: 'Ask AI', keywords: 'ask ai chat help', needsFrame: false, icon: <HugeiconsIcon icon={AiMagicIcon} size={15} strokeWidth={1.8} />, run: () => openDock('input') }],
  ];
  const q = query.trim().toLowerCase();
  // Filtering dims what doesn't match instead of removing it: bloom-menu sizes the panel once, so the shape never jumps.
  const matches = (it: Item) => !q || it.label.toLowerCase().includes(q) || it.keywords.includes(q);
  const shown = groups;
  const usable = (it: Item) => !it.needsFrame || (inFrame && editable);
  const enabled = (it: Item) => usable(it) && matches(it);
  const flat = shown.flat();
  const pick = (it: Item | undefined) => {
    if (!it || !enabled(it)) return;
    closeInsertMenu();
    it.run();
  };

  useEffect(() => {
    if (!origin) return;
    const close = () => closeInsertMenu();
    const onKey = (e: KeyboardEvent) => {
      if (!getState() || phase === 'closed') return;
      if (e.key === 'Escape') { e.preventDefault(); return close(); }
      const live = flat.filter(enabled);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setFocus((f) => (live.length ? (f + (e.key === 'ArrowDown' ? 1 : live.length - 1)) % live.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        pick(live[focus]);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setQuery((v) => v.slice(0, -1));
        setFocus(0);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setQuery((v) => v + e.key);
        setFocus(0);
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  });

  if (!origin) return null;
  const { up, end, top, left } = bloomPlacement(origin, W, H, SEED);
  const live = flat.filter(enabled);
  const focused = live[focus];
  let n = 0;
  return createPortal(
    <div data-tw="" data-bloom-menu="" onContextMenu={(e) => e.preventDefault()} style={{ position: 'fixed', top, left, width: SEED, height: SEED, zIndex: 400 }}>
      <Menu.Root open={phase === 'open'} onOpenChange={(next) => !next && closeInsertMenu()} direction={up ? 'top' : 'bottom'} anchor={end ? 'end' : 'start'} bounce={0.12} visualDuration={0.28}>
        <Menu.Container
          buttonSize={SEED}
          menuWidth={W}
          menuRadius={16}
          buttonRadius={SEED / 2}
          className="ctx-bloom border text-foreground"
          style={{ boxShadow: phase === 'open' ? '0 8px 24px rgb(0 0 0 / 0.12)' : 'none' }}
        >
          <Menu.Trigger className="opacity-0"><span className="sr-only">Insert</span></Menu.Trigger>
          <Menu.Content className="flex flex-col" style={{ width: W - 2, boxSizing: 'border-box' }}>
            <div className="flex flex-col p-1.5 pt-2" style={{ width: W - 2, boxSizing: 'border-box' }}>
              <div className="flex items-center justify-between gap-2 px-2.5 pb-1 text-xs font-medium text-muted-foreground">
                <span>{inFrame ? 'Insert' : 'Add to canvas'}</span>
                {query ? <span className="truncate font-mono text-foreground">{query}{flat.some(enabled) ? "" : " · no match"}</span> : <span className="opacity-70">Type to filter</span>}
              </div>
              {shown.map((g, gi) => (
                <div key={gi} className={gi ? 'mt-1 border-t border-foreground/[0.08] pt-1' : ''}>
                  {g.map((it) => {
                    const delay = 0.05 + 0.022 * n++;
                    const off = !usable(it);
                    const dim = !off && !matches(it);
                    return (
                      <motion.div key={it.id} style={{ pointerEvents: off || dim ? 'none' : undefined }} onMouseEnter={() => !off && setFocus(live.indexOf(it))} initial={{ opacity: 0, y: -4 }} animate={phase === 'open' ? { opacity: off ? 0.4 : dim ? 0.3 : 1, y: 0 } : { opacity: 0, y: -4 }} transition={{ delay: phase === 'open' && !q ? delay : 0, duration: 0.18, ease: 'easeOut' }}>
                        <Menu.Item
                          disabled={off || dim}
                          className={`flex w-full cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors duration-150 hover:bg-accent aria-disabled:pointer-events-none aria-disabled:opacity-40 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:shrink-0 [&_svg]:text-muted-foreground ${it === focused ? 'bg-accent' : ''}`}
                          onSelect={() => pick(it)}
                        >
                          {it.icon}
                          <span className="flex-1">{it.label}</span>
                          {it.hint && <span className="text-xs text-muted-foreground">{it.hint}</span>}
                        </Menu.Item>
                      </motion.div>
                    );
                  })}
                </div>
              ))}
            </div>
          </Menu.Content>
        </Menu.Container>
      </Menu.Root>
    </div>,
    document.body,
  );
}

// Selecting a frame's page before inserting: the bridge already cleared the selection, so insertElement targets the root.
export const prepareFrameInsert = (frameId: string) => {
  const s = getState();
  if (s.activeFrameId !== frameId) setState({ activeFrameId: frameId, domTree: s.frameRuntime[frameId]?.tree ?? [] });
  if (s.selection) setState({ selection: null, sourceInfo: null, multiSelect: [] });
};
