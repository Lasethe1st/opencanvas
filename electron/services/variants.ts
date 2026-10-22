/** Persistent variant proposals under `.opencanvas/variants`. */
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseSourceId } from '../../shared/source/ast';
import { EditError, idAtOffset, locateElement, replaceElementJsx } from '../../shared/source/jsx';
import {
  VARIANT_JSX_MAX_BYTES,
  VARIANT_MAX_AGE_MS,
  clampVariantCount,
  type VariantGenerateRequest,
  type VariantRecord,
  type VariantSource,
  type VariantStatus,
} from '../../shared/variants';
import { variantOverrideRel } from '../../shared/variant-resolve';
import type { EditResult, FileChange, ProjectInfo } from '../../shared/types';
import { safeResolve } from './project';

const INDEX = 'index.json';

export interface VariantIndex {
  version: 1;
  variants: VariantRecord[];
  /** Active generation turn, if any. */
  generatingSetId: string | null;
}

const EMPTY: VariantIndex = { version: 1, variants: [], generatingSetId: null };

function variantsRoot(projectRoot: string): string {
  return path.join(projectRoot, '.opencanvas', 'variants');
}

function indexPath(projectRoot: string): string {
  return path.join(variantsRoot(projectRoot), INDEX);
}

export function fileHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function ensureVariantsGitignore(projectRoot: string): void {
  const ignore = path.join(projectRoot, '.gitignore');
  const line = '.opencanvas/variants';
  if (!fs.existsSync(ignore)) {
    fs.writeFileSync(ignore, `node_modules\ndist\n.vite\n.DS_Store\n${line}\n`, 'utf8');
    return;
  }
  const text = fs.readFileSync(ignore, 'utf8');
  if (text.split(/\r?\n/).some((l) => l.trim() === line || l.trim() === '.opencanvas/')) return;
  const next = text.endsWith('\n') ? `${text}${line}\n` : `${text}\n${line}\n`;
  fs.writeFileSync(ignore, next, 'utf8');
}

export function readVariantIndex(projectRoot: string): VariantIndex {
  const file = indexPath(projectRoot);
  if (!fs.existsSync(file)) return { ...EMPTY, variants: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as VariantIndex;
    if (!raw || raw.version !== 1 || !Array.isArray(raw.variants)) return { ...EMPTY, variants: [] };
    return { version: 1, variants: raw.variants, generatingSetId: raw.generatingSetId ?? null };
  } catch {
    return { ...EMPTY, variants: [] };
  }
}

function writeIndex(projectRoot: string, index: VariantIndex): void {
  const root = variantsRoot(projectRoot);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(indexPath(projectRoot), JSON.stringify(index, null, 2), 'utf8');
}

function removeOverrideDir(projectRoot: string, id: string): void {
  const dir = path.join(variantsRoot(projectRoot), id);
  fs.rmSync(dir, { recursive: true, force: true });
}

export function pruneVariants(projectRoot: string, now = Date.now()): VariantIndex {
  const index = readVariantIndex(projectRoot);
  const keep: VariantRecord[] = [];
  for (const v of index.variants) {
    const dead =
      v.status === 'applied' ||
      v.status === 'discarded' ||
      (v.status !== 'generating' && now - v.createdAt > VARIANT_MAX_AGE_MS);
    if (dead) {
      removeOverrideDir(projectRoot, v.id);
      continue;
    }
    keep.push(v);
  }
  const next: VariantIndex = {
    version: 1,
    variants: keep,
    generatingSetId: keep.some((v) => v.setId === index.generatingSetId && v.status === 'generating') ? index.generatingSetId : null,
  };
  writeIndex(projectRoot, next);
  ensureVariantsGitignore(projectRoot);
  return next;
}

export function listVariants(projectRoot: string): VariantRecord[] {
  return readVariantIndex(projectRoot).variants.filter((v) => v.status !== 'discarded' && v.status !== 'applied');
}

function sourceLabel(project: ProjectInfo, elementId: string): { source: VariantSource; code: string } {
  const parsed = parseSourceId(elementId);
  if (!parsed) throw new EditError(`Invalid element reference: ${elementId}`);
  const abs = safeResolve(project.root, parsed.file);
  if (!fs.existsSync(abs)) throw new EditError(`Source file not found: ${parsed.file}`);
  const code = fs.readFileSync(abs, 'utf8');
  const { element, tag } = locateElement(code, parsed.file, parsed.line, parsed.column);
  const nameAttr = element.openingElement.attributes.find((a: any) => a.type === 'JSXAttribute' && a.name?.name === 'data-oc-name');
  const name =
    nameAttr && nameAttr.value?.type === 'StringLiteral'
      ? String(nameAttr.value.value)
      : tag;
  return {
    code,
    source: {
      file: parsed.file,
      elementId,
      label: name,
      fileHash: fileHash(code),
    },
  };
}

/** Creates placeholder records for a generation set. */
export function beginVariantSet(project: ProjectInfo, req: VariantGenerateRequest): { setId: string; variants: VariantRecord[] } {
  const count = clampVariantCount(req.count);
  const request = req.request.trim();
  if (!request) throw new EditError('Describe the variants you want.');
  const { source } = sourceLabel(project, req.elementId);
  const setId = randomUUID();
  const index = pruneVariants(project.root);
  const created: VariantRecord[] = [];
  for (let i = 0; i < count; i++) {
    created.push({
      id: randomUUID(),
      setId,
      source,
      request,
      label: '',
      notes: '',
      createdAt: Date.now(),
      status: 'generating',
    });
  }
  index.variants.push(...created);
  index.generatingSetId = setId;
  writeIndex(project.root, index);
  ensureVariantsGitignore(project.root);
  return { setId, variants: created };
}

export function markVariantFailed(projectRoot: string, id: string, error: string): VariantRecord | null {
  const index = readVariantIndex(projectRoot);
  const v = index.variants.find((x) => x.id === id);
  if (!v) return null;
  v.status = 'failed';
  v.error = error;
  writeIndex(projectRoot, index);
  return v;
}

export function finishGeneratingSet(projectRoot: string, setId: string): void {
  const index = readVariantIndex(projectRoot);
  for (const v of index.variants) {
    if (v.setId === setId && v.status === 'generating') {
      v.status = 'failed';
      v.error = v.error || 'The AI stopped before proposing this variant.';
    }
  }
  if (index.generatingSetId === setId) index.generatingSetId = null;
  writeIndex(projectRoot, index);
}

/** Writes an override file for one propose_variant call. Uses the next generating slot in the set. */
export function proposeVariant(
  project: ProjectInfo,
  args: { setId?: string; elementId?: string; label: string; notes?: string; jsx: string },
): VariantRecord {
  const jsx = args.jsx ?? '';
  if (Buffer.byteLength(jsx, 'utf8') > VARIANT_JSX_MAX_BYTES) {
    throw new EditError(`Variant JSX is larger than ${VARIANT_JSX_MAX_BYTES / 1024} KB.`);
  }
  const index = readVariantIndex(project.root);
  let target =
    (args.setId ? index.variants.find((v) => v.setId === args.setId && v.status === 'generating') : null) ??
    index.variants.find((v) => v.status === 'generating') ??
    null;

  // MCP / external: create a single ready variant for the given element.
  if (!target) {
    if (!args.elementId) throw new EditError('No variant generation is in progress. Pass elementId to propose one.');
    const { source, code } = sourceLabel(project, args.elementId);
    const id = randomUUID();
    const setId = randomUUID();
    target = {
      id,
      setId,
      source,
      request: args.label || 'Proposed variant',
      label: args.label || 'Variant',
      notes: args.notes ?? '',
      createdAt: Date.now(),
      status: 'generating',
    };
    index.variants.push(target);
    writeOverride(project, target, code, jsx);
    target.status = 'ready';
    target.label = args.label.trim() || 'Variant';
    target.notes = (args.notes ?? '').trim();
    writeIndex(project.root, index);
    return target;
  }

  const abs = safeResolve(project.root, target.source.file);
  const code = fs.readFileSync(abs, 'utf8');
  writeOverride(project, target, code, jsx);
  target.status = 'ready';
  target.label = args.label.trim() || 'Variant';
  target.notes = (args.notes ?? '').trim();
  target.error = undefined;
  writeIndex(project.root, index);
  return target;
}

function writeOverride(project: ProjectInfo, record: VariantRecord, code: string, jsx: string): void {
  const parsed = parseSourceId(record.source.elementId);
  if (!parsed) throw new EditError(`Invalid element reference: ${record.source.elementId}`);
  let next: string;
  try {
    next = replaceElementJsx(code, parsed.file, parsed.line, parsed.column, jsx).code;
  } catch (err) {
    throw new EditError(err instanceof Error ? err.message : String(err));
  }
  const rel = variantOverrideRel(record.id, parsed.file);
  const abs = path.join(project.root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, next, 'utf8');
  record.overrideFile = rel;
}

export function discardVariant(projectRoot: string, id: string): VariantRecord | null {
  const index = readVariantIndex(projectRoot);
  const v = index.variants.find((x) => x.id === id);
  if (!v) return null;
  v.status = 'discarded';
  removeOverrideDir(projectRoot, id);
  writeIndex(projectRoot, index);
  return v;
}

export function discardVariantSet(projectRoot: string, setId: string): VariantRecord[] {
  const index = readVariantIndex(projectRoot);
  const touched: VariantRecord[] = [];
  for (const v of index.variants) {
    if (v.setId !== setId) continue;
    if (v.status === 'applied' || v.status === 'discarded') continue;
    v.status = 'discarded';
    removeOverrideDir(projectRoot, v.id);
    touched.push(v);
  }
  if (index.generatingSetId === setId) index.generatingSetId = null;
  writeIndex(projectRoot, index);
  return touched;
}

export function resetVariantForRetry(projectRoot: string, id: string): VariantRecord | null {
  const index = readVariantIndex(projectRoot);
  const v = index.variants.find((x) => x.id === id);
  if (!v || (v.status !== 'failed' && v.status !== 'stale')) return null;
  removeOverrideDir(projectRoot, id);
  v.status = 'generating';
  v.error = undefined;
  v.label = '';
  v.notes = '';
  v.overrideFile = undefined;
  index.generatingSetId = v.setId;
  writeIndex(projectRoot, index);
  return v;
}

/**
 * Applies a ready variant to the real source file. Returns EditResult-shaped changes
 * for undo; marks the variant stale when the element or file hash no longer matches.
 */
export function applyVariant(project: ProjectInfo, id: string): { result: EditResult; record: VariantRecord } {
  const index = readVariantIndex(project.root);
  const record = index.variants.find((x) => x.id === id);
  if (!record) throw new EditError('That variant no longer exists.');
  if (record.status === 'stale') {
    return { result: { ok: false, error: 'This variant is out of date. Regenerate it.', changes: [] }, record };
  }
  if (record.status !== 'ready') throw new EditError('Only ready variants can be applied.');

  const parsed = parseSourceId(record.source.elementId);
  if (!parsed) throw new EditError(`Invalid element reference: ${record.source.elementId}`);
  const abs = safeResolve(project.root, parsed.file);
  if (!fs.existsSync(abs)) {
    record.status = 'stale';
    record.error = 'The source element is gone.';
    writeIndex(project.root, index);
    return { result: { ok: false, error: record.error, changes: [] }, record };
  }
  const before = fs.readFileSync(abs, 'utf8');
  if (fileHash(before) !== record.source.fileHash) {
    record.status = 'stale';
    record.error = 'The file changed since this variant was generated.';
    writeIndex(project.root, index);
    return { result: { ok: false, error: record.error, changes: [] }, record };
  }

  try {
    locateElement(before, parsed.file, parsed.line, parsed.column);
  } catch {
    record.status = 'stale';
    record.error = 'The source element is gone.';
    writeIndex(project.root, index);
    return { result: { ok: false, error: record.error, changes: [] }, record };
  }

  const overrideAbs = record.overrideFile
    ? path.join(project.root, ...record.overrideFile.split('/'))
    : path.join(project.root, ...variantOverrideRel(record.id, parsed.file).split('/'));
  if (!fs.existsSync(overrideAbs)) throw new EditError('The variant override file is missing.');
  const after = fs.readFileSync(overrideAbs, 'utf8');

  if (after === before) {
    return { result: { ok: true, changes: [], selectId: record.source.elementId }, record };
  }

  fs.writeFileSync(abs, after, 'utf8');
  const changes: FileChange[] = [{ path: parsed.file, before, after }];
  const selectId = (() => {
    try {
      const { element } = locateElement(after, parsed.file, parsed.line, parsed.column);
      return idAtOffset(parsed.file, after, element.start);
    } catch {
      return record.source.elementId;
    }
  })();

  record.status = 'applied';
  removeOverrideDir(project.root, record.id);
  // Discard siblings in the same set that are still open.
  for (const v of index.variants) {
    if (v.setId === record.setId && v.id !== record.id && (v.status === 'ready' || v.status === 'generating' || v.status === 'failed' || v.status === 'stale')) {
      v.status = 'discarded';
      removeOverrideDir(project.root, v.id);
    }
  }
  writeIndex(project.root, index);
  return { result: { ok: true, changes, selectId }, record };
}

/** Public helper used by edits and tests. */
export function replaceElementInFile(project: ProjectInfo, elementId: string, jsx: string): EditResult {
  try {
    const parsed = parseSourceId(elementId);
    if (!parsed) throw new EditError(`Invalid element reference: ${elementId}`);
    const abs = safeResolve(project.root, parsed.file);
    const before = fs.readFileSync(abs, 'utf8');
    const { code, offset } = replaceElementJsx(before, parsed.file, parsed.line, parsed.column, jsx);
    if (code === before) return { ok: true, changes: [], selectId: elementId };
    fs.writeFileSync(abs, code, 'utf8');
    return { ok: true, changes: [{ path: parsed.file, before, after: code }], selectId: idAtOffset(parsed.file, code, offset) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), changes: [] };
  }
}

export type { VariantStatus };
