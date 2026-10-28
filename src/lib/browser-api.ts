import { providerMeta, type AiEvent, type AiProviderKind, type AiSettings, type AiStatus } from '../../shared/ai';
import type { OpenCanvasApi } from '../../shared/api';
import type { VoiceChatMessage } from '../../shared/voice';
import type { VariantRecord } from '../../shared/variants';
import { VARIANT_COUNT, clampVariantCount } from '../../shared/variants';
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
import { normalizeWorkspace } from '../../shared/workspace-layout';

/**
 * Stand-in for the Electron bridge when the renderer runs in a plain browser tab (npm run dev:browser),
 * so the UI can be inspected and styled with browser tools. Nothing touches disk; edits are refused.
 */

const ROOT = 'C:\\Users\\you\\Documents\\OpenCanvas Projects';
const UNAVAILABLE = 'Not available in the browser preview. Run OpenCanvas with npm start.';

/** Sample skills for the browser harness; the desktop app reads real ones from the skills folder. */
const SKILLS = [
  { id: 'release-notes/SKILL.md', name: 'Release notes', description: 'Turn a list of changes into friendly release notes', body: 'Write short, friendly release notes grouped by feature, fix and improvement.' },
  { id: 'accessibility-pass.md', name: 'Accessibility pass', description: 'Check the page for keyboard, contrast and label problems', body: 'Review the page for keyboard access, colour contrast and missing labels, then list fixes.' },
];

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
  { root: `${ROOT}\\email-collect`, name: 'Email Collect', openedAt: now - 2 * 60_000, icon: icon('#1a1916', 'S'), bytes: 184_320 },
  { root: `${ROOT}\\ad-agency`, name: 'ad-agency', openedAt: now - 6 * 60_000, icon: icon('#ff4d2e', 'N'), bytes: 1_248_000 },
  { root: `${ROOT}\\fieldday-launch`, name: 'Field Day launch', openedAt: now - 3 * 3600_000, icon: icon('#111111', 'F'), bytes: 892_160 },
  { root: `${ROOT}\\portfolio-2026`, name: 'Portfolio 2026', openedAt: now - 2 * 86_400_000, bytes: 512_000 },
  { root: `${ROOT}\\kin-dashboard`, name: 'Kin dashboard', openedAt: now - 5 * 86_400_000, icon: icon('#2f6b4f', 'K'), bytes: 2_150_400 },
];

const APP_JSX = `export default function App() {
  return (
    <main className="page" data-oc-name="Home">
      <header className="site-header" data-oc-name="Header">
        <a className="logo" href="/" data-oc-name="Logo">
          Signal
        </a>
        <nav className="nav" data-oc-name="Nav">
          <a href="/" data-oc-name="Nav Home">
            Home
          </a>
          <a href="/contact" data-oc-name="Nav Contact">
            Contact
          </a>
        </nav>
      </header>
      <section className="hero" data-oc-name="Hero">
        <p className="eyebrow" data-oc-name="Eyebrow">
          Email list
        </p>
        <h1 data-oc-name="Heading">Stay in the loop</h1>
        <p className="lead" data-oc-name="Lead">
          Join for occasional notes — no spam, unsubscribe anytime.
        </p>
        <form className="signup" data-oc-name="Signup form" onSubmit={(e) => e.preventDefault()}>
          <label className="field" data-oc-name="Email field">
            <span className="field__label">Email</span>
            <input type="email" name="email" required placeholder="you@example.com" data-oc-name="Email input" />
          </label>
          <button type="submit" className="button" data-oc-name="Submit">
            Subscribe
          </button>
        </form>
      </section>
    </main>
  );
}
`;

const CONTACT_JSX = `export default function Contact() {
  return (
    <main className="page" data-oc-name="Contact">
      <header className="site-header" data-oc-name="Header">
        <a className="logo" href="/" data-oc-name="Logo">
          Signal
        </a>
        <nav className="nav" data-oc-name="Nav">
          <a href="/" data-oc-name="Nav Home">
            Home
          </a>
          <a href="/contact" data-oc-name="Nav Contact">
            Contact
          </a>
        </nav>
      </header>
      <section className="contact" data-oc-name="Contact section">
        <p className="eyebrow" data-oc-name="Eyebrow">
          Get in touch
        </p>
        <h1 data-oc-name="Heading">Contact</h1>
        <p className="lead" data-oc-name="Lead">
          Questions about the list, partnerships, or press — reach us here.
        </p>
        <ul className="details" data-oc-name="Details">
          <li data-oc-name="Email row">
            <span className="details__label">Email</span>
            <a href="mailto:hello@signal.example">hello@signal.example</a>
          </li>
          <li data-oc-name="Phone row">
            <span className="details__label">Phone</span>
            <a href="tel:+15550199">+1 (555) 0199</a>
          </li>
          <li data-oc-name="Address row">
            <span className="details__label">Studio</span>
            <span>184 Mercer Street, New York, NY 10012</span>
          </li>
          <li data-oc-name="Hours row">
            <span className="details__label">Hours</span>
            <span>Mon–Fri, 9am–6pm ET</span>
          </li>
        </ul>
      </section>
    </main>
  );
}
`;

const INDEX_CSS = `/* Email Collect — blank canvas site */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Libre+Baskerville:wght@400;700&display=swap');

:root {
  --font-body: 'Inter', system-ui, sans-serif;
  --font-heading: 'Libre Baskerville', 'Times New Roman', serif;
  --bg: #f7f4ef;
  --fg: #1a1916;
  --muted: #6b6560;
  --line: #e4ddd3;
  --surface: #ffffff;
  --accent: #1a1916;
  --accent-fg: #f7f4ef;
}

* { box-sizing: border-box; }
html, body, #root { min-height: 100%; }
body {
  margin: 0;
  font-family: var(--font-body);
  color: var(--fg);
  background: var(--bg);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 {
  font-family: var(--font-heading);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.page {
  min-height: 100vh;
  padding: 28px 32px 64px;
  max-width: 720px;
  margin: 0 auto;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 40px;
}

.logo {
  font-family: var(--font-heading);
  font-size: 1.15rem;
  color: var(--fg);
  text-decoration: none;
}

.nav { display: flex; gap: 18px; }
.nav a {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 500;
}
.nav a:hover { color: var(--fg); }

.eyebrow {
  margin: 0 0 12px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.hero h1,
.contact h1 {
  margin: 0 0 16px;
  font-size: clamp(2.4rem, 5vw, 3.4rem);
}

.lead {
  margin: 0 0 32px;
  font-size: 1.1rem;
  color: var(--muted);
  max-width: 36ch;
}

.signup {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
}

.field {
  display: grid;
  gap: 6px;
  flex: 1 1 220px;
}

.field__label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
}

.field input {
  height: 44px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  font: inherit;
  background: var(--bg);
  color: var(--fg);
}

.field input:focus {
  outline: 2px solid var(--fg);
  outline-offset: 1px;
}

.button {
  height: 44px;
  padding: 0 20px;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.button:hover { filter: brightness(1.08); }

.details {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 18px;
}

.details li {
  display: grid;
  gap: 4px;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}

.details__label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

.details a {
  color: var(--fg);
  text-decoration: underline;
  text-underline-offset: 3px;
}
`;

/** The elements of APP_JSX, keyed by the data-oc-id the sample page (scripts/browser-preview.html) carries. */
const ELEMENTS: Record<string, { tag: string; name: string | null; text: string | null; attributes?: Record<string, string> }> = {
  'src/App.jsx:3:4': { tag: 'main', name: 'Home', text: null },
  'src/App.jsx:4:6': { tag: 'header', name: 'Header', text: null },
  'src/App.jsx:5:8': { tag: 'a', name: 'Logo', text: 'Signal', attributes: { href: '/' } },
  'src/App.jsx:8:8': { tag: 'nav', name: 'Nav', text: null },
  'src/App.jsx:9:10': { tag: 'a', name: 'Nav Home', text: 'Home', attributes: { href: '/' } },
  'src/App.jsx:12:10': { tag: 'a', name: 'Nav Contact', text: 'Contact', attributes: { href: '/contact' } },
  'src/App.jsx:17:6': { tag: 'section', name: 'Hero', text: null },
  'src/App.jsx:18:8': { tag: 'p', name: 'Eyebrow', text: 'Email list' },
  'src/App.jsx:21:8': { tag: 'h1', name: 'Heading', text: 'Stay in the loop' },
  'src/App.jsx:22:8': { tag: 'p', name: 'Lead', text: 'Join for occasional notes — no spam, unsubscribe anytime.' },
  'src/App.jsx:25:8': { tag: 'form', name: 'Signup form', text: null },
  'src/App.jsx:26:10': { tag: 'label', name: 'Email field', text: null },
  'src/App.jsx:28:12': { tag: 'input', name: 'Email input', text: null, attributes: { type: 'email', name: 'email', placeholder: 'you@example.com' } },
  'src/App.jsx:30:10': { tag: 'button', name: 'Submit', text: 'Subscribe' },
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
  'src/pages/Contact.jsx': CONTACT_JSX,
  'src/routes.jsx': `// Managed by OpenCanvas: maps URL paths to pages. Plain React, no router dependency.
import Home from './App.jsx';
import Contact from './pages/Contact.jsx';

const ROUTES = {
  '/': Home,
  '/contact': Contact,
};

export default function Routes() {
  const path = window.location.pathname.replace(/\\/+$/, '') || '/';
  const Page = ROUTES[path] ?? Home;
  return <Page />;
}
`,
  'src/main.jsx': `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Routes from './routes.jsx';
import './index.css';
import './open-canvas.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Routes />
  </StrictMode>,
);
`,
  'src/index.css': INDEX_CSS,
  'src/open-canvas.css': '',
  'index.html': '<!doctype html>\n<html lang="en">\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n',
  'package.json': '{\n  "name": "email-collect",\n  "private": true\n}\n',
};

function tree(): FileNode {
  const root: FileNode = { name: 'email-collect', path: '', type: 'dir', children: [] };
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

function demoProject(root = RECENT[0].root, name = 'Email Collect'): ProjectInfo {
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
  remote: 'https://github.com/you/email-collect.git',
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  files: [{ path: 'src/App.jsx', state: 'modified' }, { path: 'src/pages/Contact.jsx', state: 'added' }],
  lastCommit: { hash: '5178e8c', message: 'Add email signup and contact pages', when: '1 hour ago' },
  identity: { name: 'You', email: 'you@example.com' },
};

const MCP: McpStatus = { enabled: false, running: false, port: 7457, url: 'http://127.0.0.1:7457/mcp', token: 'browser-preview-token', error: null, calls: 0, lastTool: null, lastAt: null };

const unsubscribe = () => () => undefined;
const refuse = async (): Promise<never> => {
  throw new Error(UNAVAILABLE);
};
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function emailCollectConfig(): ProjectConfig {
  return {
    version: 2,
    pages: [
      { id: 'home', name: 'Home', path: '/', file: 'src/App.jsx', viewType: 'design', icon: 'layout-template' },
      { id: 'contact', name: 'Contact', path: '/contact', file: 'src/pages/Contact.jsx', viewType: 'design', icon: 'layout-template' },
    ],
    direction: normalizeDirection({
      visualStyle: { minimalExpressive: 0.45, casualProfessional: 0.65 },
      font: null,
      iconPack: 'lucide',
      references: [],
      designSystem: null,
    }),
    defaultPageId: 'home',
  };
}

/** In-memory pages and direction, so the page navigator and direction UI can be exercised without disk access. */
function memoryConfig() {
  let config: ProjectConfig = emailCollectConfig();
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
    reset: () => void (config = emailCollectConfig()),
    setDirection: (direction: DirectionConfig) => {
      config = { ...config, direction: normalizeDirection(direction) };
      return state();
    },
    get: async () => state(),
    pages: {
      create: async (name: string, viewType?: import('../../shared/project-config').PageViewType) =>
        mutate((pages) => {
          const vt = viewType ?? 'design';
          const { name: n, path: p } = unique(pages, name.trim() || 'New page');
          const page =
            vt === 'design'
              ? { id: `p${Date.now().toString(36)}`, name: n, path: p, file: `src/pages/${componentName(name || 'New page')}.jsx`, viewType: 'design' as const, icon: 'layout-template' }
              : {
                  id: `p${Date.now().toString(36)}`,
                  name: n,
                  path: '',
                  file: vt === 'three' ? `src/scenes/${componentName(name || 'MainScene')}.jsx` : null,
                  viewType: vt,
                  icon:
                    vt === 'agent'
                      ? 'git-branch'
                      : vt === 'code'
                        ? 'file-code-2'
                        : vt === 'terminal'
                          ? 'terminal'
                          : vt === 'three'
                            ? 'box'
                            : 'layout-template',
                };
          pages.push(page);
          return page;
        }),
      duplicate: async (id: string) =>
        mutate((pages) => {
          const source = find(pages, id);
          const page = {
            id: `p${Date.now().toString(36)}`,
            ...unique(pages, `${source.name} copy`),
            file: source.file,
            viewType: source.viewType ?? 'design',
            icon: source.icon || 'layout-template',
          };
          if ((source.viewType ?? 'design') !== 'design') {
            page.path = '';
            page.file = null;
          }
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
          if ((page.viewType ?? 'design') === 'design' && page.path === '/') throw new Error('The home page can’t be deleted.');
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
  // Browser preview defaults to Claude and stays ready so the home chat demo works without Settings keys.
  let settings: AiSettings = {
    provider: 'anthropic',
    model: 'claude-sonnet',
    baseUrl: providerMeta('anthropic').defaultBaseUrl,
    thinkingEffort: 'medium',
  };
  const keys = new Set<AiProviderKind>(['anthropic', 'openai', 'gemini', 'xai']);
  let listeners: ((e: AiEvent) => void)[] = [];
  let pending: { id: string; turnId: string; resolve: (answer: string) => void } | null = null;
  let busy = false;
  let stop = false;
  const emit = (e: AiEvent) => listeners.forEach((l) => l(e));
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const previewModels = (provider: AiProviderKind): { id: string; label: string }[] => {
    switch (provider) {
      case 'anthropic':
        return [
          { id: 'claude-opus', label: 'Claude Opus' },
          { id: 'claude-sonnet', label: 'Claude Sonnet' },
          { id: 'claude-haiku', label: 'Claude Haiku' },
        ];
      case 'openai':
        return [
          { id: 'fable-5.1', label: 'Fable 5.1' },
          { id: 'gpt-6', label: 'GPT-6' },
          { id: 'gpt-4o', label: 'GPT-4o' },
          { id: 'clade', label: 'Clade' },
        ];
      case 'gemini':
        return [
          { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
          { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        ];
      case 'xai':
        return [
          { id: 'astra', label: 'Astra' },
          { id: 'grok-3', label: 'Grok 3' },
        ];
      case 'ollama':
        return [{ id: 'llama3.2', label: 'llama3.2' }];
      case 'lmstudio':
        return [{ id: 'local-model', label: 'Local model' }];
      default:
        return [{ id: 'custom-model', label: 'Custom model' }];
    }
  };
  const status = (): AiStatus => {
    const meta = providerMeta(settings.provider);
    const hasKey = keys.has(settings.provider) || !meta.needsKey;
    const reason = !settings.baseUrl && meta.id === 'custom' ? 'Enter the server URL.' : !settings.model ? 'Choose a model.' : null;
    return {
      settings,
      hasKey,
      // Browser preview never stores real OpenAI/xAI secrets, so cloud TTS isn’t available here.
      voiceKeys: { openai: false, xai: false },
      ready: !reason,
      reason,
      keyStorage: 'encrypted',
      busy,
    };
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
      await stream(turnId, 'Sure. I’ll shape a brief from that, then outline the first page. ');
      emit({ turnId, type: 'tool-start', callId: 'c1', tool: 'get_outline', summary: 'Reading your brief' });
      await wait(500);
      emit({ turnId, type: 'tool-end', callId: 'c1', ok: true, summary: 'Read your brief' });
      if (stop) return;
      emit({ turnId, type: 'tool-start', callId: 'c2', tool: 'get_selection', summary: 'Sketching a page outline' });
      await wait(450);
      emit({ turnId, type: 'tool-end', callId: 'c2', ok: true, summary: 'Sketched a page outline' });
      if (stop) return;
      const answer = await ask(turnId, {
        turnId,
        type: 'question',
        question: { id: 'q1', question: 'How many pricing plans should the section show?', options: ['Two plans', 'Three plans', 'Four plans'], allowText: true },
      });
      emit({ turnId, type: 'resolved', id: 'q1', answer });
      await stream(
        turnId,
        `Got it: ${answer.toLowerCase()}. Here’s a starter section shape you can take into project setup:\n\n\`\`\`tsx\n<section data-oc-name="Pricing">\n  <h2>Pricing</h2>\n  <p>${answer}</p>\n</section>\n\`\`\`\n\nContinue to project when you’re ready — this browser preview won’t write files.`,
      );
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
      if (!settings.model) {
        const first = previewModels(settings.provider)[0];
        if (first) settings = { ...settings, model: first.id };
      }
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
    listModels: async () => previewModels(settings.provider),
    test: async () => {
      if (!status().ready) throw new Error(status().reason ?? 'Not ready.');
      return 'OK (browser preview sample)';
    },
    send: async (request) => {
      // Editor queues follow-ups; never reject with a “still working” toast.
      if (busy) return `t${Date.now().toString(36)}`;
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
    voiceCapabilities: async () => {
      const meta = providerMeta(settings.provider);
      return {
        provider: settings.provider,
        label: meta.product,
        stt: 'browser' as const,
        tts: 'browser' as const,
        ttsBackend: 'browser' as const,
      };
    },
    voiceReply: async (messages: VoiceChatMessage[]) => {
      await wait(400);
      const last = [...messages].reverse().find((m) => m.role === 'user')?.text?.trim() || 'that';
      return `Got it — ${last.slice(0, 80)}. I’ll keep this short for voice; end the session anytime to drop it into chat.`;
    },
    voiceSpeak: async (text: string) => {
      const pref = settings.ttsBackend;
      if (pref === 'openai' || pref === 'xai') {
        throw new Error('Cloud voices need the OpenCanvas desktop app. Use “This device” in the browser preview.');
      }
      return { kind: 'browser' as const, text };
    },
    voiceTranscribe: async () => {
      await wait(300);
      return 'Browser preview sample transcript.';
    },
  };
}

function mockVariants() {
  let variants: VariantRecord[] = [];
  let listeners: ((v: VariantRecord[]) => void)[] = [];
  const notify = () => {
    for (const cb of listeners) cb(variants);
  };
  return {
    generate: async (request: { elementId: string; request: string; count?: number }) => {
      const count = clampVariantCount(request.count ?? VARIANT_COUNT.default);
      const setId = `set-${Date.now().toString(36)}`;
      const created: VariantRecord[] = [];
      for (let i = 0; i < count; i++) {
        created.push({
          id: `v-${Date.now().toString(36)}-${i}`,
          setId,
          source: { file: 'src/App.jsx', elementId: request.elementId, label: 'Element', fileHash: 'browser' },
          request: request.request,
          label: '',
          notes: '',
          createdAt: Date.now(),
          status: 'generating',
        });
      }
      variants = [...variants.filter((v) => v.status === 'ready' || v.status === 'failed' || v.status === 'stale'), ...created];
      notify();
      setTimeout(() => {
        variants = variants.map((v) =>
          v.setId === setId
            ? { ...v, status: 'ready' as const, label: `Alt ${String.fromCharCode(65 + created.indexOf(v))}`, notes: 'Browser preview sample' }
            : v,
        );
        notify();
      }, 600);
      return { setId, turnId: `t-${setId}`, variants: created };
    },
    cancel: async () => {
      variants = variants.map((v) => (v.status === 'generating' ? { ...v, status: 'failed' as const, error: 'Stopped' } : v));
      notify();
    },
    list: async () => variants.filter((v) => v.status !== 'discarded' && v.status !== 'applied'),
    apply: async (id: string) => {
      const v = variants.find((x) => x.id === id);
      if (!v || v.status !== 'ready') return { ok: false, error: UNAVAILABLE };
      variants = variants.map((x) => (x.id === id ? { ...x, status: 'applied' as const } : x.setId === v.setId ? { ...x, status: 'discarded' as const } : x));
      notify();
      return { ok: true, selectId: v.source.elementId };
    },
    discard: async (id: string) => {
      variants = variants.map((v) => (v.id === id ? { ...v, status: 'discarded' as const } : v));
      notify();
    },
    discardSet: async (setId: string) => {
      variants = variants.map((v) => (v.setId === setId ? { ...v, status: 'discarded' as const } : v));
      notify();
    },
    retry: async (id: string) => {
      const v = variants.find((x) => x.id === id);
      if (!v) throw new Error('Missing variant');
      const next = { ...v, status: 'generating' as const, error: undefined, label: '' };
      variants = variants.map((x) => (x.id === id ? next : x));
      notify();
      setTimeout(() => {
        variants = variants.map((x) => (x.id === id ? { ...x, status: 'ready' as const, label: 'Retry' } : x));
        notify();
      }, 400);
      return { turnId: `retry-${id}`, variant: next };
    },
    onChanged: (cb: (v: VariantRecord[]) => void) => {
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
    projectFiles: {
      list: async (_root, rel) => {
        const names = Object.keys(FILES).filter((f) => (rel ? f.startsWith(rel + '/') : true)).map((f) => (rel ? f.slice(rel.length + 1) : f));
        const seen = new Map<string, boolean>();
        for (const n of names) {
          const [head, ...rest] = n.split('/');
          seen.set(head, rest.length > 0 || seen.get(head) === true);
        }
        return [...seen].map(([name, dir]) => ({ name, dir })).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
      },
      read: async (_root, rel) => FILES[rel] ?? '',
    },
    skills: {
      list: async () => SKILLS.map(({ id, name, description }) => ({ id, name, description })),
      read: async (id) => SKILLS.find((k) => k.id === id)?.body ?? '',
      openFolder: async () => `${ROOT}\\..\\OpenCanvas Skills`,
    },
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
    workspace: {
      get: async (fallbackPageId) => normalizeWorkspace(null, fallbackPageId ?? null),
      set: async () => undefined,
    },
    pages: memory.pages,
    direction: {
      pickImage: async () => null,
      image: refuse,
      importDesignSystem: refuse,
    },
    designSystem: {
      get: async () => ({
        document: {
          version: 1 as const,
          revision: 0,
          meta: { name: 'Browser preview', updatedAt: Date.now() },
          tokens: [],
          themes: [
            { id: 'light', label: 'Light' },
            { id: 'dark', label: 'Dark', isDark: true },
          ],
          components: [],
          activeThemeId: 'light',
          history: [],
        },
        issues: [],
        cssFile: 'src/design-tokens.css',
      }),
      setActiveTheme: refuse,
      upsertToken: refuse,
      impact: async () => ({ tokenId: '', dependentTokens: [], components: [], styleUsages: 0, styleKeys: [], cssVar: '' }),
      historyRestore: refuse,
      export: async () => '{}\n',
      syncCss: async () => 'src/design-tokens.css',
    },
    inspiration: mockInspiration(),
    ai: mockAi(),
    variants: mockVariants(),
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
