/** Experience level: one editor that reveals more as the person grows. Beginner is the default. */
import { useSyncExternalStore } from 'react';
import { setCalm } from './calm';
import { setState } from './store';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'veteran';

const KEY = 'oc.experienceLevel';
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const read = (): ExperienceLevel => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === 'intermediate' || raw === 'veteran' || raw === 'beginner') return raw;
  } catch {
    /* storage blocked */
  }
  return 'beginner';
};

let level: ExperienceLevel = read();

/** Beginner defaults to the calm canvas so the first open matches the vision. */
if (level === 'beginner') setCalm(true);

export const getExperienceLevel = () => level;

/** Beginner keeps calm on and visual mode; higher levels only unlock chrome. */
export function setExperienceLevel(next: ExperienceLevel) {
  level = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* storage blocked */
  }
  if (next === 'beginner') {
    setCalm(true);
    setState({ mode: 'visual', interact: false, tool: 'select' });
  }
  listeners.forEach((l) => l());
}

export const useExperienceLevel = () => useSyncExternalStore(subscribe, getExperienceLevel, getExperienceLevel);

export const isBeginner = () => level === 'beginner';
export const canUseInspector = () => level !== 'beginner';
export const canUseLayers = () => level !== 'beginner';
export const canUseCode = () => level === 'veteran';
export const canUseTerminal = () => level === 'veteran';
