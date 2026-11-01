import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AiMagicIcon, ArrowDown01Icon, ArrowUp01Icon, CodeIcon, Copy01Icon, Copy02Icon, Delete02Icon, Download01Icon, Edit02Icon, FolderTransferIcon, LeftToRightListBulletIcon, PackageIcon, Tick02Icon,
} from '@hugeicons/core-free-icons';
import { duplicateSelected, groupSelected, moveSelected, removeSelected, revealInCode, selectParent, ungroupSelected } from '../lib/actions';
import { elementHtml } from '../lib/bridge';
import { closeElementMenu, useElementMenu } from '../lib/element-menu';
import { editSelectedText, INLINE_TAGS } from '../lib/inline-edit';
import { getState, toast, useStore } from '../lib/store';

type Item = { label: string; icon: ReactNode; hint?: string; run: () => void; disabled?: boolean; danger?: boolean };

const icon = (i: Parameters<typeof HugeiconsIcon>[0]['icon']) => <HugeiconsIcon icon={i} size={15} strokeWidth={1.8} />;

async function htmlOfSelection(): Promise<string> {
  const s = getState();
  if (!s.selection || !s.activeFrameId) return '';
  return elementHtml(s.activeFrameId, s.selection.id);
}

function askAi() {
  const input = document.querySelector<HTMLInputElement>('.assistant-docker input');
  input?.focus();
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

/** Right-click on an element in the canvas: the actions that used to live in the little bar above it. */
export function ElementContextMenu() {
  const at = useElementMenu();
  const selection = useStore((s) => s.selection);
  const sourceInfo = useStore((s) => s.sourceInfo);
  const editable = useStore((s) => s.project?.editable ?? false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!at || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(at.x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(at.y, window.innerHeight - r.height - 8)) });
  }, [at, selection?.id]);

  useEffect(() => {
    if (!at) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeElementMenu();
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeElementMenu();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('blur', closeElementMenu);
    window.addEventListener('resize', closeElementMenu);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('blur', closeElementMenu);
      window.removeEventListener('resize', closeElementMenu);
    };
  }, [at]);

  if (!at || !selection) return null;
  const canEditText = INLINE_TAGS.has(selection.tag) && !!sourceInfo?.textEditable && editable;
  const groups: Item[][] = [
    [
      { label: 'Ask AI', icon: icon(AiMagicIcon), run: askAi },
      { label: 'Copy', icon: icon(Copy01Icon), hint: 'HTML', run: () => void copyElement() },
      { label: 'Export', icon: icon(Download01Icon), hint: '.html', run: () => void exportElement() },
    ],
    [
      ...(canEditText ? [{ label: 'Edit text', icon: icon(Edit02Icon), hint: 'Enter', run: editSelectedText }] : []),
      { label: 'Duplicate', icon: icon(Copy02Icon), disabled: !editable, run: () => void duplicateSelected() },
      { label: 'Select parent', icon: icon(FolderTransferIcon), disabled: !selection.parentId, run: selectParent },
      { label: 'Move up', icon: icon(ArrowUp01Icon), hint: 'Alt+↑', disabled: !editable, run: () => void moveSelected('up') },
      { label: 'Move down', icon: icon(ArrowDown01Icon), hint: 'Alt+↓', disabled: !editable, run: () => void moveSelected('down') },
      { label: 'Group', icon: icon(PackageIcon), disabled: !editable, run: () => void groupSelected() },
      { label: 'Ungroup', icon: icon(LeftToRightListBulletIcon), disabled: !editable, run: () => void ungroupSelected() },
    ],
    [
      { label: 'Open in code', icon: icon(CodeIcon), disabled: !sourceInfo, run: () => sourceInfo && revealInCode(sourceInfo.file, sourceInfo.line) },
      { label: 'Delete', icon: icon(Delete02Icon), hint: 'Del', danger: true, disabled: !editable, run: () => void removeSelected() },
    ],
  ];
  return createPortal(
    <div ref={ref} className="popover element-menu" role="menu" aria-label={`Actions for ${selection.name}`} style={{ position: 'fixed', zIndex: 60, left: pos?.left ?? at.x, top: pos?.top ?? at.y, visibility: pos ? 'visible' : 'hidden', minWidth: 200 }} onContextMenu={(e) => e.preventDefault()}>
      <div className="menu-title">{selection.name}</div>
      {groups.map((g, gi) => (
        <div key={gi} className="element-menu__group">
          {g.map((it) => (
            <button key={it.label} type="button" role="menuitem" className={`menu-item${it.danger ? ' is-danger' : ''}`} disabled={it.disabled} onClick={() => { closeElementMenu(); it.run(); }}>
              {it.icon}
              {it.label}
              {it.hint && <span className="menu-item__hint">{it.hint}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>,
    document.body,
  );
}
