/** What the AI is working on right now: one element (when one was selected) or the active frame. Shown as a small weave at the top left. */
import { useSyncExternalStore } from 'react';
import { getState, useStore } from './store';

export type AiTarget = { frameId: string | null; elementId: string | null };
let target: AiTarget | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Called when a turn starts: remember what the request was about. */
export function markAiTarget() {
  const s = getState();
  target = { frameId: s.activeFrameId ?? null, elementId: s.selection?.id ?? null };
  listeners.forEach((l) => l());
}

export function clearAiTarget() {
  if (!target) return;
  target = null;
  listeners.forEach((l) => l());
}

/** The target while a turn is running, otherwise null. */
export function useAiTarget(): AiTarget | null {
  const busy = useStore((s) => !!s.aiTurnId);
  const t = useSyncExternalStore(subscribe, () => target, () => null);
  return busy ? t : null;
}

/** The element id being worked on right now, for pushing into preview frames as they load. */
export const getAiTargetId = () => (getState().aiTurnId && target?.elementId ? target.elementId : null);
