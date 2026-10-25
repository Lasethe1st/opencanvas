/** Project-level OpenCanvas settings stored in `.opencanvas/project.json` inside the project. Never needed at runtime. */

export const CONFIG_FILE = '.opencanvas/project.json';
export const REFERENCES_DIR = '.opencanvas/references';

export type IconPack = 'lucide' | 'phosphor';
export type ReferenceRole = 'overall' | 'typography' | 'layout' | 'colour' | 'imagery';

export const REFERENCE_ROLES: { id: ReferenceRole; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'typography', label: 'Typography' },
  { id: 'layout', label: 'Layout' },
  { id: 'colour', label: 'Colour' },
  { id: 'imagery', label: 'Imagery' },
];

export interface DesignReference {
  id: string;
  title: string;
  /** Where the reference lives online; null for an uploaded image without a source. */
  url: string | null;
  /** Project-relative path of an uploaded image (under `.opencanvas/references/`). */
  imagePath: string | null;
  /** Provider id ("savee", "link", "upload"). */
  source: string;
  role: ReferenceRole;
  note: string;
  primary: boolean;
  addedAt: number;
  tags: string[];
  colors: string[];
}

export interface DesignSystemConfig {
  /** File name the tokens were imported from. */
  file: string;
  format: 'css' | 'tokens-json';
  tokens: Record<string, string>;
  importedAt: number;
}

export interface VisualStyle {
  /** 0 = minimal, 1 = expressive. */
  minimalExpressive: number;
  /** 0 = casual, 1 = professional. */
  casualProfessional: number;
}

export interface DirectionConfig {
  visualStyle: VisualStyle;
  font: string | null;
  iconPack: IconPack;
  references: DesignReference[];
  designSystem: DesignSystemConfig | null;
}

/** Workspace view kind. Only `design` pages participate in site routing / canvas frames. */
export type PageViewType = 'design' | 'agent' | 'code' | 'terminal' | 'three' | 'custom';

export const PAGE_VIEW_TYPES: { id: PageViewType; label: string }[] = [
  { id: 'design', label: 'Design' },
  { id: 'agent', label: 'Agent activity' },
  { id: 'code', label: 'Code' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'three', label: '3D / Three.js' },
  { id: 'custom', label: 'Custom' },
];

export interface PageConfig {
  id: string;
  name: string;
  /** URL path, always starting with "/". Empty for non-design pages. */
  path: string;
  /** Project-relative component file (design route or linked Three.js / R3F scene). */
  file: string | null;
  /** Workspace view type (default design). */
  viewType: PageViewType;
  /** Lucide icon name (e.g. layout-template). */
  icon: string;
}

export interface ProjectConfig {
  version: 1 | 2;
  pages: PageConfig[];
  direction: DirectionConfig;
  /** Default page id when opening the project. */
  defaultPageId?: string;
}

export function isDesignPage(page: PageConfig): boolean {
  return (page.viewType ?? 'design') === 'design';
}

export function designPages(pages: PageConfig[]): PageConfig[] {
  return pages.filter(isDesignPage);
}

/** How the project's pages are routed, which decides what OpenCanvas may change. */
export type PageRouting = 'single' | 'managed' | 'react-router' | 'next' | 'unsupported';

export interface ProjectPagesState {
  config: ProjectConfig;
  routing: PageRouting;
  /** Pages shown in the navigator (config pages, or routes detected from the project's own router). */
  pages: PageConfig[];
  canEditPages: boolean;
  /** Why pages can't be created here, when `canEditPages` is false. */
  pagesNote: string | null;
}

export interface PageMutation {
  state: ProjectPagesState;
  /** File changes for the undo history (includes the config file). */
  changes: { path: string; before: string | null; after: string | null }[];
  page: PageConfig | null;
}

export const HOME_PAGE_ID = 'home';

export function defaultDirection(): DirectionConfig {
  return { visualStyle: { minimalExpressive: 0.5, casualProfessional: 0.5 }, font: null, iconPack: 'lucide', references: [], designSystem: null };
}

export function defaultProjectConfig(homeFile: string | null = null): ProjectConfig {
  return {
    version: 2,
    pages: [{ id: HOME_PAGE_ID, name: 'Home', path: '/', file: homeFile, viewType: 'design', icon: 'layout-template' }],
    direction: defaultDirection(),
    defaultPageId: HOME_PAGE_ID,
  };
}

const VIEW_TYPES = new Set<PageViewType>(['design', 'agent', 'code', 'terminal', 'three', 'custom']);

function defaultIcon(viewType: PageViewType): string {
  if (viewType === 'agent') return 'git-branch';
  if (viewType === 'code') return 'file-code-2';
  if (viewType === 'terminal') return 'terminal';
  if (viewType === 'three') return 'box';
  return 'layout-template';
}

function normalizePage(raw: Partial<PageConfig>, fallbackPath = '/'): PageConfig | null {
  if (!raw || typeof raw.id !== 'string') return null;
  const viewType = VIEW_TYPES.has(raw.viewType as PageViewType) ? (raw.viewType as PageViewType) : 'design';
  const path =
    viewType === 'design'
      ? normalizePath(typeof raw.path === 'string' && raw.path.trim() ? raw.path : fallbackPath)
      : typeof raw.path === 'string' && raw.path.trim()
        ? normalizePath(raw.path)
        : '';
  const file =
    (viewType === 'design' || viewType === 'three') && typeof raw.file === 'string' && !raw.file.includes('..')
      ? raw.file
      : null;
  return {
    id: raw.id,
    name: text(raw.name).trim() || (path || raw.id),
    path,
    file,
    viewType,
    icon: text(raw.icon).trim() || defaultIcon(viewType),
  };
}

const unit = (v: unknown, fallback = 0.5) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);
const text = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(0, 24) : []);

export function normalizePath(path: string): string {
  const clean = `/${path.trim().replace(/^\/+|\/+$/g, '')}`;
  return clean.replace(/\/{2,}/g, '/');
}

function normalizeReference(raw: unknown): DesignReference | null {
  const r = raw as Partial<DesignReference> | null;
  if (!r || typeof r.id !== 'string') return null;
  const url = typeof r.url === 'string' && /^https?:\/\//i.test(r.url) ? r.url : null;
  const imagePath = typeof r.imagePath === 'string' && r.imagePath.startsWith(`${REFERENCES_DIR}/`) && !r.imagePath.includes('..') ? r.imagePath : null;
  if (!url && !imagePath) return null;
  const role = REFERENCE_ROLES.some((x) => x.id === r.role) ? (r.role as ReferenceRole) : 'overall';
  return {
    id: r.id,
    title: text(r.title, url ?? 'Reference').slice(0, 200),
    url,
    imagePath,
    source: text(r.source, url ? 'link' : 'upload'),
    role,
    note: text(r.note).slice(0, 1000),
    primary: !!r.primary,
    addedAt: typeof r.addedAt === 'number' ? r.addedAt : 0,
    tags: strings(r.tags),
    colors: strings(r.colors).filter((c) => /^#[0-9a-f]{3,8}$/i.test(c)),
  };
}

function normalizeDesignSystem(raw: unknown): DesignSystemConfig | null {
  const d = raw as Partial<DesignSystemConfig> | null;
  if (!d || typeof d.file !== 'string' || !d.tokens || typeof d.tokens !== 'object') return null;
  const tokens: Record<string, string> = {};
  for (const [k, v] of Object.entries(d.tokens)) if (typeof v === 'string') tokens[k] = v;
  return { file: d.file, format: d.format === 'tokens-json' ? 'tokens-json' : 'css', tokens, importedAt: typeof d.importedAt === 'number' ? d.importedAt : 0 };
}

export function normalizeDirection(raw: unknown): DirectionConfig {
  const d = (raw ?? {}) as Partial<DirectionConfig>;
  const vs = (d.visualStyle ?? {}) as Partial<VisualStyle>;
  const references = (Array.isArray(d.references) ? d.references : []).map(normalizeReference).filter((r): r is DesignReference => !!r);
  let seenPrimary = false;
  for (const r of references) {
    if (r.primary && seenPrimary) r.primary = false;
    if (r.primary) seenPrimary = true;
  }
  return {
    visualStyle: { minimalExpressive: unit(vs.minimalExpressive), casualProfessional: unit(vs.casualProfessional) },
    font: typeof d.font === 'string' && d.font.trim() ? d.font.trim() : null,
    iconPack: d.iconPack === 'phosphor' ? 'phosphor' : 'lucide',
    references,
    designSystem: normalizeDesignSystem(d.designSystem),
  };
}

/** Validates a stored config; anything unusable falls back to defaults so old projects keep opening. */
export function normalizeProjectConfig(raw: unknown, homeFile: string | null = null): ProjectConfig {
  const value = raw as Partial<ProjectConfig> | null;
  const config = defaultProjectConfig(homeFile);
  if (!value || typeof value !== 'object') return config;
  const pages: PageConfig[] = [];
  const ids = new Set<string>();
  const designPaths = new Set<string>();
  for (const p of Array.isArray(value.pages) ? (value.pages as Partial<PageConfig>[]) : []) {
    const page = normalizePage(p);
    if (!page || ids.has(page.id)) continue;
    if (page.viewType === 'design') {
      if (!page.path || designPaths.has(page.path)) continue;
      designPaths.add(page.path);
    }
    ids.add(page.id);
    pages.push(page);
  }
  if (![...pages].some((p) => p.viewType === 'design' && p.path === '/')) pages.unshift(config.pages[0]);
  const defaultPageId =
    typeof value.defaultPageId === 'string' && ids.has(value.defaultPageId) ? value.defaultPageId : pages.find((p) => p.viewType === 'design')?.id ?? pages[0]?.id ?? HOME_PAGE_ID;
  return { version: 2, pages, direction: normalizeDirection(value.direction), defaultPageId };
}

export function pageSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'page'
  );
}

/** PascalCase identifier for a page component ("about us" → "AboutUs"). */
export function componentName(name: string): string {
  const id = pageSlug(name)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return /^[A-Z]/.test(id) ? id : `Page${id}`;
}
