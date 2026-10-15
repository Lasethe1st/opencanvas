import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(APP_ROOT, 'tests', '.tmp');

const versions = Object.fromEntries(
  [['react', 'react'], ['reactDom', 'react-dom'], ['vite', 'vite'], ['pluginReact', '@vitejs/plugin-react']].map(([k, pkg]) => [
    k,
    JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'node_modules', pkg, 'package.json'), 'utf8')).version,
  ]),
);

function makeProject(template) {
  const root = path.join(TMP, `${template}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(root, { recursive: true });
  h.writeFiles(root, h.generateTemplate(template, path.basename(root), 'Test', versions));
  return h.detectProject(root);
}

function idFor(project, file, needle) {
  const code = fs.readFileSync(path.join(project.root, file), 'utf8');
  const { line, column } = h.offsetToLineCol(code, code.indexOf(needle));
  return `${file}:${line}:${column}`;
}

const read = (project, file) => fs.readFileSync(path.join(project.root, file), 'utf8');

test('all templates generate detectable, parseable projects', () => {
  for (const t of h.TEMPLATES) {
    const project = makeProject(t.id);
    assert.equal(project.framework, 'vite-react');
    assert.equal(project.managedPreview, true);
    assert.equal(project.entryFile, 'src/main.jsx');
    for (const file of ['src/App.jsx', 'src/main.jsx']) h.parseSource(read(project, file), file);
  }
});

test('style edit updates JSX + CSS, and undo/redo restore exact files', () => {
  const project = makeProject('landing');
  const heroBefore = read(project, 'src/components/Hero.jsx');
  const cssBefore = read(project, 'src/open-canvas.css');
  const id = idFor(project, 'src/components/Hero.jsx', '<section');

  const res = h.applyEdit(project, { type: 'setStyle', id, breakpoint: 'base', styles: { 'margin-top': '24px', 'padding-left': '16px' } });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.selectId, id);
  const hero = read(project, 'src/components/Hero.jsx');
  const key = /data-oc="([^"]+)"/.exec(hero)[1];
  assert.match(read(project, 'src/open-canvas.css'), new RegExp(`\\[data-oc="${key}"\\] \\{\\n  margin-top: 24px;\\n  padding-left: 16px;\\n\\}`));
  assert.equal(hero.replace(` data-oc="${key}"`, ''), heroBefore, 'only the data-oc attribute is added');

  const tablet = h.applyEdit(project, { type: 'setStyle', id, breakpoint: 'tablet', styles: { 'margin-top': '12px' } });
  assert.equal(tablet.ok, true, tablet.error);
  const info = h.inspectElement(project, id);
  assert.deepEqual(info.styles, { base: { 'margin-top': '24px', 'padding-left': '16px' }, tablet: { 'margin-top': '12px' }, mobile: {} });

  assert.equal(h.revertChanges(project.root, tablet.changes, 'undo').ok, true);
  assert.equal(h.revertChanges(project.root, res.changes, 'undo').ok, true);
  assert.equal(read(project, 'src/components/Hero.jsx'), heroBefore);
  assert.equal(read(project, 'src/open-canvas.css'), cssBefore);
  assert.equal(h.revertChanges(project.root, res.changes, 'redo').ok, true);
  assert.equal(read(project, 'src/components/Hero.jsx'), hero);
});

test('choosing a Google font links it from index.html in the same undo step', () => {
  const project = makeProject('landing');
  const htmlBefore = read(project, 'index.html');
  const id = idFor(project, 'src/components/Hero.jsx', '<h1');

  const res = h.applyEdit(project, {
    type: 'setStyle',
    id,
    breakpoint: 'base',
    styles: { 'font-family': "'Playfair Display', serif" },
    googleFont: 'Playfair Display:wght@400..900',
  });
  assert.equal(res.ok, true, res.error);
  assert.ok(res.changes.some((c) => c.path === 'index.html'));
  const html = read(project, 'index.html');
  assert.ok(html.includes('href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400..900&display=swap" data-oc-fonts'));
  assert.match(read(project, 'src/open-canvas.css'), /font-family: 'Playfair Display', serif;/);

  const again = h.applyEdit(project, { type: 'setStyle', id, breakpoint: 'tablet', styles: { 'font-family': 'Inter, sans-serif' }, googleFont: 'Inter:wght@100..900' });
  assert.equal(again.ok, true, again.error);
  assert.deepEqual(h.linkedGoogleFamilies(read(project, 'index.html')), ['Playfair Display', 'Inter']);

  assert.equal(h.revertChanges(project.root, again.changes, 'undo').ok, true);
  assert.equal(h.revertChanges(project.root, res.changes, 'undo').ok, true);
  assert.equal(read(project, 'index.html'), htmlBefore);

  const bad = h.applyEdit(project, { type: 'setStyle', id, breakpoint: 'base', styles: { 'font-family': 'x' }, googleFont: 'Evil"><script>' });
  assert.equal(bad.ok, false);
  assert.equal(read(project, 'index.html'), htmlBefore);
});

test('undo refuses when the file changed outside the history step', () => {
  const project = makeProject('blank');
  const id = idFor(project, 'src/App.jsx', '<main');
  const res = h.applyEdit(project, { type: 'insert', parentId: id, kind: 'heading' });
  assert.equal(res.ok, true, res.error);
  fs.appendFileSync(path.join(project.root, 'src/App.jsx'), '\n// user edit\n');
  const undo = h.revertChanges(project.root, res.changes, 'undo');
  assert.equal(undo.ok, false);
  assert.match(read(project, 'src/App.jsx'), /user edit/);
});

test('importing an SVG copies it into public/, is undoable, and can be inserted as an <img>', () => {
  const project = makeProject('blank');
  const src = path.join(TMP, `logo-${Date.now()}.svg`);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
  fs.writeFileSync(src, svg);
  const png = path.join(TMP, `photo ${Date.now()}.png`);
  fs.writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const first = h.importFiles(project.root, [src], 'public');
  assert.equal(first.undoable, true);
  assert.equal(first.files.length, 1);
  assert.match(first.files[0], /^public\/logo-\d+\.svg$/);
  assert.equal(read(project, first.files[0]), svg);
  const again = h.importFiles(project.root, [src], 'public');
  assert.notEqual(again.files[0], first.files[0], 'a second import gets a unique name');

  const mixed = h.importFiles(project.root, [src, png], 'public');
  assert.equal(mixed.undoable, false);
  assert.deepEqual(mixed.changes, []);
  assert.match(mixed.files[1], /^public\/photo-\d+\.png$/, 'spaces are sanitized');
  assert.throws(() => h.importFiles(project.root, [TMP], 'public'), /not a file/);
  assert.throws(() => h.importFiles(project.root, [src], '../outside'));

  const root = idFor(project, 'src/App.jsx', '<main');
  const url = first.files[0].slice('public'.length);
  const img = h.applyEdit(project, { type: 'insert', parentId: root, kind: 'image', image: { src: url, alt: 'Logo "mark"' } });
  assert.equal(img.ok, true, img.error);
  const app = read(project, 'src/App.jsx');
  assert.ok(app.includes(`src="${url}"`));
  assert.ok(app.includes('alt={"Logo \\"mark\\""}'));
  h.parseSource(app, 'App.jsx');

  assert.equal(h.revertChanges(project.root, [...first.changes, ...img.changes], 'undo').ok, true);
  assert.ok(!fs.existsSync(path.join(project.root, first.files[0])), 'undo removes the imported SVG');
  assert.ok(!read(project, 'src/App.jsx').includes(url));
});

test('style and delete edits apply to every selected element', () => {
  const project = makeProject('blank');
  const root = idFor(project, 'src/App.jsx', '<main');
  for (const kind of ['heading', 'paragraph', 'button']) assert.equal(h.applyEdit(project, { type: 'insert', parentId: root, kind }).ok, true);
  const ids = ['<h', '<p', '<button'].map((needle) => idFor(project, 'src/App.jsx', needle));

  const styled = h.applyEdit(project, { type: 'setStyle', id: ids[0], extraIds: ids.slice(1), breakpoint: 'base', styles: { color: 'red' } });
  assert.equal(styled.ok, true, styled.error);
  const app = read(project, 'src/App.jsx');
  h.parseSource(app, 'App.jsx');
  const keys = [...app.matchAll(/data-oc="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 3);
  const css = read(project, project.stylesFile);
  for (const key of keys.slice(-3)) assert.match(css, new RegExp(`\\[data-oc="${key}"\\] \\{[^}]*\\n  color: red;`));

  const freshIds = ['<h', '<p', '<button'].map((needle) => idFor(project, 'src/App.jsx', needle));
  const removed = h.applyEdit(project, { type: 'remove', id: freshIds[1], extraIds: [freshIds[0], freshIds[2]] });
  assert.equal(removed.ok, true, removed.error);
  const after = read(project, 'src/App.jsx');
  assert.ok(!/<h\d|<p[ >]|<button/.test(after), 'all three elements were removed');
  h.parseSource(after, 'App.jsx');
  assert.equal(h.revertChanges(project.root, [...removed.changes], 'undo').ok, true);
  assert.equal(read(project, 'src/App.jsx'), app);
});

test('duplicate copies the element with fresh style keys; group and ungroup wrap and unwrap', () => {
  const project = makeProject('blank');
  const root = idFor(project, 'src/App.jsx', '<main');
  const section = h.applyEdit(project, { type: 'insert', parentId: root, kind: 'section' });
  assert.equal(section.ok, true, section.error);
  const original = read(project, 'src/App.jsx');
  const cssBefore = read(project, project.stylesFile);

  const dup = h.applyEdit(project, { type: 'duplicate', id: section.selectId });
  assert.equal(dup.ok, true, dup.error);
  let app = read(project, 'src/App.jsx');
  h.parseSource(app, 'App.jsx');
  const keys = [...app.matchAll(/<section data-oc="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1], 'the copy has its own style key');
  const css = read(project, project.stylesFile);
  for (const key of keys) assert.match(css, new RegExp(`\\[data-oc="${key}"\\] \\{\\n  padding: 64px 32px;`));
  assert.ok(dup.selectId.startsWith('src/App.jsx:') && dup.selectId !== section.selectId, 'the copy is selected');
  assert.equal(h.inspectElement(project, dup.selectId).tag, 'section');

  const heads = ['<section', '<section data-oc="' + keys[1]].map((needle) => idFor(project, 'src/App.jsx', needle));
  const group = h.applyEdit(project, { type: 'group', id: heads[0], extraIds: [heads[1]] });
  assert.equal(group.ok, true, group.error);
  app = read(project, 'src/App.jsx');
  h.parseSource(app, 'App.jsx');
  assert.match(app, /<div data-oc="div-[a-z0-9]+" data-oc-name="Group">\n\s+<section[\s\S]*<\/section>\n\s+<section[\s\S]*<\/section>\n\s+<\/div>/);
  assert.equal(h.inspectElement(project, group.selectId).tag, 'div');

  const ungroup = h.applyEdit(project, { type: 'ungroup', id: group.selectId });
  assert.equal(ungroup.ok, true, ungroup.error);
  const unwrapped = read(project, 'src/App.jsx');
  h.parseSource(unwrapped, 'App.jsx');
  assert.ok(!unwrapped.includes('data-oc-name="Group"'));
  assert.equal((unwrapped.match(/<section /g) ?? []).length, 2);

  const notAdjacent = h.applyEdit(project, { type: 'insert', parentId: root, kind: 'heading' });
  assert.equal(notAdjacent.ok, true);
  const first = idFor(project, 'src/App.jsx', '<section');
  const bad = h.applyEdit(project, { type: 'group', id: first, extraIds: [notAdjacent.selectId] });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /next to each other/);

  for (const change of [notAdjacent, ungroup, group, dup]) assert.equal(h.revertChanges(project.root, change.changes, 'undo').ok, true);
  assert.equal(read(project, 'src/App.jsx'), original);
  assert.equal(read(project, project.stylesFile), cssBefore);
});

test('insert, text, rename, move, attribute and remove on a blank page', () => {
  const project = makeProject('blank');
  const root = idFor(project, 'src/App.jsx', '<main');

  const div = h.applyEdit(project, { type: 'insert', parentId: root, kind: 'div' });
  assert.equal(div.ok, true, div.error);
  const img = h.applyEdit(project, { type: 'insert', parentId: div.selectId, kind: 'image' });
  assert.equal(img.ok, true, img.error);
  assert.ok(fs.existsSync(path.join(project.root, 'public/placeholder.svg')));
  const heading = h.applyEdit(project, { type: 'insert', parentId: root, kind: 'heading' });
  assert.equal(heading.ok, true, heading.error);

  const text = h.applyEdit(project, { type: 'setText', id: heading.selectId, text: 'Hello world' });
  assert.equal(text.ok, true, text.error);
  const renamed = h.applyEdit(project, { type: 'rename', id: heading.selectId, name: 'Title' });
  assert.equal(renamed.ok, true, renamed.error);
  const moved = h.applyEdit(project, { type: 'move', id: heading.selectId, direction: 'up' });
  assert.equal(moved.ok, true, moved.error);
  const alt = h.applyEdit(project, { type: 'setAttribute', id: idFor(project, 'src/App.jsx', '<img'), name: 'alt', value: 'Hero shot' });
  assert.equal(alt.ok, true, alt.error);

  const app = read(project, 'src/App.jsx');
  h.parseSource(app, 'App.jsx');
  assert.ok(app.indexOf('Hello world') < app.indexOf('<img'), 'heading moved above the container');
  assert.match(app, /data-oc-name="Title"/);
  assert.match(app, /alt="Hero shot"/);
  const info = h.inspectElement(project, moved.selectId);
  assert.equal(info.text, 'Hello world');

  const removed = h.applyEdit(project, { type: 'remove', id: moved.selectId });
  assert.equal(removed.ok, true, removed.error);
  assert.equal(removed.selectId, root);
  assert.ok(!read(project, 'src/App.jsx').includes('Hello world'));
});

test('unsupported edits fail without touching files', () => {
  const project = makeProject('landing');
  const before = read(project, 'src/components/Features.jsx');
  const res = h.applyEdit(project, { type: 'setText', id: idFor(project, 'src/components/Features.jsx', '<article'), text: 'x' });
  assert.equal(res.ok, false);
  assert.equal(res.changes.length, 0);
  assert.equal(read(project, 'src/components/Features.jsx'), before);
  const bad = h.applyEdit(project, { type: 'setStyle', id: idFor(project, 'src/components/Hero.jsx', '<h1'), breakpoint: 'base', styles: { color: 'red; } body { display:none' } });
  assert.equal(bad.ok, false);
});

test('imported TypeScript project: first style edit adds the stylesheet import without rewriting the entry', () => {
  const root = path.join(TMP, `imported-${Date.now()}`);
  const files = {
    'package.json': JSON.stringify({ name: 'imported', dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0', clsx: '^2.0.0' }, devDependencies: { vite: '^7.0.0', '@vitejs/plugin-react': '^5.0.0', typescript: '^5.0.0' } }),
    'pnpm-lock.yaml': '',
    'index.html': '<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
    'src/main.tsx': "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './styles.css';\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />);\n",
    'src/App.tsx': "type Props = { title?: string };\n\n/** Docs comment */\nexport default function App({ title = 'Hi' }: Props) {\n  return (\n    <div className=\"app\">\n      <h1>{title}</h1>\n      <p>Static text</p>\n    </div>\n  );\n}\n",
    'src/styles.css': '@media (max-width: 900px) { .app { padding: 8px; } }\n@media (max-width: 500px) { .app { padding: 4px; } }\n',
  };
  h.writeFiles(root, files);
  const project = h.detectProject(root);
  assert.equal(project.framework, 'vite-react');
  assert.equal(project.packageManager, 'pnpm');
  assert.equal(project.managedPreview, false, 'extra dependencies require a real install');
  assert.equal(project.entryFile, 'src/main.tsx');
  assert.deepEqual(project.breakpoints, { tablet: 900, mobile: 500, detected: true });
  assert.ok(project.warnings.some((w) => /not installed/.test(w)));

  const id = idFor(project, 'src/App.tsx', '<p>');
  const res = h.applyEdit(project, { type: 'setStyle', id, breakpoint: 'tablet', styles: { color: 'blue' } });
  assert.equal(res.ok, true, res.error);
  assert.deepEqual(res.changes.map((c) => c.path).sort(), ['src/App.tsx', 'src/main.tsx', 'src/open-canvas.css']);
  const main = read(project, 'src/main.tsx');
  assert.equal(main, files['src/main.tsx'].replace("import './styles.css';\n", "import './styles.css';\nimport './open-canvas.css';\n"));
  assert.match(read(project, 'src/open-canvas.css'), /@media \(max-width: 900px\)/);
  assert.equal(read(project, 'package.json'), files['package.json'], 'package.json untouched');

  const dynamicText = h.applyEdit(project, { type: 'setText', id: idFor(project, 'src/App.tsx', '<h1>'), text: 'x' });
  assert.equal(dynamicText.ok, false, 'expression children are not editable');
});

test('path traversal is rejected', () => {
  const project = makeProject('blank');
  assert.throws(() => h.safeResolve(project.root, '../outside.txt'), /outside the project/);
  const res = h.applyEdit(project, { type: 'remove', id: '../../etc/passwd:1:0' });
  assert.equal(res.ok, false);
});

test('preview server serves the project with source ids and the bridge', async () => {
  const project = makeProject('landing');
  const child = spawn(process.execPath, [path.join(APP_ROOT, 'dist-electron', 'preview-server.mjs')], {
    env: { ...process.env, OC_PROJECT_ROOT: project.root, OC_APP_ROOT: APP_ROOT, OC_MANAGED: '1', OC_CACHE_DIR: path.join(TMP, 'cache', path.basename(project.root)) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '';
  child.stderr.on('data', (d) => (output += d));
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout\n${output}`)), 60000);
      child.stdout.on('data', (d) => {
        output += d;
        const m = /OC_MSG (\{.*\})/.exec(output);
        if (m) {
          clearTimeout(timer);
          const msg = JSON.parse(m[1]);
          msg.type === 'ready' ? resolve(msg.url) : reject(new Error(msg.message));
        }
      });
    });
    const html = await (await fetch(url)).text();
    assert.match(html, /\/@open-canvas\/bridge\.js/);
    const hero = await (await fetch(new URL('/src/components/Hero.jsx', url))).text();
    assert.match(hero, /data-oc-id": "src\/components\/Hero.jsx:3:4"|data-oc-id":"src\/components\/Hero.jsx:3:4"|src\/components\/Hero\.jsx:3:4/);
    const main = await (await fetch(new URL('/src/main.jsx', url))).text();
    assert.doesNotMatch(main, /from "react-dom\/client"/, 'react-dom should be resolved to an optimized dep');
    const bridge = await (await fetch(new URL('/@open-canvas/bridge.js', url))).text();
    assert.match(bridge, /oc-bridge/);
    assert.ok(!fs.existsSync(path.join(project.root, 'node_modules')), 'managed preview must not write node_modules into the project');
  } finally {
    child.stdin.end();
    child.kill();
  }
});

test('export zip contains sources and excludes caches', async () => {
  const project = makeProject('portfolio');
  fs.mkdirSync(path.join(project.root, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(project.root, 'node_modules', 'x', 'i.js'), '');
  fs.writeFileSync(path.join(project.root, '.env.local'), 'SECRET=1');
  const zip = await h.buildProjectZip(project);
  assert.ok(zip.files.includes('package.json'));
  assert.ok(zip.files.includes('src/App.jsx'));
  assert.ok(zip.files.includes('public/placeholder.svg'));
  assert.ok(!zip.files.some((f) => f.startsWith('node_modules')));
  assert.ok(!zip.files.includes('.env.local'));
  assert.deepEqual(h.runInstructions(project), [`cd ${path.basename(project.root)}`, 'npm install', 'npm run dev', 'npm run build']);
});

test('renaming and deleting files are undoable history steps', () => {
  const project = makeProject('landing');
  const hero = read(project, 'src/components/Hero.jsx');

  const renamed = h.relocate(project.root, 'src/components/Hero.jsx', 'src/components/Banner.jsx');
  assert.equal(renamed.undoable, true);
  assert.ok(!fs.existsSync(path.join(project.root, 'src/components/Hero.jsx')));
  assert.equal(read(project, 'src/components/Banner.jsx'), hero);
  assert.equal(h.revertChanges(project.root, renamed.changes, 'undo').ok, true);
  assert.equal(read(project, 'src/components/Hero.jsx'), hero);
  assert.ok(!fs.existsSync(path.join(project.root, 'src/components/Banner.jsx')));

  const removed = h.relocate(project.root, 'src/components', null);
  assert.ok(!fs.existsSync(path.join(project.root, 'src/components')));
  assert.equal(h.revertChanges(project.root, removed.changes, 'undo').ok, true);
  assert.equal(read(project, 'src/components/Hero.jsx'), hero);

  assert.throws(() => h.relocate(project.root, 'src/App.jsx', 'src/main.jsx'), /already exists/);
  assert.throws(() => h.relocate(project.root, 'src/App.jsx', '../outside.jsx'));
});

test('binary files are moved without a history entry', () => {
  const project = makeProject('blank');
  fs.writeFileSync(path.join(project.root, 'public/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255]));
  const result = h.relocate(project.root, 'public', 'assets');
  assert.equal(result.undoable, false);
  assert.deepEqual([...fs.readFileSync(path.join(project.root, 'assets/logo.png'))], [0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255]);
});

test('dependencies declared but not installed are reported', () => {
  const project = makeProject('blank');
  const pkgPath = path.join(project.root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.dependencies['lucide-react'] = '^0.460.0';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  let info = h.detectProject(project.root);
  assert.equal(info.managedPreview, false, 'extra dependencies leave managed preview mode');
  assert.deepEqual(info.missingDependencies, [], 'not checked without node_modules');
  assert.match(info.warnings.join(' '), /Dependencies are not installed/);

  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) => d !== 'lucide-react')) {
    const dir = path.join(project.root, 'node_modules', ...dep.split('/'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
  }
  info = h.detectProject(project.root);
  assert.deepEqual(info.missingDependencies, ['lucide-react']);
  assert.match(info.warnings.join(' '), /lucide-react/);
});

test.after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});
