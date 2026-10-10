import { useSyncExternalStore } from 'react';
import type { ThemePreference } from '../../shared/types';
import { api } from './api';

export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'oc-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

let preference = readPreference();
let snapshot = { preference, resolved: resolve(preference) };

function resolve(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? (media.matches ? 'dark' : 'light') : pref;
}

function apply() {
  snapshot = { preference, resolved: resolve(preference) };
  document.documentElement.dataset.theme = snapshot.resolved;
  listeners.forEach((listener) => listener());
}

export function setThemePreference(next: ThemePreference) {
  preference = next;
  if (next === 'system') localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, next);
  apply();
  void api.setTheme(next);
}

export function useTheme() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}

media.addEventListener('change', () => {
  if (preference === 'system') apply();
});

apply();
void api.setTheme(preference);
