import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Menu } from 'bloom-menu';
import { motion } from 'framer-motion';
import type { InsertKind } from '../../shared/types';
import { insertElement, insertImageFromDisk } from '../lib/actions';
import { addCustomFrame, addCustomFrameAt, addFrame, addFrameAt } from '../lib/canvas';
import { bloomPlacement, closeInsertMenu, useInsertMenu } from '../lib/element-menu';
import { editSelectedText, INLINE_TAGS } from '../lib/inline-edit';
import { Frame } from '../lib/hugeicons';
import { HugeiconsIcon } from '@hugeicons/react';
import { AiMagicIcon, ComputerIcon, GameController03Icon, LaptopIcon, MoreHorizontalIcon, SmartPhone01Icon, Tablet01Icon } from '@hugeicons/core-free-icons';

const MoreIcon = () => <HugeiconsIcon icon={MoreHorizontalIcon} size={15} strokeWidth={1.8} />;
import { getState, setState, useStore } from '../lib/store';
import { openDock } from './Dock';
import { ELEMENTS } from './ToolRail';
import { ROW, SideBloom } from './SideBloom';

/** Device sizes offered by the Frame row, in CSS pixels. */
const DEVICES: { section: string; icon: typeof ComputerIcon; items: [name: string, w: number, h: number][] }[] = [
  { section: 'Computer', icon: LaptopIcon, items: [['Desktop', 1440, 900], ['MacBook Air 13"', 1470, 956], ['MacBook Pro 16"', 1728, 1117], ['Windows laptop', 1366, 768], ['Full HD monitor', 1920, 1080]] },
  { section: 'Phone', icon: SmartPhone01Icon, items: [['iPhone 16', 393, 852], ['iPhone 16 Pro Max', 440, 956], ['Pixel 9', 412, 915], ['Galaxy S24', 360, 780]] },
  { section: 'Tablet', icon: Tablet01Icon, items: [['iPad Pro 11"', 834, 1194], ['iPad mini', 744, 1133]] },
  { section: 'Console', icon: GameController03Icon, items: [['Steam Deck', 1280, 800], ['Nintendo Switch', 1280, 720], ['PlayStation / Xbox', 1920, 1080]] },
];

const SEED = 8;
const CLOSE_MS = 320;
const W = 224;
const H = 300;

type Item = { id: string; label: string; icon: ReactNode; hint?: string; keywords: string; needsFrame: boolean; section?: string; run: () => void };

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
  const [sideKind, setSideKind] = useState<'more' | 'frame'>('more');
  const [sideFocus, setSideFocus] = useState(-1);
  const moreRef = useRef<HTMLDivElement>(null);
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
  const q = query.trim().toLowerCase();
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
    { id: 'frame', label: 'Frame', hint: q ? undefined : '›', keywords: 'frame artboard page screen desktop', needsFrame: false, icon: <Frame size={15} />, run: () => (q ? (origin?.frameId ? addFrame('desktop') : origin && addFrameAt('desktop', origin.world)) : openSide('frame')) },
    el('image', undefined, 'I'),
    el('div', 'Rectangle', 'R'),
    el('button', undefined, 'B'),
    el('input'),
  ];
  const extras: Item[] = [el('heading'), el('link'), el('section'), el('flex'), el('grid'), el('form')];
  const moreItem: Item = { id: 'more', label: 'More…', hint: '›', keywords: '', needsFrame: true, icon: <MoreIcon />, run: () => openSide('more') };
  const devices: Item[] = DEVICES.flatMap((d) => d.items.map(([name, w, h]) => ({
    id: `device:${name}`, label: name, hint: `${w}×${h}`, keywords: `${name} ${d.section}`.toLowerCase(), needsFrame: false, section: d.section,
    icon: <HugeiconsIcon icon={d.icon} size={15} strokeWidth={1.8} />,
    run: () => (origin?.frameId ? addCustomFrame(w, h, name) : origin && addCustomFrameAt(w, h, name, origin.world)),
  })));
  const sideItems = sideKind === 'frame' ? devices : extras;
  const openSide = (k: 'more' | 'frame') => {
    if (more && sideKind === k) return setMore(false);
    setSideKind(k);
    setMore(true);
  };
  const ai: Item = { id: 'ai', label: 'Ask AI', keywords: 'ask ai chat help', needsFrame: false, icon: <HugeiconsIcon icon={AiMagicIcon} size={15} strokeWidth={1.8} />, run: () => openDock('input') };
  const matches = (it: Item) => it.label.toLowerCase().includes(q) || it.keywords.includes(q);
  const rank = (it: Item) => (it.label.toLowerCase().startsWith(q) ? 0 : it.label.toLowerCase().includes(q) ? 1 : 2);
  const usable = (it: Item) => !it.needsFrame || (inFrame && editable);
  // Unfiltered: six basics + More… (blooms a side menu), then Ask AI. Filtering searches everything, hidden extras included, in one list.
  // Items that can't be used here (e.g. element inserts on bare canvas) are hidden, not greyed out; the filter only searches what's visible.
  const groups: Item[][] = (q
    ? [[...basics, ...extras, ai].filter(usable).filter(matches).sort((a, b) => rank(a) - rank(b))]
    : [[...basics, moreItem].filter(usable), [ai]]
  ).filter((g) => g.length);
  const flat = groups.flat();
  const live = flat.filter(usable);
  const pick = (it: Item | undefined) => {
    if (!it || !usable(it)) return;
    if (!q && (it.id === 'more' || it.id === 'frame')) return it.run();
    closeInsertMenu();
    it.run();
  };

  useEffect(() => {
    if (!origin) return;
    const close = () => closeInsertMenu();
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'closed') return;
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (more) {
        const opts = sideItems.filter(usable);
        if (e.key === 'Escape' || e.key === 'ArrowLeft') { stop(); setMore(false); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { stop(); setSideFocus((f) => (f + (e.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length); return; }
        if (e.key === 'Enter') { stop(); pick(opts[sideFocus]); return; }
      }
      if (e.key === 'Escape') { e.preventDefault(); return close(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        stop();
        setFocus((f) => (live.length ? (f + (e.key === 'ArrowDown' ? 1 : live.length - 1)) % live.length : 0));
      } else if (e.key === 'ArrowRight' && !q && (live[focus]?.id === 'more' || live[focus]?.id === 'frame')) {
        stop();
        setSideFocus(0);
        setSideKind(live[focus].id as 'more' | 'frame');
        setMore(true);
      } else if (e.key === 'Enter') {
        stop();
        if (live[focus]?.id === 'more' || live[focus]?.id === 'frame') setSideFocus(0);
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
    const isMore = !q && (it.id === 'more' || it.id === 'frame');
    const isActiveSide = isMore && it.id === (sideKind === 'frame' ? 'frame' : 'more');
    return (
      <motion.div key={it.id} ref={isActiveSide ? moreRef : undefined} style={{ pointerEvents: off ? 'none' : undefined }} onMouseEnter={() => { if (!off) setFocus(live.indexOf(it)); if (isMore && !off) { setSideFocus(-1); setSideKind(it.id as 'more' | 'frame'); setMore(true); } }} initial={{ opacity: 0, y: -4 }} animate={phase === 'open' ? { opacity: off ? 0.4 : 1, y: 0 } : { opacity: 0, y: -4 }} transition={{ delay: phase === 'open' && !q ? delay : 0, duration: 0.18, ease: 'easeOut' }}>
        <Menu.Item
          disabled={off}
          className={`${ROW} ${it === focused || (isActiveSide && more) ? 'bg-accent' : ''}`}
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
        anchor={moreRef.current}
        width={sideKind === 'frame' ? 264 : undefined}
        items={sideItems.map((it) => ({ ...it, disabled: !usable(it) }))}
        focus={sideFocus}
        setFocus={setSideFocus}
        onPick={(it) => pick(sideItems.find((x) => x.id === it.id))}
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
