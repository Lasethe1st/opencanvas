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
