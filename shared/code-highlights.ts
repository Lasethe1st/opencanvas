/**
 * Finds the bits of a typed message that read as CSS or HTML, so the composer and the sent message can box them.
 * Pure text in, labelled runs out; colours live in the UI layer.
 */

export type HighlightKind = 'unit' | 'class' | 'element' | 'color';
export type UnitFamily = 'absolute' | 'font' | 'percent' | 'viewport' | 'other';

export interface HighlightPart {
  text: string;
  kind?: HighlightKind;
  /** For units: which family the unit belongs to. */
  family?: UnitFamily;
  /** For colours: the CSS colour to fill the box with, and whether dark text reads on it. */
  swatch?: { css: string; darkText: boolean; faint: boolean };
}

const UNITS =
  '(?<unit>px|rem|em|%|vh|vw|vmin|vmax|svh|dvh|lvh|pt|pc|cm|mm|in|ch|ex|lh|fr|deg|rad|turn|ms|s)';
// Short hex forms need a letter, so "#123" (an issue number) isn't painted.
const HEX = '#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|(?=[0-9]*[a-fA-F])[0-9a-fA-F]{3,4})(?![\\w])';
const FUNC =
  '(?<![\\w-])(?:rgba?|hsla?)\\(\\s*[\\d.]+(?:deg|%)?(?:\\s*[,\\s/]\\s*[\\d.]+%?){2,3}\\s*\\)';
const FILE_EXT =
  'png|jpe?g|gif|svg|webp|avif|ico|css|scss|less|js|mjs|cjs|jsx|ts|tsx|json|md|mdx|html?|env|gitignore|txt|csv|pdf|zip|yml|yaml|toml|lock|log|mp4|mov|mp3|wav|woff2?|ttf|otf';
const TAGS =
  'h[1-6]|div|span|ul|ol|li|img|svg|td|tr|th|tbody|thead|tfoot|textarea|iframe|fieldset|figcaption|blockquote';

const RE = new RegExp(
  [
    `(?<color>(?<![\\w#&])${HEX}|${FUNC})`,
    `(?<measure>(?<![\\w.#-])-?\\d*\\.?\\d+${UNITS}(?![\\w%]))`,
    // A leading dot that isn't attached to a word (except right after a tag, as in div.card), a path or a number, and isn't a file extension.
    `(?<class>(?:(?<![\\w.)\\]/\\\\-])|(?<=\\b(?:${TAGS})))\\.(?!(?:${FILE_EXT})(?![\\w-]))-?[_a-zA-Z][\\w-]*)`,
    `(?<tag><\\/?[a-z][a-z0-9]*>)`,
    `(?<element>(?<![\\w.#:@/<-])(?:${TAGS})(?![\\w-]))`,
  ].join('|'),
  'g',
);

function family(unit: string): UnitFamily {
  if (['px', 'pt', 'pc', 'cm', 'mm', 'in'].includes(unit)) return 'absolute';
  if (['rem', 'em', 'ch', 'ex', 'lh'].includes(unit)) return 'font';
  if (unit === '%') return 'percent';
  if (['vh', 'vw', 'vmin', 'vmax', 'svh', 'dvh', 'lvh'].includes(unit)) return 'viewport';
  return 'other';
}

/** rgb 0-255 and alpha 0-1 for hex, rgb() and hsl() text; null when it doesn't parse. */
function parseColor(css: string): { r: number; g: number; b: number; a: number } | null {
  if (css.startsWith('#')) {
    let h = css.slice(1);
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const nums = (css.match(/[\d.]+/g) ?? []).map(Number);
  const alphaOf = (v: number | undefined) => (v === undefined ? 1 : css.includes('%', css.lastIndexOf(String(v))) ? v / 100 : v);
  if (/^rgb/i.test(css)) {
    if (nums.length < 3) return null;
    return { r: nums[0], g: nums[1], b: nums[2], a: Math.min(1, alphaOf(nums[3])) };
  }
  if (/^hsl/i.test(css)) {
    if (nums.length < 3) return null;
    const h = (((nums[0] % 360) + 360) % 360) / 360;
    const s = Math.min(100, nums[1]) / 100;
    const l = Math.min(100, nums[2]) / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const ch = (t: number) => {
      const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
      const v = x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
      return Math.round(v * 255);
    };
    return { r: ch(h + 1 / 3), g: ch(h), b: ch(h - 1 / 3), a: Math.min(1, alphaOf(nums[3])) };
  }
  return null;
}

function swatch(css: string): HighlightPart['swatch'] | undefined {
  const c = parseColor(css);
  if (!c || [c.r, c.g, c.b].some((v) => v > 255 || Number.isNaN(v))) return undefined;
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  // Dark text when the fill is light; a see-through fill leans on the page behind it, so it gets plain text.
  return { css, darkText: lum > 0.4, faint: c.a < 0.5 };
}

export function highlightCode(text: string): HighlightPart[] {
  const out: HighlightPart[] = [];
  let last = 0;
  for (const m of text.matchAll(RE)) {
    const start = m.index ?? 0;
    const g = m.groups ?? {};
    const hit = m[0];
    let part: HighlightPart | null = null;
    if (g.color) {
      const sw = swatch(hit);
      if (sw) part = { text: hit, kind: 'color', swatch: sw };
    } else if (g.measure) part = { text: hit, kind: 'unit', family: family(g.unit) };
    else if (g.class) part = { text: hit, kind: 'class' };
    else if (g.tag || g.element) part = { text: hit, kind: 'element' };
    if (!part) continue;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push(part);
    last = start + hit.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** `#rrggbb` for any colour text this file understands (alpha dropped), or null. */
export function colorToHex(css: string): string | null {
  const c = parseColor(css.trim());
  return c ? `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}` : null;
}

function toHsl(r: number, g: number, b: number): [number, number, number] {
  const x = r / 255;
  const y = g / 255;
  const z = b / 255;
  const max = Math.max(x, y, z);
  const min = Math.min(x, y, z);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === x ? (y - z) / d + (y < z ? 6 : 0) : max === y ? (z - x) / d + 2 : (x - y) / d + 4;
  return [Math.round(h * 60) % 360, Math.round(s * 100), Math.round(l * 100)];
}

/** The same colour text with a new colour: hex stays hex, rgb() stays rgb() and hsl() stays hsl(), keeping the
 *  function name, separators, case and any alpha. `hex` is `#rrggbb`, as a colour picker gives it. */
export function recolor(css: string, hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const old = parseColor(css.trim());
  if (!m || !old) return css;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  if (css.startsWith('#')) {
    const digits = css.length - 1;
    const upper = /[A-F]/.test(css) && !/[a-f]/.test(css);
    const out = `#${hex2(r)}${hex2(g)}${hex2(b)}${digits === 4 || digits === 8 ? hex2(old.a * 255) : ''}`;
    return upper ? out.toUpperCase() : out;
  }
  const fn = /^([a-z]+)\(([^)]*)\)$/i.exec(css.trim());
  if (!fn) return css;
  const comma = fn[2].includes(',');
  const alpha = comma ? fn[2].split(',')[3]?.trim() : fn[2].split('/')[1]?.trim();
  const channels = /^rgb/i.test(fn[1]) ? [`${r}`, `${g}`, `${b}`] : (() => { const [h, s, l] = toHsl(r, g, b); return [`${h}`, `${s}%`, `${l}%`]; })();
  const tail = alpha ? (comma ? `, ${alpha}` : ` / ${alpha}`) : '';
  return `${fn[1]}(${channels.join(comma ? ', ' : ' ')}${tail})`;
}
