import { cssVarName, type DesignSystemDocument } from './types';

export type DepNodeKind = 'token' | 'component' | 'file' | 'css-usage';

export interface DepEdge {
  from: string;
  to: string;
  kind: 'alias' | 'uses-token' | 'in-file' | 'var-ref';
}

export interface DependencyGraph {
  edges: DepEdge[];
  /** token id → dependents (tokens, components, files) */
  dependentsOf(tokenId: string): string[];
  /** token id → what it depends on */
  dependenciesOf(tokenId: string): string[];
}

const VAR_RE = /var\(\s*(--[\w-]+)\s*[,)]/g;

export function extractCssVarRefs(css: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(VAR_RE.source, 'g');
  while ((m = re.exec(css))) out.add(m[1]);
  return [...out];
}

export function buildDependencyGraph(doc: DesignSystemDocument, stylesCss = ''): DependencyGraph {
  const edges: DepEdge[] = [];
  const byVar = new Map<string, string>();
  for (const t of doc.tokens) {
    byVar.set(cssVarName(t.path), t.id);
    byVar.set(cssVarName(t.id), t.id);
  }

  for (const t of doc.tokens) {
    if (t.value.kind === 'alias') {
      const ref = t.value.ref.replace(/^\{|\}$/g, '').trim();
      const target = doc.tokens.find((x) => x.id === ref || x.path === ref || cssVarName(x.path) === ref);
      if (target) edges.push({ from: t.id, to: target.id, kind: 'alias' });
    }
    for (const [themeId, v] of Object.entries(t.themes ?? {})) {
      if (v.kind === 'alias') {
        const ref = v.ref.replace(/^\{|\}$/g, '').trim();
        const target = doc.tokens.find((x) => x.id === ref || x.path === ref);
        if (target) edges.push({ from: `${t.id}@${themeId}`, to: target.id, kind: 'alias' });
      }
    }
  }

  for (const c of doc.components) {
    for (const dep of c.tokenDeps) {
      const token = doc.tokens.find((t) => t.id === dep || t.path === dep);
      if (token) edges.push({ from: `component:${c.id}`, to: token.id, kind: 'uses-token' });
    }
    if (c.file) edges.push({ from: `component:${c.id}`, to: `file:${c.file}`, kind: 'in-file' });
  }

  for (const cssVar of extractCssVarRefs(stylesCss)) {
    const tokenId = byVar.get(cssVar);
    if (tokenId) edges.push({ from: 'file:styles', to: tokenId, kind: 'var-ref' });
  }

  const dependentsOf = (tokenId: string) =>
    edges.filter((e) => e.to === tokenId || e.to.startsWith(`${tokenId}@`)).map((e) => e.from);

  const dependenciesOf = (tokenId: string) =>
    edges.filter((e) => e.from === tokenId || e.from.startsWith(`${tokenId}@`)).map((e) => e.to);

  return { edges, dependentsOf, dependenciesOf };
}

/** `data-oc` keys whose open-canvas rules reference a CSS custom property. */
export function styleKeysUsingCssVar(stylesCss: string, cssVar: string): string[] {
  const needle = cssVar.startsWith('--') ? cssVar : `--${cssVar.replace(/^\-+/, '')}`;
  const keys = new Set<string>();
  const re = /\[data-oc=["']([^"']+)["']\][^{]*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stylesCss))) {
    const body = m[2] ?? '';
    if (body.includes(`var(${needle}`) || body.includes(needle)) keys.add(m[1]!);
  }
  return [...keys];
}

export function impactSummary(doc: DesignSystemDocument, tokenId: string, stylesCss = ''): {
  tokenId: string;
  dependentTokens: string[];
  components: string[];
  styleUsages: number;
  /** `data-oc` keys in the styles file that reference this token’s CSS variable. */
  styleKeys: string[];
  cssVar: string;
} {
  const token = doc.tokens.find((t) => t.id === tokenId || t.path === tokenId);
  const resolvedId = token?.id ?? tokenId;
  const cssVar = token ? cssVarName(token.path) : cssVarName(tokenId);
  const g = buildDependencyGraph(doc, stylesCss);
  const dependentTokens = g.dependentsOf(resolvedId).filter((id) => !id.startsWith('component:') && !id.startsWith('file:'));
  const components = g
    .dependentsOf(resolvedId)
    .filter((id) => id.startsWith('component:'))
    .map((id) => id.slice('component:'.length));
  const styleKeys = styleKeysUsingCssVar(stylesCss, cssVar);
  const styleUsages = Math.max(
    g.edges.filter((e) => e.kind === 'var-ref' && e.to === resolvedId).length,
    styleKeys.length,
  );
  return { tokenId: resolvedId, dependentTokens, components, styleUsages, styleKeys, cssVar };
}
