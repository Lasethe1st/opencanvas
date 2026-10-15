import fs from 'node:fs';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};
const MAX_BYTES = 256 * 1024;
const FALLBACKS = ['public/favicon.svg', 'public/favicon.ico', 'public/favicon.png', 'favicon.svg', 'favicon.ico', 'favicon.png'];

/** Icon hrefs declared in index.html, in document order. */
export function faviconHrefs(html: string): string[] {
  const hrefs: string[] = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1].toLowerCase() ?? '';
    if (!rel.split(/\s+/).some((r) => r === 'icon' || r === 'apple-touch-icon')) continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1].trim();
    if (href) hrefs.push(href);
  }
  return hrefs;
}

function inside(root: string, abs: string) {
  const rel = path.relative(root, abs);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function candidates(root: string, href: string): string[] {
  if (/^(data:|https?:|\/\/)/i.test(href)) return [];
  const clean = decodeURIComponent(href.split(/[?#]/)[0]).replace(/^\.\//, '');
  if (clean.startsWith('/')) return [path.join(root, 'public', clean), path.join(root, clean)];
  return [path.join(root, clean), path.join(root, 'public', clean)];
}

function toDataUrl(file: string): string | null {
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime) return null;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_BYTES) return null;
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  } catch {
    return null;
  }
}

/** The project's favicon as a data URL: whatever index.html links, else a conventional favicon file. */
export function projectFavicon(root: string): string | null {
  let html = '';
  try {
    html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  } catch {
    /* no index.html */
  }
  const declared = faviconHrefs(html).flatMap((href) => candidates(root, href));
  for (const file of [...declared, ...FALLBACKS.map((f) => path.join(root, f))]) {
    if (!inside(root, file)) continue;
    const url = toDataUrl(file);
    if (url) return url;
  }
  return null;
}
