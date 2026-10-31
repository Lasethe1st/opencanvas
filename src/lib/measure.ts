/** Measure mode: while on, the preview shows pixel distances from the selection to whatever is hovered. */
import { useSyncExternalStore } from 'react';
import { sendToPreview } from './bridge';

let on = false;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getMeasure = () => on;

export function setMeasure(next: boolean) {
  on = next;
  sendToPreview('measure', { on });
  listeners.forEach((l) => l());
}

export const useMeasure = () => useSyncExternalStore(subscribe, getMeasure, () => false);
