/** Unpacks a project ZIP into the projects folder, refusing anything that could write outside it. */
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

export const ZIP_LIMITS = { maxBytes: 500 * 1024 * 1024, maxFiles: 20_000 };
const SKIPPED_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '__MACOSX']);

export class ZipImportError extends Error {}

export interface ZipImportResult {
  root: string;
  fileCount: number;
  skipped: number;
}

/** Normalised entry path, or null for entries that must never be written. */
export function safeEntryPath(name: string): string | null {
  const unified = name.replace(/\\/g, '/');
  if (unified.startsWith('/') || /^[a-zA-Z]:/.test(unified) || unified.includes('\0')) return null;
  const parts = unified.split('/').filter((p) => p !== '' && p !== '.');
  if (parts.some((p) => p === '..')) return null;
  return parts.join('/');
}

/** The single folder every entry sits in (as GitHub's "Download ZIP" makes), or null. */
function commonTopFolder(paths: string[]): string | null {
  const first = paths[0]?.split('/')[0];
  if (!first || !paths.every((p) => p.includes('/') && p.split('/')[0] === first)) return null;
  return first;
}

const isSymlink = (entry: JSZip.JSZipObject) => typeof entry.unixPermissions === 'number' && (entry.unixPermissions & 0o170000) === 0o120000;

export async function extractZip(data: Buffer | Uint8Array, makeRoot: (suggestedName: string) => string, zipName = 'project'): Promise<ZipImportResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new ZipImportError('That file isn’t a readable ZIP archive.');
  }

  const entries: { rel: string; entry: JSZip.JSZipObject }[] = [];
  for (const entry of Object.values(zip.files)) {
    // JSZip quietly rewrites "../" names; judge the name as it was written in the archive.
    const original: string = (entry as any).unsafeOriginalName ?? entry.name;
    const rel = safeEntryPath(original);
    if (rel === null) throw new ZipImportError(`The ZIP contains an unsafe path (${original.slice(0, 120)}), so it wasn’t imported.`);
    if (entry.dir || !rel || rel.split('/')[0] === '__MACOSX') continue;
    entries.push({ rel, entry });
  }
  const top = commonTopFolder(entries.map((e) => e.rel));
  const files: typeof entries = [];
  let skipped = 0;
  let declared = 0;
  for (const e of entries) {
    const rel = top ? e.rel.slice(top.length + 1) : e.rel;
    if (rel.split('/').some((p) => SKIPPED_DIRS.has(p)) || path.basename(rel) === '.DS_Store' || isSymlink(e.entry)) {
      skipped++;
      continue;
    }
    files.push({ rel, entry: e.entry });
    declared += ((e.entry as any)._data?.uncompressedSize as number | undefined) ?? 0;
  }
  if (files.length > ZIP_LIMITS.maxFiles) throw new ZipImportError(`The ZIP has ${files.length.toLocaleString('en')} files. OpenCanvas imports up to ${ZIP_LIMITS.maxFiles.toLocaleString('en')}, not counting node_modules.`);
  if (declared > ZIP_LIMITS.maxBytes) throw new ZipImportError('The ZIP unpacks to more than 500 MB, not counting node_modules. Remove large assets or build output and try again.');
  if (!files.some((f) => f.rel === 'package.json')) {
    throw new ZipImportError('No package.json at the top of the ZIP. OpenCanvas imports React projects with a package.json at their root (or inside one top-level folder).');
  }

  let suggested = top ?? zipName;
  try {
    const pkg = JSON.parse(await files.find((f) => f.rel === 'package.json')!.entry.async('string'));
    if (typeof pkg.name === 'string' && pkg.name.trim()) suggested = pkg.name.replace(/^@[^/]+\//, '');
  } catch {
    /* fall back to the folder or file name */
  }

  const root = makeRoot(suggested);
  fs.mkdirSync(root, { recursive: true });
  let written = 0;
  try {
    for (const f of files) {
      const abs = path.resolve(root, f.rel);
      const relative = path.relative(root, abs);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new ZipImportError(`The ZIP contains an unsafe path (${f.rel}), so it wasn’t imported.`);
      const content = await f.entry.async('nodebuffer');
      written += content.length;
      if (written > ZIP_LIMITS.maxBytes) throw new ZipImportError('The ZIP unpacks to more than 500 MB, not counting node_modules. Remove large assets or build output and try again.');
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
  } catch (err) {
    fs.rmSync(root, { recursive: true, force: true });
    throw err;
  }
  return { root, fileCount: files.length, skipped };
}
