/** Where the right-click action menu is open (screen pixels), or null. */
import { useSyncExternalStore } from 'react';

export type ElementMenuAt = { x: number; y: number } | null;
let at: ElementMenuAt = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function openElementMenu(x: number, y: number) {
  at = { x, y };
  listeners.forEach((l) => l());
}

export function closeElementMenu() {
  if (!at) return;
  at = null;
  listeners.forEach((l) => l());
}

export const useElementMenu = () => useSyncExternalStore(subscribe, () => at, () => null);

/** Right-click on anything that isn't an element (bare canvas, a wrapper, frame chrome, a frame's empty body): the insert menu. */
export type InsertMenuAt = { x: number; y: number; frameId: string | null; world: { x: number; y: number } } | null;
let insertAt: InsertMenuAt = null;
const insertListeners = new Set<() => void>();
const subscribeInsert = (l: () => void) => {
  insertListeners.add(l);
  return () => insertListeners.delete(l);
};
export function openInsertMenu(next: NonNullable<InsertMenuAt>) {
  closeElementMenu();
  insertAt = next;
  insertListeners.forEach((l) => l());
}
export function closeInsertMenu() {
  if (!insertAt) return;
  insertAt = null;
  insertListeners.forEach((l) => l());
}
export const useInsertMenu = () => useSyncExternalStore(subscribeInsert, () => insertAt, () => null);

/** Where a bloom of size W×H anchored at a pointer should sit: grow toward the roomier side, clamped 8px inside the window. */
export function bloomPlacement(origin: { x: number; y: number }, W: number, H: number, seed: number) {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const up = origin.y + H > vh - 8 && origin.y > vh - origin.y;
  const end = origin.x + W > vw - 8 && origin.x > vw - origin.x;
  const ay = up ? Math.min(vh - 8, Math.max(origin.y, 8 + H)) : Math.max(8, Math.min(origin.y, vh - 8 - H));
  const ax = end ? Math.min(vw - 8, Math.max(origin.x, 8 + W)) : Math.max(8, Math.min(origin.x, vw - 8 - W));
  return { up, end, top: ay - (up ? seed : 0), left: ax - (end ? seed : 0) };
}
