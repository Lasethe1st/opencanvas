import fs from 'node:fs';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};
/** Cards are small, and every recent project's image crosses IPC on each load. */
const MAX_BYTES = 900 * 1024;
const FALLBACKS = ['public/og-image.png', 'public/og.png', 'public/og-image.jpg', 'public/social.png', 'og-image.png', 'og.png'];

function metaContent(html: string, keys: string[]): string | null {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const name = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1].toLowerCase();
    if (!name || !keys.includes(name)) continue;
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const value = (content?.[1] ?? content?.[2] ?? '').replace(/\s+/g, ' ').trim();
    if (value) return value;
  }
  return null;
}

/** The share image index.html declares (og:image, then twitter:image). */
export function shareImageHref(html: string): string | null {
  return metaContent(html, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']);
}

/** A short description: og:description, the meta description, or package.json's. */
export function projectDescription(html: string, pkgDescription?: string): string | null {
  const d = metaContent(html, ['og:description', 'description', 'twitter:description']) ?? (pkgDescription?.trim() || null);
  return d ? (d.length > 140 ? `${d.slice(0, 137).trimEnd()}…` : d) : null;
}

function inside(root: string, abs: string) {
  const rel = path.relative(root, abs);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function candidates(root: string, href: string): string[] {
  if (/^(data:|https?:|\/\/)/i.test(href)) return [];
  let clean = href.split(/[?#]/)[0];
  try {
    clean = decodeURIComponent(clean);
  } catch {
    /* keep as written */
  }
  clean = clean.replace(/^\.\//, '');
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

/** What a project's card shows: the image people see when its link is shared, and a one-line description. */
export function projectCard(root: string): { image: string | null; description: string | null } {
  let html = '';
  try {
    html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  } catch {
    /* no index.html */
  }
  let pkgDescription: string | undefined;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { description?: unknown };
    if (typeof pkg.description === 'string') pkgDescription = pkg.description;
  } catch {
    /* no package.json */
  }
  const href = shareImageHref(html);
  const files = [...(href ? candidates(root, href) : []), ...FALLBACKS.map((f) => path.join(root, f))];
  let image: string | null = null;
  for (const file of files) {
    if (!inside(root, file)) continue;
    image = toDataUrl(file);
    if (image) break;
  }
  return { image, description: projectDescription(html, pkgDescription) };
}
