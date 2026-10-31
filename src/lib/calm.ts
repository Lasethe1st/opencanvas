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

/* Side panels in the calm canvas stay closed until a corner pill opens them. */
export type CalmPanels = { left: boolean; right: boolean };
const PANELS_KEY = 'oc.calmPanels';
let panels: CalmPanels = (() => {
  try {
    return { left: false, right: false, ...JSON.parse(localStorage.getItem(PANELS_KEY) || '{}') };
  } catch {
    return { left: false, right: false };
  }
})();

export const getCalmPanels = () => panels;

export function toggleCalmPanel(side: 'left' | 'right') {
  panels = { ...panels, [side]: !panels[side] };
  try {
    localStorage.setItem(PANELS_KEY, JSON.stringify(panels));
  } catch {
    /* storage blocked */
  }
  listeners.forEach((l) => l());
}

export const useCalmPanels = () => useSyncExternalStore(subscribe, getCalmPanels, getCalmPanels);
