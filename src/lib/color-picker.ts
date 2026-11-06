import { colorToHex, recolor } from "./code-highlights";

let active: HTMLInputElement | null = null;

/**
 * Opens the system colour picker over a swatch and reports each colour as the same kind of text that was
 * there (hex stays hex, rgb() stays rgb(), hsl() stays hsl()). `onInput` fires while dragging; `onDone` when the picker closes.
 * Must be called from a click, since browsers only open pickers for a user action.
 */
export function pickColor(
  anchor: { left: number; top: number; width: number; height: number },
  current: string,
  hooks: { onInput: (next: string) => void; onDone?: (final: string) => void },
) {
  active?.remove();
  const input = document.createElement("input");
  input.type = "color";
  input.value = colorToHex(current) ?? "#000000";
  input.setAttribute("data-code-color-picker", "");
  input.setAttribute("aria-label", "Pick a colour");
  Object.assign(input.style, {
    position: "fixed",
    left: `${anchor.left}px`,
    top: `${anchor.top}px`,
    width: `${Math.max(1, anchor.width)}px`,
    height: `${Math.max(1, anchor.height)}px`,
    opacity: "0",
    border: "0",
    padding: "0",
    pointerEvents: "none",
    zIndex: "9999",
  });
  let cur = current;
  input.addEventListener("input", () => {
    cur = recolor(cur, input.value);
    hooks.onInput(cur);
  });
  input.addEventListener("change", () => {
    hooks.onDone?.(cur);
    input.remove();
    if (active === input) active = null;
  });
  document.body.appendChild(input);
  active = input;
  try {
    input.showPicker();
  } catch {
    input.click();
  }
}
