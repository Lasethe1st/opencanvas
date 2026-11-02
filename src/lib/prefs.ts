/** Small everyday preferences: how Enter behaves when sending, and whether the app animates. */
import { useSyncExternalStore } from 'react';

export type SendKey = 'enter' | 'mod-enter';
const SEND_KEY = 'oc.sendKey';
const MOTION_KEY = 'oc.reduceMotion';
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked */
  }
};

let sendKey: SendKey = read(SEND_KEY) === 'mod-enter' ? 'mod-enter' : 'enter';
let reduceMotion = read(MOTION_KEY) === '1';

export const getSendKey = () => sendKey;
export function setSendKey(next: SendKey) {
  sendKey = next;
  write(SEND_KEY, next);
  listeners.forEach((l) => l());
}
export const useSendKey = () => useSyncExternalStore(subscribe, getSendKey, getSendKey);

const applyMotion = () => {
  if (typeof document !== 'undefined') document.documentElement.dataset.reduceMotion = reduceMotion ? 'true' : 'false';
};
applyMotion();
export const getReduceMotion = () => reduceMotion;
export function setReduceMotion(on: boolean) {
  reduceMotion = on;
  write(MOTION_KEY, on ? '1' : '0');
  applyMotion();
  listeners.forEach((l) => l());
}
export const useReduceMotion = () => useSyncExternalStore(subscribe, getReduceMotion, getReduceMotion);

/* Your name, for the home greeting. */
const NAME_KEY = 'oc.displayName';
let displayName = (read(NAME_KEY) ?? '').slice(0, 40);
export const getDisplayName = () => displayName;
export function setDisplayName(next: string) {
  displayName = next.slice(0, 40);
  write(NAME_KEY, displayName);
  listeners.forEach((l) => l());
}
export const useDisplayName = () => useSyncExternalStore(subscribe, getDisplayName, getDisplayName);

/* The Edit / Font / Colour pills that grow out of the dock when an element is selected. */
const PILLS_KEY = 'oc.quickPills';
let quickPills = read(PILLS_KEY) !== '0';
export const getQuickPills = () => quickPills;
export function setQuickPills(on: boolean) {
  quickPills = on;
  write(PILLS_KEY, on ? '1' : '0');
  listeners.forEach((l) => l());
}
export const useQuickPills = () => useSyncExternalStore(subscribe, getQuickPills, getQuickPills);

/* How soon code edits are written to disk. */
export type AutosaveSpeed = 'fast' | 'normal' | 'slow';
const SAVE_KEY = 'oc.autosave';
export const AUTOSAVE_MS: Record<AutosaveSpeed, number> = { fast: 300, normal: 700, slow: 2000 };
let autosave: AutosaveSpeed = (['fast', 'normal', 'slow'] as const).find((v) => v === read(SAVE_KEY)) ?? 'normal';
export const getAutosaveMs = () => AUTOSAVE_MS[autosave];
export const getAutosave = () => autosave;
export function setAutosave(next: AutosaveSpeed) {
  autosave = next;
  write(SAVE_KEY, next);
  listeners.forEach((l) => l());
}
export const useAutosave = () => useSyncExternalStore(subscribe, getAutosave, getAutosave);
