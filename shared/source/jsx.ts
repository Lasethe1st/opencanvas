import type { InsertKind, TextReason } from '../types';
import {
  applySplices,
  isHostTag,
  jsxTagName,
  offsetToLineCol,
  parseSource,
  walk,
  type AstNode,
  type Splice,
} from './ast';

export class EditError extends Error {}

export interface LocatedElement {
  element: AstNode;
  parent: AstNode | null;
  tag: string;
}

const CONTAINER_TAGS = new Set([
  'div', 'section', 'main', 'header', 'footer', 'nav', 'article', 'aside', 'form', 'ul', 'ol', 'li',
  'figure', 'fieldset', 'label', 'body',
]);

export const VOID_TAGS = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'area', 'col', 'embed', 'track', 'wbr']);

export function locateElement(code: string, filename: string, line: number, column: number): LocatedElement {
  let ast: AstNode;
  try {
    ast = parseSource(code, filename);
  } catch (err) {
    throw new EditError(`Could not parse ${filename}: ${(err as Error).message}`);
  }
  let found: LocatedElement | null = null;
  walk(ast, (node, parent) => {
    if (found) return false;
    if (node.type === 'JSXElement') {
      const start = node.openingElement.loc.start;
      if (start.line === line && start.column === column) {
        found = { element: node, parent, tag: jsxTagName(node.openingElement.name) ?? '' };
        return false;
      }
    }
  });
  if (!found) throw new EditError('The selected element could not be found in the source. The file may have changed; reselect the element.');
  return found;
}

function findAttr(element: AstNode, name: string): AstNode | null {
  for (const attr of element.openingElement.attributes as AstNode[]) {
    if (attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier' && attr.name.name === name) return attr;
  }
  return null;
}

/** Returns the attribute's literal value or null when it is dynamic/absent. */
export function attrLiteral(attr: AstNode | null): string | null {
  if (!attr) return null;
  const value = attr.value;
  if (!value) return 'true';
  if (value.type === 'StringLiteral') return value.value;
  if (value.type === 'JSXExpressionContainer') {
    const expr = value.expression;
    if (expr.type === 'StringLiteral') return expr.value;
    if (expr.type === 'NumericLiteral') return String(expr.value);
    if (expr.type === 'TemplateLiteral' && expr.expressions.length === 0) return expr.quasis[0].value.cooked;
  }
  return null;
}

export function readAttributes(element: AstNode): Record<string, string> {
  const result: Record<string, string> = {};
  for (const attr of element.openingElement.attributes as AstNode[]) {
    if (attr.type !== 'JSXAttribute' || attr.name.type !== 'JSXIdentifier') continue;
    const literal = attrLiteral(attr);
    if (literal !== null) result[attr.name.name] = literal;
  }
  return result;
}

function jsxAttrValue(value: string): string {
  return /["{}\n]/.test(value) ? `{${JSON.stringify(value)}}` : `"${value}"`;
}

function setAttrSplice(element: AstNode, name: string, value: string | null): Splice | null {
  const attr = findAttr(element, name);
  if (attr) {
    if (value === null) {
      return { start: attr.start - 1, end: attr.end, text: '' };
    }
    if (attr.value && attrLiteral(attr) === null) {
      throw new EditError(`"${name}" is set by an expression in the source and can't be edited visually.`);
    }
    return { start: attr.start, end: attr.end, text: `${name}=${jsxAttrValue(value)}` };
  }
  if (value === null) return null;
  const nameEnd = element.openingElement.name.end;
  return { start: nameEnd, end: nameEnd, text: ` ${name}=${jsxAttrValue(value)}` };
}

export function setAttribute(code: string, filename: string, line: number, column: number, name: string, value: string | null): string {
  const { element } = locateElement(code, filename, line, column);
  const splice = setAttrSplice(element, name, value);
  return splice ? applySplices(code, [splice]) : code;
}

export function makeKey(tag: string): string {
  return `${tag}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Ensures the element carries a `data-oc` style key and returns it. */
export function ensureStyleKey(code: string, filename: string, line: number, column: number): { code: string; key: string; tag: string } {
  const { element, tag } = locateElement(code, filename, line, column);
  if (!isHostTag(tag)) throw new EditError('Only HTML elements can be styled visually in this version.');
  const attr = findAttr(element, 'data-oc');
  const existing = attrLiteral(attr);
  if (attr && existing) return { code, key: existing, tag };
  if (attr) throw new EditError('This element uses a dynamic data-oc value and cannot be styled safely.');
  const key = makeKey(tag);
  const splice = setAttrSplice(element, 'data-oc', key)!;
  return { code: applySplices(code, [splice]), key, tag };
}

const isLineBreak = (node: AstNode) =>
  node.type === 'JSXElement' &&
  node.openingElement.name.type === 'JSXIdentifier' &&
  node.openingElement.name.name === 'br' &&
  node.openingElement.attributes.length === 0 &&
  node.children.length === 0;

/**
 * Plain text content of an element. Text, string literals and bare `<br />` line breaks are editable;
 * anything else (nested elements, expressions) is reported with a reason.
 */
export function readText(element: AstNode): { text: string | null; editable: boolean; reason: TextReason } {
  const children = element.children as AstNode[];
  if (children.length === 0) {
    const selfClosing = !!element.openingElement.selfClosing;
    return { text: '', editable: !selfClosing, reason: selfClosing ? 'self-closing' : 'plain' };
  }
  let text = '';
  for (const child of children) {
    if (child.type === 'JSXText') text += child.value.replace(/\s+/g, ' ');
    else if (child.type === 'JSXExpressionContainer' && child.expression.type === 'StringLiteral') text += child.expression.value;
    else if (child.type === 'JSXExpressionContainer' && child.expression.type === 'JSXEmptyExpression') continue;
    else if (isLineBreak(child)) text += '\n';
    else if (child.type === 'JSXElement' || child.type === 'JSXFragment') return { text: null, editable: false, reason: 'nested' };
    else return { text: null, editable: false, reason: 'expression' };
  }
  const lines = text.split('\n').map((l) => l.trim());
  return { text: lines.join('\n').replace(/^\n+|\n+$/g, ''), editable: true, reason: 'plain' };
}

/** JSX source for plain text: risky characters become string literals and newlines become `<br />`. */
export function encodeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (/[{}<>&]/.test(line) || /^\s|\s$/.test(line) ? `{${JSON.stringify(line)}}` : line))
    .join('<br />');
}

export function setText(code: string, filename: string, line: number, column: number, text: string): string {
  const { element, tag } = locateElement(code, filename, line, column);
  if (VOID_TAGS.has(tag)) throw new EditError(`<${tag}> elements can't contain text.`);
  const { editable } = readText(element);
  if (!editable || !element.closingElement) {
    throw new EditError('This element contains nested elements or expressions; edit its text in code view.');
  }
  return applySplices(code, [{ start: element.openingElement.end, end: element.closingElement.start, text: encodeText(text) }]);
}

function lineIndent(code: string, offset: number): string {
  const lineStart = code.lastIndexOf('\n', offset - 1) + 1;
  const match = /^[ \t]*/.exec(code.slice(lineStart));
  return match ? match[0] : '';
}

function onlyWhitespaceBefore(code: string, offset: number): boolean {
  const lineStart = code.lastIndexOf('\n', offset - 1) + 1;
  return code.slice(lineStart, offset).trim() === '';
}

function isJsxParent(node: AstNode | null): boolean {
  return !!node && (node.type === 'JSXElement' || node.type === 'JSXFragment');
}

function indentSnippet(snippet: string, indent: string): string {
  return snippet
    .split('\n')
    .map((l, i) => (i === 0 ? l : indent + l))
    .join('\n');
}

export interface InsertSnippet {
  jsx: string;
  key: string;
  css: Record<string, string>;
  needsPlaceholder?: boolean;
}

export function buildSnippet(kind: InsertKind): InsertSnippet {
  const key = makeKey(kind);
  const k = `data-oc="${key}"`;
  switch (kind) {
    case 'div':
      return { key, jsx: `<div ${k} data-oc-name="Container">\n</div>`, css: { padding: '24px', 'min-height': '80px', border: '1px dashed #c7c7cc', 'border-radius': '8px' } };
    case 'section':
      return { key, jsx: `<section ${k} data-oc-name="Section">\n  <h2>New section</h2>\n</section>`, css: { padding: '64px 32px' } };
    case 'flex':
      return { key, jsx: `<div ${k} data-oc-name="Flex row">\n</div>`, css: { display: 'flex', gap: '16px', padding: '16px', 'min-height': '64px', border: '1px dashed #c7c7cc', 'border-radius': '8px' } };
    case 'grid':
      return {
        key,
        jsx: `<div ${k} data-oc-name="Grid">\n  <div>Item 1</div>\n  <div>Item 2</div>\n  <div>Item 3</div>\n</div>`,
        css: { display: 'grid', 'grid-template-columns': 'repeat(3, minmax(0, 1fr))', gap: '16px', padding: '16px' },
      };
    case 'heading':
      return { key, jsx: `<h2 ${k}>New heading</h2>`, css: { margin: '0 0 12px' } };
    case 'paragraph':
      return { key, jsx: `<p ${k}>Write something here.</p>`, css: { margin: '0 0 12px', 'line-height': '1.6' } };
    case 'image':
      return { key, jsx: `<img ${k} src="/placeholder.svg" alt="Placeholder image" />`, css: { display: 'block', width: '320px', 'max-width': '100%', height: 'auto', 'border-radius': '8px' }, needsPlaceholder: true };
    case 'button':
      return { key, jsx: `<button ${k} type="button">Button</button>`, css: { padding: '10px 18px', border: 'none', 'border-radius': '8px', background: '#111111', color: '#ffffff', 'font-weight': '600', cursor: 'pointer' } };
    case 'link':
      return { key, jsx: `<a ${k} href="#">Link</a>`, css: { color: '#2563eb' } };
  }
}

/**
 * Inserts a JSX snippet inside `target` (when it is a container) or after it.
 * Returns the new source and the offset where the inserted element starts.
 */
export function insertElement(code: string, filename: string, line: number, column: number, snippet: string): { code: string; offset: number } {
  const { element, parent, tag } = locateElement(code, filename, line, column);
  const asChild = isHostTag(tag) && CONTAINER_TAGS.has(tag) && !element.openingElement.selfClosing && element.closingElement;
  if (asChild) {
    const closeStart: number = element.closingElement.start;
    if (onlyWhitespaceBefore(code, closeStart)) {
      const closeIndent = lineIndent(code, closeStart);
      const lineStart = code.lastIndexOf('\n', closeStart - 1) + 1;
      const body = `${closeIndent}  ${indentSnippet(snippet, closeIndent + '  ')}\n`;
      return { code: applySplices(code, [{ start: lineStart, end: lineStart, text: body }]), offset: lineStart + closeIndent.length + 2 };
    }
    const indent = lineIndent(code, element.start);
    const text = `\n${indent}  ${indentSnippet(snippet, indent + '  ')}\n${indent}`;
    const hasOnlyWhitespaceChildren = (element.children as AstNode[]).every((c) => c.type === 'JSXText' && c.value.trim() === '');
    if (hasOnlyWhitespaceChildren) {
      return {
        code: applySplices(code, [{ start: element.openingElement.end, end: closeStart, text }]),
        offset: element.openingElement.end + indent.length + 3,
      };
    }
    return { code: applySplices(code, [{ start: closeStart, end: closeStart, text }]), offset: closeStart + indent.length + 3 };
  }
  if (!isJsxParent(parent)) {
    throw new EditError('Select a container element (such as a div or section) to insert into. The component root cannot have siblings.');
  }
  const indent = lineIndent(code, element.start);
  const text = `\n${indent}${indentSnippet(snippet, indent)}`;
  return { code: applySplices(code, [{ start: element.end, end: element.end, text }]), offset: element.end + 1 + indent.length };
}

export function removeElement(code: string, filename: string, line: number, column: number): { code: string; parentOffset: number | null } {
  const { element, parent } = locateElement(code, filename, line, column);
  if (!isJsxParent(parent)) throw new EditError('The root element of a component cannot be removed visually. Edit it in code view.');
  let start: number = element.start;
  let end: number = element.end;
  const lineStart = code.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = code.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? code.length : nextBreak + 1;
  if (code.slice(lineStart, start).trim() === '' && code.slice(end, lineEnd).trim() === '') {
    start = lineStart;
    end = lineEnd;
  }
  const parentOffset = parent!.type === 'JSXElement' ? parent!.openingElement.start : null;
  return { code: applySplices(code, [{ start, end, text: '' }]), parentOffset };
}

export function moveElement(code: string, filename: string, line: number, column: number, direction: 'up' | 'down'): { code: string; offset: number } {
  const { element, parent } = locateElement(code, filename, line, column);
  if (!isJsxParent(parent)) throw new EditError('This element has no siblings to reorder with.');
  const siblings = parent!.children as AstNode[];
  const index = siblings.indexOf(element);
  const step = direction === 'up' ? -1 : 1;
  let j = index + step;
  while (j >= 0 && j < siblings.length && siblings[j].type === 'JSXText' && siblings[j].value.trim() === '') j += step;
  const other = siblings[j];
  if (!other || other.type !== 'JSXElement') {
    throw new EditError(direction === 'up' ? 'Element is already first in its container.' : 'Element is already last in its container.');
  }
  const [a, b] = direction === 'up' ? [other, element] : [element, other];
  const aText = code.slice(a.start, a.end);
  const between = code.slice(a.end, b.start);
  const bText = code.slice(b.start, b.end);
  const next = code.slice(0, a.start) + bText + between + aText + code.slice(b.end);
  const offset = direction === 'up' ? a.start : a.start + bText.length + between.length;
  return { code: next, offset };
}

export function idAtOffset(relPath: string, code: string, offset: number): string {
  const { line, column } = offsetToLineCol(code, offset);
  return `${relPath}:${line}:${column}`;
}

export interface JsxIdInjection {
  code: string;
  changed: boolean;
}

/**
 * Adds `data-oc-id` attributes to host JSX elements so the preview can map
 * DOM nodes back to their source location. Used only in the preview server;
 * the project files are never modified by this.
 */
export function injectSourceIds(code: string, filename: string, relPath: string): JsxIdInjection {
  if (!code.includes('<')) return { code, changed: false };
  let ast: AstNode;
  try {
    ast = parseSource(code, filename);
  } catch {
    return { code, changed: false };
  }
  const splices: Splice[] = [];
  walk(ast, (node) => {
    if (node.type !== 'JSXElement') return;
    const opening = node.openingElement;
    const tag = jsxTagName(opening.name);
    if (!isHostTag(tag)) return;
    const { line, column } = opening.loc.start;
    splices.push({ start: opening.name.end, end: opening.name.end, text: ` data-oc-id="${relPath}:${line}:${column}"` });
  });
  if (splices.length === 0) return { code, changed: false };
  return { code: applySplices(code, splices), changed: true };
}
