import { useSyncExternalStore } from "react";

export type ChatBubblePresetId = "default" | "sky" | "seafoam" | "sand" | "coral" | "slate";

export type ChatBubblePreset = {
  id: ChatBubblePresetId;
  label: string;
  /** Swatch color for the settings picker (always concrete). */
  swatch: string;
};

export const CHAT_BUBBLE_PRESETS: ChatBubblePreset[] = [
  { id: "default", label: "Ink", swatch: "#e8e8e8" },
  { id: "sky", label: "Sky", swatch: "#7eb8d4" },
  { id: "seafoam", label: "Seafoam", swatch: "#6bb3a0" },
  { id: "sand", label: "Sand", swatch: "#d4b896" },
  { id: "coral", label: "Coral", swatch: "#e07a5f" },
  { id: "slate", label: "Slate", swatch: "#8b95a8" },
];

const STORAGE_KEY = "oc-chat-bubble";
const IDS = new Set(CHAT_BUBBLE_PRESETS.map((p) => p.id));
const listeners = new Set<() => void>();

function readPreset(): ChatBubblePresetId {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored && IDS.has(stored as ChatBubblePresetId) ? (stored as ChatBubblePresetId) : "default";
}

let preset = readPreset();

function apply() {
  const root = document.documentElement;
  if (preset === "default") root.removeAttribute("data-chat-bubble");
  else root.dataset.chatBubble = preset;
  listeners.forEach((listener) => listener());
}

export function setChatBubblePreset(next: ChatBubblePresetId) {
  preset = next;
  if (next === "default") localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, next);
  apply();
}

export function useChatBubblePreset() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => preset,
  );
}

apply();
