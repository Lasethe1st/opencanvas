import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import cssWorker from 'monaco-editor/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

/* Without the project's node_modules typings, semantic checks only produce noise. Syntax errors still show. */
const ts = (monaco.languages as any).typescript;
if (ts) {
  for (const defaults of [ts.typescriptDefaults, ts.javascriptDefaults]) {
    defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
    defaults.setCompilerOptions({ jsx: ts.JsxEmit.Preserve, allowJs: true, target: ts.ScriptTarget.ESNext, allowNonTsExtensions: true });
  }
}

monaco.editor.defineTheme('oc-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#ffffff',
    'editor.lineHighlightBackground': '#3b82f60a',
    'editorLineNumber.foreground': '#b4b4bd',
    'editorLineNumber.activeForeground': '#55555f',
    'editor.selectionBackground': '#3b82f626',
  },
});
monaco.editor.defineTheme('oc-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#1c1c1c',
    'editor.lineHighlightBackground': '#ffffff08',
    'editorGutter.background': '#1c1c1c',
    'editorLineNumber.foreground': '#555555',
    'editorLineNumber.activeForeground': '#b4b4b4',
    'editor.selectionBackground': '#3b82f640',
  },
});

loader.config({ monaco });

export function languageFor(path: string): string {
  if (/\.(tsx?|mts|cts)$/.test(path)) return 'typescript';
  if (/\.(jsx?|mjs|cjs)$/.test(path)) return 'javascript';
  if (/\.css$/.test(path)) return 'css';
  if (/\.scss$/.test(path)) return 'scss';
  if (/\.json$/.test(path)) return 'json';
  if (/\.html?$/.test(path)) return 'html';
  if (/\.md$/.test(path)) return 'markdown';
  if (/\.svg$/.test(path)) return 'xml';
  return 'plaintext';
}

export { monaco };
