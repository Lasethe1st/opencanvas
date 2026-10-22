/** Canonical design-system document stored at `.opencanvas/design-system.json`. */

export type TokenType =
  | 'color'
  | 'space'
  | 'radius'
  | 'shadow'
  | 'font'
  | 'fontSize'
  | 'fontWeight'
  | 'lineHeight'
  | 'opacity'
  | 'motion'
  | 'breakpoint'
  | 'border'
  | 'other';

export type TokenValue =
  | { kind: 'raw'; value: string }
  | { kind: 'alias'; ref: string };

export interface Token {
  id: string;
  /** Dot path for grouping, e.g. color.primary */
  path: string;
  type: TokenType;
  /** Default / light value. */
  value: TokenValue;
  /** Theme overrides keyed by theme id. */
  themes?: Record<string, TokenValue>;
  description?: string;
  /** Primitive tokens are referenced by semantic ones. */
  role: 'primitive' | 'semantic';
}

export interface ThemeDef {
  id: string;
  label: string;
  /** When true, used for prefers-color-scheme: dark. */
  isDark?: boolean;
}

export interface ComponentVariant {
  id: string;
  label: string;
  /** Optional prop map, e.g. { size: 'sm' }. */
  props?: Record<string, string>;
}

export interface ComponentDef {
  id: string;
  name: string;
  description?: string;
  /** Project-relative source file. */
  file: string;
  tokenDeps: string[];
  variants: ComponentVariant[];
  states: string[];
  props: { name: string; description?: string }[];
}

export interface DesignSystemChange {
  id: string;
  at: number;
  summary: string;
  /** Snapshot of tokens+themes+components at this revision (compact). */
  snapshot: DesignSystemSnapshot;
}

export interface DesignSystemSnapshot {
  tokens: Token[];
  themes: ThemeDef[];
  components: ComponentDef[];
  activeThemeId: string;
}

export interface DesignSystemMeta {
  name: string;
  updatedAt: number;
  /** Source of last import, when applicable. */
  importedFrom?: { file: string; format: 'css' | 'tokens-json'; at: number };
}

export interface DesignSystemDocument {
  version: 1;
  revision: number;
  meta: DesignSystemMeta;
  tokens: Token[];
  themes: ThemeDef[];
  components: ComponentDef[];
  activeThemeId: string;
  history: DesignSystemChange[];
}

export const DS_FILE = '.opencanvas/design-system.json';
export const DS_CSS_FILE = 'src/design-tokens.css';

export const DEFAULT_THEMES: ThemeDef[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark', isDark: true },
];

export function emptyDesignSystem(name = 'Design system'): DesignSystemDocument {
  const now = Date.now();
  return {
    version: 1,
    revision: 0,
    meta: { name, updatedAt: now },
    tokens: [],
    themes: [...DEFAULT_THEMES],
    components: [],
    activeThemeId: 'light',
    history: [],
  };
}

export function cssVarName(tokenId: string): string {
  const cleaned = tokenId.replace(/^--/, '').replace(/[^\w.-]+/g, '-').replace(/^\.+|\.+$/g, '');
  return `--${cleaned.replace(/\./g, '-')}`;
}
