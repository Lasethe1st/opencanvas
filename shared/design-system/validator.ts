import { findCycles, resolveTokenValue, ResolveError } from './resolver';
import type { DesignSystemDocument } from './types';

export type ValidationIssue = {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  tokenId?: string;
  themeId?: string;
};

export function validateDesignSystem(doc: DesignSystemDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();

  for (const theme of doc.themes) {
    if (!theme.id.trim()) issues.push({ severity: 'error', code: 'theme-id', message: 'A theme is missing an id.' });
  }
  if (!doc.themes.some((t) => t.id === doc.activeThemeId)) {
    issues.push({
      severity: 'error',
      code: 'active-theme',
      message: `Active theme “${doc.activeThemeId}” is not defined.`,
      themeId: doc.activeThemeId,
    });
  }

  for (const token of doc.tokens) {
    if (!token.id.trim()) {
      issues.push({ severity: 'error', code: 'token-id', message: 'A token is missing an id.' });
      continue;
    }
    if (ids.has(token.id)) {
      issues.push({ severity: 'error', code: 'duplicate', message: `Duplicate token id “${token.id}”.`, tokenId: token.id });
    }
    ids.add(token.id);

    for (const theme of doc.themes) {
      try {
        resolveTokenValue(doc, token.id, theme.id);
      } catch (err) {
        if (err instanceof ResolveError) {
          issues.push({
            severity: err.code === 'missing' ? 'error' : 'error',
            code: err.code,
            message: err.message,
            tokenId: token.id,
            themeId: theme.id,
          });
        }
      }
    }
  }

  for (const cycle of findCycles(doc)) {
    issues.push({
      severity: 'error',
      code: 'cycle',
      message: `Circular reference: ${cycle.join(' → ')}`,
      tokenId: cycle[0],
    });
  }

  for (const comp of doc.components) {
    for (const dep of comp.tokenDeps) {
      if (![...ids].some((id) => id === dep || id.endsWith(dep))) {
        const exists = doc.tokens.some((t) => t.id === dep || t.path === dep);
        if (!exists) {
          issues.push({
            severity: 'warning',
            code: 'comp-dep',
            message: `Component “${comp.name}” references missing token “${dep}”.`,
            tokenId: dep,
          });
        }
      }
    }
  }

  return issues;
}
