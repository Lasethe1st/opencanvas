/** Which comment popover is open, and where (screen pixels). */
import { useSyncExternalStore } from 'react';

export type CommentPopover = { elementId: string; elementName: string; x: number; y: number } | null;
let at: CommentPopover = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function openCommentPopover(p: NonNullable<CommentPopover>) {
  at = p;
  listeners.forEach((l) => l());
}
export function closeCommentPopover() {
  if (!at) return;
  at = null;
  listeners.forEach((l) => l());
}
export const useCommentPopover = () => useSyncExternalStore(subscribe, () => at, () => null);
