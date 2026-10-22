import { parseCssTokens, parseJsonTokens, TokenImportError } from '../../design-tokens';
import { migrateFlatDesignSystem } from '../migrate';
import { emitDesignTokensCss } from '../transforms/css';
import type { DesignSystemDocument } from '../types';
import { cssVarName } from '../types';

export type ImportFormat = 'css' | 'tokens-json';

export interface DesignSystemAdapter {
  id: string;
  label: string;
  formats: ImportFormat[];
  importText(text: string, format: ImportFormat, fileName: string): DesignSystemDocument;
  exportCss(doc: DesignSystemDocument): string;
  exportJson(doc: DesignSystemDocument): string;
}

/** DTCG-ish nested JSON export. */
export function exportDtcgJson(doc: DesignSystemDocument): string {
  const root: Record<string, unknown> = {};
  for (const token of doc.tokens) {
    const parts = token.path.split('.');
    let cursor = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!cursor[p] || typeof cursor[p] !== 'object') cursor[p] = {};
      cursor = cursor[p] as Record<string, unknown>;
    }
    const leaf = parts[parts.length - 1];
    const value = token.value.kind === 'raw' ? token.value.value : `{${token.value.ref}}`;
    cursor[leaf] = { $type: token.type === 'other' ? 'string' : token.type, $value: value };
  }
  return `${JSON.stringify(root, null, 2)}\n`;
}

export const cssJsonAdapter: DesignSystemAdapter = {
  id: 'css-json',
  label: 'CSS variables & token JSON',
  formats: ['css', 'tokens-json'],
  importText(text, format, fileName) {
    const tokens = format === 'css' ? parseCssTokens(text) : parseJsonTokens(text);
    return migrateFlatDesignSystem({
      file: fileName,
      format,
      tokens,
      importedAt: Date.now(),
    });
  },
  exportCss: emitDesignTokensCss,
  exportJson: exportDtcgJson,
};

export function scanProjectCssForTokens(css: string): DesignSystemDocument {
  try {
    return cssJsonAdapter.importText(css, 'css', 'project.css');
  } catch (err) {
    if (err instanceof TokenImportError) return migrateFlatDesignSystem(null);
    throw err;
  }
}

export { TokenImportError, cssVarName };
