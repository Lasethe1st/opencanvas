import { defaultAiSettings, providerMeta, type AiEvent, type AiProviderKind, type AiSettings, type AiStatus } from '../../shared/ai';
import type { OpenCanvasApi } from '../../shared/api';
import type { InspirationProviderInfo, InspirationResult } from '../../shared/inspiration';
import {
  componentName,
  defaultProjectConfig,
  normalizeDirection,
  pageSlug,
  type DirectionConfig,
  type PageConfig,
  type PageMutation,
  type ProjectConfig,
  type ProjectPagesState,
} from '../../shared/project-config';
import type { FileNode, GitStatus, McpStatus, PreviewStatus, ProjectInfo, RecentProject, SourceElementInfo, TemplateMeta } from '../../shared/types';

/**
 * Stand-in for the Electron bridge when the renderer runs in a plain browser tab (npm run dev:browser),
 * so the UI can be inspected and styled with browser tools. Nothing touches disk; edits are refused.
 */

const ROOT = 'C:\\Users\\you\\Documents\\OpenCanvas Projects';
const UNAVAILABLE = 'Not available in the browser preview. Run OpenCanvas with npm start.';

const TEMPLATES: TemplateMeta[] = [
  { id: 'blank', name: 'Blank', description: 'An empty page with a minimal React + Vite setup.' },
  { id: 'landing', name: 'Landing page', description: 'Header, hero, feature grid and footer split into components.' },
  { id: 'portfolio', name: 'Portfolio', description: 'Personal intro, selected work and contact section.' },
  { id: 'dashboard', name: 'Dashboard', description: 'Sidebar navigation, stat cards and an activity table.' },
  { id: 'marketing', name: 'Marketing site', description: 'Product announcement with pricing tiers and FAQ.' },
];

const icon = (bg: string, letter: string) =>
  `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${bg}"/><text x="16" y="22" text-anchor="middle" font-family="Arial" font-weight="700" font-size="17" fill="#fff">${letter}</text></svg>`)}`;

const now = Date.now();
const RECENT: RecentProject[] = [
  { root: `${ROOT}\\ad-agency`, name: 'ad-agency', openedAt: now - 6 * 60_000, icon: icon('#ff4d2e', 'N') },
  { root: `${ROOT}\\fieldday-launch`, name: 'Field Day launch', openedAt: now - 3 * 3600_000, icon: icon('#111111', 'F') },
  { root: `${ROOT}\\portfolio-2026`, name: 'Portfolio 2026', openedAt: now - 2 * 86_400_000 },
  { root: `${ROOT}\\kin-dashboard`, name: 'Kin dashboard', openedAt: now - 5 * 86_400_000, icon: icon('#2f6b4f', 'K') },
];

const APP_JSX = `export default function App() {
  return (
    <main data-oc-name="Page">
      <section data-oc-name="Hero">
        <p>Independent creative agency</p>
        <h1>We make brands people can't scroll past.</h1>
        <p>Strategy, identity and campaigns for challenger brands.</p>
        <a href="#contact">Start a project</a>
      </section>
    </main>
  );
}
`;

/** The elements of APP_JSX, keyed by the data-oc-id the sample page (scripts/browser-preview.html) carries. */
const ELEMENTS: Record<string, { tag: string; name: string | null; text: string | null; attributes?: Record<string, string> }> = {
  'src/App.jsx:3:4': { tag: 'main', name: 'Page', text: null },
  'src/App.jsx:4:6': { tag: 'section', name: 'Hero', text: null },
  'src/App.jsx:5:8': { tag: 'p', name: null, text: 'Independent creative agency' },
  'src/App.jsx:6:8': { tag: 'h1', name: null, text: "We make brands people can't scroll past." },
  'src/App.jsx:7:8': { tag: 'p', name: null, text: 'Strategy, identity and campaigns for challenger brands.' },
  'src/App.jsx:8:8': { tag: 'a', name: null, text: 'Start a project', attributes: { href: '#contact' } },
};

function inspectElement(id: string): SourceElementInfo | { error: string } {
  const el = ELEMENTS[id];
  if (!el) return { error: UNAVAILABLE };
  const [file, line] = id.split(':');
  const empty = { base: {}, tablet: {}, mobile: {} };
  return {
    id,
    tag: el.tag,
    file,
    line: Number(line),
    name: el.name,
    key: null,
    text: el.text,
    textEditable: el.text !== null,
    textReason: el.text !== null ? 'plain' : 'nested',
    attributes: el.attributes ?? {},
    styles: empty,
    hover: { base: {}, tablet: {}, mobile: {} },
  };
}

const FILES: Record<string, string> = {
  'src/App.jsx': APP_JSX,
  'src/main.jsx': "import { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\nimport './index.css';\nimport './open-canvas.css';\n\ncreateRoot(document.getElementById('root')).render(<App />);\n",
  'src/index.css': 'body {\n  margin: 0;\n  font-family: Inter, system-ui, sans-serif;\n}\n',
  'src/open-canvas.css': '',
  'index.html': '<!doctype html>\n<html lang="en">\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n',
  'package.json': '{\n  "name": "ad-agency",\n  "private": true\n}\n',
};

function tree(): FileNode {
  const root: FileNode = { name: 'ad-agency', path: '', type: 'dir', children: [] };
  for (const file of Object.keys(FILES)) {
    const parts = file.split('/');
    let node = root;
    parts.forEach((name, i) => {
      const path = parts.slice(0, i + 1).join('/');
      const isFile = i === parts.length - 1;
      let child = node.children!.find((c) => c.name === name);
      if (!child) {
        child = { name, path, type: isFile ? 'file' : 'dir', ...(isFile ? {} : { children: [] }) };
        node.children!.push(child);
      }
      node = child;
    });
  }
  return root;
}

function demoProject(root = RECENT[0].root, name = 'ad-agency'): ProjectInfo {
  return {
    root,
    name,
    framework: 'vite-react',
    packageManager: 'npm',
    hasNodeModules: true,
    missingDependencies: [],
    managedPreview: true,
    entryFile: 'src/main.jsx',
    stylesFile: 'src/open-canvas.css',
    canPreview: true,
    editable: true,
    editableRoots: ['src'],
    warnings: [],
    breakpoints: { tablet: 1024, mobile: 640, detected: false },
  };
}

const GIT: GitStatus = {
  installed: true,
  repo: true,
  parentRepo: null,
  branch: 'main',
  remote: 'https://github.com/you/ad-agency.git',
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  files: [{ path: 'src/App.jsx', state: 'modified' }],
  lastCommit: { hash: '5178e8c', message: 'Ignore Vercel project link', when: '1 hour ago' },
  identity: { name: 'You', email: 'you@example.com' },
};

const MCP: McpStatus = { enabled: false, running: false, port: 7457, url: 'http://127.0.0.1:7457/mcp', token: 'browser-preview-token', error: null, calls: 0, lastTool: null, lastAt: null };

const unsubscribe = () => () => undefined;
const refuse = async (): Promise<never> => {
  throw new Error(UNAVAILABLE);
};
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** In-memory pages and direction, so the page navigator and direction UI can be exercised without disk access. */
function memoryConfig() {
  let config: ProjectConfig = defaultProjectConfig('src/App.jsx');
  const state = (): ProjectPagesState => ({ config, routing: config.pages.length > 1 ? 'managed' : 'single', pages: config.pages, canEditPages: true, pagesNote: null });
  const mutate = (fn: (pages: PageConfig[]) => PageConfig | null): PageMutation => {
    const pages = config.pages.map((p) => ({ ...p }));
    const page = fn(pages);
    config = { ...config, pages };
    return { state: state(), changes: [], page };
  };
  const unique = (pages: PageConfig[], base: string) => {
    let name = base;
    for (let n = 2; pages.some((p) => p.name.toLowerCase() === name.toLowerCase()); n++) name = `${base} ${n}`;
    let path = `/${pageSlug(name)}`;
    for (let n = 2; pages.some((p) => p.path === path); n++) path = `/${pageSlug(name)}-${n}`;
    return { name, path };
  };
  const find = (pages: PageConfig[], id: string) => {
    const page = pages.find((p) => p.id === id);
    if (!page) throw new Error('That page no longer exists.');
    return page;
  };
  return {
    reset: () => void (config = defaultProjectConfig('src/App.jsx')),
    setDirection: (direction: DirectionConfig) => {
      config = { ...config, direction: normalizeDirection(direction) };
      return state();
    },
    get: async () => state(),
    pages: {
      create: async (name: string) =>
        mutate((pages) => {
          const page = { id: `p${Date.now().toString(36)}`, ...unique(pages, name.trim() || 'New page'), file: `src/pages/${componentName(name || 'New page')}.jsx` };
          pages.push(page);
          return page;
        }),
      duplicate: async (id: string) =>
        mutate((pages) => {
          const source = find(pages, id);
          const page = { id: `p${Date.now().toString(36)}`, ...unique(pages, `${source.name} copy`), file: source.file };
          pages.splice(pages.indexOf(source) + 1, 0, page);
          return page;
        }),
      rename: async (id: string, name: string) =>
        mutate((pages) => {
          const page = find(pages, id);
          if (!name.trim()) throw new Error('Give the page a name.');
          page.name = name.trim();
          return page;
        }),
      reorder: async (ids: string[]) =>
        mutate((pages) => {
          const ordered = ids.map((id) => find(pages, id));
          pages.splice(0, pages.length, ...ordered);
          return null;
        }),
      remove: async (id: string) =>
        mutate((pages) => {
          const page = find(pages, id);
          if (page.path === '/') throw new Error('The home page can’t be deleted.');
          pages.splice(pages.indexOf(page), 1);
          return page;
        }),
    },
  };
}

/** Savee stand-in: "connecting" succeeds immediately and returns sample results, so the panels can be styled. */
function mockInspiration(): OpenCanvasApi['inspiration'] {
  let connected = false;
  const info = (): InspirationProviderInfo => ({
    id: 'savee',
    name: 'Savee',
    status: connected ? 'connected' : 'needs-auth',
    detail: connected
      ? 'Connected as @you (browser preview sample). Searches use your weekly Savee budget of 200.'
      : 'Sign in with Savee to search its library and your boards. Needs a Savee subscription with API access.',
    docsUrl: 'https://docs.savee.com/mcp/',
    workaround: null,
    canSearch: connected,
    canBrowseBoards: connected,
    canConnect: true,
    account: connected ? 'you' : null,
  });
  const sample = (q: string): InspirationResult[] =>
    [
      ['Swiss poster grid', ['#f24e1e', '#111111', '#f4f1ea']],
      ['Editorial serif spread', ['#1b1b1b', '#e9e4da', '#b08d57']],
      ['Soft gradient landing page', ['#8ec5fc', '#e0c3fc', '#ffffff']],
      ['Brutalist type specimen', ['#000000', '#ffffff', '#ff3b00']],
      ['Muted product photography', ['#d8cfc4', '#6b5e51', '#f7f3ee']],
      ['Bold geometric logo set', ['#2e5bff', '#ffd400', '#0b0b0b']],
    ].map(([title, colors], i) => ({
      id: `s${i}`,
      title: `${title as string}${q ? ` · ${q}` : ''}`,
      url: `https://savee.com/i/sample${i}/`,
      sourceUrl: null,
      imageUrl: null,
      width: 1200,
      height: 900,
      colors: colors as string[],
      tags: [],
    }));
  return {
    providers: async () => [info()],
    search: async (_provider, query) => {
      if (!connected) throw new Error('Savee isn’t connected, so it can’t search.');
      return sample(query.trim());
    },
    connect: async () => {
      await new Promise((r) => setTimeout(r, 600));
      connected = true;
      return info();
    },
    disconnect: async () => {
      connected = false;
      return info();
    },
    boards: async () => [
      { id: 'b1', name: 'Typography', count: 48 },
      { id: 'b2', name: 'Landing pages', count: 112 },
      { id: 'b3', name: 'Colour', count: 27 },
    ],
    boardItems: async () => sample(''),
    image: async () => {
      throw new Error('Savee images aren’t available in the browser preview.');
    },
  };
}

/** AI stand-in: plays a scripted turn (text, a tool call, a clarifying question) so the dock chat can be styled. */
function mockAi(): OpenCanvasApi['ai'] {
  let settings: AiSettings = defaultAiSettings();
  const keys = new Set<AiProviderKind>();
  let listeners: ((e: AiEvent) => void)[] = [];
  let pending: { id: string; turnId: string; resolve: (answer: string) => void } | null = null;
  let busy = false;
  let stop = false;
  const emit = (e: AiEvent) => listeners.forEach((l) => l(e));
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const status = (): AiStatus => {
    const meta = providerMeta(settings.provider);
    const hasKey = keys.has(settings.provider);
    const reason = meta.needsKey && !hasKey ? `Add your ${meta.label} API key.` : !settings.baseUrl ? 'Enter the server URL.' : !settings.model ? 'Choose a model.' : null;
    return { settings, hasKey, ready: !reason, reason, keyStorage: 'encrypted', busy };
  };
  const stream = async (turnId: string, text: string) => {
    for (const word of text.split(/(?<= )/)) {
      if (stop) return;
      emit({ turnId, type: 'text', delta: word });
      await wait(35);
    }
  };
  const ask = (turnId: string, question: AiEvent & { type: 'question' }) =>
    new Promise<string>((resolve) => {
      pending = { id: question.question.id, turnId, resolve };
      emit(question);
    });
  const run = async (turnId: string, request: string) => {
    busy = true;
    stop = false;
    emit({ turnId, type: 'start', request });
    try {
      await stream(turnId, 'Sure. I’ll start by looking at the page and your direction. ');
      emit({ turnId, type: 'tool-start', callId: 'c1', tool: 'get_outline', summary: 'Reading the page structure' });
      await wait(500);
      emit({ turnId, type: 'tool-end', callId: 'c1', ok: true, summary: 'Read the page structure' });
      if (stop) return;
      const answer = await ask(turnId, {
        turnId,
        type: 'question',
        question: { id: 'q1', question: 'How many pricing plans should the section show?', options: ['Two plans', 'Three plans', 'Four plans'], allowText: true },
      });
      emit({ turnId, type: 'resolved', id: 'q1', answer });
      await stream(turnId, `Got it: ${answer.toLowerCase()}. This is the browser preview, so nothing is written to disk. `);
      emit({ turnId, type: 'tool-start', callId: 'c2', tool: 'insert_jsx', summary: 'Inserting a pricing section' });
      await wait(700);
      emit({ turnId, type: 'tool-end', callId: 'c2', ok: false, summary: 'Edits aren’t available in the browser preview' });
      await stream(turnId, 'Run OpenCanvas with npm start to let the AI edit the project.');
    } finally {
      busy = false;
      pending = null;
      emit({ turnId, type: 'done', stopped: stop });
    }
  };
  return {
    status: async () => status(),
    setSettings: async (next) => {
      settings = { ...next };
      return status();
    },
    setKey: async (key) => {
      if (!key.trim()) throw new Error('Paste a key first.');
      keys.add(settings.provider);
      return status();
    },
    clearKey: async () => {
      keys.delete(settings.provider);
      return status();
    },
    listModels: async () => [
      { id: 'sample-large', label: 'sample-large (browser preview)' },
      { id: 'sample-small', label: 'sample-small (browser preview)' },
    ],
    test: async () => {
      if (!status().ready) throw new Error(status().reason ?? 'Not ready.');
      return 'OK (browser preview sample)';
    },
    send: async (request) => {
      if (busy) throw new Error('The AI is still working on your last request.');
      const turnId = `t${Date.now().toString(36)}`;
      void run(turnId, request);
      return turnId;
    },
    answer: async (id, answer) => {
      if (pending?.id === id) pending.resolve(answer);
    },
    approve: async () => undefined,
    cancel: async () => {
      stop = true;
      if (pending) pending.resolve('Stopped');
    },
    reset: async () => undefined,
    onEvent: (cb) => {
      listeners.push(cb);
      return () => {
        listeners = listeners.filter((l) => l !== cb);
      };
    },
  };
}

export function createBrowserApi(): OpenCanvasApi {
  const memory = memoryConfig();
  let current: ProjectInfo | null = null;
  let previewListeners: ((status: PreviewStatus) => void)[] = [];
  const running: PreviewStatus = { state: 'running', url: new URL('/__browser-preview', location.href).href, log: '' };
  const open = async (root?: string, name?: string) => {
    if (current?.root !== root) memory.reset();
    return (current = demoProject(root, name));
  };

  return {
    templates: async () => TEMPLATES,
    recentProjects: async () => RECENT,
    defaultLocation: async () => ROOT,
    createProject: async (_template, name, setup) => {
      const project = await open(`${ROOT}\\${name.toLowerCase().replace(/\W+/g, '-')}`, name);
      if (setup) memory.setDirection(setup.direction);
      return project;
    },
    openProjectDialog: async () => open(),
    openProject: async (root) => open(root, RECENT.find((p) => p.root === root)?.name),
    openFileDialog: async () => ({ project: await open(), file: 'src/App.jsx' }),
    cloneGithub: async (repo) => {
      await wait(800);
      return open(`${ROOT}\\${repo.split('/').pop()}`, repo.split('/').pop());
    },
    importZip: async () => {
      await wait(600);
      const project = await open(`${ROOT}\\imported-site`, 'imported-site');
      return {
        project,
        fileCount: 42,
        skipped: 3,
        summary: { framework: 'React + Vite', packageManager: 'npm', router: 'React Router', tailwind: true, shadcn: true, scripts: ['dev', 'build', 'preview'], editing: 'Visual editing works on JSX in src/.' },
      };
    },
    refreshProject: async () => current ?? open(),
    closeProject: async () => {
      current = null;
    },
    fileTree: async () => tree(),
    readFile: async (rel) => FILES[rel] ?? '',
    writeFile: refuse,
    createFile: refuse,
    createFolder: refuse,
    deletePath: refuse,
    renamePath: refuse,
    importFiles: refuse,
    importDialog: async () => null,
    pathForFile: () => '',
    applyEdit: async () => ({ ok: false, error: UNAVAILABLE, changes: [] }),
    inspect: async (id) => inspectElement(id),
    revert: async () => ({ ok: false, error: UNAVAILABLE }),
    googleFonts: async () => ({ fonts: [], source: 'bundled' }),
    startPreview: async () => {
      for (const cb of previewListeners) cb(running);
    },
    stopPreview: async () => undefined,
    previewStatus: async () => (current ? running : { state: 'stopped' }),
    installDependencies: async () => ({ ok: true, project: current ?? (await open()) }),
    cancelInstall: async () => undefined,
    exportZip: async () => ({ ok: false, error: UNAVAILABLE }),
    validateExport: async () => ({
      issues: [
        { severity: 'warning', title: '/hero.jpg isn’t in public/', file: 'src/App.jsx:12', fix: 'Files under public/ are served from the site root. Add public/hero.jpg, or fix the path.' },
        { severity: 'info', title: 'A .env.example will be added', file: '.env.example', fix: 'The code reads VITE_FORM_ENDPOINT. The export lists the names only, with no values.' },
      ],
      envVars: ['VITE_FORM_ENDPOINT'],
      envExample: 'VITE_FORM_ENDPOINT=\n',
      checkedFiles: 6,
    }),
    checkBuild: async () => ({ state: 'unavailable', message: 'The build check runs in the OpenCanvas desktop app.', steps: [] }),
    cancelBuildCheck: async () => undefined,
    onCheckLog: () => () => undefined,
    revealFile: async () => undefined,
    revealProject: async () => undefined,
    git: {
      status: async () => GIT,
      init: async () => undefined,
      setIdentity: async () => undefined,
      setRemote: async (url) => url,
      createRepo: refuse,
      commit: async () => undefined,
      push: async () => wait(500),
      pull: async () => undefined,
      openRemote: async () => undefined,
    },
    publish: {
      vercel: async () => {
        await wait(1200);
        return { status: 'needs-vercel', importUrl: 'https://vercel.com/new', reason: 'no-account' };
      },
      open: async (url) => void window.open(url, '_blank', 'noopener'),
    },
    mcp: {
      status: async () => MCP,
      setEnabled: async (enabled) => ({ ...MCP, enabled, running: enabled }),
      setPort: async (port) => ({ ...MCP, port }),
      regenerateToken: async () => MCP,
      installCursor: async () => undefined,
      reply: async () => undefined,
      onStatus: unsubscribe,
      onApplied: unsubscribe,
      onRequest: unsubscribe,
    },
    projectConfig: {
      get: memory.get,
      setDirection: async (direction) => memory.setDirection(direction),
    },
    pages: memory.pages,
    direction: {
      pickImage: async () => null,
      image: refuse,
      importDesignSystem: refuse,
    },
    inspiration: mockInspiration(),
    ai: mockAi(),
    terminal: {
      unavailable: async () => 'The terminal runs in the OpenCanvas desktop app. It isn’t available in this browser preview.',
      create: refuse,
      list: async () => [],
      scrollback: async () => '',
      write: async () => undefined,
      resize: async () => undefined,
      rename: async () => null,
      kill: async () => undefined,
      onData: unsubscribe,
      onExit: unsubscribe,
      onCreated: unsubscribe,
    },
    setUnsaved: async () => undefined,
    setTheme: async () => undefined,
    onPreviewStatus: (cb) => {
      previewListeners.push(cb);
      return () => {
        previewListeners = previewListeners.filter((l) => l !== cb);
      };
    },
    onInstallLog: unsubscribe,
    onFilesChanged: unsubscribe,
  };
}
