/** Comments pinned to elements. Kept per project in this browser/app profile; markers are drawn inside each preview frame. */
import { useSyncExternalStore } from 'react';
import { sendToFrame, sendToPreview, frameIds } from './bridge';
import { getState } from './store';

export type Comment = { id: string; elementId: string; elementName: string; text: string; createdAt: number; resolved: boolean };

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const keyFor = (root: string) => `oc-comments:v1:${root.replace(/\\/g, '/').toLowerCase()}`;
const SHOW_KEY = 'oc.commentMarkers';

let loadedRoot: string | null = null;
let items: Comment[] = [];
let show = (() => {
  try {
    return localStorage.getItem(SHOW_KEY) !== '0';
  } catch {
    return true;
  }
})();

function ensureLoaded() {
  const root = getState().project?.root ?? '';
  if (root === loadedRoot) return;
  loadedRoot = root;
  try {
    const raw = root ? localStorage.getItem(keyFor(root)) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    items = Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.id === 'string' && typeof c.elementId === 'string' && typeof c.text === 'string') : [];
  } catch {
    items = [];
  }
}

function commit(next: Comment[]) {
  items = next;
  const root = loadedRoot;
  if (root) {
    try {
      localStorage.setItem(keyFor(root), JSON.stringify(items));
    } catch {
      /* storage blocked */
    }
  }
  pushToFrames();
  listeners.forEach((l) => l());
}

/** Numbers follow the order comments were made, per element. */
export function marksPayload() {
  ensureLoaded();
  return { show, items: items.map((c, i) => ({ cid: c.id, id: c.elementId, n: i + 1, resolved: c.resolved })) };
}

export function pushToFrames(frameId?: string) {
  const p = marksPayload();
  if (frameId) sendToFrame(frameId, 'comments', p);
  else sendToPreview('comments', p);
}

export function getComments(): Comment[] {
  ensureLoaded();
  return items;
}

export const useComments = () => useSyncExternalStore(subscribe, getComments, getComments);

export function commentsFor(elementId: string): Comment[] {
  return getComments().filter((c) => c.elementId === elementId);
}

export function addComment(elementId: string, elementName: string, text: string) {
  const t = text.trim();
  if (!t) return;
  ensureLoaded();
  commit([...items, { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, elementId, elementName, text: t, createdAt: Date.now(), resolved: false }]);
}

export function updateComment(id: string, patch: Partial<Pick<Comment, 'text' | 'resolved'>>) {
  ensureLoaded();
  commit(items.map((c) => (c.id === id ? { ...c, ...patch } : c)));
}

export function removeComment(id: string) {
  ensureLoaded();
  commit(items.filter((c) => c.id !== id));
}

export const getShowMarkers = () => show;

export function setShowMarkers(on: boolean) {
  show = on;
  try {
    localStorage.setItem(SHOW_KEY, on ? '1' : '0');
  } catch {
    /* storage blocked */
  }
  pushToFrames();
  listeners.forEach((l) => l());
}

export const useShowMarkers = () => useSyncExternalStore(subscribe, getShowMarkers, getShowMarkers);

/** Every frame needs the marks again after it (re)loads. */
export function resyncAllFrames() {
  for (const id of frameIds()) pushToFrames(id);
}
