import { useSyncExternalStore } from "react";

export type ChatFontSizeId = "small" | "default" | "large";

export type ChatFontSizePreset = {
  id: ChatFontSizeId;
  label: string;
  /** Maps to theme `--text-sm` / `--text-base` / `--text-lg`. */
  size: string;
  /** Slightly smaller companion for secondary chat text. */
  sizeSm: string;
};

/** Presets map to theme `--text-sm` / `--text-base` / `--text-lg` (12.5 / 14 / 16px). */
export const CHAT_FONT_SIZE_PRESETS: ChatFontSizePreset[] = [
  { id: "small", label: "Small", size: "12.5px", sizeSm: "12px" },
  { id: "default", label: "Default", size: "14px", sizeSm: "12.5px" },
  { id: "large", label: "Large", size: "16px", sizeSm: "14px" },
];

const STORAGE_KEY = "oc-chat-font-size";
const IDS = new Set(CHAT_FONT_SIZE_PRESETS.map((p) => p.id));
const listeners = new Set<() => void>();

function readPreset(): ChatFontSizeId {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored && IDS.has(stored as ChatFontSizeId) ? (stored as ChatFontSizeId) : "default";
}

let preset = readPreset();

function apply() {
  const next = CHAT_FONT_SIZE_PRESETS.find((p) => p.id === preset) ?? CHAT_FONT_SIZE_PRESETS[1];
  const root = document.documentElement;
  root.style.setProperty("--chat-font-size", next.size);
  root.style.setProperty("--chat-font-size-sm", next.sizeSm);
  listeners.forEach((listener) => listener());
}

export function setChatFontSize(next: ChatFontSizeId) {
  preset = next;
  if (next === "default") localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, next);
  apply();
}

export function useChatFontSize() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => preset,
  );
}

apply();
