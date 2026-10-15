/**
 * End-to-end check of the MVP "definition of done" against the built Electron app.
 * Run with `npm run test:e2e`. Pass --skip-install to skip installing/building the exported ZIP.
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { _electron as electron } from 'playwright-core';

const require = createRequire(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-e2e-'));
const SHOTS = path.join(APP_ROOT, 'tests', 'e2e', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const skipInstall = process.argv.includes('--skip-install');
const MCP_PORT = 17_000 + Math.floor(Math.random() * 2000);

const step = (name) => console.log(`\n▶ ${name}`);
const ok = (msg) => console.log(`  ✔ ${msg}`);

/** Opens an installed project as an existing codebase and edits it visually and in code. */
async function importPhase(projectDir) {
  step('Open existing (installed) project');
  const viteConfig = fs.readFileSync(path.join(projectDir, 'vite.config.js'), 'utf8');
  const pkg = fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8');
  const app2 = await electron.launch({
    executablePath: require('electron'),
    args: ['.'],
    cwd: APP_ROOT,
    env: { ...process.env, OC_USER_DATA: path.join(WORK, 'user-data-2'), OC_PROJECTS_DIR: path.join(WORK, 'projects-2') },
  });
  const p = await app2.firstWindow();
  const f = p.frameLocator('iframe[title="Preview: Desktop"]');
  const errs = [];
  p.on('pageerror', (err) => errs.push(err.message));
  try {
    await app2.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
    }, projectDir);
    await p.getByLabel('Search projects').waitFor();
    await p.getByRole('button', { name: 'Open folder / file' }).click();
    await p.getByRole('menuitem', { name: 'Open folder…' }).click();
    await f.locator('h2').waitFor({ timeout: 60000 });
    ok('imported project previewed with its own node_modules and vite.config.js');

    await p.locator('.tree-row', { hasText: 'Container' }).click();
    await waitFor(async () => (await p.locator('.inspector-head .tag').textContent()) === '<div>', 'container selected from Layers');
    const radius = p.locator('.input', { has: p.locator('.input__prefix', { hasText: 'Radius' }) }).locator('input');
    await radius.fill('20');
    await radius.press('Enter');
    const css = () => fs.readFileSync(path.join(projectDir, 'src/open-canvas.css'), 'utf8');
    await waitFor(() => /border-radius: 20px;/.test(css()), 'radius written');
    await waitFor(async () => (await f.locator('[data-oc-name="Container"]').evaluate((el) => getComputedStyle(el).borderTopLeftRadius)) === '20px', 'radius in preview');
    ok('Layers selection + visual edit applied to the imported project');

    step('Edit and save code in Monaco');
    await p.getByRole('radio', { name: 'Code', exact: true }).click();
    await p.locator('.monaco-editor').first().waitFor({ timeout: 20000 });
    const appFile = path.join(projectDir, 'src/App.jsx');
    const before = fs.readFileSync(appFile, 'utf8');
    const next = before.replace(/(<h2\b[^>]*>)[\s\S]*?(<\/h2>)/, '$1Edited in code$2');
    assert.notEqual(next, before, 'heading found in the exported App.jsx');
    await p.locator('.monaco-editor .view-lines').first().click();
    await app2.evaluate(({ clipboard }, text) => clipboard.writeText(text), next);
    await p.keyboard.press('Control+A');
    await p.keyboard.press('Control+V');
    await p.getByText('Unsaved changes').first().waitFor();
    ok('unsaved state shown in top bar');
    await p.keyboard.press('Control+S');
    await waitFor(() => fs.readFileSync(appFile, 'utf8') === next, 'file saved');
    await p.getByRole('radio', { name: 'Visual', exact: true }).click();
    await f.locator('h2', { hasText: 'Edited in code' }).waitFor({ timeout: 20000 });
    ok('code edit saved to disk and reflected in the preview');
    fs.rmSync(path.join(SHOTS, '08-imported.png'), { force: true });
    await p.screenshot({ path: path.join(SHOTS, '08-imported.png') });

    assert.equal(fs.readFileSync(path.join(projectDir, 'vite.config.js'), 'utf8'), viteConfig, 'vite.config.js untouched');
    assert.equal(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'), pkg, 'package.json untouched');
    assert.deepEqual(errs, [], 'no renderer errors');
    ok('project configuration preserved');
  } finally {
    await app2.close().catch(() => undefined);
  }
}

const importOnly = process.argv.indexOf('--import-only');
if (importOnly !== -1) {
  try {
    await importPhase(process.argv[importOnly + 1]);
    console.log('\nImport phase passed.');
  } catch (err) {
    console.error('\n✖ Import phase failed:', err.stack);
    process.exitCode = 1;
  }
  process.exit();
}

const app = await electron.launch({
  executablePath: require('electron'),
  args: ['.'],
  cwd: APP_ROOT,
  env: { ...process.env, OC_USER_DATA: path.join(WORK, 'user-data'), OC_PROJECTS_DIR: path.join(WORK, 'projects'), OC_MCP_PORT: String(MCP_PORT) },
});
const page = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1480, 920));
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));
page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => undefined);

const shot = (name) => {
  const file = path.join(SHOTS, `${name}.png`);
  fs.rmSync(file, { force: true });
  return page.screenshot({ path: file });
};
const frame = page.frameLocator('iframe[title="Preview: Desktop"]');
const mobile = page.frameLocator('iframe[title="Preview: Mobile"]');
const frameCount = () => page.locator('iframe[title^="Preview:"]').count();
const zoomText = () => page.locator('.canvas-nav__zoom').textContent();
const projectRoot = () => {
  const dir = path.join(WORK, 'projects');
  return path.join(dir, fs.readdirSync(dir)[0]);
};
const readProject = (rel) => fs.readFileSync(path.join(projectRoot(), rel), 'utf8');

async function waitFor(fn, message, timeout = 15000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try {
      if (await fn()) return;
    } catch (err) {
      last = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out: ${message}${last ? ` (${last.message})` : ''}`);
}

/**
 * A stand-in OpenAI-compatible server. The first chat request with tools gets a streamed reply that
 * changes the selected element's text and colour; the follow-up gets a closing sentence.
 */
async function mockOpenAi() {
  const requests = [];
  const chunk = (delta, finish = null) => `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    if (req.url === '/v1/models') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'mock-model' }] }));
    const json = JSON.parse(body);
    requests.push(json);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = async (parts) => {
      for (const p of parts) {
        res.write(p);
        await new Promise((r) => setTimeout(r, 30));
      }
      res.end('data: [DONE]\n\n');
    };
    if (!json.tools) return send([chunk({ content: 'OK' }), chunk({}, 'stop')]);
    if (json.messages.some((m) => m.role === 'tool')) return send([chunk({ content: 'Done: ' }), chunk({ content: 'the heading is orange.' }), chunk({}, 'stop')]);
    const id = /\(id (\S+)\)/.exec(json.messages[1].content)?.[1] ?? '';
    const styleArgs = JSON.stringify({ ids: [id], styles: { color: 'rgb(234, 88, 12)' } });
    const textArgs = JSON.stringify({ id, text: 'Hello from the AI' });
    return send([
      chunk({ role: 'assistant', content: 'Making the heading ' }),
      chunk({ content: 'orange.' }),
      chunk({ tool_calls: [{ index: 0, id: 'call_style', type: 'function', function: { name: 'set_styles', arguments: styleArgs.slice(0, 20) } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: styleArgs.slice(20) } }] }),
      chunk({ tool_calls: [{ index: 1, id: 'call_text', type: 'function', function: { name: 'set_text', arguments: textArgs } }] }),
      chunk({}, 'tool_calls'),
    ]);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => server.close() };
}

try {
  step('Launch and onboarding');
  await page.getByLabel('Search projects').waitFor();
  for (const name of ['Start new project', 'Import from GitHub', 'Use templates', 'Open folder / file']) await page.getByRole('button', { name }).waitFor();
  await page.getByText('Projects you open or create will show up here.').waitFor();
  await shot('01-onboarding');
  ok('start page shows search, the four quick actions and an empty recent list');

  await page.getByLabel('Search projects').fill('github.com/octo/hello-world');
  await page.getByRole('button', { name: /Import octo\/hello-world/ }).waitFor();
  await page.getByLabel('Search projects').press('Enter');
  await waitFor(async () => (await page.getByLabel('Repository').inputValue()) === 'octo/hello-world', 'GitHub dialog prefilled from search');
  await shot('01b-import-github');
  await page.keyboard.press('Escape');
  await page.getByLabel('Search projects').fill('');
  await page.getByRole('button', { name: 'Use templates' }).click();
  await page.getByRole('option', { name: /Landing/ }).waitFor();
  await shot('01c-templates');
  await page.keyboard.press('Escape');
  ok('search suggests a GitHub import; templates open in a dialog');

  step('Create a blank project');
  await page.getByRole('button', { name: 'Start new project' }).click();
  await page.getByPlaceholder('Project name').fill('E2E Site');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByText('This page is empty').waitFor({ timeout: 60000 });
  ok(`project created at ${projectRoot()}`);
  await shot('02-blank-canvas');

  step('Free canvas: three frames of the same page');
  await waitFor(async () => (await frameCount()) === 3, 'desktop, tablet and mobile frames');
  const labels = await page.locator('.frame-chrome__name').allTextContents();
  assert.deepEqual(labels, ['Desktop', 'Tablet', 'Mobile']);
  const scopes = await page.locator('.frame-chrome__scope').allTextContents();
  assert.deepEqual(scopes, ['Base', 'Tablet', 'Mobile']);
  ok('default frames fitted with their scopes inferred from width');

  step('Add a section from the empty state, then a container from the tool rail');
  await page.getByRole('button', { name: 'Add section' }).click();
  await frame.locator('h2', { hasText: 'New section' }).waitFor({ timeout: 20000 });
  await mobile.locator('h2', { hasText: 'New section' }).waitFor({ timeout: 20000 });
  ok('section rendered in every frame');
  await waitFor(async () => (await page.locator('.tree-row.is-active').textContent())?.includes('Section'), 'new section selected in Layers');
  ok('new section auto-selected and highlighted in Layers');
  await page.locator('.tool-rail').getByRole('button', { name: 'Container', exact: true }).click();
  await waitFor(async () => (await page.locator('.tree-row.is-active').textContent())?.includes('Container'), 'container selected');
  assert.match(readProject('src/App.jsx'), /<div data-oc="div-[a-z0-9]+" data-oc-name="Container">/);
  ok('container inserted into the section in source');

  step('Navigate the canvas');
  await page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
  await waitFor(async () => (await zoomText()) === '100%', 'zoom reset to 100%');
  ok('zoom resets to 100%');
  const stage = await page.locator('.stage__viewport').boundingBox();
  await page.mouse.move(stage.x + 40, stage.y + stage.height - 40);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 300);
  await page.keyboard.up('Control');
  await waitFor(async () => parseInt(await zoomText(), 10) < 100, 'ctrl+wheel zooms out');
  ok(`Ctrl+wheel zooms around the cursor (${await zoomText()})`);
  await page.getByRole('button', { name: 'Fit all frames' }).click();
  await waitFor(async () => (await page.locator('.minimap__frame').count()) === 3, 'minimap shows frames');
  ok('fit all frames and minimap');

  step('Select an element on the canvas');
  // Playwright can't map pointer coordinates into a CSS-scaled iframe; a dispatched click still goes through the bridge.
  await frame.locator('h2').dispatchEvent('click');
  await waitFor(async () => (await page.locator('.inspector-head .tag').textContent()) === '<h2>', 'inspector shows h2');
  await waitFor(async () => (await page.locator('.tree-row.is-active').textContent())?.includes('Heading'), 'Layers highlights h2');
  await waitFor(async () => (await mobile.locator('[data-oc-overlay]').evaluate((host) => getComputedStyle(host.shadowRoot.querySelector('.linked')).display)) === 'block', 'linked highlight in mobile frame');
  ok('canvas selection syncs to inspector, Layers and the other frames');
  await page.locator('.selection-bar').waitFor();
  ok('contextual actions float near the selection');
  await shot('03-selected');

  step('Edit margin, color and text in the inspector');
  const marginTop = page.locator('.boxmodel > .box-slot--top input');
  await marginTop.fill('40');
  await marginTop.press('Enter');
  await waitFor(() => /margin-top: 40px;/.test(readProject('src/open-canvas.css')), 'margin-top written to CSS');
  await waitFor(async () => (await frame.locator('h2').evaluate((el) => getComputedStyle(el).marginTop)) === '40px', 'preview margin updated');
  ok('margin-top 40px in src/open-canvas.css and in the live preview');

  const colorField = page.locator('.field', { hasText: /^Color/ }).locator('input:not([type=color])');
  await colorField.fill('#dc2626');
  await colorField.press('Enter');
  await waitFor(() => /color: #dc2626;/.test(readProject('src/open-canvas.css')), 'color written to CSS');
  await waitFor(async () => (await frame.locator('h2').evaluate((el) => getComputedStyle(el).color)) === 'rgb(220, 38, 38)', 'preview color updated');
  ok('text color updated in source and preview');

  const textField = page.locator('#oc-text-field');
  await textField.fill('Hello from Open Canvas');
  await textField.press('Enter');
  await waitFor(() => readProject('src/App.jsx').includes('Hello from Open Canvas'), 'text written to JSX');
  await frame.locator('h2', { hasText: 'Hello from Open Canvas' }).waitFor();
  ok('text content edited in JSX');
  await shot('04-edited');

  step('Undo and redo');
  const historyKey = async (keys) => {
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await page.keyboard.press(keys);
  };
  const undoKey = () => historyKey('Control+z');
  const redoKey = () => historyKey('Control+Shift+z');
  await undoKey();
  await waitFor(() => !readProject('src/App.jsx').includes('Hello from Open Canvas'), 'undo text');
  await undoKey();
  await waitFor(() => !/color: #dc2626;/.test(readProject('src/open-canvas.css')), 'undo color');
  ok('undo reverted text and color');
  await redoKey();
  await waitFor(() => /color: #dc2626;/.test(readProject('src/open-canvas.css')), 'redo color');
  ok('redo restored color');

  step('Pick a Google font from the font dropdown');
  await page.getByRole('button', { name: /^Font: / }).click();
  const fontSearch = page.getByRole('combobox', { name: 'Search fonts' });
  await fontSearch.waitFor();
  await page.locator('.font-menu__group', { hasText: 'Google Fonts' }).waitFor({ timeout: 30000 });
  ok(`dropdown lists system and Google Fonts (${await page.locator('.font-menu__foot').textContent()})`);
  await fontSearch.fill('playfair display');
  await waitFor(async () => (await page.locator('.font-option.is-focused .font-option__name').textContent()) === 'Playfair Display', 'search ranks Playfair Display first');
  await shot('04b-font-picker');
  await fontSearch.press('Enter');
  await waitFor(() => readProject('index.html').includes('family=Playfair+Display'), 'font linked from index.html');
  await waitFor(() => /font-family: 'Playfair Display', serif;/.test(readProject('src/open-canvas.css')), 'font-family written to CSS');
  await page.getByRole('button', { name: 'Font: Playfair Display' }).waitFor({ timeout: 20000 });
  await waitFor(async () => (await frame.locator('h2').evaluate((el) => getComputedStyle(el).fontFamily)).includes('Playfair Display'), 'preview uses the font', 20000);
  ok('choosing a font writes the CSS and links the Google font from index.html');
  const fontLoaded = await waitFor(
    () => frame.locator('h2').evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Playfair Display' && f.status === 'loaded')),
    'Google font file loaded in the preview',
    20000,
  ).then(() => true, () => false);
  ok(fontLoaded ? 'font file downloaded from Google and rendered' : 'font file not downloaded (offline?), fallback shown');
  await undoKey();
  await waitFor(() => !readProject('index.html').includes('Playfair') && !readProject('src/open-canvas.css').includes('Playfair'), 'undo removes font and link');
  await redoKey();
  await waitFor(() => readProject('index.html').includes('Playfair'), 'redo restores the font link');
  await frame.locator('h2').waitFor();
  ok('font change and its link are one undo step');

  step('Math and arrow keys in inspector fields');
  const marginBottom = page.locator('.boxmodel > .box-slot--bottom input');
  await marginBottom.fill('16/2');
  await marginBottom.press('Enter');
  await waitFor(() => /margin-bottom: 8px;/.test(readProject('src/open-canvas.css')), '16/2 evaluates to 8px');
  ok('typing 16/2 writes margin-bottom: 8px');
  await marginBottom.press('ArrowUp');
  await marginBottom.press('ArrowUp');
  assert.equal(await marginBottom.inputValue(), '10');
  await waitFor(() => /margin-bottom: 10px;/.test(readProject('src/open-canvas.css')), 'arrow keys commit 10px');
  await marginBottom.press('Shift+ArrowDown');
  await waitFor(() => /margin-bottom: 0px;|margin-bottom: 0;/.test(readProject('src/open-canvas.css')), 'shift+arrow steps by 10');
  ok('ArrowUp/Down step by 1, Shift by 10, and commit after a pause');
  const fontSize = page.locator('.input', { hasText: 'Size' }).locator('input').first();
  await fontSize.fill('(20 + 4) * 1.5px');
  await fontSize.press('Enter');
  await waitFor(() => /font-size: 36px;/.test(readProject('src/open-canvas.css')), 'expression with units');
  ok('expressions with units and parentheses work: (20 + 4) * 1.5px = 36px');

  step('Select multiple layers and edit them together');
  await page.getByRole('radio', { name: 'Layers', exact: true }).click();
  await page.locator('.tree-row', { hasText: 'Container' }).first().click({ modifiers: ['Control'] });
  await page.getByText('2 elements').waitFor();
  await frame.locator('section').first().dispatchEvent('click', { shiftKey: true });
  await page.getByText('3 elements').waitFor();
  await waitFor(async () => (await page.locator('.tree-row.is-active').count()) === 3, 'three rows highlighted in Layers');
  await waitFor(async () => (await frame.locator('[data-oc-overlay]').evaluate((host) => host.shadowRoot.querySelectorAll('.multi').length)) >= 2, 'group boxes drawn in the preview');
  ok('Ctrl+click in Layers and Shift+click on the canvas build a 3-element selection');
  await shot('04c-multi-select');
  const groupColor = page.locator('.field', { hasText: /^Color/ }).locator('input:not([type=color])');
  await groupColor.fill('#2563eb');
  await groupColor.press('Enter');
  await waitFor(() => (readProject('src/open-canvas.css').match(/color: #2563eb;/g) ?? []).length === 3, 'color written for all three');
  ok('one color edit styles all three elements');
  await undoKey();
  await waitFor(() => !readProject('src/open-canvas.css').includes('#2563eb'), 'one undo reverts the group edit');
  ok('the group edit is a single undo step');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await waitFor(async () => (await page.locator('.tree-row.is-active').count()) === 1, 'group cleared');
  await frame.locator('h2').dispatchEvent('click');
  await waitFor(async () => (await page.locator('.inspector-head .tag').textContent()) === '<h2>', 'h2 selected again');

  step('Import an SVG and insert it as an image');
  const svgPath = path.join(WORK, 'brand logo.svg');
  fs.writeFileSync(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40"><rect width="120" height="40" rx="8" fill="#2563eb"/></svg>');
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, svgPath);
  await page.locator('.tree-row', { hasText: 'Container' }).first().click();
  await page.locator('.tool-rail').getByRole('button', { name: 'Image (choose a file)' }).click();
  await waitFor(() => fs.existsSync(path.join(projectRoot(), 'public/brand-logo.svg')), 'SVG copied into public/');
  await waitFor(() => readProject('src/App.jsx').includes('src="/brand-logo.svg" alt="brand logo"'), 'img inserted in JSX');
  await waitFor(async () => (await frame.locator('img[src="/brand-logo.svg"]').evaluate((img) => img.complete && img.naturalWidth)) === 120, 'SVG renders in the preview');
  ok('Image tool imports the SVG into public/ and inserts <img src="/brand-logo.svg">');
  await undoKey();
  await waitFor(() => !readProject('src/App.jsx').includes('brand-logo') && !fs.existsSync(path.join(projectRoot(), 'public/brand-logo.svg')), 'undo removes img and file');
  ok('one undo removes both the <img> and the imported file');
  await page.getByRole('radio', { name: 'Files', exact: true }).click();
  await page.getByRole('button', { name: /^Import files/ }).click();
  await waitFor(() => fs.existsSync(path.join(projectRoot(), 'public/brand-logo.svg')), 'Files panel import');
  await page.locator('.tree-row[title="public/brand-logo.svg"]').waitFor();
  ok('Files panel Import button copies files into public/');
  await page.getByRole('radio', { name: 'Layers', exact: true }).click();
  await frame.locator('h2').dispatchEvent('click');
  await waitFor(async () => (await page.locator('.inspector-head .tag').textContent()) === '<h2>', 'h2 selected after import');

  step('Keyboard shortcuts');
  const blur = () => page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  const selectedTag = () => page.locator('.inspector-head .tag').textContent();
  await blur();
  await page.keyboard.press('Shift+Slash');
  await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor();
  await shot('04d-shortcuts');
  await page.keyboard.press('Escape');
  await waitFor(async () => !(await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).isVisible()), 'dialog closes');
  assert.equal(await selectedTag(), '<h2>', 'Escape closed the dialog without clearing the selection');
  ok('? opens the shortcuts cheat sheet; Escape closes it');

  const h2Count = () => (readProject('src/App.jsx').match(/<h2/g) ?? []).length;
  const before = h2Count();
  await blur();
  await page.keyboard.press('Control+D');
  await waitFor(() => h2Count() === before + 1, 'Ctrl+D duplicates');
  await page.keyboard.press('Control+Z');
  await waitFor(() => h2Count() === before, 'undo duplicate');
  ok('Ctrl+D duplicates the element (copying its styles); Ctrl+Z undoes it');

  await frame.locator('h2').first().dispatchEvent('click');
  await waitFor(async () => (await selectedTag()) === '<h2>', 'h2 reselected');
  await blur();
  await page.keyboard.press('Shift+Enter');
  await waitFor(async () => (await selectedTag()) === '<section>', 'Shift+Enter selects parent');
  await page.keyboard.press('Enter');
  await waitFor(async () => (await selectedTag()) === '<h2>', 'Enter selects first child');
  await page.keyboard.press('Tab');
  await waitFor(async () => (await selectedTag()) === '<div>', 'Tab selects next sibling');
  ok('Shift+Enter, Enter and Tab walk the element tree');

  await page.keyboard.press('Control+G');
  await waitFor(() => readProject('src/App.jsx').includes('data-oc-name="Group"'), 'Ctrl+G groups');
  await waitFor(async () => (await page.locator('.inspector-head__name').inputValue()) === 'Group', 'group selected');
  await page.keyboard.press('Control+Shift+G');
  await waitFor(() => !readProject('src/App.jsx').includes('data-oc-name="Group"'), 'Ctrl+Shift+G ungroups');
  ok('Ctrl+G wraps the selection in a Group container; Ctrl+Shift+G unwraps it');

  const buttons = () => (readProject('src/App.jsx').match(/<button/g) ?? []).length;
  const buttonsBefore = buttons();
  await page.keyboard.press('b');
  await waitFor(() => buttons() === buttonsBefore + 1, 'B inserts a button');
  await page.keyboard.press('Control+Z');
  await waitFor(() => buttons() === buttonsBefore, 'undo insert');
  ok('B inserts a button (and F, R, T, I, L insert other elements)');

  await page.keyboard.press('Control+E');
  await page.locator('.monaco-editor').first().waitFor({ timeout: 20000 });
  await page.keyboard.press('Control+E');
  await waitFor(async () => (await page.getByRole('radio', { name: 'Visual', exact: true }).getAttribute('aria-checked')) === 'true', 'back to visual');
  ok('Ctrl+E switches between Visual and Code, even from inside the code editor');
  await frame.locator('h2').first().dispatchEvent('click');
  await waitFor(async () => (await selectedTag()) === '<h2>', 'h2 selected after shortcuts');

  step('MCP server: an agent edits the open project');
  const openSettings = async (tab) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: tab }).click();
  };
  await openSettings('MCP server');
  await page.locator('.mcp-panel').getByRole('button', { name: 'Start server' }).click();
  await page.locator('.mcp-url', { hasText: `127.0.0.1:${MCP_PORT}/mcp` }).waitFor();
  await shot('04e-mcp-panel');
  const mcpSettings = JSON.parse(fs.readFileSync(path.join(WORK, 'user-data', 'mcp.json'), 'utf8'));
  assert.equal(mcpSettings.enabled, true, 'enabling is remembered');
  let rpcId = 0;
  const mcp = async (method, params) => {
    const res = await fetch(`http://127.0.0.1:${MCP_PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mcpSettings.token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error.message);
    return body.result;
  };
  const tool = async (name, args = {}) => {
    const result = await mcp('tools/call', { name, arguments: args });
    if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
    return result.content;
  };
  assert.equal((await mcp('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } })).serverInfo.name, 'opencanvas');
  assert.ok((await mcp('tools/list')).tools.length >= 20);
  const outline = (await tool('get_outline'))[0].text;
  const mainId = /<main> "Page" (\S+)/.exec(outline)[1];
  const inserted = (await tool('insert_jsx', { parent_id: mainId, jsx: '<aside data-oc-name="Agent note">\n  <strong>Added by an agent</strong>\n</aside>' }))[0].text;
  const asideId = /Element id: (\S+)/.exec(inserted)[1];
  await tool('set_styles', { ids: [asideId], styles: { padding: '16px', 'background-color': 'rgb(255, 77, 46)', color: 'white' } });
  await tool('set_styles', { ids: [asideId], styles: { opacity: '0.8' }, state: 'hover' });
  await frame.locator('aside strong', { hasText: 'Added by an agent' }).waitFor({ timeout: 20000 });
  await waitFor(
    async () => (await frame.locator('aside').evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(255, 77, 46)',
    'agent styles applied live',
  );
  await waitFor(async () => (await page.locator('.tree-row.is-active').textContent())?.includes('Agent note'), 'agent edit selects the element');
  ok('insert_jsx and set_styles show up live on the canvas and select the new element');
  const selection = JSON.parse((await tool('get_selection'))[0].text);
  assert.equal(selection.primary.name, 'Agent note');
  const capture = (await tool('screenshot', { width: 390, full_page: true }))[0];
  assert.equal(capture.type, 'image');
  fs.writeFileSync(path.join(SHOTS, '04f-mcp-capture.jpg'), Buffer.from(capture.data, 'base64'));
  ok(`screenshot tool rendered the page at 390px (${Math.round(capture.data.length / 1024)} KB)`);
  await shot('04g-mcp-edit');
  assert.match((await tool('undo'))[0].text, /Undid: Set opacity \(hover\) \(agent\)/);
  await tool('undo');
  await tool('undo');
  await waitFor(async () => (await frame.locator('aside').count()) === 0, 'agent edits undone');
  assert.ok(!readProject('src/App.jsx').includes('<aside'));
  ok('agent edits are regular history entries that undo cleanly');
  const mcpSwitch = page.getByRole('checkbox', { name: 'Enable MCP server' });
  await waitFor(async () => {
    if (await mcpSwitch.isVisible()) return true;
    await openSettings('MCP server');
    return mcpSwitch.isVisible();
  }, 'MCP panel open');
  await mcpSwitch.uncheck();
  await waitFor(async () => !(await fetch(`http://127.0.0.1:${MCP_PORT}/mcp`).then(() => true, () => false)), 'server stops');
  await page.keyboard.press('Escape');
  await page.locator('.settings-page').waitFor({ state: 'detached' });
  ok('turning the switch off stops the server; Escape leaves Settings');
  await frame.locator('h2').first().dispatchEvent('click');
  await waitFor(async () => (await selectedTag()) === '<h2>', 'h2 selected again');

  step('In-app AI: a reply streams, edits the page, and undoes in one step');
  const ai = await mockOpenAi();
  await openSettings('AI');
  await page.getByRole('radio', { name: /Other OpenAI-compatible/ }).click();
  await page.getByLabel('Server URL').fill(`${ai.url}/v1`);
  await page.locator('.ai-settings').getByRole('button', { name: 'Apply' }).first().click();
  await page.getByText('1 model available.').waitFor({ timeout: 10000 });
  await page.getByLabel('Model', { exact: true }).fill('mock-model');
  await waitFor(() => JSON.parse(fs.readFileSync(path.join(WORK, 'user-data', 'ai-settings.json'), 'utf8')).model === 'mock-model', 'model saved');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await page.getByText(/Connected\. The model replied “OK”/).waitFor({ timeout: 10000 });
  assert.ok(!fs.readFileSync(path.join(WORK, 'user-data', 'ai-settings.json'), 'utf8').includes('key'), 'no key is stored with the settings');
  ok('Settings › AI: provider, server URL, model list and a passing connection test');
  await page.keyboard.press('Escape');
  await page.locator('.settings-page').waitFor({ state: 'detached' });

  const h2Before = await frame.locator('h2').first().textContent();
  await page.locator('.dock__mode[aria-label="Ask AI"]').click();
  const aiInput = page.getByLabel('Message the AI');
  await aiInput.fill('Make this heading orange and say hello');
  await aiInput.press('Enter');
  await waitFor(async () => (await frame.locator('h2').first().textContent()) === 'Hello from the AI', 'AI text edit applied', 30000);
  await waitFor(async () => (await frame.locator('h2').first().evaluate((el) => getComputedStyle(el).color)) === 'rgb(234, 88, 12)', 'AI style edit applied');
  await page.locator('.ai-msg--assistant', { hasText: 'Done: the heading is orange.' }).waitFor({ timeout: 15000 });
  assert.equal(await page.locator('.ai-tool.is-done').count(), 2, 'both tool calls show as done');
  const firstRequest = ai.requests.find((r) => r.tools);
  assert.match(firstRequest.messages[1].content, /Selected element: <h2>/, 'the selection is sent as context');
  await shot('04h-ai-chat');
  ok('the reply streamed into the dock and its two edits show live on the canvas');
  await undoKey();
  await waitFor(async () => (await frame.locator('h2').first().textContent()) === h2Before, 'one undo restores the text');
  await waitFor(async () => (await frame.locator('h2').first().evaluate((el) => getComputedStyle(el).color)) !== 'rgb(234, 88, 12)', 'and the colour');
  ok('one undo reverts everything the AI did in that reply');
  await page.locator('.dock__mode[aria-label="Ask AI"]').click();
  ai.close();
  await frame.locator('h2').first().dispatchEvent('click');
  await waitFor(async () => (await selectedTag()) === '<h2>', 'h2 selected after AI step');

  step('Inline text editing on the canvas');
  await frame.locator('h2').dispatchEvent('dblclick');
  await waitFor(async () => (await frame.locator('h2').getAttribute('contenteditable')) === 'plaintext-only', 'h2 becomes editable');
  await page.keyboard.type('Typed on the canvas');
  await page.keyboard.press('Enter');
  await waitFor(() => readProject('src/App.jsx').includes('>Typed on the canvas</h2>'), 'inline text written to JSX');
  await mobile.locator('h2', { hasText: 'Typed on the canvas' }).waitFor();
  ok('double-click, type and Enter writes the text and syncs to every frame');
  await frame.locator('h2').dispatchEvent('dblclick');
  await waitFor(async () => (await frame.locator('h2').getAttribute('contenteditable')) === 'plaintext-only', 'h2 editable again');
  await page.keyboard.type('Line one');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Line two');
  await page.keyboard.press('Enter');
  await waitFor(() => readProject('src/App.jsx').includes('>Line one<br />Line two</h2>'), 'multi-line text written with <br />');
  ok('Shift+Enter inserts a line break');
  await undoKey();
  await waitFor(() => readProject('src/App.jsx').includes('>Typed on the canvas</h2>'), 'one undo restores previous text');
  await frame.locator('h2', { hasText: 'Typed on the canvas' }).waitFor();
  ok('each inline edit is one undo step');
  await frame.locator('h2').dispatchEvent('dblclick');
  await waitFor(async () => (await frame.locator('h2').getAttribute('contenteditable')) === 'plaintext-only', 'h2 editable for cancel');
  await page.keyboard.type('Discard me');
  await page.keyboard.press('Escape');
  await waitFor(async () => (await frame.locator('h2').getAttribute('contenteditable')) === null, 'escape ends editing');
  assert.ok(!readProject('src/App.jsx').includes('Discard me'));
  await frame.locator('h2', { hasText: 'Typed on the canvas' }).waitFor();
  ok('Escape cancels without writing');

  step('Responsive: edit from the mobile frame');
  await mobile.locator('h2').dispatchEvent('click');
  await waitFor(async () => (await page.locator('.scope-tag').textContent()) === 'Mobile', 'inspector scope is Mobile');
  assert.equal(await page.locator('.frame-chrome.is-active .frame-chrome__name').textContent(), 'Mobile');
  const marginTopMobile = page.locator('.boxmodel > .box-slot--top input');
  await marginTopMobile.fill('8');
  await marginTopMobile.press('Enter');
  await waitFor(() => /@media \(max-width: 640px\) \{\s*\[data-oc="[^"]+"\] \{\s*margin-top: 8px;/.test(readProject('src/open-canvas.css')), 'mobile override written');
  assert.match(readProject('src/open-canvas.css'), /margin-top: 40px;/, 'base value preserved');
  await waitFor(async () => (await mobile.locator('h2').evaluate((el) => getComputedStyle(el).marginTop)) === '8px', 'mobile frame margin');
  await waitFor(async () => (await frame.locator('h2').evaluate((el) => getComputedStyle(el).marginTop)) === '40px', 'desktop frame keeps base margin');
  ok('mobile override written in a media query; desktop frame keeps the base style');
  await shot('05-mobile');

  step('Frames: add, undo, resize');
  await page.getByRole('radio', { name: 'Frames', exact: true }).click();
  await page.getByRole('button', { name: 'Add frame' }).click();
  await page.getByRole('menuitem', { name: /Laptop/ }).click();
  await waitFor(async () => (await frameCount()) === 4, 'laptop frame added');
  await page.getByRole('button', { name: 'Undo layout change' }).click();
  await waitFor(async () => (await frameCount()) === 3, 'layout undo removes it');
  await page.getByRole('button', { name: 'Redo layout change' }).click();
  await waitFor(async () => (await frameCount()) === 4, 'layout redo restores it');
  assert.ok(readProject('src/App.jsx').includes('Typed on the canvas'), 'layout history leaves source alone');
  ok('frames are added from presets; layout undo/redo is separate from source history');
  await page.getByRole('button', { name: 'Zoom to Tablet' }).click();
  const handle = await page.locator('.frame-chrome.is-active .frame-chrome__handle--e').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  const zoom = parseInt(await zoomText(), 10) / 100;
  await page.mouse.move(handle.x + 300 * zoom, handle.y + handle.height / 2, { steps: 8 });
  await page.locator('.size-tip').waitFor();
  await page.mouse.up();
  await waitFor(async () => (await page.locator('.frame-chrome.is-active .frame-chrome__scope').textContent()) === 'Base', 'tablet frame resized past the breakpoint');
  ok(`dragging the frame edge resizes it and the scope follows (${await page.locator('.frame-chrome.is-active .frame-chrome__size').textContent()})`);
  await page.getByRole('button', { name: 'Undo layout change' }).click();
  await waitFor(async () => (await page.locator('.frame-chrome.is-active .frame-chrome__scope').textContent()) === 'Tablet', 'resize undone');
  await waitFor(async () => (await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('oc-canvas:v1:')).length)) === 1, 'layout persisted');
  ok('layout persisted in app storage, outside the project');
  await shot('05b-frames');

  step('Code view');
  await page.getByRole('radio', { name: 'Code', exact: true }).click();
  await page.locator('.monaco-editor').first().waitFor({ timeout: 20000 });
  await shot('06-code');
  ok('Monaco editor shows the active file');

  step('Inline editing refuses a file with unsaved code changes');
  const dirtySource = readProject('src/App.jsx') + '\n';
  await page.locator('.monaco-editor .view-lines').first().click();
  await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), dirtySource);
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+V');
  await page.getByText('Unsaved changes').first().waitFor();
  await page.getByRole('radio', { name: 'Visual', exact: true }).click();
  await frame.locator('h2').dispatchEvent('dblclick');
  await page.getByText(/has unsaved changes in the code editor/).waitFor();
  assert.equal(await frame.locator('h2').getAttribute('contenteditable'), null, 'not editable while dirty');
  await page.locator('.stage__notice').getByRole('button', { name: 'Open in code' }).click();
  await page.locator('.monaco-editor').first().waitFor();
  await page.keyboard.press('Control+S');
  await waitFor(() => readProject('src/App.jsx') === dirtySource, 'dirty buffer saved');
  ok('explanation with "Open in code" shown instead of entering edit mode');

  step('Files: create, rename, undo and delete');
  const exists = (rel) => fs.existsSync(path.join(projectRoot(), rel));
  await page.getByRole('radio', { name: 'Files', exact: true }).click();
  await page.getByRole('button', { name: 'New file', exact: true }).click();
  await page.getByLabel('New file name').fill('src/Notes.jsx');
  await page.getByLabel('New file name').press('Enter');
  await waitFor(() => exists('src/Notes.jsx'), 'file created');
  await waitFor(async () => (await page.locator('.code-status span').first().textContent()) === 'src/Notes.jsx', 'new file opened');
  ok('inline new-file input creates and opens src/Notes.jsx');
  await page.locator('.tree-row[title="src/Notes.jsx"]').hover();
  await page.getByRole('button', { name: 'Rename src/Notes.jsx' }).click();
  await page.getByRole('textbox', { name: 'Rename src/Notes.jsx' }).fill('Ideas.jsx');
  await page.getByRole('textbox', { name: 'Rename src/Notes.jsx' }).press('Enter');
  await waitFor(() => exists('src/Ideas.jsx') && !exists('src/Notes.jsx'), 'file renamed');
  ok('rename moves the file on disk');
  await undoKey();
  await waitFor(() => exists('src/Notes.jsx') && !exists('src/Ideas.jsx'), 'rename undone');
  ok('undo restores the original name');
  await page.locator('.tree-row[title="src/Notes.jsx"]').hover();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Delete src/Notes.jsx' }).click();
  await waitFor(() => !exists('src/Notes.jsx'), 'file deleted');
  ok('delete removes the file after confirmation');
  await page.locator('.tree-row[title="src/App.jsx"]').click();
  await page.locator('.monaco-editor').first().waitFor({ timeout: 20000 });

  step('Dark mode');
  const chooseTheme = async (label) => {
    await openSettings('Appearance');
    await page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: label }).click();
    await page.getByRole('button', { name: 'Back to editor' }).click();
    await page.locator('.settings-page').waitFor({ state: 'detached' });
  };
  await chooseTheme('Dark');
  await waitFor(async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark theme applied');
  await waitFor(async () => (await page.locator('.monaco-editor').first().getAttribute('class'))?.includes('vs-dark'), 'Monaco uses the dark theme');
  assert.equal(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'dark', 'native title bar follows the theme');
  await shot('06b-code-dark');
  await page.getByRole('radio', { name: 'Visual', exact: true }).click();
  await shot('06c-visual-dark');
  ok('UI, code editor and native window switch to dark; preference saved');
  assert.equal(await page.evaluate(() => localStorage.getItem('oc-theme')), 'dark', 'theme preference saved');

  step('Git: initialize, commit, connect a remote');
  await page.getByRole('button', { name: 'Source control' }).click();
  await page.getByRole('button', { name: 'Initialize repository' }).click();
  await waitFor(() => fs.existsSync(path.join(projectRoot(), '.git')), 'repository initialized');
  await page.locator('.git-panel').getByText('main', { exact: true }).waitFor();
  ok('Initialize repository creates .git on branch main');
  if (await page.getByRole('textbox', { name: 'Your name' }).isVisible().catch(() => false)) {
    await page.getByRole('textbox', { name: 'Your name' }).fill('E2E Tester');
    await page.getByRole('textbox', { name: 'Email' }).fill('e2e@example.com');
    await page.getByRole('button', { name: 'Save identity' }).click();
  }
  const commitBox = page.getByRole('textbox', { name: 'Commit message' });
  await commitBox.waitFor();
  await waitFor(async () => (await page.locator('.git-files li').count()) > 3, 'changes listed');
  await commitBox.fill('First version from OpenCanvas');
  await shot('06d-git-dark');
  await page.locator('.git-panel').getByRole('button', { name: 'Commit', exact: true }).click();
  await page.getByText('No changes since the last commit.').waitFor({ timeout: 20000 });
  const log = execSync('git log -1 --format=%s', { cwd: projectRoot() }).toString().trim();
  assert.equal(log, 'First version from OpenCanvas');
  ok('Commit stages every project file and records the message');
  await page.getByRole('tab', { name: 'Existing URL' }).click();
  await page.getByRole('textbox', { name: 'Repository URL' }).fill('example/e2e-site');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.locator('.git-link', { hasText: 'github.com/example/e2e-site' }).waitFor();
  assert.equal(execSync('git remote get-url origin', { cwd: projectRoot() }).toString().trim(), 'https://github.com/example/e2e-site.git');
  await page.getByRole('button', { name: /^Push/ }).waitFor();
  ok('owner/repo shorthand connects https://github.com/example/e2e-site.git; Push and Pull become available');
  await page.keyboard.press('Escape');
  await waitFor(async () => !(await page.locator('.git-panel').isVisible()), 'git panel closes');

  await chooseTheme('Light');
  await waitFor(async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'light theme restored');
  ok('switching back to light works');

  step('Go live: save, push to GitHub, publish on Vercel');
  await app.evaluate(({ ipcMain }) => {
    globalThis.__goLive = { opened: [], result: { status: 'needs-vercel', importUrl: 'https://vercel.com/new/import?s=https%3A%2F%2Fgithub.com%2Fexample%2Fe2e-site', reason: 'no-account' } };
    for (const channel of ['git:push', 'publish:vercel', 'publish:open']) ipcMain.removeHandler(channel);
    ipcMain.handle('git:push', async () => undefined);
    ipcMain.handle('publish:vercel', async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return globalThis.__goLive.result;
    });
    ipcMain.handle('publish:open', async (_event, url) => void globalThis.__goLive.opened.push(url));
  });
  fs.writeFileSync(path.join(projectRoot(), 'NOTES.md'), 'Launch notes\n');
  await page.getByRole('button', { name: 'Go live' }).click();
  const goLive = page.getByRole('dialog', { name: 'Go live' });
  await goLive.getByText('example/e2e-site').waitFor();
  await goLive.getByLabel('What changed').fill('Launch notes');
  await shot('06e-go-live');
  await goLive.getByRole('button', { name: 'Go live', exact: true }).click();
  await goLive.getByText('Would you like to go to Vercel so it can become live?').waitFor({ timeout: 20000 });
  assert.equal(execSync('git log -1 --format=%s', { cwd: projectRoot() }).toString().trim(), 'Launch notes');
  assert.equal(await goLive.locator('.golive-step.is-done').count(), 2, 'save and push steps done');
  await shot('06f-go-live-vercel-prompt');
  await goLive.getByRole('button', { name: 'Go to Vercel' }).click();
  await goLive.getByText('press Go live again').waitFor();
  assert.deepEqual(await app.evaluate(() => globalThis.__goLive.opened), ['https://vercel.com/new/import?s=https%3A%2F%2Fgithub.com%2Fexample%2Fe2e-site']);
  ok('no Vercel: after saving and pushing, the user is asked whether to go to Vercel, which opens the import page');
  await app.evaluate(() => {
    globalThis.__goLive.result = { status: 'live', url: 'https://e2e-site.vercel.app', inspectUrl: null };
  });
  await goLive.getByRole('button', { name: 'Go live again' }).click();
  await goLive.locator('.golive__live', { hasText: 'e2e-site.vercel.app' }).waitFor({ timeout: 20000 });
  assert.equal(await goLive.locator('.golive-step.is-done').count(), 3);
  await shot('06g-go-live-done');
  await goLive.getByRole('button', { name: 'Close' }).click();
  ok('with Vercel connected, all three steps complete and the live link is shown');

  step('Terminal: run a command, interrupt it, and leave nothing behind');
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.press('Control+Backquote');
  await page.locator('.terminal-panel .xterm').waitFor({ timeout: 15000 });
  const terminals = () => page.evaluate(() => window.oc.terminal.list());
  await waitFor(async () => (await terminals()).some((t) => t.status === 'running' && t.pid > 4), 'shell started with a real pid', 20000);
  const [shell] = await terminals();
  // eslint-disable-next-line no-control-regex
  const termOutput = async () => (await page.evaluate((id) => window.oc.terminal.scrollback(id), shell.id)).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g, '');
  const runInTerminal = async (command) => {
    await page.locator('.terminal-panel .xterm').click();
    await page.keyboard.type(command);
    await page.keyboard.press('Enter');
  };
  await runInTerminal(`node -e "console.log('oc'+'-'+6*7)"`);
  await waitFor(async () => (await termOutput()).includes('oc-42'), 'command output in the terminal', 20000);
  await shot('06h-terminal');
  ok('the shell runs node and shows its output');

  await runInTerminal(`node -e "console.log('wait'+'ing'); setInterval(() => {}, 1000)"`);
  await waitFor(async () => (await termOutput()).includes('waiting'), 'long-running command started', 20000);
  await page.keyboard.press('Control+C');
  // Keystrokes sent while the shell redraws its prompt get dropped, so wait for the prompt to come back.
  await waitFor(async () => {
    const out = await termOutput();
    return /\n[^\n]*>\s*$/.test(out.slice(out.lastIndexOf('waiting')));
  }, 'prompt back after Ctrl+C', 20000);
  await runInTerminal(`node -e "console.log('back'+'-again')"`);
  await waitFor(async () => (await termOutput()).includes('back-again'), 'shell accepts input after Ctrl+C', 20000);
  ok('Ctrl+C interrupts the running program');

  await page.getByRole('button', { name: `Kill ${shell.title}` }).click();
  await waitFor(async () => (await terminals()).length === 0, 'terminal closed');
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  await waitFor(() => !alive(shell.pid), `shell process ${shell.pid} ended`);
  ok(`closing the tab ended the shell (pid ${shell.pid})`);

  // Left running on purpose: closing the project must end it.
  await page.getByRole('button', { name: 'New terminal' }).first().click();
  await waitFor(async () => (await terminals()).some((t) => t.status === 'running' && t.pid > 4), 'second shell started', 20000);
  const [leftOpen] = await terminals();
  const leftOutput = async () => (await page.evaluate((id) => window.oc.terminal.scrollback(id), leftOpen.id)).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g, '');
  await waitFor(async () => /\n?[^\n]*>\s*$/.test(await leftOutput()), 'second shell prompt', 20000);
  await runInTerminal(`node -e "console.log('child-'+process.pid); setInterval(() => {}, 1000)"`);
  let childPid = 0;
  await waitFor(async () => (childPid = Number(/child-(\d+)/.exec(await leftOutput())?.[1] ?? 0)) > 0, 'long-running child reports its pid', 20000);
  await page.getByRole('button', { name: 'Hide terminal (Ctrl+`)' }).click();
  await page.locator('.terminal-panel').waitFor({ state: 'detached' });
  ok(`the panel hides with a shell (pid ${leftOpen.pid}) and its child (pid ${childPid}) still running`);

  step('Export ZIP');
  const zipPath = path.join(WORK, 'export.zip');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, zipPath);
  await page.getByRole('button', { name: 'More publish options' }).click();
  await page.getByRole('menuitem', { name: /Export/ }).click();
  await page.locator('.export-report__summary').waitFor({ timeout: 20000 });
  assert.match(await page.locator('.export-report__summary').textContent(), /^Checked \d+ files/);
  assert.equal(await page.locator('.export-issue', { hasText: 'OpenCanvas preview code' }).count(), 0, 'no preview code in the source');
  assert.equal(await page.locator('.export-issue--error').count(), 0, 'a fresh project has no export errors');
  await shot('07a-export-report');
  ok(`export report shown: ${await page.locator('.export-report__summary').textContent()}`);
  await page.getByRole('button', { name: /Download project ZIP/ }).click();
  await page.getByText(/Exported \d+ files/).waitFor({ timeout: 20000 });
  await shot('07-export');
  assert.ok(fs.existsSync(zipPath));
  ok(`ZIP written: ${zipPath}`);
  await page.getByRole('dialog', { name: 'Export project' }).getByRole('button', { name: 'Close' }).click();

  step('Import the exported ZIP from the start page');
  await page.locator('.project-btn').click();
  await page.getByRole('menuitem', { name: 'Close project' }).click();
  await page.getByLabel('Search projects').waitFor();
  await waitFor(() => !alive(leftOpen.pid) && !alive(childPid), `shell ${leftOpen.pid} and child ${childPid} ended with the project`);
  ok('closing the project ended every terminal process');
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, zipPath);
  await page.getByRole('button', { name: 'Open folder / file' }).click();
  await page.getByRole('menuitem', { name: 'Import ZIP…' }).click();
  const summary = page.getByRole('dialog', { name: 'Project imported' });
  await summary.waitFor({ timeout: 30000 });
  assert.equal(await summary.locator('.import-summary__row', { hasText: 'Framework' }).locator('dd').textContent(), 'React + Vite');
  await shot('07b-zip-import');
  await summary.getByRole('button', { name: 'Start editing' }).click();
  await summary.waitFor({ state: 'detached' });
  const importedDirs = fs.readdirSync(path.join(WORK, 'projects'));
  assert.equal(importedDirs.length, 2, `the ZIP was unpacked into its own folder (${importedDirs.join(', ')})`);
  ok(`ZIP unpacked to ${importedDirs[1]} and summarized`);
  await frame.locator('h2', { hasText: 'Typed on the canvas' }).waitFor({ timeout: 60000 });
  ok('the imported project previews');

  assert.deepEqual(errors.filter((e) => !/Autofill|DevTools/.test(e)), [], 'no renderer errors');
  ok('no renderer errors');

  await app.close();

  step('Exported project runs independently');
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const outDir = path.join(WORK, 'unzipped');
  for (const [name, entry] of Object.entries(zip.files)) {
    const dest = path.join(outDir, name);
    if (entry.dir) fs.mkdirSync(dest, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, await entry.async('nodebuffer'));
    }
  }
  const exported = path.join(outDir, fs.readdirSync(outDir)[0]);
  assert.ok(!fs.existsSync(path.join(exported, 'node_modules')));
  ok(`unzipped to ${exported}`);
  if (skipInstall) {
    console.log('  (skipping npm install / build)');
  } else {
    execSync('npm install --no-audit --no-fund', { cwd: exported, stdio: 'inherit' });
    execSync('npm run build', { cwd: exported, stdio: 'inherit' });
    assert.ok(fs.existsSync(path.join(exported, 'dist', 'index.html')));
    ok('npm install && npm run build succeeded outside OpenCanvas');
    await importPhase(exported);
  }
  console.log(`\nAll end-to-end checks passed. Screenshots: ${SHOTS}`);
} catch (err) {
  await shot('failure').catch(() => undefined);
  console.error('\n✖ E2E failed:', err.message);
  await page.screenshot({ path: path.join(SHOTS, 'failure.png') }).catch(() => undefined);
  console.error('Focused element:', await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 160)).catch(() => '?'));
  if (errors.length) console.error('Renderer errors:\n' + errors.join('\n'));  await app.close().catch(() => undefined);
  process.exitCode = 1;
}
