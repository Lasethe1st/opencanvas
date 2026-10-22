import type { DesignSystemDocument, Token, TokenValue } from './types';
import { cssVarName } from './types';

export class ResolveError extends Error {
  constructor(
    message: string,
    public readonly code: 'missing' | 'cycle' | 'empty',
  ) {
    super(message);
    this.name = 'ResolveError';
  }
}

function tokenMap(doc: DesignSystemDocument): Map<string, Token> {
  const map = new Map<string, Token>();
  for (const t of doc.tokens) {
    map.set(t.id, t);
    map.set(t.path, t);
    map.set(cssVarName(t.id), t);
    map.set(cssVarName(t.path), t);
  }
  return map;
}

function themeValue(token: Token, themeId: string): TokenValue {
  return token.themes?.[themeId] ?? token.value;
}

/** Resolve a token to a concrete CSS value for a theme. Detects cycles. */
export function resolveTokenValue(
  doc: DesignSystemDocument,
  tokenId: string,
  themeId: string = doc.activeThemeId,
): string {
  const map = tokenMap(doc);
  const seen = new Set<string>();
  let current = tokenId.replace(/^var\(/, '').replace(/\)$/, '').trim();

  for (let i = 0; i < 32; i++) {
    const token = map.get(current) ?? map.get(current.replace(/^--/, '')) ?? map.get(cssVarName(current));
    if (!token) throw new ResolveError(`Unknown token “${current}”.`, 'missing');
    if (seen.has(token.id)) throw new ResolveError(`Circular token reference involving “${token.id}”.`, 'cycle');
    seen.add(token.id);
    const v = themeValue(token, themeId);
    if (v.kind === 'raw') {
      if (!v.value.trim()) throw new ResolveError(`Token “${token.id}” has an empty value.`, 'empty');
      return v.value.trim();
    }
    current = v.ref.replace(/^\{|\}$/g, '').replace(/^var\(|\)$/g, '').trim();
  }
  throw new ResolveError(`Circular token reference involving “${tokenId}”.`, 'cycle');
}

/** Prefer CSS var() for aliases so dependents stay live; raw for primitives. */
export function cssExpressionForToken(doc: DesignSystemDocument, token: Token, themeId: string): string {
  const v = themeValue(token, themeId);
  if (v.kind === 'alias') {
    const ref = v.ref.replace(/^\{|\}$/g, '').trim();
    const map = tokenMap(doc);
    const target = map.get(ref) ?? map.get(cssVarName(ref));
    if (target) return `var(${cssVarName(target.path)})`;
  }
  return resolveTokenValue(doc, token.id, themeId);
}

export function findCycles(doc: DesignSystemDocument): string[][] {
  const map = tokenMap(doc);
  const cycles: string[][] = [];
  for (const token of doc.tokens) {
    const path: string[] = [];
    const seen = new Set<string>();
    let current: string | null = token.id;
    while (current) {
      if (seen.has(current)) {
        const i = path.indexOf(current);
        if (i >= 0) cycles.push(path.slice(i).concat(current));
        break;
      }
      seen.add(current);
      path.push(current);
      const t = map.get(current);
      if (!t || t.value.kind !== 'alias') break;
      current = t.value.ref.replace(/^\{|\}$/g, '').trim();
      const next = map.get(current);
      current = next?.id ?? null;
    }
  }
  return cycles;
}
