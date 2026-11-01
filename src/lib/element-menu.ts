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
