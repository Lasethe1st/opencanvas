import type { AiChatItem, AiStatus } from '../../../shared/ai';
import type { BuildState } from '../../../shared/build-stages';
import type { FrameLayout } from '../../../shared/canvas';
import { defaultDirection, type DesignReference, type DirectionConfig, type PageConfig, type ProjectPagesState } from '../../../shared/project-config';
import type { FileNode, McpStatus } from '../../../shared/types';
import type { VariantRecord } from '../../../shared/variants';
import type { DockMode, FrameRuntime, Selection, TreeNode } from '../../lib/store';

const PAGES: PageConfig[] = [
  { id: 'home', name: 'Home', path: '/', file: 'src/App.jsx' },
  { id: 'work', name: 'Work', path: '/work', file: 'src/pages/Work.jsx' },
  { id: 'about', name: 'About the studio', path: '/about-the-studio', file: 'src/pages/AboutTheStudio.jsx' },
  { id: 'contact', name: 'Contact', path: '/contact', file: 'src/pages/Contact.jsx' },
];

const node = (id: string, tag: string, name: string, children: TreeNode[] = []): TreeNode => ({ id, uid: id, tag, name, children });

const TREE: TreeNode[] = [
  node('src/App.jsx:3:4', 'main', 'Page', [
    node('src/App.jsx:4:6', 'header', 'Header', [node('src/App.jsx:5:8', 'nav', 'Navigation')]),
    node('src/App.jsx:9:6', 'section', 'Hero', [node('src/App.jsx:10:8', 'h1', 'Headline'), node('src/App.jsx:11:8', 'a', 'Start a project')]),
    node('src/App.jsx:14:6', 'section', 'Selected work', [node('src/App.jsx:15:8', 'h2', 'Heading')]),
    node('src/App.jsx:20:6', 'footer', 'Footer'),
  ]),
];

const file = (path: string): FileNode => ({ name: path.split('/').pop()!, path, type: 'file' });
const FILE_TREE: FileNode = {
  name: 'northbound',
  path: '',
  type: 'dir',
  children: [
    file('index.html'),
    file('package.json'),
    { name: 'src', path: 'src', type: 'dir', children: [file('src/App.jsx'), file('src/open-canvas.css'), file('src/routes.jsx'), file('src/pages/Work.jsx'), file('src/pages/AboutTheStudio.jsx'), file('src/pages/Contact.jsx')] },
  ],
};

const reference = (r: Partial<DesignReference> & Pick<DesignReference, 'id' | 'title'>): DesignReference => ({
  url: null,
  imagePath: null,
  source: 'link',
  role: 'overall',
  note: '',
  primary: false,
  addedAt: Date.now(),
  tags: [],
  colors: [],
  ...r,
});

const RICH_DIRECTION: DirectionConfig = {
  ...defaultDirection(),
  visualStyle: { minimalExpressive: 0.78, casualProfessional: 0.35 },
  font: 'Instrument Serif',
  iconPack: 'phosphor',
  references: [
    reference({ id: 'r1', title: 'Editorial grid with oversized serif', url: 'https://savee.com/i/editorial-grid', source: 'savee', role: 'typography', note: 'Big serif headlines, tight leading', primary: true }),
    reference({ id: 'r2', title: 'Warm off-white palette', url: 'https://www.are.na/block/warm-palette', role: 'colour' }),
    reference({ id: 'r3', title: 'Case study layout with long captions that wrap onto a second line', url: 'https://example.com/case-study', role: 'layout', note: 'Image first, then a short story' }),
  ],
  designSystem: {
    file: 'tokens.css',
    format: 'css',
    tokens: { '--brand': '#ff4d2e', '--ink': '#111111', '--paper': '#f4f1ea', '--accent': '#2e5bff', '--radius': '6px', '--space-4': '16px' },
    importedAt: Date.now(),
  },
};

const pagesState = (over: Partial<ProjectPagesState> = {}, direction = defaultDirection(), pages = PAGES): ProjectPagesState => ({
  config: { version: 1, pages, direction },
  routing: pages.length > 1 ? 'managed' : 'single',
  pages,
  canEditPages: true,
  pagesNote: null,
  ...over,
});

const MCP_ON: McpStatus = { enabled: true, running: true, port: 7801, url: 'http://127.0.0.1:7801/mcp', token: '', error: null, calls: 4, lastTool: 'set_styles', lastAt: Date.now() };

const aiStatus = (over: Partial<AiStatus> = {}): AiStatus => ({
  settings: { provider: 'anthropic', model: 'claude-sonnet-4-5', baseUrl: 'https://api.anthropic.com' },
  hasKey: true,
  ready: true,
  reason: null,
  keyStorage: 'encrypted',
  busy: false,
  ...over,
});

const NOT_SET_UP = aiStatus({ hasKey: false, ready: false, reason: 'Add your Anthropic API key in Settings › AI.' });

const ASK: AiChatItem = { kind: 'user', id: 't1:user', text: 'Add a pricing section with three plans under the hero' };
const PLANNING: AiChatItem = { kind: 'assistant', id: 't1:a1', text: 'I’ll add a pricing section below the hero with three plan cards, using your serif for the plan names.' };
const OUTLINE: AiChatItem = { kind: 'tool', id: 't1:c1', tool: 'get_outline', summary: 'Reading the page structure', state: 'done' };

export interface StateFixture {
  label: string;
  mode: DockMode | null;
  draft?: string;
  config: ProjectPagesState | null;
  mcp?: McpStatus | null;
  /** Typed into the search box after the panel opens. */
  query?: string;
  ai?: { status: AiStatus; chat?: AiChatItem[]; turnId?: string | null };
  selection?: Selection | null;
  variants?: VariantRecord[];
  build?: BuildState;
}

const SAMPLE_VARIANTS: VariantRecord[] = [
  {
    id: 'v-a',
    setId: 'set-1',
    source: { file: 'src/App.jsx', elementId: 'src/App.jsx:9:6', label: 'Hero', fileHash: 'x' },
    request: 'Bolder headline',
    label: 'Editorial stack',
    notes: 'Larger type, shorter subline',
    createdAt: Date.now(),
    status: 'ready',
  },
  {
    id: 'v-b',
    setId: 'set-1',
    source: { file: 'src/App.jsx', elementId: 'src/App.jsx:9:6', label: 'Hero', fileHash: 'x' },
    request: 'Bolder headline',
    label: 'Split layout',
    notes: 'Copy left, media right',
    createdAt: Date.now(),
    status: 'ready',
  },
];

export const FRAMES: FrameLayout[] = [{ id: 'f-desktop', name: 'Desktop', x: 0, y: 0, width: 1440, height: 900, preset: 'desktop', fitPage: false, pageId: 'work' }];
export const RUNTIME: Record<string, FrameRuntime> = { 'f-desktop': { ready: true, contentHeight: 2400, tree: TREE } };
export { FILE_TREE };

export const GROUPS: { heading: string; states: Record<string, StateFixture> }[] = [
  {
    heading: 'Bar',
    states: {
      closed: { label: 'Closed', mode: null, config: pagesState() },
      'closed-draft': { label: 'Closed with a draft', mode: null, draft: 'Add a pricing section with three plans, a comparison table and an FAQ underneath', config: pagesState() },
    },
  },
  {
    heading: 'Ask AI',
    states: {
      'ai-empty': { label: 'Ready', mode: 'input', config: pagesState(), ai: { status: aiStatus() } },
      'ai-streaming': {
        label: 'Streaming',
        mode: 'input',
        config: pagesState(),
        ai: { status: aiStatus(), turnId: 't1', chat: [ASK, PLANNING, OUTLINE, { kind: 'tool', id: 't1:c2', tool: 'insert_jsx', summary: 'Inserting new elements', state: 'running' }] },
      },
      'ai-thinking': { label: 'Thinking', mode: 'input', config: pagesState(), ai: { status: aiStatus(), turnId: 't1', chat: [ASK, OUTLINE] } },
      'ai-question': {
        label: 'Question',
        mode: 'input',
        config: pagesState(),
        ai: {
          status: aiStatus(),
          turnId: 't1',
          chat: [ASK, OUTLINE, { kind: 'question', id: 'q1', question: { id: 'q1', question: 'Should the plans be billed monthly, yearly, or both with a toggle?', options: ['Monthly', 'Yearly', 'Both, with a toggle'], allowText: true }, answer: null }],
        },
      },
      'ai-approval': {
        label: 'Permission',
        mode: 'input',
        config: pagesState(),
        ai: {
          status: aiStatus(),
          turnId: 't1',
          chat: [
            { kind: 'user', id: 't1:user', text: 'Looks good, save a version of this' },
            { kind: 'approval', id: 'p1', approval: { id: 'p1', tool: 'git_commit', summary: 'Commit every change in the project with the message “Add pricing section”.' }, answer: null },
          ],
        },
      },
      'ai-done': {
        label: 'Finished reply',
        mode: 'input',
        config: pagesState(),
        ai: {
          status: aiStatus(),
          chat: [
            ASK,
            PLANNING,
            OUTLINE,
            { kind: 'question', id: 'q1', question: { id: 'q1', question: 'Billing period?', options: ['Monthly', 'Yearly'], allowText: true }, answer: 'Yearly' },
            { kind: 'tool', id: 't1:c2', tool: 'insert_jsx', summary: 'Inserting new elements', state: 'done', elementId: 'src/App.jsx:14:6' },
            { kind: 'tool', id: 't1:c3', tool: 'set_styles', summary: 'Styling 3 elements', state: 'done', elementId: 'src/App.jsx:15:8' },
            { kind: 'tool', id: 't1:c4', tool: 'set_text', summary: 'That element no longer exists. Call get_outline for fresh ids.', state: 'failed' },
            { kind: 'assistant', id: 't1:a2', text: 'Added a pricing section with Starter, Studio and Agency plans billed yearly. Undo removes the whole section in one step.' },
          ],
        },
      },
      'ai-error': {
        label: 'Error',
        mode: 'input',
        config: pagesState(),
        ai: { status: aiStatus(), chat: [ASK, { kind: 'error', id: 't1:e1', text: 'Anthropic is rate limiting requests; try again in 20 s.' }] },
      },
      'ai-local': {
        label: 'Local model',
        mode: 'input',
        config: pagesState(),
        ai: { status: aiStatus({ settings: { provider: 'ollama', model: 'qwen2.5-coder:14b', baseUrl: 'http://localhost:11434/v1' }, hasKey: false }) },
      },
    },
  },
  {
    heading: 'Ask AI: not set up',
    states: {
      'input-empty': { label: 'Empty', mode: 'input', config: pagesState(), ai: { status: NOT_SET_UP } },
      'input-draft': { label: 'With a draft', mode: 'input', draft: 'Make the hero feel more editorial: oversized serif headline, smaller supporting text', config: pagesState(), ai: { status: NOT_SET_UP } },
      'input-mcp': { label: 'Agent connected', mode: 'input', draft: 'Tighten the spacing in the footer', config: pagesState(), mcp: MCP_ON, ai: { status: NOT_SET_UP } },
      'ai-key-removed': {
        label: 'Key removed mid-chat',
        mode: 'input',
        config: pagesState(),
        ai: { status: NOT_SET_UP, chat: [ASK, PLANNING] },
      },
    },
  },
  {
    heading: 'Variants',
    states: {
      'variants-empty': { label: 'No selection', mode: 'variants', config: pagesState(), selection: null },
      'variants-ready': {
        label: 'Element selected',
        mode: 'variants',
        config: pagesState(),
        selection: { id: 'src/App.jsx:9:6', uid: 'u1', tag: 'section', name: 'Hero', rect: { x: 0, y: 0, width: 100, height: 40 }, parentId: null, computed: {} },
        ai: { status: aiStatus() },
      },
      'variants-cards': {
        label: 'Ready cards',
        mode: 'variants',
        config: pagesState(),
        selection: { id: 'src/App.jsx:9:6', uid: 'u1', tag: 'section', name: 'Hero', rect: { x: 0, y: 0, width: 100, height: 40 }, parentId: null, computed: {} },
        variants: SAMPLE_VARIANTS,
        ai: { status: aiStatus() },
      },
      'variants-no-ai': {
        label: 'AI not set up',
        mode: 'variants',
        config: pagesState(),
        selection: { id: 'src/App.jsx:9:6', uid: 'u1', tag: 'section', name: 'Hero', rect: { x: 0, y: 0, width: 100, height: 40 }, parentId: null, computed: {} },
        variants: SAMPLE_VARIANTS,
        ai: { status: NOT_SET_UP },
      },
      'build-grid': {
        label: 'Build: Grid',
        mode: null,
        config: pagesState(),
        build: { phase: 'grid', turnId: 't1', callId: 'c1', tool: 'insert_jsx', elementId: 'src/App.jsx:14:6', explained: false, frameId: 'f-desktop' },
      },
      'build-layout': {
        label: 'Build: Layout',
        mode: null,
        config: pagesState(),
        build: { phase: 'layout', turnId: 't1', callId: 'c1', tool: 'insert_jsx', elementId: 'src/App.jsx:14:6', explained: true, frameId: 'f-desktop' },
      },
    },
  },
  {
    heading: 'Search',
    states: {
      'search-empty': { label: 'Empty', mode: 'search', config: pagesState() },
      'search-results': { label: 'Results', mode: 'search', config: pagesState(), query: 'wo' },
      'search-none': { label: 'No matches', mode: 'search', config: pagesState(), query: 'zzqx' },
    },
  },
  {
    heading: 'Direction',
    states: {
      'direction-default': { label: 'Defaults', mode: 'direction', config: pagesState() },
      'direction-rich': { label: 'Set up', mode: 'direction', config: pagesState({}, RICH_DIRECTION) },
      'direction-none': { label: 'No project', mode: 'direction', config: null },
    },
  },
];

export const STATE_KEYS = GROUPS.flatMap((g) => Object.keys(g.states));
export const STATES: Record<string, StateFixture> = Object.assign({}, ...GROUPS.map((g) => g.states));
