import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Menu } from 'bloom-menu';
import { motion } from 'framer-motion';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AiMagicIcon, ArrowDown01Icon, PaintBrush01Icon, TextIcon, HelpCircleIcon, SentIcon, Comment01Icon, ViewIcon, ViewOffIcon, ArrowUp01Icon, CodeIcon, Copy01Icon, Copy02Icon, Delete02Icon, Download01Icon, Edit02Icon, FolderTransferIcon, LeftToRightListBulletIcon, PackageIcon, Tick02Icon,
} from '@hugeicons/core-free-icons';
import { duplicateSelected, groupSelected, moveSelected, removeSelected, revealInCode, selectParent, ungroupSelected } from '../lib/actions';
import { elementHtml } from '../lib/bridge';
import { closeElementMenu, useElementMenu } from '../lib/element-menu';
import { openCommentPopover } from '../lib/comment-ui';
import { setShowMarkers, useShowMarkers } from '../lib/comments';
import { setAsk, useAsk } from '../lib/ask-box';
import { AskChat, CHAT_H, CHAT_W } from './AskBox';
import { editSelectedText, INLINE_TAGS } from '../lib/inline-edit';
import { getState, toast, useStore } from '../lib/store';
import { sendToAi } from '../lib/ai';

type Item = { label: string; icon: ReactNode; hint?: string; run: () => void; disabled?: boolean; danger?: boolean };

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
const MENU_H = 470;

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

  useEffect(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    if (at && (selection || ask.mode === 'chat')) {
      setOrigin(at);
      setSnap({ selection: selection ?? null, hasSource: !!sourceInfo, source: sourceInfo ? { file: sourceInfo.file, line: sourceInfo.line } : null, editable });
      setPhase('opening');
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
  const askAbout = (request: string) => {
    if (!sel) return;
    switching.current = true;
    setAsk({ mode: 'chat', target: { id: sel.id, name: sel.name } });
    const text = request.trim();
    if (text && getState().aiStatus?.ready) void sendToAi(text, { references: [{ kind: 'layer', name: sel.name, id: sel.id }] });
  };
  const quick: Item[] = !sel ? [] : [
    { label: 'Restyle', icon: icon(PaintBrush01Icon), run: () => askAbout(`Restyle ${sel.name} so it sits better with the rest of the page.`) },
    ...(INLINE_TAGS.has(sel.tag) ? [{ label: 'Rewrite text', icon: icon(TextIcon), run: () => askAbout(`Rewrite the text in ${sel.name} so it's clearer and tighter. Keep the meaning.`) }] : []),
    { label: 'Explain', icon: icon(HelpCircleIcon), run: () => askAbout(`Explain how ${sel.name} is built and styled. Don't change anything.`) },
  ];
  const groups: Item[][] = !sel ? [] : [
    quick,
    [
      { label: 'Comment', icon: icon(Comment01Icon), run: () => openCommentPopover({ elementId: sel.id, elementName: sel.name, x: at0.x, y: at0.y }) },
      { label: 'Copy', icon: icon(Copy01Icon), hint: 'HTML', run: () => void copyElement() },
      { label: 'Export', icon: icon(Download01Icon), hint: '.html', run: () => void exportElement() },
    ],
    [
      ...(canEditText ? [{ label: 'Edit text', icon: icon(Edit02Icon), hint: 'Enter', run: editSelectedText }] : []),
      { label: 'Duplicate', icon: icon(Copy02Icon), disabled: !canEdit, run: () => void duplicateSelected() },
      { label: 'Select parent', icon: icon(FolderTransferIcon), disabled: !sel?.parentId, run: selectParent },
      { label: 'Move up', icon: icon(ArrowUp01Icon), hint: 'Alt+↑', disabled: !canEdit, run: () => void moveSelected('up') },
      { label: 'Move down', icon: icon(ArrowDown01Icon), hint: 'Alt+↓', disabled: !canEdit, run: () => void moveSelected('down') },
      { label: 'Group', icon: icon(PackageIcon), disabled: !canEdit, run: () => void groupSelected() },
      { label: 'Ungroup', icon: icon(LeftToRightListBulletIcon), disabled: !canEdit, run: () => void ungroupSelected() },
    ],
    [
      { label: markers ? 'Hide comments' : 'Show comments', icon: icon(markers ? ViewOffIcon : ViewIcon), run: () => setShowMarkers(!markers) },
      { label: 'Open in code', icon: icon(CodeIcon), disabled: !snap.source, run: () => snap.source && revealInCode(snap.source.file, snap.source.line) },
      { label: 'Delete', icon: icon(Delete02Icon), hint: 'Del', danger: true, disabled: !canEdit, run: () => void removeSelected() },
    ],
  ];
  // Grow towards the side with room.
  const up = origin.y + MENU_H > window.innerHeight - 8;
  const end = origin.x + MENU_W > window.innerWidth - 8;
  let n = 0;
  return createPortal(
    <div
      data-tw=""
      data-bloom-menu=""
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: 'fixed', top: origin.y - (up ? BLOOM_SEED : 0), left: origin.x - (end ? BLOOM_SEED : 0), width: BLOOM_SEED, height: BLOOM_SEED, zIndex: 400 }}
    >
      <Menu.Root open={phase === 'open'} onOpenChange={(next) => {
          if (next) return;
          // Picking Ask AI keeps the menu open and turns it into the chat; an open chat stays until it is closed.
          if (switching.current) { switching.current = false; return; }
          if (chat) return;
          closeElementMenu();
        }} direction={up ? 'top' : 'bottom'} anchor={end ? 'end' : 'start'} bounce={0.12} visualDuration={0.28}>
        <Menu.Container
          buttonSize={BLOOM_SEED}
          menuWidth={chat ? CHAT_W : MENU_W}
          menuRadius={16}
          buttonRadius={BLOOM_SEED / 2}
          className="border border-[color:var(--frost-border)] bg-[var(--frost-bg)] text-foreground"
          style={{ WebkitBackdropFilter: 'var(--frost-filter)', backdropFilter: 'var(--frost-filter)', boxShadow: phase === 'open' ? 'var(--shadow-md)' : 'none' }}
        >
          <Menu.Trigger className="opacity-0">
            <span className="sr-only">Actions for {sel?.name ?? "element"}</span>
          </Menu.Trigger>
          <Menu.Content className="flex flex-col" style={{ width: chat ? CHAT_W : MENU_W, height: chat ? CHAT_H : undefined, boxSizing: 'border-box' }}>
            {chat ? <AskChat /> : (
              <div className="flex flex-col p-1.5 pt-2" style={{ width: MENU_W, boxSizing: 'border-box' }}>
            {sel && <AskField name={sel.name} phase={phase} onSend={askAbout} />}
            {groups.map((g, gi) => (
              <div key={gi} className={gi ? 'mt-1 border-t border-foreground/[0.08] pt-1' : ''}>
                {g.map((it) => {
                  const delay = 0.05 + 0.022 * n++;
                  return (
                    <motion.div key={it.label} initial={{ opacity: 0, y: -4 }} animate={phase === 'open' ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }} transition={{ delay: phase === 'open' ? delay : 0, duration: 0.18, ease: 'easeOut' }}>
                      <Menu.Item
                        disabled={it.disabled}
                        className={`flex w-full cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-sm outline-none transition-colors duration-150 hover:bg-accent aria-disabled:pointer-events-none aria-disabled:opacity-40 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:shrink-0 ${it.danger ? 'text-destructive [&_svg]:text-destructive' : 'text-foreground [&_svg]:text-muted-foreground'}`}
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
  );
}

/** The top of the menu: "Ask AI about this…" with the element as a chip. Enter turns the menu into the chat. */
function AskField({ name, phase, onSend }: { name: string; phase: 'closed' | 'opening' | 'open'; onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (phase === 'open') field.current?.focus({ preventScroll: true });
  }, [phase]);
  const send = () => text.trim() && onSend(text);
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={phase === 'open' ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }} transition={{ delay: phase === 'open' ? 0.04 : 0, duration: 0.18, ease: 'easeOut' }} className="px-0.5 pb-1.5">
      <div className="flex items-center gap-1.5 rounded-[12px] bg-foreground/[0.06] py-1 pe-1 ps-2">
        <HugeiconsIcon icon={AiMagicIcon} size={15} strokeWidth={1.8} className="shrink-0 text-muted-foreground" />
        <input
          ref={field}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); send(); }
            if (e.key === 'Escape') closeElementMenu();
          }}
          placeholder="Ask AI about this…"
          aria-label={`Ask AI about ${name}`}
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        {text.trim() ? (
          <button type="button" aria-label="Send" onClick={send} className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-background">
            <HugeiconsIcon icon={SentIcon} size={12} strokeWidth={2} />
          </button>
        ) : (
          <span className="max-w-[84px] shrink-0 truncate rounded-full bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground" title={name}>{name}</span>
        )}
      </div>
    </motion.div>
  );
}
