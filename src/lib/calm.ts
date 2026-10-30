/** "Calm" canvas: just the site and the dock on a home-style background. Panels come back from the dock. */
import { useSyncExternalStore } from 'react';

const KEY = 'oc.calmCanvas';
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** On unless the person has turned it off. */
export function getCalm(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function setCalm(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* storage blocked */
  }
  listeners.forEach((l) => l());
}

export const useCalm = () => useSyncExternalStore(subscribe, getCalm, () => true);
