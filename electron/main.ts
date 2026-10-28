import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, safeStorage, shell, type IpcMainInvokeEvent } from 'electron';
import { ensureSkillsDir, listSkills, readSkill } from './services/skills';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { EditCommand, FileChange, ImportedProject, McpApplied, McpRequest, McpStatus, OpenedFile, ProjectInfo, RecentProject, TemplateId, ThemePreference } from '../shared/types';
import { applyEdit, inspectElement, relocate, revertChanges } from './services/edits';
import { McpServer, newToken, readMcpSettings, writeMcpSettings, type McpSettings } from './services/mcp';
import { createMcpTools, createVariantTools, MCP_INSTRUCTIONS, type McpContext } from './services/mcp-tools';
import {
  applyVariant,
  beginVariantSet,
  discardVariant,
  discardVariantSet,
  finishGeneratingSet,
  listVariants,
  markVariantFailed,
  proposeVariant,
  pruneVariants,
  readVariantIndex,
  resetVariantForRetry,
  ensureVariantsGitignore,
} from './services/variants';
import type { VariantGenerateRequest, VariantRecord } from '../shared/variants';
import { clampVariantCount } from '../shared/variants';
import { locateElement } from '../shared/source/jsx';
import { parseSourceId } from '../shared/source/ast';
import { IMAGE_EXTENSIONS, importFiles } from './services/assets';
import { buildProjectZip, runInstructions } from './services/exporter';
import { runBuildCheck, validateExport } from './services/export-validate';
import { googleFonts } from './services/fonts';
import { projectFavicon } from './services/favicon';
import { goLiveOnVercel } from './services/vercel';
import { createGithubRepo, gitClone, gitCommit, gitInit, gitPull, gitPush, gitSetIdentity, gitSetRemote, gitStatus, remoteWebUrl } from './services/git';
import { cancelInstall, installDependencies, PreviewManager } from './services/preview';
import { detectProject, findProjectRoot, listTree, ProjectError, projectSummary, safeResolve, slugify, uniqueDir, writeFiles } from './services/project';
import { extractZip, ZIP_LIMITS } from './services/zip-import';
import { generateTemplate, TEMPLATES } from './templates';
import { createPage, createWorkspacePage, deletePage, duplicatePage, imageDataUrl, pagesState, referenceImage, renamePage, reorderPages, writeDirection } from './services/project-config';
import { readWorkspace, writeWorkspace } from './services/workspace';
import { connectProvider, disconnectProvider, listProviders, providerBoardItems, providerBoards, providerImage, saveeProvider, searchProvider, setProviders } from './services/inspiration';
import { SaveeClient } from './services/savee';
import { parseCssTokens, parseJsonTokens, TokenImportError } from '../shared/design-tokens';
import type { DesignSystemConfig, DirectionConfig } from '../shared/project-config';
import type { AiTurnContext, ProjectSetup } from '../shared/api';
import { providerMeta, validateBaseUrl, type AiSettings, type AiStatus } from '../shared/ai';
import { buildDesignContext } from '../shared/design-context';
import { aiKeyName, aiNotReadyReason, normalizeAiSettings, readAiSettings, redact, SecretStore, writeAiSettings, type Cipher } from './services/ai-keys';
import { listModels, testConnection } from './services/ai-providers';
import { voiceCapabilities, voiceReply, voiceSpeak, voiceTranscribe } from './services/ai-voice';
import {
  designSystemStatus,
  exportDesignSystem,
  hydrateFromDirection,
  restoreDesignSystem,
  setActiveTheme,
  syncDesignTokensCss,
  tokenImpact,
  updateToken,
} from './services/design-system';
import { AiAgent } from './services/ai-agent';
import type { VoiceChatMessage } from '../shared/voice';
import type { Token } from '../shared/design-system';
import { TerminalManager, type SpawnPty } from './services/terminal';

const APP_ROOT = app.getAppPath();
const DEV_URL = process.env.OC_DEV_SERVER_URL;
if (process.env.OC_USER_DATA) app.setPath('userData', process.env.OC_USER_DATA);
const skillsDir = () => process.env.OC_SKILLS_DIR ?? path.join(app.getPath('documents'), 'OpenCanvas Skills');
const projectsDir = () => process.env.OC_PROJECTS_DIR ?? path.join(app.getPath('documents'), 'OpenCanvas Projects');

/** Window / dock icon — replace `src/assets/brand-mark.png` to change the app mark. */
function appIconPath(): string | undefined {
  const candidates = [
    path.join(APP_ROOT, 'src', 'assets', 'brand-mark.png'),
    path.join(__dirname, '..', 'src', 'assets', 'brand-mark.png'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

let win: BrowserWindow | null = null;
let project: ProjectInfo | null = null;
let watcher: fs.FSWatcher | null = null;
let hasUnsavedChanges = false;
let buildCheck: AbortController | null = null;

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

const SIZE_SKIP = new Set(['node_modules', '.git', 'dist', '.vite', 'coverage']);

/** Approximate project size on disk, skipping heavy / generated folders. */
function projectBytes(root: string): number {
  let total = 0;
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SIZE_SKIP.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) total += fs.statSync(full).size;
      } catch {
        /* unreadable */
      }
    }
  };
  walk(root);
  return total;
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

/* ---------- Terminal ---------- */

let ptyUnavailable: string | null = null;
let spawnPty: SpawnPty | null = null;
try {
  const pty = require('@lydell/node-pty') as { spawn: SpawnPty };
  spawnPty = (file, args, opts) => pty.spawn(file, args, opts);
} catch (err) {
  ptyUnavailable = `The terminal component couldn't load (${(err as Error).message.split('\n')[0]}). Reinstall OpenCanvas dependencies with npm install.`;
}

const terminals = new TerminalManager({
  spawn: (file, args, opts) => {
    if (!spawnPty) throw new Error(ptyUnavailable ?? 'Terminal unavailable.');
    return spawnPty(file, args, opts);
  },
  onData: (id, data) => win?.webContents.send('terminal:data', { id, data }),
  onExit: (event) => win?.webContents.send('terminal:exit', event),
});

function pushVariantsChanged() {
  if (!project) return;
  win?.webContents.send('variants:changed', listVariants(project.root));
}

function activate(info: ProjectInfo): ProjectInfo {
  if (project?.root !== info.root) {
    agent.reset();
    terminals.killAll();
  }
  project = info;
  rememberProject(info);
  watchProject(info.root);
  preview.stop();
  try {
    pruneVariants(info.root);
    ensureVariantsGitignore(info.root);
  } catch {
    /* best-effort */
  }
  pushVariantsChanged();
  return info;
}

function requireProject(): ProjectInfo {
  if (!project) throw new ProjectError('No project is open.');
  return project;
}

/* ---------- MCP server ---------- */

const mcpSettingsFile = () => path.join(app.getPath('userData'), 'mcp.json');
let mcpSettings: McpSettings;
let mcpServer: McpServer | null = null;
let mcpError: string | null = null;
let mcpCalls = 0;
let mcpLast: { tool: string; at: number } | null = null;
const rendererRequests = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
let rendererRequestSeq = 0;

function mcpStatus(): McpStatus {
  const url = `http://127.0.0.1:${mcpSettings.port}/mcp`;
  return {
    enabled: mcpSettings.enabled,
    running: !!mcpServer?.listening,
    port: mcpSettings.port,
    url,
    token: mcpSettings.token,
    error: mcpError,
    calls: mcpCalls,
    lastTool: mcpLast?.tool ?? null,
    lastAt: mcpLast?.at ?? null,
  };
}

const pushMcpStatus = () => win?.webContents.send('mcp:status', mcpStatus());

function recordForUndo(applied: McpApplied) {
  if (applied.changes.length) win?.webContents.send('mcp:applied', applied);
}

function rendererRequest(action: McpRequest['action'], arg?: unknown): Promise<unknown> {
  if (!win || win.isDestroyed()) return Promise.reject(new Error('The OpenCanvas window is not open.'));
  const id = ++rendererRequestSeq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      rendererRequests.delete(id);
      reject(new Error('The OpenCanvas window did not respond.'));
    }, 15_000);
    rendererRequests.set(id, { resolve, reject, timer });
    win!.webContents.send('mcp:request', { id, action, arg } satisfies McpRequest);
  });
}

async function waitForPreview(timeoutMs: number): Promise<string> {
  const info = requireProject();
  const initial = preview.getStatus();
  if (initial.state === 'stopped' || initial.state === 'error') preview.start(info);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = preview.getStatus();
    if (status.state === 'running') return status.url;
    if (status.state === 'error') throw new Error(`The preview could not start: ${status.error}`);
    if (Date.now() > deadline) throw new Error('The preview is taking too long to start.');
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function capturePreview(width: number, fullPage: boolean, pagePath = '/'): Promise<Buffer> {
  const base = await waitForPreview(90_000);
  const url = pagePath === '/' ? base : base.replace(/\/+$/, '') + pagePath;
  const shot = new BrowserWindow({
    show: false,
    width,
    height: 900,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  shot.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  shot.webContents.setAudioMuted(true);
  try {
    await shot.loadURL(url);
    const dbg = shot.webContents.debugger;
    dbg.attach('1.3');
    const metrics = (height: number) => dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
    await metrics(900);
    await shot.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 500)))');
    let height = 900;
    if (fullPage) {
      const measured = Number(
        await shot.webContents.executeJavaScript('Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0))'),
      );
      height = Math.min(8000, Math.max(300, measured || 900));
      await metrics(height);
      await new Promise((r) => setTimeout(r, 250));
    }
    const { data } = (await dbg.sendCommand('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 82,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    })) as { data: string };
    return Buffer.from(data, 'base64');
  } finally {
    shot.destroy();
  }
}

/** Tool context; with a turn, every change is stamped so the editor groups the turn into one undo step. */
const createToolContext = (turn?: { id: string; label: string }): McpContext => ({
  project: () => project,
  pages: () => (project ? pagesState(project) : null),
  referenceImage: (rel) => referenceImage(requireProject(), rel),
  edit: (command, label) => {
    const result = applyEdit(requireProject(), command);
    if (result.ok) recordForUndo({ label: turn?.label ?? label, changes: result.changes, selectId: result.selectId, turnId: turn?.id });
    return result;
  },
  inspect: (id) => inspectElement(requireProject(), id),
  writeFile: (rel, content, label) => {
    const abs = safeResolve(requireProject().root, rel);
    const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
    const change: FileChange = { path: rel, before, after: content };
    if (before !== content) recordForUndo({ label: turn?.label ?? label, changes: [change], turnId: turn?.id });
    return change;
  },
  importFiles: (sources, dir) => {
    const result = importFiles(requireProject().root, sources, dir);
    if (result.undoable) recordForUndo({ label: turn?.label ?? 'Import files (agent)', changes: result.changes, turnId: turn?.id });
    return result;
  },
  screenshot: capturePreview,
  renderer: rendererRequest,
  git: {
    status: () => gitStatus(requireProject().root),
    init: () => gitInit(requireProject().root),
    commit: (message) => gitCommit(requireProject().root, message),
    setRemote: (url) => gitSetRemote(requireProject().root, url),
    createRepo: (name, isPrivate) => createGithubRepo(requireProject().root, name, isPrivate, (url, init) => net.fetch(url, init)),
    push: () => gitPush(requireProject().root),
    goLive: () => goLiveOnVercel(requireProject().root, (url, init) => net.fetch(url, init)),
  },
  variants: {
    propose: (args) => {
      const record = proposeVariant(requireProject(), args);
      pushVariantsChanged();
      return record;
    },
    list: () => listVariants(requireProject().root),
    apply: (id) => {
      const { result, record } = applyVariant(requireProject(), id);
      if (result.ok) {
        recordForUndo({ label: `Apply variant: ${record.label || 'Variant'}`, changes: result.changes, selectId: result.selectId, turnId: turn?.id });
      }
      pushVariantsChanged();
      return { ok: result.ok, error: result.error, selectId: result.selectId };
    },
  },
});

function variantFocusedContext(elementId: string): string {
  const info = requireProject();
  const state = pagesState(info);
  const parsed = parseSourceId(elementId);
  if (!parsed) throw new ProjectError(`Invalid element reference: ${elementId}`);
  const abs = safeResolve(info.root, parsed.file);
  const code = fs.readFileSync(abs, 'utf8');
  const { element } = locateElement(code, parsed.file, parsed.line, parsed.column);
  const jsx = code.slice(element.start, element.end);
  const inspected = inspectElement(info, elementId);
  const styles = 'error' in inspected ? {} : inspected.styles.base;
  const direction = buildDesignContext(state.config.direction, { projectName: info.name, pages: state.pages });
  const refs = state.config.direction.references
    .map((r) => `- ${r.title}${r.colors.length ? ` · colours: ${r.colors.join(', ')}` : ''}${r.tags.length ? ` · tags: ${r.tags.join(', ')}` : ''}`)
    .join('\n');
  return [
    '# Focused element',
    `Id: ${elementId}`,
    `File: ${parsed.file}`,
    'error' in inspected ? '' : `Tag: <${inspected.tag}> Name: ${inspected.name ?? '(none)'}`,
    '',
    '## JSX',
    '```jsx',
    jsx,
    '```',
    '',
    '## Computed / stored styles (base)',
    JSON.stringify(styles, null, 2),
    '',
    direction,
    refs ? `\n# References\n${refs}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

let activeVariantSetId: string | null = null;

function startVariantGeneration(req: VariantGenerateRequest, singleId?: string): { setId: string; turnId: string; variants: VariantRecord[] } {
  const reason = aiNotReadyReason(aiSettings, secretStore.has(aiKeyName(aiSettings.provider)));
  if (reason) throw new Error(reason);
  const info = requireProject();
  const request = String(req.request ?? '').trim();
  if (!request) throw new ProjectError('Describe the variants you want.');
  const elementId = String(req.elementId ?? '').trim();
  if (!elementId) throw new ProjectError('Select an element first.');

  let setId: string;
  let variants: VariantRecord[];
  if (singleId) {
    const reset = resetVariantForRetry(info.root, singleId);
    if (!reset) throw new ProjectError('That variant cannot be retried.');
    setId = reset.setId;
    variants = [reset];
    pushVariantsChanged();
  } else {
    const begun = beginVariantSet(info, { elementId, request, count: clampVariantCount(req.count) });
    setId = begun.setId;
    variants = begun.variants;
    pushVariantsChanged();
  }

  activeVariantSetId = setId;
  const count = variants.length;
  const tools = createVariantTools(createToolContext({ id: randomUUID(), label: `Variants: ${request.slice(0, 40)}` }));
  const bound = tools.map((t) =>
    t.name === 'propose_variant'
      ? {
          ...t,
          run: async (args: Record<string, unknown>) => {
            try {
              const record = proposeVariant(info, {
                setId,
                label: String(args.label ?? ''),
                notes: typeof args.notes === 'string' ? args.notes : '',
                jsx: String(args.jsx ?? ''),
              });
              pushVariantsChanged();
              return [{ type: 'text' as const, text: `Variant ready: ${record.label} (${record.id})\nStatus: ${record.status}` }];
            } catch (err) {
              const generating = readVariantIndex(info.root).variants.find((v) => v.setId === setId && v.status === 'generating');
              if (generating) {
                markVariantFailed(info.root, generating.id, (err as Error).message);
                pushVariantsChanged();
              }
              throw err;
            }
          },
        }
      : t,
  );

  const turnId = agent.sendVariants(request, {
    tools: bound,
    focusedContext: variantFocusedContext(elementId),
    count,
    ctx: { selection: { id: elementId, name: variants[0]?.source.label ?? 'Element', tag: '?' }, page: null, frameWidth: null },
  });

  return { setId, turnId, variants };
}

const mcpContext = createToolContext();

/* ---------- In-app AI ---------- */

const aiSettingsFile = () => path.join(app.getPath('userData'), 'ai-settings.json');
let secretStore: SecretStore;
let aiSettings: AiSettings;
let agent: AiAgent;

const safeCipher: Cipher = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (data) => safeStorage.decryptString(data),
};

function voiceKeyFlags() {
  return {
    openai: secretStore.has(aiKeyName('openai')),
    xai: secretStore.has(aiKeyName('xai')),
  };
}

function voiceProviderKey(provider: 'openai' | 'xai') {
  return secretStore.get(aiKeyName(provider));
}

function aiStatus(): AiStatus {
  const hasKey = secretStore.has(aiKeyName(aiSettings.provider));
  const reason = aiNotReadyReason(aiSettings, hasKey);
  return {
    settings: aiSettings,
    hasKey,
    voiceKeys: voiceKeyFlags(),
    ready: !reason,
    reason,
    keyStorage: secretStore.available() ? 'encrypted' : 'unavailable',
    busy: agent.busy,
  };
}

const aiKey = () => secretStore.get(aiKeyName(aiSettings.provider));
const scrub = (err: unknown) => new Error(redact((err as Error)?.message ?? String(err), secretStore.secrets()));
const rethrowScrubbed = (err: unknown): never => {
  throw scrub(err);
};

function projectContextForAi(): string {
  if (!project) return 'No project is open right now. Chat normally; only suggest opening or creating a project if they need canvas or file edits.';
  const state = pagesState(project);
  const ds = designSystemStatus(project);
  return [
    `# Open project: ${project.name}`,
    `Framework: ${project.framework}. Styles file: ${project.stylesFile}. ${project.editable ? '' : 'The project is read-only in OpenCanvas.'}`,
    `Pages (${state.routing}): ${state.pages.map((p) => `${p.name} ${p.path}${p.file ? ` → ${p.file}` : ''}`).join('; ')}`,
    '',
    buildDesignContext(state.config.direction, { projectName: project.name, pages: state.pages }),
    '',
    // Short pointer only — full token dump makes the model stiff; tools return detail on demand.
    ds.document.tokens.length
      ? `Design system: ${ds.document.tokens.length} tokens, theme “${ds.document.activeThemeId}”, ${ds.document.components.length} components (use get_design_system / propose_token_change).`
      : 'Design system: empty — import tokens or create them from the Design system dock.',
    '',
    MCP_INSTRUCTIONS,
  ].join('\n');
}

function initAi() {
  secretStore = new SecretStore(path.join(app.getPath('userData'), 'secrets.json'), safeCipher);
  aiSettings = readAiSettings(aiSettingsFile());
  agent = new AiAgent({
    fetcher: (url, init) => net.fetch(url, init),
    settings: () => aiSettings,
    key: aiKey,
    secrets: () => secretStore.secrets(),
    tools: (turnId, request) => createMcpTools(createToolContext({ id: turnId, label: `AI: ${request.length > 40 ? `${request.slice(0, 40)}…` : request}` })),
    projectContext: projectContextForAi,
    emit: (event) => {
      const tagged = project ? { ...event, projectRoot: project.root } : event;
      win?.webContents.send('ai:event', tagged);
      if ((event.type === 'done' || event.type === 'error') && activeVariantSetId && project) {
        const setId = activeVariantSetId;
        activeVariantSetId = null;
        finishGeneratingSet(project.root, setId);
        pushVariantsChanged();
      }
    },
    commandCwd: () => requireProject().root,
    runCommand: ptyUnavailable
      ? undefined
      : (command, { longRunning, signal }) =>
          terminals.runCommand({
            cwd: requireProject().root,
            command,
            signal,
            longRunning,
            timeoutMs: 120_000,
            onCreated: (session) => win?.webContents.send('terminal:created', session),
          }),
  });
  const savee = secretStore.available()
    ? new SaveeClient({ fetcher: (url, init) => net.fetch(url, init), store: secretStore, openExternal: (url) => shell.openExternal(url), mcpUrl: process.env.OC_SAVEE_MCP_URL })
    : null;
  setProviders([saveeProvider(savee)]);
}

const IMAGE_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' };

/** Saves a provider image to a temp file so it can go through the same path as an uploaded reference. */
async function inspirationImage(provider: string, url: string) {
  const { data, mimeType } = await providerImage(provider, url);
  const dir = path.join(app.getPath('temp'), 'opencanvas-references');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${provider}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${IMAGE_EXT[mimeType] ?? 'png'}`;
  const file = path.join(dir, name);
  fs.writeFileSync(file, data);
  return { file, name, dataUrl: `data:${mimeType};base64,${Buffer.from(data).toString('base64')}` };
}

async function startMcp() {
  await stopMcp();
  mcpError = null;
  const server = new McpServer({
    name: 'opencanvas',
    version: app.getVersion(),
    instructions: MCP_INSTRUCTIONS,
    tools: createMcpTools(mcpContext),
    token: () => mcpSettings.token,
    onCall: (tool) => {
      mcpCalls++;
      mcpLast = { tool, at: Date.now() };
      pushMcpStatus();
    },
  });
  try {
    await server.listen(mcpSettings.port);
    mcpServer = server;
  } catch (err) {
    mcpError = (err as Error).message;
  }
  pushMcpStatus();
}

async function stopMcp() {
  const server = mcpServer;
  mcpServer = null;
  await server?.close();
}

async function updateMcp(patch: Partial<McpSettings>) {
  mcpSettings = { ...mcpSettings, ...patch };
  writeMcpSettings(mcpSettingsFile(), mcpSettings);
  if (mcpSettings.enabled) await startMcp();
  else {
    await stopMcp();
    mcpError = null;
    pushMcpStatus();
  }
  return mcpStatus();
}

function initMcp() {
  mcpSettings = readMcpSettings(mcpSettingsFile());
  if (process.env.OC_MCP_PORT) mcpSettings.port = Number(process.env.OC_MCP_PORT);
  if (process.env.OC_MCP_TOKEN) mcpSettings.token = process.env.OC_MCP_TOKEN;
  if (process.env.OC_MCP_ENABLE === '1') mcpSettings.enabled = true;
  if (!fs.existsSync(mcpSettingsFile())) writeMcpSettings(mcpSettingsFile(), mcpSettings);
  if (mcpSettings.enabled) void startMcp();
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
  handle('projects:recent', () =>
    readRecent().map((p) => ({ ...p, icon: projectFavicon(p.root), bytes: projectBytes(p.root) })),
  );
  handle('projects:defaultLocation', () => projectsDir());
  // Browsing is limited to projects in the recent list, never outside the project folder, and never into build or dependency folders.
  const projectPath = (root: string, rel: string) => {
    if (!readRecent().some((p) => p.root === root)) throw new Error('That project is not in your recent list.');
    const base = path.resolve(root);
    const target = path.resolve(base, String(rel ?? ''));
    if (target !== base && !target.startsWith(base + path.sep)) throw new Error('That path is outside the project.');
    return target;
  };
  const HIDDEN = new Set(['node_modules', '.git', 'dist', 'dist-electron', '.next', '.DS_Store']);
  handle('projectFiles:list', (root: string, rel: string) =>
    fs
      .readdirSync(projectPath(root, rel), { withFileTypes: true })
      .filter((e) => !HIDDEN.has(e.name))
      .map((e) => ({ name: e.name, dir: e.isDirectory() }))
      .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
      .slice(0, 300),
  );
  handle('projectFiles:read', (root: string, rel: string) => {
    const file = projectPath(root, rel);
    const buf = fs.readFileSync(file);
    if (buf.subarray(0, 8000).includes(0)) throw new Error('This file is not text, so it can’t be shown here.');
    return buf.subarray(0, 200_000).toString('utf8');
  });
  handle('skills:list', () => listSkills(skillsDir()));
  handle('skills:read', (id: string) => readSkill(skillsDir(), String(id)));
  handle('skills:openFolder', async () => {
    const dir = ensureSkillsDir(skillsDir());
    await shell.openPath(dir);
    return dir;
  });

  handle('project:create', (template: TemplateId, name: string, setup?: ProjectSetup) => {
    if (!TEMPLATES.some((t) => t.id === template)) throw new ProjectError('Unknown template.');
    const title = name.trim() || 'Untitled project';
    const parent = projectsDir();
    fs.mkdirSync(parent, { recursive: true });
    const root = uniqueDir(parent, slugify(title));
    fs.mkdirSync(root);
    writeFiles(root, generateTemplate(template, path.basename(root), title, dependencyVersions()));
    const info = detectProject(root);
    if (setup?.direction) writeDirection(info, setup.direction, setup.uploads);
    return activate(info);
  });

  handle('project:openDialog', async () => {
    const result = await dialog.showOpenDialog(win!, { title: 'Open project folder', properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    return activate(detectProject(result.filePaths[0]));
  });

  handle('project:openFileDialog', async (): Promise<OpenedFile | null> => {
    const result = await dialog.showOpenDialog(win!, { title: 'Open a file from a project', properties: ['openFile'] });
    const file = result.filePaths[0];
    if (result.canceled || !file) return null;
    const info = activate(detectProject(findProjectRoot(file)));
    return { project: info, file: path.relative(info.root, file).split(path.sep).join('/') };
  });
  handle('project:cloneGithub', async (repo: string) => {
    const parent = projectsDir();
    const root = await gitClone(parent, repo, (name) => uniqueDir(parent, slugify(name)));
    return activate(detectProject(root));
  });
  handle('project:importZip', async (): Promise<ImportedProject | null> => {
    const result = await dialog.showOpenDialog(win!, { title: 'Import a project ZIP', properties: ['openFile'], filters: [{ name: 'ZIP archives', extensions: ['zip'] }] });
    const file = result.filePaths[0];
    if (result.canceled || !file) return null;
    if (fs.statSync(file).size > ZIP_LIMITS.maxBytes) throw new ProjectError('That ZIP is larger than 500 MB. Remove node_modules or build output and try again.');
    const parent = projectsDir();
    fs.mkdirSync(parent, { recursive: true });
    const unpacked = await extractZip(fs.readFileSync(file), (name) => uniqueDir(parent, slugify(name)), path.basename(file, path.extname(file)));
    let info: ProjectInfo;
    try {
      info = detectProject(unpacked.root);
    } catch (err) {
      fs.rmSync(unpacked.root, { recursive: true, force: true });
      throw err;
    }
    return { project: activate(info), summary: projectSummary(info), fileCount: unpacked.fileCount, skipped: unpacked.skipped };
  });

  handle('project:open', (root: string) => activate(detectProject(root)));
  handle('project:refresh', () => {
    const info = detectProject(requireProject().root);
    project = info;
    return info;
  });
  handle('project:close', () => {
    agent.reset();
    buildCheck?.abort();
    terminals.killAll();
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
  handle('files:import', (sources: string[], dir: string) => importFiles(requireProject().root, sources, dir));
  handle('files:importDialog', async (dir: string, imagesOnly: boolean) => {
    const result = await dialog.showOpenDialog(win!, {
      title: imagesOnly ? 'Choose an image' : 'Import files',
      properties: imagesOnly ? ['openFile'] : ['openFile', 'multiSelections'],
      filters: imagesOnly ? [{ name: 'Images', extensions: IMAGE_EXTENSIONS }] : [{ name: 'Images', extensions: IMAGE_EXTENSIONS }, { name: 'All files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return importFiles(requireProject().root, result.filePaths, dir);
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
  handle('fonts:google', () => googleFonts(app.getPath('userData'), (url, init) => net.fetch(url, init)));
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
    const report = validateExport(info);
    const zip = await buildProjectZip(info, report.envExample ? { '.env.example': report.envExample } : {});
    fs.writeFileSync(save.filePath, zip.buffer);
    return { ok: true, path: save.filePath, fileCount: zip.files.length, instructions: runInstructions(info, report.envVars), envExampleAdded: !!report.envExample };
  });
  handle('export:validate', () => validateExport(requireProject()));
  handle('export:checkBuild', async () => {
    buildCheck?.abort();
    const controller = new AbortController();
    buildCheck = controller;
    try {
      return await runBuildCheck(requireProject(), { signal: controller.signal, onLog: (text) => win?.webContents.send('export:checkLog', text) });
    } finally {
      if (buildCheck === controller) buildCheck = null;
    }
  });
  handle('export:cancelCheck', () => buildCheck?.abort());
  handle('export:reveal', (file: string) => shell.showItemInFolder(file));
  handle('export:revealProject', () => shell.openPath(requireProject().root));

  handle('git:status', () => gitStatus(requireProject().root));
  handle('git:init', () => gitInit(requireProject().root));
  handle('git:setIdentity', (name: string, email: string) => gitSetIdentity(requireProject().root, name, email));
  handle('git:setRemote', (url: string) => gitSetRemote(requireProject().root, url));
  handle('git:createRepo', (name: string, isPrivate: boolean) => createGithubRepo(requireProject().root, name, isPrivate, (url, init) => net.fetch(url, init)));
  handle('git:commit', (message: string) => gitCommit(requireProject().root, message));
  handle('git:push', () => gitPush(requireProject().root));
  handle('git:pull', () => gitPull(requireProject().root));
  handle('publish:vercel', () => goLiveOnVercel(requireProject().root, (url, init) => net.fetch(url, init)));
  handle('publish:open', async (url: string) => {
    if (typeof url !== 'string' || !/^https:\/\/[\w.-]+(\/|$)/.test(url)) throw new Error('Only https links can be opened.');
    await shell.openExternal(url);
  });
  handle('git:openRemote', async () => {
    const { remote } = await gitStatus(requireProject().root);
    const url = remote && remoteWebUrl(remote);
    if (url) await shell.openExternal(url);
  });

  handle('mcp:status', () => mcpStatus());
  handle('mcp:setEnabled', (enabled: boolean) => updateMcp({ enabled: enabled === true }));
  handle('mcp:setPort', (port: number) => {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a port between 1024 and 65535.');
    return updateMcp({ port });
  });
  handle('mcp:regenerateToken', () => updateMcp({ token: newToken() }));
  handle('mcp:installCursor', async () => {
    const { url, token } = mcpStatus();
    const config = Buffer.from(JSON.stringify({ url, headers: { Authorization: `Bearer ${token}` } })).toString('base64');
    await shell.openExternal(`cursor://anysphere.cursor-deeplink/mcp/install?name=opencanvas&config=${encodeURIComponent(config)}`);
  });
  handle('mcp:reply', (id: number, reply: { ok: boolean; value?: unknown; error?: string }) => {
    const pending = rendererRequests.get(id);
    if (!pending) return;
    rendererRequests.delete(id);
    clearTimeout(pending.timer);
    if (reply?.ok) pending.resolve(reply.value);
    else pending.reject(new Error(reply?.error ?? 'The request failed.'));
  });

  handle('config:get', () => pagesState(requireProject()));
  handle('config:setDirection', (direction: DirectionConfig, uploads?: Record<string, string>) => writeDirection(requireProject(), direction, uploads));
  handle('workspace:get', (fallbackPageId?: string | null) => readWorkspace(requireProject().root, fallbackPageId ?? null));
  handle('workspace:set', (workspace: import('../shared/workspace-layout').WorkspaceState) => {
    writeWorkspace(requireProject().root, workspace);
  });
  handle('pages:create', (name: string, viewType?: string) =>
    viewType && viewType !== 'design'
      ? createWorkspacePage(requireProject(), String(name ?? ''), viewType as import('../shared/project-config').PageViewType)
      : createPage(requireProject(), String(name ?? '')),
  );
  handle('pages:duplicate', (id: string) => duplicatePage(requireProject(), id));
  handle('pages:rename', (id: string, name: string) => renamePage(requireProject(), id, String(name ?? '')));
  handle('pages:reorder', (ids: string[]) => reorderPages(requireProject(), Array.isArray(ids) ? ids : []));
  handle('pages:remove', (id: string) => deletePage(requireProject(), id));
  handle('direction:pickImage', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose a reference image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'] }],
    });
    const file = result.filePaths[0];
    if (result.canceled || !file) return null;
    return { file, name: path.basename(file), dataUrl: imageDataUrl(file) };
  });
  handle('direction:image', (rel: string) => referenceImage(requireProject(), rel));
  handle('direction:importDesignSystem', async (): Promise<DesignSystemConfig | null> => {
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import a design system',
      properties: ['openFile'],
      filters: [{ name: 'Design tokens', extensions: ['css', 'json'] }],
    });
    const file = result.filePaths[0];
    if (result.canceled || !file) return null;
    if (fs.statSync(file).size > 2_000_000) throw new Error('That file is larger than 2 MB. Choose the tokens file itself.');
    const content = fs.readFileSync(file, 'utf8');
    const isJson = file.toLowerCase().endsWith('.json');
    try {
      const flat: DesignSystemConfig = {
        file: path.basename(file),
        format: isJson ? 'tokens-json' : 'css',
        tokens: isJson ? parseJsonTokens(content) : parseCssTokens(content),
        importedAt: Date.now(),
      };
      if (project) {
        try {
          hydrateFromDirection(project, flat);
        } catch {
          /* direction still receives the flat snapshot for AI context */
        }
      }
      return flat;
    } catch (err) {
      if (err instanceof TokenImportError) throw new Error(err.message);
      throw err;
    }
  });
  handle('designSystem:get', () => {
    const info = requireProject();
    const status = designSystemStatus(info);
    return { document: status.document, issues: status.issues, cssFile: status.cssFile };
  });
  handle('designSystem:setActiveTheme', (themeId: string) => setActiveTheme(requireProject(), String(themeId)));
  handle('designSystem:upsertToken', (token: Token, summary?: string) => updateToken(requireProject(), token, summary));
  handle('designSystem:impact', (tokenId: string) => tokenImpact(requireProject(), String(tokenId)));
  handle('designSystem:historyRestore', (changeId: string) => restoreDesignSystem(requireProject(), String(changeId)));
  handle('designSystem:export', (format: 'css' | 'tokens-json') => exportDesignSystem(requireProject(), format === 'tokens-json' ? 'tokens-json' : 'css'));
  handle('designSystem:syncCss', () => syncDesignTokensCss(requireProject()));
  handle('inspiration:providers', () => listProviders());
  handle('inspiration:search', (provider: string, query: string) => searchProvider(String(provider), String(query ?? '')).catch(rethrowScrubbed));
  handle('inspiration:connect', (provider: string) => connectProvider(String(provider)).catch(rethrowScrubbed));
  handle('inspiration:disconnect', (provider: string) => disconnectProvider(String(provider)));
  handle('inspiration:boards', (provider: string) => providerBoards(String(provider)).catch(rethrowScrubbed));
  handle('inspiration:boardItems', (provider: string, boardId: string) => providerBoardItems(String(provider), String(boardId ?? '')).catch(rethrowScrubbed));
  handle('inspiration:image', (provider: string, url: string) => inspirationImage(String(provider), String(url ?? '')).catch(rethrowScrubbed));

  handle('ai:status', () => aiStatus());
  handle('ai:setSettings', (raw: AiSettings) => {
    const provider = normalizeAiSettings(raw).provider;
    const baseUrl = typeof raw?.baseUrl === 'string' && raw.baseUrl.trim() ? validateBaseUrl(raw.baseUrl) : providerMeta(provider).defaultBaseUrl;
    aiSettings = { ...normalizeAiSettings({ ...raw, baseUrl }), baseUrl };
    writeAiSettings(aiSettingsFile(), aiSettings);
    return aiStatus();
  });
  handle('ai:setKey', (key: string) => {
    const value = typeof key === 'string' ? key.trim() : '';
    if (!value) throw new Error('Paste a key first.');
    if (value.length > 500 || /\s/.test(value)) throw new Error('That doesn’t look like an API key.');
    secretStore.set(aiKeyName(aiSettings.provider), value);
    return aiStatus();
  });
  handle('ai:clearKey', () => {
    secretStore.delete(aiKeyName(aiSettings.provider));
    return aiStatus();
  });
  handle('ai:listModels', async () => {
    try {
      return await listModels(aiSettings, aiKey(), (url, init) => net.fetch(url, init));
    } catch (err) {
      throw scrub(err);
    }
  });
  handle('ai:test', async () => {
    const reason = aiNotReadyReason(aiSettings, secretStore.has(aiKeyName(aiSettings.provider)));
    if (reason) throw new Error(reason);
    try {
      return await testConnection(aiSettings, aiKey(), (url, init) => net.fetch(url, init));
    } catch (err) {
      throw scrub(err);
    }
  });
  handle('ai:send', (request: string, context?: AiTurnContext) => {
    const reason = aiNotReadyReason(aiSettings, secretStore.has(aiKeyName(aiSettings.provider)));
    if (reason) throw new Error(reason);
    // Home chat may send before a project exists; tools that need a project refuse at call time.
    return agent.send(String(request ?? ''), context && typeof context === 'object' ? context : undefined);
  });
  handle('ai:answer', (id: string, answer: string) => agent.answer(String(id), String(answer ?? '')));
  handle('ai:approve', (id: string, allow: boolean) => agent.approve(String(id), allow === true));
  handle('ai:cancel', () => agent.cancel());
  handle('ai:reset', () => agent.reset());
  handle('ai:voiceCapabilities', () => voiceCapabilities(aiSettings, voiceKeyFlags()));
  handle('ai:voiceReply', async (messages: VoiceChatMessage[]) => {
    const reason = aiNotReadyReason(aiSettings, secretStore.has(aiKeyName(aiSettings.provider)));
    if (reason) throw new Error(reason);
    try {
      return await voiceReply(Array.isArray(messages) ? messages : [], aiSettings, aiKey(), (url, init) => net.fetch(url, init));
    } catch (err) {
      throw scrub(err);
    }
  });
  handle('ai:voiceSpeak', async (text: string) => {
    try {
      return await voiceSpeak(String(text ?? ''), aiSettings, voiceKeyFlags(), voiceProviderKey, (url, init) => net.fetch(url, init));
    } catch (err) {
      throw scrub(err);
    }
  });
  handle('ai:voiceTranscribe', async (audioBase64: string, mime: string) => {
    try {
      return await voiceTranscribe(
        String(audioBase64 ?? ''),
        String(mime ?? 'audio/webm'),
        aiSettings,
        voiceKeyFlags(),
        voiceProviderKey,
        (url, init) => net.fetch(url, init),
      );
    } catch (err) {
      throw scrub(err);
    }
  });

  handle('variants:generate', (raw: VariantGenerateRequest) => {
    const req = raw && typeof raw === 'object' ? raw : ({} as VariantGenerateRequest);
    return startVariantGeneration({
      elementId: String(req.elementId ?? ''),
      request: String(req.request ?? ''),
      count: req.count,
    });
  });
  handle('variants:cancel', () => {
    agent.cancel();
    if (activeVariantSetId && project) {
      finishGeneratingSet(project.root, activeVariantSetId);
      activeVariantSetId = null;
      pushVariantsChanged();
    }
  });
  handle('variants:list', () => (project ? listVariants(project.root) : []));
  handle('variants:apply', (id: string) => {
    const info = requireProject();
    const { result, record } = applyVariant(info, String(id));
    if (result.ok && result.changes.length) {
      recordForUndo({ label: `Apply variant: ${record.label || 'Variant'}`, changes: result.changes, selectId: result.selectId });
    }
    pushVariantsChanged();
    return { ok: result.ok, error: result.error, selectId: result.selectId };
  });
  handle('variants:discard', (id: string) => {
    discardVariant(requireProject().root, String(id));
    pushVariantsChanged();
  });
  handle('variants:discardSet', (setId: string) => {
    if (activeVariantSetId === setId) {
      agent.cancel();
      activeVariantSetId = null;
    }
    discardVariantSet(requireProject().root, String(setId));
    pushVariantsChanged();
  });
  handle('variants:retry', (id: string) => {
    const info = requireProject();
    const index = readVariantIndex(info.root);
    const existing = index.variants.find((v) => v.id === String(id));
    if (!existing) throw new ProjectError('That variant no longer exists.');
    return startVariantGeneration({ elementId: existing.source.elementId, request: existing.request, count: 1 }, existing.id);
  });

  handle('terminal:unavailable', () => ptyUnavailable);
  handle('terminal:create', (opts?: { cols?: number; rows?: number; title?: string }) => {
    if (ptyUnavailable) throw new Error(ptyUnavailable);
    const o = opts && typeof opts === 'object' ? opts : {};
    return terminals.create({ cwd: requireProject().root, cols: Number(o.cols) || undefined, rows: Number(o.rows) || undefined, title: typeof o.title === 'string' ? o.title : undefined });
  });
  handle('terminal:list', () => terminals.list());
  handle('terminal:scrollback', (id: string) => terminals.scrollback(String(id)));
  handle('terminal:write', (id: string, data: string) => terminals.write(String(id), String(data ?? '')));
  handle('terminal:resize', (id: string, cols: number, rows: number) => terminals.resize(String(id), cols, rows));
  handle('terminal:rename', (id: string, title: string) => terminals.rename(String(id), String(title ?? '')));
  handle('terminal:kill', (id: string) => terminals.kill(String(id)));

  handle('app:setUnsaved', (value: boolean) => {
    hasUnsavedChanges = value;
  });
  handle('app:setTheme', (preference: ThemePreference) => {
    if (preference !== 'system' && preference !== 'light' && preference !== 'dark') return;
    nativeTheme.themeSource = preference;
    win?.setBackgroundColor(windowBackground());
  });
}

const windowBackground = () => (nativeTheme.shouldUseDarkColors ? '#181818' : '#f5f5f6');

function createWindow() {
  const icon = appIconPath();
  win = new BrowserWindow({
    frame: true,
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    title: 'OpenCanvas',
    backgroundColor: windowBackground(),
    show: false,
    ...(icon ? { icon } : {}),
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
  if (process.platform === 'darwin' && icon && app.dock) app.dock.setIcon(icon);

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
  Menu.setApplicationMenu(null);
  initAi();
  registerIpc();
  createWindow();
  initMcp();
});

app.on('window-all-closed', () => {
  agent?.cancel();
  terminals.killAll();
  preview.stop();
  void stopMcp();
  app.quit();
});

app.on('before-quit', () => {
  buildCheck?.abort();
  terminals.killAll();
  preview.stop();
  void stopMcp();
});
