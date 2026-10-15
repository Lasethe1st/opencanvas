/** Google Fonts catalogue parsing, CSS font stacks and the stylesheet link written into a project's index.html. */

export type FontCategory = 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace';

export interface GoogleFont {
  family: string;
  category: FontCategory;
  /** Upright weights the family ships, ascending. */
  weights: number[];
  /** Has a variable weight axis, so any weight in range can be requested. */
  variable: boolean;
}

export interface FontCatalog {
  fonts: GoogleFont[];
  source: 'live' | 'cache' | 'bundled';
}

const CATEGORY: Record<string, FontCategory> = {
  'Sans Serif': 'sans-serif',
  Serif: 'serif',
  Display: 'display',
  Handwriting: 'handwriting',
  Monospace: 'monospace',
};

const FALLBACK: Record<FontCategory, string> = {
  'sans-serif': 'sans-serif',
  serif: 'serif',
  display: 'sans-serif',
  handwriting: 'cursive',
  monospace: 'monospace',
};

export const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com/css2';
const SAFE_FAMILY = /^[A-Za-z0-9][A-Za-z0-9 ]{0,62}$/;

/** Parses https://fonts.google.com/metadata/fonts into popularity order. */
export function parseGoogleMetadata(text: string): GoogleFont[] {
  const data = JSON.parse(text.replace(/^\)\]\}'\s*/, '')) as {
    familyMetadataList?: {
      family: string;
      category: string;
      fonts?: Record<string, unknown>;
      axes?: { tag: string }[];
      popularity?: number;
      isBrandFont?: boolean;
      isOpenSource?: boolean;
    }[];
  };
  const list = data.familyMetadataList ?? [];
  return list
    .filter((f) => SAFE_FAMILY.test(f.family) && f.isBrandFont !== true && f.isOpenSource !== false)
    .sort((a, b) => (a.popularity ?? 1e9) - (b.popularity ?? 1e9))
    .map((f) => ({
      family: f.family,
      category: CATEGORY[f.category] ?? 'sans-serif',
      weights: Object.keys(f.fonts ?? {})
        .filter((k) => /^\d+$/.test(k))
        .map(Number)
        .sort((a, b) => a - b),
      variable: (f.axes ?? []).some((a) => a.tag === 'wght'),
    }));
}

/** The `family=` parameter for the css2 API, e.g. `Playfair Display:wght@400..900`. */
export function googleFamilyParam(font: GoogleFont): string {
  const w = font.weights;
  if (!w.length || (w.length === 1 && w[0] === 400)) return font.family;
  if (font.variable && w.length > 1) return `${font.family}:wght@${w[0]}..${w[w.length - 1]}`;
  return `${font.family}:wght@${w.join(';')}`;
}

/** Validates a family parameter received over IPC before it is written into a project. */
export function isGoogleFamilyParam(param: string): boolean {
  const [family, axes] = param.split(':');
  if (!SAFE_FAMILY.test(family)) return false;
  return axes === undefined || /^wght@\d{1,4}(\.\.\d{1,4}|(;\d{1,4})*)$/.test(axes);
}

export function googleFontsHref(params: string[], extra = 'display=swap'): string {
  const families = params.map((p) => `family=${p.replace(/ /g, '+')}`).join('&');
  return `${GOOGLE_FONTS_CSS}?${families}${extra ? `&${extra}` : ''}`;
}

/** A small stylesheet with only the glyphs needed to draw the family name, for picker previews. */
export function previewHref(font: GoogleFont): string {
  const weight = previewWeight(font);
  const param = weight === 400 ? font.family : `${font.family}:wght@${weight}`;
  return googleFontsHref([param], `text=${encodeURIComponent(font.family)}&display=block`);
}

export function previewWeight(font: GoogleFont): number {
  return font.variable || !font.weights.length || font.weights.includes(400) ? 400 : font.weights[0];
}

const quoteFamily = (family: string) => (/^[A-Za-z-]+$/.test(family) ? family : `'${family}'`);

/** CSS `font-family` value with a sensible generic fallback. */
export function fontStack(family: string, category: FontCategory): string {
  return `${quoteFamily(family)}, ${FALLBACK[category]}`;
}

/** The first family named in a `font-family` value, unquoted. */
export function firstFamily(value: string): string {
  const first = value.split(',')[0]?.trim() ?? '';
  return first.replace(/^(['"])(.*)\1$/, '$2');
}

const LINK_MARK = 'data-oc-fonts';
const LINK_RE = new RegExp(`[ \\t]*<link\\b[^>]*\\b${LINK_MARK}\\b[^>]*>\\r?\\n?`, 'i');

/** Family names loaded by the editor-managed Google Fonts link in index.html. */
export function linkedGoogleFamilies(html: string): string[] {
  const tag = LINK_RE.exec(html)?.[0];
  const href = tag && /href="([^"]*)"/.exec(tag)?.[1];
  if (!href) return [];
  return [...href.matchAll(/family=([^&:"]+)/g)].map((m) => decodeURIComponent(m[1].replace(/\+/g, ' ')));
}

/**
 * Adds `param` to the editor-managed Google Fonts `<link>` in index.html (creating it, plus preconnect
 * hints, before `</head>`). Re-adding a family replaces its weights. Returns the html unchanged when
 * nothing needs to change.
 */
export function ensureGoogleFontLink(html: string, param: string): string {
  if (!isGoogleFamilyParam(param)) throw new Error(`Invalid Google Fonts family: ${param}`);
  const family = param.split(':')[0];
  const existing = LINK_RE.exec(html);
  if (existing) {
    const href = /href="([^"]*)"/.exec(existing[0])?.[1] ?? '';
    const params = [...href.matchAll(/family=([^&"]+)/g)].map((m) => decodeURIComponent(m[1].replace(/\+/g, ' ')));
    const others = params.filter((p) => p.split(':')[0] !== family);
    if (params.includes(param)) return html;
    const indent = /^[ \t]*/.exec(existing[0])![0];
    const eol = existing[0].endsWith('\n') ? (existing[0].endsWith('\r\n') ? '\r\n' : '\n') : '';
    const tag = `${indent}<link rel="stylesheet" href="${googleFontsHref([...others, param])}" ${LINK_MARK} />${eol}`;
    return html.slice(0, existing.index) + tag + html.slice(existing.index + existing[0].length);
  }
  const head = /([ \t]*)<\/head>/i.exec(html);
  if (!head) throw new Error('index.html has no </head>, so the Google font stylesheet cannot be added.');
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const indent = `${head[1]}  `;
  const lines = [];
  if (!html.includes('https://fonts.gstatic.com')) {
    lines.push(`${indent}<link rel="preconnect" href="https://fonts.googleapis.com" />`);
    lines.push(`${indent}<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`);
  }
  lines.push(`${indent}<link rel="stylesheet" href="${googleFontsHref([param])}" ${LINK_MARK} />`);
  return html.slice(0, head.index) + lines.join(eol) + eol + html.slice(head.index);
}
