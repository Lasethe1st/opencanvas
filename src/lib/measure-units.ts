import type { CSSProperties } from "react";

/** A number followed by a CSS unit, standing on its own (not inside a word, a hex colour or an identifier). */
const UNIT_RE = /(?<![\w.#-])(-?\d*\.?\d+)(px|rem|em|%|vh|vw|vmin|vmax|svh|dvh|lvh|pt|pc|cm|mm|in|ch|ex|lh|fr|deg|rad|turn|ms|s)(?![\w%])/g;

const UNIT_COLORS = {
  absolute: "var(--src-project)",
  font: "var(--src-web)",
  percent: "var(--src-file)",
  viewport: "var(--src-chat)",
  other: "var(--src-google)",
} as const;

function unitFamily(unit: string): keyof typeof UNIT_COLORS {
  if (["px", "pt", "pc", "cm", "mm", "in"].includes(unit)) return "absolute";
  if (["rem", "em", "ch", "ex", "lh"].includes(unit)) return "font";
  if (unit === "%") return "percent";
  if (["vh", "vw", "vmin", "vmax", "svh", "dvh", "lvh"].includes(unit)) return "viewport";
  return "other";
}

/** Splits text into plain runs and CSS measurements (16px, 1.5rem, 50%); a measurement carries its colour. */
export function splitMeasurements(text: string): { text: string; unit?: string }[] {
  const out: { text: string; unit?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(UNIT_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: m[0], unit: UNIT_COLORS[unitFamily(m[2])] });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** The tinted box around a measurement, the same in the input and in the sent message. */
export function measurementStyle(unit: string): CSSProperties {
  return {
    color: unit,
    backgroundColor: `color-mix(in srgb, ${unit} 16%, transparent)`,
    borderRadius: 6,
    padding: "0 2px",
    margin: "0 -2px",
    cornerShape: "squircle",
  } as CSSProperties;
}
