import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const versions = Object.fromEntries(
  [['react', 'react'], ['reactDom', 'react-dom'], ['vite', 'vite'], ['pluginReact', '@vitejs/plugin-react']].map(([k, pkg]) => [
    k,
    JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'node_modules', pkg, 'package.json'), 'utf8')).version,
  ]),
);

function makeProject(t, template = 'blank') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-mcp-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  h.writeFiles(root, h.generateTemplate(template, path.basename(root), 'Test', versions));
  return h.detectProject(root);
}

const read = (project, file) => fs.readFileSync(path.join(project.root, file), 'utf8');

function idFor(project, file, needle) {
  const code = read(project, file);
  const { line, column } = h.offsetToLineCol(code, code.indexOf(needle));
  return `${file}:${line}:${column}`;
}

test('hover styles are written as :hover rules and read back separately', (t) => {
  const project = makeProject(t, 'landing');
  const id = idFor(project, 'src/components/Hero.jsx', '<h1');
  assert.equal(h.applyEdit(project, { type: 'setStyle', id, breakpoint: 'base', styles: { color: 'red' } }).ok, true);
  const res = h.applyEdit(project, { type: 'setStyle', id, breakpoint: 'base', state: 'hover', styles: { color: 'blue', transform: 'translateY(-2px)' } });
  assert.equal(res.ok, true, res.error);
  const key = /<h1 data-oc="([^"]+)"/.exec(read(project, 'src/components/Hero.jsx'))[1];
  const css = read(project, 'src/open-canvas.css');
  assert.match(css, new RegExp(`\\[data-oc="${key}"\\]:hover \\{\\n  color: blue;\\n  transform: translateY\\(-2px\\);\\n\\}`));
  const info = h.inspectElement(project, id);
  assert.deepEqual(info.styles.base, { color: 'red' });
  assert.deepEqual(info.hover.base, { color: 'blue', transform: 'translateY(-2px)' });

  const dup = h.applyEdit(project, { type: 'duplicate', id });
  assert.equal(dup.ok, true, dup.error);
  const keys = [...read(project, 'src/components/Hero.jsx').matchAll(/<h1 data-oc="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(keys.length, 2);
  assert.match(read(project, 'src/open-canvas.css'), new RegExp(`\\[data-oc="${keys[1]}"\\]:hover`), 'duplicates keep hover styles');
});

test('setTag renames opening and closing tags and rejects unsupported tags', (t) => {
  const project = makeProject(t, 'landing');
  const id = idFor(project, 'src/components/Hero.jsx', '<h1');
  const res = h.applyEdit(project, { type: 'setTag', id, tag: 'h2' });
  assert.equal(res.ok, true, res.error);
  const code = read(project, 'src/components/Hero.jsx');
  assert.ok(!code.includes('<h1'), 'opening tag renamed');
  assert.ok(!code.includes('</h1>'), 'closing tag renamed');
  assert.match(code, /<h2[^>]*>[\s\S]*?<\/h2>/);
  assert.equal(h.applyEdit(project, { type: 'setTag', id, tag: 'script' }).ok, false);
  const img = h.applyEdit(project, { type: 'setTag', id, tag: 'img' });
  assert.equal(img.ok, false);
});

test('new insert kinds produce valid JSX with starter styles', (t) => {
  const project = makeProject(t);
  const page = idFor(project, 'src/App.jsx', '<main');
  for (const kind of ['header', 'nav', 'footer', 'list', 'form', 'input', 'textarea']) {
    const res = h.applyEdit(project, { type: 'insert', parentId: page, kind });
    assert.equal(res.ok, true, `${kind}: ${res.error}`);
  }
  const code = read(project, 'src/App.jsx');
  h.parseSource(code, 'src/App.jsx');
  for (const tag of ['<header', '<nav', '<footer', '<ul', '<form', '<input', '<textarea']) assert.ok(code.includes(tag), tag);
  assert.match(code, /onSubmit=\{\(event\) => event\.preventDefault\(\)\}/);
});

test('insertJsx validates and indents an agent-written snippet', (t) => {
  const project = makeProject(t);
  const page = idFor(project, 'src/App.jsx', '<main');
  const res = h.applyEdit(project, {
    type: 'insertJsx',
    parentId: page,
    jsx: '    <section data-oc-name="Hero">\n      <h1>Hello</h1>\n      <p>World</p>\n    </section>',
  });
  assert.equal(res.ok, true, res.error);
  const code = read(project, 'src/App.jsx');
  assert.match(code, /\n {6}<section data-oc-name="Hero">\n {8}<h1>Hello<\/h1>\n {8}<p>World<\/p>\n {6}<\/section>\n/);
  assert.equal(h.inspectElement(project, res.selectId).tag, 'section');

  assert.equal(h.applyEdit(project, { type: 'insertJsx', parentId: page, jsx: '<p>a</p><p>b</p>' }).ok, false, 'two siblings are rejected');
  assert.equal(h.applyEdit(project, { type: 'insertJsx', parentId: page, jsx: 'alert(1)' }).ok, false, 'non-JSX is rejected');
  assert.equal(h.applyEdit(project, { type: 'insertJsx', parentId: page, jsx: '<div>' }).ok, false, 'unbalanced JSX is rejected');
});

test('outlineSource lists host and component elements with editable ids', () => {
  const code = `export default function App() {\n  return (\n    <main data-oc-name="Page">\n      <Header />\n      <h1 data-oc="h1-abc">Hi</h1>\n    </main>\n  );\n}\n`;
  const outline = h.outlineSource(code, 'App.jsx', 'src/App.jsx');
  assert.equal(outline.length, 1);
  assert.equal(outline[0].id, 'src/App.jsx:3:4');
  assert.equal(outline[0].name, 'Page');
  assert.deepEqual(
    outline[0].children.map((c) => [c.tag, c.component ?? false, c.key ?? null, c.text ?? null]),
    [
      ['Header', true, null, null],
      ['h1', false, 'h1-abc', 'Hi'],
    ],
  );
});

/* ---------- MCP over HTTP ---------- */

async function startServer(t, project, extra = {}) {
  const recorded = [];
  const ctx = {
    project: () => project,
    pages: () => h.pagesState(project),
    referenceImage: () => 'data:image/png;base64,iVBORw0KGgo=',
    edit: (command, label) => {
      const result = h.applyEdit(project, command);
      if (result.ok) recorded.push(label);
      return result;
    },
    inspect: (id) => h.inspectElement(project, id),
    writeFile: (rel, content, label) => {
      const abs = h.safeResolve(project.root, rel);
      const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
      recorded.push(label);
      return { path: rel, before, after: content };
    },
    importFiles: (sources, dir) => h.importFiles(project.root, sources, dir),
    screenshot: async () => Buffer.from('jpeg'),
    renderer: async (action) => (action === 'undo' ? 'Undid: something' : { selected: [] }),
    ...extra,
  };
  const token = h.newToken();
  const server = new h.McpServer({ name: 'opencanvas', version: 'test', instructions: h.MCP_INSTRUCTIONS, tools: h.createMcpTools(ctx), token: () => token });
  await server.listen(0);
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.boundPort}/mcp`;
  let seq = 0;
  const rpc = async (method, params, { auth = token, headers = {} } = {}) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method, params }),
    });
    return { status: res.status, body: res.status === 202 ? null : await res.json() };
  };
  const call = async (name, args = {}) => {
    const { body } = await rpc('tools/call', { name, arguments: args });
    return body.result;
  };
  return { url, rpc, call, recorded };
}

test('MCP server: handshake, tool listing and auth', async (t) => {
  const project = makeProject(t);
  const { url, rpc } = await startServer(t, project);

  const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.status, 200);
  assert.equal(init.body.result.protocolVersion, '2025-03-26');
  assert.equal(init.body.result.serverInfo.name, 'opencanvas');
  assert.ok(init.body.result.capabilities.tools);
  assert.match(init.body.result.instructions, /get_outline/);

  const empty = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' }, body: '{}' });
  assert.equal(empty.status, 401, 'an empty bearer token is rejected');

  const tools = await rpc('tools/list');
  const names = tools.body.result.tools.map((tool) => tool.name);
  for (const name of ['get_project', 'get_outline', 'insert_jsx', 'set_styles', 'set_text', 'screenshot', 'undo']) assert.ok(names.includes(name), name);
  for (const tool of tools.body.result.tools) assert.equal(tool.inputSchema.type, 'object', tool.name);

  assert.equal((await rpc('tools/list', {}, { auth: 'wrong-token-wrong-token-wrong' })).status, 401);
  assert.equal((await rpc('tools/list', {}, { auth: null })).status, 401);
  assert.equal((await rpc('tools/list', {}, { headers: { Origin: 'https://evil.example' } })).status, 403, 'browser pages are refused');
  assert.equal((await rpc('nope/method')).body.error.code, -32601);
  const rebound = await new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { Host: 'attacker.example' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end('{}');
  });
  assert.equal(rebound, 403, 'foreign Host headers (DNS rebinding) are refused');
});

test('MCP server: notifications get 202 and GET gets 405', async (t) => {
  const token = h.newToken();
  const server = new h.McpServer({ name: 'opencanvas', version: 'test', instructions: '', tools: [], token: () => token });
  await server.listen(0);
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.boundPort}/mcp`;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  assert.equal(res.status, 202);
  assert.equal((await fetch(url, { headers })).status, 405);
  const batch = await fetch(url, { method: 'POST', headers, body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/x' }]) });
  assert.deepEqual(await batch.json(), [{ jsonrpc: '2.0', id: 1, result: {} }]);
});

test('MCP tools share pages and the design direction', async (t) => {
  const project = makeProject(t);
  const direction = { ...h.defaultDirection(), font: 'Fraunces', iconPack: 'phosphor', visualStyle: { minimalExpressive: 0.9, casualProfessional: 0.1 } };
  direction.references = [{ id: 'r1', title: 'Poster', url: 'https://savee.com/i/abc', imagePath: '.opencanvas/references/r1.png', source: 'savee', role: 'colour', note: 'warm reds', primary: true, addedAt: 1, tags: [], colors: [] }];
  fs.mkdirSync(path.join(project.root, '.opencanvas'), { recursive: true });
  fs.writeFileSync(path.join(project.root, '.opencanvas/project.json'), JSON.stringify({ version: 1, pages: [], direction }));
  const { call, rpc } = await startServer(t, project);

  const names = (await rpc('tools/list')).body.result.tools.map((tool) => tool.name);
  for (const name of ['get_design_direction', 'list_pages']) assert.ok(names.includes(name), name);

  const info = JSON.parse((await call('get_project')).content[0].text);
  assert.deepEqual(info.pages.map((p) => p.path), ['/']);
  assert.equal(info.direction.summary, 'Very expressive and very casual');
  assert.equal(info.direction.iconPack, 'phosphor');

  const brief = await call('get_design_direction');
  assert.match(brief.content[0].text, /Typeface: Fraunces/);
  assert.match(brief.content[0].text, /Phosphor/);
  assert.match(brief.content[0].text, /\[primary\] Poster · take: colour · https:\/\/savee\.com\/i\/abc · note: warm reds/);
  assert.ok(brief.content.some((c) => c.type === 'image' && c.mimeType === 'image/png'));

  const pages = await call('list_pages');
  assert.match(pages.content[0].text, /^\/ {2}Home/);
  assert.match(pages.content[0].text, /Routing: single page/);
});

test('MCP tools build and style a page through the edit engine', async (t) => {
  const project = makeProject(t);
  const { call, recorded } = await startServer(t, project);

  const outline = await call('get_outline');
  assert.match(outline.content[0].text, /<main> "Page" src\/App\.jsx:3:4/);

  const inserted = await call('insert_jsx', {
    parent_id: 'src/App.jsx:3:4',
    jsx: '<header data-oc-name="Header">\n  <a href="/">Northbound</a>\n  <nav data-oc-name="Nav">\n    <a href="#work">Work</a>\n  </nav>\n</header>',
  });
  assert.equal(inserted.isError, undefined, inserted.content[0].text);
  const headerId = /Element id: (\S+)/.exec(inserted.content[0].text)[1];
  assert.match(inserted.content[0].text, /Updated outline/);
  assert.match(inserted.content[0].text, /<nav> "Nav"/);

  const styled = await call('set_styles', { ids: [headerId], styles: { display: 'flex', 'justify-content': 'space-between' } });
  assert.equal(styled.isError, undefined, styled.content[0].text);
  const hover = await call('set_styles', { ids: [headerId], styles: { opacity: '0.9' }, state: 'hover', breakpoint: 'mobile' });
  assert.equal(hover.isError, undefined, hover.content[0].text);
  const css = read(project, 'src/open-canvas.css');
  assert.match(css, /justify-content: space-between;/);
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*:hover \{\n {4}opacity: 0\.9;/);

  const bad = await call('set_styles', { ids: [headerId], styles: { color: 'red; } body { display: none' } });
  assert.equal(bad.isError, true, 'CSS injection through values is refused');

  const info = await call('inspect_element', { id: headerId });
  assert.equal(JSON.parse(info.content[0].text).styles.base.display, 'flex');

  const missing = await call('set_text', { id: 'src/App.jsx:99:0', text: 'x' });
  assert.equal(missing.isError, true);

  const file = await call('write_file', { path: 'src/components/Card.jsx', content: 'export default function Card() {\n  return <div>Card</div>;\n}\n' });
  assert.match(file.content[0].text, /Created src\/components\/Card\.jsx/);
  assert.equal((await call('write_file', { path: '../escape.txt', content: 'x' })).isError, true, 'paths outside the project are refused');
  assert.equal((await call('read_file', { path: 'src/components/Card.jsx' })).content[0].text.includes('Card'), true);

  const shot = await call('screenshot', { width: 390 });
  assert.equal(shot.content[0].type, 'image');
  assert.equal(shot.content[0].mimeType, 'image/jpeg');

  assert.equal((await call('undo')).content[0].text, 'Undid: something');
  assert.deepEqual(recorded.slice(0, 3), ['Insert JSX (agent)', 'Set 2 styles (agent)', 'Set opacity (hover) on mobile (agent)']);

  const none = await startServer(t, null);
  const noProject = await none.call('get_outline');
  assert.equal(noProject.isError, true);
  assert.match(noProject.content[0].text, /No project is open/);
});

test('MCP git tools commit and publish the project', async (t) => {
  Object.assign(process.env, {
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'user.name',
    GIT_CONFIG_VALUE_0: 'OpenCanvas Test',
    GIT_CONFIG_KEY_1: 'user.email',
    GIT_CONFIG_VALUE_1: 'test@example.com',
  });
  t.after(() => ['COUNT', 'KEY_0', 'VALUE_0', 'KEY_1', 'VALUE_1'].forEach((k) => delete process.env[`GIT_CONFIG_${k}`]));
  const project = makeProject(t);
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-mcp-remote-'));
  t.after(() => fs.rmSync(bare, { recursive: true, force: true }));
  await h.git(bare, ['init', '--bare', '-b', 'main']);
  const created = [];
  const root = project.root;
  const { call } = await startServer(t, project, {
    git: {
      status: () => h.gitStatus(root),
      init: () => h.gitInit(root),
      commit: (message) => h.gitCommit(root, message),
      setRemote: (url) => h.gitSetRemote(root, url),
      createRepo: async (name, isPrivate) => {
        created.push([name, isPrivate]);
        await h.git(root, ['remote', 'add', 'origin', bare]);
        return { url: bare, htmlUrl: `https://github.com/test/${name}` };
      },
      push: () => h.gitPush(root),
      goLive: async () => ({ status: 'needs-vercel', importUrl: 'https://vercel.com/new/import?s=x', reason: 'no-account' }),
    },
  });

  const before = await call('git_status');
  assert.match(before.content[0].text, /Not a git repository yet/);

  const published = await call('git_publish', { repo_name: 'ad-agency' });
  assert.equal(published.isError, undefined, published.content[0].text);
  assert.match(published.content[0].text, /Created https:\/\/github\.com\/test\/ad-agency and pushed/);
  assert.deepEqual(created, [['ad-agency', true]], 'new repositories are private unless asked otherwise');
  const pushed = await h.git(bare, ['log', '-1', '--format=%s', 'main']);
  assert.equal(pushed.stdout.trim(), 'Publish from OpenCanvas');
  assert.ok(fs.existsSync(path.join(root, '.gitignore')));

  fs.writeFileSync(path.join(root, 'notes.txt'), 'hello');
  const commit = await call('git_commit', { message: 'Add notes' });
  assert.match(commit.content[0].text, /Last commit: \w+ Add notes/);
  assert.match(commit.content[0].text, /1 to push/);
  const again = await call('git_publish');
  assert.match(again.content[0].text, /^Pushed\./);
  assert.deepEqual(created.length, 1, 'an existing remote is reused');
  assert.equal((await h.git(bare, ['log', '-1', '--format=%s', 'main'])).stdout.trim(), 'Add notes');

  fs.writeFileSync(path.join(root, 'notes.txt'), 'hello again');
  const live = await call('go_live', { message: 'Polish notes' });
  assert.match(live.content[0].text, /^Not live yet: Vercel isn’t set up[\s\S]*would like to go to Vercel[\s\S]*https:\/\/vercel\.com\/new\/import\?s=x/);
  assert.equal((await h.git(bare, ['log', '-1', '--format=%s', 'main'])).stdout.trim(), 'Polish notes', 'go_live commits and pushes before Vercel');
});

test('MCP settings: defaults, validation and persistence', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-mcp-settings-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'mcp.json');
  const defaults = h.readMcpSettings(file);
  assert.equal(defaults.enabled, false, 'off until the user turns it on');
  assert.equal(defaults.port, 7457);
  assert.ok(defaults.token.length >= 24);
  h.writeMcpSettings(file, { ...defaults, enabled: true, port: 80 });
  const reread = h.readMcpSettings(file);
  assert.equal(reread.enabled, true);
  assert.equal(reread.port, 7457, 'privileged/invalid ports fall back to the default');
  assert.equal(reread.token, defaults.token);
});
