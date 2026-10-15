/** Source transforms for multi-page projects: the managed routes file, wiring it into the entry, and route detection. */
import { componentName, type PageConfig } from '../project-config';
import { applySplices, jsxTagName, parseSource, walk, type AstNode, type Splice } from './ast';

export const ROUTES_MARKER = '// Managed by OpenCanvas: maps URL paths to pages. Plain React, no router dependency.';

export class RoutingError extends Error {}

const posix = {
  dirname: (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''),
  relative(fromDir: string, to: string) {
    const a = fromDir ? fromDir.split('/') : [];
    const b = to.split('/');
    let i = 0;
    while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
    const up = a.length - i;
    const rel = [...Array(up).fill('..'), ...b.slice(i)].join('/');
    return rel.startsWith('.') ? rel : `./${rel}`;
  },
  join(dir: string, rel: string) {
    const parts = dir ? dir.split('/') : [];
    for (const seg of rel.split('/')) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    return parts.join('/');
  },
};

export function routesFileFor(entryFile: string): string {
  const ext = /\.tsx$/.test(entryFile) || /\.ts$/.test(entryFile) ? 'tsx' : 'jsx';
  return `${posix.dirname(entryFile) || 'src'}/routes.${ext}`;
}

/** Component identifiers for each page, unique within the routes file. */
export function routeIdentifiers(pages: PageConfig[]): string[] {
  const used = new Set<string>(['Routes', 'ROUTES']);
  return pages.map((p) => {
    const base = componentName(p.name);
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}${n}`;
    used.add(id);
    return id;
  });
}

export function generateRoutesFile(pages: PageConfig[], routesFile: string): string {
  const dir = posix.dirname(routesFile);
  const isTs = routesFile.endsWith('.tsx');
  const routed = pages.filter((p) => p.file);
  const ids = routeIdentifiers(routed);
  const imports = routed.map((p, i) => `import ${ids[i]} from '${posix.relative(dir, p.file!)}';`);
  const home = ids[routed.findIndex((p) => p.path === '/')] ?? ids[0];
  const entries = routed.map((p, i) => `  '${p.path}': ${ids[i]},`);
  const typeImport = isTs ? [`import type { ComponentType } from 'react';`] : [];
  const mapType = isTs ? ': Record<string, ComponentType>' : '';
  return [
    ROUTES_MARKER,
    ...typeImport,
    ...imports,
    '',
    `const ROUTES${mapType} = {`,
    ...entries,
    '};',
    '',
    'export default function Routes() {',
    `  const path = window.location.pathname.replace(/\\/+$/, '') || '/';`,
    `  const Page = ROUTES[path] ?? ${home};`,
    '  return <Page />;',
    '}',
    '',
  ].join('\n');
}

export const isManagedRoutes = (code: string) => code.startsWith(ROUTES_MARKER);

/**
 * Makes the entry render `<Routes />` instead of the home component: finds the JSX element whose
 * name is the default import of `homeFile`, swaps it and its import. Refuses anything it can't do exactly.
 */
export function wireRoutesIntoEntry(code: string, entryFile: string, homeFile: string, routesFile: string): string {
  let ast: AstNode;
  try {
    ast = parseSource(code, entryFile);
  } catch (err) {
    throw new RoutingError(`${entryFile} has a syntax error: ${(err as Error).message}`);
  }
  const dir = posix.dirname(entryFile);
  const stripExt = (p: string) => p.replace(/\.(m?[jt]sx?)$/, '');
  const homeImport = (ast.program.body as AstNode[]).find((node) => {
    if (node.type !== 'ImportDeclaration' || typeof node.source.value !== 'string' || !node.source.value.startsWith('.')) return false;
    return stripExt(posix.join(dir, node.source.value)) === stripExt(homeFile) && node.specifiers.some((s: AstNode) => s.type === 'ImportDefaultSpecifier');
  });
  if (!homeImport) throw new RoutingError(`${entryFile} doesn't import ${homeFile}, so OpenCanvas can't add pages automatically.`);
  const local: string = homeImport.specifiers.find((s: AstNode) => s.type === 'ImportDefaultSpecifier').local.name;

  const usages: AstNode[] = [];
  let otherRefs = 0;
  walk(ast, (node, parent) => {
    if (node.type === 'JSXOpeningElement' && jsxTagName(node.name) === local) usages.push(node);
    if (node.type === 'Identifier' && node.name === local && parent?.type !== 'ImportDefaultSpecifier') otherRefs++;
  });
  if (usages.length !== 1 || !usages[0].selfClosing || usages[0].attributes.length) {
    throw new RoutingError(`${entryFile} renders <${local}> in a way OpenCanvas can't rewrite safely. Render <${local} /> once, or add pages in code.`);
  }
  if (otherRefs) throw new RoutingError(`${entryFile} uses ${local} outside JSX, so OpenCanvas can't add pages automatically.`);

  const rel = posix.relative(dir, routesFile);
  const splices: Splice[] = [{ start: usages[0].start, end: usages[0].end, text: '<Routes />' }];
  if (homeImport.specifiers.length === 1) {
    splices.push({ start: homeImport.start, end: homeImport.end, text: `import Routes from '${rel}';` });
  } else {
    const spec = homeImport.specifiers.find((s: AstNode) => s.type === 'ImportDefaultSpecifier');
    const after = code.slice(spec.end).match(/^\s*,\s*/)?.[0] ?? '';
    splices.push({ start: spec.start, end: spec.end + after.length, text: '' });
    splices.push({ start: homeImport.end, end: homeImport.end, text: `\nimport Routes from '${rel}';` });
  }
  return applySplices(code, splices);
}

/** Rewrites relative import paths so a copied file still resolves from its new folder. */
export function rebaseImports(code: string, fromFile: string, toFile: string): string {
  let ast: AstNode;
  try {
    ast = parseSource(code, fromFile);
  } catch (err) {
    throw new RoutingError(`${fromFile} has a syntax error: ${(err as Error).message}`);
  }
  const fromDir = posix.dirname(fromFile);
  const toDir = posix.dirname(toFile);
  if (fromDir === toDir) return code;
  const splices: Splice[] = [];
  walk(ast, (node) => {
    const source = node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration' ? node.source : node.type === 'ImportExpression' ? node.source : null;
    if (!source || source.type !== 'StringLiteral' || !source.value.startsWith('.')) return;
    const target = posix.join(fromDir, source.value);
    const quote = code[source.start];
    splices.push({ start: source.start, end: source.end, text: `${quote}${posix.relative(toDir, target)}${quote}` });
  });
  return applySplices(code, splices);
}

/** A fresh page component, styled like the blank template's page. */
export function newPageSource(component: string, title: string): string {
  const safe = title.replace(/[{}<>]/g, '');
  return `export default function ${component}() {
  return (
    <main className="page" data-oc-name="${component} page">
      <h1>${safe}</h1>
    </main>
  );
}
`;
}

export interface DetectedRoute {
  /** Full URL path; dynamic segments stay as ":name". */
  path: string;
  /** Component the route renders, when written as `element={<X />}` or `Component={X}`. */
  component: string | null;
  /** Where that component is imported from in the same file, if it is. */
  importSource: string | null;
}

const ROUTE_KEYS = ['element', 'Component', 'lazy', 'children', 'index'];

function joinRoute(base: string, rel: string): string {
  const full = rel.startsWith('/') ? rel : `${base.replace(/\/+$/, '')}/${rel}`;
  return full.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1') || '/';
}

/**
 * Routes in a React Router project: `<Route>` elements and route objects, with nested and index routes
 * resolved against their parents. Splats and optional segments can't be previewed directly, so they're left out.
 */
export function detectRoutes(code: string, filename: string): DetectedRoute[] {
  let ast: AstNode;
  try {
    ast = parseSource(code, filename);
  } catch {
    return [];
  }
  const imports = new Map<string, string>();
  for (const node of ast.program.body as AstNode[]) {
    if (node.type !== 'ImportDeclaration' || typeof node.source.value !== 'string') continue;
    for (const s of node.specifiers) imports.set(s.local.name, node.source.value);
  }
  const found: DetectedRoute[] = [];
  const seen = new Set<AstNode>();
  const add = (path: string, component: string | null) => {
    if (/[*?]/.test(path)) return;
    found.push({ path, component, importSource: component ? (imports.get(component.split('.')[0]) ?? null) : null });
  };
  const elementName = (node: AstNode | undefined): string | null => {
    if (!node) return null;
    if (node.type === 'JSXElement') return jsxTagName(node.openingElement.name);
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'MemberExpression' && node.object.type === 'Identifier' && node.property.type === 'Identifier') return `${node.object.name}.${node.property.name}`;
    return null;
  };

  const visitJsx = (el: AstNode, base: string) => {
    seen.add(el);
    let next = base;
    if (el.type === 'JSXElement' && jsxTagName(el.openingElement.name) === 'Route') {
      const attrs = el.openingElement.attributes.filter((a: AstNode) => a.type === 'JSXAttribute');
      const attr = (name: string) => attrs.find((a: AstNode) => a.name?.name === name);
      const pathAttr = attr('path')?.value;
      const value = pathAttr?.type === 'StringLiteral' ? pathAttr.value : null;
      const element = attr('element')?.value?.expression ?? attr('Component')?.value?.expression;
      if (value !== null) next = joinRoute(base, value);
      if (value !== null || attr('index')) add(next, elementName(element));
    }
    for (const child of el.children ?? []) if (child.type === 'JSXElement' || child.type === 'JSXFragment') visitJsx(child, next);
  };

  const prop = (obj: AstNode, name: string) => obj.properties.find((p: AstNode) => p.type === 'ObjectProperty' && (p.key?.name === name || p.key?.value === name));
  const isRouteObject = (obj: AstNode) => obj.type === 'ObjectExpression' && obj.properties.some((p: AstNode) => p.type === 'ObjectProperty' && ['path', ...ROUTE_KEYS].includes(p.key?.name)) && (!!prop(obj, 'path') || !!prop(obj, 'index'));
  const visitObject = (obj: AstNode, base: string) => {
    seen.add(obj);
    const pathValue = prop(obj, 'path')?.value;
    const value = pathValue?.type === 'StringLiteral' ? pathValue.value : null;
    const next = value !== null ? joinRoute(base, value) : base;
    const hasRoute = obj.properties.some((p: AstNode) => p.type === 'ObjectProperty' && ROUTE_KEYS.includes(p.key?.name));
    if (hasRoute && (value !== null || prop(obj, 'index')?.value?.value === true)) add(next, elementName(prop(obj, 'element')?.value ?? prop(obj, 'Component')?.value));
    const children = prop(obj, 'children')?.value;
    if (children?.type === 'ArrayExpression') for (const c of children.elements) if (c?.type === 'ObjectExpression') visitObject(c, next);
  };

  walk(ast, (node) => {
    if (seen.has(node)) return false;
    if (node.type === 'JSXElement' && jsxTagName(node.openingElement.name) === 'Route') {
      visitJsx(node, '/');
      return false;
    }
    if (node.type === 'ObjectExpression' && isRouteObject(node)) {
      visitObject(node, '/');
      return false;
    }
  });
  const unique = new Map<string, DetectedRoute>();
  for (const r of found) if (!unique.has(r.path) || (!unique.get(r.path)!.component && r.component)) unique.set(r.path, r);
  return [...unique.values()];
}

/** Paths only, see `detectRoutes`. */
export function detectRouterPaths(code: string, filename: string): string[] {
  return detectRoutes(code, filename).map((r) => r.path);
}

/** Route path for a Next.js page/app file, or null for files that aren't pages. */
export function nextRouteFor(rel: string): string | null {
  const app = /^(?:src\/)?app\/(.*?)\/?page\.(?:tsx|jsx|ts|js|mdx)$/.exec(rel);
  const pages = /^(?:src\/)?pages\/(.+)\.(?:tsx|jsx|ts|js|mdx)$/.exec(rel);
  let segments: string[];
  if (app) segments = app[1] ? app[1].split('/') : [];
  else if (pages && !/^(api\/|_)/.test(pages[1])) segments = pages[1].split('/').filter((s) => s !== 'index');
  else return null;
  const visible = segments.filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@'));
  if (visible.some((s) => s.includes('[') && !/^\[{1,2}(\.\.\.)?[\w-]+\]{1,2}$/.test(s))) return null;
  return `/${visible.join('/')}`.replace(/\/$/, '') || '/';
}

/** Dynamic segment names in a route like "/blog/[slug]", "/docs/[...path]" or "/users/:id". Optional catch-alls are left out. */
export function routeParams(route: string): string[] {
  return route
    .split('/')
    .filter((s) => /^\[(\.\.\.)?[\w-]+\]$/.test(s) || /^:[\w-]+$/.test(s))
    .map((s) => s.replace(/^\[(\.\.\.)?|\]$|^:/g, ''));
}

/** Whether a visited path is covered by a route pattern ("/users/:id", "/blog/[slug]", "/docs/[...path]"). */
export function routeMatches(route: string, visited: string): boolean {
  const a = route.split('/').filter(Boolean);
  const b = visited.split('/').filter(Boolean);
  for (let i = 0; i < a.length; i++) {
    if (/^\[\[?\.\.\./.test(a[i])) return /^\[\[/.test(a[i]) || b.length > i;
    if (b[i] === undefined) return false;
    if (/^(\[[\w-]+\]|:[\w-]+)$/.test(a[i])) continue;
    if (a[i] !== b[i]) return false;
  }
  return a.length === b.length;
}

/** Visited paths that none of the known routes cover: found at runtime, never guessed. */
export function runtimeOnlyPaths(routes: string[], visited: string[]): string[] {
  return visited.filter((v) => !routes.some((r) => routeMatches(r, v)));
}

/** A real URL path for a dynamic route, or null while any required example value is missing. */
export function fillRoute(route: string, values: Record<string, string> = {}): string | null {
  const parts: string[] = [];
  for (const seg of route.split('/').filter(Boolean)) {
    const optional = /^\[\[\.\.\.([\w-]+)\]\]$/.exec(seg);
    const required = /^\[(\.\.\.)?([\w-]+)\]$/.exec(seg) ?? /^:()([\w-]+)$/.exec(seg);
    const name = optional?.[1] ?? required?.[2];
    if (!name) {
      parts.push(seg);
      continue;
    }
    const value = (values[name] ?? '').trim().replace(/^\/+|\/+$/g, '');
    if (!value) {
      if (optional) continue;
      return null;
    }
    const catchAll = !!optional || !!required?.[1];
    parts.push(catchAll ? value.split('/').map(encodeURIComponent).join('/') : encodeURIComponent(value));
  }
  return `/${parts.join('/')}`;
}
