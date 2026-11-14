import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AiMagicIcon, MoreHorizontalIcon, ArrowDown01Icon, PaintBrush01Icon, TextIcon, HelpCircleIcon, Comment01Icon, ViewIcon, ViewOffIcon, ArrowUp01Icon, CodeIcon, Copy01Icon, Copy02Icon, Delete02Icon, Download01Icon, Edit02Icon, FolderTransferIcon, LeftToRightListBulletIcon, PackageIcon, Tick02Icon, GridViewIcon,
} from '@hugeicons/core-free-icons';
import { duplicateSelected, groupSelected, moveSelected, removeSelected, revealInCode, selectParent, ungroupSelected } from '../lib/actions';
import { elementHtml } from '../lib/bridge';
import { closeElementMenu, useElementMenu } from '../lib/element-menu';
import { setShowMarkers, useShowMarkers } from '../lib/comments';
import { getAsk, setAsk, useAsk } from '../lib/ask-box';
import { AskChat, CHAT_H, CHAT_W } from './AskBox';
import { ROW, sideBloomKey, type SideItem } from './SideBloom';
import { CommentPanel } from './CommentPopover';
import { getExperienceLevel } from '../lib/experience';
import { editSelectedText, INLINE_TAGS } from '../lib/inline-edit';
import { getState, toast, useStore } from '../lib/store';
import { sendToAi } from '../lib/ai';
import { VariantsPopover } from './variants/ProjectVariants';
import { useProjectBlocks } from '../lib/variant-blocks';

type Bloom = 'chat' | 'comment' | 'export' | 'variants';
type Item = { label: string; icon: ReactNode; hint?: string; run: () => void; disabled?: boolean; danger?: boolean; more?: boolean; bloom?: Bloom };

const icon = (i: Parameters<typeof HugeiconsIcon>[0]['icon']) => <HugeiconsIcon icon={i} size={15} strokeWidth={1.8} />;

async function htmlOfSelection(): Promise<string> {
  const s = getState();
  if (!s.selection || !s.activeFrameId) return '';
  return elementHtml(s.activeFrameId, s.selection.id);
}

async function copyElement() {
  const html = await htmlOfSelection();
  if (!html) return toast('Couldn’t read that element', 'error');
  try {
    await navigator.clipboard.writeText(html);
    toast('Copied the element’s HTML');
  } catch {
    toast('Copy was blocked by the browser', 'error');
  }
}

async function exportElement(kind: 'html' | 'text' | 'copy') {
  const html = await htmlOfSelection();
  const sel = getState().selection;
  if (!html || !sel) return toast('Couldn’t read that element', 'error');
  if (kind === 'copy') return copyElement();
  const name = (sel.name || sel.tag).replace(/[^\w-]+/g, '-').toLowerCase() || 'element';
  const text = kind === 'text' ? (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').trim() : html;
  const url = URL.createObjectURL(new Blob([text], { type: kind === 'text' ? 'text/plain' : 'text/html' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.${kind === 'text' ? 'txt' : 'html'}`;
  a.click();
  URL.revokeObjectURL(url);
}

const MENU_W = 224;
const COMMENT_W = 300;
const EXPORT_W = 224;
/** The popup hugs its blocks: the prompt form, then up to two blocks and a peek of the next. More scroll instead of widening it. */
const variantsWidth = (blocks: number) => (blocks === 0 ? 380 : blocks < 3 ? 400 : 460);
const EASE = [0.23, 1, 0.32, 1] as const;
const SPRING = { type: 'spring', visualDuration: 0.3, bounce: 0.06 } as const;
const SHADOW = '0 8px 24px rgb(0 0 0 / 0.12)';

type Snap = { selection: ReturnType<typeof getState>['selection']; hasSource: boolean; source: { file: string; line: number } | null; editable: boolean };
type Rect = { left: number; top: number; width: number; height: number };
const rectOf = (r: DOMRect): Rect => ({ left: r.left, top: r.top, width: r.width, height: r.height });

/** Where a w×h box sits when it opens at the pointer: grows down-right, flips up when the lower half is the roomier side, stays 8px inside the window. */
function placeBox(o: { x: number; y: number }, w: number, h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(8, Math.min(o.x, vw - 8 - w));
  const up = o.y + h > vh - 8 && o.y > vh - o.y;
  const top = up ? Math.max(8, o.y - h) : Math.max(8, Math.min(o.y, vh - 8 - h));
  return { left, top };
}

/** A glass panel that grows out of the row you picked and settles where the menu opened. Its content fades in once the shape is on its way. */
function BloomPanel({ from, origin, width, height, children, label }: { from: Rect; origin: { x: number; y: number }; width: number; height?: number; children: ReactNode; label: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (height != null) return;
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMeasured(el.offsetHeight + 2));
    ro.observe(el);
    setMeasured(el.offsetHeight + 2);
    return () => ro.disconnect();
  }, [height]);
  const h = height ?? measured ?? from.height;
  const box = placeBox(origin, width, h);
  return (
    <motion.div
      data-tw=""
      data-bloom-menu=""
      data-ctx-shell=""
      role="dialog"
      aria-label={label}
      className="ctx-bloom border text-foreground"
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: 'fixed', zIndex: 401, overflow: 'hidden', boxSizing: 'border-box' }}
      initial={{ left: from.left, top: from.top, width: from.width, height: from.height, borderRadius: 10, opacity: 0.7 }}
      animate={{ left: box.left, top: box.top, width, height: h, borderRadius: 16, opacity: 1, boxShadow: SHADOW }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12, ease: EASE } }}
      transition={SPRING}
    >
      <div ref={inner} style={{ position: 'absolute', left: 0, top: 0, width: width - 2, height: height != null ? height - 2 : undefined }}>
        <motion.div style={{ height: '100%' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1, duration: 0.16, ease: EASE }}>
          {children}
        </motion.div>
      </div>
    </motion.div>
  );
}

const EXPORTS: { id: 'html' | 'text' | 'copy'; label: string; hint: string; icon: ReactNode }[] = [
  { id: 'html', label: 'HTML file', hint: '.html', icon: icon(Download01Icon) },
  { id: 'text', label: 'Plain text', hint: '.txt', icon: icon(TextIcon) },
  { id: 'copy', label: 'Copy HTML', hint: '', icon: icon(Copy01Icon) },
];

function ExportPanel({ name }: { name: string }) {
  return (
    <div className="flex flex-col p-1.5 pt-2">
      <div className="truncate px-2.5 pb-1 text-xs font-medium text-muted-foreground">Export {name}</div>
      {EXPORTS.map((x) => (
        <button key={x.id} type="button" className={`${ROW} transition-[background-color,transform] active:scale-[0.98]`} onClick={() => { void exportElement(x.id); closeElementMenu(); }}>
          {x.icon}
          <span className="flex-1 text-left">{x.label}</span>
          {x.hint && <span className="text-xs text-muted-foreground">{x.hint}</span>}
        </button>
      ))}
    </div>
  );
}

/** The "More…" list: a plain popover beside its row, flipping left when there's no room. */
function SidePopover({ open, anchor, items, focus, setFocus, onPick }: { open: boolean; anchor: HTMLElement | null; items: SideItem[]; focus: number; setFocus: (n: number) => void; onPick: (it: SideItem) => void }) {
  const W = 196;
  let pos: { left: number; top: number; flip: boolean } | null = null;
  if (open && anchor) {
    const panel = anchor.closest('[data-ctx-shell]')?.getBoundingClientRect();
    const r = anchor.getBoundingClientRect();
    const flip = !!panel && panel.right + 6 + W > window.innerWidth - 8;
    const h = items.length * 32 + 16;
    pos = { flip, left: flip ? (panel?.left ?? r.left) - 6 - W : (panel?.right ?? r.right) + 6, top: Math.max(8, Math.min(r.top - 6, window.innerHeight - 8 - h)) };
  }
  return createPortal(
    <AnimatePresence>
      {pos && (
        <motion.div
          key="side"
          data-tw=""
          data-bloom-menu=""
          data-ctx-shell=""
          role="menu"
          aria-label="More actions"
          className="ctx-bloom border text-foreground"
          onContextMenu={(e) => e.preventDefault()}
          style={{ position: 'fixed', left: pos.left, top: pos.top, width: W, zIndex: 401, borderRadius: 14, transformOrigin: pos.flip ? 'right top' : 'left top', boxShadow: SHADOW }}
          initial={{ opacity: 0, scale: 0.96, x: pos.flip ? 4 : -4 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
          transition={{ duration: 0.14, ease: EASE }}
        >
          <div className="flex flex-col p-1.5">
            {items.map((it, i) => (
              <button
                key={it.id}
                type="button"
                role="menuitem"
                data-side-id={it.id}
                disabled={it.disabled}
                onMouseEnter={() => setFocus(i)}
                onClick={() => onPick(it)}
                className={`${ROW} transition-[background-color,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${it.danger ? 'ctx-danger' : ''} ${i === focus ? 'bg-accent' : ''}`}
              >
                {it.icon}
                <span className="flex-1 text-left">{it.label}</span>
                {it.hint && <span className="text-xs text-muted-foreground">{it.hint}</span>}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Right-click on an element in the canvas. The list is a plain popover (fast scale + fade from the pointer).
 * Bloom is saved for the rows that turn into something: Ask AI and its quick asks become the chat,
 * Comment becomes the comment box, Export becomes the format picker. Each grows out of its own row.
 */
export function ElementContextMenu() {
  const at = useElementMenu();
  const selection = useStore((s) => s.selection);
  const variantBlocks = useProjectBlocks({ elementId: selection?.id ?? null }).length;
  const sourceInfo = useStore((s) => s.sourceInfo);
  const editable = useStore((s) => s.project?.editable ?? false);
  const ask = useAsk();
  const markers = useShowMarkers();
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [from, setFrom] = useState<Rect | null>(null);
  const [sub, setSub] = useState<'comment' | 'export' | 'variants' | null>(null);
  const [more, setMore] = useState(false);
  const [sideFocus, setSideFocus] = useState(-1);
  const [focus, setFocus] = useState(-1);
  const [listH, setListH] = useState(300);
  const moreRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<{ items: SideItem[]; pick: (it: SideItem) => void }>({ items: [], pick: () => {} });
  const flatRef = useRef<Item[]>([]);
  const pickRef = useRef<(it: Item, rect: Rect) => void>(() => {});

  const chat = ask.mode === 'chat';
  const kind: Bloom | null = chat ? 'chat' : sub;

  useEffect(() => {
    if (at && (selection || ask.mode === 'chat')) {
      setOrigin(at);
      setSnap({ selection: selection ?? null, hasSource: !!sourceInfo, source: sourceInfo ? { file: sourceInfo.file, line: sourceInfo.line } : null, editable });
      setFrom(null);
      setSub(null);
      setMore(false);
      setFocus(-1);
      setOpen(true);
    } else setOpen(false);
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps

  // The list's real height decides where it sits, so measure before it paints.
  useLayoutEffect(() => {
    if (open && listRef.current) setListH(listRef.current.offsetHeight);
  });

  // Keyboard inside the open More… panel.
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => sideBloomKey(e, sideRef.current.items, sideFocus, setSideFocus, sideRef.current.pick, () => setMore(false));
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [more, sideFocus]);

  // Keyboard on the list: arrows move, Enter picks, → opens More…, Esc closes.
  useEffect(() => {
    if (!open || kind || more) return;
    const onKey = (e: KeyboardEvent) => {
      const flat = flatRef.current;
      const live = flat.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);
      if (e.key === 'Escape') { e.preventDefault(); closeElementMenu(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const cur = live.indexOf(focus);
        setFocus(live[(cur + (e.key === 'ArrowDown' ? 1 : live.length - 1) + (cur < 0 && e.key === 'ArrowUp' ? 1 : 0)) % live.length]);
      } else if (e.key === 'ArrowRight' && flat[focus]?.more) {
        e.preventDefault();
        flat[focus].run();
      } else if (e.key === 'Enter' && flat[focus] && !flat[focus].disabled) {
        e.preventDefault();
        const el = listRef.current?.querySelectorAll<HTMLElement>('[data-ctx-row]')[focus];
        pickRef.current(flat[focus], rectOf(el?.getBoundingClientRect() ?? new DOMRect()));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, kind, more, focus]);

  // Outside click, window blur (iframe clicks) and resize dismiss the menu. An open chat stays until it is closed.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (chat) return;
      if ((e.target as HTMLElement | null)?.closest?.('[data-ctx-shell]')) return;
      closeElementMenu();
    };
    const close = () => !getAsk().mode.startsWith('chat') && closeElementMenu();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [open, chat]);

  const { selection: sel, editable: canEdit } = snap ?? { selection: null, editable: false };
  const canEditText = !!sel && INLINE_TAGS.has(sel.tag) && !!sourceInfo?.textEditable && canEdit;
  // Ask AI from the menu: the row turns into the chat, with this element attached.
  // Quick asks also send a ready-made request; plain Ask AI just opens the chat.
  const askAbout = (request: string) => {
    if (!sel) return;
    setAsk({ mode: 'chat', target: { id: sel.id, name: sel.name, tag: sel.tag } });
    const text = request.trim();
    if (text && getState().aiStatus?.ready) void sendToAi(text, { references: [{ kind: 'layer', name: sel.name, id: sel.id }] });
  };
  const ai: Item[] = !sel ? [] : [
    { label: 'Ask AI', icon: icon(AiMagicIcon), bloom: 'chat', run: () => askAbout('') },
    { label: 'Restyle', icon: icon(PaintBrush01Icon), bloom: 'chat', run: () => askAbout(`Restyle ${sel.name} so it sits better with the rest of the page.`) },
    { label: 'Variants', icon: icon(GridViewIcon), bloom: 'variants', run: () => {} },
    ...(INLINE_TAGS.has(sel.tag) ? [{ label: 'Rewrite text', icon: icon(TextIcon), bloom: 'chat' as const, run: () => askAbout(`Rewrite the text in ${sel.name} so it's clearer and tighter. Keep the meaning.`) }] : []),
  ];
  // Everything else lives in the More… list, so the main list stays short.
  const extras: Item[] = !sel ? [] : [
    { label: 'Explain', icon: icon(HelpCircleIcon), bloom: 'chat', run: () => askAbout(`Explain how ${sel.name} is built and styled. Don't change anything.`) },
    { label: 'Comment', icon: icon(Comment01Icon), bloom: 'comment', run: () => {} },
    { label: 'Export', icon: icon(Download01Icon), hint: '›', bloom: 'export', run: () => {} },
    ...(canEditText ? [{ label: 'Edit text', icon: icon(Edit02Icon), hint: 'Enter', run: editSelectedText }] : []),
    { label: 'Select parent', icon: icon(FolderTransferIcon), disabled: !sel?.parentId, run: selectParent },
    { label: 'Move up', icon: icon(ArrowUp01Icon), hint: 'Alt+↑', disabled: !canEdit, run: () => void moveSelected('up') },
    { label: 'Move down', icon: icon(ArrowDown01Icon), hint: 'Alt+↓', disabled: !canEdit, run: () => void moveSelected('down') },
    { label: 'Ungroup', icon: icon(LeftToRightListBulletIcon), disabled: !canEdit, run: () => void ungroupSelected() },
    { label: markers ? 'Hide comments' : 'Show comments', icon: icon(markers ? ViewOffIcon : ViewIcon), run: () => setShowMarkers(!markers) },
    ...(getExperienceLevel() === 'veteran'
      ? [{ label: 'Open in code', icon: icon(CodeIcon), disabled: !snap?.source, run: () => snap?.source && revealInCode(snap.source.file, snap.source.line) }]
      : []),
  ];
  const groups: Item[][] = !sel ? [] : [
    ai,
    [
      { label: 'Copy', icon: icon(Copy01Icon), hint: 'HTML', run: () => void copyElement() },
      { label: 'Duplicate', icon: icon(Copy02Icon), disabled: !canEdit, run: () => void duplicateSelected() },
      { label: 'Group', icon: icon(PackageIcon), disabled: !canEdit, run: () => void groupSelected() },
      { label: 'More…', icon: icon(MoreHorizontalIcon), hint: '›', more: true, run: () => { setSideFocus(0); setMore(true); } },
    ],
    [
      { label: 'Delete', icon: icon(Delete02Icon), hint: 'Del', danger: true, disabled: !canEdit, run: () => void removeSelected() },
    ],
  ];
  flatRef.current = groups.flat();

  // One path for every pick: rows that turn into something bloom out of themselves, the rest run and close.
  const pick = (it: Item, rect: Rect) => {
    if (it.disabled) return;
    if (it.more) return it.run();
    if (it.bloom) {
      setMore(false);
      setFrom(rect);
      if (it.bloom === 'chat') it.run();
      else setSub(it.bloom);
      return;
    }
    it.run();
    closeElementMenu();
  };
  pickRef.current = pick;

  const sideItems: SideItem[] = extras.map((it) => ({ id: it.label, label: it.label, icon: it.icon, hint: it.hint, disabled: it.disabled }));
  const pickSide = (it: SideItem) => {
    const x = extras.find((e) => e.label === it.id);
    if (!x || x.disabled) return;
    const el = document.querySelector<HTMLElement>(`[data-side-id="${CSS.escape(it.id)}"]`);
    pick(x, rectOf(el?.getBoundingClientRect() ?? new DOMRect()));
  };
  sideRef.current = { items: sideItems, pick: pickSide };

  const o = origin ?? { x: 0, y: 0 };
  const listBox = placeBox(o, MENU_W, listH);
  const seed: Rect = { left: o.x, top: o.y, width: 8, height: 8 };
  let n = -1;
  return (<>{createPortal(
    <AnimatePresence>
      {open && origin && snap && (
        <motion.div
          key="list"
          ref={listRef}
          data-tw=""
          data-bloom-menu=""
          data-ctx-shell=""
          role="menu"
          aria-label={`Actions for ${sel?.name ?? 'element'}`}
          className="ctx-bloom border text-foreground"
          onContextMenu={(e) => e.preventDefault()}
          style={{ position: 'fixed', left: listBox.left, top: listBox.top, width: MENU_W, zIndex: 400, borderRadius: 16, transformOrigin: `${o.x - listBox.left}px ${o.y - listBox.top}px`, pointerEvents: kind ? 'none' : undefined }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={kind ? { opacity: 0, scale: 0.98, boxShadow: '0 0 0 rgb(0 0 0 / 0)', transition: { duration: 0.1, ease: EASE } } : { opacity: 1, scale: 1, boxShadow: SHADOW }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1, ease: EASE } }}
          transition={{ duration: 0.14, ease: EASE }}
        >
          <div className="flex flex-col p-1.5 pt-2">
            <div className="truncate px-2.5 pb-1 text-xs font-medium text-muted-foreground">{sel?.name}</div>
            {groups.map((g, gi) => (
              <div key={gi} className={gi ? 'mt-1 border-t border-foreground/[0.08] pt-1' : ''}>
                {g.map((it) => {
                  const i = ++n;
                  return (
                    <button
                      key={it.label}
                      ref={it.more ? moreRef : undefined}
                      type="button"
                      role="menuitem"
                      data-ctx-row=""
                      disabled={it.disabled}
                      onMouseEnter={() => { setFocus(i); if (it.more) { setSideFocus(-1); setMore(true); } else setMore(false); }}
                      onClick={(e) => pick(it, rectOf(e.currentTarget.getBoundingClientRect()))}
                      className={`${ROW} transition-[background-color,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${it.danger ? 'ctx-danger' : ''} ${i === focus || (it.more && more) ? 'bg-accent' : ''}`}
                    >
                      {it.icon}
                      <span className="flex-1 text-left">{it.label}</span>
                      {it.hint && <span className="text-xs text-muted-foreground">{it.hint}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </motion.div>
      )}
      {open && origin && snap && kind === 'chat' && (
        <BloomPanel key="chat" from={from ?? seed} origin={o} width={CHAT_W} height={CHAT_H + 2} label="Ask AI">
          <AskChat />
        </BloomPanel>
      )}
      {open && origin && snap && sel && kind === 'comment' && (
        <BloomPanel key="comment" from={from ?? seed} origin={o} width={COMMENT_W} label={`Comments on ${sel.name}`}>
          <div className="p-2"><CommentPanel elementId={sel.id} elementName={sel.name} onClose={closeElementMenu} /></div>
        </BloomPanel>
      )}
      {open && origin && snap && sel && kind === 'export' && (
        <BloomPanel key="export" from={from ?? seed} origin={o} width={EXPORT_W} label={`Export ${sel.name}`}>
          <ExportPanel name={sel.name} />
        </BloomPanel>
      )}
      {open && origin && snap && sel && kind === 'variants' && (
        <BloomPanel key="variants" from={from ?? seed} origin={o} width={variantsWidth(variantBlocks)} label={`Variants of ${sel.name}`}>
          <VariantsPopover elementId={sel.id} name={sel.name} onClose={closeElementMenu} />
        </BloomPanel>
      )}
    </AnimatePresence>,
    document.body,
  )}
    <SidePopover open={more && open && !kind} anchor={moreRef.current} items={sideItems} focus={sideFocus} setFocus={setSideFocus} onPick={pickSide} />
  </>);
}
