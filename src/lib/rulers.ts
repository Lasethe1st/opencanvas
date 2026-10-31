import { useSyncExternalStore } from 'react';

/** Whether the canvas rulers are showing. Kept on this computer so it survives reloads. */
const KEY = 'oc.canvasRulers';
const listeners = new Set<() => void>();

export function getRulers(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setRulers(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* storage blocked */
  }
  listeners.forEach((l) => l());
}

export function useRulers(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getRulers,
    () => false,
  );
}
