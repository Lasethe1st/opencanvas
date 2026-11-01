/** The floating "Ask AI" chat that grows out of the right-click menu: open, minimised to a bubble, or maximised. */
import { useSyncExternalStore } from 'react';

export type AskMode = 'none' | 'chat' | 'min' | 'max';
export type AskState = { mode: AskMode; target: { id: string; name: string } | null };
let state: AskState = { mode: 'none', target: null };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getAsk = () => state;
export function setAsk(next: Partial<AskState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
export const useAsk = () => useSyncExternalStore(subscribe, getAsk, getAsk);
