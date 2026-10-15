/** Reads and writes `.opencanvas/project.json` and performs page changes as undoable file changes. */
import fs from 'node:fs';
import path from 'node:path';
import {
  CONFIG_FILE,
  REFERENCES_DIR,
  componentName,
  normalizeDirection,
  normalizePath,
  normalizeProjectConfig,
  pageSlug,
  type DirectionConfig,
  type PageConfig,
  type PageMutation,
  type PageRouting,
  type ProjectConfig,
  type ProjectPagesState,
} from '../../shared/project-config';
import { detectRoutes, generateRoutesFile, isManagedRoutes, newPageSource, nextRouteFor, rebaseImports, routesFileFor, RoutingError, wireRoutesIntoEntry } from '../../shared/source/routes';
import type { FileChange, ProjectInfo } from '../../shared/types';
import { IGNORED_DIRS, ProjectError, safeResolve, toRel } from './project';

const read = (root: string, rel: string): string | null => {
  try {
    return fs.readFileSync(safeResolve(root, rel), 'utf8');
  } catch {
    return null;
  }
};

/** Writes (or deletes, for null) a file and records the change. */
function put(root: string, rel: string, content: string | null, changes: FileChange[]) {
  const abs = safeResolve(root, rel);
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  if (before === content) return;
  if (content === null) fs.rmSync(abs, { force: true });
  else {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.oc-tmp`;
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, abs);
  }
  changes.push({ path: rel, before, after: content });
}

export function homeFileFor(info: ProjectInfo): string | null {
  return ['src/App.jsx', 'src/App.tsx', 'src/App.js'].find((f) => fs.existsSync(path.join(info.root, f))) ?? null;
}

export function readConfig(info: ProjectInfo): ProjectConfig {
  const raw = read(info.root, CONFIG_FILE);
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  return normalizeProjectConfig(parsed, homeFileFor(info));
}

const serialize = (config: ProjectConfig) => `${JSON.stringify(config, null, 2)}\n`;

function sourceFiles(root: string, dir: string, out: string[], depth = 0) {
  const abs = path.join(root, dir);
  if (depth > 8 || !fs.existsSync(abs)) return;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(abs, entry.name);
    if (entry.isDirectory()) sourceFiles(root, toRel(root, full), out, depth + 1);
    else if (/\.(m?[jt]sx?|mdx)$/.test(entry.name) && fs.statSync(full).size < 400_000) out.push(toRel(root, full));
  }
}

const titleFor = (p: string) =>
  p === '/'
    ? 'Home'
    : p
        .split('/')
        .filter(Boolean)
        .pop()!
        .replace(/[-_]+/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase());

function detectedPages(config: ProjectConfig, found: { path: string; file: string | null }[]): PageConfig[] {
  const seen = new Set<string>();
  const pages: PageConfig[] = [];
  for (const f of found) {
    if (seen.has(f.path)) continue;
    seen.add(f.path);
    const named = config.pages.find((p) => p.path === f.path);
    pages.push({ id: f.path === '/' ? 'home' : `route:${f.path}`, name: named?.name ?? titleFor(f.path), path: f.path, file: f.file });
  }
  pages.sort((a, b) => (a.path === '/' ? -1 : b.path === '/' ? 1 : 0));
  return pages.length ? pages : config.pages.slice(0, 1);
}

/** Project-relative file for a relative import, trying the usual extensions and index files. */
function resolveImport(root: string, fromFile: string, source: string): string | null {
  if (!source.startsWith('.')) return null;
  const base = path.posix.join(path.posix.dirname(fromFile), source);
  const candidates = [base, ...['.jsx', '.tsx', '.js', '.ts'].map((e) => base + e), ...['jsx', 'tsx', 'js', 'ts'].map((e) => `${base}/index.${e}`)];
  return candidates.find((c) => /\.[jt]sx?$/.test(c) && fs.existsSync(path.join(root, c)) && fs.statSync(path.join(root, c)).isFile()) ?? null;
}

function deps(info: ProjectInfo): Record<string, string> {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(info.root, 'package.json'), 'utf8'));
    return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  } catch {
    return {};
  }
}

export function pagesState(info: ProjectInfo, config = readConfig(info)): ProjectPagesState {
  const d = deps(info);
  let routing: PageRouting = 'unsupported';
  let pages = config.pages;
  let note: string | null = null;

  if (info.framework === 'next') {
    routing = 'next';
    const files: string[] = [];
    for (const dir of ['app', 'pages', 'src/app', 'src/pages']) sourceFiles(info.root, dir, files);
    pages = detectedPages(
      config,
      files.flatMap((file) => {
        const route = nextRouteFor(file);
        return route ? [{ path: route, file }] : [];
      }),
    );
    note = 'Pages come from the Next.js app and pages folders. Add pages in code for now. Dynamic routes ask for an example value on their frame.';
  } else if (d['react-router'] || d['react-router-dom']) {
    routing = 'react-router';
    const files: string[] = [];
    sourceFiles(info.root, 'src', files);
    const found = files.flatMap((file) =>
      detectRoutes(read(info.root, file) ?? '', file).map((r) => ({ path: r.path === '/' ? '/' : normalizePath(r.path), file: r.importSource ? resolveImport(info.root, file, r.importSource) : null })),
    );
    pages = detectedPages(config, found);
    note = 'Pages come from your React Router routes, so OpenCanvas doesn’t rewrite your router. Add pages in code. Routes it can’t read are listed as found at runtime once you visit them.';
  } else if (info.framework === 'vite-react' && info.entryFile) {
    const routesFile = routesFileFor(info.entryFile);
    const routes = read(info.root, routesFile);
    if (routes === null) routing = 'single';
    else if (isManagedRoutes(routes)) routing = 'managed';
    else note = `${routesFile} already exists and isn't managed by OpenCanvas, so pages can't be added automatically.`;
    if (routing !== 'unsupported' && !homeFileFor(info)) {
      routing = 'unsupported';
      note = 'OpenCanvas looks for src/App.jsx or src/App.tsx as the home page.';
    }
  } else {
    note = 'Pages can be added to React + Vite projects.';
  }
  return { config, routing, pages, canEditPages: routing === 'single' || routing === 'managed', pagesNote: note };
}

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Data URL for an image file, refusing non-images and very large files. */
export function imageDataUrl(abs: string): string {
  const mime = IMAGE_MIME[path.extname(abs).toLowerCase()];
  if (!mime) throw new ProjectError('Only PNG, JPEG, GIF, WebP, AVIF and SVG images can be used as references.');
  const size = fs.statSync(abs).size;
  if (size > MAX_IMAGE_BYTES) throw new ProjectError('That image is larger than 15 MB. Choose a smaller one.');
  return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
}

export function referenceImage(info: ProjectInfo, rel: string): string {
  if (!rel.startsWith(`${REFERENCES_DIR}/`)) throw new ProjectError('Not a reference image.');
  return imageDataUrl(safeResolve(info.root, rel));
}

/** Copies picked images into `.opencanvas/references/` and points their references at the copies. */
export function storeUploads(root: string, direction: DirectionConfig, uploads: Record<string, string> = {}): DirectionConfig {
  const references = direction.references.map((r) => {
    const source = uploads[r.id];
    if (!source || typeof source !== 'string' || !path.isAbsolute(source)) return r;
    imageDataUrl(source);
    const id = r.id.replace(/[^\w-]/g, '').slice(0, 40) || 'ref';
    const rel = `${REFERENCES_DIR}/${id}${path.extname(source).toLowerCase()}`;
    const abs = safeResolve(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.copyFileSync(source, abs);
    return { ...r, imagePath: rel };
  });
  return { ...direction, references };
}

/** Removes reference images that no reference points at any more. */
function pruneReferenceImages(root: string, direction: DirectionConfig) {
  const dir = path.join(root, REFERENCES_DIR);
  if (!fs.existsSync(dir)) return;
  const keep = new Set(direction.references.map((r) => r.imagePath).filter(Boolean));
  for (const name of fs.readdirSync(dir)) {
    if (!keep.has(`${REFERENCES_DIR}/${name}`)) fs.rmSync(path.join(dir, name), { force: true });
  }
}

export function writeDirection(info: ProjectInfo, direction: DirectionConfig, uploads?: Record<string, string>): ProjectPagesState {
  const stored = normalizeDirection(storeUploads(info.root, direction, uploads));
  const config = { ...readConfig(info), direction: stored };
  put(info.root, CONFIG_FILE, serialize(config), []);
  pruneReferenceImages(info.root, stored);
  return pagesState(info, config);
}

/* ---------- Page changes ---------- */

type Mutate = (ctx: { config: ProjectConfig; changes: FileChange[]; dir: string; ext: string }) => PageConfig | null;

function mutatePages(info: ProjectInfo, mutate: Mutate): PageMutation {
  const state = pagesState(info);
  if (!state.canEditPages) throw new ProjectError(state.pagesNote ?? 'Pages can’t be changed in this project.');
  const entry = info.entryFile!;
  const home = homeFileFor(info)!;
  const routesFile = routesFileFor(entry);
  const config: ProjectConfig = JSON.parse(JSON.stringify(state.config));
  if (!config.pages[0].file) config.pages = config.pages.map((p) => (p.path === '/' && !p.file ? { ...p, file: home } : p));

  if (state.routing === 'managed') {
    const current = read(info.root, routesFile) ?? '';
    if (current !== generateRoutesFile(state.config.pages.map((p) => (p.path === '/' && !p.file ? { ...p, file: home } : p)), routesFile)) {
      throw new ProjectError(`${routesFile} was changed by hand. Edit pages in code, or undo those changes so OpenCanvas can manage it again.`);
    }
  }

  const changes: FileChange[] = [];
  const ext = /\.tsx$/.test(home) ? 'tsx' : 'jsx';
  const dir = path.posix.dirname(entry) || 'src';
  let page: PageConfig | null;
  try {
    page = mutate({ config, changes, dir, ext });
    const multi = config.pages.length > 1;
    if (state.routing === 'single' && multi) {
      const entryCode = read(info.root, entry);
      if (entryCode === null) throw new ProjectError(`${entry} could not be read.`);
      put(info.root, entry, wireRoutesIntoEntry(entryCode, entry, home, routesFile), changes);
      if (!fs.existsSync(path.join(info.root, 'vercel.json'))) {
        put(info.root, 'vercel.json', `${JSON.stringify({ rewrites: [{ source: '/(.*)', destination: '/index.html' }] }, null, 2)}\n`, changes);
      }
    }
    if (state.routing === 'managed' || multi) put(info.root, routesFile, generateRoutesFile(config.pages, routesFile), changes);
    put(info.root, CONFIG_FILE, serialize(config), changes);
  } catch (err) {
    rollback(info.root, changes);
    if (err instanceof RoutingError) throw new ProjectError(err.message);
    throw err;
  }
  return { state: pagesState(info, config), changes, page };
}

function rollback(root: string, changes: FileChange[]) {
  for (const c of [...changes].reverse()) {
    const abs = safeResolve(root, c.path);
    if (c.before === null) fs.rmSync(abs, { force: true });
    else fs.writeFileSync(abs, c.before, 'utf8');
  }
}

const uniqueName = (pages: PageConfig[], base: string) => {
  const names = new Set(pages.map((p) => p.name.toLowerCase()));
  let name = base;
  for (let n = 2; names.has(name.toLowerCase()); n++) name = `${base} ${n}`;
  return name;
};

const uniquePath = (pages: PageConfig[], name: string) => {
  const taken = new Set(pages.map((p) => p.path));
  const base = `/${pageSlug(name)}`;
  let p = base;
  for (let n = 2; taken.has(p); n++) p = `${base}-${n}`;
  return p;
};

function uniqueFile(root: string, dir: string, component: string, ext: string) {
  let rel = `${dir}/pages/${component}.${ext}`;
  for (let n = 2; fs.existsSync(path.join(root, rel)); n++) rel = `${dir}/pages/${component}${n}.${ext}`;
  return rel;
}

const pageId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createPage(info: ProjectInfo, rawName: string): PageMutation {
  return mutatePages(info, ({ config, changes, dir, ext }) => {
    const name = uniqueName(config.pages, rawName.trim() || 'New page');
    const component = componentName(name);
    const file = uniqueFile(info.root, dir, component, ext);
    put(info.root, file, newPageSource(component, name), changes);
    const page: PageConfig = { id: pageId(), name, path: uniquePath(config.pages, name), file };
    config.pages.push(page);
    return page;
  });
}

export function duplicatePage(info: ProjectInfo, id: string): PageMutation {
  return mutatePages(info, ({ config, changes, dir, ext }) => {
    const source = config.pages.find((p) => p.id === id);
    if (!source?.file) throw new ProjectError('That page has no source file to copy.');
    const code = read(info.root, source.file);
    if (code === null) throw new ProjectError(`${source.file} could not be read.`);
    const name = uniqueName(config.pages, `${source.name} copy`);
    const file = uniqueFile(info.root, dir, componentName(name), source.file.endsWith('.tsx') ? 'tsx' : ext);
    put(info.root, file, rebaseImports(code, source.file, file), changes);
    const page: PageConfig = { id: pageId(), name, path: uniquePath(config.pages, name), file };
    config.pages.splice(config.pages.indexOf(source) + 1, 0, page);
    return page;
  });
}

export function renamePage(info: ProjectInfo, id: string, rawName: string): PageMutation {
  return mutatePages(info, ({ config }) => {
    const page = config.pages.find((p) => p.id === id);
    const name = rawName.trim();
    if (!page) throw new ProjectError('That page no longer exists.');
    if (!name) throw new ProjectError('Give the page a name.');
    if (config.pages.some((p) => p !== page && p.name.toLowerCase() === name.toLowerCase())) throw new ProjectError(`A page called ${name} already exists.`);
    page.name = name;
    return page;
  });
}

export function reorderPages(info: ProjectInfo, ids: string[]): PageMutation {
  return mutatePages(info, ({ config }) => {
    const byId = new Map(config.pages.map((p) => [p.id, p]));
    const ordered = ids.map((id) => byId.get(id)).filter((p): p is PageConfig => !!p);
    if (ordered.length !== config.pages.length) throw new ProjectError('The page list changed. Try again.');
    config.pages = ordered;
    return null;
  });
}

export function deletePage(info: ProjectInfo, id: string): PageMutation {
  return mutatePages(info, ({ config, changes }) => {
    const page = config.pages.find((p) => p.id === id);
    if (!page) throw new ProjectError('That page no longer exists.');
    if (page.path === '/') throw new ProjectError('The home page can’t be deleted.');
    config.pages = config.pages.filter((p) => p !== page);
    if (page.file && isOwnedPageFile(info, page.file)) put(info.root, page.file, null, changes);
    return page;
  });
}

/** Only files OpenCanvas created under `pages/` that nothing else imports are deleted with their page. */
function isOwnedPageFile(info: ProjectInfo, file: string): boolean {
  if (!/\/pages\/[^/]+\.(jsx|tsx)$/.test(file)) return false;
  const base = path.posix.basename(file).replace(/\.(jsx|tsx)$/, '');
  const files: string[] = [];
  sourceFiles(info.root, 'src', files);
  const routes = info.entryFile ? routesFileFor(info.entryFile) : '';
  const pattern = new RegExp(`from\\s+['"][^'"]*/${base}(\\.(jsx|tsx))?['"]`);
  return !files.some((f) => f !== file && f !== routes && pattern.test(read(info.root, f) ?? ''));
}
