export type Breakpoint = 'base' | 'tablet' | 'mobile';

export interface BreakpointConfig {
  tablet: number;
  mobile: number;
  detected: boolean;
}

export type Framework = 'vite-react' | 'next' | 'cra' | 'unknown';
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

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
  editable: boolean;
  warnings: string[];
  breakpoints: BreakpointConfig;
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
  | 'link';

export type EditCommand =
  | { type: 'setStyle'; id: string; breakpoint: Breakpoint; styles: Record<string, string> }
  | { type: 'insert'; parentId: string | null; kind: InsertKind }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; direction: 'up' | 'down' }
  | { type: 'rename'; id: string; name: string }
  | { type: 'setText'; id: string; text: string }
  | { type: 'setAttribute'; id: string; name: string; value: string };

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
  attributes: Record<string, string>;
  styles: Record<Breakpoint, Record<string, string>>;
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

export interface ExportResult {
  ok: boolean;
  path?: string;
  error?: string;
  fileCount?: number;
  instructions?: string[];
}

export interface RecentProject {
  root: string;
  name: string;
  openedAt: number;
}
