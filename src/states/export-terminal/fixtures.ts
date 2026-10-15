import type { TerminalSession } from '../../../shared/terminal';
import type { BuildCheckResult, ExportReport, ExportResult, ProjectInfo } from '../../../shared/types';

export const PROJECT: ProjectInfo = {
  root: 'C:\\Users\\you\\OpenCanvas\\northbound',
  name: 'northbound',
  framework: 'vite-react',
  packageManager: 'npm',
  hasNodeModules: true,
  missingDependencies: [],
  managedPreview: false,
  entryFile: 'src/main.jsx',
  stylesFile: 'src/open-canvas.css',
  canPreview: true,
  editable: true,
  editableRoots: ['src'],
  warnings: [],
  breakpoints: { tablet: 1024, mobile: 640, detected: false },
};

const ESC = '\x1b';
const prompt = `${ESC}[2mPS${ESC}[0m C:\\Users\\you\\OpenCanvas\\northbound> `;
const SHELL_OUTPUT = [
  `${prompt}npm run dev\r\n`,
  '\r\n> northbound@0.1.0 dev\r\n> vite\r\n\r\n',
  `  ${ESC}[32mVITE v7.1.4${ESC}[0m  ready in ${ESC}[1m412${ESC}[0m ms\r\n\r\n`,
  `  ${ESC}[32m➜${ESC}[0m  ${ESC}[1mLocal${ESC}[0m:   ${ESC}[36mhttp://localhost:5174/${ESC}[0m\r\n`,
  `  ${ESC}[2m➜  Network: use --host to expose${ESC}[0m\r\n`,
  `${ESC}[2m10:42:18${ESC}[0m ${ESC}[36m[vite]${ESC}[0m ${ESC}[32mhmr update${ESC}[0m ${ESC}[2m/src/App.jsx${ESC}[0m\r\n`,
].join('');
const AI_OUTPUT = [
  `${ESC}[2m# Asked by the AI assistant, approved by you${ESC}[0m\r\n`,
  `${prompt}npm run lint\r\n`,
  '\r\n> northbound@0.1.0 lint\r\n> eslint .\r\n\r\n',
  `C:\\Users\\you\\OpenCanvas\\northbound\\src\\App.jsx\r\n  14:9  ${ESC}[31merror${ESC}[0m  'hero' is assigned a value but never used  ${ESC}[2mno-unused-vars${ESC}[0m\r\n\r\n`,
  `${ESC}[31m✖ 1 problem (1 error, 0 warnings)${ESC}[0m\r\n`,
].join('');

const session = (s: Partial<TerminalSession> & Pick<TerminalSession, 'id' | 'title'>): TerminalSession => ({
  kind: 'user',
  pid: 4812,
  cwd: PROJECT.root,
  shell: 'powershell.exe',
  status: 'running',
  exitCode: null,
  ...s,
});

export interface TerminalState {
  sessions: { session: TerminalSession; output: string }[];
  active?: string;
  unavailable?: string;
}

export interface ExportState {
  /** null keeps the report loading. */
  report: ExportReport | null;
  /** Clicks "Check it builds"; null keeps it running. */
  check?: BuildCheckResult | null;
  log?: string;
  /** Clicks "Download project ZIP". */
  exported?: ExportResult;
  dirty?: boolean;
}

export type StateDef = { label: string; terminal: TerminalState; export?: never } | { label: string; export: ExportState; terminal?: never };

const CLEAN: ExportReport = { issues: [], envVars: [], envExample: null, checkedFiles: 14 };
const PROBLEMS: ExportReport = {
  checkedFiles: 23,
  envVars: ['VITE_FORM_ENDPOINT', 'VITE_MAPS_KEY'],
  envExample: '# Variables the code reads. Copy to .env and fill in real values.\nVITE_FORM_ENDPOINT=\nVITE_MAPS_KEY=\n',
  issues: [
    { severity: 'error', title: 'Import "./components/Testimonials" can’t be found', file: 'src/App.jsx:7', fix: 'Check the path and file name (including capital letters, which matter on Linux hosts), or restore the missing file.' },
    { severity: 'error', title: '"framer-motion" is imported but not in package.json', file: 'src/pages/Work.jsx:2', fix: 'Add it with npm install framer-motion, so a fresh install includes it.' },
    { severity: 'warning', title: '/images/hero-studio-wide.jpg isn’t in public/', file: 'src/components/Hero.jsx:18', fix: 'Files under public/ are served from the site root. Add public/images/hero-studio-wide.jpg, or fix the path.' },
    { severity: 'warning', title: 'No lockfile', file: 'package-lock.json', fix: 'Run npm install once and keep package-lock.json, so the exported project installs the same versions you tested.' },
    { severity: 'info', title: '.env.local is left out', fix: 'Local env files can hold secrets, so the export only includes .env.example.' },
    { severity: 'info', title: 'A .env.example will be added', file: '.env.example', fix: 'The code reads VITE_FORM_ENDPOINT, VITE_MAPS_KEY. The export lists the names only, with no values.' },
  ],
};
const WARNINGS: ExportReport = { ...PROBLEMS, issues: PROBLEMS.issues.filter((i) => i.severity !== 'error') };

const LOG = [
  'Copying the export into a clean folder…\n',
  '\n> npm install\n',
  'added 214 packages, and audited 215 packages in 18s\n',
  '\n48 packages are looking for funding\n  run `npm fund` for details\n',
  '\n> npm run build\n',
  '\n> northbound@0.1.0 build\n> vite build\n\n',
  'vite v7.1.4 building for production...\n',
  'transforming (128) src/components/Hero.jsx\n',
].join('');
const FAILED_LOG = `${LOG}✓ 131 modules transformed.\nx Build failed in 1.84s\nerror during build:\n[vite]: Rollup failed to resolve import "framer-motion" from "src/pages/Work.jsx".\n`;

export const GROUPS: { heading: string; states: Record<string, StateDef> }[] = [
  {
    heading: 'Terminal',
    states: {
      'terminal-running': { label: 'Dev server running', terminal: { sessions: [{ session: session({ id: 't1', title: 'Terminal 1' }), output: SHELL_OUTPUT }] } },
      'terminal-tabs': {
        label: 'AI tab exited with an error',
        terminal: {
          active: 't2',
          sessions: [
            { session: session({ id: 't1', title: 'Terminal 1' }), output: SHELL_OUTPUT },
            { session: session({ id: 't2', title: 'npm run lint', kind: 'ai', status: 'exited', exitCode: 1, pid: 5120 }), output: AI_OUTPUT },
            { session: session({ id: 't3', title: 'Storybook on port 6006 with a long name', pid: 6033 }), output: `${prompt}` },
          ],
        },
      },
      'terminal-empty': { label: 'No terminals', terminal: { sessions: [] } },
      'terminal-unavailable': { label: 'Unavailable', terminal: { sessions: [], unavailable: 'The terminal couldn’t start: node-pty failed to load. Reinstall OpenCanvas to restore it.' } },
    },
  },
  {
    heading: 'Export report',
    states: {
      'export-loading': { label: 'Checking', export: { report: null } },
      'export-clean': { label: 'Nothing to fix', export: { report: CLEAN } },
      'export-warnings': { label: 'Warnings only', export: { report: WARNINGS } },
      'export-problems': { label: 'Problems found', export: { report: PROBLEMS, dirty: true } },
    },
  },
  {
    heading: 'Build check',
    states: {
      'check-running': { label: 'Running', export: { report: CLEAN, check: null, log: LOG } },
      'check-passed': { label: 'Passed', export: { report: CLEAN, check: { state: 'passed', message: 'The exported project installs and builds from scratch.', steps: [] }, log: `${LOG}✓ built in 2.31s\n` } },
      'check-failed': { label: 'Build failed', export: { report: PROBLEMS, check: { state: 'failed', step: 'build', message: 'npm run build failed with exit code 1. The log shows why.', steps: [] }, log: FAILED_LOG } },
      'check-unavailable': {
        label: 'Offline',
        export: { report: CLEAN, check: { state: 'unavailable', step: 'install', message: 'Couldn’t check: the package registry wasn’t reachable. This doesn’t mean the project is broken.', steps: [] }, log: 'Copying the export into a clean folder…\n\n> npm install\nnpm error code ENOTFOUND\nnpm error network request to https://registry.npmjs.org/react failed\n' },
      },
    },
  },
  {
    heading: 'Exported',
    states: {
      'exported-env': {
        label: 'With .env.example',
        export: {
          report: WARNINGS,
          exported: { ok: true, path: 'C:\\Users\\you\\Downloads\\northbound.zip', fileCount: 41, envExampleAdded: true, instructions: ['cd northbound', 'npm install', 'cp .env.example .env   # then set VITE_FORM_ENDPOINT, VITE_MAPS_KEY', 'npm run dev', 'npm run build'] },
        },
      },
    },
  },
];

export const STATES: Record<string, StateDef> = Object.assign({}, ...GROUPS.map((g) => g.states));
export const STATE_KEYS = Object.keys(STATES);
