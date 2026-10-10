import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { EditCommand, FileChange, ProjectInfo, RecentProject, TemplateId, ThemePreference } from '../shared/types';
import { applyEdit, inspectElement, relocate, revertChanges } from './services/edits';
import { buildProjectZip, runInstructions } from './services/exporter';
import { cancelInstall, installDependencies, PreviewManager } from './services/preview';
import { detectProject, listTree, ProjectError, safeResolve, slugify, uniqueDir, writeFiles } from './services/project';
import { generateTemplate, TEMPLATES } from './templates';

const APP_ROOT = app.getAppPath();
const DEV_URL = process.env.OC_DEV_SERVER_URL;
if (process.env.OC_USER_DATA) app.setPath('userData', process.env.OC_USER_DATA);
const projectsDir = () => process.env.OC_PROJECTS_DIR ?? path.join(app.getPath('documents'), 'OpenCanvas Projects');

let win: BrowserWindow | null = null;
let project: ProjectInfo | null = null;
let watcher: fs.FSWatcher | null = null;
let hasUnsavedChanges = false;

const preview = new PreviewManager(APP_ROOT, path.join(app.getPath('userData'), 'preview-cache'), (status) => {
  win?.webContents.send('preview:status', status);
});

function recentFile() {
  return path.join(app.getPath('userData'), 'recent-projects.json');
}

function readRecent(): RecentProject[] {
  try {
    const list = JSON.parse(fs.readFileSync(recentFile(), 'utf8')) as RecentProject[];
    return list.filter((p) => fs.existsSync(path.join(p.root, 'package.json')));
  } catch {
    return [];
  }
}

function rememberProject(info: ProjectInfo) {
  const list = [{ root: info.root, name: info.name, openedAt: Date.now() }, ...readRecent().filter((p) => p.root !== info.root)].slice(0, 8);
  fs.mkdirSync(path.dirname(recentFile()), { recursive: true });
  fs.writeFileSync(recentFile(), JSON.stringify(list, null, 2));
}

function dependencyVersions() {
  const version = (name: string) => JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'node_modules', name, 'package.json'), 'utf8')).version as string;
  return { react: version('react'), reactDom: version('react-dom'), vite: version('vite'), pluginReact: version('@vitejs/plugin-react') };
}

function watchProject(root: string) {
  watcher?.close();
  let timer: NodeJS.Timeout | null = null;
  const changed = new Set<string>();
  try {
    watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const rel = filename.toString().split(path.sep).join('/');
      if (/(^|\/)(node_modules|\.git|dist|\.vite)(\/|$)/.test(rel)) return;
      changed.add(rel);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        win?.webContents.send('project:filesChanged', [...changed]);
        changed.clear();
      }, 150);
    });
  } catch {
    watcher = null;
  }
}

function activate(info: ProjectInfo): ProjectInfo {
  project = info;
  rememberProject(info);
  watchProject(info.root);
  preview.stop();
  return info;
}

function requireProject(): ProjectInfo {
  if (!project) throw new ProjectError('No project is open.');
  return project;
}

/** Only the editor's own top-level page may call privileged APIs. */
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>) {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) {
      throw new Error('Blocked IPC call from an untrusted frame.');
    }
    return fn(...(args as A));
  });
}

function registerIpc() {
  handle('templates:list', () => TEMPLATES);
  handle('projects:recent', () => readRecent());
  handle('projects:defaultLocation', () => projectsDir());

  handle('project:create', (template: TemplateId, name: string) => {
    if (!TEMPLATES.some((t) => t.id === template)) throw new ProjectError('Unknown template.');
    const title = name.trim() || 'Untitled project';
    const parent = projectsDir();
    fs.mkdirSync(parent, { recursive: true });
    const root = uniqueDir(parent, slugify(title));
    fs.mkdirSync(root);
    writeFiles(root, generateTemplate(template, path.basename(root), title, dependencyVersions()));
    return activate(detectProject(root));
  });

  handle('project:openDialog', async () => {
    const result = await dialog.showOpenDialog(win!, { title: 'Open project folder', properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    return activate(detectProject(result.filePaths[0]));
  });

  handle('project:open', (root: string) => activate(detectProject(root)));
  handle('project:refresh', () => {
    const info = detectProject(requireProject().root);
    project = info;
    return info;
  });
  handle('project:close', () => {
    preview.stop();
    watcher?.close();
    watcher = null;
    project = null;
  });

  handle('files:tree', () => listTree(requireProject().root));
  handle('files:read', (rel: string) => fs.readFileSync(safeResolve(requireProject().root, rel), 'utf8'));
  handle('files:write', (rel: string, content: string): FileChange => {
    const abs = safeResolve(requireProject().root, rel);
    const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
    return { path: rel, before, after: content };
  });
  handle('files:createFile', (rel: string): FileChange => {
    const abs = safeResolve(requireProject().root, rel);
    if (fs.existsSync(abs)) throw new ProjectError(`${rel} already exists.`);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '', 'utf8');
    return { path: rel, before: null, after: '' };
  });
  handle('files:delete', (rel: string) => relocate(requireProject().root, rel, null));
  handle('files:rename', (from: string, to: string) => relocate(requireProject().root, from, to));
  handle('files:createFolder', (rel: string) => {
    const abs = safeResolve(requireProject().root, rel);
    if (fs.existsSync(abs)) throw new ProjectError(`${rel} already exists.`);
    fs.mkdirSync(abs, { recursive: true });
  });

  handle('edit:apply', (command: EditCommand) => applyEdit(requireProject(), command));
  handle('edit:inspect', (id: string) => inspectElement(requireProject(), id));
  handle('edit:revert', (changes: FileChange[], direction: 'undo' | 'redo') => revertChanges(requireProject().root, changes, direction));

  handle('preview:start', () => preview.start(requireProject()));
  handle('preview:stop', () => preview.stop());
  handle('preview:status', () => preview.getStatus());
  handle('preview:install', async () => {
    const info = requireProject();
    preview.stop();
    const result = await installDependencies(info, (text) => win?.webContents.send('preview:installLog', text));
    project = detectProject(info.root);
    return { ...result, project };
  });
  handle('preview:cancelInstall', () => cancelInstall());

  handle('export:zip', async () => {
    const info = requireProject();
    const save = await dialog.showSaveDialog(win!, {
      title: 'Export project',
      defaultPath: path.join(app.getPath('downloads'), `${path.basename(info.root)}.zip`),
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
    });
    if (save.canceled || !save.filePath) return { ok: false };
    const zip = await buildProjectZip(info);
    fs.writeFileSync(save.filePath, zip.buffer);
    return { ok: true, path: save.filePath, fileCount: zip.files.length, instructions: runInstructions(info) };
  });
  handle('export:reveal', (file: string) => shell.showItemInFolder(file));
  handle('export:revealProject', () => shell.openPath(requireProject().root));

  handle('app:setUnsaved', (value: boolean) => {
    hasUnsavedChanges = value;
  });
  handle('app:setTheme', (preference: ThemePreference) => {
    if (preference !== 'system' && preference !== 'light' && preference !== 'dark') return;
    nativeTheme.themeSource = preference;
    win?.setBackgroundColor(windowBackground());
  });
}

const windowBackground = () => (nativeTheme.shouldUseDarkColors ? '#0e0e10' : '#f5f5f6');

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    title: 'OpenCanvas',
    backgroundColor: windowBackground(),
    show: false,
    webPreferences: {
      preload: path.join(APP_ROOT, 'dist-electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.once('ready-to-show', () => win?.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (DEV_URL && url.startsWith(DEV_URL)) return;
    event.preventDefault();
  });

  win.on('close', (event) => {
    if (!hasUnsavedChanges) return;
    const choice = dialog.showMessageBoxSync(win!, {
      type: 'warning',
      buttons: ['Discard changes', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'You have unsaved changes in the code editor.',
      detail: 'Closing now will discard them.',
    });
    if (choice === 1) event.preventDefault();
  });

  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadFile(path.join(APP_ROOT, 'dist', 'index.html'));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  preview.stop();
  app.quit();
});

app.on('before-quit', () => preview.stop());
