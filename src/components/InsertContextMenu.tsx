import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Menu } from 'bloom-menu';
import { motion } from 'framer-motion';
import type { InsertKind } from '../../shared/types';
import { insertElement, insertImageFromDisk } from '../lib/actions';
import { addCustomFrame, addFrame } from '../lib/canvas';
import { PRESETS } from '../../shared/canvas';
import { DEVICE_GROUPS, DEVICE_PRESETS } from '../lib/frame-presets';
import { bloomPlacement, closeInsertMenu, useInsertMenu } from '../lib/element-menu';
import { editSelectedText, INLINE_TAGS } from '../lib/inline-edit';
import { Frame } from '../lib/hugeicons';
import { HugeiconsIcon } from '@hugeicons/react';
import { AiMagicIcon, ComputerIcon, GameController01Icon, LaptopIcon, MoreHorizontalIcon, SmartPhone01Icon, Tablet01Icon } from '@hugeicons/core-free-icons';

const MoreIcon = () => <HugeiconsIcon icon={MoreHorizontalIcon} size={15} strokeWidth={1.8} />;
import { getState, setState, useStore } from '../lib/store';
import { openDock } from './Dock';
import { ELEMENTS } from './ToolRail';
import { ROW, SideBloom, sideBloomKey, type SideItem } from './SideBloom';

const SEED = 8;
const CLOSE_MS = 320;
const W = 224;
const H = 300;

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
  const [more, setMore] = useState(false);
  const [subKind, setSubKind] = useState<'more' | 'frame'>('more');
  const [sideFocus, setSideFocus] = useState(-1);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const listH = useRef(0);
  const overSide = useRef(false);

  useEffect(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    if (at) {
      setOrigin(at);
      setQuery('');
      setFocus(0);
      setMore(false);
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
  const basics: Item[] = [
    el('paragraph', 'Text'),
    { id: 'frame', label: 'Frame', hint: '›', keywords: 'frame artboard page screen', needsFrame: false, icon: <Frame size={15} />, run: () => { setSubKind('frame'); setMore(true); } },
    el('image', undefined, 'I'),
    el('div', 'Rectangle', 'R'),
    el('button', undefined, 'B'),
    el('input'),
  ];
  const extras: Item[] = [el('heading'), el('link'), el('section'), el('flex'), el('grid'), el('form')];
  const moreItem: Item = { id: 'more', label: 'More…', hint: '›', keywords: '', needsFrame: true, icon: <MoreIcon />, run: () => { setSubKind('more'); setMore(true); } };
  // Frame presets: the three built-in sizes first, then real devices grouped by kind. Placed at the cursor for right-click, else beside the page's other frames.
  const KIND_ICON = { desktop: LaptopIcon, phone: SmartPhone01Icon, tablet: Tablet01Icon, console: GameController01Icon } as const;
  const sizeHint = (w: number, h: number) => `${w}×${h}`;
  const frameLeaves: Item[] = [
    ...(['desktop', 'tablet', 'mobile'] as const).map((k): Item => ({
      id: `frame:${k}`, label: PRESETS[k].name, hint: sizeHint(PRESETS[k].width, PRESETS[k].height), keywords: `frame ${PRESETS[k].name}`.toLowerCase(), needsFrame: false,
      icon: <HugeiconsIcon icon={k === 'desktop' ? ComputerIcon : k === 'tablet' ? Tablet01Icon : SmartPhone01Icon} size={15} strokeWidth={1.8} />,
      run: () => (origin?.frameId || !origin ? addFrame(k) : addCustomFrame(PRESETS[k].width, PRESETS[k].height, PRESETS[k].name, origin.world)),
    })),
    ...DEVICE_PRESETS.map((d): Item => ({
      id: `frame:${d.id}`, label: d.label, hint: sizeHint(d.width, d.height), keywords: `frame ${d.label} ${d.kind} ${d.width}x${d.height}`.toLowerCase(), needsFrame: false,
      icon: <HugeiconsIcon icon={KIND_ICON[d.kind]} size={15} strokeWidth={1.8} />,
      run: () => addCustomFrame(d.width, d.height, d.label, origin?.frameId ? undefined : origin?.world),
    })),
  ];
  const frameSide: SideItem[] = [
    { id: 'h:basic', label: 'Basic', icon: null, heading: true, disabled: true },
    ...frameLeaves.slice(0, 3),
    ...DEVICE_GROUPS.flatMap((g): SideItem[] => [{ id: `h:${g.kind}`, label: g.title, icon: null, heading: true, disabled: true }, ...frameLeaves.slice(3).filter((_, i) => DEVICE_PRESETS[i].kind === g.kind)]),
  ];
  const ai: Item = { id: 'ai', label: 'Ask AI', keywords: 'ask ai chat help', needsFrame: false, icon: <HugeiconsIcon icon={AiMagicIcon} size={15} strokeWidth={1.8} />, run: () => openDock('input') };
  const q = query.trim().toLowerCase();
  const matches = (it: Item) => it.label.toLowerCase().includes(q) || it.keywords.includes(q);
  const rank = (it: Item) => (it.label.toLowerCase().startsWith(q) ? 0 : it.label.toLowerCase().includes(q) ? 1 : 2);
  const usable = (it: Item) => !it.needsFrame || (inFrame && editable);
  const sideItems: SideItem[] = subKind === 'frame' ? frameSide : extras.map((it) => ({ ...it, disabled: !usable(it) }));
  const firstSide = (items: SideItem[]) => items.findIndex((i) => !i.heading && !i.disabled);
  // Unfiltered: six basics + More… (blooms a side menu), then Ask AI. Filtering searches everything, hidden extras included, in one list.
  // Items that can't be used here (e.g. element inserts on bare canvas) are hidden, not greyed out; the filter only searches what's visible.
  const groups: Item[][] = (q
    ? [[...basics.filter((i) => i.id !== 'frame'), ...frameLeaves, ...extras, ai].filter(usable).filter(matches).sort((a, b) => rank(a) - rank(b))]
    : [[...basics, moreItem].filter(usable), [ai]]
  ).filter((g) => g.length);
  const flat = groups.flat();
  const live = flat.filter(usable);
  const pick = (it: Item | undefined) => {
    if (!it || !usable(it)) return;
    if (it.id === 'more' || it.id === 'frame') return it.run();
    closeInsertMenu();
    it.run();
  };

  useEffect(() => {
    if (!origin) return;
    const close = () => closeInsertMenu();
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'closed') return;
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (more && sideBloomKey(e, sideItems, sideFocus, setSideFocus, (it) => pick([...frameLeaves, ...extras].find((x) => x.id === it.id)), () => setMore(false))) return;
      if (e.key === 'Escape') { e.preventDefault(); return close(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        stop();
        setFocus((f) => (live.length ? (f + (e.key === 'ArrowDown' ? 1 : live.length - 1)) % live.length : 0));
      } else if (e.key === 'ArrowRight' && (live[focus]?.id === 'more' || live[focus]?.id === 'frame')) {
        stop();
        const kind = live[focus].id as 'more' | 'frame';
        setSubKind(kind);
        setSideFocus(firstSide(kind === 'frame' ? frameSide : extras.map((it) => ({ ...it, disabled: !usable(it) }))));
        setMore(true);
      } else if (e.key === 'Enter') {
        stop();
        if (live[focus]?.id === 'more' || live[focus]?.id === 'frame') {
          setSubKind(live[focus].id as 'more' | 'frame');
          setSideFocus(firstSide(live[focus].id === 'frame' ? frameSide : extras.map((it) => ({ ...it, disabled: !usable(it) }))));
        }
        pick(live[focus]);
      } else if (e.key === 'Backspace') {
        stop();
        setQuery((v) => v.slice(0, -1));
        setFocus(0);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        stop();
        setMore(false);
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

  // Remember the unfiltered list height so a filtered list scrolls inside the same shape (bloom-menu sizes the panel once).
  useLayoutEffect(() => {
    if (!q && listRef.current && phase === 'open') listH.current = listRef.current.offsetHeight;
  });

  if (!origin) return null;
  const { up, end, top, left } = bloomPlacement(origin, W, H, SEED);
  const focused = live[focus];
  let n = 0;
  const row = (it: Item) => {
    const delay = 0.05 + 0.022 * n++;
    const off = !usable(it);
    const isMore = it.id === 'more' || it.id === 'frame';
    return (
      <motion.div key={it.id} ref={isMore ? (el: HTMLDivElement | null) => { rowRefs.current[it.id] = el; } : undefined} style={{ pointerEvents: off ? 'none' : undefined }} onMouseEnter={() => { if (!off) setFocus(live.indexOf(it)); if (isMore && !off) { setSubKind(it.id as 'more' | 'frame'); setSideFocus(-1); setMore(true); } else if (!overSide.current) setMore(false); }} initial={{ opacity: 0, y: -4 }} animate={phase === 'open' ? { opacity: off ? 0.4 : 1, y: 0 } : { opacity: 0, y: -4 }} transition={{ delay: phase === 'open' && !q ? delay : 0, duration: 0.18, ease: 'easeOut' }}>
        <Menu.Item
          disabled={off}
          className={`${ROW} ${it === focused || (isMore && more && it.id === subKind) ? 'bg-accent' : ''}`}
          onSelect={() => pick(it)}
        >
          {it.icon}
          <span className="flex-1">{it.label}</span>
          {it.hint && <span className="text-xs text-muted-foreground">{it.hint}</span>}
        </Menu.Item>
      </motion.div>
    );
  };
  return (
    <>
      {createPortal(
        <div data-tw="" data-bloom-menu="" onContextMenu={(e) => e.preventDefault()} style={{ position: 'fixed', top, left, width: SEED, height: SEED, zIndex: 400 }}>
          <Menu.Root open={phase === 'open'} onOpenChange={(next) => !next && !overSide.current && closeInsertMenu()} direction={up ? 'top' : 'bottom'} anchor={end ? 'end' : 'start'} bounce={0.12} visualDuration={0.28}>
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
                    {query ? <span className="truncate font-mono text-foreground">{query}</span> : <span className="opacity-70">Type to filter</span>}
                  </div>
                  <div ref={listRef} style={q && listH.current ? { height: listH.current, overflowY: 'auto' } : undefined}>
                    {groups.map((g, gi) => (
                      <div key={gi} className={gi ? 'mt-1 border-t border-foreground/[0.08] pt-1' : ''}>{g.map(row)}</div>
                    ))}
                    {q && !flat.length && <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">No matches</div>}
                  </div>
                </div>
              </Menu.Content>
            </Menu.Container>
          </Menu.Root>
        </div>,
        document.body,
      )}
      <SideBloom
        open={more && phase === 'open' && !q}
        anchor={rowRefs.current[subKind] ?? null}
        items={sideItems}
        width={subKind === 'frame' ? 268 : undefined}
        focus={sideFocus}
        setFocus={setSideFocus}
        onPick={(it) => pick([...frameLeaves, ...extras].find((x) => x.id === it.id))}
        onClose={() => setMore(false)}
        overSide={overSide}
      />
    </>
  );
}

// Selecting a frame's page before inserting: the bridge already cleared the selection, so insertElement targets the root.
export const prepareFrameInsert = (frameId: string) => {
  const s = getState();
  if (s.activeFrameId !== frameId) setState({ activeFrameId: frameId, domTree: s.frameRuntime[frameId]?.tree ?? [] });
  if (s.selection) setState({ selection: null, sourceInfo: null, multiSelect: [] });
};
