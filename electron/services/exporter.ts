import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import type { ProjectInfo } from '../../shared/types';
import { IGNORED_DIRS, toRel } from './project';

const IGNORED_FILES = /^(\.DS_Store|Thumbs\.db|npm-debug\.log.*|yarn-error\.log.*|\.env(?!\.example$).*)$/;

export interface ZipBuild {
  buffer: Buffer;
  files: string[];
  skipped: string[];
}

export async function buildProjectZip(project: ProjectInfo): Promise<ZipBuild> {
  const zip = new JSZip();
  const folder = zip.folder(path.basename(project.root))!;
  const files: string[] = [];
  const skipped: string[] = [];

  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = toRel(project.root, full);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) {
          skipped.push(`${rel}/`);
          continue;
        }
        visit(full);
      } else if (entry.isFile()) {
        if (IGNORED_FILES.test(entry.name)) {
          skipped.push(rel);
          continue;
        }
        folder.file(rel, fs.readFileSync(full));
        files.push(rel);
      }
    }
  };
  visit(project.root);
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { buffer, files, skipped };
}

export function runInstructions(project: ProjectInfo): string[] {
  const pm = project.packageManager;
  const run = pm === 'npm' ? 'npm run' : pm;
  let scripts: Record<string, string> = {};
  try {
    scripts = JSON.parse(fs.readFileSync(path.join(project.root, 'package.json'), 'utf8')).scripts ?? {};
  } catch {
    /* fall back to defaults */
  }
  const steps = [`cd ${path.basename(project.root)}`, `${pm} install`];
  if (scripts.dev) steps.push(`${run} dev`);
  if (scripts.build) steps.push(`${run} build`);
  return steps;
}
