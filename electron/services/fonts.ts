import fs from 'node:fs';
import path from 'node:path';
import { parseGoogleMetadata, type FontCatalog, type GoogleFont } from '../../shared/fonts';
import { BUNDLED_GOOGLE_FONTS } from '../../shared/google-fonts-fallback';

const METADATA_URL = 'https://fonts.google.com/metadata/fonts';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

let pending: Promise<FontCatalog> | null = null;

function readCache(file: string): { fetchedAt: number; fonts: GoogleFont[] } | null {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data.fonts) && data.fonts.length ? data : null;
  } catch {
    return null;
  }
}

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

async function load(cacheDir: string, fetcher: Fetch): Promise<FontCatalog> {
  const file = path.join(cacheDir, 'google-fonts.json');
  const cached = readCache(file);
  if (cached && Date.now() - cached.fetchedAt < MAX_AGE) return { fonts: cached.fonts, source: 'cache' };
  try {
    const res = await fetcher(METADATA_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const fonts = parseGoogleMetadata(await res.text());
    if (!fonts.length) throw new Error('Empty catalogue');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ fetchedAt: Date.now(), fonts }));
    return { fonts, source: 'live' };
  } catch {
    if (cached) return { fonts: cached.fonts, source: 'cache' };
    return { fonts: BUNDLED_GOOGLE_FONTS, source: 'bundled' };
  }
}

/** The Google Fonts catalogue: cached for a week, falling back to a bundled snapshot offline. */
export function googleFonts(cacheDir: string, fetcher: Fetch = fetch): Promise<FontCatalog> {
  pending ??= load(cacheDir, fetcher).then((catalog) => {
    if (catalog.source === 'bundled') pending = null;
    return catalog;
  });
  return pending;
}
