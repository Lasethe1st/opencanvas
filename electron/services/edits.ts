import fs from 'node:fs';
import path from 'node:path';
import { ensureGoogleFontLink, isGoogleFamilyParam } from '../../shared/fonts';
import { parseSourceId } from '../../shared/source/ast';
import { copyElementStyles, readElementStyles, setElementStyle } from '../../shared/source/css';
import {
  EditError,
  attrLiteral,
  buildSnippet,
  duplicateElement,
  unwrapElement,
  wrapElements,
  ensureStyleKey,
  idAtOffset,
  insertElement,
  locateElement,
  moveElement,
  normalizeJsxSnippet,
  readAttributes,
  readText,
  removeElement,
  replaceElementJsx,
  setAttribute,
  setTagName,
  setText,
} from '../../shared/source/jsx';

export { replaceElementJsx };
import type { EditCommand, EditResult, FileChange, ProjectInfo, SourceElementInfo } from '../../shared/types';
import { safeResolve } from './project';

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <rect width="640" height="400" fill="#eceef1"/>
  <path d="M250 250l60-70 45 50 30-30 55 50z" fill="#c4c9d1"/>
  <circle cx="400" cy="160" r="22" fill="#c4c9d1"/>
</svg>
`;

const EDITABLE_ATTRIBUTES = new Set(['src', 'alt', 'href', 'target', 'rel', 'type', 'placeholder', 'name', 'value', 'title', 'id', 'data-oc-name']);

/** Collects file writes so an edit applies atomically and can be undone. */
class ChangeSet {
  private files = new Map<string, { before: string | null; after: string | null }>();

  constructor(private root: string) {}

  read(rel: string): string | null {
    const pending = this.files.get(rel);
    if (pending) return pending.after;
    const abs = safeResolve(this.root, rel);
    return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  }

  write(rel: string, content: string): void {
    const existing = this.files.get(rel);
    if (existing) {
      existing.after = content;
      return;
    }
    const before = this.read(rel);
    if (before === content) return;
    this.files.set(rel, { before, after: content });
  }

  commit(): FileChange[] {
    const changes: FileChange[] = [];
    for (const [rel, { before, after }] of this.files) {
      if (before === after) continue;
      changes.push({ path: rel, before, after });
    }
    writeChanges(this.root, changes, 'after');
    return changes;
  }
}

function writeChanges(root: string, changes: FileChange[], side: 'before' | 'after'): void {
  const written: FileChange[] = [];
  try {
    for (const change of changes) {
      const abs = safeResolve(root, change.path);
      const content = change[side];
      if (content === null) {
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } else {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, 'utf8');
      }
      written.push(change);
    }
  } catch (err) {
    const other = side === 'after' ? 'before' : 'after';
    for (const change of written.reverse()) {
      try {
        const abs = safeResolve(root, change.path);
        const content = change[other];
        if (content === null) fs.rmSync(abs, { force: true });
        else fs.writeFileSync(abs, content, 'utf8');
      } catch {
        /* best-effort rollback */
      }
    }
    throw err;
  }
}

/** Undo (write `before`) or redo (write `after`), refusing if files changed in between. */
const TEXT_FILE = /\.(jsx?|tsx?|mjs|cjs|css|scss|less|html?|json|md|mdx|txt|svg|xml|ya?ml|env.*|gitignore|npmrc)$/i;

function collectFiles(root: string, rel: string): string[] {
  const abs = safeResolve(root, rel);
  if (!fs.statSync(abs).isDirectory()) return [rel];
  return fs.readdirSync(abs).flatMap((name) => collectFiles(root, `${rel}/${name}`));
}

/**
 * Deletes (to === null) or moves a file or folder. Text files are recorded as FileChanges so the
 * operation can be undone; folders containing binary files are moved without history.
 */
export function relocate(root: string, from: string, to: string | null): { changes: FileChange[]; undoable: boolean } {
  const fromAbs = safeResolve(root, from);
  if (!fs.existsSync(fromAbs)) throw new EditError(`${from} no longer exists.`);
  if (to !== null) {
    const toAbs = safeResolve(root, to);
    if (fs.existsSync(toAbs)) throw new EditError(`${to} already exists.`);
  }
  const files = collectFiles(root, from);
  const undoable = files.every((f) => TEXT_FILE.test(path.posix.basename(f)) || path.posix.basename(f).startsWith('.'));
  if (!undoable) {
    if (to === null) {
      fs.rmSync(fromAbs, { recursive: true, force: true });
    } else {
      const toAbs = safeResolve(root, to);
      fs.mkdirSync(path.dirname(toAbs), { recursive: true });
      fs.renameSync(fromAbs, toAbs);
    }
    return { changes: [], undoable: false };
  }
  const changes: FileChange[] = [];
  for (const file of files) {
    const content = fs.readFileSync(safeResolve(root, file), 'utf8');
    changes.push({ path: file, before: content, after: null });
    if (to !== null) changes.push({ path: to + file.slice(from.length), before: null, after: content });
  }
  writeChanges(root, changes, 'after');
  if (fs.existsSync(fromAbs) && fs.statSync(fromAbs).isDirectory()) fs.rmSync(fromAbs, { recursive: true, force: true });
  if (to !== null && files.length === 0) fs.mkdirSync(safeResolve(root, to), { recursive: true });
  return { changes, undoable: true };
}

export function revertChanges(root: string, changes: FileChange[], direction: 'undo' | 'redo'): { ok: boolean; error?: string } {
  const expected = direction === 'undo' ? 'after' : 'before';
  for (const change of changes) {
    const abs = safeResolve(root, change.path);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (current !== change[expected]) {
      return { ok: false, error: `${change.path} was modified outside this history step, so it was left unchanged.` };
    }
  }
  try {
    writeChanges(root, changes, direction === 'undo' ? 'before' : 'after');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function requireId(id: string) {
  const parsed = parseSourceId(id);
  if (!parsed) throw new EditError(`Invalid element reference: ${id}`);
  return parsed;
}

function relativeImport(fromFile: string, toFile: string): string {
  let rel = path.posix.relative(path.posix.dirname(fromFile), toFile);
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function ensureStylesheet(set: ChangeSet, project: ProjectInfo): string {
  const css = set.read(project.stylesFile);
  if (css === null) set.write(project.stylesFile, '/* Styles written by visual edits. Plain CSS: safe to edit by hand. */\n');
  if (!project.entryFile) {
    throw new EditError(
      project.framework === 'next'
        ? 'Could not find app/layout or pages/_app to import the visual styles stylesheet. Add one to edit styles visually.'
        : 'Could not find the app entry file to import the visual styles stylesheet. Add a module script to index.html.',
    );
  }
  const entry = set.read(project.entryFile) ?? '';
  const stylesName = path.posix.basename(project.stylesFile);
  if (!entry.includes(stylesName)) {
    const importLine = `import '${relativeImport(project.entryFile, project.stylesFile)}';\n`;
    const lines = entry.split('\n');
    let lastImport = -1;
    lines.forEach((line, i) => {
      if (/^import\s/.test(line)) lastImport = i;
    });
    const next = lastImport === -1 ? importLine + entry : [...lines.slice(0, lastImport + 1), importLine.trimEnd(), ...lines.slice(lastImport + 1)].join('\n');
    set.write(project.entryFile, next);
  }
  return set.read(project.stylesFile)!;
}

/** Unique source locations, last in each file first, so editing one never shifts the ones still to do. */
function bottomUp(ids: string[]) {
  const seen = new Set<string>();
  return ids
    .filter((id) => !seen.has(id) && seen.add(id))
    .map(requireId)
    .sort((a, b) => a.file.localeCompare(b.file) || b.line - a.line || b.column - a.column);
}

function readSource(set: ChangeSet, file: string): string {
  const code = set.read(file);
  if (code === null) throw new EditError(`Source file not found: ${file}`);
  return code;
}

export function applyEdit(project: ProjectInfo, command: EditCommand): EditResult {
  if (!project.editable) return { ok: false, error: 'Visual editing is not supported for this project type.', changes: [] };
  const set = new ChangeSet(project.root);
  try {
    let selectId: string | null | undefined;
    switch (command.type) {
      case 'setStyle': {
        const entries = Object.entries(command.styles).map(([p, v]) => [p.trim().toLowerCase(), v.trim()] as const);
        for (const [prop, value] of entries) {
          if (!/^-?[a-z][a-z-]*$/.test(prop)) throw new EditError(`Invalid CSS property: ${prop}`);
          if (/[;{}]/.test(value)) throw new EditError('CSS values cannot contain ";", "{" or "}".');
        }
        const keys: string[] = [];
        for (const { file, line, column } of bottomUp([command.id, ...(command.extraIds ?? [])])) {
          const { code, key } = ensureStyleKey(readSource(set, file), file, line, column);
          set.write(file, code);
          keys.push(key);
        }
        let css = ensureStylesheet(set, project);
        for (const key of new Set(keys)) {
          for (const [prop, value] of entries) {
            css = setElementStyle(css, key, command.breakpoint, prop, value, project.breakpoints, command.state);
          }
        }
        set.write(project.stylesFile, css);
        if (command.googleFont) {
          if (!isGoogleFamilyParam(command.googleFont)) throw new EditError(`Invalid Google font: ${command.googleFont}`);
          const html = set.read('index.html');
          if (html === null) throw new EditError('Could not find index.html to load the Google font from.');
          let next: string;
          try {
            next = ensureGoogleFontLink(html, command.googleFont);
          } catch (err) {
            throw new EditError((err as Error).message);
          }
          if (next !== html) set.write('index.html', next);
        }
        selectId = command.id;
        break;
      }
      case 'insert': {
        if (!command.parentId) throw new EditError('There is no element on the page to insert into.');
        const { file, line, column } = requireId(command.parentId);
        const snippet = buildSnippet(command.kind, command.kind === 'image' ? command.image : undefined);
        const result = insertElement(readSource(set, file), file, line, column, snippet.jsx);
        set.write(file, result.code);
        let css = ensureStylesheet(set, project);
        for (const [prop, value] of Object.entries(snippet.css)) {
          css = setElementStyle(css, snippet.key, 'base', prop, value, project.breakpoints);
        }
        set.write(project.stylesFile, css);
        if (snippet.needsPlaceholder && set.read('public/placeholder.svg') === null) set.write('public/placeholder.svg', PLACEHOLDER_SVG);
        selectId = idAtOffset(file, result.code, result.offset);
        break;
      }
      case 'remove': {
        if (command.extraIds?.length) {
          for (const { file, line, column } of bottomUp([command.id, ...command.extraIds])) {
            set.write(file, removeElement(readSource(set, file), file, line, column).code);
          }
          selectId = null;
          break;
        }
        const { file, line, column } = requireId(command.id);
        const result = removeElement(readSource(set, file), file, line, column);
        set.write(file, result.code);
        selectId = result.parentOffset === null ? null : idAtOffset(file, result.code, result.parentOffset);
        break;
      }
      case 'move': {
        const { file, line, column } = requireId(command.id);
        const result = moveElement(readSource(set, file), file, line, column, command.direction);
        set.write(file, result.code);
        selectId = idAtOffset(file, result.code, result.offset);
        break;
      }
      case 'duplicate': {
        const targets = bottomUp([command.id, ...(command.extraIds ?? [])]);
        const keys: [string, string][] = [];
        for (const { file, line, column } of targets) {
          const result = duplicateElement(readSource(set, file), file, line, column);
          set.write(file, result.code);
          keys.push(...result.keys);
          if (targets.length === 1) selectId = idAtOffset(file, result.code, result.offset);
        }
        if (keys.length) {
          let css = ensureStylesheet(set, project);
          for (const [from, to] of keys) css = copyElementStyles(css, from, to);
          set.write(project.stylesFile, css);
        }
        if (targets.length > 1) selectId = null;
        break;
      }
      case 'group': {
        const targets = bottomUp([command.id, ...(command.extraIds ?? [])]);
        const file = targets[0].file;
        if (targets.some((t) => t.file !== file)) throw new EditError('Elements from different files cannot be grouped.');
        const result = wrapElements(readSource(set, file), file, targets.map((t) => [t.line, t.column]));
        set.write(file, result.code);
        selectId = idAtOffset(file, result.code, result.offset);
        break;
      }
      case 'ungroup': {
        const { file, line, column } = requireId(command.id);
        const result = unwrapElement(readSource(set, file), file, line, column);
        set.write(file, result.code);
        selectId = idAtOffset(file, result.code, result.offset);
        break;
      }
      case 'insertJsx': {
        const { file, line, column } = requireId(command.parentId);
        const result = insertElement(readSource(set, file), file, line, column, normalizeJsxSnippet(command.jsx));
        set.write(file, result.code);
        selectId = idAtOffset(file, result.code, result.offset);
        break;
      }
      case 'setTag': {
        const { file, line, column } = requireId(command.id);
        set.write(file, setTagName(readSource(set, file), file, line, column, command.tag));
        selectId = command.id;
        break;
      }
      case 'rename': {
        const { file, line, column } = requireId(command.id);
        const name = command.name.trim();
        set.write(file, setAttribute(readSource(set, file), file, line, column, 'data-oc-name', name || null));
        selectId = command.id;
        break;
      }
      case 'setText': {
        const { file, line, column } = requireId(command.id);
        set.write(file, setText(readSource(set, file), file, line, column, command.text));
        selectId = command.id;
        break;
      }
      case 'setAttribute': {
        if (!EDITABLE_ATTRIBUTES.has(command.name)) throw new EditError(`The "${command.name}" attribute can't be edited visually.`);
        const { file, line, column } = requireId(command.id);
        const value = command.value === '' && command.name !== 'alt' ? null : command.value;
        set.write(file, setAttribute(readSource(set, file), file, line, column, command.name, value));
        selectId = command.id;
        break;
      }
    }
    const changes = set.commit();
    return { ok: true, changes, selectId };
  } catch (err) {
    const message = err instanceof EditError ? err.message : `Edit failed: ${(err as Error).message}`;
    return { ok: false, error: message, changes: [] };
  }
}

export function inspectElement(project: ProjectInfo, id: string): SourceElementInfo | { error: string } {
  try {
    const { file, line, column } = requireId(id);
    const abs = safeResolve(project.root, file);
    const code = fs.readFileSync(abs, 'utf8');
    const { element, tag } = locateElement(code, file, line, column);
    const attributes = readAttributes(element);
    const keyAttr = element.openingElement.attributes.find((a: any) => a.type === 'JSXAttribute' && a.name?.name === 'data-oc');
    const key = attrLiteral(keyAttr ?? null);
    const stylesAbs = safeResolve(project.root, project.stylesFile);
    const css = fs.existsSync(stylesAbs) ? fs.readFileSync(stylesAbs, 'utf8') : '';
    const { text, editable, reason } = readText(element);
    return {
      id,
      tag,
      file,
      line,
      name: attributes['data-oc-name'] ?? null,
      key,
      text,
      textEditable: editable,
      textReason: reason,
      attributes,
      styles: key ? readElementStyles(css, key, project.breakpoints) : { base: {}, tablet: {}, mobile: {} },
      hover: key ? readElementStyles(css, key, project.breakpoints, 'hover') : { base: {}, tablet: {}, mobile: {} },
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
