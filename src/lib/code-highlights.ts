import type { CSSProperties } from "react";
import { highlightCode, type HighlightPart, type UnitFamily } from "../../shared/code-highlights";

const UNIT_COLORS: Record<UnitFamily, string> = {
  absolute: "var(--src-project)",
  font: "var(--src-web)",
  percent: "var(--src-file)",
  viewport: "var(--src-chat)",
  other: "var(--src-google)",
};

const tint = (color: string): CSSProperties =>
  ({
    color,
    backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
    borderRadius: 6,
    padding: "0 2px",
    margin: "0 -2px",
    cornerShape: "squircle",
  }) as CSSProperties;

/** The box around a highlighted run, shared by the input and the sent message so they can't drift apart. */
export function highlightStyle(part: HighlightPart): CSSProperties | undefined {
  switch (part.kind) {
    case "unit":
      return tint(UNIT_COLORS[part.family ?? "other"]);
    case "class":
      return tint("var(--src-skill)");
    case "element":
      return tint("var(--src-chat)");
    case "color":
      if (!part.swatch) return undefined;
      return {
        backgroundColor: part.swatch.css,
        color: part.swatch.faint ? "var(--fg)" : part.swatch.darkText ? "#111" : "#fff",
        boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--fg) 14%, transparent)",
        borderRadius: 6,
        padding: "0 2px",
        margin: "0 -2px",
        cornerShape: "squircle",
      } as CSSProperties;
    default:
      return undefined;
  }
}

export { highlightCode };
