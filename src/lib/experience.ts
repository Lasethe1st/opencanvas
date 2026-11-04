/** Experience level: one editor that reveals more as the person grows. Beginner is the default. */
import { useSyncExternalStore } from 'react';
import { closeCalmPanels, setCalm } from './calm';
import { setQuickPills } from './prefs';
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

/** Beginner: calm canvas, quick pills, no side chrome — matches the vision default. */
function applyBeginnerDefaults() {
  setCalm(true);
  setQuickPills(true);
  closeCalmPanels();
  setState({ mode: 'visual', interact: false, tool: 'select', settingsTab: 'general' });
}

if (level === 'beginner') applyBeginnerDefaults();

export const getExperienceLevel = () => level;

/** Beginner keeps calm on and visual mode; higher levels only unlock chrome. */
export function setExperienceLevel(next: ExperienceLevel) {
  level = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* storage blocked */
  }
  if (next === 'beginner') applyBeginnerDefaults();
  listeners.forEach((l) => l());
}

export const useExperienceLevel = () => useSyncExternalStore(subscribe, getExperienceLevel, getExperienceLevel);

export const isBeginner = () => level === 'beginner';
export const canUseInspector = () => level !== 'beginner';
export const canUseLayers = () => level !== 'beginner';
export const canUseCode = () => level === 'veteran';
export const canUseTerminal = () => level === 'veteran';
