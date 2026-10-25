/** Persisted free-canvas backdrop color (does not touch UI theme tokens). */

const STORAGE_KEY = 'oc-canvas-bg';

export function readCanvasBg(): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function writeCanvasBg(color: string | null) {
  try {
    if (!color) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, color.toLowerCase());
  } catch {
    /* private mode */
  }
}

/** Dot grid color that stays readable on the chosen canvas fill. */
export function canvasDotFor(bg: string): string {
  const hex = bg.replace('#', '');
  if (hex.length !== 6) return 'rgba(0,0,0,0.12)';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.55 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.16)';
}

/** Theme default when the user hasn’t picked a custom canvas color. */
export function defaultCanvasBg(theme: 'light' | 'dark' = 'light'): string {
  return theme === 'dark' ? '#0c0c0c' : '#e8e8ea';
}

/** Apply a stored custom canvas color to the document (or clear overrides). */
export function applyCanvasBg(color: string | null) {
  const root = document.documentElement;
  if (!color) {
    root.style.removeProperty('--canvas');
    root.style.removeProperty('--canvas-dot');
    return;
  }
  root.style.setProperty('--canvas', color);
  root.style.setProperty('--canvas-dot', canvasDotFor(color));
}

applyCanvasBg(readCanvasBg());
