/** Design-system import: CSS custom properties or W3C / Style Dictionary token JSON, flattened to name → value. */
import postcss from 'postcss';

export class TokenImportError extends Error {}

const MAX_TOKENS = 600;

/** Custom properties declared on global selectors (:root, html, body, [data-theme…]). */
export function parseCssTokens(css: string): Record<string, string> {
  let root: postcss.Root;
  try {
    root = postcss.parse(css);
  } catch (err) {
    throw new TokenImportError(`The CSS file couldn't be read: ${(err as Error).message}`);
  }
  const tokens: Record<string, string> = {};
  root.walkDecls((decl) => {
    if (!decl.prop.startsWith('--')) return;
    const rule = decl.parent;
    if (!rule || rule.type !== 'rule') return;
    const selector = (rule as postcss.Rule).selector;
    if (!/(^|,)\s*(:root|html|body|\[data-theme[^\]]*\]|\.dark|\.light)\s*(,|$)/.test(selector)) return;
    const key = /\[data-theme|\.dark|\.light/.test(selector) && !/:root|html/.test(selector) ? `${decl.prop} (${selector.trim()})` : decl.prop;
    if (Object.keys(tokens).length < MAX_TOKENS && !(key in tokens)) tokens[key] = decl.value.trim();
  });
  if (!Object.keys(tokens).length) throw new TokenImportError('No design tokens found. The CSS file needs custom properties such as --color-primary on :root.');
  return tokens;
}

/** Nested token groups; a token is any object with `$value` (W3C) or `value` (Style Dictionary). */
export function parseJsonTokens(json: string): Record<string, string> {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (err) {
    throw new TokenImportError(`The JSON file couldn't be read: ${(err as Error).message}`);
  }
  const tokens: Record<string, string> = {};
  const visit = (node: unknown, trail: string[]) => {
    if (!node || typeof node !== 'object' || Object.keys(tokens).length >= MAX_TOKENS) return;
    const obj = node as Record<string, unknown>;
    const value = '$value' in obj ? obj.$value : 'value' in obj && typeof obj.value !== 'object' ? obj.value : undefined;
    if (value !== undefined && trail.length) {
      tokens[trail.join('.')] = typeof value === 'string' ? value : JSON.stringify(value);
      return;
    }
    for (const [key, child] of Object.entries(obj)) if (!key.startsWith('$')) visit(child, [...trail, key]);
  };
  visit(data, []);
  if (!Object.keys(tokens).length) throw new TokenImportError('No design tokens found. OpenCanvas reads W3C design tokens ($value) or Style Dictionary files (value).');
  return tokens;
}
