import fs from 'node:fs';
import path from 'node:path';
import { detectBreakpoints } from '../../shared/source/css';
import type { FileNode, Framework, PackageManager, ProjectInfo } from '../../shared/types';

export const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.vite', '.next', '.cache', '.turbo', 'coverage', 'out']);

const MANAGED_DEPS = new Set(['react', 'react-dom', 'vite', '@vitejs/plugin-react']);

export class ProjectError extends Error {}

/** Resolves a project-relative path and refuses anything outside the project root. */
export function safeResolve(root: string, rel: string): string {
  const resolved = path.resolve(root, rel);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ProjectError(`Path is outside the project: ${rel}`);
  }
  return resolved;
}

export function toRel(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/');
}

function readJson(file: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function detectPackageManager(root: string): PackageManager {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(root, 'bun.lockb')) || fs.existsSync(path.join(root, 'bun.lock'))) return 'bun';
  return 'npm';
}

function findEntry(root: string): string | null {
  const html = path.join(root, 'index.html');
  if (!fs.existsSync(html)) return null;
  const match = /<script[^>]*type=["']module["'][^>]*src=["']\/?([^"']+)["']/i.exec(fs.readFileSync(html, 'utf8'));
  if (!match) return null;
  const rel = match[1].replace(/^\.\//, '');
  return fs.existsSync(path.join(root, rel)) ? rel : null;
}

function collectCss(dir: string, out: string[], depth = 0): void {
  if (depth > 6 || !fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectCss(full, out, depth + 1);
    else if (/\.(css|scss)$/.test(entry.name) && !entry.name.startsWith('open-canvas')) out.push(fs.readFileSync(full, 'utf8'));
  }
}

export function detectProject(root: string): ProjectInfo {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new ProjectError('No package.json found. OpenCanvas supports React projects with a package.json at the root.');
  }
  const pkg = readJson(pkgPath);
  if (!pkg) throw new ProjectError('package.json could not be parsed.');
  const deps: Record<string, string> = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const warnings: string[] = [];

  let framework: Framework = 'unknown';
  if (deps.next) framework = 'next';
  else if (deps.vite && deps.react) framework = 'vite-react';
  else if (deps['react-scripts']) framework = 'cra';

  const hasNodeModules = fs.existsSync(path.join(root, 'node_modules'));
  const managedPreview = framework === 'vite-react' && Object.keys(deps).every((d) => MANAGED_DEPS.has(d));
  const entryFile = framework === 'vite-react' ? findEntry(root) : null;

  if (framework === 'next') warnings.push('Next.js projects are detected but not yet supported for preview or visual editing. You can browse and edit files in code view.');
  if (framework === 'cra') warnings.push('Create React App projects are not supported for preview yet. You can browse and edit files in code view.');
  if (framework === 'unknown') warnings.push('No supported framework detected. Only React + Vite projects can be previewed and edited visually.');
  if (framework === 'vite-react' && !entryFile) warnings.push('Could not find the module entry script in index.html; styles file import must be added manually.');
  const missingDependencies = hasNodeModules ? Object.keys(deps).filter((d) => !fs.existsSync(path.join(root, 'node_modules', ...d.split('/'), 'package.json'))) : [];
  if (framework === 'vite-react' && !hasNodeModules && !managedPreview) {
    warnings.push('Dependencies are not installed. Install them to start the preview.');
  }
  if (missingDependencies.length) {
    warnings.push(`Some dependencies are not installed (${missingDependencies.join(', ')}). Install dependencies to use them in the preview.`);
  }

  const css: string[] = [];
  collectCss(path.join(root, 'src'), css);

  return {
    root,
    name: typeof pkg.name === 'string' ? pkg.name : path.basename(root),
    framework,
    packageManager: detectPackageManager(root),
    hasNodeModules,
    missingDependencies,
    managedPreview,
    entryFile,
    stylesFile: 'src/open-canvas.css',
    editable: framework === 'vite-react',
    warnings,
    breakpoints: detectBreakpoints(css),
  };
}

export function listTree(root: string): FileNode {
  const build = (abs: string, depth: number): FileNode[] => {
    if (depth > 12) return [];
    const entries = fs.readdirSync(abs, { withFileTypes: true }).filter((e) => !IGNORED_DIRS.has(e.name) && e.name !== '.DS_Store');
    entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
    return entries.map((entry) => {
      const full = path.join(abs, entry.name);
      if (entry.isDirectory()) return { name: entry.name, path: toRel(root, full), type: 'dir' as const, children: build(full, depth + 1) };
      return { name: entry.name, path: toRel(root, full), type: 'file' as const };
    });
  };
  return { name: path.basename(root), path: '', type: 'dir', children: build(root, 0) };
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'project'
  );
}

export function uniqueDir(parent: string, slug: string): string {
  let candidate = path.join(parent, slug);
  let n = 2;
  while (fs.existsSync(candidate)) candidate = path.join(parent, `${slug}-${n++}`);
  return candidate;
}

export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = safeResolve(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
}
