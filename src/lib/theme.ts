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

/** Switch themes without every color transition firing at once. */
function setThemeAttribute(value: string) {
  const root = document.documentElement;
  if (root.dataset.theme === value) return;
  const style = document.createElement('style');
  style.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.appendChild(style);
  root.dataset.theme = value;
  void getComputedStyle(root).opacity; // flush styles while transitions are off
  requestAnimationFrame(() => requestAnimationFrame(() => style.remove()));
}

function apply() {
  snapshot = { preference, resolved: resolve(preference) };
  setThemeAttribute(snapshot.resolved);
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
