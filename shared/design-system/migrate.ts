import type { DesignSystemConfig } from '../project-config';
import { guessTokenType } from './schema';
import { emptyDesignSystem, type DesignSystemDocument, type Token, type TokenValue } from './types';

const aliasPattern = /^\{([^}]+)\}$|^var\(\s*(--[\w-]+)\s*\)$/;

function parseValue(raw: string): TokenValue {
  const m = raw.trim().match(aliasPattern);
  if (m) return { kind: 'alias', ref: (m[1] || m[2]).trim() };
  return { kind: 'raw', value: raw.trim() };
}

function normalizeKey(key: string): { id: string; path: string; themeHint?: string } {
  const themeMatch = key.match(/^(.*)\s+\((.+)\)$/);
  if (themeMatch) {
    const base = themeMatch[1].trim().replace(/^--/, '');
    const sel = themeMatch[2].toLowerCase();
    const themeHint = sel.includes('dark') ? 'dark' : sel.includes('light') ? 'light' : undefined;
    return { id: base.replace(/\./g, '-'), path: base.replace(/-/g, '.'), themeHint };
  }
  const base = key.replace(/^--/, '');
  return { id: base.replace(/\./g, '-'), path: base.includes('.') ? base : base.replace(/-/g, '.') };
}

/** Convert the legacy flat Direction designSystem snapshot into a document. */
export function migrateFlatDesignSystem(
  flat: DesignSystemConfig | null | undefined,
  projectName?: string,
): DesignSystemDocument {
  const doc = emptyDesignSystem(projectName ? `${projectName} design system` : 'Design system');
  if (!flat?.tokens) return doc;

  const byPath = new Map<string, Token>();

  for (const [key, raw] of Object.entries(flat.tokens)) {
    const { id, path, themeHint } = normalizeKey(key);
    const value = parseValue(raw);
    const existing = byPath.get(path);
    if (existing && themeHint) {
      existing.themes = { ...existing.themes, [themeHint]: value };
      continue;
    }
    if (existing && !themeHint) {
      existing.value = value;
      continue;
    }
    const token: Token = {
      id,
      path,
      type: guessTokenType(path, value.kind === 'raw' ? value.value : ''),
      value,
      role: path.split('.').length <= 2 && !/^(color|space|radius|shadow|font)\.(primary|bg|fg|muted|surface)/.test(path)
        ? 'primitive'
        : 'semantic',
      themes: themeHint ? { [themeHint]: value } : undefined,
    };
    // Prefer semantic when path looks semantic
    if (/\.(primary|secondary|bg|fg|muted|surface|border|accent)/.test(path)) token.role = 'semantic';
    byPath.set(path, token);
  }

  doc.tokens = [...byPath.values()];
  doc.meta.importedFrom = { file: flat.file, format: flat.format, at: flat.importedAt };
  doc.meta.updatedAt = Date.now();
  return doc;
}
