/** Persist and sync the project design system document + generated CSS. */
import fs from 'node:fs';
import path from 'node:path';
import {
  buildDependencyGraph,
  componentsFromShadcn,
  cssJsonAdapter,
  DS_CSS_FILE,
  DS_FILE,
  emptyDesignSystem,
  emitDesignTokensCss,
  guessTokenType,
  impactSummary,
  mergeComponents,
  migrateFlatDesignSystem,
  pushHistory,
  restoreRevision,
  validateDesignSystem,
  type DesignSystemDocument,
  type Token,
  type TokenValue,
} from '../../shared/design-system';
import type { DesignSystemConfig } from '../../shared/project-config';
import type { ProjectInfo } from '../../shared/types';
import { ProjectError, safeResolve } from './project';
import { readConfig } from './project-config';

function readJson(abs: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeDoc(raw: unknown, fallbackName: string): DesignSystemDocument {
  if (!raw || typeof raw !== 'object') return emptyDesignSystem(fallbackName);
  const d = raw as Partial<DesignSystemDocument>;
  if (d.version !== 1 || !Array.isArray(d.tokens)) return emptyDesignSystem(fallbackName);
  return {
    version: 1,
    revision: typeof d.revision === 'number' ? d.revision : 0,
    meta: d.meta ?? { name: fallbackName, updatedAt: Date.now() },
    tokens: d.tokens as Token[],
    themes: Array.isArray(d.themes) ? d.themes : emptyDesignSystem().themes,
    components: Array.isArray(d.components) ? d.components : [],
    activeThemeId: typeof d.activeThemeId === 'string' ? d.activeThemeId : 'light',
    history: Array.isArray(d.history) ? d.history : [],
  };
}

export function designSystemPath(root: string) {
  return safeResolve(root, DS_FILE);
}

export function designTokensCssPath(info: ProjectInfo) {
  const stylesDir = path.posix.dirname(info.stylesFile.replace(/\\/g, '/'));
  const rel = stylesDir && stylesDir !== '.' ? `${stylesDir}/design-tokens.css` : DS_CSS_FILE;
  return { rel, abs: safeResolve(info.root, rel) };
}

export function loadDesignSystem(info: ProjectInfo): DesignSystemDocument {
  const abs = designSystemPath(info.root);
  const existing = readJson(abs);
  if (existing) return normalizeDoc(existing, `${info.name} design system`);

  // Migrate from direction snapshot when present.
  const config = readConfig(info);
  const migrated = migrateFlatDesignSystem(config.direction.designSystem, info.name);
  if (migrated.tokens.length) {
    saveDesignSystem(info, migrated, { syncCss: true, historySummary: 'Migrated imported tokens' });
    return loadDesignSystem(info);
  }
  return migrated;
}

export function saveDesignSystem(
  info: ProjectInfo,
  doc: DesignSystemDocument,
  opts?: { syncCss?: boolean; historySummary?: string },
): DesignSystemDocument {
  let next = { ...doc, meta: { ...doc.meta, updatedAt: Date.now() } };
  if (opts?.historySummary) next = pushHistory(next, opts.historySummary);

  const abs = designSystemPath(info.root);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, abs);

  if (opts?.syncCss !== false) syncDesignTokensCss(info, next);
  return next;
}

export function syncDesignTokensCss(info: ProjectInfo, doc?: DesignSystemDocument) {
  const document = doc ?? loadDesignSystem(info);
  const { rel, abs } = designTokensCssPath(info);
  const css = emitDesignTokensCss(document);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, css, 'utf8');
  ensureCssImport(info, rel);
  return rel;
}

function ensureCssImport(info: ProjectInfo, tokensRel: string) {
  const entryCandidates = ['src/main.tsx', 'src/main.jsx', 'src/main.ts', 'src/main.js', 'src/index.tsx', 'src/index.jsx', 'src/App.tsx', 'src/App.jsx'];
  const entry = entryCandidates.find((f) => fs.existsSync(path.join(info.root, f)));
  if (!entry) return;
  const abs = path.join(info.root, entry);
  let src = fs.readFileSync(abs, 'utf8');
  const importPath = `./${path.posix.relative(path.posix.dirname(entry), tokensRel).replace(/\\/g, '/')}`;
  if (src.includes('design-tokens.css')) return;
  const line = `import '${importPath}';\n`;
  src = line + src;
  fs.writeFileSync(abs, src, 'utf8');
}

export function importIntoDesignSystem(
  info: ProjectInfo,
  text: string,
  format: 'css' | 'tokens-json',
  fileName: string,
): DesignSystemDocument {
  const imported = cssJsonAdapter.importText(text, format, fileName);
  const current = loadDesignSystem(info);
  const merged: DesignSystemDocument = {
    ...current,
    tokens: imported.tokens,
    themes: imported.themes.length ? imported.themes : current.themes,
    meta: {
      ...current.meta,
      importedFrom: imported.meta.importedFrom,
      updatedAt: Date.now(),
    },
  };
  return saveDesignSystem(info, merged, { historySummary: `Imported ${fileName}`, syncCss: true });
}

export function hydrateFromDirection(info: ProjectInfo, flat: DesignSystemConfig | null): DesignSystemDocument {
  if (!flat) return loadDesignSystem(info);
  const current = loadDesignSystem(info);
  const migrated = migrateFlatDesignSystem(flat, info.name);
  return saveDesignSystem(
    info,
    {
      ...current,
      tokens: migrated.tokens,
      themes: migrated.themes.length ? migrated.themes : current.themes,
      meta: {
        ...current.meta,
        importedFrom: migrated.meta.importedFrom,
        updatedAt: Date.now(),
      },
    },
    { historySummary: `Imported ${flat.file}`, syncCss: true },
  );
}

/** Read components.json + ui folder and merge into the registry (idempotent). */
export function seedShadcnRegistry(info: ProjectInfo, doc?: DesignSystemDocument): DesignSystemDocument {
  const current = doc ?? loadDesignSystem(info);
  const cfgPath = path.join(info.root, 'components.json');
  if (!fs.existsSync(cfgPath)) return current;
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return current;
  }
  const aliases =
    json && typeof json === 'object' && (json as { aliases?: { ui?: string } }).aliases
      ? (json as { aliases: { ui?: string } }).aliases
      : {};
  const uiAlias = typeof aliases.ui === 'string' ? aliases.ui.replace(/^@\//, 'src/') : 'src/components/ui';
  const uiAbs = path.join(info.root, uiAlias);
  if (!fs.existsSync(uiAbs)) return current;
  const uiFiles: string[] = [];
  for (const name of fs.readdirSync(uiAbs)) {
    if (!/\.(tsx|jsx)$/i.test(name)) continue;
    uiFiles.push(path.posix.join(uiAlias.replace(/\\/g, '/'), name));
  }
  const { components } = componentsFromShadcn(json, uiFiles);
  if (!components.length) return current;
  const merged = mergeComponents(current, components);
  if (JSON.stringify(merged.components) === JSON.stringify(current.components)) return current;
  return saveDesignSystem(info, merged, { historySummary: `Seeded ${components.length} shadcn/ui components`, syncCss: false });
}

export function designSystemStatus(info: ProjectInfo) {
  const doc = seedShadcnRegistry(info);
  const styles = (() => {
    try {
      return fs.readFileSync(safeResolve(info.root, info.stylesFile), 'utf8');
    } catch {
      return '';
    }
  })();
  return {
    document: doc,
    issues: validateDesignSystem(doc),
    graph: buildDependencyGraph(doc, styles),
    cssFile: designTokensCssPath(info).rel,
  };
}

function parseTokenValue(raw: string): TokenValue {
  const value = raw.trim();
  if (value.startsWith('{') && value.endsWith('}')) return { kind: 'alias', ref: value.slice(1, -1).trim() };
  if (value.startsWith('var(')) {
    const inner = value.replace(/^var\(\s*|\s*\)$/g, '').split(',')[0]?.trim() ?? value;
    return { kind: 'alias', ref: inner };
  }
  return { kind: 'raw', value };
}

/** Preview (apply=false) or write a token change; always returns impact. */
export function proposeTokenChange(
  info: ProjectInfo,
  args: { tokenId: string; value: string; apply?: boolean; summary?: string; themeId?: string },
): {
  applied: boolean;
  tokenId: string;
  path: string;
  previous: string;
  next: string;
  impact: ReturnType<typeof impactSummary>;
  document?: DesignSystemDocument;
} {
  const doc = loadDesignSystem(info);
  const token = doc.tokens.find((t) => t.id === args.tokenId || t.path === args.tokenId);
  if (!token) throw new ProjectError(`Unknown token “${args.tokenId}”.`);
  const nextValue = parseTokenValue(args.value);
  const formatValue = (v: TokenValue) => (v.kind === 'raw' ? v.value : `{${v.ref}}`);
  const themeOverride = args.themeId ? token.themes?.[args.themeId] : undefined;
  const previous = formatValue(themeOverride ?? token.value);
  const nextDisplay = formatValue(nextValue);
  const impact = tokenImpact(info, token.id);
  if (!args.apply) {
    return {
      applied: false,
      tokenId: token.id,
      path: token.path,
      previous,
      next: nextDisplay,
      impact,
    };
  }
  const updated: Token = args.themeId
    ? {
        ...token,
        themes: { ...token.themes, [args.themeId]: nextValue },
        type: guessTokenType(token.path, nextDisplay),
      }
    : {
        ...token,
        value: nextValue,
        type: guessTokenType(token.path, nextDisplay),
      };
  const document = updateToken(info, updated, args.summary ?? `propose_token_change ${token.path} → ${nextDisplay}`);
  return {
    applied: true,
    tokenId: token.id,
    path: token.path,
    previous,
    next: nextDisplay,
    impact: tokenImpact(info, token.id),
    document,
  };
}

export function updateToken(info: ProjectInfo, token: Token, summary?: string) {
  const doc = loadDesignSystem(info);
  const tokens = doc.tokens.some((t) => t.id === token.id)
    ? doc.tokens.map((t) => (t.id === token.id ? token : t))
    : [...doc.tokens, token];
  return saveDesignSystem(info, { ...doc, tokens }, { historySummary: summary ?? `Updated ${token.path}`, syncCss: true });
}

export function setActiveTheme(info: ProjectInfo, themeId: string) {
  const doc = loadDesignSystem(info);
  if (!doc.themes.some((t) => t.id === themeId)) throw new ProjectError(`Unknown theme “${themeId}”.`);
  return saveDesignSystem(info, { ...doc, activeThemeId: themeId }, { historySummary: `Active theme → ${themeId}`, syncCss: true });
}

export function tokenImpact(info: ProjectInfo, tokenId: string) {
  const doc = loadDesignSystem(info);
  let styles = '';
  try {
    styles = fs.readFileSync(safeResolve(info.root, info.stylesFile), 'utf8');
  } catch {
    /* empty */
  }
  return impactSummary(doc, tokenId, styles);
}

export function restoreDesignSystem(info: ProjectInfo, changeId: string) {
  const doc = loadDesignSystem(info);
  const next = restoreRevision(doc, changeId);
  if (!next) throw new ProjectError('That revision was not found.');
  const abs = designSystemPath(info.root);
  fs.writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  syncDesignTokensCss(info, next);
  return next;
}

export function exportDesignSystem(info: ProjectInfo, format: 'css' | 'tokens-json') {
  const doc = loadDesignSystem(info);
  return format === 'css' ? cssJsonAdapter.exportCss(doc) : cssJsonAdapter.exportJson(doc);
}
