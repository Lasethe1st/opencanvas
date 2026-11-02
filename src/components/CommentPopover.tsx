import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Delete02Icon, Edit02Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { addComment, commentsFor, removeComment, updateComment, useComments } from '../lib/comments';
import { closeCommentPopover, useCommentPopover } from '../lib/comment-ui';

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString();
};

/** Note box for an element: its comments so far, and a field for a new one. */
export function CommentPopover() {
  const at = useCommentPopover();
  useComments();
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    setDraft('');
    setEditing(null);
  }, [at?.elementId]);

  useLayoutEffect(() => {
    if (!at || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(at.x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(at.y + 8, window.innerHeight - r.height - 8)) });
  }, [at, commentsFor(at?.elementId ?? '').length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!at) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeCommentPopover();
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeCommentPopover();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [at]);

  if (!at) return null;
  const list = commentsFor(at.elementId);
  const save = () => {
    if (!draft.trim()) return;
    addComment(at.elementId, at.elementName, draft);
    setDraft('');
  };
  return createPortal(
    <div
      ref={ref}
      data-tw=""
      data-comment-popover=""
      role="dialog"
      aria-label={`Comments on ${at.elementName}`}
      className="oc-pop fixed z-[300] w-[300px] rounded-[16px] border border-[color:var(--frost-border)] bg-[var(--frost-bg)] p-2 text-foreground shadow-[var(--shadow-md)]"
      style={{ left: pos?.left ?? at.x, top: pos?.top ?? at.y, visibility: pos ? 'visible' : 'hidden', WebkitBackdropFilter: 'var(--frost-filter)', backdropFilter: 'var(--frost-filter)' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between px-2 pb-1 pt-0.5">
        <span className="truncate text-xs font-medium text-muted-foreground">Comments on {at.elementName}</span>
        <button type="button" aria-label="Close" className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" onClick={closeCommentPopover}>
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
        </button>
      </div>
      {list.length > 0 && (
        <ul className="m-0 mb-1 flex max-h-[240px] list-none flex-col gap-1 overflow-y-auto p-0 [scrollbar-width:thin]">
          {list.map((c) => (
            <li key={c.id} className={`group rounded-[12px] bg-muted/60 px-2.5 py-2 text-sm ${c.resolved ? 'opacity-60' : ''}`}>
              {editing === c.id ? (
                <textarea
                  autoFocus
                  defaultValue={c.text}
                  rows={2}
                  className="w-full resize-none rounded-[8px] bg-background/60 p-1.5 text-sm outline-none"
                  onBlur={(e) => {
                    if (e.currentTarget.value.trim()) updateComment(c.id, { text: e.currentTarget.value.trim() });
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                />
              ) : (
                <p className={`m-0 whitespace-pre-wrap break-words ${c.resolved ? 'line-through' : ''}`}>{c.text}</p>
              )}
              <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="mr-auto">{ago(c.createdAt)}{c.resolved ? ' · resolved' : ''}</span>
                <button type="button" aria-label={c.resolved ? 'Reopen' : 'Resolve'} title={c.resolved ? 'Reopen' : 'Resolve'} className="grid size-6 place-items-center rounded-full hover:bg-accent hover:text-foreground" onClick={() => updateComment(c.id, { resolved: !c.resolved })}>
                  <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />
                </button>
                <button type="button" aria-label="Edit" title="Edit" className="grid size-6 place-items-center rounded-full hover:bg-accent hover:text-foreground" onClick={() => setEditing(c.id)}>
                  <HugeiconsIcon icon={Edit02Icon} size={14} strokeWidth={2} />
                </button>
                <button type="button" aria-label="Delete" title="Delete" className="grid size-6 place-items-center rounded-full hover:bg-accent hover:text-destructive" onClick={() => removeComment(c.id)}>
                  <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-1.5">
        <textarea
          autoFocus={!list.length}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
          rows={2}
          aria-label="Add a comment"
          placeholder={list.length ? 'Reply…' : 'Add a comment…'}
          className="w-full resize-none rounded-[12px] bg-muted/60 p-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex justify-end">
          <button type="button" disabled={!draft.trim()} className="h-8 rounded-full bg-foreground px-3.5 text-xs font-medium text-background disabled:opacity-40" onClick={save}>
            Comment
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
