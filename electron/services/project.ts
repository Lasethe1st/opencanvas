import fs from 'node:fs';
import path from 'node:path';
import { detectBreakpoints } from '../../shared/source/css';
import { FRAMEWORK_LABELS, type FileNode, type Framework, type PackageManager, type ProjectInfo, type ProjectSummary } from '../../shared/types';
import { ADAPTERS, type DetectContext } from '../adapters';

export const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.vite', '.next', '.cache', '.turbo', 'coverage', 'out']);

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

function collectCss(dir: string, out: string[], depth = 0): void {
  if (depth > 6 || !fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectCss(full, out, depth + 1);
    else if (/\.(css|scss)$/.test(entry.name) && !entry.name.startsWith('open-canvas')) out.push(fs.readFileSync(full, 'utf8'));
  }
}

export function detectContext(root: string, pkg: Record<string, any>): DetectContext {
  return {
    root,
    pkg,
    deps: { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) },
    hasNodeModules: fs.existsSync(path.join(root, 'node_modules')),
    exists: (rel) => fs.existsSync(path.join(root, rel)),
    read: (rel) => {
      try {
        return fs.readFileSync(path.join(root, rel), 'utf8');
      } catch {
        return null;
      }
    },
  };
}

export function detectProject(root: string): ProjectInfo {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new ProjectError('No package.json found. OpenCanvas supports React projects with a package.json at the root.');
  }
  const pkg = readJson(pkgPath);
  if (!pkg) throw new ProjectError('package.json could not be parsed.');
  const ctx = detectContext(root, pkg);
  const { deps, hasNodeModules } = ctx;

  const adapter = ADAPTERS.find((a) => a.detect(ctx)) ?? null;
  const framework: Framework = adapter?.id ?? 'unknown';
  const details = adapter
    ? adapter.details(ctx)
    : { entryFile: null, stylesFile: 'src/open-canvas.css', managedPreview: false, editableRoots: [], warnings: ['No supported framework detected. React + Vite and Next.js projects can be previewed and edited visually.'] };
  const warnings = [...details.warnings];

  const missingDependencies = hasNodeModules ? Object.keys(deps).filter((d) => !fs.existsSync(path.join(root, 'node_modules', ...d.split('/'), 'package.json'))) : [];
  if (missingDependencies.length) {
    warnings.push(`Some dependencies are not installed (${missingDependencies.join(', ')}). Install dependencies to use them in the preview.`);
  }

  const css: string[] = [];
  for (const dir of details.editableRoots.length ? details.editableRoots : ['src']) collectCss(path.join(root, dir), css);

  return {
    root,
    name: typeof pkg.name === 'string' ? pkg.name : path.basename(root),
    framework,
    packageManager: detectPackageManager(root),
    hasNodeModules,
    missingDependencies,
    managedPreview: details.managedPreview,
    entryFile: details.entryFile,
    stylesFile: details.stylesFile,
    canPreview: !!adapter?.supports.preview,
    editable: !!adapter?.supports.visualEdit,
    editableRoots: details.editableRoots,
    warnings,
    breakpoints: detectBreakpoints(css),
  };
}

export function projectSummary(info: ProjectInfo): ProjectSummary {
  const ctx = detectContext(info.root, readJson(path.join(info.root, 'package.json')) ?? {});
  const { deps } = ctx;
  let router: string | null = null;
  if (info.framework === 'next') router = ctx.exists('app') || ctx.exists('src/app') ? 'Next.js App Router' : 'Next.js Pages Router';
  else if (deps['react-router'] || deps['react-router-dom']) router = 'React Router';
  else if (info.entryFile && ctx.read(`${path.posix.dirname(info.entryFile)}/routes.jsx`)?.startsWith('// Managed by OpenCanvas')) router = 'OpenCanvas pages';

  const css: string[] = [];
  for (const dir of info.editableRoots.length ? info.editableRoots : ['src']) collectCss(path.join(info.root, dir), css);
  const tailwind =
    !!deps.tailwindcss ||
    ['js', 'cjs', 'mjs', 'ts'].some((ext) => ctx.exists(`tailwind.config.${ext}`)) ||
    css.some((c) => /@import\s+["']tailwindcss["']|@tailwind\s+base/.test(c));

  const roots = info.editableRoots.map((r) => `${r}/`).join(', ');
  return {
    framework: FRAMEWORK_LABELS[info.framework],
    packageManager: info.packageManager,
    router,
    tailwind,
    shadcn: ctx.exists('components.json'),
    scripts: Object.keys(ctx.pkg.scripts ?? {}),
    editing: info.editable ? `Visual editing works on JSX in ${roots}.` : (info.warnings[0] ?? 'This project opens in code view only.'),
  };
}

/** Whether a project-relative file sits in one of the folders whose JSX gets source ids. */
export function isEditablePath(info: Pick<ProjectInfo, 'editableRoots'>, rel: string): boolean {
  return info.editableRoots.some((r) => rel.startsWith(`${r}/`)) && !rel.includes('/node_modules/');
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

/** The nearest folder at or above `start` that has a package.json. */
export function findProjectRoot(start: string): string {
  let dir = fs.existsSync(start) && fs.statSync(start).isFile() ? path.dirname(start) : start;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new ProjectError('That file isn’t inside a project. OpenCanvas looks for a folder with a package.json.');
    dir = parent;
  }
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
