import fs from 'node:fs';
import path from 'node:path';
import type { FileChange, ImportResult } from '../../shared/types';
import { ProjectError, safeResolve } from './project';

const MAX_SIZE = 50 * 1024 * 1024;
const TEXT_ASSET = /\.(svg|css|json|txt|md|jsx?|tsx?|html?|xml)$/i;
export const IMAGE_EXTENSIONS = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico'];

function uniqueName(root: string, dir: string, name: string): string {
  const ext = path.extname(name);
  const stem = path.basename(name, ext).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  let candidate = `${stem}${ext.toLowerCase()}`;
  for (let i = 1; fs.existsSync(safeResolve(root, dir ? `${dir}/${candidate}` : candidate)); i++) candidate = `${stem}-${i}${ext.toLowerCase()}`;
  return dir ? `${dir}/${candidate}` : candidate;
}

/**
 * Copies files from disk into the project folder `dir`. Text assets (SVG, CSS, …) are recorded as
 * FileChanges so the import can be undone; binary files are copied without history.
 */
export function importFiles(root: string, sources: string[], dir: string): ImportResult {
  const target = dir.replace(/^\/+|\/+$/g, '');
  const targetAbs = safeResolve(root, target || '.');
  if (fs.existsSync(targetAbs) && !fs.statSync(targetAbs).isDirectory()) throw new ProjectError(`${target} is not a folder.`);
  const files: string[] = [];
  const changes: FileChange[] = [];
  let undoable = true;
  for (const source of sources) {
    const stat = fs.statSync(source, { throwIfNoEntry: false });
    if (!stat?.isFile()) throw new ProjectError(`${path.basename(source)} is not a file. Folders can't be imported.`);
    if (stat.size > MAX_SIZE) throw new ProjectError(`${path.basename(source)} is larger than 50 MB.`);
  }
  fs.mkdirSync(targetAbs, { recursive: true });
  for (const source of sources) {
    const rel = uniqueName(root, target, path.basename(source));
    const abs = safeResolve(root, rel);
    if (TEXT_ASSET.test(rel)) {
      const content = fs.readFileSync(source, 'utf8');
      fs.writeFileSync(abs, content, 'utf8');
      changes.push({ path: rel, before: null, after: content });
    } else {
      fs.copyFileSync(source, abs);
      undoable = false;
    }
    files.push(rel);
  }
  return { files, changes: undoable ? changes : [], undoable };
}
