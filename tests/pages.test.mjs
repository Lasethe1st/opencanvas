import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(APP_ROOT, 'tests', '.tmp');
const versions = { react: '19.0.0', reactDom: '19.0.0', vite: '7.0.0', pluginReact: '5.0.0' };

function makeProject(template = 'blank') {
  const root = path.join(TMP, `pages-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(root, { recursive: true });
  h.writeFiles(root, h.generateTemplate(template, path.basename(root), 'Test', versions));
  return h.detectProject(root);
}
const read = (p, f) => fs.readFileSync(path.join(p.root, f), 'utf8');
const exists = (p, f) => fs.existsSync(path.join(p.root, f));

test('missing config gives defaults with a home page', () => {
  const config = h.normalizeProjectConfig(null, 'src/App.jsx');
  assert.equal(config.version, 2);
  assert.deepEqual(config.pages, [{ id: 'home', name: 'Home', path: '/', file: 'src/App.jsx', viewType: 'design', icon: 'layout-template' }]);
  assert.equal(config.defaultPageId, 'home');
  assert.equal(config.direction.visualStyle.minimalExpressive, 0.5);
  assert.equal(config.direction.visualStyle.casualProfessional, 0.5);
  assert.equal(config.direction.iconPack, 'lucide');
});

test('config normalisation clamps, dedupes and drops unsafe references', () => {
  const config = h.normalizeProjectConfig(
    {
      pages: [{ id: 'a', name: 'About', path: 'about/' }],
      direction: {
        visualStyle: { minimalExpressive: 4, casualProfessional: -1 },
        iconPack: 'nope',
        references: [
          { id: 'r1', url: 'https://savee.com/x', primary: true },
          { id: 'r2', url: 'https://example.com', primary: true },
          { id: 'r3', imagePath: '../secret.png' },
          { id: 'r4' },
        ],
      },
    },
    'src/App.jsx',
  );
  assert.equal(config.pages[0].path, '/');
  assert.ok(config.pages.some((p) => p.path === '/about'));
  assert.equal(config.direction.visualStyle.minimalExpressive, 1);
  assert.equal(config.direction.visualStyle.casualProfessional, 0);
  assert.equal(config.direction.iconPack, 'lucide');
  assert.deepEqual(config.direction.references.map((r) => r.id), ['r1', 'r2']);
  assert.equal(config.direction.references.filter((r) => r.primary).length, 1);
});

test('blank Vite project starts single-page and editable', () => {
  const p = makeProject();
  const state = h.pagesState(p);
  assert.equal(state.routing, 'single');
  assert.equal(state.canEditPages, true);
  assert.equal(state.pages.length, 1);
});

test('workspace pages (agent/code) skip routes and keep design home', () => {
  const p = makeProject();
  const agent = h.createWorkspacePage(p, 'Activity', 'agent');
  assert.equal(agent.page.viewType, 'agent');
  assert.equal(agent.page.path, '');
  assert.equal(agent.page.file, null);
  assert.equal(exists(p, 'src/routes.jsx'), false);
  const state = h.pagesState(p);
  assert.ok(state.pages.some((x) => x.viewType === 'agent'));
  assert.ok(state.pages.some((x) => x.viewType === 'design' && x.path === '/'));
});

test('adding a page writes the page, managed routes and entry in one change set, and undo restores it', () => {
  const p = makeProject();
  const entryBefore = read(p, p.entryFile);
  const result = h.createPage(p, 'About us');
  assert.equal(result.page.name, 'About us');
  assert.equal(result.page.path, '/about-us');
  assert.equal(result.state.routing, 'managed');
  const paths = result.changes.map((c) => c.path);
  for (const f of [result.page.file, 'src/routes.jsx', p.entryFile, '.opencanvas/project.json']) assert.ok(paths.includes(f), f);
  const routes = read(p, 'src/routes.jsx');
  assert.ok(h.isManagedRoutes(routes));
  assert.match(routes, /'\/about-us': AboutUs/);
  assert.doesNotMatch(routes, /react-router/);
  assert.match(read(p, p.entryFile), /<Routes \/>/);
  h.parseSource(routes, 'routes.jsx');
  h.parseSource(read(p, result.page.file), result.page.file);

  assert.equal(h.revertChanges(p.root, result.changes, 'undo').ok, true);
  assert.equal(read(p, p.entryFile), entryBefore);
  assert.equal(exists(p, 'src/routes.jsx'), false);
  assert.equal(exists(p, result.page.file), false);
  assert.equal(h.pagesState(p).routing, 'single');
});

test('duplicate, rename, reorder and delete keep routes in step', () => {
  const p = makeProject();
  const about = h.createPage(p, 'About').page;
  const copy = h.duplicatePage(p, about.id).page;
  assert.equal(copy.name, 'About copy');
  assert.equal(copy.path, '/about-copy');
  h.renamePage(p, copy.id, 'Team');
  assert.throws(() => h.renamePage(p, copy.id, 'about'), /already exists/);
  const ids = h.pagesState(p).pages.map((x) => x.id);
  const reordered = h.reorderPages(p, [ids[0], ids[2], ids[1]]);
  assert.deepEqual(reordered.state.pages.map((x) => x.name), ['Home', 'Team', 'About']);
  assert.throws(() => h.deletePage(p, 'home'), /home page/);
  const del = h.deletePage(p, about.id);
  assert.ok(del.changes.some((c) => c.path === about.file && c.after === null));
  assert.doesNotMatch(read(p, 'src/routes.jsx'), /'\/about'/);
});

test('hand-edited routes file blocks page changes', () => {
  const p = makeProject();
  h.createPage(p, 'About');
  fs.appendFileSync(path.join(p.root, 'src/routes.jsx'), '\n// mine\n');
  assert.throws(() => h.createPage(p, 'Contact'), /changed by hand/);
});

test('an unmanaged routes file makes pages read-only', () => {
  const p = makeProject();
  fs.writeFileSync(path.join(p.root, 'src/routes.jsx'), 'export default function R() { return null; }\n');
  const state = h.pagesState(p);
  assert.equal(state.routing, 'unsupported');
  assert.equal(state.canEditPages, false);
  assert.ok(state.pagesNote);
});

test('wireRoutesIntoEntry refuses entries it cannot safely change', () => {
  assert.throws(() => h.wireRoutesIntoEntry("import App from './App.jsx';\nrender(<App foo />);", 'src/main.jsx', 'src/App.jsx', 'src/routes.jsx'));
  assert.throws(() => h.wireRoutesIntoEntry("import App from './App.jsx';\nrender(<App />);\nconsole.log(App);", 'src/main.jsx', 'src/App.jsx', 'src/routes.jsx'));
  const out = h.wireRoutesIntoEntry("import App from './App.jsx';\nrender(<App />);", 'src/main.jsx', 'src/App.jsx', 'src/routes.jsx');
  assert.match(out, /import Routes from '\.\/routes\.jsx'/);
  assert.match(out, /<Routes \/>/);
});

test('route detection for React Router and Next.js', () => {
  const code = `const r = [{ path: '/', element: <A /> }, { path: '/pricing', element: <B /> }, { path: '/u/:id', element: <C /> }];
    const x = <Route path="/about" element={<D />} />;`;
  assert.deepEqual(h.detectRouterPaths(code, 'a.jsx').sort(), ['/', '/about', '/pricing', '/u/:id']);

  const nested = `import Shell from './Shell';\nimport Team from './pages/Team.jsx';\nimport * as Pages from './pages';
    export const app = (
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="about">
            <Route path="team" element={<Team />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    );
    const router = createBrowserRouter([{ path: '/shop', Component: Pages.Shop, children: [{ index: true, element: <List /> }, { path: ':sku', element: <Item /> }, { path: 'deals?', element: <Deals /> }] }]);`;
  const routes = h.detectRoutes(nested, 'src/App.jsx');
  assert.deepEqual(routes.map((r) => r.path).sort(), ['/', '/about', '/about/team', '/shop', '/shop/:sku']);
  assert.equal(routes.find((r) => r.path === '/about/team').importSource, './pages/Team.jsx');
  assert.equal(routes.find((r) => r.path === '/shop').importSource, './pages');
  assert.deepEqual(h.routeParams('/shop/:sku'), ['sku']);
  assert.equal(h.fillRoute('/shop/:sku', { sku: 'a-1' }), '/shop/a-1');
  assert.equal(h.routeMatches('/shop/:sku', '/shop/a-1'), true);
  assert.equal(h.routeMatches('/docs/[...path]', '/docs'), false);
  assert.equal(h.routeMatches('/docs/[[...path]]', '/docs'), true);
  assert.deepEqual(h.runtimeOnlyPaths(['/', '/shop/:sku'], ['/', '/shop/x', '/lazy/settings']), ['/lazy/settings']);
  assert.equal(h.nextRouteFor('app/page.tsx'), '/');
  assert.equal(h.nextRouteFor('app/blog/page.tsx'), '/blog');
  assert.equal(h.nextRouteFor('app/(marketing)/about/page.tsx'), '/about');
  assert.equal(h.nextRouteFor('app/blog/[slug]/page.tsx'), '/blog/[slug]');
  assert.equal(h.nextRouteFor('pages/docs/[...path].tsx'), '/docs/[...path]');
  assert.deepEqual(h.routeParams('/shop/[[...filters]]/[id]'), ['id']);
  assert.equal(h.fillRoute('/blog/[slug]'), null, 'missing example values block the preview');
  assert.equal(h.fillRoute('/blog/[slug]', { slug: 'hello world' }), '/blog/hello%20world');
  assert.equal(h.fillRoute('/docs/[...path]', { path: '/a/b/' }), '/docs/a/b');
  assert.equal(h.fillRoute('/shop/[[...filters]]'), '/shop', 'optional catch-alls may stay empty');
  assert.equal(h.nextRouteFor('pages/api/x.ts'), null);
  assert.equal(h.nextRouteFor('pages/_app.tsx'), null);
});

test('design tokens import from CSS and JSON', () => {
  const css = h.parseCssTokens(':root { --brand: #f00; --space-2: 8px; } .x { --no: 1; }');
  assert.deepEqual(css, { '--brand': '#f00', '--space-2': '8px' });
  const json = h.parseJsonTokens(JSON.stringify({ color: { brand: { $value: '#f00' } }, size: { sm: { value: '4px' } } }));
  assert.deepEqual(json, { 'color.brand': '#f00', 'size.sm': '4px' });
  assert.throws(() => h.parseCssTokens('.x { color: red }'));
});

test('direction writes to project.json and Savee refuses to search without a sign-in', async () => {
  const p = makeProject();
  const state = h.writeDirection(p, { ...h.defaultDirection(), iconPack: 'phosphor', visualStyle: { minimalExpressive: 0.2, casualProfessional: 0.9 } });
  assert.equal(state.config.direction.iconPack, 'phosphor');
  const saved = JSON.parse(read(p, '.opencanvas/project.json'));
  assert.equal(saved.direction.visualStyle.casualProfessional, 0.9);
  const savee = h.listProviders().find((x) => x.id === 'savee');
  assert.notEqual(savee.status, 'connected');
  await assert.rejects(async () => h.searchProvider('savee', 'poster'));
});
