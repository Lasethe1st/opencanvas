export type Breakpoint = 'base' | 'tablet' | 'mobile';

export interface BreakpointConfig {
  tablet: number;
  mobile: number;
  detected: boolean;
}

export type Framework = 'vite-react' | 'next' | 'cra' | 'unknown';
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export const FRAMEWORK_LABELS: Record<Framework, string> = { 'vite-react': 'React + Vite', next: 'Next.js', cra: 'Create React App', unknown: 'Unknown framework' };

export interface ProjectInfo {
  root: string;
  name: string;
  framework: Framework;
  packageManager: PackageManager;
  hasNodeModules: boolean;
  /** Declared in package.json but absent from node_modules (only checked when node_modules exists). */
  missingDependencies: string[];
  /** Vite+React projects whose deps the editor can supply without an install. */
  managedPreview: boolean;
  entryFile: string | null;
  stylesFile: string;
  /** Whether OpenCanvas can run a live preview for this framework. */
  canPreview: boolean;
  editable: boolean;
  /** Project folders whose JSX gets source ids, e.g. ["src"] or ["app", "components"]. */
  editableRoots: string[];
  warnings: string[];
  breakpoints: BreakpointConfig;
}

/** What OpenCanvas found in a freshly imported project. */
export interface ProjectSummary {
  framework: string;
  packageManager: PackageManager;
  router: string | null;
  tailwind: boolean;
  shadcn: boolean;
  scripts: string[];
  /** Plain sentence on what can be edited visually, or why nothing can. */
  editing: string;
}

export interface ImportedProject {
  project: ProjectInfo;
  summary: ProjectSummary;
  fileCount: number;
  skipped: number;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: FileNode[];
}

export type ThemePreference = 'system' | 'light' | 'dark';

export type TemplateId = 'blank' | 'landing' | 'portfolio' | 'dashboard' | 'marketing';

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  description: string;
}

export interface FileChange {
  path: string;
  before: string | null;
  after: string | null;
}

export interface EditResult {
  ok: boolean;
  error?: string;
  changes: FileChange[];
  /** Source id of the element that should be selected after the edit. */
  selectId?: string | null;
}

export type InsertKind =
  | 'div'
  | 'section'
  | 'flex'
  | 'grid'
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'button'
  | 'link'
  | 'header'
  | 'nav'
  | 'footer'
  | 'list'
  | 'form'
  | 'input'
  | 'textarea';

/** Tags an element can be switched between with the `setTag` edit (all can hold children). */
export const RETAGGABLE_TAGS = [
  'div', 'section', 'header', 'footer', 'nav', 'main', 'article', 'aside',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'blockquote', 'small', 'strong', 'em', 'label',
  'ul', 'ol', 'li', 'a', 'button', 'figure', 'figcaption',
];

/** Interaction state a style applies to; `hover` writes `[data-oc="…"]:hover` rules. */
export type StyleState = 'default' | 'hover';

export type EditCommand =
  | {
      type: 'setStyle';
      id: string;
      breakpoint: Breakpoint;
      styles: Record<string, string>;
      state?: StyleState;
      /** Google Fonts `family=` parameter to load from index.html, e.g. `Playfair Display:wght@400..900`. */
      googleFont?: string;
      /** Other elements of a multi-selection that get the same styles. */
      extraIds?: string[];
    }
  | { type: 'insert'; parentId: string | null; kind: InsertKind; image?: { src: string; alt: string } }
  | { type: 'remove'; id: string; extraIds?: string[] }
  | { type: 'move'; id: string; direction: 'up' | 'down' }
  | { type: 'duplicate'; id: string; extraIds?: string[] }
  | { type: 'group'; id: string; extraIds?: string[] }
  | { type: 'ungroup'; id: string }
  | { type: 'setTag'; id: string; tag: string }
  /** Inserts a JSX element written by hand (or by an agent) into/after `parentId`. */
  | { type: 'insertJsx'; parentId: string; jsx: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'setText'; id: string; text: string }
  | { type: 'setAttribute'; id: string; name: string; value: string };

/** Whether an element's text is plain (editable) or why it isn't. */
export type TextReason = 'plain' | 'nested' | 'expression' | 'self-closing';

/** Information about an element as found in the source file. */
export interface SourceElementInfo {
  id: string;
  tag: string;
  file: string;
  line: number;
  name: string | null;
  key: string | null;
  text: string | null;
  textEditable: boolean;
  textReason: TextReason;
  attributes: Record<string, string>;
  styles: Record<Breakpoint, Record<string, string>>;
  /** `:hover` declarations per breakpoint. */
  hover: Record<Breakpoint, Record<string, string>>;
}

export type PreviewStatus =
  | { state: 'stopped' }
  | { state: 'starting'; log: string }
  | { state: 'running'; url: string; log: string }
  | { state: 'error'; error: string; log: string };

export interface DomNode {
  id: string;
  tag: string;
  name: string;
  children: DomNode[];
}

export interface SelectedElement {
  id: string;
  tag: string;
  name: string;
  parentId: string | null;
  computed: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
}

export interface McpStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  url: string;
  token: string;
  error: string | null;
  calls: number;
  lastTool: string | null;
  lastAt: number | null;
}

/** An edit made through MCP, for the editor to put in its undo history. */
export interface McpApplied {
  label: string;
  changes: FileChange[];
  /** Element to select afterwards; undefined keeps the current selection. */
  selectId?: string | null;
  /** In-app AI turn the change belongs to; changes of one turn share a single undo step. */
  turnId?: string;
}

export type AuditSeverity = 'error' | 'warning' | 'info';
export type AuditCategory = 'errors' | 'links' | 'layout' | 'a11y' | 'seo' | 'project';

export interface AuditIssue {
  /** Stable across runs: rule plus element or detail. */
  key: string;
  rule: string;
  severity: AuditSeverity;
  category: AuditCategory;
  title: string;
  detail?: string;
  fix: string;
  /** Source element id ("src/App.jsx:12:6") when the problem is tied to an element. */
  id: string | null;
  name: string | null;
  /** Names of the frames (screen sizes) where it was found. */
  frames: string[];
}

export interface AuditReport {
  at: number;
  frames: { name: string; width: number }[];
  issues: AuditIssue[];
}

export interface McpRequest {
  id: number;
  action: 'undo' | 'redo' | 'select' | 'selection' | 'audit';
  arg?: unknown;
}

export interface ImportResult {
  /** Project-relative paths of the imported files. */
  files: string[];
  /** Changes for the undo history (empty when binary files were involved). */
  changes: FileChange[];
  undoable: boolean;
}

export type GitFileState = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflict';

export interface GitStatus {
  /** False when the git executable could not be found. */
  installed: boolean;
  repo: boolean;
  /** Set when the project folder sits inside a repository rooted elsewhere. */
  parentRepo: string | null;
  branch: string | null;
  remote: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: { path: string; state: GitFileState }[];
  lastCommit: { hash: string; message: string; when: string } | null;
  identity: { name: string; email: string } | null;
}

export interface ExportResult {
  ok: boolean;
  path?: string;
  error?: string;
  fileCount?: number;
  instructions?: string[];
  /** True when the ZIP got a generated .env.example listing variable names only. */
  envExampleAdded?: boolean;
}

export interface ExportIssue {
  severity: 'error' | 'warning' | 'info';
  title: string;
  file?: string;
  fix: string;
}

export interface ExportReport {
  issues: ExportIssue[];
  /** Environment variables the code reads, by name. */
  envVars: string[];
  /** Contents of the .env.example the export will add or complete; null when the project's own is complete. */
  envExample: string | null;
  checkedFiles: number;
}

export type BuildCheckStep = 'install' | 'typecheck' | 'build';

export interface BuildCheckResult {
  /** "unavailable" means it couldn't be checked (offline, slow registry), not that the project is broken. */
  state: 'passed' | 'failed' | 'unavailable' | 'cancelled';
  step?: BuildCheckStep;
  message: string;
  steps: { step: BuildCheckStep; ok: boolean; skipped?: boolean }[];
}

export interface RecentProject {
  root: string;
  name: string;
  openedAt: number;
  /** The project's favicon as a data URL, when it has one. */
  icon?: string | null;
}

export type GoLiveResult =
  | { status: 'live'; url: string | null; inspectUrl: string | null }
  /** Vercel isn't set up for this machine or repository yet; `importUrl` starts the import on vercel.com. */
  | { status: 'needs-vercel'; importUrl: string; reason: 'no-account' | 'signed-out' };

export interface OpenedFile {
  project: ProjectInfo;
  /** Project-relative path of the chosen file. */
  file: string;
}
