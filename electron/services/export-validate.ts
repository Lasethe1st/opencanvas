/** Checks an export before it leaves: structure, imports, assets, env vars and OpenCanvas leftovers, plus an optional clean build. */
import { builtinModules } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BuildCheckResult, BuildCheckStep, ExportIssue, ExportReport, ProjectInfo } from '../../shared/types';
import { buildProjectZip } from './exporter';
import { runCommand } from './processes';
import { IGNORED_DIRS, toRel } from './project';
import { extractZip } from './zip-import';

const CODE_RE = /\.(m?[jt]sx?|cjs)$/;
const STYLE_RE = /\.(css|scss)$/;
const RESOLVE_EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.scss', '.svg'];
const ASSET_RE = /\.(png|jpe?g|gif|webp|avif|svg|ico|mp4|webm|woff2?|ttf|otf|pdf)$/i;
const BUILTIN_ENV = new Set(['NODE_ENV', 'MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL', 'NEXT_RUNTIME']);
const BUILTINS = new Set(builtinModules);
const LOCKFILES: Record<ProjectInfo['packageManager'], string[]> = {
  npm: ['package-lock.json'],
  pnpm: ['pnpm-lock.yaml'],
  yarn: ['yarn.lock'],
  bun: ['bun.lock', 'bun.lockb'],
};
const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/, 'an API secret key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'a GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
];

interface SourceFile {
  rel: string;
  code: string;
}

function collect(root: string): { files: SourceFile[]; envFiles: string[] } {
  const files: SourceFile[] = [];
  const envFiles: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > 12) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.opencanvas') visit(full, depth + 1);
        continue;
      }
      if (/^\.env(?!\.example$)/.test(entry.name)) envFiles.push(toRel(root, full));
      if (!(CODE_RE.test(entry.name) || STYLE_RE.test(entry.name) || /\.html?$/.test(entry.name))) continue;
      if (fs.statSync(full).size > 400_000) continue;
      files.push({ rel: toRel(root, full), code: fs.readFileSync(full, 'utf8') });
    }
  };
  visit(root, 0);
  return { files, envFiles };
}

const lineOf = (code: string, index: number) => code.slice(0, index).split('\n').length;

/** Import specifiers in a JS/TS file, with their line numbers. Comments are blanked first so examples in them don't count. */
export function importsOf(code: string): { spec: string; line: number }[] {
  const clean = code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
  const out: { spec: string; line: number }[] = [];
  const re = /(?:\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?|\bexport\s*[\w*{}\s,$]+\s*from\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g;
  for (const m of clean.matchAll(re)) out.push({ spec: m[2], line: lineOf(clean, m.index!) });
  return out;
}

export function packageOf(spec: string): string {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function readJson(file: string): any {
  try {
    // tsconfig allows comments and trailing commas
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, '$1').replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return null;
  }
}

/** Path aliases from tsconfig/jsconfig, e.g. "@/" -> "src/". */
function aliasesOf(root: string): [string, string][] {
  const config = readJson(path.join(root, 'tsconfig.json')) ?? readJson(path.join(root, 'jsconfig.json'));
  const opts = config?.compilerOptions ?? {};
  const base = typeof opts.baseUrl === 'string' ? opts.baseUrl : '.';
  return Object.entries((opts.paths ?? {}) as Record<string, string[]>)
    .filter(([, targets]) => Array.isArray(targets) && typeof targets[0] === 'string')
    .map(([key, targets]) => [key.replace(/\*$/, ''), path.posix.join(base, targets[0].replace(/\*$/, ''))] as [string, string]);
}

function resolves(root: string, relPath: string): boolean {
  const clean = relPath.split('?')[0];
  for (const ext of RESOLVE_EXTS) {
    const p = path.join(root, clean + ext);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return true;
  }
  return ['ts', 'tsx', 'js', 'jsx'].some((ext) => fs.existsSync(path.join(root, clean, `index.${ext}`)));
}

/** The .env.example the export should carry: the project's own lines plus any missing names, never values. */
export function envExampleFor(existing: string | null, names: string[]): string | null {
  const have = new Set((existing ?? '').split(/\r?\n/).map((l) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l)?.[1]).filter(Boolean) as string[]);
  const missing = names.filter((n) => !have.has(n));
  if (!missing.length) return null;
  const header = existing?.trim() ? `${existing.trimEnd()}\n\n# Added by OpenCanvas: variables the code reads. Fill in real values in .env.\n` : '# Variables the code reads. Copy to .env and fill in real values.\n';
  return `${header}${missing.map((n) => `${n}=`).join('\n')}\n`;
}

export function validateExport(info: ProjectInfo): ExportReport {
  const root = info.root;
  const issues: ExportIssue[] = [];
  const pkg = readJson(path.join(root, 'package.json')) ?? {};
  const deps = new Set(Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}), ...(pkg.peerDependencies ?? {}) }));
  const { files, envFiles } = collect(root);
  const aliases = aliasesOf(root);

  // Required files
  if (info.framework === 'vite-react') {
    if (!fs.existsSync(path.join(root, 'index.html'))) issues.push({ severity: 'error', title: 'index.html is missing', file: 'index.html', fix: 'Vite needs index.html at the project root with a module script pointing at your entry file.' });
    else if (!info.entryFile) issues.push({ severity: 'error', title: 'The entry script in index.html can’t be found', file: 'index.html', fix: 'Point the <script type="module" src="…"> in index.html at your main file, e.g. /src/main.jsx.' });
  }
  if (info.framework === 'next' && !['app', 'pages', 'src/app', 'src/pages'].some((d) => fs.existsSync(path.join(root, d)))) {
    issues.push({ severity: 'error', title: 'No app or pages folder', fix: 'Next.js needs an app/ or pages/ folder with at least one page.' });
  }
  if (!LOCKFILES[info.packageManager].some((f) => fs.existsSync(path.join(root, f)))) {
    issues.push({ severity: 'warning', title: 'No lockfile', file: LOCKFILES[info.packageManager][0], fix: `Run ${info.packageManager} install once and keep ${LOCKFILES[info.packageManager][0]}, so the exported project installs the same versions you tested.` });
  }
  if (!pkg.scripts?.build) issues.push({ severity: 'warning', title: 'No build script', file: 'package.json', fix: 'Add a "build" script to package.json so hosts like Vercel know how to build the site.' });

  const envNames = new Set<string>();
  const seenMissing = new Set<string>();
  for (const f of files) {
    const isCode = CODE_RE.test(f.rel);
    const dir = path.posix.dirname(f.rel);

    if (isCode) {
      for (const { spec, line } of importsOf(f.code)) {
        if (spec.startsWith('.')) {
          if (!resolves(root, path.posix.join(dir, spec))) issues.push({ severity: 'error', title: `Import "${spec}" can’t be found`, file: `${f.rel}:${line}`, fix: 'Check the path and file name (including capital letters, which matter on Linux hosts), or restore the missing file.' });
          continue;
        }
        const alias = aliases.find(([prefix]) => prefix && spec.startsWith(prefix));
        if (alias) {
          if (!resolves(root, alias[1] + spec.slice(alias[0].length))) issues.push({ severity: 'error', title: `Import "${spec}" can’t be found`, file: `${f.rel}:${line}`, fix: `"${alias[0]}" maps to ${alias[1]} in tsconfig. Check the path, or restore the missing file.` });
          continue;
        }
        if (spec.startsWith('/') || spec.startsWith('node:') || spec.startsWith('virtual:') || /^[@~#]\//.test(spec) || spec.startsWith('~')) continue;
        const name = packageOf(spec);
        if (BUILTINS.has(name) || deps.has(name) || seenMissing.has(name)) continue;
        seenMissing.add(name);
        issues.push({ severity: 'error', title: `"${name}" is imported but not in package.json`, file: `${f.rel}:${line}`, fix: `Add it with ${info.packageManager} ${info.packageManager === 'npm' ? 'install' : 'add'} ${name}, so a fresh install includes it.` });
      }
      for (const m of f.code.matchAll(/\bprocess\.env\.([A-Z_][A-Z0-9_]*)|\bimport\.meta\.env\.([A-Z_][A-Z0-9_]*)/g)) {
        const name = m[1] ?? m[2];
        if (!BUILTIN_ENV.has(name)) envNames.add(name);
      }
    }

    // Assets
    const assetRefs = STYLE_RE.test(f.rel)
      ? [...f.code.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)].map((m) => ({ ref: m[2], index: m.index! }))
      : [...f.code.matchAll(/\b(?:src|href|poster)=\s*["'](\/[^"'#?]+)["']/g)].map((m) => ({ ref: m[1], index: m.index! }));
    for (const { ref, index } of assetRefs) {
      if (/^(data:|https?:|\/\/|#|blob:)/.test(ref) || ref.startsWith('/@') || ref.includes('${')) continue;
      if (ref.startsWith('/')) {
        if (!ASSET_RE.test(ref)) continue;
        if (!fs.existsSync(path.join(root, 'public', ref)) && !fs.existsSync(path.join(root, ref.slice(1)))) {
          issues.push({ severity: 'warning', title: `${ref} isn’t in public/`, file: `${f.rel}:${lineOf(f.code, index)}`, fix: `Files under public/ are served from the site root. Add public${ref}, or fix the path.` });
        }
      } else if (STYLE_RE.test(f.rel) && !resolves(root, path.posix.join(dir, ref))) {
        issues.push({ severity: 'error', title: `${ref} referenced in CSS can’t be found`, file: `${f.rel}:${lineOf(f.code, index)}`, fix: 'The build fails on missing CSS assets. Fix the path or add the file.' });
      }
    }

    // OpenCanvas runtime must never ship
    const leak = /data-oc-id=|\/@open-canvas\/|open-canvas\/bridge/.exec(f.code);
    if (leak) issues.push({ severity: 'error', title: 'OpenCanvas preview code found in the source', file: `${f.rel}:${lineOf(f.code, leak.index)}`, fix: 'Remove the data-oc-id attributes or bridge import. They only belong in the live preview and are added automatically there.' });

    for (const [re, what] of SECRET_PATTERNS) {
      const m = re.exec(f.code);
      if (m) issues.push({ severity: 'warning', title: `Looks like ${what} is written in the code`, file: `${f.rel}:${lineOf(f.code, m.index)}`, fix: 'Move it to an environment variable and rotate the key, since anyone with the export can read it.' });
    }
  }

  if (envFiles.length) {
    issues.push({ severity: 'info', title: `${envFiles.join(', ')} ${envFiles.length === 1 ? 'is' : 'are'} left out`, fix: 'Local env files can hold secrets, so the export only includes .env.example.' });
  }
  const envVars = [...envNames].sort();
  const existingExample = fs.existsSync(path.join(root, '.env.example')) ? fs.readFileSync(path.join(root, '.env.example'), 'utf8') : null;
  const envExample = envExampleFor(existingExample, envVars);
  if (envExample) {
    issues.push({ severity: 'info', title: existingExample === null ? 'A .env.example will be added' : '.env.example will be completed', file: '.env.example', fix: `The code reads ${envVars.join(', ')}. The export lists the names only, with no values.` });
  }
  const order = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return { issues, envVars, envExample, checkedFiles: files.length };
}

/* ---------- Build check ---------- */

const NETWORK_RE = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|getaddrinfo|network|UNABLE_TO_VERIFY|SELF_SIGNED|unable to get local issuer|request to \S+ failed/i;
export const BUILD_CHECK_TIMEOUT = 10 * 60_000;

export async function runBuildCheck(info: ProjectInfo, opts: { onLog: (text: string) => void; signal: AbortSignal; timeoutMs?: number }): Promise<BuildCheckResult> {
  const deadline = Date.now() + (opts.timeoutMs ?? BUILD_CHECK_TIMEOUT);
  const steps: BuildCheckResult['steps'] = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opencanvas-check-'));
  try {
    opts.onLog('Copying the export into a clean folder…\n');
    const zip = await buildProjectZip(info);
    const { root } = await extractZip(zip.buffer, () => path.join(tmp, 'project'));
    const pm = info.packageManager;
    const run = pm === 'npm' ? 'npm run' : pm;
    const scripts = readJson(path.join(root, 'package.json'))?.scripts ?? {};
    const plan: [BuildCheckStep, string | null][] = [
      ['install', `${pm} install`],
      ['typecheck', scripts.typecheck ? `${run} typecheck` : null],
      ['build', scripts.build ? `${run} build` : null],
    ];
    // Electron drops NODE_OPTIONS, so opt the package manager into the OS certificate store explicitly.
    const env = { ...process.env, NODE_USE_SYSTEM_CA: '1', CI: '1', FORCE_COLOR: '0' };
    for (const [step, command] of plan) {
      if (!command) {
        steps.push({ step, ok: true, skipped: true });
        continue;
      }
      opts.onLog(`\n> ${command}\n`);
      const res = await runCommand(command, { cwd: root, env, onLog: opts.onLog, signal: opts.signal, timeoutMs: Math.max(1000, deadline - Date.now()) });
      if (res.cancelled) return { state: 'cancelled', step, message: 'Check cancelled.', steps };
      if (res.timedOut) return { state: 'unavailable', step, message: 'Couldn’t check: it took longer than 10 minutes. Try again on a faster connection.', steps };
      if (res.code !== 0) {
        steps.push({ step, ok: false });
        if (step === 'install' && (res.error || NETWORK_RE.test(res.output))) {
          return { state: 'unavailable', step, message: 'Couldn’t check: the package registry wasn’t reachable. This doesn’t mean the project is broken.', steps };
        }
        return { state: 'failed', step, message: res.error ? `${command} couldn’t run: ${res.error}` : `${command} failed with exit code ${res.code}. The log shows why.`, steps };
      }
      steps.push({ step, ok: true });
    }
    return { state: 'passed', message: scripts.build ? 'The exported project installs and builds from scratch.' : 'The exported project installs. It has no build script to run.', steps };
  } catch (err) {
    return { state: 'failed', message: (err as Error).message, steps };
  } finally {
    fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }, () => undefined);
  }
}
