import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Menu } from 'bloom-menu';
import { motion } from 'framer-motion';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AiMagicIcon, MoreHorizontalIcon, ArrowDown01Icon, PaintBrush01Icon, TextIcon, HelpCircleIcon, Comment01Icon, ViewIcon, ViewOffIcon, ArrowUp01Icon, CodeIcon, Copy01Icon, Copy02Icon, Delete02Icon, Download01Icon, Edit02Icon, FolderTransferIcon, LeftToRightListBulletIcon, PackageIcon, Tick02Icon,
} from '@hugeicons/core-free-icons';
import { duplicateSelected, groupSelected, moveSelected, removeSelected, revealInCode, selectParent, ungroupSelected } from '../lib/actions';
import { elementHtml } from '../lib/bridge';
import { bloomPlacement, closeElementMenu, useElementMenu } from '../lib/element-menu';
import { openCommentPopover } from '../lib/comment-ui';
import { setShowMarkers, useShowMarkers } from '../lib/comments';
import { setAsk, useAsk } from '../lib/ask-box';
import { AskChat, CHAT_H, CHAT_W } from './AskBox';
import { SideBloom, sideBloomKey, type SideItem } from './SideBloom';
import { editSelectedText, INLINE_TAGS } from '../lib/inline-edit';
import { getState, toast, useStore } from '../lib/store';
import { sendToAi } from '../lib/ai';

type Item = { label: string; icon: ReactNode; hint?: string; run: () => void; disabled?: boolean; danger?: boolean; more?: boolean };

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

async function exportElement() {
  const html = await htmlOfSelection();
  const sel = getState().selection;
  if (!html || !sel) return toast('Couldn’t read that element', 'error');
  const name = (sel.name || sel.tag).replace(/[^\w-]+/g, '-').toLowerCase() || 'element';
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

const BLOOM_SEED = 8;
/** Matches Menu.Root visualDuration so the close morph finishes before unmount. */
const BLOOM_CLOSE_MS = 320;
const MENU_W = 224;
const MENU_H = 360;

type Snap = { selection: ReturnType<typeof getState>['selection']; hasSource: boolean; source: { file: string; line: number } | null; editable: boolean };

/** Right-click on an element in the canvas: the menu blooms out of the pointer (bloom-menu) and its options stagger in. */
export function ElementContextMenu() {
  const at = useElementMenu();
  const selection = useStore((s) => s.selection);
  const sourceInfo = useStore((s) => s.sourceInfo);
  const editable = useStore((s) => s.project?.editable ?? false);
  const ask = useAsk();
  const markers = useShowMarkers();
  const switching = useRef(false);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [phase, setPhase] = useState<'closed' | 'opening' | 'open'>('closed');
  const [snap, setSnap] = useState<Snap | null>(null);
  const timer = useRef<number | null>(null);
  const [more, setMore] = useState(false);
  const [sideFocus, setSideFocus] = useState(-1);
  const moreRef = useRef<HTMLDivElement>(null);
  const overSide = useRef(false);
  const sideRef = useRef<{ items: SideItem[]; pick: (it: SideItem) => void }>({ items: [], pick: () => {} });

  // Keyboard inside the open More… panel.
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => sideBloomKey(e, sideRef.current.items, sideFocus, setSideFocus, sideRef.current.pick, () => setMore(false));
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [more, sideFocus]);

  useEffect(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    if (at && (selection || ask.mode === 'chat')) {
      setOrigin(at);
      setSnap({ selection: selection ?? null, hasSource: !!sourceInfo, source: sourceInfo ? { file: sourceInfo.file, line: sourceInfo.line } : null, editable });
      setPhase('opening');
      setMore(false);
    } else if (origin) {
      setPhase('closed');
      timer.current = window.setTimeout(() => setOrigin(null), BLOOM_CLOSE_MS);
    }
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps

  // 'opening' mounts the menu closed for one frame so the morph has a start state.
  useEffect(() => {
    if (phase !== 'opening') return;
    const id = requestAnimationFrame(() => setPhase('open'));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  useEffect(() => {
    if (!origin) return;
    const close = () => closeElementMenu();
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [origin]);

  if (!origin || !snap) return null;
  const { selection: sel, editable: canEdit } = snap;
  const chat = ask.mode === 'chat';
  const canEditText = !!sel && INLINE_TAGS.has(sel.tag) && !!sourceInfo?.textEditable && canEdit;
  const at0 = origin;
  // Ask AI from the menu: the menu turns into the chat (same bloom), with this element attached.
  // Quick actions also send a ready-made request; plain Ask AI just opens the chat.
  const askAbout = (request: string) => {
    if (!sel) return;
    switching.current = true;
    setAsk({ mode: 'chat', target: { id: sel.id, name: sel.name, tag: sel.tag } });
    const text = request.trim();
    if (text && getState().aiStatus?.ready) void sendToAi(text, { references: [{ kind: 'layer', name: sel.name, id: sel.id }] });
  };
  const ai: Item[] = !sel ? [] : [
    { label: 'Ask AI', icon: icon(AiMagicIcon), run: () => askAbout('') },
    { label: 'Restyle', icon: icon(PaintBrush01Icon), run: () => askAbout(`Restyle ${sel.name} so it sits better with the rest of the page.`) },
    ...(INLINE_TAGS.has(sel.tag) ? [{ label: 'Rewrite text', icon: icon(TextIcon), run: () => askAbout(`Rewrite the text in ${sel.name} so it's clearer and tighter. Keep the meaning.`) }] : []),
  ];
  // Everything else lives in the More… side bloom, so the main list stays short.
  const extras: Item[] = !sel ? [] : [
    { label: 'Explain', icon: icon(HelpCircleIcon), run: () => askAbout(`Explain how ${sel.name} is built and styled. Don't change anything.`) },
    { label: 'Comment', icon: icon(Comment01Icon), run: () => openCommentPopover({ elementId: sel.id, elementName: sel.name, x: at0.x, y: at0.y }) },
    { label: 'Export', icon: icon(Download01Icon), hint: '.html', run: () => void exportElement() },
    ...(canEditText ? [{ label: 'Edit text', icon: icon(Edit02Icon), hint: 'Enter', run: editSelectedText }] : []),
    { label: 'Select parent', icon: icon(FolderTransferIcon), disabled: !sel?.parentId, run: selectParent },
    { label: 'Move up', icon: icon(ArrowUp01Icon), hint: 'Alt+↑', disabled: !canEdit, run: () => void moveSelected('up') },
    { label: 'Move down', icon: icon(ArrowDown01Icon), hint: 'Alt+↓', disabled: !canEdit, run: () => void moveSelected('down') },
    { label: 'Ungroup', icon: icon(LeftToRightListBulletIcon), disabled: !canEdit, run: () => void ungroupSelected() },
    { label: markers ? 'Hide comments' : 'Show comments', icon: icon(markers ? ViewOffIcon : ViewIcon), run: () => setShowMarkers(!markers) },
    { label: 'Open in code', icon: icon(CodeIcon), disabled: !snap.source, run: () => snap.source && revealInCode(snap.source.file, snap.source.line) },
  ];
  const groups: Item[][] = !sel ? [] : [
    ai,
    [
      { label: 'Copy', icon: icon(Copy01Icon), hint: 'HTML', run: () => void copyElement() },
      { label: 'Duplicate', icon: icon(Copy02Icon), disabled: !canEdit, run: () => void duplicateSelected() },
      { label: 'Group', icon: icon(PackageIcon), disabled: !canEdit, run: () => void groupSelected() },
      { label: 'More…', icon: icon(MoreHorizontalIcon), hint: '›', more: true, run: () => { switching.current = true; setSideFocus(0); setMore(true); } },
    ],
    [
      { label: 'Delete', icon: icon(Delete02Icon), hint: 'Del', danger: true, disabled: !canEdit, run: () => void removeSelected() },
    ],
  ];
  const sideItems: SideItem[] = extras.map((it) => ({ id: it.label, label: it.label, icon: it.icon, hint: it.hint, disabled: it.disabled }));
  const pickSide = (it: SideItem) => {
    const x = extras.find((e) => e.label === it.id);
    if (!x || x.disabled) return;
    setMore(false);
    overSide.current = false;
    x.run();
    // Explain turns the main menu into the chat (no close event follows, so clear the guard); anything else closes the menu.
    if (x.label === 'Explain') switching.current = false;
    else closeElementMenu();
  };
  sideRef.current = { items: sideItems, pick: pickSide };
  // Grow towards the side with more room, sized for whichever is bigger (menu or chat) so the
  // direction never flips mid-morph; when neither side fits, slide the anchor so it stays on screen.
  const H = Math.max(MENU_H, CHAT_H + 2);
  const W = Math.max(MENU_W, CHAT_W);
  const { up, end, top, left } = bloomPlacement(origin, W, H, BLOOM_SEED);
  let n = 0;
  return (<>{createPortal(
    <div
      data-tw=""
      data-bloom-menu=""
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: 'fixed', top, left, width: BLOOM_SEED, height: BLOOM_SEED, zIndex: 400 }}
    >
      <Menu.Root open={phase === 'open'} onOpenChange={(next) => {
          if (next) return;
          // Picking Ask AI keeps the menu open and turns it into the chat; an open chat stays until it is closed.
          if (switching.current) { switching.current = false; return; }
          if (overSide.current) return;
          if (chat) return;
          closeElementMenu();
        }} direction={up ? 'top' : 'bottom'} anchor={end ? 'end' : 'start'} bounce={0.06} visualDuration={0.26}>
        <Menu.Container
          buttonSize={BLOOM_SEED}
          menuWidth={chat ? CHAT_W : MENU_W}
          menuRadius={16}
          buttonRadius={BLOOM_SEED / 2}
          className={`ctx-bloom${chat ? ' ctx-bloom--chat' : ''} border text-foreground`}
          style={{ boxShadow: phase === 'open' ? '0 8px 24px rgb(0 0 0 / 0.12)' : 'none' }}
        >
          <Menu.Trigger className="opacity-0">
            <span className="sr-only">Actions for {sel?.name ?? "element"}</span>
          </Menu.Trigger>
          <Menu.Content className="flex flex-col" style={{ width: (chat ? CHAT_W : MENU_W) - 2, height: chat ? CHAT_H : undefined, boxSizing: 'border-box' }}>
            {chat ? <AskChat /> : (
              <div className="flex flex-col p-1.5 pt-2" style={{ width: MENU_W - 2, boxSizing: 'border-box' }}>
            <div className="truncate px-2.5 pb-1 text-xs font-medium text-muted-foreground">{sel?.name}</div>
            {groups.map((g, gi) => (
              <div key={gi} className={gi ? 'mt-1 border-t border-foreground/[0.08] pt-1' : ''}>
                {g.map((it) => {
                  const delay = 0.04 + Math.min(0.02 * n++, 0.2);
                  return (
                    <motion.div key={it.label} ref={it.more ? moreRef : undefined} onMouseEnter={() => (it.more ? (setSideFocus(-1), setMore(true)) : setMore(false))} initial={{ opacity: 0, y: -4, filter: 'blur(2px)' }} animate={phase === 'open' ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: -4, filter: 'blur(2px)' }} transition={{ delay: phase === 'open' ? delay : 0, duration: phase === 'open' ? 0.2 : 0.1, ease: [0.23, 1, 0.32, 1] }}>
                      <Menu.Item
                        disabled={it.disabled}
                        className={`flex w-full cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-sm outline-none transition-colors duration-150 hover:bg-accent aria-disabled:pointer-events-none aria-disabled:opacity-40 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:shrink-0 ${it.danger ? 'ctx-danger' : 'text-foreground [&_svg]:text-muted-foreground'}${it.more && more ? ' bg-accent' : ''}`}
                        onSelect={it.run}
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
            )}
          </Menu.Content>
        </Menu.Container>
      </Menu.Root>
    </div>,
    document.body,
  )}
    <SideBloom open={more && phase === 'open' && !chat} anchor={moreRef.current} items={sideItems} focus={sideFocus} setFocus={setSideFocus} onPick={pickSide} onClose={() => setMore(false)} overSide={overSide} />
  </>);
}

