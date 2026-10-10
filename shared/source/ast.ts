import { parse } from '@babel/parser';

/* Babel nodes are handled structurally to avoid depending on @babel/types. */
export interface AstNode {
  type: string;
  start: number;
  end: number;
  loc: { start: { line: number; column: number }; end: { line: number; column: number } };
  [key: string]: any;
}

export function parseSource(code: string, filename: string): AstNode {
  const isTs = /\.tsx?$/.test(filename);
  const ast = parse(code, {
    sourceType: 'module',
    plugins: isTs ? ['jsx', 'typescript'] : ['jsx'],
    errorRecovery: false,
  });
  return ast as unknown as AstNode;
}

export function walk(
  node: AstNode,
  visit: (node: AstNode, parent: AstNode | null) => boolean | void,
  parent: AstNode | null = null,
): void {
  if (visit(node, parent) === false) return;
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'extra') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') walk(child, visit, node);
      }
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walk(value, visit, node);
    }
  }
}

export function jsxTagName(name: AstNode): string | null {
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') {
    const object = jsxTagName(name.object);
    return object ? `${object}.${name.property.name}` : null;
  }
  return null;
}

export function isHostTag(tag: string | null): tag is string {
  return !!tag && /^[a-z][a-z0-9-]*$/.test(tag);
}

export function makeSourceId(relPath: string, line: number, column: number): string {
  return `${relPath}:${line}:${column}`;
}

export function parseSourceId(id: string): { file: string; line: number; column: number } | null {
  const match = /^(.*):(\d+):(\d+)$/.exec(id);
  if (!match) return null;
  return { file: match[1], line: Number(match[2]), column: Number(match[3]) };
}

export function offsetToLineCol(code: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < offset; i++) {
    if (code.charCodeAt(i) === 10) {
      line++;
      lastBreak = i;
    }
  }
  return { line, column: offset - lastBreak - 1 };
}

export interface Splice {
  start: number;
  end: number;
  text: string;
}

export function applySplices(code: string, splices: Splice[]): string {
  const sorted = [...splices].sort((a, b) => b.start - a.start);
  let out = code;
  for (const s of sorted) out = out.slice(0, s.start) + s.text + out.slice(s.end);
  return out;
}
