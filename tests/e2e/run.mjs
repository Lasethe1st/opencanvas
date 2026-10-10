/**
 * End-to-end check of the MVP "definition of done" against the built Electron app.
 * Run with `npm run test:e2e`. Pass --skip-install to skip installing/building the exported ZIP.
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
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
  const f = p.frameLocator('iframe[title="Project preview"]');
  const errs = [];
  p.on('pageerror', (err) => errs.push(err.message));
  try {
    await app2.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
    }, projectDir);
    await p.getByText('Start designing').waitFor();
    await p.getByRole('button', { name: /Open existing project/ }).click();
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
    const next = fs.readFileSync(appFile, 'utf8').replace('New section', 'Edited in code');
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
  env: { ...process.env, OC_USER_DATA: path.join(WORK, 'user-data'), OC_PROJECTS_DIR: path.join(WORK, 'projects') },
});
const page = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1480, 920));
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));
page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => undefined);

const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const frame = page.frameLocator('iframe[title="Project preview"]');
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

try {
  step('Launch and onboarding');
  await page.getByText('Start designing').waitFor();
  await shot('01-onboarding');
  ok('onboarding visible');

  step('Create a blank project');
  await page.getByRole('button', { name: /Blank project/ }).click();
  await page.getByPlaceholder('Project name').fill('E2E Site');
  await page.getByRole('button', { name: 'Create blank project' }).click();
  await page.getByText('This page is empty').waitFor({ timeout: 60000 });
  ok(`project created at ${projectRoot()}`);
  await shot('02-blank-canvas');

  step('Add a section from the empty state, then a container from the dock');
  await page.getByRole('button', { name: 'Add section' }).click();
  await frame.locator('h2', { hasText: 'New section' }).waitFor({ timeout: 20000 });
  ok('section rendered in preview');
  await waitFor(async () => (await page.locator('.tree-row.is-active').textContent())?.includes('Section'), 'new section selected in Layers');
  ok('new section auto-selected and highlighted in Layers');
  await page.getByRole('button', { name: 'Container', exact: true }).click();
  await waitFor(async () => (await page.locator('.tree-row.is-active').textContent())?.includes('Container'), 'container selected');
  assert.match(readProject('src/App.jsx'), /<div data-oc="div-[a-z0-9]+" data-oc-name="Container">/);
  ok('container inserted into the section in source');

  step('Select an element on the canvas');
  await page.getByRole('button', { name: '100%' }).click();
  await waitFor(async () => (await page.locator('.canvas-bar__zoom').first().textContent()) === '100%', 'zoom set to 100%');
  ok('zoom control sets 100%');
  await page.getByRole('button', { name: 'Fit' }).click();
  // Playwright can't map pointer coordinates into a CSS-scaled iframe; a dispatched click still goes through the bridge.
  await frame.locator('h2').dispatchEvent('click');
  await waitFor(async () => (await page.locator('.inspector-head .tag').textContent()) === '<h2>', 'inspector shows h2');
  await waitFor(async () => (await page.locator('.tree-row.is-active').textContent())?.includes('Heading'), 'Layers highlights h2');
  ok('canvas selection syncs to inspector and Layers');
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
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await waitFor(() => !readProject('src/App.jsx').includes('Hello from Open Canvas'), 'undo text');
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await waitFor(() => !/color: #dc2626;/.test(readProject('src/open-canvas.css')), 'undo color');
  ok('undo reverted text and color');
  await page.getByRole('button', { name: 'Redo' }).first().click();
  await waitFor(() => /color: #dc2626;/.test(readProject('src/open-canvas.css')), 'redo color');
  ok('redo restored color');

  step('Responsive: mobile override');
  await page.getByRole('radio', { name: 'Mobile' }).click();
  await waitFor(async () => (await page.locator('.canvas-frame').evaluate((el) => el.style.width)) === '390px', 'mobile viewport width');
  await page.getByText(/Editing mobile overrides/).waitFor();
  const marginTopMobile = page.locator('.boxmodel > .box-slot--top input');
  await marginTopMobile.fill('8');
  await marginTopMobile.press('Enter');
  await waitFor(() => /@media \(max-width: 640px\) \{\s*\[data-oc="[^"]+"\] \{\s*margin-top: 8px;/.test(readProject('src/open-canvas.css')), 'mobile override written');
  assert.match(readProject('src/open-canvas.css'), /margin-top: 40px;/, 'base value preserved');
  await waitFor(async () => (await frame.locator('h2').evaluate((el) => getComputedStyle(el).marginTop)) === '8px', 'mobile preview margin');
  ok('mobile override written in a media query; base style preserved');
  await shot('05-mobile');
  await page.getByRole('radio', { name: 'Tablet' }).click();
  await waitFor(async () => (await page.locator('.canvas-frame').evaluate((el) => el.style.width)) === '834px', 'tablet viewport width');
  await page.getByRole('radio', { name: 'Desktop' }).click();
  ok('tablet and desktop presets switch');

  step('Code view');
  await page.getByRole('radio', { name: 'Code', exact: true }).click();
  await page.locator('.monaco-editor').first().waitFor({ timeout: 20000 });
  await shot('06-code');
  ok('Monaco editor shows the active file');

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
  await page.getByRole('button', { name: 'Undo' }).first().click();
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
    await page.getByRole('button', { name: 'Theme' }).click();
    await page.getByRole('menuitemradio', { name: label }).click();
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
  await chooseTheme('Light');
  await waitFor(async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'light theme restored');
  ok('switching back to light works');

  step('Export ZIP');
  const zipPath = path.join(WORK, 'export.zip');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, zipPath);
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('button', { name: /Download project ZIP/ }).click();
  await page.getByText(/Exported \d+ files/).waitFor({ timeout: 20000 });
  await shot('07-export');
  assert.ok(fs.existsSync(zipPath));
  ok(`ZIP written: ${zipPath}`);

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
  if (errors.length) console.error('Renderer errors:\n' + errors.join('\n'));
  await app.close().catch(() => undefined);
  process.exitCode = 1;
}
