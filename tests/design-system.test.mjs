import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');

test('migrate flattens legacy DesignSystemConfig into tokens', () => {
  const doc = h.migrateFlatDesignSystem({
    file: 'tokens.css',
    format: 'css',
    importedAt: 1,
    tokens: {
      '--color-primary': '#112233',
      '--space-md': '16px',
      '--color-primary (.dark)': '#aabbcc',
    },
  });
  assert.ok(doc.tokens.length >= 2);
  const primary = doc.tokens.find((t) => t.path.includes('color') && t.path.includes('primary'));
  assert.ok(primary);
  assert.equal(primary.value.kind, 'raw');
});

test('resolver resolves aliases and detects cycles', () => {
  const doc = h.emptyDesignSystem();
  doc.tokens = [
    { id: 'blue-600', path: 'color.blue.600', type: 'color', role: 'primitive', value: { kind: 'raw', value: '#2563eb' } },
    { id: 'primary', path: 'color.primary', type: 'color', role: 'semantic', value: { kind: 'alias', ref: 'color.blue.600' } },
  ];
  assert.equal(h.resolveTokenValue(doc, 'color.primary'), '#2563eb');

  doc.tokens = [
    { id: 'a', path: 'a', type: 'other', role: 'semantic', value: { kind: 'alias', ref: 'b' } },
    { id: 'b', path: 'b', type: 'other', role: 'semantic', value: { kind: 'alias', ref: 'a' } },
  ];
  assert.throws(() => h.resolveTokenValue(doc, 'a'));
  assert.ok(h.findCycles(doc).length >= 1);
});

test('css emit writes :root and dark theme variables', () => {
  const doc = h.emptyDesignSystem();
  doc.tokens = [
    {
      id: 'primary',
      path: 'color.primary',
      type: 'color',
      role: 'semantic',
      value: { kind: 'raw', value: '#111' },
      themes: { dark: { kind: 'raw', value: '#eee' } },
    },
  ];
  const css = h.emitDesignTokensCss(doc);
  assert.match(css, /:root\s*\{/);
  assert.match(css, /--color-primary:\s*#111/);
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /--color-primary:\s*#eee/);
});

test('dependency graph finds var() usages in CSS', () => {
  const refs = h.extractCssVarRefs('.x { color: var(--color-primary); gap: var(--space-md, 8px); }');
  assert.deepEqual(refs.sort(), ['--color-primary', '--space-md'].sort());

  const doc = h.emptyDesignSystem();
  doc.tokens = [{ id: 'primary', path: 'color.primary', type: 'color', role: 'semantic', value: { kind: 'raw', value: 'red' } }];
  const css = '[data-oc="hero"] { color: var(--color-primary); }\n[data-oc="cta"] { background: var(--color-primary); }';
  const g = h.buildDependencyGraph(doc, css);
  assert.ok(g.edges.some((e) => e.kind === 'var-ref' && e.to === 'primary'));
  const impact = h.impactSummary(doc, 'primary', css);
  assert.deepEqual(impact.styleKeys.sort(), ['cta', 'hero'].sort());
  assert.equal(impact.cssVar, '--color-primary');
});

test('shadcn components.json seeds ui registry entries', () => {
  const { components, uiDir } = h.componentsFromShadcn(
    { aliases: { ui: '@/components/ui' } },
    ['src/components/ui/button.tsx', 'src/components/ui/card.tsx', 'src/components/ui/utils.ts'],
  );
  assert.equal(uiDir, 'src/components/ui');
  assert.ok(components.some((c) => c.id === 'ui-button' && c.name === 'Button'));
  assert.ok(components.some((c) => c.id === 'ui-card'));
  assert.ok(!components.some((c) => c.id === 'ui-utils'));
});

test('validation flags missing active theme; DTCG export includes $value', () => {
  const doc = h.emptyDesignSystem();
  doc.activeThemeId = 'missing';
  doc.tokens = [{ id: 'x', path: 'x', type: 'other', role: 'primitive', value: { kind: 'raw', value: '1' } }];
  const issues = h.validateDesignSystem(doc);
  assert.ok(issues.some((i) => i.code === 'active-theme'));
  const json = h.exportDtcgJson({ ...doc, activeThemeId: 'light' });
  assert.match(json, /"\$value"/);
  assert.equal(h.cssVarName('color.primary'), '--color-primary');
});
