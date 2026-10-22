import { useSyncExternalStore } from "react";

/** Two-stop gradient passed to ElevenLabs `<Orb colors={[a, b]} />`. */
export type OrbColorPair = [string, string];

export type OrbColorPresetId = "mist" | "sky" | "warm" | "slate" | "coral" | "ink";

export type OrbColorPreset = {
  id: OrbColorPresetId;
  label: string;
  colors: OrbColorPair;
};

/** Curated pairs — includes the examples from ui.elevenlabs.io/docs/components/orb. */
export const ORB_COLOR_PRESETS: OrbColorPreset[] = [
  { id: "mist", label: "Mist", colors: ["#c8c8cc", "#8a8a90"] },
  { id: "sky", label: "Sky", colors: ["#CADCFC", "#A0B9D1"] },
  { id: "warm", label: "Warm", colors: ["#F6E7D8", "#E0CFC2"] },
  { id: "slate", label: "Slate", colors: ["#E5E7EB", "#9CA3AF"] },
  { id: "coral", label: "Coral", colors: ["#FF6B6B", "#4ECDC4"] },
  { id: "ink", label: "Ink", colors: ["#d4d4d8", "#52525b"] },
];

const STORAGE_KEY = "oc-orb-colors";
const IDS = new Set(ORB_COLOR_PRESETS.map((p) => p.id));
const listeners = new Set<() => void>();

function readPreset(): OrbColorPresetId {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored && IDS.has(stored as OrbColorPresetId) ? (stored as OrbColorPresetId) : "mist";
}

let preset = readPreset();

function notify() {
  listeners.forEach((listener) => listener());
}

export function getOrbColors(id: OrbColorPresetId = preset): OrbColorPair {
  return (ORB_COLOR_PRESETS.find((p) => p.id === id) ?? ORB_COLOR_PRESETS[0]).colors;
}

export function setOrbColorPreset(next: OrbColorPresetId) {
  preset = next;
  if (next === "mist") localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, next);
  notify();
}

export function useOrbColorPreset() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => preset,
  );
}

export function useOrbColors(): OrbColorPair {
  const id = useOrbColorPreset();
  return getOrbColors(id);
}
