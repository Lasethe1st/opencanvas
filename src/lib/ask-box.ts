/** The floating "Ask AI" chat that grows out of the right-click menu: open or maximised. Minimising folds it into the dock. */
import { useSyncExternalStore } from 'react';

export type AskMode = 'none' | 'chat' | 'max';
export type AskState = { mode: AskMode; target: { id: string; name: string; tag?: string } | null };
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
