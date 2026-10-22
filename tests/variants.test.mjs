import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');

const APP = `export default function App() {
  return (
    <main data-oc-name="Page">
      <h1 className="title">Hello</h1>
      <p>Sub</p>
    </main>
  );
}
`;

function idOf(code, needle) {
  const offset = code.indexOf(needle);
  const { line, column } = h.offsetToLineCol(code, offset);
  return { line, column, id: `src/App.jsx:${line}:${column}` };
}

function tempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-var-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'App.jsx'), APP, 'utf8');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"t","private":true}', 'utf8');
  return {
    root,
    name: 't',
    framework: 'vite-react',
    editable: true,
    entryFile: 'src/main.jsx',
    stylesFile: 'src/open-canvas.css',
    breakpoints: { tablet: 834, mobile: 390 },
    packageManager: 'npm',
    missingDependencies: [],
    hasNodeModules: false,
    managedPreview: true,
    canPreview: true,
    editableRoots: ['src'],
    warnings: [],
  };
}

test('replaceElementJsx swaps a single element and rejects bad JSX', () => {
  const { line, column } = idOf(APP, '<h1');
  const { code } = h.replaceElementJsx(APP, 'App.jsx', line, column, '<h1 className="title">Welcome</h1>');
  assert.match(code, /Welcome/);
  assert.doesNotMatch(code, />Hello</);
  assert.throws(() => h.replaceElementJsx(APP, 'App.jsx', line, column, '<h1/><p/>'), /JSX|snippet|parse/i);
  assert.throws(() => h.replaceElementJsx(APP, 'App.jsx', line, column, 'just text'), /single JSX|snippet/i);
});

test('variant override resolution picks the override when present', () => {
  const files = new Set(['.opencanvas/variants/abc/src/App.jsx']);
  assert.equal(h.resolveVariantOverride('abc', 'src/App.jsx', (rel) => files.has(rel)), '.opencanvas/variants/abc/src/App.jsx');
  assert.equal(h.resolveVariantOverride('abc', 'src/Other.jsx', (rel) => files.has(rel)), null);
  assert.equal(h.withOcv('/src/main.jsx', 'abc'), '/src/main.jsx?ocv=abc');
  assert.ok(h.shouldPropagateOcv('/src/main.jsx?ocv=abc', '/proj/src/App.jsx', ['/proj/src']));
  assert.equal(h.shouldPropagateOcv('/src/main.jsx?ocv=abc', '/proj/src/App.css', ['/proj/src']), false);
});

test('variant store lifecycle: propose, stale, apply, discard, export skip', async () => {
  const project = tempProject();
  try {
    h.ensureVariantsGitignore(project.root);
    assert.match(fs.readFileSync(path.join(project.root, '.gitignore'), 'utf8'), /\.opencanvas\/variants/);

    const { line, column, id } = idOf(APP, '<h1');
    const begun = h.beginVariantSet(project, { elementId: id, request: 'Bolder', count: 2 });
    assert.equal(begun.variants.length, 2);
    assert.equal(begun.variants[0].status, 'generating');

    const a = h.proposeVariant(project, { setId: begun.setId, label: 'Bold', jsx: '<h1 className="title">Bold</h1>' });
    assert.equal(a.status, 'ready');
    assert.ok(a.overrideFile);
    const overrideAbs = path.join(project.root, ...a.overrideFile.split('/'));
    assert.ok(fs.existsSync(overrideAbs));
    assert.equal(fs.readFileSync(path.join(project.root, 'src', 'App.jsx'), 'utf8'), APP);

    const b = h.proposeVariant(project, { setId: begun.setId, label: 'Soft', jsx: '<h1 className="title">Soft</h1>' });
    assert.equal(b.status, 'ready');

    // Stale when source changes.
    fs.writeFileSync(path.join(project.root, 'src', 'App.jsx'), APP.replace('Hello', 'Changed'), 'utf8');
    const stale = h.applyVariant(project, a.id);
    assert.equal(stale.record.status, 'stale');
    assert.equal(stale.result.ok, false);

    // Restore hash-matching source and apply the other ready variant.
    fs.writeFileSync(path.join(project.root, 'src', 'App.jsx'), APP, 'utf8');
    const applied = h.applyVariant(project, b.id);
    assert.equal(applied.result.ok, true);
    assert.match(fs.readFileSync(path.join(project.root, 'src', 'App.jsx'), 'utf8'), /Soft/);
    assert.equal(applied.result.changes.length, 1);

    h.discardVariant(project.root, a.id);
    const listed = h.listVariants(project.root);
    assert.ok(!listed.some((v) => v.id === a.id || v.id === b.id));

    // Export excludes variants folder.
    fs.mkdirSync(path.join(project.root, '.opencanvas', 'variants', 'x'), { recursive: true });
    fs.writeFileSync(path.join(project.root, '.opencanvas', 'variants', 'x', 'f.txt'), 'nope');
    const zip = await h.buildProjectZip(project);
    assert.ok(!zip.files.some((f) => f.startsWith('.opencanvas/variants/')));
    assert.ok(zip.skipped.some((f) => f.includes('.opencanvas/variants')));
  } finally {
    fs.rmSync(project.root, { recursive: true, force: true });
  }
});

test('variant tool set has no write tools', () => {
  const tools = h.createVariantTools({
    project: () => null,
    pages: () => null,
    referenceImage: () => '',
    edit: () => ({ ok: false, changes: [] }),
    inspect: () => ({ error: 'x' }),
    writeFile: () => ({ path: '', before: null, after: '' }),
    importFiles: () => ({ changes: [], undoable: false }),
    screenshot: async () => Buffer.alloc(0),
    renderer: async () => '',
    git: {},
    variants: { propose: () => ({}), list: () => [], apply: () => ({ ok: false }) },
  });
  const names = tools.map((t) => t.name);
  for (const n of h.VARIANT_TOOL_NAMES) assert.ok(names.includes(n), n);
  assert.ok(!names.includes('write_file'));
  assert.ok(!names.includes('insert_jsx'));
  assert.ok(!names.includes('set_styles'));
});
