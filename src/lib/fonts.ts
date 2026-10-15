import { useEffect, useState } from 'react';
import { linkedGoogleFamilies, previewHref, type FontCatalog, type GoogleFont } from '../../shared/fonts';
import { api } from './api';

let catalog: Promise<FontCatalog> | null = null;

export function loadGoogleFonts(): Promise<FontCatalog> {
  const request = (catalog ??= api.googleFonts().then(
    (c) => {
      if (c.source === 'bundled') catalog = null;
      return c;
    },
    () => {
      catalog = null;
      return { fonts: [], source: 'bundled' as const };
    },
  ));
  return request;
}

export function useGoogleFonts(enabled: boolean): FontCatalog | null {
  const [value, setValue] = useState<FontCatalog | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadGoogleFonts().then((c) => alive && setValue(c));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return value;
}

/** Google families the project already loads from index.html. */
export function useProjectFonts(enabled: boolean): string[] {
  const [families, setFamilies] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api
      .readFile('index.html')
      .then((html) => alive && setFamilies(linkedGoogleFamilies(html)))
      .catch(() => alive && setFamilies([]));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return families;
}

const loaded = new Set<string>();

/** Loads just enough of a Google font to draw its own name in the picker. */
export function loadFontPreview(font: GoogleFont) {
  if (loaded.has(font.family)) return;
  loaded.add(font.family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = previewHref(font);
  document.head.appendChild(link);
}
