import type { TokenType } from './types';

export function guessTokenType(path: string, sample = ''): TokenType {
  const p = path.toLowerCase();
  const v = sample.toLowerCase();
  if (/color|bg|fg|fill|stroke|accent|brand|tint/.test(p) || /^#|^rgb|^hsl|^oklch|^color\(/.test(v)) return 'color';
  if (/space|spacing|gap|padding|margin|size|width|height/.test(p) || /^\d+(\.\d+)?(px|rem|em)$/.test(v)) return 'space';
  if (/radius|rounded|corner/.test(p)) return 'radius';
  if (/shadow|elevation|glow/.test(p) || v.includes('px') && v.includes('rgba')) return 'shadow';
  if (/font-?family|typeface|font$/.test(p) || /sans|serif|mono|geist|inter/.test(v)) return 'font';
  if (/font-?size|text-size|type-size/.test(p)) return 'fontSize';
  if (/font-?weight|weight/.test(p)) return 'fontWeight';
  if (/line-?height|leading/.test(p)) return 'lineHeight';
  if (/opacity|alpha/.test(p)) return 'opacity';
  if (/motion|duration|ease|transition|anim/.test(p) || /ms$|s$/.test(v) && /ease|cubic/.test(v)) return 'motion';
  if (/breakpoint|bp|media/.test(p)) return 'breakpoint';
  if (/border|stroke-width/.test(p)) return 'border';
  return 'other';
}

export function groupTokensByCategory(paths: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const path of paths) {
    const cat = path.split('.')[0] || 'other';
    const list = groups.get(cat) ?? [];
    list.push(path);
    groups.set(cat, list);
  }
  return groups;
}
